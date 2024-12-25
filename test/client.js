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

	describe('exec()', function () {
		const configDir = harness.getConfigDir('exec-tests');

		it('should run a command and return its stdout and exit code', async function () {
			const client = await connect(configDir);
			try {
				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				const { stdout, result } = client.exec('echo "Hello, World!"');
				const { code, signal } = await result;
				const stdoutString = (await streamToBuffer(stdout)).toString();

				expect(code).to.equal(0);
				expect(signal).to.be.undefined;
				expect(stdoutString).to.equal('Hello, World!\n');
			} finally {
				await client.close();
			}
		});

		it('should run a command and return its stderr and exit code', async function () {
			const client = await connect(configDir);
			try {
				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				const { stdout, stderr, result } = client.exec('echo "Hello, World!" 1>&2');
				const { code, signal } = await result;
				const stdoutString = (await streamToBuffer(stdout)).toString();
				const stderrString = (await streamToBuffer(stderr)).toString();

				expect(code).to.equal(0);
				expect(signal).to.be.undefined;
				expect(stdoutString).to.equal('');
				expect(stderrString).to.equal('Hello, World!\n');
			} finally {
				await client.close();
			}
		});

		it('should run a command and return the signal that terminated it', async function () {
			const client = await connect(configDir);
			try {
				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				const { result } = client.exec('node -e "process.kill(process.pid); setTimeout(() => {}, 10000);"');
				const { code, signal } = await result;

				expect(code).to.be.undefined;
				expect(signal).to.equal('SIGTERM');
			} finally {
				await client.close();
			}
		});

		it('should write to stdin while running a command', async function () {
			const client = await connect(configDir);
			try {
				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				const { stdin, stdout, result } = client.exec('cat');

				stdin.write('Hello, ');
				stdin.write('World!');
				stdin.end();

				const { code } = await result;
				const stdoutString = (await streamToBuffer(stdout)).toString();

				expect(code).to.equal(0);
				expect(stdoutString).to.equal('Hello, World!');
			} finally {
				await client.close();
			}
		});

		it('should write to stdin while running a command (interactively)', async function () {
			const client = await connect(configDir);
			try {
				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				const { stdin, stdout, result } = client.exec('node -e \'console.log("write something"); let data = ""; process.stdin.on("data", x => { data += x.toString() }); process.stdin.on("end", () => console.log(data));\'');
				let data = '';
				let ended = false;

				await new Promise((resolve, reject) => {
					stdout.on('data', (chunk) => {
						data += chunk.toString();
						if (data === 'write something\n') resolve();
					});
					stdout.on('end', () => { ended = true; });
					stdout.on('close', () => reject(new Error('Stream closed prematurely')));
					stdout.on('error', reject);
				});

				expect(ended).to.be.false;

				stdin.write('how are');
				stdin.write(' you doing?');
				stdin.end();

				const { code } = await result;
				await new Promise(r => process.nextTick(r));

				expect(code).to.equal(0);
				expect(ended).to.be.true;
				expect(data).to.equal('write something\nhow are you doing?\n');
			} finally {
				await client.close();
			}
		});

		it('should run multiple commands on a reused connection', async function () {
			const firstClient = await connect(configDir);
			try {
				await firstClient.connect({
					username: 'testuser_exec_reuse',
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
					username: 'testuser_exec_reuse',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
				});

				expect(result.success).to.be.true;
				expect(result.result).to.have.property('banner').that.equals('hello!\r\n');
				expect(result.result).to.have.property('fingerprint').that.is.a('string');
				expect(result.result.fingerprint).to.match(/^[a-zA-Z0-9+/]+=*$/);

				{
					const { stdout, result } = secondClient.exec('echo "Hello, World!"');
					const { code, signal } = await result;
					const stdoutString = (await streamToBuffer(stdout)).toString();

					expect(code).to.equal(0);
					expect(signal).to.be.undefined;
					expect(stdoutString).to.equal('Hello, World!\n');
				}
				{
					const { stderr, result } = secondClient.exec('node -e \'console.warn("Hello, Friend!"); process.exit(2);\'');
					const { code, signal } = await result;
					const stderrString = (await streamToBuffer(stderr)).toString();

					expect(code).to.equal(2);
					expect(signal).to.be.undefined;
					expect(stderrString).to.equal('Hello, Friend!\n');
				}
			} finally {
				await secondClient.close();
			}
		});

		it('should run the command with an allocated PTY, if requested');

		it('should not allow exec() when the client is in an errored state', async function () {
			const client = await connect(configDir);
			await client.close();

			const { stdout, stderr, result } = client.exec('echo "Hello, World!"');
			let stdoutErr;
			let stderrErr;
			stdout.on('error', (err) => { stdoutErr = err; });
			stderr.on('error', (err) => { stderrErr = err; });
			await expectReject(result, TypeError, 'Client is closed');
			await new Promise(r => process.nextTick(r));
			expect(stdoutErr).to.be.an.instanceof(TypeError);
			expect(stdoutErr.message).to.equal('Client is closed');
			expect(stderrErr).to.be.an.instanceof(TypeError);
			expect(stderrErr.message).to.equal('Client is closed');
		});

		it('should not allow exec() in an invalid state', async function () {
			const client = await connect(configDir);
			try {
				const { stdout, stderr, result } = client.exec('echo "Hello, World!"');
				let stdoutErr;
				let stderrErr;
				stdout.on('error', (err) => { stdoutErr = err; });
				stderr.on('error', (err) => { stderrErr = err; });
				await expectReject(result, TypeError, 'Method not available in the current state');
				await new Promise(r => process.nextTick(r));
				expect(stdoutErr).to.be.an.instanceof(TypeError);
				expect(stdoutErr.message).to.equal('Method not available in the current state');
				expect(stderrErr).to.be.an.instanceof(TypeError);
				expect(stderrErr.message).to.equal('Method not available in the current state');
			} finally {
				await client.close();
			}
		});
	});

	describe('close()', function () {
		const configDir = harness.getConfigDir('close-tests');

		it('should cancel existing operations with CLOSED error', async function () {
			const client = await connect(configDir);
			try {
				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				const operation = client.exec('sleep 5');
				expect(client.closed).to.be.false;

				const closePromise = client.close();
				expect(client.closed).to.be.true;

				await expectReject(operation.result, Error, 'Client was closed manually');
				await closePromise;
			} finally {
				await client.close();
			}
		});

		it('should wait until the socket is fully closed before returning', async function () {
			const client = await connect(configDir);
			try {
				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				const events = [];
				const closePromise = client.close();

				await Promise.all([
					closePromise.then(() => {
						events.push('close resolved');
					}),
					new Promise((resolve) => {
						process.nextTick(() => {
							events.push('next tick');
							resolve();
						});
					}),
				]);

				expect(events).to.deep.equal([
					'next tick',
					'close resolved',
				]);
			} finally {
				await client.close();
			}
		});

		it('should return right away if the socket is already fully closed', async function () {
			const client = await connect(configDir);
			await client.connect({
				username: 'testuser',
				hostname: '127.0.0.1',
				port: harness.getSSHPort(),
				password: 'correct_password',
			});
			await client.close();

			const events = [];
			const closePromise = client.close();

			await Promise.all([
				closePromise.then(() => {
					events.push('close resolved');
				}),
				new Promise((resolve) => {
					process.nextTick(() => {
						events.push('next tick');
						resolve();
					});
				}),
			]);

			expect(events).to.deep.equal([
				'close resolved',
				'next tick',
			]);
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

async function streamToBuffer(stream) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		stream.on('data', (chunk) => chunks.push(chunk));
		stream.on('end', () => resolve(Buffer.concat(chunks)));
		stream.on('close', () => reject(new Error('Stream closed prematurely')));
		stream.on('error', reject);
	});
}
