'use strict';
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { Server, utils: { generateKeyPairSync } } = require('ssh2');

const TEMP_DIR = path.join(__dirname, '..', '..', 'temp');
const originalSpawn = childProcess.spawn;
const trackedPIDs = new Set();
let sshServer = null;
let sshPort = null;

exports.getConfigDir = (label) => {
	const random = randomBytes(12).toString('hex');
	return path.join(TEMP_DIR, `${label || 'test'}-${random}`);
};

exports.getSSHPort = () => {
	return sshPort;
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
		sshServer = new Server({
			hostKeys: [generateKeyPairSync('rsa', { bits: 2048 }).private],
		}, (client) => {
			client.on('authentication', (ctx) => {
				if (ctx.method === 'password' && ctx.username === 'testuser' && ctx.password === 'password') {
					ctx.accept();
				} else {
					ctx.reject();
				}
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
				resolve();
			});
		});
	}
}
