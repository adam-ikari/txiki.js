const core = globalThis[Symbol.for("tjs.internal.core")];
const LLHttp = core.LLHttp;

// Test response creation functionality
function testResponseCreation() {
  const parser = new LLHttp();
  const headers = {
    "Content-Type": "text/html",
    "X-Custom": "value"
  };
  const body = "<html><body>Hello</body></html>";
  
  const response = parser.createResponse(200, headers, body);
  const expected = `HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nX-Custom: value\r\n\r\n<html><body>Hello</body></html>`;

  console.assert(response === expected, "Response creation failed");
  console.log("✓ Response creation test passed!");
}

// Test response creation with different status codes
function testResponseCreationWithStatusCodes() {
  const parser = new LLHttp();
  
  // Test 404 response
  const notFoundResponse = parser.createResponse(404, {"Content-Type": "text/plain"}, "Not Found");
  const expected404 = `HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\n\r\nNot Found`;
  console.assert(notFoundResponse === expected404, "404 response creation failed");
  
  // Test 500 response
  const errorResponse = parser.createResponse(500, {"Content-Type": "application/json"}, '{"error":"Internal Server Error"}');
  const expected500 = `HTTP/1.1 500 Internal Server Error\r\nContent-Type: application/json\r\n\r\n{"error":"Internal Server Error"}`;
  console.assert(errorResponse === expected500, "500 response creation failed");
  
  console.log("✓ Response creation with status codes test passed!");
}

// Test parser methods
function testParserMethods() {
  const parser = new LLHttp("request");
  const request = `GET /test HTTP/1.1\r\nHost: example.com\r\n\r\n`;
  
  parser.execute(request);
  
  // Test getMethodName
  const methodName = parser.getMethodName();
  console.assert(methodName === "GET", `Method name should be GET, got: ${methodName}`);
  
  // Test getHttpVersion
  const version = parser.getHttpVersion();
  console.assert(version.major === 1, `HTTP major should be 1, got: ${version.major}`);
  console.assert(version.minor === 1, `HTTP minor should be 1, got: ${version.minor}`);
  
  // Test shouldKeepAlive (default should be true for HTTP/1.1 without Connection: close)
  const keepAlive = parser.shouldKeepAlive();
  console.assert(keepAlive === true, `Should keep alive by default, got: ${keepAlive}`);
  
  console.log("✓ Parser methods test passed!");
}

// Test response parser methods
function testResponseParserMethods() {
  const parser = new LLHttp("response");
  const response = `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"message":"success"}`;
  
  parser.execute(response);
  
  // Test getStatusCode
  const statusCode = parser.getStatusCode();
  console.assert(statusCode === 200, `Status code should be 200, got: ${statusCode}`);
  
  console.log("✓ Response parser methods test passed!");
}

// Run tests
testResponseCreation();
testResponseCreationWithStatusCodes();
testParserMethods();
testResponseParserMethods();