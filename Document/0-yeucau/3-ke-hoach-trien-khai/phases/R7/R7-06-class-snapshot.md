# R7-06 — ClassProgramSnapshot + guard curriculum + điều chỉnh từng buổi

**ID** R7-06 · **PR** 2 (PR1 snapshot+guard, PR2 điều chỉnh buổi+notify) · **Ưu tiên** P1 · **Ước lượng** L · **Phụ thuộc** R7-00 · **Trạng thái** TODO · **US** US-CLASS-1..3, US-PROG-3 · **SRS** §14, §11.7, §28.6 · **Doc 15** §6.3

## 1. Mục tiêu & bối cảnh
Lớp hiện tham chiếu curriculum "sống" (generate.ts gắn lessonId trực tiếp từ bản ACTIVE mới nhất) — sửa giáo trình ảnh hưởng lớp đang chạy. Doc 15 §6.3 + SRS §14.6 cùng chốt: lớp pin 1 curriculum version. Đổi lịch lặp đã có preview/apply; thiếu: guard publish, audit per-buổi, notify.

## 2. Phạm vi
- **In:** pin `curriculumId+version` trên Class lúc tạo (snapshot); kế hoạch buổi theo lớp cho phép reorder/ghi chú không sửa Program gốc; nhận version mới = thao tác chủ động + reason + audit; guard "course chưa có curriculum xuất bản → không kích hoạt lớp"; điều chỉnh từng buổi đủ thao tác + history + notify; đổi lịch lặp bổ sung bảo toàn tổng buổi + notify.
- **Out:** resize giáo trình (R7-10) · state machine buổi (R7-07) · SCORM pin (R7-11 dùng cơ chế này).

## 3. Thiết kế kỹ thuật
- Class + `curriculumId`, `curriculumVersion` (snapshot lúc tạo — additive; class cũ null → helper fallback hành vi cũ, backfill dần).
- `ClassSessionPlan{id, classId, seq, lessonId, customTitle?, note?, order}` — sao chép logic từ Lesson của version pin khi tạo lớp; ClassSession trỏ plan (additive cột `planId?`; `lessonId` cũ giữ 2-phase). Reorder/ghi chú sửa plan, không đụng Lesson gốc.
- Action `adoptCurriculumVersion(classId, version, reason)` — can `classes:manage` + AuditLog; chỉ áp cho buổi CHƯA diễn ra (re-map plan), buổi đã COMPLETED giữ nguyên.
- Guard kích hoạt lớp: course phải có curriculum PUBLISHED/ACTIVE (dùng helper R7-03/2.F).
- Điều chỉnh buổi: đổi ngày/giờ/GV/phòng, đánh dấu nghỉ lễ, hủy buổi (status CANCELLED — không xóa), tạo buổi bù cuối lịch (bảo toàn tổng buổi); mỗi thay đổi ghi AuditLog (before/after) + event `class.session_changed` → notify PH/GV nếu ảnh hưởng lịch.
- Đổi lịch lặp (reschedule hiện có): thêm guard không đụng buổi COMPLETED/locked + bảo toàn tổng số buổi + emit notify.

## 4. Acceptance Criteria
- AC1: Tạo lớp khóa SATA 3 (curriculum v2) → Class pin v2 + ClassSessionPlan đủ buổi + lịch sinh đúng (giữ hành vi generate.ts).
- AC2: Curriculum lên v3 → lớp cũ giữ v2; adopt v3 cần reason + audit, buổi đã học không đổi.
- AC3: Course chưa publish curriculum → kích hoạt lớp bị chặn.
- AC4: Reorder bài/ghi chú trong lớp không thay đổi Lesson gốc (kiểm tra DB).
- AC5: Hủy buổi → CANCELLED + buổi bù sinh cuối lịch, tổng buổi bảo toàn; mọi điều chỉnh có history + notify bên liên quan.
- AC6: Đổi lịch lặp: preview đúng, buổi COMPLETED không đổi, PH/GV nhận thông báo.

## 5. Files dự kiến
schema migration `add_class_curriculum_pin_session_plan` · `lib/classes/{snapshot.ts,adjust.ts}` (+tests) · sửa `lib/classes/generate.ts` · `app/(admin)/admin/classes/*` (tạo lớp, tab chương trình, chỉnh buổi) · `tests/e2e/r7/class-snapshot.spec.ts`.

## 6. Edge cases & xử lý lỗi
Adopt version khi lớp đã học quá nửa → chỉ re-map phần còn lại, cảnh báo lệch nội dung · curriculum v2 ít buổi hơn số buổi còn lại → cảnh báo + yêu cầu xử lý tay · hủy buổi cuối cùng → buổi bù sau ngày kết thúc dự kiến (cập nhật projectEndDate cho renewal R5) · class cũ (pin null) → mọi action mới hoạt động fallback, không crash.

## 7. Rollback / Feature flag
Cột pin null = hành vi cũ → rollback tự nhiên. Plan table độc lập.

## 8. Test plan
| Case ID | Nhóm | B/E | Bước | Kết quả | Tool |
|---|---|---|---|---|---|
| R7-06-C1 | T1 | B | tạo lớp | pin version + plan + lịch đúng | Playwright |
| R7-06-C2 | T7/T9 | B | publish v3 → check lớp; adopt v3 | giữ v2; adopt cần reason + audit + buổi done nguyên | Playwright |
| R7-06-C3 | T2 | B | kích hoạt lớp course chưa publish | chặn | Playwright |
| R7-06-C4 | T1 | B | reorder + note trong lớp | Lesson gốc không đổi | Vitest |
| R7-06-C5 | T7/T9 | B | hủy buổi giữa kỳ | CANCELLED + bù cuối + tổng bảo toàn + audit + notify | Playwright |
| R7-06-C6 | T12 | B | reschedule lớp có buổi COMPLETED | buổi done giữ nguyên; preview khớp apply | Playwright |
| R7-06-C7 | T5 | E | QL@CS2 chỉnh buổi lớp CS1 | chặn | Playwright |

## 9. Test data
Curriculum v2 (12 buổi) + v3; lớp CS1 đã COMPLETED 3 buổi; Holiday 1 ngày.

## 10. RTM
AC1↔C1 · AC2↔C2 · AC3↔C3 · AC4↔C4 · AC5↔C5 · AC6↔C6 · cách ly↔C7.

## 11. DoD
DoD chuẩn + demo D10 phần pin version (kết hợp R7-11 cho SCORM).
