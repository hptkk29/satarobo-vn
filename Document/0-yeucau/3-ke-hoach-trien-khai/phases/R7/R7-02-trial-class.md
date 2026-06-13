# R7-02 — Lớp trải nghiệm N buổi end-to-end

**ID** R7-02 · **PR** 3 (PR1 config+schema, PR2 lớp+xếp chỗ, PR3 điểm danh+trạng thái) · **Ưu tiên** P1 · **Ước lượng** XL · **Phụ thuộc** R7-01 · **Trạng thái** TODO · **US** US-TRIAL-1..5 · **SRS** §6, §28.1 · **QĐ** O10 (N buổi linh động)

## 1. Mục tiêu & bối cảnh
`TrialClass` hiện tại = 1 buổi học thử cá nhân/lead (schema:3182–3206) — không đáp ứng mô hình "lớp trải nghiệm có danh sách, N buổi, sức chứa, GV". Xây mô hình lớp theo SRS §6 với N buổi do Đào tạo cấu hình (QĐ-O10).

## 2. Phạm vi
- **In:** cấu hình số buổi (Đào tạo); model lớp trải nghiệm mới + buổi + ghi danh + điểm danh; ràng buộc 1 LeadChild/1 lớp active; sức chứa + override có quyền; GV điểm danh/nhận xét; auto "Đã học thử" sau buổi cuối; trạng thái lead đồng bộ (R7-01).
- **Out:** chuyển đổi trial→official (R7-05); báo cáo trial (R7-17); TrialClass cũ — giữ đọc-only 2-phase, không migrate.

## 3. Thiết kế kỹ thuật
- Config: `TrialProgramConfig{id, name, sessionCount Int, active, updatedBy}` — chỉ Đào tạo/Admin sửa (can `training:manage`), audit. Seed: Robosim N=4.
- `TrialClassV2{id, code, name, type='TRIAL_ROBOSIM', centerId!, roomId?, startDate, startTime/endTime, capacity, teacherId?, assistantId?, status(OPEN/RUNNING/COMPLETED/CANCELLED), configId, sessionCount snapshot}`.
- `TrialClassSession{id, trialClassId, seq 1..N, date, startTime, endTime, roomId?, teacherId?, status}` — sinh tự động khi tạo lớp (tái dùng pattern `lib/classes/generate.ts`, né Holiday); từng buổi chỉnh riêng được.
- `TrialEnrollment{id, trialClassId, leadChildId, status(ACTIVE/COMPLETED/WITHDRAWN), addedById}` + **partial unique** `(leadChildId) WHERE status='ACTIVE'`.
- `TrialAttendance{id, trialSessionId, trialEnrollmentId, status(PRESENT/ABSENT), note}` + unique (trialSessionId, trialEnrollmentId). Nhận xét học thử: note per buổi + tổng kết trên TrialEnrollment (tái dùng tinh thần TrialFeedback).
- Service `lib/trial/service.ts`: createTrialClass (tx sinh buổi) · enroll (check capacity, override cần can `trial:override-capacity` + audit) · markAttendance · completeSession; buổi cuối có điểm danh → LeadChild.trialStatus=ATTENDED + nếu mọi LeadChild xét xong → Lead=TRIAL_ATTENDED (event, idempotent). Lead KHÔNG auto sang AWAITING_DECISION.
- Sale tạo lớp + xếp chỗ (can `trial:manage`); QL cơ sở gán GV (can `trial:assign-teacher`); GV chỉ điểm danh lớp mình.

## 4. Acceptance Criteria
- AC1: Đào tạo đổi N=4→5 → lớp mới sinh 5 buổi; lớp cũ giữ nguyên (sessionCount snapshot).
- AC2: Tạo lớp → tự sinh đủ N buổi đúng lịch; chỉnh từng buổi (ngày/giờ/phòng/GV) được, có history.
- AC3: LeadChild đang ACTIVE ở lớp khác → xếp lớp 2 bị từ chối; 2 con cùng lead học 2 lớp khác nhau OK.
- AC4: Vượt capacity → cảnh báo; chỉ người có quyền override (audit).
- AC5: GV điểm danh + nhận xét per buổi per LeadChild; buổi cuối xong → "Đã học thử" tự động; lead không auto "Chờ quyết định".
- AC6: Lớp gắn centerId; cơ sở khác không thấy (T5).

## 5. Files dự kiến
schema + migration `add_trial_class_v2` · `lib/trial/service.ts` (+`.test.ts`) · `app/(admin)/admin/trial-classes/{page,new,[id],actions}.tsx` · sửa `app/(admin)/admin/leads/[id]` (xếp con vào lớp) · `tests/e2e/r7/trial-class.spec.ts`.

## 6. Edge cases & xử lý lỗi
N giảm khi lớp đang chạy → không ảnh hưởng lớp cũ · LeadChild withdrawn giữa chừng → buổi còn lại không bắt điểm danh · lớp CANCELLED → mọi TrialEnrollment ACTIVE → WITHDRAWN + giải phóng unique · trùng lịch GV giữa 2 lớp trial → cảnh báo (không chặn cứng v1) · Holiday đè ngày buổi → dời như official class.

## 7. Rollback / Feature flag
Bảng mới độc lập — rollback = ẩn menu admin. TrialClass cũ không đụng. Không flag.

## 8. Test plan
| Case ID | Nhóm | B/E | Bước | Kết quả | Tool |
|---|---|---|---|---|---|
| R7-02-C1 | T1 | B | config N=4→5, tạo lớp mới | lớp mới 5 buổi, lớp cũ 4 | Playwright |
| R7-02-C2 | T1 | B | tạo lớp | sinh đủ N buổi đúng thứ/giờ, né Holiday | Vitest service |
| R7-02-C3 | T7/T6 | B | xếp 1 LeadChild vào 2 lớp active | lớp 2 reject (unique partial) | Vitest |
| R7-02-C4 | T3 | B | capacity 8, thêm người thứ 9 | cảnh báo; override bởi QL → OK + audit | Playwright |
| R7-02-C5 | T1 | B | điểm danh đủ N buổi | LeadChild=Đã học thử; lead=TRIAL_ATTENDED khi mọi con xong | Playwright |
| R7-02-C6 | T7 | B | sau C5, kiểm tra lead | KHÔNG auto AWAITING_DECISION | Vitest |
| R7-02-C7 | T4 | B | Sale gán GV / GV tạo lớp / Sale sửa config N | đều bị chặn đúng ma trận | Playwright |
| R7-02-C8 | T5 | B | Sale@CS2 mở lớp trial CS1 (list/get-by-id) | không thấy/404 | Playwright |
| R7-02-C9 | T2 | E | tạo lớp thiếu giờ/capacity 0/ngày quá khứ | Zod reject | Vitest |

## 9. Test data
Config Robosim N=4; CS1/CS2 mỗi bên 1 lớp; lead 2 con; GV@CS1; Holiday 1 ngày trùng lịch.

## 10. RTM
AC1↔C1 · AC2↔C2 · AC3↔C3 · AC4↔C4 · AC5↔C5,C6 · AC6↔C8 · quyền↔C7 · validation↔C9.

## 11. DoD
DoD chuẩn + demo D1 chạy được trên staging.
