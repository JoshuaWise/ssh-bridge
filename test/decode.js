'use strict';
const { expect } = require('chai');
const decode = require('../src/daemon/decode');

describe('decode', function () {
	describe('reuseParams()', function () {
		it('should correctly decode valid reuse parameters', function () {
			const data = Buffer.from(JSON.stringify({
				username: 'user',
				hostname: 'host.example.com',
				port: 22,
			}));
			const result = decode.reuseParams(data);
			expect(result).to.deep.equal({
				username: 'user',
				hostname: 'host.example.com',
				port: 22,
			});
		});

		it('should return null for malformed JSON', function () {
			const data = Buffer.from('invalid json');
			const result = decode.reuseParams(data);
			expect(result).to.be.null;
		});

		it('should return null for missing required fields', function () {
			const data = Buffer.from(JSON.stringify({ hostname: 'host.example.com' }));
			const result = decode.reuseParams(data);
			expect(result).to.be.null;
		});

		it('should return null for invalid field types', function () {
			const data = Buffer.from(JSON.stringify({
				username: 'user',
				hostname: 123,
				port: '22',
			}));
			const result = decode.reuseParams(data);
			expect(result).to.be.null;
		});

		it('should return null for invalid port numbers', function () {
			const data = Buffer.from(JSON.stringify({
				username: 'user',
				hostname: 'host.example.com',
				port: 65536, // Out of range
			}));
			const result = decode.reuseParams(data);
			expect(result).to.be.null;
		});
	});

	describe('connectParams()', function () {
		it('should correctly decode valid connect parameters', function () {
			const data = Buffer.from(JSON.stringify({
				username: 'user',
				hostname: 'host.example.com',
				port: 22,
				fingerprint: 'abc123',
				reusable: true,
				privateKey: 'key',
				passphrase: 'phrase',
				password: 'password',
				tryKeyboard: false,
				privateKeyEncoded: false,
			}));
			const result = decode.connectParams(data);
			expect(result).to.deep.equal({
				username: 'user',
				hostname: 'host.example.com',
				port: 22,
				fingerprint: 'abc123',
				reusable: true,
				privateKey: 'key',
				passphrase: 'phrase',
				password: 'password',
				tryKeyboard: false,
			});
		});

		it('should allow optional fields to be omitted', function () {
			const data = Buffer.from(JSON.stringify({
				username: 'user',
				hostname: 'host.example.com',
			}));
			const result = decode.connectParams(data);
			expect(result).to.deep.equal({
				username: 'user',
				hostname: 'host.example.com',
				port: 22,
				fingerprint: undefined,
				reusable: false,
				privateKey: undefined,
				passphrase: undefined,
				password: undefined,
				tryKeyboard: false,
			});
		});

		it('should decode a base64-encoded privateKey', function () {
			const data = Buffer.from(JSON.stringify({
				username: 'user',
				hostname: 'host.example.com',
				privateKey: Buffer.from('hello world').toString('base64'),
				privateKeyEncoded: true,
			}));
			const result = decode.connectParams(data);
			expect(result).to.deep.equal({
				username: 'user',
				hostname: 'host.example.com',
				port: 22,
				fingerprint: undefined,
				reusable: false,
				privateKey: Buffer.from('hello world'),
				passphrase: undefined,
				password: undefined,
				tryKeyboard: false,
			});
		});

		it('should return null for malformed JSON', function () {
			const data = Buffer.from('invalid json');
			const result = decode.connectParams(data);
			expect(result).to.be.null;
		});

		it('should return null for missing required fields', function () {
			const data = Buffer.from(JSON.stringify({ username: 'user' }));
			const result = decode.connectParams(data);
			expect(result).to.be.null;
		});

		it('should return null for invalid types in required fields', function () {
			const data = Buffer.from(JSON.stringify({
				username: 123, // Invalid type
				hostname: 'host.example.com',
			}));
			const result = decode.connectParams(data);
			expect(result).to.be.null;
		});

		it('should return null for invalid types in optional fields', function () {
			const data = Buffer.from(JSON.stringify({
				username: 'user',
				hostname: 'host.example.com',
				fingerprint: 123, // Invalid type
			}));
			const result = decode.connectParams(data);
			expect(result).to.be.null;
		});

		it('should return null for invalid boolean fields', function () {
			const data = Buffer.from(JSON.stringify({
				username: 'user',
				hostname: 'host.example.com',
				reusable: 'true', // Invalid type
			}));
			const result = decode.connectParams(data);
			expect(result).to.be.null;
		});

		it('should return null if passphrase is provided without privateKey', function () {
			const data = Buffer.from(JSON.stringify({
				username: 'user',
				hostname: 'host.example.com',
				passphrase: 'passphrase',
			}));
			const result = decode.connectParams(data);
			expect(result).to.be.null;
		});

		it('should return null if privateKeyEncoded is true without privateKey', function () {
			const data = Buffer.from(JSON.stringify({
				username: 'user',
				hostname: 'host.example.com',
				privateKeyEncoded: true,
			}));
			const result = decode.connectParams(data);
			expect(result).to.be.null;
		});

		it('should return null for invalid port numbers', function () {
			const data = Buffer.from(JSON.stringify({
				username: 'user',
				hostname: 'host.example.com',
				port: 0,
			}));
			const result = decode.connectParams(data);
			expect(result).to.be.null;
		});
	});

	describe('challengeResponse()', function () {
		it('should correctly decode valid challenge responses', function () {
			const data = Buffer.from(JSON.stringify({
				responses: ['response1', 'response2'],
			}));
			const result = decode.challengeResponse(data);
			expect(result).to.deep.equal(['response1', 'response2']);
		});

		it('should return null for malformed JSON', function () {
			const data = Buffer.from('invalid json');
			const result = decode.challengeResponse(data);
			expect(result).to.be.null;
		});

		it('should return null for missing required fields', function () {
			const data = Buffer.from(JSON.stringify({}));
			const result = decode.challengeResponse(data);
			expect(result).to.be.null;
		});

		it('should return null if responses is not an array', function () {
			const data = Buffer.from(JSON.stringify({ responses: 'not an array' }));
			const result = decode.challengeResponse(data);
			expect(result).to.be.null;
		});

		it('should return null if responses contains non-string elements', function () {
			const data = Buffer.from(JSON.stringify({ responses: ['valid', 123] }));
			const result = decode.challengeResponse(data);
			expect(result).to.be.null;
		});
	});

	describe('command()', function () {
		it('should correctly decode a valid command string', function () {
			const commandString = 'ls -l';
			const data = Buffer.from(commandString);
			const result = decode.command(data);
			expect(result).to.equal(commandString);
		});

		it('should return null for an empty command string', function () {
			const data = Buffer.from('');
			const result = decode.command(data);
			expect(result).to.be.null;
		});

		it('should return null for commands containing multple lines', function () {
			const data = Buffer.from('invalid\ncommand');
			const result = decode.command(data);
			expect(result).to.be.null;
		});

		it('should return null for commands containing control characters', function () {
			const data = Buffer.from('invalid\x00command');
			const result = decode.command(data);
			expect(result).to.be.null;
		});
	});
});
