# Yêu cầu UI/UX — Site Tư vấn tuyển sinh (Sale) cho role `SALES_CSM`

> **Trạng thái:** ✅ **FINAL — toàn bộ quyết định §0.3 (8 QĐ) + §10 (12 câu) đã chốt 16/07/2026** (user ủy quyền quyết). Sẵn sàng vào P0. Nếu sau này BGĐ đảo QĐ-1 (host) sang Phương án B thì chỉ sửa cục bộ §2.1 + P6/P7.
> **Phạm vi:** Giao diện + luồng thao tác cho site giáo viên **tư vấn tuyển sinh / CSKH** (`SALES_CSM`), site thứ 6 chạy chung app Next.js.
> **Dựa trên:** cấu trúc shell site giáo viên `app/(teacher)/teacher/` + pattern điều hướng portal `app/(portal)/portal/`; phễu tuyển sinh **SR.QD.217**; blueprint **Doc 15**; ma trận quyền `lib/auth/permissions.ts` + seed RBAC v2.
> **Nguyên tắc bất biến:** chỉ phơi bày tính năng `SALES_CSM` **có quyền**; mọi đọc/ghi qua `scopedDb(actor)` (cách ly cơ sở CS1≠CS2); dùng lại **server action đã có** của admin, **không** viết lại logic nghiệp vụ; shadcn thuần (KHÔNG Recharts/Magic UI/Framer trong site này — ESLint chặn).

---

## §0. Tóm tắt điều hành

### 0.1 Mục tiêu

Tách một **site làm việc riêng cho tư vấn viên tuyển sinh** (`giaovien.satarobo.vn` là của GV; site này là của Sale/CSKH), thay vì để họ dùng chung admin. Site trình bày công việc theo **một ngày của tư vấn viên**: lead của tôi → liên hệ theo SLA → xếp học thử → chốt đơn (ghi danh + thu phí) → chăm sóc & tái tục. Đồng thời, **form nhập khách hàng MISA được đưa vào làm 1 tab** trong sidebar, đúng yêu cầu — tab nhúng **"Form nhập liên hệ từ Sale"** (snippet user cung cấp 16/07, lưu `satarobo-sale/form-sale-nhap-snippet.html`; cùng form MISA với entry Ads nhưng bộ trường mới — chi tiết §7 tab 6); file CŨ `/nhap-lieu.html` vẫn giữ cho entry công khai chạy Ads.

### 0.2 Đặc điểm chính (khác gì admin)

- **Menu ≡ quyền:** 28 tab đặc tả (**27 tab trong v1** — tab Hộp thư Messenger hoãn, §10-Q10), mỗi tab gate bằng 1 `permission` cụ thể; tab không có quyền thì **ẩn khỏi sidebar** (và chặn ở route-gate) — Sale không thấy Nhân sự/GV/LMS/Kho/Công nợ/Audit/Users…
- **Trang chủ = "Bảng việc hôm nay"** (hướng hành động theo SLA), **không** phải bảng thống kê tài chính cơ sở.
- **Tông màu riêng** (tím `#7C3AED` — đã chốt QĐ-2) + Sáng/Tối, scoped `.sale-root` — nhìn là biết đang ở site Sale.
- **2-phase flag** `SALE_SITE_ENABLED` (mặc định OFF): OFF → Sale vẫn làm trên admin như hiện tại; ON → Sale thuần đăng nhập vào site này. Rollback = đổi env, không revert code.

### 0.3 ✅ Quyết định ĐÃ CHỐT (16/07/2026 — user ủy quyền)

| # | Quyết định | ✅ Đã chốt | Căn cứ |
|---|---|---|---|
| **QĐ-1 HOST** | Host cho site auth | **Phương án A — tái chiếm `sale.satarobo.vn`**, phân path: `/nhap-lieu.html` + `/thank-you.html` giữ **công khai** (entry Ads chạy tiếp như hiện tại), mọi path còn lại đòi đăng nhập. **KHÔNG** mở subdomain thứ 6. | Khớp trực tiếp yêu cầu "MISA thành 1 tab"; iframe cùng origin không lỗi khung; đỡ 1 DNS/Vercel domain. Rủi ro trộn public+auth xử lý bằng **whitelist path tĩnh TRƯỚC cổng auth** (§2.1) + e2e T30/T31 phủ đủ case. |
| **QĐ-2 THEME** | Tông màu accent | **Tím `#7C3AED`** (violet-600; dark: violet-400). | Màu thương hiệu thứ 2 của repo (cam+tím) — GV đã lấy cam nên tím rảnh; tránh teal dễ lẫn thang `blue=info` của `StatusPill`. Toàn bộ §7 đã đặc tả theo tím. |
| **QĐ-3 ROLE GATE** | Ai vào site (tầng 3 layout) | **Chỉ `SALES_CSM` thuần** vào app (thêm cờ `isSaleOnly` — soi chiếu `isTeacherOnly`); **kiêm nhiệm** (có thêm CENTER_MANAGER/HO/GV…) → bounce admin/teacher giữ full quyền. HO_SALE/MARKETING **ngoài phạm vi v1**. | `SALES_CSM` hiện là `isStaff` → cần luật riêng; tránh CM bị "nhốt" trong site hẹp quyền, và tránh phải xử lý PII-mask đa vai ngay v1. |
| **QĐ-4 orders** | Quyền tạo Đơn hàng | **Thêm action hẹp `orders:create`** cho `SALES_CSM` (chỉ tạo đơn **gắn lead của mình**, scope CENTER), **không** cấp `orders:manage`. Đồng bộ **3 file**: `permissions.ts` + `seed-roles.ts` + `rbac-parity.test.ts` — 1 PR RBAC riêng TRƯỚC P0. | Không vá thì **kẹt cả luồng chốt** (Order → `payments:record` → đủ điều kiện convert); `orders:manage` quá rộng (mở/hủy/hoàn toàn hệ thống). |
| **QĐ-5 commission** | Màn "Hoa hồng của tôi" | **Có** — thêm `commission:view-own` (scope OWN, `CommissionLine.recipientId=me`), parity 3 file như QĐ-4. Hiển thị: **DRAFT kỳ hiện tại nhãn "tạm tính"** + APPROVED kỳ cũ; disclaimer "số có thể điều chỉnh khi chốt kỳ". B1–B5 của BGĐ **không chặn** build màn này. | Minh bạch thu nhập tăng động lực chốt; read-only, quyền OWN nên bề mặt rủi ro nhỏ. |
| **QĐ-6 Học bù** | Xếp buổi bù | **KHÔNG thuộc site Sale** — Sale chỉ **sinh** nhu cầu học bù qua `resolveAbsence` (đơn báo vắng); **xếp buổi bù** thuộc QL/GV (admin/teacher). | Giữ ranh giới trách nhiệm, tránh tab thừa trùng chức năng QL (`MAKEUP` là 1/7 loại đơn PH — Sale duyệt đơn, không xếp buổi). |
| **QĐ-7 Trial** | Model trial + tiêu chí "chờ chốt" | **V2 là chuẩn** (`TrialClassSession`/`TrialEnrollment`/`TrialRubricEval` — lớp N buổi, QĐ-O9); V1 chỉ **đọc** tương thích. Tiêu chí "chờ chốt" thống nhất **1 nguồn: `LeadChild.trialStatus = ATTENDED`** (chuẩn per-con — 1 lead có N con); `Lead.status=TRIAL_ATTENDED` chỉ là giá trị suy ra để hiển thị, **không** dùng làm điều kiện lọc. | V2 là hướng đi đã duyệt; per-con mới đúng nghiệp vụ nhiều con/1 PH; 3-nguồn-lệch là bug chờ sẵn. |
| **QĐ-8 Rubric** | Sale xem rubric GV | **Có, read-only** — gate bằng `trials:view` **sẵn có** (SALES_CSM có) + `scopedDb`; **không** cần action mới; không đụng kênh PH (đã ẩn PII riêng). | Điểm/nhận xét GV là vũ khí chốt đơn; dùng quyền sẵn có nên không nới bề mặt quyền. |

> **12 quyết định chi tiết còn lại đã chốt ở §10** (giữ entry Ads công khai, hoãn tab Messenger, không model Appointment/nhật-ký-CSKH mới ở v1, giữ Kanban+Bảng…). Từ đây tài liệu là **bản final** — đặc tả bên dưới nhất quán với các quyết định trên.

---

## §1. Bối cảnh & định vị

- **Người dùng chính:** tư vấn viên tuyển sinh / CSKH (`SALES_CSM`) tại **CS1 (211 Nguyễn Hữu Thọ)** và **CS2 (114 Hoàng Diệu)**; cấp trên là `CENTER_MANAGER` (kiêm nhiệm ở admin). `HO_SALE` (xem cross-center, không sửa) **chưa** thuộc phạm vi phase đầu.
- **Nghiệp vụ (SR.QD.217, Messenger-first):** lead vào từ **Page HO** (Messenger) + form MISA + sự kiện/import → **phân bổ** cho Sale theo cơ sở → tư vấn **L1→L2→L3** → **học thử** → **chốt** (ghi danh + thu phí) → **CSKH/tái tục**. Site này phục vụ Sale cơ sở **từ L2 trở đi** (record Lead); hộp thư Messenger L1 là tùy chọn (QĐ ở §10).
- **Vì sao tách site:** giảm nhiễu (Sale không cần 50+ menu admin), tối ưu luồng chốt trên **mobile-first**, và đo **SLA phản hồi** rõ ràng.
- **Vị trí trong hệ 6 site:** `satarobo.vn` (public) · `admin.` · `hocvien.` (portal PH/HS) · `giaovien.` (GV) · `sale.` (site này) · (`sale.` cũ = form MISA tĩnh, nay thành 1 tab).

---

## §2. Nguyên tắc kiến trúc & UI

### 2.1 Host & định tuyến (QĐ-1, QĐ-3)

**Hiện trạng (đã verify `lib/auth/route-policy.ts`):** `hostKind === "sale"` (route-policy.ts:392) chỉ phục vụ **tĩnh, công khai**: `/` → rewrite `public/sale/nhap-lieu.html`; `/thank-you` → `public/sale/thank-you.html`; `/sale/*` → serve tĩnh; path lạ → redirect `/`. **Không** auth. `proxy.ts` **không đụng** (đúng convention #3: chỉ sửa `decideRoute()`).

**Phương án A — tái chiếm `sale.satarobo.vn` (✅ ĐÃ CHỐT — QĐ-1):**
- **Path công khai giữ nguyên (cho Ads):** `/nhap-lieu.html`, `/thank-you.html`, `/nhap-lieu`, `/thank-you` → vẫn rewrite file tĩnh, **không** đòi login (khách vãng lai từ quảng cáo hit thẳng form MISA CŨ như hiện tại). Riêng **wrapper form Sale nhập** `/sale/form-sale-nhap.html` (iframe của tab Nhập khách hàng) phục vụ **SAU cổng auth** — không whitelist public (form có prefill mã NV).
- **Path app đòi auth:** mọi path khác → yêu cầu `session hợp lệ`; nếu **Sale-thuần** (`isSaleOnly`) → rewrite clean URL `'/*'` → `'/sale/*'`; nếu **kiêm nhiệm** (có role staff khác) → `redirectHost admin` (giữ full admin); GV → teacher; PARENT → portal; chưa login → `/login` **giữ host**.
- **Cần thêm:** `HostKind` đã có `"sale"`; mở rộng union `redirectHost.host` thêm `"sale"` (để bounce Sale-thuần từ admin → sale khi flag ON, soi chiếu teacher); thêm cờ `isSaleOnly = authed && effectiveRoles mọi phần tử ∈ {SALES_CSM}` (như `isTeacherOnly`); nhánh admin-host: `if (saleSiteOn && isSaleOnly) redirectHost sale`.
- **Rủi ro & chốt:** khách chưa login vào `/nhap-lieu.html` **không** được bounce `/login` (phải whitelist path tĩnh **trước** cổng auth); tab MISA trong app nhúng **iframe** tới wrapper `/sale/form-sale-nhap.html` (cùng origin, sau auth) → không lỗi khung; thank-you của form là **NỘI BỘ** `sale.satarobo.vn/thank-you` (chỉ lưu ý RedirectURL đang là `http://` — xem §7 tab 6).

**Phương án B — subdomain mới `tuvan.satarobo.vn` (`hostKind: "consult"`):** cách ly tuyệt đối public↔auth (form MISA giữ nguyên ở `sale.`, site auth ở `tuvan.`). An toàn hơn nhưng **thêm 1 host** + DNS/Vercel domain, và "MISA thành 1 tab" khi đó là **iframe cross-subdomain** (vẫn được, cùng site). **Đã loại (16/07/2026)** — giữ làm phương án dự phòng; nếu sau này cần tách hẳn entry quảng cáo, đổi sang B chỉ đụng §2.1 + P6/P7.

> **CHỈ sửa `lib/auth/route-policy.ts` + `route-policy.test.ts`.** Bảng `host×role` phải phủ: Sale-thuần vào app · kiêm nhiệm bounce admin · GV/PARENT bounce đúng khu · path tĩnh vẫn public · flag OFF → host sale phục vụ MISA như cũ.

### 2.2 Route group & shell (clone site GV)

`app/(sale)/sale/` — **clone song song** `app/(teacher)/teacher/`:
- `_components/` : `app-shell`, `sidebar` + `sidebar-nav` + `nav-config`, `topbar`, `user-menu`, `theme-toggle`, `logo` (nhân bản, đổi import + tiền tố `/teacher`→`/sale`).
- `_components/ui/` : 8 primitive (`data-table`, `page-header`, `stat-card`, `list-toolbar`, `empty-state`, `search-input`, `status-pill`, `session-status-pill`) — dùng gần **nguyên xi**, chỉ đổi từ điển `StatusPill` sang domain Sale (LeadStatus/Trial/Payment).
- `layout.tsx` : RSC `force-dynamic`, `metadata.robots noindex`, `import './sale.css'`, gate 3 tầng + liveness `scopedDb(actor).user.findUnique`.
- **Data-fetch tách `lib/sale/*`** (`dashboard.ts`, `today.ts`, `commission.ts`, `trial-week.ts`, `pending-close.ts`, `care-tasks.ts`, `catalog.ts`…) — page chỉ gọi 1–2 helper; **mọi query qua `scopedDb(actor)`**, không import `@/lib/db` trần (ESLint chặn trong `app/(sale)/**`).

### 2.3 Theme (QĐ-2)

`sale.css` scoped `.sale-root`: token CSS var **chỉ** dưới `.sale-root` (không đụng `:root` global → sang admin không dính theme). `--primary`/`--ring`/nav-active = **tím `#7C3AED`** (dark: violet-400 sáng hơn). **Giữ nguyên thang ngữ nghĩa** `emerald=thành công / amber=chờ / red=quá hạn·lỗi / blue=info` cho `StatusPill`. `SaleThemeRoot` (đổi từ `TeacherThemeRoot`), storage key `sale-theme`, gắn `.dark` lên chính `div.sale-root` (không next-themes). Logo giữ asset thật (quy tắc 1-màu chỉ áp accent UI, không áp logo).

### 2.4 Feature flag (2-phase)

`isSaleSiteEnabled()` trong `lib/flags.ts` — `SALE_SITE_ENABLED` **mặc định OFF** (`process.env.SALE_SITE_ENABLED === "true"`). OFF: Sale làm trên admin, host `sale` phục vụ MISA tĩnh như hiện tại. ON: Sale-thuần vào site. **Phụ thuộc:** nút Chốt cần `isConvertV2Enabled()` (đang ON); nếu wire RBAC v2 phải chờ flip **#09** (trước đó gate bằng `can()` v1 để không đẻ lệch shadow). Flip sau khi P0–P6 đủ tính năng + shadow sạch.

### 2.5 RBAC, scope & PII

- **Gate 3 tầng (copy teacher):** `auth()`→`/login` · `isSaleSiteEnabled()` OFF→khu cũ · role gate (`SALES_CSM`) → else khu đúng · + liveness (`isActive`/`deletedAt`/`tokenVersion`).
- **Cách ly cơ sở KHÔNG do role** mà do `scopedDb(actor)` ép ở tầng query (CS1 không thấy CS2). Test CI **bắt buộc** phủ CS1≠CS2.
- **`leads:view-own`** = mỗi Sale chỉ thấy lead `assignedToId=mình` + lead **dùng chung** (`isSharedWithTeam`) cùng cơ sở (BGĐ câu 10). `leads:view-all` **chỉ** SUPER_ADMIN/CENTER_MANAGER/MARKETING.
- **PII ở SERVER:** `maskLeadPiiFields`/`canViewLeadPii` — SALES_CSM có `leads:view-pii` + `canViewParentContact` → thấy đầy đủ SĐT/email; **không** chỉ ẩn ở client.
- **Mutation 3 lớp:** `checkPermission(action)` → `passesScope(model, before, actor)` (chống IDOR liên cơ sở) → `actorMayMutateLead` (owner hoặc view-all).
- **Bản đồ quyền `SALES_CSM`** (đã verify code) + **2 khoảng trống phải vá** (orders/commission) ở §9.

### 2.6 Quy ước **Trang vs Popup** (chuẩn hoá cho toàn site — trả lời trực tiếp yêu cầu user)

Mỗi thành phần ở §7 ghi rõ **Trang riêng / Popup / Nhúng** cho từng thao tác. Quy ước mặc định khi tài liệu để "hoặc":

| Loại thao tác | Dạng | Ví dụ |
|---|---|---|
| Luồng **nhiều bước / nhập nặng** (tạo lead, import, **chốt/convert**, ghi danh) | **Trang riêng** (có deep-link) | `/sale/leads/new`, `/sale/leads/[id]/convert`, `/sale/ghi-danh/moi` |
| **Chi tiết 1 bản ghi** cần chia sẻ link | **Trang riêng** `/[id]` | `/sale/leads/[id]`, `/sale/hoc-vien/[id]` |
| **Thao tác nhanh** trên 1 dòng (ghi hoạt động, chuyển lead, tick việc xong, duyệt đơn) | **Popup** = **Sheet trượt phải** (desktop) / **Dialog** (mobile) | Ghi CALL/MESSAGE/NOTE, TransferDialog, duyệt yêu cầu PH |
| **Đổi trạng thái tại chỗ** (kéo-thả Kanban, toggle) | **Inline** (không popup/không trang) | `updateLeadStatus`, `toggleLeadShareAction` |
| **Tra cứu danh mục** (gói học/voucher/sản phẩm/lớp) | Danh sách + **Sheet** chi tiết (không cần deep-link) | `/sale/goi-hoc`, `/sale/uu-dai` |
| **Form MISA** hiện có | **Nhúng (iframe)** | `/sale/nhap-khach-hang` |

> **Chốt các điểm mập mờ** (critique): "Đánh dấu việc xong" = **inline** nút `useTransition` (không dialog). "Sửa lead" = **Trang** `/sale/leads/[id]/edit`. "Đổi ảnh đại diện" = **Dialog** riêng. Chi tiết gói học/sản phẩm/lớp = **Sheet** (chỉ nâng thành route `/[id]` khi có nhu cầu deep-link thật). "Ghi nhận thanh toán" = **Popup (Sheet)** trên trang `/sale/thu-phi`.

---

## §3. Bảng route chuẩn (canonical route map) — **NGUỒN ĐÚNG DUY NHẤT**

> Nếu bất kỳ đường dẫn nào trong §7 mâu thuẫn với bảng này → **bảng này thắng**. Đăng ký đúng các slug này vào `lib/auth/page-gates.ts` (`PAGE_GATES` — nguồn route-gate duy nhất) để **menu ≡ cổng** (không dead-link, không hở URL).

| # | Nhóm | Tab | Đường dẫn | Loại | Quyền gate |
|---|---|---|---|---|---|
| 1 | Tổng quan | **Bảng việc hôm nay** | `/sale` | Trang riêng | — (chỉ role gate) |
| 2 | Lead & Tư vấn | **Lead của tôi (Kanban)** | `/sale/leads` | Trang + popup | `leads:view-own` |
| 3 | Lead & Tư vấn | **Chi tiết lead** | `/sale/leads/[id]` | Trang + popup | `leads:view-own` `leads:edit` |
| 4 | Lead & Tư vấn | **Tạo lead thủ công** | `/sale/leads/new` | Trang riêng | `leads:create` |
| 5 | Lead & Tư vấn | **Nhập từ Excel** | `/sale/leads/import` | Trang riêng | `leads:import` |
| 6 | Lead & Tư vấn | **Nhập khách hàng (MISA)** | `/sale/nhap-khach-hang` | Nhúng (embed) | `leads:create` |
| 7 | Lead & Tư vấn | **Hộp thư Messenger (L1)** ⏸ *hoãn sau v1 (§10-Q10)* | `/sale/messenger` | Trang riêng | `leads:view-own` |
| 8 | Học thử / Trải nghiệm | **Lịch học thử tuần** | `/sale/hoc-thu` | Trang + popup | `trials:view` `trials:manage` |
| 9 | Học thử / Trải nghiệm | **Lớp trải nghiệm** | `/sale/lop-trai-nghiem` | Trang + popup | `trials:view` `trials:manage` |
| 10 | Học thử / Trải nghiệm | **Kết quả chờ chốt** | `/sale/cho-chot` | Trang riêng | `trials:view` `leads:view-own` |
| 11 | Ghi danh & Thu phí | **Chốt lead (Chuyển đổi)** | `/sale/leads/[id]/convert` | Trang riêng | `students:create` `enrollments:create` |
| 12 | Ghi danh & Thu phí | **Đơn hàng** | `/sale/don-hang` | Trang + popup | `orders:view` |
| 13 | Ghi danh & Thu phí | **Ghi nhận thanh toán** | `/sale/thu-phi` | Trang + popup | `payments:record` `orders:view` |
| 14 | Ghi danh & Thu phí | **Ghi danh trực tiếp** | `/sale/ghi-danh` | Trang + popup | `enrollments:view-all` `enrollments:create` |
| 15 | Ghi danh & Thu phí | **Chuyển lớp / cơ sở** | `/sale/chuyen-lop` | Trang riêng | `enrollments:create` |
| 16 | Chăm sóc & Tái tục (CSKH) | **Cảnh báo rủi ro** | `/sale/canh-bao-rui-ro` | Trang riêng | `parent-requests:manage` `students:view-all` |
| 17 | Chăm sóc & Tái tục (CSKH) | **Việc chăm sóc HV** | `/sale/cham-soc-hv` | Trang riêng | `parent-requests:manage` |
| 18 | Chăm sóc & Tái tục (CSKH) | **Yêu cầu phụ huynh** | `/sale/yeu-cau-ph` | Trang + popup | `parent-requests:manage` |
| 19 | Chăm sóc & Tái tục (CSKH) | **Sắp hết khoá (tái tục)** | `/sale/sap-het-khoa` | Trang riêng | `enrollments:view-all` |
| 20 | Chăm sóc & Tái tục (CSKH) | **Học viên** | `/sale/hoc-vien` | Trang + popup | `students:view-all` `students:edit` |
| 21 | Kinh doanh của tôi | **Hoa hồng của tôi** | `/sale/hoa-hong` | Trang riêng | `commission:view-own` |
| 22 | Kinh doanh của tôi | **Báo cáo** | `/sale/bao-cao` | Trang riêng | `leads:view-own` `trials:view` `enrollments:view-all` |
| 23 | Danh mục & Tra cứu | **Gói học / Bảng giá** | `/sale/goi-hoc` | Trang riêng | `course-packages:view` |
| 24 | Danh mục & Tra cứu | **Ưu đãi / Voucher** | `/sale/uu-dai` | Trang riêng | `vouchers:view` |
| 25 | Danh mục & Tra cứu | **Sản phẩm & Học cụ** | `/sale/san-pham` | Trang riêng | `products:view` `kits:view` |
| 26 | Danh mục & Tra cứu | **Lớp học (tham chiếu)** | `/sale/lop-hoc` | Trang riêng | `classes:view-all` |
| 27 | Cá nhân | **Hồ sơ cá nhân** | `/sale/ho-so` | Trang riêng | — (chỉ role gate) |
| 28 | Cá nhân | **Chấm công của tôi** | `/sale/cham-cong` | Trang riêng | `hr_attendance:checkin` |

**Route con (deep-route) đã dùng nhất quán trong §7:**
`/sale/leads/new` · `/sale/leads/import` · `/sale/leads/import/registered` · `/sale/leads/[id]` · `/sale/leads/[id]/edit` · `/sale/leads/[id]/convert` · `/sale/leads/[id]/convert/conflicts` (điều hướng khi `ConvertConflict`) · `/sale/lop-trai-nghiem/[id]` · `/sale/hoc-vien/[id]` · `/sale/ghi-danh/moi` · `/sale/don-hang/moi` · path tĩnh công khai (form MISA bản CŨ, giữ cho Ads): `/nhap-lieu.html`, `/thank-you.html` · file tĩnh nội bộ SAU auth: `/sale/form-sale-nhap.html` (wrapper "Form nhập liên hệ từ Sale" — src iframe của tab 6).

---

## §4. Danh sách công việc — **liệt kê tất cả việc sẽ làm** (P0 → P7)

> Chia 8 phase, additive, verify (`typecheck+lint+build` + smoke 375px) mỗi 3–5 file. Flip flag ở cuối cùng.

### P0 — Khung / host / flag / theme
- [ ] **T1.** Clone route group app/(sale)/sale từ app/(teacher)/teacher: nhân bản _components/ (app-shell, sidebar, sidebar-nav, topbar, user-menu, theme-toggle, logo) + _components/ui/ (8 primitive) — _Giữ nguyên kiến trúc 2 cột sidebar fixed + drawer mobile + topbar sticky; đổi import path_
- [ ] **T2.** Tạo sale.css: đổi .teacher-root→.sale-root, --primary/--ring/nav-active = **tím #7C3AED** (dark: violet-400) theo QĐ-2, giữ thang ngữ nghĩa emerald/amber/red/blue, @media print nền sáng — _Token CHỈ dưới .sale-root, không đụng :root global_
- [ ] **T3.** Đổi TeacherThemeRoot→SaleThemeRoot: storage key 'sale-theme', hook useSaleTheme, gắn '.dark' lên div.sale-root (không next-themes) — _Sáng/Tối/Hệ thống, matchMedia_
- [ ] **T4.** Thêm isSaleSiteEnabled() vào lib/flags.ts — SALE_SITE_ENABLED mặc định OFF (process.env === 'true') — _2-phase như teacher; doc rõ ON/OFF + rollback bằng env_
- [ ] **T5.** Viết lib/auth/permissions.ts helper role gate: hasRole(user,'SALES_CSM') / hasStaffRole; role vào site **CHỐT theo QĐ-3 = chỉ SALES_CSM thuần** (`isSaleOnly`), kiêm nhiệm bounce admin; HO_SALE/MARKETING ngoài v1 — _Song song hasRole('TEACHER') của GV_
- [ ] **T6.** Tạo app/(sale)/sale/layout.tsx RSC 3 tầng gate: (1) auth()→/login, (2) isSaleSiteEnabled() OFF→khu cũ, (3) role gate→khu đúng; liveness scopedDb(actor).user.findUnique (isActive/deletedAt/tokenVersion); force-dynamic + robots noindex; import sale.css — _Copy khuôn teacher layout_
- [ ] **T7.** Viết nav-config.ts Sale (8 nhóm ở navGroups) + đổi tiền tố isNavItemActive '/teacher'→'/sale'; lọc tab theo can(user, action) như sidebar admin — _Giữ interface NavItem/NavGroup; menu ≡ cổng để tránh dead-link_
- [ ] **T8.** Đổi StatusPill sang từ điển domain Sale (LeadStatus 15 nhãn VI) + SessionStatusPill sang trạng thái Trial/Payment — _Nhận cả chữ thường lẫn enum HOA_

### P1 — Lead & Tư vấn
- [ ] **T9.** Trang /sale/leads: Kanban 14 cột (mặc định) + view Bảng, kéo-thả gọi updateLeadStatus, badge SLA (quá hạn task, im lặng >24h, chưa liên hệ 3h), lọc/tìm — _Đọc qua scopedDb, PII theo view-pii; tái dùng action hiện có_
- [ ] **T10.** Trang /sale/leads/[id] chi tiết: header+SĐT bấm gọi, note bàn giao, loại đơn dự kiến, LeadChild, khối thanh toán, timeline; popup TransferDialog/AssignSelect/ShareToggle/LeadActivityPanel — _Tái dùng nguyên khối server actions (updateLeadStatus, addLeadActivity, transferLead, assignLeadToSaleAction)_
- [ ] **T11.** KHÔI PHỤC panel 'Việc cần làm/follow-up' (LeadTask) đã gỡ LD6: addLeadTask/completeLeadTask + badge quá hạn — nguồn 'quá hạn follow-up' cho dashboard — _UI mới, logic action còn nguyên_
- [ ] **T12.** Trang /sale/leads/new (createLeadManual) + /sale/leads/import + import/registered — _Chống trùng SĐT, auto-chia_
- [ ] **T13.** Bổ sung hiển thị timestamp phễu SR.QD.217 (qualifiedAt/assignedAt/firstContactAt) trên card/detail để thấy SLA — _Dữ liệu có sẵn trên Lead, UI admin chưa show_

### P2 — Học thử / Trải nghiệm
- [ ] **T14.** Trang /sale/hoc-thu (Lịch học thử tuần): gộp TrialClassSession V2 + TrialClass V1 của lead mình theo ngày/giờ; sửa lịch/phòng; xếp con vào lớp — _Tái dùng scopedDb.trialClassSession/trialClass; enrollLeadChildAction_
- [ ] **T15.** Trang /sale/lop-trai-nghiem + chi tiết: xếp/gỡ con (searchTrialCandidatesAction, enrollLeadChildAction/unenroll); ẨN nút điểm danh/gán GV/chấm rubric (không có quyền) — _Chỉ read-only kết quả + thao tác Sale được phép_
- [ ] **T16.** Trang /sale/cho-chot (Kết quả trial chờ chốt): list ATTENDED chưa đăng ký + điểm rubric/nhận xét GV read-only + nút Chốt — _Cần gate cho Sale xem rubric (openQuestion)_

### P3 — Chuyển đổi / Ghi danh / Thu phí
- [ ] **T17.** Trang /sale/leads/[id]/convert: form Convert v2 (submitConvertV2) — PH+HV+consent+học phí 1/2 đợt; gate isConvertV2Enabled + PAYMENT_REQUIRED; điều hướng ConvertConflict — _Tái dùng convertLeadV2, KHÔNG nhân bản logic_
- [ ] **T18.** Trang /sale/don-hang + tạo đơn gắn lead (createOrderManualAction, previewVoucherAction) — GIẢI QUYẾT GAP orders:manage trước (xem rbacNotes) — _Voucher/chiết khấu đặt ở Order, convert set finalPrice=listPrice_
- [ ] **T19.** Trang/section /sale/thu-phi ghi nhận thanh toán (recordPaymentAction, RECORDED) + card điều kiện chốt (getLeadPaymentSummary/LeadPaymentCard); hiển thị 'chờ kế toán xác nhận' — _KHÔNG hiện confirm/hoàn tiền/công nợ_
- [ ] **T20.** Trang /sale/ghi-danh (enrollStudent) + /sale/ghi-danh/moi + /sale/chuyen-lop (tạo yêu cầu chuyển) — _Serializable re-check sĩ số; loại lớp Hội sở_

### P4 — CSKH / Yêu cầu / Hoa hồng
- [ ] **T21.** Trang /sale/canh-bao-rui-ro (resolve/escalate) + /sale/cham-soc-hv (completeCareTask, filter assignedToId=me) — _Gate parent-requests:manage; scopedDb+passesScope_
- [ ] **T22.** Trang /sale/yeu-cau-ph: filter chip loại+trạng thái, RequestRow inline-expand duyệt/từ chối; nhánh báo vắng resolveAbsence (học bù/đánh vắng) — _Gọi lại server action cũ, không viết lại logic tài chính-vận hành_
- [ ] **T23.** Trang /sale/sap-het-khoa (getNearingEndEnrollments) — BỌC scopedDb trước (hiện db trần → nguy cơ leak liên cơ sở) trước khi mở cho Sale thuần — _Widget hạng nhất trên dashboard_
- [ ] **T24.** Thêm permission commission:view-own vào matrix v1 + seed-roles v2 (parity) + màn /sale/hoa-hong read-only lọc CommissionLine.recipientId=me — _KHÔNG mở /admin/crm/commission (gate payments:manage). Cập nhật rbac-parity.test.ts_

### P5 — Dashboard / Báo cáo
- [ ] **T25.** Trang /sale (Bảng việc hôm nay) theo dashboardSpec: 5 KPI + 6 widget; helper lib/sale/today.ts + dashboard.ts gọi scopedDb; KHÔNG kéo 5-KPI ManagerDashboard — _Không Recharts — dùng CSS bar/bảng shadcn_
- [ ] **T26.** Trang /sale/bao-cao: báo cáo lead của tôi + phễu trial + churn trong scope — _Không Recharts trong site này (client-side split); dùng bảng/CSS_

### P6 — Nhúng form MISA
- [ ] **T27.** Tạo wrapper tĩnh MỚI `public/sale/form-sale-nhap.html`: khung trang tối giản + dán NGUYÊN KHỐI snippet "Form nhập liên hệ từ Sale" (nguồn `satarobo-sale/form-sale-nhap-snippet.html`) + script lớp bao: prefill (`?nv=`→CustomField26, `?cs=`→CustomField17, tuỳ chọn MailingProvinceID=7480 Đà Nẵng) + guard SĐT tạm (chặn submit khi CustomField15 trống) — _KHÔNG sửa bên trong snippet; file cũ nhap-lieu.html giữ nguyên cho Ads_
- [ ] **T27b.** Trang /sale/nhap-khach-hang: RSC đọc `Employee.employeeCode` + `Center.code` (scopedDb) → dựng src iframe wrapper; nút "Nhập khách mới" (reload iframe) + "Mở form gốc" — _kind Nhúng (embed); gate leads:create; thank-you nội bộ trong khung_
- [ ] **T27c.** Phối hợp owner form MISA (không blocker build, guard tạm đã che): (a) config bắt buộc `CustomField15` (SĐT PH) rồi xuất lại snippet → thay nguyên khối + gỡ guard tạm; (b) đổi RedirectURL `http://`→`https://sale.satarobo.vn/thank-you`; (c) cân nhắc cập nhật entry public nhap-lieu.html theo bộ trường mới — _3 việc config phía MISA/marketing_
- [ ] **T28.** decideRoute() nhánh hostKind 'sale': phân path tĩnh (/nhap-lieu, /thank-you → rewrite file, giữ entry công khai chạy Ads) vs path app (đòi auth+SALES_CSM → rewrite '/*'→'/sale/*'); role khác bounce khu đúng — _CHỈ sửa route-policy.ts, KHÔNG proxy.ts_

### P7 — Wiring host / RBAC / e2e / verify
- [ ] **T29.** Cập nhật lib/auth/page-gates.ts thêm gate route /sale/* (nguồn duy nhất route-gate) để menu ≡ cổng — _Chống dead-link & hở URL_
- [ ] **T30.** Cập nhật route-policy.test.ts bảng host×role cho sale.satarobo.vn (SALES_CSM vào app, GV/PARENT/staff khác bounce, path tĩnh vẫn public) — _Unit test decideRoute_
- [ ] **T31.** Viết e2e Playwright site Sale (Postgres local): login SALES_CSM CS1 không thấy lead CS2 (scopedDb), Kanban đổi trạng thái, convert guard payment, MISA embed render, flag OFF→bounce — _Phủ cách ly cơ sở + gate 3 tầng_
- [ ] **T32.** Verify: pnpm typecheck && lint && build PASS + smoke localhost + mobile 375px; flip SALE_SITE_ENABLED sau khi đủ tính năng + shadow — _Rollback bằng env_

**2 việc "gate" phải làm TRƯỚC P0** (QĐ-1/QĐ-3 đã chốt ở §0.3, không còn treo): (a) vá **QĐ-4 `orders:create`** + **QĐ-5 `commission:view-own`** (parity 3 file) trong **1 PR RBAC riêng**; (b) khoá **Bảng route chuẩn §3** vào `PAGE_GATES` + task P7 "kiểm dead-link toàn site Sale".

---

## §5. Cấu trúc Sidebar (IA — 8 nhóm / 28 tab)

Sidebar dọc (clone GV): desktop cố định trái, mobile drawer. Nhóm gập/mở; mục sáng theo `pathname` (khớp cả `/sale/*` lẫn clean URL). Thứ tự nhóm theo **tần suất dùng của tư vấn viên**. Mỗi tab lọc theo `can(actor, permission)` — thiếu quyền thì ẩn.

**1. Tổng quan**
- Bảng việc hôm nay · `/sale` · _Trang riêng_ — Trang chủ hướng hành động theo SLA: KPI cá nhân + việc/lịch hẹn hôm nay + trial chờ chốt + phễu tuần + tái tục + churn

**2. Lead & Tư vấn**
- Lead của tôi (Kanban) · `/sale/leads` · _Trang + popup_ — Màn hình chính: Kanban 14 cột pipeline (mặc định) + view Bảng, kéo-thả đổi trạng thái, badge SLA/quá hạn, lọc nguồn/ngày/tìm tên-SĐT
- Chi tiết lead · `/sale/leads/[id]` · _Trang + popup_ — Trung tâm chăm sóc 1 lead: header trạng thái + SĐT bấm gọi, note bàn giao, loại đơn dự kiến, N con (LeadChild), xếp học thử, khối thanh toán, nút Chuyển đổi, timeline hoạt động; popup transfer/assign/share/ghi-tương-tác
- Tạo lead thủ công · `/sale/leads/new` · _Trang riêng_ — Thu lead tại sự kiện/trung tâm: PH/SĐT/con/khoá/nguồn, chống trùng SĐT, tự auto-chia
- Nhập từ Excel · `/sale/leads/import` · _Trang riêng_ — Import nhiều lead (sự kiện) + import danh sách 'đã đăng ký' theo tháng, validate + chống trùng
- Nhập khách hàng (MISA) · `/sale/nhap-khach-hang` · _Nhúng (embed)_ — NHÚNG **"Form nhập liên hệ từ Sale"** (snippet user cung cấp 16/07, bọc wrapper tĩnh mới `form-sale-nhap.html`, giữ snippet nguyên khối) qua iframe + prefill mã NV/cơ sở + guard SĐT tạm — không viết lại luồng MISA
- Hộp thư Messenger (L1) · `/sale/messenger` · _Trang riêng_ — **⏸ HOÃN sau v1 (đã chốt §10-Q10):** L1 là việc HO_SALE trực Page HO, Sale cơ sở làm từ L2 trở đi → v1 KHÔNG render tab này trong nav; L1 giữ ở `/admin/crm/messenger`

**3. Học thử / Trải nghiệm**
- Lịch học thử tuần · `/sale/hoc-thu` · _Trang + popup_ — Gộp TrialClassSession (V2) + TrialClass SCHEDULED/CONFIRMED (V1) của lead mình theo ngày/khung giờ; sửa lịch/phòng/ghi chú; xếp con vào lớp trải nghiệm ngay tại card
- Lớp trải nghiệm · `/sale/lop-trai-nghiem` · _Trang + popup_ — Danh sách + tạo lớp trải nghiệm N buổi, sĩ số used/capacity; chi tiết: tìm & xếp/gỡ con (Sale KHÔNG thấy nút điểm danh/gán GV/chấm rubric — không có quyền)
- Kết quả chờ chốt · `/sale/cho-chot` · _Trang riêng_ — Inbox chốt đơn: HV trialStatus=ATTENDED chưa đăng ký, kèm điểm rubric + nhận xét GV (read-only) + nút follow-up/Chốt

**4. Ghi danh & Thu phí**
- Chốt lead (Chuyển đổi) · `/sale/leads/[id]/convert` · _Trang riêng_ — Chốt deal Convert v2: tạo PH+HV+ghi danh+consent+học phí 1/2 đợt ATOMIC; guard PAYMENT_REQUIRED; giá đọc từ DB
- Đơn hàng · `/sale/don-hang` · _Trang + popup_ — Tạo/xem Order gắn lead (áp voucher) làm tiền đề ghi nhận thanh toán → đủ điều kiện convert. GAP: SALES_CSM thiếu orders:manage — cần cấp orders:manage HOẶC action orders:create riêng (xem rbacNotes)
- Ghi nhận thanh toán · `/sale/thu-phi` · _Trang + popup_ — Sale GHI NHẬN khoản thu (RECORDED) mở khoá convert; auto-advance lead→REGISTERED; hiển thị 'chờ kế toán xác nhận' — KHÔNG cho tự confirm/hoàn tiền/xuất phiếu thu
- Ghi danh trực tiếp · `/sale/ghi-danh` · _Trang + popup_ — Đăng ký HV đã tồn tại vào lớp (ngoài luồng convert); re-check sĩ số Serializable + prerequisite
- Chuyển lớp / cơ sở · `/sale/chuyen-lop` · _Trang riêng_ — Sale TẠO yêu cầu chuyển lớp/cơ sở (không có enrollments:transfer → QL cơ sở duyệt)

**5. Chăm sóc & Tái tục (CSKH)**
- Cảnh báo rủi ro · `/sale/canh-bao-rui-ro` · _Trang riêng_ — 6 loại churn (nghỉ liên tiếp/vượt ngưỡng/không nộp bài/cần hỗ trợ/sắp hết khoá/công nợ) → resolve/escalate/tạo việc chăm sóc
- Việc chăm sóc HV · `/sale/cham-soc-hv` · _Trang riêng_ — Hàng đợi StudentCareTask assignedToId=me (Sale thuần chỉ thấy việc của mình), tick hoàn tất
- Yêu cầu phụ huynh · `/sale/yeu-cau-ph` · _Trang + popup_ — 7 loại đơn PH (báo vắng/học bù/chuyển lớp/chuyển cơ sở/bảo lưu/đổi đồng ý/khác); duyệt/từ chối inline-expand; báo vắng gắn buổi đi resolveAbsence (xếp học bù/đánh vắng)
- Sắp hết khoá (tái tục) · `/sale/sap-het-khoa` · _Trang riêng_ — HV còn ≤5 buổi → nhắc gia hạn; số buổi còn lại + ngày kết thúc dự kiến
- Học viên · `/sale/hoc-vien` · _Trang + popup_ — Tra cứu/sửa hồ sơ HV toàn cơ sở (không sửa mã HV); tra lịch sử để tư vấn tái tục

**6. Kinh doanh của tôi**
- Hoa hồng của tôi · `/sale/hoa-hong` · _Trang riêng_ — Read-only bảng kê CommissionLine.recipientId=me theo kỳ (KHÔNG mở /admin/crm/commission vì gate payments:manage cho duyệt/mở lại/export toàn hệ thống). CẦN permission mới commission:view-own
- Báo cáo · `/sale/bao-cao` · _Trang riêng_ — Báo cáo lead (của mình), phễu trial→đăng ký, churn/rời bỏ — trong tầm scope Sale

**7. Danh mục & Tra cứu**
- Gói học / Bảng giá · `/sale/goi-hoc` · _Trang riêng_ — Tra cứu CoursePackage (Sata1-8/Combo) + giá để tư vấn (chỉ xem)
- Ưu đãi / Voucher · `/sale/uu-dai` · _Trang riêng_ — Tra cứu mã khuyến mãi để tư vấn/áp khi tạo đơn (chỉ xem)
- Sản phẩm & Học cụ · `/sale/san-pham` · _Trang riêng_ — Tra cứu kit/sản phẩm bán-thuê để tư vấn (chỉ xem)
- Lớp học (tham chiếu) · `/sale/lop-hoc` · _Trang riêng_ — Xem danh sách lớp toàn cơ sở để tư vấn/xếp chỗ (classes:view-all, không tạo/sửa)

**8. Cá nhân**
- Hồ sơ cá nhân · `/sale/ho-so` · _Trang riêng_ — Xem/sửa hồ sơ bản thân + đăng xuất (qua UserMenu)
- Chấm công của tôi · `/sale/cham-cong` · _Trang riêng_ — Check-in ca của chính mình + gửi yêu cầu chỉnh công (không duyệt, không xem tổng hợp)

**Trang chủ `/sale` — "Bảng việc hôm nay"** (chi tiết ở §7 tab 1): 5 thẻ KPI cá nhân (Lead đang mở · Cần liên hệ gấp SLA-3 · Quá hạn follow-up · Chốt tháng/tỷ lệ · Hoa hồng tạm tính) + 6 widget hành động (Việc & lịch hẹn hôm nay · Trial chờ chốt · Phễu lead tuần · Sắp hết khoá · Cảnh báo churn · Truy cập nhanh). **KHÔNG** đưa doanh thu/mục tiêu/công nợ **cơ sở** (thuộc ManagerDashboard, gate `payments:manage`).

---

## §6. Thành phần dùng chung (shared components)

| Thành phần | Loại | Mô tả |
|---|---|---|
| **AppShell (Sale)** | Shell | Clone app-shell.tsx: 2 cột sidebar fixed desktop + drawer mobile (state drawerOpen) + topbar + main max-w-7xl; bọc SaleThemeRoot + Toaster sonner |
| **Sidebar / SidebarContent + SidebarNav** | Shell | SidebarContent (Logo+nav) tái dùng cho aside desktop lẫn drawer; SidebarNav render nhóm gập/mở, active theo pathname (isNavItemActive khớp /sale/* lẫn clean URL) |
| **Topbar** | Shell | Sticky h-16; nút Menu (mobile) + ThemeToggle + UserMenu. KHÁC GV: nên BẬT lại chuông thông báo + ô tìm kiếm vì Sale có nguồn việc thật (lead/quá hạn) |
| **UserMenu** | Dropdown | Avatar initials → Hồ sơ cá nhân + Đăng xuất (`logoutToGate()` → cổng login chung satarobo.vn/login) |
| **SaleThemeRoot + ThemeToggle** | Provider | Context {theme,resolved,setTheme}, localStorage 'sale-theme', .dark trên .sale-root; light/dark/system |
| **Logo** | Shell | Asset thật /brand/logo-satarobo.png link về /sale |
| **8 UI primitive (_components/ui)** | UI primitive | DataTable<T>, EmptyState/SuccessBanner, ListToolbar, PageHeader, SearchInput, StatCard (tone brand=tím #7C3AED), StatusPill (đổi từ điển LeadStatus), SessionStatusPill (Trial/Payment) — clone gần nguyên xi |
| **Chuông thông báo (badge fan-out)** | Shell widget | Theo mẫu portal: Promise.all([lead mới, quá hạn follow-up, trial chờ chốt]) mỗi cái .catch(()=>0), cache 60s, cắt '9+'; gắn badge CHỈ ở mục cần chú ý |
| **Ô tìm kiếm toàn cục** | Shell widget | Tìm nhanh lead theo tên PH/SĐT/tên con trong scope (scopedDb + PII mask); khác GV (GV bỏ search vì không nguồn) |
| **SiteSwitcher (đổi cơ sở)** | Dropdown | Theo mẫu portal ProfileSwitcher: setActiveCenter(centerId) server action ghi cookie ký httpOnly + assertCanAccessCenter; CM đa cơ sở thấy dropdown, Sale 1 cơ sở thấy nhãn tĩnh, 0 quyền ẩn. Cookie chỉ CHỌN trong các cơ sở user có quyền, KHÔNG là nguồn quyền (scope thật từ scopedDb) |
| **Site-switcher giữa các site (theo role)** | Dropdown | Trong UserMenu: nếu user kiêm nhiệm (SALES_CSM+CENTER_MANAGER/TEACHER) → link nhảy sang admin/teacher host |
| **Dialog dùng lại từ admin leads** | Dialog | TransferDialog, AssignSelect, ShareToggle, LeadActivityPanel (ghi CALL/MESSAGE/NOTE), LeadChildrenManager, EnrollLeadChild (window.confirm override) — bọc UI mới gọi lại server action đã gate |
| **LeadPaymentCard + Convert form** | Component | getLeadPaymentSummary badge 'đủ điều kiện chốt'; ConvertForm (submitConvertV2) tái dùng |
| **RequestRow (inline-expand)** | Component | Yêu cầu PH: mỗi dòng bung inline textarea + nút duyệt/từ chối; nhánh báo vắng 3 nút (học bù/đánh vắng có-không phép) — mobile-first, không modal |

---

## §7. Chi tiết TỪNG thành phần (28 tab)

> Mỗi tab: **Mục đích · Loại màn hình (Trang/Popup/Nhúng) · Đường dẫn · Bố cục · Dữ liệu (model + PII + scopedDb) · Thao tác (bảng: Trang/Popup + quyền + server action tái dùng) · Trạng thái (rỗng/loading/lỗi/không-quyền) · Quyền & phạm vi · Ghi chú kỹ thuật (tái dùng/build mới/cạm bẫy)**. Đánh số theo thứ tự sidebar §5.

### 1. Bảng việc hôm nay

- **Mục đích:** Trang chủ mặc định của site Tư vấn tuyển sinh — không phải bảng thống kê mà là "danh sách việc phải làm hôm nay" xếp theo SLA của SR.QD.217: KPI cá nhân + lead cần liên hệ gấp + lịch hẹn/việc đến hạn + học thử chờ chốt + phễu lead tuần + nhắc tái tục + cảnh báo churn của riêng tư vấn viên. Mở ra là biết "gọi ai trước, chốt đơn nào" mà không cần lọc tay.

- **Loại màn hình:** **Trang riêng** (dashboard nhiều widget, RSC). Không có popup thao tác nặng ở tab này — mỗi widget là một danh sách rút gọn mà từng dòng **điều hướng sang trang chi tiết** (mở lead, mở lớp trải nghiệm, mở luồng chốt). Ngoại lệ có 2 thao tác nhanh mở **Sheet/Dialog** ngay tại chỗ để giảm ma sát nhập liệu: (a) "Ghi nhanh hoạt động" (gọi/nhắn/ghi chú) và (b) "Đánh dấu việc xong". Còn lại đều là link sang trang.

- **Đường dẫn:** `/sale` (trang gốc, không route con). Các link đi ra: `/sale/leads/[id]`, `/sale/leads/[id]/convert`, `/sale/hoc-thu`, `/sale/cho-chot`, `/sale/sap-het-khoa`, `/sale/cham-soc-hv`.

- **Bố cục & thành phần chính** (từ trên xuống, tái dùng UI kit clone từ site GV `_components/ui/`):
  - `PageHeader` — tiêu đề "Bảng việc hôm nay" + subtitle ngày + tên tư vấn viên; vùng `actions` bên phải để trống hoặc nút "Tạo lead" (nếu bật).
  - **Hàng KPI cá nhân** — 4–5 `StatCard` (tone `brand`=tím accent Sale, còn lại ngữ nghĩa): *Lead của tôi đang mở* · *Chốt tháng này* · *Tỷ lệ chốt* · *Việc quá hạn* (tone `red` khi >0) · *Hoa hồng tạm tính tháng* (chỉ hiện nếu có `commission:view-own`, xem ghi chú). Tái dùng gần như nguyên khối logic `SalesDashboard` hiện có.
  - **Widget "Cần liên hệ gấp (SLA)"** — `DataTable` rút gọn: lead vừa nhận chưa `firstContactAt` quá 3h (SLA-3) + lead im lặng >24/48h (SLA-4). Cột: Tên PH (mask theo quyền) · SĐT · Trạng thái (`StatusPill`) · "Quá SLA bao lâu" (badge đỏ/amber) · nút thao tác. `EmptyState` tone `green` khi sạch.
  - **Widget "Việc & lịch hẹn hôm nay"** — gộp `LeadTask.dueAt` (đến hạn hôm nay/quá hạn) + buổi học thử hôm nay (`TrialClass`/`TrialClassSession.scheduledAt`). Cột: Giờ · Loại (gọi/hẹn/buổi thử) · HV/PH · nút Xong / Mở.
  - **Widget "Trial chờ chốt"** — HV có `LeadChild.trialStatus=ATTENDED` / lead `TRIAL_ATTENDED` chưa REGISTERED/ENROLLED, kèm điểm rubric + xếp loại (read-only) để gọi follow-up. Mỗi dòng nút "Chốt".
  - **Widget "Phễu lead tuần"** — bảng/thanh nhẹ theo `groupByWeek` (mới vs chuyển đổi) trong scope của tôi. KHÔNG dùng Recharts (site Sale = shadcn thuần); render dạng thanh CSS/`StatCard` mini.
  - **Widget "Nhắc tái tục"** — banner + list HV còn ≤5 buổi (`getNearingEndEnrollments`), link sang trang sắp hết khoá.
  - **Widget "Cảnh báo churn"** — list `StudentRiskAlert` OPEN của HV trong scope, sort severity desc, link sang `/sale/cham-soc-hv`.
  - Mobile: các widget xếp dọc 1 cột (viewport 375px), KPI cuộn ngang được.

- **Dữ liệu hiển thị** (Prisma, qua `scopedDb(actor)` — cách ly cơ sở, và `leads:view-own` lọc `assignedToId = me`):
  - `Lead` (`parentName`/`phone`/`status`/`source`/`assignedToId`/`centerId`/`firstContactAt`/`lastActivityAt`/`qualifiedAt`/`assignedAt`) + `LeadChild`.
  - `LeadTask` (`dueAt`/`completedAt`/`status`) — nguồn "việc đến hạn"/"quá hạn".
  - `TrialClass` (`scheduledAt`/`status`) và `TrialClassSession`/`TrialEnrollment`/`TrialRubricEval` (`totalScore`/`rank`) — trial hôm nay + chờ chốt.
  - `Enrollment` active + `Class`/`Course`/`Attendance`/`Holiday` qua `getNearingEndEnrollments` — nhắc tái tục.
  - `StudentRiskAlert` (`type`/`severity`/`status`) + `StudentCareTask` (assignedToId=me) — churn/chăm sóc.
  - `CommissionLine` (`recipientId=me`, `amount`) — hoa hồng tạm tính (nếu bật).
  - **PII:** SĐT/tên PH-HS/note che ở SERVER qua `maskLeadPiiFields`/`canViewLeadPii`; SALES_CSM có `leads:view-pii` → thấy đầy đủ + link `tel:`. Không tự ẩn ở client.

- **Thao tác (actions):**

| Thao tác | Trang / Popup | Quyền cần | Server action tái dùng |
|---|---|---|---|
| Mở chi tiết lead (click dòng) | **Trang** `/sale/leads/[id]` | `leads:view-own` | — (RSC đọc qua scopedDb) |
| Ghi nhanh hoạt động (CALL/MESSAGE/NOTE) | **Popup** (Sheet/Dialog tại chỗ) | `leads:edit` (owner) | `addLeadActivity` |
| Đánh dấu việc xong (LeadTask) | **Popup/Inline** (nút, `useTransition`) | `leads:edit` (owner) | `completeLeadTask` |
| Chốt / Chuyển đổi | **Trang** `/sale/leads/[id]/convert` | `students:create` + `enrollments:create` (+ flag `CONVERT_V2_ENABLED`) | `submitConvertV2` |
| Mở lớp/kết quả trial | **Trang** `/sale/hoc-thu` hoặc `/sale/lop-trai-nghiem/[id]` | `trials:view` | — (đọc scoped) |
| Xem HV sắp hết khoá | **Trang** `/sale/sap-het-khoa` | `enrollments:view-all` | `getNearingEndEnrollments` |
| Xử lý cảnh báo churn | **Trang** `/sale/cham-soc-hv` / `/sale/canh-bao-rui-ro` | `parent-requests:manage` | `resolveRiskAlert`/`completeCareTask` |

  Nguyên tắc: mọi thao tác *đổi trạng thái nặng* (chốt, xử lý churn, điểm danh trial) đều **rời sang trang chuyên trách** để giữ trang chủ nhẹ + tránh nhân đôi luồng; chỉ *ghi nhật ký* và *tick việc xong* dùng **popup** vì cần thao tác tức thì ngay trong danh sách.

- **Trạng thái:**
  - *Rỗng:* mỗi widget có `EmptyState` riêng — "Cần liên hệ gấp" sạch → banner emerald "Đã liên hệ hết lead đến hạn"; "Trial chờ chốt" rỗng → tone slate "Chưa có học viên chờ chốt"; toàn trang rỗng vẫn giữ hàng KPI.
  - *Loading:* skeleton theo từng widget (Suspense boundary per widget — 1 nguồn chậm không chặn cả trang), fan-out đọc song song `Promise.all` mỗi nguồn `.catch(()=>[])` để 1 query lỗi không vỡ dashboard (pattern portal layout).
  - *Lỗi:* widget lỗi hiển thị thẻ "Không tải được mục này" thay vì crash trang; KPI vẫn render.
  - *Không-có-quyền:* nếu tài khoản lọt vào không có `leads:view-own` → layout gate `/sale` đã redirect về khu đúng trước khi tới page (không render trang trắng).

- **Quyền & phạm vi:**
  - Gate tab: role `SALES_CSM` (layout site Sale gate `hasRole(user,'SALES_CSM')` + flag site Sale bật). Widget-level tự ẩn nếu thiếu quyền tương ứng (KPI hoa hồng cần `commission:view-own`; churn cần `parent-requests:manage`; tái tục cần `enrollments:view-all`).
  - Scope: **OWN** cho lead (`leads:view-own` → chỉ `assignedToId=me` + lead dùng chung cùng cơ sở), **CENTER** cho các nguồn khác (trial/enrollment/risk) nhưng cách ly cơ sở cứng bằng `scopedDb(actor)` (CS1 không thấy CS2). SUPER_ADMIN/HO bypass.

- **Ghi chú kỹ thuật:**
  - **Tái dùng nguyên khối:** component `SalesDashboard` admin hiện có (lead của tôi + phễu tuần + việc cần làm + học thử + banner sắp hết khoá) đã đúng ~90% nhu cầu — clone sang `/sale`, chỉ đổi vỏ UI kit (StatCard/DataTable/PageHeader) và link `/admin/*`→`/sale/*`. KHÔNG viết lại query. Các action `addLeadActivity`, `completeLeadTask`, `submitConvertV2`, `resolveRiskAlert` gọi lại nguyên trạng (đã có guard permission + scopedDb + audit).
  - **Điểm cần build mới:** (1) Tín hiệu SLA trực quan (SLA-3 chưa liên hệ 3h, SLA-4 im lặng >24/48h) — derive từ `firstContactAt`/`lastActivityAt`, hiện admin **chưa hiển thị**; (2) khôi phục UI `LeadTask` (đã gỡ ở LD6) làm nguồn "việc/hẹn hôm nay" + "quá hạn"; (3) KPI hoa hồng cá nhân cần **permission mới `commission:view-own`** + query lọc `CommissionLine.recipientId=me` (chưa tồn tại) — nếu chưa duyệt thì ẩn card này.
  - **Cạm bẫy:**
    - `getNearingEndEnrollments` (`lib/students/renewal.ts`) hiện đọc **`db` trần** (lọc centerId qua tham số) → phải **bọc `scopedDb`** trước khi mở cho Sale thuần, tránh leak liên cơ sở.
    - Chưa có model **Appointment** độc lập → "lịch hẹn hôm nay" phải suy từ `LeadTask.dueAt` + `TrialClass.scheduledAt`; đừng hứa lịch hẹn gọi/gặp riêng.
    - Nút "Chốt" phải kiểm **flag `CONVERT_V2_ENABLED`** trước khi render; luồng convert **chặn nếu chưa có Payment RECORDED** (`PAYMENT_REQUIRED`) — trang chủ chỉ điều hướng, không tự chốt, để tránh nhân đôi guard tiền/transaction.
    - Trang này thuần **đọc** — không đặt logic tiền/enrollment ở đây; mọi ghi tiền/chốt đi qua action atomic có sẵn.

---

### 2. Lead của tôi (Kanban)

**Mục đích:** Màn hình làm việc chính của tư vấn viên (SALES_CSM): xem toàn bộ lead mình phụ trách trên bảng Kanban 14 cột pipeline, kéo-thả để đổi trạng thái, và nhận diện nhanh lead quá hạn SLA cần liên hệ. Đây là "trái tim" công việc hằng ngày của Sale.

**Loại màn hình:** Trang danh sách + popup thao tác. Trang chính `/sale/leads` là Server Component render 2 view (Kanban mặc định + Bảng). Thao tác nặng (mở chi tiết, chốt đơn) điều hướng sang **trang mới**; thao tác nhanh (ghi tương tác, chuyển lead) mở **popup/dialog/sheet** ngay trên card để không rời pipeline. Kéo-thả đổi trạng thái là **inline** (không popup, không chuyển trang) — gọi server action rồi optimistic update cột.

**Đường dẫn:**
- `/sale/leads` — trang chính (tham số `?view=kanban|table`, mặc định `kanban`; `?status=`, `?source=`, `?from=&to=`, `?q=`).
- `/sale/leads/[id]` — trang chi tiết 1 lead (route con, trang riêng — đặc tả ở tab "Chi tiết Lead").
- `/sale/leads/[id]/convert` — trang chốt đơn (trang riêng, tab "Chuyển đổi").

**Bố cục & thành phần chính:**
- **`PageHeader`** (tái dùng UI kit GV): tiêu đề "Lead của tôi" + subtitle đếm tổng lead đang mở; vùng `actions` bên phải chứa nút chuyển đổi view (Kanban ⇄ Bảng) và nút "Tạo lead" (nếu bật — xem tab Tạo lead).
- **Hàng `StatCard`** (4 thẻ, tone semantic): "Lead đang xử lý" (brand/cam-tím), "Chưa liên hệ >3h" (amber, SLA-3), "Im lặng >24h" (red, SLA-4), "Chờ chốt" (blue — AWAITING_DECISION + REGISTERED). Số liệu tính server-side qua `scopedDb`.
- **`ListToolbar`** (tái dùng): `SearchInput` (tìm theo tên PH / SĐT / tên con) + các `Select` filter: Nguồn lead (`source`), Khoảng ngày (tạo/`from-to`), Trạng thái (khi ở view Bảng). Debounce query, đẩy vào searchParams.
- **View Kanban (mới):** 14 cột ngang cuộn (`overflow-x-auto`) theo thứ tự pipeline: NEW → ASSIGNED → CONTACTED → NO_ANSWER → CONSULTING → TRIAL_SCHEDULED → TRIAL_IN_PROGRESS → TRIAL_ATTENDED → AWAITING_DECISION → REGISTERED → ENROLLED → NURTURING → LOST → DUPLICATE (bỏ DEMO_SCHEDULED deprecated). Header cột = nhãn VI từ label registry + `StatusPill` màu + badge đếm. Mỗi cột là drop-zone; card kéo-thả được.
- **Card lead:** tên PH (`StatusPill` không dùng ở đây — dùng text), SĐT bấm gọi `tel:`, tên + tuổi con, nguồn, ngày học thử gần nhất, badge SLA (quá hạn task đỏ / im lặng amber), badge "Dùng chung" nếu `isSharedWithTeam`. Nút thao tác nhanh trên card: ghi tương tác (icon gọi/nhắn), mở chi tiết, chốt.
- **View Bảng (`DataTable` tái dùng):** cột `Tên PH · SĐT · Con · Trạng thái (StatusPill) · Nguồn · Ngày tạo · Học thử gần nhất · Hành động`. Phân trang 20/trang. `emptyMessage` qua `EmptyState`.
- **Tab preset:** chip "Đã đăng ký" (REGISTERED) có badge đếm, đặt cạnh toolbar.

**Dữ liệu hiển thị (Prisma, tôn trọng PII + scopedDb):**
- Model `Lead` (`id`, `parentName`, `phone`, `email`, `status`, `source`, `lastActivityAt`, `firstContactAt`, `assignedAt`, `qualifiedAt`, `isSharedWithTeam`, `centerId`, `assignedToId`) + `include`: `children` (`LeadChild`: `childName`, `childAge`, `trialStatus`, `trialHistory`), `tasks` (`LeadTask.dueAt/status` để tính badge quá hạn), `assignedTo` (tên sale), `center`.
- **Scope:** đọc qua `scopedDb(actor)` — cách ly cơ sở (CS1 không thấy lead CS2). Thêm own-filter: `assignedToId = actor.id` (hoặc `isSharedWithTeam = true` cùng cơ sở) vì `leads:view-own`.
- **PII:** SALES_CSM có `leads:view-pii` → thấy đầy đủ `phone/email/parentName/childName/note`, giữ link `tel:`. Vẫn phải chạy `maskLeadPiiFields()` ở server theo `canViewLeadPii(actor)` để nếu tài khoản là role không-PII (vd MARKETING dùng chung site sau này) thì mask trước khi vào RSC payload — **không** chỉ ẩn ở UI.
- **SLA timestamp** (SR.QD.217): dùng `firstContactAt` (đo SLA-3 ≤3h), `lastActivityAt` (idle >24h/48h), `assignedAt` để render cờ trên card.

**Thao tác (actions):**

| Thao tác | Trang / Popup | Quyền cần | Server action tái dùng |
|---|---|---|---|
| Đổi trạng thái (kéo-thả Kanban / dropdown ở Bảng) | **Inline** (không popup/không trang) | `leads:edit` + owner (`actorMayMutateLead`) | `updateLeadStatus` (guard `canTransitionLeadStatus`; REGISTERED cần từ AWAITING_DECISION + Payment RECORDED) |
| Mở chi tiết lead | **Trang mới** `/sale/leads/[id]` | `leads:view-own` | RSC đọc qua `scopedDb` |
| Ghi tương tác nhanh (CALL/MESSAGE/NOTE) | **Popup** (sheet/dialog trên card) | `leads:edit` (lead dùng chung: chỉ ghi chú qua đây) | `addLeadActivity` (reset `lastActivityAt`/SLA idle) |
| Chuyển lead sang sale/cơ sở khác | **Popup** (dialog, note bàn giao ≥5 ký tự bắt buộc) | `leads:edit` + owner | `transferLead` |
| Bật/tắt "Dùng chung" lead | **Inline** (toggle trên card/detail) | owner hoặc `leads:view-all` | `toggleLeadShareAction` |
| Chốt đơn (Chuyển đổi) | **Trang mới** `/sale/leads/[id]/convert` | `students:create` + `enrollments:create` + flag `CONVERT_V2_ENABLED` | `submitConvertV2` |
| Gán/đổi tư vấn viên | **Ẩn** (không hiện trên site Sale) | `leads:assign` — SALES_CSM **KHÔNG** có | — (việc của CENTER_MANAGER) |

> Nút "Xác nhận chuyển đổi" chỉ **bật** khi `getLeadPaymentSummary().eligible = true` (đã có ≥1 Payment RECORDED hoặc học bổng toàn phần); nếu chưa, hiển thị badge "cần ghi nhận thanh toán trước" + link tạo đơn (theo QĐ chặn convert chưa thanh toán).

**Trạng thái:**
- **Rỗng:** `EmptyState` (tone slate, icon inbox) — "Chưa có lead nào được giao cho bạn" + gợi ý kiểm tra bộ lọc/khoảng ngày. Từng cột Kanban rỗng hiện placeholder mờ.
- **Loading:** skeleton cột/card (Kanban) hoặc skeleton rows (`DataTable`); filter đổi → `useTransition` giữ khung, tránh nhấp nháy.
- **Lỗi:** khi action kéo-thả thất bại (vd vi phạm transition guard `REGISTERED` chưa có payment) → `toast.error` (sonner) + rollback card về cột cũ (revert optimistic). Lỗi tải trang → error boundary với nút thử lại.
- **Không-có-quyền:** layout `(sale)` gate 3 tầng đã chặn; nếu vào được nhưng thiếu `leads:view-own` → redirect về trang chủ site Sale. Thao tác vượt quyền (vd sửa lead không phải của mình / lead chỉ dùng-chung) → action trả lỗi, UI khoá nút sửa, chỉ cho ghi chú.

**Quyền & phạm vi:**
- **Gate tab:** `can(actor, 'leads:view-own')` (SALES_CSM có). Menu ẩn nếu không có quyền (nav lọc theo perm như sidebar admin — PAGE_GATES là nguồn route-gate duy nhất, menu ≡ cổng).
- **Scope:** **OWN** (mỗi sale chỉ lead `assignedToId = mình` + lead dùng chung cùng cơ sở — BGĐ câu 10) **giao với CENTER** (cách ly cơ sở do `scopedDb(actor)` ép ở tầng query, không do role matrix). SUPER_ADMIN/HO bypass; HO_SALE (nếu được cấp) chỉ XEM cross-center scope A&B, không sửa.
- Mutation gate 3 lớp giữ nguyên: `checkPermission('leads:edit')` → `passesScope('Lead', before, actor)` (chống IDOR liên cơ sở) → `actorMayMutateLead` (owner hoặc view-all).

**Ghi chú kỹ thuật:**
- **Tái dùng nguyên khối server actions admin** (`updateLeadStatus`, `addLeadActivity`, `transferLead`, `submitConvertV2`, `toggleLeadShareAction`, `getLeadPaymentSummary`) — đã có sẵn guard permission + `scopedDb` + PII mask + audit + idempotency. Site Sale **chỉ lắp UI mới gọi lại**, KHÔNG viết lại logic/service.
- **Cần build mới:** component Kanban cho route group `(sale)` (clone/điều chỉnh từ Kanban admin `/admin/leads?view=kanban`), gắn tone màu site Sale (tím `#7C3AED` cho brand/active — ĐÃ CHỐT QĐ-2), dùng `StatusPill` đã map 14 `LeadStatus` sang nhãn VI. Reuse 8 primitive UI kit GV gần như nguyên xi.
- **Cạm bẫy:**
  - Transition guard: kéo card sang cột **REGISTERED** chỉ hợp lệ khi from = AWAITING_DECISION **và** đã có Payment RECORDED — phải bắt lỗi và rollback optimistic, không để card "mắc kẹt" ở cột sai.
  - Optimistic update phải revert đúng cột nguồn khi action fail (đừng để trạng thái UI lệch DB).
  - Vào TRIAL_SCHEDULED tự tạo `TrialClass` placeholder (+24h) trong cùng transaction — UI đừng tạo lịch trùng.
  - Kéo-thả trên **mobile** (Sale làm việc mobile-first): dùng thư viện DnD có touch support, hoặc fallback dropdown đổi trạng thái ở view Bảng; không phụ thuộc hover.
  - Lead **dùng chung** (`isSharedWithTeam`): người không phải owner chỉ được `addLeadActivity` (ghi chú), phải disable kéo-thả/sửa field cho họ.
  - `centerId=null` trên lead cũ có thể lọt scope bất thường — đảm bảo query own-filter + `scopedDb` xử lý null nhất quán (bug centerId=null từng gặp nhiều trang).
  - Không import `@/lib/db` trần trong `app/(sale)/**` (ESLint chặn) — mọi đọc/ghi qua `scopedDb(actor)`.
  - Nút Convert phải kiểm `isConvertV2Enabled()` trước khi render; flag OFF → ẩn nút, tránh dẫn tới trang chốt lỗi.

---

### 3. Chi tiết lead

**Mục đích:** Trung tâm chăm sóc một lead: gom mọi thông tin (phụ huynh, N con, học thử, thanh toán, lịch sử tư vấn) và mọi thao tác chốt deal vào một màn, để Sale liên hệ nhanh, ghi hoạt động tức thì và chuyển đổi lead thành học viên.

**Loại màn hình:** **Trang riêng + popup thao tác.** Trang chi tiết là một RSC full-page hiển thị header + các section. Trong đó:
- Thao tác **mở trang mới**: Chuyển đổi (Convert) → `/sale/leads/[id]/convert`; Sửa lead → `/sale/leads/[id]/edit` (hoặc mở sheet, xem Ghi chú); Tạo đơn hàng cho lead → `/sale/don-hang/moi?leadId=...`.
- Thao tác **mở popup (dialog/sheet)**: Chuyển lead (transfer), Thêm/Sửa/Xoá con (LeadChild), Xếp con vào lớp trải nghiệm, Ghi tương tác nhanh (CALL/MESSAGE/NOTE/EMAIL).
- Thao tác **inline (không popup, không rời trang)**: đổi trạng thái (dropdown), gán Sale (AssignSelect — chỉ khi có quyền), bật "dùng chung" (ShareToggle), sửa note bàn giao, chọn loại đơn dự kiến.

**Đường dẫn:** `/sale/leads/[id]` — route con: `/sale/leads/[id]/convert` (trang chốt), `/sale/leads/[id]/edit` (sửa lead).

**Bố cục & thành phần chính:**
- **PageHeader** (tái dùng `_components/ui/page-header.tsx`): tiêu đề = tên phụ huynh + **StatusPill** trạng thái lead (dùng từ điển 15 `LeadStatus`); subtitle = SĐT dạng `tel:` bấm gọi + nguồn; vùng `actions` bên phải chứa nút **Chuyển đổi** (primary), **Chuyển lead** (mở dialog), **ShareToggle** (dùng chung), và **AssignSelect** (chỉ render nếu actor có `leads:assign`).
- **Banner note bàn giao** (nổi bật, tone amber) — hiển thị `handoverNote`; nếu rỗng thì ẩn.
- **Info grid** — hàng thẻ nhỏ: nguồn/UTM, cơ sở (center), Sale phụ trách, và các mốc SLA phễu SR.QD.217 (`assignedAt` / `firstContactAt` / `qualifiedAt`) để thấy SLA "liên hệ ≤3h".
- **Card "Loại đơn dự kiến"** (inline select) — khoá/sản phẩm quan tâm (`orderKind` / `expectedCourseId` / `expectedProductId`).
- **Section "Con (LeadChild)"** — dùng **DataTable** hoặc list card: mỗi con hiện tên/năm sinh/khoá quan tâm/`trialStatus` (StatusPill), nút Thêm/Sửa/Xoá (dialog) + nút "Xếp vào lớp trải nghiệm".
- **Card "Học thử"** — buổi/lớp trải nghiệm của các con (read-only kết quả: điểm danh, rubric `totalScore/rank` nếu có), **EmptyState** nếu chưa xếp lớp.
- **Card "Thanh toán / Điều kiện chốt"** (tái dùng LeadPaymentCard) — **StatCard** đã nộp / tổng phải thu / còn thiếu + badge "Đủ điều kiện chốt" hoặc "cần ghi nhận thanh toán trước" + link "+ Tạo đơn hàng cho lead này".
- **Timeline hoạt động** — **DataTable**/list `LeadActivity` (CALL/MESSAGE/NOTE/EMAIL/STATUS_CHANGE/HANDOVER) theo thời gian giảm dần, kèm **ô ghi chú nhanh** (inline form) để log tức thì.

Component tái dùng từ UI kit site GV (clone sang `.sale-root`): `PageHeader`, `DataTable`, `StatCard`, `StatusPill`, `EmptyState`, `SearchInput` (lọc timeline).

**Dữ liệu hiển thị (Prisma):**
- `Lead` (parentName, phone, email, status, source/utm, `assignedToId`, `centerId`/`orgUnitId`, `handoverNote`, `orderKind`/`expectedCourseId`/`expectedProductId`, `lastActivityAt`, các mốc `assignedAt`/`firstContactAt`/`qualifiedAt`/`handedAt`/`receivedConfirmedAt`, `isSharedWithTeam`).
- `LeadChild` (tên, năm sinh, khoá quan tâm, `trialStatus`) + `LeadTrialHistory` (đã từng học thử).
- `LeadActivity` (type, content, metadata, createdAt).
- `TrialClassV2` / `TrialEnrollment` / `TrialAttendance` / `TrialRubricEval` (read-only kết quả).
- `Order` + `Payment(saleStatus=RECORDED)` qua `getLeadPaymentSummary`.
- **PII:** SALES_CSM có `leads:view-pii` → thấy đầy đủ SĐT/email/tên PH-HS/note (giữ link `tel:`). Nếu tài khoản thiếu view-pii (vd role phụ), server đã mask qua `maskLeadPiiFields()` — **không** ẩn ở client. **scopedDb(actor)** ép cách ly cơ sở: CS1 không đọc được lead CS2.

**Thao tác (actions):**

| Thao tác | Trang / Popup | Quyền cần | Server action tái dùng |
|---|---|---|---|
| Chuyển đổi (Convert → chốt deal) | **Trang** `/sale/leads/[id]/convert` | `students:create` + `enrollments:create` (+ flag `CONVERT_V2_ENABLED`) | `submitConvertV2` → `convertLeadV2` |
| Sửa lead (field + con) | **Trang** `/sale/leads/[id]/edit` | `leads:edit` (+ owner/`view-all`) | `updateLeadFields` |
| Đổi trạng thái | **Inline** (dropdown) | `leads:edit` | `updateLeadStatus` (guard REGISTERED cần Payment RECORDED) |
| Gán/đổi Sale | **Inline** (AssignSelect) | `leads:assign` (Sale thuần thường KHÔNG có → ẩn) | `assignLeadToSaleAction` |
| Bật/tắt dùng chung | **Inline** (ShareToggle) | owner hoặc CM cùng cơ sở | `toggleLeadShareAction` |
| Chuyển lead (transfer) | **Popup** (dialog) | `leads:edit` (owner/view-all) | `transferLead` (note bàn giao ≥5 ký tự bắt buộc) |
| Ghi tương tác (CALL/MSG/NOTE/EMAIL) | **Popup/inline form** | `leads:edit` hoặc lead dùng chung (chỉ ghi chú) | `addLeadActivity` (reset `lastActivityAt`) |
| Sửa note bàn giao | **Inline** | `leads:edit` | `updateLeadNote` |
| Chọn loại đơn dự kiến | **Inline** (select) | `leads:edit` | `updateLeadOrderKind` |
| Thêm/Sửa/Xoá con | **Popup** (dialog) | `leads:edit` | `addLeadChild` / `updateLeadChild` / `deleteLeadChild` (chặn xoá con đang ở lớp trải nghiệm ACTIVE) |
| Xếp con vào lớp trải nghiệm | **Popup** (dialog) | `trials:manage` | `enrollLeadChildAction` (override sĩ số cần `trials:override-capacity` — Sale KHÔNG có) |
| Tạo đơn hàng cho lead | **Trang** `/sale/don-hang/moi?leadId=` | `orders:manage` (⚠ Sale thuần KHÔNG có — xem Ghi chú) | `createOrderManualAction` |

Sale **không** thấy nút gán GV / điểm danh / chấm rubric / xác nhận thanh toán (không có quyền) — ẩn hẳn để màn gọn.

**Trạng thái:**
- **Rỗng:** chưa có con → EmptyState "Chưa có thông tin con" + nút Thêm; chưa có hoạt động → EmptyState timeline; chưa có học thử → EmptyState "Chưa xếp lớp trải nghiệm".
- **Loading:** RSC streaming + Suspense theo section (info grid, timeline, payment card tải song song); dialog dùng `useTransition` (nút disabled + spinner).
- **Lỗi:** action trả `{ ok:false, error }` → `toast.error`; lỗi tải section → banner đỏ "Không tải được, thử lại" (không vỡ cả trang).
- **Không có quyền / ngoài scope:** lead của cơ sở khác hoặc không phải lead mình phụ trách (scopedDb + `passesScope` chặn) → **404/redirect** về `/sale/leads` (không lộ tồn tại lead cơ sở khác). Lead **dùng chung** cùng cơ sở → hiển thị read-only + chỉ cho `addLeadActivity`, các nút sửa/đổi trạng thái/transfer bị vô hiệu.

**Quyền & phạm vi:**
- Gate tab: `leads:view-own` (+ `leads:view-pii` cho SALES_CSM). Scope = **OWN** (`assignedToId === user.id`) — mỗi Sale chỉ thấy lead của mình + lead dùng chung cùng cơ sở (BGĐ câu 10). CENTER_MANAGER (`leads:view-all`) mở rộng scope **CENTER**.
- Mọi mutator qua 3 lớp: `checkPermission('leads:*')` → `passesScope('Lead', before, actor)` (chống IDOR liên cơ sở) → `actorMayMutateLead()` (chỉ owner hoặc `view-all` được sửa; lead dùng chung chỉ xem + ghi chú).
- Cách ly cơ sở **CS1↔CS2** do `scopedDb(actor)` ép ở tầng query, không phải ở role.

**Ghi chú kỹ thuật:**
- **Tái dùng nguyên khối** các server action admin hiện có (đã gate permission + scopedDb + mask PII + audit đầy đủ): `updateLeadStatus`, `addLeadActivity`, `updateLeadNote`, `updateLeadOrderKind`, `transferLead`, `assignLeadToSaleAction`, `toggleLeadShareAction`, `addLeadChild/updateLeadChild/deleteLeadChild`, `enrollLeadChildAction`, `getLeadPaymentSummary`, `submitConvertV2`. Site Sale chỉ lắp **UI mới** gọi lại, **KHÔNG** viết lại logic.
- **Build mới:** vỏ dialog/inline theo tone `.sale-root`; khôi phục panel "Việc cần làm/follow-up" (LeadTask) nếu cần — model còn, UI đã gỡ ở LD6; bổ sung hiển thị mốc SLA phễu (dữ liệu có sẵn trên `Lead`, UI admin chưa show).
- **Cạm bẫy:**
  - **Chặn convert chưa thanh toán:** `convertLeadV2` trả `PAYMENT_REQUIRED` nếu chưa có `Payment(RECORDED)` (hoặc học bổng toàn phần). Nút "Chuyển đổi" chỉ bật khi `getLeadPaymentSummary.eligible = true`; kiểm `isConvertV2Enabled()` trước khi render.
  - **Tiền chạy transaction:** toàn bộ tạo Student + Enrollment + consent + audit + idempotency (sha256) chạy atomic trong `db.$transaction`; giá đọc lại từ DB (`class.course.price`), không tin client; convert v2 set `finalPrice=listPrice, discount=0` — voucher/chiết khấu sống ở **Order**, không ở Enrollment.
  - **`centerId=null`:** Enrollment/Attendance tạo qua convert phải denormalize `centerId` theo lead — thiếu sẽ leak/vỡ scope (bug đã gặp nhiều trang). Kiểm lead có `centerId` trước khi cho chốt.
  - **PARENT_CONFLICT:** trùng email+SĐT 2 hồ sơ → convert khoá + tạo `ConvertConflict`; điều hướng sang `/sale/convert-conflicts`, không cho ghi đè.
  - **GAP quyền `orders:manage` — ĐÃ CHỐT QĐ-4:** SALES_CSM hiện KHÔNG có `orders:manage` → vá bằng action hẹp **`orders:create`** (đơn gắn lead của mình, parity 3 file, PR RBAC trước P0); nút "Tạo đơn hàng cho lead" gate theo `orders:create`.
  - **Tách nhiệm vụ tiền:** Sale chỉ `payments:record` (RECORDED); KHÔNG hiển thị xác nhận/hoàn tiền/xuất phiếu thu (thuộc Kế toán `payments:confirm`) — chỉ show badge "chờ kế toán xác nhận".

---

### 4. Tạo lead thủ công

- **Mục đích:** Cho phép tư vấn viên nhập nhanh một lead phát sinh tại sự kiện / quầy tư vấn / gọi vào trung tâm (thông tin phụ huynh, SĐT, con, khoá quan tâm, nguồn) mà không qua Messenger. Có chống trùng SĐT và tự động chia cơ sở/sale ngay sau khi tạo.

- **Loại màn hình:** **Trang riêng** (full page form). Toàn bộ nhập liệu nằm trên một trang; thao tác con "Thêm con" là **khối inline** (thêm/bớt hàng LeadChild ngay trong form, không mở popup). Sau khi lưu thành công điều hướng sang trang chi tiết lead vừa tạo (`/sale/leads/[id]`) — không dùng dialog.

- **Đường dẫn:** `/sale/leads/new` (route con: không có — form 1 trang; đích sau khi tạo là `/sale/leads/[id]`).

- **Bố cục & thành phần chính:**
  - `PageHeader` — tiêu đề "Tạo lead thủ công", subtitle ngắn ("Thu lead tại sự kiện / trung tâm"), vùng `actions` bên phải chứa nút phụ "Huỷ" (quay lại danh sách).
  - Thân form gói trong `.t-card` (tái dùng token UI kit), chia 3 nhóm:
    1. **Thông tin phụ huynh:** `Input` họ tên PH, `Input` SĐT (bắt buộc, dùng để chống trùng), `Input` email (tuỳ chọn).
    2. **Thông tin con (LeadChild):** khối lặp inline — mỗi hàng gồm `Input` tên con, `Input`/`Select` tuổi hoặc năm sinh, `Select` khoá/sản phẩm quan tâm. Nút "＋ Thêm con" thêm hàng, nút xoá hàng cho từng con. Cho phép 1..N con.
    3. **Nguồn & ghi chú:** `Select` nguồn (sự kiện / referral / walk-in / khác), `Select` cơ sở quan tâm (chỉ hiện các cơ sở user có quyền — thường khoá cứng theo cơ sở của sale), `Textarea` ghi chú tư vấn.
  - Thanh hành động dưới cùng: nút chính "Lưu lead" (`Button` shadcn, tone brand) + nút "Huỷ".
  - KHÔNG dùng `DataTable`/`ListToolbar`/`StatCard` ở màn này (không phải màn danh sách). `StatusPill` không cần vì lead mới luôn ở trạng thái "Mới".

- **Dữ liệu hiển thị / ghi:**
  - `Lead` (tạo mới, `status = NEW`): `parentName`, `phone`, `email`, `source`, `note`, `centerId`/`orgUnitId`, `assignedToId` (điền qua auto-chia sau tạo), `expectedCourseId`/`orderKind` nếu chọn khoá quan tâm.
  - `LeadChild[]`: `childName`, `childAge`/năm sinh, khoá/cơ sở quan tâm.
  - `LeadActivity` (type=NOTE, system) ghi mốc tạo; `LeadAuditLog` (action=CREATE).
  - PII (SĐT/email/tên PH-HS): SALES_CSM có `leads:view-pii` → nhập/xem đầy đủ (không mask). Nếu site phục vụ role không có view-pii thì form vẫn cho nhập nhưng không hiển thị lại PII lead khác khi báo trùng.
  - Mọi ghi đi qua `scopedDb(actor)` — cơ sở của lead bị ép theo phạm vi user (CS1 không tạo lead vào CS2).

- **Thao tác (actions):**

  | Thao tác | Trang / Popup | Quyền cần | Server action tái dùng |
  |---|---|---|---|
  | Lưu lead (submit form) | Trang (`/sale/leads/new`) → redirect `/sale/leads/[id]` | `leads:create` | `createLeadManual` (app/(admin)/admin/leads/actions.ts) — đã có kiểm trùng phone + `LeadActivity` + `LeadAuditLog` |
  | Thêm / xoá con (LeadChild) | Inline trong form (không popup, chưa gọi server — gom vào payload create) | `leads:create` | gộp trong `createLeadManual`; hoặc `addLeadChild` nếu tách sau tạo |
  | Auto-chia sau khi tạo | Chạy nền (không UI riêng) | thực thi bởi hệ thống (không đòi `leads:assign` của sale) | `autoAssignNewLeadAction` → `pickCenterEvenly` (tầng cơ sở) + `LeadAssignMode` ROUND_ROBIN/CLOSE_RATE/MANUAL (tầng sale) |
  | Huỷ | Trang (điều hướng về `/sale/leads`) | — | — |

  Ghi chú: SALES_CSM **không** có `leads:assign`; việc "auto-chia" là logic hệ thống chạy sau create, không phải sale tự gán tay. Với sale tạo lead tại sự kiện, kết quả thông thường là lead thuộc cơ sở của sale và được đưa vào vòng chia của cơ sở đó.

- **Trạng thái:**
  - **Rỗng:** không áp dụng (form luôn hiển thị các field trống). Không dùng `EmptyState`.
  - **Loading:** nút "Lưu lead" ở trạng thái pending (spinner + disable) trong `useTransition` khi gọi action.
  - **Lỗi:**
    - Trùng SĐT → banner lỗi đỏ dưới ô SĐT ("SĐT đã tồn tại"); chỉ lộ trạng thái + sale phụ trách của lead trùng khi actor có `view-pii` **và** lead trùng trong scope cơ sở, ngược lại chỉ báo trùng chung chung.
    - Validation Zod (thiếu tên PH/SĐT, SĐT sai định dạng) → message dưới từng field.
    - Lỗi server / hết quyền → `toast.error` (sonner).
  - **Không có quyền:** thiếu `leads:create` → layout/page-gate redirect về dashboard site sale (không render form).

- **Quyền & phạm vi:**
  - Gate trang: `leads:create` (SALES_CSM có). Server action `createLeadManual` tự `auth()` + `checkPermission('leads:create')`.
  - Scope: **CENTER** — sale chỉ tạo lead trong cơ sở mình; ép bởi `scopedDb(actor)` ở tầng query, không lấy từ input client. `centerId`/`orgUnitId` không tin client, chốt theo phạm vi user.

- **Ghi chú kỹ thuật:**
  - **Tái dùng nguyên khối** `createLeadManual` (đã có: kiểm trùng phone `deletedAt:null`, tạo `Lead` NEW + `LeadActivity` NOTE + `LeadAuditLog` CREATE, hook auto-assign). Site Sale chỉ dựng UI form mới gọi lại action — **không** viết lại logic dedupe/audit.
  - **Build mới:** vỏ UI form theo UI kit site (`PageHeader` + `.t-card` + shadcn `Input/Select/Textarea/Button`); khối LeadChild lặp inline (client state), gom vào 1 payload create.
  - **Cạm bẫy:**
    - `centerId=null` — nếu tạo lead không set cơ sở, các màn/enrollment phía sau dễ lỗi cách ly; luôn để `scopedDb` chốt cơ sở, không để null trên create-path.
    - Auto-chia bị **khoá** khi lead đã có tương tác thật (`hasSaleInteraction`) — với lead vừa tạo thì chưa có, nên chia chạy bình thường; đừng gọi lại auto-assign sau khi sale đã ghi hoạt động.
    - Đừng tự set `assignedToId` từ client — để action/auto-assign quyết định, tránh lệch với `leads:view-own` (mỗi sale chỉ thấy lead của mình).
    - Chống double-submit: disable nút trong `useTransition`; `createLeadManual` đã chặn trùng phone nên submit lại không đẻ lead trùng.
    - Không nhúng bước tạo Order/thanh toán ở đây — màn này chỉ thu lead ở trạng thái NEW; convert/tiền là luồng riêng.

---

### 5. Nhập từ Excel

**Mục đích:** Cho tư vấn viên nhập hàng loạt lead từ file Excel — hai luồng: (a) danh sách lead thu ở sự kiện/hội thảo, (b) danh sách khách "đã đăng ký" theo tháng (nhiều sheet) — với validate từng dòng và chống trùng SĐT trước khi ghi vào CRM.

**Loại màn hình:** **Trang riêng** (full page, client component — có state upload/parse/preview nên buộc `'use client'`). Trang tổ chức theo dạng wizard 3 bước trên cùng một route; luồng "Đã đăng ký theo tháng" tách sang **route con riêng** vì cấu trúc file khác (nhiều sheet/tháng, cột khác). Các thao tác phụ:
- **Tải file mẫu (template):** không mở trang/popup — là link tải trực tiếp (`<a download>`).
- **Xem trước & sửa lỗi dòng:** **inline ngay trong trang** (bảng preview có hàng lỗi bung ghi chú), KHÔNG popup.
- **Chi tiết một dòng lỗi / trùng SĐT:** **popup (dialog)** nhẹ để xem lead trùng đang tồn tại (chỉ khi actor có quyền xem trong scope), không rời trang.
- **Xác nhận import:** không mở trang mới — chạy tại chỗ trong `useTransition`, sau đó hiện màn kết quả (SuccessBanner) cùng trang.

**Đường dẫn:**
- `/sale/leads/import` — nhập lead sự kiện/thu tay (mặc định).
- `/sale/leads/import/registered` — nhập danh sách "đã đăng ký" theo tháng (route con).

(Ánh xạ từ admin hiện có: `/admin/leads/import` + `/admin/leads/import/registered`.)

**Bố cục & thành phần chính:**
- **PageHeader** (tái dùng `_components/ui/page-header.tsx`): tiêu đề "Nhập lead từ Excel" + subtitle mô tả 2 luồng; vùng `actions` bên phải chứa nút **Tải file mẫu** và link chuyển sang luồng "Đã đăng ký".
- **Tab con / SegmentControl** đầu trang: 2 tab — "Lead sự kiện" và "Đã đăng ký theo tháng" (tab thứ 2 điều hướng sang route con). Có thể dùng 2 link đơn giản thay vì tab component để menu ≡ route.
- **Khối bước 1 — Chọn & tải file:** dropzone/`<input type=file accept=.xlsx,.csv>` + ghi chú định dạng cột bắt buộc (Tên PH, SĐT, Tên con, Tuổi con, Khoá quan tâm, Nguồn, Ghi chú). Nút "Tải file mẫu" tải template đúng cột.
- **Khối bước 2 — Xem trước (preview) sau parse:** hàng **StatCard** (tái dùng `stat-card.tsx`) tóm tắt: `Tổng dòng` (tone brand), `Hợp lệ` (green), `Cảnh báo/Trùng` (amber), `Lỗi` (red). Bên dưới là **DataTable** (`data-table.tsx`, generic) render từng dòng đã parse: cột STT · Tên PH · SĐT · Tên con · Tuổi · Khoá · Nguồn · **Trạng thái dòng** (StatusPill: hợp lệ / trùng SĐT / thiếu trường / sai định dạng). Dòng lỗi tô nền đỏ nhạt + dòng ghi chú lỗi ngay dưới.
- **ListToolbar** (`list-toolbar.tsx`) phía trên bảng preview: SearchInput lọc theo tên/SĐT + Select lọc theo trạng thái dòng (Tất cả / Hợp lệ / Trùng / Lỗi) để soát nhanh file lớn.
- **StatusPill** (`status-pill.tsx`) cần bổ sung từ điển trạng thái-dòng-import: `VALID` (Hợp lệ, brand/green), `DUPLICATE` (Trùng SĐT, amber), `INVALID` (Lỗi, red), `SKIPPED` (Bỏ qua, slate).
- **Khối bước 3 — Xác nhận & kết quả:** nút chính "Nhập N dòng hợp lệ" (disable khi 0 dòng hợp lệ) + checkbox "Bỏ qua dòng trùng, chỉ nhập dòng mới". Sau khi chạy: **SuccessBanner** (`empty-state.tsx`/SuccessBanner) tổng kết `đã tạo / bỏ qua trùng / lỗi` + link "Xem lead vừa nhập" sang danh sách lead lọc theo mẻ import.
- **EmptyState** khi chưa chọn file: icon upload + hướng dẫn "Chọn file .xlsx theo mẫu để bắt đầu".

**Dữ liệu hiển thị (model/field Prisma):**
- Ghi vào model **`Lead`** (bulk) + **`LeadChild`** (con), trường: `parentName`, `phone`, `email`, `childName`/`childAge` (qua LeadChild), `expectedCourseId`/khoá quan tâm, `source` (+ UTM nếu có trong file), `note`, `centerId`/`orgUnitId` (theo cơ sở của actor), `assignedToId` (mặc định = chính Sale đang import), `status=NEW`. Luồng "Đã đăng ký" set `status` phù hợp (REGISTERED-preset) theo logic import registered hiện có.
- **`LeadDuplicate`** — log mỗi dòng trùng SĐT (`deletedAt:null`).
- Preview chỉ hiển thị dữ liệu **trong file người dùng vừa upload** (chưa phải dữ liệu DB); phần đối chiếu trùng SĐT chạy ở SERVER qua `scopedDb(actor)` — chỉ trả cờ "trùng" + (nếu actor có `leads:view-pii` VÀ lead trùng thuộc scope cơ sở) hé lộ trạng thái + sale phụ trách của lead trùng; ngoài scope thì chỉ báo "SĐT đã tồn tại" không lộ chi tiết.
- PII (SĐT/email/tên PH-HS): SALES_CSM có `leads:view-pii` → thấy đầy đủ trong preview. Nếu site về sau phục vụ role không có view-pii thì mask ở server như `maskLeadPiiFields`.

**Thao tác (actions):**

| Thao tác | Trang / Popup | Quyền cần | Server action / logic tái dùng |
|---|---|---|---|
| Mở màn Nhập Excel | **Trang** (`/sale/leads/import`) | `leads:import` (route-gate) | page RSC gate + client component |
| Chuyển luồng "Đã đăng ký theo tháng" | **Trang** (route con `/import/registered`) | `leads:import` | page riêng |
| Tải file mẫu | Không popup (link `<a download>`) | `leads:import` | file tĩnh trong `public/` |
| Chọn & parse file (preview) | **Inline trong trang** (client) | `leads:import` | `parseLeadImportRow` (client-side parse + validate từng dòng) |
| Lọc/tìm dòng trong preview | Inline (ListToolbar) | — | client filter |
| Xem chi tiết dòng trùng SĐT | **Popup (dialog)** | `leads:import` + `leads:view-pii` (mới lộ chi tiết) | check trùng qua `scopedDb` (như `createLeadManual`/`updateLeadFields`) |
| Xác nhận import (ghi DB) | **Inline trong trang** (`useTransition`), rồi màn kết quả cùng trang | `leads:import` | import action bulk (tái dùng action `/admin/leads/import`) — tạo `Lead`+`LeadChild`, auto-assign theo cơ sở, log `LeadDuplicate` |
| Xem lead vừa nhập | **Trang** (điều hướng sang danh sách lead) | `leads:view-own` | — |

Điểm cốt lõi: mọi bước soát-lỗi (chọn file → preview → sửa/lọc) đều **cùng một trang, inline**; chỉ "xem chi tiết dòng trùng" mở **popup**; chỉ "chuyển luồng đã đăng ký" mở **trang** (route con).

**Trạng thái:**
- **Rỗng (chưa chọn file):** EmptyState hướng dẫn tải mẫu + kéo-thả file.
- **Loading:** khi parse file lớn — skeleton bảng preview + spinner trên StatCard; khi ghi DB — nút "Đang nhập..." disable + progress theo mẻ.
- **Lỗi:** (a) sai định dạng file → banner đỏ "File không đúng mẫu, thiếu cột X"; (b) dòng lỗi → tô đỏ + ghi chú trong bảng, không chặn nhập dòng hợp lệ khác; (c) import thất bại một phần → màn kết quả liệt kê dòng lỗi để tải lại/sửa.
- **Không có quyền:** thiếu `leads:import` → layout/route-gate redirect về trang chủ site Sale (menu ≡ cổng qua PAGE_GATES, không để dead-link).

**Quyền & phạm vi:**
- Permission gate của tab: **`leads:import`** (SALES_CSM có). Route-gate qua PAGE_GATES + nav filter `it.perm.some(...)`.
- Scope: **CENTER** — lead nhập vào gắn `centerId`/`orgUnitId` của cơ sở actor; `assignedToId` mặc định = chính Sale (theo `leads:view-own`, "mỗi sale chỉ thấy lead của mình" — BGĐ câu 10). Đối chiếu trùng SĐT chạy qua **`scopedDb(actor)`** nên CS1 không dò/không lộ lead CS2 (cách ly cơ sở bắt buộc, test CI phủ).

**Ghi chú kỹ thuật:**
- **Tái dùng nguyên khối** action import + `parseLeadImportRow` đã có ở `/admin/leads/import` và `/admin/leads/import/registered` — đã gate `leads:import`, đã dedup SĐT, đã auto-chia theo cơ sở. Site Sale chỉ **lắp UI mới** (PageHeader/DataTable/StatCard/StatusPill/ListToolbar clone từ `_components/ui/`), KHÔNG viết lại logic parse/ghi.
- **Cần build mới:** từ điển StatusPill cho trạng thái-dòng-import (VALID/DUPLICATE/INVALID/SKIPPED); dialog "xem lead trùng"; bố cục wizard 3 bước; file template trong `public/`.
- **Cạm bẫy:**
  - Import qua `scopedDb(actor)` — KHÔNG import `@/lib/db` trần (ESLint chặn trong `app/**`); mọi dò-trùng phải scoped để không leak SĐT cơ sở khác.
  - **`centerId` bắt buộc set khi tạo Lead/LeadChild** — thiếu sẽ rơi vào bug `centerId=null` gặp nhiều màn khác; lấy từ cơ sở actor, KHÔNG hardcode "HO/CS2".
  - **Chống trùng ở tầng ghi, không chỉ ở preview:** giữ check `phone` trùng (`deletedAt:null`) trong action ghi (như `createLeadManual`), vì file có thể trùng nội bộ giữa các dòng hoặc trùng với lead vừa tạo trong cùng mẻ.
  - **PII trẻ em/PH:** giữ mask server-side nếu về sau role không-view-pii dùng màn; hiện SALES_CSM full.
  - Import KHÔNG chạm luồng tiền/convert — chỉ tạo Lead (status NEW / registered-preset); mọi thao tác chốt deal đi luồng convert riêng, không nhồi vào import.
  - Dùng **shadcn thuần** (KHÔNG Magic UI/Framer/Recharts) theo chuẩn site GV clone; metadata `robots noindex` + `dynamic='force-dynamic'` như teacher layout.

---

### 6. Nhập khách hàng (MISA) — "Form nhập liên hệ từ Sale"

> 🔄 **CẬP NHẬT LẦN 2 — 16/07/2026 (tối), bản đúng:** snippet chuẩn cho tab này là **"Form nhập liên hệ từ Sale"** do user cung cấp trực tiếp, đã lưu tại `D:\Web SataRobo\satarobo-sale\form-sale-nhap-snippet.html`. File docx `Form nhung quà tặng về Misa Amis V2.docx` là **form quà tặng KHÁC, KHÔNG liên quan** (user gửi nhầm) — mọi đặc tả theo docx đó (redirect `quatang.edu.vn`, 9 trường, Form ID `adaa2ae1…`) **hủy bỏ**. File cũ `/nhap-lieu.html` + `/thank-you.html` giữ nguyên cho entry công khai (Ads).

- **Nguồn form (đã verify từ snippet):** `#crmWebToEntityForm` POST `https://amisapp.misa.vn/crm/gc/api/open/WebForm/savecollection` — **CÙNG Form ID `c53af301-de05-94e5-2867-dac41b762a52` + FormKey + Companycode `uys4eef4` với form cũ `nhap-lieu.html`** (cùng collection MISA — bản ghi từ tab này và từ entry Ads đổ về một chỗ), nhưng **bộ trường đã đổi**: thêm `Description` (mô tả tiếp cận KH), `LeadSourceID` (12 nguồn), `MailingAddress`; tỉnh dùng `MailingProvinceID`; **bỏ** `ShippingProvinceID`/`ShippingWardID`/`ShippingAddress`. **`RedirectURL = http://sale.satarobo.vn/thank-you` — NỘI BỘ** (không còn rủi ro domain ngoài của bản nhầm). Validate phía MISA: chỉ `LastName` bắt buộc; sau submit script MISA disable nút Gửi (chống double-submit).

- **Đối chiếu checklist 12 trường (yêu cầu user 16/07):**

  | # | Yêu cầu | Trường trong form | Đạt? |
  |---|---|---|---|
  | 1 | ID NV nhập data — **tự động** theo tài khoản Sale login | `CustomField26` "Mã số NV nhập dữ liệu" | ✅ có field; phần "tự động" là việc của **script prefill lớp bao** (MISA không tự lấy được) — điền `Employee.employeeCode`, vẫn sửa tay được |
  | 2 | Họ và tên con (học viên) **\*** | `LastName` ∈ `mndFileds` | ✅ bắt buộc |
  | 3 | Họ và tên PH | `CustomField25` | ✅ |
  | 4 | **SĐT PH \*** | `CustomField15` | ⚠️ **CÓ field nhưng KHÔNG bắt buộc** (MISA chỉ bắt buộc LastName) — **GAP duy nhất**, xử lý bên dưới |
  | 5 | Email PH | `Email` | ✅ |
  | 6 | Cơ sở (chọn 1 trong 2) | `CustomField17` — `1`=CS1 211 NHT · `2`=CS2 114 HD | ✅ + **prefill** theo cơ sở của Sale |
  | 7 | Mô tả thông tin | `Description` | ✅ (mới so form cũ) |
  | 8 | Nguồn lead | `LeadSourceID` — **12 nguồn** (value 1–13, không có 5) | ✅ (mới) |
  | 9 | Trường con đang học | `CustomField14` | ✅ |
  | 10 | Lớp con đang học | `CustomField13` | ✅ |
  | 11 | Tỉnh/TP dropdown VN | `MailingProvinceID` — 63 tỉnh (danh sách CŨ trước sáp nhập còn 34 tỉnh 07/2025 — dữ liệu phía MISA) | ✅ |
  | 12 | Nhập địa chỉ | `MailingAddress` | ✅ (mới) |

  **Kết luận: 11/12 đạt nguyên trạng; 1 GAP: SĐT PH chưa bắt buộc.** Xử lý 2 tầng: **(chuẩn)** đề nghị owner form config bắt buộc `CustomField15` trong MISA → xuất lại snippet → thay nguyên khối; **(tạm, trong lúc chờ)** script lớp bao CỦA TA gắn listener `submit` (capture, NGOÀI snippet) chặn gửi khi SĐT trống + thông báo tiếng Việt — **gỡ ngay** khi bản MISA chuẩn về.

- **Mục đích:** Sale nhập khách hàng thẳng sang MISA CRM không rời workspace (kèm mô tả tiếp cận + nguồn lead). Snippet MISA giữ **nguyên khối**; mọi tiện ích (prefill, guard SĐT tạm, nút nhập tiếp) nằm ở **lớp bao của ta, ngoài snippet**. Công cụ nhập nhanh bổ trợ — KHÔNG thay thế Kanban Lead nội bộ.

- **Loại màn hình:** **Nhúng (embed iframe)** — trang bao RSC + `<iframe>` trỏ **wrapper tĩnh MỚI** `public/sale/form-sale-nhap.html`. Tương tác nhập/submit nằm TRONG iframe (MISA tự lo); lớp bao chỉ có 2 thao tác phụ: nút **"Nhập khách mới"** (inline — reload iframe) + **"Mở form gốc"** (tab trình duyệt mới). KHÔNG dialog/sheet nào của app.

- **Đường dẫn:**
  - `/sale/nhap-khach-hang` — trang bao (auth + gate role; giữ nguyên slug §3).
  - `src` iframe: `/sale/form-sale-nhap.html?nv=<employeeCode>&cs=<1|2>` — wrapper tĩnh MỚI, phục vụ **sau cổng auth** (KHÔNG whitelist public — form có prefill mã NV).
  - **Vì sao phải có wrapper:** snippet là fragment `<div>` trần chứa `<script>` phải chạy → KHÔNG render trực tiếp trong RSC (`dangerouslySetInnerHTML` bị cấm ngoài JSON-LD; inline `<script>` chèn qua React không thực thi).

- **Bố cục & thành phần chính:**
  - `PageHeader`: tiêu đề "Nhập khách hàng (MISA)", subtitle "Form nhập liên hệ từ Sale · đồng bộ trực tiếp sang MISA CRM"; `actions`: nút **"Nhập khách mới"** (reload iframe về src gốc, giữ prefill — cần vì MISA disable nút Gửi sau submit) + link **"Mở form gốc"** (`target="_blank" rel="noopener"`).
  - Dải chú thích (`.t-card`, tone `blue`): "Dữ liệu đi thẳng vào MISA, KHÔNG tự tạo Lead trong hệ thống Sata Robo — cần chăm sóc pipeline thì tạo Lead ở tab Lead của tôi."
  - Khung `<iframe>`: `w-full`, `min-h-[70vh]`/`flex-1`, viền `.t-card`, `title="Form nhập khách hàng MISA"`, `loading="lazy"`.
  - KHÔNG toolbar filter / DataTable / StatCard / tab con.

- **Cấu trúc wrapper `public/sale/form-sale-nhap.html` (file MỚI, của ta):**
  1. Khung trang tối giản: UTF-8, viewport, `robots noindex`, font hệ thống, nền trắng, padding 16px, `max-width 640px` căn giữa — KHÔNG kéo CSS site vào.
  2. **Snippet MISA dán NGUYÊN KHỐI** từ `satarobo-sale/form-sale-nhap-snippet.html` — không sửa gì bên trong `#crmWebToEntityForm`. (Bản lưu gõ lại từ paste chat — khi build nếu lấy được bản export gốc từ MISA thì ưu tiên bản đó; lệch whitespace không ảnh hưởng chức năng.)
  3. **Script CỦA TA đặt SAU snippet:** (a) prefill từ `URLSearchParams`: `CustomField26` = `nv`, chọn option `CustomField17` = `cs`, và **(tuỳ chọn, nên bật)** `MailingProvinceID` = `7480` (Đà Nẵng — mặc định MISA là Hà Nội, sai ngữ cảnh 2 cơ sở đều ở Đà Nẵng); (b) **guard SĐT tạm thời** (chặn submit khi `CustomField15` trống — gỡ khi MISA bắt buộc chính thức). Mọi field prefill vẫn sửa tay được; thiếu/sai param → bỏ qua im lặng.

- **Dữ liệu hiển thị:** app chỉ đọc **1 lần** trong RSC trang bao: `Employee.employeeCode` + `Center.code` của actor (qua `scopedDb`) để dựng query param. Form không đọc/ghi model nào khác; PII khách nhập do MISA quản lý ngoài hệ thống.

- **Thao tác (actions):**

  | Thao tác | Trang hay Popup | Quyền cần | Server action tái dùng |
  |---|---|---|---|
  | Nhập & gửi khách (điền form → Gửi) | Trong iframe — MISA xử lý + redirect `sale.satarobo.vn/thank-you` **NỘI BỘ trong khung** (dùng lại `thank-you.html` hiện có) | `leads:create` (gate vào tab) | Không — đi thẳng endpoint MISA |
  | Nhập khách mới (sau khi gửi) | **Inline** — nút ở PageHeader, reload iframe về src gốc (giữ prefill) | `leads:create` | Không |
  | Mở form gốc ở tab mới | Tab trình duyệt mới (không popup app) | `leads:create` | Không |

- **Trạng thái:**
  - **Loading:** placeholder trong khung (spinner + "Đang tải form MISA…") tới `iframe onLoad`.
  - **Lỗi:** wrapper 404/lỗi mạng → `EmptyState` (tone slate) "Không tải được form MISA" + link mở wrapper ở tab mới.
  - **Sau submit:** iframe hiện trang thank-you **nội bộ** (cùng origin — không rủi ro chặn khung); Sale bấm "Nhập khách mới" để nhập tiếp.
  - **Không-có-quyền:** thiếu `leads:create` → tab ẩn khỏi sidebar; vào thẳng URL → redirect theo gate 3 tầng.

- **Quyền & phạm vi:** gate `can(actor, 'leads:create')` — SALES_CSM có. Không áp scope dữ liệu cho nội dung form (MISA là hệ ngoài); phần đọc `employeeCode`/`Center.code` đi qua `scopedDb` như mọi query.

- **Ghi chú kỹ thuật:**
  - **Prefill same-origin:** Phương án A (QĐ-1) → iframe cùng origin, script wrapper đọc query param không vướng cross-origin. Map cơ sở qua **`Center.code`** của actor (`CS1`→`'1'`, `CS2`→`'2'`; code khác → bỏ prefill) — option cơ sở là danh sách cứng PHÍA MISA, không hardcode danh sách center của repo.
  - **RedirectURL nội bộ nhưng là `http://`:** trang app https chứa iframe điều hướng sang `http://sale.satarobo.vn/thank-you` — host sẽ nâng http→https, nhưng để tránh cảnh báo/chặn mixed-content ở một số trình duyệt, **đề nghị owner MISA đổi RedirectURL sang `https://`** khi tiện (config phía MISA — khuyến nghị, KHÔNG blocker).
  - **Cùng collection với form cũ:** entry Ads public (`nhap-lieu.html`) vẫn POST cùng FormKey nhưng mang bộ trường CŨ (còn `Shipping*`, thiếu `Description`/`LeadSourceID`/`MailingAddress`) → **khuyến nghị vận hành:** cập nhật file public theo snippet mới (việc của marketing/owner form, ngoài phạm vi site Sale) để 2 entry đồng nhất bộ trường.
  - **Quy tắc sửa form:** mọi thay đổi trường/bắt buộc/RedirectURL là **config phía MISA** → xuất snippet mới, thay **NGUYÊN KHỐI** trong wrapper (1 commit, diff = cả khối); cấm vá tay trong snippet. Guard SĐT của wrapper là ngoại lệ TẠM, nằm NGOÀI snippet, gỡ khi MISA chuẩn.
  - **Cạm bẫy giữ nguyên:** form KHÔNG tạo Lead nội bộ (không hiện Kanban, không vào phễu SR.QD.217 — giữ dải chú thích blue; nguồn lead chọn trong form là nguồn MISA, KHÔNG map tự động vào `Lead.source` nội bộ); phân path tĩnh public ↔ app auth trên host sale; wrapper sau cổng auth; không tiền/enrollment/transaction ở tab này.

---

### 7. Hộp thư Messenger (L1)

> ⏸ **ĐÃ CHỐT (§10-Q10): HOÃN tab này sau v1 — KHÔNG build ở P1.** L1 (trực inbox Page HO, chat lấy SĐT → qualify thành Lead) là việc của HO_SALE, không phải Sale cơ sở (SALES_CSM làm từ **L2** trở đi). v1 **không render** tab này trong nav (site v1 chỉ phục vụ SALES_CSM thuần theo QĐ-3); phần L1 giữ nguyên ở `/admin/crm/messenger`. Đặc tả dưới đây **giữ lại nguyên vẹn** để dùng khi mở rộng cho HO_SALE ở phase sau.

**Mục đích:** Hộp thư hợp nhất các hội thoại Messenger đổ về Page Hội sở (kênh Ads chính, phễu SR.QD.217 mốc **LEADS_1**); HO_SALE chat theo kịch bản để xin SĐT + lớp/tuổi + chọn cơ sở (CS1/CS2), phản hồi ≤5′ (SLA‑0), rồi **qualify hội thoại thành Lead** (LEADS_2) để bàn giao trung tâm. L1 sống ở `MessengerConversation` — **chưa phải Lead record**.

**Loại màn hình:** **Trang danh sách + panel hội thoại (master–detail 2 cột)** — KHÔNG phải bảng thuần, KHÔNG phải embed iframe.
- Cột trái: danh sách hội thoại (list). Cột phải: khung chat của hội thoại đang chọn + ô trả lời (reply‑box) **inline trong panel**, không mở trang mới.
- Thao tác **"Qualify → tạo Lead"** mở **popup/dialog (sheet)** chứa form thu SĐT/tên PH/con/khoá + chọn CS1/CS2 (KHÔNG phải trang riêng, để không rời khỏi ngữ cảnh chat).
- Trên mobile: master–detail xếp chồng — chạm 1 hội thoại **đẩy sang route con** `/sale/messenger/[conversationId]` (full‑screen chat), quay lại về list.

**Đường dẫn:**
- `/sale/messenger` — danh sách + panel (desktop).
- `/sale/messenger/[conversationId]` — khung chat 1 hội thoại (deep‑link + mobile).

**Bố cục & thành phần chính** (tái dùng UI kit site GV, đổi từ điển trạng thái sang domain Messenger):
- **PageHeader** (`_components/ui/page-header.tsx`): tiêu đề "Hộp thư Messenger" + subtitle "Page Hội sở · phản hồi ≤5′"; vùng `actions` bên phải để nút "Làm mới".
- **Hàng StatCard** (`stat-card.tsx`, 3–4 thẻ, tone `brand`/`amber`/`blue`): *Chưa trả lời*, *Quá SLA‑0 (>5′)*, *Đã qualify hôm nay*, *Tổng đang mở*.
- **ListToolbar** (`list-toolbar.tsx`): `SearchInput` (tìm theo tên FB/nội dung) + các `Select` lọc: trạng thái xử lý (Chưa đọc / Đang xử lý / Đã qualify / Đã đóng), Page (nếu có >1 FacebookPageMapping), khoảng thời gian.
- **Cột trái — danh sách hội thoại** (có thể dùng `DataTable` 1 cột render tuỳ biến, hoặc list `<ul>` bọc `.t-card`): mỗi dòng = avatar/tên người gửi FB, trích đoạn tin cuối, thời gian, **StatusPill** trạng thái xử lý, chấm đỏ "chưa đọc", cờ "⏱ quá SLA‑0".
- **Cột phải — khung chat**: header (tên FB + StatusPill + nút Qualify), luồng `MessengerMessage` cuộn dọc (in/out), **reply‑box** dưới cùng; banner mỏng nhắc "Chưa có SĐT — hãy xin số để bàn giao TT" khi conversation chưa gắn phone.
- **StatusPill** (`status-pill.tsx`): cần **đổi từ điển** sang trạng thái hội thoại (NEW/chưa đọc · IN_PROGRESS · QUALIFIED · CLOSED) — mở đầu dùng tone `brand` (cam), qualified `green`, quá SLA `amber/red`.
- **EmptyState** (`empty-state.tsx`): khi không có hội thoại nào khớp lọc / inbox sạch.

**Dữ liệu hiển thị** (đọc qua helper `lib/sale/*` → `scopedDb(actor)`; KHÔNG import `@/lib/db` trần):
- `MessengerConversation`: `id`, `pageId`, `senderName` (tên FB), `lastMessageAt`, trạng thái xử lý, `linkedLeadId` (nếu đã qualify).
- `MessengerMessage`: `direction` (in/out), `text`, `sentAt` — dựng luồng chat.
- `FacebookPageMapping`: map `pageId` → Page HO (để lọc/nhãn nguồn).
- Sau qualify: `Lead` + `LeadChild` (SĐT, tên PH/con, khoá, `centerId`).
- **PII:** nội dung tin nhắn có thể chứa SĐT/tên PH‑HS. Che ở **server** cho actor không có `leads:view-pii` (dùng lại `maskLeadPiiFields`/`maskFreeText` từ `lib/lead/pii.ts`). HO_SALE có `leads:view-pii` → thấy đủ; bỏ link `tel:` cho role bị mask.

**Thao tác (actions):**

| Thao tác | Trang / Popup | Quyền cần | Server action tái dùng |
|---|---|---|---|
| Mở/chọn hội thoại | **Panel phải** (desktop) / **route con** `[id]` (mobile) — không popup | `leads:view-own` (+ vai HO_SALE) | RSC đọc qua `scopedDb` (không cần action ghi) |
| Trả lời tin nhắn | **Inline** trong panel (reply‑box) — không trang/không popup | quyền messenger reply (HO_SALE) | `lib/crm/messenger-service.ts` (reply/send) |
| Qualify → tạo Lead (nhập SĐT + con + chọn CS1/CS2) | **Popup/dialog (sheet)** | `leads:create` (+ `leads:view-pii` để thấy số) | `qualifyConversationToLead()` (`lib/crm/messenger-service.ts`) |
| Đổi trạng thái xử lý (đọc/đang xử lý/đóng) | **Inline** (StatusPill dropdown / nút) | `leads:view-own` | messenger‑service update status |
| Mở Lead đã qualify | **Điều hướng trang** `/sale/leads/[id]` | `leads:view-own` | — (link) |
| Làm mới inbox | **Inline** (nút trong PageHeader) | `leads:view-own` | `router.refresh()` |

> Ranh giới rõ: **chỉ có "Qualify → Lead" mở popup**; mọi thao tác đọc/trả lời/đổi trạng thái là **inline**; xem Lead đã tạo là **điều hướng trang**.

**Trạng thái:**
- **Rỗng (empty‑state):** không có hội thoại khớp lọc → `EmptyState` tone `slate` ("Không có hội thoại nào"); inbox sạch (đã xử lý hết) → có thể dùng `SuccessBanner` emerald ("Đã trả lời hết — không còn hội thoại chờ").
- **Loading:** skeleton cột trái + panel phải (RSC + Suspense; KHÔNG `useEffect` fetch).
- **Lỗi:** nếu nguồn webhook/DB lỗi → banner đỏ "Không tải được hộp thư"; lỗi gửi reply/qualify → `toast.error` (sonner), giữ nội dung soạn dở trong reply‑box.
- **Không‑có‑quyền:** tab không hiện trong nav (lọc `.filter` theo quyền, như portal lọc mục `eval`); nếu truy cập thẳng URL → layout/route‑gate redirect về khu đúng (không để hở URL).

**Quyền & phạm vi:**
- **Gate tab:** `leads:view-own` **+ điều kiện vai HO_SALE** (hoặc quyền messenger). Đây là điểm khác biệt: Sale cơ sở thuần **không** được cấp inbox Page HO → tab ẩn với họ.
- **Scope:** MessengerConversation ở **cấp Page HO**, xảy ra **TRƯỚC khi gán cơ sở** ⇒ scope thực chất là **GLOBAL/Page** cho tới khi qualify. Chỉ **sau khi qualify** (gán `centerId` CS1/CS2) thì Lead mới vào diện `scopedDb` cách ly cơ sở (CS1 không thấy Lead CS2). Xem "cạm bẫy".
- Ghi (reply/qualify/đổi trạng thái): mọi mutation **`auth()` + `checkPermission(...)` + qua service** — không gọi DB trần.

**Ghi chú kỹ thuật:**
- **Tái dùng nguyên khối:** trang `/admin/crm/messenger` + `lib/crm/messenger-service.ts` (`qualifyConversationToLead`, reply, update‑status) và webhook `/api/webhooks/meta/messenger` **đã có sẵn, có guard**. Site Sale chỉ **lắp UI mới** (master–detail + reskin `.sale-root`) gọi lại service — **KHÔNG viết lại logic**, KHÔNG đụng webhook.
- **Build mới:** vỏ master–detail 2 cột theo UI kit GV; **đổi từ điển StatusPill** sang trạng thái hội thoại; helper đọc `lib/sale/messenger.ts` bọc `scopedDb`.
- **Cạm bẫy 1 — scope L1 chưa có centerId:** conversation ở cấp Page HO chưa gắn cơ sở → **đừng giả định `scopedDb` tự lọc cơ sở** cho inbox này. Rò rỉ ngược lại: nếu để Sale cơ sở thấy inbox HO là **vượt phạm vi** (BGĐ câu 10 "mỗi sale chỉ thấy data của mình"). ⇒ Giữ tab cho HO_SALE, và sau qualify **bắt buộc chọn CS1/CS2** để Lead vào đúng cơ sở.
- **Cạm bẫy 2 — PII trẻ em/PH:** nội dung chat chứa SĐT/tên → **mask ở server** (không chỉ ẩn UI) qua `lib/lead/pii.ts`; log audit khi qualify (tạo Lead) như luồng admin.
- **Cạm bẫy 3 — qualify là điểm chuyển L1→L2:** `qualifyConversationToLead()` phải tạo `Lead` + gán `centerId` + set `handedAt`/`qualifiedAt` để đo SLA‑1/SLA‑2; **chống trùng SĐT** (dùng lại kiểm tra phone trùng của `createLeadManual`). Không tự "chốt" ở đây — chốt/convert là module riêng.
- **Ranh giới module — ĐÃ CHỐT (§10-Q10):** site Sale v1 chỉ làm từ **L2** → **tab này hoãn sau v1**, không render trong nav; điểm vào duy nhất của Sale cơ sở là `/sale/leads`. Đặc tả giữ lại cho phase mở rộng HO_SALE.

---

### 8. Lịch học thử tuần

**Mục đích:** Cho tư vấn viên (SALES_CSM) một màn "lịch tuần" gộp toàn bộ buổi học thử của các lead mình phụ trách — cả buổi đơn hệ V1 (`TrialClass` SCHEDULED/CONFIRMED) lẫn buổi của lớp trải nghiệm nhiều buổi hệ V2 (`TrialClassSession`) — nhóm theo ngày × khung giờ để chuẩn bị nhắc phụ huynh, sửa lịch/phòng/ghi chú và xếp con vào lớp trải nghiệm ngay tại card.

**Loại màn hình:** Trang danh sách (lịch tuần) + popup thao tác. Trang là một tuần dạng nhóm-theo-ngày (không phải bảng phẳng); mọi thao tác GHI đều mở **popup/dialog** trên nền trang (không rời màn), riêng "mở chi tiết lead" và "mở chi tiết lớp trải nghiệm" là **điều hướng sang trang khác** (thuộc nhóm sidebar khác).

**Đường dẫn:** `/sale/hoc-thu` (state tuần qua query param, vd `?week=2026-07-13`). Không cần route con `[id]` — mọi sửa/xếp lớp xử lý bằng popup; các liên kết "chi tiết" trỏ ra `/sale/leads/[id]` và `/sale/lop-trai-nghiem/[id]`.

**Bố cục & thành phần chính:**
- **`PageHeader`** — tiêu đề "Lịch học thử tuần", subtitle "Buổi học thử của lead bạn phụ trách trong tuần"; vùng `actions` bên phải: nút chuyển tuần trước/sau + nhãn khoảng ngày (Thứ 2 – CN).
- **Hàng `StatCard`** (tone brand/blue/amber): "Buổi trong tuần", "Buổi hôm nay", "Con chưa điểm danh (chờ dự)", "Lớp trải nghiệm đang mở" — số liệu trong scope Sale.
- **`ListToolbar`** — `SearchInput` (tìm tên con / SĐT phụ huynh) + bộ lọc Select: hệ (V1 buổi đơn / V2 lớp trải nghiệm / Tất cả), trạng thái buổi, khoá quan tâm, và (nếu user có >1 cơ sở) chọn cơ sở.
- **Thân lịch** — nhóm theo **ngày** (heading ngày), trong mỗi ngày liệt kê card theo **khung giờ**. Mỗi card 1 buổi hiển thị: giờ, tên con + năm sinh + khoá quan tâm, tên phụ huynh + SĐT (nút gọi), cơ sở, GV, phòng, và pill trạng thái. V1 dùng **`StatusPill`** (SCHEDULED/CONFIRMED/ATTENDED/REJECTED); V2 dùng **`SessionStatusPill`** (SCHEDULED/IN_PROGRESS/COMPLETED/CANCELLED) + badge "buổi k/N" và trạng thái điểm danh buổi đó. Nút thao tác nằm cuối card.
- **`EmptyState`** khi tuần không có buổi nào.
- Popup: dialog "Sửa buổi học thử" (form giờ/GV/phòng/ghi chú), dialog "Xếp con vào lớp trải nghiệm" (chọn lớp V2 OPEN cùng cơ sở + số buổi), confirm huỷ buổi.

**Dữ liệu hiển thị (đọc qua `scopedDb(actor)`, không `@/lib/db` trần):**
- **Hệ V1 — `TrialClass`**: `scheduledAt`, `status`, `note`, `centerId`, quan hệ `teacher (User.name)`, `room (Room.name)`, `lead (Lead.parentName/phone)`, `leadChild (LeadChild.name/birthYear/khoá quan tâm)`. Lọc `status ∈ {SCHEDULED, CONFIRMED}` và `scheduledAt` trong tuần, `lead.assignedToId = actor.id` (leads:view-own).
- **Hệ V2 — `TrialClassSession`**: `sessionNo`, `scheduledAt`, `status`; quan hệ `trialClassV2 (name, centerId, teacher, room, capacity/used)`, `trialEnrollment (leadChildId, totalSessions)`, `trialAttendance (status)` của con thuộc lead Sale. Lọc buổi trong tuần + lớp cùng cơ sở, chỉ lấy enrollment gắn `LeadChild` của lead Sale.
- **PII:** SALES_CSM có `leads:view-pii` → xem đầy đủ tên/SĐT phụ huynh (hiển thị nút gọi `tel:`). Vẫn giữ mask ở server để phòng role không-view-pii nếu sau này mở cho MARKETING. `scopedDb` đảm bảo CS1 không thấy buổi của CS2.

**Thao tác (actions):**

| Thao tác | Trang / Popup | Quyền cần | Server action tái dùng |
|---|---|---|---|
| Xem lịch tuần, đổi tuần, lọc, tìm | Trang (RSC đọc `?week=`) | `trials:view` | — (RSC đọc `scopedDb.trialClass` + `scopedDb.trialClassSession`) |
| Sửa buổi V1 (giờ / GV / phòng / ghi chú) | **Popup** (dialog form) | `trials:manage` | `updateTrialAction` (trials/actions.ts) |
| Huỷ buổi V1 | **Popup** (confirm 2-click) | `trials:manage` | `deleteTrialAction` (trials/actions.ts) |
| Xếp con vào lớp trải nghiệm V2 | **Popup** (chọn lớp OPEN + số buổi) | `trials:manage` | `enrollLeadChildAction` + `searchTrialCandidatesAction` (trial-classes/_actions.ts) |
| Mở chi tiết lead (chốt/ghi hoạt động) | **Trang mới** `/sale/leads/[id]` | `leads:view-own` | — (điều hướng) |
| Mở chi tiết lớp trải nghiệm (roster/điểm danh, read-only) | **Trang mới** `/sale/lop-trai-nghiem/[id]` | `trials:view` | — (điều hướng) |
| Điểm danh / hoàn tất buổi / chấm rubric | **Ẩn hoàn toàn** (Sale không có `trials:feedback`) | — | — |
| Đổi giờ **buổi V2** | Không sửa tại card tuần — điều hướng vào chi tiết lớp | `trials:manage` | (thuộc lớp V2, ngoài phạm vi màn này) |

**Trạng thái:**
- **Rỗng:** `EmptyState` tone slate "Tuần này chưa có buổi học thử nào" + gợi ý "Kéo lead sang trạng thái *Đã hẹn học thử* để tạo buổi, hoặc xếp con vào lớp trải nghiệm".
- **Loading:** skeleton card theo nhóm ngày (Suspense của RSC); popup có spinner trong `useTransition` khi submit.
- **Lỗi:** toast `sonner` đỏ với message VI từ action (`{ ok:false, error }`); lỗi tải trang → khối cảnh báo "Không tải được lịch, thử lại".
- **Không-có-quyền:** thiếu `trials:view` → layout/gate `/sale` redirect (menu ẩn tab, khớp PAGE_GATES). Có view nhưng thiếu `trials:manage` → card hiển thị read-only, ẩn nút Sửa/Huỷ/Xếp lớp.

**Quyền & phạm vi:** Gate tab = `trials:view`. Thao tác ghi = `trials:manage` (Sale có). Scope: đọc/ghi qua `scopedDb(actor)` (cách ly cơ sở, CS1 ≠ CS2) **cộng** filter `leads:view-own` (mỗi Sale chỉ thấy buổi của lead mình phụ trách). Sale **không** có `trials:feedback` / `trials:assign-teacher` / `trials:override-capacity` / `trials:config` → ẩn hẳn điểm danh, gán GV, vượt sĩ số, cấu hình số buổi.

**Ghi chú kỹ thuật:**
- **Tái dùng nguyên khối, không viết logic mới cho phần đọc:** gộp 2 nguồn `scopedDb.trialClass` (V1, `status ∈ SCHEDULED/CONFIRMED`) + `scopedDb.trialClassSession` (V2) trong 1 helper `lib/sale/trial-week.ts`, chuẩn hoá về một kiểu card chung (giờ, con, cơ sở, GV, phòng, trạng thái) rồi group theo ngày/khung giờ. Ghi thì gọi lại `updateTrialAction` / `deleteTrialAction` / `enrollLeadChildAction` (đã có guard permission + `passesScope` + audit) — chỉ lắp UI popup mới.
- **Cần build mới:** helper gộp/nhóm tuần, dialog "Xếp con vào lớp trải nghiệm" gọn cho Sale (dựa `searchTrialCandidatesAction`), 2 pill (V1 `StatusPill` vs V2 `SessionStatusPill`) trên cùng lưới. `StatusPill`/`SessionStatusPill` cần bổ sung từ điển trạng thái domain trial khi clone sang site Sale.
- **Cạm bẫy:**
  - **`centerId = null`** trên buổi/enrollment (bug đã gặp nhiều trang) làm `scopedDb` lọc rớt card hoặc leak — phải chắc `TrialClass.centerId`/`TrialClassV2.centerId` đã backfill; card thiếu centerId nên log cảnh báo, không âm thầm ẩn.
  - **Vượt sĩ số:** `enrollLeadChildAction` yêu cầu `trials:override-capacity` khi lớp đầy — Sale **không có** → dialog phải chặn với thông báo "Lớp đã đủ sĩ số, cần Quản lý cơ sở xếp", không nuốt lỗi.
  - **Đừng nhân đôi UI V1/V2:** đây là 2-phase song song; màn này chỉ ĐỌC gộp + thao tác nhẹ, mọi vòng đời sâu (roster, điểm danh, rubric) để nguyên ở trang chi tiết lớp — tránh lệch nguồn.
  - Không dùng Magic UI/Framer/Recharts (site Sale = shadcn thuần); mọi mutation vẫn `auth()` + `checkPermission` + `scopedDb` (layout gate là chưa đủ).

---

### 9. Lớp trải nghiệm

**Mục đích:** Cho Tư vấn viên (SALES_CSM) xem danh sách lớp trải nghiệm N buổi trong cơ sở của mình (sĩ số used/capacity, số buổi, trạng thái), tạo lớp mới, và ở màn chi tiết thì tìm & xếp con của lead vào lớp hoặc gỡ con ra. Sale KHÔNG điểm danh, KHÔNG gán GV, KHÔNG chấm rubric — chỉ xem read-only kết quả (không có quyền `trials:feedback` / `trials:assign-teacher` / `trials:override-capacity`).

**Loại màn hình:** Trang danh sách + popup thao tác, có 1 route con là trang chi tiết.
- `/sale/lop-trai-nghiem` — **Trang danh sách** (bảng lớp + toolbar + KPI).
- `/sale/lop-trai-nghiem/[id]` — **Trang chi tiết** (route riêng, không dialog) vì có nhiều section: roster HV, danh sách buổi, kết quả read-only.
- Tạo lớp và Xếp con là **Popup (dialog/sheet)** mở chồng lên trang, KHÔNG chuyển màn — để Sale thao tác nhanh không mất ngữ cảnh.

**Đường dẫn:**
- `/sale/lop-trai-nghiem` (danh sách).
- `/sale/lop-trai-nghiem/[id]` (chi tiết 1 lớp).

**Bố cục & thành phần chính:**
- **`PageHeader`** (tái dùng `_components/ui/page-header.tsx`): tiêu đề "Lớp trải nghiệm" + subtitle "N buổi trải nghiệm theo cơ sở của bạn"; vùng `actions` bên phải đặt nút **"+ Tạo lớp trải nghiệm"** (mở popup).
- **Hàng `StatCard`** (tái dùng `stat-card.tsx`, tone `brand`=tím Sale): (1) Số lớp đang mở (OPEN/RUNNING), (2) Tổng chỗ trống (Σ capacity − used), (3) HV đang trải nghiệm, (4) Lớp sắp đầy (used ≥ 80% capacity, tone `amber`).
- **`ListToolbar`** (tái dùng `list-toolbar.tsx`): `SearchInput` (tìm theo tên lớp) + Select lọc **Trạng thái** (OPEN/RUNNING/COMPLETED/CANCELLED) + Select lọc **Khoá quan tâm** (RoboSim/Robot). KHÔNG cần filter cơ sở (đã bị scopedDb ép về 1 cơ sở của Sale).
- **`DataTable`** (tái dùng `data-table.tsx`) — các cột:
  - Tên lớp (link → `/sale/lop-trai-nghiem/[id]`)
  - Khoá / chương trình (từ `TrialProgramConfig`)
  - Số buổi (`sessionCount` snapshot)
  - **Sĩ số** — hiển thị `used/capacity` + thanh nhỏ; `StatusPill` amber khi đầy
  - Trạng thái (`StatusPill`: OPEN/RUNNING/COMPLETED/CANCELLED)
  - GV phụ trách (chỉ hiển thị tên, read-only — Sale không đổi được)
  - Cột thao tác: nút "Chi tiết" + "Xếp con vào lớp"
- **`EmptyState`** khi cơ sở chưa có lớp trải nghiệm nào.
- **Trang chi tiết `[id]`:** `PageHeader` (tên lớp + `SessionStatusPill`) → section **Thông tin lớp** (số buổi, sĩ số, GV read-only, giờ học) → section **Học viên trong lớp** (`DataTable`: tên con + năm sinh + lead nguồn + số buổi per-lead + nút "Gỡ") → section **Các buổi** (danh sách `TrialClassSession` với `SessionStatusPill`, read-only, KHÔNG có nút điểm danh/hoàn tất) → section **Kết quả trải nghiệm** (read-only điểm rubric + xếp loại nếu GV đã chấm, để Sale follow-up chốt).

**Dữ liệu hiển thị (Prisma, qua `scopedDb(actor)`):**
- `TrialClassV2` — `name`, `centerId`/`orgUnitId`, `sessionCount` (snapshot), `capacity`, `status` (OPEN/RUNNING/COMPLETED/CANCELLED), `teacherId` (chỉ đọc tên GV), `startTime`. (∈ SCOPED_MODELS → scopedDb tự lọc centerId, CS1 không thấy lớp CS2.)
- `TrialProgramConfig` — `name`, `sessionCount` (để hiển thị chương trình + mặc định khi tạo). Sale KHÔNG sửa config (thiếu `trials:config`).
- `TrialEnrollment` — đếm `used` (COUNT theo classId), `totalSessions` per-lead (1..60), `leadChildId`.
- `TrialClassSession` — `status`, thứ tự buổi, ngày (read-only).
- `LeadChild` — tên con, năm sinh, khoá quan tâm, `trialStatus` (NONE/SCHEDULED/IN_PROGRESS/ATTENDED).
- `TrialRubricEval` — `totalScore`/`rank` (chỉ đọc để Sale biết kết quả GV chấm).
- **PII:** trang lớp trải nghiệm cấp Sale hiển thị tên con + lead nguồn; SALES_CSM có `leads:view-pii` nên xem được tên PH/SĐT của lead nguồn khi cần follow-up. GV bị ẩn PII PH — nhưng đây là site Sale nên không strip. Vẫn giữ mask qua server nếu về sau có role không có `leads:view-pii` đọc màn này.

**Thao tác (actions):**

| Thao tác | Trang / Popup | Quyền cần | Server action tái dùng |
|---|---|---|---|
| Xem danh sách lớp | Trang `/sale/lop-trai-nghiem` (RSC) | `trials:view` | đọc qua `scopedDb.trialClassV2` (không action mới) |
| Xem chi tiết 1 lớp | Trang `/sale/lop-trai-nghiem/[id]` (route con) | `trials:view` | `loadScopedTrialClass` (+ `passesScope` chống IDOR) |
| Tạo lớp trải nghiệm | **Popup** (dialog form) | `trials:manage` | `createTrialClassAction` (`trial-classes/_actions.ts`) — buổi tự sinh né Holiday |
| Tìm ứng viên (con của lead) | **Popup** (trong dialog "Xếp con", ô search) | `trials:manage` | `searchTrialCandidatesAction` |
| Xếp con vào lớp | **Popup** (dialog "Xếp con vào lớp") | `trials:manage` | `enrollLeadChildAction` — hỏi xác nhận nếu vượt sĩ số, nhưng Sale KHÔNG override được (thiếu `trials:override-capacity`) → chặn, chỉ CM vượt |
| Gỡ con khỏi lớp | **Popup xác nhận** (2-click confirm) trên trang chi tiết | `trials:manage` | `unenrollLeadChildAction` — chặn nếu con đang ở lớp ACTIVE theo ràng buộc hiện có |
| Xem kết quả rubric (read-only) | Trang chi tiết (không action ghi) | `trials:view` | đọc `TrialRubricEval` (KHÔNG `saveTrialRubricAction`) |

- **ẨN HẲN** các nút không thuộc quyền Sale: điểm danh (`markTrialAttendanceAction`), hoàn tất buổi (`completeTrialSessionAction`), gán GV (`assignTrialTeacherAction`), chấm rubric (`saveTrialRubricAction`), cấu hình số buổi (`saveTrialConfigAction`). Ẩn ở UI + vẫn gate ở server (defense-in-depth) — nếu render nhầm, action tự throw vì thiếu permission.

**Trạng thái:**
- **Rỗng:** `EmptyState` (icon lớp học, tone slate) "Cơ sở chưa có lớp trải nghiệm nào" + nút "+ Tạo lớp trải nghiệm" (nếu có `trials:manage`).
- **Loading:** Suspense skeleton cho `DataTable` (RSC + streaming); popup form có nút submit spinner trong `useTransition`.
- **Lỗi:** toast `sonner` từ kết quả action `{ ok:false, error }`; lỗi tải trang → error boundary của route group Sale. Vượt sĩ số khi Sale xếp con → toast "Lớp đã đầy, cần Quản lý cơ sở duyệt vượt sĩ số" (không cho Sale override).
- **Không-có-quyền:** thiếu `trials:view` → page-gate redirect về dashboard Sale (menu ẩn mục này theo `it.perm.some`). Có `trials:view` nhưng thiếu `trials:manage` → hiển thị read-only, ẩn nút Tạo/Xếp/Gỡ.

**Quyền & phạm vi:**
- **Gate tab:** `trials:view` (SALES_CSM có) — là điều kiện vào trang; nút ghi cần thêm `trials:manage` (SALES_CSM có).
- **Scope:** CENTER — Sale chỉ thấy lớp trải nghiệm cơ sở mình. Cách ly cơ sở do `scopedDb(actor)` ép ở tầng query (CS1 không thấy CS2), KHÔNG dựa role matrix. Mọi mutation kèm `passesScope('TrialClassV2', before, actor)` chống IDOR liên cơ sở.
- Sale KHÔNG có: `trials:feedback`, `trials:assign-teacher`, `trials:override-capacity`, `trials:config`.

**Ghi chú kỹ thuật:**
- **Tái dùng nguyên khối** các server action đã gate sẵn từ `app/(admin)/admin/trial-classes/_actions.ts`: `createTrialClassAction`, `searchTrialCandidatesAction`, `enrollLeadChildAction`, `unenrollLeadChildAction`, `loadScopedTrialClass`. Chúng đã có `checkPermission` + `scopedDb` + `passesScope` + validate buổi-thuộc-lớp → site Sale chỉ lắp UI mới gọi lại, **KHÔNG viết lại logic**.
- **Build mới:** vỏ UI cho site Sale (dùng `_components/ui/*` clone từ site GV: `PageHeader`/`DataTable`/`ListToolbar`/`StatCard`/`StatusPill`/`SessionStatusPill`/`EmptyState`); popup Tạo lớp + popup Xếp con; trang chi tiết read-only rút gọn (bỏ mọi khối điểm danh/GV/rubric).
- **Chốt hệ V1 vs V2:** màn này dùng **hệ V2 (TrialClassV2)** — lớp trải nghiệm nhiều buổi. Hệ V1 (`TrialClass` buổi đơn auto-sinh khi kéo lead sang TRIAL_SCHEDULED) nằm ở tab "Học thử" khác; đừng nhân đôi UI ở đây.
- **Cạm bẫy centerId=null:** khi tạo lớp / xếp con phải set `centerId` theo cơ sở của Sale (từ actor), nếu để null enrollment sẽ rơi khỏi scope query và không hiện ở đâu (bug centerId=null enrollment gặp nhiều trang). `createTrialClassAction` đã denormalize centerId — giữ nguyên.
- **Không phải nơi chốt đơn:** module trial chỉ đẩy `LeadChild.trialStatus`/lead status tới TRIAL_ATTENDED. "Chốt đăng ký" là luồng convert R7-05 riêng (`/sale/.../convert`), không nhúng ở tab này — chỉ đặt link "Follow-up chốt" từ kết quả rubric sang màn chốt (chặn convert chưa thanh toán theo QĐ-O, guard `PAYMENT_REQUIRED`).
- **StatusPill/SessionStatusPill:** cần bổ sung từ điển trạng thái V2 (OPEN/RUNNING/COMPLETED/CANCELLED cho lớp; SCHEDULED/IN_PROGRESS/COMPLETED/CANCELLED cho buổi) — `SessionStatusPill` hiện có sẵn cho `ClassSession`, tái dùng gần như nguyên xi cho `TrialClassSession`.

---

### 10. Kết quả chờ chốt

**Mục đích:** "Inbox chốt đơn" của tư vấn viên: gom các học viên đã học thử xong (`LeadChild.trialStatus = ATTENDED`) nhưng chưa đăng ký, hiển thị kèm điểm rubric + nhận xét của giáo viên (chỉ đọc) để Sale gọi follow-up và bấm chốt. Đây là màn hình có giá trị chuyển đổi cao nhất trong nhóm Học thử.

**Loại màn hình:** **Trang danh sách + popup thao tác.**
- Trang chính `/sale/cho-chot` = bảng danh sách (list) các HV chờ chốt.
- Xem chi tiết rubric + nhận xét GV → **Sheet/Dialog read-only** (mở tại chỗ, không rời trang).
- Ghi follow-up (gọi/nhắn) → **Dialog popup** nhỏ.
- Đánh dấu "Nuôi dưỡng"/"Đã mất" → **Dialog popup** xác nhận.
- **Chốt đăng ký → mở TRANG MỚI** (luồng convert full-page), không nhúng popup vì đây là form dài nhiều bước (phụ huynh + N học viên + học phí + consent), tái dùng nguyên luồng convert v2.

**Đường dẫn:**
- `/sale/cho-chot` — danh sách chờ chốt (trang chính).
- `/sale/cho-chot/[leadChildId]` (tuỳ chọn) — deep-link mở sẵn Sheet chi tiết rubric của 1 HV (chia sẻ/bookmark).
- Nút "Chốt đăng ký" điều hướng sang trang convert của site Sale (vd `/sale/leads/[id]/convert`) — KHÔNG phải route con của tab này.

**Bố cục & thành phần chính:** (tái dùng UI kit site GV, chỉ đổi từ điển trạng thái sang domain Sale)
- **`PageHeader`** — tiêu đề "Kết quả chờ chốt" + subtitle "HV đã học thử xong, chờ đăng ký" + vùng `actions` (nút refresh/bộ lọc nhanh).
- **Hàng `StatCard`** (3–4 thẻ KPI, tone ngữ nghĩa): "Chờ chốt" (tổng, tone `brand`) · "Đạt loại Giỏi/Khá" (rubric rank cao, tone `green`) · "Quá 3 ngày chưa liên hệ" (tone `amber`) · "Chưa đủ điều kiện tiền" (tone `red`).
- **`ListToolbar`** — `SearchInput` (tìm tên HV/tên PH/SĐT) + các `Select` lọc: theo **cơ sở** (chỉ hiện nếu user đa cơ sở; Sale 1 cơ sở → nhãn tĩnh), theo **xếp loại rubric** (Giỏi/Khá/TB/Yếu), theo **điều kiện tiền** (đủ/chưa), theo **lớp trải nghiệm**.
- **`DataTable`** — mỗi dòng 1 HV chờ chốt, cột:
  - Học viên (tên con + năm sinh) · Phụ huynh + SĐT (bấm gọi) · Khoá quan tâm.
  - Lớp trải nghiệm (tên `TrialClassV2`) + tiến độ buổi (vd 4/4 — có `TrialAttendance` dự đủ buổi hay không).
  - **Điểm rubric** (`totalScore` /8.0) + **`StatusPill`** xếp loại (rank) — read-only.
  - Ngày học thử gần nhất · Trạng thái lead (`StatusPill`: TRIAL_ATTENDED "Đã học thử").
  - Cờ **"Đủ điều kiện chốt"** (badge từ `getLeadPaymentSummary`).
  - Cột hành động (nút mở Sheet / follow-up / Chốt).
- **`EmptyState`** khi không có HV chờ chốt (tone `green` + thông điệp "Đã chốt hết — không còn HV chờ").
- **Sheet chi tiết (read-only)**: khối rubric 3 nhóm × 2 tiêu chí (focus/interact/keyboard/experience/absorb/logic) + tổng điểm + xếp loại + **nhận xét văn bản của GV** + lịch sử điểm danh từng buổi (`TrialAttendance`) + `LeadTrialHistory` (đã từng học thử/outcome). KHÔNG có nút chấm/sửa (Sale không có `trials:feedback`).

**Dữ liệu hiển thị:** (đọc qua `scopedDb(actor)` — cách ly cơ sở)
- `LeadChild`: `id`, `fullName`, `birthYear`, `trialStatus` (lọc `= ATTENDED`), khoá quan tâm.
- `Lead`: `id`, `parentName`, `parentPhone`, `parentEmail`, `status` (lọc `= TRIAL_ATTENDED`, loại `REGISTERED`/`ENROLLED`), `assignedToId` (filter own), `centerId`, `lastActivityAt` (tính "quá X ngày chưa liên hệ").
- `TrialEnrollment` → `TrialClassV2` (tên lớp, cơ sở, GV) + `TrialClassSession`/`TrialAttendance` (số buổi dự đủ).
- `TrialRubricEval`: `totalScore`, `rank`, các điểm tiêu chí, `comment` (nhận xét GV) — **read-only**.
- `getLeadPaymentSummary(sdb, leadId)`: đã nộp / tổng phải thu / còn thiếu / `eligible` (điều kiện chốt).
- **PII**: SĐT/email/tên PH-HS hiển thị đầy đủ cho SALES_CSM (có `leads:view-pii`); nếu tab phục vụ role không có view-pii (vd MARKETING) thì tái dùng `maskLeadPiiFields` ở **server** (không chỉ ẩn UI). Site GV đã strip PII PH khỏi rubric, nên khi lấy `comment`/điểm không kèm PII rò rỉ.

**Thao tác (actions):**

| Thao tác | Trang / Popup | Quyền cần | Server action tái dùng |
|---|---|---|---|
| Xem chi tiết rubric + nhận xét GV | **Sheet/Dialog (read-only)** | `trials:view` | RSC read qua `scopedDb.trialRubricEval` / `trialEnrollment` (không action ghi) |
| Ghi follow-up (CALL/MESSAGE/NOTE) | **Dialog popup** | `leads:view-own` (+ owner) | `addLeadActivity` (reset `lastActivityAt`/SLA) |
| Đánh dấu "Đang nuôi dưỡng" (NURTURING) | **Dialog popup** xác nhận | `leads:edit` (+ `actorMayMutateLead`) | `updateLeadStatus` (guard transition) |
| Đánh dấu "Đã mất" (LOST) + lý do | **Dialog popup** xác nhận | `leads:edit` | `updateLeadStatus` |
| Chốt đăng ký | **TRANG MỚI** (convert full-page) | `students:create` + `enrollments:create` (+ flag `CONVERT_V2_ENABLED`) | `submitConvertV2` → `convertLeadV2` (atomic) |
| Tạo đơn / ghi nhận thanh toán (khi chưa đủ điều kiện tiền) | **TRANG MỚI** (order) / **Dialog** | `payments:record` | `createOrderManualAction` + `recordPaymentAction` |

- Nút "Chốt đăng ký" **disable + tooltip** khi `getLeadPaymentSummary.eligible = false`, kèm link "Tạo đơn / Ghi nhận thanh toán trước" (dẫn sang luồng order → payment). Không tự mở convert để tránh lỗi `PAYMENT_REQUIRED`.
- KHÔNG hiển thị nút điểm danh / gán GV / chấm rubric (Sale không có quyền — ẩn hẳn cho gọn).

**Trạng thái:**
- **Rỗng:** `EmptyState` tone `green` "Không còn HV chờ chốt" (đã chốt hết hoặc chưa có ai học thử xong).
- **Loading:** skeleton rows trong `DataTable` (RSC + Suspense); Sheet rubric có skeleton khi fetch chi tiết.
- **Lỗi:** nếu 1 nguồn (rubric/payment summary) lỗi → hiện dòng với badge "— chưa có điểm" thay vì vỡ cả bảng (fan-out `.catch`); lỗi toàn trang → thông báo "Không tải được danh sách, thử lại".
- **Không-có-quyền:** người vào tab thiếu `trials:view` → route-gate redirect về trang mặc định site Sale (menu ẩn tab đồng bộ `PAGE_GATES`, tránh dead-link).

**Quyền & phạm vi:**
- **Permission gate của tab:** `trials:view` (xem kết quả học thử) + `leads:view-own` (đọc lead được giao). SALES_CSM có cả hai.
- **Scope:** `leads:view-own` → **OWN** (chỉ lead `assignedToId = self`, trừ khi có `leads:view-all`). `trials:view` scope **CENTER**. Cách ly cơ sở KHÔNG do role mà do `scopedDb(actor)` ép ở tầng query (CS1 không thấy trial/lead CS2). Ghi (follow-up, đổi status) còn qua `passesScope` + `actorMayMutateLead` chống IDOR.

**Ghi chú kỹ thuật:**
- **Tái dùng nguyên khối, KHÔNG viết lại logic:** `getLeadPaymentSummary`, `addLeadActivity`, `updateLeadStatus`, `submitConvertV2`/`convertLeadV2` — đều đã gate permission + `scopedDb` + mask PII + audit. Tab này chỉ lắp UI mới.
- **Đọc rubric read-only:** query `TrialRubricEval` join `TrialEnrollment`/`TrialClassSession` qua `scopedDb`; server đã tính lại `totalScore`/`rank` (không tin client). Sale chỉ hiển thị.
- **Điểm cần build mới:** truy vấn danh sách "chờ chốt" (`LeadChild.trialStatus = ATTENDED` ∧ lead `status = TRIAL_ATTENDED` ∧ chưa `REGISTERED/ENROLLED`) — nên đóng gói ở `lib/sale/pending-close.ts` để page chỉ gọi 1 helper; scope bắt buộc qua `scopedDb`.
- **Cạm bẫy:**
  - **Chặn convert chưa thanh toán:** `convertLeadV2` trả `PAYMENT_REQUIRED` nếu chưa có ≥1 `Payment` RECORDED (trừ học bổng toàn phần). UI phải phản ánh bằng badge/disable, không để user bấm rồi văng lỗi.
  - **`centerId = null` trên Enrollment:** convert v2 denormalize `centerId` theo lead; nếu lead thiếu cơ sở, kết quả chờ chốt và convert sẽ lệch scope — cần đảm bảo lead đã có `centerId` (đã auto-chia) trước khi vào tab này.
  - **Tiền đi transaction:** tạo Student + Enrollment + consent chạy ATOMIC trong `convertLeadV2`; đợt 2 học phí là non-atomic (PENDING_APPROVAL) → tách bước, báo "đã gửi duyệt", đừng để hiểu nhầm đã thu đủ.
  - **Tách nhiệm vụ tiền:** Sale chỉ `payments:record` (RECORDED); KHÔNG hiện xác nhận/Receipt/hoàn tiền (thuộc kế toán) — hiển thị "chờ kế toán xác nhận".
  - **Tiêu chí "chờ chốt" — ĐÃ CHỐT QĐ-7: 1 nguồn chân lý duy nhất = `LeadChild.trialStatus = ATTENDED`** (per-con); `Lead.status=TRIAL_ATTENDED` chỉ là giá trị suy ra để hiển thị, "dự đủ N buổi" (`TrialAttendance`) chỉ là dữ kiện tham khảo trên card — **không** dùng 2 nguồn sau làm điều kiện lọc, tránh HV lọt/lặp.

---

### 11. Chốt lead (Chuyển đổi)

**Mục đích:** Chốt deal theo luồng Convert v2 — biến 1 lead đủ điều kiện thành phụ huynh + học viên + ghi danh + consent + kế hoạch học phí 1/2 đợt trong MỘT giao dịch ATOMIC. Đây là entry-point DUY NHẤT để chốt (bỏ flow gộp cũ); giá đọc lại từ DB, chặn convert khi chưa ghi nhận thanh toán.

**Loại màn hình:** **Trang riêng** (full page). Đây là bước cuối nặng dữ liệu (form phụ huynh + N học viên + kế hoạch học phí), cố ý KHÔNG dùng dialog để có đủ không gian và tránh mất dữ liệu khi đóng nhầm. Trong trang có vài thao tác phụ dạng inline/popup nhỏ (xem bảng Thao tác), nhưng bản thân màn Chốt là một route riêng điều hướng tới từ nút "Chuyển đổi" ở trang chi tiết lead `/sale/leads/[id]`.

**Đường dẫn:** `/sale/leads/[id]/convert`
- Không có route con. Xử lý xung đột phụ huynh (PARENT_CONFLICT) điều hướng SANG trang khác đã có: `/sale/convert-conflicts` (clone của `/admin/convert-conflicts`), không phải route con của convert.
- Điều kiện tiền được chuẩn bị ở bước trước qua `/sale/don-hang/moi?leadId=...` (tạo đơn) → `/sale/thu-phi` hoặc section trên `/sale/don-hang/[id]` (ghi nhận khoản).

**Bố cục & thành phần chính:** (tái dùng UI kit clone từ site GV, tone tím `#7C3AED` cho `.sale-root`)
- **`PageHeader`** — tiêu đề "Chốt lead: {tên PH} — {SĐT}", subtitle trạng thái lead hiện tại (StatusPill), vùng actions bên phải: nút "Quay lại lead".
- **`StatCard` (dải điều kiện chốt)** — 3 thẻ đọc từ `getLeadPaymentSummary`: Đã nộp (RECORDED) · Tổng phải thu · Còn thiếu; tone `green` khi đủ điều kiện, `amber` khi thiếu. Kèm badge "Đủ điều kiện chốt" / "Cần ghi nhận thanh toán trước".
- **Form phụ huynh** (shadcn `Input`/`Select`) — họ tên, SĐT, email, CCCD, địa chỉ (lưu lên `User` PARENT). Có `EmptyState`/cảnh báo nếu phát hiện trùng (dedupe).
- **Danh sách học viên (per-child, lặp theo `LeadChild`)** — mỗi con 1 khối: tên, ngày sinh, chọn lớp (`Select` các Class OPEN cùng cơ sở), checkbox "Đồng ý sử dụng hình ảnh" (StudentConsent). Hiển thị listPrice snapshot đọc từ `class.course.price` (read-only, không cho sửa giá).
- **Khối kế hoạch học phí** — radio 1 đợt (FULL) / 2 đợt (TWO); nếu TWO: input số tiền đợt 1 + ngày hẹn đợt 2, hiển thị tự tính đợt 2 = tổng − đợt 1 (`computeInstallmentSplit`), kèm ghi chú "đợt 2 cần QL cơ sở duyệt".
- **Vùng submit** — nút "Xác nhận chuyển đổi" (disabled khi chưa đủ điều kiện tiền), text phụ "giá đọc từ hệ thống, ưu đãi áp ở bước tạo đơn".
- KHÔNG dùng `DataTable`/`ListToolbar` ở trang này (đây là form, không phải list).

**Dữ liệu hiển thị:** (mọi read/write qua `scopedDb(actor)` — CS1 không thấy lead CS2)
- `Lead` (parentName/phone/email/status/centerId/assignedToId) + `LeadChild[]` (tên/ngày sinh/khoá quan tâm/trialStatus).
- `Order` + `Payment` (saleStatus=RECORDED) qua `getLeadPaymentSummary(sdb, leadId)` → đã nộp / tổng phải thu / còn thiếu / cờ eligible.
- `Class` → `Course.price` (listPrice snapshot cho Enrollment, đọc server-side, KHÔNG tin client).
- PII: SALES_CSM có `leads:view-pii` → thấy đầy đủ SĐT/email/tên PH-HS; nếu site Sale có role không view-pii (vd MARKETING) thì `maskLeadPiiFields` che ở server. CCCD/địa chỉ đầy đủ cần `payments:view-pii` (break-glass) — Sale thường không có, chỉ nhập mới không đọc lại bản đầy đủ đã lưu.

**Thao tác (actions):**

| Thao tác | Trang/Popup | Quyền cần | Server action tái dùng |
|---|---|---|---|
| Xác nhận chuyển đổi (chốt) | **Trang** (submit tại chỗ, redirect về lead/HV sau thành công) | `students:create` + `enrollments:create` + flag `CONVERT_V2_ENABLED` | `submitConvertV2` → `convertLeadV2` (ATOMIC) |
| Tạo đơn hàng cho lead (tiền đề) | **Trang** (điều hướng `/sale/don-hang/moi?leadId=`) | `orders:manage`/`orders:create` (⚠ xem Ghi chú) | `createOrderManualAction` + `previewVoucherAction` |
| Ghi nhận thanh toán | **Trang** hoặc **popup** trong `/sale/thu-phi` (giữ mô hình admin) | `payments:record` | `recordPaymentAction` → `recordPayment` |
| Xử lý xung đột phụ huynh | **Trang** (điều hướng `/sale/convert-conflicts`) | `students:create` | (đọc `ConvertConflict`; không ghi đè) |
| Xem trước giảm giá voucher | **Popup/inline** trong bước tạo đơn (không ở màn convert) | `orders:view` | `previewVoucherAction` |
| Gửi duyệt kế hoạch 2 đợt | Chạy **ngầm sau** submit (non-atomic) | `enrollments:create` | `recordInstallmentPlan` + `requestInstallmentApproval` |

Ghi chú page-vs-popup: màn Chốt tự nó là trang; nút bấm chính "Xác nhận chuyển đổi" submit ngay trong trang rồi redirect. Các bước chuẩn bị tiền (tạo đơn / ghi nhận payment) là điều hướng sang trang khác hoặc popup của module payments, KHÔNG nhúng inline vào form convert để giữ tách bạch "ghi nhận tiền" (Sale) và "chốt" (convert).

**Trạng thái:**
- **Rỗng/chưa đủ điều kiện:** khi `getLeadPaymentSummary.eligible=false` → dải StatCard tone amber + banner "Cần ghi nhận ≥1 khoản thanh toán trước khi chốt" + nút "+ Tạo đơn hàng cho lead này"; nút Xác nhận disabled.
- **Loading:** submit trong `useTransition`, disable nút + spinner "Đang chốt…"; convert chạy trong transaction có thể mất vài giây.
- **Lỗi:** hiển thị theo code trả về — `PAYMENT_REQUIRED` (chưa ghi nhận tiền), `PARENT_CONFLICT` (điều hướng convert-conflicts, KHÔNG cho ghi đè), `CLASS_FULL`/validate lớp, hoặc `installmentWarning` (chốt thành công nhưng gửi duyệt 2 đợt lỗi — chỉ cảnh báo, không rollback). Toast `sonner` error.
- **Không-có-quyền:** thiếu `students:create`/`enrollments:create` (vd role MARKETING) → gate redirect về dashboard sale; flag `CONVERT_V2_ENABLED` OFF → ẩn nút Chuyển đổi ngay từ trang lead.

**Quyền & phạm vi:**
- Page gate: `students:create` **và** `enrollments:create` (cả hai) — SALES_CSM có đủ; MARKETING bị loại.
- Scope: `leads:view-own` (SALES_CSM chỉ chốt lead `assignedToId === user.id`; owner check trong `convertLeadV2`). Cách ly cơ sở do `scopedDb(actor)` + `passesScope('Lead'/'Order')` ép ở tầng query (CENTER), không dựa role. Ghi nhận tiền: `payments:record` (Sale), xác nhận là việc kế toán (`payments:confirm` — Sale KHÔNG có).

**Ghi chú kỹ thuật:**
- **Tái dùng nguyên khối, KHÔNG viết lại logic:** `submitConvertV2`/`convertLeadV2` (idempotencyKey sha256 chống double-submit; atomic-claim `updateMany` lead→ENROLLED chống race; upsert User PARENT PENDING_ACTIVATION; genStudentCodeV2; tạo Enrollment với centerId denormalize + leadChildId; StudentConsent + audit; publishEvent `lead.converted`/`consent.granted` SAU commit). Site Sale chỉ lắp UI gọi lại action đã có guard + scope + audit đầy đủ.
- **Cạm bẫy tiền/atomic:** guard `evaluatePaymentGuard` cố ý pass khi Payment mới RECORDED (chưa CONFIRMED) — vì Receipt sinh per-Enrollment nên đòi CONFIRMED trước = deadlock. Đừng "sửa" thành đòi CONFIRMED. Kế hoạch 2 đợt chạy NON-atomic sau convert (`requestInstallmentApproval` PENDING_APPROVAL) — lỗi chỉ trả `installmentWarning`, phải báo rõ "đã gửi duyệt" tránh hiểu nhầm đã thu đủ.
- **Cạm bẫy centerId=null:** Enrollment/Order phải có centerId (denormalize từ lead) để scopedDb lọc đúng — lead thiếu centerId (chưa auto-chia) sẽ hỏng scope; kiểm tra lead đã có cơ sở trước khi cho vào màn convert.
- **Ưu đãi:** convert v2 set `finalPrice = listPrice, discount = 0` — voucher/chiết khấu sống trên **Order**, không trên Enrollment. Nếu cần giảm học phí, áp ở bước tạo đơn (`voucherCode`), không thêm field discount vào form convert.
- **Điểm cần build mới:** vỏ UI trang `/sale/leads/[id]/convert` trong route group Sale mới + wiring flag `CONVERT_V2_ENABLED` (ẩn nút khi OFF). **GAP quyền — ĐÃ CHỐT QĐ-4:** `orders:manage` hiện = [SUPER_ADMIN, CENTER_MANAGER, ACCOUNTANT] — SALES_CSM KHÔNG có → vá bằng action hẹp **`orders:create`** cho Sale (chỉ tạo đơn gắn lead của mình; parity 3 file, PR RBAC riêng TRƯỚC P0). Blocker đã có lời giải, không còn treo.

---

### 12. Đơn hàng

**Mục đích:** Cho tư vấn viên tạo/xem Đơn hàng gắn với một lead (áp voucher, chọn gói học/khoá/sản phẩm) để có tổng phải thu — đây là tiền đề bắt buộc để ghi nhận thanh toán và mở khoá điều kiện chuyển đổi (convert) lead thành học viên.

**Loại màn hình:** Trang danh sách + popup thao tác. Trang danh sách `/sale/don-hang` (bảng đơn) và trang chi tiết riêng `/sale/don-hang/[id]`. Thao tác **Tạo đơn** và **Ghi nhận thanh toán** mở dưới dạng **popup (sheet trượt phải)** để thao tác nhanh trên nền lead/đơn; **xem trước voucher** là tương tác inline trong popup tạo đơn (không mở màn mới).

**Đường dẫn:**
- `/sale/don-hang` — danh sách đơn (trang).
- `/sale/don-hang/[id]` — chi tiết đơn (trang).
- `/sale/don-hang/moi?leadId=...` — tuyến dự phòng khi cần form full-page (mặc định mở popup sheet; giữ route để deep-link từ chi tiết lead).

**Bố cục & thành phần chính:**
- `PageHeader` (tái dùng UI kit GV): tiêu đề "Đơn hàng" + subtitle, vùng actions bên phải chứa nút **+ Tạo đơn** (mở sheet).
- Hàng thẻ KPI `StatCard` (tone brand/amber/emerald): "Đơn tháng này", "Chờ thanh toán" (chưa có Payment RECORDED), "Đã đủ điều kiện chốt" (order có Payment RECORDED).
- `ListToolbar` (SearchInput + Select filters): tìm theo mã đơn / tên PH / SĐT; lọc theo trạng thái đơn, loại đơn (COURSE/PACKAGE/PRODUCT), khoảng ngày.
- `DataTable` cột: **Mã đơn** · **Lead/Phụ huynh** (tên — theo PII) · **Loại đơn** · **Gói/Khoá/Sản phẩm** (tóm tắt OrderItem) · **Voucher** (mã + số giảm) · **Tổng phải thu** · **Đã thu / Còn thiếu** · **Trạng thái** (`StatusPill`) · **Ngày tạo** · hành động (mở chi tiết / ghi nhận TT).
- Chi tiết `/sale/don-hang/[id]`: header mã đơn + `StatusPill`; block thông tin lead gắn kèm (link sang chi tiết lead); bảng OrderItem (tên, đơn giá đọc từ DB, số lượng, thành tiền); dòng voucher + chiết khấu; tổng phải thu; block thanh toán (đã thu/còn thiếu, nút **Ghi nhận thanh toán** popup) với nhãn trạng thái "chờ kế toán xác nhận"; nút điều hướng **Chốt/Chuyển đổi** (nếu đủ điều kiện).
- `EmptyState` khi chưa có đơn nào trong scope.

**Dữ liệu hiển thị (model/field Prisma, tôn trọng PII + scopedDb):**
- `Order` (leadId, orderType, status, totalAmount/finalAmount, centerId) — đọc qua `scopedDb(actor)` để cách ly cơ sở (CS1 không thấy đơn CS2).
- `OrderItem` (packageId/courseId/productId, unitPrice, quantity) — giá **đọc lại từ DB** (`class.course.price` / `CoursePackage` / `Product`), không tin client.
- `Voucher` + `VoucherRedemption` (code, kind PERCENT/FIXED, discountValue, maxDiscount).
- `CoursePackage` (đơn vị bán, liên kết Course dạy), `Product` (tồn kho khi đơn PRODUCT), `PaymentMethod`.
- `Payment` (saleStatus=RECORDED / accountantStatus) để tính đã thu/còn thiếu — qua `getLeadPaymentSummary`.
- **PII:** tên/SĐT/email PH-HS trên đơn hiển thị đầy đủ cho SALES_CSM (có `leads:view-pii`); nếu tab phục vụ role không có view-pii thì mask ở SERVER (dùng lại `maskLeadPiiFields`), không chỉ ẩn UI.

**Thao tác (actions):**

| Thao tác | Trang / Popup | Quyền cần | Server action tái dùng |
|---|---|---|---|
| Xem danh sách đơn | **Trang** `/sale/don-hang` | `orders:view` | RSC đọc qua `scopedDb.order` |
| Xem chi tiết đơn | **Trang** `/sale/don-hang/[id]` | `orders:view` + `passesScope('Order')` | RSC đọc + `getLeadPaymentSummary` |
| Tạo đơn (gắn lead, chọn item) | **Popup** (sheet trượt phải) | ⚠️ `orders:manage` (GAP — xem ghi chú) | `createOrderManualAction` |
| Xem trước giảm giá voucher | **Inline** trong popup tạo đơn | `orders:view` | `previewVoucherAction` |
| Ghi nhận thanh toán cho đơn | **Popup** (dialog trên chi tiết) | `payments:record` | `recordPaymentAction` → `lib/finance/payment.recordPayment` |
| Điều hướng Chốt/Chuyển đổi | **Trang** (link sang màn convert) | `students:create` + `enrollments:create` | `submitConvertV2` (ở tab Chuyển đổi) |

Ghi rõ: **danh sách + chi tiết = trang** (điều hướng, cần URL chia sẻ/deep-link); **tạo đơn + ghi nhận thanh toán = popup** (thao tác nhanh, giữ ngữ cảnh lead/đơn, không rời màn). Xác nhận thanh toán / hoàn tiền / xuất phiếu thu **KHÔNG hiển thị** trên site Sale (thuộc Kế toán `payments:confirm`).

**Trạng thái:**
- **Rỗng:** `EmptyState` (tone slate) "Chưa có đơn hàng nào" + gợi ý "Tạo đơn từ một lead để bắt đầu"; nếu vào từ `?leadId` chưa có đơn → CTA tạo đơn nổi bật.
- **Loading:** skeleton bảng (Suspense của RSC); popup tạo đơn có trạng thái tính voucher (nút "Áp mã" disabled + spinner khi gọi `previewVoucherAction`).
- **Lỗi:** lỗi validate voucher (VD `VOUCHER_QUANTITY_EXCEEDED_RACE`, hết lượt, dưới `minOrderValue`) hiển thị toast `sonner` + thông báo inline trong sheet; lỗi ghi nhận TT hiện toast, không đóng popup.
- **Không-có-quyền:** thiếu `orders:view` → page-gate redirect về dashboard Sale; nút **Tạo đơn** ẩn hẳn nếu actor thiếu `orders:manage`/`orders:create` (menu ≡ cổng, tránh dead-link).

**Quyền & phạm vi:**
- Gate tab: `orders:view` (SALES_CSM có) — scope **CENTER** qua `scopedDb(actor)` (chỉ đơn cơ sở của mình; SUPER_ADMIN/HO bypass).
- Tạo đơn: hiện `orders:manage` scope CENTER — **SALES_CSM chưa có** (GAP, xem dưới).
- Ghi nhận thanh toán: `payments:record` (SALES_CSM có), scope CENTER + `passesScope('Order')` chống IDOR liên cơ sở.
- Lead gắn đơn theo `leads:view-own` — Sale chỉ tạo/xem đơn cho lead mình phụ trách.

**Ghi chú kỹ thuật:**
- **Tái dùng nguyên khối, không viết lại logic:** `createOrderManualAction` (đã có `validateAndComputeDiscount` server-side + tạo `VoucherRedemption` + increment `usedCount` atomic race-guard), `previewVoucherAction`, `recordPaymentAction`, `getLeadPaymentSummary`. UI Sale chỉ là vỏ mới gọi lại — form logic đã tồn tại ở `OrderCreateForm` (admin `/orders/new`).
- **GAP quyền (bắt buộc chốt trước khi build):** `orders:manage = [SUPER_ADMIN, CENTER_MANAGER, ACCOUNTANT]` — SALES_CSM **không có**, nên hiện Sale không tạo được Order, trong khi Order là tiền đề ghi nhận payment → đủ điều kiện convert. Hai hướng: (a) cấp `orders:manage` (scope CENTER) cho SALES_CSM, hoặc (b) tạo action mới `orders:create` gate riêng (khuyến nghị — không mở nhầm quyền sửa/huỷ đơn toàn cục cho Sale). Đổi v1 (`permissions.ts`) phải đồng bộ v2 (`seed-roles.ts` `CENTER_SALES_CSM`) để `rbac-parity.test.ts` xanh.
- **Voucher chỉ sống trên Order:** convert v2 cố ý `finalPrice=listPrice, discount=0` trên Enrollment — mọi giảm giá học phí phải áp ở bước tạo Order (voucherCode). KHÔNG cố đồng bộ discount xuống Enrollment.
- **Tách nhiệm vụ tiền:** Sale chỉ `payments:record` (RECORDED); Kế toán `payments:confirm` sinh Receipt. Người ghi nhận không tự xác nhận — màn Sale hiển thị "chờ kế toán xác nhận", không có nút confirm/refund.
- **Cạm bẫy:**
  - **centerId=null:** đơn/enrollment thiếu `centerId` gây rớt khỏi `scopedDb` — set `centerId` theo lead khi tạo Order (đã có ở create-paths, kiểm tra lại khi lead chưa gán cơ sở).
  - **Chặn convert chưa thanh toán:** `evaluatePaymentGuard` yêu cầu ≥1 Payment RECORDED (hoặc học bổng toàn phần) — nút "Chốt" chỉ bật khi `getLeadPaymentSummary.eligible=true`.
  - **Tiền = transaction:** ghi nhận payment/tạo redemption chạy trong tx race-guard sẵn có; không tách rời side-effect.
  - **Đọc qua `scopedDb(actor)`**, KHÔNG import `@/lib/db` trần (ESLint chặn trong `app/**`); shadcn thuần, không Magic UI/Recharts.

---

### 13. Ghi nhận thanh toán

**Mục đích:** Cho phép Sale GHI NHẬN khoản đã thu của khách (trạng thái `RECORDED`) để mở khoá điều kiện chốt deal (convert) và tự động đẩy lead `AWAITING_DECISION → REGISTERED`. Sale CHỈ ghi nhận — việc xác nhận (sinh phiếu thu/Receipt), điều chỉnh, hoàn tiền thuộc Kế toán; màn này luôn hiển thị rõ trạng thái "chờ kế toán xác nhận".

**Loại màn hình:** **Trang danh sách + popup thao tác.** Trang danh sách các đơn/khoản thu trong cơ sở của Sale; nút "Ghi nhận thanh toán" trên mỗi dòng mở **popup (dialog)** để nhập khoản thu. Xem chi tiết đơn mở **trang con** `/sale/thu-phi/[id]` (nhiều khoản thu + item đơn hàng, không nhồi hết vào popup). KHÔNG dùng iframe.

**Đường dẫn:** `/sale/thu-phi` (danh sách) · `/sale/thu-phi/[id]` (chi tiết 1 đơn — tuỳ chọn, route con). Popup ghi nhận không có URL riêng (dialog trên chính trang danh sách hoặc trang chi tiết).

**Bố cục & thành phần chính:**
- **PageHeader** (`_components/ui/page-header`): tiêu đề "Ghi nhận thanh toán" + subtitle "Ghi nhận khoản đã thu để đủ điều kiện chốt đơn — kế toán sẽ xác nhận sau". Vùng `actions` bên phải để trống (Sale KHÔNG có nút tạo đơn/tạo phiếu thu ở đây).
- **Hàng StatCard** (`stat-card`, tone brand/amber/blue — KHÔNG dùng tone tài chính "doanh thu" của quản lý): (1) *Khoản chờ ghi nhận* (đơn còn thiếu tiền), (2) *Đã ghi nhận hôm nay* (số khoản `recordedById = me`, `recordedAt = today`), (3) *Tổng đã thu hôm nay* (∑ amount RECORDED hôm nay của tôi), (4) *Chờ kế toán xác nhận* (RECORDED nhưng `accountantStatus = PENDING`).
- **ListToolbar** (`list-toolbar` + `search-input`): ô tìm theo tên PH / SĐT / mã đơn; các Select lọc: *Trạng thái ghi nhận* (Chưa ghi nhận / Đã ghi nhận / Còn thiếu), *Trạng thái kế toán* (Chờ xác nhận / Đã xác nhận / Bị từ chối), *Khoảng ngày*.
- **DataTable** (`data-table`) cột: Mã đơn · Khách (tên PH + SĐT bấm gọi) · Loại đơn (Khoá/Sản phẩm/Gói) · Tổng phải thu · Đã thu · Còn thiếu · Trạng thái ghi nhận (`status-pill`) · Trạng thái kế toán (`status-pill` amber "Chờ xác nhận" / emerald "Đã xác nhận" / red "Từ chối") · Hành động.
- **StatusPill / SessionStatusPill:** cần bổ sung từ điển trạng thái Payment cho pill: `RECORDED` (amber "Đã ghi nhận – chờ xác nhận"), `CONFIRMED` (emerald "Đã xác nhận"), `REJECTED` (red), chưa có khoản (slate "Chưa ghi nhận").
- **EmptyState** (`empty-state`): khi không có đơn nào trong scope.
- **Popup RecordPaymentDialog** (mới, shadcn `Dialog`): chọn phương thức (`PaymentMethod`), nhập số tiền, ngày thu, ghi chú; hiển thị lại tóm tắt Đã thu / Tổng / Còn thiếu; banner nhắc "Khoản này sẽ ở trạng thái *chờ kế toán xác nhận*; bạn không thể tự xác nhận/hoàn tiền".

**Dữ liệu hiển thị (model/field Prisma, tôn trọng PII + scopedDb):**
- `Order` — `code`, `orderType` (COURSE/PRODUCT/PACKAGE), `totalAmount`, `leadId`/`studentId`, `centerId`. Đọc qua `scopedDb(actor)` → CS1 không thấy đơn CS2.
- `OrderItem` — dòng item (chỉ hiện ở trang chi tiết `[id]`).
- `Payment` — `amount`, `method`, **`saleStatus`** (RECORDED), **`accountantStatus`** (PENDING/CONFIRMED/REJECTED), `recordedById`, `recordedAt`, `confirmedById`, `confirmedAt`. Dùng để tính Đã thu/Còn thiếu và cột trạng thái.
- `PaymentMethod` — danh mục phương thức cho Select trong popup.
- Tóm tắt qua **`getLeadPaymentSummary(sdb, leadId)`** (`lib/payments/summary.ts`): đã nộp / tổng phải thu / còn thiếu / `eligible`.
- **PII:** tên PH / SĐT / email hiển thị đầy đủ vì SALES_CSM có `leads:view-pii` + nằm trong `PARENT_CONTACT_ROLES`. KHÔNG hiển thị CCCD/địa chỉ đầy đủ (đó là `payments:view-pii` break-glass của kế toán — Sale không có, không cần cho ghi nhận).

**Thao tác (actions):**

| Thao tác | Trang / Popup | Quyền cần | Server action tái dùng |
|---|---|---|---|
| Xem danh sách đơn & khoản thu | **Trang** (`/sale/thu-phi`, RSC) | `orders:view` | RSC đọc qua `scopedDb(actor)` (không cần action mutation) |
| Xem chi tiết 1 đơn (nhiều khoản + item) | **Trang con** (`/sale/thu-phi/[id]`) | `orders:view` | `getLeadPaymentSummary` (đọc) |
| **Ghi nhận thanh toán** | **Popup** (RecordPaymentDialog trên dòng/đơn) | `payments:record` | `recordPaymentAction` (`payments/_actions.ts`) → `lib/finance/payment.recordPayment` — đã có `requireRecord` + `passesScope('Order')` + auto-advance lead `AWAITING_DECISION→REGISTERED` trong cùng tx |
| Lọc / tìm kiếm | Inline (không popup) | `orders:view` | — (client state trên ListToolbar) |
| Xác nhận khoản / sinh phiếu thu | **KHÔNG hiển thị** | `payments:confirm` (Sale KHÔNG có) | — (thuộc Kế toán, `confirmPaymentAction`) |
| Điều chỉnh / Hoàn tiền | **KHÔNG hiển thị** | `payments:manage` (Sale KHÔNG có) | — (adjust/refund thuộc Kế toán) |

> Nguyên tắc page-vs-popup: chỉ **1 thao tác ghi (ghi nhận)** và nó là **popup** để Sale thao tác nhanh không rời danh sách. Mọi thứ cần bối cảnh nhiều dòng (nhiều khoản thu của 1 đơn, danh sách item) đi **trang con `[id]`**. Không có thao tác nào của Sale mở trang mới toàn màn ngoài trang chi tiết đọc.

**Trạng thái:**
- **Rỗng:** `EmptyState` (tone slate) — "Chưa có đơn hàng nào cần ghi nhận" + gợi ý "Đơn được tạo từ luồng chốt của lead". KHÔNG đặt nút "Tạo đơn" ở đây (Sale thiếu `orders:manage` — xem cạm bẫy).
- **Loading:** skeleton bảng (RSC + Suspense); popup ghi nhận có spinner trong `useTransition` khi submit.
- **Lỗi:** toast `toast.error` từ `sonner` với message tiếng Việt của action (vd `PAYMENT_REQUIRED`/`SCOPE_DENIED`); nếu `passesScope('Order')` fail (IDOR liên cơ sở) → báo "Đơn không thuộc phạm vi của bạn", KHÔNG lộ dữ liệu.
- **Không-có-quyền:** nếu actor thiếu `orders:view` / `payments:record` → tab bị lọc khỏi sidebar (menu ≡ cổng) và truy cập trực tiếp URL bị page-gate redirect về trang chủ site Sale. Nút "Ghi nhận" ẩn hẳn nếu không có `payments:record`.

**Quyền & phạm vi:**
- **Gate tab (route):** `orders:view` (xem đơn) — bắt buộc để vào; `payments:record` — bắt buộc để hiện nút ghi nhận. SALES_CSM có cả hai.
- **Scope:** ghi nhận là **CENTER** — Sale chỉ thao tác đơn thuộc cơ sở mình; cách ly cứng bằng `scopedDb(actor)` (query) + `passesScope('Order')` (mutation, chống IDOR liên cơ sở). Với lead `view-own`, chỉ thấy đơn gắn lead mình phụ trách (trừ khi có `leads:view-all`).
- **Tách nhiệm vụ (bất biến):** người ghi nhận ≠ người xác nhận — Sale không bao giờ có `payments:confirm`/`payments:manage` trên site này.

**Ghi chú kỹ thuật:**
- **Tái dùng nguyên khối, KHÔNG viết lại logic tiền:** `recordPaymentAction` (đã gate `payments:record` + `scopedDb` + `passesScope('Order')` + auto-advance lead trong **transaction**) và `getLeadPaymentSummary`. Site Sale chỉ lắp UI (bảng + popup) gọi lại action cũ.
- **Cần build mới (UI):** trang `/sale/thu-phi` + `[id]`, `RecordPaymentDialog`, bổ sung từ điển trạng thái Payment cho `StatusPill`. Không tạo service tài chính mới.
- **⚠️ Cạm bẫy — GAP tạo đơn:** `Order` là **tiền đề** để ghi nhận payment, nhưng `orders:manage` = [SUPER_ADMIN, CENTER_MANAGER, ACCOUNTANT] — **SALES_CSM KHÔNG có** → Sale không tự tạo đơn qua `/orders/new`. Trên site Sale, đơn phải phát sinh từ luồng chốt của lead (card "Loại đơn dự kiến" → convert) hoặc do CM/Kế toán tạo. **ĐÃ CHỐT QĐ-4:** cấp action hẹp `orders:create` cho Sale → **sau khi PR RBAC được vá**, nút "Tạo đơn" đặt ở toolbar tab này (gate `orders:create`, đơn luôn gắn lead của mình); chừng nào chưa vá thì đơn chỉ phát sinh từ luồng convert hoặc do CM/Kế toán tạo.
- **⚠️ Cạm bẫy tiền:** giữ nguyên **transaction** của `recordPayment` (auto-advance lead cùng tx) — KHÔNG tách side-effect ra ngoài. `saleStatus=RECORDED` là điều kiện `evaluatePaymentGuard` mở khoá convert; đừng đòi `CONFIRMED` trước convert (Receipt sinh per-Enrollment nên chỉ confirm được SAU convert — đòi trước = deadlock).
- **⚠️ Cạm bẫy centerId=null:** đơn/enrollment thiếu `centerId` từng gây leak/lọc sai scope — đảm bảo đọc qua `scopedDb`; nếu `Order.centerId` null cần backfill trước khi mở tab (tránh Sale không thấy đơn hợp lệ hoặc thấy nhầm).
- **Voucher/chiết khấu KHÔNG ở đây:** giảm giá sống trên `Order` (bước tạo đơn), không phải bước ghi nhận — màn này chỉ hiển thị con số phải thu đã chốt.
- **Kế hoạch 2 đợt:** nếu đơn có installment, ghi nhận đợt 1 tại đây; phần duyệt đợt 2 (`PENDING_APPROVAL`, QL cơ sở duyệt) KHÔNG thuộc tab này — chỉ hiển thị badge "đã gửi duyệt" để tránh hiểu nhầm đã thu đủ.

---

### 14. Ghi danh trực tiếp

- **Mục đích:** Đăng ký một học viên ĐÃ tồn tại trong hệ thống vào một lớp cụ thể, NGOÀI luồng chốt lead (Convert v2) — dùng khi HV đã là học viên của trung tâm (chuyển khoá kế tiếp, học thêm lớp song song, ghi danh lại sau bảo lưu). Mọi lần ghi danh đều re-check sĩ số trong transaction Serializable (chống TOCTOU `CLASS_FULL`) và kiểm tra tiên quyết khoá (`CoursePrerequisite`).

- **Loại màn hình:** **Trang danh sách + popup thao tác.** Trang `/sale/ghi-danh` là danh sách các bản ghi danh gần đây trong cơ sở (scoped). Thao tác chính "Ghi danh trực tiếp" mở **popup (Dialog)** — không mở trang mới — để chọn học viên + lớp + ghi chú rồi submit. Xem chi tiết một bản ghi danh mở **trang con** `/sale/ghi-danh/[id]` (read-only, dữ liệu lịch/điểm danh dài nên tách trang, không nhồi vào popup).

- **Đường dẫn:** `/sale/ghi-danh` (danh sách + popup ghi danh) · `/sale/ghi-danh/[id]` (chi tiết một Enrollment, read-only).

- **Bố cục & thành phần chính:**
  - `PageHeader` — tiêu đề "Ghi danh trực tiếp" + subtitle "Đăng ký học viên đã có vào lớp (ngoài luồng chốt lead)" + vùng `actions` chứa nút **"+ Ghi danh trực tiếp"** (mở popup).
  - Hàng `StatCard` (tone `brand`/`green`/`amber`): (1) Ghi danh tháng này · (2) HV đang học (ACTIVE) trong cơ sở · (3) Lớp gần đầy (còn ≤3 chỗ) — gợi ý Sale ưu tiên.
  - `ListToolbar` — `SearchInput` (tìm tên/mã HV) + Select lọc: **Lớp**, **Khoá**, **Trạng thái ghi danh**, **Khoảng ngày ghi danh**.
  - `DataTable` — cột: **Học viên** (tên + mã HV), **Lớp** (tên + khoá), **Ngày ghi danh** (`enrolledAt`), **Trạng thái** (`StatusPill` map `EnrollmentStatus`), **Học phí** (`finalPrice` format VND), **Người ghi danh**, **Thao tác** (row action). Cuộn ngang trên mobile (mặc định `DataTable`).
  - **Popup "Ghi danh trực tiếp"** (Dialog/Sheet): bước 1 chọn Học viên (search theo tên/mã, chỉ HV trong cơ sở qua `scopedDb`) → bước 2 chọn Lớp (search lớp OPEN cùng cơ sở, hiện `used/capacity` + cảnh báo lớp sắp đầy, ẩn/khoá lớp Hội sở) → ô Ghi chú → panel cảnh báo tiên quyết (nếu khoá có `CoursePrerequisite` chưa đạt) → nút **"Xác nhận ghi danh"**. Không có bước tiền/voucher (đó là luồng Order/Convert riêng).
  - `EmptyState` (tone `slate`) khi chưa có ghi danh nào khớp filter.

- **Dữ liệu hiển thị (Prisma, scoped theo cơ sở):**
  - `Enrollment`: `id`, `enrolledAt`, `status` (`EnrollmentStatus`), `finalPrice`, `centerId`, `studentId`, `classId`, `createdById`, `notes`.
  - `Student` (select hẹp): `fullName`, `studentCode`, `centerId` — KHÔNG kéo giấy tờ tùy thân, KHÔNG lộ `studentId` trên URL công khai.
  - `Class` → `Course`: `name`, `course.name`, `capacity`, `_count.enrollments` (tính `used`), `centerId`.
  - `CoursePrerequisite`: đọc để hiện cảnh báo tiên quyết trong popup.
  - Tất cả đọc/ghi qua `scopedDb(actor)` — CS1 không thấy/không ghi danh vào lớp hoặc HV của CS2. Không import `@/lib/db` trần.

- **Thao tác (actions):**

  | Thao tác | Trang / Popup | Quyền cần | Server action tái dùng |
  |---|---|---|---|
  | Mở danh sách ghi danh (đọc) | Trang `/sale/ghi-danh` | `enrollments:view-all` | RSC đọc qua `scopedDb.enrollment` |
  | **Ghi danh trực tiếp** (chọn HV + lớp + submit) | **Popup (Dialog)** | `enrollments:create` | `enrollStudent(studentId, classId, notes)` — `enrollments/_actions.ts` |
  | Tìm HV để ghi danh (autocomplete trong popup) | Popup (inline) | `students:view-all` | search HV scoped (đọc) |
  | Tìm lớp OPEN cùng cơ sở (autocomplete trong popup) | Popup (inline) | `classes:view-all` | đọc `scopedDb.class` (lọc lớp Hội sở qua `getNonEnrollableCenterIds`) |
  | Xem chi tiết một ghi danh | **Trang con** `/sale/ghi-danh/[id]` | `enrollments:view-all` | RSC đọc scoped |
  | Đổi lớp / chuyển lớp | Điều hướng sang tab **Chuyển lớp** (tạo yêu cầu) | `enrollments:create` (Sale KHÔNG có `enrollments:transfer`) | — (ngoài phạm vi tab này) |

  Ghi rõ: chỉ **"Ghi danh trực tiếp"** là popup; **xem chi tiết** mở trang con; **chuyển lớp** không nằm trong tab này (Sale chỉ tạo yêu cầu, QL duyệt).

- **Trạng thái:**
  - **Rỗng:** `EmptyState` "Chưa có ghi danh nào" + nút "+ Ghi danh trực tiếp".
  - **Loading:** skeleton bảng (RSC + Suspense); popup nút submit dùng `useTransition` (disable + spinner khi đang chạy Serializable tx).
  - **Lỗi (trong popup):** hiển thị message theo mã trả về — `CLASS_FULL` ("Lớp đã đầy chỗ"), tiên quyết chưa đạt ("Học viên chưa hoàn thành khoá tiên quyết X"), lớp Hội sở không ghi danh được, HV/lớp khác cơ sở (chặn IDOR). Toast `sonner` `toast.error`.
  - **Không có quyền:** thiếu `enrollments:view-all` → tab bị ẩn ở sidebar (nav lọc theo perm) và gate layout redirect về trang mặc định; thiếu `enrollments:create` → nút "+ Ghi danh trực tiếp" không render.

- **Quyền & phạm vi:** Gate tab = `enrollments:view-all`. Popup ghi danh gate = `enrollments:create`. Scope thực thi ở tầng query bằng `scopedDb(actor)` (CENTER — Sale làm 1 cơ sở, CS1 không ghi danh chéo CS2); SUPER_ADMIN/HO bypass. Không dùng scope OWN cho ghi danh (khác lead — ghi danh là dữ liệu cơ sở, không giới hạn theo `assignedToId`).

- **Ghi chú kỹ thuật:**
  - **Tái dùng nguyên khối** `enrollStudent` từ `app/(admin)/admin/enrollments/_actions.ts` — đã có `checkPermission('enrollments:create')`, Serializable `$transaction` re-check sĩ số (chống TOCTOU), prerequisite check và loại lớp Hội sở qua `getNonEnrollableCenterIds`. Site Sale chỉ lắp UI popup gọi lại, **KHÔNG viết lại logic**.
  - **Cần build mới:** vỏ trang list `/sale/ghi-danh` + popup Dialog (admin hiện là trang full `/enrollments/new`, Sale muốn popup nhanh). Tách helper đọc danh sách vào `lib/sale/*` để page chỉ gọi 1 helper, mọi query bọc `scopedDb`.
  - **Cạm bẫy `centerId=null`:** bug đã gặp nhiều trang — khi tạo Enrollment PHẢI denormalize `centerId` từ `Class`/`Student` (đừng để null, nếu null sẽ lọt/rớt khỏi scoped filter). Kiểm tra create-path set `centerId` đúng.
  - **KHÔNG nhầm với luồng chốt lead:** tab này KHÔNG tạo Payment/Order và KHÔNG chịu guard `PAYMENT_REQUIRED` — đó là Convert v2. Nếu HV cần đóng tiền, xử lý qua Order/Payment ở tab khác. Ghi danh trực tiếp mặc định `finalPrice = listPrice`, `discount = 0` (giảm giá sống trên Order, không trên Enrollment).
  - **Serializable retry:** transaction có thể abort do write-skew khi 2 Sale ghi danh cùng lớp gần đầy — action đã re-check, UI chỉ cần hiển thị `CLASS_FULL` gọn gàng, không tự retry ngầm gây double-enroll.
  - UI dùng shadcn thuần (KHÔNG Magic UI/Framer/Recharts); layout Sale `dynamic='force-dynamic'` + robots `noindex` như teacher layout.

---

### 15. Chuyển lớp / cơ sở

**Mục đích:** Cho phép Tư vấn viên (SALES_CSM) TẠO yêu cầu chuyển lớp hoặc chuyển cơ sở cho một học viên đang học tại cơ sở của mình, rồi gửi cho Quản lý cơ sở duyệt & thực thi. Sale KHÔNG tự chuyển (không có `enrollments:transfer`) — tab này chỉ là nơi lập phiếu đề xuất và theo dõi trạng thái duyệt.

**Loại màn hình:** **Trang danh sách + popup thao tác.**
- Trang gốc `/sale/chuyen-lop` = danh sách các yêu cầu chuyển mà Sale đã tạo (bảng có lọc trạng thái).
- Thao tác **"Tạo yêu cầu chuyển"** mở **Sheet/Dialog (popup)** — không mở trang mới, vì form ngắn (chọn HV → chọn kiểu chuyển → đích → lý do).
- **Xem chi tiết 1 yêu cầu** = **inline expand** trong hàng (theo mẫu `RequestRow` của `/admin/parent-requests`), KHÔNG mở trang, KHÔNG popup.
- **Huỷ yêu cầu** (khi còn PENDING) = **popup confirm 2-click** (dialog nhỏ).
- KHÔNG có route con `[id]` riêng — mọi thao tác của Sale gói trong list + popup. (Trang duyệt/thực thi là của Quản lý, nằm ở admin, không thuộc site Sale.)

**Đường dẫn:** `/sale/chuyen-lop` (không có route con; host consult rewrite `/chuyen-lop` → `/sale/chuyen-lop`).

**Bố cục & thành phần chính** (tái dùng UI kit `_components/ui/` clone từ site GV):
- `PageHeader` — tiêu đề "Chuyển lớp / cơ sở", subtitle "Đề xuất chuyển lớp/cơ sở cho học viên — Quản lý cơ sở duyệt", vùng `actions` bên phải đặt nút **"+ Tạo yêu cầu chuyển"** (mở Sheet).
- `ListToolbar` — `SearchInput` (tìm theo tên HV / mã HV) + 2 `Select`: lọc **Trạng thái** (Tất cả / Chờ duyệt / Đã duyệt / Từ chối / Đã huỷ) và lọc **Kiểu** (Chuyển lớp / Chuyển cơ sở).
- `DataTable` — các cột: Học viên (tên + mã HV) · Kiểu (Chuyển lớp / Chuyển cơ sở) · Từ (lớp/cơ sở hiện tại) · Đến (lớp/cơ sở đích hoặc "chờ QL xếp") · Lý do (rút gọn) · Trạng thái (`StatusPill`) · Ngày tạo · (hàng bung inline khi bấm). Cuộn ngang trên mobile theo mặc định của DataTable.
- **Sheet "Tạo yêu cầu chuyển"** (popup) gồm: (1) chọn học viên/enrollment đang học trong cơ sở (autocomplete `SearchInput`); (2) chọn kiểu bằng segmented **Chuyển lớp** | **Chuyển cơ sở**; (3a) nếu Chuyển lớp → chọn lớp đích cùng cơ sở (Select lớp OPEN cùng course/cấp); (3b) nếu Chuyển cơ sở → chọn **cơ sở đích** (Select) + ghi chú khoá/nguyện vọng, KHÔNG chọn lớp cụ thể (lớp đích do QL cơ sở nhận xếp); (4) `Textarea` **Lý do** (bắt buộc ≥ 5 ký tự); (5) ngày mong muốn (optional). Nút "Gửi yêu cầu" + "Huỷ".
- `EmptyState` (tone slate) khi chưa có yêu cầu nào; `StatusPill` cho trạng thái từng dòng.

**Dữ liệu hiển thị (model/field Prisma, tôn trọng PII + scopedDb):**
- Nguồn chọn HV: `Enrollment` (status đang học) join `Student` (`fullName`, `studentCode`), `Class` (`name`), `Course`, `centerId` — LỌC qua `scopedDb(actor)` (CENTER): Sale chỉ thấy enrollment cơ sở mình. Có `enrollments:view-all` (scope CENTER) → thấy toàn HV cơ sở, không giới hạn own.
- Yêu cầu chuyển: đề xuất lưu ở `ParentRequest` (type `TRANSFER_CLASS` / `TRANSFER_CENTER`) — fields dùng: `studentId`, `content` (lý do + đích), `preferredDate`, `status` (PENDING/APPROVED/REJECTED/CANCELLED), `handledById/Name/At`, `createdById` (Sale lập phiếu). Đích lớp/cơ sở gói trong `content` hoặc field phụ (xem Ghi chú kỹ thuật).
- PII: HV là học viên đã ghi danh (không phải lead) — SALES_CSM trong `PARENT_CONTACT_ROLES` được xem tên HV + phụ huynh cơ sở mình; scopedDb đã chặn cross-center nên không cần mask thêm ở tab này. Không hiển thị `studentId` trần trên URL (không có route `[id]`).
- Danh sách **cơ sở đích** cho Chuyển cơ sở: đọc `Center` (isActive) — chỉ để chọn đích, KHÔNG kéo theo lớp/HV cơ sở đó (scopedDb vẫn chặn xem dữ liệu CS khác).

**Thao tác (actions):**

| Thao tác | Trang/Popup | Quyền cần | Server action |
|---|---|---|---|
| Tạo yêu cầu chuyển lớp/cơ sở | **Popup** (Sheet) | `enrollments:create` (scope CENTER) | `createTransferRequestAction` — **build mới** (tạo ParentRequest type TRANSFER_*; gate `checkPermission('enrollments:create')` + `passesScope('Enrollment')` chống IDOR) |
| Xem chi tiết yêu cầu | **Inline expand** (không page/popup) | `enrollments:create` (own — chỉ phiếu mình tạo) | RSC read qua `scopedDb` |
| Huỷ yêu cầu (khi PENDING) | **Popup** confirm 2-click | `enrollments:create` (own, chỉ `createdById === me`) | `cancelTransferRequestAction` — **build mới** (chỉ đổi status→CANCELLED khi PENDING) |
| Lọc/tìm danh sách | Inline (toolbar) | — | — (client filter / RSC query) |
| ~~Duyệt / Từ chối / Thực thi chuyển~~ | **KHÔNG có trên site Sale** | `enrollments:transfer` (Sale KHÔNG có) | `transferEnrollment` chạy ở admin do QL cơ sở |

> Ranh giới cốt lõi: Sale chỉ **lập + huỷ** phiếu. Nút Duyệt/Từ chối/Thực thi (gọi `transferEnrollment`, đụng chuyển ghi danh + học phí còn lại) bị ẩn hoàn toàn vì cần `enrollments:transfer`. Ngay cả khi Sale có `parent-requests:manage`, action duyệt-chuyển phải gate riêng `enrollments:transfer` để Sale KHÔNG thể tự duyệt phiếu của chính mình (tách nhiệm vụ).

**Trạng thái:**
- **Rỗng:** `EmptyState` — "Chưa có yêu cầu chuyển nào. Bấm '+ Tạo yêu cầu chuyển' để đề xuất chuyển lớp/cơ sở cho học viên." + nút tạo.
- **Loading:** skeleton bảng (RSC + Suspense); Sheet submit hiện spinner trong `useTransition`.
- **Lỗi:** toast `sonner` đỏ theo message action (`{ ok:false, error }`); validate Sheet client-side (lý do ≥ 5 ký tự, phải chọn HV + đích). Trùng phiếu PENDING cho cùng enrollment → chặn, báo "Đã có yêu cầu chuyển đang chờ duyệt cho học viên này".
- **Không-có-quyền:** layout gate 3 tầng của site Sale chặn trước; nếu tài khoản thiếu `enrollments:create` → tab ẩn khỏi sidebar (nav lọc theo perm) và truy cập trực tiếp URL bị `page-gate` redirect về dashboard Sale.

**Quyền & phạm vi:**
- **Permission gate tab:** `enrollments:create` (là nguồn duy nhất route-gate qua PAGE_GATES → menu ≡ cổng).
- **Scope:** CENTER — Sale chỉ tạo/xem phiếu cho HV cơ sở mình (`scopedDb(actor)` ép lọc centerId; CS1 không thấy HV CS2). Xem chi tiết/huỷ giới hạn OWN (`createdById === session.user.id`).
- Chuyển cơ sở là hành động **cross-center** nhưng Sale chỉ tạo *ý định* (chọn Center đích) — không đọc được dữ liệu cơ sở đích; việc xếp lớp + di chuyển ghi danh do QL cơ sở đích/nguồn thực thi.

**Ghi chú kỹ thuật:**
- **Tái dùng:** `transferEnrollment` (action đã có, gate `enrollments:transfer`) là nơi THỰC THI chuyển — KHÔNG viết lại; site Sale chỉ tạo phiếu. Luồng duyệt tái dùng state machine của `handleParentRequest` (`/admin/parent-requests`) nếu chứa phiếu trong `ParentRequest`. `scopedDb` + `passesScope` bắt buộc như mọi mutation.
- **Build mới:** `createTransferRequestAction` + `cancelTransferRequestAction` + UI list/Sheet của site Sale. Cần quyết định lưu trữ phiếu:
  - **PA khuyến nghị (additive):** dùng `ParentRequest` type `TRANSFER_CLASS`/`TRANSFER_CENTER` để dùng lại pipeline duyệt sẵn có. Cạm bẫy: `ParentRequest.parentUserId` vốn bắt buộc (phiếu do PH tạo) — phiếu do Sale lập cần `parentUserId` nullable + thêm `createdByStaffId`, hoặc suy `parentUserId` từ PH của HV. Phải xử lý migration additive (nullable trước, không drop).
  - **PA thay thế:** model `EnrollmentTransferRequest` riêng (enrollmentId, kind, targetClassId?/targetCenterId, reason, status, createdById, approvedById) nếu không muốn nhồi vào ParentRequest. Rõ ràng hơn nhưng phải nối tay vào màn duyệt của QL.
- **Cạm bẫy dữ liệu:**
  - `centerId=null` trên Enrollment (bug đã gặp nhiều trang): khi lọc enrollment theo cơ sở để chọn HV, phải phòng enrollment thiếu centerId → dùng backfill/`NULL_IS_GLOBAL` guard, tránh HV "biến mất" hoặc lọt cross-center.
  - **Tiền/học phí khi chuyển:** phần điều chỉnh học phí còn lại, đổi giá lớp đích là việc của `transferEnrollment` chạy trong transaction ở admin — Sale KHÔNG đụng tiền ở tab này; Sheet chỉ ghi lý do/nguyện vọng.
  - Chuyển cơ sở: KHÔNG cho Sale chọn lớp đích cụ thể (scopedDb chặn đọc lớp CS khác) — chỉ chọn Center đích; QL cơ sở đích xếp lớp. Đừng cố query lớp cross-center trong Sheet.
  - Không hardcode danh sách "HO/CS1/CS2" — Center đích đọc từ OrgUnit/Center tree (`isActive`), CS mới thêm không sửa code.

---

### 16. Cảnh báo rủi ro

- **Mục đích:** Hàng đợi cảnh báo nguy cơ rời bỏ (churn) của học viên theo 6 loại tín hiệu, giúp tư vấn viên can thiệp kịp: gỡ (resolve) khi đã xử lý, nâng mức (escalate) khi cần chú ý, và tạo việc chăm sóc gắn với cảnh báo để theo dõi tiếp.

- **Loại màn hình:** **Trang danh sách + popup thao tác.** Thân trang là 1 danh sách/bảng cảnh báo (sắp theo severity giảm dần) với hàng bung inline. Thao tác **Gỡ cảnh báo** và **Nâng mức** chạy inline ngay trên hàng (không mở trang, không popup — chỉ nút + xác nhận 2-lần); thao tác **Tạo việc chăm sóc** mở **popup/dialog** (form title/hạn/mô tả); **Hoàn tất việc chăm sóc** làm inline trong khối care task của hàng. Không thao tác nào mở trang mới.

- **Đường dẫn:** `/sale/canh-bao-rui-ro` (trang chính, không cần route động). Tùy chọn: `/sale/canh-bao-rui-ro/[id]` chỉ khi cần deep-link 1 cảnh báo mở sẵn ở dạng sheet chi tiết — không bắt buộc cho bản đầu.

- **Bố cục & thành phần chính:**
  - `PageHeader` — tiêu đề "Cảnh báo rủi ro" + subtitle ("Học viên có nguy cơ rời bỏ trong cơ sở của bạn"); vùng `actions` bên phải để trống hoặc đặt nút chuyển nhanh sang "Việc chăm sóc".
  - Hàng `StatCard` (3–4 thẻ KPI) tái dùng nguyên: tổng cảnh báo OPEN (tone `red`), số HIGH (tone `red`), số MEDIUM (tone `amber`), số đã ESCALATED (tone `blue`). Value đếm từ chính list, không query thêm.
  - `ListToolbar` — `SearchInput` (tìm theo tên học viên) + 2 `Select`: lọc theo **Loại cảnh báo** (6 giá trị) và **Mức độ** (LOW/MEDIUM/HIGH). Có thể thêm filter trạng thái OPEN/ESCALATED nếu cho xem cả đã xử lý.
  - `DataTable` cột: **Học viên** (tên + mã HV) · **Loại** (nhãn VN, dùng `StatusPill` map RiskAlertType→nhãn) · **Mức độ** (`StatusPill` màu ngữ nghĩa: HIGH=red, MEDIUM=amber, LOW=slate/blue) · **Chi tiết** (`detail`, cắt gọn) · **Trạng thái** (`StatusPill` OPEN/ESCALATED/RESOLVED) · **Việc chăm sóc** (số careTask đang mở) · **Thao tác**.
  - Khối bung inline mỗi hàng: mô tả đầy đủ `detail`, danh sách `careTasks[]` gắn cảnh báo (title/hạn/trạng thái + nút hoàn tất), và cụm nút thao tác.
  - `EmptyState`/SuccessBanner tone emerald khi không còn cảnh báo OPEN ("Không có cảnh báo rủi ro — sạch việc").

- **Dữ liệu hiển thị:** Model **`StudentRiskAlert`** — `{ studentId, centerId, type (RiskAlertType), severity (LOW/MEDIUM/HIGH), status (OPEN/ESCALATED/RESOLVED), detail, resolvedById, resolvedAt }` + relation `student` (tên + mã HV, qua scopedDb) + `careTasks[]` (**`StudentCareTask`**: `title, description, dueAt, status, assignedToId, riskAlertId`). 6 `RiskAlertType`: `CONSECUTIVE_ABSENCE` (nghỉ 2 buổi liên tiếp), `HIGH_ABSENCE` (nghỉ vượt ngưỡng), `MISSED_SUBMISSIONS` (không nộp bài nhiều lần), `NEEDS_SUPPORT` (GV đánh dấu cần hỗ trợ), `NEARING_END_NO_RENEWAL` (sắp hết khoá chưa tái tục), `OVERDUE_PAYMENT` (công nợ quá hạn). Toàn bộ đọc qua **`scopedDb(actor)`** → chỉ cảnh báo học viên trong cơ sở của Sale (CS1 không thấy CS2). Tên học viên hiển thị đầy đủ cho SALES_CSM (có `students:view-all`); **không** hiển thị SĐT/CCCD phụ huynh trên bảng này (không thuộc phạm vi tab). `OVERDUE_PAYMENT` chỉ hiển thị nhãn/mức + `detail` mô tả, **không** phơi số tiền công nợ chi tiết (đó là phạm vi `payments:manage` mà Sale không có).

- **Thao tác (actions):**

  | Thao tác | Trang/Popup | Quyền cần | Server action tái dùng |
  |---|---|---|---|
  | Xem danh sách + bung chi tiết hàng | Inline (không popup) | `parent-requests:manage` (page-gate) | RSC đọc qua `scopedDb.studentRiskAlert` (sort severity desc) |
  | Gỡ cảnh báo (Resolve) | **Inline** trên hàng, xác nhận 2-lần | `students:view-all` | `resolveRiskAlert(id)` — `canh-bao-rui-ro/_actions.ts` |
  | Nâng mức (Escalate → HIGH/ESCALATED) | **Inline** trên hàng | `students:view-all` | `escalateRiskAlert(id)` — `canh-bao-rui-ro/_actions.ts` |
  | Tạo việc chăm sóc (gắn `riskAlertId`) | **Popup/Dialog** (form: title, mô tả, hạn `dueAt`, tự gán `assignedToId=self`) | `students:view-all` + `parent-requests:manage` | ⚠️ **cần build mới** (admin hiện chưa có UI tạo care task từ alert — chỉ có `completeCareTask`); dùng lại model `StudentCareTask`, action `createCareTask` mới hoặc mở rộng `_actions.ts` |
  | Hoàn tất việc chăm sóc | **Inline** trong khối careTask của hàng | `students:view-all` | `completeCareTask(id)` — `canh-bao-rui-ro/_actions.ts` (đóng kèm alert liên quan) |

  Ghi chú: Resolve/Escalate cố ý giữ inline (giống admin `canh-bao-rui-ro`) để thao tác nhanh trên mobile; chỉ "Tạo việc chăm sóc" cần form nên mở dialog.

- **Trạng thái:**
  - **Rỗng:** `EmptyState` tone emerald "Không có cảnh báo rủi ro nào" khi filter OPEN không ra kết quả (đây là trạng thái mong muốn — dùng SuccessBanner).
  - **Loading:** skeleton bảng (RSC + Suspense); StatCard hiển thị placeholder số.
  - **Lỗi:** nếu 1 nguồn đếm/list lỗi → `.catch(()=>[])` để không vỡ trang, hiện banner nhẹ "Không tải được một phần dữ liệu, thử lại". Action lỗi (`passesScope` fail / IDOR) → `toast.error` "Không có quyền hoặc dữ liệu ngoài cơ sở".
  - **Không có quyền:** thiếu `parent-requests:manage` → layout/page-gate redirect về dashboard Sale (menu ẩn mục này theo `it.perm.some`).

- **Quyền & phạm vi:**
  - **Page-gate:** `parent-requests:manage` (SUPER_ADMIN, CENTER_MANAGER, SALES_CSM) — cùng cổng với `/cham-soc-hv` và `/parent-requests`, đảm bảo menu ≡ cổng.
  - **Action-gate:** `students:view-all` cho resolve/escalate/completeCareTask (SALES_CSM có).
  - **Scope:** cách ly cơ sở **KHÔNG** do role mà do `scopedDb(actor)` + `passesScope('StudentRiskAlert'/'StudentCareTask')` ở tầng query (CENTER — CS1 không thấy CS2; SUPER_ADMIN/HO bypass). Sale làm 1 cơ sở → chỉ thấy cảnh báo cơ sở mình. Không có filter own-user như lead (cảnh báo là của cơ sở, không "của tôi").

- **Ghi chú kỹ thuật:**
  - **Tái dùng nguyên khối** từ admin: `resolveRiskAlert`, `escalateRiskAlert`, `completeCareTask` trong `app/(admin)/admin/canh-bao-rui-ro/_actions.ts` — đã có guard permission + scopedDb + passesScope + đóng kèm care task; site Sale chỉ cần vỏ UI mới gọi lại, **không viết lại logic**.
  - **Cần build mới:** (1) action/UI **tạo việc chăm sóc từ cảnh báo** (admin hiện chỉ tick hoàn tất, chưa có tạo từ alert) — thêm `createCareTaskAction` gắn `riskAlertId` + tự set `centerId` từ alert (tránh bug `centerId=null`); (2) trang list bọc UI kit site Sale (clone `_components/ui/*` từ site GV: DataTable/StatCard/ListToolbar/StatusPill/EmptyState — StatusPill cần bổ sung từ điển RiskAlertType→nhãn VN + RiskSeverity→màu).
  - **Liên thông 3 hàng đợi:** cảnh báo → việc chăm sóc → yêu cầu phụ huynh dùng chung state machine; nên đặt 3 tab trong nhóm "Chăm sóc & Tái tục" cùng navGroup để user thấy dòng chảy (alert sinh care task, resolve alert).
  - **Cạm bẫy:** (1) `centerId=null` khi tạo `StudentCareTask` → luôn lấy `centerId` từ chính alert/student, không để trống (đã gặp ở enrollment). (2) `getNearingEndEnrollments` (nguồn dữ liệu cho loại `NEARING_END_NO_RENEWAL` ở nơi khác) hiện dùng `db` trần lọc `centerId` qua tham số — nếu tab này gọi tới thì phải bọc `scopedDb` tránh leak liên cơ sở. (3) Không phơi số tiền/chi tiết công nợ cho loại `OVERDUE_PAYMENT` (Sale không có `payments:manage`) — chỉ hiện nhãn + `detail`. (4) Không có tiền/enrollment nào ghi ở tab này nên không cần transaction; nhưng completeCareTask đóng kèm alert phải giữ nguyên logic gốc (đừng tách rời). (5) Đọc/ghi tuyệt đối qua `scopedDb`, cấm import `@/lib/db` trần (ESLint chặn trong `app/**`).

---

### 17. Việc chăm sóc HV

**Mục đích:** Hàng đợi công việc chăm sóc học viên (`StudentCareTask`) được giao cho chính tư vấn viên đang đăng nhập — phát sinh từ cảnh báo rủi ro/churn hoặc quy trình sau đăng ký. Sale thuần chỉ thấy việc của mình (`assignedToId = me`), xử lý bằng cách tick "Hoàn tất" từng việc.

**Loại màn hình:** **Trang riêng** (danh sách hàng đợi). Không phải trang danh-sách-mở-trang-con. Các thao tác:
- **Hoàn tất việc** → **Popup xác nhận nhẹ** (dialog confirm 2-bước hoặc AlertDialog inline trên hàng — KHÔNG mở trang mới), theo đúng pattern confirm-delete 2-click của admin.
- **Xem hồ sơ HV** → **mở trang mới** (điều hướng sang trang chi tiết học viên của site Sale).
- **Xem cảnh báo liên quan** → **mở trang mới** (điều hướng sang tab Cảnh báo rủi ro, lọc theo `riskAlertId`) — chỉ hiện khi task gắn `riskAlertId`.
- **Lọc / tìm kiếm** → **inline** trên toolbar (client state, không popup/trang).

**Đường dẫn:** `/sale/cham-soc-hv` (trang riêng, không có route con). Link ra ngoài: `/sale/hoc-vien/[studentId]` (hồ sơ HV) và `/sale/canh-bao-rui-ro?alertId=...` (cảnh báo nguồn).

**Bố cục & thành phần chính:**
- `PageHeader` — tiêu đề "Việc chăm sóc HV" + subtitle ("N việc đang mở của bạn"); vùng `actions` bên phải để trống (Sale không tự tạo task ở màn này — task sinh từ cảnh báo).
- Hàng thẻ KPI (`StatCard`, tone `brand`/`amber`/`red`): (1) Tổng việc đang mở, (2) Quá hạn (`dueAt < now`), (3) Đến hạn hôm nay. Tone `brand` = cam-only theming của shell Sale (hoặc tím nếu chốt đổi accent Sale).
- `ListToolbar` — `SearchInput` (tìm theo tên HV / tiêu đề việc) + Select lọc: "Trạng thái hạn" (Tất cả / Quá hạn / Hôm nay / Sắp tới) và (tuỳ chọn) "Nguồn" (Từ cảnh báo / Sau đăng ký / Khác). Lọc client-side trên tập đã fetch.
- `DataTable<CareTaskRow>` — bảng chính, cột:
  - **Học viên** (tên + mã HV) — render kèm link mở hồ sơ.
  - **Việc cần làm** (`title`) + dòng phụ `description` cắt gọn.
  - **Nguồn** — `StatusPill` map từ `riskAlertId` có/không (pill "Từ cảnh báo" vs "Chăm sóc"); nếu có, hiện loại cảnh báo (nghỉ liên tiếp / công nợ / sắp hết khoá...).
  - **Hạn** (`dueAt`) — `StatusPill` màu ngữ nghĩa: đỏ = quá hạn, amber = hôm nay, slate = sắp tới.
  - **Thao tác** — nút "Hoàn tất" (mở popup confirm) + link "Xem HV" + (nếu có) "Xem cảnh báo".
- `EmptyState` (tone `green` / `SuccessBanner`) khi không còn việc mở — thông điệp "Bạn đã xử lý hết việc chăm sóc" (tái dùng banner emerald "đã sạch việc" của site GV).

**Dữ liệu hiển thị (Prisma):**
- Model chính `StudentCareTask`: `id`, `studentId`, `centerId`, `assignedToId`, `riskAlertId`, `title`, `description`, `dueAt`, `status` (`OPEN`/`DONE`/`CANCELLED`), `completedAt`.
- Quan hệ hiển thị (qua `include`/`select` hẹp): `student { fullName/name, studentCode }`; `riskAlert { type, severity }` (để hiện nhãn nguồn + độ ưu tiên).
- **Query mặc định (Sale thuần):** `where { status: 'OPEN', assignedToId: session.user.id }`, order theo `dueAt asc` (quá hạn lên đầu). Không kéo task `DONE`/`CANCELLED` vào view mặc định.
- **PII:** màn này KHÔNG hiển thị SĐT/email/CCCD phụ huynh — chỉ tên HV + mã HV + tiêu đề việc, nên không cần `leads:view-pii`. Nếu về sau thêm cột liên hệ PH thì phải qua gate `canViewParentContact` (SALES_CSM có) và mask ở server. Tuyệt đối không đọc `db` trần: mọi read đi qua `scopedDb(actor)` (model `StudentCareTask ∈ SCOPED_MODELS` → tự lọc `centerId`, CS1 không thấy task CS2).

**Thao tác (actions):**

| Thao tác | Trang / Popup | Quyền cần | Server action tái dùng |
|---|---|---|---|
| Hoàn tất việc (tick) | **Popup** (AlertDialog confirm 2-click, đóng tại chỗ + toast + `revalidatePath`) | Tab gate `parent-requests:manage`; action gate `students:view-all` (SALES_CSM có cả hai) | `completeCareTask(id)` — `app/(admin)/admin/canh-bao-rui-ro/_actions.ts` (đã có `scopedDb` + `passesScope('StudentCareTask')`; đóng kèm `riskAlert` liên quan nếu có) |
| Xem hồ sơ HV | **Trang mới** (điều hướng) | `students:view-all` | — (chỉ điều hướng `Link` → trang HV site Sale) |
| Xem cảnh báo nguồn | **Trang mới** (điều hướng, chỉ khi có `riskAlertId`) | `parent-requests:manage` | — (điều hướng sang tab Cảnh báo rủi ro) |
| Lọc / tìm kiếm | **Inline** (client state) | — | — (client filter, không gọi server) |

> Lưu ý: KHÔNG có thao tác "tạo việc" / "ghi nhật ký chăm sóc tự do" ở màn này cho Sale thuần — task do hệ thống/cảnh báo sinh ra; màn này chỉ tiêu thụ hàng đợi.

**Trạng thái:**
- **Rỗng:** `EmptyState` tone green / `SuccessBanner` "Bạn đã xử lý hết việc chăm sóc" (khi list `OPEN` = 0).
- **Loading:** skeleton rows trong `DataTable` (RSC + Suspense; hoặc `useTransition` khi tick hoàn tất — nút hiển thị spinner, disable trong lúc chờ).
- **Lỗi:** nếu action `completeCareTask` trả lỗi (mất quyền / vượt scope / task đã đóng bởi phiên khác) → `toast.error` với message VI; hàng giữ nguyên. Lỗi fetch layout đã được bọc `.catch` ở tầng badge để không vỡ trang.
- **Không-có-quyền:** thiếu `parent-requests:manage` → không lọt vào trang (gate ở `PAGE_GATES` + layout Sale redirect về trang mặc định của Sale, giống cơ chế sidebar `it.perm.some`). Mục nav cũng bị ẩn khỏi sidebar để tránh dead-link.

**Quyền & phạm vi:**
- **Permission gate của tab:** `parent-requests:manage` (SUPER_ADMIN, CENTER_MANAGER, SALES_CSM). Đây là cổng route-gate duy nhất, khai báo trong `PAGE_GATES` để menu ≡ cổng.
- **Scope hiển thị:**
  - **Sale thuần (SALES_CSM):** `OWN` theo `assignedToId = me` (chỉ việc của mình — BGĐ câu 10).
  - **CENTER_MANAGER:** `CENTER` (mọi task trong cơ sở, lọc theo `centerId`).
  - **SUPER_ADMIN / HO:** `GLOBAL` (tất cả).
- **Cách ly cơ sở:** không do role mà do `scopedDb(actor)` ép ở tầng query (CS1 ≠ CS2), cộng own-filter cho Sale. Action ghi thêm `passesScope('StudentCareTask', before, actor)` chống IDOR liên cơ sở.

**Ghi chú kỹ thuật:**
- **Tái dùng nguyên khối:** server action `completeCareTask` từ `canh-bao-rui-ro/_actions.ts` đã đủ (guard + scope + đóng cảnh báo liên quan) — site Sale chỉ lắp UI mới gọi lại, KHÔNG viết lại logic. UI kit tái dùng gần như nguyên xi từ site GV: `PageHeader`, `ListToolbar`/`SearchInput`, `DataTable`, `StatCard`, `EmptyState`/`SuccessBanner`, `StatusPill` (chỉ cần bổ sung từ điển nhãn cho `StudentCareTask.status` OPEN/DONE/CANCELLED + độ ưu tiên cảnh báo).
- **Cần build mới:** trang RSC `/sale/cham-soc-hv` gọi `scopedDb(actor).studentCareTask.findMany({ where: { status:'OPEN', assignedToId } })`; nên tách helper đọc sang `lib/sale/care-tasks.ts` (giống `lib/portal/*`) để page chỉ gọi 1 helper. Mục nav "Việc chăm sóc HV" thêm vào nhóm sidebar "Chăm sóc & Tái tục (CSKH)" trong `nav-config` của site Sale, lọc bằng perm như portal lọc theo flag.
- **Cạm bẫy:**
  - **Lệch quyền tab vs action:** gate trang là `parent-requests:manage` nhưng `completeCareTask` gate `students:view-all` — SALES_CSM có cả hai nên OK; nếu về sau mở cho role chỉ có 1 trong 2 sẽ vỡ, cần giữ đồng bộ.
  - **KHÔNG có model nhật ký chăm sóc tự do:** `StudentCareTask` chỉ là task rời (`title`/`description`/`dueAt`) — nếu nghiệp vụ CSKH cần timeline nhiều dòng theo HV thì phải bổ sung model mới, không có sẵn để bê.
  - **`completeCareTask` đóng kèm `riskAlert` liên quan** — tick "Hoàn tất" có side-effect lên cảnh báo nguồn; phải hiển thị rõ cho Sale ("hoàn tất việc này sẽ đóng cảnh báo …") để tránh đóng nhầm.
  - **`centerId=null`** trên một số bản ghi enrollment/task cũ có thể lọt/lệch qua `scopedDb` — cần đảm bảo `StudentCareTask.centerId` được set khi tạo (create-path) trước khi mở rộng scope; giữ read-only qua `scopedDb`, KHÔNG import `@/lib/db` trần (ESLint chặn trong `app/**`).
  - **Không có tiền/transaction** ở màn này (khác luồng convert/payment) — chỉ đổi `status`/`completedAt`, không cần `$transaction` phức tạp; nhưng vẫn để action tự đảm bảo idempotent (task đã `DONE` → no-op, không double-close cảnh báo).

---

### 18. Yêu cầu phụ huynh

**Mục đích:** Nơi Sale/CSKH xử lý 7 loại đơn do phụ huynh gửi từ portal (báo vắng · học bù · chuyển lớp · chuyển cơ sở · bảo lưu · đổi đồng ý hình ảnh · khác) — lọc theo loại + trạng thái, duyệt/từ chối kèm ghi chú; riêng đơn báo vắng gắn buổi cụ thể đi luồng `resolveAbsence` để xếp học bù hoặc đánh vắng (có/không phép) và tự APPROVED đơn.

**Loại màn hình:** **Trang danh sách + popup thao tác.** Trang gốc `/sale/yeu-cau-ph` là một trang danh sách (RSC) có toolbar lọc. Bám parity admin (`RequestRow`), thao tác duyệt/từ chối/giải quyết vắng dùng **inline-expand ngay trong dòng** (mở khối textarea + nút bằng `useState open`, KHÔNG modal riêng) — nhanh trên mobile. Trên viewport hẹp, khối expand này hiển thị dạng **sheet/bottom-sheet** (biến thể popup) để đủ chỗ nhập ghi chú. Route chi tiết `/sale/yeu-cau-ph/[id]` chỉ là **deep-link phụ** (mở đúng dòng đó ở trạng thái expand) cho thông báo/liên kết ngoài — KHÔNG phải màn nhập liệu tách biệt. Không có thao tác nào mở "trang mới" để soạn: mọi quyết định xảy ra trong popup/expand của dòng.

**Đường dẫn:**
- `/sale/yeu-cau-ph` — danh sách (mặc định `?status=PENDING`).
- `/sale/yeu-cau-ph?type=ABSENCE` — preset báo vắng (giữ tương thích route cũ `.../bao-vang` → redirect về đây).
- `/sale/yeu-cau-ph/[id]` — deep-link mở expand một đơn (popup), không phải trang soạn riêng.

**Bố cục & thành phần chính** (tái dùng UI kit clone từ site GV `_components/ui/`):
- **`PageHeader`** — tiêu đề "Yêu cầu phụ huynh" + subtitle "Duyệt/từ chối đơn của phụ huynh cơ sở bạn"; vùng `actions` để trống hoặc nút "Làm mới".
- **Hàng thẻ `StatCard`** (KPI đầu trang, tone ngữ nghĩa): "Chờ xử lý" (amber, đếm PENDING) · "Báo vắng cần xếp" (blue, PENDING type=ABSENCE có `sessionId`) · "Đã xử lý hôm nay" (emerald). Không dùng tone brand cho số liệu chờ.
- **`ListToolbar`** — `SearchInput` (tìm theo tên học viên) + 2 nhóm `Select`/chip lọc: **Loại đơn** (7 giá trị + "Tất cả") và **Trạng thái** (PENDING/APPROVED/REJECTED/CANCELLED + "Tất cả"). Giữ mô hình 2 hàng filter-chip như admin.
- **`DataTable`** — mỗi dòng là một đơn; cột:
  - **Học viên** (tên HV + lớp đang học).
  - **Loại đơn** — `StatusPill` map `ParentRequestType` → nhãn VI (Báo vắng/Học bù/Chuyển lớp/Chuyển cơ sở/Bảo lưu/Đổi đồng ý/Khác).
  - **Nội dung** — `content` rút gọn + `preferredDate` (ngày mong muốn) nếu có.
  - **Buổi liên quan** — hiển thị buổi (`sessionId`) khi type=ABSENCE gắn buổi; rỗng thì "—".
  - **Trạng thái** — `StatusPill` (PENDING amber / APPROVED emerald / REJECTED red / CANCELLED slate).
  - **PH gửi** — tên phụ huynh (SĐT bấm gọi — Sale có quyền xem, xem mục Quyền).
  - **Ngày gửi** (`createdAt`).
  - **Thao tác** — nút "Xử lý" → toggle inline-expand.
- **Khối inline-expand (popup thao tác)** bung dưới dòng: textarea `response` (ghi chú phản hồi) + nút **Duyệt** / **Từ chối**. Nếu `type=ABSENCE` và có `sessionId` → thay bằng **3 nút nghiệp vụ**: "Xếp học bù" · "Đánh vắng có phép" · "Đánh vắng không phép".
- **`EmptyState`** khi không có đơn nào khớp filter.

**Dữ liệu hiển thị** (đọc qua `scopedDb(actor)` — cách ly cơ sở CS1↔CS2):
- Model **`ParentRequest`**: `id`, `studentId`, `parentUserId`, `type` (`ParentRequestType`), `content`, `preferredDate`, `sessionId`, `status`, `response`, `handledById`/`handledByName`/`handledAt`, `createdAt`.
- Quan hệ: `student` (tên HV, lớp đang học — qua `Enrollment`), `parentUser` (tên + SĐT/email PH — PII), `session` (`ClassSession` cho nhánh báo vắng: ngày/khung giờ/lớp).
- Dẫn xuất buổi vắng: `Attendance` (status/makeupStatus/absenceReason) + `MakeupNeed` khi đã giải quyết — để badge "đã xếp học bù".
- **PII:** SĐT/email/tên phụ huynh + tên HV. SALES_CSM thuộc `PARENT_CONTACT_ROLES` → **được xem SĐT/email PH** (khác GV/Marketing bị chặn). Vẫn đọc qua payload server đã scope; không leak `studentId` ra URL công khai (dùng id đơn, không phải id HV trần).

**Thao tác (actions):**

| Thao tác | Trang / Popup | Quyền cần | Server action tái dùng |
|---|---|---|---|
| Xem danh sách (lọc theo loại/trạng thái, tìm) | Trang (RSC đọc qua `scopedDb`) | `parent-requests:manage` | đọc trực tiếp trong page (không cần action ghi) |
| Duyệt đơn (APPROVED) | **Popup** (inline-expand/sheet trong dòng) | `parent-requests:manage` | `handleParentRequest({ id, decision:'APPROVE', response })` — parent-requests/actions.ts |
| Từ chối đơn (REJECTED) | **Popup** (inline-expand/sheet) | `parent-requests:manage` | `handleParentRequest({ id, decision:'REJECT', response })` |
| Báo vắng → **Xếp học bù** (tạo `MakeupNeed` + Attendance EXCUSED, APPROVED đơn) | **Popup** (nhánh trong expand khi type=ABSENCE + `sessionId`) | `parent-requests:manage` | `resolveAbsence({ requestId, action:'MAKEUP', excused:true, response })` — transaction + `createMakeupNeed` |
| Báo vắng → **Đánh vắng có phép** | **Popup** (nhánh expand) | `parent-requests:manage` | `resolveAbsence({ requestId, action:'ABSENT', excused:true, response })` |
| Báo vắng → **Đánh vắng không phép** | **Popup** (nhánh expand) | `parent-requests:manage` | `resolveAbsence({ requestId, action:'ABSENT', excused:false, response })` |
| Mở đơn qua deep-link | **Popup** (route `[id]` mở đúng dòng ở trạng thái expand) | `parent-requests:manage` | như trên |

Ghi chú quan trọng về ranh giới: `handleParentRequest` **chỉ đổi trạng thái đơn + ghi `response`/`handledBy*`**, KHÔNG tự thực thi nghiệp vụ (chuyển lớp/bảo lưu/đổi consent phải làm ở module tương ứng). Đơn `TRANSFER_CLASS`/`TRANSFER_CENTER`/`RESERVE`/`CONSENT_CHANGE` ở tab này chỉ **duyệt về mặt tiếp nhận**; nếu cần thực thi (vd chuyển lớp) Sale đi qua màn nghiệp vụ riêng (Sale không có `enrollments:transfer` → chuyển lớp thực tế là việc QL cơ sở). Chỉ nhánh `ABSENCE` là có tác động vận hành trực tiếp (học bù/điểm danh) ngay tại đây qua `resolveAbsence`.

**Trạng thái:**
- **Rỗng:** `EmptyState` tone slate — "Không có yêu cầu nào" + mô tả theo filter đang chọn (vd "Không có đơn Chờ xử lý ở cơ sở của bạn"). Khi filter mặc định PENDING mà sạch việc → có thể dùng `SuccessBanner` emerald "Đã xử lý hết yêu cầu".
- **Loading:** skeleton hàng bảng (RSC + Suspense; giữ toolbar tĩnh). Nút trong popup vào trạng thái pending khi `useTransition` đang chạy action; disable double-submit.
- **Lỗi:** action trả `{ ok:false, error }` → `toast.error` (sonner đã có trong shell); giữ nguyên khối expand để thử lại. Lỗi tải trang → error boundary của route group Sale.
- **Không-có-quyền:** actor không có `parent-requests:manage` → không thấy tab trong sidebar (nav lọc theo perm) VÀ page-gate redirect về trang mặc định của Sale (dashboard). Không render nội dung rồi mới ẩn.

**Quyền & phạm vi:**
- **Gate tab:** `parent-requests:manage` = `[SUPER_ADMIN, CENTER_MANAGER, SALES_CSM]`. Nav item hiển thị khi `can(user,'parent-requests:manage')`; PAGE_GATES là nguồn duy nhất để menu ≡ cổng (tránh dead-link/hở URL).
- **Scope:** cách ly cơ sở KHÔNG do role mà do **`scopedDb(actor)`** ép ở tầng query + `passesScope('Student')` trước mỗi mutation (chống IDOR liên cơ sở). SALES_CSM chỉ thấy đơn của HV thuộc cơ sở mình (scope CENTER); SUPER_ADMIN/HO bypass. Khác với `leads:view-own`, tab này KHÔNG lọc theo "assignedTo Sale" — đơn PH gắn HV/cơ sở, mọi Sale trong cơ sở đều xử lý được (hàng đợi CSKH chung cơ sở).
- Với RBAC v2 (sau flip `RBAC_V2_ENABLED`): action `parent-requests:manage` scope CENTER trong role `CENTER_SALES_CSM` — giữ parity 1-1 với v1. Trước flip, gate bằng `can()` v1.

**Ghi chú kỹ thuật:**
- **Tái dùng nguyên khối** server actions admin — KHÔNG viết lại logic: `handleParentRequest` và `resolveAbsence` (parent-requests/actions.ts) đã có `parent-requests:manage` gate + `scopedDb` + `passesScope('Student')` + transaction + `createMakeupNeed`. Site Sale chỉ lắp UI mới (clone UI kit GV) gọi lại, chạy trong `useTransition`.
- **Build mới:** chỉ phần vỏ UI — trang danh sách dùng `DataTable`/`ListToolbar`/`StatCard`, khối inline-expand chuyển sang sheet ở mobile, `StatusPill` cần **bổ sung từ điển** cho `ParentRequestType` + `ParentRequestStatus` (site GV chưa có các mã này) — thêm mapping mã→nhãn VI, không đổi cơ chế pill.
- **Cạm bẫy:**
  - `resolveAbsence` là **logic tài chính-vận hành nhạy cảm** (upsert `Attendance` + tạo `MakeupNeed`, ảnh hưởng buổi học/công nợ học bù) — KHÔNG nhân bản, chỉ gọi lại; giữ nguyên transaction.
  - Chỉ hiện 3 nút giải quyết vắng khi `type===ABSENCE` **và** có `sessionId` (báo vắng chung, không gắn buổi → chỉ Duyệt/Từ chối). Đơn ABSENCE không có buổi mà bấm nhánh MAKEUP sẽ thiếu ngữ cảnh buổi.
  - **`centerId=null`**: một số Enrollment/Attendance cũ chưa backfill centerId có thể lọt/rớt scope — đảm bảo `Attendance` upsert trong `resolveAbsence` set `centerId` theo HV (bug đã gặp nhiều màn); không tin centerId từ client.
  - Không tự thực thi chuyển lớp/bảo lưu tại đây (thiếu quyền + không phải module này) — chỉ đổi trạng thái đơn; tránh hiểu nhầm "đã duyệt = đã chuyển".
  - Đọc/ghi **luôn qua `scopedDb`**, cấm `@/lib/db` trần (ESLint chặn trong `app/**`); mask/không leak `studentId` trên URL — dùng id đơn.

---

### 19. Sắp hết khoá (tái tục)

- **Mục đích:** Hàng đợi CSKH cho tư vấn viên: liệt kê học viên đang học còn **≤5 buổi** để chủ động nhắc phụ huynh gia hạn/đăng ký khoá tiếp theo, kèm **số buổi còn lại** và **ngày kết thúc dự kiến** (tính theo lịch thực, đã trừ nghỉ lễ/cơ sở). Đây là kênh chặn churn `NEARING_END_NO_RENEWAL` trước khi lead nguội.

- **Loại màn hình:** **Trang danh sách + popup thao tác.** Bảng worklist là trục chính (read-heavy). Trong đó:
  - Mở **trang mới**: "Xem hồ sơ HV" (→ `/students/[id]`) và "Ghi danh khoá tiếp theo / tái tục" (→ `/enrollments/new?studentId=...`).
  - Mở **popup (dialog/sheet)**: "Đánh dấu đã liên hệ tái tục" và "Tạo việc nhắc tái tục" (thao tác nhanh, không rời danh sách).
  - KHÔNG dùng iframe/nhúng (đây không phải form MISA).

- **Đường dẫn:** `/sale/sap-het-khoa` (danh sách). Không có route con riêng — các thao tác đi tới trang dùng chung (`/sale/hoc-vien/[id]`, `/sale/ghi-danh/moi`) hoặc mở popup tại chỗ.

- **Bố cục & thành phần chính:**
  - `PageHeader` — title "Sắp hết khoá (tái tục)", subtitle "Học viên còn ≤5 buổi — nhắc gia hạn"; vùng `actions` để trống hoặc nút phụ "Làm mới".
  - Hàng `StatCard` (4 thẻ KPI, tone theo ngữ nghĩa): (1) **Tổng HV sắp hết khoá** (tone `brand`), (2) **Gấp ≤2 buổi** (tone `red`), (3) **Chưa liên hệ** (tone `amber`), (4) **Đã tái tục tháng này** (tone `green`).
  - `ListToolbar` — `SearchInput` (tìm tên HV / mã HV / SĐT PH) + các `Select` lọc: **Số buổi còn lại** (≤5 / ≤3 / ≤2 / =0), **Khoá/cấp độ**, **Trạng thái tái tục** (Chưa liên hệ / Đã liên hệ / Đã tái tục / Từ chối), và **Cơ sở** (chỉ hiện khi user có quyền >1 cơ sở — mặc định ẩn với Sale 1 cơ sở).
  - `DataTable` — các cột: **Học viên** (`fullName` + `studentCode`, cell là link mở hồ sơ), **Lớp / Khoá**, **Số buổi còn lại** (badge `StatusPill`: đỏ khi ≤2, cam khi 3–5), **Ngày kết thúc dự kiến** (`projectEndDate`), **Phụ huynh + SĐT** (chỉ hiện khi có `leads:view-pii`/`canViewParentContact`; có link `tel:`), **Trạng thái tái tục** (`StatusPill`), **Thao tác** (cụm nút cuối dòng).
  - `EmptyState` khi không có HV nào sắp hết khoá (tone `green` — "Không có học viên nào cần nhắc tái tục").

- **Dữ liệu hiển thị (model/field Prisma):**
  - `Enrollment` (status ACTIVE/đang học): `id`, `studentId`, `classId`, `centerId`, `finalPrice`.
  - `Student`: `fullName`, `studentCode`, quan hệ `parent` (User).
  - `Class` → `Course`: `name`, `Course.totalSessions` (hoặc số buổi từ Curriculum lessons).
  - `Attendance` (đã điểm danh) + `Holiday` (nghỉ cơ sở) → tính **`sessionsLeft`** và **`projectEndDate`** qua `getNearingEndEnrollments()` (`lib/students/renewal.ts:120-268`).
  - PII phụ huynh (`parent.name/phone/email`): **mask ở server** cho actor không có `leads:view-pii`; Sale thuần (SALES_CSM) có `canViewParentContact` → thấy đầy đủ + link gọi. Không lộ `studentId` trần trên URL nhạy cảm; điều hướng qua route group đã auth.
  - Trạng thái tái tục: nếu tái dùng `StudentRiskAlert` loại `NEARING_END_NO_RENEWAL` (status OPEN/RESOLVED) làm nguồn "đã xử lý" thì đọc kèm; nếu chưa có, xem mục Ghi chú kỹ thuật.

- **Thao tác (actions):**

  | Thao tác | Trang / Popup | Quyền cần | Server action tái dùng |
  |---|---|---|---|
  | Xem danh sách sắp hết khoá | Trang (RSC load) | `enrollments:view-all` (Sale CÓ) | `getNearingEndEnrollments()` — đọc, cần bọc `scopedDb` |
  | Xem hồ sơ học viên | **Trang mới** (`/sale/hoc-vien/[id]`) | `students:view-all` | RSC read qua `scopedDb.student` |
  | Gọi / nhắn phụ huynh | Không phải server action (link `tel:` / copy SĐT) | `leads:view-pii` / `canViewParentContact` | — (chỉ hiện khi có quyền) |
  | Ghi danh khoá tiếp theo (tái tục) | **Trang mới** (`/sale/ghi-danh/moi?studentId=...`) | `enrollments:create` (Sale CÓ) | `enrollStudent()` (`enrollments/_actions.ts`) — Serializable tx, re-check sĩ số, prerequisite |
  | Ghi nhận thanh toán tái tục (nếu thu tại chỗ) | **Popup** (trong luồng ghi danh) | `payments:record` (Sale CÓ; KHÔNG confirm) | `recordPaymentAction()` |
  | Đánh dấu "Đã liên hệ tái tục" / cập nhật trạng thái | **Popup** (dialog nhỏ + textarea ghi chú) | `parent-requests:manage` (Sale CÓ) | *cần build* (xem Ghi chú) — hoặc `completeCareTask()` nếu gắn care task |
  | Tạo việc nhắc tái tục (follow-up có hạn) | **Popup** | `parent-requests:manage` | *cần build nhẹ* dựa trên `StudentCareTask` (model đã có) |

  Ẩn hoàn toàn các nút Sale không có quyền (điểm danh, xác nhận thanh toán, hoàn tiền, chấm rubric).

- **Trạng thái:**
  - **Rỗng:** `EmptyState` tone green — "Không có học viên nào còn ≤5 buổi. Sạch việc tái tục 🎉".
  - **Loading:** skeleton bảng (Suspense fallback ở RSC) + StatCard placeholder; không dùng `useEffect` fetch.
  - **Lỗi:** banner đỏ "Không tải được danh sách" + nút thử lại; lỗi tính `projectEndDate` (thiếu lịch/Holiday) → dòng vẫn hiện, cột ngày kết thúc để "—" thay vì vỡ trang.
  - **Không-có-quyền:** layout gate `/sale` bounce nếu thiếu role SALES_CSM; nếu vào tab mà thiếu `enrollments:view-all` → redirect về dashboard sale (menu cũng đã ẩn item theo `PAGE_GATES`).

- **Quyền & phạm vi:**
  - Gate tab: **`enrollments:view-all`** (SALES_CSM có sẵn — dùng chung với `/admin/students/sap-het-khoa`).
  - Scope hiển thị: **CENTER** — Sale chỉ thấy HV **cơ sở mình** (cách ly qua `scopedDb(actor)`; CS1 không thấy CS2). SUPER_ADMIN/HO bypass. Không lọc theo `assignedToId` như lead (đây là toàn cơ sở, không phải "lead của tôi").
  - Thao tác ghi (`enrollments:create`, `payments:record`, `parent-requests:manage`) đều gate lại trong server action + `passesScope` chống IDOR liên cơ sở.

- **Ghi chú kỹ thuật:**
  - **Tái dùng nguyên khối:** `getNearingEndEnrollments()` (logic tính buổi còn lại + ngày kết thúc theo lịch thực đã có, đừng viết lại); `enrollStudent()` cho ghi danh tái tục; `recordPaymentAction()` cho thu tiền; UI kit 8 primitive clone từ site GV.
  - **⚠️ Cạm bẫy `scopedDb`:** `getNearingEndEnrollments()` trong `lib/students/renewal.ts` **hiện đọc `@/lib/db` TRẦN** và lọc `centerId` bằng tham số. Cho Sale thuần **BẮT BUỘC bọc `scopedDb(actor)`** trước khi mở trên site Sale, nếu không sẽ **leak liên cơ sở** (ESLint cũng chặn import db trần trong `app/**`). Đây là điểm build/refactor chính của tab.
  - **⚠️ centerId=null:** một số `Enrollment` cũ có `centerId=null` (bug gặp nhiều trang) → hàm tính có thể lọt/lọc sai. Cần fallback theo `class.centerId` và xác nhận backfill trước khi tin số liệu KPI.
  - **Gap "đã nhắc":** hiện **KHÔNG có model nhật ký chăm sóc HV tự do**. Trạng thái "Đã liên hệ tái tục" cần build mới nhẹ — khuyến nghị dựa trên `StudentCareTask` (title/description/dueAt/status) đã có, hoặc tạo/đóng `StudentRiskAlert(NEARING_END_NO_RENEWAL)`. Tránh đẻ model mới nếu chưa cần (dùng lại 2 model sẵn có).
  - **Ranh giới tiền:** ghi danh tái tục có thu tiền → Sale chỉ `payments:record` (RECORDED), kế toán `confirm` sinh Receipt. Mọi bút toán tiền/ghi danh chạy trong **transaction** của `enrollStudent`/`recordPayment` — không tách rời inline.
  - **Voucher/chiết khấu tái tục:** áp ở **Order** khi tạo đơn, không ở Enrollment (giữ đúng convention convert v2: `finalPrice=listPrice`).

---

### 20. Học viên

**Mục đích:** Tra cứu và chỉnh sửa hồ sơ học viên trong toàn cơ sở (KHÔNG sửa mã HV — chỉ SUPER_ADMIN), đọc lịch sử học tập/đóng phí/học thử để CSKH và tư vấn tái tục. Đây là màn "gốc hồ sơ HV" mà các tab CSKH khác (Sắp hết khoá, Cảnh báo rủi ro, Yêu cầu PH) trỏ về.

**Loại màn hình:** **Trang danh sách + popup thao tác** kèm 1 route con chi tiết.
- `/sale/hoc-vien` = trang danh sách (data-table + toolbar filter).
- `/sale/hoc-vien/[id]` = **trang riêng** chi tiết hồ sơ HV (nhiều section: thông tin + ghi danh + điểm danh tóm tắt + đóng phí/công nợ + lịch sử học thử). Mở khi bấm tên HV.
- **Sửa hồ sơ HV** = **popup (Sheet phải)** — sửa nhanh trên cả trang danh sách lẫn trang chi tiết, không rời ngữ cảnh.
- Các nút CSKH (tạo việc chăm sóc, xem yêu cầu PH, nhắc tái tục) là **điều hướng sang tab khác** (link), KHÔNG mở popup tại đây.

**Đường dẫn:**
- `/sale/hoc-vien` — danh sách.
- `/sale/hoc-vien/[id]` — chi tiết 1 HV (route con).

**Bố cục & thành phần chính:**
- `PageHeader` — tiêu đề "Học viên" + subtitle "Tra cứu hồ sơ & tư vấn tái tục"; vùng actions bên phải: nút "Sắp hết khoá" (link `/sale/sap-het-khoa` hoặc `/sale/sap-het-khoa`). KHÔNG có nút "Tạo HV" ở đây (tạo HV đi qua luồng Convert lead, không tạo tay tại tab CSKH).
- `ListToolbar` = `SearchInput` (tìm theo tên HV / mã HV / SĐT phụ huynh) + các `Select` lọc: **Lớp đang học**, **Khoá**, **Trạng thái ghi danh** (đang học / sắp hết khoá / đã nghỉ / bảo lưu), **Cơ sở** (chỉ hiện dropdown khi user đa cơ sở; Sale 1 cơ sở → nhãn tĩnh).
- Hàng `StatCard` (tùy chọn, tone brand cam của Sale): Tổng HV cơ sở · Đang học · Sắp hết khoá (≤5 buổi) · Có công nợ. Chỉ để định hướng CSKH, không phải KPI tài chính.
- `DataTable<StudentRow>` — cột: **Mã HV** (`studentCode`, read-only), **Họ tên** (link → `/sale/hoc-vien/[id]`), **Ngày sinh/Tuổi**, **Phụ huynh** (tên + SĐT bấm gọi), **Lớp/Khoá đang học**, **Số buổi còn lại** (badge `StatusPill` cam khi ≤5), **Trạng thái** (`StatusPill`), cột thao tác (nút "Sửa" mở Sheet). Cuộn ngang trên mobile.
- Trang chi tiết `[id]`: `PageHeader` (tên + mã HV + trạng thái) → các khối: (1) Thông tin HV & phụ huynh; (2) Ghi danh hiện tại + lịch sử ghi danh; (3) Tóm tắt điểm danh (chỉ số, read-only); (4) Đóng phí / công nợ (read-only, gọi kế toán xác nhận ở nơi khác); (5) Lịch sử học thử (`LeadTrialHistory`); (6) khối "Truy cập nhanh CSKH" (link sang Yêu cầu PH / Cảnh báo rủi ro / Tái tục của HV này).
- `EmptyState` khi lọc rỗng; `StatusPill`/`SessionStatusPill` cho enum trạng thái.

**Dữ liệu hiển thị (model/field Prisma, qua `scopedDb(actor)`):**
- `Student` — `studentCode` (read-only), `fullName`, `dateOfBirth`, `gender`, `centerId`, `deletedAt` (lọc NULL), liên kết `parentUser` (User PARENT: `name`, `phone`, `email`).
- `Enrollment` — `classId`, `courseId`/`class.course`, `status`, `finalPrice`, `centerId` (denormalize), `startedAt`; dùng để suy "đang học / sắp hết khoá".
- Tính "sắp hết khoá / số buổi còn lại": qua `getNearingEndEnrollments` / `lib/students/renewal.ts` (⚠️ xem Ghi chú kỹ thuật — hàm này hiện đọc `db` trần, cần bọc scope trước khi phơi cho Sale thuần).
- `Attendance` — tóm tắt số buổi học/nghỉ (read-only, KHÔNG mở tab điểm danh độc lập vì Sale không có `attendance:view`).
- `Order` / `Payment` (`saleStatus`, `accountantStatus`) + `getLeadPaymentSummary`/summary công nợ — **read-only**, chỉ để CSKH biết còn thiếu; ghi/xác nhận tiền KHÔNG nằm ở tab này.
- `StudentConsent` — cờ đồng ý hình ảnh (hiển thị, sửa qua yêu cầu PH `CONSENT_CHANGE`, không sửa trực tiếp tại đây).
- `LeadTrialHistory` / `LeadChild.trialStatus` — lịch sử "đã từng học thử" để tư vấn tái tiếp cận.
- **PII:** SALES_CSM thuộc `PARENT_CONTACT_ROLES` (`canViewParentContact` = true) → được xem SĐT/email phụ huynh. Vẫn đọc qua `scopedDb` để cách ly cơ sở; không bypass mask ở UI.

**Thao tác (actions):**

| Thao tác | Trang / Popup | Quyền cần | Server action tái dùng |
|---|---|---|---|
| Tra cứu / lọc / tìm HV | Trang (`/sale/hoc-vien`, RSC + searchParams) | `students:view-all` | — (RSC đọc qua `scopedDb.student`) |
| Xem chi tiết hồ sơ HV | **Trang riêng** (`/sale/hoc-vien/[id]`) | `students:view-all` | — (RSC) |
| Sửa hồ sơ HV (tên/NS/giới tính/ghi chú; **KHÔNG** sửa `studentCode`) | **Popup (Sheet)** | `students:edit` | `updateStudentAction` (admin `students/*`), gate `passesScope('Student')` chống IDOR |
| Sửa thông tin phụ huynh liên hệ | **v1: KHÔNG mở (read-only)** — sửa qua admin | — | ĐÃ CHỐT: không sửa `parentUser` (User của người khác) từ site Sale; chỉ hiển thị |
| Tạo việc chăm sóc cho HV | **Điều hướng** → `/sale/cham-soc-hv` (hoặc popup tạo task nếu tái dùng `StudentCareTask`) | `parent-requests:manage` | `completeCareTask`/tạo task (canh-bao-rui-ro/_actions) |
| Nhắc tái tục / xem sắp hết khoá | **Điều hướng** → tab Tái tục / Sắp hết khoá | `enrollments:view-all` | `getNearingEndEnrollments` |
| Xem yêu cầu PH của HV | **Điều hướng** → `/sale/yeu-cau-ph?studentId=` | `parent-requests:manage` | — |

> Quy tắc page-vs-popup: **đọc sâu = trang** (`[id]`), **sửa nhanh 1 record = popup Sheet**, **chuyển nghiệp vụ sang miền khác (CSKH/tái tục) = điều hướng link** để giữ mỗi tab một trách nhiệm rõ.

**Trạng thái:**
- **Rỗng:** `EmptyState` (icon người dùng, tone slate) — "Chưa có học viên nào khớp bộ lọc" + gợi ý xoá lọc. Khi cơ sở chưa có HV: "Cơ sở chưa có học viên".
- **Loading:** skeleton hàng của `DataTable` (Suspense ở boundary trang); Sheet sửa hiện spinner khi submit.
- **Lỗi:** banner đỏ + `toast.error`; lỗi tải chi tiết `[id]` → trang lỗi cục bộ với nút thử lại; lỗi lưu Sheet → giữ form, hiện message field.
- **Không-có-quyền:** layout `/sale` đã gate role; nếu thiếu `students:view-all` → không render tab (nav lọc theo perm) + truy cập trực tiếp URL redirect về dashboard Sale. Nếu có view nhưng thiếu `students:edit` → nút "Sửa" ẩn/disabled, Sheet không mở.

**Quyền & phạm vi:**
- **Gate tab:** `students:view-all` (SALES_CSM CÓ) — hiển thị + route-gate qua PAGE_GATES.
- **Gate sửa:** `students:edit` (SALES_CSM CÓ) trên mọi mutator, kèm `assertCan` + `passesScope('Student')`.
- **Scope:** không nằm trong ma trận role mà do `scopedDb(actor)` ép ở tầng query → **CS1 không thấy HV CS2** (scope hiệu dụng CENTER). Sale làm 1 cơ sở; CENTER_MANAGER đa cơ sở thấy switcher chọn cơ sở. Test CI bắt buộc phủ "CS1 không đọc được Student CS2".
- **KHÔNG** cấp: sửa `studentCode` (chỉ SUPER_ADMIN), tạo HV tay (đi qua Convert), xoá HV (soft-delete là quyền quản lý), xem/sửa CCCD-địa chỉ đầy đủ (`payments:view-pii` break-glass — không thuộc Sale).

**Ghi chú kỹ thuật:**
- **Tái dùng nguyên khối** server action `students:*` hiện có trong admin (`app/(admin)/admin/students/*`) — đã có gate `checkPermission` + `scopedDb` + `passesScope` + audit; site Sale chỉ lắp UI (danh sách + Sheet), **KHÔNG** viết lại logic.
- **Cạm bẫy — leak liên cơ sở:** `getNearingEndEnrollments` trong `lib/students/renewal.ts` hiện đọc `db` trần và lọc `centerId` qua tham số → **phải bọc `scopedDb(actor)`** trước khi phơi cho Sale thuần, nếu không HV cơ sở khác lọt vào danh sách tái tục.
- **Cạm bẫy — `centerId=null` trên Enrollment:** nhiều HV cũ/chuyển cơ sở có `Enrollment.centerId` null → dễ rơi khỏi bộ lọc scope hoặc hiện sai cơ sở; cần fallback theo `class.centerId` và tôn trọng carve-out "QL/Sale được XEM học bạ cũ HV chuyển cơ sở (read-only)".
- **Mã HV bất biến:** field `studentCode` phải render read-only trong Sheet; không đưa vào payload update (action bỏ qua kể cả client gửi lên).
- **Tiền là read-only tại tab này:** mọi số đóng phí/công nợ chỉ hiển thị (Sale `payments:record` dùng ở luồng ghi danh, không ở hồ sơ HV); tuyệt đối không nhúng nút xác nhận/hoàn tiền (thuộc kế toán). Nếu cần thao tác tiền → điều hướng sang luồng ghi danh/thanh toán.
- **Cần build mới:** UI danh sách + Sheet sửa trong route group `app/(sale)/sale/hoc-vien/` (clone UI kit từ site GV: `DataTable`/`ListToolbar`/`PageHeader`/`StatCard`/`EmptyState`/`StatusPill`/`SearchInput`); từ điển `StatusPill` cần map trạng thái ghi danh (đang học/sắp hết/nghỉ/bảo lưu) thay vì trạng thái GV.
- **KHÔNG** import `@/lib/db` trần trong `app/(sale)/**` (ESLint chặn) — mọi truy vấn qua `scopedDb(actor)`; dùng shadcn thuần (không Magic UI/Framer/Recharts); `metadata` robots noindex + `dynamic='force-dynamic'` như layout teacher.

---

### 21. Hoa hồng của tôi

- **Mục đích:** Cho tư vấn viên (SALES_CSM) tự xem bảng kê hoa hồng CÁ NHÂN của chính mình theo từng kỳ (đã chốt trên LEADS_3), read-only — biết mình được bao nhiêu, từ deal nào, đã duyệt/chưa. KHÔNG động tới quy trình duyệt/mở lại/export toàn hệ thống (đó là việc kế toán/QL qua `/admin/crm/commission`).

- **Loại màn hình:** **Trang riêng** (danh sách theo kỳ) + 1 popup phụ. Cụ thể:
  - Trang chính `/sale/hoa-hong` = trang riêng, chọn kỳ + xem tổng + bảng chi tiết dòng hoa hồng.
  - Xem chi tiết 1 dòng (deal nào, lead nào, vì sao clawback) = **popup/sheet** (Dialog) mở tại chỗ, KHÔNG chuyển trang — vì Sale chỉ được xem, không cần trang con nặng.
  - Không có route động `[id]` (statement là theo kỳ, không mở trang chi tiết riêng cho Sale).

- **Đường dẫn:** `/sale/hoa-hong` (query `?period=YYYY-MM` để chọn kỳ; mặc định kỳ gần nhất có dữ liệu). Không có route con.

- **Bố cục & thành phần chính:**
  - `PageHeader` — title "Hoa hồng của tôi", subtitle "Bảng kê theo kỳ · chỉ xem" ; vùng `actions` bên phải chứa `Select` chọn kỳ (danh sách các `period` mà tôi có dòng hoa hồng).
  - Hàng `StatCard` (3–4 thẻ, tone `brand`/`green`/`amber`):
    - Tổng hoa hồng kỳ này (tổng `amount` các dòng của tôi trong kỳ đã chọn).
    - Số dòng / số deal góp hoa hồng.
    - Trạng thái kỳ: "Tạm tính" (statement DRAFT) hay "Đã chốt" (APPROVED) — dùng `StatusPill` (brand=tạm tính, green=đã chốt).
    - (tuỳ chọn) Khấu trừ/clawback trong kỳ (tổng các `amount` âm) — tone `red`.
  - `ListToolbar` nhẹ: `SearchInput` (tìm theo tên/mã lead) + `Select` lọc tier (QC/SALE_ADMIN/SALE/QL_TT — thường Sale chỉ có tier SALE, nhưng giữ để lọc). KHÔNG có nút tạo/sửa.
  - `DataTable` — bảng dòng hoa hồng, cột: **Kỳ** · **Lead/Deal** (tên PH + mã lead, link mở popup) · **Vai trò tính hoa hồng (tier)** · **Số tiền** (VND, âm hiển thị đỏ = khấu trừ) · **Trạng thái kỳ** (`StatusPill`) · nút "Chi tiết" (mở popup). Bọc `.t-card`, cuộn ngang mobile.
  - Banner ghi chú (dùng `SuccessBanner`/callout amber) khi kỳ đang DRAFT: "Đây là số **tạm tính**, chưa được kế toán chốt — có thể thay đổi."
  - Popup chi tiết dòng (Dialog): hiện lead nguồn, deal/enrollment liên quan, tier + % áp dụng, lý do nếu là clawback (refund trong kỳ), thời điểm ghi nhận. Read-only.

- **Dữ liệu hiển thị (model/field Prisma):**
  - `CommissionLine`: `recipientId` (= session.user.id — điều kiện lọc bắt buộc), `tier` (QC / SALE_ADMIN / SALE / QL_TT), `amount` (VND, âm = clawback), `leadId`, `statementId`/`period`.
  - `CommissionStatement`: `period` (@unique), `status` (DRAFT=Tạm tính / APPROVED=Đã chốt). Lưu ý: **statement KHÔNG có `centerId`**.
  - Join hiển thị lead: `Lead.parentName` + mã lead qua `leadId`. **Tôn trọng PII** — chỉ hiện SĐT/tên đầy đủ nếu actor có `leads:view-pii` (SALES_CSM có); dùng lại `maskLeadPiiFields`/`canViewLeadPii` ở server. Vì đây là hoa hồng của CHÍNH tôi trên lead tôi phụ trách nên gần như luôn đủ quyền, nhưng vẫn phải qua mask ở server (không tin UI).
  - **scopedDb**: cách ly cơ sở tự nhiên vì lọc cứng `recipientId = me`; không đọc dòng của người khác. Không cần lọc `centerId` thủ công (recipientId đã là hàng rào), nhưng vẫn đọc qua `scopedDb(actor)` theo convention #4 (cấm `@/lib/db` trần trong `app/**`).

- **Thao tác (actions):**

| Thao tác | Trang / Popup | Quyền cần | Server action tái dùng |
|---|---|---|---|
| Xem bảng kê hoa hồng của tôi theo kỳ | Trang (`/sale/hoa-hong`, RSC) | `commission:view-own` (MỚI) | RSC read qua `scopedDb` — query `commissionLine.findMany({ where: { recipientId: me } })` (helper mới `getMyCommission(actor, period)` trong `lib/commission/` hoặc `lib/sale/commission.ts`) |
| Chọn/đổi kỳ (period) | Trang (đổi query `?period=`) | `commission:view-own` | — (điều hướng, RSC đọc lại) |
| Lọc theo tier / tìm theo lead | Trang (client filter trên data đã fetch) | `commission:view-own` | — (client-side, không gọi action) |
| Xem chi tiết 1 dòng (deal/clawback) | **Popup** (Dialog) | `commission:view-own` (+ `leads:view-pii` để hiện PII lead) | — (dữ liệu đã có trong payload RSC; popup chỉ render, không gọi action riêng) |

> Ghi chú: tab này **hoàn toàn read-only** — KHÔNG có action duyệt/mở lại/export (`approveStatementAction`/`reopenStatementAction`/commission-export đều gate `payments:manage`, KHÔNG cấp cho Sale). Không mở/nhúng `/admin/crm/commission`.

- **Trạng thái:**
  - **Rỗng (empty-state):** kỳ đã chọn không có dòng nào của tôi → `EmptyState` (icon ví/coin, title "Chưa có hoa hồng kỳ này", mô tả "Hoa hồng được tính tự động cuối kỳ trên các deal bạn đã chốt").
  - **Chưa có kỳ nào:** ẩn Select kỳ, hiện `EmptyState` "Chưa có bảng kê hoa hồng nào cho bạn".
  - **Loading:** Suspense skeleton cho `DataTable` + `StatCard`.
  - **Lỗi:** callout đỏ "Không tải được bảng kê, thử lại" (không vỡ layout — theo pattern `.catch` fan-out).
  - **Không-có-quyền:** thiếu `commission:view-own` → mục nav ẩn (nav lọc theo perm) + gate route redirect về dashboard sale (đồng bộ menu≡cổng, chống hở URL).

- **Quyền & phạm vi:**
  - Gate tab: **`commission:view-own`** — **permission MỚI** cần thêm vào ma trận v1 (`lib/auth/permissions.ts`) và role động v2 (`seed-roles.ts` `CENTER_SALES_CSM`), giữ **parity v1↔v2** (cập nhật `rbac-parity.test.ts` — sẽ thành 29 action). Scope **OWN** (recipientId = actor.id).
  - Cấp cho: mọi staff hưởng hoa hồng (SALES_CSM chắc chắn; có thể mở rộng CENTER_MANAGER/HO_SALE/MARKETING nếu họ cũng là recipient — nhưng vẫn chỉ thấy dòng của chính mình, không phải toàn kỳ).
  - Cách ly: OWN-filter là hàng rào chính; đọc qua `scopedDb(actor)` theo convention.

- **Ghi chú kỹ thuật:**
  - **Tái dùng:** model `CommissionStatement`/`CommissionLine` đã tồn tại (schema:521–544); UI primitives site GV (`PageHeader`/`DataTable`/`StatCard`/`StatusPill`/`ListToolbar`/`EmptyState`) clone gần nguyên xi; `StatusPill` cần thêm từ điển DRAFT→"Tạm tính" / APPROVED→"Đã chốt". PII mask tái dùng `maskLeadPiiFields`/`canViewLeadPii`.
  - **Build mới:** (1) permission `commission:view-own` + parity test; (2) helper đọc `getMyCommission(actor, period)` lọc `recipientId=session.user.id` (HIỆN admin CHƯA có màn "hoa hồng của tôi" — chỉ có màn theo-kỳ toàn hệ thống, phải viết mới phần đọc này); (3) trang `/sale/hoa-hong` + popup chi tiết.
  - **Cạm bẫy:**
    - `amount` **âm = clawback** (refund/hoàn tiền trong kỳ) — phải render rõ (đỏ, dấu −) và tổng phải cộng cả âm, đừng `Math.abs`.
    - Statement **DRAFT = tạm tính, chưa chốt** — phải cảnh báo "có thể thay đổi", đừng để Sale hiểu nhầm là tiền chắc chắn. **ĐÃ CHỐT (QĐ-5):** Sale xem DRAFT của **kỳ hiện tại** (nhãn "tạm tính") + APPROVED các kỳ cũ; kỳ cũ chưa APPROVED thì ẩn.
    - `CommissionStatement` **không có `centerId`** → KHÔNG lọc theo center ở tầng statement; cách ly hoàn toàn dựa vào `recipientId=me`. Đừng vô tình join lộ dòng người khác.
    - KHÔNG gọi bất kỳ action nào gate `payments:manage` (approve/reopen/export) — chúng sẽ throw và cũng sai nghiệp vụ (Sale không được đụng bảng kê toàn hệ thống).
    - Không cần transaction (read-only, không đụng tiền/enrollment).
    - Các câu hỏi mở của Commission Engine (thời điểm ghi nhận LEADS_3, clawback khi REFUNDED, đổi sale giữa chừng ai hưởng 4%) ảnh hưởng **cách tính** `amount` ở engine, KHÔNG ảnh hưởng màn hiển thị này — tab chỉ đọc kết quả engine đã ghi.

---

### 22. Báo cáo

- **Mục đích:** Cho tư vấn viên (SALES_CSM) tự soi hiệu suất trong tầm scope của mình: phễu lead của tôi (theo phễu SR.QD.217), tỉ lệ chuyển đổi học thử → đăng ký, và churn/rời bỏ của học viên trong cơ sở. Chỉ đọc — không có số liệu tài chính/hoa hồng/công nợ (ngoài quyền Sale).

- **Loại màn hình:** **Trang riêng** (RSC full page) với **các tab con** chuyển view (Phễu Lead · Học thử → Đăng ký · Churn/Rời bỏ), tab con đổi bằng query param `?tab=` (điều hướng trong trang, KHÔNG mở trang mới, KHÔNG popup). Trong đó:
  - Đổi bộ lọc (khoảng thời gian / nguồn / cơ sở) → **cập nhật tại chỗ** (searchParams, không mở trang/popup mới).
  - Bấm 1 dòng lead/HV trong bảng drill-down → **mở trang mới** (trang chi tiết lead `/sale/leads/[id]`), KHÔNG popup.
  - Xuất Excel/CSV → **tải file** (không phải trang cũng không phải popup — là download qua route API), có thể kèm dialog xác nhận nhẹ nếu cần chọn phạm vi.

- **Đường dẫn:** `/sale/bao-cao` (mặc định `?tab=phieu-lead`). Tab con qua query: `/sale/bao-cao?tab=hoc-thu`, `/sale/bao-cao?tab=churn`. Không có route động con; drill-down trỏ ra `/sale/leads/[id]` hoặc `/sale/hoc-thu/[id]` (thuộc tab khác của site).

- **Bố cục & thành phần chính:** (tái dùng UI kit clone từ site GV — đổi `.teacher-root`→`.sale-root`)
  - `PageHeader` — tiêu đề "Báo cáo của tôi" + subtitle "Phễu lead, chuyển đổi học thử và rời bỏ — trong phạm vi của bạn" + vùng `actions` bên phải chứa nút **Xuất Excel**.
  - **Dải bộ lọc** dùng `ListToolbar` (biến thể): `SearchInput` (tìm tên/SĐT trong bảng drill-down) + các `Select` filter: Khoảng thời gian (Tuần này / Tháng này / 30 ngày / Tùy chọn), Nguồn lead (source), Cơ sở (chỉ hiện khi user có quyền >1 cơ sở — Sale 1 cơ sở thì ẩn/nhãn tĩnh).
  - **Tabs con** (segmented, dùng shadcn Tabs — KHÔNG Recharts): `Phễu Lead` · `Học thử → Đăng ký` · `Churn/Rời bỏ`.
  - **Hàng thẻ KPI** dùng `StatCard` (tone `brand` cho chỉ số chính, `green/amber/red/blue` cho ngữ nghĩa):
    - Tab Phễu Lead: `Lead mới` · `Đang xử lý` · `Đã chốt (ENROLLED)` · `Tỉ lệ chốt %` · `Đã mất (LOST)`.
    - Tab Học thử: `Đã xếp học thử` · `Dự đủ buổi` · `Đã học thử (ATTENDED)` · `Chốt sau học thử` · `Tỉ lệ trial→đăng ký %`.
    - Tab Churn: `HV nguy cơ (OPEN alert)` · `Nghỉ liên tiếp` · `Sắp hết khoá chưa tái tục` · `Công nợ quá hạn` (badge số, không hiện số tiền).
  - **Khối phễu trực quan** = các thanh ngang tỉ lệ dựng bằng CSS/Tailwind (div width theo %) trong `.t-card` — **KHÔNG dùng Recharts** (site Sale cấm Recharts như client). Mỗi bậc: nhãn VI chuẩn (Mới → Đã liên hệ → Đang tư vấn → Đã hẹn/đang học thử → Đã học thử → Chờ quyết định → Đã đăng ký → Đã ghi danh) + số + %.
  - **Bảng drill-down** dùng `DataTable<T>` (bọc `.t-card`, cuộn ngang):
    - Phễu Lead — cột: Tên PH (mask theo quyền) · SĐT · Trạng thái (`StatusPill`) · Nguồn · Ngày tạo · Lần liên hệ đầu (firstContactAt) · Hành động (mở chi tiết).
    - Học thử — cột: Tên con · Lớp trải nghiệm · Số buổi dự/tổng · Điểm rubric (nếu có) · Trạng thái trial (`StatusPill`) · Kết quả (Đã chốt / Chưa).
    - Churn — cột: Tên HV · Loại cảnh báo · Mức độ (`StatusPill` LOW/MEDIUM/HIGH) · Chi tiết · Trạng thái xử lý.
  - `EmptyState` cho từng tab khi không có dữ liệu.

- **Dữ liệu hiển thị:** (mọi query qua `scopedDb(actor)` — cách ly cơ sở CS1↔CS2)
  - Phễu Lead: `Lead` (filter `assignedToId = session.user.id` vì `leads:view-own`) — field: `status` (enum `LeadStatus` 15 giá trị), `source`, `createdAt`, `firstContactAt`, `qualifiedAt`, `assignedAt`, `centerId`; join `LeadChild` để đếm con. Nhãn trạng thái lấy từ label registry VI (`lib/leads/status.ts`), KHÔNG tự đặt tên.
  - Học thử: `TrialClassV2` + `TrialEnrollment` + `TrialAttendance` + `LeadChild.trialStatus` (NONE/SCHEDULED/IN_PROGRESS/ATTENDED) + `LeadTrialHistory` (outcome ENROLLED/LOST/PENDING); điểm rubric đọc `TrialRubricEval.totalScore/rank` (read-only). Đối chiếu `Lead.status` để tính conversion trial→REGISTERED/ENROLLED.
  - Churn: `StudentRiskAlert` (type 6 loại, severity, status OPEN/ESCALATED/RESOLVED) + `StudentCareTask` (đếm việc mở) + `Enrollment` sắp hết khoá (`getNearingEndEnrollments`, còn ≤5 buổi).
  - **PII:** tôn trọng `leads:view-pii` — SALES_CSM CÓ quyền này nên thấy đầy đủ SĐT/tên; nếu site phục vụ role không có view-pii (vd MARKETING) thì mask ở SERVER qua `maskLeadPiiFields()`/`canViewLeadPii` (không chỉ ẩn UI). Báo cáo Churn chỉ hiện badge số, **không** lộ số tiền công nợ (thuộc `payments:manage` — ngoài quyền Sale).

- **Thao tác (actions):**

| Thao tác | Trang / Popup | Quyền cần | Server action / logic tái dùng |
|---|---|---|---|
| Đổi tab con (Phễu / Học thử / Churn) | Tại chỗ (searchParams, không trang/popup) | quyền tab tương ứng | — (RSC đọc lại theo `?tab=`) |
| Lọc theo thời gian / nguồn / cơ sở | Tại chỗ (searchParams) | leads:view-own | — (RSC filter) |
| Tìm trong bảng drill-down | Tại chỗ (client filter/searchParams) | — | `SearchInput` (client) |
| Xem chi tiết 1 lead | **Mở trang mới** `/sale/leads/[id]` | leads:view-own (+scope) | RSC lead detail (đọc qua scopedDb) |
| Xem chi tiết lớp trải nghiệm | **Mở trang mới** `/sale/hoc-thu/[id]` | trials:view | RSC trial detail (scopedDb.trialClassV2) |
| Xuất Excel/CSV báo cáo | **Tải file** (download qua route API; nếu cần chọn phạm vi → dialog nhẹ) | leads:view-own / trials:view / enrollments:view-all | route `/api/sale/bao-cao/export` (build lại từ `buildTrialReport` phần data, KHÔNG kéo Recharts) |

  > Ghi chú: trang Báo cáo **thuần đọc** — không có action mutation (đổi trạng thái/duyệt/ghi nhận). Mọi "hành động sâu" đều là điều hướng sang trang nghiệp vụ tương ứng, không nhúng thao tác ghi trong báo cáo.

- **Trạng thái:**
  - **Rỗng:** mỗi tab dùng `EmptyState` (tone slate) — vd "Chưa có lead nào trong khoảng thời gian này", "Chưa có buổi học thử để thống kê", "Không có cảnh báo rời bỏ — tốt!".
  - **Loading:** Suspense boundary quanh mỗi khối KPI/bảng, skeleton `.t-card` (shimmer CSS, không Framer). Filter đổi → RSC re-fetch, giữ khung.
  - **Lỗi:** nếu 1 nguồn số liệu hỏng, bọc `.catch(()=>0/[])` từng khối (theo pattern fan-out badge của portal) để 1 khối lỗi không vỡ cả trang; hiện banner đỏ nhỏ "Không tải được phần này, thử lại".
  - **Không-có-quyền:** layout `/sale` đã gate role; riêng tab con thiếu quyền (vd không có `trials:view`) → ẩn tab đó khỏi thanh Tabs (lọc `.filter` theo `can(user, action)`, menu ≡ cổng, tránh dead-link). Truy cập trực tiếp `?tab=` không có quyền → render `EmptyState`/redirect về tab mặc định.

- **Quyền & phạm vi:**
  - **Gate tab (route):** hiển thị khi user có ÍT NHẤT 1 trong `leads:view-own` / `trials:view` / `enrollments:view-all`. Đăng ký vào `PAGE_GATES` làm nguồn route-gate duy nhất.
  - **Gate từng tab con:** Phễu Lead = `leads:view-own`; Học thử = `trials:view`; Churn = `enrollments:view-all` (+ `parent-requests:manage` cho phần cảnh báo rủi ro nếu có).
  - **Scope:** `leads:view-own` = **OWN** (mỗi Sale chỉ thấy lead `assignedToId = mình` — BGĐ câu 10); `trials:view` & `enrollments:view-all` = **CENTER** nhưng vẫn bị `scopedDb(actor)` ép cách ly cơ sở (CS1 không thấy CS2). SUPER_ADMIN/HO bypass theo scopedDb. Không có scope GLOBAL cho số liệu tài chính (Sale không có `payments:manage`/`commission:view-all`).

- **Ghi chú kỹ thuật:**
  - **Tái dùng:** phần tính toán của `buildTrialReport` (`lib/reports/trial.ts`) cho conversion học thử → đăng ký; `getNearingEndEnrollments` (`lib/students/renewal.ts`) cho "sắp hết khoá"; `groupByWeek` + query `Lead groupBy status/source` (đã dùng ở SalesDashboard) cho phễu. UI churn dựa `StudentRiskAlert` như trang `/admin/canh-bao-rui-ro` nhưng **read-only** (không nút resolve/escalate trong báo cáo).
  - **Build mới:** view report bằng **shadcn + thanh CSS**, KHÔNG bê Recharts từ `/admin/bao-cao/trial` (site Sale cấm Recharts/Magic UI/Framer — ESLint chặn). Nếu cần biểu đồ, dùng thanh tỉ lệ div + số.
  - **Cạm bẫy:**
    - `getNearingEndEnrollments` hiện đọc **db trần** (chỉ lọc `centerId` qua tham số) → **PHẢI bọc `scopedDb(actor)`** trước khi mở cho Sale thuần, nếu không leak liên cơ sở.
    - `centerId = null` trên `Enrollment`/`Attendance` (bug đã gặp nhiều trang) → khi group/scope theo cơ sở phải xử lý null an toàn (coi như ngoài scope, không "rơi" vào cơ sở khác).
    - Báo cáo **không** được suy ra doanh thu/hoa hồng cá nhân — Sale không có `payments:manage`/`commission:view-all`; nếu sau này cần "hoa hồng của tôi" phải thêm permission mới `commission:view-own` + màn riêng (không thuộc tab này).
    - Nhãn trạng thái phải lấy từ label registry VI đã chốt ("Đã học thử", "Chờ quyết định", "Đã đăng ký", "Đã ghi danh"); LEADS_1/2/3 chỉ dùng cho phễu/marketing, KHÔNG hiện làm nhãn trạng thái lead.
    - Không thao tác tiền/enrollment trong báo cáo → không cần transaction; đây là trang đọc thuần, chỉ cần cache RSC hợp lý (revalidate ngắn hoặc `force-dynamic` theo filter).

---

### 23. Gói học / Bảng giá

- **Mục đích:** Cho Tư vấn viên (SALES_CSM) tra cứu nhanh danh mục gói học đang bán (Sata 1–8, Combo 1&2) kèm khoá dạy liên kết và giá niêm yết để tư vấn phụ huynh. Màn hình CHỈ ĐỌC — không tạo/sửa/xoá gói.

- **Loại màn hình:** **Trang riêng** (danh sách bảng giá full-page). Xem chi tiết 1 gói mở bằng **popup (Sheet trượt phải / Dialog)** ngay trên trang, KHÔNG điều hướng sang route mới. (Không dùng trang con `/[id]` để giữ luồng tra cứu liền mạch khi đang tư vấn; nếu sau này cần deep-link chia sẻ thì bổ sung `/sale/goi-hoc/[id]` render cùng nội dung Sheet.)

- **Đường dẫn:** `/sale/goi-hoc` (một route duy nhất; chi tiết gói qua query `?goiId=<id>` mở Sheet, không phải route động).

- **Bố cục & thành phần chính:**
  - `PageHeader` — title "Gói học / Bảng giá", subtitle "Danh mục gói đang bán để tư vấn (chỉ xem)". Vùng `actions` bên phải: nút "Sao chép bảng giá" (copy toàn bảng ra clipboard dạng text tư vấn). KHÔNG có nút "Thêm gói".
  - Hàng `StatCard` (tuỳ chọn, tone `brand`): "Số gói đang bán", "Khoảng giá" (min–max), "Số khoá dạy". Thuần đọc, không phải KPI vận hành.
  - `ListToolbar` — `SearchInput` (tìm theo tên gói / tên khoá) + các `Select` filter: (1) Khoá dạy liên kết (Lập trình Robot / Luyện thi RoboSim), (2) Loại gói (Sata lẻ / Combo), (3) Trạng thái (Đang bán / Ngừng bán). Lọc/tìm client-side trên tập đã fetch.
  - `DataTable` — cột: **Tên gói** · **Khoá dạy liên kết** (Course.name) · **Độ tuổi / lớp** (Course.ageRange) · **Số buổi** (Course.totalSessions) · **Giá gốc** (priceOriginal, gạch ngang nếu có) · **Giá niêm yết** (price, đậm) · **Trạng thái** (`StatusPill`: Đang bán = tone brand/emerald, Ngừng bán = slate). Click cả dòng → mở Sheet chi tiết.
  - `EmptyState` khi không có gói khớp bộ lọc.
  - **Sheet chi tiết gói** (popup): tên gói, mô tả marketing, khoá dạy liên kết + slug, độ tuổi, số buổi/thời lượng, giá gốc → giá niêm yết, ghi chú ưu đãi (nếu gói có), trạng thái. Nút "Sao chép thông tin gói" (clipboard). KHÔNG có nút sửa/xoá.

- **Dữ liệu hiển thị:**
  - `CoursePackage`: `id`, `name`, `price` (giá bán niêm yết), `priceOriginal?`, `description`, `isActive`/`status`, `packageType` (lẻ/combo nếu có), `courseId`.
  - Quan hệ `CoursePackage.course` → `Course`: `name`, `slug`, `price` (giá dạy thực), `ageRange`, `totalSessions`, `isTeachable`.
  - **PII:** Danh mục gói học KHÔNG chứa PII học viên/phụ huynh → **không áp `leads:view-pii`**, không mask. Đây là dữ liệu catalog marketing.
  - **scopedDb:** `CoursePackage` là danh mục bán chung toàn hệ thống (giá niêm yết thống nhất), **không thuộc SCOPED_MODELS** → đọc GLOBAL. Vẫn fetch qua `scopedDb(actor)` để tuân ESLint (chặn `@/lib/db` trần trong `app/**`); scope GLOBAL nghĩa là CS1 và CS2 thấy cùng bảng giá (đúng nghiệp vụ — không có giá riêng theo cơ sở).

- **Thao tác (actions):**

  | Thao tác | Trang / Popup | Quyền cần | Server action tái dùng |
  |---|---|---|---|
  | Xem danh sách + lọc/tìm | Trang (client filter) | `course-packages:view` | — (RSC đọc qua `scopedDb`, lọc client-side) |
  | Xem chi tiết 1 gói | **Popup** (Sheet, `?goiId=`) | `course-packages:view` | — (dữ liệu đã có trong payload trang; không gọi action mới) |
  | Sao chép bảng giá (toàn bảng) | In-place (clipboard) | `course-packages:view` | — (client, không ghi DB) |
  | Sao chép thông tin 1 gói | **Popup** (trong Sheet, clipboard) | `course-packages:view` | — (client) |

  Không có thao tác ghi. Mọi nút thêm/sửa/xoá của admin (`course-packages:edit`) **bị ẩn hoàn toàn** vì SALES_CSM không có quyền đó.

- **Trạng thái:**
  - **Rỗng:** `EmptyState` tone slate — "Chưa có gói học nào đang bán" (khi catalog trống) hoặc "Không tìm thấy gói khớp bộ lọc" (khi filter rỗng, kèm nút xoá lọc).
  - **Loading:** skeleton hàng bảng (RSC + Suspense; tránh `useEffect` fetch). Sheet chi tiết không cần loading riêng vì dùng lại dữ liệu đã fetch.
  - **Lỗi:** banner đỏ "Không tải được bảng giá, thử lại" khi query DB fail; không làm vỡ shell.
  - **Không-có-quyền:** người không có `course-packages:view` bị chặn ở tầng gate layout/PAGE_GATES → mục "Gói học / Bảng giá" không hiện trên sidebar và truy cập thẳng URL bị redirect về trang mặc định của site Sale (menu ≡ cổng, chống dead-link/hở URL).

- **Quyền & phạm vi:**
  - **Permission gate của tab:** `course-packages:view` (SALES_CSM có trong danh sách 28 action). Đặt trong nguồn route-gate dùng chung (PAGE_GATES tương đương) để menu và cổng khớp nhau.
  - **Scope:** **GLOBAL** cho phần đọc (bảng giá chung, không cách ly theo cơ sở). Không cần scope CENTER/OWN vì không có PII và không có giá riêng theo CS. Vẫn đi qua `scopedDb(actor)` theo convention.

- **Ghi chú kỹ thuật:**
  - **Tái dùng:** phần đọc của admin `/admin/course-packages` (query `CoursePackage` + include `course`). Tách helper đọc mới `lib/sale/course-packages.ts` (list + by-id) gọi qua `scopedDb`, để page Sale chỉ gọi 1 helper; KHÔNG import các action ghi `course-packages/_actions` (Sale không có quyền và không cần).
  - **Build mới:** trang `app/(sale)/sale/goi-hoc/page.tsx` (RSC), client component bảng + Sheet chi tiết, dùng lại nguyên `PageHeader/ListToolbar/SearchInput/DataTable/StatCard/StatusPill/EmptyState` clone từ site GV; chỉ đổi từ điển trạng thái `StatusPill` sang domain gói (Đang bán/Ngừng bán). shadcn thuần — KHÔNG Magic UI/Framer/Recharts.
  - **Cạm bẫy giá — QUAN TRỌNG:** `CoursePackage.price` là **giá niêm yết marketing để tư vấn**, KHÔNG phải giá chốt enrollment. Khi chốt deal, Convert v2 đọc `class.course.price` làm `listPrice` (không tin client) và **bỏ ưu đãi** (finalPrice=listPrice, discount=0); voucher/chiết khấu chỉ áp ở bước tạo Order. Vì vậy trang này chỉ để tra cứu — không được suy ra "giá gói = số tiền học viên phải đóng"; nếu cần hiển thị đối chiếu, ghi rõ "giá niêm yết, giá thực tế theo lớp khi ghi danh".
  - **Không ghi DB, không transaction** — thuần read; không dính các bẫy centerId=null / chặn convert / atomic tiền của các tab nghiệp vụ khác.
  - **ESLint boundary:** tuyệt đối không `@/lib/db` trần trong `app/(sale)/**`; đọc qua `scopedDb(actor)` dù scope GLOBAL.

---

### 24. Ưu đãi / Voucher

- **Mục đích:** Cho tư vấn viên tra cứu nhanh danh sách mã khuyến mãi đang hiệu lực để tư vấn phụ huynh và biết mã nào áp được cho loại đơn nào; hoàn toàn **chỉ-xem** — Sale không tạo/sửa/tắt voucher (việc đó thuộc CENTER_MANAGER / MARKETING / ACCOUNTANT). Đây là màn hình "bảng giá ưu đãi" phục vụ bước tạo đơn ở tab Ghi danh & Thanh toán, không phải màn áp mã (mã được áp thực tế ở bước tạo Order).

- **Loại màn hình:** **Trang danh sách + popup thao tác (read-only)**. Trang chính là bảng danh mục voucher toàn cục. Thao tác duy nhất Sale được phép là **Xem chi tiết 1 voucher** → mở dưới dạng **popup/sheet** (không điều hướng sang trang mới) để giữ ngữ cảnh danh sách khi tư vấn. KHÔNG có nút Tạo / Sửa / Bật-Tắt (những nút này chỉ hiện với `vouchers:manage`, mà Sale không có).

- **Đường dẫn:**
  - `/sale/uu-dai` — danh sách voucher.
  - (Không có route con dạng `/sale/uu-dai/[id]` — chi tiết mở bằng popup/sheet trên chính trang danh sách để tránh sinh trang mới cho dữ liệu chỉ-đọc. Nếu sau này cần deep-link chia sẻ, có thể thêm `?voucher=<id>` để mở đúng sheet khi tải trang.)

- **Bố cục & thành phần chính:**
  - `PageHeader` (tái dùng `_components/ui/page-header.tsx`): tiêu đề "Ưu đãi / Voucher", subtitle "Tra cứu mã khuyến mãi để tư vấn khi tạo đơn (chỉ xem)". Vùng `actions` bên phải **để trống** (Sale không tạo được) — hoặc chỉ đặt 1 badge nhỏ đếm "N mã đang hiệu lực".
  - `ListToolbar` (tái dùng `_components/ui/list-toolbar.tsx`): `SearchInput` (tìm theo mã/tên) + các `SelectFilter`:
    - Lọc **Loại đơn** (`type`): Khoá học / Gói combo / Kit Robot / Sensor / Tất cả loại đơn.
    - Lọc **Hiệu lực**: Trong hạn / Chưa bắt đầu / Hết hạn.
    - Lọc **Trạng thái**: Hoạt động / Tắt (mặc định chỉ hiện "Hoạt động" + "Trong hạn" để Sale thấy ngay mã dùng được).
  - Hàng `StatCard` KPI (tái dùng `_components/ui/stat-card.tsx`, tone `brand`) — tuỳ chọn, nhẹ: "Mã đang hiệu lực", "Sắp hết hạn (≤7 ngày)". Không đưa KPI tài chính (không thuộc phạm vi Sale).
  - `DataTable` (tái dùng `_components/ui/data-table.tsx`) các cột: **Mã** (`code`, font mono) · **Tên** (`name`) · **Loại đơn** (`VOUCHER_TYPE_LABEL[type]` qua `StatusPill`/badge) · **Giảm** (hiển thị suy ra: `PERCENT` → `"20%, max 500.000đ"`; `FIXED` → `"200.000đ"`) · **Điều kiện** (`minOrderValue` → "Đơn tối thiểu 2.000.000đ", `usageLimitPerUser` → "1 lần/khách") · **Đã dùng** (`usedCount / quantity` hoặc `/ ∞`) · **Hiệu lực** (`validFrom → validUntil` + pill Trong hạn/Chưa bắt đầu/Hết hạn) · **Trạng thái** (`isActive`). Cột "Thao tác" chỉ có nút **Xem** (mở sheet). KHÔNG có cột Sửa/Tắt.
  - `StatusPill` (tái dùng): cần bổ sung từ điển trạng thái hiệu lực cho domain Sale (`Trong hạn`=emerald, `Chưa bắt đầu`=amber, `Hết hạn`=red, `Tắt`=slate) — tái dùng cơ chế map mã→nhãn của `status-pill.tsx`, chỉ thêm key.
  - **Sheet/Popup chi tiết voucher (read-only):** hiển thị đầy đủ `description`, công thức giảm, `minOrderValue`, `usageLimitPerUser`, `quantity/usedCount` (còn lại bao nhiêu lượt), khoảng hiệu lực, và **gợi ý áp dụng**: "Áp cho đơn loại X ở bước tạo đơn" + nút phụ (tùy chọn) "Sao chép mã" để Sale dán vào ô voucher khi tạo đơn.

- **Dữ liệu hiển thị:** model **`Voucher`** — các field: `code`, `name`, `description`, `type` (enum `VoucherType`: COURSE/PACKAGE/KIT_ROBOT/SENSOR/ALL), `discountKind` (enum `VoucherDiscountKind`: PERCENT/FIXED), `discountPercent`, `discountAmount`, `maxDiscount`, `minOrderValue`, `quantity`, `usedCount`, `usageLimitPerUser`, `validFrom`, `validUntil`, `isActive`. **Không có trường PII** trong Voucher (mã khuyến mãi là danh mục bán hàng công khai nội bộ) → không cần `leads:view-pii`/mask. **KHÔNG hiển thị** danh sách `VoucherRedemption` (chứa `customerPhone` — PII khách) và `VoucherAuditLog` (nhật ký người sửa) cho Sale; chỉ dùng `usedCount` tổng hợp để biết còn lượt.

- **Thao tác (actions):**

| Thao tác | Trang / Popup | Quyền cần | Server action tái dùng |
|---|---|---|---|
| Xem danh sách voucher | Trang (`/sale/uu-dai`) | `vouchers:view` | RSC đọc `sdb.voucher.findMany` (như `admin/vouchers/page.tsx`) |
| Lọc / tìm kiếm | Trên trang (client, không điều hướng) | `vouchers:view` | — (client filter / searchParams) |
| Xem chi tiết 1 voucher | **Popup/Sheet** (không mở trang mới) | `vouchers:view` | RSC/`select` hẹp trên `Voucher` theo `id` (không kèm redemptions) |
| Sao chép mã (clipboard) | Trong popup | `vouchers:view` | — (client only) |
| ~~Tạo / Sửa / Bật-Tắt voucher~~ | **Không có trên site Sale** | `vouchers:manage` (Sale KHÔNG có) | — (ẩn hoàn toàn) |

Ghi rõ: chỉ **Xem chi tiết** mở dạng **popup/sheet**; **không** thao tác nào mở trang mới; mọi nút quản trị (`Tạo voucher`, `Sửa`, `Tắt/Bật`) đều bị ẩn vì thiếu `vouchers:manage`.

- **Trạng thái:**
  - **Rỗng:** `EmptyState` (icon `Ticket`, tone slate) — "Chưa có mã khuyến mãi nào" (khi catalog trống) hoặc "Không có mã khớp bộ lọc" (khi lọc ra rỗng) kèm nút "Xoá bộ lọc".
  - **Loading:** skeleton rows trong `DataTable` (Suspense ở RSC hoặc `loading.tsx` của route).
  - **Lỗi:** khối lỗi thân thiện "Không tải được danh sách ưu đãi, thử lại" + nút reload; server trả `{ ok:false, error:{ code, message(VI) } }` theo API contract.
  - **Không-có-quyền:** layout/gate 3 tầng của site Sale + gate trang `checkPermission("vouchers:view")` → nếu thiếu quyền `redirect` về dashboard Sale (giống `admin/vouchers/page.tsx` redirect `/dashboard?error=unauthorized`). Mục nav "Ưu đãi / Voucher" cũng bị `.filter` ẩn khỏi sidebar khi không có `vouchers:view` (menu ≡ cổng, chống dead-link).

- **Quyền & phạm vi:**
  - Permission gate tab: **`vouchers:view`** (SALES_CSM có; danh sách quyền: SUPER_ADMIN, CENTER_MANAGER, SALES_CSM, MARKETING, ACCOUNTANT).
  - Không expose `vouchers:manage` (chỉ SUPER_ADMIN/CENTER_MANAGER/MARKETING/ACCOUNTANT) trên site Sale.
  - **Scope: GLOBAL.** Voucher là **catalog toàn cục, KHÔNG thuộc `SCOPED_MODELS`** → `scopedDb(actor).voucher` là pass-through, không lọc theo `centerId`. Nghĩa là CS1 và CS2 thấy **cùng một danh mục voucher** — đây là hành vi đúng (mã khuyến mãi áp toàn hệ thống), không phải lỗ hổng cách ly cơ sở. Vẫn đọc **qua `scopedDb(actor)`** (không `@/lib/db` trần) để tuân ESLint boundary và giữ đồng nhất pattern.

- **Ghi chú kỹ thuật:**
  - **Tái dùng gần như nguyên khối** từ admin: `app/(admin)/admin/vouchers/page.tsx` (query `sdb.voucher.findMany` + `select` hẹp) và `_components/vouchers-table.tsx` (hàm `discountDisplay`, `ValidityBadge`, bố cục cột). Bê logic hiển thị sang UI kit site Sale, **bỏ** nhánh `canManage` (nút Tạo/Sửa/Tắt), **bỏ** `Dialog` xác nhận toggle và import `toggleVoucherActiveAction`. Tái dùng `VOUCHER_TYPE_LABEL` + `VOUCHER_DISCOUNT_KIND_LABEL` từ `@/lib/validators/voucher`.
  - **Không build server action mới** cho phần đọc — chỉ RSC + `select` hẹp; không cần mutation nào.
  - **Điểm build mới:** vỏ UI theo tone site Sale (StatCard/ListToolbar/DataTable của `_components/ui`), sheet chi tiết read-only, thêm key trạng thái hiệu lực vào `StatusPill`, nút "Sao chép mã".
  - **Cạm bẫy:**
    - `discountKind` là **`FIXED`** (không phải "AMOUNT" như một số tài liệu cũ ghi) — dùng đúng enum khi map nhãn/hiển thị.
    - **KHÔNG** kéo `VoucherRedemption` (có `customerPhone` = PII khách) hay `VoucherAuditLog` vào payload RSC của site Sale — chỉ dùng `usedCount` tổng hợp; tránh leak PII và tránh `findUnique`/`include` rộng.
    - Voucher **không scoped** → đừng "sửa" bằng cách ép `centerId` filter; đây là danh mục toàn cục theo thiết kế (khác hẳn Lead/Order/Enrollment).
    - Đây **không phải** nơi áp/giảm giá thật: việc tính lại chiết khấu + tạo `VoucherRedemption` + `usedCount++` chạy **atomic trong transaction** tại bước tạo Order (`createOrderManualAction` + `validateAndComputeDiscount`, race-guard `VOUCHER_QUANTITY_EXCEEDED_RACE`). Tab này chỉ **tra cứu** — không được nhân bản logic tính tiền; nếu có nút "Áp mã" thì chỉ điều hướng/điền sẵn mã sang màn tạo đơn, không tự trừ tiền.
    - Nhớ `dynamic = "force-dynamic"` + `metadata.robots` noindex như các trang site Sale khác; hiển thị tiền `toLocaleString("vi-VN")` để đồng nhất định dạng.

---

### 25. Sản phẩm & Học cụ

**Mục đích:** Cho tư vấn viên (SALES_CSM) TRA CỨU nhanh danh mục học cụ (kit robot) và sản phẩm bán/cho thuê — tên, mã, giá bán, giá thuê, mô tả, hình ảnh, khoá/gói liên quan — để tư vấn phụ huynh và gợi ý "loại đơn dự kiến" cho lead. Chỉ XEM, không tạo/sửa, không đụng tồn kho.

**Loại màn hình:** **Trang riêng** (read-only), chia **2 tab con** trong cùng trang: `Học cụ (Kit)` và `Sản phẩm bán/thuê`. Mỗi tab là một bảng tra cứu. Xem chi tiết 1 mục mở **popup dạng Sheet trượt phải** (slide-over) — KHÔNG chuyển trang (giữ ngữ cảnh danh sách khi đang gọi điện). Không có form thao tác nào (vì read-only), nên không có dialog xác nhận. Deep-link `/sale/san-pham/[id]` là TÙY CHỌN (nếu cần chia sẻ link 1 sản phẩm); mặc định không cần route động.

**Đường dẫn:** `/sale/san-pham` (mặc định mở tab `Học cụ (Kit)`); `?tab=san-pham` cho tab sản phẩm; `?q=&type=&category=` giữ trạng thái lọc trên URL. (Tùy chọn: `/sale/san-pham/[id]` deep-link chi tiết.)

**Bố cục & thành phần chính:** (tái dùng UI kit clone từ site GV, đổi `.teacher-root`→`.sale-root`)
- `PageHeader` — title "Sản phẩm & Học cụ", subtitle "Tra cứu để tư vấn (chỉ xem)". Vùng `actions` bên phải: KHÔNG có nút tạo (read-only); có thể để 1 chip ghi chú "Giá tham khảo — chốt giá ở bước Tạo đơn".
- Hàng `StatCard` gọn (tone `brand`): "Học cụ đang bán" (đếm Kit active), "Sản phẩm bán/thuê" (đếm Product active). Chỉ đếm số dòng — KHÔNG hiển thị KPI tài chính/tồn kho.
- Tab con (2): `Học cụ (Kit)` | `Sản phẩm bán/thuê` — suy từ `?tab` (stateless), mỗi tab có toolbar + bảng riêng.
- `ListToolbar` = `SearchInput` (tìm theo tên/mã) + `Select` filter:
  - Tab Kit: lọc theo `Khoá/chương trình áp dụng` (courseId), `Trạng thái` (Đang bán / Ngừng).
  - Tab Sản phẩm: lọc theo `Loại` (Bán / Cho thuê / Cả hai), `Nhóm sản phẩm` (category), `Trạng thái`.
- `DataTable<T>` (bọc `.t-card`, cuộn ngang mobile):
  - **Bảng Kit** cột: Ảnh (thumbnail nhỏ) · Tên kit · Mã · Khoá/gói áp dụng · Giá tham khảo · Trạng thái (`StatusPill`) · (hàng bấm được → mở Sheet).
  - **Bảng Sản phẩm** cột: Ảnh · Tên · Mã/SKU · Nhóm · Loại (Bán/Thuê — `StatusPill` semantic) · Giá bán · Giá thuê/kỳ · Trạng thái.
- `Sheet` chi tiết (mở khi bấm dòng): ảnh lớn, mô tả, thành phần kit / thông số, bảng giá (bán + thuê nếu có), khoá/gói liên quan (link sang tab Gói học nếu có quyền), nút phụ "Sao chép thông tin tư vấn".
- `EmptyState` khi danh sách rỗng / lọc không ra kết quả.

**Dữ liệu hiển thị:** (model Prisma — xác nhận field theo `schema.prisma` khi build)
- **Kit**: `id, name, code, description, imageUrl, price (giá tham khảo), courseId/course.name (khoá áp dụng), components/notes, isActive`. (Nếu Kit gắn qua CoursePackage thì hiển thị tên gói.)
- **Product**: `id, name, sku/code, category, type (SELL/RENT/BOTH), price (giá bán), rentPrice + rentUnit (giá thuê/kỳ), imageUrl, description, isActive`.
- **KHÔNG hiển thị**: số lượng tồn kho (`stock/quantity`), giá vốn, nhà cung cấp, dữ liệu nhập kho — Sale KHÔNG có `inventory:view`. Nếu cần tín hiệu còn/hết, chỉ suy ra nhãn availability "Còn hàng / Tạm hết" ở SERVER (boolean, không lộ số lượng), KHÔNG đẩy con số tồn kho ra payload RSC.
- **PII**: danh mục này KHÔNG chứa PII phụ huynh/học sinh → không cần mask; nhưng vẫn đọc qua `scopedDb(actor)` để giữ đồng nhất kiến trúc và lọc theo phạm vi cơ sở nếu catalog có `centerId`.

**Thao tác (actions):**

| Thao tác | Trang / Popup | Quyền cần | Server action tái dùng |
|---|---|---|---|
| Tìm kiếm + lọc (tên/mã, loại, nhóm, khoá, trạng thái) | Inline toolbar (không popup, không đổi trang; cập nhật `?q/type/category`) | `products:view` / `kits:view` | — (RSC đọc lại qua `scopedDb`, không cần action) |
| Đổi tab Kit ↔ Sản phẩm | Inline (stateless từ `?tab`) | như trên | — |
| Xem chi tiết 1 mục | **Popup** (Sheet trượt phải) — không chuyển trang | `products:view` / `kits:view` | — (dữ liệu đã có trong payload danh sách; hoặc fetch nhẹ theo id) |
| Sao chép "thông tin tư vấn" (tên + mã + giá) | Inline trong Sheet (clipboard, không popup mới) | như trên | — (client copy) |
| Xem khoá/gói liên quan | **Trang** — link sang tab Gói học `/sale/goi-hoc` (nếu có) | `course-packages:view` | — (điều hướng) |
| Deep-link chi tiết (tùy chọn) | **Trang** `/sale/san-pham/[id]` (nếu bật) | `products:view`/`kits:view` | — (RSC) |

> Toàn bộ là READ-ONLY: KHÔNG có tạo/sửa/xoá, KHÔNG có nút áp dụng vào đơn tại đây (áp sản phẩm vào đơn nằm ở luồng Tạo đơn `/orders/new`, thuộc tab khác). Vì vậy không có popup xác nhận/mutation nào trên tab này.

**Trạng thái:**
- **Rỗng (empty-state):** chưa có kit/sản phẩm active → `EmptyState` tone `slate`, icon hộp, "Chưa có học cụ/sản phẩm nào để tra cứu."
- **Lọc không ra kết quả:** `EmptyState` "Không tìm thấy — thử bỏ bớt bộ lọc" + nút xoá lọc (reset `?q/type/category`).
- **Loading:** skeleton rows trong `DataTable` (RSC + Suspense theo tab); Sheet chi tiết có skeleton nếu fetch lazy.
- **Lỗi:** banner đỏ "Không tải được danh mục — thử lại"; lỗi 1 tab không làm hỏng tab kia (fan-out `.catch` như pattern portal).
- **Không-có-quyền:** nếu account thiếu cả `products:view` lẫn `kits:view` → tab bị PAGE_GATES chặn, không render trong sidebar (menu ≡ cổng); truy cập thẳng URL → redirect về trang mặc định site Sale. Nếu chỉ có 1 trong 2 quyền → ẩn tab con tương ứng, chỉ hiện tab được phép.

**Quyền & phạm vi:** Gate trang = `kits:view` OR `products:view` (có ≥1 mới hiện tab; mỗi tab con gate riêng theo quyền tương ứng). SALES_CSM có cả hai trong ma trận v1 (`lib/auth/permissions.ts`) và bản parity v2 `CENTER_SALES_CSM`. **Scope:** danh mục sản phẩm/kit thường là **catalog dùng chung** → nếu model KHÔNG có `centerId` thì scope hiệu dụng là **GLOBAL** (mọi cơ sở xem cùng bảng giá). Nếu catalog CÓ gắn cơ sở (giá/khả dụng theo CS) thì scope **CENTER** và `scopedDb(actor)` tự lọc CS1↔CS2. Chốt điều này theo schema trước khi build (ảnh hưởng scopeType khai trong seed-roles v2).

**Ghi chú kỹ thuật:**
- **Tái dùng:** đọc catalog qua `scopedDb(actor)` (KHÔNG import `@/lib/db` trần — ESLint chặn trong `app/**`). Query đọc thuần, không cần server action mutation. Tái dùng nguyên 8 UI primitive clone từ `_components/ui/` (DataTable/ListToolbar/SearchInput/PageHeader/StatCard/StatusPill/EmptyState) — chỉ cần map từ điển `StatusPill` sang domain sản phẩm (Đang bán / Ngừng / Còn hàng / Tạm hết / Bán / Cho thuê).
- **Build mới:** 1 trang RSC `app/(sale)/sale/san-pham/page.tsx` + helper đọc `lib/sale/catalog.ts` (gom `getKitsForSale` / `getProductsForSale` chỉ select field an-toàn, loại `stock`/giá vốn ở tầng query). Sheet chi tiết là client component nhẹ. Không cần migration (chỉ đọc model có sẵn).
- **Cạm bẫy:**
  - **Rò tồn kho/giá vốn:** Product model có `stock`, có thể có cost/supplier — PHẢI `select` field trắng ở helper, tuyệt đối không `findMany()` trần rồi lọc ở UI (dữ liệu vẫn nằm trong payload RSC = rò). Ẩn ở UI là chưa đủ, chặn ở SERVER.
  - **Giá "tham khảo" vs giá chốt:** giá hiển thị ở đây chỉ để tư vấn; giá thực khi tạo đơn đọc lại từ DB ở `createOrderManualAction` (không tin client). Ghi rõ nhãn "giá tham khảo" để Sale không cam kết sai giá; voucher/chiết khấu KHÔNG áp ở tab này (áp ở bước Tạo đơn).
  - **Scope catalog:** đừng hardcode "HO + CS2"; nếu sau này giá theo cơ sở, đi qua `scopedDb`/OrgUnit chứ không branch theo tên cơ sở.
  - **Không đây nhầm sang tab khác:** tab này CHỈ tra cứu; nút "áp vào lead/đơn" thuộc Chi tiết Lead (`updateLeadOrderKind` set `expectedProductId`) và Tạo đơn — không nhân bản logic đó vào đây.
  - **Không dùng Recharts/Magic UI** (site Sale = shadcn thuần theo convention), dù có `StatCard` — chỉ đếm số, không vẽ chart.

---

### 26. Lớp học (tham chiếu)

- **Mục đích:** Cho tư vấn viên (SALES_CSM) tra cứu nhanh toàn bộ lớp trong cơ sở của mình — sĩ số còn trống, khoá/giáo viên/lịch học — để tư vấn phụ huynh và gợi ý xếp chỗ khi chốt đơn. Đây là màn **chỉ đọc** (`classes:view-all`), KHÔNG tạo/sửa/xoá lớp.

- **Loại màn hình:** **Trang riêng** (danh sách full page) + **popup (Sheet/Dialog) xem chi tiết lớp**. Danh sách lớp là RSC full page tại `/sale/lop-hoc`; bấm 1 dòng mở **Sheet chi tiết read-only** (sĩ số/roster rút gọn + lịch buổi + GV) — KHÔNG điều hướng sang trang khác cho thao tác xem. Chỉ các hành động "rời ngữ cảnh" (Ghi danh HV vào lớp này) mới **mở trang mới** sang luồng ghi danh. Lý do dùng Sheet cho chi tiết: Sale tra cứu nhanh, không cần rời danh sách; nếu sau này cần deep-link/chia sẻ URL lớp thì nâng cấp thành route con `/sale/lop-hoc/[id]`.

- **Đường dẫn:** `/sale/lop-hoc` (danh sách). Chi tiết mặc định qua Sheet (query `?classId=` để mở lại state khi refresh). Tuỳ chọn nâng cấp về sau: route con `/sale/lop-hoc/[id]` (trang riêng) nếu cần deep-link.

- **Bố cục & thành phần chính** (tái dùng UI kit site GV nhân bản sang `.sale-root`):
  - `PageHeader` — tiêu đề "Lớp học (tham chiếu)" + subtitle "Danh sách lớp trong cơ sở — chỉ để tra cứu, không chỉnh sửa". Vùng `actions` bên phải chỉ chứa nhãn cơ sở đang xem (static, không nút tạo lớp).
  - Hàng `StatCard` (KPI, tone `brand` = tím cho Sale): *Tổng số lớp đang mở* · *Lớp còn chỗ trống* · *Lớp sắp khai giảng* · *Lớp đã đầy*. Chỉ đọc, phục vụ tư vấn "còn slot không".
  - `ListToolbar` — `SearchInput` (tìm theo tên lớp / mã lớp / tên khoá) + các `Select` filter: **Khoá học** (Course), **Trạng thái lớp** (PLANNED/OPEN/RUNNING/COMPLETED/CANCELLED), **Còn chỗ / Đã đầy**, **Giáo viên**. Không có filter "Cơ sở" vì `scopedDb` đã khoá về cơ sở của Sale (trừ role đa cơ sở → xem "Quyền & phạm vi").
  - `DataTable<ClassRow>` — cột: **Tên lớp** (kèm mã lớp) · **Khoá** (Course.name) · **Giáo viên** · **Lịch học** (thứ + khung giờ) · **Phòng** · **Sĩ số** (used/capacity, badge "còn N chỗ" / "Đã đầy") · **Trạng thái** (`StatusPill`/pill riêng cho ClassStatus) · **Khai giảng** (startDate). Bảng bọc `.t-card`, cuộn ngang mobile. **Không có cột hành động sửa/xoá.**
  - **Sheet chi tiết lớp** (mở khi click dòng): header tên lớp + `StatusPill`; block thông tin (khoá, GV, phòng, lịch, số buổi, khai giảng/dự kiến kết thúc); thanh sĩ số used/capacity; danh sách buổi (dùng `SessionStatusPill`); roster **rút gọn** (chỉ tên HV + trạng thái ghi danh, KHÔNG SĐT/PII phụ huynh). Footer Sheet có 1 CTA điều hướng: "Ghi danh học viên vào lớp này" (mở trang ghi danh).
  - `EmptyState` khi không có lớp khớp filter.

- **Dữ liệu hiển thị** (model Prisma `Class`, đọc qua `scopedDb(actor)`):
  - `Class`: `id`, `name`, `code`, `status` (ClassStatus), `capacity`, `startDate`, `schedule`/`scheduleJson` (thứ + khung giờ), `centerId`.
  - Quan hệ: `course { name, totalSessions, price }` (giá chỉ để tham khảo tư vấn, không phải màn tiền), `teacher { name }` (User — **chỉ tên**, không SĐT/email GV), `room { name }`, `_count.enrollments` để tính sĩ số used.
  - Roster trong Sheet: `Enrollment → Student { name, ... }` + trạng thái ghi danh — **chỉ tên học viên**; **KHÔNG** hiển thị SĐT/tên/email phụ huynh (không thuộc phạm vi tra cứu lớp; PII phụ huynh chỉ ở màn Lead/CSKH có `leads:view-pii`).
  - Tất cả đã lọc `deletedAt: null` và tự cách ly `centerId` qua `scopedDb`.

- **Thao tác (actions):**

| Thao tác | Trang / Popup | Quyền cần | Server action tái dùng |
|---|---|---|---|
| Xem danh sách lớp (lọc/tìm/sắp xếp) | **Trang** (`/sale/lop-hoc`, RSC) | `classes:view-all` | Không có action ghi — RSC đọc trực tiếp `scopedDb.class.findMany` (bê logic đọc từ `/admin/classes`) |
| Xem chi tiết 1 lớp (thông tin + buổi + roster rút gọn) | **Popup — Sheet** (không rời trang; `?classId=`) | `classes:view-all` | RSC/loader đọc `scopedDb.class.findUnique` + `passesScope('Class')` chống IDOR liên cơ sở |
| Ghi danh HV vào lớp này (nếu đủ điều kiện) | **Trang mới** (điều hướng sang `/sale/ghi-danh?classId=…`) | `enrollments:create` | `enrollStudent` (đã có, Serializable tx re-check sĩ số CLASS_FULL) — KHÔNG viết lại |
| Chốt lead vào lớp này (từ ngữ cảnh lead) | **Trang mới** (sang luồng convert của lead) | `students:create` + `enrollments:create` | `submitConvertV2` (không nhân bản logic) |

> Ghi chú: 2 thao tác cuối chỉ là **link điều hướng** ra khỏi tab tham chiếu; bản thân tab `/sale/lop-hoc` KHÔNG chứa mutation nào. Nút ghi danh/chốt **ẩn** nếu actor thiếu `enrollments:create` (Sale thuần có, nhưng vẫn gate để đúng menu≡cổng).

- **Trạng thái:**
  - **Rỗng:** `EmptyState` tone `slate` — "Chưa có lớp nào trong cơ sở khớp bộ lọc" + gợi ý bỏ filter. Trường hợp cơ sở thật chưa có lớp: "Cơ sở chưa mở lớp nào".
  - **Loading:** skeleton bảng (RSC + Suspense; filter đổi qua `searchParams` → server re-render). Sheet chi tiết có skeleton riêng khi tải roster/buổi.
  - **Lỗi:** banner đỏ "Không tải được danh sách lớp, thử lại" (giữ layout, không vỡ trang — pattern `.catch` như badge portal). Sheet lỗi → toast `sonner` + đóng.
  - **Không có quyền:** nếu actor thiếu `classes:view-all` → layout gate `/sale` redirect về trang mặc định của họ; mục nav bị `.filter` ẩn khỏi sidebar (menu≡cổng, chống dead-link).

- **Quyền & phạm vi:**
  - **Gate tab:** `classes:view-all` (SALES_CSM có sẵn theo ma trận v1 / role `CENTER_SALES_CSM` v2, scope **CENTER**). Đưa vào `PAGE_GATES` làm nguồn route-gate duy nhất, và điều kiện `.filter` hiển thị mục nav "Lớp học" trong sidebar Sale.
  - **Scope:** cách ly cơ sở **KHÔNG** do role mà do `scopedDb(actor)` ép ở tầng query — CS1 không thấy lớp CS2 (test CI bắt buộc). SALES_CSM 1 cơ sở → chỉ lớp cơ sở mình; role đa cơ sở (CENTER_MANAGER/HO nếu được cho vào site) → thấy theo tầm nhìn cơ sở, khi đó thêm lại filter "Cơ sở". Đây là **read-only** — không có ALLOW mutation nào trên `Class` cho Sale (`classes:create/edit/delete` Sale KHÔNG có).

- **Ghi chú kỹ thuật:**
  - **Tái dùng:** bê nguyên logic đọc từ `/admin/classes` (query `scopedDb.class.findMany` + include `course/teacher/room/_count.enrollments`), chỉ thay vỏ UI bằng `DataTable`/`ListToolbar`/`PageHeader`/`StatCard` của kit GV clone. Điều hướng ghi danh/chốt gọi lại `enrollStudent` / `submitConvertV2` — **không** viết service mới.
  - **Build mới:** `_components/ui/class-status-pill` (map ClassStatus PLANNED/OPEN/RUNNING/COMPLETED/CANCELLED → nhãn VI + màu; tách khỏi `SessionStatusPill` vì domain khác); Sheet chi tiết lớp read-only.
  - **Cạm bẫy:**
    - **`centerId=null` trên Enrollment** (bug gặp nhiều trang) → khi tính sĩ số used qua `_count.enrollments` hoặc join roster, lọc chắc `centerId` và không để enrollment mồ côi cơ sở lọt/đội sĩ số sai; ưu tiên đếm theo quan hệ `class → enrollments` (thuộc lớp) hơn là filter centerId trên enrollment.
    - **KHÔNG import `@/lib/db` trần** trong `app/(sale)/**` — ESLint chặn; mọi đọc qua `scopedDb(actor)` + `passesScope('Class')` ở loader chi tiết chống IDOR liên cơ sở.
    - **KHÔNG lộ PII phụ huynh** trong roster (chỉ tên HV); giá khoá chỉ hiển thị tham khảo, đây không phải màn tiền → không gọi service tài chính.
    - **Read-only tuyệt đối:** ẩn hẳn mọi nút sửa/xoá/gán GV (không chỉ disable) để đúng phạm vi `classes:view-all`.
    - Gate bằng **v1 `can()`** cho tới khi flip `RBAC_V2_ENABLED` (#09) để tránh lệch shadow; parity v1↔v2 đã khoá bằng `rbac-parity.test.ts`.

---

### 27. Hồ sơ cá nhân

**Mục đích:** Cho tư vấn viên (SALES_CSM) tự xem và cập nhật hồ sơ nhân sự của CHÍNH mình (ảnh đại diện, liên hệ, thông tin cá nhân cơ bản), đổi mật khẩu và đăng xuất. Đây là "trang tài khoản" của người dùng site Sale — chỉ thao tác trên bản ghi Employee/User của bản thân, không đụng dữ liệu người khác.

**Loại màn hình:** **Trang riêng** (standalone), là đích đến của mục "Hồ sơ cá nhân" trong dropdown `UserMenu` ở topbar. Trang chủ yếu ở chế độ ĐỌC; các thao tác ghi mở **popup (Sheet/Dialog)** phủ lên trang, KHÔNG chuyển trang:
- Sửa hồ sơ cơ bản → **Popup** (Sheet trượt phải).
- Đổi ảnh đại diện → **Popup** (Dialog upload nhỏ) — hoặc gộp trong Sheet sửa hồ sơ.
- Đổi mật khẩu → **Popup** (Dialog).
- Đổi giao diện Sáng/Tối/Hệ thống → **không phải action của trang** — dùng `ThemeToggle` sẵn ở topbar (ghi localStorage `sale-theme`).
- Đăng xuất → **không phải action của trang** — nằm trong dropdown `UserMenu` ở topbar (`logoutToGate()` từ `@/lib/auth/logout-client` → cổng login chung; KHÔNG dùng `signOut({ callbackUrl: '/login' })` vì path tương đối kẹt lại subdomain). Trang này chỉ là điểm đến "Hồ sơ cá nhân" của cùng dropdown đó.

**Đường dẫn:** `/sale/ho-so` (một route, không có route con). Các thao tác ghi dùng popup nên KHÔNG cần `/sale/ho-so/sua` hay `/sale/ho-so/[id]` — hồ sơ luôn là của actor đang đăng nhập, không nhận id trên URL (chống lộ danh tính/IDOR).

**Bố cục & thành phần chính:** (tái dùng nguyên bộ UI kit clone từ site GV — `.sale-root`)
- `PageHeader` — title "Hồ sơ cá nhân", subtitle họ tên + chức danh, vùng `actions` bên phải chứa nút **"Chỉnh sửa"** (mở Sheet) và **"Đổi mật khẩu"** (mở Dialog).
- Khối đầu trang: avatar (ảnh `avatarUrl` hoặc initials fallback như `UserMenu`) + họ tên + `StatusPill` trạng thái làm việc (ĐANG LÀM VIỆC / TẠM NGHỈ…) + chức danh + `StatCard`/badge phụ (mã nhân viên, cơ sở công tác).
- Card "Thông tin cơ bản" (`.t-card`): họ tên, mã nhân viên, chức danh, phòng/bộ phận, ngày vào làm — read-only.
- Card "Liên hệ": SĐT, email công việc, email đăng nhập, địa chỉ — một phần cho sửa (xem bảng thao tác).
- Card "Thông tin cá nhân": ngày sinh, giới tính, liên hệ khẩn cấp — hiển thị/che theo field-visibility.
- Card "Tài khoản & phân quyền" (read-only): email đăng nhập (`User.email`), danh sách vai trò (chip, ví dụ "Tư vấn & CSKH cơ sở"), cơ sở đang công tác (từ `UserOrgRole`/`EmployeeOrgAssignment`) — chỉ xem, sale KHÔNG tự đổi vai trò/cơ sở.
- KHÔNG dùng `DataTable`/`ListToolbar` (đây không phải trang danh sách). `EmptyState` chỉ dùng cho nhánh lỗi tải hồ sơ.

**Dữ liệu hiển thị:** (đọc qua `scopedDb(actor)`, luôn theo `actor.userId` của phiên — không nhận id ngoài)
- `Employee` của actor: `fullName`, `employeeCode`, `jobTitle`, `department`, `avatarUrl`, `phone`, `email`, `address`, `dateOfBirth`, `status`, `startDate`, `centerId`/`orgUnitId`.
- `User`: `email` (email đăng nhập), `roles[]` (hiển thị nhãn VN, read-only), `status`.
- `UserOrgRole` / `EmployeeOrgAssignment`: cơ sở + vai trò theo cơ sở (read-only, để hiện "công tác tại CS1").
- **PII / field-visibility:** đây là hồ sơ CHÍNH CHỦ nên áp `getEmployeeFieldVisibility` với ngoại lệ self. Nhóm `basic` + `contact` + `personal` của chính mình → hiển thị. Nhóm `salary` (lương/hệ số) → SALES_CSM KHÔNG có quyền `salary` ⇒ **ĐÃ CHỐT: che ngay cả trên hồ sơ của chính mình** (không có ngoại lệ self; cần xem lương thì qua kênh HR/admin). KHÔNG hiển thị dữ liệu nhân viên khác trong bất kỳ trường hợp nào.

**Thao tác (actions):**

| Thao tác | Trang / Popup | Quyền cần | Server action tái dùng |
|---|---|---|---|
| Xem hồ sơ của mình | Trang (chính nó) | Đăng nhập hợp lệ (self) | RSC đọc `scopedDb(actor).employee.findFirst({ where: { userId: actor.userId } })` |
| Chỉnh sửa hồ sơ cơ bản (SĐT, địa chỉ, ngày sinh, liên hệ khẩn cấp, avatar) | **Popup** (Sheet) | self — `employees:edit-self` (mới) HOẶC nhánh self trong action hiện có; KHÔNG dùng `employees:edit` chung | Cần `updateOwnProfileAction` (build mới, self-scoped) — KHÔNG tái dùng `updateEmployeeAction` của admin (cho sửa người khác) |
| Đổi ảnh đại diện | **Popup** (Dialog upload) | self | `ImageUploader` + upload-config (R2) đã có; ghi `avatarUrl` qua `updateOwnProfileAction` |
| Đổi mật khẩu | **Popup** (Dialog) | self (xác thực mật khẩu cũ) | `changePasswordAction` (Auth.js/credentials) — tái dùng nếu đã có ở cổng login; nếu chưa, build self-scoped |
| Đổi giao diện Sáng/Tối | Không phải action trang — **dropdown** ở topbar | — | `ThemeToggle` (localStorage `sale-theme`, không server action) |
| Đăng xuất | Không phải action trang — **dropdown** `UserMenu` ở topbar | self | `logoutToGate()` (`@/lib/auth/logout-client`) → cổng login chung satarobo.vn/login |

> Ghi chú phân loại: mọi thao tác GHI của trang này đều là **Popup** (không rời trang), giữ ngữ cảnh xem hồ sơ. Hai thao tác cấp phiên (đổi theme, đăng xuất) sống ở topbar dùng chung của shell, không nhân bản trong thân trang.

**Trạng thái:**
- **Rỗng / thiếu hồ sơ:** actor có `User` nhưng chưa gắn `Employee` → `EmptyState` (tone slate): "Chưa có hồ sơ nhân sự — liên hệ HR/Quản lý cơ sở để bổ sung", ẩn nút Chỉnh sửa (không có gì để sửa).
- **Loading:** trang là RSC (`force-dynamic`) nên render thẳng; popup Sheet/Dialog dùng skeleton nhẹ + nút Lưu ở trạng thái `useTransition` pending (disable + spinner). Không dùng `useEffect` fetch.
- **Lỗi:** lỗi tải hồ sơ → banner đỏ + nút thử lại; lỗi submit popup → `toast.error` (sonner có sẵn trong shell) với message VI từ `{ ok:false, error }`.
- **Không-có-quyền:** không xảy ra ở cấp "xem" (self luôn xem được của mình). Nếu cố sửa trường ngoài phạm vi self (vai trò/cơ sở/lương) → server chặn, `toast.error` "Không có quyền chỉnh sửa mục này"; các trường đó render read-only ngay từ UI.

**Quyền & phạm vi:**
- **Gate tab:** chỉ cần phiên đăng nhập hợp lệ đã qua 3 tầng gate của layout `(sale)` (auth → `isSaleSiteEnabled` → role `SALES_CSM`) + liveness `scopedDb(actor)` (isActive/deletedAt/tokenVersion). Không cần permission riêng để XEM hồ sơ của chính mình.
- **Scope:** **OWN** — action đọc/ghi ràng bởi `where: { userId: actor.userId }`, không nhận `id`/`centerId` từ client. `scopedDb(actor)` vẫn bọc mọi query (cách ly cơ sở là mặc định), nhưng ràng buộc quyết định ở đây là "chính chủ", chặt hơn CENTER.
- Vai trò & cơ sở công tác là **read-only** trên trang này (sale không tự nâng quyền/đổi cơ sở — đó là việc của HR/SUPER_ADMIN, có audit + reason).

**Ghi chú kỹ thuật:**
- **Tái dùng:** UI kit clone site GV (`PageHeader`, `StatCard`, `StatusPill`, `EmptyState`, Sheet/Dialog shadcn); `UserMenu` + `ThemeToggle` của shell đã có sẵn "Hồ sơ cá nhân" và "Đăng xuất" — trang này chỉ là đích đến của link đó. `ImageUploader` + upload-config R2 dùng lại nguyên khối cho avatar.
- **Build mới:** cần `updateOwnProfileAction` **self-scoped** (`auth()` → chỉ ghi `Employee` của `actor.userId`, whitelist đúng các field cho phép: phone/address/dateOfBirth/emergencyContact/avatarUrl). KHÔNG dùng `updateEmployeeAction` của admin (nó gate `employees:edit` và cho sửa người khác → over-privilege trên site Sale). Cân nhắc thêm action `employees:edit-self` hoặc nhánh self trong permission matrix.
- **Cạm bẫy field-visibility lương:** SALES_CSM không có quyền `salary`; nếu bê nguyên form nhân sự admin sẽ hoặc lộ (nếu quên gate) hoặc chặn cả hồ sơ. Phải áp `getEmployeeFieldVisibility` với ngoại lệ "self xem thông tin cơ bản/cá nhân của mình", và **ĐÃ CHỐT: che lương trên site Sale kể cả với chính mình** (cần xem lương thì qua kênh HR/admin) — mặc định an toàn, tránh nới field-visibility chỉ vì 1 màn hồ sơ.
- **Không nhận id trên URL** (khác trang admin `/employees/[id]`) — tránh IDOR và lộ danh tính; luôn suy từ phiên.
- **Không tiền/không transaction phức tạp** ở trang này (khác các tab lead/convert). Rủi ro chính là over-scope quyền và lộ PII — giữ mọi ghi trong phạm vi self + audit `AuditLog` (self-edit vẫn nên ghi log để truy vết).

---

### 28. Chấm công của tôi

**Mục đích:** Cho tư vấn viên (SALES_CSM) tự check-in / check-out ca làm của chính mình tại cơ sở đang công tác và gửi yêu cầu chỉnh công khi bấm giờ sai/quên bấm. Đây là màn hình "self-service" — KHÔNG duyệt công, KHÔNG xem bảng công tổng hợp của người khác.

**Loại màn hình:** **Trang riêng** (một trang, chia 2 tab con nội bộ — không đổi route):
- Tab **"Ca của tôi"** (mặc định) — bảng ca + nút check-in/out inline.
- Tab **"Yêu cầu chỉnh công"** — danh sách yêu cầu đã gửi + nút tạo mới.
- Thao tác **Check-in / Check-out**: thực hiện **inline ngay trên dòng** (nút trên card/hàng, chạy trong `useTransition`) — KHÔNG mở trang, KHÔNG popup, để bấm nhanh 1 chạm trên mobile.
- Thao tác **Gửi yêu cầu chỉnh công** và **Xem chi tiết 1 yêu cầu**: mở bằng **popup (Sheet/Dialog)** — form ngắn, không cần rời trang.

**Đường dẫn:** `/sale/cham-cong` (một route duy nhất; 2 tab điều khiển bằng `?tab=ca|yeu-cau`, giữ được mô hình clone shell GV, không cần route con `[id]`).

**Bố cục & thành phần chính:**
- `PageHeader` — title "Chấm công của tôi", subtitle "Ca làm & yêu cầu chỉnh công của bạn"; vùng `actions` bên phải đặt nút chính theo ngữ cảnh: đang trong ca → **"Check-out"**, chưa vào ca hôm nay → **"Check-in ngay"**.
- Hàng **`StatCard`** (tone `brand`/`green`/`amber`/`blue`) — KPI cá nhân trong tháng hiện tại: (1) Số ngày đã chấm công đủ, (2) Số buổi thiếu giờ ra/vào, (3) Đi muộn (nếu HrAttendance có mốc giờ ca), (4) Yêu cầu chỉnh công đang chờ duyệt. Tất cả chỉ tính trên bản ghi của chính user.
- **Tab "Ca của tôi":**
  - `ListToolbar` — `SearchInput` (không thật cần thiết cho công cá nhân, có thể ẩn) + bộ lọc `Select`: khoảng tháng (tháng này / tháng trước) + trạng thái ca.
  - `DataTable` cột: **Ngày** · **Ca / khung giờ** · **Giờ vào (check-in)** · **Giờ ra (check-out)** · **Trạng thái** (`StatusPill`: chưa vào / đang trong ca / đủ công / thiếu giờ / nghỉ) · **Thao tác** (nút Check-in / Check-out inline, hoặc "Gửi yêu cầu chỉnh" nếu ca đã đóng).
  - Card "Hôm nay" nổi ở trên bảng (t-card): hiển thị ca hôm nay + nút check-in/out lớn (mobile-first).
- **Tab "Yêu cầu chỉnh công":**
  - `DataTable` cột: **Ngày công liên quan** · **Loại chỉnh** (quên check-in / quên check-out / sai giờ / khác) · **Giờ đề nghị** · **Lý do** (rút gọn) · **Trạng thái** (`StatusPill`: chờ duyệt / đã duyệt / từ chối) · **Người duyệt / thời điểm** (read-only).
  - Nút **"+ Gửi yêu cầu chỉnh công"** ở `PageHeader.actions` của tab → mở **Sheet** chứa form: chọn ngày/ca liên quan, loại chỉnh, giờ đề nghị (time input), lý do (textarea bắt buộc ≥ N ký tự).
- Tái dùng nguyên khối UI kit site GV: `page-header`, `stat-card`, `data-table`, `list-toolbar`, `search-input`, `status-pill`, `empty-state`. Đổi từ điển trạng thái sang domain chấm công.

**Dữ liệu hiển thị:**
- Model chính: **`HrAttendance`** (subsystem HrAttendance). Field dự kiến (cần đối chiếu `prisma/schema.prisma` khi build): `userId`/`employeeId`, `workDate`, `shiftId`/`shift`, `checkInAt`, `checkOutAt`, `status`, `centerId`, `orgUnitId`, `note`. Chỉ lấy bản ghi có chủ thể = `session.user.id`.
- Yêu cầu chỉnh công: model riêng thuộc HrAttendance (dự kiến `HrAttendanceCorrection` / `HrAttendanceAdjustmentRequest` — **cần xác nhận tên model thật trước khi code**), field: `attendanceId`, `type`, `requestedCheckInAt`/`requestedCheckOutAt`, `reason`, `status`, `handledById`, `handledAt`, `response`.
- **PII:** màn này KHÔNG chạm dữ liệu lead/PH/HS → không liên quan `leads:view-pii`. Chỉ hiển thị dữ liệu công của chính user; KHÔNG hiển thị công/lương đồng nghiệp.
- **scopedDb:** đọc/ghi qua `scopedDb(actor)`; thêm ràng buộc cứng `where userId = session.user.id` (scope OWN) — cách ly cơ sở của scopedDb là lớp phòng thủ ngoài, own-filter là lớp chính. CS1 không thấy công CS2 và Sale này không thấy công Sale khác.

**Thao tác (actions):**

| Thao tác | Trang / Popup | Quyền cần | Server action tái dùng |
|---|---|---|---|
| Check-in ca hôm nay | Inline trên card/hàng (không trang, không popup) | `hr_attendance:checkin` | Action HrAttendance check-in hiện có (gate `hr_attendance:checkin`) — cần trỏ đúng action trong module HR; ghi `checkInAt`, `centerId` theo user |
| Check-out ca hôm nay | Inline trên card/hàng | `hr_attendance:checkin` | Cùng action check-in/out của HrAttendance (ghi `checkOutAt`) |
| Xem lịch sử ca của tôi | Trong trang (tab "Ca của tôi", RSC đọc) | `hr_attendance:checkin` (gate trang) | RSC đọc qua `scopedDb` + own-filter, không cần action ghi |
| Gửi yêu cầu chỉnh công | **Popup (Sheet)** | `hr_attendance:checkin` (self-service; KHÔNG cần quyền duyệt) | Action tạo yêu cầu chỉnh công của HrAttendance (**cần xác nhận đã tồn tại; nếu chưa → build mới, chỉ tạo bản ghi PENDING, không tự áp**) |
| Xem chi tiết 1 yêu cầu | **Popup (Dialog)** read-only | `hr_attendance:checkin` | RSC/action đọc bản ghi của chính user |
| Duyệt / từ chối yêu cầu | ❌ KHÔNG có trên site Sale | (thuộc quản lý/HR — ngoài phạm vi SALES_CSM) | — |
| Xem bảng công tổng hợp | ❌ KHÔNG có | (ngoài phạm vi) | — |

**Trạng thái:**
- **Rỗng (empty-state):** tab "Ca của tôi" chưa có ca nào trong kỳ → `EmptyState` tone slate "Chưa có ca chấm công nào trong tháng này". Tab "Yêu cầu chỉnh công" trống → `EmptyState` "Bạn chưa gửi yêu cầu chỉnh công nào" + nút tạo mới.
- **Loading:** skeleton hàng bảng; nút check-in/out ở trạng thái pending (spinner, disable) trong `useTransition` để chống double-submit.
- **Lỗi:** `toast.error` (sonner đã có trong shell) — ví dụ "Không thể check-in: ngoài khung giờ ca" / "Đã check-in ca này rồi". Không vỡ trang (giữ dữ liệu cũ).
- **Không-có-quyền:** user vào `/sale/cham-cong` mà thiếu `hr_attendance:checkin` → layout/page gate redirect về trang mặc định site Sale (giống pattern PAGE_GATES); không render nút.

**Quyền & phạm vi:**
- **Permission gate của tab:** `hr_attendance:checkin` (đúng như bản đồ tab→permission của site Sale). Gate cả ở page (route gate) lẫn ở từng server action (đầu function `auth()` + `assertCan`/`checkPermission('hr_attendance:checkin')`).
- **Scope:** **OWN** — mọi truy vấn ràng chủ thể = `session.user.id`. Không cấp `hr_attendance:approve`/`hr_attendance:view-all` (nếu tồn tại) cho màn này. scopedDb(actor) giữ cách ly cơ sở (CENTER) làm phòng thủ ngoài; OWN là ranh giới chính.

**Ghi chú kỹ thuật:**
- **Tái dùng:** gọi lại action check-in/out của module HrAttendance đã gate `hr_attendance:checkin` — KHÔNG viết lại logic bấm giờ; site Sale chỉ lắp UI mới (card + bảng) trỏ vào action sẵn có. UI kit clone nguyên từ `_components/ui/` site GV.
- **Cần build mới / xác nhận trước khi code:**
  1. **Xác nhận tên model + field thật** của `HrAttendance` và của bản ghi "yêu cầu chỉnh công" trong `prisma/schema.prisma` (survey chỉ nêu model `HrAttendance` + 2 route `/cham-cong/lich-ca`, `/cham-cong/yeu-cau-cong`; tên field bên trên là dự kiến).
  2. **Kiểm tra action "gửi yêu cầu chỉnh công" đã tồn tại chưa.** Nếu chưa → build action mới CHỈ tạo bản ghi trạng thái PENDING (self-service), tuyệt đối không tự áp giờ vào công — việc duyệt là của HR/quản lý, ngoài site Sale.
  3. Xác nhận `HrAttendance` có nằm trong `SCOPED_MODELS` để `scopedDb` tự lọc; nếu chưa, thêm own-filter thủ công + cân nhắc bổ sung vào scope.
- **Cạm bẫy:**
  - **centerId ở bản ghi mới:** khi check-in tạo bản ghi HrAttendance phải set `centerId`/`orgUnitId` theo cơ sở đang công tác của user (tránh bug `centerId=null` từng gặp ở enrollment) — nếu null sẽ lọt/ẩn sai qua scopedDb.
  - **Cửa sổ giờ / hồi tố:** nếu HrAttendance enforce khung giờ ca hoặc cửa sổ chỉnh công (tương tự cửa sổ 7 ngày của `attendance:edit`), phải enforce ở call-site action, không chỉ ẩn nút UI.
  - **Idempotency:** chặn double check-in cùng ca (unique `(userId, workDate, shiftId)` hoặc guard trong action) — nút chạy trong `useTransition` + disable khi pending.
  - **KHÔNG dùng `attendance:*`** (điểm danh học viên) cho màn này — đây là `hr_attendance:*` (chấm công nhân sự), hai subsystem khác nhau; đừng nhầm StatusPill/state của điểm danh lớp.
  - Không có tiền/transaction ở tab này → không cần `$transaction`; nhưng vẫn giữ pattern `auth()` + `checkPermission` + `scopedDb` cho mọi mutation.

---

## §8. RBAC chi tiết & khoảng trống quyền

**Bản đồ quyền `SALES_CSM` (đã verify `lib/auth/permissions.ts`):**
`leads:view-own · leads:view-pii · leads:create · leads:edit · leads:import` · `trials:view · trials:manage` · `students:view-all · students:create · students:edit` · `classes:view-all` · `enrollments:view-all · enrollments:create · enrollments:edit` · `attendance:edit` (cửa sổ hồi tố 7 ngày, **không** `attendance:view`) · `payments:record` (**không** confirm/manage) · `orders:view` · `vouchers:view · products:view · kits:view · course-packages:view` · `parent-requests:manage` · `hr_attendance:checkin` (**không** adjust/duyệt).

**Cố ý KHÔNG có (W0-NAV-2 + hygiene):** Tuyển dụng, Tin tức, Phòng học, tab Buổi học/Điểm danh độc lập, Khoá dạy, LMS, Nhân sự/GV, `payments:manage` (công nợ/hoàn tiền/xuất phiếu), Tồn kho, Học bạ, `leads:view-all` (CRM tổng), Cài đặt/Audit/Users, `enrollments:transfer` (chuyển lớp phải QL duyệt).

**2 khoảng trống PHẢI vá (đồng bộ v1 `permissions.ts` + v2 `seed-roles.ts` + `rbac-parity.test.ts`):**

1. GAP QUAN TRỌNG orders:manage = [SUPER_ADMIN, CENTER_MANAGER, ACCOUNTANT] — SALES_CSM KHÔNG có → Sale thuần KHÔNG tạo được Order qua flow hiện tại, trong khi Order là tiền đề recordPayment → đủ điều kiện convert. Phải QUYẾT: (a) cấp orders:manage cho SALES_CSM, HOẶC (b) tạo action orders:create hẹp quyền riêng cho Sale (chỉ tạo đơn gắn lead của mình). Đồng bộ v1 matrix + v2 seed-roles + rbac-parity.test.
2. commission:view-own CHƯA TỒN TẠI — cần thêm action mới vào matrix v1 + RolePermission v2 (scope OWN, query CommissionLine.recipientId=me). KHÔNG mở /admin/crm/commission (gate payments:manage cho phép duyệt/mở lại/export toàn hệ thống).

---

## §9. Ghi chú rà soát (đã verify vs còn treo)

**Đã verify khớp code:** `orders:manage` GAP (SALES_CSM không có) · `payments:record` có / `payments:confirm` không · `parent-requests:manage = [SUPER_ADMIN, CENTER_MANAGER, SALES_CSM]` · `leads:view-own = [SUPER_ADMIN, SALES_CSM]` (CENTER_MANAGER thấy lead nhờ `leads:view-all`, **không** view-own) · `SALES_CSM ∈ PARENT_CONTACT_ROLES` · `hr_attendance:checkin` có / adjust không · `VoucherDiscountKind = {PERCENT, FIXED}` (không phải AMOUNT) · `VoucherType = {COURSE, PACKAGE, KIT_ROBOT, SENSOR, ALL}` · `commission:view-own` là **mới** · chặn convert khi chưa có **Payment RECORDED** (không phải CONFIRMED) · `getNearingEndEnrollments` hiện dùng **`db` trần** → phải bọc `scopedDb` · host `sale` hiện chỉ phục vụ tĩnh (route-policy.ts:392).

**Đã siết trong tài liệu này:** hợp nhất **Bảng route chuẩn §3** (vá lỗi 28 tab dùng slug lệch → link chéo chết) · **SLA-4 = >48h (2 ngày)** theo SR.QD.217, tách khỏi "nhắc idle 24h nội bộ" · quy ước **Trang/Popup §2.6** (chốt 10 điểm mập mờ) · ranh giới **Học bù** (QĐ-6) · `attendance:edit` **không** làm tab độc lập (chỉ dùng gián tiếp qua `resolveAbsence`).

**Chốt quyết định:** toàn bộ **8 QĐ ở §0.3** + **12 câu ở §10** đã chốt ngày **16/07/2026** theo ủy quyền của user. Tài liệu này là **bản final** làm căn cứ triển khai P0→P7; muốn đảo quyết định nào thì **sửa tài liệu trước, code sau**.

**Cập nhật form MISA cho tab 6 (16/07 — 2 lượt):** Lượt 1 (chiều) đặc tả nhầm theo docx "Form nhung quà tặng về Misa Amis V2.docx" — hoá ra là **form quà tặng KHÁC, không liên quan** (user đính chính buổi tối) → đã hủy toàn bộ (redirect `quatang.edu.vn`, Form ID `adaa2ae1…`). Bản ĐÚNG: **"Form nhập liên hệ từ Sale"** (snippet user cung cấp, lưu `satarobo-sale/form-sale-nhap-snippet.html`) — đã verify: **cùng Form ID `c53af301…` + FormKey + Companycode với form cũ** (cùng collection MISA), bộ trường mới thêm `Description`/`LeadSourceID` (12 nguồn)/`MailingAddress`, bỏ 3 trường `Shipping*`, tỉnh dùng `MailingProvinceID` (63 tỉnh cũ), **RedirectURL nội bộ `http://sale.satarobo.vn/thank-you`**; chỉ `LastName` bắt buộc → checklist user đạt **11/12**, GAP duy nhất = SĐT PH chưa bắt buộc (xử lý 2 tầng: config MISA chuẩn + guard tạm ở wrapper). Tab 6 đặc tả lại lần 2; task T27/T27b/T27c cập nhật theo.

---

## §10. Quyết định chi tiết — ✅ ĐÃ CHỐT toàn bộ (16/07/2026, user ủy quyền)

| # | Câu hỏi | ✅ Quyết định |
|---|---|---|
| Q1 | HOST: tái chiếm `sale.satarobo.vn` hay subdomain thứ 6 `tuvan.`? Số phận entry công khai form MISA? | **Tái chiếm `sale.satarobo.vn`** (= QĐ-1). Entry công khai **GIỮ**: `/nhap-lieu.html` + `/thank-you.html` không auth (Ads chạy tiếp, link MISA cũ không gãy); mọi path khác đòi login. |
| Q2 | THEME: teal hay tím? | **Tím `#7C3AED`** (= QĐ-2). |
| Q3 | Role gate tầng 3 gồm ai? | **Chỉ `SALES_CSM` thuần** (`isSaleOnly`); CENTER_MANAGER kiêm nhiệm → bounce admin; HO_SALE / MARKETING **ngoài phạm vi v1** (= QĐ-3) → v1 không phải xử lý PII-mask đa vai. |
| Q4 | `orders:manage` hay `orders:create`? | **`orders:create` hẹp** cho SALES_CSM (đơn gắn lead của mình), parity 3 file, PR RBAC riêng trước P0 (= QĐ-4). |
| Q5 | Có màn "Hoa hồng của tôi"? B1–B5 chưa chốt có chặn không? | **Có** — `commission:view-own` scope OWN; hiển thị DRAFT kỳ hiện tại nhãn **"tạm tính"** + APPROVED kỳ cũ, kèm disclaimer "số có thể điều chỉnh khi chốt kỳ" (= QĐ-5). **B1–B5 KHÔNG chặn build** — chỉ ảnh hưởng con số, đã có disclaimer che. |
| Q6 | Sale xem doanh thu/mục tiêu/công nợ CƠ SỞ? | **KHÔNG — vĩnh viễn trên site Sale.** Vì kiêm nhiệm đã bounce về admin (Q3) nên **bỏ luôn** phương án "render có điều kiện": dashboard Sale không bao giờ chứa 5-KPI ManagerDashboard. |
| Q7 | Trial V1 hay V2? Tiêu chí "chờ chốt" theo nguồn nào? | **V2 là chuẩn; V1 read-only tương thích.** Tiêu chí chờ chốt = **1 nguồn duy nhất `LeadChild.trialStatus = ATTENDED`** (per-con); `Lead.status=TRIAL_ATTENDED` chỉ để hiển thị, không dùng lọc (= QĐ-7). |
| Q8 | Sale xem rubric/nhận xét GV? | **Có, read-only** — gate `trials:view` sẵn có + `scopedDb`, không action mới (= QĐ-8). |
| Q9 | Cần model `Appointment` riêng? | **KHÔNG (v1)** — "việc & lịch hẹn hôm nay" dùng `LeadTask.dueAt` (khôi phục UI đã gỡ LD6 — task T11) + `TrialClass/TrialClassSession.scheduledAt`. Đánh giá lại sau 1–2 tháng dùng thật; chỉ thêm model nếu Sale thực sự cần hẹn gọi/gặp độc lập với lead-task. |
| Q10 | Messenger inbox (L1) vào site Sale? | **HOÃN sau v1.** L1 là việc HO_SALE (trực Page HO); Sale cơ sở làm từ L2. Tab #7 giữ đặc tả nhưng **không render trong nav v1**; L1 tiếp tục ở `/admin/crm/messenger`. |
| Q11 | Cần model "nhật ký chăm sóc" timeline mới? | **KHÔNG (v1)** — `StudentCareTask` + `LeadActivity` đủ cho vòng đầu; chỉ bổ sung model timeline nếu CSKH thực tế cần lịch sử nhiều dòng theo HV (đánh giá sau v1). |
| Q12 | Kanban vs Bảng? Preset mặc định? | **Giữ cả 2** — Kanban mặc định trên desktop; **Bảng là fallback chính trên mobile** (kéo-thả touch là nice-to-have, không phụ thuộc). Chip preset: **"Tất cả đang mở" (mặc định)** + "Đã đăng ký" (REGISTERED, badge đếm). |

---

## §11. Phụ lục — Nguồn tham chiếu

- Shell mẫu: `app/(teacher)/teacher/{layout.tsx, _components/*}` · Nav portal: `app/(portal)/portal/_components/{portal-nav, site-switcher}.tsx`.
- Host/định tuyến: `lib/auth/route-policy.ts` (`decideRoute`, nhánh `sale`/`teacher`, `isTeacherOnly`) · `proxy.ts` (không sửa).
- Quyền: `lib/auth/permissions.ts` · `prisma/seed-roles.ts` (`CENTER_SALES_CSM`) · `rbac-parity.test.ts`.
- Nghiệp vụ: **SR.QD.217** (phễu L1→L2→L3, SLA) · **Doc 15** §2/§5 (CRM/Sale) · phase **R1** (CRM).
- Form MISA: **"Form nhập liên hệ từ Sale"** — snippet chuẩn tại `D:\Web SataRobo\satarobo-sale\form-sale-nhap-snippet.html` (nguồn của tab 6, bọc wrapper `public/sale/form-sale-nhap.html`, snippet giữ **nguyên khối**); form bản CŨ `public/sale/nhap-lieu.html` + `thank-you.html` giữ nguyên cho entry công khai Ads. ⚠️ File docx `Form nhung quà tặng về Misa Amis V2.docx` là form quà tặng KHÁC — **không dùng** cho site Sale.
- Model chính (đã verify tồn tại): `Lead`, `LeadChild`, `LeadActivity`, `LeadTask`, `TrialClass`, `TrialClassSession`, `TrialEnrollment`, `TrialRubricEval`, `Enrollment`, `Order`, `Payment`, `Voucher`, `CoursePackage`, `ParentRequest`, `WorkRequest`, `MakeupNeed`, `StudentRiskAlert`, `StudentCareTask`, `CommissionStatement`, `CommissionLine`.
