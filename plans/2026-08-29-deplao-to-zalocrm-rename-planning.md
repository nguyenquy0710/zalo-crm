---
type: refactor
complexity: high
status: completed
related_issues: []
related_prs: []
estimated_hours: ~6-10
---

# Kế hoạch: Đổi thương hiệu ứng dụng từ "Deplao" sang "ZaloCRM"

> **Ngày lập kế hoạch:** 2026-08-29
> **Scope dự kiến:** 72 file trong repo `zalo-crm` (đã grep `Deplao|deplao|DEPLAO`, case-insensitive) + 1 repo ngoài (`babyvibe/deplao-builder`) không nằm trong tầm kiểm soát trực tiếp của thay đổi này
> **Priority:** high (ảnh hưởng nhận diện thương hiệu toàn app), nhưng có nhiều điểm **rủi ro cao cần quyết định nghiệp vụ trước khi sửa code**

---

## 1. Phân tích / Bối cảnh

Thư mục repo đã tên là `zalo-crm`, nhưng **thương hiệu hiển thị** (app name, tiêu đề cửa sổ, tray tooltip, trang landing, tài liệu, workflow branding...) hiện tại vẫn là **"Deplao"**. Yêu cầu: đổi toàn bộ thương hiệu hiển thị này thành **"ZaloCRM"**.

Đã grep toàn repo (case-insensitive) và tìm thấy **72 file** có chứa "Deplao"/"deplao". Phân loại theo mức độ rủi ro:

### Nhóm A — Nhận diện app / build config (RỦI RO CAO)
- [package.json](../package.json): `name`, `homepage` (`deplaoapp.com`), `build.appId` (`com.Deplao.app`), `build.productName`, `build.protocols.schemes` (`"deplao"`), `build.dmg.title`
- [electron/main.ts](../electron/main.ts): `app.setName('Deplao')`, `AppUserModelId` (`com.Deplao.app` / `com.Deplao.dev.*`), đăng ký & xử lý custom protocol `deplao://` (deep link), tiêu đề cửa sổ, tray tooltip, tên file DB mặc định `deplao-tool.db`

### Nhóm B — Tính liên tục dữ liệu người dùng hiện có (RỦI RO CAO)
- [src/utils/WorkspaceManager.ts](../src/utils/WorkspaceManager.ts): `DEFAULT_DB_NAME = 'deplao-tool.db'`, file cấu hình `deplao-config.json` — đây là **tên file vật lý đã tồn tại trên máy user đang dùng bản hiện tại**, không phải chỉ là chuỗi hiển thị.

### Nhóm C — Repo ngoài, ngoài tầm kiểm soát trực tiếp (RỦI RO CAO)
- [landing/src/constants.ts](../landing/src/constants.ts): `GH_RELEASES`, `GITHUB_URL` trỏ tới `github.com/babyvibe/deplao-builder`; các `DOWNLOAD_FILENAME*` dùng tiền tố `Deplao-...`
- [.github/workflows/build-windows.yml](../.github/workflows/build-windows.yml), [build-macos.yml](../.github/workflows/build-macos.yml), [build-ubuntu.yml](../.github/workflows/build-ubuntu.yml), [build-all.yml](../.github/workflows/build-all.yml): publish release lên repo `babyvibe/deplao-builder`, đặt tên release `"Deplao ${tag}"`

  → Theo root [CLAUDE.md](../CLAUDE.md), `babyvibe/deplao-builder` là **repo riêng biệt**, nơi binary thật sự được publish và landing page (GitHub Pages) được deploy. Repo này **không nằm trong scope sửa của lần này**.

### Nhóm D — Landing site (marketing copy, RỦI RO TRUNG BÌNH)
`landing/src/pages/TermsPage.tsx`, `landing/src/components/{WorkflowShowcase,Navbar,Hero,HowItWorks,IntegrationShowcase,Footer,DownloadCTA}.tsx`, `landing/index.html`, `landing/public/404.html`, `landing/vite.config.ts`, `landing/package.json`

### Nhóm E — Renderer UI text (RỦI RO TRUNG BÌNH, ~20 file)
Các chuỗi hiển thị (dialog, changelog, tooltip, settings, sidebar/topbar branding, lock screen, login screen, dashboard, workflow templates, tunnel settings...) trong `src/ui/**` — an toàn về mặt kỹ thuật, chỉ cần đổi chuỗi.

### Nhóm F — Comment/log nội bộ trong services (RỦI RO THẤP–TRUNG BÌNH)
`src/services/{tracking,telegram,http,file,facebook,event,database}/*.ts`, `src/configs/telegram.config.ts` — phần lớn là comment/log label, nhưng cần kiểm tra riêng từng chỗ xem có phải User-Agent string hay identifier gửi ra ngoài (Zalo/FB/Telegram API) hay không trước khi đổi.

### Nhóm G — Tài liệu (RỦI RO THẤP, an toàn)
`CLAUDE.md` (root + `docs/`, `landing/`, `electron/`, `src/services/`), `README.md`, `README.en.md`, `.rtk-usage.md`, `docs/Business-Document.md`

### Nhóm H — Asset (RỦI RO THẤP)
`assets/deplao-overview-map.svg` — tên file, cộng với chỗ nào đang tham chiếu tới nó.

### Nhóm I — Lockfile (KHÔNG sửa tay)
`yarn.lock`, `package-lock.json`, `landing/package-lock.json` — sẽ tự cập nhật khi `package.json.name` đổi và chạy lại install; không edit thủ công.

## 2. Approach / Strategy

Đề xuất chia làm **2 giai đoạn**, vì Nhóm A/B/C có rủi ro phá vỡ trải nghiệm người dùng hiện tại hoặc phụ thuộc vào quyết định/phối hợp ngoài phạm vi code:

**Giai đoạn 1 — Đổi an toàn (Nhóm D, E, F, G, H):** đổi toàn bộ chuỗi hiển thị "Deplao" → "ZaloCRM" trong UI, landing copy, docs, asset filename. Không ảnh hưởng dữ liệu người dùng cũ, không ảnh hưởng build/publish pipeline.

**Giai đoạn 2 — Đổi có rủi ro (Nhóm A, B, C):** chỉ thực hiện sau khi có quyết định rõ ràng cho từng điểm rủi ro ở mục 4. Có thể cần làm theo cách "giữ tương thích ngược" thay vì đổi thẳng.

Không tự ý gộp 2 giai đoạn làm 1 lần edit lớn, vì Nhóm A/B/C nếu đổi sai có thể: (a) khiến app không tự update được cho user cũ, (b) khiến user cũ bị "mất" dữ liệu do đổi tên file DB mặc định, (c) làm hỏng link tải trên landing page vì trỏ tới file/asset không tồn tại ở repo `deplao-builder`.

## 3. Công việc cần thực hiện (Todo)

### Giai đoạn 1 — An toàn
- [ ] Đổi chuỗi hiển thị trong toàn bộ Nhóm E (`src/ui/**`, ~20 file)
- [ ] Đổi chuỗi hiển thị trong Nhóm D (landing site — trừ `constants.ts` phần URL/domain, xem mục 4)
- [ ] Rà từng vị trí trong Nhóm F, đổi các comment/log không phải identifier chức năng
- [ ] Đổi tài liệu Nhóm G (`README.md`, `README.en.md`, các `CLAUDE.md`, `.rtk-usage.md`, `docs/Business-Document.md`)
- [ ] Đổi tên file `assets/deplao-overview-map.svg` → tên mới, cập nhật các chỗ tham chiếu
- [ ] Build renderer + chạy thử `npm run dev` để xác nhận UI hiển thị đúng "ZaloCRM" ở các vị trí chính (title bar, sidebar, tray, settings, changelog)

### Giai đoạn 2 — Cần quyết định trước (xem mục 4)
- [ ] `package.json`: `name`, `build.productName`, `build.appId`, `build.protocols`, `build.dmg.title`, `homepage`
- [ ] `electron/main.ts`: `app.setName`, `AppUserModelId`, protocol scheme `deplao://`, tray/tiêu đề cửa sổ
- [ ] `src/utils/WorkspaceManager.ts`: chiến lược đọc file DB/config cũ (`deplao-tool.db`, `deplao-config.json`) để không mất dữ liệu user hiện tại
- [ ] `landing/src/constants.ts`: URL/domain (phụ thuộc quyết định về repo `deplao-builder` và domain)
- [ ] `.github/workflows/build-*.yml`: tên release, repo publish đích (phụ thuộc quyết định về repo ngoài)

## 4. Risks & Unknowns

- **Risk 1 — Auto-update bị gãy:** electron-updater dựa vào `productName`/`appId` để nhận diện bản cập nhật. Nếu đổi `productName: "Deplao"` → `"ZaloCRM"` và `appId: com.Deplao.app` → `com.ZaloCRM.app`, **user đang cài bản "Deplao" sẽ không tự động nhận được bản cập nhật "ZaloCRM"** — họ phải cài mới thủ công. → **Mitigation:** cần quyết định có chấp nhận rủi ro này (kèm thông báo cho user cũ) hay giữ `appId` cũ và chỉ đổi `productName` hiển thị.
- **Risk 2 — Mất dữ liệu do đổi tên file DB mặc định:** `DEFAULT_DB_NAME = 'deplao-tool.db'` trong `WorkspaceManager.ts` là tên file thật trên đĩa của user hiện tại. Nếu đổi default filename cho bản mới mà không có logic "đọc file cũ nếu tồn tại", user cập nhật app sẽ thấy app trống dữ liệu. → **Mitigation:** giữ nguyên tên file vật lý cũ trong logic đọc/ghi, chỉ đổi phần hiển thị; hoặc thêm bước migrate 1 lần.
- **Risk 3 — Vỡ liên kết deep link `deplao://`:** nếu đổi protocol scheme sang `zalocrm://`, các link cũ (đã gửi cho khách hàng, lưu trong email, tích hợp ngoài...) dùng `deplao://` sẽ không còn mở được app. → **Mitigation:** cân nhắc đăng ký cả 2 scheme song song một thời gian, hoặc xác nhận với người dùng rằng chưa có ai phụ thuộc vào scheme cũ.
- **Risk 4 — Repo `babyvibe/deplao-builder` nằm ngoài phạm vi:** landing page và CI hiện trỏ thẳng tới repo này để publish/tải. Đổi tên chuỗi trong `constants.ts`/workflow mà **không đổi được chính repo ngoài đó** (nếu đó không phải quyết định lúc này) sẽ khiến nút tải trên landing trỏ sai hoặc CI publish thất bại. → **Cần xác nhận:** repo `deplao-builder` có được đổi tên/tạo repo mới song song không, hay landing/CI vẫn tiếp tục trỏ vào đúng repo đó chỉ đổi copy hiển thị.
- **Unknown 1 — Domain `deplaoapp.com`:** `package.json.homepage` và `TrackingService.ts` (theo root CLAUDE.md) gửi telemetry về domain này. Chưa rõ có domain mới cho "ZaloCRM" hay chưa. → **Plan:** hỏi người dùng trước khi đổi `homepage`/domain tracking.
- **Unknown 2 — User-Agent string trong services:** một số chuỗi "Deplao" trong `HttpClientService.ts`/`FacebookService.ts`/`TelegramUserListener.ts` có thể là identifier gửi kèm request tới Zalo/Facebook/Telegram, không chỉ là log. → **Plan:** đọc kỹ từng vị trí trong Giai đoạn 1 trước khi đổi, tách riêng nếu là identifier chức năng (đưa sang Giai đoạn 2 để cân nhắc thêm).

## 5. Success Criteria

- Toàn bộ chuỗi hiển thị cho người dùng cuối (UI renderer, landing site, tài liệu công khai) hiển thị "ZaloCRM" thay vì "Deplao", xác nhận bằng chạy `npm run dev` và duyệt qua các màn hình chính (title bar, sidebar, tray, settings/changelog, landing site).
- Không có chuỗi "Deplao" còn sót trong Nhóm D–H (grep lại `Deplao|deplao` sau khi sửa, kết quả chỉ còn lại các vị trí đã cố ý giữ nguyên ở Giai đoạn 2 + `yarn.lock`/`package-lock.json` tự sinh).
- Với các mục Giai đoạn 2: mỗi mục có quyết định rõ ràng bằng văn bản (giữ nguyên / đổi có kèm migration / đổi thẳng chấp nhận rủi ro) trước khi code, không tự suy đoán.
- Không có báo cáo mất dữ liệu hoặc lỗi auto-update từ user hiện tại sau khi rollout (nếu áp dụng Giai đoạn 2).

## 6. Questions / Dependencies

- Repo `babyvibe/deplao-builder` (nơi publish release + deploy landing) có được đổi tên/thay thế bằng repo mới cho "ZaloCRM" không, hay vẫn dùng nguyên repo đó?
- Domain `deplaoapp.com` — giữ nguyên hay đã có domain mới cho ZaloCRM?
- Có chấp nhận rủi ro auto-update bị gián đoạn cho user đang dùng bản "Deplao" khi đổi `appId`/`productName`, hay cần một bản cầu nối (vẫn giữ `appId` cũ, chỉ đổi tên hiển thị) trước?
- Custom protocol `deplao://` — có ai/hệ thống nào đang phụ thuộc vào scheme này không (để quyết định có cần giữ song song `zalocrm://` + `deplao://`)?

Sau khi có câu trả lời cho 4 câu hỏi trên, sẽ cập nhật lại kế hoạch này (đổi `status` sang `in_progress`) và bắt đầu Giai đoạn 1 trước — vì Giai đoạn 1 không phụ thuộc vào các câu trả lời này.

---

## 7. Quyết định đã chốt (2026-08-29)

Người dùng đã trả lời 5 câu hỏi mở (4 câu ở mục 6 + 1 câu bổ sung về tên file DB, vốn chưa được hỏi lúc lập kế hoạch ban đầu):

| Câu hỏi | Quyết định |
|---|---|
| Repo builder ngoài (`babyvibe/deplao-builder`) | **Không tách riêng nữa** — publish/release dùng chung repo source `nguyenquy0710/zalo-crm` |
| Domain (`deplaoapp.com`) | Đổi sang domain mới **`zalo-crm.quyit.id.vn`** |
| `appId`/`productName` (rủi ro auto-update) | Đổi thẳng `com.Deplao.app` → **`com.ZaloCRM.app`**, chấp nhận rủi ro user bản cũ không auto-update được, cần cài lại thủ công |
| Protocol scheme (`deplao://`) | Đổi hẳn sang **`zalocrm://`**, không giữ `deplao://` song song |
| Tên file DB mặc định (`deplao-tool.db`, rủi ro mất dữ liệu — hỏi bổ sung) | Đổi tên file thật sang **`zalocrm-tool.db`** / **`zalocrm-config.json`**; để giảm rủi ro mất dữ liệu cho user cũ, đã tự thêm logic fallback đọc file tên cũ nếu file tên mới chưa tồn tại (xem mục 8) |

## 8. Công việc đã thực hiện

1. **Rà soát lại phạm vi** bằng `git grep -lIi 'deplao'` (thay vì ripgrep case-sensitive ban đầu) → phát hiện thêm `Dockerfile`, `docker-compose.yml`, `NodeConfigPanel.tsx`, `workflowConfig.ts`, `src/ui/lib/web/WebLoginScreen.tsx` không có trong danh sách 72 file ban đầu ở mục 1. Tổng cộng 74 file (+ 1 file asset đổi tên).
2. **Thay thế theo thứ tự bắt buộc** để tránh xung đột pattern:
   - Bước 1 (đặc thù, chạy trước): `babyvibe/deplao-builder` → `nguyenquy0710/zalo-crm`; `deplaoapp.com` → `zalo-crm.quyit.id.vn`.
   - Bước 2 (tổng quát): `Deplao`→`ZaloCRM`, `deplao`→`zalocrm`, `DEPLAO`→`ZALOCRM` trên 73 file còn lại (trừ `WorkspaceManager.ts`, sửa tay riêng).
   - Bước 3: dò thêm biến thể viết hoa/thường hỗn hợp `DepLao` (bị bỏ sót ở bước 2) tại 5 file — sửa tay.
3. **Phát hiện & sửa 1 lớp lỗi mà phép thay thế mù không xử lý đúng**: chuỗi `deplao-builder` xuất hiện ở **hai ngữ cảnh khác nhau** nhưng cùng chứa substring giống nhau:
   - `github.com/babyvibe/deplao-builder` (đường dẫn owner/repo) → đã map đúng sang `github.com/nguyenquy0710/zalo-crm` ở bước 1.
   - `babyvibe.github.io/deplao-builder` (GitHub Pages base path, owner.github.io/repo) → phép thay bước 1 **không khớp** (owner nối bằng `.` không phải `/`), nên bị lọt qua bước 2 (tổng quát) và biến thành `babyvibe.github.io/zalocrm-builder` — sai, vì tên repo GH Pages giờ là `zalo-crm` (không có hậu tố `-builder`) và owner GitHub Pages phải là `nguyenquy0710`. Đã rà lại toàn bộ `landing/vite.config.ts` (`base`), `landing/public/404.html` (comment), `landing/index.html` (canonical/og/twitter/favicon), `landing/src/pages/TermsPage.tsx` (logo path cứng), và sửa tay cho khớp `nguyenquy0710.github.io/zalo-crm/`.
   - Bài học: khi thay thế mù theo chuỗi, cùng một "tên cũ" xuất hiện trong nhiều **định dạng URL khác nhau** (owner/repo vs owner.github.io/repo) cần map sang giá trị đích khác nhau — không thể gộp làm 1 pattern.
4. **`src/utils/WorkspaceManager.ts`** (sửa tay, không dùng thay thế hàng loạt): đổi `DEFAULT_DB_NAME` → `'zalocrm-tool.db'`, thêm hằng `LEGACY_DB_NAME = 'deplao-tool.db'` và `LEGACY_CUSTOM_FOLDER_CONFIG_NAME = 'deplao-config.json'` giữ lại có chủ đích. Thêm logic trong `migrateFromLegacy()`: nếu file DB tên mới chưa tồn tại nhưng file tên cũ (`deplao-tool.db`) tồn tại trên đĩa, dùng tên cũ làm `dbPath` cho workspace mặc định thay vì tạo DB rỗng mới — tránh user cũ (đã cài bản Deplao, chưa từng có `workspaces.json`) bị "mất" dữ liệu khi mở bản ZaloCRM lần đầu. Đồng thời gộp logic đọc `dbFolder` tùy chỉnh (trùng lặp ở 2 chỗ) thành 1 helper `resolveCustomDbFolder()` có fallback đọc `deplao-config.json` cũ nếu `zalocrm-config.json` chưa tồn tại.
5. **`assets/deplao-overview-map.svg`** → đổi tên file thật bằng `git mv` sang `assets/zalocrm-overview-map.svg` (giữ lịch sử git là "renamed", không phải xóa+thêm).
6. **`.github/workflows/build-macos.yml`**: sửa tên step CI bị thay lố thành "Publish .dmg lên zalocrm-builder" → đổi lại thành "Publish .dmg lên GitHub Releases" (không còn khái niệm repo `-builder` riêng nữa).
7. **`CLAUDE.md` (root), `docs/CLAUDE.md`, `docs/Business-Document.md`, `landing/CLAUDE.md`**: viết lại phần mô tả kiến trúc "2 repo tách biệt" (source vs. builder ngoài) — không còn đúng sau khi gộp về 1 repo — thành mô tả chính xác hiện tại (cùng 1 repo `nguyenquy0710/zalo-crm` vừa là source vừa là nơi publish release + GitHub Pages).
8. **Không đụng tới**: `yarn.lock`, `package-lock.json`, `landing/package-lock.json` (sẽ tự đồng bộ khi chạy lại `yarn install`/`npm install` — người dùng cần tự chạy trước khi build); mọi mention "babyvibe" **không** đi kèm "deplao-builder" (ví dụ author field, LICENSE, QR donation, affiliate program) — đây là tên tác giả/thương hiệu khác, ngoài phạm vi đổi tên "Deplao"→"ZaloCRM".
9. **Kiểm tra**: `node -e "JSON.parse(...)"` cho `package.json` và `landing/package.json` (hợp lệ); `npx tsc -p tsconfig.electron.json --noEmit` chạy sạch, không lỗi type sau toàn bộ thay đổi (kể cả logic mới trong `WorkspaceManager.ts`); grep lại `deplao` case-insensitive toàn repo → chỉ còn đúng các vị trí cố ý giữ (hằng số legacy trong `WorkspaceManager.ts`, file plan này, và 3 lockfile).

## 9. Trạng thái hiện tại

**Chưa commit.** Toàn bộ thay đổi đang ở working tree, một phần đã bị `git mv` tự động stage (rename file asset). Lưu ý: repo đang có sẵn một số file **đã được stage từ trước phiên làm việc này** (không liên quan đến việc đổi tên) — `.dockerignore`, `Dockerfile`, `docker-compose.yml`, `docker/entrypoint.sh` (tính năng Docker/headless deploy), và các file mới dưới `src/ui/lib/web/` (web runtime shim) — đây là công việc dang dở của người dùng, **không phải do phiên này tạo ra**; phiên này chỉ chạy sed đổi nội dung "Deplao"→"ZaloCRM" bên trong `Dockerfile`/`docker-compose.yml` vì chúng có chứa thương hiệu cũ (biến `DEPLAO_HEADLESS`→`ZALOCRM_HEADLESS`), không thay đổi gì khác về mặt tính năng của chúng.

Chưa chạy `npm run dev` / build thực tế để xác nhận UI hiển thị đúng bằng mắt (theo Success Criteria mục 5) — chỉ mới xác nhận qua type-check tĩnh.

## 10. Việc còn mở (chưa làm, để quyết định sau)

- [ ] Chạy `npm run dev` (hoặc `landing`: `npm run build` + preview) để xác nhận trực quan UI/landing hiển thị đúng "ZaloCRM" và không vỡ layout.
- [ ] Chạy lại `yarn install` (root) và `npm install` (trong `landing/`) để đồng bộ `yarn.lock`/`package-lock.json`/`landing/package-lock.json` theo `name` mới trong `package.json`.
- [ ] Xác nhận domain `zalo-crm.quyit.id.vn` đã trỏ DNS + có sẵn endpoint `/api/tracking/page` tương ứng trước khi build production (nếu chưa, `TrackingService.ts` sẽ gọi API lỗi — không crash app nhưng mất tracking).
- [ ] Tạo secret `GH_TOKEN` có quyền push Release cho repo `nguyenquy0710/zalo-crm` nếu workflow CI trước đây dùng PAT scope riêng cho `babyvibe/deplao-builder` (không thuộc phạm vi sửa code, cần cấu hình phía GitHub Settings).
- [ ] Thông báo cho người dùng hiện tại (đang cài bản "Deplao") về việc cần cài lại thủ công bản "ZaloCRM" do đổi `appId`, vì auto-update sẽ không hoạt động xuyên bản (rủi ro đã được người dùng chấp nhận ở mục 7).
- [ ] Cân nhắc dọn tài liệu README/CLAUDE.md nếu còn phát hiện thêm mô tả kiến trúc cũ (2 repo tách biệt) ở những nơi chưa rà tới ngoài các file đã liệt kê ở mục 8.7.

## 11. Bài học rút ra

- Khi đổi thương hiệu app đã publish, không chỉ tìm chuỗi tên cũ theo 1-2 case (PascalCase/lowercase) — biến thể viết hoa/thường hỗn hợp bất quy tắc (`DepLao`) và biến toàn hoa dùng làm env var (`DEPLAO_HEADLESS`) dễ bị bỏ sót nếu chỉ thay 2 pattern.
- Cùng một chuỗi con ("tên-cũ-builder") có thể xuất hiện trong nhiều **cấu trúc URL khác nhau** (`github.com/owner/repo` vs `owner.github.io/repo`) đại diện cho hai khái niệm khác nhau (đường dẫn repo vs. base path GitHub Pages) — thay thế mù theo 1 pattern duy nhất sẽ đúng ở chỗ này và sai ở chỗ kia; cần grep riêng theo từng "hình dạng" URL để rà lại.
- Với tên file dữ liệu đã tồn tại trên máy người dùng thật (không phải chỉ là chuỗi hiển thị), ngay cả khi người dùng chấp nhận đổi thẳng, vẫn nên tự thêm một lớp fallback đọc tên cũ nếu tên mới không tồn tại — chi phí thấp, giảm hẳn rủi ro "mất dữ liệu" mà vẫn tôn trọng quyết định đổi tên của người dùng.
