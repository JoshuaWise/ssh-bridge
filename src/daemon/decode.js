'use strict';
const assert = require('node:assert');

const ValidationError = Symbol();

exports.decodeConnectRequest = (data) => {
	assert(Buffer.isBuffer(data));

	let obj;
	try {
		obj = JSON.parse(data.toString());
	} catch (_) {
		return null;
	}

	try {
		validate(isObject(obj));

		const {
			username,
			hostname,
			port = 22,
			fingerprint,
			privateKey,
			passphrase,
			password,
		} = obj;

		// TODO: what about keyboard-interactive auth?

		validate(isNonEmptyString(hostname));
		validate(isNonEmptyString(username));
		validate(isNonEmptyString(fingerprint) || fingerprint === undefined);
		validate(isNonEmptyString(privateKey) || privateKey === undefined);
		validate(isNonEmptyString(passphrase) || passphrase === undefined);
		validate(isNonEmptyString(password) || password === undefined);
		validate(Number.isInteger(port));
		validate(port > 0);
		validate(port < 65536);

		return {
			username,
			hostname,
			port,
			fingerprint,
			privateKey,
			passphrase,
			password,
		};
	} catch (err) {
		if (err === ValidationError) return null;
		throw err;
	}
};

exports.decodeCommand = (data) => {
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
