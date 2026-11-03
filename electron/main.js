// 桌面小工具：一个无边框、半透明、可置顶的小窗口，内容就是 public/widget.html。
// 启动时顺便在本机启动数据服务器（server.js），关闭窗口时一起退出。
const { app, BrowserWindow, ipcMain, shell, screen, powerMonitor, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');
const server = require('../server');
const BRAND = require('../public/brand');

const DEMO = process.argv.includes('--demo');
const WIDTH = 380;
const HEIGHT = 660;
// 隐藏后缩成的小图标大小
const ICON = 56;
const SHORTCUT = 'Control+Alt+W';
const STATE_FILE = path.join(__dirname, '..', 'data', 'widget.json');

let win;
let state = { x: null, y: null, pinned: true, collapsed: false, alpha: 0.8, opaque: false, guideSeen: false, tourSeen: false, hidden: false, iconX: null, iconY: null, adviceOpen: false };
// 示例模式不写文件：新手引导「看过了」只记在内存里，每次打开都从欢迎框开始
const demoSeen = { guideSeen: false, tourSeen: false };

function loadState() {
  try {
    state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
  } catch {
    // 第一次运行还没有记录，用默认值
  }
}

// 写不进去（例如文件夹只读）时本次运行先记在内存里，不打扰用户；示例模式不写文件，不影响真实小工具的设置
function saveState() {
  if (DEMO) return;
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    const { web, ...own } = state;
    let onDisk = {};
    try {
      onDisk = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch {
      // 还没有文件
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify({ ...own, web: onDisk.web }, null, 2));
  } catch {
    // 忽略
  }
}

function onScreen(x, y) {
  return x != null && screen.getAllDisplays().some(({ workArea: a }) => x >= a.x && y >= a.y && x < a.x + a.width && y < a.y + a.height);
}

// 默认放在屏幕右上角；记住的位置如果已经不在任何屏幕上（换了显示器），也回到右上角
function startPosition() {
  if (onScreen(state.x, state.y)) return { x: state.x, y: state.y };
  const area = screen.getPrimaryDisplay().workArea;
  return { x: area.x + area.width - WIDTH - 24, y: area.y + 24 };
}

// 小图标的位置：记住的位置不在屏幕上时，放在小工具的右上角
function iconPosition() {
  if (onScreen(state.iconX, state.iconY)) return { x: state.iconX, y: state.iconY };
  const { x, y } = startPosition();
  return { x: x + WIDTH - ICON - 8, y: y + 8 };
}

// 隐藏成小图标 / 恢复：恢复时回到隐藏前的位置，收起的高度由页面重新告诉主进程
function setHidden(hidden) {
  if (!win || state.hidden === hidden) return;
  state.hidden = hidden;
  win.setResizable(true);
  if (hidden) {
    const { x, y } = iconPosition();
    win.setBounds({ x, y, width: ICON, height: ICON });
  } else {
    const { x, y } = startPosition();
    win.setBounds({ x, y, width: WIDTH, height: HEIGHT });
  }
  win.setResizable(false);
  saveState();
  win.webContents.send('desk:hidden', hidden);
}

async function createWindow() {
  let base = `http://127.0.0.1:${server.PORT}`;
  try {
    base = await server.start({ demo: DEMO });
  } catch (err) {
    // 端口被占用说明 npm start 已经在跑，直接连它
    if (err.code !== 'EADDRINUSE') throw err;
  }

  win = new BrowserWindow({
    ...(state.hidden ? iconPosition() : startPosition()),
    width: state.hidden ? ICON : WIDTH,
    height: state.hidden ? ICON : HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    alwaysOnTop: state.pinned,
    hasShadow: false,
    title: BRAND.name,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadURL(`${base}/widget.html`);

  // 页面里的链接（例如 WHOOP 登录）一律用系统浏览器打开，小工具窗口只显示看板
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${base}/widget.html`)) {
      event.preventDefault();
      openExternal(url);
    }
  });

  // 隐藏时拖动的是小图标，记成图标的位置
  win.on('moved', () => {
    const [x, y] = win.getPosition();
    if (state.hidden) [state.iconX, state.iconY] = [x, y];
    else [state.x, state.y] = [x, y];
    saveState();
  });
}

function openExternal(url) {
  if (/^https?:\/\//.test(url)) shell.openExternal(url);
}

// shortcutOk：快捷键有没有注册成功（被别的软件占用时为 false），只告诉页面，不写文件
let shortcutOk = false;
ipcMain.handle('desk:state', () => ({ ...state, ...(DEMO ? demoSeen : {}), shortcutOk }));
// 新手引导看过了：只接受这两个键，而且只能设成「是」
ipcMain.on('desk:seen', (_e, key) => {
  if (key !== 'guideSeen' && key !== 'tourSeen') return;
  if (DEMO) demoSeen[key] = true;
  else {
    state[key] = true;
    saveState();
  }
});
ipcMain.on('desk:collapse', (_e, collapsed, height) => {
  state.collapsed = collapsed;
  saveState();
  // 隐藏成小图标时只记下收起状态，不改窗口大小
  if (state.hidden) return;
  win.setResizable(true);
  win.setSize(WIDTH, collapsed && height ? Math.ceil(height) : HEIGHT);
  win.setResizable(false);
});
ipcMain.on('desk:pin', (_e, pinned) => {
  state.pinned = pinned;
  saveState();
  win.setAlwaysOnTop(pinned);
});
ipcMain.on('desk:alpha', (_e, alpha) => {
  state.alpha = alpha;
  saveState();
});
// 不透明模式单独记住，关掉后还能回到原来的透明度
ipcMain.on('desk:opaque', (_e, opaque) => {
  state.opaque = opaque === true;
  saveState();
});
ipcMain.on('desk:open', (_e, url) => openExternal(url));
ipcMain.on('desk:hide', (_e, hidden) => setHidden(hidden === true));
// 今日建议展开 / 收起（示例模式 saveState 不写文件，只记在内存里）
ipcMain.on('desk:advice-open', (_e, open) => {
  state.adviceOpen = open === true;
  saveState();
});
// 按住小图标拖动：页面算好新位置发过来（只在隐藏状态下有效）；用代码移动窗口不会触发 moved，所以在这里记位置，停下 0.3 秒后再写文件
let iconSave = null;
ipcMain.on('desk:icon-move', (_e, x, y) => {
  if (!state.hidden || !Number.isFinite(x) || !Number.isFinite(y)) return;
  [state.iconX, state.iconY] = [Math.round(x), Math.round(y)];
  win.setPosition(state.iconX, state.iconY);
  clearTimeout(iconSave);
  iconSave = setTimeout(saveState, 300);
});
ipcMain.on('desk:close', () => app.quit());

// 只允许开一个小工具，重复打开时把已有的窗口调到前面
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => win?.show());
  loadState();
  app.whenReady().then(() => {
    createWindow();
    // 全局快捷键切换隐藏 / 显示；被别的软件占用时注册失败，不弹窗
    try {
      shortcutOk = globalShortcut.register(SHORTCUT, () => setHidden(!state.hidden));
    } catch {
      // 忽略
    }
    // 电脑睡眠唤醒、解锁后让页面补一次同步
    for (const event of ['resume', 'unlock-screen']) powerMonitor.on(event, () => win?.webContents.send('desk:resume'));
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => globalShortcut.unregisterAll());
}
