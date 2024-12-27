'use strict';

module.exports = (...args) => {
	return args.map(String).map(escapeShellArg).join(' ');
};

function escapeShellArg(arg) {
	if (process.platform === 'win32') {
		return `"${arg.replace(/(["\\])/g, '\\$1')}"`;
	} else {
		return `'${arg.replace(/'/g, '\'\\\'\'')}'`;
	}
}
