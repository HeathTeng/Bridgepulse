// 把 assets/icon.svg 画成各种尺寸的 PNG，不加任何依赖：用项目里已经装好的 Electron 离屏渲染。
// 用法（在项目文件夹里）：npx electron scripts/make-icons.js，然后 node scripts/make-ico.js 拼 Windows 的 .ico。
// 每个尺寸都按那个尺寸单独画（不是从大图缩小），SVG 里的 @media 会让 48px 及以下的线条变粗。
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');
const SIZES = [16, 32, 48, 256, 512, 1024];
// 小工具窗口和任务栏用的那张
const WINDOW_ICON = 256;

app.disableHardwareAcceleration();
// 一张一张画，中间关掉窗口时不要自动退出；出错就带错误码退出
app.on('window-all-closed', () => {});
process.on('unhandledRejection', (err) => {
  console.error('生成失败：', err.message);
  app.exit(1);
});
app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(ASSETS, 'icon.svg'), 'utf8');
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  for (const size of SIZES) {
    const win = new BrowserWindow({ width: size, height: size, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
    const html = `<!doctype html><html><body style="margin:0;background:transparent"><img id="i" src="${src}" width="${size}" height="${size}" style="display:block"></body></html>`;
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await win.webContents.executeJavaScript(`document.getElementById('i').decode()`);
    const dbg = win.webContents.debugger;
    dbg.attach('1.3');
    // 像素密度固定 1，背景透明，画出来正好 size×size
    await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
    await dbg.sendCommand('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    await new Promise((r) => setTimeout(r, 300));
    const { data } = await dbg.sendCommand('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
    const buf = Buffer.from(data, 'base64');
    fs.writeFileSync(path.join(ASSETS, `icon-${size}.png`), buf);
    if (size === WINDOW_ICON) fs.writeFileSync(path.join(ASSETS, 'icon.png'), buf);
    console.log(`icon-${size}.png`, `${buf.readUInt32BE(16)}×${buf.readUInt32BE(20)}`, `${Math.round(buf.length / 1024)} KB`);
    win.destroy();
  }
  app.quit();
});
