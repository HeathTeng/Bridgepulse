// 把 16 / 32 / 48 / 256 的 PNG 拼成 Windows 用的 assets/icon.ico（不加依赖）。
// .ico 里每个尺寸直接存整张 PNG，Windows Vista 以后都认。先运行 scripts/make-icons.js 生成 PNG。
const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');
const SIZES = [16, 32, 48, 256];

const images = SIZES.map((size) => {
  const png = fs.readFileSync(path.join(ASSETS, `icon-${size}.png`));
  if (png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) throw new Error(`icon-${size}.png 的尺寸不对`);
  return { size, png };
});

// 文件头 6 字节 + 每张图 16 字节的目录，后面依次放 PNG
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // 保留
header.writeUInt16LE(1, 2); // 1 = 图标
header.writeUInt16LE(images.length, 4);
let offset = 6 + 16 * images.length;
const entries = images.map(({ size, png }) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size >= 256 ? 0 : size, 0); // 宽，256 记作 0
  e.writeUInt8(size >= 256 ? 0 : size, 1); // 高
  e.writeUInt8(0, 2); // 调色板颜色数
  e.writeUInt8(0, 3); // 保留
  e.writeUInt16LE(1, 4); // 色彩平面
  e.writeUInt16LE(32, 6); // 每像素位数
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += png.length;
  return e;
});
const ico = Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
fs.writeFileSync(path.join(ASSETS, 'icon.ico'), ico);
console.log('icon.ico', SIZES.join(' / '), `${Math.round(ico.length / 1024)} KB`);
