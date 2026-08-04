# BƯỚC 3 — Job stories: 6 tình huống dễ sai nhất của nền tảng tổ chức + phân quyền + nhượng quyền

> **Phạm vi:** đúng phạm vi QĐ-D — nền tảng cây tổ chức (D2), ba trục nhân sự và ba mô hình quyền (D3, D4, QĐ-B), danh mục ba mức và khuôn mẫu đơn vị (D6), nội dung chương trình dạy (D8), nhượng quyền và phạm vi tài chính (D9, D10), học bù nội bộ cơ sở (QĐ-C), dữ liệu cá nhân khi hai pháp nhân dùng chung một cơ sở dữ liệu (nhóm DP), vận hành chuyển đổi (nhóm OPS). **Ngoài phạm vi:** D12, D11, nhóm người dùng, cây báo cáo theo quản lý trực tiếp.
>
> **Ngày:** 28/07/2026.
>
> **Nguồn:** đo hiện trạng repo ở BƯỚC 0 (`00-baseline.md`, `00-scope-gap.md`, `00-dryrun.md`), đối chiếu ý định với mã nguồn ở BƯỚC 1 (`01-intended-vs-implemented.md`), yêu cầu và 15 câu hỏi chưa chốt ở BƯỚC 2 (`02-prd-franchise-platform.md`), và sổ quyết định `QUYET-DINH.md`. Mọi trích dẫn dạng `đường-dẫn:số-dòng` giữ nguyên từ nguồn đã soạn.
>
> **Thứ tự ưu tiên:** khi tài liệu này mâu thuẫn với `QUYET-DINH.md` thì **`QUYET-DINH.md` thắng**.

---

## Cách đọc tài liệu này

Một **job story** viết theo khuôn *"Khi \<tình huống xảy ra\>, tôi muốn \<làm được việc gì\>, để tôi có thể \<đạt kết quả gì\>"*. Khuôn này bắt người viết mô tả **tình huống công việc thật** trước, rồi mới tới chức năng — nên khó giấu giả định và khó viết ra một tính năng không ai cần.

Chọn định dạng này vì phần lớn rủi ro của chương trình tái cấu trúc **không nằm ở chỗ thiếu chức năng**, mà nằm ở chỗ chức năng chạy đúng kỹ thuật nhưng sai bản chất nghiệp vụ: quyền vẫn sống sau khi cắt hợp đồng, phí tính ra số đẹp nhưng sai chủ thể, cơ sở lưu thành công nhưng thiếu mã. Mỗi story vì vậy có kèm **tiêu chí nghiệm thu**, trong đó bắt buộc có **tiêu chí âm tính** — điều hệ thống phải TỪ CHỐI làm, kiểm bằng cách gọi thẳng vào máy chủ chứ không chỉ nhìn giao diện.

**Ba quy ước đọc:**

- **Mã story trùng nhau giữa các tình huống.** Sáu vòng soạn chạy độc lập nên `JS-01` xuất hiện ở tình huống 1, 3 và 5. Tài liệu này **không đổi mã đã đặt**; để tham chiếu duy nhất, dùng cặp **«tình huống · mã»**, ví dụ `TH5 · JS-01`. ⚠️ **Kiến nghị cho BƯỚC 4:** khi giao việc và theo dõi tiến độ, mã trùng gần như chắc chắn sinh nhầm lẫn — nên **đánh lại mã duy nhất theo tình huống** (`TH1-01`, `TH3-02`…) và giữ một bảng ánh xạ mã cũ → mã mới ở đầu tài liệu. Việc đánh lại mã **cố ý chưa làm ở đây** vì nó chạm cả 26 story và toàn bộ bảng truy vết, cần một lần rà có kiểm soát.
- **Ký hiệu tiêu chí chưa thống nhất.** Sáu vòng soạn độc lập để lại **năm kiểu ghi** (`[DƯƠNG_TÍNH]`, `(DƯƠNG TÍNH)`, `(Dương tính)`, `(dương tính · mã)`, `**[Dương tính]**`). Nội dung không đổi nghĩa, nhưng tài liệu trông như ghép từ nhiều nguồn — BƯỚC 4 nên chuẩn hoá về **một** kiểu: `[DƯƠNG TÍNH]` / `[ÂM TÍNH]` / `[BIÊN]` đặt đầu dòng, mã truy vết đặt cuối dòng.
- **Dấu ⏸ nghĩa là ĐANG TREO** một câu hỏi chưa được Ban trả lời: tiêu chí mang dấu này **không được ký PASS** cho tới khi có câu trả lời. Dấu này thêm ở vòng vá 28/07 (xem "Nhật ký vá lỗi" ngay dưới).
- **Mục "Chặn bởi"** ghi câu hỏi nào của `02-prd-franchise-platform.md` §9 đang treo tiêu chí đó. Story có mục này nghĩa là **chưa nghiệm thu trọn vẹn được** cho tới khi Ban trả lời.
- **Mục "Ghi chú kiểm chứng"** ở cuối mỗi tình huống là kết quả vòng rà soát độc lập, giữ nguyên văn — gồm cả những chỗ nó chỉ ra story viết sai. Đây là phần cần đọc kỹ nhất trước khi giao việc.

---

## Nhật ký vá lỗi — vòng rà 28/07/2026

Hai vòng rà độc lập chạy sau khi tài liệu soạn xong đã tìm ra một số chỗ **viết sai bản chất nghiệp vụ** chứ không phải sai chính tả. Các chỗ đó **đã được vá vào chính thân tiêu chí** (không chỉ ghi chú ở cuối tình huống, vì tài liệu giao đi thì người nhận việc đọc tiêu chí chứ ít ai đọc ghi chú). Mỗi chỗ vá đều có dấu `[đã sửa 28/07: …]` ngay tại chỗ để đối chiếu được với bản trước.

**Bốn lỗi mức CHẶN đã vá:**

| Chỗ | Bản trước viết sai gì | Hậu quả nếu giao đi nguyên trạng |
|---|---|---|
| TH1 · JS-02 (và ghi chú tình huống 1) | Nói `Class.curriculumId` có khoá ngoại `onDelete: SetNull`, trích `schema.prisma:2226` | Trích **sai đối tượng** (dòng đó là `Question`, không phải `Class`) và mô tả một cơ chế **không tồn tại**. Hỏng thật là **dữ liệu mồ côi** — khó phát hiện hơn ca "rỗng thẳng" mà bản trước tả |
| TH6 · JS-06-03 tiêu chí 2 | Cho bên NHẬN nhượng quyền đọc dữ liệu "thuộc đơn vị của **HO**" | **Đảo chiều nhượng quyền.** Đọc đúng câu chữ, chế độ chỉ đọc sau khi cắt hợp đồng sẽ **mở rộng** tầm nhìn của bên nhận — ngược hoàn toàn R-D9-06 |
| TH5 · JS-01 tiêu chí 1 và 3 | Đóng đinh **phí = phạm vi sở hữu chương trình** | R-D10-12 chốt ngược: phạm vi **tính phí** đi theo **hợp đồng**, chỉ phạm vi **xem chi tiết** mới đi theo sở hữu chương trình. Ký PASS theo bản cũ là **hợp thức hoá đúng đường mất tiền** mà chính story đang cảnh báo |
| Toàn bộ 26 story | Mọi tiêu chí âm tính về cách ly cơ sở chỉ viết cho **một** nhân vật: "tài khoản quản lý cơ sở" | Lỗ rò đã đo được nằm ở **các vai trò khác** (kinh doanh, kế toán, nhân sự, marketing, đào tạo) và ở **bốn bảng không có trường cơ sở** làm lộ SĐT/email phụ huynh giữa hai cơ sở. Đã bổ sung hai tiêu chí vào TH3 · JS-04 |

**Đã vá thêm ở mức NẶNG:** neo lại R-QDB-06 vào một tiêu chí âm tính mới cho cổng SCORM (trước đó bị gán nhầm cho tiêu chí ghi nhật ký, khiến việc vá SCORM **không ai nhận**) · viết lại hai tiêu chí đếm ca học bù thủ công của QĐ-C theo **cặp cơ sở** · bổ sung tiêu chí chuyển cha CS1/CS2 xuống VÙNG Đà Nẵng (bước duy nhất của QĐ-A chạm dữ liệu thật, trước đó không story nào nhận) · sửa căn cứ chọn giáo viên về **đồng thời vai trò giảng dạy VÀ phân công** · tách TH7 · JS-N2 làm phần A (làm ngay) và phần B (treo Câu 7) · bổ sung tiêu chí phạm vi **tạo tài khoản** · chỉ định story chủ cho hai chỗ trùng · thay bốn tiêu chí không đo được bằng mốc đo cụ thể.

**Ba câu hỏi mới sinh ra từ vòng vá này** — (b10), (b11) và b2 đã có con số đề nghị — nằm ở mục "Câu hỏi cần Ban xác nhận trước khi sang BƯỚC 4".

---

## Bảng tổng hợp story

26 story, chia 6 tình huống chính + 1 nhóm bổ sung từ vòng phản biện.

| ID | Tên ngắn | Ai làm | Quyết định liên quan | Hậu quả nếu làm sai |
|---|---|---|---|---|
| TH1 · JS-01 | Chương trình có chủ sở hữu, khoá đường sửa ngoài HO | Trưởng nhóm Đào tạo HO | QĐ-A.1 | Cơ sở tỉnh sửa được chương trình của HO |
| TH1 · JS-02 | Nâng cấp chương trình đang chạy bằng phiên bản mới | Chuyên viên Đào tạo HO | – | Lớp đang học bị đổi giáo án giữa khoá |
| TH1 · JS-03 | Giáo viên xem nội dung buổi đúng cửa sổ thời gian | Giáo viên được phân công lớp | QĐ-B | Cả bộ chương trình bị sao ra ngoài một lượt |
| TH2 · JS-02A | Lập đợt điều động GV có thời hạn, không đổi nơi biên chế | Nhân sự (HR) Hội sở | – | Mất nơi biên chế, hỏng lương và báo cáo |
| TH2 · JS-02B | Xếp GV đang điều động vào lớp cơ sở | Người xếp lớp / trợ lý đào tạo CS1 | – | Phải nhờ kỹ thuật sửa dữ liệu, hoặc mở rò cách ly cơ sở |
| TH2 · JS-02C | Hết đợt điều động thì quyền tự mất | Nhân sự HO / Trưởng CS1 | QĐ-D | Hết đợt mượn người mà quyền tại cơ sở vẫn còn |
| TH3 · JS-01 | Tạo khối vùng cho tỉnh mới ngay trên giao diện | Admin Hội sở | QĐ-A | Phải chờ một đợt phát hành phần mềm mới mở được tỉnh |
| TH3 · JS-02 | Lập cơ sở nhượng quyền kèm hồ sơ pháp nhân | Admin Hội sở | QĐ-A | Cơ sở ma, chứng từ sai pháp nhân, đâm mã học viên |
| TH3 · JS-03 | Hợp đồng nhượng quyền là công tắc duy nhất bật/tắt quyền | Admin Hội sở + kế toán HO | QĐ-B, QĐ-D | Cắt hợp đồng rồi mà quyền vẫn sống |
| TH3 · JS-04 | Cơ sở mới chạy được ngày đầu: mã, phòng ban, danh mục, cách ly | Admin HO + quản lý cơ sở mới | QĐ-A, QĐ-A.1 | Hỏng chỉ lộ ra ở học viên đầu tiên, lúc đó vá rất tốn |
| TH4 · JS-04-01 | Thấy tiến độ chương trình của lớp, không đọc được nội dung | Quản lý cơ sở | QĐ-A.1 | Lộ nội dung chương trình qua dữ liệu lồng |
| TH4 · JS-04-02 | Kiểm buổi đủ tài liệu bằng danh mục, không mở tệp | Quản lý cơ sở | – | Link tài liệu cũ tải được vĩnh viễn, kể cả sau khi cắt hợp đồng |
| TH4 · JS-04-03 | Bù giáo viên cho buổi mà không tự biến mình thành giáo viên | Quản lý cơ sở | QĐ-B | Quản lý tự gán mình làm GV để mở toàn bộ học liệu HO |
| TH5 · JS-01 | Bảng căn cứ tính phí thương hiệu một kỳ tháng | Kế toán tổng hợp HO | QĐ-A.1 | Số phí sai bản chất trong khi bảng vẫn chạy đúng |
| TH5 · JS-02 | Nhãn trong/ngoài phạm vi kèm lý do, chặn thật ở đường API | Kế toán tổng hợp / trưởng bộ phận HO | QĐ-A.1 | Không bảo vệ được con số khi bên nhận phản đối |
| TH5 · JS-03 | Bản sao chương trình luôn khai được nguồn gốc | Đào tạo HO hoặc kế toán tổng hợp HO | QĐ-A.1 | Rửa quyền sở hữu chương trình, phí về gần 0 |
| TH6 · JS-06-01 | Hợp đồng qua ngày hết hạn thì quyền tự rụng | Vận hành hệ thống HO | QĐ-B, QĐ-D | Cơ sở hết hợp đồng vẫn ghi được dữ liệu |
| TH6 · JS-06-02 | Chấm dứt hợp đồng trước hạn bằng một thao tác có lý do | Phụ trách hợp đồng nhượng quyền HO | QĐ-D | Cắt nửa chừng, sót tài khoản còn quyền ghi |
| TH6 · JS-06-03 | Chế độ chỉ đọc sau khi cắt: đọc dữ liệu của mình, không ghi | Quản lý / kế toán cơ sở nhận nhượng quyền | QĐ-B | Chế độ chỉ đọc thủng, vẫn ghi được dữ liệu |
| TH6 · JS-06-04 | Gói bàn giao trước ngày khoá hẳn | Kế toán / đại diện pháp nhân bên nhận | – | Bên nhận mất chứng từ kế toán buộc phải lưu |
| TH7 · JS-N1 | Buổi bù xếp trong đúng cơ sở, ba lớp chặn cùng đồng ý | Giáo vụ / quản lý cơ sở | QĐ-C | Vỡ điểm danh và vỡ số liệu của cả hai cơ sở |
| TH7 · JS-N2 | Chuyển học viên qua pháp nhân khác đi đường bàn giao | Giáo vụ cơ sở + quản lý cơ sở nhận | – | Tiền và hồ sơ nằm rải ở hai pháp nhân |
| TH7 · JS-N3 | Trả lời yêu cầu xoá dữ liệu trong hạn, không xoá nhầm chứng từ | Phụ trách dữ liệu tại cơ sở + phụ huynh | – | Đã xoá trên màn hình nhưng ảnh vẫn tải được bằng link cũ |
| TH7 · JS-N4 | Chuyển hai cơ sở và 23 tài khoản thật sang mô hình mới | Vận hành hệ thống + người nghiệp vụ nghiệm thu | QĐ-A | Sáng hôm sau có người mất quyền, có lớp mất dữ liệu |
| TH7 · JS-N5 | Trả lời trong vài phút vì sao một người không vào được | Phụ trách phân quyền HO (SUPER_ADMIN) | QĐ-B | Cấp thêm quyền cho xong việc, mở rộng quyền ngoài ý muốn |
| TH7 · JS-N6 | Phiếu thu mang đúng pháp nhân, đúng dải số, đúng mức thu | Kế toán cơ sở nhận nhượng quyền | – | Chứng từ sai chủ thể, sai mức thu, phải sửa tay từng tờ |

**Cách suy ra cột "Quyết định liên quan":** đối chiếu nội dung story với `QUYET-DINH.md`. Dấu gạch nghĩa là **không có quyết định nào trong sổ chạm tới story đó** — không phải là chưa tra. Cụ thể: QĐ-A gắn với story đụng hình dạng cây (`REGION` ngang hàng HO); QĐ-A.1 gắn với story đụng phạm vi xem chi tiết của HO (`isHoLevel` cấp `ALL`); QĐ-B gắn với story đụng DENY hoặc đụng cổng SCORM đang chạy `can()` v2 thẳng; QĐ-C gắn với học bù; QĐ-D gắn với story dựa vào cơ chế `derivedFrom` cắt quyền theo chùm — lý do QĐ-D loại "nhóm người dùng" khỏi phạm vi.

> ⚠️ **Chưa nhất quán, cần thống nhất trước khi dùng cột này để giao việc (rà 28/07):** `TH1 · JS-01` và `TH5 · JS-03` đang gắn **QĐ-A.1** nhưng **không story nào trong hai story đó đụng `isHoLevel`** — chúng nói về quyền sở hữu và quyền sửa chương trình. Cách đọc bảo vệ được cho cách gắn hiện tại là "R-D8-01 (chủ sở hữu chương trình) là điều kiện mở khoá D10, nơi QĐ-A.1 có hiệu lực" — nhưng đó **không phải** quy tắc đã công bố ở đoạn trên. BƯỚC 4 phải chọn **một** cách đọc: hoặc giữ nguyên và sửa lại quy tắc, hoặc để dấu gạch cho hai story này và tách một cột riêng cho mã yêu cầu (D8/D10). Tài liệu này **không tự quyết** vì cả hai cách đều đổi nghĩa của cột.

---

## Tình huống 1 — Sở hữu và phát hành chương trình đào tạo trong mạng lưới nhượng quyền

Tình huống này dễ sai ở chỗ chương trình đào tạo hiện không có chủ sở hữu, quyền sửa lại là ma trận vai trò toàn cục nên bất kỳ ai mang vai trò Đào tạo ở bất kỳ đơn vị nào cũng chạm được vào chương trình của Hội sở. Sai thứ hai là nội dung buổi và học liệu mở rộng hơn mức cần thiết: giáo viên không có cửa sổ thời gian, tài liệu còn đi bằng đường liên kết trần, và lớp có thể âm thầm mất bản chương trình đã ghim.

### TH1 · JS-01 · Chương trình mới ra tới toàn mạng lưới mà quyền sửa vẫn nằm ở HO

**Bối cảnh người dùng:** Trưởng nhóm Đào tạo HO, tài khoản mang vai trò TRAINING gắn tại node HO. Cuối tháng, chuẩn bị khai giảng đồng loạt, phải phát khung chương trình cho các cơ sở trực thuộc và ít nhất một cơ sở nhượng quyền ở tỉnh khác.

**Job story:** Khi tôi vừa soạn xong khung chương trình Sata 5 bản mới và sắp bấm xuất bản xuống cả cơ sở Đà Nẵng lẫn cơ sở nhượng quyền Hà Nội, tôi muốn hệ thống ghi rõ chương trình này thuộc sở hữu của HO và khoá đường sửa của mọi đơn vị khác ngay từ lúc xuất bản, để tôi có thể phát nội dung đi mà không phải canh thủ công xem ai đó ở tỉnh có sửa mất hay không.

**Vì sao dễ sai:** Hiện Curriculum không có bất kỳ trường sở hữu nào và quyền sửa là ma trận role toàn cục ([SUPER_ADMIN, TRAINING] tại lib/auth/permissions.ts:466-468) — nên bất kỳ ai mang vai trò TRAINING ở BẤT KỲ node nào cũng sửa được chương trình của HO. Thêm nữa curriculums/_actions.ts:34 ghi rõ scopedDb là pass-through cho Curriculum, nên hạ tầng cách ly cơ sở hiện có KHÔNG che đường này.

**Tiêu chí nghiệm thu:**

- [ ] [DƯƠNG_TÍNH] Khi mở màn soạn chương trình, ô đơn vị sở hữu đã điền sẵn đơn vị HO của người tạo và không nhập tay node khác được; bản ghi lưu xuống có Curriculum.ownerOrgUnitId khác null, kiểm bằng truy vấn 1 dòng. (R-D8-01, R-D6-03)
- [ ] [DƯƠNG_TÍNH] Trước khi bấm xuất bản, màn hình hiện danh sách đơn vị sẽ nhận, tách rõ số cơ sở trực thuộc và số cơ sở có relationshipType = FRANCHISEE; sau khi bấm, nhật ký ghi ai xuất bản, lúc nào, lý do, và danh sách đơn vị nhận tại thời điểm đó. (R-D8-02, R-D2-12, R-D9-03)
- [ ] [DƯƠNG_TÍNH] Sau xuất bản, mọi đơn vị trong cây (kể cả FRANCHISEE) chọn được chương trình này khi tạo lớp, nhưng người không phải giáo viên của lớp chỉ thấy TÊN chương trình trong danh sách, ô nội dung buổi hiển thị trạng thái khoá. (R-D8-09, R-D8-03)
- [ ] [ÂM_TÍNH] Tài khoản mang vai trò TRAINING gắn tại node FRANCHISEE gọi sửa / xoá / đổi trạng thái chương trình có ownerOrgUnitId = HO thì bị TỪ CHỐI; thông báo lỗi nêu lý do phạm vi sở hữu (không phải lỗi thiếu vai trò), và audit ghi actor, node vai trò, ownerOrgUnitId của bản ghi. (R-D8-02, R-D8-03, R-D4-01, R-QDB-08)
- [ ] [ÂM_TÍNH] Người mang vai trò quản lý cơ sở dán thẳng link tới nội dung buổi hoặc tới tệp tài liệu của chương trình thì bị chặn ở cả hai cửa: màn /admin/documents không render link R2 trần nữa, mọi tệp đi qua vé có hạn; kiểm bằng cách copy link cũ ra trình duyệt ẩn danh phải hỏng. (R-D8-08, R-D8-09)
- [ ] [BIÊN] Chương trình cũ chưa gán đơn vị sở hữu thì hàm quyết định phạm vi trả kết quả fail-closed: chặn sửa, hiện cảnh báo "chưa gán chủ sở hữu", và có báo cáo tồn đọng đếm chính xác số bản ghi còn thiếu; **tại ngày nghiệm thu, báo cáo in ra một con số tuyệt đối và một mốc ngày mà con số đó phải về 0, do Đào tạo cam kết bằng văn bản**. (R-D10-13, R-D10-08, R-D8-01) `[đã sửa 28/07: "con số này giảm dần theo tiến độ nạp dữ liệu" không đo được tại một thời điểm nghiệm thu]`
- [ ] [BIÊN] Khi một vùng xin bản sao chương trình HO để tuỳ biến, bản sao lưu cả nguồn gốc (chương trình gốc + đơn vị sở hữu gốc) và đơn vị sở hữu mới; bản sao KHÔNG âm thầm trở thành sở hữu của người bấm sao chép, và bản gốc không đổi. (R-D10-11, R-D8-01)
- [ ] [DƯƠNG_TÍNH] Mở thêm một vùng mới và một cơ sở nhượng quyền mới hoàn toàn bằng nhập liệu (không sửa dòng code nào), rồi xuất bản lại chương trình: đơn vị mới tự có mặt trong danh sách nhận và đội Đào tạo đơn vị đó nhận được thông báo; danh sách đã nhận / chưa nhận xem được trên màn hình. (R-D2-24, R-D6-13, R-D8-02)

**Truy vết:** R-D8-01, R-D8-02, R-D8-03, R-D8-08, R-D8-09, R-D6-03, R-D6-13, R-D2-12, R-D2-24, R-D4-01, R-D9-03, R-D10-08, R-D10-11, R-D10-13, R-QDB-08

**Chặn bởi:** Câu 2 — chưa chốt FRANCHISEE có được tự soạn chương trình riêng hay không và nếu có thì tính phí nhượng quyền thế nào. Vì vậy chưa viết được tiêu chí cho luồng "FRANCHISEE tạo chương trình mang ownerOrgUnitId của chính họ" và cho cách hệ thống phân biệt lớp dùng chương trình HO với lớp dùng chương trình riêng khi tính phí.

### TH1 · JS-02 · Nâng cấp chương trình đang chạy mà không lớp nào bị đổi giáo án giữa chừng

**Bối cảnh người dùng:** Chuyên viên Đào tạo HO, giữa học kỳ, nhận phản hồi buổi 4 quá tải nên phải chỉnh. Chương trình đang được các lớp ở CS1, CS2 và cơ sở nhượng quyền Hà Nội sử dụng, mỗi lớp đã pin bản chương trình từ lúc tạo lớp (Class.curriculumId).

**Job story:** Khi tôi phải sửa nội dung buổi 4 của một chương trình đang có mấy chục lớp dạy dở ở nhiều cơ sở, tôi muốn thay đổi của tôi ra thành một phiên bản mới thay vì đè lên bản các lớp đang dùng, để tôi có thể cải tiến nội dung mà giáo viên không bị đổi giáo án giữa khoá và phụ huynh không thấy chương trình khác đi so với lúc đăng ký.

**Vì sao dễ sai:** `Class.curriculumId` (prisma/schema.prisma:1309) là một trường số THƯỜNG, **không có khoá ngoại tới `Curriculum`** — chú thích ngay trên nó (:1308) khai rõ đây là bản chụp lúc tạo lớp ("pin curriculum version lúc tạo lớp (snapshot)"). Toàn schema chỉ có ĐÚNG ba quan hệ trỏ về `Curriculum`: `Lesson` (:2126), `Question` (:2226) và `AssignmentTemplate` (:2532); `Class` không nằm trong số đó. Vì vậy hệ thống **không có bất kỳ ràng buộc toàn vẹn nào** bảo vệ ô ghim: xoá chương trình sẽ để lại một mã trỏ vào khoảng không (dữ liệu mồ côi) — lớp vẫn "có" mã chương trình nhưng tra ra rỗng — và không có cơ chế nào báo cho người dùng biết. Đồng thời Curriculum.version đang unique theo [courseId, version] (:2087 trường phiên bản, :2103 ràng buộc duy nhất) chứ không phải chuỗi phiên bản của một chương trình, nên "tạo phiên bản mới" hiện thực chất là tạo một Curriculum khác, không có đường truy về bản gốc.

**Tiêu chí nghiệm thu:**

- [ ] [DƯƠNG_TÍNH] Khi mở chương trình đang ACTIVE, màn hình hiện số lớp đang dùng, tách theo đơn vị (bao nhiêu lớp ở HO / từng vùng / từng cơ sở nhượng quyền), trước khi bất kỳ nút sửa nào bật lên. (R-D10-02, R-D8-02)
- [ ] [DƯƠNG_TÍNH] Lưu thay đổi nội dung buổi trên chương trình đang chạy tạo ra phiên bản mới và giữ nguyên phiên bản cũ; mở lại một lớp đang chạy phải thấy đúng nội dung cũ, so từng trường (tiêu đề, mục tiêu, giáo án, học liệu) không có sai khác. (R-D10-02, R-D10-11)
- [ ] [DƯƠNG_TÍNH] Mỗi lần tạo phiên bản mới bắt buộc nhập lý do; nhật ký ghi trường nào đổi, phiên bản trước và sau, người thực hiện, thời điểm — đọc được trên màn hình mà không cần vào DB. (R-D8-02, R-D2-03, R-QDB-08)
- [ ] [ÂM_TÍNH] Người mang vai trò TRAINING tại node FRANCHISEE bấm "tạo phiên bản mới" trên chương trình của HO thì bị từ chối; hệ thống chuyển họ sang đường gửi yêu cầu thay đổi, và yêu cầu đó ở trạng thái chờ, KHÔNG tự áp dụng vào chương trình. (R-D8-03, R-D8-02)
- [ ] [BIÊN] Hàm giải chương trình của lớp trả fail-closed cho **cả ba ca**: curriculumId rỗng · chương trình đã archive · **curriculumId trỏ tới một bản ghi không còn tồn tại** (ca mồ côi — xảy ra được vì không có khoá ngoại, xem mục "Vì sao dễ sai"). Fail-closed nghĩa là: không suy ngược từ courseId, lớp bị đưa vào báo cáo tồn đọng và không lọt vào phạm vi xem chi tiết tài chính của FRANCHISOR. (R-D10-13, R-D10-02, R-D10-08)
- [ ] [BIÊN] Buổi đang ở trạng thái khoá hoặc đang được lớp sử dụng thì chặn sửa tại chỗ và chỉ cho tạo phiên bản mới; thông báo nêu đúng số lớp đang dùng buổi đó, số này khớp với danh sách lớp mở ra được. (R-D8-02, R-D10-02)
- [ ] [DƯƠNG_TÍNH] Lớp tạo MỚI sau thời điểm xuất bản tự pin phiên bản mới nhất; màn tạo lớp hiển thị rõ đang pin bản nào và ngày xuất bản của bản đó, và giá trị pin lưu xuống khớp với thứ hiển thị. (R-D10-02, R-D8-14)
- [ ] [BIÊN] Có một thao tác thu hồi phiên bản vừa xuất bản; sau khi thu hồi, lớp mới không chọn được bản đó nữa, còn lớp đã lỡ pin bản đó vẫn mở được giáo án và xuất hiện trong danh sách cần xử lý — không lớp nào bị trắng giáo án. (R-OPS-04, R-D8-02, R-D10-13)

**Truy vết:** R-D8-02, R-D8-03, R-D8-14, R-D2-03, R-D10-02, R-D10-08, R-D10-11, R-D10-13, R-OPS-04, R-QDB-08

**Chặn bởi:** Câu 13 — chưa chốt điều khoản hợp đồng nhượng quyền nào phải kiểm được bằng máy. Vì vậy chưa viết được tiêu chí cho tình huống xuất bản phiên bản mới xuống một FRANCHISEE có hợp đồng sắp hết hạn hoặc đang tạm ngưng: chưa rõ hệ thống phải chặn phát hành, phát hành có cảnh báo, hay vẫn phát hành bình thường.

### TH1 · JS-03 · Giáo viên chỉ thấy nội dung buổi đúng lúc cần dạy, và mọi lượt xem đều truy được

**Bối cảnh người dùng:** Giáo viên đang được phân công một lớp cụ thể ở CS2; có giáo viên biên chế HO được điều sang dạy lớp cơ sở. Bối cảnh: chương trình thuộc sở hữu HO, cùng nội dung đó cũng chạy ở cơ sở nhượng quyền tỉnh khác.

**Job story:** Khi lịch dạy sắp tới buổi của tôi và tôi cần xem trước giáo án cùng học liệu, tôi muốn nội dung buổi đó mở ra đúng khoảng thời gian quanh buổi dạy chứ không mở cả chương trình từ đầu khoá, để tôi có thể chuẩn bị bài mà công ty không lo cả bộ chương trình bị copy ra ngoài một lượt.

**Vì sao dễ sai:** Cửa sổ mở khoá là khái niệm chưa tồn tại (toàn schema chỉ có openAt trên Exam, prisma/schema.prisma:2318), còn điều kiện "buổi thuộc chương trình của lớp" hiện không được kiểm trên đường chính vì packageId và sessionId là hai tham số độc lập do client cấp; thêm nữa lib/teachers/center-filter.ts:32-43 ép User.centerId === class.centerId nên giáo viên biên chế HO bị chặn oan.

**Tiêu chí nghiệm thu:**

- [ ] [DƯƠNG_TÍNH] Mỗi buổi có cửa sổ mở khoá (mở trước buổi bao lâu, đóng sau buổi bao lâu) kế thừa từ cấu hình cấp chương trình và ghi đè được ở cấp lớp; màn cấu hình hiện rõ giá trị đang áp dụng đến từ cấp nào. (R-D8-07, R-D6-05, R-D6-07)
- [ ] [DƯƠNG_TÍNH] Giáo viên mở nội dung buổi trong cửa sổ thì thấy giáo án và học liệu; quyết định cho/không cho đi qua MỘT hàm thuần kiểm đủ 4 điều kiện (còn giữ vai trò giáo viên, được thêm vào đúng lớp đó, buổi thuộc chương trình lớp đang dùng, thời điểm nằm trong cửa sổ), nhận thời điểm hiện tại làm tham số nên chạy được bằng test. (R-D8-04, R-D8-05, R-D8-06, R-D8-07, R-D3-09)
- [ ] [ÂM_TÍNH] Giáo viên đã bị gỡ khỏi lớp, hết phân công hoặc nghỉ việc mở lại đường link cũ thì bị từ chối ngay ở lần bấm kế tiếp, kể cả khi phiên đăng nhập vẫn còn hạn. (R-D8-04, R-D3-12, R-D3-07, R-D9-05b)
- [ ] [ÂM_TÍNH] Gọi đường lấy học liệu với mã gói của chương trình A kèm mã buổi của lớp dùng chương trình B thì bị từ chối; không còn nhánh dự phòng nới quyền sang "bất kỳ lớp nào cùng courseId / curriculumId", và test dựng đúng cặp tham số lệch này phải đỏ nếu nhánh dự phòng quay lại. (R-D8-06, R-D8-05, R-D8-14)
- [ ] [BIÊN] Buổi bị dời lịch thì cửa sổ tính lại theo ngày mới ngay, không cần thao tác tay; buổi đã dạy xong vẫn xem được đến khi hết hạn đóng sau, quá hạn thì khoá và hiện lý do "ngoài cửa sổ" chứ không phải lỗi chung chung. (R-D8-07, R-D8-14)
- [ ] [DƯƠNG_TÍNH] MỖI lượt xem được ghi log gồm ai, lớp nào, buổi nào, tài nguyên nào, thời điểm — không chỉ một dòng lúc mở trình phát; tài liệu tải qua proxy và tài nguyên con của gói SCORM đều xuất hiện trong log, đếm được số lượt của một giáo viên trong một ngày. (R-D8-11) `[đã sửa 28/07: gỡ R-QDB-06 khỏi tiêu chí ghi nhật ký — R-QDB-06 là mã VÁ CỔNG SCORM, việc hoàn toàn khác; nay neo vào tiêu chí âm tính ngay dưới đây]`
- [ ] [ÂM_TÍNH] **Cổng SCORM phải tôn trọng lệnh cấm riêng:** người có quyền quản lý đào tạo nhưng bị **CẤM riêng (DENY)** mở gói SCORM thì bị TỪ CHỐI, ở **CẢ HAI trạng thái** của cờ `RBAC_V2_ENABLED`; và tài khoản đào tạo gắn tại đơn vị nhận nhượng quyền mở nội dung chương trình thuộc HO cũng bị từ chối. Lý do phải có tiêu chí riêng: cổng SCORM hiện chạy hệ quyền v2 thẳng, **bỏ qua cờ và bỏ qua DENY** (`QUYET-DINH.md:56` — QĐ-B hệ quả 5), nghĩa là **thu hồi quyền bằng DENY hiện không cắt được SCORM**. (R-QDB-06 — `02-prd-franchise-platform.md:246`)
- [ ] [DƯƠNG_TÍNH] Nội dung hiển thị mang dấu chìm tên giáo viên và mã buổi, và làm mờ khi rời tab — hành vi đã có phải giữ nguyên sau khi nối cửa sổ mở khoá, kiểm bằng chụp màn hình trước và sau thay đổi. (R-D8-12)
- [ ] [BIÊN] Giáo viên biên chế HO được phân công dạy lớp ở CS2 vẫn qua đủ 4 điều kiện và xem được nội dung buổi (không bị chặn bởi phép so sánh cơ sở); ngược lại giáo viên ở cơ sở khác KHÔNG được thêm vào lớp thì vẫn bị từ chối — hai trường hợp này nằm trong cùng một bộ test. (R-D3-10, R-D3-09, R-D8-04, R-D8-14)

**Truy vết:** R-D8-04, R-D8-05, R-D8-06, R-D8-07, R-D8-11, R-D8-12, R-D8-14, R-D3-07, R-D3-09, R-D3-10, R-D3-12, R-D6-05, R-D6-07, R-D9-05b, R-QDB-06

**Chặn bởi:** Câu 10 — chưa chốt "mỗi lượt xem" là mỗi lượt mở gói hay mỗi tài nguyên con, nên tiêu chí ghi log đang viết ở mức yêu cầu cả hai; nếu Ban chốt mức gói thì phải sửa lại tiêu chí và bỏ phần đếm tài nguyên con. Ngoài 15 câu: BGĐ chưa chốt GIÁ TRỊ MẶC ĐỊNH của cửa sổ mở khoá (mở trước bao lâu, đóng sau bao lâu) — tiêu chí 1 và 5 chỉ mô tả cơ chế, không ghi con số, chờ Ban chốt mới nghiệm thu được.

> **Ghi chú kiểm chứng (tình huống 1):** Kết quả rà của bước soát lại — JS-03 dùng được sau khi vá nhẹ, JS-01 phải cắt phần bịa, JS-02 nên loại hoặc viết lại từ đầu. Ba lỗi lặp ở cả ba story: (1) gắn mã truy vết cho có — R-QDB-08 (lý do + audit khi CẤP quyền DENY) bị dùng cho "audit khi TỪ CHỐI thao tác", R-D2-03 (sửa/di chuyển ĐƠN VỊ) bị mượn cho "tạo phiên bản chương trình", R-D6-05/R-D6-07 (kế thừa cấu hình theo cây đơn vị) bị mượn cho kế thừa chương trình → lớp, R-D10-13 (lớp không giải được chương trình) bị mượn cho "chương trình thiếu chủ sở hữu" (đúng ra là R-D10-03); (2) bịa thêm hệ thống con không có mã yêu cầu — cơ chế "phát hành xuống đơn vị / danh sách đã nhận - chưa nhận / thông báo" ở JS-01 và "luồng gửi yêu cầu thay đổi", "thu hồi phiên bản" ở JS-02, trong khi mô hình dữ liệu hiện tại không có khái niệm "đơn vị nhận"; (3) thiếu mục chặn bởi ở chỗ đáng lẽ phải dừng — JS-01 thiếu Câu 13 (điều khoản hợp đồng nào kiểm được bằng máy), JS-03 khẳng định "nghỉ việc thì mất quyền" trong khi Câu 4 còn treo. Riêng JS-02 đòi thứ đã có sẵn: prisma/schema.prisma:2087 Curriculum.version + :2103 @@unique([courseId, version]) `[đính chính 28/07: ràng buộc duy nhất nằm ở :2103, không nằm ở :2087]`; :1308-1310 Class.curriculumId + curriculumVersion "pin curriculum version lúc tạo lớp"; :4878-4896 ClassSessionPlan sao từ Lesson của bản đã pin — tiêu chí 2 và 7 gần như chép lại R7-06 đang chạy. Bốn phát hiện nền cần Ban biết: Curriculum hoàn toàn không có trường sở hữu (schema.prisma:2082-2105) nên D8/D10 là xây mới chứ không phải siết quyền có sẵn; quyền sửa chương trình là ma trận toàn cục (lib/auth/permissions.ts:466-468 = [SUPER_ADMIN, TRAINING], không kèm phạm vi) nên tiêu chí âm tính của JS-01 đang FAIL trên hiện trạng; scopedDb không che đường này (curriculums/_actions.ts:34 pass-through); cửa sổ mở khoá chưa tồn tại (toàn schema chỉ có openAt ở Exam, schema.prisma:2318). Ngoài ra: CurriculumStatus đã có DRAFT/ACTIVE/ARCHIVED/UNPUBLISHED (:2107-2112) nên "xuất bản" mới chỉ là bật cờ toàn hệ thống, chưa có bên nhận; Class.curriculumId (:1309) **không có khoá ngoại tới Curriculum** nên giữa lớp và chương trình **không có ràng buộc toàn vẹn nào** — xoá chương trình để lại một mã mồ côi, tra ra rỗng mà hệ thống không báo; chưa mã R-* nào phủ `[đính chính 28/07: bản trước ghi ":2225-2226 onDelete SetNull có thể làm lớp mất bản pin âm thầm" — SAI ĐỐI TƯỢNG. Dòng 2225-2226 là Question.curriculumId (model Question bắt đầu ở :2212), không phải Class. Toàn schema chỉ có 3 quan hệ trỏ về Curriculum: Lesson :2126 (Cascade), Question :2226 (SetNull), AssignmentTemplate :2532 (SetNull) — Class không có quan hệ nào. Hỏng thật là dữ liệu mồ côi, KHÓ phát hiện hơn ca "rỗng thẳng" mà bản trước mô tả]`; Lesson đã có trạng thái LOCKED/IN_USE/NEEDS_UPDATE (enum LessonStatus :2115-2121), trường trạng thái + số phiên bản trên Lesson (:2141 và :2145) và model LessonChangeRequest (:2178) `[đính chính 28/07: bản trước gộp cả ba vào khoảng :2140-2161, khoảng này không bao được enum trạng thái lẫn model LessonChangeRequest]` — hạ tầng cho luồng "gửi yêu cầu thay đổi" phần lớn đã sẵn, chủ yếu cần gắn phạm vi sở hữu.

---

## Tình huống 2 — Điều động giáo viên Hội sở sang cơ sở trong một khoảng thời hạn

Tình huống này dễ sai ở chỗ "mượn người" bị làm tắt thành "đổi nơi trực thuộc": nơi biên chế của giáo viên bị ghi đè sang cơ sở mượn (hỏng lương, hỏng báo cáo), quyền tại cơ sở mượn được cấp mà không gắn với đợt điều động nên hết hạn vẫn còn, và điều kiện xếp giáo viên vào lớp vẫn quyết bằng phép so cơ sở thay vì so vai trò giảng dạy còn hiệu lực.

### TH2 · JS-02A · Đợt điều động GV Hội sở tới CS1 được lập với thời hạn rõ, nơi trực thuộc không đổi

**Bối cảnh người dùng:** Người phụ trách nhân sự (HR/Hội sở) đang xử lý một yêu cầu mượn người từ Trưởng CS1, có công văn điều động 8 tuần. Người này không phải kỹ thuật, chỉ dùng màn hình quản trị.

**Job story:** Khi CS1 thiếu giáo viên cho lớp khai giảng tháng tới và tôi phải mượn một GV đang biên chế Hội sở trong 8 tuần, tôi muốn lập một đợt điều động có ngày bắt đầu — ngày kết thúc rồi cấp kèm vai trò giảng dạy tại CS1, để tôi có thể cho GV đó dạy ở CS1 mà nơi trực thuộc của họ vẫn là HO và không ai phải nhớ đi gỡ quyền sau này.

**Vì sao dễ sai:** Hiện đường ghi EmployeeOrgAssignment duy nhất trong production là cờ "nhân viên HO" ở form nhân sự (nhan-su/actions.ts:69-112), còn service `createAssignment()` (`lib/org/assignment-service.ts:49`) có **0 nơi gọi trong mã sản phẩm (`app/`)** — **nhưng đã có 13 lời gọi trong bộ kiểm thử `tests/e2e/a0/employee-assignment.spec.ts`** (các dòng 57, 66, 67, 75, 86, 94, 95, 102, 104, 114, 121, 130, 144), nghĩa là **luật nghiệp vụ đã viết và đã kiểm xong, phần còn thiếu chỉ là màn hình gọi vào** — đây là điểm quan trọng khi ước lượng công việc cho story này (đừng đọc thành "phải làm lại từ đầu"). Dev rất dễ "giải quyết nhanh" bằng cách đổi Employee.centerId sang CS1, làm mất nơi trực thuộc HO và hỏng lương/báo cáo. Employment hiện đã có ba nguồn sự thật (Employee.centerId + Employee.orgUnitId + assignment PRIMARY) nên sửa sai một nguồn là lệch ngay.

**Tiêu chí nghiệm thu:**

- [ ] (DƯƠNG TÍNH) Màn "Điều động / kiêm nhiệm" cho chọn: nhân viên, đơn vị đích (CS1), loại phân công (SECONDARY/SUPPORT/SUBSTITUTE), ngày bắt đầu, ngày kết thúc, tỉ lệ phân bổ, lý do bắt buộc; lưu xong hiện đúng một dòng phân công trạng thái ACTIVE kèm khoảng ngày. — R-D3-05
- [ ] (DƯƠNG TÍNH) Sau khi lưu, hồ sơ nhân viên vẫn hiển thị nơi trực thuộc PRIMARY @ HO không đổi; đợt điều động nằm ở mục riêng "đang kiêm nhiệm" và KHÔNG ghi đè Employee.centerId hay Employee.orgUnitId — kiểm bằng test đọc lại cả ba nguồn sau thao tác. — R-D3-03
- [ ] (ÂM TÍNH) Chọn loại PRIMARY trong khi nhân viên đã có một PRIMARY còn hiệu lực → hệ thống từ chối với thông báo "mỗi nhân viên chỉ có 1 nơi trực thuộc", và ràng buộc này chặn được cả khi ghi thẳng vào CSDL (unique), không chỉ ở form. — R-D3-04, R-D3-03
- [ ] (DƯƠNG TÍNH) Quyền dạy tại CS1 chỉ phát sinh khi người phụ trách bấm thêm bước "cấp vai trò giảng dạy tại CS1"; bản ghi quyền sinh ra mang derivedFrom = mã đợt điều động và có cùng khoảng hiệu lực với đợt. — R-D3-01, R-D3-11
- [ ] (ÂM TÍNH) Tạo phân công đơn thuần mà chưa cấp vai trò thì GV KHÔNG nhìn thấy bất kỳ dữ liệu nào của CS1 — test: sau bước tạo phân công, danh sách lớp CS1 của GV vẫn rỗng và mọi truy vấn học viên CS1 trả 0 dòng. — R-D3-11, R-D6-10
- [ ] (BIÊN) Ngày kết thúc trước ngày bắt đầu, hoặc đơn vị đích đã ngừng hoạt động / đã xoá mềm → từ chối kèm thông báo và KHÔNG tạo bản ghi nào (không tạo phân công rồi mới báo lỗi cấp quyền). — R-D3-05
- [ ] (DƯƠNG TÍNH) Mọi thao tác tạo/sửa/kết thúc đợt đều đi qua một service dùng chung và ghi nhật ký có người thực hiện + lý do + đơn vị; cờ "nhân viên HO" ở form nhân sự cũng phải gọi service này thay vì tự cập nhật trạng thái như hiện nay. — R-D3-06, R-D3-01
- [ ] (BIÊN) Điều động chồng lấn (GV đã có đợt tới CS2 trùng khoảng thời gian) vẫn lưu được nhưng hiện cảnh báo tổng phân bổ vượt 100% kèm danh sách các đợt trùng để người phụ trách tự quyết. — R-D3-05

**Truy vết:** R-D3-01, R-D3-03, R-D3-04, R-D3-05, R-D3-06, R-D3-11, R-D6-10

**Chặn bởi:** Câu 11 (CLASS và ASSIGNED gộp hay tách): chưa viết được tiêu chí "vai trò giảng dạy cấp tại CS1 cho GV thấy toàn bộ lớp CS1 hay chỉ lớp được giao".

### TH2 · JS-02B · Xếp đúng GV đang được điều động vào lớp CS1, không nhờ kỹ thuật sửa dữ liệu

**Bối cảnh người dùng:** Người xếp lớp / trợ lý đào tạo tại CS1, đang tạo lớp trên màn hình Lớp học và cần chọn GV chính + trợ giảng trước khi phát lịch cho phụ huynh.

**Job story:** Khi tôi mở lớp mới ở CS1 và biết có một GV Hội sở đang được điều động tới đây, tôi muốn tìm thấy đúng GV đó trong ô chọn giáo viên và gán được vào lớp, để tôi có thể chốt lịch khai giảng ngay mà không phải nhờ kỹ thuật sửa dữ liệu.

**Vì sao dễ sai:** Hiện GV biên chế HO bị chặn cứng ở hai chỗ cùng một tiêu chí sai (center-filter.ts:32-43 guard máy chủ và assignable.ts:27-30 lọc dropdown, kèm comment tự khai "TBD-1: không kiêm nhiệm") — cách sửa nhanh dễ nghĩ tới là nới guard cho GV không có cơ sở, việc này mở lại rò rỉ CS1↔CS2. Guard hiện cũng chỉ so cơ sở, không kiểm vai trò giảng dạy, nên quản lý cơ sở có quyền classes:edit tự gán mình làm GV được.

**Tiêu chí nghiệm thu:**

- [ ] (DƯƠNG TÍNH) Ô chọn GV của lớp CS1 liệt kê người thoả **ĐỒNG THỜI hai điều kiện**: (1) **đang giữ vai trò giảng dạy còn hiệu lực** VÀ (2) **có phân công còn hiệu lực tới đơn vị của lớp** (CS1 hoặc tổ tiên của CS1) tại ngày khai giảng — đúng R-D3-09 (`02-prd-franchise-platform.md:224`). GV điều động hiện kèm nhãn "kiêm nhiệm từ HO — đến <ngày>". — R-D3-10, R-D3-09 `[đã sửa 28/07: bản trước chỉ lấy "có phân công còn hiệu lực" làm căn cứ — nhẹ hơn R-D3-09, phá nguyên tắc R-D3-11 (phân công KHÔNG tự sinh quyền) và mở lại đúng đường leo thang mà TH4 · JS-04-03 đang bịt]`
- [ ] (DƯƠNG TÍNH) Điều kiện "GV hợp lệ cho lớp này" nằm trong MỘT hàm thuần dùng chung cho ô chọn (client), guard máy chủ và test; sau khi làm xong, tìm toàn repo không còn chỗ nào quyết định bằng phép so User.centerId === class.centerId. — R-D3-09, R-D3-10
- [ ] (ÂM TÍNH) Gửi thẳng yêu cầu (POST) với teacherId của người **KHÔNG thoả đồng thời hai điều kiện trên** thì máy chủ từ chối, lớp không thay đổi, và có bản ghi nhật ký từ chối. Ba ca phải cùng đỏ: GV CS2 (không có phân công tới CS1) · GV HO đã hết đợt (phân công hết hiệu lực) · **người có phân công tới CS1 nhưng không giữ vai trò giảng dạy**. — R-D4-11, R-D3-09 `[đã sửa 28/07: bổ sung ca thứ ba — bản trước chỉ kiểm vế phân công]`
- [ ] (ÂM TÍNH · trỏ story chủ) Việc chặn "quản lý cơ sở tự gán mình làm giáo viên" do **TH4 · JS-04-03 tiêu chí 3** làm **story chủ** — không nghiệm thu lại tại đây, để cùng một hàm dùng chung không bị đếm việc hai lần và không bên nào tưởng bên kia đã kiểm. (R-CONST-01, R-D4-12, R-D8-04 chuyển sang TH4 · JS-04-03)
- [ ] (DƯƠNG TÍNH) Sau khi gán, GV đó thấy lớp CS1 trong danh sách lớp của mình và điểm danh / nhập điểm được cho các buổi của lớp; "GV của buổi" chỉ có một định nghĩa duy nhất, dùng chung cho lịch, điểm danh và học liệu. — R-D8-05, R-D3-09
- [ ] (BIÊN) Lớp có buổi nằm NGOÀI khoảng điều động (kết thúc sau ngày hết đợt) → vẫn cho gán nhưng hiện cảnh báo ngay tại màn gán: số buổi nằm ngoài và ngày GV hết quyền, để người xếp lớp chủ động bố trí người thay. — R-D3-09, R-D3-07
- [ ] (BIÊN) Sửa lớp để đổi cơ sở sang CS2 trong khi GV đang gán chỉ có phân công tới CS1 → từ chối và nêu đích danh GV không hợp lệ, không lưu một phần rồi bỏ trống GV. — R-D4-11
- [ ] (DƯƠNG TÍNH) Việc gán ghi nhật ký đủ: ai gán, GV nào, lớp nào, và mã đợt điều động được dùng làm căn cứ — mở nhật ký là truy được nguồn quyền. — R-D3-01, R-D3-05

**Truy vết:** R-D3-01, R-D3-05, R-D3-07, R-D3-09, R-D3-10, R-D4-11, R-D8-05 — (R-D4-12, R-D8-04, R-CONST-01 **đã chuyển** sang TH4 · JS-04-03 là story chủ của việc chặn tự-gán-giáo-viên, sửa 28/07)

**Chặn bởi:** Câu 11 (CLASS và ASSIGNED gộp hay tách): chưa quyết được GV điều động có thấy các lớp khác của CS1 hay chỉ lớp được giao, nên chưa viết được tiêu chí tầm nhìn ngoài lớp.

### TH2 · JS-02C · Hết đợt điều động, quyền tại CS1 tự mất — không ai phải nhớ đi gỡ

**Bối cảnh người dùng:** Người phụ trách nhân sự (hoặc Trưởng CS1) rà lại cuối đợt mượn người; cùng lúc GV đó vẫn đang đăng nhập và làm việc bình thường tại Hội sở.

**Job story:** Khi đợt điều động 8 tuần của GV Hội sở kết thúc vào cuối tuần này, tôi muốn quyền của họ tại CS1 tự hết hiệu lực đúng ngày và có danh sách rõ những gì bị cắt, để tôi có thể yên tâm rằng dữ liệu học viên CS1 không còn ai ngoài cơ sở xem được mà không phải nhớ đi gỡ tay.

**Vì sao dễ sai:** Hiện thu hồi quyền là từng-dòng-một, derivedFrom 0 hit toàn repo, và đường ghi duy nhất chỉ đặt phân công sang EXPIRED mà KHÔNG đụng UserOrgRole — nghĩa là cắt phân công xong quyền vẫn còn nguyên. Vì cũng chưa có khái niệm quyền chỉ-đọc-tạm, dev dễ chọn giải pháp "để thêm vài tuần cho an toàn", biến ngoại lệ thành mặc định.

**Tiêu chí nghiệm thu:**

- [ ] (DƯƠNG TÍNH) Tác vụ nền chạy hằng ngày quét phân công quá hạn; với mỗi phân công hết hiệu lực, mọi bản ghi quyền có derivedFrom trỏ tới nó bị đóng trong CÙNG một giao dịch (không có trạng thái nửa vời phân công hết mà quyền còn). — R-D3-08, R-D3-07, R-D3-01
- [ ] (DƯƠNG TÍNH) Người phụ trách nhân sự cắt sớm một đợt điều động bằng MỘT thao tác "kết thúc đợt" kèm lý do; không phải mở từng dòng quyền để gỡ. — R-D3-02
- [ ] (DƯƠNG TÍNH) Sau khi hết hiệu lực, GV đăng nhập lại KHÔNG thấy lớp / học viên / điểm danh của CS1; phiên đang mở sẵn cũng mất quyền GHI ngay ở thao tác kế tiếp, không chờ phiên hết hạn. — R-D9-05b, R-D3-07
- [ ] (DƯƠNG TÍNH) Nơi trực thuộc PRIMARY @ HO và toàn bộ quyền của GV tại HO giữ nguyên sau khi cắt — test khẳng định GV vẫn làm việc bình thường ở HO ngay sau khi mất quyền CS1. — R-D3-03, R-D3-07
- [ ] (ÂM TÍNH) GV đã hết đợt gửi thẳng một thao tác ghi lên lớp CS1 (điểm danh, chấm bài, sửa buổi) → TỪ CHỐI, kèm bản ghi nhật ký nêu lý do "phân công đã hết hiệu lực". — R-D3-07, R-D4-11
- [ ] (DƯƠNG TÍNH) Mỗi lần cắt sinh một bản ghi xem được trên màn quản trị: ai mất quyền gì, tại đơn vị nào, căn cứ đợt nào, lúc nào — không phải đọc log máy chủ mới biết. — R-OPS-02, R-D3-01
- [ ] (BIÊN) Lớp CS1 còn buổi chưa dạy mà GV chính vừa hết quyền → hệ thống báo cho người xếp lớp (lớp thiếu GV, số buổi ảnh hưởng) thay vì để lớp mồ côi âm thầm; trạng thái lớp không tự đổi. — R-D3-07, R-D3-09
- [ ] (ÂM TÍNH) Nếu tác vụ nền lỡ một ngày, quyền vẫn KHÔNG dùng được vì hàm kiểm quyền so ngày hiệu lực tại thời điểm truy cập; tác vụ nền chỉ dọn dữ liệu, không phải hàng rào duy nhất — test bằng cách tắt tác vụ nền rồi thử truy cập. — R-D3-07, R-D3-08

**Truy vết:** R-D3-01, R-D3-02, R-D3-03, R-D3-07, R-D3-08, R-D3-09, R-D4-11, R-D9-05b, R-OPS-02

**Chặn bởi:** Câu 4 (nhân viên nghỉ việc có mất quyền không): chưa viết được tiêu chí cho tình huống GV nghỉ việc giữa đợt điều động. Câu 3 (thời gian chuyển tiếp + "dữ liệu của chính mình" gồm gì): chưa viết được tiêu chí GV chấm nốt bài của các buổi đã dạy sau ngày hết đợt, vì khái niệm quyền chỉ-đọc-tạm chưa được định nghĩa.

> **Ghi chú kiểm chứng (tình huống 2):** Các viện dẫn hiện trạng đã được đối chiếu lại trên mã nguồn (chỉ đọc) và ĐÚNG — lib/teachers/center-filter.ts:32-43 quyết định bằng phép so centerId, lib/teachers/assignable.ts:27-30 còn comment "TBD-1: không kiêm nhiệm", app/(admin)/admin/nhan-su/actions.ts:69-112 là đường ghi phân công duy nhất và không hề đụng tới UserOrgRole (nên "cắt nguồn mà quyền vẫn còn" là sự việc đang xảy ra thật, không phải rủi ro lý thuyết), trong khi service lib/org/assignment-service.ts có đủ luật nhưng 0 call-site `[đính chính 28/07: 0 call-site trong mã sản phẩm (app/) — đã có 13 lời gọi trong tests/e2e/a0/employee-assignment.spec.ts, tức luật đã kiểm xong, chỉ thiếu màn hình gọi vào; hai tài liệu nguồn đều ghi đúng giới hạn phạm vi này: 02-prd-franchise-platform.md:220 "Call-site createAssignment trong app/ ≥ 1 (hiện 0)" và 01-intended-vs-implemented.md:119 "0 call-site production"]`; enum AssignmentType (prisma/schema.prisma:438-444) đã có SECONDARY/SUPPORT/SUBSTITUTE còn EmployeeOrgAssignment chưa có ràng buộc unique chặn 2 PRIMARY. Ba story đạt về hình thức (đúng khuôn "Khi… tôi muốn… để tôi có thể…", tình huống vận hành thật, mỗi story 8 tiêu chí có tiêu chí âm tính mang thông tin mới) nhưng đều xếp MỘT PHẦN, với LỖI NẶNG NHẤT phải sửa trước khi đưa vào PRD: JS-02B tiêu chí 1 và 3 lấy "có phân công còn hiệu lực" làm căn cứ cho ô chọn GV và guard máy chủ, mâu thuẫn thẳng với JS-02A tiêu chí 4/5 và phá R-D3-11 (phân công KHÔNG tự sinh quyền) — căn cứ đúng phải là vai trò giảng dạy còn hiệu lực tại đơn vị của lớp. Các lỗi còn lại: truy vết sai (R-D6-10 ở JS-02A tiêu chí 5, R-D8-04 ở JS-02B tiêu chí 4), JS-02C tiêu chí 4 dùng cụm bị cấm "vẫn làm việc bình thường" (không quan sát được), JS-02A tiêu chí 2 đông cứng ba nguồn sự thật thay vì quy về một nguồn như R-D3-03 đòi, JS-02A tiêu chí 8 nhầm allocationPercent (số phân bổ chi phí/lương theo chú thích schema) thành thước đo trùng lịch dạy, JS-02C tiêu chí 3 mượn mã R-D9-05b của nhóm nhượng quyền nên PRD cần khẳng định cơ chế tăng tokenVersion dùng chung cho mọi lần thu hồi quyền, và JS-02B tiêu chí 7 chưa khoanh "đổi cơ sở trong cùng pháp nhân" nên thiếu chặn bởi Câu 7. Cảnh báo thi công: guard máy chủ hiện "có nhưng sai tiêu chí" — nguy hiểm hơn không có vì dễ bị coi là đã xong; và phải làm JS-02A (đường tạo phân công thật) TRƯỚC JS-02B (nới điều kiện gán GV), đảo thứ tự sẽ mở lỗ hổng cách ly cơ sở. Khoảng trống phạm vi: cả ba story chỉ phủ điều động nội bộ HO → CS1 cùng pháp nhân, chưa chạm việc cử người sang cơ sở nhượng quyền (phụ thuộc Câu 3 và Câu 7, cần story riêng).

---

## Tình huống 3 — Mở rộng sang tỉnh mới theo mô hình nhượng quyền

Cả hành trình này hỏng theo kiểu âm thầm chứ không báo lỗi: nhãn đã có nhưng chưa có nghĩa (PARTNER/FRANCHISE mới là dòng khai báo), cơ sở thiếu mã vẫn lưu thành công rồi mới lộ ra ở học viên đầu tiên, và cách ly dữ liệu hiện chỉ chặn đường đọc nên đường ghi vẫn rò. Vì vậy mọi tiêu chí nghiệm thu ở đây phải đo đầu ra thật (mã sinh ra mang tiền tố nào, gói tin trả về có trường gì, thao tác sửa/xoá bằng mã bản ghi có bị chặn không), không được dừng ở "lưu thành công".

### TH3 · JS-01 · Khối vùng cho tỉnh mới có mặt trong cây tổ chức và dùng được ngay trong ngày

**Bối cảnh người dùng:** Admin Hội sở (khối HO), sáng thứ Hai sau cuộc họp duyệt mở tỉnh. Hôm nay việc này không có màn hình nào làm được: hàm createOrgUnit ở lib/org/org-service.ts:77 có 0 call-site trong app/, nên phải nhờ dev chạy 1 migration + INSERT tay.

**Job story:** Khi ban giám đốc duyệt mở rộng sang một tỉnh mới và tôi cần một chỗ để treo các cơ sở của tỉnh đó, tôi muốn tự tạo một khối vùng ngay trên màn hình cây tổ chức, để tôi có thể lập cơ sở trong cùng ngày thay vì chờ một đợt phát hành phần mềm.

**Vì sao dễ sai:** Enum OrgUnitType hiện không có REGION (prisma/schema.prisma:286-293), nên rất dễ bị làm tắt bằng cách mượn loại CAMPUS hoặc PARTNER cho khối vùng — sau đó mọi ô chọn cơ sở sẽ lòi node vùng ra vì code lọc theo loại. Việc thứ hai dễ sai là coi vùng như tầng quản lý: quyền của HO với vùng phải đến từ UserOrgRole, không phải từ vị trí trong cây.

**Tiêu chí nghiệm thu:**

- [ ] (Dương tính) Mở **`/admin/orgunits`** (thống nhất với PRD — `02-prd-franchise-platform.md:130`; bản trước ghi `/admin/org-units`, sai một dấu gạch) thấy cây tổ chức hiện tại (ROOT, HO, CS1, CS2) dạng cây bấm mở được, mỗi node hiện loại đơn vị và mã. (R-D2-01)
- [ ] (Dương tính) Bấm Thêm đơn vị, chọn loại VÙNG, nhập tên + mã + cha = ROOT, nhập lý do, bấm Lưu; quay lại cây thấy node mới và một dòng nhật ký ghi ai tạo, lúc nào, lý do gì. (R-D2-02, R-D2-06, R-D2-05)
- [ ] (Dương tính) Sau khi lưu, đường dẫn cây (materialized path) của node mới được tự sinh, và truy vấn lấy toàn bộ con theo tiền tố đường dẫn trả về đúng tập node, có test bất biến chạy trong CI. (R-D2-09, R-D2-10, R-D2-11)
- [ ] (Âm tính) Node loại VÙNG không xuất hiện trong bất kỳ ô chọn cơ sở nào (tạo lớp, gán lead, tạo đơn hàng, lọc báo cáo); mở từng ô chọn và đếm: chỉ có node loại CƠ SỞ. (R-D2-07)
- [ ] (Âm tính) Lưu một đơn vị không phải loại CƠ SỞ mà có gắn centerId thì bị từ chối ở màn hình, và nếu chèn thẳng vào cơ sở dữ liệu thì ràng buộc dữ liệu cũng chặn. (R-D2-08, R-D2-20)
- [ ] (Âm tính) Đặt HO làm con của một VÙNG hoặc của một CƠ SỞ thì bị từ chối, thông báo nêu rõ HO phải nằm trực tiếp dưới ROOT; có test khẳng định bất biến này. (R-OPS-08)
- [ ] (Biên) Sửa tên, di chuyển cha, hoặc xoá mềm một node đều bắt buộc nhập lý do mới lưu được; xoá mềm một VÙNG còn cơ sở con đang hoạt động thì bị chặn kèm danh sách cơ sở đang vướng. (R-D2-03, R-D2-04, R-D2-05)
- [ ] (Biên) Chạy lại tác vụ nạp đường dẫn cây trên dữ liệu cũ (được seed không ghi parentId) không làm đổi cây hiện có, và in ra báo cáo số node đã vá / số node bỏ qua. (R-D2-10, R-OPS-01, R-OPS-05)

**Truy vết:** R-D2-01, R-D2-02, R-D2-03, R-D2-04, R-D2-05, R-D2-06, R-D2-07, R-D2-08, R-D2-09, R-D2-10, R-D2-11, R-D2-20, R-OPS-01, R-OPS-05, R-OPS-08

**Chặn bởi:** Câu 14 — chưa chốt đổi cây trong cửa sổ khoá ghi hay đổi nóng, nên chưa viết được tiêu chí về thời điểm áp dụng thay đổi cây và hành vi khi đang có giao dịch ghi (R-OPS-10). Câu 1 — chưa chốt phòng ban là node trong cây hay bảng phẳng, nên chưa viết được tiêu chí loại đơn vị nào được phép làm cha của phòng ban.

### TH3 · JS-02 · Cơ sở nhượng quyền tỉnh khác được lập xong với hồ sơ pháp nhân riêng, không đẻ ra cơ sở ma

**Bối cảnh người dùng:** Admin Hội sở, ngay sau khi tạo khối vùng. Hiện tại tạo cơ sở qua UI chỉ chạy đúng một câu lệnh sdb.center.create (app/(admin)/admin/centers/_actions.ts:145) — không tạo OrgUnit kèm, và biểu mẫu không có trường mã cơ sở nên Center.code để null.

**Job story:** Khi tôi đã có khối vùng cho tỉnh mới và bên nhận nhượng quyền là một pháp nhân khác có mã số thuế riêng, tôi muốn lập cơ sở đó bằng một biểu mẫu duy nhất kèm hồ sơ pháp nhân, để tôi có thể xuất chứng từ đúng tên công ty của họ ngay từ học viên đầu tiên.

**Vì sao dễ sai:** Đường tạo cơ sở hôm nay im lặng khi thiếu dữ liệu: không có mã cơ sở thì bản ghi vẫn lưu thành công, hỏng chỉ lộ ra sau này lúc sinh mã học viên và lúc class-groups rơi về tiền tố mặc định "CS" (app/(admin)/admin/class-groups/_actions.ts:90). Việc thứ hai dễ sai là nghĩ nhãn FRANCHISEE tự nó có nghĩa: enum PARTNER/FRANCHISE hiện chỉ là 4 dòng khai báo, 0 dòng logic, nên nhãn không sinh ra phạm vi hay ràng buộc nào.

**Tiêu chí nghiệm thu:**

- [ ] (Dương tính) Một biểu mẫu duy nhất: chọn cha là khối VÙNG vừa tạo, chọn quan hệ sở hữu là FRANCHISEE, nhập mã cơ sở; bấm Lưu tạo cả bản ghi cơ sở lẫn node đơn vị trong CÙNG một giao dịch — cố ý làm hỏng một vế thì không bản ghi nào được tạo. (R-D2-16, R-D2-12, R-D2-02)
- [ ] (Âm tính) Bỏ trống mã cơ sở thì không lưu được; nhập mã trùng với cơ sở đang có cũng bị từ chối kèm thông báo chỉ đúng ô sai. (R-D2-17)
- [ ] (Âm tính) Sau khi cơ sở đã có ít nhất một học viên hoặc một lớp, sửa mã cơ sở bị từ chối ở cả màn hình và ở tầng dữ liệu. (R-D2-17, R-D2-20)
- [ ] (Dương tính) Hồ sơ pháp nhân là phần bắt buộc của biểu mẫu: tên pháp nhân, mã số thuế, số tài khoản và ngân hàng, người đại diện, tiền tệ, múi giờ; các giá trị này đọc ra từ đơn vị chứ không phải từ hằng số trong code (hiện mã số thuế là hằng số ở lib/locations.ts:63). (R-D2-14, R-D2-15)
- [ ] (Dương tính) In thử một phiếu thu và một biên nhận của cơ sở mới: phần pháp nhân trên chứng từ lấy đúng tên công ty và mã số thuế của bên nhận nhượng quyền, không phải của Sata Robo Đà Nẵng. (R-OPS-11, R-OPS-12)
- [ ] (Âm tính) Bật cờ hạch toán cho cơ sở mà chưa nhập đủ mã số thuế và tài khoản ngân hàng thì bị từ chối lưu. (R-D2-13, R-D2-14)
- [ ] (Biên) Chạy tác vụ nạp bù cho hai cơ sở cũ (CS1, CS2) đang thiếu mã hoặc thiếu node đơn vị: tác vụ in ra số bản ghi đã vá, sau đó bật được ràng buộc một cơ sở ứng đúng một đơn vị mà không bản ghi nào vi phạm. (R-D2-19, R-D2-20, R-OPS-05, R-OPS-06)
- [ ] (Dương tính) Trang liên hệ và các trang công khai hiện cơ sở mới bằng dữ liệu đọc từ cơ sở dữ liệu; thêm cơ sở thứ ba không gây lỗi biên dịch (hiện lib/locations.ts:6 khoá cứng kiểu "CS1"|"CS2" và **34 tệp nhập `@/lib/locations`: 10 trong `app/`, 22 trong `components/`, 2 trong `lib/` — `lib/pdf/progress-report.tsx` và `lib/seo/jsonld.ts`**) `[đã sửa 28/07: con số cũ "32 file" bỏ sót đúng 2 tệp ở lib/, tức thiếu 2 chỗ phải sửa khi ước lượng khối lượng]`, và kiểm tra SEO không phát sinh lỗi hồi quy trên các trang cũ. (R-D2-22, R-D2-15, R-D2-23)

**Truy vết:** R-D2-02, R-D2-12, R-D2-13, R-D2-14, R-D2-15, R-D2-16, R-D2-17, R-D2-19, R-D2-20, R-D2-22, R-D2-23, R-OPS-05, R-OPS-06, R-OPS-11, R-OPS-12

**Chặn bởi:** Câu 6 — chưa chốt cờ hạch toán có hệ quả nghiệp vụ gì, nên chỉ viết được tiêu chí bật cờ phải đủ hồ sơ, chưa viết được tiêu chí báo cáo và chứng từ đổi ra sao khi cờ bật (R-D2-13). Câu 15 — chưa chốt trạng thái cuối của Center so với OrgUnit, nên chưa viết được tiêu chí ai là bảng chủ khi hai bên lệch nhau.

### TH3 · JS-03 · Hợp đồng nhượng quyền là cái công tắc duy nhất bật và tắt quyền của bên nhận

**Bối cảnh người dùng:** Admin Hội sở cùng kế toán HO, ngày hợp đồng có hiệu lực. Hiện tại không tồn tại model hợp đồng nhượng quyền nào, trường derivedFrom có 0 kết quả trong toàn repo, và đường ghi vai trò duy nhất là lib/auth/rbac-service.ts:206 — không kiểm gì về hợp đồng.

**Job story:** Khi hai bên đã ký hợp đồng nhượng quyền và nhân sự bên nhận cần vào hệ thống làm việc, tôi muốn nhập hợp đồng trước rồi mới cấp được vai trò, để tôi có thể cắt sạch quyền của họ bằng một thao tác vào ngày hợp đồng chấm dứt mà không phải đi gỡ từng dòng.

**Vì sao dễ sai:** Thu hồi quyền hiện là từng dòng một và không có khái niệm nguồn phát sinh, nên rất dễ làm ra một màn hình hợp đồng chỉ để lưu trữ giấy tờ trong khi quyền vẫn được cấp bằng đường cũ — lúc cắt hợp đồng thì quyền vẫn sống. Việc thứ hai dễ sai là coi hết hiệu lực là mất sạch quyền ngay: bên nhận vẫn phải đọc được dữ liệu học viên của chính họ trong thời gian chuyển tiếp, mà hệ thống hiện không có khái niệm quyền chỉ đọc tạm.

**Tiêu chí nghiệm thu:**

- [ ] (Dương tính) Màn hình quản lý hợp đồng cho tạo hợp đồng với bên nhượng quyền là node HO, bên nhận là node cơ sở mới, ngày ký, ngày hết hạn, tỉ lệ phí, trạng thái đi từ nháp sang có hiệu lực; danh sách hợp đồng lọc được theo trạng thái. (R-D9-01, R-D9-08, R-D9-09)
- [ ] (Âm tính) Lưu hợp đồng đảo chiều (franchisorOrgId trỏ cơ sở nhận, franchiseeOrgId trỏ HO) bị từ chối ở màn hình; chèn thẳng bản ghi đảo chiều vào cơ sở dữ liệu cũng bị ràng buộc dữ liệu chặn. (R-D9-02)
- [ ] (Âm tính) Gán vai trò cho nhân sự bên nhận tại node cơ sở nhượng quyền khi chưa có hợp đồng ở trạng thái có hiệu lực thì bị từ chối kèm lý do; chặn nằm ở đường ghi lib/auth/rbac-service.ts:206 chứ không phải chỉ ẩn nút trên giao diện. (R-D9-03, R-D9-04, R-D3-01)
- [ ] (Dương tính) Sau khi hợp đồng có hiệu lực, cấp vai trò cho quản lý và giáo viên bên nhận thành công; mở lại từng bản ghi quyền thấy trường nguồn phát sinh trỏ đúng mã hợp đồng đó. (R-D3-01, R-D9-04, R-D9-03)
- [ ] (Âm tính) **Bước trước đó — AI TẠO TÀI KHOẢN và tạo được ở đơn vị nào:** người được cấp quyền tạo tài khoản chỉ tạo/sửa được tài khoản gắn vào đơn vị **nằm trong phạm vi của chính họ**; gửi thẳng biểu mẫu với mã đơn vị ngoài phạm vi thì bị **TỪ CHỐI ở máy chủ**, không chỉ ẩn ô chọn. Kèm tiêu chí âm tính đối xứng: **quản lý cơ sở nhận nhượng quyền KHÔNG tạo được tài khoản tại HO hay tại cơ sở khác**. Lý do phải viết ra: đường tạo/sửa người dùng hiện nhận đơn vị **từ biểu mẫu mà không đối chiếu tập đơn vị người thao tác được phép**, hiện an toàn **chỉ vì** quyền quản lý người dùng thuộc đúng một vai trò cao nhất, và BƯỚC 1 đã cảnh báo đích danh nó "trở thành đường leo thang tenant NGAY KHI giao quyền tạo tài khoản xuống cơ sở/bên nhận nhượng quyền" (`01-intended-vs-implemented.md:203`) — đúng kịch bản mà PRD này mở ra. ⚠️ Nếu Ban quyết **GIỮ** việc tạo tài khoản ở HO thì phải ghi thành **ràng buộc tường minh** thay vì để trống — xem câu **(b11)**. (R-D9-03, R-D4-11)
- [ ] (Âm tính) Tài khoản đào tạo của bên nhận mở chương trình dạy của HO thì chỉ ở chế độ đọc; gọi thẳng hành động sửa chương trình bằng mã chương trình vẫn bị từ chối vì chương trình thuộc HO (hiện Curriculum và Course không có trường sở hữu nào, quyền sửa là ma trận role toàn cục). (R-D8-01, R-D8-02, R-D8-03)
- [ ] (Biên · **trỏ story chủ, không nghiệm thu lại tại đây**) Hai việc "cắt hợp đồng bằng MỘT thao tác" và "tác vụ nền quét hợp đồng hết hạn" **có story chủ riêng** — nghiệm thu ở đó, không đếm hai lần: **TH6 · JS-06-02** là story chủ của *cắt một thao tác + một dòng nhật ký gộp + tăng số phiên bản phiên*; **TH6 · JS-06-01** là story chủ của *tác vụ nền quét hết hạn, chạy lại không sinh trùng, hợp đồng vô thời hạn, thông báo*; **TH6 · JS-06-03** là story chủ của *chế độ chỉ đọc sau khi cắt*. Tại story này chỉ nghiệm thu **điều kiện tiên quyết**: mọi bản ghi quyền cấp ở tiêu chí 4 đều mang nguồn phát sinh trỏ về hợp đồng, nên cắt theo nguồn là **làm được** — kiểm bằng một truy vấn đếm quyền theo mã hợp đồng. (R-D3-01, R-D9-04) `[đã sửa 28/07: hai tiêu chí cũ ở đây chính là nội dung TH6 · JS-06-02 và JS-06-01, trong khi TH6 dành trọn bốn story cho đúng việc đó — trùng làm khối lượng bị đếm ba lần và khi nghiệm thu mỗi bên tưởng bên kia đã kiểm (câu b9)]`
- [ ] (Dương tính) Có bộ test đối chiếu ba trạng thái hợp đồng nhân ba nhóm quyền, trong đó test DENY chạy xanh ở đầu can() và trước nhánh SUPER_ADMIN; **và có ngoại lệ khai báo tường minh cho quản trị viên cao nhất trên một danh sách hành động miễn nhiễm — tạo lệnh cấm dẫn tới không còn ai quản trị được phân quyền thì bị TỪ CHỐI**; cờ RBAC_V2_ENABLED vẫn tắt cho tới khi bộ test này xanh. (R-D9-10, R-QDB-01, R-QDB-02, **R-QDB-03**, R-QDB-04, R-QDB-05) `[đã bổ sung 28/07: bản trước chỉ nêu nửa đầu của QĐ-B. Nửa còn lại — ngoại lệ chống tự khoá — nằm ở QUYET-DINH.md:53 và R-QDB-03 (02-prd:243): không có ngoại lệ này, một lệnh cấm toàn cục khoá luôn quản trị viên ra ngoài hệ thống. TH7 · JS-N5 tiêu chí 6 có nêu đủ, nhưng đội nhận việc theo story này sẽ không thấy]`

**Truy vết:** R-D9-01, R-D9-02, R-D9-03, R-D9-04, R-D9-08, R-D9-09, R-D9-10, R-D3-01, R-D8-01, R-D8-02, R-D8-03, R-D4-11, R-QDB-01, R-QDB-02, R-QDB-03, R-QDB-04, R-QDB-05 — (**R-D9-05, R-D9-05b, R-D9-06, R-D3-02, R-D3-07, R-D3-08, R-OPS-02 đã chuyển** về story chủ ở tình huống 6, sửa 28/07: chúng thuộc phần cắt quyền, không thuộc phần "hợp đồng là điều kiện tiên quyết")

**Chặn bởi:** Câu 3 — chưa chốt thời gian chuyển tiếp bao lâu và "dữ liệu của chính mình" gồm những gì, nên chỉ viết được tiêu chí trạng thái chỉ đọc tồn tại, chưa viết được tiêu chí thời hạn và phạm vi dữ liệu được đọc (R-D9-06, R-D9-11). Câu 13 — chưa chốt điều khoản hợp đồng nào phải kiểm được, nên chưa viết được tiêu chí nghiệm thu cho R-D9-12. Câu 2 — chưa chốt bên nhận tự soạn chương trình riêng thì tính phí thế nào, nên chưa viết được tiêu chí phân biệt lớp tính phí và lớp không tính phí (R-D10-12). Câu 12 — chưa chốt ai được tạm ngưng hợp đồng, nên chưa viết được tiêu chí cho trạng thái tạm ngưng.

### TH3 · JS-04 · Cơ sở mới chạy được ngày đầu tiên: mã đúng tiền tố, phòng ban chuẩn, danh mục kế thừa, dữ liệu không lẫn

**Bối cảnh người dùng:** Admin Hội sở nghiệm thu cùng quản lý cơ sở mới, trước ngày khai giảng. Hiện tại khuôn mẫu đơn vị là số không, kế thừa cấu hình chỉ có hai tầng phẳng (lib/settings/resolve.ts:3), và mã học viên rơi về tiền tố mặc định "CS" khi cơ sở thiếu mã.

**Job story:** Khi cơ sở nhượng quyền vừa lập xong và bên nhận sắp nhận học viên đầu tiên, tôi muốn kiểm được ngay là cơ sở đó có đủ phòng ban, đủ danh mục và sinh mã đúng, để tôi có thể bàn giao hệ thống mà không phải chờ ai đó chạy lệnh vá dữ liệu sau này.

**Vì sao dễ sai:** Cơ sở mới nhìn bề ngoài "chạy được" ngay cả khi thiếu mã, thiếu phòng ban và thiếu danh mục — hỏng chỉ lộ ra ở học viên đầu tiên, lúc đó vá dữ liệu tốn hơn nhiều. Việc thứ hai dễ sai là dừng ở cách ly đường đọc: scopedDb chỉ tự lọc bảy phương thức đọc, mọi update/delete và mọi include lồng phải tự chặn, nên một cơ sở nhượng quyền hoàn toàn có thể sửa được bản ghi của cơ sở khác dù danh sách hiển thị đã sạch.

**Tiêu chí nghiệm thu:**

- [ ] (Dương tính) Ngay khi cơ sở được tạo, khuôn mẫu đơn vị chạy trong cùng giao dịch và sinh đủ bộ phòng ban chuẩn và bộ vị trí chuẩn; chạy lại khuôn mẫu lần hai không sinh thêm bản ghi trùng. (R-D6-08, R-D6-09, R-D6-13)
- [ ] (Âm tính) Vị trí sinh từ khuôn mẫu không kèm quyền: một tài khoản được gắn vào vị trí nhưng chưa có bản ghi vai trò trên đơn vị thì mở bất kỳ màn hình nào của cơ sở mới đều bị từ chối. (R-D6-10, R-D3-11)
- [ ] (Dương tính) Danh mục khởi tạo đúng ba mức đã khai báo: mức dùng chung hiện giá trị của tập đoàn và không sửa được tại cơ sở; mức kế thừa cho ghi đè; mức độc lập để trống cho cơ sở tự khai; màn hình cấu hình hiện rõ mỗi giá trị đang đến từ đơn vị nào. (R-D6-01, R-D6-02, R-D6-03, R-D6-04, R-D6-07)
- [ ] (Dương tính) Đặt một tham số ở khối VÙNG thì cơ sở mới nhận được giá trị đó; ghi đè tại cơ sở thì giá trị của cơ sở thắng; xoá ghi đè thì quay lại giá trị của vùng — kế thừa đi lên nhiều tầng chứ không dừng ở hai tầng như hiện nay. (R-D6-05, R-D6-06, R-D6-07)
- [ ] (Dương tính) Chuyển đổi một lead thành học viên ở cơ sở mới cho ra mã học viên mang đúng tiền tố mã cơ sở mới; tạo một lớp và một nhóm lớp cũng ra mã cùng tiền tố; rà toàn bộ dữ liệu không còn bản ghi nào mang tiền tố mặc định "CS". (R-D2-18, R-OPS-07)
- [ ] (Âm tính) Tài khoản quản lý cơ sở mới mở danh sách học viên, lớp, lead, đơn hàng và báo cáo chỉ thấy dữ liệu cơ sở mình; gọi thẳng hành động sửa hoặc xoá một bản ghi của CS1 bằng mã bản ghi vẫn bị từ chối, tức đường GHI cũng bị chặn chứ không chỉ đường ĐỌC. (R-D4-11, R-D4-09, R-D9-03)
- [ ] (Âm tính) **Cách ly phải đủ cho MỌI vai trò cấp cơ sở, không chỉ quản lý cơ sở:** bộ kiểm cách ly chạy cho **đủ 9 mã vai trò**; mỗi vai trò mở 5 màn dữ liệu (học viên · lớp · lead · đơn hàng · báo cáo) và đếm được **0 dòng** của cơ sở khác. Neo KR8 (`02-prd-franchise-platform.md:84` — hiện **4/9** vai trò được test cách ly, đích **9/9**). Lý do phải viết riêng: BƯỚC 0 đo được **mọi vai trò cấp cơ sở KHÔNG phải quản lý cơ sở** (kinh doanh, kế toán, nhân sự, marketing, đào tạo) hiện rơi về "nhìn thấy mọi cơ sở" (`00-scope-gap.md:129`) — tức lỗ rò thật nằm ở các vai trò mà mọi tiêu chí âm tính khác của tài liệu này chưa hề chạm tới. (R-D4-11, R-D4-01)
- [ ] (Âm tính) **Bốn bảng không có trường cơ sở phải được che:** nhật ký Zalo, xung đột chuyển đổi, yêu cầu phụ huynh, nhật ký email (`00-scope-gap.md:77-80` — bốn ca rò đã xác nhận, làm lộ **số điện thoại và email phụ huynh** giữa hai cơ sở) phải được lọc qua quan hệ tới cơ sở **hoặc** che số điện thoại/email; dán một mã bản ghi của cơ sở khác vào đường gọi thẳng trả mã lỗi từ chối, không trả danh sách rỗng. Khi cơ sở là **pháp nhân khác**, đây là rò dữ liệu cá nhân **XUYÊN PHÁP NHÂN** — đúng rủi ro pháp lý mà cả chương trình đang muốn chặn. ⚠️ Hiện **chưa mã R-\* nào trong PRD nhắc tên bốn bảng này** — kiến nghị BƯỚC 2 mở thêm mã, xem câu **(b10)**. (R-D4-11, R-DP-07)
- [ ] (Biên) Lớp ở cơ sở mới dùng chương trình thuộc HO thì HO xem được chi tiết từng dòng học phí, giảm giá, hoàn tiền, công nợ và điểm danh; lớp không giải được chủ sở hữu chương trình thì hệ thống đóng lại, HO chỉ thấy năm chỉ số tổng hợp và màn chi tiết không mở được. (R-D10-02, R-D10-03, R-D10-04, R-D10-05, R-D10-10, R-D10-13)
- [ ] (Âm tính) HO mở hồ sơ nhân sự và sổ chi phí của cơ sở nhượng quyền thì các trường lương, chi phí mặt bằng, lợi nhuận ròng bị che ngay ở tầng truy vấn (không phải ẩn ở giao diện); đọc thẳng dữ liệu trả về từ máy chủ không thấy các trường này. (R-D4-06, R-D4-07, R-D10-12)

**Truy vết:** R-D6-01, R-D6-02, R-D6-03, R-D6-04, R-D6-05, R-D6-06, R-D6-07, R-D6-08, R-D6-09, R-D6-10, R-D6-11, R-D6-13, R-D3-11, R-D2-18, R-D2-24, R-D4-01, R-D4-06, R-D4-07, R-D4-09, R-D4-11, R-DP-07, R-D9-03, R-D10-02, R-D10-03, R-D10-04, R-D10-05, R-D10-10, R-D10-12, R-D10-13, R-OPS-03, R-OPS-04, R-OPS-07 — kèm **KR8** (`02-prd-franchise-platform.md:84`) làm mốc đo cho tiêu chí cách ly 9 vai trò; hai tiêu chí cách ly mới bổ sung 28/07 **chưa có mã `R-*` riêng cho bốn bảng không có trường cơ sở**, xem câu (b10)

**Chặn bởi:** Câu 9 — chưa chốt bên nhận nhượng quyền có được đặt học phí riêng không. Học phí hiện toàn cục (Course.price và CoursePackage.price không có centerId hay orgUnitId, 0/45 khoá cấu hình về giá), nên chưa viết được tiêu chí nghiệm thu cho nhóm khoá giá/thuế/tiền tệ (R-D6-14) và cho mức giá riêng của cơ sở tỉnh khác. Câu 1 — chưa chốt phòng ban là node trong cây hay bảng phẳng, nên chỉ viết được tiêu chí "sinh đủ bộ phòng ban", chưa viết được tiêu chí phòng ban nằm ở đâu và một nguồn phòng ban là bảng nào (**R-D2-21** — `02-prd-franchise-platform.md:184`) `[đã sửa 28/07: bản trước ghi "R-D6-21", mã này KHÔNG tồn tại — nhóm D6 trong PRD chỉ có R-D6-01 đến R-D6-14]`. Câu 5 — chưa chốt học bù tính vào báo cáo hay đối trừ tiền, nên chưa viết được tiêu chí nghiệm thu số liệu buổi học của cơ sở mới.

> **Ghi chú kiểm chứng (tình huống 3):** Hành trình này hôm nay chưa có điểm bắt đầu trên giao diện — createOrgUnit (lib/org/org-service.ts:77) có 0 call-site trong app/, còn createCenter (app/(admin)/admin/centers/_actions.ts:136-157) chỉ chạy một câu lệnh sdb.center.create, nên JS-01 và JS-02 là dựng mới màn hình chứ không phải sửa nhỏ. Enum OrgUnitType (prisma/schema.prisma:286-293) đã có PARTNER/FRANCHISE nhưng 0 dòng logic — nhãn không sinh phạm vi. Kết quả rà soát bốn story: định dạng job story đúng cả bốn, mỗi story có ba tiêu chí âm tính và không cái nào là phủ định suông; thuật ngữ franchisor/franchisee đúng chiều. JS-03 chắc nhất (đã mở repo kiểm: lib/auth/rbac-service.ts dòng ~206 đúng là đường ghi userOrgRole.upsert; Curriculum/Course thật sự không có trường sở hữu). Cần sửa trước khi trình BGĐ: JS-02 tiêu chí 3 làm nhẹ yêu cầu chốt (R-D2-17 đòi mã cơ sở bất biến, tiêu chí lại cho sửa khi cơ sở chưa có dữ liệu); JS-03 tiêu chí 7 tự mâu thuẫn với chính blocked_by (đã khai Câu 3 chặn định nghĩa "dữ liệu của chính mình" nhưng vẫn chốt phạm vi). JS-04 bị chấm SAI ở cấp story — là gói tính năng chứ không phải một job (tiêu chí 7 và 8 khác việc, khác người, khác thời điểm), 30 mã truy về cho 8 tiêu chí trong đó R-D2-24, R-OPS-03, R-OPS-04 không có tiêu chí nào phủ, truy về sai ở tiêu chí 6 (R-D4-09 isHoLevel không liên quan quản lý cơ sở) và tiêu chí 8 (R-D10-12 nói về tách phạm vi tính phí, không phải che trường lương), và blocked_by dẫn R-D6-21 là mã không tồn tại (chỉ số D6 chỉ có 01–14); khuyến nghị tách thành JS-04a (khuôn mẫu phòng ban/danh mục), JS-04b (sinh mã + cách ly cả đường ghi), JS-04c (phạm vi tài chính của bên nhượng quyền). Lỗi nhẹ: JS-01 tiêu chí 1 đặt sẵn đường dẫn /admin/org-units — route này không tồn tại trong app/(admin)/admin/ (chỉ có users/[id]/org-roles) và tiêu chí giả định cây đã có quan hệ cha-con, mâu thuẫn với R-OPS-01 (seed không ghi parentId); mã truy về thừa: R-D2-20 ở JS-01 tiêu chí 5, R-D2-15 ở JS-02 tiêu chí 8. Ba tiêu chí chưa đo được: JS-01 tiêu chí 3 ("đúng tập node" chưa nêu bộ dữ liệu mẫu), JS-02 tiêu chí 8 ("SEO không phát sinh lỗi hồi quy" chưa nêu ngưỡng), JS-04 tiêu chí 1 ("đủ bộ chuẩn" chưa liệt kê danh sách chuẩn). Về độ phủ, bộ bốn story bỏ trắng D8 phần giáo viên, toàn bộ QĐ-C (học bù liên cơ sở), D3 phần điều động/gỡ chặn giáo viên biên chế HO và toàn bộ nhóm dữ liệu cá nhân R-DP — chưa kết luận là thiếu sót hay do phạm vi tình huống chỉ nhắm việc mở cơ sở, cần người giao việc xác nhận. Chín trong mười lăm câu hỏi chưa chốt chạm trực tiếp tình huống này, nên đây là tình huống chịu rủi ro treo cao nhất.

---

## Tình huống 4 — Quản lý cơ sở nhìn được tiến độ chương trình nhưng không chạm được nội dung học liệu

Tình huống này dễ sai vì dữ liệu vận hành (tên chương trình, số buổi còn lại, danh mục học liệu) và nội dung giảng dạy (SCORM, tệp) nằm chung một chỗ, chỉ cần lấy lồng dữ liệu hoặc để lọt một đường tải tệp là quản lý cơ sở đọc được toàn bộ học liệu của Hội sở.
Nặng hơn, quản lý cơ sở có quyền sửa lớp hoàn toàn có thể tự gán chính mình làm giáo viên để hợp thức hoá quyền mở nội dung — đường này làm vô hiệu mọi ràng buộc còn lại.

### TH4 · JS-04-01 · Biết lớp đang chạy chương trình nào và còn bao nhiêu buổi, mà không đọc được một dòng nội dung

**Bối cảnh người dùng:** Quản lý cơ sở CS2 (và tương lai là quản lý cơ sở nhượng quyền ở tỉnh khác), đầu tuần, đang mở /admin/classes để lên lịch và soạn báo cáo vận hành. Người này KHÔNG giữ vai trò giảng dạy và không sở hữu chương trình.

**Job story:** Khi tôi phải chốt lịch dạy tháng tới và trả lời phụ huynh 'lớp con còn mấy buổi', tôi muốn thấy chương trình mà từng lớp của cơ sở tôi đang chạy cùng tiến độ buổi, để tôi có thể xếp lịch và làm báo cáo mà không phải nhắn hỏi Đào tạo HO.

**Vì sao dễ sai:** Ranh giới rất mỏng: 'tên chương trình + số buổi còn lại' là dữ liệu vận hành phải cho xem, còn 'tiêu đề chi tiết từng bài + tệp' là nội dung phải chặn — hai thứ này nằm chung một bảng nên rất dễ include lồng vào là lộ. Thêm nữa hiện Curriculum không có trường sở hữu nào (0 trường), nên không có gì để hàm quyết định phạm vi bám vào; ai làm nhanh sẽ mặc định 'ai thấy lớp thì thấy chương trình'.

**Tiêu chí nghiệm thu:**

- [ ] Mở chi tiết một lớp của cơ sở mình, tôi thấy: tên chương trình, mã chương trình, phiên bản được ghim lúc tạo lớp, đơn vị sở hữu chương trình, tổng số buổi, số buổi đã dạy, số buổi còn lại, ngày buổi kế tiếp — tất cả trên một màn, không cần hỏi ai. (dương tính · R-D8-09, R-D10-02)
- [ ] Danh sách buổi của lớp hiện: số thứ tự buổi, tiêu đề bài học, trạng thái (đã dạy / chưa dạy / huỷ / bù), giáo viên được phân công. Mỗi hàng KHÔNG kèm bất kỳ liên kết, nút, hay vùng bấm nào dẫn tới nội dung bài (SCORM, tệp, mô tả chi tiết bài giảng). (dương tính · R-D8-09)
- [ ] Với tài khoản chỉ có curriculum:view (không có training:manage), màn /admin/curriculums và /admin/curriculums/[id] không render nút 'Xem nội dung' / 'Mở SCORM' / 'Tải xuống'. Đây là hành vi ĐANG ĐÚNG (app/(admin)/admin/curriculums/page.tsx:24 gác curriculum:view) — phải có test hồi quy khoá lại, không được để đợt hardening nào nới ra. (âm tính · R-D8-09, R-D8-14)
- [ ] Gọi thẳng bằng HTTP (không qua UI) các endpoint trả nội dung bài — cấp vé SCORM, runtime SCORM, chi tiết lesson content — với cookie của quản lý cơ sở: trả 403 kèm mã lỗi, ghi audit, KHÔNG trả 200 rỗng và không chỉ dựa vào việc UI đã ẩn nút. (âm tính · R-D8-02, R-D8-14, R-D4-12)
- [ ] Lớp có curriculumId = null, hoặc chương trình đã xoá mềm: màn hiện đúng chữ 'chưa xác định chương trình' và KHÔNG suy đoán ngược qua courseId; lớp đó bị đếm vào báo cáo tồn đọng để Đào tạo xử lý, thay vì hiện một tên chương trình đoán mò. (biên · R-D10-13, R-D10-02, R-D2-04)
- [ ] Chương trình do HO sở hữu và chương trình do chính cơ sở sở hữu dùng CÙNG một màn, chỉ khác nhãn đơn vị sở hữu; với quản lý cơ sở nhượng quyền (FRANCHISEE), cột/nút 'Sửa chương trình' bị ẩn VÀ action sửa trả 403 khi gọi thẳng. (âm tính · R-D8-03, R-D8-01, R-D8-02)
- [ ] Xuất báo cáo 'tiến độ chương trình theo lớp': tệp chỉ chứa lớp thuộc phạm vi đơn vị của actor. Lớp của cơ sở khác không xuất hiện dù chỉ một dòng, kể cả khi cùng dùng chương trình đó; bộ lọc phạm vi chạy ở tầng truy vấn, không phải lọc ở component. (âm tính · R-D4-06, R-D4-09, R-D10-05)
- [ ] Số buổi còn lại tính từ ClassSession thực tế; nếu tổng ClassSession lệch tổng buổi của chương trình đã ghim, màn hiện cảnh báo lệch kèm hai con số, không tự chọn con số nào. (biên · R-D10-02, R-D10-13)

**Truy vết:** R-D8-01, R-D8-02, R-D8-03, R-D8-09, R-D8-14, R-D10-02, R-D10-05, R-D10-13, R-D4-06, R-D4-09, R-D4-12, R-D2-04

**Chặn bởi:** Câu 2 — FRANCHISEE tự soạn chương trình riêng thì tính phí và quyền sửa thế nào: chưa viết được tiêu chí cho nhãn chủ sở hữu + nút 'Sửa' của chương trình do chính FRANCHISEE soạn. Câu 3 — thời gian chuyển tiếp: chưa viết được tiêu chí 'sau khi cắt hợp đồng, quản lý cơ sở còn xem tiến độ chương trình HO trong bao lâu và thấy những trường nào'.

### TH4 · JS-04-02 · Xác nhận một buổi đã đủ tài liệu để dạy — bằng danh mục, không bằng cách mở tệp

**Bối cảnh người dùng:** Quản lý cơ sở, chiều hôm trước buổi dạy, đang đứng giữa giáo viên và Đào tạo HO. Người này cần bằng chứng 'thiếu/đủ' đủ mạnh để mở phiếu yêu cầu, nhưng theo D8 thì tuyệt đối không được đọc nội dung học liệu.

**Job story:** Khi ngày mai lớp có buổi mới và giáo viên báo 'hình như thiếu tài liệu', tôi muốn kiểm tra buổi đó đã gắn đủ học liệu bắt buộc chưa, để tôi có thể đòi Đào tạo HO bổ sung trước giờ dạy mà không phải mở từng tệp ra xem.

**Vì sao dễ sai:** Ai cũng đồng ý 'quản lý không được đọc nội dung', nhưng lỗ thật không nằm ở màn chương trình — nó nằm ở màn Tài liệu đang phát URL R2 công khai vĩnh viễn, và ở chỗ packageId với sessionId là hai tham số rời do client cấp. Chặn ở UI mà không chặn hai đường này thì nghiệm thu vẫn PASS trong khi dữ liệu vẫn rò.

**Tiêu chí nghiệm thu:**

- [ ] Mở một buổi cụ thể, tôi thấy danh mục học liệu của buổi: tên tài liệu, loại, dung lượng, ngày cập nhật gần nhất, người tải lên, và trạng thái 'đã gắn vào buổi'. Chỉ siêu dữ liệu — không có ô xem trước, không có thumbnail nội dung, không có đoạn trích. (dương tính · R-D8-09)
- [ ] Buổi thiếu học liệu bắt buộc theo khuôn mẫu của chương trình được gắn cờ 'THIẾU' kèm tên các mục còn thiếu; từ đúng màn đó tôi gửi yêu cầu bổ sung tới Đào tạo HO trong 1 thao tác và nhận lại mã yêu cầu để theo dõi. (dương tính · R-D8-09, R-D6-08)
- [ ] Ở /admin/documents, tài khoản quản lý cơ sở KHÔNG còn thẻ mở tệp trực tiếp. Hiện trang render thẳng <a href={d.fileUrl}> nhãn 'Mở' (app/(admin)/admin/documents/page.tsx:325-332) trỏ URL R2 công khai, không vé, không hết hạn, không đóng dấu, không log — nghiệm thu là hàng tài liệu chỉ còn siêu dữ liệu và (nếu có quyền) nút Sửa. (âm tính · R-D8-08, R-D8-09)
- [ ] Gọi route phát tài liệu bằng HTTP với cookie quản lý cơ sở (không qua UI) trả 403 kèm mã lỗi; song song, mọi fileUrl trần trên R2 bị thu hồi quyền đọc ẩn danh, tức dán URL cũ vào trình duyệt ẩn danh cũng không tải được. (âm tính · R-D8-08, R-DP-06)
- [ ] Đường ghép URL: lấy packageId của một chương trình khác ghép với sessionId hợp lệ mà tôi có quyền → 403 vì buổi đó không thuộc chương trình sở hữu gói. Hiện hai tham số là ĐỘC LẬP do client cấp và không hề được nối (app/api/scorm/runtime/route.ts:89-129 kiểm gói tồn tại và kiểm GV của buổi, nhưng không kiểm gói có thuộc chương trình của buổi hay không). (âm tính · R-D8-06, R-D8-14)
- [ ] Mỗi lượt xem nội dung (không phải lượt xem danh mục) sinh một bản ghi: người xem, gói/tài liệu, buổi, thời điểm, IP. Quản lý cơ sở xem được nhật ký lượt xem của cơ sở mình — nhưng bấm vào dòng nhật ký KHÔNG mở được nội dung tương ứng. (dương tính · R-D8-11)
- [ ] Tài liệu isPublic = true (học liệu công khai cho phụ huynh) vẫn mở được bình thường và được gắn nhãn phân biệt rõ với 'nội bộ HO', để việc siết không chặn nhầm tài liệu marketing/hướng dẫn phụ huynh. (biên · R-D8-08, R-D6-01)
- [ ] Buổi chưa tới cửa sổ mở khoá: danh mục 'đủ/thiếu' vẫn hiển thị đầy đủ cho quản lý (đây là dữ liệu vận hành), trong khi nút xem nội dung của giáo viên chưa bật. Quản lý không có nút đó ở bất kỳ thời điểm nào trong hay ngoài cửa sổ. (biên · R-D8-07, R-D8-09)

**Truy vết:** R-D8-06, R-D8-07, R-D8-08, R-D8-09, R-D8-11, R-D8-14, R-D6-01, R-D6-08, R-DP-06

**Chặn bởi:** Câu 10 — log 'mỗi lượt xem' là mỗi lượt mở gói hay mỗi tài nguyên con: chưa viết được tiêu chí về số bản ghi kỳ vọng khi mở 1 gói SCORM gồm N tệp con, nên tiêu chí nhật ký hiện chỉ nêu trường phải có, chưa nêu độ hạt.

### TH4 · JS-04-03 · Bù giáo viên cho buổi sắp dạy mà không tự biến mình thành giáo viên

**Bối cảnh người dùng:** Quản lý cơ sở, tối trước buổi dạy, có quyền classes:edit. Đây là người có động cơ và có quyền kỹ thuật để tự đặt tên mình vào ô giáo viên — và hôm nay hệ thống cho phép.

**Job story:** Khi giáo viên báo bận đột xuất và buổi ngày mai chưa có người dạy, tôi muốn gán một giáo viên hợp lệ khác vào buổi đó, để tôi có thể giữ lớp không nghỉ mà không phải chờ HO duyệt.

**Vì sao dễ sai:** Đây là đường leo thang im lặng: quản lý cơ sở có classes:edit hợp pháp, guard hiện chỉ so cơ sở chứ không so vai trò, nên chỉ cần tự gán mình làm GV là thoả nhánh `isAssignedTeacher` (`lib/scorm/access.ts:30-42` — so trực tiếp với `actualTeacherId` / `teacherId` / `assistantId`), từ đó `canOpenScorm` (`:54-59`) trả về cho phép và mở được toàn bộ học liệu HO — mọi tiêu chí 'quản lý không thấy nội dung' ở hai story trên đều bị vô hiệu từ chỗ này.

**Tiêu chí nghiệm thu:**

- [ ] Danh sách chọn giáo viên cho buổi chỉ liệt kê người thoả một hàm thuần duy nhất: đang giữ vai trò giảng dạy còn hiệu lực VÀ có phân công tới đơn vị của lớp. Danh sách này dùng chung cho UI và cho guard phía máy chủ, không có hai bản logic. (dương tính · R-D3-09, R-CONST-01)
- [ ] Giáo viên biên chế HO có phân công hợp lệ tới cơ sở tôi XUẤT HIỆN trong danh sách và gán được. Hiện bị chặn cứng bởi điều kiện User.centerId === class.centerId (lib/teachers/center-filter.ts:32-43) nên GV HO không bao giờ dạy được lớp cơ sở. (dương tính · R-D3-10, R-D3-09)
- [ ] Tôi chọn chính tài khoản của mình (không giữ vai trò giảng dạy) làm giáo viên hoặc trợ giảng: server action TỪ CHỐI kèm lý do, kể cả khi tôi có classes:edit và cùng centerId với lớp. Hàm kiểm hiện chỉ so centerId, hoàn toàn không kiểm vai trò (teacherCenterAssignmentError, lib/teachers/center-filter.ts:32-43) — đây là đường tự leo thang đang mở. (âm tính · R-D8-04, R-D4-11, R-D4-12)
- [ ] Ngay sau khi bị từ chối ở bước gán, tôi gọi thẳng route cấp vé SCORM và route runtime với classSessionId của buổi đó: trả 403. Không có đường vòng nào biến 'đã bấm gán' thành quyền xem nội dung. (âm tính · R-D8-05, R-D8-06, R-QDB-02)
- [ ] Gán một người mà phân công tới đơn vị đã hết hiệu lực (quá effectiveTo) → từ chối tại thời điểm gán; và người đang là giáo viên của buổi mà phân công hết hiệu lực giữa chừng thì mất quyền mở nội dung ngay lượt gọi kế tiếp, không phải chờ đăng nhập lại. (âm tính · R-D3-07, R-D3-08, R-D3-01, R-D8-04)
- [ ] Giáo viên kiêm nhiệm hai đơn vị hiện đúng một lần trong danh sách của cả hai cơ sở (không nhân đôi hàng), và khi tôi đổi cơ sở trên form thì giá trị đang chọn không bị rớt — chặn tái diễn lỗi 'Lớp học hiện trống'. (biên · R-D3-05, R-D3-09)
- [ ] Hai định nghĩa 'giáo viên của buổi' đang lệch nhau (ClassSession.actualTeacherId so với Class.teacherId/assistantId) được hợp nhất về MỘT hàm; bộ test khẳng định cả đường gán lẫn đường mở nội dung cho cùng kết quả trên cùng dữ liệu, và nhánh dự phòng 'bất kỳ lớp nào cùng curriculumId/courseId' bị xoá. (âm tính · R-D8-05, R-D8-06, R-D8-14)
- [ ] Mọi lần gán/gỡ giáo viên ghi audit (ai thao tác, buổi nào, người được gán, lý do khi là thay giáo viên) và bắn thông báo cho người được gán; người được gán thấy buổi mới trong lịch của mình trước giờ dạy. (dương tính · R-D3-11, R-QDB-08)

**Truy vết:** R-D3-01, R-D3-05, R-D3-07, R-D3-08, R-D3-09, R-D3-10, R-D3-11, R-D8-04, R-D8-05, R-D8-06, R-D8-14, R-D4-11, R-D4-12, R-QDB-02, R-QDB-08, R-CONST-01

**Chặn bởi:** Câu 4 — nhân viên nghỉ việc có mất quyền không: chưa viết được tiêu chí cho trường hợp người đang là GV của buổi nghỉ việc (khác với hết hạn phân công, vốn đã chốt ở R-D3-07). Câu 11 — CLASS và ASSIGNED gộp hay tách: chưa viết được tiêu chí phân biệt 'GV của lớp' với 'GV được phân công buổi' khi hai phạm vi này chưa quyết gộp hay tách.

> **Ghi chú kiểm chứng (tình huống 4):** Bốn dẫn chứng hiện trạng mà ba story viện dẫn đã được mở code đối chiếu và đúng nguyên văn (app/(admin)/admin/curriculums/page.tsx:24 — đang gác đúng, phải khoá bằng test hồi quy; app/(admin)/admin/documents/page.tsx:325-332 — phát thẳng URL R2 công khai, ai giữ link thì đăng xuất hay cắt hợp đồng vẫn tải được; app/api/scorm/runtime/route.ts:89-129 — packageId và classSessionId là hai tham số rời không hề nối với nhau, và nếu thiếu buổi thì quyền rơi hết về training:manage; lib/teachers/center-filter.ts:32-43 — chỉ so centerId, không kiểm vai trò). Tuy vậy còn ba nhóm lỗi phải sửa trước khi trình Ban giám đốc: (1) mâu thuẫn giữa tiêu chí và phần "chặn bởi" — JS-04-01/TC6 và JS-04-02/TC6 đã chốt luôn thứ mà chính story khai là chưa có câu trả lời (câu 2 và câu 10); (2) bảy chỗ truy vết mượn mã gần đúng (R-D2-04, R-D6-08, R-D4-06 thay vì R-DP-07, R-QDB-02, R-QDB-08, R-D3-11, R-D8-02, R-DP-06); (3) kéo thêm phạm vi chưa có mã yêu cầu (luồng gửi yêu cầu bổ sung học liệu, màn nhật ký lượt xem cho quản lý, thông báo/lịch cho giáo viên được gán, nhãn chủ sở hữu trên Document trong khi model này chưa có trường sở hữu nào). Riêng JS-04-02/TC4 có rủi ro vận hành: thu hồi quyền đọc ẩn danh trên "mọi" tệp R2 sẽ chặn cả ảnh trang public, cần giới hạn theo tiền tố học liệu nội bộ. Xếp hạng độ chắc: JS-04-03 > JS-04-01 > JS-04-02. Thứ tự làm đề nghị: chặn tự-gán-giáo-viên trước (rẻ nhất, bịt đường leo thang), rồi nối packageId với buổi, cuối cùng là proxy tài liệu kèm thu hồi URL R2 trần.

---

## Tình huống 5 — Đối chiếu phí thương hiệu với bên nhận nhượng quyền

Tình huống này dễ sai ở chỗ phạm vi tính phí được suy ra từ quyền sở hữu chương trình, nên bên nhận chỉ cần tự soạn hoặc sao chép một chương trình mang tên mình rồi gán lớp vào là toàn bộ lớp rơi ra ngoài phạm vi và phí về gần 0 — bảng vẫn chạy đúng kỹ thuật nhưng số tiền sai bản chất. Sai thứ hai là dựng ranh giới trong/ngoài phạm vi ở tầng giao diện thay vì chặn thật ở đường API và ở tầng truy vấn.

### TH5 · JS-01 · Bảng căn cứ tính phí thương hiệu một kỳ tháng, đối chiếu được với báo cáo bên nhận tự khai

**Bối cảnh người dùng:** Kế toán tổng hợp HO, mỗi đầu tháng đối chiếu phí thương hiệu của từng bên nhận (ví dụ CS-HN1). Hiện không có ranh giới trong/ngoài phạm vi nào trong hệ thống: người HO hoặc thấy toàn bộ (isHoLevel cấp ALL — lib/db-scope.ts:184, :218) hoặc không thấy gì.

**Job story:** Khi đến ngày chốt số kỳ tháng và bên nhận đã gửi báo cáo tự khai, tôi muốn mở đúng một bảng căn cứ tính phí do hệ thống dựng từ dữ liệu lớp thuộc chương trình của HO, để tôi có thể chỉ ra chênh lệch với con số họ khai mà không phải xin file Excel.

**Vì sao dễ sai:** LỖ HỔNG THƯƠNG MẠI: phạm vi tính phí suy ra từ quyền sở hữu chương trình, nên bên nhận chỉ cần tự soạn một chương trình mang tên mình rồi gán lớp vào là mọi lớp rơi ra ngoài phạm vi và phí về gần 0 — bảng vẫn chạy đúng kỹ thuật mà số phí sai bản chất. Thêm nữa Curriculum hiện KHÔNG có trường sở hữu nào (schema.prisma:2082-2105), nên chuỗi suy diễn đứt ở mắt cuối; và Receipt không mang đơn vị, Payment suy đơn vị 3 tầng về ACTOR, nên nếu dựng bảng trên dữ liệu hiện có sẽ ra số đẹp nhưng không đối chiếu được.

**Tiêu chí nghiệm thu:**

- [ ] ⏸ **(Dương tính · ĐANG TREO Câu 2 — không nghiệm thu được cho tới khi Ban chốt)** Bảng tách rõ **HAI con số khác nhau, tuyệt đối không gộp làm một**: (a) **phạm vi TÍNH PHÍ** = MỌI lớp chạy trong đơn vị của bên nhận trong kỳ, đi theo **hợp đồng**; (b) **khối được XEM CHI TIẾT** = các lớp giải được chương trình có chủ sở hữu là HO. Năm nhóm chi tiết (học phí đã thu, giảm giá, hoàn tiền, công nợ, điểm danh) chỉ mở cho khối (b); số dòng lớp của khối (b) bằng số lớp giải được chương trình có chủ sở hữu là HO trong kỳ đó. — R-D10-12 (`02-prd-franchise-platform.md:302`) `[đã sửa 28/07: bản trước đóng đinh "số dòng lớp trong bảng = số lớp có chủ sở hữu chương trình là HO", tức chốt PHÍ = phạm vi SỞ HỮU CHƯƠNG TRÌNH — ngược R-D10-12 và chính là lỗ hổng thương mại mà mục "Vì sao dễ sai" của story này đang cảnh báo. Ký PASS theo cách viết cũ là hợp thức hoá đúng đường mất tiền]`
- [ ] (Dương tính) Mỗi dòng lớp hiển thị tên chương trình và đơn vị sở hữu chương trình, lấy từ trường sở hữu trên Curriculum. Người xem đọc được vì sao dòng đó vào bảng mà không phải hỏi ai.
- [ ] ⏸ **(Dương tính · ĐANG TREO Câu 2)** Bảng có ô **tổng căn cứ tính phí** của kỳ, lấy theo **phạm vi hợp đồng (a)** — KHÔNG lấy tổng của khối được xem chi tiết (b) — kèm tỉ lệ phí của hợp đồng đang hiệu lực trong kỳ và số phí phải trả suy ra. Sửa tỉ lệ phí chỉ đổi con số phí, không đổi một dòng dữ liệu chi tiết nào. `[đã sửa 28/07: bản trước lấy tổng của chính khối (b) làm căn cứ tính phí]`
- [ ] (Biên) **Đối chứng hai phạm vi:** số lớp trong phạm vi tính phí (a) **≥** số lớp trong khối được xem chi tiết (b); phần chênh không được lặng lẽ biến mất mà hiện thành **một dòng riêng có tên gọi** — "Lớp trong hợp đồng, ngoài quyền xem chi tiết" — kèm số lượng và tổng doanh thu tổng hợp. Chênh lệch tăng bất thường giữa hai kỳ là tín hiệu để rà lỗ hổng thương mại. — R-D10-12
- [ ] (Âm tính) **Bảng này KHÔNG phải chứng từ:** màn hình và tệp xuất ra mang nhãn "Số tham khảo — không phải chứng từ"; đếm số Đơn hàng, khoản thu và phiếu thu **trước và sau** khi mở, chốt kỳ và xuất bảng → không đổi một bản ghi nào; có bộ kiểm khẳng định không đường mã nào sinh chứng từ từ tỉ lệ phí. Đây là ranh giới với D11 (không hợp nhất kế toán), vốn nằm ngoài phạm vi. — R-D9-09 (`02-prd-franchise-platform.md:287`)
- [ ] (Biên) Lớp không giải được chương trình (thiếu liên kết khung chương trình) rơi vào mục Chưa phân loại, KHÔNG bị mặc định là trong phạm vi, và số lượng tồn đọng hiện ngay đầu bảng kèm nút xuất danh sách.
- [ ] (Biên) Bản ghi tiền thiếu đơn vị (Payment chỉ có centerId — schema.prisma:4941; Receipt không có trường đơn vị nào — :4954) hiện trong mục Cần chuẩn hoá kèm số lượng, không bị âm thầm gán vào kỳ đang đối chiếu.
- [ ] (Âm tính) Màn hình không có và không thể mở bất kỳ mục nào về lương nhân sự, chi phí mặt bằng, lợi nhuận ròng hay ngành nghề khác của bên nhận. Gọi thẳng API tài chính nội bộ của bên nhận bằng tài khoản HO trả HTTP 403.
- [ ] (Âm tính) Khi cờ tính năng còn tắt, hoặc khi grep isHoLevel ? "ALL" vẫn còn kết quả khác 0, màn hình chi tiết không mở được và hiện thông báo chặn nêu rõ điều kiện còn thiếu. Có test chứng minh tài khoản mang vai trò bất kỳ tại HO nhưng không có quyền xem chi tiết phạm vi nhượng quyền thì bị từ chối.
- [ ] (Dương tính) Mỗi lần chốt hoặc xuất bản đối chiếu ghi một dòng nhật ký gồm người thực hiện, kỳ, bên nhận, tổng căn cứ, tổng phí, và chữ ký kế toán. Xem lại được nguyên trạng bản đã chốt kỳ trước.

**Truy vết:** R-D10-02, R-D10-03, R-D10-04, R-D10-05, R-D10-06, R-D10-07, R-D10-08, R-D10-10, R-D10-12, R-D10-13, R-D8-01, R-D9-09, R-D4-09, R-D4-11, R-QDB-05, R-OPS-03, R-D2-05

**Chặn bởi:** Câu 2 — chưa chốt cách tính phí khi bên nhận tự soạn chương trình riêng, nên không viết được tiêu chí nghiệm thu cho số phí trong trường hợp đó. ⛔ **Tiêu chí 1 và 3 của story này ĐANG TREO Câu 2 — nghiệm thu viên KHÔNG được ký PASS cho tới khi Ban chốt phạm vi tính phí đi theo hợp đồng hay theo quyền sở hữu chương trình.** Câu 9 — chưa chốt bên nhận có được đặt học phí riêng không, nên không viết được tiêu chí đối chiếu đơn giá. Câu 5 — chưa chốt học bù đếm để báo cáo hay đối trừ tiền, nên tiêu chí nhóm điểm danh chỉ nghiệm thu được ở mức đếm buổi.

### TH5 · JS-02 · Ranh giới trong/ngoài phạm vi hiện rõ trên từng dòng, kèm lý do, và chặn thật ở đường API

**Bối cảnh người dùng:** Người xem là kế toán tổng hợp HO hoặc trưởng bộ phận HO phụ trách nhượng quyền, đang ngồi họp đối chiếu với bên nhận. Họ cần bảo vệ con số, đồng thời không được nhìn dữ liệu vận hành riêng của bên nhận.

**Job story:** Khi bên nhận phản đối con số phí và nói lớp đó không thuộc chương trình của HO, tôi muốn thấy trên từng dòng nhãn trong hay ngoài phạm vi kèm lý do sinh ra nhãn đó, để tôi có thể trả lời ngay tại cuộc họp thay vì hẹn kiểm tra lại.

**Vì sao dễ sai:** LỖ HỔNG THƯƠNG MẠI: vì nhãn phạm vi suy từ chủ sở hữu chương trình, bên nhận tự soạn một chương trình mang tên mình rồi gán lớp vào là toàn bộ lớp mang nhãn NGOÀI phạm vi một cách hợp lệ, phí về gần 0 mà không ai vi phạm quy tắc nào trong hệ thống. Sai kỹ thuật thường gặp thứ hai: cài ranh giới bằng cách lọc dữ liệu ở giao diện và trả mảng rỗng ở API, khiến việc gọi thẳng API bằng classId vẫn lộ dữ liệu hoặc lộ sự tồn tại của lớp; sai thứ ba là mở màn hình chi tiết khi isHoLevel còn cấp phạm vi toàn hệ thống (lib/db-scope.ts:184, :218), lúc đó nhãn ngoài phạm vi chỉ là trang trí.

**Tiêu chí nghiệm thu:**

- [ ] (Dương tính) Mỗi dòng lớp mang đúng một nhãn TRONG hoặc NGOÀI phạm vi kèm câu lý do đọc được, ví dụ lớp dùng chương trình X, chủ sở hữu HO hoặc chủ sở hữu CS-HN1. Nhãn và lý do do đúng một hàm quyết định phạm vi sinh ra, không có nhánh tính lại ở tầng giao diện.
- [ ] (Dương tính) Bật bộ lọc Chỉ ngoài phạm vi, người xem thấy số lớp và 5 chỉ số tổng hợp của khối ngoài phạm vi, đủ để chất vấn bên nhận mà không cần dữ liệu chi tiết.
- [ ] (Âm tính) Với lớp NGOÀI phạm vi, phần chi tiết không xuất hiện trên màn hình; gọi thẳng API chi tiết bằng classId của chính lớp đó trả HTTP 403 kèm mã lỗi, KHÔNG trả 200 với danh sách rỗng. Có case e2e khẳng định mã trạng thái, không chỉ khẳng định mảng rỗng.
- [ ] (Âm tính) Thân phản hồi của mọi endpoint ngoài phạm vi không chứa tên hay mã học viên, số điện thoại, tên lớp, tên giáo viên, mã đơn, mã phiếu thu, số tiền từng giao dịch. Test khẳng định trực tiếp trên chuỗi JSON trả về, không khẳng định qua giao diện.
- [ ] (Âm tính) Việc che trường nhạy cảm thực hiện ở tầng truy vấn: không có đường nào lấy được trường đã che qua include lồng hay qua endpoint khác của cùng dữ liệu. Có test đi đường include lồng và bị chặn.
- [ ] (Biên) Lớp đổi chương trình giữa kỳ được tách thành hai phần theo mốc thời gian, mỗi phần mang nhãn phạm vi riêng. Nếu không tách được thì cả lớp rơi vào Chưa phân loại (fail-closed), tuyệt đối không mặc định vào trong phạm vi.
- [ ] (Dương tính) Mỗi lượt mở chi tiết một lớp trong phạm vi ghi một dòng nhật ký gồm người xem, lớp, thời điểm; nhật ký này xuất được ra file khi bên nhận yêu cầu kiểm chứng ai đã xem dữ liệu của họ.
- [ ] (Âm tính) Tài khoản mang vai trò bất kỳ tại HO nhưng không được cấp quyền xem chi tiết phạm vi nhượng quyền không mở được màn hình chi tiết, kể cả khi tài khoản đó vốn thấy mọi cơ sở qua cờ HO. Test này phải xanh trước khi cờ tính năng được bật.

**Truy vết:** R-D10-02, R-D10-03, R-D10-04, R-D10-05, R-D10-10, R-D10-13, R-D4-06, R-D4-09, R-D4-11, R-D4-13, R-D8-11, R-DP-07, R-QDB-05, R-OPS-02, R-OPS-03

**Chặn bởi:** Câu 2 — chưa chốt cách tính phí khi bên nhận tự soạn chương trình, nên không viết được tiêu chí về hành vi hệ thống khi phát hiện chuyển hàng loạt lớp sang chương trình mới. Câu 10 — chưa chốt log mỗi lượt xem là mỗi lượt mở gói hay mỗi tài nguyên con, nên tiêu chí nhật ký chỉ nghiệm thu được ở mức mở chi tiết lớp. Câu 3 — chưa chốt thời gian chuyển tiếp và phạm vi dữ liệu của chính mình, nên chưa viết được tiêu chí xem lại sau khi cắt hợp đồng.

### TH5 · JS-03 · Bản sao chương trình luôn khai được nguồn gốc, không rửa được quyền sở hữu

**Bối cảnh người dùng:** Người dùng là Đào tạo HO hoặc kế toán tổng hợp HO khi rà soát vì sao số lớp ngoài phạm vi tăng đột biến trong kỳ. Hiện tại chức năng sao chép chương trình chưa tồn tại trong repo (chỉ có nhân bản biểu mẫu đánh giá), và Curriculum không có trường sở hữu lẫn trường nguồn gốc.

**Job story:** Khi một bên nhận tạo chương trình riêng bằng cách sao từ chương trình của HO rồi đổi tên, tôi muốn hệ thống giữ và hiển thị chuỗi nguồn gốc của bản sao, để tôi có thể nêu bằng chứng khi đối chiếu phí thay vì tranh cãi bằng cảm tính.

**Vì sao dễ sai:** Đây chính là đường đi của lỗ hổng thương mại ở dạng dễ nhất: sao chương trình HO, đổi tên và đổi chủ sở hữu, gán lớp vào, thế là mọi lớp hợp lệ rơi ra ngoài phạm vi và phí về gần 0. Rất dễ làm sai vì chức năng sao chép chưa tồn tại nên đội sẽ dựng mới bằng cách nhân bản bản ghi cho nhanh, mà bản ghi nhân bản mặc định không mang trường nguồn gốc (Curriculum hiện không có cả trường sở hữu lẫn trường nguồn — prisma/schema.prisma:2082-2105); một khi đã tạo bản sao trắng thì không có cách nào truy lại nguồn gốc về sau.

**Tiêu chí nghiệm thu:**

- [ ] (Dương tính) Tạo bản sao từ một chương trình của HO, bản sao lưu bắt buộc: id chương trình nguồn, đơn vị sở hữu của chương trình nguồn tại thời điểm sao, người tạo và thời điểm. Bốn trường này không sửa và không xoá được qua bất kỳ màn hình nào.
- [ ] (Dương tính) Trên bảng đối chiếu, lớp dùng bản sao vẫn hiển thị dòng nguồn gốc dạng phái sinh từ chương trình HO tên X, đứng cạnh nhãn phạm vi, nên người xem thấy ngay lý do nghi vấn.
- [ ] (Âm tính) Tài khoản thuộc bên nhận bấm sửa nội dung chương trình gốc của HO bị từ chối kèm thông báo nêu chủ sở hữu; cố tạo bản sao mà đặt đơn vị sở hữu bằng HO cũng bị từ chối ở tầng máy chủ, không chỉ ẩn nút.
- [ ] (Biên) Sao nhiều tầng (bản sao của bản sao) vẫn truy được về chương trình gốc của HO; màn hình hiện đủ chuỗi và không đứt ở tầng thứ hai. Có test dựng chuỗi 3 tầng.
- [ ] (Âm tính) Mỗi lần tạo bản sao ghi audit kèm lý do bắt buộc do người tạo nhập; thiếu lý do thì không tạo được.
- [ ] (Âm tính) Có bản sao KHÔNG đồng nghĩa được xem nội dung: giáo viên bên nhận vẫn phải đủ cả 4 điều kiện (đang giữ vai trò giảng dạy, được thêm vào một lớp cụ thể, lớp đó dùng đúng chương trình này, buổi đã tới cửa sổ mở khoá) mới mở được nội dung một buổi. Thiếu bất kỳ điều kiện nào thì bị từ chối.
- [ ] (Dương tính) Khi cắt hợp đồng nhượng quyền, bản sao vẫn giữ nguyên chuỗi nguồn gốc để đối chiếu các kỳ đã qua, nhưng mọi quyền ghi lên bản sao mất trong cùng một thao tác cắt.
- [ ] (Biên) Hệ thống KHÔNG tự quyết tỉ lệ phí cho lớp dùng bản sao: những lớp này vào một mục riêng Cần quyết định thương mại kèm số lượng và tổng doanh thu tổng hợp, chờ người có thẩm quyền phân loại. Không có nhánh code nào tự gán chúng vào trong hoặc ngoài phạm vi.

**Truy vết:** R-D10-11, R-D10-12, R-D10-13, R-D10-02, R-D8-01, R-D8-02, R-D8-03, R-D8-04, R-D8-05, R-D8-06, R-D8-07, R-D8-14, R-D9-04, R-D9-05, R-D9-05b, R-D3-01, R-D2-03, R-D2-05

**Chặn bởi:** Câu 2 — chưa chốt bên nhận tự soạn hoặc sao chương trình riêng thì tính phí thế nào, nên tiêu chí về số phí của lớp dùng bản sao chỉ viết được ở mức đưa vào mục chờ quyết định, không viết được công thức. Câu 13 — chưa chốt điều khoản hợp đồng nào phải kiểm được bằng máy, nên chưa viết được tiêu chí hệ thống tự cảnh báo khi tỉ lệ lớp dùng bản sao vượt ngưỡng.

> **Ghi chú kiểm chứng (tình huống 5):** Đã đọc trực tiếp mã nguồn, không dựa trí nhớ. (1) Chức năng sao chép chương trình CHƯA TỒN TẠI — grep nhân bản/duplicate/clone/copy chỉ ra biểu mẫu đánh giá (app/(admin)/admin/evaluations/_actions.ts, lib/eval/forms.ts); thư mục app/(admin)/admin/curriculums không có kết quả nào. Vậy JS-03 nói về một đường đi chưa có: chặn từ gốc lúc dựng thì rẻ hơn vá sau, nhưng KHÔNG được trình bày với BGĐ như thể rò rỉ đang xảy ra. (2) Curriculum không có trường sở hữu lẫn trường nguồn gốc (prisma/schema.prisma:2082-2105) — chuỗi suy diễn đứt ở mắt cuối. (3) Receipt không có centerId lẫn orgUnitId (schema.prisma:4954-4970), nặng hơn Payment (chỉ centerId, :4941), trong khi Order có cả hai (:3107-3109) — ba mức khác nhau trên cùng một chuỗi tiền. (4) Class.curriculumId là nullable (:1309) nên lớp không giải được chương trình là mặc định của dữ liệu cũ, tiêu chí fail-closed vào Chưa phân loại là bắt buộc. (5) isHoLevel ? "ALL" vẫn còn sống tại lib/db-scope.ts:184 và :218, nên tiêu chí âm tính (d) của cả JS-01 và JS-02 hiện đang FAIL trên nhánh main — đúng hiện trạng, không phải lỗi viết. Mâu thuẫn cần BGĐ biết: tiêu chí 3 của JS-01 giả định hợp đồng có tỉ lệ phí hiệu lực theo kỳ nhưng model FranchiseContract chưa tồn tại, chỉ nghiệm thu được sau R-D9-01; PRD tách R-D10-12 (phạm vi TÍNH PHÍ khác phạm vi XEM CHI TIẾT) nên JS-02 cho thấy chỉ số tổng hợp của khối ngoài phạm vi mà không cho xem chi tiết — nếu BGĐ muốn gộp làm một phạm vi thì phải viết lại JS-02 tiêu chí 2. Thứ chưa viết được: tiêu chí về số phí cụ thể (câu 2 chưa trả lời — đây là điểm chặn nặng nhất của cả tình huống), tiêu chí nhật ký ở mức tài nguyên con (câu 10), tiêu chí xem lại dữ liệu sau khi cắt hợp đồng (câu 3), tiêu chí đối chiếu đơn giá (câu 9 — thêm nữa học phí hiện là toàn cục, Course.price / CoursePackage.price không mang centerId lẫn orgUnitId, nên còn cần R-D6-14 mở nhóm khoá giá/thuế/tiền tệ trước).

---

## Tình huống 6 — Cắt quyền khi hợp đồng nhượng quyền hết hạn hoặc chấm dứt

Chỗ dễ sai nhất của tình huống này là tưởng "cắt quyền" bằng cách hạ vai trò trong bảng phân quyền là đủ: quyền hành động hiện đang thi hành bằng ma trận tĩnh theo tài khoản, nên hạ vai trò chỉ làm mất tầm nhìn dữ liệu chứ không chặn được đường ghi, và người đang đăng nhập sẵn vẫn thao tác bình thường cho tới khi phiên hết hạn. Đi kèm là hai rủi ro vận hành: chưa có cách truy "quyền này sinh ra từ hợp đồng nào", và chế độ chỉ đọc trong thời gian chuyển tiếp nếu chỉ đổi tên vai trò thì sẽ nghiệm thu đạt trên môi trường thử nhưng thủng trên thật.

### TH6 · JS-06-01 · Hợp đồng qua ngày hết hạn thì quyền tự rụng, không ai phải nhớ

**Bối cảnh người dùng:** Người phụ trách vận hành hệ thống ở HO (SUPER_ADMIN hoặc admin HO). Đang quản nhiều hợp đồng nhượng quyền có ngày hết hạn khác nhau; hiện không có bất kỳ cơ chế nhắc nào và cũng không có trường nào nối quyền nào sinh ra từ hợp đồng nào (derivedFrom = 0 hit toàn repo).

**Job story:** Khi một hợp đồng nhượng quyền chạm ngày hết hạn mà không ai ở HO nhớ ra, tôi muốn hệ thống tự phát hiện trong đêm và cắt sạch quyền sinh ra từ hợp đồng đó, để không còn ngày nào cơ sở hết hợp đồng vẫn ghi được dữ liệu vào hệ thống.

**Vì sao dễ sai:** Ai cũng nghĩ cắt quyền là hạ UserOrgRole xuống EXPIRED. Nhưng quyền hành động đang thi hành bằng ma trận tĩnh theo User.roles, nên hạ UserOrgRole chỉ làm mất tầm nhìn dữ liệu, không làm mất quyền ghi; người đang đăng nhập sẵn vẫn ghi bình thường tới khi JWT hết hạn 30 ngày.

**Tiêu chí nghiệm thu:**

- [ ] **[Dương tính]** Tác vụ nền chạy hằng ngày, quét mọi hợp đồng nhượng quyền có ngày hết hạn đã trôi qua và còn đang hiệu lực; nhật ký mỗi lần chạy liệt kê mã hợp đồng, số tài khoản và số quyền bị cắt.
- [ ] **[Dương tính]** Sau khi tác vụ chạy xong, đếm bằng truy vấn: số bản ghi phân quyền còn hiệu lực mà nguồn là hợp đồng đã hết hạn = 0. Việc hạ quyền và việc đổi trạng thái hợp đồng nằm trong CÙNG một giao dịch, không có trạng thái nửa vời.
- [ ] **[Dương tính]** Trong cùng giao dịch đó, số phiên bản phiên đăng nhập (tokenVersion) của mỗi tài khoản bị cắt tăng lên 1.
- [ ] **[Âm tính]** Người của bên nhận đang mở sẵn màn hình, không đăng xuất: thao tác GHI kế tiếp (ví dụ lưu điểm danh) bị TỪ CHỐI ngay và không có bản ghi nào vào cơ sở dữ liệu. Nghiệm thu phải kiểm cả hai: tokenVersion đã tăng VÀ đường ghi thực sự bị chặn, vì hiện cổng kiểm phiên sống chỉ được gọi ở một số route nhạy cảm (lib/auth/live-session.ts:7-14).
- [ ] **[Biên]** Hợp đồng không đặt ngày hết hạn (vô thời hạn) không bị tác vụ đụng tới: sau khi chạy, số quyền của các cơ sở đó không đổi một đơn vị nào.
- [ ] **[Biên]** Chạy lại tác vụ lần thứ hai trong cùng ngày không sinh thêm dòng audit nào và không tăng tokenVersion thêm lần nữa.
- [ ] **[Dương tính]** Cắt 20 quyền sinh ra ĐÚNG 1 dòng audit gộp, do hệ thống đứng tên (người thao tác để trống = Hệ thống), có mã hợp đồng, số quyền bị cắt, số tài khoản ảnh hưởng và lý do "hết hạn hợp đồng". Không phải 20 dòng.
- [ ] **[Dương tính]** Ngay sau khi cắt, thông báo gửi tới admin HO và đầu mối bên nhận, nói rõ hợp đồng nào, cắt lúc nào, bao nhiêu tài khoản bị ảnh hưởng và từ giờ còn làm được gì.

**Truy vết:** R-D9-01, R-D9-04, R-D9-05, R-D9-05b, R-D9-06, R-D9-12, R-D3-01, R-D3-07, R-D3-08, R-D4-11, R-OPS-02, R-OPS-04, R-QDB-08

**Chặn bởi:** Câu 3 — chưa chốt độ dài thời gian chuyển tiếp, nên thông báo cắt quyền KHÔNG viết được tiêu chí "nêu rõ ngày hết chế độ chỉ đọc". Tiêu chí 8 vì vậy chỉ yêu cầu nêu hiện trạng, chưa yêu cầu nêu ngày khoá hẳn.

### TH6 · JS-06-02 · Chấm dứt hợp đồng trước hạn bằng một thao tác, có lý do, không sót ai

**Bối cảnh người dùng:** Người phụ trách hợp đồng nhượng quyền ở HO, nhận quyết định chấm dứt sớm và phải thực thi ngay trong giờ làm việc, khi nhân viên bên nhận vẫn đang đăng nhập và đang thao tác.

**Job story:** Khi ban giám đốc quyết định chấm dứt sớm một hợp đồng nhượng quyền và yêu cầu chặn trong ngày, tôi muốn cắt toàn bộ quyền của cơ sở đó bằng một thao tác có bắt nhập lý do, để không phải rà từng tài khoản và không bỏ sót người nào còn ghi được dữ liệu.

**Vì sao dễ sai:** Cắt "một thao tác" dễ bị hiểu là làm nhiều bước nhanh. Nếu không nằm trong một giao dịch thì cắt nửa chừng sẽ để lại tài khoản còn quyền; và nếu chỉ ghi audit theo từng bản ghi thì 20 quyền ra 20 dòng, không ai đọc nổi đã cắt đúng một hợp đồng hay hai.

**Tiêu chí nghiệm thu:**

- [ ] **[Dương tính]** Màn quản lý hợp đồng có thao tác "chấm dứt hợp đồng"; trước khi xác nhận, màn hình hiện số tài khoản và số quyền sẽ bị cắt, kèm danh sách tên để người thao tác đối chiếu.
- [ ] **[Âm tính]** Bỏ trống ô lý do thì thao tác bị TỪ CHỐI: không hợp đồng nào đổi trạng thái, không quyền nào bị hạ, không dòng audit nào được tạo.
- [ ] **[Dương tính]** Bấm xác nhận một lần: toàn bộ quyền sinh ra từ hợp đồng đó hết hiệu lực trong CÙNG một giao dịch cùng với việc đổi trạng thái hợp đồng. Đếm lại sau thao tác: 0 quyền còn hiệu lực.
- [ ] **[Dương tính]** Cắt 20 quyền sinh ra ĐÚNG 1 dòng audit gộp: tên người thao tác, mã hợp đồng, con số 20, danh sách mã quyền ở phần chi tiết, lý do người dùng nhập nguyên văn, thời điểm. Đếm số dòng audit của thao tác = 1.
- [ ] **[Âm tính]** Nhân viên bên nhận đang đăng nhập sẵn, không đăng xuất: thao tác GHI kế tiếp bị TỪ CHỐI ngay trong vòng một lần bấm, không phải chờ hết phiên. Kiểm cả hai mặt: số phiên bản phiên tăng 1 VÀ thử ghi thật bị chặn.
- [ ] **[Biên]** Nếu một phần thao tác thất bại (ví dụ một tài khoản đã bị khoá từ trước), toàn bộ bị hoàn tác: hợp đồng vẫn ở trạng thái cũ, quyền vẫn nguyên, màn hình báo rõ tài khoản nào gây lỗi.
- [ ] **[Âm tính]** Người không thuộc đội phụ trách hợp đồng ở HO — kể cả quản lý của chính cơ sở nhượng quyền đó — mở màn hợp đồng thì không thấy thao tác chấm dứt; gọi thẳng vào chức năng chấm dứt cũng bị TỪ CHỐI.
- [ ] **[Dương tính]** Sau khi cắt, xuất được một bản chụp "ai mất quyền gì" theo hợp đồng để đối chiếu với quyết định chấm dứt.

**Truy vết:** R-D9-03, R-D9-05, R-D9-05b, R-D9-08, R-D3-01, R-D3-02, R-D4-11, R-D8-03, R-QDB-08, R-OPS-02, R-OPS-04, R-DP-07

**Chặn bởi:** Câu 12 — chưa chốt ai được TẠM NGƯNG hợp đồng. Vì vậy story này chỉ viết được tiêu chí cho hành vi CHẤM DỨT; trạng thái tạm ngưng và bảng 3 trạng thái × 3 nhóm quyền (R-D9-10) chưa có tiêu chí nghiệm thu. Câu 13 — chưa chốt điều khoản nào phải kiểm được, nên không viết được tiêu chí "hệ thống tự đề xuất chấm dứt khi vi phạm".

### TH6 · JS-06-03 · Hết hợp đồng vẫn trả lời được phụ huynh: đọc dữ liệu của chính mình, không ghi được gì

**Bối cảnh người dùng:** Người phụ trách ở cơ sở nhượng quyền (quản lý cơ sở hoặc kế toán cơ sở) ngay sau khi hợp đồng bị cắt. Còn học viên đang học, còn công nợ chưa chốt, nhưng mọi quyền ghi đã bị thu.

**Job story:** Khi hợp đồng của cơ sở tôi vừa bị chấm dứt mà học viên còn đang học nốt và phụ huynh vẫn gọi hỏi, tôi muốn vẫn mở được hồ sơ học viên và sổ sách của chính cơ sở mình, để tôi trả lời và chốt sổ mà không phải xin HO từng file.

**Vì sao dễ sai:** Dễ bị làm bằng cách đổi vai trò người dùng sang một vai trò "chỉ đọc". Nhưng quyền hành động đang thi hành bằng ma trận tĩnh, không theo vai trò động, nên đổi vai trò có thể không chặn được một dòng ghi nào. Chế độ chỉ đọc phải được ép ở cổng chặn GHI, không được dựa vào việc đổi tên vai trò.

**Tiêu chí nghiệm thu:**

- [ ] **[Dương tính]** Sau khi hợp đồng bị cắt, người của bên nhận vẫn đăng nhập được và thấy băng thông báo cố định trên đầu màn hình: "Hợp đồng đã chấm dứt — chế độ chỉ đọc", kèm thời điểm chấm dứt.
- [ ] **[Dương tính]** Danh sách học viên, lớp, buổi học và điểm danh **THUỘC ĐÚNG ĐƠN VỊ CỦA CHÍNH CƠ SỞ NHẬN NHƯỢNG QUYỀN** vẫn mở được và nội dung không khác gì trước khi cắt. (R-D9-06 — `02-prd-franchise-platform.md:284`: "đọc được danh sách học viên **cơ sở mình**") `[đã sửa 28/07: bản trước ghi "đơn vị của HO" — đảo chiều nhượng quyền, đọc đúng câu chữ là MỞ RỘNG tầm nhìn của bên nhận sang đơn vị nhượng quyền]`
- [ ] **[Âm tính]** Mọi thao tác tạo mới, sửa, xoá đều bị TỪ CHỐI, không chỉ ẩn nút. Nghiệm thu **đo được**: BƯỚC 4 lập một phụ lục liệt kê đích danh danh sách hành động máy chủ của cơ sở đó (tên hành động · nhóm xem/tạo/sửa/xoá); bộ kiểm chạy **đủ** danh sách trong phụ lục — nhóm xem đi qua, ba nhóm tạo/sửa/xoá trả về từ chối và không có bản ghi nào đổi; số hành động đã chạy = số hành động trong phụ lục. `[đã sửa 28/07: "quét toàn bộ chức năng" không nghiệm thu được vì tập chức năng chưa ai liệt kê]`
- [ ] **[Âm tính]** Mở dữ liệu của **đơn vị HO** trả đúng mã lỗi từ chối y hệt trước khi cắt; mở dữ liệu của bất kỳ đơn vị nào khác — cơ sở khác cùng khối vùng, cơ sở nhượng quyền khác — cũng bị TỪ CHỐI y hệt. Chế độ chỉ đọc **không làm rộng tầm nhìn một dòng nào**; nghiệm thu bằng cách so tập bản ghi đọc được trước và sau khi cắt, chênh lệch chỉ được phép theo chiều THU HẸP.
- [ ] **[Âm tính]** Nội dung chương trình dạy và học liệu thuộc HO KHÔNG mở được trong chế độ chỉ đọc, kể cả với người còn giữ vai trò giáo viên và còn tên trong lớp.
- [ ] **[Dương tính]** Mọi lượt xem trong chế độ chỉ đọc đều ghi lại được: ai xem, xem bản ghi nào, lúc nào; HO xuất được nhật ký này theo đơn vị.
- [ ] **[Biên]** Khi thời gian chuyển tiếp kết thúc, tác vụ nền hạ nốt quyền chỉ đọc: người dùng vẫn đăng nhập được nhưng không còn màn dữ liệu nào mở được, và sinh 1 dòng audit gộp cho lần hạ này.
- [ ] **[Biên]** Bản ghi được tạo trước thời điểm cắt nhưng đang ở trạng thái chờ duyệt (ví dụ phiếu thu chờ xác nhận) không bị tự động duyệt cũng không bị tự động huỷ; nó đứng yên và hiện rõ trạng thái "đang chờ, không xử lý được trong chế độ chỉ đọc".

**Truy vết:** R-D9-06, R-D9-10, R-D9-11, R-D3-08, R-D4-01, R-D4-09, R-D4-11, R-D8-02, R-D8-03, R-D8-07, R-D8-11, R-QDB-07, R-DP-07, R-OPS-02

**Chặn bởi:** Câu 3 — hai chỗ. (1) Chưa chốt độ dài thời gian chuyển tiếp nên tiêu chí 1 chỉ ghi được thời điểm chấm dứt, không ghi được ngày hết chế độ chỉ đọc; tiêu chí biên 7 chỉ tả được cơ chế, không đạt được con số ngày. (2) Chưa chốt "dữ liệu của chính mình" gồm những nhóm nào, nên tiêu chí 2 chỉ dám liệt kê hồ sơ học viên / lớp / điểm danh; chưa dám khẳng định có gồm chứng từ tài chính, hợp đồng học phí hay ảnh học viên.

### TH6 · JS-06-04 · Lấy được gói bàn giao trước ngày khoá hẳn để còn chứng từ mà xuất trình

**Bối cảnh người dùng:** Kế toán hoặc người đại diện pháp nhân của cơ sở nhượng quyền, trong thời gian chuyển tiếp. Họ là một pháp nhân riêng, có nghĩa vụ lưu chứng từ độc lập với HO, và sau ngày khoá sẽ không còn đường vào hệ thống.

**Job story:** Khi cơ sở tôi sắp bị khoá hẳn sau thời gian chuyển tiếp mà luật kế toán vẫn bắt tôi lưu chứng từ nhiều năm, tôi muốn tải về một gói bàn giao đầy đủ dữ liệu của chính cơ sở mình trước ngày khoá, để sau này có đoàn kiểm tra tôi vẫn xuất trình được.

**Vì sao dễ sai:** Rất dễ xuất "tất cả dữ liệu của cơ sở" bằng một câu truy vấn theo mã cơ sở — và kéo theo cả nội dung chương trình dạy thuộc HO, học liệu, tài liệu nội bộ. Đó là chính thứ mà D8 cấm. Ngược lại nếu cắt quá tay thì họ mất chứng từ kế toán của chính mình.

**Tiêu chí nghiệm thu:**

- [ ] **[Dương tính]** Ngay khi hợp đồng chuyển sang trạng thái chấm dứt, hệ thống tạo yêu cầu gói bàn giao cho đơn vị đó và hiện thao tác tải trên màn hình của họ, không cần mở phiếu yêu cầu thủ công.
- [ ] **[Dương tính]** Gói chứa đúng dữ liệu của ĐÚNG một đơn vị đó, ở định dạng đọc được không cần hệ thống (bảng tính hoặc PDF), kèm một bản kê khai liệt kê từng nhóm và số dòng mỗi nhóm để đối chiếu.
- [ ] **[Dương tính]** Chứng từ trong gói mang pháp nhân của bên đã phát hành chứng từ đó tại thời điểm phát hành, không bị đổi thành pháp nhân HO khi kết xuất.
- [ ] **[Âm tính]** Gói KHÔNG chứa nội dung chương trình dạy, học liệu, tài liệu nội bộ thuộc HO. Nghiệm thu bằng bản kê khai: số tệp thuộc các nhóm này = 0, kèm bộ kiểm khẳng định điều đó.
- [ ] **[Âm tính]** Đường dẫn tải gói có **hiệu lực cấu hình được, mặc định 15 phút**; nghiệm thu bằng **tải ở phút 14 thành công và tải ở phút 16 bị TỪ CHỐI**. Đường dẫn chỉ mở được bằng phiên đăng nhập của người thuộc đúng đơn vị đó; đưa đường dẫn cho người ngoài thì bị TỪ CHỐI. `[đã sửa 28/07: "một khoảng ngắn" không nghiệm thu được — nghiệm thu viên sẽ ký PASS bằng cảm tính. Con số mặc định 15 phút đề nghị Ban xác nhận, xem câu (b2)]`
- [ ] **[Dương tính]** Mỗi lần tạo gói và mỗi lần tải ghi 1 dòng audit (ai, đơn vị nào, lúc nào, dung lượng, bản kê khai kèm theo) và gửi thông báo cho admin HO.
- [ ] **[Biên]** Gói lớn chưa kết xuất xong thì hiện trạng thái và tiến độ; bấm tạo lần hai khi lần một chưa xong không sinh hai gói trùng, chỉ trở về gói đang chạy.
- [ ] **[Âm tính]** Sau ngày khoá hẳn, mở lại đường dẫn cũ bị TỪ CHỐI; màn hình chỉ rõ phải gửi yêu cầu tới HO, không để người dùng tưởng file đã mất.

**Truy vết:** R-D9-06, R-D9-11, R-D8-01, R-D8-03, R-D8-09, R-D8-11, R-D4-11, R-DP-04, R-DP-06, R-DP-07, R-OPS-02, R-OPS-03, R-OPS-04, R-OPS-11, R-OPS-12

**Chặn bởi:** Câu 3 — hai chỗ. (1) "Dữ liệu của chính mình" chưa chốt phạm vi nên tiêu chí 2 không liệt kê được danh sách nhóm dữ liệu chốt của gói; hiện chỉ nêu được yêu cầu về định dạng và bản kê khai. (2) Chưa chốt độ dài thời gian chuyển tiếp nên tiêu chí 8 không đạt được mốc ngày cụ thể. Ngoài ra R-DP-03 (thời hạn lưu theo đơn vị) chưa chốt nên không viết được tiêu chí "gói đủ để thay thế nghĩa vụ lưu chứng từ", chỉ viết được "đủ để đối chiếu".

> **Ghi chú kiểm chứng (tình huống 6):** Cả 4 story đúng định dạng job story, không bịa mã R-*, không dùng "franchise" trần, và khẳng định hiện trạng duy nhất nằm ngoài chỉ số yêu cầu — cổng kiểm phiên sống chỉ được gọi ở 3 route nhạy cảm (`lib/auth/live-session.ts:24`, chú thích dòng 7-14; call-site: `app/api/admin/leads/export/route.ts:26`, `app/api/admin/crm/commission-export/route.ts:17`, `app/api/admin/cham-cong/shift-export/route.ts:19`) — đã kiểm chứng trực tiếp trên repo và ĐÚNG; **hai lỗi phải sửa trước khi trình BGĐ:** (1) JS-06-03 tiêu chí 2 nhầm chiều bên nhượng quyền – bên nhận nhượng quyền, viết thành cho bên nhận đọc dữ liệu của đơn vị HO (phải sửa thành "đúng đơn vị của chính cơ sở nhận nhượng quyền"), (2) JS-06-04 tiêu chí 5 dùng "một khoảng ngắn" không đo được, không có câu hỏi chưa chốt nào biện minh (đề xuất: hiệu lực cấu hình được, mặc định 15 phút, thử ở phút 14 tải được / phút 16 bị từ chối); **các lỗi còn lại:** JS-06-01 tiêu chí 1 và 6 mâu thuẫn về nhật ký khi chạy lại (phải tách "nhật ký lần chạy" khỏi "dòng audit cắt quyền"), JS-06-02 tiêu chí 6 lấy ví dụ hoàn tác gượng (tài khoản đã khoá không làm giao dịch thất bại), JS-06-02 tiêu chí 7 tự đặt ra nhóm "đội phụ trách hợp đồng ở HO" trong khi thẩm quyền chấm dứt cũng thuộc phần chưa chốt của Câu 12, JS-06-03 tiêu chí 6 thiếu khai báo chặn bởi Câu 10, và 8 chỗ truy vết lệch lĩnh vực (R-D9-12, R-QDB-08 ×2, R-D2-03, R-D8-03, R-D4-09, R-D9-11, R-OPS-04) phần lớn bắt nguồn từ **lỗ hổng PRD**: chưa có mã yêu cầu cho "mọi thao tác cắt quyền phải bắt lý do + sinh 1 dòng audit gộp" và cho "ghi log truy cập dữ liệu học viên trong chế độ chỉ đọc" — đề nghị bổ sung 2 mã này thay vì để story mượn mã khối DENY và khối D8; **mắt xích phải làm trước cả ba story cắt quyền:** `UserOrgRole` đã có effectiveFrom/effectiveTo/status (`schema.prisma:355-370`) nhưng KHÔNG có trường nối tới hợp đồng (`derivedFrom` = 0 hit toàn repo) nên hiện không truy được "quyền này sinh ra từ hợp đồng nào"; ngoài ra `RbacAuditLog.reason` đã bắt buộc (`schema.prisma:382`) nhưng bảng ghi 1 dòng/đối tượng nên "1 dòng audit gộp" là mô hình mới, hạ tầng tác vụ nền đã sẵn (15 route cron trong `app/api/cron/*`), và ba rủi ro phải trình BGĐ là: chế độ chỉ đọc phải ép ở cổng chặn GHI chứ không chỉ đổi vai trò (vì `RBAC_V2_ENABLED` còn OFF), phải chốt việc đếm cắt-quyền-nhượng-quyền vào hay loại khỏi cửa sổ so sánh RBAC đang chạy song song, và ba nguồn sự thật nhân sự (Employee.centerId + orgUnitId + EmployeeOrgAssignment) chưa gộp nên cắt quyền theo hợp đồng sẽ còn sót.

---

## Tình huống bổ sung — sáu đường ít ai đi hằng ngày (từ vòng phản biện)

Điểm chung của sáu tình huống dưới đây là chúng nằm ở các đường "ít ai đi hằng ngày" — buổi bù, chuyển học viên qua pháp nhân khác, yêu cầu xoá dữ liệu, đợt chuyển đổi tổ chức, giải thích quyền bị chặn, phiếu thu tại cơ sở nhượng quyền — nên rất dễ được coi là đã có, trong khi thực tế chưa ai đặc tả. Sai ở đây không báo lỗi ngay: dữ liệu vẫn ghi được, màn hình vẫn xanh, và hậu quả (vỡ số liệu cơ sở, chứng từ sai chủ thể, quyền bị mở rộng ngoài ý muốn) chỉ lộ ra sau nhiều tuần.

Sáu tình huống này không nằm trong danh sách gốc: chúng đến từ vòng phản biện — một lượt rà độc lập đối chiếu toàn bộ mã yêu cầu R-* với 20 job story đã viết, và chỉ ra những mã yêu cầu chưa có bất kỳ tình huống người dùng nào chạm tới.

### TH7 · JS-N1 · Buổi bù được xếp trong đúng cơ sở, ba lớp chặn cùng đồng ý mới cho qua

**Bối cảnh người dùng:** Giáo vụ / quản lý cơ sở đang mở màn /admin/hoc-bu sau khi phụ huynh báo vắng. Đây là việc làm hằng tuần, người làm không phải kỹ thuật.

**Job story:** Khi một học viên nghỉ buổi và tôi phải xếp buổi bù trong tuần này, tôi muốn hệ thống chỉ đưa ra buổi bù thuộc đúng đơn vị của lớp gốc, để tôi không vô tình xếp em sang cơ sở khác rồi vỡ điểm danh và vỡ số liệu của cả hai cơ sở.

**Vì sao dễ sai:** MakeupNeed.centerId đang nullable và makeupSessionId không có ràng buộc nào bắt buổi bù cùng cơ sở với lớp gốc (schema.prisma:4189-4213), nên mọi cách chặn ở giao diện đều bị vượt qua bằng một lời gọi trực tiếp; QĐ-C đòi tắt mặc định + fail-CLOSED + gỡ ngoại lệ CÙNG LÚC, chỉ làm một trong ba là coi như chưa bỏ.

**Tiêu chí nghiệm thu:**

- [ ] (Dương tính) Danh sách buổi bù gợi ý chỉ chứa buổi thuộc đơn vị của lớp gốc: đếm trên dữ liệu thật, 100% dòng gợi ý có đơn vị trùng đơn vị lớp gốc, 0 dòng khác đơn vị. — Truy vết: R-QDC-01, R-QDC-05
- [ ] (Âm tính) Gửi thẳng yêu cầu xếp bù (không qua giao diện) với mã buổi thuộc cơ sở khác thì bị TỪ CHỐI: bản ghi nhu cầu bù không đổi trạng thái, không sinh liên kết buổi bù, và có một dòng nhật ký từ chối nêu đơn vị nguồn và đơn vị đích. — Truy vết: R-QDC-01, R-D4-11
- [ ] (Âm tính) Không giải được đơn vị của lớp gốc hoặc của buổi bù (thiếu đơn vị trên bản ghi) thì hệ thống TỪ CHỐI xếp bù chứ không mặc định cho qua; bản ghi đó vào danh sách cần chuẩn hoá và đếm được số lượng. — Truy vết: R-QDC-02, R-QDC-05
- [ ] (Dương tính) Khoá cấu hình học bù liên cơ sở **chỉ còn tồn tại để tương thích dữ liệu cũ**: mặc định TẮT ở mọi môi trường, đọc cờ khi chưa cấu hình gì cũng ra TẮT (có test đọc cờ trong môi trường trống), và khoá này **bị gỡ khỏi màn hình cấu hình cho người dùng cuối** để không ai gặp một công tắc bấm không có tác dụng. — Truy vết: R-QDC-01 `[làm rõ 28/07: tiêu chí 4 nói về MẶC ĐỊNH và về việc ẩn công tắc; tiêu chí 5 là tiêu chí CHỐNG HỒI QUY — hai việc khác nhau, không mâu thuẫn]`
- [ ] (Âm tính) Mọi lối ngoại lệ cho phép bù liên cơ sở bị GỠ khỏi mã: tìm toàn kho mã không còn nhánh nào cho qua khi hai đơn vị khác nhau; bật cờ lên mà không có nhánh ngoại lệ thì hành vi vẫn là từ chối — test dựng đủ tổ hợp (cờ bật/tắt) × (đơn vị trùng/lệch) và chỉ tổ hợp trùng đơn vị mới cho qua. — Truy vết: R-QDC-03, R-QDC-01, R-QDC-02
- [ ] (Dương tính) **Ca bù xử lý NGOÀI hệ thống — gồm cả ca học viên học bù tại cơ sở khác** — nhập được vào một chỗ ghi nhận; bản ghi mang **ĐỒNG THỜI đơn vị của lớp gốc và đơn vị nơi học bù**, kèm người ghi nhận, thời điểm, lý do; điểm danh buổi gốc chuyển sang trạng thái đã bù và truy ngược được về bản ghi thủ công đó. — Truy vết: R-QDC-04 `[đã sửa 28/07: bản trước định nghĩa ca thủ công là "học bù ở lớp khác CÙNG cơ sở". Sau QĐ-C, ca thủ công CHÍNH LÀ ca CHÉO cơ sở — vì khi đã gỡ thì không còn ca chéo nào đi qua hệ thống (QUYET-DINH.md:77). Viết như bản cũ là làm trượt đúng yêu cầu nghiệp vụ duy nhất mà QĐ-C sinh ra]`
- [ ] (Dương tính) Báo cáo buổi học của cơ sở tách riêng **bốn** con số: buổi chính khoá · buổi bù trong cơ sở · buổi bù thủ công nội bộ · **buổi bù thủ công chéo cơ sở**; bốn số cộng lại bằng tổng buổi đã dạy trong kỳ. Riêng nhóm chéo cơ sở phải **đếm được theo kỳ VÀ theo cặp cơ sở**, đúng điều kiện xong việc của R-QDC-04 (`02-prd-franchise-platform.md:314`) — không có con số theo cặp cơ sở thì câu hỏi (a2) "đếm để báo cáo hay để đối trừ tiền" mất luôn dữ liệu để trả lời. — Truy vết: R-QDC-05, R-QDC-04
- [ ] (Biên) Dữ liệu cũ đang có buổi bù liên cơ sở (nếu tồn tại) không bị xoá: chúng hiện trong một báo cáo tồn đọng kèm số lượng và đơn vị liên quan, và mọi thao tác sửa tiếp trên chúng bị chặn kèm lý do. — Truy vết: R-QDC-05, R-QDC-02

**Truy vết:** R-QDC-01, R-QDC-02, R-QDC-03, R-QDC-04, R-QDC-05, R-D4-11, R-D3-09, R-D10-04

**Chặn bởi:** Câu 5 — chưa chốt học bù đếm để báo cáo hay đối trừ tiền, nên không viết được tiêu chí nghiệm thu cho số liệu doanh thu / công nợ phát sinh từ buổi bù. Câu 7 — chưa chốt chuyển lớp qua ranh giới pháp nhân, nên không viết được tiêu chí cho ca học viên chuyển hẳn sang cơ sở khác pháp nhân rồi mới bù.

### TH7 · JS-N2 · Học viên chuyển sang cơ sở khác pháp nhân đi đúng đường bàn giao, không bị xé làm hai nơi

**Bối cảnh người dùng:** Giáo vụ cơ sở đang giữ hồ sơ học viên, nhận yêu cầu từ phụ huynh; đầu nhận là quản lý cơ sở nhượng quyền ở tỉnh khác, thuộc pháp nhân khác và dùng dải chứng từ khác.

**Job story:** Khi gia đình một học viên chuyển ra tỉnh khác và muốn học tiếp ở cơ sở nhượng quyền ngoài đó, tôi muốn hệ thống nhận ra đây là chuyển qua ranh giới pháp nhân và bắt đi đường bàn giao có duyệt hai phía, để tiền đã thu, số buổi còn lại và hồ sơ của em không nằm rải ở hai nơi.

**Vì sao dễ sai:** Đường chuyển lớp hiện có coi mọi cơ sở như nhau vì Center chưa có hồ sơ pháp nhân, Payment chỉ có centerId còn Receipt không có trường đơn vị nào — chuyển học viên qua pháp nhân khác bằng đường cũ sẽ âm thầm kéo dữ liệu tài chính sang sai chủ thể mà không ai thấy.

⚠️ **Cảnh báo đọc story này:** Câu 7 (`02-prd-franchise-platform.md:460`) đang treo với **hai đáp án đối lập** — **CẤM HẲN** chuyển học viên qua ranh giới pháp nhân, **hoặc** cho phép kèm điều kiện. Job story ở trên đã chốt sẵn đáp án thứ hai (đường bàn giao có duyệt hai phía). Vì vậy story được **tách làm hai phần**: phần A đúng dù Ban chọn đáp án nào; phần B chỉ có nghĩa nếu Ban chọn "cho phép có điều kiện" — chọn "cấm hẳn" thì toàn bộ phần B thành rác.

**Tiêu chí nghiệm thu:**

**Phần A — làm được ngay, KHÔNG phụ thuộc Câu 7 (đúng dù Ban chọn đáp án nào):**

- [ ] (Dương tính) Khi chọn lớp đích, màn hình hiện pháp nhân của đơn vị nguồn và đơn vị đích lấy từ hồ sơ pháp nhân của đơn vị; hai pháp nhân khác nhau thì gắn nhãn "chuyển qua ranh giới pháp nhân" trước khi có bất kỳ nút xác nhận nào. — Truy vết: R-D2-14, R-OPS-13
- [ ] (Âm tính) Đường chuyển lớp thông thường TỪ CHỐI khi đơn vị đích khác pháp nhân, kể cả khi gọi thẳng hành động máy chủ bỏ qua giao diện; thông báo chỉ rõ đây là ca phải xử lý riêng. Đây là phần **nhận diện và CHẶN**, đúng trong cả hai đáp án của Câu 7. — Truy vết: R-OPS-13, R-D4-11

**Phần B — ⏸ TREO TOÀN BỘ theo Câu 7. Không giao việc, không ước lượng, không nghiệm thu cho tới khi Ban trả lời:**

- [ ] ⏸ **Ràng buộc thi công cho cả phần B:** luồng duyệt hai phía **viết cứng bằng mã, KHÔNG đọc bước từ bảng cấu hình** — D12 (khuôn mẫu/luồng cấu hình được) nằm **ngoài phạm vi** theo QĐ-D (`QUYET-DINH.md:86`), và hệ đã có 8 luồng duyệt đi theo đơn vị (`QUYET-DINH.md:91`). Cùng khuôn với R-D6-12 (`02-prd-franchise-platform.md:206`). Không có dòng này, đội có thể dựng một bộ máy duyệt cấu hình được — đúng thứ đang hoãn.
- [ ] ⏸ (Dương tính) Đường bàn giao bắt buộc lý do và duyệt ở CẢ HAI phía; trước khi duyệt, màn hình hiện bảng: số buổi đã học, số buổi còn lại, số tiền đã thu, công nợ còn lại tại bên chuyển đi — bốn con số này đọc ra từ dữ liệu, không nhập tay. — Truy vết: R-OPS-13, R-D10-04
- [ ] ⏸ (Âm tính) Trước khi bàn giao được duyệt, tài khoản bên nhận KHÔNG đọc được hồ sơ học viên: mở bằng mã học viên trả mã lỗi từ chối, và thân phản hồi không chứa tên hay số điện thoại phụ huynh. — Truy vết: R-D4-11, R-DP-07
- [ ] ⏸ (Dương tính) Sau khi duyệt, học viên xuất hiện ở đơn vị đích và hồ sơ giữ chuỗi nguồn gốc đọc được (mã cũ + đơn vị cũ + ngày bàn giao); không sinh bản ghi học viên thứ hai — đếm theo mã học viên vẫn ra đúng một dòng. — Truy vết: R-OPS-13
- [ ] ⏸ (Âm tính) Chứng từ tài chính đã phát hành ở bên chuyển đi KHÔNG đổi đơn vị theo học viên: test khẳng định trường đơn vị của mọi phiếu thu và bản ghi tiền cũ không đổi sau bàn giao, kể cả sau khi chuẩn hoá đơn vị cho dữ liệu tiền. — Truy vết: R-D10-06, R-D10-07, R-OPS-13
- [ ] ⏸ (Biên) Đồng ý của phụ huynh được hỏi lại cho đơn vị mới và bản ghi đồng ý ghi rõ phạm vi đơn vị áp dụng; trước khi có đồng ý mới, ảnh và media của học viên không hiển thị ở đơn vị đích. — Truy vết: R-DP-05
- [ ] ⏸ (Biên) Bàn giao bị huỷ giữa chừng thì mọi thứ trở về nguyên trạng ở bên chuyển đi trong cùng một giao dịch: không tồn tại trạng thái học viên nằm ở cả hai đơn vị, đếm được bằng truy vấn một dòng. — Truy vết: R-OPS-13, R-D4-11

**Truy vết:** R-OPS-13, R-D2-13, R-D2-14, R-D10-06, R-D10-07, R-D4-11, R-DP-05, R-DP-07, R-D9-04, R-D6-12 (ràng buộc luồng duyệt viết cứng, thêm 28/07)

**Chặn bởi:** Câu 7 — ⛔ **chặn TOÀN BỘ phần B của story này, không chỉ phần tiền và chứng từ.** Nếu Ban chọn "cấm hẳn" thì sáu tiêu chí phần B bị bỏ, chỉ phần A còn giá trị `[đã sửa 28/07: bản trước chỉ khai Câu 7 chặn phần tiền và chứng từ, trong khi story đã chốt sẵn đáp án "cho phép có điều kiện" và đặc tả luôn cơ chế]`. Ngoài ra chưa viết được tiêu chí cho cách xử lý tiền đã thu (hoàn ở bên chuyển đi rồi thu lại bên nhận, hay ghi công nợ giữa hai pháp nhân) và cho chủ thể phát hành chứng từ sau chuyển. Câu 6 — chưa chốt cờ hạch toán có hệ quả nghiệp vụ gì, nên chưa viết được tiêu chí báo cáo hai bên sau khi chuyển. Câu 3 — chưa chốt "dữ liệu của chính mình" gồm gì, nên chưa viết được tiêu chí bên chuyển đi còn giữ và xem được những nhóm nào.

### TH7 · JS-N3 · Trả lời được yêu cầu xoá dữ liệu của phụ huynh trong hạn, không xoá nhầm chứng từ

**Bối cảnh người dùng:** Người phụ trách dữ liệu tại một cơ sở (có thể là cơ sở nhượng quyền pháp nhân khác) nhận đơn của phụ huynh; đầu kia là phụ huynh thao tác trên portal.

**Job story:** Khi một phụ huynh gửi yêu cầu xoá dữ liệu của con và tôi phải trả lời trong thời hạn, tôi muốn tra ra đủ nơi dữ liệu của em đang nằm rồi xử lý theo đúng phạm vi đơn vị của mình, để tôi trả lời có căn cứ mà không xoá nhầm chứng từ kế toán phải lưu.

**Vì sao dễ sai:** Toàn bộ nhánh dữ liệu cá nhân đang trắng: không có vai trò phụ trách dữ liệu theo đơn vị, StudentConsent không có trường phạm vi (schema.prisma:640-651), media R2 là URL công khai vĩnh viễn và khoá chia theo loại tệp chứ không theo cơ sở — làm nửa vời sẽ ra tình huống "đã xoá trên màn hình nhưng ảnh vẫn tải được bằng link cũ".

**Tiêu chí nghiệm thu:**

- [ ] (Dương tính) Từ hồ sơ học viên có một thao tác "tra dấu vết dữ liệu" liệt kê đủ nhóm: hồ sơ, điểm danh, bài làm, ảnh và media trên kho tệp, chứng từ tài chính, nhật ký truy cập — mỗi nhóm kèm số bản ghi và đơn vị đang giữ. — Truy vết: R-DP-07, R-DP-02
- [ ] (Dương tính) Yêu cầu của phụ huynh trở thành một bản ghi có ngày nhận, người tiếp nhận, đơn vị phụ trách, hạn trả lời, trạng thái; danh sách lọc được theo đơn vị và theo hạn, và mọi bước xử lý ghi audit. — Truy vết: R-DP-02, R-OPS-02
- [ ] (Âm tính) Người phụ trách dữ liệu của cơ sở A không mở được yêu cầu và không tra được dấu vết dữ liệu của học viên thuộc cơ sở B: gọi thẳng bằng mã học viên trả mã lỗi từ chối, không trả về danh sách rỗng. — Truy vết: R-D4-11, R-DP-02
- [ ] (Dương tính) Trên portal, phụ huynh chỉ thấy và chỉ gửi được yêu cầu cho chính con mình; quyết định cho phép đi qua ba bước tường minh dùng chung cho mọi màn portal: xác định chủ sở hữu bản ghi, so với người đăng nhập, chặn khi không khớp. — Truy vết: R-D4-02, R-D4-03, R-D4-04
- [ ] (Âm tính) Đổi tham số sang mã của học viên khác trên đường portal thì bị từ chối và ghi audit; mã học viên không xuất hiện trên URL portal. — Truy vết: R-D4-04, R-D4-11, R-OPS-02
- [ ] (Dương tính) Khi yêu cầu được chấp thuận, ảnh và media của học viên biến mất khỏi mọi màn (portal, lớp, trang công khai) và tệp trên kho không đọc được ẩn danh nữa: dán 10 URL cũ vào trình duyệt ẩn danh, 10/10 hỏng. — Truy vết: R-DP-06, R-DP-05
- [ ] (Âm tính) Chứng từ tài chính và các bản ghi buộc phải lưu KHÔNG bị xoá theo yêu cầu: hệ thống che dữ liệu cá nhân trên các bản ghi này ở tầng truy vấn (thân phản hồi không chứa trường đã che) và văn bản trả lời nêu rõ lý do giữ lại. — Truy vết: R-DP-03, R-D4-11
- [ ] (Biên) Phụ huynh rút đồng ý dùng hình ảnh thì việc sử dụng dừng ngay trong phạm vi đã ghi trên bản ghi đồng ý, kể cả nội dung đã đăng ở đơn vị khác trong cùng tập đoàn; bản ghi đồng ý lưu rõ đơn vị nào được dùng. — Truy vết: R-DP-05, R-DP-06

**Truy vết:** R-DP-01, R-DP-02, R-DP-03, R-DP-05, R-DP-06, R-DP-07, R-D4-02, R-D4-03, R-D4-04, R-D4-11, R-OPS-02

**Chặn bởi:** Câu 8 — chưa chốt vai trò theo pháp luật bảo vệ dữ liệu giữa FRANCHISOR và FRANCHISEE (ai là bên kiểm soát, ai là bên xử lý), nên chưa viết được tiêu chí ai ký quyết định xoá và ai đứng tên trả lời phụ huynh (R-DP-01). Chưa chốt thời hạn lưu theo đơn vị (R-DP-03), nên chưa viết được con số ngày trong tiêu chí giữ lại chứng từ. Câu 3 — chưa chốt "dữ liệu của chính mình", nên chưa viết được tiêu chí phần dữ liệu bên nhượng quyền còn giữ sau khi xoá.

### TH7 · JS-N4 · Hai cơ sở đang chạy và 23 tài khoản thật sang mô hình mới, sáng hôm sau không ai mất quyền

**Bối cảnh người dùng:** Người phụ trách vận hành hệ thống chạy đợt chuyển đổi ngoài giờ, có backup, cùng một người ở nghiệp vụ ngồi nghiệm thu ngay sau đó bằng một buổi dạy thật.

**Job story:** Khi tôi phải chuyển hai cơ sở đang vận hành và 23 tài khoản thật sang cây tổ chức mới trong lúc lớp vẫn dạy hằng ngày, tôi muốn chạy đợt chuyển đổi theo trình tự có kiểm tra và có đường quay lui đã diễn tập, để sáng hôm sau không ai mất quyền và không lớp nào mất dữ liệu.

**Vì sao dễ sai:** Dữ liệu hiện tại có ba nguồn sự thật cho nơi trực thuộc (Employee.centerId, Employee.orgUnitId, EmployeeOrgAssignment PRIMARY) và không có ràng buộc chống hai PRIMARY; seed cũ không ghi parentId nên cây chưa liền. Một đợt chuyển đổi "đoán cha" hoặc "tự chọn một PRIMARY" sẽ đẻ ra sai lệch quyền âm thầm, phát hiện được sau nhiều tuần.

**Tiêu chí nghiệm thu:**

- [ ] (Dương tính) Đợt chạy thử trên bản sao dữ liệu thật in ra bảng đối chiếu trước và sau: số cơ sở, số đơn vị, số tài khoản, số vai trò còn hiệu lực, số lớp đang chạy; mọi con số khớp trừ các con số đã khai trước là sẽ đổi, và phần chênh được liệt kê từng dòng. — Truy vết: R-OPS-05, R-OPS-06
- [ ] (Dương tính) Bảng ánh xạ 23 tài khoản thật (ai giữ vai trò nào tại đơn vị nào) được duyệt bằng văn bản trước khi chạy và đợt chạy đọc đúng bảng đó; sau khi chạy, 23/23 tài khoản có ít nhất một vai trò còn hiệu lực và đăng nhập vào đúng khu vực của mình. — Truy vết: R-OPS-09, R-OPS-05
- [ ] (Âm tính) Chạy khi bảng ánh xạ còn dòng chưa duyệt, hoặc trỏ tới đơn vị không tồn tại, thì dừng ngay từ bước kiểm đầu và KHÔNG ghi một bản ghi nào — kiểm bằng cách đếm bản ghi trước và sau lần chạy hỏng, chênh lệch bằng 0. — Truy vết: R-OPS-06, R-OPS-09
- [ ] (Dương tính) **Tiêu chí về TÍNH BẤT BIẾN KHI CHẠY LẠI — không phải cấm đổi cây:** chạy lại đợt chuyển đổi lần hai không sinh thêm bản ghi trùng và không đổi con số nào; nạp lại đường dẫn cây trên dữ liệu cũ (vốn không ghi parentId) cho ra **đúng kết quả như lần chạy thứ nhất** (không "vá" chồng lên nhau) và in ra số node đã vá / số node bỏ qua. ⚠️ Việc **chuyển cha CS1 và CS2 xuống dưới khối VÙNG Đà Nẵng là BẮT BUỘC** theo QĐ-A — xem tiêu chí 9; đừng đọc tiêu chí này thành "cây không được đổi". — Truy vết: R-OPS-01, R-D2-10, R-D2-19 `[đã làm rõ 28/07: bản trước ghi "không làm đổi cây hiện có", đọc rời ra mâu thuẫn với hệ quả bắt buộc của QĐ-A]`
- [ ] (Dương tính) **Thi hành hình dạng cây của QĐ-A trên dữ liệu thật:** sau đợt chuyển đổi, **CS1 và CS2 treo dưới node VÙNG Đà Nẵng**, **HO vẫn treo thẳng dưới ROOT**; truy vấn lấy tập cơ sở con của VÙNG Đà Nẵng trả về **đúng [CS1, CS2]**, có test khoá lại trong luồng tích hợp. Đây là hệ quả bắt buộc do `QUYET-DINH.md:31` khai đích danh ("`getSubtreeCenterIds` của VÙNG Đà Nẵng giờ phải trả `[CS1, CS2]` → cần test mới") và là **bước duy nhất của QĐ-A chạm dữ liệu thật**. — Truy vết: R-OPS-05, R-OPS-08, R-D2-10
- [ ] (Âm tính) **Chuyển cha không được đổi quyền của ai:** chụp bảng *tài khoản × tập cơ sở nhìn thấy* **trước và sau** khi chuyển cha; **không một dòng nào đổi** ngoài danh sách thay đổi có chủ đích đã ký. — Truy vết: R-OPS-02 (`02-prd-franchise-platform.md:322` — ngưỡng "0 dòng thay đổi ngoài danh sách đã ký")
- [ ] (Âm tính) Sau đợt chạy, không tài khoản nào có quá một nơi trực thuộc PRIMARY; nếu dữ liệu cũ có hai, đợt chạy DỪNG và in danh sách người bị trùng thay vì tự chọn một — sau đó ràng buộc chống hai PRIMARY bật lên được mà không bản ghi nào vi phạm. — Truy vết: R-D3-03, R-D3-04, R-OPS-06
- [ ] (Dương tính) Đường quay lui được diễn tập trước ngày chạy thật: **thời gian khôi phục thực tế ≤ số phút ghi trong kế hoạch quay lui đã ký** (R-OPS-04 — `02-prd-franchise-platform.md:324` đòi mỗi nhóm thay đổi ghi rõ "quay lui bằng cách nào, **mất bao lâu**, mất dữ liệu gì"), và sau khi quay lui 23/23 tài khoản đăng nhập lại được, mở lại đúng màn hình quen thuộc của mình; biên bản diễn tập ghi **con số phút thực tế**. — Truy vết: R-OPS-04, R-OPS-05 `[đã sửa 28/07: "trong khoảng thời gian đã cam kết" chưa ai cam kết con số nào]`
- [ ] (Biên) Lớp đang chạy trong ngày chuyển đổi: sau đợt, mọi lớp giữ nguyên đơn vị, giữ nguyên giáo viên được phân công, và một buổi thật ngay sau đợt điểm danh được từ đầu đến cuối — nghiệm thu bằng buổi thật, không bằng dữ liệu mẫu. — Truy vết: R-OPS-05, R-OPS-04
- [ ] (Biên) Cơ sở cũ thiếu mã hoặc thiếu node đơn vị được vá trong chính đợt này; sau đó ràng buộc một cơ sở ứng đúng một đơn vị bật được, và rà lại dữ liệu không còn mã học viên hay mã lớp mang tiền tố mặc định. — Truy vết: R-D2-19, R-D2-20, R-OPS-07

**Truy vết:** R-OPS-09, R-OPS-10, R-OPS-05, R-OPS-04, R-OPS-01, R-OPS-06, R-OPS-07, R-D2-10, R-D2-19, R-D2-20, R-D2-21, R-D3-03, R-D3-04

**Chặn bởi:** Câu 14 — chưa chốt đổi cây trong cửa sổ khoá ghi hay đổi nóng, nên chưa viết được tiêu chí cho R-OPS-10 (có khoá ghi hay không, thao tác đang dở xử lý ra sao khi cây đổi). Câu 15 — chưa chốt trạng thái cuối của Center so với OrgUnit, nên chưa viết được tiêu chí bảng nào là bảng chủ sau đợt và bên nào thắng khi hai bên lệch. Câu 1 — chưa chốt phòng ban là node trong cây hay bảng phẳng, nên chưa viết được tiêu chí một nguồn phòng ban (R-D2-21).

### TH7 · JS-N5 · Trả lời trong vài phút vì sao một người không vào được, thay vì cấp thêm quyền cho xong

**Bối cảnh người dùng:** Người phụ trách phân quyền tại HO (chỉ SUPER_ADMIN được tạo/sửa vai trò), xử lý ngay trong giờ làm khi có người bị chặn giữa ca dạy hoặc giữa ca thu học phí.

**Job story:** Khi một trưởng nhóm báo "em ấy có vai trò rồi mà vẫn không vào được", tôi muốn mở một màn hình chỉ đúng dòng đang chặn người đó kèm lý do và người cấp, để tôi trả lời ngay thay vì đoán rồi cấp thêm vai trò cho xong việc.

**Vì sao dễ sai:** Prod đang enforce ma trận tĩnh và tôn trọng DENY; can() v2 lại chỉ lọc ALLOW, nên bật RBAC_V2_ENABLED sẽ âm thầm vô hiệu hoá mọi dòng cấm mà không màn hình nào báo. Nếu người phân quyền không nhìn thấy dòng cấm, phản xạ tự nhiên là cấp thêm vai trò — vừa không giải quyết được, vừa mở rộng quyền ngoài ý muốn.

**Tiêu chí nghiệm thu:**

- [ ] (Dương tính) Mở hồ sơ một tài khoản thấy ba khối tách rời: vai trò đang có (kèm đơn vị, hạn hiệu lực, nguồn phát sinh), các dòng cho phép riêng, các dòng CẤM riêng — không trộn ba khối vào một danh sách. — Truy vết: R-QDB-09, R-QDB-01
- [ ] (Dương tính) Với một hành động cụ thể, màn hình trả lời "được hay không và vì sao": nêu đúng dòng quyết định kết quả; khi có dòng cấm thì ghi rõ đang bị chặn bởi dòng nào, cấp ngày nào, ai cấp, lý do gì. — Truy vết: R-QDB-09, R-QDB-08, R-D4-01
- [ ] (Âm tính) Cấp thêm một vai trò cho phép đúng hành động đang bị cấm KHÔNG làm người đó vào được: kết quả kiểm quyền vẫn là từ chối, và màn hình cảnh báo ngay lúc cấp rằng dòng cấm vẫn thắng. — Truy vết: R-QDB-02, R-QDB-09
- [ ] (Dương tính) Dòng cấm chỉ tạo được khi nhập lý do; mọi lần tạo, sửa, gỡ dòng cấm đều ghi audit đọc được ngay trên màn hình (ai, cho ai, hành động nào, lý do, lúc nào), không phải mở log máy chủ. — Truy vết: R-QDB-08
- [ ] (Âm tính) Cấp thêm một dòng cho phép KHÔNG làm rộng tầm nhìn dữ liệu: sau khi cấp, số bản ghi trả về trên danh sách học viên và danh sách lớp của người đó không đổi một dòng nào. — Truy vết: R-QDB-07, R-D4-01
- [ ] (Dương tính) Có bộ test ma trận chứng minh dòng cấm được kiểm ở ĐẦU hàm quyết định quyền, trước cả nhánh SUPER_ADMIN, với đủ 6 loại phạm vi; ngoại lệ dành cho SUPER_ADMIN được khai báo tường minh chứ không phải hệ quả của thứ tự lệnh. — Truy vết: R-QDB-02, R-QDB-03, R-QDB-04
- [ ] (Âm tính) Cờ RBAC_V2_ENABLED không bật được khi bộ test dòng cấm chưa xanh: quy trình phát hành có chốt chặn tự động từ chối bật cờ nếu bộ test đỏ hoặc thiếu — thử bật trong môi trường dựng lại phải hỏng. — Truy vết: R-QDB-05
- [ ] (Biên) Các ca test cũ đang khẳng định hành vi bỏ qua dòng cấm bị đảo lại; sau khi đảo, chạy toàn bộ bộ test không còn ca nào khẳng định rằng dòng cấm bị bỏ qua — đếm được số ca đã đảo trong nhật ký thay đổi. — Truy vết: R-QDB-10, R-QDB-04

**Truy vết:** R-QDB-01, R-QDB-02, R-QDB-03, R-QDB-04, R-QDB-05, R-QDB-07, R-QDB-08, R-QDB-09, R-QDB-10, R-D4-01

**Chặn bởi:** Câu 11 — chưa chốt CLASS và ASSIGNED gộp hay tách, nên chưa viết được tiêu chí hiển thị phạm vi của một dòng quyền khi hai loại phạm vi này chưa quyết gộp hay tách (ảnh hưởng cột "phạm vi" trên màn phân quyền).

### TH7 · JS-N6 · Phiếu thu ở cơ sở nhượng quyền mang đúng pháp nhân, đúng dải số, đúng mức thu

**Bối cảnh người dùng:** Kế toán của cơ sở nhượng quyền ở tỉnh khác — pháp nhân riêng, mã số thuế riêng, tài khoản ngân hàng riêng — thu tiền tại quầy và in phiếu ngay cho phụ huynh.

**Job story:** Khi phụ huynh đóng học phí ở cơ sở tôi và cần phiếu thu để công ty thanh toán, tôi muốn in được phiếu mang đúng pháp nhân, đúng dải số và đúng mức thu của cơ sở tôi, để chứng từ hợp lệ với kế toán bên tôi mà không phải sửa tay từng tờ.

**Vì sao dễ sai:** Mã số thuế hiện là hằng số trong mã nguồn (lib/locations.ts:63), Receipt không có trường đơn vị và mã phiếu đang theo mẫu RCP-{CENTER}; học phí thì toàn cục (Course.price và CoursePackage.price không có trường đơn vị, 0/45 khoá cấu hình về giá). Nếu chỉ thêm hồ sơ pháp nhân mà không chạm dải số và mức thu, phiếu in ra vẫn sai chủ thể hoặc sai số tiền.

**Tiêu chí nghiệm thu:**

- [ ] (Dương tính) Phiếu thu in ra lấy tên pháp nhân, mã số thuế, địa chỉ, tài khoản ngân hàng từ hồ sơ pháp nhân của đơn vị phát hành; đổi hồ sơ pháp nhân trên đơn vị thì phiếu in sau đó đổi theo, không phải sửa mã nguồn. — Truy vết: R-D2-14, R-OPS-11
- [ ] (Dương tính) Dải số phiếu thu tách theo pháp nhân: hai cơ sở thuộc hai pháp nhân phát hành cùng ngày không sinh số trùng, và số phiếu trong kỳ của mỗi pháp nhân liên tục, không nhảy khoảng — kiểm bằng truy vấn đếm theo dải. — Truy vết: R-OPS-12, R-D2-13
- [ ] (Âm tính) Phiếu đã phát hành KHÔNG đổi pháp nhân về sau: sửa hồ sơ pháp nhân chỉ ảnh hưởng chứng từ phát hành sau đó; in lại phiếu cũ vẫn ra pháp nhân tại thời điểm phát hành. — Truy vết: R-OPS-12, R-D2-14
- [ ] (Dương tính) Mọi bản ghi tiền (thu, hoàn, ghi nợ) mang đơn vị lúc ghi, lấy theo đơn vị của lớp hoặc của đăng ký chứ không suy từ người thao tác; sau đợt chuẩn hoá, số bản ghi tiền không có đơn vị bằng 0 và báo cáo tồn đọng in ra con số đó. — Truy vết: R-D10-06, R-D10-07
- [ ] (Âm tính) Kế toán cơ sở này mở sổ thu của cơ sở khác — kể cả cơ sở cùng khối vùng — bị từ chối ở cả đường đọc lẫn đường ghi; gọi thẳng bằng mã đơn hoặc mã phiếu trả mã lỗi từ chối, không trả danh sách rỗng. — Truy vết: R-D4-11
- [ ] (Dương tính) Mức thu, thuế suất và tiền tệ đọc qua đúng một hàm theo mức danh mục đã khai; màn hình cấu hình hiện giá trị đang áp dụng kèm đơn vị nào cấp ra giá trị đó. — Truy vết: R-D6-04, R-D6-07, R-D6-14
- [ ] (Âm tính) Với khoản mục được khai ở mức dùng chung, cơ sở không sửa được: nút tắt và gọi thẳng hành động sửa bị từ chối kèm lý do "khoản mục dùng chung cấp tập đoàn"; với mức kế thừa thì ghi đè được và xoá ghi đè thì quay lại giá trị cấp trên. — Truy vết: R-D6-06, R-D6-04, R-D6-14
- [ ] (Biên) Đối chiếu cuối kỳ: tổng tiền trên sổ của cơ sở khớp phần trong phạm vi của bảng căn cứ tính phí bên FRANCHISOR; lệch thì hệ thống liệt kê chênh lệch từng dòng kèm chữ ký kế toán, và không tự chỉnh số nào. — Truy vết: R-OPS-03, R-D10-06

**Truy vết:** R-D6-04, R-D6-06, R-D6-07, R-D6-14, R-D2-13, R-D2-14, R-D10-06, R-D10-07, R-OPS-03, R-OPS-11, R-OPS-12, R-D4-11

**Chặn bởi:** Câu 9 — chưa chốt bên nhận nhượng quyền có được đặt học phí riêng không, nên chưa viết được tiêu chí ai duyệt mức giá riêng, biên độ được phép và cách xử lý khi giá cơ sở lệch giá tập đoàn (R-D6-14 chỉ nghiệm thu được ở mức cơ chế). Câu 6 — chưa chốt cờ hạch toán có hệ quả nghiệp vụ gì, nên chưa viết được tiêu chí báo cáo tách theo pháp nhân sau khi bật cờ.

> **Ghi chú kiểm chứng (tình huống bổ sung):** Vòng phản biện đối chiếu toàn bộ mã yêu cầu với 20 job story đã có và kết luận — nhóm QĐ-C trắng hoàn toàn (0/5, dù là quyết định đã chốt 28/07), nhóm dữ liệu cá nhân DP mới phủ 3/7, nhóm D4 mới phủ 7/13, OPS 10/13; sáu story trên được viết bổ sung để lấp đúng các mã đó (JS-N1 cho QĐ-C, JS-N2 cho R-OPS-13, JS-N3 cho R-DP-01/02/03/05 và R-D4-02/03/04, JS-N4 cho R-OPS-09/10 và R-D2-21, JS-N5 cho R-QDB-09/10, JS-N6 cho R-D6-14). Sau khi thêm sáu story này, các mã còn trắng chỉ còn 5 mã thuần kỹ thuật hoặc ràng buộc thiết kế (R-D4-05, R-D4-08, R-D4-10, R-D6-12, R-D10-09) — không còn mã nghiệp vụ nào trắng; nhóm này nên đưa vào tiêu chuẩn hoàn thành kỹ thuật thay vì viết thành story. Vòng phản biện cũng ghi nhận bốn kịch bản âm tính trọng yếu (quản lý không xem được nội dung chương trình; bên nhận không sửa được chương trình; người cơ sở A không thấy dữ liệu cơ sở B; hợp đồng hết hạn thì quyền tắt) đều ĐÃ có tiêu chí — vấn đề là TRÙNG chứ không thiếu, cần chỉ định một story chủ cho mỗi kịch bản; và chỉ ra bốn cặp story nên gộp hoặc cắt tiêu chí trùng. Cuối cùng, 15 câu hỏi chưa được Ban giám đốc trả lời đang treo phần lớn tiêu chí; thứ tự nên hỏi trước là Câu 3, Câu 2, Câu 11, Câu 7, Câu 13 — trả lời 5 câu này mở khoá khoảng hai phần ba số tiêu chí đang treo.

---

## Truy vết story → yêu cầu PRD

Bảng dưới đối chiếu mã `R-*` mà mỗi story viện dẫn với danh sách yêu cầu thật trong `02-prd-franchise-platform.md` §7.2. **Đã kiểm bằng công cụ tìm chuỗi trên chính tệp PRD, không kiểm bằng trí nhớ.** Kết quả: **135 / 136 mã có thật**, đúng **một** mã không tìm thấy.

| ID story | Các mã R-* | Ghi chú |
|---|---|---|
| TH1 · JS-01 | R-D8-01, R-D8-02, R-D8-03, R-D8-08, R-D8-09, R-D6-03, R-D6-13, R-D2-12, R-D2-24, R-D4-01, R-D9-03, R-D10-08, R-D10-11, R-D10-13, R-QDB-08 | Tất cả có thật. ⚠️ R-D6-03 trong PRD đã **gộp phần Curriculum sang R-D8-01** — dùng ở đây là thừa. Vòng rà soát đã cảnh báo R-QDB-08 và R-D10-13 bị mượn sai lĩnh vực |
| TH1 · JS-02 | R-D8-02, R-D8-03, R-D8-14, R-D2-03, R-D10-02, R-D10-08, R-D10-11, R-D10-13, R-OPS-04, R-QDB-08 | Tất cả có thật. ⚠️ R-D2-03 là "sửa/di chuyển ĐƠN VỊ", không phải "tạo phiên bản chương trình" — mượn sai. ✅ **Đã sửa 28/07:** mục "Vì sao dễ sai" trước đây khẳng định `Class.curriculumId` có khoá ngoại `onDelete: SetNull` (trích `schema.prisma:2226`) — **sai đối tượng**, dòng đó là `Question`. `Class` **không có** quan hệ tới `Curriculum`; hỏng thật là **dữ liệu mồ côi**, và tiêu chí BIÊN nay fail-closed cho cả ba ca (rỗng · archive · mồ côi) |
| TH1 · JS-03 | R-D8-04, R-D8-05, R-D8-06, R-D8-07, R-D8-11, R-D8-12, R-D8-14, R-D3-07, R-D3-09, R-D3-10, R-D3-12, R-D6-05, R-D6-07, R-D9-05b, R-QDB-06 | Tất cả có thật. ⚠️ R-D6-05/R-D6-07 là kế thừa cấu hình theo cây đơn vị, bị mượn cho kế thừa chương trình → lớp. ✅ **Đã sửa 28/07:** R-QDB-06 (vá cổng SCORM) trước đây bị gán cho tiêu chí GHI NHẬT KÝ — nay gỡ khỏi đó và neo vào một tiêu chí âm tính mới về DENY × cổng SCORM. Bảng này trước đó **không phát hiện** chỗ mượn sai, hệ quả là BƯỚC 4 sẽ thấy R-QDB-06 "đã có story" trong khi việc thật không ai nhận |
| TH2 · JS-02A | R-D3-01, R-D3-03, R-D3-04, R-D3-05, R-D3-06, R-D3-11, R-D6-10 | Tất cả có thật. ⚠️ R-D6-10 (khuôn mẫu sinh vị trí trống) bị mượn ở tiêu chí 5 |
| TH2 · JS-02B | R-D3-01, R-D3-05, R-D3-07, R-D3-09, R-D3-10, R-D4-11, R-D4-12, R-D8-04, R-D8-05, R-CONST-01 | Tất cả có thật. ✅ **Đã sửa 28/07:** tiêu chí 1 và 3 nay đòi **ĐỒNG THỜI** vai trò giảng dạy VÀ phân công (đúng R-D3-09); tiêu chí 4 (chặn tự gán giáo viên) chuyển sang story chủ TH4 · JS-04-03 cùng ba mã R-D8-04, R-D4-12, R-CONST-01 |
| TH2 · JS-02C | R-D3-01, R-D3-02, R-D3-03, R-D3-07, R-D3-08, R-D3-09, R-D4-11, R-D9-05b, R-OPS-02 | Tất cả có thật. R-D9-05b thuộc nhóm nhượng quyền — PRD cần khẳng định cơ chế tăng `tokenVersion` dùng chung cho mọi lần thu hồi quyền |
| TH3 · JS-01 | R-D2-01, R-D2-02, R-D2-03, R-D2-04, R-D2-05, R-D2-06, R-D2-07, R-D2-08, R-D2-09, R-D2-10, R-D2-11, R-D2-20, R-OPS-01, R-OPS-05, R-OPS-08 | Tất cả có thật. R-D2-20 ở tiêu chí 5 là thừa |
| TH3 · JS-02 | R-D2-02, R-D2-12, R-D2-13, R-D2-14, R-D2-15, R-D2-16, R-D2-17, R-D2-19, R-D2-20, R-D2-22, R-D2-23, R-OPS-05, R-OPS-06, R-OPS-11, R-OPS-12 | Tất cả có thật. ⚠️ Tiêu chí 3 **làm nhẹ R-D2-17**: PRD đòi mã cơ sở bất biến, story lại cho sửa khi cơ sở chưa có dữ liệu |
| TH3 · JS-03 | R-D9-01, R-D9-02, R-D9-03, R-D9-04, R-D9-05, R-D9-05b, R-D9-06, R-D9-08, R-D9-09, R-D9-10, R-D3-01, R-D3-02, R-D3-07, R-D3-08, R-D8-01, R-D8-02, R-D8-03, R-QDB-01, R-QDB-02, R-QDB-03, R-QDB-04, R-QDB-05, R-OPS-02 | Tất cả có thật. Story chắc nhất của tình huống 3 |
| TH3 · JS-04 | R-D6-01, R-D6-02, R-D6-03, R-D6-04, R-D6-05, R-D6-06, R-D6-07, R-D6-08, R-D6-09, R-D6-10, R-D6-11, R-D6-13, R-D3-11, R-D2-18, R-D2-24, R-D4-06, R-D4-07, R-D4-09, R-D4-11, R-D9-03, R-D10-02, R-D10-03, R-D10-04, R-D10-05, R-D10-10, R-D10-12, R-D10-13, R-OPS-03, R-OPS-04, R-OPS-07 | ✅ **ĐÃ SỬA 28/07 — `R-D6-21` nêu ở mục "Chặn bởi" của story này KHÔNG THẤY TRONG 02-prd** (chỉ số nhóm D6 dừng ở `R-D6-14`); nay đã thay bằng mã đúng `R-D2-21` (một nguồn phòng ban, `02-prd:184`). Cũng ở đợt này, story được **bổ sung hai tiêu chí cách ly** còn thiếu: đủ 9 vai trò cấp cơ sở (neo KR8) và bốn bảng không có trường cơ sở (xem b10). Ngoài ra: 30 mã cho 8 tiêu chí, trong đó R-D2-24, R-OPS-03, R-OPS-04 **không có tiêu chí nào phủ**; R-D4-09 và R-D10-12 truy về sai chỗ. Vòng rà soát khuyến nghị **tách story này làm ba** |
| TH4 · JS-04-01 | R-D8-01, R-D8-02, R-D8-03, R-D8-09, R-D8-14, R-D10-02, R-D10-05, R-D10-13, R-D4-06, R-D4-09, R-D4-12, R-D2-04 | Tất cả có thật. ⚠️ R-D2-04 (xoá mềm đơn vị) và R-D4-06 bị mượn gần đúng — chỗ đúng là R-DP-07 |
| TH4 · JS-04-02 | R-D8-06, R-D8-07, R-D8-08, R-D8-09, R-D8-11, R-D8-14, R-D6-01, R-D6-08, R-DP-06 | Tất cả có thật. ⚠️ R-D6-08 (khuôn mẫu đơn vị) bị mượn cho "khuôn mẫu học liệu bắt buộc của buổi" — hai khái niệm khác nhau |
| TH4 · JS-04-03 | R-D3-01, R-D3-05, R-D3-07, R-D3-08, R-D3-09, R-D3-10, R-D3-11, R-D8-04, R-D8-05, R-D8-06, R-D8-14, R-D4-11, R-D4-12, R-QDB-02, R-QDB-08, R-CONST-01 | Tất cả có thật. Story chắc nhất của tình huống 4 — nên làm trước vì rẻ nhất và bịt đường leo thang |
| TH5 · JS-01 | R-D10-02, R-D10-03, R-D10-04, R-D10-05, R-D10-06, R-D10-07, R-D10-08, R-D10-10, R-D10-12, R-D10-13, R-D8-01, R-D9-09, R-D4-09, R-D4-11, R-QDB-05, R-OPS-03, R-D2-05 | Tất cả có thật. Tiêu chí 3 giả định hợp đồng có tỉ lệ phí hiệu lực theo kỳ → **chỉ nghiệm thu được sau R-D9-01**. ✅ **Đã sửa 28/07:** tiêu chí 1 và 3 tách rõ **phạm vi tính phí (theo hợp đồng)** khỏi **khối xem chi tiết (theo sở hữu chương trình)** đúng R-D10-12, và cùng bị đánh dấu ⏸ TREO Câu 2; thêm tiêu chí đối chứng chênh lệch hai phạm vi và tiêu chí âm tính thi hành R-D9-09 (bảng không sinh chứng từ — ranh giới với D11) |
| TH5 · JS-02 | R-D10-02, R-D10-03, R-D10-04, R-D10-05, R-D10-10, R-D10-13, R-D4-06, R-D4-09, R-D4-11, R-D4-13, R-D8-11, R-DP-07, R-QDB-05, R-OPS-02, R-OPS-03 | Tất cả có thật. Tiêu chí 2 dựa trên việc PRD **tách** phạm vi tính phí khỏi phạm vi xem chi tiết (R-D10-12) — nếu Ban gộp làm một thì phải viết lại tiêu chí này |
| TH5 · JS-03 | R-D10-11, R-D10-12, R-D10-13, R-D10-02, R-D8-01, R-D8-02, R-D8-03, R-D8-04, R-D8-05, R-D8-06, R-D8-07, R-D8-14, R-D9-04, R-D9-05, R-D9-05b, R-D3-01, R-D2-03, R-D2-05 | Tất cả có thật. Story nói về một đường **chưa tồn tại** (chức năng sao chép chương trình chưa có trong repo) — không được trình bày như rò rỉ đang xảy ra |
| TH6 · JS-06-01 | R-D9-01, R-D9-04, R-D9-05, R-D9-05b, R-D9-06, R-D9-12, R-D3-01, R-D3-07, R-D3-08, R-D4-11, R-OPS-02, R-OPS-04, R-QDB-08 | Tất cả có thật. ⚠️ R-D9-12 và R-QDB-08 lệch lĩnh vực — hệ quả của **lỗ hổng PRD** nêu ở mục câu hỏi bên dưới |
| TH6 · JS-06-02 | R-D9-03, R-D9-05, R-D9-05b, R-D9-08, R-D3-01, R-D3-02, R-D4-11, R-D8-03, R-QDB-08, R-OPS-02, R-OPS-04, R-DP-07 | Tất cả có thật. ⚠️ R-D8-03 và R-QDB-08 lệch lĩnh vực |
| TH6 · JS-06-03 | R-D9-06, R-D9-10, R-D9-11, R-D3-08, R-D4-01, R-D4-09, R-D4-11, R-D8-02, R-D8-03, R-D8-07, R-D8-11, R-QDB-07, R-DP-07, R-OPS-02 | ✅ **ĐÃ SỬA 28/07** — tiêu chí 2 trước đây **nhầm chiều** bên nhượng / bên nhận; nay ghi "đúng đơn vị của **chính cơ sở nhận nhượng quyền**" và tiêu chí 4 bổ sung vế đối xứng "mở dữ liệu của đơn vị HO trả mã lỗi từ chối y hệt trước khi cắt". Tiêu chí 3 cũng thay "quét toàn bộ chức năng" bằng danh sách hành động trong phụ lục |
| TH6 · JS-06-04 | R-D9-06, R-D9-11, R-D8-01, R-D8-03, R-D8-09, R-D8-11, R-D4-11, R-DP-04, R-DP-06, R-DP-07, R-OPS-02, R-OPS-03, R-OPS-04, R-OPS-11, R-OPS-12 | Tất cả có thật. ✅ **Đã sửa 28/07:** tiêu chí 5 thay "một khoảng ngắn" bằng "cấu hình được, mặc định **15 phút**, nghiệm thu ở phút 14 / phút 16" — Ban chỉ cần xác nhận con số (b2), không còn chặn thi công |
| TH7 · JS-N1 | R-QDC-01, R-QDC-02, R-QDC-03, R-QDC-04, R-QDC-05, R-D4-11, R-D3-09, R-D10-04 | Tất cả có thật. Story **duy nhất** phủ nhóm QĐ-C — trước vòng phản biện nhóm này trắng hoàn toàn (0/5). ✅ **Đã sửa 28/07:** tiêu chí 6 và 7 trước đây định nghĩa ca thủ công là "bù ở lớp khác **CÙNG** cơ sở" — viết trượt đúng yêu cầu duy nhất mà QĐ-C sinh ra (`QUYET-DINH.md:77`), vì sau khi gỡ thì ca thủ công **chính là ca CHÉO** cơ sở. Nay bản ghi mang đồng thời hai đơn vị và báo cáo tách **bốn** con số, đếm được **theo cặp cơ sở** đúng R-QDC-04 |
| TH7 · JS-N2 | R-OPS-13, R-D2-13, R-D2-14, R-D10-06, R-D10-07, R-D4-11, R-DP-05, R-DP-07, R-D9-04, R-D6-12 | Tất cả có thật. ✅ **Đã sửa 28/07:** story tách **phần A** (nhận diện + CHẶN đường chuyển lớp thông thường qua ranh giới pháp nhân — đúng dù Ban chọn đáp án nào của Câu 7) và **phần B** (đường bàn giao có duyệt — ⏸ TREO toàn bộ Câu 7). Phần B thêm ràng buộc "luồng duyệt viết cứng bằng mã, không đọc bước từ bảng cấu hình" vì D12 ngoài phạm vi (`QUYET-DINH.md:86`), cùng khuôn R-D6-12 |
| TH7 · JS-N3 | R-DP-01, R-DP-02, R-DP-03, R-DP-05, R-DP-06, R-DP-07, R-D4-02, R-D4-03, R-D4-04, R-D4-11, R-OPS-02 | Tất cả có thật. Story mở khoá nhóm dữ liệu cá nhân (trước đó mới phủ 3/7) |
| TH7 · JS-N4 | R-OPS-09, R-OPS-10, R-OPS-05, R-OPS-04, R-OPS-02, R-OPS-01, R-OPS-06, R-OPS-07, R-D2-10, R-D2-19, R-D2-20, R-D2-21, R-OPS-08, R-D3-03, R-D3-04 | Tất cả có thật. ✅ **Đã bổ sung 28/07:** hai tiêu chí cho **bước duy nhất của QĐ-A chạm dữ liệu thật** — chuyển CS1/CS2 xuống dưới VÙNG Đà Nẵng, HO vẫn dưới ROOT, truy vấn tập cơ sở con của vùng trả đúng `[CS1, CS2]` (`QUYET-DINH.md:31`) — và tiêu chí R-OPS-02 chụp bảng quyền trước/sau khi chuyển cha. Tiêu chí 4 được làm rõ là nói về **tính bất biến khi chạy lại**, không phải cấm đổi cây |
| TH7 · JS-N5 | R-QDB-01, R-QDB-02, R-QDB-03, R-QDB-04, R-QDB-05, R-QDB-07, R-QDB-08, R-QDB-09, R-QDB-10, R-D4-01 | Tất cả có thật. Story phủ trọn khối DENY của QĐ-B |
| TH7 · JS-N6 | R-D6-04, R-D6-06, R-D6-07, R-D6-14, R-D2-13, R-D2-14, R-D10-06, R-D10-07, R-OPS-03, R-OPS-11, R-OPS-12, R-D4-11 | Tất cả có thật |

**Kết luận truy vết:**

- ✅ **ĐÃ SỬA 28/07 — Một mã không tìm thấy trong `02-prd-franchise-platform.md`: `R-D6-21`** (nêu ở mục "Chặn bởi" của TH3 · JS-04). Nhóm D6 trong PRD chỉ có `R-D6-01` đến `R-D6-14`. Đây là lỗi viết; mã đúng `R-D2-21` (`02-prd-franchise-platform.md:184`) **đã được thay vào thân tài liệu**, không còn chặn BƯỚC 4.
- Ba mã trong PRD đang ở trạng thái đã gộp (`R-D8-10` → `R-D3-10`, `R-D8-13` → `R-QDB-06`, `R-D10-01` → `R-D8-01`) — **không story nào viện dẫn nhầm sang chúng**, đúng như mong đợi.
- Năm mã còn **chưa có story nào phủ**: `R-D4-05`, `R-D4-08`, `R-D4-10`, `R-D6-12`, `R-D10-09`. Cả năm là ràng buộc kỹ thuật hoặc điều kiện thiết kế, không phải việc người dùng làm — đề nghị đưa vào **tiêu chuẩn hoàn thành kỹ thuật** thay vì viết thành job story.
- Khoảng **hai chục chỗ truy vết "mượn mã gần đúng"** đã được từng vòng rà soát chỉ đích danh trong cột ghi chú. Chúng **không làm sai nội dung nghiệp vụ của story**, nhưng sẽ làm lệch báo cáo độ phủ nếu BƯỚC 4 đếm máy móc theo mã.

---

## Xung đột lịch — story nào làm được ngay, story nào phải chờ

Hai đợt đang chạy song song ràng buộc thứ tự làm việc, đúng như `02-prd-franchise-platform.md` §3.1(c) đã nêu:

1. **Cửa sổ shadow-compare RBAC** đang so hệ quyền cũ (có DENY) với hệ mới (bỏ DENY) trong bóng tối. Mọi thay đổi làm **đổi giá trị trả về của hàm quyền trên dữ liệu đang có** đều làm nhiễu số đo của cửa sổ này.
2. **Đợt security hardening** đang sờ đúng vùng tệp của công việc cách ly dữ liệu (URL R2 công khai, `include` lồng không lọc, xoá mềm).

Bảng tra nhanh trong `QUYET-DINH.md` chốt: **QĐ-A** và **QĐ-C** không đụng shadow → làm được ngay. **QĐ-A.1** (thu hẹp `isHoLevel`) đụng shadow → chờ cửa sổ đóng. **QĐ-B** (giữ DENY) đụng shadow **và chặn lịch bật cờ** `RBAC_V2_ENABLED` — phải xong trước khi bật.

### Nhóm 1 — Làm được ngay, không đụng đợt nào

| Story | Neo vào làn A của PRD | Ghi chú |
|---|---|---|
| TH7 · JS-N1 (buổi bù đúng cơ sở) | A3 — R-QDC-05 → 01, 02, 03, 04 | Thi hành QĐ-C. Cả ba việc (đổi mặc định, đổi fail-OPEN→fail-CLOSED, gỡ ngoại lệ đọc chéo) **phải làm cùng lúc**; làm một hai việc = trả giá kiến trúc mà không thu lợi nghiệp vụ |
| TH3 · JS-01 (khối vùng cho tỉnh mới) | A4 — R-D2-01..08, R-OPS-01, R-OPS-08 | Thi hành QĐ-A. Phần `materialized path` (R-D2-09, 10, 11) thuộc làn B4 — tách ra, đừng gộp |
| TH1 · JS-01 (chương trình có chủ sở hữu) | A2 — R-D8-01 là cột **duy nhất mở khoá đồng thời D8 và D10** | Làm pha A (cột nullable + nạp về HO + đọc qua helper). Phần R-D8-09 (tách quyền xem danh sách khỏi quyền mở nội dung) có cờ đụng shadow → tách sang nhóm 3 |
| TH1 · JS-02 (phiên bản chương trình) | A2 — R-D10-02 | Làm được ngay về mặt lịch, **nhưng** phần lớn tiêu chí bị Câu 13 treo, và vòng rà soát cho biết hạ tầng phiên bản đã có sẵn — cần soát lại phạm vi trước khi giao |
| TH2 · JS-02A (lập đợt điều động) | A5 — R-D3-04, 05, 06, 01 | **Phải làm TRƯỚC TH2 · JS-02B.** Đảo thứ tự sẽ mở lỗ hổng cách ly cơ sở |
| TH2 · JS-02B (xếp GV điều động vào lớp) | A5 — R-D3-09, R-D3-10, R-CONST-01 | Chỉ làm sau JS-02A. R-D3-10 buộc sửa **cả ba chỗ trong cùng một lần phát hành** |
| TH4 · JS-04-03 (không tự gán mình làm GV) | A5 — R-D3-09, R-D3-10 | **Rẻ nhất, bịt đường leo thang — nên xếp đầu tiên trong cả chương trình.** Phần từ chối vé SCORM (R-QDB-02) thuộc làn B |
| TH3 · JS-04 phần khuôn mẫu (phòng ban, danh mục, kế thừa N tầng) | A8 — R-D6-01..13 | Phần phạm vi tài chính và che trường lương của story này thuộc nhóm 3 |
| TH3 · JS-03 phần bảng hợp đồng | A6 — R-D9-01, R-D9-02, R-D2-12 | ⚠️ PRD §8 xếp R-D9-03 **cùng lần phát hành** với nhóm này, trong khi bảng yêu cầu §7.2 đánh R-D9-03 là **có đụng shadow**. Hai chỗ mâu thuẫn — xem câu hỏi (b3) |
| TH7 · JS-N5 phần bắt lý do + audit khi cấp DENY | R-QDB-08 (không đụng shadow) | Làm được ngay; phần còn lại của story thuộc làn B1 |

### Nhóm 2 — Làm được ngay nhưng phải đi chung lịch với đợt security hardening

| Story | Vùng chạm | Ghi chú |
|---|---|---|
| TH4 · JS-04-02 (danh mục học liệu, bỏ URL R2 trần) | A9 — R-D8-08, R-D8-11 | ⚠️ Rủi ro vận hành: thu hồi quyền đọc ẩn danh trên "mọi" tệp R2 sẽ chặn cả ảnh trang công khai — **phải giới hạn theo tiền tố học liệu nội bộ**, và phải chốt với chủ đợt hardening ai làm việc này để không sửa chồng |
| TH1 · JS-03 phần ghi nhật ký lượt xem | A9 — R-D8-11 | Cùng vùng tệp với trên |
| TH3 · JS-02 (cơ sở nhượng quyền + hồ sơ pháp nhân) | A1, phần mã chứng từ | Gói "cổng tạo cơ sở" (R-D2-16 + 17 + 18) là **chặn cứng số một của toàn chương trình**; ba mã phải đi cùng một lần phát hành |
| TH7 · JS-N6 (phiếu thu đúng pháp nhân) | R-OPS-11, R-OPS-12 | Chạm mẫu in và dải số chứng từ — cùng vùng với A1 |

### Nhóm 3 — Phải chờ cửa sổ shadow-compare đóng

| Story | Neo vào làn B của PRD | Vì sao phải chờ |
|---|---|---|
| TH2 · JS-02C (hết đợt, quyền tự mất) | B2 — bật nơi gọi R-D3-02 → R-D3-07 → R-D3-08 → R-D3-12 → R-D3-03 | Đổi kết quả hàm quyền trên dữ liệu đang có |
| TH3 · JS-03 phần cắt quyền và ba trạng thái hợp đồng | B3 — R-D9-04 → 05 → 05b → 06 → 07 → 08 → 10/11/12 | Như trên |
| TH6 · JS-06-01, JS-06-02, JS-06-03, JS-06-04 | B3 | Cả bốn story cắt quyền đều nằm trọn trong làn B |
| TH4 · JS-04-01 (tiến độ chương trình, không đọc nội dung) | B5 + B6 — R-D4-09, R-D10-05, R-D8-09 | Phụ thuộc việc thu hẹp `isHoLevel` (QĐ-A.1) |
| TH5 · JS-01, JS-02, JS-03 (đối chiếu phí thương hiệu) | B5 — R-D10-06 → 07 → 08 → R-D4-09 → R-D10-04 → R-D10-10 | Tiêu chí âm tính của JS-01 và JS-02 **hiện đang FAIL trên nhánh main** vì `isHoLevel ? "ALL"` còn sống. R-D10-10 là **chốt chặn**: màn hình chi tiết tài chính mặc định TẮT cho tới khi test của nó xanh |
| TH7 · JS-N5 (giải thích vì sao bị chặn) | B1 — R-QDB-01 → 02 (+03 +10 cùng lần) → 04 → 06 → 05 | ⛔ R-QDB-02 và R-QDB-03 **phải cùng một lần phát hành**, nếu không sẽ có khoảng thời gian tài khoản quản trị cao nhất tự khoá mình |
| TH7 · JS-N4 (đợt chuyển đổi 23 tài khoản) | B4 + R-OPS-05, R-OPS-09 | Chạy sau khi A1 và A4 xong; R-OPS-02 (chụp "ai mất quyền") chạy **trước và sau mỗi** thay đổi cấu trúc |

### Nhóm 4 — Không vướng lịch kỹ thuật, vướng câu trả lời của Ban

| Story | Chờ gì |
|---|---|
| TH7 · JS-N2 (chuyển học viên qua pháp nhân khác) | Câu 7 — cấm hẳn, hay cho phép kèm đồng ý phụ huynh + bút toán chuyển công nợ. Chức năng **đã chạy được** hôm nay, nên đây là rủi ro đang mở |
| TH7 · JS-N3 (yêu cầu xoá dữ liệu) | Câu 8 — vai trò theo pháp luật bảo vệ dữ liệu. Đây là **câu gốc**, cả nhóm DP treo theo. Nhóm DP cũng chưa được xếp vào làn A hay làn B nào trong `02-prd` §8 |
| TH5 · JS-03 phần công thức tính phí cho lớp dùng bản sao | Câu 2 — **chỗ mất tiền**. Không có câu trả lời thì chỉ viết được tiêu chí "đưa vào mục chờ quyết định", không viết được công thức |

⛔ **Hai chốt chặn phải nhắc riêng với Ban:**

- **Không được bật `RBAC_V2_ENABLED`** cho tới khi ba việc của QĐ-B xong (thêm `grantsDeny` vào Actor, chặn DENY ở đầu `can()` v2 trước cả nhánh SUPER_ADMIN, bộ test ma trận DENY × scopeType). Bật trước = **mọi DENY hiện hữu hết hiệu lực im lặng, không log, không cảnh báo**. Điều này **chặn lịch bật cờ của đợt go-live RBAC đang chạy** — cần báo lại chủ đợt đó.
- **Cổng SCORM đang là vi phạm tường minh, không còn là vùng mù.** `lib/scorm/access.ts:46-47` chạy hệ quyền v2 thẳng, bỏ qua cờ `RBAC_V2_ENABLED` và bỏ qua DENY — nghĩa là **thu hồi quyền bằng DENY hiện không cắt được SCORM**. Việc này chạm cả TH1 · JS-03 và TH4 · JS-04-03.

---

## Câu hỏi cần Ban xác nhận trước khi sang BƯỚC 4

**Cả 26 / 26 story đều có ít nhất một mục "Chặn bởi".** Không story nào nghiệm thu trọn vẹn được bằng câu trả lời hiện có. Dưới đây là toàn bộ câu còn treo, chia hai nhóm.

### (a) Câu treo từ trước mà BƯỚC 2 và BƯỚC 3 vẫn chưa trả lời

**a1–a4 — bốn câu của `QUYET-DINH.md` đã được BƯỚC 2 chuyển thành câu hỏi chính thức nhưng vẫn chưa có câu trả lời:**

| # | Câu hỏi | Vì sao chặn | Không trả lời thì BƯỚC 4 sẽ kết luận sai ở đâu |
|---|---|---|---|
| **a1** | **"Phòng ban" là node trong cây (`OrgUnit type=DEPARTMENT`) hay bảng phẳng `DepartmentDef`?** (= Câu 1) | Khuôn mẫu đơn vị không có "bộ phòng ban chuẩn" nào để tự sinh; báo cáo và bộ lọc không chọn được nguồn | Chặn 3 story: TH3 · JS-01, TH3 · JS-04, TH7 · JS-N4. BƯỚC 4 sẽ đặc tả khuôn mẫu đơn vị dựa trên một mô hình phòng ban tự chọn, rồi phải làm lại toàn bộ khi Ban chốt hướng khác |
| **a2** | **Đếm ca học bù thủ công để BÁO CÁO hay để ĐỐI TRỪ TIỀN giữa hai cơ sở?** (= Câu 5) | Hai câu trả lời cho hai thiết kế dữ liệu hoàn toàn khác nhau | Chặn 3 story: TH3 · JS-04, TH5 · JS-01, TH7 · JS-N1. BƯỚC 4 sẽ thiết kế bảng ghi nhận ca thủ công chỉ đủ để đếm; nếu Ban muốn đối trừ tiền thì thiếu toàn bộ phần bút toán và phải làm lại |
| **a3** | **Thời gian chuyển tiếp sau khi cắt hợp đồng dài bao lâu, và "dữ liệu học viên của chính mình" gồm những gì?** (= Câu 3) | Không có con số ngày và không có danh sách nhóm dữ liệu | **Chặn 9 story — nhiều nhất trong tất cả:** TH2 · JS-02C, TH3 · JS-03, TH4 · JS-04-01, TH5 · JS-02, TH6 · JS-06-01, TH6 · JS-06-03, TH6 · JS-06-04, TH7 · JS-N2, TH7 · JS-N3. BƯỚC 4 sẽ đặc tả chế độ chỉ đọc mà không biết nó kéo dài bao lâu và phủ dữ liệu nào — gói bàn giao sẽ thiếu hoặc thừa nhóm dữ liệu, và cả hai đều là rủi ro pháp lý |
| **a4** | **Trạng thái cuối của `Center` so với `OrgUnit`** — hợp nhất về `OrgUnit` hay giữ song song vĩnh viễn? (= Câu 15) | Schema ghi "flip ở PR-D" nhưng **không tài liệu nào định nghĩa PR-D gồm gì** | Chặn 2 story: TH3 · JS-02, TH7 · JS-N4, và **toàn bộ chiến lược chuyển đổi dữ liệu**. BƯỚC 4 sẽ không xác định được bảng nào là bảng chủ khi hai bên lệch nhau, dẫn tới đợt chuyển đổi ghi vào sai bảng |

**a5–a6 — hai câu của `QUYET-DINH.md` KHÔNG được chuyển vào danh sách 15 câu của `02-prd`, nên đang bị bỏ quên:**

| # | Câu hỏi | Vì sao chặn | Không trả lời thì BƯỚC 4 sẽ kết luận sai ở đâu |
|---|---|---|---|
| **a5** | ⚠️ **`Document.isPublic` nghĩa là ai được xem?** Truy vấn portal đang bỏ qua cờ này — khối lấy tài liệu của buổi **không có điều kiện lọc `isPublic`** (`lib/portal/learning.ts:255-258`) | Không có trong 15 câu của `02-prd`, không có mã `R-*` nào phủ, nhưng **TH4 · JS-04-02 tiêu chí 7 đã tự giả định câu trả lời** ("tài liệu isPublic = true vẫn mở được bình thường") | BƯỚC 4 sẽ đặc tả proxy tài liệu có vé có hạn dựa trên một định nghĩa `isPublic` do đội tự đoán. Đoán rộng = lộ học liệu nội bộ; đoán hẹp = chặn nhầm tài liệu marketing và hướng dẫn phụ huynh |
| **a6** | ⚠️ **Tác vụ nền chạy với danh tính gì, phạm vi gì** — một lần cho cả tập đoàn hay một lần cho mỗi pháp nhân? | Không có trong 15 câu của `02-prd`. Nhưng **bốn story dựa hoàn toàn vào tác vụ nền**: TH2 · JS-02C, TH6 · JS-06-01, TH6 · JS-06-03, và gián tiếp TH7 · JS-N1 | BƯỚC 4 sẽ đặc tả một tác vụ nền chạy bằng danh tính hệ thống có phạm vi toàn cục — đúng thứ mà D10 và cách ly cơ sở đang cố loại bỏ. Nếu Ban muốn tách theo pháp nhân thì kiến trúc tác vụ nền phải làm lại từ đầu |

**a7 — mười một câu còn lại trong 15 câu của `02-prd` cũng chưa có câu trả lời.** Xếp theo số story bị chặn:

| Câu | Nội dung rút gọn | Số story bị chặn | Story bị chặn |
|---|---|---|---|
| **2** 🔴 | FRANCHISEE tự soạn chương trình riêng thì tính phí thế nào — **chỗ mất tiền**, mở bằng đúng một thao tác nhập liệu hợp lệ | **6** | TH1 · JS-01, TH3 · JS-03, TH4 · JS-04-01, TH5 · JS-01, TH5 · JS-02, TH5 · JS-03 |
| **11** | `CLASS` và `ASSIGNED` gộp làm một hay tách nghĩa thật | **4** | TH2 · JS-02A, TH2 · JS-02B, TH4 · JS-04-03, TH7 · JS-N5 |
| **13** | Điều khoản hợp đồng nào hệ thống PHẢI kiểm được bằng máy | **4** | TH1 · JS-02, TH3 · JS-03, TH5 · JS-03, TH6 · JS-06-02 |
| **6** | Cờ hạch toán độc lập/phụ thuộc có hệ quả nghiệp vụ gì, hay bỏ khỏi phạm vi | **3** | TH3 · JS-02, TH7 · JS-N2, TH7 · JS-N6 |
| **9** | FRANCHISEE có được đặt học phí riêng không | **3** | TH3 · JS-04, TH5 · JS-01, TH7 · JS-N6 |
| **10** | Ghi log "mọi lượt xem" là mỗi lượt mở gói hay mỗi tài nguyên con | **3** | TH1 · JS-03, TH4 · JS-04-02, TH5 · JS-02 |
| **4** | Nhân viên nghỉ việc thì quyền có mất không | **2** | TH2 · JS-02C, TH4 · JS-04-03 |
| **7** | Chuyển lớp qua ranh giới pháp nhân: cấm hay cho phép có điều kiện | **2** | TH7 · JS-N1, TH7 · JS-N2 |
| **12** | Cửa sổ shadow đóng theo tiêu chí nào, và ai được tạm ngưng hợp đồng | **2** | TH3 · JS-03, TH6 · JS-06-02 |
| **14** | Đổi cây trong cửa sổ khoá ghi hay đổi nóng | **2** | TH3 · JS-01, TH7 · JS-N4 |
| **8** 🔴 | Vai trò theo pháp luật bảo vệ dữ liệu — **câu gốc**, cả nhóm DP treo theo | **1** | TH7 · JS-N3 |

**Thứ tự nên hỏi:** Câu 3 → Câu 2 → Câu 11 → Câu 7 → Câu 13. Trả lời năm câu này mở khoá khoảng **hai phần ba** số tiêu chí đang treo.

### (b) Câu hỏi mới phát sinh từ chính các job story

| # | Câu hỏi | Vì sao chặn | Không trả lời thì BƯỚC 4 sẽ kết luận sai ở đâu |
|---|---|---|---|
| **b1** | **Giá trị mặc định của cửa sổ mở khoá học liệu là bao nhiêu ngày?** Mở trước buổi bao lâu, đóng sau buổi bao lâu | `R-D8-07` mô tả cơ chế nhưng không ấn định con số. TH1 · JS-03 tiêu chí 1 và 5 vì vậy **chỉ mô tả cơ chế, không nghiệm thu được** | BƯỚC 4 sẽ viết test lấy con số do đội tự chọn. Đặt rộng = mất chính lý do làm cửa sổ (chống copy cả bộ chương trình); đặt hẹp = giáo viên không soạn bài kịp, sẽ bị xin nới ngay tuần đầu và cơ chế trở thành hình thức |
| **b2** | **Xác nhận con số: đường dẫn tải gói bàn giao có hiệu lực 15 phút?** | ✅ **Đã vá vào tiêu chí 28/07** — TH6 · JS-06-04 tiêu chí 5 nay ghi "cấu hình được, mặc định **15 phút**, nghiệm thu bằng tải ở phút 14 thành công / phút 16 bị từ chối" thay cho cụm "một khoảng ngắn" không đo được. Ban chỉ cần **xác nhận hoặc đổi con số**, không còn chặn việc thi công | Nếu Ban muốn con số khác (ví dụ 60 phút cho gói lớn tải chậm), sửa một dòng cấu hình — không phải làm lại |
| **b3** | **`R-D9-03` thuộc làn A hay làn B?** | `02-prd` §8 xếp R-D9-03 **cùng lần phát hành với R-D9-01, R-D9-02, R-D2-12** (tức làn A), trong khi bảng yêu cầu §7.2 đánh R-D9-03 là **có đụng cửa sổ shadow** (tức làn B). Hai chỗ trong cùng một tài liệu mâu thuẫn nhau | BƯỚC 4 sẽ xếp lịch cho TH3 · JS-03 theo một trong hai cách đọc. Chọn nhầm làn A = làm nhiễu số đo của cửa sổ shadow đang chạy; chọn nhầm làn B = trì hoãn cả gói hợp đồng nhượng quyền mà không cần thiết |
| **b4** | **Có bổ sung hai mã yêu cầu còn thiếu vào PRD không?** (1) *"Mọi thao tác cắt quyền phải bắt nhập lý do và sinh đúng một dòng nhật ký gộp"*; (2) *"Ghi nhật ký truy cập dữ liệu học viên trong chế độ chỉ đọc"* | Không mã `R-*` nào phủ hai việc này, nên bốn story của tình huống 6 phải **mượn mã của khối DENY (R-QDB-08) và khối nội dung chương trình (R-D8-*)** — vòng rà soát xác định đây là gốc của 8 chỗ truy vết lệch lĩnh vực | BƯỚC 4 sẽ báo cáo độ phủ yêu cầu **cao hơn thực tế**: hai việc này không ai nhận, nhưng bảng truy vết vẫn xanh vì đã mượn mã của việc khác |
| **b5** | ✅ **RÚT KHỎI DANH SÁCH HỎI BAN — đây là lỗi viết, không phải lựa chọn nghiệp vụ.** PRD đã trả lời rồi | `R-D3-09` (`02-prd-franchise-platform.md:224`) đòi **đồng thời cả hai** điều kiện: đang giữ vai trò giảng dạy **VÀ** có phân công còn hiệu lực. TH2 · JS-02B tiêu chí 1 và 3 trước đây chỉ lấy vế phân công — **đã sửa thẳng vào tiêu chí ngày 28/07** | Hỏi Ban một câu đã có đáp án làm chậm lịch và tạo cảm giác đây là lựa chọn nghiệp vụ. Giữ lại dòng này để không xáo mã b1–b9, nhưng **không cần Ban trả lời** |
| **b6** | **Ai xử lý khi test canary của `R-D10-09` kêu?** | Chính `02-prd` ghi "⚠️ cần chốt: ai xử lý khi canary kêu" mà chưa có người nhận. Test này bắn khi schema xuất hiện model chi phí/lương/sổ cái | BƯỚC 4 sẽ giao một test không có chủ. Canary kêu vào lúc không ai trực = bị tắt cho qua, và vế cấm của D10 mất hiệu lực im lặng |
| **b7** | **Danh sách "bộ phòng ban chuẩn" và "bộ vị trí chuẩn" cụ thể gồm những gì?** | TH3 · JS-04 tiêu chí 1 nghiệm thu "sinh đủ bộ phòng ban chuẩn và bộ vị trí chuẩn" nhưng **không tài liệu nào liệt kê hai bộ đó**. Phụ thuộc câu a1 | BƯỚC 4 sẽ viết khuôn mẫu đơn vị theo danh sách đội tự nghĩ ra. Cơ sở nhượng quyền mở ra sẽ thiếu hoặc thừa phòng ban, phát hiện muộn ở học viên đầu tiên |
| **b8** | **Có tách `TH3 · JS-04` làm ba story không?** | Vòng rà soát chấm story này **SAI ở cấp story** — là gói tính năng chứ không phải một job: tiêu chí 7 và 8 khác việc, khác người, khác thời điểm; 30 mã truy vết cho 8 tiêu chí, trong đó ba mã không có tiêu chí nào phủ | BƯỚC 4 sẽ ước lượng và giao việc theo một story có kích cỡ gấp ba story khác. Kế hoạch sẽ lệch ngay từ vòng ước lượng đầu tiên |
| **b9** | **Ai là story chủ cho bốn kịch bản âm tính trọng yếu bị trùng?** (quản lý không xem được nội dung chương trình · bên nhận không sửa được chương trình HO · người cơ sở A không thấy dữ liệu cơ sở B · hợp đồng hết hạn thì quyền tắt) | Bốn kịch bản này **đã có tiêu chí** ở nhiều story — vấn đề là **trùng chứ không thiếu**. ✅ **Đã xử lý một phần 28/07:** chỉ định story chủ cho hai cặp trùng nặng nhất — *cắt quyền theo hợp đồng* → **TH6 · JS-06-02** và **JS-06-01** (TH3 · JS-03 chỉ giữ phần "hợp đồng là điều kiện tiên quyết"); *chặn tự gán giáo viên* → **TH4 · JS-04-03** (TH2 · JS-02B chỉ trỏ sang). Hai kịch bản còn lại chưa chỉ định | BƯỚC 4 sẽ đếm cùng một việc nhiều lần trong khối lượng công việc, và khi nghiệm thu thì mỗi bên tưởng bên kia đã kiểm |
| **b10** | 🔴 **Có mở mã yêu cầu cho bốn bảng KHÔNG có trường cơ sở không?** — nhật ký Zalo · xung đột chuyển đổi · yêu cầu phụ huynh · nhật ký email | BƯỚC 0 đã xác nhận bốn ca rò làm lộ **số điện thoại và email phụ huynh** giữa hai cơ sở (`00-scope-gap.md:77-80`), và mọi vai trò cấp cơ sở không phải quản lý cơ sở đang rơi về "nhìn thấy mọi cơ sở" (`:129`). **Không mã `R-*` nào trong PRD nhắc tên bốn bảng này.** Đã thêm tiêu chí vào TH3 · JS-04, nhưng tiêu chí không có mã yêu cầu thì không vào được bảng độ phủ | Khi cơ sở là **pháp nhân khác**, đây thành rò dữ liệu cá nhân **XUYÊN PHÁP NHÂN** — đúng rủi ro pháp lý mà cả chương trình đang muốn chặn. BƯỚC 4 sẽ báo độ phủ xanh trong khi bốn bảng này không ai nhận |
| **b11** | **Quyền TẠO TÀI KHOẢN có được giao xuống cơ sở / bên nhận nhượng quyền không, hay giữ ở HO?** | Cả bộ story mô tả rất kỹ việc **cấp vai trò** cho nhân sự bên nhận, nhưng không story nào chạm bước trước đó: ai tạo tài khoản và tạo được ở đơn vị nào. BƯỚC 1 cảnh báo đích danh đường tạo/sửa người dùng nhận đơn vị từ biểu mẫu **không đối chiếu phạm vi người thao tác**, hiện an toàn **chỉ vì** quyền này thuộc đúng một vai trò cao nhất (`01-intended-vs-implemented.md:203`) | BƯỚC 4 sẽ giao quyền tạo tài khoản xuống cơ sở mà không kèm ràng buộc phạm vi → **đường leo thang tenant**: quản lý một cơ sở tạo được tài khoản tại HO hoặc tại cơ sở khác. Nếu Ban quyết giữ ở HO thì phải ghi thành ràng buộc tường minh, không để trống |

### Việc phải làm trước khi bàn tiếp (không phải câu hỏi, nhưng chặn quyết định)

- **Kiểm kê chỉ-đọc `UserPermissionGrant WHERE grant='DENY'`** (userId, action, reason). `QUYET-DINH.md` ghi rõ: **chưa có con số này thì không ước lượng được rủi ro bật cờ `RBAC_V2_ENABLED`**.
- **Rà số bản ghi học bù chéo cơ sở đang mở** trước khi gỡ ngoại lệ đọc chéo (`R-QDC-05`) — phải xử lý hết trước khi chạy `R-QDC-03`.
- **Đếm lại số tài khoản thật từ cơ sở dữ liệu.** Nhật ký `shadow-log.md` cho ra khoảng 19–20 tài khoản trong khi ghi nhớ phiên trước nói 23. `TH7 · JS-N4` đang viết theo con số 23. Hai con số không khớp và **không đếm được từ mã nguồn**.
- **Báo lại chủ đợt go-live RBAC** rằng QĐ-B chặn lịch bật cờ `RBAC_V2_ENABLED`.
