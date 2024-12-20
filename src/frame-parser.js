'use strict';
const assert = require('node:assert');

/*
	TODO: write comment
 */

module.exports = class FrameParser {
	constructor() {
		this._chunks = [];
		this._chunksSize = 0;
		this._expectedSize = -1;
		this._frames = [];
	}

	clear() {
		this._chunks = [];
		this._chunksSize = 0;
		this._expectedSize = -1;
		this._frames = [];
	}

	append(chunk) {
		assert(Buffer.isBuffer(chunk));
		this._chunks.push(chunk);
		this._chunksSize += chunk.byteLength;

		while (this._chunksSize >= 5) {
			// Determine the incoming frame's size by reading the frame header.
			if (this._expectedSize < 0) {
				if (this._chunks[0].byteLength < 4) {
					this._chunks = [Buffer.concat(this._chunks)];
					assert(this._chunks[0].byteLength >= 4);
				}

				const frameSize = this._chunks[0].readUInt32BE(0);
				this._expectedSize = frameSize + 5;
				assert(this._expectedSize >= 5);
			}

			// If we have a complete frame, slice it out.
			if (this._chunksSize >= this._expectedSize) {
				const temp = this._chunks.length > 1 ? Buffer.concat(this._chunks) : this._chunks[0];
				const frameType = temp[4];
				const frameData = Buffer.from(temp.subarray(5, this._expectedSize));
				const remainder = Buffer.from(temp.subarray(this._expectedSize));

				this._chunks = remainder.byteLength ? [remainder] : [];
				this._chunksSize -= this._expectedSize;
				this._expectedSize = -1;
				this._frames.push({ type: frameType, data: frameData });
				assert(this._chunksSize === remainder.byteLength);
			} else {
				break;
			}
		}
	}

	*frames() {
		while (this._frames.length) {
			yield this._frames.shift();
		}
	}

	static createFrame(type, data) {
		assert(Number.isInteger(type) && type > 0);
		assert(Buffer.isBuffer(data) || typeof data === 'string');

		const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
		const frame = Buffer.allocUnsafe(dataBuffer.byteLength + 5);
		frame.writeUInt32BE(dataBuffer.byteLength, 0);
		frame[4] = type;
		frame.set(dataBuffer, 5);
		return frame;
	}

	// New clients should send either a REUSE or CONNECT frame before doing
	// anything else. Upon receiving REUSE, the daemon will try to assign a
	// cached SSH connection to the client, if one exists. Upon receiving
	// CONNECT, the daemon will try to establish a new SSH connection.
	static get REUSE() { return 1; }
	static get CONNECT() { return 2; }

	// After receiving either a REUSE or CONNECT frame, the daemon will usually
	// respond with either a CONNECTED or UNCONNECTED frame, depending on if a
	// connection was successfully assigned/established for the client, or not.
	// However, in some cases, after receiving a CONNECT frame, the daemon may
	// send any number of CHALLENGE frames, expecting the client to send a
	// RESPONSE frame for each CHALLENGE frame. These CHALLENGE and RESPONSE
	// frames facilitate SSH's "keyboard-interactive" authentication method.
	// Eventually, the daemon will send either a CONNECTED or UNCONNECTED frame.
	// If the client receives a CONNECTED frame, it may receive a DISCONNECTED
	// frame at any point in the future, signaling that the SSH connection has
	// ended (for any reason), after which the client connection will also end.
	static get CHALLENGE() { return 3; }
	static get CHALLENGE_RESPONSE() { return 4; }
	static get CONNECTED() { return 5; }
	static get UNCONNECTED() { return 6; }
	static get DISCONNECTED() { return 7; }

	// After a client receives a CONNECTED frame (and before it receives a
	// DISCONNECTED frame), it may send a SIMPLE_COMMAND or PTY_COMMAND frame,
	// to execute a command over the SSH connection assigned to the client. When
	// the command finishes (successfully or not), the daemon will send a RESULT
	// frame. Afterwards, the client may send another command (and so on).
	static get SIMPLE_COMMAND() { return 8; }
	static get PTY_COMMAND() { return 9; }
	static get RESULT() { return 10; }

	// After a client sends a SIMPLE_COMMAND or PTY_COMMAND frame, but before it
	// receives a RESULT frame, it may send any number of STDIN frames, and it
	// may receive any number STDOUT and STDERR frames. Since the client cannot
	// predict when the running command might finish, the daemon will silently
	// ignore any STDIN frames that are received when no command is running.
	static get STDIN() { return 11; }
	static get STDOUT() { return 12; }
	static get STDERR() { return 13; }

	// If the client ever violates the expectations of the daemon, or if the
	// daemon encounters an unrecoverable situation, the daemon will send an
	// EXCEPTION frame before immediately closing the client's connection.
	static get EXCEPTION() { return 14; }
};
