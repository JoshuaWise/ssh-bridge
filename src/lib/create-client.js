'use strict';
const { Readable, Writable } = require('node:stream');
const FrameParser = require('./frame-parser');

/*
	This function creates and returns a fully-functioning ssh-bridge client,
	given a raw TCP socket that's connected to the ssh-bridge daemon. The client
	is basically state machine that handles events coming from the daemon, as
	well as methods invoked by the user of the client.
 */

const INITIAL = Symbol();
const CONNECTING = Symbol();
const READY = Symbol();
const EXECUTING = Symbol();
const ERRORED = Symbol();

module.exports = (socket) => {
	const frameParser = new FrameParser();
	let socketHasClosed = false;
	let hasNewException = false;
	let connectionAttempts = 0;
	let state = INITIAL;
	let resolver;
	let error;

	socket.setNoDelay(true);
	socket.setKeepAlive(true, 1000);
	socket.on('error', (err) => {
		exception('Connection with ssh-bridge daemon closed unexpectedly', 'NO_DAEMON', { cause: err });
	});
	socket.on('close', () => {
		socketHasClosed = true;
		exception('Connection with ssh-bridge daemon closed unexpectedly', 'NO_DAEMON');
		frameParser.clear();
	});

	socket.on('data', (chunk) => {
		frameParser.append(chunk);
		for (const frame of frameParser.frames()) {
			switch (frame.type) {

				case FrameParser.CHALLENGE:
					if (state === CONNECTING && resolver.challengeHandler) {
						handleChallenge(resolver.challengeHandler, decodeJSON(frame.data) || {}, connectionAttempts);
					} else {
						protocolException('unexpected CHALLENGE frame');
					}
					break;

				case FrameParser.CONNECTED:
					if (state === CONNECTING) {
						state = READY;
						resolver.resolve({ success: true, result: decodeJSON(frame.data) || {} });
						resolver = undefined;
					} else {
						protocolException('unexpected CONNECTED frame');
					}
					break;

				case FrameParser.UNCONNECTED:
					if (state === CONNECTING) {
						state = INITIAL;
						resolver.resolve({ success: false, result: decodeJSON(frame.data) || {} });
						resolver = undefined;
					} else {
						protocolException('unexpected UNCONNECTED frame');
					}
					break;

				case FrameParser.DISCONNECTED:
					if (state === READY || state === EXECUTING) {
						exception('SSH connection closed unexpectedly', 'NO_SSH', {
							reason: decodeJSON(frame.data)?.reason || 'unknown error',
						});
					} else {
						protocolException('unexpected DISCONNECTED frame');
					}
					break;

				case FrameParser.RESULT:
					if (state === EXECUTING) {
						const result = decodeJSON(frame.data) || {};
						if (result.error === undefined) {
							state = READY;
							resolver.resolve(result);
							resolver = undefined;
						} else {
							exception('SSH error during command execution', 'SSH_ERROR', {
								reason: result.error || 'unknown error',
							});
						}
					} else {
						protocolException('unexpected RESULT frame');
					}
					break;

				case FrameParser.STDOUT:
					if (state === EXECUTING) {
						resolver.stdout.push(frame.data);
					} else {
						protocolException('unexpected STDOUT frame');
					}
					break;

				case FrameParser.STDERR:
					if (state === EXECUTING) {
						resolver.stderr.push(frame.data);
					} else {
						protocolException('unexpected STDERR frame');
					}
					break;

				case FrameParser.EXCEPTION:
					exception('Fatal error emitted by ssh-bridge daemon', 'DAEMON_ERROR', {
						reason: decodeJSON(frame.data)?.reason || 'unknown error',
					});
					break;
			}
		}
	});

	// When an unrecoverable situation occurs, the client enters an ERRORED
	// state. This might happen when the client is idle, so we save the error,
	// enabling us to propagate it whenever the client is used again.
	function exception(message, type, { reason, cause } = {}) {
		if (state !== ERRORED) {
			state = ERRORED;
			error = new Error(message);
			error.type = type;

			if (reason !== undefined) {
				error.reason = String(reason);
			}
			if (cause !== undefined) {
				error.cause = cause;
			}

			// If there's a pending operation, we reject it with the error.
			// Otherwise, we set hasNewException, which indicates that the next
			// attempted operation should be rejected with the error. This makes
			// error handling much less susceptible to racy nondeterminism.
			if (resolver) {
				resolver.reject(error);
				resolver = undefined;
			} else {
				hasNewException = true;
			}

			socket.destroySoon();
		}
	}

	function protocolException(reason) {
		exception('Daemon protocol violation', 'PROTOCOL_ERROR', { reason });
	}

	function handleChallenge(challengeHandler, challenge, connectionAttemptNumber) {
		Promise.resolve()
			.then(() => challengeHandler(challenge))
			.then((responses) => {
				if (state !== CONNECTING) return;
				if (connectionAttempts !== connectionAttemptNumber) return;
				if (Array.isArray(responses)) {
					responses = responses.map(String);
					sendJSON(FrameParser.CHALLENGE_RESPONSE, { responses });
				} else {
					exception('Expected challenge response to be an array', 'CHALLENGE_ERROR');
				}
			}, (err) => {
				exception('Failed to generate challenge response', 'CHALLENGE_ERROR', { cause: err });
			});
	}

	function sendRaw(type, data, encoding, cb) {
		if (state === ERRORED) return;
		if (!socket.writable) return;
		socket.write(FrameParser.createFrame(type, data), encoding, cb);
	}

	function sendJSON(type, data) {
		if (state === ERRORED) return;
		if (!socket.writable) return;
		socket.write(FrameParser.createFrame(type, JSON.stringify(data)));
	}

	function decodeJSON(data) {
		let obj;
		try { obj = JSON.parse(data.toString()); }
		catch (_) { return null; }
		if (typeof obj !== 'object') return null;
		if (Array.isArray(obj)) return null;
		return obj;
	}

	// This utility function is used to guard the client's methods against being
	// used in unexpected states. It also propagates previous exceptions.
	function expectState(expectedState) {
		if (state === ERRORED) {
			if (hasNewException) {
				hasNewException = false;
				throw error;
			} else {
				throw Object.assign(new TypeError('Client is closed'), { cause: error });
			}
		}
		if (state !== expectedState) {
			throw new TypeError('Method not available in the current state');
		}
	}

	function attachPromise() {
		return new Promise((resolve, reject) => {
			resolver = { resolve, reject };
		});
	}

	return {
		async reuse({ ...params } = {}) {
			expectState(INITIAL);
			sendJSON(FrameParser.REUSE, params);
			connectionAttempts += 1;
			state = CONNECTING;
			return attachPromise();
		},

		async connect({ ...params } = {}, challengeHandler = null) {
			if (typeof challengeHandler === 'function') {
				params.tryKeyboard = true;
			} else if (challengeHandler === null) {
				params.tryKeyboard = false;
			} else {
				throw new TypeError('Expected challengeHandler to be a function, if provided');
			}

			expectState(INITIAL);
			sendJSON(FrameParser.CONNECT, params);
			connectionAttempts += 1;
			state = CONNECTING;
			const promise = attachPromise();
			resolver.challengeHandler = challengeHandler;
			return promise;
		},

		exec(command, { pty = false } = {}) {
			if (typeof command !== 'string') {
				throw new TypeError('Expected command to be a string');
			}

			const stdin = new Writable({
				write(data, encoding, cb) {
					if (!data.length) return cb();
					sendRaw(FrameParser.STDIN, data, encoding, cb);
				},
				final(cb) {
					sendRaw(FrameParser.STDIN, Buffer.alloc(0), undefined, cb);
				},
			});

			const stdout = new Readable({ read() {} });
			const stderr = new Readable({ read() {} });
			const result = new Promise((resolve) => {
				expectState(READY);
				sendRaw(pty ? FrameParser.PTY_COMMAND : FrameParser.SIMPLE_COMMAND, command);
				state = EXECUTING;
				resolve(attachPromise());
				resolver.stdout = stdout;
				resolver.stderr = stderr;
			});

			result.then(() => {
				stdin.destroy();
				stdout.push(null);
				stderr.push(null);
			}, (err) => {
				stdin.destroy();
				stdout.destroy(err);
				stderr.destroy(err);
			});

			// Attach error handlers so they don't trigger uncaught exceptions.
			stdin.on('error', () => {});
			stdout.on('error', () => {});
			stderr.on('error', () => {});

			return { stdin, stdout, stderr, result };
		},

		async close() {
			exception('Client was closed manually', 'CLOSED');
			hasNewException = false;

			if (!socketHasClosed) {
				await new Promise(resolve => socket.once('close', resolve));
			}
		},

		get closed() {
			return state === ERRORED;
		},
	};
};
