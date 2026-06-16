# Project Backlog & Roadmap Spec — Sata Robo VN

**Tác giả:** Project Manager (PM) Agent  
**Trạng thái:** Hoàn thành Thiết lập Kế hoạch Dự án  
**Dự án:** Quản lý Học viên & LMS tích hợp kết hợp Module CRM Tuyển sinh  

Tài liệu này dịch chuyển các yêu cầu nghiệp vụ từ tài liệu phân tích của BA thành một lộ trình phát triển cụ thể (Sprint Roadmap) và danh sách các thẻ công việc (Backlog Tasks) có độ ưu tiên, ước lượng độ phức tạp phục vụ cho đội ngũ lập trình (Dev) triển khai trực tiếp.

---

## 1. Lộ trình phát triển đề xuất (Sprint Roadmap)

Dự án được đề xuất chia thành 3 Giai đoạn (Phases) chạy qua 6 Sprints (mỗi Sprint kéo dài 2 tuần) để đảm bảo bàn giao tính năng cuốn chiếu:

```
[ Phase 1: CRM & Tuyển sinh ] ──► [ Phase 2: Điểm danh AI & Học tập ] ──► [ Phase 3: Nâng cao & Portal ]
  ├─ Sprint 1: Database & Core CRM   ├─ Sprint 3: Điểm danh Camera AI       ├─ Sprint 5: Cổng Portal Đa Con
  └─ Sprint 2: Commission & Accounting └─ Sprint 4: LMS & Giao bài tập       └─ Sprint 6: NFT Certificates
```

### Phase 1: Quản trị CRM & Dòng tiền Tuyển sinh (Sprint 1 - 2)
*   **Mục tiêu:** Đồng bộ phễu Lead 3 cấp độ (`LEADS_1`/`LEADS_2`/`LEADS_3`), thiết lập cơ chế phân phối tự động, động cơ tính hoa hồng 4 tầng và báo cáo kế toán phân bổ chi phí.
*   **Đầu ra:** Dashboard CRM vận hành ổn định cho Sales Admin, Sales trung tâm và Kế toán.

### Phase 2: Điểm danh AI & LMS Cốt lõi (Sprint 3 - 4)
*   **Mục tiêu:** Tích hợp Camera AI điểm danh nhận diện khuôn mặt tự động, kết xuất sổ chuyên cần và liên lạc điện tử; cấu hình giáo trình LMS và bài thi trắc nghiệm trực tuyến.
*   **Đầu ra:** Hệ thống điểm danh tự động hoạt động tốt tại các phòng học cơ sở, dữ liệu đồng bộ thẳng về học bạ.

### Phase 3: Portal Học viên & Các tính năng mở rộng (Sprint 5 - 6)
*   **Mục tiêu:** Phát triển giao diện Portal phụ huynh quản lý nhiều con chung 1 User, ví điểm thưởng SataCoin, hệ thống khảo sát NPS tự động và chứng chỉ NFT động.
*   **Đầu ra:** Trọn bộ giải pháp phân hệ Portal và các tiện ích Web3/NFT.

---

## 2. Danh sách Backlog Tasks chi tiết

Quy ước ước lượng: **Story Points (SP)** (1 SP tương đương khoảng 4 giờ làm việc thực tế).  
Độ ưu tiên phân loại theo MoSCoW: **Must (Bắt buộc)**, **Should (Nên có)**, **Could (Có thể thêm)**, **Won't (Để sau)**.

### 2.1. Phân hệ CRM & Kế toán Tuyển sinh (Phase 1)

#### Task CRM-01: Cập nhật Schema Database cho Lead 3 cấp độ và Tracking
*   **Mô tả:** Cập nhật bảng `Lead` trong `schema.prisma` để hỗ trợ phân loại trạng thái leads (`LEADS_1`, `LEADS_2`, `LEADS_3`), ghi nhận nguồn leads (`source`), cơ sở nhận lead (`centerId`), sales trực tiếp (`assignedToId`) và các trường tracking quảng cáo (`utmSource`, `utmMedium`, `utmCampaign`, `fbclid`, `gclid`).
*   **Độ ưu tiên:** Must
*   **Ước lượng:** 3 SP
*   **Sự phụ thuộc (Dependencies):** Không có.

#### Task CRM-02: API tiếp nhận Leads và cơ chế chống Spam/Bot
*   **Mô tả:** Viết endpoint `/api/leads` nhận payload điền form. Triển khai bẫy Honeypot, kiểm tra thời gian điền form `timeOnPage >= 3s`, rate limiting (Upstash Redis) và thuật toán đối soát trùng số điện thoại trong 90 ngày.
*   **Độ ưu tiên:** Must
*   **Ước lượng:** 5 SP
*   **Sự phụ thuộc:** Task CRM-01.

#### Task CRM-03: Xây dựng Giao diện Bàn giao và Phân bổ Lead tự động
*   **Mô tả:** Tạo màn hình bàn giao lead cho Sale Admin. Phát triển Server Action tự động phân bổ lead theo cơ chế Round Robin hoặc Close Rate thuộc cấu hình `LeadAssignmentConfig` của từng cơ sở.
*   **Độ ưu tiên:** Must
*   **Ước lượng:** 5 SP
*   **Sự phụ thuộc:** Task CRM-02.

#### Task CRM-04: Động cơ tính hoa hồng 4 tầng (Commission Engine)
*   **Mô tả:** Xây dựng script/action tự động chạy vào cuối tháng để tính toán hoa hồng 4 tầng cho QC Marketing (1%), Sale Admin (1%), Sales chốt đơn (4%) và Quản lý cơ sở (2%) trên doanh thu đóng phí thực tế của `LEADS_3`. Tạo bảng `RoleAuditLog` và lưu vết.
*   **Độ ưu tiên:** Must
*   **Ước lượng:** 8 SP
*   **Sự phụ thuộc:** Task CRM-03.

#### Task ACC-01: Module Kế toán phân bổ chi phí quảng cáo (CPL / CPA)
*   **Mô tả:** Tạo giao diện nhập chi phí marketing cho kế toán hội sở. Tự động tính đơn giá `CPL`, chia chi phí về từng trung tâm dựa trên số `LEADS_2` tiếp nhận, tính chỉ số `CPA` toàn hệ thống và xuất bảng đối soát Excel.
*   **Độ ưu tiên:** Should
*   **Ước lượng:** 5 SP
*   **Sự phụ thuộc:** Task CRM-02.

---

### 2.2. Phân hệ Điểm danh Camera AI & LMS (Phase 2)

#### Task ACAD-01: API Tích hợp Camera AI điểm danh tự động
*   **Mô tả:** Xây dựng endpoint nhận request webhook từ Camera AI ở cơ sở khi nhận diện được mặt học sinh. Giải mã dữ liệu khuôn mặt, so khớp mã số học sinh, tự động ghi nhận trạng thái chuyên cần (`Attendance` - PRESENT) kèm link ảnh đối chiếu.
*   **Độ ưu tiên:** Must
*   **Ước lượng:** 8 SP
*   **Sự phụ thuộc:** Không có.

#### Task ACAD-02: Giao diện Điểm danh thủ công & Bảng chuyên cần giáo viên
*   **Mô tả:** Thiết kế màn hình điểm danh thủ công cho giáo viên trên lớp làm phương án fallback. Tự động tạo bản ghi `MakeupNeed` khi có học sinh vắng mặt.
*   **Độ ưu tiên:** Must
*   **Ước lượng:** 4 SP
*   **Sự phụ thuộc:** Task ACAD-01.

#### Task LMS-01: Giao diện Giao/Chấm Bài tập về nhà và Ngân hàng câu hỏi
*   **Mô tả:** Phát triển giao diện quản lý ngân hàng câu hỏi (5 loại câu hỏi), Server Action tạo bài thi trực nghiệm trực tuyến và giao bài tập về nhà đính kèm tài liệu.
*   **Độ ưu tiên:** Should
*   **Ước lượng:** 8 SP
*   **Sự phụ thuộc:** Không có.

---

### 2.3. Cổng Portal Phụ huynh & Tiện ích nâng cao (Phase 3)

#### Task PORTAL-01: Hỗ trợ tài khoản Phụ huynh quản lý nhiều con (Multi-Student)
*   **Mô tả:** Cập nhật logic session và giao diện Portal `hocvien.satarobo.vn` để khi phụ huynh đăng nhập có thể chọn hồ sơ con học tập cụ thể, thực hiện đổi hồ sơ nhanh mà không cần đăng xuất.
*   **Độ ưu tiên:** Must
*   **Ước lượng:** 5 SP
*   **Sự phụ thuộc:** Không có.

#### Task PORTAL-02: Đánh giá Năng lực học viên & Sổ liên lạc điện tử đính kèm hình ảnh
*   **Mô tả:** Tạo giao diện sổ liên lạc hiển thị nhận xét buổi học đính kèm hình ảnh/video hoạt động thực tế của lớp học. Cấu hình bảng năng lực 10 kỹ năng STEM phục vụ hồ sơ du học.
*   **Độ ưu tiên:** Should
*   **Ước lượng:** 5 SP
*   **Sự phụ thuộc:** Task ACAD-02.

#### Task WEB3-01: Tích hợp Ví điểm thưởng SataCoin & Chứng chỉ NFT động
*   **Mô tả:** Tạo ví điểm thưởng SataCoin tích điểm từ chuyên cần, bài tập. Kịch bản phát hành chứng chỉ NFT lưu trữ IPFS khi hoàn thành khóa học (nghiên cứu blockchain giai đoạn sau).
*   **Độ ưu tiên:** Could
*   **Ước lượng:** 10 SP
*   **Sự phụ thuộc:** Task LMS-01.

---

## 3. Quản trị rủi ro & Cảnh báo SLA nội bộ

*   **Rủi ro trễ thời gian phản hồi Lead:** Nếu Sales không liên hệ khách hàng trong vòng 2 giờ, tỷ lệ chốt đơn giảm mạnh.
    *   *Giải pháp:* Thiết lập Cron job tự động quét trạng thái lead và gửi thông báo cảnh báo (Alert) tới điện thoại/email của Quản lý trung tâm nếu quá thời hạn 2 giờ mà trạng thái lead chưa đổi sang `in_progress`.
*   **Rủi ro sai lệch dữ liệu tài chính:** Doanh số tính hoa hồng và chi phí phân bổ quảng cáo liên quan đến tiền bạc, dễ xảy ra khiếu nại.
    *   *Giải pháp:* Mọi hoạt động sửa đổi thông tin thanh toán, doanh thu đơn hàng bắt buộc phải đi qua cơ chế ghi chép Audit Log bất biến. Bảng tính lương hoa hồng cuối tháng cần có nút "Chốt khóa sổ" để lưu vết phiên bản cố định.
