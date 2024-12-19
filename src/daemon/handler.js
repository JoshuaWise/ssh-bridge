'use strict';
const FrameParser = require('../frame-parser');
const { decodeConnectRequest, decodeCommand } = require('./decode');

/*
	TODO: write comment
 */

const State = {
	EMPTY: 1,
	CONNECTING: 2,
	CONNECTED: 3,
	EXECUTING: 4,
};

module.exports = (signal, socket) => {
	const frameParser = new FrameParser();
	let state = State.EMPTY;

	socket.setNoDelay(true);
	socket.setKeepAlive(true, 1000);
	socket.on('error', console.error);
	socket.on('data', (chunk) => {
		frameParser.append(chunk);
		for (const frame of frameParser.frames()) {
			switch (frame.type) {
				case FrameParser.CONNECT: {
					const request = decodeConnectRequest(frame.data);
					if (request === null) {
						// TODO: handle invalid connect request
					} else {
						// TODO: handle connect request
					}
					break;
				}
				case FrameParser.SIMPLE_COMMAND: {
					const command = decodeCommand(frame.data);
					if (command === null) {
						// TODO: handle invalid command string
					} else {
						// TODO: handle simple command
					}
					break;
				}
				case FrameParser.PTY_COMMAND: {
					const command = decode.command(frame.data);
					if (command === null) {
						// TODO: handle invalid command string
					} else {
						// TODO: handle pty command
					}
					break;
				}
				case FrameParser.STDIN: {
					if (frame.data.byteLength) {
						// TODO: handle stdin data
					} else {
						// TODO: end stdin
					}
					break;
				}
			}
		}
	});

	socket.on('close', () => {
		// TODO: clean up
	});

	signal.addEventListener('abort', () => {
		// TODO: stop accepting new commands
		// TODO: if there is a queued/pending command, wait for it to finish
		// TODO: if/when there is no queued/pending command, close the connection
	});
};
