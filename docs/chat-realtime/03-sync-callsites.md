# 03 — US-03: checklist điểm gọi `syncConversationMembership` (AC5)

> Khảo sát 09/08/2026 trên nhánh `feat/chat-realtime`. Mỗi dòng = một điểm code làm
> thay đổi dữ liệu nguồn của membership nhóm lớp. **PR không merge nếu thiếu luồng**
> (US-03 AC5). Lưới cuối cho luồng sót: job đối soát đêm (US-04).
>
> Service: `lib/chat/sync-membership.ts` — `syncConversationMembership(tx, classId)`
> (per lớp) + `syncCenterClassConversations(tx, centerId)` (đổi QLCS) +
> `archiveClassConversation(tx, classId)` (sync tự gọi khi lớp COMPLETED/CANCELLED/xoá mềm).

## Quyết định thiết kế (chốt trong story này)

1. **"Học viên đang thuộc lớp"** = `ENROLLMENT_ACTIVE_STATUSES` (`lib/enrollment-status.ts`:
   `ACTIVE/CONFIRMED/STUDYING/PAUSED`, kèm `deletedAt: null`). Lý do: file này tự nhận là
   "nguồn chân lý DUY NHẤT cho học viên đang thuộc lớp" và là bộ mà roster điểm danh
   (`lib/attendance/roster.ts`), makeup, portal dùng. Hệ quả: **PAUSED (bảo lưu) vẫn ở lại
   nhóm** — bảo lưu/phục học KHÔNG cần sync. `PENDING` (chờ xếp lớp) chưa vào nhóm.
2. **GV** = `Class.teacherId` **và** `Class.assistantId` → `MODERATOR/CLASS_TEACHER`.
   Lý do: trợ giảng cũng đứng lớp (delta D: "phân công qua Class.teacherId / Class.assistantId");
   F-ANN cho phép GV gửi ANNOUNCEMENT — trợ giảng cần ngang quyền để thay GV chính báo lịch.
3. **Nguồn QLCS** = **hợp nhất v2 ∪ v1** như tiền lệ `getReconcileRecipients`
   (`app/api/cron/payment-reconcile/route.ts:39`): v2 = `UserOrgRole(status ACTIVE, hiệu lực
   theo effectiveFrom/To, role.code=CENTER_MANAGER)` tại OrgUnit có `centerId` = cơ sở lớp;
   v1 = `User.roles[]` chứa `CENTER_MANAGER` (fallback cột `role`) + `User.centerId` = cơ sở
   lớp; lọc tài khoản `isActive + deletedAt null`. Lý do: prod enforce v2 nhưng local/dev/CI
   chạy v1 (CLAUDE.md) — chỉ đọc một nguồn sẽ sai ở môi trường còn lại. QLCS =
   `MEMBER/CENTER_MANAGER` (chốt 07/08, không dùng OBSERVER).
4. **Ưu tiên tư cách** khi 1 user nhiều vai trong cùng lớp: `CLASS_TEACHER` >
   `CLASS_STUDENT_PARENT` > `CENTER_MANAGER` (1 user = 1 bản ghi participant).
5. **MANUAL không bị đụng** (BR-15): service chỉ tạo/sửa/set-leftAt bản ghi `source=DERIVED`.
6. **SYSTEM message**: chỉ khi GV/PH vào-rời nhóm SAU khi nhóm đã tồn tại; lần sync đầu
   (vừa tạo nhóm) không rải "đã tham gia" hàng loạt; QLCS vào/rời không sinh message.
   Không broadcast realtime (US-06/07), không đụng unreadCount (US-06).
7. **Lớp COMPLETED/CANCELLED/xoá mềm** → archive nhóm, **giữ nguyên participant**
   (BR-03/BR-04 — đọc lịch sử). Lớp ACTIVE trở lại mà nhóm đang ARCHIVED → mở lại;
   nhóm LOCKED không tự mở (khoá của Admin thắng).

## 1) Class chuyển trạng thái hoạt động (ACTIVE)

| Điểm gọi | Sự kiện | Wire |
|---|---|---|
| `app/(admin)/admin/classes/_actions.ts` — `createClass` (sync trong tx tạo lớp, sau `logClassAudit`) | Tạo lớp thẳng ở trạng thái ACTIVE (không qua duyệt) | ✅ cùng tx |
| `app/(admin)/admin/classes/_actions.ts` — `approveClass` (bọc `$transaction` mới quanh `class.update` → ACTIVE) | Duyệt lớp PENDING_APPROVAL → ACTIVE (điểm sinh nhóm chính — BR-01) | ✅ cùng tx |
| `app/(admin)/admin/classes/_actions.ts` — `updateClass` (sync trong tx update) | Sửa lớp đổi status → ACTIVE (form edit cho phép) | ✅ cùng tx |
| `app/api/admin/import/classes/route.ts` — vòng upsert/create trong `$transaction` | Import Excel tạo/sửa lớp với status tuỳ file (kể cả ACTIVE) | ✅ cùng tx |
| `submitClassForApproval` / `rejectClass` (cùng file classes/_actions.ts) | PLANNED↔RECRUITING↔PENDING_APPROVAL — chưa từng ACTIVE → chưa có nhóm | — không cần |

## 2) Đổi phân công GV (`Class.teacherId` / `assistantId`)

| Điểm gọi | Sự kiện | Wire |
|---|---|---|
| `app/(admin)/admin/classes/_actions.ts` — `updateClass` | Form sửa lớp đổi GV/TA | ✅ cùng tx |
| `app/(admin)/admin/teachers/_actions.ts` — `assignClassToTeacher` (bọc `$transaction` mới) | Gán GV/TA từ màn GV | ✅ cùng tx |
| `app/(admin)/admin/teachers/_actions.ts` — `unassignClassFromTeacher` (bọc `$transaction` mới) | Gỡ GV/TA (AC2 — leftAt + SYSTEM message cùng tx) | ✅ cùng tx |
| `app/api/admin/import/classes/route.ts` | Import đè teacherId/assistantId qua upsert theo classCode | ✅ cùng tx |

## 3) Học viên vào lớp (Enrollment create)

| Điểm gọi | Sự kiện | Wire |
|---|---|---|
| `app/(admin)/admin/enrollments/_actions.ts` — `createEnrollment` (bọc `$transaction` mới) | CRUD legacy, status tuỳ form | ✅ cùng tx |
| `app/(admin)/admin/enrollments/_actions.ts` — `enrollStudent` (trong `runSerializable`) | Ghi danh D5 (tạo PENDING → sync no-op, giữ điểm gọi cho nhất quán) | ✅ cùng tx |
| `app/(admin)/admin/class-groups/_actions.ts` — `enrollGroupIntoClass` (bọc tx per-HV) | Ghi danh CONFIRMED theo nhóm lớp cố định | ✅ cùng tx |
| `lib/crm/convert-lead-v2.ts` — `convertLeadV2` (trong tx, trước idempotencyKey; sync distinct classIds) | Convert lead → HV (màn convert đơn + **bulk-convert** + import lead registered đều đi qua đây) | ✅ cùng tx |
| `lib/crm/convert-lead.ts` — `convertLeadToEnrollment` (trong tx) | Convert v1 — **hiện không còn caller trong app** (giữ cho regression/flag), wire phòng khi được gọi lại | ✅ cùng tx |
| `lib/lms/assign.ts` — `assignEnrollments` (per-enrollment tx; sync lớp đích + lớp nguồn nếu đổi classId) | Gán HV vào lớp (R7-07) — enrollment CONFIRMED/PENDING đổi classId + STUDYING | ✅ cùng tx |
| `app/api/admin/import/students/route.ts` | Import HV — **chỉ tạo Student, KHÔNG tạo Enrollment** (đã kiểm) | — không cần |

## 4) Học viên chuyển lớp

| Điểm gọi | Sự kiện | Wire |
|---|---|---|
| `app/(admin)/admin/enrollments/_actions.ts` — `transferEnrollment` (trong `runSerializable`; sync lớp cũ + lớp mới) | Chuyển lớp D5 (TS-05: rời cũ + vào mới + SYSTEM cả 2 nhóm, rollback không nửa vời) | ✅ cùng tx |
| `lib/transfer/service.ts` — `approveTransfer` (trong tx, bước 3b; sync from + to) | Duyệt yêu cầu chuyển lớp/cơ sở (cụm C1) | ✅ cùng tx |
| `app/(admin)/admin/enrollments/_actions.ts` — `updateEnrollment` (bọc tx; sync lớp cũ + mới nếu đổi) | CRUD legacy đổi classId trần | ✅ cùng tx |
| `lib/lms/assign.ts` — `assignEnrollments` | Gán kéo enrollment từ lớp khác sang (xem mục 3) | ✅ cùng tx |

## 5) Học viên nghỉ / soft-unenroll

> Nhớ: `Enrollment.deletedAt` là **sổ sách tài chính** — gỡ HV khỏi lớp đi bằng ĐỔI STATUS
> (`lib/students/remove-from-classes.ts`); service membership lọc cả status lẫn deletedAt
> nên cả hai đường đều được bắt.

| Điểm gọi | Sự kiện | Wire |
|---|---|---|
| `app/(admin)/admin/enrollments/_actions.ts` — `changeEnrollmentStatus` (trong tx) | Đổi status đơn lẻ (→WITHDREW/COMPLETED/CANCELLED = rời; PENDING→CONFIRMED = vào) | ✅ cùng tx |
| `app/(admin)/admin/students/_actions.ts` — `withdrawStudentAction` (trong tx; sync distinct classIds) | HV nghỉ học → mọi ghi danh sống → WITHDREW (TS-06) | ✅ cùng tx |
| `lib/students/remove-from-classes.ts` — `removeStudentFromClasses` (cuối hàm, tx của caller) | Xoá HV (`deleteStudent`) → gỡ khỏi mọi lớp | ✅ cùng tx |
| `app/(admin)/admin/enrollments/_actions.ts` — `deleteEnrollment` + `deleteEnrollmentAction` (tx) | Xoá mềm ghi danh (chưa phát sinh nghiệp vụ) | ✅ cùng tx |
| `app/(admin)/admin/classes/_actions.ts` — `cancelClassAction` (trong tx, trước publishEvent) | Hủy lớp → rút mọi HV + archive nhóm | ✅ cùng tx |
| `reserveStudentAction` / `resumeStudentReserveAction` (`students/_actions.ts`) + `lib/students/reserve-service.ts` | Bảo lưu/phục học: STUDYING↔PAUSED — **cả hai đều thuộc bộ "đang thuộc lớp"** → membership không đổi | — không cần (quyết định 1) |
| `promoteConfirmedAction` (`classes/[id]/students/_actions.ts`) | CONFIRMED→STUDYING — cả hai trong bộ active | — không cần |
| `setEnrollmentSaleAction` | đổi sale phụ trách — không đụng membership | — không cần |

## 6) Đổi QLCS cơ sở

> Wire bằng `syncCenterClassConversations(tx, centerId)` — sync mọi lớp ACTIVE của cơ sở.

| Điểm gọi | Sự kiện | Wire |
|---|---|---|
| `app/(admin)/admin/users/_actions.ts` — `createUserAction` (sau `reconcileUserOrgRoles`, cùng tx) | Tạo tài khoản có vai CENTER_MANAGER | ✅ cùng tx |
| `app/(admin)/admin/users/_actions.ts` — `updateUserAction` (sau reconcile, cùng tx; sync cơ sở CŨ + MỚI khi bộ vai đụng CENTER_MANAGER) | Đổi vai trò/đơn vị tài khoản | ✅ cùng tx |
| `app/(admin)/admin/users/_actions.ts` — `toggleUserActiveAction` (trong tx) | Bật/tắt tài khoản QLCS (nguồn v1 lọc isActive) | ✅ cùng tx |
| `app/(admin)/admin/nhan-su/actions.ts` — `changeEmployeeRoleAction` (sau reconcile, cùng tx) | Đổi vai trò từ màn nhân sự | ✅ cùng tx |
| `lib/auth/rbac-service.ts` — `assignUserOrgRole` / `revokeUserOrgRole` (bọc `$transaction` mới quanh upsert/update + sync khi role.code=CENTER_MANAGER và OrgUnit có centerId) | Gán/thu hồi vai v2 tay ở /admin/users/[id]/org-roles | ✅ cùng tx ⚠️ |
| `deleteUserAction` (users/_actions.ts) | Xoá mềm tài khoản — chỉ cho phép khi ĐÃ vô hiệu hoá → membership đã được gỡ ở bước toggle | — không cần |
| Seed/script tay (`prisma/seed-roles.ts`, workflow Seed Production, SQL Editor) | Ngoài app — không wire được | ⚠️ dựa job đối soát US-04 |

⚠️ ở dòng rbac-service: hàm này trước đây KHÔNG có transaction; nay upsert/update + sync
được bọc tx (audit vẫn ngoài tx như cũ — không đổi hành vi audit). Nhờ chủ tọa review.

## 7) Lớp kết thúc

| Điểm gọi | Sự kiện | Wire |
|---|---|---|
| `app/(admin)/admin/classes/_actions.ts` — `updateClass` | Form sửa lớp đổi status → COMPLETED (đường duy nhất hiện có để "kết thúc" lớp — **không có action/cron riêng nào set COMPLETED**, đã grep toàn `app/` + `lib/`) | ✅ cùng tx (sync → archive) |
| `app/(admin)/admin/classes/_actions.ts` — `cancelClassAction` | Hủy lớp → CANCELLED | ✅ cùng tx |
| `app/(admin)/admin/classes/_actions.ts` — `deleteClass` | Xoá mềm lớp (`deletedAt`) | ✅ cùng tx |

## Ngoài phạm vi (có chủ đích)

- **Lớp trải nghiệm** (`TrialClass`/`TrialEnrollment`, `lib/trial/service.ts`,
  `app/(admin)/admin/trial-classes/**`): BA chỉ định nghĩa nhóm chat cho **lớp chính thức**
  (Class/Enrollment). Lead convert xong mới vào nhóm (qua convertLeadV2 — đã wire).
- **`lib/classes/session-sync.ts:286` / `phases-service.ts:465` / `snapshot.ts:120` /
  `classes/[id]/_schedule-actions.ts:394`** — `class.update` chỉ đổi field lịch/bản sao
  lịch, không đụng status/teacherId → không cần sync.
- **Đổi `Student.parentUserId`** không nằm trong 7 sự kiện của đề bài nhưng LÀ nguồn dẫn
  xuất → đã wire luôn: `createParentAccount` (link + siblings, cùng tx),
  `addChildToParent`, `unlinkChildFromParent` (bọc tx mới) — đều sync các lớp con đang học.
  `app/(admin)/admin/students/tai-khoan/_actions.ts` chỉ gửi ZNS/OTP, không đổi link → không cần.
- **Học viên xoá mềm** đi qua `deleteStudent` → `removeStudentFromClasses` (đã wire mục 5).
