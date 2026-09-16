# PHIÊN 1 — Chạy bóng parser trên dữ liệu thật (chỉ đọc)

> **Không một dòng mã chạy thật nào bị sửa.** Bộ chạy bóng là tệp tạm đã xoá sau khi đo;
> commit này chỉ có tài liệu, hai tệp bằng chứng, và câu SQL cho prod.
>
> Đo **16/09/2026**, `satarobo_local`, sau commit `52317ce2`.

---

## 0. Đọc mục này trước — phép đo này KHÔNG nói được điều bạn muốn biết nhất

Nhiệm vụ là chạy parser trên "dữ liệu thật" của dev + test. Đo được:

| DB | Giao dịch | Ghi chú |
|---|---|---|
| `satarobo_local` | **431** | DB dev đang làm việc — dữ liệu duy nhất có |
| `satarobo_test` | **0** | schema đã áp, chưa có dòng nào |
| `satarobo_dev` | — | không có cả bảng `BankTransaction` (DB cũ, bỏ) |
| Supabase dev/test | **không tới được** | worktree này không có `.env`; `.env.local` trỏ `satarobo_local` |

Và 431 dòng đó **không phải nội dung chuyển khoản của ngân hàng**:

| provider | số dòng | nội dung |
|---|---|---|
| `BACKFILL` | 380 | `Backfill sổ cũ · đơn ORD--CS1--20-2` — chuỗi do **script backfill tự ghi** |
| `SEPAY` | 51 | `Hoc phi 0053` · `CK 726359 khong ro noi dung` — chuỗi **seed** |

⇒ **Không dòng nào từng đi qua ngân hàng.** Mọi tỷ lệ dưới đây là tỷ lệ trên dữ liệu seed, và
chúng KHÔNG dự đoán được prod. Phép đo thật nằm ở `bong-parser-PROD.sql` (5 câu, chỉ đọc, SĐT
đã che còn 4 số cuối) — cần chạy trên Supabase SQL Editor.

Dù vậy, hai thứ ở đây **vẫn có giá trị thật**, vì chúng không phụ thuộc dữ liệu là seed hay không:
mục 3 (parser có sai không) và mục 4 (tỷ lệ dương tính giả trên văn bản tiếng Việt).

---

## 1. Bảng kết quả — 431 giao dịch

| Bậc khớp | Số ca | Tỷ lệ |
|---|---|---|
| **Bậc 1** (khớp theo mã) | **1** | 0,2% |
| **Bậc 2** (khớp theo SĐT, duy nhất) | **0** | 0% |
| **Bậc 3** — `KHONG_DOC_DUOC` | **430** | 99,8% |
| Bậc 3 — `MA_KHONG_RA_PHIEU` / `SDT_*` | 0 | 0% |

| So với phân bổ ĐANG CÓ | Số ca | Tiền |
|---|---|---|
| **CÙNG** — parser chọn đúng phiếu đang được gắn | 1 | 2.617.000đ |
| **CÙNG** — cả hai đều không gắn gì | 136 | 539.790.000đ |
| **KHÁC** — parser bỏ sót (đang gắn, parser không đọc ra) | **294** | 1.200.598.000đ |
| **KHÁC** — parser khớp thêm (đang trống, parser gắn được) | 0 | — |
| **KHÁC** — parser chọn phiếu KHÁC phiếu đang gắn | **0** | — |

**Số ca mã khớp nhưng SĐT lệch chủ phiếu: 0.** Không memo nào trong 431 dòng chứa số điện thoại
10 số, nên vế đối chứng chưa từng được kích hoạt ở đây.

Bằng chứng đầy đủ (không lấy mẫu): `do-bong/ca-khac-day-du.txt` (294 dòng) ·
`do-bong/chi-tiet-431-giao-dich.csv` (431 dòng).

---

## 2. Mọi ca KHÁC — liệt kê đủ, gom theo hình dạng

Cả **294** ca KHÁC đều là `provider = BACKFILL`, và đều đúng một hình dạng: memo mang **MÃ ĐƠN**,
còn phiếu thu đang gắn mang **MÃ PHIẾU** — hai chuỗi khác nhau.

| Hình dạng memo (số đã thay bằng `#`) | Số ca |
|---|---|
| `Backfill sổ cũ · đơn ORD--CS#--#-#` | 227 |
| `Backfill sổ cũ · đơn ORD--CS#-#-#-#` | 35 |
| `Backfill sổ cũ · đơn ORD-CS#-#-#-#` | 18 |
| `Backfill sổ cũ · đơn ORD-CS#--#-#` | 13 |
| `Backfill sổ cũ · đơn ORD-#-#` | 1 |
| **Tổng** | **294** |

Một ca cụ thể, đọc cho hết:

```
memo      : "Backfill sổ cũ · đơn ORD--CS1--20-2"
sau chuẩn hoá : BACKFILLSOCUDONORDCS1202
phiếu đang gắn: cmu1extzi… — matchKey ORDCS1202D0
parser        : ma=null  maCu=null  sdt=null  → bậc 3
```

Chuỗi sạch chứa `ORDCS1202` (mã đơn) nhưng **không chứa `ORDCS1202D0`** (mã phiếu) — thiếu hậu
tố `D0`. Khuôn đời cũ neo hai đầu đòi `ORD…D<số>`, nên không khớp. **Đúng.**

⇒ 294 ca này được gắn bởi **script backfill**, thứ biết thẳng `orderId` chứ không đọc memo. Không
đường nào trong hệ thống từng parse chúng, và sau khi bật luồng mới cũng sẽ không.

---

## 3. Có ca KHÁC nào do PARSER SAI không? — **KHÔNG**

Đây là câu hỏi quan trọng nhất của phiên, và nó trả lời được **không phụ thuộc** dữ liệu là seed.

Phép kiểm: quét 431 memo, hỏi *"chuỗi sạch của memo này có CHỨA một `matchKey` đang tồn tại trên
DB không?"* — nếu có mà parser không tìm ra thì parser sai.

```
số memo chứa một matchKey thật : 1
  → "ORD260915000007D2 TEN_094"   (matchKey ORD260915000007D2)
parser tìm ra                  : 1/1  ✓  và chọn đúng phiếu đang được gắn
```

**Không có ca nào parser bỏ sót một mã thật sự có trong memo, và không có ca nào parser chọn nhầm
phiếu khác.** Nên không sửa parser, và không thêm ca test từ memo thật — spec nói thêm ca *"nếu
có ca KHÁC do parser sai"*, và không có ca nào như vậy.

⚠️ Giới hạn của kết luận này: nó chứng minh parser đúng trên **những hình dạng memo có ở đây**.
Hình dạng memo ngân hàng thật (`MBVCB.`, `.CT TU`, dấu `-`/`_`) chỉ được phủ bằng ca test dựng
tay ở `[MCK-03]`, chưa bằng dữ liệu thật. Câu 4 của `bong-parser-PROD.sql` là để đóng khoảng đó.

---

## 4. Phát hiện đáng giá nhất: **bảng chữ lọc mạnh hơn checksum ~1.400 lần**

Rủi ro đã biết của cửa sổ trượt: một khối 5 ký tự trong tên khách tình cờ qua checksum và bị
nhận nhầm là mã. Lý thuyết cho ≈ **1/27**. Đo trên 431 memo thật:

| Tầng lọc | Cửa sổ còn lại | Tỷ lệ |
|---|---|---|
| Tổng cửa sổ 5 ký tự đã quét | **8.041** | 100% |
| Sau **MỎ NEO** (ký tự đầu phải là chữ cái của bảng) | 4.412 | 54,9% |
| Sau **BẢNG CHỮ** (loại `O·0·I·1·L·B·8·S·5`) | **3** | 0,04% |
| Sau **CHECKSUM** | **0** | 0% |

| Kỳ vọng dương tính giả | Số ca |
|---|---|
| Nếu CHỈ có checksum | ≈ **298** |
| Có bảng chữ + checksum | ≈ **0,1** |

**Chín ký tự bị loại được chọn vì lý do NGƯỜI** — sale đọc mã cho phụ huynh qua điện thoại, và
`O/0 · I/1/L · B/8 · S/5` là bốn cặp phải giải thích mỗi cuộc gọi. Hoá ra chúng cũng là **bộ lọc
dương tính giả chính**: văn bản tiếng Việt đã bỏ dấu đặc sệt `O`, `I`, `L`, `S`, `B`, nên rất
hiếm khi có 5 ký tự liên tiếp nằm trọn trong bảng 27 ký tự.

Hệ quả thực dụng: danh sách `ungVien[]` trong parser (viết ra vì lo tỷ lệ 1/27) trên thực tế gần
như luôn có 0 hoặc 1 phần tử. Vẫn giữ — nó rẻ, và con số 0,1 là kỳ vọng chứ không phải bảo đảm —
nhưng đừng tối ưu gì quanh nó.

⚠️ Con số này đo trên văn bản tiếng Việt bỏ dấu của memo seed. Memo ngân hàng thật có thêm dãy số
dài (`MBVCB.3021234567`), mà chữ số thì phần lớn NẰM TRONG bảng chữ (`2346 79`). Nên tỷ lệ trên
prod có thể cao hơn — và mỏ neo "ký tự đầu là chữ cái" mới là thứ chặn ở đó. Câu 4 của SQL prod
cho phép đo lại.

---

## 5. "18 đơn / 178.544.000đ" — **chưa trả lời được ở đây**

Con số đó đo trên **PROD** ngày 16/09, và là phép đo *"tiền đã về mà khoản chưa gắn GHI DANH"*
(`Payment.enrollmentId IS NULL`). `satarobo_local` không có tập đó.

Phép đo gần nhất có ở local là một câu hỏi KHÁC — *"giao dịch chưa có phân bổ nào"*:

```
giao dịch chưa gắn phân bổ  : 136
tổng tiền                   : 539.790.000đ
parser đọc được gì đó       : 0 / 136
```

Hai con số này **không so sánh được với 18/178.544.000** — khác sổ, khác DB. Câu 3 của
`bong-parser-PROD.sql` là câu đo đúng tập đó trên prod.

---

## 6. Việc cần anh làm

Mở Supabase SQL Editor (prod), chạy `docs/thanh-toan-linh-hoat/bong-parser-PROD.sql`:

| Câu | Trả về | Dùng để |
|---|---|---|
| 1 | bảng nhỏ | biết prod có bao nhiêu memo THẬT (không phải chuỗi backfill) |
| 2 | 1 dòng | giao dịch chưa vào phiếu thu |
| 3 | 1 dòng | **đúng tập "18 đơn / 178.544.000đ"** |
| 4 | một ô JSON | xuất memo + phân bổ hiện tại để chạy parser thật |
| 5 | một ô JSON | danh mục phiếu để tra mã |

Câu 4–5 đã **che số điện thoại còn 4 số cuối**. Nội dung chuyển khoản giữ nguyên văn vì đó chính
là thứ cần parse. Nếu không muốn nội dung rời prod thì chạy câu 1–3 và báo số — phép đo hẹp hơn
nhưng vẫn kết luận được về tỷ lệ theo bậc.
