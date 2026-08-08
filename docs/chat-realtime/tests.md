# tests.md — Bản đồ kiểm chứng

> **Trạng thái thật thà: chưa có dòng test nào tồn tại** — code chưa viết. Vì vậy mục "Existing coverage" rỗng theo định nghĩa; toàn bộ nằm ở "Proposed". Sau mỗi story merge, chuyển dòng tương ứng từ Proposed → Existing kèm đường dẫn file test. Tài liệu này chỉ được coi là xanh khi cột Existing phủ hết nhóm CI-required.

## 1. Existing coverage (hiện có trong repo)

*(rỗng — cập nhật khi US-05 tạo khung test đầu tiên)*

## 2. Proposed (đề xuất, chưa viết)

Loại: **AUTO-CI** (chặn merge) · **AUTO** (chạy CI, không chặn) · **TAY** (kịch bản staging trước phát hành).

| Rule (nguồn) | Hành vi kỳ vọng — gồm deny case | Scenario | Loại |
|---|---|---|---|
| Cách ly đọc theo lớp/cơ sở (permissions.md) | ph đọc lớp khác/ql đọc cơ sở khác/sale mọi endpoint/PH đã rời → 403; gv dạy chéo thấy đủ 2 lớp | TS-01 | **AUTO-CI** |
| Cách ly channel + không INSERT client (flows F-SUB) | non-participant subscribe → CHANNEL_ERROR; `channel.send()` client → từ chối; **canary private-flag** | TS-02 | **AUTO-CI** |
| Ma trận hành động ghi (permissions.md) | từng ô ❌ đúng mã lỗi: PH gửi ANN 403, GV gửi lớp không dạy 403, QLCS gửi cả CHAT+ANN lớp mình 200, gỡ tin thiếu lý do 400, ARCHIVED 403 mã riêng | TS-03 | **AUTO-CI** |
| 1-1 kín + audit-gated (flows F-AUDIT) | 4 vai ngoài cuộc đọc 1-1 → 403; admin thiếu reason → 403 **ở API** không chỉ UI; audit ghi trước khi trả nội dung; payload thành viên cho PH không chứa SĐT/email | TS-04 | **AUTO-CI** |
| Sync trong transaction (flows F-SYNC) | chuyển lớp: rời cũ + vào mới cùng TX; rollback → không sync nửa vời | TS-05 | **AUTO-CI** |
| PH nhiều con (BR US-03.3) | 1 con nghỉ → ở lại; con cuối nghỉ → leftAt; luôn 1 bản ghi participant | TS-06 | **AUTO-CI** |
| Đối soát tự thi hành (cron.md) | drift REMOVE → tự set leftAt; drift ADD → chỉ log; `0 drift` khi sạch | TS-07 | AUTO + TAY 3 đêm |
| ARCHIVED + hạn 90 ngày (permissions.md) | PH sau 91 ngày → 403; GV/QLCS/Admin vẫn đọc | TS-08 | AUTO |
| Reconcile không mất tin (flows F-SUB, NT1) | offline 30s/10' → nhận đủ, đúng thứ tự, không trùng | TS-09 | TAY (API con: AUTO) |
| Khử trùng optimistic + idempotent gửi lại (F-SEND) | race broadcast-trước-response vẫn 1 bản; cùng clientMsgId không nhân đôi | TS-10 | **AUTO-CI** |
| Kick giữa phiên (F-KICK) | client thoát trong vài giây; quay lại → 403; **đo độ trễ ghi vào architecture.md** | TS-11 | TAY |
| Broadcast fail không phá gửi (F-SEND bước 6) | mock 500 → tin vẫn 200 + trong DB + log warning | TS-12 | **AUTO-CI** |
| Vòng ANNOUNCEMENT (F-ANN) | ghim, đã-đọc theo viewport, quota 11/ngày chặn, xuyên mute | TS-13 | TAY |
| File: magic bytes + signed URL + tin gỡ (F-FILE, F-DEL) | exe-đổi-đuôi 415; non-participant xin URL 403; URL >5' 403; ảnh tin gỡ 403 | TS-14 | AUTO (1,2,4) + TAY (3) |
| Push đúng điều kiện (US-14) | foreground không push; mute chặn CHAT không chặn ANN; logout thôi nhận | TS-15 | TAY |
| Khoá lan realtime + audit (F-LOCK) | 3 client vô hiệu ô nhập không reload; audit khoá & mở | TS-16 | TAY |
| Diễn tập ngày-đầu PH (US-16) | kích hoạt→đọc thông báo ≤3 phút không trợ giúp; dashboard đếm đúng | TS-17 | TAY (gate Đợt 2) |
| Không secret trong bundle client (variables.md) | grep build output sạch `service_role`/`sb_secret` | — | **AUTO-CI** |
| Ràng buộc unique schema (US-01) | nhóm lớp thứ hai cùng Class bị từ chối; 2 insert dmKey song song → 1 thắng | — | **AUTO-CI** |

## 3. Gaps (rule có tài liệu nhưng chưa có gì kiểm)

Xếp theo mức lộ nếu vượt qua:

| Gap | Lộ gì | Kế hoạch |
|---|---|---|
| Quy trình con người xử lý yêu cầu xoá ảnh trẻ em (architecture.md rủi ro mở) | Pháp lý/uy tín — không test kỹ thuật nào phủ được | Văn bản quy trình, fast-follow T6 |
| Độ trễ P95 ≤1,5s dưới tải thật (NFR PRD) | Trải nghiệm, không phải an toàn | Đo trong pilot Đợt 2, không dựng load-test riêng (paper tiger) |
| Chất lượng dữ liệu SĐT PH cho luồng cấp tài khoản (E3) | Cổng pilot sập vì lý do ngoài chat | Thuộc hạng mục cấp tài khoản — flag phụ thuộc, không phủ ở đây |
| Hành vi ZNS (P1) | — | Chưa áp dụng ở P0 |

## Quy tắc CI

- Nhánh `main` bảo vệ: nhóm **AUTO-CI** đỏ → không merge. Đây là "người review thứ hai" (pre-mortem T2) — tắt quy tắc này phải coi như một quyết định rủi ro có ghi nhận, không phải thao tác tiện tay.
- Định nghĩa sẵn sàng Đợt 2 (từ TestScenarios): AUTO xanh 3 lần liên tiếp + toàn bộ TAY pass trong một buổi diễn tập có Dev chứng kiến + TS-17 ≤3 phút.
