# R7-08 — Học bù LIÊN CƠ SỞ + 5 chỉ số tiến độ + 6 nhãn điểm danh

**ID** R7-08 · **PR** 2 (PR1 suggest+confirm+audit, PR2 chỉ số+nhãn) · **Ưu tiên** P0 (demo D4) · **Ước lượng** L · **Phụ thuộc** R7-07 · **Trạng thái** TODO · **US** US-MKP-1..3 · **SRS** §17, §28.9 · **QĐ** O2 (liên cơ sở thắng) + XĐ-8 PA2

## 1. Mục tiêu & bối cảnh
`lib/makeup/service.ts` đã có flow PENDING→SCHEDULED→COMPLETED + sync attendance, lọc courseId + lesson order nhưng KHÔNG lọc/không sort theo cơ sở (vô tình mở, không kiểm soát). QĐ-O2 chốt: liên cơ sở mặc định, ưu tiên cơ sở con đang học, đọc chéo qua exception scopedDb + audit. XĐ-8 PA2: enum giữ theo Doc 15, 6 nhãn hiển thị map từ 3 nguồn.

## 2. Phạm vi
- **In:** nâng `suggestMakeupSessions`: tiêu chí đủ (cùng khóa + cùng nội dung/lesson + chưa diễn ra + còn sức chứa + không trùng lịch HV + không vượt tiến độ) + **sort: cơ sở nhà trước → lịch gần nhất**; khai báo **scopedDb exception whitelist** cho luồng makeup (đọc session/lớp cơ sở khác); audit mỗi lượt xếp bù chéo cơ sở; GV lớp đích thấy HS bù đúng buổi đó; helper 5 chỉ số (Vitest) + UI portal; 6 nhãn điểm danh (PA2: status + makeupStatus + sessionStatus → label registry); migration enum `ABSENT_EXCUSED/ABSENT_UNEXCUSED` **2-phase bước A** (thêm giá trị, map dần — Doc 15 §6.3).
- **Out:** đổi flow yêu cầu/duyệt (ParentRequest.MAKEUP giữ) · drop enum cũ (phase sau).

## 3. Thiết kế kỹ thuật
- `suggestMakeupSessions(need)`: WHERE hiện có + `capacityOk` + `notConflict(studentSchedule)` + giữ `lesson.order ≤ missedOrder`; bỏ giới hạn center NHƯNG đi qua `scopedDb.withMakeupException(actor)` — exception chỉ cấp cho service makeup (function-scoped, không leak query khác); sort `[isHomeCenter desc, date asc]`.
- `scheduleMakeup` khi `makeupClass.centerId ≠ student.centerId` → AuditLog `MAKEUP_CROSS_CENTER {studentId, fromCenterId, toCenterId, sessionId, approvedById}` (reason = requestId).
- GV lớp đích: danh sách điểm danh buổi đó hiển thị HS bù (badge "Học bù từ CS1") — chỉ buổi được xếp, không thấy hồ sơ đầy đủ của HS cơ sở khác (T5 hẹp).
- Helper `attendanceSummary(enrollmentId)` → {total, attended(+made-up), absent, needMakeup, madeUp} — buổi bù không tăng total; Vitest bảng biên.
- Nhãn: registry `attendanceLabel(status, makeupStatus, session.status)` → 6 nhãn SRS; buổi CANCELLED → "Buổi học bị hủy", không tính vắng.

## 4. Acceptance Criteria
- AC1: Đề xuất đúng 6 tiêu chí; buổi vượt tiến độ/đầy chỗ/trùng lịch HS bị loại.
- AC2: Sort cơ sở nhà trước rồi lịch gần nhất (case cùng-cơ-sở-xa-ngày vs khác-cơ-sở-gần-ngày).
- AC3: PH gửi yêu cầu → CRM/QL xác nhận → xếp bù chéo cơ sở thành công + AuditLog đủ trường.
- AC4: GV CS2 thấy HS bù trong đúng 1 buổi; không truy cập hồ sơ khác của HS CS1.
- AC5: Điểm danh "Học bù" → sync lớp gốc (MADE_UP) + 5 chỉ số portal đúng; buổi hủy hiện nhãn đúng, không tính vắng.
- AC6: Mọi query ngoài luồng makeup vẫn cách ly cơ sở (exception không leak).

## 5. Files dự kiến
`lib/makeup/service.ts` (+test) · `lib/db-scope.ts` (withMakeupException) · `lib/attendance/summary.ts` (+test) · `lib/labels.ts` (6 nhãn) · migration `add_absent_excused_unexcused_enum` (additive) · portal `/portal/lich-hoc`+dashboard · `app/(admin)/admin/attendance` (badge học bù) · `tests/e2e/r7/makeup-cross-center.spec.ts`.

## 6. Edge cases & xử lý lỗi
2 PH cùng giành 1 chỗ cuối → tx check capacity lúc confirm (người sau fail lịch sự) · HS bù xong nhưng lớp gốc dạy lại đúng bài đó (đổi lịch) → giữ MADE_UP, không double-count · yêu cầu bù cho buổi tương lai (chưa vắng) → chặn (chỉ ABSENT/cần bù) · cross-center bị thu hồi (lớp đích hủy buổi) → MakeupNeed quay về PENDING + notify PH.

## 7. Rollback / Feature flag
Setting `makeup.crossCenterEnabled` (default true theo QĐ-O2) — tắt = quay về lọc cùng cơ sở (1 dòng filter), dữ liệu không đổi.

## 8. Test plan
| Case ID | Nhóm | B/E | Bước | Kết quả | Tool |
|---|---|---|---|---|---|
| R7-08-C1 | T1 | B | seed 5 buổi ứng viên (1 vượt tiến độ, 1 đầy, 1 trùng lịch) | chỉ 2 hợp lệ | Vitest |
| R7-08-C2 | T3 | B | CS1 ngày +7 vs CS2 ngày +2 | thứ tự: CS1 trước, trong CS theo ngày | Vitest |
| R7-08-C3 | T9 | B | duyệt bù CS1→CS2 | AuditLog MAKEUP_CROSS_CENTER đủ trường | Playwright |
| R7-08-C4 | T5 | B | GV@CS2 mở buổi có HS bù; thử mở hồ sơ HS CS1 | thấy trong buổi; hồ sơ → 404 | Playwright |
| R7-08-C5 | T1 | B | điểm danh bù → portal | MADE_UP sync + 5 chỉ số đúng (48/22/3/1/2 như US-MKP-2) | Playwright+Vitest |
| R7-08-C6 | T5 | B | 6 góc T5 cho query lead/order sau khi thêm exception | vẫn cách ly | Playwright |
| R7-08-C7 | T3 | B | buổi CANCELLED | nhãn "Buổi học bị hủy", không tính vắng | Vitest |
| R7-08-C8 | T6 | E | 2 confirm song song chỗ cuối | 1 thành công, 1 fail rõ ràng | Vitest |

## 9. Test data
HS@CS1 vắng buổi "Bài 5"; lớp cùng khóa: CS1 (+7d), CS2 (+2d, còn 1 chỗ), CS2 (đầy), CS1 (bài 7 — vượt tiến độ); PH + QL + GV@CS2.

## 10. RTM
AC1↔C1 · AC2↔C2 · AC3↔C3 · AC4↔C4 · AC5↔C5,C7 · AC6↔C6 · race↔C8.

## 11. DoD
DoD chuẩn + demo D4 + cập nhật `docs/makeup-flow.md` (liên cơ sở) + BA #04 đã trỏ sang ticket này.
