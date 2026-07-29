# 00 — Baseline: đo lại hiện trạng

**Ngày đo:** 28/07/2026 · **Nhánh:** `main` @ `6d2f7d9a` · **Phạm vi:** BƯỚC 0a
**Phương pháp:** chỉ đọc code + lệnh đếm tĩnh. KHÔNG chạy lệnh đụng DB, KHÔNG đọc `.env*`.
Lệnh nặng duy nhất đã chạy: `pnpm depcruise` (phân tích tĩnh, read-only).

> **Quy ước ký hiệu**
> `[QS]` = QUAN SÁT — đọc trực tiếp từ code, có `file:dòng` hoặc lệnh đếm tái lập được.
> `[SĐ]` = SUY ĐOÁN — kết luận rút ra, không có một dòng code nào phát biểu trực tiếp.
>
> **Thuật ngữ khoá (dùng thống nhất toàn bộ tài liệu series này):**
> **FRANCHISOR** = bên nhượng quyền = khối HO · **FRANCHISEE** = bên nhận nhượng quyền = cơ sở/công ty tỉnh khác.
> Trường tham chiếu: `franchisorOrgId` / `franchiseeOrgId`. **Không dùng** `franchiseId`.

---

## 1. Đối chiếu con số cho sẵn ↔ số đo lại

| # | Chỉ số | Số cho sẵn | Số đo lại | Kết quả |
|---|---|---|---|---|
| 1 | Model Prisma | ~173 | **173** | ✅ Khớp |
| 2 | Migration | ~165 | **165** | ✅ Khớp |
| 3 | Server Action | ~391 trong ~104 file | **391 trong 104 file** | ✅ Khớp (xem chú thích) |
| 4 | API route | ~52 | **52** dưới `app/api/` | ✅ Khớp (xem chú thích) |
| 5 | Thư mục domain trong `lib/` | ~66, không có `index.ts` | **66**, **0** file `index.ts` | ✅ Khớp |
| 6 | Thư mục `modules/` | chưa có | **không tồn tại** | ✅ Khớp |
| 7 | Adoption `lib/actions/factory.ts` | 0/391 | **0/391** | ✅ Khớp |
| 8 | Vi phạm depcruise | ~28, cổng luôn xanh | **28 (0 error / 28 warn)**, exit 0 | ✅ Khớp |
| 9 | scopedDb phủ | ~34/173 model | **34/173** | ✅ Khớp |
| 10 | v1 = ma trận tĩnh | 156 action × 9 role | **156 action**, nhưng **8 role** trong ma trận | ⚠️ Lệch nhẹ |
| 11 | v2 = `UserOrgRole → RoleDef → RolePermission`, 6 scopeType, ALLOW-wins | — | **đúng nguyên văn** | ✅ Khớp |
| 12 | Bug reaper DomainEvent | có | **XÁC NHẬN CÓ THẬT** | ✅ Khớp |

**Không có con số nào cho sẵn bị sai lệch đáng kể.** Bản audit trước đó chính xác.

### Chú thích 3 chỗ dễ đếm lệch

- **(3) 104 hay 105 file?** `[QS]` 104 file có directive `'use server'` **ở đầu file**; file thứ 105 (`app/(admin)/admin/users/[id]/edit/page.tsx`) dùng directive **inline trong hàm**. `grep` thô ra 105, script phân biệt top-level ra 104. Số 391 hàm `export async function` là giống nhau ở cả hai cách đếm. 1 file `'use server'` nằm ngoài `app/`: `lib/eval/session-eval-actions.ts`.
- **(4) 52 hay 58 route?** `[QS]` **52** file `route.ts` dưới `app/api/`. Tổng route handler HTTP trong `app/` là **58** — 6 handler PDF/export nằm trong route group (`app/(admin)/admin/exams/import-word/*`, `app/(admin)/admin/payments/[id]/phieu-thu/route.ts`, 3 handler PDF của `app/(teacher)/`). Dùng số nào cũng được, **nhưng phải ghi rõ mẫu số**.
- **(10) 9 role hay 8?** `[QS]` `enum Role` có **9** giá trị (`prisma/schema.prisma:18-28`), nhưng chỉ **8** xuất hiện trong ma trận `PERMISSIONS`; `PARENT` không có mặt ở bất kỳ action nào — có chủ đích (`lib/auth/permissions.ts:24-27`). Nói "156 × 9" là đúng về hình dạng bảng, sai về số role thực sự được cấp quyền admin.

---

## 2. Con số bổ sung (cần cho các bước sau)

| Chỉ số | Giá trị | Bằng chứng |
|---|---|---|
| Enum Prisma | 126 | `grep -cE '^enum ' prisma/schema.prisma` |
| Dòng `schema.prisma` | 5.434 (1 file, **chưa** tách multi-file) | `wc -l` |
| Model có field `centerId` | **44** | node parse schema |
| Model có field `orgUnitId` | **30** (26 model có **cả hai**) | node parse schema |
| Model không có cả hai | **125** | node parse schema |
| Action trong ma trận v1 | **156** | `lib/auth/permissions.ts:270`, `:671` |
| RoleDef seed | **14** | `prisma/seed-roles.ts:29` |
| RolePermission seed | **301** dòng | đếm regex trong seed |
| Phân bố `scopeType` trong seed | **280 GLOBAL** / 18 CENTER / 1 CLASS / 1 ASSIGNED / 1 CHILDREN | đếm regex `prisma/seed-roles.ts` |
| Call-site qua `checkPermission` họ hàm | **512** trên 263 file (admin 459, api 24, teacher 16, lib 13, portal 0) | node scan |
| Call-site gọi thẳng `can()/assertCan()` v1 | **6** (4 file) | grep |
| Call-site gác bằng **role thô** (`hasRole`/`isSuperAdmin`/…) | **125** | node scan import từ `@/lib/auth/permissions` |
| Unit test Vitest | 119 file (`lib/` 117, `components/` 2) | `vitest.config.ts` include |
| E2E Playwright | 98 file `.spec.ts` (`tests/e2e` 88 + `tests/manual` 10) | find |
| Playwright config | 14 file; CI chỉ chạy **2** (`playwright.config.ts` + job `e2e-a0`) | `.github/workflows/ci.yml:174` |
| Cron Vercel | 15, **không có** cron nào cho shadow/RBAC | `vercel.json` |

> ⚠️ **Bẫy đếm:** `find . -name "*.spec.ts"` ra **234** vì `.claude/` chứa 136 file `.spec.ts` thuộc tài liệu skill. Số test thật = **98**.

---

## 3. Vì sao cổng CI xanh dù có 28 vi phạm

`[QS]` Đây **không** phải sơ suất mà là quyết định có văn bản.

- Cả 28 vi phạm đều thuộc rule `app-no-direct-prisma` (`app/**` → `lib/db.ts`), severity **`warn`** — `.dependency-cruiser.cjs:56`, kèm comment `:50-55` *"GIỮ warn có chủ đích — KHÔNG flip error… ESLint mới là cổng chặn"*.
- depcruise chỉ exit ≠ 0 khi có vi phạm severity `error`. CI chạy `pnpm lint:boundaries` tại `.github/workflows/ci.yml:77`.
- 4 rule severity `error`: `no-circular`, `no-unresolvable`, `not-to-test`, `module-no-deep-cross-import`. **Rule thứ 4 là no-op** vì chưa có `modules/` (chính comment `.dependency-cruiser.cjs:66` thừa nhận).
  → `[SĐ]` Cổng "boundaries" thực chất chỉ còn kiểm 3 thứ generic; **không có** rule kiến trúc nào của dự án đang được enforce ở mức chặn.
- Phân bố 28 warning: 12 file `(public)`/sitemap/og · 5 `api/cron` · 3 api khác · 1 `(auth)` · **4 file `(admin)`** (`report-cards/[enrollmentId]/page.tsx`, `report-cards/_actions.ts`, `leads/actions.ts`, `chuyen-lop/_actions.ts`).

---

## 4. `lib/actions/factory.ts` — chính xác hoá "0/391"

`[QS]` Kết luận "0/391 action dùng" **đúng**, nhưng bức tranh cụ thể hơn:

| Thứ | Trạng thái |
|---|---|
| `runAction()` (`lib/actions/factory.ts:89`) | 7 call-site, **toàn bộ** trong `tests/e2e/r6/action-factory.spec.ts` |
| `defineAction()` (`lib/actions/define.ts:13`) | **0 importer** — code chết 100% |
| 2 import production duy nhất | `lib/finance/refund.ts:9` và `lib/finance/debt.ts:6` — chỉ `import type { ScopedDb }` |

→ `[SĐ]` `factory.ts` hiện đóng vai "file khai type tiện tay", không phải pipeline. **Đừng coi nó là đường đi hiện tại khi lập kế hoạch.** Nó cũng gọi `can()` v2 trần (`factory.ts:116`) — nếu sau này bật lên dùng thật, nó bỏ qua cờ `RBAC_V2_ENABLED` và bỏ qua shadow-diff.

---

## 5. Trạng thái cửa sổ shadow-compare RBAC (ràng buộc #4 của đề bài)

`[QS]` Cần nắm chính xác vì **mọi đề xuất sau phải khai báo có đụng vùng này không**.

- **Cờ:** `RBAC_V2_ENABLED` mặc định **OFF** (`lib/flags.ts:7-9`; phải bằng đúng chuỗi `"true"`). Prod đang enforce **v1**.
- **`checkPermission()`** chạy **cả hai** hệ mỗi lần gọi, trả kết quả theo cờ (`lib/auth/shadow-compare.ts:27`), ghi lệch fire-and-forget vào `RbacShadowDiff` (`lib/auth/shadow-report.ts:13`).
- **Độ phủ shadow — đảo ngược giả định của đề bài:** đường `can()` phủ **rất tốt** (512 call-site qua `checkPermission` vs chỉ **6** gọi thẳng v1).
- **Nhưng lỗ phủ thật nằm chỗ khác** — 3 vùng **không bao giờ sinh dòng lệch nào**:
  1. **125 call-site gác bằng role thô** (`hasRole` 96, `hasStaffRole` 7, `hasAnyRole` 6, `isSuperAdmin` 6, `getEmployeeFieldVisibility` 4…). Không qua bất kỳ hệ `can()` nào → vô hình với shadow **và** không đổi gì khi flip.
  2. **SCORM** enforce v2 **thẳng** ngay cả khi cờ OFF — `lib/scorm/access.ts:47`, 5 file dùng. Chưa từng đi qua cửa sổ shadow.
  3. **`lib/orders/installments.ts:210,271`** gọi `assertCan` v1 trần, không theo cờ, không sinh diff — chính file gọi nó đã ghi cảnh báo (`app/(admin)/admin/orders/_components/_installment-approval-actions.ts:82-86`).
- **`280/301` dòng seed là `scopeType = GLOBAL`** (`prisma/seed-roles.ts:11-21` nói rõ: cách ly cơ sở giao cho `scopedDb`, không cho `scopeType`).
  → `[SĐ]` **"0 lệch" KHÔNG chứng minh gì cho logic scope**: các nhánh `CENTER/CLASS/OWN/CHILDREN` của `lib/auth/can.ts:17-29` hầu như không chạy trên prod. Ngoài ra `CLASS` và `ASSIGNED` xử lý **y hệt nhau** (`can.ts:27-29`) — hai tên, một logic.
- **Khoảng cách v1↔v2 hiện tại:** 42 action mất khi flip (`CENTER_MANAGER` −29, `CENTER_HR` −10, `TEACHER` −3) — **trùng khớp 100%** danh sách `INTENTIONAL` (`lib/auth/rbac-intentional.ts:18-63`) nên `rbac-parity.test.ts` xanh. Chiều ngược lại: v2 **nới thêm 3 quyền** v1 không có (`HO_ACCOUNTANT +inventory:edit`, `HO_MARKETING +honors:settings, +news:delete`) — **không** nằm trong `INTENTIONAL`.
- **Nhật ký vận hành:** `docs/ke-hoach-go-live-2607/shadow-log.md` ghi đèn xanh ngày 10/07 (CẦN XỬ LÝ = 0); từ đó tới nay **không có dòng mới trong FILE nhật ký** (18 ngày), dù cron report chạy hằng ngày (`.github/workflows/shadow-report.yml:31`). File tự mâu thuẫn: header bảng ghi 🔴 CHƯA CHẠY, mục cuối ghi đã TRUNCATE + đo 3 vòng. **Đừng dựa vào header.**
  → ⚠️ **ĐÍNH CHÍNH 29/07/2026 — đọc kỹ chỗ này, đã có người hiểu nhầm:** câu trên nói về **file `.md` không được cập nhật**, KHÔNG phải "bảng `RbacShadowDiff` không có dòng nào". `[QS]` Đo thật trên prod 29/07: bảng **có dòng liên tục 24/07 → 28/07** ⇒ **đồng hồ đang chạy, ghi được, không đứng**. Và cờ `RBAC_V2_ENABLED` **đã BẬT** trên Vercel Production ⇒ mỗi dòng diff nay là **sự việc đã xảy ra** (prod xử theo v2), không còn là dự báo. Tổng lệch: 2 nhóm, `leads:delete` 63 dòng + `students:delete` 2 dòng, **cả hai thuộc `lib/auth/rbac-intentional.ts:53-55`**, **0 dòng nới quyền**. Riêng 3 quyền v2 nới thêm mà `INTENTIONAL` không phủ (xem gạch đầu dòng trên) thì **chưa ai chạm tới** — nếu có, chúng đã hiện ra dạng `v1=false, v2=true`.

⚠️ **Quy tắc rút ra cho các bước sau:** chạy lại `prisma/seed-roles.ts` = xoá sạch + tạo lại `RolePermission` (`seed-roles.ts:554-557`) = **đổi mapping** = phải TRUNCATE lại đồng hồ shadow. Bất kỳ đề xuất nào chạm `seed-roles.ts`, `hasRole`, hoặc `lib/scorm/access.ts` đều đụng vùng shadow.

---

## 6. Bug DomainEvent reaper — XÁC NHẬN, và nặng hơn báo cáo

`[QS]` **Bug có thật, đúng như mô tả.**

- `lib/events/dispatcher.ts:19-22` — reaper lọc `{ status: "PROCESSING", createdAt: { lt: cutoff } }` với `cutoff = now − 5 phút` (`:17-18`).
- Model `DomainEvent` có **đúng 10 field**, **không có** `claimedAt`/`lockedAt`/`updatedAt` (`prisma/schema.prisma:420-434`). Migration gốc `20260608040000_add_domain_event/migration.sql:4-16` cũng chỉ 10 cột; không migration nào thêm cột lock về sau.
- `processedAt` chỉ ghi khi outcome = DONE (`dispatcher.ts:68`), không ghi lúc claim → không dùng thay được.
- `createdAt` = **thời điểm sinh event**, không phải thời điểm claim → event đủ 5 phút tuổi bị reap **ngay khi vừa được claim**.
- Cron `/api/cron/dispatch-events` chạy **mỗi phút** (`vercel.json:20-23`), reap rồi dispatch **trong cùng 1 request** (`route.ts:14-15`). Batch = **50** (`dispatcher.ts:35`), xử lý **tuần tự** (`:48`).
- Dispatcher mặc định **BẬT** trên prod (`lib/flags.ts:29-32`).
- **Không có test nào phủ `reapStuckEvents`** — grep `reapStuck|reaped` trong `tests/` → 0.

**Phản biện đã chỉnh 3 điểm so với mô tả gốc:**

1. `[QS]` **Backlog > 50 không phải điều kiện cần lẫn đủ.** Điều kiện chính xác: event còn `PROCESSING` tại một tick cron mà `now − createdAt > 5'`. Handler chậm (>5') bị cắt **dù chỉ có 1 event**. Backlog chỉ là chất xúc tác (event nằm PENDING lâu → vừa claim đã quá tuổi).
2. `[QS]` **Có đường xử lý đôi THỨ HAI, không cần reaper**: `app/(admin)/admin/scorm/_actions.ts:225` gọi thẳng `onScormUploaded(...)` inline trong khi event `scorm.uploaded` vẫn PENDING trong bảng (publish ở `:196-200`, không hề set DONE) → cron có thể claim và chạy song song. Đang được UI dùng thật (`scorm-manager.tsx:152`, `lesson-scorm-upload.tsx:70`).
3. `[QS]` **Hai lỗi phụ cùng chỗ:** bước ghi kết quả cuối (`dispatcher.ts:68`, `:72`) chỉ `where: { id }`, **không** guard theo status như bước claim (`:50-51`) → instance cũ ghi đè instance mới. Và `attempts = ev.attempts + 1` tính từ ảnh chụp lúc fetch batch (`:64`), không dùng `increment` → lost update, ngân sách `maxAttempts` sai.

**Mức thiệt hại — tin tương đối tốt:** `[QS]` **0 handler nào đụng tiền / đơn hàng / enrollment.** Quét toàn bộ `lib/_handlers` + `lib/events/handlers` + `lib/crm/_handlers` → 25 lời ghi, toàn bộ là `notification.upsert` / `staffNotification.upsert` / `scormPackage.update`. 13/15 module handler idempotent. Hai module **không** idempotent:

- `lead.converted` → `enqueueEmail` = `db.emailQueue.create` trần, không dedupe (`lib/email/queue.ts:32`) → **gửi 2 email xác nhận**.
- `scorm.uploaded` → guard đầu handler chỉ bỏ qua `TESTING/PUBLISHED/ARCHIVED`, **không** bỏ qua `PROCESSING` (`lib/events/handlers/scorm-ingest.ts:110-116`) → 2 instance ghi tranh `entryCursor`, và `publishAndSwapLessonMaterial` (`lib/scorm/publish.ts:26-38`) có thể **xoá gói mới đã PUBLISHED**.

**Outbox chưa đóng:** `[QS]` `publishEvent()` có nhận `tx` (`lib/events/publish.ts:11-16`), nhưng **chỉ 15/26 điểm gọi thực sự chạy trong transaction**. 10 điểm gọi hiển nhiên ngoài tx (`convert-lead-v2.ts:265,270` · `convert-lead.ts:131` · `makeup/service.ts:52` · `eval/rounds.ts:58` · `kich-hoat/_actions.ts:94` · `sessions/[id]/_actions.ts:144,269` · `scorm/_actions.ts:196` · `api/admin/scorm/confirm/route.ts:58`), cộng `conversation/service.ts:64` vốn nhận `tx = undefined` ở cả 2 call-site. Crash sau commit = **mất event**; riêng `lead.converted` vừa ngoài tx vừa không có `dedupeKey` → mất luôn email xác nhận, không dò lại được.

---

## 7. Mâu thuẫn tài liệu phát hiện được (sửa trước khi trích dẫn)

| Nơi | Nói gì | Thực tế |
|---|---|---|
| `.dependency-cruiser.cjs:52` | ESLint allowlist có "25 exception hợp lệ" | `lib/eslint/db-import-allowlist.mjs` chỉ còn **3** entry. (CLAUDE.md ghi đúng.) |
| `lib/auth/permissions.ts:4` | "70+ actions" | **156** |
| `lib/auth/menu-permissions.ts:51` | "~120 action" | **156** |
| `lib/auth/actor.ts:191` | "cây OrgUnit cache cross-request" | Trái với chính comment `:10-15` cùng file: REQ-02 đã **REVERTED**, cây đọc **trần mỗi request**, không cache |
| `docs/ke-hoach-go-live-2607/shadow-log.md` header | 🔴 CHƯA CHẠY / 0 ngày sạch | Mục 10/07 cùng file: đã TRUNCATE + đo 3 vòng + CẦN XỬ LÝ = 0 |

`[SĐ]` Ai đọc comment để ước lượng chi phí RBAC sẽ sai ~30%.

---

## 8. Không đo được (do ràng buộc chỉ-đọc / cấm đụng DB)

Ba con số dưới đây **quyết định mức nghiêm trọng** của nhiều kết luận ở `00-scope-gap.md`, nên đo bằng query **READ-ONLY** trước khi chốt BƯỚC 0:

1. Trạng thái backfill `centerId` thực tế trên prod cho 5 model mới flip vào `SCOPED_MODELS` (`Enrollment`, `ClassSession`, `Attendance`, `ReportCard`, `ConversationMessage`). `centerId` NULL trên các model này = record **vô hình** với actor cấp cơ sở (`lib/db-scope.ts:254`).
2. Có bao nhiêu `Attendance` học bù đang mang `centerId` **khác** `Student.centerId` — số này quyết định mức nghiêm trọng của mâu thuẫn ngữ nghĩa "record thuộc cơ sở nào" (xem `00-scope-gap.md` §6).
3. Số dòng `UserOrgRole` / `RoleDef` / `RolePermission` **thực tế** trên prod, và giá trị env `RBAC_V2_ENABLED` thật trên Vercel. Mọi con số RBAC ở trên là đếm **từ code seed**, có thể khác prod vì role sửa được qua UI `/admin/users/[id]/org-roles`.

Ngoài ra: `[QS]` nhật ký `shadow-log.md` ghi 3 UserOrgRole (09/07) + 17 dòng (10/07) ≈ **19–20**; ghi nhớ phiên trước nói **23**. Hai con số không khớp — cần đếm lại từ DB, không đếm được từ code.
