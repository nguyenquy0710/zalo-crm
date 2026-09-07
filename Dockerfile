# ZaloCRM — Boss backend chạy headless dưới NODE THUẦN (không dùng Electron thật) cho
# triển khai Docker/web. Xem plan: C:\Users\nhquydev\.claude\plans\snuggly-brewing-rabin.md
#
# electron/server.ts là entrypoint mới (khác electron/main.ts của bản desktop). Mọi
# `require('electron')` trong project được electron/headless-shim/resolveElectronShim.js
# (nạp qua `node --require`) trỏ sang electronShim.js — nên toàn bộ business logic hiện có
# (DatabaseService, electron/ipc/*.ts...) chạy lại NGUYÊN VẸN mà không cần Electron/Xvfb/
# Chromium thật. Ảnh nhẹ hơn và ít RAM hơn nhiều so với chạy Electron headless qua Xvfb.

# ─── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:22-bookworm AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci --legacy-peer-deps --no-audit --no-fund

COPY . .

# Giới hạn heap V8 rõ ràng thay vì để Node tự đoán theo RAM host — trên máy build ít RAM
# (<1GB), auto-sizing của V8 đôi khi vẫn cấp phát vượt mức khiến bị OOM-kill đột ngột
# (exit 134) thay vì báo lỗi "heap out of memory" rõ ràng. 1536 vẫn không đủ trong thực tế:
# `tsc -p tsconfig.electron.prod.json` peak ~1531MB old-space rồi "Ineffective mark-compact"
# — đặt cap sát mức peak khiến V8 không còn slack để compact hiệu quả, dẫn tới OOM dù live
# data chưa vượt cap. Default 4096 chừa nhiều slack, an toàn trên GitHub Actions runner chuẩn
# (4 vCPU/16GB RAM). Máy build ít RAM (<1GB, vd Docker Desktop giới hạn thấp) truyền:
#   docker build --build-arg TSC_MAX_OLD_SPACE=400 .
ARG TSC_MAX_OLD_SPACE=4096
ENV NODE_OPTIONS="--max-old-space-size=${TSC_MAX_OLD_SPACE}"

RUN npx tsc -p tsconfig.electron.prod.json
RUN NODE_ENV=production BUILD_TARGET=production npx vite build

# KHÔNG chạy `npm run rebuild:native` — script đó fetch prebuild better-sqlite3 cho ABI
# của Electron, nhưng runtime ở đây là Node thuần. `npm ci` ở trên đã tự build/tải đúng
# prebuild cho Node ABI của chính base image này rồi.

# Gỡ toàn bộ devDependencies (electron, typescript, vite, electron-builder...) — không
# process nào ở runtime cần chúng nữa (đã build xong dist/ + dist-electron/). Giảm đáng kể
# kích thước node_modules copy sang stage runtime (electron binary một mình đã ~200MB).
RUN npm prune --omit=dev

# ─── Stage 2: runtime (backend + web UI, 2 tiến trình chung 1 image) ──────────
# [nqdev] Đã thử để chính Node tự serve SPA (StaticSpaHandler.ts, xem git history) nhưng
# gây lỗi truy cập API khi deploy thực tế → rollback về đúng kiến trúc gốc: nginx phục vụ
# web tĩnh (port 80) và Node phục vụ API+Socket.IO (port 9900) là 2 tiến trình ĐỘC LẬP,
# KHÔNG proxy /api hay /socket.io qua nginx (WebLoginScreen tự nhập Boss URL, gọi
# cross-origin — CORS đã mở "*" ở HttpRelayService). Khác bản gốc (từng tách 2 image publish
# riêng "zalo-crm" + "zalo-crm-web") ở đúng 1 điểm: gộp cả 2 tiến trình vào chung 1
# Dockerfile/image, khởi động qua docker/entrypoint.sh.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx-light \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default

COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/nginx-web.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist-electron ./dist-electron
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/resources ./resources
COPY electron/headless-shim ./headless-shim
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# HOME cố định để electronShim.js's app.getPath('userData') (~/.config/ZaloCRM) rơi vào
# volume /data. ZALOCRM_SECRET_KEY: khoá mã hoá secret (thay OS keychain) — BẮT BUỘC set
# ở production qua `docker run -e` / docker-compose, không hard-code ở đây.
ENV HOME=/data \
    NODE_ENV=production
RUN mkdir -p /data && chmod 777 /data
VOLUME ["/data"]

# 9900: HttpRelayService (REST + Socket.IO Boss<->Employee) — node.
# 80: nginx phục vụ SPA tĩnh (dist/), fallback về index.html cho mọi route (SPA).
# 9888: IntegrationRegistry webhook, 9889: WebhookGatewayService (workflow webhook) — node.
EXPOSE 9900 9888 9889 80

ENTRYPOINT ["/entrypoint.sh"]
