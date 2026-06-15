# R7 — LMS v3.1 · Ticket index

> Bảng tổng + test case bắt buộc: [../R7-lms-v3.1.md](../R7-lms-v3.1.md). Quy trình + template 11 mục: [../00-quy-trinh-thuc-hien.md](../00-quy-trinh-thuc-hien.md).
> Nguồn spec: BA #05 (gap + QĐ-O1…O10 + XĐ-8 PA2) · BA #06 (US) · SRS v3.1.
> 🟢 Kế hoạch ĐÃ DUYỆT (TGĐ 12/06/2026) — ticket ở TODO, sẵn sàng nhận việc từ R7-00. Điều kiện trước R7-01+: gate R7-00 xanh + TBD-3 (prod migrate) chốt.
>
> **📊 Tiến độ (2026-06-15):** R7-00/01/03/06 + R7-02/04 = CODE DONE. Postgres test local đã dựng (scoop), **toàn bộ migration apply sạch** (validate SQL tay), seed OK, **24 e2e R7-00→06 PASS** (`pnpm test:e2e:r7` với `R7_SKIP_WEBSERVER=1`). 403 unit + build + typecheck + lint xanh. **CÒN LẠI:** apply migration lên Supabase (`migrate deploy`), e2e cho R7-02/04, verify UI 375px; xem từng row.

| Ticket | Title | Đợt | ƯL | Phụ thuộc | Trạng thái |
|---|---|---|---|---|---|
| [R7-00](R7-00-security-gate.md) | Tiền đề bảo mật C1–C3 (gate) | R7a | M | R6 | TODO |
| [R7-01](R7-01-lead-child.md) | LeadChild + trạng thái lead mới + SLA 24h | R7a | L | R7-00 | 🟡 CODE DONE (2026-06-15) — model+migration+service+UI+unit; chờ `migrate deploy` + e2e (test DB) |
| [R7-02](R7-02-trial-class.md) | Lớp trải nghiệm N buổi end-to-end | R7a | XL | R7-01 | 🟡 CODE DONE (2026-06-15) — TrialClassV2 model+migration+service+UI+unit; chờ e2e |
| [R7-03](R7-03-course-pricing.md) | Ưu đãi theo khóa + snapshot giá Enrollment | R7a | M | R7-00 | 🟡 CODE DONE (2026-06-15) — CourseDiscount+migration+pricing helper+UI; snapshot ghi tại convert (R7-05); chờ migrate+e2e |
| [R7-04](R7-04-payment-two-tier.md) | Payment 2 tầng + Receipt + 2 đợt X ngày + công nợ | R7a | XL | R7-03 | 🟡 CODE DONE (2026-06-15) — Payment/Receipt model+migration+payment/debt/receipt logic+UI+cron+unit; chờ e2e |
| [R7-05](R7-05-convert-v2.md) | Convert v2 (chặn thanh toán, multi-student, dedupe, consent, mã HV) | R7a | XL | R7-01,03,04 | TODO |
| [R7-06](R7-06-class-snapshot.md) | ClassProgramSnapshot + guard + điều chỉnh buổi | R7a | L | R7-00 | 🟡 CODE DONE (2026-06-15) — pin curriculum+ClassSessionPlan+adopt+cancel/makeup+generate plan-aware+UI; adjust GV/phòng ghi audit (thiếu cột per-session — TODO schema); chờ migrate+e2e |
| [R7-07](R7-07-assign-session.md) | Gán học viên + state machine buổi học | R7a | L | R7-06 | TODO |
| [R7-08](R7-08-makeup-cross-center.md) | Học bù liên cơ sở + 5 chỉ số + 6 nhãn điểm danh | R7a | L | R7-07 | TODO |
| [R7-09](R7-09-portal-media.md) | Portal dashboard mở rộng + media buổi + consent + signed URL | R7a | L | R7-04,07,08 | TODO |
| [R7-10](R7-10-curriculum.md) | Khung chương trình: resize N + trạng thái buổi + đề xuất sửa | R7b | M | R7-00 | TODO |
| [R7-11](R7-11-scorm-pipeline.md) | SCORM pipeline upload→publish + versioning | R7b | XL | R7-10 | TODO |
| [R7-12](R7-12-scorm-player.md) | SCORM player + signed URL + blur/watermark | R7b | L | R7-11 | TODO |
| [R7-13](R7-13-exam-import-word.md) | Bài tập gắn buổi + import Word .docx có ảnh | R7b | XL | R7-10 | TODO |
| [R7-14](R7-14-homework-auto-assign.md) | Auto-giao bài + phân quyền hiển thị PH | R7b | L | R7-07,13 | TODO |
| [R7-15](R7-15-report-card.md) | Học bạ ReportCard duyệt → phát hành | R7b | L | R7-08 | TODO |
| [R7-16](R7-16-evaluation-survey.md) | Form builder 4 loại + đánh giá GV + khảo sát trung tâm | R7b | XL | R7-09 | TODO |
| [R7-17](R7-17-notif-reports.md) | Thông báo 17 trigger + báo cáo 7 nhóm + Satacoin schema + regression | R7b | XL | R7-01..16 | TODO |

**Nguyên tắc chung mọi ticket (không lặp lại trong từng file):** server action mở đầu `auth()` + `can()` v2 · đọc nghiệp vụ qua `scopedDb(actor)` · tiền/enrollment đi transaction, side-effect đi DomainEvent (handler idempotent) · mutation nhạy cảm ghi AuditLog · bảng mới có `centerId`/`orgUnitId` khi gắn cơ sở · schema 2-phase additive (KHÔNG drop trong R7) · migration tên rõ nghĩa · API lỗi `{ok:false,error:{code EN,message VI}}` · UI admin = shadcn (không Magic UI) · portal mobile 375px.
