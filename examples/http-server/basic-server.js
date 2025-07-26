// Basic HTTP server example using tjs:httpserver
//
// Usage: tjs run basic-server.js [--port 3000] [--host 127.0.0.1]

import { createServer } from 'tjs:httpserver';
import getopts from 'tjs:getopts';

const options = getopts(tjs.args.slice(2), {
    alias: {
        port: 'p',
        host: 'h'
    },
    default: {
        port: 3000,
        host: '127.0.0.1'
    }
});

// Create a basic HTTP server
const server = createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);
    
    // Set response headers
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Server', 'txiki.js');
    
    // Simple routing
    if (req.url === '/') {
        res.writeHead(200);
        res.end('Hello World from txiki.js HTTP Server!\n');
    } else if (req.url === '/about') {
        res.writeHead(200);
        res.end('This is a basic HTTP server built with txiki.js\n');
    } else if (req.url === '/headers') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(req.headers, null, 2) + '\n');
    } else {
        res.writeHead(404);
        res.end('Not Found\n');
    }
});

// Handle server events
server.on('listening', () => {
    console.log(`HTTP server listening on ${options.host}:${options.port}`);
    console.log('Try visiting:');
    console.log(`  http://${options.host}:${options.port}/`);
    console.log(`  http://${options.host}:${options.port}/about`);
    console.log(`  http://${options.host}:${options.port}/headers`);
});

server.on('request', (req, res) => {
    console.log(`Request from ${req.socket.remoteAddress || 'unknown'}`);
});

// Start the server
server.listen(options.port, options.host);

// Graceful shutdown (txiki.js uses different signal handling)
// Note: In txiki.js, use Ctrl+C to stop the server