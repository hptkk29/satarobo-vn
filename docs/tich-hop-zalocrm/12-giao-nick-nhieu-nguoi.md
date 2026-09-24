# 12 — Giao một nick cho NHIỀU người, mỗi người một mức (24/09/2026)

> Trạng thái: **code xong, bốn cổng xanh, CHƯA lên prod.**
> Hai việc phải làm TAY sau khi merge — mục [Triển khai](#triển-khai) ở cuối. Bỏ sót việc
> thứ nhất thì quản lý cơ sở mở tab ra **404**; bỏ sót việc thứ hai thì mức phân quyền
> **không có hiệu lực** (mọi người vẫn ở mức `chat` như trước).

## Đổi cái gì

Trước 24/09 một nick giao được cho **đúng một người** (`ZaloCrmNick.sataUserId`), và bên
ZaloCRM mọi người được cấp đều nhận cứng mức `chat`.

Chủ dự án chốt mô hình thật:

| | |
|---|---|
| **Quản lý cơ sở** | ~~`admin` TỰ ĐỘNG~~ **[ĐẢO cuối ngày 24/09]** — nay là một dòng giao **như mọi người**: thêm/gỡ/đổi mức ngay trên màn. Xem mục dưới. |
| **Ai cũng giao tay được** | **MỌI nhân sự** của cơ sở nick đó — tư vấn viên, giáo vụ, giáo viên, kế toán… Chọn mức `read` / `chat` / `admin`. Một nick giao được cho nhiều người. |
| **Nick chưa giao ai** | chỉ **tư vấn viên + quản lý** của cơ sở dùng chung ở mức `chat` — trạng thái BÌNH THƯỜNG của nick mới, không phải việc còn bỏ dở. |

### 🔴 HAI TẬP NGƯỜI, ĐỪNG GỘP

|  | tập | dùng ở đâu |
|---|---|---|
| **Giao tay được** | mọi nhân sự của cơ sở, trừ `VAI_KHONG_THEM_DUOC_VAO_NICK` (phụ huynh) | ô "Thêm người" + cổng khi ghi |
| **Mặc định dùng được** | `VAI_DUOC_CAP_NICK` = Quản lý cơ sở · Tư vấn viên | chỉ khi nick **chưa giao ai** |

Gộp hai tập lại là **một lượt nới quyền im lặng**: mọi giáo viên, kế toán của cơ sở đọc
được **mọi nick chưa giao**, không ai bấm nút nào, không triệu chứng nào.
`[PVN-07]` · `[ZC-CQ-02d]` · `[ZC-CQ-03d]` canh đúng chỗ này, ở cả ba tầng.

### Ranh giới cơ sở GIỮ NGUYÊN, vế GỠ cũng vậy

Chủ dự án chốt (24/09): thêm được người **ngoài vai** nhưng **không** ngoài cơ sở, và
người rời cơ sở vẫn **tự rụng** ở lượt đối soát như trước.

### 🔴 QUẢN LÝ CƠ SỞ KHÔNG CÒN QUYỀN TỰ ĐỘNG — và hệ quả đã được cân nhắc

Chủ dự án: *"quản lý phân quyền của QLCS ở đây luôn chứ"*. Nhánh "`admin` tự động" trong
`pham-vi-nick.ts` **đã gỡ**. Nay:

- nick **CHƯA giao ai** → quản lý vẫn thấy (họ nằm trong `VAI_DUOC_CAP_NICK`), mức `chat`;
- nick **ĐÃ giao** → quản lý chỉ có quyền nếu **có tên trong danh sách**.

Hệ quả thật, đã nêu trước khi làm và chủ dự án chọn phương án này: **gỡ quản lý khỏi một
nick là họ không còn đọc được chat của nick đó.** Màn **cảnh báo ngay** khi danh sách có
người mà quản lý không có tên (`quanLyChuaThem`, ca `[NZ-08]`) — không để phát hiện lúc
sếp hỏi "sao tôi không thấy chat của khách".

#### Migration cutover `20260924160000` — chặn một lượt MẤT QUYỀN IM LẶNG

Gỡ nhánh mã mà không làm gì thêm thì **ngay lúc triển khai**, mọi nick đang có người được
giao sẽ rơi mất quản lý cơ sở — không ai bấm nút nào, không dòng nhật ký nào.

Chủ dự án chọn *"gỡ được quản lý khỏi nick"*, tức một **hành động có chủ ý trên màn**,
KHÔNG phải một lượt mất quyền do triển khai. Nên migration thêm dòng giao `admin` tường
minh cho quản lý của **những nick đã có người được giao** — giữ nguyên quyền tại thời
điểm cutover; từ đó việc thêm/gỡ là của người vận hành.

Nó **cố ý KHÔNG chạm** nick chưa giao ai: thêm dòng vào đó là biến "cả cơ sở dùng chung"
thành "chỉ quản lý", tức **cắt** quyền của tư vấn viên — đúng chiều ngược lại.
Ca `[ZCG-16]` chạy **chính tệp migration** trên Postgres thật, đo cả hai vế + tính lặp lại.

### ⚠️ Thêm được ≠ dùng được ngay

Chỉ **3 vai** giữ quyền `zalocrm:use` + ánh xạ vé SSO: Quản trị tối cao · Quản lý cơ sở ·
Tư vấn viên (Giáo vụ đã bị gỡ có chủ đích 13/09 — lý do ghi trong `seed-roles.ts`).

Thêm một giáo viên vào nick thì dòng giao **lưu được nhưng chưa có tác dụng**: không có
vé SSO ⇒ bên ZaloCRM chưa có tài khoản mang `externalId` ấy ⇒ lượt đối soát đếm vào
`chuaCoTaiKhoan` rồi bỏ qua. Màn **nói thẳng điều đó** ngay dưới tên người
(`dungDuocZalocrm`, ca `[ZCG-12]` + `[NZ-07]`) thay vì để người dùng bấm xong rồi tự hỏi.

Muốn dòng giao ấy có tác dụng thì phải cấp `zalocrm:use` cho vai đó trong
`prisma/seed-roles.ts` + chạy `seed-prod-roles.yml` — **một quyết định phân quyền riêng**,
không nằm trong đợt này.

Ba mức là mô hình **có sẵn của ZaloCRM**, không phải ta bịa:
`read` xem tin · `chat` gửi tin · `admin` quản lý nick
(`backend/src/modules/zalo/zalo-access-routes.ts` — `VALID_PERMISSIONS`).

## Đụng những đâu

| Tệp | Việc |
|---|---|
| `prisma/migrations/20260924120000_zalocrm_giao_nick_nhieu_nguoi/` | bảng `ZaloCrmNickGiao(nickId, sataUserId, mucQuyen)` + backfill từ cột cũ + bật RLS |
| `lib/integrations/zalocrm/pham-vi-nick.ts` | luật THUẦN "ai dùng được nick này, mức nào" + `NHAN_MUC` + `docMucQuyen` |
| `lib/integrations/zalocrm/giao-nick.ts` | `datGiaoNick` — ĐẶT CẢ TẬP, có cổng + giao dịch |
| `lib/integrations/zalocrm/cap-quyen-nick.ts` | lượt đối soát đọc bảng giao thay cho cột cũ |
| `lib/integrations/zalocrm/client.ts` | thân `PUT …/access` mang `access[]` **và** `externalIds[]` |
| `lib/integrations/zalocrm/nick-admin.ts` | `DongNick.giao[]` thay `sataUserId`/`sataUserName` |
| tab **Nick Zalo CRM** trong Cấu hình vận hành | bảng tóm tắt + hộp thoại chọn mức từng người |
| `app/(admin)/admin/tich-hop/` | cột "Sale sở hữu" → "Đang giao cho" |
| `E:\zalocrm\app\backend\src\modules\api\public-api-routes.ts` | endpoint nhận **cả hai dạng thân** |

### Cột cũ `ZaloCrmNick.sataUserId` — 2 pha, chưa drop

Migration **chép** cột cũ sang bảng mới ở mức `chat` rồi **giữ nguyên cột**. Không đường
nào đọc nó nữa; `datGiaoNick` vẫn ghi vào nó ở mức thô (đúng một người ⇒ id đó, khác đi ⇒
`NULL`) để lùi mã được. Drop cột là **một đợt riêng**, sau khi prod chạy ổn vài ngày.

## 🔴 Thứ tự triển khai KHÔNG còn quan trọng — và đó là việc có chủ đích

ZaloCRM chạy trong **container trên máy dev** (cloudflared `zalocrm.satarobo.vn` →
`localhost:3080`), Sata chạy trên **Vercel**. Hai bên **không lên cùng lúc được**.

- Bản ZaloCRM **cũ** chỉ đọc `externalIds`. Gặp thân chỉ có `access[]` ⇒ trả **400** ⇒
  **không cấp/gỡ cho ai**, 288 lượt/ngày, cho tới khi container được khởi động lại.
- Nên `client.ts` gửi **cả hai dạng trong cùng một thân**. Bản cũ chạy đúng như trước
  (mọi người mức `chat`), bản mới đọc `access[]` và dùng mức thật.

Xấu nhất khi lệch phiên bản là **"mức chưa có hiệu lực"**, không phải **"mất cả đường cấp
quyền"**. Khoá bằng ca `[ZC-CQ-02c]`.

> Bỏ `externalIds` khỏi thân được — **SAU KHI** chắc mọi bản ZaloCRM đang chạy đều đọc
> `access[]`. Đừng bỏ sớm.

## Triển khai

### ① Seed quyền trên prod — BẮT BUỘC, người vận hành bấm

Tab này gác bằng `zalocrm:manage-nick`. RBAC v2 đọc quyền **từ DB**, nên merge mã lên
`main` **không** đổi gì trên prod.

→ chạy workflow **`seed-prod-roles.yml`**. Không chạy thì Quản lý cơ sở mở tab ra 404
trong khi Quản trị tối cao thấy mọi thứ chạy tốt — đúng kiểu lỗi khó tin là lỗi.

### ② Khởi động lại container ZaloCRM — có NGẮT QUÃNG, chọn giờ

Ảnh đã build (`docker compose build app` → `app-app:latest`, xanh 24/09). Nhưng container
đang chạy là bản cũ, và **nó đang phục vụ người dùng thật** (`Up 2 days`).

```bash
cd /e/zalocrm/app && docker compose up -d app     # dừng ~10-20 giây
```

Trong lúc đó `zalocrm.satarobo.vn` không truy cập được → khung nhúng `/zalo-crm` trắng, và
webhook Zalo gửi vào sẽ **hỏng** (xem lại hàng đợi thử lại sau khi lên). Làm ngoài giờ
khách nhắn.

Chưa làm bước này thì mọi thứ **vẫn chạy**, chỉ là mức phân quyền chưa có tác dụng: bản cũ
đọc `externalIds` và cấp cho mọi người mức `chat` như trước 24/09.

### ③ Gán vai cho người thật (chủ dự án tự làm)

Mức chỉ có nghĩa khi người ta đã có vai ở đúng cơ sở:

- **Ms Trang** — `CENTER_MANAGER` tại **CS1** *và* tại **CS2** (hai dòng riêng ở
  `/users/<id>/org-roles`). Có đủ hai dòng thì Trang tự động `admin` trên nick của cả hai.
- **Ms Lộc**, **Ms Điều** — `CENTER_SALES_CSM` tại **CS1**. Rồi vào tab Nick Zalo CRM chọn
  mức cho từng người trên từng nick.

## Đã cấy lỗi để chứng minh lưới có răng (luật 8 + 14)

13 phép cấy, khôi phục byte-exact, so đúng tập mã ca đỏ:

| cấy | ca đỏ |
|---|---|
| QLCS mất `admin` tự động | `PVN-02` + 4 ca khác |
| bỏ nhánh "chưa giao ⇒ cả cơ sở" | `PVN-01` `PVN-04` + 7 ca |
| mức lạ rơi về `admin` thay vì `read` | `ZC-CQ-11d` |
| quên `giao` trong `select` | đủ 16 ca của bộ |
| client gửi lại dạng cũ | `ZC-CQ-02` |
| nhánh rỗng KHÔNG xoá gì | `ZCG-03` |
| gỡ cổng "người ngoài cơ sở" | `ZCG-05` |
| gỡ cổng "trùng người" | `ZCG-07` |
| xoá-rồi-tạo thay upsert | `ZCG-04` |
| `SelectTrigger` mất `aria-label` | `NZ-03` |
| lỗi lưu vẫn đóng hộp thoại | `NZ-06` |
| nhãn mức gõ tay | `NZ-04` |

Và 9 phép nữa cho lượt MỞ RỘNG (24/09, sau), **cả 9 đều đỏ đúng tập — không lưới nào chết**:

| cấy | ca đỏ |
|---|---|
| nhánh "chưa giao" lặp trên CẢ cơ sở | `PVN-01` `PVN-04` `PVN-07` `ZC-CQ-03d` |
| `macDinh` = `tatCa` (tầng DB-mock) | `ZC-CQ-03d` |
| `macDinh` = `tatCa` (DB thật) | `ZC-CQ-02` `ZC-CQ-02d` |
| bỏ hàng rào `PARENT` khỏi câu tra | `ZC-CQ-03` |
| bỏ hàng rào `PARENT` (DB thật) | `ZCG-11` `ZCG-14` |
| `VAI_KHONG_THEM_DUOC_VAO_NICK` rỗng | `VT-04` `ZC-CQ-03` |
| cờ `dungDuocZalocrm` luôn true | `ZCG-12` |
| gỡ khối cảnh báo khỏi màn | `NZ-07` |
| quay lại lối sentinel trong ô chọn | `NZ-01` |

Và 6 phép nữa cho lượt ĐẢO (quản lý cơ sở), **cả 6 đều đỏ**:

| cấy | ca đỏ |
|---|---|
| nhánh "quản lý admin tự động" quay lại | 13 ca, gồm `PVN-02` `ZC-CQ-11` |
| nhánh tự động quay lại (DB thật) | `ZCG-15` |
| màn lọc quản lý ra khỏi danh sách | `NZ-08` |
| gỡ lời cảnh báo "quản lý sẽ không đọc được" | `NZ-08` |
| migration: sai mắt join `Center`↔`OrgUnit` | `ZCG-16` |
| migration: chạm cả nick chưa giao | `ZCG-16` |

**Một giới hạn đo được, ghi vào chính ca test:** lưới ghim mã nguồn `[PVN-05]` chỉ bắt
dạng "đọc thẳng hằng `VAI_QUAN_LY_CO_SO`". Bản tái tạo nhánh bằng `t.macDinhDungDuoc`
(không nhắc hằng) **đi lọt qua nó** — và bị 13 ca HÀNH VI bắt. Kiểm riêng cho thấy
`[PVN-05]` vẫn bắt đúng dạng nó khai. Lưới hành vi là lưới gánh; lưới grep là chốt phụ.

**Một lỗi FIXTURE bị bắt trong lượt này:** `taoNguoi` của bộ DB cho MỌI người
`role: "SALES_CSM"` (vai v1), nên giáo viên hoá ra "mở được ZaloCRM" và `[ZCG-12]` đỏ vì
lý do đúng — fixture sai, không phải mã sai. `vaiZaloCrm` gộp CẢ HAI hệ tên vai (v1 ở
local, v2 trên prod), nên fixture phải mang hình dạng dữ liệu THẬT ở cả hai. Nay `vaiV1`
là tham số BẮT BUỘC (luật 7).

**Hai lưới CHẾT đã bị bắt và vá trong chính lượt này:**

1. `[NZ-04]` neo `>Chữ<` (nhãn giữa hai thẻ) nên **không thấy** nhãn gõ tay nằm trong một
   biểu thức JSX (`{m === "read" ? "Chỉ xem" : …}`) — giữa hai **dấu nháy**, không giữa
   hai thẻ. Vá bằng cách neo vào chính chuỗi. Cùng họ với S-1 của luật 14.
2. `[ZCG-03]`: phép cấy đầu tiên của tôi **viết ngược** (`notIn: [sentinel]` vẫn xoá hết
   chứ không phải không xoá gì) nên báo "lưới chết" nhầm. Cấy lại đúng
   (`{ sataUserId: { in: [] } }`) ⇒ ca đỏ thật. **Bài học: phép cấy cũng phải được kiểm** —
   một phép cấy sai kết tội một lưới đang khoẻ.

Và một phát hiện phụ: nhánh `if (idGui.length)` trong `datGiaoNick` **không phải** thứ làm
`[ZCG-03]` xanh hôm nay — Prisma 5.22 dịch `notIn: []` thành điều kiện luôn đúng nên cả
hai cách viết đều xoá hết. Nhánh ấy là phòng xa cho ngày Prisma đổi hành vi. Chú thích
trong mã nói đúng điều đó thay vì nhận công.
