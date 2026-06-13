# Câu hỏi xác nhận với khách hàng (PM → CEO/TGĐ + Kế toán Hội sở)

> Mục đích: chốt scope bằng văn bản **trước khi** BA viết spec chi tiết và team code.
> Cách dùng: khách trả lời trực tiếp vào cột "Trả lời" → PM cập nhật MoSCoW + roadmap.

---

## Nhóm A — Ưu tiên tổng thể

| # | Câu hỏi | Phương án đề xuất | Trả lời |
|---|---|---|---|
| A1 | Thứ tự ưu tiên giữa 2 yêu cầu: SR217 (tuyển sinh/hoa hồng) và QL HV & LMS? | **SR217 trước** (văn bản đã ban hành, có deadline vận hành hằng tháng) | |
| A2 | Bảng MoSCoW ở Phiếu #01 mục 4 — anh/chị duyệt hay điều chỉnh mục nào? | Duyệt như đề xuất | |
| A3 | Các mục R&D (marketplace, multi-tenant) — đồng ý tách track nghiên cứu riêng, không cam kết deadline? | Đồng ý — lập doc nghiên cứu khi đến lượt | |

## Nhóm B — SR217 (cần Kế toán Hội sở + TGĐ chốt)

| # | Câu hỏi | Phương án đề xuất | Trả lời |
|---|---|---|---|
| B1 | **Thời điểm ghi nhận LEADS_3**: khi đóng *đủ* học phí, hay đóng *đợt 1* (hệ thống cho trả góp 2 đợt)? | Đợt 1 đã xác nhận (Order CONFIRMED) = LEADS_3; doanh số tính theo số tiền thực thu từng đợt | |
| B2 | **"Doanh số khai thác mới"** có loại trừ tái tục/gia hạn của học viên cũ không? Hoa hồng tái tục tính riêng cho ai (%)? | Loại trừ tái tục khỏi hoa hồng 4 tầng; tái tục có cơ chế riêng (cần anh/chị cho %) | |
| B3 | Nguồn `referral` (giới thiệu) — ai hưởng tầng nào trong 4 tầng? | Sale chốt 4% + QL TT 2%; bỏ tầng QC/Admin | |
| B4 | Hoàn tiền (REFUNDED) sau khi đã tính hoa hồng → **truy thu (clawback)** kỳ lương sau? | Có — bút toán âm kỳ kế tiếp, ghi audit | |
| B5 | 1 lead do nhiều người chăm (đổi sale giữa chừng) — hoa hồng Sale 4% chia thế nào? | Người chốt cuối hưởng 100% tầng Sale (theo `LeadAssignmentHistory` đối soát khi tranh chấp) | |
| B6 | Công thức CPL: lead bàn giao **cuối tháng nhưng đóng tiền tháng sau** tính kỳ nào? | LEADS_2 tính theo tháng bàn giao; LEADS_3 theo tháng đóng tiền | |
| B7 | Xin **3 file Excel hiện hành** (QC / Admin / TT) để làm chuẩn export tương thích? | Gửi file đính kèm cho team | |
| B8 | "Nhượng quyền N trung tâm, hạch toán riêng" — giai đoạn này chỉ cần **báo cáo tách theo TT** (như hiện tại) hay cần tách pháp nhân/hóa đơn? | Báo cáo tách theo TT trước; tách pháp nhân để giai đoạn nhượng quyền thực tế | |
| B9 | Alert SLA gửi qua kênh nào: chuông admin (đã có) / email / Zalo? | Chuông admin + email; Zalo khi bật `ZALO_LIVE` | |

## Nhóm C — QL HV & LMS

| # | Câu hỏi | Phương án đề xuất | Trả lời |
|---|---|---|---|
| C1 | "App" cho PH/HV: **PWA** (web cài lên màn hình, có push) hay app native (chi phí lớn, 2 store)? | PWA trước — portal hiện tại nâng cấp được ngay | |
| C2 | Lưu **giấy tờ tùy thân** học viên: bắt buộc giai đoạn này? (kéo theo consent + bảo mật cao) | Bỏ luôn thu thập thông tin giấy tờ tuỳ thân — chỉ lưu ảnh đại diện có consent | |
| C3 | "Xếp lớp tự động sau test": test đầu vào hiện làm thế nào (offline/online)? Tiêu chí xếp (tuổi, điểm, trình độ)? | BA phỏng vấn Giáo vụ để viết spec | |
| C4 | Thông báo Zalo OA: cung cấp OA token production + duyệt template ZNS để bật `ZALO_LIVE`? | Khách cung cấp trong tuần | |
| C5 | MISA AMIS: cung cấp tài khoản API/sandbox + chốt phạm vi đồng bộ (KH, hóa đơn, phiếu thu)? | Bắt đầu bằng push hóa đơn + phiếu thu | |
| C6 | Cổng thanh toán online: chọn cổng nào (VNPay/Tingee/khác), có hợp đồng chưa? | Tingee (đã có trong PaymentMethodType) — khách xác nhận | |
| C7 | Đổi quà SataCoin: danh mục quà + quy tắc quy đổi do ai quản lý? | CENTER_MANAGER quản danh mục, quy tắc thống nhất toàn hệ thống | |
| C8 | NPS → KPI CSKH: công thức KPI cụ thể (ngưỡng điểm, trọng số)? | Kế toán/HR cung cấp công thức | |

## Nhóm D — Pháp lý & dữ liệu

| # | Câu hỏi | Phương án đề xuất | Trả lời |
|---|---|---|---|
| D2 | Ảnh lớp học hiện đăng portal đã có duyệt (manager) — có cần PH **đồng ý trước** (opt-in per học viên)? | Thêm cờ consent per Student khi nhập học | |

## Nhóm E — SRS LMS v3.1 (Phiếu #04, tiếp nhận 12/06/2026 — ✅ TGĐ ĐÃ TRẢ LỜI 12/06/2026)

| # | Câu hỏi | Phương án đề xuất | Trả lời (TGĐ 12/06/2026) |
|---|---|---|---|
| E1 | **Xếp phase**: slot R6 đã được đặt cho "Flexibility & Hardening" (BA #04, TGĐ baseline 11/06). LMS v3.1 xếp thế nào? | **Phương án đề xuất:** giữ R6 = Hardening (gồm tiền đề C1–C3 + B1–B4) rút gọn phần chồng lấn → LMS v3.1 = **R7** (tách R7a lõi vận hành / R7b nội dung đào tạo nếu >4 tuần). Phương án khác: gộp tất cả vào 1 phase R6 lớn (rủi ro kéo dài) | ✅ **Làm theo đề xuất** — R6 = Hardening, LMS v3.1 = R7 (R7a/R7b) |
| E2 | **Học bù liên cơ sở (XĐ-1)**: SRS v3.1 (TGĐ 12/06) cho phép CS1↔CS2 mặc định, nhưng BA #04 (TGĐ baseline 11/06) chốt "mặc định cùng cơ sở, chéo = exception duyệt". Bản nào thắng? | SRS v3.1 thắng (mới hơn, ghi "TGĐ xác nhận lần cuối") → sửa baseline BA #04 tương ứng; kỹ thuật: đọc chéo cơ sở qua exception có kiểm soát trong scopedDb + audit | ✅ **Học bù LIÊN CƠ SỞ thắng** — sửa baseline BA #04 |
| E3 | **Form builder (XĐ-2)**: SRS yêu cầu Admin tự cấu hình câu hỏi/phương án cho đánh giá GV + khảo sát; BA #04 IR-2 cấm form-builder tổng quát. Chốt phạm vi? | Form builder **giới hạn cho 2 nghiệp vụ khảo sát/đánh giá** — không phải page-builder tổng quát; cập nhật wording IR-2 | ✅ **4 loại câu hỏi: thang mức (1–5 sao), radio (chọn 1), checkbox (chọn nhiều), textbox (tự luận)** — giới hạn cho khảo sát/đánh giá |
| E4 | **Mã học viên (XĐ-7)**: format hiện tại `CS1.HV.26.001` (tuần tự) đã phát hành cho học viên thật. Đổi sang `CSx-YY-RANDOM`? | Mã mới áp dụng từ thời điểm triển khai (2-phase); mã cũ giữ nguyên không đổi | ✅ **Xác nhận format mã mới** `CSx-YY-RANDOM` — để kiểm soát tốt khi nhiều chi nhánh |
| E5 | **SCORM (XĐ-6)**: xác nhận SCORM thuộc scope — không vi phạm "không build video LMS" (Doc 15 Q12)? Chấp nhận giới hạn chống quay/chụp mức trình duyệt như SRS §12.4? | Xác nhận thuộc scope (khác bản chất video LMS); nghiệm thu theo wording trung thực SRS §12.4 | ✅ **Xác nhận** |
| E6 | **Chặn convert chưa thanh toán (XĐ-4)**: flow prod hiện cho convert không cần tiền. Lead/Order PENDING_PAYMENT đang tồn xử lý thế nào? | Ngoại lệ duy nhất: giá phải thanh toán = 0 (học bổng toàn phần); dữ liệu cũ giữ nguyên | ✅ **Không có dữ liệu thanh toán thật cũ → toàn quyền áp rule mới**, không cần migrate đặc biệt |
| E7 | **Nhắc nợ X ngày (XĐ-3)**: X do Sale nhập per-Enrollment (SRS) hay SystemSetting toàn hệ thống (BA #04)? | Kết hợp: X mặc định = SystemSetting, Sale được override per-Enrollment | ✅ **X mặc định = 14 ngày trước ngày đợt 2 (PH chọn ngày); Sale nhập X → dùng X, bỏ 14** |
| E8 | **Migrate lead cũ**: lead hiện tại chỉ có 1 con (childName/childAge phẳng). Khi thêm LeadChild, migrate thế nào? | Migrate tự động (script idempotent), giữ field cũ đọc-only theo 2-phase | ✅ **Lead cũ đa phần là lead test — KHÔNG cần quan tâm, build theo rule mới**; khi có lead thật TGĐ sẽ báo |
| E9 | **Trạng thái Lead**: thêm "Đã đăng ký" tách khỏi "Đã chuyển đổi", và "Đang học thử"? | Thêm trạng thái mới vào enum (additive); L3 giữ nguyên định nghĩa | ✅ **"Đã đăng ký" = lead đã đăng ký khóa học VÀ đã thanh toán (đợt 1 hoặc full)** — sau đó mới "Đã chuyển đổi" (convert xong) |

> **Bổ sung TGĐ chốt cùng đợt (XĐ-5):** mô hình lớp trải nghiệm chuyển từ **cố định 4 buổi** sang **LINH ĐỘNG số buổi** — bộ phận Đào tạo cấu hình số buổi qua trang admin; hệ thống sinh lịch theo cấu hình.

---

**Sau khi nhận trả lời:** PM cập nhật 2 phiếu tiếp nhận → BA hoàn thiện spec trong `2-ba-phan-tich/` → chốt roadmap `3-ke-hoach-trien-khai/`.
