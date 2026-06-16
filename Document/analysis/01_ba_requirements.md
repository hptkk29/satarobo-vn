# Business Requirements Document (BRD) — Sata Robo VN

**Tác giả:** Business Analyst (BA) Agent  
**Trạng thái:** Hoàn thành Phân tích Yêu cầu  
**Dự án:** Quản lý Học viên & LMS tích hợp kết hợp Module CRM Tuyển sinh  

---

## 1. Tổng quan Nghiệp vụ (Business Overview)

Tài liệu này chuẩn hoá các yêu cầu thô của khách hàng từ hai tài liệu đầu vào:
1.  **Yêu cầu tính năng QL HV.pdf**: Quản lý học viên, lớp học, điểm danh AI/IoT, LMS học tập, cổng phụ huynh, tích hợp tài chính và học bạ điện tử Web3/NFT.
2.  **TomTat_QuyTrinh_TuyenSinh_SR217.docx**: Quy trình phối hợp tuyển sinh (phễu leads 3 tầng), công thức phân bổ chi phí quảng cáo (CPL/CPA), cơ chế hoa hồng 4 tầng và hệ thống cảnh báo SLA nội bộ.

---

## 2. Phân tích chức năng chi tiết (Functional Decomposition)

### 2.1. Module CRM & Phễu Tuyển sinh (Tuyển sinh SR.QD.217)
*   **Quản lý Lead 3 cấp độ (Leads Funnel)**:
    *   `LEADS_1` (Lead thô): Ghi nhận tương tác quảng cáo (Ads), tin nhắn trang Fanpage/Zalo OA.
    *   `LEADS_2` (Lead đủ điều kiện): Lead đã có số điện thoại (SĐT) và nội dung trao đổi sơ bộ do Sale Admin lọc và sẵn sàng bàn giao cho các cơ sở trung tâm.
    *   `LEADS_3` (Lead chốt đơn): Lead đã thực hiện đóng học phí thành công (trở thành doanh số thực tế tính hoa hồng).
*   **Quy trình Phân phối & Bàn giao (Handover Workflow)**:
    *   Sale Admin thu thập `LEADS_2` -> Bàn giao cho Trung tâm phù hợp (trong ngày).
    *   Quản lý Trung tâm tiếp nhận và phân công cho TVV/Sales của trung tâm trong vòng **30 phút**.
    *   Sales liên hệ khách hàng trong vòng **2 giờ**, cập nhật nhật ký liên hệ (`contact_log`).
    *   Đồng bộ doanh số đóng tiền trong ngày để kích hoạt `LEADS_3`.
*   **Động cơ Tính toán hoa hồng 4 tầng (Commission Engine)**:
    *   *Tầng 1 (QC Marketing):* 1% doanh số của `LEADS_3` có nguồn phát sinh từ Marketing.
    *   *Tầng 2 (Sale Admin):* 1% doanh số của `LEADS_3` từ lead do mình trực tiếp bàn giao.
    *   *Tầng 3 (Sales / TVV):* 4% doanh số của `LEADS_3` do mình trực tiếp tư vấn và chốt đơn.
    *   *Tầng 4 (Quản lý Trung tâm):* 2% tổng doanh số khai thác mới của toàn trung tâm.
    *   *Quy tắc:* Tự động chạy tính toán vào cuối tháng, lưu trữ Audit Log phục vụ đối soát.
*   **Công thức phân bổ Chi phí Quảng cáo (Kế toán)**:
    *   `CPL` = Tổng chi phí quảng cáo cả hệ thống / Tổng số `LEADS_2` phát sinh.
    *   `Chi phí phân bổ về cơ sở` = `CPL` * Số `LEADS_2` bàn giao về cơ sở đó.
    *   `CPA` = Tổng chi phí quảng cáo cả hệ thống / Tổng số `LEADS_3` toàn hệ thống.

### 2.2. Module Quản lý Lớp học & Điểm danh (Academic & IoT)
*   **Quản lý Hồ sơ học viên**: Lưu trữ thông tin cá nhân, ảnh chân dung, giấy tờ tuỳ thân. Một tài khoản phụ huynh (`PARENT`) phải quản lý được nhiều con học tập tại trung tâm.
*   **Xếp lớp tự động (Auto-placement)**: Tự động đề xuất xếp lớp dựa trên kết quả kiểm tra năng lực đầu vào và sĩ số/sức chứa phòng học.
*   **Điểm danh tự động (AI Camera & IoT)**:
    *   Tích hợp Camera AI nhận diện khuôn mặt điểm danh tự động khi học viên vào lớp.
    *   Lưu trữ log điểm danh kèm ảnh chụp đối chiếu.
    *   *Fallback:* Cho phép giáo viên điểm danh thủ công qua giao diện.
    *   *Cảnh báo:* Tự động gửi thông báo báo vắng/điểm danh về app phụ huynh qua ZNS Zalo/Email.
*   **Check-in ngoại khóa (Geofencing)**: Kích hoạt định vị khi tham gia dã ngoại, liên kết các thiết bị IoT/vòng đeo tay ở giai đoạn sau.

### 2.3. Module LMS & Đánh giá (LMS & Competency Management)
*   **LMS Cốt lõi**: Quản lý bài học, giao/chấm bài tập online, tổ chức thi online có giám sát.
*   **Hồ sơ Năng lực (Competency Management)**: Theo dõi sự tiến bộ về các kỹ năng STEM/Robotics (ví dụ: tư duy thuật toán, lắp ráp cơ khí, làm việc nhóm) phục vụ hồ sơ năng lực cá nhân khi đi du học.
*   **Học bạ điện tử Web3/NFT (Nghiên cứu Giai đoạn 2)**:
    *   Đồng bộ kết quả từ LMS và điểm danh AI.
    *   Chứng chỉ hoàn thành khóa học dạng NFT động lưu trữ trên IPFS/Arweave.
    *   Tương thích các chuẩn Europass và Open Badges.

### 2.4. Tương tác & Chăm sóc Khách hàng
*   **Sổ liên lạc điện tử nâng cao**: Nhận xét chi tiết của giáo viên sau mỗi buổi học, đính kèm hình ảnh/video hoạt động thực tế.
*   **Khảo sát NPS (Net Promoter Score)**: Khảo sát mức độ hài lòng định kỳ của phụ huynh làm căn cứ đánh giá KPI phục vụ của nhân sự trung tâm.

---

## 3. Danh sách User Stories chi tiết (User Stories Backlog)

### 3.1. Phân hệ CRM tuyển sinh (Quy trình SR.QD.217)
*   **US-01: Ghi nhận nguồn Lead thô (`LEADS_1`)**
    *   *As a* QC Marketing,
    *   *I want to* import danh sách lead tương tác từ quảng cáo Facebook/Google vào hệ thống,
    *   *So that* hệ thống ghi nhận chi phí và số lượng lead thô làm cơ sở tính hiệu quả chiến dịch.
*   **US-02: Tạo và bàn giao Lead đủ điều kiện (`LEADS_2`)**
    *   *As a* Sale Admin,
    *   *I want to* nhập số điện thoại, ghi chú tóm tắt và thực hiện bàn giao lead cho trung tâm phù hợp,
    *   *So that* quản lý trung tâm có thể tiếp nhận và phân công chăm sóc kịp thời.
*   **US-03: Phân công Sales tại Cơ sở**
    *   *As a* Quản lý Trung tâm,
    *   *I want to* nhận thông báo khi có lead mới bàn giao và phân công cho TVV/Sales chăm sóc trong vòng 30 phút,
    *   *So that* lead được liên hệ tư vấn nhanh nhất.
*   **US-04: Đóng học phí và kích hoạt doanh số (`LEADS_3`)**
    *   *As a* Kế toán Trung tâm,
    *   *I want to* nhập thông tin thanh toán khi phụ huynh đóng học phí để chuyển lead sang trạng thái `LEADS_3`,
    *   *So that* hệ thống ghi nhận doanh thu thực tế và tự động kích hoạt tính toán hoa hồng.

### 3.2. Phân hệ Quản lý Học tập & Cổng phụ huynh
*   **US-05: Quản lý nhiều con chung 1 tài khoản phụ huynh**
    *   *As a* Phụ huynh có nhiều con theo học,
    *   *I want to* đăng nhập bằng một tài khoản duy nhất và dễ dàng chuyển đổi qua lại giữa hồ sơ học tập của các con,
    *   *So that* tôi có thể theo dõi thời khóa biểu và kết quả học tập của từng con thuận tiện nhất.
*   **US-06: Điểm danh tự động qua Camera AI**
    *   *As a* Giáo viên / Quản lý trung tâm,
    *   *I want* hệ thống tự động quét nhận diện khuôn mặt học viên khi đến lớp và chuyển đổi trạng thái chuyên cần,
    *   *So that* tôi không phải tốn thời gian điểm danh thủ công đầu giờ.
*   **US-07: Sổ liên lạc điện tử đính kèm Media**
    *   *As a* Giáo viên,
    *   *I want to* viết nhận xét buổi học kèm theo tối đa 3 ảnh/video hoạt động thực hành lắp ráp của học sinh,
    *   *So that* phụ huynh có thể nhìn thấy hoạt động thực tế của con mình.

---

## 4. Tiêu chí Nghiệm thu Nghiệp vụ (UAT Acceptance Criteria)

### UAT-01: SLA Cảnh báo Bàn giao và Tiếp nhận (Alert SLA)
*   **Scenario:** Hệ thống gửi cảnh báo khi vi phạm SLA thời gian xử lý lead.
*   **Given** lead đủ điều kiện `LEADS_2` được tạo trên hệ thống.
*   **When** Sale Admin chưa bàn giao lead cho trung tâm nào sau **4 giờ** làm việc,
*   **Then** hệ thống tự động gửi thông báo cảnh báo (Alert) tới Quản lý Sale Admin.
*   **When** Quản lý Trung tâm nhận bàn giao nhưng chưa phân công cho TVV/Sales sau **30 phút**,
*   **Then** hệ thống tự động gửi thông báo cảnh báo tới Quản lý Trung tâm.
*   **When** TVV/Sales được gán lead nhưng chưa thực hiện cuộc gọi đầu tiên và cập nhật nhật ký sau **2 giờ**,
*   **Then** hệ thống tự động cảnh báo tới Quản lý Trung tâm và ghi nhận vi phạm KPI xử lý lead của Sales đó.

### UAT-02: Đối soát và Phân bổ Chi phí QC (Cost Allocation)
*   **Scenario:** Kế toán hội sở nhập tổng chi phí và phân bổ tự động.
*   **Given** Kế toán hội sở truy cập giao diện Phân bổ Chi phí.
*   **When** Nhập tổng chi phí quảng cáo trong tháng (ví dụ: 100,000,000 VND).
*   **Then** Hệ thống tính toán đơn giá `CPL` = 100,000,000 VND / Tổng số `LEADS_2` toàn hệ thống (ví dụ: 1000 leads) = 100,000 VND/lead.
*   **And** Tự động tạo bảng phân bổ chi phí về từng trung tâm: `Chi phí TT A` = 100,000 VND * Số `LEADS_2` bàn giao về TT A (ví dụ: 200 leads) = 20,000,000 VND.
*   **And** Cho phép xuất bảng đối soát ra file Excel trước ngày 05 hàng tháng.

### UAT-03: Quản lý nhiều con chung 1 User Portal
*   **Scenario:** Phụ huynh chuyển đổi giao diện học viên trên Portal.
*   **Given** Phụ huynh A đăng nhập vào Cổng Portal `hocvien.satarobo.vn`.
*   **When** Hệ thống phát hiện Phụ huynh A có 2 con đăng ký học học viên (`Student` B và `Student` C).
*   **Then** Hiển thị màn hình chọn hồ sơ học sinh ban đầu.
*   **When** Phụ huynh chọn hồ sơ `Student` B.
*   **Then** Toàn bộ giao diện lịch học, nhận xét, học bạ, và SataCoin hiển thị dữ liệu của `Student` B.
*   **And** Hiển thị nút chuyển đổi hồ sơ nhanh trên thanh điều hướng để đổi sang `Student` C mà không cần đăng xuất.
