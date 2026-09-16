# VÉ — `require-now-in-tests > [CAY-LAI]` đỏ theo TẢI MÁY, không theo mã

> **Trạng thái:** MỞ, chưa sửa. Ghi vé theo chốt của chủ dự án 16/09/2026:
> *"Ghi vé cho ca đỏ require-now-in-tests. Lần thứ TƯ rồi. Bốn lần thấy mà chưa có vé là
> cách một thứ hỏng trở thành bình thường. Không cần sửa bây giờ, cần có chỗ đứng."*

---

## Ca nào

`lib/eslint/require-now-in-tests.test.ts` → `thoigian/require-now-in-tests` →
**`[CAY-LAI] bắt ĐÚNG lời gọi đã gây đỏ 13/09/2026`**

Nó chạy ESLint THẬT trên một chuỗi mã và khẳng định rule bắt được đúng một lời gọi thiếu
`now`. Ca đúng, luật đúng — thứ hỏng là **điều kiện chạy**.

---

## Sổ lần thấy — 16/09/2026

| Lượt | Bối cảnh | Kết quả |
|---|---|---|
| 1 | `pnpm test:unit` đầy đủ, máy đang chạy dev server + Postgres | **ĐỎ** — 6356ms |
| 2 | chạy lại ngay sau đó, không đổi một dòng nào | XANH |
| 3 | `pnpm test:unit` đầy đủ, máy đang chạy Playwright | **ĐỎ** |
| 4 | chạy một mình: `vitest run lib/eslint/require-now-in-tests.test.ts` | XANH — 9/9 ca |
| 5 | `pnpm test:unit` đầy đủ | **ĐỎ** |
| 6 | chạy lại | XANH |

**Trên CI thì XANH**, kể cả ở lượt PR #274 có đủ 11 job. Nên nó phụ thuộc TẢI MÁY CỤC BỘ,
không phải hồi quy của mã.

---

## Vì sao đây đúng hình dạng luật 18

> *"Chữ ký của lớp lỗi này là cấy vào thì 'chạy 1 ca ĐỎ, cả bộ XANH'"* — ở đây là vế **ngược
> lại**: chạy một mình XANH, cả bộ ĐỎ. Cùng một gốc: **ca không đứng được một mình trong
> điều kiện thật.**

Ở ca này thứ nó "mượn" không phải trạng thái DB mà là **thời gian CPU**. 6356ms cho một ca
lint một chuỗi mã là quá lâu — mặc định của vitest là 5000ms, nên nó quá hạn. Dưới tải, việc
khởi tạo ESLint (đọc config, nạp plugin, dựng linter) bị chen và vượt trần.

⚠️ **Và nâng trần là vá TRIỆU CHỨNG.** Luật 18 nói thẳng điều đó. Trần cao hơn chỉ đẩy ngưỡng
ra xa, rồi nó sẽ đỏ lại vào một ngày máy bận hơn — hoặc tệ hơn, trên CI vào đúng hôm runner
chậm, lúc không ai ngồi cạnh để chạy lại.

---

## Vì sao một ca đỏ giả nguy hiểm hơn vẻ ngoài

Repo đã có sẵn bài học này, và chính nó là lý do phải ghi vé:

> *"Một bộ test đỏ vì môi trường thì người ta học cách bỏ qua nó — rồi bỏ qua luôn lần nó đỏ
> THẬT."* (`.claude/rules/prisma-db.md`, sự cố 09/09/2026, 9 ca đỏ giả vì thiếu biến môi
> trường.)

Tôi đã thấy ca này đỏ **bốn lần trong một ngày** và mỗi lần đều nói "không liên quan, chạy
lại là xanh". Câu ấy đúng cả bốn lần — và đó chính là cách một thứ hỏng trở thành bình
thường.

---

## Hướng vá — chưa làm, ghi lại để khỏi nghĩ lại từ đầu

Theo thứ tự ưu tiên, và cả ba đều KHÔNG phải nâng trần:

1. **Dựng `Linter` MỘT LẦN cho cả file test** (`beforeAll`) thay vì mỗi ca một lần. Phần tốn
   thời gian là khởi tạo, không phải phép lint. Đây gần như chắc chắn là chỗ sửa đúng.
2. **Tách file này khỏi bộ chạy song song** nếu nó thật sự cần nhiều CPU — cùng cách repo đã
   làm với `vitest.cham-cong.config.ts`.
3. Nếu sau cả hai vẫn còn dao động: đo thời gian thật của từng bước để biết cái gì chậm, rồi
   mới quyết. **Đừng đoán.**

### Cách kiểm đã vá thật (luật 8)

Không chấp nhận "chạy lại thấy xanh". Phải:
- chạy `pnpm test:unit` đầy đủ **trong lúc máy đang bận** (dev server + một bộ Playwright),
  lặp 3 lượt, cả 3 xanh;
- và in thời gian của ca ấy để thấy nó xuống hẳn dưới trần, chứ không phải chỉ vừa lọt.

---

## Đọc kèm

- `docs/luat-doc-so-va-ket-luan.md` — luật 18 (mỗi ca phải xanh khi chạy một mình) và luật 19
  (test không được đọc đồng hồ thật). Ca này là luật 18 ở chiều ngược.
- `docs/cham-cong/VE-RA-CACH-LY-BO-TEST.md` — danh sách các ca còn phải rà cách ly. Vé này
  thuộc cùng họ; khi nào làm thì làm chung một đợt.
