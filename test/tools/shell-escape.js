'use strict';
const WIN32 = process.platform === 'win32';

module.exports = (...args) => {
	return args.map(String).map(escapeShellArg).join(' ');
};

function escapeShellArg(arg, index) {
	if (WIN32) {
		if (index > 0) { // On Windows, only quote args after the command name
			arg = `"${arg.replace(/(\\+)("|$)/g, '$1$1$2').replace(/"/g, '\\"')}"`;
		}
		return arg.replace(/[()%!^"<>&|;, ]/g, '^$&');
	} else {
		return `'${arg.replace(/'/g, '\'\\\'\'')}'`;
	}
}
