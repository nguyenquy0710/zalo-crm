#!/bin/bash
# [nqdev] Chạy chung nginx (web tĩnh, port 80) + node backend (API/Socket.IO, port 9900)
# trong cùng 1 container/image — rollback khỏi hướng để Node tự serve SPA
# (StaticSpaHandler.ts, xem git history) vì gây lỗi truy cập API khi deploy thực tế.
# Không proxy /api hay /socket.io qua nginx — 2 tiến trình độc lập y hệt bản gốc
# tách 2 image, chỉ khác là đóng gói chung 1 image duy nhất.
#
# Forward TERM/INT xuống cả 2 tiến trình con; thoát ngay khi 1 trong 2 chết (tránh
# container "sống dở" khi nginx hoặc node đã crash mà container vẫn chạy).
set -e

nginx -g 'daemon off;' &
NGINX_PID=$!

node --require /app/headless-shim/resolveElectronShim.js dist-electron/electron/server.js &
NODE_PID=$!

trap 'kill -TERM "$NGINX_PID" "$NODE_PID" 2>/dev/null' TERM INT

wait -n "$NGINX_PID" "$NODE_PID"
EXIT_CODE=$?
kill -TERM "$NGINX_PID" "$NODE_PID" 2>/dev/null
exit "$EXIT_CODE"
