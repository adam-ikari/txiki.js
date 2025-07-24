/**
 * Chunked/Streaming HTTP Parser Example using llhttp in txiki.js
 * 
 * This example demonstrates how to parse HTTP messages in chunks, simulating
 * a streaming scenario where data arrives incrementally.
 */

const core = globalThis[Symbol.for("tjs.internal.core")];
const LLHttp = core.LLHttp;

console.log("Chunked/Streaming HTTP Parser Example\n");

// Example: Chunked parsing (streaming)
function parseHttpChunked() {
  console.log("=== Chunked/Streaming Parsing ===");
  
  const parser = new LLHttp("request");
  
  // Simulate receiving HTTP data in chunks
  const chunks = [
    "GET /stream HTTP/1.1\r\n",
    "Host: streaming.example.com\r\n", 
    "Connection: keep-alive\r\n",
    "Accept: text/event-stream\r\n",
    "\r\n"
  ];
  
  console.log("Processing HTTP request in chunks:");
  
  let totalBytes = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`  Chunk ${i + 1}: ${JSON.stringify(chunk)}`);
    
    const bytes = parser.execute(chunk);
    totalBytes += bytes;
    console.log(`    Processed: ${bytes} bytes`);
  }
  
  const result = parser.getResult();
  console.log(`\nTotal processed: ${totalBytes} bytes`);
  console.log("Final result:");
  console.log(`  Method: ${result.method}`);
  console.log(`  URL: ${result.url}`);
  console.log("  Headers:", Object.keys(result.headers));
  console.log(`  Complete: ${result.complete}`);
  
  console.log();
}

// Example: Partial parsing
function parsePartialHttp() {
  console.log("=== Partial Parsing Example ===");
  
  const parser = new LLHttp("request");
  
  // Send only part of an HTTP request
  const partialRequest = "GET /partial HTTP/1.1\r\nHost: example.com\r\n";
  
  console.log("Processing partial HTTP request:");
  console.log(`  Data: ${JSON.stringify(partialRequest)}`);
  
  const bytes = parser.execute(partialRequest);
  const result = parser.getResult();
  
  console.log(`  Processed: ${bytes} bytes`);
  console.log("  Result:");
  console.log(`    Method: ${result.method}`);
  console.log(`    URL: ${result.url}`);
  console.log(`    Complete: ${result.complete}`);
  
  console.log();
}

// Run examples
parseHttpChunked();
parsePartialHttp();

console.log("=== Chunked/Streaming Examples Complete ===");