// 产品名和副标题只写在这里：页面、窗口标题、服务器提示都引用它
const BRAND = {
  name: 'Bridgepulse 脉桥',
  // 小工具顶栏放不下全名时用
  short: '脉桥',
  // 小工具顶栏简称下面那行小字
  en: 'Bridgepulse',
  tagline: 'WHOOP 数据中文助手（非官方，与 WHOOP 公司无关）',
};

// electron/main.js 和 server.js 用 require 读同一份
if (typeof module !== 'undefined') module.exports = BRAND;
