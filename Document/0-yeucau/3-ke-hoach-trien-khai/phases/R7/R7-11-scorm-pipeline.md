# R7-11 — SCORM pipeline: upload → job giải nén → manifest → publish + versioning

**ID** R7-11 · **PR** 3 (PR0 spike kỹ thuật 1 ngày, PR1 upload+job+R2, PR2 publish+versioning) · **Ưu tiên** P1 · **Ước lượng** XL · **Phụ thuộc** R7-10 · **Trạng thái** TODO · **US** US-SCORM-1, US-SCORM-4 · **SRS** §12.2–12.3, §12.5, §28.4 · **QĐ** O5

## 1. Mục tiêu & bối cảnh
SCORM chưa tồn tại trong repo (grep=0). SRS chốt SCORM là bài giảng chính cho GV. Thách thức hạ tầng: Vercel serverless không giữ tiến trình dài → giải nén qua **DB-backed job queue + cron** (Doc 15 Q4); nội dung giải nén lưu R2 private.

## 2. Phạm vi
- **In:** model ScormPackage + job; upload multipart thẳng R2 (presigned, có progress); job: validate zip → đọc `imsmanifest.xml` (SCORM 1.2/2004) → giải nén từng entry lên R2 prefix `scorm/{packageId}/` → launch URL → metadata → trạng thái chờ kiểm thử; Đào tạo xem thử → publish; versioning (bản mới không xóa cũ, 1 active/buổi); pin theo lớp (cơ chế R7-06); quét an toàn mức v1 = extension whitelist + size limit + manifest validate (TBD-4: scanner ngoài = backlog).
- **Out:** player + blur/watermark (R7-12) · tracking học viên (inverse — QĐ-18 SRS).

## 3. Thiết kế kỹ thuật
- `ScormPackage{id, lessonId FK, name, scormVersion('1.2'/'2004'), storagePrefix, launchUrl, sizeBytes, fileCount, uploadedById, status(UPLOADING/PROCESSING/FAILED/TESTING/PUBLISHED/ARCHIVED), version Int (per lesson), isActiveForLesson bool, error?}`; unique partial `(lessonId) WHERE isActiveForLesson`.
- `ScormJob` dùng DomainEvent outbox/queue hiện có (A0-07): event `scorm.uploaded` → handler cron xử lý từng package (idempotent theo packageId; chunk theo entry nếu zip lớn — job tự resume bằng con trỏ entry).
- Giới hạn v1: zip ≤ 200MB, ≤ 2.000 entry, extension whitelist (html/js/css/img/media/xml/json/font), path traversal guard (`..` reject).
- Publish: can `training:manage`; gắn buổi qua `lessonId`; lớp pin version theo ClassSessionPlan (R7-06) — thay version của lớp cần reason + audit.

## 4. Acceptance Criteria
- AC1: Upload zip hợp lệ → PROCESSING → TESTING với metadata đủ (manifest version, launchUrl, size, người upload) — flow đủ bước SRS §12.2.
- AC2: Zip thiếu manifest / chứa `.exe` / vượt size / path traversal → reject với lỗi rõ; KHÔNG ghi rác lên R2 (cleanup).
- AC3: Job fail giữa chừng → status FAILED + retry tiếp tục từ entry đang dở (idempotent).
- AC4: Upload v2 → v1 còn nguyên; activate v2 cho buổi → chỉ 1 active; lớp đang chạy giữ bản pin; đổi bản của lớp cần reason + AuditLog.
- AC5: Chỉ Đào tạo/Admin upload + publish (T4); upload có progress UI.

## 5. Files dự kiến
migration `add_scorm_package` · `lib/scorm/{manifest.ts,ingest.ts}` (+tests parser/guard) · `lib/events/handlers/scorm-ingest.ts` · `app/(admin)/admin/scorm/*` (upload, danh sách, xem thử, publish) · `app/api/admin/scorm/presign/route.ts` · `tests/e2e/r7/scorm-pipeline.spec.ts`.

## 6. Edge cases & xử lý lỗi
Manifest nhiều organization → lấy default org launch item · zip lồng folder gốc đơn (`package/…`) → chuẩn hóa prefix · entry trùng tên → ghi đè cùng key (last-win) + log · job chạy đè (2 cron tick) → khóa bằng status PROCESSING + heartbeat · xóa package TESTING → dọn R2 prefix; PUBLISHED → chỉ ARCHIVED (không xóa vật lý trong R7).

## 7. Rollback / Feature flag
Flag `SCORM_ENABLED` (menu + route). Model độc lập — tắt flag không ảnh hưởng hệ khác.

## 8. Test plan
| Case ID | Nhóm | B/E | Bước | Kết quả | Tool |
|---|---|---|---|---|---|
| R7-11-C1 | T1 | B | upload zip mẫu SCORM 1.2 + 2004 | TESTING + metadata + launchUrl đúng | Playwright (zip fixture) |
| R7-11-C2 | T2/T10 | B | zip thiếu manifest / có .exe / entry `../x` | reject + không còn object R2 | Vitest ingest |
| R7-11-C3 | T8/T6 | B | mock fail tại entry 50/100 → retry | FAILED → resume → TESTING; không entry trùng | Vitest |
| R7-11-C4 | T7/T9 | B | upload v2, activate; lớp pin v1 đổi sang v2 | 1 active/buổi; lớp cần reason + audit | Playwright |
| R7-11-C5 | T4 | B | GV/Sale upload hoặc publish | chặn | Playwright |
| R7-11-C6 | T11 | E | zip 200MB+1 / 2001 entry | reject sớm với thông báo giới hạn | Vitest |

## 9. Test data
2 zip fixture (SCORM 1.2 mini, 2004 mini), 1 zip hỏng, 1 zip có path traversal (tự tạo trong tests/fixtures/scorm/).

## 10. RTM
AC1↔C1 · AC2↔C2,C6 · AC3↔C3 · AC4↔C4 · AC5↔C5.

## 11. DoD
DoD chuẩn + spike note (kết luận giới hạn Vercel/R2) lưu trong ticket + TBD-4 chốt với Tech Lead trước PR1.
