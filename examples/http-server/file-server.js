// Static file server example using tjs:httpserver
//
// Usage: tjs run file-server.js [--port 3002] [--dir ./public]

import getopts from 'tjs:getopts';
import path from 'tjs:path';

const options = getopts(tjs.args.slice(2), {
    alias: { 
        port: 'p',
        dir: 'd'
    },
    default: { 
        port: 3002,
        dir: './public'
    }
});

// MIME type mapping
const mimeTypes = {
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip'
};

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return mimeTypes[ext] || 'application/octet-stream';
}

function sendError(res, statusCode, message) {
    res.writeHead(statusCode, { 'Content-Type': 'text/html' });
    res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Error ${statusCode}</title></head>
        <body>
            <h1>Error ${statusCode}</h1>
            <p>${message}</p>
            <hr>
            <small>txiki.js file server</small>
        </body>
        </html>
    `);
}

async function serveFile(filePath, res) {
    try {
        // Check if file exists and get stats
        const stats = await tjs.stat(filePath);
        
        if (stats.isDirectory) {
            // Try to serve index.html from directory
            const indexPath = path.join(filePath, 'index.html');
            try {
                await tjs.stat(indexPath);
                return serveFile(indexPath, res);
            } catch {
                // Generate directory listing
                return serveDirectoryListing(filePath, res);
            }
        }
        
        // Read and serve the file
        const content = await tjs.readFile(filePath);
        const mimeType = getMimeType(filePath);
        
        res.writeHead(200, {
            'Content-Type': mimeType,
            'Content-Length': content.length,
            'Cache-Control': 'public, max-age=3600'
        });
        
        res.end(content);
        
    } catch (error) {
        if (error.errno === tjs.errno.ENOENT) {
            sendError(res, 404, 'File not found');
        } else if (error.errno === tjs.errno.EACCES) {
            sendError(res, 403, 'Access denied');
        } else {
            console.error('Error serving file:', error);
            sendError(res, 500, 'Internal server error');
        }
    }
}

async function serveDirectoryListing(dirPath, res) {
    try {
        const files = await tjs.readdir(dirPath);
        
        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Directory: ${dirPath}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                h1 { color: #333; }
                .file { margin: 5px 0; }
                .file a { text-decoration: none; color: #0066cc; }
                .file a:hover { text-decoration: underline; }
                .dir { font-weight: bold; }
                .size { color: #666; margin-left: 20px; }
            </style>
        </head>
        <body>
            <h1>Directory: ${dirPath}</h1>
            <div class="file dir"><a href="../">../</a></div>
        `;
        
        for (const file of files) {
            const fullPath = path.join(dirPath, file);
            try {
                const stats = await tjs.stat(fullPath);
                const isDir = stats.isDirectory;
                const size = isDir ? '' : `<span class="size">(${stats.size} bytes)</span>`;
                const className = isDir ? 'file dir' : 'file';
                const href = isDir ? `${file}/` : file;
                
                html += `<div class="${className}"><a href="${href}">${file}${isDir ? '/' : ''}</a>${size}</div>\n`;
            } catch {
                // Skip files we can't stat
            }
        }
        
        html += `
            <hr>
            <small>txiki.js file server</small>
        </body>
        </html>`;
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        
    } catch (error) {
        console.error('Error reading directory:', error);
        sendError(res, 500, 'Could not read directory');
    }
}

const server = tjs.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${options.port}`);
    let filePath = decodeURIComponent(url.pathname);
    
    // Security: prevent directory traversal
    if (filePath.includes('..') || filePath.includes('\0')) {
        sendError(res, 400, 'Invalid file path');
        return;
    }
    
    // Remove leading slash and join with serve directory
    filePath = filePath.replace(/^\/+/, '');
    filePath = path.join(options.dir, filePath);
    
    console.log(`${req.method} ${req.url} -> ${filePath}`);
    
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendError(res, 405, 'Method not allowed');
        return;
    }
    
    await serveFile(filePath, res);
});

server.on('listening', () => {
    console.log(`File server listening on http://localhost:${options.port}`);
    console.log(`Serving files from: ${path.resolve(options.dir)}`);
    console.log('\nFeatures:');
    console.log('  - Static file serving');
    console.log('  - Directory listings');
    console.log('  - MIME type detection');
    console.log('  - Basic security (path traversal protection)');
});

server.listen(options.port, '127.0.0.1');