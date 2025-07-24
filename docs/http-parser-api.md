# HTTP Parser API Documentation

在txiki.js中使用llhttp库实现的HTTP解析JavaScript API。

## 概述

LLHttp类提供了高性能的HTTP消息解析功能，支持HTTP请求和响应的解析，以及HTTP响应的创建。

## 基本用法

```javascript
const core = globalThis[Symbol.for("tjs.internal.core")];
const LLHttp = core.LLHttp;

// 创建解析器
const parser = new LLHttp("request");  // 或 "response" 或 "both"

// 解析HTTP消息
const bytesProcessed = parser.execute(httpString);

// 获取解析结果
const result = parser.getResult();
```

## API 参考

### 构造函数

```javascript
new LLHttp([type])
```

- `type` (string, 可选): 解析器类型
  - `"request"` - 仅解析HTTP请求
  - `"response"` - 仅解析HTTP响应  
  - `"both"` - 可解析请求和响应 (默认)

### 方法

#### `execute(data)`

解析HTTP数据。

- `data` (string): 要解析的HTTP数据
- 返回: (number) 处理的字节数

#### `getResult()`

获取解析结果对象。

返回对象包含:
- `method` (string): HTTP方法 (仅请求)
- `url` (string): 请求URL (仅请求)
- `status` (string): 状态文本 (仅响应)
- `statusCode` (number): 状态码 (仅响应)
- `httpMajor` (number): HTTP主版本号
- `httpMinor` (number): HTTP次版本号
- `headers` (object): HTTP头部键值对
- `body` (string): 消息体
- `complete` (boolean): 消息是否解析完整

#### `reset()`

重置解析器状态，可用于解析新的HTTP消息。

#### `finish()`

完成当前HTTP消息的解析。

#### `getMethodName()`

获取HTTP方法名称。

- 返回: (string) 方法名称

#### `getStatusCode()`

获取HTTP状态码。

- 返回: (number) 状态码

#### `getHttpVersion()`

获取HTTP版本信息。

- 返回: (object) `{major: number, minor: number}`

#### `shouldKeepAlive()`

检查连接是否应该保持活跃。

- 返回: (boolean) 是否保持连接

#### `createResponse(statusCode, headers, body)`

创建HTTP响应字符串。

- `statusCode` (number): 状态码
- `headers` (object, 可选): 响应头部
- `body` (string, 可选): 响应体
- 返回: (string) 完整的HTTP响应

### 常量

#### HTTP方法
- `LLHttp.HTTP_GET` = 1
- `LLHttp.HTTP_POST` = 3
- `LLHttp.HTTP_PUT` = 4
- `LLHttp.HTTP_DELETE` = 0
- `LLHttp.HTTP_HEAD` = 2
- `LLHttp.HTTP_OPTIONS` = 6
- `LLHttp.HTTP_PATCH` = 28

#### 解析器类型
- `LLHttp.HTTP_BOTH` = 0
- `LLHttp.HTTP_REQUEST` = 1
- `LLHttp.HTTP_RESPONSE` = 2

#### 常用状态码
- `LLHttp.HTTP_STATUS_OK` = 200
- `LLHttp.HTTP_STATUS_CREATED` = 201
- `LLHttp.HTTP_STATUS_NO_CONTENT` = 204
- `LLHttp.HTTP_STATUS_BAD_REQUEST` = 400
- `LLHttp.HTTP_STATUS_UNAUTHORIZED` = 401
- `LLHttp.HTTP_STATUS_FORBIDDEN` = 403
- `LLHttp.HTTP_STATUS_NOT_FOUND` = 404
- `LLHttp.HTTP_STATUS_INTERNAL_SERVER_ERROR` = 500

## 使用示例

### 解析HTTP请求

```javascript
const parser = new LLHttp("request");
const request = "POST /api/login HTTP/1.1\r\nHost: example.com\r\nContent-Type: application/json\r\nContent-Length: 25\r\n\r\n{\"user\":\"john\",\"pass\":\"123\"}";

parser.execute(request);
const result = parser.getResult();

console.log(result.method);    // "POST"
console.log(result.url);       // "/api/login"
console.log(result.headers);   // {"Host": "example.com", "Content-Type": "application/json", ...}
console.log(result.body);      // "{\"user\":\"john\",\"pass\":\"123\"}"
```

### 解析HTTP响应

```javascript
const parser = new LLHttp("response");
const response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 18\r\n\r\n{\"success\": true}";

parser.execute(response);
const result = parser.getResult();

console.log(result.statusCode); // 200
console.log(result.status);     // "OK"
console.log(result.body);       // "{\"success\": true}"
```

### 分块解析

```javascript
const parser = new LLHttp("request");

// 可以分多次调用execute()
parser.execute("GET /api HTTP/1.1\r\n");
parser.execute("Host: example.com\r\n");
parser.execute("\r\n");

const result = parser.getResult();
console.log(result.complete); // true
```

### 解析器重用

```javascript
const parser = new LLHttp("request");

// 解析第一个请求
parser.execute("GET /first HTTP/1.1\r\nHost: example.com\r\n\r\n");
const result1 = parser.getResult();

// 重置后解析第二个请求
parser.reset();
parser.execute("POST /second HTTP/1.1\r\nHost: example.com\r\n\r\n");
const result2 = parser.getResult();
```

### 创建HTTP响应

```javascript
const parser = new LLHttp();
const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-cache"
};
const body = '{"message": "Hello World"}';

const response = parser.createResponse(200, headers, body);
console.log(response);
// HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nCache-Control: no-cache\r\n\r\n{"message": "Hello World"}
```

## 错误处理

解析无效HTTP数据时会抛出异常:

```javascript
try {
  parser.execute("INVALID HTTP");
} catch (error) {
  console.log(error.message); // "Parse error: HPE_INVALID_METHOD (Invalid method encountered)"
}
```

## 性能特性

- 基于llhttp的高性能解析器
- 支持流式/分块解析
- 零拷贝头部解析
- 内存高效的body处理
- 解析器可重用，减少内存分配

## 注意事项

1. `Content-Length`头部必须与实际body长度匹配
2. HTTP消息必须使用正确的CRLF (`\r\n`) 行结束符
3. 解析器状态会在每次`reset()`或新消息开始时重置
4. `complete`字段指示消息是否完整解析，对于流式处理很重要