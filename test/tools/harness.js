'use strict';
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { Server, utils: { generateKeyPairSync, parseKey } } = require('ssh2');

const TEMP_DIR = path.join(__dirname, '..', '..', 'temp');
const originalSpawn = childProcess.spawn;
const trackedPIDs = new Set();
let sshServer = null;
let sshPort = null;
let sshKey = null;
let sshKeyEncrypted = null;

exports.getConfigDir = (label) => {
	const random = randomBytes(12).toString('hex');
	return path.join(TEMP_DIR, `${label || 'test'}-${random}`);
};

exports.getSSHPort = () => {
	return sshPort;
};

exports.getSSHKey = () => {
	return sshKey;
};

exports.getSSHKeyEncrypted = () => {
	return sshKeyEncrypted;
};

exports.mochaHooks = {
	async beforeAll() {
		fs.rmSync(TEMP_DIR, { recursive: true, force: true });
		fs.mkdirSync(TEMP_DIR);
		sshPort = await startSSHServer();
	},
	async afterAll() {
		try {
			terminateTrackedProcesses();
			fs.rmSync(TEMP_DIR, { recursive: true, force: true });
			await stopSSHServer();
		} finally {
			childProcess.spawn = originalSpawn;
		}
	},
};

childProcess.spawn = function spawn(...args) {
	const child = originalSpawn.apply(this, args);
	if (child && child.pid) {
		trackedPIDs.add(child.pid);
	}
	return child;
};

function terminateTrackedProcesses() {
	for (const pid of trackedPIDs) {
		try {
			process.kill(pid, 'SIGKILL');
		} catch (err) {
			if (err.code !== 'ESRCH') {
				console.warn(`Failed to terminate spawned process: ${pid} (${err.message})`);
			}
		}
	}

	trackedPIDs.clear();
}

async function startSSHServer() {
	return new Promise((resolve, reject) => {
		const allowedKey = generateKeyPairSync('rsa', { bits: 2048 });
		const allowedKeyEncrypted = generateKeyPairSync('rsa', { bits: 2048, cipher: 'aes256-cbc', passphrase: 'correct_passphrase' });
		const allowedKeys = [
			parseKey(allowedKey.public),
			parseKey(allowedKeyEncrypted.public, 'correct_passphrase'),
		];

		sshKey = allowedKey.private;
		sshKeyEncrypted = allowedKeyEncrypted.private;

		sshServer = new Server({
			hostKeys: [generateKeyPairSync('rsa', { bits: 2048 }).private],
			banner: 'hello!',
		}, (client) => {
			client.on('error', () => {});
			client.on('authentication', (ctx) => {
				switch (ctx.method) {
					case 'password':
						if (ctx.password !== 'correct_password') {
							return ctx.reject();
						}
						break
					case 'publickey':
						if (!allowedKeys.some((key) => (
							ctx.key.algo === key.type
							&& ctx.key.data.equals(key.getPublicSSH())
							&& (!ctx.signature || key.verify(ctx.blob, ctx.signature, ctx.hashAlgo) === true)
						))) {
							return ctx.reject();
						}
						break;
					case 'keyboard-interactive':
						ctx.prompt([
							{ prompt: 'favorite color?', echo: true },
							{ prompt: 'favorite number?', echo: false },
						], '', 'Please answer the following question(s):', (responses) => {
							if (responses[0] === 'blue' && responses[1] === '42') {
								ctx.prompt([
									{ prompt: 'are you sure?', echo: true },
								], '', 'Please answer the following question(s):', (responses) => {
									if (responses[0] === 'yes') {
										ctx.accept();
									} else {
										ctx.reject();
									}
								});
							} else {
								ctx.reject();
							}
						});
						return;
					default:
						return ctx.reject();
				}

				ctx.accept();
			});

			client.on('ready', () => {
				client.on('session', (accept) => {
					const session = accept();
					session.on('exec', (accept, reject, info) => {
						const stream = accept();
						stream.write(`Output of command: ${info.command}\n`);
						stream.exit(0);
						stream.end();
					});
				});
			});
		});

		sshServer.listen(0, '127.0.0.1', () => {
			resolve(sshServer.address().port);
		});

		sshServer.on('error', reject);
	});
}

async function stopSSHServer() {
	if (sshServer) {
		await new Promise((resolve, reject) => {
			sshServer.close((err) => {
				if (err) return reject(err);
				sshServer = null;
				sshPort = null;
				sshKey = null;
				sshKeyEncrypted = null;
				resolve();
			});
		});
	}
}