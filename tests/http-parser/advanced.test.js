const core = globalThis[Symbol.for("tjs.internal.core")];
const LLHttp = core.LLHttp;

// Test chunked/streaming parsing
function testChunkedParsing() {
  const parser = new LLHttp("request");
  
  // Send HTTP request in chunks
  const chunks = [
    "GET /api/test HTTP/1.1\r\n",
    "Host: localhost:3000\r\n",
    "Content-Type: application/json\r\n",
    "Content-Length: 20\r\n",
    "\r\n",
    '{"key": "value123"}'
  ];
  
  let totalBytes = 0;
  for (const chunk of chunks) {
    const bytes = parser.execute(chunk);
    totalBytes += bytes;
  }
  
  const result = parser.getResult();
  
  console.assert(result.method === "GET", `Method should be GET, got: ${result.method}`);
  console.assert(result.url === "/api/test", `URL should be /api/test, got: ${result.url}`);
  console.assert(result.headers.Host === "localhost:3000", `Host header incorrect, got: ${result.headers.Host}`);
  console.assert(result.body === '{"key": "value123"}', `Body incorrect, got: ${result.body}`);
  console.assert(result.complete === true, "Message should be complete");
  
  console.log("✓ Chunked parsing test passed!");
}

// Test parser reset functionality
function testParserReset() {
  const parser = new LLHttp("request");
  
  // First parsing
  const request1 = `GET /first HTTP/1.1\r\nHost: example.com\r\n\r\nFirst body`;
  parser.execute(request1);
  let result = parser.getResult();
  console.assert(result.url === "/first", `First URL should be /first, got: ${result.url}`);
  
  // Reset parser
  parser.reset();
  
  // Second parsing
  const request2 = `POST /second HTTP/1.1\r\nHost: test.com\r\n\r\nSecond body`;
  parser.execute(request2);
  result = parser.getResult();
  console.assert(result.method === "POST", `Method should be POST, got: ${result.method}`);
  console.assert(result.url === "/second", `Second URL should be /second, got: ${result.url}`);
  console.assert(result.headers.Host === "test.com", `Host should be test.com, got: ${result.headers.Host}`);
  
  console.log("✓ Parser reset test passed!");
}

// Test error handling
function testErrorHandling() {
  const parser = new LLHttp("request");
  
  try {
    // Invalid HTTP request
    parser.execute("INVALID REQUEST");
    console.assert(false, "Should have thrown an error");
  } catch (e) {
    console.assert(e.message.includes("Parse error"), `Should be parse error, got: ${e.message}`);
    console.log("✓ Error handling test passed!");
  }
}

// Test HTTP constants
function testConstants() {
  console.assert(LLHttp.HTTP_GET === 1, `HTTP_GET should be 1, got: ${LLHttp.HTTP_GET}`);
  console.assert(LLHttp.HTTP_POST === 3, `HTTP_POST should be 3, got: ${LLHttp.HTTP_POST}`);
  console.assert(LLHttp.HTTP_STATUS_OK === 200, `HTTP_STATUS_OK should be 200, got: ${LLHttp.HTTP_STATUS_OK}`);
  console.assert(LLHttp.HTTP_STATUS_NOT_FOUND === 404, `HTTP_STATUS_NOT_FOUND should be 404, got: ${LLHttp.HTTP_STATUS_NOT_FOUND}`);
  
  console.log("✓ Constants test passed!");
}

// Run tests
testChunkedParsing();
testParserReset();
testErrorHandling();
testConstants();