# README bàn giao Claude Code — Nền Hệ thống satarobo

> Cách dùng bộ tài liệu này để thi công. Người vận hành: Dev. Agent: Claude Code. Mỗi phiên = MỘT user story.

---

## 0. Điều kiện khởi công (không thương lượng)

1. **Cả 4 đợt của module chat đã merge** (Tiger T1). P0 của nền có thể chuẩn bị trước ở nhánh riêng, nhưng không merge chồng lên chat.
2. Điều khoản adapter `can()` đã nằm trong CLAUDE.md của repo (Tiger T3) — nếu chưa, làm việc này TRƯỚC phiên đầu tiên.
3. Gộp 2 account Vercel về một trước khi bước vào P4 (E4).

## 1. Bộ tài liệu

| File | Vai trò khi thi công |
|---|---|
| 00-BA-module-he-thong.md | Nguồn chân lý về mô hình & luật nghiệp vụ. Xung đột ở đâu → BA thắng |
| 01-PRD | Phạm vi pha + KR. Cổng chuyển pha |
| 02-PreMortem | Danh sách rủi ro — đọc mục Tigers trước khi code migration |
| 03-UserStories | 18 story, mỗi phiên một story, làm theo thứ tự trong pha |
| 04-TestScenarios | 20 kịch bản; AUTO-CI viết TRƯỚC code của story tương ứng |
| documentation/ | 6 doc intended-state — Claude Code cập nhật lại thành as-built sau mỗi pha |

## 2. Nội dung chèn vào CLAUDE.md của repo (copy nguyên khối)

```markdown
## Nền Hệ thống — luật cứng cho agent

1. MỌI kiểm tra quyền đi qua duy nhất hàm `can(actor, permissionKey, target)`.
   Cấm viết điều kiện quyền (so role, so centerId/orgUnitId) trong Server Action,
   component, hay query. Vi phạm lint `no-inline-authz` = build fail.
2. Trước P4, `can()` fallback về logic centerId hiện hành. Không được xoá
   đường cũ, không được đổi hành vi đường cũ.
3. Mọi bảng mới có dữ liệu theo đơn vị BẮT BUỘC có cột `orgUnitId`
   (không thêm `centerId` mới). Bảng cũ: ghi kép cả hai cột cho tới P4.
4. Không tự ý sinh migration đổi/bỏ cột trên bảng đang có dữ liệu PROD.
   Migration chỉ nằm trong story được giao, có dry-run, và Dev chạy tay trên PROD.
5. Test AUTO-CI của story (xem 04-TestScenarios) viết TRƯỚC phần hiện thực.
   Story chưa có test đỏ thì chưa được viết Server Action.
6. Không nhúng role/scope vào JWT. Nguồn quyền là DB, cache theo request.
7. Nội dung chương trình dạy: mọi endpoint trả nội dung phải qua chuỗi
   4 điều kiện ở server (BA §3.2). Không có ngoại lệ cho môi trường dev.
8. Không cron nào GHI thay đổi quyền. Hết hạn là thuộc tính resolver.
9. Secret chỉ trong env; không hardcode, không log giá trị secret.
10. Kết thúc phiên: cập nhật documentation/ tương ứng phần đã làm,
    liệt kê file đổi, và DỪNG — không tự chuyển sang story kế.
```

## 3. Mẫu prompt mở phiên (điền [X] mỗi lần)

```
Đọc theo thứ tự: CLAUDE.md → docs/nen-he-thong/00-BA → 03-UserStories mục US-[X]
→ 04-TestScenarios các TS gắn với US-[X] → documentation/ liên quan.

Nhiệm vụ phiên này: HOÀN THÀNH US-[X], đúng phạm vi AC, không hơn.
Trình tự bắt buộc: (1) nêu kế hoạch file sẽ tạo/sửa và chờ tôi xác nhận;
(2) viết test TS tương ứng trước, chạy cho đỏ; (3) hiện thực cho xanh;
(4) chạy toàn bộ test cũ — không được làm đỏ test RBAC v2 và test chat;
(5) cập nhật documentation/; (6) báo cáo tóm tắt + dừng.

Ràng buộc thêm của phiên: [ghi chú riêng nếu có, ví dụ "chỉ dry-run, không ghi PROD"].
```

## 4. Thứ tự phiên đề xuất

| Pha | Phiên → Story | Cổng đóng pha |
|---|---|---|
| P0 | US-01 → US-02 → US-04 → US-03 | TS-01..04 xanh CI; lint no-inline-authz bật |
| P1 | US-05 → US-06 → US-07 | J1 chạy 3 đêm sạch trên PROD |
| P2 | US-08 → US-09 → US-10 → US-11 | TS-08..12 xanh; bản đối chiếu nhân sự Dev đã ký |
| P3 | US-12 | Digest shadow chạy; benchmark p95 của can() có số |
| P4 | US-13 | KR5: 7 ngày 0 lệch; runbook rollback đã diễn tập (TS-14) |
| P5 | US-14 → US-15 → US-16 → US-17 → US-18 | TS-16..20 xanh; KR1 bấm giờ đạt |

Quy tắc chuyển pha: cổng chưa đạt thì KHÔNG mở phiên của pha sau — kể cả "làm trước cho nhanh".

## 5. Việc của người (không giao agent)

- Chạy migration/backfill trên PROD (agent chỉ soạn script + dry-run).
- Ký cổng P4 sau khi đọc báo cáo đối soát 7 ngày.
- Khảo sát định dạng import AMIS Kế toán (E1) trước khi mở P5/F7.
- Đưa bảng vòng đời FranchiseContract cho tư vấn pháp lý (E2) trước hợp đồng thật đầu tiên.
- Gộp account Vercel (E4).
