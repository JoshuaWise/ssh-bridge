'use strict';

module.exports = (...args) => {
	return args.map(String).map(escapeShellArg).join(' ');
};

function escapeShellArg(arg) {
	if (process.platform === 'win32') {
		arg = arg
			.replace(/\^/g, '^^')
			.replace(/([&()<>|])/g, '^$1')
			.replace(/"/g, '""');

		return `"${escaped}"`;
	} else {
		return `'${arg.replace(/'/g, '\'\\\'\'')}'`;
	}
}
