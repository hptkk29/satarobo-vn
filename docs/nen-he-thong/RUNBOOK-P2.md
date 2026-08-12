# Runbook P2 — backfill nhân sự → Vị trí + Phân công (US-11)

> Nền Hệ thống P2 (US-08 Position · US-09 Assignment · US-10 WorkScope · US-11 backfill).
> Người thực hiện: **Dev** (luật cứng #4 — agent chỉ soạn script + dry-run, không chạy).

## 0. Điều kiện tiên quyết

| Điều kiện | Kiểm bằng |
|---|---|
| Migration P2 đã áp trên DB đích | có bảng `Position`, `PositionAssignment`, `WorkScope` |
| **Chuỗi P1 đã chạy xong trên CHÍNH DB đó** | `RUNBOOK-P1.md` mục 1, và `OrgUnit.path` không còn dòng NULL |

Script tự kiểm điều kiện thứ hai và **từ chối `--apply`** nếu còn đơn vị thiếu `path`.
Lý do chặn cứng: vị trí neo vào `orgUnitId`, chạy trước khi dời cây là neo vào hình cũ —
mà `Position` **cố ý không có đường xoá cứng** (nó là lịch sử tổ chức), nên sửa sai rất đắt.

## 1. Chạy

### Trên PROD — qua workflow, KHÔNG chạy từ máy dev

Chuỗi kết nối prod nằm trong secret `PROD_DIRECT_URL` (Sensitive trên Vercel, không
ai đọc lại được), nên máy dev **không chạm tới prod**. Chạy qua Actions:

> **Nền P2 — backfill nhân sự → Vị trí + Phân công (prod)**
> (`.github/workflows/nen-p2-position.yml`, `workflow_dispatch`)

| Input | Mặc định | Ghi chú |
|---|---|---|
| `mode` | `dry-run` | `apply` mới ghi |
| `gan_vai` | `false` | **để nguyên** ở lần chạy đầu — xem §3 |
| `confirm` | rỗng | khi `apply` phải gõ đúng `GHI THAT VAO PROD` |

Workflow tự làm 4 việc: kiểm điều kiện tiên quyết (§0) → in bản đối chiếu **và lưu
thành artifact 90 ngày** → ghi (nếu `apply`) → chạy lại để chứng minh idempotent.
Bản đối chiếu chạy ở CẢ hai chế độ: ở `apply` nó là ảnh chụp "trước khi ghi", vì P2
không có nút lùi tự động (xem §4).

Muốn kiểm điều kiện riêng, không đụng gì:
```bash
pnpm tsx scripts/nen-p2-kiem-tien-quyet.ts   # chỉ đọc, thoát ≠ 0 nếu chưa đủ
```

### Trên DB dev / local


```bash
# (1) XEM TRƯỚC — in bản đối chiếu ra màn hình, không ghi gì
pnpm tsx scripts/nen-p2-backfill-position.ts

# (2) Xuất ra file để duyệt / lưu hồ sơ
pnpm tsx scripts/nen-p2-backfill-position.ts --out doi-chieu-nhan-su.md

# (3) Ghi thật — CHỈ sau khi đã duyệt từng dòng ở mục 1 và 2 của bản đối chiếu
pnpm tsx scripts/nen-p2-backfill-position.ts --apply
```

## 2. Đọc bản đối chiếu

| Mục | Nghĩa | Phải làm gì |
|---|---|---|
| **1. Vị trí** | mỗi dòng = một chỗ ngồi sẽ có trong sơ đồ (đơn vị × chức danh) | soát tên vị trí: nó lấy nguyên văn `Employee.jobTitle`, nên `jobTitle` ghi kiểu phòng ban (`"Phòng Đào Tạo"`) sẽ thành tên vị trí y như vậy. Muốn đẹp thì **sửa hồ sơ nhân sự rồi chạy lại**, đừng sửa script |
| **2. Phân công** | mỗi dòng = một người vào một vị trí, kiểu PRIMARY | soát cột *Hiệu lực từ*. Dòng có ⚠️ nghĩa là `joinedAt` trống hoặc là rác (dữ liệu thật có hồ sơ mang `1970-01-01`) nên script lấy **ngày chạy** |
| **3. Chờ xử lý tay** | người script **không đoán** (AC3) | điền `centerId`/`orgUnitId` hoặc `jobTitle` cho họ ở màn nhân sự, rồi chạy lại; hoặc gán tay ở `/admin/nhan-su/vi-tri` |

## 3. Bộ vai — mặc định KHÔNG gắn

Backfill **không** gắn vai trò cho vị trí sinh ra. Vị trí không vai vẫn đúng nghiệp vụ (nó
là chỗ ngồi trong sơ đồ) và **tuyệt đối vô hại**: `loadPositionRoleRows` duyệt
`position.roles`, rỗng thì không sinh hàng quyền nào ⇒ chạy backfill **không đổi quyền của
bất kỳ ai**.

Khi nào bật `--gan-vai`: lúc muốn chuyển quyền sang mô hình mới. Khi đó vai chỉ lấy từ
`UserOrgRole` mà **chính người đó đang giữ tại chính đơn vị đó** — giao của hai tập, không
phải hợp ⇒ không ai được thêm quyền nào so với trước khi chạy. Bản đối chiếu in rõ bộ vai
của từng vị trí để duyệt trước.

## 4. Chạy lại / rollback

- **Idempotent**: vị trí khớp (đơn vị, chức danh) thì dùng lại; người đã có phân công
  PRIMARY còn hiệu lực thì bỏ qua (kiểm bằng chính `assertSinglePrimary` của US-09). Chạy
  lần hai là 0 thay đổi.
- **Ghi trong một transaction** — lỗi giữa chừng không để lại vị trí mồ côi.
- **Lùi**: gỡ phân công bằng cách đóng `effectiveTo` ở `/admin/nhan-su/vi-tri` (không xoá —
  US-09 AC3). Vị trí tạo nhầm thì **tắt** (`isActive = false`), đừng xoá cứng.
- Backfill **không đụng** `Employee`, `User`, `UserOrgRole` — đường quyền cũ nguyên vẹn.

## 5. Số đo tham chiếu (DB dev, 11/08/2026)

36 nhân sự đang làm → **24 vị trí · 34 phân công · 2 chờ xử lý tay** (Tổng Giám đốc và một
nhân sự nữa không gắn cơ sở nào — đúng ca "không đoán"). 4 dòng mang cờ ⚠️ vì `joinedAt`
là `1970-01-01`. Số trên PROD sẽ khác; đọc bản đối chiếu của chính lần chạy đó.
