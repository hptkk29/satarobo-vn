# Hoàn tiền → công nợ & cổng phụ huynh (đợt vá 27/08/2026)

> Người thực hiện các bước chạy tay: **Dev / người vận hành**. Agent chỉ soạn script và
> chạy dry-run trên DB test. **Không agent nào chạy bước nào của file này trên DB thật.**

## 0. Lỗi là gì

`refundPayment()` (`lib/finance/payment.ts:599`) ghi mỗi lần hoàn thành **một bản ghi
MỚI mang số ÂM**, trạng thái `REFUNDED`, trỏ `adjustmentOfId` về bản gốc — bản gốc
`CONFIRMED` **không bị xoá, không bị sửa**. `adjustPayment()` cũng vậy: bản mới
`ADJUSTED`, bản gốc giữ nguyên.

Đường doanh thu đã học bài này từ đợt B-02 (24/08) và có sẵn một công thức đúng dùng
chung: `lib/finance/thuc-thu.ts`. Nhưng **bốn đường khác chưa nối vào**, vẫn lọc cứng
`accountantStatus: "CONFIRMED"`:

| Đường | Tệp | Hậu quả |
|---|---|---|
| Công nợ admin | `lib/finance/debt.ts:134` | Bảng `/admin/cong-no` coi tiền đã trả lại vẫn là tiền đã thu |
| Học phí phụ huynh | `lib/portal/billing.ts:226` | PH hoàn tiền xong vẫn thấy nguyên số đã đóng |
| Học phí theo con | `lib/portal/billing-student.ts:57` | như trên |
| Bảng điều khiển PH | `lib/portal/dashboard.ts:58,189` | thẻ "Công nợ còn lại" sai theo |
| **Đề xuất hoàn tiền** | **`lib/finance/refund.ts:81`** | **`paidConfirmed` tính trên số GỘP ⇒ lần hoàn thứ hai đề xuất như thể lần một chưa xảy ra. Đây là đường hoàn DƯ — mất tiền thật, không phải lỗi hiển thị.** |

## 1. Thứ tự BẮT BUỘC

Sai thứ tự không hỏng dữ liệu, nhưng sẽ thông báo sai chiều cho phụ huynh và phải xin lỗi
lần thứ hai.

```bash
# (1) ĐO TRƯỚC trên PROD — CHỈ ĐỌC, không có --apply và sẽ không bao giờ có
pnpm tsx scripts/hoan-tien-do-lech-cong-no.ts                 # ghi danh có hoàn/điều chỉnh
pnpm tsx scripts/hoan-tien-do-lech-cong-no.ts --csv > do.csv  # bản dán vào bảng tính
pnpm tsx scripts/hoan-tien-do-lech-cong-no.ts --all           # đối chứng: toàn bộ ghi danh

# (2) Đọc kết quả (mục 2 dưới đây), RỒI soạn thông báo theo mẫu ở mục 3

# (3) Gửi thông báo cho kế toán + quản lý cơ sở TRƯỚC khi merge lên main

# (4) Merge test → main (Vercel deploy). KHÔNG có migration nào trong đợt này.

# (5) Chạy lại (1) sau khi deploy — số "cách ĐÚNG" phải khớp thứ màn hình đang hiện
```

**Không có migration, không có backfill, không có script ghi.** Đợt này chỉ đổi công thức
đọc. Rollback = revert commit, không mất dữ liệu.

## 2. Đọc kết quả đo thế nào

Script in, cho từng ghi danh có dính hoàn/điều chỉnh: đã thu theo **cách CŨ** (thứ phụ
huynh đang thấy), đã thu theo **cách ĐÚNG**, chênh lệch, công nợ cũ/mới, số lần hoàn, và
các cờ cảnh báo.

Ba cách đọc SAI thường gặp:

1. **"0 dòng lệch" ≠ "lỗi không tồn tại."** Nó chỉ có nghĩa là **chưa ai bấm hoàn tiền**.
   Lỗ vẫn nguyên và sẽ mở ra ở lần hoàn đầu tiên. (Đúng bài học `OQ-B2` của B-02: 0 dòng
   điều chỉnh chồng chỉ có nghĩa là chưa ai bấm hai lần.)
2. **Đừng hứa trước chiều thay đổi.** B-02 đã viết thông báo "doanh thu sẽ TỤT", đo xong
   mới thấy có màn **nhảy lên** và phải soạn lại câu chữ. Ở đợt này chiều cũng không đồng
   nhất: số "đã thanh toán" của PH **giảm**, còn **công nợ có thể tăng** trên chính màn đó.
3. **Cờ 🔴 phải xử lý trước khi thông báo**, không phải sau:
   - `Tổng đã hoàn VƯỢT tổng đã thu` — tiền đã ra khỏi két nhiều hơn tiền vào. Đây là
     thiệt hại đã xảy ra, cần kế toán đối chiếu tay từng ca.
   - `Đã duyệt hoàn nhưng kế toán chưa ghi bút toán âm` — `approveRefund()` chỉ đổi trạng
     thái yêu cầu, nó **không** ghi `Payment` âm (không có FK nối `RefundRequest` với
     `Payment`). Mỗi dòng này là một khoản đã hứa trả mà sổ chưa biết.
   - `Tổng đề xuất đã duyệt VƯỢT tổng đã thu` — dấu vết của chính đường hoàn dư.

## 3. Mẫu thông báo (soạn sẵn — CHƯA GỬI)

> ⚠️ **Ba mẫu dưới đây là bản nháp có chỗ trống.** Điền số thật từ bước (1) rồi mới gửi.
> Không gửi khi chưa đo. Không tự ý gửi — đây là việc của chủ dự án / BGĐ.

### 3a. Cho kế toán + quản lý cơ sở (gửi TRƯỚC khi lên prod)

> **Về việc điều chỉnh cách tính "đã thu" trên bảng công nợ và cổng phụ huynh**
>
> Từ ngày &lt;NGÀY&gt;, các màn **Công nợ** (admin) và **Học phí** (cổng phụ huynh) sẽ tính
> "đã thu" giống hệt cách báo cáo doanh thu đang tính: **khoản đã hoàn lại cho phụ huynh
> được trừ ra, và khoản đã được kế toán điều chỉnh thì lấy theo số sau điều chỉnh.**
>
> Trước đây hai màn này chỉ cộng các khoản trạng thái "đã xác nhận", nên tiền đã hoàn vẫn
> nằm trong số "đã thu". Đây là lỗi của phần mềm, không phải do ghi sổ sai.
>
> Mức thay đổi đã đo trên dữ liệu thật ngày &lt;NGÀY ĐO&gt;:
> - Số ghi danh có thay đổi: **&lt;N&gt;**
> - Tổng "đã thu" hiển thị: **&lt;CŨ&gt; → &lt;MỚI&gt;**
> - Tổng công nợ hiển thị: **&lt;CŨ&gt; → &lt;MỚI&gt;**
>
> Các báo cáo **doanh thu, ROAS, hoa hồng và bảng điều khiển kế toán không đổi số** — chúng
> đã dùng đúng công thức này từ đợt 24/08.
>
> Danh sách chi tiết từng ghi danh: &lt;đính kèm do.csv&gt;. Anh/chị rà giúp các dòng có
> đánh dấu 🔴 trước ngày &lt;NGÀY&gt;.

### 3b. Cho phụ huynh — trường hợp số "Đã thanh toán" GIẢM (đã được hoàn tiền)

Gửi **riêng từng phụ huynh có tên trong danh sách đo**, không gửi đại trà.

> Kính gửi Quý phụ huynh,
>
> Sata Robo xin thông tin về mục **Học phí** trên cổng phụ huynh của bé
> **&lt;TÊN HỌC VIÊN&gt;**.
>
> Trước đây, phần mềm hiển thị số **&lt;SỐ CŨ&gt;** ở mục "Đã thanh toán". Con số này chưa
> trừ khoản **&lt;SỐ ĐÃ HOÀN&gt;** mà trung tâm **đã hoàn lại** cho gia đình ngày
> &lt;NGÀY HOÀN&gt;. Từ hôm nay, mục này hiển thị **&lt;SỐ MỚI&gt;** — là số tiền trung tâm
> thực nhận sau khi đã hoàn.
>
> **Đây chỉ là điều chỉnh cách hiển thị. Số tiền gia đình đã đóng và số tiền đã được hoàn
> đều không thay đổi, và khoản hoàn đã được chuyển đủ cho gia đình.** Trong mục "Sổ thu &
> hoàn tiền" ở cuối trang, Quý phụ huynh sẽ thấy đầy đủ cả dòng đã đóng lẫn dòng đã hoàn.
>
> &lt;Nếu công nợ đổi, thêm đoạn này:&gt;
> Do khoản trên được hoàn lại, mục "Công nợ" của bé được cập nhật thành **&lt;CÔNG NỢ MỚI&gt;**.
>
> Nếu con số nào chưa khớp với ghi nhận của gia đình, xin Quý phụ huynh liên hệ &lt;HOTLINE&gt;
> để chúng tôi đối chiếu ngay. Trung tâm thành thật xin lỗi vì sự bất tiện này.
>
> Trân trọng,
> Sata Robo

### 3c. Trả lời khi phụ huynh hỏi lại ("sao tôi đóng &lt;X&gt; mà chỉ ghi &lt;Y&gt;?")

> Dạ, số **&lt;Y&gt;** là phần trung tâm **thực nhận**: gia đình đã đóng **&lt;X&gt;**, trung tâm đã
> hoàn lại **&lt;X−Y&gt;** ngày &lt;NGÀY&gt;. Cả hai dòng đều hiển thị trong mục "Sổ thu & hoàn
> tiền" ở cuối trang Học phí. Trước đây phần mềm chỉ cộng dòng đã đóng mà quên trừ dòng đã
> hoàn — chúng tôi đã sửa. Số tiền thực tế của gia đình không thay đổi.

## 4. Những màn ĐỔI SỐ và những màn PHẢI KHÔNG ĐỔI

**ĐỔI SỐ (đúng chủ đích):**

- `/admin/cong-no` — cột "đã thu" và "công nợ"
- Dashboard quản lý cơ sở — thẻ công nợ (đi qua cùng `getDebtRows`)
- Cổng PH `/portal/hoc-phi` — "Đã thanh toán", "Công nợ", và sổ thu nay có dòng hoàn
- Cổng PH trang chủ — thẻ "Công nợ còn lại", số của từng con
- Đề xuất hoàn tiền mới (`RefundRequest.paidConfirmed` / `proposedAmount`)

**PHẢI KHÔNG ĐỔI** — nếu số các màn này đổi thì đã vá sai chỗ:

- `/admin/bao-cao/doanh-thu` · dashboard kế toán · dashboard quản lý (phần **doanh thu**)
- ROAS phễu marketing (`lib/crm/funnel-query.ts`)
- Hoa hồng Sale (`lib/crm/commission-run.ts`)
- Báo cáo doanh thu theo ngày / theo con (`lib/reports/revenue-*.ts`)
- Sổ khoản thu `/admin/payments` (danh sách thô theo trạng thái — cố ý giữ nguyên)
- Bảng trạng thái kế toán trên `/admin/orders/[id]` (bóc tách theo trạng thái, không phải
  con số "đã thu")

Cả 5 nhóm đầu **đã dùng đúng `lib/finance/thuc-thu.ts` từ đợt B-02** — đợt này không chạm
vào chúng. Test `[HT-E7]` (`tests/e2e/r7/hoan-tien-cong-no.spec.ts`) chốt điều đó bằng cách
so tổng doanh thu thực thu với tổng phụ huynh nhìn thấy.

## 5. Việc CÒN LẠI, chưa làm trong đợt này

- **`RefundRequest` không có FK tới `Payment`.** `approveRefund()` đổi trạng thái, kế toán
  ghi bút toán âm ở màn khác, hai việc không nối với nhau. Đợt này chống phồng bằng cách
  trừ phần "đã duyệt chưa ghi sổ" (`soTienConCoTheHoan`), nhưng đó là suy luận theo tổng
  chứ không phải liên kết thật. Nối FK cần migration ⇒ phải là một đợt riêng, có dry-run.
- **`finalPrice` không giảm khi học viên nghỉ giữa chừng.** Vì vậy đợt này phải thêm luật
  "ghi danh đã rời lớp thì khoản hoàn không đẩy công nợ lên"
  (`TRANG_THAI_ROI_LOP` trong `lib/finance/debt.ts`). Đúng hơn là chốt lại số phải đóng
  tại thời điểm nghỉ — nhưng đó là quyết định chính sách của BGĐ, không phải việc của
  đợt vá này.
- **Bút toán hoàn không gắn ghi danh** (`enrollmentId = null`) không lọt vào bảng đo; script
  đếm và báo riêng ở cuối.

### 5b. 🔴 HAI CHỖ CÒN LỖI CÙNG LOẠI — tìm thấy nhưng CỐ Ý KHÔNG SỬA ở đợt này

Chỉ đạo cho đợt này là *"các màn báo cáo đã dùng công thức đúng nên **không được đổi số**"*.
Rà xong thì phát hiện điều đó **không đúng với hai chỗ dưới đây** — chúng có công thức
RIÊNG, và mang đúng lỗi đang vá. Sửa chúng là đổi con số trên màn báo cáo, tức là đi ngược
chỉ đạo ⇒ để chủ dự án quyết, không tự sửa.

**(1) `lib/reports/trung-tam.ts` — báo cáo trung tâm `/admin/bao-cao/trung-tam`**

- `summarizeFinance()` dòng ~76: `debt = max(0, totalReceivable − confirmedRevenue)` —
  `confirmedRevenue` chỉ cộng `CONFIRMED`. Đây là **công thức công nợ thứ ba** của hệ thống.
- `revenueByCenter()` dòng ~136: cùng lỗi, theo từng cơ sở.
- Query nguồn (`app/(admin)/admin/bao-cao/trung-tam/page.tsx:329`) **không lọc
  `deletedAt: null`** ⇒ khoản đã xoá mềm vẫn được cộng.

  **Hệ quả sau đợt vá này:** `/admin/cong-no` và `/admin/bao-cao/trung-tam` sẽ hiển thị
  **hai con số công nợ khác nhau** cho cùng một dữ liệu. Trước đợt vá chúng cùng sai nên
  cùng khớp. Cần một đợt riêng, và cần chốt trước: cột `confirmedRevenue` / `refundedAmount`
  là **bóc tách theo trạng thái** (giữ nguyên) hay là **doanh thu** (phải đổi sang thực thu)?
  Lưu ý fixture test hiện tại (`lib/reports/trung-tam.test.ts:58`) dựng `REFUNDED` mang số
  **DƯƠNG**, trong khi `refundPayment()` luôn ghi số **ÂM** — phải sửa fixture cùng lúc.

**(2) `lib/compliance/portability.ts:50` — bản xuất dữ liệu cá nhân của học viên**

Lọc `accountantStatus: "CONFIRMED"` ⇒ bản xuất liệt kê khoản đã đóng nhưng **không có dòng
hoàn tiền**. Sau đợt vá, tổng trong bản xuất sẽ **lệch với cổng phụ huynh**. Đây là dữ liệu
giao cho người dùng theo yêu cầu, nên độ ưu tiên không thấp.
