'use strict';
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { flockSync } = require('fs-ext');
const handler = require('./handler');
const pool = require('./pool');

/*
	This the ssh-bridge daemon. Only one such daemon can be running at a time,
	so we use OS-level file locking to ensure that. The daemon starts a Unix
	domain socket server (or a named pipe server on Windows), allowing local
	clients to run SSH commands while using the daemon as a middle-man. The
	purpose of the daemon is to cache SSH credentials and allow clients to reuse
	SSH connections, improving the user experience for SSH clients.
 */

async function main() {
	const configDir = getConfigDir();
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

	// Start the local server.
	const server = net.createServer();
	const abortController = new AbortController();
	await new Promise((resolve, reject) => {
		server.on('connection', handler.bind(null, abortController.signal));
		server.on('listening', resolve);
		server.on('error', reject);
		server.listen(socketPath);
	});

	// Keep the server open until a termination signal is received.
	console.warn('Ready to accept local clients.');
	server.on('error', console.error);
	await new Promise((resolve) => {
		process.on('SIGHUP', resolve);
		process.on('SIGINT', resolve);
		process.on('SIGTERM', resolve);
	});

	// Gracefully shut down the server before exiting.
	console.warn('Shutting down...');
	await new Promise((resolve) => {
		server.close(resolve); // Stop accepting new clients
		abortController.abort(); // Gracefully shut down existing clients
		pool.clear(); // Close all cached SSH connections
		lock.unlock(); // Allow other daemons to start up
	});

	console.warn('Shutdown complete.');
}

function getConfigDir() {
	const configDir = process.argv[2];
	if (!configDir) {
		throw new TypeError('No configuration directory was specified');
	}
	if (!path.isAbsolute(configDir)) {
		throw new TypeError('Configuration directory must be an absolute path');
	}
	if (!fs.statSync(configDir, { throwIfNoEntry: false })?.isDirectory()) {
		throw new TypeError('Configuration directory does not exist');
	}
	return configDir;
}

function acquireLock(lockPath) {
	let locked = false;
	const flags = fs.constants.O_RDWR | fs.constants.O_CREAT;
	const fd = fs.openSync(lockPath, flags, 0o600);
	try {
		flockSync(fd, 'exnb');
		locked = true;
		fs.ftruncateSync(fd);
		fs.writeFileSync(fd, `${process.pid}\n`);
	} catch (err) {
		fs.closeSync(fd);
		if (!locked && err.code === 'EAGAIN') return null;
		throw err;
	}

	let closed = false;
	return {
		unlock() {
			if (!closed) {
				fs.ftruncateSync(fd);
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
