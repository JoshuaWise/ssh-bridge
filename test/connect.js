'use strict';
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { expect } = require('chai');
const { connect } = require('../src/lib/index');
const harness = require('./tools/harness');

describe('connect()', function () {
    it('should throw an error if configDir is not a string', async function () {
        await expectReject(connect(123), TypeError, 'Expected configDir to be a string');
    });

    it('should throw an error if configDir cannot be created', async function () {
        const invalidConfigDir = '/invalid/path/to/config';
        await expectReject(connect(invalidConfigDir), Error, /no such file or directory/);
    });

    it('should throw an error if daemonProcessTitle is not a string', async function () {
        const configDir = harness.getConfigDir('invalid-title-test');
        await expectReject(connect(configDir, 123), TypeError, 'Expected daemonProcessTitle to be a string, if provided');
    });

    it('should spawn a new daemon if one does not already exist', async function () {
        const configDir = harness.getConfigDir('spawn-daemon-test');
        const daemonSocket = path.join(configDir, 'sock'); // TODO: what about windows?
        const lockPath = path.join(configDir, 'lock');

        const isDaemonRunning = () => new Promise((resolve) => {
            const socket = net.connect(daemonSocket);
            socket.on('connect', () => { socket.destroy(); resolve(true); });
            socket.on('error', () => resolve(false));
        });

        // Ensure the daemon is NOT running.
        expect(await isDaemonRunning()).to.be.false;
        expect(fs.existsSync(daemonSocket)).to.be.false;
        expect(fs.existsSync(lockPath)).to.be.false;

        const client = await connect(configDir);
        try {
            // Ensure the daemon is running.
            expect(await isDaemonRunning()).to.be.true;
            expect(fs.existsSync(daemonSocket)).to.be.true;
            expect(fs.existsSync(lockPath)).to.be.true;
        } finally {
            await client.close();
        }
    });

    it('should not spawn a new daemon if one already exists', async function () {
        const configDir = harness.getConfigDir('reuse-daemon-test');

        // Spawn the first client (this starts the daemon).
        const firstClient = await connect(configDir);
        try {
            // Record the daemon's PID.
            const lockPath = path.join(configDir, 'lock');
            const pid = fs.readFileSync(lockPath, 'utf8').trim();
            expect(pid).to.match(/^[0-9]+$/);

            // Spawn a second client.
            const secondClient = await connect(configDir);
            try {
                // Verify the daemon PID has not changed.
                const newPid = fs.readFileSync(lockPath, 'utf8').trim();
                expect(newPid).to.equal(pid);
            } finally {
                await secondClient.close();
            }
        } finally {
            await firstClient.close();
        }
    });

    it('should write logs to the daemon log file', async function () {
        const configDir = harness.getConfigDir('log-test');
        const logPath = path.join(configDir, 'log');

        expect(fs.existsSync(logPath)).to.be.false;

        const client = await connect(configDir);
        try {
            expect(fs.existsSync(logPath)).to.be.true;

            // Ensure logs are not empty.
            const logContents = fs.readFileSync(logPath, 'utf8');
            expect(logContents).to.not.be.empty;
        } finally {
            await client.close();
        }
    });

    it('should append to the daemon log file without truncation', async function () {
        const configDir = harness.getConfigDir('append-log-daemon-test');
        const logPath = path.join(configDir, 'log');

        // Spawn the first daemon by creating a client.
        const firstClient = await connect(configDir);
        await firstClient.close();

        // Kill the first daemon.
        const lockPath = path.join(configDir, 'lock');
        const pid = fs.readFileSync(lockPath, 'utf8').trim();
        expect(pid).to.match(/^[0-9]+$/);
        process.kill(pid);

        // Wait for the first daemon to exit.
        for (;;) {
            try {
                await new Promise(r => setTimeout(r, 10));
                process.kill(pid, 0);
            } catch (err) {
                if (err.code === 'ESRCH') break;
                throw err;
            }
        }

        const logsAfterFirstDaemon = fs.readFileSync(logPath, 'utf8');

        // Spawn a second daemon by creating a new client.
        const secondClient = await connect(configDir);
        await secondClient.close();

        // Kill the second daemon.
        const newPid = fs.readFileSync(lockPath, 'utf8').trim();
        expect(newPid).to.match(/^[0-9]+$/);
        expect(newPid).to.not.equal(pid);
        process.kill(newPid);

        // Wait for the second daemon to exit.
        for (;;) {
            try {
                await new Promise(r => setTimeout(r, 10));
                process.kill(newPid, 0);
            } catch (err) {
                if (err.code === 'ESRCH') break;
                throw err;
            }
        }

        const logsAfterSecondDaemon = fs.readFileSync(logPath, 'utf8');

        // Ensure the log size has increased, indicating logs were appended.
        expect(logsAfterSecondDaemon.length).to.be.greaterThan(logsAfterFirstDaemon.length);
        expect(logsAfterSecondDaemon.startsWith(logsAfterFirstDaemon)).to.be.true;
    });

    it('should create the custom configDir if it does not exist', async function () {
        const configDir = harness.getConfigDir('create-config-dir-test');

        // Ensure the directory does not exist.
        expect(fs.existsSync(configDir)).to.be.false;

        const client = await connect(configDir);
        try {
            // Verify the directory was created.
            expect(fs.existsSync(configDir)).to.be.true;
            expect(fs.statSync(configDir).isDirectory()).to.be.true;
        } finally {
            await client.close();
        }
    });

    it('should handle an already existing custom configDir', async function () {
        const configDir = harness.getConfigDir('existing-config-dir-test');
        fs.mkdirSync(configDir, { recursive: true });

        const client = await connect(configDir);
        try {
            // Verify no errors were thrown and the directory still exists.
            expect(fs.existsSync(configDir)).to.be.true;
            expect(fs.statSync(configDir).isDirectory()).to.be.true;
        } finally {
            await client.close();
        }
    });

    it('should allow a custom daemonProcessTitle to be provided', async function () {
        const configDir = harness.getConfigDir('custom-title-test');
        const customTitle = 'ssh-bridge-custom-title';

        const client = await connect(configDir, customTitle);
        try {
            const lockPath = path.join(configDir, 'lock');
            const pid = fs.readFileSync(lockPath, 'utf8').trim();
            expect(pid).to.match(/^[0-9]+$/);

            // Verify the daemon process title.
            const command = `ps -p ${pid} -o comm=`; // TODO: what about windows?
            const daemonTitle = execSync(`bash -c '${command}'`).toString().trim();
            expect(daemonTitle).to.equal(customTitle);
        } finally {
            await client.close();
        }
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
