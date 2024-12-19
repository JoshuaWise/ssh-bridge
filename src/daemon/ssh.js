'use strict';

exports.connect = ({ username, hostname, port, fingerprint, ...auth }, callback) => {
	// TODO: if credentials were omitted, return a cached connection (if one exists) for this username+hostname+port
	// TODO: otherwise, try to connect using each of the provided auth methods
	// TODO: all connections are registered, and are either "in use" or "idle"
};
