# Phase R7 — LMS v3.1 (SRS hợp nhất chốt cuối 12/06/2026)

> **Nguồn yêu cầu:** SRS v3.1 (`0-tai-lieu-goc/SataRobo_LMS_Requirements_v3.1_CHOT-CUOI.md`) · BA #05 gap + bảng xung đột ĐÃ CHỐT (QĐ-O1…O10 + XĐ-8 PA2) · BA #06 — 40 US/17 epic.
> **Quy trình:** theo [00-quy-trinh-thuc-hien.md](00-quy-trinh-thuc-hien.md) — vòng đời task TODO→DOING→TEST_WRITTEN→TEST_PASS→REVIEW→DONE, DoD 10 mục, test taxonomy T1–T12.
> **Ticket chi tiết (11 mục/ticket):** thư mục [R7/](R7/README.md).
> **Test suite:** `tests/e2e/r7` (Playwright) + Vitest unit (`lib/**/*.test.ts`). Script: `"test:e2e:r7": "playwright test tests/e2e/r7"`.
> **Trạng thái phase:** 🟢 **KẾ HOẠCH ĐÃ DUYỆT — TGĐ 12/06/2026** (điểm dừng 3 đã qua). Dev được phép khởi động từ **R7-00** theo vòng đời TODO→DOING→TEST_WRITTEN→TEST_PASS→REVIEW→DONE. ⚠️ Trước khi code tính năng (R7-01 trở đi): R7-00 gate C1–C3 phải xanh + Owner chốt TBD-3 (prod migrate).

---

## 1. Mục tiêu & phạm vi

Hoàn thiện **18 hạng mục SRS §2** trước go-live LMS: vòng đời Lead → LeadChild → lớp trải nghiệm N buổi → convert (có điều kiện thanh toán) → Enrollment + thanh toán 2 tầng → lớp chính thức (snapshot chương trình) → buổi học (SCORM, điểm danh, auto-giao bài) → học bù **liên cơ sở** → portal PH/HV → học bạ phát hành → đánh giá GV + khảo sát (form builder 4 loại) → báo cáo.

**Tách 2 đợt (QĐ-O1):**
- **R7a — Lõi vận hành** (R7-00 → R7-09): ~4 tuần.
- **R7b — Nội dung đào tạo + đánh giá + báo cáo** (R7-10 → R7-17): ~4 tuần.

**KHÔNG phạm vi (inverse):** Satacoin runtime (chỉ schema config — R7-17) · OTP/Zalo login · app mobile/FLAG_SECURE · skill AI tạo bài tập (chỉ đồng bộ template) · auto nhận diện khuôn mặt làm mờ ảnh (scope ĐÃ LOẠI Doc 15 §0) · tracking SCORM theo học viên · page-builder tổng quát (IR-2).

**Điều kiện tiên quyết (chặn khởi động):**
1. **R6 vá C1–C3** (scopedDb error + RBAC_V2 ON + webhook fail-closed) — kiểm tra tại gate **R7-00**.
2. **Prod Supabase migrate** ~18 migration A0→R5 (TBD-3 — Owner).
3. SystemSetting (R6 epic A) sẵn sàng cho SLA 24h + reminderDays default.

## 2. Bảng task (Lớp 1 chống miss — không dòng nào trống cột test)

> Mỗi task có ticket 11 mục trong `R7/`. Ước lượng: S <1d · M 1–3d · L 3–7d · XL >1 tuần (tách PR nhỏ).

| Task ID | Mô tả | US (BA #06) | Phụ thuộc | ƯL | Test case bắt buộc | Trạng thái |
|---|---|---|---|---|---|---|
| **— R7a —** | | | | | | |
| R7-00 | Tiền đề bảo mật: verify C1/C2/C3 đã đóng (hoàn tất phần thiếu) | — (audit 06) | R6 | M | C1: rule dep-cruiser=error CI đỏ khi import db trần · C2: RBAC_V2=true + shadow log sạch · C3: thiếu secret→503 · C4: IDOR lead/order chéo cơ sở 404 | TODO |
| R7-01 | LeadChild + trạng thái lead mới (TRIAL_IN_PROGRESS, REGISTERED) + SLA 24h | US-LEAD-1..3 | R7-00 | L | C1 thêm N con · C2 trạng thái mới + history · C3 SLA 24h setting · C4 transition sai bị chặn · C5 regression phễu SR217 · C6 T5 cách ly lead | TODO |
| R7-02 | Lớp trải nghiệm N buổi end-to-end (config Đào tạo + lớp + xếp + điểm danh + "Đã học thử") | US-TRIAL-1..5 | R7-01 | XL | C1 config N · C2 sinh N buổi · C3 unique lớp active/child · C4 sức chứa + override · C5 điểm danh/nhận xét per buổi · C6 buổi cuối→Đã học thử · C7 T4 quyền tạo/gán · C8 T5 cách ly cơ sở | TODO |
| R7-03 | Ưu đãi theo khóa (CourseDiscount) + snapshot giá 4 thành phần trên Enrollment | US-CRS-1..3 | R7-00 | M | C1 tính giảm tiền/% đúng · C2 snapshot bất biến khi đổi giá · C3 T4 chỉ role được cấu hình · C4 T3 biên (giảm 0/100%) | TODO |
| R7-04 | Payment 2 tầng (Sale↔Kế toán: xác nhận/từ chối/hoàn/điều chỉnh) + Receipt per Enrollment + kế hoạch 2 đợt X ngày + công nợ đa chiều | US-PAY-1..4 | R7-03 | XL | C1 Sale ghi nhận→PH chưa thấy · C2 KT xác nhận→PH thấy+nợ giảm · C3 từ chối+reason · C4 điều chỉnh không xóa cứng (T9) · C5 đợt 2 tự tính + X override (T3 biên ngày nhắc) · C6 nhắc ngay nếu quá hạn · C7 phiếu thu riêng/con · C8 T4 Sale không tự xác nhận · C9 T5 công nợ theo cơ sở | TODO |
| R7-05 | Convert v2: chặn chưa thanh toán + multi-student + dedupe parent/student + consent tại convert + mã `CSx-YY-RANDOM` | US-CONV-1..6 | R7-01,03,04 | XL | C1 0 thanh toán→PAYMENT_REQUIRED · C2 đợt 1→pass · C3 giá 0đ→pass+audit · C4 N con→N student+N enrollment 1 tx · C5 rollback khi lỗi giữa chừng (T8) · C6 idempotent double-click (T6) · C7 xung đột email/phone→khóa+Admin · C8 trùng student→chọn cũ · C9 consent+audit người tick (T9) · C10 mã random unique+retry+chỉ SUPER_ADMIN sửa | TODO |
| R7-06 | ClassProgramSnapshot (pin version) + guard curriculum xuất bản + điều chỉnh từng buổi + notify | US-CLASS-1..3, US-PROG-3 | R7-00 | L | C1 tạo lớp→pin version+sinh lịch · C2 curriculum lên version mới→lớp giữ bản cũ · C3 đổi chủ động cần reason+audit · C4 course chưa publish→chặn kích hoạt lớp · C5 đổi lịch lặp preview+giữ tổng buổi+không đụng buổi done · C6 đổi GV/phòng per buổi có history+notify | TODO |
| R7-07 | Gán học viên (dropdown filter + Thêm toàn bộ) + state machine buổi học "Hoàn tất buổi" + nhận xét lớp | US-CLASS-4, US-SESS-1..2 | R7-06 | L | C1 dropdown chỉ enrollment hợp lệ (T5 cơ sở khác ẩn) · C2 Thêm toàn bộ theo filter+cảnh báo sức chứa · C3 sau gán: trạng thái+tiến độ+notify · C4 hoàn tất buổi tx+ghi GV/giờ/phòng thực · C5 hoàn tất 2 lần idempotent (T6) · C6 chưa điểm danh→cảnh báo · C7 nhận xét lớp mọi PH thấy, nhận xét HV chỉ PH con đó (T5) | TODO |
| R7-08 | Học bù liên cơ sở (sort ưu tiên + capacity/trùng lịch + scopedDb exception + audit) + 5 chỉ số + 6 nhãn điểm danh (XĐ-8 PA2) | US-MKP-1..3 | R7-07 | L | C1 đề xuất đúng tiêu chí (khóa+nội dung+chưa diễn ra+còn chỗ+không trùng+không vượt tiến độ) · C2 sort CS nhà trước→lịch gần (T3) · C3 xếp chéo cơ sở qua exception+audit đủ trường (T9) · C4 GV CS2 thấy HS bù đúng 1 buổi (T5) · C5 điểm danh bù→sync lớp gốc · C6 5 chỉ số đúng (Vitest) · C7 buổi hủy→nhãn đúng, không tính vắng | TODO |
| R7-09 | Portal dashboard PH/HV mở rộng + media gắn buổi + cảnh báo consent + signed URL | US-PORTAL-1..2, US-MEDIA-1..3 | R7-04,07,08 | L | C1 dashboard PH đủ mục (nợ+hạn) · C2 dashboard HV 5 chỉ số · C3 ảnh gắn buổi+quyền upload theo phụ trách (T4) · C4 banner cảnh báo HV chưa consent+chặn tag (T2) · C5 revoke→ẩn ngay (T1 regression) · C6 signed URL hết hạn/đổi id→403 (T10) · C7 không lộ studentId (T10 regression R4) | TODO |
| **— R7b —** | | | | | | |
| R7-10 | Khung chương trình: sinh/resize N buổi an toàn + trạng thái buổi 5 mức + khóa sửa + LessonChangeRequest | US-PROG-1..2 | R7-00 | M | C1 N=12 sinh đủ · C2 tăng append giữ data · C3 giảm cảnh báo+confirm khi có SCORM/bài tập+archive (T7) · C4 buổi khóa→chặn sửa (T4) · C5 GV đề xuất→Đào tạo xử lý | TODO |
| R7-11 | SCORM pipeline: upload zip → job giải nén R2 → manifest/launch → metadata → kiểm thử → publish | US-SCORM-1, US-SCORM-4 | R7-10 | XL | C1 zip hợp lệ→PUBLISHED flow đủ bước · C2 thiếu manifest/sai loại/quá size→reject (T2) · C3 job fail→FAILED+retry (T8) · C4 version mới không xóa cũ, 1 active/buổi · C5 lớp giữ version cũ, đổi cần reason+audit (T9) | TODO |
| R7-12 | SCORM player + signed URL + access log + blur/watermark | US-SCORM-2..3 | R7-11 | L | C1 GV lớp mở được, không nút tải · C2 URL hết hạn→403, IDOR→403 (T10) · C3 PARENT/HV/GV-khác-lớp bị chặn (T4) · C4 access log đủ ai/lớp/buổi/giờ (T9) · C5 blur khi visibilitychange/devtools/share (Playwright mô phỏng) · C6 watermark chứa tên+mã GV+giờ, đổi vị trí | TODO |
| R7-13 | Bài tập: Exam↔Lesson + cấu hình + ảnh câu hỏi/đáp án + **import Word .docx** (field-template, ảnh nhúng, preview sửa lỗi, nháp idempotent, file mẫu) | US-HW-1..2 | R7-10 | XL | C1 gắn Lesson+cấu hình đủ field · C2 .docx chuẩn→parse đủ+ảnh đúng câu · C3 .doc→reject (T2) · C4 lỗi từng dòng hiển thị+sửa inline · C5 import 2 lần không nhân đôi (T6) · C6 import→NHÁP, chỉ Đào tạo publish (T4) · C7 file mẫu tải được · C8 GV không sửa được câu gốc (T4) | TODO |
| R7-14 | Auto-giao bài khi "Hoàn tất buổi" + GV chọn hạn/trì hoãn + phân quyền hiển thị PH (aggregate) | US-HW-3..4 | R7-07,13 | L | C1 hoàn tất buổi→Assignment tự tạo đủ HV active · C2 handler idempotent (T6) · C3 trì hoãn/hạn GV chọn được tôn trọng · C4 HV làm bài đúng Enrollment, không thấy lớp khác (T5) · C5 PH chỉ thấy x/y+trạng thái, API chi tiết→chặn (T4/T10) | TODO |
| R7-15 | Học bạ ReportCard: GV nhập (tự đổ số liệu) → duyệt → phát hành → PH thấy + PDF | US-RC-1..2 | R7-08 | L | C1 số liệu tự đổ đúng từ Attendance/ExamAttempt (Vitest) · C2 2 khóa→2 học bạ riêng · C3 DRAFT/PENDING→PH không thấy (T4) · C4 phát hành→PH thấy+notify · C5 thu hồi-sửa-phát hành lại có log (T9) | TODO |
| R7-16 | Form builder 4 loại câu hỏi + đợt đánh giá GV (học viên) + khảo sát trung tâm (PH đủ điều kiện) | US-EVAL-1..3 | R7-09 | XL | C1 form 4 loại render đúng · C2 loại thứ 5 không tồn tại (inverse) · C3 form có response→chặn sửa phá vỡ (T7) · C4 HV chỉ thấy GV đã/đang dạy mình · C5 chống trùng đợt×enrollment×GV (T6) · C6 GV chỉ xem tổng hợp theo quyền, QL xem chi tiết (T4) · C7 khảo sát chỉ tới PH đủ điều kiện theo cơ sở (T5) | TODO |
| R7-17 | Thông báo 17 trigger + báo cáo 7 nhóm + Satacoin schema-only + regression tổng | US-NOTIF-1, US-RPT-1..3 | R7-01..16 | XL | C1 checklist 17 trigger từng dòng PASS · C2 handler idempotent (T6/T8) · C3 báo cáo trial/đào tạo/trung tâm số đúng (Vitest công thức) · C4 báo cáo đúng scope vai trò+cơ sở (T5) · C5 `CoinRuleConfig` schema migrate được, không UI · C6 regression: SR217 + convert R2 + portal R4 (T12) | TODO |

## 3. Traceability (Lớp 2 chống miss)

| Task | US | SRS | Test file dự kiến |
|---|---|---|---|
| R7-00 | — | §27.1 + audit C1–C3 | `tests/e2e/r7/security-gate.spec.ts` |
| R7-01 | US-LEAD-1..3 | §5, §7 | `r7/lead-child.spec.ts` + Vitest sla |
| R7-02 | US-TRIAL-1..5 | §6, §28.1 | `r7/trial-class.spec.ts` |
| R7-03 | US-CRS-1..3 | §9, §28.3 | `r7/course-pricing.spec.ts` + Vitest snapshot |
| R7-04 | US-PAY-1..4 | §10, §28.3 | `r7/payment-two-tier.spec.ts` + Vitest reminder |
| R7-05 | US-CONV-1..6 | §8, §26, §28.2 | `r7/convert-v2.spec.ts` |
| R7-06 | US-CLASS-1..3, US-PROG-3 | §11.7, §14, §28.6 | `r7/class-snapshot.spec.ts` |
| R7-07 | US-CLASS-4, US-SESS-1..2 | §15–16, §28.6/7 | `r7/session-lifecycle.spec.ts` |
| R7-08 | US-MKP-1..3 | §17, §28.9 | `r7/makeup-cross-center.spec.ts` + Vitest summary |
| R7-09 | US-PORTAL-1..2, US-MEDIA-1..3 | §18–19, §28.8 | `r7/portal-media.spec.ts` |
| R7-10 | US-PROG-1..2 | §11, §28.4 | `r7/curriculum-sessions.spec.ts` |
| R7-11 | US-SCORM-1,4 | §12.2–12.3/12.5, §28.4 | `r7/scorm-pipeline.spec.ts` |
| R7-12 | US-SCORM-2..3 | §12.1/12.4, §28.4 | `r7/scorm-player.spec.ts` |
| R7-13 | US-HW-1..2 | §13.1–13.4, §28.5 | `r7/exam-import-word.spec.ts` + Vitest parser |
| R7-14 | US-HW-3..4 | §13.5–13.6, §28.5 | `r7/homework-auto-assign.spec.ts` |
| R7-15 | US-RC-1..2 | §20, §28.8 | `r7/report-card.spec.ts` |
| R7-16 | US-EVAL-1..3 | §21, §28.8 | `r7/evaluation-survey.spec.ts` |
| R7-17 | US-NOTIF-1, US-RPT-1..3 | §23–24, §28.10 | `r7/notifications.spec.ts`, `r7/reports.spec.ts` |

Đối chiếu: `grep -r "\[R7-" tests/e2e/r7` so với cột "Test case bắt buộc" mục 2.

## 4. Exit Criteria (Lớp 3 — cổng đóng phase)

```
[ ] 100% task R7-00 → R7-17 = DONE (bảng mục 2 + bảng check trong từng ticket)
[ ] pnpm typecheck && lint (boundary) && build PASS
[ ] pnpm test:unit + pnpm test:e2e:r7 xanh toàn bộ; test:e2e:a0/r1..r5 không gãy (T12)
[ ] Mọi "Test case bắt buộc" có case tương ứng trong code (traceability mục 3)
[ ] Mọi mutation mới: can() đầu action + scopedDb + AuditLog (reason cho: thay SCORM lớp, điều chỉnh giao dịch, sửa mã HV, xếp bù chéo cơ sở)
[ ] Checklist 17 trigger thông báo tick từng dòng (R7-17)
[ ] DEMO đủ 10 kịch bản dưới — chạy thật trên staging có dữ liệu 2 cơ sở
```

### Kịch bản DEMO nghiệm thu (tối thiểu)

| # | Kịch bản | Task |
|---|---|---|
| D1 | **Trial end-to-end N buổi**: Đào tạo set N qua admin → Sale tạo lớp trải nghiệm (tự sinh N buổi) → thêm Lead 2 con → xếp 1 con vào lớp → QL gán GV → GV điểm danh đủ N buổi + nhận xét → LeadChild "Đã học thử" → Sale chuyển "Chờ quyết định" | R7-01,02 |
| D2 | **Convert chặn khi chưa thanh toán**: convert 0 đồng ghi nhận → lỗi PAYMENT_REQUIRED; Sale ghi nhận đợt 1 → lead REGISTERED → convert OK (2 con → 2 Enrollment, mã `CS1-26-XXXXXX`, consent tick có audit, email kích hoạt gửi) | R7-04,05 |
| D3 | **Thanh toán 2 tầng**: PH login portal CHƯA thấy khoản đợt 1 → Kế toán xác nhận thực thu → PH thấy + công nợ giảm; đặt đợt 2 với X=7 → đúng ngày D-7 sinh nhắc nợ | R7-04 |
| D4 | **Học bù LIÊN CƠ SỞ**: HS CS1 vắng buổi "Bài 5" → đề xuất gồm buổi CS1 (hiện trước) + CS2 → PH chọn CS2 gửi yêu cầu → QL duyệt (audit ghi từ-CS/sang-CS) → GV CS2 điểm danh "Học bù" → tiến độ lớp gốc cập nhật, 5 chỉ số portal đúng | R7-08 |
| D5 | **SCORM blur + watermark**: Đào tạo upload zip → publish → GV mở player (watermark tên+mã GV chạy); Alt-Tab/DevTools → màn phủ mờ; profile HV/PH mở URL → bị chặn; không có nút tải | R7-11,12 |
| D6 | **Import Word field-template có ảnh**: upload .docx 10 câu (2 câu có ảnh, 1 câu lỗi CORRECT_ANSWER) → preview báo đúng câu lỗi → sửa inline → import nháp → Đào tạo publish → bài gắn buổi 3 | R7-13 |
| D7 | **Auto-giao bài**: GV hoàn tất buổi 3 → bài tập tự giao toàn lớp với hạn mặc định → HV làm + nộp trong profile con | R7-07,14 |
| D8 | **PH không thấy nội dung câu hỏi**: site PH chỉ hiện "đã làm 3/5, đạt"; gọi API chi tiết câu hỏi bằng session PH → bị từ chối | R7-14 |
| D9 | **HV đánh giá GV qua form builder**: Admin dựng form (1 sao + 1 radio + 1 checkbox + 1 textbox) mở đợt giữa khóa → profile HV thấy đúng GV của mình → gửi → gửi lại bị chặn → QL xem chi tiết, GV xem tổng hợp | R7-16 |
| D10 | **Học bạ phát hành**: GV nhập học bạ (số liệu tự đổ) → QL duyệt + phát hành → PH thấy + tải PDF; bản DRAFT của khóa khác PH không thấy | R7-15 |

## 5. Rủi ro thực thi & phòng ngừa

| Rủi ro | Phòng ngừa |
|---|---|
| SCORM giải nén/serve trên Vercel serverless (timeout, size) | Job DB-backed queue + cron (Doc 15 Q4); upload multipart thẳng R2; spike kỹ thuật 1 ngày đầu R7-11; fallback: giới hạn size gói v1 |
| Parser Word .docx + ảnh nhúng phức tạp | Khóa template (file mẫu chuẩn); spike parser trước khi code UI; câu lỗi không chặn câu đúng |
| Đụng flow prod (convert/trial/lead enum) | 2-phase additive; regression T12 bắt buộc trong R7-01/05/17; KHÔNG drop cột cũ trong R7 |
| Học bù chéo cơ sở mở lỗ cách ly | Exception whitelist CHỈ luồng makeup + audit từng lượt + test T5 6 góc (R7-08-C4) |
| R6 chưa đóng C1–C3 đúng hạn | R7-00 là gate cứng — R7 không start khi gate đỏ; phần thiếu làm ngay trong R7-00 |
| Prod migrate treo (TBD-3) | Chốt với Owner trước ngày bắt đầu R7; mọi migration R7 xếp sau |

## 6. DoD phase (bổ sung trên DoD task chuẩn)

- Demo D1–D10 PASS trước Owner trên staging 2 cơ sở (CS1/CS2) + 3 role (Sale, Kế toán, GV) + 1 tài khoản PH 2 con.
- Cập nhật tài liệu cùng PR cuối: `Document/3-hien-trang/` (nếu lệch), doc 3/7/8/9 (schema/API/flow), CLAUDE.md mục hiện trạng nếu cấu trúc đổi.
- Biên bản nghiệm thu SCORM ghi wording trung thực giới hạn trình duyệt (QĐ-O5).
