/**
 * Basic HTTP Parser Example using llhttp in txiki.js
 * 
 * This example demonstrates how to use the LLHttp class to parse HTTP requests and responses.
 */

const core = globalThis[Symbol.for("tjs.internal.core")];
const LLHttp = core.LLHttp;

console.log("Basic HTTP Parser Example with llhttp\n");

// Example 1: Parse an HTTP Request
function parseHttpRequest() {
  console.log("=== Example 1: Parsing HTTP Request ===");
  
  const parser = new LLHttp("request");
  
  // Sample HTTP request
  const body = '{"name":"John Doe","email":"john@example.com"}';
  const httpRequest = `POST /api/users HTTP/1.1\r\nHost: api.example.com\r\nContent-Type: application/json\r\nAuthorization: Bearer abc123\r\nContent-Length: ${body.length}\r\n\r\n${body}`;
  
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

// Run examples
parseHttpRequest();
parseHttpResponse();

console.log("=== Basic HTTP Parser Examples Complete ===");