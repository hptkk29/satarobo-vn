# Prompt manual test — verify `fixlms-r7bugs` trước khi push lên `origin/FixLMS`

> Copy toàn bộ phần trong khung dưới đây dán vào **Claude extension (VS Code)**.
> Người chạy: Claude extension trên máy local. Dev server **đã chạy sẵn** ở `http://localhost:3000`.

---

## BỐI CẢNH (cho Claude extension)

Bạn đang ở repo `E:\satarobo-vn`, branch hiện tại **`fixlms-r7bugs`** (off `origin/FixLMS`). Branch này port 9 bug-fix R7 lên nhánh canonical FixLMS (commit `0be3bd9`). Nhiệm vụ của bạn: **manual test trên local để xác nhận 9 fix hoạt động + LMS không hồi quy**, RỒI báo cáo PASS/FAIL từng mục. **KHÔNG push, KHÔNG merge, KHÔNG sửa code** trừ khi tôi yêu cầu — chỉ test và report.

### Môi trường
- Dev server đã chạy: **http://localhost:3000** (đừng tự khởi động lại; nếu chết thì `pnpm dev`).
- DB = **1 project Supabase duy nhất** (không tách dev/prod), gần như rỗng — chỉ có ít data thật (danh sách GV/nhân sự). Đã apply sẵn:
  - migration `20260619020000_r7_06_enrollment_leadchild`
  - `patch-rbac-admins.ts` → đã gán `UserOrgRole SUPER_ADMIN@HO` cho 3 admin: `hodacphuc.sr@…`, `phuc@…`, `admin@satarobo.com`.
- ⚠️ DB chia sẻ → **không xoá data thật**. Tạo lead/HV test thì đặt tên rõ `__TEST__` để dễ dọn. Không chạy `prisma migrate reset` / `db:reset` (DB này không phải Postgres test local).
- 3 host: public `localhost:3000/`, admin route group `/admin/*`, portal `/portal/*`. Login ở `/login`.
- **Cần tôi cung cấp mật khẩu admin** (1 trong 3 tài khoản trên) — HỎI tôi trước khi test, đừng đoán. (Seed local mặc định là `phuc@satarobo.vn` / `ChangeMe@2026!` nhưng Supabase có thể khác.)

### Cách quan sát
- Dùng browser của bạn (hoặc hỏi tôi tự thao tác cho mục cần mắt người). Với mỗi bước: ghi rõ **kỳ vọng** vs **thực tế**.
- Kiểm tra Console (lỗi JS) + Network (status 4xx/5xx) + terminal dev server (lỗi server/Prisma).

---

## CÁC CA TEST (9 fix)

### RC-A — Admin có `UserOrgRole` (hệ RBAC mới) hết vỡ
Gốc lỗi cũ: admin thiếu `UserOrgRole` → `resolveActor()` scope rỗng → vỡ 3 chỗ. Test sau khi login bằng 1 trong 3 admin đã patch:

1. **BUG-001 — Thêm con vào lead lưu được**
   - Vào `/admin/leads` → mở 1 lead (hoặc tạo lead test) → mục "Con của phụ huynh" → thêm 1 con (tên `__TEST__ Bé A`, lớp/ngày sinh).
   - ✅ Kỳ vọng: lưu OK, con hiện trong danh sách, reload vẫn còn. ❌ Cũ: rớt `passesScope`, không lưu.

2. **BUG-002 — Dropdown "Cơ sở" (center) có dữ liệu**
   - Ở form tạo/sửa lead (hoặc nơi chọn center) → mở dropdown cơ sở.
   - ✅ Kỳ vọng: thấy danh sách cơ sở (HO/CS1/CS2…), không rỗng.

3. **BUG-003 — Vào `/admin/classes` không bị đá ra**
   - Truy cập `http://localhost:3000/admin/classes`.
   - ✅ Kỳ vọng: trang lớp học load bình thường. ❌ Cũ: redirect / 404.

### RC-B — Route segment (lưu ý: FixLMS đã có sẵn `payments`/`cong-no`)
4. **BUG-004 — Vào trang tài chính không bị 404**
   - Truy cập `/admin/payments` và `/admin/cong-no`.
   - ✅ Kỳ vọng: load OK (không bị middleware đá sang satarobo.vn / 404). (FixLMS không có route `hoan-tien` — bỏ qua mục này nếu không tồn tại.)

### BUG-005 — Guard convert: chỉ chốt khi kế toán ĐÃ XÁC NHẬN
Logic mới: chỉ cho convert khi có ≥1 Payment `accountantStatus=CONFIRMED` (HOẶC Σ phải-thu = 0 = học bổng toàn phần). Khoản `RECORDED`/`PENDING`/`REJECTED` đều KHÔNG đủ.

5. Lấy 1 lead ở trạng thái "Đã đăng ký", có con + order. Vào nút **"Chuyển đổi → Ghi danh (v2)"** (`/admin/leads/<id>/convert`).
   - Khi order **chưa có** Payment CONFIRMED → ✅ Kỳ vọng: chặn, báo lỗi `PAYMENT_REQUIRED` ("Cần ghi nhận khoản thanh toán trước khi chốt").
   - Sau khi kế toán xác nhận 1 khoản (accountantStatus=CONFIRMED) → ✅ convert chạy tiếp được.
   - (Đối chứng: portal phụ huynh chỉ hiện khoản CONFIRMED — nhất quán, không phải bug.)

### BUG-006 — Enrollment lưu `leadChildId` (per-child truy vết)
6. Convert v2 thành công cho lead có **≥2 con** → mỗi con tạo 1 Enrollment riêng, mỗi Enrollment gắn đúng `leadChildId` của con nguồn.
   - Kiểm tra qua UI ghi danh, hoặc nhờ tôi soi DB (`Enrollment.leadChildId` not null, map đúng con).

### BUG-007 — Markdown editor (news) chèn NHIỀU ảnh
7. Vào `/admin/news` → tạo/sửa bài → trong markdown editor body:
   - Chọn **nhiều ảnh cùng lúc** qua nút upload → ✅ tất cả được chèn (không chỉ 1).
   - **Paste** ảnh từ clipboard → chèn OK.
   - **Drag-drop** nhiều ảnh → chèn OK.

### BUG-008 — Timezone Asia/Ho_Chi_Minh + tránh hydration mismatch
8. Mở `/admin/leads/<id>` (panel hoạt động) + `/admin/leads` (table/kanban) + chi tiết lớp trial.
   - ✅ Kỳ vọng: ngày/giờ hiển thị theo giờ VN (GMT+7), không lệch ngày. Cờ "quá hạn" (isOverdue) chỉ tính sau khi mounted → **không có cảnh báo hydration mismatch** trong Console.

### BUG-009 — Nhãn dashboard rõ nghĩa
9. Mở `/admin/dashboard` (vai trò manager).
   - ✅ Kỳ vọng: thẻ ghi **"Tổng học viên"** (đếm bảng Student) và **"Tỉ lệ chuyển đổi (lead)"** — không còn "Học viên đăng ký" / "Conversion rate" mơ hồ.

---

## LMS REGRESSION (smoke — đảm bảo không vỡ luồng chính)
Chạy nhanh để chắc 9 fix không làm hỏng luồng LMS hiện có:
- **Lead → Trial → Convert → Enrollment**: tạo lead test → thêm con → xếp lớp trial → ghi nhận buổi trial → (kế toán confirm payment) → convert v2 → HV vào lớp.
- **Lớp & buổi học**: `/admin/classes` mở 1 lớp → xem buổi → "Hoàn tất buổi" (nếu flag `SESSION_LIFECYCLE_V2` ON) → điểm danh.
- **Học bạ / báo cáo**: `/admin/bao-cao/*` các trang load, số liệu không lỗi.
- **Portal phụ huynh**: `/portal` → học phí (`/portal/hoc-phi` chỉ hiện khoản CONFIRMED), media theo buổi, học bạ đã publish.
- **Public site**: `/`, `/khoa-hoc`, `/tin-tuc` load 200, không lỗi console nặng.

## KIỂM TRA BUILD (không cần DB)
Chạy và báo kết quả:
```
pnpm typecheck
pnpm lint
pnpm build
```
(Đơn vị test R7 cần Postgres local riêng — KHÔNG chạy `test:e2e:r7` trên DB Supabase. Nếu tôi muốn e2e, sẽ dựng Postgres scoop local trước.)

---

## ĐỊNH DẠNG BÁO CÁO
Trả về bảng:

| # | Mục | Kỳ vọng | Thực tế | PASS/FAIL | Ghi chú/ảnh |
|---|-----|---------|---------|-----------|-------------|

Cuối báo cáo: **kết luận GO / NO-GO push lên `origin/FixLMS`** + danh sách bug còn lại (nếu có) kèm file:line nghi ngờ. **Tuyệt đối không tự push.**
