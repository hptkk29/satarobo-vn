# README — Bàn giao dự án Chat Realtime cho Claude Code

> Ngày: 07/08/2026 · Người chạy: Kiệt (dev) · Dev (review + vận hành pilot)
> Repo đích: `satarobo-vn` (chuẩn techstack đã chốt)

---

## 1. Bộ tài liệu đầy đủ (10 file)

### Tài liệu quy trình PM (đọc để hiểu, không đưa hết vào context)

| # | File | Vai trò | Ai đọc |
|---|---|---|---|
| 1 | `BA-chat-realtime-satarobo.md` | Đặc tả nghiệp vụ: luật BR-xx, schema, kiến trúc realtime, use case | Kiệt đọc TRỌN trước khi code |
| 2 | `PRD-chat-realtime-satarobo.md` | Phạm vi, KR, kế hoạch 4 đợt, phụ lục thay đổi so với BA | Dev + Kiệt |
| 3 | `PreMortem-chat-realtime-satarobo-2026-08-07.md` | Rủi ro + gói cắt P0 + action plan | Dev (chủ), Kiệt (T2, T3, T5) |
| 4 | `UserStories-chat-realtime-satarobo.md` | **Backlog 16 story — đơn vị làm việc chính với Claude Code** | Kiệt |
| 5 | `TestScenarios-chat-realtime-satarobo.md` | 17 kịch bản, nhãn [AUTO]/[TAY], seed chuẩn | Kiệt + Dev (buổi TAY) |

### Bộ shipping-artifacts (COPY NGUYÊN vào repo tại `documentation/`)

| # | File | Vai trò |
|---|---|---|
| 6 | `documentation-chat/architecture.md` | Gốc — trust boundaries, rủi ro chấp nhận, index |
| 7 | `documentation-chat/flows.md` | Luồng runtime + authz check từng bước + deny case |
| 8 | `documentation-chat/permissions.md` | Ma trận quyền tĩnh — nguồn của bộ test US-05 |
| 9 | `documentation-chat/variables.md` | Secrets + checklist go-live |
| 10 | `documentation-chat/cron.md` | Job đối soát đêm |
| 11 | `documentation-chat/tests.md` | Bản đồ kiểm chứng — cập nhật Proposed→Existing sau mỗi story |

> Bộ 6–11 viết ở trạng thái **intended-state** (trước code). Sau Đợt 1, chạy đối chiếu intended-vs-implemented (bước 8 dưới đây) — lệch = bug hoặc phải sửa docs.

---

## 2. Chuẩn bị repo (làm MỘT lần, trước prompt đầu tiên)

```
satarobo-vn/
├── documentation/          ← copy 6 file shipping-artifacts vào đây
│   └── backlog/            ← copy UserStories + TestScenarios vào đây
├── CLAUDE.md               ← tạo theo mẫu mục 3
└── ...
```

Ba việc tay không giao cho agent:

1. **Spike G2** (0,5 ngày): kiểm `User` có cột ánh xạ `auth.uid()` chưa. Chưa có → US-01 phải gồm backfill.
2. **Spike G4**: rà mọi chỗ đang dùng Supabase Realtime trên PROD trước khi tắt "Allow public access".
3. **Branch protection** trên `main`: require CI xanh. Đây là mitigation T2 — làm trước khi có test đầu tiên.

---

## 3. CLAUDE.md — mẫu đặt ở gốc repo

```markdown
# CLAUDE.md — Module Chat Realtime

## Bối cảnh bắt buộc
- Đọc documentation/architecture.md trước mọi task chat.
- Nghiệp vụ: documentation/backlog/UserStories-chat-realtime-satarobo.md
  (làm theo đúng AC từng story, không tự mở rộng phạm vi).
- Ma trận quyền: documentation/permissions.md là NGUỒN SỰ THẬT —
  code lệch ma trận là bug, kể cả khi "tiện hơn".

## Luật cứng (không thương lượng, không "tối ưu hộ")
1. Client CHỈ ĐỌC realtime. Mọi ghi đi qua Server Action.
   Không bao giờ tạo policy INSERT trên realtime.messages.
2. Postgres là nguồn sự thật. Broadcast fail → log, không rollback,
   không báo lỗi người gửi.
3. Mọi xoá là SOFT DELETE. Không viết hard delete trong module chat.
4. Không hard-code classId vào Message. Dùng Conversation/Participant/Message.
5. Thành viên nhóm lớp DẪN XUẤT — mọi luồng đổi phân công/học viên
   phải gọi syncConversationMembership TRONG CÙNG transaction.
6. SĐT/email của PH không bao giờ xuất hiện trong payload trả cho PH khác.
7. Test ma trận quyền (tests/permissions/) phải xanh trước khi coi
   story là xong. Thêm tính năng = thêm assertion vào ma trận trước.
8. Secrets: không đọc/ghi giá trị secret vào code hay log.
   Tham chiếu documentation/variables.md.

## Định nghĩa xong của một story
- AC trong UserStories tick đủ
- Dòng tương ứng trong documentation/tests.md chuyển Proposed → Existing
  kèm đường dẫn file test
- CI xanh
```

---

## 4. Trình tự chạy với Claude Code

Nguyên tắc: **mỗi phiên một story**, theo đúng thứ tự — vì US-05 (khung test) phải tồn tại trước Server Action đầu tiên.

### Đợt 0 — Nền (tuần 1)

| Phiên | Prompt mẫu cho Claude Code |
|---|---|
| 0a | "Đọc documentation/ và CLAUDE.md. Thực hiện US-01 trong documentation/backlog/UserStories...md: schema + migration trên DEV. Kết quả spike G2: [dán kết quả]. Xong thì tự kiểm AC 1–5." |
| 0b | "Thực hiện US-02: policy RLS SELECT trên realtime.messages theo documentation/flows.md mục F-SUB. Không tạo policy INSERT. Viết luôn test TS-02 (kể cả canary bước 5)." |
| 0c | "Thực hiện US-05: dựng khung test ma trận quyền từ documentation/permissions.md + seed chuẩn trong TestScenarios. Sinh đủ tổ hợp TS-01→TS-04. Các test gọi endpoint chưa tồn tại thì đánh dấu todo/skip có chú thích — khung phải compile và chạy được." |
| 0d | "Thực hiện US-03: service syncConversationMembership + checklist điểm gọi (AC5). Bật lại các test TS-05, TS-06 trong khung." |
| 0e | "Thực hiện US-04: job đối soát theo documentation/cron.md. Test TS-07." |

### Đợt 1 — Nhóm lớp (tuần 2–3)

Lần lượt US-06 → US-07 → US-08 → US-09 → US-10 → US-12 → US-11. Prompt lặp một khuôn:

> "Thực hiện US-xx. Tra flows.md mục F-yy cho authz từng bước. Bật các test [AUTO] tương ứng theo ma trận bao phủ cuối TestScenarios. Cập nhật tests.md: chuyển dòng vừa phủ sang Existing."

Cuối Đợt 1: chạy bước 8 (đối chiếu) + chạy pentest AI vào endpoint chat trên staging (pre-mortem T2b) + buổi [TAY] thứ nhất với Dev.

### Đợt 2 — Pilot PH (tuần 4–5, chờ E3 chốt)

US-13 → US-14 → US-15 → US-16. **US-16 chặn cho tới khi luồng cấp tài khoản PH (E3) chốt định danh** — nếu tới lượt mà E3 chưa xong, dừng và xử lý E3 như hạng mục riêng, đó mới là critical path.

Trước ngày mở PH: diễn tập TS-17 (≤3 phút), tick lại pre-mortem (mục "Lịch xem lại").

---

## 5. Bước 8 — Đối chiếu intended-vs-implemented (cuối Đợt 1 và trước Đợt 2)

Prompt cho Claude Code:

> "Dùng phương pháp intended-vs-implemented: so sánh code hiện tại với documentation/architecture.md, flows.md, permissions.md. Liệt kê mọi lệch thành 2 cột: (a) code sai so với docs — đề xuất fix; (b) code đúng nhưng docs lỗi thời — đề xuất sửa docs. Không tự sửa gì khi chưa được duyệt danh sách."

Đây là bước thay thế vai trò reviewer con người đã mất — chạy nghiêm túc, đọc kỹ output, đừng auto-accept.

---

## 6. Nhắc ba chốt vận hành (ngoài code)

- **Cổng Đợt 2 là điều kiện cứng:** lớp <70% PH kích hoạt hoặc <50% đọc thông báo đầu trong 48h → không mở rộng, quay về bài toán onboarding.
- **E2 (đốt thuyền Zalo):** quyết định đóng nhóm Zalo lớp pilot sau 2 tuần song song — quyết trước ngày mở PH, thông báo cho PH.
- **E1 (chủ vận hành):** văn bản ngắn giao QLCS mức 1, Admin HO mức 2 — trước pilot.
