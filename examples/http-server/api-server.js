// RESTful API server example using tjs:httpserver
//
// Usage: tjs run api-server.js [--port 3001]

import { createServer } from 'tjs:httpserver';
import getopts from 'tjs:getopts';

const options = getopts(tjs.args.slice(2), {
    alias: { port: 'p' },
    default: { port: 3001 }
});

// Simple in-memory data store
let todos = [
    { id: 1, text: 'Learn txiki.js', completed: false },
    { id: 2, text: 'Build HTTP server', completed: true },
    { id: 3, text: 'Create API endpoints', completed: false }
];
let nextId = 4;

// Helper function to parse JSON body
function parseBody(req) {
    return new Promise((resolve, reject) => {
        if (req._body) {
            try {
                const data = JSON.parse(req._body);
                resolve(data);
            } catch (err) {
                reject(err);
            }
        } else {
            resolve(null);
        }
    });
}

// Helper function to send JSON response
function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data, null, 2));
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${options.port}`);
    const path = url.pathname;
    const method = req.method;
    
    console.log(`${method} ${path}`);
    
    // Handle CORS preflight
    if (method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }
    
    try {
        // Routes
        if (path === '/api/todos' && method === 'GET') {
            sendJSON(res, 200, { todos });
            
        } else if (path === '/api/todos' && method === 'POST') {
            const body = await parseBody(req);
            if (!body || !body.text) {
                sendJSON(res, 400, { error: 'Text is required' });
                return;
            }
            
            const newTodo = {
                id: nextId++,
                text: body.text,
                completed: false
            };
            todos.push(newTodo);
            sendJSON(res, 201, newTodo);
            
        } else if (path.startsWith('/api/todos/') && method === 'PUT') {
            const id = parseInt(path.split('/')[3]);
            const todoIndex = todos.findIndex(t => t.id === id);
            
            if (todoIndex === -1) {
                sendJSON(res, 404, { error: 'Todo not found' });
                return;
            }
            
            const body = await parseBody(req);
            if (body.text !== undefined) todos[todoIndex].text = body.text;
            if (body.completed !== undefined) todos[todoIndex].completed = body.completed;
            
            sendJSON(res, 200, todos[todoIndex]);
            
        } else if (path.startsWith('/api/todos/') && method === 'DELETE') {
            const id = parseInt(path.split('/')[3]);
            const todoIndex = todos.findIndex(t => t.id === id);
            
            if (todoIndex === -1) {
                sendJSON(res, 404, { error: 'Todo not found' });
                return;
            }
            
            const deleted = todos.splice(todoIndex, 1)[0];
            sendJSON(res, 200, deleted);
            
        } else if (path === '/api/health' && method === 'GET') {
            sendJSON(res, 200, { 
                status: 'ok', 
                timestamp: new Date().toISOString(),
                uptime: 'N/A', // process.uptime() not available in txiki.js
                todos: todos.length
            });
            
        } else {
            sendJSON(res, 404, { error: 'Not found' });
        }
        
    } catch (error) {
        console.error('Error handling request:', error);
        sendJSON(res, 500, { error: 'Internal server error' });
    }
});

server.on('listening', () => {
    console.log(`API server listening on http://localhost:${options.port}`);
    console.log('Available endpoints:');
    console.log('  GET    /api/todos      - List all todos');
    console.log('  POST   /api/todos      - Create a new todo');
    console.log('  PUT    /api/todos/:id  - Update a todo');
    console.log('  DELETE /api/todos/:id  - Delete a todo');
    console.log('  GET    /api/health     - Health check');
    console.log('Example requests:');
    console.log(`  curl http://localhost:${options.port}/api/todos`);
    console.log(`  curl -X POST http://localhost:${options.port}/api/todos -H "Content-Type: application/json" -d '{"text":"New task"}'`);
});

server.listen(options.port, '127.0.0.1');