# ERD Fix — Bản đồ vùng ảnh hưởng (Blast Radius)

> Chi tiết các vùng code bị ảnh hưởng khi thực hiện **toàn bộ** fix trong [ERD-fix-plan.md](./ERD-fix-plan.md). Lập từ điều tra thực tế codebase (file:line). Dùng để scope công việc + tránh sót.
> Đường dẫn để trong `code span` (route group có dấu ngoặc).

## Tổng quan quy mô

| Nhóm fix | Số file đụng | Đặc điểm |
|---|---|---|
| 💰 Tiền (H5/H6/COL2 — Float/BigInt/Decimal) | **~52** | Lan rộng nhất theo chiều "đọc/hiển thị"; bẫy serialization |
| 🔒 Toàn vẹn/giao dịch (C3/C4/C5/H4/H8/H9) | **~55** | Tập trung ở enrollment/order/payment/session/inventory |
| 🧹 Vệ sinh schema (C2/COL3/COL4/COL5/M5) | **~95** | Rộng nhưng đa số transparent; FE nặng nhất ở enum |
| 🏗️ Cấu trúc (COL1/C6/C1/H10) | **~64** | Nhiều file MỚI (compliance) + viết lại audit viewer |

> Có **chồng lấn** (vd `enrollments/_actions.ts`, `lib/finance/payment.ts`, `lib/db-scope.ts` xuất hiện ở nhiều nhóm). Tổng file **distinct ước tính ~200**. Đây là lý do nên fix theo **đợt** + tận dụng 3 điểm đòn bẩy bên dưới.

---

## ⚠️ Quyết định phải chốt TRƯỚC khi code

| # | Vấn đề | Khuyến nghị |
|---|---|---|
| 1 | `Testimonial.role` (COL4) thực ra là **câu mô tả tự do** (`"Phụ huynh bạn Duy Tùng · Đà Nẵng"`), không phải category | **BỎ khỏi COL4** — enum hóa sẽ mất data |
| 2 | `Course.level`/`CoursePackage.level`/`News.category` **chưa có tập giá trị chuẩn** trong data | Phải **định nghĩa enum + migration remap**, không swap kiểu trần |
| 3 | `LeadChild.gender` đang lưu **chuỗi tiếng Việt** `"Nam"/"Nữ"/"Khác"` | Migration phải **remap value** sang `Gender` enum, không chỉ đổi type |
| 4 | `OrderInstallment.amount` (Int) dùng chung khắp nơi với Order nhưng **không nằm trong list BigInt** | **Thêm vào** FIX-H6 để đồng bộ |
| 5 | RLS (C1): Prisma kết nối bằng **owner/superuser** qua pooler → RLS không tự enforce | Migration cần **role non-owner + `FORCE ROW LEVEL SECURITY`**, hoặc chấp nhận RLS chỉ chặn anon/PostgREST |
| 6 | M5 collation VN: **Prisma không có option `locale` cho orderBy** | Cần **collation cấp cột (`vi-x-icu`)** hoặc raw query — không có đường Prisma-native |

---

## 3 điểm đòn bẩy (sửa 1 chỗ, lợi nhiều fix)

1. **`lib/db-scope.ts` (`scopedDb`)** — chèn filter `deletedAt: null` cho Order/Payment/Receipt/Enrollment **tập trung ở đây** thay vì ~30-60 call-site. Cũng là nơi `aggregate._sum` trả BigInt đi qua (đã có interceptor `:175`). ⚠️ Sai chỗ này = rò/ẩn row toàn hệ thống. Cập nhật kèm `lib/db-scope.test.ts`.
2. **`lib/finance/pricing.ts` + `lib/finance/debt.ts`** — toán tiền thuần (Math.round/max/min, reduce). Mọi luồng order/enrollment/debt đi qua đây. Đổi BigInt phải sửa đầu tiên; TS sẽ tự dò ra phần còn lại.
3. **`lib/utils.ts` `formatVnd(amount: number)`** — đổi signature nhận `bigint|number|Decimal` + convert nội bộ → fix mọi điểm hiển thị tiền 1 lần. (Hiện nhiều page tự inline `.toLocaleString("vi-VN")` → nên gom về 1 helper khi sửa.)

---

# 💰 Nhóm Tiền (H5 Float · H6 BigInt · COL2)

**Schema:** `prisma/schema.prisma` — Float: `:596 MarketingCostPeriod.totalQcCost`, `:2408 InventoryItem.pricePerUnit`, `:2484/:2485 StockMovement.unitPrice/totalCost`. BigInt: `:2868-2871 Order.*`, `:2966-2967 OrderItem.*`, `:4408 Payment.amount`, `:1293-1301 Enrollment.tuition/listPrice/discountAmount/finalPrice`, `:3043 Voucher.discountAmount`, `:527 CommissionLine.amount`, `:4158 SataCoinTransaction.amount` (+ `OrderInstallment.amount` — quyết định #4).

**Validator (`lib/validators/`):** `order.ts:11,42,43` · `voucher.ts:19,44,55` · `inventory.ts:89,143` · `course-discount.ts:21`. → `z.number()` không nhận bigint, đổi `z.coerce.bigint()` hoặc convert-at-edge.

**BE ghi tiền:** ``app/(admin)/admin/orders/_actions.ts:145-146,188,302-316,366`` (toán subtotal/total — **vỡ nếu operand thành bigint**) · ``payments/_actions.ts:160,248`` · ``inventory/movements/_actions.ts:80-93`` (Decimal cần `.mul()`) · ``inventory/items/_actions.ts`` · ``enrollments/_actions.ts:45,125,167,223`` · ``satacoin/_actions.ts`` · `lib/satacoin/service.ts:39-117` · `lib/crm/convert-lead-v2.ts:75-169` · `lib/crm/commission.ts:42-85` (`Math.round` trên bigint không hợp lệ) · `lib/crm/cost-allocation.ts` · `lib/orders/installments.ts`.

**BE đọc/aggregate trả client:** `lib/finance/pricing.ts` · `lib/finance/debt.ts` · `lib/vouchers/compute.ts:184-206` · `lib/crm/funnel-query.ts:18` · `lib/satacoin/service.ts:11-15` · ``dashboard/_components/accountant-dashboard.tsx:18-89`` (+ manager/sales) · ``cong-no/page.tsx`` · ``crm/commission/page.tsx`` · ``orders/[id]/page.tsx`` · ``vouchers/[id]/page.tsx`` · ``(portal)/portal/hoc-phi/page.tsx`` · ``inventory/dashboard/page.tsx``.

**FE hiển thị tiền:** `lib/utils.ts:8 formatVnd` (throw trên bigint/Decimal) · ``orders/_components/order-create-form.tsx`` (useState<number> + toán live — **phải đổi state sang bigint/string**) · ``order-detail-client.tsx`` · ``order-payment-section.tsx`` · ``orders-list-client.tsx`` · ``payments-client.tsx`` · ``vouchers-table.tsx`` · ``satacoin-admin.tsx``.

**API/PDF:** ``app/api/cron/debt-reminder/route.ts`` (JSON.stringify bigint có thể throw) · ``app/api/admin/import/inventory-items/route.ts`` · `lib/crm/commission-export.ts` (CSV). **PDF `lib/pdf/*` không có tiền → không đụng.**

**Test:** `tests/e2e/r6/tuition-installments.spec.ts` (`=== 4_000_000` vỡ với `4_000_000n`) · `r6/commission-config` · `r2/finance-debt` · `r1/cost-allocation` · `r1/commission-statement` · `r7/course-pricing` · unit `pricing.test.ts`/`debt.test.ts`/`commission.test.ts`.

> **Top rủi ro:** `lib/finance/pricing.ts`, `orders/_actions.ts`, `lib/utils.ts`, `order-create-form.tsx`, `lib/crm/commission.ts` + `satacoin/service.ts`.

---

# 🔒 Nhóm Toàn vẹn / Giao dịch (C3·C4·C5·H4·H8·H9)

**Schema:** `Enrollment:1285` (thêm `deletedAt`, `student onDelete` review) · `ClassSession:1368` · `Order:2839` (có updatedAt, thêm `deletedAt`) · `Payment:4402` (cascade→Restrict, thêm `deletedAt`) · `Receipt:4437` (cascade→Restrict, thêm `updatedAt`+`deletedAt`).

**C3 — reads cần `deletedAt: null`** (≈30 site; **gom vào `scopedDb` nếu được**):
- Enrollment: ``enrollments/_actions.ts`` (L86,151,195,202,268,360,445,549,595), ``enrollments/page.tsx``, ``students/_actions.ts``, ``students/[id]/*``, ``classes/[id]/_actions.ts``, `lib/transfer/service.ts`, `lib/students/{reserve-service,renewal}.ts`, `lib/lms/pre-session.ts`, `lib/progress.ts`, `lib/transcript/service.ts`, `lib/finance/debt.ts`, `lib/portal/{learning,notifications,billing}.ts`, portal `bai-thi/bai-tap/khao-sat`, cron `renewal/class-reminder`.
- Order: ``orders/_actions.ts`` (L112,487,547,588,683,758,787), ``payments/_actions.ts``, `lib/orders/{code,installments}.ts`, `lib/finance/debt.ts`, `lib/crm/funnel-query.ts`.
- Payment/Receipt: `lib/finance/payment.ts` (L99,128,180,205,242,303), `lib/finance/receipt.ts:32`, `lib/portal/billing.ts`.

**C3 — delete flows:** ``enrollments/_actions.ts`` `deleteEnrollment:240` (legacy hard-delete → soft) + `deleteEnrollmentAction:257` (giữ guard, đổi sang `deletedAt`). UI `delete-enrollment-button.tsx` đã surface lỗi "has dependents". **Order/Payment KHÔNG có hard-delete** (hủy = status CANCELLED) → C3 chủ yếu schema-only/phòng thủ.

**C4 — TOCTOU:** ``enrollments/_actions.ts`` `enrollStudent:383→402`, `changeEnrollmentStatus:469→498`, `transferEnrollment:588→617` (check ngoài tx) · ``inventory/movements/_actions.ts`` `recordIssue:144`, `recordTransfer:228`, `recordAdjustment` (read ngoài tx). UI: ``movement-actions.tsx``.

**C5 — order code race:** `lib/orders/code.ts:18` + 2 caller ``orders/_actions.ts:283`` & ``leads/actions.ts:621``. Cần `Counter` atomic + `@@unique([code])` + retry. **Thiếu** `lib/orders/code.test.ts` (tạo mới).

**H4 — state machine (mới):** tạo `lib/enrollments/status.ts` + `lib/sessions/status.ts` (mẫu `lib/orders/status.ts`). Sửa ``enrollments/_actions.ts`` (transition guard) + ``sessions/[id]/_actions.ts`` `startSession:221`/`completeSession:233`. UI: ``session-checklist.tsx``, dialogs `change-status-dialog.tsx`/`transfer-dialog.tsx`. **Thiếu** test status-machine (tạo mới).

**H8/H9 — idempotency + optimistic lock:** `lib/finance/payment.ts` `recordPayment:36` (thêm idempotency key — `confirmPayment` đã idempotent qua status-guard) · các mutator `reject/adjust/refund` (read→write thêm `updatedAt`-compare) · Order `changeOrderStatusAction`/`updateOrderNoteAction`. UI ``payments-client.tsx:221,337``.

**Test:** `r6/race-guard.spec.ts` (C4/C5), `r6/class-transfer.spec.ts` (C4/H4), `r6/reserve-request.spec.ts` (H4), `r7/security-gate.spec.ts` (scopedDb + deletedAt), `lib/finance/payment.test.ts`, `lib/db-scope.test.ts`.

> **Top rủi ro:** ``enrollments/_actions.ts`` (C3+C4+H4 — nóng nhất), `lib/finance/payment.ts`, `lib/db-scope.ts`, ``inventory/movements/_actions.ts``, `prisma/schema.prisma`+migration.

---

# 🧹 Nhóm Vệ sinh schema (C2·COL3·COL4·COL5·M5)

**C2 timestamptz** — *transparent về dữ liệu* (Prisma trả `Date` như nhau). Không sửa logic. Cần rà chỗ **hiển thị/nhập ngày** nếu lo lệch tz: ~29 file input `type="date"/datetime-local` (session-form, class-sessions-manage, cham-cong, holiday-form, student-form, voucher-form, exam/assignment-form, portal yeu-cau…). **Không có** helper format ngày tập trung (format inline mỗi component) → verify theo từng surface. Lưu ý: nhiều "giờ" là `String "HH:mm"` (`:1229,3601,4498`) — **không đụng**; `dob` là `@db.Date` — **không đụng**.

**COL4 String→enum** (FE nặng nhất):
- `LeadChild.gender` → `Gender` (**cao rủi ro nhất**): form ``leads/_components/lead-children.tsx:54,139-150,383`` (đang `["Nam","Nữ","Khác"]`), validator `lib/validators/lead.ts:86`, đọc ``leads/actions.ts:1221,1232``, ``leads/[id]/page.tsx:242``, và **boundary convert** `lib/crm/convert-lead-v2.ts`/`convert-lead.ts` (map string→enum khi tạo Student).
- `Course.level`: ``courses/[id]/_actions.ts:33-71``, ``course-basics-form.tsx``, public course pages.
- `CoursePackage.level`: ``course-packages/_actions.ts:31``, ``package-form.tsx``, public `/khoa-hoc/[slug]`.
- `News.category`: ``news/_actions.ts:22``, ``news-form.tsx``, **+ public route slug** ``(public)/tin-tuc/category/[slug]`` (đổi enum ảnh hưởng semantics URL).
- `Testimonial.role`: **đề xuất BỎ** (quyết định #1).

**COL3 thêm FK** — *DB-only*; tùy chọn gom manual-join thành `include`: `lib/makeup/service.ts:14-66`, `lib/lms/{makeup-service,attendance-record}.ts`, `lib/transfer/service.ts`+``chuyen-lop/*``, `lib/portal/notifications.ts`+``notifications/page.tsx``, portal `khao-sat/danh-gia`, `lib/crm/{convert-lead-v2,dedupe}.ts`+``parent-requests/*``. **Trước migration: dọn orphan** (`WHERE xId NOT IN (SELECT id…)`). Test: `r3/attendance-makeup`, `r6/class-transfer`, `r4/portal-ownership`.

**COL5 updatedAt** — *DB-only thuần*: `Attendance:1478`, `LeadTask:2712`, `ClassSessionMedia:3545`, `CommissionRateConfig:554`, `TeacherReview:915`, `SurveyResponse:3991`. Migration cần backfill default cho row cũ.

**M5 collation VN** — `orderBy:{name|fullName}` người/HV/lead: ``students/page.tsx:201``, ``students/_actions.ts:847``, ``crm/page.tsx:66``, ``cham-cong/lich-ca-nhan-vien/page.tsx:83``, ``trials/page.tsx:60,76``, ``nhan-su/[id]/edit:57``, ``nhan-su/new:36``, ``users/[id]/edit:54``, ``users/new:68``. (Mở rộng sang Course/Class/Product… nếu muốn — ~45 site nữa.) **Không có đường Prisma-native** → cần collation cấp cột hoặc raw sort.

> **FE rộng nhất nhóm này = COL4** (đặc biệt `LeadChild.gender` đi xuyên form→validator→display→convert). C2/COL5 transparent; COL3 DB-only; M5 implementation khó nhất nhưng phạm vi hành vi hẹp.

---

# 🏗️ Nhóm Cấu trúc (COL1·C6·C1·H10)

**COL1a — tách `CoursePackage`** (8 Json): BE ``course-packages/_actions.ts:37-275`` (Zod + create/update → nested child create trong `$transaction`), form ``package-form.tsx``/``json-array-editor.tsx``/``faq-editor.tsx``, load ``new/page.tsx``/``[id]/edit/page.tsx`` (`include` child). **Public render duy nhất:** ``(public)/khoa-hoc/[slug]/page.tsx:95-115,323`` (đọc `outcomesJson`,`highlights`). Tạo bảng con `CoursePackageFaq`/`Gallery`/…

**COL1b — tách `Lead` → `LeadAttribution`** (cột `utm*,fbclid,gclid,fbp,fbc,eventId,landingPage,referrer,ipAddress,userAgent` ~ `:942-955`): write `lib/lead/{webhook,ingest}.ts`, ``api/leads/route.ts``, ``api/public/webhook/google-form/route.ts``, `lib/lead-handover/service.ts`, client thu UTM `contact-form.tsx`/`consult-modal.tsx`/`lib/tracking/*`. Admin form/list ``leads/actions.ts``/``lead-form.tsx``/``leads-table.tsx``/``leads-kanban.tsx``, validator `lib/validators/lead.ts`, export ``api/admin/leads/export/route.ts``+``marketing/page.tsx`` (`include: attribution`).

**C6 — retention/erasure/portability** (**nhiều file MỚI nhất**):
- MỚI cron ``api/cron/data-retention/route.ts`` + entry `vercel.json:3-40` (mẫu 9 cron sẵn có).
- Precedent retention: ``audit-log/_actions.ts:540-566 cleanupOldAuditLogs`` (RETENTION_DAYS=365) + ``cleanup-button.tsx``.
- Erasure: sửa ``students/_actions.ts:206-242 deleteStudent`` (thêm hard-erasure + scrub PII) + MỚI `lib/compliance/erasure.ts`; purge OTP PII `lib/otp/{service,provider}.ts`.
- Portability: **MỚI** trang portal ``(portal)/portal/du-lieu/`` (page + action export JSON). Consent: `lib/lms/media-consent.ts`.

**C1 — RLS**: **chỉ 1 migration SQL** `<ts>_enable_rls`, **0 code app**. Xác nhận: không có `@supabase/supabase-js`/`createClient` trong app. Caveat owner-role (quyết định #5). `scopedDb` không đổi.

**H10 — hợp nhất 11 `*AuditLog` → `AuditLog`** (bảng + helper `lib/audit/audit-log.ts` đã có):
- Helper ghi: `lib/audit/log.ts` (`logUserAudit:31`…`logRbacAudit:300`) → thay body bằng `writeAudit` (giữ signature → blast thấp).
- Ghi trực tiếp `.create` (sửa): ``students/_actions.ts:427,558,646``, ``enrollments/_actions.ts:503,640,654``, ``leads/actions.ts:604``, ``nhan-su/actions.ts:396``.
- **Đọc/viewer (viết lại lớn):** ``audit-log/_actions.ts`` (đọc 5 bảng legacy L126-493 + cleanup) + UI ``audit-log/page.tsx``+`_components/{audit-log-client,table,detail-modal,filters,cleanup-button,export-button}.tsx`; inline history ``enrollments/[id]/edit/page.tsx:138``, ``nhan-su/[id]/edit/page.tsx:83``. Test `a0/{scoped-db,rbac}.spec.ts`.

> **Nhiều file MỚI nhất = C6** (cron + trang portal + erasure service + export builder). COL1 tạo model/migration mới nhưng ít file app. H10 chủ yếu sửa file sẵn có.

---

# Bảng "hot files" (đụng bởi ≥2 nhóm — sửa cẩn thận nhất)

| File | Fix đụng vào |
|---|---|
| ``app/(admin)/admin/enrollments/_actions.ts`` | C3, C4, H4, 💰tiền, H10 |
| `lib/finance/payment.ts` | C3, H8, H9, 💰tiền |
| `lib/db-scope.ts` (+ test) | C3 (deletedAt), 💰aggregate, multi-tenancy |
| `lib/finance/debt.ts` | 💰tiền, C3 |
| ``app/(admin)/admin/orders/_actions.ts`` | 💰tiền, C5, H9, C3 |
| `lib/crm/convert-lead-v2.ts` | 💰tiền, COL4(gender), COL3, C6(consent) |
| `prisma/schema.prisma` (+migrations) | TẤT CẢ |
| ``app/(admin)/admin/leads/actions.ts`` | C5, COL1b, COL4, H10 |
| `lib/validators/{order,lead,inventory}.ts` | 💰tiền, COL4 |

---

# Thứ tự thực thi đề xuất (giảm churn)

1. **P0 schema-only / migration-only trước** (ít đụng code): C1 RLS, COL5 updatedAt, COL3 FK (sau dọn orphan), C2 timestamptz. → giảm rủi ro, không vỡ FE.
2. **Đòn bẩy `scopedDb`**: làm C3 (deletedAt filter) tập trung 1 chỗ trước khi đụng 30 read-site.
3. **Tiền (💰)**: sửa `lib/finance/pricing.ts` + `lib/utils.ts formatVnd` đầu tiên → `pnpm typecheck` để TS dò hết điểm vỡ → sửa lần lượt theo lỗi compiler.
4. **Toàn vẹn**: C4 TOCTOU + C5 + H4 (mỗi cái 1 PR + test race).
5. **Cấu trúc lớn cuối**: COL1 (tách bảng), H10 (hợp nhất audit), C6 (compliance — nhiều file mới).
6. **COL4 enum** xen kẽ khi rảnh (mỗi enum 1 PR, riêng `LeadChild.gender` cẩn trọng remap).

> Mỗi bước: migration additive → `prisma generate` → `pnpm typecheck` (để TS chỉ điểm vỡ) → sửa BE → FE → test → drop cũ (2-phase). KHÔNG gộp nhiều fix vào 1 PR.
