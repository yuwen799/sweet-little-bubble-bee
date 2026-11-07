#!/bin/bash
# 双击运行：在本机开一个小服务器并用浏览器打开（摄像头需要通过 localhost 打开才能用）
cd "$(dirname "$0")"
PORT=8765
( sleep 1; open "http://localhost:$PORT" ) &
echo "Sweet Little Bubble Bee 已启动：http://localhost:$PORT  （关掉这个窗口就停止）"
python3 -m http.server $PORT
