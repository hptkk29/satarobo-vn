# 03 — KẾ HOẠCH FIX: ĐỒNG BỘ LUỒNG LMS R7 ⟷ ERD MỚI (erd-fix-p0)

> ⚠️ **ĐÃ BỊ THAY THẾ** bởi [`04-LMS-master-fix-plan.md`](./04-LMS-master-fix-plan.md) (bản hợp nhất 3 tài liệu). File này giữ làm lịch sử; nội dung đã hấp thụ vào W0–W2 của bản 04.

**Loại:** Kế hoạch sửa lỗi đối chiếu (cross-cutting fix plan) — đã qua rà BA.
**Nhánh thực thi:** `full-R7` (sau khi merge `main`). **KHÔNG apply migration lên Supabase** (giữ guardrail ERD).
**Trạng thái:** 🟡 CHỜ DUYỆT — chưa sửa code.
**Ngày:** 2026-06-18. **Nguồn đối chiếu:** audit 4 trục (soft-delete · partial-unique · onDelete/CHECK · state-machine/RLS) trên code `main` sau pull.
**Truy vết:** Doc 15 §2 (RBAC/scopedDb) · §"atomic vs event" · phase R7-04/05/07/08 · test T2/T4/T6/T9.

---

## 0. Bối cảnh (as-is) — vì sao có kế hoạch này

Hai nhánh đã **phân kỳ**, mỗi nhánh giữ thứ nhánh kia thiếu:
- **`main`** = R7 (đã merge PR #15/16/17) **+ erd-fix-p0** (RLS, soft-delete `{Order,Payment,Receipt,Enrollment}`, onDelete RESTRICT tài chính, partial-unique Enrollment, CHECK constraints, timestamptz, state-machine guard H4).
- **`full-R7`** = R7 **+ commit `5397839`** (fix LMS P0–P3: `getParentBilling`, advisory-lock học bù, `payment.rejected`, `changeStudentCode`, 17 notif, audit hợp nhất) — **CHƯA có trên `main`**.

ERD-fix đã **tự vá phần lớn** điểm giao (enrollment dedup → `findFirst`+`Serializable`+`deletedAt`; finance delete → soft-delete; clamp giá; soft-delete top-level cho debt/billing/learning). Còn lại **4 nhóm** cần xử lý + **1 merge**.

**Quyết định đã chốt (user):** merge `main → full-R7`, làm tiếp trên `full-R7`.

---

## 1. Kết quả thăm dò merge (đã verify, reversible — đã abort)

| Hạng mục | Kết quả |
|---|---|
| `schema.prisma` | ✅ **Auto-merge sạch & đúng** — đủ R7 (Scorm/CoinRule/ReportCard/Eval/Homework/TrialClassV2) **lẫn** erd-fix (`deletedAt`×17, `onDelete: Restrict`×10, `@@index([studentId,classId])`, `@@unique` cũ = 0). KHÔNG lặp lại mất field R7 như `cc3c493`. |
| File conflict | Chỉ **2**: `app/(admin)/admin/enrollments/_actions.ts`, `app/(admin)/admin/sessions/[id]/_actions.ts` |
| Tổng file đổi | 65 (đa số auto-merge) |

---

## 2. Phát hiện (đã rà BA) — yêu cầu fix theo US/AC

### FIX-1 · Soft-delete rò rỉ qua nested `include`/`_count` — **HIGH**

**US-LMS-1** · Là **quản trị viên/kế toán**, tôi muốn **mọi nơi đếm/hiển thị Enrollment & Receipt loại bỏ bản ghi đã xóa mềm** để **sĩ số, công suất lớp và chứng từ phản ánh đúng thực tế**.
- Ưu tiên: **Must** · Loại: FR + NFR(reliability/PII)
- **Gốc kỹ thuật:** hook `lib/db.ts` chỉ lọc `deletedAt:null` ở top-level; nested `include`/`_count` KHÔNG được lọc (`lib/soft-delete.ts:5`).
- **AC1 (sĩ số):** Given 1 Enrollment đã `deletedAt != null`, When đếm sĩ số/công suất lớp, Then **không** tính bản ghi đó (không cho vượt `maxCapacity`).
- **AC2 (chứng từ):** Given Receipt đã xóa mềm, When confirm/reject Payment trả `receipts`, Then chỉ trả Receipt còn sống.
- **AC3:** Không phá "Thùng rác" — call-site cố ý đọc trash vẫn override bằng truyền `deletedAt` tường minh.
- **Điểm sửa (6):** `lib/finance/payment.ts:101,182` · `app/(admin)/admin/classes/page.tsx:141` · `app/(admin)/admin/leads/actions.ts:469` (capacity trong `convertLeadV2`) · `app/(admin)/admin/leads/[id]/page.tsx:129` · `app/(admin)/admin/trial-classes/page.tsx:43` · `app/(admin)/admin/dashboard/_components/teacher-dashboard.tsx:20`.
- **Truy vết:** Doc 15 §atomic · R7-04/05/08 · Test T2 (RBAC/scope)/T6 (finance).
- ✅ Đã đúng (không sửa): `lib/finance/debt.ts:120,132` · `lib/portal/billing.ts:105–119` · `lib/portal/learning.ts:28`.

### FIX-2 · State-machine buổi học: chuẩn hoá guard cho buổi offline — **MED** *(hạ từ HIGH)*

**Đính chính mức độ sau rà BA:** 2 đường hoàn tất buổi là **2 phiên bản gated bởi flag `SESSION_LIFECYCLE_V2`**, KHÔNG chạy đồng thời → **không có va chạm runtime, không buổi nào bị hoàn tất sai**. Đây là **lệch chuẩn/governance**, không phải data-bug.
- **Đường A** (`/admin/sessions/[id]`, flag OFF mặc định): checklist + `startSession`→IN_PROGRESS→COMPLETED. Guard `canCompleteSession` **đúng cho A**.
- **Đường B** (`/admin/classes/[id]/session`, flag ON): R7 offline `SCHEDULED→COMPLETED` qua `classifySessionForComplete` — **không đi qua guard chuẩn**.

**US-LMS-2** · Là **giáo viên dạy offline**, tôi muốn **bấm "Hoàn tất buổi" ngay từ trạng thái SCHEDULED** (không cần bước "Bắt đầu buổi") để **đúng thực tế lớp offline**, đồng thời **trạng thái buổi vẫn được một guard chuẩn kiểm soát**.
- Ưu tiên: **Should** · Loại: FR
- **AC1:** Given buổi `SCHEDULED`, When GV hoàn tất (flag B), Then `SCHEDULED→COMPLETED` hợp lệ qua guard chuẩn.
- **AC2:** Given buổi `CANCELLED`, When hoàn tất, Then **chặn**.
- **AC3:** Given buổi `COMPLETED`, When hoàn tất lại, Then **idempotent** (không phát lại `session.taught`).
- **AC4:** Đường A (flag OFF) **không đổi hành vi** — UI vẫn start→complete; nới guard không tạo lối tắt mới cho A (UI A không có nút complete-khi-chưa-start).
- **Giải pháp (đề xuất):** thêm `SCHEDULED→COMPLETED` vào `SESSION_TRANSITIONS` (`lib/sessions/status.ts`) để guard model **cả 2 nhánh hợp lệ**; cho `lib/lms/session-lifecycle.ts:completeSession` gọi `canCompleteSession()` (đang dùng `classifySessionForComplete` riêng — giữ classify cho CANCELLED/idempotent, thêm guard cho tính hợp lệ).
- **Truy vết:** R7-07 · Test T4 (LMS lifecycle).
- **TBD:** xác nhận hướng nới guard (vs ép R7 đi qua IN_PROGRESS) — **owner: user**, hạn: trước khi thực thi Phase C.

### FIX-3 · Enrollment đổi status không qua `canTransition` — **MED**

**US-LMS-3** · Là **hệ thống**, tôi muốn **mọi thay đổi `Enrollment.status` đi qua guard `canTransition`** để **không bao giờ ghi transition sai (vd COMPLETED→PENDING)**.
- Ưu tiên: **Should** · Loại: NFR(reliability)/Inverse
- **AC1:** Given transition không hợp lệ theo `ENROLLMENT_TRANSITIONS`, When code set status, Then bị chặn (throw/fail) trước khi ghi DB.
- **AC2:** Transition hiện hành (CONFIRMED/PENDING→STUDYING, PAUSED→STUDYING) vẫn chạy bình thường.
- **Điểm sửa (2):** `lib/lms/assign.ts:140` (→STUDYING) · `app/(admin)/admin/students/_actions.ts:555` (→STUDYING). ✅ `enrollments/_actions.ts:526` đã guard đúng.
- **Phụ:** sửa comment lỗi thời `lib/lms/assign.ts:166` ("unique(studentId,classId)" → "partial unique … WHERE deletedAt IS NULL").
- **Truy vết:** Doc 15 §atomic · R7-07 · Test T4.

### FIX-4 · `adjustPayment` thiếu chặn `amount ≤ 0` — **MED**

**US-FIN-4** · Là **kế toán**, tôi muốn **điều chỉnh thanh toán bị chặn sớm khi số tiền ≤ 0 với thông báo tiếng Việt** để **không nhận lỗi CHECK thô từ DB và dữ liệu đúng nghiệp vụ**.
- Ưu tiên: **Should** · Loại: FR + NFR(usability)
- **Rà BA:** `adjustPayment` tạo bản ghi `ADJUSTED` mang **giá trị đã sửa (dương)**; hoàn tiền âm là việc của `refundPayment` riêng; frontend đã ép `positive`. CHECK DB `payment_amount_nonzero` chỉ chặn `=0`.
- **AC1:** Given `amount ≤ 0`, When gọi `adjustPayment`, Then `fail("Số tiền điều chỉnh phải lớn hơn 0")` — **không** chạm DB.
- **AC2:** `recordPayment`/`refundPayment` không đổi (đã đúng).
- **Điểm sửa:** `lib/finance/payment.ts:257–258` (thêm guard sau khi tính `amount`).
- **Truy vết:** R7-04 · Test T6 (finance) · CHECK `payment_amount_nonzero` (migration `20260617040000`).

---

## 3. Đã xác nhận KHỚP (không cần sửa) — chống gold-plating

- **Partial-unique Enrollment:** không còn dùng compound `studentId_classId`; đã `findFirst`+`Serializable`+`deletedAt`; ghi danh lại sau soft-delete hợp lệ. → **không vỡ compile/runtime**.
- **onDelete RESTRICT:** không còn hard-delete tài chính; `deleteEnrollmentAction`/`deleteStudent` đã soft-delete.
- **CHECK `finalPrice≥0` / `Order.totalAmount≥0` / voucher `%[1,100]`:** đã clamp/validate (`pricing.ts:51`, `orders/_actions.ts:188`, `validators/voucher.ts:21`).
- **RLS** ENABLE-only (Prisma owner OK); SCORM asset qua `db.scormPackage` → OK. **timestamptz** Prisma UTC → OK.

---

## 4. Kế hoạch thực thi (theo phase, verify mỗi phase)

| Phase | Việc | File chính | Test/Check |
|---|---|---|---|
| **A · Merge** | Hoàn tất merge `main→full-R7`; giải 2 conflict **additive** (giữ CẢ guard H4 erd-fix LẪN audit/tx của R7); verify schema còn đủ R7+erd-fix; `typecheck`+`build` | `enrollments/_actions.ts`, `sessions/[id]/_actions.ts` | typecheck/build xanh; grep schema markers |
| **B · Soft-delete (FIX-1)** | Thêm `deletedAt:null` vào 6 nested where/_count | 6 file ở FIX-1 | T2/T6; e2e capacity + payment |
| **C · Session guard (FIX-2)** | Nới `SESSION_TRANSITIONS` cho `SCHEDULED→COMPLETED`; `session-lifecycle.completeSession` gọi `canCompleteSession` | `lib/sessions/status.ts`, `lib/lms/session-lifecycle.ts` | T4; unit `sessions/status.test.ts` + e2e session-lifecycle |
| **D · Guard nhỏ (FIX-3, FIX-4)** | `canTransition` cho 2 chỗ set status; chặn `amount≤0` trong `adjustPayment`; sửa comment `assign.ts:166` | `lib/lms/assign.ts`, `students/_actions.ts`, `lib/finance/payment.ts` | T4/T6 |
| **Verify cuối** | `pnpm typecheck && lint && build` + e2e r7 (scoop Postgres local, `R7_SKIP_WEBSERVER=1`) | — | toàn bộ xanh; r7 ≥ baseline |

**Ghi chú vận hành:**
- Migration erd-fix theo merge về dạng **file** — **KHÔNG** `migrate deploy` lên Supabase (ERD chưa chốt; guardrail).
- Merge xong: nhánh `full-R7` sẽ có cả ERD mới + fix LMS P0–P3 (hợp nhất 2 lớp lệch ở §0).

---

## 5. Rủi ro & phòng ngừa

| Rủi ro | Phòng ngừa |
|---|---|
| Merge làm mất field R7 (tiền lệ `cc3c493`) | Đã verify schema auto-merge đủ markers; sau merge **grep lại** trước khi commit |
| Giải 2 conflict bỏ mất guard H4 hoặc audit R7 | Resolve **additive** — giữ cả hai; diff review từng hunk |
| Nới guard session phá Đường A | AC4: UI A không có lối complete-khi-chưa-start → không đổi UX; chỉ thêm tính hợp lệ |
| Vá soft-delete phá tính năng "Thùng rác" | Chỉ thêm `deletedAt:null` ở nơi đếm/hiển thị live; override trash vẫn dùng `deletedAt` tường minh |
| Apply nhầm migration lên Supabase | Tuyệt đối không `migrate deploy`; chỉ file |

## 6. Guardrails Sata Robo — đã soi (không vi phạm)

scopedDb (không hardcode center) ✓ · RBAC động/ALLOW-wins (không đụng) ✓ · Privacy HS (soft-delete giúp ẩn đúng, không lộ studentId) ✓ · Atomic vs Event (tiền/enrollment vẫn trong tx; không thêm side-effect dính chùm) ✓ · không đưa lại scope đã loại ✓.

## 7. TBD (owner + hạn)

1. **Hướng FIX-2** (nới guard vs ép IN_PROGRESS) — owner: **user** — hạn: trước Phase C.
2. **Apply migration R7+erd-fix lên Supabase** — owner: **user/ops** — hạn: sau khi ERD chốt (ngoài phạm vi kế hoạch này).
