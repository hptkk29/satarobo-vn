# VÉ — kỳ công sinh THEO LƯỢT BẤM, không ai canh

> **Trạng thái:** MỞ, chưa sửa. Tách ra theo chốt của chủ dự án 15/09/2026:
> *"Kỳ 2026-08 chỉ tồn tại ở 1/3 cơ sở — kỳ sinh theo lượt bấm, không ai canh. Sẽ vướng
> lúc chốt sổ, nhưng ngoài phạm vi mục 4."*
>
> Ghi lại vì nó **chưa gây hại hôm nay** nhưng sẽ gây đúng vào lúc tốn kém nhất: lúc chốt
> sổ lương một kỳ đã qua.

---

## Sự việc — ĐO trên prod 15/09/2026

Đo bằng `scripts/do-cong-chuan-theo-role.ts` qua workflow chỉ-đọc
(`cham-cong-prod-do-chi-doc.yml`, việc `cong-chuan-theo-role`),
run [34941920173](https://github.com/hptkk29/satarobo-vn/actions/runs/34941920173).

| Kỳ | Cơ sở có bản ghi `AttendancePeriod` | Cơ sở KHÔNG có |
|---|---|---|
| **2026-09** | Hoàng Diệu · Nguyễn Hữu Thọ · Hội sở (3/3) | — |
| **2026-08** | Hoàng Diệu (**1/3**) | Nguyễn Hữu Thọ · Hội sở |

Tổng cộng **4 bản ghi**, đáng ra phải là 6 nếu mỗi cơ sở đều có đủ hai tháng.

---

## Vì sao — `getOrCreatePeriod` là đường sinh DUY NHẤT, và nó chỉ chạy khi có người bấm

`lib/cham-cong/period.ts:111` — `getOrCreatePeriod(centerId, key)` tạo bản ghi khi **chưa
có**, kèm `standardUnits` tính từ công thức. Nó **không** có lịch chạy nào:

- **không cron nào gọi.** Đo bằng `grep -rn getOrCreatePeriod` trên toàn repo: 3 đường gọi
  thật — `ky-cong/page.tsx:120` · `ky-cong/_actions.ts:87` (`setStandardUnitsAction`) ·
  `period.ts:385` (`lockPeriod`), cộng `seed-cham-cong-demo.ts:373` (chỉ seed demo) và 1 ca
  test. Không có route cron nào trong danh sách;
- không có bước nào sinh trước kỳ của tháng mới cho mọi cơ sở;
- và đường gọi ở màn Kỳ công **có điều kiện**: `ky-cong/page.tsx:120` chỉ gọi khi
  `canClose`. Người chỉ có `view` lướt qua màn thì kỳ **không** được tạo — cố ý (`page.tsx:9`
  ghi rõ "`getOrCreatePeriod` GHI (upsert), CHỈ gọi khi người ta có quyền chốt").

⇒ Kỳ của một (cơ sở × tháng) **chỉ ra đời khi một người CÓ QUYỀN CHỐT mở màn Kỳ công đúng
cặp ấy**. Tháng 8 không ai làm việc đó cho Nguyễn Hữu Thọ và Hội sở, nên hai kỳ đó không
tồn tại.

---

## Hệ quả — vì sao phải sửa TRƯỚC khi chốt sổ

Bốn thứ đọc `AttendancePeriod`, và cả bốn im lặng khi bản ghi vắng mặt:

1. **`status`** — không có bản ghi thì không có `LOCKED`. Kỳ chưa từng tồn tại **không phân
   biệt được** với kỳ đang mở. Cổng "kỳ đã chốt thì không sửa" không có gì để gác.
2. **`standardUnits`** — rơi về công thức tính LẠI theo cấu hình **hôm nay**. Đổi
   `shift.weeklyOffDays` hay thêm một ngày lễ vào tháng 8 là con số của tháng 8 đổi theo,
   dù tháng ấy đã qua từ lâu. Số chốt sổ không được phép trôi.
3. **`summaryJson`** — `lockPeriod` chạy `recomputeRange` rồi đóng băng số vào đây
   (`period.ts:445`). Không có kỳ thì không có ảnh chụp, và mọi con số về sau đều là tính
   lại theo dữ liệu hiện tại.
4. **Site GV** — `getMyPeriod` trả `null` ⇒ thẻ kỳ công hiện "Chưa lập kỳ" cho một tháng
   người ta đã đi làm đủ.

Điểm đau thật: **`lockPeriod` gọi `recomputeRange` ngay trước khi khoá.** Nên kỳ nào được
lập MUỘN sẽ bị tính lại bằng mã và cấu hình của ngày lập, không phải của tháng đó.

---

## Chưa làm gì — và cố ý không tự vá

Không tự sinh migration hay cron nào cho việc này. Hai lý do:

- **Chạm lương.** Sinh hàng loạt kỳ cho quá khứ là ghi `standardUnits` cho những tháng đã
  qua, bằng công thức của hôm nay. Phải có người quyết số nào đúng cho từng tháng.
- Luật cứng #4: không tự ý ghi vào bảng đang có dữ liệu PROD; đường ghi phải có dry-run và
  do người vận hành bấm.

---

## Khi làm thì cần quyết ba câu

1. **Sinh trước hay sinh lúc cần?** Cron đầu tháng sinh đủ (cơ sở × kỳ), hay giữ
   `getOrCreatePeriod` nhưng thêm một màn "kỳ nào còn thiếu" để người ta thấy?
2. **Quá khứ xử ra sao?** Hai kỳ tháng 8 đang thiếu: lập lại bằng công thức hôm nay, hay
   để trống và ghi rõ "tháng này chưa lập kỳ, số là tính lại"?
3. **Có cần cổng chặn chốt sổ khi thiếu kỳ không?** Hôm nay Kế toán xuất Excel được cho
   một cơ sở chưa có kỳ, và file ấy không nói ra điều đó.

---

## Đọc kèm

- `lib/cham-cong/period.ts` — `computeStandardUnits` · `getOrCreatePeriod` · `lockPeriod`
- `scripts/do-cong-chuan-theo-role.ts` — phép đo sinh ra bảng ở trên
- `docs/cham-cong/VE-NGAY-LE.md` — ngày lễ là đầu vào của `computeStandardUnits`, nên hai
  vé này chạm nhau ở đúng chỗ "số của tháng cũ có trôi không"
