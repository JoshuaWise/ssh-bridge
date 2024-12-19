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

	static get CONNECT() { return 1; }
	static get CONNECTION() { return 2; }
	static get SIMPLE_COMMAND() { return 3; }
	static get PTY_COMMAND() { return 4; }
	static get STDIN() { return 5; }
	static get STDOUT() { return 6; }
	static get STDERR() { return 7; }
	static get RESULT() { return 8; }
};
