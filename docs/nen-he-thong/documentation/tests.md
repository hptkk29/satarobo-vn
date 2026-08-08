# tests.md — Bản đồ kiểm chứng (INTENDED STATE, thời điểm 08/08)

> Ba mục tách bạch để bản đồ không "xanh giả". Trạng thái hôm nay: nền CHƯA có dòng code nào — nên mục "Đang có" gần trống là trung thực, không phải thiếu sót.

## 1. Đang có trong repo hôm nay

| Test | Ghim luật nào |
|---|---|
| Bộ test RBAC v2 (shadow-compare, từ đợt go-live 26/07) | Hành vi quyền theo `centerId` hiện hành — chính là ĐƯỜNG CŨ mà F6 so sánh; giữ nguyên, không xoá trước P4 |
| (Đợt chat, đang viết) US-05 khung test ma trận quyền chat | Quyền Participant của module chat qua adapter `can()` |

Ngoài hai nhóm trên: chưa có test nào cho các luật của nền. Mọi dòng dưới đây là PROPOSED.

## 2. Đề xuất (chưa viết) — nguồn: 04-TestScenarios

| Use case → Luật | Hành vi kỳ vọng (kèm DENY) | Nguồn bằng chứng | Loại | CI chặn merge |
|---|---|---|---|---|
| Registry duy nhất (TS-01) | Key trùng → deploy fail | BA §2.5 · US-01 | unit | ✔ |
| DENY > ALLOW, hợp nhất ROLE∪GROUP (TS-02) | Nhóm DENY che trường dù role ALLOW | BA §2.5 · US-02/03 | integration | ✔ |
| Không kiểm quyền ngoài can() (TS-03) | Server Action thiếu can() → build fail | KR3 · US-02 | lint/CI | ✔ |
| Ma trận 24 case (TS-04) | 4 scope × 3 relationship × 2 effect | BA §2.2, §2.5 · US-04 | integration | ✔ |
| Path nguyên tử khi dời node (TS-05) | Cây con đổi path 1 transaction; chống vòng | BA §2.2 · US-05 | integration | ✔ |
| Pháp nhân bị chặn xoá (TS-06) | Còn unit ACTIVE → từ chối | BA §2.3 · US-06 | unit | ✔ |
| Đối soát backfill (TS-07) | Lệch → alert; idempotent | Pre-mortem T2 · US-07 | integration + **TAY** (7 ngày PROD) | ✔ (phần auto) |
| Quyền theo Position (TS-08) | Gỡ assignment → 403 tức thì | BA §2.4 · US-08 | integration | ✔ |
| Chống vòng cây báo cáo (TS-09) | Chuỗi vòng → chặn ghi | Q2 · US-08 | unit | ✔ |
| Hết hạn tự tắt, không cron (TS-10) | effectiveTo qua → grant không tính | US-09 · cron.md nguyên tắc | unit | ✔ |
| WorkScope 2 chiều (TS-11) | Thêm → thấy đúng lớp; hết hạn → 403 | B2 · US-10 | integration | ✔ |
| Dry-run nhân sự (TS-12) | Không đoán đơn vị thiếu | US-11 | **TAY** | — |
| Shadow không chặn (TS-13) | DENY mới + ALLOW cũ → vẫn 200 + log | F6 · US-12 | integration | ✔ |
| Rollback 1 thao tác (TS-14) | Tắt flag < 1 phút, không deploy | F6 · US-13 | **TAY** (staging, có runbook) | — |
| OWN phụ huynh (TS-15) | Đổi ID con khác → 403 | E3 · US-13 | integration | ✔ |
| Cắt hợp đồng 1 thao tác (TS-16) | TERMINATED → 403 chương trình, GRACE đọc học viên | KR2 · F3 · US-14 | integration | ✔ |
| 3 chính sách ghi đè (TS-17) | LOCKED chặn / BOUNDED biên / OVERRIDABLE giữ gốc | BA §3.1 · US-15 | integration | ✔ |
| Chuỗi 4 điều kiện, 4 case DENY (TS-18) | Thiếu 1 → 403; QL chỉ danh sách; IDOR chặn | BA §3.2 · F4 · US-16 | integration | ✔ |
| Wizard nguyên tử (TS-19) | Lỗi giữa chừng → 0 rác; KR1 ≤ 30 phút | F1 · US-17 | integration + **TAY** (bấm giờ) | ✔ (phần auto) |
| Audit bất biến + log việc xem (TS-20) | Không sửa/xoá; xem cũng bị log | US-18 | integration | ✔ |

## 3. Lỗ hổng — luật đã ghi nhưng CHƯA có gì kiểm, xếp theo mức lộ

| Luật không ai kiểm | Lộ gì nếu sai | Hướng |
|---|---|---|
| Hiệu năng `can()` dưới tải (T4) | PROD chậm toàn cục sau P4 | Benchmark ở P3, ngưỡng p95 cho resolver; chưa nằm trong TS nào |
| Ranh giới tài chính franchise ở TỪNG câu query báo cáo (BA §4) | Vi phạm pháp lý nhìn số chi tiết bên nhận | Khi viết module báo cáo: mỗi query qua ma trận TS-04 mở rộng; hiện chỉ có luật, chưa có bề mặt code |
| Định dạng seam MISA (F7 / E1) | Kế toán nhập sai kỳ lương | Khảo sát import AMIS trước P5 — chưa test được vì chưa có spec |
| Che trường `fieldMask` trên MỌI đường trả dữ liệu (không riêng TS-02) | Rò trường nhạy cảm qua endpoint quên áp mask | Đưa mask vào tầng serialize chung + test hợp đồng cho từng DTO — bổ sung khi có DTO thật |
