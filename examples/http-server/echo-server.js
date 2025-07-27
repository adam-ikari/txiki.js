// HTTP echo server example using tjs:httpserver
//
// Usage: tjs run echo-server.js [--port 3003]

import getopts from 'tjs:getopts';

const options = getopts(tjs.args.slice(2), {
    alias: { port: 'p' },
    default: { port: 3003 }
});

const server = tjs.createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);
    
    // Prepare echo response data
    const echoData = {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        httpVersion: req.httpVersion,
        headers: req.headers,
        body: req._body || null,
        connection: {
            localAddress: req.socket.localAddress || 'unknown',
            remoteAddress: req.socket.remoteAddress || 'unknown'
        }
    };
    
    // Handle different response formats based on Accept header
    const acceptHeader = req.headers.accept || req.headers.Accept || '';
    
    if (acceptHeader.includes('application/json')) {
        // JSON response
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(echoData, null, 2));
        
    } else if (acceptHeader.includes('text/html')) {
        // HTML response
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>HTTP Echo Server</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    pre { background: #f5f5f5; padding: 20px; border-radius: 5px; overflow-x: auto; }
                    .header { color: #333; border-bottom: 2px solid #ddd; padding-bottom: 10px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>HTTP Echo Server</h1>
                    <p>Request received at ${echoData.timestamp}</p>
                </div>
                <h2>Request Details</h2>
                <pre>${JSON.stringify(echoData, null, 2)}</pre>
                <hr>
                <p>
                    <strong>Try different requests:</strong><br>
                    • curl -H "Accept: application/json" http://localhost:${options.port}/<br>
                    • curl -X POST -d "Hello World" http://localhost:${options.port}/test<br>
                    • curl -H "Custom-Header: value" http://localhost:${options.port}/headers
                </p>
            </body>
            </html>
        `);
        
    } else {
        // Plain text response
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.write(`HTTP Echo Server Response\n`);
        res.write(`========================\n\n`);
        res.write(`Timestamp: ${echoData.timestamp}\n`);
        res.write(`Method: ${echoData.method}\n`);
        res.write(`URL: ${echoData.url}\n`);
        res.write(`HTTP Version: ${echoData.httpVersion}\n\n`);
        
        res.write(`Headers:\n`);
        for (const [name, value] of Object.entries(echoData.headers)) {
            res.write(`  ${name}: ${value}\n`);
        }
        
        if (echoData.body) {
            res.write(`\nBody:\n${echoData.body}\n`);
        }
        
        res.write(`\nConnection:\n`);
        res.write(`  Local: ${echoData.connection.localAddress}\n`);
        res.write(`  Remote: ${echoData.connection.remoteAddress}\n`);
        
        res.end();
    }
});

server.on('listening', () => {
    console.log(`HTTP echo server listening on http://localhost:${options.port}`);
    console.log('\nThis server echoes back request information in different formats:');
    console.log('  - JSON: curl -H "Accept: application/json" http://localhost:' + options.port);
    console.log('  - HTML: Open http://localhost:' + options.port + ' in a browser');
    console.log('  - Text: curl http://localhost:' + options.port);
    console.log('\nTry sending different types of requests to see the echo response!');
});

server.listen(options.port, '127.0.0.1');