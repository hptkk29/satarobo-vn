# README bàn giao — Thu học phí linh hoạt cho phụ huynh nhiều con

Bộ tài liệu này đi hết chuỗi BA → PRD → Pre-mortem → User Stories → Test Scenarios → shipping-artifacts. Chép cả thư mục vào repo tại `docs/thanh-toan-linh-hoat/`.

## 1. Đọc theo thứ tự

| File | Dùng để |
|---|---|
| `01-BA-thanh-toan-linh-hoat.md` | Luật, bất biến, mô hình dữ liệu, ví dụ số — **nguồn sự thật nghiệp vụ** |
| `02-PRD-thanh-toan-linh-hoat.md` | Mục tiêu, KR, phạm vi V1, kế hoạch đợt |
| `03-PreMortem-thanh-toan-linh-hoat.md` | Rủi ro chặn go-live và biện pháp đã đưa vào story |
| `04-UserStories-thanh-toan-linh-hoat.md` | 26 story, mỗi story một phiên Claude Code |
| `05-TestScenarios-thanh-toan-linh-hoat.md` | 50 kịch bản, trỏ về AC |
| `documentation/` | Trạng thái thiết kế: architecture, flows, permissions, variables, cron, automation, tests |

## 2. Luật cho mọi phiên Claude Code

1. **Một phiên = một story.** Không làm lấn sang story khác; phát hiện việc ngoài phạm vi → ghi ticket, không sửa.
2. **US-02 trước mọi Server Action ghi tiền.** Không merge đường ghi nào khi bộ kiểm bất biến chưa tồn tại.
3. **Không ghi tiền ngoài `lib/finance/ledger/ghiNghiepVuTien`.** Không cộng `amount` ngoài `lib/finance/debt.ts`.
4. **Migration:** SQL tay, `migrate deploy`; **CẤM `prisma migrate dev`**; bảng mới có `orgUnitId` + `ENABLE ROW LEVEL SECURITY`; đo `migrate diff` = 0 dòng trên DB nháp.
5. **Merge `origin/main` vào nhánh và đo lại phân kỳ migration** trước khi apply bất cứ thứ gì lên DB dev/test.
6. **Không tạo cờ trong env.** Công tắc là `SystemSetting billing.flexV1Enabled`, đọc ở `lib/finance/feature.ts`, có test chứng minh đổi hành vi.
7. **Test không tự cộng nhẩm.** Dùng hằng `KY_VONG_*` của fixture `GD-MAU`.
8. **Cổng mỗi phiên:** `tsc` sạch · lint 0 lỗi · toàn bộ test xanh · AC của story có test trỏ tới · chạy lăng kính phản biện (tự tìm lỗi sau khi cổng đã xanh) và ghi kết quả vào mô tả commit.
9. **Tên thật:** mọi tên bảng/cột trong tài liệu là tên thiết kế; dùng bảng ánh xạ ở `gate-0.md` (US-01).

## 3. Thứ tự phiên

| # | Story | Đợt | Ghi chú |
|---|---|---|---|
| 1 | US-01 GATE 0 | 0 | Chỉ đọc; nếu G0-4 = KHÔNG ĐỦ TIN, báo lại trước phiên 14 |
| 2 | US-02 Fixture + bất biến | 0 | |
| 3 | US-03 Migration nền | 1 | Migration A và B là 2 commit |
| 4 | US-04 Đường ghi duy nhất | 1 | |
| 5 | US-05 Công nợ + công tắc | 1 | **Cổng Đợt 1:** apply lên DB test, RLS đúng, cờ TẮT |
| 6 | US-06 Chính sách | 2 | |
| 7 | US-07 Màn hồ sơ gia đình (đọc) | 2 | |
| 8 | US-08 Tạo đơn nhiều con | 2 | |
| 9 | US-09 Kế hoạch đợt | 2 | |
| 10 | US-10 Kỳ thu | 2 | Xác nhận A2 (VA SePay) ngay đầu phiên |
| 11 | US-11 Webhook | 2 | |
| 12 | US-12 Chia ví | 2 | |
| 13 | US-13 Tiền mặt | 2 | **Cổng Đợt 2:** chạy tình huống D, E trên test |
| 14 | US-14 Dừng học — xem trước | 3 | Cần G0-4 xanh |
| 15 | US-16 Ưu đãi liên đới | 3 | Làm trước US-15 |
| 16 | US-17 Chuyển tiền giữa các con | 3 | Làm trước US-15 |
| 17 | US-15 Dừng học — ghi | 3 | |
| 18 | US-18 Bảo lưu | 3 | |
| 19 | US-19 Thêm con | 3 | |
| 20 | US-20 Đổi khoá / cơ sở | 3 | **Cổng Đợt 3:** chạy tình huống A, B, C trên test |
| 21 | US-21 Hoàn tiền | 4 | |
| 22 | US-22 Miễn giảm | 4 | |
| 23 | US-23 Quá hạn | 4 | |
| 24 | US-24 Kiểm cân đêm | 4 | |
| 25 | US-25 Chuyển sổ B | 4 | Dry-run trên test trước |
| 26 | US-26 Báo cáo nghiệp vụ | 4 | **Cổng Đợt 4:** 7 đêm kiểm cân sạch + TS-50 với sale thật → pilot |

## 4. Việc phải chốt ngoài code (và hạn)

| Việc | Người | Phải xong trước |
|---|---|---|
| Q1 — CS1/CS2 có phải 2 đơn vị kế toán | Kế toán | Phiên 3 (schema `accountingUnitId`) |
| Q3 — Tiền trong ví có tính doanh thu | Kế toán | Phiên 8 |
| Q2, Q4–Q8 — chuyển tiền không cần kế toán, cọc, ưu đãi anh em, buổi vắng, giá học lại | BGĐ | Phiên 6 (nhập vào phiên bản chính sách) |
| Văn bản chính sách học phí có số | BGĐ | Trước pilot |
| Chọn cơ sở pilot | Dev + QLCS | Cổng Đợt 4 |

## 5. Mẫu lệnh mở phiên

```
Đọc docs/thanh-toan-linh-hoat/00-README-ban-giao.md mục 2, sau đó đọc
01-BA (mục <liên quan>), 04-UserStories (US-xx), 05-TestScenarios (TS trỏ US-xx),
documentation/flows.md (F-xx) và documentation/permissions.md.
Đọc docs/thanh-toan-linh-hoat/gate-0.md để lấy tên thật.

Làm đúng US-xx. Trước khi viết mã: liệt kê file sẽ chạm, test sẽ viết cho từng AC,
và mọi chỗ tài liệu mâu thuẫn với repo — dừng lại hỏi nếu có mâu thuẫn.
Kết thúc: chạy cổng mục 2.8, commit riêng, không push.
```

## 6. Ví dụ số dùng xuyên suốt

Gia đình `GD-MAU`: An Sata3 (9.600.000, ưu đãi anh em 10% → 8.640.000, 180.000/buổi), Bình Sata5 (12.000.000, 250.000/buổi), mỗi con 2 đợt 24 buổi. Tình huống A (Bình dừng sau buổi 20, dư 1.000.000 chuyển An, An mất ưu đãi từ buổi 25) cho kết quả An còn nợ **3.800.000**, Bình **0**. Chi tiết BA mục 9.
