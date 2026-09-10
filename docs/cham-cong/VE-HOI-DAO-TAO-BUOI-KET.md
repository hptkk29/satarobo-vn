# VÉ — hỏi Đào tạo: buổi quá hạn KHÔNG đóng được, và một tên lớp trùng

> **Trạng thái:** MỞ — chờ Đào tạo trả lời. Đây là **câu hỏi nghiệp vụ**, không phải bug kỹ thuật.
> **Chốt của chủ dự án 09/09/2026: ĐỪNG TỰ SỬA DỮ LIỆU.** Số này mang đi hỏi Đào tạo, không
> phải mang đi vá.

---

## Vì sao có vé

Sau khi backfill đóng nhóm `THOA`, phần còn lại là buổi **không đóng được bằng bất cứ đường
tự động nào**: cổng tự đóng không mở (chưa điểm danh đủ sĩ số), backfill không đụng tới
(nó chỉ đóng nhóm `THOA`). Chúng **chỉ thoát ra bằng người**.

Nhóm đáng hỏi nhất là **`SI_SO_RONG`** — buổi thuộc lớp **không có học viên nào đang học**.
Máy không thể tự quyết: đóng thì đóng một buổi chưa từng có ai học; để nguyên thì nó nằm
trong hàng chờ mãi mãi.

---

## Cách LẤY SỐ hiện tại — đừng đọc số cũ ở đâu đó

Luật 17: vé này cố ý **không ghi con số**. Số đo ngày nào chỉ đúng ngày đó; hàng chờ đổi
theo từng lượt điểm danh.

**Chạy trên PROD bằng workflow chỉ-đọc** (máy dev trỏ DB khác, số ở đó không phải số prod):

```
.github/workflows/cham-cong-prod-do-chi-doc.yml
```

Script: `scripts/do-buoi-ket-theo-lop.ts` — **CHỈ ĐỌC, không có tham số nào bật ghi.**

Nó phân nhóm bằng **chính** `quyetDinhTuHoanTat` (`lib/lms/tu-hoan-tat-buoi.ts`) — cùng hàm
mà cổng thật dùng, không chép lại luật (luật 9). Và nó **in cả nhóm RỖNG kèm câu "đây là số
ĐO, không phải chưa đo"** — vì "không có dòng nào" là một câu trả lời, khác hẳn "chưa đo".

Với mỗi lớp trong nhóm, script trả đúng bốn câu cần để hỏi:

1. buổi thuộc **bao nhiêu lớp**, lớp nào;
2. **trạng thái lớp** (`ACTIVE` / đã đóng / …);
3. **sĩ số đang học** của lớp đó;
4. có học viên nào **TỪNG ghi danh rồi rời đi** không — hay lớp **chưa từng** có ai.

Câu 4 là câu quyết định: *"lớp từng có người rồi rỗng"* và *"lớp chưa từng có ai"* dẫn tới
hai cách xử lý khác hẳn nhau.

---

## Hai câu hỏi cho Đào tạo

### 1. Lớp `combo.14h-T5&10h-T7.CS1-101`

Đo 09/09/2026: lớp mang trạng thái **`ACTIVE`**, sĩ số đang học **rỗng**, và **chưa từng có
ghi danh nào** (kể cả đã rời). Nhưng lịch buổi của nó vẫn sinh đủ và đang quá hạn.

> **Hỏi:** lớp này là lớp **thật chưa tuyển được ai**, hay là lớp **tạo nhầm / tạo thử** rồi
> bỏ đó?
>
> · Nếu **chưa tuyển được** → nên chuyển lớp sang trạng thái nào để buổi ngừng sinh và ngừng
>   vào hàng chờ? (Đóng lớp? Hoãn khai giảng?)
> · Nếu **tạo nhầm** → ai được phép huỷ, và huỷ lớp thì buổi đã sinh xử ra sao?

⚠️ **Không tự chọn hộ.** Cả hai đường đều đụng dữ liệu thật và đều có thể sai.

### 2. Tên lớp trùng

Đo cùng lượt: có **hai** lớp mang **cùng một tên**. `Class.name` không `@unique` nên DB
không chặn, và mọi màn liệt kê theo tên sẽ hiện hai dòng giống hệt nhau.

> **Hỏi:** hai lớp này là **hai lớp khác nhau vô tình đặt trùng tên**, hay **một lớp bị tạo
> hai lần**?
>
> · Khác nhau → cần quy ước đặt tên để phân biệt (thêm hậu tố cơ sở / ca / khoá?).
> · Trùng lặp → lớp nào là lớp thật, lớp kia xử ra sao (còn ghi danh / buổi / điểm danh nào bám
>   vào nó không)?

---

## Việc của mình SAU khi Đào tạo trả lời

Chỉ ghi hướng, chưa làm:

- Nếu cần một trạng thái lớp "chưa khai giảng / đã huỷ" mà buổi **không** vào hàng chờ → đó
  là việc ở `quyetDinhTuHoanTat` + chỗ sinh buổi, không phải sửa từng dòng.
- Nếu cần chặn tên lớp trùng → cân nhắc `@@unique` trên `(name, centerId)`; **nhưng phải đo
  trước** xem prod đang có bao nhiêu cặp trùng, vì một `ALTER` trên bảng có dữ liệu prod là
  luật cứng #4 (dry-run + người vận hành chạy tay).
- Dù chọn đường nào: **ĐỪNG `UPDATE` tay từng buổi.** Buổi kẹt là triệu chứng; đường sinh ra
  chúng mới là chỗ phải sửa.

---

## Liên quan

- `scripts/do-backlog-buoi-chua-chot.ts` — phép đo backlog tổng, cùng hàm phân nhóm.
- `scripts/backfill-dong-buoi-thoa.ts` — đã chạy, chỉ đóng nhóm `THOA` (dry-run mặc định).
- `lib/lms/tu-hoan-tat-buoi.ts` — **nguồn sự thật** của luật "buổi nào tự đóng được".
