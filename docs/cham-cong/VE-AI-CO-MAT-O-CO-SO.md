# VÉ — danh sách "ai có mặt ở cơ sở tôi hôm nay"

> **Trạng thái:** MỞ, chưa làm. Ghi 13/09/2026, tách ra từ bản vá mục 2 (PR #243).
> **Nhu cầu này là THẬT.** Vé tồn tại để nó không mất theo bản vá.
> **Chỗ trong hàng:** đề xuất 15/09 — **gộp vào mục 5**, làm **SAU phần A**. Lý do ở cuối vé.

---

## Vì sao có vé

PR #243 gỡ một nguồn khỏi danh sách người của **Bảng công ngày**: trước đó sổ công của một
cơ sở gộp thêm `StaffTimeLog where centerId = <cơ sở đang xem>`, tức **ai quét ở đây cũng
vào sổ ở đây**, dù ngày công của họ thuộc nơi khác.

Lý do gỡ — **luật 5**, chứ không phải "cái kia thừa":

> Nguồn thứ ba trộn **HAI câu hỏi khác nhau** vào một danh sách:
> · *"sổ công của cơ sở tôi"* — **ai ăn công ở đây**;
> · *"ai có mặt ở cơ sở tôi hôm nay"* — **ai đứng ở đây**.
>
> Chốt 07/09 dùng câu hỏi **hai** để bù cho câu hỏi **một**. Đó đúng là hình dạng luật 5:
> một tập dựng cho mục đích A đem phục vụ mục đích B mà chưa kiểm lại định nghĩa.

Sổ công nay chỉ trả lời câu hỏi **một**. Câu hỏi **hai** mất chỗ — và nó là nhu cầu vận hành
thật: quản lý cơ sở cần biết hôm nay ai ghé.

⚠️ Cái **mất** cụ thể: người CS1 quét ở CS2 **không còn hiện trên sổ công CS2**. (Họ vẫn hiện
trên sổ CS1 — nơi chịu công — kèm nhãn `· quét ở CS2` do D1 in ra.)

---

## Việc phải làm

Một danh sách **LƯỢT QUÉT tại cơ sở này**, **tách hẳn** khỏi sổ công:

- đọc **thẳng** `StaffTimeLog where centerId = <cơ sở> AND workDate = <ngày>`;
- **không** join vào `StaffAttendanceDay`, **không** hiện cột công / giờ làm — đó là số của
  sổ công, và sổ công của cơ sở khác mới có thẩm quyền về nó;
- mỗi dòng: người · giờ vào/ra · điểm chấm cụ thể (`workLocationId`) · cờ của lượt;
- nói rõ khi người đó **không thuộc** cơ sở này ("ngày công thuộc CS1") để không ai đọc nhầm
  thành "người của tôi".

Đặt ở đâu: **chưa chốt**. Ứng viên là một tab cạnh Bảng công ngày, hoặc một mục trong
`module-nav`. ⚠️ Nếu thêm route mới thì `href` phải là **chuỗi literal** trong một trong ba
file nav — `components/admin/cham-cong/{module-nav,config-tabs,me-nav}.tsx` — vì
`nav-coverage.test.ts` quét đúng vị trí đó, và đó là lối vào duy nhất.

---

## Ràng buộc

- **`scopedDb` vẫn gác.** Quản lý cấp cơ sở chỉ thấy lượt của cơ sở mình — đó là cách ly
  đúng, không phải thiếu sót.
- **Không được trộn ngược lại vào sổ công.** `nguoiThuocSoCong`
  (`lib/cham-cong/noi-chiu-cong.ts`) cố ý chỉ nhận hai nguồn, và chữ ký ấy là cổng: thêm
  nguồn thứ ba vào là `tsc` đỏ. Danh sách mới phải là **màn riêng**, không phải tham số mới.
- **Đây là danh sách LƯỢT, không phải danh sách NGƯỜI.** Một người quét bốn lượt thì có bốn
  dòng — gộp về người là bắt đầu trượt trở lại thành một thứ trông giống sổ công.

---

## Liên quan

- `lib/cham-cong/noi-chiu-cong.ts` — luật NƠI CHỊU CÔNG vs NƠI QUÉT, và vì sao sổ công chỉ
  có hai nguồn.
- `lib/cham-cong/noi-quet.ts` (D1) — nhãn `· quét ở CS2` trên dòng của người đó tại cơ sở
  chịu công.

---

## Chỗ trong hàng — đề xuất 15/09/2026

**Gộp vào mục 5 (Nội quy & thống kê), và làm SAU phần A (công tác).**

### Vì sao SAU phần A, không phải trước

Phần A định nghĩa lại **"có mặt" nghĩa là gì**. Hôm nay `NG` (công tác ngoài) mang
`attendanceMode: OPTIONAL` — người đi công tác **không quét gì cả** mà vẫn đủ công. Dựng màn
"ai có mặt" trước phần A thì nó trả lời được đúng một nửa:

| người | hôm nay màn sẽ nói | sự thật |
|---|---|---|
| quét ở CS1 | có mặt ở CS1 | ✔ |
| đi công tác (`NG`), không quét | **không thấy ở đâu cả** | đang làm việc, ở ngoài |
| đi công tác, có quét ở nơi đến | có mặt ở nơi quét | ✔ nhưng chỉ sau phần A mới có nút để quét |

Phần A đảo `NG` sang **1 cặp quét** và thêm hai nút check-in/out ở "Của tôi". Sau đó câu hỏi
"ai có mặt" mới có đủ ba trạng thái thật: **ở cơ sở · đi công tác · chưa rõ**. Làm trước là
dựng một màn rồi phải dựng lại.

### Vì sao GỘP vào mục 5, không làm riêng

Câu hỏi trung tâm của mục 5 do chính chủ dự án đặt:

> *"Dữ liệu nào ĐÃ CÓ trong DB mà màn chưa dùng? Đây là câu chính — nhiều khả năng ta đã có
> số, chỉ chưa bày ra."*

Vé này **chính là một câu trả lời cho câu hỏi đó**: `StaffTimeLog` đã ghi đủ nơi quét và giờ
quét từ lâu; thứ thiếu là một màn đọc nó theo trục *"đứng ở đâu"* thay vì trục *"ăn công ở
đâu"*. Khảo sát mục 5 sẽ đi qua đúng bảng ấy — tách ra làm riêng là **soi cùng một bảng hai
lần và thiết kế cùng một màn hai lần**.

⚠️ Nhưng **giữ hai con số tách bạch trên màn**, đừng gộp lại: *"ai ăn công ở đây"* và *"ai
đứng ở đây"* là hai câu hỏi khác nhau — trộn chúng đúng là lỗi mà PR #243 vừa gỡ. Gộp ở đây
nghĩa là **cùng một lượt làm**, không phải cùng một con số.

### Nếu chủ dự án muốn sớm hơn

Đường ngắn nhất không cần chờ phần A: thêm một **tab** vào màn `/cham-cong` hiện có, đọc
`StaffTimeLog` theo ngày × cơ sở, và **nói thẳng trong nhãn** rằng nó chưa biết ai đang đi
công tác. Nhãn nói ra giới hạn thì màn vẫn dùng được; nhãn im thì nó là một danh sách thiếu
người mà không ai biết là thiếu.
