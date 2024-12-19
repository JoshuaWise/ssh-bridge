'use strict';
const { program } = require('commander');

/*
	TODO: write comment
 */

async function main(userHost, command, args) {
	// TODO: implement cli
}

program
	.name('ssh-bridge-exec')
	.description('A simple SSH client that uses ssh-bridge.')
	.argument('<user@host>', 'The user and hostname/IP of the remote machine.')
	.argument('<command>', 'The shell command to execute on the remote machine.')
	.argument('[arguments...]', 'Additional arguments to pass to the shell command.')
	.helpOption('-h, --help', 'Display help information.')
	.action(main)
	.parseAsync();
