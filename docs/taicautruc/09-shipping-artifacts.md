# BƯỚC 9 — Bộ vật phẩm phát hành

> Ngày 29/07/2026 · **bước cuối** của chương trình 10 bước · phạm vi: **chỉ 12 kết quả lập lịch được** của `07-roadmap.md` (chặng 0 + chặng 1). Không có vật phẩm nào cho phần sau ranh giới.
> Nguồn: `07-roadmap.md` · `08-test-scenarios.md` · `05-premortem.md` · `06-redteam.md` · `02-prd-franchise-platform.md` · `QUYET-DINH.md` · quy ước runbook sẵn có ở `docs/ke-hoach-go-live-2607/`.
> ⚠️ Skill `pm-ai-shipping:shipping-artifacts` **không có trong máy này** — áp phương pháp chuẩn, không theo khuôn skill.
>
> **Tài liệu này khác 8 bước trước:** không phân tích thêm gì. Mọi mục là thứ **copy ra dùng được ngay** — khuôn PR, luật phát hành, runbook, bảng theo dõi, ghi chú phát hành. Chỗ nào cần phán đoán thì đã phán đoán ở bước trước rồi.

---

## 1. Hai sự thật nền về triển khai — đừng nhớ nhầm

`[QS]` Lấy nguyên từ `docs/ke-hoach-go-live-2607/runbook-dien-tap-rollback-rbac-v2.md` §0 (đã đối chiếu tài liệu Vercel ngày 10/07). Mọi runbook ở §6 dựa trên hai điều này.

| | Cách làm | Thời gian |
|---|---|---|
| **Đi tới** (đổi biến môi trường) | đổi env → **Redeploy**, build đầy đủ | **phút** |
| **Lui** (Instant Rollback) | trỏ traffic về deployment cũ, **không build lại** | **giây** |

⚠️ **Hai cơ chế KHÔNG đối xứng.** Instant Rollback **giữ nguyên env đã đóng băng lúc deployment cũ được build** ⇒ **lui deployment KHÔNG hoàn tác việc đổi biến môi trường**. Hệ quả thực dụng cho chương trình này:

- Thay đổi **thuần code** → lui bằng Instant Rollback, **giây**.
- Thay đổi **qua env** (mọi thứ dạng cờ) → muốn lui phải **đổi env + redeploy**, **phút**, không phải giây.
- Thay đổi **dữ liệu** (backfill, seed, gỡ ngoại lệ) → **Instant Rollback không hoàn tác được gì cả**. Đây là loại thay đổi duy nhất cần bản chụp trước. Xem R2, R3.

`[QS]` Và một ràng buộc vận hành giữ nguyên từ repo: **agent không có credential prod**. Mọi bước chạm prod trong §6 đều ghi rõ **người** thực hiện.

---

## 2. Định nghĩa XONG — áp cho mọi PR của chương trình

Một PR chỉ được merge khi **tất cả** dòng dưới đây đúng. Đây là bản rút gọn để dán vào khuôn PR ở §3.

| # | Điều kiện | Vì sao có |
|---|---|---|
| 1 | Khai **kết quả `KQ-*`** mà PR phục vụ, và **mã `R-*`** liên quan | Không có = không truy được về lộ trình |
| 2 | Khai **Cờ 1** và **Cờ 2**, mỗi cờ một câu lý do | `02-prd:360-364`. Cờ 2 = CÓ thì **phải** điều phối với đợt security hardening trước khi merge |
| 3 | Mọi tiêu chí dạng `count = 0` **kèm mẫu số** và ngưỡng tối thiểu | `KB-18` — prod hiện 41 Lead / 2 Student / 1 Employee, `count = 0` xanh vì rỗng |
| 4 | Có **ít nhất một kịch bản PHỦ ĐỊNH** từ `08-test-scenarios.md`, và nó **đã từng ĐỎ** trước khi vá | Test chưa bao giờ đỏ là test chưa chứng minh được gì |
| 5 | Nếu chạm model thuộc `SCOPED_MODELS`: có ca **GHI** chéo cơ sở bị từ chối (TS-X-2) và ca **quên `centerId`** bị từ chối (TS-X-4) | `scopedDb` **chỉ auto-scope READ** |
| 6 | Nếu thuộc một **gói không được tách** (§4): PR phải chứa **đủ** các mã của gói | `02-prd:401`, `:440`, `:366-367` · `KB-11` |
| 7 | `pnpm typecheck && pnpm lint && pnpm build` PASS | Quy ước repo |
| 8 | Nếu thêm spec e2e: khai **suite** và **job CI** chạy nó | 32/98 spec hiện không job nào chạy (`08-test-scenarios.md` §2) |
| 9 | Nếu chạm `prisma/seed-roles.ts`, `hasRole`, hoặc `lib/scorm/access.ts`: ghi rõ **có phải TRUNCATE lại đồng hồ shadow không** | `00-baseline.md` — chạy lại seed = đổi mapping = đổi nền so sánh |
| 10 | Nếu tạo `UserPermissionGrant` dạng `DENY`: **chặn lại, không merge** | `can()` v2 không có nhánh DENY ⇒ vô hiệu im lặng (TS-X-7) |

---

## 3. Khuôn PR — repo hiện **chưa có**, dán nguyên vào `.github/pull_request_template.md`

`[QS]` Đã kiểm: `.github/pull_request_template.md` **không tồn tại**, `.github/CODEOWNERS` **không tồn tại**.

```markdown
## Kết quả phục vụ
- KQ: <KQ-0.1 … KQ-7>
- Mã R-*: <R-…>
- Kịch bản kiểm thử phủ: <TS-…>

## Hai cờ lịch
- **Cờ 1** (đụng shadow-compare — đổi giá trị hàm quyền động trên dữ liệu đang có): CÓ / KHÔNG
  - Lý do: …
- **Cờ 2** (đụng phạm vi dữ liệu — đổi tập bản ghi một tài khoản đọc được): CÓ / KHÔNG
  - Lý do: …
  - Nếu CÓ → đã điều phối với đợt security hardening? Ai xác nhận: …

## Nghiệm thu
- Tiêu chí: …
- **Mẫu số**: … (tổng số bản ghi được xét; nếu dưới ngưỡng tối thiểu → ghi "CHƯA NGHIỆM THU ĐƯỢC")

## Kịch bản phủ định
- [ ] Có ít nhất 1 ca PHỦ ĐỊNH
- [ ] Ca đó **đã từng ĐỎ** trước khi vá (dán link CI run đỏ)

## Gói phát hành
- [ ] Không thuộc gói nào
- [ ] Thuộc gói: R-D2-16+17+18 / R-QDB-02+03 / R-QDC-01+02+03 / R-D3-10
  → PR này chứa **đủ** các mã của gói: CÓ / KHÔNG (KHÔNG ⇒ không merge)

## Ảnh hưởng vận hành
- [ ] Thay đổi thuần code (lui bằng Instant Rollback, giây)
- [ ] Thay đổi qua env (lui = đổi env + redeploy, phút)
- [ ] Thay đổi DỮ LIỆU (Instant Rollback KHÔNG hoàn tác — đã có bản chụp trước? link: …)
- [ ] Chạm seed-roles / hasRole / lib/scorm/access.ts → có phải TRUNCATE đồng hồ shadow không: …

## Kiểm tra bắt buộc
- [ ] typecheck · lint · build PASS
- [ ] Nếu chạm SCOPED_MODELS: có ca GHI chéo cơ sở bị từ chối + ca quên centerId bị từ chối
- [ ] Nếu thêm spec e2e: suite = … · job CI chạy nó = …
- [ ] KHÔNG tạo UserPermissionGrant dạng DENY
```

---

## 4. Luật phát hành — bốn gói không được tách

| Gói | Mã | Nếu tách thì sao | Nguồn |
|---|---|---|---|
| **Cổng tạo cơ sở** | `R-D2-16` + `R-D2-17` + `R-D2-18` | Giao trạng thái nửa vời: cơ sở có node nhưng không mã, hoặc có mã nhưng vẫn hai bản ghi rời | `02-prd:401` |
| **Ngoại lệ SUPER_ADMIN** | `R-QDB-02` + `R-QDB-03` | Có khoảng thời gian **tài khoản quản trị cao nhất tự khoá mình** | `02-prd:440` |
| **QĐ-C** | `R-QDC-01` + `R-QDC-02` + `R-QDC-03` | *"Trả giá kiến trúc mà không còn thu lợi nghiệp vụ"* | `QUYET-DINH.md:69`, `:75` |
| **Gác gán giáo viên** | `R-D3-10` *(đã gộp từ `R-D8-10`)* | Hai hướng ngược nhau trên **cùng một hàm gác**; người sau gỡ điều kiện của người trước để test xanh — *"loại hỏng không ai phát hiện qua đọc diff riêng lẻ"* | `02-prd:366-367` |

**Cưỡng chế bằng máy, không bằng trí nhớ.** Đề xuất một kiểm tra CI đơn giản: khai bốn gói vào một tệp bản đồ; nếu diff của PR chạm **một phần** mã của gói mà không chạm phần còn lại → **CI đỏ**, thông báo ghi rõ tên gói và các mã còn thiếu.

> ⚠️ Gói 1 và gói 2 **nằm sau ranh giới** — ghi ở đây để khi tới lượt không ai phải đi tìm lại. Chỉ gói 3 và gói 4 thuộc phạm vi 12 kết quả.

---

## 5. Bảng theo dõi chốt — vật phẩm sống, cập nhật hàng tuần

Đây là **thứ quan trọng nhất trong tài liệu này**. Bảng gồm **11 dòng** = 8 chốt `M1–M8` của `07-roadmap.md` §6.1 + hai câu chặn cứng `c43`, `c1` + `§9 câu 8` (mã `R-DP-*` không có làn). **Không dòng nào gỡ được bằng công sức kỹ thuật** — tất cả cần một chữ ký hoặc một câu trả lời.

| Chốt | Nội dung một câu | Ai mở | Trạng thái | Mở ra cái gì |
|---|---|---|---|---|
| **c43** | Ai cho `R-D4-09` (hoặc riêng phần lọc `roleCode`) chạy trước pha A4 — và c43 phủ A1, A4, hay cả hai? | TGĐ | ✅ **đóng 31/07 — QĐ-E.4** | **Pha A1 + A4 MỞ** — phủ cả hai; điều kiện: cặp ảnh chụp `R-OPS-02` trước/sau, ô lệch không giải thích được = dừng |
| **c1** | Node FRANCHISEE là `type=CENTER` hay `type=FRANCHISE`? | TGĐ | ✅ **đóng 31/07 — QĐ-E.1** | Chọn **`FRANCHISE`** ⇒ mở **gói việc mới "scope-FRANCHISE"** (cỡ L, Cờ 2 CÓ) — thành **điều kiện chặn** trước khi mở cơ sở bên nhận đầu tiên |
| **M1** | QĐ-B chặn cứng — cờ **đã bật**, 3 việc chưa có | TGĐ | ✅ **đóng 31/07 — QĐ-E.2** | Giữ cờ bật; **vá 3 việc DENY ngay** (Kiệt + agent); luật cấm tạo DENY giữ tới khi test ma trận xanh |
| **M2** | Điều kiện khởi động làn B không định nghĩa được | TGĐ | ✅ **đóng 31/07 — QĐ-E.3** | Cửa sổ tuyên bố **đã đóng tại ngày flip**; làn B mở khi: 3 việc QĐ-B xong **và** 7 ngày sạch ngoài `rbac-intentional` |
| **M4 / c42** | Đội thi hành là ai? | TGĐ | ✅ **đóng 31/07 — QĐ-E.5** | **1 dev (Kiệt)** — Luân & Vy không còn. A7 đổi thành **"phải cắt phạm vi"**; ❓ treo mới: cắt việc nào của go-live |
| **M5** | `R-D10-13` fail-closed đi ngược mục tiêu giám sát của D10 | TGĐ | ✅ **đóng 31/07 — QĐ-E.6** | Không giải được chương trình → **vẫn TÍNH PHÍ**, không mở chi tiết; bắt buộc `curriculumId` cho lớp FRANCHISEE |
| **M3** | Điều kiện ra pha A3 mâu thuẫn bằng chứng mã | Kiệt + Luân | ✅ **đóng 29/07/2026** | KQ-3 — tiêu chí `R-QDC-03` và pha A3 đã đổi sang *"bộ test mới khẳng định chéo cơ sở bị CHẶN"* |
| **M6** | `R-QDC-01` nghiệm thu không phủ cơ sở đã cấu hình | Kiệt + Luân | ✅ **đóng 29/07/2026** | KQ-3 — `R-QDC-01` nay đòi **xoá override cấp cơ sở** + mẫu số, không chỉ đổi hằng `default` |
| **M7** | Số dòng trong QĐ-C đã trôi khỏi mã | TGĐ | ✅ **đóng 31/07 — QĐ-E.7** | Đã đính chính tại chỗ trong `QUYET-DINH.md` |
| **M8** | `R-D2-09/10` nằm ở **cả** pha A8 lẫn nhánh B4 | TGĐ | ✅ **đóng 31/07 — QĐ-E.8** | Tách theo bản chất: A8 = thêm cột + backfill (additive); B4 = chuyển phép đọc |
| **§9 câu 8** | Vai trò pháp lý về dữ liệu | TGĐ + pháp chế | 🟡 **SƠ BỘ 31/07 — QĐ-E.9** | HO kiểm soát duy nhất + **một phụ lục mẫu chuẩn**/hợp đồng. Mở khoá **thiết kế** `R-DP-*`; Đ2 vẫn cần văn bản pháp chế trước khi mở cơ sở thật |

**Trạng thái 31/07/2026: 10/11 đóng + 1 sơ bộ (QĐ-E).** Chương trình **hết bị chặn bởi chữ ký** — nay bị chặn bởi **công suất**: đội còn **1 dev** (QĐ-E.5), nên câu hỏi hàng tuần đổi từ *"đã đóng mấy chốt"* sang *"Kiệt + agent đi được bao xa trên chặng 0"*.

**Thứ mở ra sau QĐ-E:** pha **A1 + A4** (từng là "chặn cứng số một") lập lịch được với điều kiện `R-OPS-02` trước/sau · làn B có điều kiện khởi động định nghĩa được (3 việc QĐ-B + 7 ngày sạch) · nhóm `R-DP-*` thiết kế được · TS-11-4 / TS-17-6 viết được kỳ vọng. **Thứ mới sinh ra:** gói **scope-FRANCHISE** (cỡ L — hệ quả của chọn `type=FRANCHISE`) và câu treo *"cắt việc nào của go-live"* (E.5).

---

## 6. Bốn runbook theo loại thay đổi

Quy ước giống runbook sẵn có: ghi rõ **mục tiêu · ai chạy · đường lui**. Agent **không có credential prod**.

### R1 — Chạy seed vai trò trên prod

> ⛔ **HIỆN TẠI ĐANG CẤM.** `[QS]` `prisma/seed-roles.ts:554` `deleteMany` → `:556` `createMany`, **không `$transaction`** (grep toàn file = 0). Prod đang enforce v2 ⇒ trong khoảng giữa hai lệnh, `RolePermission` của role đang seed là **rỗng** và mọi người giữ role đó **mất quyền**.
> ⚠️ Runbook `.github/workflows/seed-prod-roles.yml:10-11` vẫn ghi *"RBAC_V2 OFF nên seed này KHÔNG đổi hành vi"* — **câu đó đã hết hạn**, đừng tin.

**Điều kiện mở khoá:** KQ-0.1 xong (bọc `$transaction`) **và** TS-01-1 xanh sau khi đã từng đỏ.

Sau khi mở khoá:
1. Báo trước cho người trực (seed vẫn khoá ghi trong khoảnh khắc).
2. Chạy workflow `seed-prod-roles.yml` (chạy tay, `workflow_dispatch`). Người có quyền: chủ repo.
3. Kỳ vọng log: `✅ Seeded 14 RoleDef`.
4. **Sau seed:** cân nhắc TRUNCATE đồng hồ shadow — seed đổi mapping nên nền so sánh cũ không còn nghĩa.
5. **Đường lui:** chạy lại seed từ commit trước (idempotent). Instant Rollback **không** hoàn tác dữ liệu.

### R2 — Backfill dữ liệu (mọi thay đổi mang Cờ 2)

**Áp cho:** backfill `Curriculum.ownerOrgUnitId` (KQ-1) · nạp `centerId`/`orgUnitId` · xoá override `makeup.crossCenterEnabled` (KQ-3).

1. **Đo trước.** Chạy truy vấn chỉ-đọc, lưu kết quả — đây **là** dữ liệu hoàn tác. Không có bước này thì không có đường lui.
2. **Xem trước.** Lệnh phải có chế độ dry-run in ra *(bảng, id, giá trị cũ, giá trị mới)*. Copy kết quả ra ngoài.
3. **Điều phối Cờ 2.** Xác nhận với đợt security hardening trước khi ghi. ⚠️ **c31** (phạm vi đợt hardening) chưa trả lời ⇒ hiện chưa có tài liệu để đối chiếu; ghi lại việc đã hỏi ai và khi nào.
4. **Ghi.** Một lệnh, nguyên tử. Số dòng đổi phải **khớp** số dòng của bước 2.
5. **Nghiệm thu.** Chạy lại truy vấn bước 1 → khớp kỳ vọng, **kèm mẫu số**.
6. **Chạy lại lần hai** → không đổi gì thêm (idempotent).
7. **Đường lui:** khôi phục từ bản chụp bước 1, từng dòng. `[QS]` Backup Supabase có RPO 24h/RTO 4–8h — **không** dùng được cho việc lui một backfill vừa chạy.

> `[QS]` Mẫu tham chiếu đã có trong repo: `scripts/sql/phone-backfill.sql` (3 câu theo thứ tự bắt buộc: xem trước → ghi → nghiệm thu) và `scripts/phone-backfill.ts` (mặc định dry-run, phải `--apply` mới ghi).

### R3 — Gỡ ngoại lệ / siết phạm vi đọc

**Áp cho:** KQ-3 (`R-QDC-03` gỡ `MAKEUP_EXCEPTION_MODELS`) · KQ-2 (`R-D8-08`).

1. **Rà dữ liệu tồn trước** (`R-QDC-05`): ca bù chéo **đang mở** phải xử hết trước khi gỡ, nếu không chúng thành **không tra cứu được**.
2. **Đo mốc nền**: số ca bù chéo hiện có — con số này là **mốc so sánh duy nhất** sau khi audit `MAKEUP_CROSS_CENTER` ngừng sinh dòng.
3. Gỡ ngoại lệ **cùng lần phát hành** với việc xoá/viết lại `tests/e2e/r7/makeup-cross-center.spec.ts` — 3 ca khẳng định hành vi chéo cơ sở **phải đỏ hoặc biến mất** (TS-13-7).
4. **Nghiệm thu:** `grep MAKEUP_EXCEPTION` = 0 **và** bộ test mới khẳng định chéo cơ sở **bị CHẶN** — không dùng tiêu chí *"test cũ vẫn xanh"* (M3).
5. **Theo dõi sau phát hành:** học viên có buổi vắng **không được bù** trong N ngày, theo cơ sở. Tăng đột biến = nhu cầu đang chảy ra ngoài hệ thống (TC-10).
6. **Đường lui:** thuần code ⇒ Instant Rollback, giây. Nhưng dữ liệu đã xử ở bước 1 **không tự quay lại**.

### R4 — Thay đổi mang Cờ 1 (đụng hàm quyền động)

> Trong 12 kết quả, **không kết quả nào mang Cờ 1 = CÓ**. Runbook này để sẵn cho lúc ranh giới được gỡ.

1. Chụp **trước**: `R-OPS-02` — bảng *"tài khoản × quyết định"* trước khi đổi.
2. Phát hành.
3. Chụp **sau**, so hai bảng. Mọi ô đổi phải **giải thích được** bằng một dòng trong `lib/auth/rbac-intentional.ts`; ô nào không giải thích được = **lệch thật**, dừng lại.
4. Theo dõi `RbacShadowDiff` 48h: nhóm `action × v1 × v2` mới xuất hiện = việc chưa lường.
5. **Đường lui:** nếu qua env → đổi env + redeploy (**phút**, không phải giây). Nếu thuần code → Instant Rollback.

---

## 7. Bộ cảnh báo tối thiểu

Gộp từ `05-premortem.md` §7 và `07-roadmap.md` §7 — bản rút gọn để dựng ngay, mỗi dòng là một truy vấn hoặc một kiểm tra CI.

| Cảnh báo | Ngưỡng | Tần suất | Ai nhận |
|---|---|---|---|
| PR chạm `prisma/seed-roles.ts` mà chưa bọc `$transaction` | > 0 | mỗi PR | Luân |
| `seed-prod-roles.yml` chạy mà không báo trước | > 0 | mỗi tuần | Luân |
| Bản ghi `SCOPED_MODELS` có `centerId IS NULL` tạo mới | tăng so với tuần trước | mỗi tuần | Kiệt |
| `Center` không có `OrgUnit` trỏ tới | > 0 | CI | Kiệt |
| Bản ghi **mới** lệch hai trục trên 26 model | > 0 | CI | Kiệt |
| `UserPermissionGrant` có dòng nào | > 0 khi `can()` v2 chưa có nhánh DENY | mỗi tuần | Luân |
| Chuỗi `MAKEUP_EXCEPTION` xuất hiện lại sau khi A3 đóng | > 0 | mỗi PR | Kiệt |
| PR tách một gói ở §4 | > 0 | mỗi PR | Kiệt ↔ Luân |
| Học viên có buổi vắng **không được bù** trong N ngày | tăng đột biến so mốc nền | mỗi tuần | Quản lý cơ sở |
| Nhóm `action × v1 × v2` **mới** trong `RbacShadowDiff` | > 0 | mỗi tuần | Luân |

---

## 8. Ghi chú phát hành cho người không kỹ thuật — mẫu

Dùng cho BGĐ, kế toán, quản lý cơ sở. Nguyên tắc: **nói cái gì đổi với công việc của họ**, không nói mã `R-*`.

```markdown
### <Ngày> — <Tên kết quả>

**Từ hôm nay thay đổi gì với công việc của anh/chị**
- …

**Cái gì KHÔNG đổi**
- …

**Nếu thấy khác thường thì báo ai**
- …

**Số liệu chứng minh** (kèm mẫu số)
- …
```

**Ba kết quả trong 12 cái cần ghi chú kiểu này** (số còn lại không đổi thao tác của ai):

- **KQ-3** — quản lý cơ sở: *"gợi ý xếp học bù từ nay chỉ hiện buổi trong cùng cơ sở. Ca cần bù ở cơ sở khác phải xử lý tay và **báo lại**, vì hệ thống không còn tự ghi nhận."*
- **KQ-2** — giáo viên: *"link tài liệu không mở được nếu chưa đăng nhập, và link cũ đã lưu sẽ hết hạn."*
- **KQ-5** — người xếp lớp: *"không gán được giáo viên ngoài cơ sở, trừ khi có đợt điều động còn hạn."*

---

## 9. Sổ tay bàn giao — người mới đọc gì, theo thứ tự nào

`[SĐ]` Chương trình này sinh ra **9 tài liệu**; đọc sai thứ tự sẽ hiểu ngược. Thứ tự đúng:

1. **`QUYET-DINH.md`** — nguồn đúng nhất. Đọc trước mọi thứ. *(Kèm cảnh báo M7: một số số dòng đã trôi.)*
2. **`04-assumptions.md` §0** — hai tiền đề đã sai và đã đính chính. **Đọc §0 trước §1**; bỏ qua §0 sẽ tin nhầm rằng RBAC v2 còn tắt.
3. **`07-roadmap.md` §2 và §6** — cái gì lập lịch được, ranh giới ở đâu.
4. **`05-premortem.md` §3** — 12 dòng tóm tắt; đủ để không gây ra sự cố trong tuần đầu.
5. **`08-test-scenarios.md` §2 và §5** — lỗ hạ tầng test + bộ khuôn phủ định dùng chung.
6. Tài liệu này (§2 định nghĩa XONG · §4 luật phát hành · §6 runbook).
7. Còn lại đọc khi cần: `00-*.md` (hiện trạng đo được) · `01-intended-vs-implemented.md` (chấm D1–D12) · `02-prd-*.md` (112 yêu cầu) · `03-job-stories.md` · `06-redteam.md`.

**Ba điều một người mới rất dễ hiểu ngược** — nói trước mặt, đừng để họ tự vấp:

1. **RBAC v2 đang BẬT trên prod, nhưng TẮT ở local/dev.** Hành vi quyền ở máy dev **khác** prod (`lib/flags.ts:8` mặc định OFF).
2. **`scopedDb` chỉ tự động lọc ĐỌC.** Mọi `update`/`delete` phải tự kiểm; mọi `create` trên `SCOPED_MODELS` phải đặt `centerId`, quên là **bản ghi vô hình với chính người tạo**.
3. **Grant `DENY` hiện không có tác dụng và không báo lỗi.** Cần chặn quyền thì gỡ `UserOrgRole`.

---

## 10. Cái không có vật phẩm, và vì sao

1. **Toàn bộ làn B** — không runbook, không ghi chú phát hành, không kịch bản. Điều kiện khởi động không định nghĩa được (M2).
2. **Pha A1 và A4** — hai pha nặng ký nhất, vướng c43.
3. **Nhóm `R-DP-01..07`** (9 yêu cầu về dữ liệu cá nhân) — không nằm trong pha nào, chờ §9 câu 8.
4. **Ước lượng thời gian và nhân sự** — M4/c42 chưa trả lời; mọi con số ngày-công sẽ là số bịa.
5. **`.github/CODEOWNERS`** — cần biết ai sở hữu vùng nào, mà M4 chưa trả lời đội gồm ai.

---

## 11. Đóng chương trình

**Chín tài liệu đã sinh ra** (`docs/taicautruc/`):

| Bước | Tệp | Sản phẩm |
|---|---|---|
| 0 | `00-baseline.md` · `00-scope-gap.md` · `00-dryrun.md` | Hiện trạng đo được |
| 1 | `01-intended-vs-implemented.md` | Chấm D1–D12 |
| 2 | `02-prd-franchise-platform.md` | 112 yêu cầu |
| 3 | `03-job-stories.md` | 26 job story |
| 4 | `04-assumptions.md` | 84 giả định · 17 ô THÍ_NGHIỆM · **§0 đính chính 29/07** |
| 5 | `05-premortem.md` | 18 kịch bản hỏng · 4 mâu thuẫn M1–M4 |
| 6 | `06-redteam.md` | 13 tuyến tấn công · 3 mâu thuẫn M5–M7 |
| 7 | `07-roadmap.md` | 12 kết quả lập lịch được · ranh giới · M8 |
| 8 | `08-test-scenarios.md` | 72 kịch bản (42 phủ định) |
| 9 | *(tài liệu này)* | Định nghĩa XONG · khuôn PR · 4 luật phát hành · 4 runbook · bảng theo dõi chốt |

**Ba việc phải làm ngay, không chờ ai duyệt — ✅ ĐÃ XONG 29/07/2026:**

1. ✅ **Bọc `prisma/seed-roles.ts` trong `$transaction`** (`timeout` 30s / `maxWait` 10s). Kèm test vĩnh viễn `tests/e2e/a0/seed-roles-atomic.spec.ts` — 4 ca, chạy trong job CI `e2e-a0`. **Đã chứng minh test gác được hồi quy:** gỡ transaction ra thì `A0-02-T1-10` **đỏ** (`Expected: 4, Received: 0`), bọc lại thì xanh.
2. ✅ **Sửa header `.github/workflows/seed-prod-roles.yml`** — ghi rõ seed **đổi hành vi quyền ngay** (câu cũ *"RBAC_V2 OFF nên không đổi hành vi"* đã hết hạn lúc cờ được bật), phải báo trước, và sau khi chạy thì cân nhắc TRUNCATE lại đồng hồ shadow.
3. ✅ **Đóng M3 và M6** — `R-QDC-03` + pha A3 đổi sang *"bộ test mới khẳng định chéo cơ sở bị CHẶN"*; `R-QDC-01` nay đòi **xoá override cấp cơ sở** kèm mẫu số.

**Việc tiếp theo không chờ ai duyệt được nữa** — 9 chốt còn lại đều cần Ban, pháp chế, chủ đợt go-live RBAC, hoặc người giữ sổ quyết định/PRD.

**Một câu cho Ban:** chương trình có 12 kết quả sẵn sàng thi công và **11 chốt đang chờ chữ ký**. Trong 11 chốt đó, **c43** đắt nhất — nó đang chặn đúng việc mà PRD gọi là *"chặn cứng số một của toàn chương trình"*. Mọi con số tiến độ kỹ thuật báo lên trước khi c43 được cắt đều sẽ **lạc quan hơn sự thật**.

---

Bước này không sửa bất kỳ file nào khác ngoài E:/satarobo-vn/docs/taicautruc/09-shipping-artifacts.md.
