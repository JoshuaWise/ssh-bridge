'use strict';
const { randomBytes } = require('node:crypto');
const { EventEmitter } = require('node:events');
const FrameParser = require('../lib/frame-parser');
const decode = require('./decode');
const pool = require('./pool');

/*
	Each client that connects to the daemon/server is handled by this module.
	The logic here is basically a state machine that handles events coming from
	the client as well as the SSH pool layer.
 */

const INITIAL = Symbol();
const CONNECTING = Symbol();
const READY = Symbol();
const EXECUTING = Symbol();
const ERRORED = Symbol();

module.exports = (signal, socket) => {
	const emitter = new EventEmitter();
	const frameParser = new FrameParser();
	let state = INITIAL;
	let ssh = null;

	const onAbort = () => {
		if (state !== EXECUTING) {
			state = ERRORED;
			socket.destroySoon();
		}
	};

	signal.addEventListener('abort', onAbort);
	socket.setNoDelay(true);
	socket.setKeepAlive(true, 1000);
	socket.on('error', console.error);
	socket.on('close', () => {
		ssh && ssh.relinquish(state === READY);
		ssh = null;
		state = ERRORED;
		frameParser.clear();
		signal.removeEventListener('abort', onAbort);
	});

	socket.on('data', (chunk) => {
		frameParser.append(chunk);
		for (const frame of frameParser.frames()) {
			switch (frame.type) {

				case FrameParser.REUSE:
					if (state === INITIAL) {
						const params = decode.reuseParams(frame.data);
						if (params) {
							state = CONNECTING;
							ssh = pool.reuse(params, emitter);
						} else {
							exception('malformed REUSE parameters');
						}
					} else {
						exception('unexpected REUSE frame');
					}
					break;

				case FrameParser.CONNECT:
					if (state === INITIAL) {
						const params = decode.connectParams(frame.data);
						if (params) {
							state = CONNECTING;
							ssh = pool.connect(params, emitter);
						} else {
							exception('malformed CONNECT parameters');
						}
					} else {
						exception('unexpected CONNECT frame');
					}
					break;

				case FrameParser.CHALLENGE_RESPONSE:
					if (state === CONNECTING) {
						const responses = decode.challengeResponse(frame.data);
						if (responses) {
							ssh.challengeResponse(responses);
						} else {
							exception('malformed CHALLENGE_RESPONSE parameters');
						}
					} else if (state !== INITIAL && state !== READY) {
						exception('unexpected CHALLENGE_RESPONSE frame');
					}
					break;

				case FrameParser.SIMPLE_COMMAND:
				case FrameParser.PTY_COMMAND:
					if (state === READY) {
						const command = decode.command(frame.data);
						if (command) {
							state = EXECUTING;
							ssh.exec(command, frame.type === FrameParser.PTY_COMMAND);
						} else {
							exception('malformed command string');
						}
					} else {
						exception('unexpected *_COMMAND frame');
					}
					break;

				case FrameParser.STDIN:
					if (state === EXECUTING) {
						if (frame.data.byteLength) {
							ssh.writeStdin(frame.data);
						} else {
							ssh.endStdin();
						}
					}
					break;

				case FrameParser.SHARE:
					if (state === READY) {
						const shareKey = randomBytes(16).toString('hex');
						ssh.relinquish(true, shareKey);
						ssh = null;
						state = INITIAL;
						sendJSON(FrameParser.SHARED, { shareKey });
					} else {
						exception('unexpected SHARE frame');
					}
					break;
			}
		}
	});

	emitter.on('connected', (info) => {
		if (state === CONNECTING) {
			state = READY;
			sendJSON(FrameParser.CONNECTED, info);
		} else {
			exception('internal error involving unexpected connection');
		}
	});

	emitter.on('unconnected', (reason) => {
		ssh = null;
		if (state === CONNECTING) {
			state = INITIAL;
			sendJSON(FrameParser.UNCONNECTED, { reason });
		} else {
			exception('internal error involving unexpected unconnection');
		}
	});

	emitter.on('disconnected', (reason) => {
		ssh = null;
		if (state === READY || state === EXECUTING) {
			state = ERRORED;
			sendJSON(FrameParser.DISCONNECTED, { reason });
			socket.destroySoon();
		} else {
			exception('internal error involving unexpected disconnection');
		}
	});

	emitter.on('challenge', (challenge) => {
		if (state === CONNECTING) {
			sendJSON(FrameParser.CHALLENGE, challenge);
		} else {
			exception('internal error involving unexpected challenge');
		}
	});

	emitter.on('stdout', (data) => {
		if (state === EXECUTING) {
			sendRaw(FrameParser.STDOUT, data);
		} else {
			exception('internal error involving unexpected stdout');
		}
	});

	emitter.on('stderr', (data) => {
		if (state === EXECUTING) {
			sendRaw(FrameParser.STDERR, data);
		} else {
			exception('internal error involving unexpected stderr');
		}
	});

	emitter.on('result', (result) => {
		if (state === EXECUTING) {
			state = READY;
			sendJSON(FrameParser.RESULT, result);
			signal.aborted && onAbort();
		} else {
			exception('internal error involving unexpected result');
		}
	});

	function sendRaw(type, data) {
		if (!socket.writable) return;
		socket.write(FrameParser.createFrame(type, data));
	}

	function sendJSON(type, data) {
		if (!socket.writable) return;
		socket.write(FrameParser.createFrame(type, JSON.stringify(data)));
	}

	function exception(reason) {
		if (state === ERRORED) return;
		console.error(`Client-level EXCEPTION: ${reason}`);
		sendJSON(FrameParser.EXCEPTION, { reason });
		socket.destroySoon();
		state = ERRORED;
	}
};
