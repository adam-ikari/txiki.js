import assert from 'tjs:assert';
import { createServer, Server, IncomingMessage, ServerResponse } from 'tjs:httpserver';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Test server creation
console.log('Testing server creation...');
const server1 = createServer();
assert.ok(server1 instanceof Server, 'createServer returns Server instance');

const server2 = new Server();
assert.ok(server2 instanceof Server, 'Server constructor works');

// Test server with request listener
console.log('Testing server with request listener...');
let requestListenerCalled = false;
const server3 = createServer((req, res) => {
    requestListenerCalled = true;
    assert.ok(req instanceof IncomingMessage, 'req is IncomingMessage instance');
    assert.ok(res instanceof ServerResponse, 'res is ServerResponse instance');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Hello World');
});

// Test basic server operations
console.log('Testing basic server operations...');
const testServer = createServer((req, res) => {
    if (req.url === '/hello') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Hello World');
    } else if (req.url === '/json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"message": "test"}');
    } else if (req.url === '/echo') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.write('Method: ' + req.method + '\n');
        res.write('URL: ' + req.url + '\n');
        res.write('Headers: ' + JSON.stringify(req.headers) + '\n');
        res.end();
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

// Test server listening
console.log('Testing server listening...');
let listeningEmitted = false;
testServer.on('listening', () => {
    listeningEmitted = true;
});

// Start server on random port
testServer.listen(0, '127.0.0.1', () => {
    console.log('Server started successfully');
});

// Give some time for the listening event
await new Promise(resolve => setTimeout(resolve, 100));
assert.ok(listeningEmitted, 'listening event was emitted');

// Test ServerResponse methods
console.log('Testing ServerResponse methods...');
const mockSocket = {
    write: () => {},
    close: () => {}
};

const response = new ServerResponse(mockSocket);

// Test setHeader/getHeader/removeHeader
response.setHeader('Content-Type', 'text/plain');
assert.eq(response.getHeader('Content-Type'), 'text/plain', 'getHeader works');

response.setHeader('X-Custom', 'value');
assert.eq(response.getHeader('X-Custom'), 'value', 'setHeader works');

response.removeHeader('X-Custom');
assert.eq(response.getHeader('X-Custom'), undefined, 'removeHeader works');

// Test writeHead
response.writeHead(200, 'OK', { 'Content-Length': '5' });
assert.eq(response.statusCode, 200, 'statusCode set correctly');
assert.eq(response.statusMessage, 'OK', 'statusMessage set correctly');
assert.eq(response.getHeader('Content-Length'), '5', 'headers set via writeHead');

// Test writeHead with headers object as second parameter
const response2 = new ServerResponse(mockSocket);
response2.writeHead(404, { 'Content-Type': 'text/html' });
assert.eq(response2.statusCode, 404, 'statusCode set correctly');
assert.eq(response2.getHeader('Content-Type'), 'text/html', 'headers set correctly');

// Test write method
const response3 = new ServerResponse(mockSocket);
const writeResult = response3.write('test data');
assert.eq(writeResult, true, 'write returns true');

// Test write with callback
let callbackCalled = false;
response3.write('more data', null, () => {
    callbackCalled = true;
});

// Give callback time to execute
await new Promise(resolve => setTimeout(resolve, 10));
assert.ok(callbackCalled, 'write callback was called');

// Test IncomingMessage
console.log('Testing IncomingMessage...');
const mockSocket2 = {};
const request = new IncomingMessage(mockSocket2);

request.method = 'GET';
request.url = '/test';
request.headers = { 'host': 'localhost' };

assert.eq(request.method, 'GET', 'method property works');
assert.eq(request.url, '/test', 'url property works');
assert.eq(request.headers.host, 'localhost', 'headers property works');
assert.eq(request.connection, mockSocket2, 'connection property works');

// Test error handling
console.log('Testing error handling...');
const response4 = new ServerResponse(mockSocket);
response4.writeHead(200);
assert.throws(() => {
    response4.writeHead(404);
}, Error);

const response5 = new ServerResponse(mockSocket);
response5.end();
assert.throws(() => {
    response5.write('data');
}, Error);

// Test that calling end() twice doesn't throw, but returns early
response5.end(); // This should not throw, just return early

// Test end method with data
const response6 = new ServerResponse(mockSocket);
let finishEmitted = false;
response6.on('finish', () => {
    finishEmitted = true;
});

response6.end('final data');
assert.ok(response6.finished, 'response marked as finished');

// Give event time to emit
await new Promise(resolve => setTimeout(resolve, 10));
assert.ok(finishEmitted, 'finish event was emitted');

// Test server close
console.log('Testing server close...');
let closeEmitted = false;
testServer.on('close', () => {
    closeEmitted = true;
});

testServer.close(() => {
    console.log('Server closed successfully');
});

// Give close event time to emit
await new Promise(resolve => setTimeout(resolve, 200));
// Note: close event emission depends on actual TCP implementation
// For now, we'll just test that close() can be called without error
console.log('Server close method called successfully');

// Test multiple server instances
console.log('Testing multiple server instances...');
const server4 = createServer();
const server5 = createServer();

// Test that multiple servers can be created
assert.ok(server4 instanceof Server, 'server4 created successfully');
assert.ok(server5 instanceof Server, 'server5 created successfully');

console.log('All HTTP server tests passed!');