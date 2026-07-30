# BA MODULE CHẤM CÔNG — HIỆN TRẠNG SATA ROBO, ĐỐI CHIẾU MISA AMIS, VÀ BA MỚI

> **Người đọc:** Ban giám đốc · Trưởng bộ phận (HR, Đào tạo, Quản lý cơ sở) · Đội kỹ thuật.
> **Ngày lập:** 28/07/2026 · **Nguồn mã nguồn:** `E:/satarobo-vn`, nhánh `main`, commit `6d2f7d9a`.
> **Quy ước trích dẫn dùng xuyên suốt:**
> `[CODE] đường-dẫn:số-dòng` — đã đọc trực tiếp trong repo.
> `[WEB] URL` — trang công khai của nhà cung cấp / cơ quan nhà nước.
> `[FILE] đường-dẫn` — tài liệu nội bộ.
> `[SUY LUẬN]` — kết luận của người viết, **không phải sự thật đã xác minh**.
> `[CHƯA KIỂM CHỨNG]` — chưa đọc được nguồn gốc, chỉ có nguồn thứ cấp.
>
> **Ràng buộc khi lập tài liệu:** không truy vấn cơ sở dữ liệu production, không đọc biến môi trường,
> không sửa mã nguồn. Vì vậy mọi con số về **dữ liệu thật đang chạy** đều nằm ở mục Phụ lục "chưa kiểm chứng".

---

## 1. TÓM TẮT CHO LÃNH ĐẠO

1. Sata Robo **đã có** module chấm công chạy thật trên production: quét mã QR dán tại quầy cơ sở, kèm bắt buộc định vị GPS trong bán kính cho phép, mỗi ngày một lần vào và một lần ra.
2. Nhưng hệ thống chỉ có **đúng một phương thức chấm công**, ghép cứng trong mã nguồn (`[CODE] app/(admin)/admin/cham-cong/actions.ts:46-77`). Không có bảng "danh mục phương thức", không bật/tắt được theo cơ sở, không phân biệt được theo nhóm nhân viên.
3. Ba ca làm việc (sáng/chiều/tối) là **enum cứng trong cơ sở dữ liệu** (`[CODE] prisma/schema.prisma:3889-3893`); giờ ca nằm trong hằng số mã nguồn (`[CODE] lib/shifts.ts:8-12`). Muốn đổi giờ ca hay thêm ca thứ tư phải sửa mã và triển khai lại.
4. Có sẵn bảng `WorkShiftConfig` để cấu hình ca theo cơ sở, **và hàm đọc cấu hình đã viết xong** kèm kiểm thử (`[CODE] lib/attendance/shift-config.ts:23-40` — thứ tự ưu tiên: ghi đè theo cơ sở → toàn hệ thống → mặc định trong mã), **nhưng KHÔNG mã sản phẩm nào gọi nó**; mọi nơi tính công vẫn đọc hằng số `[CODE] lib/shifts.ts:8-12`. ⇒ Việc còn lại là **nối dây + màn hình khai báo**, không phải xây từ đầu. Giờ mặc định trong tầng cấu hình cũng **lệch** với giờ đang chạy thật (08:00 vs 07:30, dung sai 15 phút vs 5 phút).
5. Toàn bộ khâu **chốt lịch ca của tháng đi qua file Excel ngoài hệ thống**, và thao tác nhập lại là **xoá sạch rồi tạo lại** lịch cả cơ sở trong tháng, **không ghi nhật ký** (`[CODE] app/(admin)/admin/cham-cong/duyet-ca/_actions.ts:115-132`). Đây là rủi ro tranh chấp công lớn nhất hiện nay.
6. **Không có đầu ra**: không có bảng công tháng, không xuất được file chấm công, không có kỳ công, không chốt công, không nối sang tính lương. HR cuối tháng phải lật từng tuần trên màn hình.
7. **Không có phần nghỉ phép — tăng ca — công tác — làm từ xa đi vào công.** Có 10 mẫu đơn cho giáo viên nhưng **chưa có màn hình duyệt**, và schema ghi rõ đơn duyệt xong **không sinh tác động** lên bảng công (`[CODE] prisma/schema.prisma:3987`).
8. MISA AMIS Chấm công hơn ở bốn chỗ: **danh mục hình thức chấm công cấu hình được** (10 hình thức, áp theo đơn vị/nhân viên), **danh mục ca làm việc khai báo được** (kèm khung giờ chấm công, hệ số lương, quy định làm thêm), **bảng công tổng hợp — chốt công — chuyển sang tiền lương**, và **quy trình đơn từ nhiều cấp duyệt** `[WEB]`.
9. Sata Robo hơn MISA ở ba chỗ, phải giữ: **3 loại đơn đặc thù đào tạo** (đổi lớp dạy, dạy thay, nghỉ buổi dạy), **cách ly dữ liệu theo cơ sở ở tầng truy vấn** (`scopedDb`), và **lệnh cấm cứng không định vị/sinh trắc học sinh** (`[CODE] lib/attendance/geofence.ts:2`).
10. **Đề xuất:** giữ nguyên QR + GPS làm phương thức mặc định, bọc nó lại thành **một mục trong danh mục phương thức chấm công cấu hình được**, rồi lần lượt bổ sung: khai báo ca trong dữ liệu, nhiều lượt vào/ra trong ngày, bảng công tháng + chốt kỳ, đơn từ có duyệt và có tác động vào công.
11. **Thời gian ước lượng thô** `[SUY LUẬN]`: 4 giai đoạn, khoảng **12–20 tuần** công việc kỹ thuật nếu làm tuần tự, trong đó giai đoạn 1 (nền cấu hình, không đụng phân quyền) khoảng 3 tuần và **giai đoạn 2 là 5–9 tuần** — vì có **hai thay đổi cấu trúc dữ liệu phá vỡ trên bảng đang chạy production** (bỏ ràng buộc "1 vào + 1 ra mỗi ngày"; chuyển ca từ mảng enum sang danh mục dữ liệu), chi tiết ở **§6.8-bis**. **Không có hai việc đó thì không mở được ca thứ tư và không chấm được nhiều lượt trong ngày.**
12. **Chi phí:** phần lớn là công sức nội bộ. Chi phí ngoài chỉ phát sinh nếu chọn QR động (cần màn hình luôn bật ở mỗi cơ sở) hoặc máy chấm công phần cứng. Giá MISA AMIS Chấm công **không công khai**, phải xin báo giá `[WEB] https://amis.misa.vn/amis-cham-cong/`.
13. **Rủi ro lớn nhất số 1 — pháp lý:** toạ độ GPS nhân viên là **dữ liệu cá nhân nhạy cảm** theo Nghị định 356/2025/NĐ-CP. Hệ thống đang lưu toạ độ thô vĩnh viễn, **không có thông báo xử lý dữ liệu, không có bản ghi đồng ý, không có thời hạn xoá, không có hồ sơ đánh giá tác động**.
14. **Rủi ro lớn nhất số 2 — kỹ thuật:** đồng hồ shadow-compare của đợt go-live RBAC **CHƯA CHẠY** — bị chặn bởi kiểm tra tiền đề P1 (**3 nhân viên còn thiếu `UserOrgRole`**), số ngày sạch **= 0** (`[FILE] docs/ke-hoach-go-live-2607/shadow-log.md:22-23`), và **chưa ai được giao việc đóng P1**. Mọi thay đổi ma trận quyền `hr_attendance:*` sẽ **đặt lại đồng hồ**. Vì vậy toàn bộ giai đoạn 1 của lộ trình được thiết kế để **không chạm** vùng này — và mọi hạng mục "đợi sau khi lật cờ" (giai đoạn 3, 4) **chưa có mốc thời gian thật**.
15. **Cần Ban giám đốc chốt 12 câu** ở PHẦN G trước khi đội kỹ thuật viết đặc tả — nặng nhất là: một nhân viên được chấm mấy lần một ngày (CH-01), giáo viên chấm theo ca hay theo buổi dạy (CH-03), cơ sở nhượng quyền dùng chung hệ thống hay tách riêng (CH-08), **có mở đường sinh trắc học cho nhân viên và có sửa Doc 15 §0 không (CH-11)**, và **người làm hai ca chồng giờ được tính 7h30 hay 8h (CH-12)**. **Ba câu chặn ngay từ Giai đoạn 0–1: CH-05, CH-11, CH-12.**

---

## 2. PHẠM VI VÀ CÁCH ĐỌC TÀI LIỆU

### 2.1 Tài liệu này nói gì

| Phần | Nội dung |
|---|---|
| A | Luồng nghiệp vụ chấm công **đang chạy thật** của Sata Robo, theo góc nhìn người dùng, kèm mô hình dữ liệu và danh mục điểm đứt gãy |
| B | MISA AMIS Chấm công làm như thế nào, theo tài liệu công khai của MISA |
| C | Bảng đối chiếu từng hạng mục + quyết định đề xuất (lấy của MISA / giữ của Sata / lai ghép / bỏ) |
| D | **BA mới** — mô hình nghiệp vụ hợp nhất ở mức khái niệm và dữ liệu logic |
| E | Ràng buộc pháp lý, bảo mật, đa cơ sở, nhượng quyền, xung đột với đợt go-live RBAC |
| F | Lộ trình 4 giai đoạn |
| G | Câu hỏi cần Ban giám đốc chốt |

### 2.2 Tài liệu này KHÔNG nói gì

- **Không** đặc tả kỹ thuật: không có lược đồ migration, không có mã nguồn, không có thiết kế giao diện chi tiết. PHẦN D dừng ở mức khái niệm + dữ liệu logic, đủ để đội kỹ thuật ước lượng.
- **Không** nói về **điểm danh học viên**. Đây là hai việc khác nhau hoàn toàn (xem cảnh báo §2.4).
- **Không** nói về CRM — phần đó ở tài liệu song sinh `docs/ba-crm-hien-trang-va-misa.md`.
- **Không** thay thế ý kiến luật sư. Phần pháp lý ở PHẦN E là để **nêu câu hỏi đúng**, không phải để kết luận.

### 2.3 Quan hệ với các tài liệu khác trong `docs/` và `Document/`

| Tài liệu | Quan hệ |
|---|---|
| `Document/2-architecture-design/15-final-architecture-blueprint.md` | Blueprint chốt của toàn hệ thống. Tài liệu này **phải phục tùng** blueprint ở các điểm: OrgUnit tree, RBAC động, `scopedDb`, DomainEvent, và **lệnh cấm sinh trắc/định vị học sinh** |
| `docs/ke-hoach-go-live-2607/shadow-log.md` | Nhật ký đồng hồ shadow RBAC. Quyết định **thời điểm** được phép làm phần đụng phân quyền |
| `docs/taicautruc/02-prd-franchise-platform.md` | PRD nhượng quyền — nguồn của các yêu cầu R-DP-01…R-DP-07 dùng lại ở PHẦN E |
| `docs/luong-lms-hien-trang.md` | Bản đồ luồng LMS hiện trạng — bổ trợ cho phần giáo viên dạy theo lớp |
| `docs/misa-amis-sync.md` | Mô tả khung tích hợp MISA hiện có (**chỉ là khung kế toán rỗng**, không liên quan chấm công) |
| `docs/ba-crm-hien-trang-va-misa.md` | Tài liệu song sinh cho module CRM |

### 2.4 CẢNH BÁO ĐỌC HIỂU — hai chữ "chấm công" trong hệ thống

| Khái niệm | Đối tượng | Nơi ở trong mã nguồn |
|---|---|---|
| **Chấm công nhân viên** — chủ đề tài liệu này | Nhân viên, giáo viên | `app/(admin)/admin/cham-cong/**`; model `EmployeeCheckin`, `ShiftRegistration`, `TimesheetAdjustmentRequest`, `TimesheetEditLog` |
| **Điểm danh học viên** — KHÔNG thuộc tài liệu này | Học sinh trong buổi học | `app/(admin)/admin/attendance/**`; model `Attendance`, `ClassSession` |

Hai luồng này **không có khoá ngoại nối nhau**, chỉ vô tình cùng nằm trong thư mục `lib/attendance/`. Trong thư mục đó: `qr.ts`, `qr-token.ts`, `geofence.ts`, `adjust.ts`, `shift-excel.ts`, `shift-config.ts` thuộc **chấm công nhân viên**; còn `roster.ts`, `summary.ts` thuộc **điểm danh học viên**.

---

## 3. PHẦN A — LUỒNG BA HIỆN TẠI CỦA SATA ROBO

### 3.1 Sơ đồ luồng bằng chữ

```
── VÒNG THÁNG (lịch ca) ────────────────────────────────────────────────────────
  Ngày 25–28 tháng trước
     Nhân viên mở "Lịch ca của tôi" → bấm TỪNG NGÀY → tick 1–3 ca → Lưu
        ⇒ ShiftRegistration.status = REGISTERED  ("đề xuất")
        ⇒ nếu ngày làm cách hôm nay < 2 ngày ⇒ tự chuyển LEAVE_REQUESTED (nghỉ/đổi khẩn)
           và bị trừ vào quota 3 lần khẩn/tháng
  Trước ngày cuối tháng
     Quản lý cơ sở HOẶC HR mở "Duyệt ca"
        → Xuất Excel (CHỈ lấy các dòng REGISTERED)
        → Sửa tay TRONG FILE EXCEL (ngoài hệ thống, không để lại vết)
        → Nhập lại file  ⇒ XOÁ SẠCH toàn bộ lịch tháng của mọi nhân viên cơ sở
                          ⇒ TẠO LẠI toàn bộ với status = APPROVED
     Chỉ APPROVED mới được dùng để tính công.

── VÒNG NGÀY (chấm công) ───────────────────────────────────────────────────────
  Nhân viên đến cơ sở
     → quét QR dán tại quầy (QR cố định, không hết hạn)
     → mở trang trên điện thoại (PHẢI đã đăng nhập tài khoản admin)
     → cho phép định vị
     → bấm "Check-in"
        · sai mã cơ sở            ⇒ TỪ CHỐI
        · cơ sở có toạ độ mà không gửi GPS ⇒ TỪ CHỐI
        · ngoài bán kính          ⇒ TỪ CHỐI CỨNG, không ghi gì
        · đã check-in hôm nay     ⇒ TỪ CHỐI ("Hôm nay đã check-in rồi")
        · hợp lệ                  ⇒ ghi 1 dòng EmployeeCheckin
  Ra về → quét lại → "Check-out"  (tối đa 1 lần/ngày)
  Giữa ca ra ngoài rồi vào lại    ⇒ KHÔNG hỗ trợ

── TÍNH CÔNG ───────────────────────────────────────────────────────────────────
  Không có bảng lưu kết quả. Mỗi lần MỞ TRANG, hệ thống tính lại tại chỗ:
     giờ chuẩn  = tổng độ dài các ca APPROVED (đã gộp khoảng chồng nhau)
     giờ thực   = phần GIAO giữa [check-in, check-out] và các khoảng ca
     nhãn       = Đủ công / Đi muộn / Về sớm / Thiếu giờ / Thiếu check-out /
                  Thiếu ca (không quét) / Chưa đăng ký ca

── SỬA SAI ─────────────────────────────────────────────────────────────────────
  Nhân viên gửi "Yêu cầu chỉnh công" (ngày + đề nghị GÕ TAY + lý do ≥5 ký tự)
     → Quản lý cơ sở mở "Chỉnh công" → GÕ LẠI giờ vào/ra vào ô nhập
        → "Duyệt + áp giờ"  ⇒ sửa/tạo EmployeeCheckin + ghi TimesheetEditLog
        → hoặc "Từ chối"
     Quản lý cơ sở chỉ được sửa trong 2 ngày kể từ ngày công; quá hạn phải nhờ SUPER_ADMIN.

── ĐƠN TỪ (chỉ giáo viên) ──────────────────────────────────────────────────────
  Giáo viên gửi 1 trong 10 loại đơn  ⇒ WorkRequest.status = PENDING
  … và DỪNG Ở ĐÂY. Không có màn hình duyệt. Đơn nằm mãi ở PENDING.
  Kể cả duyệt được, đơn cũng KHÔNG tác động vào bảng công.
```

### 3.2 Ai làm gì, khi nào

**Nhân viên / giáo viên**

| Thời điểm | Việc | Màn hình | Ma sát thực tế |
|---|---|---|---|
| Ngày 25–28 tháng trước | Đăng ký ca tháng sau | `/cham-cong/lich-ca` | Bấm **từng ngày một**, không có "sao chép tuần"/"áp dụng mẫu". Một người làm toàn thời gian ≈ 26 lần mở hộp thoại mỗi tháng |
| Đến cơ sở | Quét QR → bật định vị → Check-in | `/cham-cong/checkin` | Phải đã đăng nhập sẵn trên điện thoại; không bật định vị thì **không chấm được** |
| Ra về | Quét lại → Check-out | như trên | Quên check-out ⇒ ngày đó giờ công = 0, nhãn "Thiếu check-out". **Không ai nhắc** |
| Ra ngoài giữa ca | — | — | **Không hỗ trợ** — tối đa 1 vào + 1 ra mỗi ngày |
| Khi sai giờ | Gửi yêu cầu chỉnh công | `/cham-cong/yeu-cau-cong` hoặc `/teacher/bang-cong` | Ô "đề nghị" là **văn bản tự do**, quản lý phải đọc rồi gõ lại giờ ⇒ dễ sai lệch |
| Nghỉ phép / tăng ca / công tác | Giáo viên: `/teacher/don-tu` | | **Nhân viên không phải giáo viên không có màn hình đơn từ nào.** Và đơn gửi rồi không ai duyệt được |

**Quản lý cơ sở**

| Nhịp | Việc | Màn hình |
|---|---|---|
| Đầu ngày / cuối ngày | Tick checklist mở & đóng cơ sở (5 + 6 mục) | `/cham-cong/checklist-co-so` |
| Hằng ngày | Xem bảng công của **một ngày**: ai muộn, thiếu giờ, chưa check-out | `/cham-cong` |
| Hằng tuần | Xem lưới 7 cột thứ Hai → Chủ nhật | `/cham-cong/lich-ca-nhan-vien` |
| Khi có yêu cầu | Duyệt chỉnh công **trong 2 ngày** kể từ ngày công | `/cham-cong/chinh-cong` |
| Cuối tháng | Xuất Excel → sửa tay → nhập đè ⇒ lịch thành chính thức | `/cham-cong/duyet-ca` |
| Khi cần | Mở màn hình QR tại quầy | `/cham-cong/man-hinh` |

**HR cuối tháng** — đây là chỗ quy trình đứt gãy nặng nhất:

1. Mở lưới tuần, bấm mũi tên **từng tuần** đi hết tháng — không có chế độ xem tháng, không có tổng giờ.
2. Hoặc mở bảng công ngày **từng ngày một**.
3. **Không có nút xuất bảng công tháng.** Muốn số tổng hợp phải chép tay.
4. **Không sửa được sai sót** — HR có `hr_attendance:view` nhưng **không có** `hr_attendance:adjust` (`[CODE] lib/auth/permissions.ts:358,360`) ⇒ phải nhờ quản lý cơ sở (chỉ còn 2 ngày) hoặc SUPER_ADMIN.
5. **Không có bất kỳ đầu ra nào nối sang tính lương.**

### 3.3 Bảng vai trò × thao tác × quyền

Hệ thống chỉ có **ba** hành động quyền cho chấm công (`[CODE] lib/auth/permissions.ts:95-98`):

| Hành động | Nghĩa nghiệp vụ |
|---|---|
| `hr_attendance:checkin` | Tự chấm công + tự đăng ký ca + tự gửi yêu cầu chỉnh công |
| `hr_attendance:view` | Xem bảng công, mở màn hình QR, xuất/nhập lịch ca, checklist cơ sở |
| `hr_attendance:adjust` | Duyệt yêu cầu chỉnh công + sửa trực tiếp bản ghi công |

Ma trận đang **enforce trên production** (v1 tĩnh — `[CODE] lib/auth/permissions.ts:353-360`):

| Vai trò | Tự chấm công | Xem bảng công | Chỉnh công | Chốt lịch ca (nhập Excel) |
|---|---|---|---|---|
| SUPER_ADMIN | ✅ | ✅ | ✅ (không giới hạn thời gian) | ✅ |
| CENTER_MANAGER | ✅ | ✅ (cơ sở mình) | ✅ (trong 2 ngày) | ✅ (ép về cơ sở mình) |
| HR | ✅ | ✅ | ❌ | ✅ ⚠️ |
| TEACHER | ✅ | ❌ | ❌ | ❌ |
| SALES_CSM | ✅ | ❌ | ❌ | ❌ |
| MARKETING | ✅ | ❌ | ❌ | ❌ |
| ACCOUNTANT | ✅ | ❌ | ❌ | ❌ |
| **TRAINING** | ❌ ⚠️ | ❌ | ❌ | ❌ |
| PARENT | ❌ | ❌ | ❌ | ❌ |

⚠️ **Hai lệch nghiệp vụ đọc thẳng ra từ bảng này:**
- **HR chốt được lịch ca chính thức nhưng không sửa được bản ghi công.** Nhập Excel chỉ gate bằng `hr_attendance:view` (`[CODE] app/(admin)/admin/cham-cong/duyet-ca/_actions.ts:54`), trong khi sửa một giờ vào lại cần `adjust`. Người có quyền lớn hơn lại bị chặn ở việc nhỏ hơn.
- **Vai trò `TRAINING` (Đào tạo) không nằm trong danh sách `hr_attendance:checkin`** (`[CODE] lib/auth/permissions.ts:355-357` liệt kê 7 vai trò, thiếu `TRAINING`) ⇒ nhân sự Đào tạo **không tự chấm công được**. `[SUY LUẬN]` nhiều khả năng là sót khi thêm vai trò này, nhưng **chưa xác nhận** — không được tự sửa. **Đã cấp mã DG-34 trong bảng §3.6** để lộ trình tham chiếu được.

**Quyền lương đang treo:** `payroll:view` (SUPER_ADMIN, ACCOUNTANT, HR) và `payroll:edit` (SUPER_ADMIN, ACCOUNTANT) đã có trong ma trận (`[CODE] lib/auth/permissions.ts:379-380`) nhưng **không có màn hình nào dùng** — không tồn tại route lương/payroll trong `app/`.

### 3.4 Mô hình dữ liệu hiện tại

| Model | Vị trí | Ý nghĩa nghiệp vụ | Trường chính | Cách ly theo cơ sở |
|---|---|---|---|---|
| `EmployeeCheckin` | `[CODE] prisma/schema.prisma:4065-4084` | 1 dòng = 1 lần quét (vào **hoặc** ra) | `userId` (cột phẳng, **không khoá ngoại**), `type`, `checkedAt`, `latitude`, `longitude`, `distanceMeters`, `withinGeofence`, `qrToken` | ✅ có `centerId` + thuộc `SCOPED_MODELS` (`[CODE] lib/db-scope.ts:13`) |
| `ShiftRegistration` | `:3919-3936` | Đăng ký ca: **1 dòng / nhân viên / ngày** | `shifts WorkShift[]`, `status` ∈ REGISTERED / LEAVE_REQUESTED / APPROVED, `note` | ✅ |
| `WorkShiftConfig` | `:3897-3911` | Cấu hình giờ ca theo cơ sở | `code`, `name`, `startTime`, `endTime`, `toleranceMinutes` (mặc định 15), `isActive` | ❌ miễn cách ly (là bảng cấu hình) — **đã có tầng đọc/ghi hoàn chỉnh** (`[CODE] lib/attendance/shift-config.ts:23-82`: `getShiftConfig` / `upsertShiftConfig` / `deleteShiftConfig` / `seedDefaultShifts`) **và có kiểm thử** (`[CODE] tests/e2e/r6/shift-category.spec.ts:28,36,40`), **nhưng KHÔNG file nào trong `app/**` gọi `getShiftConfig`** ⇒ chưa nối vào sản phẩm (DG-03) |
| `TimesheetAdjustmentRequest` | `:3945-3965` | Yêu cầu chỉnh công do nhân viên gửi | `date`, `reason` (bắt buộc), `requested` (**văn bản tự do**), `status`, `reviewedBy*` | ✅ |
| `TimesheetEditLog` | `:3968-3983` | Nhật ký mọi lần sửa bản ghi công | `field` (CHECK_IN/CHECK_OUT), `fromValue` → `toValue`, `reason`, `editedBy*`, `requestId` | ❌ **không có `centerId`, không khai báo ở tầng cách ly** |
| `WorkRequest` | `:4007-4033` | Đơn từ giáo viên — **10 loại** | `kind`, `status`, `fromDate/toDate`, `startTime/endTime`, `hours`, `classId`, `targetUserId`, `reason` | ❌ **cố ý** miễn cách ly, guard thủ công khi duyệt (`[CODE] lib/db-scope.ts:75-78`) |
| `CenterDayChecklist` | `:4036-4063` | Checklist mở/đóng cơ sở theo ngày | **11 cột boolean cứng** (5 mở + 6 đóng) + ghi chú | ✅ (`centerId` bắt buộc) |
| `Holiday` | `:690-706` | Ngày nghỉ / bảo trì / sự kiện | `date`, `endDate`, `type`, `centerId` (null = toàn hệ thống) | ✅ — nhưng **không tham gia công thức tính công** |
| `Employee` | `:1933-2015` | Hồ sơ nhân sự (**không chứa dữ liệu công**) | `salaryRank`, `salaryLevel`, `bhxhBase`, `contractType`, `managerId` | ✅ |
| `Center` | `:235-281` | Cơ sở — **nguồn toạ độ geofence** | `latitude`, `longitude`, `allowedRadiusMeters` (mặc định 100) | ❌ miễn cách ly có chủ đích |

**Các model KHÔNG tồn tại** (đã rà toàn bộ danh sách model trong schema): `Payroll`, `Salary`, `Timesheet` (bảng công tháng), `TimesheetPeriod` (kỳ công), `AttendanceMethod`, `AttendancePolicy`, `LeaveBalance` (quỹ phép), `OvertimeRecord`.

**Quan hệ rút gọn:**

```
Center ──1:N──> Employee                Center.latitude/longitude/allowedRadiusMeters
  │                 ▲                          = nguồn duy nhất của geofence
  │                 │ 1:1 (User.employeeId)
  └──1:N──> User ───┘
              ├──1:N──> ShiftRegistration            (CÓ khoá ngoại, xoá lan)
              ├──(cột phẳng userId)────> EmployeeCheckin
              ├──(cột phẳng userId)────> TimesheetAdjustmentRequest
              ├──(cột phẳng userId)────> TimesheetEditLog
              └──(cột phẳng requesterId)─> WorkRequest

WorkShiftConfig  ── không quan hệ với model nào; CÓ tầng đọc/ghi riêng
                    (lib/attendance/shift-config.ts) nhưng KHÔNG mã sản phẩm nào
                    gọi — chỉ kiểm thử gọi
```

### 3.5 Tham số thật đang chạy

| Tham số | Giá trị | Cấu hình được? | Trích dẫn |
|---|---|---|---|
| Ca sáng | **07:30 – 11:30** | ❌ hằng số mã nguồn | `[CODE] lib/shifts.ts:9` |
| Ca chiều | **13:30 – 17:30** | ❌ | `[CODE] lib/shifts.ts:10` |
| Ca tối | **17:00 – 21:00** | ❌ | `[CODE] lib/shifts.ts:11` |
| Dung sai đi muộn / về sớm / đủ công | **5 phút** | ✅ **cấu hình được cả cấp hệ thống lẫn cấp cơ sở về mặt dữ liệu** (`centerOverridable: true`, và CENTER_MANAGER của cơ sở đó được phép sửa), **nhưng giao diện hiện chỉ cho sửa mức toàn hệ thống** — xem DG-19 | `[CODE] lib/shifts.ts:21`; `lib/settings/registry.ts:147-154`; `lib/settings/service.ts:134-145` (cho phép cấp cơ sở) vs `cau-hinh-van-hanh/_components/settings-editor.tsx:8` (chỉ nhập `saveGlobalSettingAction`) |
| Bán kính geofence | **100 m** (ưu tiên `Center.allowedRadiusMeters`) | ✅ theo cơ sở + khoá toàn hệ thống | `[CODE] prisma/schema.prisma:253`; `lib/settings/registry.ts:299-306` |
| Quota nghỉ/đổi khẩn cấp | **3 lần / tháng / người** | ✅ | `[CODE] lib/shifts.ts:33`; `registry.ts:155-162` |
| Cửa sổ đề xuất ca tháng sau | ngày **25 → 28** | ✅ | `[CODE] lib/shifts.ts:43`; `registry.ts:163-168` |
| Cửa sổ quản lý sửa bảng công | **2 ngày** | ✅ | `[CODE] lib/attendance/adjust.ts:7`; `registry.ts:307-312` |
| Ngưỡng "sát ngày" tự thành nghỉ khẩn | **< 2 ngày** | ❌ hằng số trong hàm | `[CODE] lib/shifts.ts:82-84` |
| Nghỉ trưa | 11:30 – 13:30 | ❌ khai báo nhưng **không dùng** | `[CODE] lib/shifts.ts:24` |
| Múi giờ | **UTC+7 cứng** | ❌ | `[CODE] lib/work-schedule.ts:12-13` |

**Cơ chế mã QR** (`[CODE] lib/attendance/qr-token.ts:5-22`):

```
chữ ký = HMAC-SHA256(secret, "attendance:<centerId>")  → base64url, cắt 24 ký tự
mã     = "<centerId>.<chữ ký>"
```

Không có thành phần thời gian ⇒ **mã cố định vĩnh viễn, không hết hạn**. Mã nguồn tự ghi rõ: *"QR CỐ ĐỊNH mỗi cơ sở: mã gắn centerId, KHÔNG hết hạn (bỏ cửa sổ xoay 30s)"* (`[CODE] lib/attendance/qr.ts:8`), và màn hình QR được thiết kế để **in dán tại quầy** (`[CODE] .../man-hinh/_components/qr-screen.tsx:25`). Việc lộ mã là **có chủ đích** — lớp chống gian lận duy nhất còn lại là GPS.

⚠️ Chú thích trong schema ghi *"Chấm công bằng QR xoay (HMAC time-window)"* (`[CODE] prisma/schema.prisma:3881`) — **mô tả sai cơ chế thật**, dễ dẫn nhầm người đọc tài liệu.

### 3.6 Điểm đứt gãy hiện tại

> Đánh số `DG-xx` để PHẦN C và PHẦN F tham chiếu.

| Mã | Điểm đứt gãy | Bằng chứng | Mức |
|---|---|---|---|
| **DG-01** | **Chỉ có 1 phương thức chấm công.** QR + GPS ghép cứng trong cùng một hàm, không tách rời, không bật/tắt riêng. `EmployeeCheckin` **không có cột nào ghi "chấm bằng cách nào"** | `[CODE] app/(admin)/admin/cham-cong/actions.ts:46-77`; `prisma/schema.prisma:4065-4084` | **Rất cao** — đây là yêu cầu trung tâm |
| **DG-02** | **Ca làm việc không cấu hình được.** Enum 3 giá trị cứng trong DB + giờ trong hằng số mã nguồn | `[CODE] prisma/schema.prisma:3889-3893`; `lib/shifts.ts:8-12` | **Rất cao** |
| **DG-03** | **Hai nguồn giờ ca lệch nhau, và tầng cấu hình chưa được nối vào sản phẩm.** Hàm đọc cấu hình ca **ĐÃ CÓ** (`getShiftConfig`, ưu tiên: cơ sở → toàn hệ thống → mặc định trong mã) và **đã có kiểm thử**, **nhưng KHÔNG nơi nào trong mã sản phẩm gọi** — đã rà toàn repo, chỉ kiểm thử gọi. Mọi nơi tính công vẫn đọc hằng số. Giá trị cũng lệch: tầng cấu hình ghi 08:00–11:30 / 13:30–17:00 / 18:00–21:00 và dung sai 15 phút; nguồn đang chạy ghi 07:30–11:30 / 13:30–17:30 / 17:00–21:00 và dung sai 5 phút. Ai sửa bảng DB sẽ **tưởng đã đổi ca nhưng công vẫn tính theo hằng số** | `[CODE] lib/attendance/shift-config.ts:23-40` (hàm đọc), `:10-12` (giá trị mặc định) vs `lib/shifts.ts:9-11,21`; `tests/e2e/r6/shift-category.spec.ts` | Cao |
| **DG-04** | **Tối đa 1 vào + 1 ra mỗi ngày** — trong khi hệ thống lại cho đăng ký tới 3 ca/ngày. Người làm ca sáng rồi ca tối **không thể chấm đủ**. Đây là **mâu thuẫn nội tại**, không phải thiếu tính năng | `[CODE] prisma/schema.prisma:4080` (unique) + `actions.ts:84-93` vs `schema.prisma:3925` | **Rất cao** |
| **DG-05** | **Không có nghỉ phép / quỹ phép năm.** Có mẫu đơn `LEAVE` nhưng không có màn duyệt, không có số dư phép, không trừ công | `[CODE] lib/work-request.ts:29`; `app/(teacher)/teacher/don-tu/_actions.ts:91` không có nơi gọi | Cao |
| **DG-06** | **Không có tăng ca, làm từ xa, công tác đi vào công.** Đơn `OT` có nhập số giờ nhưng số đó không đi đâu cả. Màn Bảng công giáo viên ghi thẳng: *"hệ thống KHÔNG chấm công OT / đi-muộn / đúng-giờ cho GV"* | `[CODE] app/(teacher)/teacher/bang-cong/page.tsx:8-11` | Cao |
| **DG-07** | **Đơn từ duyệt xong không sinh tác động.** Schema ghi rõ *"Không tự sinh side-effect (chỉ trạng thái)"* | `[CODE] prisma/schema.prisma:3987`; `don-tu/_actions.ts:114-123` | Cao |
| **DG-08** | **Không có màn hình duyệt đơn từ.** Hàm duyệt tồn tại nhưng **không component nào gọi**; chú thích tự thừa nhận *"UI quản lý ở admin — action sẵn sàng"* | `[CODE] app/(teacher)/teacher/don-tu/_actions.ts:2-3, 91-129` | Cao |
| **DG-09** | **Không có bảng công tháng, không có kỳ công, không có chốt công, không có xuất file.** Thư mục báo cáo không có mục chấm công/nhân sự | `[CODE] app/(admin)/admin/bao-cao/` (8 mục, không có chấm công) | Cao |
| **DG-10** | **Không nối sang tính lương.** Quyền `payroll:*` có trong ma trận nhưng không có màn hình nào | `[CODE] lib/auth/permissions.ts:379-380` | Cao |
| **DG-11** | **Kết quả tính công không được lưu.** Tính lại tại chỗ mỗi lần mở trang ⇒ đổi giờ ca hay dung sai sẽ **làm đổi hồi tố toàn bộ số liệu công quá khứ** | `[CODE] lib/work-schedule.ts:94-154` (không ghi DB) | **Rất cao** — chặn việc chốt kỳ lương |
| **DG-12** | **Chốt lịch ca đi qua Excel ngoài hệ thống**, thao tác nhập là **xoá sạch + tạo lại**. Ai không có trong file thì **mất lịch im lặng**. Không xem trước, không hoàn tác, **không ghi nhật ký** | `[CODE] duyet-ca/_actions.ts:115-132` | **Rất cao** — rủi ro tranh chấp |
| **DG-13** | **Gần như không có nhật ký kiểm toán.** Toàn module chỉ có 1 chỗ ghi `AuditLog` là lúc xuất Excel | `[CODE] app/api/admin/cham-cong/shift-export/route.ts:90-97` | Cao |
| **DG-14** | **Không có nhắc việc chủ động.** 0 tác vụ định kỳ, 0 thông báo nhân viên, 0 email/Zalo cho chấm công. Không ai được nhắc "bạn chưa check-out" hay "còn 2 ngày hết hạn duyệt lịch" | Danh sách 15 cron trong `vercel.json` không có mục nào về chấm công | Trung bình–cao |
| **DG-15** | **Ngày lễ không tác động vào công.** `Holiday` **có** tham gia xếp lịch buổi học (đọc ngày nghỉ rồi bỏ qua khi sinh buổi), nhưng **KHÔNG** tham gia công thức tính công; ở bảng công giáo viên chỉ dùng để **đếm hiển thị** | `[CODE] app/(admin)/admin/classes/_actions.ts:675-693` (dùng thật khi xếp lịch lớp) vs `lib/work-schedule.ts:94-154` (không nhận tham số ngày nghỉ) | Trung bình |
| **DG-16** | **Mã QR cố định + in dán tại quầy** ⇒ ai chụp ảnh mã là chấm được, chỉ còn GPS chặn (mà GPS giả được bằng ứng dụng phổ biến) | `[CODE] lib/attendance/qr.ts:8`; `qr-screen.tsx:25` | Cao (gian lận) |
| **DG-17** | **Cơ sở chưa khai toạ độ ⇒ bỏ qua geofence hoàn toàn**, âm thầm, không cảnh báo. Mở cơ sở mới mà quên nhập toạ độ là mất hẳn kiểm soát vị trí | `[CODE] app/(admin)/admin/cham-cong/actions.ts:63` (cả khối geofence nằm trong `if`) | Cao |
| **DG-18** | **Không có "khung giờ chấm công"** (cửa sổ thời gian được phép quét). Chấm lúc 3 giờ sáng vẫn được ghi nhận | không có trường nào tương ứng trong schema | Trung bình |
| **DG-19** | **Cấu hình theo cơ sở có hạ tầng nhưng không dùng được.** Hàm ghi đè cấp cơ sở tồn tại nhưng **giao diện không gọi**; và mọi nơi đọc tham số chấm công đều **không truyền tham số đơn vị** ⇒ luôn rơi về giá trị toàn hệ thống | `[CODE] lib/settings/service.ts:134-188` vs `.../cau-hinh-van-hanh/_components/settings-editor.tsx`; `actions.ts:68`, `page.tsx:100`, `chinh-cong/_actions.ts:169,243`, `lich-ca/_actions.ts:64` | Cao |
| **DG-20** | **Ô "đề nghị giờ đúng" là văn bản tự do** ⇒ hệ thống không tự áp được, quản lý phải đọc rồi gõ lại | `[CODE] prisma/schema.prisma:3952`; `chinh-cong/_actions.ts:129-130` | Trung bình |
| **DG-21** | **Bản ghi công tạo bằng tay không phân biệt được với bản ghi quét thật** — chỉ khác ở tiền tố `"adjust:"` trong một cột kỹ thuật | `[CODE] chinh-cong/_actions.ts:95-104` | Trung bình |
| **DG-22** | **Nhật ký sửa công không có `centerId`, không cách ly cơ sở, và chưa có màn hình nào đọc** ⇒ ghi mà không ai xem được; sẽ rò chéo cơ sở ngay khi làm màn hình | `[CODE] prisma/schema.prisma:3968-3983` | Trung bình |
| **DG-23** | **Nhân viên không phải giáo viên XEM ĐƯỢC bảng công TUẦN của chính mình** tại `/cham-cong/lich-ca-nhan-vien` (chế độ chỉ-xem-mình), **nhưng: (a) không có mục menu dẫn tới** — menu gác bằng `hr_attendance:view` mà họ không có, phải biết đường dẫn mới vào được; **(b) không có chế độ xem theo tháng và không có tổng giờ**; **(c) không có màn hình đơn từ nào** | `[CODE] lich-ca-nhan-vien/page.tsx:58` (cho vào chỉ cần `hr_attendance:checkin`), `:73` (`selfOnly = !canViewAll`), `:83-90` (lọc `{ id: session.user.id }`), `:231-239` (vẫn tính công cho chính người đó); `components/admin/sidebar.tsx:172` (menu gác `hr_attendance:view`); không có route `don-tu` trong site admin | Trung bình |
| **DG-24** | **Không có khái niệm nhân viên đa cơ sở.** Bản ghi quét lấy cơ sở **từ mã QR**, còn bản ghi đăng ký ca lấy cơ sở **từ hồ sơ người dùng** ⇒ dạy ở cơ sở khác sẽ **lệch cơ sở giữa hai bảng** | `[CODE] actions.ts:100` vs `lich-ca/_actions.ts:80,87` | Trung bình — **sẽ nặng khi mở cơ sở mới** |
| **DG-25** | **Không có khung cho cơ sở nhượng quyền.** Cây tổ chức đã có loại `FRANCHISE`/`PARTNER` nhưng chấm công vẫn bám `centerId` | `[CODE] prisma/schema.prisma:286-293` (enum `OrgUnitType`; `PARTNER` ở `:291`, `FRANCHISE` ở `:292`) | Cao với định hướng mở rộng |
| **DG-26** | **Nhân viên Hội sở (`User.centerId` rỗng) tạo bản ghi ĐĂNG KÝ CA với cơ sở rỗng** ⇒ **vô hình** với quản lý cấp cơ sở. Còn bản ghi QUÉT thì **luôn có cơ sở** vì lấy từ mã QR đã được xác thực chữ ký — chính chỗ này là nguồn lệch của DG-24 | `[CODE] lich-ca/_actions.ts:80,87` (`centerId: session.user.centerId`, có thể rỗng) vs `actions.ts:100` (lấy `centerId` từ mã QR, đã `verifyQrToken` ở `:46`) | Trung bình |
| **DG-27** | **Nhãn "Ngoài vùng" là mã chết.** Ngoài bán kính bị chặn cứng, không ghi bản ghi nào ⇒ cột `withinGeofence` trên thực tế **luôn bằng true**, nhánh cảnh báo trong giao diện không bao giờ chạm tới | `[CODE] actions.ts:70-76` vs `lib/work-schedule.ts:107` | Thấp–trung bình |
| **DG-28** | **Ranh giới "ngày" tính theo giờ máy chủ.** Vercel chạy giờ quốc tế, không thấy khai múi giờ ⇒ mốc "hôm nay" của cơ chế chống trùng có thể là 07:00 giờ Việt Nam | `[CODE] actions.ts:80-83`; `vercel.json` không có khai múi giờ | Trung bình |
| **DG-29** | **Checklist cơ sở là 11 cột boolean cứng** — thêm/bớt một mục phải sửa cấu trúc dữ liệu | `[CODE] prisma/schema.prisma:4043-4054`; `lib/center-checklist.ts:3-18` | Trung bình |
| **DG-30** | **Duyệt 1 cấp, không hạn xử lý, không uỷ quyền, không leo cấp.** Quản lý nghỉ ⇒ yêu cầu treo | `[CODE] chinh-cong/_actions.ts:133-201` | Trung bình |
| **DG-31** | **Gửi đơn từ không kiểm tra quyền** (chỉ cần đã đăng nhập) | `[CODE] app/(teacher)/teacher/don-tu/_actions.ts:37-39` | Trung bình |
| **DG-32** | **Giáo viên "thuần" có thể không vào được trang check-in.** Trang check-in nằm trong site admin; giáo viên thuần bị đẩy khỏi site admin, và site giáo viên **không có** route check-in | `[CODE] lib/auth/route-policy.ts:454-456, 405-411`; `ls app/(teacher)/teacher/` không có mục chấm công | **Cao — cần kiểm chứng vận hành ngay** `[SUY LUẬN]` |
| **DG-33** | **Cửa sổ 25–28 và cửa sổ nhập lịch chưa được cưỡng chế** — hàm kiểm tra tồn tại nhưng chưa tìm thấy nơi gọi ở tầng hành động | `[CODE] lib/shifts.ts:46-57` vs `lich-ca/_actions.ts`, `duyet-ca/_actions.ts` | Trung bình `[CHƯA KIỂM CHỨNG]` |
| **DG-34** | **Vai trò `TRAINING` (Đào tạo) KHÔNG có quyền tự chấm công.** Danh sách `hr_attendance:checkin` liệt kê đúng 7 vai trò (SUPER_ADMIN, CENTER_MANAGER, HR, SALES_CSM, TEACHER, MARKETING, ACCOUNTANT) — **thiếu `TRAINING`** ⇒ nhân sự Đào tạo không tự chấm công được. `[SUY LUẬN]` nhiều khả năng là sót khi thêm vai trò này ở FL W0, **nhưng chưa ai xác nhận** — không được tự sửa vì đụng ma trận quyền (§7.5) | `[CODE] lib/auth/permissions.ts:355-357` | Cao với nhân sự Đào tạo `[CHƯA KIỂM CHỨNG]` là lỗi hay chủ ý |
| **DG-35** | **Hàm sửa công TRỰC TIẾP là mã chết.** Server action `adjustTimesheetDirect` tồn tại đầy đủ (có kiểm tra dữ liệu, có ghi nhật ký) nhưng **quét toàn repo ra 0 nơi gọi** ⇒ đường sửa công duy nhất đang dùng là qua yêu cầu chỉnh công. Rủi ro: mã không ai chạy thì không ai kiểm, nhưng vẫn là một cửa ghi vào bảng công | `[CODE] app/(admin)/admin/cham-cong/chinh-cong/_actions.ts:213`; không thành phần giao diện nào nhập hàm này | Thấp–trung bình |

---

## 4. PHẦN B — MISA LÀM NHƯ THẾ NÀO

> Toàn bộ mục này lấy từ **tài liệu công khai của MISA** (trang trợ giúp `helpamis.misa.vn` và trang sản phẩm `amis.misa.vn`), truy cập ngày 28/07/2026. Danh sách URL đầy đủ ở Phụ lục §10.2.
> Không có tài liệu nội bộ nào của Sata Robo mô tả MISA Chấm công — repo chỉ có khung tích hợp **kế toán** rỗng (`[FILE] docs/misa-amis-sync.md`), **không liên quan chấm công**.

### 4.1 Danh mục hình thức chấm công của MISA

| # | Hình thức | Nền tảng | Điều kiện áp dụng | Chống gian lận | Nguồn |
|---|---|---|---|---|---|
| 1 | Máy chấm công vân tay / khuôn mặt / thẻ | Phần cứng | Máy tương thích: MITA, ZKTECO, RONALD JACK (kết nối trực tiếp); ACTATEK (cần đăng nhập); Hanet AI | Sinh trắc tại chỗ | `[WEB]` W11 |
| 2 | Nhận diện khuôn mặt trên ứng dụng (mFace) | Di động / máy tính bảng | Nhân viên đăng ký ảnh trước; HR kiểm tra qua *"Kiểm tra tình trạng hình ảnh"* | AI phân tích điểm khuôn mặt | `[WEB]` W1, W15, W18 |
| 3 | Định vị GPS | **Chỉ ứng dụng di động** | Khai danh mục địa điểm có vĩ độ/kinh độ; đặt bán kính — MISA **khuyến nghị 300–500 m** | ⚠️ Tài liệu MISA **không đề cập** chống giả mạo vị trí | `[WEB]` W1, W3 |
| 4 | Mã QR | Ứng dụng di động | HR tạo mã **theo đơn vị**; nhân viên phải được phân quyền; phải quét **đúng mã đơn vị mình** | **QR tĩnh**: in ra giấy, MISA tự nhận xét *"dễ bị gian lận"* · **QR động**: mã **tự làm mới mỗi 3–5 giây**, cần máy tính/máy tính bảng hiển thị | `[WEB]` W4 |
| 5 | Wi-Fi / BSSID | **Chỉ ứng dụng di động** | Khai tên Wi-Fi + **BSSID** của điểm phát (ví dụ trong tài liệu: `CA:14:44:0B:A8:66`) | Ràng buộc theo hạ tầng mạng nội bộ | `[WEB]` W1, W17 |
| 6 | Không xác thực | Web / di động | Nhân viên chỉ cần vào ứng dụng bấm chấm công | ❌ không có | `[WEB]` W1 |
| 7 | Chứng từ / ảnh minh chứng | Web / di động | Nhân viên tải ảnh làm bằng chứng (ảnh họp trực tuyến, ảnh với khách hàng, ảnh nơi làm việc) | Hậu kiểm bằng mắt người | `[WEB]` W1 |
| 8 | Quản lý duyệt | Web / di động | Bản ghi kèm dữ liệu xác thực đẩy tới quản lý trực tiếp phê duyệt | Người duyệt chịu trách nhiệm | `[WEB]` W1 |
| 9 | Chấm công hộ | Di động | Cho doanh nghiệp có nhân sự không tự chấm được (MISA nêu ví dụ xây dựng, thi công). HR khai người quản lý + danh sách nhân viên được chấm hộ. **3 cách**: quét khuôn mặt nhân viên, quét QR in trên **thẻ nhân viên**, hoặc **nhập giờ thủ công** | Giới hạn theo danh sách + người chấm | `[WEB]` W10 |
| 10 | Theo dự án / công trình | Thủ công | Khai *"Phân ca chấm công theo địa điểm làm việc"*, loại địa điểm = *"Dự án, công trình"*; **cảnh báo khi chấm sai địa điểm** so với địa điểm được phân ca | Cảnh báo hậu kiểm | `[WEB]` W9 |

**Ba ràng buộc quan trọng của MISA:**

> **R1 — "Mỗi nhân viên chỉ được áp dụng 1 hình thức chấm công trên ứng dụng"** (nguyên văn `[WEB]` W1). Doanh nghiệp có thể áp **khác nhau theo phòng ban hoặc theo nhân viên**, nhưng **một người không dùng song song 2 hình thức trên ứng dụng**.
> ⚠️ Điều này **mâu thuẫn bề mặt** với trang QR (`[WEB]` W4) vốn nói QR *"có thể kết hợp với các hình thức chấm công khác"*. `[SUY LUẬN]` cách hiểu hợp lý: R1 áp cho hình thức **xác thực trên ứng dụng**, còn "kết hợp" là kết hợp với **máy chấm công phần cứng** (kênh khác). **`[CHƯA KIỂM CHỨNG]` — cần MISA xác nhận.**

> **R2 — GPS / Wi-Fi / khuôn mặt CHỈ chạy trên ứng dụng di động, không chạy trên web** `[WEB]` W1.

> **R3 — Chấm công theo dự án/công trình CHỈ hỗ trợ chấm công thủ công**, không hỗ trợ Wi-Fi, GPS hay máy tính bảng `[WEB]` W9. Đáng chú ý vì đây chính là kịch bản gần nhất với "giáo viên dạy theo lớp", và **MISA không giải bằng GPS**.

### 4.2 Danh mục ca làm việc của MISA `[WEB]` W5

| Nhóm tham số | Nội dung |
|---|---|
| Thông tin chung | Tên ca · **Mã ca** (viết tắt, **không trùng**) · **Đơn vị áp dụng** (theo cơ cấu tổ chức) |
| Thời gian | Giờ bắt đầu · Giờ kết thúc · **Giờ nghỉ giữa ca** · **Khung giờ chấm công** = *"khoảng thời gian nhân viên được phép chấm công"* |
| Tính công | Giờ công · Ngày công · **Hệ số hưởng lương** theo Ngày thường / Ngày nghỉ / Ngày lễ · Nghỉ bù |
| Nâng cao | Quy định **đi muộn / về sớm và phạt** · Quy định **làm thêm giờ** · **Công ăn ca** · **Công điều động** · Tuỳ chọn *"nếu không có giờ vào/ra thì bị trừ công"* |
| Ràng buộc | Hệ số hưởng lương *"không được để trống và phải nhập số > 0"* · Có thể thiết lập **riêng cho từng ngày lễ** |

**Ca linh hoạt** `[WEB]` W8: số công chuẩn đặt **theo ngày** (ví dụ 8 giờ/ngày) hoặc **theo tháng** (ví dụ 200 giờ/tháng). Khi không đủ số giờ chuẩn, tổ chức chọn 1 trong 3 quy tắc: (a) vẫn tính đủ công, (b) chỉ tính giờ thực tế, (c) **dùng giờ làm thêm bù** cho tới khi đạt chuẩn. Khi vượt: tính theo thực tế hoặc chặn trần. Hệ thống **tách riêng giờ trong ca và giờ làm thêm** để phục vụ tính lương. Có tuỳ chọn **không tính đi muộn/về sớm** khi dùng giờ linh hoạt.

**Số công chuẩn & tự động chấm công** `[WEB]` W2: có khái niệm *"nhân viên tự động chấm công"* — quy tắc tính công tự động cho người **không cần chấm công hằng ngày (như lãnh đạo)**, áp theo **đơn vị / vị trí công việc / toàn công ty**. Có **cảnh báo khi phân ca vượt số công chuẩn**, và quy tắc riêng cho **nhân viên không làm đủ tháng**.

**Ngày lễ**: MISA có **danh mục ngày lễ tập trung**; khi khai báo ca, HR *"có thể chọn thiết lập riêng cho từng ngày lễ"* và chương trình hiển thị danh sách ngày lễ đã khai `[WEB]` W5.

### 4.3 Phân ca / đăng ký ca `[WEB]` W6

Quy trình 3 bước MISA công bố:
1. **HR bật tính năng**: *Thiết lập → Quy định chấm công →* bật *"Cho phép nhân viên đăng ký ca"*, rồi phân quyền cho quản lý ở mục **Quản lý đăng ký ca**.
2. **Quản lý hoặc HR tạo bảng đăng ký ca**: đặt **thời hạn đăng ký** + chọn danh sách nhân viên tham gia.
3. **Nhân viên đăng ký** trong mục *"Yêu cầu đăng ký ca"*, **trong thời hạn cho phép**; quá hạn thì *"chỉ quản lý/HR có quyền chỉnh sửa"*.

Sau khi tạo bảng: **sửa được** tên bảng, thời hạn, danh sách nhân viên; **không sửa được** thời gian áp dụng (phải xoá tạo lại hoặc tạo bảng bổ sung). Quản lý có quyền **tạo yêu cầu đăng ký ca thay cho nhân viên** và **duyệt lịch ca** nhân viên gửi lên `[WEB]` W15, W16.

`[CHƯA KIỂM CHỨNG]` Tài liệu đọc được **không mô tả** cơ chế **ca xoay theo chu kỳ** hay phân ca theo mẫu lặp. Không kết luận là MISA không có — chỉ là chưa tìm thấy tài liệu.

### 4.4 Đơn từ — danh sách ĐÓNG, 8 loại `[WEB]` W7

| # | Loại đơn |
|---|---|
| 1 | Đơn xin nghỉ |
| 2 | Đơn đăng ký đi muộn, về sớm |
| 3 | Đơn đăng ký làm thêm |
| 4 | Đơn đăng ký làm việc từ xa |
| 5 | Đơn đề nghị đi công tác |
| 6 | Đơn đề nghị cập nhật công |
| 7 | Đơn đề nghị đổi ca |
| 8 | **Phê duyệt chấm công** |

> ⚠️ **Ràng buộc cứng, nguyên văn `[WEB]` W7:** *"Phần mềm AMIS Chấm công **không hỗ trợ tạo** thêm loại đơn mới"*.

**Tuỳ chỉnh được** (nhưng không tạo mới được): bỏ bớt trường không cần, đổi thứ tự hiển thị, **đặt trường bắt buộc** `[WEB]` W7.

**Quy trình 4 bước** `[WEB]` W7: (1) nhân viên lập đơn — **hoặc HR lập hộ**; (2) quản lý duyệt; (3) HR theo dõi trạng thái *Chờ duyệt / Đã duyệt / Từ chối*; (4) **HR cập nhật kết quả lên bảng chấm công**.

**Duyệt nhiều cấp:** MISA cho tuỳ chỉnh quy trình duyệt theo từng loại đơn — ví dụ *"đơn xin nghỉ có thể qua 2 cấp duyệt: quản lý trực tiếp rồi tới giám đốc"* `[WEB]`.

Có xử lý case pháp lý đặc thù: *"lao động nữ được nghỉ 60 phút/ngày trong thời gian nuôi con dưới 12 tháng theo luật"* `[WEB]`. Và tuỳ chọn **hiển thị đơn đi muộn/về sớm trên bảng công chi tiết dù không ảnh hưởng tới công** `[WEB]`.

### 4.5 Bảng công, chốt công, chuyển lương

Quy trình tổng thể MISA công bố `[WEB]` W12:

```
1. Thiết lập kết nối (máy chấm công + các ứng dụng AMIS HRM khác)
2. Cấu hình hệ thống (vai trò, người dùng, quy định chung)
3. Quy định chấm công
4. Thiết lập nhân viên (đồng bộ danh sách)
5. Cấu hình chế độ (nghỉ, làm thêm, làm đơn, công tác)
6. Chấm công từ xa (thiết lập hình thức web/di động)
7. Lập bảng chấm công (tổng hợp dữ liệu)
8. Xác nhận và CHỐT CÔNG
9. Chuyển sang tiền lương (gửi dữ liệu đến AMIS Tiền lương)
```

Chi tiết bổ sung:
- **Bảng chấm công chi tiết** — theo dõi giờ làm, nghỉ, đi muộn, dữ liệu chấm công khác `[WEB]` W16.
- **Tổng hợp công** — *"giúp HR lập bảng chấm công chi tiết hàng tháng"*; **tuỳ chỉnh bảng tổng hợp với công thức tính từ giờ ca** `[WEB]` W16.
- **Gửi bảng công để nhân viên xác nhận** `[WEB]` W15.
- **Bổ sung thông tin đơn và địa điểm chấm công trên bảng công chi tiết**; nếu **địa điểm chấm khác địa điểm được phân ca → hệ thống cảnh báo** `[WEB]` W9.
- **Xuất khẩu** danh sách nhân viên toàn bộ hoặc chọn lọc `[WEB]` W14; mẫu **in phiếu công** `[WEB]` W15.

### 4.6 Thiết lập hệ thống & đa đơn vị `[WEB]` W13, W14

| Mục | Nội dung |
|---|---|
| Email thông báo | *"Thiết lập cấu hình mail cho từng đơn vị để gửi các loại email thông báo"* |
| Nhân sự quản lý đơn | Chỉ định nhân sự **tại từng đơn vị** nhận thông báo khi nhân viên nộp/duyệt đơn |
| Định dạng số | Dấu phân cách hàng nghìn, dấu thập phân |
| **Nhật ký truy cập** | *"Cho phép theo dõi toàn bộ lịch sử thao tác với các dữ liệu"* |
| Khác | Quy định làm đơn · Phân quyền/vai trò · Đơn vị/chi nhánh · **Kỳ công** · Loại đơn từ |

**Thiết lập nhân viên** `[WEB]` W14: đồng bộ từ hệ thống nhân sự chính, sau đó **tự đồng bộ**; hai trường bắt buộc bổ sung là **Mã chấm công** (mã trên máy chấm công) và **Số ngày phép năm** (*"thường là 12 ngày"*); lọc theo trạng thái làm việc hoặc theo cơ cấu tổ chức; cập nhật lẻ hoặc **nhập khẩu hàng loạt**.

**Đa chi nhánh:** MISA quảng bá *"Tự động tổng hợp và xử lý bảng công từ nhiều chi nhánh"* `[WEB]` W15.

> `[CHƯA KIỂM CHỨNG]` **Không tìm được tài liệu công khai mô tả chi tiết ma trận "ai xem được dữ liệu của ai"** trong MISA. Chỉ xác nhận được là **có** khái niệm phân quyền theo đơn vị/cơ cấu tổ chức và thiết lập theo từng đơn vị.

### 4.7 Tích hợp

- **AMIS Tiền lương** — liên kết tự động; là bước 9 của quy trình `[WEB]` W12, W15.
- **BHXH, Thuế thu nhập cá nhân** `[WEB]` W15.
- **API mở cho kết nối bên ngoài** `[WEB]` W15.
- **Máy chấm công**: công cụ `AMISTimesheetAgent_Setup.exe` (Windows), thêm máy theo **IP + cổng 4370 + mã kết nối**, đồng bộ danh sách nhân viên, **lịch đồng bộ định kỳ**, **sao lưu tự động**, **xoá dữ liệu trên máy sau khi đồng bộ** `[WEB]` W11. Ngoài ra có nhắc **ZKBio Time** và **UBio Alpeta** `[WEB]` W16.

### 4.8 MISA giải các đối tượng đặc thù thế nào

| Đối tượng | Cách MISA giải | Nguồn |
|---|---|---|
| Nhân viên đi thị trường / ngoài văn phòng | **GPS** với địa điểm linh hoạt (ghi nhận vị trí hiện tại vào lịch sử, HR xem lại và **có thể yêu cầu xác thực bổ sung**) + **ảnh minh chứng** | W1, W3, W15 |
| Nhân sự công trường / không tự chấm được | **Chấm công hộ** + **chấm công theo dự án, công trình** | W9, W10 |
| Lãnh đạo / người không chấm hằng ngày | **"Nhân viên tự động chấm công"** theo đơn vị / vị trí công việc / toàn công ty | W2 |
| **Giáo viên dạy theo tiết / theo lớp** | ❌ **KHÔNG TÌM THẤY** tính năng chuyên biệt cho giáo dục trong tài liệu AMIS Chấm công | — |

> ⚠️ **Kết luận quan trọng:** MISA **không có** mô hình chấm công theo tiết/theo lớp cho giáo viên. `[SUY LUẬN]` thứ gần nhất là *"chấm công theo dự án, công trình"* (ánh xạ *dự án ↔ lớp học*), nhưng mô hình đó của MISA **chỉ chấm công thủ công, không GPS/Wi-Fi** (ràng buộc R3). ⇒ **Không thể bê nguyên MISA để giải bài toán giáo viên của Sata Robo.**

---

## 5. PHẦN C — BẢNG ĐỐI CHIẾU (GAP)

> Cột "Quyết định đề xuất" là **đề xuất của BA**, chưa được ai duyệt. Ban giám đốc chốt ở PHẦN G.
> `LẤY CỦA MISA` = bê mô hình MISA · `GIỮ CỦA SATA` = giữ nguyên cách đang làm · `LAI GHÉP` = lấy khung MISA nhưng sửa cho vừa trung tâm đào tạo · `BỎ` = không làm.

### 5.1 Nhóm 1 — Phương thức chấm công

| Hạng mục | Sata Robo hiện tại | MISA | Chênh lệch | Quyết định đề xuất |
|---|---|---|---|---|
| Danh mục phương thức | **Không có khái niệm này.** 1 đường cứng: QR + GPS (DG-01) | **10 hình thức**, khai báo và bật/tắt được | Rất lớn — đây là yêu cầu trung tâm | **LẤY CỦA MISA** (khung danh mục) — xem D-1 |
| Phạm vi áp dụng phương thức | Không có | Áp theo **đơn vị / phòng ban / nhân viên** | Lớn | **LAI GHÉP** — 3 cấp: hệ thống → đơn vị → cá nhân, theo cây OrgUnit chứ không theo "phòng ban" phẳng |
| Số phương thức một người được dùng | 1 (vì chỉ có 1) | **Đúng 1 trên ứng dụng** (ràng buộc R1) | Bằng nhau về kết quả, khác về lý do | **BỎ ràng buộc của MISA** — Sata Robo cần **kết hợp QR + GPS trong một lần chấm** và cần **dự phòng khi phương thức chính hỏng** (xem D-4). Cần chốt ở CH-02 |
| QR | **Tĩnh, không hết hạn, in dán tại quầy** (DG-16) | Có cả **QR tĩnh** và **QR động 3–5 giây** | MISA hơn về chống gian lận | **GIỮ CỦA SATA làm mặc định**, bổ sung **QR động là tuỳ chọn bật theo cơ sở** — không ép, vì QR động cần màn hình luôn bật (chi phí thiết bị mỗi cơ sở) |
| GPS geofence | Bán kính mặc định **100 m**, chặn cứng khi ngoài vùng | Khuyến nghị **300–500 m**, ghi nhận vị trí rồi **HR hậu kiểm** | Sata chặt hơn nhưng cứng nhắc hơn | **LAI GHÉP** — giữ chặn cứng làm mặc định, **thêm chế độ "cho qua + gắn cờ chờ duyệt"** cấu hình được theo phương thức (D-1) |
| Cơ sở chưa khai toạ độ | **Bỏ qua geofence hoàn toàn, âm thầm** (DG-17) | Không áp dụng (địa điểm là bắt buộc khi bật GPS) | Sata có lỗ hổng | **LẤY CỦA MISA** — bật GPS thì **bắt buộc** có toạ độ; thiếu ⇒ chặn bật, cảnh báo trên màn hình cấu hình |
| Chống giả mạo vị trí | **Không có** | **Tài liệu MISA không đề cập** | Cả hai đều trống | **KHÔNG COPY ĐƯỢC** — xử lý bằng nghiệp vụ: kết hợp nhiều phương thức + hậu kiểm + cảnh báo bất thường (D-4, QT-14) |
| Wi-Fi / BSSID | Không có | Có, chỉ trên di động | MISA hơn | **LẤY CỦA MISA** ở mức khái niệm, ưu tiên thấp (P2) — rẻ, chính xác trong nhà |
| Ảnh minh chứng | Không có | Có | MISA hơn | **LẤY CỦA MISA** (P2) — dùng cho công tác / dạy điểm lẻ |
| Chấm công hộ / quản lý xác nhận | Có màn hình duyệt chỉnh công `/cham-cong/chinh-cong` (`[CODE] chinh-cong/_components/review-row.tsx:7` gọi `reviewAdjustmentRequest`); riêng đường sửa **TRỰC TIẾP** `adjustTimesheetDirect` (`[CODE] chinh-cong/_actions.ts:213`) **không có giao diện nào gọi — mã chết** (DG-35). Cả hai đều không được coi là "phương thức chấm công" | **Hình thức riêng**, 3 cách, có danh sách người được chấm hộ | MISA hơn rõ | **LẤY CỦA MISA** (P1) — cần cho tình huống điện thoại hỏng, mất mạng, và làm **phương án thay thế bắt buộc** cho người từ chối GPS (yêu cầu pháp lý, PHẦN E) |
| Sinh trắc học (vân tay / khuôn mặt) | **Không có dòng mã nào** | Có (máy phần cứng + mFace) | MISA hơn | 🔴 **NGOÀI PHẠM VI theo Doc 15** — blueprint liệt kê "sinh trắc học" trong danh mục **đã loại khỏi core**, và ở một trong hai chỗ **không giới hạn đối tượng** (xem §5.1-bis). Không phải "TẮT mặc định rồi bật khi được duyệt": muốn mở phải **sửa Doc 15 §0 bằng văn bản** — đưa vào **CH-11** |
| Máy chấm công phần cứng | Không có | Có, kèm công cụ đồng bộ | MISA hơn | **BỎ ở giai đoạn này** — quy mô hiện tại chưa cần `[SUY LUẬN]`. Nếu máy dùng **vân tay** thì rơi vào ràng buộc sinh trắc ở dòng trên (CH-11); máy dùng **thẻ từ** thì không |
| AI camera nhận diện | Không có | (MISA có mFace) | — | **BỎ VĨNH VIỄN** — nằm trong phạm vi đã loại của blueprint. ⚠️ Lưu ý: **nhận diện khuôn mặt trên điện thoại (mFace) về bản chất cùng loại dữ liệu** với dòng này (đặc trưng sinh trắc khuôn mặt), khác nhau ở thiết bị thu chứ không khác ở loại dữ liệu — nên không được xử lý như hai hạng mục có mức ràng buộc khác nhau |

### 5.1-bis Sinh trắc học — Doc 15 nói gì, và chỗ Doc 15 mơ hồ

> Mục này tồn tại vì §5.1 và §6.6 từng đưa PT-11/PT-12 vào danh mục với đường mở "chỉ cần Ban giám đốc phê duyệt bằng văn bản". **Đó là cách đọc sai Doc 15.**

**Trích nguyên văn hai chỗ của blueprint** (`[FILE] Document/2-architecture-design/15-final-architecture-blueprint.md`):

| Vị trí | Nguyên văn | Có kèm chữ "học sinh" không? |
|---|---|---|
| `:34` — bảng "Đã LOẠI khỏi core (không đưa lại)", hàng *Pháp lý dữ liệu trẻ em* | *"AI camera/face recognition, phân tích sức khỏe, **sinh trắc học**, geofencing/IoT/định vị **học sinh**"* — kèm cột thay thế: *"Geofence CHỈ cho nhân viên (R5)"* | Chữ "học sinh" đứng **cuối chuỗi**, gắn trực tiếp vào "định vị"; **không rõ có phủ ngược lên "sinh trắc học" hay không** |
| `:1081` — dòng chốt phạm vi | *"KHÔNG đưa lại vào core: AI camera, **sinh trắc học**, định vị học sinh, Web3/NFT/blockchain, marketplace, student login riêng, online video LMS, AI learning path, AI prediction."* | ❌ **KHÔNG** — ở dòng này "sinh trắc học" đứng riêng, còn "học sinh" chỉ gắn vào "định vị" ⇒ đọc theo mặt chữ là **cấm không giới hạn đối tượng** |

`CLAUDE.md` mục Don'ts lặp lại cùng lệnh cấm: *"KHÔNG lưu giấy tờ tùy thân học viên"*, và blueprint §8.1 ghi *"KHÔNG sinh trắc học/định vị học sinh"*.

⇒ **Doc 15 mơ hồ ở đúng một điểm:** dòng `:34` gợi ý lệnh cấm là để bảo vệ **trẻ em**, còn dòng `:1081` viết như lệnh cấm **toàn bộ**. Hai cách đọc dẫn tới hai khối lượng công việc rất khác nhau. **Tài liệu này KHÔNG tự quyết định cách đọc nào đúng.**

**Ranh giới BA đề xuất — chờ Ban giám đốc chốt ở CH-11:**

| Đối tượng | Đề xuất | Cơ chế mở (nếu Ban muốn mở) |
|---|---|---|
| Sinh trắc của **HỌC SINH** (vân tay, khuôn mặt, giọng nói) | 🔴 **CẤM TUYỆT ĐỐI — không có đường mở.** Đã có kiểm thử cưỡng chế trong mã (§7.2) | Không có. Đề xuất loại này phải bị từ chối ở cửa BA |
| Sinh trắc của **NHÂN VIÊN** (PT-11 vân tay, PT-12 khuôn mặt) | 🔴 **NGOÀI PHẠM VI cho tới khi có quyết định ký** | **Không phải** "phê duyệt bật tính năng". Phải: (1) Ban giám đốc **sửa Doc 15 §0 bằng văn bản** làm rõ lệnh cấm chỉ áp cho học sinh; (2) lập hồ sơ đánh giá tác động riêng (PL-05); (3) có phương án thay thế cho người từ chối (PL-G5) |

⇒ Cho tới khi CH-11 có trả lời, PT-11 và PT-12 trong §6.6 được đánh dấu **"NGOÀI PHẠM VI theo Doc 15"**, **không phải** "giữ chỗ, TẮT mặc định".

### 5.2 Nhóm 2 — Ca làm việc và lịch ca

| Hạng mục | Sata Robo hiện tại | MISA | Chênh lệch | Quyết định đề xuất |
|---|---|---|---|---|
| Khai báo ca | **Enum cứng 3 ca** + giờ trong hằng số mã nguồn (DG-02) | **Danh mục khai báo được**, mã ca không trùng, áp theo đơn vị | Rất lớn | **LẤY CỦA MISA** — ca thành **dữ liệu**, thêm ca = thêm dòng |
| Ca theo cơ sở | Bảng `WorkShiftConfig` có nhưng **chết** (DG-03) | Ca có **đơn vị áp dụng** | Sata có hạ tầng nửa vời | **LẤY CỦA MISA** — nối `WorkShiftConfig` (hoặc bảng kế thừa) vào runtime, **có hiệu lực theo thời gian** để không đổi hồi tố |
| Khung giờ chấm công | **Không có** (DG-18) | Có — *"khoảng thời gian nhân viên được phép chấm công"* | MISA hơn | **LẤY CỦA MISA** |
| Nghỉ giữa ca | Khai báo nhưng không dùng (DG-03) | Là tham số của ca | MISA hơn | **LẤY CỦA MISA** |
| Hệ số hưởng lương theo ngày thường / nghỉ / lễ | Không có | Có, **bắt buộc > 0** | MISA hơn | **LẤY CỦA MISA** — nhưng chỉ cần khi có bảng lương (giai đoạn 4) |
| Ca linh hoạt / số công chuẩn theo tháng | Không có | Có, 3 quy tắc khi thiếu giờ | MISA hơn | **LAI GHÉP** — ưu tiên thấp; trung tâm chạy theo ca cố định là chính |
| "Nhân viên tự động chấm công" (lãnh đạo) | Không có | Có, áp theo đơn vị/vị trí | MISA hơn | **LẤY CỦA MISA** — rẻ, giải được bài toán Ban giám đốc và nhân sự Hội sở |
| Đăng ký ca | Nhân viên tự đăng ký → quản lý duyệt. Cửa sổ 25–28 **chưa cưỡng chế** (DG-33) | HR **bật tính năng** → tạo **bảng đăng ký ca có thời hạn** → nhân viên đăng ký trong hạn; **quá hạn chỉ quản lý/HR sửa** | MISA có khung chặt hơn | **LẤY CỦA MISA** phần "bảng đăng ký ca có thời hạn"; **GIỮ CỦA SATA** phần quota khẩn cấp 3 lần/tháng (MISA không có, và nó đang giải đúng bài toán trung tâm) |
| Chốt lịch ca | **Xuất Excel → sửa tay → nhập đè xoá sạch**, không nhật ký (DG-12) | Duyệt trong hệ thống | MISA hơn rất rõ | **LẤY CỦA MISA** — chuyển duyệt vào trong hệ thống. Excel **chỉ còn là kênh nhập bổ trợ**, có xem trước, có so sánh khác biệt, có nhật ký, không xoá dòng ngoài phạm vi |
| Ca xoay theo chu kỳ | Không có | `[CHƯA KIỂM CHỨNG]` không tìm thấy tài liệu | Không kết luận được | **BỎ khỏi phạm vi** đợt này |

### 5.3 Nhóm 3 — Ghi nhận công trong ngày

| Hạng mục | Sata Robo hiện tại | MISA | Chênh lệch | Quyết định đề xuất |
|---|---|---|---|---|
| Số lượt vào/ra mỗi ngày | **Tối đa 1 + 1** (DG-04) | `[CHƯA KIỂM CHỨNG]` tài liệu không nêu giới hạn; nhưng có ca có nghỉ giữa ca ⇒ `[SUY LUẬN]` nhiều lượt là bình thường | Sata đang mâu thuẫn nội tại | **LẤY CỦA MISA** — cho **nhiều lượt/ngày**, ghép cặp vào–ra theo ca. Chốt ở CH-01 |
| Ghi "chấm bằng cách nào" | **Không có cột nào** | Có (hình thức + địa điểm hiển thị trên bảng công) | MISA hơn | **LẤY CỦA MISA** |
| Cảnh báo chấm sai địa điểm | Chặn cứng, không ghi gì (DG-27) | **Ghi nhận + cảnh báo** để HR hậu kiểm | Khác triết lý | **LAI GHÉP** — hành vi khi thất bại là **tham số của phương thức**: `CHẶN` hoặc `GHI NHẬN + GẮN CỜ CHỜ DUYỆT` |
| Kết quả tính công | **Không lưu**, tính lại mỗi lần mở trang (DG-11) | Có bảng công chi tiết + tổng hợp lưu trong hệ thống | MISA hơn — và đây là chặn cứng cho việc chốt lương | **LẤY CỦA MISA** — phải có bản ghi công theo ngày, đóng băng khi chốt kỳ |
| Ngày lễ tác động vào công | **Không** (DG-15) | Có danh mục ngày lễ tập trung + thiết lập ca riêng theo lễ | MISA hơn | **LẤY CỦA MISA** — dùng lại bảng `Holiday` đã có |

### 5.4 Nhóm 4 — Đơn từ và duyệt

| Hạng mục | Sata Robo hiện tại | MISA | Chênh lệch | Quyết định đề xuất |
|---|---|---|---|---|
| Số loại đơn | **10** | **8, danh sách ĐÓNG**, không tạo thêm được | **Sata vượt MISA 3 loại đặc thù đào tạo** | **GIỮ CỦA SATA** — tuyệt đối không thay bằng danh sách 8 của MISA |
| Đơn "Phê duyệt chấm công" (nhân viên xác nhận bảng công) | **Thiếu** | Có | MISA hơn | **LẤY CỦA MISA** — thêm 1 loại |
| Màn hình duyệt đơn | **Không có** (DG-08) | Có, kèm theo dõi trạng thái | MISA hơn | **LẤY CỦA MISA** |
| Duyệt nhiều cấp | **1 cấp duy nhất** (DG-30) | Tuỳ chỉnh theo từng loại đơn, ví dụ 2 cấp | MISA hơn | **LAI GHÉP** — khung nhiều cấp, nhưng cấu hình mặc định của trung tâm là **1 cấp**; chỉ đơn nghỉ dài ngày mới 2 cấp |
| Đơn duyệt xong tác động vào công | **Không** (DG-07) | Có — bước 4 của quy trình: *"HR cập nhật kết quả lên bảng chấm công"* | MISA hơn — đây là lỗ hổng lớn nhất về nghiệp vụ | **LẤY CỦA MISA**, nhưng **tự động hoá**: đơn duyệt ⇒ sinh bút toán công tương ứng, không để HR gõ tay |
| HR lập đơn hộ nhân viên | Không có | Có | MISA hơn | **LẤY CỦA MISA** (ưu tiên trung bình) |
| Quỹ phép năm | **Không có** | Có — trường **Số ngày phép năm** trên hồ sơ nhân viên | MISA hơn | **LẤY CỦA MISA** |
| Nhân viên không phải giáo viên gửi đơn | **Không có màn hình nào** (DG-23) | Mọi nhân viên | MISA hơn | **LẤY CỦA MISA** — đơn từ là chức năng chung, không riêng site giáo viên |

### 5.5 Nhóm 5 — Bảng công, chốt công, lương

| Hạng mục | Sata Robo hiện tại | MISA | Chênh lệch | Quyết định đề xuất |
|---|---|---|---|---|
| Bảng công chi tiết theo tháng | **Không có** (DG-09) | Có | MISA hơn | **LẤY CỦA MISA** |
| Bảng công tổng hợp | Không có | Có, **tuỳ chỉnh công thức từ giờ ca** | MISA hơn | **LAI GHÉP** — làm bảng tổng hợp cố định trước; công thức tuỳ chỉnh để sau (quá sức so với quy mô) |
| Kỳ công | Không có khái niệm | Có (**Kỳ công** trong thiết lập hệ thống) | MISA hơn | **LẤY CỦA MISA** |
| Chốt công / khoá kỳ | Không có | Bước 8 của quy trình | MISA hơn | **LẤY CỦA MISA** |
| Nhân viên xác nhận bảng công | Không có | Có — *"gửi bảng công để nhân viên xác nhận"* | MISA hơn | **LẤY CỦA MISA** |
| Xuất bảng công / in phiếu công | **Không có** | Có | MISA hơn | **LẤY CỦA MISA** |
| Nối sang tính lương | **Không có** (DG-10) | Bước 9 — gửi sang AMIS Tiền lương | MISA hơn | **LAI GHÉP** — giai đoạn này chỉ làm **đầu ra chuẩn** (bảng công đã chốt, xuất file); việc tính lương nằm ngoài phạm vi, quyết định sau ở CH-09 |
| Nối BHXH / thuế | Không có | Có | MISA hơn | **BỎ khỏi phạm vi** đợt này |

### 5.6 Nhóm 6 — Quản trị, phân quyền, đa đơn vị

| Hạng mục | Sata Robo hiện tại | MISA | Chênh lệch | Quyết định đề xuất |
|---|---|---|---|---|
| Cách ly dữ liệu theo cơ sở | **Ép ở tầng truy vấn** (`scopedDb`), có kiểm thử tự động | Có phân quyền theo đơn vị, `[CHƯA KIỂM CHỨNG]` chi tiết | **Sata có thể mạnh hơn** — cưỡng chế ở tầng dữ liệu, không phụ thuộc cấu hình | **GIỮ CỦA SATA** — tuyệt đối |
| Cấu hình theo đơn vị | Có hạ tầng nhưng **không dùng được** (DG-19) | Thiết lập theo từng đơn vị là chuẩn | MISA hơn về thực thi | **LẤY CỦA MISA** — nối lại tầng ghi đè cấp đơn vị và thêm giao diện |
| Số hành động quyền cho chấm công | **3** | Nhiều mục phân quyền riêng (đăng ký ca, đơn từ, bảng công…) | MISA chi tiết hơn | **LAI GHÉP — nhưng HOÃN.** Thêm hành động quyền mới **đụng thẳng cửa sổ shadow-compare** (PHẦN E). Giai đoạn 1–2 **tái sử dụng 3 hành động cũ** |
| Nhật ký thao tác | Gần như không có (DG-13) | *"Nhật ký truy cập — theo dõi toàn bộ lịch sử thao tác"* | MISA hơn rõ | **LẤY CỦA MISA** — mọi thao tác chạm bảng công phải có nhật ký |
| Email thông báo theo đơn vị | Không có thông báo nào cho chấm công (DG-14) | Cấu hình mail **theo từng đơn vị** + chỉ định người nhận đơn tại đơn vị | MISA hơn | **LẤY CỦA MISA** — dùng lại hàng đợi email đã có |
| Đa chi nhánh / nhượng quyền | Bám `centerId`, chưa có khung nhượng quyền (DG-25) | *"Tổng hợp bảng công từ nhiều chi nhánh"* — nhưng **cùng một pháp nhân** | Bài toán của Sata **khó hơn MISA** (hai pháp nhân) | **KHÔNG COPY ĐƯỢC** — giải theo PHẦN E §7.4, phụ thuộc quyết định R-DP-01 |
| Chấm công cho giáo viên theo lớp | Chưa có (DG-06, DG-32) | **Không có mô hình này** | Cả hai đều trống | **TỰ THIẾT KẾ** — xem D-6. Đây là phần **không có mẫu để theo** |

---

## 6. PHẦN D — BA MỚI (TRẠNG THÁI ĐÍCH)

> Mô tả ở mức **khái niệm và dữ liệu logic**. Không có lược đồ migration, không có mã nguồn, không vẽ giao diện chi tiết — nhưng đủ rõ để đội kỹ thuật ước lượng khối lượng.

### 6.1 (a) Các khái niệm nghiệp vụ mới

| # | Khái niệm | Định nghĩa | Vì sao cần |
|---|---|---|---|
| K-01 | **Phương thức chấm công** | Một cách để nhân viên chứng minh sự có mặt (quét QR, định vị, Wi-Fi nội bộ, ảnh minh chứng, quản lý xác nhận…). Là **một dòng dữ liệu**, không phải một nhánh mã nguồn | Yêu cầu trung tâm — DG-01 |
| K-02 | **Hồ sơ áp dụng phương thức** | Bản khai "phương thức X được bật cho đối tượng Y tại đơn vị Z, với các tham số P, từ ngày D1 đến D2" | Mở cơ sở mới = thêm dữ liệu — DG-01, DG-19 |
| K-03 | **Điểm chấm công** | Một vị trí vật lý hợp lệ để chấm công: cơ sở, điểm dạy lẻ, hoặc "địa điểm linh hoạt". Mang toạ độ, bán kính, mã QR, danh sách Wi-Fi | Tách "nơi chấm" khỏi "cơ sở quản lý" — cần cho giáo viên dạy nhiều nơi (DG-24) |
| K-03b | **Thiết bị chấm công** *(giữ chỗ)* | Máy chấm công phần cứng hoặc màn hình hiển thị QR động, gắn với một Điểm chấm công | Để danh mục không phải sửa lại khi mua máy |
| K-04 | **Lượt chấm** | Một lần nhân viên thao tác chấm (vào, ra, bắt đầu nghỉ, kết thúc nghỉ). Ghi rõ: phương thức nào, điểm nào, dữ liệu xác thực gì, kết quả xác thực ra sao | Thay bản ghi hiện tại vốn không ghi phương thức, và cho phép nhiều lượt/ngày (DG-04) |
| K-05 | **Ca làm việc** *(nâng cấp)* | Dòng dữ liệu khai báo: mã, tên, giờ vào/ra, nghỉ giữa ca, **khung giờ chấm công**, dung sai, hệ số công, đơn vị áp dụng, **hiệu lực từ ngày nào** | DG-02, DG-03, DG-18 |
| K-06 | **Lịch phân ca** | Bảng "ai làm ca nào ngày nào" đã chốt, có trạng thái và có người chốt | Thay quy trình Excel (DG-12) |
| K-07 | **Bảng đăng ký ca** | Đợt mở đăng ký: phạm vi tháng, danh sách nhân viên tham gia, **hạn đăng ký**, trạng thái | Lấy của MISA — cưỡng chế được cửa sổ 25–28 (DG-33) |
| K-08 | **Bản ghi công ngày** | Kết quả tính công của một người trong một ngày: giờ chuẩn, giờ thực, giờ làm thêm, các nhãn, các đơn đã áp. **Được lưu**, không tính lại tại chỗ | DG-11 — chặn cứng cho việc chốt lương |
| K-09 | **Kỳ công** | Khoảng thời gian tính công (thường là tháng) với vòng đời: Đang mở → Đang chốt → Đã chốt → Đã khoá | DG-09 |
| K-10 | **Bảng công kỳ** | Tổng hợp theo kỳ của một người: tổng ngày công, giờ công, giờ làm thêm, số ngày nghỉ theo từng loại, số lần muộn/sớm | DG-09 |
| K-11 | **Xác nhận bảng công** | Hành vi nhân viên xác nhận (hoặc phản hồi) bảng công kỳ của mình trước khi khoá | Lấy của MISA — loại đơn thứ 8 |
| K-12 | **Đơn từ** *(nâng cấp)* | Giữ 10 loại hiện có + thêm "Xác nhận bảng công". Bổ sung: **quy trình duyệt**, và **quy tắc tác động lên công** khi duyệt | DG-05, DG-06, DG-07, DG-08 |
| K-13 | **Quỹ phép** | Số ngày phép năm được cấp, đã dùng, còn lại, theo từng người từng năm | Lấy của MISA |
| K-14 | **Ngày nghỉ lễ** *(nâng cấp)* | Dùng lại bảng `Holiday` đã có, nhưng **đưa vào công thức tính công** | DG-15 |
| K-15 | **Cờ bất thường** | Đánh dấu một lượt chấm hoặc một bản ghi công cần người xem lại (ngoài vùng, sai điểm, chấm hộ, ngoài khung giờ, thiết bị lạ) | Thay việc chặn cứng bằng ghi nhận + hậu kiểm |
| K-16 | **Nhật ký chấm công** | Mọi thao tác chạm dữ liệu công: ai, lúc nào, sửa gì, từ giá trị nào sang giá trị nào, lý do | DG-13, DG-22 |

### 6.2 (b) Luồng nghiệp vụ mới — từng bước

**Luồng 1 — Thiết lập (làm một lần, sau đó chỉ sửa khi có thay đổi)**

| Bước | Ai làm | Việc | Điều kiện hoàn thành |
|---|---|---|---|
| 1.1 | SUPER_ADMIN | Khai **danh mục phương thức chấm công** ở cấp hệ thống: bật/tắt từng phương thức, đặt tham số mặc định | Ít nhất "QR cố định" và "Định vị GPS" ở trạng thái bật |
| 1.2 | SUPER_ADMIN / người phụ trách dữ liệu | Khai **điểm chấm công** cho từng cơ sở: toạ độ, bán kính, mã QR | Không được bật GPS cho đơn vị chưa có toạ độ (vá DG-17) |
| 1.3 | SUPER_ADMIN | Khai **ca làm việc** theo đơn vị, có ngày hiệu lực | Ba ca hiện tại được nhập đúng giờ đang chạy (07:30–11:30 / 13:30–17:30 / 17:00–21:00), dung sai 5 phút |
| 1.4 | SUPER_ADMIN / HR | Lập **hồ sơ áp dụng**: phương thức nào cho nhóm nào ở đơn vị nào | Mọi nhân viên đang hoạt động đều rơi vào ít nhất một hồ sơ áp dụng |
| 1.5 | HR | Khai **kỳ công** cho năm, khai **ngày nghỉ lễ**, khai **quỹ phép năm** | |

**Luồng 2 — Lịch ca theo tháng**

| Bước | Ai | Việc |
|---|---|---|
| 2.1 | HR / Quản lý cơ sở | Mở **bảng đăng ký ca** cho tháng sau: chọn nhân viên tham gia, đặt hạn đăng ký (mặc định ngày 25–28) |
| 2.2 | Hệ thống | Nhắc nhân viên khi mở bảng, nhắc lại trước hạn 1 ngày |
| 2.3 | Nhân viên | Đăng ký ca. Có **áp dụng mẫu tuần / sao chép tuần** để không phải bấm 26 lần |
| 2.4 | Quản lý cơ sở | Xem lưới đăng ký **trong hệ thống**, sửa trực tiếp từng ô, thấy chỗ trống và chỗ vượt định biên |
| 2.5 | Quản lý cơ sở | Bấm **Chốt lịch tháng** ⇒ lịch chuyển sang trạng thái chính thức, ghi nhật ký ai chốt lúc nào |
| 2.6 | (bổ trợ) | Nhập Excel vẫn dùng được, nhưng **bắt buộc qua bước xem trước + bảng so sánh khác biệt**, và **không xoá** dòng nằm ngoài phạm vi file |

**Luồng 3 — Chấm công hằng ngày**

| Bước | Ai | Việc |
|---|---|---|
| 3.1 | Nhân viên | Mở màn hình chấm công (hoặc quét QR) |
| 3.2 | Hệ thống | Xác định **các phương thức được phép** cho người này tại thời điểm và địa điểm này (theo hồ sơ áp dụng) |
| 3.3 | Hệ thống | Kiểm tra **khung giờ chấm công**; ngoài khung ⇒ báo rõ lý do, cho phép chuyển sang đường xin xác nhận |
| 3.4 | Hệ thống | Chạy **chuỗi xác thực** theo thứ tự ưu tiên đã cấu hình (xem D-4) |
| 3.5 | Hệ thống | Ghi **Lượt chấm** kèm: phương thức đã dùng, điểm chấm, kết quả từng lớp xác thực, cờ bất thường nếu có |
| 3.6 | Hệ thống | Tính lại **Bản ghi công ngày** của người đó |
| 3.7 | Quản lý cơ sở | Cuối ngày xem danh sách **cờ bất thường** và xử lý |

**Luồng 4 — Sửa sai và đơn từ**

| Bước | Ai | Việc |
|---|---|---|
| 4.1 | Nhân viên | Gửi đơn (nghỉ phép / tăng ca / công tác / làm từ xa / chỉnh công / đổi ca / đổi lớp dạy / dạy thay / nghỉ buổi dạy / đi muộn-về sớm). Với đơn chỉnh công: **nhập giờ có cấu trúc**, không phải văn bản tự do (vá DG-20) |
| 4.2 | Hệ thống | Định tuyến tới người duyệt theo **quy trình của loại đơn đó** (1 hoặc 2 cấp) |
| 4.3 | Người duyệt | Duyệt / từ chối / yêu cầu bổ sung. Có hạn xử lý và có nhắc |
| 4.4 | Hệ thống | Đơn được duyệt ⇒ **tự sinh tác động lên bản ghi công ngày** theo quy tắc của loại đơn (vá DG-07) |
| 4.5 | Hệ thống | Ghi nhật ký: đơn nào, ai duyệt, tác động gì |

**Luồng 5 — Chốt kỳ và đầu ra**

| Bước | Ai | Việc |
|---|---|---|
| 5.1 | Hệ thống | Hết kỳ ⇒ chuyển kỳ sang **Đang chốt**, tổng hợp **Bảng công kỳ** cho từng người |
| 5.2 | Hệ thống | Gửi bảng công cho nhân viên **xác nhận**, đặt hạn phản hồi |
| 5.3 | Nhân viên | Xác nhận hoặc phản hồi sai lệch (tạo đơn chỉnh công) |
| 5.4 | Quản lý cơ sở / HR | Xử lý hết phản hồi |
| 5.5 | HR | Bấm **Chốt kỳ** ⇒ **đóng băng** số liệu; từ đây mọi sửa đổi phải mở khoá và để lại vết |
| 5.6 | HR / Kế toán | Xuất bảng công kỳ (file bảng tính và bản in ký duyệt) làm đầu vào tính lương |

### 6.3 (c) Quy tắc nghiệp vụ

> Đánh số `QT-xx` để đội kỹ thuật viết tiêu chí nghiệm thu. Quy tắc nào **đang có sẵn** thì ghi rõ để không làm lại.

**Nhóm cấu hình phương thức**

| Mã | Quy tắc |
|---|---|
| QT-01 | Mỗi phương thức chấm công là **một dòng trong danh mục**, có mã, tên, trạng thái bật/tắt, bộ tham số riêng. **Bật/tắt và chỉnh tham số** của phương thức đã có **không được** đòi sửa mã nguồn và không được đòi triển khai lại. ⚠️ **Thêm một LOẠI xác thực mới thì VẪN phải viết mã** — chỉ là viết một bộ kiểm tra cắm vào khung chung, không phải sửa hàm chấm công đang chạy (bảng khối lượng mã ở §6.6) |
| QT-02 | Một phương thức chỉ **có hiệu lực** với một người khi tồn tại **hồ sơ áp dụng** phủ được: (đơn vị của người đó) × (nhóm/chức danh của người đó) × (thời điểm hiện tại nằm trong hiệu lực) |
| QT-03 | Khi nhiều hồ sơ áp dụng cùng phủ một người: **cấp cá nhân thắng cấp đơn vị, cấp đơn vị thắng cấp hệ thống**. Cùng cấp thì bản ghi có hiệu lực muộn hơn thắng |
| QT-04 | Bật phương thức "Định vị GPS" cho một đơn vị **bắt buộc** đơn vị đó đã có ít nhất một **điểm chấm công có toạ độ**. Không đủ điều kiện ⇒ **không cho bật**, hiện cảnh báo (vá DG-17) |
| QT-05 | Phương thức thuộc nhóm **nhạy cảm về dữ liệu cá nhân** (định vị lưu toạ độ thô, sinh trắc) **mặc định TẮT**, và chỉ bật được khi hồ sơ tuân thủ tương ứng đã đánh dấu hoàn thành (xem PHẦN E) |
| QT-06 | Mọi thay đổi danh mục phương thức và hồ sơ áp dụng **bắt buộc nhập lý do** và **ghi nhật ký**. (Cơ chế này **đã có sẵn** cho các khoá cấu hình hệ thống — `[CODE] lib/settings/service.ts:98-130`) |

**Nhóm ghi nhận lượt chấm**

| Mã | Quy tắc |
|---|---|
| QT-07 | Mỗi **Lượt chấm** phải ghi: người, thời điểm, loại lượt (vào / ra / bắt đầu nghỉ / kết thúc nghỉ), **phương thức đã dùng**, **điểm chấm công**, kết quả từng lớp xác thực, và cờ bất thường nếu có |
| QT-08 | **Nhiều lượt trong ngày được phép.** Ghép cặp vào–ra **theo thời gian, không theo ca** (thuật toán đầy đủ ở §6.3-bis); lượt lẻ (vào không có ra) tạo cờ bất thường thay vì làm mất trắng giờ công (vá DG-04) |
| QT-09 | **Chống trùng** ở mức: cùng người + cùng loại lượt + cùng điểm + trong vòng N phút (N cấu hình được, mặc định 2 phút) ⇒ bỏ qua lượt sau, không báo lỗi khó hiểu |
| QT-10 | Ranh giới "một ngày công" tính theo **giờ Việt Nam**, không theo giờ máy chủ (vá DG-28) |
| QT-11 | Lượt chấm **ngoài khung giờ chấm công** của ca ⇒ vẫn ghi nhận, gắn cờ, **không tính vào giờ công** cho tới khi được duyệt |
| QT-12 | Bản ghi tạo bởi **quản lý xác nhận / chấm hộ / chỉnh công** phải phân biệt được rõ ràng ở mức trường dữ liệu, không phải bằng tiền tố chuỗi (vá DG-21) |
| QT-13 | Mã QR **tĩnh** giữ nguyên hành vi hiện tại. Mã QR **động** (nếu bật) có hiệu lực trong cửa sổ thời gian ngắn cấu hình được (mặc định 5 giây, dung sai lệch đồng hồ 30 giây) |
| QT-14 | Hệ thống phải **phát hiện và gắn cờ** các mẫu bất thường: cùng một thiết bị chấm cho nhiều người trong thời gian ngắn; toạ độ trùng khít tuyệt đối nhiều lần; khoảng cách di chuyển bất khả thi giữa hai lượt liên tiếp. **Đây là cảnh báo để người xem, không phải chặn tự động** `[SUY LUẬN — không copy được từ MISA vì MISA không công bố cơ chế chống giả mạo vị trí]` |

### 6.3-bis Thuật toán ghép cặp lượt chấm — đặc tả để nghiệm thu

> Đây là **phần lõi nhất của Giai đoạn 2**. Không có mục này thì không viết được tiêu chí nghiệm thu và không ước lượng được. Toàn bộ mục này là **thiết kế mới** `[SUY LUẬN]`, nhưng ba tình huống dưới đây **đọc thẳng ra từ mã nguồn hiện tại**, không phải giả định.

**Ba tình huống có thật buộc phải có lời giải:**

| # | Tình huống | Bằng chứng |
|---|---|---|
| TH-1 | **Ca chiều và ca tối CHỒNG NHAU 30 phút** — ca chiều 13:30–17:30, ca tối 17:00–21:00 | `[CODE] lib/shifts.ts:10-11` |
| TH-2 | Công thức hiện tại **GỘP các khoảng ca chồng nhau thành một khoảng liên tục** trước khi tính giao — và QT-16 yêu cầu **giữ nguyên** hành vi này | `[CODE] lib/work-schedule.ts:42-56` (`mergeShiftIntervals`) |
| TH-3 | Số lượt vào/ra trong ngày có thể **lẻ và không cân** (3 vào, 2 ra) khi bỏ trần 1+1 | Hệ quả trực tiếp của QT-08 |

⇒ Vì TH-1 + TH-2, **không thể "ghép cặp theo ca"**: khi một người đăng ký cả ca chiều và ca tối, hai ca đã bị gộp thành một khoảng 13:30–21:00, **không còn ranh giới ca để ghép vào**.

**Quy tắc A — Thứ tự và cách ghép (đề xuất chốt):**

| Mã | Quy tắc |
|---|---|
| GC-01 | Lấy **toàn bộ lượt chấm của người đó trong một ngày công**, sắp xếp **theo thời gian tăng dần**. |
| GC-02 | Duyệt tuần tự. Gặp lượt **VÀO** ⇒ mở một cặp đang chờ. Gặp lượt **RA** ⇒ đóng cặp đang chờ gần nhất. **Không xét ca ở bước này.** |
| GC-03 | Gặp lượt **VÀO** khi đã có một cặp đang chờ ⇒ lượt VÀO cũ trở thành **"vào không có ra"**, gắn cờ `THIẾU LƯỢT RA`, và mở cặp mới bằng lượt VÀO mới. |
| GC-04 | Gặp lượt **RA** khi **không** có cặp nào đang chờ ⇒ gắn cờ `RA KHÔNG CÓ VÀO`, **không** sinh cặp. |
| GC-05 | Hết ngày mà còn cặp đang chờ ⇒ gắn cờ `THIẾU LƯỢT RA` cho cặp đó. |
| GC-06 | **Chỉ sau khi đã có danh sách cặp**, mới lấy phần **GIAO** giữa từng cặp và **các khoảng ca đã gộp** (`mergeShiftIntervals` — giữ nguyên công thức hiện tại, đúng QT-16 và QT-22). Tổng giờ công = tổng các phần giao, **đã khử trùng lặp** khi hai cặp cùng phủ một khoảng. |
| GC-07 | **Trần số lượt/ngày: 10 lượt** (5 cặp) `[SUY LUẬN]`. Vượt trần ⇒ vẫn ghi lượt nhưng gắn cờ `VƯỢT TRẦN LƯỢT` để quản lý xem lại; không chặn người dùng (đúng nguyên tắc §6.9). |
| GC-08 | Chống trùng theo QT-09 (cùng người + cùng loại + cùng điểm + trong 2 phút) chạy **trước** GC-01, để lượt bấm nhầm hai lần không phá cấu trúc cặp. |

**Quy tắc B — Xử lý lượt lẻ (cờ sinh ra và hệ quả lên công):**

| Cờ | Khi nào sinh | Hệ quả lên giờ công |
|---|---|---|
| `THIẾU LƯỢT RA` | Có VÀO, không có RA tương ứng | **Không tính giờ cho cặp đó**, nhưng **không xoá dữ liệu**. Vào hộp cờ bất thường (M-12) để quản lý bổ sung qua PT-08 hoặc đơn chỉnh công |
| `RA KHÔNG CÓ VÀO` | Có RA, không có VÀO trước đó | Như trên |
| `VƯỢT TRẦN LƯỢT` | Quá 10 lượt/ngày | Vẫn tính các cặp hợp lệ; gắn cờ để hậu kiểm |
| `NGOÀI KHUNG GIỜ` | Lượt nằm ngoài khung giờ chấm công của ca (QT-11) | Cặp vẫn ghép, nhưng **phần giờ ngoài khung không tính** cho tới khi được duyệt |

**Quy tắc C — Ranh giới ngày công:**

| Mã | Quy tắc |
|---|---|
| GC-09 | Ngày công tính theo **giờ Việt Nam (UTC+7)**, mốc cắt **00:00** (QT-10). |
| GC-10 | Ca dài nhất hiện nay kết thúc **21:00** ⇒ mốc cắt 00:00 **an toàn với mọi ca đang có**. |
| GC-11 | **Ca qua nửa đêm hiện KHÔNG tồn tại và KHÔNG được khai** cho tới khi có quy tắc riêng. Nếu sau này cần: ca qua đêm khai thêm cờ "thuộc ngày công của ngày bắt đầu ca", và mốc cắt của riêng người đó dời sang **giờ kết thúc ca + 4 giờ**. **Chưa thiết kế — nằm ngoài phạm vi đợt này.** |

**Bộ ví dụ nghiệm thu** (ca sáng 07:30–11:30, ca chiều 13:30–17:30, ca tối 17:00–21:00; dung sai 5 phút):

| # | Ca đã duyệt | Các lượt trong ngày | Cặp ghép được | Giờ công kỳ vọng | Cờ |
|---|---|---|---|---|---|
| VD-1 | Sáng | VÀO 07:28 · RA 11:32 | 1 cặp | **4h00** | — |
| VD-2 | Sáng + Chiều | VÀO 07:28 · RA 11:35 · VÀO 13:25 · RA 17:33 | 2 cặp | **8h00** (nghỉ trưa 11:30–13:30 không tính vì hai khoảng ca **rời nhau**, không bị gộp) | — |
| VD-3 | **Chiều + Tối** (chồng 30 phút) | VÀO 13:25 · RA 21:05 | 1 cặp | **7h30** — hai ca gộp thành **13:30–21:00**, không phải 4h+4h=8h | — |
| VD-4 | Chiều + Tối | VÀO 13:25 · RA 16:00 · VÀO 16:50 · RA 21:05 | 2 cặp | **7h20** = (13:30→16:00 = 2h30) + (16:50→21:00 giao với 13:30–21:00 = 4h10) | — |
| VD-5 | Sáng | VÀO 07:28 · VÀO 09:00 · RA 11:32 | 1 cặp (09:00→11:32) + 1 lượt lẻ | **2h30** | `THIẾU LƯỢT RA` cho lượt 07:28 |
| VD-6 | Sáng | VÀO 07:28 (không có RA) | 0 cặp | **0h00** — nhưng **có bản ghi và có cờ**, không mất dữ liệu | `THIẾU LƯỢT RA` |
| VD-7 | Không đăng ký ca | VÀO 08:00 · RA 12:00 | 1 cặp | **0h00** giờ trong ca (không có ca để giao) | `CHƯA ĐĂNG KÝ CA` — giữ nhãn hiện có |

> ⚠️ Bộ 7 ví dụ trên là **bộ kiểm thử tối thiểu** cho QT-08. Đội kỹ thuật phải chạy đủ 7 ca này trước khi báo Giai đoạn 2 xong.
> ⚠️ VD-3 và VD-4 là chỗ **dễ sai nhất** và cũng là chỗ dễ gây tranh chấp công nhất: người làm chiều + tối nhận **7h30 chứ không phải 8h**. **Cần Ban giám đốc / HR xác nhận đây là ý muốn** — nếu muốn trả đủ 8h thì phải **bỏ việc gộp khoảng chồng nhau** (tức bỏ QT-16 và đổi `lib/work-schedule.ts:42-56`), là một thay đổi công thức có tác động hồi tố. Đưa thành câu hỏi riêng **CH-12**.

**Nhóm ca và lịch**

| Mã | Quy tắc |
|---|---|
| QT-15 | Ca làm việc có **ngày bắt đầu hiệu lực**. Sửa giờ ca **không được** làm đổi số liệu công của các ngày đã qua (vá DG-11 và DG-03) |
| QT-16 | Ca chồng giờ nhau vẫn được gộp thành khoảng liên tục khi tính giờ chuẩn (**giữ nguyên hành vi hiện tại** — `[CODE] lib/work-schedule.ts:42-56`) |
| QT-17 | Chỉ **lịch phân ca đã chốt** mới dùng để tính công (**giữ nguyên hành vi hiện tại**) |
| QT-18 | Đăng ký ca chỉ mở trong **hạn của bảng đăng ký ca**. Ngoài hạn: chỉ quản lý/HR sửa được (lấy của MISA, vá DG-33) |
| QT-19 | Đăng ký/đổi ca **sát ngày làm dưới ngưỡng cấu hình** (mặc định 2 ngày) tính là **khẩn cấp**, trừ vào quota tháng (mặc định 3 lần). **Giữ nguyên hành vi hiện tại**, chỉ đưa ngưỡng 2 ngày ra thành tham số (vá phần hằng số của DG-33) |
| QT-20 | Nhập Excel lịch ca **chỉ được** thêm/sửa các dòng có trong file; **không được xoá** dòng nằm ngoài phạm vi file. Bắt buộc màn hình xem trước + bảng so sánh khác biệt + xác nhận + nhật ký (vá DG-12) |

**Nhóm tính công**

| Mã | Quy tắc |
|---|---|
| QT-21 | **Bản ghi công ngày được lưu** sau mỗi lần có dữ liệu mới, kèm **phiên bản bộ tham số** đã dùng để tính (vá DG-11) |
| QT-22 | Giờ công thực = phần giao giữa các cặp vào–ra và các khoảng ca (**giữ nguyên công thức hiện tại**), có trừ nghỉ giữa ca nếu ca khai báo có nghỉ |
| QT-23 | Đi sớm / về muộn ngoài khoảng ca **không tự động thành giờ làm thêm**; muốn tính phải có **đơn tăng ca đã duyệt** |
| QT-24 | **Ngày nghỉ lễ** theo danh mục ⇒ không tính thiếu công, không tính đi muộn (vá DG-15) |
| QT-25 | Đơn đã duyệt sinh tác động lên bản ghi công ngày theo bảng quy tắc riêng của từng loại (xem §6.4) — **tự động, không để HR gõ tay** (vá DG-07) |
| QT-26 | Hệ thống **cảnh báo 4 ngưỡng pháp luật lao động**: 12 giờ/ngày · 48 giờ/tuần · 40 giờ làm thêm/tháng · 200 giờ làm thêm/năm (căn cứ ở PHẦN E §7.3) |
| QT-27 | Kỳ công **Đã chốt** ⇒ bản ghi công trong kỳ **đóng băng**. Sửa phải qua thao tác "mở khoá kỳ" có lý do bắt buộc, có nhật ký, và chỉ SUPER_ADMIN được làm |

**Nhóm đơn từ**

| Mã | Quy tắc |
|---|---|
| QT-28 | Giữ nguyên **10 loại đơn hiện có** + thêm **"Xác nhận bảng công"**. Danh sách loại đơn là **dữ liệu**, không phải enum cứng — nhưng mỗi loại phải khai **quy tắc tác động lên công** |
| QT-29 | Mỗi loại đơn khai được **quy trình duyệt** (1 hoặc nhiều cấp) và **hạn xử lý**. Mặc định trung tâm: 1 cấp; nghỉ trên 3 ngày: 2 cấp |
| QT-30 | Quá hạn xử lý ⇒ nhắc người duyệt; quá hạn gấp đôi ⇒ **leo cấp** lên cấp trên (vá DG-30) |
| QT-31 | **Mọi nhân viên** gửi được đơn, không chỉ giáo viên (vá DG-23). Gửi đơn phải **kiểm tra quyền**, không chỉ kiểm tra đã đăng nhập (vá DG-31) |
| QT-32 | Nghỉ phép trừ vào **quỹ phép năm**; hết quỹ vẫn gửi được đơn nhưng phải chọn loại "nghỉ không lương" |
| QT-33 | HR **lập đơn hộ** nhân viên được, nhưng bản ghi phải ghi rõ người lập ≠ người hưởng |

**Nhóm cách ly và tuân thủ** — xem thêm §6.5 và PHẦN E

| Mã | Quy tắc |
|---|---|
| QT-34 | Mọi bản ghi công mới phải có **đơn vị** xác định. Nhân viên Hội sở gán vào đơn vị Hội sở, **không để trống** (vá DG-26) |
| QT-35 | Nhân viên làm ở nhiều cơ sở: **đơn vị của lượt chấm** lấy theo **điểm chấm công thực tế**, còn đơn vị quản lý nhân sự lấy theo hồ sơ. Hai thứ này **được phép khác nhau** và phải hiển thị cả hai (vá DG-24) |
| QT-36 | **Nhật ký chấm công không được cách ly kém hơn dữ liệu gốc** — phải mang đơn vị và chịu cùng tầng cách ly (vá DG-22) |
| QT-37 | Mọi thao tác **phá huỷ hoặc hàng loạt** (nhập đè lịch, mở khoá kỳ, xoá lượt chấm) đều phải ghi nhật ký kiểm toán đầy đủ (vá DG-13) |

### 6.4 Quy tắc tác động của từng loại đơn lên công

| Loại đơn | Tác động khi được duyệt |
|---|---|
| Nghỉ phép | Ngày trong đơn: không tính thiếu công; trừ quỹ phép; nhãn "Nghỉ phép" |
| Nghỉ không lương | Không tính thiếu công; không trừ quỹ; nhãn riêng; đánh dấu cho khâu tính lương |
| Đi muộn / về sớm (đăng ký trước) | Miễn nhãn "Đi muộn"/"Về sớm" trong phạm vi đã duyệt |
| Tăng ca | Số giờ trong đơn được ghi nhận là **giờ làm thêm** (tách khỏi giờ trong ca) |
| Làm việc từ xa | Coi như có mặt trong ca; **không đòi lượt chấm tại điểm**; vẫn cần bằng chứng theo phương thức được cấu hình cho làm từ xa |
| Đi công tác | Như trên; thêm nhãn "Công tác" phục vụ chế độ công tác phí |
| Chỉnh công | Sinh/sửa lượt chấm theo **giờ có cấu trúc** trong đơn; ghi nhật ký từ → đến |
| Đổi ca | Sửa lịch phân ca của cả hai người liên quan |
| **Đổi lớp dạy** *(đặc thù)* | Cập nhật buổi dạy; nếu buổi dạy là căn cứ tính công của giáo viên thì cập nhật theo |
| **Dạy thay** *(đặc thù)* | Chuyển công của buổi dạy sang người dạy thay; người vắng không bị tính thiếu nếu có lý do hợp lệ |
| **Nghỉ buổi dạy** *(đặc thù)* | Buổi bị huỷ không tính là thiếu công của giáo viên |
| **Xác nhận bảng công** *(mới)* | Đánh dấu người lao động đã xác nhận; là điều kiện để chốt kỳ |

### 6.5 (d) Ma trận phân quyền và cách ly đa cơ sở

**Nguyên tắc bắt buộc:** giai đoạn 1 và 2 **KHÔNG thêm hành động quyền mới** — tái sử dụng đúng 3 hành động hiện có, để không làm nhiễu cửa sổ shadow-compare (lý do ở PHẦN E §7.5). Các hành động mới ở cột phải chỉ được mở **sau khi cờ RBAC v2 đã lật**.

| Nhóm việc | Giai đoạn 1–2: dùng quyền cũ | Giai đoạn 3+: quyền riêng đề xuất |
|---|---|---|
| Tự chấm công, tự đăng ký ca, tự gửi đơn | `hr_attendance:checkin` | giữ nguyên |
| Xem bảng công cơ sở, mở màn hình QR, xuất/nhập lịch | `hr_attendance:view` | giữ nguyên |
| Duyệt chỉnh công, sửa bản ghi công | `hr_attendance:adjust` | giữ nguyên |
| **Cấu hình phương thức / ca / điểm chấm công** | dùng khoá cấu hình hệ thống hiện có (`settings:edit`, chỉ SUPER_ADMIN) | `hr_attendance:config` |
| **Duyệt đơn từ** | `hr_attendance:adjust` (tạm) | `hr_attendance:approve-request` |
| **Chốt / mở khoá kỳ công** | `hr_attendance:adjust` + giới hạn SUPER_ADMIN ở tầng nghiệp vụ | `hr_attendance:close-period` |
| **Xuất bảng công** | `hr_attendance:view` | `hr_attendance:export` |
| **Xem toạ độ thô của lượt chấm** | không mở cho ai ngoài SUPER_ADMIN | `hr_attendance:view-location` — **quyền riêng, dữ liệu nhạy cảm** |

**Hai hệ vai trò — KHÔNG được trộn vào một bảng**

> Hệ thống đang có **hai từ vựng vai trò song song**. Trộn chúng vào một bảng là nguồn hiểu nhầm lớn:
> - **v1 — enum `Role` trong cơ sở dữ liệu**: đúng **9 giá trị** (`[CODE] lib/auth/permissions.ts`). ~~đang enforce trên production~~ → **ĐÍNH CHÍNH 29/07/2026:** v1 nay chỉ còn chạy song song để so lệch; nó là hệ enforce ở **local/dev/CI** (cờ mặc định OFF), **không phải prod**.
> - **v2 — `RoleDef` khai trong dữ liệu**, sau cờ `RBAC_V2_ENABLED` (~~đang TẮT~~ → **ĐÃ BẬT trên Production**, xác minh 29/07/2026): **14 vai trò** (`[CODE] prisma/seed-roles.ts`). Đây là hệ **đang enforce thật trên prod**, quyền gắn vào **`UserOrgRole × RoleDef × RolePermission(scopeType)`**, **không gắn vào enum**.
>
> ⚠️ Kèm theo: `can()` v2 (`[CODE] lib/auth/can.ts:36-44`) là ALLOW-wins thuần, **không có nhánh DENY** ⇒ mọi `UserPermissionGrant` DENY đang bị bỏ qua trên prod.

**Bảng 1 — Hiện trạng v1 (9 giá trị enum `Role`, đang enforce):** xem §3.3. Không lặp lại ở đây.

**Bảng 2 — Trạng thái đích v2** (danh sách vai trò lấy đúng từ `[CODE] prisma/seed-roles.ts`; quyền là **hàng của `RolePermission` gắn vào `RoleDef`**, kèm `scopeType`, **không phải cột của enum**):

| Vai trò v2 (`RoleDef.code`) | Dòng khai | Tự chấm | Xem công | Chỉnh công | Duyệt đơn | Chốt kỳ | Cấu hình | Xem toạ độ |
|---|---|---|---|---|---|---|---|---|
| `SUPER_ADMIN` | `:31` | ✅ | ✅ GLOBAL | ✅ | ✅ | ✅ | ✅ | ✅ (có nhật ký + lý do) |
| `HO_HR` | `:88` | ✅ | ✅ GLOBAL | ✅ **(bổ sung — vá lệch hiện tại)** | ✅ | ✅ | ❌ | ❌ |
| `HO_ACCOUNTANT` | `:47` | ✅ | ✅ GLOBAL (chỉ số tổng hợp phục vụ lương) | ❌ | ❌ | ❌ | ❌ | ❌ |
| `HO_MARKETING` | `:153` | ✅ | chỉ của mình | ❌ | ❌ | ❌ | ❌ | ❌ |
| `HO_SALE` | `:257` | ✅ | chỉ của mình | ❌ | ❌ | ❌ | ❌ | ❌ |
| `CENTER_MANAGER` | `:273` | ✅ | ✅ CENTER (cơ sở mình) | ✅ trong hạn | ✅ cơ sở mình | ❌ | ❌ | ❌ |
| `CENTER_HR` | `:126` | ✅ | ✅ CENTER | ✅ trong hạn | ✅ | ❌ | ❌ | ❌ |
| `CENTER_ACCOUNTANT` | `:527` | ✅ **(chưa có trong cấu hình động — cần bổ sung)** | chỉ của mình | ❌ | ❌ | ❌ | ❌ | ❌ |
| `CENTER_CLASS_MANAGER` | `:397` | ✅ | chỉ của mình | ❌ | ❌ | ❌ | ❌ | ❌ |
| `CENTER_SALES_CSM` | `:417` | ✅ | chỉ của mình | ❌ | ❌ | ❌ | ❌ | ❌ |
| `TRAINING` | `:207` | ✅ **(bổ sung — DG-34, cần xác nhận là lỗi hay chủ ý)** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `TEACHER` | `:464` | ✅ | chỉ của mình | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ASSISTANT_TEACHER` | `:518` | ✅ **(chưa có trong cấu hình động — cần bổ sung)** | chỉ của mình | ❌ | ❌ | ❌ | ❌ | ❌ |
| `PARENT` | `:542` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

> ⚠️ **Ba lưu ý bắt buộc khi đọc Bảng 2:**
> 1. **Không có vai trò `HO_MANAGER`** — Doc 15 chốt như vậy. Vai trò Hội sở là **cross-center theo chức năng**, không phải "cấp trên của cơ sở".
> 2. **`SALES_CSM` / `MARKETING` / `ACCOUNTANT` / `HR` là mã của hệ v1**, ở hệ v2 chúng tách thành cặp `HO_*` / `CENTER_*`. Đừng dùng lẫn hai bộ mã trong cùng một câu.
> 3. Ô "✅ CENTER" **không phải một cột quyền** mà là `scopeType` của hàng `RolePermission`. Đội kỹ thuật khai theo `(action, scopeType)`, không khai theo tên vai trò cứng trong mã.

**Cách ly đa cơ sở — yêu cầu cứng:**

| Mã | Yêu cầu |
|---|---|
| CL-01 | Mọi bảng dữ liệu công mới (lượt chấm, bản ghi công ngày, bảng công kỳ, nhật ký, hồ sơ áp dụng, điểm chấm công) phải **thuộc tầng cách ly theo đơn vị** |
| CL-02 | Việc **ghi** dữ liệu **không được** dựa vào tầng cách ly để tự bảo vệ — tầng đó chỉ tự lọc khi **đọc**. Mọi thao tác sửa/xoá phải tự kiểm tra phạm vi (quy ước đã có trong `CLAUDE.md`) |
| CL-03 | Cơ sở A **không được** thấy dữ liệu công của cơ sở B, kể cả qua báo cáo tổng hợp có thể đảo ngược ra số cá nhân |
| CL-04 | Hội sở xem được **số tổng hợp** toàn hệ thống, nhưng xem **chi tiết cá nhân của cơ sở nhượng quyền** phải theo quyết định pháp lý ở PHẦN E §7.4 |
| CL-05 | Thêm cơ sở mới (kể cả nhượng quyền) = **thêm dữ liệu**: thêm đơn vị, thêm điểm chấm công, thêm hồ sơ áp dụng. **Không sửa mã nguồn, không sửa danh sách cứng** |

### 6.6 (1) DANH MỤC PHƯƠNG THỨC CHẤM CÔNG CẤU HÌNH ĐƯỢC

> Đây là hạt nhân của BA mới. **Phải tách bạch hai thứ, nếu không đội kỹ thuật sẽ ước lượng thiếu:**
>
> - **Mỗi LOẠI xác thực** (QR, định vị, Wi-Fi, ảnh minh chứng, xác nhận tay, theo buổi dạy…) là **một bộ kiểm tra viết bằng mã**, cắm vào một khung chung. **Thêm loại mới VẪN CẦN LẬP TRÌNH** — có loại chỉ vài ngày, có loại phải làm cả phía thiết bị.
> - **Mỗi CẤU HÌNH áp dụng** (bật/tắt, tham số, đơn vị, nhóm chức danh, hiệu lực, hành vi khi thất bại, thứ tự ưu tiên) là **dữ liệu — không cần lập trình**. Đây mới là chỗ "thêm một dòng".
>
> Giá trị của mô hình này **không phải** "thêm phương thức khỏi cần code", mà là: **bật/tắt và điều chỉnh phương thức đã có cho từng cơ sở / từng nhóm người mà không cần triển khai lại**, và **mở cơ sở mới bằng nhập dữ liệu**.

| Mã | Phương thức | Dữ liệu cần thu thập | Điều kiện hợp lệ | Cách chống gian lận | Thiết bị cần | Chi phí |
|---|---|---|---|---|---|---|
| **PT-01** | **QR cố định theo cơ sở** *(đang dùng — mặc định)* | Mã QR đọc được, mã đơn vị | Chữ ký mã hợp lệ và trỏ đúng đơn vị được phép; đang trong khung giờ chấm công | Chữ ký mã hoá; **bản thân mã không chống được việc chụp lại** ⇒ phải đi kèm PT-02 | Tờ giấy in hoặc màn hình bất kỳ | Gần bằng 0 |
| **PT-02** | **Định vị GPS / vùng địa lý** *(đang dùng — mặc định)* | Toạ độ do thiết bị báo, độ chính xác | Khoảng cách tới điểm chấm ≤ bán kính; độ chính xác báo về ≤ ngưỡng (đề xuất 100 m); điểm chấm phải có toạ độ | Bán kính; ngưỡng độ chính xác; **cờ bất thường** khi toạ độ trùng khít lặp lại hoặc di chuyển bất khả thi (QT-14) | Điện thoại có định vị | Gần bằng 0. **Nhưng chi phí tuân thủ cao** — xem PHẦN E |
| **PT-03** | **QR động** *(mới, tuỳ chọn)* | Mã QR có thành phần thời gian | Mã còn trong cửa sổ hiệu lực (mặc định 5 giây + dung sai đồng hồ 30 giây) | Chụp ảnh gửi đi thì mã đã hết hạn | **Màn hình luôn bật tại mỗi cơ sở** (máy tính bảng hoặc TV) | Thiết bị 3–8 triệu/cơ sở + điện + người trông `[SUY LUẬN]` |
| **PT-04** | **Wi-Fi nội bộ / địa chỉ điểm phát** *(mới)* | Tên mạng + định danh điểm phát | Thiết bị đang nối đúng mạng đã khai của điểm chấm | Phải ở trong tầm phủ sóng thật | Điểm phát Wi-Fi đã có sẵn | Gần bằng 0 |
| **PT-05** | **Dải địa chỉ mạng nội bộ** *(mới)* | Địa chỉ mạng của yêu cầu | Địa chỉ nằm trong dải đã khai của đơn vị | Yếu nếu có mạng riêng ảo | Không | Gần bằng 0 |
| **PT-06** | **Chấm công trên web (không xác thực vị trí)** *(mới)* | Chỉ thời điểm bấm | Đang trong khung giờ chấm công | ❌ không có — **luôn gắn cờ chờ duyệt** | Không | 0 |
| **PT-07** | **Ảnh minh chứng** *(mới)* | Ảnh do người dùng chụp + thời điểm | Ảnh chụp trong khung giờ; kích thước/định dạng hợp lệ | Hậu kiểm bằng mắt người duyệt | Điện thoại có máy ảnh | Chi phí lưu trữ |
| **PT-08** | **Quản lý xác nhận / chấm hộ** *(mới — bắt buộc có)* | Người xác nhận, người được xác nhận, giờ vào/ra, lý do | Người xác nhận nằm trong danh sách được phép chấm hộ cho người kia | Danh sách hạn chế + nhật ký bắt buộc + luôn gắn cờ | Không | 0 |
| **PT-09** | **Theo tiết dạy / buổi dạy của giáo viên** *(mới — đặc thù, không có mẫu MISA)* | Buổi dạy, giáo viên thực dạy, giờ bắt đầu/kết thúc thực tế | Có buổi dạy đã lên lịch; giáo viên là người được phân công hoặc dạy thay đã duyệt | Đối soát với dữ liệu điểm danh học viên của buổi đó | Không (dùng dữ liệu đã có) | 0 — **dữ liệu đã tồn tại** (`[CODE] prisma/schema.prisma:1475-1481` có giáo viên thực dạy, giờ bắt đầu/kết thúc thực tế) |
| **PT-10** | **Tự động tính công (không cần chấm)** *(mới)* | Không thu thập gì | Người thuộc nhóm được miễn chấm công (ví dụ Ban giám đốc) | Không áp dụng | Không | 0 |
| **PT-11** | **Máy chấm công vân tay / thẻ** — 🔴 **NGOÀI PHẠM VI theo Doc 15** (phần vân tay). Xem §5.1-bis + CH-11 | Mã chấm công trên máy, thời điểm | Máy đã ghép nối và đồng bộ | Sinh trắc tại chỗ | Máy chấm công + máy tính đồng bộ | 3–15 triệu/máy `[SUY LUẬN]` |
| **PT-12** | **Nhận diện khuôn mặt** — 🔴 **NGOÀI PHẠM VI theo Doc 15.** Không phải "TẮT mặc định, bật khi được duyệt": muốn mở phải **sửa Doc 15 §0 bằng văn bản** (§5.1-bis, CH-11) | Ảnh khuôn mặt / đặc trưng sinh trắc | Đã đăng ký mẫu trước | AI so khớp | Điện thoại / máy tính bảng | Phí dịch vụ + **chi phí tuân thủ cao nhất** — xem PHẦN E |

**Khối lượng mã cần viết cho từng phương thức** — bảng để đội kỹ thuật ước lượng, **không phải mọi dòng đều là "thêm 1 dòng dữ liệu"**:

| Mã | Cần viết mã mới? | Viết ở đâu / viết cái gì |
|---|---|---|
| PT-01 QR cố định | **Không** — đã có | Chỉ bọc lại vào khung chung + đọc tham số từ cấu hình |
| PT-02 Định vị GPS | **Không** — đã có | Như trên. Riêng việc **ngừng lưu toạ độ thô** là sửa nhỏ ở chỗ ghi bản ghi |
| PT-03 QR động | **CÓ** | Cơ chế sinh mã theo cửa sổ thời gian + màn hình hiển thị tự làm mới + xử lý lệch đồng hồ |
| PT-04 Wi-Fi / BSSID | **CÓ** | Mã **phía thiết bị** để đọc định danh điểm phát (trình duyệt web thường **không đọc được** — có thể phải làm ứng dụng hoặc đổi cách xác thực). ⚠️ `[CHƯA KIỂM CHỨNG]` khả thi trên trình duyệt điện thoại — **phải làm thử nghiệm nhỏ trước khi cam kết** |
| PT-05 Dải địa chỉ mạng | **CÓ** (nhỏ) | Đọc địa chỉ mạng của yêu cầu + so khớp dải đã khai |
| PT-06 Web không xác thực | **CÓ** (nhỏ) | Chủ yếu là nhánh "luôn gắn cờ" |
| PT-07 Ảnh minh chứng | **CÓ** | Luồng tải tệp + kho lưu + hiển thị cho người duyệt + **thời hạn xoá** |
| PT-08 Quản lý xác nhận | **CÓ** | Màn hình xác nhận + danh sách người được chấm hộ + nhật ký bắt buộc |
| PT-09 Theo buổi dạy | **CÓ — nhiều nhất** | **Công thức tính công hoàn toàn mới** (§6.11), cộng báo cáo đối soát. Dữ liệu đầu vào đã có, công thức thì chưa |
| PT-10 Tự động tính công | **CÓ** (nhỏ) | Sinh bản ghi công ngày không cần lượt chấm |
| PT-11 / PT-12 | — | 🔴 Ngoài phạm vi — không ước lượng ở đợt này |

**Tham số chung mà MỌI phương thức phải khai được:**

| Tham số | Ý nghĩa | Mặc định đề xuất |
|---|---|---|
| Bật/tắt | Có được dùng không | theo bảng trên |
| Phạm vi áp dụng | Hệ thống / đơn vị / nhóm chức danh / cá nhân | — |
| Hiệu lực | Từ ngày, đến ngày | từ ngày bật |
| **Khung giờ chấm công hợp lệ** | Chỉ được chấm trong khoảng nào so với giờ ca | trước ca 60 phút, sau ca 60 phút |
| **Có bắt buộc kèm phương thức phụ không** | Ví dụ PT-01 bắt buộc kèm PT-02 | PT-01 + PT-02 (giữ hiện trạng) |
| **Hành vi khi thất bại** | `CHẶN` (không ghi gì) hoặc `GHI NHẬN + GẮN CỜ CHỜ DUYỆT` | PT-02 = `CHẶN` (giữ hiện trạng); PT-06, PT-07 = `GHI NHẬN + GẮN CỜ` |
| **Dữ liệu được lưu lại** | Lưu gì, không lưu gì | ⏳ **CHỜ CH-05** — Ban giám đốc chưa chốt có ngừng lưu toạ độ thô hay không. Khuyến nghị BA: chỉ lưu khoảng cách + trong/ngoài vùng (PHẦN E). **Không được đặt làm mặc định trước khi CH-05 có trả lời** |
| **Thời hạn lưu dữ liệu xác thực** | Bao lâu thì xoá phần dữ liệu thô | đề xuất 90 ngày `[SUY LUẬN]` |
| Thứ tự ưu tiên | Khi nhiều phương thức cùng khả dụng | PT-01 → PT-02 → PT-04 → PT-08 |

### 6.7 (2) MA TRẬN ÁP DỤNG: phương thức × đối tượng × đơn vị

**Cách đọc:** mỗi ô là một **hồ sơ áp dụng** (K-02), đặt được từ **màn hình cấu hình**, không sửa mã nguồn.

| Phương thức | HO (Hội sở) | CS1 · CS2 (sở hữu) | Cơ sở mới | Cơ sở nhượng quyền |
|---|---|---|---|---|
| PT-01 QR cố định | ✅ bật | ✅ **bật — mặc định hiện tại** | ✅ bật khi khai điểm chấm | ✅ bật (mã riêng theo đơn vị) |
| PT-02 Định vị | ⚠️ tuỳ — Hội sở hay đi ngoài | ✅ **bật — mặc định hiện tại** | ✅ **chỉ bật được khi đã khai toạ độ** | ⚠️ theo thoả thuận nhượng quyền |
| PT-03 QR động | ❌ | ⚠️ bật nếu có màn hình | ❌ | ❌ |
| PT-04 Wi-Fi | ⚠️ | ⚠️ cân nhắc thay PT-02 trong nhà | ⚠️ | ⚠️ |
| PT-06 Web không xác thực | ⚠️ chỉ Ban giám đốc/nhân sự đặc thù | ❌ | ❌ | ❌ |
| PT-07 Ảnh minh chứng | ✅ cho người đi ngoài | ⚠️ dự phòng | ⚠️ dự phòng | ⚠️ |
| PT-08 Quản lý xác nhận | ✅ **bật — dự phòng bắt buộc** | ✅ **bật — dự phòng bắt buộc** | ✅ | ✅ |
| PT-09 Theo buổi dạy | ❌ | ✅ cho giáo viên | ✅ cho giáo viên | ✅ |
| PT-10 Tự động tính công | ✅ Ban giám đốc | ❌ | ❌ | ❌ |
| PT-12 Khuôn mặt | 🔴 TẮT | 🔴 TẮT | 🔴 TẮT | 🔴 TẮT |

**Chiều "đối tượng" (nhóm chức danh):**

| Nhóm | Phương thức chính | Dự phòng |
|---|---|---|
| Nhân viên văn phòng tại cơ sở | PT-01 + PT-02 | PT-08 |
| Giáo viên dạy tại cơ sở | PT-01 + PT-02 | PT-09, PT-08 |
| Giáo viên dạy điểm lẻ / dạy nhiều cơ sở trong ngày | PT-09 | PT-07, PT-08 |
| Nhân sự Hội sở đi ngoài | PT-02 hoặc PT-07 | PT-08 |
| Ban giám đốc | PT-10 | — |
| Trợ giảng / thời vụ | PT-01 + PT-02 | PT-08 |

**Khác biệt so với hiện trạng — nói thẳng:**

| | Hiện nay | Sau khi có ma trận |
|---|---|---|
| Thêm **loại xác thực** mới (QR động, Wi-Fi, ảnh…) | Sửa mã nguồn + triển khai lại | **Vẫn phải viết mã** cho bộ kiểm tra mới, nhưng cắm vào khung có sẵn thay vì sửa hàm chấm công đang chạy — xem bảng "khối lượng mã" §6.6 |
| **Bật/tắt và chỉnh tham số** một phương thức đã có | **Không làm được** — phải sửa mã | **Thêm/sửa 1 dòng dữ liệu**, không triển khai lại |
| Bật/tắt định vị cho 1 cơ sở | **Không làm được** (chỉ có cách xoá toạ độ cơ sở — mà làm vậy thì mất luôn kiểm soát) | Tắt hồ sơ áp dụng của đơn vị đó |
| Cho giáo viên dùng cách khác nhân viên văn phòng | **Không làm được** — không có khái niệm nhóm | Hai hồ sơ áp dụng khác nhau |
| Mở cơ sở mới | Nhập toạ độ vào hồ sơ cơ sở là hết; mọi thứ khác cứng | Thêm đơn vị + điểm chấm + hồ sơ áp dụng, xong |
| Bán kính khác nhau theo cơ sở | ✅ **đã làm được** (`Center.allowedRadiusMeters`) | giữ nguyên |
| Dung sai khác nhau theo cơ sở | Có hạ tầng nhưng **không dùng được** (DG-19) | Đặt được ở cấp đơn vị |

### 6.8 (3) GIỮ QR + GPS LÀM MẶC ĐỊNH — VÀ ĐƯỜNG CHUYỂN TIẾP KHÔNG GIÁN ĐOẠN

**Cam kết:** PT-01 (QR cố định) + PT-02 (định vị) là **phương thức mặc định của Sata Robo**, giữ nguyên hành vi người dùng cuối. Nhân viên không phải học lại cách chấm công.

**Đường chuyển tiếp 5 bước — hệ thống không dừng phút nào:**

| Bước | Việc | Hệ thống cũ có bị ảnh hưởng không? |
|---|---|---|
| **B1 — Thêm dữ liệu, không đổi hành vi** | Tạo danh mục phương thức, tạo điểm chấm công, nhập sẵn PT-01 và PT-02 với **đúng tham số đang chạy** (bán kính 100 m, dung sai 5 phút, giờ ca 07:30/13:30/17:00). Thêm cột "phương thức" vào bản ghi lượt chấm, cho phép để trống | **Không** — *ở đúng phạm vi bước B1*. Chỉ thêm bảng và cột cho phép trống. Đường chấm công cũ chạy y nguyên. ⚠️ **Nhưng cam kết "chỉ thêm, không phá" KHÔNG kéo dài sang Giai đoạn 2** — xem §6.8-bis: hai thay đổi cấu trúc dữ liệu bắt buộc phải phá vỡ |
| **B2 — Ghi song song** | Đường chấm công hiện tại **ghi thêm** "phương thức = PT-01+PT-02" và "điểm chấm = điểm của cơ sở đó" vào mỗi lượt. Vẫn dùng logic cũ để quyết định cho/không cho | **Không.** Chỉ thêm dữ liệu vào bản ghi |
| **B3 — Đọc cấu hình, đối chiếu ngầm** | Đường chấm công **đọc tham số từ cấu hình mới** nhưng vẫn **quyết định bằng logic cũ**; ghi lại chỗ nào cấu hình mới ra kết quả khác. Chạy 1–2 tuần, xem báo cáo lệch | **Không.** Đây là giai đoạn đo, chưa đổi quyết định |
| **B4 — Chuyển công tắc** | Khi báo cáo lệch bằng 0 trong 5 ngày làm việc liên tiếp ⇒ chuyển sang **quyết định bằng cấu hình mới**. Giữ công tắc quay lại logic cũ trong ít nhất 30 ngày | **Có, nhưng có đường lùi.** Đây là điểm rủi ro duy nhất, và có thể quay lại trong vài phút |
| **B5 — Dọn** | Sau 30 ngày ổn định: gỡ logic cũ, gỡ công tắc, xoá hằng số giờ ca khỏi mã nguồn | Không |

**Nguyên tắc bắt buộc trong suốt quá trình:**
- Không có ngày nào nhân viên không chấm công được. Nếu đường mới lỗi ⇒ tự động rơi về đường cũ, ghi cờ, không chặn người dùng.
- **Không chuyển đổi dữ liệu quá khứ.** Lượt chấm cũ để trống cột phương thức, hiểu ngầm là PT-01+PT-02.
- Giờ ca nhập vào cấu hình mới phải là **giờ đang chạy thật** (`lib/shifts.ts`), **không phải** giờ trong bảng `WorkShiftConfig` hiện tại (đang lệch — DG-03). Việc đầu tiên của B1 là **sửa lệch này**.
- Ca khai trong cấu hình mới có **ngày hiệu lực = ngày bật**, để số liệu công quá khứ không đổi (QT-15).

### 6.8-bis HAI THAY ĐỔI CẤU TRÚC DỮ LIỆU **KHÔNG** PHẢI ADDITIVE

> ⚠️ **Đọc mục này trước khi tin bất kỳ ước lượng nào của Giai đoạn 2.** Hai việc dưới đây **không** thuộc loại "thêm bảng và cột cho phép trống" như bước B1. Chúng là **thay đổi cấu trúc trên bảng đang chứa dữ liệu công thật của người lao động**, và đây là dữ liệu dùng để trả lương.

#### (1) Bỏ / đổi ràng buộc duy nhất trên bản ghi lượt chấm

**Vì sao bắt buộc:** Giai đoạn 2 việc 1 ("nhiều lượt vào/ra mỗi ngày", QT-08) **không thể làm** nếu còn ràng buộc hiện tại.

| Ràng buộc hiện tại | Vị trí | Hệ quả |
|---|---|---|
| `@@unique([userId, type, qrToken])` | `[CODE] prisma/schema.prisma:4080` | Mỗi người **chỉ ghi được đúng 1 lượt VÀO và 1 lượt RA cho mỗi giá trị `qrToken`** |
| Quy ước sinh `qrToken`: `storedToken = "<centerId>:<ngày>"` | `[CODE] app/(admin)/admin/cham-cong/actions.ts:83` | Vì `qrToken` chứa **ngày**, ràng buộc trên trở thành **"1 vào + 1 ra mỗi ngày mỗi cơ sở"** — đây chính là DG-04 |

⇒ Muốn nhiều lượt/ngày thì **phải bỏ hoặc đổi ràng buộc duy nhất** và **đổi luôn quy ước sinh `qrToken`**. Đây là `ALTER TABLE` trên bảng có dữ liệu công thật, **không phải** "thêm cột cho phép trống".

**Phương án 2 pha đề xuất (không dừng hệ thống, có đường lùi):**

| Pha | Việc | Rủi ro |
|---|---|---|
| P1 | **Thêm bảng "Lượt chấm" mới song song** (đúng mô hình K-04: có phương thức, có điểm chấm, **không có ràng buộc 1/ngày**). Bảng cũ giữ nguyên | Thấp — thuần thêm mới |
| P2 | **Ghi kép**: mỗi lần chấm ghi cả bảng cũ lẫn bảng mới. Đường tính công **vẫn đọc bảng cũ** | Thấp — chỉ thêm ghi |
| P3 | **Đối chiếu ngầm** 1–2 tuần: số liệu công tính từ bảng mới phải trùng khít bảng cũ | Thấp — chỉ đo |
| P4 | **Cắt sang**: đường tính công đọc bảng mới; bỏ trần 1+1; áp thuật toán ghép cặp §6.3-bis. Giữ công tắc quay lại | **Đây là điểm rủi ro** — nhưng lùi được trong vài phút |
| P5 | Sau ≥30 ngày ổn định: **mới bỏ ràng buộc cũ / ngừng ghi bảng cũ** | Thấp nếu P4 đã ổn |

> ❗ **Tuyệt đối không** làm tắt bằng cách "bỏ luôn `@@unique` rồi sửa mã": mất ràng buộc mà chưa có thuật toán ghép cặp ⇒ chấm trùng sẽ **cộng giờ công sai**, và sai vào tháng lương.

#### (2) Từ `WorkShift[]` (mảng enum) sang danh mục ca dạng dữ liệu

**Vì sao bắt buộc:** §6.10 ghi mã ca *"CA_SANG / CA_CHIEU / CA_TOI + mở thêm được"*. Câu đó **đọc như thêm một dòng dữ liệu, nhưng không phải.**

| Hiện trạng | Vị trí |
|---|---|
| `ShiftRegistration.shifts` có kiểu **`WorkShift[]` — mảng ENUM của Prisma/Postgres** | `[CODE] prisma/schema.prisma:3925` |
| `WorkShift` là enum 3 giá trị cứng trong cơ sở dữ liệu | `[CODE] prisma/schema.prisma:3889-3893` |
| Bảng `WorkShiftConfig` dùng cột `code` dạng chuỗi, **nhưng chú thích schema tự ràng "khớp enum cũ"**, và hàm xoá ca vẫn ép kiểu về enum | `[CODE] prisma/schema.prisma:3900`; `lib/attendance/shift-config.ts:78-80` |

⇒ **Thêm ca thứ tư có đúng hai đường, cả hai đều là migration:**

| Đường | Việc | Đánh giá |
|---|---|---|
| **Đ-1 — Thêm giá trị vào enum** | `ALTER TYPE ... ADD VALUE` cho `WorkShift` | Nhẹ hơn, nhưng **vẫn là migration + triển khai lại**, và **vẫn không cấu hình được bởi người dùng** — mỗi ca mới lại một lần sửa mã. Chỉ là hoãn vấn đề |
| **Đ-2 — Đổi kiểu cột sang chuỗi / quan hệ tới danh mục ca** | Migration **phá vỡ** trên `ShiftRegistration` + **backfill toàn bộ lịch ca lịch sử** + sửa mọi nơi đọc/ghi `shifts` | Đây mới là "ca thành dữ liệu" thật. **Đắt hơn nhiều so với ấn tượng mà §6.10 tạo ra** |

**Phương án 2 pha cho Đ-2:**

| Pha | Việc |
|---|---|
| P1 | Thêm cột mới dạng chuỗi (danh sách mã ca), **cho phép trống**, song song cột enum cũ |
| P2 | **Ghi kép** + **backfill** toàn bộ `ShiftRegistration` lịch sử từ cột enum sang cột mới |
| P3 | Đối chiếu: mọi bản ghi lịch sử phải ra **cùng kết quả tính công** ở hai cột |
| P4 | Đường tính công cắt sang cột mới; danh mục ca mở khai báo tự do |
| P5 | Sau khi ổn định: bỏ cột enum (và chỉ khi đó mới bỏ enum `WorkShift`) |

#### Kết luận thẳng

> **Cho tới khi hai việc trên xong: KHÔNG mở được ca thứ tư, và KHÔNG chấm được nhiều lượt trong ngày.** Mọi cam kết ngược lại với Ban giám đốc đều sai.

| Hệ quả lên lộ trình | Nội dung |
|---|---|
| **Đụng shadow?** | ❌ Không đụng ma trận quyền. **Nhưng** cả hai đều chạm bảng thuộc tầng cách ly (`EmployeeCheckin`, `ShiftRegistration` ∈ `SCOPED_MODELS` — `[CODE] lib/db-scope.ts:13`) ⇒ vẫn phải để người phụ trách RBAC xác nhận thời điểm (§7.5) |
| **Rủi ro dữ liệu** | 🔴 **Cao nhất trong toàn lộ trình** — sai là sai vào bảng công đã dùng trả lương. Bắt buộc: sao lưu trước mỗi pha, chạy ngoài giờ, có kịch bản lùi viết sẵn |
| **Ước lượng lại Giai đoạn 2** | Con số **3 tuần** trong §8 **KHÔNG bao gồm** hai việc này. `[SUY LUẬN]` cộng thêm **2–3 tuần** cho (1) và **2–3 tuần** cho (2) nếu chọn đường Đ-2 ⇒ Giai đoạn 2 thực tế **5–9 tuần**. Đội kỹ thuật phải ước lượng lại, đây chỉ là con số thô của người viết |
| **Có thể cắt gọn không?** | Có — nếu Ban giám đốc chấp nhận **tạm hoãn ca thứ tư** (chỉ làm việc (1), giữ enum 3 ca), Giai đoạn 2 gọn lại còn **5–6 tuần**. Đưa vào CH-01 phần hệ quả |

### 6.9 (4) KẾT HỢP NHIỀU PHƯƠNG THỨC TRONG MỘT LẦN CHẤM

**Mô hình: chuỗi xác thực có thứ tự.** Một lần chấm công đi qua một danh sách lớp xác thực đã cấu hình, mỗi lớp có vai trò:

| Vai trò của lớp | Nghĩa | Ví dụ |
|---|---|---|
| **BẮT BUỘC** | Không qua ⇒ theo "hành vi khi thất bại" của lớp đó | PT-01 (phải đúng mã cơ sở) |
| **BẮT BUỘC KÈM** | Chỉ chạy khi lớp trước đã qua; không qua ⇒ như trên | PT-02 (định vị) đi kèm PT-01 — **đây chính là hiện trạng** |
| **THAY THẾ ĐƯỢC** | Qua được **một trong nhóm** là đủ | PT-02 **hoặc** PT-04 (ở trong nhà sóng định vị kém thì dùng Wi-Fi) |
| **BỔ SUNG** | Không quyết định cho/không, chỉ thu thêm bằng chứng | PT-07 (ảnh minh chứng) |

**Cấu hình mặc định của Sata Robo (giữ đúng hiện trạng):**

```
Lớp 1  PT-01 QR cố định        BẮT BUỘC        thất bại ⇒ CHẶN
Lớp 2  PT-02 Định vị           BẮT BUỘC KÈM    thất bại ⇒ CHẶN
       (bỏ qua lớp 2 nếu điểm chấm chưa khai toạ độ — nhưng
        theo QT-04, tình huống này KHÔNG CÒN TỒN TẠI sau khi
        cấm bật GPS cho đơn vị chưa có toạ độ)
```

**Thứ tự ưu tiên khi nhiều phương thức cùng khả dụng:**

1. Phương thức có **cấp áp dụng cụ thể hơn** thắng (cá nhân > đơn vị > hệ thống).
2. Cùng cấp: theo **số thứ tự ưu tiên** khai trong danh mục.
3. Mặc định đề xuất: PT-01 → PT-02 → PT-04 → PT-09 → PT-07 → PT-08.

**Cơ chế dự phòng khi phương thức chính thất bại:**

| Tình huống | Xử lý đề xuất | Kết quả |
|---|---|---|
| Không quét được QR (mã rách, mã mờ) | Cho phép **nhập mã cơ sở bằng tay** rồi chạy tiếp lớp định vị | Ghi nhận bình thường, gắn cờ "nhập tay" |
| Điện thoại từ chối chia sẻ vị trí | Rơi xuống **PT-04 Wi-Fi** nếu đơn vị có khai; không có thì rơi xuống **PT-08 quản lý xác nhận** | Ghi nhận + cờ chờ duyệt. **Không được để nhân viên mất công của ngày đó** |
| Ngoài bán kính nhưng có lý do (đưa học viên đi thi, họp ngoài) | Đường **PT-07 ảnh minh chứng** hoặc gửi đơn công tác | Ghi nhận + cờ chờ duyệt |
| Mất mạng hoàn toàn | **Chấm công ngoại tuyến**: máy lưu tạm rồi đồng bộ khi có mạng, kèm dấu thời gian thiết bị | Ghi nhận + cờ "ngoại tuyến". **Cần chốt ở CH-06** — có làm hay không |
| Điện thoại hỏng / quên máy | **PT-08 quản lý xác nhận** | Ghi nhận + cờ, có nhật ký ai xác nhận |
| Hệ thống lỗi | Quản lý ghi bù bằng **PT-08** trong cửa sổ cho phép | Ghi nhận + cờ |

**Nguyên tắc xuyên suốt:** *thất bại xác thực không được biến thành mất dữ liệu công.* Cách làm hiện tại (chặn cứng, không ghi gì — `[CODE] app/(admin)/admin/cham-cong/actions.ts:70-76`) khiến nhân viên **không có bằng chứng nào** rằng mình đã tới nơi. Mô hình mới cho phép cấu hình chuyển sang **ghi nhận + gắn cờ + chờ duyệt** — học từ cách MISA xử lý địa điểm linh hoạt `[WEB]` W3.

### 6.10 (5) CA LÀM VIỆC — ĐƠN TỪ — BẢNG CÔNG — CHỐT KỲ — NỐI LƯƠNG

> Theo chuẩn MISA về **cấu trúc**, nhưng cắt gọn cho **vừa quy mô một trung tâm ~vài chục nhân sự trên 2–4 cơ sở**.

**Ca làm việc — những gì khai báo được**

| Tham số | Lấy của MISA? | Có ở Sata Robo bây giờ? | Mặc định đề xuất |
|---|---|---|---|
| Mã ca (không trùng) | ✅ | enum cứng 3 giá trị (`[CODE] prisma/schema.prisma:3889-3893`), và cột lịch ca là **mảng enum** `WorkShift[]` (`:3925`) | CA_SANG / CA_CHIEU / CA_TOI. ⚠️ **"Mở thêm được" KHÔNG phải thêm một dòng dữ liệu** — thêm ca thứ tư đòi migration (thêm giá trị enum) hoặc migration phá vỡ + backfill toàn bộ lịch ca lịch sử (đổi kiểu cột). **Đọc §6.8-bis (2) trước khi hứa với ai** |
| Tên ca | ✅ | hằng số mã nguồn | giữ nguyên nhãn hiện tại |
| Giờ bắt đầu / kết thúc | ✅ | hằng số mã nguồn | **07:30–11:30 / 13:30–17:30 / 17:00–21:00** (giờ đang chạy thật) |
| Nghỉ giữa ca | ✅ | khai báo nhưng không dùng | ca sáng–chiều tách rời nên không cần; để trống |
| **Khung giờ chấm công** | ✅ | ❌ không có | trước ca 60 phút, sau ca 60 phút |
| Dung sai đi muộn / về sớm | (MISA gộp vào quy định phạt) | ✅ có, 5 phút | giữ 5 phút |
| **Hệ số quy đổi NGÀY CÔNG** (ngày thường / nghỉ / lễ) | ✅ | ❌ | **Đề xuất 1.0 cho mọi loại ngày** — ngày công là số ngày có mặt, không nhân hệ số. `[SUY LUẬN]` |
| **Hệ số TRẢ LƯƠNG làm thêm** (ngày thường / ngày nghỉ hằng tuần / ngày lễ) | (MISA gộp vào thiết lập ca) | ❌ | **150 % / 200 % / 300 %** theo **Điều 98 Bộ luật Lao động 2019** `[WEB]` (nguồn ở §7.3) — **chỉ dùng khi có bảng lương**. ⚠️ Đây là hệ số **tính tiền**, KHÁC hệ số quy đổi ngày công ở dòng trên. **Cần Kế toán xác nhận trước khi đưa vào công thức** |
| Đơn vị áp dụng | ✅ | ❌ (bảng có nhưng chết) | mặc định toàn hệ thống, ghi đè theo cơ sở |
| **Ngày hiệu lực** | (MISA không nêu rõ) | ❌ | **bắt buộc** — để không đổi số liệu quá khứ (QT-15) |
| Ca linh hoạt / công chuẩn theo tháng | ✅ | ❌ | **hoãn** — chưa cần với mô hình ca cố định |

**Đơn từ** — giữ 10 loại hiện có + thêm "Xác nhận bảng công" (tổng 11). Mỗi loại khai được: người duyệt, số cấp duyệt, hạn xử lý, quy tắc tác động lên công (§6.4). Chi tiết quy tắc: QT-28 → QT-33.

**Bảng công — ba tầng dữ liệu**

| Tầng | Nội dung | Vòng đời |
|---|---|---|
| Tầng 1 — **Lượt chấm** | Dữ liệu thô: từng lần quét | Bất biến. Sửa = tạo bản ghi mới + nhật ký, **không ghi đè** |
| Tầng 2 — **Bản ghi công ngày** | Kết quả tính của một người một ngày | Tính lại khi có dữ liệu mới; **đóng băng** khi kỳ được chốt |
| Tầng 3 — **Bảng công kỳ** | Tổng hợp theo kỳ | Sinh khi chuyển kỳ sang "Đang chốt"; bất biến sau khi chốt |

**Kỳ công — vòng đời**

```
ĐANG MỞ ──(hết kỳ, hệ thống tự chuyển)──> ĐANG CHỐT
   │                                          │
   │ dữ liệu công vẫn cập nhật                │ gửi nhân viên xác nhận,
   │                                          │ xử lý phản hồi, chỉnh công
   │                                          ▼
   │                                     ĐÃ CHỐT ──(HR/Kế toán xuất file)──> ĐÃ KHOÁ
   └──────────────── mở khoá kỳ (SUPER_ADMIN, bắt buộc lý do, có nhật ký) ◄──┘
```

**Nối sang tính lương — phạm vi giai đoạn này**

| Việc | Trong phạm vi? |
|---|---|
| Bảng công kỳ đã chốt, có đủ: ngày công, giờ công, giờ làm thêm, nghỉ có lương / không lương, số lần muộn-sớm | ✅ **CÓ** |
| Xuất file bảng tính + bản in ký duyệt | ✅ **CÓ** |
| Định dạng đầu ra ổn định, có phiên bản, để bên tính lương đọc được | ✅ **CÓ** |
| Tính tiền lương, phụ cấp, thuế, bảo hiểm trong hệ thống | ❌ **KHÔNG** — quyết định ở CH-09 |
| Đẩy tự động sang MISA AMIS Tiền lương qua API | ❌ **KHÔNG** ở đợt này — cần biết Sata Robo có tài khoản MISA nào trước (Phụ lục §10.1) |

### 6.11 (6) TRƯỜNG HỢP ĐẶC THÙ CỦA TRUNG TÂM DẠY HỌC

> **Đây là phần không có mẫu MISA để theo** (§4.8). Toàn bộ mục này là thiết kế mới `[SUY LUẬN]`, cần Ban giám đốc chốt ở CH-03.

**Vấn đề gốc:** hiện tại công của giáo viên tính theo **ca đăng ký**, còn giá trị lao động thật của giáo viên nằm ở **buổi dạy**. Hai thứ này chưa được nối:
- Màn Bảng công giáo viên gộp hiển thị 3 nguồn (buổi dạy chính khoá / buổi trải nghiệm / ca làm), nhưng giờ công của buổi dạy được **ước tính từ giờ của lớp**, **không** từ bản ghi chấm công, và cột giờ công của "Ca làm" để trống, **không cộng vào tổng** (`[CODE] app/(teacher)/teacher/bang-cong/page.tsx:8-11, 202, 242-245`).
- Dữ liệu "giáo viên thực dạy", "giờ bắt đầu thực tế", "giờ kết thúc thực tế", "giáo viên dạy thay" **đã tồn tại** trong hệ thống (`[CODE] prisma/schema.prisma:1475-1481`) nhưng **không được đưa vào bất kỳ công thức tính công nào**.

**Đề xuất: hai chế độ tính công giáo viên, cấu hình được theo đơn vị**

| Chế độ | Cách tính | Phù hợp khi | Ưu / nhược |
|---|---|---|---|
| **CĐ-A — Theo ca** *(hiện trạng)* | Giáo viên đăng ký ca như nhân viên khác, chấm bằng PT-01+PT-02 | Giáo viên cơ hữu, làm cả ngày ở một cơ sở | Đơn giản, không phải đổi gì. Nhưng **không phản ánh** giáo viên chỉ tới dạy 2 tiếng rồi về |
| **CĐ-B — Theo buổi dạy** *(mới, PT-09)* | Công tính từ **buổi dạy đã diễn ra** mà người đó là giáo viên thực dạy: giờ bắt đầu/kết thúc thực tế của buổi; cộng thời gian chuẩn bị/kết thúc theo tham số | Giáo viên thỉnh giảng, dạy theo tiết, dạy nhiều nơi | Phản ánh đúng lao động. Nhưng phụ thuộc kỷ luật ghi nhận buổi dạy |
| **CĐ-C — Kết hợp** | Công = giờ ca (nếu có ca đăng ký) **hoặc** giờ buổi dạy (nếu không có ca), lấy tổng **không trùng lặp** | Giáo viên vừa trực cơ sở vừa dạy | Sát thực tế nhất, phức tạp nhất |

**Các tình huống cụ thể và cách xử lý đề xuất:**

| Tình huống | Xử lý |
|---|---|
| **Giáo viên dạy nhiều cơ sở trong một ngày** | Mỗi buổi dạy neo vào **điểm chấm công của cơ sở nơi dạy**. Sinh **nhiều cặp vào–ra trong ngày** (cần QT-08). Đơn vị của lượt chấm = nơi dạy; đơn vị quản lý nhân sự = hồ sơ (QT-35). Bảng công hiển thị **cả hai** |
| **Dạy thay** | Đơn "Dạy thay" được duyệt ⇒ công của buổi chuyển sang người dạy thay; người vắng không bị tính thiếu nếu có lý do hợp lệ (§6.4) |
| **Dạy bù** | Buổi bù là một buổi dạy bình thường, tính công như buổi thường. Nếu rơi ngoài ca đã đăng ký ⇒ vẫn tính, gắn nhãn "dạy bù" |
| **Buổi dạy bị huỷ** | Đơn "Nghỉ buổi dạy" được duyệt ⇒ không tính thiếu công của giáo viên. Nếu huỷ do trung tâm ⇒ theo chính sách trả công của trung tâm (**cần chốt — không có trong dữ liệu hệ thống**) |
| **Giáo viên tới sớm chuẩn bị / ở lại dọn** | Tham số "thời gian chuẩn bị / kết thúc" cộng vào mỗi buổi dạy, cấu hình được (đề xuất 15 phút mỗi đầu) `[SUY LUẬN]` |
| **Giáo viên có mặt nhưng không có buổi dạy** (trực, họp, đào tạo) | Vẫn dùng CĐ-A theo ca — đây là lý do cần chế độ kết hợp CĐ-C |
| **Đối soát "có mặt" và "thực dạy"** | Bổ sung **báo cáo đối soát**: buổi dạy có giáo viên thực dạy nhưng **không có lượt chấm nào** trong khung giờ ⇒ cờ bất thường. Ngược lại cũng vậy. **Hiện tại không có cơ chế nào làm việc này** |

**⚠️ Ranh giới không được vượt:** dữ liệu buổi dạy dùng để tính công **giáo viên**. Tuyệt đối **không** dùng vị trí hay sinh trắc của **học viên** cho bất kỳ mục đích nào — xem PHẦN E §7.2.

### 6.12 (e) Màn hình / chức năng cần có

> Mô tả **chức năng**, không vẽ giao diện. Cột "Trạng thái" cho biết làm mới hay nâng cấp cái đã có.

**Nhóm cấu hình (dành cho SUPER_ADMIN / HR)**

| # | Màn hình | Chức năng chính | Trạng thái |
|---|---|---|---|
| M-01 | **Danh mục phương thức chấm công** | Liệt kê, bật/tắt, sửa tham số từng phương thức; xem phương thức đang áp dụng ở đâu | **MỚI** |
| M-02 | **Hồ sơ áp dụng phương thức** | Tạo/sửa "phương thức X cho nhóm Y tại đơn vị Z, hiệu lực từ–đến"; xem trước "nhân viên A hôm nay chấm được bằng cách nào" | **MỚI** |
| M-03 | **Điểm chấm công** | Khai điểm: tên, đơn vị, toạ độ, bán kính, mã QR, danh sách Wi-Fi; **kiểm tra thử vị trí**; cảnh báo điểm chưa có toạ độ | **MỚI** — thay phần toạ độ đang nằm trong hồ sơ cơ sở |

> ⚠️ **Cảnh báo cho M-03 — "xem trên bản đồ" không miễn phí.** Đã rà `package.json`: dự án **không có bất kỳ thư viện bản đồ nào** (không leaflet, không mapbox, không maplibre, không react-map-gl). Thêm bản đồ = **thêm một thư viện giao diện mới** (CLAUDE.md mục Don'ts: *"KHÔNG add UI library mới mà không hỏi"*) **cộng** tải ảnh nền từ máy chủ ngoài (đụng quy ước gọi dịch vụ ngoài — §7.7). **Phải hỏi trước, không tự thêm.**
> **Phương án thay thế không cần thư viện nào:** ô nhập toạ độ + nút "Mở trên Google Maps" ở tab mới + ô "thử tính khoảng cách" từ một toạ độ mẫu để người khai tự kiểm. Đủ cho nghiệp vụ khai điểm.
> **Lưu ý phân biệt:** chức năng **kéo-thả** ở các màn khác **không** có vấn đề này — bảng Kanban lead hiện tại đã dùng kéo-thả HTML5 thuần, không thư viện (`[CODE] app/(admin)/admin/leads/_components/leads-kanban.tsx:148,175-176`). Làm theo mẫu đó là đủ.
| M-04 | **Danh mục ca làm việc** | Khai ca theo đơn vị, có ngày hiệu lực; xem lịch sử thay đổi ca | **NÂNG CẤP** — hàm đọc/ghi cấu hình ca **đã có** (`[CODE] lib/attendance/shift-config.ts:23-82`); việc cần làm là **thêm màn hình khai báo + nối vào đường tính công** (hiện đường tính công đọc hằng số `lib/shifts.ts:8-12`), cộng phần "ngày hiệu lực" chưa có trong bảng |
| M-05 | **Kỳ công** | Khai kỳ theo năm; xem trạng thái từng kỳ; chốt / mở khoá | **MỚI** |
| M-06 | **Ngày nghỉ lễ** | Đã có màn hình `/holidays`; bổ sung liên kết vào công thức tính công | **NÂNG CẤP** |
| M-07 | **Quỹ phép năm** | Cấp phép năm cho từng người, xem đã dùng/còn lại | **MỚI** |

**Nhóm vận hành hằng ngày**

| # | Màn hình | Chức năng chính | Trạng thái |
|---|---|---|---|
| M-08 | **Chấm công (điện thoại)** | Hiện phương thức khả dụng; chạy chuỗi xác thực; báo lỗi rõ nghĩa kèm **đường dự phòng**; hiện lịch sử chấm hôm nay | **NÂNG CẤP** từ `/cham-cong/checkin` |
| M-09 | **Màn hình QR tại quầy** | Hiện QR tĩnh (như hiện tại) hoặc QR động nếu bật; hiện đúng bán kính đọc từ cấu hình (hiện đang ghi cứng "100m" — `[CODE] qr-screen.tsx:52`) | **NÂNG CẤP** |
| M-10 | **Bảng công ngày của cơ sở** | Như hiện tại + cột **phương thức**, cột **điểm chấm**, danh sách **cờ bất thường**; sửa nhanh tại chỗ | **NÂNG CẤP** từ `/cham-cong` |
| M-11 | **Bảng công của tôi** | Cho **mọi nhân viên** (không chỉ giáo viên): xem theo tháng, tổng giờ, các nhãn, gửi phản hồi | **MỚI** — vá DG-23 |
| M-12 | **Hộp cờ bất thường** | Danh sách lượt chấm cần xem lại, lọc theo loại cờ, duyệt/bác hàng loạt | **MỚI** |
| M-13 | **Checklist mở/đóng cơ sở** | Giữ nguyên, nhưng **các mục checklist thành dữ liệu** thay vì cột cứng (vá DG-29) | **NÂNG CẤP** |

**Nhóm lịch ca**

| # | Màn hình | Chức năng chính | Trạng thái |
|---|---|---|---|
| M-14 | **Bảng đăng ký ca** (quản lý mở đợt) | Tạo đợt, chọn người tham gia, đặt hạn, theo dõi ai đã đăng ký | **MỚI** |
| M-15 | **Lịch ca của tôi** | Như hiện tại + **áp dụng mẫu tuần / sao chép tuần / chọn nhiều ngày** | **NÂNG CẤP** — vá ma sát 26 lần bấm |
| M-16 | **Lưới phân ca của cơ sở** | Sửa trực tiếp từng ô **trong hệ thống**; thấy chỗ trống, chỗ vượt định biên; **nút Chốt lịch tháng** | **MỚI** — thay vòng Excel (vá DG-12) |
| M-17 | **Nhập/xuất Excel lịch ca** | Giữ lại làm kênh bổ trợ, nhưng bắt buộc **xem trước + bảng so sánh khác biệt + xác nhận**, không xoá dòng ngoài phạm vi | **NÂNG CẤP** |

**Nhóm đơn từ và chốt công**

| # | Màn hình | Chức năng chính | Trạng thái |
|---|---|---|---|
| M-18 | **Gửi đơn** | Cho mọi nhân viên, 11 loại đơn; đơn chỉnh công nhập **giờ có cấu trúc** | **NÂNG CẤP** từ `/teacher/don-tu` |
| M-19 | **Duyệt đơn** | **Hiện chưa tồn tại.** Danh sách chờ duyệt theo phạm vi, duyệt/từ chối/yêu cầu bổ sung, thấy tác động lên công trước khi duyệt | **MỚI** — vá DG-08 |
| M-20 | **Duyệt chỉnh công** | Như hiện tại nhưng **giờ đề nghị tự điền vào ô duyệt** (vá DG-20) | **NÂNG CẤP** |
| M-21 | **Bảng công kỳ** | Xem theo kỳ, theo cơ sở, theo người; gửi xác nhận; chốt kỳ | **MỚI** |
| M-22 | **Xác nhận bảng công của tôi** | Nhân viên xem bảng công kỳ, xác nhận hoặc phản hồi | **MỚI** |
| M-23 | **Nhật ký chấm công** | Xem ai sửa gì, khi nào, lý do; lọc theo người/ngày/loại thao tác | **MỚI** — bảng nhật ký đã có dữ liệu nhưng **chưa ai đọc được** (DG-22) |

### 6.13 (f) Báo cáo và chỉ số

**Báo cáo cần có**

| # | Báo cáo | Nội dung | Người dùng |
|---|---|---|---|
| BC-01 | **Bảng công kỳ** (bảng tính + bản in ký duyệt) | Ngày công, giờ công, giờ làm thêm, nghỉ theo loại, số lần muộn/sớm — theo người, theo cơ sở | HR, Kế toán, Ban giám đốc |
| BC-02 | **Bảng công chi tiết theo ngày** | Từng ngày: ca, lượt chấm, phương thức, giờ công, nhãn, đơn đã áp | HR, Quản lý cơ sở |
| BC-03 | **Báo cáo cờ bất thường** | Theo loại cờ, theo cơ sở, theo người; xu hướng theo tuần | Quản lý cơ sở, HR |
| BC-04 | **Báo cáo ngưỡng pháp luật lao động** | Ai vượt 12 giờ/ngày, 48 giờ/tuần, 40 giờ làm thêm/tháng, 200 giờ/năm | HR, Ban giám đốc |
| BC-05 | **Báo cáo quỹ phép** | Đã cấp / đã dùng / còn lại, theo người | HR |
| BC-06 | **Báo cáo đối soát giáo viên** | Buổi dạy có / không có lượt chấm tương ứng; lượt chấm không gắn buổi dạy nào | Đào tạo, Quản lý cơ sở |
| BC-07 | **Báo cáo tuân thủ lịch ca** | Tỉ lệ đăng ký đúng hạn, số lần đổi khẩn cấp, số ô trống trong lưới phân ca | Quản lý cơ sở |
| BC-08 | **Nhật ký thao tác chấm công** | Ai sửa gì khi nào, thao tác hàng loạt và phá huỷ | SUPER_ADMIN, kiểm toán nội bộ |

**Chỉ số theo dõi**

| Chỉ số | Định nghĩa | Ngưỡng cảnh báo đề xuất `[SUY LUẬN]` |
|---|---|---|
| Tỉ lệ ngày công đầy đủ | Số ngày có đủ cặp vào–ra ÷ số ngày có ca | < 95 % |
| Tỉ lệ thiếu check-out | Số ngày thiếu lượt ra ÷ số ngày có lượt vào | > 5 % |
| Tỉ lệ lượt chấm bị gắn cờ | Lượt có cờ ÷ tổng lượt | > 10 % |
| Tỉ lệ chấm bằng đường dự phòng | Lượt dùng PT-08 ÷ tổng lượt | > 15 % (dấu hiệu phương thức chính đang hỏng) |
| Thời gian duyệt đơn trung bình | Từ lúc gửi tới lúc có kết quả | > 2 ngày làm việc |
| Số đơn quá hạn chưa xử lý | Đếm | > 0 |
| Số ngày từ hết kỳ tới chốt kỳ | Đếm | > 5 ngày làm việc |
| Số người vượt ngưỡng làm thêm | Đếm theo tháng | > 0 (báo cáo bắt buộc) |
| Số lần mở khoá kỳ đã chốt | Đếm theo quý | > 1 (dấu hiệu quy trình có vấn đề) |

---

## 7. PHẦN E — RÀNG BUỘC VÀ RỦI RO

### 7.1 Pháp lý về dữ liệu cá nhân

> ⚠️ **Cảnh báo căn cứ:** nhiều tài liệu nội bộ vẫn dẫn **Nghị định 13/2023/NĐ-CP** — văn bản này **không còn là căn cứ chủ đạo**. Từ **01/01/2026**, **Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15** và **Nghị định 356/2025/NĐ-CP** có hiệu lực; Nghị định 356/2025 **thay thế** Nghị định 13/2023. Trang chính sách bảo mật công khai của Sata Robo vẫn ghi căn cứ cũ (`[CODE] app/(public)/chinh-sach-bao-mat/page.tsx:7,23`) — **sai căn cứ pháp lý hiển thị công khai**, sửa được ngay, không đụng phân quyền.

**Điểm cốt lõi ảnh hưởng trực tiếp module chấm công:**

| # | Nội dung | Nguồn |
|---|---|---|
| PL-01 | **Toạ độ định vị của cá nhân là dữ liệu cá nhân NHẠY CẢM** theo danh mục Nghị định 356/2025 | `[WEB] https://luatvietnam.vn/thong-tin/nghi-dinh-356-2025-nd-cp-quy-dinh-chi-tiet-luat-bao-ve-du-lieu-ca-nhan-422896-d1.html` — `[CHƯA KIỂM CHỨNG]` số hiệu điểm cụ thể, **nhưng bản chất kết luận thì chắc chắn**, được xác nhận chéo nhiều nguồn |
| PL-02 | **Dữ liệu sinh trắc học (vân tay, khuôn mặt) là dữ liệu NHẠY CẢM** | như trên |
| PL-03 | Trong quan hệ lao động, doanh nghiệp **được** áp dụng biện pháp công nghệ để quản lý lao động, **nhưng gắn điều kiện "người lao động được thông báo đầy đủ về biện pháp đó"** | `[WEB] https://mps.gov.vn/chinh-sach-phap-luat/bai-viet/bao-ve-du-lieu-ca-nhan-trong-mot-so-hoat-dong-1754989261` |
| PL-04 | **Phải xoá/huỷ dữ liệu cá nhân của người lao động khi chấm dứt hợp đồng lao động**, trừ khi có thoả thuận khác hoặc pháp luật quy định khác | `[WEB] https://lsvn.vn/tu-nam-2026-doanh-nghiep-phai-xoa-du-lieu-ca-nhan-cua-nguoi-lao-dong-khi-nghi-viec-a167358.html` |
| PL-05 | Xử lý dữ liệu nhạy cảm phải có **hồ sơ đánh giá tác động** (Mẫu số 10), nộp Cục A05 — Bộ Công an, cập nhật định kỳ 6 tháng | `[WEB] https://luatvietnam.vn/linh-vuc-khac/huong-dan-danh-gia-tac-dong-xu-ly-du-lieu-ca-nhan-883-103703-article.html` |
| PL-06 | Miễn trừ cho doanh nghiệp nhỏ **có ngoại lệ** — không áp dụng cho đơn vị **xử lý dữ liệu nhạy cảm**. `[SUY LUẬN]` Sata Robo đang lưu toạ độ nhân viên ⇒ **nhiều khả năng KHÔNG được miễn trừ** dù quy mô nhỏ | `[WEB] EY — https://www.ey.com/vi_vn/technical/tax/tax-and-law-updates/nghi-dinh-so-356-2025-nd-cp-quy-dinh-chi-tiet-mot-so-dieu-va-bien-phap-thi-hanh-luat-bao-ve-du-lieu-ca-nhan` — `[CHƯA KIỂM CHỨNG]` |
| PL-07 | Chế tài: vi phạm chung tối đa **3 tỷ đồng** với tổ chức; chuyển dữ liệu xuyên biên giới trái quy định phạt tới **5 % doanh thu năm trước** | `[WEB] https://thuvienphapluat.vn/hoi-dap-phap-luat/trong-luat-bao-ve-du-lieu-ca-nhan-nam-2025-muc-phat-tien-toi-da-trong-xu-phat-vi-pham-hanh-chinh-do-138073320.html` |

**Khoảng cách hiện tại so với luật — đã kiểm chứng trong mã nguồn:**

| Mã | Vấn đề | Bằng chứng | Mức |
|---|---|---|---|
| PL-G1 | **Không có thông báo xử lý dữ liệu trước khi lấy vị trí.** Toàn bộ nội dung hiển thị cho nhân viên là một dòng *"Cần bật định vị (GPS) khi chấm công"* — không nêu mục đích, phạm vi, thời hạn lưu, quyền rút lại, không nêu đây là dữ liệu nhạy cảm | `[CODE] app/(admin)/admin/cham-cong/checkin/_components/checkin-client.tsx:66` | **CAO** |
| PL-G2 | **Không có bất kỳ bản ghi đồng ý nào cho nhân viên.** Cơ chế đồng ý hiện có chỉ phục vụ **hình ảnh học viên**, chỉ một loại | `[CODE] prisma/schema.prisma:631-651` | **CAO** |
| PL-G3 | **Lưu toạ độ thô vĩnh viễn.** Không có cột hết hạn, không có tác vụ xoá. Trong 15 tác vụ định kỳ hiện có, **không có tác vụ nào** dọn dữ liệu chấm công | `[CODE] prisma/schema.prisma:4065-4084`; danh sách `app/api/cron/` | **CAO** |
| PL-G4 | **Không có hồ sơ đánh giá tác động** cho hoạt động xử lý dữ liệu vị trí | không tìm thấy hồ sơ nào trong repo | **CAO** |
| PL-G5 | **Không có phương thức chấm công thay thế** cho người từ chối chia sẻ vị trí ⇒ "đồng ý" không thể coi là tự nguyện | `[CODE] app/(admin)/admin/cham-cong/actions.ts:64-66` | TRUNG BÌNH |
| PL-G6 | **Cơ chế lưu trữ/xoá duy nhất trong hệ thống chỉ áp cho học viên**, dùng **một biến môi trường duy nhất toàn hệ thống**, và **chỉ đếm rồi ghi log, không xoá gì** | `[CODE] lib/compliance/retention.ts:11, 20-51` | TRUNG BÌNH |

**Khuyến nghị rẻ nhất và hiệu quả nhất — tối thiểu hoá dữ liệu:**

Nghiệp vụ chấm công chỉ cần biết **"có trong bán kính hay không"** và **"cách bao xa"** — cả hai đã được lưu sẵn (`distanceMeters`, `withinGeofence`). **Toạ độ thô gần như không phục vụ nghiệp vụ nào**, nó chỉ dùng khi có tranh chấp. Nếu tính khoảng cách ở máy chủ rồi **không lưu toạ độ thô** (hoặc chỉ lưu dạng làm tròn và tự xoá sau N ngày), khối lượng nghĩa vụ pháp lý **giảm mạnh** vì cái còn lại không còn là "vị trí của cá nhân xác định qua dịch vụ định vị". `[SUY LUẬN]` Đây là thay đổi **rẻ nhất, hiệu quả nhất, và không đụng phân quyền** — đã đưa vào tham số "Dữ liệu được lưu lại" của PT-02 (§6.6) và vào Giai đoạn 1 của lộ trình.

**Xung đột nghĩa vụ lưu trữ và cách giải:**

| Nhóm dữ liệu | Khi người lao động nghỉ việc | Lý do |
|---|---|---|
| Bảng công kỳ đã chốt (ngày công, giờ làm thêm) | **GIỮ 10 năm** | Là chứng từ dùng để tính lương ⇒ thuộc diện lưu chứng từ kế toán `[WEB] https://lawkey.vn/thoi-han-luu-tru-tai-lieu-ke-toan-theo-quy-dinh-phap-luat/` |
| Sổ quản lý lao động | Giữ theo quy định lao động | Điều 12 Bộ luật Lao động 2019, Điều 3 Nghị định 145/2020 |
| **Toạ độ thô của từng lượt chấm** | **XOÁ** | Không phải chứng từ kế toán, hết mục đích sau khi bảng công đã chốt |
| Ảnh minh chứng, dữ liệu sinh trắc (nếu có) | **XOÁ** | như trên |

⇒ **Yêu cầu chức năng rút ra:** hệ thống phải phân biệt được **"dữ liệu chứng từ"** và **"dữ liệu vận hành thô"** ngay ở tầng dữ liệu, và có quy trình xoá chọn lọc. Hiện tại **không có** sự phân biệt này — bản ghi lượt chấm gộp cả hai.

### 7.2 CẤM TUYỆT ĐỐI — không định vị và không sinh trắc cho HỌC SINH

> **Đây là ràng buộc cứng của dự án, không phải khuyến nghị.**

| Nội dung | Bằng chứng |
|---|---|
| Mã nguồn ghi chốt cứng: *"⚠️ CHỈ dùng cho chấm công NHÂN VIÊN — KHÔNG bao giờ cho học sinh (privacy chốt cứng)"* | `[CODE] lib/attendance/geofence.ts:2` |
| Blueprint kiến trúc chốt: *"Geofence CHỈ cho nhân viên (R5)"*; AI camera / sinh trắc / định vị học sinh nằm trong **phạm vi đã loại** | `[FILE] Document/2-architecture-design/15-final-architecture-blueprint.md:34, 747, 1081`; `[FILE] CLAUDE.md:113` |
| **Có kiểm thử tự động cưỡng chế**: khẳng định bản ghi chấm công nhân viên **có** trường toạ độ, còn hồ sơ học viên **không có bất kỳ trường nào** khớp mẫu `latitude / longitude / gpsLat / geoLat` | `[CODE] lib/attendance/hr-r5.test.ts:40-51` |
| Toàn repo không có dòng mã nào về sinh trắc / vân tay / khuôn mặt | đã rà, chỉ trúng tài liệu, không trúng mã nguồn |

**Hệ quả bắt buộc cho BA mới:**

1. Danh mục phương thức chấm công ở §6.6 **chỉ áp dụng cho nhân viên và giáo viên**. Không có phương thức nào áp cho học viên.
2. PT-09 (chấm công theo buổi dạy) dùng dữ liệu **buổi dạy và giáo viên thực dạy** — **không** dùng vị trí hay sinh trắc của học viên.
3. **PT-11 / PT-12 (sinh trắc cho NHÂN VIÊN) hiện NẰM NGOÀI PHẠM VI**, không phải "TẮT mặc định chờ phê duyệt" — vì dòng `:1081` của Doc 15 viết "sinh trắc học" **không kèm giới hạn đối tượng**. Xem §5.1-bis và **CH-11**. Nếu Ban giám đốc mở phạm vi (kèm sửa Doc 15 §0 bằng văn bản), **kiểm thử cưỡng chế trên phải được giữ nguyên và mở rộng** để đảm bảo dữ liệu sinh trắc không bao giờ chạm tới bảng học viên.
4. Mọi đề xuất "dùng camera lớp học để điểm danh học viên" đều **nằm ngoài phạm vi** và phải bị từ chối ở cửa BA.

### 7.3 Ràng buộc Bộ luật Lao động

| Nội dung | Quy định | Nguồn |
|---|---|---|
| Giờ làm bình thường | **≤ 8 giờ/ngày** và **≤ 48 giờ/tuần**; nếu tính theo tuần thì ≤ 10 giờ/ngày | `[WEB] https://thuvienphapluat.vn/lao-dong-tien-luong/luat-lao-dong-quy-dinh-ve-thoi-gio-lam-viec-cua-nguoi-lao-dong-nhu-the-nao-34960.html` (Điều 105 Bộ luật Lao động 2019) |
| Giới hạn làm thêm | ≤ 50 % giờ làm bình thường trong ngày; tổng giờ bình thường + làm thêm **≤ 12 giờ/ngày**; **≤ 40 giờ/tháng**; **≤ 200 giờ/năm** (đặc biệt tới 300) | `[WEB] https://baochinhphu.vn/lam-them-gio-the-nao-la-dung-quy-dinh-102240130085419703.htm` (Điều 107) |
| Sổ quản lý lao động | Bắt buộc lập, cập nhật từ ngày người lao động bắt đầu làm việc, xuất trình khi cơ quan quản lý yêu cầu. Không lập ⇒ phạt 10–20 triệu với tổ chức | `[WEB] https://thuvienphapluat.vn/lao-dong-tien-luong/lap-va-su-dung-so-quan-ly-lao-dong-nhu-the-nao-la-dung-quy-dinh-14402.html` |
| **Tiền lương làm thêm giờ** | Làm thêm ngày thường ≥ **150 %**; ngày nghỉ hằng tuần ≥ **200 %**; ngày lễ, tết, ngày nghỉ có hưởng lương ≥ **300 %** (chưa kể tiền lương ngày lễ với người hưởng lương ngày) — **Điều 98 Bộ luật Lao động 2019** | ⚠️ `[CHƯA KIỂM CHỨNG]` **chưa mở được nguồn gốc trong đợt lập tài liệu này.** Số điều và ba mức % lấy theo hiểu biết phổ thông về Điều 98, **phải đối chiếu bản gốc Công báo và xin Kế toán xác nhận trước khi đưa vào công thức tính lương**. Đây là căn cứ của dòng "hệ số trả lương làm thêm" ở §6.10 |

⇒ **QT-26 (cảnh báo 4 ngưỡng) không phải tính năng "nếu có thì tốt"** — thanh tra lao động hỏi thẳng con số này. Với trung tâm dạy ca tối và cuối tuần, ngưỡng **40 giờ làm thêm/tháng rất dễ vượt** `[SUY LUẬN]`.

### 7.4 Cách ly đa cơ sở và cơ sở nhượng quyền

**Hiện trạng mỏng tới mức nào** — trích chính tài liệu nội bộ: *"dữ liệu tài chính và dữ liệu cá nhân trẻ em của hai pháp nhân đang nằm chung một không gian, **cách nhau đúng một bộ lọc `centerId`**"* (`[FILE] docs/taicautruc/02-prd-franchise-platform.md:69`).

**Câu hỏi gốc chưa chốt** — mọi thứ khác treo theo: *"Chốt vai trò theo pháp luật bảo vệ dữ liệu: Hội sở là bên kiểm soát và bên nhận quyền là bên xử lý thay, hay mỗi bên là một bên kiểm soát riêng"* (R-DP-01, `[FILE] docs/taicautruc/02-prd-franchise-platform.md:341`).

| Phương án | Nghĩa là | Hệ quả cho module chấm công |
|---|---|---|
| **A — Mỗi pháp nhân là một bên kiểm soát độc lập** | Bên nhận quyền tự chịu trách nhiệm dữ liệu nhân viên của mình | Mỗi bên tự lập hồ sơ đánh giá tác động, tự trả lời yêu cầu của chủ thể. Hội sở **không** xem chi tiết công/lương nhân viên bên nhận. Rủi ro cho Hội sở **thấp nhất** |
| **B — Hội sở là bên kiểm soát, bên nhận là bên xử lý** | Hội sở quyết định mục đích | Cần hợp đồng xử lý dữ liệu cá nhân giữa hai bên; **Hội sở chịu trách nhiệm cho sai sót của bên nhận**. Rủi ro **cao nhất** |

`[SUY LUẬN]` **Khuyến nghị phương án A** — và module chấm công thiết kế theo hướng đó: dữ liệu công của cơ sở nhượng quyền **không** hiển thị chi tiết cho Hội sở, Hội sở chỉ thấy số tổng hợp.

**Các khoảng trống đã được tài liệu nội bộ liệt kê sẵn, liên quan trực tiếp chấm công:**

| Mã | Nội dung | Vị trí |
|---|---|---|
| R-DP-02 | Cần vai trò **"người phụ trách dữ liệu" theo đơn vị**; hiện chỉ SUPER_ADMIN của Hội sở làm được việc xoá/ẩn danh/kết xuất | `[FILE] 02-prd-franchise-platform.md:342` |
| R-DP-03 | **Thời hạn lưu trữ khai theo đơn vị**; hiện là một biến môi trường duy nhất toàn hệ thống | `:343` |
| R-DP-07 | Mọi **kết xuất** chứa dữ liệu cá nhân phải giới hạn theo phạm vi + ghi nhật ký + có dấu nhận diện người tải | `:347` |

⚠️ R-DP-07 **đã được làm đúng ở đúng một chỗ** trong module chấm công — chức năng xuất Excel lịch ca có sheet dấu nhận diện + ghi nhật ký kiểm toán (`[CODE] app/api/admin/cham-cong/shift-export/route.ts:80-97`). Đây là **mẫu tốt duy nhất** trong module, nên nhân rộng cho BC-01 và BC-02.

### 7.5 Xung đột với cửa sổ shadow-compare RBAC và đợt siết bảo mật

**Trạng thái hiện tại:**

| Sự kiện | Nội dung | Bằng chứng |
|---|---|---|
| Cờ RBAC v2 | **đang TẮT**; production đang enforce ma trận tĩnh | `[CODE] lib/flags.ts`; `[FILE] CLAUDE.md` |
| 🔴 **Trạng thái đồng hồ shadow** | **CHƯA CHẠY** — bị chặn bởi kiểm tra tiền đề P1 (**3 nhân viên thiếu `UserOrgRole`**); **số ngày sạch = 0**; mốc bấm đồng hồ = *(chưa)* | `[FILE] docs/ke-hoach-go-live-2607/shadow-log.md:22-23` |
| **Điều kiện để BẤM được đồng hồ** | *"chỉ được bấm khi **preflight coverage = 0** (mọi nhân viên đều có `UserOrgRole` ACTIVE)"* ⇒ việc chặn là **gán `UserOrgRole` cho 3 nhân viên** — hiện **chưa ai được giao, chưa có hạn**. Tài liệu CRM đã đưa thành việc **F0-10**; hai module **dùng chung** mắt xích này | `[FILE] shadow-log.md:9` |
| Điều kiện lật cờ | **3–5 ngày liên tiếp 0 lệch trên lưu lượng thật** | `[FILE] shadow-log.md:3` |
| **Quy tắc vàng** | Mọi thay đổi làm đổi hành vi v2 ⇒ **xoá bảng lệch và đếm lại từ đầu** | `[FILE] shadow-log.md:13-15` |
| Tiền lệ trong chính module này | Hành động `hr_attendance:adjust` **đã từng gây 25 lệch trên production ngày 10/07** | `[CODE] lib/auth/rbac-scope.test.ts:51` |
| Tiền lệ thứ hai | Phạm vi của `hr_attendance:view` từng làm **mất menu Chấm công** của quản lý cơ sở — đã có kiểm thử hồi quy | `[CODE] lib/auth/menu-permissions.test.ts:156-173` |

**Phân loại mọi việc trong lộ trình theo mức đụng chạm:**

| ✅ KHÔNG đụng shadow — làm được ngay | 🔴 CÓ đụng shadow — phải đợi sau khi lật cờ |
|---|---|
| Thêm bảng mới cho phép trống: danh mục phương thức, hồ sơ áp dụng, điểm chấm công, bản ghi công ngày, kỳ công, quỹ phép | Thêm hành động quyền mới (`hr_attendance:config`, `:approve-request`, `:close-period`, `:export`, `:view-location`) |
| Thêm cột "phương thức", "điểm chấm" vào bản ghi lượt chấm | Đổi danh sách vai trò của 3 hành động hiện có (ví dụ thêm `TRAINING` vào quyền tự chấm, cho HR quyền chỉnh công) |
| Nối bảng cấu hình ca vào runtime, sửa lệch giờ ca | Đổi kiểu phạm vi trong cấu hình quyền động |
| Ngừng lưu toạ độ thô | Thêm vai trò "người phụ trách dữ liệu theo đơn vị" (R-DP-02) |
| Thêm tác vụ định kỳ dọn dữ liệu quá hạn, thêm thông báo nhắc việc | Thay việc kiểm tra vai trò trần bằng kiểm tra quyền chuẩn ở hàm duyệt đơn từ (`[CODE] app/(teacher)/teacher/don-tu/_actions.ts:94-96`) |
| Màn hình mới **dùng lại đúng 3 hành động quyền cũ** với đối tượng đơn vị đúng chuẩn | Đưa mô hình đơn từ vào tầng cách ly (hiện **cố ý** nằm ngoài — `[CODE] lib/db-scope.ts:75-78`) |
| Sửa căn cứ pháp lý trên trang chính sách | |

**Ranh giới cần người phụ trách RBAC xác nhận trước khi làm:** thêm các bảng mới **vào tầng cách ly theo đơn vị** (CL-01). Về nguyên tắc tầng cách ly khác tầng quyền, nhưng nó **đổi hành vi đọc**, và đã có tiền lệ việc đổi tầng này dẫn tới **đặt lại đồng hồ shadow**.

⚠️ **Bẫy nguy hiểm nhất:** thêm hành động quyền vào ma trận tĩnh (v1) mà **quên** thêm vào cấu hình động (v2) ⇒ sinh **lệch giả**, làm bẩn số liệu quyết định lật cờ. Cảnh báo này đã ghi sẵn trong mã nguồn (`[CODE] lib/auth/permissions.ts:301`).

### 7.6 Phụ thuộc nhà cung cấp và chi phí

| Hạng mục | Phụ thuộc | Chi phí | Ghi chú |
|---|---|---|---|
| PT-01, PT-02 (đang chạy) | Không có | ~0 | Tự làm hoàn toàn |
| PT-03 QR động | Không phụ thuộc phần mềm ngoài, nhưng **cần thiết bị hiển thị ở mỗi cơ sở** | 3–8 triệu/cơ sở `[SUY LUẬN]` + điện + người trông | Chi phí **nhân theo số cơ sở** — cân nhắc kỹ với định hướng mở rộng |
| PT-04 Wi-Fi | Điểm phát sẵn có | ~0 | Cần khai định danh điểm phát, đổi thiết bị mạng phải khai lại |
| PT-07 Ảnh minh chứng | Kho lưu trữ hiện có | Chi phí lưu trữ tăng dần | Phải có thời hạn xoá |
| PT-11 Máy chấm công | Nhà cung cấp phần cứng | 3–15 triệu/máy `[SUY LUẬN]` | Ngoài phạm vi đợt này |
| PT-12 Nhận diện khuôn mặt | Nhà cung cấp dịch vụ AI | Phí dịch vụ + **chi phí tuân thủ cao nhất** | 🔴 TẮT mặc định |
| Mua MISA AMIS Chấm công thay vì tự làm | Phụ thuộc hoàn toàn MISA | **Giá không công khai** — phải xin báo giá `[WEB] https://amis.misa.vn/amis-cham-cong/` | Xem CH-10 |

**Nếu chọn mua MISA thay vì tự làm — những thứ sẽ mất:** ba loại đơn đặc thù đào tạo (MISA **không cho tạo loại đơn mới**), mô hình chấm công theo buổi dạy (MISA không có), cách ly dữ liệu ở tầng truy vấn, và khả năng gắn chấm công vào cùng hệ thống với LMS/CRM/lịch lớp. **Cộng thêm** bài toán đồng bộ nhân sự hai chiều giữa hai hệ thống.

### 7.7 Tầng cổng gọi dịch vụ ngoài — điều kiện tiên quyết dùng CHUNG với module CRM

> Mục này được bổ sung sau khi rà chéo với tài liệu song sinh. **Tài liệu CRM coi đây là điều kiện tiên quyết; tài liệu này trước đó không nhắc một chữ** — trong khi module chấm công có ít nhất ba đề xuất gọi ra ngoài.

**Hiện trạng:**

| Nội dung | Bằng chứng |
|---|---|
| `CLAUDE.md` quy định: mọi lời gọi dịch vụ ngoài (Resend / Zalo / MISA / Meta / CAPI / GA4) **CHỈ đi qua `modules/integration`** | `[FILE] CLAUDE.md` mục "Kiến trúc đích" |
| **`modules/` KHÔNG TỒN TẠI** — `ls modules` báo không có thư mục; chính `CLAUDE.md:72` tự khai *"`modules/*` … CHƯA TỒN TẠI — đừng import `modules/integration`"* | đã rà trực tiếp |

⇒ Quy ước "đi qua `modules/integration`" hiện là **mong muốn kiến trúc, không phải hiện trạng**. Mã tích hợp đang nằm rải ở `lib/zalo/`, `lib/misa/`, `lib/email/`, `lib/tracking.ts`.

**Những đề xuất của module chấm công phụ thuộc quyết định này:**

| Đề xuất | Gọi gì ra ngoài |
|---|---|
| Giai đoạn 3 việc 7 — **nhắc việc chủ động** (chưa check-out, đơn quá hạn, sắp hết hạn đăng ký ca) | Email (Resend) và/hoặc Zalo ZNS |
| Báo cáo BC-01 → BC-08 nếu có gửi định kỳ | Email |
| PT-11 (máy chấm công) nếu Ban giám đốc mở phạm vi | Công cụ/đầu nối đồng bộ của nhà cung cấp phần cứng |
| PT-12 (nhận diện khuôn mặt) nếu Ban giám đốc mở phạm vi | Dịch vụ AI của bên thứ ba — **kèm việc chuyển dữ liệu sinh trắc ra ngoài**, chạm PL-02 và có thể chạm nghĩa vụ chuyển dữ liệu xuyên biên giới (PL-07) |

**Yêu cầu bắt buộc:**

| # | Nội dung |
|---|---|
| 1 | **Hai tài liệu dùng CHUNG một quyết định** — câu **Q4** của tài liệu CRM (`docs/ba-crm-hien-trang-va-misa.md` §G): *"Có dựng tầng cổng `modules/integration` trước không?"*. **Không được để module CRM đặt mã tích hợp ở một chỗ còn module chấm công đặt ở chỗ khác.** |
| 2 | **Không được viết tiêu chí nghiệm thu dạng "đi qua `modules/integration`"** như thể tầng đó đã có. Cùng cảnh báo với tài liệu CRM. |
| 3 | Cho tới khi Q4 có trả lời: mọi thông báo của Giai đoạn 3 **dùng lại hàng đợi email đã có** (`lib/email/`), **không** mở đầu nối mới nào. |
| 4 | PT-11 / PT-12 hiện **ngoài phạm vi** (§5.1-bis) nên chưa phát sinh nhu cầu, nhưng nếu CH-11 mở phạm vi thì **Q4 trở thành điều kiện chặn** của việc đó. |

---

## 8. PHẦN F — LỘ TRÌNH ĐỀ XUẤT

> Ưu tiên theo **giá trị ÷ công sức**, và theo nguyên tắc: **việc không đụng phân quyền làm trước**, việc đụng phân quyền đợi sau khi đồng hồ shadow chốt.
> Ước lượng thời gian là **thô** `[SUY LUẬN]`, chưa qua đội kỹ thuật.

### Giai đoạn 0 — Vá gấp và làm rõ (1 tuần, làm song song mọi thứ)

| Mục tiêu | Dựng nền đúng trước khi xây, và chặn hai rủi ro đang chảy máu |
|---|---|
| **Việc chính** | 1. **Kiểm chứng vận hành DG-32**: giáo viên thuần có vào được trang chấm công không — dùng một tài khoản giáo viên thật thử trên môi trường thử nghiệm. Nếu không vào được thì **đang có người không chấm công được mà không ai biết**.<br>2. **Kiểm chứng dữ liệu thật** (một truy vấn chỉ-đọc): mấy cơ sở đã khai toạ độ; có bao nhiêu bản ghi công có đơn vị để trống; có bao nhiêu lượt bị chặn vì ngoài vùng.<br>3. **Xác nhận vai trò `TRAINING` thiếu quyền tự chấm công là lỗi hay chủ ý** (**DG-34** trong bảng đứt gãy §3.6).<br>4. **Sửa lệch giờ ca giữa hai nguồn** (DG-03) — thống nhất về giờ đang chạy thật.<br>5. **Sửa căn cứ pháp lý** trên trang chính sách và trong chú thích mã nguồn.<br>6. **Hỏi luật sư 3 câu** ở CH-07.<br>7. **Ban giám đốc chốt CH-05** (có ngừng lưu toạ độ thô không) — **chặn Giai đoạn 1 việc 5**; nếu chọn phương án giữ toạ độ thì khối lượng Giai đoạn 1 đổi hẳn.<br>8. **Ban giám đốc chốt CH-11** (có mở đường sinh trắc cho nhân viên không, có sửa Doc 15 §0 không) — chặn PT-11/PT-12; nếu để ngỏ thì hai phương thức này ở ngoài phạm vi.<br>9. **HR / Kế toán xác nhận CH-12** (người làm ca chiều + ca tối chồng giờ được tính 7h30 hay 8h) — chặn thuật toán ghép cặp §6.3-bis, tức chặn Giai đoạn 2. |
| **Điều kiện hoàn thành** | Có câu trả lời bằng văn bản cho cả 9 mục; không mục nào còn ở trạng thái phỏng đoán |
| **Phụ thuộc** | Cần một người có quyền đọc dữ liệu production và một tài khoản giáo viên thử nghiệm |
| **Đụng shadow?** | ❌ Không |

### Giai đoạn 1 — Nền cấu hình (≈3 tuần)

| Mục tiêu | Biến "phương thức chấm công" và "ca làm việc" từ mã nguồn thành **dữ liệu**, mà **không đổi một dòng hành vi nào** với người dùng cuối |
|---|---|
| **Việc chính** | 1. Danh mục phương thức (M-01) + hồ sơ áp dụng (M-02) + điểm chấm công (M-03) + danh mục ca (M-04).<br>2. Nhập sẵn PT-01 và PT-02 với **đúng tham số đang chạy**.<br>3. Bổ sung cột "phương thức" và "điểm chấm" vào bản ghi lượt chấm (cho phép trống).<br>4. Chạy bước B2 rồi B3 của đường chuyển tiếp (§6.8): ghi song song, đọc cấu hình, đối chiếu ngầm.<br>5. **Xử lý toạ độ thô — PHỤ THUỘC CH-05, chưa được chốt:**<br>  · *Nếu CH-05 chọn phương án 1 (khuyến nghị BA):* **ngừng lưu toạ độ thô**, chỉ giữ khoảng cách + trong/ngoài vùng — việc pháp lý rẻ nhất, hiệu quả nhất.<br>  · *Nếu CH-05 chọn phương án 2 (giữ toạ độ):* đổi thành **bổ sung thông báo xử lý dữ liệu + bản ghi đồng ý + thời hạn xoá + khởi động hồ sơ đánh giá tác động** — **khối lượng lớn hơn nhiều và phải viết lại mục này**.<br>6. Tác vụ định kỳ dọn dữ liệu xác thực quá hạn. |
| **Điều kiện hoàn thành** | Báo cáo đối chiếu **0 lệch trong 5 ngày làm việc liên tiếp** giữa cấu hình mới và logic cũ; thêm một cơ sở giả lập chỉ bằng thao tác nhập dữ liệu, không sửa mã |
| **Phụ thuộc** | Giai đoạn 0 mục 4 **và mục 7 (CH-05)** — không chốt CH-05 thì việc 5 không bắt đầu được |
| **Đụng shadow?** | ❌ Không — bảng mới, cột cho phép trống, tái sử dụng 3 hành động quyền cũ |
| **Giá trị** | ⭐⭐⭐⭐⭐ Giải trực tiếp yêu cầu trung tâm + giảm mạnh rủi ro pháp lý |

### Giai đoạn 2 — Ghi nhận công đúng và lịch ca trong hệ thống (≈5–9 tuần — xem ghi chú ước lượng)

> ⚠️ **Con số "3 tuần" ở bản trước là SAI vì bỏ sót hai thay đổi cấu trúc dữ liệu phá vỡ (§6.8-bis).** Ước lượng lại: phần nghiệp vụ ≈3 tuần **+ 2–3 tuần** cho việc bỏ/đổi ràng buộc duy nhất trên bản ghi lượt chấm **+ 2–3 tuần** cho việc chuyển ca từ mảng enum sang danh mục dữ liệu (nếu chọn đường Đ-2). `[SUY LUẬN]` — đội kỹ thuật phải ước lượng lại.
> **Cắt gọn được:** hoãn ca thứ tư (giữ enum 3 ca, chỉ làm việc nhiều lượt/ngày) ⇒ còn **≈5–6 tuần**.

| Mục tiêu | Chấm công phản ánh đúng thực tế làm việc, và bỏ vòng Excel phá huỷ |
|---|---|
| **Việc chính** | 0. **§6.8-bis (1) — bỏ/đổi ràng buộc `@@unique([userId, type, qrToken])` + đổi quy ước sinh `qrToken`**, theo phương án 2 pha (thêm bảng lượt chấm mới song song → ghi kép → đối chiếu → cắt sang → mới bỏ ràng buộc cũ). **Đây là điều kiện của việc 1 dưới đây, không phải việc phụ.**<br>0b. **§6.8-bis (2) — đường đi từ `WorkShift[]` sang danh mục ca dạng dữ liệu** (2 pha + backfill toàn bộ `ShiftRegistration` lịch sử). **Bỏ việc này thì không mở được ca thứ tư.**<br>1. **Nhiều lượt vào/ra mỗi ngày** (QT-08) — vá mâu thuẫn nội tại lớn nhất; áp **thuật toán ghép cặp §6.3-bis** và **7 ví dụ nghiệm thu** ở đó.<br>2. **Khung giờ chấm công** (QT-11).<br>3. **Bản ghi công ngày được lưu** kèm phiên bản tham số (QT-21).<br>4. **PT-08 quản lý xác nhận** — đường dự phòng bắt buộc, cũng là phương án thay thế cho người từ chối chia sẻ vị trí.<br>5. **Chuyển công tắc** (bước B4) sang quyết định bằng cấu hình mới, giữ đường lùi 30 ngày.<br>6. **Lưới phân ca trong hệ thống** (M-16) + bảng đăng ký ca có thời hạn (M-14) + sao chép tuần (M-15).<br>7. Nhập Excel có xem trước và bảng so sánh khác biệt, **không xoá dòng ngoài phạm vi** (QT-20).<br>8. **Nhật ký kiểm toán** cho mọi thao tác hàng loạt và phá huỷ. |
| **Điều kiện hoàn thành** | **Chạy đúng cả 7 ví dụ nghiệm thu §6.3-bis**; một người làm ca sáng + ca tối chấm đủ được công; nhập Excel thiếu dòng **không** làm mất lịch của ai; mọi thao tác chốt lịch đều truy được ai làm lúc nào; **số liệu công lịch sử không đổi một phút nào sau khi backfill** |
| **Phụ thuộc** | Giai đoạn 1; **và Giai đoạn 0 mục 9 (CH-12)** — không chốt cách tính ca chồng giờ thì không viết được thuật toán ghép cặp |
| **Đụng shadow?** | ⚠️ **Ranh giới** — các bảng mới cần vào tầng cách ly theo đơn vị. **Cộng thêm:** hai việc §6.8-bis chạm `EmployeeCheckin` và `ShiftRegistration`, cả hai đều thuộc `SCOPED_MODELS` (`[CODE] lib/db-scope.ts:13`) ⇒ phải để người phụ trách RBAC xác nhận thời điểm |
| **Rủi ro** | 🔴 **Cao nhất toàn lộ trình** — sửa cấu trúc trên bảng chứa dữ liệu công thật đã dùng để trả lương. Bắt buộc: sao lưu trước mỗi pha, làm ngoài giờ, có kịch bản lùi viết sẵn (theo thông lệ đã chốt: migrate chỉ ngoài giờ + sao lưu) |
| **Giá trị** | ⭐⭐⭐⭐⭐ |

### Giai đoạn 3 — Đơn từ, ngày lễ, quỹ phép (≈3 tuần)

| Mục tiêu | Đóng khoảng trống "nghỉ – phép – tăng ca – công tác – từ xa" |
|---|---|
| **Việc chính** | 1. **Màn hình duyệt đơn** (M-19) — hiện chưa tồn tại.<br>2. **Đơn duyệt xong sinh tác động lên công** theo bảng quy tắc §6.4.<br>3. Mở đơn từ cho **mọi nhân viên**, không chỉ giáo viên; và **kiểm tra quyền khi gửi đơn**.<br>4. Đơn chỉnh công nhập **giờ có cấu trúc**.<br>5. **Ngày nghỉ lễ vào công thức tính công**.<br>6. **Quỹ phép năm**.<br>7. Nhắc việc chủ động: chưa check-out, đơn quá hạn, sắp hết hạn đăng ký ca. ⚠️ **Đây là gọi dịch vụ ngoài (email/Zalo) ⇒ phụ thuộc câu Q4 của tài liệu CRM về nơi đặt mã tích hợp — xem §7.7. Dùng lại hàng đợi email đã có, không mở đầu nối mới.** |
| **Điều kiện hoàn thành** | Đơn nghỉ phép duyệt xong ⇒ ngày đó không còn bị tính thiếu công, quỹ phép trừ đúng; không còn đơn nào nằm mãi ở trạng thái chờ |
| **Phụ thuộc** | Giai đoạn 2 (cần bản ghi công ngày để tác động vào) |
| **Đụng shadow?** | 🔴 **CÓ** — cần hành động quyền "duyệt đơn từ", và cần thay việc kiểm tra vai trò trần bằng kiểm tra quyền chuẩn. **Chỉ làm sau khi đồng hồ shadow chốt**, hoặc tạm mượn quyền chỉnh công (§6.5) |
| **Giá trị** | ⭐⭐⭐⭐ |

### Giai đoạn 4 — Kỳ công, chốt công, đầu ra (≈3 tuần)

| Mục tiêu | Có đầu ra dùng được để tính lương |
|---|---|
| **Việc chính** | 1. **Kỳ công** với vòng đời đầy đủ (M-05).<br>2. **Bảng công kỳ** (M-21) + **xác nhận bảng công** của nhân viên (M-22).<br>3. **Xuất bảng công** — bảng tính + bản in ký duyệt, có dấu nhận diện người tải + ghi nhật ký (theo mẫu đã làm đúng ở chức năng xuất lịch ca).<br>4. **Cảnh báo 4 ngưỡng pháp luật lao động** (QT-26).<br>5. **Màn hình nhật ký chấm công** (M-23).<br>6. Bộ báo cáo BC-01 → BC-08. |
| **Điều kiện hoàn thành** | Chốt được một kỳ thật đầu-cuối; HR xuất file và bàn giao cho kế toán mà không phải chép tay dòng nào |
| **Phụ thuộc** | Giai đoạn 3 |
| **Đụng shadow?** | 🔴 **CÓ** — hành động quyền "chốt kỳ" và "xuất bảng công" |
| **Giá trị** | ⭐⭐⭐⭐ |

### Ngoài lộ trình — làm khi có nhu cầu thật

| Việc | Điều kiện kích hoạt |
|---|---|
| PT-09 chấm công theo buổi dạy | Sau khi Ban giám đốc chốt CH-03 |
| PT-03 QR động | Khi có báo cáo gian lận thật, hoặc khi có ngân sách thiết bị |
| PT-04 Wi-Fi | Khi có cơ sở mà sóng định vị kém |
| PT-11 máy chấm công (vân tay), PT-12 khuôn mặt | 🔴 **Hiện NGOÀI PHẠM VI theo Doc 15** (§5.1-bis). Điều kiện kích hoạt **không phải** "phê duyệt bật tính năng" mà là: (1) **CH-11 có trả lời + Doc 15 §0 được sửa bằng văn bản**; (2) hồ sơ đánh giá tác động riêng; (3) có phương án thay thế cho người từ chối; (4) quyết định Q4 về nơi đặt mã gọi dịch vụ ngoài (§7.7) |
| Chấm công ngoại tuyến | Sau khi chốt CH-06 |
| Tính lương trong hệ thống | Sau khi chốt CH-09 |

---

## 9. PHẦN G — CÂU HỎI CẦN BAN GIÁM ĐỐC CHỐT

| Mã | Câu hỏi | Vì sao chặn | Phương án 1 | Phương án 2 |
|---|---|---|---|---|
| **CH-01** | **Một nhân viên được chấm công mấy lần trong ngày?** | Hiện tối đa 1 vào + 1 ra, trong khi hệ thống lại cho đăng ký 3 ca/ngày. **Đây là mâu thuẫn nội tại đang có thật** — người làm ca sáng rồi ca tối không chấm đủ (DG-04). Không chốt thì không thiết kế được bản ghi lượt chấm | **Nhiều lượt tự do**, ghép cặp theo ca.<br>*Hệ quả:* phản ánh đúng thực tế, cho phép ra ngoài giữa ca; nhưng phải thiết kế lại cách ghép cặp và cách tính giờ | **Giữ 1 cặp/ngày**, thêm ngoại lệ cho ca kép.<br>*Hệ quả:* thay đổi nhỏ hơn, nhưng vẫn không giải được việc ra ngoài giữa ca, và sẽ phải quay lại vấn đề này sau |
| **CH-02** | **Một nhân viên được dùng nhiều phương thức chấm công song song không?** | MISA giới hạn **1 hình thức/người trên ứng dụng**. Nếu Sata Robo theo, sẽ mất khả năng **kết hợp QR + định vị trong một lần chấm** — mà đó chính là hiện trạng | **Cho phép nhiều phương thức + có dự phòng** (đề xuất của BA).<br>*Hệ quả:* linh hoạt, nhân viên không bị mất công khi phương thức chính hỏng; nhưng phức tạp hơn khi cấu hình và khi giải thích cho người dùng | **Theo MISA — mỗi người 1 phương thức chính.**<br>*Hệ quả:* đơn giản, dễ giải thích; nhưng khi định vị hỏng thì **mất công của ngày đó**, và phải phá vỡ mô hình QR+GPS hiện tại |
| **CH-03** | **Giáo viên chấm công theo ca hay theo buổi dạy?** | **MISA không có mô hình theo tiết/theo lớp** — không có mẫu để theo, phải tự thiết kế. Ảnh hưởng trực tiếp cách trả công giáo viên | **Theo buổi dạy (CĐ-B/CĐ-C)**.<br>*Hệ quả:* phản ánh đúng lao động của giáo viên thỉnh giảng và dạy nhiều nơi; nhưng phụ thuộc kỷ luật ghi nhận buổi dạy, và phải xây mới hoàn toàn | **Giữ theo ca (CĐ-A)**.<br>*Hệ quả:* không phải làm gì thêm; nhưng giáo viên chỉ tới dạy 2 tiếng vẫn phải đăng ký cả ca, và bảng công giáo viên tiếp tục không phản ánh thực tế |
| **CH-04** | **Khi xác thực thất bại: chặn cứng hay ghi nhận rồi hậu kiểm?** | Hiện đang chặn cứng ⇒ nhân viên **không có bằng chứng nào** là đã tới nơi. MISA làm ngược lại: ghi nhận rồi HR xem lại | **Ghi nhận + gắn cờ chờ duyệt** (mặc định mới).<br>*Hệ quả:* không mất dữ liệu, nhưng quản lý phải xử lý hộp cờ mỗi ngày | **Giữ chặn cứng**, chỉ mở đường dự phòng qua quản lý xác nhận.<br>*Hệ quả:* kỷ luật chặt hơn; nhưng tạo việc thủ công cho quản lý và dễ gây ức chế |
| **CH-05** | **Có ngừng lưu toạ độ định vị thô không?** | Toạ độ là **dữ liệu cá nhân nhạy cảm**. Hiện lưu vĩnh viễn, không thông báo, không đồng ý, không hồ sơ đánh giá tác động. Đây là rủi ro pháp lý lớn nhất của module | **Ngừng lưu toạ độ thô**, chỉ giữ khoảng cách + trong/ngoài vùng (khuyến nghị của BA).<br>*Hệ quả:* giảm mạnh nghĩa vụ tuân thủ, chi phí gần bằng 0; nhưng **mất khả năng đối chứng chi tiết khi có khiếu nại** | **Giữ lưu toạ độ**, bổ sung đủ thông báo + đồng ý + thời hạn xoá + hồ sơ đánh giá tác động.<br>*Hệ quả:* giữ được khả năng đối chứng; nhưng phát sinh cả một khối lượng tuân thủ và nộp hồ sơ cho cơ quan quản lý |
| **CH-06** | **Có làm chấm công khi mất mạng không?** | Điểm dạy lẻ, tầng hầm, sóng yếu. Ảnh hưởng thiết kế ứng dụng và độ tin cậy dấu thời gian | **Có** — lưu tạm trên máy rồi đồng bộ.<br>*Hệ quả:* nhân viên không bao giờ bị kẹt; nhưng dấu thời gian do thiết bị báo ⇒ **giả được**, phải gắn cờ và hậu kiểm | **Không** — dùng đường quản lý xác nhận.<br>*Hệ quả:* đơn giản, dấu thời gian tin cậy; nhưng tạo việc thủ công mỗi khi mạng hỏng |
| **CH-07** | **Ba câu hỏi cho luật sư — ai hỏi, khi nào có trả lời?** | Ba câu này quyết định khối lượng của mọi việc tuân thủ còn lại: (1) Sata Robo **có được miễn trừ** như doanh nghiệp nhỏ không, khi đang xử lý dữ liệu nhạy cảm? (2) Hồ sơ đánh giá tác động là **tiền kiểm hay hậu kiểm** — hai nguồn uy tín đang mâu thuẫn? (3) Nghĩa vụ **xoá dữ liệu khi người lao động nghỉ việc** dung hoà thế nào với nghĩa vụ lưu chứng từ kế toán 10 năm? | **Thuê luật sư trả lời trước Giai đoạn 1.**<br>*Hệ quả:* tốn phí và ~2 tuần; nhưng biết đúng khối lượng phải làm | **Làm theo phương án an toàn nhất mà không hỏi.**<br>*Hệ quả:* không tốn phí; nhưng có thể làm thừa (tốn công) hoặc làm thiếu (rủi ro phạt tới 3 tỷ) |
| **CH-08** | **Cơ sở nhượng quyền dùng chung hệ thống hay tách riêng?** | Câu R-DP-01 trong PRD nhượng quyền **vẫn đang treo**, và mọi yêu cầu bảo vệ dữ liệu khác treo theo. Hiện hai pháp nhân **cách nhau đúng một bộ lọc** | **Dùng chung, mỗi bên là bên kiểm soát độc lập** (khuyến nghị của BA).<br>*Hệ quả:* một hệ thống, chi phí thấp; nhưng phải siết cách ly thật chặt và Hội sở **không** xem được chi tiết công/lương bên nhận | **Tách hoàn toàn** — bên nhận dùng bản riêng.<br>*Hệ quả:* rủi ro pháp lý thấp nhất; nhưng chi phí vận hành nhân đôi và mất khả năng nhìn tổng thể |
| **CH-09** | **Tính lương làm trong hệ thống hay xuất file cho bên khác?** | Quyền lương đã có trong ma trận nhưng **không có màn hình nào**. Quyết định này định hình toàn bộ Giai đoạn 4 | **Chỉ làm đầu ra chuẩn**, tính lương ở ngoài (đề xuất).<br>*Hệ quả:* phạm vi gọn, làm được trong 3 tuần; nhưng còn một bước thủ công giữa chấm công và lương | **Làm tính lương trong hệ thống.**<br>*Hệ quả:* liền mạch; nhưng kéo theo thuế, bảo hiểm, phụ cấp — **gấp nhiều lần khối lượng**, và chạm dữ liệu nhạy cảm nhất công ty |
| **CH-10** | **Tự làm hay mua MISA AMIS Chấm công?** | Câu hỏi nền. Nếu mua thì phần lớn tài liệu này chuyển thành đặc tả **cấu hình MISA và đồng bộ nhân sự**, không phải đặc tả xây mới | **Tự làm, học mô hình MISA** (đề xuất — vì MISA không giải được bài toán giáo viên và không cho tạo loại đơn mới).<br>*Hệ quả:* giữ được 3 loại đơn đặc thù, giữ cách ly dữ liệu, gắn liền LMS; nhưng tốn **12–20 tuần** công sức nội bộ (đã cộng phần §6.8-bis bị bỏ sót ở bản trước) | **Mua MISA.**<br>*Hệ quả:* có ngay bảng công, chốt công, nối lương; nhưng **mất** 3 loại đơn đặc thù, **không có** chấm công theo buổi dạy, và phát sinh bài toán đồng bộ hai hệ thống. Giá chưa biết — phải xin báo giá |
| **CH-11** | **Có mở đường sinh trắc học cho NHÂN VIÊN không, và có sửa Doc 15 §0 không?** | Blueprint liệt kê **"sinh trắc học"** trong danh mục **đã loại khỏi core**; ở dòng `:1081` cụm từ này **không kèm chữ "học sinh"** ⇒ đọc theo mặt chữ là **cấm không giới hạn đối tượng**; còn dòng `:34` lại đặt trong nhóm "Pháp lý dữ liệu trẻ em" ⇒ có thể hiểu chỉ cấm cho học sinh. **Doc 15 mơ hồ đúng ở điểm này** (§5.1-bis). Chưa chốt thì PT-11 (vân tay) và PT-12 (khuôn mặt) **không được đưa vào bất kỳ đặc tả nào** — kể cả dạng "giữ chỗ, TẮT mặc định" | **Giữ nguyên lệnh cấm — sinh trắc ngoài phạm vi cho MỌI đối tượng** (khuyến nghị BA ở giai đoạn này).<br>*Hệ quả:* không phải sửa blueprint, không phát sinh nghĩa vụ dữ liệu nhạy cảm loại nặng nhất, chi phí tuân thủ bằng 0; nhưng mất một lớp chống gian lận mà MISA có | **Mở cho NHÂN VIÊN, giữ cấm tuyệt đối cho HỌC SINH.**<br>*Hệ quả:* phải **sửa Doc 15 §0 bằng văn bản** (không phải chỉ phê duyệt bật tính năng), lập hồ sơ đánh giá tác động riêng, có phương án thay thế cho người từ chối, giữ nguyên và mở rộng kiểm thử cưỡng chế chặn dữ liệu sinh trắc chạm bảng học viên. **Chi phí tuân thủ cao nhất trong mọi phương thức** |
| **CH-12** | **Người làm ca chiều + ca tối (hai ca CHỒNG NHAU 30 phút) được tính bao nhiêu giờ công?** | Ca chiều 13:30–17:30 và ca tối 17:00–21:00 chồng nhau 30 phút (`[CODE] lib/shifts.ts:10-11`), và công thức hiện tại **gộp** khoảng chồng nhau (`lib/work-schedule.ts:42-56`) ⇒ hôm nay người đó được **7h30, không phải 8h**. Đây là chỗ dễ tranh chấp công nhất và là đầu vào bắt buộc của thuật toán ghép cặp §6.3-bis. Không chốt thì **không viết được tiêu chí nghiệm thu Giai đoạn 2** | **Giữ 7h30 — giữ nguyên công thức gộp** (QT-16, khuyến nghị BA).<br>*Hệ quả:* không đổi số liệu quá khứ, không phải sửa công thức; nhưng phải **giải thích rõ với người lao động** rằng đăng ký hai ca chồng giờ không cộng dồn phần chồng | **Trả đủ 8h — bỏ việc gộp khoảng chồng nhau.**<br>*Hệ quả:* công bằng hơn theo cảm nhận người lao động; nhưng **đổi công thức tính công**, có **tác động hồi tố lên toàn bộ số liệu quá khứ** (vì kết quả không được lưu — DG-11), và phải bỏ QT-16. **Rủi ro cao, nên làm sau khi đã lưu bản ghi công ngày** |

---

## 10. PHỤ LỤC

### 10.1 Những điều CHƯA KIỂM CHỨNG ĐƯỢC

> Liệt kê thẳng. Không mục nào ở đây được phép trình bày như sự thật trong các quyết định tiếp theo.

**Về dữ liệu và môi trường production** (không được truy vấn cơ sở dữ liệu, không được đọc biến môi trường):

1. Có bao nhiêu bản ghi chấm công thật; module có thực sự được dùng hằng ngày không.
2. **Cơ sở nào đã khai toạ độ, cơ sở nào chưa.** Nếu chưa khai thì geofence **bị bỏ qua hoàn toàn** — mức nghiêm trọng của DG-17 phụ thuộc con số này.
3. Bao nhiêu bản ghi công có **đơn vị để trống** (DG-26).
4. Giá trị thật của 5 khoá cấu hình chấm công trên production — chỉ đọc được **giá trị mặc định** trong mã nguồn.
5. Cờ RBAC v2 trên production thực tế đang bật hay tắt — tài liệu nói tắt nhưng không xác nhận trực tiếp được.
6. Số lệch shadow hiện tại của 3 hành động quyền chấm công.
7. Múi giờ của môi trường chạy — quyết định mức nghiêm trọng của DG-28.

**Về mã nguồn (đã đọc phần lớn nhưng chưa hết):**

8. **DG-32 (giáo viên thuần không vào được trang chấm công)** là suy luận từ quy tắc định tuyến + danh sách route của site giáo viên. **Chưa thử thực tế.** Cũng có thể nghiệp vụ **cố ý** không cho giáo viên chấm công QR — nhưng nếu vậy thì việc cấp quyền tự chấm công cho vai trò giáo viên là mâu thuẫn chưa được giải thích ở đâu.
9. **DG-33 (cửa sổ 25–28 chưa cưỡng chế)** — hàm kiểm tra tồn tại nhưng chưa tìm thấy nơi gọi ở tầng hành động. Có thể logic nằm trong thành phần giao diện chưa đọc hết.
10. Hàm "sửa công trực tiếp" không có giao diện — chỉ xác nhận được là **hiện tại** không có thành phần nào gọi; không rõ trước đây có rồi bị gỡ hay chưa từng làm.
11. Lịch sử vì sao bảng cấu hình ca không được nối vào runtime — không có tài liệu nào trong repo giải thích.
12. Việc phân loại "checklist mở/đóng cơ sở" thuộc module nào đang **mâu thuẫn**: mã nguồn đặt trong thư mục chấm công và gate bằng quyền chấm công, nhưng chú thích trong schema lại ghi thuộc *"Module Quản lý lớp phần 4"*.

**Về MISA:**

13. **Ma trận "ai xem được dữ liệu của ai"** của MISA — không tìm được tài liệu công khai mô tả chi tiết.
14. **Ca xoay theo chu kỳ** của MISA — không tìm thấy tài liệu. **Không kết luận là MISA không có.**
15. Mâu thuẫn "1 hình thức/nhân viên" và "QR kết hợp hình thức khác" — cách hoà giải ở §4.1 là **suy luận của BA**, chưa được MISA xác nhận.
16. **MISA có chống giả mạo vị trí hay không** — tài liệu hướng dẫn **không đề cập**. Không được viết là "MISA không có".
17. **Giá MISA AMIS Chấm công** — không công khai.
18. Chi tiết công thức tính công của MISA — chỉ có mô tả khái quát.
19. Tính năng *"AI Agent thêm ca, phân ca"* chỉ xuất hiện trên **trang tiếp thị**, không có tài liệu kỹ thuật ⇒ coi là tuyên bố tiếp thị.
20. **Sata Robo hiện có tài khoản MISA nào, gói nào, module nào** — **không có tài liệu nội bộ nào trong repo trả lời**. Khung tích hợp MISA trong hệ thống chỉ là khung **kế toán rỗng**, chưa từng chạy thật, **không liên quan chấm công**.
21. MISA AMIS có API mở cho module Chấm công hay không, điều kiện gì.

**Về pháp lý:**

22. **Chưa đọc được bản gốc** Luật 91/2025 và Nghị định 356/2025 (cổng văn bản trả về lỗi truy cập). Toàn bộ **số điều, số khoản, số điểm** lấy từ nguồn thứ cấp. Phải đối chiếu Công báo trước khi đưa vào tài liệu ký duyệt.
23. **Hồ sơ đánh giá tác động là tiền kiểm hay hậu kiểm** — hai nguồn uy tín mâu thuẫn. Nếu là tiền kiểm, mọi tính năng chạm dữ liệu nhạy cảm phải cộng thêm khoảng 45 ngày vào tiến độ.
24. **Điều kiện loại trừ miễn trừ cho doanh nghiệp nhỏ** — chỉ có ở một bản tin tư vấn, chưa đối chiếu bản gốc. Nếu sai, khối lượng tuân thủ thay đổi hoàn toàn.
25. Ước lượng thời gian và chi phí thiết bị trong PHẦN E, PHẦN F là **con số thô của người viết**, chưa qua đội kỹ thuật và chưa xin báo giá. Con số Giai đoạn 2 (5–9 tuần) và tổng (12–20 tuần) đã cộng phần §6.8-bis nhưng **vẫn là ước lượng thô**.
26. **Điều 98 Bộ luật Lao động 2019** (hệ số trả lương làm thêm 150 % / 200 % / 300 %) — **chưa mở được nguồn gốc**; §7.3 chỉ đối chiếu được Điều 105, Điều 107 và sổ quản lý lao động. Phải đối chiếu Công báo + Kế toán xác nhận trước khi đưa vào công thức lương.

**Về ràng buộc phạm vi của blueprint:**

27. **Doc 15 mơ hồ về đối tượng của lệnh cấm "sinh trắc học"** — dòng `:34` đặt trong nhóm "Pháp lý dữ liệu trẻ em", dòng `:1081` viết không kèm giới hạn đối tượng. **Không có tài liệu nào trong repo giải thích ý định gốc.** Đây là lý do phải hỏi CH-11 thay vì tự diễn giải.
28. **Khả thi của PT-04 (Wi-Fi/BSSID) trên trình duyệt điện thoại** — trình duyệt web thường không cho đọc định danh điểm phát. Chưa làm thử nghiệm. Nếu không khả thi thì PT-04 đòi một ứng dụng riêng, tức đổi hẳn khối lượng.

### 10.2 Nguồn tham khảo

**MISA AMIS Chấm công** (truy cập 28/07/2026):

| Mã | Nguồn |
|---|---|
| W1 | https://helpamis.misa.vn/amis-cham-cong/kb/thiet-lap-cham-cong-tu-xa-bang-ung-dung/ |
| W2 | https://helpamis.misa.vn/amis-cham-cong/kb/quy-dinh-cham-cong/ |
| W3 | https://helpamis.misa.vn/amis-nhan-vien/kb/cham-cong-xac-thuc-bang-dinh-vi-gps/ |
| W4 | https://helpamis.misa.vn/amis-cham-cong/kb/cham-cong-bang-qr-code/ |
| W5 | https://helpamis.misa.vn/amis-cham-cong/kb/khai-bao-ca-lam-viec/ |
| W6 | https://helpamis.misa.vn/amis-cham-cong/kb/dang-ky-ca/ |
| W7 | https://helpamis.misa.vn/amis-cham-cong/kb/quan-ly-cac-loai-don/ |
| W8 | https://helpamis.misa.vn/amis-cham-cong/kb/cham-cong-theo-gio-lam-viec-linh-hoat/ |
| W9 | https://helpamis.misa.vn/amis-cham-cong/kb/cham-cong-theo-du-an-cong-trinh/ |
| W10 | https://helpamis.misa.vn/amis-cham-cong/kb/cham-cong-ho/ |
| W11 | https://helpamis.misa.vn/amis-cham-cong/kb/ket-noi-voi-may-cham-cong/ |
| W12 | https://helpamis.misa.vn/amis-cham-cong/ac/bat-dau-su-dung/ |
| W13 | https://helpamis.misa.vn/amis-cham-cong/kb/thiet-lap-he-thong-tren-amis-cham-cong/ |
| W14 | https://helpamis.misa.vn/amis-cham-cong/kb/thiet-lap-nhan-vien/ |
| W15 | https://amis.misa.vn/amis-cham-cong/ |
| W16 | https://helpamis.misa.vn/amis-cham-cong/ac/cham-cong/ |
| W17 | https://amis.misa.vn/98152/cham-cong-bang-wifi-la-gi/ |
| W18 | https://amis.misa.vn/132747/cham-cong-khuon-mat-ai/ |

**Pháp luật Việt Nam:**

- Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 — https://bocongan.gov.vn/chinh-sach-phap-luat/bai-viet/luat-bao-ve-du-lieu-ca-nhan-chinh-thuc-co-hieu-luc-thi-hanh-tu-ngay-01-01-2026-1767186124
- Nghị định 356/2025/NĐ-CP — https://vanban.chinhphu.vn/?pageid=27160&docid=216387
- Phân tích Nghị định 356/2025 — https://www.ey.com/vi_vn/technical/tax/tax-and-law-updates/nghi-dinh-so-356-2025-nd-cp-quy-dinh-chi-tiet-mot-so-dieu-va-bien-phap-thi-hanh-luat-bao-ve-du-lieu-ca-nhan
- Danh mục dữ liệu nhạy cảm — https://luatvietnam.vn/thong-tin/nghi-dinh-356-2025-nd-cp-quy-dinh-chi-tiet-luat-bao-ve-du-lieu-ca-nhan-422896-d1.html
- Bảo vệ dữ liệu cá nhân trong quan hệ lao động — https://mps.gov.vn/chinh-sach-phap-luat/bai-viet/bao-ve-du-lieu-ca-nhan-trong-mot-so-hoat-dong-1754989261
- Xoá dữ liệu người lao động khi nghỉ việc — https://lsvn.vn/tu-nam-2026-doanh-nghiep-phai-xoa-du-lieu-ca-nhan-cua-nguoi-lao-dong-khi-nghi-viec-a167358.html
- Hồ sơ đánh giá tác động xử lý dữ liệu cá nhân — https://luatvietnam.vn/linh-vuc-khac/huong-dan-danh-gia-tac-dong-xu-ly-du-lieu-ca-nhan-883-103703-article.html
- Mức phạt theo Luật 91/2025 — https://thuvienphapluat.vn/hoi-dap-phap-luat/trong-luat-bao-ve-du-lieu-ca-nhan-nam-2025-muc-phat-tien-toi-da-trong-xu-phat-vi-pham-hanh-chinh-do-138073320.html
- Thời giờ làm việc (Điều 105 Bộ luật Lao động 2019) — https://thuvienphapluat.vn/lao-dong-tien-luong/luat-lao-dong-quy-dinh-ve-thoi-gio-lam-viec-cua-nguoi-lao-dong-nhu-the-nao-34960.html
- Giới hạn làm thêm giờ (Điều 107) — https://baochinhphu.vn/lam-them-gio-the-nao-la-dung-quy-dinh-102240130085419703.htm
- Sổ quản lý lao động — https://thuvienphapluat.vn/lao-dong-tien-luong/lap-va-su-dung-so-quan-ly-lao-dong-nhu-the-nao-la-dung-quy-dinh-14402.html
- Thời hạn lưu trữ tài liệu kế toán — https://lawkey.vn/thoi-han-luu-tru-tai-lieu-ke-toan-theo-quy-dinh-phap-luat/

**Tài liệu nội bộ:**

- `Document/2-architecture-design/15-final-architecture-blueprint.md` — blueprint kiến trúc chốt
- `docs/ke-hoach-go-live-2607/shadow-log.md` — nhật ký đồng hồ shadow RBAC
- `docs/taicautruc/02-prd-franchise-platform.md` — PRD nền tảng nhượng quyền (R-DP-01…R-DP-07)
- `docs/taicautruc/01-intended-vs-implemented.md` — audit "thiết kế so với thực tế"
- `E:/LandingPage_data/PhanTich-RaSoat-YeuCau-ChamCong-GPS.docx` — Gap Analysis chấm công GPS, 26/06/2026 (47 khoảng cách + 9 điểm cần chốt; **cột người phụ trách và hạn đều để trống**, `[CHƯA KIỂM CHỨNG]` tới nay đã chốt cái nào)

---

*Hết tài liệu. Mọi mục đánh dấu `[SUY LUẬN]` hoặc `[CHƯA KIỂM CHỨNG]` cần được xác minh trước khi dùng làm căn cứ quyết định.*





