#!/usr/bin/env node
'use strict';

process.title = 'ssh-bridge-exec';
process.stdout.on('error', supressEPIPE);
process.stderr.on('error', supressEPIPE);
require('./main');

// If we write to stdout/stderr but then the socket disconnects before the data
// is written, then an EPIPE error occurs. It doesn't seem like there's a way to
// avoid it, since it can occur even when process.stdout.writable === true.
// Therefore, we just ignore such errors. This should only happen if the user
// closes the terminal (or something similar to that), which means they no
// longer care about the output anyways.
function supressEPIPE(err) {
	if (err?.syscall !== 'write' || err.code !== 'EPIPE') {
		throw err;
	}
}
