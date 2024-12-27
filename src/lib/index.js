'use strict';
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { utils: { parseKey } } = require('ssh2');
const createClient = require('./create-client');

const NODE = process.execPath;
const DAEMON = path.join(__dirname, '..', 'daemon', 'index.js');
const POLL_TIMEOUT_MS = 2000;
const POLL_SLEEP_MS = 10;

/*
	This creates and returns a new client of the ssh-bridge daemon. The client
	can be used to run SSH commands, with the ssh-bridge daemon as a middle-man.
	If necessary, a new daemon will be spawned.
 */

module.exports = async (configDir, daemonProcessTitle = '') => {
	if (typeof daemonProcessTitle !== 'string') {
		throw new TypeError('Expected daemonProcessTitle to be a string, if provided');
	}

	configDir = await initConfigDir(configDir);

	let socketPath;
	if (process.platform === 'win32') {
		socketPath = path.join('\\\\?\\pipe', configDir, 'sock');
	} else {
		socketPath = path.join(configDir, 'sock');
	}

	let socket = await connect(socketPath);
	if (!socket) {
		await spawnDaemon(configDir, daemonProcessTitle);

		const timeout = process.hrtime.bigint() + BigInt(POLL_TIMEOUT_MS * 1e6);
		while (!(socket = await connect(socketPath))) {
			if (process.hrtime.bigint() >= timeout) {
				throw new Error('Unable to connect to the ssh-bridge daemon');
			}

			await sleep(POLL_SLEEP_MS);
		}
	}

	return createClient(socket);
};

// Export parseKey, so clients can determine if SSH keys are encrypted or not.
module.exports.parseKey = parseKey;

// By default, the config directory will be "~/.ssh-bridge", but any directory
// can be specified. The config directory's parent directory MUST already exist.
async function initConfigDir(configDir) {
	if (configDir === undefined) {
		configDir = path.join(os.homedir(), '.ssh-bridge');
	}
	if (typeof configDir !== 'string') {
		throw new TypeError('Expected configDir to be a string');
	}
	if (!configDir) {
		throw new TypeError('Expected configDir to be a non-empty string');
	}

	configDir = path.resolve(configDir);

	try {
		await fs.promises.mkdir(configDir, { mode: 0o700 });
	} catch (err) {
		if (err.code !== 'EEXIST') {
			throw err;
		}
	}

	return configDir;
}

// Whenever we spawn the daemon, we redirect its stdout and stderr to a log file
// within the configuration directory. To prevent the daemon from truncating
// previous logs, we pass it an open file descriptor in append-only mode.
async function spawnDaemon(configDir, daemonProcessTitle) {
	const fd = await new Promise((resolve, reject) => {
		fs.open(path.join(configDir, 'log'), 'a', 0o600, (err, fd) => {
			if (err != null) reject(err);
			else resolve(fd);
		});
	});

	try {
		await new Promise((resolve, reject) => {
			const child = spawn(NODE, [DAEMON, configDir, daemonProcessTitle], {
				cwd: os.homedir(),
				stdio: ['ignore', fd, fd],
				detached: true,
				windowsHide: true,
			});
			const onSpawn = () => {
				child.removeListener('spawn', onSpawn);
				child.removeListener('error', onError);
				child.unref();
				resolve();
			};
			const onError = (err) => {
				child.removeListener('spawn', onSpawn);
				child.removeListener('error', onError);
				reject(err);
			};
			child.on('spawn', onSpawn);
			child.on('error', onError);
		});
	} finally {
		await new Promise((resolve, reject) => {
			fs.close(fd, (err) => {
				if (err != null) reject(err);
				else resolve();
			});
		});
	}
}

async function connect(socketPath) {
	return new Promise((resolve, reject) => {
		const socket = net.connect(socketPath);
		const onConnect = () => {
			socket.removeListener('connect', onConnect);
			socket.removeListener('error', onError);
			resolve(socket);
		};
		const onError = (err) => {
			socket.removeListener('connect', onConnect);
			socket.removeListener('error', onError);
			if (err.code === 'ECONNREFUSED') resolve(null);
			else if (err.code === 'ENOENT') resolve(null);
			else reject(err);
		};
		socket.on('connect', onConnect);
		socket.on('error', onError);
	});
}

async function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
