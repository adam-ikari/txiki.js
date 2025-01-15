import { init, createWindow, quit, pollEvents } from 'tjs:sdl';

try {
    init();
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
