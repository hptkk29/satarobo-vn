# Kế hoạch giải xung đột merge PR #22 (`FixLMS` → `main`)

> **Ngày:** 2026-06-21 · **Trạng thái:** 🟡 DRAFT — chờ user duyệt quyết định · **Phương pháp:** 3 agent phân tích read-only trên git refs (`origin/main` vs `origin/FixLMS`), KHÔNG sửa code.
> **merge-base:** `cc3c493` · **Phân kỳ:** `main` +15 commit · `FixLMS` +34 commit · **Xung đột:** 34 file (10 add/add + 24 content).

---

## 0. Phát hiện cốt lõi (đọc trước khi quyết)

PR này **KHÔNG phải** "FixLMS thêm guard cách ly chồng lên business logic của main". Thực tế:

- **`main` vừa nuốt nhánh `full-R7` (PR #21)** = khối LMS W1–W5: refund lifecycle, tin nhắn 2 chiều, SCORM runtime (GV), báo cáo doanh thu-vs-mục-tiêu, schema mở khoá thi lại/phòng-per-buổi (W5a), **auto-scope cách ly cơ sở phase A (W5f)**.
- **`FixLMS` là một bản hiện thực SONG SONG** của phần lớn cùng việc R7/LMS đó, dùng **module layout khác** (helper, tên model, kiểu trả về khác).

→ Hệ quả: phần lớn xung đột "nặng" là **chọn bản hiện thực nào thắng cho từng subsystem**, KHÔNG phải gộp guard. Và vì **`main` cũng đã tự làm cách ly cơ sở (W5f + `canManageSessionClass`)**, một phần công isolation của FixLMS có thể **trùng** với main — cần xác minh, đừng mặc định FixLMS là nguồn isolation duy nhất.

### ⚠️ Quyết định 0 — Chiến lược tổng (cần user chốt TRƯỚC)

| Phương án | Mô tả | Đánh giá |
|---|---|---|
| **A. Merge đầy đủ FixLMS→main, lấy MAIN làm chuẩn** (Recommended) | Giải 34 xung đột: competing subsystem theo MAIN; cherry-pick giá trị riêng FixLMS (isolation chưa-trùng + additive) | Đúng hướng PR; nhưng ~16 file CẦN-NGƯỜI, công lớn |
| **B. Cherry-pick chọn lọc lên main** | Bỏ PR #22; chỉ port phần giá trị riêng FixLMS (leadChildId, isolation chưa-trùng, receipt CS2, substitute persist, retention-scan, money-Int) thành PR nhỏ trên main | Ít rủi ro hơn nếu phần lớn FixLMS đã trùng main; cần biết chính xác "phần riêng" |
| **C. Giữ FixLMS canonical, không merge** | Theo MEMORY "origin/FixLMS is canonical"; main là nhánh chết | Mâu thuẫn: main có refund/scorm đúng-scope hơn; bỏ phí W1–W5 |

> 🔑 **Khuyến nghị: A**, nhưng **B đáng cân nhắc** nếu sau bước xác minh thấy isolation của FixLMS phần lớn trùng W5f của main. Quyết định 0 chi phối toàn bộ phần dưới.

---

## 1. Chiến lược đề xuất (giả định chọn A)

**Lấy `main` làm BASE cho mọi subsystem cạnh tranh** (main đầy đủ + đúng scope FROZEN hơn), rồi **cherry-pick giá trị RIÊNG của FixLMS**:

**Theo MAIN (competing — main thắng):** refund (full lifecycle + model + audit) · SCORM (GV-delivery, đúng scope FROZEN) · messaging (`ConversationMessage` + ownership + không lộ studentId) · billing portal R7-04 *(cần verify phủ G.6)* · report-card *(cần quyết shape snapshot)* · schedule-conflict *(cần quyết — xem D2)*.

**Giữ RIÊNG của FixLMS (cherry-pick, additive):**
- `Enrollment.leadChildId` + index (R7-06 convert per-con) — truy vết convert.
- `substituteTeacherId/substituteRoomId` PERSIST ở `adjust.ts` (P5/T11) — *nếu chọn giữ feature dạy-thay/đổi-phòng cấp buổi*.
- Receipt prefix CS2 (`payment.ts` `centerCodeOf`) — fix đã làm phiên này.
- Cron `retention-scan` (`vercel.json`).
- Money `Float→Int` (5 cột tiền) — **đã apply lên DB sống**, bắt buộc giữ.
- `exams/_actions` check thêm `student.centerId` (FixLMS chặt hơn).
- Cách ly cơ sở ở các admin action **mà main CHƯA có** (xác minh từng file, tránh trùng W5f).

---

## 2. 6 cụm quyết định (chốt theo CỤM, đừng tách file lẻ)

> Nhiều conflict ở `_actions.ts` chỉ là **hệ quả import** của các cụm này. Quyết cụm trước, file lẻ tự khớp.

| # | Cụm | File trong cụm | Khuyến nghị | Cần user? |
|---|---|---|---|---|
| **D1** | **Refund** | `lib/finance/refund.ts` + `refund.test.ts` + `admin/students/_actions.ts` + `admin/classes/_actions.ts` | **THEO MAIN** (full lifecycle + `RefundRequest` model + audit + UI `/admin/hoan-tien`). FixLMS chỉ `computeRefund` read-only, **không persistence**. `computeRefund` trùng tên KHÁC signature → không gộp được | Xác nhận |
| **D2** | **Soát trùng lịch + dạy thay** | `lib/classes/generate.ts` + `adjust.ts` + `admin/sessions/_actions.ts` | **CẦN-NGƯỜI.** main `findScheduleConflicts`→`{warning}` vs FixLMS `detectSessionConflicts`→`{conflicts[]}`. FixLMS có **persist `substituteTeacherId/RoomId`** (feature thật, cần 2 cột schema). Chọn 1 module + quyết có giữ persist dạy-thay không | ✅ QUYẾT |
| **D3** | **Học bạ — skill snapshot** | `lib/lms/report-card-core.ts` + `report-card.ts` | **CẦN-NGƯỜI.** main level=**string** (`latestSkillLevels`) vs FixLMS=**numeric** `levelScore` (`computeSkillSummary`). **Khác HÌNH DẠNG snapshot JSON** → ảnh hưởng học bạ ĐÃ PHÁT HÀNH/lưu trên DB sống | ✅ QUYẾT |
| **D4** | **SCORM** | `app/api/scorm/runtime/route.ts` + `components/admin/scorm-player.tsx` | **THEO MAIN** (R7-12 tracking GV, có feature-flag, **KHÔNG ghi điểm HV**). FixLMS LMS-14 **ghi điểm HV → vi phạm scope FROZEN** (CLAUDE.md: "KHÔNG online video LMS / điểm HV đã LOẠI"; MEMORY: SCORM deferred) | Xác nhận |
| **D5** | **Billing portal** | `lib/portal/billing.ts` + `portal/hoc-phi/page.tsx` | **Lean MAIN** (R7-04 `getParentBilling`: enrollments + receipts + totals từ Payment 2 tầng). FixLMS G.6 (`getParentTuitionTotal/Balance` + section Đơn hàng) là bản phiên này wire. **Verify main R7-04 hiển thị đủ cái G.6 cần** trước khi bỏ G.6 | ✅ QUYẾT |
| **D6** | **Messaging** | 5 file `tin-nhan` (admin 2 + portal 3) | **THEO MAIN** (`lib/conversation/service`, thread per-`enrollmentId`, `scopedDb` + `assertOwnsStudent`, không lộ studentId URL). FixLMS `MessageThread`+`subject` per-student. Chọn TRỌN 1 kiến trúc — model loại trừ nhau | Xác nhận trừ khi thread+subject là yêu cầu mới |

---

## 3. Schema & migration — phần RỦI RO NHẤT

> 🔴 **DB sống đang ở lineage FixLMS** (migration FixLMS ĐÃ apply). Union mù migration của main sẽ **FAIL** vì tạo trùng bảng/cột đã tồn tại.

### 3.1 Additive — GỘP được (giữ cả 2 bên)
`Enrollment.centerId`+index (main W5f) **và** `Enrollment.leadChildId`+index (FixLMS) · `ClassSession.roomId`+FK (main W2-4b) + `centerId` (W5f) + `substituteTeacher/RoomId` (FixLMS) · `Attendance.centerId` (W5f) · `Room`/`Lesson` back-relation · money `Float→Int` (FixLMS, đã apply) · `Lead`/`Student` relation phụ.

### 3.2 Trùng — giữ MỘT bản
| Đối tượng | Giữ bản | Lý do |
|---|---|---|
| `ExamAttempt.attemptNo` + unique | **FIXLMS** | migration FixLMS có `DROP INDEX` cũ; main thiếu |
| `StudentSkillAssessment.classSessionId/lessonId` | **MAIN** | có thêm FK + relation (FixLMS thiếu FK) |
| `ScormPackage.attempts[]` | gộp (giống hệt) | — |

### 3.3 Mâu thuẫn THẬT — phải chọn (gắn với cụm §2)
| Model | main | FixLMS | Theo |
|---|---|---|---|
| **`ScormAttempt`** | tracking GV (`completion` enum, `totalTimeSec`, `sessionCount`) | điểm HV (`scoreRaw Int`, `rawCmi Json`, unique `packageId_userId`) | **MAIN** (D4) |
| **`RevenueTarget`** | `targetAmount` + `createdById` | `amount` + index `period` | **MAIN** (`targetAmount`) |
| **Messaging** | `ConversationMessage` (per-enrollment) | `MessageThread`+`Message` (per-student) | **MAIN** (D6) |
| **`RefundRequest`** | có (main only) | KHÔNG có | **MAIN** (D1) |

### 3.4 Kế hoạch migration (KHÔNG union mù)
1. Chốt D1/D3/D4/D6 → biết model nào thắng.
2. **Giữ migration FixLMS đã-apply** làm baseline (`attemptNo`, skill-link cột, money-Int, các bảng đã tạo).
3. **Khử** các migration main tạo trùng bảng/cột đã tồn tại (RevenueTarget cũ, ScormAttempt-LMS14, attemptNo của main, skill-link không-FK).
4. Viết **1 migration reconcile mới** (timestamp > `20260619020000`) chỉ chứa phần **main-only thật sự thiếu** trên DB: `ClassSession.roomId`+FK, các `centerId` W5f (ClassSession/Enrollment/Attendance), `RefundRequest`+2 enum, FK cho skill-assessment, `ScormAttempt`(R7-12), bảng messaging bên thắng, `RevenueTarget(targetAmount)`.
5. `schema.prisma` gộp khớp đúng trạng thái DB sau bước 4 → `migrate deploy` chỉ chạy migration mới.

### 3.5 Hạ tầng nhỏ
- **`vercel.json`:** FixLMS là superset (có cả `reserve-expiry` + `retention-scan`) → **lấy nguyên FixLMS**.
- **`lib/db-scope.ts`:** cả 2 sửa `SCOPE_EXEMPT`; union đúng ngữ nghĩa **NHƯNG phải merge tay** giữ isolation FixLMS + entry `RefundRequest`/`ClassSession`/`Attendance`/`Enrollment` của main; **không kéo `lms-extra`** nếu bỏ revenue-target FixLMS. Khử dòng `RevenueTarget` lặp.
- **`lib/auth/route-policy.ts`:** union `ADMIN_ROUTE_SEGMENTS` 2 bên — auto-merge an toàn (main thêm `tin-nhan`; FixLMS thêm `bao-cao/payments/scorm/...`).

---

## 4. Bảng resolve per-file (24 content + 10 add/add)

### Dễ — GỘP cơ học / THEO MAIN (8)
`admin/enrollments/_actions.ts` (giữ select main) · `admin/classes/[id]/session/_actions.ts` (logic y hệt) · `admin/students/[id]/_actions.ts` (chỉ khác comment) · `admin/students/[id]/edit/page.tsx` (THEO FIXLMS — gọi helper `canAssessStudent`) · `lib/finance/refund.test.ts` (theo D1) · `vercel.json` (gộp 2 cron) · `prisma/schema.prisma` (§3) · `api/cron/reserve-expiry/route.ts` (chọn 1 module, ưu tiên MAIN).

### Trung bình — chọn-1 guard / union (9)
`admin/assignments/_actions.ts` · `admin/attendance/_actions.ts` · `admin/attendance/page.tsx` (THEO FIXLMS hợp pattern target hơn, hoặc MAIN cho đồng bộ — chọn 1, đừng trộn 2 biến scope) · `admin/exams/_actions.ts` (giữ check `studentCenterId` của FixLMS) · `admin/trials/actions.ts` (union select) · `admin/sessions/_actions.ts` (GỘP: conflict-check main + guard cách ly FixLMS) · `admin/students/_actions.ts` + `admin/classes/_actions.ts` (refund API MAIN + cách ly FixLMS) · `portal/bai-thi/[examId]/page.tsx`.

### Khó — CẦN-NGƯỜI / mâu thuẫn ngữ nghĩa (16)
`lib/finance/refund.ts` (D1) · `lib/finance/payment.ts` (**GỘP:** event `payment.rejected` của main + receipt CS2 + xét cờ `stale` FixLMS — soi caller `rejectPayment`) · `lib/portal/billing.ts` + `portal/hoc-phi/page.tsx` (D5) · `lib/classes/generate.ts` + `adjust.ts` (D2) · `lib/lms/report-card-core.ts` + `report-card.ts` (D3) · `components/admin/scorm-player.tsx` + `api/scorm/runtime/route.ts` (D4) · `lib/reports/revenue-target.ts` (soi chỉ khác import hay khác công thức) · `portal/bai-thi/actions.ts` (nộp-trễ: main GẮN CỜ vs FixLMS clamp `submittedAt` về deadline) · 5 file `tin-nhan` (D6).

---

## 5. Reference TREO phải DỌN (nếu theo MAIN — nếu mang vào sẽ vỡ build)

Các file **chỉ-có-ở-FixLMS** trỏ tới impl bị bỏ:
- Messaging: `lib/comms/messaging.ts` · `admin/tin-nhan/[id]/page.tsx` · `admin/tin-nhan/actions.ts` (bản FixLMS) · `portal/tin-nhan/[id]/page.tsx` → **bỏ**. ✅ Đảm bảo MANG `admin/tin-nhan/_actions.ts` (chỉ có ở main, chứa `sendStaffMessage`).
- Revenue/report LMS: `lib/reports/lms-extra.ts` · `lms-extra-queries.ts` · `lms-extra.test.ts` · `admin/bao-cao/lms/page.tsx` (phụ thuộc `db.revenueTarget.amount`) → bỏ, hoặc đổi `amount`→`targetAmount` nếu muốn giữ.
- SCORM: `lib/scorm/ticket.ts` (`verifyScormTicket`) → bỏ (main dùng `lib/scorm/access` + `lib/flags`).
- Bảo lưu: `lib/students/reserve-expiry.ts` → bỏ nếu cron theo main.

---

## 6. Thứ tự thực hiện đề xuất

1. **User chốt:** Quyết định 0 + 6 cụm (đặc biệt D2/D3/D5 cần quyết; D1/D4/D6 chỉ xác nhận).
2. Tạo **integration branch** từ `origin/main` (không resolve trực tiếp trên FixLMS), `git merge origin/FixLMS`.
3. Resolve **theo cụm** (D1→D6) trước, rồi file lẻ tự khớp theo import.
4. **Schema + migration** theo §3.4 (1 migration reconcile mới).
5. Dọn reference treo §5.
6. `pnpm typecheck && lint && build` (bắt import treo) + `pnpm test` (refund/report-card/schedule).
7. **Verify cách ly cơ sở vẫn còn** sau khi lấy guard main (chạy `i3-*.spec.ts`) — đảm bảo không mất isolation phiên này + 8 file NEEDS-HUMAN.
8. Cập nhật PR #22.

---

## 7. Tóm tắt cần user quyết

| Mục | Khuyến nghị | Bắt buộc quyết |
|---|---|---|
| **QĐ 0** — chiến lược (A merge đầy đủ / B cherry-pick / C giữ FixLMS) | **A** (cân nhắc B) | ✅ |
| **D1** Refund | THEO MAIN | xác nhận |
| **D2** Schedule-conflict + dạy-thay persist | chọn module + giữ persist? | ✅ |
| **D3** Report-card skill snapshot (string vs numeric, ảnh hưởng data đã lưu) | — | ✅ |
| **D4** SCORM | THEO MAIN (FixLMS vi phạm scope) | xác nhận |
| **D5** Billing portal (verify R7-04 phủ G.6) | lean MAIN | ✅ |
| **D6** Messaging | THEO MAIN | xác nhận |

> Ngoài ra còn 2 quyết định role-model treo từ NEEDS-HUMAN (không liên quan merge): **inventory** (kho dùng-chung hay per-cơ-sở) + **HR cham-cong** (HO-global hay gắn cơ-sở).
