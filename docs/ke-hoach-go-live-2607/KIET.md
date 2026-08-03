# Kế hoạch GO-LIVE 26/07 — Kiệt  🟩 Xanh lá  ·  BẢN V4.1 (nhận bàn giao lane Huy)

> **Cấp:** Mid · Tech-lead / Owner  ·  **Lane v4.1:** FIN (Tài chính CƠ BẢN) · Deploy/migration prod · **SIS · LMS (đầy đủ, gồm SCORM) · NOTIF (email)** *(nhận từ Huy — rời team 03/07)*  ·  **Cập nhật:** 2026-07-03  ·  **Mục tiêu:** GO-LIVE 26/07/2026 (6 ngày/tuần, nghỉ CN)
> Nguồn: v4 thu gọn + tài liệu kiến trúc arc42 (§11 nợ kỹ thuật). Xem thêm: [v4/README.md](v4/README.md) · [v4/yeu-cau-theo-thanh-vien.md](v4/yeu-cau-theo-thanh-vien.md) · [v4/tasks-danh-sach.md](v4/tasks-danh-sach.md).
>
> ⚠️ **Thay đổi 03/07:** Huy & Trí rời team. Kiệt nhận **toàn bộ task H1–H8** (SIS/LMS/NOTIF, giữ nguyên mã H* để khớp MISA). Trí bàn giao cho Luân (T1–T6). Task mentor K8 chuyển thành **review chéo Kiệt↔Luân**. Tổng tải Kiệt ≈ 17 + 22 = **~39 ngày-công** — vượt quỹ thời gian còn lại → xem mục 7 (rủi ro tải).

## 1. Phạm vi v4.1 (trong / ngoài)
- **TRONG MVP 26/07:** deploy/migration prod 2 cơ sở · **Tài chính CƠ BẢN** (tạo đơn · ghi nhận thu · kế toán xác nhận · phiếu thu · công nợ · nối portal học phí) · **SIS** (điểm danh 6 nhãn · convert sĩ số) · **LMS đầy đủ** (curriculum · homework status · Exam · SESSION_EVAL · học bạ · SCORM pipeline + bật prod) · **NOTIF email cơ bản** (17 trigger · notification center · nhắc lịch/công nợ).
- **NGOÀI (cuốn chiếu sau 26/07):** hoàn tiền/pro-rata · voucher · VietQR · pricing/CourseDiscount · product catalog · cấu hình tài chính nâng cao · toàn bộ HR chấm công · MKT/hoa hồng · kho học cụ/phòng học/import lớp · Zalo/MISA · nhắc tái tục/reserve-expiry.

## 2. Dòng công việc theo sprint
- **GĐ0 (01–04/07):** apply migration prod 2 CS + seed tổ chức · commit fix Payment đang treo · vá cộng đôi Payment · chốt 3 TBD với TGĐ.
- **GĐ1 (06–13/07):** Tài chính cơ bản (K4) **song song** SIS/LMS P0 nhận từ Huy: điểm danh 6 nhãn (H1) · HomeworkAssignment.status (H2) · convertLeadV2 sĩ số (H3, phối hợp Luân T3) · NOTIF email trigger/cron (H4).
- **GĐ2 (13–18/07):** nối Portal học phí (K5) · SCORM pipeline + bật prod (H6+K6 gộp) · quyền TRAINING học bạ (H5) · verify SESSION_EVAL/Exam/học bạ (H7) · review enforcement.
- **GĐ3–4 (20–26/07):** LMS/NOTIF regression (H8) · hardening · UAT 2 cơ sở · deploy go-live 26/07 + rollback plan (K9).

## 3. 🚨 Blocker chặn go-live (của Kiệt)
| Mã | Blocker | Ưu | Ngày |
|---|---|---|---|
| **K1** | Apply migration Supabase prod 2 CS + seed OrgUnit/RoleDef/UserOrgRole + flip flags | P0 | 01–02/07 |
| **K2** | Commit+push fix PH-1/PH-2/C4/C5 + migration `20260629142518` (đang ở working tree) | P0 | 01–03/07 |
| **K3** | Vá cộng đôi Payment (PAY-DEDUP) — lọc `accountantStatus=ADJUSTED` | P0 | 01–03/07 |
| **K4** | Tài chính CƠ BẢN end-to-end (thu → xác nhận → phiếu thu → công nợ) | P0 | 06–10/07 |
| **K7** | Chốt 3 quyết định treo (hoàn tiền/migrate/SCORM zip) với TGĐ | P0 | 01–04/07 |
| **H1** | Điểm danh 6 nhãn (null-row, no PENDING) + kéo học bù/rủi ro/thông báo *(nhận từ Huy)* | P0 | 06–09/07 |
| **H2** | Fix `HomeworkAssignment.status` transition (🔴 đứng yên) *(nhận từ Huy)* | P0 | 09–11/07 |
| **H3** | `convertLeadV2` re-check sĩ số (Serializable) + tiên quyết (phối hợp Luân T3) *(nhận từ Huy)* | P0 | 10–12/07 |
| **K9** | UAT 2 cơ sở + deploy go-live + rollback | P0 | 23–26/07 |

## 4. Việc chi tiết theo phần

### FIN — Tài chính CƠ BẢN · GĐ0–GĐ2
| Mã | Việc | Ưu | Ngày | Yêu cầu chính | Nghiệm thu (DoD) | Kiểm thử | Est |
|---|---|---|---|---|---|---|---|
| **K3** | Vá cộng đôi Payment | P0 | 01–03/07 | Lấp double-read `lib/payments/summary.ts` (lọc ADJUSTED); dọn 14 file + 2 migration còn dở của PAY-DEDUP | 1 khoản = 1 dòng ledger; tổng công nợ/đã thu đúng khi có bút toán điều chỉnh | Unit test summary; kịch bản 1 đơn 2 đợt + 1 điều chỉnh → tổng đúng | 1d |
| **K4** | Tài chính cơ bản (Order→thu→xác nhận→phiếu thu→công nợ) | P0 | 06–10/07 | Order state machine · Sale ghi nhận khoản (≤2 đợt) · Kế toán xác nhận sinh Receipt (mã theo `OrgUnit.code`) · công nợ `/admin/cong-no`. KHÔNG hoàn tiền/voucher/VietQR | E2E 1 đơn 2 đợt: Sale ghi nhận → KT xác nhận → phiếu thu + công nợ đúng | E2E 1 đơn 2 đợt; guard `payments:manage` | 4d |
| **K5** | Nối Portal học phí (`getParentConfirmedPayments`) | P1 | 08–12/07 | PH xem công nợ + khoản **CONFIRMED** trên `/portal/hoc-phi` (đang unwired) | Portal hiện đúng khoản đã xác nhận + công nợ; không lộ khoản chưa xác nhận | PH login đối chiếu với admin cong-no | 3d |

### Deploy / Nền · GĐ0
| Mã | Việc | Ưu | Ngày | Yêu cầu chính | Nghiệm thu (DoD) | Kiểm thử | Est |
|---|---|---|---|---|---|---|---|
| **K1** | Migration prod 2 CS + seed tổ chức | P0 | 01–02/07 | Apply A0→R7 qua `DIRECT_URL` :5432 · seed ROOT/HO/CS1/CS2 · UserOrgRole tài khoản thật · bật flag | `prisma migrate status` up-to-date; mỗi vai trò login đúng scope | Login từng vai trò kiểm tra cách ly cơ sở | 2d |
| **K2** | Commit fix Payment/Lead treo | P0 | 01–03/07 | Commit+push PH-1/PH-2/C4/C5 + migration treo; chạy CI | Đã commit+push; CI xanh; migration có trên prod | `typecheck && lint && build` PASS | 1d |
| **K7** | Chốt 3 TBD với TGĐ | P0 | 01–04/07 | Hoàn tiền/pro-rate/clawback · cách migrate prod · mức quét SCORM zip | Có quyết định văn bản cho cả 3 | Biên bản lưu | 1d |

### SIS — Học viên · Lớp · Điểm danh · GĐ1 *(nhận từ Huy)*
| Mã | Việc | Ưu | Ngày | Yêu cầu chính | Nghiệm thu (DoD) | Kiểm thử | Est |
|---|---|---|---|---|---|---|---|
| **H1** | Điểm danh 6 nhãn (hoàn tất) | P0 | 06–09/07 | UI 6 nhãn (null-row, không enum PENDING); vắng → `MakeupNeed` + `StudentRiskAlert` + thông báo PH | GV điểm danh đủ 6 nhãn 1 buổi; vắng tạo MakeupNeed + cảnh báo; PH nhận thông báo | Điểm danh 1 lớp: kiểm tra MakeupNeed + risk + email | 3d |
| **H3** | convertLeadV2 re-check sĩ số + tiên quyết | P0 | 10–12/07 | Thêm guard sĩ số Serializable + prerequisite (hiện thiếu → rủi ro vượt sĩ số convert song song); phối hợp Luân (T3 convert UI) | 2 convert song song cùng lớp không vượt sĩ số; thiếu tiên quyết bị chặn | Chạy 2 convert đồng thời lớp gần đầy → chỉ 1 thành công | 2d |

### LMS — Đào tạo (ĐẦY ĐỦ) · GĐ1–GĐ2 *(nhận từ Huy)*
| Mã | Việc | Ưu | Ngày | Yêu cầu chính | Nghiệm thu (DoD) | Kiểm thử | Est |
|---|---|---|---|---|---|---|---|
| **H2** | Fix HomeworkAssignment.status | P0 | 09–11/07 | Hiện tạo `ASSIGNED` qua `createMany`, không update → nối `ASSIGNED→SUBMITTED→GRADED` | Trạng thái bài chuyển đúng khi HV nộp + GV chấm; portal phản ánh đúng | HV nộp → SUBMITTED; GV chấm → GRADED; portal cập nhật | 2d |
| **H5** | Quyền TRAINING phát hành ReportCard & CourseCompletion | P1 | 11–13/07 | permissions: TRAINING hiện KHÔNG có quyền duyệt/phát hành → bổ sung | Phòng Đào tạo phát hành học bạ + hoàn thành khoá | TRAINING login: duyệt học bạ PENDING_REVIEW → PUBLISHED | 1d |
| **H6** | SCORM pipeline/player finalize | P1 | 13–17/07 | ingest/validate zip an toàn · upload→publish · player vé HMAC + blur/watermark. Kiệt tự bật prod luôn (gộp với K6) | Upload→publish→play ở staging; validate zip chặn file độc; watermark hiện | Upload 1 gói SCORM: publish + play + IDOR chặn | 4d |
| **H7** | Verify LMS: SESSION_EVAL + Exam + học bạ | P1 | 15–18/07 | Rà & vá phiếu đánh giá buổi (lớp chính + trải nghiệm), Exam/ExamAttempt, ReportCard duyệt→phát hành | GV đánh giá buổi + chấm exam; học bạ phát hành hiện ở portal | 1 buổi: đánh giá → học bạ PUBLISHED → PH xem | 2d |

### NOTIF — Thông báo email cơ bản · GĐ1–GĐ3 *(nhận từ Huy)*
| Mã | Việc | Ưu | Ngày | Yêu cầu chính | Nghiệm thu (DoD) | Kiểm thử | Est |
|---|---|---|---|---|---|---|---|
| **H4** | Email trigger cơ bản + notification center + nhắc lịch/công nợ | P1 | 06–13/07 | Email queue/worker (Resend) + 17 trigger DomainEvent idempotent + notification center admin + feed PH + cron nhắc lịch/công nợ. (Zalo/MISA cuốn chiếu sau) | 17 trigger chạy idempotent (event trùng không gửi 2 lần); PH nhận email đúng sự kiện | Bắn từng event (kích hoạt TK, xác nhận thu, nhận xét, nhắc nợ) → đúng 1 email | 5d |
| **H8** | LMS/NOTIF regression + UAT đào tạo | P1 | 20–22/07 | Regression toàn LMS/SIS/NOTIF; hỗ trợ UAT phòng Đào tạo & GV | Không lỗi P0/P1 LMS/NOTIF khi UAT | Bộ test T-LMS + UAT checklist đào tạo | 3d |

### Deploy · Review · UAT
| Mã | Việc | Ưu | Ngày | Yêu cầu chính | Nghiệm thu (DoD) | Kiểm thử | Est |
|---|---|---|---|---|---|---|---|
| **K6** | Bật SCORM prod (gộp vào H6 — cùng người làm) | P1 | 15–17/07 | `SCORM_ENABLED=true` + R2 creds/CORS + e2e blur/watermark/IDOR (vé HMAC 10p) | GV trình chiếu SCORM prod OK; vé sai/hết hạn bị chặn; watermark hiện | E2E browser staging: play hợp lệ + IDOR 403 | 2d |
| **K8** | Review chéo Kiệt↔Luân (thay mentor Huy/Trí) | P1 | 06–22/07 | Kiệt review PR RBAC/CRM/REPORT của Luân; Luân review PR tiền/enrollment/LMS của Kiệt — không ai tự merge PR đụng tiền/quyền của chính mình | Mọi PR đụng tiền/enrollment/quyền có approver là người còn lại | Kiểm tra PR có review chéo | — |
| **K9** | Deploy go-live + rollback + UAT | P0 | 23–26/07 | UAT thật CS1+CS2, fix P0/P1, deploy 26/07 + rollback | Go-live thành công; P0=0; có rollback plan | UAT checklist 2 CS + smoke prod | 3d |

## 5. Ràng buộc kỹ thuật (bất biến mọi ticket)
`auth()` + `assertCan(actor,'res:action')` đầu hàm → **tiền/enrollment/convert trong transaction** → side-effect (`payment.confirmed`, điểm danh, giao bài, học bạ) qua DomainEvent idempotent (`dedupeKey`) → confirm payment **idempotent** (`IdempotencyKey`) → mutation nhạy cảm ghi AuditLog → `scopedDb(actor)` cho đọc/ghi có cơ sở → GV không xem SĐT/email PH; không lộ `studentId` → admin = shadcn (không Magic UI) → DoD: `pnpm typecheck && lint && build` xanh + smoke.

## 6. Phối hợp & phụ thuộc
- **Review chéo với Luân (K8):** Luân review PR tiền/enrollment/LMS của Kiệt; Kiệt review PR RBAC/CRM/tiền của Luân.
- **Phụ thuộc:** K1/K2 mở đường cho tất cả (Luân scopedDb + login). H3 (convert sĩ số) ↔ Luân T3 (convert UI/CRM). H5 chờ RBAC (Luân T2/L4). K4 ↔ Portal học phí (K5). Điểm danh (H1) là input cho Teacher-BE (Luân L6) và portal.
- **Ngoài scope Kiệt ở v4.1:** HR chấm công, MKT/hoa hồng — cuốn chiếu sau go-live.

## 7. ⚠️ Rủi ro tải sau bàn giao (cần PM quyết)
- Tổng tải Kiệt ≈ **39 ngày-công** (K* ~17 + H* ~22) trong ~20 ngày làm việc còn lại → **không khả thi nếu giữ nguyên phạm vi + deadline**.
- Đề xuất giảm tải (chờ PM chốt): (1) hạ H4 xuống subset trigger P0 (kích hoạt TK · xác nhận thu · nhắc nợ), phần còn lại cuốn chiếu; (2) H7 chuyển thành verify-only, chỉ vá lỗi chặn luồng; (3) dời SCORM (H6/K6) sang tuần sau go-live nếu TGĐ chấp nhận (SCORM đã LIVE bản cơ bản trên prod từ 03/07 — chỉ còn e2e blur/watermark/IDOR).
