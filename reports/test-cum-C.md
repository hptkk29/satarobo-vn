# Test Cụm C (C1–C6)

> Dùng dữ liệu `ZZTEST_*`. KHÔNG đụng data thật. KHÔNG gửi email/SMS/API thật.

## C1 — Chuyển lớp / cơ sở (StudentTransferRequest + StudentCenterHistory)
1. HV `ZZTEST_*` đang học lớp A (khoá X, đã dạy 5 bài).
2. `/admin/chuyen-lop`: "Tìm lớp đích" → chỉ hiện lớp cùng khoá X có ≤5 bài; lớp dạy 7 bài bị loại (vượt buổi).
3. Lớp đích còn chỗ → PENDING → Duyệt → enrollment cũ `TRANSFERRED`, enrollment mới `STUDYING`;
   nếu khác cơ sở: `Student.centerId` đổi + 2 dòng `StudentCenterHistory` (đóng cũ + mở mới); `logStudentAudit`.
4. Lớp đích hết chỗ / không có lớp phù hợp → `WAITLISTED` (không lỗi).

## C2 — Bàn giao lead (LeadAssignmentHistory)
1. Tạo vài lead `ZZTEST_*` gán sale A (nhiều trạng thái + 1 LeadTask OPEN).
2. `/admin/ban-giao-lead`: chọn A → B, lọc onlyActive → "Xem trước" đúng số lead chưa đóng.
3. "Thực hiện" → lead đổi `assignedToId` sang B, `LeadAssignmentHistory` + `LeadAuditLog` ASSIGN ghi,
   LeadTask OPEN chuyển sang B. **Tài khoản sale A không thay đổi.**

## C3 — Rubric chấm bài (SubmissionRubricScore)
1. HV `ZZTEST_*` nộp 1 bài.
2. GV mở **Rubric** trên submission-row → lưu thiếu nhận xét → bị chặn.
3. Chấm đủ 6 tiêu chí + nhận xét → lưu; điểm quy đổi 0-10 đúng (`rubricToScore`).
4. Tick gửi email → EmailQueue +1 PENDING (không gửi).
5. Phụ huynh `/portal/bai-tap/[id]`: thấy bảng rubric + nhận xét khi đã chấm (chỉ con đang chọn).

## C4 — SataCoin (sổ cái bất biến)
1. Tạo rule `ATTENDANCE +5`. Cấp 10 coin cho HV → số dư 10. Trừ 3 → 7. Trừ 100 → bị chặn (số dư không đủ).
2. Đảo giao dịch +10 → REVERSAL −10 ghi (không sửa giao dịch gốc); số dư giảm. Đảo lại lần nữa → bị chặn (đã đảo).
3. Portal `/portal/satacoin`: số dư + lịch sử đúng. KHÔNG blockchain.

## C5 — Zalo OA/ZNS adapter (skeleton)
1. Không set env Zalo → `sendZaloNotification({ toPhone, fallbackEmail })` → `ZaloMessageLog` SKIPPED,
   EmailQueue +1 PENDING, hàm trả `ok:true` (tắt an toàn, không phá luồng).
2. Set `ZALO_APP_ID`+`ZALO_OA_ACCESS_TOKEN` (không `ZALO_LIVE`) → SENT (mô phỏng), không fallback.
3. `/admin/tich-hop`: trạng thái Zalo (chưa cấu hình / mô phỏng / live) + log đúng.

## C6 — MISA AMIS sync (skeleton)
1. Mặc định tắt → `/admin/tich-hop` "Chạy thử" → `IntegrationLog` SKIPPED ("MISA sync đang tắt").
2. Bật sync (chưa credential) → Chạy thử → SKIPPED ("Thiếu credential MISA"), **không push thật**.
3. Set env MISA_* (không `MISA_LIVE`) + bật → Chạy thử → SUCCESS mô phỏng (`responsePayload.simulated=true`).
4. Trạng thái + log hiển thị đúng. Toggle/Chạy thử gate `settings:edit` (SUPER_ADMIN).

## Kết quả kỹ thuật
- `pnpm typecheck` PASS · `pnpm lint` PASS · `pnpm build` PASS (mỗi PR).
- 6 commit riêng (C1→C6). Migration additive đã apply. KHÔNG blockchain, KHÔNG gửi thật khi thiếu credential.
