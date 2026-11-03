#!/bin/bash
# 双击打开 Bridgepulse 脉桥桌面小工具（Mac 试用版），和「启动桌面小工具.bat」做同样的事。
# 会打开一个「终端」窗口，小工具运行期间不要关它，关了小工具也会退出。
# 「示例数据预览.command」调用这个文件并加上 --demo。

# 双击时默认在用户主目录：先进到这个文件所在的文件夹
case "$0" in */*) cd "${0%/*}" || exit 1 ;; esac
DIR="$(pwd)"

wait_for_enter() {
  echo
  echo "按回车键关闭这个窗口…"
  read -r _
}

# 单独拿出来运行（例如拖到了「下载」里）：旁边没有项目文件，不动这个文件夹
if [ ! -f "$DIR/server.js" ] || [ ! -f "$DIR/package.json" ]; then
  echo "这个文件要放在解压出来的 Bridgepulse 文件夹里运行（旁边有 server.js 和 package.json）。"
  echo "请回到那个文件夹再双击。"
  wait_for_enter
  exit 1
fi

# 第一次运行：macOS 会给从网上下载的文件打上「从网上下载」标记，之后会把 Electron 一个个拦下来。
# 只处理这个 Bridgepulse 文件夹，不碰电脑上其他地方，而且只在确实还有标记的时候做一次。
if xattr -p com.apple.quarantine "$DIR/启动桌面小工具.command" >/dev/null 2>&1 \
  || xattr -p com.apple.quarantine "$DIR/示例数据预览.command" >/dev/null 2>&1 \
  || xattr -p com.apple.quarantine "$DIR/server.js" >/dev/null 2>&1; then
  xattr -dr com.apple.quarantine "$DIR" 2>/dev/null
  echo "第一次运行：已去掉这个 Bridgepulse 文件夹里文件的「从网上下载」标记（只处理这个文件夹）。"
fi

# 从 nodejs.org 装的 Node.js 在 /usr/local/bin，用 Homebrew 装的在 /opt/homebrew/bin；双击打开的终端不一定带上它们
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "没有找到 Node.js。"
  echo "请打开 https://nodejs.org ，下载并安装 LTS（长期支持）版本，装好后再双击这个文件。"
  wait_for_enter
  exit 1
fi

if [ ! -d "$DIR/node_modules/electron" ]; then
  echo "第一次使用，正在安装（约 100MB，只需一次）…"
  if ! npm install; then
    echo
    echo "安装没有成功，多半是网络问题。可以换国内镜像再试：在这个窗口里输入下面这行后按回车，然后再输入 npm install"
    echo '  export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"'
    wait_for_enter
    exit 1
  fi
fi

echo "正在打开 Bridgepulse 脉桥……小工具运行期间请不要关闭这个终端窗口。"
# 额外的参数（例如示例版的 --demo）原样交给小工具
npx electron . "$@"
code=$?
if [ "$code" -ne 0 ]; then
  echo "小工具意外退出了（代码 $code）。可以把这个窗口的截图发给作者。"
  wait_for_enter
fi
exit "$code"
