# Lớp trải nghiệm mở theo khung giờ + Thống kê case trải nghiệm theo Sale

> **Trạng thái:** ✅ **ĐÃ CHỐT 22/09/2026** — chủ dự án quyết trực tiếp trong phiên làm việc, gồm cả 3 câu hỏi làm rõ ở §0.3 và 3 câu ở §0.4. **Đã hiện thực xong**, nhánh `hptkk29/lop-trial-theo-khung-gio` (3 commit: `55ad9540` · `72b0857d` · `d61791ec`) — tài liệu này ghi lại yêu cầu + quyết định, không phải đề xuất đang chờ.
> **Phạm vi:** màn Lớp trải nghiệm (`app/(admin)/admin/lop-trial/**`) và một màn báo cáo MỚI `app/(admin)/admin/bao-cao/trial-sale/`.
> **Dựa trên:** yêu cầu chủ dự án 22/09/2026 (trích nguyên văn ở §1.1 và §3.1); cơ chế lọc giáo viên theo ca làm đã chốt 17/09/2026; DESIGN.md admin (chốt 11/08/2026).
> **Nguyên tắc bất biến:** mọi kiểm quyền qua `can()`; mọi đọc/ghi qua `scopedDb(actor)`; không thêm bảng khi thực thể đã có; migration additive, không drop cột.

---

## §0. Tóm tắt điều hành

### 0.1 Vấn đề

Trước đợt này, **Sale và Quản lý cơ sở mang bộ `trials:*` giống hệt nhau ở phần dùng được** — điều này đã được ghi nhận thành văn trong chính seed vai từ 17/09/2026 (`prisma/seed-roles.ts`, chú thích khối `CENTER_MANAGER`: *"không tách nổi QL cơ sở khỏi Sale — hai vai đang mang bộ `trials:*` giống hệt"*). Hệ quả: ai xếp được học viên thì cũng mở được lớp, và lớp mở ra không có ngày cũng không có khung giờ, nên Sale không có cách nào chọn "lớp trải nghiệm ngày 22/09" khi hẹn khách.

Song song, không có chỗ nào trả lời được câu **"Sale nào chốt tốt, ai đang để khách im lặng"**: màn `/bao-cao/trial` đang có thống kê theo **cơ sở**, không theo **người**.

### 0.2 Giải pháp đã chốt (2 hạng mục)

| # | Hạng mục | Kết quả |
|---|---|---|
| **A** | Lớp trải nghiệm mở theo **ngày + khung giờ**, tách quyền **mở lớp** khỏi quyền **xếp học viên** | Khoá mới `trials:create-class`; 7 khoá cấu hình khung giờ theo thứ; 3 đường mở lớp qua 1 cổng |
| **B** | Màn **Thống kê case trải nghiệm theo Sale** | `/bao-cao/trial-sale` — 9 cột, hàng TỔNG, xuất Excel, bấm số xem được danh sách case |

### 0.3 ✅ Quyết định ĐÃ CHỐT — hạng mục A (22/09/2026)

| # | Quyết định | ✅ Đã chốt | Căn cứ / lý do |
|---|---|---|---|
| **QĐ-A1** | Cách tạo lớp | **Cả hai**: form tạo từng ngày **và** nút "mở lớp cho cả kỳ theo thứ", cộng import Excel (mỗi dòng 1 ngày) | Chủ dự án chọn khi được hỏi. Xếp lịch đầu tháng cần sinh hàng loạt; ngoại lệ một ngày vẫn phải làm được mà không dựng file. |
| **QĐ-A6** | Hình dạng của "mở cho cả kỳ" | **Một khoảng ngày (từ → đến) + N tuỳ chọn**, mỗi tuỳ chọn = *một nhóm thứ + MỘT khung giờ*. Tối đa 10 tuỳ chọn một lượt | Chủ dự án 22/09 (vòng 2), nguyên văn: *"chọn từ ngày đến ngày rồi phải chọn thêm giờ của kỳ đó, và có thể + thêm tuỳ chọn khác, ví dụ: tạo kỳ 22/09-30/09 lịch t3-t6 và lịch t7-cn riêng biệt"*. ĐẢO bản đầu (chỉ tick thứ, không nhận giờ — tự sinh **mọi** khung của thứ đó). |
| **QĐ-A7** | Ô "Khoá trải nghiệm" khi mở lớp | **GỠ khỏi cả hai form** (một ngày và cả kỳ); lớp sinh ra mang `courseId = null` | Chủ dự án 22/09 (vòng 2): *"qlcs không biết khung giờ đó sẽ có học viên trải nghiệm nào nên cũng không biết khoá trải nghiệm nào"*. Khách đến sau khi lớp đã mở, nên bắt chọn khoá lúc mở lớp là bắt đoán. **Cột `courseId` GIỮ nguyên trên DB** — đường import Excel vẫn nhận `courseSlug` tuỳ chọn, và lớp cũ đã gắn khoá không bị động tới. |
| **QĐ-A2** | Nguồn khung giờ | **Cấu hình sửa được** (không đóng cứng, không suy từ ca làm GV): T3–T6 `17:30-21:00`; T7 & CN `08:00-11:30, 14:00-17:30`; T2 để trống = không mở | Chủ dự án chọn. Suy từ ca làm GV thì ngày nào chưa xếp ca là không mở được lớp — chặn nghiệp vụ vì một dữ liệu thuộc module khác. |
| **QĐ-A3** | Ai được mở lớp | **Quản lý cơ sở + Đào tạo + Quản trị tối cao**. Sale **KHÔNG**. | Chủ dự án chọn. Đào tạo vốn đã giữ `trials:manage` và quản toàn bộ LMS. |
| **QĐ-A4** | Khung lớp phải nằm trọn trong **MỘT** khung cho phép | Lớp `11:00–15:00` thứ 7 bị **TỪ CHỐI** dù nằm giữa 08:00 và 17:30 | Thứ 7 mở hai khung tách nhau bởi giờ nghỉ trưa. Kiểm kiểu "nằm giữa giờ mở sớm nhất và giờ đóng muộn nhất" cho lọt đúng ca này, và nó chỉ lộ ra khi có người xếp GV vào giờ nghỉ. |
| **QĐ-A5** | Lớp cũ (tạo trước 22/09/2026) | **KHÔNG** chặn hồi tố — không có ngày/khung thì cổng khung giờ bỏ qua | Khoá hồi tố là khoá cứng mọi lớp đang chạy dở; dữ liệu cũ không có lỗi gì để phạt. |

### 0.4 ✅ Quyết định ĐÃ CHỐT — hạng mục B (22/09/2026)

| # | Quyết định | ✅ Đã chốt | Căn cứ / lý do |
|---|---|---|---|
| **QĐ-B1** | Xem chi tiết case | **Bung bảng ngay trên màn thống kê**, không rời trang | Chủ dự án chọn. Người dùng đang so sánh các Sale với nhau; chuyển trang (hoặc modal) che mất đúng thứ họ đang so. |
| **QĐ-B2** | Mẫu số của tỷ lệ thành công | **chốt ÷ HOÀN THÀNH**. Case **huỷ** và case **đang chờ** đều KHÔNG vào mẫu số | Chủ dự án chốt nguyên văn: *"chốt/ hoàn thành, huỷ không tính luôn"*. |
| **QĐ-B3** | Cột bổ sung | Thêm cả 4 theo đề xuất: **Đang chờ** · **Vắng (không đến)** · **hàng TỔNG** · **Xuất Excel** | Chủ dự án chọn cả 4. Thiếu cột "Đang chờ" thì `tổng ≠ hoàn thành + huỷ` và người đọc tưởng báo cáo sai số. |

> **Đề xuất của BA đã được chấp nhận:** cột "Đang chờ" và hàng TỔNG không có trong yêu cầu gốc — BA đề xuất sau khi đo dữ liệu thật (14/27 case đang ở trạng thái `ACTIVE` trên DB local), chủ dự án duyệt.

### 0.5 Inverse — cố ý KHÔNG làm

- **KHÔNG** thêm bảng mới cho "case trial": *case* chính là **buổi** (`TrialClassSession`) đã có — mang sẵn ngày, giờ, giáo viên, phòng.
- **KHÔNG** đổi nơi gán giáo viên: giáo viên vẫn gán ở **từng buổi**, không ở lớp. Lớp mở 17:30–21:00 không có nghĩa một GV trực suốt 3,5 tiếng.
- **KHÔNG** dựng lại cơ chế "GV rảnh": đã có từ 17/09/2026.
- **KHÔNG** cho ghi đè khung giờ theo cơ sở (`centerOverridable: false`) — xem QĐ-A2 và §2.3.
- **KHÔNG** dùng `LeadTrialHistory.outcome` làm thước "đã chốt" — xem §3.3.

---

## §1. Hạng mục A — Lớp trải nghiệm mở theo ngày + khung giờ

### 1.1 Nguồn (trích nguyên văn, 22/09/2026)

> "chỗ tạo lớp Trial, chỉ cho QL tạo và sale chỉ vào chọn lớp trial theo ngày đặt lịch và add học viên:
> - Tạo lớp Trial theo ngày, thứ, và khung thời gian có GV đi làm (từ 17h30 - 21h từ t3-t6 & sáng chiều ngày thứ 7, cn). có thể import bằng file excel được, check mẫu import các excel khác rồi làm tương tự
> - Khi qly tạo xong, sale nào hẹn trial vào khung thời gian nào thì cũng vào đúng ngày đấy, tạo case trial (chỉ chọn giờ trong khung giờ của qly tạo) và chọn gv rãnh đúng khung thời gian đó."

### 1.2 Hiện trạng trước đợt này (có dẫn code)

| Điều | Bằng chứng |
|---|---|
| Quyền mở lớp **không tách được** khỏi quyền xếp học viên — cả hai là `trials:manage` | `prisma/seed-roles.ts` khối `CENTER_MANAGER` (chú thích 17/09: *"không tách nổi QL cơ sở khỏi Sale"*) |
| Lớp **cố ý không gắn ngày/giờ** (chốt 28/08/2026) | `lib/trial/service.ts` — `createTrialClass` ghi `startTime: null, endTime: null`; chú thích *"giờ/sĩ số/GV/phòng để null: chúng là thuộc tính của TỪNG BUỔI"* |
| Ba cột `startDate` / `startTime` / `endTime` **đã tồn tại** trên `TrialClassV2` | `prisma/schema.prisma`, model `TrialClassV2` |
| "GV rảnh đúng khung giờ" **đã có** — ca làm phải **phủ trọn** khung buổi, đọc từ `ShiftAssignment` của chấm công | `lib/trial/gv-kha-dung.ts` (chốt 17/09/2026) + `lib/trial/gv-kha-dung-db.ts` |
| "Case trial" trong lời chủ dự án **chính là** buổi đang có | `prisma/schema.prisma`, model `TrialClassSession` (có `date`, `startTime`, `endTime`, `teacherId`, `roomId`) |

**Hệ quả của bảng trên:** hạng mục A **không cần bảng mới và không cần migration cho khung giờ** — chỉ dùng lại ba cột đã có. Migration duy nhất của đợt trước (`20260918120000_trial_class_created_by`) thuộc yêu cầu 18/09, không thuộc đợt này.

### 1.3 User story

**US-TRIAL-10** · Là **Quản lý cơ sở**, tôi muốn **mở lớp trải nghiệm cho một ngày với một khung giờ cụ thể** để **Sale chọn đúng chỗ hẹn khách mà không tự đặt giờ ngoài giờ giáo viên đi làm**.
- Ưu tiên: P0 · Loại: FR
- Nguồn: yêu cầu chủ dự án 22/09/2026 (§1.1) · Hiện trạng: lớp không gắn ngày — `lib/trial/service.ts` (`createTrialClass`)
- AC1: Given cấu hình T3 = `17:30-21:00`, When QL mở lớp ngày **thứ 3** khung `17:30–21:00`, Then lớp được tạo và hiện trên `/lop-trial` kèm cột "Ngày & khung giờ".
- AC2: Given cấu hình T7 = `08:00-11:30, 14:00-17:30`, When QL mở lớp thứ 7 khung **`11:00–15:00`**, Then **bị từ chối**, câu lỗi nêu rõ thứ 7 mở khung nào. *(Vắt qua giờ nghỉ trưa — QĐ-A4.)*
- AC3: Given cấu hình T2 để trống, When QL chọn ngày thứ 2, Then form **không có khung nào để chọn** và chỉ ra chỗ sửa (Cấu hình vận hành → tab "Lớp & giáo viên").
- Truy vết: `lib/trial/khung-gio-mo-lop.test.ts` `[KGM-02]` `[KGM-03]` `[KGM-03b]` · Vitest co-located · **có job CI** (`Unit tests`).
- Flag: không dùng flag — đổi hành vi ngay khi merge (xem §5 Rollback).

**US-TRIAL-11** · Là **Quản trị**, tôi muốn **Sale không mở được lớp trải nghiệm** để **lịch trải nghiệm do một đầu mối kiểm soát**.
- Ưu tiên: P0 · Loại: BR
- AC1: Given tài khoản `SALES_CSM`, When mở `/lop-trial`, Then **không thấy** nút "Tạo lớp" và nút "Nhập Excel".
- AC2: Given tài khoản đó gõ thẳng `/lop-trial/moi` lên thanh địa chỉ, Then bị đá về `/lop-trial`. *(Gác cả trang, không chỉ giấu nút.)*
- AC3: Given tài khoản đó POST thẳng vào `createLopTrialClassAction` hoặc `/api/admin/import/trial-classes`, Then nhận lỗi quyền. *(Cùng một khoá ở cả ba cửa — để khoá khác là mở cửa sau bằng file Excel.)*
- AC4: Given tài khoản đó, When thêm case / xếp học viên / điểm danh, Then **vẫn làm được như trước**.
- Truy vết: `app/(admin)/admin/lop-trial/_lib/permissions.test.ts` (bảng cổng quyền khai tay) · `lib/auth/rbac-parity.test.ts` · **có job CI**.

**US-TRIAL-12** · Là **Sale**, tôi muốn **thêm case trial vào lớp đã mở, chỉ chọn được giờ trong khung của lớp** để **không lỡ xếp khách vào giờ không có giáo viên**.
- Ưu tiên: P0 · Loại: FR
- AC1: Given lớp mở `17:30–21:00` ngày 22/09, When Sale thêm case `18:00–19:00`, Then được chấp nhận.
- AC2: Given lớp đó, When Sale thêm case `17:00–19:00`, Then bị từ chối; câu lỗi nêu khung lớp và chỉ đường đi tiếp ("nhờ Quản lý cơ sở mở thêm lớp khung khác").
- AC3: Given lớp đó, When Sale thêm case cho **ngày khác**, Then bị từ chối kèm ngày của lớp.
- AC4: Given lớp **cũ** (không có khung), When Sale thêm case giờ bất kỳ, Then **vẫn được** *(QĐ-A5)*.
- Truy vết: `lib/trial/khung-gio-mo-lop.test.ts` `[KGM-04]` · cổng ở `app/(admin)/admin/lop-trial/_actions.ts` (`addLopTrialSessionAction`).

**US-TRIAL-13** · Là **Quản lý cơ sở**, tôi muốn **mở lớp cho cả một kỳ bằng một thao tác hoặc bằng file Excel** để **xếp lịch tháng không phải bấm 30 lần**.
- Ưu tiên: P1 · Loại: FR · Truy vết quyết định: **QĐ-A6**
- AC1: Given kỳ 22/09–30/09, tuỳ chọn 1 = *T3–T6 · 17:30–21:00*, When bấm "Mở lớp cho cả kỳ", Then sinh đúng một lớp cho **mỗi** ngày T3–T6 trong khoảng, khung `17:30–21:00`.
- AC2: Given thêm tuỳ chọn 2 = *T7+CN · 08:00–11:30* và tuỳ chọn 3 = *T7+CN · 14:00–17:30*, When bấm, Then mỗi ngày T7/CN sinh **HAI** lớp — đúng "sáng chiều ngày thứ 7, cn". *(Một tuỳ chọn mang đúng MỘT khung; muốn cả sáng lẫn chiều thì là hai tuỳ chọn — đó là lý do nút "+ Thêm tuỳ chọn khác" tồn tại.)*
- AC3: Given mở form lần đầu, Then đã có sẵn bộ tuỳ chọn **suy từ cấu hình** — với cấu hình mặc định là đúng ba dòng ở AC1+AC2, tức đúng ví dụ chủ dự án đưa ra.
- AC4: Given một tuỳ chọn tick **cả T3 lẫn T7** (hai thứ không có khung nào dùng chung), Then màn hình nói thẳng là phải tách thành hai tuỳ chọn, **không** bày một khung rồi để server từ chối sau.
- AC5: Given thứ không mở lớp (T2 theo cấu hình mặc định), Then nút thứ đó bị **khoá** kèm lý do, không cho tick rồi im lặng bỏ qua *(luật 12 — affordance phải nói thật)*.
- AC6: Given có ngày bị bỏ qua, Then màn hình **liệt kê ra** những ngày đó, không nuốt.
- AC7: Given không mở được lớp nào, Then báo **LỖI**, không báo thành công.
- AC8: Given hai tuỳ chọn trùng nhau (cùng thứ, cùng khung), Then ngày đó chỉ sinh **MỘT** lớp — không nhân đôi.
- AC9: Given file Excel có dòng lệch khung giờ, When nhập, Then dòng đó bị từ chối kèm lý do, **các dòng còn lại vẫn vào**.
- Truy vết: `lib/trial/khung-gio-mo-lop.test.ts` `[KGM-05]` (sinh ngày theo thứ) · `[KGM-08]` (khung chung của một nhóm thứ) · `[KGM-09]` (bộ tuỳ chọn gợi ý) · route `app/api/admin/import/trial-classes/route.ts`.

> ⚠️ **BẢN ĐẦU CỦA US này ĐÃ BỊ ĐẢO.** Nó từng ghi: ~~"form cả kỳ **KHÔNG nhận giờ** — chỉ tick thứ, mỗi ngày tự sinh đủ **mọi** khung của thứ đó"~~. Đảo ngày 22/09/2026 theo **QĐ-A6**: sinh đủ mọi khung là quyết hộ người dùng rằng cả sáng lẫn chiều T7 đều mở, trong khi thực tế có tuần chỉ mở buổi sáng — và mở dư lớp thì Sale nhìn thấy khung trống rồi hẹn khách vào đúng khung không có GV.

### 1.4 Tác động dữ liệu

- **Không migration mới** cho hạng mục này. Dùng lại `TrialClassV2.startDate` / `startTime` / `endTime` (đã có, nullable).
- **`TrialClassV2.courseId` GIỮ NGUYÊN** dù hai form không còn gửi nó (QĐ-A7). Không drop cột: lớp cũ đang gắn khoá, và đường import Excel vẫn nhận `courseSlug` tuỳ chọn. Lớp mở từ 22/09 mang `courseId = null`.
- **Cấu hình mới:** 7 khoá `trial.khungGio.<cn|t2|t3|t4|t5|t6|t7>` (`lib/settings/registry.ts`), nhóm `teacher`, tab **"Lớp & giáo viên"** của Cấu hình vận hành. Kiểu **chuỗi**, ví dụ `"08:00-11:30, 14:00-17:30"`; để trống = ngày đó không mở.
- **Quyền mới:** `trials:create-class` — `lib/auth/permissions.ts:115` (union) + `:478` (matrix v1); seed v2 tại `prisma/seed-roles.ts:396` (TRAINING) và `:560` (CENTER_MANAGER).

---

## §2. Ba quyết định kỹ thuật cần biết khi bảo trì

### 2.1 Một cổng khung giờ cho BA đường mở lớp

Form một ngày · "mở cho cả kỳ" (khoảng ngày × N tuỳ chọn) · import Excel — cả ba gọi **cùng** `khungChoNgay` + `kiemKhungLop` (`lib/trial/khung-gio-mo-lop.ts`). Import là đường đẻ ra nhiều lớp nhất một lúc, nên cũng là đường mà một bản kiểm thứ hai sẽ nhân lỗi lên nhiều nhất.

### 2.2 "Trọn trong MỘT khung", không phải "nằm giữa hai đầu"

Xem QĐ-A4. Ca `[KGM-03b]` khoá đúng chỗ này, và nó là ca duy nhất trong bộ mà một bản kiểm "hợp lý" vẫn sai.

### 2.3 Vì sao 7 khoá CHUỖI, không phải 1 khoá JSON, và không cho ghi đè theo cơ sở

- Màn Cấu hình vận hành dựng ô nhập **theo kiểu giá trị** (`settings-editor.tsx`: chuỗi ⇒ ô chữ). Bảy khoá chuỗi hiện ra thành bảy ô gõ được ngay, không phải viết thêm editor. Repo đã **ba lần** từ chối cho cấu hình dạng danh sách hiện thành ô JSON thô (xem chú thích trong `app/(admin)/admin/cau-hinh-van-hanh/page.tsx`).
- `centerOverridable: false`: form dựng ô chọn khung ở **client** từ chính bảy khoá này. Cho ghi đè theo cơ sở là client bày một khung mà server sẽ từ chối — ô chọn hứa một việc không làm được.

---

## §3. Hạng mục B — Thống kê case trải nghiệm theo Sale

### 3.1 Nguồn (trích nguyên văn, 22/09/2026)

> "cần thêm 1 màn thống kê các case trial: … gồm có quyền chọn khu vực(đối với admin hoặc role qly quản lý cả khu vực) chọn cơ sở(đối với quản lý nhiều cơ sở, nếu chỉ 1 cơ sở thì cũng có nhưng chỉ hiện 1 cơ sở duy nhất),chọn khung thời gian(mặc định là từ ngày 1-ngày hiện tại mỗi tháng), bảng thống kê các case trial của từng sale với các cột tên sale, số case trial từ ngày đã chọn ở khung thời gian trên, số case đã hoàn thành trial, số case huỷ, số case trial xong đã chốt được, số case trial hoàn thành nhưng im lặng, tỷ lệ thành công(số case trial thành công/ tổng số trial), bấm vào các số liệu thì sẽ hiển thị ra các thông tin số liệu"

### 3.2 Hiện trạng (có dẫn code)

| Điều | Bằng chứng |
|---|---|
| `TrialEnrollment.addedById` = người **thêm case** = Sale | `prisma/schema.prisma`, model `TrialEnrollment` |
| Trạng thái case chỉ có 3 giá trị | `enum TrialEnrollmentStatus { ACTIVE COMPLETED WITHDRAWN }` |
| Đã có báo cáo trải nghiệm nhưng **theo cơ sở** | `app/(admin)/admin/bao-cao/trial/page.tsx` · `lib/reports/trial.ts` (`CenterTrialStats`) |
| Convert lead ghi `Enrollment.leadChildId` | `lib/crm/convert-lead-v2.ts:412` |
| `LeadTrialHistory.outcome` chỉ bật `ENROLLED` cho đúng cặp (con × lớp) và chỉ khi đang `PENDING` | `lib/crm/convert-lead-v2.ts:450` (`updateMany` có `where.outcome: "PENDING"`) |

### 3.3 ⚠️ Định nghĩa "ĐÃ CHỐT" — điểm dễ làm sai nhất

**Tín hiệu là `Enrollment.leadChildId`, KHÔNG phải `LeadTrialHistory.outcome`.**

`outcome` sinh ra để tính **hoa hồng giáo viên dạy Trial**: nó chỉ chuyển sang `ENROLLED` cho đúng cặp (con × lớp mà em đã điểm danh) và chỉ khi dòng lịch sử đang ở `PENDING` (`lib/crm/convert-lead-v2.ts:450`). Case chưa điểm danh lượt nào thì **không có dòng lịch sử**, nên `updateMany` khớp 0 dòng và `outcome` không bao giờ thành `ENROLLED` dù con đó đã được chốt.

Thêm mốc thời gian: chỉ tính ghi danh sinh ra **sau** khi case được tạo — để không đếm em vốn đã là học viên trước khi đi thử.

### 3.4 User story

**US-RPT-01** · Là **Quản lý cơ sở / Quản trị**, tôi muốn **xem từng Sale mở bao nhiêu case trải nghiệm và chốt được bao nhiêu** để **biết ai cần hỗ trợ và ai đang để khách im lặng**.
- Ưu tiên: P1 · Loại: FR
- Nguồn: §3.1 · Hiện trạng: báo cáo hiện có thống kê theo cơ sở — `lib/reports/trial.ts`
- AC1: Given khoảng ngày mặc định (ngày 1 → hôm nay), When mở `/bao-cao/trial-sale`, Then mỗi Sale một dòng với 8 cột số + tỷ lệ, lọc theo **ngày tạo case**.
- AC2: Given một Sale có 2 case hoàn thành trong đó 1 đã chốt, Then tỷ lệ hiện **50%** kèm phân số `1/2`.
- AC3: Given một Sale chỉ có case huỷ và case đang chờ, Then tỷ lệ hiện **"—"**, KHÔNG phải 0%.
- AC4: Given bảng có dữ liệu, Then có **hàng TỔNG**; tỷ lệ của hàng TỔNG tính lại trên toàn bộ, **không** lấy trung bình các dòng.
- AC5: Given case không rõ người thêm, Then vẫn hiện thành **một dòng**; tổng các dòng = tổng số case.
- Truy vết: `lib/reports/trial-sale.test.ts` `[TKS-01..04]` · Vitest · **có job CI**.

**US-RPT-02** · Là **người đọc báo cáo**, tôi muốn **bấm vào một con số để xem đúng những case đằng sau nó** để **không phải mở màn khác rồi tự lọc lại**.
- Ưu tiên: P1 · Loại: FR
- AC1: Given ô "Hoàn thành" của một Sale hiện số 7, When bấm, Then bung ra bảng **đúng 7 dòng** (tên con, phụ huynh, lớp, ngày, giáo viên), mỗi dòng link sang lớp trải nghiệm.
- AC2: Given ô hiện số **0**, Then **không bấm được** — không mở ra một danh sách rỗng.
- AC3: Given đang mở một ô, When bấm ô khác, Then chỉ ô mới mở (một ô tại một thời điểm).
- Truy vết: `lib/reports/trial-sale.test.ts` `[TKS-05]` — ca này chạy cho **mọi** cột.

**US-RPT-03** · Là **người quản nhiều khu vực**, tôi muốn **lọc theo khu vực và cơ sở** để **đọc số của đúng phạm vi mình phụ trách**.
- Ưu tiên: P1 · Loại: FR + NFR(security)
- AC1: Given người dùng quản **1** khu vực, Then ô chọn khu vực **không hiện**; ô chọn cơ sở **vẫn hiện**.
- AC2: Given chọn khu vực X và cơ sở Y **không thuộc X**, Then kết quả **rỗng** (giao, không phải hợp).
- AC3: Given khu vực không có cơ sở nào, Then kết quả **rỗng**, KHÔNG phải hiện dữ liệu toàn hệ.
- AC4: Given người dùng CS1, Then không đọc được case của CS2 kể cả khi sửa URL — cách ly qua `scopedDb` trên `TrialClassV2`.
- Truy vết: `lib/reports/trial-sale.test.ts` `[TKS-07]` (hàm thuần `phamViCoSo`) · `[TKS-06]` (lưới ghim tầng truy vấn).

### 3.5 Tác động dữ liệu

**Không có.** Màn này **chỉ đọc** — không bảng mới, không cột mới, không migration. Quyền dùng lại `trials:view` (đã có, cùng khoá với `/bao-cao/trial`).

---

## §4. NFR

| Nhóm | Yêu cầu | Cách đạt |
|---|---|---|
| **Performance** | Admin Lighthouse ≥ 90 mobile | Một lượt tra cho cả trang (không N+1); trần 5.000 case/lượt và **nói ra** khi chạm trần; xuất Excel dựng CSV ở client, không kéo thêm thư viện vào bundle |
| **Security & PII** | Cách ly cơ sở ở cả đọc lẫn ghi | Đọc: `scopedDb` qua `trialClass.centerId`. Ghi (import Excel): `passesScope` **từng dòng** — `scopedDb` chỉ tự lọc phép đọc |
| **Usability** | Mobile 375px; tiếng Việt dài | Bảng cuộn ngang, `whitespace-nowrap` trên `th` và `td`; bo góc ở vỏ ngoài, cuộn ở lớp trong (tránh vạt góc) |
| **Usability** | Đủ **4 trạng thái** (DESIGN.md §5) | Rỗng: nói vì sao + lối đi tiếp · Không có quyền: nêu **thiếu quyền nào** và **hỏi ai** · Lỗi/loading: theo khuôn chung |
| **Ops** | Rollback bấm giờ được | Xem §5 |

---

## §5. Rollback

**Không dùng feature flag** cho cả hai hạng mục — có chủ đích, và phải hiểu rõ hệ quả:

| Hạng mục | Cách lùi |
|---|---|
| A — quyền mở lớp | Sửa `prisma/seed-roles.ts` thêm `trials:create-class` cho `CENTER_SALES_CSM`, chạy workflow `seed-prod-roles.yml`. **Không cần deploy code.** |
| A — khung giờ | Nới 7 khoá cấu hình ở màn Cấu hình vận hành (ví dụ `00:00-23:59`) ⇒ cổng khung giờ hết chặn. **Không cần deploy code.** |
| A — lớp phải có ngày/khung | Cần revert code (`createClassSchema`). Đây là phần duy nhất không lùi được bằng cấu hình. |
| B — màn thống kê | Gỡ mục sidebar hoặc revert commit `d61791ec`. Màn chỉ đọc nên không để lại dữ liệu gì. |

---

## §6. ⚠️ Việc PHẢI LÀM TAY sau khi lên prod

> **Bấm chạy workflow `seed-prod-roles.yml`.**
>
> RBAC v2 đọc quyền **từ DB**; merge file seed **không đổi gì trên prod**. Không chạy thì `trials:create-class` không tồn tại trên prod và **KHÔNG AI mở được lớp trải nghiệm** — kể cả Quản trị tối cao đi đường `can()` v2 thì cũng chỉ đúng nhờ nhánh SUPER_ADMIN, còn Quản lý cơ sở và Đào tạo thì mất hẳn chức năng.

---

## §7. Kiểm chứng đã chạy

| Cổng | Kết quả |
|---|---|
| `pnpm typecheck` | 0 lỗi |
| `pnpm lint` | 0 error |
| `pnpm test:unit` | 8.458 xanh / 0 đỏ |
| Cấy lại lỗi (luật 8) | **21 ca, cả 21 ĐỎ** — 8 ca khung giờ, 13 ca thống kê |
| Bộ dò `/impeccable` | 0 phát hiện |

**Một lượt xanh giả đã phát hiện và vá, ghi lại vì nó là bài học lặp lại được:** phép giao KHU VỰC × CƠ SỞ lúc đầu viết thẳng trong tầng truy vấn và chỉ có **lưới ghim mã nguồn** canh. Cấy lỗi *"khu vực rỗng thì bỏ qua bộ lọc"* ⇒ lưới **XANH GIẢ**: nó thấy đủ chữ nhưng không thấy nhánh đã bị vô hiệu hoá **trước** đó. Đúng cảnh báo của luật 11 (*"ưu tiên khẳng định HÀNH VI"*). Đã bóc thành hàm thuần `phamViCoSo` có test hành vi; 3 ca cấy lại đều đỏ.

---

## §8. Chưa chốt / để ngỏ

| # | Điểm | Mặc định đang chạy | Owner | Hạn |
|---|---|---|---|---|
| **Q1** | Cột **"Vắng (không đến)"** hiện sẽ **luôn bằng 0** cho tới khi bắt đầu điểm danh buổi trải nghiệm thật (đo 22/09: `TrialAttendance` = 0 dòng trên DB local). Chủ dự án đã được báo trước và vẫn chọn làm cột này. | Giữ cột, định nghĩa "có điểm danh và **mọi** lượt đều vắng" | Chủ dự án | khi bắt đầu điểm danh thật |
| **Q2** | Hai màn báo cáo trải nghiệm cùng tồn tại (`/bao-cao/trial` theo **cơ sở**, `/bao-cao/trial-sale` theo **Sale**) và **định nghĩa "chốt" khác nhau** — màn cũ suy từ `LeadChild.trialStatus` / `Lead.status`, màn mới từ `Enrollment.leadChildId`. Hai con số có thể lệch. | Màn mới in rõ định nghĩa ngay dưới bảng | Chủ dự án | trước khi dùng số để tính thưởng |
| **Q3** | Có cần **"thời gian trung bình từ case → chốt"** không? BA đã đề xuất, chủ dự án chưa chọn. | Chưa làm | Chủ dự án | — |
