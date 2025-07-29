// Batch processing for better CPU utilization
// 减小批处理大小以减少内存峰值(从16减到4)
const BATCH_SIZE = 4;

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
        const index = listeners.findIndex(
            l => l === listener || l.listener === listener
        );

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

    removeAllListeners() {
        this._events = Object.create(null);

        return this;
    }

    // Add missing EventTarget methods for better compatibility
    addListener(event, listener) {
        return this.on(event, listener);
    }

    off(event, listener) {
        return this.removeListener(event, listener);
    }
}

// Object pools for reuse
const objectPool = {
    incomingMessages: [],
    serverResponses: [],
    parsers: [],

    getIncomingMessage(socket) {
        const msg = this.incomingMessages.pop();

        if (msg) {
            msg.socket = socket;
            msg.headers = Object.create(null);
            msg.method = '';
            msg.url = '';
            msg.httpVersion = '1.1';
            msg.httpVersionMajor = 1;
            msg.httpVersionMinor = 1;
            msg.complete = false;
            msg._body = '';

            return msg;
        }

        return new IncomingMessage(socket);
    },

    releaseIncomingMessage(msg) {
        // 大幅减小池大小以更积极地控制内存(从32减到8)
        if (this.incomingMessages.length < 8) {
            // 清理可能的循环引用
            if (msg.socket) {
                // 删除对当前请求的引用
                if (msg.socket._currentRequest === msg) {
                    delete msg.socket._currentRequest;
                }
                msg.socket = null;
            }
            
            // 清理请求体
            msg._body = '';
            
            // 清理头部信息
            msg.headers = Object.create(null);
            
            // 清理事件监听器
            try {
                msg.removeAllListeners();
            } catch (e) {
                // 忽略错误
            }
            
            this.incomingMessages.push(msg);
        } else {
            // 如果池已满，确保清理所有引用
            if (msg.socket) {
                if (msg.socket._currentRequest === msg) {
                    delete msg.socket._currentRequest;
                }
                msg.socket = null;
            }
            msg._body = '';
            msg.headers = Object.create(null);
            try {
                msg.removeAllListeners();
            } catch (e) {
                // 忽略错误
            }
        }
    },

    getServerResponse(socket) {
        const res = this.serverResponses.pop();

        if (res) {
            res.socket = socket;
            res.headersSent = false;
            res.finished = false;
            res.statusCode = 200;
            res.statusMessage = 'OK';
            res.headers = Object.create(null);
            res._bodyChunks.length = 0;
            res._bodyLength = 0;
            res._shouldKeepAlive = true;

            return res;
        }

        return new ServerResponse(socket);
    },

    releaseServerResponse(res) {
        // 大幅减小池大小以更积极地控制内存(从32减到8)
        if (this.serverResponses.length < 8) {
            // 清理可能的循环引用
            if (res.socket) {
                // 删除对请求的引用
                if (res.socket._currentRequest) {
                    objectPool.releaseIncomingMessage(res.socket._currentRequest);
                    delete res.socket._currentRequest;
                }
                res.socket = null;
            }
            
            // 清理响应体数据
            res._bodyChunks.length = 0;
            res._bodyLength = 0;
            
            // 清理头部信息
            res.headers = Object.create(null);
            
            // 重置状态
            res.headersSent = false;
            res.finished = false;
            res.statusCode = 200;
            res.statusMessage = 'OK';
            res._shouldKeepAlive = true;
            
            // 清理事件监听器
            try {
                res.removeAllListeners();
            } catch (e) {
                // 忽略错误
            }
            
            this.serverResponses.push(res);
        } else {
            // 如果池已满，确保清理所有引用
            if (res.socket) {
                if (res.socket._currentRequest) {
                    objectPool.releaseIncomingMessage(res.socket._currentRequest);
                    delete res.socket._currentRequest;
                }
                res.socket = null;
            }
            
            // 清理响应体数据
            res._bodyChunks.length = 0;
            res._bodyLength = 0;
            
            // 清理头部信息
            res.headers = Object.create(null);
            
            // 重置状态
            res.headersSent = false;
            res.finished = false;
            res.statusCode = 200;
            res.statusMessage = 'OK';
            res._shouldKeepAlive = true;
            
            // 清理事件监听器
            try {
                res.removeAllListeners();
            } catch (e) {
                // 忽略错误
            }
        }
    },

    getParser() {
        const parser = this.parsers.pop();

        if (parser) {
            try {
                parser.reset();
            } catch (e) {
                // 如果重置失败，创建新的解析器
                return new LLHttp('request', {
                    lenient: true,
                    allowCustomMethods: true,
                });
            }

            return parser;
        }

        return new LLHttp('request', {
            lenient: true,
            allowCustomMethods: true,
        });
    },

    releaseParser(parser) {
        // 大幅减小池大小以更积极地控制内存(从16减到4)
        if (this.parsers.length < 4) {
            try {
                parser.reset();
                this.parsers.push(parser);
            } catch (e) {
                // 如果重置失败，不将解析器放回池中
                // 这样会在下次需要时创建新的解析器
            }
        }
    },
};

// Shared TextEncoder/Decoder instances
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Status code to message mapping
export const STATUS_CODES = {
    100: 'Continue',
    101: 'Switching Protocols',
    102: 'Processing',
    103: 'Early Hints',
    200: 'OK',
    201: 'Created',
    202: 'Accepted',
    203: 'Non-Authoritative Information',
    204: 'No Content',
    205: 'Reset Content',
    206: 'Partial Content',
    207: 'Multi-Status',
    208: 'Already Reported',
    226: 'IM Used',
    300: 'Multiple Choices',
    301: 'Moved Permanently',
    302: 'Found',
    303: 'See Other',
    304: 'Not Modified',
    305: 'Use Proxy',
    307: 'Temporary Redirect',
    308: 'Permanent Redirect',
    400: 'Bad Request',
    401: 'Unauthorized',
    402: 'Payment Required',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    406: 'Not Acceptable',
    407: 'Proxy Authentication Required',
    408: 'Request Timeout',
    409: 'Conflict',
    410: 'Gone',
    411: 'Length Required',
    412: 'Precondition Failed',
    413: 'Payload Too Large',
    414: 'URI Too Long',
    415: 'Unsupported Media Type',
    416: 'Range Not Satisfiable',
    417: 'Expectation Failed',
    418: 'I\'m a Teapot',
    421: 'Misdirected Request',
    422: 'Unprocessable Entity',
    423: 'Locked',
    424: 'Failed Dependency',
    425: 'Too Early',
    426: 'Upgrade Required',
    428: 'Precondition Required',
    429: 'Too Many Requests',
    431: 'Request Header Fields Too Large',
    451: 'Unavailable For Legal Reasons',
    500: 'Internal Server Error',
    501: 'Not Implemented',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
    505: 'HTTP Version Not Supported',
    506: 'Variant Also Negotiates',
    507: 'Insufficient Storage',
    508: 'Loop Detected',
    509: 'Bandwidth Limit Exceeded',
    510: 'Not Extended',
    511: 'Network Authentication Required',
};

// Common headers cache
const COMMON_HEADERS = {
    'content-type': 'Content-Type',
    'content-length': 'Content-Length',
    connection: 'Connection',
    'keep-alive': 'Keep-Alive',
    host: 'Host',
    'user-agent': 'User-Agent',
    accept: 'Accept',
    'accept-encoding': 'Accept-Encoding',
    'accept-language': 'Accept-Language',
    'cache-control': 'Cache-Control',
    date: 'Date',
    server: 'Server',
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

    removeAllListeners() {
        this._events = Object.create(null);

        return this;
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
        this.statusMessage = STATUS_CODES[200];
        this.headers = Object.create(null);
        this._bodyChunks = [];
        this._bodyLength = 0;
        this._shouldKeepAlive = true;
    }

    setHeader(name, value) {
        if (this.headersSent) {
            throw new Error('Headers already sent');
        }

        // Normalize header name
        const normalizedName = COMMON_HEADERS[name.toLowerCase()] || name;

        this.headers[normalizedName] = value;

        return this;
    }

    getHeader(name) {
        const normalizedName = COMMON_HEADERS[name.toLowerCase()] || name;

        return this.headers[normalizedName];
    }

    removeHeader(name) {
        if (this.headersSent) {
            throw new Error('Headers already sent');
        }

        const normalizedName = COMMON_HEADERS[name.toLowerCase()] || name;

        delete this.headers[normalizedName];

        return this;
    }

    getHeaderNames() {
        return Object.keys(this.headers);
    }

    hasHeader(name) {
        const normalizedName = COMMON_HEADERS[name.toLowerCase()] || name;

        return this.headers[normalizedName] !== undefined;
    }

    writeHead(statusCode, statusMessage, headers) {
        if (this.headersSent) {
            throw new Error('Headers already sent');
        }

        this.statusCode = statusCode;
        this.statusMessage = STATUS_CODES[statusCode] || 'Unknown Status';

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
            buffer = textEncoder.encode(chunk);
        } else if (chunk instanceof Uint8Array) {
            buffer = chunk;
        } else {
            throw new TypeError('Chunk must be a string or Uint8Array');
        }

        this._bodyChunks.push(buffer);
        this._bodyLength += buffer.length;

        if (callback) {
            queueMicrotask(callback);
        }

        return true;
    }

    end(data, encoding, callback) {
        if (this.finished) {
            if (callback) {
                queueMicrotask(callback);
            }

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
            queueMicrotask(callback);
        }

        this.emit('finish');

        return this;
    }

    _sendResponse() {
    // Ensure headers are sent
        if (!this.headersSent) {
            // Set Content-Length if not already set and we have a body
            if (
                !this.headers['Content-Length'] &&
        !this.headers['content-length'] &&
        this._bodyLength > 0
            ) {
                this.setHeader('Content-Length', this._bodyLength);
            }

            // 根据HTTP版本和Connection头部正确设置Connection头部
            if (this.socket._currentRequest) {
                const req = this.socket._currentRequest;
                const requestHttpVersion = `${req.httpVersionMajor}.${req.httpVersionMinor}`;
                const connectionHeader = (
                    req.headers['Connection'] ||
          req.headers['connection'] ||
          ''
                ).toLowerCase();

                // 正确实现HTTP/1.1的keep-alive机制
                if (requestHttpVersion === '1.1') {
                    // HTTP/1.1默认保持连接，除非明确指定Connection: close
                    this._shouldKeepAlive = connectionHeader !== 'close';
                } else if (requestHttpVersion === '1.0') {
                    // HTTP/1.0默认关闭连接，除非明确指定Connection: keep-alive
                    this._shouldKeepAlive = connectionHeader === 'keep-alive';

                    if (this._shouldKeepAlive) {
                        this.setHeader('Connection', 'keep-alive');
                    }
                } else {
                    // 其他版本默认不保持连接
                    this._shouldKeepAlive = false;
                }
            }

            // 如果不保持连接，设置Connection: close头部
            if (!this._shouldKeepAlive) {
                this.setHeader('Connection', 'close');
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

            // Create HTTP response manually to ensure proper format
            let response = `HTTP/1.1 ${this.statusCode} ${this.statusMessage}\r\n`;

            // Add headers
            for (const [ name, value ] of Object.entries(this.headers)) {
                response += `${name}: ${value}\r\n`;
            }

            // End of headers
            response += '\r\n';

            // Add body if present
            if (body.length > 0) {
                // Directly concatenate Uint8Array instead of converting to string
                const headersBytes = textEncoder.encode(response);
                const responseBytes = new Uint8Array(headersBytes.length + body.length);

                responseBytes.set(headersBytes, 0);
                responseBytes.set(body, headersBytes.length);

                // 使用单独的方法处理写入和连接状态
                this._writeAndHandleConnection(responseBytes);

                return;
            }

            const encoded = textEncoder.encode(response);

            // 使用单独的方法处理写入和连接状态
            this._writeAndHandleConnection(encoded);
        } catch (err) {
            // Release resources
            this._cleanup();

            console.error('Failed to create response:', err);

            try {
                this.socket.close();
            } catch (closeErr) {
                // Ignore close errors
            }
        }
    }

    /**
   * 处理响应写入和连接状态管理
   * @param {Uint8Array} data - 要写入的数据
   */
    _writeAndHandleConnection(data) {
    // 使用Promise链而不是async/await来提高性能
        this.socket
            .write(data)
            .then(() => {
                // Release resources
                this._cleanup();

                // 根据_keepAlive状态决定是否关闭连接
                if (!this._shouldKeepAlive) {
                    try {
                        this.socket.close();
                    } catch (err) {
                        // Ignore close errors
                    }
                }

                this.emit('close');
            })
            .catch(err => {
                // Release resources
                this._cleanup();

                // Ignore common socket errors
                if (!this._isCommonSocketError(err)) {
                    console.error('Failed to write response:', err);
                }

                try {
                    this.socket.close();
                } catch (closeErr) {
                    // Ignore close errors
                }
            });
    }

    _cleanup() {
        // Clear body chunks to free memory
        this._bodyChunks.length = 0;
        this._bodyLength = 0;

        // Clear socket reference if it exists to prevent memory leaks
        if (this.socket) {
            // Remove the reference from socket to this response
            if (this.socket._currentRequest === this) {
                objectPool.releaseIncomingMessage(this.socket._currentRequest);
                delete this.socket._currentRequest;
            }
            this.socket = null;
        }

        // Release response object back to pool
        objectPool.releaseServerResponse(this);
    }

    _isCommonSocketError(err) {
        const msg = err.message || '';

        return (
            msg.includes('ECONNRESET') ||
      msg.includes('EPIPE') ||
      msg.includes('ECONNABORTED') ||
      msg.includes('EINVAL')
        );
    }

    removeAllListeners() {
        this._events = Object.create(null);

        return this;
    }

    // Add getHeaders method for better compatibility
    getHeaders() {
        return Object.assign({}, this.headers);
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
        this._closed = false;
        this._maxConnections = options.maxConnections || 0; // 0 means no limit
        this._timeout = options.timeout || 120000; // 2 minutes default
        this._connectionsCount = 0;
        this._requestBatch = [];
        this._processingBatch = false;
        // Make STATUS_CODES available on the server instance
        this.STATUS_CODES = STATUS_CODES;
        
        // 添加基于连接数的内存管理相关属性
        this._lastGCTime = Date.now();
        this._gcInterval = 10000; // 10秒最小GC间隔
        this._gcConnectionThreshold = options.gcConnectionThreshold || 50; // 连接数阈值，默认50
    }
    
    // 修改主动垃圾回收方法，基于连接数阈值触发
    _performGC() {
        const now = Date.now();
        // 检查是否达到连接数阈值并且距离上次GC有一定时间间隔
        if (this._connectionsCount >= this._gcConnectionThreshold && 
            now - this._lastGCTime > this._gcInterval) {
            // 强制垃圾回收
            if (typeof gc !== 'undefined') {
                gc();
            }
            
            // 更新上次GC时间
            this._lastGCTime = now;
        }
    }
    
    // 清理空闲连接
    _cleanupIdleConnections() {
        // 在这个实现中，我们主要依靠定期检查和强制关闭
        // 实际应用中可以跟踪连接活跃时间并关闭长期空闲的连接
    }
    
    // 重写listen方法，添加连接数限制
    listen(port, hostname, backlog, callback) {
        if (this._closed) {
            throw new Error('Server has been closed');
        }

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
                while (!this._closed) {
                    try {
                        const clientHandle = await this._server.accept();

                        if (!clientHandle || this._closed) {
                            break;
                        }

                        // 检查连接数限制，如果超过则立即关闭新连接
                        if (
                            this._maxConnections > 0 &&
                            this._connectionsCount >= this._maxConnections
                        ) {
                            clientHandle.close();
                            continue;
                        }

                        this._connections.add(clientHandle);
                        this._connectionsCount++;

                        // 当连接数达到GC阈值时触发垃圾回收
                        this._performGC();

                        // Set connection timeout
                        if (this._timeout > 0) {
                            clientHandle.setKeepAlive(true, 1000);
                            clientHandle.setNoDelay(true);
                        }

                        // Handle HTTP requests on this connection
                        this._handleConnection(clientHandle);
                    } catch (err) {
                        if (this._closed) {
                            break;
                        }

                        // Ignore common connection errors but log others
                        if (!this._isCommonConnectionError(err)) {
                            console.error('Connection error:', err);
                        }

                        // Break loop on certain errors
                        if (
                            err.name === 'AbortError' ||
                            (err.message && err.message.includes('closed'))
                        ) {
                            break;
                        }
                    }
                }
            } catch (err) {
                if (!this._closed) {
                    console.error('Server fatal error:', err);
                    this.close();
                }
            }
        };

        // Start accepting connections
        handleConnection();

        this._listening = true;
        this.emit('listening');

        if (callback) {
            queueMicrotask(callback);
        }

        return this;
    }

    close(callback) {
        if (!this._listening) {
            if (callback) {
                queueMicrotask(() => callback(new Error('Not running')));
            }

            return this;
        }

        this._listening = false;
        this._closed = true;

        // Close all connections with a timeout to prevent hanging
        const connectionsToClose = Array.from(this._connections);
        const closePromises = [];

        for (const connection of connectionsToClose) {
            try {
                // Create a promise for each connection close
                const closePromise = new Promise((resolve) => {
                    // 设置1秒超时强制关闭连接
                    const timeout = setTimeout(() => {
                        try {
                            connection.close();
                        } catch (err) {
                            // Ignore errors when closing
                        } finally {
                            // 清理连接上的引用
                            if (connection._currentRequest) {
                                objectPool.releaseIncomingMessage(connection._currentRequest);
                                delete connection._currentRequest;
                            }
                            if (connection._server) {
                                delete connection._server;
                            }
                            resolve();
                        }
                    }, 1000);

                    // 正常关闭连接
                    try {
                        // 清理连接上的引用
                        if (connection._currentRequest) {
                            objectPool.releaseIncomingMessage(connection._currentRequest);
                            delete connection._currentRequest;
                        }
                        if (connection._server) {
                            delete connection._server;
                        }
                        connection.close();
                        clearTimeout(timeout);
                        resolve();
                    } catch (err) {
                        clearTimeout(timeout);
                        // 清理连接上的引用
                        if (connection._currentRequest) {
                            objectPool.releaseIncomingMessage(connection._currentRequest);
                            delete connection._currentRequest;
                        }
                        if (connection._server) {
                            delete connection._server;
                        }
                        resolve();
                    }
                });

                closePromises.push(closePromise);
            } catch (err) {
                // 即使出现错误也要确保清理引用
                if (connection._currentRequest) {
                    objectPool.releaseIncomingMessage(connection._currentRequest);
                    delete connection._currentRequest;
                }
                if (connection._server) {
                    delete connection._server;
                }
            }
        }

        // Clear connections set immediately
        this._connections.clear();
        this._connectionsCount = 0;

        // Wait for all connections to close
        Promise.all(closePromises).then(() => {
            // 强制垃圾回收
            if (typeof gc !== 'undefined') {
                gc();
            }
            
            // Close the server
            if (this._server) {
                this._server.close(() => {
                    this.emit('close');

                    if (callback) {
                        callback();
                    }
                });
            } else if (callback) {
                queueMicrotask(callback);
            }
        });

        return this;
    }

    _handleConnection(handle) {
        let buffer = '';
        let parser = objectPool.getParser();
        let connectionClosed = false;
        let requestCount = 0;
        // 进一步降低每个连接的最大请求数，从100降到20
        const maxRequestsPerConnection = 20;
        let lastActivityTime = Date.now();
        const connectionTimeout = this._timeout;

        // Store server reference on socket for cleanup access
        handle._server = this;

        // Create a simple read loop
        const readLoop = async () => {
            try {
                const buf = new Uint8Array(65536);

                // eslint-disable-next-line no-constant-condition
                while (!connectionClosed) {
                    // 检查连接是否超时
                    if (connectionTimeout > 0 && Date.now() - lastActivityTime > connectionTimeout) {
                        connectionClosed = true;
                        break;
                    }
                    
                    // 执行基于连接数的垃圾回收检查
                    this._performGC();

                    try {
                        const nread = await handle.read(buf);

                        if (nread === null) {
                            // Connection closed
                            connectionClosed = true;
                            break;
                        }

                        // 更新活动时间
                        lastActivityTime = Date.now();

                        // Convert chunk to string and add to buffer
                        const chunk = textDecoder.decode(buf.subarray(0, nread), { stream: true });

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
                                    // 限制每个连接的请求数量
                                    if (++requestCount > maxRequestsPerConnection) {
                                        connectionClosed = true;
                                        break;
                                    }
                                    
                                    // Create request and response objects from pool
                                    const currentRequest = objectPool.getIncomingMessage(handle);

                                    currentRequest.headers = result.headers;
                                    currentRequest.method = result.method;
                                    currentRequest.url = result.url;
                                    currentRequest.httpVersion = `${result.httpMajor}.${result.httpMinor}`;
                                    currentRequest.httpVersionMajor = result.httpMajor;
                                    currentRequest.httpVersionMinor = result.httpMinor;
                                    currentRequest._body = result.body;

                                    // Store current request on handle for response usage
                                    handle._currentRequest = currentRequest;

                                    const currentResponse = objectPool.getServerResponse(handle);

                                    // 根据HTTP RFC正确确定是否应该保持连接
                                    const connectionHeader = (
                                        result.headers['Connection'] ||
                    result.headers['connection'] ||
                    ''
                                    ).toLowerCase();

                                    // 正确实现HTTP/1.1的keep-alive机制
                                    // HTTP/1.1默认保持连接，除非明确指定Connection: close
                                    // HTTP/1.0默认关闭连接，除非明确指定Connection: keep-alive
                                    if (result.httpMajor === 1 && result.httpMinor === 1) {
                                        // HTTP/1.1
                                        currentResponse._shouldKeepAlive =
                      connectionHeader !== 'close';
                                    } else if (result.httpMajor === 1 && result.httpMinor === 0) {
                                        // HTTP/1.0
                                        currentResponse._shouldKeepAlive =
                      connectionHeader === 'keep-alive';
                                    } else {
                                        // 其他版本默认不保持连接
                                        currentResponse._shouldKeepAlive = false;
                                    }

                                    // Batch process requests for better CPU utilization
                                    this._requestBatch.push({
                                        req: currentRequest,
                                        res: currentResponse,
                                    });

                                    if (
                                        this._requestBatch.length >= BATCH_SIZE ||
                    !currentResponse._shouldKeepAlive
                                    ) {
                                        this._processBatch();
                                    } else if (!this._processingBatch) {
                                        this._processingBatch = true;
                                        queueMicrotask(() => {
                                            this._processBatch();
                                        });
                                    }

                                    // Reset parser for next request if connection is kept alive
                                    if (currentResponse._shouldKeepAlive) {
                                        // Reset parser for the next request
                                        try {
                                            parser.reset();
                                        } catch (resetErr) {
                                            // If reset fails, we need to get a new parser
                                            objectPool.releaseParser(parser);
                                            // Create a new parser for the next request
                                            parser = objectPool.getParser();
                                        }

                                        // Continue listening for more requests on this connection
                                    } else {
                                        // If we shouldn't keep the connection alive, close after this request
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
                                    const shouldLog =
                    !err.message.includes('HPE_INVALID_METHOD') &&
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
                                this._connectionsCount = Math.max(
                                    0,
                                    this._connectionsCount - 1
                                );

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

                // 清理所有相关资源
                this._connections.delete(handle);
                this._connectionsCount = Math.max(0, this._connectionsCount - 1);
                
                // 确保释放解析器
                objectPool.releaseParser(parser);
                
                // 确保释放当前请求对象
                if (handle._currentRequest) {
                    objectPool.releaseIncomingMessage(handle._currentRequest);
                    delete handle._currentRequest;
                }
                
                // 清理服务器引用
                if (handle._server) {
                    delete handle._server;
                }
            }
        };

        // Start the read loop
        readLoop();
    }

    _processBatch() {
        this._processingBatch = false;
        const batch = this._requestBatch.splice(0, BATCH_SIZE);

        for (const { req, res } of batch) {
            try {
                // Emit the request event
                this.emit('request', req, res);

                // Call the request listener if provided
                if (this._requestListener) {
                    this._requestListener(req, res);
                }
            } catch (err) {
                // Ignore errors in request handlers but log them
                if (this._debug) {
                    console.error('Request handler error:', err);
                }

                // 出错时确保响应被发送
                try {
                    if (!res.headersSent) {
                        res.statusCode = 500;
                        res.statusMessage = 'Internal Server Error';
                        res.setHeader('Content-Type', 'text/plain');
                        res.end('Internal Server Error');
                    }
                } catch (resErr) {
                    // Ignore errors when trying to send error response
                }
            } finally {
                // 确保请求对象被释放回对象池
                if (req.socket && req.socket._currentRequest === req) {
                    delete req.socket._currentRequest;
                }
                objectPool.releaseIncomingMessage(req);
            }
        }
    }

    _isCommonConnectionError(err) {
        const msg = err.message || '';

        return (
            msg.includes('ECONNRESET') ||
      msg.includes('EPIPE') ||
      msg.includes('ECONNABORTED') ||
      msg.includes('EINVAL')
        );
    }

    _isCommonSocketError(err) {
        const msg = err.message || '';

        return (
            msg.includes('ECONNRESET') ||
      msg.includes('EPIPE') ||
      msg.includes('ECONNABORTED') ||
      msg.includes('EINVAL')
        );
    }

    get maxConnections() {
        return this._maxConnections;
    }

    set maxConnections(value) {
        this._maxConnections = value;
    }

    get timeout() {
        return this._timeout;
    }

    set timeout(value) {
        this._timeout = value;
    }

    get connections() {
        return this._connectionsCount;
    }

    // Add address method for better compatibility
    address() {
        if (!this._server || !this._listening) {
            return null;
        }

        try {
            const addr = this._server.getsockname();

            return {
                port: addr.port,
                family: addr.ip.includes(':') ? 'IPv6' : 'IPv4',
                address: addr.ip,
            };
        } catch (err) {
            return null;
        }
    }
}

/**
 * Factory function to create an HTTP server
 */
export function createServer(requestListener) {
    return new Server(requestListener);
}
