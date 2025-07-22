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

#include "private.h"
#include "tjs.h"
#include "utils.h"

#include <llhttp.h>

#define JS_NewClassID(id) JS_NewClassID(id, NULL)

/* Callback types */
enum {
    LLHTTP_CB_MESSAGE_BEGIN,
    LLHTTP_CB_URL,
    LLHTTP_CB_STATUS,
    LLHTTP_CB_HEADER_FIELD,
    LLHTTP_CB_HEADER_VALUE,
    LLHTTP_CB_HEADERS_COMPLETE,
    LLHTTP_CB_BODY,
    LLHTTP_CB_MESSAGE_COMPLETE,
    LLHTTP_CB_COUNT
};

static JSClassID tjs_llhttp_class_id;

typedef struct {
    JSContext *ctx;
    llhttp_t parser;
    llhttp_settings_t settings;
    JSValue js_this;
    JSValue callbacks[LLHTTP_CB_COUNT];
} TJSLlhttp;

static void tjs__llhttp_finalizer(JSRuntime *rt, JSValue val) {
    TJSLlhttp *s = JS_GetOpaque(val, tjs_llhttp_class_id);
    if (s) {
        for (int i = 0; i < LLHTTP_CB_COUNT; i++) {
            JS_FreeValueRT(rt, s->callbacks[i]);
        }
        JS_FreeValueRT(rt, s->js_this);
        free(s);
    }
}

static int tjs__llhttp_callback(llhttp_t *p, int cb_type, const char *data, size_t len) {
    TJSLlhttp *s = (TJSLlhttp *) p->data;
    if (!JS_IsUndefined(s->callbacks[cb_type])) {
        JSValue arg = data ? JS_NewStringLen(s->ctx, data, len) : JS_UNDEFINED;
        JSValue ret = JS_Call(s->ctx, s->callbacks[cb_type], s->js_this, data ? 1 : 0, data ? &arg : NULL);
        if (data) {
            JS_FreeValue(s->ctx, arg);
        }
        if (JS_IsException(ret)) {
            return -1;
        }
        JS_FreeValue(s->ctx, ret);
    }
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

    llhttp_settings_init(&s->settings);
    llhttp_init(&s->parser, HTTP_BOTH, &s->settings);
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
    tjs__llhttp_finalizer(JS_GetRuntime(ctx), obj);
    return JS_EXCEPTION;
}

static JSValue tjs_llhttp_execute(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    TJSLlhttp *s = JS_GetOpaque2(ctx, this_val, tjs_llhttp_class_id);
    if (!s) {
        return JS_EXCEPTION;
    }

    size_t len;
    const char *data = JS_ToCStringLen(ctx, &len, argv[0]);
    if (!data) {
        return JS_EXCEPTION;
    }

    llhttp_errno_t err = llhttp_execute(&s->parser, data, len);
    JS_FreeCString(ctx, data);

    if (err != HPE_OK) {
        return JS_ThrowInternalError(ctx, "Parse error: %s", llhttp_errno_name(err));
    }

    return JS_UNDEFINED;
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

static JSValue tjs_llhttp_set_callback(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    TJSLlhttp *s = JS_GetOpaque2(ctx, this_val, tjs_llhttp_class_id);
    if (!s) {
        return JS_EXCEPTION;
    }

    int cb_type;
    if (JS_ToInt32(ctx, &cb_type, argv[0])) {
        return JS_EXCEPTION;
    }

    if (cb_type < 0 || cb_type >= LLHTTP_CB_COUNT) {
        return JS_ThrowRangeError(ctx, "Invalid callback type");
    }

    JS_FreeValue(ctx, s->callbacks[cb_type]);
    s->callbacks[cb_type] = JS_DupValue(ctx, argv[1]);

    return JS_UNDEFINED;
}

static const JSCFunctionListEntry tjs_llhttp_proto_funcs[] = {
    JS_CFUNC_DEF("execute", 1, tjs_llhttp_execute),
    JS_CFUNC_DEF("finish", 0, tjs_llhttp_finish),
    JS_CFUNC_DEF("setCallback", 2, tjs_llhttp_set_callback),
};

static const JSCFunctionListEntry tjs_llhttp_class_funcs[] = {
    /* Callback type constants */
    JS_PROP_INT32_DEF("ON_MESSAGE_BEGIN", 0, LLHTTP_CB_MESSAGE_BEGIN),
    JS_PROP_INT32_DEF("ON_URL", 0, LLHTTP_CB_URL),
    JS_PROP_INT32_DEF("ON_STATUS", 0, LLHTTP_CB_STATUS),
    JS_PROP_INT32_DEF("ON_HEADER_FIELD", 0, LLHTTP_CB_HEADER_FIELD),
    JS_PROP_INT32_DEF("ON_HEADER_VALUE", 0, LLHTTP_CB_HEADER_VALUE),
    JS_PROP_INT32_DEF("ON_HEADERS_COMPLETE", 0, LLHTTP_CB_HEADERS_COMPLETE),
    JS_PROP_INT32_DEF("ON_BODY", 0, LLHTTP_CB_BODY),
    JS_PROP_INT32_DEF("ON_MESSAGE_COMPLETE", 0, LLHTTP_CB_MESSAGE_COMPLETE),
};

static int tjs__llhttp_on_message_begin(llhttp_t *p) {
    return tjs__llhttp_callback(p, LLHTTP_CB_MESSAGE_BEGIN, NULL, 0);
}

static int tjs__llhttp_on_url(llhttp_t *p, const char *at, size_t len) {
    return tjs__llhttp_callback(p, LLHTTP_CB_URL, at, len);
}

static int tjs__llhttp_on_status(llhttp_t *p, const char *at, size_t len) {
    return tjs__llhttp_callback(p, LLHTTP_CB_STATUS, at, len);
}

static int tjs__llhttp_on_header_field(llhttp_t *p, const char *at, size_t len) {
    return tjs__llhttp_callback(p, LLHTTP_CB_HEADER_FIELD, at, len);
}

static int tjs__llhttp_on_header_value(llhttp_t *p, const char *at, size_t len) {
    return tjs__llhttp_callback(p, LLHTTP_CB_HEADER_VALUE, at, len);
}

static int tjs__llhttp_on_headers_complete(llhttp_t *p) {
    return tjs__llhttp_callback(p, LLHTTP_CB_HEADERS_COMPLETE, NULL, 0);
}

static int tjs__llhttp_on_body(llhttp_t *p, const char *at, size_t len) {
    return tjs__llhttp_callback(p, LLHTTP_CB_BODY, at, len);
}

static int tjs__llhttp_on_message_complete(llhttp_t *p) {
    return tjs__llhttp_callback(p, LLHTTP_CB_MESSAGE_COMPLETE, NULL, 0);
}

static void tjs__llhttp_init_callbacks(TJSLlhttp *s) {
    s->settings.on_message_begin = tjs__llhttp_on_message_begin;
    s->settings.on_url = tjs__llhttp_on_url;
    s->settings.on_status = tjs__llhttp_on_status;
    s->settings.on_header_field = tjs__llhttp_on_header_field;
    s->settings.on_header_value = tjs__llhttp_on_header_value;
    s->settings.on_headers_complete = tjs__llhttp_on_headers_complete;
    s->settings.on_body = tjs__llhttp_on_body;
    s->settings.on_message_complete = tjs__llhttp_on_message_complete;
}

void tjs__mod_llhttp_init(JSContext *ctx, JSValue ns) {
    /* Register module */
    JS_SetPropertyFunctionList(ctx, ns, tjs_llhttp_class_funcs, countof(tjs_llhttp_class_funcs));
    JSValue proto, obj;
    JS_NewClassID(&tjs_llhttp_class_id);
    JS_NewClass(JS_GetRuntime(ctx), tjs_llhttp_class_id, &tjs_llhttp_class);

    proto = JS_NewObject(ctx);
    JS_SetPropertyFunctionList(ctx, proto, tjs_llhttp_proto_funcs, countof(tjs_llhttp_proto_funcs));

    obj = JS_NewCFunction2(ctx, tjs_llhttp_constructor, "Llhttp", 0, JS_CFUNC_constructor, 0);
    JS_SetConstructor(ctx, obj, proto);
    JS_SetPropertyFunctionList(ctx, obj, tjs_llhttp_class_funcs, countof(tjs_llhttp_class_funcs));

    /* Initialize parser settings */
    TJSLlhttp *s = JS_GetOpaque(obj, tjs_llhttp_class_id);
    llhttp_settings_init(&s->settings);
    s->parser.data = s;
    tjs__llhttp_init_callbacks(s);

    JS_SetPropertyStr(ctx, ns, "llhttp", obj);
}