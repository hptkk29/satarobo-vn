# Phân rã yêu cầu — Dashboard QLCS, Duyệt media, Module Lead

Ngày: 21/08/2026 · Nguồn: bản ghi yêu cầu thô
Quy ước mã: `<KHU VỰC>-<số>`. Mỗi spec là một đơn vị có thể ước lượng và test độc lập.

---

## KHU VỰC A — Phạm vi quản lý & phân quyền QLCS

| Mã | Spec | Mô tả | Ghi chú |
|---|---|---|---|
| A-01 | QLCS đa cơ sở | Một tài khoản QLCS có thể được gán N cơ sở, các cơ sở **không bắt buộc cùng vùng** | Ảnh hưởng scope filter của toàn bộ dashboard |
| A-02 | Bộ lọc phạm vi dùng chung | Selector cơ sở (`all` / multi-select trong phạm vi được gán) + range ngày; mặc định `all` + từ ngày 01 → ngày hiện tại của tháng | Component dùng lại cho cả 4 tab |
| A-03 | Phân quyền export lead | Chỉ từ cấp quản lý trở lên được xuất Excel lead; admin bật/tắt được **cho từng quản lý** | Không hard-code theo role, phải là permission gán được |

---

## KHU VỰC B — Dashboard / Tab Tài chính

| Mã | Spec | Mô tả |
|---|---|---|
| B-01 | Thiết lập mục tiêu doanh thu | Set mục tiêu theo **tháng**, theo từng cơ sở |
| B-02 | Hàng chỉ số 1 | Mục tiêu · Doanh thu · Tỷ lệ hoàn thành (%) |
| B-03 | Hàng chỉ số 2 | Chi phí · Lợi nhuận · Dòng tiền |
| B-04 | Doanh thu chi tiết theo ngày | Bảng/biểu đồ: mỗi ngày trong range → giá trị |
| B-05 | Import chi phí | Nhập các đầu phí bằng **file mẫu import** (định nghĩa template cột + validate + báo dòng lỗi) |

**ĐÃ CHỐT:** ghi nhận theo **thực thu**.
- Doanh thu = tổng tiền thực thu trong kỳ (đối soát SePay), không tính giá trị hợp đồng chưa thu.
- Lợi nhuận = thực thu − chi phí trong kỳ.
- Dòng tiền = thu − chi trong kỳ.
- B-04 chi tiết theo ngày = tổng giao dịch thu của ngày đó.
- Hệ quả cần lưu ý: hợp đồng trả góp/đóng theo đợt sẽ rải doanh thu qua nhiều tháng → mục tiêu tháng (B-01) phải set theo tiền thu, không set theo số hợp đồng chốt.

---

## KHU VỰC C — Dashboard / Tab Kinh doanh

| Mã | Spec | Mô tả |
|---|---|---|
| C-01 | Mục tiêu lead theo tháng | Set thủ công theo tháng/cơ sở |
| C-02 | Khối chỉ số lead | Tổng lead · Tỷ lệ đạt mục tiêu · Tỷ lệ thành công (chốt/tổng) |
| C-03 | Bảng **Lead đã chuyển đổi** | Cột: tên KH (link trang chi tiết lead) · khoá học · cơ sở · sale · giá trị · % trên tổng doanh thu · thời điểm lead vào hệ thống · thời điểm chốt · **thời gian chốt** (chốt − vào hệ thống) |
| C-04 | Export Excel bảng C-03 | Áp quyền A-03 |
| C-05 | Bảng **Lead rớt** | Cột: tên KH (link) · khoá học · sale phụ trách · thời gian vào hệ thống · **lần tiếp cận gần nhất** (= thời gian ghi chú cuối cùng) · **số ngày chưa tiếp cận lại** (now − lần gần nhất) |

**ĐÃ CHỐT:** "lead rớt" là **trạng thái do sale tự đánh dấu**, không tự động theo ngưỡng ngày.

| Mã | Spec bổ sung | Mô tả |
|---|---|---|
| C-06 | Đánh dấu rớt | Sale đổi trạng thái lead sang `Rớt`, **bắt buộc chọn lý do rớt** (enum cấu hình được) + ghi chú tự do |
| C-07 | Audit trạng thái | Log ai đổi, đổi lúc nào, từ trạng thái nào — hiển thị ở trang chi tiết lead |

Lưu ý vận hành: vì rớt là thủ công, lead bị sale bỏ quên sẽ nằm mãi ở trạng thái đang chăm và làm đẹp giả tỷ lệ thành công. Cột "số ngày chưa tiếp cận lại" (C-05) phải được đưa lên cả bảng lead đang chăm, kèm cảnh báo khi vượt ngưỡng (ngưỡng để trong Cấu hình vận hành), để QLCS soi được lead treo.

---

## KHU VỰC D — Dashboard / Tab Chi phí Marketing

| Mã | Spec | Mô tả |
|---|---|---|
| D-01 | Job đồng bộ Facebook Ads | Cron **00:00 hằng ngày**, quét chi tiêu và lưu snapshot **theo từng ngày** vào DB (bất biến, không ghi đè lịch sử) |
| D-02 | Chỉ tiêu ngân sách | Set theo tháng/cơ sở |
| D-03 | Khối chỉ số ngân sách | Chỉ tiêu · Ngân sách thực tế (từ D-01) · % thực tế/chỉ tiêu |
| D-04 | CPL | Ngân sách thực tế ÷ tổng lead |
| D-05 | CPA ("CPC chi phí thành công/1 KH") | Ngân sách thực tế ÷ số lead chốt thành công |

**ĐÃ CHỐT:** phân bổ theo **prefix mã cơ sở trong tên campaign**, kèm bảng mapping override cho admin.

| Mã | Spec bổ sung | Mô tả |
|---|---|---|
| D-06 | Parser tên campaign | Job D-01 bóc mã cơ sở từ prefix tên campaign theo quy ước; campaign không parse được → gom vào nhóm `CHƯA PHÂN BỔ` |
| D-07 | Bảng mapping override | Admin gán thủ công campaign/ad set → cơ sở, ưu tiên cao hơn kết quả parser |
| D-08 | Cảnh báo chưa phân bổ | Hiển thị cảnh báo trên tab D khi tồn tại chi tiêu ở nhóm `CHƯA PHÂN BỔ` trong range đang xem |

**Việc cần làm ngoài code:** ban hành **văn bản hướng dẫn quy ước đặt tên campaign/ad set/ad** cho team Marketing, áp dụng trước ngày bật D-01. Cấu trúc đề xuất:

```
[MÃ CƠ SỞ]_[MỤC TIÊU]_[KHOÁ HỌC]_[ĐỊNH DẠNG]_[MMYY]_[MÃ NỘI DUNG]
Ví dụ: CS1_LEAD_ROBOTICS-L1_VIDEO_0826_A03
```

Yêu cầu bắt buộc trong văn bản: mã cơ sở luôn đứng đầu, dùng đúng danh mục mã cơ sở của hệ thống, ngăn cách bằng `_`, không dùng dấu tiếng Việt. Campaign chạy chung nhiều cơ sở dùng mã `MULTI` và **bắt buộc** khai báo tỷ lệ phân bổ ở D-07.

---

## KHU VỰC E — Dashboard / Tab Tương tác KH

| Mã | Spec | Mô tả |
|---|---|---|
| E-01 | Buổi học & đánh giá còn thiếu | Đếm theo range ngày đã chọn; click → trang danh sách: buổi chưa điểm danh, chưa đánh giá, buổi sắp tới, giáo viên phụ trách |
| E-02 | Tỷ lệ PH đã tương tác | PH đã tương tác / **tổng PH đang có con học** tại cơ sở (loại PH có con đã nghỉ/thôi học) |
| E-03 | Bảng chi tiết PH tương tác | Cột: tên PH · SĐT · danh sách người đã tương tác |
| E-04 | Drill-down kênh tương tác | Click người tương tác → dropdown kênh (1-1 / nhóm lớp) → chọn kênh thì **mở cửa sổ chat ngay tại màn hình đó**, không điều hướng sang trang tin nhắn |

**ĐÃ CHỐT:** chat realtime **đã lên production** → E-04 làm luôn trong đợt này, không hoãn, không có phương án tạm điều hướng sang trang tin nhắn.

Yêu cầu kỹ thuật cho E-04: cửa sổ chat mở dạng panel/drawer ngay trên dashboard, tái sử dụng component chat hiện có (không viết lại), giữ nguyên trạng thái bộ lọc dashboard phía sau khi đóng panel.

---

## KHU VỰC F — Kho media & quy trình duyệt ảnh/video (khối lớn nhất)

### F.1 — Kho & vòng đời media

| Mã | Spec | Mô tả |
|---|---|---|
| F-01 | Upload của GV | GV up ảnh/video vào **Kho chưa lưu hành**, gắn với lớp + buổi học + ngày |
| F-02 | Chuẩn nén | Xử lý về **H.264, 720p** trước khi lưu R2 |
| F-03 | Trạng thái media | `PENDING` → `APPROVED` / `DELETED` (xoá khỏi R2, không soft-delete) |
| F-04 | Khoá sử dụng | Chỉ media `APPROVED` mới được GV lấy ra gắn vào ảnh lớp / học bạ để PH xem, và phải đúng buổi học đó |
| F-05 | Retention 12 tháng | Job tự xoá ảnh/video học viên sau 12 tháng **nếu học bạ đã xuất**. Nếu media nằm trong học bạ **chưa xuất** → không xoá, ghi log lý do + học bạ nào |

### F.2 — Trang duyệt riêng cho QLCS

| Mã | Spec | Mô tả |
|---|---|---|
| F-10 | Cây folder theo ngày | Chỉ hiện ngày có lớp học **và** có media chưa duyệt. Ngày không có lớp → không có folder. Ngày đã duyệt hết → ẩn folder ngày |
| F-11 | Folder lớp trong ngày | Tên folder = tên lớp, click → link sang chi tiết lớp. Icon ⓘ hover → hiện tên GV phụ trách. Lớp đã duyệt hết → ẩn |
| F-12 | Màn view toàn bộ | Chọn folder lớp → grid toàn bộ ảnh/video của lớp trong ngày đó |
| F-13 | Nút "Duyệt tất cả" | Chỉ hiện khi folder **có** media. Popup xác nhận: *"Xác nhận đã xem và duyệt toàn bộ ảnh"* |
| F-14 | Nút "Hôm nay không có ảnh" | Chỉ hiện khi folder **không có** media. Bắt buộc nhập ghi chú giải trình rồi mới xác nhận |
| F-15 | Chế độ xem từng ảnh | Click ảnh → slide kiểu Tinder (vuốt / phím mũi tên). Nút **X lớn** = từ chối → popup xác nhận → xoá khỏi R2. Nút X góc = thoát về F-12 |
| F-16 | Duyệt toàn bộ, không duyệt một phần | Lớp chỉ được coi là hoàn tất khi **mọi** media đã `APPROVED` hoặc `DELETED` |
| F-17 | Video duyệt chung luồng ảnh | Video nằm cùng grid F-12 và cùng slide F-15, không tách màn riêng |
| F-18 | Bắt buộc xem hết video | Nút "Duyệt tất cả" (F-13) chỉ bật khi **mọi video trong folder đã được phát hết** (theo dõi `watchedDuration ≥ 95% duration`, lưu theo user + media). Tua nhanh vượt mốc chưa xem không tính là đã xem |
| F-19 | Chỉ báo tiến độ xem | Trên grid, mỗi video hiện badge `Đã xem` / `Còn X:XX chưa xem`; header folder hiện "Đã xem n/m video" để QLCS biết còn thiếu cái nào |

### F.3 — Deadline & cảnh báo

| Mã | Spec | Mô tả |
|---|---|---|
| F-20 | Cấu hình deadline | Hạn duyệt mặc định **10h sáng ngày hôm sau**, đưa vào **Cấu hình vận hành** để admin tự set |
| F-21 | Notification quá hạn | Quá deadline mà chưa duyệt hết → bắn thông báo vào hệ thống notification cho QLCS |

### F.4 — Báo cáo SLA duyệt ảnh

| Mã | Spec | Mô tả |
|---|---|---|
| F-30 | Bảng SLA | Cột: STT · Tên lớp · Ngày GV up · Trạng thái · Ghi chú |
| F-31 | Enum trạng thái | `Chưa duyệt` · `Đã duyệt` · `Phê duyệt trễ` · `Không có ảnh` |
| F-32 | Logic cột Ghi chú | Trễ → hiện *thời điểm duyệt / deadline cấu hình*; Chưa duyệt & Đã duyệt → để trống; Không có ảnh → hiện nội dung giải trình từ F-14 |

---

## KHU VỰC G — Module Lead

| Mã | Spec | Mô tả |
|---|---|---|
| G-01 | Mở rộng trường thông tin KH | Tên PH · SĐT PH · Tên HS · Giới tính PH/HS · Ngày sinh PH/HS · Email PH · Link FB · Địa chỉ (TP, phường/xã, chi tiết) · Nguồn lead · Người nhập lead (`mãNV_tên`) · Khoá quan tâm · Ngày nhận lead · Ngày tương tác mới nhất · Ghi chú · Sale phụ trách · Cơ sở · Lớp học tại trung tâm · Trường/lớp đang học ở ngoài · AFF |
| G-02 | Màn sửa lead | Sale **được cấp quyền sửa**. Mặc định sale sửa được toàn bộ trường nghiệp vụ; 3 trường định danh (Tên PH, Tên HS, SĐT PH) sửa được nhưng **bắt buộc ghi audit log** (ai sửa, lúc nào, giá trị cũ → mới), hiển thị ở trang chi tiết lead |
| G-03 | Export Excel lead | Theo quyền A-03 |
| G-04 | **Tuỳ chọn cột** (kiểu MISA) | Nút "Tuỳ chọn cột" trên danh sách lead → chọn trường hiển thị → kéo thả sắp xếp thứ tự → xoá cột không cần. Lưu theo **từng user**, có nút khôi phục mặc định |
| G-05 | Bỏ trường cũ | Bộ trường G-01 **thay thế hoàn toàn** bộ trường lead cũ. Cần script migration + rà soát mọi chỗ đang đọc trường cũ (form nhập, import, export, API, báo cáo) |

**ĐÃ CHỐT:** dùng bộ trường mới ở G-01, bỏ trường cũ; sale có quyền sửa; danh sách lead có tuỳ chọn cột.

| G-07 | Tách bảng `lead_student` | Quan hệ `lead` (1 PH) — `lead_student` (N học sinh). Mỗi học sinh có tên, giới tính, ngày sinh, trường/lớp ngoài, khoá quan tâm, lớp tại trung tâm riêng. Doanh số và trạng thái chốt ghi nhận **theo từng học sinh**, không theo lead |

### G-06 — Trường bổ sung (**ĐÃ CHỐT: lấy toàn bộ danh sách dưới đây vào schema**)

Nhóm bắt buộc để chạy được C và D:

| Trường | Lý do |
|---|---|
| **Trạng thái lead** (enum: Mới → Đang tư vấn → Hẹn học thử → Đã học thử → Chốt → Rớt) | Không có thì C-03/C-05 không phân loại được |
| **Lý do rớt** (enum cấu hình) + ghi chú rớt | Bắt buộc theo C-06 |
| **Thời điểm chốt** | C-03 cần để tính thời gian chốt |
| **Giá trị hợp đồng / doanh số quy về lead** | C-03 cần cột giá trị và % trên tổng doanh thu |
| **Campaign / Ad ID / UTM nguồn** | Nối lead ↔ chi phí ads (D-04, D-05); không có thì CPL chỉ tính được ở mức tổng, không bóc theo campaign |

Nhóm nên có, chi phí thêm thấp:

| Trường | Lý do |
|---|---|
| **Ngày hẹn follow-up kế tiếp** | Cho sale chủ động, và là dữ liệu cảnh báo lead treo |
| **Mức độ tiềm năng** (Nóng / Ấm / Lạnh) | Ưu tiên chăm sóc |
| **Kênh liên hệ ưu tiên** (Gọi / Zalo / FB) | PH ở Đà Nẵng phần lớn dùng Zalo, sale cần biết gọi hay nhắn |
| **Số Zalo** (nếu khác SĐT PH) | Thực tế hay lệch |
| **Đã học thử: có/không + ngày học thử + kết quả** | Mốc chuyển đổi quan trọng nhất của mô hình trung tâm |
| **Nhiều học sinh trên một PH** | Một PH hai con là trường hợp thường gặp, nếu ép 1-1 sẽ phải nhập trùng lead |
| **Cờ trùng lặp** (check theo SĐT khi nhập) | Chặn hai sale cùng chăm một PH |
| **Lịch sử chuyển sale** | Tránh tranh chấp hoa hồng |

**ĐÃ CHỐT:** tách `lead` / `lead_student` (xem G-07). Hệ quả cần xử lý trong migration:

- Dữ liệu lead cũ: mỗi bản ghi cũ → 1 `lead` + 1 `lead_student`; các bản ghi trùng SĐT PH gom lại thủ công sau, không tự động merge.
- C-03 (lead đã chuyển đổi) đếm theo **học sinh chốt**, không theo lead.
- E-02 (tỷ lệ PH đã tương tác) đếm theo **PH**, một PH hai con vẫn tính là 1.
- Chỉ tiêu lead C-01 phải nói rõ đếm PH hay đếm học sinh — đề xuất đếm **học sinh**, vì đó mới là đơn vị sinh doanh thu.

---

## Thứ tự thi công đề xuất

1. **A** (nền phạm vi + phân quyền) — chặn tất cả phần còn lại.
2. **F** (kho media + duyệt + SLA) — khối nặng nhất, có ràng buộc pháp lý/hình ảnh học viên, làm sớm.
3. **G** (Lead) — độc lập, có thể chạy song song F.
4. **C** → **D** → **B** (dashboard số liệu; C phụ thuộc G, D phụ thuộc job Ads).
5. **E** — chat đã lên prod nên không còn phụ thuộc, có thể đẩy lên song song với C/D.

## Trạng thái quyết định — đã chốt toàn bộ

| # | Nội dung | Kết quả |
|---|---|---|
| 1 | Ghi nhận doanh thu | Thực thu |
| 2 | Lead rớt | Sale tự đánh dấu + bắt buộc lý do |
| 3 | Phân bổ chi phí ads | Prefix mã cơ sở + mapping override; **đã soạn QĐ `SR.QD.232`** ban hành quy ước đặt tên |
| 4 | Chat inline E-04 | Làm luôn (chat đã lên prod) |
| 5 | Trường lead | Bỏ hết trường cũ, lấy toàn bộ G-06, tách `lead_student` |
| 6 | Duyệt video | Chung luồng ảnh, bắt buộc xem hết |
| 7 | Deadline duyệt ảnh | Mặc định **10h sáng ngày hôm sau**, admin sửa được trong Cấu hình vận hành |

Còn lại là việc triển khai, không phải quyết định:

- Ban hành `SR.QD.232` cho Marketing **trước ngày bật job D-01** — bật trước khi phổ biến thì dữ liệu những ngày đầu rơi hết vào `CHƯA PHÂN BỔ`.
- Khoá schema lead theo G-01 + G-06 + G-07 rồi mới viết migration G-05.
- Điền nốt 2 giá trị mặc định còn trống trong Cấu hình vận hành: ngưỡng cảnh báo lead treo (số ngày) và enum lý do rớt.
