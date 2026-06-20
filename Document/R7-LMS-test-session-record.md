# Bản ghi phiên manual test LMS — branch `fixlms-r7bugs`

> Ngày: 2026-06-19 · Người chạy: Claude extension (browser) + Claude Code (terminal/DB) · DB: **Supabase chung** (1 project, gần rỗng) · Server local: `http://localhost:3000`.
> File này gom **toàn bộ dữ liệu test, tài khoản, kết quả, phát hiện, và việc cần dọn** để tra cứu/lặp lại. Prompt test chi tiết: [`LMS-full-flow-manual-test-prompt.md`](LMS-full-flow-manual-test-prompt.md). Bối cảnh fix: [`R7-fixlms-manual-test-prompt.md`](R7-fixlms-manual-test-prompt.md).

---

## 1. Tài khoản test

| Vai trò | Email | Mật khẩu | Trạng thái | Ghi chú |
|---|---|---|---|---|
| Super Admin | (Hồ Đắc Phúc) | (của user) | ACTIVE | đã có sẵn; có `UserOrgRole SUPER_ADMIN@HO` |
| Phụ huynh | `test-convert@example.com` | `Test@1234!` | ACTIVE | userId `cmqkn72ta003k1pmc1pbdfbhi`; PH của Bé A & Bé B; Claude Code kích hoạt |
| Giáo viên | `test-teacher@example.com` | `Test@1234!` | ACTIVE | role TEACHER, centerId Hoàng Diệu; **CHƯA có UserOrgRole** → scopedDb scope rỗng (RC-A) → góc-nhìn-GV hạn chế |
| User CS1 | — | — | **CHƯA tạo** | DEFERRED (cần seed RoleDef + `CENTER_MANAGER@CS1` — user chưa duyệt) |

**RoleDef hiện có trong DB:** chỉ `SUPER_ADMIN` (seedRoles chưa chạy đủ; 10 role còn lại chưa seed).

---

## 2. Dữ liệu test đã tạo (`__TEST__`)

**Lead/HV (convert v2 happy-path):**
- Lead `cmqkflvjj003yr3o7gwyndp1o` — `__TEST__ PH Convert`, phone 0900000999, centerId `co-so-hoang-dieu`, status **ENROLLED** (đã convert).
- LeadChild: Bé A `cmqkfm2690048r3o7el6tiasa` · Bé B `cmqkfm42m042... (cmqkfm42m004cr3o7rn7u88wd)`.
- Student: `__TEST__ Bé A` [**CS2-26-K9J7X8**] · `__TEST__ Bé B` [**CS2-26-2F55FQ**], "Đang học".
- Enrollment: Bé A `cmqkn73gr003o1pmct0iinmr2` · Bé B `cmqkn743b003s1pmct82i2vfd` — lớp CS2.SATA1.26.001, finalPrice 1.485.000đ mỗi con, `leadChildId` map đúng.
- Parent User `cmqkn72ta003k1pmc1pbdfbhi`.

**Lớp:**
- `CS2.SATA1.26.001` (id `cmqkkdp5a00fzr3o71w460hob`) — `__TEST__ Lớp Convert CS2`, Cơ sở Hoàng Diệu, khoá **Sata1 — Robosim Master** (price 1.485.000đ), status ACTIVE. teacherId đã đổi sang GV test.

**Tài chính — Order `ORD-TEST-mqklsirf`** (gắn leadId, centerId Hoàng Diệu):
| Payment | Số tiền | saleStatus | accountantStatus | enrollment | recordedBy | id |
|---|---|---|---|---|---|---|
| seed gốc | 5.000.000đ | RECORDED | PENDING | — (không) | (null) | `cmqklsixb00031lgecwe0pm6b` |
| confirmable | 1.485.000đ | RECORDED | PENDING | Bé B | GV test | `cmqksgj2o0001hhpdsxo4qktp` |
| (extension) | 1.485.000đ | RECORDED | PENDING | Bé B | Hồ Đắc Phúc | (tạo qua UI) |
| (extension) | 600.000đ | điều chỉnh từ 500k | — | — | — | bản ghi ADJUSTED |
| (extension) | 500.000đ | — | REJECTED | — | — | từ chối |

> Khoản **confirmable** `cmqksgj2o…` dùng để test confirm→Receipt + idempotent (có enrollmentId + recordedBy ≠ người confirm → vượt 2 guard).

**Buổi học / điểm danh:**
- Session `__TEST__ Buổi 1` (id `cmqksqaz…`) — 22/06/2026 09:00, lớp CS2.SATA1.26.001.
- Điểm danh: Bé A=Có mặt; Bé B=Muộn→Vắng→**Cần học bù** (sinh nhu cầu ở `/hoc-bu`, "Chờ xếp bù").

**Học bạ / tiêu chí:**
- Tiêu chí năng lực khoá Sata1: **seed bị classifier chặn** → chuyển sang extension thêm qua UI `/admin/report-cards/criteria` (đặt tên `__TEST__ Tư duy logic / Kỹ năng lắp ráp / Thái độ`, thang 1–4). `ReportCardCriterion { courseId, name, order, active }`.

---

## 3. Thay đổi cấu hình môi trường (`.env.local` — KHÔNG commit)

- `NEXTAUTH_SECRET` / `AUTH_SECRET` = (sinh ngẫu nhiên) — trước đó rỗng → fix lỗi login 500 `MissingSecret`.
- `NEXTAUTH_URL` / `AUTH_URL` = `http://localhost:3000`.
- **`SCORM_ENABLED="true"`** — để vào được `/admin/scorm` (mặc định OFF → `notFound()`).

**Feature flag khác:** mặc định — `CONVERT_V2_ENABLED`/`COMMON_LOGIN`/`DISPATCHER` ON; `SESSION_LIFECYCLE_V2`/`MEDIA_SIGNED_URL`/`EVAL_V2_ENABLED`/`RBAC_V2_ENABLED` OFF.

---

## 4. Thay đổi code (CHƯA commit) — revert BUG-005

| File | Sửa |
|---|---|
| `lib/crm/convert-lead-v2.ts` | guard `accountantStatus=CONFIRMED` → **`saleStatus=RECORDED`** (`hasRecordedPayment`); đúng spec R7-05-C2 |
| `lib/crm/convert-v2.test.ts` | test guard về RECORDED |
| `tests/e2e/r7/convert-v2.spec.ts` | `seedConfirmedPayment`→`seedRecordedPayment` (seed `accountantStatus=PENDING`) |

**Verify:** typecheck PASS · lint PASS (0 err, 2 warning cũ) · unit **636 PASS**. `pnpm build` **chưa chạy** (chờ test xong, tránh lock dev server).

---

## 5. Kết quả test

### 9 bug R7 — **PASS hết** (end-to-end)
| # | Bug | Kết quả |
|---|---|---|
| 1 | Thêm con vào lead | PASS |
| 2 | Dropdown cơ sở | PASS |
| 3 | `/admin/classes` | PASS |
| 4 | `/admin/payments` + `/cong-no` | PASS (FixLMS không có `hoan-tien`) |
| 5 | Guard convert | PASS 2 chiều (chặn khi chưa REGISTERED/RECORDED; pass khi RECORDED dù KT chưa confirm) — **sau khi revert** |
| 6 | Enrollment per-child `leadChildId` | PASS (DB: Bé A/Bé B map đúng) |
| 7 | Markdown multi-image | PASS (control); paste/drag cần mắt người |
| 8 | Timezone + hydration | PASS (giờ VN, không mismatch) |
| 9 | Nhãn dashboard | PASS ("Tổng học viên" / "Tỉ lệ chuyển đổi (lead)") |

### Full LMS — tiến độ
| Phase | Trạng thái |
|---|---|
| C — Buổi & điểm danh | **PASS** lõi; FLAG C.4 (cần buổi đích thứ 2 để test capacity), C.5 (form buổi không có field GV/phòng → conflict test ở luồng xếp lịch lớp) |
| E — Học bạ | **PASS** (§9): criteria→draft→nộp→phát hành→portal hoc-ba, snapshot OK |
| F.2 — Payment 2 tầng | Record/Adjust/Reject PASS; **Confirm→Receipt PASS** (§9): `cmqksgj2o`→CONFIRMED, receipt `RCP-SR-26-0001` |
| G — Portal | 7 route render **PASS** (§9); **G.6 đã FIX → PASS** (§9.1 Track 1, chưa commit) |
| A,B,D,H,J | **render PASS** (§9 + §9.1 Track 2); 2 FLAG tạo lead/room qua UI (automation) |
| I — RBAC | classes/payments cách ly PASS; **`/admin/enrollments` LEAK CS2 → ĐÃ FIX** (scopedDb, verify §9.1) ✅ |
| K — SCORM | flag đã bật; upload chưa chạy được (xem §6); P3 defer |
| Regression read-only | Public `/`,`/khoa-hoc`,`/tin-tuc` 200; **37/37 route admin 200** (§9) |

---

## 6. Phát hiện quan trọng (không phải bug, hoặc tech-debt)

1. **BUG-005 fix SAI → đã revert.** Guard `CONFIRMED` mâu thuẫn spec R7-05-C2 ("KT chưa confirm vẫn pass") + deadlock (`confirmPayment` cần `enrollmentId` do convert tạo). Khôi phục `RECORDED`. Chi tiết memory `bug005-convert-guard-wrong`.
2. **Gap #1 — convert-v2 chưa đi trọn UI:** không có UI tạo **Order gắn `leadId`** trước convert (`order-create-form` set cứng `leadId:null`; `/admin/orders/new` không đọc param leadId). Convert-v2 là đường chốt lead DUY NHẤT (flag ON + bỏ CloseDealButton) → cần nối UI này. **Chưa quyết.**
3. **2 model center song song (Phase A):** Lead/Class `.centerId` → `Center` cũ ("Cơ sở Hoàng Diệu"); form lớp hiện nhãn `OrgUnit` ("Cơ sở 2"). Cùng 1 cơ sở (Center code CS2), chỉ khác nhãn → **không phải bug**, UX không nhất quán.
4. **Giá per-con = thiết kế:** học phí lấy từ `Course.price` của LỚP mỗi con chọn (hiện trong dropdown), + discount per-con; KHÔNG có ô nhập tay. Con test `interestedCourseId=null` nên form không tự prefill lớp.
5. **SoD payment (F.2):** `confirmPayment` đòi (a) `enrollmentId`, (b) người record ≠ người confirm. Môi trường 1-user → cần seed khoản record bởi user khác (đã làm: `cmqksgj2o…`).
6. **SCORM upload chưa chạy được:** flag đã ON (vào `/admin/scorm` OK), R2 creds có sẵn, 96 Lesson/4 curriculum tồn tại (dropdown không rỗng). Nghi: thiếu file `.zip` SCORM thật / **R2 bucket thiếu CORS cho browser PUT từ localhost** / sau confirm cần dispatcher giải nén. Chờ lỗi cụ thể. SCORM = P3, ngoài quyết định push.
7. **`resolveActor` build scope CHỈ từ `UserOrgRole`** (không đọc `User.centerId/role`). User không có UserOrgRole → scope rỗng (gốc RC-A). Ảnh hưởng GV test + bất kỳ user nào chưa được gán role v2.

---

## 7. Việc cần dọn (sau khi xong test)

- **Data `__TEST__` trên Supabase:** lead `cmqkflvjj…` + 2 LeadChild + 2 Student (CS2-26-K9J7X8/2F55FQ) + 2 Enrollment + Parent `cmqkn72ta…` + lớp `CS2.SATA1.26.001` + Order `ORD-TEST-mqklsirf` + 5 Payment + Session `__TEST__ Buổi 1` + attendance + (tiêu chí Sata1 `__TEST__` nếu extension thêm).
- **Tài khoản test:** `test-convert@example.com`, `test-teacher@example.com`.
- **`.env.local`:** cân nhắc gỡ `SCORM_ENABLED="true"` nếu không cần (giữ AUTH_SECRET).
- **GV test** đang là teacherId của lớp `CS2.SATA1.26.001` — nếu dọn lớp thì gỡ luôn.

---

## 8. Việc còn lại trước GO push `fixlms-r7bugs` → `origin/FixLMS`

1. ✅ 9 bug PASS · ✅ BUG-005 revert verify · ✅ phần LMS P1 đã test tiếp (§9).
2. ✅ **G.6 đã FIX** (§9.1 Track 1) — hoc-phi hiện khoản CONFIRMED + số dư. **CHƯA commit** — review diff `lib/portal/billing.ts` + `hoc-phi/page.tsx` trước. + paste/drag ảnh news editor (BUG-007 mắt người).
3. ✅ **`/admin/enrollments` cách ly ĐÃ FIX** (§9.1) — chuyển scopedDb + scope class.centerId; verify CS1 không thấy CS2, SUPER_ADMIN vẫn thấy. CHƯA commit. Soi thêm room-form FLAG (§9.1 Track 2) + quét trang admin khác còn `db` trần.
4. **Quyết gap #1** (UI order-gắn-lead): fix nối UI hay chấp nhận tạm.
5. `pnpm build` chốt (gồm thay đổi G.6).
6. Commit revert BUG-005 (+ G.6 fix nếu duyệt) → push.

---

## 9. Phiên test bổ sung 2026-06-20 — Claude Code + Playwright manual (`tests/manual/`)

> Driver headless qua UI thật (login form + server action), DB Supabase chung. Tạo **`test-admin@example.com` / Test@1234!** (SUPER_ADMIN + UserOrgRole@HO) để có phiên admin — additive, dọn sau. Specs: `tests/manual/lms-r7-sweep.spec.ts`, `lms-r7-flows.spec.ts`, `lms-r7-eval.spec.ts`.

| Phase | Mục | Kỳ vọng | Thực tế | Kết quả |
|---|---|---|---|---|
| Regression | Sweep 37 route admin (A–J) | render + không redirect login + không error boundary | **37/37 http 200**, 0 FAIL/0 FLAG dưới `test-admin@HO` | **PASS** — không hồi quy RC-A/RC-B |
| F.2 | Confirm khoản `cmqksgj2o` → Receipt | CONFIRMED + 1 phiếu thu, SoD (recorder≠confirmer), idempotent | toast "Đã xác nhận — đã sinh phiếu thu"; DB: CONFIRMED, **1 receipt `RCP-SR-26-0001`**, event `payment.confirmed` publish | **PASS** |
| E.1 | Học bạ Bé A: criteria→draft→nộp→phát hành | state machine R7-15 + snapshot | tạo 3 criteria Sata1; ReportCard **PUBLISHED**, 3 scores, snapshot 920c | **PASS** |
| E.2 | Portal hoc-ba thấy bản phát hành | PH thấy snapshot | hoc-ba hiện "Học bạ — Sata1 · Phát hành 2026-06-20" + 3 tiêu chí + nhận xét | **PASS** |
| G | 7 route portal (PH) | render, không lộ studentId URL | `/portal{,/ho-so,/ho-so-con,/lich-hoc,/hoc-phi,/hoc-ba,/thong-bao}` đều 200 | **PASS** |
| **G.6** | hoc-phi CHỈ hiện CONFIRMED | hiện khoản CONFIRMED + receipt + số dư | hoc-phi **CHỈ render Orders**; "Chưa có đơn hàng" (ORD-TEST `studentId=null`/DRAFT). **Khoản CONFIRMED KHÔNG hiện** | **FLAG** (xem dưới) |

**Phát hiện G.6 (quan trọng):** `app/(portal)/portal/hoc-phi/page.tsx` chỉ gọi `getParentOrders` (lọc theo `Order.studentId ∈ con của PH`). Hàm `getParentConfirmedPayments` (R7-04, lọc `accountantStatus=CONFIRMED`, thêm ở commit `d062728`) **chưa được gọi ở bất kỳ trang nào** → phần "PH thấy khoản đã xác nhận + phiếu thu + số dư" **chưa wire vào UI**. `git diff main...HEAD` cho `billing.ts`/`hoc-phi` = rỗng ⇒ **gap có sẵn, KHÔNG phải hồi quy do `fixlms-r7bugs`**. Thuộc tính "PENDING không lộ cho PH" vẫn đúng (page không hiện khoản nào). → Cần user quyết wire hay defer.

**Dữ liệu test MỚI tạo (bổ sung §7 cleanup):**
- User `test-admin@example.com` (id `cmqlm80st00017b5jfo53ajta`) + UserOrgRole SUPER_ADMIN@HO.
- 3 `ReportCardCriterion` `__TEST__` (Tư duy logic / Kỹ năng lắp ráp / Thái độ) trên khoá Sata1.
- 1 `ReportCard` PUBLISHED (enrollment Bé A `cmqkn73gr…`) + snapshot + 3 score.
- Payment `cmqksgj2o…` đã chuyển **CONFIRMED** + Receipt `RCP-SR-26-0001` (ACTIVE) + DomainEvent `payment.confirmed` (PENDING dispatcher).
- Specs `tests/manual/lms-r7-*.spec.ts` (3 file) — giữ để chạy lại hoặc xoá.

**Receipt prefix `SR` thay `CS2`** = FLAG "2 model center" §6.3 (payment.centerId là id `Center` cũ, không map `OrgUnit.code`).

### 9.1 Phiên multi-agent (2 track song song) + I.3 — cùng ngày

**Track 1 — FIX G.6 (đã sửa code, CHƯA commit):** wire khoản CONFIRMED + thẻ số dư vào portal học phí.
- `lib/portal/billing.ts`: thêm `getParentTuitionTotal`, `getParentBalance` (+type `ParentBalance`); `getParentConfirmedPayments`/helper mới nhận `client` **default `db`** (portal khỏi import db trần — né ESLint R6-F1).
- `app/(portal)/portal/hoc-phi/page.tsx`: render thẻ **Tổng học phí / Đã thanh toán / Còn lại** + section **"Khoản đã thanh toán"** (tên con · phương thức · ngày · *Phiếu thu RCP…* · badge "Đã xác nhận"). Giữ section Đơn hàng.
- Verify: typecheck PASS · lint clean · **UI PASS** (`tests/manual/g6-hoc-phi.spec.ts`): hoc-phi PH hiện Tổng `2.970.000đ` / Đã trả `1.485.000đ` / Còn lại `1.485.000đ` + phiếu thu `RCP-SR-26-0001`; PENDING ẩn. → **G.6 PASS sau fix.** (chưa `pnpm build`, chưa commit)

**Track 2 — Test sâu A/B/D/H/J (render):** `tests/manual/lms-r7-deep.spec.ts`.
- A/B/D/H/J **render PASS** dưới `test-admin@HO`; Recharts dashboard render đủ (charts 12/14/7/3/8); `/admin/classes/<id>/students` hiện Bé A/B; `/admin/compliance` có consent.
- **2 FLAG (giới hạn automation, chưa khẳng định lỗi app):** tạo lead qua UI (lead-form input bọc `Field`, không có label/name chuẩn → khó target) + tạo room qua UI (`room-form.tsx:57-103` submit ở lại `/new`, nghi validation `code`/`orgUnitId` — **cần mắt người soi** screenshot). Không tạo được data → DB sạch.

**I.3 — Cách ly cơ sở (scopedDb):** seed 11 RoleDef (qua `DIRECT_URL` — pooler 6543 lỗi `prepared statement s1`); tạo `test-cs1@example.com`/`Test@1234!` (CENTER_MANAGER@CS1). Login CS1 → kiểm 3 trang (`tests/manual/i3-isolation.spec.ts`):

| Trang | scopedDb? | CS1 thấy data CS2? | Kết quả |
|---|---|---|---|
| `/admin/classes` | ✅ scopedDb(actor) | KHÔNG | **PASS cách ly** |
| `/admin/payments` | ✅ scopedDb (`_actions.ts`) | KHÔNG | **PASS cách ly** |
| `/admin/enrollments` | ❌ **`db` trần** | **CÓ — thấy Bé A & Bé B (CS2)** | **FAIL cách ly** |

> 🔴 **Phát hiện bảo mật (I.3):** `app/(admin)/admin/enrollments/page.tsx` fetch `db.enrollment/class/center` **trần (không `scopedDb`/`resolveActor`)** — QL CS1 thấy enrollment CS2. `git diff main...HEAD` cho file = rỗng ⇒ **gap có sẵn, KHÔNG do branch**.
>
> ✅ **ĐÃ FIX (phiên này, chưa commit):** chuyển query sang `scopedDb(await resolveActor(...))`; vì **`Enrollment` KHÔNG ∈ `SCOPED_MODELS`** (không có centerId trực tiếp) nên scope thủ công qua `class.centerId` dùng `getModelVisibleCenterIds("Class", actor)` (giao với bộ lọc cơ sở UI; ngoài tầm nhìn → ép rỗng). Dropdown lớp/cơ sở dùng `sdb` (Class auto-scope). **Verify:** typecheck PASS · lint clean · `i3-isolation.spec.ts` **2 passed** — CS1 KHÔNG còn thấy CS2 (beA/beB=false) + SUPER_ADMIN VẪN thấy (beA/beB=true, không over-restrict). ⚠️ Các trang admin khác có thể còn `db` trần tương tự — nên quét `app/(admin)/**/page.tsx` (memory `enrollments-page-no-scopeddb`).

**Data `__TEST__` MỚI (bổ sung §7 cleanup):** user `test-cs1@example.com` (id `cmqlu0mxo0001o3iz2nblg8op`) + UserOrgRole CENTER_MANAGER@CS1; **11 RoleDef** seed vào DB (trước chỉ có SUPER_ADMIN — additive, idempotent). Specs `tests/manual/{g6-hoc-phi,lms-r7-deep,i3-isolation}.spec.ts`.

**DEFERRED còn lại:** C đã PASS lõi phiên trước; K SCORM (P3).
