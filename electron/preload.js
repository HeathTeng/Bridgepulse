// 只把几个窗口操作暴露给页面，页面本身拿不到 Node.js 和系统权限
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desk', {
  getState: () => ipcRenderer.invoke('desk:state'),
  setCollapsed: (collapsed, height) => ipcRenderer.send('desk:collapse', collapsed, height),
  setPinned: (pinned) => ipcRenderer.send('desk:pin', pinned),
  setAlpha: (alpha) => ipcRenderer.send('desk:alpha', alpha),
  setOpaque: (opaque) => ipcRenderer.send('desk:opaque', opaque),
  openExternal: (url) => ipcRenderer.send('desk:open', url),
  close: () => ipcRenderer.send('desk:close'),
  // 隐藏成小图标 / 恢复；拖动小图标；主进程（含快捷键）改了隐藏状态时通知页面
  setHidden: (hidden) => ipcRenderer.send('desk:hide', hidden),
  moveIcon: (x, y) => ipcRenderer.send('desk:icon-move', x, y),
  onHidden: (callback) => ipcRenderer.on('desk:hidden', (_e, hidden) => callback(hidden === true)),
  // 今日建议展开 / 收起
  setAdviceOpen: (open) => ipcRenderer.send('desk:advice-open', open),
  // 新手引导看过了（只能设成「是」）
  markSeen: (key) => ipcRenderer.send('desk:seen', key),
  // 电脑唤醒时通知页面同步
  onResume: (callback) => ipcRenderer.on('desk:resume', () => callback()),
});
