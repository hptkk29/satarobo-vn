# Kế hoạch triển khai theo Phase — Index

> Kế hoạch chi tiết từng phase để **update dự án theo Doc 15 v2**, mỗi phase có **bộ test riêng (Playwright + Vitest)** và quy trình **Task → Testing → Check** chống miss task.

## Đọc theo thứ tự

1. **[00-quy-trinh-thuc-hien.md](00-quy-trinh-thuc-hien.md)** ⭐ — ĐỌC TRƯỚC. Vòng đời task, DoD checklist, tổ chức test, 3 lớp chống miss task, CI gate.
2. **[A0/](A0/README.md)** ⭐ — Phase nền: **9 task-ticket đầy đủ cấp giao việc** (test phủ tối đa). Bắt đầu ngay. ([A0-foundation.md](A0-foundation.md) = bảng tổng nhanh.)
3. [R1-crm-messenger.md](R1-crm-messenger.md) — SR217: Messenger + SLA + hoa hồng + CPL/CPA.
4. [R2-sis-finance.md](R2-sis-finance.md) — Chốt lead 1-transaction + invoice + activation.
5. [R3-lms-offline.md](R3-lms-offline.md) — Giáo trình + điểm danh + media consent + bài tập.
6. [R4-portal.md](R4-portal.md) — Portal phụ huynh + site từng con.
7. [R5-hr.md](R5-hr.md) — Chấm công QR + geofence (chỉ nhân viên) + DoD toàn core.
8. **R6 — Flexibility & Hardening** — spec tại BA #04 (`../../2-ba-phan-tich/04-ba-r6-flexibility-hardening.md`, baseline 11/06 + cập nhật 12/06); kế hoạch phase sẽ bung từ BA #04 (chưa lập ticket).
9. **[R7-lms-v3.1.md](R7-lms-v3.1.md)** + **[R7/](R7/README.md)** — LMS v3.1 (SRS chốt cuối 12/06): 18 ticket đầy đủ 11 mục, đợt R7a/R7b. 🟢 kế hoạch DUYỆT 12/06 — khởi động từ R7-00.

## Bảng tổng phase

| Phase | Nội dung | Thời lượng | Test suite | Cổng đóng |
|---|---|---|---|---|
| **A0** ✅ | Foundation (OrgUnit, RBAC động, scopedDb, login, outbox, audit) | ~3 tuần | `tests/e2e/a0` + Vitest | DoD A0 (6 demo) |
| **R1** ✅ | CRM Messenger + Marketing + Commission | ~5 tuần | `tests/e2e/r1` | Khớp 3 file Excel 1 tháng |
| **R2** ✅ | SIS + Finance conversion | ~2.5 tuần | `tests/e2e/r2` | Rollback transaction PASS |
| **R3** ✅ | LMS offline | ~3 tuần | `tests/e2e/r3` | Privacy media PASS |
| **R4** ✅ | Portal phụ huynh/học sinh | ~2 tuần | `tests/e2e/r4` | Không lộ studentId |
| **R5** ✅ | HR nhân viên | ~1.5 tuần | `tests/e2e/r5` | DoD toàn core 18 điểm |
| **R6** 🟡 | Flexibility & Hardening (settings động, B1–B4, **vá C1–C3**) | ~3 tuần (ước) | `tests/e2e/r6` | C1–C3 CLOSED + audit cập nhật |
| **R7** 🟢 kế hoạch duyệt 12/06 | LMS v3.1 — R7a lõi vận hành / R7b nội dung đào tạo (18 ticket) | ~8 tuần (4+4) | `tests/e2e/r7` | Exit Criteria + demo D1–D10 ([chi tiết](R7-lms-v3.1.md)) |

> Core A0→R5 đã đóng 2026-06-10. R6/R7 theo QĐ-O1 (TGĐ 12/06): R6 đi trước làm điều kiện tiên quyết; R7-00 là gate kiểm tra C1–C3 trước khi code LMS v3.1.

## Nguyên tắc bất biến (mọi phase)

1. Không task nào DONE nếu thiếu test pass.
2. Mỗi task có ID truy vết: kế hoạch → commit → `test.describe([id])` → bảng check.
3. Phase chỉ đóng khi đủ Exit Criteria (100% task + test:phase xanh + traceability đủ + demo được).
4. Test ID `[<phase>-<task>-C<n>]` khớp 1-1 với cột "Test case bắt buộc" → grep ra ngay case còn thiếu.
5. Tuân Doc 15: scopedDb, can() v2, module boundary, event cho side-effect, audit cho mutation nhạy cảm.
