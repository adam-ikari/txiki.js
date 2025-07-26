/**
 * HTTP Parser Example using llhttp in txiki.js
 * 
 * This example demonstrates how to use the LLHttp class to parse HTTP requests and responses.
 */

const core = globalThis[Symbol.for("tjs.internal.core")];
const LLHttp = core.LLHttp;

console.log("HTTP Parser Example with llhttp\n");

// Example 1: Parse an HTTP Request
function parseHttpRequest() {
  console.log("=== Example 1: Parsing HTTP Request ===");
  
  const parser = new LLHttp("request");
  
  // Sample HTTP request
  const body = '{"name":"John Doe","email":"john@example.com"}';
  const httpRequest = `POST /api/users HTTP/1.1
Host: api.example.com
Content-Type: application/json
Authorization: Bearer abc123
Content-Length: ${body.length}

${body}`;
  
  console.log("Raw HTTP request:");
  console.log(httpRequest);
  console.log();
  
  // Parse the request
  const bytesProcessed = parser.execute(httpRequest);
  const result = parser.getResult();
  
  console.log(`Processed ${bytesProcessed} bytes`);
  console.log("Parsed result:");
  console.log(`  Method: ${result.method}`);
  console.log(`  URL: ${result.url}`);
  console.log(`  HTTP Version: ${result.httpMajor}.${result.httpMinor}`);
  console.log("  Headers:");
  for (const [key, value] of Object.entries(result.headers)) {
    console.log(`    ${key}: ${value}`);
  }
  console.log(`  Body: ${result.body}`);
  console.log(`  Complete: ${result.complete}`);
  
  // Access parser methods
  console.log("\nParser methods:");
  console.log(`  Method name: ${parser.getMethodName()}`);
  console.log(`  Should keep alive: ${parser.shouldKeepAlive()}`);
  
  console.log();
}

// Example 2: Parse an HTTP Response  
function parseHttpResponse() {
  console.log("=== Example 2: Parsing HTTP Response ===");
  
  const parser = new LLHttp("response");
  
  // Sample HTTP response
  const responseBody = '{"id":123,"status":"created","ok":true}';
  const httpResponse = `HTTP/1.1 201 Created\r\nContent-Type: application/json\r\nLocation: /api/users/123\r\nSet-Cookie: session=xyz789; HttpOnly\r\nContent-Length: ${responseBody.length}\r\n\r\n${responseBody}`;
  
  console.log("Raw HTTP response:");
  console.log(httpResponse);
  console.log();
  
  // Parse the response
  const bytesProcessed = parser.execute(httpResponse);
  const result = parser.getResult();
  
  console.log(`Processed ${bytesProcessed} bytes`);
  console.log("Parsed result:");
  console.log(`  Status: ${result.status}`);
  console.log(`  Status Code: ${result.statusCode}`);
  console.log(`  HTTP Version: ${result.httpMajor}.${result.httpMinor}`);
  console.log("  Headers:");
  for (const [key, value] of Object.entries(result.headers)) {
    console.log(`    ${key}: ${value}`);
  }
  console.log(`  Body: ${result.body}`);
  console.log(`  Complete: ${result.complete}`);
  
  console.log("\nParser methods:");
  console.log(`  Status code: ${parser.getStatusCode()}`);
  
  console.log();
}

// Example 3: Chunked parsing (streaming)
function parseHttpChunked() {
  console.log("=== Example 3: Chunked/Streaming Parsing ===");
  
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

// Example 4: Parser reuse
function demonstrateParserReuse() {
  console.log("=== Example 4: Parser Reuse ===");
  
  const parser = new LLHttp("request");
  
  // Parse first request
  const request1 = "GET /first HTTP/1.1\r\nHost: example.com\r\n\r\n";
  parser.execute(request1);
  const result1 = parser.getResult();
  console.log(`First request - URL: ${result1.url}, Host: ${result1.headers.Host}`);
  
  // Reset parser and parse second request
  parser.reset();
  const request2 = "POST /second HTTP/1.1\r\nHost: api.example.com\r\nContent-Length: 4\r\n\r\ntest";
  parser.execute(request2);
  const result2 = parser.getResult();
  console.log(`Second request - Method: ${result2.method}, URL: ${result2.url}, Body: ${result2.body}`);
  
  console.log();
}

// Example 5: Create HTTP responses
function createHttpResponse() {
  console.log("=== Example 5: Creating HTTP Responses ===");
  
  const parser = new LLHttp();
  
  // Create a success response
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "X-API-Version": "1.0"
  };
  
  const body = JSON.stringify({
    message: "Operation successful",
    timestamp: new Date().toISOString(),
    data: { id: 456, name: "Sample" }
  });
  
  const response = parser.createResponse(200, headers, body);
  
  console.log("Created HTTP response:");
  console.log(response);
  
  // Verify by parsing it back
  const responseParser = new LLHttp("response");
  responseParser.execute(response);
  const parsedBack = responseParser.getResult();
  
  console.log("\nParsed back verification:");
  console.log(`  Status Code: ${parsedBack.statusCode}`);
  console.log(`  Content-Type: ${parsedBack.headers["Content-Type"]}`);
  console.log(`  Body length: ${parsedBack.body.length}`);
  
  console.log();
}

// Example 6: Using HTTP constants
function demonstrateConstants() {
  console.log("=== Example 6: HTTP Constants ===");
  
  console.log("HTTP Methods:");
  console.log(`  GET: ${LLHttp.HTTP_GET}`);
  console.log(`  POST: ${LLHttp.HTTP_POST}`);
  console.log(`  PUT: ${LLHttp.HTTP_PUT}`);
  console.log(`  DELETE: ${LLHttp.HTTP_DELETE}`);
  
  console.log("\nHTTP Status Codes:");
  console.log(`  OK: ${LLHttp.HTTP_STATUS_OK}`);
  console.log(`  Created: ${LLHttp.HTTP_STATUS_CREATED}`);
  console.log(`  Bad Request: ${LLHttp.HTTP_STATUS_BAD_REQUEST}`);
  console.log(`  Not Found: ${LLHttp.HTTP_STATUS_NOT_FOUND}`);
  console.log(`  Internal Server Error: ${LLHttp.HTTP_STATUS_INTERNAL_SERVER_ERROR}`);
  
  console.log("\nParser Types:");
  console.log(`  Both: ${LLHttp.HTTP_BOTH}`);
  console.log(`  Request: ${LLHttp.HTTP_REQUEST}`);
  console.log(`  Response: ${LLHttp.HTTP_RESPONSE}`);
  
  console.log();
}

// Example 7: Error handling
function demonstrateErrorHandling() {
  console.log("=== Example 7: Error Handling ===");
  
  const parser = new LLHttp("request");
  
  try {
    // Try to parse invalid HTTP
    parser.execute("NOT A VALID HTTP REQUEST");
  } catch (error) {
    console.log(`Caught expected error: ${error.message}`);
  }
  
  try {
    // Try to parse incomplete HTTP
    parser.reset();
    parser.execute("GET /test HTTP/1.1\r\nHost: example.com\r\n");
    // Missing final \r\n, but this should still work for partial parsing
    const result = parser.getResult();
    console.log(`Partial parse result - Complete: ${result.complete}`);
  } catch (error) {
    console.log(`Error with partial HTTP: ${error.message}`);
  }
  
  console.log();
}

// Run all examples
parseHttpRequest();
parseHttpResponse();
parseHttpChunked();
demonstrateParserReuse();
createHttpResponse();
demonstrateConstants();
demonstrateErrorHandling();

console.log("=== HTTP Parser Examples Complete ===");
console.log("\nThe LLHttp class provides a powerful and efficient way to parse HTTP messages");
console.log("using the llhttp library. It supports both requests and responses, handles");
console.log("headers and bodies correctly, and provides useful utilities for HTTP processing.");