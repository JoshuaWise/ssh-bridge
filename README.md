# ssh-bridge [![test](https://github.com/JoshuaWise/ssh-bridge/actions/workflows/test.yml/badge.svg)](https://github.com/JoshuaWise/ssh-bridge/actions/workflows/test.yml)

An SSH client for Node.js that transparently uses a background daemon to cache credentials and reuse connections.

## Installation

```
npm install ssh-bridge
```

> Requires Node.js v18.4.x or later.

# API

## sshBridge([*configDir*, [*daemonProcessTitle*]]) -> *Promise&lt;Client>*

Asynchronously returns a new client, which can be used to establish SSH connections and run commands via SSH.

If there's no `ssh-bridge` daemon running in the `configDir`, this function will spawn a new daemon before returning. By default, the `configDir` is `~/.ssh-bridge`. By default, the daemon's process title is `ssh-bridge`, but you can override this by passing `daemonProcessTitle`. Note that passing `daemonProcessTitle` does nothing if there's already a daemon running in `configDir`.

The returned client communicates with the daemon over a Unix domain socket (or a named pipe on Windows). The daemon process is the one responsible for making actual SSH connections. The daemon will continue running in the background even after the client program exits (this is how it's able to reuse cached credentials and connections, similar to [ssh-agent](https://linux.die.net/man/1/ssh-agent)). This library guarantees that only one daemon will be running at a time (for a given `configDir`). The fact that a background daemon exists is all mostly transparent (i.e., an implementation detail) from the perspective of someone using this library. However, if something goes wrong, you can view the daemon's logs at `<configDir>/log`.

### client.connect(*params*, [*challengeHandler*]) -> *Promise&lt;object>*

Asynchronously establishes a new SSH connection.

The following params are supported:

- `username` (string, required)
	* The remote username to use when establishing the SSH connection.
- `hostname` (string, required)
	* The remote hostname (or IP address) with which to establish the SSH connection.
- `port` (number, optional)
	* The SSH port to connect to. By default, port 22 is used.
- `fingerprint` (string, optional)
	* A base64 encoding of the sha256 hash of the remote host's key. If provided, it will be validated against the actual host's key while establishing the SSH connection. If the fingerprints don't match, the connection will be aborted with an error.
- `reusable` (boolean, optional)
	* If true, the established SSH connection will be eligible for reuse by other clients, after the current client is closed.
- `privateKey` (string, optional)
	* A private key to use to authenticate the SSH connection. The remote SSH server must have "publickey" authentication enabled.
- `passphrase` (string, optional)
	* If the given `privateKey` is encrypted, this passphrase must be provided to decrypt it.
- `password` (string, optional)
	* A password used to authenticate the SSH connection. The remote SSH server must have "password" authentication enabled.

If an SSH connection is successfully established, the returned object will have these properties:

- `success` (true)
- `fingerprint` (string)
- `banner` (string | null)

Otherwise, it will have these properties:

- `success` (false)
- `reason` (string)

#### Keyboard interactive authentication

If the remote server uses "keyboard-interactive" authentication, you can provide a `challengeHandler` function to authenticate. The `challengeHandler` receives an object with `title`, `instructions`, `language`, and `prompts`. These are all strings, except `prompts`, which is an array of objects of the form `{ prompt: 'Password: ', echo: false }` (here `echo` indicates if the user's input should be displayed on the screen). The `challengeHandler` may be an async function, and it should return an array of strings (one for each prompt), representing the user's responses to the provided prompts. The server may decide to come back with more prompts, so the `challengeHandler` could be invoked more than once.

#### Using cached credentials

In general, a `privateKey`, `password`, or `challengeHandler` must be provided for authentication purposes. However, if the `ssh-bridge` daemon had previously facilitated a connection to the same username/hostname/port, it may have cached credentials available. You can optimistically try connecting via cached credentials by omitting `privateKey`, `password`, and `challengeHandler`. If authentication fails, then you should fall back to providing your own credentials. This workflow can alleviate the user from needing to manually enter credentials every time. Note that the daemon never caches credentials for the "keyboard-interactive" authentication method (only the "publickey" and "password" authentication methods are cached).

### client.reuse(*params*) -> *Promise&lt;object>*

Asynchronously assigns a cached SSH connection to the client. This is effectively the same as `client.connect()`, except it tries to reuse a cached connection instead of establishing a new one. An SSH connection will only be cached if it was created by passing `reusable: true` to `client.connect()`. Before an SSH connection is cached, the original client that established the connection must be closed (because an SSH connection can only be assigned to one client at a time). The `ssh-bridge` daemon only maintains a maximum of one cached connection per hostname/username/port combo. Cached connections are automatically closed after being unused for 12 hours (this may be configurable in the future).

The following params are supported:

- `username` (string, required)
- `hostname` (string, required)
- `port` (number, optional)

If an SSH connection is successfully established, the returned object will have these properties:

- `success` (true)
- `fingerprint` (string)
- `banner` (string | null)

Otherwise, it will have these properties:

- `success` (false)
- `reason` (string)

### client.exec(*command*, [*options*]) -> *object*

Invokes a command over the client's SSH connection. This can only be used after successfully acquiring an SSH connnection with `client.connect()` or `client.reuse()`. Only one command can be executed at a time (for the same client). The command string must not contain any control characters (including tabs or line-feeds).

The returned object has these properties:

- `stdin` ([stream.Writable](https://nodejs.org/api/stream.html#writable-streams))
- `stdout` ([stream.Readable](https://nodejs.org/api/stream.html#readable-streams))
- `stderr` ([stream.Readable](https://nodejs.org/api/stream.html#readable-streams))
- `result` (Promise&lt;{ code?: number, signal?: string }>)

The `result` promise will resolve when the remote command exits. If it exited normally, `code` will the exit code of the remote process. Otherwise, if the remote process was terminated by a signal, `signal` will be the name of that signal (e.g., `SIGTERM`). You can communicate with the remote process's I/O streams via `stdin`, `stdout`, and `stderr`.

### client.close() -> *Promise&lt;void>*

Closes the client. If there's an open SSH connection, it will also be closed (or cached). After calling this, the client can no longer be used. The client will immediately enter a "closed" state (i.e., `client.closed` will return `true`), but the promise returned by this function will not resolve until the underlying connection to the daemon is fully cleaned up.

Note that you can close the client while running a command. In this case, the SSH connection will indeed be closed, but it's up the SSH server whether the command will be terminated or continue running (e.g., on Linux, this behavior is usually controlled by `KillUserProcesses` in `/etc/systemd/logind.conf`).

### *getter* client.closed -> *boolean*

Returns `true` if the client is closed. The client can be closed manually by calling `client.close()`, but it may also be closed unexpectedly if a fatal error is thrown by some other operation. A closed client cannot be used for any purpose (if reconnection is desired, a new client must be created).

## License

[MIT](https://github.com/JoshuaWise/ssh-bridge/blob/master/LICENSE)
