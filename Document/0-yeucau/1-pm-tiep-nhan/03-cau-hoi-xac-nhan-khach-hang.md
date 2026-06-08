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

---

**Sau khi nhận trả lời:** PM cập nhật 2 phiếu tiếp nhận → BA hoàn thiện spec trong `2-ba-phan-tich/` → chốt roadmap `3-ke-hoach-trien-khai/`.
