# Hồ sơ Bộ Công Thương — việc cần điều chỉnh & cập nhật

> Nguồn yêu cầu: 11 file `.docx` ở `E:\websatarobo data\Satarobo.vn\`, chốt bởi
> `0. HƯỚNG DẪN CHỈNH SỬA GIAO DIỆN WEB.docx` (5 nhóm việc + 6 ảnh chụp màn chú thích).
> Rà soát 21/09/2026 — 7 chiều song song, mỗi phát hiện được một agent độc lập kiểm chứng
> lại bằng `file:line` thật; 18 phát hiện đã bị LOẠI (xem §I, đừng mở lại).
> **82 việc còn sống: 29 CHẶN HỒ SƠ · 36 CẦN SỬA · 17 NÊN SỬA.**
> (65 từ 7 chiều rà soát + 17 do critic bổ sung.)

> 
> 📋 **Checklist nghiệm thu trên `test.satarobo.vn`:**
> [`CHECKLIST-NGHIEM-THU.md`](CHECKLIST-NGHIEM-THU.md) — viết cho người nghiệm thu, không
> cho người viết mã: mỗi dòng ghi "mở ở đâu" + "phải thấy gì", có ô tích và ô ghi chú.

## Quyết định của Ban lãnh đạo — 22/09/2026 (Hồ Đắc Phúc), ĐÃ THỰC HIỆN

| # | Quyết định | Đã làm |
|---|---|---|
| 1 | Email nhận khiếu nại = `info@satarobo.vn` | Chính sách #2 |
| 2 | Bỏ "đặt phòng" — không có dịch vụ này | Chính sách #7 → "đăng ký và sử dụng dịch vụ" |
| 3 | Đánh số lại cho hết trùng | Chính sách bảo mật: 10 → 14, không còn hai mục 10 |
| 4 | Không công bố tên/số TK, **trừ** gói RoboSim 490K → TK Sata Robo `2102025686868` (MBBank) | Chính sách #4 |
| 5 | Mọi chứng từ đứng tên **SATA ROBO** | `phap-nhan.ts`: CS2 đổi NEW_VISION → SATA_ROBO; địa chỉ 211 Nguyễn Hữu Thọ; `ketoan@satarobo.vn`; hotline 0837.312.860 |
| 6 | Giá **đã gồm** VAT | Văn bản giữ nguyên; hệ thống vốn mặc định `DA_GOM_THUE` — không phải sửa gì |
| 7 | Mức hoàn theo **hợp đồng đào tạo** từng khoá | Chính sách #9: hợp đồng ưu tiên áp dụng; bảng là mức chung khi hợp đồng không quy định khác |
| 8 | Lưu **tối thiểu 12 tháng** | Chính sách bảo mật §4 |
| 9 | Website **có** nhận đặt hàng trực tuyến | Văn bản giữ nguyên ⇒ **phát sinh việc dựng luồng đặt hàng**, xem dưới |
| 10 | Phương án **B** — chờ tư vấn gửi văn bản "Chính sách hoạt động" riêng | Ô tích tạm trỏ `/chinh-sach`; đổi 1 dòng khi có văn bản |
| 11 | Công khai giá **từng khoá**, không riêng 2 khoá | Bỏ ẩn 9 trang khoá; mỗi trang in học phí niêm yết; khôi phục sitemap |
| 12 | Khách đồng ý **một lượt** khi chọn | Gỡ ô marketing riêng; ô Chính sách bảo mật bao hàm cả nhận tin (đã ghi vào §3 của chính sách) |

**Nghiệm thu sau khi áp quyết định:** typecheck sạch · lint 0 error · build xanh (200/200)
· `pnpm test:unit` **8425 xanh / 0 đỏ** · **R7 shard 1/2 = 185 xanh, shard 2/2 = 184 xanh, 0 đỏ**
(bắt buộc vì QĐ #5 chạm `lib/finance/**`; chạy TUẦN TỰ trên hai DB `satarobo_test` + `ci_test`).

**ĐO LẠI sau khi rebase lên `origin/test`** (nhánh đi trước 277 commit, trong đó có F4 đổi
khoá/đổi lớp cũng chạm `lib/finance/**`) — số cũ ở trên là số của nền CŨ, giữ lại để đối chiếu:
typecheck sạch · lint 0 error · build xanh · `pnpm test:unit` **10.829 xanh / 17 expected fail**
· **R7 shard 1/2 = 195 xanh, shard 2/2 = 187 xanh, 0 đỏ** (mỗi shard một DB riêng, chạy tuần tự).

⚠️ **Lượt chạy shard 2/2 ĐẦU ra 186 xanh / 1 đỏ, và ca đỏ đó KHÔNG phải hồi quy — ghi lại
cách phân biệt:** `[#08-T1]` ném `40P01 deadlock detected` ngay tại `TRUNCATE … CASCADE`
trong `resetDb()` (`tests/e2e/_helpers/seed.ts:94`), tức chết ở FIXTURE chứ không ở phép
khẳng định nào. Hai phép đo tách nó khỏi "mã hỏng":
· chạy RIÊNG đúng spec đó → **3/3 xanh**;
· chạy LẠI cả shard → **187 xanh / 0 đỏ**, cùng commit, cùng database.
Một `TRUNCATE` chỉ deadlock khi có client THỨ HAI giữ khoá trên cùng DB — máy này có 8
worktree song song. Bài học: **đọc CHỖ ném lỗi trước khi đọc tên ca**; lỗi ở fixture nói về
môi trường, lỗi ở `expect` mới nói về mã.

⚠️ **Một ca ĐỎ CHẬP CHỜN của nhánh `test`, KHÔNG phải của đợt này — đã đo:**
`lib/lead/ownership.test.ts` (và 4 tệp cùng họ) là **lưới quét mã nguồn**: chúng đi hết cây
`app/` + `lib/` + `scripts/` rồi `readFileSync` từng tệp, trong một ca có trần **5 giây**.
· Chạy MỘT MÌNH: 15 ca xanh, **2,51 s** — tức đã ăn hết một nửa trần khi máy rảnh.
· Chạy trong cả bộ: đỏ vì **timeout**, và **tập ca đỏ đổi mỗi lượt** (lượt 1: 7 ca ở 5 tệp;
  lượt 2: 2 ca; lượt 3: 1 ca) — dấu hiệu của tranh CPU, không phải hồi quy.
· Đợt này góp thêm **13 tệp** vào cây bị quét (2.125 → 2.138, +0,6%). Phần trăm đó không tạo
  ra lỗi, nhưng nó **thu hẹp một khoảng dư vốn đã mỏng**.
· Vá đúng không phải nâng trần (nâng trần là vá triệu chứng): 5 tệp ấy đọc lại **cùng một
  cây tệp 5 lần**. Gom thành một lượt đọc dùng chung là việc riêng, ghi vào nợ.

**Hai bẫy lộ ra khi kiểm bằng HTTP thật, đã vá:**

- Trang chi tiết khoá đọc `CoursePackage`, thiếu dòng thì rơi về hằng trong
  `courses-pricing.ts` — hằng đó **lệch DB** (Sata1: file 1.650.000đ vs admin 2.400.000đ).
  Thêm bậc `Course.price` vào giữa. Nay trang chi tiết khớp `/admin/courses`.
- **Slug khoá khác nhau giữa hai môi trường**: DB local `sata-1`, prod `sata1`, trang hỏi
  `sata1`. Tra trượt **không báo lỗi** — chỉ lặng lẽ in con số cũ, và chỉ sai ở một môi
  trường. Vá bằng `ungVienSlugKhoa()` (hàm thuần, test `[SLUG-01..06]`).

**Còn phát sinh từ QĐ #9:** BLĐ khai website CÓ nhận đặt hàng trực tuyến, trong khi hiện
tại không có giỏ hàng / trang đặt hàng / bước xác nhận tổng tiền, và phí vận chuyển là số gõ
tay. Đây là **một dự án riêng** cần lập kế hoạch, không nằm trong đợt này.

## Tiến độ (cập nhật 21/09/2026)

| Đợt | Nội dung | Trạng thái |
|---|---|---|
| 1 | Nền dùng chung: `lib/legal-pages.ts` · trường pháp nhân trong `lib/locations.ts` · `CongTyBlock` · wrapper cuộn ngang cho bảng markdown | ✅ XONG |
| 2 | 11 trang chính sách (8 mới + 2 viết lại + trang mục lục `/chinh-sach`) + sitemap sinh từ registry | ✅ XONG |
| 3 | 3 chân trang + dải link ở cổng phụ huynh & nhóm auth + gỡ nhãn "Trụ sở chính" ở 8 nơi công khai | ✅ XONG |
| 4 | Ô tích đồng ý Chính sách bảo mật × 4 biểu mẫu + cổng server | ✅ XONG |
| 5 | Công khai giá **mọi** khoá (2 thẻ + 9 trang chi tiết — QĐ #11 đảo lượt ẩn) · ẩn 3 bộ học cụ · sửa FAQ | ✅ XONG |
| 6 | Dọn mâu thuẫn còn lại (email chết, mốc thời gian, JSON-LD, cookie banner, Apps Script) | ✅ XONG (trừ nhóm D) |
| 4b | Ô tích "Chính sách hoạt động" — xác nhận một lần lưu DB ở cổng phụ huynh | ✅ XONG (chờ chạy migration trên prod) |

**Nhóm D của Đợt 6 — CHƯA LÀM, cần người quyết:** 18 chỗ marketing hứa "hoàn 100%" với 3 chế
độ + 4 mốc chi trả khác nhau, đá bảng hoàn phí 100/70/50/0% của chính sách #9 vừa đăng. Đây là
quyết định nghiệp vụ, không phải việc sửa mã.

## Việc PHẢI CHẠY TAY sau khi merge

1. **`prisma migrate deploy`** trên từng môi trường — migration mới
   `20260922100000_site_policy_acceptance` (bảng `SitePolicyAcceptance`).
   Đã kiểm drift an toàn (`migrate diff --from-url` trên DB nháp): **0 dòng nhắc bảng mới**;
   60 dòng còn lại là drift 14 bảng có sẵn, không phải của đợt này.
2. **Báo CSKH trước**: 114+ phụ huynh sẽ gặp màn xác nhận ngay lần mở trang học phí tới.
   Cổng chỉ đóng MỘT trang — học bạ, lịch, tin nhắn, thông báo mở nguyên.
3. **Đo 4 số trên DB prod** (mục §H) rồi dán vào hồ sơ.
4. **Khai `Course.priceDisplay`** cho 2 khoá chủ lực nếu muốn số khác giá sàn trong
   `lib/gia-cong-khai.ts` (hiện: 2.400.000đ / 490.000đ).

**Nghiệm thu đợt 1–6:** `pnpm typecheck` sạch · `pnpm lint` 0 error · `pnpm build` xanh
(200/200 trang) · `pnpm test:unit` **8419 xanh / 0 đỏ** (547 file).

**Rà tràn ngang ở 375px** (`public-contrast`, VIEWPORT=mobile, 23 route gồm cả 12 trang pháp lý):
`tran ngang 0/23`. Tương phản 119 chỗ — **thấp hơn** mốc ~121 mà chính spec ghi là cố ý giữ,
tức không phát sinh hồi quy màu.

**[CẬP NHẬT 22/09] Luật R7 ĐÃ bị kích hoạt** bởi QĐ #5 (`lib/finance/hoa-don/phap-nhan.ts`) —
đã chạy, số ở mục quyết định trên. Câu dưới là kết luận của đợt 4b lúc CHƯA có QĐ #5, giữ lại
vì phép đo của nó vẫn đúng cho phạm vi đó:

**Luật R7 KHÔNG bị kích hoạt** — đo bằng đường dẫn: 0 file thuộc `lib/payments/**`,
`lib/finance/**`, `app/api/public/webhook/**`; migration mới không nhắc
`Payment`/`Order`/`BankTransaction`. Đợt này chặn TRUY CẬP trang học phí, không đụng phép
tính tiền nào.

**Kiểm bằng HTTP thật** (server build, không phải dev):

| URL | Mã | Ghi chú |
|---|---|---|
| `/khoa-hoc` | 200 | thẻ in giá bằng SỐ, 0 chuỗi "Liên hệ tư vấn" |
| `/khoa-hoc/laptrinhrobot` · `/luyenthirobosim` | 200 | xác nhận route `(legacy)` KHÔNG bị layout ẩn chạm |
| `/khoa-hoc/sata1` · `/combo-luyen-thi` | 200 | **QĐ #11 đảo lượt ẩn** — nay công khai, có in học phí |
| `/hoc-cu` | **404** | đã ẩn |
| `/chinh-sach` | 200 | mục lục 10 chính sách |

⚠️ **Một lỗi thiết kế của chính bản vá, chỉ lộ ra khi chạy với DỮ LIỆU THẬT:** bản đầu cho
`Course.priceDisplay` ưu tiên cao nhất, mà cột đó trên DB đang là chuỗi **"Liên hệ tư vấn"**
cho cả hai khoá chủ lực ⇒ thẻ vẫn in "Liên hệ", bản vá vô tác dụng mà test vẫn xanh. Nay
`priceDisplay` chỉ thắng khi **thực sự chứa chữ số**. Ghim ở `[GIA-04b]`.

**Lưới mới dựng, đều đã CẤY LỖI và thấy ĐỎ trước khi tin:**
`lib/legal-pages.test.ts` `[LEGAL-01..09]` (tên chính sách trôi) ·
`lib/legal-content.test.ts` `[MD-01..07]` (thiếu file .md · bảng mất dòng phân cách · nhãn cấm ·
hộp thư chết · thiếu mã số doanh nghiệp/địa chỉ đầy đủ) và `[HQ-01..03]` (nhãn "Trụ sở chính" trên
bề mặt công khai, **bóc chú thích trước khi soi** vì chính chú thích bản vá chứa chuỗi đang cấm).

## Tóm tắt 5 nhóm yêu cầu

| # | Yêu cầu gốc | Hiện trạng đo được | Khối lượng |
|---|---|---|---|
| [1] | Chân trang có đủ **10 chính sách**, ghi đúng tên, nội dung đúng file gửi kèm | **3/10** trang tồn tại, và cả 3 đều SAI TÊN hoặc SAI NỘI DUNG | 7 trang mới + 3 viết lại + 3 chân trang + sitemap |
| [2] | Cập nhật thông tin công ty; **gỡ nhãn "Trụ sở chính"** | Thiếu hẳn cơ quan cấp + ngày cấp (0 dòng toàn repo); nhãn "Trụ sở chính" ở **15 nơi** | 1 hằng nguồn + ~15 điểm in |
| [3] | Trang đăng ký có **ô tích** đồng ý Chính sách bảo mật | Toàn mặt công khai có **đúng 1 ô tích**, và nó là ô *marketing* | 4 biểu mẫu + 1 cổng server |
| [4] | Trang thanh toán có ô tích "Chính sách hoạt động" | **0 bề mặt thanh toán công khai** ⇒ không có chỗ đặt ô tích | CHỜ QUYẾT (§A2) |
| [5] | **Ẩn** sản phẩm/dịch vụ không công khai giá & không đặt hàng được | 8 trang khoá + 3 bộ học cụ đủ cả hai vế; kèm 2 chỗ giá tự mâu thuẫn | 2 file mới + dữ liệu prod |

---

## §A — 11 VIỆC CHỜ NGƯỜI QUYẾT (chặn NỘI DUNG, không chặn code)

Làm trước tất cả. Mỗi việc dưới đây quyết định chữ sẽ đăng lên trang công khai, nên
code xong trước rồi sửa sau là đăng hai lần.

**A1. Tên tài khoản nhận tiền KHÁC pháp nhân nộp hồ sơ.** File 4 công bố
`CTY CP CN GD SATAMATH FRANCHISES – 989550808 – MBBank`, trong khi hồ sơ nộp cho
`CÔNG TY CP CÔNG NGHỆ GIÁO DỤC SATA ROBO` (MST 0402301783). Giữ nguyên thì phải có cơ sở
pháp lý (uỷ quyền thu hộ) kèm hồ sơ. → **Chặn việc dựng trang "Chính sách thanh toán".**

**A2. Website có/không có thanh toán trực tuyến.** Đo: `grep "cart|checkout|gio-hang|dat-hang"`
trên `app/(public)` + `app/(legacy)` = **0 kết quả**; mọi mã sinh VietQR nằm trong `app/(admin)`;
cổng phụ huynh chỉ ĐỌC. Hai đường loại trừ nhau: (a) khai "không có thanh toán trực tuyến"
⇒ mục [4] không sinh việc code, **nhưng phải sửa file 4** (§2.1 đang tả "các giao dịch thanh
toán trực tuyến…"); (b) khai là có ⇒ phải dựng bề mặt thanh toán, việc lớn.

**A3. "Chính sách hoạt động" là tên KHÔNG tồn tại.** `grep` trên cả 11 file `.txt` ra đúng
1 dòng — chính dòng yêu cầu [4]. Không file nào mang tên đó, và nó không nằm trong danh sách
10 tên bắt buộc. Phải hỏi đơn vị tư vấn: ô tích [4] trỏ về đâu.

**A4. Email tiếp nhận khiếu nại vênh ngay trong bộ hồ sơ.** File 2 ghi
`tbsatarobo.vn@gmail.com`; file 0 và 10 file còn lại ghi `thongtin@satarobo.vn`. Hướng dẫn
bắt "gắn nội dung đúng theo file gửi kèm" ⇒ mặc định dán nguyên văn, tức đăng một hộp Gmail
làm kênh khiếu nại chính thức. → Chặn việc viết trang chính sách #2.

**A5. Bảng hoàn phí đá nhau ba đường.** Cùng một ca (20 buổi, đã học 4, học phí 5.000.000đ):
file 7.2 → hoàn **70% phần còn lại = 2.800.000đ**; chốt K7 (TGĐ 03/07) → **trừ 100% sau buổi 1**;
`lib/finance/refund.ts` đang chạy → một số thứ ba. Thêm nữa, **18 chỗ công khai** đang hứa
"hoàn 100%" với 3 chế độ và 4 mốc chi trả khác nhau. Đăng bảng 7.2 lên là công bố hai luật
đá nhau về cùng một khoản tiền.

**A6. File 7.2 tự mâu thuẫn.** Bước 1 đòi gửi yêu cầu *"trong 03 ngày kể từ ngày thanh toán"*,
nhưng bảng lại cho rút khi đã học 25–50% số buổi — học tới đó thì đã quá 03 ngày từ lâu, nên
nhánh 70%/50% vĩnh viễn không với tới được.

**A7. Hoá đơn CS2 mang pháp nhân KHÁC.** `lib/finance/hoa-don/phap-nhan.ts:87-99` khai
`CÔNG TY CP CÔNG NGHỆ GIÁO DỤC NEW VISION` MST **0402341070** (đo từ tờ thật 1C26MNV-13), và
`:124-127` ánh xạ **CS1→SATA_ROBO, CS2→NEW_VISION** theo chốt chủ dự án 15/09. Nghĩa là phụ
huynh giao dịch trên satarobo.vn nhưng học ở CS2 thì nhận chứng từ của một pháp nhân không
đứng tên hồ sơ. → Chốt ai là BÊN BÁN của giao dịch phát sinh trên website.

**A8. "Giá đã bao gồm VAT" (file 3 §2.2) chưa chắc đúng.** `phap-nhan.ts:129-132` để mặc định
`DA_GOM_THUE`, nhưng chú thích đo từ tờ thật ghi rõ tờ **học phí** (1C26TSR-127) lại **CHƯA GỒM** —
tức đúng loại đơn chiếm phần lớn doanh thu. Và 0 bề mặt công khai nào ghi chữ VAT.

**A9. Ba hạn lưu trữ công bố mà hệ thống không thực hiện.** File 1 §4 hứa 2 năm / 90 ngày /
24 tháng; `lib/compliance/retention.ts:12` đặt **5 NĂM** và chỉ `console.warn`, cố ý không xoá;
0 cron nào xoá log truy cập.

**A10. Ba điều khoản hứa một luồng ĐẶT HÀNG TRỰC TUYẾN không tồn tại** (file 3 §2.5 "hiển thị
tổng số tiền trước khi hoàn tất", §3.1 "giá tại thời điểm đặt", file 5 §2 "nhận đơn 24/7").
Mọi đơn được tạo ở admin hoặc sinh từ convert lead.

**A11. File 6.1 hứa phí vận chuyển theo bảng cước 7 đơn vị + thu ngay khi đặt hàng.** Đo:
`shippingFee` là số **gõ tay** ở admin (`lib/validators/order.ts:194`); schema **không có** cột
nào cho đơn vị vận chuyển / mã vận đơn / trạng thái giao.

> **Hai lỗi soạn thảo phải sửa trước khi dán:** file 6.2 §4 nói *"việc **đặt phòng** và sử dụng
> dịch vụ"* (dấu vết mẫu ngành khách sạn); file 1 đánh số **mục 10 hai lần**.

---

## §B — Khối [1]: 10 chính sách ở chân trang

### B1. Bảy trang PHẢI TẠO MỚI *(CHẶN HỒ SƠ)*

Khuôn có sẵn, tái dùng nguyên: `components/public/legal-page.tsx:26-27` đọc
`content/legal/<slug>.md` → `MarkdownRenderer`. Mỗi trang = 1 file `.md` + 1 `page.tsx`
**có `export const metadata`** (`alternates.canonical` + `openGraph` — Next đòi export tại route;
mẫu ở `app/(public)/chinh-sach-bao-mat/page.tsx:4-16`).

| # | Tên BẮT BUỘC ở chân trang | Nguồn nội dung | Slug đề xuất |
|---|---|---|---|
| 2 | Phương thức tiếp nhận và giải quyết phản ánh, yêu cầu, khiếu nại | file 2 | `phuong-thuc-tiep-nhan-phan-anh` |
| 3 | Chính sách về giá | file 3 | `chinh-sach-gia` |
| 4 | Chính sách thanh toán | file 4 | `chinh-sach-thanh-toan` ← chặn bởi **A1** |
| 5 | Các điều kiện và hạn chế trong việc giao hàng và cung cấp dịch vụ | file 5 | `cac-dieu-kien-va-han-che` |
| 6 | Chính sách giao hàng | file 6.1 | `chinh-sach-giao-hang` |
| 7 | Phương thức cung cấp dịch vụ | file 6.2 | `phuong-thuc-cung-cap-dich-vu` |
| 9 | Chính sách chấm dứt dịch vụ và hoàn tiền | file 7.2 | `chinh-sach-cham-dut-dich-vu` |
| 10 | Quyền và nghĩa vụ của các bên | file 8 | `quyen-va-nghia-vu-cac-ben` |

⚠️ **Nhãn chân trang phải dùng TÊN TRONG DANH SÁCH [1], không dùng tiêu đề trong file.**
Ví dụ file 6.1 đặt tiêu đề *"CHÍNH SÁCH VỀ GIAO HÀNG"* nhưng tên bắt buộc là *"Chính sách giao hàng"*.

### B2. Hai trang PHẢI ĐỔI TÊN + THAY NỘI DUNG *(CHẶN HỒ SƠ)*

- **#8** — web ghi *"Chính sách hoàn trả"* (`site-footer.tsx:43`, nhãn tắt *"Hoàn trả"* ở `:278`,
  H1 trong `.md` là *"CHÍNH SÁCH HOÀN TRẢ HỌC PHÍ"*). Tên bắt buộc: **"Chính sách đổi trả hàng
  và hoàn tiền"**, nội dung theo file 7.1.
- **Tách `chinh-sach-hoan-tra.md` làm hai.** File hiện gộp khoá học (dòng 13-41) với học cụ
  (43-47) dùng chung quy trình (49-56) — BCT đòi hai văn bản riêng (#8 hàng hoá, #9 dịch vụ).
- *"Điều khoản sử dụng"* **không nằm trong 10 tên bắt buộc** — giữ làm trang thứ 11, nhưng
  không được tính là chính sách #10.

### B3. Ba chân trang + sitemap *(CHẶN HỒ SƠ / CẦN SỬA)*

| Chân trang | Hiện có | file:line |
|---|---|---|
| Site chính | 3/10, và dải copyright dùng nhãn **viết tắt** ("Bảo mật", "Hoàn trả") | `components/sections/site-footer.tsx:43-45` + `:257,263,269,275` |
| Landing Lập trình Robot | **2/10**, cả 2 sai tên ("Bảo Mật", "Điều Khoản") | `components/legacy-laptrinhrobot/Footer.tsx:193,195` |
| Landing Luyện thi RoboSim | **2/10** | `components/legacy-luyenthirobosim/Footer.tsx:118,120` |

- Hai landing **không dùng** `SiteFooter` (`app/(legacy)/layout.tsx:6-14`) nên sửa site-footer
  không chạm tới chúng.
- Grid site-footer đang `md:grid-cols-4` (`:119`); nhồi 7 dòng vào cột "Hỗ trợ" (đã 5 dòng)
  là quá tải ⇒ thêm cột thứ 5.
- **Dựng một nguồn dùng chung** `lib/legal-pages.ts` (`{slug, label}[]` × 10) cho **cả 3 chân
  trang + `app/sitemap.ts`**. Không phải refactor ngoài phạm vi: đây chính là cơ chế giữ "ghi
  đúng tên" khỏi trôi — với chỉ 2-3 link hiện tại thì 3 chân trang **đã lệch sẵn** ("Chính sách
  bảo mật" / "Bảo mật" / "Bảo Mật" cho cùng một trang).
- `app/sitemap.ts:20-22` khai **tay** 3 URL và **đã bỏ sót** `/quyen-rieng-tu` — bằng chứng cơ
  chế này sẽ sót tiếp với 8 trang mới.

### B4. Hai bề mặt người mua KHÔNG có link chính sách nào *(CHẶN HỒ SƠ)*

- **Cổng phụ huynh** `hocvien.satarobo.vn` — nơi khách đã mua xem học phí/công nợ hằng ngày:
  `grep "chinh-sach"` trên `app/(portal)` + `components/portal` = **0 dòng**.
- **Nhóm `app/(auth)`** — gồm chính trang `/kich-hoat` trong ảnh hướng dẫn:
  `app/(auth)/layout.tsx:21-49` chỉ có nền SVG + nút đổi sáng/tối, không `<footer>`.

---

## §C — Khối [2]: thông tin công ty

**C1. Mã số doanh nghiệp thiếu cơ quan cấp + ngày cấp *(CHẶN HỒ SƠ)*.**
`rg -i "Sở Tài chính|cấp ngày|02/10/2025"` trên `app/ components/ content/ lib/` → **0 match**.
Hai chỗ in hiện tại còn dùng SAI nhãn pháp lý: `site-footer.tsx:243` in `MST: {taxCode}`,
`ve-chung-toi/page.tsx:383` in `Mã số thuế:`.
→ Thêm `businessCode` / `businessCodeIssuer` / `businessCodeIssuedAt` vào `SATA_ROBO_CONTACT`
(`lib/locations.ts:60-73`), **giữ `taxCode`** cho các đường kế toán/hoá đơn đang dùng.

**C2. Nhãn "Trụ sở chính" ở 15 nơi *(CHẶN HỒ SƠ)* — GỠ NHÃN, GIỮ CỜ.**
Nguồn: `lib/locations.ts:40` `note: "Trụ sở chính - Phòng Lab lớn…"`, render ở
`lien-he/page.tsx:220-221` và `:263-264`; badge `Trụ sở chính` ở `lien-he/page.tsx:187-192`
và `ve-chung-toi/page.tsx:455-459`; nhãn ô `lien-he/page.tsx:51` `label: "Trụ sở"`;
chuỗi **đóng cứng** `components/legacy-luyenthirobosim/Footer.tsx:92` *"211 Nguyễn Hữu Thọ,
Đà Nẵng (Trụ sở chính)"* + `aria-label` ở `:90`; bản sao ở `legacy-laptrinhrobot/_data/locations.ts:35`;
và `content/legal/chinh-sach-hoan-tra.md:62`.

⚠️ **Cờ `isHQ` là load-bearing** — 4 chức năng khác phụ thuộc. Gỡ NHÃN, đừng gỡ CỜ.

⚠️ **Nhãn này còn SAI SỰ THẬT**, không chỉ sai hồ sơ: `phap-nhan.ts:81` cho thấy trụ sở đăng ký
của pháp nhân MST 0402301783 là **258 Lê Thanh Nghị** (đo từ hoá đơn thật), không phải 211
Nguyễn Hữu Thọ. Đó chính là lý do file 0 dặn gỡ nhãn. **Đừng thay bằng 258 Lê Thanh Nghị** —
hồ sơ chỉ định 211 Nguyễn Hữu Thọ; việc cần làm là bỏ NHÃN, không phải đổi số nhà.

**C3. Phường ghi SAI + địa chỉ in rút gọn *(CHẶN HỒ SƠ)*.**
`lib/locations.ts:31-32` khai `"211 Nguyễn Hữu Thọ, Đà Nẵng"` + `district: "Hải Châu"`.
BCT ghi **Phường Hòa Cường**; bằng chứng nội bộ khớp: `phap-nhan.ts:81` cũng ghi Hòa Cường.
Lan ra: `lien-he/page.tsx:52,203,204`, `ve-chung-toi/page.tsx:465,468`, JSON-LD
`lib/seo/jsonld.ts:56` (`addressLocality`), và 3 dòng trong `content/legal/*.md`.

⚠️ **Phường của CS2 (114 Hoàng Diệu) chưa biết** — bản BCT chỉ cho địa chỉ CS1. Đừng sửa CS2 theo suy đoán.

**C4. Khối pháp nhân chỉ có ở 1/3 chân trang** — và `legacy-laptrinhrobot/Footer.tsx:190` ghi
`Công ty CP` (viết tắt). → Dựng **một component khối pháp nhân dùng chung** in đủ 5 dòng BCT,
cắm vào cả 3 chân trang.

**C5. Tên pháp nhân có 4 biến thể**, trong đó JSON-LD `lib/seo/jsonld.ts` khai tên TẮT làm
`name` của tổ chức, và `:255` có một bản sao gõ tay không đi qua hằng.

**C6. Số điện thoại** — cả 2 số đều có nhưng **luôn** bị gắn nhãn cơ sở (`hotlinesInline()`
sinh `"CS1: … · CS2: …"`); không nơi nào in dạng công ty `0818.823.720 – 0702.193.933`.

> 🔴 **C6 ĐÃ HẾT HIỆU LỰC — chủ dự án chốt 24/09/2026: MỘT số duy nhất `0837.812.860`,
> không còn hotline riêng theo cơ sở.** Nguồn duy nhất: `SATA_ROBO_PHONE` (`lib/locations.ts`).
> Bốn trường `hotline`/`hotlineRaw`/`hotlineE164`/`zalo` đã bị **gỡ khỏi** `SataRoboLocation`
> (và khỏi `components/legacy-laptrinhrobot/_data/locations.ts`) chứ không gán cùng một giá
> trị — giữ trường là giữ nguyên ~30 vòng lặp in ra HAI nút cạnh nhau. `hotlinesInline()` và
> `hotlinesCompany()` đã xoá. Lưới canh: `lib/sdt-mot-so.test.ts` `[SDT-01..04]`.
>
> ⚠️ **Còn một số KHÁC chưa ai quyết:** `lib/finance/hoa-don/phap-nhan.ts:90` in
> `0837.312.860` cho pháp nhân SATA ROBO trên **hoá đơn** (theo quyết định BLĐ 22/09 mục 5),
> lệch với `0837.812.860` của website đúng một nhóm chữ số. Một trong hai là lỗi gõ — cần
> người xác nhận, KHÔNG tự sửa.

**C7. JSON-LD trang chủ phát chuỗi "Trụ sở chính" ở dạng MÁY ĐỌC ĐƯỢC** —
`lib/seo/jsonld.ts:59` nối thêm `" - Trụ sở chính"` khi `loc.isHQ`, bơm vào DOM ở
`app/(public)/page.tsx:82`. Soi bằng mắt không thấy; kiểm bằng `view-source` + grep "Trụ sở".

---

## §D — Khối [3]: ô tích đồng ý Chính sách bảo mật

> Đo dứt điểm: `grep 'type="checkbox"|<Checkbox'` trên toàn mặt công khai trả về **đúng 1 dòng**.

**D1. `/kich-hoat` — ĐÚNG màn trong ảnh hướng dẫn *(CHẶN HỒ SƠ)*.**
`app/(auth)/kich-hoat/activate-form.tsx` (biểu mẫu 2 bước, state `step` dòng 12). Thêm ô tích
trong nhánh `step === "identify"` (khối 109-128), **ngay trên nút "Gửi mã kích hoạt"** (dòng 111) —
đặt ở bước 1 vì dữ liệu cá nhân bắt đầu được gửi từ đó.

**D2. `/lien-he` *(CHẶN HỒ SƠ)*.** `contact-form.tsx:704` **KHÔNG phải ô tích** — nó là
`<p className="text-xs…">` mở ở dòng 701. Và form vẫn gửi `consentMarketing: true` cứng (`:384`).
→ Thêm `dongYCsbm: z.literal(true)` vào `contactSchema` (dùng `z.literal(true)` để chính
`zodResolver` chặn submit, khỏi viết điều kiện rời).

**D3. Landing Lập trình Robot *(CHẶN HỒ SƠ)*.** `RegistrationForm.tsx:535` cũng chỉ là
`<p>` mở ở `:532`. → Thêm state + ô tích ngay trước nút submit (`:518`).

**D4. `consult-modal.tsx` — ô tích DUY NHẤT của site, nhưng sai cả ba vế *(CHẶN HỒ SƠ)*.**
`components/khoa-hoc/consult-modal.tsx:299`: nhãn là *"Tôi đồng ý nhận thông tin tư vấn và ưu
đãi…"* (marketing, **không phải** chính sách bảo mật), **mặc định đã tích** (`useState(true)` dòng 31),
và **không chặn gửi**. → Giữ ô marketing (phục vụ cột `Lead.consentMarketing`) nhưng bỏ tích sẵn;
**thêm ô thứ hai** riêng biệt, khởi tạo `false`, nhãn nguyên văn *"Tôi đã đọc và đồng ý với
Chính sách bảo mật của website"* + link `/chinh-sach-bao-mat`.

**D5. Cổng SERVER không kiểm trường đồng ý *(NÊN SỬA, nhưng là cổng thật)*.**
`lib/validators/lead.ts:65` khai `consentMarketing: z.boolean().default(false)` — có `.default()`
nên thiếu trường vẫn qua; và **không có trường nào** cho đồng ý chính sách bảo mật. Cột hiện
bị **5 đường ghi khống `true`**. Cổng client là affordance; cổng server mới là thứ không bỏ
qua được bằng cách gọi thẳng API.

**D6. Banner cookie KHÔNG thay được ô tích** — khác đối tượng đồng ý (cookie ≠ dữ liệu cá nhân),
khác cơ chế (`localStorage`), và **không xuất hiện** trên chính 2 landing quảng cáo + `/kich-hoat`
(nó chỉ gắn ở `app/(public)/layout.tsx:29`, trong khi GA4 + Meta Pixel gắn ở layout GỐC
`app/layout.tsx:56-57` — tức pixel chạy ở nơi không có banner). Đừng viện nó khi giải trình.

**D7. KHÔNG thêm ô tích vào 6 chỗ còn lại** (`login-form.tsx:52`, quick-lead-form nội bộ, …) —
chặn submit ở đó là chặn đúng việc vận hành hằng ngày và chặn cả đường đăng nhập.

---

## §E — Khối [4]: trang thanh toán

Phụ thuộc hoàn toàn **A1 + A2 + A3**. Đo được: **0 bề mặt thanh toán công khai**, nên hiện
không có chỗ nào để đặt ô tích. Đo thêm: **0/79 biến Production** chứa `PAYOS` ⇒ bản công bố
"chỉ chuyển khoản" hiện KHỚP thực tế.

---

## §F — Khối [5]: ẩn sản phẩm/dịch vụ không công khai giá

**F1. 8 trang khoá Sata1–Sata8 — dịch vụ mồ côi, đủ CẢ HAI vế *(CẦN SỬA)*.**
Vế giá: `app/(public)/khoa-hoc/[slug]/page.tsx:158-166` in chuỗi cứng `"Liên hệ"` (dù
`resolveCoursePrice` đã tính ra `listPrice` ở `:87-91`). Vế đặt hàng: nút duy nhất là
`<button disabled>`. Vẫn nằm trong sitemap và được prerender.
→ Thêm `app/(public)/khoa-hoc/[slug]/layout.tsx` chỉ gồm `notFound()` — **đúng khuôn đã chạy**
cho `/vinh-danh` (`app/(public)/vinh-danh/layout.tsx:1-10`), không chạm `page.tsx`, bật lại =
xoá 1 file. Đồng thời gỡ `courseRoutes` khỏi `app/sitemap.ts:57-62`.

✅ An toàn cho 2 khoá chính: `/khoa-hoc/laptrinhrobot` và `/luyenthirobosim` là route TĨNH ở
nhóm `(legacy)`, layout của `[slug]` không chạm tới.

⚠️ **Nhưng đó là chỗ DUY NHẤT công khai số buổi + thời lượng** (`:142`) — đúng thứ file 6.2 hứa
"công khai tại thông tin của từng khóa học". Khi ẩn, phải **giữ** hàng "Thời lượng" (`:55-58`)
và "Thiết bị" (`:65-69`) của bảng so sánh, và **thêm** hàng "Thời hạn sử dụng".

**F2. 3 bộ học cụ ZMROBO trên `/hoc-cu` *(CẦN SỬA)*.** Giá = chuỗi `"Liên hệ tư vấn"` từ cột
DB `ZMRoboKit.priceDisplay` (`prisma/schema.prisma:2736` `@default`), không có luồng đơn hàng nào.
→ Hai đường: (a) **dữ liệu** — tắt "Đã đăng" từng bộ ở `/admin/kits`, khối tự rơi về nhánh rỗng
có sẵn; (b) **mã** — thêm `app/(public)/hoc-cu/layout.tsx` gọi `notFound()`.

⚠️ Đường (a) **không ghi audit** (`app/(admin)/admin/kits/_actions.ts:230` — `grep writeAudit` = 0):
trạng thái đã khai với BCT có thể bị đổi mà không ai biết. Nếu chọn (a), phải chụp màn làm bằng.

**F3. Giá tự mâu thuẫn trên cùng một trang *(CẦN SỬA)*.** `/khoa-hoc` in `"Liên hệ"` ở thẻ
(`:269`) nhưng **~190 dòng bên dưới, cùng trang**, bảng so sánh in SỐ THẬT: *"Chỉ từ 1.485.000đ"*
và *"Chỉ từ 490.000đ"* (`:75-77`, hằng gõ tay).

**F4. Cùng dịch vụ, hai trang hai giá *(CẦN SỬA)*.** `/khoa-hoc` ghi *"Liên hệ"* cho Luyện thi
RoboSim, trong khi trang chi tiết in **490.000đ ở 9 chỗ**. Bản in giá là bản nên GIỮ (gỡ số là
gỡ trọn kịch bản bán hàng), thẻ `/khoa-hoc:269` là chỗ nên sửa.

**F5. Nhãn hứa sai *(CẦN SỬA)*.** `hoc-cu/page.tsx:361` nút ghi *"Tư vấn bộ học cụ hoặc **đặt
mua** học cụ"* nhưng `href` là `/lien-he?subject=…` — form lead, không có bước đặt hàng nào.
→ Đổi chữ, không đụng `href` (sale đang đọc tham số `subject`).

**F6. `scripts/nhap-gia-khoa-cong-van.ts` là mìn *(NÊN SỬA)*.** Nó `upsert` 8 `Course`
`sata-1..sata-8` mà **không truyền `isPublished`**, cột đó `@default(true)` ⇒ một lượt chạy là
thêm 8 thẻ công khai không giá, bấm vào ra 404.

---

## §G — Nội dung 3 trang pháp lý hiện có: phải viết lại

**G1. Chính sách bảo mật thiếu 4 mục quy trình bắt buộc** — file `.md` có 9 mục `##`, thiếu hẳn:
(8) quy trình xem/chỉnh sửa dữ liệu · (9) quy trình xoá/huỷ/hạn chế xử lý · (10) quy trình khiếu
nại bảo mật · (11) cam kết bảo mật. **Đây là 4 mục cơ quan tiếp nhận soi kỹ nhất.**

⚠️ Đừng viện `privacy-center.tsx` là cơ chế thực hiện — file đó **chỉ quản cookie**.

**G2. §2.2 và §3 thiếu quá nửa danh mục** — thiếu 4 loại dữ liệu (địa chỉ giao hàng, thông tin
thanh toán, nội dung trò chuyện hỗ trợ, lịch sử mua hàng) và 6 mục đích.

**G3. Ba loại dữ liệu hệ thống đang lưu thật mà văn bản không khai:** ảnh/video học viên
(`StudentConsent` / `CLASS_MEDIA`), tệp bài làm học viên nộp, kết quả học tập/điểm danh.

**G4. Danh sách bên thứ ba thiếu Zalo, cổng thanh toán và đơn vị vận chuyển** —
trong khi `lib/zalo/*` đang đẩy SĐT phụ huynh ra ngoài thật (ZNS + OTP).

**G5. Form landing đang gửi 9 trường sang Google Apps Script *(CẦN SỬA)*** —
`components/legacy-laptrinhrobot/_utils/tracking.ts:8-9` đóng cứng URL `script.google.com`,
`:80-107` gửi cả **tên con, trường, lớp**, `:182` gọi TRƯỚC khi ghi DB nội bộ. Bên thứ ba này
không có trong mục 6 của chính sách. → Gỡ (Lead vẫn được ghi bởi `submitLeadToApi` ngay dòng
dưới) hoặc khai thẳng.

**G6. Bốn mốc thời gian trên web NHANH HƠN bản chính thức** — `.md:52` hứa *"24 giờ làm việc"*
(chính thức: 3 ngày), `:54` *"5-7 ngày"* (chính thức: 7–14). Cam kết chặt hơn hồ sơ là tự buộc mình.

**G7. Mốc "72 giờ làm việc"** (`chinh-sach-bao-mat.md:89`) **không tồn tại** trong bất kỳ văn bản
chính thức nào.

**G8. Dòng "30 ngày" bị ĐẢO NGHĨA** — `.md:41` xếp nó thành gạch đầu dòng thứ ba của mục
*"Trường hợp KHÔNG được hoàn trả"*; bản chính thức đặt nó ở vị trí ngược lại (thời điểm CHI tiền).
Phụ huynh đọc ra: quá 30 ngày là mất quyền.

**G9. Ba hộp thư KHÔNG tồn tại đang được công bố** — `dpo@satarobo.vn`, `cskh@satarobo.vn`,
và `(tạm thời: phuc@satarobo.vn)`. `grep` cả repo: chỉ có ở 3 dòng `.md` này.
*(Hộp thứ sáu `tuyendung@satarobo.vn` thì có thật và đúng vai — giữ, nhưng khai là email tuyển dụng.)*

**G10. Cam kết uptime 99.5%** (`dieu-khoan-su-dung.md:85`) tự đặt ra, không có trong văn bản nào,
và không công bố cách đo.

**G11. Bốn con số giờ làm việc đang sống cùng lúc** — `lib/locations.ts` "T2-T7 8:00-20:00",
JSON-LD `lib/seo/jsonld.ts:119` `'Mo-Su 08:00-21:00'` (mâu thuẫn với chữ in ngay trên cùng trang),
và file 1 "08h00–17h30 T2-T6". Phân biệt **"giờ mở cửa cơ sở"** với **"giờ tiếp nhận khiếu nại"** —
hai khái niệm khác nhau.

**G12. §5 khẳng định "không thu thập trực tiếp từ trẻ dưới 16"** — nhưng hệ thống có hẳn
**"Cổng học sinh"** (`app/(portal)/portal/hoc-sinh/`) nơi trẻ làm bài và **đánh giá giáo viên**.

**G13. BẢNG markdown RENDER ĐƯỢC** — `markdown-renderer.tsx:65` bật `remarkGfm`, `rehypeSanitize`
giữ thẻ `table`. **Nhưng** bản `.txt` bóc từ `.docx` **thiếu dòng phân cách `|---|---|`** ⇒ dán
thẳng là mất bảng mà **không báo lỗi**. Phải tự thêm, rồi mở bằng mắt ở viewport 375px.

---

## §H — Phải ĐO TRÊN DB PROD trước khi nộp (máy dev chỉ chạm DB dev)

Đi qua GitHub workflow chỉ-đọc hoặc Supabase SQL Editor, rồi **dán số vào hồ sơ**:

1. `ZMRoboKit` — `priceDisplay` + `isPublished` thật của 3 bộ (§F2).
2. `Course` — đếm dòng `isPublished = true`, đối chiếu với 2 thẻ được phép hiện (§F6).
3. `PaymentMethod` — số tài khoản THẬT đang in trên QR, đối chiếu **A1**.
4. `Job.contactEmail` — tin tuyển dụng nào đang khai email riêng.

---

## §I — ĐÃ ĐO VÀ LOẠI (đừng mở lại)

- **Hai domain cũ không phải website thứ hai** — `next.config.ts:88-112` trả **301 permanent**
  về `satarobo.vn/khoa-hoc/…`, không tự phục vụ nội dung ⇒ không cần đăng ký riêng.
- **Ba khẳng định kỹ thuật của file 1 §7 ĐÚNG với hệ thống** — bcrypt (`package.json:85`,
  `lib/auth.ts:4,168`), RBAC (`lib/auth/can.ts` + `scopedDb`), và sao lưu định kỳ
  (`.github/workflows/backup-prod-db.yml`, cron `0 18 * * *`, 6 lượt gần nhất XANH, mới nhất
  20/09/2026). **Đừng gỡ mấy câu này khỏi chính sách.**
- **"Log audit" có thật** cho hành vi GHI và cho XUẤT danh sách lead
  (`app/api/admin/leads/export/route.ts:108-123` — watermark + `writeAudit EXPORT`).
- **`robots` ĐẠT** — `app/robots.ts:4-11` chặn mọi môi trường không phải production, trang pháp
  lý không bị chặn index.
- **`productJsonLd` là mã CHẾT** — không phát ra bề mặt nào, không thuộc [5].
- **Landing luyenthirobosim không có form nào** — mọi CTA đẩy sang Zalo ⇒ [3] không áp vào đó.
- **Logo "Đã đăng ký Bộ Công Thương"**: repo chưa có gì, kể cả chỗ cắm — nhưng đó là việc **SAU**
  khi hồ sơ được duyệt, không thuộc lượt này.
