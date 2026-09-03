# Kế hoạch sửa — QA site giáo viên vòng 1 (28/08/2026)

> Nguồn: báo cáo QA black-box trên `test.satarobo.vn`, 28/08/2026.
> Đối chiếu mã nguồn: nhánh `fix/site-gv-qa-2808`, cắt từ `origin/test` (`054987c8`).
> Cách làm: 34 agent — 4 lập bản đồ nền tảng, 14 điều tra theo cụm, 14 phản biện chéo, 1 soát độ phủ, 1 lập kế hoạch.

## Kết luận tổng

42 mã QA báo đều đã được kiểm chứng trên mã nguồn: ~34 là bug THẬT (5 HIGH, 12 MEDIUM, còn lại LOW/cosmetic), 5 là SEED_DATA_ONLY (BUG-033, BUG-009, NV-005, phần lớn BUG-004, một phần BUG-037/038), 1 là NOT_A_BUG (mâu thuẫn biểu kiến giữa BUG-017 và BUG-002 — cả hai đều đúng, nói về hai cột khác nhau), và 0 mã đã được vá sẵn trên origin/test. Điểm quan trọng nhất: 42 vé gom về 9 nguyên nhân gốc, trong đó 3 cái đầu (định nghĩa roster, định nghĩa 'buổi đã điểm danh', ba cổng đọc Class) chiếm hơn nửa số vé — vá đúng 3 helper ở tầng lib là dập được ~20 vé cùng lúc, còn vá lẻ từng màn thì chắc chắn đẻ ra hình dạng thứ 6 và thứ 7. Kế hoạch chia 10 đợt: Đ1 dựng lib thuần (0 rủi ro), Đ2 CSS/bảng (rẻ, rộng, độc lập), Đ3-Đ4 là hai đợt HIGH chạm nghiệp vụ hàng ngày, Đ8 gộp 4 vé cùng đè 2 file, Đ10 dọn seed PHẢI chạy trước khi mời QA nghiệm thu lại. Ba việc bị chặn bởi quyết định của chủ dự án; BUG-032 chưa có dữ liệu vì bản QA report không nằm trong repo.

## Bảng kết luận theo mã QA

| Mã | Kết luận | Mức (đã hiệu chỉnh) | Nhóm gốc | Công |
|---|---|---|---|---|
| BUG-001 | Đúng như QA mô tả | MEDIUM | RC-2 | M |
| BUG-002 | Đúng như QA mô tả | HIGH | RC-2 | L |
| BUG-003 | Đúng như QA mô tả | HIGH | RC-4 | M |
| BUG-004 | Có thật, nguyên nhân KHÁC | LOW | RC-2 | S |
| BUG-005 | Đúng như QA mô tả | LOW | RC-5 | M |
| BUG-006 | Đúng như QA mô tả | LOW | RC-5 | S |
| BUG-007 | Đúng như QA mô tả | LOW | RC-5 | S |
| BUG-008 | Có thật, nguyên nhân KHÁC | MEDIUM | RC-5 | S |
| BUG-009 | Chỉ do dữ liệu seed | LOW | RC-5 | S |
| BUG-010 | Đúng như QA mô tả | MEDIUM | RC-4 | M |
| BUG-011 | Đúng như QA mô tả | LOW | RC-3 | S |
| BUG-012 | Đúng như QA mô tả | LOW | RC-1 | S |
| BUG-013 | Có thật, nguyên nhân KHÁC | LOW | RC-5 | S |
| BUG-014 | Có thật, nguyên nhân KHÁC | MEDIUM | RC-1 | S |
| BUG-015 | Đúng như QA mô tả | LOW | RC-5 | S |
| BUG-016 | Đúng như QA mô tả | LOW | RC-2 | S |
| BUG-017 | Đúng như QA mô tả | LOW | RC-5 | M |
| BUG-018 | Đúng như QA mô tả | MEDIUM | RC-4 | S |
| BUG-019 | Đúng như QA mô tả | LOW | RC-6 | S |
| BUG-020 | Có thật, nguyên nhân KHÁC | LOW | RC-6 | S |
| BUG-021 | Đúng như QA mô tả | MEDIUM | RC-1 | M |
| BUG-022 | Đúng như QA mô tả | LOW | RC-4 | M |
| BUG-023 | Đúng như QA mô tả | MEDIUM | RC-5 | S |
| BUG-024 | Có thật, nguyên nhân KHÁC | MEDIUM | RC-1 | M |
| BUG-025 | Đúng như QA mô tả | HIGH | RC-1 | L |
| BUG-026 | Có thật, nguyên nhân KHÁC | MEDIUM | RC-3 | S |
| BUG-028 | Đúng như QA mô tả | HIGH | RC-5 | L |
| BUG-029 | Đúng như QA mô tả | MEDIUM | RC-2 | M |
| BUG-030 | Đúng như QA mô tả | LOW | RC-6 | S |
| BUG-031 | Có thật, nguyên nhân KHÁC | LOW | RC-6 | M |
| BUG-033 | Chỉ do dữ liệu seed | MEDIUM | RC-5 | L |
| BUG-034 | Đúng như QA mô tả | MEDIUM | RC-3 | S |
| BUG-035 | Có thật, nguyên nhân KHÁC | LOW | RC-6 | M |
| BUG-036 | Đúng như QA mô tả | MEDIUM | RC-2 | M |
| BUG-036-layout | Có thật, nguyên nhân KHÁC | MEDIUM | RC-3 | S |
| BUG-037 | Có thật, nguyên nhân KHÁC | LOW | RC-6 | M |
| BUG-038 | Có thật, nguyên nhân KHÁC | MEDIUM | RC-5 | L |
| BUG-039 | Đúng như QA mô tả | LOW | RC-6 | S |
| NV-002 | Có thật, nguyên nhân KHÁC | LOW | RC-7 | M |
| NV-003 | Có thật, nguyên nhân KHÁC | LOW | RC-7 | S |
| NV-004 | Có thật, nguyên nhân KHÁC | LOW | RC-7 | S |
| NV-005 | Chỉ do dữ liệu seed | LOW | RC-5 | M |
| RISK-001 | Đúng như QA mô tả | — | RC-5 | L |

## Nguyên nhân gốc

### RC-1 — Không có định nghĩa duy nhất cho "ai đang trong lớp này"

22 truy vấn `enrollments: { where }` lồng trong app/(teacher) có 5 hình dạng: đủ 3 tầng (status + deletedAt + student.deletedAt) chỉ 5 chỗ; 2 tầng 3 chỗ; CHỈ status 12 chỗ; CHỈ deletedAt 2 chỗ. Gốc sâu: lib/db.ts:62-66 nói rõ hook soft-delete KHÔNG chạy cho nested include/_count nên mỗi chỗ đọc lồng phải TỰ nhớ — tỉ lệ nhớ đúng đo được 23%; hai chỗ trong CÙNG file cách nhau 9 dòng đã lệch (hub-sessions-tab.tsx:103 vs :112). Sửa ở đâu: một helper rosterWhere(scope) trong lib/enrollment-scope.ts + test quét mã ép mọi chỗ đọc đi qua nó (3 guard IDOR khai miễn trừ kèm lý do).

**Dập được:** BUG-024, BUG-012, BUG-013, BUG-014, BUG-021, BUG-025, extraIssue sĩ số ho-so, extraIssue học bạ liệt kê PENDING, extraIssue roster nhận xét, extraIssue PDF học bạ cho HV đã xoá

**File chính:**

- `lib/enrollment-scope.ts`
- `lib/enrollment-status.ts`
- `app/(teacher)/teacher/cham-bai/page.tsx`
- `app/(teacher)/teacher/lop/page.tsx`
- `app/(teacher)/teacher/hoc-vien/page.tsx`
- `app/(teacher)/teacher/hoc-ba/page.tsx`
- `app/(teacher)/teacher/ho-so/page.tsx`

### RC-2 — "Buổi đã điểm danh" = có ≥1 dòng Attendance, thay vì phủ đủ roster

Hàm đúng đã tồn tại (attendanceCoversRoster — lib/lms/session-order.ts:106; sessionWorkState — lib/lms/attendance-queue.ts:105, admin đang dùng) nhưng 5 chỗ ĐỌC của site GV vẫn dùng tiêu chí yếu: teacher/page.tsx:208, lop/page.tsx:423 và :277, diem-danh/page.tsx:174, hub-sessions-tab.tsx:241. Ngòi nổ trên PROD chứ không riêng UAT: duyệt phiếu xin nghỉ của phụ huynh upsert ĐÚNG MỘT dòng Attendance (admin/parent-requests/actions.ts:129) ⇒ buổi rơi khỏi mọi danh sách việc cần làm của GV, kèm pill xanh 'Có mặt 0/12'. Sửa ở đâu: một hàm đếm dùng chung (lib/lms/attendance-pending.ts + sessionsMissingAttendance), mọi chỗ đọc gọi nó.

**Dập được:** BUG-002, BUG-029, BUG-016, BUG-030, BUG-001 (họ hàng), extraIssue duyệt phiếu PH, extraIssue màn Điểm danh xuyên lớp, extraIssue hai cột chọi nhau ở Class Hub

**File chính:**

- `lib/lms/attendance-pending.ts`
- `lib/lms/attendance-queue.ts`
- `app/(teacher)/teacher/page.tsx`
- `app/(teacher)/teacher/lop/page.tsx`
- `app/(teacher)/teacher/diem-danh/page.tsx`
- `app/(teacher)/teacher/lop/_components/hub-sessions-tab.tsx`

### RC-3 — Site GV đọc model Class qua BA cổng khác nhau — lệch quyền suy thoái IM LẶNG

Cổng 1 `actor.assignedClassIds` dùng db THÔ (actor.ts:443, không lọc cơ sở, không lọc status). Cổng 2 scopedDb — 24 điểm gọi, Class ∈ SCOPED_MODELS nên bị chèn `centerId IN (visibleCenterIds)` trần (db-scope.ts:452), và Class không ∈ NULL_IS_GLOBAL_MODELS nên không có nhánh OR-null. Cổng 3 withMakeupException — 7 màn, Class ∈ MAKEUP_EXCEPTION_MODELS nên KHÔNG có cách ly nào. visibleCenterIds dựng THUẦN từ UserOrgRole (actor.ts:379), không có đường lùi về User.centerId ⇒ GV thiếu UserOrgRole (đúng sự cố RC-A/K1 trên prod 07/08) có đủ lớp nhưng visibleCenterIds=[] ⇒ 24 màn trả rỗng, mỗi màn hỏng một kiểu (x/0, lưới trắng, 404 'không thuộc lớp bạn phụ trách') mà không lỗi nào bắn ra. Hệ quả B: cách ly của 7 màn cổng 3 chỉ treo vào mệnh đề `id: { in: classIds }`.

**Dập được:** cơ chế thứ hai của BUG-025, extraIssue 404 PDF học bạ nói sai nguyên nhân, phòng ngừa cho Đ3/Đ4

**File chính:**

- `lib/auth/actor.ts`
- `lib/db-scope.ts`
- `app/(teacher)/teacher/hoc-ba/pdf/[enrollmentId]/route.ts`
- `app/(teacher)/teacher/lich/page.tsx`

### RC-4 — Hồ sơ học viên không có khái niệm "đang xem lớp nào"

Hợp đồng URL chỉ có {s, ptab} (hoc-vien/page.tsx:138); sau guard IDOR trang bơm TẤT CẢ lớp em đó còn ghi danh vào 3/4 tab (:260/:268/:276) nên nhiều lớp × nhiều khoá trộn thành một dòng thời gian. Tab Học bạ thoát vì lặp theo TỪNG ghi danh (:774). Kèm: badge trạng thái lấy enrollments[0] từ truy vấn KHÔNG có orderBy; ProfileTabBar (:391) dựng href chỉ-query nên mọi tham số ngữ cảnh thêm vào sẽ rơi khi đổi tab. Sửa ở đâu: hàm thuần lib/teacher/profile-scope.ts + chip chọn lớp + href tab mang classId + 3 nơi gọi truyền ngữ cảnh.

**Dập được:** BUG-003, BUG-018, BUG-010, BUG-014 (phần hiển thị)

**File chính:**

- `lib/teacher/profile-scope.ts`
- `app/(teacher)/teacher/hoc-vien/page.tsx`
- `app/(teacher)/teacher/hoc-vien/_components/student-list.tsx`
- `app/(teacher)/teacher/lop/_components/hub-students-tab.tsx`

### RC-5 — Nhãn suy từ cột thô thay vì đi qua thư viện nhãn dùng chung

Thư viện đã có (deriveSessionLabel, lib/labels/registry.ts, REPORT_CARD_STATUS_LABEL) nhưng 9 chỗ vẫn in ClassSession.topic thô ('Buổi 10 · Buổi 10' trên UAT, 'Buổi học: Buổi học' trên PDF gửi phụ huynh ở prod), 3 bản chép tay SUBMISSION_STATUS lệch nhau (bản trong hồ sơ HV rút còn 2 nhãn, mất 'Nộp muộn'/'Đã chấm'), bảng nhãn học bạ chép tay lệch chữ với /teacher/hoc-ba, và ô trạng thái điểm danh suy từ sự tồn tại bản ghi nên buổi quá khứ chưa chấm in 'Chưa diễn ra'.

**Dập được:** BUG-008, BUG-001, NV-003, BUG-010 (nhãn), extraIssue PDF phiếu nhận xét, extraIssue màn Điểm danh của lớp, extraIssue 9 chỗ in topic thô

**File chính:**

- `lib/labels/registry.ts`
- `lib/lms/report-card-core.ts`
- `lib/lms/student-attendance-cell.ts`
- `app/(teacher)/teacher/hoc-vien/page.tsx`
- `app/(teacher)/teacher/nhan-xet/pdf/[sessionId]/[studentId]/route.ts`

### RC-6 — Cột text tự do bị nowrap trong bảng table-layout:auto

`whitespace-nowrap`/`truncate` đặt trên ô chứa TEXT TỰ DO làm min-content của cột BẰNG max-content, bảng không co được và tràn ngang (đo được 2119px trong khung 883px). Repo đã chẩn đoán và vá đúng một lần (class-list.tsx:214-217 kèm chú thích). Điểm then chốt cho bản vá: `max-width` trên `<td>` là hành vi CSS 2.1 §17.5.2 để UNDEFINED và Chrome/Firefox bỏ qua ở table-layout:auto — trần phải đặt trên phần tử KHỐI BÊN TRONG ô (tiền lệ lesson-table.tsx:141); `min-w` trên td thì dùng được.

**Dập được:** BUG-026, BUG-034, BUG-036-layout, extraIssue 4 bảng nowrap tên khoá, extraIssue truncate không trần

**File chính:**

- `app/(teacher)/teacher/cham-bai/_components/assignment-list.tsx`
- `app/(teacher)/teacher/tai-lieu/_components/course-materials-list.tsx`
- `app/(teacher)/teacher/trial/_components/trial-list.tsx`
- `app/(teacher)/teacher/hoc-ba/_components/report-cards-list.tsx`

### RC-7 — Trạng thái danh sách sống trong bộ nhớ component, còn ô nhớ số dòng thì dùng chung toàn cục

10 màn dùng ListToolbar giữ bộ lọc bằng useState thuần ⇒ không chia sẻ link, Back/F5 mất sạch; riêng /teacher/hoc-vien chế độ mặc định đổ 37 bảng × 273 dòng ra DOM (4194 phần tử). Ngược lại, thứ ĐƯỢC nhớ lại là số dòng/trang: 20/20 điểm gọi PhanTrangBang trong site GV không khai khoaGhiNho, mà hai component phân trang khai CÙNG hằng KHOA_LUU='satarobo:bang:soDong' ⇒ đặt '100 dòng' ở một bảng là mọi bảng khác cũng đổi. Kèm cụm nhỏ: cursor không hiện bàn tay (Tailwind v4 bỏ preflight cho button — đã đo trên gói 4.2.4), ô ngày hiện mm/dd/yyyy, modal chỉ báo lỗi bằng toast.

**Dập được:** BUG-019, BUG-005, BUG-006, BUG-007, BUG-015, BUG-011, BUG-035, BUG-039, BUG-020, RISK-001

**File chính:**

- `app/(teacher)/teacher/_components/ui/use-loc-tren-url.ts`
- `app/(teacher)/teacher/lop/_components/class-list.tsx`
- `app/(teacher)/teacher/teacher.css`
- `lib/format/date.ts`
- `app/(teacher)/teacher/bang-cong/_components/adjust-request-dialog.tsx`

### RC-8 — Cụm Hoàn thành khoá: vòng đề xuất cụt đầu + 4 vé cùng đè 2 file

reviewCourseCompletion (hoan-thanh/_actions.ts:108) KHÔNG có caller nào trong toàn repo và không màn admin nào đọc CourseCompletionRequest ⇒ mỗi lần GV bấm 'Đề xuất hoàn thành' là một dòng PENDING không ai thấy, không rút lại được (enum chỉ PENDING/APPROVED/REJECTED). Cộng thêm: bảng lọc ACTIVE_LIST nên lớp đã kết khoá hiện rỗng; mẫu số chuyên cần ở màn này là 'buổi đã COMPLETED' trong khi 3 màn khác dùng 'tổng buổi khoá'; cột 'Chuyển sang' bám Course.nextCourseId — cột CHẾT, 0 đường ghi trong toàn repo; subtitle vẫn ghi 'chỉ xem' trong khi nút ghi đã tồn tại.

**Dập được:** BUG-021, BUG-023, BUG-028, BUG-031, BUG-038, BUG-022, extraIssue vòng đề xuất cụt đầu, extraIssue subtitle 'chỉ xem'

**File chính:**

- `app/(teacher)/teacher/hoan-thanh/page.tsx`
- `app/(teacher)/teacher/hoan-thanh/_components/completion-table.tsx`
- `app/(teacher)/teacher/hoan-thanh/_actions.ts`
- `lib/completion/service.ts`

### RC-9 — Seed UAT lệch khỏi luật của ứng dụng — khuếch đại và nguỵ trang lỗi thật

Seed chép tay danh sách status thiếu CONFIRMED (03-hoc-vu.ts:352) nên ~10% em mỗi lớp không bao giờ có bản ghi điểm danh; buổi rải cứng 7 ngày bỏ qua slot.days (:317) và lớp KHÔNG có scheduleDays ⇒ nhãn 'T7 sáng' chửi nhau với ngày thứ Tư; tiêu đề bài tập bị .slice(0,45) cắt cụt; đơn từ bốc kind và reason độc lập; ngay() lưu lùi 1 ngày cho cột @db.Date; taoThieu CHỈ TẠO nên sửa seed không chạm dữ liệu đã có. Hệ quả nguy hiểm nhất: sau khi vá RC-2, gần như mọi buổi quá khứ trên UAT nhảy sang 'cần xử lý' — bản vá ĐÚNG sẽ bị QA chấm là hỏng nếu seed chưa dọn trước.

**Dập được:** BUG-033, BUG-009, NV-005, BUG-004, SOAT-SEED-DONG, TIN-NHAN-BLOCKED, extraIssue seed 05-lms không tất định

**File chính:**

- `prisma/seed-uat/03-hoc-vu.ts`
- `prisma/seed-uat/05-lms.ts`
- `prisma/seed-uat/06-cskh-nhansu.ts`
- `prisma/seed-uat/_common.ts`
- `scripts/backfill-nhom-lop-chat.ts`

## Các đợt sửa

### Đ1 — Nền lib thuần (không đổi hành vi)

**Mục tiêu:** Dựng helper dùng chung + test để mọi đợt sau chỉ còn việc "gọi hàm". Không sửa màn nào.

**Vé:** RC-1, RC-2 · **Công:** M

**Các bước:**

1. `lib/enrollment-scope.ts` — Helper phạm vi ghi danh — MỘT tên duy nhất cho cả cụm
   - `import type { Prisma, EnrollmentStatus }` (type-only ⇒ client dùng được). `RosterScope = 'dang-hoc' | 'ket-khoa' | 'lich-su'`, `rosterWhere(scope)`. MỌI scope luôn kèm `deletedAt: null` + `student: { deletedAt: null }`; dang-hoc = ENROLLMENT_ACTIVE_STATUS_LIST, ket-khoa = +COMPLETED (KHÔNG WITHDREW), lich-su = +COMPLETED +WITHDREW. Không sửa nội dung lib/enrollment-status.ts:17.
2. `lib/enrollment-scope.test.ts` — Test hằng số + bất biến 3 tầng lọc
   - Mọi scope có deletedAt + student.deletedAt; ba tập lồng nhau đúng thứ tự; không scope nào chứa PENDING/TRANSFERRED/CANCELLED; ACTIVE_LIST vẫn đúng 4 phần tử (canh gác chống vá tắt).
3. `lib/lms/attendance-queue.ts` — Hàm thuần "buổi còn thiếu điểm danh"
   - Thêm `sessionsMissingAttendance(sessions, markedBySession, rosterByClass)` dùng lại attendanceCoversRoster (session-order.ts:106). Roster rỗng ⇒ không có việc. Không đổi chữ ký sessionWorkState.
4. `lib/lms/attendance-pending.ts` — Hàm nạp dữ liệu cho phép đếm, nhận client làm tham số
   - `countMissingAttendanceByClass(xdb, classIds, from, to)`: đọc ClassSession (status not CANCELLED, trong cửa sổ) + roster QUA quan hệ class.findMany với rosterWhere('dang-hoc'). NHẬN client qua tham số nên KHÔNG import @/lib/db ⇒ không vướng cổng DB. Giữ `id: { in: classIds }`.
5. `lib/lms/attendance-queue.test.ts` — Mở rộng test hàng đợi điểm danh
   - 0/3 thiếu; 1/12 thiếu (ca hồi quy BUG-002, hôm nay trả 0); 12/12 xong; roster rỗng 0; 12/12 + 2 dòng HV học bù lớp khác vẫn 0; 11/12 + 1 dòng NGOÀI roster vẫn thiếu.
6. `lib/lms/assignment-progress.ts` — Hàm thuần mẫu số bài tập
   - Export SUBMITTED_STATUSES + `submissionProgress(rows, rosterHistory)` trả `{ submitted, total: Math.max(rosterHistory, submitted) }`. Bất biến: total ≥ submitted; total===0 ⇒ submitted===0 (chống x/0 kể cả khi truy vấn roster trả rỗng vì thiếu UserOrgRole).

**Rủi ro:** Gần bằng 0 — chỉ thêm file mới + test, không call-site nào đổi. Rủi ro duy nhất là ĐẶT SAI TÊN: hiện có 3 tên đang được đề xuất cho cùng một việc (lib/enrollment-scope.ts / lib/completion/scope.ts; rosterWhere vs whereGhiDanhKetKhoa). Chốt tên ở đợt này.

**Nghiệm thu:** pnpm vitest run lib/enrollment-scope.test.ts lib/lms/attendance-queue.test.ts + pnpm typecheck. Không cần Postgres, không Playwright.

### Đ2 — CSS + bảng tràn ngang (độc lập, rẻ, tác động rộng)

**Mục tiêu:** Hết tràn ngang ở 4 bảng site GV và trả lại con trỏ bàn tay cho nút. Không đụng dữ liệu/truy vấn.

**Vé:** BUG-011, BUG-026, BUG-034, BUG-036-layout · **Công:** S

**Các bước:**

1. `app/(teacher)/teacher/teacher.css` — Con trỏ bàn tay cho nút — BẮT BUỘC bọc @layer base
   - Đã đo trên gói thật (tailwindcss 4.2.4): preflight KHÔNG có `button{cursor:pointer}`. Thêm trong `@layer base`: `.teacher-root button:not(:disabled), .teacher-root [role="button"]:not([aria-disabled="true"]), .teacher-root summary { cursor: pointer }` và nhánh disabled → not-allowed. File có 0 chữ @layer ⇒ để trần sẽ đè mọi utility cursor-* trong markup. Ghi chú lý do đầu file.
2. `app/(teacher)/teacher/cham-bai/_components/assignment-list.tsx` — Bảng Chấm bài — bỏ nowrap cột Lớp, gỡ max-w chết
   - Dòng 217: bỏ whitespace-nowrap, thay `min-w-[8rem]` (mẫu class-list.tsx:217). Dòng 188: gỡ `max-w-sm` trên td (undefined ở table-layout:auto), đặt `min-w-[15rem]`. Giữ min-w-[720px] ở 156.
3. `app/(teacher)/teacher/hoc-ba/_components/report-cards-list.tsx` — Bảng Học bạ — cột Khoá/Lớp có sàn
   - Dòng 279 thêm `min-w-[11rem]`. KHÔNG nâng min-w-[880px] ở 230 — cột 'Mốc buổi' (331) không nowrap nên co được; nâng sàn là ép cuộn ngang cả màn dữ liệu ngắn. Đo lại rồi mới quyết.
4. `app/(teacher)/teacher/tai-lieu/_components/course-materials-list.tsx` — Bảng Tài liệu — đặt trần trên KHỐI BÊN TRONG ô
   - Dòng 107 `<div className="min-w-0">` thêm `max-w-[28rem]` (chỗ trần thật sự ăn). Dòng 115 `truncate` → `line-clamp-1` + `title={r.description}`. Dòng 110-111 (Link tên khoá) thêm `line-clamp-2`. KHÔNG đặt max-w lên td dòng 101.
5. `app/(teacher)/teacher/trial/_components/trial-list.tsx` — Bảng Trial — hai bước, đo ở giữa
   - Bước 1 (làm một mình rồi đo): dòng 114 bỏ whitespace-nowrap khỏi td, dòng 115 thêm whitespace-nowrap cho riêng dòng NGÀY, để dòng phụ 'giờ · tên lớp' (119) ngắt được. Bước 2 CHỈ khi cột Học viên vẫn vỡ 3 dòng: thêm `min-w-[9rem]` ở 122 — đừng dồn 4 sàn cùng lúc (576px cứng sẽ tái tạo bug ở cửa sổ hẹp).
6. `components/ui/bang-phan-trang.tsx` — Gia cố vùng cuộn của component phân trang thứ hai
   - Dòng 123 thêm `relative` cho khớp phan-trang-bang.tsx:155. Đã kiểm: 3 nơi khác dùng component này (admin/nhan-su/vi-tri/*) không có sr-only ⇒ gia cố phòng thủ, không phải vá lỗi đang chảy máu.

**Rủi ro:** Rủi ro số 1: đặt trần bằng max-width trên <td> — CSS 2.1 §17.5.2 để undefined, Chrome/Firefox bỏ qua ở table-layout:auto. Luật: trần đặt trên phần tử KHỐI BÊN TRONG ô, sàn min-w trên td thì dùng được. Rủi ro số 2: teacher.css không phân tầng — quên @layer base là đè cursor-not-allowed/cursor-wait của mọi nút sau này. Không đụng admin/portal (bang-phan-trang.tsx chỉ thêm 1 từ, additive).

**Nghiệm thu:** PHẢI đo trình duyệt, không nghiệm thu bằng đọc diff: mở /teacher/cham-bai, /teacher/hoc-ba, /teacher/tai-lieu, /teacher/trial ở 1280px VÀ 1024px, chạy `const d=document.querySelector('.overflow-x-auto'); [d.scrollWidth,d.clientWidth]` — hai số xấp xỉ nhau. Rê chuột qua nút lọc/phân trang/nút đang disable.

### Đ3 — Áp phạm vi ghi danh cho các màn nghiệp vụ (HIGH)

**Mục tiêu:** Chấm dứt "x/0", "81 vs 103", "11 vs 12", "Lớp chưa có học viên đang học" ở lớp đã kết thúc, và HV đã xoá mềm vẫn hiện tên.

**Vé:** BUG-025, BUG-024, BUG-012, BUG-014, BUG-013, extraIssue sĩ số ho-so, extraIssue học bạ PENDING, extraIssue roster nhận xét, extraIssue PDF học bạ · **Công:** L · **Sau:** Đ1

**Các bước:**

1. `app/(teacher)/teacher/cham-bai/page.tsx` — Chấm bài — tử số và mẫu số về CÙNG một tập
   - Mẫu số :376-378 và roster chi tiết :196-197 → rosterWhere('lich-su') (ở màn chấm bài WITHDREW là ĐÚNG: em nộp bài rồi mới rời lớp). Render đi qua submissionProgress để total không rơi về 0. Subtitle :237 tự đúng theo. Xoá bản chép tay SUBMITTED_STATUSES ở :40, import từ lib.
2. `app/(teacher)/teacher/cham-bai/_actions.ts` — Chấm bài — đường GHI đồng bộ, đường GIAO BÀI giữ nguyên
   - Guard roster :441-444 → rosterWhere('lich-su'), KHÔNG nới thành 'mọi ghi danh' (cổng chống tiêm studentId). GIỮ 'dang-hoc' cho assignTemplateAction :154 + ghi chú tại chỗ.
3. `app/(teacher)/teacher/cham-bai/_data.ts` — Chấm bài — dialog giao bài giữ 'dang-hoc'
   - Dòng 210-211 giữ phạm vi 'dang-hoc', chỉ đổi sang gọi rosterWhere + chú thích 'giao bài mới chỉ cho em đang học'.
4. `app/(teacher)/teacher/lop/_components/hub-assignments-tab.tsx` — Class Hub tab Bài tập — bản sao thứ hai của cùng lỗi
   - Roster :199-200 và _count :351-352 → rosterWhere('lich-su') + submissionProgress. Xoá bản chép tay SUBMITTED_STATUSES ở :33. Thêm badge trạng thái ghi danh trong bảng (ở màn này CẦN, vì mẫu số tăng do em đã rời lớp).
5. `app/(teacher)/teacher/lop/page.tsx` — Danh sách lớp — sĩ số có đủ 3 tầng lọc
   - _count :387-390 → rosterWhere('dang-hoc') (thêm deletedAt + student.deletedAt).
6. `app/(teacher)/teacher/hoc-vien/page.tsx` — Danh sách học viên — lọc status + chặn HV xoá mềm
   - :303-304 → rosterWhere('dang-hoc'). GIỮ NGUYÊN :160-161 (chỉ deletedAt) — đó là cổng chống IDOR, cố ý nhận mọi status, ghi chú rõ.
7. `app/(teacher)/teacher/hoc-vien/_components/student-list.tsx` — Danh sách học viên — bộ lọc trạng thái ở CẢ HAI tầng
   - Thêm state tt: 'dang-hoc'|'tat-ca', mặc định 'dang-hoc' (khớp tài liệu guides mục 11 nói 'sĩ số'/'các lớp em đang học'). Lọc ở CẢ `filtered` (88-102) VÀ `groups` (123-144) — lọc mỗi groups sẽ đẻ lệch mới giữa dòng đếm đầu trang và tổng các khối. Trong 'dang-hoc' phải xét `r.classes.some(...)` theo lớp đang lọc, KHÔNG dùng r.status gộp (đã bị 'ưu tiên active' ở page.tsx:346). Tiêu đề khối (186) đổi chữ theo bộ lọc.
8. `app/(teacher)/teacher/page.tsx` — Nhãn thẻ tổng ở dashboard
   - Dòng 322 'Tổng học viên' → 'Học viên đang học'; :144-148 dùng rosterWhere('dang-hoc').
9. `app/(teacher)/teacher/ho-so/page.tsx` — Hồ sơ GV — sĩ số không lọc gì cả
   - Dòng 134 `_count: { select: { enrollments: true } }` → rosterWhere('dang-hoc'). Đây là cách đếm thứ ba, luôn lớn nhất.
10. `app/(teacher)/teacher/hoc-ba/page.tsx` — Học bạ — loại PENDING/CANCELLED và HV xoá mềm
   - Dòng 215-216 (chỉ deletedAt) → rosterWhere('lich-su'). Học bạ là màn lịch sử ⇒ giữ COMPLETED/WITHDREW. TUYỆT ĐỐI đừng dùng thẳng ACTIVE_LIST ở đây (không chứa COMPLETED ⇒ xoá sạch học bạ lớp đã kết thúc).
11. `app/(teacher)/teacher/lop/_components/hub-reviews-tab.tsx` — Roster viết nhận xét buổi
   - Dòng 185-186 (chỉ status) → thêm deletedAt + student.deletedAt, chép y mẫu đã đúng trong chính file này (:471-478).
12. `app/(teacher)/teacher/hoc-ba/pdf/[enrollmentId]/route.ts` — Chặn PDF học bạ cho ghi danh/HV đã xoá mềm
   - Guard :45-48 hiện chỉ `{ id: enrollmentId }` → thêm `deletedAt: null` + `student: { deletedAt: null }`.
13. `lib/enrollment-scope.test.ts` — Test canh gác chống hình dạng thứ 6
   - Test quét mã (khuôn components/ui/bang-coverage.test.ts): mọi `enrollments: { where:` và `_count: { select: { enrollments:` trong app/(teacher) phải đi qua rosterWhere, trừ 3 guard IDOR khai rõ lý do (hoc-vien:160, hoan-thanh/_actions:49, hoc-ba/pdf:45).

**Rủi ro:** CÁC CON SỐ ĐỔI ĐỒNG LOẠT trên nhiều màn cùng ngày — ghi vào ghi chú phát hành kẻo QA đọc thành hồi quy. ĐO TRƯỚC khi thêm student.deletedAt: `SELECT count(*) FROM "Enrollment" e JOIN "Student" s ON s.id=e."studentId" WHERE e."deletedAt" IS NULL AND s."deletedAt" IS NOT NULL;` — >0 là dữ liệu hỏng cần dọn, không phải cớ bỏ bộ lọc. TUYỆT ĐỐI không đổi class.findMany→select.enrollments thành enrollment.findMany (Enrollment ∈ SCOPED_MODELS ⇒ ghi danh centerId=null biến mất im lặng). Không sửa nội dung ENROLLMENT_ACTIVE_STATUS_LIST (109 lượt / 45 file, cả 4 site).

**Nghiệm thu:** pnpm vitest run lib/enrollment-scope.test.ts + test render student-list (1 em ACTIVE lớp B + WITHDREW lớp A, lọc lớp A + 'Đang học' ⇒ đếm 0 và không khối nào có dòng). Kiểm tay trên test.satarobo.vn: /teacher và /teacher/hoc-vien ra CÙNG con số; /teacher/cham-bai lọc 'Đã đóng' không còn dòng x/0.

### Đ4 — "Buổi đã điểm danh" = phủ đủ roster (HIGH)

**Mục tiêu:** Chấm dứt việc một dòng Attendance duy nhất (thường do duyệt phiếu xin nghỉ của phụ huynh) làm buổi biến mất khỏi việc cần làm của GV.

**Vé:** BUG-002, BUG-029, BUG-016, BUG-030, extraIssue duyệt phiếu PH, extraIssue màn Điểm danh xuyên lớp, extraIssue hai cột chọi nhau · **Công:** L · **Sau:** Đ1

**Các bước:**

1. `app/(teacher)/teacher/lop/page.tsx` — Danh sách lớp — cột "Cần xử lý" và badge tab Điểm danh dùng chung một phép đếm
   - Thay khối 399-426 VÀ khối 257-279 (bản chép thứ hai, cùng cửa sổ 60 ngày) bằng countMissingAttendanceByClass. Thêm `dueSessions` vào ClassRow: lớp 0 buổi tới hạn phải in '—'/chữ xám, KHÔNG badge xanh 'Hoàn tất' (BUG-016). Lớp có buổi mà roster rỗng cũng không đeo badge vàng vĩnh viễn.
2. `app/(teacher)/teacher/lop/_components/class-list.tsx` — Hiển thị ba trạng thái thay vì hai
   - Dòng 227-238: tam thức 2 nhánh → 3 nhánh (còn nợ N buổi / đã xong / chưa có buổi tới hạn). Lớp COMPLETED hiện '—'.
3. `app/(teacher)/teacher/page.tsx` — Dashboard — 2 ô đếm không được nói ngược nhau
   - Thêm `id: true` vào select rosters (140-153); dựng attendanceDoneOf(s) bằng attendanceCoversRoster (attBySession đã có studentId ở 158-166, KHÔNG thêm truy vấn). Dòng 208 và 355 đổi sang hàm này. BẮT BUỘC sửa kèm 210-213: needEvaluation thêm điều kiện attendanceDoneOf(s) — nếu không, buổi chấm 1/12 hiện ĐỒNG THỜI ở cả 'chưa điểm danh' lẫn 'chưa nhận xét'. Giữ tiêu chí yếu cho banner nhắc (219-230), ghi chú lý do.
4. `app/(teacher)/teacher/diem-danh/page.tsx` — Màn Điểm danh xuyên lớp — nhãn 'Đã xong' dùng đúng phép đã tính sẵn
   - Dòng 174 doneSet.add(a.sessionId) / :221 done: doneSet.has(s.id) → attendanceCoversRoster(markedIds, info?.rosterIds ?? []) — đã tính sẵn ở :230 nhưng chỉ dùng để SẮP XẾP.
5. `app/(teacher)/teacher/lop/_components/hub-sessions-tab.tsx` — Class Hub — hai cột trên cùng một hàng phải cùng kết luận
   - Dòng 241 doneSet.has(s.id) → work.attendanceDone (đã có ở :190). Roster :103-104 thêm 2 tầng lọc còn thiếu (mẫu đúng ngay dưới, :112-116).
6. `app/(teacher)/teacher/lop/_components/hub-reviews-tab.tsx` — Bảng nhận xét — badge luôn in tỉ lệ
   - Khối 668-691: 3 nhánh → 2 nhánh theo mẫu ĐÃ ĐÚNG ở /teacher/nhan-xet:370-387 — chưa điểm danh thì badge xám; đã điểm danh thì LUÔN in `{reviewed}/{attended} HV`, chỉ đổi MÀU theo complete. KHÔNG thêm cột thứ 6, KHÔNG đụng min-w, KHÔNG sửa /teacher/nhan-xet.
7. `app/(teacher)/teacher/page.tsx` — Chốt cửa sổ thời gian
   - Dashboard 30 ngày (:107) vs /teacher/lop 60 ngày (:400). Sau khi vá, hai con số cùng mang một tên nhưng lệch có hệ thống. Chốt MỘT con số ngay trong PR này.

**Rủi ro:** SỐ SẼ TĂNG MẠNH sau khi vá — đúng, nhưng trên UAT tăng gấp bội vì seed lọc roster thiếu CONFIRMED (03-hoc-vu.ts:352). PHẢI chạy Đ10 (sửa seed) TRƯỚC khi mời nghiệm thu. Hiệu năng: trang danh sách lớp nay phải kéo roster mọi lớp (50×~15) + studentId của mọi dòng Attendance 60 ngày (~6.000) — ĐO thời gian tải trước khi merge; chậm thì hạ cửa sổ hoặc chỉ nạp roster cho lớp CÓ buổi trong cửa sổ. Giữ `id: { in: classIds }` ở mọi truy vấn qua withMakeupException. KHÔNG đổi lib/lms/session-feedback-roster.ts (8 file gọi, gồm màn admin).

**Nghiệm thu:** pnpm vitest run lib/lms/attendance-queue.test.ts (1/12 → còn thiếu; 11/12 → hiện ở 'chưa điểm danh' và KHÔNG hiện ở 'chưa nhận xét'). Kiểm tay: buổi có đúng 1 phiếu xin nghỉ đã duyệt phải VẪN nằm trong 'Cần xử lý'; /teacher/lop và /teacher/nhan-xet đọc ra cùng con số.

### Đ5 — Làm cho lỗi thiếu UserOrgRole không còn im lặng

**Mục tiêu:** Không đổi cách ly, chỉ làm sự lệch thấy được và nói đúng nguyên nhân.

**Vé:** RC-3, cơ chế 2 của BUG-025, extraIssue 404 PDF học bạ · **Công:** M

**Các bước:**

1. `lib/auth/actor.ts` — Cảnh báo tại một chỗ khi actor tự mâu thuẫn
   - Trong buildActor: khi assignedClassIds.length>0 mà visibleCenterIds.length===0 và actor không phải HO/SUPER ⇒ console.error kèm userId + số lớp. Đây là chữ ký duy nhất của sự cố RC-A/K1 và hiện trôi qua không tiếng động. KHÔNG đổi logic quyền.
2. `app/(teacher)/teacher/hoc-ba/pdf/[enrollmentId]/route.ts` — Thông điệp lỗi phân biệt được hai ca
   - `classIds.length>0 && clsWithEnr.length===0` ⇒ lỗi hệ thống (log + 5xx), khác hẳn 404 'Học bạ không thuộc lớp bạn phụ trách' hiện đang nói sai nguyên nhân cho chính GV chủ nhiệm.
3. `app/(teacher)/teacher/lich/page.tsx` — Đổi tên biến gây hiểu nhầm
   - Dòng 286 `withMakeupException(actor)` đang đặt tên `sdb` — người đọc lướt tin là có cách ly cơ sở trong khi Class/ClassSession ∈ MAKEUP_EXCEPTION_MODELS nên KHÔNG có. Đổi thành `xdb` cho khớp 6 màn còn lại + chú thích 'cách ly ở đây CHỈ do id in classIds'.
4. `lib/teacher/classes.ts` — (Tuỳ chọn, làm dần) Một cửa đọc lớp cho site GV
   - `loadAssignedClasses(actor, select)` chọn cổng theo luật viết thành lời và LUÔN neo `id: { in: [...actor.assignedClassIds] }`. Chuyển dần 24 điểm gọi theo từng màn — KHÔNG làm trong một PR.

**Rủi ro:** Vùng cổng an toàn dữ liệu (db-scope.ts:2). Giữ nguyên 2 bất biến đã có e2e: CS1 không đọc được dữ liệu CS2 ở model scoped; luồng học bù vẫn đọc chéo Class/ClassSession. Bước cảnh báo chỉ thêm log ⇒ làm trước. TUYỆT ĐỐI không thêm status vào actor.ts:443 (cắt mất quyền đọc lịch sử lớp cũ + vỡ guard IDOR ~15 màn). Không migration.

**Nghiệm thu:** pnpm vitest run trên injectScope: visibleCenterIds=[] + model Class ⇒ where chứa `centerId: { in: [] }` (chốt fail-closed là CÓ CHỦ ĐÍCH). Đo trên test/prod: `SELECT u.email, count(c.id) FROM "User" u JOIN "Class" c ON c."teacherId"=u.id LEFT JOIN "UserOrgRole" r ON r."userId"=u.id WHERE r.id IS NULL GROUP BY u.email;`

### Đ6 — Nhãn buổi và nhãn trạng thái về một nguồn

**Mục tiêu:** Hết "Buổi 10 · Buổi 10", hết "Buổi học: Buổi học" trên PDF gửi phụ huynh, hết bảng nhãn chép tay lệch nhau.

**Vé:** BUG-008, BUG-001, NV-003, BUG-010 (nhãn), extraIssue PDF phiếu, extraIssue màn Điểm danh của lớp · **Công:** M

**Các bước:**

1. `app/(teacher)/teacher/hoc-vien/page.tsx` — Nhãn buổi trong tab Nhận xét — sửa CẢ HAI dòng của thẻ
   - Khối 554-559 → deriveSessionLabel (select 507-517 đã có plan/lesson, không đổi truy vấn). BẮT BUỘC xoá kèm khối IIFE 563-578 in `· {duAn}` — resolveDisplayProjectName trả CÙNG chuỗi mà deriveSessionLabel dùng làm mảnh cuối, giữ lại là lặp tên bài giữa hai dòng. Mẫu chuẩn: hub-reviews-tab.tsx:275. Dọn import 45/47 kẻo lint đỏ.
2. `app/(teacher)/teacher/nhan-xet/pdf/[sessionId]/[studentId]/route.ts` — PDF phiếu gửi phụ huynh — tài liệu ra ngoài, ưu tiên trong nhóm
   - Dòng 165 `sessionTopic: sess.topic ?? 'Buổi học'` → deriveSessionLabel (sessionNo ở 137-143, plan/lesson trong select 53-54). Kèm vá safeFilename: chèn `.replace(/Đ/g,'D').replace(/đ/g,'d')` TRƯỚC `.normalize('NFD')` — đã chạy thật: 'Đặng Công Trí' hiện ra `_ang_Cong_Tri`. Nhớ hàm có 4 phép (dòng 29 gộp `_+`→`_`) nên đừng vá kiểu 'xoá hết dấu gạch dưới'.
3. `lib/pdf/trial-eval-response.ts` — Bản sao thứ hai của safeFilename
   - Dòng 40 cùng lỗi Đ→'_'. Vá kèm, hoặc gom cả hai về lib/pdf/filename.ts.
4. `app/(teacher)/teacher/lop/page.tsx` — Màn Điểm danh của lớp — tiêu đề lặp, tên lớp biến mất
   - Dòng 172 in topic thô ⇒ 'Điểm danh — Buổi 10' trùng subtitle 174; dòng 180 `sess.topic ? sess.class.name : null` là logic NGƯỢC (prod topic null ⇒ mất tên lớp). Dùng deriveSessionLabel; select thêm plan/lesson.
5. `lib/lms/student-attendance-cell.ts` — Ô trạng thái điểm danh trong hồ sơ HV
   - Hàm thuần `resolveStudentAttendanceCell({sessionDate, sessionCancelled, attendanceStatus, now})` → MARKED|CANCELLED|NOT_YET|NOT_MARKED dùng vnEndOfDay từ @/lib/time/vn. Áp vào hoc-vien/page.tsx khối 459-476; NOT_MARKED dùng CÙNG token cam như hub-sessions-tab.tsx:285. Lưu ý lệch mốc: vnEndOfDay = 23:59:59.999 còn vnTodayEndMs của hub = 00:00 ngày mai — chọn một, đừng im lặng đổi.
6. `lib/labels/registry.ts` — Bổ sung SubmissionStatus vào bảng nhãn dùng chung (COMMIT RIÊNG)
   - Thêm SUBMISSION_STATUS 4 nhãn (Chưa nộp/Đã nộp/Nộp muộn/Đã chấm), chép đúng chữ từ cham-bai/page.tsx:53-67. Thêm REPORT_CARD_STATUS_TONE cạnh REPORT_CARD_STATUS_LABEL của lib/lms/report-card-core.ts. File dùng chung 4 site ⇒ additive, tách commit riêng.
7. `app/(teacher)/teacher/hoc-vien/page.tsx` — Hồ sơ HV — dùng nhãn chung thay bảng chép tay 2 nhãn
   - Dòng 690 + khối 718-726 → SUBMISSION_STATUS.label (đang mất 'Nộp muộn'/'Đã chấm'). Xoá REPORT_STATUS chép tay 81-94, dùng REPORT_CARD_STATUS_LABEL ('Đã duyệt' → 'Đã phát hành', khớp /teacher/hoc-ba). Chưa có ReportCard ⇒ badge xám 'Chưa có học bạ' thay vì không badge.

**Rủi ro:** deriveSessionLabel là hàm thuần 12 chỗ gọi, có 30+ test — KHÔNG sửa thư viện, chỉ gọi. Còn 7+ chỗ in topic thô sau đợt này (cham-bai/_data:275, cham-bai/page:413, lich:335/592/946, hub-assignments-tab:448, hub-gallery-tab:141, teacher/page:294/378) ⇒ nếu viết test quét mã thì PHẢI khai MIEN_TRU kèm lý do rồi gỡ dần. lib/labels/registry.ts và lib/lms/report-card-core.ts dùng chung 4 site: chỉ THÊM export, không đổi nhãn ENROLLMENT_STATUS (registry.test.ts so chuỗi). react-pdf: mọi render phải trong withFreshFonts (route đã đúng ở :158).

**Nghiệm thu:** pnpm vitest run lib/lms/session-project-name.test.ts (sessionNumber 10 + topic 'Buổi 10' + lessonTitle ⇒ 'Buổi 10 - HP1 - <bài>'; topic 'Buổi 10' không lesson ⇒ 'Buổi 10', KHÔNG lặp) · lib/pdf/filename.test.ts (safeFilename('Đặng Công Trí')==='Dang_Cong_Tri' — đỏ trước khi vá) · lib/lms/student-attendance-cell.test.ts (buổi hôm qua không bản ghi ⇒ NOT_MARKED). Smoke: mở PDF phiếu, tiêu đề buổi không còn 'Buổi học: Buổi học'.

### Đ7 — Hồ sơ học viên biết mình đang xem lớp nào

**Mục tiêu:** Hết cảnh 4 lớp × 4 khoá trộn thành một dòng thời gian; mỗi thẻ nói rõ lớp và trạng thái ghi danh của chính lớp đó.

**Vé:** BUG-003, BUG-018, BUG-010, BUG-014 (hiển thị) · **Công:** M · **Sau:** Đ3

**Các bước:**

1. `lib/teacher/profile-scope.ts` — Hàm thuần quyết định phạm vi + danh sách chip
   - `resolveProfileScope(enrollments, requestedClassId)` → {classIds, activeClassId, chips, multiClass}. classId lạ ⇒ hạ cấp im lặng về tất cả lớp (KHÔNG notFound — bookmark cũ sẽ chết). Dedupe chip theo classId, tie-break theo (name, id) để tất định (Class.name KHÔNG unique — student-list.tsx:119-122). Thêm `profileTabHref(studentId, tab, activeClassId)`.
2. `app/(teacher)/teacher/hoc-vien/page.tsx` — Trang hồ sơ — mở rộng hợp đồng URL và bơm phạm vi xuống 4 tab
   - (1) :138 thêm classId?: string; (2) sau :198 dựng scopeClassId/tabClassIds; (3) BẮT BUỘC ProfileTabBar (:372-408, href :391) mang classId — thiếu bước này thì đổi tab là bộ lọc tự tắt, bug tái sinh ngay thao tác thứ hai; (4) :260/:268/:276 dùng tabClassIds, HocBaTab (:280-289) lọc theo scopeClassId; (5) thêm hàng chip chọn lớp dưới ProfileTabBar (mẫu hub-tab-bar.tsx:66-68), mỗi chip mang trạng thái ghi danh của LỚP đó; (6) bỏ badge gộp enrollments[0].status ở :227-229 và chuỗi tên khoá nối ' · ' ở :245-249; (7) sdb.class.findMany :154 thêm `orderBy: [{name:'asc'},{id:'asc'}]`; (8) tab Điểm danh: thêm classId vào select :424-431 và render dòng '{tên lớp} — chưa có buổi học nào' cho lớp rỗng; (9) tab Bài tập: select :641-652 thêm id + assignment.classId + assignment.class.name ⇒ cột 'Lớp' (ẩn khi đã lọc lớp, min-w-[9rem], KHÔNG nowrap) + nút 'Xem bài' → /teacher/cham-bai?submissionId=; `key={i}` :697 → `key={s.id}`; nâng min-w bảng 660→820px.
3. `app/(teacher)/teacher/lop/_components/hub-students-tab.tsx` — Mang ngữ cảnh lớp từ nơi gọi (Class Hub)
   - Dòng 111: `?s=${st.id}` → `?s=${st.id}&classId=${classId}` (prop classId đã có ở :23).
4. `app/(teacher)/teacher/hoc-vien/_components/student-list.tsx` — Danh sách học viên — link mang classId + sửa bộ lọc lớp khoá theo tên
   - Thêm `classId: string | null` vào DongBang; groups (131-137) set c.id, flatRows (106-112) set null; hai link 259 và 281 dựng href theo đó. Đồng thời sửa bộ lọc lớp: classOptions và phép so đang dùng `c.name` (79-81, 92, 129) trong khi nhóm khoá theo `c.id` (130) ⇒ hai lớp trùng tên gộp thành một lựa chọn; đổi value sang id.
5. `app/(teacher)/teacher/lop/_components/attendance-panel.tsx` — KHÔNG đụng attendance-panel
   - Dòng 288 để nguyên `?s=`: component chỉ có sessionId, và bảng còn chứa HV học bù từ lớp khác (r.makeupFromCenter) nên classId của buổi KHÔNG phải lớp của em đó. Phạm vi tự hạ cấp an toàn.

**Rủi ro:** Cách hỏng dễ xảy ra nhất: thêm chip mà quên ProfileTabBar ⇒ bộ lọc tự tắt khi đổi tab. Phạm vi chỉ THU HẸP (tabClassIds ⊆ enrolledClassIds ⊆ assignedClassIds) ⇒ không nới quyền. Câu 46: chip chỉ mang tên lớp + trạng thái ghi danh, KHÔNG kéo thêm trường phụ huynh vào select. KHÔNG đổi nhãn 'Đang học (cũ)' trong lib/labels/registry.ts:33 (admin+portal đang render, registry.test.ts so chuỗi) — giải thích bằng HelpHint (components/admin/ui/help-hint.tsx đã có tiền lệ dùng trong site GV). Không sửa lib/lms/session-order.ts.

**Nghiệm thu:** pnpm vitest run lib/teacher/profile-scope.test.ts: không classId ⇒ đủ 4 lớp; classId hợp lệ ⇒ 1 lớp; classId lớp em không ghi danh ⇒ hạ cấp (chốt IDOR); 2 ghi danh cùng lớp ⇒ 1 chip; đảo thứ tự đầu vào ⇒ chip ra dãy giống hệt; 2 lớp TRÙNG TÊN khác id ⇒ vẫn tất định; profileTabHref có `&classId=` khi activeClassId khác null. Smoke: bấm chip rồi đổi tab, bộ lọc phải còn.

### Đ8 — Cụm Hoàn thành khoá (MỘT PR duy nhất)

**Mục tiêu:** Bốn vé cùng đè hoan-thanh/page.tsx và completion-table.tsx — làm rời nhau là chắc chắn xung đột.

**Vé:** BUG-021, BUG-023, BUG-028, BUG-031, BUG-038, BUG-022, extraIssue vòng đề xuất cụt đầu · **Công:** L · **Sau:** Đ1, Đ3

**Các bước:**

1. `app/(teacher)/teacher/hoan-thanh/page.tsx` — Mở bảng + thẻ lớp cho ghi danh đã kết khoá, qua MỘT hàm chung
   - (1) :115-119 và :271-276 CÙNG gọi rosterWhere('ket-khoa') — hai chỗ lệch nhau chính là thứ đẻ ra vé này; (2) :239 EmptyState → 'Lớp chưa có học viên nào.'; (3) BỎ khối tự chế 134-198, dùng attendanceSummaryForEnrollments như 3 màn kia ⇒ mẫu số chuyên cần thống nhất và hết phụ thuộc cột ClassSession.status; (4) select :251 thêm `status: true` để vẽ pill trạng thái lớp; (5) sửa CẢ BA chuỗi 'chỉ xem': khối chú thích :4-6, :221, :300.
2. `app/(teacher)/teacher/hoan-thanh/_components/completion-table.tsx` — Bảng kết khoá — mẫu số theo từng ghi danh + badge + xác nhận 2 bước
   - (1) CompletionTableRow thêm totalSessions + enrollmentStatus, BỎ prop completedSessions; :138 → `{r.attended}/{r.totalSessions} buổi`; :131 nhánh rỗng đổi sang prop mới classHasSessions; (2) pill 'Đã kết khoá' cho ghi danh COMPLETED; (3) nút :230 bọc AlertDialog (components/ui/alert-dialog — site GV cấm Magic UI/Framer Motion), nội dung nêu SỐ: tên HV · chuyên cần · tiến độ lớp; (4) ô 'Chuyển sang' :151 bỏ whitespace-nowrap, thay min-w-[9rem].
3. `app/(teacher)/teacher/hoan-thanh/_actions.ts` — Chặn ở server, không chỉ ở giao diện
   - (1) proposeCourseCompletion :50 select thêm status, từ chối khi ∈ [WITHDREW, TRANSFERRED, CANCELLED, PENDING] — Server Action là endpoint riêng; (2) :87 nextCourseId đang ghi từ cột chết ⇒ bỏ khỏi create hoặc dùng suggestNextCourse (theo quyết định #5); (3) reviewCourseCompletion :111/:131 so role + centerId viết tay — khi nối màn duyệt thì đổi sang checkPermission + actor.visibleCenterIds (actor/sdb đã có ở :124-125) rồi XOÁ entry khỏi lib/eslint/inline-authz-allowlist.mjs:66 (test freshness sẽ đỏ nếu để lại).
4. `lib/completion/de-xuat.ts` — Cảnh báo trước khi đề xuất (hàm thuần)
   - `canhBaoDeXuatHoanThanh({attended, totalSessions, classCompleted, classTotal})` → CHUA_DI_BUOI_NAO | CHUYEN_CAN_THAP | LOP_CHUA_XONG. Mặc định CẢNH BÁO, KHÔNG chặn cứng (lớp học dồn/học bù có chuyên cần thấp giả). Ngưỡng là chính sách BGĐ.
5. `app/(teacher)/teacher/hoan-thanh/_components/completion-class-grid.tsx` — Lưới thẻ lớp có tìm kiếm + lọc trạng thái
   - Client component nhận rows plain + ListToolbar + khopBatKy; ẩn mặc định CANCELLED/PLANNED/PENDING_APPROVAL, GIỮ COMPLETED (đây là màn kết khoá). Vẽ pill bằng `import { ClassStatusPill } from '../../lop/_components/class-list'` — đã export sẵn (:48), đã có tiền lệ import chéo (lop/page.tsx:33), KHÔNG cần dời file.
6. `lib/completion/service.ts` — Cột "Chuyển sang" có nguồn dữ liệu
   - Theo quyết định #5. Nếu chọn suy luận: export suggestNextCourse (:27) hoặc tách phần thuần sang lib/completion/next-course.ts rồi service.ts gọi lại — MỘT luật, hai nơi dùng; page đọc CourseCompletion.nextCourseId (nguồn ĐÚNG admin đang dùng) thay vì Course.nextCourseId (cột CHẾT, 0 đường ghi). Đổi nhãn cột thành 'Gợi ý chuyển sang'.

**Rủi ro:** CHỐT QUYẾT ĐỊNH #2 TRƯỚC KHI GÕ: nếu không xây được màn duyệt ở admin trong đợt này thì việc đúng là ẨN nút đề xuất + sửa 3 chuỗi — thêm dialog cho một nút dẫn vào ngõ cụt là làm bug nặng hơn (reviewCourseCompletion không có caller nào trong toàn repo, đề xuất không rút lại được vì enum thiếu CANCELLED). Mẫu số màn này đổi từ 'buổi đã dạy' sang 'tổng buổi khoá' (7/7 → 7/11) ⇒ báo trước cho GV/giáo vụ. attendanceSummaryForEnrollments dùng db TRẦN, an toàn ở đây vì đã có guard assignedClassIds (page.tsx:88) — ĐỪNG bê mẫu này sang màn khác mà quên guard. Nếu thêm enum CANCELLED thì đó là migration: additive, nằm trong story được giao, Dev chạy TAY trên prod. Nút đề xuất còn phụ thuộc seed-roles đã chạy chưa (completions:propose-own, seed-roles.ts:949).

**Nghiệm thu:** pnpm vitest run lib/enrollment-scope.test.ts lib/completion/de-xuat.test.ts (attended=0 ⇒ CHUA_DI_BUOI_NAO; 4/7 ⇒ CHUYEN_CAN_THAP; đủ ⇒ rỗng; totalSessions=0 ⇒ không chia 0). Test bất biến: :115 và :271 cùng tham chiếu MỘT hằng. Kiểm tay: mở cùng 1 HV ở /teacher/hoan-thanh, /teacher/hoc-vien tab Học bạ, /teacher/hoc-ba — ba màn in cùng một cặp số.

### Đ9 — Trạng thái danh sách, phân trang, form (LOW, gom một PR)

**Mục tiêu:** Bộ lọc chia sẻ được qua URL và sống sót khi Back; mỗi bảng có ô nhớ số dòng riêng; các lỗi nhỏ về bộ lọc/thông báo/ngày tháng.

**Vé:** BUG-019, BUG-005, BUG-006, BUG-007, BUG-015, BUG-039, BUG-035, BUG-020, RISK-001 · **Công:** L · **Sau:** Đ2

**Các bước:**

1. `app/(teacher)/teacher/_components/ui/use-loc-tren-url.ts` — Hook đưa bộ lọc lên URL
   - Đọc bằng useSearchParams, GHI bằng `window.history.replaceState` (cập nhật nông, KHÔNG kích lại RSC — router.replace sẽ chạy lại truy vấn nặng mỗi lần gõ phím). Giá trị trùng mặc định thì xoá khỏi query. Giữ các param không thuộc bộ lọc (mẫu schedule-toolbar.tsx:53-61). Dùng đường dẫn TƯƠNG ĐỐI `?…`.
2. `app/(teacher)/teacher/lop/_components/class-list.tsx` — Danh sách lớp — bộ lọc lên URL, dropdown không nói dối, câu rỗng đúng ngữ cảnh
   - (1) 4 useState (64-67) → hook trên, param q/khoa/tt (không đụng classId/sessionId/tab/rvSession/asgId/subId ở page.tsx:90-97); (2) :97 dựng statusOptions từ `rows` chứ không `openRows`; (3) :102 nhãn 'Mọi trạng thái' → 'Mọi trạng thái đang phụ trách' HOẶC gộp ô tick vào dropdown theo quyết định #4 — nếu bỏ dòng 113 thì BẮT BUỘC làm (2) trước, kẻo trigger Select in chuỗi RỖNG (list-toolbar.tsx:70); (4) :190-192 siết điều kiện câu rỗng để nó chỉ nói 'lớp đã hoàn thành đang ẩn' khi thật sự có lớp COMPLETED khớp bộ lọc; thêm nút 'Xoá bộ lọc' trong <td>; (5) thêm khoaGhiNho='gv-lop'.
3. `app/(teacher)/teacher/hoc-vien/_components/student-list.tsx` — Tách ô nhớ số dòng cho 20 bảng
   - Đo thật: 20 điểm gọi <PhanTrangBang> trong app/(teacher), 0 chỗ khai khoaGhiNho (4 chỗ đã khai là <BangPhanTrang> — component khác). Thêm khoaGhiNho='gv-<màn>-<bảng>' cho cả 20: bang-cong:383 · assignments-tabs:166 · batch-grade:113 · attendance-overview:87 · don-tu-client:191 · completion-table:83 · report-cards-list:229 và :464 · hoc-vien/page:666 · student-list:303 · bank-panel:120 · attendance-panel:269 · class-list:154 · hub-reviews-tab:310 và :609 · hub-sessions-tab:216 · hub-students-tab:72 · course-materials-list:64 · lesson-table:90 · trial-list:84. Riêng student-list:301-303 bỏ div bọc, dùng `<PhanTrangBang cuonNgang>` (thanh phân trang đang nằm TRONG vùng cuộn).
4. `app/(teacher)/teacher/hoc-vien/page.tsx` — Danh sách học viên — chặn 37 bảng đổ một lượt
   - RISK-001: truy vấn :298-314 không take/cursor. Chọn (a) thêm `?classId=` + lưới thẻ chọn lớp (mẫu hoan-thanh:308-316) nhưng PHẢI giữ một lối tìm theo tên xuyên lớp (chú thích student-list.tsx:56-57); hoặc (b) phân trang chính DANH SÁCH KHỐI (groups.slice), 10 lớp/trang. TUYỆT ĐỐI KHÔNG thêm phân trang BÊN TRONG từng khối — sĩ số 10-16 < SO_DONG_MAC_DINH=20 nên không cắt được dòng nào, chỉ tốn thêm render.
5. `app/(teacher)/teacher/bang-cong/_components/adjust-request-dialog.tsx` — Modal yêu cầu chỉnh công
   - (1) 2 nhánh toast (36-44) → state lỗi + aria-invalid + <p role='alert'> dưới ô (mẫu student-eval-dialog.tsx:226-232); (2) nhãn 77/99 thêm dấu `*` đỏ + aria-hidden (quy ước ĐANG DÙNG ở student-eval-dialog.tsx:205-209); (3) DialogFooter 111-115 thêm nút 'Huỷ' (mẫu batch-grade.tsx:157-163); (4) xoá lỗi khi mở lại (:63); (5) đặt min/max cho ô ngày theo MANAGER_EDIT_WINDOW_DAYS và chặn lại ở server — hiện đơn quá hạn bị KHOÁ CẢ nút Duyệt lẫn nút Từ chối ở màn quản lý (review-row.tsx:62), kẹt PENDING vĩnh viễn.
6. `lib/format/date.ts` — Ô ngày kiểu Việt + định dạng ngày dùng chung
   - Thêm `formatIsoDMY(iso)` đảo CHUỖI thuần (không qua new Date ⇒ không dính TZ), ĐỪNG sửa formatDateDMY sẵn có (4 site dùng). Tạo app/(teacher)/teacher/_components/ui/date-field.tsx có prop className + renderLabel để dùng được cả ở adjust-request-dialog (shadcn Input/Label) lẫn don-tu-client (input trần + Field cục bộ). Dưới ô luôn in 'Ngày đã chọn: dd/mm/yyyy'. Thay 5 ô: adjust-request-dialog:78-84; don-tu-client:455/513/579/587.
7. `app/(teacher)/teacher/cham-bai/_data.ts` — Chấm bài — thiếu năm và thiếu mốc hạn nộp
   - Thêm submittedAtFmt CÓ year cạnh dateFmt (:23, vốn đã có year); page.tsx:42-49 và hub-assignments-tab.tsx:63-70 import thay bản khai riêng. Thêm dueAt vào select assignment (page:109-117, hub:107-109), format Ở SERVER, in 'Hạn nộp' cạnh 'Nộp lúc' trong grade-form.tsx:209-213 (prop optional vì Class Hub dùng lại). Nhãn trễ: `sub.status==='LATE' || (sub.submittedAt != null && isLateSubmission(dueAt, sub.submittedAt))` — tham số thứ hai không nhận null.
8. `components/ui/dialog.tsx` — Nút đóng hộp thoại đọc lên là 'Close' (COMMIT RIÊNG)
   - Dòng 75 `<span className="sr-only">Close</span>` → 'Đóng'. Component dùng chung 4 site ⇒ tách commit.

**Rủi ro:** useSearchParams trong Next 16 đòi <Suspense> khi trang có static render — phải chạy pnpm build, loại lỗi chỉ nổ lúc build. Base UI Select phát string|null và hiện nhãn RỖNG nếu value không còn trong options (list-toolbar.tsx:70) ⇒ thứ tự sửa (2) trước (3) là bắt buộc. KHÔNG đụng components/ui/phan-trang-bang.tsx (128 chỗ gọi) và KHÔNG thêm useEffect reset trang vào bang-phan-trang.tsx (dòng 97-101 ghi rõ cách đó đã bị test đột biến bắt là code chết). KHÔNG chèn div/wrapper giữa PhanTrangBang và <table> — sai hình dạng thì phân trang tắt IM LẶNG. Nếu đổi câu chữ trong guides.generated.ts thì phải kiểm TrnLesson của module E-learning.

**Nghiệm thu:** pnpm vitest run: use-loc-tren-url (mặc định không lên query; round-trip; GIỮ param lạ; gọi history.replaceState chứ không router.replace) · class-list (render với ?status=ACTIVE ⇒ lọc đúng ngay lần render đầu) · buildStatusOptions (luôn chứa COMPLETED bất kể trạng thái điều khiển) · date-field (renderLabel=false KHÔNG render <label>) · lib/format/date (formatIsoDMY đúng ở mọi TZ) · phan-trang-bang (hai khoaGhiNho khác nhau không chia sẻ số dòng). Test quét: mọi <PhanTrangBang/<BangPhanTrang trong app/(teacher) đều có khoaGhiNho. Đo tay: /teacher/hoc-vien `document.querySelectorAll('table').length` ≤ 10 (hiện 37).

### Đ10 — Seed UAT + việc vận hành (KHÔNG sửa mã sản phẩm)

**Mục tiêu:** Dọn nguồn nhiễu khiến bản vá đúng bị chấm là hỏng, và dựng nhóm chat cho lớp UAT. Phải chạy TRƯỚC khi mời QA nghiệm thu lại Đ3/Đ4.

**Vé:** BUG-033, BUG-009, NV-005, BUG-004, SOAT-SEED-DONG, TIN-NHAN-BLOCKED · **Công:** L

**Các bước:**

1. `prisma/seed-uat/03-hoc-vu.ts` — Roster sinh điểm danh dùng đúng hằng của ứng dụng
   - Dòng 352 (ĐO LẠI bằng grep, KHÔNG tin số dòng trong các báo cáo — đã có hai lượt 'đính chính' sai): mảng chép tay ['STUDYING','ACTIVE','COMPLETED','PAUSED'] → ENROLLMENT_ACTIVE_STATUS_LIST. Hiện thiếu CONFIRMED (app CÓ) ⇒ ~10% em mỗi lớp không bao giờ có bản ghi ⇒ sau khi vá Đ4, gần như mọi buổi quá khứ trên UAT nhảy sang 'cần xử lý'.
2. `prisma/seed-uat/lich.ts` — Buổi học bám đúng thứ trong tuần
   - Helper thuần thuVN(n) + raiTheoThu(from, days, count); tách MOC/ngay/ngayGio sang prisma/seed-uat/ngay.ts (BẮT BUỘC: _common.ts:16 import @/lib/db nên Vitest chạm lich.ts sẽ dựng Prisma client). 03-hoc-vu.ts: thêm `scheduleDays: slot.days` vào lops.push (khối 202-224 hiện KHÔNG có), thay `lech = batDau + s*7` (:317) bằng lop.lechBuoi[s], startDate/endDate/enrolledAt/startedAt/endedAt bám dãy mới. Thêm `orderBy: { id: 'asc' }` cho 2 findMany ở 05-lms.ts:34/38 (seed hiện KHÔNG tất định dù có makeRng).
3. `scripts/uat-sua-lich-lop.ts` — Chữa dữ liệu lịch đã nằm trên DB test
   - KHUYẾN NGHỊ đổi NHÃN theo dữ liệu (ghi scheduleDays + Class.schedule + phần nhãn thứ trong Class.name theo thứ THẬT của dãy buổi), KHÔNG dời ngày buổi. Dời ngày mà quên đồng bộ status/completedAt/ck*/Attendance sẽ kéo hàng chục buổi tương lai về quá khứ với status SCHEDULED và 0 điểm danh — đẻ bug mới. Dùng lại assertSeedAllowed (_common.ts:26-42), chỉ đụng id tiền tố `uat-`.
4. `prisma/seed-uat/05-lms.ts` — Tiêu đề bài tập bị cắt cụt + các lệch khác của 05-lms
   - Bỏ .slice(0,45) (:75) và .slice(0,40) (:55); bốc MỘT lần dùng chung cho title+description (hiện 2 lượt pick độc lập nên mô tả nói về đề khác); kẹp submittedAt không vượt hiện tại (:102 đang sinh mốc nộp Ở TƯƠNG LAI cho 30% bài); `createdById: uat.daotao.employeeId ?? uat.daotao.id` (:57 — cột này là FK tới Employee, ghi User.id làm 6 mẫu thành vô chủ); ghép cặp CourseCompletion với ghi danh còn ACTIVE (~20%) để cột Kết quả có dữ liệu.
5. `scripts/fix-uat-assignment-titles.ts` — Chữa tiêu đề đã cụt trên DB test
   - UPDATE khớp TIỀN TỐ với DE_BAI (KHÔNG lấy description làm nguồn — hai lượt pick độc lập; KHÔNG xoá-seed-lại — seed không tất định). Giữ nguyên AssignmentSubmission để không mất điểm QA vừa chấm.
6. `prisma/seed-uat/06-cskh-nhansu.ts` — Đơn từ: loại đơn khớp lý do, khoảng ngày hợp lệ
   - Ghép cặp kind↔reason bằng bảng DON_MAU (:296 và :300 đang bốc độc lập); tôn trọng isRangeKind khi sinh fromDate/toDate (:298-299 ghi vô điều kiện ⇒ 'Đi muộn/Về sớm' trải 14 ngày, bất khả qua UI); createdAt không sau fromDate. Thêm ngayDate() vào _common.ts cho cột @db.Date (ngay() hiện lưu lùi 1 ngày ở WorkRequest.fromDate/toDate và ShiftRegistration.date) — RÀ TỪNG cột theo schema, KHÔNG thay thế hàng loạt trong 59 lời gọi.
7. `app/(teacher)/teacher/don-tu/_actions.ts` — Siết validate đơn từ ở server (MÃ SẢN PHẨM, tách commit)
   - submitSchema (:25-38) thêm superRefine: fromDate bắt buộc + regex ngày; với isRangeKind thì toDate ≥ fromDate (hiện đơn nghỉ '30/08 → 01/08' vào DB bình thường). Khối catch :89-94 và :162-167 đừng ném nguyên văn lỗi Prisma ra toast của GV. GIỮ dòng 55-59 (lá chắn ép to=from cho 7/10 loại).
8. `scripts/backfill-nhom-lop-chat.ts` — Dựng nhóm chat cho lớp UAT (VIỆC CỦA NGƯỜI VẬN HÀNH)
   - Agent KHÔNG tự chạy. `--preview 10` rồi `--apply` (cần DIRECT_URL để tránh 42P05). Đường prod không có lỗ (approveClass gọi syncConversationMembership cùng transaction, admin/classes/_actions.ts:991); seed ghi createMany thẳng DB nên nhóm không sinh. Ưu tiên thêm bước gọi script này vào .github/workflows/migrate-test.yml thay vì nhúng sync vào seed.

**Rủi ro:** BẪY LỚN NHẤT: taoThieu chỉ TẠO dòng thiếu theo id cố định (_common.ts:269) ⇒ sửa mã seed KHÔNG cập nhật dữ liệu đã có; chạy lại thấy '0 dòng tạo mới' và tưởng xong. Phải xoá theo TIỀN TỐ `uat-` rồi seed lại (đừng TRUNCATE). DB của môi trường `test` CHÍNH LÀ DB dev — lệnh xoá đụng cả dữ liệu đang làm ở local. `--apply` của backfill chat tạo nhóm cho MỌI lớp ACTIVE thật; nhóm dựng mới không bắn thông báo (publishEvent chỉ ở nhánh GỠ thành viên) nhưng lần chạy THỨ HAI sau khi roster đổi thì CÓ. Sau khi thêm CONFIRMED, số dòng Attendance TĂNG ⇒ mọi màn 'đã điểm danh x/y' trên UAT đổi số — báo QA trước.

**Nghiệm thu:** Vitest thuần: prisma/seed-uat/lich.test.ts (thuVN(3)===3; raiTheoThu(-32,[6],4) ra 4 lệch cùng thứ 6 cách nhau 7; raiTheoThu(0,[2,4],6) xen kẽ) · ten-bai.test.ts (tenBaiTap chứa trọn câu dài nhất) · test khẳng định danh sách status seed BẰNG ENROLLMENT_ACTIVE_STATUS_LIST · lib/work-request.test.ts + don-tu/_actions.test.ts (LATE_EARLY ⇒ to===from; LEAVE 30/08→01/08 ⇒ ok:false). Sau seed lại: SQL kiểm 0 dòng lệch thứ (`extract(dow from date AT TIME ZONE 'Asia/Ho_Chi_Minh') = ANY(scheduleDays)`), `length(title)=53` về 0, mọi lớp uat ACTIVE có đúng 1 Conversation CLASS_GROUP.

## Phải hỏi chủ dự án trước khi làm

### 1. % chuyên cần lấy mẫu số nào: TỔNG BUỔI CỦA KHOÁ (hiện tại, ví dụ 7/11) hay SỐ BUỔI ĐÃ DIỄN RA (7/7)?

Quyết định nghiệp vụ, không phải kỹ thuật. Mẫu số hiện tại được khai thành hợp đồng ở lib/attendance/summary.ts:4 và lib/students/progress.ts:79, và là con số PHỤ HUYNH đang nhìn (lib/portal/dashboard.ts:242) cùng con số in trên PDF học bạ đã phát hành. Đổi sang 'buổi đã diễn ra' thì % chuyên cần của mọi phụ huynh nhảy lên ngay sau deploy, và snapshot học bạ cũ có nguy cơ in 'undefined' nếu thiếu guard (parsePublishedSnapshot không validate metrics). Chặn: BUG-023 đường B, BUG-013 phần D.

- GIỮ tổng buổi khoá (khuyến nghị) — Đ8 chỉ sửa màn Hoàn thành khoá cho khớp 3 màn kia, KHÔNG đụng lib, 0 rủi ro cho portal PH
- ĐỔI sang buổi đã diễn ra — phải thêm trường `held` OPTIONAL vào AttendanceSummary, sửa cả lib/portal/dashboard.ts:242 (chỗ này tự viết lại công thức), chấp nhận % của mọi PH đổi ngay
- Giữ hai con số: học bạ/PDF dùng tổng khoá, màn nội bộ GV dùng buổi đã diễn ra và ghi rõ nhãn

### 2. Đợt này có xây màn DUYỆT đề xuất hoàn thành khoá ở admin không? Nếu không, có đồng ý ẨN nút 'Đề xuất hoàn thành' của GV không?

reviewCourseCompletion (hoan-thanh/_actions.ts:108) KHÔNG có caller nào trong toàn repo và không màn admin nào đọc CourseCompletionRequest. Mỗi lần GV bấm là một dòng PENDING không ai thấy, không ai duyệt, không rút lại được (enum chỉ có PENDING/APPROVED/REJECTED). Thêm dialog xác nhận cho một nút dẫn vào ngõ cụt là làm bug nặng hơn. Chặn toàn bộ Đ8.

- Xây màn duyệt ở /admin/hoan-thanh-khoa trong đợt này (khối 'Đề xuất chờ duyệt' theo cơ sở, nối vào reviewCourseCompletion) — Đ8 làm trọn
- ẨN nút + sửa 3 chuỗi 'chỉ xem' cho khớp, mở lại khi có màn duyệt — Đ8 rút gọn
- Giữ nguyên nút, chỉ thêm dialog cảnh báo (KHÔNG khuyến nghị: đề xuất vẫn rơi vào hố đen)

### 3. Cột 'Có mặt X/Y': chỉ đổi CHỮ thành 'Đi học' (3 màn, gồm cả admin), hay đổi cả CON SỐ (lọc tử số theo roster để X không vượt Y)?

Hiện tử số cộng cả LATE và KHÔNG lọc roster nên X có thể > Y — nhưng ADMIN mắc y hệt và có chú thích nói đó là CHỦ ĐÍCH ('có mặt đếm mọi người thực sự đi học buổi đó', admin/attendance/page.tsx:365-366). Vá riêng site GV là khiến quản lý và GV đọc hai con số khác nhau cho cùng một buổi. Mẫu số cũng đang là con số 'người dùng đang quen' (chú thích hub-sessions-tab.tsx:105-111).

- Chỉ đổi chữ, đủ 3 màn cùng một PR (khuyến nghị, rủi ro gần 0)
- Đổi cả con số, áp đồng thời cho admin + GV, chấp nhận số hiển thị thay đổi
- Giữ nguyên hoàn toàn

### 4. Bộ lọc trạng thái ở /teacher/lop: giữ ô tick 'Hiện lớp đã hoàn thành' (chốt 25/08, ghi trong docs/site-giao-vien-2508.md) hay gộp COMPLETED vào dropdown 'Mọi trạng thái'?

Nhãn 'Mọi trạng thái' hiện nói dối — nó chỉ lọc trên 38/50 lớp vì ô tick đã cắt COMPLETED trước. Gộp lại là ĐẢO một quyết định đã chốt và phải sửa tài liệu hướng dẫn — mà tài liệu đó có bản sao thứ hai trong DB module E-learning (di trú một chiều, scripts/elearning-import-guides.ts:22). Chặn BUG-005/006/007/015.

- Bản vá 1 dòng: đổi nhãn thành 'Mọi trạng thái đang phụ trách' — hết nói dối, không đổi hành vi, không đụng tài liệu (khuyến nghị)
- Gộp COMPLETED vào dropdown, bỏ ô tick — phải sửa tài liệu ở CẢ file TS lẫn bản trong E-learning
- Giữ nguyên

### 5. Cột 'Chuyển sang' (khoá tiếp theo) lấy nguồn từ đâu: thêm ô cấu hình ở form khoá học của admin, hay suy tự động theo slug/thứ tự?

Course.nextCourseId là cột CHẾT — 0 đường ghi trong toàn repo kể cả scripts/tests, dù chú thích schema.prisma:1356 hứa 'cấu hình admin'. Nguồn ĐÚNG mà /admin/hoan-thanh-khoa đang đọc là CourseCompletion.nextCourseId do suggestNextCourse sinh. Nếu chọn suy tự động thì phải đổi nhãn cột thành 'Gợi ý' kẻo GV tưởng là quyết định đã chốt.

- Thêm ô 'Khoá tiếp theo' vào form khoá học ở admin (đúng thiết kế gốc, rẻ, không đụng lib/completion/service.ts)
- Dùng suggestNextCourse — export/tách phần thuần, page đọc CourseCompletion.nextCourseId, đổi nhãn cột thành 'Gợi ý chuyển sang'
- Bỏ cột khỏi bảng cho tới khi có nguồn dữ liệu

## Cảnh báo kỹ thuật

1. NHÁNH: mọi việc phải cắt từ origin/test. Nhánh trong thư mục phiên làm việc hiện tại tụt 82 commit — vá trên đó là vá TRÙNG thứ main/test đã sửa rồi phải revert (đã xảy ra 26/08). Đo xung đột trước bằng `git merge-tree --write-tree --name-only`, và ĐỌC CLAUDE.md của origin/test chứ không phải bản cũ.

2. SỬA HÀM DÙNG CHUNG LÀ VỠ ADMIN/PORTAL: lib/enrollment-status.ts (ENROLLMENT_ACTIVE_STATUS_LIST — 109 lượt ở 45 file, chi phối sĩ số/điểm danh/học bạ/chat/hoa hồng cả 4 site), lib/lms/session-feedback-roster.ts (8 file gọi, gồm màn admin), lib/labels/registry.ts và lib/lms/report-card-core.ts (nhãn hiện ở admin + portal), lib/attendance/summary.ts và attendanceRatePercent (con số PHỤ HUYNH đang nhìn + PDF học bạ đã phát hành), components/ui/phan-trang-bang.tsx (128 chỗ gọi). Với các file này: CHỈ THÊM export mới, tách commit riêng, không đổi hành vi đường cũ.

3. CỔNG DB ĐÃ ĐÓNG: không import `@/lib/db` trần trong app/(admin|portal|teacher|sale) — ESLint error, allowlist chỉ còn 3 file exception và code mới KHÔNG xin thêm. Helper mới (lib/lms/attendance-pending.ts) phải NHẬN client làm tham số, không tự import db.

4. MIGRATION: không tự sinh migration đổi/bỏ cột trên bảng đang có dữ liệu PROD; migration chỉ nằm trong story được giao, có dry-run, Dev chạy TAY. Đợt này chỉ có MỘT migration khả dĩ (thêm giá trị CANCELLED vào enum CourseCompletionRequestStatus ở Đ8) — additive, và chỉ làm nếu quyết định #2 chọn xây màn duyệt.

5. scopedDb KHÔNG che WRITE — chỉ auto-scope 7 method đọc, và CHỈ ở tầng top-level. Nested include/_count KHÔNG được hook (lib/db.ts:66) nên mọi chỗ đọc lồng phải tự thêm deletedAt; mọi update/delete phải tự passesScope().

6. ĐỪNG đổi `class.findMany → select.enrollments` thành `enrollment.findMany` cho gọn: Enrollment ∈ SCOPED_MODELS (db-scope.ts:30), injectScope chèn `centerId IN (...)` trần ⇒ ghi danh centerId=null biến mất IM LẶNG. Đây là lý do các file hiện tại cố ý đọc qua quan hệ class (chú thích hoan-thanh/page.tsx:109, hoc-vien/page.tsx:150).

7. Class và ClassSession ∈ MAKEUP_EXCEPTION_MODELS (db-scope.ts:562) ⇒ withMakeupException KHÔNG lọc cơ sở. Cách ly của 7 màn GV chỉ treo vào mệnh đề `id: { in: classIds }`. Nới nó (vd đổi sang `where: { teacherId }` cho gọn) là rò lớp liên cơ sở NGAY và IM LẶNG.

8. MAX-WIDTH TRÊN <td> LÀ HÀNH VI UNDEFINED (CSS 2.1 §17.5.2) — Chrome/Firefox bỏ qua ở table-layout:auto. Trần bề rộng phải đặt trên phần tử KHỐI BÊN TRONG ô. Mọi bản vá bảng PHẢI nghiệm thu bằng đo trình duyệt, không bằng đọc diff.

9. teacher.css có 0 chữ @layer và được nạp bằng import thường ⇒ CSS không-phân-tầng, thắng mọi utility Tailwind. Rule thêm vào đó BẮT BUỘC bọc `@layer base`, kẻo đè `cursor-*`, `min-w-*` viết trong markup.

10. PhanTrangBang chỉ nhận ĐÚNG MỘT <table> một <tbody>; chèn div/wrapper vào giữa thì phân trang TẮT IM LẶNG (phan-trang-bang.tsx:110-111 fail-safe trả bảng nguyên trạng, không báo lỗi).

11. SEED: taoThieu CHỈ TẠO dòng thiếu theo id cố định ⇒ sửa mã seed KHÔNG cập nhật dữ liệu đã có; chạy lại thấy '0 dòng tạo mới' rồi tưởng xong. Phải xoá theo TIỀN TỐ `uat-` rồi seed lại. Và DB của môi trường `test` CHÍNH LÀ DB dev — lệnh xoá đụng cả dữ liệu đang làm ở local. Đừng TRUNCATE.

12. CI: job E2E cần trình duyệt đang chết ở bước `playwright install --with-deps` (GitHub báo 'cancelled' chứ không phải failed) ⇒ KHÔNG viết spec Playwright trong đợt này; test tầng lib bằng Vitest. Nếu bắt buộc dùng `page` thì đặt ở tests/e2e/a0, không đặt ở tests/e2e/r7.

13. SỐ DÒNG trong các báo cáo KHÔNG đáng tin cho prisma/seed-uat/03-hoc-vu.ts — đã có hai lượt 'đính chính' và một lượt sửa ĐÚNG thành SAI. Phải grep lại nguyên văn dòng trước khi sửa, và trong tài liệu nên trích nội dung dòng chứ không chỉ số dòng (file sẽ dịch dòng ngay sau bản vá đầu tiên).

14. app/(teacher)/teacher/huong-dan/_content/guides.generated.ts có NGƯỜI TIÊU THỤ THỨ HAI: scripts/elearning-import-guides.ts:22 đã nhập vào TrnLesson theo DI TRÚ MỘT CHIỀU. Sửa file TS chỉ đổi trang hướng dẫn; bản GV đọc trong module E-learning vẫn dạy sai. Ngược lại, chạy lại script sẽ GHI ĐÈ nội dung người soạn đã sửa. Ưu tiên phương án KHÔNG đổi chuỗi tài liệu.

15. Ba tên helper đang được đề xuất cho CÙNG một việc (lib/enrollment-scope.ts / lib/completion/scope.ts / rosterWhere vs whereGhiDanhKetKhoa). Chốt MỘT tên ở Đ1 trước khi mở PR đầu tiên, kẻo repo có thêm 2-3 nguồn chân lý về 'ai đang trong lớp' — đúng cái bệnh 8 vé đang tố.

16. Bốn vé (BUG-021, 023, 028, 031/038) cùng đè hoan-thanh/page.tsx và completion-table.tsx, trong đó BUG-023 XOÁ khối 134-198 và BỎ prop completedSessions. Phải gộp thành MỘT PR hoặc chỉ định một người làm cả cụm.

17. Nút 'Đề xuất hoàn thành' phụ thuộc seed-roles chạy TAY (completions:propose-own, seed-roles.ts:949). Trên môi trường bật RBAC_V2 mà seed cũ, nút trả 'Không có quyền' chứ không im lặng — loại trừ ca này trước khi kết luận nút hỏng. Đồng thời: mặc định RBAC_V2 trong code là OFF ⇒ đừng kết luận hành vi quyền từ máy local.

18. react-pdf nhớ font theo tiến trình: mọi lệnh render PDF phải nằm TRONG withFreshFonts, đừng kéo createElement ra ngoài.

## Hoãn / chưa đủ dữ kiện

- **BUG-032** — Đề bài nói BUG-001..039 (không có 027) nhưng danh sách chi tiết nhảy từ 031 sang 033, và không finding/extraIssue nào nhắc tới. Bản QA report KHÔNG nằm trong repo (grep docs + *.md = 0) nên không có triệu chứng để điều tra. Phải xin nguyên văn mục này từ QA.

- **BUG-036 (trùng mã)** — Một mã QA đang gánh HAI khiếm khuyết không liên quan: bề rộng cột bảng Trial và chấm phiếu cho buổi trial chưa diễn ra. Hậu tố '-layout' do agent tự đặt. Nhiều khả năng một trong hai đang trả lời cho mã khác (có thể chính là BUG-032). Cả hai VẪN được vá, nhưng phải khớp lại mã trước khi chốt 'đã phủ hết'.

- **BUG-036 (chặn chấm phiếu trial buổi tương lai)** — Cần một phép đo runtime để biết vá cái gì: `SELECT ... FROM "TrialRubricEval" e JOIN "TrialClassSession" s ... WHERE s."date" > current_date;` (dùng `>` chứ KHÔNG `>=`). 0 dòng ⇒ thứ QA thấy chỉ là ca lành tính 'chấm buổi hôm nay' do lệch mốc `>=` ở teacher-schedule.ts:779 vs `<` ở trial-row-status.ts:70, việc cần làm rút về đổi nhãn. Có dòng ⇒ mới cần chặn ghi trong Server Action.

- **BUG-023 đường B / BUG-013 phần D** — Đổi attendanceRatePercent là đổi % chuyên cần MỌI phụ huynh đang nhìn (lib/portal/dashboard.ts:242 tự viết lại công thức, PDF học bạ đọc snapshot đã đóng băng, parsePublishedSnapshot KHÔNG validate metrics). Là quyết định chính sách. Chờ quyết định #1.

- **BUG-017 bước 2 (đổi CON SỐ cột 'Có mặt')** — Quy ước 'X có thể > Y' là quy ước TOÀN HỆ THỐNG, có chú thích chủ đích ở admin/attendance/page.tsx:365-366. Vá riêng site GV là đẻ lệch admin↔GV. Đợt này chỉ làm bước đổi CHỮ (đủ ba màn).

- **BUG-011 phần đồng bộ 4 site** — globals.css không có rule cursor cho button ⇒ admin/portal/public cũng thiếu y hệt. Sửa ở @layer base của app/globals.css thì phải nghiệm thu lại 3 site ngoài phạm vi đợt QA này.

- **IMP-015 (table-layout:fixed + colgroup đại trà)** — Bảng Học bạ có SỐ CỘT ĐỘNG (report-cards-list.tsx:414-426) và BangPhanTrang không có khe cắm <colgroup> (bang-phan-trang.tsx:124). Áp fixed đại trà sẽ bóp nát cột tên. Vá theo từng bảng như Đ2.

- **NV-004 phần /Title của PDF** — Chuỗi nhân quả 'Chrome lấy tiêu đề tab từ /Title' KHÔNG kiểm được từ mã nguồn. Phải mở PDF trên Chrome ĐO trước và sau khi vá safeFilename (Đ6); nếu tab đã hết id thì thêm <Document title=...> chỉ là dọn vệ sinh.

- **BUG-038 phần ẩn cột SCORM** — Cần 2 số đo trên môi trường test trước: `SELECT count(*) FROM "ScormPackage" WHERE "isActiveForLesson" AND status='PUBLISHED'` và giá trị SCORM_ENABLED của environment `test`. Ẩn cột khi chưa biết nhánh nào đúng là đoán.

- **extraIssue: đề bài GV tự soạn hiện trong 'Thư viện admin' của GV khác kèm ĐÁP ÁN** — Chưa rõ là cố ý (nhãn tab ghi 'mẫu trung tâm cài sẵn') hay sót. cham-bai/_data.ts:240-249 lấy MỌI mẫu không phải của mình; TEMPLATE_SELECT kéo cả correctAnswer/isCorrect xuống client. Cần chủ dự án chốt chính sách chia sẻ đề trước khi đụng (có thể phải thêm cột visibility ⇒ migration).

- **extraIssue: mở kênh chat riêng khi GV chưa có nhóm lớp nào** — Bản vá 'nạp assignableParents cho GV' KHÔNG phải drop-in: OpenDmButton trong khối đó hard-code kind='SALE_PARENT', GV bấm sẽ đi nhánh quyền của Sale chứ không phải resolveTeacherParentRelation. Là thay đổi sản phẩm, cần chủ dự án duyệt.

- **extraIssue: CAPACITY_COUNT_STATUSES thiếu PAUSED** — Nằm ở admin (admin/enrollments/_actions.ts:81), ngoài cụm site GV. Có PENDING trong mẫu số sức chứa là chuẩn nghiệp vụ (giữ chỗ); điểm sai duy nhất là thiếu PAUSED — 'bảo lưu có giữ ghế không?' là câu hỏi chính sách, đừng tự 'đồng bộ' hai hằng số.

- **extraIssue: lib/lms/attendance-rate.ts là mã chết tự xưng source-of-truth** — computeAttendanceRate/rateFromStatuses không có call-site sản xuất nào (chỉ test), và header của chính nó mô tả sai mẫu số. Nên xoá hoặc biến thành wrapper của attendanceRatePercent — nhưng gộp vào đợt vá QA sẽ làm loãng diff. Ticket dọn nợ riêng.

- **extraIssue: lib/lms/calendar.ts tính ngày theo TZ tiến trình** — Ảnh hưởng /admin/lich và /portal/lich, KHÔNG ảnh hưởng site GV (site GV tự cài Intl timeZone). Cả 5 khung giờ thật của Sata đều an toàn với UTC. Vá bằng @/lib/time/vn ở ticket riêng.

- **extraIssue: 3 hàm vnTodayEnd/vnTodayEndMs/vnTodayRange viết tay** — Bốn bản sao trả 00:00 NGÀY MAI còn lib/time/vn.ts:80 vnEndOfDay trả 23:59:59.999 hôm nay — không phải thay-một-đổi-một, và một trong bốn chỗ là gate GHI ở server (lop/_actions.ts:129-134). Gộp phải gộp cả bốn trong một PR kèm test mốc biên; để riêng sau đợt QA.

## Lỗi QA chưa bắt được (black-box không nhìn thấy)

### [HIGH] Duyệt phiếu xin nghỉ của phụ huynh ghi 1 dòng Attendance → buổi biến mất khỏi việc cần làm của GV (ngòi nổ RC-2 trên PROD)

`app/(admin)/admin/parent-requests/actions.ts:129`

GIỮ NGUYÊN — tôi mở file và xác nhận đúng dòng 129 `sdb.attendance.upsert({` trong `$transaction`, upsert đúng một học viên. Buổi đó lập tức thoả "≥1 bản ghi" nên rơi khỏi StatCard "Buổi chưa điểm danh" (teacher/page.tsx:208), khỏi cột "Cần xử lý" (lop/page.tsx:423) và hiện pill xanh "Có mặt 0/12" ở Class Hub. Đây là bằng chứng RC-2 gây hại NGOÀI dữ liệu UAT: chỉ cần một phụ huynh xin nghỉ trước buổi. Vá RC-2 là hết; không sửa file này.

### [HIGH] Đề xuất hoàn thành khoá RƠI VÀO HỐ ĐEN — không màn nào duyệt được (đã kiểm chứng lại, giữ nguyên)

`app/(teacher)/teacher/hoan-thanh/_actions.ts:108`

Tôi grep lại toàn repo: 'reviewCourseCompletion' chỉ ra 3 kết quả — định nghĩa (_actions.ts:108), chú thích đầu file (:3), và một chú thích ở lib/db-scope.ts:216. 'CourseCompletionRequest' ra 8 kết quả, TẤT CẢ nằm trong app/(teacher)/teacher/hoan-thanh/* + lib/db-scope.ts:218 + lib/org/center-bridge.ts:103 — 0 kết quả trong app/(admin). Hệ quả đúng như báo cáo cũ: mỗi lần GV bấm là một dòng PENDING không ai thấy, không ai duyệt, không rút lại được (enum không có CANCELLED). ĐÍNH CHÍNH ưu tiên: vì bản vá BUG-028 (dialog + cảnh báo) KHÔNG gỡ được ngõ cụt này, việc rẻ và đúng nhất nếu đợt này không kịp làm màn duyệt là ẨN NÚT + sửa 3 chuỗi 'chỉ xem', rồi mở lại khi /admin/hoan-thanh-khoa có khối 'Đề xuất chờ duyệt' nối vào reviewCourseCompletion.

### [HIGH] Màn chi tiết bài tập RỖNG với lớp đã kết thúc — GV không mở được bài nào để chấm, dù action chấm vẫn cho phép

`app/(teacher)/teacher/cham-bai/page.tsx:217`

GIỮ NGUYÊN từ bản cũ và CỦNG CỐ thêm bằng bằng chứng mới. Roster mức chi tiết dựng từ `asg.class.enrollments` lọc `ENROLLMENT_ACTIVE_STATUS_LIST` (page.tsx:196-197), `rows={roster.map(...)}` (:275) ⇒ lớp mà mọi ghi danh đã COMPLETED/WITHDREW cho `roster = []` ⇒ EmptyState 'Lớp chưa có học viên đang học.' (:256) dù `asg.submissions` vẫn có bài chờ chấm; tiêu đề cùng màn in '2/0' (:237) và `batchRoster` (:226) rỗng nên 'Chấm cả lớp' vô dụng. BẰNG CHỨNG MỚI cho thấy đây thuần là lỗi HIỂN THỊ chứ không phải luật nghiệp vụ: `gradeSubmission` (app/(admin)/admin/assignments/_actions.ts:503-557) KHÔNG hề kiểm ghi danh còn hiệu lực — chỉ kiểm `classCenterVisible` + `canGradeClassWork` + `status !== NOT_SUBMITTED` ⇒ nếu GV mò được URL `?submissionId=` thì chấm được bình thường. Tức hệ thống CHO PHÉP chấm, chỉ giao diện không đưa được đường vào. Bản sao ở Class Hub: hub-assignments-tab.tsx:199-200 (lọc), :226 (roster), :242-243 (nhãn x/0), :252 (empty state). Vá cùng lượt với BUG-025: roster = HỢP của (ghi danh đang hoạt động) ∪ (học viên có dòng AssignmentSubmission của chính bài này) — chỉ cần thêm `student: { select: { id: true, name: true } }` vào khối submissions (page.tsx:203-210) rồi trộn, giữ chú thích 'câu 46: chỉ tên HV'.

### [HIGH] Truy vấn bài tập KHÔNG bị cách ly cơ sở còn truy vấn sĩ số thì CÓ — GV thiếu UserOrgRole thấy TOÀN BỘ bảng là x/0

`app/(teacher)/teacher/cham-bai/page.tsx:370`

MỚI — cơ chế thứ hai của '2/0' mà bản điều tra cũ bỏ sót, và nó đánh cả lớp ĐANG DẠY. `sdb.assignment.findMany` (:337) đọc `Assignment`, model KHÔNG có trong `SCOPED_MODELS` (grep lib/db-scope.ts:11-135: chỉ có `TrnAssignment`) nên không bị lọc cơ sở — cách ly do guard `classId ∈ actor.assignedClassIds` lo. Nhưng `sdb.class.findMany` (:370) đọc `Class`, CÓ trong `SCOPED_MODELS` (db-scope.ts:12) nên bị inject `centerId: { in: visibleCenters }` (db-scope.ts:454). `visibleCenterIds` dựng THUẦN từ `UserOrgRole` (actor.ts:80), không có đường lùi về `User.centerId`, trong khi `assignedClassIds` lấy từ `db.class.findMany` thô theo `teacherId/assistantId` (actor.ts:443-444). Hệ quả: GV có lớp nhưng thiếu `UserOrgRole` — đúng sự cố RC-A/K1 đã xảy ra trên prod 07/08 — vẫn thấy đủ bài nhưng `classCounts = []` ⇒ MỌI dòng in x/0, và tab 'Đã nộp' của Class Hub (`cls?._count.enrollments ?? 0`, hub:346-365) cũng về 0. Cùng hình dạng lỗi, nguyên nhân khác, nên vá BUG-025 phải giữ được lưới `Math.max(..., submitted)` chứ không chỉ đổi mẫu số. Kiểm nhanh trên test/prod: `SELECT u.email FROM "User" u JOIN "Class" c ON c."teacherId" = u.id LEFT JOIN "UserOrgRole" r ON r."userId" = u.id WHERE r.id IS NULL GROUP BY u.email;`

### [HIGH] Vòng đề xuất hoàn thành khoá CỤT ĐẦU: GV bấm "Đề xuất" nhưng không có màn nào duyệt, đề xuất nằm PENDING vĩnh viễn

`app/(teacher)/teacher/hoan-thanh/_actions.ts:108`

`proposeCourseCompletion` CÓ đường gọi thật từ UI (completion-table.tsx:16 import, :220 gọi) → tạo `CourseCompletionRequest` status PENDING. Nhưng `reviewCourseCompletion` (:108) KHÔNG CÓ MỘT CALLER NÀO trong toàn repo — grep `reviewCourseCompletion` chỉ ra 3 hit: chú thích :3, khai báo :108, và một dòng chú thích ở lib/db-scope.ts:216. Grep `courseCompletionRequest` toàn app/ + lib/ ra đúng 5 hit, TẤT CẢ trong app/(teacher)/teacher/hoan-thanh/ — không có màn admin nào liệt kê hay duyệt. Chú thích :3 tự thú: "UI quản lý ở admin — action sẵn sàng", tức UI chưa từng được xây. Hệ quả người dùng: GV đề xuất xong thấy badge "Chờ duyệt" (page.tsx:168-175 + completion-table.tsx bộ lọc "Chờ duyệt") và chờ mãi; quản lý không có chỗ nào nhìn thấy. Đây mới là lỗ hổng nặng nhất của cụm hoàn thành khoá, nặng hơn cột "Chuyển sang" mà BUG-038 xoáy vào. Vá: xây màn duyệt ở /admin/hoan-thanh-khoa (đọc CourseCompletionRequest PENDING theo cơ sở) nối vào `reviewCourseCompletion`; nếu chưa kịp thì ẩn nút "Đề xuất hoàn thành" thay vì để GV gửi vào hư không.


_Tổng: 111 vấn đề phụ được ghi nhận, 5 ở mức HIGH trở lên._

---

## Quyết định của chủ dự án (03/09/2026)

| # | Câu hỏi | Chốt | Hệ quả |
|---|---|---|---|
| 1 | Mẫu số % chuyên cần | **Tổng số buổi của khoá** (giữ nguyên) | Không đụng `lib/attendance/summary.ts`, `attendanceRatePercent`, cổng phụ huynh, PDF học bạ. Đ8 chỉ sửa màn Hoàn thành khoá cho khớp 3 màn kia. |
| 2 | Màn duyệt hoàn thành khoá ở admin | **Xây luôn** | Đ8 làm trọn: `/admin/hoan-thanh-khoa` nối vào `reviewCourseCompletion`; thêm `CANCELLED` vào enum `CourseCompletionRequestStatus` (additive) để GV rút đề xuất. |
| 3 | Cột "Có mặt X/Y" | **Đổi cả con số** | Mở rộng ra ngoài site GV: phải áp đồng thời cho `/admin/attendance`, và gỡ chú thích "chủ đích" ở `admin/attendance/page.tsx:365-366`. Tử số lọc theo roster để X không vượt Y. |
| 4 | Bộ lọc `/teacher/lop` | **Theo QA (IMP-003)** — gộp "Đã hoàn thành" vào dropdown, bỏ ô tick | Đảo chốt 25/08. Phải sửa tài liệu ở **cả hai** nơi: `guides.generated.ts` và bản trong module E-learning (`scripts/elearning-import-guides.ts`). |
| 5 | Cột "Chuyển sang" và các cột rỗng | **Theo QA (IMP-021)** — ẩn cột chưa có dữ liệu | Ẩn `Chuyển sang`/`Kết quả` (Hoàn thành khoá) và `Khoá học` (Trial). Cột SCORM (Tài liệu) **chờ 2 phép đo** trước khi ẩn — xem mục Hoãn. |

**Đổi so với bản kế hoạch gốc:** #3 và #4 đều chọn phương án rộng hơn khuyến nghị, nên Đ9 phải kéo thêm việc sửa tài liệu, và phát sinh một đợt phụ chạm `app/(admin)/admin/attendance/`.
