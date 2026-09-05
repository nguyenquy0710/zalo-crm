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
# (exit 134) thay vì báo lỗi "heap out of memory" rõ ràng. Chỉnh số này theo RAM Docker
# Desktop cấp cho VM — cần chừa lại ~150-200MB cho OS/container runtime, phần còn lại
# mới đưa cho old-space (RSS thực tế thường cao hơn old-space ~20-30% do new-space/code).
ENV NODE_OPTIONS="--max-old-space-size=512"

RUN npx tsc -p tsconfig.electron.prod.json
RUN NODE_ENV=production BUILD_TARGET=production npx vite build

# KHÔNG chạy `npm run rebuild:native` — script đó fetch prebuild better-sqlite3 cho ABI
# của Electron, nhưng runtime ở đây là Node thuần. `npm ci` ở trên đã tự build/tải đúng
# prebuild cho Node ABI của chính base image này rồi.

# Gỡ toàn bộ devDependencies (electron, typescript, vite, electron-builder...) — không
# process nào ở runtime cần chúng nữa (đã build xong dist/ + dist-electron/). Giảm đáng kể
# kích thước node_modules copy sang stage runtime (electron binary một mình đã ~200MB).
RUN npm prune --omit=dev

# ─── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-electron ./dist-electron
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/resources ./resources
COPY electron/headless-shim ./headless-shim

# HOME cố định để electronShim.js's app.getPath('userData') (~/.config/ZaloCRM) rơi vào
# volume /data. ZALOCRM_SECRET_KEY: khoá mã hoá secret (thay OS keychain) — BẮT BUỘC set
# ở production qua `docker run -e` / docker-compose, không hard-code ở đây.
ENV HOME=/data \
    NODE_ENV=production
RUN mkdir -p /data && chmod 777 /data
VOLUME ["/data"]

# 9900: HttpRelayService (REST + Socket.IO Boss<->Employee/web)
# 9888: IntegrationRegistry webhook, 9889: WebhookGatewayService (workflow webhook)
EXPOSE 9900 9888 9889

ENTRYPOINT ["node", "--require", "/app/headless-shim/resolveElectronShim.js", "dist-electron/electron/server.js"]
