# Fix Plan — Luồng Lead → Thanh toán → Ghi danh (multi-agent)

> Bản kế hoạch để giao cho **multi-agent thực thi fix**. Mỗi mục là 1 ticket có: phạm vi, file SỞ HỮU, gốc rễ, các bước, schema, tiêu chí nghiệm thu (AC), test, và lưu ý phối hợp. Tuân thủ `CLAUDE.md` + `.claude/rules/admin-site.md` (server-first, `assertCan` đầu action, shadcn-only ở admin, không Magic UI/Motion/Recharts client trộn lẫn).

Branch hiện tại: `FixPublicSite`. Verify mỗi 3–5 file: `pnpm typecheck && pnpm lint`; chốt feature: `pnpm build` + smoke test localhost (mobile 375px cho UI public — ở đây hầu hết là admin).

---

## 0. Hai phát hiện kiến trúc (đọc trước khi làm bất cứ gì)

### 🔴 PH-1 — Hệ thống thanh toán "split-brain" (gốc rễ của LD2 + C3 + OD2)

Có **2 sổ thanh toán không nối nhau**:

| Sổ | Ghi bởi | Điều khiển |
|---|---|---|
| **A — `Payment`** (`saleStatus='RECORDED'`) | **CHỈ** trang `/admin/payments` (`recordPayment`, `lib/finance/payment.ts:64-78`) | `getLeadPaymentSummary` → "đã nộp" + "đủ điều kiện chốt" + guard convert |
| **B — `OrderInstallment` + `Order.status`/`paidAt`** | "Thanh toán & QR" trang order, tạo đơn, đổi trạng thái | Debt reminder, Order status — **không gì khác** |

- **LD2**: "đánh dấu đã đóng" ghi sổ **B**, lật cả `Order.status→CONFIRMED`, nhưng **KHÔNG tạo `Payment`** → `recordedCount=0` → "chưa đủ điều kiện chốt". *(Giả thuyết "approve lật RECORDED→CONFIRMED" SAI: `saleStatus` không có giá trị CONFIRMED; `confirmPayment` chỉ set `accountantStatus`.)*
- **C3**: `createOrderManualAction` (`orders/_actions.ts:132-422`) tạo Order + OrderItem nhưng **0 dòng `Payment`** → `paid=0`.
- **OD2**: `changeOrderStatusAction` (`orders/_actions.ts:481-590`) không tạo `Payment`, không đụng `lead.status`, chỉ `revalidatePath('/orders'...)` — **không revalidate `/leads/...`**.
- **Bonus null-center**: đơn thủ công có thể `centerId=null` → `Payment.centerId=null` → `scopedDb` loại null (`db-scope.ts:174`) → non-SUPER_ADMIN thấy `recordedCount=0` dù có payment hợp lệ. Guard convert lại dùng `db` trần (`convert-lead-v2.ts:97`) nên card và guard có thể lệch nhau.

### 🔴 PH-2 — Lead status `REGISTERED` KHÔNG THỂ ĐẠT trong production (làm nặng C2)

`convertLeadV2` chặn cứng `if (lead.status !== "REGISTERED")` (`convert-lead-v2.ts:87-89`). Nhưng:
- `updateLeadStatus` hardcode `const hasRecordedPayment = false` (`leads/actions.ts:59`) → `AWAITING_DECISION→REGISTERED` luôn bị `canTransitionLeadStatus` chặn (`lib/leads/status.ts:113-132`).
- `REGISTERED` không có trong `KANBAN_COLUMNS` (`status.ts:63`) → không chọn được trên UI.
- Không action thanh toán nào set `lead.status`.

→ Trong prod **không đường nào** đưa lead về `REGISTERED`, nên convert luôn lỗi `NOT_REGISTERED`. Tính năng convert trước nay chỉ pass test do seed thẳng status (`tests/e2e/r7/convert-v2.spec.ts:116`). Đây là bug riêng phải fix cùng PH-1.

---

## 1. Quyết định đã CHỐT (áp dụng cho toàn plan)

1. **Thanh toán: HỢP NHẤT về `Payment`.** Mọi hành động ghi tiền (đóng installment đợt1/đợt2, xác nhận đơn, nút "Ghi nhận thanh toán" mới trên order/convert) đều tạo `Payment(saleStatus='RECORDED')`. `getLeadPaymentSummary` + guard convert chỉ cần đọc `Payment` (đã đúng) — việc cần làm là **làm cho các luồng B cũng ghi `Payment`**, không phải đổi reader.
2. **Cổng chốt convert (C2): BỎ chặn status, GIỮ chặn tiền.** Convert được từ MỌI status chưa kết thúc (trừ `ENROLLED`/`LOST`/`DUPLICATE`); vẫn cần `recordedCount>0` HOẶC `scholarshipFull`. Giữ atomic-claim chống race nhưng đổi điều kiện từ "status=REGISTERED" sang "status NOT IN (terminal)".
3. **CCCD + địa chỉ phụ huynh: lưu trên `User`.** Thêm `User.cccd/address/ward/city`. Convert ghi vào đây. Đơn thủ công thêm `Order.customerCccd` (snapshot). **KHÔNG lưu CCCD học sinh** (CLAUDE.md).
4. **Tỉnh/Phường: dùng npm package** dữ liệu 2 cấp sau cải cách 1/7/2025 (≈34 tỉnh/thành → phường/xã, **bỏ cấp quận/huyện**). Xác minh phiên bản package phản ánh cơ cấu mới (nhiều package cũ vẫn 63 tỉnh/3 cấp). Ứng viên đánh giá: dataset từ `provinces.open-api.vn` (API v2 2-cấp) hoặc package mirror tương đương; lazy-load danh sách phường theo tỉnh. Chốt package chính xác là 1 phần của ticket O2.

---

## 2. Migration nền (Wave 0 — chạy TRƯỚC, 1 agent, 1 migration file)

**Ticket M0 — additive migration** (`prisma/schema.prisma` + `pnpm db:migrate --name lead_payment_enroll_fields`). Tất cả nullable/additive (an toàn, 2-phase):

```prisma
// model User (schema:702) — CCCD + địa chỉ phụ huynh
cccd     String?  // CCCD/CMND phụ huynh
address  String?
ward     String?  // phường/xã (2 cấp 2025)
city     String?  // tỉnh/thành

// model Order (schema:3032) — snapshot người mua
customerCccd String?

// model Lead (schema:938) — loại đơn dự kiến (LD1/O1)
enum OrderKind { COURSE PRODUCT }   // Khoá học (gồm combo) | Sản phẩm
orderKind OrderKind?

// Duyệt installment 2 đợt (C4)
enum InstallmentApprovalStatus { PENDING_APPROVAL APPROVED REJECTED }
// thêm vào model Order:
installmentApprovalStatus InstallmentApprovalStatus?   // null = không có kế hoạch 2 đợt
installmentRequestedById   String?
installmentApprovedById    String?
installmentApprovedAt      DateTime? @db.Timestamptz(6)
installmentRejectReason    String?   @db.Text
```

Sau migrate: **restart dev server** (Prisma Client cache). AC: `pnpm prisma generate` OK, `pnpm typecheck` xanh, không đụng cột đã apply. **Mọi wave sau phụ thuộc M0.**

---

## 3. Sơ đồ phụ thuộc & thứ tự thực thi

```
Wave 0:  M0 (migration)
            │
Wave 1:  ─┬─ AGENT-SPINE  (lib payment/status core)         ← keystone, money-sensitive
          ├─ AGENT-QUICK  (L1 rename + O4 data fix)         ← độc lập, chạy song song ngay
          └─ AGENT-PANEL  (LD4/LD5/LD6 trong lead-activity-panel.tsx)
            │ (SPINE xong mới mở khoá nhóm UI phụ thuộc tiền)
Wave 2:  ─┬─ AGENT-ORDER-CREATE (O1/O2/O3/O5)               ← cần M0 + npm tỉnh
          ├─ AGENT-ORDER-DETAIL (OD1 + UI duyệt C4 + xác nhận OD2)
          ├─ AGENT-CONVERT      (C1/C5/C6 + form C4)        ← cần SPINE (signature convertLeadV2)
          └─ AGENT-LEAD-DETAIL  (LD1/LD3 + nút C1 ở page)
```

**Quy tắc tránh xung đột merge — SỞ HỮU FILE (1 file = 1 agent):**

| File | Chủ sở hữu | Lưu ý phối hợp |
|---|---|---|
| `lib/payments/summary.ts`, `lib/crm/convert-lead-v2.ts`, `lib/orders/installments.ts`, `lib/finance/payment.ts`, `lib/leads/status.ts`, `app/(admin)/admin/leads/actions.ts`, `lib/db-scope.ts`, `lib/auth/permissions.ts` | **SPINE** | giữ chữ ký hàm ổn định, công bố cho CONVERT/ORDER-* |
| `orders/_actions.ts` | **SPINE** sửa `changeOrderStatusAction`/`recordOrderInstallmentsAction`/`confirmPayment`; **ORDER-CREATE** sửa `createOrderManualAction`/`loadCreateOrderFormData` | khác hàm → merge OK, nhưng SPINE land trước |
| `order-create-form.tsx`, `lib/validators/order.ts`, `orders/new/page.tsx` | **ORDER-CREATE** | O1/O2/O3/O5 cùng 1 agent (đều đụng form) |
| `order-payment-section.tsx`, `order-detail-client.tsx` | **ORDER-DETAIL** | reminderDays cắm vào action của SPINE |
| `convert-form.tsx`, `convert/page.tsx`, `convert/actions.ts` | **CONVERT** | C1/C5/C6 + phần form C4; gọi `convertLeadV2` của SPINE |
| `lead/[id]/page.tsx`, `lead/[id]/_components/trial-enroll-widget.tsx`, `trial-classes/_actions.ts` | **LEAD-DETAIL** | LD6 gỡ prop `tasks` ở page.tsx do agent này làm; nội dung panel do AGENT-PANEL |
| `lead-activity-panel.tsx` | **PANEL** | LD4/LD5/LD6 (phần UI panel) |
| `leads-table.tsx` | **QUICK** | L1 |
| `leads-kanban.tsx` | **QUICK** (L1) + **SPINE** (cột REGISTERED nếu chọn hiện) | đồng bộ: QUICK đổi text, SPINE thêm cột/transition |

---

## 4. TICKET CHI TIẾT

### ▌AGENT-SPINE — Trục thanh toán + status (keystone)

> Làm cẩn thận, money-sensitive. Tham chiếu memory `bug005-convert-guard-wrong` (đừng deadlock convert). Cập nhật test `tests/e2e/r7/convert-v2.spec.ts`, `tests/e2e/fl/convert-installment.spec.ts`, `lib/crm/sla.test.ts`.

**S1 — Hợp nhất sổ thanh toán (giải LD2, C3, OD2).**
- Trong `lib/orders/installments.ts`: `recordInstallmentPlan` (đợt1 PAID) và `markInstallmentPaid` (đợt2 PAID) → tạo `Payment(saleStatus='RECORDED', amount=<số đợt>, orderId, leadId từ order, centerId)` idempotent (chống tạo trùng khi gọi lại — key theo `orderId+soDot`).
- `changeOrderStatusAction` khi `PENDING_PAYMENT→CONFIRMED` (đơn thu offline) → tạo `Payment(RECORDED)` cho phần đã thu (nếu chưa có), set `paidAt`.
- Thêm hàm dùng chung `ensureOrderPaymentRecorded(tx, order, amount, actor)` để 3 call-site trên dùng chung (no-overengineering: chỉ tạo khi lặp ≥3 — ở đây đúng 3).
- AC: tạo đơn + đánh dấu đã đóng → quay lại convert/lead thấy `paid>0` và "Đủ điều kiện chốt". `recordedCount` không bao giờ giảm khi accountant `confirmPayment`.

**S2 — Sửa scope null-center.** Trong `getLeadPaymentSummary` (hoặc `db-scope`) xử lý `Payment.centerId=null`: backfill `centerId` từ `order.centerId`/lead, hoặc cho phép null thuộc center sở hữu. Dùng **cùng 1 db** (scoped) cho cả card và guard convert (`convert-lead-v2.ts:97` đang dùng `db` trần → đồng bộ).

**S3 — Mở khoá REGISTERED (PH-2).** Thay `hasRecordedPayment=false` (`leads/actions.ts:59`) bằng giá trị thật từ `getLeadPaymentSummary(...).recordedCount>0`. Quyết định: **auto-advance** `AWAITING_DECISION→REGISTERED` khi ghi nhận payment (khuyến nghị, ít thao tác tay) — implement trong call-site ghi Payment. (Không bắt buộc thêm REGISTERED vào kanban nếu auto-advance.)

**S4 — Nới guard convert (C2).** `convert-lead-v2.ts`:
- Bỏ block `NOT_REGISTERED` (`:87-89`).
- Atomic-claim (`:124-128`): đổi `where status:"REGISTERED"` → `where: { id, deletedAt:null, status:{ notIn:["ENROLLED","LOST","DUPLICATE"] } }` (giữ chống race — test race `convert-v2.spec.ts:226` vẫn phải xanh: chỉ 1 lần thắng).
- **GIỮ** `PAYMENT_REQUIRED` (`:91-103`) làm cổng nghiệp vụ thật.
- AC: lead ở CONSULTING/AWAITING_DECISION có ≥1 payment RECORDED → convert thành công; double-submit → đúng 1 ENROLLED.

**S5 — Logic duyệt installment (C4, phần lib).** Thêm action `installments:approve` trong `lib/auth/permissions.ts` map `CENTER_MANAGER`+`SUPER_ADMIN`. Hàm `requestInstallmentApproval` (set `Order.installmentApprovalStatus=PENDING_APPROVAL`, `installmentRequestedById`) + `approveInstallmentPlan`/`rejectInstallmentPlan` (yêu cầu `assertCan('installments:approve')` + reason + audit). Khi tạo plan 2 đợt từ convert/order → mặc định `PENDING_APPROVAL`; đợt2 chỉ "kích hoạt"/ghi Payment sau khi `APPROVED`. AC: SALES_CSM chọn 2 đợt → plan ở PENDING_APPROVAL, chưa tính là đủ tiền cho đến khi CENTER_MANAGER duyệt; non-manager không duyệt được; có audit + reason.

**S6 — Revalidation.** `changeOrderStatusAction`, `recordOrderInstallmentsAction`, `markOrderInstallmentPaidAction`, `confirmPaymentAction`, `recordPaymentAction` thêm `revalidatePath('/admin/leads/${leadId}')` + `'/admin/leads/${leadId}/convert'` (lấy leadId từ order). (Hiện 2 trang convert/lead là `force-dynamic` nên chủ yếu phòng khi chuyển ISR — vẫn thêm cho đúng.)

**Test SPINE:** cập nhật `convert-v2.spec.ts` (không seed thẳng REGISTERED nữa — đi qua ghi Payment → auto REGISTERED → convert), `convert-installment.spec.ts` (đợt2 cần duyệt), thêm unit cho `ensureOrderPaymentRecorded` idempotent.

---

### ▌AGENT-ORDER-CREATE — Trang tạo đơn thủ công (O1/O2/O3/O5)

Sở hữu: `order-create-form.tsx`, `lib/validators/order.ts`, `orders/new/page.tsx`, hàm `createOrderManualAction`+`loadCreateOrderFormData` trong `orders/_actions.ts`.

**O1 — Loại đơn 2 lựa chọn.** `ORDER_TYPE_ITEMS` (`order-create-form.tsx:127`) + `<SelectItem>` (`:305-307`) rút còn 2: `COURSE → "Khoá học"`, `PRODUCT → "Sản phẩm"`. Gỡ nhánh `PACKAGE` ở mọi chỗ (`:118,140-141,153-158,230-232,441-445,463-468`, guard submit `:224`). **Combo 1&2** = course `combo-luyen-thi` (đã teachable, `seed-course-categories.ts:9`) → tự nằm trong danh sách "Khoá học"; giữ `PACKAGE`/`COMBO` làm giá trị enum nội bộ (ẩn khỏi selector). AC: selector chỉ 2 mục; chọn "Khoá học" thấy cả Sata1-8 + combo.

**O3 — Dropdown item theo loại đơn.** `itemItems` (`:137-143`) + render (`:447-487`) rút 2 nhánh: COURSE→`courses`, PRODUCT→`products`. "Sản phẩm" lọc `category IN [KIT_ROBOT, SENSOR]` (thêm filter ở query `_actions.ts:665` hoặc client). AC: đổi loại đơn → dropdown đổi nguồn tương ứng.

**O2 — Section khách hàng (ticket lớn nhất).**
- Thêm input **CCCD** → `customerCccd`; thêm vào `orderCreateManualSchema` (regex `^\d{9}$|^\d{12}$`, optional), persist `_actions.ts:295-301`.
- **Email bắt buộc**: `required` trên input (`:380`), Zod đổi `customerEmail` thành `z.string().email()` (bỏ optional, `order.ts:25`). Lưu ý `defaultCustomer.email` từ lead có thể rỗng (`new/page.tsx:67`) — walk-in phải nhập.
- **Tỉnh/thành searchable** + **Phường/xã phụ thuộc, xếp SAU tỉnh** (đảo thứ tự `:413-430`): cài npm package tỉnh 2 cấp 2025 (mục §1.4); tạo **component combobox search** mới trong `components/ui/` (Base UI Autocomplete/Combobox — KHÔNG thêm Magic UI/Motion). Map tỉnh→`customerCity`, phường→`customerWard` (không cần cột mới). Reset ward khi đổi tỉnh; lazy-load ward theo tỉnh.
- AC: gõ tìm tỉnh ra đúng; chọn tỉnh mới hiện phường tương ứng; email trống → submit chặn; CCCD lưu vào `Order.customerCccd`.

**O4 — Giá khoá = 0 (vd Sata5).** *(Có thể giao AGENT-QUICK — xem dưới.)* Cơ chế: đơn giá COURSE lấy thẳng `Course.price` (`order-create-form.tsx:147-152` → `c.price ?? 0`). Seed value đúng (Sata5 `earlyBirdPrice 9.360.000`, `courses-pricing.ts:77`) nhưng row teachable+published trong DB có `price=NULL` (do publish ngoài seed / admin xoá giá). **Fix dữ liệu**: query `Course WHERE isTeachable AND isPublished AND (price IS NULL OR price=0)`; nạp `price` từ `courses-pricing.ts` **không** lật `isPublished` (đừng chạy lại `seed-courses.ts` vì nó set `isPublished:false`). Hardening: hiện cảnh báo khi `c.price` null (giữ guard submit `unitPrice<=0` `:216`). AC: chọn Sata5 → đơn giá ra đúng giá niêm yết.

**O5 — Bỏ phí vận chuyển.** Gỡ input (`order-create-form.tsx:589-597`) + state `shippingFee` (`:101`) + field submit (`:263`). Giữ Zod `shippingFee.default(0)` (`order.ts:43`) và cột DB → total server `subtotal-discount+0` không vỡ; client total (`:169`) thành `max(0, subtotal-discount)`. (Drop cột để 2-phase sau.) AC: form không còn ô phí vận chuyển; tổng tính đúng.

---

### ▌AGENT-ORDER-DETAIL — Trang chi tiết order (OD1 + UI duyệt C4 + xác nhận OD2)

Sở hữu: `order-payment-section.tsx`, `order-detail-client.tsx`.

**OD1 — Nhắc công nợ + xác nhận kế hoạch 2 đợt.** Hạ tầng đã có: `OrderInstallment.reminderDays`+`lastReminderAt` (`schema:3122`), cron `app/api/cron/debt-reminder` + default `finance.debtReminderDaysBefore=14`. **Thiếu = UI không thu `reminderDays`**. Thêm ô "Nhắc trước N ngày" (hoặc ngày nhắc tuyệt đối → quy ra days-before-due) vào `order-payment-section.tsx`, luồn qua `recordOrderInstallmentsAction` → `recordInstallmentPlan({ reminderDays })` (action thuộc SPINE — phối hợp chữ ký). AC: đặt reminderDays → cron dùng đúng (không fallback 14).

**OD1b — Duyệt 2 đợt (UI).** Hiển thị trạng thái `installmentApprovalStatus`; nút "Yêu cầu duyệt" (sale) + "Duyệt/Từ chối" (CENTER_MANAGER, gọi action SPINE S5, nhập reason). AC: sale tạo plan → trạng thái PENDING_APPROVAL; manager duyệt → đợt2 ghi Payment khi đến hạn/đóng.

**OD2 — Xác nhận đã hết.** Sau khi SPINE S1+S6 land: đổi trạng thái/đóng đợt → back về convert thấy "đã thanh toán". Agent này chỉ cần đảm bảo UI gọi đúng action đã sửa + không optimistic giả. AC test: thao tác trên order-detail phản ánh ngay ở trang convert/lead.

---

### ▌AGENT-CONVERT — Trang chuyển đổi (C1/C5/C6 + form C4)

Sở hữu: `convert-form.tsx`, `convert/page.tsx`, `convert/actions.ts`. Gọi `convertLeadV2` (SPINE).

**C1 — Đổi tên "Chuyển đổi".** `convert/page.tsx:14` metadata `'Chuyển đổi (v2)'`→`'Chuyển đổi | Admin'`; `:145` H1 `'Chuyển đổi → Ghi danh (v2)'`→`'Chuyển đổi'`. (Nút ở `lead/[id]/page.tsx:298` do AGENT-LEAD-DETAIL đổi.) Gỡ banner status `:153-158` (đi cùng C2). AC: tiêu đề + tab trình duyệt đọc "Chuyển đổi".

**C5 — Phụ huynh: thêm CCCD + địa chỉ.** Section "Phụ huynh" (`convert-form.tsx:184-205`) hiện chỉ Tên/Email/SĐT → thêm input **CCCD** + **địa chỉ** (address/ward/city; có thể tái dùng combobox tỉnh từ O2). Mở rộng `convertSchema` (`convert/actions.ts`), luồn xuống `convertLeadV2` → ghi `tx.user` (`User.cccd/address/ward/city` — cần M0 + SPINE mở field trong `convertLeadV2`). AC: CCCD+địa chỉ nhập ở convert được lưu vào tài khoản phụ huynh, thấy ở hồ sơ.

**C6 — Học viên: bỏ "Ưu đãi".** Gỡ block select ưu đãi (`convert-form.tsx:262-277`), field `discountId` khỏi `StudentRow`/`addStudent`/`patch`/payload (`:135`). Dọn plumbing không dùng: `discountsByCourse` + fetch `page.tsx:88-108`, `discountMap` trong `actions.ts:95-124` (server `convertLeadV2` để dormant, enrollment lưu `finalPrice=listPrice`, `discountAmount=0`). AC: form không còn ô ưu đãi; enrollment tạo ra có discount=0.

**C4 (phần form) — 2 đợt.** UI 2 đợt đã có (`convert-form.tsx:310-374`, gated `hasOrder`). Bổ sung: khi chọn `plan='TWO'` → gọi `requestInstallmentApproval` (SPINE S5) thay vì kích hoạt thẳng; hiện nhãn "Chờ quản lý cơ sở duyệt". AC: chọn 2 đợt ở convert → tạo plan PENDING_APPROVAL, convert vẫn hoàn tất ghi danh nhưng đợt2 chờ duyệt.

---

### ▌AGENT-LEAD-DETAIL — Trang chi tiết lead (LD1/LD3 + nút C1)

Sở hữu: `lead/[id]/page.tsx`, `lead/[id]/_components/trial-enroll-widget.tsx`, `trial-classes/_actions.ts`. (Gỡ prop `tasks` cho LD6 cũng do agent này — xem PANEL.)

**LD1 — Loại đơn (2 loại) trên lead detail.** Thêm selector "Loại đơn" (Khoá học / Sản phẩm) sau info grid (`page.tsx:~231`), ghi `Lead.orderKind` (enum `OrderKind`, M0) qua action mới `updateLeadOrderKind(leadId, kind)` trong `leads/actions.ts` (assertCan). Dùng để gợi ý nguồn item khi tạo đơn. AC: chọn loại đơn lưu được, hiển thị lại đúng. *(Mở: chỉ sales sửa? cảnh báo nếu đã có đơn khác loại?)*

**LD3 — Buổi học thử: hiện lớp + chọn ngày/giờ.** Model đã đủ (không migration): `TrialEnrollment(LeadChild→TrialClassV2)`, ngày/giờ ở `TrialClassSession.date/startTime/endTime` (`schema:4974-4991`).
- (a) Hiển thị lớp hiện tại: fetch `TrialEnrollment` theo từng `leadChild` ở `page.tsx`, truyền `currentTrialEnrollment{classId,className}` vào widget → banner "Con X đang học thử lớp Y" / "Chưa xếp lớp".
- (b) Chọn ngày/giờ: fetch `TrialClassV2.sessions` (thêm include ở `page.tsx`), truyền `sessions[]` vào widget; sau khi chọn lớp → dropdown buổi (`date + startTime`); mở rộng `enrollLeadChildAction` thêm `sessionId?` (`trial-classes/_actions.ts`).
- AC: thấy đúng lớp trải nghiệm mỗi con + chọn được buổi ngày/giờ. *(Mở: chọn buổi bắt buộc hay tuỳ chọn? cho đổi lớp khi đã có enrollment?)*

**C1 (nút lead-detail):** đổi text `lead/[id]/page.tsx:298` `'Chuyển đổi → Ghi danh (theo từng con)'` → `'Chuyển đổi'`.

---

### ▌AGENT-PANEL — `lead-activity-panel.tsx` (LD4/LD5/LD6)

**LD4 — Ghi nhanh hoạt động theo từng loại.** Hiện form chung (`:136-172`) 4 nút CALL/MESSAGE/NOTE/EMAIL + 1 textarea. Redesign: chọn loại → form khác nhau (CALL: thời lượng + người gọi + ghi chú; MESSAGE: nền tảng SMS/Zalo/Messenger + nội dung; EMAIL: người nhận + tiêu đề + nội dung; NOTE: textarea). Lưu metadata vào `LeadActivity.metadata` (JSON đã có). Ẩn STATUS_CHANGE/HANDOVER (auto-gen). AC: mỗi loại có trường riêng; lưu đúng metadata. *(Mở: validate theo loại? lưu metadata JSON hay parse từ content?)*

**LD5 — Lịch sử thành nút bấm mở.** Bọc timeline (`:174-210`) trong state `[historyOpen,setHistoryOpen]` (mặc định đóng); thay h3 bằng nút "Lịch sử tương tác của Lead (n)" + chevron; chỉ render `<ol>` khi mở. AC: mặc định ẩn, bấm mới hiện.

**LD6 — Bỏ tab "Việc cần làm".** Xoá cột phải task (`:213-297`); grid `lg:grid-cols-3`→`lg:grid-cols-2` (hoặc 1 cột); bỏ prop `tasks` khỏi chữ ký panel (`:62-66`). **Phối hợp LEAD-DETAIL**: gỡ truyền `tasks` ở `page.tsx:358-366` (giữ/bỏ fetch `lead.tasks` `:49` tuỳ chỗ khác dùng — kiểm tra trước). **KHÔNG xoá dữ liệu LeadTask** (chỉ ẩn UI). AC: lead detail không còn khu "việc cần làm"; không lỗi prop. *(Mở: có cần export LeadTask trước? trang/report nào còn dùng LeadTask?)*

---

### ▌AGENT-QUICK — Đổi tên nhanh + data O4

**L1 — Đổi tên nút bảng/kanban.** `leads-table.tsx:482` và `leads-kanban.tsx:215` text `"Chuyển Đã đăng ký"` → `"Xem chi tiết lead"` (nút đã trỏ `/leads/{id}` sẵn — chỉ đổi nhãn). AC: bảng + kanban hiện "Xem chi tiết lead". (Đồng bộ với SPINE nếu SPINE thêm cột REGISTERED vào kanban.)

**O4 (data fix)** — như mô tả ở ORDER-CREATE O4 (có thể để agent này chạy script populate `Course.price`). Cần truy DB dev/live để liệt kê course price null/0. AC: không course teachable+published nào còn `price` null/0.

---

## 5. Ma trận test (T-groups) tối thiểu

| Khu vực | Test |
|---|---|
| SPINE S1/S3/S4 | `tests/e2e/r7/convert-v2.spec.ts` (đi qua ghi Payment → auto REGISTERED → convert từ AWAITING_DECISION); race double-submit = 1 ENROLLED |
| SPINE S5 + C4 | `tests/e2e/fl/convert-installment.spec.ts` (đợt2 PENDING_APPROVAL; non-manager không duyệt; manager duyệt → đợt2 ghi Payment) |
| C3/LD2/OD2 | E2E: tạo đơn → đánh dấu đã đóng → quay lại convert thấy `paid>0` + "Đủ điều kiện chốt" |
| O2 | unit: Zod email bắt buộc, CCCD regex; E2E: tỉnh search + ward phụ thuộc |
| O4 | script kiểm `Course.price` không null sau fix |
| OD1 | `installment-reminder.spec.ts`: reminderDays UI → cron dùng đúng |
| LD3 | E2E: hiện lớp trải nghiệm + chọn buổi |

`pnpm typecheck && pnpm lint && pnpm build` xanh trước khi báo PASS từng agent (skill `goal-verification`).

---

## 6. Rủi ro & lưu ý

- **Money-sensitive (SPINE)**: tránh tạo `Payment` trùng — idempotent theo `orderId+soDot`/`orderId`. Nhớ memory `bug005-convert-guard-wrong`: đừng đưa lại guard RECORDED→CONFIRMED gây deadlock.
- **Deadlock confirmPayment**: `confirmPayment` cần `enrollmentId` (`payment.ts:138`) chỉ có sau convert → "duyệt trước khi chốt" vốn không chạy được. Với hợp nhất sổ, sale ghi Payment(RECORDED) là đủ để chốt; accountant confirm sau khi đã có enrollment. (Xác nhận lại workflow với stakeholder nếu cần.)
- **scopedDb writes**: theo memory `scopeddb-writes-not-scoped`, mọi update/create payment phải có guard center thủ công.
- **Thêm npm package tỉnh**: đúng quy ước phải hỏi (đã được duyệt); xác minh dataset là 2 cấp 2025, ghi vào `.claude/rules/ui-libraries.md` nếu thêm component combobox dùng chung.
- **2-phase**: tất cả cột mới nullable/additive; chỉ drop (shippingFee, LeadTask) sau khi ổn định.

---

## 7. Bản đồ bug → ticket (đối chiếu yêu cầu gốc)

| Yêu cầu gốc | Ticket |
|---|---|
| 1. Đổi tên nút bảng lead | L1 (QUICK) |
| 2. Lead detail: loại đơn 2 loại | LD1 (LEAD-DETAIL) + M0 `OrderKind` |
| 2. Thanh toán/tạo đơn "chưa đủ điều kiện chốt" | LD2 ← SPINE S1/S2/S3 |
| 2. Buổi học thử (lớp + ngày/giờ) | LD3 (LEAD-DETAIL) |
| 2. Ghi nhanh hoạt động theo loại | LD4 (PANEL) |
| 2. Lịch sử → nút bấm | LD5 (PANEL) |
| 2. Bỏ tab việc cần làm | LD6 (PANEL + LEAD-DETAIL) |
| 3. Đổi tên "Chuyển đổi" | C1 (CONVERT + LEAD-DETAIL) |
| 3. Logic gate status sai | C2 ← SPINE S4 |
| 3. Tạo đơn xong vẫn 0đ | C3 ← SPINE S1 |
| 3. Nộp 2 đợt + duyệt QLCS | C4 ← SPINE S5 + CONVERT + ORDER-DETAIL |
| 3. Phụ huynh thêm CCCD + địa chỉ | C5 (CONVERT) + M0 `User.*` |
| 3. Học viên bỏ ưu đãi | C6 (CONVERT) |
| 4. Tạo đơn: loại đơn 2 loại | O1 (ORDER-CREATE) |
| 4. Khách hàng: CCCD/email/tỉnh-search/phường | O2 (ORDER-CREATE) + M0 `Order.customerCccd` + npm tỉnh |
| 4. Sản phẩm: dropdown theo loại | O3 (ORDER-CREATE) |
| 4. Giá khoá = 0 (Sata5) | O4 (QUICK/ORDER-CREATE, data fix) |
| 4. Bỏ phí vận chuyển | O5 (ORDER-CREATE) |
| 5. Order detail: 2 đợt + nhắc công nợ | OD1 (ORDER-DETAIL) |
| 5. Đổi trạng thái không lưu về ghi danh | OD2 ← SPINE S1/S6 |
```
