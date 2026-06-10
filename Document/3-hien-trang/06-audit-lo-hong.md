# 06 — ⚠️ Audit lỗ hổng (snapshot 2026-06-10)

> Kết quả rà soát trực tiếp infra quyền (`lib/auth/*`, `lib/db-scope.ts`, `lib/portal/session.ts`), toàn bộ ~36 route API, mẫu đại diện ~63 file server actions admin + 6 portal, webhook, convert-lead, orders/payment, media-consent.
>
> **Kết luận chung:** nền tảng bảo mật **khá tốt** — auth gate phủ đủ, webhook ký timing-safe, transaction cho tiền, consent enforce ở tầng query, portal không lộ studentId. **Rủi ro lớn nhất = 2 trụ đa-cơ-sở chưa "live": `scopedDb` chưa áp rộng + RBAC vẫn chạy matrix tĩnh v1.**

---

## 🔴 MỨC CAO

### C1. Cách ly cơ sở (scopedDb) chưa enforce → IDOR theo center
- **Hiện trạng:** ~236/238 file `app/**` import `@/lib/db` trần; chỉ 2 file (`app/(admin)/admin/crm/messenger/{page,actions}.ts`) dùng `scopedDb(actor)`.
- **Governance ở mức `warn`, KHÔNG chặn CI:** `.dependency-cruiser.cjs` rule `app-no-direct-prisma` còn `// TODO(A0-04): 'warn' → 'error'`.
- **Bằng chứng IDOR cụ thể:**
  - `app/(admin)/admin/leads/actions.ts` `updateLeadStatus` — chỉ `can(user,'leads:edit')` rồi `db.lead.findUnique({where:{id}})` **không lọc centerId** → CENTER_MANAGER/SALES_CSM ở CS1 truyền `leadId` của CS2 sẽ sửa được.
  - `app/(admin)/admin/orders/_actions.ts` `changeOrderStatusAction`, `updateOrderNoteAction` — load record bằng `findUnique(id)` trần, không ràng buộc centerId của actor.
- **Mức:** Cao (dữ liệu trẻ em + tiền, đa cơ sở).
- **Khắc phục:** đẩy nhanh A0-04 — thay `db` → `scopedDb(actor)` cho module có centerId; đổi rule sang `error`. Trước mắt: với action sửa-theo-id (lead/order/student/class) thêm `where:{ id, centerId:{ in: actor.visibleCenterIds } }` hoặc `passesScope()` sau `findUnique`.

### C2. RBAC vẫn chạy matrix tĩnh v1 (`RBAC_V2_ENABLED` mặc định OFF)
- `lib/flags.ts` — `isRbacV2Enabled()` chỉ true khi env `="true"`; `.env.example` đặt `"false"`.
- `lib/auth/check-permission.ts` + `permission-eval.ts`: flag OFF → quyền lấy **hoàn toàn từ v1 matrix**; `can()` v2 (role động + scope từ `UserOrgRole`) chỉ chạy **shadow** để log lệch, **không có hiệu lực**.
- **Hệ quả:** vai trò HO chức năng (HO_ACCOUNTANT/HO_HR/HO_SALE...) + scope CENTER/CHILDREN/ASSIGNED định nghĩa trong DB **chưa áp dụng runtime**. Mọi assignment role động trong DB vô hiệu tới khi bật flag.
- **Mức:** Cao (quyền không khớp mô hình tổ chức đã thiết kế).
- **Khắc phục:** hoàn tất shadow-compare → bật `RBAC_V2_ENABLED` ở staging, soát log lệch v1/v2 trước prod.

### C3. Webhook & cron "stub mode" (bỏ xác thực) khi thiếu secret → fail-OPEN
- `lib/lead/webhook.ts` `verifyWebhookSecret` + `verifyMetaSignature`: env secret **chưa set → return ok=true** (chỉ `console.warn`). Áp cho cả 3 webhook lead (facebook/zalo/google-form) + X-Hub-Signature Meta.
- **Hệ quả:** lên prod mà quên set `WEBHOOK_*_SECRET` / `META_APP_SECRET` → endpoint nhận lead/messenger **mở hoàn toàn** (bất kỳ ai POST cũng tạo lead/inject hội thoại).
- **Mức:** Cao nếu go-live thiếu cấu hình.
- **Khắc phục:** guard fail-CLOSED theo `NODE_ENV==='production'` (thiếu secret → 503). Đưa secret vào checklist go-live.
- ✅ **Điểm tốt:** khi secret CÓ set, so sánh `timingSafeEqual`, HMAC trên raw body đúng cách.

---

## 🟠 MỨC TRUNG

### T1. Gate quyền không nhất quán (~27 admin action dùng mảng role inline)
- 63/63 file admin actions có `auth()`, nhưng chỉ ~36 dùng `assertCan/can`; còn lại gate bằng `ALLOWED_ROLES.includes(role)` inline (vd `enrollments/_actions.ts`, `teachers/_actions.ts`) hoặc helper cục bộ.
- Không phải "thiếu gate" — nhưng phân tán logic ra ~10 cách, khó audit; khi bật RBAC v2, mảng inline **không tự đọc DB** → điểm lệch quyền.
- **Khắc phục:** chuẩn hoá về `assertCan/assertPermission`.

### T2. scopedDb chưa bọc nested-include
- `lib/db-scope.ts` tự ghi chú: extension chỉ scope query top-level; **nested `include` model scoped khác KHÔNG auto-scope** — phải tự `where`.
- **Khắc phục:** khi rollout A0-04, thêm test CI bắt include lồng model scoped.

### T3. Cron bearer-token so sánh không timing-safe
- `lib/cron/auth.ts` — `return auth === \`Bearer ${secret}\`` dùng `===` thường (webhook đã dùng `timingSafeEqual`).
- **Khắc phục:** dùng `timingSafeEqual`. ✅ Điểm tốt: thiếu `CRON_SECRET` → fail-CLOSED (reject) — đúng hướng (khác C3).

---

## 🟢 MỨC THẤP / GHI NHẬN TÍCH CỰC

- **T4 (Thấp):** `lib/portal/session.ts` `secret()` cảnh báo khi `NEXTAUTH_SECRET` trống nhưng **vẫn ký bằng chuỗi rỗng** → token activeSite forge được. Đề xuất fail-closed ở production. (HMAC `active-site-token.ts` bản thân đúng, timing-safe.)
- ✅ **Secrets:** không có credential hardcode trong code production (chỉ trong test). `.gitignore` chặn `.env*`, `*.key`, `*.pem`, `*.bak`; `git ls-files` xác nhận chỉ `.env.example` được track.
- ✅ **TODO nguy hiểm:** không có TODO/FIXME/HACK liên quan bảo mật/tiền/quyền trong `app/**`.
- ✅ **IDOR portal:** mọi action portal verify ownership — `requireActiveStudent()` + `assertOwnsStudent()` (check `parentUserId`); exam/assignment/yeu-cau/transcript ràng buộc `studentId` theo con đang chọn; **studentId KHÔNG trên URL** (cookie HMAC).
- ✅ **Media/consent:** `portal/hinh-anh/page.tsx` enforce `hasMediaConsent` + `tags.some({studentId})` ngay trong query → thu hồi consent ẩn ngay.
- ✅ **Idempotency tiền:** `convertLeadToEnrollment` 1 transaction + guard `ALREADY_ENROLLED`, side-effect qua DomainEvent sau commit; `changeOrderStatusAction` có status-transition guard + transaction; voucher/stock decrement atomic.
- ✅ **Activation OTP:** `kich-hoat/_actions.ts` chống user-enumeration (trả generic), cooldown OTP, hash bcrypt.

---

## Khuyến nghị ưu tiên
1. **C1 + C2 là gốc rễ** — hoàn tất A0-04 (scopedDb áp rộng + rule `error`) + bật RBAC v2 (qua staging soát shadow log). Đây là 2 trụ bảo mật đa-cơ-sở chưa "live".
2. **C3 / T4** — guard fail-closed cho secret thiếu ở production (webhook + portal token); checklist go-live secret bắt buộc.
3. **T1** — chuẩn hoá gate về `assertCan/assertPermission` để khi bật v2 không còn điểm mù.

> Lưu ý: các lỗ C1/C2 KHÔNG phải bug mới — đó là **trạng thái chuyển dịch có chủ đích** (A0 additive, bật dần). Nhưng cần ý thức rõ khi mở rộng đa cơ sở/đa role: hiện hệ thống bảo vệ chủ yếu bằng **role gate v1**, chưa bằng **scope cơ sở runtime**.
