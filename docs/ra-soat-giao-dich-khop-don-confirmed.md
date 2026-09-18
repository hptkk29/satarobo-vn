# Rà soát: 7 giao dịch khớp đơn ĐÃ CHỐT nhưng tiền còn treo UNMATCHED

> **Trạng thái:** CHỈ ĐỌC — chưa sửa gì. Giao kế toán rà.
> **Nguồn số:** workflow *"Đối soát tiền · PROD · ĐỌC"*, mục **A2 nhóm 2**, run
> [`35299370306`](https://github.com/hptkk29/satarobo-vn/actions/runs/35299370306), đo prod
> 18/09/2026.
> **Tạo file này theo yêu cầu chủ dự án 18/09/2026.** Không phải một lệnh, không phải một bản vá.

## Việc cần người quyết

7 giao dịch này **bóc được SĐT**, **SĐT khớp đúng một đơn**, nhưng đơn ấy đang `CONFIRMED` và
**không còn phiếu thu `PENDING`/`PARTIAL`** nào. Nghĩa là hệ thống không có chỗ hợp lệ để rót
tiền vào, nên nó để tiền ở `UNMATCHED` — **đúng hành vi fail-closed**, không phải lỗi.

Nhưng nó cũng có nghĩa là **28.472.000đ tiền thật đang không thuộc đơn nào**. Hai khả năng, và
chỉ người đọc sao kê phân biệt được:

1. **Khách chuyển thêm / chuyển trùng** sau khi đơn đã đủ tiền ⇒ tiền THỪA, phải hoàn hoặc ghi
   nhận cho khoá sau.
2. **Đơn được chốt bằng đường khác** (ghi tay / backfill dữ liệu cũ) trong khi tiền thật về sau
   ⇒ đang **ghi hai lần** cho cùng một khoản học phí.

⚠️ Hai khả năng ấy đòi hai hành động **trái ngược** (hoàn tiền vs sửa sổ), nên đừng xử lý hàng
loạt. Từng dòng một.

## Danh sách đầy đủ

| # | Mã giao dịch | Ngày | Số tiền | Đơn khớp | Trạng thái đơn | SĐT (4 số cuối) |
|---|---|---|---|---|---|---|
| 1 | `FT26218807774118` | 2026-08-06 | 2.896.000đ | `ORD-260913-000040` | CONFIRMED | ••••••6534 |
| 2 | `FT26227200335035` | 2026-08-15 | 5.040.000đ | `ORD-260913-000096` | CONFIRMED | ••••••7459 |
| 3 | `FT26241408370455` | 2026-08-29 | 3.360.000đ | `ORD-260913-000008` | CONFIRMED | ••••••1365 |
| 4 | `FT26241026021458` | 2026-08-29 | 4.896.000đ | `ORD-260913-000040` | CONFIRMED | ••••••6534 |
| 5 | `FT26243403308247` | 2026-08-30 | 4.000.000đ | `ORD-260913-000015` | CONFIRMED | ••••••9107 |
| 6 | `FT26246061190790` | 2026-09-03 | 3.960.000đ | `ORD-260913-000016` | CONFIRMED | ••••••5108 |
| 7 | `FT26248390752843` | 2026-09-05 | 4.320.000đ | `ORD-260913-000044` | CONFIRMED | ••••••5366 |

**Tổng: 7 giao dịch · 28.472.000đ.**

## Dòng phải soi TRƯỚC

**`ORD-260913-000040` nhận HAI lần chuyển** — dòng 1 và dòng 4, cùng SĐT `••••••6534`:

    2026-08-06   2.896.000đ
    2026-08-29   4.896.000đ
    ────────────────────────
                 7.792.000đ

Hai lần chuyển cách nhau 23 ngày cho **cùng một đơn đã chốt**. Đây là dòng dễ ra kết luận nhất
(đóng hai đợt? hay đóng trùng?), nên soi nó trước rồi dùng kết quả làm khuôn cho 5 dòng còn lại.

## Câu SQL để kế toán tự tra (CHỈ ĐỌC)

Chạy trên Supabase SQL Editor. Nó **không sửa gì**.

```sql
-- Đơn khớp: đã thu bao nhiêu, phiếu thu còn gì
SELECT o.code,
       o.status,
       o."totalAmount"                                        AS tong_don,
       COALESCE(SUM(p.amount) FILTER (WHERE p."accountantStatus" = 'CONFIRMED'
                                        AND p."deletedAt" IS NULL), 0) AS da_thu_xac_nhan,
       COUNT(DISTINCT pr.id) FILTER (WHERE pr.status IN ('PENDING','PARTIAL')) AS phieu_dang_mo
FROM "Order" o
LEFT JOIN "Payment"        p  ON p."orderId" = o.id
LEFT JOIN "PaymentRequest" pr ON pr."orderId" = o.id
WHERE o.code IN ('ORD-260913-000040','ORD-260913-000096','ORD-260913-000008',
                 'ORD-260913-000015','ORD-260913-000016','ORD-260913-000044')
GROUP BY o.code, o.status, o."totalAmount"
ORDER BY o.code;
```

```sql
-- Bảy giao dịch: xem nguyên trạng, kèm nội dung CK (chỉ kế toán đọc, ĐỪNG dán ra ngoài)
SELECT "providerTxnId", provider, amount, "transferredAt", status, content
FROM "BankTransaction"
WHERE "providerTxnId" IN ('FT26218807774118','FT26227200335035','FT26241408370455',
                          'FT26241026021458','FT26243403308247','FT26246061190790',
                          'FT26248390752843')
ORDER BY "transferredAt";
```

## Cái file này KHÔNG nói

- **Không** nói dòng nào là tiền thừa, dòng nào là ghi hai lần. Nó chỉ nói *hệ thống không tìm
  được chỗ hợp lệ để rót*.
- **Không** đề xuất tự động gắn 7 giao dịch này vào đơn. Đơn đã `CONFIRMED` và hết phiếu mở;
  gắn thêm là tạo ra "thu vượt" trên một đơn đã đóng, tức chuyển một việc kế toán thành một
  con số sai trong sổ.
- Ba dòng còn lại của cùng lô (nhóm 3, **4 giao dịch / 25.388.000đ**) là việc **sale tra tay**
  — SĐT người chuyển không khớp đơn/lead/học viên nào. Nằm ở mục A2 nhóm 3 của cùng báo cáo.
