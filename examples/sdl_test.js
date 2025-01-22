import { init, createWindow, quit, pollEvents } from 'tjs:sdl';

try {
    init(0x00004020); // SDL_INIT_VIDEO | SDL_INIT_AUDIO | SDL_INIT_EVENTS
    const win = createWindow("SDL Test - Click X to Close", 100, 100, 640, 480, 0);
    console.log("Window created successfully!");
    
    while (true) {
        if (pollEvents()) {
            break;
        }
        // Add a small delay to prevent busy waiting
        await new Promise(resolve => setTimeout(resolve, 16));
    }
    
    quit();
} catch (e) {
    console.error("SDL Error:", e);
}
