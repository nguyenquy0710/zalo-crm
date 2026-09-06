# Dev workflow rules

## Không tự chạy các lệnh khởi động app / build nặng / Docker

Không tự ý chạy các lệnh sau — luôn **in ra lệnh chính xác** để người dùng tự chạy thủ công trên máy của họ, rồi chờ họ dán lại output/log:

- `npm run dev`, `npm run production`, `electron .` hoặc bất kỳ lệnh khởi động app nào (desktop hoặc headless server, kể cả `node dist-electron/electron/server.js`).
- `docker build`, `docker compose build`, `docker compose up`, `docker run` — kể cả khi chỉ để "test thử".
- Bất kỳ lệnh build nặng/tốn thời gian nào có khả năng chiếm tài nguyên máy người dùng đang dùng để làm việc khác (`npm run build:electron`, `npm run rebuild:native`, `electron-builder`...).

**Lý do**: người dùng build/chạy thủ công trên máy của họ (tài nguyên Docker Desktop hạn chế đã từng gây OOM), Claude chỉ chuẩn bị/sửa code và đưa lệnh — không tự chạy thay.

**Cách áp dụng**: sau khi sửa code xong, đưa ra lệnh cụ thể kèm giải thích ngắn gọn lệnh đó làm gì/kỳ vọng kết quả gì. Sau khi người dùng chạy và dán lại output (log build, log container, kết quả test...), đọc log đó để tiếp tục chẩn đoán lỗi hoặc xác nhận thành công, rồi làm bước tiếp theo (sửa lỗi tiếp, viết test, review, v.v.) — không tự ý chạy lại lệnh đó để "tự kiểm tra".

**Ngoại lệ** (được phép tự chạy): các lệnh chỉ đọc/kiểm tra nhanh, không khởi động tiến trình dài hạn hoặc build nặng — `tsc --noEmit` (type-check), `git status`/`git diff`/`git log`, đọc log qua `gh`/GitHub API, `grep`/tìm file, lint.
