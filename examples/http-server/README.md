# HTTP Server Examples

This directory contains examples demonstrating the `tjs:httpserver` module functionality in txiki.js.

## Examples

### 1. Basic Server (`basic-server.js`)

A simple HTTP server with basic routing and request handling.

```bash
# Run with default settings (port 3000, host 127.0.0.1)
tjs run basic-server.js

# Run with custom port and host
tjs run basic-server.js --port 8080 --host 0.0.0.0
```

**Features:**
- Simple routing (/, /about, /headers)
- Request logging
- Custom headers
- 404 error handling

**Endpoints:**
- `GET /` - Welcome message
- `GET /about` - Server information
- `GET /headers` - Returns request headers as JSON

### 2. API Server (`api-server.js`)

A RESTful API server implementing a simple todo list with CRUD operations.

```bash
# Run the API server
tjs run api-server.js --port 3001
```

**Features:**
- RESTful API design
- JSON request/response handling
- CORS support
- In-memory data store
- Error handling
- Health check endpoint

**API Endpoints:**
- `GET /api/todos` - List all todos
- `POST /api/todos` - Create a new todo
- `PUT /api/todos/:id` - Update a todo
- `DELETE /api/todos/:id` - Delete a todo
- `GET /api/health` - Health check

**Example requests:**
```bash
# List todos
curl http://localhost:3001/api/todos

# Create a new todo
curl -X POST http://localhost:3001/api/todos \
  -H "Content-Type: application/json" \
  -d '{"text":"Learn txiki.js"}'

# Update a todo
curl -X PUT http://localhost:3001/api/todos/1 \
  -H "Content-Type: application/json" \
  -d '{"completed":true}'

# Delete a todo
curl -X DELETE http://localhost:3001/api/todos/1
```

### 3. File Server (`file-server.js`)

A static file server with directory listing capabilities.

```bash
# Serve files from ./public directory
tjs run file-server.js --port 3002 --dir ./public

# Serve files from current directory
tjs run file-server.js --dir .
```

**Features:**
- Static file serving
- MIME type detection
- Directory listings
- Path traversal protection
- Index.html support
- Caching headers

### 4. Echo Server (`echo-server.js`)

An HTTP echo server that returns information about incoming requests.

```bash
# Run the echo server
tjs run echo-server.js --port 3003
```

**Features:**
- Multiple response formats (JSON, HTML, Text)
- Request information echoing
- Content negotiation based on Accept header
- Detailed request analysis

**Example requests:**
```bash
# JSON response
curl -H "Accept: application/json" http://localhost:3003

# Plain text response
curl http://localhost:3003

# HTML response (open in browser)
open http://localhost:3003

# POST request with body
curl -X POST -d "Hello World" http://localhost:3003/test
```

## Common Features

All examples include:

- **Command-line argument parsing** using `tjs:getopts`
- **Event handling** for server lifecycle events
- **Error handling** and appropriate HTTP status codes
- **Request logging** for debugging
- **Graceful shutdown** support (where applicable)

## API Reference

The `tjs:httpserver` module provides:

### Classes

- **`Server`** - HTTP server class extending EventEmitter
- **`IncomingMessage`** - Represents HTTP requests
- **`ServerResponse`** - Represents HTTP responses

### Functions

- **`createServer(requestListener?)`** - Factory function to create server instances

### Server Methods

- `listen(port, hostname?, backlog?, callback?)` - Start listening for connections
- `close(callback?)` - Stop the server

### ServerResponse Methods

- `writeHead(statusCode, statusMessage?, headers?)` - Write response status and headers
- `setHeader(name, value)` - Set a response header
- `getHeader(name)` - Get a response header
- `removeHeader(name)` - Remove a response header
- `write(chunk, encoding?, callback?)` - Write response data
- `end(data?, encoding?, callback?)` - End the response

### Events

- `listening` - Emitted when server starts listening
- `request` - Emitted for each HTTP request
- `close` - Emitted when server closes

## Tips

1. **Error Handling**: Always wrap your request handlers in try-catch blocks for production use
2. **Security**: Implement proper input validation and sanitization
3. **Performance**: Consider connection limits and timeout handling for production servers
4. **Logging**: Use structured logging for better debugging and monitoring
5. **CORS**: Add appropriate CORS headers for web applications

## Building and Running

1. First, build the httpserver module:
   ```bash
   make js
   ```

2. Then run any example:
   ```bash
   tjs run examples/http-server/basic-server.js
   ```