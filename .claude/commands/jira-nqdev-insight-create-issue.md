---
description: Phân tích yêu cầu khách hàng (qua skill nqdev-client-requirement-insight) rồi tạo issue tương ứng trên Jira nqdev (qua /tracker-jira-nqdev), điền sẵn Epic/Sprint/Fix version/Original estimate.
argument-hint: [tài liệu/mô tả yêu cầu cần phân tích] [--epic KEY] [--sprint "..."] [--fix-version "..."] [--labels "..."] [--type "..."]
allowed-tools: Bash(curl:*)
---

# Tạo issue Jira nqdev từ bản phân tích yêu cầu khách hàng — $ARGUMENTS

Lệnh này nối 2 skill có sẵn: `nqdev-client-requirement-insight` (phân tích spec → module + estimate) và
`/tracker-jira-nqdev` (thao tác Jira Cloud nhquydev.atlassian.net). Không tự tạo lại logic phân tích hay
logic gọi Jira API ở đây — luôn gọi qua 2 skill/command đó.

## Field mặc định (điền sẵn cho mọi issue tạo bởi lệnh này)

| Field | Giá trị mặc định | Override bằng |
|---|---|---|
| Epic | `QUYIT-695` | `--epic <KEY>` |
| Sprint | `QUYIT Sprint 34` | `--sprint "<NAME>"` |
| Fix version | `Tháng 9/2026` | `--fix-version "<NAME>"` |
| Labels | (không set) | `--labels "<L1>,<L2>,..."` |
| Issue type | `Task` | `--type "<TYPE>"` |
| Project | `QUYIT` (suy ra từ epic mặc định) | ngầm định theo project của `--epic` |

## Bước 0 — Lấy bản phân tích

- Nếu phần còn lại của `$ARGUMENTS` (sau khi tách các flag `--epic/--sprint/--fix-version/--labels/--type`)
  có nội dung: coi đó là tài liệu/mô tả yêu cầu, gọi skill `nqdev-client-requirement-insight` với nội dung
  này để lấy bản phân tích module + estimate.
- Nếu không có nội dung nào khác ngoài flag (hoặc `$ARGUMENTS` rỗng): dùng bản phân tích
  `nqdev-client-requirement-insight` **gần nhất đã có trong cuộc hội thoại hiện tại**. Nếu hội thoại chưa
  có bản phân tích nào, dừng lại, báo rõ và yêu cầu người dùng cung cấp tài liệu yêu cầu hoặc chạy
  `/nqdev-client-requirement-insight` trước — không tự bịa module/estimate.

## Bước 1 — Map mỗi module trong bản phân tích thành 1 issue

Với mỗi module/chức năng trong bản phân tích:
- **summary**: tên module/chức năng.
- **description**: mô tả ngắn + task list + mức độ ưu tiên (MVP/Quan trọng/Nice-to-have) + độ phức tạp
  (Thấp/Trung bình/Cao), lấy nguyên nội dung đã phân tích, không diễn giải lại.
- **original estimate**: lấy effort person-days của module đó.
  - Nếu bản phân tích cho range (vd. "3–5 days"): lấy trung điểm, làm tròn lên bội số 0.5 ngày gần nhất.
  - Đổi sang chuỗi duration Jira dạng `"<N>d"` (site này xác nhận `1d = 8h`, theo quy ước của
    `/tracker-jira-nqdev`). Ghi rõ cách quy đổi (range gốc → số ngày dùng) trong bảng preview ở Bước 2,
    không âm thầm làm tròn.

## Bước 2 — Bảng preview & xác nhận (BẮT BUỘC — không bỏ qua bước này)

Đây là hành động tạo dữ liệu thật trên hệ thống Jira dùng chung (nhiều người khác thấy được), nên PHẢI
xác nhận trước khi gọi API tạo issue thật, kể cả khi đang chạy ở chế độ tự động:

Hiển thị bảng:

`# | Summary | Priority | Complexity | Original estimate | Epic | Sprint | Fix version | Labels`

(dùng giá trị mặc định/override đã xác định ở phần "Field mặc định" cho mọi dòng). Sau bảng, hỏi:

> Xác nhận tạo N issue trên Jira (epic <EPIC-KEY>) như trên? (yes/no)

Chỉ tiếp tục sang Bước 3 khi người dùng xác nhận rõ ràng. Nếu người dùng muốn bỏ bớt/sửa module nào, sửa
lại bảng và hỏi xác nhận lại trước khi tạo.

## Bước 3 — Tạo issue

Với mỗi issue đã xác nhận, gọi `/tracker-jira-nqdev create`:

```
/tracker-jira-nqdev create --project <PROJECT-KEY-CỦA-EPIC> --type "<TYPE>" \
  --summary "<summary>" --description "<description>" \
  --epic <EPIC-KEY> --sprint "<SPRINT-NAME>" --fix-version "<FIX-VERSION-NAME>" \
  [--labels "<labels>"] --original "<Nd>"
```

(`<PROJECT-KEY-CỦA-EPIC>` = phần trước dấu `-` trong `<EPIC-KEY>`, vd. epic `QUYIT-695` → project `QUYIT`).
Nếu 1 issue tạo lỗi (vd. sprint không tìm thấy, version chưa có quyền tạo...), ghi rõ lỗi đó, **không dừng
toàn bộ batch** — tiếp tục tạo các issue còn lại rồi tổng kết cả thành công lẫn thất bại ở Bước 4.

## Bước 4 — Output

Bảng kết quả cuối cùng: `Issue key | Summary | Link | Original estimate | Trạng thái (OK/Lỗi)`. Với issue
lỗi, ghi rõ lý do lấy từ response Jira thay vì chỉ ghi "Lỗi" chung chung.
