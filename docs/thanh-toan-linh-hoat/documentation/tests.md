# tests.md — Bản đồ kiểm chứng

Ba phần tách biệt để bản đồ không "xanh giả". Trạng thái "có sẵn" chỉ ghi khi đã biết có test trong repo; **toàn bộ phần "có sẵn" phải được đo lại ở US-01** vì tài liệu này viết khi chưa đọc repo.

## 1. Kiểm chứng đang có (cần đo lại)

| Luật | Test đã biết | Liên quan module |
|---|---|---|
| Điều chỉnh ghi delta, dòng gốc bất biến, lần hai tính trên lần một | Chuỗi test bút toán Điều chỉnh (đóng 08/09) | Khuôn cho TRANSFER/REFUND/QUYẾT TOÁN |
| Trục A (CONFIRMED) và trục B (RECORDED) cộng khác nhau | `tests/fixtures/hai-truc-tien.ts` + `FX_KY_VONG` | "Đã thu" vs "Chờ xác nhận" |
| `payments:adjust` chỉ kế toán | Test RBAC v2 bước 1 | Khuôn deny cho `billing:refund` |
| Cộng tiền bỏ qua khoản xoá mềm | Test cảnh báo cắt 50.000 dòng + vá `deletedAt` | `debt.ts` |

Không biết có test nào cho: khớp webhook theo kỳ thu, ví, dừng học, ưu đãi liên đới, khoá gia đình → coi là **không có**.

## 2. Kiểm chứng đề xuất

| Use case | Luật | Hành vi mong đợi (gồm ca từ chối) | Nguồn | Loại | CI bắt buộc | TS |
|---|---|---|---|---|---|---|
| Mọi ghi tiền | B1–B9 | Vi phạm → rollback, mã lỗi | BA 4.2; `kiem-bat-bien.ts` | unit | ✓ | 01 |
| Bảng giá | Σ = học phí thực | 1.000 bộ ngẫu nhiên không lệch | BA 4.4 | unit | ✓ | 02 |
| Migration | Không đổi unique khi còn NULL | Dừng nguyên vẹn | US-03 | integration | ✓ | 03 |
| Khoá gia đình | Webhook ∥ dừng học | Không tiền vào đợt huỷ | flows F-04, F-07 | integration | ✓ | 04 |
| Idempotency | Cùng key → 1 lần ghi | — | US-04 | integration | ✓ | 05, 24 |
| Quyền mọi ghi danh bị chạm | Thiếu 1 → deny | Deny không lộ số | permissions §3.1 | integration | ✓ | 06 |
| Công tắc | Tắt/bật đổi hành vi thật | Sổ B bị chặn khi bật | architecture R4 | integration | ✓ | 07 |
| Trạng thái đợt | Suy ra, không lưu | REJECTED làm lùi trạng thái | BA 4.5 | unit | ✓ | 08 |
| Chính sách snapshot | Ghi danh cũ không đổi | Sale sửa chính sách → deny | L5; F-13 | integration | ✓ | 09, 10 |
| Phạm vi OWN | Gia đình người khác → 404 | — | permissions §3.4 | integration | ✓ | 11 |
| Tạo đơn nhiều con | Ưu đãi đúng con | Vượt giới hạn → deny | F-01 | integration | ✓ | 12, 13 |
| Kế hoạch đợt | Đợt cuối tự cân; không trần 2 | Vượt giới hạn → chặn | BA 4.5 | integration | ✓ | 14–16 |
| Kỳ thu | B7; huỷ chỉ khi 0đ | Kỳ thu có tiền không huỷ được | F-02, F-03 | integration | ✓ | 17–19 |
| Webhook | Chia đích danh; thiếu lấp theo thứ tự; thừa vào ví; kỳ huỷ vào ví; không tỉ trọng | SĐT trùng → không ghi tiền | F-04; automation.md | integration | ✓ | 20–25 |
| Ví | Chia ≤ nợ, ≤ ví, chỉ CONFIRMED | — | F-06 | integration | ✓ | 26 |
| Tiền mặt | REJECTED mở lại dòng | Tự xác nhận khoản của mình → chặn | F-05 | integration | ✓ | 27 |
| Dừng học | Quyết toán đúng tình huống A/B/C; dư phân hết | Không hoàn khi không cho phép → deny | F-07 | integration | ✓ | 28–36 |
| Ưu đãi liên đới | Tách đoạn tại k; không truy thu | — | BA 4.4 | unit + integration | ✓ | 37 |
| Chuyển tiền | B3, B8, B9 | Khác gia đình/đơn vị → deny | F-08 | integration | ✓ | 38 |
| Bảo lưu | Không quá hạn khi PAUSED | — | F-09 | integration | ✓ | 39 |
| Thêm con | Không tính lùi | — | US-19 | integration | ✓ | 40 |
| Đổi khoá/cơ sở | 1 nghiệp vụ; khác đơn vị không chuyển | — | F-10 | integration | ✓ | 41, 42 |
| Hoàn tiền | ≤ ví; chỉ kế toán | Sale → deny | F-11 | integration | ✓ | 43 |
| Miễn giảm | ≤ nợ; chỉ QLCS | Sale → deny | F-12 | integration | ✓ | 44 |
| Quá hạn | Gom gia đình; 1 thông báo/ngày | PAUSED loại | cron.md | integration | ✓ | 45 |
| Kiểm cân đêm | Bắt lỗi ghi tắt | Cron không ghi tiền | cron.md | integration | ✓ | 46 |
| Chuyển sổ B | Dry-run 0 lệch; idempotent | — | US-25 | integration | ✓ | 47 |
| Báo cáo bất thường | Đánh dấu đúng | — | US-26 | integration | — | 48 |
| Xem trước đồng thời | Người sau bị `DU_LIEU_DA_DOI` | — | US-04/AC4 | integration | ✓ | 49 |
| Grep đường ghi | 0 lệnh ghi tiền ngoài `lib/finance/ledger/` | — | US-04/AC6 | unit (script) | ✓ | — |
| Grep công tắc | 0 chỗ đọc cờ ngoài `feature.ts` | — | architecture R4 | unit (script) | ✓ | 07 |
| RLS | Bảng mới `relrowsecurity = t` | Truy vấn bằng anon key → 0 dòng | permissions §4 | integration | ✓ | 03 |
| Webhook SePay thật | Chuyển 10.000đ vào VA kỳ thu test | Tự chia đúng | automation.md | guarded live | — | — |
| Sai khoá webhook prod | 401 + log cảnh báo | — | variables.md checklist | guarded live | — | — |
| Sale tự làm 5 tình huống | ≥ 4/5 đúng; ≤ 3 phút | — | PRD A3, KR5 | manual | — | 50 |
| Văn bản chính sách | Phiên bản 1 có số văn bản BGĐ | — | Pre-mortem T6 | manual | — | — |

## 3. Khoảng trống (chưa có kiểm chứng nào, xếp theo mức phơi nhiễm)

| # | Luật | Hậu quả nếu sai | Đề xuất |
|---|---|---|---|
| K1 | Số buổi đã diễn ra lấy từ dữ liệu lớp là đúng | Quyết toán sai → tranh chấp, thất thoát | Chờ G0-4; nếu KHÔNG ĐỦ TIN thì thêm test đối chiếu lịch lớp ↔ điểm danh trước Đợt 3 |
| K2 | SePay cấp VA ổn định cho từng kỳ thu | Tiền không khớp → dồn "Cần xử lý" | Guarded live ở Đợt 2; fallback mã kỳ thu đã có TS-25 |
| K3 | Mọi báo cáo (dashboard QLCS, doanh thu) đọc `debt.ts` | Hai số cho một khoản | Kết quả G0-7 → mỗi chỗ đọc một test so số với `debt.ts` |
| K4 | Doanh thu thực thu tính đúng khi có ví/chuyển/hoàn | Báo cáo doanh thu tháng sai | Chờ Q3 kế toán; sau đó thêm test báo cáo |
| K5 | Hoa hồng trừ khi hoàn | Trả hoa hồng thừa | Ngoài V1; cờ dữ liệu có ở US-21/AC5 |

## CI

Cổng merge vào `main` cho mọi PR chạm `lib/finance/**`, `app/**/gia-dinh/**`, route webhook SePay, migration tiền: toàn bộ dòng "CI bắt buộc ✓" + `tsc` sạch + lint 0 lỗi + `migrate diff` 0 dòng. Guarded live và manual không chặn merge, nhưng chặn **bật công tắc** trên prod.
