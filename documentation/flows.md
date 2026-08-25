# Luồng hệ thống Sata Robo — hiện trạng mã nguồn

Chỉ ghi các luồng **có chạm quyền, toàn vẹn dữ liệu, tiền, riêng tư, hoặc an toàn vận hành**. Luồng tính năng thuần tuý không nằm ở đây.

Mọi khẳng định kèm `đường/dẫn:dòng`. Ba mức trạng thái dùng xuyên suốt:

| Ký hiệu | Nghĩa |
|---|---|
| ✅ | Đã tồn tại trong code, hoạt động như mô tả |
| ⚠️ | Tồn tại nhưng **có điều kiện / có giới hạn / có lỗ** |
| ❌ | **KHÔNG tồn tại** trong code |

> **Điều kiện môi trường phải nhớ trước khi đọc bất kỳ luồng quyền nào.**
> `RBAC_V2_ENABLED` mặc định **OFF** trong code (`lib/flags.ts:8`), tài liệu dự án khẳng định prod đang **ON**. `lib/auth/shadow-compare.ts:27` trả `flagOn ? v2 : v1`. ⇒ **Local/dev/CI chạy v1 (ma trận tĩnh), prod chạy v2 (đọc DB).** Kết quả thử quyền ở máy local **không suy ra được** hành vi prod. Không có cách xác minh giá trị env prod từ repo.

---

## 1. Đăng nhập + định tuyến theo host

**Actor:** khách ẩn danh → nhân viên (9 vai) / phụ huynh (PARENT).
**Điều kiện trước:** tài khoản có `password` (bcrypt), `isActive = true`, `deletedAt = null`, `accountStatus = "ACTIVE"`.

### 1.1 Các bước

| # | Nơi chạy | Việc | Bằng chứng |
|---|---|---|---|
| 1 | Middleware (edge) | `detectHost(host)` ánh xạ Host header → 1 trong 6 loại: public / admin / portal / sale / teacher / elearning; `*.vercel.app` → `vercel`; còn lại → `unknown` | `proxy.ts:25-34` |
| 2 | Middleware | `isInfraPath()` cho đi thẳng `/api/*`, `/_next/*`, `/monitoring`, robots, sitemap — **kể cả ở nhánh canonical vercel** | `proxy.ts:132`, `lib/auth/route-policy.ts:238-253` |
| 3 | Middleware | `decideRoute({hostKind, pathname, role, roles, sessionValid})` — toàn bộ luật host×role | `proxy.ts:158-164`, `lib/auth/route-policy.ts:345` |
| 4 | Middleware | admin / teacher / elearning được gắn `X-Robots-Tag: noindex` | `proxy.ts:167-169` |
| 5 | Form login | `authorize()`: zod `loginSchema` → **rate-limit 2 khoá** → tra user → kiểm 4 điều kiện → `bcrypt.compare` | `lib/auth.ts:112-168` |
| 6 | Form login | Song song: cập nhật `lastLoginAt`, nạp `UserPermissionGrant`, đọc `tokenVersion` mới | `lib/auth.ts:172-185` |
| 7 | JWT callback | Nhét `id, role, roles[], centerId, grants[], tokenVersion, phone` vào token | `lib/auth.ts:203-213` |
| 8 | Layout RSC | Tầng "phiên còn sống": so `isActive` / `deletedAt` / `tokenVersion` với DB → redirect nếu chết | `app/(admin)/admin/layout.tsx:36-56`, `lib/auth/live-session.ts:29-51` |

### 1.2 Kiểm quyền tại từng bước

| Bước | Cơ chế | Trường hợp TỪ CHỐI mong đợi |
|---|---|---|
| Rate-limit login | `login:ip:<ip>` 10 lần/60s **và** `login:id:<idKey>` 5 lần/60s; khoá được canonical-hoá trước (`canonicalPhone` / lowercase) để `0818…` và `84818…` không thành 2 khoá | Vượt ngưỡng → `authorize` trả `null` (báo "sai mật khẩu", không phân biệt) — `lib/auth.ts:127-135` |
| Trạng thái tài khoản | `accountStatus !== "ACTIVE"` → `null` | `PENDING_ACTIVATION` / `DISABLED` bị chặn tường minh — `lib/auth.ts:165` |
| Định tuyến host | `authed = hasAnyRole && sessionValid`; `isStaff` = có ≥1 vai ≠ PARENT; `isTeacherOnly` = vai nhân sự duy nhất là TEACHER | PARENT vào host admin → đá về portal; GV thuần vào admin (cờ ON) → 307 sang `giaovien` — `lib/auth/route-policy.ts:366-372`, `:670-672` |
| Cờ chặn host | `TEACHER_SITE_ENABLED` mặc định **ON** (`lib/flags.ts:123`); `ELEARNING_ENABLED` mặc định **OFF** (`lib/flags.ts:221`) | Cờ teacher OFF → host `giaovien` bật về admin (`route-policy.ts:555`); cờ elearning OFF → host e-learning bật về khu người dùng (`route-policy.ts:485`) |
| Liveness | `requireLiveSession()` / layout so `tokenVersion` | Admin bump `tokenVersion` → request kế tiếp bị đá `/login?reason=session-invalidated` |

### 1.3 Bảng host → nơi phục vụ

| Host | Loại | Phục vụ |
|---|---|---|
| `satarobo.vn`, `www.` | public | `app/(public)/` + `app/(legacy)/` |
| `admin.satarobo.vn` | admin | `app/(admin)/admin/` (clean URL, rewrite nội bộ thêm `/admin`) |
| `hocvien.satarobo.vn` | portal | `app/(portal)/portal/` |
| `giaovien.satarobo.vn` | teacher | `app/(teacher)/teacher/` — cờ `TEACHER_SITE_ENABLED` |
| `e-learning.satarobo.vn` | elearning | `app/(elearning)/elearning/` — cờ `ELEARNING_ENABLED` |
| `sale.satarobo.vn` | sale | ⚠️ **KHÔNG phải route group** — rewrite sang file tĩnh `public/sale/nhap-lieu.html`, `public/sale/thank-you.html`; **bỏ qua hoàn toàn session/role** — `lib/auth/route-policy.ts:639-649` |

### 1.4 Tác dụng phụ + rủi ro

- ⚠️ **JWT mang role/scope** — vi phạm luật cứng #6 của Nền Hệ thống ("không nhúng role/scope vào JWT"). `token.role`, `roles[]`, `centerId`, `grants[]` đóng băng cho tới khi re-login (`lib/auth.ts:203-213`). Comment `lib/auth.ts:226-228` tự thừa nhận "User cần re-login để token mang roles đầy đủ".
  - Đường v2 (prod) không dùng JWT làm nguồn quyền — `resolveActor` đọc DB mỗi request, cache `React.cache` (`lib/auth/actor.ts:400-449`, `:535`).
  - Đường v1 (local/dev/CI) **đọc thẳng JWT** — `lib/auth/permissions.ts:764`, `:793-794`.
- ⚠️ **Middleware không biết `tokenVersion`/`isActive`** (cần DB): `sessionValid` chỉ = "có JWT hợp lệ". Tầng sống enforce ở layout RSC. Coi middleware là hàng rào quyền là sai — `proxy.ts:146-148`.
- ⚠️ **Cookie SSO đa subdomain** chỉ bật khi `AUTH_COOKIE_DOMAIN` có giá trị **và** xác định được môi trường; tên cookie mang tên môi trường để hai môi trường không xoá phiên của nhau. Sự cố 22/07→04/08 được ghi nguyên văn tại `lib/auth.ts:19-39`. `AUTH_COOKIE_DOMAIN` phải là biến **Non-sensitive** trên Vercel (biến Sensitive không tồn tại lúc build ⇒ middleware và server lệch tên cookie ⇒ đá vô hạn).
- ⚠️ `AUTH_SECRET` là mìn: next-auth ưu tiên nó hơn `NEXTAUTH_SECRET`, nhưng `lib/security/signing-key.ts:12` đọc theo thứ tự **ngược** (`NEXTAUTH_SECRET ?? AUTH_SECRET`). Hai thành phần ưu tiên khác nhau trên cùng cặp biến.
- ✅ `/dang-xuat` được phục vụ ở mọi host, mọi vai, không điều kiện — đặt trước mọi luật để phá vòng lặp redirect (`lib/auth/route-policy.ts:352`).

---

## 2. Luồng doanh thu / thực thu

> **Điểm cốt lõi: có HAI SỔ chạy song song.** Sổ cũ `Payment` là nguồn đọc của **mọi** báo cáo doanh thu; sổ mới `BankTransaction → PaymentAllocation → PaymentRequest` đã ghi dữ liệu thật nhưng **chưa màn nào đọc**.

### 2.1 Sơ đồ hai sổ

```
              ┌── webhook SePay ─┐
Ngân hàng ────┤                  ├── ingestPayosWebhook ── BankTransaction (idempotent)
              └── webhook payOS ─┘                              │
                                                                ├─ PaymentAllocation (waterfall)
                                                                ├─ PaymentRequest.status (tính lại)
                                                                ├─ CreditBalance (tiền dư)
                                                                └─ Payment marker [auto:<provider>:<txn>]
                                                                       accountantStatus = PENDING
Sale ghi tay ── recordPayment ── Payment (RECORDED/PENDING) ───────────┐
                                                                       ▼
                                          Kế toán bấm xác nhận → accountantStatus = CONFIRMED
                                                                       │
                                                    ┌──────────────────┴──────────────────┐
                                                    ▼                                     ▼
                                              Receipt (phiếu thu)            SUM(amount) = "doanh thu thực"
```

### 2.2 Webhook SePay — từng bước

| # | Việc | Bằng chứng |
|---|---|---|
| 1 | POST `/api/public/webhook/sepay` | `app/api/public/webhook/sepay/route.ts:89` |
| 2 | **Xác thực**: header `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>`. Thiếu env → **từ chối tất cả** | `route.ts:90`, `lib/payments/sepay.ts:204-210` |
| 3 | Từ chối → ghi `IntegrationLog` action `AUTH_FAILED` (payload đã cắt ngắn, **không** ghi key), trả 401 kèm `reason` là **mã lỗi** | `route.ts:92-118` |
| 4 | Parse JSON → `extractOrderCode(content)` → tra `Order` theo `code` | `route.ts:126-135` |
| 5 | `computeDueNow` + `decideSepayAction` → CONFIRM / MANUAL | `lib/payments/due-now.ts` |
| 6 | Thử **sổ mới trước**: `ingestPayosWebhook(..., "SEPAY")` | `route.ts:259-273` |
| 7 | Sổ mới trả `MATCHED`/`DUPLICATE` → xong, `ledger: "v2"` | `route.ts:275-278` |
| 8 | Không khớp → **lùi về sổ cũ** trong `db.$transaction`: `order.updateMany` chỉ khi còn `PENDING_PAYMENT` (chốt race) + `OrderStatusHistory` + `ensureOrderPaymentRecorded` | `route.ts:280-330` |
| 9 | Đóng theo đợt → `markInstallmentPaid` **ngoài** transaction (nó tự mở tx riêng) | `route.ts:333-347` |

### 2.3 Idempotency — nằm ở đâu

| Lớp | Khoá | Bằng chứng |
|---|---|---|
| Tiền về (sổ mới) | `BankTransaction @@unique([provider, providerTxnId])`; đã `MATCHED` → trả `DUPLICATE`, không rót lần 2 | `prisma/schema.prisma:5839`, `lib/payments/payos-ingest.ts:767-787` |
| Rót tiền | `pg_advisory_xact_lock(hashtext(orderId))` + đọc lại status **trong khoá** | `lib/payments/payos-ingest.ts:904-908` |
| Ghi sổ cũ tự động | Marker trong `Payment.note`: `[auto:order-confirm]` / `[auto:order-installment:dotN]` / `[auto:<provider>:<txn>]` — `ensureOrderPaymentRecorded` tra marker trước khi tạo | `lib/finance/payment.ts:51-53`, `:81-86` |
| Xác nhận của kế toán | `IdempotencyKey` (uuid client sinh mỗi lần bấm) + `updateMany where accountantStatus="PENDING"` (atomic guard) | `lib/finance/payment.ts:338-344`, `:369-383` |
| Đổi trạng thái đơn | `order.updateMany where status="PENDING_PAYMENT"` — 2 webhook song song chỉ 1 cái thắng | `app/api/public/webhook/sepay/route.ts:283-292` |

### 2.4 Gán cơ sở cho một khoản thu

| Đường ghi | Cách suy `centerId` | Bằng chứng |
|---|---|---|
| `ensureOrderPaymentRecorded` (auto) | `order.centerId` → `lead.centerId` → **`actor.centerId`** | `lib/finance/payment.ts:93-99` |
| `allocateToOrder` (webhook + đối soát tay) | `order.centerId` cho `PaymentAllocation`, `BankTransaction`, `Payment` marker | `lib/payments/payos-ingest.ts:954`, `:995-998` |
| `recordPayment` (Sale ghi tay) | `input.centerId` do call-site truyền (`order.centerId` sau khi `passesScope`) | `app/(admin)/admin/payments/_actions.ts:317-327` |
| `adjustPayment` / `refundPayment` | Kế thừa `original.centerId` | `lib/finance/payment.ts:541-557`, `:622-632` |
| `RefundRequest` | `enrollment.class.centerId` | `lib/finance/refund.ts:104-108` |
| `BankTransaction` chưa khớp | **NULL** cho tới khi rót được | `lib/org/center-bridge.ts:186-190` (`NULL_CHUA_KHOP`) |

Ghi kép `centerId → orgUnitId` làm ở một chỗ: `lib/org/dual-write.ts` cắm trong `lib/db.ts:97-105`, hook `create/createMany/update/upsert`. **KHÔNG hook `updateMany`** (`dual-write.ts:121-124`) và không đi qua SQL thô.

### 2.5 "Ngày nào được coi là tiền về"

| Trường | Ý nghĩa | Có được dùng làm trục kỳ không |
|---|---|---|
| `Payment.paidDate` | **Trục doanh thu duy nhất** — mọi báo cáo gom theo `monthKeyVN(p.paidDate)` | ✅ `app/(admin)/admin/bao-cao/doanh-thu/page.tsx:70`, `lib/reports/revenue-target.ts:58`, `lib/reports/trung-tam.ts:94` |
| `BankTransaction.transferredAt` | **Thời điểm ngân hàng báo tiền về thật** | ❌ Không báo cáo nào đọc — `prisma/schema.prisma:5854` |
| `Payment.confirmedAt` | Lúc kế toán bấm xác nhận | ❌ Không dùng làm trục |
| `Order.paidAt` | Dashboard kế toán dùng cho ô "Doanh thu tháng này" | ⚠️ Định nghĩa **khác** — `accountant-dashboard.tsx:26-31` |

⚠️ **Lệch mốc thời gian đã xác nhận trên code:** `Payment` sinh từ webhook đặt `paidDate: new Date()` (lúc xử lý webhook), **không** lấy `transferredAt` — `lib/payments/payos-ingest.ts:1049`, `lib/finance/payment.ts:106`. Webhook trễ / cron bơm trễ qua nửa đêm đẩy doanh thu sang kỳ sau. Trên `test.satarobo.vn` nặng hơn vì cron được bơm bằng GitHub Action mỗi 5 phút.

### 2.6 Kiểm quyền trên đường tiền

| Hành động | Key | Nơi | Trường hợp TỪ CHỐI |
|---|---|---|---|
| Sale ghi nhận khoản | `payments:record` | `app/(admin)/admin/payments/_actions.ts:41` | Không có → redirect `/dashboard?error=unauthorized` |
| Kế toán xác nhận | `payments:confirm` | `_actions.ts:52` | Sale không có key này ⇒ không tự xác nhận được |
| **Tách nhiệm vụ** | — | `_actions.ts:379-381` | `recordedById === uid` → "Người ghi nhận không được tự xác nhận khoản của mình" |
| Chống IDOR liên cơ sở | `passesScope("Payment"/"Order", row, actor)` | `_actions.ts:325-328`, `:365-368` | Khoản/đơn ngoài `visibleCenterIds` → "Không tìm thấy" |
| Xem PII khoản thu | `payments:view-pii` + **reason ≥10 ký tự** + log riêng | `_actions.ts:238-247` | Thiếu quyền/lý do → dữ liệu vẫn mask |
| Báo cáo doanh thu | `payments:manage` | `app/(admin)/admin/bao-cao/doanh-thu/page.tsx:99-101` | Không có → redirect |

⚠️ Hai gate `requireRecord`/`requireAccountant` gọi `checkPermission` **không truyền target** vì chưa biết `centerId` — comment tại `_actions.ts:38-40` và `:49-51` thừa nhận. Cách ly cơ sở thật sự nằm ở `scopedDb`/`passesScope` phía dưới.

### 2.7 Tác dụng phụ khi xác nhận

`confirmPayment` trong 1 transaction (`lib/finance/payment.ts:367-422`):
1. `updateMany` → `CONFIRMED` + `confirmedById` + `confirmedAt`
2. `issueReceipt` → `Receipt` mã `RCP-{CENTER}-{YY}-{SEQ}`
3. `writeAudit` action `STATUS_CHANGE`
4. `publishEvent("payment.confirmed", …, { tx, dedupeKey: "payment.confirmed:<id>" })`
5. Ghi `IdempotencyKey` **trong cùng tx**

⚠️ `confirmPayment` **từ chối** khoản chưa gắn `enrollmentId`: "Khoản chưa gắn ghi danh, không thể sinh phiếu thu" (`lib/finance/payment.ts:359-361`). Khoản sinh tự động từ webhook không gắn enrollment ⇒ **không xác nhận được bằng đường này**.

### 2.8 ⚠️ Ba định nghĩa "doanh thu" cùng tồn tại

| Định nghĩa | Công thức | Nơi |
|---|---|---|
| A | `SUM(Payment.amount)` where `accountantStatus='CONFIRMED' AND deletedAt IS NULL`, gom theo `paidDate` | `/bao-cao/doanh-thu:66-71`, `manager-dashboard.tsx:95`, `/bao-cao/trung-tam:331` |
| B | `SUM(Order.totalAmount)` where `status IN (CONFIRMED, COMPLETED)`, gom theo `Order.paidAt` | `accountant-dashboard.tsx:28-31` |
| C | `SUM(Order.totalAmount)` where `status IN (CONFIRMED, COMPLETED)`, **không lọc ngày** | `lib/crm/funnel-query.ts:103-105` (ROAS) |

Ba màn ra ba con số khác nhau cho cùng một kỳ.

### 2.9 ⚠️ Lỗ đã xác nhận trên code

| # | Vấn đề | Bằng chứng |
|---|---|---|
| 1 | **Hoàn tiền KHÔNG trừ doanh thu.** `refundPayment` tạo dòng `Payment` âm `accountantStatus='REFUNDED'`, **không đụng dòng gốc**; mọi truy vấn lọc cứng `CONFIRMED` ⇒ dòng âm bị loại, dòng gốc vẫn cộng | `lib/finance/payment.ts:600-632`; `/bao-cao/doanh-thu:66`; `lib/finance/debt.ts:134`; `lib/portal/billing.ts:117-119` |
| 2 | **Điều chỉnh bị bỏ qua im lặng.** `adjustPayment` tạo dòng `ADJUSTED`, giữ nguyên gốc `CONFIRMED` ⇒ con số gốc sai vẫn đứng nguyên | `lib/finance/payment.ts:541-557` |
| 3 | **Hai cơ chế hoàn tiền không nói với nhau.** `approveRefund` chỉ đổi `status` + audit, **không sinh bút toán nào**. Enum `RefundStatus` có `PAID` nhưng **không code nào set** | `lib/finance/refund.ts:160-168`, `prisma/schema.prisma:5947` |
| 4 | **Tiền về qua webhook chưa phải doanh thu.** `Payment` marker mang `accountantStatus='PENDING'` — tiền đã vào tài khoản thật nhưng nằm ngoài báo cáo tới khi kế toán bấm tay | `lib/payments/payos-ingest.ts:1050-1053` |
| 5 | **Sổ mới chưa ai đọc.** Cờ `PAYMENT_LEDGER_V2` mặc định OFF và chính comment ghi "Cờ mới khai — CHƯA nối vào màn nào. Bật lúc này KHÔNG đổi hành vi" | `lib/flags.ts:163-169` |
| 6 | **Sửa kế hoạch trả góp xoá mềm bút toán tiền thật.** `recordInstallmentPlan` xoá mềm **mọi** `Payment` có `note contains "[auto:"` — gồm cả `[auto:sepay:<txn>]` | `lib/orders/installments.ts:98-101` |
| 7 | `Payment.centerId` vẫn nullable và có thể null thật (đơn thu công không gắn cơ sở). `Payment ∈ SCOPED_MODELS` nhưng ∉ `NULL_IS_GLOBAL_MODELS` ⇒ khoản null **biến mất** khỏi báo cáo của actor cấp cơ sở | `lib/db-scope.ts:22`, `lib/payments/summary.ts:28-32` |
| 8 | `OrderInstallment` khoá cứng **tối đa 2 đợt**, không có `centerId`/`orgUnitId`. Hợp đồng rải 3+ kỳ chỉ mô hình hoá được ở sổ mới — mà sổ mới chưa đọc | `prisma/schema.prisma:3788-3808` |
| 9 | ❌ **Không có model chi phí tổng quát.** Chỉ có `MarketingCostPeriod` (không centerId) và hàm ghi `upsertDraftCost`/`confirmCostPeriod` **không có call-site UI nào** — grep chỉ ra test | `prisma/schema.prisma:936-945`, `lib/crm/cost-allocation.ts:40,63,82` |
| 10 | ⚠️ payOS thiếu `PAYOS_CHECKSUM_KEY` → chấp nhận payload **không chữ ký** (chế độ mô phỏng). Khác hẳn SePay (thiếu env = từ chối tất cả) | `lib/payments/payos.ts:165-168` |

---

## 3. Đọc dữ liệu cách ly cơ sở — pipeline `lib/actions/factory.ts`

**Actor:** nhân viên có `Actor` đã resolve.
**Điều kiện trước:** phiên hợp lệ; `resolveActor(userId)` trả `Actor` (đọc DB, cache theo request — `lib/auth/actor.ts:535`).

### 3.1 Sáu bước của `runAction`

| # | Bước | Thất bại trả | Bằng chứng |
|---|---|---|---|
| 1 | Zod `safeParse` — chạy **TRƯỚC** `can()` vì `target` suy từ input đã hợp lệ | `VALIDATION` + `field` | `lib/actions/factory.ts:100-110` |
| 2 | `requireReason` → thiếu `reason` | `VALIDATION` field `"reason"` | `:112-116` |
| 3 | `target = cfg.target?.(input)` → `can(actor, cfg.permission, target)` | `PERMISSION_DENIED` | `:118-121` |
| 4 | `scopedDb(actor)` → `cfg.handler({db, actor, input, reason})`; `ActionError` → `{ok:false}`, lỗi khác → throw ra Sentry | mã của `ActionError` | `:124-135` |
| 5 | `writeAudit` — module/entityType/entityId/old/new/reason/orgUnitId | — | `:137-148` |
| 6 | Gom path revalidate (tĩnh + động) | — | `:150-152` |

Lớp bind Next: `defineAction` = `auth()` → `resolveActor` → `runAction` → `revalidatePath` (`lib/actions/define.ts:13-28`).

### 3.2 ⚠️ Pipeline này gần như không được dùng

| Sự thật | Bằng chứng |
|---|---|
| Consumer duy nhất là **module chat** (5 file) | `lib/chat/{admin,announcements,dm,messages,moderation}.ts` |
| **297 file** dưới `app/` gọi thẳng `checkPermission()`/`assertPermission()` | grep toàn repo |
| Factory dùng `can()` từ `lib/permissions/can` — **KHÔNG đi qua cờ** `RBAC_V2_ENABLED`, fallback thẳng `canV2` | `lib/actions/factory.ts:20`, `lib/permissions/can.ts:146` |

⇒ Module chat luôn chạy v2, kể cả ở local nơi phần còn lại chạy v1.

### 3.3 `scopedDb` — cái nó che và cái nó không che

| Khía cạnh | Hiện trạng |
|---|---|
| ✅ Che | Đúng **7 method đọc top-level**: `findMany`, `findFirst`, `count`, `aggregate`, `groupBy`, `findUnique`, `findFirstOrThrow` — `lib/db-scope.ts:347-375` |
| ✅ Dạng lọc | `{ centerId: { in: visibleCenters } }`; 4 model `NULL_IS_GLOBAL` dùng `{ OR: [{centerId: null}, {centerId: {in: …}}] }` — `lib/db-scope.ts:268-282` |
| ✅ `findUnique` | Không inject where mà lọc **hậu kỳ** bằng `passesScope`, có merge `centerId: true` khi caller select hẹp rồi strip lại — `lib/db-scope.ts:319-337` |
| ❌ KHÔNG che | Mọi `create/createMany/update/updateMany/delete/deleteMany/upsert` |
| ❌ KHÔNG che | `include` lồng nhau — extension chỉ chạy ở query top-level — `lib/db-scope.ts:4-5` |
| ⚠️ Bypass | `bypassesScope(actor) = actor.isSuperAdmin` — **chỉ SUPER_ADMIN**, không phải `isHoLevel` — `lib/db-scope.ts:128-130` |

⚠️ **Fail-open đã từng cháy:** model không có trong `getModelPrefixes` rơi vào fallback `actor.isHoLevel ? "ALL" : visibleCenterIds`. Comment `lib/db-scope.ts:176-180` ghi lại lần Attendance flip sang SCOPED nhưng quên map prefix ⇒ ai có 1 vai HO đều thấy điểm danh toàn hệ thống.

⚠️ `SCOPE_EXEMPT` (`lib/db-scope.ts:77-126`) **không được `injectScope` đọc** — điều kiện thật là `!SCOPED_MODELS.has(model)`. Nó chỉ là danh sách tài liệu hoá. Model mới quên khai vào `SCOPED_MODELS` = **không cách ly, im lặng**.

⚠️ Một `UserPermissionGrant` ALLOW khớp prefix action của model làm `getModelVisibleCenterIds` trả `"ALL"` toàn hệ thống cho model đó — `lib/db-scope.ts:248-254` ("per-user grants are global exceptions"). Cấp một quyền hẹp lại mở tầm nhìn **dữ liệu** toàn bộ.

---

## 4. Luồng GHI trên model thuộc `SCOPED_MODELS`

> **Luật cứng: `scopedDb` KHÔNG che write.** Người viết code phải tự guard. Đây là nguồn của hai lớp lỗi: IDOR ghi chéo cơ sở, và bản ghi tàng hình vì thiếu `centerId`.

### 4.1 Khuôn đúng — đang chạy thật

**Ví dụ A — sửa lead** (`app/(admin)/admin/leads/actions.ts:127-180`, `toggleLeadShareAction` `:65-125`):

| # | Bước | Bằng chứng |
|---|---|---|
| 1 | `auth()` → chưa đăng nhập trả `{ok:false}` | `actions.ts:71-72` |
| 2 | `checkPermission('leads:edit')` → không có trả `{ok:false, error:'Không có quyền'}` | `actions.ts:73` |
| 3 | Đọc bản ghi **trước** (`db.lead.findUnique` chọn `centerId`, `assignedToId`) | `actions.ts:75-78` |
| 4 | `resolveActor` → **`passesScope('Lead', before, actor)`** → ngoài scope trả "Lead không tồn tại" | `actions.ts:79-82` |
| 5 | Guard sở hữu bổ sung: `actorMayMutateLead(userId, assignedToId)` = là chủ **hoặc** có `leads:view-all` | `actions.ts:50-55`, gọi ở `:146, :266, :377, :419` |
| 6 | `db.$transaction`: `update` + `logLeadAudit` + `leadActivity.create` | `actions.ts:88-121` |
| 7 | `revalidatePath` | `actions.ts:122-123` |

**Ví dụ B — ghi tiền** (`app/(admin)/admin/payments/_actions.ts:302-350`): trước khi `recordPayment`, đọc `sdb.order.findUnique` rồi `passesScope("Order", order, actor)` — vừa chống IDOR vừa lấy `centerId` cho `Payment`.

**Ví dụ C — đối soát tay** (`app/(admin)/admin/bien-dong-so-du/_actions.ts:143-146`): comment nguyên văn — "`orderId` tới TỪ CLIENT nên phải tra lại qua `scopedDb` (chống IDOR…). `scopedDb` KHÔNG che write".

### 4.2 Trách nhiệm bắt buộc khi CREATE

| Việc | Hậu quả nếu quên |
|---|---|
| Set `centerId` trên model ∈ `SCOPED_MODELS` | Bản ghi **vô hình** với mọi actor cấp cơ sở (bị `centerId IN (...)` loại) |
| Khai model mới vào `SCOPED_MODELS` (`lib/db-scope.ts:11-50`) | Không cách ly gì cả, không báo lỗi |
| Khai prefix vào `getModelPrefixes` (`lib/db-scope.ts:132-219`) | Fail-open: `isHoLevel → "ALL"` |
| Khai cột `orgUnitId` vào `BACKFILL_SPECS` (`lib/org/center-bridge.ts`) | Test `[US-07-IT-08b]` đỏ |

`orgUnitId` được điền tự động bởi `dual-write` **chỉ khi**: model ∈ `DUAL_WRITE_MODELS`, `data.orgUnitId === undefined`, và `data.centerId` là chuỗi không rỗng (`lib/org/dual-write.ts:89-103`). Không ánh xạ được → để null, **không ném lỗi** (`:100`).

### 4.3 Hàng rào tự động (lint)

| Tầng | Nội dung | Phạm vi |
|---|---|---|
| (a) `no-restricted-syntax` | Cấm `hasRole()`/`isParentOnly()`/`getEffectiveRoles()`, `.roles.includes(...)`, so `.role ===`, so `.centerId ===` | `eslint.config.mjs:66-106` |
| (b) `authz/require-can-in-write-action` | Hàm async export có lời gọi ghi (`.create/.update/.delete/.upsert/…`) mà thân hàm **không** có `can/assertCan/checkPermission/assertPermission/…` → lỗi | `lib/eslint/require-can-in-write-action.mjs:28-44`, `:120-129` |
| Áp lên | 5 glob file action: `app/**/_actions*.ts`, `app/**/actions.ts`, `app/**/_*actions*.ts`, `app/**/_*-core.ts`, `app/**/_actions/**/*.ts` | `eslint.config.mjs:108-114`, `:309-316` |

⚠️ **Giới hạn thật:** route handler `app/api/**/route.ts` và logic trong `lib/**` **không bị quét**. Tầng (b) chỉ nhận wrapper cục bộ một cấp trong cùng file, không xuyên import. Còn **39 file** được miễn tạm trong `lib/eslint/inline-authz-allowlist.mjs` (miễn cả hai tầng — `eslint.config.mjs:333-343`).

⚠️ **Vi phạm luật cứng #1 trên diện rộng:** 63 lần đọc thẳng `session.user.centerId` ở 39 file (gate quyền, so sánh `!==`, và đường ghi). Ví dụ đường ghi: `app/(admin)/admin/cham-cong/lich-ca/_actions.ts:80,87,98,105`; ví dụ so sánh chặn oan người kiêm 2 cơ sở: `app/(admin)/admin/classes/_actions.ts:965`, `app/(admin)/admin/teachers/_actions.ts:36`. Còn `app/(admin)/admin/leads/actions.ts:836` và `app/api/admin/cham-cong/shift-export/route.ts:30-32` dùng `hasRole` cứng.

⚠️ File `app/(admin)/admin/leads/actions.ts` nằm trong allowlist import `@/lib/db` trần **có chủ đích**: `createLeadManual` + `updateLeadFields` kiểm trùng SĐT **toàn hệ thống**, đổi sang `scopedDb` sẽ vỡ dedup liên cơ sở — `lib/eslint/db-import-allowlist.mjs:14-19`.

---

## 5. Xuất dữ liệu ra file (Excel / CSV / JSON)

❌ **Không có `exceljs`.** Repo dùng `xlsx` (SheetJS `^0.18.5`, `package.json:112`) + `jszip`.

### 5.1 Toàn bộ đường xuất file

| Đường | Định dạng | Kiểu | Gate quyền | Cách ly | Watermark | Audit EXPORT |
|---|---|---|---|---|---|---|
| `app/api/admin/leads/export/route.ts` | **XLSX** (SheetJS) — đổi từ CSV ngày 25/08 | API GET | `requireLiveSession` (`:29`) + `checkPermission('leads:view-all')` **AND** `checkPermission('leads:export')` (`:38-42`) | `scopedDb(actor).lead` (`:69`) | ✅ sheet `_watermark` `:137` | ✅ `:151-166` (có thêm cờ `truncated`) |
| `app/api/admin/cham-cong/shift-export/route.ts` | **XLSX** | API GET | `requireLiveSession` + `checkPermission('hr_attendance:view', {centerId})` (`:35-37`); ⚠️ `hasRole` cứng ép `centerId` về cơ sở mình cho CENTER_MANAGER (`:30-32`) | `scopedDb(actor).shiftRegistration` (`:45`) | ✅ | ✅ |
| `app/api/admin/crm/commission-export/route.ts` | **XLSX** | API GET | `checkPermission('payments:manage')` (`:19-21`) | Scope **tay** qua `getModelVisibleCenterIds('CommissionStatement')` | ✅ | ✅ |
| `app/(admin)/admin/audit-log/_actions.ts:118` | CSV | Server Action | `checkPermission('audit-logs:view')` (`:27-33`) | `queryUnifiedAuditLogs(actor, …)` | — | — |
| `app/(admin)/admin/compliance/actions.ts:29-40` | JSON | Server Action | ⚠️ `isSuperAdmin(session.user.role)` — **so role cứng**, không qua `can()` (`:34-36`) | — | — | — |
| `app/(admin)/admin/students/tai-khoan/_components/parent-accounts-client.tsx:97-114` | CSV | ⚠️ **Dựng hoàn toàn ở CLIENT** từ rows đã render | ❌ **Không có gate riêng cho hành vi xuất**; chỉ có page gate `students:edit` (`page.tsx:25`) | — | ❌ | ❌ |
| `app/api/admin/templates/leads/route.ts` | XLSX (file mẫu) | API GET | `checkPermission('leads:create')` (`:19-21`) | — | — | — |

Watermark dùng chung: `lib/export/watermark.ts:3-11` — `exportWatermark(actorName, actorId, count, when)`, gắn ở **dòng cuối** CSV / sheet `_watermark` của XLSX.

### 5.2 `leads:export` — từ quyền mồ côi thành cổng thật (A-03, 25/08/2026)

| Sự thật | Bằng chứng |
|---|---|
| Cổng route là **AND** của hai key, thiếu cái nào cũng 403 | `app/api/admin/leads/export/route.ts:38-42` |
| Key **đã gỡ khỏi mọi vai** trong **FILE** seed v2 | `prisma/seed-roles.ts:238-239` (HO_MARKETING), `:420-422` (CENTER_MANAGER) — chỗ cũ nay là chú thích |
| 🔴 **DB prod chưa đổi cho tới khi bấm `seed-prod-roles.yml`** — merge chỉ đổi mã; bảng `RolePermission` chỉ ghi lại khi `seedRoles()` chạy, và trên prod nó là `workflow_dispatch` (bấm tay). Trước lúc đó, `HO_MARKETING` + `CENTER_MANAGER` **vẫn xuất được lead** | `prisma/seed-roles.ts:848-871`; `.github/workflows/seed-prod-roles.yml:71`; `documentation/permissions.md` §11.4 |
| Ma trận v1 chỉ còn `SUPER_ADMIN` | `lib/auth/permissions.ts:370` |
| Đường cấp cho người thường: **nhóm quyền** | `PermissionGrant` `subjectType = "GROUP"`, màn `/admin/user-groups` |
| Nút trên UI ẩn khi thiếu quyền | `app/(admin)/admin/leads/page.tsx:283` → `_components/leads-table.tsx:388` |

🔴 **Vì sao phải AND chứ không THAY THẾ `leads:view-all`:** người neo vai tại HO mà không có `leads:*` nào rơi vào nhánh `!hasAnyPermissionForModel` → `isHoLevel` → `"ALL"` (`lib/db-scope.ts:257-263`) ⇒ nếu chỉ đòi `leads:export` thì người đó xuất được lead **toàn hệ thống**.

⚠️ Nút "Xuất Excel" là thẻ `<a download>` nên **403 bị trình duyệt lưu thành file** chứa `{"error":"Forbidden"}` chứ không hiện lỗi — vì vậy prop `canExport` **không có giá trị mặc định** (quên truyền = nút biến mất, fail-closed). Cổng thật vẫn ở route; ẩn nút chỉ là lớp không-mời-bấm.

**Key còn mồ côi:** `elearning:report:export` (`lib/auth/permissions.ts:311`, `:716`) — vẫn **không** call-site nào enforce.

**File đã đổi (A-03):** `app/api/admin/leads/export/route.ts` (+ `route.test.ts` mới) · `app/(admin)/admin/leads/page.tsx` · `app/(admin)/admin/leads/_components/leads-table.tsx` (+ `leads-table.test.tsx` mới) · `lib/auth/permissions.ts` · `prisma/seed-roles.ts` · `lib/auth/leads-export-role.test.ts` (mới) · `app/(admin)/admin/users/[id]/permissions/_actions.ts` (+ `_actions.test.ts` mới).

### 5.3 ⚠️ Rủi ro khác của đường xuất lead

| # | Vấn đề |
|---|---|
| 1 | ✅ **ĐÃ VÁ 25/08** — `LeadsTable` nhận prop `canExport` **bắt buộc** (không default) và chỉ render nút khi có quyền (`app/(admin)/admin/leads/_components/leads-table.tsx:331` khai prop, `:388` render) |
| 2 | Export **bỏ mất 5/6 bộ lọc** của trang danh sách: chỉ truyền và đọc `status` + `q` (`leads-table.tsx:390`, `export/route.ts:45-50`). Lọc 20 lead rồi bấm xuất → nhận tối đa 5000 lead của cả scope |
| 3 | ✅ **ĐÃ VÁ 25/08 (A-03-6)** — lấy dư 1 dòng (`take: TRAN_DONG + 1`, `export/route.ts:72`) để biết có bị cắt; chạm trần thì ghi cảnh báo vào sheet `_watermark` (`:141-145`) **và** cờ `truncated` vào audit (`:164`). Trần vẫn là 5000 (`:26`) |
| 4 | ⚠️ **Dòng audit EXPORT vô hình với quản lý cơ sở** — đã kiểm chứng đến tận cùng: route truyền `entityId: 'export'` và không truyền `orgUnitId` (`export/route.ts:151-166`); `writeAudit` fallback `resolveAuditOrgUnitIdFromEntity(client, "Lead", "export")` → `findUnique` không thấy → trả `null` (`lib/audit/audit-log.ts:88-91`, `:144-149`); viewer lọc `orgUnitId IN scope` khi scope ≠ "ALL" (`lib/audit/audit-log.ts:218`, `:292`). ⇒ Chỉ SUPER_ADMIN / actor có `audit-logs:*` scope ALL thấy được dòng này |
| 5 | CSV tài khoản phụ huynh dựng ở client ⇒ **không watermark, không audit, không gate riêng** — đây là đường xuất PII (SĐT/email PH) **không truy vết được**, lệch chuẩn so với route lead |
| 6 | Mask PII: `canViewLeadPii()` quyết định mask hay không (`export/route.ts:98`); giá trị được ghi vào audit `piiMasked` |

---

## 6. Cấp / gỡ quyền cho người dùng

> Có **hai bảng grant trùng tên, khác hành vi**. Đọc nhầm bảng là kết luận sai hoàn toàn.

| | `UserPermissionGrant` (CŨ) | `PermissionGrant` (MỚI) |
|---|---|---|
| Chủ thể | **per-user** (`userId`) | **ROLE / GROUP** (`subjectType`, `subjectId`) |
| Phạm vi | **TOÀN CỤC** — không có `orgUnitId`/`centerId` | `dataScope` (ALL / UNIT_AND_BELOW / UNIT_ONLY / OWN) |
| Hiệu lực theo thời gian | ❌ Không có `effectiveFrom/To` | ❌ Không có |
| Nhánh DENY | ⚠️ Có cột `grant` nhưng **v2 bỏ qua** | ✅ **Nơi duy nhất DENY có tác dụng thật** |
| Che trường | ❌ | ✅ `fieldMask[]` |
| Schema | `prisma/schema.prisma:1124-1140` | `prisma/schema.prisma:468-487` |

### 6.1 Đường A — gán vai (`UserOrgRole`), màn `/admin/users/[id]/org-roles`

| # | Bước | Bằng chứng |
|---|---|---|
| 1 | Gate action: `requireAssign(actor, resolved)` → `roles:assign` qua `decidePermissionWithGrant` (grant → v1/v2 theo cờ) — **cùng hệ quyền với cổng trang** từ 25/08; trước đó action gác bằng `can()` v1 ma trận tĩnh nên `HO_HR` bị chặn dù trang cho vào | `lib/auth/rbac-service.ts:81-93`, `:380-381` |
| 2 | Zod `assignUserOrgRoleSchema` — chỉ validate `userId/orgUnitId/roleId/effectiveFrom/To/reason`; refine duy nhất là "effectiveTo phải sau effectiveFrom" | `lib/validators/role.ts:53-65` |
| 3 | Kiểm `OrgUnit` tồn tại + chưa xoá → `ORG_INVALID` | `rbac-service.ts:387-391` |
| 4 | Kiểm `RoleDef` tồn tại, **đọc kèm `permissions` từ DB** (dữ liệu enforce của R1) → `ROLE_NOT_FOUND` | `:394-398` |
| 5 | **Bốn rào, chạy theo thứ tự** trong `assertAssignGuards`: SEC-M13 (chỉ SUPER_ADMIN gán được vai `SUPER_ADMIN`, `FORBIDDEN_ROLE`) → **A-01-3** (cấm neo `CENTER_MANAGER` tại đơn vị type HO/ROOT, `ORG_TYPE_FORBIDDEN`, **áp cho mọi actor kể cả SUPER_ADMIN**) → **R1** (cấm gán vai mang quyền cấp quyền — tiền tố `roles:` hoặc `users:manage`, đọc `permissions` của vai đích **từ DB**, `FORBIDDEN_PRIVILEGED_ROLE`) → **R2** (cấm tự gán cho chính mình; SUPER_ADMIN miễn có chủ đích, `SELF_ASSIGN_FORBIDDEN`) | `lib/auth/rbac-service.ts:160-210`; luật A-01-3 ở `lib/auth/org-anchor-rules.ts` |
| 5b | **`source`** (SL-01): `create` → luôn `MANUAL`; `update` dòng **hết** hiệu lực → `MANUAL`; `update` dòng **đang sống** → **không đụng** | `:435-440`, `:452`, `:463` |
| 6 | `$transaction`: `userOrgRole.upsert` (khoá `userId_orgUnitId_roleId`); nếu role là `CENTER_MANAGER` và org có `centerId` → `syncCenterClassConversations` **cùng tx** | `:444-470` |
| 7 | ✅ `logRbacAudit` entity `ASSIGNMENT`, action `ASSIGN`, **kèm `reason`** | `:472-479` |
| Gỡ | `revokeUserOrgRole`: rào đối ngẫu SEC-M13 + R1 (`assertRevokeGuards`, `:219-243`) → `update status="EXPIRED", effectiveTo=now` (không xoá dòng) + sync chat + audit `REVOKE` | `:483-534` |

❌ **Không có ràng buộc nào chặn gắn một người vào nhiều cơ sở khác nhánh** — không ở DB (PK ghép `@@id([userId, orgUnitId, roleId])`, `prisma/schema.prisma:563`), không ở Zod, không ở service.
⚠️ Form vẫn là `<select>` **đơn** — chọn đúng 1 đơn vị/lần (`org-roles-manager.tsx:167-181`). Muốn phủ N cơ sở phải bấm N lần. Nút "Gán" bị khoá khi thiếu lý do hoặc khi vi phạm một trong ba rào (`:97`) — nhưng đó chỉ là lớp giải thích, enforce ở service.
⚠️ **Nới quyền âm thầm:** chỉ cần **một** dòng vai neo tại OrgUnit type HO/ROOT là `isHoLevel = true` (`lib/auth/actor.ts:255`), khi đó `visibleCenterIds` = **mọi cơ sở sống** (`:277-280`).
✅ **Từ 25/08 (A-01-3)** riêng vai `CENTER_MANAGER` bị chặn cứng ở **cả hai** đường ghi — gán tay (`lib/auth/rbac-service.ts:183-185`) và đồng bộ khi sửa ô "Đơn vị" ở `/admin/users/[id]/edit` · `/admin/nhan-su` (`lib/auth/org-role-sync.ts:167-176`, ném `OrgRoleSyncError` ⇒ rollback cả transaction). Luật ở **một** module thuần: `lib/auth/org-anchor-rules.ts`.
⚠️ Rào **cố ý chỉ có `CENTER_MANAGER`** (`org-anchor-rules.ts:21-26`) — mọi vai khác vẫn neo được tại HO và vẫn bật `isHoLevel`.

**File đã đổi (SL-01 · A-01-3 · OQ-7):** `prisma/schema.prisma` · `prisma/migrations/20260825090000_sl01_userorgrole_source/migration.sql` (mới) · `lib/auth/org-anchor-rules.ts` (mới) · `lib/auth/org-role-sync.ts` (+ `.test.ts` mới) · `lib/auth/rbac-service.ts` (+ `.test.ts` mới) · `prisma/seed-roles.ts` · `app/(admin)/admin/users/[id]/org-roles/page.tsx` · `.../org-roles/_components/org-roles-manager.tsx`.

### 6.2 Đường B — grant per-user, màn `/admin/users/[id]/permissions`

| # | Bước | Bằng chứng |
|---|---|---|
| 1 | `requireUsersManage()` → `checkPermission("users:manage")`, thiếu → redirect | `_actions.ts:17-24` |
| 2 | Zod `grantCreateSchema` | `_actions.ts:35-39` |
| 3 | Chặn grant cho SUPER_ADMIN ("có toàn quyền — không cần override") | `_actions.ts:57-63` |
| 4 | **SEC-M13 + A-03-7** — chặn theo **tiền tố** `roles:` và `leads:`, cộng khoá `users:manage`; chặn **cả `ALLOW` lẫn `DENY`**, ở **cả** `addGrantAction` (`:104`) **lẫn** `updateGrantAction` (`:184` — bịt đường vòng "tạo DENY rồi sửa thành ALLOW"). ⚠️ `*:view-pii` của **họ khoá khác** vẫn cố ý cho phép (OI-4), nhưng `leads:view-pii` thì **không** — vì nó khớp tiền tố `leads:` | `_actions.ts:35-53`, `:104`, `:184` |
| 5 | Chặn trùng (`userId_action` unique) | `_actions.ts:80-89` |
| 6 | `$transaction`: `userPermissionGrant.create` + **`user.update tokenVersion: {increment: 1}`** (ép re-login mọi thiết bị) + `logGrantAudit` | `_actions.ts:93-118` |
| 7 | `revalidatePath` 3 đường | `_actions.ts:120-123` |

### 6.3 ⚠️ Lỗ nghiêm trọng nhất của mảng quyền: **DENY chết trên prod**

| Sự thật | Bằng chứng |
|---|---|
| `can()` v2 là ALLOW-wins **thuần** — 8 dòng, không tồn tại biến `grantsDeny` | `lib/auth/can.ts:52-59`, comment `:48-51` |
| `buildActor` chỉ lọc `g.grant === "ALLOW"` vào `grantsAllow`, dòng DENY **bị vứt im lặng** (không log, không lỗi) | `lib/auth/actor.ts:367-371` |
| Hành vi này **được ghim bằng test** ⇒ là thiết kế, không phải bug chưa vá | `lib/auth/can.test.ts:129-135` — `[A0-03-T6-02] grant DENY KHÔNG làm mất quyền role` |
| v1 **có** nhánh DENY (`DENY > ALLOW > role fallback`) | `lib/auth/permissions.ts:793-796` |
| ⚠️ **Giao diện đang nói dối**: màn permissions in ra "Thứ tự ưu tiên: DENY > ALLOW > role matrix" | `app/(admin)/admin/users/[id]/permissions/page.tsx:107-111` |

⇒ Người vận hành tạo grant DENY sẽ thấy nó **có tác dụng ở local** (v1) và **không tác dụng trên prod** (v2), không một cảnh báo nào. **Luật tạm: muốn chặn quyền thì gỡ `UserOrgRole`, đừng tạo DENY.**

### 6.4 ⚠️ Những gì KHÔNG có

| Thiếu | Bằng chứng |
|---|---|
| ❌ UI sửa danh sách quyền của một `RoleDef` — `setRolePermissionsAction` tồn tại nhưng **không component nào gọi**; `_components/` chỉ có `create-role-form.tsx` | `app/(admin)/admin/roles/actions.ts:73`; `roles/page.tsx:19-25` |
| ❌ UI tạo `PermissionGrant` với `subjectType = "ROLE"` — grep `subjectType` trong `app/` chỉ ra `GROUP` | `app/(admin)/admin/user-groups/_actions.ts:405-412`, `:467-470` |
| ⚠️ `RolePermission` có PK ghép `@@id([roleId, action])` ⇒ **một role chỉ mang đúng một `scopeType` cho mỗi action** | `prisma/schema.prisma:418-426` |
| 🔴 **Đính chính (25/08):** câu cũ "vai gán tay không bao giờ bị thu hồi" là **SAI trước bản vá** — `prevPlan` được **suy lại** từ một đơn vị neo, nên dòng gán tay ở đúng cơ sở neo cũ **vẫn bị `EXPIRED`** bởi thao tác chỉ sửa ô "Đơn vị". Từ SL-01, quyền thu hồi quyết bằng cột `UserOrgRole.source`: nhánh THU HỒI bỏ qua `MANUAL`, chỉ `EXPIRED` dòng `AUTO`/`null` | `lib/auth/org-role-sync.ts:15-22`, `:93-94`, `:300`, `:307-314`; `app/(admin)/admin/users/_actions.ts:159-166` |
| 🔴 **Bẫy kèm SL-01:** bất biến chỉ đúng cho dòng `MANUAL` **còn hiệu lực**. Nhánh **GÁN** của cùng hàm hồi sinh dòng `MANUAL` **đã hết hiệu lực** và **đổi nhãn về `AUTO`** (guard `liveKeys` chỉ chắn dòng đang sống) ⇒ lần sửa ô "Đơn vị" sau nữa, dòng bị `EXPIRED` im lặng. Sau mỗi lần sửa hồ sơ đa cơ sở phải kiểm lại cột `source` | `lib/auth/org-role-sync.ts:238-266`, `:244-248`; `documentation/permissions.md` §11.1 |
| ❌ Script backfill đánh dấu `MANUAL` cho cấu hình đa cơ sở **đang gán tay trên prod** — **chưa có trong repo**; tới khi chạy, những dòng đó vẫn mang `AUTO` và vẫn thu hồi được | `prisma/migrations/20260825090000_sl01_userorgrole_source/migration.sql:40-45` |

### 6.5 Vai quan hệ (PARENT) — ngoại lệ có chủ đích

- `RELATIONSHIP_ROLE_CODES = ["PARENT"]` — quyền nạp thẳng từ `RoleDef` theo `User.role/roles`, **không cần dòng `UserOrgRole` nào** (`lib/auth/actor.ts:192`, `:399-421`).
- Permission của vai này mang `orgUnitId: ""`, `centerScope: null`, `orgUnitScope: null`, **cố ý không chạm** `visibleCenterIds`/`visibleOrgUnitIds`/`isHoLevel` (`lib/auth/actor.ts:348-365`).
- ⇒ Mọi permission scope CENTER của PH **không bao giờ khớp** (fail-closed — `lib/auth/can.ts:23`, `:26`). Cách ly dữ liệu PH nằm ở `portalDb` + ownership check, **không** ở `scopedDb`.
- Lý do tồn tại cơ chế: sự cố 114 tài khoản PARENT / 0 dòng `UserOrgRole` ⇒ PH đọc chat được nhưng **không gửi được tin** (`PERMISSION_DENIED`) vì đường đọc kiểm theo tư cách thành viên hội thoại chứ không qua `can()` — `lib/auth/actor.ts:166-191`.

---

## 7. Luồng Lead — tạo / sửa / gán sale

### 7.1 Tạo lead — hai cửa

**Cửa A — công khai `/api/leads` (❌ KHÔNG auth, cố ý)**

| # | Bước | Bằng chứng |
|---|---|---|
| 1 | Đọc body **trước** rate-limit (để probe/bot không đốt quota thật) | `app/api/leads/route.ts:24` |
| 2 | **Honeypot** `body.website` khác rỗng → trả `{ok:true, leadId:'hp-…'}` giả | `:27-31` |
| 3 | Zod `leadCreateSchema` | `:33-39` |
| 4 | **Bẫy thời gian**: `timeOnPage < 3` → trả `{ok:true, leadId:'ab-…'}` giả | `:43-46` |
| 5 | Rate-limit `leads:<ip>`, ngưỡng **đọc động** từ `SystemSetting public.leadRateLimitMax/WindowMs` | `:48-56` |
| 6 | Dedup SĐT 90 ngày → trùng thì **không tạo lead mới**, log `LeadDuplicate`, trả lead cũ | `:74-79` |
| 7 | Giải mã `?ref=<code>` → `affiliateId` (mã sai/tắt → null, vẫn tạo lead) | `:86-88` |
| 8 | `db.lead.create` — lưu cả `ipAddress`, `userAgent`, UTM/fbclid/gclid/fbp/fbc, `consentMarketing` | `:90-120` |
| 9 | Sau đó: `sendMetaCapi` / `sendGa4Event` / `autoAssignNewLead` | imports `:5,8` |

**Cửa B — nhập tay `createLeadManual` (Server Action)**

| # | Bước | Bằng chứng |
|---|---|---|
| 1 | `auth()` → `checkPermission('leads:create')`, thiếu → `{ok:false, error:'Không có quyền'}` | `actions.ts:583-585` |
| 2 | Zod `manualLeadSchema` | `:587-591` |
| 3 | Dedup SĐT **TOÀN HỆ THỐNG** (`db` trần có chủ đích — vì thế file nằm trong allowlist) | `:595-604`, `lib/eslint/db-import-allowlist.mjs:14-19` |
| 4 | ⚠️ **Rò rỉ có kiểm soát**: chi tiết bản trùng (trạng thái + tên sale) chỉ lộ khi **vừa** có `leads:view-pii` **vừa** trong scope (`leads:view-all` theo cơ sở HOẶC cùng `centerId`); ngược lại chỉ báo chung | `:605-624` |
| 5 | `orgUnitId` là nguồn chính, `centerId` suy ra (`centerIdForOrgUnit`, HO→null) | `:628-630` |
| 6 | `rejectHeadOffice('lead', …)` — Hội sở không nhận lead, chặn ngay lúc nhập | `:632-634` |
| 7 | `db.lead.create` + `LeadActivity` "Tạo lead thủ công" | `:636-668` |
| 8 | `logLeadAudit` action `CREATE` — ⚠️ bọc `.catch(() => {})` (audit lỗi không chặn nghiệp vụ) | `:670-686` |
| 9 | `autoAssignNewLead(...)` — ⚠️ cũng `.catch(() => {})` | `:688` |

### 7.2 Sửa lead

Xem §4.1 (khuôn ghi chuẩn). Điểm riêng:
- Đổi trạng thái phải qua `canTransitionLeadStatus(before, next, {hasRecordedPayment})` — pipeline hợp lệ; `AWAITING_DECISION → REGISTERED` chỉ mở khoá khi đã có `Payment(RECORDED)` đọc qua `getLeadPaymentSummary` (`actions.ts:150-160`).
- Lead "dùng chung" (`isSharedWithTeam`): người khác **chỉ xem + ghi chú**; mọi mutator đòi chủ sở hữu hoặc `leads:view-all` (`actions.ts:42-56`).
- Bật/tắt dùng chung: chỉ chủ sở hữu **hoặc** `checkPermission('leads:assign', {centerId: before.centerId})` (`actions.ts:83-86`).

### 7.3 Gán sale — 5 đường, 3 sổ lịch sử rời rạc

| Đường | Gate | Ghi lịch sử vào đâu | Bằng chứng |
|---|---|---|---|
| `assignLeadToSaleAction` (gán tay 1 lead) | `checkPermission('leads:assign')` — ⚠️ **không truyền target** | `LeadActivity` + `logLeadAudit(ASSIGN)` | `actions.ts:802-817`; `lib/lead/auto-assign.ts:216-259` |
| `autoAssignNewLeadAction` | `checkPermission('leads:assign')` | như trên | `actions.ts:785-800` |
| `transferLead` (chuyển liên cơ sở, **note ≥5 ký tự bắt buộc**) | `leads:assign` + `validateTransferTarget` | ✅ `LeadTransfer` + `LeadActivity(HANDOVER)` + audit | `actions.ts:851-857`, `:944-986` |
| `bulkReassignLeads` (bàn giao hàng loạt) | `leads:assign` | ✅ `LeadAssignmentHistory` | `lib/lead-handover/service.ts:60`, `:95-103` |
| `reassignOpenLeads` (sale nghỉ việc) | — (gọi từ luồng nhân sự) | audit | `lib/lead/assign.ts:146` |
| Đặt chế độ chia của cơ sở | `checkPermission('leads:assign', {centerId})` + ⚠️ chặn thêm bằng `hasRole('CENTER_MANAGER') && session.user.centerId !== centerId` | — | `actions.ts:828-838` |

⚠️ **`manualAssignLead` KHÔNG guard scope.** Nó đọc `db.lead.findUnique` rồi `update` mà **không gọi `passesScope`** (`lib/lead/auto-assign.ts:221-229`). Lớp chặn duy nhất là `checkPermission('leads:assign')` **không truyền `centerId`** ở call-site (`actions.ts:808`). ⇒ Ai có `leads:assign` ở bất kỳ cơ sở nào cũng gán được lead của cơ sở khác nếu biết `leadId`. Kiểm chứng đối chiếu: các action lead khác **có** guard (`actions.ts:79-82`, `:139-144`), nên đây là **lệch khuôn**, không phải quy ước.

⚠️ **Lịch sử gán bị phân mảnh 3 bảng, mỗi bảng chỉ có ĐÚNG MỘT đường ghi:**

| Bảng | Đường ghi duy nhất | Hệ quả |
|---|---|---|
| `LeadAssignmentHistory` | `lib/lead-handover/service.ts:95` | 4/5 đường gán **không** ghi vào đây |
| `LeadTransfer` | `app/(admin)/admin/leads/actions.ts:963` | ∉ `SCOPED_MODELS` (có `from/toCenterId` chứ không 1 `centerId`) ⇒ phải scope **thủ công** — `bao-cao-chuyen/page.tsx:47-59` |
| `LeadActivity` type `HANDOVER` | `actions.ts:944-960` | chỉ để hiển thị timeline |

Muốn dựng "lịch sử chuyển sale đầy đủ" phải hợp nhất 3 nguồn + `AuditLog`.

### 7.4 Audit lead

- Mọi mutation đi qua `logLeadAudit()` (`lib/audit/log.ts:128-156`) — **không còn** ghi vào `LeadAuditLog`, mà gọi `writeAudit()` vào bảng `AuditLog` hợp nhất với `module='leads'`, `entityType='Lead'`, `action='lead.<action>'`, và `orgUnitId` **tự suy từ chính Lead** (`resolveOrgUnitId`).
- `LeadAuditLog` (`prisma/schema.prisma:3445-3467`) **đã đóng băng**, chỉ đọc qua tab "Lịch sử cũ", và vì không có `orgUnitId` nên **chỉ SUPER_ADMIN/HO đọc được** (`lib/audit/legacy-log.ts:37-43`).
- ⚠️ Đường EXPORT **không** dùng `logLeadAudit` — xem §5.3 mục 4.

### 7.5 Import Excel lead — hai luồng, hai key quyền khác nhau

| Luồng | Endpoint | Gate | Đặc điểm |
|---|---|---|---|
| Thường | `POST /api/admin/import/leads` | `checkPermission('leads:create')` (`:22-27`) | Trần 5000 rows (`:39`); parse ở **browser** (`ExcelImporter`) rồi POST JSON, **server parse/validate lại** (`parseLeadImportRow`); guard ghi `passesScope` per-row |
| "Đã đăng ký" | `POST /api/admin/import/leads/registered` | `checkPermission('leads:import')` (`:113`) | Upload file thô lên **server**; **dry-run bắt buộc**, chỉ ghi khi `mode=confirm`; idempotent; `maxDuration = 300` |
| File mẫu | `GET /api/admin/templates/leads` | `checkPermission('leads:create')` (`:19-21`) | Vá XML `public/templates/mau-lead-v2.xlsx` bằng JSZip |

⚠️ Hai luồng import dùng **hai key khác nhau** (`leads:create` vs `leads:import`) — dễ cấp nhầm.

---

## 8. Bảng tổng hợp lỗ / nợ kỹ thuật chạm quyền–tiền–riêng tư

| # | Mảng | Vấn đề | Mức | Bằng chứng |
|---|---|---|---|---|
| 1 | Quyền | `can()` v2 **không có nhánh DENY**; dòng `UserPermissionGrant` DENY bị vứt im lặng; UI vẫn quảng cáo "DENY > ALLOW" | Cao | `lib/auth/can.ts:52-59`, `lib/auth/actor.ts:367-371`, `users/[id]/permissions/page.tsx:107-111` |
| 2 | Quyền | `scopedDb` **không che write** — mọi create/update/delete phải tự guard | Cao | `lib/db-scope.ts:347-375` |
| 3 | Quyền | `include` lồng nhau **không** được auto-scope | Cao | `lib/db-scope.ts:4-5` |
| 4 | Quyền | Model quên khai `getModelPrefixes` → fail-open `isHoLevel → "ALL"` (đã cháy 1 lần với Attendance) | Cao | `lib/db-scope.ts:176-180`, `:226-228` |
| 5 | Quyền | Một grant ALLOW hẹp làm `getModelVisibleCenterIds` trả `"ALL"` toàn hệ thống cho model đó | Cao | `lib/db-scope.ts:248-254` |
| 6 | Quyền | Một dòng vai neo tại HO/ROOT ⇒ `isHoLevel` ⇒ thấy **mọi** cơ sở. ⚠️ Đã bịt **một phần** 25/08: riêng `CENTER_MANAGER` bị chặn ở cả hai đường ghi (A-01-3); các vai khác còn nguyên | Cao | `lib/auth/actor.ts:255`, `:277-280`; `lib/auth/org-anchor-rules.ts` |
| 7 | Quyền | 63 lần đọc thẳng `session.user.centerId` ở 39 file — vi phạm luật cứng #1; JWT còn stale sau khi đổi đơn vị | Cao | `lib/auth.ts:195,210,234` + 39 file |
| 8 | Tiền | Hoàn tiền **không trừ** doanh thu / công nợ / portal | Cao | `lib/finance/payment.ts:600-632`, `lib/finance/debt.ts:134`, `lib/portal/billing.ts:117-119` |
| 9 | Tiền | Điều chỉnh (`ADJUSTED`) bị bỏ qua im lặng | Cao | `lib/finance/payment.ts:541-557` |
| 10 | Tiền | Duyệt `RefundRequest` **không sinh bút toán**; `RefundStatus.PAID` không code nào set | Cao | `lib/finance/refund.ts:160-168`, `schema.prisma:5947` |
| 11 | Tiền | Ba định nghĩa "doanh thu" cho ba con số khác nhau | Cao | §2.8 |
| 12 | Tiền | `paidDate = new Date()` thay vì `transferredAt` ⇒ lệch kỳ | Trung bình | `lib/payments/payos-ingest.ts:1049` |
| 13 | Tiền | Sửa kế hoạch trả góp xoá mềm cả bút toán tiền thật `[auto:sepay:*]` | Cao | `lib/orders/installments.ts:98-101` |
| 14 | Tiền | payOS thiếu checksum key → nhận payload không chữ ký | Cao | `lib/payments/payos.ts:165-168` |
| 15 | Riêng tư | CSV tài khoản phụ huynh dựng ở client — không watermark, không audit, không gate riêng | Cao | `parent-accounts-client.tsx:97-114` |
| 16 | Riêng tư | Dòng audit EXPORT lead có `orgUnitId = null` ⇒ vô hình với quản lý cơ sở | Trung bình | `export/route.ts:151-166` + `lib/audit/audit-log.ts:144-149`, `:218` |
| 17 | Riêng tư | ⚠️ **ĐÓNG Ở TẦNG MÃ 25/08, CHƯA ĐÓNG TRÊN PROD** — `leads:export` nay là cổng thật (AND với `leads:view-all`) và đã gỡ khỏi mọi vai **trong file seed**, nhưng bảng `RolePermission` prod chỉ đổi khi bấm tay `seed-prod-roles.yml`; trước đó `HO_MARKETING` + `CENTER_MANAGER` vẫn xuất được. Còn lại: `elearning:report:export` vẫn mồ côi | Trung bình (tới khi re-seed) | `app/api/admin/leads/export/route.ts:38-42`; `prisma/seed-roles.ts:848-871`; `.github/workflows/seed-prod-roles.yml:71`; `lib/auth/permissions.ts:716` |
| 18 | Quyền | `manualAssignLead` không `passesScope`, call-site không truyền `centerId` | Cao | `lib/lead/auto-assign.ts:221-229`, `actions.ts:808` |
| 19 | Vận hành | Webhook lead (facebook/zalo/google-form/quatang) **fail-OPEN** khi `NODE_ENV !== "production"` và thiếu secret | Cao | `lib/lead/webhook.ts:44-56`, `:92-104` |
| 20 | Vận hành | Rate limit **fail-soft** về Map trong bộ nhớ per-instance khi Upstash lỗi / không đặt env — gồm cả chống brute-force login | Trung bình | `lib/rate-limit.ts:143-146` |
| 21 | Vận hành | CSP đang là `Content-Security-Policy-Report-Only` — **không chặn gì** | Trung bình | `next.config.ts` (khối securityHeaders) |
| 22 | Vận hành | Một bộ credential R2 điều khiển **cả** bucket công khai (`cdn.satarobo.vn`) **lẫn** bucket ảnh chat | Cao | `lib/storage/r2-client.ts:16-20`, `lib/storage/chat-storage.ts:49-65` |
| 23 | Lint | `no-inline-authz` chỉ áp lên 5 glob file action; `app/api/**/route.ts` và `lib/**` không bị quét; 39 file được miễn | Trung bình | `eslint.config.mjs:108-114`, `:333-343`, `lib/eslint/inline-authz-allowlist.mjs` |
| 24 | Kiến trúc | Pipeline chuẩn `lib/actions/factory.ts` chỉ có module chat dùng; 297 file gọi thẳng `checkPermission` | Trung bình | `lib/chat/*.ts`; grep `app/` |
| 25 | Kiến trúc | `WorkScope` (điều động tác nghiệp) **chỉ có tác dụng** với người hưởng vai qua `PositionAssignment`; người chỉ có `UserOrgRole` bị bỏ qua, không lỗi | Trung bình | `lib/auth/actor.ts:511-526` vs `lib/org/positions.ts:203-206` |

---

## 9. Những gì KHÔNG tồn tại (đừng đi tìm)

| Thứ | Trạng thái |
|---|---|
| Bảng `LeadStudent` | ❌ — bảng học sinh của lead tên là `LeadChild` (`prisma/schema.prisma:1461-1487`) |
| Model chi phí tổng quát (`Expense`/`Cost`/`Budget`) | ❌ — chỉ có `MarketingCostPeriod` (không `centerId`, không UI nhập) |
| Model lưu tuỳ chọn giao diện theo user (preference / columnConfig) | ❌ — grep 0 kết quả; thứ gần nhất là sidebar lưu `localStorage` |
| `exceljs` | ❌ — dùng `xlsx` (SheetJS) |
| Bộ lọc trên trang `/admin/dashboard` (chọn cơ sở / khoảng ngày) | ✅ **ĐÃ CÓ từ 25/08 (A-02)** — `components/admin/scope-filter-bar.tsx` + `resolveScopeFilters()` (`lib/reports/filters.ts:224`), đặt trong khung 4 tab **ở cuối trang**; các panel phía trên **không** đọc bộ lọc này (`app/(admin)/admin/dashboard/page.tsx:153-158`). Bốn tab hiện là **placeholder, chưa đọc dữ liệu** |
| Component multi-select trong `components/ui/` | ❌ — vẫn chỉ có `combobox.tsx` single-select. Bộ lọc A-02 dựng dropdown-checkbox bằng `DropdownMenu` + `DropdownMenuCheckboxItem` sẵn có, **không** thêm thư viện (`components/admin/scope-filter-bar.tsx:23-26` (chú thích lý do)) |
| Preset khoảng ngày ("tháng này" / "7 ngày qua") | ❌ — toàn bộ là `<input type="date">` native (36 file) |

> ⚠️ **ĐÍNH CHÍNH — KHÔNG được đọc bảng này thành "chưa có gì dùng chung":** ĐÃ CÓ component lọc phạm vi dùng chung (cơ sở + khoảng ngày) đang chạy ở **8 trang** `/bao-cao/*`: `components/admin/report-filter-bar.tsx:5-84` + resolver `resolveReportFilters` (`lib/reports/filters.ts:100-125`).
> Call-site: `bao-cao/churn/page.tsx:16,129` · `cohort:16,176` · `dao-tao:16,122` · `doanh-thu:16,134` · `hieu-suat-gv:31,109` · `lead:16,119` · `trial:16,153` · `trung-tam:27,134`.
> ⚠️ **Câu tổng kết cũ ở đây ("cái CHƯA có là: multi-select cơ sở, giá trị mặc định khoảng ngày, và việc dùng nó trên `/admin/dashboard`") đã SAI cả 3 vế từ 25/08 (A-02)** — giữ lại làm dấu vết, đừng đọc nó như hiện trạng:
> · multi-select cơ sở: **có** — `components/admin/scope-filter-bar.tsx:124-145` (`DropdownMenu` + `DropdownMenuCheckboxItem`);
> · mặc định khoảng ngày: **có** — 01 tháng này → hôm nay, đo bằng lịch VN (`lib/reports/filters.ts:257-258`);
> · dùng trên `/admin/dashboard`: **có** — `app/(admin)/admin/dashboard/page.tsx:167`, `:213-224` (trong khung 4 tab ở cuối trang).
> Thứ **thật sự** còn thiếu: 4 tab kia vẫn là placeholder chưa đọc dữ liệu, và các panel phía trên dashboard không đọc bộ lọc. **Đừng dựng bộ lọc đa cơ sở thứ hai** — hai bộ parse lệch nhau là hỏng câm (cảnh báo §4.9 của `architecture.md`).
> Vẫn đúng: hai quy ước URL song song — `?center=` (ReportFilterBar **và** ScopeFilterBar, `lib/reports/filters.ts:107`, `:233`) và `?centerId=` (~14 trang danh sách).
| UI sửa quyền của một `RoleDef` | ❌ — phải sửa `prisma/seed-roles.ts` + chạy seed |
| UI tạo `PermissionGrant` `subjectType = "ROLE"` | ❌ — chỉ có `GROUP` |
| `modules/*` (modular monolith boundary) | ❌ — chưa tồn tại |
| Role `HO_MANAGER` | ❌ — vai HO là cross-center theo chức năng |
