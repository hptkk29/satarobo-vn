# Đề xuất quyền v2 cho `CENTER_MANAGER` + `TEACHER` (trình Kiệt duyệt)

> Ngày 09/07/2026 · lane #01/#09 · Đo bằng `pnpm exec tsx scripts/rbac-parity.ts`
> Chặn: **flip `RBAC_V2_ENABLED` (#09)** · Liên quan: `de-xuat-doi-cong-c.md`, `shadow-log.md`

## 0. Vấn đề

`CENTER_MANAGER` ở v2 có **6** permission (v1: 111). `TEACHER` có **3** (v1: 35). Flip lúc này thì
Toại + Liên không quản lý được cơ sở, giáo viên không mở nổi `/classes`. Hai role này chưa từng nằm
trong 5 role anh duyệt hồi 06/07 — chúng vẫn là stub.

Nhưng đây **không phải** bài toán "chép 137 action từ v1 sang v2". Đúng ra là: với mỗi action, **giữ /
siết / bỏ**? Còn `scopeType` thì gần như tự suy ra từ code (mục 1).

## 1. Ba nguyên tắc rút từ code (không phải ý kiến)

**R1 — Action nào đang bị gọi trần thì `scopeType` PHẢI là `GLOBAL`.**
`can.ts:19` — `CENTER` mà `target.centerId` thiếu ⇒ trả `false`. `can.ts:27` — `CLASS`/`ASSIGNED` thiếu
`classId` ⇒ `false`. Mà `leads:view-all` có **9** call-site gọi trần, `students:view-all` **8**,
`leads:edit` **15**. Gán `CENTER` cho chúng = role đó mất trang, không phải "được scope".

**R2 — Cách ly cơ sở KHÔNG nằm ở `scopeType`.** Nó nằm ở `scopedDb` (đã enforce xong ở #03/#04:
`Lead`, `Student`, `Class`, `Enrollment`, `Attendance` ∈ `SCOPED_MODELS`) và `checkEnrollmentScope`.
Tiền lệ đã có trong chính seed hiện tại: `report-cards:manage/review` để `GLOBAL` kèm chú thích
*"Scope GLOBAL (KHÔNG CENTER) — cố ý: report-cards:* được check ở authContext"*.

**R3 — `GLOBAL` ở tầng permission = giữ nguyên hiện trạng v1, không phải nới quyền.** v1 vốn không có
scope: `can(CENTER_MANAGER, 'leads:view-all')` là `true` bất kể cơ sở. Việc siết **đường ghi** cross-center
(QL CS1 tạo lớp cho CS2) là ticket riêng — `scopedDb` chỉ scope READ, không scope WRITE (đã biết từ #07).
Đừng gộp vào flip.

## 2. ⚠️ Cảnh báo: 5 role đã duyệt cũng dính R1

`CENTER_SALES_CSM` được seed `students:view-all[CENTER]`, `classes:view-all[CENTER]`,
`enrollments:view-all[CENTER]`… trong khi các action đó có 8 / nhiều / 3 call-site **gọi trần**.
⇒ Sau flip, **Sale không mở được `/admin/students`**. Tương tự `CENTER_ACCOUNTANT`, `CENTER_HR`.

Bài kiểm parity không bắt được lỗi này vì action **có mặt**, chỉ sai `scopeType`. Đề nghị rà lại cả 5
role theo R1 trong cùng đợt vá, không chỉ 2 role stub.

## 3. `CENTER_MANAGER` — đề xuất

### 3.1 GIỮ · vận hành cơ sở · `GLOBAL` (cách ly do `scopedDb`)

| Nhóm | Action |
|---|---|
| Lead | `leads:view-all` `leads:create` `leads:edit` `leads:assign` `leads:import` `leads:export` |
| Học viên | `students:create` `students:edit` `students:import` |
| Lớp | `classes:create` `classes:edit` · `class_group:view-all` `class_group:create` `class_group:edit` |
| Ghi danh | `enrollments:view-all` `enrollments:create` `enrollments:edit` `enrollments:cancel` `enrollments:transfer` |
| Điểm danh | `attendance:view` `attendance:mark` |
| Buổi học / phòng | `sessions:view` `sessions:create` `sessions:edit` · `rooms:view` `rooms:edit` |
| Trải nghiệm | `trials:view` `trials:manage` `trials:assign-teacher` `trials:feedback` `trials:override-capacity` |
| Phụ huynh | `parent-requests:manage` `parent-feedback:view` |
| Ảnh / media | `media:view` `media:upload` `media:approve` |
| Học tập | `evaluations:manage` `evaluations:view-aggregate` `evaluations:view-detail` · `exams:view` `exams:grade` · `assignments:view` `assignments:grade` · `teaching-materials:view-own-class` · `completions:manage` |
| Chấm công NV | `hr_attendance:view` `hr_attendance:adjust` · `hr_attendance:checkin` → **`OWN`** |
| Xem nhân sự | `employees:view-all` |
| Thu tiền tại quầy | `payments:record` |
| Thưởng | `satacoin:manage` · `notifications:manage` |
| Đọc tham chiếu | `centers:view` `holidays:view` `settings:view` `documents:view` `curriculum:view` `questions:view` `courses:view` `course-packages:view` `kits:view` `inventory:view` `products:view` `vouchers:view` `orders:view` `honors:view` `blog:view` `news:view` `jobs:view` `employees:view-public` |

### 3.2 `attendance:edit` — giữ **`CENTER`** (ngoại lệ duy nhất)

Đây là action **duy nhất** trong danh sách có **0 call-site trần / 1 call-site truyền target** — công của
#16. Nó là bằng chứng rằng R1 sửa được bằng cách truyền `target`, và là hình mẫu cho ticket siết write.

### 3.3 SIẾT · chuyển về role Hội sở đúng chức năng

| Bỏ khỏi `CENTER_MANAGER` | Về role nào | Vì sao |
|---|---|---|
| `blog:create` `blog:edit` · `news:create` `news:edit` `news:publish` `news:delete` · `site-content:view` `site-content:edit` · `honors:create` `honors:edit` `honors:settings` · `emails:view` `emails:manage` | `HO_MARKETING` | Nội dung đối ngoại là việc Hội sở, không phải từng cơ sở |
| `courses:create` `courses:edit` `course-packages:edit` · `lesson-change:approve` · `trials:config` | `TRAINING` | Chương trình & giáo án do Đào tạo giữ (câu 49) |
| `payments:manage` `orders:manage` `installments:approve` `vouchers:manage` `products:manage` · `inventory:edit` `inventory:audit` `inventory:movement` · `kits:edit` | `HO_ACCOUNTANT` | Tiền và kho do kế toán (câu 32) |
| `employees:edit` | `CENTER_HR` | Sửa hồ sơ nhân sự là việc HR |
| `jobs:create` `jobs:edit` | `CENTER_HR` | Anh vừa chốt: TTS Nhân sự đăng tin tuyển dụng |
| `holidays:edit` | `SUPER_ADMIN` | Lịch nghỉ toàn hệ thống |
| `students:delete` `enrollments:delete` | `SUPER_ADMIN` | `CLAUDE.md`: không hard-delete trừ SUPER_ADMIN; QL dùng `cancel` |

## 4. `TEACHER` — đề xuất

### 4.1 GIỮ · lớp mình dạy · `GLOBAL`

`classes:view-own` `teaching-materials:view-own-class` `sessions:view` `sessions:edit`
`attendance:view` `assignments:view` `assignments:grade` `exams:view` `exams:grade`
`enrollments:view-own` `evaluations:view-aggregate` `trials:view` `trials:feedback`
`media:view` `media:upload`

> Cách ly "chỉ lớp mình" đến từ `actor.assignedClassIds` + `checkEnrollmentScope`, không từ `scopeType`.
> Đặt `CLASS` ở đây sẽ khoá luôn 6 call-site trần của `classes:view-own` → GV không mở được `/classes`.

### 4.2 GIỮ · đọc tham chiếu · `GLOBAL`

`courses:view` `curriculum:view` `documents:view` `questions:view` `news:view` `blog:view`
`honors:view` `holidays:view` `centers:view` `rooms:view` `inventory:view` `employees:view-public`

### 4.3 `hr_attendance:checkin` → **`OWN`** · `attendance:mark` → giữ **`CLASS`** (đã đúng)

### 4.4 SIẾT

| Bỏ khỏi `TEACHER` | Vì sao |
|---|---|
| `completions:manage` | Xác nhận hoàn thành khoá là quyết định của QL cơ sở |
| `sessions:create` | GV **chốt** buổi (`sessions:edit`), không **tạo** buổi — lịch do QL xếp |

## 5. Sáu câu cần anh tick

1. **`jobs:delete`** — TTS đăng tin thì có được **xoá** tin không, hay chỉ `view/create/edit`?
2. **`students:delete` / `enrollments:delete`** — QL cơ sở chỉ được `cancel`, đúng không?
3. **`employees:edit`** — QL cơ sở có sửa hồ sơ nhân viên cơ sở mình không, hay để `CENTER_HR`?
4. **Kho & tiền** — QL cơ sở có `payments:record` (thu tại quầy) không? Còn `inventory:movement` (xuất kit cho lớp)?
5. **`satacoin:manage`** — GV có tự thưởng coin cho học viên không, hay chỉ QL?
6. **`inventory:movement` cho GV** — GV có tự lấy kit ra dùng không?

## 6. Sau khi anh tick

1. Vá `prisma/seed-roles.ts` cho `CENTER_MANAGER` + `TEACHER` + `jobs:*` cho `CENTER_HR`.
2. Rà `scopeType` của 5 role đã duyệt theo R1 (mục 2).
3. `pnpm exec tsx scripts/rbac-parity.ts` → **0 nợ**; `KNOWN_GAPS` trong `lib/auth/rbac-parity.test.ts` về rỗng.
4. Chạy workflow `seed-prod-roles` → re-seed prod.
5. Smoke 8 vai trò trên prod → `RbacShadowDiff` = 0 dòng.
6. Flip `RBAC_V2_ENABLED=true`, trước UAT 20/07.

> Bước 3 là cổng (d) mà `de-xuat-doi-cong-c.md` còn thiếu. Không có nó thì (a) DEV sạch và (b) smoke xanh
> vẫn có thể cùng xanh trong khi flip gãy — vì cả hai chỉ bắt được action mà người ta *tình cờ* bấm vào.
