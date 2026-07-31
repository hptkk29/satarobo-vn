# Sổ quyết định — chương trình tái cấu trúc nền tảng đa cơ sở

> File này là **nguồn đúng nhất** cho mọi bước sau. Khi tài liệu bước nào mâu thuẫn với file này → file này thắng.
> Quyết định ký SAU thắng quyết định ký TRƯỚC. Mỗi mục ghi rõ ngày và hệ quả bắt buộc.

**Thuật ngữ khoá:** **FRANCHISOR** = bên nhượng quyền = khối HO · **FRANCHISEE** = bên nhận nhượng quyền = cơ sở/công ty tỉnh khác. Trường tham chiếu `franchisorOrgId` / `franchiseeOrgId`. **Không dùng** `franchise` trần hay `franchiseId`.

---

## QĐ-A · 28/07/2026 — Hình dạng cây tổ chức: khối vùng NGANG HÀNG với HO

**Chốt:** `ROOT` → `HO` và các `REGION` là **anh em**, cùng treo dưới `ROOT`. Cơ sở treo dưới khối vùng của mình.

```
ROOT (Tập đoàn Sata Robo)
├── HO (Hội sở) — BGĐ · Đào tạo · Công nghệ · Marketing · Kế toán tổng hợp
├── VÙNG Đà Nẵng
│   ├── CS1 — 211 Nguyễn Hữu Thọ
│   └── CS2 — 114 Hoàng Diệu
└── VÙNG Hà Nội
    └── CS-HN1
```

**Thay thế:** sơ đồ ban đầu (HO là **cha** của khối vùng) và bất biến OI-1 cũ (`HO/CS1/CS2` ngang hàng — nay CS1/CS2 chuyển xuống dưới `VÙNG Đà Nẵng`).
**HO quản khối vùng bằng `UserOrgRole`, không bằng vị trí trong cây** — đúng nguyên tắc *"cây phải đồng dạng ở mọi nhánh"*.

**Hệ quả bắt buộc:**

- Thêm giá trị enum `REGION` vào `OrgUnitType` (migration `ALTER TYPE`) + đồng bộ hằng TS `lib/org/types.ts:4-13`. Doc 15 NC-5/OI-11 (`:884`, `:908`) đã **cố ý loại** `REGION` → **QĐ-A đảo lại**, phải ghi addendum `[ĐẢO — QĐ-A]` vào chính Doc 15.
- Không sửa `isHoLevel` **vì lý do hình dạng cây**. ⚠️ Nhưng vẫn phải sửa vì lý do khác — xem **QĐ-A.1**.
- Không phải sửa 2 test fixture `lib/org/org-tree.test.ts:92,135` về mặt "HO không có con"; **nhưng** `getSubtreeCenterIds` của `VÙNG Đà Nẵng` giờ phải trả `[CS1, CS2]` → cần test mới.
- `DEFAULT_SELECTABLE_TYPES` (`lib/org/org-tree.ts:128-134`) **KHÔNG được** chứa `REGION` — nếu chứa, node vùng lọt vào picker cơ sở và sinh bản ghi `centerId = null` biến mất khỏi mọi actor cấp cơ sở (xem `00-dryrun.md` §4.4).

### QĐ-A.1 — Vẫn phải thu hẹp `isHoLevel`, nhưng vì D10 chứ không vì cây

`[QS]` QĐ-A loại bỏ nhu cầu sửa `isHoLevel` **cho bài toán hình dạng cây**, nhưng **không** loại bỏ nó cho bài toán nhượng quyền:

- `isHoLevel` = **bất kỳ** role nào gắn tại node `HO`/`ROOT` (`lib/auth/actor.ts:133`, không lọc `roleCode`) → `centerScope = "ALL"` cho **mọi** permission của role đó (`:145-146, :161`), cộng `lib/db-scope.ts:218` trả `"ALL"` khi model thiếu map prefix.
- **D10** yêu cầu FRANCHISOR chỉ xem chi tiết **trong phạm vi nhượng quyền** (lớp dùng chương trình của HO), ngoài phạm vi thì **nhiều nhất là số tổng hợp**.
- Hai điều này **không cùng tồn tại được**: hễ còn `isHoLevel = ALL`, mọi nhân sự HO đọc **toàn bộ** dữ liệu FRANCHISEE bất kể chương trình nào.

→ **D10 không triển khai được nếu không thu hẹp `isHoLevel`.** Đây là công việc đụng `actor.ts` (5 điểm) + `db-scope.ts:218` + **vùng shadow-compare** → phải xếp lịch sau khi cửa sổ shadow đóng.

---

## QĐ-B · 28/07/2026 — GIỮ DENY (D5 thắng Doc 15 OI-7)

**Chốt:** `can()` v2 **phải** tôn trọng `UserPermissionGrant` grant = `DENY`. Doc 15 OI-7 (`:879`) và `CLAUDE.md:92` **bị đảo**.

**Hệ quả bắt buộc:**

1. Thêm `grantsDeny` vào `Actor` (`lib/auth/actor.ts:166-170` hiện chỉ giữ `ALLOW`) và chặn ở **đầu** `can()` v2 (`lib/auth/can.ts:41`) — **TRƯỚC** cả `isSuperAdmin` và `grantsAllow`.
2. **Ngoại lệ tường minh cho `SUPER_ADMIN`** (v1 đã có: `permissions.ts:653-656` — *"không thể bị DENY override, chống tự khoá"*). Không có ngoại lệ này, một DENY toàn cục khoá luôn quản trị viên ra ngoài hệ thống.
3. Bộ test ma trận `DENY × scopeType` (6 scope × ít nhất 2 role).
4. Sửa `Document/2-architecture-design/15-final-architecture-blueprint.md:879` → ghi `[ĐẢO — QĐ-B 28/07/2026]`. Sửa `CLAUDE.md:92`.
5. **`lib/scorm/access.ts:46-47`** hiện chạy `getEffectivePermissions()` = v2 thuần, **bỏ qua cờ `RBAC_V2_ENABLED` và bỏ qua DENY** → sau QĐ-B đây là **vi phạm tường minh**, không còn là "vùng mù shadow". Thu hồi quyền bằng DENY hiện **không cắt được SCORM**.

⛔ **CHẶN CỨNG:** **KHÔNG được bật `RBAC_V2_ENABLED`** cho tới khi (1)+(2)+(3) xong. Bật trước = mọi DENY hiện hữu hết hiệu lực **im lặng, không log, không cảnh báo**.
→ Điều này **chặn lịch flip của đợt go-live RBAC đang chạy**. Cần báo lại chủ đợt đó.

📋 **Việc phải làm trước khi bàn tiếp:** kiểm kê read-only `UserPermissionGrant WHERE grant='DENY'` (userId, action, reason). Chưa có con số này thì không ước lượng được rủi ro flip.

---

## QĐ-C · 28/07/2026 — Thi hành D7 TRIỆT ĐỂ: bỏ hẳn học bù liên cơ sở

**Chốt:** huỷ QĐ-O2 (*"liên cơ sở mặc định bật, ưu tiên CS nhà"*). Học bù chỉ trong nội bộ một cơ sở. Ca phát sinh xử lý **thủ công**.

**Hệ quả bắt buộc — cả 3 phải làm CÙNG LÚC:**

1. `lib/settings/registry.ts:484-490` *[đính chính 31/07/2026 — QĐ-E.7; bản gốc ghi `:457-464`, số dòng đã trôi]* — đổi default `makeup.crossCenterEnabled` → **`false`**.
2. `lib/makeup/service.ts:108` *[đính chính 31/07/2026 — QĐ-E.7; bản gốc ghi `:104`, nay là dấu `})` đóng khối select]* — đổi **fail-OPEN → fail-CLOSED** (`.catch(() => false)`). Hiện lỗi đọc setting = **BẬT** cross-center.
3. **GỠ `MAKEUP_EXCEPTION_MODELS`** khỏi `lib/db-scope.ts:343-348` và bỏ `withMakeupException` — đóng lại lỗ đọc chéo cơ sở đã khoét cho 4 model (`Class`, `ClassSession`, `Lesson`, `MakeupNeed`).

> ⚠️ Chỉ làm (1)+(2) mà không làm (3) = **trả giá kiến trúc mà không còn thu lợi nghiệp vụ**. Đây là lý do QĐ-C không chọn phương án nửa vời.

**Việc mới phát sinh (D7 tự đòi, nay thành yêu cầu PRD):** *"cần cách ĐẾM số ca"*. Sau khi gỡ, sẽ **không còn** ca chéo nào đi qua hệ thống → audit `MAKEUP_CROSS_CENTER` (`lib/makeup/service.ts:291-300`) sẽ ngừng sinh dòng. Cần một chỗ **ghi nhận ca xử lý thủ công** để còn đếm được. ❓ **Chưa rõ:** đếm để **báo cáo** hay để **đối trừ tiền** giữa hai cơ sở? Câu này quyết định thiết kế — cần Ban trả lời ở BƯỚC 2.

**Dữ liệu tồn:** phải rà số bản ghi bù chéo **đang mở** trước khi gỡ (query read-only: `MakeupNeed` có `makeupSessionId` trỏ buổi thuộc `centerId` khác).

---

## QĐ-D · 28/07/2026 — Phạm vi PRD (BƯỚC 2)

**Trong phạm vi:** D2 · D3 · D4 · D6 · D8 · D9 · D10 (nền tảng tổ chức + phân quyền + nhượng quyền).
**Ngoài phạm vi:** D12 (đã hoãn) · **Q1 nhóm người dùng** · **Q2 cây báo cáo theo quản lý trực tiếp**.

**Lý do để sau:**

- **Q1** — `derivedFrom` (D3) đã giải phần lớn nhu cầu "gán theo lô": cắt hợp đồng cắt cả chùm quyền trong một thao tác.
- **Q2** — duyệt theo **người** quản lý là bộ máy mới, đúng loại **D12 đang hoãn**; hệ đã có **8 luồng duyệt** đi theo **đơn vị**.

---

## Bảng tra nhanh: quyết định nào đụng cửa sổ shadow-compare RBAC

| Quyết định | Đụng shadow? | Ghi chú lịch |
|---|---|---|
| QĐ-A (cây vùng ngang HO) | ❌ Không | Làm được ngay |
| **QĐ-A.1** (thu hẹp `isHoLevel`) | ✅ **CÓ** | Chờ cửa sổ shadow đóng |
| **QĐ-B** (giữ DENY) | ✅ **CÓ** — và **chặn flip** | Phải xong trước khi bật cờ |
| QĐ-C (bỏ học bù chéo) | ❌ Không | Làm được ngay |
| QĐ-D (phạm vi) | — | — |

---

## Câu còn treo, cần trả lời ở BƯỚC 2

1. **"Phòng ban" là node trong cây (`OrgUnit type=DEPARTMENT`) hay bảng phẳng** (`DepartmentDef` như hiện tại)? Không quyết thì **D6 không có "phòng ban chuẩn" nào để tự sinh**.
2. **Đếm ca học bù thủ công** để báo cáo hay để đối trừ tiền? (QĐ-C)
3. **Trạng thái cuối của `Center` vs `OrgUnit`** — schema ghi *"flip ở PR-D"* nhưng không tài liệu nào định nghĩa PR-D gồm gì, `Center` có bị bỏ không.
4. **Thời gian chuyển tiếp** sau khi cắt hợp đồng nhượng quyền dài bao lâu, và *"dữ liệu học viên của chính mình"* gồm những gì? (D9)
5. **`Document.isPublic`** nghĩa là ai được xem? Truy vấn portal đang bỏ qua cờ này (`lib/portal/learning.ts:245-248`).
6. **Job nền chạy với danh tính gì, phạm vi gì** — cron chạy một lần cho cả tập đoàn hay một lần cho mỗi pháp nhân?

---

## QĐ-E · 31/07/2026 — TGĐ chốt 9 câu đang chặn (bảng theo dõi `09-shipping-artifacts.md` §5)

> Trả lời trực tiếp của TGĐ, phiên 31/07/2026. Đóng **8/9** chốt; **E.9 là SƠ BỘ** — chờ pháp chế xác nhận mới đủ điều kiện Đ2. Quyết định ký sau thắng ký trước: chỗ nào tài liệu BƯỚC 4–9 viết khác thì **QĐ-E thắng**.

### E.1 (c1) — Node bên NHẬN nhượng quyền là `type = FRANCHISE`

**Chốt:** chọn phương án **B** — node FRANCHISEE mang `type = FRANCHISE`, **không** phải `CENTER`.

**Hệ quả bắt buộc — phải xong TRƯỚC khi mở cơ sở bên nhận đầu tiên:**
1. Tầng cách ly phải **học loại node mới**: hiện V7 (`lib/org/orgunit-rules.ts:59-62`) buộc node `FRANCHISE` có `centerId = null`, mà `passesScope` (`lib/db-scope.ts:254`) chặn bản ghi `centerId` null ⇒ nguyên trạng thì **dữ liệu của chính bên nhận vô hình với họ**. Mở **gói việc mới "scope-FRANCHISE"** (cỡ **L**, Cờ 2 = **CÓ**, điều phối security hardening): hoặc nới V7 cho `FRANCHISE` mang `centerId`, hoặc dạy `scopedDb` lọc theo trục `orgUnitId` cho loại node này — **chọn đường nào là việc thiết kế, phải spec trước khi code**.
2. Picker đơn vị (`DEFAULT_SELECTABLE_TYPES`, `lib/org/org-tree.ts:128-134`) và TS-X-5 sửa theo: `FRANCHISE` nay là loại node **mang dữ liệu hợp lệ**.
3. `R-D9-08` / KQ-7 UI mở khoá: ô "bên nhận" liệt kê node `type = FRANCHISE`. TS-17-6 viết được kỳ vọng.
4. KB-14 (`05-premortem.md`) đổi bản chất: không còn là "bẫy chọn nhầm loại" — thành **điều kiện chặn**: chưa xong gói scope-FRANCHISE thì **không mở cơ sở bên nhận**.

### E.2 (M1) — GIỮ cờ v2 bật + vá 3 việc QĐ-B NGAY

**Chốt:** phương án **C**. Chặn cứng `QUYET-DINH.md:58` được thay bằng: *"vá xong 3 việc (grantsDeny trong Actor · ngoại lệ SUPER_ADMIN · test ma trận DENY × scopeType) TRƯỚC khi grant DENY đầu tiên được tạo; luật tạm CẤM tạo DENY giữ nguyên cho tới khi test ma trận xanh."* Người thực hiện: vốn dự kiến Luân — theo **E.5** đội còn 1 dev ⇒ **Kiệt (agent hỗ trợ code)**.

### E.3 (M2) — Cửa sổ shadow tuyên bố ĐÃ ĐÓNG tại ngày flip

**Chốt:** phương án **A**. Điều kiện khởi động **làn B** từ nay là: **(1)** 3 việc QĐ-B xong (E.2) **VÀ (2)** **7 ngày** liên tiếp `RbacShadowDiff` không có nhóm lệch nào ngoài `lib/auth/rbac-intentional.ts`. *(N = 7 là đề xuất của agent, TGĐ không chỉnh — đổi N chỉ cần sửa dòng này.)* Mọi câu "chờ cửa sổ shadow đóng" trong tài liệu trước đọc lại theo điều kiện này.

### E.4 (c43) — Cho phép kéo phần lọc `roleCode` của `isHoRoot` lên TRƯỚC pha A4

**Chốt:** phương án **A**, phủ **CẢ A1 lẫn A4**. Điều kiện kèm (bắt buộc, không bỏ được): chụp `R-OPS-02` (bảng tài khoản × quyết định) **trước và sau**; mọi ô đổi phải giải thích được bằng `rbac-intentional.ts`; **một ô không giải thích được = dừng, không đi tiếp**. Sau E.3, ràng buộc lịch "chờ cửa sổ" hết hiệu lực — cặp ảnh chụp này là lưới an toàn thay thế.

### E.5 (M4/c42) — Đội thi hành: MỘT dev (Kiệt)

**Chốt:** Luân và Vy **không còn** trong đội (sau Huy & Trí rời 03/07 → nay còn đúng 1 dev). **Hệ quả bắt buộc:**
- **A7** của PRD (`02-prd:387`) đổi: ~~"lộ trình giãn ra, thứ tự vẫn đúng"~~ → **"PHẢI CẮT PHẠM VI"** — không cần chờ GD-26 đo nữa.
- Mọi phân công **Luân/Vy** trong Đ1–Đ8 (`04-assumptions.md` §10), bảng cảnh báo (`05-premortem.md` §7, `09-shipping-artifacts.md` §7), runbook → chuyển về **Kiệt** hoặc **hoãn có ghi chú**.
- **Review chéo Kiệt↔Luân không còn tồn tại** ⇒ KB-12/KB-13 thành hiện thực. Lớp bù còn lại: test tự động (CI) + agent review + BGĐ duyệt thay đổi phạm vi. KB-11 (tách gói do chia việc song song) ngược lại **giảm** — một người ship thì gói khó bị tách.
- ❓ **Treo mới:** *danh sách việc go-live được cắt để lấy chỗ* — TGĐ chưa nêu. Không chặn chặng 0, nhưng **chặn việc hẹn mốc chặng 1**.

### E.6 (M5) — Lớp không giải được chương trình: VẪN TÍNH PHÍ, không mở chi tiết

**Chốt:** phương án **A**. `R-D10-12/13` sửa theo: phạm vi **tính phí** theo đơn vị của lớp — không tham chiếu `Curriculum`; phạm vi **xem chi tiết** theo quyền sở hữu chương trình (fail-closed giữ nguyên cho chiều XEM). Kèm: **bắt buộc `curriculumId`** khi tạo lớp trong đơn vị FRANCHISEE. TS-11-4 viết được kỳ vọng.

### E.7 (M7) — Đính chính số dòng trôi trong QĐ-C

**Chốt:** phương án **A** — đã sửa ngay trong file này (xem 2 dòng `[đính chính 31/07/2026]` ở mục QĐ-C). Nội dung quyết định không đổi.

### E.8 (M8) — Tách `R-D2-09/10` theo bản chất

**Chốt:** phương án **A** — pha **A8** làm phần **thêm cột `path`/`depth` + backfill** (additive, chưa ai đọc, Cờ 1/2 = KHÔNG); nhánh **B4** làm phần **chuyển các phép đọc** sang dùng path. Đúng mẫu 2-phase của repo. PRD hết mâu thuẫn nội bộ ở điểm này.

### E.9 (§9 câu 8) — SƠ BỘ: HO là bên kiểm soát duy nhất + MỘT phụ lục mẫu chuẩn

**Chỉ đạo gốc:** *"chọn cách nào linh hoạt nhất nhưng giảm giấy tờ lại."* **Diễn giải đã chốt với TGĐ:** phương án đồng-kiểm-soát (C) linh hoạt nhất nhưng đẻ giấy tờ theo từng hợp đồng; cân bằng đúng yêu cầu là **A + chuẩn hoá**: **HO là bên kiểm soát dữ liệu duy nhất, bên nhận là bên xử lý thay**, thi hành bằng **một phụ lục xử lý dữ liệu MẪU CHUẨN** đính kèm mọi hợp đồng nhượng quyền — ký **một lần cùng hợp đồng** (giấy tờ tối thiểu), mẫu do HO giữ nên chỉnh **tập trung một chỗ** (linh hoạt).
**Hệ quả:** một chính sách quyền riêng tư chung toàn thương hiệu; portal/consent giữ nguyên; `R-DP-02` (người phụ trách dữ liệu theo đơn vị) hạ độ ưu tiên — đầu mối pháp lý là HO; `R-DP-04` (thông báo nêu đúng pháp nhân) đơn giản hoá thành "nêu HO + cơ sở đang học".
⚠️ **Trạng thái: SƠ BỘ của TGĐ.** Đ2 (`04-assumptions.md` §10) vẫn đòi **văn bản có pháp chế** — quyết định này đủ để **mở khoá thiết kế** nhóm `R-DP-*`, **chưa đủ để mở cơ sở thật**.
