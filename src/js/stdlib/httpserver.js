/**
 * HTTP Server implementation for txiki.js using TCP sockets and llhttp parser
 * Following Node.js API style conventions
 */

import { EventEmitter } from 'eventemitter3';

const core = globalThis[Symbol.for('tjs.internal.core')];
const { LLHttp, TCP } = core;

/**
 * IncomingMessage represents the HTTP request received by the server.
 * This is similar to Node.js's http.IncomingMessage.
 */
export class IncomingMessage extends EventEmitter {
    constructor(socket) {
        super();
        this.socket = socket;
        this.headers = {};
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
export class ServerResponse extends EventEmitter {
    constructor(socket) {
        super();
        this.socket = socket;
        this.headersSent = false;
        this.finished = false;
        this.statusCode = 200;
        this.statusMessage = 'OK';
        this.headers = {};
        this._bodyChunks = [];
        this._shouldKeepAlive = true;
    }

    setHeader(name, value) {
        this.headers[name] = value;
        return this;
    }

    getHeader(name) {
        return this.headers[name];
    }

    removeHeader(name) {
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
            for (const [name, value] of Object.entries(headers)) {
                this.setHeader(name, value);
            }
        }

        this.headersSent = true;
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

        if (typeof chunk === 'string') {
            chunk = new TextEncoder().encode(chunk);
        }

        this._bodyChunks.push(chunk);

        if (callback) {
            setTimeout(callback, 0);
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

        // Send the response
        this._sendResponse();

        this.finished = true;

        if (callback) {
            setTimeout(callback, 0);
        }

        this.emit('finish');

        return this;
    }

    _sendResponse() {
        if (this.headersSent) {
            return;
        }

        // Create response using LLHttp utility
        const parser = new LLHttp();
        const body = this._bodyChunks.length > 0 
            ? new Uint8Array(this._bodyChunks.reduce((acc, chunk) => acc + chunk.length, 0))
            : new Uint8Array(0);

        // Concatenate all body chunks
        let offset = 0;
        for (const chunk of this._bodyChunks) {
            body.set(chunk, offset);
            offset += chunk.length;
        }

        // Convert body to string for createResponse
        const bodyStr = new TextDecoder().decode(body);
        
        const response = parser.createResponse(this.statusCode, this.headers, bodyStr);
        this.socket.write(new TextEncoder().encode(response));
        this.headersSent = true;
    }
}

/**
 * HTTP Server implementation
 */
export class Server extends EventEmitter {
    constructor(requestListener) {
        super();
        this._requestListener = requestListener;
        this._connections = new Set();
        this._listening = false;
        this._server = null;
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
                while (true) {
                    const clientHandle = await this._server.accept();
                    if (!clientHandle) break;
                    
                    this._connections.add(clientHandle);
                    
                    // Handle HTTP requests on this connection
                    this._handleConnection(clientHandle);
                }
            } catch (err) {
                console.error('Error accepting connections:', err);
            }
        };
        
        // Start accepting connections
        handleConnection();

        this._listening = true;
        this.emit('listening');
        if (callback) {
            callback();
        }

        return this;
    }

    close(callback) {
        if (!this._listening) {
            if (callback) {
                setTimeout(() => callback(new Error('Not running')), 0);
            }
            return this;
        }

        this._listening = false;
        
        // Close all connections
        for (const connection of this._connections) {
            connection.close();
        }
        this._connections.clear();

        // Close the server
        this._server.close(() => {
            this.emit('close');
            if (callback) {
                callback();
            }
        });

        return this;
    }

    _handleConnection(handle) {
        let buffer = '';
        const parser = new LLHttp('request');
        let currentRequest = null;
        let currentResponse = null;

        // Create a simple read loop
        const readLoop = async () => {
            try {
                const buf = new Uint8Array(65536);
                while (true) {
                    const nread = await handle.read(buf);
                    if (nread === null) {
                        // Connection closed
                        break;
                    }
                    
                    // Convert chunk to string and add to buffer
                    const chunk = new TextDecoder().decode(buf.subarray(0, nread));
                    buffer += chunk;
                    
                    // Process as much as possible
                    while (buffer.length > 0) {
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
                                const connectionHeader = (result.headers['Connection'] || result.headers['connection'] || '').toLowerCase();
                                currentResponse._shouldKeepAlive = 
                                    (result.httpMajor === 1 && result.httpMinor === 1 && connectionHeader !== 'close') ||
                                    (result.httpMajor === 1 && result.httpMinor === 0 && connectionHeader === 'keep-alive');
                                
                                // Emit the request event
                                this.emit('request', currentRequest, currentResponse);
                                
                                // Call the request listener if provided
                                if (this._requestListener) {
                                    this._requestListener(currentRequest, currentResponse);
                                }
                                
                                // Reset parser for next request
                                parser.reset();
                            }
                        } catch (err) {
                            // Handle parse errors
                            console.error('HTTP parse error:', err);
                            handle.close();
                            break;
                        }
                    }
                }
            } catch (err) {
                console.error('Error handling connection:', err);
            } finally {
                handle.close();
                this._connections.delete(handle);
            }
        };

        // Start the read loop
        readLoop();
    }
}

/**
 * Factory function to create an HTTP server
 */
export function createServer(requestListener) {
    return new Server(requestListener);
}