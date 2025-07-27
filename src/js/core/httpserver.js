/**
 * HTTP Server implementation for txiki.js using TCP sockets and llhttp parser
 * Following Node.js API style conventions
 */

const core = globalThis[Symbol.for('tjs.internal.core')];
const { LLHttp, TCP } = core;

// Simple event emitter implementation to reduce bundle size
class TinyEmitter {
    constructor() {
        this._events = Object.create(null);
    }

    on(event, listener) {
        if (typeof listener !== 'function') {
            throw new TypeError('Listener must be a function');
        }

        const events = this._events;
        
        if (!events[event]) {
            events[event] = [];
        }

        events[event].push(listener);
        
        return this;
    }

    once(event, listener) {
        const self = this;
        
        function onceListener() {
            self.removeListener(event, onceListener);
            listener.apply(this, arguments);
        }

        onceListener.listener = listener;
        
        return this.on(event, onceListener);
    }

    removeListener(event, listener) {
        const events = this._events;
        
        if (!events[event] || !listener) {
            return this;
        }

        const listeners = events[event];
        const index = listeners.findIndex(l => l === listener || l.listener === listener);
        
        if (index !== -1) {
            listeners.splice(index, 1);
        }

        return this;
    }

    emit(event) {
        const events = this._events;
        
        if (!events[event]) {
            return false;
        }

        const listeners = events[event].slice(); // Create a copy
        const args = Array.prototype.slice.call(arguments, 1);

        for (let i = 0; i < listeners.length; i++) {
            listeners[i].apply(this, args);
        }

        return true;
    }
}

// Polyfill for setImmediate
const setImmediate = globalThis.setImmediate || function(fn) {
    setTimeout(fn, 0);
};

/**
 * IncomingMessage represents the HTTP request received by the server.
 * This is similar to Node.js's http.IncomingMessage.
 */
export class IncomingMessage extends TinyEmitter {
    constructor(socket) {
        super();
        this.socket = socket;
        this.headers = Object.create(null);
        this.method = '';
        this.url = '';
        this.httpVersion = '1.1';
        this.httpVersionMajor = 1;
        this.httpVersionMinor = 1;
        this.complete = false;
        this._body = '';
    }

    get connection() {
        return this.socket;
    }

    get statusCode() {
        // For requests, this doesn't apply, but keeping for compatibility
        return undefined;
    }

    get statusMessage() {
        // For requests, this doesn't apply, but keeping for compatibility
        return undefined;
    }
}

/**
 * ServerResponse represents the HTTP response sent by the server.
 * This is similar to Node.js's http.ServerResponse.
 */
export class ServerResponse extends TinyEmitter {
    constructor(socket) {
        super();
        this.socket = socket;
        this.headersSent = false;
        this.finished = false;
        this.statusCode = 200;
        this.statusMessage = 'OK';
        this.headers = Object.create(null);
        this._bodyChunks = [];
        this._bodyLength = 0;
        this._shouldKeepAlive = true;
        // 移除 _processing 标志以完全兼容 Node.js 行为
        // Node.js 不会自动结束响应，而是由开发者显式调用 end()
    }

    setHeader(name, value) {
        if (this.headersSent) {
            throw new Error('Headers already sent');
        }
        
        this.headers[name] = value;
        
        return this;
    }

    getHeader(name) {
        return this.headers[name];
    }

    removeHeader(name) {
        if (this.headersSent) {
            throw new Error('Headers already sent');
        }

        delete this.headers[name];
        
        return this;
    }

    writeHead(statusCode, statusMessage, headers) {
        if (this.headersSent) {
            throw new Error('Headers already sent');
        }

        this.statusCode = statusCode;

        if (typeof statusMessage === 'string') {
            this.statusMessage = statusMessage;
        } else if (typeof statusMessage === 'object' && statusMessage !== null) {
            headers = statusMessage;
        }

        if (headers) {
            for (const [ name, value ] of Object.entries(headers)) {
                this.setHeader(name, value);
            }
        }

        return this;
    }

    write(chunk, encoding, callback) {
        if (this.finished) {
            throw new Error('Response already finished');
        }

        if (typeof encoding === 'function') {
            callback = encoding;
            encoding = null;
        }

        let buffer;
        
        if (typeof chunk === 'string') {
            buffer = new TextEncoder().encode(chunk);
        } else if (chunk instanceof Uint8Array) {
            buffer = chunk;
        } else {
            throw new TypeError('Chunk must be a string or Uint8Array');
        }

        this._bodyChunks.push(buffer);
        this._bodyLength += buffer.length;

        if (callback) {
            setImmediate(callback);
        }

        return true;
    }

    end(data, encoding, callback) {
        if (this.finished) {
            return this;
        }

        if (typeof data === 'function') {
            callback = data;
            data = null;
        } else if (typeof encoding === 'function') {
            callback = encoding;
            encoding = null;
        }

        if (data) {
            this.write(data, encoding);
        }

        // Mark as finished before sending response
        this.finished = true;

        // Send the response
        this._sendResponse();

        if (callback) {
            setImmediate(callback);
        }

        this.emit('finish');

        return this;
    }

    _sendResponse() {
        // Ensure headers are sent
        if (!this.headersSent) {
            // Set Content-Length if not already set
            if (!this.headers['Content-Length'] && !this.headers['content-length']) {
                this.setHeader('Content-Length', this._bodyLength);
            }

            this.headersSent = true;
        }

        try {
            // Efficiently concatenate body chunks
            let body;
            
            if (this._bodyChunks.length === 0) {
                body = new Uint8Array(0);
            } else if (this._bodyChunks.length === 1) {
                body = this._bodyChunks[0];
            } else {
                body = new Uint8Array(this._bodyLength);
                let offset = 0;
                
                for (const chunk of this._bodyChunks) {
                    body.set(chunk, offset);
                    offset += chunk.length;
                }
            }

            // Convert body to string
            const bodyStr = new TextDecoder().decode(body);

            // Create HTTP response manually to ensure proper format
            let response = `HTTP/1.1 ${this.statusCode} ${this.statusMessage}\r\n`;

            // Add headers
            for (const [ name, value ] of Object.entries(this.headers)) {
                response += `${name}: ${value}\r\n`;
            }

            // End of headers
            response += '\r\n';

            // Add body if present
            if (bodyStr) {
                response += bodyStr;
            }

            const encoded = new TextEncoder().encode(response);

            const writePromise = this.socket.write(encoded);

            writePromise
                .then(() => {
                    // Close connection if not keep-alive
                    if (!this._shouldKeepAlive) {
                        this.socket.close();
                    }
                    this.emit('close');
                })
                .catch(err => {
                    // Ignore common socket errors
                    if (!this._isCommonSocketError(err)) {
                        console.error('Failed to write response:', err);
                    }
                    this.socket.close();
                });
        } catch (err) {
            console.error('Failed to create response:', err);
            this.socket.close();
        }
    }

    _isCommonSocketError(err) {
        const msg = err.message || '';
        
        return msg.includes('ECONNRESET') || 
               msg.includes('EPIPE') || 
               msg.includes('ECONNABORTED') ||
               msg.includes('EINVAL');
    }
}

/**
 * HTTP Server implementation
 */
export class Server extends TinyEmitter {
    constructor(requestListener, options = {}) {
        super();
        this._requestListener = requestListener;
        this._connections = new Set();
        this._listening = false;
        this._server = null;
        this._debug = !!options.debug;
    }

    listen(port, hostname, backlog, callback) {
        if (typeof hostname === 'function') {
            callback = hostname;
            hostname = undefined;
        } else if (typeof backlog === 'function') {
            callback = backlog;
            backlog = undefined;
        }

        hostname = hostname || '0.0.0.0';
        port = port || 0;

        // Create TCP server
        this._server = new TCP();

        // Bind to address
        this._server.bind({ ip: hostname, port });

        // Listen for connections
        this._server.listen(backlog || 511);

        // Handle incoming connections
        const handleConnection = async () => {
            try {
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    try {
                        const clientHandle = await this._server.accept();

                        if (!clientHandle) {
                            break;
                        }

                        this._connections.add(clientHandle);

                        // Handle HTTP requests on this connection
                        this._handleConnection(clientHandle);
                    } catch (err) {
                        // Ignore common connection errors but log others
                        if (!this._isCommonConnectionError(err)) {
                            console.error('Connection error:', err);
                        }

                        // Break loop on certain errors
                        if (err.name === 'AbortError' || (err.message && err.message.includes('closed'))) {
                            break;
                        }
                    }
                }
            } catch (err) {
                console.error('Server fatal error:', err);
                this.close();
            }
        };

        // Start accepting connections
        handleConnection();

        this._listening = true;
        this.emit('listening');

        if (callback) {
            setImmediate(callback);
        }

        return this;
    }

    close(callback) {
        if (!this._listening) {
            if (callback) {
                setImmediate(() => callback(new Error('Not running')));
            }
            return this;
        }

        this._listening = false;

        // Close all connections
        for (const connection of this._connections) {
            try {
                connection.close();
            } catch (err) {
                // Ignore errors when closing
            }
        }

        this._connections.clear();

        // Close the server
        if (this._server) {
            this._server.close(() => {
                this.emit('close');

                if (callback) {
                    callback();
                }
            });
        } else if (callback) {
            setImmediate(callback);
        }

        return this;
    }

    _handleConnection(handle) {
        let buffer = '';
        const parser = new LLHttp('request', {
            lenient: true,
            allowCustomMethods: true,
        });
        let currentRequest = null;
        let currentResponse = null;
        let connectionClosed = false;

        // Create a simple read loop
        const readLoop = async () => {
            try {
                const buf = new Uint8Array(65536);

                // eslint-disable-next-line no-constant-condition
                while (!connectionClosed) {
                    try {
                        const nread = await handle.read(buf);

                        if (nread === null) {
                            // Connection closed
                            connectionClosed = true;
                            break;
                        }

                        // Convert chunk to string and add to buffer
                        const chunk = new TextDecoder().decode(buf.subarray(0, nread));
                        buffer += chunk;

                        // Process as much as possible
                        while (buffer.length > 0 && !connectionClosed) {
                            try {
                                const processed = parser.execute(buffer);

                                // If we processed some data, remove it from buffer
                                if (processed > 0) {
                                    buffer = buffer.substring(processed);
                                }

                                // Check if we have a complete message
                                const result = parser.getResult();

                                if (result.complete) {
                                    // Create request and response objects
                                    currentRequest = new IncomingMessage(handle);
                                    currentRequest.headers = result.headers;
                                    currentRequest.method = result.method;
                                    currentRequest.url = result.url;
                                    currentRequest.httpVersion = `${result.httpMajor}.${result.httpMinor}`;
                                    currentRequest.httpVersionMajor = result.httpMajor;
                                    currentRequest.httpVersionMinor = result.httpMinor;
                                    currentRequest._body = result.body;

                                    currentResponse = new ServerResponse(handle);

                                    // Determine if we should keep the connection alive
                                    const connectionHeader = (
                                        result.headers['Connection'] ||
                                        result.headers['connection'] ||
                                        ''
                                    ).toLowerCase();

                                    currentResponse._shouldKeepAlive =
                                        (result.httpMajor === 1 &&
                                         result.httpMinor === 1 &&
                                         connectionHeader !== 'close') ||
                                        (result.httpMajor === 1 &&
                                         result.httpMinor === 0 &&
                                         connectionHeader === 'keep-alive');

                                    try {
                                        // Emit the request event
                                        this.emit('request', currentRequest, currentResponse);

                                        // Call the request listener if provided
                                        if (this._requestListener) {
                                            this._requestListener(currentRequest, currentResponse);
                                        }

                                        // Node.js 不会自动结束响应，移除 txiki.js 特有的自动结束机制
                                        // 确保与 Node.js 行为完全兼容
                                    } catch (err) {
                                        // Ignore errors in request handlers but log them
                                        if (this._debug) {
                                            console.error('Request handler error:', err);
                                        }

                                        // 与 Node.js 保持一致，不自动发送错误响应
                                        // 开发者需要在自己的请求处理函数中处理错误
                                    }

                                    // Reset parser for next request if connection is kept alive
                                    if (currentResponse._shouldKeepAlive) {
                                        parser.reset();
                                    } else {
                                        connectionClosed = true;
                                        break;
                                    }
                                } else {
                                    // No complete message yet, break inner loop to read more data
                                    break;
                                }
                            } catch (err) {
                                // Handle parse errors
                                if (this._debug) {
                                    const shouldLog = !err.message.includes('HPE_INVALID_METHOD') &&
                                                    !err.message.includes('HPE_INVALID_VERSION');
                                    
                                    if (shouldLog) {
                                        console.error(
                                            'HTTP parse error:',
                                            err,
                                            '\nBuffer:',
                                            buffer
                                        );
                                    }
                                }

                                connectionClosed = true;
                                handle.close();
                                this._connections.delete(handle);
                                return;
                            }
                        }
                    } catch (err) {
                        // Ignore common socket errors
                        if (!this._isCommonSocketError(err)) {
                            console.error('Socket error:', err);
                        }

                        connectionClosed = true;
                        break;
                    }
                }
            } catch (err) {
                if (this._debug) {
                    console.error('Connection handler error:', err);
                }
            } finally {
                try {
                    if (!connectionClosed) {
                        handle.close();
                    }
                } catch (err) {
                    // Ignore close errors
                }

                this._connections.delete(handle);
            }
        };

        // Start the read loop
        readLoop();
    }

    _isCommonConnectionError(err) {
        const msg = err.message || '';
        
        return msg.includes('ECONNRESET') || 
               msg.includes('EPIPE') || 
               msg.includes('ECONNABORTED') ||
               msg.includes('EINVAL');
    }

    _isCommonSocketError(err) {
        const msg = err.message || '';
        
        return msg.includes('ECONNRESET') || 
               msg.includes('EPIPE') || 
               msg.includes('ECONNABORTED') ||
               msg.includes('EINVAL');
    }
}

/**
 * Factory function to create an HTTP server
 */
export function createServer(requestListener) {
    return new Server(requestListener);
}