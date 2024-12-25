'use strict';
const { expect } = require('chai');
const { connect } = require('../src/lib/index');
const harness = require('./tools/harness');

describe('client', function () {
	describe('connect()', function () {
		const configDir = harness.getConfigDir('connect-tests');

		it('should successfully authenticate with password auth', async function () {
			const client = await connect(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_password',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				expect(result.success).to.be.true;
				expect(result.result).to.have.property('banner').that.equals('hello!\r\n');
				expect(result.result).to.have.property('fingerprint').that.is.a('string');
				expect(result.result.fingerprint).to.match(/^[a-zA-Z0-9+/]+=*$/);
			} finally {
				await client.close();
			}
		});

		it('should successfully authenticate with unencrypted public key', async function () {
			const client = await connect(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_pubkey',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					privateKey: harness.getSSHKey(),
				});

				expect(result.success).to.be.true;
				expect(result.result).to.have.property('banner').that.equals('hello!\r\n');
				expect(result.result).to.have.property('fingerprint').that.is.a('string');
				expect(result.result.fingerprint).to.match(/^[a-zA-Z0-9+/]+=*$/);
			} finally {
				await client.close();
			}
		});

		it('should successfully authenticate with encrypted public key', async function () {
			const client = await connect(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_pubkey_passphrase',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					privateKey: harness.getSSHKeyEncrypted(),
					passphrase: 'correct_passphrase',
				});

				expect(result.success).to.be.true;
				expect(result.result).to.have.property('banner').that.equals('hello!\r\n');
				expect(result.result).to.have.property('fingerprint').that.is.a('string');
				expect(result.result.fingerprint).to.match(/^[a-zA-Z0-9+/]+=*$/);
			} finally {
				await client.close();
			}
		});

		it('should successfully authenticate with keyboard-interactive auth', async function () {
			const client = await connect(configDir);
			try {
				const challenges = [];
				const result = await client.connect({
					username: 'testuser_interactive',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
				}, (challenge) => {
					expect(challenge.instructions).to.equal('Please answer the following question(s):');
					challenges.push(challenge.prompts);
					return challenge.prompts.map(({ prompt }) => {
						if (prompt === 'favorite color?') return 'blue';
						if (prompt === 'favorite number?') return '42';
						if (prompt === 'are you sure?') return 'yes';
						return '';
					});
				});

				expect(result.success).to.be.true;
				expect(result.result).to.have.property('banner').that.equals('hello!\r\n');
				expect(result.result).to.have.property('fingerprint').that.is.a('string');
				expect(result.result.fingerprint).to.match(/^[a-zA-Z0-9+/]+=*$/);
				expect(challenges).to.deep.equal([
					[
						{ prompt: 'favorite color?', echo: true },
						{ prompt: 'favorite number?', echo: false },
					],
					[
						{ prompt: 'are you sure?', echo: true },
					],
				]);
			} finally {
				await client.close();
			}
		});

		it('should successfully authenticate with multiple auth types', async function () {
			const client = await connect(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_mixed_auth_types',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					privateKey: harness.getSSHKeyEncrypted(),
					passphrase: 'incorrect_passphrase',
					password: 'correct_password',
				});

				expect(result.success).to.be.true;
				expect(result.result).to.have.property('banner').that.equals('hello!\r\n');
				expect(result.result).to.have.property('fingerprint').that.is.a('string');
				expect(result.result.fingerprint).to.match(/^[a-zA-Z0-9+/]+=*$/);
			} finally {
				await client.close();
			}
		});

		it('should fail to authenticate with wrong password', async function () {
			const client = await connect(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_password_2',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'incorrect_password',
				});

				expect(result.success).to.be.false;
				expect(result.result).to.have.property('reason').that.equals('authentication denied');
			} finally {
				await client.close();
			}
		});

		it('should fail to authenticate with missing public key passphrase', async function () {
			const client = await connect(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_pubkey_passphrase_2',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					privateKey: harness.getSSHKeyEncrypted(),
				});

				expect(result.success).to.be.false;
				expect(result.result).to.have.property('reason').that.equals('authentication denied');
			} finally {
				await client.close();
			}
		});

		it('should fail to authenticate with wrong public key passphrase', async function () {
			const client = await connect(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_pubkey_passphrase_3',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					privateKey: harness.getSSHKeyEncrypted(),
					passphrase: 'incorrect_passphrase',
				});

				expect(result.success).to.be.false;
				expect(result.result).to.have.property('reason').that.equals('authentication denied');
			} finally {
				await client.close();
			}
		});

		it('should reuse credentials when no credentials are provided', async function () {
			const client = await connect(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_cached_credentials',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				expect(result.success).to.be.true;

				const secondClient = await connect(configDir);
				try {
					const secondResult = await secondClient.connect({
						username: 'testuser_cached_credentials',
						hostname: '127.0.0.1',
						port: harness.getSSHPort(),
					});

					expect(secondResult.success).to.be.true;
				} finally {
					await secondClient.close();
				}
			} finally {
				await client.close();
			}
		});

		it('should not reuse credentials when interactive-keyboard auth was used', async function () {
			const client = await connect(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_mixed_credentials',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'incorrect_password',
					privateKey: harness.getSSHKeyEncrypted(),
					passphrase: 'incorrect_passphrase',
				}, (challenge) => {
					return challenge.prompts.map(({ prompt }) => {
						if (prompt === 'favorite color?') return 'blue';
						if (prompt === 'favorite number?') return '42';
						if (prompt === 'are you sure?') return 'yes';
						return '';
					});
				});

				expect(result.success).to.be.true;

				const secondClient = await connect(configDir);
				try {
					const secondResult = await secondClient.connect({
						username: 'testuser_mixed_credentials',
						hostname: '127.0.0.1',
						port: harness.getSSHPort(),
					});

					expect(secondResult.success).to.be.false;
					expect(secondResult.result.reason).to.include('no credentials provided');
				} finally {
					await secondClient.close();
				}
			} finally {
				await client.close();
			}
		});

		it('should fail when trying to reuse credentials with no cache', async function () {
			const client = await connect(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_nocached_credentials',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
				});

				expect(result.success).to.be.false;
				expect(result.result.reason).to.include('no credentials provided');
			} finally {
				await client.close();
			}
		});

		it('should fail when the provided fingerprint does not match', async function () {
			const client = await connect(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_bad_fingerprint',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
					fingerprint: '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
				});

				expect(result.success).to.be.false;
				expect(result.result.reason).to.include('host fingerprint has changed');
			} finally {
				await client.close();
			}
		});

		it('should not allow connect() when the client is in an errored state', async function () {
			const client = await connect(configDir);
			await client.close();

			await expectReject(client.connect({
				username: 'testuser_errored',
				hostname: '127.0.0.1',
				port: harness.getSSHPort(),
				password: 'correct_password',
			}) , TypeError, 'Client is closed');
		});

		it('should not allow connect() in an invalid state', async function () {
			const client = await connect(configDir);
			try {
				// Call connect() to transition the client out of its INITIAL state.
				await client.connect({
					username: 'testuser_invalid_state',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				// Attempting connect() in this state should throw an error.
				await expectReject(client.connect({
					username: 'testuser_invalid_state',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				}), TypeError, 'Method not available in the current state');
			} finally {
				await client.close();
			}
		});
	});

	describe('reuse()', function () {
		const configDir = harness.getConfigDir('reuse-tests');

		it('should return banner and fingerprint on successful reuse', async function () {
			const firstClient = await connect(configDir);
			try {
				await firstClient.connect({
					username: 'testuser_reuse',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
					reusable: true,
				});
			} finally {
				await firstClient.close();
			}

			const secondClient = await connect(configDir);
			try {
				const result = await secondClient.reuse({
					username: 'testuser_reuse',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
				});

				expect(result.success).to.be.true;
				expect(result.result).to.have.property('banner').that.equals('hello!\r\n');
				expect(result.result).to.have.property('fingerprint').that.is.a('string');
				expect(result.result.fingerprint).to.match(/^[a-zA-Z0-9+/]+=*$/);
			} finally {
				await secondClient.close();
			}
		});

		it('should not reuse connections that were not declared reusable', async function () {
			const firstClient = await connect(configDir);
			try {
				await firstClient.connect({
					username: 'testuser_no_reuse',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});
			} finally {
				await firstClient.close();
			}

			const secondClient = await connect(configDir);
			try {
				const result = await secondClient.reuse({
					username: 'testuser_no_reuse',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
				});

				expect(result.success).to.be.false;
			} finally {
				await secondClient.close();
			}
		});

		it('should return a reason string on unsuccessful reuse', async function () {
			const client = await connect(configDir);
			try {
				const result = await client.reuse({
					username: 'testuser_nonexistent',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
				});

				expect(result.success).to.be.false;
				expect(result.result).to.have.property('reason').that.equals('no cached connection to reuse');
			} finally {
				await client.close();
			}
		});

		it('should not allow reuse() when the client is in an errored state', async function () {
			const client = await connect(configDir);
			await client.close();

			await expectReject(client.reuse({
				username: 'testuser_reuse_errored',
				hostname: '127.0.0.1',
				port: harness.getSSHPort(),
			}), TypeError, 'Client is closed');
		});

		it('should not allow reuse() in an invalid state', async function () {
			const client = await connect(configDir);
			try {
				// Call connect() to transition the client out of its INITIAL state.
				await client.connect({
					username: 'testuser_reuse_invalid_state',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				// Attempting reuse() in this state should throw an error.
				await expectReject(client.reuse({
					username: 'testuser_reuse_invalid_state',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
				}), TypeError, 'Method not available in the current state');
			} finally {
				await client.close();
			}
		});
	});
});

async function expectReject(promise, ...args) {
	try {
		await promise;
	} catch (err) {
		expect(() => { throw err; }).to.throw(...args);
		return;
	}
	expect.fail('Expected promise to be rejected');
}
