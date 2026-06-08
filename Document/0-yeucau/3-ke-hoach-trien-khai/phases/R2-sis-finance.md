# Phase R2 — SIS + Finance conversion

> **Mục tiêu:** chốt lead thành học viên trong 1 transaction + kích hoạt tài khoản phụ huynh + invoice/công nợ. **~2.5 tuần.**
> **Nền:** A0 + R1. **Trọng tâm: an toàn transaction tiền/học viên** (Doc 15 §4.9).
> **Quy trình:** theo `00-quy-trinh-thuc-hien.md`.

---

## 0. Bảng task

| Task ID | Mô tả | Phụ thuộc | Test bắt buộc | Trạng thái |
|---|---|---|---|---|
| R2-01 | Dọn model Parent/Student/Relation (1 PH nhiều con) | A0 | C1.1–C1.3 | TODO |
| R2-02 | `convertLeadToEnrollment` — 1 TRANSACTION | R1, R2-01 | C2.1–C2.6 | TODO |
| R2-03 | Invoice/Payment auto-create (code INV-CS-YYYY-####) | R2-02 | C3.1–C3.4 | TODO |
| R2-04 | Parent activation qua Resend (không mật khẩu mặc định) | R2-01 | C4.1–C4.4 | TODO |
| R2-05 | Duplicate phone UX | R2-02 | C5.1–C5.2 | TODO |
| R2-06 | Công nợ + nhắc nợ (cron) | R2-03 | C6.1–C6.3 | TODO |

---

## Chi tiết + test case (P=Playwright, V=Vitest)

### R2-02 — Convert lead (transaction) ⚠️ TRỌNG TÂM
Transaction tạo: Lead→ENROLLED + Parent + Student + Relation + Enrollment + Invoice + Payment(nếu có) + AuditLog + DomainEvent `lead.converted`.
| ID | T | Case |
|---|---|---|
| C2.1 | P | Convert đầy đủ → tất cả bản ghi được tạo, lead = ENROLLED |
| C2.2 | V | **1 bước lỗi → ROLLBACK toàn bộ** (không có student/invoice mồ côi) |
| C2.3 | V | Event `lead.converted` chỉ phát SAU commit |
| C2.4 | P | Convert ghi AuditLog (actor, convertedAt/By) |
| C2.5 | V | Notification/activation đi qua EVENT, không nằm trong transaction |
| C2.6 | P | scopedDb: lead CS1 convert tạo student thuộc CS1 |

### R2-03 — Invoice/Payment
| ID | T | Case |
|---|---|---|
| C3.1 | V | InvoiceCode đúng định dạng `INV-CS1-2026-0001` (qua Counter, không race) |
| C3.2 | V | Invoice gắn đúng orgUnit/center |
| C3.3 | P | Ghi nhận thanh toán thủ công → kế toán xác nhận → Payment CONFIRMED |
| C3.4 | V | confirm payment idempotent (gọi 2 lần → 1 kết quả) |

### R2-04 — Parent activation
| ID | T | Case |
|---|---|---|
| C4.1 | V | Account tạo ở trạng thái PENDING_ACTIVATION, KHÔNG mật khẩu mặc định |
| C4.2 | P | Gửi email activation (Resend) qua modules/integration |
| C4.3 | P | Parent đặt mật khẩu lần đầu → ACTIVE → login portal được |
| C4.4 | V | OTP provider abstraction: đổi EMAIL→SMS không sửa business logic |

### R2-01 / R2-05 / R2-06 (rút gọn)
| ID | T | Case |
|---|---|---|
| C1.1 | V | 1 PH có ≥2 con, đọc đúng danh sách con |
| C1.2 | P | scopedDb áp dụng cho Student theo center |
| C1.3 | V | Relation parent-child unique, không trùng |
| C5.1 | P | Convert lead trùng phone → cảnh báo, hiển thị lead/student cũ |
| C5.2 | V | Dedup logic 90 ngày |
| C6.1 | V | Tính công nợ = invoice - paid |
| C6.2 | P | Cron nhắc nợ gửi đúng PH quá hạn |
| C6.3 | P | Nhắc nợ đi qua Notifier (email/Zalo nếu bật) |

---

## EXIT CRITERIA — Phase R2

```
[ ] 6 task DONE · test:phase + test:e2e:r2 xanh
[ ] C2.2 (rollback) PASS — KHÔNG có dữ liệu mồ côi trong mọi tình huống lỗi
[ ] Không tài khoản nào dùng mật khẩu mặc định
[ ] Convert/payment có idempotency + AuditLog
[ ] E2E flow tiền end-to-end: lead → convert → invoice → payment → activation
```
