/**
 * StaticSpaHandler - Serve renderer SPA bundle (dist/) từ cùng process với REST API.
 *
 * Gộp "web" (UI trình duyệt) và "api" (backend) vào MỘT image/container thay vì 2 image
 * riêng (trước đây stage "web" dùng nginx tách biệt) — HttpRelayService.ts (Node, port 9900)
 * giờ tự serve luôn dist/index.html + assets, không cần nginx nữa.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.map': 'application/json',
};

function detectMime(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Handle GET request không khớp bất kỳ route /api/* nào — serve file tĩnh từ distDir,
 * fallback về index.html cho SPA routing (app không dùng react-router-dom nhưng vẫn
 * fallback để tránh 404 khi refresh/deep-link vào 1 AppView cụ thể).
 * Trả về false nếu distDir không tồn tại (vd chạy dev chưa build renderer) — caller nên
 * tự xử lý 404 trong trường hợp đó thay vì hiện lỗi 500 khó hiểu.
 */
export function handleStaticSpaRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    distDir: string
): boolean {
    if (!fs.existsSync(distDir)) return false;

    const url = req.url || '/';
    const pathname = decodeURIComponent(url.split('?')[0]);

    // Chặn path traversal - chỉ phục vụ file bên trong distDir.
    if (pathname.includes('..')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad request' }));
        return true;
    }

    const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    let filePath = path.join(distDir, relPath);

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        filePath = path.join(distDir, 'index.html'); // SPA fallback
    }

    if (!fs.existsSync(filePath)) return false;

    res.writeHead(200, { 'Content-Type': detectMime(filePath) });
    fs.createReadStream(filePath).pipe(res);
    return true;
}
