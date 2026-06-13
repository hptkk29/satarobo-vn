# R7-17 — Thông báo 17 trigger + Báo cáo 7 nhóm + Satacoin schema + Regression tổng

**ID** R7-17 · **PR** 3 (PR1 notif checklist, PR2 báo cáo, PR3 satacoin schema + regression) · **Ưu tiên** P1 (đóng phase) · **Ước lượng** XL · **Phụ thuộc** R7-01…R7-16 (đi cuối) · **Trạng thái** TODO · **US** US-NOTIF-1, US-RPT-1..3 · **SRS** §23–24, §2 (Satacoin), §28.10

## 1. Mục tiêu & bối cảnh
Các ticket trước đã emit event tại nguồn; ticket này đảm bảo PHỦ ĐỦ 17 trigger SRS §23 (kể cả trigger không thuộc ticket nào: bài tập sắp hết hạn, công nợ quá hạn), dựng các báo cáo còn thiếu (§24), chuẩn bị schema Satacoin config (PENDING — QĐ-O10/20 SRS), và chạy regression khép phase.

## 2. Phạm vi
- **In:** bảng rà 17 trigger (mỗi dòng: event nguồn → handler → in-app/email → test) — bổ sung trigger thiếu: bài tập sắp hết hạn (cron), công nợ quá hạn (cron có sẵn — nối nhãn), khảo sát/đánh giá đang mở; báo cáo: Lead mở rộng + lớp trải nghiệm + đào tạo + trung tâm (học viên/lớp/tài chính tái dùng + bổ sung trường); scope theo vai trò + cơ sở; snapshot/cache cho báo cáo nặng; `CoinRuleConfig` schema-only (hành vi–điểm–trần–nguồn, nguồn dự kiến: bài tập/đánh giá GV/khảo sát PH — KHÔNG UI, KHÔNG runtime); regression T12 toàn hệ (SR217, convert R2 cũ qua flag, portal R4, makeup R3).
- **Out:** Satacoin tích điểm/đổi quà (PENDING — chờ TGĐ ban hành bảng quy đổi) · Zalo ZNS (backlog) · dashboard 3 tầng nâng cao (backlog Phiếu #01).

## 3. Thiết kế kỹ thuật
- Notif: handler per event (DomainEvent outbox A0-07, idempotent theo eventId), template registry (in-app `Notification` audience đúng đối tượng + email Resend theo loại); cron `assignment-due-soon` (D-1 hạn nộp, chống spam dedupeKey); tất cả nằm ngoài transaction nghiệp vụ.
- Báo cáo: trang `/admin/bao-cao/{trial,dao-tao,trung-tam}` + mở rộng lead report; công thức trong `lib/reports/*.ts` (Vitest); báo cáo trung tâm dùng snapshot tuần (pattern MarketingReport); mọi query qua scopedDb (HO role xem toàn hệ thống theo chức năng).
- `CoinRuleConfig{id, behaviorKey, points Int, dailyCap?, totalCap?, source enum(HOMEWORK_RESULT/TEACHER_EVAL_DONE/CENTER_SURVEY_DONE), active default false}` — migration + seed rỗng; không code đọc runtime.

## 4. Acceptance Criteria
- AC1: 17/17 dòng checklist trigger có handler + test pass; replay event không gửi trùng; handler lỗi → retry outbox, không chặn flow nguồn.
- AC2: Báo cáo lớp trải nghiệm/đào tạo/trung tâm số đúng theo định nghĩa SRS §24 (Vitest công thức từng chỉ số: tỷ lệ đủ N buổi, trial→đăng ký, buổi thiếu SCORM/bài tập, chuyên cần, học bù, hài lòng, tái tục).
- AC3: QL@CS1 chỉ thấy số CS1; HO thấy toàn hệ thống; export đúng scope (T5 cả 6 góc cho 1 báo cáo đại diện).
- AC4: Migration CoinRuleConfig chạy được; không route/UI nào tham chiếu (grep = 0 ngoài schema).
- AC5: Regression: `test:e2e:a0…r5` + smoke SR217 funnel/hoa hồng + convert flag OFF + portal R4 — tất cả xanh.

## 5. Files dự kiến
`lib/events/handlers/*` (bổ sung) · `app/api/cron/assignment-due-soon/route.ts` (+vercel.json) · `lib/reports/{trial.ts,training.ts,center.ts}` (+tests) · `app/(admin)/admin/bao-cao/*` · migration `add_coin_rule_config` · `tests/e2e/r7/{notifications,reports}.spec.ts`.

## 6. Edge cases & xử lý lỗi
PH tắt email (bounce) → in-app vẫn ghi, không retry vô hạn · trigger dồn dập (giao bài cả lớp 30 HV) → batch insert Notification · báo cáo kỳ chưa có dữ liệu → render 0 thay vì lỗi · timezone VN cho mốc "sắp hết hạn".

## 7. Rollback / Feature flag
Handler tắt được từng cái (registry); báo cáo là trang đọc — ẩn menu; CoinRuleConfig trơ (active=false).

## 8. Test plan
| Case ID | Nhóm | B/E | Bước | Kết quả | Tool |
|---|---|---|---|---|---|
| R7-17-C1 | T1 | B | bảng 17 trigger — kích từng sự kiện trên staging seed | 17/17 in-app (+email loại tương ứng) | Playwright (param) |
| R7-17-C2 | T6/T8 | B | replay 3 event đại diện; mock handler lỗi | không trùng; retry outbox | Vitest |
| R7-17-C3 | T1 | B | công thức báo cáo (fixtures) | từng chỉ số đúng | Vitest |
| R7-17-C4 | T5 | B | QL@CS1 vs HO mở 3 báo cáo + export | scope đúng 6 góc | Playwright |
| R7-17-C5 | T1 | B | migrate CoinRuleConfig | OK; grep tham chiếu runtime = 0 | CI |
| R7-17-C6 | T12 | B | chạy full test:phase các suite cũ | xanh toàn bộ | CI |

## 9. Test data
Seed staging 2 cơ sở đầy đủ vòng đời (trial→convert→lớp→buổi→bù→học bạ→đánh giá) — tái dùng seed các ticket trước.

## 10. RTM
AC1↔C1,C2 · AC2↔C3 · AC3↔C4 · AC4↔C5 · AC5↔C6.

## 11. DoD
DoD chuẩn + Exit Criteria phase (R7-lms-v3.1.md mục 4) + demo D1–D10 tổng duyệt trước Owner.
