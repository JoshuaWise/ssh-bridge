'use strict';
const os = require('node:os');
const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline/promises');
const { program } = require('commander');
const { utils: { parseKey } } = require('ssh2');
const SSHBridge = require('../lib');

class UserError extends Error {}

/*
	TODO: test this module with interactive authentication
	TODO: write comment
 */

async function main(userHost, command, args, { reuse, port, key, auth = 'publickey', pty = false, showBanner = false }) {
	if (!command) {
		throw new UserError('error: command cannot be empty');
	}
	if (!/^[a-zA-Z_][a-zA-Z0-9._-]*@[a-z0-9][a-z0-9.-]*$/.test(userHost)) {
		throw new UserError('error: invalid user/host');
	}
	if (port !== undefined) {
		if (!/^[1-9][0-9]*$/.test(port)) {
			throw new UserError('error: invalid port');
		}

		port = Number.parseInt(port, 10);
		if (port > 65535) {
			throw new UserError('error: invalid port');
		}
	}
	if (!['publickey', 'password', 'keyboard-interactive'].includes(auth)) {
		throw new UserError('error: invalid auth type');
	}
	if (key !== undefined) {
		if (auth !== 'publickey') {
			throw new UserError('error: option \'-i, --key <path>\' is not allowed with that auth type');
		}
	}

	const [username, hostname] = userHost.split('@');
	const connectParams = { username, hostname, port };
	const client = await SSHBridge.connect();
	try {
		let connectInfo;
		if (reuse) {
			connectInfo = await client.reuse(connectParams);
		}

		if (!connectInfo?.success) {
			connectParams.reusable = reuse;
			connectInfo = await client.connect(connectParams);
		}

		if (!connectInfo.success) {
			let callback;
			if (auth === 'publickey') {
				connectParams.privateKey = await getPrivateKey(key);
				if (!isUnencryptedPrivateKey(connectParams.privateKey)) {
					connectParams.passphrase = await prompt('Passphrase: ');
				}
			} else if (auth === 'password') {
				connectParams.password = await prompt('Password: ');
			} else if (auth === 'keyboard-interactive') {
				if (!process.stdin.isTTY) {
					throw new UserError('error: auth type "keyboard-interactive" is only allowed in interactive mode');
				}
				callback = challengeHandler;
			} else {
				throw new TypeError('Unexpected auth type');
			}

			connectInfo = await client.connect(connectParams, callback);
			if (!connectInfo.success) {
				throw new UserError(`error: ${connectInfo.result.reason}`);
			}
		}

		if (showBanner && connectInfo.result.banner) {
			process.stderr.write(connectInfo.result.banner);
		}

		if (args.length) {
			command += ' ' + args.map(shellEscape).join(' ');
		}

		const { stdin, stdout, stderr, result } = client.exec(command, { pty });
		process.stdin.setRawMode?.(true);
		process.stdin.pipe(stdin);
		process.stdin.resume();
		stdout.pipe(process.stdout);
		stderr.pipe(process.stderr);
		process.on('SIGHUP', () => {});
		process.on('SIGINT', () => {});

		const { code, signal } = await result;
		if (signal) {
			process.exitCode = 130;
		} else if (code) {
			process.exitCode = code;
		}
	} finally {
		await client.close();
	}
}

async function getPrivateKey(filename) {
	if (filename !== undefined) {
		try {
			return await fs.readFile(filename, 'utf8');
		} catch (err) {
			if (err.syscall) throw new UserError(`error: ${err.message}`);
			throw err;
		}
	}

	const dirname = path.join(os.homedir(), '.ssh');
	for (const basename of ['id_ecdsa', 'id_ed25519', 'id_rsa']) {
		const filename = path.join(dirname, basename);
		try {
			return await fs.readFile(filename, 'utf8');
		} catch (err) {
			if (err.code === 'ENOENT') continue;
			if (err.syscall) throw new UserError(`error: ${err.message}`);
			throw err;
		}
	}

	throw new UserError('error: failed to locate your SSH private key');
}

function isUnencryptedPrivateKey(data) {
	try {
		parseKey(data);
		return true;
	} catch (_) {
		return false;
	}
}

async function challengeHandler({ instructions, prompts }) {
	console.warn(instructions);
	const responses = [];
	for (const { prompt: question } of prompts) {
		responses.push(await prompt(question));
	}
	return responses;
}

async function prompt(question) {
	if (!process.stdin.isTTY) {
		throw new UserError('error: missing credentials in non-interactive mode');
	}

	const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
	try {
		return await rl.question(question);
	} finally {
		rl.close();
	}
}

function shellEscape(str) {
	return `'${String(str).replace(/'/g, '\'\\\'\'')}'`;
}

program
	.name('ssh-bridge-exec')
	.description('A simple SSH client that uses ssh-bridge.')
	.argument('<user@host>', 'The user and hostname/IP of the remote machine.')
	.argument('<command>', 'The shell command to execute on the remote machine.')
	.argument('[arguments...]', 'Additional arguments to pass to the shell command.')
	.option('-r, --reuse', 'Allow this connection to be reused.')
	.option('-t, --pty', 'Run the command within a pseudo-TTY.')
	.option('-p, --port <number>', 'The remote port to connect to (default is 22).')
	.option('-i, --key <path>', 'The private key file to use for "publickey" authentication. By default, it uses the first file found at ~/.ssh/id_ecdsa, ~/.ssh/id_ed25519, or ~/.ssh/id_rsa (in that order).')
	.option('--auth <type>', 'The authentication type to use. Possible values are "publickey", "password", and "keyboard-interactive" (default is "publickey").')
	.option('--show-banner', 'Show the banner advertised by SSH server, if any.')
	.helpOption('-h, --help', 'Display help information.')
	.action(main)
	.parseAsync()
	.catch((err) => {
		switch (err.type) {
			case 'NO_SSH':
			case 'SSH_ERROR':
				throw new UserError(`error: ${err.reason || 'unknown error'}`);
			case 'NO_DAEMON':
				throw new UserError('error: connection to ssh-bridge daemon closed unexpectedly');
			case 'DAEMON_ERROR':
				throw new UserError(`error: daemon error (${err.reason || 'unknown error'})`);
			case 'PROTOCOL_ERROR':
				throw new UserError(`error: protocol error (${err.reason || 'unknown error'})`);
			case 'CHALLENGE_ERROR':
				throw new UserError('error: failed to generated challenge response');
			default:
				throw err;
		}
	})
	.catch((err) => {
		if (err instanceof UserError) {
			console.error(err.message);
			process.exitCode = 1;
		} else {
			throw err;
		}
	});
