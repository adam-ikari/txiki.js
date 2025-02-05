#include "tjs.h"

#include <SDL2/SDL.h>
#include <SDL2/SDL_ttf.h>

static TTF_Font *font = NULL;

// 添加类ID声明
static JSClassID tjs_sdl_window_class_id;

// 在文件开头添加 SDL 窗口类的定义
static JSClassDef tjs_sdl_window_class = {
    "SDL_Window",
};

// 添加渲染器类ID声明
static JSClassID tjs_sdl_renderer_class_id;

// 添加渲染器类定义
static void tjs_sdl_renderer_finalizer(JSRuntime *rt, JSValue val) {
    SDL_Renderer *renderer = JS_GetOpaque(val, tjs_sdl_renderer_class_id);
    if (renderer) {
        SDL_DestroyRenderer(renderer);
    }
}

static JSClassDef tjs_sdl_renderer_class = {
    "SDL_Renderer",
    .finalizer = tjs_sdl_renderer_finalizer,
};

static JSValue tjs_sdl_init(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    Uint32 flags = SDL_INIT_VIDEO;  // 默认初始化视频子系统
    
    if (argc > 0) {
        if (JS_ToUint32(ctx, &flags, argv[0]))
            return JS_EXCEPTION;
    }

#ifdef DEBUG
    fprintf(stderr, "Initializing SDL with flags: %u\n", flags);
#endif

    if (SDL_Init(flags) < 0) {
#ifdef DEBUG
        fprintf(stderr, "SDL_Init failed: %s\n", SDL_GetError());
#endif
        return JS_ThrowInternalError(ctx, "Could not initialize SDL: %s", SDL_GetError());
    }

#ifdef DEBUG
    fprintf(stderr, "SDL initialized successfully\n");
#endif

    if (TTF_Init() == -1) {
        return JS_ThrowInternalError(ctx, "TTF_Init failed: %s", TTF_GetError());
    }
    
    // 加载默认字体
    font = TTF_OpenFont("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 24);
    if (!font) {
        return JS_ThrowInternalError(ctx, "TTF_OpenFont failed: %s", TTF_GetError());
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
    JS_FreeCString(ctx, title);
    
    if (!window) {
        return JS_ThrowInternalError(ctx, "SDL_CreateWindow failed: %s", SDL_GetError());
    }

    JSValue obj = JS_NewObjectClass(ctx, tjs_sdl_window_class_id);
    if (JS_IsException(obj))
        return obj;

    JS_SetOpaque(obj, window);
    return obj;
}

static JSValue tjs_sdl_create_renderer(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    if (argc < 1) {
        return JS_ThrowTypeError(ctx, "Window argument is required");
    }

    SDL_Window *window = JS_GetOpaque2(ctx, argv[0], tjs_sdl_window_class_id);
    if (!window) {
#ifdef DEBUG
        fprintf(stderr, "Invalid window object or window is NULL\n");
#endif
        return JS_EXCEPTION;
    }

    int driver_index = -1;
    Uint32 flags = SDL_RENDERER_ACCELERATED;
    
    if (argc > 1) {
        if (JS_ToInt32(ctx, &driver_index, argv[1]))
            return JS_EXCEPTION;
    }
    
    if (argc > 2) {
        if (JS_ToUint32(ctx, &flags, argv[2]))
            return JS_EXCEPTION;
    }

#ifdef DEBUG
    fprintf(stderr, "Creating renderer: window=%p, driver=%d, flags=%u\n", 
            (void*)window, driver_index, flags);
#endif

    SDL_Renderer *renderer = SDL_CreateRenderer(window, driver_index, flags);
    if (!renderer) {
#ifdef DEBUG
        fprintf(stderr, "SDL_CreateRenderer failed: %s\n", SDL_GetError());
#endif
        return JS_ThrowInternalError(ctx, "Could not create renderer: %s", SDL_GetError());
    }

#ifdef DEBUG
    fprintf(stderr, "Renderer created successfully: %p\n", (void*)renderer);
#endif

    JSValue obj = JS_NewObjectClass(ctx, tjs_sdl_renderer_class_id);
    if (JS_IsException(obj))
        return obj;

    JS_SetOpaque(obj, renderer);
    return obj;
}

static JSValue tjs_sdl_set_draw_color(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    uint8_t r, g, b, a;
    uint32_t tmp;
    
    SDL_Renderer *renderer = JS_GetOpaque2(ctx, argv[0], tjs_sdl_renderer_class_id);
    if (!renderer) {
        return JS_EXCEPTION;
    }

    if (argc != 5 ||
        JS_ToUint32(ctx, &tmp, argv[1]) || (r = tmp) > 255 ||
        JS_ToUint32(ctx, &tmp, argv[2]) || (g = tmp) > 255 ||
        JS_ToUint32(ctx, &tmp, argv[3]) || (b = tmp) > 255 ||
        JS_ToUint32(ctx, &tmp, argv[4]) || (a = tmp) > 255) {
        return JS_ThrowTypeError(ctx, "expected five arguments: renderer (object), r (0-255), g (0-255), b (0-255), a (0-255)");
    }

    if (SDL_SetRenderDrawColor(renderer, r, g, b, a) != 0) {
        return JS_ThrowInternalError(ctx, "SDL_SetRenderDrawColor failed: %s", SDL_GetError());
    }

    return JS_UNDEFINED;
}

static JSValue tjs_sdl_clear(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    if (argc != 1) {
        return JS_ThrowTypeError(ctx, "expected one argument: renderer (object)");
    }
    
    SDL_Renderer *renderer = JS_GetOpaque2(ctx, argv[0], tjs_sdl_renderer_class_id);
    if (!renderer) {
        return JS_EXCEPTION;
    }
    
    if (SDL_RenderClear(renderer) != 0) {
        return JS_ThrowInternalError(ctx, "SDL_RenderClear failed: %s", SDL_GetError());
    }
    
    return JS_UNDEFINED;
}

static JSValue tjs_sdl_render_text(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    const char *text = NULL;
    int x, y;
    uint8_t r, g, b, a;
    uint32_t tmp;
    
    SDL_Renderer *renderer = JS_GetOpaque2(ctx, argv[0], tjs_sdl_renderer_class_id);
    if (!renderer) {
        return JS_EXCEPTION;
    }
    
    if (argc != 8 ||
        !(text = JS_ToCString(ctx, argv[1])) ||
        JS_ToInt32(ctx, &x, argv[2]) || JS_ToInt32(ctx, &y, argv[3]) ||
        JS_ToUint32(ctx, &tmp, argv[4]) || (r = tmp) > 255 ||
        JS_ToUint32(ctx, &tmp, argv[5]) || (g = tmp) > 255 ||
        JS_ToUint32(ctx, &tmp, argv[6]) || (b = tmp) > 255 ||
        JS_ToUint32(ctx, &tmp, argv[7]) || (a = tmp) > 255) {
        if (text) {
            JS_FreeCString(ctx, text);
        }
        return JS_ThrowTypeError(ctx, "expected eight arguments: renderer (object), text (string), x (number), y (number), r (0-255), g (0-255), b (0-255), a (0-255)");
    }

    // 设置文本颜色
    if (!font) {
        JS_FreeCString(ctx, text);
        return JS_ThrowInternalError(ctx, "Font not initialized");
    }
    
    SDL_Color color = {r, g, b, a};
    SDL_Surface *surface = TTF_RenderText_Blended(font, text, color);
    if (!surface) {
        JS_FreeCString(ctx, text);
        return JS_ThrowInternalError(ctx, "TTF_RenderText_Blended failed: %s", TTF_GetError());
    }
    
    SDL_Texture *texture = SDL_CreateTextureFromSurface(renderer, surface);
    if (!texture) {
        SDL_FreeSurface(surface);
        JS_FreeCString(ctx, text);
        return JS_ThrowInternalError(ctx, "SDL_CreateTextureFromSurface failed: %s", SDL_GetError());
    }
    
    SDL_Rect dest = {x, y, surface->w, surface->h};
    SDL_RenderCopy(renderer, texture, NULL, &dest);
    
    SDL_DestroyTexture(texture);
    SDL_FreeSurface(surface);
    JS_FreeCString(ctx, text);
    return JS_UNDEFINED;
}

static JSValue tjs_sdl_present(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
    if (argc != 1) {
        return JS_ThrowTypeError(ctx, "expected one argument: renderer (object)");
    }
    
    SDL_Renderer *renderer = JS_GetOpaque2(ctx, argv[0], tjs_sdl_renderer_class_id);
    if (!renderer) {
        return JS_EXCEPTION;
    }
    
    SDL_RenderPresent(renderer);
    return JS_UNDEFINED;
}

static const JSCFunctionListEntry sdl_funcs[] = {
    JS_CFUNC_DEF("init", 1, tjs_sdl_init),
    JS_CFUNC_DEF("quit", 0, tjs_sdl_quit),
    JS_CFUNC_DEF("createWindow", 6, tjs_sdl_create_window),
    JS_CFUNC_DEF("pollEvents", 0, tjs_sdl_poll_events),
    JS_CFUNC_DEF("createRenderer", 3, tjs_sdl_create_renderer),
    JS_CFUNC_DEF("setDrawColor", 5, tjs_sdl_set_draw_color),
    JS_CFUNC_DEF("clear", 1, tjs_sdl_clear),
    JS_CFUNC_DEF("present", 1, tjs_sdl_present),
    JS_CFUNC_DEF("renderText", 8, tjs_sdl_render_text),
};

static int tjs_sdl_module_init(JSContext *ctx, JSModuleDef *m) {
    JSRuntime *rt = JS_GetRuntime(ctx);
    
    // 初始化 SDL 窗口类
    JS_NewClassID(rt, &tjs_sdl_window_class_id);
    JS_NewClass(rt, tjs_sdl_window_class_id, &tjs_sdl_window_class);
    
    // 初始化 SDL 渲染器类
    JS_NewClassID(rt, &tjs_sdl_renderer_class_id);
    JS_NewClass(rt, tjs_sdl_renderer_class_id, &tjs_sdl_renderer_class);
    
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
