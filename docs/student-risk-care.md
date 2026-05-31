# Cảnh báo rủi ro học viên + chăm sóc (Cụm B2)

Phát hiện học viên có nguy cơ rời bỏ → tạo cảnh báo + task chăm sóc cho SALES_CSM.

## Model

- `StudentRiskAlert` (type, severity LOW/MEDIUM/HIGH, status OPEN/RESOLVED/ESCALATED, detail).
- `StudentCareTask` (assignedToId, dueAt, status OPEN/DONE/CANCELLED, riskAlertId?).

## Điều kiện alert (`lib/risk/service.ts`)

| type | điều kiện | đã wire |
|---|---|---|
| CONSECUTIVE_ABSENCE | nghỉ 2 buổi ĐÃ DIỄN RA gần nhất liên tiếp (chưa bù) | ✅ sau điểm danh |
| HIGH_ABSENCE / MISSED_SUBMISSIONS / NEEDS_SUPPORT / NEARING_END_NO_RENEWAL / OVERDUE_PAYMENT | dùng `raiseRiskAlert` tại event/job tương ứng | helper sẵn |

- `raiseRiskAlert` **idempotent**: bỏ qua nếu đã có alert OPEN cùng loại; tạo kèm 1 care task (assign SALES_CSM cơ sở).
- `evaluateAbsenceRisk(studentId, classId)` gọi trong `markAttendance` cho HV bị đánh vắng.

## Hiển thị

- **Trung tâm "Cần xử lý"** (`lib/pending-tasks.ts`) + **chuông** (StaffNotification tự sync): nhóm
  `student_risk` (quản lý) + `student_care` (SALES_CSM: task của mình; quản lý: theo cơ sở).
- Admin `/canh-bao-rui-ro` (resolve/escalate) + `/cham-soc-hv` (hoàn tất task → đóng alert liên quan).

## Scope & audit

- Center scope: CM chỉ cơ sở mình; SALES chỉ task của mình. Gate `students:view-all`.

## Test (ZZTEST_)

1. HV nghỉ 2 buổi liên tiếp (điểm danh ABSENT) → sinh RiskAlert CONSECUTIVE_ABSENCE + CareTask.
2. Hiện ở dashboard "Cần xử lý" + chuông.
3. Resolve alert / hoàn tất care task → đóng (alert RESOLVED).

> Lưu ý: HV chưa có liên kết "SALES_CSM phụ trách" trực tiếp → care task tạm gán SALES_CSM active của
> cơ sở. Khi có field assignedSale trên Student, đổi `pickCsm` để gán đích danh.
