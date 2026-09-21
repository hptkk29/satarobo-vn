# Tin nhắn báo Kế toán — gửi TRƯỚC khi merge `test` → `main`

> Chép nguyên khối dưới đây. Điền `__/__` bằng ngày dự kiến merge và `[TÊN — SĐT]` bằng
> người nhận phản hồi. Không thêm gì khác: mỗi câu thừa là một câu người đọc phải tự đoán
> xem có liên quan tới sổ của mình không.

---

Kính gửi anh/chị Kế toán,

Từ ngày __/__/2026, ba chỗ trên hệ thống sẽ hiện số khác trước: Thực thu, Báo cáo doanh thu (gồm biểu đồ 6 tháng), và Công nợ phụ huynh xem trên cổng.

Lý do chính: trước đây tiền hoàn lại cho phụ huynh không được trừ khỏi số đã thu, nên phần đã trả lại vẫn nằm trong doanh thu. Từ nay khoản hoàn được trừ đúng.

Tiền thật đã thu và đã chi không thay đổi. Số chỉ giảm ở những khoản từng có hoàn tiền; mọi khoản khác giữ nguyên.

Nhờ anh/chị đối chiếu giúp trong tuần đầu. Thấy chỗ nào lệch sổ, báo [TÊN — SĐT] kèm mã phiếu thu để tra đúng dòng.

---

## Ghi chú cho người gửi (KHÔNG gửi phần này)

### Vì sao KHÔNG còn đoạn "Thay đổi thứ hai" (cách hiển thị điều chỉnh)

Bản nháp trước có thêm một đoạn giải thích *"nay giữ phiếu gốc và thêm một dòng ghi phần
chênh lệch"*. **Đã bỏ hẳn, chủ dự án chốt 21/09/2026** — vì đoạn ấy đúng nghiệp vụ nhưng
**sai thời điểm**: việc đó **đã lên prod từ 07/09/2026**, không phải từ ngày merge này.

Bằng chứng: commit `fbefcb8e` *"Bước 2 — tách LOẠI bút toán ra khỏi TRẠNG THÁI kế toán"* +
migration `20260907090000_payment_type_tach_khoi_status`, cả hai là **tổ tiên của
`origin/main`**. Màn phiếu của PH trên `main` đã đọc sẵn `paymentType` + `adjustmentOfId`
và đã in lý do điều chỉnh.

Đối chiếu diff `main...test` của đúng ba nơi đọc số: thay đổi **duy nhất** là
`KHOAN_DA_XAC_NHAN` → `KHOAN_DA_DONG`, tức **chỉ thêm việc trừ khoản hoàn**. Không một
dòng nào đổi cách hiển thị điều chỉnh.

⇒ Ngày merge **chỉ có MỘT thay đổi số**, và tin nhắn nay nói đúng một điều đó. Kế toán mở
sổ từ ngày ấy đi tìm "hai dòng thay vì một" sẽ thấy nó đã có từ hai tuần trước — đúng kiểu
nhầm lẫn mà bản sửa này muốn tránh.

### ✅ ĐÃ KIỂM BẰNG MÃ: "khoản điều chỉnh tổng KHÔNG ĐỔI" — ĐÚNG

Giữ lại bằng chứng ở đây dù câu ấy không còn trong tin nhắn: nếu kế toán **tự hỏi** về một
khoản điều chỉnh, đây là câu trả lời, và nó đã được kiểm chứ không phải suy.

Kiểm 21/09/2026, ba đường độc lập, không đường nào đọc từ tài liệu:

**1. Đường GHI** — `adjustPayment` (`lib/finance/payment.ts`, có trên `origin/main`):

```ts
const hienTai = original.amount + (daDieuChinh._sum.amount ?? 0);
const delta = correctAmount - hienTai;
```

Phiếu gốc **không bị chạm**; dòng mới mang **hiệu**, không mang số đúng. Theo định nghĩa
thì `gốc + Σ delta = correctAmount` — đúng con số mà mô hình cũ ghi vào phiếu thay thế.

**2. Đường ĐỌC** — mọi phép cộng lấy **cả hai dòng**, không loại dòng nào:

| nơi đọc | bộ lọc trên `main` (prod hôm nay) | bộ lọc sau khi merge |
|---|---|---|
| Công nợ / phiếu PH | `CONFIRMED` | `CONFIRMED` + `REFUNDED` |
| Báo cáo doanh thu | `CONFIRMED` | `CONFIRMED` + `REFUNDED` |
| Thực thu (hoa hồng) | `CONFIRMED` + `REFUNDED` | không đổi |

Dòng điều chỉnh mang `accountantStatus = "CONFIRMED"`, nên nó **nằm trong cả hai cột** của
bảng trên. Khoản chỉ điều chỉnh (không hoàn tiền) ⇒ tập được cộng **y hệt nhau** trước và
sau ⇒ tổng bằng nhau. Chỉ khoản có `REFUNDED` mới đổi, và dòng hoàn mang số **âm** nên
luôn **giảm** — đúng như câu cuối của tin nhắn.

**3. Hai ca test ghim đúng bất biến này:**

- `[HT-E4]` (`tests/e2e/r7/hoan-tien-cong-no.spec.ts`) — sửa 5tr → 3tr:
  `expect(billing.totals.paid, "5tr + (−2tr) = 3tr").toBe(3_000_000)`, và
  `expect(gocSau?.amount, "dòng gốc phải giữ nguyên số").toBe(5_000_000)`.
- `[HH-TT-6]` (`tests/e2e/r1/commission-tien-thu.spec.ts`) — sửa 10tr → 6tr, chú thích ghi
  thẳng: *"Con số hoa hồng KHÔNG đổi (240k); thứ đổi là SỐ BÚT TOÁN."*

### ⚠️ Hai câu SAI của bản nháp đầu — đừng viết lại

1. ~~*"hệ thống sửa đè lên phiếu cũ, không còn dấu vết"*~~ — **SAI.** Repo **cố ý không
   chạm phiếu gốc**: mô hình cũ tạo phiếu MỚI mang số đúng, mô hình nay tạo dòng mang phần
   CHÊNH LỆCH. Cả hai đều giữ phiếu gốc. (`lib/reports/trung-tam.ts`: *"repo CỐ Ý không sửa
   bản gốc khi điều chỉnh / hoàn tiền — nó tạo DÒNG MỚI"*.)
2. ~~*"giảm ở những khoản từng có hoàn tiền **hoặc từng điều chỉnh**"*~~ — **SAI, và sai
   theo chiều nguy hiểm:** kế toán dò một khoản điều chỉnh, thấy tổng KHÔNG giảm, sẽ mở
   phiếu lỗi ngược.

### Vì sao không kèm bảng số cũ/mới

Bảng đó phải dựng trên **dữ liệu PROD** mới trả lời được câu kế toán thật sự sẽ hỏi
(*"tháng trước tôi chốt 1,4 tỷ, giờ hệ thống nói bao nhiêu?"*). DB `test` không có khoản
hoàn/điều chỉnh nào để lập bảng, và dựng bảng trên số test là đưa một con số **không khớp
sổ của họ** — tệ hơn không có bảng.

### Vì sao vẫn phải báo trước khi merge

Số đổi ngay lúc deploy. Kế toán phát hiện chênh lệch *trước khi* được báo sẽ mở phiếu lỗi,
và lúc đó việc mất công gấp nhiều lần.

### Ba từ cố ý không dùng

*delta*, *bộ lọc*, *bút toán điều chỉnh*. Người đọc cần biết **số nào đổi và vì sao**,
không cần biết hệ thống làm thế nào. Nếu họ hỏi sâu thì mới giải thích thêm.

### Nếu bị hỏi "đổi bao nhiêu"

Trả lời thật — *"chưa đo được trên số thật, đó là lý do nhờ anh/chị đối chiếu tuần đầu"*.
Đừng đoán một con số.
