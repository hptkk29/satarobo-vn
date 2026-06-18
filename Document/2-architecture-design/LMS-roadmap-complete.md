# LMS — Lộ trình hoàn chỉnh (Master Roadmap)

> **Mục tiêu:** đưa dự án từ hiện trạng (LMS ~65–70%, nền yếu) → **LMS hoàn chỉnh**, theo đường đi **tối ưu** (nền trước, không sửa 2 lần) và **trung thực** (nêu rõ chặn, quyết định, rủi ro).
> Hợp nhất 3 backlog đã có thành 1 critical path: [ERD-fix-plan](./ERD-fix-plan.md) · [LMS-problems-fix-plan](./LMS-problems-fix-plan.md) · [LMS-usecase-catalog](./LMS-usecase-catalog.md). Snapshot 2026-06-18.

---

## 0. Sự thật nền (đọc trước)

1. **Dự án là CRM-first, LMS bolted-on.** Nhiều tính năng LMS có nhưng nền (auth-scope, ERD, compliance) chưa theo kịp → "tính năng đã có" đang **rủi ro** vì nền yếu.
2. **Blocker gốc:** ERD chưa chốt + **migration R7 chưa apply**. Phần lớn fix LMS cần đổi schema → **phải đi sau ERD**, nếu không = làm lại.
3. **Vá ≠ hoàn chỉnh.** Chạy thẳng LMS-fix-plan từng mục là vá ngọn. Tối ưu = **sửa gốc theo tầng**: nền → an toàn → domain → flow → analytics → compliance → rollout.
4. **Auth holes là rủi ro sống** nếu đã có user thật → cần quyết định hotfix-ngay vs sửa-gốc-RBAC-v2 (Gate G0).

> **Nguyên tắc xuyên suốt:** mỗi phase có **decision-gate** + **deliverable đo được** + **test**. Không vượt phase khi gate chưa pass. Feature flag để rollout dần.

---

## 0b. Hiện trạng nền (ground-truth từ code, không phải doc)

> Đọc trực tiếp code branch `FixLMS` (2026-06-18) — làm P1/P2 **nhẹ hơn dự kiến** vì nền đã dựng sẵn một phần.

| Thành phần nền | Hiện trạng thật | Hệ quả cho plan |
|---|---|---|
| **RBAC v2** | `lib/auth/can.ts` **đã có** `can(actor, action, target?)` + flag `RBAC_V2_ENABLED`; bản cũ `permissions.ts:can()` vẫn song song | P1 = **bật + nối + mở rộng target**, KHÔNG xây mới |
| **scopedDb** | `lib/db-scope.ts` + `SCOPED_MODELS` đã có; **thiếu** `ClassSession/Attendance/Enrollment` (chưa có centerId) | P1/LMS-18 = **thêm model vào scope** (cần FK/centerId từ ERD) |
| **Feature flags** | Hệ flag đầy đủ (`RBAC_V2/SESSION_LIFECYCLE_V2/CONVERT_V2/EVAL_V2/SCORM`) | Rollout dần sẵn sàng |
| **ERD fixes** | Mới ở dạng **tài liệu** (ERD-fix-plan), **chưa implement**; migration R7 chưa apply | P1 vẫn là khối lớn (schema + apply) |

**Điều chỉnh effort:** P1 từ *L → M-L* (RBAC v2 đỡ phần lớn), P2 từ *M → S-M* (4 lỗ hổng auth **tự giải khi bật RBAC v2 + truyền target**, chỉ còn nối dây). Phần nặng còn lại của P1 là **ERD/schema + apply migration** (nút bấm của bạn).

---

## 1. Định nghĩa "LMS hoàn chỉnh" (acceptance theo 13 miền)

Coi là DONE khi mỗi miền đạt tiêu chí:

| # | Miền | Tiêu chí hoàn chỉnh | Hiện trạng |
|---|---|---|---|
| 1 | Identity · RBAC · scoping | RBAC v2 động; mọi read nghiệp vụ auto-scope cơ sở; 0 action role-only | ⚠️ |
| 2 | Curriculum · content · SCORM | Versioning + LCR review UI + SCORM **ghi điểm/hoàn thành** | ⚠️ |
| 3 | Class · scheduling | Conflict GV/phòng **chặn ở write**; calendar; substitute thật | ⚠️ |
| 4 | Enrollment lifecycle | enroll→transfer→pause→withdraw→complete→**refund**→renewal đủ + state-guard | ⚠️ |
| 5 | Teaching · attendance · makeup | Scoped owner; makeup liên cơ sở; lateness | ⚠️ |
| 6 | Assessment · grading | **Retake**; grading queue; rubric; essay UI; timer enforced | ⚠️ |
| 7 | Progress · report card · cert | Học bạ gộp **đủ** (điểm danh+thi+bài tập+kỹ năng); cert; analytics | ⚠️ |
| 8 | Finance | order/payment/debt/**refund** + BigInt/Decimal đúng | ⚠️ |
| 9 | Communication | broadcast + **2-way PH↔GV** | ⚠️ |
| 10 | Portal | self-service đầy đủ (đã tốt) | ✅ |
| 11 | Operations · multi-center | staff ops + **isolation enforced** | ⚠️ |
| 12 | Compliance · lifecycle | consent + **retention + erasure (NĐ13)** + backup/PITR | ❌ |
| 13 | Non-functional | scale (partition/index/cache) + observability + e2e đủ | ⚠️ |

---

## 2. Critical path — 8 phase (thứ tự tối ưu)

> Mũi tên = phụ thuộc. **Không** chạy song song xuyên phase nền.

```
G0 quyết định ─► P1 NỀN ─► P2 AN TOÀN ─► P3 LIFECYCLE/TIỀN ─► P4 ASSESSMENT
                  │                                              │
                  └────────────► (P5 FLOW/COMMS) ◄──────────────┘
                                        │
                                  P6 ANALYTICS ─► P7 COMPLIANCE/SCALE ─► P8 ROLLOUT
```

### G0 — Decision gate (KHÔNG code, chốt trước)
Chốt 6 quyết định ở §3. Đặc biệt: **go-live status** (có user thật chưa) + **RBAC: hotfix vs v2** + **phạm vi: core (1–10) hay full (1–13)**.
**Ra khỏi gate khi:** 6 quyết định có câu trả lời.

### P1 — NỀN (blocker, mở khóa tất cả) — *Effort M-L* (↓ nhờ RBAC v2 có sẵn)
| Việc | Nguồn | Ghi chú ground-truth |
|---|---|---|
| Chốt ERD + **apply migration R7** | ERD-fix-plan P0/P1 | **Khối nặng nhất**; apply Supabase = nút bấm của bạn |
| RLS + timestamptz + onDelete tài chính + soft-delete | C1/C2/C3 | mới (doc → code) |
| Money type đúng (BigInt/Decimal + serialization) | H5/H6/COL2 | mới |
| **Bật + nối RBAC v2** (`can(actor,action,target)`) | RBAC_V2 | **đã có `can.ts`** → enable + truyền target, không xây mới |
| **Auto-scope** `ClassSession/Attendance/Enrollment` | LMS-18 | thêm vào `SCOPED_MODELS` (cần centerId/FK từ ERD) |
**Deliverable:** schema final trên Supabase; mọi read nghiệp vụ scoped tự động; tiền đúng kiểu; RBAC v2 ON.
**Vì sao trước:** mọi fix sau cần schema ổn + scope nền. Làm sau = sửa 2 lần.

### P2 — AN TOÀN & TOÀN VẸN (phần lớn auto-giải nhờ P1) — *Effort S-M* (↓ nhờ RBAC v2 có sẵn)
| Việc | Nguồn |
|---|---|
| 4 lỗ hổng phân quyền (điểm danh/chấm/completeSession/question) — **tự giải khi bật RBAC v2 + truyền target ở P1**, chỉ còn nối dây từng action | LMS-1..4 |
| Exam timer enforced lúc submit | LMS-5 |
| Conflict GV/phòng nối write-path + `ClassSession.roomId` | LMS-6 |
| State machine guard Enrollment/Session + TOCTOU | LMS-7 / ERD-C4 |
**Deliverable:** không thao tác chéo lớp/cơ sở; không lách giờ thi; không trùng lịch; không nhảy trạng thái phi lý.

### P3 — LIFECYCLE & TIỀN (cần schema P1 + policy G0) — *Effort L*
| Việc | Nguồn |
|---|---|
| **Hoàn tiền** theo lifecycle (RefundRequest + prorate) | LMS-9 |
| **Hủy cả lớp** cascade (transfer/refund/notify) | LMS-10 |
| **Reserve auto-expiry** cron | LMS-11 |
| Transfer khác mức phí (top-up/refund) | catalog M5 |
**Deliverable:** mọi đường "thoát" (rút/chuyển/hủy) xử lý tiền + thông báo đúng.

### P4 — ASSESSMENT & CONTENT — *Effort M*
| Việc | Nguồn |
|---|---|
| **Thi lại** (`@@unique(examId,studentId,attemptNo)` + maxAttempts) | LMS-12 |
| Học bạ gộp **đủ** (bài tập + kỹ năng) | LMS-13 |
| **SCORM scoring** (runtime API + ScormAttempt) | LMS-14 |
| Skill assessment **gắn buổi** + mở UI GV | LMS-17 |
| Grading queue + UI chấm essay/code | LMS-2 (UI) |
**Deliverable:** đánh giá-chấm-học bạ đầy đủ vòng đời.

### P5 — FLOW · UX · COMMS (song song được với P3/P4 sau P2) — *Effort M*
| Việc | Nguồn |
|---|---|
| **Substitute teacher** model thật + duyệt + notify | LMS-11(catalog T11) |
| **2-way PH↔GV** (Comment/thread + `comment.added`) | LMS-15 |
| Calendar view (admin + portal) | catalog P2/M |
**Deliverable:** vận hành lớp + giao tiếp 2 chiều mượt.

### P6 — ANALYTICS & REPORTING — *Effort M*
| Việc | Nguồn |
|---|---|
| Report thiếu chiều: hiệu-suất-GV, cohort, doanh-thu-vs-mục-tiêu, churn | LMS-16 |
| KPI/Target config | LMS-16 |
**Deliverable:** lãnh đạo có đủ chiều ra quyết định.

### P7 — COMPLIANCE · LIFECYCLE · SCALE — *Effort L*
| Việc | Nguồn |
|---|---|
| Retention + **erasure/portability (NĐ13)** | ERD-C6 |
| Backup/PITR + test restore | ERD-C7 |
| Partition/index `Attendance` + cache dashboard | ERD-H1/H2/H3 |
| Hợp nhất AuditLog + observability | ERD-H10/M6 |
**Deliverable:** đúng luật dữ liệu trẻ em; chịu tải; quan sát được.

### P8 — QA & ROLLOUT — *Effort M*
- E2E từng flow (catalog use-case làm checklist nghiệm thu).
- Flip feature flag dần: **shadow → canary 1 cơ sở → on toàn hệ**.
- Data migration + monitoring + runbook.
**Deliverable:** go-live an toàn, có đường lùi.

---

## 3. Quyết định cần chốt ở G0 (nếu thiếu → code sai)

| # | Quyết định | Vì sao chặn |
|---|---|---|
| 1 | **Go-live status** — đã có user thật chưa? | Quyết định auth hotfix-ngay hay sửa-gốc-P1 |
| 2 | **RBAC**: hotfix tạm L0 + v2 sau, hay v2 luôn ở P1 | Tránh vá rồi làm lại |
| 3 | **Chính sách hoàn tiền** (prorate theo buổi/%?) | P3 không code được nếu thiếu |
| 4 | **Chính sách thi lại** (mấy lần, lấy điểm nào) | P4 |
| 5 | **Học bạ** gộp gì (bài tập? kỹ năng?) | P4 |
| 6 | **Phạm vi**: Core (miền 1–10) trước, hay Full (1–13) | Quyết định có làm P7 ngay không |

---

## 4. Hai mốc thực tế (tối ưu giá trị)

**🟢 Mốc A — "Safe-to-operate" (tối thiểu vận hành an toàn):** G0 + P1 + P2.
→ Schema ổn, scope chặt, không lỗ hổng, không lách. **Đây là mốc bắt buộc trước khi nhận user thật quy mô.**

**🔵 Mốc B — "Feature-complete":** + P3 + P4 + P5.
→ Đủ vòng đời tiền + đánh giá + giao tiếp. **Đây là "LMS hoàn chỉnh" theo nghĩa nghiệp vụ.**

**⚫ Mốc C — "Production-grade":** + P6 + P7 + P8.
→ Analytics + tuân thủ NĐ13 + chịu tải + rollout. **Hoàn chỉnh theo nghĩa vận hành thật.**

> Khuyến nghị: **không bỏ qua Mốc A**. P7 (compliance) có thể song song muộn **nhưng không được bỏ** vì dữ liệu trẻ em.

---

## 5. Rủi ro & nguyên tắc thực thi

- **Rủi ro lớn nhất = làm sai thứ tự.** Nếu code P3/P4 trước khi P1 xong → đụng schema → làm lại. Giữ nền-trước.
- **Auth holes:** nếu Gate G0 trả lời "đã có user thật" → **hotfix scope ngay** (song song P1) vì là rủi ro sống, đừng chờ RBAC v2.
- **2-phase additive:** thêm cột/bảng/relation trước, backfill, đọc qua helper, drop sau khi ổn — không big-bang.
- **Mỗi phase = nhiều PR nhỏ + test**, không gộp. Verify chuẩn repo: `pnpm typecheck && lint && build` + e2e xanh.
- **Feature flag mọi tính năng mới** (đã có hệ flag) → bật dần, có đường lùi.
- **Catalog use-case = checklist nghiệm thu** cho P8 (mỗi UC exists/partial/missing → phải thành ✅).

---

## 6. Tóm tắt 1 dòng

> **Chốt G0 → P1 nền (ERD+RBAC) → P2 an toàn → đạt Mốc A → P3/P4/P5 đạt Mốc B (LMS hoàn chỉnh) → P6/P7/P8 đạt Mốc C (production).** Tối ưu vì nền-trước tránh sửa 2 lần; trung thực vì có gate + rủi ro + 2 mốc rõ ràng.
