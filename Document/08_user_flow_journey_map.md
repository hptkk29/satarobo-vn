# Sata Robo VN — User Flow & Journey Map

Tài liệu này mô tả các hành trình trải nghiệm người dùng (User Journeys) chính của các đối tượng tương tác với hệ thống Sata Robo VN qua các lưu đồ trực quan.

---

## 1. Luồng phụ huynh đăng ký tư vấn (Lead Capture Flow)

Đây là hành trình bắt đầu của một khách hàng từ lúc tiếp cận thương hiệu đến khi thông tin của họ được phân tích và phân phối cho Sales.

```mermaid
graph TD
    PH[Phụ huynh truy cập satarobo.vn] -->|Xem nội dung khoá học| Form[Điền Form Đăng ký tư vấn]
    Form -->|Nhấn Gửi Đăng ký| Validate{Backend Validate Zod}
    
    Validate -->|Lỗi xác thực| Err[Trả về lỗi 400 và thông báo đỏ]
    Validate -->|Đúng định dạng| Honeypot{Check website Field}
    
    Honeypot -->|Có ký tự bot| Silent[Silent Success: 200 giả]
    Honeypot -->|Trống| TimeCheck{Time on page >= 3s}
    
    TimeCheck -->|Dưới 3s bot| Silent
    TimeCheck -->|Hợp lệ| RateLimit{IP <= 5reqs / 60s}
    
    RateLimit -->|Vượt hạn mức| Block[Trả về lỗi 429 & Retry-After]
    RateLimit -->|Hợp lệ| Dedup{Kiểm tra trùng số đt 90 ngày}
    
    Dedup -->|Trùng số điện thoại| SaveDup[Ghi nhận Lead trùng & Gán link Lead gốc]
    Dedup -->|Lead mới hoàn toàn| SaveNew[Tạo Lead mới status NEW]
    
    SaveNew --> AutoAssign[Chạy auto-assign cho Sales theo cơ sở]
    SaveDup --> AutoAssign
    AutoAssign --> Pixel[Gửi tracking Meta CAPI & GA4]
    Pixel --> Mail[Gửi Email thông báo cho cơ sở & Khách hàng]
```

---

## 2. Luồng Phễu tư vấn CRM (CRM Lead Pipeline)

Quy trình Sales chăm sóc và chuyển đổi trạng thái của lead từ khi tiếp nhận đến khi chốt đơn nhập học.

```mermaid
graph TD
    NEW[NEW: Lead mới tạo] -->|Phân phối tự động| ASSIGNED[ASSIGNED: Đã gán cho Sales]
    ASSIGNED -->|Sales thực hiện cuộc gọi| CONTACTED[CONTACTED: Đã kết nối điện thoại]
    
    CONTACTED -->|Cần trao đổi thêm| CONSULTING[CONSULTING: Đang tư vấn chuyên sâu]
    CONTACTED -->|Không nhấc máy| NO_ANSWER[NO_ANSWER: Hẹn gọi lại]
    
    CONSULTING -->|Đồng ý trải nghiệm| TRIAL_SCHEDULED[TRIAL_SCHEDULED: Lên lịch học thử]
    TRIAL_SCHEDULED -->|Đến lớp học thử| TRIAL_ATTENDED[TRIAL_ATTENDED: Đã học thử]
    
    TRIAL_ATTENDED -->|Giáo viên nhận xét học thử| AWAIT[AWAITING_DECISION: Phụ huynh cân nhắc]
    AWAIT -->|Đồng ý nhập học & đóng phí| ENROLLED[ENROLLED: Đăng ký học chính thức]
    
    %% Nhánh kết thúc khác
    CONSULTING -->|Không phù hợp| LOST[LOST: Thất bại]
    CONSULTING -->|Chăm sóc lâu dài| NURTURING[NURTURING: Nuôi dưỡng]
```

---

## 3. Luồng Đăng nhập & Xác thực Phân quyền (Auth & RBAC Flow)

```mermaid
graph TD
    Login[Truy cập /login] -->|Nhập email + password| Authjs[Auth.js Credentials Provider]
    Authjs -->|Truy vấn DB lấy hash| Bcrypt{Bcrypt Verify Password}
    
    Bcrypt -->|Sai mật khẩu| Failed[Báo lỗi sai tài khoản / mật khẩu]
    Bcrypt -->|Khớp mật khẩu| CheckStatus{Tài khoản Active?}
    
    CheckStatus -->|Disabled| Inactive[Báo lỗi tài khoản bị khoá]
    CheckStatus -->|Active| LoadPermissions[Đọc Roles + Grants từ DB]
    
    LoadPermissions --> GenerateJWT[Tạo mã token JWT chứa Role/Grants]
    GenerateJWT --> Cookie[Lưu HTTP-only Cookie bảo mật]
    Cookie --> Redirect{Phân hướng dựa trên Role}
    
    Redirect -->|PARENT| Portal[/portal - Cổng phụ huynh]
    Redirect -->|Nhân viên khác| Admin[/admin/dashboard]
```

---

## 4. Luồng Vòng đời Lớp học (Class Lifecycle Flow)

Quy trình quản lý từ lúc lập kế hoạch mở lớp, tuyển sinh đến khi hoàn thành hoặc huỷ lớp.

```mermaid
graph TD
    PLANNED[PLANNED: Lên kế hoạch lớp học] -->|Mở tuyển sinh| RECRUITING[RECRUITING: Đang tuyển sinh]
    RECRUITING -->|Gán đủ học sinh & giáo viên| PENDING[PENDING_APPROVAL: Chờ duyệt]
    PENDING -->|Manager duyệt| ACTIVE[ACTIVE: Lớp học đang hoạt động]
    
    ACTIVE -->|Kết thúc toàn bộ buổi học| COMPLETED[COMPLETED: Lớp đã hoàn thành]
    RECRUITING -->|Không đủ điều kiện mở lớp| CANCELLED[CANCELLED: Lớp bị huỷ]
    ACTIVE -->|Sự cố phát sinh| CANCELLED
```

### Luồng nghiệp vụ trong mỗi buổi học (Class Session Workflow)
Mỗi buổi học diễn ra đều phải hoàn thành checklist vận hành nghiêm ngặt của giáo viên và giáo vụ:
1.  **Chuẩn bị**: Giáo vụ chuẩn bị vệ sinh phòng học, dụng cụ, kiểm kê các bộ kit robot (`ZMRoboKit`).
2.  **Khởi động**: Giáo viên điểm danh học viên (`markAttendance`).
3.  **Giảng dạy**: Thực hiện dạy theo bài học thuộc giáo trình (`Curriculum`).
4.  **Đánh giá & Nhận xét**: Giáo viên viết đánh giá nhận xét buổi học cho từng học viên.
5.  **Thu hoạch**: Chụp ảnh hoạt động lớp, giao bài tập về nhà và nộp báo cáo kết thúc buổi học.

---

## 5. Luồng Điểm danh & Học bù (Attendance & Makeup Flow)

```mermaid
graph TD
    GV[Giáo viên mở điểm danh] --> CheckAttendance{Học sinh vắng?}
    CheckAttendance -->|Có mặt| SetPresent[Ghi nhận PRESENT]
    CheckAttendance -->|Vắng mặt| TypeAbsence{Có phép hay không phép?}
    
    TypeAbsence -->|Có phép / Không phép| CreateNeed[Tạo bản ghi MakeupNeed trạng thái PENDING]
    CreateNeed --> Notify[Gửi tin nhắn ZNS/Email thông báo cho phụ huynh]
    
    %% Sắp xếp học bù
    Notify --> CS[Giáo vụ liên hệ xếp lịch bù]
    CS --> Schedule[Đăng ký buổi học bù status SCHEDULED]
    Schedule --> AttendMakeup{HS đi học bù?}
    
    AttendMakeup -->|Có mặt| CloseNeed[Cập nhật MakeupNeed thành COMPLETED]
    AttendMakeup -->|Vắng| CreateNeed
```

---

## 6. Luồng Chấm công Nhân sự bằng QR code (QR Check-in Flow)

Quy trình nhân viên thực hiện chấm công tại cơ sở thông qua QR động để tránh gian lận.

```mermaid
graph TD
    NV[Nhân viên mở điện thoại quét QR] --> ReadQR[Đọc mã QR động từ Tivi trung tâm]
    ReadQR --> GPS{Lấy toạ độ GPS của điện thoại}
    
    GPS -->|Không lấy được toạ độ| RejectGPS[Từ chối: Yêu cầu mở định vị]
    GPS -->|Có toạ độ| SendCheckin[Gửi thông tin lên Server]
    
    SendCheckin --> CheckTime{Giải mã QR Token khớp HMAC window}
    CheckTime -->|QR hết hạn| RejectTime[Từ chối: Mã QR đã hết hiệu lực]
    CheckTime -->|QR khớp| CheckGeofence{Toạ độ nằm trong Geofence Center}
    
    CheckGeofence -->|Nằm ngoài bán kính| SaveOutGeofence[Ghi nhận Checkin: Cảnh báo ngoài cơ sở]
    CheckGeofence -->|Hợp lệ| SaveInGeofence[Ghi nhận Checkin: Công chuẩn]
```
