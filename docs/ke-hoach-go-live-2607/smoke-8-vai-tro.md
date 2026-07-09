# Smoke 8 vai trò trên PROD — cổng (b) của flip #09

> 09/07/2026 · thay cho *"3–5 ngày traffic thật"* (prod chưa có traffic — xem `de-xuat-doi-cong-c.md`)
> Tiêu chí PASS: chạy hết kịch bản → `SELECT COUNT(*) FROM "RbacShadowDiff"` = **0**.

## 0. Vì sao smoke, khi đã có `rbac-parity` + `rbac-scope`?

Hai test tĩnh phủ **mapping** `role → action → scopeType`, và phủ kín. Smoke tồn tại để bắt thứ chúng
không thấy được:

- call-site **có** truyền `target` (`attendance:edit[CENTER]`) — scope chỉ đúng khi target đúng cơ sở;
- **`scopedDb`** cách ly hàng (CS1 không thấy CS2);
- **`checkEnrollmentScope`** cho `report-cards:*` GLOBAL;
- **`assignedClassIds`** cho GV;
- **`resolveActor`** đọc đúng `UserOrgRole` vừa gán.

## 1. Vạch xuất phát (làm đúng thứ tự)

- [ ] Workflow **Seed Production RolePermission** → `✅ Seeded 14 RoleDef`
- [ ] Workflow **Shadow-compare report** → mục 1 `✅ Không có ai`
- [ ] `TRUNCATE "RbacShadowDiff";` ← sau seed, trước smoke
- [ ] `admin@` / `daotao@` vẫn còn ACTIVE (chưa khoá — khoá sau khi smoke xanh)

## 2. Tài khoản × vai trò (sau apply 09/07)

| Vai trò v2 | Người | Cơ sở |
|---|---|---|
| `SUPER_ADMIN` | Hồ Đắc Phúc · Hoàng Phan Tuấn Kiệt | HO |
| `CENTER_MANAGER` | Phan Thành Toại · Lê Thị Phương Liên | CS1 · CS2 |
| `TRAINING` | Phan Thành Toại | HO |
| `TEACHER` | Nguyễn Hữu Đức · Nguyễn Thị Thiện Trang · Kiệt · Toại | CS1 · CS2 · CS2 · CS1 |
| `CENTER_SALES_CSM` | Huỳnh Thị Diệu · Nguyễn Thị Lộc · Đinh Thảo My · Tô Thị Thuý Vân | CS1 ×2 · CS2 ×2 |
| `HO_ACCOUNTANT` | Nguyễn Thị Bích Huệ | HO |
| `HO_MARKETING` | Nguyễn Thị Linh | HO |
| `CENTER_HR` | Lê Thị Tuyết Mai · Trần Thị Thuý Liên | CS1 · CS2 |

**Chưa có người giữ:** `CENTER_CLASS_MANAGER`, `CENTER_ACCOUNTANT`, `ASSISTANT_TEACHER`, `HO_SALE`, `HO_HR`.
⇒ Bốn nhóm scope vừa vá cho chúng **sẽ không được smoke kiểm**. Xem §5.

> URL admin bỏ tiền tố `/admin` (proxy rewrite): `https://admin.satarobo.vn/leads`, `/students`, …

## 3. Kịch bản theo vai trò

Mỗi ô "phải vào được" = trang mở ra, KHÔNG bị đá về `/dashboard`.

### S1 · `SUPER_ADMIN` (Kiệt)
- [ ] Vào `/users`, `/roles`, `/audit-log`, `/nhan-su`, `/leads`, `/students`, `/classes`, `/payments`
- [ ] Mở `/leads` và `/classes` — đây là 2 trang từng đẻ lệch `leads:view-own` / `classes:view-own`
      (đã vá 09/07 bằng cách thêm `SUPER_ADMIN` vào 4 action `*-own`). **Kỳ vọng: 0 dòng lệch.**

### S2 · `CENTER_MANAGER` (Toại @CS1)
- [ ] Vào `/leads`, `/students`, `/classes`, `/enrollments`, `/sessions`, `/trials`, `/hoc-ba`, `/parent-requests`
- [ ] **Ghi:** tạo 1 lead nháp → sửa → gán cho Sale CS1 → xoá lead? **KHÔNG có quyền** (`leads:delete` đã bỏ, user chốt 09/07) → nút xoá phải ẩn/chặn
- [ ] **Ghi:** sửa 1 buổi học (`sessions:edit`), điểm danh hồi tố (`attendance:edit` — scope `CENTER`, đây là call-site DUY NHẤT truyền target)
- [ ] **Chặn:** `/site-content`, `/email-templates`, `/courses` (tạo mới), `/payments` (quản lý) → phải bị chặn

### S3 · `CENTER_MANAGER` (Liên @CS2)
- [ ] Như S2 nhưng ở CS2
- [ ] **Cách ly:** `/leads` **không** hiện lead CS1; `/students` không hiện học viên CS1

### S4 · `TEACHER` (Đức @CS1)
- [ ] Vào `/classes` ← gate `classes:view-own`, chính là trang GV từng mất
- [ ] Vào `/teaching-materials`, `/sessions`, `/hoc-ba`, `/assignments`, `/exams`
- [ ] **Ghi:** điểm danh lớp mình (`attendance:mark[CLASS]`), chấm 1 bài (`assignments:grade`), viết nháp học bạ (`report-cards:manage`)
- [ ] **Chặn:** duyệt học bạ (`report-cards:review`) → không có nút; `/leads`, `/payments`, `/nhan-su` → chặn
- [ ] **Cách ly lớp:** `/classes` chỉ hiện lớp Đức dạy, không hiện lớp của Trang

### S5 · `CENTER_SALES_CSM` (Diệu @CS1)
- [ ] Vào `/leads` ← từng mất vì `leads:view-own[OWN]`; **chỉ thấy lead của chính Diệu** (`scopeToSelf`)
- [ ] Vào `/students`, `/enrollments`, `/trials`, `/parent-requests`
- [ ] **Ghi:** tạo lead, chuyển lead → học viên, ghi danh, thu tiền quầy (`payments:record`), sửa điểm danh (`attendance:edit`)
- [ ] **Cách ly:** không thấy lead của Lộc (cùng CS1) và không thấy gì của CS2

### S6 · `HO_ACCOUNTANT` (Huệ)
- [ ] Vào `/payments`, `/cong-no`, `/orders`, `/hoan-tien`, `/vouchers`, `/products`, `/inventory`
- [ ] **Ghi:** xác nhận 1 khoản (`payments:confirm`), in phiếu thu (#15)
- [ ] **Break-glass:** bấm xem CCCD phụ huynh (`payments:view-pii`) → phải yêu cầu **lý do ≥10 ký tự** và ghi `AuditLog`
- [ ] **Cross-center:** thấy thanh toán của **cả** CS1 và CS2 (HO-level, đúng thiết kế)

### S7 · `HO_MARKETING` (Linh)
- [ ] Vào `/marketing`, `/crm`, `/site-content`, `/email-templates`, `/honors`, `/media`
- [ ] **Ghi:** tạo 1 bài news nháp (`news:create`), sửa site-content
- [ ] **Chặn:** `/payments`, `/nhan-su`, `/roles`

### S8 · `CENTER_HR` (Mai @CS1)
- [ ] Vào `/nhan-su`, `/cham-cong`
- [ ] **Ghi:** sửa hồ sơ 1 nhân viên CS1 (`employees:edit[CENTER]`), đăng 1 tin tuyển dụng (`jobs:create` — user chốt 09/07)
- [ ] **Chặn:** cột **lương** không hiện (`employees:view-salary` không có); `/payments` chặn
- [ ] **Cách ly:** không thấy nhân viên CS2

### S9 · `TRAINING` (Toại, tài khoản cũ `daotao@` để đối chiếu)
- [ ] Vào `/curriculums`, `/courses`, `/questions`, `/exams`, `/scorm`, `/hoc-ba`
- [ ] **Ghi:** duyệt học bạ **CS2** (`report-cards:review` GLOBAL + `checkEnrollmentScope`) → phải được, vì `TRAINING @ HO`

### S10 · `PARENT` (1 tài khoản phụ huynh thật)
- [ ] Đăng nhập `hocvien.satarobo.vn`, xem hồ sơ con, bài thi, gửi 1 yêu cầu
- [ ] **Không** xuất hiện `studentId` trên URL; không mở được con của phụ huynh khác

## 4. Bốn phép cách ly bắt buộc

| # | Phép thử | Kỳ vọng |
|---|---|---|
| C1 | Liên (QL CS2) mở chi tiết 1 lead của CS1 bằng URL trực tiếp | 404 / chặn (`scopedDb`) |
| C2 | Diệu (Sale CS1) mở lead của Lộc bằng URL trực tiếp | chặn (`scopeToSelf` + ownership) |
| C3 | Đức (GV CS1) mở lớp của Trang (CS2) bằng URL trực tiếp | chặn (`assignedClassIds`) |
| C4 | Toại (QL CS1 + Đào tạo HO) duyệt học bạ 1 HV **CS2** | **được** (`checkEnrollmentScope` cho `isHoLevel` qua) |
| C5 | Toại mở `/leads` | **chỉ thấy lead CS1** — nếu thấy lead CS2 là hồi quy, xem §5.1 |
| C6 | Toại mở `/payments` (nếu vào được) | **chỉ thấy khoản CS1** |

## 5. Hai lỗ smoke không lấp được — phải quyết trước flip

### 5.1 ~~Toại thấy toàn bộ CS2~~ — ĐÃ SỬA 09/07 (bản đầu của mục này SAI)

**Đính chính.** Bản đầu viết rằng `scopedDb` dùng `actor.visibleCenterIds` (blanket theo `isHoLevel`).
Sai: `injectScope` gọi `getModelVisibleCenterIds(model, actor)`, hàm này gom union `centerScope` của các
permission **khớp prefix action của model** (`db-scope.ts:127`). Cross-center **đã** bám chức năng.

Thực trạng sau bản vá seed + 2 prefix còn thiếu (`Attendance`, `LeadTrialHistory`):

| Model | Toại (`TRAINING@HO` + `CM@CS1`) | Vì sao |
|---|---|---|
| `Student`, `Class`, `ClassSession` | **cả 2 cơ sở** | `students/classes:view-all` từ `TRAINING @ HO` → `centerScope: "ALL"` |
| `Enrollment` | **cả 2 cơ sở** | prefix `report-cards:` map vào `Enrollment` — học bạ gắn ghi danh |
| `Attendance` | **cả 2 cơ sở** | dữ liệu đào tạo (prefix `attendance:`/`classes:`) |
| `Lead`, `MessengerConversation`, `LeadTrialHistory` | **chỉ CS1** | `leads:*` chỉ đến từ `CENTER_MANAGER @ CS1` |
| `Payment`, `Order` | **chỉ CS1** | `payments:record`/`orders:view` chỉ ở CS1 |
| `Employee` | **chỉ CS1** | `employees:view-all` chỉ ở CS1 |

Đúng yêu cầu: *"thấy học viên/lớp CS2 để đánh giá học bạ, không thấy lead, doanh thu, phần ngoài đào tạo."*
Khoá bằng `lib/db-scope-function.test.ts` (ca Toại) + test "mọi `SCOPED_MODEL` phải có prefix".

**Lỗi gốc:** `#04` flip `Attendance` sang `SCOPED_MODELS` nhưng quên thêm prefix ⇒ nó rơi vào nhánh
fallback `isHoLevel ? "ALL"`. `LeadTrialHistory` cũng vậy — và đó là dữ liệu **lead**, nên Đào tạo/HO
nhìn thấy lead cơ sở khác. Cả hai đã vá.

> Còn lại: nhánh fallback vẫn tồn tại cho model chưa map. Nay đã có test chặn, nhưng nếu thêm
> `SCOPED_MODEL` mới thì **phải** map prefix, đừng để nó âm thầm mở cross-center.

### 5.2 Bốn RoleDef không có người giữ

`CENTER_CLASS_MANAGER`, `CENTER_ACCOUNTANT`, `ASSISTANT_TEACHER`, `HO_SALE` vừa được vá scope nhưng
**không ai giữ** ⇒ smoke không chạm tới. Với `CENTER_CLASS_MANAGER` điều này đáng lo nhất: #16 sinh ra nó
để cấp `attendance:edit` cho CSKH/Sale, và flip sẽ bật một quyền **chưa từng có ai chạy qua**.

→ Đề nghị: gán tạm `CENTER_CLASS_MANAGER` cho 1 Sale mỗi cơ sở qua `/admin/users/[id]/org-roles`
(đi qua `rbac-service` → có `RbacAuditLog` + reason), rồi thêm S11 vào kịch bản.

## 6. Kết luận smoke

- [ ] Chạy hết S1–S10 + C1–C3
- [ ] `SELECT COUNT(*) FROM "RbacShadowDiff";` → **0**
- [ ] Nếu > 0: chạy **Shadow-compare report**, đọc **mục 3b** (lệch theo người) để biết ngay là
      thiếu `UserOrgRole`, thiếu seed, hay thiếu `target` — ba nguyên nhân khác hẳn nhau
- [ ] Diễn tập rollback: đổi `RBAC_V2_ENABLED=false` + redeploy, bấm giờ < 10 phút

Xanh cả ba ⇒ đủ cổng (a)(b)(c)(d) → **flip `RBAC_V2_ENABLED=true`**, trước UAT 20/07.
