/**
 * HTTP Parser Reuse Example using llhttp in txiki.js
 * 
 * This example demonstrates how to reuse a parser instance for multiple messages,
 * which is more efficient than creating a new parser for each message.
 */

const core = globalThis[Symbol.for("tjs.internal.core")];
const LLHttp = core.LLHttp;

console.log("HTTP Parser Reuse Example\n");

// Example: Parser reuse
function demonstrateParserReuse() {
  console.log("=== Parser Reuse ===");
  
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
  
  // Reset parser and parse third request
  parser.reset();
  const request3 = "PUT /third HTTP/1.1\r\nHost: update.example.com\r\nContent-Length: 6\r\n\r\nupdate";
  parser.execute(request3);
  const result3 = parser.getResult();
  console.log(`Third request - Method: ${result3.method}, URL: ${result3.url}, Body: ${result3.body}`);
  
  console.log();
}

// Example: Reuse with different message types
function demonstrateMixedReuse() {
  console.log("=== Mixed Message Type Reuse ===");
  
  // Create a parser that can handle both requests and responses
  const parser = new LLHttp("both");
  
  // Parse a request
  const request = "DELETE /resource HTTP/1.1\r\nHost: api.example.com\r\n\r\n";
  parser.execute(request);
  const requestResult = parser.getResult();
  console.log(`Request - Method: ${requestResult.method}, URL: ${requestResult.url}`);
  
  // Reset and parse a response
  parser.reset();
  const response = "HTTP/1.1 204 No Content\r\nServer: txiki.js\r\n\r\n";
  parser.execute(response);
  const responseResult = parser.getResult();
  console.log(`Response - Status: ${responseResult.status}, Code: ${responseResult.statusCode}`);
  
  console.log();
}

// Run examples
demonstrateParserReuse();
demonstrateMixedReuse();

console.log("=== Parser Reuse Examples Complete ===");