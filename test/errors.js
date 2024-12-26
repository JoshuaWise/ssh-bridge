'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { expect } = require('chai');
const sshBridge = require('../src/lib/index');
const harness = require('./tools/harness');

describe('errors', function () {
	const configDir = harness.getConfigDir('error-tests');

	it('should produce NO_DAEMON error when no daemon is running', async function () {
		const client = await sshBridge(configDir);
		try {
			// Kill the daemon.
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

			const { result } = client.exec('echo test');
			await expectError(result, 'NO_DAEMON');
		} finally {
			await client.close();
		}
	});

	it('should produce NO_SSH error when SSH connection is closed unexpectedly', async function () {
		const client = await sshBridge(configDir);
		try {
			await client.connect({
				username: 'testuser',
				hostname: '127.0.0.1',
				port: harness.getSSHPort(),
				password: 'correct_password',
			});

			await harness.closeSSHConnections();

			const { result } = client.exec('echo test');
			await expectError(result, 'NO_SSH', 'remote connection closed unexpectedly');
		} finally {
			await client.close();
		}
	});

	it('should produce SSH_ERROR for a command that fails', async function () {
		const client = await sshBridge(configDir);
		try {
			await client.connect({
				username: 'testuser',
				hostname: '127.0.0.1',
				port: harness.getSSHPort(),
				password: 'correct_password',
			});

			const { result } = client.exec('<<TEST_COMMAND_THAT_ERRORS>>');
			await expectError(result, 'SSH_ERROR', 'unexpected error (Unable to exec)');
		} finally {
			await client.close();
		}
	});

	it('should produce DAEMON_ERROR for an errors emitted by the daemon', async function () {
		const client = await sshBridge(configDir);
		try {
			const promise = client.connect({});
			await expectError(promise, 'DAEMON_ERROR', 'malformed CONNECT parameters');
		} finally {
			await client.close();
		}
	});

	it('should produce PROTOCOL_ERROR for a protocol violation by the daemon');

	it('should produce CHALLENGE_ERROR for challengeHandler failure', async function () {
		const client = await sshBridge(configDir);
		try {
			const promise = client.connect({
				username: 'testuser',
				hostname: '127.0.0.1',
				port: harness.getSSHPort(),
			}, () => {
				throw new Error('Challenge failed');
			});

			await expectError(promise, 'CHALLENGE_ERROR');
		} finally {
			await client.close();
		}
	});

	it('should produce CLOSED error when the client is closed manually', async function () {
		const client = await sshBridge(configDir);
		try {
			await client.connect({
				username: 'testuser',
				hostname: '127.0.0.1',
				port: harness.getSSHPort(),
				password: 'correct_password',
			});

			const { result } = client.exec('sleep 10');
			await client.close();
			await expectError(result, 'CLOSED');
		} finally {
			await client.close();
		}
	});
});

async function expectError(promise, type, reason) {
	try {
		await promise;
	} catch (err) {
		expect(err.type).to.equal(type);
		expect(err.reason).to.equal(reason);
		return;
	}
	expect.fail('Expected promise to be rejected');
}
