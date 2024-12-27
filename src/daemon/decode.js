'use strict';
const assert = require('node:assert');

const ValidationError = Symbol();

/*
	These functions are used to parse and validate the various data frames that
	are sent by the client and received by the daemon/server.
 */

exports.reuseParams = (data) => {
	assert(Buffer.isBuffer(data));
	try {
		const { username, hostname, port = 22 } = expectJSON(data);

		validate(isNonEmptyString(hostname));
		validate(isNonEmptyString(username));
		validate(isValidPort(port));

		return { username, hostname: hostname.toLowerCase(), port };
	} catch (err) {
		if (err === ValidationError) return null;
		throw err;
	}
};

exports.connectParams = (data) => {
	assert(Buffer.isBuffer(data));
	try {
		const {
			username,
			hostname,
			port = 22,
			fingerprint,
			reusable = false,
			privateKey,
			passphrase,
			password,
			tryKeyboard = false,
			privateKeyEncoded = false,
		} = expectJSON(data);

		validate(isNonEmptyString(hostname));
		validate(isNonEmptyString(username));
		validate(isValidPort(port));
		validate(isNonEmptyString(fingerprint) || fingerprint === undefined);
		validate(isNonEmptyString(privateKey) || privateKey === undefined);
		validate(isNonEmptyString(passphrase) || passphrase === undefined);
		validate(isNonEmptyString(password) || password === undefined);
		validate(typeof privateKeyEncoded === 'boolean');
		validate(typeof tryKeyboard === 'boolean');
		validate(typeof reusable === 'boolean');
		validate(!!privateKey || !passphrase);
		validate(!!privateKey || !privateKeyEncoded);

		return {
			username,
			hostname: hostname.toLowerCase(),
			port,
			fingerprint,
			reusable,
			privateKey: privateKeyEncoded ? Buffer.from(privateKey, 'base64') : privateKey,
			passphrase,
			password,
			tryKeyboard,
		};
	} catch (err) {
		if (err === ValidationError) return null;
		throw err;
	}
};

exports.challengeResponse = (data) => {
	assert(Buffer.isBuffer(data));
	try {
		const { responses } = expectJSON(data);

		validate(Array.isArray(responses));
		validate(responses.every(x => typeof x === 'string'));

		return responses;
	} catch (err) {
		if (err === ValidationError) return null;
		throw err;
	}
};

exports.command = (data) => {
	assert(Buffer.isBuffer(data));
	const str = data.toString();

	try {
		validate(isNonEmptyString(str));
		validate(!/[\x00-\x1f\x7f-\x9f]/.test(str)); // Control codes are not allowed
		return str;
	} catch (err) {
		if (err === ValidationError) return null;
		throw err;
	}
};

function validate(boolean) {
	if (!boolean) {
		throw ValidationError;
	}
}

function expectJSON(data) {
	let parsed;
	try {
		parsed = JSON.parse(data.toString());
	} catch (_) {
		throw ValidationError;
	}

	validate(isObject(parsed));
	return parsed;
}

function isObject(value) {
	if (value === null) return false;
	if (typeof value !== 'object') return false;
	if (Array.isArray(value)) return false;
	return true;
}

function isNonEmptyString(value) {
	if (typeof value !== 'string') return false;
	if (value === '') return false;
	return true;
}

function isValidPort(value) {
	if (!Number.isInteger(value)) return false;
	if (value <= 0) return false;
	if (value > 65535) return false;
	return true;
}
