#include "tjs.h"

#include <SDL2/SDL.h>

static JSValue tjs_sdl_init(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    uint32_t flags;
    
    if (argc != 1 || JS_ToUint32(ctx, &flags, argv[0])) {
        return JS_ThrowTypeError(ctx, "expected one argument: flags (number)");
    }
    
    if (SDL_Init(flags) != 0) {
        return JS_ThrowInternalError(ctx, "SDL_Init failed: %s", SDL_GetError());
    }
    return JS_UNDEFINED;
}

static JSValue tjs_sdl_quit(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    SDL_Quit();
    return JS_UNDEFINED;
}

static JSValue tjs_sdl_poll_events(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    SDL_Event event;
    while (SDL_PollEvent(&event)) {
        if (event.type == SDL_QUIT) {
            return JS_NewBool(ctx, 1);
        }
    }
    return JS_NewBool(ctx, 0);
}

static JSValue tjs_sdl_create_window(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    int x, y, w, h;
    uint32_t flags;

    const char *title = JS_ToCString(ctx, argv[0]);
    if (!title || JS_ToInt32(ctx, &x, argv[1]) || JS_ToInt32(ctx, &y, argv[2]) || JS_ToInt32(ctx, &w, argv[3]) ||
        JS_ToInt32(ctx, &h, argv[4]) || JS_ToUint32(ctx, &flags, argv[5])) {
        if (title) {
            JS_FreeCString(ctx, title);
        }
        return JS_EXCEPTION;
    }

    SDL_Window *window = SDL_CreateWindow(title, x, y, w, h, flags);
    if (!window) {
        return JS_ThrowInternalError(ctx, "SDL_CreateWindow failed: %s", SDL_GetError());
    }

    return JS_NewUint32(ctx, (uint32_t) (uintptr_t) window);
}

static const JSCFunctionListEntry sdl_funcs[] = {
    JS_CFUNC_DEF("init", 1, tjs_sdl_init),
    JS_CFUNC_DEF("quit", 0, tjs_sdl_quit),
    JS_CFUNC_DEF("createWindow", 6, tjs_sdl_create_window),
    JS_CFUNC_DEF("pollEvents", 0, tjs_sdl_poll_events),
};

static int tjs_sdl_module_init(JSContext *ctx, JSModuleDef *m) {
    return JS_SetModuleExportList(ctx, m, sdl_funcs, countof(sdl_funcs));
}

JSModuleDef *tjs_init_module_sdl(JSContext *ctx, const char *module_name) {
    JSModuleDef *m = JS_NewCModule(ctx, module_name, tjs_sdl_module_init);
    if (!m) {
        return NULL;
    }
    JS_AddModuleExportList(ctx, m, sdl_funcs, countof(sdl_funcs));
    return m;
}
