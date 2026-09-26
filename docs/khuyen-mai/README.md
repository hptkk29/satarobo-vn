# Chính sách khuyến mãi (26/09/2026)

> Yêu cầu của chủ dự án: *"hiện tại hệ thống không dùng voucher… dùng voucher có sẵn nhưng cần
> redesign lại, thiết kế lại voucher sao cho sau này nếu có chính sách mới thì BLĐ up lên là nhận
> luôn và gửi về cho Sale tra cứu, sau này sẽ làm phần add voucher này vào quy trình thanh toán"*.
> Chốt 26/09: bố cục **bảng danh sách chuẩn** · người ban hành = **Quản trị tối cao + Giám đốc**
> (`GIAM_DOC`) · tệp văn bản gốc **không bắt buộc**.

## 1. Mô hình

```
PromotionPolicy  (VĂN BẢN BLĐ ban hành — "SR.QD.233")
  ├─ ưu đãi, điều kiện, hiệu lực từ–đến (ngày VN, gồm cả hai đầu)
  ├─ phạm vi: orgUnitIds (rỗng = toàn hệ thống) · courseIds (rỗng = mọi khoá)
  ├─ tệp gốc trên R2 (tuỳ chọn) · thu hồi sớm (thời điểm + lý do)
  └─ Voucher[]  (MÃ khách dùng — bảng có từ 24/05, nay gắn policyId)
```

- **"Còn hiệu lực không" hỏi MỘT hàm:** `lib/khuyen-mai/hieu-luc.ts` (`trangThaiTai`). Màn quản trị, khối
  Khuyến mãi ở Tra cứu, và công cụ agent `van_ban.lay_khuyen_mai_hieu_luc` cùng gọi nó. Tính lúc đọc —
  không cron nào đổi trạng thái.
- **Thu hồi ngày D (giờ VN) ⇒ ngày hiệu lực cuối là D − 1.** Sale mở màn sau khi BLĐ thu hồi phải thấy
  "đã thu hồi" ngay, không phải "còn tới hết ngày". Thu hồi trước ngày bắt đầu ⇒ chưa từng hiệu lực.
- **Hiệu lực của mã = hiệu lực văn bản**, đồng bộ trong cùng transaction khi sửa ngày; thu hồi tắt mọi mã.
- Bảng **không** mang `centerId`/`orgUnitId` và **không** ở `SCOPED_MODELS`: phạm vi là NỘI DUNG văn bản,
  không phải dữ liệu thuộc một cơ sở — Sale cơ sở nào cũng phải thấy chính sách toàn hệ thống.
- Cơ sở/khoá được chọn mà sau đó bị gỡ khỏi hệ thống: văn bản **không** hoá thành "toàn hệ thống" (fail
  closed) — đọc cờ `toanHeThong`/`moiKhoa` từ cột gốc, đừng suy từ danh sách đã lọc.
- **Tệp văn bản:** form chỉ gửi KHOÁ R2 (`uploads/documents|images/…`, cấm `..`); URL hiển thị do server dựng bằng
  `getPublicUrl(key)`. Bản đầu nhận URL client — zod coi `javascript:` là URL hợp lệ ⇒ XSS lưu trữ (rà 26/09).
- **Sửa không được lùi ngày kết thúc về trước hôm nay** — dừng sớm là việc của Thu hồi (lý do + báo Sale + tắt mã).
- Ghi có điều kiện chống đua: sửa và bật lại mã chỉ ghi khi văn bản CHƯA thu hồi (`updateMany where revokedAt: null`).
- **Không có số "đã dùng":** `Voucher.usedCount` chưa có đường ghi nào cho tới khi nối thanh toán — màn chỉ in số
  suất theo văn bản, người vận hành tắt mã khi hết suất. Mã của văn bản đã hết hạn/thu hồi hiện "Hết hiệu lực".

## 2. Ai làm gì

| Việc | Quyền | Vai (v2) |
|---|---|---|
| Xem danh sách, văn bản, mã; khối Khuyến mãi ở `/tra-cuu` | `promotions:view` | Sale HO/cơ sở, QLCS, kế toán HO/cơ sở, Marketing HO, Giám đốc |
| Ban hành · sửa · thu hồi · thêm/bật/tắt mã | `promotions:manage` | Quản trị tối cao, Giám đốc |

Ban hành **có hiệu lực theo ngày ngay**, không qua người duyệt thứ hai (văn bản đã ký giấy trước khi lên
hệ thống). Ban hành xong hệ thống **báo ngay** mọi người giữ `promotions:view` có vai neo ở đơn vị bao trùm
cơ sở được áp (neo Hội sở/khối = bao trùm mọi cơ sở bên dưới). Thu hồi cũng báo, kèm lý do (mức P1).

## 3. Màn hình

- `/khuyen-mai` — ô tìm + chip trạng thái mang số (Đang áp dụng · Sắp · Hết hạn · Đã thu hồi · Tất cả).
- `/khuyen-mai/[id]` — ưu đãi (chữ lớn) → điều kiện → áp dụng tại/khoá → văn bản gốc → bảng mã (chép một chạm).
- `/khuyen-mai/moi`, `/khuyen-mai/[id]/sua` — chỉ `promotions:manage`; sửa KHÔNG gửi lại thông báo.
- `/tra-cuu` — khối "Khuyến mãi": chỉ văn bản đang/sắp áp dụng.

## 4. Nối vào thanh toán (việc SAU — chưa làm)

Hôm nay mã voucher **chưa tự trừ vào đơn**: giảm giá trên đơn vẫn nhập tay kèm giải trình
(`lib/orders/price-guard.ts`), màn nói rõ điều đó. Khi nối:

1. Đường ghi đơn đọc `Voucher` theo mã → kiểm `isActive` + `trangThaiTai(policy, ngày đơn)` — **đừng viết
   lại điều kiện hiệu lực**. Kiểm thêm phạm vi cơ sở/khoá của văn bản, `minOrderValue`, `quantity`/`usedCount`.
2. Ghi `VoucherRedemption` (đã có, `orderId` duy nhất ⇒ một đơn tối đa một mã) + tăng `usedCount` trong CÙNG
   transaction tạo đơn, có điều kiện chống đua (`updateMany where usedCount < quantity`).
3. Công cụ agent `kinh_doanh.lay_dang_ky` đã sẵn đọc `VoucherRedemption → Voucher → PromotionPolicy.documentCode`
   cho trường `van_ban_khuyen_mai` — không phải sửa gì.
4. Chạy bộ R7 (luật: chạm tiền phải chạy R7).

## 5. Việc tay sau merge

- Migration `20260926120000_chinh_sach_khuyen_mai` tự chạy khi merge (`migrate-test.yml` / `deploy.yml`).
- **Seed vai** — RBAC v2 đọc quyền từ DB: lên `main` bấm `seed-prod-roles.yml`, không thì không ai thấy mục
  Khuyến mãi trên prod (trừ Quản trị tối cao).
- Gán vai `GIAM_DOC` cho người trong BLĐ sẽ ban hành (nếu chưa có — vai tạo từ Đợt 0 cổng agent).

## 6. Kiểm thử

- Thuần: `lib/khuyen-mai/hieu-luc.test.ts` · `lib/validators/khuyen-mai.test.ts` ·
  `app/(admin)/admin/khuyen-mai/quyen-action.test.ts` (lưới ghim: 5 action gác `promotions:manage`) ·
  `app/api/admin/upload-url/route.test.ts` ·
  `app/(admin)/admin/khuyen-mai/_components/tep-van-ban.test.tsx` (`[KM-TEP]`).
- ⚠️ **Ô `<input type="file">` ẩn bằng `hidden`, KHÔNG `sr-only`** (lỗi trên test 26/09 — "cuộn hai lần"):
  `sr-only` là `position:absolute`, khung admin không có tổ tiên `relative` trong `<main>` nên ô thoát
  vùng cuộn và kéo dài cả trang (đo: +289px ở 1280, +797px ở 375). Đo lỗi này phải đo CHIỀU DỌC của
  document (`scrollingElement.scrollHeight − innerHeight`), smoke tràn ngang không thấy.
- DB: `tests/agents/cong-cu-dot1.spec.ts` nhóm "khuyến mãi" ([D1-SV-*], [D1-KM*]).
