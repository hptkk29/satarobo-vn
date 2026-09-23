# Khoá nào chưa khai số buổi cam kết — và nó chặn ai

> **Chỉ ĐỌC.** Không câu nào trong tệp này ghi một dòng. Chạy ở Supabase SQL Editor của
> **PROD** (đường duy nhất chạm được DB prod — xem sổ tay).
>
> Chạy **TRƯỚC khi merge** PHIÊN D. Kết quả quyết định một việc vận hành, không quyết định
> có merge hay không.

## Vì sao phải đếm

PHIÊN D quyết toán khi một con dừng học:

```
đơn giá một buổi = học phí thực của con ÷ Course.totalSessions   (làm tròn XUỐNG tới 1.000đ)
giá trị đã dùng  = số buổi đã dùng × đơn giá   (dùng hết ⇒ đúng học phí thực)
```

Chủ dự án chốt 21/09/2026: mẫu số là **số buổi CAM KẾT của khoá**, và **khoá chưa khai thì
TỪ CHỐI dừng học** — không đoán. Câu lỗi người vận hành thấy:

> Khoá "Sata 3" chưa khai số buổi cam kết — admin điền "Tổng số buổi" của khoá rồi thử lại.

`Course.totalSessions` là `Int?`, nên `NULL` lẫn `0` đều là "chưa khai". Ba câu dưới trả lời:
**bao nhiêu khoá như vậy, và có bao nhiêu học viên đang bị kẹt sau chúng.**

⚠️ Con số này **không chặn merge**: cổng từ chối là hành vi ĐÚNG, và tính năng chỉ chạy sau
công tắc `billing.flexV1Enabled` (hiện chỉ CS2). Nó cho biết cần điền trước bao nhiêu ô.

---

## Câu 1 · Bao nhiêu khoá chưa khai, và bao nhiêu ghi danh đang sống sau chúng

```sql
SELECT count(*) FILTER (WHERE k.thieu)                        AS so_khoa_chua_khai,
       count(*)                                               AS tong_so_khoa,
       COALESCE(SUM(k.ghi_danh_song) FILTER (WHERE k.thieu), 0) AS ghi_danh_bi_chan
FROM (
  SELECT c.id,
         (c."totalSessions" IS NULL OR c."totalSessions" = 0) AS thieu,
         (SELECT count(*)
            FROM "Enrollment" e
           WHERE e."courseId" = c.id
             AND e."deletedAt" IS NULL
             AND e.status IN ('ACTIVE','CONFIRMED','STUDYING','PENDING','PAUSED')) AS ghi_danh_song
  FROM "Course" c
) k;
```

- `so_khoa_chua_khai = 0` ⇒ không phải làm gì thêm.
- `> 0` ⇒ chạy câu 2 để biết điền ô nào trước.

## Câu 2 · Danh sách để admin điền — xếp theo mức độ chặn

```sql
SELECT c.name                              AS khoa,
       c.slug,
       c."totalSessions"                   AS so_buoi_cam_ket,
       count(e.id)                         AS ghi_danh_dang_song,
       count(DISTINCT e."classId")         AS so_lop
FROM "Course" c
LEFT JOIN "Enrollment" e
       ON e."courseId" = c.id
      AND e."deletedAt" IS NULL
      AND e.status IN ('ACTIVE','CONFIRMED','STUDYING','PENDING','PAUSED')
WHERE c."totalSessions" IS NULL OR c."totalSessions" = 0
GROUP BY c.id, c.name, c.slug, c."totalSessions"
ORDER BY count(e.id) DESC, c.name;
```

Điền ở `/admin/courses/<id>/edit`, ô **Tổng số buổi**.

## Câu 3 · Đối chứng — khoá ĐÃ khai có khớp số buổi thực xếp không

```sql
SELECT c.name                                   AS khoa,
       c."totalSessions"                        AS cam_ket,
       cl.name                                  AS lop,
       count(s.id) FILTER (WHERE s.status <> 'CANCELLED') AS buoi_da_xep,
       count(s.id) FILTER (WHERE s.status <> 'CANCELLED') - c."totalSessions" AS lech
FROM "Course" c
JOIN "Class" cl        ON cl."courseId" = c.id
LEFT JOIN "ClassSession" s ON s."classId" = cl.id
WHERE c."totalSessions" IS NOT NULL AND c."totalSessions" > 0
GROUP BY c.id, c.name, c."totalSessions", cl.id, cl.name
HAVING count(s.id) FILTER (WHERE s.status <> 'CANCELLED') <> c."totalSessions"
ORDER BY abs(count(s.id) FILTER (WHERE s.status <> 'CANCELLED') - c."totalSessions") DESC
LIMIT 50;
```

⚠️ Câu này **không phải một danh sách lỗi**. Lớp xếp dư/thiếu buổi so với cam kết là chuyện
bình thường (học bù, nghỉ lễ). Nó ở đây vì một lý do khác:

> **Đơn giá của PHIÊN D sẽ KHÁC đơn giá mà `/admin/hoan-tien` in ra cho cùng một bé.**
> `computeRefund` (`lib/finance/refund.ts`) chia cho **số buổi ĐÃ XẾP**; PHIÊN D chia cho
> **số buổi CAM KẾT**. Dòng `lech` ở đây đúng bằng chỗ hai con số rẽ nhau.

Hai con số, hai câu hỏi — nhưng nếu sau này có ai gộp chúng lại thì phải gộp **có chủ đích**,
không phải vì tưởng chúng vốn là một. Ghi ra đây để ngày đó người ta có sẵn phép đo.

---

## Đọc kết quả

| Câu 1 | Làm gì |
|---|---|
| `so_khoa_chua_khai = 0` | Không phải làm gì. Ghi lại con số vào PR. |
| `> 0` nhưng `ghi_danh_bi_chan = 0` | Điền dần, không gấp — chưa bé nào đứng sau các khoá đó. |
| `ghi_danh_bi_chan > 0` | Điền **trước** khi bật cờ cho cơ sở có các lớp đó, kẻo sale bấm "Dừng học" và nhận câu từ chối. |

## Cái tệp này KHÔNG trả lời

- Khoá đó **nên** khai bao nhiêu buổi — đó là câu hỏi của Đào tạo, không của SQL.
- Bao nhiêu bé **sẽ** dừng học. Không đo được, và không cần: cổng từ chối là hành vi đúng.
