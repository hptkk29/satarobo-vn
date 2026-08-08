# tests.md — Bản đồ kiểm chứng

> Sau mỗi story merge, chuyển dòng tương ứng từ Proposed → Existing kèm đường dẫn file test. Tài liệu này chỉ được coi là xanh khi cột Existing phủ hết nhóm CI-required.

## 1. Existing coverage (hiện có trong repo)

| Rule (nguồn) | Phủ bởi | Scenario | Loại |
|---|---|---|---|
| Cách ly đọc theo lớp/cơ sở (permissions.md) | **Existing (tầng tĩnh)** — `lib/auth/chat-permissions.test.ts` (từng ô ma trận trên can() v1 + v2, mã ô [TS-01.x] cạnh assertion) · tầng động: `tests/chat/permission-matrix.spec.ts` (todo, mở dần theo story US-06/US-08) | TS-01 | **AUTO-CI** |
| Cách ly channel + không INSERT client (flows F-SUB) | Existing (US-02): integration `scripts/_zztest-chat-us02.ts` chạy trên dev (CI không có Realtime service) + unit JWT `lib/chat/realtime-token.test.ts` chạy vitest trong CI | TS-02 | **AUTO-CI** |
| Ma trận hành động ghi (permissions.md) | **Existing (tầng tĩnh)** — `lib/auth/chat-permissions.test.ts` (vai × action, gồm SALES_CSM deny cả 5 · PH deny announce · QLCS=MEMBER gửi CHAT+ANN · QLCS/PH deny moderate) · tầng động: `tests/chat/permission-matrix.spec.ts` (todo TS-03.1→03.8 kèm mã lỗi kỳ vọng, mở ở US-06/US-10/US-12) | TS-03 | **AUTO-CI** |
| 1-1 kín + audit-gated (flows F-AUDIT) | **Existing (tầng tĩnh)** — `lib/auth/chat-permissions.test.ts` (QLCS deny DM qua CENTER-scope × centerId=null; chat:admin chỉ SUPER_ADMIN) · tầng động: `tests/chat/permission-matrix.spec.ts` (todo TS-04.1→04.6, mở ở US-13/US-15) | TS-04 | **AUTO-CI** |
| Seed chuẩn TestScenarios trên schema thật | Existing — `tests/chat/_helpers/seed-chat.ts` (assertTestDb bắt buộc, idempotent) + 3 smoke test trong `permission-matrix.spec.ts` (skip có thông điệp khi không có Postgres local) | Seed chuẩn | AUTO |
| Khai action `chat:*` 2 tầng RBAC | Existing — v1 `lib/auth/permissions.ts` + v2 `prisma/seed-roles.ts`; pin chống drift trong `lib/auth/chat-permissions.test.ts` (describe "pin nội dung seed v2") | — | **AUTO-CI** |

## 2. Proposed (đề xuất, chưa viết)

Loại: **AUTO-CI** (chặn merge) · **AUTO** (chạy CI, không chặn) · **TAY** (kịch bản staging trước phát hành).

> Ghi chú US-05 (08/08): TS-01/TS-03/TS-04 đã chuyển lên mục 1 (tầng tĩnh Existing; tầng động là khung it.todo trong `tests/chat/permission-matrix.spec.ts` — story US-06→US-15 đổi todo → test thật, KHÔNG tạo file mới). TS-02 giữ như US-02 đã ghi.

| Rule (nguồn) | Hành vi kỳ vọng — gồm deny case | Scenario | Loại |
|---|---|---|---|
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
