# Phase R4 — Portal phụ huynh / học sinh

> **Mục tiêu:** `hocvien.satarobo.vn` — site phụ huynh + site từng con, route đẹp KHÔNG lộ studentId. **~2 tuần.**
> **Nền:** A0 + R2 + R3. **Quy trình:** theo `00-quy-trinh-thuc-hien.md`.

---

## 0. Bảng task

| Task ID | Mô tả | Phụ thuộc | Test bắt buộc | Trạng thái |
|---|---|---|---|---|
| R4-01 | Route shell + active profile (signed cookie, không studentId trên URL) | A0,R2 | C1.1–C1.4 | TODO |
| R4-02 | Site phụ huynh (hồ sơ, consent, công nợ) | R4-01 | C2.1–C2.3 | TODO |
| R4-03 | Site con: lịch học · nhận xét · hình ảnh | R4-01,R3 | C3.1–C3.4 | TODO |
| R4-04 | Bài tập / nộp bài / trắc nghiệm (portal) | R4-03,R3 | C4.1–C4.3 | TODO |
| R4-05 | Yêu cầu: báo vắng / học bù / chuyển lớp / bảo lưu | R4-03 | C5.1–C5.3 | TODO |

---

## Chi tiết + test case (P/V)

### R4-01 — Route shell + ownership (CHỐNG lộ dữ liệu con người khác)
| ID | T | Case |
|---|---|---|
| C1.1 | P | PARENT login → portal; staff cố vào portal → redirect admin |
| C1.2 | P | Chuyển site PH ↔ con1 ↔ con2 qua SiteSwitcher (set cookie ký) |
| C1.3 | P | **URL không chứa studentId** ở mọi trang con |
| C1.4 | P | Đổi cookie sang studentId KHÔNG phải con mình → bị chặn (assertOwnsStudent) |

### R4-02 — Site phụ huynh
| ID | T | Case |
|---|---|---|
| C2.1 | P | PH sửa field whitelist của con → lưu + AuditLog (actor=parent) |
| C2.2 | P | Field nhạy cảm → tạo ParentRequest cho staff duyệt (không sửa thẳng) |
| C2.3 | P | Cấp/thu hồi consent CLASS_MEDIA |

### R4-03 — Site con
| ID | T | Case |
|---|---|---|
| C3.1 | P | `/lich-hoc` hiện đúng lịch con đang chọn (buổi dời/lễ/bù có nhãn) |
| C3.2 | P | `/hinh-anh` chỉ media tag con + consent GRANTED |
| C3.3 | P | `/nhan-xet` hiện feedback của con |
| C3.4 | P | Mobile 375px dùng tốt |

### R4-04 / R4-05 (rút gọn)
| ID | T | Case |
|---|---|---|
| C4.1 | P | Làm trắc nghiệm: start→answer→submit; hết giờ auto-submit |
| C4.2 | P | Nộp bài tập (text/file presigned); quá hạn → LATE |
| C4.3 | P | Chỉ thấy bài của con đang chọn |
| C5.1 | P | Gửi yêu cầu (vắng/bù/chuyển/bảo lưu) → PENDING |
| C5.2 | P | Hủy yêu cầu khi còn PENDING |
| C5.3 | P | Staff duyệt → APPROVED/REJECTED + response hiển thị |

---

## EXIT CRITERIA — Phase R4

```
[ ] 5 task DONE · test:phase + test:e2e:r4 xanh
[ ] C1.3 + C1.4 PASS — KHÔNG lộ studentId, KHÔNG xem được con người khác
[ ] C3.2 PASS — media tôn trọng consent
[ ] Toàn bộ trang con mobile 375px OK
```
