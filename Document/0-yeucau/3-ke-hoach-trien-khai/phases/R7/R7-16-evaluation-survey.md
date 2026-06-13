# R7-16 — Form builder 4 loại câu hỏi + Đánh giá GV (học viên) + Khảo sát trung tâm (PH)

**ID** R7-16 · **PR** 3 (PR1 form builder, PR2 đợt đánh giá GV, PR3 khảo sát trung tâm + tổng hợp) · **Ưu tiên** P1 · **Ước lượng** XL · **Phụ thuộc** R7-09 · **Trạng thái** TODO · **US** US-EVAL-1..3 · **SRS** §21, §28.8 · **QĐ** O3 (4 loại câu hỏi), 24/25/27 SRS

## 1. Mục tiêu & bối cảnh
Hiện không có student→teacher evaluation (TeacherReview = nội bộ; ParentFeedback = PH→TT; Survey NPS cứng 3 type). SRS chốt: HỌC VIÊN đánh giá GV (trong profile con), PH khảo sát trung tâm — cả hai dùng form builder Admin cấu hình, giới hạn 4 loại câu hỏi (QĐ-O3): STAR_RATING (1–5 sao) / RADIO / CHECKBOX / TEXTBOX.

## 2. Phạm vi
- **In:** form builder giới hạn (4 loại, options động, order, required); EvaluationRound (scope TEACHER_EVAL theo lớp/khóa, CENTER_SURVEY theo cơ sở; thời gian mở/đóng); portal: profile HV đánh giá GV đang/đã dạy (chống trùng); PH làm khảo sát cơ sở con đang học (đủ điều kiện); phân quyền xem kết quả (GV: tổng hợp nếu được quyền; QL/Admin: chi tiết); tổng hợp vào báo cáo (R7-17 tiêu thụ); cập nhật wording IR-2 BA #04 (đã ghi 12/06).
- **Out:** kéo-thả/conditional logic (cấm — IR-2) · sentiment/AI phân tích (ĐÃ LOẠI) · khảo sát ẩn danh hoàn toàn (định danh theo đợt để chống trùng; hiển thị ẩn danh hóa cho GV).

## 3. Thiết kế kỹ thuật
- `EvalForm{id, title, scope(TEACHER_EVAL/CENTER_SURVEY), status(DRAFT/ACTIVE/ARCHIVED), createdById}` · `EvalQuestion{id, formId, type(STAR_RATING/RADIO/CHECKBOX/TEXTBOX), label, options Json?, required, order}` · `EvaluationRound{id, formId, scope, name, centerId?, courseId?, opensAt, closesAt, status}` · `EvalResponse{id, roundId, enrollmentId?, teacherId?, parentUserId?, studentId?, submittedAt}` + unique `(roundId, enrollmentId, teacherId)` cho TEACHER_EVAL, `(roundId, parentUserId)` cho CENTER_SURVEY · `EvalAnswer{responseId, questionId, valueNumber?, valueOptions Json?, valueText?}`.
- Quyết định kỹ thuật TBD-2 (BA#05): bảng Eval* MỚI (không bẻ Survey NPS hiện có — Survey giữ cho NPS milestone cũ); ghi chú so sánh trong PR.
- Form có response → cấm sửa câu hỏi/option (chỉ ARCHIVED + clone đợt mới).
- Eligibility: TEACHER_EVAL — enrollment active/completed trong lớp có GV đó thuộc round scope; CENTER_SURVEY — PH có ≥1 con đang học centerId của round. UI trẻ em: STAR_RATING render emoji/sao to (portal HV).
- Kết quả: view tổng hợp (avg sao, phân bố option, list text) — GV cần can `evaluations:view-aggregate` (ẩn danh tính HV); QL/Admin can `evaluations:view-detail`.

## 4. Acceptance Criteria
- AC1: Admin dựng form 4 câu (1 sao + 1 radio + 1 checkbox + 1 textbox) → render đúng portal; không tồn tại loại câu hỏi thứ 5 (schema enum đóng).
- AC2: Form đã có response → sửa câu hỏi bị chặn; clone thành form/đợt mới OK.
- AC3: Profile HV chỉ thấy GV đang/đã dạy mình trong đợt mở; gửi lần 2 cùng (đợt×enrollment×GV) → chặn.
- AC4: GV xem tổng hợp (không thấy tên HV) khi được cấp quyền; không quyền → không thấy gì; QL/Admin xem chi tiết.
- AC5: Khảo sát cơ sở chỉ tới PH đủ điều kiện (con đang học CS round); PH cơ sở khác không thấy; chống trùng theo đợt.
- AC6: Kết quả tổng hợp được (API/aggregate) cho báo cáo trung tâm + hồ sơ chất lượng GV.

## 5. Files dự kiến
migration `add_eval_forms_rounds` · `lib/eval/{forms.ts,rounds.ts,eligibility.ts,aggregate.ts}` (+tests) · `app/(admin)/admin/evaluations/*` (builder, rounds, kết quả) · portal `/portal/danh-gia-gv` (profile HV) + `/portal/khao-sat` (round mới) · `tests/e2e/r7/evaluation-survey.spec.ts`.

## 6. Edge cases & xử lý lỗi
HV có 2 GV trong khóa (đổi GV giữa kỳ) → đánh giá được cả 2 (mỗi GV 1 response/đợt) · round đóng giữa lúc đang điền → submit fail lịch sự + giữ draft client · CHECKBOX 0 lựa chọn nhưng required → reject · textbox quá dài → giới hạn 2000 ký tự · con chuyển cơ sở giữa đợt → eligibility tính tại thời điểm submit.

## 7. Rollback / Feature flag
Flag `EVAL_V2_ENABLED` cho menu portal/admin; Survey NPS cũ không đụng.

## 8. Test plan
| Case ID | Nhóm | B/E | Bước | Kết quả | Tool |
|---|---|---|---|---|---|
| R7-16-C1 | T1 | B | dựng form 4 loại → render portal | đúng UI từng loại (sao=emoji cho HV) | Playwright |
| R7-16-C2 | T2 | B | thử tạo type ngoài enum (API) | reject schema | Vitest |
| R7-16-C3 | T7 | B | sửa form có response | chặn; clone OK | Playwright |
| R7-16-C4 | T1/T2 | B | profile HV: danh sách GV | chỉ GV đã/đang dạy; GV lạ không có | Playwright |
| R7-16-C5 | T6 | B | submit ×2 cùng đợt×GV | lần 2 chặn | Playwright |
| R7-16-C6 | T4 | B | GV không quyền xem; GV có quyền aggregate; QL chi tiết | đúng 3 mức; aggregate ẩn danh | Playwright |
| R7-16-C7 | T5 | B | PH cơ sở khác mở khảo sát round CS1 | không thấy | Playwright |
| R7-16-C8 | T2/T3 | E | required bỏ trống, checkbox 0 chọn, text 2001 ký tự | reject đúng field | Vitest |

## 9. Test data
Form 4 câu; round TEACHER_EVAL giữa khóa (lớp CS1) + round CENTER_SURVEY CS1; HV có 2 GV; PH 2 cơ sở.

## 10. RTM
AC1↔C1 · AC2↔C3 · AC3↔C4,C5 · AC4↔C6 · AC5↔C7 · AC6↔(aggregate test trong C6) · validation↔C2,C8.

## 11. DoD
DoD chuẩn + demo D9 + IR-2 BA#04 đã cập nhật wording (xong 12/06).
