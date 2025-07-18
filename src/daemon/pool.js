'use strict';
const assert = require('node:assert');
const { randomBytes } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { Client, utils: { parseKey } } = require('ssh2');

/*
	This module maintains a pool of cached SSH connections and credentials, and
	provides all the necessary interfaces needed to interact with the SSH layer.
 */

const SHARED_CONNECTIONS_TTL = 1000 * 5; // 5 seconds
const CACHED_CONNECTIONS_TTL = 1000 * 60 * 60 * 12; // 12 hours
const cachedConnections = new Map();
const cachedCredentials = new Map();

exports.clear = () => {
	for (const [cacheKey, ssh] of cachedConnections) {
		cachedConnections.delete(cacheKey);
		ssh.relinquish(false);
	}
};

exports.reuse = ({ username, hostname, port, shareKey }, emitter) => {
	let cacheKey = getCacheKey(username, hostname, port);
	if (shareKey) {
		cacheKey = getExtendedCacheKey(cacheKey, shareKey);
	}

	const ssh = cachedConnections.get(cacheKey);
	if (ssh) {
		cachedConnections.delete(cacheKey);
		emitter.emit('connected', ssh._reuse(emitter));
		return ssh;
	} else {
		emitter.emit('unconnected', 'no cached connection to reuse');
		return null;
	}
};

exports.connect = ({ username, hostname, port, fingerprint, reusable, ...auth }, emitter) => {
	const cacheKey = getCacheKey(username, hostname, port);
	const connection = new Client();

	if (auth.privateKey && parseKey(auth.privateKey, auth.passphrase) instanceof Error) {
		if (auth.password || auth.tryKeyboard) {
			auth.privateKey = undefined;
			auth.passphrase = undefined;
		} else {
			emitter.emit('unconnected', 'authentication denied');
			return null;
		}
	}

	let reusingCredentials = false;
	if (!auth.privateKey && !auth.password && !auth.tryKeyboard) {
		if (cachedCredentials.has(cacheKey)) {
			auth = cachedCredentials.get(cacheKey);
			reusingCredentials = true;
		} else {
			emitter.emit('unconnected', 'no credentials provided');
			return null;
		}
	}

	let fingerprintMismatch = null;
	const checkFingerprint = (receivedFingerprint) => {
		receivedFingerprint = Buffer.from(receivedFingerprint, 'hex').toString('base64');
		if (!fingerprint) {
			fingerprint = receivedFingerprint;
			return true;
		} else if (fingerprint === receivedFingerprint) {
			return true;
		} else {
			fingerprintMismatch = { expected: fingerprint, received: receivedFingerprint };
			return false;
		}
	};

	let hadChallenges = false;
	let challengeCallbacks = [];
	connection.on('keyboard-interactive', (title, instructions, language, prompts, cb) => {
		hadChallenges = true;
		challengeCallbacks.push(cb);
		emitter.emit('challenge', { title, instructions, language, prompts });
	});

	let banner = null;
	connection.on('banner', (message) => {
		banner = message.endsWith('\n') ? message : message + '\n';
	});

	let connectInfo = null;
	connection.on('ready', () => {
		connectInfo = { fingerprint, banner };
		emitter.emit('connected', connectInfo);
		challengeCallbacks = [];
		banner = null;

		if (!reusingCredentials && !hadChallenges) {
			cachedCredentials.set(cacheKey, { ...auth, tryKeyboard: false });
		}
	});

	let done = false;
	// TODO: make sure the SSH connection is always closed after the "error" event (before or after "connected")
	connection.on('error', (err) => {
		if (done) return;
		done = true;
		emitter.emit(connectInfo ? 'disconnected' : 'unconnected', toErrorMessage(err, fingerprintMismatch));
		challengeCallbacks = [];
		banner = null;

		if (reusingCredentials && !connectInfo && err.level === 'client-authentication') {
			if (cachedCredentials.get(cacheKey) === auth) {
				cachedCredentials.delete(cacheKey);
			}
		}
	});

	connection.on('close', () => {
		if (done) return;
		done = true;
		emitter.emit(connectInfo ? 'disconnected' : 'unconnected', 'remote connection closed unexpectedly');
		challengeCallbacks = [];
		banner = null;
	});

	connection.setNoDelay(true);
	connection.connect({
		host: hostname,
		port: port,
		username: username,
		readyTimeout: 10000,
		keepaliveInterval: 10000,
		keepaliveCountMax: 3,
		hostHash: 'sha256',
		hostVerifier: checkFingerprint,
		...auth,
	});

	let shareKey = null;
	let ttlTimer = null;
	let liveChannel = null;
	let queuedInputData = [];
	let queuedInputEnd = false;
	let queuedResize = null;
	let hasPTY = false;
	return {
		challengeResponse(responses) {
			if (challengeCallbacks.length) {
				(challengeCallbacks.shift())(responses);
			}
		},
		exec(command, pty) {
			hasPTY = !!pty;
			connection.exec(command, { pty }, (error, channel) => {
				if (error != null) {
					queuedInputData = [];
					queuedInputEnd = false;
					queuedResize = null;
					hasPTY = false;
					reusable = false; // Don't reuse connections that have SSH-level errors
					emitter.emit('result', { error: toErrorMessage(error) });
					return;
				}

				if (queuedResize) {
					const { rows, cols } = queuedResize;
					channel.setWindow(rows, cols, 480, 640);
				}
				for (const data of queuedInputData) {
					channel.write(data);
				}
				if (queuedInputEnd) {
					channel.end();
				}

				liveChannel = channel;
				queuedInputData = [];
				queuedInputEnd = false;
				queuedResize = null;

				channel.on('close', (code, signal) => {
					liveChannel = null;
					hasPTY = false;
					if (error != null) {
						reusable = false; // Don't reuse connections that have SSH-level errors
						emitter.emit('result', { error: toErrorMessage(error) });
					} else {
						if (code === null) code = undefined;
						if (signal === null) signal = undefined;
						emitter.emit('result', { code, signal });
					}
				});

				channel.on('error', (err) => {
					if (error == null) error = err;
				});

				channel.stderr.on('error', (err) => {
					if (error == null) error = err;
				});

				channel.on('data', (data) => {
					emitter.emit('stdout', data);
				});

				channel.stderr.on('data', (data) => {
					emitter.emit('stderr', data);
				});
			});
		},
		writeStdin(data) {
			if (liveChannel) {
				if (liveChannel.writable) {
					liveChannel.write(data);
				}
			} else if (!queuedInputEnd) {
				queuedInputData.push(data);
			}
		},
		endStdin() {
			if (liveChannel) {
				if (liveChannel.writable) {
					liveChannel.end();
				}
			} else {
				queuedInputEnd = true;
			}
		},
		resize(rows, cols) {
			if (hasPTY) {
				if (liveChannel) {
					liveChannel.setWindow(rows, cols, 480, 640);
				} else {
					queuedResize = { rows, cols };
				}
			}
		},
		relinquish(reuse = false) {
			if (reuse !== 'SHARE' && (!reuse || !reusable)) {
				connection.end();
				return;
			}

			let key = cacheKey;
			let ttl = CACHED_CONNECTIONS_TTL;
			if (reuse === 'SHARE') {
				if (!shareKey) shareKey = randomBytes(16).toString('hex');
				key = getExtendedCacheKey(cacheKey, shareKey);
				ttl = SHARED_CONNECTIONS_TTL;
			}

			const cleanup = () => {
				clearTimeout(ttlTimer);
				if (cachedConnections.get(key) === this) {
					cachedConnections.delete(key);
				}
			};

			cachedConnections.get(key)?.relinquish(false);
			cachedConnections.set(key, this);
			emitter = new EventEmitter();
			emitter.once('disconnected', cleanup);
			ttlTimer = setTimeout(() => { cleanup(); connection.end(); }, ttl);

			if (reuse === 'SHARE') {
				return shareKey;
			}
		},
		_reuse(newEmitter) {
			emitter = newEmitter;
			clearTimeout(ttlTimer);
			return connectInfo;
		},
	};
};

function getCacheKey(username, hostname, port) {
	return [
		Buffer.from(username).toString('base64'),
		Buffer.from(hostname).toString('base64'),
		String(port),
	].join('\n');
}

function getExtendedCacheKey(cacheKey, shareKey) {
	assert(cacheKey);
	assert(shareKey);
	return `${cacheKey}\n${shareKey}`;
}

function toErrorMessage(err, fingerprintMismatch) {
	switch (err.level) {
		case 'handshake':
			if (fingerprintMismatch) {
				return `host fingerprint has changed\nWARNING: You could be getting hacked! Contact an administrator immediately!\n    expected fingerprint: ${fingerprintMismatch.expected}\n    received fingerprint: ${fingerprintMismatch.received}`;
			}
			return `SSH handshake failed${getErrorMessage(err)}`;
		case 'client-socket':
			return `connection error${getErrorMessage(err)}`;
		case 'client-timeout':
			return 'connection timed out';
		case 'client-authentication':
			return 'authentication denied';
		case 'client-dns':
			return `DNS lookup failed${getErrorMessage(err)}`;
		default:
			console.error(err);
			return `unexpected error${getErrorMessage(err)}`;
	}
}

function getErrorMessage(err) {
	let message = err.message;
	if (!message && err instanceof AggregateError) {
		message = err.errors.findLast(x => x.message)?.message;
	}
	return message ? ` (${message})` : '';
}
