# R7-09 — Portal dashboard mở rộng + media theo buổi + consent + signed URL

**ID** R7-09 · **PR** 2 (PR1 dashboard, PR2 media) · **Ưu tiên** P1 · **Ước lượng** L · **Phụ thuộc** R7-04, R7-07, R7-08 · **Trạng thái** TODO · **US** US-PORTAL-1..2, US-MEDIA-1..3 · **SRS** §18–19, §28.8

## 1. Mục tiêu & bối cảnh
Portal R4 đã có 17 trang + SiteSwitcher HMAC; dashboard mới hiển thị 3 card. SRS §18 đòi dashboard PH (công nợ đã xác nhận + ngày đến hạn, khảo sát mở, yêu cầu học bù) + dashboard HV đầy đủ. Media đã có duyệt + tag + consent filter; thiếu: gắn buổi, quyền "Sale phụ trách lớp", cảnh báo consent lúc upload, signed URL.

## 2. Phạm vi
- **In:** dashboard PH/HV mở rộng đủ mục SRS §18.3–18.4 (số liệu từ R7-04 payment + R7-08 summary); ClassSessionMedia gắn `classSessionId` + `takenAt`; quyền upload GV lớp/Sale phụ trách/QL; banner cảnh báo HV chưa consent + chặn tag; signed URL R2 cho ảnh.
- **Out:** mục khảo sát mở (link động — đặt placeholder, hoàn thiện ở R7-16) · entry đánh giá GV (R7-16) · làm mờ tự động khuôn mặt (ĐÃ LOẠI — chỉ cảnh báo, xử lý thủ công).

## 3. Thiết kế kỹ thuật
- Dashboard PH: card công nợ (Σ debt các con, ngày đến hạn gần nhất từ OrderInstallment), card yêu cầu học bù (ParentRequest đang mở), card thông báo; dashboard HV: 5 chỉ số (helper R7-08), bài tập x/y, link học bạ/ảnh/đánh giá.
- Media: thêm cột `classSessionId?`, `takenAt?` (additive); upload form chọn buổi; quyền: GV lớp (teacherId/assistant) ∪ Sale phụ trách lớp (cột `classInChargeId`/derive từ enrollment sale — quyết định lúc design, ưu tiên derive) ∪ can `media:manage`.
- Cảnh báo consent: API `getNonConsentStudents(classId)` → banner liệt kê tên + hướng dẫn (làm mờ thủ công/loại khỏi khung); chọn tag HV chưa consent → reject server-side.
- Signed URL: helper `signedMediaUrl(key, ttl=10')` trên R2 client hiện có (`lib/storage/`); portal + admin render qua helper; URL trần/hết hạn → 403.

## 4. Acceptance Criteria
- AC1: Dashboard PH hiện đúng: chỉ tính khoản kế toán đã xác nhận vào "đã nộp"; công nợ + ngày đến hạn đúng số R7-04.
- AC2: Dashboard HV đủ mục, 5 chỉ số khớp helper; chuyển profile không trộn dữ liệu (regression R4).
- AC3: Ảnh gắn lớp + buổi + ngày chụp + người upload; PH chỉ thấy ảnh lớp con + ưu tiên ảnh tag con.
- AC4: Sale không phụ trách lớp upload → chặn; banner consent liệt kê đúng HV; tag HV chưa consent → reject.
- AC5: Revoke consent → ảnh tag con ẩn ngay (regression); signed URL hết hạn/đổi id → 403.

## 5. Files dự kiến
migration `add_media_session_taken_at` · `lib/storage/signed-url.ts` (+test) · `lib/lms/media-consent.ts` (getNonConsentStudents) · `app/(portal)/portal/{page,hinh-anh}` · `app/(admin)/admin/media/*` (upload theo buổi + banner) · `tests/e2e/r7/portal-media.spec.ts`.

## 6. Edge cases & xử lý lỗi
Ảnh cũ không có sessionId → hiện ở mức lớp (fallback) · PH 2 con cùng lớp → ảnh hiện 1 lần, tag đủ 2 · upload trùng file (hash) → cảnh báo nhẹ · TTL hết giữa lúc xem → client re-request URL mới (refresh tự động).

## 7. Rollback / Feature flag
Signed URL sau flag `MEDIA_SIGNED_URL` (OFF = fileUrl cũ) để bật dần; cột mới nullable.

## 8. Test plan
| Case ID | Nhóm | B/E | Bước | Kết quả | Tool |
|---|---|---|---|---|---|
| R7-09-C1 | T1 | B | seed khoản PENDING + CONFIRMED | dashboard chỉ cộng CONFIRMED; hạn đợt 2 hiển thị | Playwright |
| R7-09-C2 | T1 | B | dashboard HV | 5 chỉ số khớp Vitest helper | Playwright |
| R7-09-C3 | T4 | B | Sale không phụ trách upload | chặn; GV lớp → OK | Playwright |
| R7-09-C4 | T2 | B | tag HV chưa consent | server reject + banner liệt kê đúng | Playwright |
| R7-09-C5 | T12 | B | revoke consent | ảnh ẩn ngay | Playwright |
| R7-09-C6 | T10 | B | URL hết hạn / đổi id ảnh lớp khác | 403 | Playwright |
| R7-09-C7 | T10 | B | regression: route portal không lộ studentId | pass (cookie HMAC) | Playwright |

## 9. Test data
PH 2 con (1 con CS1 có nợ đợt 2); lớp có 2 HV chưa consent; ảnh APPROVED có/không tag.

## 10. RTM
AC1↔C1 · AC2↔C2,C7 · AC3↔C3(trong C1/C3 flows) · AC4↔C3,C4 · AC5↔C5,C6.

## 11. DoD
DoD chuẩn + mobile 375px smoke + Lighthouse portal ≥85.
