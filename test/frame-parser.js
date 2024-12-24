'use strict';
const { AssertionError } = require('node:assert');
const { expect } = require('chai');
const FrameParser = require('../src/lib/frame-parser');

describe('FrameParser', function () {
	describe('static createFrame()', function () {
		it('should correctly create a frame with the given type and data', function () {
			const frameType = FrameParser.CONNECT;
			const frameData = Buffer.from('test data');
			const frame = FrameParser.createFrame(frameType, frameData);

			expect(frame.readUInt32BE(0)).to.equal(frameData.length);
			expect(frame[4]).to.equal(frameType);
			expect(frame.subarray(5).toString()).to.equal(frameData.toString());
		});

		it('should correctly create a frame when data is a string', function () {
			const frameType = FrameParser.STDOUT;
			const frameData = 'string data';
			const frame = FrameParser.createFrame(frameType, frameData);

			expect(frame.readUInt32BE(0)).to.equal(Buffer.byteLength(frameData));
			expect(frame[4]).to.equal(frameType);
			expect(frame.subarray(5).toString()).to.equal(frameData);
		});

		it('should throw an assertion error for invalid frame type', function () {
			const invalidType = -1;
			expect(() => FrameParser.createFrame(invalidType, Buffer.from('data'))).to.throw(AssertionError);
		});

		it('should throw an assertion error for invalid data', function () {
			expect(() => FrameParser.createFrame(FrameParser.CONNECT, 123)).to.throw(AssertionError);
		});
	});

	describe('append()', function () {
		it('should correctly parse a single frame from a complete chunk', function () {
			const parser = new FrameParser();
			const frame = FrameParser.createFrame(FrameParser.CONNECT, Buffer.from('data'));
			parser.append(frame);

			const frames = [...parser.frames()];
			expect(frames).to.have.lengthOf(1);
			expect(frames[0].type).to.equal(FrameParser.CONNECT);
			expect(frames[0].data.toString()).to.equal('data');
		});

		it('should correctly parse frames from multiple appended chunks', function () {
			const parser = new FrameParser();
			const frame1 = FrameParser.createFrame(FrameParser.STDOUT, Buffer.from('stdout'));
			const frame2 = FrameParser.createFrame(FrameParser.STDERR, Buffer.from('stderr'));
			const combined = Buffer.concat([frame1, frame2]);

			parser.append(combined);

			const frames = [...parser.frames()];
			expect(frames).to.have.lengthOf(2);
			expect(frames[0].type).to.equal(FrameParser.STDOUT);
			expect(frames[0].data.toString()).to.equal('stdout');
			expect(frames[1].type).to.equal(FrameParser.STDERR);
			expect(frames[1].data.toString()).to.equal('stderr');
		});

		it('should handle incomplete frames by buffering data', function () {
			const parser = new FrameParser();
			const frame = FrameParser.createFrame(FrameParser.CHALLENGE, Buffer.from('partialdata'));
			const partial = frame.subarray(0, 8); // Incomplete frame

			parser.append(partial);
			expect([...parser.frames()]).to.be.empty;

			parser.append(frame.subarray(8)); // Append the remainder
			const frames = [...parser.frames()];
			expect(frames).to.have.lengthOf(1);
			expect(frames[0].type).to.equal(FrameParser.CHALLENGE);
			expect(frames[0].data.toString()).to.equal('partialdata');
		});

		it('should throw an assertion error for non-buffer input', function () {
			const parser = new FrameParser();
			expect(() => parser.append('not a buffer')).to.throw(AssertionError);
		});
	});

	describe('frames()', function () {
		it('should yield parsed frames in the order they were appended', function () {
			const parser = new FrameParser();
			const frame1 = FrameParser.createFrame(FrameParser.CONNECT, Buffer.from('connect'));
			const frame2 = FrameParser.createFrame(FrameParser.DISCONNECTED, Buffer.from('disconnected'));
			parser.append(Buffer.concat([frame1, frame2]));

			const frames = [...parser.frames()];
			expect(frames).to.have.lengthOf(2);
			expect(frames[0].type).to.equal(FrameParser.CONNECT);
			expect(frames[0].data.toString()).to.equal('connect');
			expect(frames[1].type).to.equal(FrameParser.DISCONNECTED);
			expect(frames[1].data.toString()).to.equal('disconnected');
		});

		it('should not yield the same frame multiple times', function () {
			const parser = new FrameParser();
			const frame = FrameParser.createFrame(FrameParser.RESULT, Buffer.from('result'));
			parser.append(frame);

			const framesFirstPass = [...parser.frames()];
			expect(framesFirstPass).to.have.lengthOf(1);

			const framesSecondPass = [...parser.frames()];
			expect(framesSecondPass).to.be.empty;
		});
	});

	describe('clear()', function () {
		it('should remove all buffered chunks and reset internal state', function () {
			const parser = new FrameParser();
			const frame = FrameParser.createFrame(FrameParser.RESULT, Buffer.from('data'));
			parser.append(frame);

			parser.clear();
			expect([...parser.frames()]).to.be.empty;

			const newFrame = FrameParser.createFrame(FrameParser.EXCEPTION, Buffer.from('new data'));
			parser.append(newFrame);

			const frames = [...parser.frames()];
			expect(frames).to.have.lengthOf(1);
			expect(frames[0].type).to.equal(FrameParser.EXCEPTION);
			expect(frames[0].data.toString()).to.equal('new data');
		});
	});
});
