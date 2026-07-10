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

## 0.1 ⚠️ Đọc kết quả cho đúng: smoke chạy khi `RBAC_V2_ENABLED=false`

Đó là chủ ý — v1 phục vụ người dùng, v2 chạy ngầm để so. Hệ quả khi đọc kết quả:

- **S1–S10 (trang vào được / bị chặn) đang kiểm v1, KHÔNG kiểm v2.** Nếu v2 sai, trang vẫn mở bình
  thường và bạn **không thấy gì** — sai sót chỉ hiện ra dưới dạng một dòng `RbacShadowDiff`.
  ⇒ Giá trị của S1–S10 là **ép `checkPermission()` chạy** để v1↔v2 được đối chiếu.
  ⇒ **Tiêu chí PASS là số dòng lệch = 0**, không phải "mở được trang".
- **C1–C6 (cách ly) kiểm thật.** `scopedDb` đọc `UserOrgRole` qua `resolveActor`, **không phụ thuộc cờ**.
  Cách ly sai ở đây là sai ngay hôm nay, không đợi flip.
- Vì cờ tắt nên smoke **an toàn**: một quyền v2 thiếu sẽ thành dòng lệch, không thành người bị khoá.

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

---

## 7. Kết quả smoke thật trên prod (10/07/2026, chỉ-đọc)

S1 Kiệt · S2+S9 Toại · S3 Liên · S4 Đức · S5 Diệu · S6 Huệ · S7 Linh — **gate vào/chặn đúng hết**.
Cách ly cơ sở quan sát được: Liên (QL CS2) thấy `0 học viên`, Kiệt thấy `1`.

Smoke không chỉ nghiệm thu checklist — nó lòi ra **3 lỗi lệch giữa menu và cổng trang**, cả 3 đều
có sẵn trên prod hôm nay và **không do RBAC v2 sinh ra** (v1 dính y hệt).

### 7.1 Dead link — menu mời vào, trang đá ra

| Vai | Mục menu | Menu đòi | Trang gác bằng | Hệ quả |
|---|---|---|---|---|
| MARKETING | Nội dung website `/site-content` | `site-content:view` | `honors:settings` | bấm → văng `/dashboard` |
| TEACHER | Học viên `/students` | `students:view-own-class` | `students:view-all` | bấm → văng `/dashboard` |
| TEACHER | Chăm sóc HV `/cham-soc-hv` | `students:view-own-class` | `students:view-all` | bấm → văng `/dashboard` |

Ca `/site-content` đã **quan sát trực tiếp** trên phiên của Linh. Hai ca TEACHER suy ra từ quét tĩnh
(`sidebar.tsx` × gate `page.tsx`), cùng biểu hiện ở cả v1 lẫn v2.

Sau flip, `/site-content` tự hết đau vì `HO_MARKETING` tình cờ giữ **cả** `honors:settings` — tức là
đúng do may, không do thiết kế. Gác `/site-content` bằng `honors:settings` là sai ngữ nghĩa: action
`site-content:view` / `site-content:edit` có tồn tại nhưng **không call-site nào dùng để gác trang**.

### 7.2 Ẩn mà vẫn vào được — hở quyền theo URL (nặng hơn)

Chiều ngược lại nguy hiểm hơn: menu giấu, nhưng gõ URL thì trang mở. Quan sát trực tiếp trên phiên
**Linh (Marketing)** — 4 trang dưới đây **không** có trong sidebar của cô ấy, vẫn vào được:

| URL | Trang gác bằng | Marketing có? | Nội dung lộ |
|---|---|---|---|
| `/tin-nhan` | `classes:view-all` ∨ `classes:view-own` | ✅ `classes:view-all` | toàn bộ hội thoại phụ huynh ↔ giáo viên |
| `/hoc-ba` | `students:view-all` ∨ `students:view-own-class` | ✅ `students:view-all` | học bạ từng HV + **xuất PDF** |
| `/canh-bao-rui-ro` | `students:view-all` | ✅ | HV nguy cơ rời bỏ |
| `/cham-soc-hv` | `students:view-all` | ✅ | ghi chú chăm sóc HV |

Không riêng Marketing. Cùng khe hở đó, theo ma trận:

- **v1:** `ACCOUNTANT`, `HR`, `MARKETING` (đều có `students:view-all` + `classes:view-all`).
- **v2:** `HO_ACCOUNTANT`, `HO_HR`, `HO_MARKETING`, `CENTER_ACCOUNTANT`, `CENTER_HR`,
  `CENTER_CLASS_MANAGER` — và HO thì `scopedDb` cho **xuyên cơ sở**.

Nghĩa là **kế toán Hội sở đọc được tin nhắn phụ huynh của mọi cơ sở, và tải được học bạ mọi HV.**
Hôm nay prod gần như trống nên thiệt hại bằng 0; sau UAT 20/07 có dữ liệu thật thì không còn vô hại.

Đây **không phải** lỗi của `scopedDb` (nó cách ly *cơ sở*, không cách ly *chức năng*). Lỗi ở chỗ trang
CSKH/học bạ mượn tạm `students:view-all` làm cổng, trong khi action đúng là `parent-requests:manage`
(CSKH) và `curriculum:view` / `report-cards:view` (học bạ).

### 7.3 Vì sao shadow-compare không bắt được

`RbacShadowDiff` chỉ ghi khi **v1 ≠ v2** trên cùng một action. Ở đây v1 và v2 **đồng ý với nhau** —
cùng cho Marketing `students:view-all`. Sai nằm ở *chọn nhầm action để gác*, không ở *ai giữ action*.
Shadow xanh không đồng nghĩa phân quyền đúng; nó chỉ nói v2 không làm lệch so với v1.

→ Bài học: bổ sung một invariant tĩnh **"perm ở menu ⊆ gate của trang"** vào CI (script quét đã có).

### 7.4 Phát hiện thứ tư — sidebar dùng v1, cổng trang dùng cờ ⇒ **chặn flip**

`components/admin/sidebar.tsx` lọc menu bằng `can(user, perm)` — ma trận **v1 tĩnh, luôn luôn**.
`page.tsx` gác bằng `checkPermission()` — **theo cờ `RBAC_V2_ENABLED`**.

Hôm nay cờ OFF ⇒ hai bên trùng nhau, không ai thấy gì bất thường. Bật cờ ⇒ chúng tách đôi ở
**mọi** vai có v2 ≠ v1:

- Toại (`CENTER_MANAGER`) mất 9 nhóm quyền ở v2 (`payments:manage`, `orders:manage`,
  `vouchers:manage`, `products:manage`, `inventory:audit`, `honors:settings`, `students:delete`,
  `enrollments:delete`, `leads:delete`) — nhưng menu v1 vẫn mời anh ấy vào cả 9 ⇒ **9 dead link
  sinh ra đúng lúc flip.**
- Ngược lại `HO_MARKETING` được `honors:settings` ở v2 nhưng menu v1 (`MARKETING`) không có
  ⇒ "Vinh danh" vẫn ẩn dù trang đã mở.

Sửa đúng: `layout.tsx` (server) tính sẵn tập action được phép — bằng chính `evaluatePermission`
+ cờ mà trang dùng — rồi truyền xuống `<Sidebar>`; sidebar lọc theo tập đó thay vì tự gọi `can()`.

⚠️ Vướng `#13` (RoleSwitcher): hiện switcher thu hẹp menu bằng cách lọc `user.roles` **phía v1**.
Khi sidebar chạy theo v2, `actor` không biết "vai đang chọn" ⇒ switcher hết tác dụng lọc menu.
Cần `menuActorForRole(actor, roleCode)` song song với `menuUserForRole` đã có. **Chưa làm** —
và RoleSwitcher còn đang **crash tab** (gặp ở S2, chưa truy nguyên).

→ Cả hai là **điều kiện tiên quyết của flip**, độc lập với 3 lỗi ở §7.1–§7.2.

## 8. Đã sửa (10/07) — gom cổng về một bảng

`lib/auth/page-gates.ts` thành **nguồn duy nhất**: sidebar lấy `perm` từ đó, `page.tsx` gác bằng
`checkAnyPermission(PAGE_GATES[href])`. Menu và cổng không còn hai danh sách để lệch nhau.

| Route | Trước | Sau | Ai đổi |
|---|---|---|---|
| `/site-content` | gate `honors:settings` | `site-content:view` | Marketing **hết dead link** |
| `/students` | menu có `students:view-own-class` | menu = gate | GV hết dead link (mục biến mất) |
| `/hoc-ba` | gate `students:view-all` | `curriculum:view` ∨ `students:view-own-class` | **cắt** HR, Kế toán, Marketing, Sale, Giáo vụ |
| `/tin-nhan` | gate `classes:view-all` | `parent-requests:manage` ∨ `classes:view-own` | **cắt** Đào tạo, HR, Kế toán, Marketing |
| `/canh-bao-rui-ro` | gate `students:view-all` | `parent-requests:manage` | **cắt** Đào tạo, HR, Kế toán, Marketing |
| `/cham-soc-hv` | gate `students:view-all` ∨ `hasRole(SALES_CSM)` | `parent-requests:manage` | như trên; bỏ hack `hasRole` |
| `/marketing` | menu `site-content:view` | menu = gate `leads:view-all` | QL cơ sở hết bị ẩn mục Tracking (v2) |
| `/chuyen-lop` | menu `enrollments:transfer` | menu = gate `enrollments:create` | **Sale thấy được** việc của chính mình |
| `/media` | menu thiếu `media:upload` | menu = gate | không ai đổi (cùng người giữ) |

Kèm theo: `CENTER_CLASS_MANAGER` (Giáo vụ) được cấp `parent-requests:manage[GLOBAL]` — vai `#16`
sinh ra để làm CSKH thì phải qua được cổng CSKH.

**Khoá lại bằng test** (`lib/auth/page-gates.test.ts`, chạy trong Vitest CI):

1. `menu ≡ gate` cho mọi mục sidebar có `perm` và trang có `if (...) redirect(...)`.
   Lệch chiều nào cũng đỏ. Đã thử tái tạo bug cũ ⇒ test đỏ đúng route.
2. Mọi action trong bảng phải tồn tại trong `PERMISSIONS` v1.
3. Route trong bảng phải gác bằng chính `PAGE_GATES[href]`, không khai action rời.
4. `GATE_MISMATCH_ALLOWLIST` chỉ chứa route **thực sự còn lệch** (hết lệch mà quên xoá → đỏ).

Và `rbac-scope.test.ts` học thêm **dạng call-site trần thứ ba**: action nằm trong `PAGE_GATES`
đều được gọi không-target ⇒ bắt buộc `scopeType = GLOBAL`. (Hai dạng trước: `checkPermission("x")`
và `cfg.can("x")` — mỗi dạng từng là một điểm mù đã cắn ta một lần.)

**Còn lệch có chủ đích** (khai trong `GATE_MISMATCH_ALLOWLIST`, kèm lý do):
`/bao-cao/*` (chờ BGĐ chốt ai xem báo cáo đào tạo) · `/cham-cong/lich-ca-nhan-vien` (gate có
target `centerId`, không quy về so-sánh-tập-hợp được).

**Việc prod còn lại:** chạy lại workflow `seed-prod-roles` để `CENTER_CLASS_MANAGER` nhận
`parent-requests:manage`. Không chạy ⇒ sau flip Giáo vụ mất trang CSKH.

## 9. Đã sửa (10/07, đợt 2) — menu đi theo cờ, và crash #13

Chốt của BGĐ: **giữ `#13` đầy đủ** (phương án A). Kéo theo hai việc.

### 9.1 Crash RoleSwitcher — truy nguyên xong, không phải bí ẩn

`DropdownMenuLabel` map thẳng sang `Menu.GroupLabel` của `@base-ui/react`. Đọc mã nguồn thư viện:

```js
function useMenuGroupRootContext() {
  const context = React.useContext(MenuGroupContext);
  if (context === undefined) throw new Error('… Menu group parts must be used within <Menu.Group>.');
```

RoleSwitcher đặt `<DropdownMenuLabel>` **trần** trong `DropdownMenuContent` ⇒ mở dropdown là throw
khi render popup. Prod minify lỗi thành `formatErrorMessage(31)` nên người dùng chỉ thấy
*"This page couldn't load"*. Menu tài khoản ở topbar không dùng `Label`, nên nó chạy — chính điều
đó làm lỗi trông như ngẫu nhiên.

Sửa: bọc `<DropdownMenuGroup>`. Khoá bằng `components/ui/dropdown-menu.test.tsx`:
tái hiện crash trong unit test (không Group ⇒ throw), khẳng định có Group ⇒ render, và quét tĩnh
"mọi file dùng `DropdownMenuLabel` phải có `DropdownMenuGroup`".

### 9.2 Menu hỏi cùng một nguồn với cổng trang

`layout.tsx` (server) gọi `grantedMenuActions()` — dùng đúng `evaluatePermission` + cờ mà
`checkPermission` dùng — rồi truyền tập action xuống `<Sidebar granted={...}>`. Sidebar thôi tự gọi
`can()` v1. Hết lệch menu↔cổng ở cả hai phía cờ.

Hai điều cố ý **không** làm trong `grantedMenuActions`: không ghi `RbacShadowDiff` (menu không phải
điểm cưỡng chế — ghi vào là bơm ~120 dòng nhiễu mỗi lần mở trang) và không dùng logger mặc định
(`decidePermission` mặc định `logger = console`, sẽ warn ~120 lần/request).

### 9.3 RoleSwitcher phải đổi sang mã vai v2

Phát hiện khi soi kỹ: **Role enum legacy và RoleDef code chỉ trùng nhau 5/9.**

| Trùng | Chỉ có ở v1 | Chỉ có ở v2 |
|---|---|---|
| `SUPER_ADMIN` `CENTER_MANAGER` `TEACHER` `TRAINING` `PARENT` | `HR` `SALES_CSM` `MARKETING` `ACCOUNTANT` | `HO_*` `CENTER_HR` `CENTER_SALES_CSM` `CENTER_ACCOUNTANT` `CENTER_CLASS_MANAGER` `ASSISTANT_TEACHER` `HO_SALE` |

Nếu giữ switcher chạy trên mã legacy trong khi menu đọc v2, **Mỹ chọn "Sale" sẽ mất sạch menu Giáo
vụ** — đúng lớp lỗi "menu nói dối" mà §8 vừa diệt. Nên: cờ OFF → chọn theo vai legacy; cờ ON → theo
RoleDef code (`activeRoleOptions`). `menuActorForRole` hạ cả `isSuperAdmin` theo vai đang chọn, nếu
không thì Kiệt chọn "Giáo viên" vẫn thấy menu quản trị (v2 bypass). Grant riêng (`grantsAllow`) giữ
nguyên vì nó gắn với con người, không gắn với vai. `dashboard/page.tsx` và `setActiveRoleAction`
dùng chung nguồn xác thực vai đó, không thì cookie mang mã v2 sẽ bị coi là "không sở hữu".

### 9.4 Lưới an toàn của chính cuộc refactor

`lib/auth/menu-permissions.test.ts` khẳng định: **cờ OFF ⇒ tập action menu trùng khít `can(user, a)`
cũ** cho 5 tổ hợp vai. Prod đang chạy cờ OFF, nên đây là bằng chứng "không đổi một ly". Đã
mutation-test (ép `flagOn: true` ⇒ 5 ca parity đỏ). Cộng thêm: cờ ON ⇒ `payments:manage` biến khỏi
menu QL cơ sở — tức 9 dead-link của Toại được diệt tại gốc, không phải bằng cách vá từng mục.

**Còn lại trước flip:** diễn tập rollback (`RBAC_V2_ENABLED=false` + redeploy, bấm giờ < 10 phút) và
báo trước cho Toại 9 nhóm quyền anh mất tại thời điểm flip.
