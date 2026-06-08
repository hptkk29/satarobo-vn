# BA Gap Analysis #02 — Quản lý Học viên & LMS tích hợp

> **Input:** `1-pm-tiep-nhan/01-phieu-tiep-nhan-ql-hv-lms.md` (đã phân loại ✅/🟡/🔴/🔬).
> **Phạm vi BA:** chỉ phân tích các mục **Must/Should/Could** — các mục 🔬 R&D tách track riêng (mục 6).
> Effort: S ≤ 2 ngày · M ≤ 1 tuần · L ≤ 2-3 tuần · XL > 3 tuần (1 dev).

---

## 1. Nhóm MUST (sau SR217)

### M1 — Cảnh báo trùng lịch & vượt sức chứa (yêu cầu 1.10) — Effort M
**Hiện trạng:** tạo Class/ClassSession không validate xung đột.
**Spec:**
- Khi tạo/sửa Class hoặc dời buổi: check overlap cùng `roomId` (ngày+giờ giao nhau), cùng `teacherId`, và `enrollment đếm > maxStudents` khi ghi danh.
- Vi phạm → **cảnh báo (confirm 2 bước)**, không chặn cứng (thực tế có ngoại lệ) — trừ vượt sức chứa phòng (`Room.capacity`) thì chặn.
- Vị trí logic: `lib/classes/conflict.ts` (pure function — unit test được) + gọi từ server actions classes/sessions/enrollments.
**Nghiệm thu:** tạo 2 lớp trùng phòng-giờ → hiện cảnh báo nêu rõ lớp xung đột; ghi danh vượt maxStudents → chặn kèm thông báo.

### M2 — Thời khóa biểu trên Portal (1.9) — Effort S/M
**Hiện trạng:** portal chưa có trang lịch; dữ liệu `ClassSession` đầy đủ.
**Spec:** `/portal/lich-hoc` — lịch tuần/tháng của con đang chọn (RSC query session theo enrollment ACTIVE/STUDYING), đánh dấu buổi nghỉ lễ/đã dời/học bù; mobile-first 375px.
**Nghiệm thu:** PH thấy đúng lịch kể cả buổi bị dời do ngày nghỉ; GV xem TKB của mình tại admin (đã có week-calendar — chỉ verify).

### M3 — Consent dữ liệu cá nhân (8.2, D2) — Effort M
**Phạm vi đã chốt (C2):** KHÔNG thu thập giấy tờ tùy thân — consent chỉ áp dụng cho **ảnh** và dữ liệu cá nhân cơ bản.
**Spec:**
- Bảng `StudentConsent {studentId, type(PHOTO|PERSONAL_DATA), grantedAt, revokedAt, byParentUserId}`.
- Thu consent: khi nhập học (admin tick theo phiếu ký) + PH tự xác nhận trên portal (1 lần, có thể thu hồi).
- Enforce: ảnh lớp chỉ tag/hiển thị học viên có PHOTO consent; export hồ sơ tôn trọng cờ.
**Nghiệm thu:** HS không consent ảnh → không xuất hiện trong media portal dù bị tag.

## 2. Nhóm SHOULD

### S1 — Zalo OA live (4.2, 2.2) — Effort M (phụ thuộc C4: token + template ZNS)
Bật adapter có sẵn (`ZaloMessageLog`, `ZALO_LIVE`): điểm danh vắng, nhắc học phí, nhắc lịch. Fallback email giữ nguyên. Retry + theo dõi quota.

### S2 — Gamification SataCoin trên Portal (3.6, 5.8) — Effort M
**Hiện trạng:** ledger + rule + admin page có; portal chưa thấy gì.
**Spec:** `/portal/satacoin` — số dư (SUM ledger), lịch sử, **danh mục quà** (model mới `RewardItem {name, costCoin, stock, centerId?}`) + flow đổi quà: PH/HV đặt → SPEND (PENDING giữ coin) → CENTER_MANAGER xác nhận trao → DONE (hoặc hủy → hoàn coin REVERSAL). Leaderboard lớp (ẩn danh tùy chọn).
**Nghiệm thu:** đổi quà trừ coin đúng, hủy hoàn đúng, không âm số dư (constraint check trong transaction).

### S3 — PH cập nhật hồ sơ con (1.4) — Effort S
Portal `/portal/ho-so`: PH sửa field an toàn của con (địa chỉ, trường, lớp trường, dị ứng, liên hệ khẩn) → ghi thẳng + `StudentAuditLog` (actor = parent). Field nhạy cảm (tên, DOB, mã HV) chỉ đề xuất → staff duyệt qua `ParentRequest(type=OTHER)` hiện có.

### S4 — Dashboard 3 tầng (7.2) — Effort M/L
Hợp nhất: TGĐ (toàn hệ thống) → drill-down cơ sở → lớp. KPI: sĩ số, chuyên cần, doanh thu, funnel (chia sẻ component với SR217 dashboard). Recharts wrappers hiện có.

### S5 — Hồ sơ năng lực học viên (3.7, một phần 6) — Effort M
Trang tổng hợp per student: `StudentSkillAssessment` (radar 10 kỹ năng), điểm thi, chứng chỉ, dự án/bài nổi bật → export PDF "Hồ sơ năng lực" (phục vụ hồ sơ du học như khách mô tả). Tái dùng pipeline PDF.

### S6 — NPS → KPI CSKH (4.8) — Effort S/M (chờ C8 công thức)
`SurveyResponse` đã có `csmId/teacherId` → báo cáo NPS theo nhân sự theo kỳ; bảng KPI đọc từ đó. Không tự trừ lương — chỉ báo cáo.

## 3. Nhóm COULD (phân tích sơ bộ — spec chi tiết khi đến lượt)

| ID | Hạng mục | Hướng tiếp cận | Effort | Phụ thuộc |
|---|---|---|---|---|
| C1 | Xếp lớp tự động sau test (1.8) | Placement test = Exam tag PLACEMENT; rule engine gợi ý lớp theo (tuổi, điểm, level, slot trống, cùng cơ sở) — **gợi ý, giáo vụ confirm**, không auto-commit | L | C3 (phỏng vấn giáo vụ) |
| C2 | Thi có giám sát (3.3) | Mức 1: khóa fullscreen + đếm tab-switch + shuffle (đã có shuffle). Mức webcam = R&D | M | — |
| C3 | Chia sẻ học bạ có thu hồi (6.5) | Share-link ký + hạn (`TranscriptShare {token, expiresAt, revokedAt}`) → trang public read-only | S/M | — |
| C4 | MISA AMIS sync thật (5.6) | Theo `docs/misa-amis-sync.md`: push hóa đơn/phiếu thu qua IntegrationLog; idempotent + retry | L | C5 (tài khoản API) |
| C5 | Cổng thanh toán online (5.2) | Tingee/VNPay webhook → Order auto-CONFIRMED (thay đối soát tay); bắt đầu 1 cổng | L | C6 (hợp đồng cổng) |
| C6 | PWA portal (4.1) | manifest + service worker + Web Push (thay app native) | M | — |
| C7 | Log truy cập đọc dữ liệu nhạy cảm (8.3) | Access-log cho xem hồ sơ HV/lương (bảng riêng, TTL) | M | cân nhắc volume |

## 4. Mục ✅ đã có — hành động: DEMO, không build

Hồ sơ HV + trạng thái + bảo lưu/chuyển lớp · tìm kiếm lọc · phân công GV/phòng/ca · điểm danh thủ công + học bù · giáo trình/bài tập/thi online · sổ liên lạc (nhận xét + ảnh) · báo cáo định kỳ + sau khóa · nhắc nợ tự động · voucher · 1 PH nhiều con · export Excel/PDF · audit log.
→ PM tổ chức **buổi demo nghiệm thu hiện trạng** với khách để loại các mục này khỏi scope build mới.

## 5. Model mới tổng hợp (nhóm Must/Should)

| Model | Phục vụ |
|---|---|
| `StudentConsent` | M3 |
| `RewardItem`, `RewardRedemption` | S2 |
| (mở rộng) `Student` field an toàn PH sửa được | S3 |
| `TranscriptShare` | C3 |
| Không model mới | M1 (logic), M2 (query), S1 (env/template), S4–S6 (aggregate) |

## 6. Track R&D (không cam kết deadline — lập doc nghiên cứu riêng khi khởi động)

> Khách đã rút gọn scope (chốt 2026-06-05): **loại toàn bộ hạng mục AI** (AI camera, sức khỏe, chatbot, AI gợi ý lộ trình/khóa học, AI phân tích/dự đoán) và NFT/Blockchain. Nhu cầu "dự báo/khuyến nghị" còn lại chuyển thành **rule-based** (mở rộng RiskAlert + trend dashboard) — nằm trong backlog thường, không phải R&D.

| Chủ đề | Ghi chú định hướng |
|---|---|
| Marketplace khóa học online (9.1) | Cần PRD riêng |
| Multi-tenant đóng gói cho đối tác (9.2) | Quyết định kiến trúc lớn — xem đề xuất `Document/2-architecture-design/13-architecture-redesign.md` |
