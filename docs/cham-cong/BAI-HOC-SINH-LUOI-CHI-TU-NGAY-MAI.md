# Ba bài học giữ nguyên văn — lượt "sinh lưới chỉ áp từ NGÀY MAI" (mục 6, 13/09/2026)

> Chủ dự án yêu cầu giữ **nguyên văn** ba chỗ trong báo cáo lượt đó. Ghi ở đây vì báo cáo
> trong hội thoại thì mất, còn ba câu này là thứ sẽ bị hỏi lại.
> Bài học thứ ba nằm ở sổ luật (`docs/luat-doc-so-va-ket-luan.md`, phần luật 8) vì nó là luật
> chung, không riêng chấm công.

---

## 1 — `effectiveFrom` KHÔNG dùng để vá được

> **ĐỪNG vá bằng `effectiveFrom`:** cả ba đường ghi `ShiftWeeklyPattern` đều đặt nó bằng hằng
> `01/01/2000`, và `lib/cham-cong/khung-ca.ts` nói rõ bảng ấy *"không dựng lịch sử theo phiên
> bản — đổi mốc là đổi hạt của bảng"*.

**Vì sao câu này đáng giữ.** Khi cần "khung ca mới chỉ áp từ ngày mai", cột `effectiveFrom`
trông như đúng thứ sinh ra để làm việc đó — nó có sẵn, nó tên như thế, và planner đã đọc nó
(`if (p.effectiveFrom.getTime() > day.getTime()) continue`). Đó là một **lối rẽ hấp dẫn và
sai**, và nó sẽ hấp dẫn y như vậy với người tới sau.

Hai lý do nó sai, cả hai đo được chứ không phải cảm giác:

| | |
|---|---|
| **Giá trị** | ba đường ghi đều đặt hằng `01/01/2000` ⇒ cột này **chưa từng mang thông tin** |
| **Hạt của bảng** | `@@unique([userId, centerId, weekday, effectiveFrom])` — `effectiveFrom` nằm TRONG khoá. Đổi mốc không phải "sửa một giá trị", nó là **tách dòng**: một người × một thứ × một khối bỗng có hai dòng, và mọi chỗ đang đọc bảng theo hạt cũ phải sửa theo |

⇒ Ranh giới "hôm nay" phải là **tham số của lượt sinh** (`homNay: Date`, bắt buộc, không mặc
định), không phải một cột dữ liệu. Xem khối chú thích ở `homNay` trong `lib/cham-cong/generate.ts`.

---

## 2 — Seed truyền `new Date(0)`, và đó không phải lách cổng

> **Cổng "chỉ áp từ ngày mai" là luật cho NGƯỜI BẤM NÚT, không phải cho máy dựng dữ liệu.**

Nguyên văn chú thích tại `prisma/seed-cham-cong-demo.ts`:

> Seed CỐ Ý dựng dữ liệu cho các kỳ ĐÃ QUA — đó là mục đích của nó. Nên mốc "hôm nay" ở đây là
> buổi đầu thời gian: mọi ngày đều là tương lai, không ngày nào bị chừa.
>
> ⚠️ ĐỪNG đổi thành `vnDateOnly(new Date())`: làm thế là seed không sinh nổi lưới cho kỳ
> trước, và màn nghiệm thu lại về EmptyState — đúng cái file này sinh ra để chữa.

**Vì sao câu này đáng giữ.** Nó trả lời trước một phản xạ rà soát rất đúng đắn: *"chỗ này
truyền `new Date(0)` để đi vòng qua cổng vừa dựng — sửa đi."* Sửa theo phản xạ đó là **phá
đúng thứ file seed tồn tại để làm**.

Phân biệt bằng câu hỏi **cổng này bảo vệ ai khỏi cái gì**: nó bảo vệ `StaffTimeLog` và
`StaffAttendanceDay` **đã có số thật** khỏi một lượt bấm nút. Máy dựng dữ liệu demo trên DB
local không có gì để mất — ở đó không có ngày nào "đã có số thật" theo nghĩa ấy.

⚠️ Điều **không** suy ra được từ bài học này: rằng seed nào cũng được miễn. Cùng lượt đó phải
thêm `assertLocalDb("seed-cham-cong-demo")` vào chính file này vì nó **thiếu guard** — nghĩa
là một lượt bấm nhầm env là nó ghi thẳng vào DB thật. Miễn cổng "ngày mai" **đi kèm** điều
kiện "chỉ chạy trên DB local", và điều kiện ấy phải là **mã**, không phải chú thích (luật 12).

---

## 3 — Phép cấy bắt được lỗi trong chính ca test

> **Lượt cấy không đỏ thì nghi CA TEST trước khi nghi phép cấy.**

Đây là luật 8 ở tầng sâu hơn, và vì nó là luật chung nên chỗ ở của nó là sổ luật:
`docs/luat-doc-so-va-ket-luan.md` → *"Luật 8 ở tầng sâu hơn — lượt cấy KHÔNG ĐỎ thì nghi CA
TEST trước khi nghi phép cấy"*, kèm sự cố 13/09 (chế độ XEM TRƯỚC, nhánh `REPLACE` chưa từng
chạy vì fixture chỉ có ô ngày quá khứ).

---

## Liên quan

- `lib/cham-cong/generate.ts` — tham số `homNay`, hành động `SKIP_QUA_KHU`.
- `docs/cham-cong/VE-BAO-VE-NGAY-DA-CO-DAU-VET.md` — phần rủi ro CÒN LẠI sau lượt này (ngày
  tương lai đã có dấu vết), tách vé riêng kèm câu SQL đo.
- `docs/luat-doc-so-va-ket-luan.md` — luật 7 (bỏ mặc định nguy hiểm), luật 8, luật 12, luật 19.
