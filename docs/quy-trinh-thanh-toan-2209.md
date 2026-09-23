# Quy trình thanh toán — kế hoạch thực hiện [22/09/2026]

> Nguồn: 5 yêu cầu của chủ dự án ngày 22/09/2026 + phép đo hiện trạng repo cùng ngày
> (45 agent đo song song trên mã nguồn thật, mọi khẳng định kèm `file:line`).
> Nhánh nền: `hptkk29/quy-trinh-thanh-toan-qly`, ngang bằng `origin/main` tại `cc1b267a`.

---

## 0. BẢNG KÝ — 2 quyết định cũ bị ĐẢO ở đợt này

Repo có luật: **AC/quyết định cũ chỉ chết khi có CHỮ KÝ** (`feedback_ac_chet_khi_co_chu_ky`).
Hai dòng dưới đây là chữ ký mới, chủ dự án chốt 22/09/2026.

| AC/QĐ chết | Ký ngày | Thay bằng | Ai | Nơi thi công |
|---|---|---|---|---|
| *"bỏ phần duyệt đơn hàng luôn, không cần duyệt chính sách giảm giá hay kế hoạch thanh toán"* (nhắc 3 lượt, `a99e777c` 13/09) | 22/09/2026 | Duyệt **THEO NGƯỠNG**: đơn ≤4 đợt và ≤1 ưu đãi/con chạy thẳng; vượt ngưỡng mới vào hàng chờ QLCS và bị chặn **xuất QR**. Tiền khách chuyển vào **LUÔN ghi sổ**, bất kể duyệt hay chưa. | Chủ dự án | GĐ 4 |
| *"siết vai Quản lý cơ sở — gỡ `settings:view` ở cả v1 lẫn v2"* (03/08, `lib/auth/rbac-intentional.ts:44-48`) | 22/09/2026 | **KHÔNG** trả `settings:view`. Tạo quyền HẸP `settings:view-center` + `settings:edit-center`, chỉ ghi được khoá `centerOverridable` của ĐÚNG cơ sở mình, hiện đúng 1 tab. | Chủ dự án | GĐ 3.2 |

⚠️ **Phạm vi đảo, ghi thành 3 dòng để lần sau không ai gộp lại làm một:**
1. LẤY LẠI: màn duyệt + luật trần đợt/ưu đãi + cổng chặn **xuất QR**.
2. **KHÔNG** lấy lại: cổng duyệt ở đường **nhận tiền** (`decideSepayAction` → MANUAL).
3. **KHÔNG** lấy lại: cặp cổng tự-chốt-đơn (`_actions.ts` + `payos-ingest.ts`).

---

## 1. TÁM QUYẾT ĐỊNH CHỐT 22/09

| # | Câu hỏi | Chốt |
|---|---|---|
| 1 | Re-land hay xây mới? | **Re-land CÓ CHỌN LỌC, mổ trên `test`** |
| 2 | Duyệt cái gì? | **CHỈ đơn vượt ngưỡng** |
| 3 | Đếm ưu đãi theo đơn vị nào? | **1 khoản mỗi DÒNG (mỗi con)** |
| 4 | Quyền cấu hình cho QLCS? | **Quyền HẸP mới + tab riêng** |
| 5 | Cọc có tính vào 4 đợt? | **Cọc RIÊNG, ngoài 4 đợt — tối đa 5 dòng** |
| 6 | "Sale của lead" là cột nào? | **`Lead.assignedToId`** (người CHĂM) |
| 7 | Trần áp cho đơn nào? | **Chỉ đơn MỚI**, đơn cũ giữ nguyên |
| 8 | Đo prod? | **Được — chỉ ĐỌC** |

---

## 2. HIỆN TRẠNG ĐÃ ĐO (không suy)

### 2.1 Thứ đã có sẵn — đừng xây lại

| Thứ | Ở đâu | Ghi chú |
|---|---|---|
| Cọc (phép tính) | `lib/payments/ke-hoach-dot.ts:216 chenCoc` | Bất biến Σ(cọc+đợt) = tổng đơn. Chốt 14/09 |
| Prefill lead → đơn | `app/(admin)/admin/orders/new/page.tsx:44-63` | tên · SĐT · email · cơ sở · **danh sách con** |
| `Order.leadId` | `prisma/schema.prisma:4050` | có index |
| Phiếu thu theo TỪNG CON | `PaymentRequest.orderItemId` | 16/09, kèm 2 partial unique index viết tay |
| QR theo từng đợt của từng con | `_qr-core.ts:493` + `due-now.ts` | `QrSession` + `matchKey` |
| Setting 2 tầng | `SystemSetting` + `CenterSetting` + `centerOverridable` | 91 khoá, 36 khoá đã centerOverridable |
| Quyền duyệt | `seed-roles.ts:602,611` (CENTER_MANAGER), `:122,124` (HO_ACCOUNTANT) | **VẪN CÒN SEED** — không phải seed lại |
| Cách ly cơ sở trên màn duyệt | màn cũ đã dùng `scopedDb(actor)` | khôi phục là xong |
| Khu vực (REGION) | enum + seed node `DANANG` | vai neo ở REGION → `visibleCenterIds=[CS1,CS2]`, **không** bật `isHoLevel` |
| `Receipt` + mã RCP + PDF | `lib/finance/receipt.ts`, `payments/[id]/phieu-thu/route.ts` | đã chạy thật |
| Hạ tầng thông báo nhân sự | `lib/notifications/catalog.ts` + `WebPushOutbox` + 3 cron | có sẵn `payment-reconcile:*` làm mẫu |

### 2.2 Thứ CHƯA có / đang sai

| Thứ | Đo được |
|---|---|
| Trần số đợt | `TRAN_SO_DOT = 12` (`ke-hoach-dot.ts:26`) — hằng CỨNG, enforce 4 chỗ. Không có tham số vận hành nào cho số đợt, **kể cả trên `origin/test`** |
| Trần số ưu đãi | `TRAN_KHOAN_GIAM_MOI_DONG = 5` (`giam-gia-dong.ts:35`) — hằng CỨNG, đếm theo DÒNG |
| Cờ `laCoc` | **KHÔNG lưu xuống DB** — `OrderInstallment` không có cột. Lưu xong màn hiện "Đợt 1" thay vì "Cọc" |
| Màn duyệt | XOÁ 13/09 (`a99e777c`). Lấy lại bằng `git show a99e777c^:<path>` — **không có trên `origin/test`** |
| Đường ghi CenterSetting | `saveCenterSettingAction` có **0 đường gọi từ giao diện** — hôm nay chỉ đặt được bằng SQL tay |
| `settings:view` | **0 dòng khai** trong `seed-roles.ts` ⇒ prod chỉ SUPER_ADMIN mở được |
| Địa chỉ/CCCD của khách | `Lead` trên `main` **không có** `city`/`ward`/`addressLine`. **Thiếu địa chỉ là điều kiện CHẶN xuất hoá đơn** (`lib/finance/hoa-don/nguoi-mua.ts`) |
| Sửa thông tin khách sau khi tạo đơn | **Không có đường nào** — 7 cột `customer*` đóng băng vĩnh viễn. Chỉ 4 cột `invoice*` sửa được |
| Người thu qua QR/webhook | `recordedById: null` ⇒ ô "Người thu tiền" trên phiếu in **TRỐNG** |
| Thông báo kế toán | **0 lời gọi `notifyStaff`** trong `lib/finance/` + `lib/payments/` + `admin/payments/` |
| Model `Invoice` | không tồn tại. `lib/finance/hoa-don/` chỉ là phép tính thuần |
| Đính kèm email | `lib/email/` **không hỗ trợ attachment** (0 dòng khớp `attachment`) |
| `leadChildId` | sống trong `OrderItem.metadata` JSON — không cột, không FK, không index |

### 2.3 Lượt revert sáng nay đã cuốn đi thứ đang cần

`fcba089a` (22/09 **11:02**) gỡ **611 file / 89.306 dòng**. Còn nguyên trên `origin/test`
(nhánh cập nhật lúc **16:05** cùng ngày):

| File | Dòng | Phục vụ |
|---|---|---|
| `lib/finance/phieu-gop.ts` | 853 | **#3** — đường ghi DUY NHẤT của `PaymentBill` |
| `tests/finance/phieu-gop.test.ts` | 461 | bộ test của nó |
| `lib/orders/chinh-sach-uu-dai.ts` | 314 | **#1b** — chính sách ưu đãi đọc từ Cấu hình vận hành |
| `lib/orders/lead-child-link.ts` | 141 | **#3** — "khoản này của con nào" |
| `lib/payments/cap-phat-ma.ts` | 118 | dependency của `phieu-gop.ts` (`:41`) |

Bảng `PaymentBill`/`PaymentBillLine` **vẫn trong schema và đã apply trên DB prod** — nhưng
`main` có **0 đường ghi**. Nó là bảng chết.

⛔ **BẪY GỘP — đo bằng `git merge-tree`, không phải suy:**

```
lib/finance/phieu-gop.ts        ✓ CÓ    (git báo xung đột modify/delete)
lib/orders/chinh-sach-uu-dai.ts ✓ CÓ
lib/payments/cap-phat-ma.ts     ✗ MẤT IM LẶNG   ← phieu-gop.ts:41 IMPORT nó
lib/orders/lead-child-link.ts   ✗ MẤT IM LẶNG
tests/finance/phieu-gop.test.ts ✗ MẤT IM LẶNG
```

Vì `fcba089a` revert một **merge**, git coi 229 commit đó là ĐÃ GỘP.
`git rev-list --count origin/main..origin/test` = **62** (không phải 229).

### 2.4 CLAUDE.md đang SAI một chỗ — phải sửa

CLAUDE.md viết: *"Cổng chống lách duyệt **vẫn còn** … `payos-ingest.ts:1169-1181` vẫn từ chối
đẩy đơn sang `CONFIRMED` khi giảm giá chưa duyệt"*.

**Đo được là SAI**: `where` của `updateMany` nay chỉ còn `{ id, status: "PENDING_PAYMENT" }`;
mệnh đề OR đã bị chính `a99e777c` gỡ, chú thích **"⚠️ ĐÃ GỠ [14/09/2026]"** nằm ngay tại `:1285`.
→ Sửa CLAUDE.md ở GĐ 4.

---

## 3. BA CÁI BẪY — làm theo cách hiển nhiên thì hỏng

### Bẫy ① — Lỗ ghi sổ ở webhook VẪN MỞ, và CỌC làm tăng khả năng chạm

`app/api/public/webhook/sepay/route.ts:178` chỉ ghi sổ khi `action === "MANUAL" && !order`.
Ca **"MANUAL + tra RA đơn"** trượt cửa đó ⇒ **không `BankTransaction` (kể cả UNMATCHED),
không `PaymentRequest`/`Allocation`, không `Payment`** — tiền vào tài khoản ngân hàng, ba sổ trống.

Lượt gỡ duyệt 13/09 **chỉ bịt MỘT trong hai lối vào**. Lối còn lại vẫn sống:
`lib/payments/sepay.ts:128-133` — `amount < expected` → MANUAL (**trả thiếu**).

🔴 **Mà CỌC theo định nghĩa là trả ít hơn tổng.** Nên yêu cầu #1a làm tăng khả năng chạm
đúng lỗ này ⇒ **vá `route.ts:178` TRƯỚC khi làm cọc** (GĐ 2).

### Bẫy ② — `recordedById` gánh HAI nghĩa

| Nghĩa | Ai đọc |
|---|---|
| (a) tên in trên phiếu thu | `payments/[id]/phieu-thu/route.ts:196`, `payments/_actions.ts:297` |
| (b) vế trái cổng **tách nhiệm vụ** | `payments/_actions.ts:543`, `lib/finance/backfill-confirm.ts:76` |

Ghi đè `recordedById` = sale của lead ⇒ **kế toán tự xác nhận được khoản của chính mình**,
IM LẶNG (không lỗi, không test đỏ).

→ Cột MỚI `collectedById`. Hiển thị đọc `collectedById ?? recordedById`.
Cổng (b) **TUYỆT ĐỐI tiếp tục đọc `recordedById`**.

### Bẫy ③ — "học phần" có HAI nghĩa

`grep "học phần"` ra **101 dòng**. Chỉ **3** là nhãn kế hoạch thanh toán:

| Sửa | Dòng |
|---|---|
| ✅ | `orders/_components/ke-hoach-dot-editor.tsx:328` — `` `${n} học phần` `` |
| ✅ | `orders/_components/order-create-form.tsx:1123` |
| ✅ | `orders/_components/order-payment-section.tsx:223` |

**98 dòng còn lại KHÔNG ĐƯỢC ĐỔI:**
- chương trình học (`lib/lms/curriculum-sata.ts` — `moduleCode "HP1"`, `moduleName "Học phần 1"`,
  `attendance/page.tsx:252`, tab "Tài liệu học phần" của site GV, guides đã sinh);
- **ĐƠN VỊ BÁN** — `order-create-form.tsx:1671` *"…hoặc mua theo học phần"* là HelpHint của ô
  **Số buổi mua**, và `lib/orders/price-guard.ts:21-22` dựa vào nghĩa đó để quyết định chặn giá.

⛔ **TUYỆT ĐỐI KHÔNG `sed` toàn repo.** Giữ nguyên mọi chú thích (chúng giải thích SR.QD.219).

### Bẫy phụ — 9 đơn treo `PENDING_APPROVAL`

`bo-duyet.test.ts:16-17` ghi: 9 đơn đó *"đều đã COMPLETED + thu đủ"*.
⚠️ Đây là **CHÚ THÍCH, không phải bằng chứng** (luật đọc số) ⇒ **phải đo lại ở GĐ 0**.

Nếu đúng: bật hàng chờ mà không lọc theo trạng thái đơn thì QLCS mở ra thấy 9 đơn đã thu đủ
tiền; một cú bấm **"Từ chối"** chạy `revertInstallmentRequests` (VOID phiếu theo đợt + dựng
lại phiếu thu toàn đơn) **trên đơn đang giữ tiền thật**.

---

## 4. KẾ HOẠCH THEO GIAI ĐOẠN

> Luật áp cho MỌI giai đoạn chạm `lib/payments/**` · `lib/finance/**` · `app/api/public/webhook/**`:
> **BẮT BUỘC chạy bộ R7** hai shard, **HAI database**, **CHẠY LẦN LƯỢT** (song song ra đỏ giả
> 4+3 ca — đo 18/09), và **DÁN KẾT QUẢ vào báo cáo**.
> `.env.test` phải có `NEXTAUTH_SECRET` **≥32 ký tự** + `AUTH_SECRET` (kiểm bằng ĐỘ DÀI, không
> kiểm bằng sự có mặt — tái phát 2 lần).

### GĐ 0 — ĐO TRƯỚC KHI CODE · *(chặn mọi giai đoạn sau)*

**0.1 — Script chỉ-đọc + workflow đếm 4 con số trên prod** — ✅ **ĐÃ VIẾT [22/09/2026]**

| File | Vai trò |
|---|---|
| `scripts/bao-cao-nguong-thanh-toan.ts` | script đo, **không chứa một lệnh ghi nào** |
| `.github/workflows/nguong-thanh-toan-prod-chi-doc.yml` | workflow_dispatch, chỉ `main`, chỉ secret `PROD_DATABASE_URL_RO` |
| `lib/finance/bao-cao-nguong-thanh-toan.test.ts` | lưới `[NTT-01..05]` — 22 ca, đã cấy thử 6 lỗi |

**Cách chạy:**
1. Merge PR (chỉ 3 file trên + tài liệu này — **không có mã sản phẩm**) vào `main`.
   `deploy.yml` sẽ chạy `prisma migrate deploy`; không có migration mới nên đó là no-op.
2. GitHub → **Actions** → *"Ngưỡng thanh toán · PROD · ĐỌC (chỉ đọc — không ghi gì)"* → **Run workflow**.
3. Đọc kết quả ở **job summary** (hoặc artifact `bao-cao-nguong-thanh-toan`, giữ 3 ngày).
4. Dán 4 con số vào §7 bên dưới.

⚠️ **Workflow chỉ chạy trên `main`** (cùng khuôn với 2 workflow đọc-prod sẵn có): báo cáo phải
đọc prod bằng đúng `schema.prisma` đang chạy trên prod. Chạy từ nhánh feature có migration chưa
lên là Prisma ném `P2022` giữa chừng (đã xảy ra 07/09 với `ClassSession.rosterSize`).

⚠️ Secret `PROD_DATABASE_URL_RO` phải là **Session pooler cổng 5432**, user có hậu tố
`.<mã dự án>`. Cổng 6543 (Transaction pooler) không giữ prepared statement ⇒ script chết giữa
chừng. Workflow kiểm hình dạng chuỗi **trước** khi chạm DB và báo đúng chỗ sai mà không in secret.

| # | Đếm gì | Quyết định nó chi phối |
|---|---|---|
| ① | Đơn đang mở có **>4 đợt** | quy mô hàng chờ · có nên đảo QĐ#7 không |
| ② | Đơn có dòng **>1 ưu đãi** | quy mô hàng chờ |
| ③ | Đơn `discountApprovalStatus = PENDING_APPROVAL` + trạng thái đơn | 9 đơn treo — đóng sổ trước khi bật màn |
| ④ | `Payment` có `Order.leadId IS NULL` | quy mô backfill người thu + quy tắc fallback |

⚠️ **Đính chính CLAUDE.md:** mục *"NỢ ĐANG GHIM: `scripts/_kiem-quyen.ts` hỏi quyền trên SAI
BẢNG"* nói vá đúng là thêm tham số bảng *"để `tsc` liệt kê **cả hai** chỗ gọi"*. Đo 22/09:
**24 chỗ gọi**, không phải 2. Thêm tham số bắt buộc là chạm 24 tệp + phải chạy lại cả workflow
chấm công ⇒ **ticket riêng, không nhét vào đợt này**.

Script đo của đợt này xử lý bằng cách **tự kiểm tại chỗ**: `kiemQuyen()` dùng chung vẫn dùng cho
vế *"kết nối này có quyền GHI không"* (vai đầy quyền có UPDATE trên MỌI bảng ⇒ `ClassSession` đủ
để lộ ra secret đặt nhầm), còn vế *"ĐỌC được không"* hỏi trên đúng 5 bảng nó đọc — vì một dòng
tự khai nói về bảng khác thì tệ hơn không có dòng nào.

**0.2 — Liệt kê 229 commit theo nhóm** (tiền / lead / dashboard / chấm công / khác) kèm file,
để chủ dự án chỉ mặt nhóm cần LOẠI trước khi re-land.

**Đầu ra:** 1 báo cáo số + 1 bảng nhóm commit. **Không commit mã sản phẩm nào.**

---

### GĐ 1 — RE-LAND CÓ CHỌN LỌC *(mổ trên `test`, không mổ trên `main`)*

> 🔸 **ĐANG LÀM Ở PHIÊN KHÁC [22/09/2026].** Chủ dự án đã chốt nhóm re-land ở một phiên riêng ⇒
> **phiên nào đọc tài liệu này thì ĐỪNG thực hiện GĐ 1**, tránh hai nhánh re-land song song.
> Phần dưới giữ lại làm hồ sơ: nó ghi công thức đúng và cái bẫy mà lượt gộp trần sẽ dính.

Công thức đã kiểm chứng, ghi sẵn trong chính `fcba089a`:

```bash
git checkout -b release/re-land-2209 origin/main
git revert --no-edit fcba089a      # 229 commit quay lại
git merge origin/test              # 62 commit mới
# → LOẠI riêng nhóm lead/dashboard chủ dự án đã từ chối (theo bảng 0.2)
```

⛔ **KHÔNG dùng `git merge origin/test` trần** — `cap-phat-ma.ts` mất im lặng, `phieu-gop.ts:41`
import nó ⇒ `tsc` đỏ (may là đỏ; nếu là file không import thì mất câm).

**Mang về:** `phieu-gop.ts` · `cap-phat-ma.ts` · `chinh-sach-uu-dai.ts` · `lead-child-link.ts` ·
`tests/finance/phieu-gop.test.ts` · phần `registry.ts` bị gỡ (26 khoá, gồm `billing.sibling*`).

**Để nguyên (đã từ chối):** trang chi tiết lead mới · dashboard chưa xong · PR thừa của phiên khác.

**Cổng ra:** `tsc` xanh · `pnpm lint` 0 error 0 warning · `test:unit` · **R7 hai shard** ·
nghiệm thu trên `test.satarobo.vn`.

> ⚠️ `test.satarobo.vn` và máy local **DÙNG CHUNG một DB** (chủ dự án xác nhận 01/08 là cố ý).
> ⚠️ ZNS thật **không test được** trên `test` — luôn `SIMULATED`.

---

### GĐ 2 — VÁ LỖ GHI SỔ *(chặn cứng, phải xong TRƯỚC GĐ 3.4)*

**Việc:** `app/api/public/webhook/sepay/route.ts:178` — ghi `BankTransaction` (UNMATCHED) cho
**MỌI** ca `MANUAL`, kể cả khi đã tra ra đơn. Tiền vào là phải có dấu vết, bất kể quyết định.

**Vì sao trước GĐ 3.4:** cọc = trả thiếu = rơi đúng nhánh `sepay.ts:128-133` đang mở.

**Cổng test (luật 8 — 4 bước, không bỏ bước 3):**
1. viết ca "khách chuyển thiếu vào đơn tra ra được ⇒ có `BankTransaction` UNMATCHED";
2. **hoàn nguyên bản vá, chạy lại, chứng minh ca ĐỎ**;
3. khôi phục bản vá, ca XANH;
4. dán output đỏ vào commit message.

**R7 bắt buộc** (chạm `app/api/public/webhook/**`).

---

### GĐ 3 — TRẦN + CẤU HÌNH *(yêu cầu #1a, #1b, #1d)*

**3.1 — Hai khoá tham số vận hành mới** (`lib/settings/registry.ts` + nhãn ở `nhan-van-hanh.ts`)

```
orders.maxInstallments   int, mặc định 4, centerOverridable: true
orders.maxDiscountItems  int, mặc định 1, centerOverridable: true
```

- Khuôn có sẵn: `orders.maxDiscountPercent` (`registry.ts:257`).
- **GIỮ** `TRAN_SO_DOT = 12` và `TRAN_KHOAN_GIAM_MOI_DONG = 5` làm **TRẦN KỸ THUẬT** (SR.QD.219
  Điều 2 cho 12 kỳ). Ngưỡng chính sách (4 / 1) nằm **BÊN TRONG** nó.
- ⚠️ `lib/validators/order.ts:226` là `.max(TRAN_SO_DOT)` ở tầng **Zod — không chạm DB được**.
  Hạ thẳng hằng xuống 4 thì **mọi đơn cũ >4 đợt hết sửa được, kể cả sửa một dòng ghi chú**.
  ⇒ validator giữ trần kỹ thuật 12; ngưỡng chính sách kiểm ở **tầng action**.
- ⚠️ `getSetting(key, { orgUnitId })` — **bỏ trống `orgUnitId` là chỉ đọc Global**. Mọi đường
  đọc phải truyền `orgUnitId` của đơn, nếu không override theo cơ sở **im lặng không ăn**.
- ⚠️ Cache **300 giây**: sửa bằng SQL tay không xoá cache ⇒ trễ tới 5 phút. Đi qua
  `setCenterSetting` thì xoá ngay.

**3.2 — Quyền hẹp + tab riêng + ĐƯỜNG GHI** *(đảo QĐ 03/08 — xem §0)*
- `settings:view-center` + `settings:edit-center` trong `prisma/seed-roles.ts` **và**
  `lib/auth/permissions.ts` (local/dev chạy v1, prod chạy v2 — **phải sửa CẢ HAI**).
- **Seed `scopeType: "GLOBAL"`** — seed CENTER là prod đá hết còn local vẫn xanh (memory đã ghim).
  Cách ly cơ sở do `setCenterSetting` lo, không do scopeType.
- Tab **"Cấu hình cơ sở"** hiện đúng 2 khoá trên, cho đúng cơ sở của QLCS.
  Không hiện OTP · ZNS · VAPID · hoa hồng · 87 khoá còn lại.
- 🔴 **Phải XÂY đường ghi**: `saveCenterSettingAction` hôm nay có **0 đường gọi từ giao diện**
  (kể cả trên `origin/test`).
- ⛔ **SAU KHI MERGE LÊN `main` PHẢI BẤM `seed-prod-roles.yml`** — RBAC v2 đọc động từ DB,
  merge file seed **KHÔNG đổi gì trên prod**.

**3.3 — Hàm thuần `lib/orders/nguong-duyet.ts`**
- Trả lời "đơn này có phải duyệt không" từ: số đợt mỗi con · số khoản giảm mỗi dòng · 2 ngưỡng.
- **KHÔNG `import "server-only"`** — form tạo đơn (client) và server action phải ra **CÙNG một
  câu trả lời**; hai bản cài đặt là hai câu trả lời (bài học đầu `giam-gia-dong.ts`).
- ⚠️ **Tham số ngưỡng BẮT BUỘC, không mặc định** (luật 7). Mặc định ở đây nguy hiểm theo chiều
  **NỚI**: hạ trần về 1 mà một chỗ gọi quên truyền thì chỗ đó vẫn cho tới 5 — **fail OPEN**.
- Ngưỡng đếm **theo DÒNG** (mỗi con) — QĐ#3.
- Áp theo `Order.createdAt` so với mốc bật — QĐ#7.

**3.4 — Cọc lưu xuống DB** *(sau GĐ 2)*
- Cọc là dòng RIÊNG, **ngoài** 4 đợt, tối đa **5 dòng** — QĐ#5.
  Khớp sẵn với `soDotHocPhi = dots.filter(d => !d.laCoc).length` (`ke-hoach-dot-editor.tsx:82`)
  ⇒ **không phải sửa logic đếm**.
- ⛔ **KHÔNG dùng `installmentNo = 0` cho cọc** — số đó ĐÃ MANG NGHĨA *"thu toàn đơn"*
  (`schema.prisma:6287`), và `materializeInstallmentRequests` **VOID phiếu đó VÔ ĐIỀU KIỆN**
  ⇒ mất dấu tiền.
- ⇒ Cột mới `laCoc Boolean @default(false)` trên `OrderInstallment` (+ tương ứng trên
  `PaymentRequest`). **ADD COLUMN có DEFAULT — thuần thêm, không ALTER kiểu.**
- ⛔ **CẤM `prisma migrate dev`** (drift 14 bảng). Viết SQL tay
  `prisma/migrations/<yyyyMMddHHmmss>_installment_la_coc/migration.sql` + sửa `schema.prisma`
  cho khớp + `prisma migrate deploy` + `prisma generate` + **restart dev server**.
  Kiểm drift bằng công thức `--from-url` (**TUYỆT ĐỐI không `--from-migrations
  --shadow-database-url`** — lệnh đó RESET DB đích).
  Timestamp phải **LỚN HƠN** migration cuối trên **cả `origin/main` lẫn `origin/test`**.

**3.5 — Đổi 3 chuỗi "học phần" → "đợt"** — xem Bẫy ③. Đúng 3 dòng, không hơn.

**3.6 — Cổng số lượng cho `kiemTaoDot`** (`lib/finance/no-theo-con.ts`)
- Thêm 2 tham số **BẮT BUỘC**: `soDotHienCo` + `tranSoDot`; nhánh từ chối thứ 5.
- ⚠️ Đếm đúng TẬP: đợt của riêng con **và** đợt `orderItemId IS NULL` của đơn cũ
  (lặp lại bug `tongDotDangMoDon` nếu đếm thiếu).
- ⚠️ Đếm **TRONG transaction đang giữ advisory lock** (`taoDotChoCon`), không đọc ngoài khoá.
- ⚠️ **Cổng phải đứng TRƯỚC phép ghi đầu tiên**; trong `$transaction` từ chối = **`throw`**,
  `return` KHÔNG rollback.

---

### GĐ 4 — MÀN DUYỆT *(yêu cầu #1c)*

**4.1 — Khôi phục 6 file** (`git show a99e777c^:<path>` — **không có trên `origin/test`**):

```
app/(admin)/admin/orders/duyet/page.tsx                              149 dòng
app/(admin)/admin/orders/duyet/_actions.ts                           155
app/(admin)/admin/orders/duyet/_components/order-approval-card.tsx   271
app/(admin)/admin/orders/duyet/_components/order-approval-buttons.tsx 117
lib/orders/approval.ts                                               214
app/(admin)/admin/orders/_components/_installment-request-actions.ts  74
```
\+ mục sidebar (`components/admin/sidebar.tsx`, 11 dòng) + khối duyệt trên
`order-detail-client.tsx` (179 dòng) + `tests/e2e/r7/order-approval-merged.spec.ts` (360 dòng).

Nối lại 3 hàm CHẾT còn nguyên tại chỗ: `requestInstallmentApproval` (`installments.ts:660`) ·
`approveInstallmentPlan` (`:702`) · `rejectInstallmentPlan` (`:733`).

**4.2 — ĐỔI ĐIỀU KIỆN SINH HÀNG CHỜ** *(khác hẳn bản cũ)*
- Bản cũ: *"có giảm giá > 0 ⇒ duyệt"* (không ngưỡng).
- Bản mới: **`nguongDuyet()` của GĐ 3.3** — vượt trần mới vào hàng chờ.
- ⚠️ Chép về rồi **quên sửa điều kiện = mọi đơn có giảm giá kẹt hàng chờ**, sale không chốt được đơn nào.

**4.3 — Lọc hàng chờ theo trạng thái đơn** + đóng sổ đơn treo cũ (theo số đo GĐ 0.1 ③)
— xem Bẫy phụ.

**4.4 — Cổng chặn xuất QR: PHẢI CẮM CẢ HAI CỬA**

| Cửa | Ở đâu | Ghi chú |
|---|---|---|
| ① | `_qr-core.ts` — cạnh 3 cổng sẵn có ở `:408-410` | phủ cả `issueQrForRequestCore` **và** `regenerateQrCore` |
| ② | `orders/[id]/page.tsx:236` `buildVietQrImageUrl(...)` | 🔴 **dựng URL ảnh VietQR THẲNG**, không qua `_qr-core.ts`, không ghi `QrSession`, chỉ gác bằng `canViewPii` |

⛔ **Cắm một cửa là THỦNG.**

⚠️ **KHÔNG đụng `isInstallmentPlanActive`** (`lib/payments/installment-plan.ts`). Nó trả TRUE
cho `PENDING_APPROVAL` — đó là **bản vá 13/09** sửa bug *"khách phải đóng 2.500.000đ mà QR hiện
5.000.000đ"*. Đảo nó là làm bug đó sống lại, và nó còn được `installments.ts:515` dùng để quyết
định có ghi Ledger-A hay không ⇒ *"nhận tiền một đằng, ghi sổ một nẻo"*.
Cổng chặn QR là cổng **RIÊNG ở tầng action**.

**4.5 — Phạm vi khu vực × cơ sở**
- **Không viết code cây.** Màn cũ đã `scopedDb(actor)`; vai neo ở node REGION đã cho
  `visibleCenterIds=[CS1,CS2]` mà không bật `isHoLevel`.
- ⛔ **KHÔNG thêm REGION vào `DEFAULT_SELECTABLE_TYPES`** (`lib/org/org-tree.ts:172-178`):
  6 màn gọi `getSelectableOrgUnits()` không truyền `types` và ghi kết quả vào `centerId`;
  REGION có `centerId = null`, mà `centerId = NULL` ở nhiều bảng nghĩa là **"ÁP DỤNG TOÀN HỆ
  THỐNG"** ⇒ *"nghỉ lễ của Vùng Đà Nẵng"* lặng lẽ thành *"nghỉ lễ toàn hệ thống"*.
- ⛔ **KHÔNG viết `where: { orgUnitId }` tay** trong màn duyệt — vi phạm luật cứng #1
  (`no-inline-authz`, build fail).
- **Test PHẢI dựng fixture 2 khu vực × 2 cơ sở** để ca "không thấy khu vực kia" có nghĩa.
  Không cần tạo khu vực thứ hai trên prod.

**4.6 — Đảo `lib/orders/bo-duyet.test.ts` CÓ CHỮ KÝ**
Ca `[BD-01]` đang KHOÁ hành vi *"đường nhận tiền không hỏi duyệt"*. Hành vi đó **GIỮ NGUYÊN**
(xem §0 phạm vi đảo) ⇒ ca này **KHÔNG đảo**, chỉ **thêm chú thích** trỏ về bảng ký §0 để người
sau không khôi phục nhầm cổng ở đường tiền vì thấy nó "an toàn hơn".

**4.7 — Sửa CLAUDE.md** — xem §2.4. Sửa cả 4 chú thích khác trong mã lặp lại lời sai đó.

**R7 bắt buộc.**

---

### GĐ 5 — NGƯỜI THU *(yêu cầu #4)*

**5.1 — Cột mới `Payment.collectedById String?`**
Migration SQL tay (cùng luật GĐ 3.4). ADD COLUMN nullable — an toàn trên bảng có dữ liệu prod.

**5.2 — Hàm thuần `lib/payments/nguoi-thu.ts`**
- `suyNguoiThu({ leadAssignedToId, orderCreatedById })` → `Lead.assignedToId` (QĐ#6),
  chưa có thì `Order.createdById`, cũng null thì **để trống — KHÔNG đoán**.
- ⚠️ Fallback về `createdById` **im lặng sẽ tái tạo chính cái sai chủ dự án đang than**
  (admin tạo đơn thành người thu) ⇒ hiển thị phải **nói thật**: nhãn *"Thu qua chuyển khoản"*
  hoặc *"—"*, không ghi tên người tạo đơn như thể họ là người thu.
- Tham số **bắt buộc**, không mặc định (luật 7).
- ADR ghi rõ: cột này **CỐ Ý KHÁC** người hưởng hoa hồng (`Lead.convertedById`) — để lượt
  re-land cỗ máy hoa hồng không nối nhầm.

**5.3 — Nối 8 đường ghi + 2 đường SAO CHÉP**
⚠️ `refundPayment` (`payment.ts:1081`) và tách khoản theo con (`ghi-tien-don.ts:1072`) đều
**copy `recordedById` từ bút toán gốc** — quên khai `collectedById` ở hai chỗ đó là bút toán
hoàn/tách **mất tên người thu** trong khi bút toán gốc có.

⚠️ Trong `payos-ingest`: `select` **hẹp**, gom vào câu đọc order sẵn có — thêm round-trip WAN
vào `$transaction` đang chịu trần **5 giây** (tiền lệ `P2028`).

**5.4 — Hiển thị** đổi sang `collectedById ?? recordedById` ở
`payments/[id]/phieu-thu/route.ts:196` + `payments/_actions.ts:297`.
🔴 **Cổng tách nhiệm vụ (`_actions.ts:543`, `backfill-confirm.ts:76`) KHÔNG ĐỔI** — vẫn đọc
`recordedById`. Viết một ca test ghim điều này.

**5.5 — Backfill** cặp `scripts/backfill-nguoi-thu-{dry,apply}.ts` theo khuôn
`backfill-orderitem-*`: `--confirm=<mã>` · `--expect=<N>` lấy từ bảng đã duyệt · tự khai
`user=… ghi được CÓ/KHÔNG` · so số dòng **TRONG transaction** rồi `throw` để rollback nếu lệch.
Chỉ ghi `collectedById` (cột mới, chưa ai đọc) ⇒ **không đụng cổng tách nhiệm vụ**.

**R7 bắt buộc.**

---

### GĐ 6 — LIÊN KẾT DỮ LIỆU *(yêu cầu #2)*

Phần lớn **ĐÃ CÓ** (§2.1). Còn 2 lỗ:

**6.1 — Địa chỉ/CCCD trên Lead → prefill**
- `Lead.city` / `ward` / `addressLine` (+ cân nhắc `parentNationalId`).
- Bản trên `origin/test` đã có **cột + form**, **chưa có** vế nối vào prefill ⇒ phải tự viết vế đó.
- ⚠️ **Địa chỉ là PII.** Bản `test` bọc prefill bằng `canViewLeadPii()` và **cố ý để TRỐNG**
  thay vì điền bản che — điền bản che là tạo đơn mang tên *"Nguyễn T. L."*. **Giữ cổng đó.**
- Đây là thứ đang **CHẶN xuất hoá đơn** ⇒ phải xong trước GĐ 7.

**6.2 — Action sửa thông tin khách trên đơn**
- Khuôn có sẵn: `luuThongTinHoaDonAction` (optimistic-lock bằng `expectedUpdatedAt` +
  `passesScope` trước khi ghi). Ghi `AuditLog` — đây là dữ liệu pháp lý trên phiếu thu.
- 🔴 **KHOÁ ô SĐT khi đơn đã có `Payment`**: `customerPhone` là **khoá đối khớp ngân hàng**
  (`Order @@index([customerPhone])`, `bien-dong-so-du/_actions.ts:136`). Sửa SĐT của đơn đang
  có phiếu thu PENDING là làm giao dịch SePay **khớp sang đơn khác, hoặc hết khớp**.
- Đơn chưa có `Payment`: sửa thoải mái. Đơn đã có tiền: chỉ tên · email · địa chỉ · CCCD.

**6.3 — Chốt kiến trúc + ghi CLAUDE.md:** đơn là **BẢN CHỤP**, không phải bản tham chiếu.
Sửa lead **KHÔNG** lan sang đơn (đúng nghiệp vụ kế toán: phiếu thu đã in, hoá đơn GTGT đã phát
hành thì không được đổi người mua). Thay vì tự đồng bộ → hiện cảnh báo *"thông tin trên đơn
khác thông tin lead hiện tại"*.

**R7 bắt buộc** (6.2 chạm vùng tiền).

---

### GĐ 7 — KẾ TOÁN & HOÁ ĐƠN *(yêu cầu #5 — LÀM SAU CÙNG)*

> Chủ dự án: *"phần này làm sau cùng, để tôi nhập lại các đơn cũ trước."*

⚠️ **Thứ tự hiện tại NGƯỢC với mô tả**: `Receipt` **không** sinh lúc thanh toán thành công —
nó sinh như **hệ quả** của việc kế toán bấm `confirmPayment`, kể cả với tiền vào tự động qua
webhook (mọi đường ghi đặt `accountantStatus: "PENDING"`).

**Còn 4 câu phải chốt trước khi làm GĐ này** (hỏi lại khi tới lượt):
1. *"Xuất phiếu thu khi thanh toán thành công"* = tờ **PHIẾU THU CÓ SỐ** (RCP-…) hay **BIÊN
   NHẬN** gửi khách (thứ hệ thống đang gửi sẵn qua email/ZNS lúc đơn CONFIRMED)?
   → Đề xuất: giữ `Receipt` (số RCP) ở đúng chỗ hiện nay; thứ "xuất ngay khi tiền vào" gọi là
   **biên nhận**, dùng lại đường có sẵn. Như vậy #5 **không phải đụng vào sổ tiền**.
2. Một hoá đơn gắn vào **ĐƠN** hay **TỪNG PHIẾU THU**? (đơn 2 con × 4 đợt sinh tới 8 phiếu)
   → Đề xuất: gắn vào ĐƠN, quan hệ 1-n, mỗi hoá đơn tự khai nó ứng với phiếu thu nào.
3. Kế toán nào nhận thông báo? → Đề xuất: `CENTER_ACCOUNTANT` đúng cơ sở của đơn **+**
   `HO_ACCOUNTANT`. Một hàm phân giải duy nhất, đọc từ **`UserOrgRole`** chứ không đọc
   `User.roles[]` (prod v2 / dev v1 — đọc nhầm nguồn thì máy thấy đúng mà prod im lặng).
4. Gửi PH bằng **file đính kèm** hay **link tải có hạn**? Gửi tới `invoiceEmail` hay
   `customerEmail`?
   → Đề xuất: **link ký hạn** (`lib/storage/signed-url.ts` đã có) — vì `lib/email/`
   **không hỗ trợ attachment**. Ưu tiên `invoiceEmail`, trống mới rơi về `customerEmail`
   (đúng chú thích `schema.prisma:4042`).

**Việc đã biết chắc phải làm:**
- Model `Invoice` (chưa tồn tại) + cột file.
- Thông báo kế toán: thêm mục vào `lib/notifications/catalog.ts` (mẫu: `payment-reconcile:*`)
  \+ **thêm tiền tố vào allowlist push** (`push.tienToDuocDay` — không thêm thì ghi SKIPPED,
  không gửi) + đường sinh trong `lib/finance/`.
- Upload hoá đơn: ⚠️ kiểm quyền ký presign — `api/admin/upload-url/route.ts:40` gác bằng
  `media:upload-draft` + allowlist vai; **kế toán có thể 403 ngay ở presign**.

---

## 5. THỨ TỰ & PHỤ THUỘC

```
GĐ 0  ĐO ────────────────┬──────────────────────────────────────────┐
                         │                                          │
GĐ 1  RE-LAND ───────────┤ (mang về phieu-gop + chinh-sach-uu-dai)  │
                         │                                          │
GĐ 2  VÁ LỖ GHI SỔ ──────┤ ⛔ PHẢI xong trước 3.4 (cọc)             │
                         ▼                                          ▼
GĐ 3  TRẦN + CẤU HÌNH ──► GĐ 4  MÀN DUYỆT                    GĐ 5  NGƯỜI THU
      (3.3 nguong-duyet)        (dùng nguongDuyet của 3.3)    (độc lập)
                                      │
                                      ▼
                                GĐ 6  LIÊN KẾT DỮ LIỆU
                                      │ (6.1 mở khoá hoá đơn)
                                      ▼
                                GĐ 7  KẾ TOÁN & HOÁ ĐƠN  ← chờ chủ dự án nhập xong đơn cũ
```

GĐ 5 **độc lập**, chạy song song được với GĐ 3–4.

---

## 6. CỔNG RA CHUNG CHO MỌI GIAI ĐOẠN

- [ ] `pnpm typecheck` · `pnpm lint` (0 error **0 warning** trên file đụng tới) · `pnpm build`
- [ ] `pnpm test:unit` — **không** đụng DB (không có `ALLOW_DB_RESET=1`)
- [ ] **R7 hai shard, HAI database, CHẠY LẦN LƯỢT**, dán kết quả vào báo cáo
- [ ] Mỗi ca test mới **XANH khi chạy MỘT MÌNH** (luật 18)
- [ ] Test **không đọc đồng hồ thật** — truyền `now` (luật 19)
- [ ] Test canh lỗi phải **CẤY LẠI lỗi và thấy ĐỎ** rồi mới tin (luật 8) — dán output đỏ vào commit
- [ ] UI: smoke localhost + **mobile 375px**
- [ ] Migration: SQL tay · `ENABLE ROW LEVEL SECURITY` cho bảng mới · tên index theo quy ước
      Prisma · timestamp lớn hơn migration cuối trên **cả `main` lẫn `test`**
- [ ] Sau khi lên `main` mà có sửa `seed-roles.ts`: **BẤM `seed-prod-roles.yml`**
- [ ] Cập nhật tài liệu tương ứng, rồi **DỪNG** — không tự chuyển sang giai đoạn kế

---

## 7. SỐ CÒN THIẾU (điền sau GĐ 0.1)

| # | Câu | Số đo | Ngày |
|---|---|---|---|
| ① | Đơn đang mở có >4 đợt | *chưa đo* | |
| ② | Đơn có dòng >1 ưu đãi | *chưa đo* | |
| ③ | Đơn `PENDING_APPROVAL` + trạng thái | *chưa đo* (chú thích nói 9, **chú thích không phải bằng chứng**) | |
| ④ | `Payment` có `Order.leadId IS NULL` | *chưa đo* | |
