# R7-07 — Gán học viên vào lớp + state machine buổi học "Hoàn tất buổi"

**ID** R7-07 · **PR** 2 (PR1 gán học viên, PR2 session lifecycle) · **Ưu tiên** P1 · **Ước lượng** L · **Phụ thuộc** R7-06 · **Trạng thái** TODO · **US** US-CLASS-4, US-SESS-1..2 · **SRS** §15–16, §28.6–28.7 · **Doc 15** §6.3 "Hoàn tất buổi"

## 1. Mục tiêu & bối cảnh
Gán học viên hiện chỉ check sức chứa, dropdown chưa lọc đúng rule §15.1, không có bulk-add. Buổi học hiện là checklist 9 mục rời (lib/lms/checklist.ts) — chưa có cổng "Hoàn tất buổi" kích hoạt giao bài/tiến độ/notify (nền cho R7-14).

## 2. Phạm vi
- **In:** dropdown filter chuẩn (đúng khóa + đúng cơ sở + trạng thái hợp lệ + chưa thuộc lớp active + không PAUSED); "Thêm toàn bộ" theo bộ lọc + xác nhận vượt sức chứa; hậu-gán (trạng thái, tiến độ, lịch portal, notify); state machine buổi: SCHEDULED→IN_PROGRESS→COMPLETED(tx) với dữ liệu thực tế (GV/giờ/phòng thực dạy — Doc 15 plannedLessonId/actualLessonId tinh thần); nhận xét lớp per buổi; event `session.taught` (R7-14 consume).
- **Out:** auto giao bài (R7-14) · điểm danh core (đã có, chỉ nối vào lifecycle) · học bù (R7-08).

## 3. Thiết kế kỹ thuật
- Query dropdown: `Enrollment WHERE courseId=class.courseId AND centerId=class.centerId AND status IN ('CONFIRMED','PENDING_PLACEMENT') AND khôngCóClassActive AND status≠PAUSED` (scopedDb). Bulk: action `assignAllFiltered(classId, filterHash)` — đếm, cảnh báo capacity, override cần can `classes:override-capacity` + audit.
- Hậu-gán trong tx: Enrollment.status='Đã xếp lớp' + classId; sau commit event `enrollment.assigned` → sinh tiến độ + notify PH.
- ClassSession thêm `actualTeacherId?, actualRoomId?, actualStartAt?, actualEndAt?, classComment?, completedAt?, completedById?`. Action `completeSession(sessionId)`: yêu cầu điểm danh đã lưu (cảnh báo nếu thiếu, bắt confirm); tx set COMPLETED + dữ liệu thực tế; sau commit emit `session.taught` (idempotent theo sessionId).
- Nhận xét lớp: `classComment` mọi PH lớp thấy; nhận xét HV (StudentSessionFeedback hiện có) chỉ PH của HV đó.

## 4. Acceptance Criteria
- AC1: Dropdown chỉ hiện Enrollment hợp lệ theo 5 điều kiện; enrollment CS khác/khóa khác/PAUSED/đã có lớp → ẩn.
- AC2: "Thêm toàn bộ" thêm đúng danh sách sau lọc; vượt sức chứa → cảnh báo + cần quyền override (audit).
- AC3: Sau gán: trạng thái đổi + lịch hiện portal + PH nhận notify + tiến độ sinh đủ buổi.
- AC4: Hoàn tất buổi ghi GV/giờ/phòng thực tế; thiếu điểm danh → cảnh báo bắt confirm; bấm 2 lần → idempotent.
- AC5: Nhận xét lớp hiển thị đúng phạm vi (lớp vs từng HV).

## 5. Files dự kiến
schema migration `add_session_actuals_class_comment` · `lib/lms/{assign.ts,session-lifecycle.ts}` (+tests) · `app/(admin)/admin/classes/[id]/{students,session}/*` · `tests/e2e/r7/session-lifecycle.spec.ts`.

## 6. Edge cases & xử lý lỗi
Enrollment được gán đồng thời bởi 2 người → unique (enrollmentId, classId active) + tx · hoàn tất buổi quá khứ chưa đóng (GV quên) → cho phép kèm cảnh báo ngày · gỡ HV khỏi lớp sau khi gán → tiến độ buổi tương lai xóa, buổi đã học giữ · completeSession trên buổi CANCELLED → chặn.

## 7. Rollback / Feature flag
Lifecycle song song checklist cũ (2-phase) — flag UI `SESSION_LIFECYCLE_V2`; OFF → checklist cũ vẫn dùng.

## 8. Test plan
| Case ID | Nhóm | B/E | Bước | Kết quả | Tool |
|---|---|---|---|---|---|
| R7-07-C1 | T1/T5 | B | mở dropdown với seed hỗn hợp | chỉ enrollment hợp lệ; CS khác ẩn | Playwright |
| R7-07-C2 | T3 | B | Thêm toàn bộ 12 vào lớp còn 10 chỗ | cảnh báo; override → OK + audit | Playwright |
| R7-07-C3 | T1 | B | gán xong → portal PH | lịch hiện + notify + trạng thái Đã xếp lớp | Playwright |
| R7-07-C4 | T1/T6 | B | completeSession ×2 | dữ liệu thực tế lưu; lần 2 idempotent; event 1 lần | Vitest |
| R7-07-C5 | T2 | B | hoàn tất khi chưa điểm danh | cảnh báo bắt confirm | Playwright |
| R7-07-C6 | T5 | B | PH con A đọc nhận xét HV con B cùng lớp | không thấy; nhận xét lớp thấy | Playwright |
| R7-07-C7 | T7 | E | completeSession buổi CANCELLED | chặn | Vitest |

## 9. Test data
Lớp CS1 capacity 10; 12 enrollment hợp lệ + 3 không hợp lệ (CS2/PAUSED/đã có lớp); GV + 2 PH.

## 10. RTM
AC1↔C1 · AC2↔C2 · AC3↔C3 · AC4↔C4,C5,C7 · AC5↔C6.

## 11. DoD
DoD chuẩn + event `session.taught` có consumer test giả (chuẩn bị cho R7-14).
