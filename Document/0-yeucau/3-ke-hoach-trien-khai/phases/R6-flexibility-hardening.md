# Phase R6 — Flexibility & Hardening

> **Nguồn yêu cầu:** BA #04 `2-ba-phan-tich/04-ba-r6-flexibility-hardening.md` (BASELINE 11/06, cập nhật 12/06 theo QĐ-O2/O3/O7).
> **Quy trình:** theo `phases/00-quy-trinh-thuc-hien.md` — Task → Test → Check. Mỗi task có test case bắt buộc `[R6-x-Cn]`; không task nào DONE nếu thiếu test pass.
> **Mục tiêu:** (G1) vận hành tự chủ — đổi tham số không cần dev · (G2) thêm resource/role/khóa/cơ sở chi phí code tối thiểu · (G3) đóng lỗ nghiệp vụ B1–B4 · (G4) bật scopedDb + RBAC v2 + hardening.

## Hạ tầng test R6

- E2E: `playwright.r6.config.ts` (testDir `tests/e2e/r6`, Postgres LOCAL `.env.test`, port 3100, tái dùng `global-setup`).
- Unit: Vitest `lib/**/*.test.ts`.
- Lệnh: `pnpm test:e2e:r6` · `pnpm test:unit`.

## Bảng task (Lớp 1 chống miss task)

| Task ID | Epic | Mô tả | Ưu tiên | Phụ thuộc | Test case bắt buộc | Trạng thái |
|---|---|---|---|---|---|---|
| **R6-A** | A | SystemSetting + CenterSetting 2 tầng + service resolve (Center→Global→default) + UI admin + audit | Must | A0-01,06 | R6-A-T1(resolve/validate) · R6-A-T2(RBAC GLOBAL) · R6-A-T5(center isolation) · R6-A-T9(audit) | ✅ DONE |
| **R6-B1** | B | CommissionRateConfig trong DB (rate theo tier + effectiveFrom/To + trần) thay `DEFAULT_RATES` | Must | R6-A, R1 commission | R6-B1-T1(rate hiệu lực theo kỳ) · R6-B1-T2(trần) · R6-B1-T6(recalc DRAFT, APPROVED bất biến) · R6-B1-T9(audit) | ⏳ TODO |
| **R6-B2** | B | WorkShift per-center trong DB; check-in R5 đọc giờ/dung sai từ DB | Should | R6-A, R5 | R6-B2-T1(CRUD) · R6-B2-T7(ca đang dùng không xóa) · R6-B2-T12(seed 3 ca cũ) | ⏳ TODO |
| **R6-B3** | B | CourseCategory thành danh mục (model) — 2-phase, enum cũ giữ | Should | — | R6-B3-T1(thêm category→tạo course) · R6-B3-T7(category có course không xóa) · R6-B3-T12(backfill enum) | ⏳ TODO |
| **R6-B4** | B | Giá/gói khóa đọc từ DB (CoursePackage), public hiển thị giá DB | Must | R6-A | R6-B4-T1(public đọc giá DB) · R6-B4-T9(audit đổi giá) | ⏳ TODO |
| **R6-D1** | D | Action factory chuẩn (auth→can→zod→scopedDb→mutation→audit→revalidate) | Must | A0-03,04,06 | R6-D1-T1(factory happy) · R6-D1-T2(thiếu perm/schema fail) · R6-D1-T9(audit auto) · R6-D1-T5(scoped) | ✅ DONE |
| **R6-D2** | D | DataTable generic: sort/filter/pagination server-side + chọn cột | Should | R6-D1 | R6-D2-T1(sort/filter) · R6-D2-T11(pagination bắt buộc) | ⏳ TODO |
| **R6-D3** | D | Dashboard widget registry lọc theo `can()` (không theo tên role) | Should | A0-02,03 | R6-D3-T1(render theo perm) · R6-D3-T4(role mới thấy widget) | ⏳ TODO |
| **R6-D4** | D | Label/màu enum về 1 registry + exhaustiveness check | Should | — | R6-D4-T1(label lookup) · R6-D4-T2(enum thiếu label→fail) | ⏳ TODO |
| **R6-E1** | E | Học phí đóng đủ HOẶC 2 đợt (atomic khi convert) + màn công nợ | Must | R6-A, R2 | R6-E1-T1(2 đợt tổng khớp) · R6-E1-T2(tổng lệch→từ chối) · R6-E1-T6(atomic) | ⏳ TODO |
| ~~R6-E1b~~ | E | Nhắc nợ trước X ngày (X=setting) | Must | R6-E1 | — | ➡️ **R7-04** (QĐ-O7 12/06) |
| **R6-E2** | E | Chuyển lớp giữa kỳ **cùng mức phí** (atomic, check sức chứa, CM duyệt chéo cơ sở) | Must | R6-A | R6-E2-T1(transfer atomic) · R6-E2-T7(lớp đầy→chặn) · R6-E2-T9(audit+reason) | ⏳ TODO |
| ~~R6-E2b~~ | E | Hoàn tiền (RefundRequest, công thức) + clawback | Must | TBD-2 | — | ⛔ **BLOCKED TBD-2** (chưa code) |
| **R6-E3** | E | Bảo lưu: ParentRequest RESERVE → enrollment PAUSED + suspendedUntil (≤6 tháng=setting), atomic; nhắc đến hạn | Must | R6-A, R4 | R6-E3-T1(duyệt→PAUSED atomic) · R6-E3-T3(>6 tháng→từ chối) · R6-E3-T8(portal hiển thị) · R6-E3-T9(audit) | ⏳ TODO |
| ~~R6-E4~~ | E | Học bù chéo cơ sở | Must | — | — | ➡️ **R7-08** (QĐ-O2 12/06, đổi rule liên cơ sở) |
| **R6-F1** | F | ESLint chặn `@/lib/db` trong `app/**` → error; system-actor cho cron/webhook; whitelist→0 | Must | A0-04 | R6-F1-T2(isolation CI) · R6-F1-T10(lint error khi vi phạm) | 🟡 PARTIAL (rule+ratchet ON, system-actor; whitelist=201→giảm dần theo epic) |
| **R6-F2** | F | Bật RBAC v2: shadow-diff report = 0 N ngày → flag ON, rollback ≤5' | Must | A0-03 | R6-F2-T1(shadow-diff report) · R6-F2-T12(v1 vs v2 khớp) | ⏳ TODO |
| **R6-G2** | G | Chống race tiền/convert (idempotency + unique) | Should | R2 | R6-G2-T6(2 convert song song→1 bộ) · R6-G2-T6(double-confirm idempotent) | ⏳ TODO |
| **R6-G3** | G | 4 metric SLO + alert (event pending, webhook fail, email queue, cron) | Should | — | R6-G3-T1(ngưỡng→alert) · R6-G3-T6(dedupe) | ⏳ TODO |
| **R6-G1** | G | Restore-test backup runbook | Should | — | (runbook + checklist, không code) | 📄 DOC |
| **R6-C1** | C | Landing khóa học content-block (section registry) | Could | R6-B4 | R6-C1-T1(render section) · NFR perf | ⏳ TODO (sau Must/Should) |

> **Lưu ý hoãn theo BA (không phải miss task):**
> - **R6-E2b (hoàn tiền/clawback)** — BLOCKED bởi TBD-2 (công thức hoàn tiền chưa chốt). BA ghi rõ "KHÔNG code khi chưa chốt".
> - **R6-E4 (học bù chéo cơ sở)** — chuyển sang **R7-08** theo cập nhật 12/06 (rule đổi thành liên cơ sở mặc định).
> - **R6-E1b (nhắc nợ X ngày)** — chuyển **R7-04** theo QĐ-O7.

## Thứ tự thực thi (MoSCoW BA mục 5)

1. **Must đợt 1:** R6-A → R6-D1 + R6-F1
2. **Must đợt 2:** R6-E (E1 → E3 → E2) + R6-B1/B4
3. **Must đợt 3:** R6-F2 (bật RBAC v2 — đo shadow-diff từ đầu phase)
4. **Should:** R6-B2/B3 · R6-D2/D3/D4 · R6-G
5. **Could:** R6-C1

## Exit Criteria (cổng đóng phase — Lớp 3)

```
[ ] 100% task Must/Should = DONE (Could tùy thời lượng)
[ ] pnpm typecheck && pnpm lint && pnpm build PASS
[ ] pnpm test:unit + pnpm test:e2e:r6 xanh
[ ] Mọi "Test case bắt buộc" có case tương ứng (grep [R6- )
[ ] C1 (scopedDb whitelist=0) + C2 (RBAC v2 ON sau shadow-diff sạch) đóng
[ ] Mọi schema change additive (IR-7); mục TBD-2 ghi nợ rõ
```

## Traceability (Lớp 2) — cập nhật khi code

| Task | Test case ID | File test |
|---|---|---|
| R6-A | R6-A-T1-*, R6-A-T2-*, R6-A-T5-*, R6-A-T9-* | `lib/settings/*.test.ts`, `tests/e2e/r6/system-settings.spec.ts` |
| R6-D4 | R6-D4-T1-*, R6-D4-T2-* | `lib/labels/registry.test.ts` |
| … | (bổ sung theo tiến độ) | |
