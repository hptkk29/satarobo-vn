# Kiến trúc hệ thống Sata Robo — hiện trạng mã nguồn

Tài liệu mô tả **hiện trạng code trong repo**, không phải kiến trúc mong muốn. Mọi khẳng định kèm `file:dòng`.
Khi mã nguồn mâu thuẫn với comment/doc trong chính nó, tài liệu này **theo code** và ghi rõ chỗ mâu thuẫn.

---

## 1. Tổng quan hệ thống + giả định chính

### 1.1. Một app Next.js, 6 host, 6 route group

Toàn bộ hệ thống là **MỘT** ứng dụng Next.js App Router duy nhất. Không microservice, không message broker.
Phân site bằng **host header** trong middleware, không phải bằng deployment riêng.

| Host | HostKind | Route group phục vụ | Cờ bật/tắt |
|---|---|---|---|
| `satarobo.vn`, `www.satarobo.vn` | `public` | `app/(public)/`, `app/(legacy)/` | không có |
| `admin.satarobo.vn` | `admin` | `app/(admin)/admin/` | không có |
| `hocvien.satarobo.vn` | `portal` | `app/(portal)/portal/` | không có |
| `giaovien.satarobo.vn` | `teacher` | `app/(teacher)/teacher/` | `TEACHER_SITE_ENABLED` (mặc định **ON**) |
| `e-learning.satarobo.vn` | `elearning` | `app/(elearning)/elearning/` | `ELEARNING_ENABLED` (mặc định **OFF**) |
| `sale.satarobo.vn` | `sale` | **KHÔNG phải route group** — rewrite sang file tĩnh `public/sale/*.html` | không có |
| `*.vercel.app` | `vercel` | canonical-hoá 308 về host thật (chỉ khi `NODE_ENV=production`) | — |
| localhost / preview | `unknown` | dùng path thật `/admin/*`, `/teacher/*`, `/elearning/*` | — |

Bằng chứng: `proxy.ts:18-23` (hằng số host), `proxy.ts:25-34` (`detectHost`), `proxy.ts:121` (nhánh vercel),
`proxy.ts:150-170` (gọi `decideRoute` + `withAdminHeaders`), `lib/auth/route-policy.ts:639-649` (nhánh `sale` rewrite tĩnh),
`lib/auth/route-policy.ts:376-377` (đọc 2 cờ), `lib/flags.ts:123` + `lib/flags.ts:221`.

**Giả định:** `proxy.ts` KHÔNG chứa logic phân quyền — nó chỉ nhận diện host rồi thi hành quyết định của
`decideRoute()` (`lib/auth/route-policy.ts:345`). Sửa rule host × role **chỉ ở `decideRoute()` + test**, không sửa `proxy.ts`.

### 1.2. Giả định chính (đã kiểm chứng trong code)

| Giả định | Trạng thái | Bằng chứng |
|---|---|---|
| Modular monolith, không microservice | ĐÚNG — nhưng thư mục `modules/*` **CHƯA TỒN TẠI** | không tìm thấy `modules/` trong repo |
| Đơn vị đo cách ly dữ liệu lúc chạy là `Center.id` (cột `centerId`) | ĐÚNG | `lib/db-scope.ts:279-280` |
| `OrgUnit` là cây tổ chức thật, nhưng `orgUnitId` mới chỉ **ghi song song**, chưa dùng để lọc | ĐÚNG | `lib/db-scope.ts:279-280` (lọc bằng `centerId`), `lib/org/dual-write.ts:14-24` |
| Quyền lấy từ DB (RoleDef/RolePermission/UserOrgRole), không từ JWT | **CHỈ ĐÚNG KHI `RBAC_V2_ENABLED=true`** | `lib/auth/shadow-compare.ts:27`, `lib/auth/permissions.ts:764` |
| Không có DENY override | ĐÚNG với `can()` v2 | `lib/auth/can.ts:48-59` |
| Side-effect không-atomic đi qua DomainEvent outbox | Một phần — outbox tồn tại (`lib/events/`, cron `dispatch-events` mỗi phút), nhưng nhiều action vẫn gọi side-effect inline | `vercel.json:24-27` |

---

## 2. Tech stack thật (đọc từ `package.json`)

| Lớp | Gói | Phiên bản khai trong `package.json` |
|---|---|---|
| Framework | `next` | `16.2.6` |
| UI runtime | `react` / `react-dom` | `19.2.4` |
| Ngôn ngữ | `typescript` | `^5` (strict — `tsconfig.json`) |
| ORM | `@prisma/client` / `prisma` | `^5.22.0` |
| Auth | `next-auth` | `5.0.0-beta.31` (Auth.js v5) + `@auth/prisma-adapter` `^2.11.2` |
| CSS | `tailwindcss` | `^4` (+ `@tailwindcss/postcss` `^4`) |
| Component primitives | `@base-ui/react` `^1.4.1`, `@radix-ui/react-{label,slot,switch}` | — |
| Animation | `motion` | `^12.38.0` (CLIENT only, ESLint chặn ở admin) |
| Charts | `recharts` | `^3.8.1` (ADMIN only) |
| Validation | `zod` | `^4.4.3` |
| Storage | `@aws-sdk/client-s3` `^3.1045.0` + `@aws-sdk/s3-request-presigner` | Cloudflare R2 qua S3 API |
| Email | `resend` | `^6.12.3` |
| Rate limit | `@upstash/ratelimit` `^2.0.8`, `@upstash/redis` `^1.38.0` | — |
| Observability | `@sentry/nextjs` | `^10.53.1` |
| Realtime | `@supabase/supabase-js` | `^2.112.2` (chat) |
| Excel | `xlsx` (SheetJS) `^0.18.5` + `jszip` `^3.10.1` | **KHÔNG có `exceljs`** |
| PDF | `@react-pdf/renderer` `^4.5.1`, `pdfjs-dist` `^6.1.200` | — |
| Test | `vitest` `^4.1.6`, `@playwright/test` `^1.60.0` | — |
| Lint | `eslint` `^10.3.0` + plugin local `lib/eslint/*` | — |

Lệnh xác minh: `pnpm typecheck && pnpm lint && pnpm build` (`package.json:6-8, 33`).
Deploy: Vercel region `hnd1` (`vercel.json:1`).

**KHÔNG CÓ trong repo (đừng giả định là có):**
- `react-day-picker`, shadcn `Calendar`, bất kỳ date-range picker nào — toàn bộ dùng `<input type="date">` native.
- `exceljs`.
- Component multi-select trong `components/ui/` — chỉ có `components/ui/combobox.tsx` single-select (`components/ui/combobox.tsx:23-24, 38-40`).

---

## 3. Luồng auth/session end-to-end

### 3.1. Sơ đồ các bước

```
[1] Browser  →  POST /api/auth/callback/credentials
                  │  next-auth Credentials provider
                  │  rate-limit 2 khoá song song:
                  │    login:ip:<ip>   max 10 / 60s
                  │    login:id:<idKey> max 5 / 60s      lib/auth.ts:127-135
                  ▼
[2] authorize()  →  tra User trong DB, so bcrypt
                  →  trả { id, role, roles[], centerId, grants[], tokenVersion, phone }
                                                          lib/auth.ts:195-198
                  ▼
[3] callback jwt()  →  copy NGUYÊN các field trên vào JWT
                       token.{id,role,roles,centerId,grants,tokenVersion,phone}
                                                          lib/auth.ts:203-214
                  ▼
[4] callback session()  →  đọc lại từ token ra session.user
                           + migrateLegacyRole (MANAGER→CENTER_MANAGER, SALES→SALES_CSM)
                                                          lib/auth.ts:216-240
                  ▼
[5] proxy.ts (middleware)  →  detectHost() → decideRoute({hostKind, pathname, role, roles, sessionValid})
                              sessionValid = CHỈ "có JWT hợp lệ"
                              KHÔNG biết tokenVersion / isActive (cần DB)
                                                          proxy.ts:144-164
                  ▼
[6] Layout RSC (admin/portal/teacher)  →  auth() + redirect /login
                                          + tầng liveness (tokenVersion, isActive)
                  ▼
[7] Server Action / API route  →  auth()
                  ▼
[8] resolveActor(userId)   ←  React.cache → 1 lần truy vấn/request
      đọc THẲNG từ DB:  User → RoleDef → UserOrgRole → UserPermissionGrant
                        → OrgUnit tree (findMany trần, KHÔNG unstable_cache)
                        → PositionAssignment/WorkScope → Class → guardedStudents
                                                          lib/auth/actor.ts:400-535
                  ▼
[9] buildActor(input)  →  Actor {
        isSuperAdmin, isHoLevel,
        permissions[] (mỗi dòng kèm centerScope / orgUnitScope),
        visibleCenterIds[], visibleOrgUnitIds[],
        roleCenterScope, roleOrgScope, grantsAllow,
        assignedClassIds, guardedStudentIds, orgScopeCutover }
                                                          lib/auth/actor.ts:243-391
                  ▼
[10] checkPermission(action, target?)  →  decidePermissionWithGrant
       (a) resolveGrant  — bảng PermissionGrant MỚI (ROLE/GROUP, CÓ nhánh DENY)
           hit → grant là nguồn sự thật, dừng
       (b) miss → evaluatePermission: tính CẢ v1 lẫn v2, ghi shadow-diff nếu lệch
           trả  flagOn ? v2 : v1        (flagOn = RBAC_V2_ENABLED === "true")
                            lib/auth/check-permission.ts:25-30, lib/auth/shadow-compare.ts:20-27
                  ▼
[11] scopedDb(actor)  →  Prisma client extension, inject `centerId IN (...)`
                         vào ĐÚNG 7 method ĐỌC        lib/db-scope.ts:347-375
                  ▼
[12] Query / mutation  →  DB
```

### 3.2. Hai đường kiểm quyền chạy song song

| Đường | File | Ai dùng | Có đi qua cờ `RBAC_V2_ENABLED`? |
|---|---|---|---|
| `checkPermission()` / `assertPermission()` | `lib/auth/check-permission.ts:25-52` | **297 file** dưới `app/` | CÓ |
| `runAction()` (pipeline chuẩn) → `can()` hợp nhất | `lib/actions/factory.ts:100-144` | **CHỈ module chat** (`lib/chat/{admin,announcements,dm,messages,moderation}.ts`) | **KHÔNG** — `lib/permissions/can.ts:146` fallback thẳng `canV2` bất kể cờ |

Hệ quả: module chat chạy v2 **ngay cả ở local**, khác phần còn lại của hệ thống.

### 3.3. Pipeline `runAction` (chuẩn, nhưng ít người dùng)

`lib/actions/factory.ts:4-6` khai: `auth → resolveActor → zod → can(target) → scopedDb → mutation → writeAudit → revalidate`.
Thứ tự **zod chạy TRƯỚC `can()`** là có chủ đích (`lib/actions/factory.ts:12-14`).
Lớp bind Next là `defineAction` (`lib/actions/define.ts:13-28`).

---

## 4. Kiến trúc multi-tenant (TRỌNG TÂM)

### 4.1. Hình cây OrgUnit thật trong code

Enum `OrgUnitType` có **8 giá trị**: `ROOT`, `HO`, `REGION`, `DEPARTMENT`, `CENTER`, `CAMPUS`, `PARTNER`, `FRANCHISE`
(`prisma/schema.prisma:289-298`).

Cây trong seed (`prisma/seed-orgunit.ts:3-8, 33-70`):

```
HO   (gốc, depth 0, code "HO", path "/ho/")
 └── DANANG  (REGION, code "DANANG", path "/ho/danang/")
      ├── CS1  (CENTER, path "/ho/danang/cs1/", centerId → Center("CS1"))
      └── CS2  (CENTER, path "/ho/danang/cs2/", centerId → Center("CS2"))
```

- Node `REGION` **CÓ TỒN TẠI** thật (không phải khái niệm trên giấy): seed `prisma/seed-orgunit.ts:33-70`,
  luật cha-con `lib/org/types.ts:41-50` (`REGION: ["HO","ROOT"]`, `CENTER: ["REGION","HO","ROOT"]`),
  script dời cây `scripts/nen-p1-reshape-org-tree.ts:37-38`.
- Node `ROOT` ("SATAROBO") vẫn hợp lệ về schema nhưng là **di sản** — seed mới KHÔNG tạo `ROOT`.
- Materialized path: `lib/org/path.ts:16-31` (`childPath` = path cha + slug + `/`).

> ⚠️ **Hình cây trên DB đang chạy là ẨN SỐ.** Script dời cây `scripts/nen-p1-reshape-org-tree.ts` mặc định
> dry-run, **người vận hành chạy tay** (luật cứng #4). `scripts/nen-p1-backfill-orgunit.ts:66-70` còn có
> nhánh cảnh báo *"Chưa có đơn vị REGION nào — nhiều khả năng CHƯA chạy reshape"*. Đừng suy hình cây
> runtime từ seed.

### 4.2. Quan hệ User ↔ Center — 6 đường gắn, chỉ 2 đường sinh quyền

`User.centerId` là **trường đơn** (`String?` + FK 1-1 tới `Center`). **KHÔNG có bảng nối User↔Center**
(`prisma/schema.prisma:1057-1058, 1085`).

| # | Đường gắn | File:dòng | Sinh quyền? |
|---|---|---|---|
| a | `User.centerId` | `prisma/schema.prisma:1057` | ❌ chỉ dữ liệu — nhưng bị **63 chỗ đọc thẳng** để gate thủ công |
| b | `User.orgUnitId` | `prisma/schema.prisma:1058` | ❌ — là **anchor** để `reconcileUserOrgRoles` suy vai (`lib/auth/org-role-sync.ts:94-102`) |
| c | `Employee.centerId` / `Employee.orgUnitId` | `prisma/schema.prisma:2477-2480` | ❌ hồ sơ nhân sự |
| d | `EmployeeOrgAssignment` (employee × orgUnit) | `prisma/schema.prisma:736-751` | ❌ **cố ý** — `lib/org/assignment-service.ts:2` khẳng định "KHÔNG sinh quyền" |
| e | **`UserOrgRole`** (user × orgUnit × role) | `prisma/schema.prisma:525-541` | ✅ **CÓ** |
| f | **`PositionAssignment` + `Position.orgUnitId` + `WorkScope`** | `prisma/schema.prisma:632-726` | ✅ **CÓ** — `lib/org/positions.ts:157-224` trả đúng khuôn `UserOrgRoleRow`, đổ chung vào `buildActor` |

`UserOrgRole` có PK ghép `@@id([userId, orgUnitId, roleId])` (`prisma/schema.prisma:536`) ⇒ **một user gắn được N dòng
ở N đơn vị**. **KHÔNG có ràng buộc nào** (DB / Zod / service) chặn gắn vào nhiều cơ sở khác nhánh:
- Zod `assignUserOrgRoleSchema` chỉ `.refine` "effectiveTo phải sau effectiveFrom" (`lib/validators/role.ts:53-65`).
- Service chỉ kiểm 4 thứ: quyền `roles:assign`, OrgUnit tồn tại, RoleDef tồn tại, chặn leo thang SUPER_ADMIN — rồi upsert thẳng (`lib/auth/rbac-service.ts:179-229`).

### 4.3. Cách tính `visibleCenterIds` / `visibleOrgUnitIds` / `isHoLevel`

`buildActor()` **UNION qua TẤT CẢ** các dòng còn hiệu lực (`UserOrgRole` + `PositionAssignment` gộp chung vào `rows`):

| Bước | Logic | file:dòng |
|---|---|---|
| 1 | `liveRows` = `status==="ACTIVE"` ∧ `role.isActive` ∧ `effectiveFrom ≤ now` ∧ (`effectiveTo == null` ∨ `≥ now`) | `lib/auth/actor.ts:243-249` |
| 2 | `isSuperAdmin` = có dòng `role.code === "SUPER_ADMIN"` **VÀ** node neo là HO/ROOT | `lib/auth/actor.ts:251-253` |
| 3 | `isHoLevel` = `liveRows.some(r => isHoRoot(orgById.get(r.orgUnitId)))` — **chỉ cần MỘT dòng** | `lib/auth/actor.ts:254-255` |
| 4 | mỗi dòng: `scopeUnits = [r.orgUnitId, ...workScopeOrgUnitIds]`; `rowCenters = hoRoot ? everyCenter : getSubtreeCenterIds(scopeUnits)` | `lib/auth/actor.ts:268-286` |
| 5 | mọi `rowCenters` đổ vào Set `visible` → `visibleCenterIds` | `lib/auth/actor.ts:373-391` |
| 6 | mỗi permission mang kèm `centerScope: hoRoot ? "ALL" : rowCenters` và `orgUnitScope` tương tự | `lib/auth/actor.ts:333-345` |

`isHoRoot(n)` = `n?.type === "HO" || n?.type === "ROOT"` (`lib/auth/actor.ts:204-205`).
`allCenterIds()` = node `type==="CENTER"` ∧ sống ∧ có `centerId` (`lib/auth/actor.ts:207-211`).
Cây OrgUnit đọc **trần mỗi request** (`db.orgUnit.findMany({ where: { deletedAt: null } })`, `lib/auth/actor.ts:436`);
cache `unstable_cache` đã bị **gỡ có chủ đích** (`lib/auth/actor.ts:20-24`).

**Vai quan hệ (PARENT)** là ngoại lệ có chủ đích: nạp thẳng từ `RoleDef` theo `User.role`/`User.roles`, KHÔNG cần
dòng `UserOrgRole` nào (`lib/auth/actor.ts:192, 399-421`). Permission của vai này push vào `actor.permissions` với
`orgUnitId: ""`, `centerScope: null`, `orgUnitScope: null` và **cố ý KHÔNG chạm** `visible`/`visibleOrg`/`isHoLevel`
(`lib/auth/actor.ts:348-365`) ⇒ scope `CENTER` không bao giờ khớp (fail-closed, `lib/auth/can.ts:23, 26`).

### 4.4. `scopedDb(actor)` — làm gì và KHÔNG làm gì

**LÀM:** inject filter `centerId` vào **đúng 7 method ĐỌC top-level**:

```
findMany · findFirst · count · aggregate · groupBy · findUnique · findFirstOrThrow
```
(`lib/db-scope.ts:347-375`)

Dạng filter (`lib/db-scope.ts:268-282`):
- model thường: `{ centerId: { in: visibleCenters } }`
- model ∈ `NULL_IS_GLOBAL_MODELS`: `{ OR: [{ centerId: null }, { centerId: { in: visibleCenters } }] }`
- đã có `where` → bọc `{ AND: [where cũ, scopeWhere] }`

`findUnique` **không** inject where mà lọc **hậu kỳ** bằng `passesScope` (trả `null` nếu ngoài scope), có merge
`centerId: true` khi caller `select` hẹp rồi strip lại (`lib/db-scope.ts:319-337`).
Bypass toàn bộ khi `actor.isSuperAdmin` — **chỉ SUPER_ADMIN**, KHÔNG phải `isHoLevel` (`lib/db-scope.ts:128-130`).

**KHÔNG LÀM (4 lỗ, đều có chủ đích/đã ghi nhận):**

| # | Không che | Bằng chứng |
|---|---|---|
| 1 | **Mọi đường GHI** — không có hook `create/createMany/update/updateMany/delete/deleteMany/upsert` | `lib/db-scope.ts:347-375` (chỉ 7 method đọc) |
| 2 | **Nested `include`** — Prisma client extension chỉ chạy ở query top-level | `lib/db-scope.ts:4-5` |
| 3 | Model không nằm trong `SCOPED_MODELS` → **mặc định KHÔNG cách ly, im lặng** | `lib/db-scope.ts:269` (`if (!SCOPED_MODELS.has(model)) return args`) |
| 4 | Model không map prefix trong `getModelPrefixes` → fallback `isHoLevel ? "ALL" : visibleCenterIds` | `lib/db-scope.ts:226-228, 257-263` |

Hệ quả bắt buộc nhớ:
- Mọi `update`/`delete` phải **tự gọi `passesScope()`** (`lib/db-scope.ts:284-301`).
- Mọi `create` trên model ∈ `SCOPED_MODELS` phải **tự set `centerId`** — quên = bản ghi **vô hình** với actor cấp cơ sở.

**Ba tập model (`lib/db-scope.ts`):**

| Tập | Số lượng | Vị trí | Ghi chú |
|---|---|---|---|
| `SCOPED_MODELS` | 40 | `lib/db-scope.ts:11-50` | Lead, Order, Student, Class, Payment, Enrollment, Attendance, BankTransaction… |
| `NULL_IS_GLOBAL_MODELS` | 4 | `lib/db-scope.ts:62-70` | Survey, SurveyResponse, EvaluationRound, BankTransaction |
| `SCOPE_EXEMPT` | 14 | `lib/db-scope.ts:77-126` | OrgUnit, User, **Center**, RevenueTarget, RefundRequest, Conversation… |

> ⚠️ `SCOPE_EXEMPT` **KHÔNG được `injectScope` đọc** — điều kiện thật là `!SCOPED_MODELS.has(model)`.
> Nó chỉ là danh sách tài liệu hoá cho introspection.

### 4.5. Ghi kép `centerId → orgUnitId`

Một Prisma client extension duy nhất, cắm trong `lib/db.ts` **ngay sau** extension soft-delete, nên `scopedDb`
(vốn là `db.$extends`) cũng thừa hưởng (`lib/db.ts:97-105`). Client tra cứu là **base trần** để tránh đệ quy
(`lib/db.ts:104-105`, `setDualWriteClient(basePrisma)`).

| Hạng mục | Hiện trạng | file:dòng |
|---|---|---|
| Method được hook | `create`, `createMany`, `update`, `upsert` (upsert xử lý cả 2 nhánh) | `lib/org/dual-write.ts:125-174` |
| Phạm vi model | `DUAL_WRITE_MODELS` = 52 model (24 `BACKFILL_SPECS` + 28 `PR_A_MODELS`) | `lib/org/center-bridge.ts:306-309` |
| Cơ chế tra | nhánh 1 `OrgUnit.centerId = centerId`; nhánh 2 (cầu mồ côi) `OrgUnit.code = Center.code` | `lib/org/dual-write.ts:50-86` |
| Cache | in-process Map, **chỉ cache kết quả CÓ** (tra hụt luôn hỏi lại DB) | `lib/org/dual-write.ts:38` |

**6 trường hợp KHÔNG chạy:**
1. `updateMany` — **cố ý không hook** (`lib/org/dual-write.ts:121-124`: "data áp cho NHIỀU dòng có thể thuộc nhiều cơ sở").
2. Caller đã tự set `orgUnitId` (kể cả set `null`) — `lib/org/dual-write.ts:93`.
3. `centerId: null` tường minh, hoặc dạng bọc Prisma `{set:…}` / `{connect:…}` — `lib/org/dual-write.ts:96-97`.
4. Không ánh xạ được → để `null`, **KHÔNG ném lỗi** — `lib/org/dual-write.ts:100`.
5. Mọi đường ghi SQL thô / migration / script — không đi qua client extension.
6. (hệ quả) `deleteMany`/`delete` — không liên quan.

Lưới cuối: cron đối soát đêm `/api/cron/orgunit-drift` (03:00 VN, `vercel.json`) — **CHỈ ĐỌC**, không tự sửa
(`app/api/cron/orgunit-drift/route.ts:24-42`). Vá bằng `scripts/nen-p1-backfill-orgunit.ts --apply` chạy tay.

> Tới hết P4, `orgUnitId` **vẫn chỉ là cột dữ liệu**: `scopedDb` lọc bằng `centerId` (`lib/db-scope.ts:279-280`).
> `orgUnitId` thiếu **hiện chưa gây mất quyền**, nhưng sẽ gây tàng hình hàng loạt khi lật cutover.

### 4.6. `center-bridge` — Center ↔ OrgUnit

| Ánh xạ | Cơ chế | Dùng ở đâu |
|---|---|---|
| Chính | FK `OrgUnit.centerId @unique` (`prisma/schema.prisma:347`) — **luật V7: chỉ node `type=CENTER` được mang** (`lib/org/orgunit-rules.ts:88-96`) | mọi nơi |
| Phụ (cầu mồ côi) | khớp `OrgUnit.code = Center.code` | `lib/org/dual-write.ts:67-85`, `ORG_UNIT_FOR_CENTER_SQL` (`lib/org/center-bridge.ts:324-336`) |

**`Center("hoi-so")` là bản ghi MỒ CÔI đã biết** — không OrgUnit nào trỏ tới, vì V7 cấm đơn vị HO mang `centerId`
(`prisma/seed-orgunit.ts:40-43`: `centerCode: null` CÓ CHỦ ĐÍCH). Công cụ đo: `findOrphanCenters()`
(`lib/org/org-service.ts:320-330`).

Ý nghĩa `centerId = NULL` **khác nhau theo bảng** — bảng phân loại là `BACKFILL_SPECS` (`lib/org/center-bridge.ts:108-190`):
`BAT_BUOC` (Payment, PaymentRequest, PaymentAllocation, CreditBalance, RefundRequest, QrSession…),
`NULL_CHUA_KHOP` (BankTransaction), `NULL_TOAN_HE_THONG` (RevenueTarget).
Thêm cột `orgUnitId` cho bảng mới mà quên khai vào đó → test `[US-07-IT-08b]` đỏ.

### 4.7. Luồng dữ liệu doanh thu (multi-tenant thể hiện rõ nhất ở đây)

**Hai sổ chạy song song:**

```
SỔ CŨ (đang là NGUỒN ĐỌC của MỌI màn doanh thu)
  Sale ghi nhận → Payment.saleStatus = RECORDED, accountantStatus = PENDING
  Kế toán xác nhận → accountantStatus = CONFIRMED  (+ sinh Receipt, publish "payment.confirmed")
  "Doanh thu thực" = Σ Payment.amount WHERE accountantStatus='CONFIRMED' AND deletedAt IS NULL
  gom kỳ theo Payment.paidDate

SỔ MỚI (chạy thật từ 03/08, CHƯA màn nào đọc)
  BankTransaction (tiền về thô, idempotent @@unique[provider, providerTxnId])
    → PaymentAllocation (rót waterfall theo sortOrder)
    → PaymentRequest.status TÍNH LẠI từ sổ
    → dư → CreditBalance
```

Bằng chứng: `app/(admin)/admin/bao-cao/doanh-thu/page.tsx:60-74`, `lib/payments/payos-ingest.ts:767-787, 904-956`,
`lib/flags.ts:163-170` (`PAYMENT_LEDGER_V2` mặc định OFF + comment "CHƯA nối vào màn nào").

**Đường webhook (payOS + SePay dùng chung thân `ingestPayosWebhook`):** khi rót được tiền, ghi **CẢ HAI sổ** —
`PaymentAllocation` **và** một dòng `Payment` marker `[auto:<provider>:<txn>]` với
`accountantStatus: "PENDING"`, `paidDate: new Date()`, `centerId: order.centerId`
(`lib/payments/payos-ingest.ts:1044-1055`).

**Suy cơ sở cho một khoản thu:**

| Đường ghi | Chuỗi suy `centerId` | file:dòng |
|---|---|---|
| `ensureOrderPaymentRecorded` | `order.centerId` → `lead.centerId` → `actor.centerId` | `lib/finance/payment.ts:93-99` |
| `allocateToOrder` (webhook + đối soát tay) | `order.centerId` | `lib/payments/payos-ingest.ts:954, 995-998` |
| `adjustPayment` / `refundPayment` | kế thừa `original.centerId` | `lib/finance/payment.ts:631` |
| `RefundRequest` | `enrollment.class.centerId` | `lib/finance/refund.ts:104-108` |
| `BankTransaction` | **NULL** cho tới khi khớp được đơn | `lib/payments/payos-ingest.ts:995-998` |

**Ba định nghĩa "doanh thu" khác nhau cùng tồn tại** (xem §6, rủi ro R-09).

---

## 5. Đường biên tin cậy

### 5.1. Browser → Server Action

| Lớp | Hiện trạng | file:dòng |
|---|---|---|
| Middleware | chỉ định tuyến host × role, **KHÔNG biết `tokenVersion`/`isActive`** (cần DB) | `proxy.ts:144-148` |
| Layout gate | `auth()` + `redirect('/login')` ở admin/portal/teacher layout | — |
| Server Action | **BẮT BUỘC** tự `auth()` + `checkPermission`/`assertPermission` ngay đầu hàm — layout gate là chưa đủ | `lib/auth/check-permission.ts:25-52` |
| Portal | thêm ownership check (`assertOwnsStudent` / `requireActiveStudent`) | `lib/portal/session.ts:105-117` |
| Lint | `no-inline-authz` 2 tầng, **chỉ áp trên 5 glob file action** dưới `app/` | `eslint.config.mjs:62-114, 309-316` |
| Miễn trừ lint | **39 file** grandfather, tắt CẢ HAI tầng | `lib/eslint/inline-authz-allowlist.mjs` |

Tầng (b) của lint là plugin local: quét thân hàm async được export, nếu có lời gọi GHI
(`.create/.update/.delete/.upsert/.createMany/.updateMany/.deleteMany`) mà **không** có
`can/assertCan/checkPermission/assertPermission/checkAnyPermission/assertAnyPermission` → báo lỗi
(`lib/eslint/require-can-in-write-action.mjs:28-44, 120-129`). Chỉ nhìn wrapper cục bộ **một cấp cùng file**,
không xuyên import.

> Rule **KHÔNG quét** `app/api/**/route.ts` và `lib/**`.

### 5.2. Server → Provider (đi ra ngoài)

| Provider | Credential | File | Chế độ mô phỏng |
|---|---|---|---|
| Cloudflare R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` | `lib/storage/r2-client.ts:16-33` | không |
| R2 (bucket chat riêng) | `R2_CHAT_BUCKET_NAME` — **dùng chung credential trên** | `lib/storage/chat-storage.ts:49-65` | fail-closed 2 lớp: trống → throw; **trùng `R2_BUCKET_NAME` → throw** |
| Resend | `RESEND_API_KEY` | `lib/email/resend.ts:7-15` | thiếu key → **no-op im lặng**, không throw |
| Zalo ZNS | `ZALO_OA_ACCESS_TOKEN` hoặc bộ `ZALO_APP_ID`+`ZALO_APP_SECRET`+`ZALO_OA_REFRESH_TOKEN` | `lib/zalo/provider.ts:41-47` | chưa bật live → trả `SIMULATED-<phone>`, KHÔNG gọi API thật (`lib/zalo/provider.ts:108-112`) |
| Meta CAPI / GA4 | `META_CAPI_TOKEN`, `GA4_API_SECRET` | `lib/tracking.ts:43-44, 92` | — |
| SePay / payOS / MISA | xem §5.4 | — | — |
| Supabase Realtime | `SUPABASE_JWT_SECRET` (ký JWT HS256), `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS) — **SERVER ONLY** | `lib/chat/realtime-token.ts:86`, `lib/chat/broadcast.ts:272` | — |

Công tắc ZNS live **nằm ở DB** (`SystemSetting["zalo.znsLive"]`), env `ZALO_LIVE` chỉ là dự phòng; lỗi đọc DB →
coi như KHÔNG live (`lib/zalo/provider.ts:103-106`). Token Zalo lưu trong `IntegrationConfig`, env chỉ là hạt giống
(`lib/zalo/token.ts:47-57, 219-220`).

**Upload:** đi đường **presigned PUT** — browser PUT thẳng lên R2, server chỉ **ký sau khi kiểm quyền**
(`app/api/admin/upload-url/route.ts:15-16`). Bucket `R2_BUCKET_NAME` gắn `cdn.satarobo.vn` là **CÔNG KHAI**:
mọi object tải được vô danh (`.env.example:91-93`). Bucket chat là riêng, đọc qua `signChatGetUrl` hết hạn 5 phút
(`lib/storage/chat-storage.ts:94-97`).

### 5.3. Cron → App

23 job trong `vercel.json`, khớp **1-1** với 23 thư mục `app/api/cron/` — không cron mồ côi, không endpoint không đăng ký.

- Xác thực: `CRON_SECRET` qua `Authorization: Bearer`, so sánh timing-safe (`lib/cron/auth.ts:9-15`).
- **Thiếu `CRON_SECRET` = TỪ CHỐI TẤT CẢ** (`lib/cron/auth.ts:10-13`).
- 15 route gọi thẳng `verifyCronAuth`; 6 route bọc qua `withCron()` (`lib/cron/handler.ts:14-16`).
- **2 route có đường thứ hai** (có chủ đích, để bấm tay từ admin): `email-queue` chấp nhận `CRON_SECRET` HOẶC
  phiên có `emails:view` (`app/api/cron/email-queue/route.ts:12-20`); `student-birthday` tương tự với `students:edit`
  (`app/api/cron/student-birthday/route.ts:30-38`).

Môi trường `test` không có Vercel Cron → `.github/workflows/cron-pump-test.yml` bơm `dispatch-events` + `email-queue`
mỗi 5 phút.

> **Bẫy lịch sử đã vá, đừng làm sống lại:** mọi cron từng chết im vì Vercel Cron gọi vào URL `.vercel.app`,
> request ăn 308 sang host thật và header `Authorization` rụng khi đổi host ⇒ handler không bao giờ chạy,
> `DomainEvent` tích 285 dòng PENDING với `attempts=0`, không log. Vá bằng `isInfraPath()` ở nhánh canonical
> (`proxy.ts:122-132`).

### 5.4. Webhook → App (7 endpoint công khai, **4 cơ chế khác nhau**)

| Endpoint | Cơ chế | Thiếu secret thì sao | file:dòng |
|---|---|---|---|
| `/api/public/webhook/facebook` | shared-secret **VÀ** HMAC `X-Hub-Signature-256` | fail-closed **CHỈ KHI** `NODE_ENV==="production"` | `lib/lead/webhook.ts:44-56, 92-104` |
| `/api/webhooks/meta/messenger` | HMAC `X-Hub-Signature-256`, sai → 401 | như trên | `app/api/webhooks/meta/messenger/route.ts:40-44` |
| `/api/public/webhook/{zalo,google-form,quatang}` | shared-secret header `x-webhook-secret` / query `?secret=`, timing-safe | như trên | `lib/lead/webhook.ts:19-24, 59-64` |
| `/api/public/webhook/sepay` | header `Authorization: Apikey <key>` | **fail-closed tuyệt đối** | `lib/payments/sepay.ts:204-210` |
| `/api/public/webhook/payos` | HMAC-SHA256 trong body, đối chiếu `PAYOS_CHECKSUM_KEY` | thiếu key → **chấp nhận payload không chữ ký** ("chế độ mô phỏng") | `lib/payments/payos.ts:165-168` |

**Hai endpoint CỐ Ý không auth:**
- `/api/leads` — chỉ honeypot (`body.website`), bẫy `timeOnPage < 3s`, rate-limit theo IP với ngưỡng đọc động từ
  `SystemSetting` (`app/api/leads/route.ts:27-56`).
- `/api/public/lead-intake/sale-form` — nhận POST từ `sale.satarobo.vn`, chỉ rate-limit + giới hạn body 100.000 byte
  (`app/api/public/lead-intake/sale-form/route.ts:30-31`).

**Rate limit** (`lib/rate-limit.ts`): Upstash Redis (`UPSTASH_REDIS_REST_*` ?? `KV_REST_API_*`), **fail-soft** rơi về
Map in-memory per-instance khi lỗi hoặc thiếu env (`lib/rate-limit.ts:49-54, 143-146`).

---

## 6. Rủi ro / giả định đã biết

### Nhóm A — Phân quyền

**R-01 · `can()` v2 KHÔNG có nhánh DENY** — grant `DENY` bị vứt IM LẶNG
`lib/auth/can.ts:52-59` là ALLOW-wins thuần: `isSuperAdmin` → `grantsAllow.has(action)` → duyệt `permissions` → `false`.
Không tồn tại biến `grantsDeny`. `lib/auth/actor.ts:367-371` chỉ lọc `g.grant === "ALLOW"`.
Hành vi này được **GHIM BẰNG TEST** (`lib/auth/can.test.ts:129-135`, `[A0-03-T6-02]`) ⇒ là **thiết kế**, không phải bug chưa vá.
→ Muốn chặn quyền: **gỡ `UserOrgRole`**, đừng tạo `DENY`.
Nhánh DENY thật chỉ tồn tại ở engine mới `lib/permissions/can.ts:117-122` trên bảng `PermissionGrant`.

**R-02 · UI nói dối về hiệu lực của DENY**
Màn `/admin/users/[id]/permissions` in cho người dùng dòng "DENY > ALLOW > role matrix"
(`app/(admin)/admin/users/[id]/permissions/page.tsx:107-111`) — đúng với v1 (`lib/auth/permissions.ts:793-796`),
**SAI với v2** đang enforce trên prod.

**R-03 · Lệch v1/v2 giữa local và prod**
`isRbacV2Enabled()` = `process.env.RBAC_V2_ENABLED === "true"` — **mặc định OFF trong code** (`lib/flags.ts:7-9`).
`lib/auth/shadow-compare.ts:27` trả `flagOn ? v2 : v1`. Local/dev/CI chạy **v1 matrix tĩnh**, prod chạy **v2 động từ DB**.
`can()` v1 (`lib/auth/permissions.ts:764`) **KHÔNG nhận `target`** ⇒ không đo `centerId` gì cả.
→ **Không kết luận hành vi cách ly cơ sở từ máy local.** Trạng thái prod chỉ có bằng chứng gián tiếp trong
comment `.github/workflows/seed-prod-roles.yml:13`, **không kiểm chứng được từ repo**.

**R-04 · `scopedDb` KHÔNG che đường ghi** — nguồn của 2 lớp lỗi
`lib/db-scope.ts:347-375` chỉ hook 7 method đọc.
→ (a) quên `passesScope()` trước `update`/`delete` = **IDOR ghi chéo cơ sở**;
→ (b) quên set `centerId` khi `create` = bản ghi **tàng hình** với actor cấp cơ sở.
Cùng họ: nested `include` không được scope (`lib/db-scope.ts:4-5`).

**R-05 · `isHoLevel` bật chỉ cần MỘT dòng vai neo tại HO/ROOT** ⇒ `visibleCenterIds` = **mọi cơ sở sống**
(`lib/auth/actor.ts:255, 278-281`). Không form nào cảnh báo; chỉ có comment `lib/auth/legacy-role-map.ts:94-95`.

**R-06 · Grant per-user ALLOW mở "ALL" cho cả model**
`lib/db-scope.ts:248-254`: grant ALLOW khớp prefix action ⇒ `hasAll = true` ("per-user grants are global exceptions").
Cấp một quyền hẹp lại **mở tầm nhìn dữ liệu toàn hệ thống** cho model đó.

**R-07 · Fail-open khi quên map prefix** — `lib/db-scope.ts:226-228, 257-263`.
Comment `lib/db-scope.ts:176-180` ghi lại đúng một lần đã dính: `Attendance` flip sang SCOPED nhưng quên map prefix
⇒ ai có 1 vai HO đều thấy điểm danh toàn hệ thống. Model mới thêm vào `SCOPED_MODELS` mà quên `getModelPrefixes`
sẽ lặp lại, **im lặng**.

**R-08 · Vi phạm luật cứng #1 trên diện rộng** — **63 lần** đọc `session.user.centerId` ở **39 file**, viết điều kiện
quyền/so `centerId` thẳng trong Server Action và page. Ba nhóm nguy hiểm:

| Nhóm | Ví dụ |
|---|---|
| Gate quyền | `app/(admin)/admin/centers/page.tsx:19`, `app/(admin)/admin/cham-cong/page.tsx:40-41` |
| So sánh bằng (chặn oan người kiêm 2 cơ sở) | `app/(admin)/admin/classes/_actions.ts:965`, `app/(admin)/admin/teachers/_actions.ts:36`, `app/(teacher)/teacher/don-tu/_actions.ts:145` |
| Đường ghi (gắn sai cơ sở) | `app/(admin)/admin/cham-cong/lich-ca/_actions.ts:80,87,98,105`, `lib/finance/payment.ts:98` |

Thêm nữa: `session.user.centerId` nằm **trong JWT** (`lib/auth.ts:195, 210, 234`) ⇒ **STALE** cho tới khi `tokenVersion`
bump / re-login, trong khi `resolveActor` đọc DB mỗi request. **Hai nguồn khác nhau chạy song song.**

**R-08b · JWT mang role/scope/grants — mâu thuẫn luật cứng #6**
`lib/auth.ts:203-213` nhét `role`, `roles[]`, `centerId`, `grants[]` vào token. Khi v2 bật, đường quyết định là
`resolveActor` đọc DB nên đúng luật về bản chất; khi v2 tắt (local/dev/CI), **JWT LÀ nguồn quyền**.

**R-08c · `WorkScope` chỉ hiệu lực cho người hưởng vai qua `PositionAssignment`**
`resolveActorUncached` dựng rows từ `UserOrgRole` mà **KHÔNG set `workScopeOrgUnitIds`** (`lib/auth/actor.ts:511-526`);
chỉ `loadPositionRoleRows` mới set (`lib/org/positions.ts:203-206`).
⇒ Điều động một người chỉ có `UserOrgRole` **không có tác dụng gì, và không báo lỗi**.

**R-08d · `reconcileUserOrgRoles` không thu hồi vai gán tay**
Gán theo trạng thái thật nhưng thu hồi theo diff bảng ánh xạ (`lib/auth/legacy-role-map.ts:96-121`).
⇒ Vai gán tay ở `/admin/users/[id]/org-roles` (vd cơ sở thứ 2) **giữ vĩnh viễn** khi admin đổi "Đơn vị" trên form user.

### Nhóm B — Multi-tenant / dữ liệu

**R-09 · BA định nghĩa "doanh thu" khác nhau cùng tồn tại**

| # | Công thức | Trục ngày | Nơi dùng |
|---|---|---|---|
| a | `Σ Payment.amount WHERE accountantStatus='CONFIRMED'` | `Payment.paidDate` | `app/(admin)/admin/bao-cao/doanh-thu/page.tsx:66-71`, `.../manager-dashboard.tsx:95`, `.../bao-cao/trung-tam/page.tsx:331` |
| b | `Σ Order.totalAmount WHERE status IN (CONFIRMED, COMPLETED)` | `Order.paidAt` | `.../dashboard/_components/accountant-dashboard.tsx:26-31` |
| c | `Σ Order.totalAmount WHERE status IN (CONFIRMED, COMPLETED)` | **không lọc ngày** | `lib/crm/funnel-query.ts:17-20` (ROAS) |

Ba màn ra ba con số khác nhau cho cùng một kỳ.

**R-10 · Hoàn tiền KHÔNG trừ khỏi doanh thu** (xác nhận trên code hiện tại)
`refundPayment` tạo dòng `Payment` **mới** với `amount` âm + `accountantStatus: "REFUNDED"`, **KHÔNG động đến dòng gốc**
(`lib/finance/payment.ts:600-632`). Mọi truy vấn lọc cứng `accountantStatus: "CONFIRMED"`:
- `app/(admin)/admin/bao-cao/doanh-thu/page.tsx:66` — dòng âm bị loại, dòng gốc vẫn cộng
- `lib/finance/debt.ts:134` — công nợ không tăng lại
- `lib/portal/billing.ts:117-119` — phụ huynh vẫn thấy "đã đóng đủ"
- `lib/reports/trung-tam.ts:67-79` — nơi **duy nhất** gom `refundedAmount`, nhưng hiện **tách rời**, không trừ vào `confirmedRevenue` cũng không trừ vào `debt`

**R-10b · Điều chỉnh (`adjustPayment`) bị bỏ qua im lặng** — cùng cơ chế, `accountantStatus: "ADJUSTED"`
(`lib/finance/payment.ts:541-557`). Không cộng đôi, nhưng **cũng không có tác dụng**: con số gốc sai vẫn dùng y nguyên.

**R-10c · Hai cơ chế hoàn tiền không nói với nhau**
Duyệt `RefundRequest` chỉ đổi `status` + ghi audit, **KHÔNG sinh bút toán** (`lib/finance/refund.ts:160-168`).
Enum `RefundStatus` có giá trị `PAID` (`prisma/schema.prisma:5947`) nhưng **KHÔNG TÌM THẤY** code nào set nó
⇒ vòng đời hoàn tiền không bao giờ đóng.

**R-11 · Tiền về qua cổng CHƯA phải doanh thu** — dòng `Payment` sinh từ `allocateToOrder` có
`accountantStatus: "PENDING"` (`lib/payments/payos-ingest.ts:1050-1053`). Tiền đã vào tài khoản ngân hàng thật
nhưng không nằm trong "doanh thu thực" cho tới khi kế toán bấm xác nhận tay.

**R-12 · Lệch mốc thời gian kỳ** — dòng auto đặt `paidDate: new Date()` (thời điểm xử lý webhook), **không** lấy
`BankTransaction.transferredAt` (`lib/payments/payos-ingest.ts:1049`, `lib/finance/payment.ts:106`).
Webhook trễ / cron bơm trễ qua nửa đêm ⇒ tiền về ngày 31 rơi sang kỳ sau.

**R-13 · Bản ghi `Center("hoi-so")` mồ côi** — `prisma/seed-orgunit.ts:40-43`.
**ĐỪNG nới V7 để "vá"**: đã thử ở US-05 và phải gỡ, vì màn nhân sự suy đơn vị neo RBAC v2 từ `Center` của nhân sự
⇒ người Hội sở được neo vai TẠI HO ⇒ `isHoLevel` ⇒ **thấy mọi cơ sở** (`lib/org/orgunit-rules.ts:65-97`).

**R-14 · Hai cầu ánh xạ Center→OrgUnit KHÔNG tương đương**
`orgUnitIdForCenter()` chỉ dùng FK (`lib/org/org-service.ts:399-409`) ⇒ trả `null` cho Center mồ côi;
dual-write + backfill SQL có thêm cầu theo `code` (`lib/org/dual-write.ts:67-85`, `lib/org/center-bridge.ts:324-336`);
`lib/hr/employee-unit.ts:22-27` lại **cấm** dùng cầu theo code.
⇒ Cùng câu hỏi, ba câu trả lời tuỳ chỗ gọi.

**R-15 · `Center` nằm trong `SCOPE_EXEMPT`** ⇒ `scopedDb(actor).center.findMany()` là **pass-through**, trả về
**TẤT CẢ** cơ sở (`lib/db-scope.ts:100-107`, kèm TODO chưa audit xong).
Hầu hết trang list đổ thẳng kết quả này vào dropdown lọc (vd `app/(admin)/admin/students/page.tsx:250-254`).
Không rò rỉ **số liệu** (model nghiệp vụ đã scoped) nhưng rò rỉ **metadata tổ chức**.
Helper an toàn có sẵn: `resolveReportFilters()` (`lib/reports/filters.ts:50-85`, có chống IDOR qua URL ở dòng 70-71).

### Nhóm C — Hạ tầng / cấu hình

**R-16 · CSP đang là `Content-Security-Policy-Report-Only`** (`next.config.ts`, khối `securityHeaders`) —
mọi vi phạm **chỉ hiện trong console, KHÔNG chặn**.

**R-17 · Rate limit fail-soft về Map per-instance** (`lib/rate-limit.ts:143-146`).
Không đặt `UPSTASH_*`/`KV_*` ⇒ mọi rate-limit (kể cả chống brute-force đăng nhập, `lib/auth.ts:127-135`) chỉ là trang trí.

**R-18 · Webhook lead fail-OPEN ngoài production** — `lib/lead/webhook.ts:44-56, 92-104` chỉ fail-closed khi
`NODE_ENV === "production"`. Môi trường đặt sai `NODE_ENV` + thiếu secret ⇒ nhận lead từ bất kỳ ai.

**R-19 · payOS thiếu `PAYOS_CHECKSUM_KEY` = nhận payload không chữ ký** (`lib/payments/payos.ts:165-168`).
Ngược hẳn triết lý SePay (thiếu env = từ chối tất cả).

**R-20 · Một credential R2 điều khiển CẢ hai bucket** — bucket công khai `cdn.satarobo.vn` **và** bucket ảnh chat
(`lib/storage/chat-storage.ts` dùng `getR2Client()` của `lib/storage/r2-client.ts`).
Guard `lib/storage/chat-storage.ts:57-64` chỉ chặn **trỏ nhầm tên bucket**, không chặn lộ key.

**R-21 · Cờ `MEDIA_SIGNED_URL` mặc định OFF** (`lib/flags.ts:81`) ⇒ ảnh lớp **mặc định vẫn là URL công khai** trên
`cdn.satarobo.vn`.

**R-22 · Ba cờ không có consumer** — `isCommonLoginEnabled` (`lib/flags.ts:36`), `isScopeShadowEnabled`
(`lib/flags.ts:21` — nhưng env `SCOPE_SHADOW_ENABLED` vẫn được đọc trực tiếp ở `instrumentation.ts:22`),
`isPaymentLedgerV2Enabled` (`lib/flags.ts:168`, có chủ đích: `lib/flags.ts:163-165`).

**R-23 · Sáu biến khai trong `.env.example` nhưng KHÔNG có code nào đọc** — đặt giá trị sẽ **không có tác dụng nào**:
`META_APP_ID` (`.env.example:77`), `EMAIL_FROM` (`:87`), `ZALO_OA_TOKEN` (`:141`), `AUTH_TRUST_HOST` (`:31` —
`lib/auth.ts:85` hardcode `trustHost: true`), `ZALO_OA_ID` (`:115`).

**R-24 · `AUTH_SECRET` là mìn** — `.env.example:25-28` cảnh báo next-auth ưu tiên `AUTH_SECRET` hơn `NEXTAUTH_SECRET`;
đặt khác giá trị = chết mọi phiên, không một dòng cảnh báo. Nhưng `lib/security/signing-key.ts:12` đọc theo thứ tự
**NGƯỢC** (`NEXTAUTH_SECRET ?? AUTH_SECRET`) — hai thành phần ưu tiên khác nhau trên cùng cặp biến.

**R-25 · Môi trường `test` dùng CHUNG DB với local (dev)** — migration `DROP`/`RENAME` chạy trên `test` sẽ xoá dữ liệu
đang làm việc ở local. `.github/workflows/migrate-test.yml` chỉ có bước chặn trỏ nhầm vào DB **PROD**, không tách test khỏi dev.

### Nhóm D — Mâu thuẫn doc ↔ code (đã phân xử, TIN CODE)

| # | Chỗ nói sai | Sự thật trong code |
|---|---|---|
| M-01 | `prisma/seed-orgunit.ts:15-18` (header) nói `OrgUnit("HO").centerId = Center("HO")` | `prisma/seed-orgunit.ts:38-42` đặt `centerCode: null` CÓ CHỦ ĐÍCH — header là tàn dư của bản nới V7 đã bị gỡ |
| M-02 | `prisma/schema.prisma:347` comment "P1 nới cho cả HO" | `lib/org/orgunit-rules.ts:88-96` **vẫn ném** `ORG_CENTERID_NOT_CENTER`; khối chú thích `:65-86` nói việc nới đã bị GỠ |
| M-03 | `lib/org/org-service.ts:315-318` "sau khi V7 được nới… Center 'hoi-so' hết mồ côi" | V7 **chưa từng** được nới thành công |
| M-04 | `lib/org/org-service.ts:334` + `lib/org/org-tree.ts:76` "HO → `[]` (OI-1)" | LỖI THỜI sau reshape P1: HO nay là tổ tiên mọi CENTER ⇒ `getSubtreeCenterIds(HO)` trả **đủ** danh sách cơ sở (`lib/org/org-tree.ts:3-9` nói đúng) |
| M-05 | `lib/org/org-service.ts:352-354` tự xưng `getSelectableOrgUnits` là "NGUỒN DUY NHẤT cho mọi center-picker FE/BE" | **Không** bộ lọc list nào gọi nó — chỉ các màn form new/edit dùng; list dùng `sdb.center.findMany()` |
| M-06 | `lib/db-scope.ts` comment về `LeadAssignmentConfig` ("null = quy tắc toàn hệ thống") | `lib/org/center-bridge.ts:105` nói thẳng là **SAI** so với schema (`centerId String @unique` NOT NULL) |
| M-07 | Tên file `lib/auth/action-registry.ts` gợi ý là danh mục gốc | Chỉ re-export `ALL_ACTIONS` (`lib/auth/action-registry.ts:5-8`); danh mục gốc là hằng `PERMISSIONS` trong `lib/auth/permissions.ts` (182 key) |
| M-08 | Key `leads:export` khai đủ 3 chỗ (`lib/auth/permissions.ts:67,362`, `lib/permissions/registry/crm.ts:29`, `prisma/seed-roles.ts:229,411`) | **KHÔNG có call-site enforce nào** — route export thật gate bằng `leads:view-all` (`app/api/admin/leads/export/route.ts:29`). Gỡ `leads:export` của một vai **không chặn được gì** |
| M-09 | `lib/dashboard/widget-registry.ts` có `visibleWidgets(actor)` lọc widget theo `can()` | **DEAD CODE** — không dòng code sản phẩm nào import. Dashboard chọn panel bằng `hasRole`/`hasAnyRole` (`app/(admin)/admin/dashboard/page.tsx:59, 69-82`) |

---

## 7. Tài liệu liên quan

### 7.1. Bộ tài liệu lõi (cùng thư mục `documentation/`)

| Tài liệu | Nội dung | Trạng thái |
|---|---|---|
| `documentation/architecture.md` | **File này** — kiến trúc, multi-tenant, đường biên tin cậy, rủi ro | — |
| `documentation/flows.md` | Hành trình người dùng theo vai + mọi chỗ băng qua đường biên tin cậy (browser→server, server→provider, cron→app, webhook→app) | xem file |
| `documentation/permissions.md` | Ma trận quyền: 182 key trong `lib/auth/permissions.ts`, 15 RoleDef trong `prisma/seed-roles.ts`, 6 `ScopeType`, hai thế hệ grant (`UserPermissionGrant` cũ vs `PermissionGrant` mới) | xem file |
| `documentation/variables.md` | ~95 biến môi trường, 18 cờ trong `lib/flags.ts`, phân loại server/client + mức rủi ro nếu lộ | xem file |

### 7.2. Tài liệu CÓ ĐIỀU KIỆN

| Tài liệu | Áp dụng cho repo này? | Lý do |
|---|---|---|
| Email | **CÓ** — cần viết | Resend (`lib/email/resend.ts`), hàng đợi `EmailQueue` + cron `email-queue`, ZNS Zalo với 4 mã mẫu (`ZALO_ZNS_TEMPLATE_{ATTENDANCE,DEBT,ACCOUNT,PAYMENT}`) |
| Cron / công việc theo lịch | **CÓ** — cần viết | 23 job trong `vercel.json`, khớp 1-1 với `app/api/cron/`, xác thực `CRON_SECRET` (`lib/cron/auth.ts:9-15`) |
| SEO | **CÓ** — cần viết | Site public có `metadata`, JSON-LD (`lib/seo/jsonld`), `app/robots.ts`, sitemap; admin/teacher/elearning gắn `X-Robots-Tag: noindex` (`proxy.ts:88-91, 167-169`) |
| Agent/automation nhúng (LLM) | **KHÔNG áp dụng** | Không tìm thấy SDK LLM nào trong `package.json` (không `@anthropic-ai/*`, không `openai`, không `ai`); scope Doc 15 §0 đã LOẠI "AI learning path/prediction", nhu cầu dự báo làm rule-based |

### 7.3. Tài liệu nguồn trong repo (không thuộc `documentation/`)

- `CLAUDE.md` — luật cứng cho agent + hiện trạng repo.
- `Document/2-architecture-design/15-final-architecture-blueprint.md` — blueprint chốt (đọc kèm phần gạch ngang + `[ĐẢO ...]`).
- `docs/nen-he-thong/RUNBOOK-P1.md` — runbook dời cây OrgUnit.
- `docs/chat-realtime/00-dieu-chinh-cho-repo.md` + `docs/chat-realtime/architecture.md` — luật riêng module chat.
- `.claude/rules/{client-site,admin-site,ui-libraries,prisma-db}.md` — luật theo khu vực.
