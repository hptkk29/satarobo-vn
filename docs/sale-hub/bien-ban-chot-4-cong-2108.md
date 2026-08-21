# Biên bản chốt — 4 cổng chặn của module Site Sale

> **Ngày chốt:** 21/08/2026 · **Người chốt:** chủ dự án (qua phiên làm việc trực tiếp) · **Người ghi:** phân tích nghiệp vụ
> **Căn cứ trình:** `satarobo-sale/plan/00-TOM-TAT-DIEU-HANH.md` §3 (bốn cổng chặn cứng) — lập 20/08/2026
> **Hiệu lực:** ngay. Ba trong bốn cổng mở đường cho code; cổng G-B đảo một dòng của Doc 15 nên đã ghi addendum tại chỗ.

---

## 1. Bốn quyết định

| # | Cổng | Phương án đã trình | **QUYẾT ĐỊNH 21/08** |
|:--:|---|---|---|
| **G-A** | Quyền `orders:create` cho `SALES_CSM` — không có nó Sale không tạo được đơn ⇒ không thu tiền ⇒ không chốt khách | Cấp **action hẹp** `orders:create` (chỉ đơn gắn lead của mình), **không** cấp `orders:manage` | ✅ **DUYỆT** — nguyên văn: *"mở quyền tạo đơn hàng cho sale"* |
| **G-B** | AI chấm điểm chất lượng tư vấn là scope **đã bị loại** bằng văn bản (Doc 15 §0) — cần phiếu đảo | Ký phiếu đảo **hẹp**, chỉ cho chấm điểm hội thoại bán hàng của nhân viên | ✅ **ĐÃ KÝ** — nguyên văn: *"ký, thực hiện đi"* |
| **G-C** | Thẻ điểm SR.QD.223 + phụ lục **không có trong hệ thống** ⇒ engine chấm điểm không có đầu vào | Nạp văn bản gốc vào kho tài liệu | ✅ **THAY BẰNG:** dựng **một bộ thẻ điểm giả định để xem thử** trước — nguyên văn: *"làm giả định 1 bộ thẻ điểm mẫu xem thử"* |
| **G-D** | Host site Sale + số phận biểu mẫu công khai — bản 16/07 giữ, bản 19/08 bỏ | Đo lưu lượng trước khi tắt, vì lo mất một nguồn khách đang sống | ✅ **DUYỆT THỰC HIỆN** + **đính chính dữ kiện** (mục 3) — nguyên văn: *"sale.satarobo.vn hiện tại là biểu mẫu dành cho marketing, sale admin nhập các lead thu được từ fb ads về chứ không phải là nguồn khách hàng vào nhập thông tin nên cứ thực hiện đi, sau đó tôi sẽ thông báo nội bộ sau"* |

---

## 2. Phạm vi của phiếu đảo G-B — đọc kỹ, đây là chỗ dễ nới rộng nhất

Doc 15 §0 loại **"AI (toàn bộ)"**. Phiếu này đảo **một mục duy nhất**:

| Trạng thái | Mục |
|---|---|
| ✅ **NAY TRONG CORE** | **AI chấm điểm chất lượng tư vấn của nhân viên bán hàng** — đọc hội thoại đã phát sinh, chấm theo thẻ điểm G1–G8, sinh nhận xét và đề xuất câu thay thế |
| ❌ **VẪN LOẠI — không đảo** | AI Tutor · AI learning path · AI prediction · AI CRM assistant tự hành động · **AI chấm điểm học viên** · AI camera / sinh trắc / định vị học sinh · mọi AI **ra quyết định nhân sự thay người** |

**Bốn ràng buộc đi kèm phiếu đảo, không tách rời:**

1. **Kết quả sinh ra ở trạng thái *chờ phúc tra*.** Không có đường nào cho điểm tự công bố.
2. **Không gắn trực tiếp vào lương hoặc kỷ luật — không bao giờ, không có mốc ân hạn.** Điểm chỉ là **một đầu vào** cho đánh giá kỳ do **người** quyết, đi qua quy chế lương-thưởng đã ký. Căn cứ: Bộ luật Lao động cấm phạt tiền / cắt lương thay xử lý kỷ luật.
3. **Hậu kiểm bằng chứng bắt buộc:** mọi mục trừ điểm phải kèm trích dẫn tồn tại **nguyên văn** trong hội thoại gốc; không khớp thì loại mục trừ điểm đó. Không có cơ chế này thì máy sẽ "nhớ" ra câu nhân viên chưa từng nói.
4. **Cờ tắt được + trần chi phí.** Engine chạy sau một cờ mặc định TẮT, và dừng khi chạm trần chi phí kỳ.

> Đã ghi addendum vào Doc 15 tại hai chỗ: §0 bảng *"Đã LOẠI khỏi core"* dòng **AI (toàn bộ)**, và §11 dòng *"KHÔNG đưa lại vào core"*. Theo đúng tiền lệ đảo site giáo viên (phiếu BGĐ câu 7, 04/07/2026).

---

## 3. ⚠️ ĐÍNH CHÍNH DỮ KIỆN QUAN TRỌNG (G-D) — làm sai lệch nhiều tài liệu đã viết

**Chủ dự án đính chính:** `sale.satarobo.vn` **không phải** điểm chạm của khách hàng. Đó là **biểu mẫu nội bộ** để **marketing và sale-admin nhập lead thu được từ quảng cáo Facebook** vào hệ thống.

**Hệ quả — ba lo ngại lớn trong bộ tài liệu 20/08 nay không còn đúng:**

| Tài liệu | Đang viết | Sự thật |
|---|---|---|
| `plan/00 §3 G-D` · `_scout/00 §6 D3` · `plan/10` | *"Form đang chạy quảng cáo thật, tắt = tắt một nguồn lead đang sống"* | **Sai.** Không có khách vãng lai nào vào đó. Bắt buộc đăng nhập **không mất khách nào** |
| `plan/09 §4 L2` (đã đính chính một lần) | *"Cần đo lưu lượng trước khi chuyển"* | Không cần đo để **quyết**; vẫn nên đo để biết khối lượng nhập liệu của marketing |
| `plan/02` · `plan/03` | Coi đây là kênh thu khách | Đây là **kênh nhập liệu nội bộ** — không tính vào phễu marketing như một nguồn riêng |

**Ngược lại, phát sinh một rủi ro mới cần canh:** người dùng thật của biểu mẫu này là **nhân viên đang làm việc hằng ngày**. Bắt buộc đăng nhập là đúng, nhưng nếu làm gãy thói quen nhập liệu của họ thì **lead ngừng chảy vào hệ thống ngay hôm đó**. Vì vậy:

- Đường nhập cũ **không được tắt đột ngột** — chuyển tiếp phải có giai đoạn cả hai cùng chạy.
- Chủ dự án đã nói rõ: *"sau đó tôi sẽ thông báo nội bộ sau"* ⇒ **kỹ thuật làm trước, thông báo sau, và không được tắt đường cũ trước khi có thông báo**.

---

## 4. Việc phát sinh từ 4 quyết định

| # | Việc | Thuộc cổng | Trạng thái |
|:--:|---|:--:|---|
| 1 | Thêm action `orders:create` — đồng bộ đủ 4 bước (ma trận v1 · registry · seed vai · test parity) | G-A | ⬜ |
| 2 | Chặn phạm vi: Sale chỉ tạo được đơn gắn lead **của mình** — guard ở tầng server, không chỉ ẩn nút | G-A | ⬜ |
| 3 | **Chạy tay `seed-prod-roles.yml`** sau khi merge lên `main` — nếu quên, prod thiếu quyền dù mã nguồn đã đúng | G-A | ⬜ **bắt buộc, người vận hành** |
| 4 | Addendum Doc 15 (2 chỗ) | G-B | ✅ **xong 21/08** |
| 5 | Bộ thẻ điểm mẫu để xem thử — `satarobo-sale/plan/23-THE-DIEM-MAU-G1-G8-GIA-DINH.md` | G-C | ✅ **xong 21/08** |
| 6 | Trả lời 12 câu ở §8 của bộ thẻ điểm mẫu để biến nó thành bản chính thức | G-C | ⬜ chủ dự án |
| 7 | Trang nhập khách hàng **có đăng nhập**, bỏ ô mã nhân viên (lấy từ phiên đăng nhập) | G-D | ⬜ |
| 8 | Giai đoạn chạy song song + thông báo nội bộ cho marketing / sale-admin trước khi tắt đường cũ | G-D | ⬜ chủ dự án |
| 9 | Sửa 3 tài liệu đang mô tả sai bản chất của `sale.satarobo.vn` (mục 3) | G-D | ⬜ |

---

## 5. Điều biên bản này **không** chốt

Bốn cổng đã mở không có nghĩa mọi câu hỏi đã có đáp án. Còn nguyên trên phiếu ký `plan/19-CAU-HOI-CAN-CHOT.md`:

- Bệnh thật của việc chia lead (chờ 5 truy vấn chẩn đoán) và mục tiêu công bằng.
- `Lead.isSharedWithTeam` — hai chữ ký cũ đang đá nhau.
- Quản lý cơ sở và marketing còn thấy số điện thoại đầy đủ hay không.
- Ngân sách nhà cung cấp và khung pháp lý đang áp dụng.
- Thời hạn lưu bản ghi âm.

---

**Ngày chốt:** 21/08/2026
**Người chốt:** ☐ ______________________ *(chủ dự án ký tên — bản này ghi lại nội dung đã quyết trong phiên làm việc, chưa có chữ ký giấy)*
**Người ghi biên bản:** phân tích nghiệp vụ
