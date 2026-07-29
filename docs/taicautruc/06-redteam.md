# BƯỚC 6 — Red-team chiến lược: đánh thẳng D10 và D7

> Ngày 29/07/2026 · phạm vi **BƯỚC 6**, đánh **đúng hai quyết định** theo yêu cầu: **D10** (phạm vi tài chính suy từ quyền sở hữu chương trình) và **D7** (bỏ hẳn học bù liên cơ sở) · nguồn: `02-prd-franchise-platform.md` · `QUYET-DINH.md` (QĐ-C) · `01-intended-vs-implemented.md` · `04-assumptions.md` (§0 + §8) · `05-premortem.md` · **mã nguồn repo** · số đo PROD 29/07/2026.
>
> **Phương pháp.** Red-team **chiến lược**, không phải red-team **an ninh**: không tìm lỗ hổng kỹ thuật để khai thác, mà **giao cho từng đối thủ một động cơ thật rồi hỏi họ đánh bại chiến lược này bằng cách RẺ NHẤT**. Tiêu chí của một tuyến tấn công tốt: **hợp lệ về nghiệp vụ** (không cần gian lận, không cần quyền đặc biệt), **rẻ với kẻ tấn công**, **đắt hoặc vô hình với bên phòng thủ**.
> ⚠️ Skill `pm-execution:strategy-red-team` **không có trong máy này** — áp phương pháp chuẩn, không theo khuôn skill.
>
> **Luật của vòng này.** Red-team **không mở lại** D10, D7, hay QĐ-C — cả ba **giữ nguyên**. Vòng này tấn công **cách thi hành**, không tấn công **ý chí**. Chỗ nào tấn công thành công thì đề xuất **phòng thủ**, không đề xuất huỷ quyết định. Chỗ nào quyết định mâu thuẫn hiện trạng mã → **§8, không tự hoà giải**.

---

## 1. Cách đọc

| Ký hiệu | Nghĩa |
|---|---|
| `[QS]` | **Quan sát** — có `đường-dẫn:số-dòng`, đã mở lại bằng Read/Grep trước khi viết |
| `[SĐ]` | **Suy đoán** — phán đoán, phải kiểm mới dùng được |
| `TC-NN` | Mã tuyến tấn công. Số phẳng, ổn định |
| `Đ1..Đ5` | Đối thủ (persona), xem §2 |

**Chấm tuyến tấn công** — ba trục, đều dùng nhãn thứ tự (không dùng điểm số, lý do như BƯỚC 5):

- **Chi phí với kẻ tấn công:** `KHÔNG` (không tốn gì, chỉ là không làm một việc) · `THẤP` (một thao tác nhập liệu hợp lệ) · `VỪA` (đổi cách vận hành) · `CAO`.
- **Thiệt hại với chiến lược:** `VÔ HIỆU HOÁ` (quyết định mất hẳn tác dụng) · `NẶNG` · `VỪA` · `NHẸ`.
- **Bên phòng thủ thấy được không:** `KHÔNG` · `CHẬM` (thấy khi đã muộn) · `CÓ` (có phép đo bắt được sớm).

**Hai cờ lịch** giữ nguyên chuẩn `02-prd:360-364`; luật *"phép đo chỉ-đọc thì cả hai cờ = KHÔNG"* giữ nguyên.

---

## 2. Năm đối thủ

Red-team chỉ tốt bằng chất lượng đối thủ. Bốn đối thủ đầu **không ác ý** — đó là điểm quan trọng nhất của vòng này.

| | Đối thủ | Động cơ thật | Ghi chú |
|---|---|---|---|
| **Đ1** | **Bên NHẬN nhượng quyền, có lý trí kinh tế** | Trả phí thương hiệu ít nhất có thể; giữ quyền tự chủ vận hành | **Không gian lận** — chỉ tối ưu trong khuôn khổ hợp đồng cho phép. Đây là đối thủ mạnh nhất vì mọi nước đi của họ đều **hợp lệ** |
| **Đ2** | **Nhân viên cơ sở tránh ma sát** | Xong việc trong ca trực | Không biết và không quan tâm tới D7/D10. Chọn đường ít bước nhất |
| **Đ3** | **Quản lý cơ sở giữ khách** | Không để phụ huynh bỏ; chỉ số giữ chân | Sẵn sàng làm ngoài hệ thống nếu hệ thống cản |
| **Đ4** | **Nhân sự HO tò mò / tiện tay** | Làm báo cáo nhanh, không muốn xin quyền | D10 **cũng ràng buộc HO** — đây là chiều bị bỏ quên |
| **Đ5** | **Thời gian** | — | Không phải người: nhân sự đổi, tài liệu cũ đi, số dòng trôi, người trực CI không phải người viết quyết định |

---

## 3. D10 — đánh vào lý thuyết thắng

### 3.1 Lý thuyết thắng của D10, phát biểu lại cho sòng phẳng

`[QS]` D10 = *"phạm vi tài chính suy từ quyền sở hữu chương trình"* (`01-intended-vs-implemented.md:126`). Cụ thể hoá ở PRD: `isInFranchiseScope(classId)` **true ⟺ giải được chương trình VÀ `ownerOrgUnitId` = OrgUnit HO** (`02-prd:293`); trong phạm vi thì FRANCHISOR xem **chi tiết từng dòng** đúng 5 nhóm (`:294`), ngoài phạm vi thì **đúng 5 chỉ số tổng hợp** (`:295`).

Rút gọn thành ba mệnh đề — chiến lược thắng **chỉ khi cả ba đều đúng**:

1. **Doanh thu của bên nhận có mặt trong hệ thống HO.**
2. **Lớp của họ giải được về một chương trình.**
3. **Chương trình đó có chủ, và chủ là HO.**

`[QS]` PRD đã tự nhận mệnh đề 3 là mắt yếu — *"D10 tắc vì thiếu đúng MỘT trường"* (`01-intended:137`), và `R-D8-01` (`Curriculum.ownerOrgUnitId`) là *"chi phí nhỏ nhất, đòn bẩy lớn nhất"* (`:141`). **Red-team đồng ý mệnh đề 3 đã được xử lý tốt.** Nên vòng này đánh vào **mệnh đề 1 và 2** — hai chỗ chưa ai đánh.

### 3.2 Các tuyến tấn công

#### TC-01 — Không nhập doanh thu vào hệ HO *(Đ1)*

**Chi phí kẻ tấn công: KHÔNG · Thiệt hại: VÔ HIỆU HOÁ · Thấy được: KHÔNG**

**Nước đi.** Không cần chương trình riêng, không cần lách gì. Chỉ cần **một phần doanh thu không đi qua hệ thống** — thu tiền mặt, thu qua tài khoản riêng, ghi nhận chậm một kỳ, hoặc đơn giản là nhập thiếu.

**Vì sao chiến lược không chống được.** `[QS]` `R-D9-09` (`02-prd:287`) đặt `feeRate` tính trên số liệu **trong hệ**; `[QS]` `R-D10-12` (`:302`) tách phạm vi tính phí khỏi phạm vi xem chi tiết — nhưng **cả hai phạm vi đều đọc cùng một nguồn**: dữ liệu do chính bên nhận nhập. **D10 không có một nguồn sự thật độc lập nào.**

`[QS]` `04-assumptions.md` đã xếp `GD-06` (*"bên nhận ghi đủ doanh thu vào hệ thống HO"*) ở **Impact 10** và ghi rõ: không dòng mã nào trả lời hộ được, chỉ có điều khoản thương lượng.

**Đây không phải lỗ hổng kỹ thuật — đây là giới hạn cấu trúc của cả D10.** Đáng nói vì tài liệu hiện đang trình bày D10 như một cơ chế **kiểm soát**, trong khi nó thực chất là cơ chế **ghi chép**: nó mô tả trung thực những gì được nhập vào, không xác minh được cái gì đã không được nhập.

**Phòng thủ khả dĩ** (không cái nào miễn phí):

| Cách | Cỡ | Cờ 1 | Cờ 2 | Đánh đổi |
|---|---|---|---|---|
| Đổi căn cứ tính phí từ **tiền đã thu** sang **số học viên đang học × đơn giá hợp đồng** | M | KHÔNG | KHÔNG | Số học viên khó giấu hơn tiền (có lớp, có điểm danh, có phụ huynh). Nhưng phải sửa `R-D9-09` + `R-D10-12`, và cần Ban chốt **c6** |
| Đối soát chéo với tín hiệu **không do bên nhận nhập**: số buổi đã dạy, tỉ lệ điểm danh, số học viên hoạt động | M | KHÔNG | KHÔNG | Không chứng minh được gian lận, chỉ **phát hiện bất thường**: doanh thu/học viên lệch mạnh khỏi CS1/CS2 |
| Chấp nhận và chuyển sang **kiểm toán hợp đồng** ngoài hệ thống | — | — | — | Trung thực nhất. Nhưng phải **ghi vào PRD** rằng D10 không phải cơ chế chống thất thu |

⚠️ Cách 2 chỉ có nghĩa khi biết **sàn nhiễu** — chính là thí nghiệm `GD-06` (đo lệch trên CS1/CS2, nơi **không có động cơ giấu**). Thí nghiệm đó **chưa chạy**.

#### TC-02 — Bỏ trống liên kết chương trình để làm HO mù *(Đ1, Đ2)*

**Chi phí kẻ tấn công: KHÔNG · Thiệt hại: NẶNG · Thấy được: CÓ (nhưng chỉ đếm, không chặn)**

**Nước đi.** Tạo lớp mà **không đặt** `Class.curriculumId`, và khoá tương ứng không có bản `ACTIVE`. `resolveClassCurriculum` trả `null` → `isInFranchiseScope` trả **false**.

**Đây là chỗ đảo chiều quan trọng nhất của cả tài liệu.** `[QS]` `R-D10-03` (`02-prd:293`) và `R-D10-13` (`:303`) đều chốt *"không giải được → **false** (fail-closed)"*. Với **D4** (cách ly dữ liệu), fail-closed là hướng an toàn: không chắc thì **đừng cho xem**. Với **D10** (giám sát), fail-closed là hướng **nguy hiểm**: không chắc thì **HO mất quyền xem**.

⇒ **Cùng một từ "fail-closed" mang hai nghĩa ngược nhau ở hai quyết định, và bên bị giám sát điều khiển được điều kiện kích hoạt nó.** Bỏ trống một trường là một **thiếu sót nhập liệu**, không phải hành vi đáng ngờ.

`[QS]` `Class.curriculumId` là **nullable** và chú thích ngay tại đó ghi *"null = lớp cũ, helper fallback"* (`prisma/schema.prisma:1311-1312`) ⇒ trạng thái null là **hợp lệ và phổ biến**, không có gì để phân biệt "lớp cũ" với "lớp cố tình để trống".

`[QS]` `R-D10-13` có yêu cầu *"báo cáo đếm số lớp không giải được; con số phải giảm về 0 trong khoảng đã ấn định"* — **đếm, không chặn**, và *"khoảng đã ấn định"* chưa ai đặt.

**Phòng thủ:**

| Cách | Cỡ | Cờ 1 | Cờ 2 |
|---|---|---|---|
| **Bắt buộc `curriculumId` khi tạo lớp trong đơn vị FRANCHISEE** (không bắt buộc cho đơn vị nội bộ, tránh vỡ dữ liệu cũ) | S | KHÔNG | KHÔNG |
| Đảo mặc định **riêng cho báo cáo tính phí**: lớp không giải được → **TÍNH PHÍ** (không phải miễn), nhưng **không mở** chi tiết. Tách đúng tinh thần `R-D10-12` | S | KHÔNG | KHÔNG |
| Báo cáo `R-D10-13` phải là **cảnh báo có ngưỡng + có chủ**, không phải con số nằm im | S | KHÔNG | KHÔNG |

Cách 2 là cách rẻ nhất và đúng nhất: **không giải được chương trình thì không được thành lý do miễn phí.**

#### TC-03 — Soạn chương trình MỚI thay vì sao chép *(Đ1)*

**Chi phí: THẤP · Thiệt hại: NẶNG · Thấy được: CÓ**

**Nước đi.** `[QS]` `R-D10-11` (`02-prd:301`) chỉ phủ **bản sao**: *"Sao chương trình HO sang đơn vị nhượng quyền → bản sao có trường trỏ về chương trình gốc"*. Kẻ tấn công **không sao chép** — họ tạo một `Curriculum` mới, nhập lại nội dung tương đương. Không có nguồn gốc nào để giữ.

`[QS]` Đây chính là §9 câu 2 (`02-prd:455`), đã được đánh dấu 🔴 và mô tả là *"lỗ hổng thương mại mở bằng đúng một thao tác nhập liệu hợp lệ"*, và `R-D10-12` được viết ra để chống. **Red-team xác nhận `R-D10-12` là đúng hướng** — nhưng nó **chưa đủ**, vì:

`[QS]` `R-D10-12` định nghĩa *"phạm vi tính phí = theo hợp đồng (mọi lớp chạy trong đơn vị nhượng quyền)"*. Câu này chỉ đứng vững nếu **mọi lớp đều nằm trong một đơn vị nhượng quyền xác định được**. Kết hợp với **TC-02** (lớp không giải được chương trình) và với **c9** (*một hợp đồng có phủ nhiều cơ sở không*, chưa trả lời), ranh giới "trong đơn vị nhượng quyền" vẫn còn chỗ mờ.

**Phòng thủ:** `R-D10-12` phải phát biểu phạm vi tính phí theo **đơn vị của lớp**, tuyệt đối **không** theo chương trình — và viết thành một câu **không tham chiếu tới `Curriculum`** để sau này không ai nối lại hai khái niệm. Cỡ S · Cờ 1 KHÔNG · Cờ 2 KHÔNG.

#### TC-04 — Chia nhỏ lớp để làm rỗng chỉ số tổng hợp *(Đ1)*

**Chi phí: THẤP · Thiệt hại: NẶNG · Thấy được: CÓ**

**Nước đi.** `[QS]` `R-D10-05` (`02-prd:295`) quy định ngoài phạm vi thì trả **đúng 5 chỉ số tổng hợp**, và **`null` kèm nhãn "không đủ dữ liệu" cho ô < 5 học viên**. Ngưỡng ẩn danh này là **công tắc do bên bị giám sát bật được**: xếp lớp theo nhóm 4 học viên thì **mọi ô đều null**. HO mù cả ở mức tổng hợp — mức lẽ ra luôn được thấy.

Nhóm nhỏ trông hoàn toàn chính đáng: lớp năng khiếu, lớp kèm, lớp mới mở.

**Phòng thủ:**

- Ngưỡng ẩn danh áp ở **mức đơn vị theo kỳ**, **không** áp ở mức lớp: tổng học viên của cơ sở trong tháng ≥ 5 thì các chỉ số **tổng hợp cấp cơ sở** vẫn trả số, dù chia thành bao nhiêu lớp. Cỡ S · Cờ 1 KHÔNG · **Cờ 2 CÓ** (đổi tập dữ liệu HO đọc được).
- Thêm chỉ số thứ 6: **số lớp có sĩ số dưới ngưỡng**. Ô này **không bao giờ bị ẩn danh** — nó không tiết lộ ai, chỉ tiết lộ **hình dạng**. Cỡ S.

`[QS]` Lưu ý ràng buộc: `R-D10-05` yêu cầu *"phản hồi chứa **đúng 5 khoá**"* và có test *"duyệt đệ quy toàn bộ khoá theo danh sách cấm"* ⇒ thêm khoá thứ 6 **phải sửa cả yêu cầu lẫn test**, không lén thêm.

#### TC-05 — Dùng chính sai số của báo cáo để từ chối ký đối soát *(Đ1)*

**Chi phí: KHÔNG · Thiệt hại: NẶNG (chặn `R-OPS-03` ⇒ chặn B5) · Thấy được: CHẬM**

**Nước đi.** Đây là tuyến **phòng ngự** của Đ1, không phải tấn công: khi HO đưa bản đối soát, bên nhận chỉ cần chỉ ra rằng con số **sai có lợi cho HO** rồi từ chối ký.

`[QS]` `04-assumptions.md` §8 (mục `d9d10-02`) đã chứng minh bằng mã: có **hai** màn báo cáo với **hai** định nghĩa doanh thu khác nhau, và **cả hai** đều **bỏ** `REFUNDED` (bút toán âm) lẫn `ADJUSTED` (bản gốc không bị sửa) ⇒ **doanh thu báo cáo là số GỘP**, tức HO đang tính phí **trên cả tiền đã hoàn cho phụ huynh**.

`[QS]` `R-OPS-03` (đối soát + chữ ký kế toán) là **điều kiện bật cho B5** (`02-prd:444`). Không có chữ ký thì `R-D10-06/07/08` → `R-D4-09` → `R-D10-04` → `R-D10-10` **đứng im cả chuỗi**.

⇒ Một lỗi báo cáo tưởng là chuyện kế toán, hoá ra là **chốt chặn của cả nhánh D10**. Và bên nhận **có lý** khi từ chối — đây là loại tranh chấp không thắng được bằng kỹ thuật.

**Phòng thủ:** sửa định nghĩa doanh thu (trừ `REFUNDED`, xử lý `ADJUSTED`) **trước** khi đưa bản đối soát đầu tiên, không phải sau. Cỡ M · Cờ 1 KHÔNG · Cờ 2 KHÔNG. **Ưu tiên cao — nó nằm trên đường tới hạn của B5.**

#### TC-06 — Chờ vế cấm của D10 thành thật *(Đ5)*

**Chi phí: KHÔNG · Thiệt hại: VỪA · Thấy được: CÓ (nếu canary có chủ)**

`[QS]` `01-intended:126` ghi vế cấm của D10 (HO **không** xem lương/mặt bằng/lợi nhuận của bên nhận) hiện *"khớp ngẫu nhiên vì hệ chưa có dữ liệu đó"*. `[QS]` `R-D10-09` (`02-prd:299`) dựng **test canary** fail khi schema xuất hiện model khớp `Payroll|Expense|Ledger|Budget|Invoice|CostCenter` — nhưng chính dòng đó ghi ⚠️ *"cần chốt: **ai xử lý khi canary kêu**"*.

**Một canary không có người trực là một canary sẽ bị tắt.** `[SĐ]` Kịch bản thật: MISA hoặc module lương về, CI đỏ, người trực không biết D10 là gì, thêm model vào danh sách loại trừ để merge cho kịp — vế cấm mất im lặng.

**Phòng thủ:** gán **tên người** vào `R-D10-09`, và viết thông báo lỗi của canary thành **một câu tự giải thích** (*"schema vừa xuất hiện dữ liệu chi phí — D10 cấm HO xem của bên nhận; đọc `06-redteam.md` TC-06 trước khi sửa test này"*). Cỡ S · Cờ 1 KHÔNG · Cờ 2 KHÔNG.

#### TC-07 — Chốt chặn `R-D10-10` không bao giờ mở được *(Đ5)*

**Chi phí: KHÔNG · Thiệt hại: NẶNG · Thấy được: CÓ**

`[QS]` `R-D10-10` (`02-prd:300`) là **chặn cứng**: không mở màn hình chi tiết D10 khi `isHoLevel` còn cấp phạm vi toàn hệ thống; nó phụ thuộc `R-D4-09`. `[QS]` `R-D4-09` nằm ở **B5** (`:434`) và đang kẹt trong **vòng khoá M2** của BƯỚC 5 (QĐ-A.1 treo vào *"chờ cửa sổ shadow đóng"* — điều kiện nay không định nghĩa được).

Hai kết cục, cả hai đều xấu: **D10 không ra mắt**, hoặc **ai đó tắt chốt chặn để ra mắt cho kịp**. `[SĐ]` Kết cục thứ hai khả năng cao hơn vì `R-D10-04` là màn hình cỡ **L** — đã tiêu công sức thì áp lực ra mắt rất mạnh.

**Phòng thủ:** viết vào `R-D10-10` rằng **cờ tắt chỉ được mở bởi người ký `R-D4-09`**, không phải bởi người làm `R-D10-04`. Đây là **tách người**, không phải tách kỹ thuật. Cỡ S.

#### TC-08 — Đánh D10 từ phía HO, chiều đang bị bỏ quên *(Đ4)*

**Chi phí: KHÔNG · Thiệt hại: NẶNG · Thấy được: KHÔNG · Đang xảy ra hôm nay**

`[QS]` `isHoLevel` = **bất kỳ** role nào gắn tại node `HO`/`ROOT`, **không lọc `roleCode`** (`lib/auth/actor.ts:132-133`) → `centerScope = "ALL"`. `[QS]` QĐ-A.1 (`QUYET-DINH.md:38-40`) đã phát biểu chính xác: *"hễ còn `isHoLevel = ALL`, mọi nhân sự HO đọc **toàn bộ** dữ liệu FRANCHISEE bất kể chương trình nào"*.

⇒ **Vế "ngoài phạm vi chỉ được xem số tổng hợp" của D10 hiện KHÔNG có hiệu lực với bất kỳ ai ở HO.** Một nhân sự marketing HO có `UserOrgRole` tại HO đọc được dữ liệu chi tiết của cơ sở nhượng quyền — không cần quyền `franchise-finance:view-detail` nào.

Đây là **vi phạm D10 đang tồn tại**, không phải rủi ro tương lai. Và nó nằm sau đúng cái nút bị kẹt ở TC-07.

**Phòng thủ:** không có cách rẻ. Đây chính là `R-D4-09`. Điều red-team bổ sung được: **ghi nhận tường minh rằng D10 hiện đang bị vi phạm ở chiều HO**, để không ai coi việc chưa làm `R-D4-09` là *"chưa thêm tính năng"* — nó là *"đang để mở"*.

---

## 4. D7 — đánh vào lý thuyết thắng

### 4.1 Lý thuyết thắng của D7 / QĐ-C

`[QS]` QĐ-C (`QUYET-DINH.md:65-79`) huỷ QĐ-O2, chốt học bù **chỉ trong nội bộ một cơ sở**, *"ca phát sinh xử lý **thủ công**"*, và bắt làm **cùng lúc cả 3**: đổi mặc định về `false` · đổi fail-OPEN → fail-CLOSED · **gỡ `MAKEUP_EXCEPTION_MODELS`**. `[QS]` Chính QĐ-C cảnh báo: *"Chỉ làm (1)+(2) mà không làm (3) = trả giá kiến trúc mà không còn thu lợi nghiệp vụ"* (`:75`).

Lý thuyết thắng: **cắt tính năng ⇒ cắt được hành vi ⇒ đóng được lỗ kiến trúc.**

Red-team tấn công **mắt giữa**: cắt tính năng **không** cắt được hành vi, vì nhu cầu không nằm trong phần mềm.

### 4.2 Các tuyến tấn công

#### TC-09 — Đổi mặc định không đổi cấu hình đã đặt *(Đ3, Đ5)*

**Chi phí: KHÔNG · Thiệt hại: NẶNG · Thấy được: CÓ**

`[QS]` `makeup.crossCenterEnabled` khai `default: true` **và `centerOverridable: true`** (`lib/settings/registry.ts:484-490`). `[QS]` `R-QDC-01` (`02-prd:311`) đổi mặc định về `false`, nghiệm thu là: *"**Cơ sở chưa cấu hình gì** → gợi ý bù không liệt kê buổi của cơ sở khác"*.

⇒ **Nghiệm thu chỉ phủ cơ sở CHƯA cấu hình.** Cơ sở nào đã từng bật tường minh thì **giữ nguyên bật**, và đèn vẫn xanh. Không ai phải làm gì để tấn công — chỉ cần **đã lỡ bật từ trước**.

**Phòng thủ:** `R-QDC-01` phải kèm **xoá/ghi đè các bản ghi override cấp cơ sở** (và đếm số bản ghi đã xoá làm bằng chứng nghiệm thu), không chỉ đổi hằng `default`. Cỡ S · Cờ 1 KHÔNG · **Cờ 2 CÓ** (đổi tập buổi mà nhân sự cơ sở đọc được).

⚠️ **Số dòng trong QĐ-C đã trôi:** `QUYET-DINH.md:71` dẫn `lib/settings/registry.ts:457-464`, thực tế là **`:484-490`**; `:72` dẫn `lib/makeup/service.ts:104`, thực tế `.catch(() => true)` nằm ở **`:108`**. `[SĐ]` Người thi hành theo số dòng sẽ sửa nhầm chỗ — `:104` hiện là dấu `})` đóng khối `select`.

#### TC-10 — Nhu cầu rời khỏi hệ thống, phép đếm đọc ra "0" *(Đ3)*

**Chi phí: KHÔNG · Thiệt hại: VÔ HIỆU HOÁ (phần đo lường) · Thấy được: KHÔNG**

**Đây là tuyến mạnh nhất chống D7, và nó không cần ai làm gì sai.**

`[QS]` QĐ-C tự viết: *"ca phát sinh xử lý **thủ công**"* (`:67`) và *"sau khi gỡ, sẽ **không còn** ca chéo nào đi qua hệ thống → audit `MAKEUP_CROSS_CENTER` sẽ ngừng sinh dòng. Cần một chỗ ghi nhận ca xử lý thủ công để còn đếm được"* (`:77`). `[QS]` `R-QDC-04` (`02-prd:314`) nhận việc đó.

Vấn đề: **`R-QDC-04` yêu cầu người ta tự nguyện khai báo chính cái việc vừa bị cấm.** Không có động cơ nào để khai. Không có ràng buộc kỹ thuật nào bắt khai — ca thủ công theo định nghĩa là ca **không đi qua hệ thống**.

⇒ Chỉ số sẽ đọc **0 ca bù chéo**. Con số đó **không phân biệt được** *"đã hết ca"* với *"còn ca nhưng không ai ghi"*. Đúng hình dạng của **KB-18** ở BƯỚC 5: đèn xanh vì rỗng.

`[SĐ]` Tệ hơn: `MAKEUP_CROSS_CENTER` **hiện đang sinh dòng** — tức hôm nay ta còn đo được. Sau QĐ-C, ta **mất luôn khả năng đo**, và mất đúng vào lúc bắt đầu cần đo (khi có pháp nhân thứ hai).

**Phòng thủ:**

| Cách | Cỡ | Cờ 1 | Cờ 2 |
|---|---|---|---|
| **Đo TRƯỚC khi gỡ** — chạy `R-QDC-05` và giữ con số làm **mốc nền**, đừng để nó chỉ là bước dọn dữ liệu | S | KHÔNG | KHÔNG |
| Thay "ghi nhận tự nguyện" bằng **tín hiệu gián tiếp không ai phải khai**: đếm học viên có buổi vắng **không** được bù trong N ngày, tách theo cơ sở. Tăng đột biến = nhu cầu đang chảy ra ngoài | M | KHÔNG | KHÔNG |
| Ghi thẳng vào `R-QDC-04`: *"0 ca thủ công **không** là bằng chứng thành công"* | S | KHÔNG | KHÔNG |

Cách 2 là điểm đóng góp chính của vòng này cho D7: **đo cái không thể giấu (buổi vắng) thay vì đo cái phải tự khai (ca bù tay).**

#### TC-11 — Đường vòng còn lại trong hệ thống *(Đ2, Đ3)*

**Chi phí: THẤP · Thiệt hại: NẶNG · Thấy được: CHẬM**

Cấm gợi ý bù chéo cơ sở **không** cấm các đường khác dẫn tới cùng kết quả. `[SĐ]` Ba đường dễ thấy nhất, đều dùng chức năng đang có và đều hợp lệ:

1. **Chuyển cơ sở cho học viên** rồi xếp bù nội bộ, rồi chuyển về — hệ đã có `StudentCenterHistory`.
2. **Tạo một lớp/buổi ở cơ sở nhà** khớp lịch, thực tế học viên tới cơ sở kia học.
3. **Điểm danh tay** buổi đã lỡ là "có mặt" ở một buổi khác.

Cả ba đều để lại dấu vết, nhưng **không đường nào bị `R-QDC-01..05` chạm tới** — bộ 5 mã chỉ nói về `makeup.*` và `MAKEUP_EXCEPTION_MODELS`.

**Phòng thủ:** trước khi đóng pha A3, **liệt kê tường minh** danh sách đường vòng và quyết cho từng đường: chặn, hay cho phép nhưng **ghi nhận**. Đường (1) đáng chú ý nhất vì nó có sẵn giao diện. Cỡ S (khảo sát) · Cờ 1 KHÔNG · Cờ 2 KHÔNG.

#### TC-12 — Fail-CLOSED tạo áp lực vận hành, rồi bị đảo ngược *(Đ5)*

**Chi phí: KHÔNG · Thiệt hại: VỪA · Thấy được: CÓ**

`[QS]` `R-QDC-02` (`02-prd:312`) đổi `.catch(() => true)` (`lib/makeup/service.ts:108`) thành fail-CLOSED. Đúng về nguyên tắc.

`[SĐ]` Nhưng hàm này **không phân biệt** *"đọc setting lỗi"* với *"cơ sở chưa cấu hình"* — cả hai rơi vào cùng một `.catch`. Sau khi đổi, một sự cố dịch vụ setting sẽ làm **mọi cơ sở** mất gợi ý bù, kể cả bù **nội bộ** nếu lỗi lan rộng hơn. Nhân viên gặp màn hình trống trong giờ cao điểm → báo lên → sửa nhanh nhất là **đảo lại `catch`**.

**Phòng thủ:** tách hai trường hợp — thiếu cấu hình thì dùng mặc định `false` (im lặng, đúng ý QĐ-C); **lỗi đọc thật** thì fail-closed **kèm cảnh báo hiện lên UI** để người dùng biết đây là sự cố, không phải luật mới. Cỡ S · Cờ 1 KHÔNG · Cờ 2 KHÔNG.

#### TC-13 — Test cũ kéo ngoại lệ quay lại *(Đ5)*

**Chi phí: KHÔNG · Thiệt hại: VÔ HIỆU HOÁ (điểm (3) của QĐ-C) · Thấy được: CÓ**

Đã ghi ở BƯỚC 5 là **KB-09**; red-team xác nhận và bổ sung một điểm: `[QS]` điều kiện ra của pha A3 (`02-prd:415`) ghi *"Grep `MAKEUP_EXCEPTION` = 0; **test cách ly hiện có vẫn xanh**"*, trong khi `tests/e2e/r7/makeup-cross-center.spec.ts` có 3 ca **khẳng định** hành vi chéo cơ sở và import trực tiếp `withMakeupException`.

⇒ **Hai vế của cùng một điều kiện ra loại trừ nhau.** Người trực CI đọc điều kiện ra sẽ kết luận là mình làm hỏng, rồi khôi phục ngoại lệ — và lần này **có tiêu chí nghiệm thu chống lưng**. Đây là điểm (3) của QĐ-C, đúng cái QĐ-C cảnh báo *"không chọn phương án nửa vời"* (`QUYET-DINH.md:75`).

**Phòng thủ:** xoá/viết lại `makeup-cross-center.spec.ts` **trong cùng lần phát hành** với `R-QDC-03`, và sửa điều kiện ra A3 thành *"bộ test mới khẳng định chéo cơ sở bị **CHẶN**"*. → §8 (M3 của BƯỚC 5).

---

## 5. Cái D10 và D7 chia chung — một lỗi hình học, không phải hai lỗi rời

**Cả hai quyết định đo bằng chính hệ thống mà đối tượng bị đo kiểm soát đầu vào.**

- **D10** đo doanh thu của bên nhận — bằng dữ liệu **bên nhận nhập** (TC-01).
- **D7** đo số ca bù chéo còn lại — bằng **lời khai tự nguyện** của người vừa bị cấm (TC-10).

`[SĐ]` Hệ quả giống nhau: **cả hai sẽ cho ra con số đẹp**, và con số đẹp đó **không phân biệt được với thành công**. Đây là cùng một hình dạng với `KB-18` (nghiệm thu xanh vì prod rỗng) ở BƯỚC 5 — ba chỗ khác nhau, một lỗi.

**Nguyên tắc rút ra, đề nghị đưa thành luật của chương trình:**

> **Mọi chỉ số dùng để chứng minh một quyết định đã thành công phải có ít nhất một nguồn mà bên bị đo KHÔNG kiểm soát** — hoặc phải ghi tường minh rằng chỉ số đó **không** dùng để nghiệm thu.

Áp vào ba chỗ đang vi phạm:

| Chỉ số | Nguồn hiện tại | Nguồn độc lập khả dĩ |
|---|---|---|
| Doanh thu bên nhận (`R-D9-09`) | bên nhận nhập | số học viên đang học · số buổi đã dạy · tỉ lệ điểm danh |
| Ca bù chéo còn lại (`R-QDC-04`) | tự khai | buổi vắng **không được bù** trong N ngày |
| Điều kiện ra làn A (`02-prd:413-421`) | `count = 0` trên prod gần rỗng | mẫu số + ngưỡng tối thiểu (KB-18) |

---

## 6. Phòng thủ xếp theo tỉ lệ lợi/chi phí

| # | Việc | Chặn | Cỡ | Cờ 1 | Cờ 2 |
|---|---|---|---|---|---|
| 1 | **Lớp không giải được chương trình vẫn TÍNH PHÍ**, chỉ không mở chi tiết | TC-02 | **S** | KHÔNG | KHÔNG |
| 2 | `R-QDC-01` phải **xoá override cấp cơ sở**, không chỉ đổi hằng `default` | TC-09 | **S** | KHÔNG | **CÓ** |
| 3 | Ngưỡng ẩn danh áp ở **mức đơn vị/kỳ**, không ở mức lớp; thêm chỉ số "số lớp dưới ngưỡng" | TC-04 | **S** | KHÔNG | **CÓ** |
| 4 | Đo **buổi vắng không được bù** thay cho đếm ca thủ công tự khai | TC-10 | M | KHÔNG | KHÔNG |
| 5 | Sửa định nghĩa doanh thu (trừ `REFUNDED`, xử lý `ADJUSTED`) **trước** bản đối soát đầu tiên | TC-05 | M | KHÔNG | KHÔNG |
| 6 | Gán **tên người** cho canary `R-D10-09` + thông báo lỗi tự giải thích | TC-06 | **S** | KHÔNG | KHÔNG |
| 7 | Cờ tắt của `R-D10-10` **chỉ người ký `R-D4-09` được mở** | TC-07 | **S** | KHÔNG | KHÔNG |
| 8 | Liệt kê + quyết từng **đường vòng** của học bù trước khi đóng A3 | TC-11 | **S** | KHÔNG | KHÔNG |
| 9 | Tách *"thiếu cấu hình"* khỏi *"lỗi đọc"* trong `R-QDC-02` | TC-12 | **S** | KHÔNG | KHÔNG |
| 10 | Bắt buộc `curriculumId` khi tạo lớp **trong đơn vị FRANCHISEE** | TC-02 | S | KHÔNG | KHÔNG |
| 11 | Sửa số dòng đã trôi trong QĐ-C (`registry.ts:484-490`, `service.ts:108`) | TC-09 | **S** | KHÔNG | KHÔNG |
| 12 | Đổi căn cứ tính phí sang **số học viên × đơn giá** (cần Ban chốt **c6**) | TC-01 | M | KHÔNG | KHÔNG |

`[SĐ]` Bảy việc cỡ **S** đầu tiên (1, 2, 3, 6, 7, 9, 11) cộng lại nhỏ hơn một yêu cầu cỡ M, và chặn được **hai tuyến VÔ HIỆU HOÁ** cùng ba tuyến NẶNG. **TC-01 không có phòng thủ kỹ thuật** — chỉ có quyết định thương mại.

---

## 7. Cái red-team này KHÔNG kết luận được

1. **Không đo được xác suất đối thủ ra tay.** Đ1 là **giả định về hành vi con người trong hợp đồng chưa ký**. Red-team chỉ chứng minh nước đi **tồn tại và rẻ**, không chứng minh sẽ xảy ra.
2. **Chưa có hợp đồng nhượng quyền thật để đọc.** Mọi phát biểu về *"hợp đồng cho phép gì"* là `[SĐ]`. **c8** (phí sàn/bậc thang), **c9** (một hợp đồng phủ mấy cơ sở), **c13** (điều khoản nào máy kiểm được) đều chưa trả lời.
3. **Không đánh D8, D9 trực diện** — ngoài phạm vi BƯỚC 6 (chỉ D10 và D7), dù TC-03 và TC-05 chạm rìa D9.
4. **Chưa chạy `R-QDC-05`** ⇒ không biết hiện có bao nhiêu ca bù chéo đang mở. Mọi phát biểu về độ lớn của TC-10 là `[SĐ]`.
5. **Chưa chạy `GD-06`** ⇒ không biết **sàn nhiễu** của lệch doanh thu ở CS1/CS2, nên chưa đặt được ngưỡng cho phòng thủ số 12.
6. **Không xét đối thủ "cơ quan quản lý"** — thanh tra, thuế, kiểm toán độc lập. `[SĐ]` Đây là đối thủ có thể mạnh hơn cả Đ1 nhưng cần đầu vào pháp lý mà §9 câu 8 chưa trả lời.

---

## 8. Mâu thuẫn phải báo lên — KHÔNG tự hoà giải

**M5 — `R-D10-13` fail-closed đi ngược mục tiêu của chính D10.** `[QS]` `02-prd:293` và `:303` chốt *"không giải được chương trình → false (fail-closed)"*. Hướng an toàn của **D4** (không chắc thì đừng cho xem) là hướng **nguy hiểm** của **D10** (không chắc thì HO mất quyền giám sát), và bên bị giám sát **điều khiển được** điều kiện kích hoạt (bỏ trống `Class.curriculumId`, `prisma/schema.prisma:1311-1312`). Không tự sửa vì đây là **thay đổi ngữ nghĩa của một yêu cầu đã chốt**, không phải sửa cách thi hành.
**Cần ai:** Ban giám đốc (chủ D10) + Đội Đào tạo HO. **Chặn:** `R-D10-03`, `R-D10-12`, `R-D10-13`.

**M6 — `R-QDC-01` nghiệm thu không phủ cơ sở đã cấu hình.** `[QS]` Nghiệm thu ghi *"**Cơ sở chưa cấu hình gì** → không liệt kê buổi của cơ sở khác"* (`02-prd:311`), trong khi `centerOverridable: true` (`lib/settings/registry.ts:490`) cho phép override cấp cơ sở tồn tại độc lập với `default`. Tiêu chí hiện tại **xanh được** trong khi mục tiêu của QĐ-C **chưa đạt**.
**Cần ai:** Kiệt + Luân (kỹ thuật) — nhưng phải sửa **tiêu chí nghiệm thu**, không phải sửa cách đọc tiêu chí.

**M7 — số dòng trong QĐ-C đã trôi khỏi mã.** `[QS]` `QUYET-DINH.md:71` → thực tế `lib/settings/registry.ts:484-490`; `:72` → thực tế `lib/makeup/service.ts:108`. Sổ quyết định là *"nguồn đúng nhất"* (`QUYET-DINH.md:3`) nên **không tự sửa**.
**Cần ai:** người giữ sổ quyết định.

*(M1–M4 ở `05-premortem.md` §10 vẫn còn nguyên, chưa mục nào được đóng.)*

---

## 9. Truy vết

| Tuyến | Đánh vào | Mã `R-*` bị ảnh hưởng | Làn |
|---|---|---|---|
| **TC-01** | D10 mệnh đề 1 | `R-D9-09` · `R-D10-04` · `R-D10-12` · `R-OPS-03` | B5 |
| **TC-02** | D10 mệnh đề 2 | `R-D10-02/03/13` · `R-D8-01` | A2 + B5 |
| **TC-03** | D10 mệnh đề 3 (vòng ngoài) | `R-D10-11/12` · §9 câu 2 | B5 |
| **TC-04** | D10 vế tổng hợp | `R-D10-05` | B5 |
| **TC-05** | D10 qua đường kế toán | `R-OPS-03` · `R-OPS-05` · `R-D10-08` | **chốt chặn B5** |
| **TC-06** | D10 vế cấm | `R-D10-09` | không pha rõ |
| **TC-07** | D10 chốt chặn | `R-D10-10` · `R-D4-09` | B5 |
| **TC-08** | D10 chiều HO | `R-D4-09` · `R-D10-10` | B5 |
| **TC-09** | D7 điểm (1) | `R-QDC-01` | A3 |
| **TC-10** | D7 phép đo | `R-QDC-04/05` | A3 |
| **TC-11** | D7 đường vòng | *(chưa mã nào phủ)* | A3 |
| **TC-12** | D7 điểm (2) | `R-QDC-02` | A3 |
| **TC-13** | D7 điểm (3) | `R-QDC-03` | A3 |

**Tổng: 13 tuyến tấn công** — 8 đánh D10, 5 đánh D7.

- **3 tuyến đạt mức VÔ HIỆU HOÁ:** TC-01 (D10 mất tác dụng), TC-10 (phần đo lường của D7 mất tác dụng), TC-13 (điểm (3) của QĐ-C bị đảo ngược). Hai trong ba — **TC-01 và TC-10 — không phải lỗ hổng kỹ thuật**; chúng là **giới hạn cấu trúc của cách đo**, nên không vá được bằng code (xem §5).
- **10/13 tuyến có chi phí với kẻ tấn công là KHÔNG** (chỉ 3 tuyến cần một thao tác nhập liệu: TC-03, TC-04, TC-11). Nói cách khác: **phần lớn cách đánh bại D10 và D7 không đòi hỏi ai làm gì — chỉ đòi hỏi không ai làm gì.** Đây là kết luận đáng lo nhất của vòng này, vì nó nghĩa là chiến lược đang dựa vào **sự chủ động liên tục**, mà chủ động thì hao mòn theo thời gian (Đ5).
- **Khả năng phát hiện:** 3 tuyến bên phòng thủ **KHÔNG thấy được** (TC-01, TC-08, TC-10) · 2 tuyến chỉ thấy khi đã muộn (TC-05, TC-11) · 8 tuyến còn lại **có phép đo bắt được sớm**.

*(Ba phép đếm trên đã chạy lại trên chính các khối §3–§4.)*

**Kiểm chứng.** Mọi `đường-dẫn:số-dòng` đã mở lại bằng Read/Grep trước khi viết. Bốn trích dẫn mới của vòng này, tự kiểm hôm nay: (a) `lib/makeup/service.ts:79-84` — 6 tiêu chí gợi ý bù, tiêu chí (6) là *"LIÊN CƠ SỞ (qua exception whitelist)"*; (b) `lib/makeup/service.ts:108` — `.catch(() => true)` (fail-OPEN), **không phải `:104`** như QĐ-C ghi; (c) `lib/settings/registry.ts:484-490` — `default: true`, **`centerOverridable: true`**, không phải `:457-464`; (d) `prisma/schema.prisma:1311-1312` — `curriculumId String?` kèm chú thích *"null = lớp cũ, helper fallback"*.

---

Bước này không sửa bất kỳ file nào khác ngoài E:/satarobo-vn/docs/taicautruc/06-redteam.md.
