# R7-15 — Học bạ ReportCard: nhập → duyệt → phát hành

**ID** R7-15 · **PR** 2 (PR1 model+nhập, PR2 duyệt+phát hành+portal) · **Ưu tiên** P1 · **Ước lượng** L · **Phụ thuộc** R7-08 (summary), R7-13/14 (kết quả bài tập) · **Trạng thái** TODO · **US** US-RC-1..2 · **SRS** §20, §28.8 · **QĐ** 23 SRS

## 1. Mục tiêu & bối cảnh
Hiện chỉ có PDF transcript/progress-report + `ProgressReportLog` (snapshot log) — không có học bạ cấu trúc với vòng duyệt. SRS: 1 học bạ/Enrollment, GV nhập, QL/Đào tạo duyệt, CHỈ bản phát hành hiện cho PH.

## 2. Phạm vi
- **In:** model ReportCard + tiêu chí năng lực theo Course; số liệu tự đổ (tham gia/vắng/bù từ attendanceSummary; kết quả bài tập từ ExamAttempt); GV nhập nhận xét giai đoạn + tổng kết + chấm năng lực; máy trạng thái DRAFT→PENDING_REVIEW→PUBLISHED (+thu hồi REVISOKE→sửa→phát hành lại); portal chỉ thấy PUBLISHED; PDF tái dùng lib/pdf; notify khi phát hành.
- **Out:** học bạ chia sẻ ngoài (share-link — backlog) · chữ ký số.

## 3. Thiết kế kỹ thuật
- `ReportCard{id, enrollmentId unique, status(DRAFT/PENDING_REVIEW/PUBLISHED/RECALLED), periodComments Json[], finalComment?, completionStatus, teacherId, reviewedById?, publishedById?, publishedAt?, centerId}`.
- `ReportCardCriterion{id, courseId, name, order, active}` (Đào tạo cấu hình per khóa) + `ReportCardScore{reportCardId, criterionId, level 1..4, note?}` — tái dùng thang 4 mức của StudentSkillAssessment.
- Số liệu động (tỷ lệ tham gia, vắng, bù, điểm TB bài tập) KHÔNG lưu cứng lúc nhập — snapshot lúc PHÁT HÀNH (đóng băng số liệu trên bản phát hành, Json `publishedSnapshot`).
- Transitions: GV (lớp của enrollment) DRAFT→PENDING_REVIEW; QL/Đào tạo PENDING_REVIEW→PUBLISHED (hoặc trả lại DRAFT + lý do); PUBLISHED→RECALLED (reason + audit) → sửa → PENDING_REVIEW lại. Mỗi transition AuditLog. Event `reportcard.published` → notify PH.

## 4. Acceptance Criteria
- AC1: Mở học bạ Enrollment → số liệu tự đổ đúng helper (Vitest đối chiếu); GV nhập nhận xét + chấm tiêu chí theo Course.
- AC2: HV học 2 khóa → 2 học bạ độc lập.
- AC3: DRAFT/PENDING/RECALLED → PH không thấy; PUBLISHED → PH thấy + notify + tải PDF; số liệu trên bản phát hành = snapshot lúc phát hành.
- AC4: Thu hồi cần reason; vòng sửa→phát hành lại có log đầy đủ; transition sai (DRAFT→PUBLISHED trực tiếp bởi GV) bị chặn.
- AC5: GV chỉ nhập học bạ lớp mình; QL cơ sở chỉ duyệt học bạ cơ sở mình (T5).

## 5. Files dự kiến
migration `add_report_card` · `lib/lms/report-card.ts` (+test snapshot/transition) · `app/(admin)/admin/report-cards/*` · portal `/portal/hoc-ba` (đổi nguồn sang ReportCard PUBLISHED; transcript PDF cũ giữ link) · `tests/e2e/r7/report-card.spec.ts`.

## 6. Edge cases & xử lý lỗi
Enrollment chưa kết thúc → cho nhập (học bạ giữa kỳ qua periodComments), phát hành cuối khóa · đổi GV giữa khóa → GV hiện tại nhập tiếp (history giữ) · course chưa có criterion → cảnh báo Đào tạo cấu hình trước · RECALLED khi PH đang xem → lần tải kế tiếp 404 bản cũ.

## 7. Rollback / Feature flag
Bảng độc lập; portal fallback transcript cũ nếu chưa có ReportCard PUBLISHED (2-phase).

## 8. Test plan
| Case ID | Nhóm | B/E | Bước | Kết quả | Tool |
|---|---|---|---|---|---|
| R7-15-C1 | T1 | B | mở học bạ | số liệu khớp helper (case 48/22/3/1/2) | Vitest |
| R7-15-C2 | T1 | B | HV 2 khóa | 2 học bạ riêng | Playwright |
| R7-15-C3 | T4 | B | PH xem khi DRAFT/PENDING | không thấy; PUBLISHED → thấy + PDF | Playwright |
| R7-15-C4 | T7/T9 | B | GV publish trực tiếp; QL publish; recall không reason | chặn; OK + audit; chặn | Playwright |
| R7-15-C5 | T12 | B | đổi điểm bài tập SAU phát hành | bản phát hành không đổi (snapshot) | Vitest |
| R7-15-C6 | T5 | B | QL@CS2 duyệt học bạ CS1 | chặn | Playwright |

## 9. Test data
Enrollment hoàn thành 22/48 buổi + 5 bài tập; criterion 5 tiêu chí cho course; GV/QL/PH.

## 10. RTM
AC1↔C1 · AC2↔C2 · AC3↔C3,C5 · AC4↔C4 · AC5↔C6.

## 11. DoD
DoD chuẩn + demo D10.
