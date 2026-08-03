# Trường dữ liệu: Phụ huynh & Nhân sự — hiện trạng

> Nguồn: đọc trực tiếp `prisma/schema.prisma` (5595 dòng) + `lib/validators/*` + `lib/phone.ts` + `lib/auth/permissions.ts`, ngày **01/08/2026**, nhánh `test`.
> Mọi số dòng trong tài liệu là số dòng tại thời điểm đọc — thay đổi schema có thể làm lệch.

**Hai điều phải biết trước khi đọc:**

1. **KHÔNG có bảng `Parent` riêng.** Thông tin phụ huynh nằm rải ở 4 model: `User` (tài khoản), `Lead` + `LeadChild` (khách chưa chuyển đổi), `Student` (bản sao denormalized), `Affiliate` (nếu PH giới thiệu người khác).
2. **`Employee` ≠ `User`.** Hai bảng tách biệt, nối 1-1 qua `User.employeeId` (@unique, `onDelete: SetNull`). `Employee` = hồ sơ nhân sự (HR); `User` = tài khoản đăng nhập + quyền.

---

## A. THÔNG TIN PHỤ HUYNH

### A1. `User` — tài khoản đăng nhập của phụ huynh (`schema.prisma:708`)

| Trường | Kiểu | Quy định |
|---|---|---|
| `id` | String | `cuid()` |
| `name` | String? | Zod portal: trim, 2–120 ký tự (`app/(portal)/portal/ho-so/actions.ts:88`) |
| `email` | String? **@unique** | nullable từ AUTH-SĐT P3 (PH chỉ có SĐT vẫn tạo được tài khoản); nhân sự vẫn **bắt buộc email ở tầng validator** (QĐ-C), không phải ở DB |
| `emailVerified` | DateTime? | `@db.Timestamptz(6)` |
| `phone` | String? **@unique** | **LUÔN canonical `84XXXXXXXXX`** (`lib/phone.ts:24`) — là khoá đăng nhập |
| `phoneVerifiedAt` | DateTime? | |
| `password` | String? | bcrypt hash (cost 10); plaintext 8–72 ký tự |
| `image` | String? | |
| `role` | `Role` = `SALES_CSM` | vai trò CHÍNH; phụ huynh = `PARENT` |
| `roles[]` | `Role[]` = `[]` | đa vai trò — quyền = union |
| `centerId` | String? | FK `Center` |
| `orgUnitId` | String? | song song `centerId` (PR-A dual-write) |
| `isActive` | Boolean = `true` | |
| `accountStatus` | `AccountStatus` = `ACTIVE` | `PENDING_ACTIVATION` / `ACTIVE` / `DISABLED` (`schema.prisma:4244`) |
| `mustChangePassword` | Boolean = `false` | BGĐ 31/07 — admin cấp/reset MK → ép đổi ngay lần đăng nhập kế tiếp |
| `tokenVersion` | Int = `0` | tăng để vô hiệu hoá JWT cũ |
| `lastLoginAt` | DateTime? | |
| `cccd` | String? | **CCCD/CMND phụ huynh** (PII) |
| `address` | String? | |
| `ward` | String? | phường/xã (cơ cấu 2 cấp 2025) |
| `city` | String? | tỉnh/thành — **không có `district` ở đây** |
| `employeeId` | String? @unique | null với phụ huynh |
| `deletedAt` / `createdAt` / `updatedAt` | DateTime | soft delete |

Quan hệ chính: `children Student[]` — 1 phụ huynh ↔ N con. **Học sinh KHÔNG có tài khoản riêng.**

Index: `email`, `phone`, `centerId`, `role`, `deletedAt`, `orgUnitId`.

### A2. `Student` — thông tin PH lưu lặp trên hồ sơ con (`schema.prisma:1175`)

Khối "Parent / Guardian" (`:1189–1199`):

| Trường | Kiểu DB | Quy định |
|---|---|---|
| `parentName` | String? | **Zod BẮT BUỘC** `min(1)` (`lib/validators/student.ts:76`) — DB để nullable chỉ vì hàng seed cũ |
| `parentPhone` | String? | **Zod BẮT BUỘC**; từ P6 lấy từ `User.phone`, form portal không ghi tự do |
| `parentEmail` | String? | regex email, `""` → null |
| `parentRelation` | String? | text tự do (bố / mẹ / ông …) |
| `parentNationalId` | String? | **CCCD phụ huynh — CHỈ của PH, KHÔNG lưu CCCD học viên** (#15 câu 32); PII: mask + break-glass + audit |
| `parent2Name` | String? | phụ huynh thứ hai |
| `parent2Phone` | String? | được canonical hoá khi ghi từ portal |
| `parent2Relation` | String? | |
| `parentUserId` | String? | FK → `User`, `onDelete: SetNull` |

Địa chỉ hộ (lưu trên Student, khác User): `address`, `ward`, `district`, `city` — **Student CÓ `district`, User thì KHÔNG**.

Các trường khác của Student (bối cảnh): `name`, `studentCode` @unique, `dateOfBirth`, `gender`, `phone`, `email`, `avatarUrl`, `currentGrade` (int 1–12), `school`, `bloodType` (`BloodType`), `allergies[]`, `healthNotes`, `enrollmentDate` (`@db.Date`), `preferredCenterId`, `preferredOrgUnitId`, `notes`, `status` (`StudentStatus` = `ACTIVE`), `centerId`, `orgUnitId`, `classGroupId`, `deletedAt`.

### A3. `Lead` — khách hàng phụ huynh chưa chuyển đổi (`schema.prisma:972`)

**Định danh & liên hệ**

| Trường | Quy định (`lib/validators/lead.ts`) |
|---|---|
| `parentName` | String, **bắt buộc**, 2–100 ký tự |
| `phone` | String, **bắt buộc**, qua `phoneVn` → canonical `84…` |
| `email` | optional, định dạng email hoặc `""` |
| `childName` | optional ≤100 — **legacy read-only**, đã thay bằng `LeadChild` (2-phase, KHÔNG drop) |
| `childAge` | optional int **3–18** — legacy như trên |

**Phân bổ:** `centerId?`, `orgUnitId?`, `courseId?` (khoá quan tâm), `assignedToId?` (Sale), `adminId?` (Sale Admin xử lý L1→L2), `affiliateId?`, `expectedCourseId?`, `expectedProductId?`, `orderKind?` (`OrderKind`).

**Chia sẻ đội (#11 T1):** `isSharedWithTeam` = false, `sharedAt?`, `sharedById?` — chỉ owner hoặc CENTER_MANAGER bật/tắt.

**Trạng thái:** `status` = `LeadStatus` = `NEW`. 15 giá trị (`schema.prisma:37`):
`NEW`, `ASSIGNED`, `CONTACTED`, `NO_ANSWER`, `CONSULTING`, `TRIAL_SCHEDULED`, `TRIAL_ATTENDED`, `AWAITING_DECISION`, `ENROLLED`, `NURTURING`, `LOST`, `DUPLICATE`, `DEMO_SCHEDULED` (deprecated — đã map sang TRIAL_SCHEDULED), `TRIAL_IN_PROGRESS`, `REGISTERED`.

**Marketing / tracking:** `source` (bắt buộc), `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, `utmTerm` (mỗi cái ≤100), `fbclid`, `gclid`, `fbp`, `fbc`, `eventId` @unique (min 8 ký tự), `landingPage` (URL hợp lệ), `referrer`, `ipAddress`, `userAgent` (Text), `consentMarketing` = false.

**Ghi chú & mốc phễu SR.QD.217:** `note` (≤500), `handoverNote` (Text), `qualifiedAt` (L2 — có SĐT + note), `handedAt` (HO bàn giao về CS), `receivedConfirmedAt`, `assignedAt`, `firstContactAt`, `convertedById`, `convertedAt`, `lastActivityAt` (SLA lead_idle_24h đọc field này), `commissionSource?` (`MARKETING_ADMIN` / `SALE_SELF` / `REFERRAL`).

**Chống bot — chỉ ở input, KHÔNG lưu DB:** `website` (honeypot: `max(0)` ký tự), `timeOnPage` (giây, int ≥0), `ref` (mã affiliate ≤32 ký tự — sai thì bỏ qua, không lỗi).

### A4. `LeadChild` — con của lead (`schema.prisma:1118`, R7-01)

| Trường | Quy định |
|---|---|
| `leadId` | FK, `onDelete: Cascade` |
| `fullName` | **bắt buộc**, trim, min 1 |
| `dob` | `@db.Date`, **KHÔNG cho ngày tương lai** (`refine`) |
| `ageYears` | int **1–18** |
| `gender`, `schoolName`, `gradeLevel` | String? tự do |
| `interestedCourseId`, `interestedCenterId` | String? — **không ràng FK cứng** (additive) |
| `note` | Text? |
| `trialStatus` | `LeadChildTrialStatus` = `NONE` |

### A5. `Affiliate` — người/đối tác giới thiệu (`schema.prisma:1089`, BGĐ 31/07)

`code` @unique (CHỮ HOA + số, không dấu — dùng trong link `?ref=<code>`), `name`, `phone?`, `email?`, `userId?` (gắn về tài khoản PH/HV nếu có), `centerId?` (null = toàn hệ thống), `commissionPercent?` (Float), `isActive` = true, `note?`, `createdById?`.

⚠️ `commissionPercent` **chỉ là tỉ lệ tham chiếu để đối soát tay** — chưa có quy chế hoa hồng, model này **KHÔNG tự sinh phiếu chi**.

---

## B. THÔNG TIN NHÂN SỰ

### B1. `Employee` — hồ sơ nhân sự (`schema.prisma:2023`)

Chia 3 tier theo mức nhạy cảm (tương ứng nhóm visibility ở §C6).

**Tier 1 — cơ bản**

| Trường | Kiểu | Quy định (`lib/validators/employee.ts`) |
|---|---|---|
| `employeeCode` | String **@unique** | 3–20 ký tự, regex `^[A-Za-z0-9.-]+$` ("Mã NV chỉ chứa chữ, số, dấu chấm/gạch") |
| `fullName` | String | 2–120 |
| `jobTitle` | String | 2–200 |
| `department` | `Department` | enum 10 giá trị — 2-phase, dual-write với `departmentId` (drop ở PR-E) |
| `departmentId` | String? → `DepartmentDef` | FK động, `onDelete: SetNull` |
| `avatarUrl` | String? | phải là URL hợp lệ; `""` → null |
| `email` | String? **@unique** | định dạng email; `""` → null |
| `joinedAt` | DateTime? | `coerce.date` |
| `bio` | String? Text | |
| `isActive` | Boolean = `true` | |
| `isPublic` | Boolean = `false` | hiện trên site công khai |
| `displayOrder` | Int = `0` | |
| `isCEO` | Boolean = `false` | **chỉ 1 employee `true` tại một thời điểm** |

**Tier 2 — HR**

| Trường | Kiểu | Quy định |
|---|---|---|
| `phone` | String? | **tự do, KHÔNG canonical hoá** (có thể là số bàn cơ sở — `lib/phone.ts:51`) |
| `dateOfBirth` | DateTime? | |
| `gender` | `Gender`? | MALE / FEMALE / OTHER |
| `contractType` | `ContractType`? | 7 giá trị |
| `salaryRank` | Int? | **1–9** |
| `salaryLevel` | Int? | **1–5** |
| `endDate` | DateTime? | ngày kết thúc HĐ (hợp đồng có thời hạn) |
| `bhxhBase` | Int? | mức lương đóng BHXH — **VND số nguyên, ≥0, `Math.round()`** (H5/COL2) |
| `address` | String? | |
| `emergencyContact` | String? | format quy ước: `Tên - Quan hệ - SĐT` |
| `notes` | String? Text | |

**Tier 3 (Phase C1) — mở rộng**

| Trường | Kiểu | Quy định |
|---|---|---|
| `nationalId` | String? | CCCD / CMND nhân sự |
| `status` | `EmploymentStatus` = `ACTIVE` | ACTIVE / ON_LEAVE / RESIGNED / TERMINATED |
| `subjects[]` | String[] = `[]` | môn dạy (chủ yếu GIANG_DAY / DAO_TAO); mỗi phần tử trim, min 1 |
| `certifications[]` | String[] = `[]` | chứng chỉ chuyên môn |

**Tổ chức & meta:** `centerId?`, `orgUnitId?` (PR-C: **OrgUnit là nguồn chính**, `centerId` suy ra — HO → null), `managerId?` (self-relation `EmployeeManager`, `onDelete: SetNull`), `createdById?`, `createdAt`, `updatedAt`.

Index: `department`, `isActive`, `isPublic`, `isCEO`, `status`, `orgUnitId`, `centerId`, `[centerId, status]`.

⚠️ `Employee` ∈ `SCOPED_MODELS` → `centerId` bị inject vào WHERE ở mọi read qua `scopedDb`.

### B2. `DepartmentDef` — phòng ban động (`schema.prisma:1971`)

`code` @unique (khớp enum cũ: `DAO_TAO`, `MARKETING`, …), `name`, `displayOrder` = 0, `isTeaching` = false (GIANG_DAY/DAO_TAO → hiện UI giảng dạy), `isActive` = true.

### B3. `TeacherProfile` — hồ sơ giáo viên (`schema.prisma:930`)

| Trường | Kiểu | Giá trị |
|---|---|---|
| `userId` | String **@unique** | FK `User`, `onDelete: Cascade` |
| `rank` | `TeacherRank` = `TRAINEE` | TRAINEE / JUNIOR / ADVANCED / SENIOR / EXPERT |
| `employmentType` | `EmploymentType` = `PARTTIME` | FULLTIME / PARTTIME |
| `status` | `TeacherStatus` = `ACTIVE` | ACTIVE / ON_LEAVE / INACTIVE |
| `bio` | String? Text | |

Bảng phụ:
- `TeacherCourse` — n-n GV ↔ khoá dạy được (`@@id([teacherProfileId, courseId])`).
- `TeacherReview` — đánh giá nội bộ/dự giờ: `reviewerId?`, `reviewerName`, `score` (**1–5**), `note?`.

### B4. `EmployeeOrgAssignment` — phân công / kiêm nhiệm (`schema.prisma:446`)

| Trường | Quy định |
|---|---|
| `employeeId`, `orgUnitId` | bắt buộc |
| `roleInOrg` | String? — mô tả vai trò nghiệp vụ, **KHÔNG phải `RoleDef`** |
| `assignmentType` | `AssignmentType`: PRIMARY / SECONDARY / SUPPORT / SUBSTITUTE / SHARED |
| `effectiveFrom` | DateTime = now() |
| `effectiveTo` | DateTime? |
| `status` | `AssignStatus` = `ACTIVE` |
| `allocationPercent` | Int? **0–100** — phân bổ chi phí/lương |
| `createdById` | bắt buộc |

⚠️ **Bảng này KHÔNG tự sinh quyền.** Quyền chỉ đến từ `UserOrgRole` (Doc 15 §2).

### B5. Tài khoản nhân sự — quy định riêng ở `lib/validators/user.ts`

| Trường | Quy định |
|---|---|
| `name` | 1–100 ký tự |
| `email` | **BẮT BUỘC**, định dạng email, `.toLowerCase().trim()` |
| `roles[]` | tối thiểu 1 vai trò |
| `primaryRole` | **PHẢI nằm trong `roles`** (`refine`: "Vai trò chính phải nằm trong các vai trò đã chọn") |
| `password` | 8–72 ký tự (create); reset yêu cầu `newPassword === confirmPassword` |
| `phone` | ≤20 ký tự, canonical hoá; sai → "Số điện thoại không hợp lệ"; rỗng → null |
| `centerId` / `orgUnitId` / `employeeId` | nullable optional |

> HO **KHÔNG phải role** — đơn vị độc lập, đi qua `orgUnitId`.

### B6. Enum nhân sự

- **`Role`** (9, `schema.prisma:18`): `SUPER_ADMIN`, `CENTER_MANAGER`, `HR`, `SALES_CSM`, `TEACHER`, `TRAINING`, `MARKETING`, `ACCOUNTANT`, `PARENT`.
  - `TRAINING` (FL W0, QĐ-T1) = Đào tạo, quản lý **toàn bộ** LMS — khác `TEACHER` (chỉ lớp được giao).
  - `PARENT` không có quyền admin nào; quyền portal check riêng qua `activeSite`.
- **`Department`** (10, `:1985`): `BAN_GIAM_DOC`, `DAO_TAO`, `MARKETING`, `KINH_DOANH`, `IT`, `HANH_CHANH_NHAN_SU`, `KE_TOAN`, `TUYEN_SINH`, `GIAO_VU`, `GIANG_DAY`.
- **`Gender`** (`:1999`): `MALE`, `FEMALE`, `OTHER`.
- **`ContractType`** (`:2005`): `FULLTIME`, `PARTTIME`, `INTERN`, `FREELANCE`, `THU_VIEC`, `CHINH_THUC_XAC_DINH`, `CHINH_THUC_KHONG_XAC_DINH`.
- **`EmploymentStatus`** (`:2016`): `ACTIVE` (đang làm), `ON_LEAVE` (tạm nghỉ), `RESIGNED` (nghỉ tự nguyện), `TERMINATED` (bị cho nghỉ).
- **`AssignmentType`** (`:438`): `PRIMARY`, `SECONDARY`, `SUPPORT`, `SUBSTITUTE`, `SHARED`.
- **`TeacherRank` / `EmploymentType` / `TeacherStatus`** (`:911–928`): xem §B3.

### B7. Enum liên quan phụ huynh

- **`StudentStatus`** (`:1156`): `ACTIVE` (đang học), `PAUSED` (bảo lưu), `GRADUATED`, `INACTIVE` (nghỉ hẳn).
- **`BloodType`** (`:1163`): `A_POS`, `A_NEG`, `B_POS`, `B_NEG`, `O_POS`, `O_NEG`, `AB_POS`, `AB_NEG`, `UNKNOWN`.
- **`AccountStatus`** (`:4244`): `PENDING_ACTIVATION`, `ACTIVE`, `DISABLED`.
- **`OtpChannel`** (`:4250`): `EMAIL`, `SMS` (**QĐ-H 30/07 bỏ hẳn — giữ value vì enum Postgres không xoá được, KHÔNG dùng**), `ZALO`, `OFFLINE` (cấp mã tại quầy khi ZNS chết).
- **`OtpPurpose`** (`:4260`): `ACTIVATION`, `RESET`, `CHANGE_CONTACT`.
- **`GrantType`** (`:13`): `ALLOW`, `DENY` — ⚠️ xem cảnh báo §D.

---

## C. QUY ĐỊNH CHUNG VỀ BIẾN

### C1. Số điện thoại — `lib/phone.ts` là NGUỒN DUY NHẤT

- **Canonical lưu DB = `84XXXXXXXXX`**. Regex duy nhất của repo: `PHONE_VN_RE = /^84[35789][0-9]{8}$/` (`lib/phone.ts:24`).
- Chọn `84…` (không phải `+84…`/`0…`) vì: khớp thẳng payload ZNS; ký tự `+` bị Excel hiểu là công thức.
- `canonicalPhone(raw)` xử lý được: `0905123456`, `+84905123456`, `0084905123456`, `84905123456`, `+84 0905 123 456`, `905123456` (Excel nuốt số 0), `0905.123.456`, `(090) 512-3456`. Trả `null` với số cố định (`02363123456`), chuỗi rác, rỗng.
- **CHỈ nhận di động** (đầu số 3/5/7/8/9). ⚠️ **Đừng dùng cho `Employee.phone`** — trường tự do, có thể là số bàn cơ sở.
- Hiển thị: `formatPhoneVN()` → `0XXXXXXXXX`, chỉ cho UI/Excel/PDF — **KHÔNG dùng làm khoá tra cứu hay lưu DB**.
- Tra cứu giai đoạn chuyển tiếp: `phoneVariants(x)` → `["84…", "0…"]`, dùng `where: { phone: { in: phoneVariants(x) } }`; gom nhóm kết quả bằng `phoneKey(row.phone)`, **không** key bằng chuỗi thô.
- File **thuần, không `import "server-only"`** — client component phải chuẩn hoá TRƯỚC khi gửi lên server (nếu không sẽ tái hiện lỗi "mất lead im lặng").

### C2. Chuỗi rỗng → `null`

Mọi validator dùng bộ helper `nullableStr` / `nullableEmail` / `nullableUrl` / `nullableDate` / `nullableInt(min,max)`: `""` hoặc `undefined` → **`null`**. Không bao giờ ghi `''` xuống cột optional.

### C3. Nullable ở DB ≠ optional ở app

`Student.parentName` / `Student.parentPhone` nullable trong DB (vì hàng seed cũ trước D1 thiếu) nhưng **Zod bắt buộc khi ghi** (`lib/validators/student.ts:76-77`). Đọc schema không đủ để kết luận trường có bắt buộc hay không — phải đọc kèm validator.

### C4. Thời gian

Mặc định `@db.Timestamptz(6)`. Ngoại lệ dùng `@db.Date` (ngày thuần): `LeadChild.dob`, `Student.enrollmentDate`.

### C5. Soft delete

`deletedAt` có trên `User`, `Student`, `Lead`, `Employee` (qua `isActive`/`status`). Luôn filter `deletedAt: null` khi đọc.

### C6. Quyền xem field NHÂN SỰ — `getEmployeeFieldVisibility()` (`lib/auth/permissions.ts:695`)

| Nhóm | Field | Vai trò được xem |
|---|---|---|
| `basic` | `fullName`, `jobTitle`, `department`, `avatarUrl`, `bio`, `joinedAt` | **tất cả** (mọi role đã đăng nhập) |
| `contact` | `email`, `phone` | SUPER_ADMIN, CENTER_MANAGER, HR |
| `salary` | `salaryRank`, `salaryLevel`, `bhxhBase` | SUPER_ADMIN, HR, ACCOUNTANT |
| `personal` | `dateOfBirth`, `gender`, `contractType`, `managerId`, `endDate`, `nationalId`, `address`, `emergencyContact`, `notes` | SUPER_ADMIN, HR |

`EMPLOYEE_GATED_FIELDS` (`:724`) là nguồn DUY NHẤT map nhóm → field, dùng cho **cả hai chiều**: `redactEmployeeFields()` khi đọc (không serialize PII xuống client) và `stripHiddenEmployeeFields()` khi ghi (client không set/xoá được field ngoài quyền). `isCEO` không nằm trong nhóm nào (non-nullable, chặn riêng ở M15).

### C7. Quyền xem liên hệ PHỤ HUYNH — `canViewParentContact()` (`lib/auth/permissions.ts:831`)

Chỉ 4 vai trò: **SUPER_ADMIN, CENTER_MANAGER, ACCOUNTANT, SALES_CSM**.

⚠️ **TEACHER / trợ giảng / MARKETING / HR KHÔNG được xem SĐT–email phụ huynh** (P0-3: chống lộ SĐT toàn lớp ở trang tiến độ lớp). Caller phải truyền cờ vào `getClassStudentProgress({ includeParentContact })` — mặc định `false` → `parentPhone` luôn null trong kết quả.

### C8. PII nặng (CCCD PH + địa chỉ) — mask mặc định + break-glass

Ở màn thanh toán (`app/(admin)/admin/payments/_actions.ts:185-213`): `parentNationalId` và `address` trả về **đã mask** (`maskNationalId` / `maskAddress`), cờ `piiMasked: true`. Muốn xem thật phải break-glass qua quyền `payments:view-pii` + ghi audit. Defense in depth: không đủ quyền thì **im lặng trả bản mask**, không báo lỗi.

### C9. Phụ huynh tự sửa được gì ở portal (`app/(portal)/portal/ho-so/actions.ts`)

| Sửa được | Không sửa được |
|---|---|
| `name` (2–120) | `email` — định danh đăng nhập |
| `address` (≤255) | `phone` — **chỉ đổi qua OTP `CHANGE_CONTACT` 2 bước, mã gửi tới SỐ MỚI** |
| `parent2Name` (≤120), `parent2Phone` (≤20, canonical hoá) | mọi trường của con |
| mật khẩu (nhập MK hiện tại + MK mới ≥8 + xác nhận khớp) | |

Khi lưu hồ sơ: `Student.parentPhone` **lấy từ `User.phone`**, KHÔNG lấy từ ô nhập (P6) — để tránh gộp anh chị em trượt và ZNS điểm danh gửi tới số cũ. Đổi mật khẩu **không bump `tokenVersion`** (tránh tự đăng xuất giữa chừng).

---

## D. GHI CHÚ RỦI RO DỮ LIỆU (quan sát, chưa sửa)

1. **CCCD phụ huynh lưu ở HAI chỗ**: `User.cccd` và `Student.parentNationalId`. Không có ràng buộc đồng bộ giữa hai cột.
2. **Thông tin PH bị lặp** giữa `User` và các cột `parent*` trên `Student`. Đồng bộ **một chiều**: portal lưu hồ sơ → `updateMany` xuống mọi `Student` của hộ. Admin sửa thẳng ở màn học viên thì **không đẩy ngược lại `User`**.
3. **`Lead.childName` / `Lead.childAge`** là legacy đọc-only, song song với `LeadChild`. Hai nguồn cùng mô tả "con của lead" — code mới phải đọc `LeadChild`.
4. **`UserPermissionGrant` với `grant = DENY` bị bỏ qua im lặng** — `lib/auth/can.ts:36-44` là ALLOW-wins thuần, không có nhánh DENY. Cần chặn quyền thì **gỡ `UserOrgRole`**, đừng tạo grant DENY.
5. **`OtpChannel.SMS`** còn trong enum nhưng đã bỏ hẳn (QĐ-H 30/07) — không dùng.
