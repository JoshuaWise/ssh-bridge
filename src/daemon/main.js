'use strict';
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { flockSync } = require('fs-ext');
const handler = require('./handler');
const pool = require('./pool');

/*
	TODO: write comment
 */

async function main() {
	const configDir = getConfigDir();
	initConfigDir(configDir);

	const lockPath = path.join(configDir, 'lock');
	const lock = acquireLock(lockPath);
	if (!lock) {
		return; // Some other process has the lock
	}

	let socketPath;
	if (process.platform === 'win32') {
		socketPath = path.join('\\\\?\\pipe', configDir, 'sock');
	} else {
		socketPath = path.join(configDir, 'sock');
		clearFile(socketPath); // There could be an abandoned Unix domain socket file
	}

	const server = net.createServer();
	const abortController = new AbortController();
	await new Promise((resolve, reject) => {
		server.on('connection', handler.bind(null, abortController.signal));
		server.on('listening', resolve);
		server.on('error', reject);
		server.listen(socketPath);
	});

	// Keep the server open until a termination signal is received.
	server.on('error', console.error);
	await new Promise((resolve) => {
		process.on('SIGHUP', resolve);
		process.on('SIGINT', resolve);
		process.on('SIGTERM', resolve);
	});

	// Gracefully shut down the server before exiting.
	await new Promise((resolve) => {
		server.close(resolve);
		abortController.abort();
		pool.clear();
		lock.unlock();
	});
}

function getConfigDir() {
	let configDir;
	let hidden = false;
	if (process.argv.length < 3) {
		configDir = os.homedir();
		hidden = true;
	} else if (process.argv.length === 3) {
		configDir = process.argv[2];
	} else {
		throw new RangeError('Unexpected command line arguments');
	}
	if (!configDir) {
		throw new TypeError('Invalid configuration directory');
	}

	configDir = path.resolve(configDir);
	if (!fs.statSync(configDir, { throwIfNoEntry: false })?.isDirectory()) {
		throw new TypeError('Configuration directory does not exist');
	}

	return path.join(configDir, `${hidden ? '.' : ''}ssh-bridge`);
}

function initConfigDir(configDir) {
	try {
		fs.mkdirSync(configDir, { mode: 0o700 });
	} catch (err) {
		if (err.code === 'EEXIST') return;
		throw err;
	}
}

function acquireLock(lockPath) {
	const fd = fs.openSync(lockPath, 'w', 0o600);
	try {
		flockSync(fd, 'exnb');
	} catch (err) {
		fs.closeSync(fd);
		if (err.code === 'EAGAIN') return null;
		throw err;
	}

	let closed = false;
	return {
		unlock() {
			if (!closed) {
				flockSync(fd, 'un');
				fs.closeSync(fd);
				closed = true;
			}
		},
	};
}

function clearFile(filename) {
	try {
		fs.unlinkSync(filename);
	} catch (err) {
		if (err.code === 'ENOENT') return;
		throw err;
	}
}

main();
