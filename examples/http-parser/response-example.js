/**
 * HTTP Response Creation Example using llhttp in txiki.js
 * 
 * This example demonstrates how to create HTTP responses using the LLHttp class.
 */

const core = globalThis[Symbol.for("tjs.internal.core")];
const LLHttp = core.LLHttp;

console.log("HTTP Response Creation Example\n");

// Example: Create HTTP responses
function createHttpResponse() {
  console.log("=== Creating HTTP Responses ===");
  
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

// Example: Create different types of responses
function createVariousResponses() {
  console.log("=== Creating Various Response Types ===");
  
  const parser = new LLHttp();
  
  // HTML response
  const htmlResponse = parser.createResponse(200, {
    "Content-Type": "text/html; charset=utf-8"
  }, "<!DOCTYPE html><html><body><h1>Hello World</h1></body></html>");
  
  console.log("HTML Response:");
  console.log(htmlResponse);
  console.log();
  
  // Plain text response
  const textResponse = parser.createResponse(200, {
    "Content-Type": "text/plain"
  }, "This is a plain text response");
  
  console.log("Text Response:");
  console.log(textResponse);
  console.log();
  
  // JSON response
  const jsonResponse = parser.createResponse(200, {
    "Content-Type": "application/json"
  }, JSON.stringify({ success: true, data: [] }));
  
  console.log("JSON Response:");
  console.log(jsonResponse);
  console.log();
  
  // Error response
  const errorResponse = parser.createResponse(500, {
    "Content-Type": "application/json"
  }, JSON.stringify({ error: "Internal Server Error" }));
  
  console.log("Error Response:");
  console.log(errorResponse);
  console.log();
}

// Run examples
createHttpResponse();
createVariousResponses();

console.log("=== HTTP Response Creation Examples Complete ===");