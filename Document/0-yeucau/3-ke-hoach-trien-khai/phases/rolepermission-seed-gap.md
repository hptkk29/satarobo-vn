# Gap Report: RolePermission seed (v2) vs PERMISSIONS matrix (v1)

> Tu dong trich xuat - KHONG sua code, KHONG seed, KHONG dien scopeType. Nguoi review tu quyet dinh gia tri scopeType cho tung dong.
>
> Nguon: `lib/auth/permissions.ts` (export `PERMISSIONS`, 147 action) so voi `prisma/seed-roles.ts` (export `ROLE_SEED`, 11 RoleDef).

## 0. Canh bao quan trong - taxonomy vai tro KHONG khop 1:1

Matrix v1 (`PERMISSIONS`) dung enum `Role` (Prisma) phang: `SUPER_ADMIN, CENTER_MANAGER, HR, SALES_CSM, TEACHER, TRAINING, MARKETING, ACCOUNTANT, PARENT` (9 gia tri - xem `prisma/schema.prisma` dong 18-28).

Seed v2 (`ROLE_SEED` trong `prisma/seed-roles.ts`) dung `RoleDef.code` khac hoan toan, da tach theo HO/CS: `SUPER_ADMIN, HO_ACCOUNTANT, HO_HR, HO_MARKETING, HO_SALE, CENTER_MANAGER, CENTER_SALES_CSM, TEACHER, ASSISTANT_TEACHER, CENTER_ACCOUNTANT, PARENT` (11 gia tri).

-> CHI 4 code trung ten chu nghia giua 2 nguon: `SUPER_ADMIN`, `CENTER_MANAGER`, `TEACHER`, `PARENT`. Cac role con lai cua v1 - **`HR`, `SALES_CSM`, `MARKETING`, `ACCOUNTANT`, `TRAINING`** - KHONG ton tai dung ten do trong `ROLE_SEED` (chi co bien the `HO_*`/`CENTER_*` gan nghia, khong phai cung code). Vi vay voi cac role nay, phep so khop "role trung ten" cho ket qua 100% action dang "thieu" - ban chat la CHUA CO RoleDef cung ten de seed vao, khong han la bo sot tung action rieng le. Nguoi review can quyet dinh: co tao RoleDef moi dung ten (`HR`, `SALES_CSM`, `MARKETING`, `ACCOUNTANT`, `TRAINING`) hay map cac action do sang cac RoleDef `HO_*`/`CENTER_*` da co san.

Bao cao duoi day van liet ke day du theo yeu cau (so khop theo dung ten role v1), kem cot "Ghi chu tham khao" chi ra action/role/scopeType tuong tu da seed o bat ky RoleDef nao (ke ca HO_*/CENTER_*) de nguoi review doi chieu.

## 1. Bang chi tiet theo role (action matrix v1 CO ma seed v2 CHUA CO)

### CENTER_MANAGER

- Da seed cho `CENTER_MANAGER`: `students:view-all`, `classes:view-all`.
- Tong action matrix v1 cap cho CENTER_MANAGER: **109**. Da seed khop: **2**. Con thieu: **107**.

| role | action | da seed chua | scopeType de xuat | Ghi chu tham khao (du lieu trung lap - KHONG phai de xuat) |
|---|---|---|---|---|
| CENTER_MANAGER | `employees:view-all` | KHONG | | Cung action da seed o: HO_HR(GLOBAL); Cung resource employees da seed: employees:edit@HO_HR(GLOBAL) |
| CENTER_MANAGER | `employees:view-public` | KHONG | | Cung resource employees da seed: employees:view-all@HO_HR(GLOBAL), employees:edit@HO_HR(GLOBAL) |
| CENTER_MANAGER | `employees:edit` | KHONG | | Cung action da seed o: HO_HR(GLOBAL); Cung resource employees da seed: employees:view-all@HO_HR(GLOBAL) |
| CENTER_MANAGER | `honors:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `honors:create` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `honors:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `honors:settings` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `jobs:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `jobs:create` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `jobs:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `leads:view-all` | KHONG | | Cung action da seed o: HO_MARKETING(GLOBAL), HO_SALE(GLOBAL); Cung resource leads da seed: leads:view-own@CENTER_SALES_CSM(OWN) |
| CENTER_MANAGER | `leads:create` | KHONG | | Cung resource leads da seed: leads:view-all@HO_MARKETING(GLOBAL), leads:view-all@HO_SALE(GLOBAL), leads:view-own@CENTER_SALES_CSM(OWN) |
| CENTER_MANAGER | `leads:edit` | KHONG | | Cung resource leads da seed: leads:view-all@HO_MARKETING(GLOBAL), leads:view-all@HO_SALE(GLOBAL), leads:view-own@CENTER_SALES_CSM(OWN) |
| CENTER_MANAGER | `leads:assign` | KHONG | | Cung resource leads da seed: leads:view-all@HO_MARKETING(GLOBAL), leads:view-all@HO_SALE(GLOBAL), leads:view-own@CENTER_SALES_CSM(OWN) |
| CENTER_MANAGER | `leads:delete` | KHONG | | Cung resource leads da seed: leads:view-all@HO_MARKETING(GLOBAL), leads:view-all@HO_SALE(GLOBAL), leads:view-own@CENTER_SALES_CSM(OWN) |
| CENTER_MANAGER | `leads:export` | KHONG | | Cung resource leads da seed: leads:view-all@HO_MARKETING(GLOBAL), leads:view-all@HO_SALE(GLOBAL), leads:view-own@CENTER_SALES_CSM(OWN) |
| CENTER_MANAGER | `trials:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `trials:manage` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `trials:feedback` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `trials:assign-teacher` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `trials:override-capacity` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `trials:config` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `lesson-change:approve` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `notifications:manage` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `parent-requests:manage` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `parent-feedback:view` | KHONG | | Cung action da seed o: PARENT(CHILDREN) |
| CENTER_MANAGER | `media:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `media:upload` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `media:approve` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `hr_attendance:checkin` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `hr_attendance:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `hr_attendance:adjust` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `blog:view` | KHONG | | Cung resource blog da seed: blog:edit@HO_MARKETING(GLOBAL) |
| CENTER_MANAGER | `blog:create` | KHONG | | Cung resource blog da seed: blog:edit@HO_MARKETING(GLOBAL) |
| CENTER_MANAGER | `blog:edit` | KHONG | | Cung action da seed o: HO_MARKETING(GLOBAL) |
| CENTER_MANAGER | `news:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `news:create` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `news:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `news:delete` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `news:publish` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `students:create` | KHONG | | Cung action da seed o: CENTER_SALES_CSM(CENTER); Cung resource students da seed: students:view-all@CENTER_MANAGER(CENTER), students:view-own-class@TEACHER(CLASS) |
| CENTER_MANAGER | `students:edit` | KHONG | | Cung resource students da seed: students:view-all@CENTER_MANAGER(CENTER), students:create@CENTER_SALES_CSM(CENTER), students:view-own-class@TEACHER(CLASS) |
| CENTER_MANAGER | `students:delete` | KHONG | | Cung resource students da seed: students:view-all@CENTER_MANAGER(CENTER), students:create@CENTER_SALES_CSM(CENTER), students:view-own-class@TEACHER(CLASS) |
| CENTER_MANAGER | `students:import` | KHONG | | Cung resource students da seed: students:view-all@CENTER_MANAGER(CENTER), students:create@CENTER_SALES_CSM(CENTER), students:view-own-class@TEACHER(CLASS) |
| CENTER_MANAGER | `classes:create` | KHONG | | Cung resource classes da seed: classes:view-all@CENTER_MANAGER(CENTER) |
| CENTER_MANAGER | `classes:edit` | KHONG | | Cung resource classes da seed: classes:view-all@CENTER_MANAGER(CENTER) |
| CENTER_MANAGER | `class_group:view-all` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `class_group:create` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `class_group:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `enrollments:view-all` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `enrollments:create` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `enrollments:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `enrollments:transfer` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `completions:manage` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `evaluations:manage` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `evaluations:view-aggregate` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `evaluations:view-detail` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `report-cards:manage` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `report-cards:review` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `satacoin:manage` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `enrollments:cancel` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `enrollments:delete` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `sessions:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `sessions:create` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `sessions:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `attendance:view` | KHONG | | Cung action da seed o: ASSISTANT_TEACHER(ASSIGNED); Cung resource attendance da seed: attendance:mark@TEACHER(CLASS) |
| CENTER_MANAGER | `attendance:mark` | KHONG | | Cung action da seed o: TEACHER(CLASS); Cung resource attendance da seed: attendance:view@ASSISTANT_TEACHER(ASSIGNED) |
| CENTER_MANAGER | `attendance:edit` | KHONG | | Cung resource attendance da seed: attendance:mark@TEACHER(CLASS), attendance:view@ASSISTANT_TEACHER(ASSIGNED) |
| CENTER_MANAGER | `courses:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `courses:create` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `courses:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `course-packages:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `course-packages:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `curriculum:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `questions:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `exams:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `exams:grade` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `assignments:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `assignments:grade` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `documents:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `teaching-materials:view-own-class` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `centers:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `rooms:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `rooms:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `holidays:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `holidays:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `inventory:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `inventory:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `inventory:movement` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `inventory:audit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `kits:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `kits:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `site-content:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `site-content:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `audit-logs:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `settings:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `payments:manage` | KHONG | | Cung action da seed o: HO_ACCOUNTANT(GLOBAL), CENTER_ACCOUNTANT(CENTER) |
| CENTER_MANAGER | `payments:record` | KHONG | | Cung resource payments da seed: payments:manage@HO_ACCOUNTANT(GLOBAL), payments:manage@CENTER_ACCOUNTANT(CENTER) |
| CENTER_MANAGER | `installments:approve` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `orders:view` | KHONG | | Cung resource orders da seed: orders:manage@HO_ACCOUNTANT(GLOBAL) |
| CENTER_MANAGER | `orders:manage` | KHONG | | Cung action da seed o: HO_ACCOUNTANT(GLOBAL) |
| CENTER_MANAGER | `vouchers:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `vouchers:manage` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `products:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `products:manage` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `emails:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| CENTER_MANAGER | `emails:manage` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |

### HR

- RoleDef code `HR` KHONG ton tai trong `ROLE_SEED` (xem canh bao muc 0).
- Tong action matrix v1 cap cho HR: **23**. Da seed dung ten role nay: **0**. Con thieu: **23**.

| role | action | da seed chua | scopeType de xuat | Ghi chu tham khao (du lieu trung lap - KHONG phai de xuat) |
|---|---|---|---|---|
| HR | `employees:view-all` | KHONG | | Cung action da seed o: HO_HR(GLOBAL); Cung resource employees da seed: employees:edit@HO_HR(GLOBAL) |
| HR | `employees:view-public` | KHONG | | Cung resource employees da seed: employees:view-all@HO_HR(GLOBAL), employees:edit@HO_HR(GLOBAL) |
| HR | `employees:create` | KHONG | | Cung resource employees da seed: employees:view-all@HO_HR(GLOBAL), employees:edit@HO_HR(GLOBAL) |
| HR | `employees:edit` | KHONG | | Cung action da seed o: HO_HR(GLOBAL); Cung resource employees da seed: employees:view-all@HO_HR(GLOBAL) |
| HR | `employees:view-salary` | KHONG | | Cung resource employees da seed: employees:view-all@HO_HR(GLOBAL), employees:edit@HO_HR(GLOBAL) |
| HR | `employees:view-personal` | KHONG | | Cung resource employees da seed: employees:view-all@HO_HR(GLOBAL), employees:edit@HO_HR(GLOBAL) |
| HR | `honors:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| HR | `honors:create` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| HR | `honors:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| HR | `jobs:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| HR | `jobs:create` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| HR | `jobs:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| HR | `jobs:delete` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| HR | `hr_attendance:checkin` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| HR | `hr_attendance:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| HR | `blog:view` | KHONG | | Cung resource blog da seed: blog:edit@HO_MARKETING(GLOBAL) |
| HR | `news:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| HR | `payroll:view` | KHONG | | Cung action da seed o: HO_ACCOUNTANT(GLOBAL) |
| HR | `students:view-all` | KHONG | | Cung action da seed o: CENTER_MANAGER(CENTER); Cung resource students da seed: students:create@CENTER_SALES_CSM(CENTER), students:view-own-class@TEACHER(CLASS) |
| HR | `classes:view-all` | KHONG | | Cung action da seed o: CENTER_MANAGER(CENTER) |
| HR | `courses:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| HR | `centers:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| HR | `holidays:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |

### SALES_CSM

- RoleDef code `SALES_CSM` KHONG ton tai trong `ROLE_SEED` (xem canh bao muc 0).
- Tong action matrix v1 cap cho SALES_CSM: **25**. Da seed dung ten role nay: **0**. Con thieu: **25**.

| role | action | da seed chua | scopeType de xuat | Ghi chu tham khao (du lieu trung lap - KHONG phai de xuat) |
|---|---|---|---|---|
| SALES_CSM | `employees:view-public` | KHONG | | Cung resource employees da seed: employees:view-all@HO_HR(GLOBAL), employees:edit@HO_HR(GLOBAL) |
| SALES_CSM | `honors:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| SALES_CSM | `leads:view-own` | KHONG | | Cung action da seed o: CENTER_SALES_CSM(OWN); Cung resource leads da seed: leads:view-all@HO_MARKETING(GLOBAL), leads:view-all@HO_SALE(GLOBAL) |
| SALES_CSM | `leads:create` | KHONG | | Cung resource leads da seed: leads:view-all@HO_MARKETING(GLOBAL), leads:view-all@HO_SALE(GLOBAL), leads:view-own@CENTER_SALES_CSM(OWN) |
| SALES_CSM | `leads:edit` | KHONG | | Cung resource leads da seed: leads:view-all@HO_MARKETING(GLOBAL), leads:view-all@HO_SALE(GLOBAL), leads:view-own@CENTER_SALES_CSM(OWN) |
| SALES_CSM | `trials:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| SALES_CSM | `trials:manage` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| SALES_CSM | `parent-requests:manage` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| SALES_CSM | `hr_attendance:checkin` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| SALES_CSM | `blog:view` | KHONG | | Cung resource blog da seed: blog:edit@HO_MARKETING(GLOBAL) |
| SALES_CSM | `students:view-all` | KHONG | | Cung action da seed o: CENTER_MANAGER(CENTER); Cung resource students da seed: students:create@CENTER_SALES_CSM(CENTER), students:view-own-class@TEACHER(CLASS) |
| SALES_CSM | `students:create` | KHONG | | Cung action da seed o: CENTER_SALES_CSM(CENTER); Cung resource students da seed: students:view-all@CENTER_MANAGER(CENTER), students:view-own-class@TEACHER(CLASS) |
| SALES_CSM | `students:edit` | KHONG | | Cung resource students da seed: students:view-all@CENTER_MANAGER(CENTER), students:create@CENTER_SALES_CSM(CENTER), students:view-own-class@TEACHER(CLASS) |
| SALES_CSM | `classes:view-all` | KHONG | | Cung action da seed o: CENTER_MANAGER(CENTER) |
| SALES_CSM | `enrollments:view-all` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| SALES_CSM | `enrollments:create` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| SALES_CSM | `enrollments:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| SALES_CSM | `course-packages:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| SALES_CSM | `centers:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| SALES_CSM | `holidays:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| SALES_CSM | `kits:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| SALES_CSM | `payments:record` | KHONG | | Cung resource payments da seed: payments:manage@HO_ACCOUNTANT(GLOBAL), payments:manage@CENTER_ACCOUNTANT(CENTER) |
| SALES_CSM | `orders:view` | KHONG | | Cung resource orders da seed: orders:manage@HO_ACCOUNTANT(GLOBAL) |
| SALES_CSM | `vouchers:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| SALES_CSM | `products:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |

### TEACHER

- Da seed cho `TEACHER`: `attendance:mark`, `students:view-own-class`.
- Tong action matrix v1 cap cho TEACHER: **35**. Da seed khop: **2**. Con thieu: **33**.

| role | action | da seed chua | scopeType de xuat | Ghi chu tham khao (du lieu trung lap - KHONG phai de xuat) |
|---|---|---|---|---|
| TEACHER | `employees:view-public` | KHONG | | Cung resource employees da seed: employees:view-all@HO_HR(GLOBAL), employees:edit@HO_HR(GLOBAL) |
| TEACHER | `honors:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `trials:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `trials:feedback` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `media:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `media:upload` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `hr_attendance:checkin` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `blog:view` | KHONG | | Cung resource blog da seed: blog:edit@HO_MARKETING(GLOBAL) |
| TEACHER | `news:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `classes:view-own` | KHONG | | Cung resource classes da seed: classes:view-all@CENTER_MANAGER(CENTER) |
| TEACHER | `enrollments:view-own` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `completions:manage` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `evaluations:view-aggregate` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `report-cards:manage` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `satacoin:manage` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `sessions:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `sessions:create` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `sessions:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `attendance:view` | KHONG | | Cung action da seed o: ASSISTANT_TEACHER(ASSIGNED); Cung resource attendance da seed: attendance:mark@TEACHER(CLASS) |
| TEACHER | `courses:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `curriculum:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `questions:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `exams:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `exams:grade` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `assignments:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `assignments:grade` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `documents:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `teaching-materials:view-own-class` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `centers:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `rooms:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `holidays:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `inventory:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TEACHER | `inventory:movement` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |

### MARKETING

- RoleDef code `MARKETING` KHONG ton tai trong `ROLE_SEED` (xem canh bao muc 0).
- Tong action matrix v1 cap cho MARKETING: **35**. Da seed dung ten role nay: **0**. Con thieu: **35**.

| role | action | da seed chua | scopeType de xuat | Ghi chu tham khao (du lieu trung lap - KHONG phai de xuat) |
|---|---|---|---|---|
| MARKETING | `employees:view-public` | KHONG | | Cung resource employees da seed: employees:view-all@HO_HR(GLOBAL), employees:edit@HO_HR(GLOBAL) |
| MARKETING | `honors:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `honors:create` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `honors:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `jobs:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `leads:view-all` | KHONG | | Cung action da seed o: HO_MARKETING(GLOBAL), HO_SALE(GLOBAL); Cung resource leads da seed: leads:view-own@CENTER_SALES_CSM(OWN) |
| MARKETING | `leads:create` | KHONG | | Cung resource leads da seed: leads:view-all@HO_MARKETING(GLOBAL), leads:view-all@HO_SALE(GLOBAL), leads:view-own@CENTER_SALES_CSM(OWN) |
| MARKETING | `leads:edit` | KHONG | | Cung resource leads da seed: leads:view-all@HO_MARKETING(GLOBAL), leads:view-all@HO_SALE(GLOBAL), leads:view-own@CENTER_SALES_CSM(OWN) |
| MARKETING | `leads:export` | KHONG | | Cung resource leads da seed: leads:view-all@HO_MARKETING(GLOBAL), leads:view-all@HO_SALE(GLOBAL), leads:view-own@CENTER_SALES_CSM(OWN) |
| MARKETING | `notifications:manage` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `parent-feedback:view` | KHONG | | Cung action da seed o: PARENT(CHILDREN) |
| MARKETING | `hr_attendance:checkin` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `blog:view` | KHONG | | Cung resource blog da seed: blog:edit@HO_MARKETING(GLOBAL) |
| MARKETING | `blog:create` | KHONG | | Cung resource blog da seed: blog:edit@HO_MARKETING(GLOBAL) |
| MARKETING | `blog:edit` | KHONG | | Cung action da seed o: HO_MARKETING(GLOBAL) |
| MARKETING | `news:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `news:create` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `news:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `news:publish` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `students:view-all` | KHONG | | Cung action da seed o: CENTER_MANAGER(CENTER); Cung resource students da seed: students:create@CENTER_SALES_CSM(CENTER), students:view-own-class@TEACHER(CLASS) |
| MARKETING | `classes:view-all` | KHONG | | Cung action da seed o: CENTER_MANAGER(CENTER) |
| MARKETING | `courses:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `courses:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `course-packages:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `centers:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `holidays:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `kits:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `kits:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `site-content:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `site-content:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `vouchers:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `vouchers:manage` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `products:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `emails:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| MARKETING | `emails:manage` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |

### ACCOUNTANT

- RoleDef code `ACCOUNTANT` KHONG ton tai trong `ROLE_SEED` (xem canh bao muc 0).
- Tong action matrix v1 cap cho ACCOUNTANT: **23**. Da seed dung ten role nay: **0**. Con thieu: **23**.

| role | action | da seed chua | scopeType de xuat | Ghi chu tham khao (du lieu trung lap - KHONG phai de xuat) |
|---|---|---|---|---|
| ACCOUNTANT | `employees:view-public` | KHONG | | Cung resource employees da seed: employees:view-all@HO_HR(GLOBAL), employees:edit@HO_HR(GLOBAL) |
| ACCOUNTANT | `employees:view-salary` | KHONG | | Cung resource employees da seed: employees:view-all@HO_HR(GLOBAL), employees:edit@HO_HR(GLOBAL) |
| ACCOUNTANT | `honors:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| ACCOUNTANT | `hr_attendance:checkin` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| ACCOUNTANT | `blog:view` | KHONG | | Cung resource blog da seed: blog:edit@HO_MARKETING(GLOBAL) |
| ACCOUNTANT | `payroll:view` | KHONG | | Cung action da seed o: HO_ACCOUNTANT(GLOBAL) |
| ACCOUNTANT | `payroll:edit` | KHONG | | Cung resource payroll da seed: payroll:view@HO_ACCOUNTANT(GLOBAL) |
| ACCOUNTANT | `students:view-all` | KHONG | | Cung action da seed o: CENTER_MANAGER(CENTER); Cung resource students da seed: students:create@CENTER_SALES_CSM(CENTER), students:view-own-class@TEACHER(CLASS) |
| ACCOUNTANT | `classes:view-all` | KHONG | | Cung action da seed o: CENTER_MANAGER(CENTER) |
| ACCOUNTANT | `enrollments:view-all` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| ACCOUNTANT | `centers:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| ACCOUNTANT | `holidays:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| ACCOUNTANT | `inventory:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| ACCOUNTANT | `inventory:audit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| ACCOUNTANT | `payments:manage` | KHONG | | Cung action da seed o: HO_ACCOUNTANT(GLOBAL), CENTER_ACCOUNTANT(CENTER) |
| ACCOUNTANT | `payments:record` | KHONG | | Cung resource payments da seed: payments:manage@HO_ACCOUNTANT(GLOBAL), payments:manage@CENTER_ACCOUNTANT(CENTER) |
| ACCOUNTANT | `payments:confirm` | KHONG | | Cung resource payments da seed: payments:manage@HO_ACCOUNTANT(GLOBAL), payments:manage@CENTER_ACCOUNTANT(CENTER) |
| ACCOUNTANT | `orders:view` | KHONG | | Cung resource orders da seed: orders:manage@HO_ACCOUNTANT(GLOBAL) |
| ACCOUNTANT | `orders:manage` | KHONG | | Cung action da seed o: HO_ACCOUNTANT(GLOBAL) |
| ACCOUNTANT | `vouchers:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| ACCOUNTANT | `vouchers:manage` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| ACCOUNTANT | `products:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| ACCOUNTANT | `products:manage` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |

### TRAINING

- RoleDef code `TRAINING` KHONG ton tai trong `ROLE_SEED` (xem canh bao muc 0).
- Tong action matrix v1 cap cho TRAINING: **33**. Da seed dung ten role nay: **0**. Con thieu: **33**.

| role | action | da seed chua | scopeType de xuat | Ghi chu tham khao (du lieu trung lap - KHONG phai de xuat) |
|---|---|---|---|---|
| TRAINING | `training:manage` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `trials:config` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `lesson-change:approve` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `students:view-all` | KHONG | | Cung action da seed o: CENTER_MANAGER(CENTER); Cung resource students da seed: students:create@CENTER_SALES_CSM(CENTER), students:view-own-class@TEACHER(CLASS) |
| TRAINING | `classes:view-all` | KHONG | | Cung action da seed o: CENTER_MANAGER(CENTER) |
| TRAINING | `evaluations:manage` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `courses:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `courses:create` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `courses:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `courses:delete` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `course-packages:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `curriculum:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `curriculum:create` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `curriculum:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `curriculum:delete` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `questions:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `questions:author` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `questions:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `questions:delete` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `exams:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `exams:create` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `exams:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `exams:grade` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `exams:delete` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `assignments:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `assignments:create` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `assignments:edit` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `assignments:grade` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `assignments:delete` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `documents:view` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `documents:upload` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `documents:delete` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |
| TRAINING | `teaching-materials:view-own-class` | KHONG | | (khong co action nao cung resource duoc seed o bat ky role nao) |

## 2. Chieu nguoc lai - action DA seed v2 nhung KHONG co trong matrix v1 cho role cung ten

Ap dung cho 2 role co code trung ten truc tiep (`CENTER_MANAGER`, `TEACHER`) - day la 2 role duy nhat co the so sanh truc tiep "seed thua so voi v1":

- `CENTER_MANAGER`: seed = `students:view-all`(CENTER), `classes:view-all`(CENTER) - CA HAI deu co trong matrix v1 cho CENTER_MANAGER -> KHONG co action seed thua.
- `TEACHER`: seed = `attendance:mark`(CLASS), `students:view-own-class`(CLASS) - CA HAI deu co trong matrix v1 cho TEACHER -> KHONG co action seed thua.

Cac RoleDef con lai trong `ROLE_SEED` (`HO_ACCOUNTANT`, `HO_HR`, `HO_MARKETING`, `HO_SALE`, `CENTER_SALES_CSM`, `ASSISTANT_TEACHER`, `CENTER_ACCOUNTANT`) khong co role v1 cung ten de doi chieu truc tiep - xem muc 0. Ghi chu tho: toan bo action seed cua cac RoleDef nay deu la action hop le co ton tai trong `Action` type / `ACTION_REGISTRY` (khong co action la ngoai registry), nhung viec chung co "tuong ung dung y nghia" voi vai tro v1 nao hay khong la quyet dinh nghiep vu, khong tu suy luan o day. Cu the:

| RoleDef v2 (khong co code trung o v1) | Action da seed (scopeType) |
|---|---|
| HO_ACCOUNTANT | payments:manage (GLOBAL); orders:manage (GLOBAL); payroll:view (GLOBAL) |
| HO_HR | employees:view-all (GLOBAL); employees:edit (GLOBAL) |
| HO_MARKETING | leads:view-all (GLOBAL); blog:edit (GLOBAL) |
| HO_SALE | leads:view-all (GLOBAL) |
| CENTER_SALES_CSM | leads:view-own (OWN); students:create (CENTER) |
| ASSISTANT_TEACHER | attendance:view (ASSIGNED) |
| CENTER_ACCOUNTANT | payments:manage (CENTER) |

## 3. Tong so dem

| Role | Tong action matrix v1 cap | Da seed khop (cung ten role) | Con thieu |
|---|---|---|---|
| CENTER_MANAGER | 109 | 2 | 107 |
| HR | 23 | 0 | 23 |
| SALES_CSM | 25 | 0 | 25 |
| TEACHER | 35 | 2 | 33 |
| MARKETING | 35 | 0 | 35 |
| ACCOUNTANT | 23 | 0 | 23 |
| TRAINING | 33 | 0 | 33 |
| **TONG (7 role, tru SUPER_ADMIN + PARENT)** | **283** | **4** | **279** |

Ghi chu: SUPER_ADMIN va PARENT bi loai khoi bang so khop theo yeu cau (SUPER_ADMIN bypass toan bo qua `actor.isSuperAdmin` trong `lib/auth/can.ts`; PARENT khong co quyen admin nao trong matrix v1 theo comment tai `lib/auth/permissions.ts` dong 23-26, quyen portal check qua `activeSite` rieng).

Tong action trong toan bo matrix v1 (`Object.keys(PERMISSIONS)`): **147**.

## 4. Bat thuong phat hien khi doi chieu 2 nguon

1. **Taxonomy vai tro lech hoan toan** (muc 0) - 5/7 role so khop (`HR`, `SALES_CSM`, `MARKETING`, `ACCOUNTANT`, `TRAINING`) khong co RoleDef cung ten trong seed v2, chi co bien the `HO_*`/`CENTER_*`. Day la nguyen nhan chinh khien so dong "thieu" cao (279/283).
2. **Role `TRAINING` khong nam trong comment "ALL 8 ROLES"** o dau `lib/auth/permissions.ts` (dong 19-21: liet ke SUPER_ADMIN, CENTER_MANAGER, HR, SALES_CSM, TEACHER, MARKETING, ACCOUNTANT, PARENT) nhung CO that trong enum `Role` (`prisma/schema.prisma` dong 24, them o migration `20260624000000_fl_foundation`, sau migration doi ten role `20260528000000_rename_roles_add_parent`) va duoc dung rong rai trong matrix (33 action - LMS: curriculum/questions/exams/assignments/documents/training:manage...). Comment header trong permissions.ts co ve chua cap nhat theo vai tro TRAINING moi them.
3. **`ROLE_SEED` hoan toan khong co RoleDef code `TRAINING`** - toan bo 33 action LMS ma v1 cap cho TRAINING chua duoc seed duoi bat ky RoleDef nao trong `prisma/seed-roles.ts`.
4. **Format action khop nhau** - khong phat hien lech dinh dang chuoi action (`resource:verb`) giua 2 file; toan bo action seed trong `ROLE_SEED` deu ton tai trong `Action` type / `ACTION_REGISTRY` (`lib/auth/action-registry.ts` re-export `ALL_ACTIONS` tu `permissions.ts` nen registry luon dong bo theo dinh nghia).
5. **Co che shadow-compare thuc te KHONG so theo ten role** - `lib/auth/check-permission.ts` / `lib/auth/shadow-compare.ts` so `can()` v1 (doc `session.user.role`/`roles` - enum `Role` cu) voi `can()` v2 (doc `actor.permissions` resolve tu `UserOrgRole` -> `RoleDef` -> `RolePermission` qua `resolveActor()`) THEO TUNG USER cu the, khong so truc tiep "role code x role code". Bao cao nay so theo ten role tinh (dung yeu cau task) - so lieu KHONG phan anh chinh xac hanh vi shadow-compare thuc te tren user cu the (phu thuoc user do duoc gan RoleDef/UserOrgRole nao), chi phan anh gap o tang seed du lieu.
6. **RoleDef `PARENT` trong seed co 1 action** (`parent-feedback:view`, scope CHILDREN) du bi loai khoi bang so khop theo yeu cau task - ghi nhan de nguoi review biet seed v2 van co PARENT (khop voi PARENT ton tai trong Role enum v1, du v1 khong cap PARENT action nao trong matrix).
