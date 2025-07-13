'use strict';
const { expect } = require('chai');
const sshBridge = require('../src/lib/index');
const shellEscape = require('./tools/shell-escape');
const harness = require('./tools/harness');

describe('client', function () {
	describe('connect()', function () {
		const configDir = harness.getConfigDir('connect-tests');

		it('should successfully authenticate with password auth', async function () {
			const client = await sshBridge(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_password',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				expect(result.success).to.be.true;
				expect(result.banner).to.equal('hello!\r\n');
				expect(result.fingerprint).to.be.a('string');
				expect(result.fingerprint).to.match(/^[a-zA-Z0-9+/]+=*$/);
			} finally {
				await client.close();
			}
		});

		it('should successfully authenticate with unencrypted private key', async function () {
			const client = await sshBridge(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_pubkey',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					privateKey: harness.getSSHKey(),
				});

				expect(result.success).to.be.true;
				expect(result.banner).to.equal('hello!\r\n');
				expect(result.fingerprint).to.be.a('string');
				expect(result.fingerprint).to.match(/^[a-zA-Z0-9+/]+=*$/);
			} finally {
				await client.close();
			}
		});

		it('should successfully authenticate with encrypted private key', async function () {
			const client = await sshBridge(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_pubkey_passphrase',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					privateKey: harness.getSSHKeyEncrypted(),
					passphrase: 'correct_passphrase',
				});

				expect(result.success).to.be.true;
				expect(result.banner).to.equal('hello!\r\n');
				expect(result.fingerprint).to.be.a('string');
				expect(result.fingerprint).to.match(/^[a-zA-Z0-9+/]+=*$/);
			} finally {
				await client.close();
			}
		});

		it('should successfully authenticate with encrypted private key Buffer', async function () {
			const client = await sshBridge(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_pubkey_passphrase',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					privateKey: Buffer.from(harness.getSSHKeyEncrypted()),
					passphrase: 'correct_passphrase',
				});

				expect(result.success).to.be.true;
				expect(result.banner).to.equal('hello!\r\n');
				expect(result.fingerprint).to.be.a('string');
				expect(result.fingerprint).to.match(/^[a-zA-Z0-9+/]+=*$/);
			} finally {
				await client.close();
			}
		});

		it('should successfully authenticate with keyboard-interactive auth', async function () {
			const client = await sshBridge(configDir);
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
				expect(result.banner).to.equal('hello!\r\n');
				expect(result.fingerprint).to.be.a('string');
				expect(result.fingerprint).to.match(/^[a-zA-Z0-9+/]+=*$/);
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
			const client = await sshBridge(configDir);
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
				expect(result.banner).to.equal('hello!\r\n');
				expect(result.fingerprint).to.be.a('string');
				expect(result.fingerprint).to.match(/^[a-zA-Z0-9+/]+=*$/);
			} finally {
				await client.close();
			}
		});

		it('should fail to authenticate with wrong password', async function () {
			const client = await sshBridge(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_password_2',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'incorrect_password',
				});

				expect(result.success).to.be.false;
				expect(result.reason).to.equal('authentication denied');
			} finally {
				await client.close();
			}
		});

		it('should fail to authenticate with missing private key passphrase', async function () {
			const client = await sshBridge(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_pubkey_passphrase_2',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					privateKey: harness.getSSHKeyEncrypted(),
				});

				expect(result.success).to.be.false;
				expect(result.reason).to.equal('authentication denied');
			} finally {
				await client.close();
			}
		});

		it('should fail to authenticate with wrong private key passphrase', async function () {
			const client = await sshBridge(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_pubkey_passphrase_3',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					privateKey: harness.getSSHKeyEncrypted(),
					passphrase: 'incorrect_passphrase',
				});

				expect(result.success).to.be.false;
				expect(result.reason).to.equal('authentication denied');
			} finally {
				await client.close();
			}
		});

		it('should reuse credentials when no credentials are provided', async function () {
			const client = await sshBridge(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_cached_credentials',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				expect(result.success).to.be.true;

				const secondClient = await sshBridge(configDir);
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
			const client = await sshBridge(configDir);
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

				const secondClient = await sshBridge(configDir);
				try {
					const secondResult = await secondClient.connect({
						username: 'testuser_mixed_credentials',
						hostname: '127.0.0.1',
						port: harness.getSSHPort(),
					});

					expect(secondResult.success).to.be.false;
					expect(secondResult.reason).to.equal('no credentials provided');
				} finally {
					await secondClient.close();
				}
			} finally {
				await client.close();
			}
		});

		it('should fail when trying to reuse credentials with no cache', async function () {
			const client = await sshBridge(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_nocached_credentials',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
				});

				expect(result.success).to.be.false;
				expect(result.reason).to.equal('no credentials provided');
			} finally {
				await client.close();
			}
		});

		it('should fail when the provided fingerprint does not match', async function () {
			const client = await sshBridge(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_bad_fingerprint',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
					fingerprint: '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
				});

				expect(result.success).to.be.false;
				expect(result.reason).to.include('host fingerprint has changed');
			} finally {
				await client.close();
			}
		});

		it('should not allow connect() when the client is in an errored state', async function () {
			const client = await sshBridge(configDir);
			await client.close();

			await expectReject(client.connect({
				username: 'testuser_errored',
				hostname: '127.0.0.1',
				port: harness.getSSHPort(),
				password: 'correct_password',
			}) , TypeError, 'Client is closed');
		});

		it('should not allow connect() in an invalid state', async function () {
			const client = await sshBridge(configDir);
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
			const firstClient = await sshBridge(configDir);
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

			const secondClient = await sshBridge(configDir);
			try {
				const result = await secondClient.reuse({
					username: 'testuser_reuse',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
				});

				expect(result.success).to.be.true;
				expect(result.banner).to.equal('hello!\r\n');
				expect(result.fingerprint).to.be.a('string');
				expect(result.fingerprint).to.match(/^[a-zA-Z0-9+/]+=*$/);
			} finally {
				await secondClient.close();
			}
		});

		it('should not reuse connections that were not declared reusable', async function () {
			const firstClient = await sshBridge(configDir);
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

			const secondClient = await sshBridge(configDir);
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
			const client = await sshBridge(configDir);
			try {
				const result = await client.reuse({
					username: 'testuser_nonexistent',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
				});

				expect(result.success).to.be.false;
				expect(result.reason).to.equal('no cached connection to reuse');
			} finally {
				await client.close();
			}
		});

		it('should not allow reuse() when the client is in an errored state', async function () {
			const client = await sshBridge(configDir);
			await client.close();

			await expectReject(client.reuse({
				username: 'testuser_reuse_errored',
				hostname: '127.0.0.1',
				port: harness.getSSHPort(),
			}), TypeError, 'Client is closed');
		});

		it('should not allow reuse() in an invalid state', async function () {
			const client = await sshBridge(configDir);
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
			const client = await sshBridge(configDir);
			try {
				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				const { stdout, result } = client.exec(shellEscape('node', '-e', 'console.log("Hello, World!")'));
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
			const client = await sshBridge(configDir);
			try {
				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				const { stdout, stderr, result } = client.exec(shellEscape('node', '-e', 'console.error("Hello, World!")'));
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
			const client = await sshBridge(configDir);
			try {
				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				const prefix = process.platform === 'win32' ? '' : 'exec ';
				const { result } = client.exec(`${prefix}${shellEscape('node', '-e', 'process.kill(process.pid); setTimeout(() => {}, 10000)')}`);
				const { code, signal } = await result;

				if (process.platform === 'win32') {
					expect(code).to.equal(1);
					expect(signal).to.be.undefined;
				} else {
					expect(code).to.be.undefined;
					expect(signal).to.equal('SIGTERM');
				}
			} finally {
				await client.close();
			}
		});

		it('should write to stdin while running a command', async function () {
			const client = await sshBridge(configDir);
			try {
				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				const { stdin, stdout, result } = client.exec(shellEscape('node', '-e', 'let data = ""; process.stdin.on("data", x => { data += x.toString() }); process.stdin.on("end", () => console.log(data));'));

				stdin.write('Hello, ');
				stdin.write('World!');
				stdin.end();

				const { code } = await result;
				const stdoutString = (await streamToBuffer(stdout)).toString();

				expect(code).to.equal(0);
				expect(stdoutString).to.equal('Hello, World!\n');
			} finally {
				await client.close();
			}
		});

		it('should write to stdin while running a command (interactively)', async function () {
			const client = await sshBridge(configDir);
			try {
				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});


				const { stdin, stdout, result } = client.exec(shellEscape('node', '-e', 'console.log("write something"); let data = ""; process.stdin.on("data", x => { data += x.toString() }); process.stdin.on("end", () => console.log(data));'));
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
			const firstClient = await sshBridge(configDir);
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

			const secondClient = await sshBridge(configDir);
			try {
				const result = await secondClient.reuse({
					username: 'testuser_exec_reuse',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
				});

				expect(result.success).to.be.true;
				expect(result.banner).to.equal('hello!\r\n');
				expect(result.fingerprint).to.be.a('string');
				expect(result.fingerprint).to.match(/^[a-zA-Z0-9+/]+=*$/);

				{
					const { stdout, result } = secondClient.exec(shellEscape('node', '-e', 'console.log("Hello, World!")'));
					const { code, signal } = await result;
					const stdoutString = (await streamToBuffer(stdout)).toString();

					expect(code).to.equal(0);
					expect(signal).to.be.undefined;
					expect(stdoutString).to.equal('Hello, World!\n');
				}
				{
					const { stderr, result } = secondClient.exec(shellEscape('node', '-e', 'console.warn("Hello, Friend!"); process.exit(2)'));
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

		it('should run the command with an allocated PTY, if requested', async function () {
			const client = await sshBridge(configDir);
			try {
				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				const { stdout, result } = client.exec(shellEscape('node', '-e', 'const pty = require(process.env.PTY); console.log(`${pty.rows}, ${pty.cols}`)'), { pty: true });
				const { code, signal } = await result;
				const stdoutString = (await streamToBuffer(stdout)).toString();

				expect(code).to.equal(0);
				expect(signal).to.be.undefined;
				expect(stdoutString).to.equal('24, 80\n');
			} finally {
				await client.close();
			}
		});

		it('should not allow exec() when the client is in an errored state', async function () {
			const client = await sshBridge(configDir);
			await client.close();

			const { stdout, stderr, result } = client.exec(shellEscape('node', '-e', 'console.log("Hello, World!")'));
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
			const client = await sshBridge(configDir);
			try {
				const { stdout, stderr, result } = client.exec(shellEscape('node', '-e', 'console.log("Hello, World!")'));
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

	describe('share()', function () {
		const configDir = harness.getConfigDir('share-tests');

		it('should relinquish the SSH connection', async function () {
			const client = await sshBridge(configDir);
			try {
				let result = await client.connect({
					username: 'testuser_share',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				expect(result.success).to.be.true;

				const shareKey = await client.share();
				expect(shareKey).to.be.a('string');
				expect(shareKey).to.match(/^[0-9a-f]{32}$/);

				result = await client.connect({
					username: 'testuser_share',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				expect(result.success).to.be.true;
			} finally {
				await client.close();
			}
		});

		it('should allow other clients to reuse the shared connection', async function () {
			const client = await sshBridge(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_share',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				expect(result.success).to.be.true;

				const shareKey = await client.share();
				expect(shareKey).to.be.a('string');
				expect(shareKey).to.match(/^[0-9a-f]{32}$/);

				const secondClient = await sshBridge(configDir);
				try {
					const result = await secondClient.reuse({
						username: 'testuser_share',
						hostname: '127.0.0.1',
						port: harness.getSSHPort(),
						shareKey,
					});

					expect(result.success).to.be.true;
					expect(result.banner).to.equal('hello!\r\n');
					expect(result.fingerprint).to.be.a('string');
					expect(result.fingerprint).to.match(/^[a-zA-Z0-9+/]+=*$/);
				} finally {
					await secondClient.close();
				}
			} finally {
				await client.close();
			}
		});

		it('should require a shareKey to reuse the shared connection', async function () {
			const client = await sshBridge(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_share',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				expect(result.success).to.be.true;

				const shareKey = await client.share();
				expect(shareKey).to.be.a('string');
				expect(shareKey).to.match(/^[0-9a-f]{32}$/);

				const secondClient = await sshBridge(configDir);
				try {
					const result = await secondClient.reuse({
						username: 'testuser_share',
						hostname: '127.0.0.1',
						port: harness.getSSHPort(),
					});

					expect(result.success).to.be.false;
					expect(result.reason).to.equal('no cached connection to reuse');
				} finally {
					await secondClient.close();
				}
			} finally {
				await client.close();
			}
		});

		it('should require the correct shareKey to reuse the shared connection', async function () {
			const client = await sshBridge(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_share',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				expect(result.success).to.be.true;

				const shareKey = await client.share();
				expect(shareKey).to.be.a('string');
				expect(shareKey).to.match(/^[0-9a-f]{32}$/);

				const secondClient = await sshBridge(configDir);
				try {
					const result = await secondClient.reuse({
						username: 'testuser_share',
						hostname: '127.0.0.1',
						port: harness.getSSHPort(),
						shareKey: shareKey + 'x',
					});

					expect(result.success).to.be.false;
					expect(result.reason).to.equal('no cached connection to reuse');
				} finally {
					await secondClient.close();
				}
			} finally {
				await client.close();
			}
		});

		it('should require the correct user/host/port to reuse a shared connection', async function () {
			const client = await sshBridge(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_share',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				expect(result.success).to.be.true;

				const shareKey = await client.share();
				expect(shareKey).to.be.a('string');
				expect(shareKey).to.match(/^[0-9a-f]{32}$/);

				const secondClient = await sshBridge(configDir);
				try {
					const result = await secondClient.reuse({
						username: 'testuser_share_2',
						hostname: '127.0.0.1',
						port: harness.getSSHPort(),
						shareKey,
					});

					expect(result.success).to.be.false;
					expect(result.reason).to.equal('no cached connection to reuse');
				} finally {
					await secondClient.close();
				}
			} finally {
				await client.close();
			}
		});

		it('should allow multiple shared connections to the same user/host/port', async function () {
			let shareKey1;
			let shareKey2;

			const client = await sshBridge(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_share',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				expect(result.success).to.be.true;

				shareKey1 = await client.share();
				expect(shareKey1).to.be.a('string');
				expect(shareKey1).to.match(/^[0-9a-f]{32}$/);
			} finally {
				await client.close();
			}

			const secondClient = await sshBridge(configDir);
			try {
				const result = await secondClient.connect({
					username: 'testuser_share',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				expect(result.success).to.be.true;

				shareKey2 = await secondClient.share();
				expect(shareKey2).to.be.a('string');
				expect(shareKey2).to.match(/^[0-9a-f]{32}$/);
			} finally {
				await secondClient.close();
			}

			const thirdClient = await sshBridge(configDir);
			try {
				const result = await thirdClient.reuse({
					username: 'testuser_share',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					shareKey: shareKey1,
				});

				expect(result.success).to.be.true;
			} finally {
				await thirdClient.close();
			}

			const fourthClient = await sshBridge(configDir);
			try {
				const result = await fourthClient.reuse({
					username: 'testuser_share',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					shareKey: shareKey2,
				});

				expect(result.success).to.be.true;
			} finally {
				await fourthClient.close();
			}

			expect(shareKey1).to.not.equal(shareKey2);
		});

		it('should reuse the shareKey each time the same SSH connection is shared', async function () {
			let shareKey;

			const client = await sshBridge(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_share',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				expect(result.success).to.be.true;

				shareKey = await client.share();
				expect(shareKey).to.be.a('string');
				expect(shareKey).to.match(/^[0-9a-f]{32}$/);
			} finally {
				await client.close();
			}

			const secondClient = await sshBridge(configDir);
			try {
				const result = await secondClient.reuse({
					username: 'testuser_share',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					shareKey,
				});

				expect(result.success).to.be.true;

				const secondShareKey = await secondClient.share();
				expect(secondShareKey).to.equal(shareKey);
			} finally {
				await secondClient.close();
			}
		});

		it('should not allow share() when the client is in an errored state', async function () {
			const client = await sshBridge(configDir);
			try {
				const result = await client.connect({
					username: 'testuser_share',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				expect(result.success).to.be.true;
			} finally {
				await client.close();
			}

			await expectReject(client.share() , TypeError, 'Client is closed');
		});

		it('should not allow share() in an invalid state', async function () {
			const client = await sshBridge(configDir);
			try {
				client.exec(shellEscape('node', '-e', 'console.log("Hello, World!")'));
				await expectReject(client.share(), TypeError, 'Method not available in the current state');
			} finally {
				await client.close();
			}
		});
	});

	describe('close()', function () {
		const configDir = harness.getConfigDir('close-tests');

		it('should cancel existing operations with CLOSED error', async function () {
			const client = await sshBridge(configDir);
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
			const client = await sshBridge(configDir);
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
			const client = await sshBridge(configDir);
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

	describe('resize()', function () {
		const configDir = harness.getConfigDir('resize-tests');

		it('should set the size of future PTYs before connecting', async function () {
			const client = await sshBridge(configDir);
			try {
				client.resize({ rows: 300, cols: 200 });

				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				const { stdout, result } = client.exec(shellEscape('node', '-e', 'const pty = require(process.env.PTY); console.log(`${pty.rows}, ${pty.cols}`)'), { pty: true });
				const { code, signal } = await result;
				const stdoutString = (await streamToBuffer(stdout)).toString();

				expect(code).to.equal(0);
				expect(signal).to.be.undefined;
				expect(stdoutString).to.equal('300, 200\n');
			} finally {
				await client.close();
			}
		});

		it('should set the size of future PTYs after connecting', async function () {
			const client = await sshBridge(configDir);
			try {
				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				client.resize({ rows: 310, cols: 210 });

				const { stdout, result } = client.exec(shellEscape('node', '-e', 'const pty = require(process.env.PTY); console.log(`${pty.rows}, ${pty.cols}`)'), { pty: true });
				const { code, signal } = await result;
				const stdoutString = (await streamToBuffer(stdout)).toString();

				expect(code).to.equal(0);
				expect(signal).to.be.undefined;
				expect(stdoutString).to.equal('310, 210\n');
			} finally {
				await client.close();
			}
		});

		it('should set the size of PTYs being created concurrently', async function () {
			this.slow(1000);
			const client = await sshBridge(configDir);
			try {
				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				const { stdout, result } = client.exec(shellEscape('node', '-e', 'setTimeout(() => { const pty = require(process.env.PTY); console.log(`${pty.rows}, ${pty.cols}`) }, 500)'), { pty: true });
				client.resize({ rows: 320, cols: 220 });

				const { code, signal } = await result;
				const stdoutString = (await streamToBuffer(stdout)).toString();

				expect(code).to.equal(0);
				expect(signal).to.be.undefined;
				expect(stdoutString).to.equal('320, 220\n');
			} finally {
				await client.close();
			}
		});

		it('should set the size of an active PTY', async function () {
			this.slow(1000);
			const client = await sshBridge(configDir);
			try {
				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				const { stdout, result } = client.exec(shellEscape('node', '-e', 'console.log("ready"); setTimeout(() => { const pty = require(process.env.PTY); console.log(`${pty.rows}, ${pty.cols}`) }, 500)'), { pty: true });

				let stdoutString = '';
				let stdoutEnded = false;
				stdout.on('data', (chunk) => { stdoutString += chunk.toString(); });
				stdout.on('end', () => { stdoutEnded = true });

				const loopLimit = Date.now() + 1000;
				for (;;) {
					await new Promise(r => setTimeout(r, 10));
					if (stdoutString === 'ready\n') {
						client.resize({ rows: 330, cols: 230 });
						break;
					} else if (Date.now() >= loopLimit) {
						throw new Error('Expected output was never detected');
					}
				}

				const { code, signal } = await result;
				expect(code).to.equal(0);
				expect(signal).to.be.undefined;
				expect(stdoutString).to.equal('ready\n330, 230\n');
				await new Promise(r => setImmediate(r));
				expect(stdoutEnded).to.be.true;
			} finally {
				await client.close();
			}
		});

		it('should always apply the last size, when called multiple times', async function () {
			this.slow(1000);
			const client = await sshBridge(configDir);
			try {
				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				const { stdout, result } = client.exec(shellEscape('node', '-e', 'setTimeout(() => { const pty = require(process.env.PTY); console.log(`${pty.rows}, ${pty.cols}`) }, 500)'), { pty: true });
				client.resize({ rows: 300, cols: 200 });
				client.resize({ rows: 350, cols: 250 });
				client.resize({ rows: 340, cols: 240 });

				const { code, signal } = await result;
				const stdoutString = (await streamToBuffer(stdout)).toString();

				expect(code).to.equal(0);
				expect(signal).to.be.undefined;
				expect(stdoutString).to.equal('340, 240\n');
			} finally {
				await client.close();
			}
		});

		it('should not change a dimension set to 0 or negative', async function () {
			const client = await sshBridge(configDir);
			try {
				client.resize({ rows: 360, cols: 260 });
				client.resize({ rows: 320, cols: 0 });
				client.resize({ rows: 370, cols: -1 });

				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				const { stdout, result } = client.exec(shellEscape('node', '-e', 'const pty = require(process.env.PTY); console.log(`${pty.rows}, ${pty.cols}`)'), { pty: true });
				const { code, signal } = await result;
				const stdoutString = (await streamToBuffer(stdout)).toString();

				expect(code).to.equal(0);
				expect(signal).to.be.undefined;
				expect(stdoutString).to.equal('370, 260\n');
			} finally {
				await client.close();
			}
		});

		it('should clamp dimensions to a maximum value of 512', async function () {
			const client = await sshBridge(configDir);
			try {
				client.resize({ rows: 1000, cols: 2000 });

				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				const { stdout, result } = client.exec(shellEscape('node', '-e', 'const pty = require(process.env.PTY); console.log(`${pty.rows}, ${pty.cols}`)'), { pty: true });
				const { code, signal } = await result;
				const stdoutString = (await streamToBuffer(stdout)).toString();

				expect(code).to.equal(0);
				expect(signal).to.be.undefined;
				expect(stdoutString).to.equal('512, 512\n');
			} finally {
				await client.close();
			}
		});

		it('should apply size changes even across multiple SSH connections', async function () {
			const client = await sshBridge(configDir);
			try {
				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				client.resize({ rows: 380, cols: 280 });

				{
					const { stdout, result } = client.exec(shellEscape('node', '-e', 'const pty = require(process.env.PTY); console.log(`${pty.rows}, ${pty.cols}`)'), { pty: true });
					const { code, signal } = await result;
					const stdoutString = (await streamToBuffer(stdout)).toString();

					expect(code).to.equal(0);
					expect(signal).to.be.undefined;
					expect(stdoutString).to.equal('380, 280\n');
				}

				const shareKey = await client.share();
				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				{
					const { stdout, result } = client.exec(shellEscape('node', '-e', 'const pty = require(process.env.PTY); console.log(`${pty.rows}, ${pty.cols}`)'), { pty: true });
					const { code, signal } = await result;
					const stdoutString = (await streamToBuffer(stdout)).toString();

					expect(code).to.equal(0);
					expect(signal).to.be.undefined;
					expect(stdoutString).to.equal('380, 280\n');
				}

				client.resize({ rows: 390, cols: 290 });
				await client.share();
				await client.reuse({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					shareKey,
				});

				{
					const { stdout, result } = client.exec(shellEscape('node', '-e', 'const pty = require(process.env.PTY); console.log(`${pty.rows}, ${pty.cols}`)'), { pty: true });
					const { code, signal } = await result;
					const stdoutString = (await streamToBuffer(stdout)).toString();

					expect(code).to.equal(0);
					expect(signal).to.be.undefined;
					expect(stdoutString).to.equal('390, 290\n');
				}

				{
					const { stdout, result } = client.exec(shellEscape('node', '-e', 'console.log(`${process.env.PTY}`)'));
					const { code, signal } = await result;
					const stdoutString = (await streamToBuffer(stdout)).toString();

					expect(code).to.equal(0);
					expect(signal).to.be.undefined;
					expect(stdoutString).to.equal('undefined\n');
				}
			} finally {
				await client.close();
			}
		});

		it('should do nothing if the client is already closed', async function () {
			const client = await sshBridge(configDir);
			try {
				await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'correct_password',
				});

				expect(client.closed).to.be.false;
				const closePromise = client.close();
				expect(client.closed).to.be.true;
				client.resize({ rows: 300, cols: 200 });
				expect(client.closed).to.be.true;
				await closePromise;
				expect(client.closed).to.be.true;
				client.resize({ rows: 300, cols: 200 });
				expect(client.closed).to.be.true;
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

async function streamToBuffer(stream) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		stream.on('data', (chunk) => chunks.push(chunk));
		stream.on('end', () => resolve(Buffer.concat(chunks)));
		stream.on('close', () => reject(new Error('Stream closed prematurely')));
		stream.on('error', reject);
	});
}
