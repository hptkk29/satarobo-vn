# Báo cáo tổng hợp kế hoạch đã triển khai — Tháng 7/2026

> Lập ngày 31/07/2026. Nguồn: 439 commit + 30 PR merge (01–31/07), `docs/ke-hoach-go-live-2607/` (19 file), `docs/taicautruc/` (13 file), `Document/0-yeucau/3-ke-hoach-trien-khai/phases/AUTH-SDT-chuyen-doi-xac-thuc.md`, các tài liệu BA tháng 7. Tổng hợp bằng workflow 7 agent đọc song song, đối chiếu chéo git ↔ tài liệu.

---

## 0. Tóm tắt điều hành

Tháng 7/2026 là tháng cao điểm nhất của dự án: **439 commit, 30 PR merge**, chạy đồng thời **7 chương trình** với đội **giảm từ 5 xuống 3 người ngay ngày 03/07** (Huy & Trí rời team; việc bàn giao Huy→Kiệt, Trí→Luân).

| Mốc | Ngày | Kết quả |
|---|---|---|
| Migrate prod đợt đầu (155/155 migration + seed OrgUnit/RoleDef) | 03/07 | ✅ DONE |
| SCORM live trên prod (bản cơ bản) | 03/07 | ✅ LIVE |
| BGĐ duyệt site giáo viên riêng `giaovien.satarobo.vn` (câu 7) | 04/07 | ✅ Đảo quyết định cũ |
| Đóng cổng DB trần — #03 scopedDb (221 file, allowlist 58→3) | 10/07 | ✅ ĐÓNG |
| Đèn xanh shadow RBAC v1↔v2 ("CẦN XỬ LÝ = 0") + smoke 9 vai trò prod | 10/07 | ✅ PASS |
| **FLIP `TEACHER_SITE_ENABLED` — site GV chính thức mở** | 10/07 | ✅ LIVE |
| Reskin toàn bộ site GV theo design system TeachUI (PR #57) | 15/07 | ✅ DONE |
| Flip `RBAC_V2_ENABLED` trên prod (kế hoạch 15–17/07, xác minh ON 29/07) | ~15–17/07 | ✅ ON |
| Đợt security + performance hardening (S0, SEC-M, REQ/QRY/IDX) | 17–19/07 | ✅ DONE |
| QA tay go-live 2 vòng lớn (~28 commit fix) | 20–21/07 | ✅ DONE |
| Bộ hướng dẫn sử dụng 3 site (50 bài) | 23/07 | ✅ DONE |
| **Mốc GO-LIVE theo kế hoạch** | 26/07 | Sprint khép; hệ thống vận hành trên prod |
| Chương trình tái cấu trúc 10 bước PM/BA (bước 0–9) | 28–29/07 | ✅ KHÉP — 12 kết quả sẵn thi công, 11 chốt chờ chữ ký |
| AUTH-SĐT: P0 + P1 + P0′ + P0-d + P2 + P3 hoàn thành (PR #69/#70/#71/#72) | 29–31/07 | ✅ DONE, kế tiếp P4 |

**Trạng thái cuối tháng:** hệ thống chạy prod với RBAC v2 enforce, site GV live, cổng DB đã đóng; 2 chương trình gối đầu sang tháng 8 (AUTH-SĐT từ P4, tái cấu trúc chờ 9/11 chốt chữ ký).

---

## 1. Bối cảnh đầu tháng (baseline 30/06)

Theo `docs/tong-hop-phase-thoi-gian-du-an.md` (30/06): lõi hệ thống ~90% code-complete nhưng sẵn sàng go-live chỉ ~70% — tồn đọng chính là enforcement chưa bật prod (RBAC v2 OFF, scopedDb chưa phủ), 3 TBD nghiệp vụ treo chờ TGĐ, và backlog tích hợp bên ngoài (Zalo/MISA/cổng thanh toán). Toàn bộ công việc tháng 7 xuất phát từ danh sách tồn đọng này.

**Sự kiện nhân sự 03/07:** Huy và Trí rời team, còn 3 người (Kiệt, Luân, Vy). Task giữ nguyên mã (H1–H8 → Kiệt, T1–T6 → Luân); cơ chế mentor đổi thành review chéo Kiệt↔Luân — không ai tự merge PR đụng tiền/quyền của mình. Tổng tải sau bàn giao ~103 ngày-công / ~20 ngày làm việc (quá tải ~2x) → kế hoạch v4 cắt scope MVP còn **187/271 tính năng**, mục tiêu go-live 26/07 là chạy được **1 luồng vận hành đầy đủ trên CS1+CS2 thật**: Lead (đã ĐK) → Convert → Học viên → Xếp lớp → Điểm danh → Đánh giá buổi → Học bạ → Portal PH/HV.

---

## 2. Chương trình 1 — Sprint go-live 26/07 (GĐ0→GĐ4)

Kế hoạch tại `docs/ke-hoach-go-live-2607/` (README + KIET/LUAN/VY + v4/), lập 01/07, chốt lại 03/07 sau biến động nhân sự.

| GĐ | Thời gian | Trọng tâm | Kết quả thực tế |
|---|---|---|---|
| GĐ0 | 01–04/07 | Migration prod, fix Payment, chốt 3 TBD, tái cân đối tải | ✅ Migrate 155/155 (03/07); K3 PAY-DEDUP vá cộng đôi "đã nộp"; 3 TBD chốt qua docx 03/07 |
| GĐ1 | 06–13/07 | Lõi Sale→Lớp→Tiền→Giáo trình + scopedDb + RBAC BE | ✅ (mục 3 dưới) |
| GĐ2 | 08–18/07 | Portal 100% + site GV + RBAC v2 flip + SCORM | ✅ Site GV flip 10/07; RBAC flip ~15–17/07 |
| GĐ3 | 20–22/07 | Báo cáo cơ bản + hardening + regression QA | ✅ QA tay 20–21/07 (~28 commit fix) |
| GĐ4 | 23–26/07 | UAT 2 cơ sở, fix P0/P1, go-live | ✅ Hướng dẫn sử dụng, import v2, ops nhóm 3/4/5/8 |

**3 TBD chốt bởi TGĐ (biên bản K7, docx 03/07):**
- **TBD-2 hoàn tiền:** KHÔNG hoàn tiền; ngoại lệ duy nhất hoàn 100% sau buổi 1. Code hoàn tiền pro-rata (`computeRefund`) mâu thuẫn quyết định → **cấm viết thêm**. ⚠️ Câu 2.3 (chuyển lớp khác mức phí) **chưa được trả lời**.
- **TBD-3 migrate prod:** chỉ Kiệt chạy · sau 21h · backup trước mỗi lần, lưu 7 ngày.
- **TBD-4 SCORM zip:** mức (b) — validate cấu trúc + **CSP trên player** (CSP là việc MỚI vì kiến trúc 302-redirect R2, chưa làm trong tháng 7).

**Các ticket then chốt đã hoàn thành trong sprint:** K1 (patch UserOrgRole 23 tài khoản thật), K3 (PAY-DEDUP), H1 (điểm danh 6 nhãn), L1/#03 (scopedDb), L4-T2/#09 (RBAC v2 flip), L5-L6/#06 (site GV), V3 (UI site GV — thực tế port từ bàn giao `satarobo-ui-giaovien` + reskin TeachUI), #07 (import lead REGISTERED), #15 (màn xác nhận kế toán + phiếu thu), #05 (freeze 5 bảng audit cũ → AuditLog hợp nhất), #10 (panel QL 5 KPI), #11 (share-lead + PII lead), B1.5 (9 email template tự sửa qua admin).

**Cắt/dời có chủ đích (đúng kế hoạch cuốn chiếu):** Zalo OA/ZNS (→ thành chương trình AUTH-SĐT cuối tháng), MISA sync, cổng thanh toán online, hoa hồng/MKT (0/16), CRM nâng cao (Messenger inbox, SLA), Satacoin/PWA/marketplace.

---

## 3. Chương trình 2 — An ninh dữ liệu & RBAC v2 (xuyên suốt 01–25/07)

Đây là chương trình lớn nhất về khối lượng (~120 commit), gồm 4 lane:

### 3.1. #03 — Đóng cổng DB trần bằng scopedDb (04–10/07, ~40 commit)
- Phân loại 221 file import `@/lib/db` trần (Loại A/B/C/D) → migrate ồ ạt ~150 file trong 6 batch ngày 07/07 (HR/ops 29, finance/inventory 28, CRM/users/import 33, content/reports 31, academic/LMS 33, portal 19).
- Allowlist ESLint giảm 58 → 25 → 18 → **3 file**; ESLint error cho code mới. **#03 ĐÓNG 10/07.**
- Tạo `portalDb` (ownership-scope riêng cho cổng phụ huynh); flip `ReportCard`/`ConversationMessage`/`EvaluationRound`/`Attendance` (#04) vào SCOPED_MODELS theo 2-phase (backfill `centerId` trước, flip sau).
- Bug đáng nhớ đã vá: `findUnique` + select hẹp trả null oan cho actor cấp cơ sở — 28 call-site.

### 3.2. #01 — Shadow-compare v1↔v2 (06–12/07, ~40 commit)
- 06/07: wire **toàn bộ** call-site admin qua `checkPermission`/`assertPermission` (29 commit trong 1 ngày) để so lệch v1↔v2 trên prod.
- Workflow shadow-report tự động + cron 08:00 VN hằng ngày; 3 vòng phân loại lệch (778 → 29 → 15, toàn bộ 15 cuối là intentional) → **🟢 đèn xanh "CẦN XỬ LÝ = 0" ngày 10/07**.

### 3.3. #09 — Flip RBAC v2 trên prod
- Đối chiếu tĩnh 09/07 phát hiện **137 action sẽ mất quyền khi flip** → vá seed (CENTER_MANAGER 6→78 action, TEACHER 3→32, tạo CENTER_HR); chốt danh sách 9 nhóm quyền SIẾT khỏi CENTER_MANAGER (Kiệt ký 09/07).
- **Sự cố & xử lý:** 09/07 preflight đỏ — 3 tài khoản kỹ thuật thiếu UserOrgRole (flip ngay thì admin tự khoá); 10/07 sự cố "14 người mất UserOrgRole" — truy nguyên là batch apply 17 dòng **chưa từng chạy thật** (chỉ có dry-run), không phải mất dữ liệu.
- **Đổi cổng C (09/07):** cổng cũ "3–5 ngày shadow sạch trên traffic thật" vô nghĩa vì prod chưa có người dùng → cổng mới: shadow DEV sạch + smoke 8 vai trò prod + diễn tập rollback <10' + parity 0 nợ; **flip trước UAT** (15–17/07). Cờ `RBAC_V2_ENABLED=true` xác minh đang ON trên Vercel Production (29/07).
- **Smoke 9 vai trò trên prod 10/07:** gate vào/chặn đúng hết, cách ly cơ sở quan sát được; lòi 4 phát hiện (dead-link, hở quyền theo URL qua `/tin-nhan` `/hoc-ba`…, sidebar lệch cờ) → sửa ngay trong ngày: `PAGE_GATES` thành nguồn duy nhất menu≡gate (9 route đổi gate, khoá bằng test CI), BGĐ chốt action mới `reports:training`.

### 3.4. Hardening RBAC sau flip (24–25/07, PR #64/#65)
- Khoá chặt role Đào tạo (chỉ Đào tạo/SuperAdmin chỉnh chương trình).
- **Guard GHI cách ly cơ sở per-model** — vá lỗi thật "Toại tạo được lớp CS2"; vá thêm 13 điểm rò CS2 đường ĐỌC + 2 chốt nghiệp vụ (chấm công về CS1, học bạ chỉ duyệt).
- 30/07 (gia cố kèm AUTH-SĐT): bọc `seedRoles` trong `$transaction` — chặn nguy cơ mất quyền toàn hệ thống giữa lúc seed.

**Spec đi kèm đã ship:** #11 share-lead per-record + action `leads:view-pii` mask server-side 5 nhóm field (ký & code cùng ngày 10/07); #13 RoleSwitcher phase-1 (đổi giao diện, không đổi quyền) — phần menu cross-host **chặn có chủ đích** chờ 3 tiền đề (desync `User.roles ⇄ UserOrgRole` để sau go-live).

**Nợ ghi nhận:** `can()` v2 chưa có nhánh DENY (QĐ-B/M1 — cờ bật trước khi xong 3 việc chặn cứng); chưa thiệt hại vì `UserPermissionGrant` prod rỗng; luật tạm: KHÔNG tạo grant DENY.

---

## 4. Chương trình 3 — Site giáo viên `giaovien.satarobo.vn` (07–15/07, ~52 commit — chủ đề lớn nhất)

- **04/07** BGĐ duyệt (phiếu câu 7) — đảo quyết định "đã loại teacher domain riêng"; **07/07** dựng khung route group `app/(teacher)/teacher` + flag `TEACHER_SITE_ENABLED` + wire host; **10/07 FLIP cờ — site GV chính thức LIVE** (PR #55).
- Port 4 batch UI từ bàn giao `satarobo-ui-giaovien` rồi **reskin toàn bộ 16 trang theo design system TeachUI** (dark-safe, tokens cam-only) — PR #57 merge 15/07.
- Tính năng dựng mới trong 11–15/07: Class Hub 6 tab, phiếu nhận xét buổi học (rubric 9 tiêu chí), Kho bài tập GV tự soạn đề (trắc nghiệm + tự luận), Đơn từ GV (10 loại, duyệt CENTER_MANAGER), Điểm danh xuyên lớp, Danh sách Trial + phiếu rubric 8.0 xuất PDF, Bảng công chi tiết ca, Hồ sơ học viên 4 tab, đề xuất Hoàn thành khoá (GV đề xuất → CENTER_MANAGER duyệt).
- An toàn: CI job `e2e-teacher`; e2e khẳng định site GV **không lộ SĐT/email phụ huynh, không lộ studentId** (câu 46); điểm danh 6 nhãn + makeup liên cơ sở (câu 47/50); ảnh lớp theo consent C6.2.

---

## 5. Chương trình 4 — Security + Performance hardening (17–19/07, ~43 commit)

Chạy tập trung 3 ngày giữa flip RBAC và UAT:

- **Security:** S0a (headers, bỏ SVG upload, escape JSON-LD, chặn mass-assignment, timing-safe compare) + S0b (rate-limit login, secret resolver); SEC-H04 chặn rò PII nhân sự xuống client; SEC-M01→M13 (rate-limit 4 webhook, presign upload, audit xoá R2, audit + watermark 3 route export PII, audit mọi mutation nhân sự, mask PII Sentry Replay, chặn teacher inject thông báo, DB-liveness revocation, chống leo thang quyền).
- **Performance:** diệt N+1 tận gốc (`getStudentProgress`/`getClassProgress`, batch student×lớp); cache theo scope cho 8 trang báo cáo + 6 dashboard (foundation `actorScopeKey` + leak-test chống leak cross-center); IDX-1..4 index hot query; REQ-09/11 skeleton + chuẩn hoá ISR. **1 revert có chủ đích:** REQ-02 cache cây OrgUnit gây scope stale → gỡ 19/07.
- **Refactor dedupe:** `lib/format/date.ts` (>50 chỗ), `formatVndPlain`, `BackLink` (bỏ 11 bản), `LegalPage`, hook `useSetActiveSite`; foundation API contract `ok()/fail()` + `withCron`.
- **Q41 — Cổng login chung + SSO đa subdomain + đổi vai nhảy site** (PR #58, 17/07) — merge ở trạng thái **gate-off**, chờ bật.

---

## 6. Chương trình 5 — QA & hoàn thiện trước go-live (20–26/07, ~45 commit)

- **QA tay 20/07 (đợt lớn nhất tháng, ~21 commit):** sửa 6 lỗi UI test tay, ngày null hiện "—", chấm công đúng ngày địa phương, Việt hoá loạt enum thô + trang 404 + lỗi Zod, ghim timezone VN học bạ, title mọi route admin, bộ lọc thời gian + cơ sở cho toàn bộ `/bao-cao/*`, sửa funnel/churn/tỉ lệ chuyển đổi.
- **QA4 21/07:** holiday shift chết vòng lặp, hủy lớp cascade, 3 lỗi site GV cùng gốc seed `centerId=NULL`, Publish bài tập hết treo, mở PII lead cho MARKETING (outreach).
- **Vòng tiền FIN-01 (20/07):** convert gắn khoản RECORDED vào ghi danh (link-only), verify E2E convert→link→confirm→Receipt→công-nợ=0; chốt Q1=A (chia khoản theo `finalPrice`); 1 revert đúng (auto-confirm mark-PAID sai thiết kế convert-first). **FIN-02 đối soát ngân hàng: lập ticket, chốt nguồn (D thủ công trước) — chưa build.**
- **PII (PR #60, 22/07):** che SĐT phụ huynh ở Học viên + Đăng ký; `orders:view-pii` che liên hệ trên đơn hàng + email-logs.
- **Import Excel v2 (22/07 + PR #68 26/07):** bộ file mẫu v2 cho 11 màn import, báo TRÙNG + đối chiếu dữ liệu có sẵn + cảnh báo GHI ĐÈ ngay ở preview, xoá dòng lỗi, mẫu Excel động (dropdown khoá/cơ sở), **gộp con theo SĐT** cho Sale, QL cơ sở import không cần mã CS.
- **Bộ hướng dẫn sử dụng 23/07:** `/admin/huong-dan` 13 bài + `/portal/huong-dan` 19 bài + `/teacher/huong-dan` 18 bài = **50 bài**.
- **Ops 25–26/07 (PR #66/#67):** tài liệu Sale UI + quy trình theo role; 4 nhóm task vận hành (lớp học, lịch học, giáo trình, nhãn vai trò).
- Ngoài sprint: site `sale.satarobo.vn` — form Sale đẩy MISA AMIS CRM (08/07, PR #38).

---

## 7. Chương trình 6 — Tái cấu trúc nền tảng đa cơ sở/nhượng quyền (28–29/07)

Chương trình PM/BA "10 bước" tại `docs/taicautruc/` (13 file, ~6.160 dòng) — phân tích, **không code tính năng** — khép trong 2 ngày:

- **Bước 0 (baseline/scope-gap/dryrun):** đo lại repo (173 model, 391 server action, scopedDb phủ 34/173); dry-run "mở CS-HN1" chứng minh mở cơ sở hôm nay = sửa code ≥17 file; mô hình nhượng quyền = 0 model.
- **Bước 1–4:** chấm ý định↔code 100 khoảng cách (60 LỆCH); PRD nhượng quyền **112 yêu cầu R-\***, 9 pha A1–A9; 26 job story; **84 giả định** (đính chính 29/07: RBAC v2 thực ra ĐÃ BẬT prod — sửa 2 tiền đề sai).
- **Bước 5–9:** pre-mortem 18 kịch bản hỏng; red-team 13 tuyến tấn công; lộ trình **12 kết quả lập lịch được**; **72 kịch bản kiểm thử** (phát hiện chặn hạ tầng: 32/98 spec e2e không có job CI nào chạy); bộ vật phẩm phát hành.
- **BGĐ ký 28/07 các quyết định:** QĐ-A (cây `ROOT → HO + VÙNG`, CS1/CS2 dưới Vùng Đà Nẵng, thêm enum REGION), QĐ-B (GIỮ DENY — phát sinh chốt M1 vì cờ đã bật trước), QĐ-C (bỏ hẳn học bù liên cơ sở), QĐ-D (phạm vi PRD).
- **3 việc "làm ngay" đã xong 29/07:** seed roles atomic (`$transaction` + test), sửa header workflow seed, đóng chốt M3/M6.
- **Kết luận trình Ban:** chương trình bị chặn bởi **chữ ký, không bởi code** — đóng 2/11 chốt, **9/11 chốt chờ** (đắt nhất: c43 — gói cổng tạo cơ sở A1). Chỉ số duy nhất báo hàng tuần: "đã đóng N/11 chốt".

---

## 8. Chương trình 7 — AUTH-SĐT: chuyển xác thực Email → SĐT qua Zalo ZNS (28–31/07, gối sang tháng 8)

Kế hoạch tại `Document/0-yeucau/3-ke-hoach-trien-khai/phases/AUTH-SDT-chuyen-doi-xac-thuc.md` (lập 28/07). Triết lý: **không thay email bằng SĐT** — cộng thêm khoá SĐT, email hạ xuống kênh dự phòng vĩnh viễn; chỉ phụ huynh dùng SĐT, nhân sự giữ email (QĐ-C).

| Phase | Nội dung | Trạng thái 31/07 |
|---|---|---|
| P0 | Vá 6 lỗ an toàn OTP (bypass verify-chưa-consume, rate-limit, account enumeration, kill-switch 300 tin/ngày…) | ✅ DONE (PR #69, 30/07) |
| P1 | Canonical SĐT `84XXXXXXXXX` — một hàm `lib/phone.ts` (gộp 6 helper + 5 regex); **backfill prod đã chạy 29/07** (43 trường, dạng cũ = 0) | ✅ DONE (PR #69) |
| P0′ | Thủ tục ZBS/ZNS: OA xác thực DN + App + env Vercel (30/07); **2 mẫu ZNS được Zalo DUYỆT: OTP=616128, học phí+tài khoản=616258**; văn bản ZBS trả lời 4 câu (OTP gửi 24/7, tin fail không tính phí…) | ✅ DONE 31/07 (PR #70) |
| P0-d | Upstash Redis Prod + Preview (2 DB riêng) | ✅ DONE 30/07 |
| P2 | Lưới test: 18 unit test OTP (trước đó 0), cửa test `OTP_TEST_FIXED_CODE` (non-prod only, prod thấy biến là fail cứng), gộp 11 bản sao login e2e về helper chung, baseline 32 spec ngoài CI xanh 100% | ✅ DONE 31/07 (PR #71) |
| P3 | Migration additive `User.phone @unique` + login nhận SĐT hoặc email (không backfill trong migration) | ✅ DONE 31/07 (PR #72, merge 11:15) |
| P4–P7 + Nhánh B (ZNS học phí) | Kênh ZALO cho OTP, cấp tài khoản bằng SĐT, quên mật khẩu, ZNS xác nhận học phí | ⏳ Kế tiếp P4, hết bị chặn thủ tục |

**Quyết định đã chốt trong chương trình:** QĐ-A (1 SĐT = 1 tài khoản = 1 hộ), QĐ-B (chưa đa-phụ-huynh), QĐ-E (ngân sách 300 tin/ngày ≈ 90.000đ), QĐ-F/G (rút còn 2 mẫu ZNS, không vi phạm 3 điều cấm kiểm duyệt), **QĐ-H 30/07: bỏ hẳn SMS brandname** — chỉ Zalo ZNS + email dự phòng + mã tạm tại quầy.

---

## 9. Tài liệu BA mới lập trong tháng — CHƯA triển khai (chờ ký)

| Tài liệu | Ngày | Nội dung | Trạng thái |
|---|---|---|---|
| `docs/ba-crm-hien-trang-va-misa.md` | 28–29/07 | CRM một-tầng hiện tại + đối chiếu MISA AMIS; đề xuất KHÔNG mua MISA, gọi điện qua tổng đài đám mây; 9 câu Q1–Q9 chờ BGĐ | Bản thảo, chưa ký |
| `docs/ba-cham-cong-hien-trang-va-misa.md` | 28–29/07 | Chấm công hiện trạng + MISA; lộ trình 12–20 tuần; 12 câu CH-01..12 chờ chốt | Bản thảo, chưa ký |
| `docs/ba-chat-realtime-va-goi-dien-da-vai-tro.md` | 29/07 | Chat realtime + gọi Zalo đa vai trò; LOẠI ZaloCRM (AGPL); khuyến nghị hộp thư hợp nhất tự xây + Supabase Realtime; 8 phép thử rẻ trước khi code | Bản thảo (untracked), bước kế tiếp là "đo, không phải code" |

---

## 10. Tồn đọng chuyển sang tháng 8

**Kỹ thuật:**
1. AUTH-SĐT P4 → P6 + Nhánh B (ZNS học phí) — P4 là kế tiếp (Zalo provider + `/admin/otp-logs`), P3 đã merge PR #72 trưa 31/07.
2. Nhánh DENY cho `can()` v2 (QĐ-B / chốt M1) — cờ đã bật trước khi xong; luật tạm: không tạo grant DENY.
3. CSP cho SCORM player (TBD-4 mức b) + e2e blur/watermark/IDOR SCORM.
4. FIN-02 đối soát ngân hàng (đã chốt nguồn, chưa build).
5. Fix desync `User.roles ⇄ UserOrgRole` (tiền đề #13 menu cross-host; Q41 SSO đang gate-off).
6. 32/98 spec e2e chưa có job CI chạy (phát hiện bước 8 tái cấu trúc; P2 đã lập baseline tay 100% xanh).
7. Tồn dư P1: 3 call-site convert-lead còn digit-strip trần chưa qua `canonicalPhone`.

**Chờ quyết định người ngoài đội kỹ thuật:**
8. 9/11 chốt tái cấu trúc chờ chữ ký (đắt nhất c43 — chặn pha A1+A4 nhượng quyền).
9. Câu 2.3 biên bản K7: chuyển lớp khác mức phí — TGĐ chưa trả lời.
10. 3 tài liệu BA (CRM/chấm công/chat) chờ BGĐ ký trước khi thành việc code.
11. Sync file `.md` biên bản K7 với bản docx đã điền; ghi số đo diễn tập rollback vào runbook.

---

## 11. Số liệu tháng

| Chỉ số | Giá trị |
|---|---|
| Commit (01–31/07) | 439+ (snapshot sáng 31/07, chưa gồm các commit PR #72 merge trưa 31/07) |
| PR merge | #33→#72 (~31 PR) |
| Ngày cao điểm | 10/07 — "ngày flip": ~20 PR merge (đóng #03, đèn xanh shadow, FLIP site GV, portal appearance…) |
| Chủ đề nhiều commit nhất | Site giáo viên (~52), scopedDb #03 (~40), wire checkPermission #01 (~40), QA tay 20–21/07 (~28) |
| Revert có chủ đích | 2 (REQ-02 cache OrgUnit; auto-confirm mark-PAID) — đều thay bằng hướng đúng |
| Khoảng lặng | 27–28/07 (0 commit — giai đoạn chốt thủ tục ZNS với Zalo + BGĐ ký QĐ tái cấu trúc) |
| File allowlist DB trần | 58 → **3** (cổng đã đóng) |
| Bài hướng dẫn sử dụng | 50 (admin 13 + portal 19 + teacher 18) |
