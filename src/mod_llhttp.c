/*
 * txiki.js
 *
 * Copyright (c) 2019-present Saúl Ibarra Corretgé <s@saghul.net>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

#include "../deps/llhttp/include/llhttp.h"
#include "private.h"
#include "tjs.h"
#include "utils.h"

#include <stdio.h>
#include <string.h>
#include <stdlib.h>


static JSClassID tjs_llhttp_class_id;

/* HTTP parse result */
typedef struct {
    char *method;
    char *url;
    char *status;
    char *body;
    size_t body_len;
    JSValue headers;
    int status_code;
    int http_major;
    int http_minor;
    int message_complete;
    
    /* Temporary buffers for parsing */
    char *current_header_field;
    char *current_header_value;
    char *body_buffer;
    size_t body_capacity;
    
    /* Header parsing state */
    int last_was_field;  /* 1 if last callback was header_field, 0 if header_value */
} TJSLlhttpResult;

typedef struct {
    JSContext *ctx;
    llhttp_t parser;
    llhttp_settings_t settings;
    JSValue js_this;
    TJSLlhttpResult result;
} TJSLlhttp;

/* Forward declarations */
static void tjs__llhttp_reset_result(TJSLlhttp *s);
static JSValue tjs_llhttp_get_result(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv);
static void tjs__llhttp_init_callbacks(TJSLlhttp *s);

/* HTTP parsing callbacks */
static int tjs__llhttp_on_message_begin(llhttp_t* parser);
static int tjs__llhttp_on_url(llhttp_t* parser, const char *at, size_t length);
static int tjs__llhttp_on_status(llhttp_t* parser, const char *at, size_t length);
static int tjs__llhttp_on_method(llhttp_t* parser, const char *at, size_t length);
static int tjs__llhttp_on_header_field(llhttp_t* parser, const char *at, size_t length);
static int tjs__llhttp_on_header_value(llhttp_t* parser, const char *at, size_t length);
static int tjs__llhttp_on_headers_complete(llhttp_t* parser);
static int tjs__llhttp_on_body(llhttp_t* parser, const char *at, size_t length);
static int tjs__llhttp_on_message_complete(llhttp_t* parser);

static void tjs__llhttp_finalizer(JSRuntime *rt, JSValue val) {
    TJSLlhttp *s = JS_GetOpaque(val, tjs_llhttp_class_id);
    if (s) {
        tjs__llhttp_reset_result(s);
        JS_FreeValueRT(rt, s->js_this);
        free(s);
    }
}

static void tjs__llhttp_reset_result(TJSLlhttp *s) {
    if (!s) {
        return;
    }

    if (s->result.method) {
        free(s->result.method);
        s->result.method = NULL;
    }
    if (s->result.url) {
        free(s->result.url);
        s->result.url = NULL;
    }
    if (s->result.status) {
        free(s->result.status);
        s->result.status = NULL;
    }
    if (s->result.body) {
        free(s->result.body);
        s->result.body = NULL;
    }
    if (s->result.current_header_field) {
        free(s->result.current_header_field);
        s->result.current_header_field = NULL;
    }
    if (s->result.current_header_value) {
        free(s->result.current_header_value);
        s->result.current_header_value = NULL;
    }
    if (s->result.body_buffer) {
        free(s->result.body_buffer);
        s->result.body_buffer = NULL;
    }
    if (!JS_IsUndefined(s->result.headers)) {
        JS_FreeValue(s->ctx, s->result.headers);
        s->result.headers = JS_UNDEFINED;
    }
    s->result.body_len = 0;
    s->result.body_capacity = 0;
    s->result.status_code = 0;
    s->result.http_major = 0;
    s->result.http_minor = 0;
    s->result.message_complete = 0;
    s->result.last_was_field = 0;
}

static void tjs__llhttp_init_callbacks(TJSLlhttp *s) {
    memset(&s->settings, 0, sizeof(s->settings));
    
    /* Set up HTTP parsing callbacks */
    s->settings.on_message_begin = tjs__llhttp_on_message_begin;
    s->settings.on_url = tjs__llhttp_on_url;
    s->settings.on_status = tjs__llhttp_on_status;
    s->settings.on_method = tjs__llhttp_on_method;
    s->settings.on_header_field = tjs__llhttp_on_header_field;
    s->settings.on_header_value = tjs__llhttp_on_header_value;
    s->settings.on_headers_complete = tjs__llhttp_on_headers_complete;
    s->settings.on_body = tjs__llhttp_on_body;
    s->settings.on_message_complete = tjs__llhttp_on_message_complete;
}

/* Callback implementations */
static int tjs__llhttp_on_message_begin(llhttp_t* parser) {
    TJSLlhttp *s = (TJSLlhttp*)parser->data;
    tjs__llhttp_reset_result(s);
    s->result.headers = JS_NewObject(s->ctx);
    return 0;
}

static int tjs__llhttp_on_url(llhttp_t* parser, const char *at, size_t length) {
    TJSLlhttp *s = (TJSLlhttp*)parser->data;
    
    if (s->result.url) {
        size_t old_len = strlen(s->result.url);
        char *new_url = realloc(s->result.url, old_len + length + 1);
        if (!new_url) return -1;
        s->result.url = new_url;
        memcpy(s->result.url + old_len, at, length);
        s->result.url[old_len + length] = '\0';
    } else {
        s->result.url = malloc(length + 1);
        if (!s->result.url) return -1;
        memcpy(s->result.url, at, length);
        s->result.url[length] = '\0';
    }
    return 0;
}

static int tjs__llhttp_on_status(llhttp_t* parser, const char *at, size_t length) {
    TJSLlhttp *s = (TJSLlhttp*)parser->data;
    
    if (s->result.status) {
        size_t old_len = strlen(s->result.status);
        char *new_status = realloc(s->result.status, old_len + length + 1);
        if (!new_status) return -1;
        s->result.status = new_status;
        memcpy(s->result.status + old_len, at, length);
        s->result.status[old_len + length] = '\0';
    } else {
        s->result.status = malloc(length + 1);
        if (!s->result.status) return -1;
        memcpy(s->result.status, at, length);
        s->result.status[length] = '\0';
    }
    return 0;
}

static int tjs__llhttp_on_method(llhttp_t* parser, const char *at, size_t length) {
    TJSLlhttp *s = (TJSLlhttp*)parser->data;
    
    if (s->result.method) {
        size_t old_len = strlen(s->result.method);
        char *new_method = realloc(s->result.method, old_len + length + 1);
        if (!new_method) return -1;
        s->result.method = new_method;
        memcpy(s->result.method + old_len, at, length);
        s->result.method[old_len + length] = '\0';
    } else {
        s->result.method = malloc(length + 1);
        if (!s->result.method) return -1;
        memcpy(s->result.method, at, length);
        s->result.method[length] = '\0';
    }
    return 0;
}

static int tjs__llhttp_on_header_field(llhttp_t* parser, const char *at, size_t length) {
    TJSLlhttp *s = (TJSLlhttp*)parser->data;
    
    /* If this is a new header field (after a value), save the previous header */
    if (!s->result.last_was_field && s->result.current_header_field && s->result.current_header_value) {
        JS_SetPropertyStr(s->ctx, s->result.headers, s->result.current_header_field, 
                         JS_NewString(s->ctx, s->result.current_header_value));
        free(s->result.current_header_field);
        free(s->result.current_header_value);
        s->result.current_header_field = NULL;
        s->result.current_header_value = NULL;
    }
    
    /* Append to current header field or create new one */
    if (s->result.current_header_field && s->result.last_was_field) {
        /* Continue building the same field */
        size_t old_len = strlen(s->result.current_header_field);
        char *new_field = realloc(s->result.current_header_field, old_len + length + 1);
        if (!new_field) return -1;
        s->result.current_header_field = new_field;
        memcpy(s->result.current_header_field + old_len, at, length);
        s->result.current_header_field[old_len + length] = '\0';
    } else {
        /* Start new field */
        s->result.current_header_field = malloc(length + 1);
        if (!s->result.current_header_field) return -1;
        memcpy(s->result.current_header_field, at, length);
        s->result.current_header_field[length] = '\0';
    }
    
    s->result.last_was_field = 1;
    return 0;
}

static int tjs__llhttp_on_header_value(llhttp_t* parser, const char *at, size_t length) {
    TJSLlhttp *s = (TJSLlhttp*)parser->data;
    
    if (s->result.current_header_value && !s->result.last_was_field) {
        /* Continue building the same value */
        size_t old_len = strlen(s->result.current_header_value);
        char *new_value = realloc(s->result.current_header_value, old_len + length + 1);
        if (!new_value) return -1;
        s->result.current_header_value = new_value;
        memcpy(s->result.current_header_value + old_len, at, length);
        s->result.current_header_value[old_len + length] = '\0';
    } else {
        /* Start new value */
        if (s->result.current_header_value) {
            free(s->result.current_header_value);
        }
        s->result.current_header_value = malloc(length + 1);
        if (!s->result.current_header_value) return -1;
        memcpy(s->result.current_header_value, at, length);
        s->result.current_header_value[length] = '\0';
    }
    
    s->result.last_was_field = 0;
    return 0;
}

static int tjs__llhttp_on_headers_complete(llhttp_t* parser) {
    TJSLlhttp *s = (TJSLlhttp*)parser->data;
    
    /* Save the last header if any */
    if (s->result.current_header_field && s->result.current_header_value) {
        JS_SetPropertyStr(s->ctx, s->result.headers, s->result.current_header_field, 
                         JS_NewString(s->ctx, s->result.current_header_value));
        free(s->result.current_header_field);
        free(s->result.current_header_value);
        s->result.current_header_field = NULL;
        s->result.current_header_value = NULL;
    }
    
    /* Store parser state */
    s->result.status_code = llhttp_get_status_code(parser);
    s->result.http_major = llhttp_get_http_major(parser);
    s->result.http_minor = llhttp_get_http_minor(parser);
    
    return 0;
}

static int tjs__llhttp_on_body(llhttp_t* parser, const char *at, size_t length) {
    TJSLlhttp *s = (TJSLlhttp*)parser->data;
    
    /* Expand body buffer if needed */
    if (s->result.body_len + length > s->result.body_capacity) {
        size_t new_capacity = s->result.body_capacity * 2;
        if (new_capacity < s->result.body_len + length) {
            new_capacity = s->result.body_len + length;
        }
        if (new_capacity < 1024) {
            new_capacity = 1024;
        }
        
        char *new_buffer = realloc(s->result.body_buffer, new_capacity);
        if (!new_buffer) return -1;
        s->result.body_buffer = new_buffer;
        s->result.body_capacity = new_capacity;
    }
    
    /* Append to body */
    memcpy(s->result.body_buffer + s->result.body_len, at, length);
    s->result.body_len += length;
    
    return 0;
}

static int tjs__llhttp_on_message_complete(llhttp_t* parser) {
    TJSLlhttp *s = (TJSLlhttp*)parser->data;
    
    /* Finalize body */
    if (s->result.body_len > 0 && s->result.body_buffer) {
        s->result.body = malloc(s->result.body_len + 1);
        if (s->result.body) {
            memcpy(s->result.body, s->result.body_buffer, s->result.body_len);
            s->result.body[s->result.body_len] = '\0';
        }
    }
    
    s->result.message_complete = 1;
    return 0;
}

static JSClassDef tjs_llhttp_class = {
    "Llhttp",
    .finalizer = tjs__llhttp_finalizer,
};

static JSValue tjs_llhttp_constructor(JSContext *ctx, JSValueConst new_target, int argc, JSValueConst *argv) {
    TJSLlhttp *s = calloc(1, sizeof(*s));
    if (!s) {
        return JS_EXCEPTION;
    }

    s->ctx = ctx;
    s->js_this = JS_UNDEFINED;
    s->result.headers = JS_UNDEFINED;

    llhttp_settings_init(&s->settings);
    tjs__llhttp_init_callbacks(s);
    
    /* Determine parser type from arguments */
    llhttp_type_t parser_type = HTTP_BOTH;
    if (argc > 0) {
        const char *type_str = JS_ToCString(ctx, argv[0]);
        if (type_str) {
            if (strcmp(type_str, "request") == 0) {
                parser_type = HTTP_REQUEST;
            } else if (strcmp(type_str, "response") == 0) {
                parser_type = HTTP_RESPONSE;
            }
            JS_FreeCString(ctx, type_str);
        }
    }
    
    llhttp_init(&s->parser, parser_type, &s->settings);
    s->parser.data = s;

    JSValue proto = JS_GetPropertyStr(ctx, new_target, "prototype");
    if (JS_IsException(proto)) {
        goto fail;
    }

    JSValue obj = JS_NewObjectProtoClass(ctx, proto, tjs_llhttp_class_id);
    JS_FreeValue(ctx, proto);
    if (JS_IsException(obj)) {
        goto fail;
    }

    JS_SetOpaque(obj, s);
    s->js_this = JS_DupValue(ctx, obj);
    return obj;

fail:
    if (s) {
        tjs__llhttp_reset_result(s);
        free(s);
    }
    return JS_EXCEPTION;
}

static JSValue tjs_llhttp_execute(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    TJSLlhttp *s = JS_GetOpaque2(ctx, this_val, tjs_llhttp_class_id);
    if (!s) {
        return JS_EXCEPTION;
    }

    if (argc < 1) {
        return JS_ThrowTypeError(ctx, "expected data argument");
    }

    size_t len;
    const char *data = JS_ToCStringLen(ctx, &len, argv[0]);
    if (!data) {
        return JS_EXCEPTION;
    }

    llhttp_errno_t err = llhttp_execute(&s->parser, data, len);
    JS_FreeCString(ctx, data);

    if (err != HPE_OK) {
        return JS_ThrowInternalError(ctx,
                                     "Parse error: %s (%s)",
                                     llhttp_errno_name(err),
                                     llhttp_get_error_reason(&s->parser));
    }

    return JS_NewInt32(ctx, len);
}

static JSValue tjs_llhttp_finish(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    TJSLlhttp *s = JS_GetOpaque2(ctx, this_val, tjs_llhttp_class_id);
    if (!s) {
        return JS_EXCEPTION;
    }

    llhttp_errno_t err = llhttp_finish(&s->parser);
    if (err != HPE_OK) {
        return JS_ThrowInternalError(ctx, "Finish error: %s", llhttp_errno_name(err));
    }

    return JS_UNDEFINED;
}

static JSValue tjs_llhttp_reset(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    TJSLlhttp *s = JS_GetOpaque2(ctx, this_val, tjs_llhttp_class_id);
    if (!s) {
        return JS_EXCEPTION;
    }
    
    llhttp_reset(&s->parser);
    tjs__llhttp_reset_result(s);
    s->result.headers = JS_NewObject(s->ctx);
    
    return JS_UNDEFINED;
}

static JSValue tjs_llhttp_get_method_name(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    TJSLlhttp *s = JS_GetOpaque2(ctx, this_val, tjs_llhttp_class_id);
    if (!s) {
        return JS_EXCEPTION;
    }
    
    if (s->result.method) {
        return JS_NewString(ctx, s->result.method);
    }
    
    uint8_t method = llhttp_get_method(&s->parser);
    const char* method_name = llhttp_method_name((llhttp_method_t)method);
    return JS_NewString(ctx, method_name);
}

static JSValue tjs_llhttp_get_status_code(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    TJSLlhttp *s = JS_GetOpaque2(ctx, this_val, tjs_llhttp_class_id);
    if (!s) {
        return JS_EXCEPTION;
    }
    
    return JS_NewInt32(ctx, llhttp_get_status_code(&s->parser));
}

static JSValue tjs_llhttp_get_http_version(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    TJSLlhttp *s = JS_GetOpaque2(ctx, this_val, tjs_llhttp_class_id);
    if (!s) {
        return JS_EXCEPTION;
    }
    
    JSValue obj = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, obj, "major", JS_NewInt32(ctx, llhttp_get_http_major(&s->parser)));
    JS_SetPropertyStr(ctx, obj, "minor", JS_NewInt32(ctx, llhttp_get_http_minor(&s->parser)));
    
    return obj;
}

static JSValue tjs_llhttp_should_keep_alive(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    TJSLlhttp *s = JS_GetOpaque2(ctx, this_val, tjs_llhttp_class_id);
    if (!s) {
        return JS_EXCEPTION;
    }
    
    return JS_NewBool(ctx, llhttp_should_keep_alive(&s->parser));
}

static JSValue tjs_llhttp_create_response(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    int status = 200;
    const char *status_text = "OK";
    JSValue headers = JS_UNDEFINED;
    JSValue body = JS_UNDEFINED;
    JSValue response = JS_UNDEFINED;
    char *response_str = NULL;
    size_t response_len = 0;

    // Parse arguments
    if (argc > 0 && JS_ToInt32(ctx, &status, argv[0])) {
        goto fail;
    }
    if (argc > 1) {
        headers = JS_DupValue(ctx, argv[1]);
    }
    if (argc > 2) {
        body = JS_DupValue(ctx, argv[2]);
    }

    // Create response line
    response_len = snprintf(NULL, 0, "HTTP/1.1 %d %s\r\n", status, status_text);
    response_str = malloc(response_len + 1);
    if (!response_str) {
        goto fail;
    }
    snprintf(response_str, response_len + 1, "HTTP/1.1 %d %s\r\n", status, status_text);

    // Add headers
    if (!JS_IsUndefined(headers) && JS_IsObject(headers)) {
        JSPropertyEnum *props = NULL;
        uint32_t count = 0;
        if (JS_GetOwnPropertyNames(ctx, &props, &count, headers, JS_GPN_STRING_MASK)) {
            goto fail;
        }

        for (uint32_t i = 0; i < count; i++) {
            JSValue val = JS_GetProperty(ctx, headers, props[i].atom);
            const char *key = JS_AtomToCString(ctx, props[i].atom);
            const char *value = JS_ToCString(ctx, val);

            if (key && value) {
                size_t header_len = snprintf(NULL, 0, "%s: %s\r\n", key, value);
                char *header_str = realloc(response_str, response_len + header_len + 1);
                if (!header_str) {
                    JS_FreeCString(ctx, key);
                    JS_FreeCString(ctx, value);
                    goto fail;
                }
                response_str = header_str;
                snprintf(response_str + response_len, header_len + 1, "%s: %s\r\n", key, value);
                response_len += header_len;
            }

            if (key) {
                JS_FreeCString(ctx, key);
            }
            if (value) {
                JS_FreeCString(ctx, value);
            }
            JS_FreeValue(ctx, val);
        }
        js_free(ctx, props);
    }

    // Add body
    if (!JS_IsUndefined(body)) {
        size_t body_len;
        const char *body_str = JS_ToCStringLen(ctx, &body_len, body);
        if (body_str) {
            char *new_response = realloc(response_str, response_len + body_len + 3);  // +3 for \r\n\0
            if (!new_response) {
                JS_FreeCString(ctx, body_str);
                goto fail;
            }
            response_str = new_response;
            memcpy(response_str + response_len, "\r\n", 2);
            memcpy(response_str + response_len + 2, body_str, body_len);
            response_len += 2 + body_len;
            response_str[response_len] = '\0';
            JS_FreeCString(ctx, body_str);
        }
    } else {
        char *new_response = realloc(response_str, response_len + 3);  // +3 for \r\n\0
        if (!new_response) {
            goto fail;
        }
        response_str = new_response;
        memcpy(response_str + response_len, "\r\n", 2);
        response_len += 2;
        response_str[response_len] = '\0';
    }

    response = JS_NewStringLen(ctx, response_str, response_len);
    free(response_str);
    return response;

fail:
    if (response_str) {
        free(response_str);
    }
    if (!JS_IsUndefined(headers)) {
        JS_FreeValue(ctx, headers);
    }
    if (!JS_IsUndefined(body)) {
        JS_FreeValue(ctx, body);
    }
    return JS_EXCEPTION;
}

static const JSCFunctionListEntry tjs_llhttp_proto_funcs[] = {
    JS_CFUNC_DEF("execute", 1, tjs_llhttp_execute),
    JS_CFUNC_DEF("finish", 0, tjs_llhttp_finish),
    JS_CFUNC_DEF("reset", 0, tjs_llhttp_reset),
    JS_CFUNC_DEF("getResult", 0, tjs_llhttp_get_result),
    JS_CFUNC_DEF("getMethodName", 0, tjs_llhttp_get_method_name),
    JS_CFUNC_DEF("getStatusCode", 0, tjs_llhttp_get_status_code),
    JS_CFUNC_DEF("getHttpVersion", 0, tjs_llhttp_get_http_version),
    JS_CFUNC_DEF("shouldKeepAlive", 0, tjs_llhttp_should_keep_alive),
    JS_CFUNC_DEF("createResponse", 3, tjs_llhttp_create_response),
};

static const JSCFunctionListEntry tjs_llhttp_class_funcs[] = {
    /* HTTP Methods */
    JS_PROP_INT32_DEF("HTTP_DELETE", HTTP_DELETE, JS_PROP_CONFIGURABLE),
    JS_PROP_INT32_DEF("HTTP_GET", HTTP_GET, JS_PROP_CONFIGURABLE),
    JS_PROP_INT32_DEF("HTTP_HEAD", HTTP_HEAD, JS_PROP_CONFIGURABLE),
    JS_PROP_INT32_DEF("HTTP_POST", HTTP_POST, JS_PROP_CONFIGURABLE),
    JS_PROP_INT32_DEF("HTTP_PUT", HTTP_PUT, JS_PROP_CONFIGURABLE),
    JS_PROP_INT32_DEF("HTTP_CONNECT", HTTP_CONNECT, JS_PROP_CONFIGURABLE),
    JS_PROP_INT32_DEF("HTTP_OPTIONS", HTTP_OPTIONS, JS_PROP_CONFIGURABLE),
    JS_PROP_INT32_DEF("HTTP_TRACE", HTTP_TRACE, JS_PROP_CONFIGURABLE),
    JS_PROP_INT32_DEF("HTTP_PATCH", HTTP_PATCH, JS_PROP_CONFIGURABLE),
    
    /* Parser Types */
    JS_PROP_INT32_DEF("HTTP_BOTH", HTTP_BOTH, JS_PROP_CONFIGURABLE),
    JS_PROP_INT32_DEF("HTTP_REQUEST", HTTP_REQUEST, JS_PROP_CONFIGURABLE),
    JS_PROP_INT32_DEF("HTTP_RESPONSE", HTTP_RESPONSE, JS_PROP_CONFIGURABLE),
    
    /* Common Status Codes */
    JS_PROP_INT32_DEF("HTTP_STATUS_OK", 200, JS_PROP_CONFIGURABLE),
    JS_PROP_INT32_DEF("HTTP_STATUS_CREATED", 201, JS_PROP_CONFIGURABLE),
    JS_PROP_INT32_DEF("HTTP_STATUS_NO_CONTENT", 204, JS_PROP_CONFIGURABLE),
    JS_PROP_INT32_DEF("HTTP_STATUS_BAD_REQUEST", 400, JS_PROP_CONFIGURABLE),
    JS_PROP_INT32_DEF("HTTP_STATUS_UNAUTHORIZED", 401, JS_PROP_CONFIGURABLE),
    JS_PROP_INT32_DEF("HTTP_STATUS_FORBIDDEN", 403, JS_PROP_CONFIGURABLE),
    JS_PROP_INT32_DEF("HTTP_STATUS_NOT_FOUND", 404, JS_PROP_CONFIGURABLE),
    JS_PROP_INT32_DEF("HTTP_STATUS_METHOD_NOT_ALLOWED", 405, JS_PROP_CONFIGURABLE),
    JS_PROP_INT32_DEF("HTTP_STATUS_INTERNAL_SERVER_ERROR", 500, JS_PROP_CONFIGURABLE),
    JS_PROP_INT32_DEF("HTTP_STATUS_NOT_IMPLEMENTED", 501, JS_PROP_CONFIGURABLE),
    JS_PROP_INT32_DEF("HTTP_STATUS_BAD_GATEWAY", 502, JS_PROP_CONFIGURABLE),
    JS_PROP_INT32_DEF("HTTP_STATUS_SERVICE_UNAVAILABLE", 503, JS_PROP_CONFIGURABLE),
};

static JSValue tjs_llhttp_get_result(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    TJSLlhttp *s = JS_GetOpaque2(ctx, this_val, tjs_llhttp_class_id);
    if (!s) {
        return JS_EXCEPTION;
    }

    JSValue obj = JS_NewObject(ctx);
    
    /* Basic message info */
    if (s->result.method) {
        JS_SetPropertyStr(ctx, obj, "method", JS_NewString(ctx, s->result.method));
    }
    if (s->result.url) {
        JS_SetPropertyStr(ctx, obj, "url", JS_NewString(ctx, s->result.url));
    }
    if (s->result.status) {
        JS_SetPropertyStr(ctx, obj, "status", JS_NewString(ctx, s->result.status));
    }
    
    /* Status code and HTTP version */
    JS_SetPropertyStr(ctx, obj, "statusCode", JS_NewInt32(ctx, s->result.status_code));
    JS_SetPropertyStr(ctx, obj, "httpMajor", JS_NewInt32(ctx, s->result.http_major));
    JS_SetPropertyStr(ctx, obj, "httpMinor", JS_NewInt32(ctx, s->result.http_minor));
    
    /* Headers */
    if (!JS_IsUndefined(s->result.headers)) {
        JS_SetPropertyStr(ctx, obj, "headers", JS_DupValue(ctx, s->result.headers));
    } else {
        JS_SetPropertyStr(ctx, obj, "headers", JS_NewObject(ctx));
    }
    
    /* Body */
    if (s->result.body) {
        JS_SetPropertyStr(ctx, obj, "body", JS_NewStringLen(ctx, s->result.body, s->result.body_len));
    } else {
        JS_SetPropertyStr(ctx, obj, "body", JS_NewString(ctx, ""));
    }
    
    /* Parse completion status */
    JS_SetPropertyStr(ctx, obj, "complete", JS_NewBool(ctx, s->result.message_complete));

    return obj;
}

static void tjs__llhttp_register_class(JSContext *ctx) {
    if (!tjs_llhttp_class_id) {
        JS_NewClassID(JS_GetRuntime(ctx), &tjs_llhttp_class_id);
        JS_NewClass(JS_GetRuntime(ctx), tjs_llhttp_class_id, &tjs_llhttp_class);
    }
}

void tjs__mod_llhttp_init(JSContext *ctx, JSValue ns) {
    /* Register class */
    tjs__llhttp_register_class(ctx);

    /* Register module */
    JS_SetPropertyFunctionList(ctx, ns, tjs_llhttp_class_funcs, countof(tjs_llhttp_class_funcs));

    /* Create prototype */
    JSValue proto = JS_NewObject(ctx);
    JS_SetPropertyFunctionList(ctx, proto, tjs_llhttp_proto_funcs, countof(tjs_llhttp_proto_funcs));

    /* Create constructor */
    JSValue obj = JS_NewCFunction2(ctx, tjs_llhttp_constructor, "LLHttp", 0, JS_CFUNC_constructor, 0);
    JS_SetConstructor(ctx, obj, proto);
    JS_SetPropertyFunctionList(ctx, obj, tjs_llhttp_class_funcs, countof(tjs_llhttp_class_funcs));

    /* Export to module */
    JS_SetPropertyStr(ctx, ns, "LLHttp", obj);
}