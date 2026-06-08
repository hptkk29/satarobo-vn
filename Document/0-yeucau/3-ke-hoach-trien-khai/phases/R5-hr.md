# Phase R5 — HR nhân viên (chấm công)

> **Mục tiêu:** chấm công nhân viên QR + geofence + duyệt công. **~1.5 tuần.**
> ⚠️ **Geofence CHỈ áp dụng cho NHÂN VIÊN — KHÔNG cho học sinh** (privacy chốt cứng).
> **Nền:** A0 (+ EmployeeOrgAssignment A0-08). **Quy trình:** theo `00-quy-trinh-thuc-hien.md`.

---

## 0. Bảng task

| Task ID | Mô tả | Phụ thuộc | Test bắt buộc | Trạng thái |
|---|---|---|---|---|
| R5-01 | Employee profile + shift registration | A0-08 | C1.1–C1.2 | TODO |
| R5-02 | QR token động 30s + grace 5–10s | R5-01 | C2.1–C2.3 | TODO |
| R5-03 | Check-in/out + geofence (GPS ≤ allowedRadius) | R5-02 | C3.1–C3.4 | TODO |
| R5-04 | Cảnh báo thiếu giờ + duyệt công (TimesheetAdjustment) | R5-03 | C4.1–C4.3 | TODO |

---

## Chi tiết + test case (P/V)

### R5-02 — QR token
| ID | T | Case |
|---|---|---|
| C2.1 | V | Token đổi mỗi 30s; token quá hạn → từ chối |
| C2.2 | V | Grace period 5–10s vẫn chấp nhận |
| C2.3 | P | Màn hình cơ sở hiển thị QR xoay vòng |

### R5-03 — Check-in + geofence
| ID | T | Case |
|---|---|---|
| C3.1 | V | GPS trong bán kính `allowedRadiusMeters` của Center → withinGeofence=true |
| C3.2 | V | Ngoài bán kính → withinGeofence=false (ghi nhận, không chặn cứng — quản lý xét) |
| C3.3 | P | Check-in/out ghi EmployeeCheckin (distance, qrToken) |
| C3.4 | P | **Geofence KHÔNG áp dụng cho bất kỳ luồng học sinh nào** (xác nhận không có endpoint định vị HS) |

### R5-01 / R5-04 (rút gọn)
| ID | T | Case |
|---|---|---|
| C1.1 | P | NV đăng ký ca (CA_SANG/CHIEU/TOI) |
| C1.2 | V | scopedDb: chấm công theo center |
| C4.1 | V | Tính thiếu giờ theo ca |
| C4.2 | P | NV gửi TimesheetAdjustmentRequest → quản lý duyệt → TimesheetEditLog |
| C4.3 | P | Export shift Excel |

---

## EXIT CRITERIA — Phase R5

```
[ ] 4 task DONE · test:phase + test:e2e:r5 xanh
[ ] C3.4 PASS — xác nhận geofence chỉ cho nhân viên
[ ] QR token an toàn (C2.1) · duyệt công có log
```

---

## 🎯 HOÀN TẤT CORE (sau R5) — Definition of Done toàn dự án (Doc 15 §10)

Đối chiếu 18 điểm DoD core trong Doc 15 §10. Sau khi cả 6 phase (A0→R5) đóng:
```
[ ] HO/CS1/CS2 = OrgUnit, scope đúng
[ ] Login chung redirect đúng
[ ] Messenger Page HO tạo L1 · L1→L2→L3 đúng SLA
[ ] Chốt L3 = transaction Student/Parent/Enrollment/Invoice/Payment
[ ] Activation không mật khẩu mặc định
[ ] Marketing dashboard spend/L1-2-3/CPL/CPA/ROAS · cost allocation · commission 4 tầng
[ ] LMS offline đủ chuỗi · Portal site con không lộ studentId · PH chỉ xem con mình
[ ] Không giấy tờ tùy thân, không AI camera/sinh trắc/định vị HS
[ ] Audit phủ nghiệp vụ nhạy cảm · CS1⛔CS2 · SUPER_ADMIN/HO theo quyền
```
→ Backlog sau core: Zalo OA/ZNS · payment gateway · MISA · Flutter app · (AI/marketplace KHÔNG trong scope).
