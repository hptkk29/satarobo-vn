# Tổng hợp dự án Sata Robo VN — Phase đã làm / tồn đọng + thời gian

> **Lập ngày:** 2026-06-30 · **Nguồn:** toàn bộ requirements gốc + BA (`Document/0-yeucau/**`), kế hoạch phase (`Document/0-yeucau/3-ke-hoach-trien-khai/**`), blueprint Doc 15, lịch sử git (594 commit, 2026-05-10 → 2026-06-30) và memory dự án.

## 0. Cách đọc thời gian trong tài liệu này

Có **2 thước đo thời gian khác nhau** — đừng lẫn:

| Thước đo | Ý nghĩa | Dùng cho |
|---|---|---|
| **Công sức (doc)** | Ước lượng "người‑tuần" kiểu truyền thống do tài liệu kế hoạch nêu (1 dev) | So sánh khối lượng giữa các phase, ước phần còn lại |
| **Lịch thực tế (git)** | Số ngày lịch thật đã trôi qua (theo commit) | Tiến độ thực, tốc độ thực |

> ⚡ Dự án chạy **1 dev chính + AI‑assisted** → lịch thực tế **nén ~5–6×** so với công sức truyền thống. VD: A0→R5 doc ước ~18,5 tuần‑người nhưng **đóng trong 3 ngày lịch** (06‑08→06‑10).

**Tổng quan thời gian:**
- **Lịch thực tế đã trôi:** 2026‑05‑10 → 2026‑06‑30 = **51 ngày (~7,3 tuần)**, ~35 ngày có commit.
- **Công sức tương đương (doc + ước khối chưa có doc):** ~**40–45 người‑tuần**.

---

## 1. Tóm tắt điều hành

- **Project tổng = 10 khối nghiệp vụ:** Tổ chức/RBAC nền · CRM/Tuyển sinh · SIS (HV/Lớp/Điểm danh/Học bù) · Finance (thanh toán 2 tầng/công nợ/hoàn tiền) · LMS (chương trình/SCORM/bài tập/học bạ/đánh giá) · Portal PH/HV · HR/Chấm công · Marketing/Commission · Báo cáo/Dashboard · Thông báo/SLA. (+ Public site/Blog/Tuyển dụng/SEO đã xong từ đầu.)
- **Đã làm:** toàn bộ **lõi A0→R7 + 18 ticket LMS v3.1** code‑complete, test local xanh; cộng **8 vòng phát sinh** từ test‑day. Hệ thống chạy được trên local/dev.
- **Tồn đọng chính:** (a) **lớp enforcement/ops chưa bật prod** (scopedDb error‑gate, RBAC v2 flip, apply migration Supabase prod, bật SCORM env); (b) **3 quyết định còn treo** (TBD‑2 công thức hoàn tiền, TBD‑3 prod migrate, TBD‑4 quét SCORM); (c) **1 việc đang dở** (vá cộng đôi Payment); (d) **backlog tích hợp ngoài** (Zalo/cổng thanh toán/MISA/PWA…) phụ thuộc bên thứ 3.
- **% hoàn thành (ước):** Tính năng lõi ~**90%** code‑complete · Sẵn sàng go‑live prod ~**70%** (còn deploy/enforcement/quyết định).

---

## 2. PHASE ĐÃ LÀM

### 2.1 Giai đoạn nền (tiền‑Doc15) — xây hệ thống thật trước khi tái cấu trúc

> ⚠️ Phát hiện quan trọng: **phần lớn tính năng "có sẵn" được xây ở đây (05‑10 → 06‑05)** rồi A0→R5 mới tái cấu trúc kiến trúc lên trên. ~35% yêu cầu đã chạy trước khi vào kế hoạch Doc 15.

| Mã | Nội dung | Lịch thực tế | Công sức (ước) | Trạng thái |
|---|---|---|---|---|
| PRE‑1 | Nền tảng (Next/Prisma/Vercel) + **public site** + blog engine + tuyển dụng + legal/SEO/JSON‑LD | 05‑10→05‑11 (~2 ngày) | — | ✅ done |
| PRE‑2 | Redesign client UI (design system, Magic UI) + **port 2 site legacy** (laptrinhrobot/luyenthirobosim → `/khoa-hoc/*`) | 05‑14→05‑17 (~4 ngày) | — | ✅ done |
| PRE‑3 | **Admin CMS CRUD** (HV/lớp/ghi danh/giáo trình/exam/question‑bank/inventory/orders/vouchers/products) + RBAC matrix 70+ action + audit 5‑domain + email Resend + cron | 05‑16→05‑27 (~11 ngày) | — | ✅ done |
| PRE‑4 | **Modules nghiệp vụ:** CRM lead 13 trạng thái (Kanban) + portal PH + LMS GV + chấm công QR/geofence + transfer lớp + Zalo/MISA skeleton + Satacoin ledger + OTP + PDF (chứng nhận/transcript) | 05‑28→06‑05 (~9 ngày) | — | ✅ done |

**Cụm nền:** ~26 ngày lịch · công sức tương đương ~**8–12 người‑tuần** (tài liệu gốc không nêu estimate theo tuần).

### 2.2 Lõi kiến trúc A0 → R5 (Doc 15) — **đóng core 2026‑06‑10**

| Phase | Nội dung | Nguồn | Công sức (doc) | Lịch thực tế | Trạng thái |
|---|---|---|---|---|---|
| **A0** | Nền kiến trúc: OrgUnit tree · RBAC động (RoleDef/RolePermission/UserOrgRole) · ActorResolver + can() v2 · **scopedDb** (cách ly cơ sở) · login chung · AuditLog hợp nhất · DomainEvent outbox · EmployeeOrgAssignment | Doc 15 §2/§4 · A0‑00..08 | **~3 tuần** | 06‑08 (~1 ngày) | ✅ done* |
| **R1** | CRM **Messenger‑first** + webhook + L1→L2→L3 + handover HO→CS + SLA engine + Ads Insights + **commission 4 tầng** + cost allocation | SR.QD.217 · BA #01 · R1‑01..12 | **~5 tuần** | 06‑08→06‑09 (~2 ngày) | ✅ done* |
| **R2** | SIS + Finance core: convert lead→Student+Enrollment (transaction) + invoice + activation + công nợ + email nhắc nợ | Doc 15 R2 | **~2,5 tuần** | 06‑09→06‑10 (~2 ngày) | ✅ done |
| **R3** | LMS offline core: scheduling + attendance (DB source‑of‑truth) + media‑consent + makeup‑service + curriculum isolation | Doc 15 R3 | **~3 tuần** | 06‑09→06‑10 (~2 ngày) | ✅ done |
| **R4** | Portal phụ huynh: ownership (`assertOwnsStudent`) + consent gate + **không lộ studentId** | Doc 15 R4 | **~2 tuần** | 06‑10 (<1 ngày) | ✅ done |
| **R5** | HR: chấm công QR + geofence (chỉ nhân viên) + privacy | Doc 15 R5 | **~1,5 tuần** | 06‑10 (<1 ngày) | ✅ done |

\* A0 và R1 có một số ticket ở mức **partial** (lõi + test local xong, còn nợ UI viewer / e2e browser / enforcement toàn hệ thống — xem §3). Core vẫn đóng được vì phần nợ là *additive*, không chặn.

**Cụm A0→R5:** **~3 ngày lịch** vs **~18,5 người‑tuần** doc · Vitest 308 ✓ tại mốc đóng.

### 2.3 R6 + R7 — Hardening & LMS v3.1

| Phase | Nội dung | Nguồn | Công sức (doc) | Lịch thực tế | Trạng thái |
|---|---|---|---|---|---|
| **R6** | Flexibility & Hardening: SystemSetting/CenterSetting động · danh mục động (commission rate/ca/category/giá gói) · đóng lỗ B1–B4 (học phí 2 đợt, hoàn tiền, chuyển lớp, bảo lưu) · **vá C1–C3** (scopedDb error, RBAC v2, webhook fail‑closed) · gỡ hardcode CS1/CS2 (~70 file) | BA #04 · Doc 15 R6 | **~3 tuần** | 06‑13→06‑15 (~3 ngày) | 🟡 partial (xem §3) |
| **R7** | **LMS v3.1 — 18 ticket** (R7‑00..17): security gate · LeadChild + lớp trải nghiệm N buổi · pricing/discount · **payment 2 tầng** · convert v2 · curriculum snapshot · session lifecycle · **học bù liên cơ sở** · portal media · SCORM pipeline + player · import Word · auto‑giao bài · học bạ · form‑builder đánh giá · 17 trigger thông báo + báo cáo | SRS v3.1 · BA #05/#06 · R7‑00..17 | **~8 tuần** (4+4) | 06‑13→06‑18 (~6 ngày) | 🟡 partial (code xong, chưa bật prod) |

**Cụm R6+R7:** ~9 ngày lịch vs **~11 người‑tuần** doc · cuối R7: unit 640, e2e r7 109 pass/2 skip, build xanh.

### 2.4 Vòng phát sinh (ngoài kế hoạch gốc — từ test‑day & vận hành)

| Mã | Nội dung | Nguồn | Lịch thực tế | Trạng thái |
|---|---|---|---|---|
| FixR6‑HO | Vá hardcode HO/cờ isHO + 16 mục admin‑fix + chia sidebar 11 module + vá regression build | Vòng admin‑fix nội bộ | 06‑15→06‑16 (~2 ngày) | ✅ done |
| R7‑bugs | 9 bug manual‑test (RC‑A admin thiếu UserOrgRole, RC‑B thiếu route segment, BUG‑005..009) | Manual test TGĐ 18/06 | 06‑18→06‑20 (~3 ngày) | ✅ done (BUG‑005 đã revert) |
| SEC‑ISO | Cách ly cơ sở qua scopedDb **43 trang + 21 mutation** (IDOR write guard) + receipt prefix theo OrgUnit.code | R7‑00 security audit | 06‑20→06‑21 (~2 ngày) | 🟡 partial (8 file lib‑service còn nợ) |
| RECONCILE | Hợp nhất nhánh **FixLMS→main** (Strategy A) + reconcile migration prod (34 xung đột) | Quyết định branch strategy | 06‑22 (~1 ngày) | ✅ done |
| **FL** (FixLMS) | Test‑day: thêm role **TRAINING** + 19 mục (lesson editor gắn SCORM/bài tập, AssignmentTemplate bank, gộp gói↔khoá, SESSION_EVAL, scopedDb flip Enrollment/ClassSession). **Root‑cause "mọi thứ hỏng" = migration chưa deploy Supabase** | BA #07 · FL‑fixlms‑testday | 06‑24 (~1 ngày) | ✅ done (item 19 defer FL5) |
| **FL‑R2** (W0‑W5) | Round 2: khối thanh toán lead · dropdown khoá teachable · **TrialClassV2** (đủ buổi→AWAITING_DECISION, soft‑withdraw) · lọc GV theo cơ sở · hub `/classes/[id]` 7 tab · auto‑homework từ template · gộp UI Khoá học · SCORM inline | BA gap round2 · W0‑W5 | 06‑25→06‑26 (~2 ngày) | ✅ done |
| LEADPAY | Sửa luồng **lead→payment→enroll**: hợp nhất sổ về Payment · mở khoá REGISTERED · CCCD/địa chỉ PH · tỉnh/phường 2025 · **2 đợt chờ duyệt** · fix dropdown giá khoá (isTeachable) | docs/fix‑plan‑lead‑payment‑enroll · QĐ user 29/06 | 06‑29 (~1 ngày) | ✅ done (đã push) |
| PUB‑LIENHE | Ẩn học phí public → **"Liên hệ"** toàn site (trang chi tiết khoá, FAQ, landing) | Yêu cầu user (FixPublicSite) | 06‑29→06‑30 | ✅ done (PR #30) |

**Cụm phát sinh:** ~12 ngày lịch · công sức tương đương ~**3–4 người‑tuần**. Đây là phần "ẩn" của dự án — sinh ra do test thật + 2 nhánh song song phải reconcile.

---

## 3. PHASE TỒN ĐỌNG

### 3.A Nợ kỹ thuật trong các phase ĐÃ ĐÓNG (partial — lõi xong, còn enforcement/ops)

| Hạng mục | Thuộc phase | Còn nợ gì | Ước còn lại (công sức) |
|---|---|---|---|
| **scopedDb bật cứng** | A0‑04 / R6‑F1 (C1) | Đổi ESLint `app-no-direct-prisma` warn→**error** + migrate **221 file** `@/lib/db` trần → scopedDb; whitelist về 0 | ~1 tuần |
| **RBAC v2 flip prod** | A0‑03 / R6‑F2 (C2) | Bật `RBAC_V2_ENABLED=true` staging→prod sau shadow‑diff sạch N=7 ngày; rà DENY grant cũ | ~2–3 ngày (+ N ngày theo dõi) |
| AuditLog viewer + gộp 8 bảng cũ | A0‑06 | Trang `/admin/audit-log` cho AuditLog mới; gộp 8 bảng audit cũ (Phase B) | ~2–3 ngày |
| RBAC UI nâng cao + assignment UI | A0‑02 / A0‑08 | `setRolePermissions` UI; `/admin/nhan-su/[id]/assignments` | ~3–4 ngày |
| 8 file lib‑service NEEDS‑HUMAN | SEC‑ISO | Thêm guard `passesScope` thủ công cho update/delete/create (scopedDb chỉ auto‑scope READ) | ~2–3 ngày |
| Boy‑scout R1 | R1‑03/09/11/12 | inbox e2e · alert cron ngày 05 · UI replay webhook (cần trước khi Messenger live) · báo cáo tuần/tháng + alert trễ | ~3–4 ngày |
| SCORM bật thật | R7‑11/12 | Bật `SCORM_ENABLED=true` + R2 creds/CORS trên Vercel + e2e browser staging (blur/watermark/IDOR) | ~2 ngày |
| **Apply migration prod** | R7 ops / TBD‑3 | Apply ~18+ migration A0→R5 + R7 lên Supabase prod; flip flags; chạy e2e browser còn skip | ~1–2 ngày |
| **Vá cộng đôi Payment** | PAY‑DEDUP (đang dở) | Commit + push 14 file + 2 migration; lấp latent double‑read trong `summary.ts` (lọc `accountantStatus=ADJUSTED`); verify typecheck/lint/build | ~0,5–1 ngày |

**Tổng nợ kỹ thuật:** ~**2,5–3 người‑tuần** (lịch AI: ~3–5 ngày).

### 3.B Chờ quyết định (blocked — cần Owner/TGĐ chốt)

| Hạng mục | Mã | Chờ ai | Ước sau khi chốt |
|---|---|---|---|
| Công thức hoàn tiền / pro‑rate / clawback | TBD‑2 | TGĐ + Kế toán | ~2–3 ngày |
| Apply migration Supabase prod (chặn go‑live R7) | TBD‑3 | Owner | ~0,5 ngày |
| Mức quét an toàn file SCORM zip | TBD‑4 | Tech Lead + TGĐ | ~1 ngày |
| **Satacoin runtime** (ví điểm + đổi quà) | QĐ‑32 | TGĐ ban hành bảng quy đổi | ~1–2 tuần (hiện chỉ schema‑only) |
| Landing content‑block (section registry) | R6‑C1 (Could) | Marketing migrate nội dung | ~1 tuần |

### 3.C Backlog sau core (phụ thuộc bên thứ 3 / ưu tiên thấp)

| Hạng mục | Phụ thuộc | Công sức (doc) |
|---|---|---|
| Zalo OA / ZNS live (thông báo đa kênh) | C4: token + template ZNS Zalo duyệt | M (~1 tuần) |
| Cổng thanh toán online (VNPay/Tingee) | C6: hợp đồng cổng từ khách | L (~1,5 tuần) |
| MISA AMIS đồng bộ kế toán | C5: tài khoản API MISA | L (~1,5 tuần) |
| PWA portal + Web Push | — | M (~1 tuần) |
| Đăng nhập OTP/Zalo portal | — | — |
| App mobile native + FLAG_SECURE | — | — |
| Xếp lớp tự động sau test | C3: phỏng vấn giáo vụ | L |
| Thi có giám sát (proctoring mức 1) | — | M |
| Chia sẻ học bạ có thu hồi (share‑link) | — | S/M |
| Log truy cập ĐỌC dữ liệu nhạy cảm | — | M |
| Marketplace khóa học (R&D) · Multi‑tenant nhượng quyền (R&D) | cần PRD riêng | — |

**Tổng backlog tích hợp ngoài (nếu làm hết):** ~**4–6 người‑tuần**, trải theo lịch bên thứ 3.

### 3.D Ngoài phạm vi (khách đã LOẠI 2026‑06‑05 — không tính thời gian)

AI (camera/sinh trắc/chatbot/gợi ý lộ trình/dự báo) · Web3/NFT/Blockchain · Student login riêng · Online video LMS · Teacher domain riêng · Lưu giấy tờ tùy thân học sinh. (Nhu cầu "dự báo/khuyến nghị" → làm **rule‑based** trong backlog thường.)

---

## 4. TỔNG THỜI GIAN

### 4.1 Đã làm

| Khối | Lịch thực tế | Công sức tương đương |
|---|---|---|
| Nền tiền‑Doc15 (PRE‑1..4) | ~26 ngày | ~8–12 người‑tuần |
| Lõi A0→R5 | ~3 ngày | ~18,5 người‑tuần |
| R6 + R7 (18 ticket) | ~9 ngày | ~11 người‑tuần |
| 8 vòng phát sinh | ~12 ngày | ~3–4 người‑tuần |
| **TỔNG ĐÃ LÀM** | **51 ngày lịch (~7,3 tuần)** | **~40–45 người‑tuần** |

> Hệ số nén AI ≈ **5–6×** (40–45 người‑tuần công sức → 7,3 tuần lịch).

### 4.2 Tồn đọng (còn lại để go‑live + hoàn thiện)

| Nhóm | Công sức ước | Lịch (AI, ước) |
|---|---|---|
| 3.A Nợ kỹ thuật (enforcement + ops + đang dở) | ~2,5–3 người‑tuần | ~3–5 ngày |
| 3.B Chờ quyết định (sau khi Owner chốt) | ~2–3 người‑tuần | ~2–4 ngày |
| 3.C Backlog tích hợp ngoài (tùy chọn) | ~4–6 người‑tuần | tùy bên thứ 3 |
| **TỐI THIỂU để go‑live prod** (3.A + TBD‑3 + bật SCORM/flags) | **~1–1,5 người‑tuần** | **~3–6 ngày** |

### 4.3 Tổng dự án (đã làm + tồn đọng)

- **Đã làm:** ~40–45 người‑tuần (7,3 tuần lịch).
- **Còn để go‑live:** ~1–1,5 người‑tuần (~3–6 ngày lịch AI).
- **Còn để "đóng hết" gồm backlog ngoài:** thêm ~6–9 người‑tuần (phụ thuộc bên thứ 3 — Zalo/MISA/cổng thanh toán/khách cấp tài khoản).
- **Tổng phạm vi dự án (không tính OOS):** ~**48–55 người‑tuần** công sức tương đương.

---

## 5. Ghi chú phương pháp & độ tin cậy

1. **Lịch thực tế** suy từ commit git (ngày đầu/cuối mỗi cụm) — chính xác cao.
2. **Công sức (doc)** lấy từ bảng estimate trong `phases/README.md` + `R7-lms-v3.1.md` (S<1d, M 1–3d, L 3–7d, XL >1 tuần); cụm tiền‑Doc15 **không có doc estimate** → ước theo khối lượng (đánh dấu "ước").
3. **Trạng thái done/partial** đối chiếu 3 nguồn: phase doc + code thực tế trong repo + memory dự án. Khi lệch → ưu tiên **code thực tế** (vài chỗ doc ghi BLOCKED nhưng code đã có, vd RefundRequest).
4. **Rủi ro lớn nhất chưa đóng:** scopedDb chưa bật error‑gate + RBAC v2 chưa flip prod + migration chưa apply Supabase prod → đây là 3 việc quyết định "có go‑live an toàn được chưa", nên ưu tiên trước backlog.
5. Tài liệu này là **ảnh chụp 2026‑06‑30**; con số tồn đọng (vd 221 file `@/lib/db`) thay đổi khi code tiếp.
