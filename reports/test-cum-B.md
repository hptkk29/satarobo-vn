# Test Cụm B (B1–B5)

> Dùng dữ liệu `ZZTEST_*`. KHÔNG đụng data thật. KHÔNG gửi email thật (EmailQueue chỉ enqueue PENDING).

## B1 — Học bù (MakeupNeed)
1. Điểm danh 1 buổi cho HV `ZZTEST_*` với trạng thái cần học bù (NEEDS_MAKEUP) hoặc vắng → `MakeupNeed` tạo (idempotent).
2. Admin `/admin/hoc-bu`: gợi ý buổi học bù (cùng khoá + bài, không vượt tiến độ); lên lịch → hoàn tất.
3. Hoàn tất học bù → `Attendance.makeupStatus = MADE_UP` (buổi được tính lại đúng).
4. Portal `/portal/yeu-cau`: phụ huynh thấy trạng thái học bù của con đang chọn.

## B2 — Cảnh báo rủi ro + chăm sóc (StudentRiskAlert/StudentCareTask)
1. Tạo 2 buổi vắng liên tiếp (ABSENT/EXCUSED, chưa học bù) cho HV → `evaluateAbsenceRisk` raise alert OPEN (idempotent theo type).
2. Alert sinh `StudentCareTask` gán SALES_CSM cơ sở.
3. Dashboard "Cần xử lý" + chuông thông báo hiển thị nhóm `student_risk`/`student_care` (qua `lib/pending-tasks.ts`).
4. `/admin/canh-bao-rui-ro`: resolve/escalate alert; `/admin/cham-soc-hv`: hoàn tất care task.

## B3 — Khảo sát / NPS (Survey/SurveyResponse)
1. Admin `/khao-sat` tạo khảo sát NPS (END_COURSE) → bật.
2. Phụ huynh `/portal/khao-sat` trả lời NPS 0-10 cho con đang chọn (chống trả lời trùng).
3. Response tự gắn center/class/teacher/csm (từ enrollment active + care task).
4. Dashboard NPS: tổng + theo cơ sở, phân loại promoter/passive/detractor đúng (`computeNps`, có unit test PASS).

## B4 — Hoàn thành khoá + chứng chỉ (CourseCompletion)
1. `/admin/hoan-thanh-khoa`: chọn HV + khoá, nhập đánh giá GV (bắt buộc) + xếp loại → đánh dấu hoàn thành.
2. Kiểm: `CourseCompletion` upsert, `certificateCode` sinh (CERT-YYMMDD-XXXX), care task tái tục SALES_CSM,
   EmailQueue 1 bản PENDING (không gửi), `nextCourseId` = khoá có khoá hiện tại làm tiên quyết.
3. Tải chứng chỉ `/api/admin/reports/certificate?code=...` → PDF tên HV + khoá.
4. Đánh dấu lại cùng HV/khoá → upsert (không nhân đôi).

## B5 — Học bạ (StudentTranscript, không bảng mới)
1. HV `ZZTEST_*` có ≥1 enrollment + 1 completion + vài skill assessment.
2. Portal `/portal/hoc-ba`: phụ huynh thấy đúng học bạ con đang chọn; đổi con → đổi dữ liệu (không lộ con khác).
3. Tải PDF portal `/api/portal/transcript` → khớp on-screen.
4. Admin `/admin/hoc-ba?studentId=`: xem + PDF. CENTER_MANAGER thử HV cơ sở khác → "ngoài phạm vi cơ sở".

## Kết quả kỹ thuật
- `pnpm typecheck` PASS · `pnpm lint` PASS · `pnpm build` PASS (mỗi PR).
- 5 commit riêng (B1→B5). Migration additive đã apply.
