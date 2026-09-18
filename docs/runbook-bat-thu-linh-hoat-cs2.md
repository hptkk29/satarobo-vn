# Runbook: bật "Thu học phí linh hoạt" cho riêng CS2

> Chủ dự án chốt 18/09/2026: pilot **một cơ sở trước**, và **chủ dự án tự bật**.
> Backfill `Payment.orderItemId` đã chạy xong trên prod (run `35296161114`): 146 khoản / 119 đơn.
> Còn lại đúng **4 khoản / 4.836.000đ** trên `ORD-260917-000001` (CS2, 2 con) — đó là đơn để thử.

---

## 0 · Hai điều phải biết TRƯỚC khi bật

### KHÔNG có màn nào bật riêng cho một cơ sở

Màn `/admin/cau-hinh-van-hanh` (tab **Tiền**) **chỉ ghi công tắc TOÀN HỆ** — nó gọi
`saveGlobalSettingAction`. Server Action cho override theo cơ sở **có tồn tại**
(`saveCenterSettingAction`) nhưng **0 component nào gọi nó**, tức chưa có giao diện.

⇒ Bật riêng CS2 **phải bằng SQL**. Đó là hiện trạng, không phải lựa chọn thiết kế.

### Cờ đọc qua CACHE 300 GIÂY — sửa bằng SQL KHÔNG có tác dụng tức thì

`getSetting` bọc trong `safeCache` với `revalidate: 300` (`lib/settings/service.ts:45`).

| Đường sửa | AuditLog | Hiệu lực sau |
|---|---|---|
| màn cấu hình (`setCenterSetting`) | **CÓ** — ai bật, lúc nào, lý do | **ngay** (tự xoá cache) |
| SQL tay | **KHÔNG** | **tới 5 phút** |

⚠️ Hệ quả cho ca sự cố: **SQL không phải công tắc ngắt nhanh.** Xem mục 4.

---

## 1 · BẬT cho CS2

Chạy trên **Supabase SQL Editor** (prod). Ba câu, chạy lần lượt.

### 1.1 — Xác nhận công tắc toàn hệ đang TẮT

```sql
SELECT key, "valueJson", "updatedByName", "updatedAt"
FROM "SystemSetting"
WHERE key = 'billing.flexV1Enabled';
```

**Kỳ vọng: 0 dòng** (chưa ai bật ⇒ theo mặc định `false`), hoặc 1 dòng `valueJson = false`.
Nếu ra `true` thì **toàn hệ đã bật rồi** — dừng lại và đọc mục 4, vì lúc đó việc cần làm là
*gỡ CS1 ra*, không phải *thêm CS2 vào*.

### 1.2 — Lấy `OrgUnit.id` của CS2

```sql
SELECT id, code, name, path FROM "OrgUnit" WHERE code = 'CS2';
```

Phải ra **đúng 1 dòng**, `path = '/ho/danang/cs2/'`.

⚠️ **`orgUnitId`, KHÔNG phải `centerId`.** `CenterSetting` khoá theo `OrgUnit.id`; đưa
`Center.id` vào thì tra không ra dòng nào và hàm **âm thầm rơi về giá trị toàn hệ** — cờ riêng
của cơ sở không có tác dụng mà không lỗi nào báo.

### 1.3 — Ghi override BẬT cho CS2

Câu này tự tra `OrgUnit.id` nên không phải chép id bằng tay:

```sql
INSERT INTO "CenterSetting" ("orgUnitId", "key", "valueJson", "updatedByName", "updatedAt")
SELECT ou.id, 'billing.flexV1Enabled', 'true'::jsonb,
       'Chu du an (SQL tay) - pilot CS2 18/09/2026', now()
FROM "OrgUnit" ou
WHERE ou.code = 'CS2'
ON CONFLICT ("orgUnitId", "key")
DO UPDATE SET "valueJson" = 'true'::jsonb,
              "updatedByName" = EXCLUDED."updatedByName",
              "updatedAt" = now();
```

Ba chi tiết **không được bỏ**:
- `'true'::jsonb` — **JSON boolean**, không phải chuỗi `'"true"'`. Schema là `z.boolean()`;
  chuỗi sẽ không validate và giá trị bị coi là không hợp lệ.
- `"updatedAt" = now()` — cột `TIMESTAMP(3) NOT NULL` **không có DEFAULT** (Prisma quản
  `@updatedAt` ở tầng app, không ở tầng DB). Thiếu nó là câu INSERT sập.
- `"updatedByName"` — vì SQL tay **không ghi AuditLog**, cột này là dấu vết duy nhất còn lại.
  Ghi rõ "SQL tay" để lần sau không ai tưởng nó do màn cấu hình ghi.

---

## 2 · SQL KIỂM sau khi bật — phải ra ĐÚNG CS2

```sql
SELECT ou.code                                   AS co_so,
       ou.name,
       cs."valueJson"                            AS co_rieng,
       (SELECT s."valueJson" FROM "SystemSetting" s
         WHERE s.key = 'billing.flexV1Enabled')  AS co_toan_he,
       CASE
         WHEN cs."valueJson" IS NULL THEN 'theo toàn hệ'
         WHEN cs."valueJson" = 'true'::jsonb THEN 'BẬT (riêng cơ sở)'
         ELSE 'TẮT (riêng cơ sở)'
       END                                       AS ket_qua,
       cs."updatedByName", cs."updatedAt"
FROM "OrgUnit" ou
LEFT JOIN "CenterSetting" cs
       ON cs."orgUnitId" = ou.id AND cs.key = 'billing.flexV1Enabled'
WHERE ou.type = 'CENTER'
ORDER BY ou.code;
```

**Kỳ vọng đúng:**

| co_so | co_rieng | co_toan_he | ket_qua |
|---|---|---|---|
| CS1 | `NULL` | `NULL` hoặc `false` | theo toàn hệ |
| **CS2** | **`true`** | `NULL` hoặc `false` | **BẬT (riêng cơ sở)** |

⚠️ Câu này liệt kê **mọi** cơ sở, kể cả cơ sở không khai gì — cố ý. Một câu chỉ `SELECT … FROM
"CenterSetting"` sẽ ra một dòng CS2 và trông như "đúng rồi", mà không nói được CS1 có bị bật
lây hay không. Muốn kiểm "chỉ đúng một nơi bật" thì phải thấy cả những nơi KHÔNG bật.

**Chờ tới 5 phút** rồi mới thử trên giao diện (cache 300s ở mục 0).

---

## 3 · Checklist cho SALE — thử trên `ORD-260917-000001`

Đơn này ở **CS2**, **2 con**, có **4 khoản đã thu chưa gắn con**:
`1.188.000 · 1.230.000 · 1.188.000 · 1.230.000` = **4.836.000đ**.

Người làm cần quyền `payments:record` (gắn + chia + tạo đợt). Gỡ gắn / IGNORED cần
`payments:manage` (kế toán).

### Bước 1 — Mở đơn, xem công nợ theo con
1. Vào `admin.satarobo.vn/admin/orders`, tìm `ORD-260917-000001`, bấm mở.
2. Kéo tới khối **"Công nợ theo con"**.
3. Phải thấy **2 dòng con**, mỗi dòng có: học phí thực · đã thu · chờ xác nhận · còn nợ.
4. Phải thấy dòng nhắc **"Có 4.836.000đ đã vào đơn nhưng chưa gắn cho bé nào"**.

> ⛔ **DỪNG nếu:** khối "Công nợ theo con" **không hiện**. Nghĩa là cờ chưa ăn — chờ hết 5 phút
> cache, rồi chạy lại SQL mục 2. Đừng thử tiếp bằng cách khác.

### Bước 2 — Mở màn biến động số dư
5. Vào `admin.satarobo.vn/admin/bien-dong-so-du`.
6. Tìm 4 khoản của đơn `ORD-260917-000001`.

> ⛔ **DỪNG nếu:** **nút gắn không hiện**. Có hai lý do và chúng khác nhau:
> quyền (`payments:record`) hay cờ. Kiểm SQL mục 2 trước; nếu cờ đúng thì là quyền.
> **Đừng nhờ người khác có quyền cao hơn bấm hộ** — làm vậy là mất luôn phép thử này.

### Bước 3 — Chia từng khoản vào đúng con
7. Với **từng** khoản (4 lần), bấm gắn → chọn **con** → chọn **đợt** → nhập số tiền.
8. Số tiền phải **khớp đúng** số của khoản; hệ thống không cho ô tiền tự do.

> ⛔ **DỪNG nếu:** hệ thống báo **"Vượt phần còn được thu của CẢ ĐƠN"** hoặc **"Cả đơn không
> còn phần được thu thêm"**. Đó là cổng hai vế đang làm việc: nó nói đơn đã có tiền chưa gắn.
> Không phải lỗi giao diện — **đọc lại còn nợ của đơn trước khi gắn thêm**.

### Bước 4 — Kiểm ngay trên giao diện
9. Về trang đơn, xem lại **"Công nợ theo con"**.
10. Ba điều phải đúng:
    - dòng nhắc "chưa gắn cho bé nào" **biến mất** (hoặc về 0đ);
    - **Σ "đã thu" của 2 con = 4.836.000đ**;
    - **còn nợ của từng con ≥ 0**.

> ⛔ **DỪNG NGAY nếu thấy bất kỳ dấu hiệu nào dưới đây** — và **đừng gắn thêm khoản nào nữa**:
>
> | Dấu hiệu | Nghĩa là |
> |---|---|
> | Σ đã thu của 2 con **≠ 4.836.000đ** | có khoản gắn nhầm con, hoặc gắn hai lần |
> | **còn nợ con ÂM** | con đó nhận quá phần của mình |
> | dòng "chưa gắn cho bé nào" **vẫn còn tiền** | có khoản chưa gắn xong |
> | nút gắn biến mất giữa lúc làm | cờ vừa bị tắt, hoặc phiên hết hạn |
>
> Gỡ gắn cần `payments:manage` (kế toán) — sale **không** tự gỡ. Báo lại, đừng chữa.

---

## 4 · SQL để chủ dự án tự kiểm SAU KHI sale làm xong

```sql
SELECT p.id                    AS payment_id,
       p.amount,
       oi."itemName"           AS con,
       p."orderItemId",
       p."accountantStatus",
       p."paidDate"
FROM "Payment" p
JOIN "Order"      o  ON o.id = p."orderId"
LEFT JOIN "OrderItem" oi ON oi.id = p."orderItemId"
WHERE o.code = 'ORD-260917-000001'
  AND p."deletedAt" IS NULL
ORDER BY p."paidDate", p.amount;
```

**Ba điều phải đúng:**
1. **4 dòng**, và **không dòng nào** có `orderItemId` là `NULL`;
2. `orderItemId` rơi vào **đúng 2 giá trị khác nhau** (2 con), không phải 1, không phải 3;
3. `SUM(amount) = 4 836 000`.

Một câu gộp trả lời cả ba, `ket_qua` phải là `ĐẠT`:

```sql
SELECT COUNT(*)                                        AS so_khoan,
       COUNT(*) FILTER (WHERE p."orderItemId" IS NULL) AS con_chua_gan,
       COUNT(DISTINCT p."orderItemId")                 AS so_con_duoc_gan,
       SUM(p.amount)                                   AS tong_tien,
       CASE WHEN COUNT(*) = 4
             AND COUNT(*) FILTER (WHERE p."orderItemId" IS NULL) = 0
             AND COUNT(DISTINCT p."orderItemId") = 2
             AND SUM(p.amount) = 4836000
            THEN 'ĐẠT' ELSE 'KHÔNG ĐẠT — soi từng dòng bằng câu trên' END AS ket_qua
FROM "Payment" p
JOIN "Order" o ON o.id = p."orderId"
WHERE o.code = 'ORD-260917-000001' AND p."deletedAt" IS NULL;
```

---

## 5 · TẮT NHANH khi có sự cố

### Câu lệnh

```sql
-- Gỡ CS2 ra khỏi tính năng. Ghi FALSE, KHÔNG xoá dòng.
UPDATE "CenterSetting" cs
SET "valueJson" = 'false'::jsonb,
    "updatedByName" = 'TAT KHAN - su co pilot CS2',
    "updatedAt" = now()
WHERE cs.key = 'billing.flexV1Enabled'
  AND cs."orgUnitId" = (SELECT id FROM "OrgUnit" WHERE code = 'CS2');
```

⚠️ **Ghi `false`, đừng `DELETE` dòng.** Xoá dòng nghĩa là "cơ sở không khai gì" ⇒ CS2 **rơi về
công tắc toàn hệ**. Hôm nay toàn hệ đang tắt nên hai cách trông giống nhau — nhưng ngày toàn hệ
được bật, cái `DELETE` ấy sẽ **bật lại CS2** đúng lúc không ai ngờ. Ghi `false` là tắt **có chủ
đích**, và `giaiCongTac` phân biệt `undefined` với `false` chính vì việc này.

⚠️ **Tắt toàn hệ KHÔNG gỡ được CS2.** Override của cơ sở **thắng** công tắc toàn hệ (cả hai
chiều). Đặt `SystemSetting` về `false` mà CS2 vẫn khai `true` thì CS2 **vẫn bật**.

### Hiệu lực: tới 5 PHÚT, không tức thì

Cache `revalidate: 300`. **Đây là điểm yếu thật của đường SQL, không phải chi tiết nhỏ** — trong
5 phút đó sale vẫn gắn được tiền. Nếu cần chặn NGAY thì chặn ở **người**: bảo sale dừng bấm, rồi
mới chạy SQL.

### Đơn đã tạo đợt / đã gắn tiền thì sao

**Tắt cờ KHÔNG hoàn lại gì.** Nói rõ từng thứ:

| Thứ đã tạo | Sau khi tắt cờ |
|---|---|
| `Payment.orderItemId` đã gắn | **GIỮ NGUYÊN**. Cột này không do cờ quản; backfill đã điền 146 khoản khi cờ đang tắt |
| Phiếu thu theo con (`PaymentRequest.orderItemId` ≠ NULL) | **GIỮ NGUYÊN**, vẫn nhận được tiền qua webhook |
| Mã QR đã in theo đợt của con | **VẪN QUÉT ĐƯỢC** — QR nằm ngoài cờ |
| Màn "Công nợ theo con" | **ẨN** |
| Nút gắn theo con trên biến động số dư | **ẨN** — quay về đường gắn cả đơn (`ganGiaoDichVaoDon`) |

⇒ **Tắt cờ = dừng tạo cái MỚI, không phải hoàn cái CŨ.** Đúng như `lib/settings/registry.ts:308`
đã dặn: *"BẬT RỒI TẮT LẠI KHÔNG VÔ HẠI: phiếu thu đã sinh theo con vẫn nằm đó khi cờ tắt.
Đường lùi là tắt cho đơn MỚI rồi xử lý tay số đơn đã lỡ sinh."*

Nên nếu sự cố là **số tiền sai**, tắt cờ **không sửa** nó. Việc phải làm là **gỡ gắn** (cần
`payments:manage`) — đường đó sinh bút toán đảo có log và đưa giao dịch về `UNMATCHED`.

---

## Việc còn treo, KHÔNG thuộc runbook này

- **7 giao dịch / 28.472.000đ** khớp đơn `CONFIRMED` đã hết phiếu mở →
  `docs/ra-soat-giao-dich-khop-don-confirmed.md` (giao kế toán).
- **4 giao dịch / 25.388.000đ** không khớp đơn/lead/học viên nào → sale tra tay (mục A2 nhóm 3
  của báo cáo đối soát).
- Chưa có **giao diện** cho override theo cơ sở — nay phải SQL, không có AuditLog, hiệu lực trễ
  5 phút. Nếu pilot mở rộng ra nhiều cơ sở thì đây là việc phải làm trước.
