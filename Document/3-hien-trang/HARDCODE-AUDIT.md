# Báo cáo rà soát HARDCODE toàn hệ thống — Sata Robo VN

> **Ngày:** 2026-06-13 · **Phạm vi:** toàn repo (Frontend `app/(public|admin|portal)`, `components/` · Backend `lib/`, `app/api/`, `prisma/`).
> **Mục tiêu:** liệt kê mọi nơi đang set cứng (const / mảng / magic number / dữ liệu) đáng ra phải đọc từ DB hoặc cấu hình động, kèm phân loại **FRONTEND / BACKEND** và đề xuất nguồn thay thế.
> **Cách dùng:** ưu tiên 🔴 cao → 🟠 trung → 🟡 thấp. Mỗi mục có `file:dòng`.

---

## 0. TL;DR — vì sao "HO đã thêm mà Frontend không hiện"

**Đây là lỗi hardcode điển hình nhất.** Trạng thái DB hiện tại:

| Bảng | Có HO? | Ghi chú |
|---|---|---|
| `OrgUnit` | ✅ Có (`code=HO`, `type=HO`, `centerId=null`) | Cây tổ chức ROOT→HO/CS1/CS2 đã đúng |
| `Center` | ❌ KHÔNG | Chỉ có 2 row: CS1, CS2 |

**Nguyên nhân gốc:** Toàn bộ Frontend (và phần lớn Backend) chọn/lọc cơ sở bằng cách đọc bảng **`Center`** hoặc danh sách cứng `["CS1","CS2"]` — **không hề biết tới `OrgUnit`**. HO là OrgUnit (Hội sở) nhưng không phải Center → mọi dropdown/filter cơ sở đều bỏ sót HO.

→ **Hướng sửa đúng:** Frontend phải đọc cơ sở từ **OrgUnit tree** (qua `lib/org/*` / `scopedDb`), không từ bảng `Center` cũ hay list cứng. Mở CS3/CS4… về sau cũng chỉ cần thêm OrgUnit, không sửa code.

---

## 1. 🔴 HARDCODE TỔ CHỨC / CƠ SỞ (HO/CS1/CS2)

> Vi phạm nguyên tắc "KHÔNG hardcode danh sách center — đi qua OrgUnit tree" (CLAUDE.md).

### 1.1 Frontend — danh sách cơ sở set cứng

| File:dòng | Hiện trạng | Nên đọc từ |
|---|---|---|
| `lib/locations.ts:26-84` | `SATA_ROBO_LOCATIONS` — const 2 cơ sở (địa chỉ, hotline, zalo, giờ làm). **Không có HO.** | `OrgUnit`/`Center` DB + `SystemSetting` (thông tin công ty) |
| `components/legacy-laptrinhrobot/_data/locations.ts:1-53` | **Trùng lặp** lib/locations.ts (CS1/CS2 cứng) | Hợp nhất về 1 nguồn DB |
| `components/legacy-laptrinhrobot/Hero.tsx:15-18` | `const centers = [...]` 2 cơ sở cứng ngay trong component | `lib/locations` (đã là cứng) → DB |
| `components/legacy-laptrinhrobot/_data/faqs.ts:72-73` | Địa chỉ "211 Nguyễn Hữu Thọ" / "114 Hoàng Diệu" cứng trong FAQ | DB |
| `app/(public)/lien-he/page.tsx:46-50` | Render 2 nút "Gọi CS1/CS2" từ `SATA_ROBO_CONTACT_CENTERS` | DB |
| `app/(admin)/admin/leads/_components/lead-form.tsx:95` | Text "Chưa xác định (chia đều 2 cơ sở)" | động theo số center thực |
| `app/(admin)/admin/leads/cau-hinh-chia/page.tsx:37` | "...chia đều CS1/CS2 trước" | động |
| `app/(admin)/admin/leads/bao-cao-chuyen/page.tsx:88-89` | Filter cứng `r.from==="CS1" && r.to==="CS2"` (và ngược lại) | thống kê từ center codes thực |
| `app/(admin)/admin/leads/import/page.tsx:68` | Help text "Cơ sở: để trống / CS1 / CS2" | động |

### 1.2 Backend — query/validate giới hạn CS1/CS2

| File:dòng | Hiện trạng | Nên đọc từ |
|---|---|---|
| `lib/lead/auto-assign.ts:131-134` | `db.center.findMany({ where: { code: { in: ["CS1","CS2"] } } })` | tất cả center `isActive` (hoặc OrgUnit subtree) |
| `app/api/admin/import/leads/route.ts:38` | `code: { in: ["CS1","CS2"] }` khi resolve center import | tất cả center |
| `lib/lead/import.ts:14,47-48` | Cột import "Cơ sở (CS1/CS2)" + validate chỉ chấp nhận CS1/CS2 | sinh động từ center active |
| `lib/lead/assign-strategy.ts:45` | Comment + logic giả định "chia đều 2 cơ sở" | đếm center động |
| `lib/data/job-options.ts:49` | Địa chỉ "211 Nguyễn Hữu Thọ…" trong `HR_CONTACT` | DB |

### 1.3 Seed (chấp nhận hardcode, nhưng cần biết)

| File:dòng | Hiện trạng |
|---|---|
| `prisma/seed.ts:15-37` | `centersData` cứng CS1/CS2 (name/address/phone/email) — **KHÔNG seed Center cho HO** ⇒ gốc lỗi mục 0 |
| `prisma/seed-orgunit.ts:23-27` | `UNITS` cứng HO/CS1/CS2 (seed đúng, nhưng nên tách config) |

> **Khắc phục cốt lõi (mục 0):** thay mọi center-picker Frontend bằng nguồn OrgUnit; hoặc nếu vẫn dùng `Center`, phải tạo Center-row/đại diện cho HO. Khuyến nghị: chuẩn hoá 1 helper `getSelectableOrgUnits(actor)` đọc OrgUnit tree (đã có `lib/org/org-tree.ts`).

---

## 2. 🔴 HARDCODE QUYỀN / ROLE (nên dùng `can()` thay vì tên role) — ✅ ĐÃ XỬ LÝ (Đợt 4)

> Kiến trúc đích: RBAC động (`RoleDef`/`RolePermission`) + `can(actor, action)`. KHÔNG check theo TÊN role. (~75 file vi phạm.)
>
> **✅ Đợt 4 (matrix = source of truth):** ~70 file đã chuyển `ALLOWED_ROLES`/`role === "..."` → `can()` / `hasRole()` / `hasAnyRole()`. Xoá file chết `lib/permissions.ts` (role cũ MANAGER/SALES, không ai import). **Đổi hành vi có chủ đích** (matrix thắng): reports/transcript|certificate|student-progress bỏ TEACHER + thêm MARKETING/ACCOUNTANT (`students:view-all`); course-packages thêm MARKETING (`course-packages:edit`); teachers-mgmt thêm HR (`employees:edit`). **GIỮ nguyên** (không phải actor-gate): check role của record đích trong `users/*` (last-super-admin), `nhan-su/actions.ts` VALID_ROLES (Zod enum), `classes/_actions.ts` SUBMIT/APPROVE_ROLES (đã dùng `hasAnyRole`, chưa có action khớp submit/approve), nhãn hiển thị (`class-form` "(QL)", `weekly-schedule` assistant).

### 2.1 Mảng `ALLOWED_ROLES` cứng (Frontend pages + Backend actions) — ~20 file

Mẫu lặp lại: `const ALLOWED_ROLES = ["SUPER_ADMIN","CENTER_MANAGER","TEACHER"]` rồi `.includes(session.user.role)`:

- `app/(admin)/admin/assignments/{page,new/page,[id]/edit/page}.tsx` + `_actions.ts:11`
- `app/(admin)/admin/exams/{page,new/page,[id]/builder/page}.tsx`
- `app/(admin)/admin/questions/{page,new/page,[id]/edit/page}.tsx`
- `app/(admin)/admin/curriculums/{page,new/page,[id]/edit/page}.tsx`
- `app/(admin)/admin/documents/{page,new/page,[id]/edit/page}.tsx`
- `app/(admin)/admin/enrollments/page.tsx`
- `app/(admin)/admin/inventory/{items,audit}/page.tsx`

→ **Thay bằng** `can(session.user, "assignments:create")` … (action tương ứng).

### 2.2 Check `role === "..."` rải rác — ~40 file (trích các điểm chính)

| File:dòng | Hiện trạng | Nên dùng |
|---|---|---|
| `app/(admin)/admin/sessions/[id]/_actions.ts:25-27` | 3× `if (user.role === "...")` trong `canManageSessionClass()` | `can(user, "sessions:edit")` |
| `app/(admin)/admin/students/[id]/_actions.ts:16,22,25` | `canAssessStudent()` 3× role check | `can(user, "students:edit")` |
| `app/(admin)/admin/classes/[id]/_actions.ts:34` | `if (role === "TEACHER" && cls.teacherId !== …)` | `can()` + check assignment |
| `app/(admin)/admin/teachers/_actions.ts:12,22` | `MANAGER_ROLES = [...]` + `role === "CENTER_MANAGER"` | `can(user,"employees:edit")` |
| `app/(admin)/admin/cham-cong/lich-ca/{page,_actions}.ts:23` | `if (role === "PARENT") chặn` | `assertCan(user,"hr_attendance:checkin")` |
| `app/(admin)/admin/cham-cong/checklist-co-so/{page,_actions,tong-quan}.ts:29-35` | `role === "SUPER_ADMIN" || roles?.includes(...)` | `hasRole()` / `can()` |
| `app/(admin)/admin/course-packages/{page,new,[id]/edit}.tsx:8-13` | `canManageCoursePackages()` = `role === "SUPER_ADMIN" || "CENTER_MANAGER"` | `can(role,"course-packages:edit")` |
| `app/(admin)/admin/honors/{page,timeline}.tsx:19-22` | `canDelete = role === "SUPER_ADMIN"` | `can(user,"honors:delete")` |
| `app/(admin)/admin/leads/page.tsx:96` · `app/api/admin/leads/export/route.ts:73` | `isMarketing = role === 'MARKETING'` | `hasRole()` / `can("leads:view-all")` |
| `app/(admin)/admin/students/[id]/edit/page.tsx:99-100` | `role === "SUPER_ADMIN" || (role === "CENTER_MANAGER" && centerId===…)` | `can(user,"students:edit")` + scope |
| `app/(admin)/admin/{teachers,trials,classes/[id]/progress,nhan-su/[id]/edit,users/...}` | nhiều `role === "..."` | `hasRole()` / `isSuperAdmin()` / `can()` |

### 2.3 Nhãn/màu role TRÙNG LẶP (vi phạm single-source `lib/labels.ts`)

| File:dòng | Hiện trạng | Nên |
|---|---|---|
| `components/admin/topbar.tsx:21-30` | `ROLE_LABELS` hardcode lại | `import { ROLE_LABELS } from "@/lib/labels"` |
| `app/(admin)/admin/users/_components/role-badge.tsx:3-12` | `ROLE_LABELS` + `ROLE_COLORS` cứng | dùng `lib/labels` + thêm `ROLE_COLORS` vào đó |
| `components/admin/nhan-su/change-role-dialog.tsx:17-25` | `ROLE_OPTIONS` cứng | helper `getRoleOptions()` chung |

> **ĐÚNG (không cần sửa):** `lib/auth/permissions.ts` (matrix `PERMISSIONS` — cấu hình, 1 chỗ); `lib/auth.ts:migrateLegacyRole` (shim tạm).

---

## 3. 🟠 HẰNG SỐ NGHIỆP VỤ SET CỨNG (nên đưa vào SystemSetting)

> Đã có hạ tầng `lib/settings/registry.ts` (R6-A). Nhiều tham số vẫn là hằng số trong code.

### 3.1 ĐÃ CÓ setting nhưng call-site CHƯA wire

| File:dòng | Hằng số | Setting đã có |
|---|---|---|
| `lib/students/renewal.ts:16,123` | `NEAR_END_THRESHOLD = 5` | `student.nearEndThreshold` (chưa gọi `getSetting`) |
| `lib/shifts.ts:43` | `d >= 25 && d <= 28` (cửa sổ đăng ký ca) | `shift.proposalWindow` |
| `lib/crm/commission.ts:10-17` | `DEFAULT_RATES` + `MAX_TOTAL_RATE` | `CommissionRateConfig` (R6-B1 — wire khi sinh statement) |

### 3.2 CHƯA có setting — đề xuất thêm key (BACKEND)

| File:dòng | Hằng số | Đề xuất key |
|---|---|---|
| ~~`lib/crm/sla.ts:8-14`~~ ✅ wired (Dot 3) | SLA-0..4 (5'/4h/30'/3h/2 ngày) | `crm.sla.*` (5 key phút, `loadSlaThresholds()`) |
| `lib/crm/lead-qualify.ts:15` · `lib/lead/dedup.ts:7` | `DEDUP_WINDOW_DAYS = 90` (trùng 2 nơi) | `crm.dedupWindowDays` |
| `lib/students/lifecycle.ts:5-7` | `RENEWAL_WINDOW_DAYS=90`, `FREQUENT_ABSENT_THRESHOLD=3`, `FREQUENT_ABSENT_WINDOW=5` | `student.*` |
| `lib/students/absence.ts:8` | `URGENT_THRESHOLD_DAYS = 3` | `student.absenceUrgentThresholdDays` |
| `lib/attendance/qr.ts:12` | `GEOFENCE_RADIUS_METERS = 100` | `shift.geofenceRadiusMeters` |
| `lib/attendance/adjust.ts:7` | `MANAGER_EDIT_WINDOW_DAYS = 2` | `shift.managerEditWindowDays` |
| `lib/otp/service.ts:13-16` | `OTP_TTL_MINUTES=5`, `MAX_ATTEMPTS=5`, `RESEND_COOLDOWN_SEC=60`, `DAILY_LIMIT=8` | `otp.*` |
| `lib/teachers/load.ts:4` | `OVERLOAD_HOURS_PER_WEEK = 24` | `teacher.overloadHoursPerWeek` |
| `lib/lms/media-key.ts:5` | `MEDIA_SIGNED_URL_TTL_SECONDS = 900` | `lms.mediaSignedUrlTtl` |
| `app/api/leads/route.ts:11-12` | `RATE_LIMIT_MAX=5`, `WINDOW_MS=60000` | `public.leadRateLimit*` |
| `app/api/cron/renewal-reminder/route.ts:20-21,67` | window 13–15 ngày, idempotency 30 ngày | `cron.renewal*` |
| `app/api/cron/debt-reminder/route.ts:19` | `14 ngày` trước hạn | `finance.debtReminderDaysBefore` (đã có trong registry — wire) |
| `app/api/cron/class-reminder/route.ts:20-21` | window 12–48h | `cron.classReminder*` |
| `app/api/{portal,admin}/upload-url/route.ts` | `expiresIn: 300` | `storage.presignTtlSec` |
| `lib/pending-tasks.ts:46-47` | `ITEM_LIMIT=6`, `TWO_DAYS_MS` | `dashboard.*` |

### 3.3 Để cứng được (KHÔNG cần cấu hình)

`lib/datatable/query.ts:15-16` (page size 20/100 — safety) · `lib/attendance/geofence.ts:6` (`R=6371000` bán kính Trái Đất) · `lib/observability/slo.ts:11-14` (ngưỡng SLO — chỉnh trong code chấp nhận được) · `lib/blog-utils.ts:13` (`POSTS_PER_PAGE=9`) · `lib/motion.ts:50` (viewport animation).

---

## 4. 🟠 NỘI DUNG / KHÓA HỌC / GIÁ set cứng ở Frontend (nên đọc DB) — 🟡 ĐANG LÀM (Đợt 5)

> Đã có `CoursePackage` DB + R6-B4 (giá đọc DB cho `/khoa-hoc/[slug]`). Nhưng phần lớn nội dung marketing vẫn nằm trong file `_data/*.ts`.
>
> **✅ Đợt 5 (models + wire):** model **`Promotion`** (+enum `PromotionKind`) và **`Testimonial`** (+`videoId`) — migration `20260615090000_add_marketing_content_models`, **CHƯA apply lên Supabase** (DB còn 4 migration R6 pending; apply bằng `prisma migrate deploy` ở môi trường sạch). Tất cả helper try/catch **fallback dữ liệu tĩnh** khi bảng/Setting chưa tồn tại (2-phase additive, site không vỡ trước migration).
>   - **Promotion** → `lib/promotions.ts`; wire `/khoa-hoc/laptrinhrobot` (ISR 300s) → `SpecialOfferCountdown`.
>   - **Testimonial** → `lib/testimonials.ts` + `prisma/seed-testimonials.ts` (seed từ **data LIVE** của 3 component, gồm `videoId`). Wire cả 3: `/khoa-hoc/laptrinhrobot`, `/khoa-hoc/luyenthirobosim`, trang chủ `/` (mỗi nơi map về shape component, prop optional → no-op thị giác khi DB trống).
>   - **Policy** (awards/gifts/commitments) → `SystemSetting` group `content.*` (`lib/settings/registry.ts` default = static) + `lib/marketing-policy.ts`; wire vào laptrinhrobot.
> **🟡 Foundation (chưa kích hoạt DB-path):** `lib/course-pricing.ts` `getCourseGroups()` — map `CoursePackage`→`courseGroups` bị LOSSY (thiếu cột cho `comboPrice/fixedPrice/value` dropdown + cấu trúc nhóm) nên hiện trả static; component `Roadmap5Years`/`RegistrationForm` đã nhận prop optional (default static) sẵn sàng wire khi bổ sung cột. `RegistrationForm` (conversion-critical) **không** wire DB cho đến khi map đủ + UAT. `lib/data/products.ts` = DEAD (không ai import) → bỏ qua.
> **⏳ CÒN LẠI:** map đủ `CoursePackage`→courseGroups (thêm cột) rồi wire pricing/roadmap; luyenthirobosim courses/roadmap/faqs; **apply migration + seed + verify thị giác 375px** (data DB chỉ hiện sau `migrate deploy`).
> **Verify:** typecheck + lint + 350 unit test + build (98/98 static) PASS; fallback hoạt động đúng khi bảng chưa tồn tại.

| File | Nội dung cứng | Nên đọc từ |
|---|---|---|
| `components/legacy-laptrinhrobot/_data/courses-pricing.ts` | 8 khóa Sata1-8 + Combo: giá gốc/ưu đãi, số buổi | `CoursePackage` |
| `components/legacy-laptrinhrobot/_data/courses-details.ts` (262 dòng) | mô tả/SEO/mission/outcomes/highlights mỗi khóa | `CoursePackage` (đã có cột `mission/outcomesJson/...`) |
| `components/legacy-laptrinhrobot/_data/exam-roadmap.ts` · `roadmap-5-years.ts` | lộ trình 11/16/27 buổi, 5 khóa × module | `CoursePackage.{methodsJson,curriculum}` |
| `components/legacy-luyenthirobosim/_data/{courses,roadmap,faqs}.ts` | R1/R2 giá+discount, lộ trình, FAQ | `CoursePackage` / `PageContent` |
| `components/legacy-laptrinhrobot/_data/promotions.ts` | khuyến mãi, referral, trả góp | model `Promotion` (chưa có) hoặc `SystemSetting` |
| `components/legacy-laptrinhrobot/_data/{awards,gifts,commitments}.ts` | giải thưởng 36M, quà 2M, 6 cam kết | DB / `SystemSetting` (chính sách) |
| `components/legacy-laptrinhrobot/_data/{faqs,testimonials}.ts` | 8 FAQ, 6 testimonial | `PageContent` / model `Testimonial` |
| `lib/data/products.ts` (8 sản phẩm) | giá 180k–5.2M, specs | model `Product`/`InventoryItem` DB |
| `app/(public)/khoa-hoc/page.tsx:43-78` | bảng so sánh 2 khóa + 8 cam kết cứng | DB / `PageContent` |

### 4.1 Liên hệ / SEO / brand cứng

| File:dòng | Nội dung |
|---|---|
| `components/legacy-laptrinhrobot/Footer.tsx:85,89,93` | email, địa chỉ, giờ làm cứng |
| `components/legacy-laptrinhrobot/Header.tsx:71` | link `/khoa-hoc/luyenthirobosim` cứng |
| `app/(public)/lien-he/page.tsx:31-32` | hotline + email trong metadata |
| `lib/seo/jsonld.ts:247` | `jobLocation` "211 Nguyễn Hữu Thọ" cứng |
| `lib/data/job-options.ts` | `DEPARTMENTS/LOCATIONS/JOB_TYPES/HR_CONTACT` (email, SĐT, "Ms. Trang") cứng |
| `lib/seo/jsonld.ts` (organization) | tên công ty, MST `0402301783`, logo, social — nên về `SystemSetting` |

### 4.2 Menu / Navigation cứng (🟡 thấp — ít đổi)

`components/sections/mobile-nav-drawer.tsx:26-45` · `components/public/header.tsx:11-21` — `NAV_ITEMS`/`NAV_LINKS` cứng. Chấp nhận được trước mắt; chuyển `PageContent`/`MenuConfig` nếu cần CMS.

---

## 5. Thứ tự ưu tiên khắc phục

1. **🔴 P0 — Tổ chức/HO (mục 1 + 0):** chuẩn hoá center-picker Frontend đọc **OrgUnit tree**; bỏ list cứng `["CS1","CS2"]` ở `lib/lead/*`, import, báo cáo. → giải quyết trực tiếp "HO không hiện".
2. **🔴 P0 — Role (mục 2):** thay `ALLOWED_ROLES`/`role === "..."` bằng `can()`/`hasRole()`. Đồng bộ với R6-F2 (RBAC v2). Gộp `ROLE_LABELS` về `lib/labels.ts`.
3. **🟠 P1 — Hằng số nghiệp vụ (mục 3):** wire các call-site đã có setting; thêm key cho SLA/OTP/attendance/dedup/lifecycle.
4. **🟠 P1 — Giá/khóa học (mục 4):** chuyển `_data/courses-*` → `CoursePackage` (R6-B4 đã mở đường cho giá; mở rộng cho mô tả/lộ trình).
5. **🟡 P2 — Liên hệ/SEO/brand → `SystemSetting` + `Center`; menu → CMS** (khi cần).

---

## 6. Ghi chú phương pháp

- Báo cáo tổng hợp từ 4 lượt quét song song (org/center · hằng số · role · nội dung) + kiểm chứng trực tiếp DB cho mục 0 (HO là OrgUnit, không có row Center).
- "Hardcode" ở đây = giá trị/danh sách set cứng trong code lẽ ra phải đọc từ DB hoặc cấu hình động; KHÔNG tính hằng số kỹ thuật thuần (bán kính Trái Đất, safety limit pagination).
- File:dòng có thể lệch ±vài dòng nếu code đã đổi sau ngày rà soát — verify lại trước khi sửa.
