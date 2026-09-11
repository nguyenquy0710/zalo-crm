---
type: feature
complexity: low
status: planning
related_issues: [QUYIT-731, QUYIT-732, QUYIT-733]
related_prs: []
estimated_hours: ~24-40
---

# Kế hoạch: Nút "Đồng bộ tin nhắn cũ" cho từng cuộc trò chuyện Zalo

> **Ngày lập kế hoạch:** 2026-09-11
> **Scope dự kiến:** `src/ui/components/chat/ChatWindow.tsx`, `src/configs/channelConfig.ts`, (không cần sửa backend cho nhóm — đã có sẵn)
> **Priority:** medium

---

## 1. Phân tích / Bối cảnh

Yêu cầu gốc (khách hàng): "Ở loại tài khoản Zalo, mỗi cuộc trò chuyện, thêm nút đồng bộ lịch sử tin nhắn cũ về". Đã chạy qua skill `nqdev-client-requirement-insight` để phân tích module + estimate trước khi lên plan này.

**Phát hiện quan trọng nhất (ràng buộc nền tảng, quyết định toàn bộ scope):**

- `zca-js` (thư viện Zalo Web API không chính thức mà app đang dùng) **chỉ hỗ trợ lấy lịch sử tin nhắn theo từng cuộc trò chuyện cụ thể cho NHÓM**, qua `api.getGroupChatHistory(groupId, count)`.
- Với hội thoại **1-1 (User)**, `ZaloService.getMessageHistory()` (`src/services/zalo/ZaloService.ts` dòng 1534-1548) trả thẳng `{ data: [] }` ngay lập tức — comment gốc trong code ghi rõ "user - không hỗ trợ trong API". Đây là giới hạn thật của thư viện, không phải thiếu sót code có thể vá được trong effort estimate hiện tại.
- Cơ chế duy nhất cho 1-1 là `requestOldMessages(ThreadType.User, null)` — yêu cầu Zalo đẩy lại tin nhắn cũ cho **toàn bộ tài khoản** qua kênh real-time (không chọn được đúng 1 cuộc trò chuyện, không có tổng số/tiến độ, không đảm bảo đủ). Tính năng này **đã tồn tại sẵn** dưới dạng nút chung ở `src/ui/components/layout/TopBar.tsx` (gọi `ipc.login.requestOldMessages(activeAccountId)`).
- Backend cho NHÓM đã có sẵn **~90%**: `electron/ipc/zaloIpc.ts` dòng 257-286 (`zalo:getGroupChatHistory`) đã gọi API, dedup qua `EventBroadcaster.broadcastMessage(zaloId, message, { silent: true })` (tự check `hasMessage()` tránh trùng), lưu DB, bắn event silent (không tăng unread, không kêu thông báo) — `useZaloEvents.ts`/`chatStore.ts` đã xử lý đúng case `isSilent` này rồi vì logic vốn được dùng cho account-init (`AccountInitPanel.tsx`'s "Tin nhắn nhóm cũ" task).

→ Kết luận: yêu cầu "theo từng cuộc trò chuyện" khả thi **chính xác 100% cho nhóm**, nhưng **không thể làm đúng nghĩa cho 1-1** trừ khi chấp nhận đổi hành vi thành "kích hoạt lại đồng bộ toàn tài khoản".

## 2. Approach / Strategy

Chia 3 module độc lập, không phase — feature nhỏ, làm gọn trong 1 đợt (3-5 person-days tổng):

**Module 1 — Nút đồng bộ cho hội thoại NHÓM** (MVP bắt buộc, độ phức tạp Thấp, ~2-3 ngày)
Chỉ cần wire UI vào pipeline backend đã có sẵn, không sửa backend:
- Thêm nút "Đồng bộ tin nhắn cũ" vào header `ChatWindow.tsx` — chỉ hiện khi thread đang mở là nhóm.
- Gọi `ipc.zalo.getGroupChatHistory({...})` đã có sẵn, thêm loading state + disable trong lúc chạy + toast kết quả ("Đã đồng bộ N tin nhắn cũ").
- Test thực tế: nhóm >500 tin nhắn, nhóm đã rời/giải tán, gọi lại nhiều lần liên tiếp (kiểm tra không trùng dữ liệu nhờ `EventBroadcaster.hasMessage()`).

**Module 2 — Nút đồng bộ cho hội thoại 1-1** (Quan trọng, độ phức tạp Trung bình do giới hạn nền tảng, ~0.5-1 ngày)
Đã chọn **phương án (b)**: vẫn hiện nút cho 1-1, nhưng khi bấm thì gọi lại `ipc.login.requestOldMessages(zaloId)` (đồng bộ toàn tài khoản, tái dùng logic đã có ở TopBar.tsx), kèm toast/copy giải thích rõ ràng cho user đây là đồng bộ toàn bộ tài khoản chứ không riêng cuộc trò chuyện này — tránh gây hiểu lầm khi người dùng bấm nút tưởng chỉ tải riêng cuộc trò chuyện đang mở.
*(Phương án (a) — ẩn nút hoàn toàn cho 1-1 — đã cân nhắc nhưng không chọn, vì khách hàng ưu tiên có 1 affordance nào đó ở mọi cuộc trò chuyện hơn là ẩn hẳn.)*

**Module 3 — Capability config + QA** (Quan trọng, độ phức tạp Thấp, ~0.5-1 ngày)
- Đăng ký flag hiển thị nút theo `src/configs/channelConfig.ts` (đúng convention repo — gate theo capability config thay vì hardcode điều kiện trong component).
- QA cả 2 chế độ Boss (desktop) và Employee (remote/web) — cả hai đi qua cùng 1 pipeline `proxyAction`/`ipc`, không tốn thêm effort code nhưng vẫn cần test riêng.
- Chống trùng dữ liệu khi bấm lại (đã có sẵn qua `EventBroadcaster.hasMessage()` — rủi ro thấp).
- Chống spam gọi API Zalo (cần thêm cooldown giữa các lần bấm cùng 1 cuộc trò chuyện).

## 3. Công việc cần thực hiện (Todo)

- [x] Module 1: Thêm nút "Đồng bộ tin nhắn cũ" trong `ChatHeader.tsx` (không phải `ChatWindow.tsx` — header hội thoại nằm ở component riêng) cho thread nhóm, wire vào `ipc.zalo.getGroupChatHistory`
- [x] Module 1: Loading state (`syncingGroupHistory`) + disable nút khi đang chạy + toast kết quả (icon xoay khi đang chạy)
- [x] Module 1: Thêm capability flag `supportsGroupHistorySync` vào `src/configs/channelConfig.ts` (zalo: true, facebook/telegram_bot/telegram_user: false) để gate nút đúng convention repo — phần nhỏ của Module 3 làm sớm vì cần thiết ngay cho Module 1
- [ ] Module 1: Test thực tế nhóm >500 tin nhắn / nhóm đã rời / bấm lại nhiều lần (kiểm tra không trùng) — **chưa test, cần chạy app thật**
- [x] Module 2: Thêm nút tương tự cho thread 1-1 trong `ChatHeader.tsx`, wire vào `ipc.login.requestOldMessages(activeAccountId)` (tái dùng logic đã có ở TopBar.tsx)
- [x] Module 2: Copy/toast giải thích rõ đây là đồng bộ toàn tài khoản (không riêng cuộc trò chuyện) — thêm capability flag `supportsAccountHistorySync` vào `channelConfig.ts` (zalo: true, còn lại: false)
- [ ] Module 2: Test thực tế trên app — **chưa test, cần chạy app thật**
- [x] Module 3: Thêm capability flag trong `src/configs/channelConfig.ts` (`supportsGroupHistorySync`, `supportsAccountHistorySync` — làm trong lúc implement Module 1/2)
- [x] Module 3: Thêm cooldown chống spam giữa các lần bấm — 30s/hội thoại (nhóm) hoặc 30s/tài khoản (1-1), **giá trị mặc định do chưa có phản hồi khách hàng cho câu hỏi mở ở mục 4/6, cần xác nhận lại và chỉnh nếu cần**
- [x] Module 3: QA code-level Boss/Employee mode — phát hiện + sửa 1 bug thật: `electron/ipc/loginIpc.ts`'s `login:requestOldMessages` (dùng bởi cả nút mới Module 2 lẫn nút cũ ở `TopBar.tsx`) gọi thẳng `ConnectionManager` cục bộ, KHÔNG có nhánh proxy sang Boss khi chạy ở desktop Employee mode (`WorkspaceManager` active workspace type `remote`) — khác với mọi channel `zalo:*` (đã tự proxy đúng qua `wrap()` trong `zaloIpc.ts`). Trên desktop Employee, bấm nút sẽ luôn báo "Tài khoản không online" vì session Zalo thật nằm ở Boss, không phải máy Employee. Đã sửa: thêm nhánh proxy giống hệt pattern `wrap()` (check `WorkspaceManager.getActiveWorkspace().type === 'remote'` + `!_fromRelay` để tránh proxy lặp khi Boss tự thực thi hộ employee từ xa qua `/api/proxy/action`). Employee qua web/browser vốn đã hoạt động đúng từ trước (Boss-side `HttpRelayService.executeProxyAction`'s `ipcMain._invokeHandlers` fallback tự chạy đúng trên máy Boss).
- [ ] Module 3: Test thực tế cooldown + bug fix trên cả 3 chế độ (Boss desktop, Employee desktop, Employee/web) — **chưa test, cần chạy app thật**
- [x] Tạo issue Jira tương ứng trên project QUYIT (epic QUYIT-695, sprint "QUYIT Sprint 34", fix version "Tháng 9/2026"): [QUYIT-731](https://nhquydev.atlassian.net/browse/QUYIT-731) (Module 1 - nhóm), [QUYIT-732](https://nhquydev.atlassian.net/browse/QUYIT-732) (Module 2 - 1-1), [QUYIT-733](https://nhquydev.atlassian.net/browse/QUYIT-733) (Module 3 - config + QA).

## 4. Risks & Unknowns

- **Risk 1:** Bấm nút đồng bộ liên tục có thể khiến Zalo rate-limit hoặc khoá tạm tài khoản → **Mitigation:** thêm cooldown giữa các lần bấm cùng 1 cuộc trò chuyện (Module 3), thời lượng cụ thể cần thống nhất với khách hàng.
- ~~**Unknown 1:** Số lượng tin nhắn mỗi lần đồng bộ — mặc định code hiện tại là 500 (`count` param của `getGroupChatHistory`) — có cần cho phép cấu hình không?~~ **Đã chốt (2026-09-11): có, cho cấu hình, mặc định 500.** Đã implement: bấm nút mở dialog nhập số lượng (giống pattern dialog "Tải tin nhắn từ Telegram" đã có sẵn), input mặc định `500`, cap tối đa `5000`, Enter hoặc nút "Đồng bộ" để xác nhận.
- **Unknown 2:** Có cần hỗ trợ "tải thêm"/phân trang (càng cũ càng tải thêm) cho nhóm hay 1 lần bấm là đủ? Chưa xác nhận `zca-js`'s `getGroupChatHistory` có hỗ trợ cursor/`lastMsgId` phân trang hay không. → **Plan:** thử nghiệm thực tế với 1 nhóm có nhiều tin nhắn trước khi cam kết hỗ trợ phân trang; nếu không rõ, ship Module 1 chỉ với 1 lần bấm (count mặc định), báo rõ giới hạn cho khách hàng.
- **Risk 2:** Kỳ vọng sai của người dùng cuối ở Module 2 — bấm nút tưởng chỉ đồng bộ riêng cuộc trò chuyện 1-1 đang mở, nhưng thực chất kích hoạt đồng bộ toàn tài khoản → **Mitigation:** copy/toast phải nêu rõ ràng, không mập mờ (đã note trong Module 2 ở trên).

## 5. Success Criteria

- Hội thoại nhóm: bấm nút → tin nhắn cũ xuất hiện trong khung chat, không trùng lặp khi bấm lại nhiều lần, hoạt động đúng cả Boss và Employee/web mode.
- Hội thoại 1-1: bấm nút → trigger đồng bộ toàn tài khoản thành công, người dùng hiểu đúng phạm vi qua thông báo hiển thị (không có complaint/report hiểu nhầm sau khi ship).
- Không phát sinh báo cáo rate-limit/khoá tài khoản Zalo liên quan tới tính năng này sau khi ship.
- 3 issue Jira tương ứng được tạo và đóng khi hoàn thành từng module.

## 6. Questions / Dependencies

- Cần khách hàng xác nhận cooldown 30s (giá trị mặc định đã implement, xem mục 3 Todo) có phù hợp không, hay cần đổi thành 1 phút/5 phút.
- ~~Cần khách hàng xác nhận có cần cấu hình số lượng tin nhắn đồng bộ~~ **Đã chốt: có, cho cấu hình, mặc định 500 (xem mục 4).**
- Đã tạo xong issue Jira: QUYIT-731, QUYIT-732, QUYIT-733 (project QUYIT, epic QUYIT-695, sprint "QUYIT Sprint 34", fix version "Tháng 9/2026"). Cả 3 đã chuyển trạng thái "In Progress", code đã xong, đang chờ test thực tế trên app (ngoài phạm vi tôi tự chạy được — xem `.claude/rules/dev-workflow-rules.md`).
