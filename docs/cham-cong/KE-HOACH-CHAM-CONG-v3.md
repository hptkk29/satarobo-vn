# KẾ HOẠCH MODULE CHẤM CÔNG — bản v3.3 (37 câu chốt · lịch phân ca thật · khảo sát MISA · nguyên tắc tự vận hành)

> **Ngày lập:** 03/09/2026 (v3) → v3.1 cùng ngày (16 câu + Sheet) → v3.2 (khảo sát MISA 04/09 + 5 file xuất) → **v3.3 05/09/2026 sau khi chủ dự án chốt U-01…U-03 + K-01…K-09 và đặt nguyên tắc "tự vận hành, không qua dev" (PHẦN 6b)**.
> **Nhánh:** `hptkk29/module-cham-cong` (cắt từ `main`, sau `main` 2 commit) · **commit đọc code:** `c87c524a`.
> **Thay cho:** `PLAN-CHAM-CONG-SATAROBO-v2` (03/09/2026).
> **Nguồn sự thật vận hành (S2):** `E:\websatarobo data\LICH-PHAN-CA-SATA-ROBO.xlsx` (29/08/2026) + `lichphanca.zip` (`Code.gs` + `HUONG-DAN-SETUP.md`).
> **Nguồn sự thật thứ hai (S1 + lương):** `E:\websatarobo data\misa-khaosat\` — 16 báo cáo + 9 file dữ liệu trích từ tenant MISA AMIS Chấm công + Tiền lương (04/09/2026). Đọc `bao-cao/16-tong-hop-cuoi-cho-ba.md` trước.
> **Đọc kèm:** [`docs/ba-cham-cong-hien-trang-va-misa.md`](../ba-cham-cong-hien-trang-va-misa.md) (28/07) — thuật toán ghép cặp §6.3-bis dùng lại nguyên văn; DG-07/08/34 đã vá.
>
> **Quy ước:** `đường/dẫn:dòng` = đã đọc trực tiếp trong repo. **[ĐO PROD]** = đo trên bản dump prod `satarobo-prod-20260801.dump` (01/08/2026, 5 tuần cũ — phải đo lại trước khi merge).

---

## ĐÃ SỬA GÌ SO VỚI BẢN SÁNG NAY (v3 → v3.1)

| # | Bản sáng viết | Nay sửa thành | Vì sao |
|---|---|---|---|
| S-01 | Giờ ca 07:45/13:45/17:15 của plan v2 "không khớp nguồn nào" | **Plan v2 ĐÚNG** — khớp Sheet. Ba giờ **bắt đầu** trong `lib/shifts.ts:9-11` (07:30/13:30/17:00) là hằng số dev tự đặt (commit `d8067a97`, không dẫn quyết định nào), còn mâu thuẫn với giờ mở cửa 07:45 chủ dự án chốt 19/08. Giờ **kết thúc** vốn đã khớp | Q-05/Q-06 + phản biện PB1 |
| S-02 | `ShiftTemplate` = "một khoảng giờ + weekdays + hệ số" | **21 mã ca, mỗi mã 2 buổi (sáng/chiều), mỗi buổi giờ riêng + nơi làm riêng**; có mã chỉ nói nơi (D1/D2), chỉ nói tính chất (LD/NG), hay nghỉ (X/P). Biểu diễn bằng `segments` | Sheet DANH MỤC CA |
| S-03 | "Phiếu điều động" là nguồn hợp lệ hoá chấm chéo cơ sở | **Không tạo bảng điều động mới**, nhưng nơi làm cũng **không nằm trong mã ca của giáo viên** (S/C/T để trống nơi = "cơ sở của đơn vị", mà GV **đã là nguồn lực chung ở Hội sở từ 06/08** — `fdb0ead1`, `lib/teachers/center-filter.ts:22-26`). ⇒ `ShiftAssignment` phải có **nơi làm theo buổi**; với GV, nơi đó **sinh từ `ClassSession`/`TrialClassSession`** (nguồn CHÍNH), không phải phụ | Phản biện PB4 |
| S-04 | `AttendanceRejection` gộp vào `StaffTimeLog.result` — và tôi định thêm giá trị `FLAGGED` | Giữ `result = ACCEPTED \| REJECTED` (phán quyết của **máy** lúc ghi, bất biến; REJECTED chỉ cho lỗi kỹ thuật). **Cờ ra cột mảng `flags[]`**; cờ nghiệp vụ so với lịch sinh ở **job tính ngày**, không sinh lúc ghi; phán quyết của **người** ở `reviewStatus`. Hệ quả lên công **theo từng loại cờ** (BA QT-11/§6.3-bis), không phải "FLAGGED tính như ACCEPTED" | Q-07 + PB2 |
| S-05 | Mở rộng `WorkShiftConfig` thành `ShiftTemplate` | **Tạo mới `ShiftTemplate`**, đóng băng `WorkShiftConfig`. Bảng cũ có `@@unique([centerId, code])` + `startTime/endTime NOT NULL` (`schema:4911-4918`) — không phiên bản hoá được, và bắt điền giờ giả cho X/P/LD/D1/D2 | 2 giám khảo cùng ghép ý này |
| S-06 | Mở rộng `TimesheetEditLog` (thêm centerId/orgUnitId) | **Đóng băng**, ghi mọi sửa lượt/sửa công vào **`AuditLog` hợp nhất** (`writeAudit`, có `orgUnitId`) — đúng đích CLAUDE.md, và bảng cũ **0 dòng trên prod** | [ĐO PROD] |
| S-07 | "Rổ prefix riêng" cho bảng chấm công | Prefix phải là **FULL KEY** (`"hr_attendance:view"`, `"hr_attendance:assign"`…) vì `getModelPrefixes` so bằng `startsWith` (`lib/db-scope.ts:341`). Đặt tên rổ kiểu `hr_attendance_log:` là **không bao giờ khớp** ⇒ rơi về `isHoLevel ? ALL` — chính lỗ đang muốn vá | 2 giám khảo cùng bắt |
| S-08 | Export "theo SR.QD.231" là việc chặn | **Bỏ tham chiếu SR.QD.231** (chủ dự án không biết nó là gì; repo chỉ dùng số hiệu này ở e-learning `schema:7774`). Chiều dữ liệu là **satarobo → MISA Tiền lương** (quyết định 05/08; PRD A5 "định dạng chưa chốt"). Việc thật: lấy **file bảng công Kế toán đang nộp/nhập MISA** | Q-08 + PB5 |
| S-09 | 2-phase cho `EmployeeCheckin`/`ShiftRegistration` | **Thay thẳng** — 5 bảng cũ **0 dòng trên prod** [ĐO PROD]. Đóng băng = xoá đủ 10 điểm ghi + cổng ESLint; bỏ cờ `CHAM_CONG_V2` (không có ghi kép nào để mất; rollback = promote deployment trước) | Q-01 + PB6 |
| S-10 | "Thêm `homeCenterId`" → chọn 1 trong 2 cột | `Employee.centerId` (Q-03), đọc qua **một hàm** `resolveHomeCenter(userId)` tra hồ sơ của **chính mình** (bypass scope, khuôn `lib/elearning/entry.ts:30-43`); **không có Employee ⇒ lỗi `NO_EMPLOYEE_PROFILE` tường minh**, không fallback `User.centerId`. Với HO: `Employee.centerId = NULL` cố ý — **suy "là người HO" từ `EmployeeOrgAssignment @ HO` / `actor.isHoLevel`, không từ cột** (`SR.NV.001` Phúc cũng NULL nhưng là Quản lý CS1+CS2) | Q-03/Q-04 + kiểm chứng |
| S-11 | Ước lượng 6–7 tuần | **9–11 tuần** cho 1 dev — con số 6–7 sáng nay **không khớp tổng các lô** của chính nó; mô hình Sheet (21 mã × 2 buổi, khung ca → lưới tháng, import có diff, tin 19:00, đơn đổi ca có hệ quả) gấp đôi giả định 3 ca | tự soát |
| S-12 | Cutover S2/S3/S4 01/11 | **S2/S3/S4: 01/12/2026** · **S1 (lương): 01/01/2027** | hệ quả S-11 |
| S-13 | Đơn vị "công" chưa nói | **Công tính theo NGÀY** — Sheet: "Tổng công = số ô có mã, trừ X và P" (ô `S` 3h45 = ô `SCT` 11h = 1 công). Q-09 ⇒ hai số **sống cạnh nhau** trên mỗi ngày: `dayCreditEarned` (theo ca) và `hourCredit` (theo giờ, cho HC/HO). **Không đẻ "hệ số" nhân** trong đợt 1 trừ khi Kế toán định nghĩa (câu treo T-04) | Sheet + Q-09 |
| S-14 | HO chấm ở đâu là câu chặn | **Đã chốt (Q-04): HO chấm mọi cơ sở.** Không tạo `WorkLocation` cho `hoi-so` (không toạ độ; `OrgUnit(HO).address` trùng CS2). Sổ công HO dùng `centerId = "hoi-so"` (chuỗi, bắc cầu qua `Center.code='HO'` — `lib/org/dual-write.ts:66-83`) để `can()` CENTER của vai neo HO (centerScope ALL) duyệt/chốt được | Q-04 + ghép [B] |
| S-15 | Q-16 (toạ độ + luật sư) | Ghi nhận **nguyên văn quyết định của chủ dự án**; kế hoạch **không đánh giá** căn cứ đó đủ hay không cho loại dữ liệu nào (xem §6) | PB3 |
| **S-16** | Engine tự trừ công khi thiếu lượt/thiếu buổi | **Công ĐẾM THEO KẾ HOẠCH** như Sheet (T-01): `dayCreditEarned` mặc định = `dayCreditExpected`; lượt chấm chỉ **sinh cờ**; QLCS rà hộp cờ và ghi `overrideUnits`; Kế toán khoá kỳ = kiểm cuối. Bảng công **không cần lượt chấm** để ra số | T-01 |
| **S-17** | Mr Phúc = "2 dòng" là bài toán mô hình | **Miễn tính công** (T-02) bằng cờ **theo NGƯỜI** `Employee.timesheetExempt` (khuôn SEC-M15 của `isCEO`, chỉ SUPER_ADMIN set, audit) — **không** đặt trên ô lịch/assignment (quên chép cờ khi import/đổi ca là anh "có công" trở lại; ngày chấm ngoài lịch không có dòng nào mang cờ). Engine đọc cờ **ngay đầu** `recomputeAttendanceDay` ⇒ early-return + audit `SKIPPED_EXEMPT`. Vẫn có khung ca 2 khối ⇒ vẫn vào tin 19:00 | T-02 + phản biện |
| **S-18** | Dung sai đi muộn 5′ | **30 phút** (T-12); "có mặt trước ca 10′" chỉ nhắc | T-12 |
| **S-19** | Đơn HO chỉ SUPER_ADMIN duyệt được | Mọi đơn (không riêng HO) phải mang `centerId` = **cơ sở nhận đơn** ≠ `hoi-so`/null, suy từ **nơi làm đã resolve** của ngày áp dụng (GV = `class.centerId` của `ClassSession`), không suy ra được thì **bắt buộc chọn tay**. Lý do: hôm nay `WorkRequest.centerId = session.user.centerId` và GV đã bị dời về HO 06/08 với `User.centerId = "hoi-so"` ⇒ **đơn GV trên prod hiện chỉ SUPER_ADMIN duyệt được** | T-06 + phản biện |
| **S-20** | "Rollback duyệt khi áp thất bại" là chuyện bọc tx | Không tự xảy ra: `cancelSession`/`adjustSession` **tự mở `db.$transaction` riêng** (`lib/classes/adjust.ts:96,237`) và **trả `{ok:false}` chứ không throw**. Phải thêm tham số `tx`, chủ động `throw`, phân biệt `applied:false` "không cần áp" với lỗi thật, ghi `applyError` **sau** rollback | T-05 + phản biện |
| **S-21** | (S-08) "Repo không có bằng chứng Sata Robo dùng MISA Chấm công" | **SAI.** Tenant MISA có **900 lượt chấm tháng 7/2026, 32 người**, 69,6% từ app mobile, **27,2% (245) là sửa tay ô công**, 29 lượt chấm hộ. Nhưng **0 lượt từ 01/08 → 04/09** — MISA Chấm công đã ngừng nhận dữ liệu đúng lúc Sheet ra đời. **S1 là thật, và S1 đã chết từ 01/08.** | misa-khaosat §13 KS-14 |
| **S-22** | "SR.QD.231" là tài liệu không ai biết | **Công thức hệ số công nằm ngay trong MISA Tiền lương** (`Mẫu bảng lương`): `HỆ SỐ CÔNG = TONG_CONG_DI_LAM_THUC_TE_THEO_NGAY ÷ SO_CONG_CHUAN`, nhân vào **`LUONG_CO_BAN_THUC`** và **`LUONG_THEO_HIEU_QUA_CONG_VIEC_THUC`**; **không** nhân vào `LUONG_GIANG_DAY = SO_BUOI × DON_GIA_BUOI` (gõ tay), `HOA_HONG`, `THUONG`. Tên số hiệu vẫn không có bản gốc, nhưng **nội dung đã có** | misa-khaosat §15 B.3 |
| **S-23** | T-08 "chưa có file" là câu chặn | **Đích export đã rõ:** mẫu nhập của `AMIS Tiền lương → Dữ liệu tính lương → Chấm công → Nhập khẩu` — **44 thành phần loại "Chấm công"**, rút còn ~15. 3/5 bảng công hiện tại trong Tiền lương đã là **"Tự thêm"** (nhập tay, bỏ qua module Chấm công) ⇒ đường này **đang chạy thật**, rủi ro ≈ 0. Việc L0: **Kế toán tải mẫu import** | misa-khaosat §15 B.1, C.2 |
| **S-24** | T-01 "đếm theo kế hoạch như Sheet" (1 công/ô) | **Xung đột đơn vị:** MISA khai **S/C/T = 0,5 công**, HC = 1 (`du-lieu/01-ca-lam-viec.csv`); Sheet đếm **mỗi ô có mã = 1 công**. Giáo viên 4 ô `S`: Sheet 4 công, MISA 2. Export sang MISA Tiền lương phải theo **đơn vị của MISA** ⇒ "đếm theo kế hoạch" = **đếm theo `ShiftTemplate.dayCredit`** (S/C/T 0,5 · SC/ST/CT 1 · SCT 1,5 · HC/CG/CS/CCT/CGD/12/21/2C/NG/LD 1 · X/P 0), không phải đếm ô. **Chủ dự án phải xác nhận** (K-01) | Sheet vs MISA |
| **S-25** | `soBuoiDay` không có trong kế hoạch | **Thêm.** `LUONG_GIANG_DAY` = số buổi × đơn giá, `SO_BUOI` hiện **gõ tay** bên Tiền lương. Hệ thống ta sinh được từ `ClassSession` đã hoàn thành (teacherId ∪ actualTeacherId ∪ substituteTeacherId) — mối nối MISA thiếu, giá trị lớn nhất cho giáo viên. Xuất trong `summaryJson` | misa-khaosat §15 S21/M8 |
| **S-26** | Công chuẩn chưa nói tới | `AttendancePeriod.standardUnits` **sinh từ** nghỉ tuần (T2 cho CS1/CS2/HO — Sheet mới; MISA **không khai được Thứ Hai**, đang trừ Chủ nhật ⇒ 26/27 sai) + `Holiday`; **không** phải công thức người gõ (MISA đang là `MONTH(06)-4`). Đè theo người: `Employee.standardUnitsOverride?` (MISA có, để trống = kế thừa) | misa-khaosat §14 4.2, §15 B.4 |
| **S-27** | Quỹ phép, loại nghỉ, lễ chưa có danh mục | Loại nghỉ = **8** của MISA trừ loại tự chế "Thứ 2" (Nghỉ phép 100% · Không lương 0% 10ng/năm · Kết hôn 7 · Con kết hôn 3 · Ma chay 3 · BHXH 0% · Thai sản 180 · Nghỉ bù) → `WorkRequest.leaveType` + `paidRatio`. Quỹ phép (+1/tháng từ ngày vào, 12/năm chính thức, không chuyển năm, có ứng) → `LeaveBalance` **đợt 2**; đợt 1 chỉ đếm `leaveUnits`. Lễ 2026 MISA khai **thiếu 4 ngày** — seed đủ 11 ngày theo luật + 24/11 (NQ 28/2026) | misa-khaosat §9.1, §14 4.11–4.13 |
| **S-28** | Chấm công hộ chưa bàn | **Không tái tạo** "chấm hộ nhập giờ tự do". Đo trên file thô `Dữ liệu chấm công.xlsx`: **29 lượt chấm hộ đều do 1 thực tập sinh CS1** (`CS1.TTS.007`) gõ, cho 7 người ở **cả 3 đơn vị** (kể cả HO, kể cả **8 lượt cho chính mình**), giờ gõ toàn mốc ca tròn (17:30 ×11, 07:30 ×7). Đường duy nhất = `TIMESHEET_FIX` có lý do danh mục + duyệt + audit; QLCS xác nhận thay chỉ trong phạm vi cơ sở mình, **không bao giờ cho chính mình** | `E:\hoá đơn\Dữ liệu chấm công.xlsx` |
| **S-29** | Thiết kế ghép cặp "1 vào 1 ra" là đủ | **Không.** Trong 275 người-ngày chấm mobile: **79 (29%) chỉ 1 lượt** (không ghép được), **88 (32%) có 3–7 lượt** (ca ghép S+C+T hoặc bấm trùng). Đỉnh giờ 17h có **210 lượt** — vừa là giờ RA của C vừa là giờ VÀO của T. Ghép cặp bắt buộc theo **đoạn ca** (GC-01..08) và **C/T không được chồng giờ** (Sheet: C tới 17:30, T từ 17:15 ⇒ chồng 15′; MISA: C 17:00, T 17:30 ⇒ có khe) → thêm vào **K-01** | file thô, đo 05/09 |
| **S-30** | Mã nhân viên MISA là khoá ổn định | **Không.** MISA đổi mã người nghỉ thành `_DELxxxx` rồi **cấp lại mã cũ cho người mới**: `CS2.NV.004` T7 = Nguyễn Thị Thiên Trang (`_DELcdba`), T9 = Dương Thị Mỹ Trang (Giám đốc trung tâm). File thô T7 lại ghi mã **gốc** (không `_DEL`). ⇒ `Employee.employeeCode` của ta **không bao giờ cấp lại**; import lịch sử T7 phải ghép theo **mã + họ tên + đơn vị**, không theo mã | `Bảng phân ca tổng hợp T9` vs `Bảng chấm công tổng hợp T7` |
| **S-31** | (S-24) Đơn vị công theo MISA 0,5 | **ĐẢO — chủ dự án chốt K-01 "theo Sheet":** mọi mã làm việc **= 1 công/ngày** (S = SC = SCT = HC = LD = 1; X/P = 0). Bỏ bảng 0,5. Giờ ca **giữ nguyên Sheet**, kể cả C/T chồng 15′ ⇒ ghép cặp theo **thứ tự lượt trong ngày** (lượt kế tiếp thuộc về mốc còn thiếu gần nhất), không theo "gần mốc nào nhất" | K-01 |
| **S-32** | (S-23) Export = mẫu nhập MISA Tiền lương | **ĐẢO — K-03 "thay luôn" + K-02 "tháng 8 không tính ở đâu":** MISA **ra khỏi hệ thống hoàn toàn**, không còn đích nhập nào. Export đợt 1 = **Bảng công tổng hợp Excel** của chính hệ thống (đủ cột Kế toán quen: công chuẩn · công theo mã ca · nghỉ phép/lễ/không lương · đi muộn · số lần sửa · **số buổi dạy** · **hệ số công**) + sheet lưới ô mã ca. **Tính lương trong app = module riêng, đợt sau**, ngoài 9–11 tuần này; bảng công của ta là đầu vào duy nhất của nó. Mẫu `Mau_NK_*` của MISA **không dùng** | K-02, K-03 |
| **S-33** | (S-26) Công chuẩn đè theo người | **K-04 "theo MISA":** một con số cho **mọi người trong kỳ × cơ sở**, không đè theo người ⇒ **bỏ `Employee.standardUnitsOverride`**. Số này **sinh** từ setting nghỉ tuần (`shift.weeklyOffDays`, theo cơ sở) + `Holiday`, và Kế toán **được sửa trên kỳ** trước khi khoá (audit + lý do) — đúng cách MISA cho sửa "Số công chuẩn" | K-04 |
| **S-34** | `teachingSessions` chưa có luật | **K-05:** đếm `ClassSession` **COMPLETED** mà người đó là GV **thực dạy** (`actualTeacherId` ?? `substituteTeacherId` ?? `teacherId`); **không** đếm buổi Trial (đã có hoa hồng 1% `TRIAL_TEACHER` khi chốt); **không** đếm buổi huỷ; **đơn giá buổi gõ tay** (thuộc module lương, không vào bảng công) | K-05 |
| **S-35** | Loại nghỉ / quỹ phép / lịch sử T7 | **K-06 "theo MISA":** 8 loại nghỉ + tỷ lệ lương của MISA (bỏ "Thứ 2"), nghỉ không lương trần 10 ngày/năm, quỹ phép +1/tháng, 12/năm, không chuyển năm — **đều là danh mục sửa được trên UI** (S-36). **K-07:** không import T7; 2 file xuất lưu làm hồ sơ. **K-08/K-09 bỏ** | K-06..09 |
| **S-36** | Kế hoạch còn "script dry-run chạy tay" ở L1 + Pha A | **Chủ dự án đặt nguyên tắc: hệ thống tự vận hành, không qua dev, chỉnh linh hoạt theo phân quyền như MISA** ⇒ PHẦN 6b mới. Hệ quả: mọi tham số vào nhóm setting `shift.*` (**đã có 5 key**, `centerOverridable`, màn `/admin/cau-hinh-van-hanh`); nhập khung ca/lưới tháng **qua màn import có diff** ngay từ L1, không script; danh mục ca/loại nghỉ/lễ/địa điểm là **màn CRUD có quyền**; cấp quyền qua **vai** (`UserOrgRole`) trên màn nhân sự — dev chỉ còn làm seed nền 1 lần (`seed-roles`) | chủ dự án 05/09 |

---

## PHẦN 0 — BA VIỆC ĐANG CHẢY MÁU TRÊN PROD (không đổi)

### 0.1 🔴 Giáo viên thuần không chấm công được — từ 10/07/2026

QR mã hoá `admin.satarobo.vn/cham-cong/checkin?c=…&t=…` (`api/admin/cham-cong/qr-token/route.ts:26`) → `decideRoute` đá GV thuần khỏi host admin **vô điều kiện** (`lib/auth/route-policy.ts`: `teacherSiteOn && isTeacherOnly → 307 sang giaovien.satarobo.vn`) → site GV **không có** `cham-cong` trong `TEACHER_ROUTE_SEGMENTS`. Quyền thì đủ. **Vá:** thêm segment + mount `app/(teacher)/teacher/cham-cong/`.

### 0.2 🔴 5 vai RBAC v2 thiếu `hr_attendance:checkin` — Q-12: **cần cấp**

`CENTER_CLASS_MANAGER`, `ASSISTANT_TEACHER`, `CENTER_ACCOUNTANT`, `HO_SALE`, `AUDITOR`. Sửa `prisma/seed-roles.ts` + bấm tay `seed-prod-roles.yml`.

### 0.3 🔴 Chấm chéo cơ sở đang mở toang

`can()` với `GLOBAL` bỏ qua target (`lib/auth/can.ts:15`) · `Center ∈ SCOPE_EXEMPT` (`db-scope.ts:159`) · geofence fail-open hai tầng (`geofence.ts:24`, `actions.ts:63`) · **prod: 0/3 Center có toạ độ** [ĐO PROD] ⇒ hôm nay **không có kiểm vị trí nào cả**.

---

## PHẦN 1 — NGUỒN SỰ THẬT: LỊCH PHÂN CA 29/08/2026

### 1.1 Cách S2 đang chạy

- Excel 13 sheet, import lên Google Sheet, `Code.gs` (Apps Script, TZ Asia/Ho_Chi_Minh) sinh **3 tin lúc 19:00** (CS1 · CS2 · HO), nội dung = lịch **ngày mai**; AutoHotkey dán vào 3 nhóm Zalo.
- **KHUNG CA CỐ ĐỊNH** (ca lặp hằng tuần, 20 dòng/19 người) → sinh **LỊCH T08→T12** (lưới: người × ngày, ô = mã ca). Sửa khung trước, sinh lại lưới sau.
- **Người làm 2 cơ sở có 2 dòng** (Mr Phúc): dòng CS1 ghi `D2` ngày sang CS2, dòng CS2 ghi ca thật — để tin của cả hai cơ sở đều nhắc đúng. `D1/D2` là **tham chiếu chéo của bố cục 2 dòng, không có giờ**.
- **Tổng công = số ô có mã, trừ X và P** (công thức Excel). **Nghỉ/Phép = đếm X + P.** Ngày lễ (01–02/09) để **TRỐNG** ⇒ không đếm.
- **ĐƠN ĐỔI CA** = Google Form ghi vào tab; Mr Phúc duyệt tay; **`Code.gs` bản 21/08 không đọc tab này** — S3 hôm nay hoàn toàn thủ công.
- **GHI CHÚ & GHI ĐÈ** theo ngày (nghỉ lễ ⇒ "Không gửi tin"; "Tin thay thế toàn bộ"); **VIỆC CỐ ĐỊNH** theo thứ của từng cơ sở; **LỚP HỌC** ghép vào ca GV theo tên trùng khớp.

### 1.2 Danh mục 21 mã ca (giờ kế hoạch tính từ Sheet; CS tính cả nghỉ giữa giờ)

| Mã | Tên | Sáng | Chiều | Nơi | Giờ KH | Dùng T09 |
|---|---|---|---|---|---|---|
| `S` | Ca sáng | 07:45–11:30 | — | cơ sở của đơn vị | 3h45 | 28 |
| `C` | Ca chiều | — | 13:45–17:30 | " | 3h45 | 20 |
| `T` | Ca tối | — | 17:15–21:00 | " | 3h45 | 32 |
| `SC` | Sáng+Chiều | 07:45–11:30 | 13:45–17:30 | " | 7h30 | 36 |
| `ST` | Sáng+Tối | 07:45–11:30 | 17:15–21:00 | " | 7h30 | 8 |
| `CT` | Chiều+Tối | — | **13:45–21:00 liền** | " | **7h15** | 32 |
| `SCT` | S+C+T | 07:45–11:30 | 13:45–21:00 | " | 11h00 | 0 |
| `CG` | Ca gãy | 09:00–11:30 | 14:00–17:45 | " | 6h15 | 40 |
| `CS` | Ca suốt | — | 14:00–21:00 (nghỉ 16:30–17:00 **tính công**) | " | 7h00 | 24 |
| `CCT` | Ca cuối tuần | 07:45–11:30 | 13:45–17:45 | " | 7h45 | 32 |
| `CGD` | Ca gãy dài | 09:00–11:30 | 13:30–19:15 | " | 8h15 | 20 (Ms Liên) |
| `HC` | Giờ hành chính | 08:00–11:30 | 13:30–17:30 | **theo phân công** | 7h30 | 92 (HO) |
| `12` / `21` | Sáng CS1·Chiều CS2 / ngược | 08:00–11:30 | 13:30–17:30 | CS1→CS2 / CS2→CS1 | 7h30 | 0 |
| `2C` | Cả 2 cơ sở | 08:00–11:30 | 13:30–17:30 | cả hai | 7h30 | 0 |
| `D1` / `D2` | Làm tại CS1 / CS2 | — | — | CS1 / CS2 | **không có giờ** | 12 / 12 (Mr Phúc) |
| `NG` | Công tác ngoài | 08:00–11:30 | 13:30–17:30 | ngoài | 7h30 | 0 |
| `LD` | Linh động | — | — | "không nhất thiết đến Trung tâm" | **không có giờ** | 8 (Ms Huệ T2+CN) |
| `X` / `P` | Nghỉ / Nghỉ phép | — | — | — | 0 | 80 / 0 |

Quy định kèm: **có mặt trước ca 10 phút** · **Thứ Hai toàn Trung tâm nghỉ** (trừ Ms Huệ `LD`) · trực Trial (+1%): Tối T3–T6 & Sáng T7, CN · báo nghỉ/đổi ca **trước ≥ 2 ngày**, tự tìm người thay, QL xác nhận; nộp < 2 ngày ⇒ "Nộp muộn".

> ⚠️ `CT` = 7h15, **không phải** 7h30 như `lib/work-schedule.test.ts:52-55` đang khoá (13:30–21:00). Test đó phải viết lại cùng lượt.
> ⚠️ Sheet tự ghi 2 điểm chưa ổn: "11:30–14:00 ngày thường không có nhân sự Kinh doanh trực"; "Ms Huệ Linh động cả T2 lẫn CN — chưa có 24h nghỉ liên tục theo Điều 111 BLLĐ". Module chỉ **cảnh báo**, không tự quyết.

### 1.3 Số đo đã có

| Gì | Số | Nguồn |
|---|---|---|
| Nhân sự trong Sheet | **19 người** (20 dòng) | KHUNG CA |
| Nhân sự trên prod | User 23 · Employee 15 | [ĐO PROD] |
| `EmployeeCheckin` / `ShiftRegistration` / `WorkRequest` / `TimesheetAdjustmentRequest` / `TimesheetEditLog` / `WorkShiftConfig` | **0 / 0 / 0 / 0 / 0 / 0** | [ĐO PROD] |
| `Holiday` | 0 | [ĐO PROD] — lễ 01–02/09, 24/11 **chưa vào hệ thống** |
| Center có toạ độ | **0/3** (`hoi-so` lat/lng NULL, CS1/CS2 NULL) | [ĐO PROD] + Q-02 |

**Còn phải đo hôm nay (dump đã 5 tuần):** M1/M2 (5 bảng cũ), M5 (bao nhiêu trong 19 người có `User.phone` hợp lệ để ghép Sheet ↔ User), và **đo toạ độ thực địa CS1/CS2** (không có toạ độ thì không bật được geofence ở bất kỳ lô nào).

### 1.4 Nguồn sự thật thứ hai — MISA AMIS (khảo sát 04/09/2026)

**Cái gì đang/đã chạy ở MISA:**

| Phân hệ | Trạng thái | Số liệu |
|---|---|---|
| **AMIS Chấm công** | Dùng thật tới **31/07/2026**, **0 lượt từ 01/08** | Tháng 7: 900 lượt · 32 người · app mobile 626 (69,6%) · **sửa tay ô công 245 (27,2%)** · chấm hộ 29 · 20 đơn "Đề nghị cập nhật công" · 97 lần đi muộn |
| **AMIS Tiền lương** | Còn dùng — nhưng bảng lương T7 chỉ có **6/32 người**, **không có bảng lương T8** | 134 thành phần lương, **44 loại "Chấm công"**; 5 bảng công đầu vào, **3/5 là "Tự thêm"** (nhập tay, bỏ qua module Chấm công) |
| Danh mục ca MISA | 4 ca | S 07:45–11:30 (3,75h, **0,5 công**) · C 13:30–17:00 (3,5h, 0,5) · T 17:30–21:00 (3,5h, 0,5) · HC 07:45–17:30 nghỉ 11:30–13:30 (7,75h, **1 công**) — **lệch Sheet** ở C/T/HC |
| Xác thực | Chỉ Wi-Fi BSSID, **3 cơ sở dùng chung 3 BSSID** (thực chất 1 router) | GPS **rỗng 100%**, máy chấm công 0, thiết bị 0 |
| Nghỉ tuần | **MISA không khai được Thứ Hai** (6 lựa chọn đều T7/CN) | Công chuẩn đang trừ Chủ nhật ⇒ 26/27 **sai bản chất**; lách bằng loại nghỉ giả "Thứ 2" 60 ngày/năm |
| Lưu trữ | Lượt chấm **chỉ 6 tháng**; nhật ký 1.782 dòng **không export được** | Dữ liệu tháng 7 mất ~31/01/2027 |

**Công thức lương (nguyên văn `Mẫu bảng lương`):**
```
HỆ SỐ CÔNG                        = TONG_CONG_DI_LAM_THUC_TE_THEO_NGAY / SO_CONG_CHUAN
LUONG_CO_BAN_THUC                 = LUONG_DONG_BH × TY_LE_HUONG_LUONG × HỆ SỐ CÔNG
LUONG_THEO_HIEU_QUA_CONG_VIEC_THUC = LUONG_KPI × TY_LE_HUONG_LUONG × HỆ SỐ CÔNG × DIEM_KPI
LUONG_GIANG_DAY                   = SO_BUOI × DON_GIA_BUOI          ← SO_BUOI GÕ TAY, không nhân hệ số
HOA_HONG                          = DOANH_SO × TY_LE_HOA_HONG       ← không nhân hệ số
TONG_CONG_HUONG_LUONG             = SO_CONG_CHUAN − SO_NGAY_NGHI_KHONG_LUONG   ← MISA suy "không có dữ liệu = nghỉ không lương"
```
⇒ Với giáo viên, phần thu nhập lớn nhất **độc lập với chấm công**. Đó là lý do chấm công sai 62% mà lương vẫn trả được — và là lý do **`soBuoiDay` sinh tự động** là mối nối đáng tiền nhất.

**MISA làm đúng, ta bắt chước (đã khớp thiết kế):** 3 lớp lượt thô → công ngày → kỳ công · phạm vi ở `user × role × org_unit` (= `UserOrgRole`) · nhật ký cũ→mới + IP (= `AuditLog`) · công chuẩn 3 tầng · panel "Lịch sử chấm công thực tế" + nhãn "Cập nhật công" + link "Xem đơn" trên ô ngày · cột `Số lần cập nhật công` làm KPI.
**MISA làm sai, ta không lặp:** "không có dữ liệu = nghỉ không lương" (T-01 đã chốt ngược) · sửa tay ô công không lý do · người duyệt tên cứng (một thực tập sinh cấu hình 4/7 quy trình và xoá 6 bảng công) · chấm hộ nhập giờ tự do · snapshot sang lương không khoá (2 bảng T7 **lệch mọi dòng**) · `_DEL` đổi mã khi nghỉ việc.

**Ba KR đo được từ MISA (đầu vào cho A6 của plan v2):** sửa tay 27,2% → **<5%** · ngày công có dữ liệu 38% → **>95%** · lượt chấm có toạ độ 0% → **100%**.

### 1.5 File xuất từ MISA (04/09/2026, `E:\hoá đơn\`, 13 file = 5 loại, các bản "(1)(2)(3)" trùng nội dung)

| File | Là gì | Dùng cho kế hoạch |
|---|---|---|
| `Dữ liệu chấm công.xlsx` | **900 lượt thô T7/2026** — 15 cột: mã NV, tên, vị trí, đơn vị, mã chấm công, múi giờ, ngày, giờ, **nguồn** (Mobile 626 / Chỉnh sửa bảng chấm công 245 / Chấm hộ 29), người chấm hộ, máy, thời gian đồng bộ, **GPS (trống 100%)**, ghi chú (trống 100%) | **Việc L0 "export trước khi MISA xoá" đã xong** cho lượt thô (nhật ký 1.782 dòng vẫn chưa). Đây là **fixture thật** cho test ghép cặp GC-01..08 và cho `LEGACY_MISA` nếu import T7 |
| `Bảng chấm công tổng hợp 01_07–31_07.xlsx` | Bảng công kỳ **41 cột vật lý / 3 tầng tiêu đề**, 26 người, Số công chuẩn **27 cho tất cả** (kể cả TGĐ, part-time, TTS); có `Đi muộn về sớm (số lần/số phút)`, `Số lần cập nhật công`, `Số ngày phép chưa sử dụng`, cột **`Xác nhận công`** — 26/26 "Chưa gửi xác nhận" | **Đích hình dạng cho sheet 1 của export** (Kế toán đã quen mắt); `summaryJson` phải sinh được đủ các cột này. Cột `Xác nhận công` = tính năng nhân viên tự xác nhận kỳ, MISA có mà không ai dùng — ta làm qua `AttendanceTicket` (đợt 2) |
| `Bảng phân ca tổng hợp T9.xlsx` | Lưới người × 30 ngày — **15 người, trống 100%** | Bằng chứng MISA **không có lịch tháng 9**; danh sách 15 người là headcount MISA hôm 04/09 (có 2 mã mới `CS2.NV.004` tái cấp, `SR.NV.009`) |
| `Mau_NK_bang_phan_ca_cho_nhan_vien / _cho_don_vi.xlsx` | Mẫu **nhập khẩu phân ca** của MISA: hàng = mã NV (hoặc mã đơn vị), cột = ngày, ô = `CA1; CA2` (nhiều ca cách `;`), địa điểm gắn `CA1[DV001]` hoặc `CA1[Công trình 1]` | **Xác nhận mô hình ca ghép = tập ca đơn** (Sheet `SC` ≡ MISA `S; C`) — đúng thiết kế `ShiftTemplate` → đoạn; và **địa điểm gắn theo từng ca trong ngày** — đúng `ShiftAssignment.placeMode`/`WorkLocation`. Nếu cần bơm lịch ngược vào MISA (K-03 chọn giữ MISA Chấm công) thì đây là định dạng, ~1 ngày công |
| `Mau_NK_du_lieu_cham_cong.xlsx` | Mẫu **nhập khẩu lượt chấm thô**: 5 cột `Mã NV · Họ tên · Ngày-giờ · Ngày · Giờ` | ~~Đường lùi cho K-03~~ — **K-03 chốt "thay luôn" ⇒ không dùng** |

~~**Chưa có trong thư mục:** mẫu nhập `AMIS Tiền lương → Dữ liệu tính lương → Chấm công`~~ — **không cần nữa** (K-03: MISA ra khỏi hệ thống; K-02: tháng 8 không tính lương ở đâu cả). Hai file `Bảng chấm công tổng hợp T7` và `Dữ liệu chấm công` chỉ còn là **hồ sơ lưu** + fixture test.

**Đo thêm từ file thô (05/09):** 380/992 người-ngày có dữ liệu (38%) · 245 dòng sửa tay gõ toàn **mốc giờ ca tròn** (17:30 ×45 · 17:00 ×21 · 08:00 ×20 · 21:00 ×19 · 11:30 ×17) ⇒ người sửa tay đang **làm thủ công đúng việc "đếm theo kế hoạch"** mà T-01 chốt — hệ thống làm thay thì 27,2% này về ~0 · sửa nhiều nhất: Kế toán tổng hợp `SR.NV.004` **45 lần cho chính mình** · bảng công T7: mọi người đều có **5 ngày không đi làm mà không bị tính nghỉ không lương** (`Tổng hưởng lương = 27 − Nghỉ không lương` và `Nghỉ không lương = 27 − đi làm − 5`) — nguồn 5 ngày này chưa rõ (**K-08**).

---

## PHẦN 2 — 16 CÂU ĐÃ CHỐT (03/09/2026) VÀ HỆ QUẢ THIẾT KẾ

| # | Chốt | Hệ quả |
|---|---|---|
| Q-01 | Thay thẳng | Đóng băng 5 bảng cũ (0 dòng prod); không backfill; không cờ |
| Q-02 | Chưa cơ sở nào khai toạ độ | `WorkLocation.latitude/longitude` **nullable**; `geofenceEnabled` mặc định **false**, bật từng cơ sở sau khi đo thực địa; lượt chấm khi chưa có toạ độ ⇒ cờ `CHUA_TOA_DO`, **không từ chối** |
| Q-03 | `Employee.centerId` | `resolveHomeCenter()`; module **không đọc `session.user.centerId`** (ảnh chụp JWT lúc login, không làm mới khi đổi đơn vị — `lib/auth.ts:209,234`) |
| Q-04 | HO chấm mọi cơ sở (CS3 sau này cũng được) | `placeMode = ANY_CENTER` cho dòng HO; không `WorkLocation` cho `hoi-so`; không cờ `SAI_NOI_LAM` cho HO |
| Q-05/06 | Giờ theo Sheet | Seed 21 mã từ DANH MỤC CA; gỡ `SHIFT_DEFS`/`LUNCH_BREAK`/enum `WorkShift` khỏi đường tính công |
| Q-07 | Ghi nhận + gắn cờ | `StaffTimeLog.result` ACCEPTED cho ngoài vùng/thiếu GPS (+`flags`); REJECTED chỉ lỗi kỹ thuật |
| Q-08 | Không hiểu SR.QD.231 | **Đã giải (S-22/S-23):** hệ số công = công thực tế ÷ công chuẩn, trong MISA Tiền lương; export = mẫu nhập `Dữ liệu tính lương → Chấm công` |
| Q-09 | Hệ số tính cả 2 (theo ca + hành chính) | `dayCreditEarned` (**1 công/ngày có mã**, K-01 theo Sheet) + `hourCredit` (giờ thật từ lượt chấm); hệ số công sinh ở kỳ = Σ`dayCreditEarned` ÷ `standardUnits` |
| Q-10 | QLCS + Kế toán chốt, theo từng cơ sở | `close-period` scope CENTER cho `CENTER_MANAGER` + `CENTER_ACCOUNTANT`; GLOBAL cho `HO_ACCOUNTANT`; kỳ HO = sổ `centerId="hoi-so"` |
| Q-11 | Chỉ QLCS + Giám đốc duyệt đơn | `approve` scope CENTER cho `CENTER_MANAGER`; SUPER_ADMIN bypass. ⚠️ "Giám đốc" là vai nào trên prod — câu treo T-06 |
| Q-12 | 5 vai cần checkin | Seed + bấm workflow |
| Q-13 | Duyệt đảo — đơn sinh hệ quả | `applyApprovedWorkRequest` mở rộng SHIFT_SWAP/LEAVE/TIMESHEET_FIX → ghi `ShiftAssignment`/`StaffAttendanceDay` **trong tx**; khoá lạc quan `updateMany(status=PENDING)`. ⚠️ Áp thất bại thì sao — câu treo T-05 |
| Q-14 | Có required check | Test lõi → Vitest `tests/cham-cong/**` + bước trong job `chat-db-tests`; chủ dự án thêm required check |
| Q-15 | CGD của vài người | `ShiftTemplate.scopeUserIds[]` — chỉ cảnh báo khi gán ngoài danh sách |
| Q-16 | Không ngừng lưu toạ độ; không luật sư | `StaffTimeLog` giữ `latitude/longitude` (+`accuracyMeters` — thứ đang bị `checkin-client.tsx:32-38` vứt). Xem §6 |

---

## PHẦN 3 — MÔ HÌNH DỮ LIỆU (đợt 1)

### 3.1 Tạo mới (9)

| Bảng | Vai trò | Cột then chốt | Ràng buộc |
|---|---|---|---|
| **`ShiftTemplate`** | tab DANH MỤC CA | `code` (chuỗi Sheet, không enum) · `name` · `kind` TIMED\|LOCATION_ONLY\|FLEXIBLE\|OFF\|LEAVE · **`segments Json`** `[{start,end,kind:WORK\|PAID_BREAK,place?}]` · `defaultPlace` HOME\|CENTER:\<code\>\|ANY_CENTER\|ASSIGNED\|OFFSITE\|ANYWHERE · `attendanceMode` REQUIRED\|OPTIONAL\|NONE · `dayCredit` (1; X/P = 0) · `isLeave` · `nominalMinutes?` (NG = 450; LD = null) · `payMode` SHIFT\|ADMIN_HOURS\|NONE · `scopeUserIds[]` · `effectiveFrom/To` · cột hiển thị `amStart/amEnd/pmStart/pmEnd/pmBreak*` cho màn danh mục · `centerId?`+`orgUnitId?` (NULL = dùng chung) | `@@unique([code, effectiveFrom])` · Zod: segment tăng dần, PAID_BREAK kẹp giữa 2 WORK, không qua đêm · SCOPED ∩ NULL_IS_GLOBAL (khuôn `PaymentMethod`) |
| **`ShiftWeeklyPattern`** | tab KHUNG CA CỐ ĐỊNH | `userId` · `centerId` NOT NULL (khối: CS1/CS2/`hoi-so`) · `weekday` (0=CN…6=T7, khớp `vnWeekday`) · `templateId/templateCode` · `placeOverride?` · `sheetName` ("Mr Phúc") · `section` KINH_DOANH\|GIAO_VIEN\|VAN_PHONG · `jobLabel` · `displayOrder` · `effectiveFrom/To` | `@@unique([userId, centerId, weekday, effectiveFrom])` — Mr Phúc = 2 bộ dòng · cảnh báo Điều 111 (7 ngày không X/P) = rule thuần |
| **`ShiftAssignment`** | một ô lưới tháng, **đã gộp D1/D2** | `userId` · `employeeId?` · `centerId` NOT NULL (**cơ sở LÀM/chịu công hôm đó**) · `orgUnitId` · `workDate @db.Date` (ghi bằng `vnDateOnly`) · `templateId/templateCode` · **`segments Json` bản resolve** (`place` → `orgUnitIds[]`) · `placeMode` AT_UNITS\|ANY_CENTER\|OFFSITE\|ANYWHERE · `allowedOrgUnitIds[]` · snapshot `attendanceMode/dayCredit/isLeave/nominalMinutes` · `sourceCells Json` ({CS1:'D2',CS2:'CG'} — export ngược đúng ô) · `source` PATTERN\|IMPORT\|MANUAL\|SWAP\|LEAVE\|HOLIDAY · `sourceRequestId?` · `status` ACTIVE\|CANCELLED | **Partial unique** `(userId, workDate) WHERE status='ACTIVE'` (tiền lệ `Enrollment`) — đổi ca = CANCELLED + dòng mới · SCOPED, không NULL_IS_GLOBAL · **own-rows đọc `db` trần** (khuôn `lib/lms/teacher-schedule.ts:91-102`) vì `centerId ≠ User.centerId` là bình thường |
| **`WorkLocation`** | điểm chấm | `code` · `centerId` NOT NULL (**chỉ cơ sở vận hành, không `hoi-so`**) · `orgUnitId` · `latitude/longitude` **nullable** · `radiusMeters` (100 → hạ 30 từng cơ sở) · `geofenceEnabled` default false · `ipAllowlist[]` (đợt 2) | Backfill 1 dòng/Center từ 3 cột đang có |
| **`StaffTimeLog`** | sổ quét (gộp từ chối) | `userId` · `centerId` NOT NULL (= nơi chấm; không có WorkLocation ⇒ assignment.centerId ⇒ home ⇒ `"hoi-so"`) · `workLocationId?` · `direction` (tái dùng enum `CheckinType`) · `loggedAt` · `workDate` (`vnDateOnly` lúc ghi) · `source` TICKET\|LEGACY_CHECKIN\|MANUAL_ADJUST\|KIOSK · **`result` ACCEPTED\|REJECTED** + `rejectReason` (TICKET_INVALID\|TICKET_EXPIRED\|TICKET_REUSED\|NO_WORKLOCATION\|OVER_DAILY_CAP) · **`flags[]`** NGOAI_VUNG\|THIEU_GPS\|CHUA_TOA_DO\|TRUNG_2_PHUT\|GPS_KEM_CHINH_XAC · `reviewStatus` PENDING\|CONFIRMED\|DISMISSED + reviewedBy/At/Note · `latitude/longitude/accuracyMeters/distanceMeters/withinGeofence?` · `ticketId/ip/userAgent` · `verifyMethod/verifyRefId/verifyScore` (chỗ cắm đợt 2) · `adjustRequestId?` | **Không unique nghiệp vụ** (nhiều lượt/ngày) · chống trùng 2' ở action + GC-08 · trần 10 lượt ⇒ vẫn ghi + cờ · mọi câu tính công lọc `result='ACCEPTED'` qua **một helper** có test |
| **`StaffAttendanceDay`** | **bảng quan trọng nhất** | `userId` · `centerId` NOT NULL · `workDate` · snapshot `assignmentId/templateCode/placeMode` · `dayType` WORK\|WEEKLY_OFF\|LEAVE\|HOLIDAY\|UNSCHEDULED · `expectedMinutes/workedMinutes/paidBreakMinutes/rawPairedMinutes` · **theo buổi** `amExpected/amWorked/pmExpected/pmWorked` · `lateMinutes/earlyLeaveMinutes/missedEarlyArrival` · **`dayCreditExpected/dayCreditEarned`** (công theo ca) · **`hourCredit`** (công theo giờ) · `leaveUnits` (P) · `holidayPaidUnits` (cột riêng) · `overrideUnits/By/Note` · `pairs Json` (GC-01…05) · `flags[]` (THIEU_LUOT_RA\|RA_KHONG_CO_VAO\|VUOT_TRAN\|CHUA_XEP_CA\|THIEU_CA\|DI_MUON\|VE_SOM\|THIEU_GIO\|**SAI_NOI_LAM**\|CHAM_NGOAI_LICH\|LAM_NGAY_LE…) · `status` COMPUTED\|ADJUSTED\|LOCKED · **`ruleSnapshot Json`** · `computedBy` ENGINE\|MANUAL\|LEGACY · `periodId?` | `@@unique([userId, workDate])` · ghi **chỉ** qua `recomputeAttendanceDay(userId, date, {tx})` — upsert (không `updateMany`: ghi kép không hook) · LOCKED ⇒ không đè, audit `SKIPPED_LOCKED` · tính lại qua **DomainEvent** `hr.attendance_day_dirty` (dedupeKey `attday:<userId>:<ymd>`), **không xin khe cron** |
| **`AttendancePeriod`** | kỳ công / chốt sổ | `centerId` NOT NULL (CS1\|CS2\|`"hoi-so"`) · `periodKey` "YYYY-MM" · `status` OPEN\|CLOSING\|LOCKED\|REOPENED (chép `CommissionStatement`) · locked/reopened By/At/Reason · **`summaryJson`** (nguồn export duy nhất sau khoá) · `exportCount/lastExportedAt` | `@@unique([centerId, periodKey])` · LOCK trong tx: recompute kỳ → set ngày LOCKED → dựng summary → audit → event · **mọi Server Action ghi phải kiểm LOCKED trước** |
| ↳ **`summaryJson` — mỗi người, đầu vào cho module lương sau này** | | `employeeCode` · `standardUnits` (**sinh** từ `shift.weeklyOffDays` + `Holiday`; Kế toán sửa được trên kỳ trước khoá — K-04) · `workedUnits` (= Σ`dayCreditEarned` = `TONG_CONG_DI_LAM_THUC_TE`) · `workedUnitsByCode` {S,C,T,HC,…} (= `Công ca S/C/T`) · `paidUnits` (= `TONG_CONG_HUONG_LUONG`) · `leaveUnits` (P) · `holidayPaidUnits` (T-04) · `unpaidLeaveWithRequest` **tách khỏi** `missingDataDays` (MISA gộp — lỗi gốc) · `transferUnits` (`Công điều động`, từ `placeMode`/`allowedOrgUnitIds ≠ home`) · `lateCount/lateMinutes` · `adjustmentCount` (= `Số lần cập nhật công`, KR1) · **`teachingSessions`** (K-05: COMPLETED, GV thực dạy, không Trial, không huỷ) · `workCoefficient` = `workedUnits ÷ standardUnits` | Export v1 = **Bảng công tổng hợp Excel của hệ thống** (K-03: không còn MISA) — sheet 1 các cột trên (giữ thứ tự bảng 41 cột Kế toán đã quen), sheet 2 = lưới ô mã ca. Không có `DON_GIA_BUOI`/tiền — đó là module lương |
| **`AttendanceTicket`** | vé 120s | `userId` · `deviceId?` · `workLocationId` · `nonceHash` (HMAC `getSigningSecret()`) · `expiresAt` · `consumedAt` · `ip` | Tiêu nguyên tử `UPDATE … WHERE consumedAt IS NULL AND expiresAt>now()` · **ngoại lệ có chủ đích: không cột đơn vị** (ghi lý do trên model) · fail-CLOSED |
| **`ShiftBriefNote`** | VIỆC CỐ ĐỊNH (theo thứ) + GHI CHÚ & GHI ĐÈ (theo ngày) | `centerId`/`orgUnitId` · `weekday?` xor `date?` · `audience` ALL\|KINH_DOANH\|GIAO_VIEN · `mode` APPEND\|SUPPRESS\|REPLACE · `text` | Chỉ phục vụ tin 19:00 + màn lịch; **không tham gia tính công**; không nhét vào `Holiday` (mọi reader Holiday dời buổi học — `lib/holidays/apply.ts:93-121`) |

### 3.2 Mở rộng (2)

| Bảng | Thêm |
|---|---|
| **`WorkRequest`** (thay `LeaveRequest` + `AttendanceAdjustment`) | `assignmentId?` (thay `targetShiftId` — hiện trỏ `ShiftRegistration.id` và **không ai đọc**) · **`requesterNewTemplateId?`** ("Mã ca mới") · **`targetNewTemplateId?`** ("Mã ca của người nhận thay") · `submittedLate` (snapshot lúc nộp, tính bằng `vnYmd`) · `appliedAt?/applyError?` · `LEAVE` nhận `targetUserId` ("Nghỉ phép có người thay") · `SHIFT_SWAP` **bắt buộc `fromDate`** (hiện null — form không có ô ngày) · `centerId` = cơ sở của **ngày áp dụng**, không phải session · `TIMESHEET_FIX` mang `requestedInAt/requestedOutAt` có cấu trúc |
| **`Holiday`** | `attendanceEffect?` PAID_LEAVE\|UNPAID_OFF\|INFO_ONLY · **`coefficient Decimal(4,2) @default(1.00)`** (T-04 — Kế toán tự set) · `briefMode?` · `briefText?` — cột nullable/additive; **không** đổi nghĩa dòng đang có. ⚠️ Đường ghi `holidays/_actions.ts:88-95` gác cứng `hasAnyRole(SUPER_ADMIN, CENTER_MANAGER)` — Kế toán bị redirect trước validator ⇒ viết lại thành `resolveActor + assertCan`, và lễ toàn hệ thống (`centerId=null`) chỉ `HO_ACCOUNTANT` (scope ALL) sửa được |
| **`Employee`** | **`timesheetExempt Boolean @default(false)`** (T-02) — cờ theo NGƯỜI, chỉ SUPER_ADMIN set (khuôn SEC-M15 `nhan-su/actions.ts:209-230`), audit + reason; **không** tái dùng `isCEO` (cờ vinh danh công khai). Engine: EXEMPT ⇒ không sinh `StaffAttendanceDay`, không vào summary kỳ; log chấm tự nguyện vẫn ghi `ACCEPTED`; cổng đối soát L6 phải loại trừ tường minh vì Sheet đang đếm anh 12/tuần · ~~`standardUnitsOverride`~~ **bỏ** (K-04: công chuẩn chung cho mọi người) · `employmentType` hiện có `ContractType` — đối chiếu 5 nhóm MISA (Chính thức · Thử việc · Thực tập · Part-time · CTV) khi làm quỹ phép đợt 2 |
| **`ShiftTemplate.dayCredit` — chốt K-01 theo Sheet** | **Mọi mã làm việc = 1** (`S`, `C`, `T`, `SC`, `ST`, `CT`, `SCT`, `HC`, `CG`, `CS`, `CCT`, `CGD`, `12`, `21`, `2C`, `NG`, `LD`) · `D1`/`D2` gộp vào ô đích · `X`/`P` = **0**. Cột vẫn tồn tại và **sửa được trên màn danh mục ca** (PHẦN 6b) — đổi chính sách sau này không cần dev |
| **`LeaveType`** *(danh mục, đợt 1)* | K-06 theo MISA: `code` · `name` · `paidRatio` (Nghỉ phép 1 · Không lương 0 · Kết hôn 1 · Con kết hôn 1 · Ma chay 1 · BHXH 0 · Thai sản 0 · Nghỉ bù 1) · `maxDaysPerYear?` (Không lương 10 · Kết hôn 7 · Con kết hôn 3 · Ma chay 3 · Thai sản 180) · `countsAsWorked` · `active`. `WorkRequest.leaveTypeId` trỏ vào. **Màn CRUD** cho `hr_attendance:config`; seed 8 dòng 1 lần |
| **`LeaveBalance`** *(đợt 2)* | Quỹ phép theo MISA (K-06): +1 ngày/tháng từ tháng vào làm, 12/năm chính thức, chỉ dùng khi chính thức, **không chuyển năm**, có ứng phép. Tham số (`shift.leaveAccrualPerMonth`, `shift.leaveDaysPerYear`) là setting. Đợt 1 chỉ đếm `leaveUnits`, xuất `Số ngày phép chưa sử dụng` = trống |

### 3.3 Đóng băng rồi drop ở Pha B (5) — **0 dòng prod**

`EmployeeCheckin` · `ShiftRegistration` · `TimesheetAdjustmentRequest` · `TimesheetEditLog` · `WorkShiftConfig`.
Đóng băng = **xoá đủ 10 điểm ghi** (Server Action là endpoint POST công khai — gỡ menu không đủ): `cham-cong/actions.ts:96` · `chinh-cong/_actions.ts:42,93,95,186` · `lich-ca/_actions.ts:78,91,96` · `duyet-ca/_actions.ts:119,123` · `lib/attendance/shift-config.ts:59,71,82` — + cổng ESLint theo khuôn `db-import-allowlist`. Giữ model trong schema/db-scope/center-bridge tới Pha B.

### 3.4 Bỏ khỏi plan v2

`AttendanceRejection` (gộp) · `StaffFaceProfile` (đợt 2; chưa được viết "Face ID" vào kế hoạch cho tới khi Doc 15 §0 sửa bằng văn bản) · `LeaveRequest` · `AttendanceAdjustment` · cột `homeCenterId` · `StaffDevice` (đợt 2).

### 3.5 Checklist bắt buộc — 4 nơi, cùng PR với migration

| Bảng | `SCOPED_MODELS` | `NULL_IS_GLOBAL` | `getModelPrefixes` (**full key**) | `BACKFILL_SPECS` |
|---|---|---|---|---|
| `ShiftTemplate` | ✓ | ✓ (mã dùng chung) | `["hr_attendance:config","hr_attendance:assign","hr_attendance:view"]` | NULL_TOAN_HE_THONG |
| `WorkLocation` | ✓ | ✗ | `["hr_attendance:config","hr_attendance:view","centers:"]` | BAT_BUOC |
| `ShiftWeeklyPattern` `ShiftAssignment` `StaffTimeLog` `StaffAttendanceDay` `AttendancePeriod` `ShiftBriefNote` | ✓ | **✗ tuyệt đối** | `["hr_attendance:view","hr_attendance:assign","hr_attendance:approve","hr_attendance:close-period","hr_attendance:export"]` — **không có `checkin`** | BAT_BUOC (`"hoi-so"` bắc cầu qua code, `drift-report.ts:88-96` đã có nhánh) |
| `AttendanceTicket` | — | — | — | — (ngoại lệ) |
| `WorkRequest` | **giữ SCOPE_EXEMPT** + own-scope | — | — | — |

> `WorkRequest` **giữ** SCOPE_EXEMPT: lý do ở `lib/db-scope.ts:145-148` vẫn đúng — GV/nhân sự đọc đơn **của mình** qua sdb sẽ mất đơn nếu `centerId` ngoài `visibleCenterIds` (`hoi-so` không bao giờ vào subtree). Cách ly khi **duyệt** làm bằng `can(approve, {centerId})`.

---

## PHẦN 4 — THUẬT TOÁN CÔNG (đợt 1)

1. **Sinh lịch:** `generateMonthAssignments(centerId, periodKey)` từ `ShiftWeeklyPattern` (không đè assignment `source ∈ {SWAP, LEAVE, MANUAL, IMPORT}`); ô lễ (`Holiday`/`ShiftBriefNote SUPPRESS`) ⇒ `dayType=HOLIDAY`. **Với GV:** buổi + nơi làm **resolve thêm từ `ClassSession`/`TrialClassSession` của ngày** (teacherId ∪ substituteTeacherId ∪ actualTeacherId) — cập nhật khi buổi dời/huỷ-bù/duyệt `SUB_TEACH`; chiều ngược (ca không phủ buổi dạy) = cảnh báo `teachingUncovered` như hiện có.
2. **Ghi lượt** (`recordTimeLog`, thay `recordCheckin`): vé → WorkLocation → `workDate = vnDateOnly(now)` → so `allowedOrgUnitIds`/`placeMode` → **ghi luôn**, gắn `flags`; rate-limit theo `userId` (không theo IP — cả cơ sở chung NAT); sau ghi `publishEvent('hr.attendance_day_dirty')`.
3. **Ghép cặp:** đúng **GC-01→GC-08** của BA §6.3-bis (đã viết sẵn) — chống trùng 2' trước, duyệt tuần tự, `THIẾU LƯỢT RA` không tính giờ cho cặp đó.
4. **Giờ công:** giao(cặp, segment WORK ∪ PAID_BREAK). `CG` lỗ trưa **không** tính; `CS` 16:30–17:00 **tính**; `CT` 13:45–21:00 = 7h15. Cửa sổ nhận diện buổi ±60′ (vào `ruleSnapshot`).
5. **Muộn/sớm:** `DI_MUON` khi vào > `segmentStart + 30′` (`shift.toleranceMinutes` = **30**, T-12); `DEN_SAT_GIO` (chỉ nhắc) khi vào > `segmentStart − 10′` (`shift.earlyArrivalMinutes`, key mới).
6. **Công theo ca — ĐẾM THEO KẾ HOẠCH (T-01):** `dayCreditEarned` **mặc định = `dayCreditExpected`** (1 cho mọi mã trừ X/P — đúng "Tổng công = số ô có mã trừ X và P"). Engine **không tự trừ**; thiếu lượt/thiếu buổi/muộn chỉ sinh cờ (`KHONG_CO_LUOT`, `THIEU_BUOI_SANG/CHIEU`, `THIEU_LUOT_RA`, `DI_MUON`…) vào **hộp cờ của QLCS**. QLCS rà và ghi `overrideUnits` (+ lý do, audit) khi cần trừ; Kế toán khoá kỳ = kiểm cuối. `HC` = 1 công/ô; `LD`/`NG` (OPTIONAL) = 1 công không cần lượt, `LD` **0 giờ** (T-03); `X`/`P` = 0, P cộng `leaveUnits`. **Người `timesheetExempt` (T-02): early-return, không sinh dòng.**
7. **Công theo giờ** (`hourCredit`) = `workedMinutes/60` — chỉ để đối chiếu và cho HO nếu Kế toán muốn.
8. **Lễ (T-04):** ngày `dayType=HOLIDAY` mà người đó lẽ ra có ca ⇒ `holidayPaidUnits = dayCreditExpected × Holiday.coefficient` — **cột riêng**, không cộng vào `dayCreditEarned`; Kế toán set `coefficient` từng ngày lễ.
9. **Khoá:** ngày thuộc `AttendancePeriod LOCKED` ⇒ engine bỏ qua + audit; sửa sau khoá chỉ qua `TIMESHEET_FIX` được duyệt ⇒ `overrideUnits` + REOPEN (SUPER_ADMIN, reason).
10. **Không sinh cờ `SAI_NOI_LAM`** cho `placeMode ∈ {ANY_CENTER, OFFSITE, ANYWHERE}` (HO, LD, NG, 2C).

**Test viết trước (Vitest, thuần):** 21 mã × ví dụ vào/ra · **15 con số lưới T09/2026** (CG 40 · CCT 32 · SC 36 · T 32 · CT 32 · S 28 · CS 24 · C 20 · CGD 20 · D1 12 · D2 12 · ST 8 · HC 92 · LD 8 · X 80) sau khi import phải khớp · 7 ví dụ §6.3-bis dịch sang giờ Sheet · ép `TZ=UTC` lẫn `+07` (khuôn `lop-trial/_lib/filters.test.ts:116`) · round-trip import→export so từng ô.

---

## PHẦN 5 — QUYỀN

| Key | Vai (v2) · scope | Ghi chú |
|---|---|---|
| `hr_attendance:checkin` | mọi vai nhân sự · GLOBAL | **thêm 5 vai** (Q-12) |
| `hr_attendance:view` | CENTER_MANAGER, CENTER_ACCOUNTANT, CENTER_HR · CENTER; HO_HR, HO_ACCOUNTANT · GLOBAL | đổi từ GLOBAL |
| `hr_attendance:assign` **mới** | CENTER_MANAGER · CENTER; HO_HR · GLOBAL | khung ca, lưới, import — tách khỏi `view` |
| `hr_attendance:approve` **mới** | CENTER_MANAGER · CENTER (Q-11, T-06: QLCS duyệt thay Dev) | SUPER_ADMIN bypass — ⚠️ chỉ khi Kiệt + Phúc có **`UserOrgRole` SUPER_ADMIN neo tại HO** (`actor.ts:251-253`), không phải chỉ `User.roles`. Thay `hasRole` inline ở `teacher/don-tu/_actions.ts:114-117` + `admin/don-tu/page.tsx:37-39,51` ⇒ **xoá entry** `inline-authz-allowlist.mjs:65`. **Không seed GLOBAL** (QLCS CS1 sẽ duyệt được đơn CS2) |
| `hr_attendance:adjust` | CENTER_MANAGER · **CENTER** (hạ từ GLOBAL, `seed-roles.ts:545`) | kẻo `approve` chặn được mà `TIMESHEET_FIX` vẫn chéo cơ sở |
| `hr_attendance:close-period` **mới** | CENTER_MANAGER, CENTER_ACCOUNTANT · CENTER; HO_ACCOUNTANT · GLOBAL (Q-10) | |
| `hr_attendance:export` **mới** | như close-period | khuôn `leads:export` |
| `hr_attendance:config` **mới** | SUPER_ADMIN, HO_HR, **HO_ACCOUNTANT** · GLOBAL; CENTER_MANAGER, **CENTER_ACCOUNTANT** · CENTER | T-04 đòi Kế toán set hệ số lễ — Kế toán **không có** `holidays:edit` ở cả v1 (`permissions.ts:636`) lẫn v2 |
| `hr_attendance:device-reset` | đợt 2 | |

**Cơ sở nhận đơn (`WorkRequest.centerId`) — luật mới (T-06):** = cơ sở suy từ **nơi làm đã resolve** của ngày áp dụng (`segment.place`/`allowedOrgUnitIds` → CENTER); với GV = `class.centerId` của `ClassSession` ngày đó; không suy ra được **một** CENTER ⇒ **bắt buộc chọn tay**; validator **cấm** `"hoi-so"`/`null`. Kỳ công HO (`AttendancePeriod "hoi-so"`) do `HO_ACCOUNTANT` (GLOBAL) hoặc SUPER_ADMIN chốt.

Mỗi key khai **đồng thời 4 nơi**: union `Action` + ma trận v1 · `lib/permissions/registry/hr.ts` · `prisma/seed-roles.ts` — thiếu ở `ALL_ACTIONS` ⇒ `buildActor` vứt im lặng. `rbac-parity.test.ts` + `rbac-scope.test.ts` R1 sẽ đỏ nếu nửa vời. Seed vai **bấm tay** trên prod.

⚠️ `can()` CENTER với `target.centerId = null` trả **false** (`can.ts:26`) ⇒ mọi target hàng HO phải truyền `"hoi-so"`, không `null`. ⚠️ Cấp `approve` cho vai thứ ba mà quên sửa `lib/pending-tasks.ts:111-118` (`hasRole` + JWT) là rò toàn hệ thống.

---

## PHẦN 6 — Q-16: GHI NHẬN QUYẾT ĐỊNH

Chủ dự án chốt (03/09/2026): **(i)** không ngừng lưu toạ độ thô; **(ii)** không thuê luật sư — với lý do *"công ty đã ký hợp đồng lao động được sử dụng hình ảnh của nhân viên"*. Kế hoạch thực hiện đúng (i) và (ii): `StaffTimeLog` giữ `latitude/longitude/accuracyMeters` như `EmployeeCheckin` hôm nay; CH-07 của BA đóng theo quyết định này.

Kế hoạch **không đánh giá** căn cứ trên là đủ hay không cho loại dữ liệu nào — ghi nhận hai điểm để chủ dự án nắm: BA §7.1 (PL-01, nguồn thứ cấp, chưa đối chiếu Công báo) xếp **toạ độ** vào dữ liệu nhạy cảm theo NĐ 356/2025 và điều khoản hình ảnh theo mặt chữ không nói về định vị; **ảnh selfie đợt 2** vẫn ngoài phạm vi cho tới khi Doc 15 §0 sửa bằng văn bản (CH-11).

---

## PHẦN 6b — NGUYÊN TẮC TỰ VẬN HÀNH (chủ dự án đặt 05/09/2026)

> *"Hệ thống tự vận hành được mà không cần qua dev chỉnh tay; cho chỉnh linh hoạt theo phân quyền của từng user, tương tự MISA."*

**Luật:** mọi thứ MISA cho người dùng tự sửa trên màn hình thì hệ thống ta cũng phải cho, **có quyền + audit + lý do**, và **không có tham số nào của module sống trong code hoặc env**. Dev chỉ còn: migration, seed nền 1 lần, và sửa lỗi. Bảng kiểm dưới đây là **cổng ra của từng lô** — lô nào còn "chạy tay" là chưa xong.

| Việc MISA cho tự làm | Ở hệ thống ta | Ai được (qua vai) | Lô |
|---|---|---|---|
| Danh mục ca (giờ, số công, hệ số) | **Màn CRUD `ShiftTemplate`**: giờ từng đoạn, `dayCredit`, `nominalMinutes`, `payMode`, `defaultPlace`, `attendanceMode`, `scopeUserIds`, hiệu lực từ/đến; dùng chung hay riêng cơ sở | `hr_attendance:config` — SUPER_ADMIN, HO_HR, HO_ACCOUNTANT (GLOBAL); CENTER_MANAGER, CENTER_ACCOUNTANT (CENTER, chỉ mã riêng cơ sở) | L3 |
| Phân ca (lưới tháng, import Excel, phân theo đơn vị) | Lưới tháng có ô sửa + **import Excel có diff** + khung ca tuần (`ShiftWeeklyPattern`) sinh lưới | `hr_attendance:assign` — CENTER_MANAGER (CENTER), HO_HR (GLOBAL) | **L1** (import), L3 (lưới) |
| Địa điểm chấm công (toạ độ, bán kính, Wi-Fi) | **Màn `WorkLocation`**: toạ độ (dán từ Google Maps), `radiusMeters`, `geofenceEnabled` bật/tắt từng cơ sở | `hr_attendance:config` | L4 |
| Quy tắc chấm công (dung sai, cửa sổ sửa, giới hạn) | Nhóm setting **`shift.*`** ở `/admin/cau-hinh-van-hanh` (`lib/settings/registry.ts`, `centerOverridable: true`): đã có `toleranceMinutes` (→ **30**), `geofenceRadiusMeters`, `managerEditWindowDays`; **thêm** `weeklyOffDays` (T2), `lateGraceMinutes`, `earlyCheckinMinutes`, `maxLogsPerDay`, `briefNoteHourVN` (19:00), `pairingMaxGapMinutes`, `leaveAccrualPerMonth`, `leaveDaysPerYear` | Quản trị hệ thống (GLOBAL) · QLCS đè theo cơ sở (đã có `MANAGER_ROLE_CODES` gate trong `service.ts:141`) | L1 (khai), dùng dần |
| Ngày lễ + hệ số | Màn `Holiday` 4 cột (+ `coefficient`, `attendanceEffect`) | `hr_attendance:config` (Kế toán được — T-04) | L3 |
| Loại nghỉ + tỷ lệ lương + trần ngày/năm | **Màn CRUD `LeaveType`** | `hr_attendance:config` | L5 |
| Công chuẩn kỳ | Sinh tự động, **Kế toán/QLCS sửa trên kỳ** trước khoá (lý do bắt buộc) | `hr_attendance:close-period` | L5 |
| Người duyệt đơn | **Không tên cứng**: ai giữ vai có `hr_attendance:approve` tại cơ sở nhận đơn thì duyệt; đổi người = đổi vai trên màn nhân sự | `employees:edit` + màn vai (`/admin/users/[id]/edit`, `nhan-su`) | có sẵn |
| Miễn chấm công (Mr Phúc) | Toggle `Employee.timesheetExempt` trên form nhân sự | SUPER_ADMIN | L1 |
| Sửa bảng công | **Không sửa ô trực tiếp**; mọi sửa đi qua `TIMESHEET_FIX` có lý do danh mục + duyệt; QLCS có hộp cờ + `overrideUnits` kèm lý do | `hr_attendance:adjust` | L5 |
| Xem/xuất bảng công | Màn kỳ công + nút xuất Excel; nhân viên xem bảng công của mình trên site GV/admin | `hr_attendance:view` (CENTER/OWN), `:export` | L5 |
| Cấp/gỡ quyền module | Qua **vai** (`RoleDef` + `UserOrgRole`), màn nhân sự hiện có; **không** cấp `UserPermissionGrant` lẻ (DENY không chạy — CLAUDE.md) | SUPER_ADMIN | có sẵn (cần seed vai 1 lần) |

**Ba việc vẫn phải qua dev (nói rõ để không ai chờ nhầm):** (1) thêm **mã ca kiểu mới** cần logic engine khác (vd ca qua đêm) — cấu trúc `segments` chưa hỗ trợ; (2) thêm **cơ sở mới** = thêm OrgUnit + Center + WorkLocation trên UI, **không** cần dev (đúng luật "mở CS mới = thêm data"); (3) đổi **công thức hệ số/lương** — thuộc module lương đợt sau, thiết kế thành công thức cấu hình được ngay từ đầu.

## PHẦN 7 — LỘ TRÌNH

### 7.1 Phạm vi đợt 1 — không đổi

**Giữ:** `StaffAttendanceDay` + `ruleSnapshot` (lô đầu) · `ShiftTemplate`/`ShiftWeeklyPattern`/`ShiftAssignment`/`WorkLocation` · nhiều lượt/ngày · vé 120s + đóng QR cố định · `AttendancePeriod` + export · `WorkRequest` sinh hệ quả · **tin 19:00 in-app** (`notifyStaff`).
**Cắt sang đợt 2:** selfie + bucket R2 · `StaffDevice` · kiosk · ZNS · realtime.

### 7.2 Lô

| Lô | Việc | Cổng ra |
|---|---|---|
| **L0** (3 ngày) | 3 vá gấp (§0) · đo lại M1/M2/M5 · **đo toạ độ thực địa CS1/CS2** · nhập lễ **24/11** trên prod (U-01) · nhận SĐT 19 người (U-03) | GV thuần chấm được; có toạ độ |
| **L1** (2,5 tuần) | 9 bảng mới + `LeaveType` + `WorkRequest`/`Holiday` mở rộng (thuần additive) · đóng băng 5 bảng cũ (10 điểm ghi + ESLint) · 6 key × 4 khai + seed 5 vai · seed nền **1 lần** (21 mã ca, 8 loại nghỉ, 2 `WorkLocation`) · **8 setting `shift.*` mới** vào registry (PHẦN 6b) · **màn import Excel khung ca + lưới tháng có diff** (kéo từ L3 lên — thay cho "script chạy tay") · `resolveHomeCenter()` · sửa 7 vitest đang khoá mô hình cũ | `migrate deploy` xanh · `[US-07-IT-08b]` xanh · **QLCS tự import Sheet T09 qua UI**, 15 con số khớp · seed vai đã bấm |
| **L2** (1,5 tuần) | Engine `StaffAttendanceDay` (segment, ghép cặp, theo buổi, 2 loại công, `ruleSnapshot`) · DomainEvent recompute · helper `acceptedLogsOfDay` · **test trước** (§4) | Test engine xanh trong job required |
| **L3** (2,5 tuần) | Màn danh mục ca · khung ca · **lưới tháng có ô sửa** · import Excel **có diff, không đè-toàn-tháng** (thay `duyet-ca`) · `ShiftBriefNote` + `Holiday` 4 cột (kể cả `coefficient`, gate cho Kế toán) · **cron tin 19:00** in-app (`0 12 * * *` UTC + `cron-pump-test.yml:41`) · thông báo `shift.changed:` khi ca đổi (T-07) | 2 tuần lịch song song Sheet ↔ hệ thống khớp 100% · tin in-app khớp tin Zalo 19:00 |
| **L4** (2 tuần) | `WorkLocation` + vé 120s + `recordTimeLog` + **màn chấm công trên site GV** · đóng `/cham-cong/checkin`, `/man-hinh`, `api/qr-token`, `lib/attendance/qr.ts` **cùng lúc** · bật `geofenceEnabled` **từng cơ sở, mỗi tuần một** | 7 ví dụ §6.3-bis trên Android + iPhone · người làm S+C/C+T chấm đủ |
| **L5** (2 tuần) | `WorkRequest`: form dùng chung (`components/` + `lib/`, tiền lệ `lead-intake`) để **tư vấn/HO gửi được** (hôm nay chỉ site GV có form) · luật "cơ sở nhận đơn" · approve + apply **trong một tx** (thêm `tx` cho `cancelSession`/`adjustSession`, `throw` khi `ok:false`, khoá lạc quan) · `TIMESHEET_FIX` bê nguyên UI MISA "Đề nghị cập nhật công": 4 ô giờ có cấu trúc + panel **"Lịch sử chấm công thực tế"** + lý do **danh mục** (Lỗi hệ thống / Chưa phân ca / Quên chấm / Chấm trùng / Khác) + chặn trùng (người+ngày+ca) · `AttendancePeriod` + `standardUnits` (Kế toán sửa được trước khoá) + `teachingSessions` + **export v1 = Bảng công tổng hợp Excel** (sheet 1 cột Kế toán quen, sheet 2 lưới ô mã ca) · màn **Số dư/loại nghỉ** CRUD | Chốt 1 kỳ thật; Kế toán **tính lương tháng 12 từ file này không chép tay** |
| **L6** (1 kỳ) | Song song Sheet ↔ hệ thống + đối soát tự động (khuôn `drift-report`) · không import lịch sử (K-07) | 0 lệch 10 ngày làm việc liên tiếp |
| **Đợt sau — Tiền lương** (ngoài 9–11 tuần) | K-03 "thay luôn": lương cơ bản × hệ số công · KPI · **lương giảng dạy = `teachingSessions` × đơn giá gõ tay** · hoa hồng (module có sẵn) · phụ cấp/khấu trừ · bảng lương + phiếu lương. Đầu vào duy nhất = `AttendancePeriod.summaryJson` đã LOCKED. **Lập kế hoạch riêng** sau khi chốt kỳ 12 | — |

**Ước lượng:** L1–L5 ≈ **9–11 tuần** (1 dev, tuần tự). **Mốc:** bắt đầu giữa tháng 9 → L5 xong ~cuối tháng 11 → **S2/S3/S4 cutover 01/12/2026** → chạy song song kỳ 12 → **S1 (lương) 01/01/2027**. Cutover đúng ngày 01.

---

## PHẦN 8 — 12 CÂU TREO ĐÃ CHỐT (03/09/2026, chiều) VÀ HỆ QUẢ

| # | Chốt | Hệ quả |
|---|---|---|
| T-01 | Lưu log; **đếm theo kế hoạch**; QLCS rà soát, Kế toán kiểm cuối | §4 mục 6 — engine không tự trừ; hộp cờ QLCS; `overrideUnits` |
| T-02 | Mr Phúc là Giám đốc, **bỏ qua** chấm công | `Employee.timesheetExempt` (§3.2); vẫn có khung ca 2 khối ⇒ vẫn vào tin 19:00 |
| T-03 | `HC` = 1 công như Sheet; `LD` Ms Huệ CN+T2 = 1 công, 0 giờ | §4 mục 6 |
| T-04 | Lễ **cột riêng**, có **hệ số Kế toán tự set** | `Holiday.coefficient` + `holidayPaidUnits`; cấp `hr_attendance:config` cho Kế toán; viết lại gate `holidays/_actions.ts:88-95` |
| T-05 | Áp thất bại ⇒ **rollback cả quyết định duyệt** | Thêm `tx` cho `cancelSession`/`adjustSession`; chủ động `throw` khi `ok:false`; phân biệt "không cần áp" với lỗi; `applyError` ghi **sau** rollback |
| T-06 | SUPER_ADMIN = Kiệt + Phúc; **QLCS duyệt đơn** thay Dev | `approve` CENTER; luật "cơ sở nhận đơn" (§5); **kiểm trên prod** Kiệt + Phúc có `UserOrgRole` SUPER_ADMIN neo HO chưa |
| T-07 | Sheet không xử lý; hệ thống: duyệt ⇒ đổi lịch ⇒ **thông báo mới** | `notifyStaff` sau commit cho requester + `targetUserId`, prefix mới `shift.changed:` khai vào `catalog.ts` BY_PREFIX + `catalog.test.ts:15`; tin 19:00 chỉ gửi ngày mai. Bỏ việc "export ngược ra Sheet" khỏi L3 |
| T-08 | Chưa có file MISA | **Đã có đích (S-23):** export v1 = mẫu import `AMIS Tiền lương → Dữ liệu tính lương → Chấm công` (44 thành phần, dùng ~15) + sheet 2 lưới ô mã ca. Kế toán chỉ cần **tải mẫu import** ở L0 |
| T-09 | "Đã nhập 1/9, 2/9 mà 0 dòng?" | 6 dòng `Holiday` trên **DB dev/test** là **seed UAT** (`prisma/seed-uat/01-nen.ts:67-70`, ngày tính tương đối), không phải nhập tay; đường ghi lễ dùng `Date.UTC` — không lệch. Lễ 1/9–2/9 anh nhập **không có ở dev/test**; nếu nhập trên prod sau 01/08 thì dump cũ không thấy — **xác nhận lại trên SQL Editor prod**; nếu chưa có thì nhập ở prod (L1) |
| T-10 | Có full SĐT, cập nhật sau | Đầu vào L1 (ghép Sheet ↔ User) |
| T-11 | "Không hiểu" | Không phải vấn đề — xem giải thích §8.1 |
| T-12 | Dung sai đi muộn **30 phút** | `shift.toleranceMinutes` = 30; "trước ca 10′" chỉ nhắc |

### 8.1 T-11 nói cho rõ

**Cron** = việc chạy tự động theo giờ, khai trong `vercel.json` (đang có **26** dòng: gửi email queue, nhắc học phí, đồng bộ lịch lớp…). Tin lịch 19:00 in-app cần **thêm 1 dòng** (`0 12 * * *` = 19:00 giờ VN). Gói Vercel Pro cho **40** dòng — 26 dòng hiện có đã chạy được nên chắc chắn là Pro ⇒ **thêm 1 dòng không vướng gì**. Tôi hỏi thừa.

### 8.2 Còn treo thật sự (sau chiều 03/09)

| # | Câu | Chặn |
|---|---|---|
| ~~U-01~~ | **Chốt 05/09:** 1/9–2/9 **đã có** trên prod; **24/11 chưa** → nhập ở L0 qua màn lễ (không SQL) | L0 |
| ~~U-02~~ | **Chốt 05/09: đã có** `UserOrgRole` SUPER_ADMIN neo HO cho Kiệt + Phúc | — |
| U-03 | SĐT 19 người — chủ dự án **sẽ cung cấp sau**; chỉ cần trước bước import lưới T09 (L1) | L1 |
| ~~U-04~~ | ~~File mẫu MISA~~ → gộp vào K-03 | — |

### 8.3 Câu sinh ra từ khảo sát MISA — **đã chốt 05/09/2026**

| # | Chủ dự án chốt | Hệ quả |
|---|---|---|
| **K-01** | **Theo Sheet** | 1 công/ngày có mã; giờ Sheet giữ nguyên (S-31) |
| **K-02** | Tháng 8 **không tính ở đâu cả** (công ty không dùng MISA nữa) | Kỳ 9–11 cũng chưa có bảng công máy ⇒ cutover 01/12 là **bảng công máy đầu tiên**; L6 chạy song song với Sheet, không có gì khác để đối chiếu |
| **K-03** | **Thay luôn** | MISA ra khỏi hệ thống; export = bảng công Excel của ta; **module Tiền lương = đợt riêng** (S-32) |
| **K-04** | **Theo MISA** | Công chuẩn chung, không đè theo người; bỏ `standardUnitsOverride` (S-33) |
| **K-05** | Buổi **thực dạy**; Trial **không tính** (đã hoa hồng 1% khi chốt); huỷ không tính; **đơn giá gõ tay** | S-34 |
| **K-06** | **Theo MISA** | `LeaveType` 8 dòng + quỹ phép rule MISA đợt 2 (S-35) |
| **K-07** | **Không import T7** | 2 file xuất lưu hồ sơ |
| **K-08** | **Bỏ** | — |
| **K-09** | **Bỏ** | — |

<details><summary>Nguyên văn câu hỏi (để đối chiếu)</summary>

| # | Câu | Chặn |
|---|---|---|
| **K-01** | **Đơn vị công:** theo MISA (**S/C/T = 0,5 công**, HC = 1, SC = 1, SCT = 1,5) hay theo Sheet (**mỗi ô = 1 công**)? Ảnh hưởng thẳng hệ số công của người làm ca lẻ. Đề xuất: **theo MISA** vì lương tính ở MISA Tiền lương, Sheet chỉ là số hiển thị. **Kèm:** giờ C và T **không được chồng** (Sheet C→17:30, T 17:15→; MISA C→17:00, T 17:30→) — đỉnh 210 lượt lúc 17h không phân được vào/ra nếu chồng. Đề xuất giữ giờ Sheet nhưng **T bắt đầu 17:30** | L2 |
| **K-02** | **Tháng 8/2026 trả lương bằng số liệu nào?** MISA: 0 lượt chấm từ 01/08, không có bảng lương T8, bảng lương T7 chỉ 6/32 người. Ai đang tính lương thật, bằng công cụ gì (MISA Tiền lương hay Excel ngoài)? | L5 |
| **K-03** | **Giữ AMIS Tiền lương** (ta chỉ xuất file nhập) hay thay luôn? Kế hoạch này giả định **giữ** — đúng quyết định 05/08 và đúng cách 3/5 bảng đang đi | L5 |
| **K-04** | **Công chuẩn cho part-time/TTS/GV part-time**: MISA đang áp 27 cho tất cả ⇒ hệ số 0,17 cho Phó GĐ, 0 cho 3 GV CS2. Đè theo người (`standardUnitsOverride`) hay theo tính chất lao động? Và **giáo viên part-time có lương cứng để nhân hệ số không** — nếu không thì hệ số của họ vô nghĩa, chỉ cần `teachingSessions` | L5 |
| **K-05** | **`teachingSessions`** đếm buổi nào: `ClassSession` COMPLETED có `actualTeacherId`/`substituteTeacherId` = người đó, cộng `TrialClassSession`? Buổi huỷ do trung tâm có tính không? Đơn giá buổi vẫn gõ tay bên MISA? | L5 |
| **K-06** | **Loại nghỉ** giữ 8 của MISA (bỏ "Thứ 2") — tỷ lệ lương từng loại giữ nguyên? Nghỉ không lương 10 ngày/năm là chính sách thật? | L5 |
| **K-07** | **Nhân sự nghỉ việc + `_DEL`**: 12/26 dòng bảng công T7 mang mã `_DEL`, và MISA **đã cấp lại** `CS2.NV.004` cho người mới (S-30). Có cần import T7 vào hệ thống không (đề xuất: **không** — lưu 2 file xuất làm hồ sơ, `LEGACY_MISA` chỉ dùng nếu Kế toán cần tra trong app)? | L6 |
| **K-08** | Bảng công T7: **5 ngày/người không đi làm nhưng không tính nghỉ không lương** (TGĐ: 0 công đi làm, 22 nghỉ không lương, 5 hưởng lương). 5 ngày đó là gì — 4 Thứ Hai (loại nghỉ giả "Thứ 2") + 1? Kế toán có trả lương cho 5 ngày đó không? Quyết định `standardUnits` của ta (30 − T2 − lễ) có làm hệ số công **đổi** so với MISA không — phải chạy song song 1 kỳ (L6) để Kế toán thấy số lệch trước | L6 |
| **K-09** | **Nhật ký MISA 1.782 dòng** không export được — có cần chụp màn hình/ghi lại trước 31/01/2027 không, hay bỏ? | L0 |

</details>

---

## PHẦN 9 — CỔNG TEST (Q-14: có required check)

- Branch protection `main`/`test` chỉ bắt buộc **Quality + Unit tests (Vitest)**; CI **không chạy r1..r6** (2 bộ test chấm công cũ chưa từng chạy); `include` của `vitest.config.ts:13-30` là bộ lọc **cứng**; R7 đang bão hoà (1680s).
- **Quyết định:** test lõi → `tests/cham-cong/**` (Vitest) + khai `include` + bước trong job `chat-db-tests`; **chủ dự án thêm required check** cho job đó. Spec browser → `tests/e2e/a0`. Mock GPS: repo **chưa có ví dụ** — xây mới. Không viết AC "e2e chứng minh chặn fake GPS".
- `grep workRequest tests/` = **0 hit** — ma trận duyệt (đúng/sai cơ sở, HO, đua duyệt, nộp muộn) phải có test đỏ **trước** khi sửa action (luật cứng #5).

---

## PHẦN 10 — BẪY (giữ nguyên, bổ sung)

- **Múi giờ:** `actions.ts:79-82`, `page.tsx:46-50`, `lich-ca-nhan-vien:63-71`, `chinh-cong:46,73`, `shifts.ts:76-77 daysUntil`, `work-request-apply.ts:32-33` đều theo giờ máy chủ. **Đừng set `TZ` toàn cục** — các đường ghi `@db.Date` hiện đúng vì Vercel UTC; đặt +07 là lùi lịch 1 ngày. Cron `vercel.json` ghi UTC: 19:00 VN = `0 12 * * *`.
- **`scopedDb` không che WRITE**; extension chỉ top-level; ghi kép chỉ nhận `centerId` chuỗi thuần, **không hook `updateMany`**; **câu tra để chặn phải KHÔNG-SCOPE** (`lib/payments/method-lookup.ts`).
- **`session.user.centerId` lỗi thời** sau đổi đơn vị (sync không bump `tokenVersion`) — module mới không đọc nó.
- **Tài khoản staff không có `Employee`** tồn tại thật (SUPER_ADMIN seed, GV test, tài khoản tạo ở `/admin/users` bỏ trống ô Nhân sự) ⇒ `NO_EMPLOYEE_PROFILE` tường minh.
- **Ping-pong `orgUnitId` người HO** giữa màn nhân sự (`Employee.orgUnitId=null`) và màn tài khoản (`User.orgUnitId=HO`) qua `lib/hr/sync-employee-unit.ts` — chưa chạy thử; module không được suy HO từ `orgUnitId` của hai bảng này.
- **`scripts/move-teachers-to-ho.ts:25,50`** có thể đã đặt `User.centerId="hoi-so"` cho GV (06/08) — không có toạ độ; module không bám `User.centerId`.
- `lib/attendance/` trộn điểm danh HV và chấm công NS ⇒ code mới ở **`lib/staff-attendance/`**.
- `importApprovedShifts` `deleteMany` cả tháng — **không bê** sang bảng mới.
- `adjustTimesheetDirect` mã chết; `WorkShiftConfig` upsert/delete **không kiểm quyền**; tài liệu người dùng mô tả "QR xoay vòng" **sai**.
- `WorkScope` (phiếu điều động chính thức) **rỗng** trên prod (0 `Position`) — không dựa vào.

---

## PHẦN 11 — DI TRÚ

**Pha A (additive):** M1 tạo 10 bảng (9 + `LeaveType`) · M2 `ADD COLUMN` `WorkRequest`/`Holiday` · **seed nền 1 lần** (idempotent, cùng workflow với `seed-roles`): 21 `ShiftTemplate` từ DANH MỤC CA (CS có `PAID_BREAK` 16:30–17:00) + 8 `LeaveType` + 2 `WorkLocation` từ `Center` CS1/CS2 (bỏ `hoi-so`) · **phần còn lại người vận hành tự làm trên UI** (PHẦN 6b): QLCS import KHUNG CA → `ShiftWeeklyPattern` (Mr Phúc 2 bộ), import lưới T09/T10 → `ShiftAssignment` (gộp D1/D2, `sourceCells`), màn import hiện **diff + 15 con số** trước khi ghi · xoá 10 điểm ghi bảng cũ. **Không cờ, không script chạy tay ngoài seed nền.** Rollback = promote deployment trước (bảng cũ vẫn 0 dòng).
**Pha B (sau 1 kỳ chốt):** drop 5 bảng cũ + `lib/shifts.ts` `SHIFT_DEFS`/`LUNCH_BREAK` + enum `WorkShift` + 3 cột geofence trên `Center` + `/cham-cong/man-hinh` + `api/qr-token`. Dry-run + chạy tay (luật cứng #4).

**Nhánh:** `origin/test` và `origin/main` phân kỳ (90/94 commit) — chốt nhánh đích trước. `test.satarobo.vn` dùng **chung DB** với local.

---

## PHỤ LỤC — DÙNG LẠI

`lib/time/vn.ts` · `lib/attendance/qr-token.ts` + `signing-key.ts` (ký vé) · `geofence.ts` · BA §6.3-bis (ghép cặp) · `OtpRequest` (hình dạng vé) · `notifyStaff()` (`lib/notifications/notify.ts:47`, catalog đã có 2 tiền tố chấm công) · `api/admin/leads/export` (export) · `duyet-media/_actions.ts:44-55` (gate ghi) · `lib/org/drift-report.ts` (đối soát) · `getRequestMetadata()` · `lib/rate-limit.ts` (khoá theo userId) · `CommissionStatement` (vòng đời kỳ) · `lib/classes/adjust.ts:96-139` (tx + audit + event) · `lib/lms/session-teacher-notify.ts` (cron "ngày mai" theo giờ VN) · `lib/hr/sync-employee-unit.ts` (đồng bộ 2 chiều, có test) · `lib/elearning/entry.ts:30-43` (tra hồ sơ chính mình bypass scope).
