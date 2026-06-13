# R7-12 — SCORM player + signed URL + access log + blur/watermark

**ID** R7-12 · **PR** 2 (PR1 player+bảo vệ truy cập, PR2 blur+watermark) · **Ưu tiên** P1 · **Ước lượng** L · **Phụ thuộc** R7-11 · **Trạng thái** TODO · **US** US-SCORM-2..3 · **SRS** §12.1, §12.4, §28.4 · **QĐ** O5 (nghiệm thu trung thực giới hạn trình duyệt)

## 1. Mục tiêu & bối cảnh
GV cần mở SCORM trên web để trình chiếu; nội dung phải private (signed URL ngắn hạn), không nút tải, HV/PH bị chặn tuyệt đối; chống quay/chụp ở mức tối đa trình duyệt + watermark truy vết (QĐ-30 SRS).

## 2. Phạm vi
- **In:** route player `/admin/scorm/play/[sessionPlanId]` (GV theo lớp/buổi hoặc Đào tạo xem thử); resolver asset `/api/scorm/asset/[packageId]/[...path]` xác quyền từng request + redirect signed URL R2 TTL ngắn; ScormAccessLog; client wrapper: blur overlay (visibilitychange/blur, PrintScreen + clipboard ghi đè, DevTools heuristics, `getDisplayMedia`/capture detection), watermark động (tên + mã GV + thời gian, reposition ngẫu nhiên 15–30s); chặn role PARENT + profile HV ở route + can().
- **Out:** chống tuyệt đối phần mềm ngoài/điện thoại (tuyên bố giới hạn — biên bản nghiệm thu) · app mobile FLAG_SECURE (backlog SRS §12.4) · SCORM runtime tracking (inverse).

## 3. Thiết kế kỹ thuật
- Quyền mở: `canOpenScorm(actor, classSession)` = GV phân công lớp (teacher/assistant, kể cả actualTeacherId) ∪ can `training:manage`. Mọi asset request đi qua resolver (không expose R2 URL gốc); TTL 10 phút, cấp theo packageId+session ticket (JWT ngắn) — hết hạn player tự xin lại.
- `ScormAccessLog{id, packageId, classSessionId?, userId, openedAt, ip?}` (T9).
- Watermark: layer DOM + canvas đè iframe, nội dung `{employeeCode} {name} {HH:mm:ss}`; random position + opacity thấp; chống xóa qua MutationObserver (best-effort).
- Blur: overlay z-index max khi mất focus/visibility; keydown PrintScreen → overlay + `navigator.clipboard.writeText('')`; DevTools: kích thước viewport heuristic + `debugger` timing (best-effort, không chặn cứng); `navigator.mediaDevices.getDisplayMedia` của chính tab → phát hiện qua capture API khi trình duyệt hỗ trợ.

## 4. Acceptance Criteria
- AC1: GV lớp mở player chạy launchUrl; KHÔNG tồn tại nút tải; view-source asset URL → signed, hết hạn 403.
- AC2: PARENT/profile HV/GV-khác-lớp gọi player hoặc asset (kể cả IDOR đổi id) → chặn.
- AC3: Mỗi lượt mở ghi ScormAccessLog đủ ai/lớp/buổi/thời gian.
- AC4: Blur kích hoạt khi visibilitychange/blur/PrintScreen/DevTools-mở/tab-being-captured; focus lại → hiện.
- AC5: Watermark hiển thị đúng nội dung + đổi vị trí định kỳ; xóa DOM watermark → tự khôi phục.
- AC6: Biên bản nghiệm thu ghi rõ giới hạn trình duyệt (không chặn quay điện thoại/phần mềm ngoài) — wording SRS §12.4 giữ nguyên.

## 5. Files dự kiến
`app/(admin)/admin/scorm/play/[id]/page.tsx` · `app/api/scorm/asset/[...]/route.ts` · `components/admin/scorm-player.tsx` ('use client' wrapper) · migration `add_scorm_access_log` · `tests/e2e/r7/scorm-player.spec.ts`.

## 6. Edge cases & xử lý lỗi
Ticket hết hạn giữa bài → refresh im lặng, không mất trạng thái iframe · SCORM gọi API runtime (`API.LMSInitialize`) → stub no-op (không tracking — QĐ-18) · GV bị gỡ phân công giữa buổi → request asset kế tiếp 403 · popup window từ gói SCORM → mở trong iframe sandbox, chặn top-navigation.

## 7. Rollback / Feature flag
Chung flag `SCORM_ENABLED` với R7-11. Blur/watermark là layer client — lỗi JS không chặn dạy (graceful: lỗi watermark → vẫn phủ blur mặc định? KHÔNG — fail-open cho dạy học, log Sentry; mức bảo vệ là best-effort theo QĐ-O5).

## 8. Test plan
| Case ID | Nhóm | B/E | Bước | Kết quả | Tool |
|---|---|---|---|---|---|
| R7-12-C1 | T1 | B | GV lớp mở player | chạy; không nút tải | Playwright |
| R7-12-C2 | T10/T4 | B | PH/HV/GV-khác mở player + asset IDOR | 403 | Playwright |
| R7-12-C3 | T10 | B | asset URL sau TTL | 403; player tự refresh ticket | Playwright clock |
| R7-12-C4 | T9 | B | mở 2 lần | 2 dòng AccessLog đủ trường | Playwright |
| R7-12-C5 | T1 | B | mô phỏng visibilitychange/blur/PrintScreen | overlay bật; focus lại tắt | Playwright |
| R7-12-C6 | T1 | B | xóa node watermark bằng JS | tự khôi phục ≤2s | Playwright |
| R7-12-C7 | T8 | E | lỗi script watermark (mock) | player vẫn dạy được + Sentry log | Vitest |

## 9. Test data
Package PUBLISHED từ fixture R7-11; GV phân công + GV ngoài; PH/HV session.

## 10. RTM
AC1↔C1,C3 · AC2↔C2 · AC3↔C4 · AC4↔C5 · AC5↔C6 · AC6 = mục biên bản demo D5.

## 11. DoD
DoD chuẩn + demo D5 + dòng "giới hạn trung thực" trong biên bản nghiệm thu.
