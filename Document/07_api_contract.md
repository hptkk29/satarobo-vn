# Sata Robo VN — API Contract Specification

Tài liệu này định nghĩa chi tiết hợp đồng API (REST endpoints) và các hàm hành động phía máy chủ (Server Actions) được sử dụng để tương tác dữ liệu trong hệ thống Sata Robo VN.

---

## 1. Giao diện Lập trình Công cộng (Public REST APIs - No Auth)

### 1.1. Gửi Đăng ký Tư vấn (POST `/api/leads`)
*   **Mục đích**: Nhận thông tin đăng ký tư vấn khoá học điền từ biểu mẫu trang chủ.
*   **Rate Limit**: Tối đa 5 yêu cầu / 60 giây / 1 IP. Trả về mã lỗi `429 Too Many Requests` và header `Retry-After` nếu vượt quá tần suất.
*   **Payload yêu cầu (Request Body)**:
    ```json
    {
      "parentName": "Nguyễn Văn A",
      "phone": "0905123456",
      "email": "parent.a@example.com",
      "childName": "Nguyễn Gia Bảo",
      "childAge": 8,
      "centerId": "cluy123450000xx",
      "courseId": "laptrinhrobot",
      "source": "Landing Page Trang Chủ",
      "utmSource": "facebook",
      "utmMedium": "cpc",
      "utmCampaign": "summer_camp_2026",
      "fbclid": "fb_click_id_xyz",
      "gclid": "google_click_id_123",
      "fbp": "fbp_cookie_val",
      "fbc": "fbc_cookie_val",
      "landingPage": "https://satarobo.vn/khoa-hoc/laptrinhrobot",
      "referrer": "https://google.com",
      "eventId": "event-1717586500",
      "consentMarketing": true,
      "note": "Muốn đăng ký học thử vào cuối tuần.",
      "timeOnPage": 12,
      "website": ""
    }
    ```
    *   *Trường website:* Là bẫy honeypot, bắt buộc phải để trống. Nếu có giá trị, hệ thống lập tức phản hồi mã 200 thành công giả nhưng không lưu lead thực tế.
    *   *Trường timeOnPage:* Phải lớn hơn hoặc bằng 3 (giây). Nếu dưới 3, hệ thống coi là bot tự động điền form và từ chối xử lý.
*   **Phản hồi thành công (Response 200 OK)**:
    ```json
    {
      "ok": true,
      "leadId": "cld234560001yy",
      "duplicate": false
    }
    ```
    *   *duplicate:* Trả về `true` kèm theo ID của lead gốc nếu số điện thoại này đã được gửi trong vòng 90 ngày gần nhất.
*   **Phản hồi lỗi xác thực (Response 400 Bad Request)**:
    ```json
    {
      "ok": false,
      "error": "Dữ liệu không hợp lệ",
      "issues": [
        {
          "code": "invalid_string",
          "path": ["phone"],
          "message": "Số điện thoại không đúng định dạng Việt Nam"
        }
      ]
    }
    ```

### 1.2. Nhận Webhook từ Facebook Leads (POST `/api/public/webhook/facebook`)
*   **Mục đích**: Tự động đồng bộ leads từ biểu mẫu quảng cáo Facebook Lead Ads.
*   **Bảo mật**: Xác thực chữ ký `x-hub-signature-256` gửi trong header bằng App Secret.

### 1.3. Nhận Webhook từ Google Forms (POST `/api/public/webhook/google-form`)
*   **Mục đích**: Nhập tự động thông tin lead đăng ký từ Google Sheet / Google Forms.
*   **Bảo mật**: Yêu cầu truyền mã secret token qua query parameter hoặc header:
    *   `GET /api/public/webhook/google-form?secret=WEBHOOK_SECRET_KEY`

---

## 2. Giao diện Lập trình Quản trị (Admin REST APIs - Auth Required)

Các API quản trị được bảo vệ chặt chẽ thông qua xác thực cookie session quản lý bởi Auth.js v5. Chỉ các vai trò được phân quyền tương ứng mới được phép gọi thành công.

### 2.1. Lấy URL tải tệp tin lên R2 (POST `/api/admin/upload-url`)
*   **Mục đích**: Lấy đường dẫn ký sẵn (Presigned URL) để client tải file trực tiếp lên Cloudflare R2.
*   **Quyền truy cập**: Nhân viên các phân hệ (SUPER_ADMIN, CENTER_MANAGER, HR, TEACHER, MARKETING).
*   **Payload yêu cầu**:
    ```json
    {
      "filename": "hocvien-avt.png",
      "fileType": "image/png",
      "category": "avatar"
    }
    ```
*   **Phản hồi thành công (Response 200 OK)**:
    ```json
    {
      "ok": true,
      "uploadUrl": "https://satarobo-uploads.r2.cloudflarestorage.com/avatar/hocvien-avt.png?X-Amz-Algorithm=...",
      "fileUrl": "https://cdn.satarobo.vn/avatar/hocvien-avt.png"
    }
    ```

### 2.2. Xoá tệp tin khỏi R2 (DELETE `/api/admin/upload-delete`)
*   **Payload yêu cầu**: `{ "fileUrl": "https://cdn.satarobo.vn/avatar/hocvien-avt.png" }`
*   **Phản hồi thành công**: `{ "ok": true }`

### 2.3. Điểm danh Chấm công nhân viên bằng QR (POST `/api/admin/cham-cong/scan`)
*   **Mục đích**: Xác thực Check-in/Check-out của giáo viên/nhân viên tại cơ sở.
*   **Quyền truy cập**: Bất kỳ tài khoản nhân viên nào đang hoạt động.
*   **Payload yêu cầu**:
    ```json
    {
      "qrToken": "dynamic_hmac_token_value_rotated_every_30s",
      "latitude": 16.0678,
      "longitude": 108.2201,
      "type": "CHECKIN"
    }
    ```
    *   *qrToken:* Token chứa mã HMAC có chứa timestamp, được màn hình tivi/quầy lễ tân của trung tâm xoay liên tục mỗi 30 giây để chống gian lận gửi ảnh chụp QR cũ.
    *   *latitude/longitude:* Toạ độ GPS của điện thoại nhân viên, hệ thống đối soát với Geofence Polygon của Center để kiểm tra xem nhân viên có đang đứng trong bán kính cho phép không (`withinGeofence`).

---

## 3. Giao diện Lập trình Cổng Phụ huynh (Portal REST APIs - Auth Required)

Các API này yêu cầu cookie session có vai trò `PARENT`.

### 3.1. Xuất học bạ PDF (GET `/api/portal/transcript`)
*   **Mục đích**: Tải xuống file PDF học bạ chính thức của con em mình.
*   **Tham số**: `?studentId=cluy_student_id`
*   **Phản hồi**: Trả về luồng nhị phân file PDF (`application/pdf`) trực tiếp để trình duyệt tải về.

---

## 4. Các API Tác vụ nền (Cron Jobs REST APIs)

Được cấu hình trong Vercel Cron. Để ngăn chặn các cuộc gọi từ bên ngoài, Next.js kiểm tra header `Authorization` chứa chuỗi khóa bí mật `CRON_SECRET` được Vercel tự động điền vào:
*   Header gửi đi: `Authorization: Bearer CRON_SECRET`

### Danh sách URL endpoint:
1.  `GET /api/cron/class-reminder`
2.  `GET /api/cron/renewal-reminder`
3.  `GET /api/cron/email-queue`
4.  `GET /api/cron/debt-reminder`

---

## 5. React Server Actions (Hành động trực tiếp từ UI)

Hệ thống Sata Robo VN sử dụng Server Actions làm phương thức thay đổi dữ liệu chính thay vì các endpoint REST API truyền thống. Server Actions được gọi trực tiếp giống như các hàm Javascript thông thường ở client nhưng chạy an toàn ở server.

### 5.1. Phân hệ CRM & Leads
*   `createLead(data)`: Tạo lead mới thủ công từ trang quản trị.
*   `updateLead(id, data)`: Sửa đổi thông tin lead, cập nhật trạng thái chăm sóc.
*   `assignLead(leadId, userId)`: Gán quyền chăm sóc lead cho Sales cụ thể.
*   `convertLeadToStudent(leadId, centerId, classId)`: Chuyển đổi trạng thái lead thành học viên chính thức khi đóng học phí.

### 5.2. Phân hệ Học tập & Lớp học
*   `createClass(data)`: Lập kế hoạch mở lớp mới (Planned).
*   `submitClassForApproval(classId)`: Giáo vụ gửi yêu cầu kiểm tra và duyệt lớp học.
*   `approveClass(classId)`: Manager phê duyệt lớp học chuyển sang hoạt động (Active).
*   `markAttendance(classSessionId, attendanceList)`: Giáo viên thực hiện chấm chuyên cần cho buổi dạy.
*   `submitFeedbackAndAssessment(classSessionId, studentId, feedback)`: Giáo viên viết nhận xét buổi học và đánh giá kỹ năng học sinh.

### 5.3. Phân hệ Hoá đơn & Kho
*   `createOrder(data)`: Tạo đơn đặt hàng mới.
*   `confirmOrderPayment(orderId, paymentDetails)`: Kế toán duyệt thanh toán hoá đơn khi nhận được tiền.
*   `adjustStock(inventoryItemId, quantity, reason)`: Thủ kho thực hiện xuất nhập kho học cụ.
