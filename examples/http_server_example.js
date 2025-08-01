// Static file server example using tjs:httpserver
//
// Usage: tjs run file-server.js [--port 3002] [--dir ./public] [--max-connections 100]

import getopts from "tjs:getopts";
import path from "tjs:path";

const { createServer, stat, readDir, readFile, args } = tjs;

const options = getopts(args.slice(2), {
  alias: {
    port: "p",
    dir: "d",
    "max-connections": "m",
  },
  default: {
    port: 3002,
    dir: "./public",
    "max-connections": 100,
  },
});

// MIME type mapping
const mimeTypes = {
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || "application/octet-stream";
}

function sendError(res, statusCode, message) {
  // 检查响应头是否已经发送
  if (res.headersSent) {
    console.warn(`Headers already sent, cannot send error ${statusCode}`);
    // 如果响应头已经发送，则只记录错误并结束响应（如果尚未结束）
    if (!res.finished) {
      try {
        res.end();
      } catch (endError) {
        console.error("Failed to end response:", endError);
      }
    }
    return;
  }

  res.writeHead(statusCode, { "Content-Type": "text/html" });
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
  // 在函数开始处检查响应是否已经完成
  if (res.finished) {
    console.warn("Response already finished, cannot serve file:", filePath);
    return;
  }

  // 在函数开始处检查响应头是否已经发送
  if (res.headersSent) {
    console.warn("Headers already sent, cannot serve file:", filePath);
    return;
  }

  try {
    // Check if file exists and get stats
    const stats = await stat(filePath);

    if (stats.isDirectory) {
      // Try to serve index.html from directory
      const indexPath = path.join(filePath, "index.html");
      try {
        await stat(indexPath);
        // 检查是否已经发送了响应头
        if (res.headersSent) {
          console.warn("Headers already sent, cannot serve index.html");
          return;
        }
        return serveFile(indexPath, res);
      } catch {
        // Generate directory listing
        // 检查是否已经发送了响应头
        if (res.headersSent) {
          console.warn("Headers already sent, cannot serve directory listing");
          return;
        }
        return serveDirectoryListing(filePath, res);
      }
    }

    // Read and serve the file
    const content = await readFile(filePath);
    const mimeType = getMimeType(filePath);

    // 在发送响应前检查是否已经发送过响应头
    if (res.headersSent) {
      console.warn("Headers already sent, cannot serve file:", filePath);
      return;
    }

    res.writeHead(200, {
      "Content-Type": mimeType,
      "Content-Length": content.length,
      "Cache-Control": "public, max-age=3600",
      Connection: "keep-alive",
    });

    res.end(content);
  } catch (error) {
    // 在调用sendError前检查响应状态
    if (!res.headersSent && !res.finished) {
      // 使用error.code而不是tjs.errno
      if (error.code === "ENOENT") {
        sendError(res, 404, "File not found");
      } else if (error.code === "EACCES") {
        sendError(res, 403, "Access denied");
      } else {
        console.error("Error serving file:", error);
        sendError(res, 500, "Internal server error");
      }
    } else if (!res.finished) {
      console.error("Error after headers sent:", error);
      // 如果响应头已经发送，只能尝试结束响应
      try {
        res.end();
      } catch (endError) {
        console.error("Failed to end response:", endError);
      }
    }
  }
}

async function serveDirectoryListing(dirPath, res) {
  // 检查响应是否已经完成
  if (res.finished) {
    console.warn(
      "Response already finished, cannot serve directory listing for:",
      dirPath
    );
    return;
  }

  // 检查响应头是否已经发送
  if (res.headersSent) {
    console.warn(
      "Headers already sent, cannot serve directory listing for:",
      dirPath
    );
    return;
  }

  try {
    // 使用 readDir 并通过异步迭代获取文件列表
    const dirIter = await readDir(dirPath);
    const files = [];
    for await (const item of dirIter) {
      files.push(item.name);
    }

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
        const stats = await stat(fullPath);
        const isDir = stats.isDirectory;
        const size = isDir
          ? ""
          : `<span class="size">(${stats.size} bytes)</span>`;
        const className = isDir ? "file dir" : "file";
        const href = isDir ? `${file}/` : file;

        html += `<div class="${className}"><a href="${href}">${file}${
          isDir ? "/" : ""
        }</a>${size}</div>\n`;
      } catch {
        // Skip files we can't stat
      }
    }

    html += `
            <hr>
            <small>txiki.js file server</small>
        </body>
        </html>`;

    // 检查是否已经发送了响应头
    if (res.headersSent) {
      console.warn("Headers already sent, cannot serve directory listing");
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  } catch (error) {
    console.error("Error reading directory:", error);
    // 检查是否已经发送了响应头，避免重复发送
    if (!res.headersSent && !res.finished) {
      // 使用error.code而不是tjs.errno
      if (error.code === "ENOENT") {
        sendError(res, 404, "Directory not found");
      } else if (error.code === "EACCES") {
        sendError(res, 403, "Access denied");
      } else {
        sendError(res, 500, "Could not read directory");
      }
    } else if (!res.finished) {
      console.error("Error after headers sent:", error);
      // 如果响应头已经发送，则只记录错误并结束响应（如果尚未结束）
      try {
        res.end();
      } catch (endError) {
        console.error("Failed to end response:", endError);
      }
    }
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${options.port}`);
  let filePath = decodeURIComponent(url.pathname);

  // Security: prevent directory traversal
  if (filePath.includes("..") || filePath.includes("\0")) {
    sendError(res, 400, "Invalid file path");
    return;
  }

  // Remove leading slash and join with serve directory
  filePath = filePath.replace(/^\/+/, "");
  filePath = path.join(options.dir, filePath);

  console.log(`${req.method} ${req.url} -> ${filePath}`);

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendError(res, 405, "Method not allowed");
    return;
  }

  // 处理文件请求
  serveFile(filePath, res);
});

// 设置最大连接数
if (options["max-connections"] > 0) {
  server.maxConnections = options["max-connections"];
}

server.on("listening", () => {
  console.log(`File server listening on http://localhost:${options.port}`);
  console.log(`Serving files from: ${path.resolve(options.dir)}`);
  if (options["max-connections"] > 0) {
    console.log(`Max connections: ${options["max-connections"]}`);
  }
  console.log("\nFeatures:");
  console.log("  - Static file serving");
  console.log("  - Directory listings");
  console.log("  - MIME type detection");
  console.log("  - Basic security (path traversal protection)");
  console.log("  - HTTP Keep-Alive support");
});

server.listen(options.port, "127.0.0.1");
