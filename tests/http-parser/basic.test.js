const core = globalThis[Symbol.for("tjs.internal.core")];
const LLHttp = core.LLHttp;

// Basic test for HTTP request parsing
function testBasicRequestParsing() {
  const parser = new LLHttp("request");
  const request = `GET /test HTTP/1.1\r\nHost: example.com\r\nContent-Type: text/plain\r\n\r\nHello World`;

  const bytesProcessed = parser.execute(request);
  console.assert(bytesProcessed > 0, "Should process some bytes");
  
  const result = parser.getResult();

  console.assert(result.method === "GET", `Method should be GET, got: ${result.method}`);
  console.assert(result.url === "/test", `URL should be /test, got: ${result.url}`);
  console.assert(result.httpMajor === 1, `HTTP major should be 1, got: ${result.httpMajor}`);
  console.assert(result.httpMinor === 1, `HTTP minor should be 1, got: ${result.httpMinor}`);
  console.assert(
    result.headers.Host === "example.com",
    `Host header mismatch, got: ${result.headers.Host}`
  );
  console.assert(
    result.headers["Content-Type"] === "text/plain",
    `Content-Type header mismatch, got: ${result.headers["Content-Type"]}`
  );
  console.assert(result.body === "Hello World", `Body mismatch, got: ${result.body}`);
  console.assert(result.complete === true, "Message should be complete");

  console.log("✓ Basic request parsing test passed!");
}

// Basic test for HTTP response parsing
function testBasicResponseParsing() {
  const parser = new LLHttp("response");
  const response = `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"message":"success"}`;

  const bytesProcessed = parser.execute(response);
  console.assert(bytesProcessed > 0, "Should process some bytes");
  
  const result = parser.getResult();

  console.assert(result.statusCode === 200, `Status code should be 200, got: ${result.statusCode}`);
  console.assert(result.httpMajor === 1, `HTTP major should be 1, got: ${result.httpMajor}`);
  console.assert(result.httpMinor === 1, `HTTP minor should be 1, got: ${result.httpMinor}`);
  console.assert(
    result.headers["Content-Type"] === "application/json",
    `Content-Type header mismatch, got: ${result.headers["Content-Type"]}`
  );
  console.assert(result.body === '{"message":"success"}', `Body mismatch, got: ${result.body}`);
  console.assert(result.complete === true, "Message should be complete");

  console.log("✓ Basic response parsing test passed!");
}

// Run tests
testBasicRequestParsing();
testBasicResponseParsing();