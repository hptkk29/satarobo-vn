# TRƯỚC / SAU — ba commit vá hoàn tiền (NỢ-4) sẽ đổi con số nào trên prod

> **Chỉ ĐỌC.** Không câu nào trong tệp này ghi một dòng. Chạy ở Supabase SQL Editor của
> **PROD** (đường duy nhất chạm được DB prod — xem sổ tay).
>
> Chạy **TRƯỚC khi merge** `test` → `main`. Nếu bảng ra rỗng thì không ai thấy số nhảy và
> không phải báo ai. Nếu có dòng, **báo kế toán trước khi deploy**.

## Đổi cái gì, và vì sao số sẽ NHẢY

Ba commit: `fb707f97` · `2bb2641b` · `b1ac49c7`.

Chúng vá một bug thật: **tiền đã hoàn vẫn được tính là "đã đóng"**, nên công nợ hiển thị
THẤP hơn thực tế.

`refundPayment` (`lib/finance/payment.ts:1048`) ghi một dòng `Payment` **amount ÂM**, mang
`accountantStatus = 'REFUNDED'`. Dòng gốc giữ nguyên `CONFIRMED`.

| | Bộ lọc "đã đóng" | Hệ quả với đơn CÓ hoàn tiền |
|---|---|---|
| **TRƯỚC** (`main` hôm nay) | `accountantStatus = 'CONFIRMED'` | dòng âm bị **bỏ qua** ⇒ đã đóng quá cao ⇒ **còn nợ quá thấp** |
| **SAU** (`test`) | `accountantStatus IN ('CONFIRMED','REFUNDED')` | dòng âm được trừ ⇒ đã đóng đúng ⇒ **còn nợ TĂNG** |

**Ngoại lệ có chủ đích:** ghi danh đã **rời lớp** (`WITHDREW` · `TRANSFERRED` · `CANCELLED`)
thì dòng `REFUNDED` **vẫn bị loại** — em đã nghỉ thì khoản hoàn không làm em nợ lại. Với
nhóm này số **không đổi**.

⇒ **Chỉ đơn có khoản `REFUNDED` trên ghi danh CHƯA rời lớp mới đổi số.** Và luôn đổi theo
chiều **còn nợ tăng lên** — không đơn nào tự nhiên hết nợ.

---

## Câu 1 · Có đơn nào đổi không, và tổng bao nhiêu

```sql
WITH gd AS (
  SELECT e.id,
         e.status,
         COALESCE(e."finalPrice", 0)                                                   AS phai_thu,
         COALESCE(SUM(p.amount) FILTER (WHERE p."accountantStatus" = 'CONFIRMED'), 0)  AS tong_confirmed,
         COALESCE(SUM(p.amount) FILTER (WHERE p."accountantStatus" = 'REFUNDED'),  0)  AS tong_refunded
  FROM "Enrollment" e
  LEFT JOIN "Payment" p
         ON p."enrollmentId" = e.id
        AND p."deletedAt" IS NULL
  WHERE e."deletedAt" IS NULL
  GROUP BY e.id, e.status, e."finalPrice"
)
SELECT count(*)                                   AS so_ghi_danh_doi_so,
       COALESCE(SUM(-tong_refunded), 0)           AS tong_no_TANG_THEM
FROM gd
WHERE tong_refunded <> 0
  AND status NOT IN ('WITHDREW', 'TRANSFERRED', 'CANCELLED');
```

- `so_ghi_danh_doi_so = 0` ⇒ **không ai thấy số nhảy**, không phải báo kế toán.
- `> 0` ⇒ chạy tiếp câu 2 để có danh sách.

> ⚠️ `tong_refunded` là số **ÂM** (dòng hoàn mang dấu âm), nên `-tong_refunded` là phần nợ
> **tăng thêm**. Đừng đọc nhầm dấu.

## Câu 2 · Đơn nào, đổi bao nhiêu — danh sách để báo kế toán

```sql
WITH gd AS (
  SELECT e.id                                                                          AS enrollment_id,
         e.status,
         COALESCE(e."finalPrice", 0)                                                   AS phai_thu,
         COALESCE(SUM(p.amount) FILTER (WHERE p."accountantStatus" = 'CONFIRMED'), 0)  AS tong_confirmed,
         COALESCE(SUM(p.amount) FILTER (WHERE p."accountantStatus" = 'REFUNDED'),  0)  AS tong_refunded
  FROM "Enrollment" e
  LEFT JOIN "Payment" p
         ON p."enrollmentId" = e.id
        AND p."deletedAt" IS NULL
  WHERE e."deletedAt" IS NULL
  GROUP BY e.id, e.status, e."finalPrice"
)
SELECT o.code                                        AS ma_don,
       s.name                                        AS hoc_vien,
       c.name                                        AS lop,
       gd.status                                     AS trang_thai_ghi_danh,
       gd.phai_thu,
       gd.tong_confirmed                             AS da_dong_TRUOC,
       gd.tong_confirmed + gd.tong_refunded          AS da_dong_SAU,
       gd.phai_thu - gd.tong_confirmed               AS con_no_TRUOC,
       gd.phai_thu - (gd.tong_confirmed + gd.tong_refunded) AS con_no_SAU,
       -gd.tong_refunded                             AS no_TANG_THEM
FROM gd
JOIN "Enrollment" e   ON e.id = gd.enrollment_id
LEFT JOIN "Student" s ON s.id = e."studentId"
LEFT JOIN "Class"   c ON c.id = e."classId"
LEFT JOIN "OrderItem" oi ON oi."enrollmentId" = e.id
LEFT JOIN "Order"     o  ON o.id = oi."orderId"
WHERE gd.tong_refunded <> 0
  AND gd.status NOT IN ('WITHDREW', 'TRANSFERRED', 'CANCELLED')
ORDER BY -gd.tong_refunded DESC;
```

## Câu 3 · Đối chứng — nhóm KHÔNG đổi, để biết ngoại lệ có ăn không

```sql
WITH gd AS (
  SELECT e.id, e.status,
         COALESCE(SUM(p.amount) FILTER (WHERE p."accountantStatus" = 'REFUNDED'), 0) AS tong_refunded
  FROM "Enrollment" e
  LEFT JOIN "Payment" p ON p."enrollmentId" = e.id AND p."deletedAt" IS NULL
  WHERE e."deletedAt" IS NULL
  GROUP BY e.id, e.status
)
SELECT status,
       count(*)                  AS so_ghi_danh,
       SUM(-tong_refunded)       AS tien_hoan
FROM gd
WHERE tong_refunded <> 0
GROUP BY status
ORDER BY so_ghi_danh DESC;
```

Dòng `WITHDREW` / `TRANSFERRED` / `CANCELLED` ở đây là nhóm **có** tiền hoàn mà **không**
đổi số — đúng ngoại lệ. Dòng còn lại chính là tập của câu 2.

---

## Đọc kết quả

| Kết quả câu 1 | Làm gì |
|---|---|
| `0` ghi danh | Merge thẳng. Không ai thấy số nhảy. |
| `> 0` | Gửi **bảng câu 2** cho kế toán **trước** khi deploy. Nói rõ: *"con số cũ đang THẤP hơn thực tế vì tiền đã hoàn vẫn tính là đã đóng; số mới là số đúng."* |

> ⚠️ **Không đơn nào giảm nợ.** Mọi thay đổi đều theo chiều **nợ tăng** — tức là phát hiện
> ra khoản đáng lẽ vẫn phải thu. Nếu bảng ra một dòng `no_TANG_THEM` **âm**, đó là điều
> không giải thích được bằng bản vá này ⇒ **dừng, báo lại**, đừng merge.

## Cái tệp này KHÔNG trả lời

- Số của **trang `/cong-no`** (mức ĐƠN, trục B) — đó là bộ lọc khác
  (`saleStatus`), bản vá này không đụng tới.
- Số của **cổng phụ huynh** — nó cộng theo quan hệ `Enrollment.payments`, nên đổi **cùng
  chiều và cùng lượng** với câu 2; không cần câu riêng.
