# Sata Robo VN — Data Flow Diagram Spec

Tài liệu này mô tả chi tiết đường đi của dữ liệu (Data Flows) giữa các phân hệ ứng dụng, cơ sở dữ liệu và các dịch vụ tích hợp bên thứ ba.

---

## 1. Dòng dữ liệu Thu thập Lead (Lead Ingestion Data Path)

Dữ liệu lead từ nhiều nguồn khác nhau được chuẩn hoá trước khi ghi nhận vào cơ sở dữ liệu và kích hoạt các cổng theo dõi.

```mermaid
graph LR
    %% Nguồn Lead
    WebForm[Website Form] -->|JSON| APIleads[/api/leads]
    FBWebhook[Facebook Webhook] -->|JSON Payload| APIwebhooks[/api/public/webhook/*]
    GGForm[Google Form Webhook] -->|JSON Payload| APIwebhooks
    Manual[Nhân viên tạo tay] -->|Server Action| CRM[CRM Module]

    %% Xử lý & Ghi nhận
    APIleads -->|Validation Zod| Sanitizer[Lọc dữ liệu & Bẫy Bot]
    APIwebhooks -->|Validation Zod| Sanitizer
    CRM -->|Validation Zod| Dedup[Đối soát Trùng điện thoại 90 ngày]
    
    Sanitizer --> Dedup
    Dedup -->|Ghi nhận| DB[(Database Lead Record)]
    
    %% Kích hoạt phụ
    DB -->|Trigger| AutoAssign[Phân phối Sales]
    DB -->|Trigger| MetaCAPI[Gửi Meta CAPI & GA4 Server Event]
    DB -->|Trigger| EmailNotification[Email báo cơ sở mới tiếp nhận lead]
```

---

## 2. Dòng dữ liệu Điểm danh & Thông báo (Attendance & Notification Flow)

Đường đi của dữ liệu khi giáo viên đánh giá chuyên cần của lớp học thực tế và đồng bộ thông báo cho phụ huynh.

```mermaid
graph TD
    Teacher[Giáo viên đánh chuyên cần] -->|markAttendance Server Action| AttendanceRecord[Lưu bản ghi Attendance: PRESENT/ABSENT]
    AttendanceRecord --> CheckAbsent{Học sinh vắng?}
    
    CheckAbsent -->|NO| End[Kết thúc]
    CheckAbsent -->|YES| CreateMakeup[Tạo bản ghi MakeupNeed status PENDING]
    
    CreateMakeup --> CreateNotify[Tạo thông báo trong StaffNotification & Notification]
    CreateNotify --> SendZalo{Zalo OA ID & API Key sẵn sàng?}
    
    SendZalo -->|YES| ZNS[Gửi tin nhắn Zalo ZNS báo nghỉ]
    SendZalo -->|NO / Thất bại| Email[Gửi email báo vắng thông qua EmailQueue]
    
    ZNS --> LogZalo[Lưu nhật ký ZaloMessageLog]
    Email --> LogEmail[Lưu nhật ký EmailLog]
    
    LogZalo --> UpdateNotifiedAt[Cập nhật timestamp notifiedAt ngăn spam gửi trùng]
    LogEmail --> UpdateNotifiedAt
```

---

## 3. Dòng dữ liệu Đơn hàng, Thanh toán & Kích hoạt học tập (Order to Enrollment Path)

Quy trình quản lý dòng tài chính và đồng bộ trực tiếp với trạng thái học tập của học viên.

```mermaid
graph TD
    CreateOrder[Tạo đơn hàng DRAFT] --> AddItems[Thêm OrderItem: liên kết Gói Combo/Học cụ]
    AddItems --> ApplyVoucher[Áp dụng Voucher: Tính số tiền giảm]
    
    ApplyVoucher --> ConfirmedOrder[Xác nhận đơn hàng: PENDING_PAYMENT]
    ConfirmedOrder --> CashOrBank[Phụ huynh đóng tiền mặt hoặc Chuyển khoản]
    
    CashOrBank --> ConfirmAction[confirmOrderPayment Server Action]
    ConfirmAction --> SavePayment[Ghi nhận đơn hàng CONFIRMED]
    
    SavePayment --> CreateEnrollment[Tạo đăng ký khoá học Enrollment status CONFIRMED]
    SavePayment --> Inventory[Tự động tạo StockMovement xuất kho học cụ nếu có]
    SavePayment --> VoucherRedeem[Tạo bản ghi VoucherRedemption đánh dấu sử dụng voucher]
    SavePayment --> Audit[Ghi nhật ký thay đổi OrderStatusHistory]
```

---

## 4. Quy trình xử lý Email bất đồng bộ (Email Queue Processing Pipeline)

Để đảm bảo hiệu năng và không làm nghẽn các yêu cầu của người dùng, việc gửi email được tách riêng thành hàng đợi bất đồng bộ.

```mermaid
graph TD
    Event[Sự kiện hệ thống phát sinh] -->|Tạo bản ghi| Queue[Bảng EmailQueue: status PENDING]
    
    %% Cron Worker
    Cron[Cron Job chạy mỗi 5 phút] -->|Trích xuất| ReadQueue[Đọc danh sách email PENDING]
    ReadQueue --> Loop[Lặp từng email]
    
    Loop --> Render[Render EmailTemplate dựa trên TemplateKey và Variables]
    Render --> SendAPI[Gọi Resend API gửi email]
    SendAPI --> CheckAPI{Gửi thành công?}
    
    CheckAPI -->|YES| SetSent[Cập nhật EmailQueue status SENT]
    CheckAPI -->|NO| Retry{attempts < maxAttempts?}
    
    Retry -->|YES| Increment[Tăng số lần thử: attempts + 1]
    Retry -->|NO| SetFailed[Cập nhật EmailQueue status FAILED]
    
    SetSent --> Log[Lưu nhật ký EmailLog]
    SetFailed --> Log
```

---

## 5. Dòng dữ liệu Hoạt động Audit Log (Audit Trail Pipeline)

Nhật ký ghi nhận hành vi thay đổi dữ liệu đảm bảo tính bất biến (Immutable) để phục vụ kiểm toán nội bộ.

```
[ Thực hiện Server Action thay đổi dữ liệu ]
                     │
                     ▼
       [ Đọc bản ghi hiện tại trong DB ]
                     │
                     ▼
         [ Thực thi câu lệnh UPDATE ]
                     │
                     ▼
[ Tính toán sự khác biệt (Diff: oldValues vs newValues) ]
                     │
                     ▼
[ Ghi đè thông tin changedByName snapshot từ Session ]
                     │
                     ▼
  [ Tạo bản ghi Audit Log chuyên biệt (ví dụ: LeadAuditLog) ]
                     │
                     ▼
  [ Dữ liệu được lưu trữ dạng APPEND-ONLY, cấm sửa/xoá ]
```

---

## 6. Luồng dữ liệu Tải lên Tệp tin (R2 Storage Upload Path)

```
[ Trình duyệt Client ] ────── 1. Yêu cầu Upload URL ─────► [ Serverless Endpoint /api/admin/upload-url ]
                                                                                │
                                                                       2. Tạo Presigned URL
                                                                                │
[ Trình duyệt Client ] ◄─── 3. Trả về Upload URL & CDN URL ─────────────────────┘
         │
  4. Upload file nhị phân trực tiếp
         │
         ▼
[ Cloudflare R2 Storage ]
         │
  5. Upload thành công
         │
         ▼
[ Trình duyệt Client ] ────── 6. Gửi CDN URL lưu vào thực thể ──► [ Serverless Action ] ──► [ Lưu DB ]
```
---

## 7. Dòng dữ liệu Đồng bộ MISA AMIS (MISA Integration - Skeleton)

Khi đơn hàng được xác nhận thanh toán thành công, hệ thống thực hiện đồng bộ hoá dữ liệu sang hệ thống kế toán doanh nghiệp MISA:

```mermaid
graph TD
    OrderSuccess[Đơn hàng xác nhận CONFIRMED] --> CheckSyncConfig{Bật đồng bộ MISA?}
    CheckSyncConfig -->|NO| End[Kết thúc]
    CheckSyncConfig -->|YES| CreatePayload[Đọc thông tin đơn, tạo JSON hoá đơn chuẩn MISA]
    
    CreatePayload --> PostMISA[Gọi REST API của MISA AMIS]
    PostMISA --> CheckMISA{Đồng bộ thành công?}
    
    CheckMISA -->|YES| LogSuccess[Ghi nhận IntegrationLog status SUCCESS]
    CheckMISA -->|NO| LogError[Ghi nhận IntegrationLog status FAILED + Lưu chi tiết lỗi]
```
