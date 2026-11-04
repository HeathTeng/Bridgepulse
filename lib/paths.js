// 设置和数据放在哪：源码运行时就是项目文件夹里的 .env 和 data/（和以前一样）；
// 打包版由 electron/main.js 在加载服务器之前设好 BRIDGEPULSE_HOME（系统给应用的用户数据文件夹），因为安装包里面不能写。
const path = require('path');

const APP_DIR = path.join(__dirname, '..');
const HOME = process.env.BRIDGEPULSE_HOME || APP_DIR;

module.exports = {
  APP_DIR,
  HOME,
  PACKAGED: Boolean(process.env.BRIDGEPULSE_HOME),
  // BRIDGEPULSE_ENV_FILE 只给测试用，指向临时的假文件
  ENV_FILE: process.env.BRIDGEPULSE_ENV_FILE || path.join(HOME, '.env'),
  DATA_DIR: path.join(HOME, 'data'),
};
