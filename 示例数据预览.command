#!/bin/bash
# 用示例数据打开 Bridgepulse 脉桥（Mac 试用版），不需要 WHOOP 账号；和「示例数据预览.bat」做同样的事。
# 真正的步骤都在「启动桌面小工具.command」里，这里只是加上 --demo。

case "$0" in */*) cd "${0%/*}" || exit 1 ;; esac
exec /bin/bash "./启动桌面小工具.command" --demo
