# HTTP Server API for txiki.js

This module provides an HTTP server implementation for txiki.js that follows Node.js API conventions.

## Usage

```javascript
import { createServer } from 'tjs:httpserver';

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello World\n');
});

server.listen(3000, '127.0.0.1', () => {
  console.log('Server running at http://127.0.0.1:3000/');
});
```

## API

### createServer([requestListener])

- `requestListener` {Function} - A function that will be added as a listener for the 'request' event.
- Returns: {Server}

Creates a new HTTP server.

### Class: Server

This class inherits from `EventEmitter`.

#### Event: 'close'

Emitted when the server closes.

#### Event: 'connection'

- `socket` {Object} - The connection object.

Emitted when a new TCP connection is established.

#### Event: 'error'

- `error` {Error}

Emitted when an error occurs.

#### Event: 'listening'

Emitted when the server has been bound after calling `server.listen()`.

#### Event: 'request'

- `request` {IncomingMessage}
- `response` {ServerResponse}

Emitted each time there is a request.

#### server.listen(port[, hostname][, backlog][, callback])

- `port` {number} - Port to listen on.
- `hostname` {string} - Hostname to bind to.
- `backlog` {number} - The maximum length of the queue of pending connections.
- `callback` {Function} - Called when the server is listening.

Starts the HTTP server listening for connections.

#### server.close([callback])

- `callback` {Function} - Called when the server is closed.

Stops the server from accepting new connections.

### Class: IncomingMessage

This class inherits from `EventEmitter`. It represents the HTTP request received by the server.

#### message.headers

An object containing the HTTP headers of the request.

#### message.httpVersion

The HTTP version sent by the client.

#### message.method

The HTTP method used for the request.

#### message.url

The request URL.

### Class: ServerResponse

This class inherits from `EventEmitter`. It represents the HTTP response sent by the server.

#### response.setHeader(name, value)

Sets a single header value.

#### response.getHeader(name)

Returns the current value of a header.

#### response.removeHeader(name)

Removes a header that has been set.

#### response.writeHead(statusCode[, statusMessage][, headers])

Sends the HTTP response header.

#### response.write(chunk[, encoding][, callback])

Sends a chunk of the response body.

#### response.end([data[, encoding]][, callback])

Finishes sending the response.