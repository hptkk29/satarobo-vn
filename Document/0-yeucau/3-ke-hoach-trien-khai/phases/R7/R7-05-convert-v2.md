# R7-05 — Convert v2: chặn thanh toán + multi-student + dedupe + consent + mã HV mới

**ID** R7-05 · **PR** 3 (PR1 service+guard+mã, PR2 form multi-student+consent, PR3 dedupe/xung đột+màn Admin) · **Ưu tiên** P0 · **Ước lượng** XL · **Phụ thuộc** R7-01, R7-03, R7-04 · **Trạng thái** TODO · **US** US-CONV-1..6 · **SRS** §8, §26, §28.2 · **QĐ** O4, O6, O9

## 1. Mục tiêu & bối cảnh
`closeLeadAsEnrolled` (actions.ts:357–719) + `convertLeadToEnrollment` (lib/crm/convert-lead.ts) đã chạy transaction nhưng: cho convert không cần tiền, 1 con/lần, dedupe chỉ cảnh báo, consent không nằm ở convert, mã HV tuần tự. SRS v3.1 nâng convert thành nghiệp vụ có điều kiện + đa học viên + tuân thủ NĐ 13/2023.

## 2. Phạm vi
- **In:** guard PAYMENT_REQUIRED (lead phải REGISTERED — đã có tiền ghi nhận R7-04); form convert multi-student từ LeadChild; dedupe parent (email+phone, 3 nhánh) + màn Admin xử lý xung đột; dedupe student (Parent+tên chuẩn hóa+DOB); consent ảnh per học viên tại form + audit người tick; `genStudentCodeV2` format `CSx-YY-RANDOM`; autosave draft.
- **Out:** thay đổi flow kích hoạt email (giữ nguyên Q13) · migrate dữ liệu cũ (QĐ-O6/O8 — không cần).

## 3. Thiết kế kỹ thuật
- Service mới `lib/crm/convert-lead-v2.ts` (giữ hàm cũ cho regression đến khi switch): input `{leadId, parent{...}, students[{leadChildId?, info, courseId, discountId?, consentMedia bool}], payments[đợt 1/full đã ghi nhận]}`.
- Guard: (1) lead.status=REGISTERED; (2) ≥1 Payment saleStatus=RECORDED gắn hồ sơ HOẶC Σ finalPrice=0 (ghi audit lý do SCHOLARSHIP_FULL); fail → `{ok:false,error:{code:'PAYMENT_REQUIRED'}}`.
- Transaction: upsert Parent(User) → N×(Student + mã v2 + Enrollment snapshot giá R7-03 + StudentConsent + Order/Payment links) → lead=ENROLLED → LeadAuditLog. Idempotency-key per submit (bảng IdempotencyKey hiện có hoặc unique trên leadId+hash). Event sau commit: `lead.converted` (giữ), `consent.granted`.
- Dedupe parent: cả email và phone; match 1 hồ sơ → UX chọn dùng lại; email∈A & phone∈B → tạo `ConvertConflict{leadId, parentAId, parentBId, status OPEN/RESOLVED, resolvedById}` + chặn convert + thông báo Admin (màn `/admin/convert-conflicts` cho gộp/sửa rồi mở khóa).
- Dedupe student: normalize (trim/collapse space/casefold) tên + DOB + parent → gợi ý chọn Student cũ (chỉ tạo Enrollment mới).
- `genStudentCodeV2(centerCode)`: `${CS}-${YY}-${rand6}` charset `ABCDEFGHJKMNPQRSTUVWXYZ23456789`; retry khi unique vi phạm; guard sửa: chỉ SUPER_ADMIN + audit + reason. Mã cũ giữ nguyên.
- Consent UI: checkbox per học viên + text cam kết; lưu người tick = actor Sale + timestamp (AuditLog action CONSENT_GRANTED_AT_CONVERT).

## 4. Acceptance Criteria
- AC1: 0 khoản ghi nhận → PAYMENT_REQUIRED; có đợt 1 → pass; finalPrice=0 → pass + audit.
- AC2: Form thêm N học viên (mặc định 1, prefill từ LeadChild) → N Student + N Enrollment + snapshot giá, 1 transaction; lỗi giữa chừng rollback sạch; double-submit idempotent.
- AC3: Dedupe 3 nhánh parent đúng SRS §8.4; xung đột → khóa + màn Admin + log; không tự chọn.
- AC4: Trùng student 3 tiêu chí → cảnh báo + chọn cũ → chỉ tạo Enrollment mới.
- AC5: Consent lưu trạng thái + người tick + thời điểm; PH đổi sau qua yêu cầu chính thức có log (ParentRequest CONSENT_CHANGE).
- AC6: Mã sinh đúng format/charset, unique, retry; sửa mã: chỉ SUPER_ADMIN (audit+reason); mã cũ không đổi.

## 5. Files dự kiến
`lib/crm/convert-lead-v2.ts` (+test) · `lib/codegen.ts` (genStudentCodeV2 + test) · `lib/crm/dedupe.ts` (+test normalize) · schema migration `add_convert_conflict_consent_change` · `app/(admin)/admin/leads/[id]/convert/*` (form mới + autosave) · `app/(admin)/admin/convert-conflicts/page.tsx` · `tests/e2e/r7/convert-v2.spec.ts`.

## 6. Edge cases & xử lý lỗi
Lead REGISTERED nhưng payment bị Kế toán REJECT trước khi convert → vẫn convert được (điều kiện là Sale-recorded, §8.1) nhưng cảnh báo · email parent đã là user STAFF → chặn, báo Admin · 2 Sale convert cùng lead song song → idempotency + tx serializable trên lead row · student trùng ở parent KHÁC → không cảnh báo (đúng rule chỉ same-parent) · draft autosave chứa PII → lưu server-side theo user, TTL 7 ngày.

## 7. Rollback / Feature flag
Flag `CONVERT_V2_ENABLED`: OFF → form cũ hoạt động (giữ 2 đường trong R7, drop đường cũ phase sau). Bảng mới độc lập.

## 8. Test plan
| Case ID | Nhóm | B/E | Bước | Kết quả | Tool |
|---|---|---|---|---|---|
| R7-05-C1 | T2/T7 | B | convert khi 0 khoản | PAYMENT_REQUIRED, lead giữ nguyên | Playwright |
| R7-05-C2 | T1 | B | đợt 1 ghi nhận → convert | pass; KT chưa confirm vẫn pass | Playwright |
| R7-05-C3 | T1/T9 | B | finalPrice=0 convert | pass + audit SCHOLARSHIP_FULL | Vitest |
| R7-05-C4 | T1/T8 | B | convert 2 con; mock lỗi ở bước tạo Enrollment con 2 | thành công đủ 2; lỗi → rollback cả 2 | Vitest tx |
| R7-05-C5 | T6 | B | double-submit + 2 sale song song | 1 bộ record duy nhất | Playwright+Vitest |
| R7-05-C6 | T1 | B | email∈A, phone∈B | khóa + ConvertConflict OPEN + Admin notify | Playwright |
| R7-05-C7 | T1 | B | student trùng (tên " nguyễn  văn a ", DOB) | cảnh báo, chọn cũ → chỉ Enrollment mới | Playwright |
| R7-05-C8 | T9 | B | tick consent con 1, không tick con 2 | StudentConsent đúng từng con + audit actor/time | Playwright |
| R7-05-C9 | T1/T6 | B | sinh 1000 mã (mock collision 1 lần) | format đúng, unique, retry OK | Vitest |
| R7-05-C10 | T4/T9 | B | CENTER_MANAGER sửa mã / SUPER_ADMIN sửa | chặn / OK+audit+reason | Playwright |
| R7-05-C11 | T12 | B | flag OFF → flow convert cũ | hoạt động như R2 | Playwright |

## 9. Test data
Lead REGISTERED 2 LeadChild; parent A (email) + parent B (phone) seed sẵn; course + discount R7-03; payment đợt 1 RECORDED.

## 10. RTM
AC1↔C1,C2,C3 · AC2↔C4,C5 · AC3↔C6 · AC4↔C7 · AC5↔C8 · AC6↔C9,C10 · rollback↔C11.

## 11. DoD
DoD chuẩn + demo D2 + cập nhật Document/5-system-flows (flow convert).
