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
| **Quản lý cơ sở** | `admin` **TỰ ĐỘNG** trên mọi nick của cơ sở mình. Không ai phải nhớ giao. Kiêm hai cơ sở thì với tới nick của cả hai. |
| **Tư vấn viên** | **giao tay**, chọn mức `read` / `chat` / `admin`. Một nick giao được cho nhiều người. |
| **Nick chưa giao ai** | cả cơ sở dùng chung ở mức `chat` — trạng thái BÌNH THƯỜNG của nick mới, không phải việc còn bỏ dở. |

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
