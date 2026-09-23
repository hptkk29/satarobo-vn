# Nghiệm thu NGẮN trên `test` — sau lượt gộp 109 commit (20/09/2026)

> Bản nghiệm thu đầy đủ 8 ca: [`05-nghiem-thu-vai-tren-test.md`](05-nghiem-thu-vai-tren-test.md).
> Bản này **KHÔNG thay thế** nó — chỉ chọn ra phần mà lượt gộp `main` → `test`
> (PR #300, merge `9d87e17a`) **có thể** chạm tới. Mọi ca không nêu ở đây thì kết quả cũ
> **giữ nguyên giá trị**.

## Chọn ca bằng BẰNG CHỨNG, không bằng cảm giác

Phép đo trên chính cây mã, không phải trí nhớ:

```bash
# 109 commit của `main` chạm bao nhiêu tệp ZaloCRM:
git diff --name-only e31a0cd9 origin/main | grep -icE "zalocrm|zalo-crm"   # → 0
# lượt GỘP chạm hạ tầng dùng chung nào:
git diff --name-only 87b382e0 origin/test | grep -E "sidebar|admin-shell|layout|permissions|seed-roles"
```

| kết quả đo | nghĩa |
|---|---|
| 109 commit chạm **0 tệp ZaloCRM** | lõi SSO · nút "Nhắn Zalo" · khung nhúng **không đổi một dòng** |
| lượt gộp **CÓ** đổi `sidebar.tsx` · `admin-shell.tsx` · `permissions.ts` · `seed-roles.ts` | mục menu và cổng quyền **cưỡi lên** những tệp này ⇒ phải kiểm lại |
| 109 commit dồn vào `lib/finance` (56) · `lib/payments` (35) · Lớp trial (23) · đơn hàng (28) | đây mới là **phần rủi ro thật**, và nó KHÔNG phải ZaloCRM |

## KHÔNG phải chạy lại — và vì sao

| ca | vì sao bỏ |
|---|---|
| ① ② SALE vào `/zalo-crm` | 0 tệp ZaloCRM bị chạm; đường SSO không đổi |
| ③ QLCS | như trên |
| ⑦ nút "Nhắn Zalo" | nút đọc `isZalocrmEnabled()` thẳng trong trang phiếu, không qua sidebar |
| ④ **vế b** (Giáo vụ gõ thẳng URL) | cổng trang là `checkPermission("zalocrm:use")`; đã kiểm bằng mã: quyền này thuộc ĐÚNG `SUPER_ADMIN` · `CENTER_MANAGER` · `CENTER_SALES_CSM`, `CENTER_CLASS_MANAGER` **không** có |
| ⑤ ⑥ | vẫn **CHƯA KIỂM ĐƯỢC** — thiếu org thứ hai bên fork (`NỢ-6`). Không đổi |

## PHẢI chạy — 5 ca

⏱️ Ước 12–15 phút. Không cần dựng dữ liệu mới; nếu buộc phải tạo gì thì ghi lại để xoá
(DB `test` là project riêng, nhưng vẫn là DB thật của môi trường nghiệm thu).

---

### A. Menu "Zalo CRM" vẫn hiện đúng vai — **kèm đối chứng dương**

> Vì sao chạy lại: lượt gộp đổi `sidebar.tsx` + `admin-shell.tsx`. Lưới `[SB-FLAG]` xanh
> và đã cấy đỏ, nhưng **nó soi MÃ NGUỒN, không soi màn đã deploy**.
>
> ⚠️ **Bắt buộc có đối chứng dương.** Lần 17/09 ca "Giáo vụ không thấy mục" ĐẠT vì lý do
> SAI — menu ẩn với **mọi** vai do đứt dây nối. Một ca chỉ khẳng định sự VẮNG MẶT luôn
> đạt khi tính năng hỏng hoàn toàn (luật 11).

| bước | đạt khi |
|---|---|
| 1. Đăng nhập **SALE #1 (CS1)** → nhìn sidebar | **CÓ** mục "Zalo CRM" ← *đối chứng dương* |
| 2. Đăng nhập **Giáo vụ** (`CENTER_CLASS_MANAGER`) → nhìn sidebar | **KHÔNG** có mục |

🔴 Hỏng nếu: bước 1 không thấy mục (dây nối lại đứt), hoặc bước 2 thấy mục (quyền rò).

---

### B. `/zalo-crm` mở được và hộp thư có nick — **ca MỚI, chưa ai chạy**

> `capQuyenKhiMoMan` (NỢ-9) merge ngày 18/09, **sau** lượt nghiệm thu ⑧. Chưa từng có
> người chạy trên `test`.

| bước | đạt khi |
|---|---|
| 1. Dùng một tài khoản **chưa từng vào `/zalo-crm` bao giờ** (vai SALE hoặc QLCS của CS1) | — |
| 2. Mở `/zalo-crm`, bấm giờ | màn mở **dưới ~3 giây**, không treo, không trắng |
| 3. Nhìn khối **PHẠM VI XEM** trong khung fork | thấy **≥ 1 nick**, KHÔNG phải `0 online · 0 offline` |

🔴 Hỏng nếu: phải chờ cron 5 phút mới thấy nick (cấp-quyền-khi-mở-màn không chạy), hoặc
màn treo/trắng (ràng buộc FAIL-SAFE thủng — lúc đó **chụp màn + báo ngay**, đừng thử lại).

> Nếu không còn tài khoản "chưa từng vào" nào, bỏ qua bước 3 và ghi "chưa kiểm được" —
> đừng tạo tài khoản mới chỉ để chạy ca này.

---

### C. 🔴 `/cong-no` — số công nợ nay là số RÒNG (NỢ-4) + bảng đối soát MỚI

> Đây là ca **quan trọng nhất** của lượt này: đụng TIỀN, và màn có thêm bảng mới từ `main`.

| bước | đạt khi |
|---|---|
| 1. Mở `/cong-no` bằng tài khoản kế toán/QLCS | trang lên, không lỗi |
| 2. Nhìn bảng công nợ cũ | số "còn nợ" hợp lý; **không** dòng nào nợ đúng bằng số vừa hoàn cho học viên đã nghỉ |
| 3. Nhìn bảng **ĐỐI SOÁT** (mới) — hai cột "đã ghi nhận" / "đã xác nhận" | cả hai cột có số; **không** cột nào rỗng toàn bộ |
| 4. Xem dòng **"chưa quy được về con"** | có mặt, có số (rỗng cũng được, nhưng phải có DÒNG) |

🔴 Hỏng nếu: cột "đã ghi nhận" rỗng hết (đúng lỗi `KHOAN_DA_GHI_NHAN` so chuỗi-với-đối-tượng
mà `main` đã vá — nếu tái hiện thì bản vá không sống sót lượt gộp).

---

### D. Tạo đơn hàng — form viết lại hoàn toàn từ `main`

> `order-create-form.tsx` bị `main` viết lại (+1659/−507 dòng): giảm giá khai theo **từng
> dòng**, và mỗi dòng tự chọn con. Cộng thêm bản vá NỢ-13 của lượt gộp.

| bước | đạt khi |
|---|---|
| 1. Mở `/orders/new?leadId=<một phiếu có ≥1 con>` | form lên, ô SĐT hiện dạng `09…` (không phải `84…`) |
| 2. Thêm **một dòng**, chọn khoá + chọn **con** trên chính dòng đó | chọn được, danh sách con lọc theo SĐT phụ huynh |
| 3. Khai một khoản **giảm giá trên dòng** + lý do | nhận; **không** báo lỗi "giảm giá nay khai theo TỪNG DÒNG" |
| 4. Lưu đơn | tạo được, về trang chi tiết đơn |

🔴 Hỏng nếu: không có chỗ chọn con trên dòng, hoặc lưu báo lỗi giảm giá.

> **Dọn:** đơn tạo ở bước 4 là dữ liệu thử — ghi lại mã đơn và báo tôi để xoá.

---

### E. Lớp trial — 23 tệp bị `main` đổi, và lượt gộp chạm `_actions.ts`

| bước | đạt khi |
|---|---|
| 1. Mở `/lop-trial` bằng tài khoản **không** có quyền xem SĐT (ví dụ Giáo vụ) | danh sách lên |
| 2. Gõ **một SĐT đầy đủ** vào ô tìm | **KHÔNG** ra kết quả theo SĐT ← cổng `canSearchPhone` |
| 3. Mở một buổi trial bất kỳ | SĐT phụ huynh hiện dạng **đã che** |

🔴 Hỏng nếu: tìm ra phiếu bằng SĐT, hoặc SĐT hiện nguyên. Đây là **rò PII**, báo ngay.

> Bước 2 là ca `[LOC-PII]` vừa thêm 18/09 — trước đó cổng này **có trong mã nhưng không
> có khoá test nào**, và lượt rà tìm ra bằng cách cấy lỗi.

---

## ✅ KẾT QUẢ ĐÃ CHẠY — 21/09/2026 (bản `9cb28cf9` trên `test`)

| ca | kết quả |
|---|---|
| **A** — menu "Zalo CRM" đúng vai | **ĐẠT** — SALE **thấy** mục, Giáo vụ **không thấy**. Có đủ đối chứng dương, nên lần này ca nói đúng điều nó nói (khác 17/09, khi nó đạt vì menu ẩn với mọi vai) |
| **B** — mở `/zalo-crm` có nick ngay | **CHƯA KIỂM ĐƯỢC** — không có tài khoản sạch; FAIL-SAFE đạt (màn mở bình thường, 2 nick, 100 hội thoại). Phép thử đầu-cuối dời sang ngày bật cờ trên prod, theo phép kiểm 2 của runbook `07`. |
| **C · D · E** | chưa chạy — phần tài chính, chủ dự án xếp làm sau |

#### Vì sao ca B KHÔNG được ghi ĐẠT

Tài khoản đã dùng là `uat.giamdoc` — **chính tài khoản đã đo ra `NỢ-9` hôm 17/09**, tức nó
đã vào `/zalo-crm` từ trước và bên fork đã có sẵn tài khoản, đã được cron cấp quyền.

Hai nick nhìn thấy vì thế chứng minh **quyền vẫn còn**, KHÔNG chứng minh
`capQuyenKhiMoMan` đã xoá khoảng trễ lần-đăng-nhập-đầu. Bước 1 của ca đòi *"tài khoản
chưa từng vào bao giờ"* đúng vì lý do này.

Ghi ĐẠT ở đây là lặp lại đúng bẫy của ca ④ hôm 17/09 — **đạt vì lý do sai** (luật 11).

#### Một thứ được xác nhận NGOÀI DỰ KIẾN

Ảnh chụp cho thấy khung nhúng chạy **chế độ desktop** và nạp đủ 100 hội thoại. Đó chính là
triệu chứng của `NỢ-7`: trước bản vá `min-w-[900px]`, fork khởi động ở chế độ mobile và
**không bao giờ** gọi `fetchZaloAccounts`, nên khối PHẠM VI XEM sẽ là `0 online · 0 offline`.
⇒ lưới `[ZC-KHUNG]` nay có **đối chứng trên bản đã deploy**, không chỉ trên mã nguồn.

## Ghi kết quả

Với mỗi ca: **ĐẠT** / **HỎNG** + chụp màn nếu hỏng. Ca B nếu không có tài khoản phù hợp
thì ghi **"chưa kiểm được"** — đừng ghi ĐẠT.

⚠️ Ca nào HỎNG thì **dừng, đừng chạy tiếp** — báo tôi. Lượt gộp còn hoàn nguyên được
trước khi lên `main`; sau khi lên thì không.
