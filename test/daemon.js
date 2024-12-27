'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { expect } = require('chai');
const sshBridge = require('../src/lib/index');
const harness = require('./tools/harness');

describe('daemon', function () {
	const configDir = harness.getConfigDir('daemon-tests');

	it('should delete cached credentials when authentication fails', async function () {
		const client = await sshBridge(configDir);
		try {
			await harness.withSSHPassword('temp_password', async () => {
				// Connect to cache the credentials.
				const result = await client.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
					password: 'temp_password',
				});

				expect(result.success).to.be.true;
			});
		} finally {
			await client.close();
		}

		const secondClient = await sshBridge(configDir);
		try {
			// Fail to authenticate, invalidating the cached credentials.
			const result = await secondClient.connect({
				username: 'testuser',
				hostname: '127.0.0.1',
				port: harness.getSSHPort(),
			});

			expect(result.success).to.be.false;
			expect(result.reason).to.include('authentication denied');
		} finally {
			await secondClient.close();
		}

		const thirdClient = await sshBridge(configDir);
		try {
			await harness.withSSHPassword('temp_password', async () => {
				// Confirm that the cached credentials were deleted.
				const result = await thirdClient.connect({
					username: 'testuser',
					hostname: '127.0.0.1',
					port: harness.getSSHPort(),
				});

				expect(result.success).to.be.false;
				expect(result.reason).to.equal('no credentials provided');
			});
		} finally {
			await thirdClient.close();
		}
	});

	it('should clean up cached connections when they disconnect', async function () {
		const client = await sshBridge(configDir);
		try {
			// Connect to cache the connection.
			const result = await client.connect({
				username: 'testuser',
				hostname: '127.0.0.1',
				port: harness.getSSHPort(),
				password: 'correct_password',
				reusable: true,
			});

			expect(result.success).to.be.true;
		} finally {
			await client.close();
		}

		await harness.closeSSHConnections();

		const secondClient = await sshBridge(configDir);
		try {
			// Validate that there's no connection to reuse anymore.
			const result = await secondClient.reuse({
				username: 'testuser',
				hostname: '127.0.0.1',
				port: harness.getSSHPort(),
			});

			expect(result.success).to.be.false;
			expect(result.reason).to.include('no cached connection to reuse');
		} finally {
			await secondClient.close();
		}
	});

	it('should not reuse SSH connections that are not in a clean state', async function () {
		const sshConnectionCount = harness.getSSHConnectionCount();
		const client = await sshBridge(configDir);
		try {
			await client.connect({
				username: 'testuser',
				hostname: '127.0.0.1',
				port: harness.getSSHPort(),
				password: 'correct_password',
				reusable: true,
			});

			client.exec('sleep 10');
			expect(harness.getSSHConnectionCount()).to.equal(1 + sshConnectionCount);
		} finally {
			await client.close();
		}

		await new Promise(r => setTimeout(r, 100));
		expect(harness.getSSHConnectionCount()).to.equal(sshConnectionCount);
	});

	itUnix('should wait for pending commands to finish during graceful shutdown', async function () {
		const client = await sshBridge(configDir);
		try {
			await client.connect({
				username: 'testuser',
				hostname: '127.0.0.1',
				port: harness.getSSHPort(),
				password: 'correct_password',
			});

			const { stdout, result } = client.exec('sleep 1 && echo done');

			// Kill the daemon (gracefully).
			const lockPath = path.join(configDir, 'lock');
			const pid = fs.readFileSync(lockPath, 'utf8').trim();
			expect(pid).to.match(/^[0-9]+$/);
			process.kill(pid);

			// Wait for the daemon to exit.
			for (;;) {
				try {
					await new Promise(r => setTimeout(r, 10));
					process.kill(pid, 0);
				} catch (err) {
					if (err.code === 'ESRCH') break;
					throw err;
				}
			}

			const { code } = await result;
			const stdoutString = (await streamToBuffer(stdout)).toString();

			expect(code).to.equal(0);
			expect(stdoutString).to.equal('done\n');
		} finally {
			await client.close();
		}
	});
});

async function streamToBuffer(stream) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		stream.on('data', (chunk) => chunks.push(chunk));
		stream.on('end', () => resolve(Buffer.concat(chunks)));
		stream.on('close', () => reject(new Error('Stream closed prematurely')));
		stream.on('error', reject);
	});
}
