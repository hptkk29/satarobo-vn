# VÉ — bảo vệ ngày TƯƠNG LAI đã có dấu vết khỏi lượt sinh lưới

> **Trạng thái:** MỞ, CỐ Ý chưa làm. Tách khỏi mục 6 (PR sinh lưới "chỉ áp từ ngày mai").
> **Điều kiện kích hoạt ghi ở cuối file, kèm câu SQL đo được cả hai.**

---

## Vì sao TÁCH, không làm cùng mục 6

Mục 6 chặn `≤ hôm nay`, và vế đó **đã phủ gần hết rủi ro thật**: ngày quá khứ là nơi
`StaffTimeLog` và `StaffAttendanceDay` đã có số thật.

Phần còn lại là **ngày TƯƠNG LAI đã có dấu vết** — hiếm, và vế đó kéo `generate` đi đọc
`StaffTimeLog`, tức **thêm một ràng buộc giữa hai tầng đang tách bạch**:

| tầng | hôm nay biết gì |
|---|---|
| `generate.ts` (thuần) | khung ca tuần · ô ca đang có · `homNay` |
| `generate-db.ts` | thêm: danh mục mã ca, quyền ghi theo khối |
| **`StaffTimeLog`** | **không tầng nào của đường sinh lưới đọc** |

Bảo vệ hiện tại đi theo **`source` của ô ca** (`PROTECTED = {SWAP, LEAVE, MANUAL, IMPORT}`),
không theo dấu vết. Đổi sang "theo dấu vết" là đổi trục của cả luật — đáng làm khi có lý do,
không đáng làm vì phòng xa.

---

## Lỗ cụ thể còn lại

Một ngày **> hôm nay** mà **đã có `StaffTimeLog`**, và ô ca mang `source: PATTERN`
(không thuộc `PROTECTED`) ⇒ lượt sinh lưới **vẫn `CANCELLED` rồi tạo lại** ô đó.

Hai đường sinh ra tình huống ấy:

1. **Quét trước ngày** — người bấm QR cho một ngày chưa tới. (`recordTimeLog` chốt `workDate`
   bằng `vnDateOnly(now)` nên bình thường không xảy ra; cần đồng hồ máy lệch hoặc một đường
   ghi khác.)
2. **Đơn `TIMESHEET_FIX` được duyệt cho ngày tương lai** — đường này ghi thẳng `StaffTimeLog`
   với `source: MANUAL_ADJUST`, và **KHÔNG** đổi `source` của ô ca. Nên ô vẫn là `PATTERN` và
   vẫn bị đè. Đây là đường khả dĩ nhất.

---

## 🔑 Câu SQL đo CẢ HAI — chạy trước khi quyết định làm

Chạy qua workflow chỉ-đọc (`cham-cong-prod-do-chi-doc.yml`), **không** chạy từ máy dev.

```sql
-- Lượt chấm nằm ở ngày TƯƠNG LAI, kèm nguồn của lượt và source của ô ca ngày đó.
SELECT
  l."workDate",
  l."source"                         AS nguon_luot,
  a."source"                         AS nguon_o_ca,
  a."status"                         AS trang_thai_o,
  count(*)                           AS so_luot
FROM "StaffTimeLog" l
LEFT JOIN "ShiftAssignment" a
       ON a."userId"   = l."userId"
      AND a."workDate" = l."workDate"
      AND a."status"   = 'ACTIVE'
WHERE l."result"   = 'ACCEPTED'
  AND l."workDate" > (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
GROUP BY 1, 2, 3, 4
ORDER BY 1;
```

**Đọc kết quả:**

- **0 dòng** ⇒ chưa ai quét trước ngày và chưa đơn nào ghi mốc cho ngày tương lai. **Chưa
  cần làm.** (Đây là số ĐO, không phải chưa đo.)
- Có dòng với `nguon_luot = 'TICKET'` ⇒ **đường 1 đang sống** (quét trước ngày).
- Có dòng với `nguon_luot = 'MANUAL_ADJUST'` ⇒ **đường 2 đang sống** (đơn duyệt cho ngày mai).
- Với mọi dòng: `nguon_o_ca = 'PATTERN'` là **đúng nhóm bị đè**; `SWAP`/`LEAVE`/`MANUAL`/
  `IMPORT` thì `PROTECTED` đã che rồi.

⚠️ Chỉ dòng vừa có lượt **vừa** `nguon_o_ca = 'PATTERN'` mới là lỗ thật. Đếm gộp là thổi số.

---

## Khi làm thì làm thế nào

Thêm một tập bảo vệ thứ hai, **song song** với `PROTECTED` chứ không thay nó:

- `generate-db.ts` đọc thêm `StaffTimeLog` (`ACCEPTED`, trong khoảng `from..to`), gom thành
  `Set<"userId|YYYY-MM-DD">`;
- truyền xuống planner thành tham số `ngayDaCoDauVet: ReadonlySet<string>`;
- planner thêm `action: "SKIP_DA_CHAM"`, đặt **cạnh** `SKIP_QUA_KHU`, **trước** `SKIP_PROTECTED`;
- bộ đếm `skippedScanned`, nhãn riêng trên bảng xem trước.

Ca test bắt buộc (luật 16 — cả hai vế):
- ngày tương lai **có** lượt chấm ⇒ ô KHÔNG đổi một field nào;
- ngày tương lai **không** có lượt ⇒ **VẪN** đổi đúng.

Và một ca cho ranh giới: lượt chấm của ngày ≤ hôm nay **không** được làm ngày khác bị chừa.

---

## Liên quan

- `lib/cham-cong/generate.ts` — `SKIP_QUA_KHU`, `homNay`, và vì sao `effectiveFrom` không
  dùng được để vá.
- `docs/cham-cong/VE-AI-CO-MAT-O-CO-SO.md` — cùng họ: một nhu cầu tách ra khỏi bản vá thay vì
  nhét vào cho đủ.
