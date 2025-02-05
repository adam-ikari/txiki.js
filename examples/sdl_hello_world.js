import { init, createWindow, pollEvents, createRenderer, setDrawColor, clear, present, renderText } from 'tjs:sdl';

// 初始化SDL
init(0x00000020); // SDL_INIT_VIDEO

// 创建窗口
const window = createWindow(
  "Hello World", // 标题
  100,           // x位置
  100,           // y位置
  640,           // 宽度
  480,           // 高度
  0              // 标志位
);

// 创建渲染器
const renderer = createRenderer(window, -1, 0);

// 设置背景颜色
setDrawColor(renderer, 255, 255, 255, 255);

// 主循环
while (true) {
  // 清除屏幕
  clear(renderer);
  
  // 绘制文本
  renderText(renderer, "Hello World!", 200, 200, 0, 0, 0, 255);
  
  // 呈现内容
  present(renderer);
  
  // 处理事件
  if (pollEvents()) {
    break;
  }
}