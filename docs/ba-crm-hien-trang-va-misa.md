# BA MODULE CRM — HIỆN TRẠNG SATA ROBO, MÔ HÌNH MISA VÀ BA MỚI HỢP NHẤT

> **Người đọc:** Ban giám đốc · Trưởng bộ phận Kinh doanh/Marketing/Đào tạo · Đội kỹ thuật.
> **Ngày lập:** 28/07/2026 · **Nhánh khảo sát:** `main` (commit gần nhất `6d2f7d9a`) · **Trạng thái:** bản thảo BA, chưa ký duyệt.
> **Phương pháp:** đọc mã nguồn tĩnh trong `E:/satarobo-vn` (không chạy DB, không build, không đọc `.env`) + tài liệu công khai của MISA / Zalo / OMICall.
> **Quy ước trích dẫn dùng xuyên suốt:**
> `đường/dẫn:số-dòng` = đã đọc trực tiếp mã nguồn · `[WEB]` = có URL công khai · `[FILE]` = tài liệu nội bộ trong repo · `[SUY LUẬN]` = kết luận của người viết, không phải câu khẳng định của nguồn · `[CHƯA KIỂM CHỨNG]` = không xác nhận được, **không được trình bày như sự thật**.

---

## 1. TÓM TẮT CHO LÃNH ĐẠO

1. **Hệ thống đang ở đâu.** Sata Robo đã có một CRM thật, đang chạy production: 15 trạng thái phễu, 7 đường lead vào, 3 tầng chống trùng, 5 mức SLA, phân bổ tự động 3 chế độ, chuyển đổi lead → học viên trong một giao dịch nguyên tử, engine hoa hồng 4 tầng và báo cáo phễu L1→L2→L3. Đây **không phải** hệ thống sơ khai.
2. **Nhưng nó là CRM một-tầng.** Toàn bộ vòng đời khách hàng bị nén vào một bản ghi `Lead`. Không có tầng **Cơ hội bán hàng**, không có **Báo giá**, không có **Chiến dịch** là đối tượng, không có **Liên hệ** tách rời. Hệ quả: phụ huynh mua khoá thứ hai không có chỗ ghi, không đo được tỷ lệ thắng theo giai đoạn, không dự báo được doanh số.
3. **Pipeline đang bị đóng cứng trong mã.** Thêm/bớt một bậc phễu = sửa enum Prisma + migration + sửa 4–5 file + deploy (`prisma/schema.prisma:37-55`, `lib/leads/status.ts`). MISA cho phép quản trị viên tự sửa bằng chuột.
4. **MISA hơn ở bốn chỗ.** (a) Pipeline cấu hình được kèm tỷ lệ thành công/dự báo; (b) hai loại tự động hoá tách bạch — *Quy trình tự động* (workflow có phê duyệt) và *Quy tắc tự động* (chấm điểm, phân bổ, xếp hạng); (c) tổng đài điện thoại nhúng thẳng vào CRM với 8 nhà cung cấp được hỗ trợ sẵn; (d) trên 20 loại báo cáo dựng được.
5. **Về yêu cầu "gọi điện qua Zalo": trả lời thẳng — KHÔNG dùng Zalo làm trục chính.** Zalo OA *có* API gọi thoại, nhưng cuộc gọi đổ chuông **trong ứng dụng Zalo** của khách, không phải vào SIM. Phụ huynh không cài Zalo, tắt thông báo, hoặc dùng số cố định là **không gọi được**. Ngoài ra Zalo Cloud Connect còn **đòi doanh nghiệp đã có tổng đài SIP** — Sata Robo chưa có. Xem §D.2.6.
6. **Đề xuất cho gọi điện:** dùng **tổng đài đám mây** (ứng viên số 1 là **OMICall**, lấy báo giá song song **Stringee**), giữ Zalo ở vai trò nhắn tin (ZNS/OA) như hiện nay. Đây cũng đúng mô hình MISA: MISA hỗ trợ 8 tổng đài VOIP, **trong đó có OMICall**, còn Zalo OA trong MISA chỉ là kênh **chat**.
7. **Đề xuất tổng thể:** lấy **bộ khung đối tượng và bộ khung tự động hoá của MISA**, nhưng **hoà nhập vào `Lead`/`Order`/`Enrollment` đang có** — tuyệt đối không dựng CRM thứ hai chạy song song, và **không mua MISA AMIS CRM** để thay thế (xem §G, câu Q1).
8. **Tiền.** Tổng đài OMICall ước ~**1,2 triệu đ/tháng** cho 6 tài khoản + **0,8–1,0 triệu đ** phí khởi tạo, **chưa gồm** cước viễn thông và phí thuê đầu số `[WEB]` `[SUY LUẬN]`. Để tham chiếu: MISA AMIS CRM gói Enterprise 10 người dùng = **14,4 triệu đ/năm** `[WEB]`. Chi phí xây trong nhà là công sức đội kỹ thuật, chưa ước lượng ở tài liệu này.
9. **Thời gian.** Lộ trình đề xuất 4 giai đoạn (§F): GĐ-0 vá dữ liệu sai (2 tuần) → GĐ-1 nền CRM cấu hình được (4–6 tuần) → GĐ-2 gọi điện (4–6 tuần) → GĐ-3 tự động hoá & báo cáo (6–8 tuần). Các mốc là **ước lượng thô của BA**, đội kỹ thuật phải ước lượng lại.
10. **Rủi ro lớn nhất #1 — pháp lý.** Hệ thống đang **ghi đè cứng `consentMarketing = true`** cho mọi lead vào qua webhook (`lib/lead/ingest.ts:70`) và 2 form public, rồi hiển thị/xuất cột đó như bằng chứng khách đã đồng ý. Nếu bị khiếu nại, hệ thống sẽ **chứng minh sai**. Phải sửa **trước** khi bật bất kỳ tính năng gọi/nhắn nào.
11. **Rủi ro lớn nhất #2 — cửa sổ shadow-compare RBAC.** ⚠️ **ĐÍNH CHÍNH 29/07/2026 — mục này đã lỗi thời: cờ ĐÃ LẬT.** `RBAC_V2_ENABLED="true"` trên Vercel Production; đồng hồ shadow **đang chạy thật** (`RbacShadowDiff` có dòng từ 24/07 tới 28/07). Đo trên prod 29/07: chỉ **2 nhóm lệch**, cả hai là `v1=true → v2=false` và **đều nằm trong danh sách siết có chủ đích** (`leads:delete` 63 dòng · `students:delete` 2 dòng — `[CODE] lib/auth/rbac-intentional.ts:53-55`); **không có nhóm nới quyền nào**. ~~Đồng hồ shadow CHƯA CHẠY — bị chặn bởi kiểm tra tiền đề P1 (3 nhân viên còn thiếu `UserOrgRole`), số ngày sạch = 0; việc lật cờ KHÔNG phải "chờ vài ngày nữa"; toàn bộ §F.4 có thể treo vô hạn. Xem việc F0-10.~~ **Rủi ro còn lại đã đổi bản chất:** `can()` v2 không có nhánh DENY (`[CODE] lib/auth/can.ts:36-44`) ⇒ mọi `UserPermissionGrant` DENY **đang bị bỏ qua trên prod**. Khi đồng hồ chạy được: thêm quyền mới `calls:*` vào ma trận tĩnh mà chưa nạp `RolePermission` tương ứng sẽ **đẻ lệch giả hàng loạt**. Khuyến nghị: giai đoạn đầu **mượn quyền `leads:*` đã có**, tách quyền riêng sau khi lật cờ.
12. **Rủi ro lớn nhất #3 — ghi âm cuộc gọi.** Ghi âm là dữ liệu cá nhân của phụ huynh, có thể chạm dữ liệu trẻ em. Căn cứ pháp lý đã đổi: **Luật 91/2025/QH15 + NĐ 356/2025/NĐ-CP có hiệu lực 01/01/2026, thay NĐ 13/2023** — mà trang chính sách bảo mật của công ty **vẫn đang dẫn NĐ 13/2023** (`app/(public)/chinh-sach-bao-mat/page.tsx:7,23`).
13. **Quyết định cần ký — 9 câu, chi tiết §G.** Không phải 5. Bảng dưới ghi rõ **câu nào chặn giai đoạn nào** để Ban giám đốc không bỏ sót ba câu cuối:

| Câu | Nội dung | Chặn cái gì |
|---|---|---|
| **Q1** | Tự xây hay mua MISA AMIS CRM | **F.1** |
| **Q2** | Nhà cung cấp tổng đài (OMICall / Stringee / Zalo ZCC) | **F.2a** — và **phải có F0-11 trước** |
| **Q3** | Ghi âm: bật không, lưu bao lâu, ai nghe | **F.2a** |
| **Q4** | Có dựng tầng `modules/integration` trước không | **F.1** — dùng CHUNG với module Chấm công |
| **Q5** | Thời điểm thêm quyền `calls:*` so với cửa sổ shadow | **F.2b** |
| **Q6** | Ba quy trình bán hàng mặc định có đúng nhu cầu không | **F1-6** |
| **Q7** | Cơ sở nhượng quyền được tự cấu hình đến đâu | 🔴 **Thiết kế trường "đơn vị áp dụng" của MỌI bảng cấu hình** ⇒ **phải chốt TRƯỚC F.1, không được để cuối**. Phụ thuộc R-DP-01 đang treo |
| **Q8** | Có mở màn hình nghe ghi âm cho cơ sở nhượng quyền không | 🔴 **Cách chia thư mục tệp ghi âm trên kho lưu trữ ngay từ đầu** (R-DP-06) ⇒ chốt trước F.2a. Sửa sau rất đắt |
| **Q9** | Chấp nhận bỏ 6 phân hệ MISA nào khỏi phạm vi | **Xác nhận phạm vi** so với câu chữ "lấy hoàn toàn mô hình CRM của MISA" — xem §D.1.1 |
14. **Điều kiện tiên quyết kỹ thuật.** Tầng cổng gọi dịch vụ ngoài `modules/integration` **CHƯA TỒN TẠI** (`CLAUDE.md:72`; `ls modules/` không có thư mục). Quy ước "mọi call ngoài đi qua `modules/integration`" hiện là **mong muốn**, không phải hiện trạng. Phải quyết định nơi đặt mã tích hợp tổng đài trước khi viết dòng đầu tiên.
15. **Điều nên giữ.** Phễu SR.QD.217 (L1→L2→L3), 5 mức SLA, Messenger-first, buổi học thử/trải nghiệm và chuỗi chuyển đổi sang ghi danh + học phí là **tài sản riêng của Sata Robo mà MISA không có**. BA mới phải bọc mô hình MISA quanh những thứ này, không thay thế chúng.

---

## 2. PHẠM VI VÀ CÁCH ĐỌC TÀI LIỆU

### 2.1 Tài liệu này nói gì

| Nói | Không nói |
|---|---|
| Luồng nghiệp vụ CRM **hiện tại** của Sata Robo, mô tả theo góc nhìn người dùng, có trích dẫn mã nguồn | Không viết mã, không viết migration, không đề xuất schema Prisma cụ thể |
| Mô hình nghiệp vụ CRM của **MISA AMIS CRM**, kèm nguồn | Không phải hướng dẫn sử dụng MISA; không đánh giá hợp đồng/pháp lý mua bán với MISA |
| Bảng đối chiếu khoảng cách và **quyết định đề xuất** cho từng hạng mục | Không thay Ban giám đốc ra quyết định — mọi hạng mục đều có phương án và hệ quả |
| **BA mới** ở mức khái niệm + dữ liệu logic, đủ để đội kỹ thuật ước lượng | Không vẽ giao diện chi tiết, không đặc tả từng trường nhập liệu |
| Yêu cầu **gọi điện tích hợp CRM** — kết luận về Zalo, thiết kế luồng, mô hình dữ liệu logic, tuân thủ | Không ký hợp đồng nhà cung cấp; các con số giá là tham khảo công khai, phải lấy báo giá thật |
| Ràng buộc pháp lý, PII, cách ly đa cơ sở, xung đột với cửa sổ shadow-compare RBAC | Không thay tư vấn luật sư — §E liệt kê rõ 3 câu phải hỏi luật sư |

### 2.2 Quan hệ với các tài liệu khác

| Tài liệu | Quan hệ |
|---|---|
| `docs/ba-cham-cong-hien-trang-va-misa.md` | **Tài liệu song sinh** — module Chấm công. Dùng chung nguyên tắc "một `Employee` + một `OrgUnit` cho toàn hệ thống", chung việc chặn **F0-10** (bấm đồng hồ shadow), và chung quyết định **Q4** (nơi đặt mã gọi dịch vụ ngoài). ⚠️ **KHÔNG dùng chung §E pháp lý** — xem cảnh báo ngay dưới bảng này. |
| `Document/2-architecture-design/15-final-architecture-blueprint.md` | Blueprint kiến trúc chốt. Khi tài liệu này xung đột với Doc 15 về **cách xây**, Doc 15 thắng. Khi Doc 15 xung đột với quyết định ký sau (phiếu BGĐ, biên bản), quyết định ký sau thắng. |
| `docs/taicautruc/01-intended-vs-implemented.md` | Audit nội bộ "định làm gì vs làm được gì". Nguồn cho các cảnh báo về `modules/*`, outbox chưa atomic, thiếu đường replay `DomainEvent`. |
| `docs/taicautruc/02-prd-franchise-platform.md` | PRD nền tảng nhượng quyền. Nguồn cho R-DP-01…R-DP-07 dùng ở §D.4 và §E.3. |
| `docs/misa-amis-sync.md` | Mô tả skeleton tích hợp MISA hiện có (`IntegrationConfig` + `IntegrationLog` + `syncToMisa`). Khớp với mã nguồn. |
| `docs/zalo-notification-adapter.md` | ⚠️ **Đã lỗi thời một phần** — phần đầu file mô tả `isConfigured()` và trạng thái live **sai so với `lib/zalo/provider.ts` hiện tại**. Chỉ phần "Commit 5" cuối file là đúng. |
| `docs/lead-to-enrollment-flow.md`, `docs/lead-handover.md`, `docs/fix-plan-lead-payment-enroll.md` | Mô tả chi tiết các luồng con đang chạy. Tài liệu này tóm tắt lại, không chép lại. |
| `docs/ke-hoach-go-live-2607/` | Khung lập lịch hiện hành (GĐ0→GĐ4, ticket K*/L*/V*, lane #NN) và nhật ký shadow-compare. **Yêu cầu mới trong tài liệu này KHÔNG được gán vào "Phase A0–R5" đã đóng.** |

> ⚠️ **Cải chính: hai tài liệu KHÔNG dùng chung §E pháp lý.** Bản trước tuyên bố như vậy nhưng thực tế hai phần pháp lý **khác nhau và chưa được hợp nhất**:
>
> | Có ở tài liệu CRM (§E.1.3) mà **chấm công KHÔNG có** | Có ở tài liệu chấm công (§7.3) mà **CRM KHÔNG có** |
> |---|---|
> | Thời hạn trả lời chủ thể dữ liệu · hợp đồng xử lý dữ liệu với bên thứ ba · Điều 19 dữ liệu trẻ em · NĐ 91/2020 Danh sách không quảng cáo | Bộ luật Lao động (Điều 105, 107, sổ quản lý lao động) · **xung đột giữa nghĩa vụ xoá dữ liệu người lao động và nghĩa vụ lưu chứng từ kế toán 10 năm** |
>
> **Nghiêm trọng hơn:** hai tài liệu đề xuất **hai thời hạn lưu riêng lẻ** (toạ độ GPS 90 ngày; ghi âm 90 ngày hoặc 12 tháng) mà **không chỗ nào gộp thành MỘT chính sách lưu trữ của công ty** — trong khi cả hai đều thừa nhận cơ chế lưu trữ/xoá hiện tại dùng **một biến môi trường duy nhất cho toàn hệ thống** (`lib/compliance/retention.ts:11`).
>
> **Việc cần làm (chưa ai được giao):** tách phần pháp lý **chung** (Luật 91/2025, NĐ 356/2025, hồ sơ đánh giá tác động, miễn trừ doanh nghiệp nhỏ, vai trò pháp nhân nhượng quyền) ra **một phụ lục dùng chung**, hai tài liệu cùng trỏ tới; và thêm vào phụ lục đó **một BẢNG CHÍNH SÁCH LƯU TRỮ hợp nhất** với 4 cột: *loại dữ liệu × thời hạn × căn cứ × ai duyệt xoá*, phủ **toạ độ GPS · tệp ghi âm · ảnh minh chứng · bảng công đã chốt · dữ liệu lead và hội thoại**. `[CHƯA KIỂM CHỨNG]` chưa có ai xác nhận thời hạn nào là chính sách công ty — **mọi con số 90 ngày / 12 tháng trong hai tài liệu đều là đề xuất của BA, không phải chính sách đã ban hành.**

### 2.3 Cách đọc nhanh theo vai trò

| Bạn là | Đọc mục |
|---|---|
| Ban giám đốc | §1 → §C (bảng đối chiếu) → §F (lộ trình) → §G (câu hỏi cần chốt) |
| Trưởng Kinh doanh / Marketing | §A (hiện trạng) → §D.2 (luồng mới) → §D.6 (báo cáo) |
| Kế toán / Nhân sự | §D.4 (phân quyền) → §E (pháp lý, PII) |
| Đội kỹ thuật | §A.4 (mô hình dữ liệu) → §A.5 (điểm đứt gãy) → toàn bộ §D → §E.4 (shadow-compare) |

---

## 3. PHẦN A — LUỒNG BA HIỆN TẠI CỦA SATA ROBO

### A.1 Ai làm gì, khi nào — mô tả theo góc nhìn người dùng

**Nhân vật tham gia:** Phụ huynh (khách) · Marketing (chạy quảng cáo, trực Page) · Sale Admin tại HO (lọc lead thô thành lead đủ điều kiện) · Quản lý cơ sở (nhận lead về cơ sở, phân cho Sale) · Sale/CSM tại cơ sở (tư vấn, mời học thử, chốt) · Giáo viên (dạy buổi trải nghiệm) · Kế toán (xác nhận tiền).

| # | Ai | Làm gì | Khi nào | Hệ thống ghi lại gì |
|---|---|---|---|---|
| 1 | Phụ huynh | Nhắn tin vào Page Facebook HO, hoặc điền form trên web, hoặc để lại số ở Facebook Lead Ads / Zalo / Google Form | Bất kỳ lúc nào | `MessengerConversation` (nếu là Messenger) hoặc `Lead` mới |
| 2 | Marketing / Sale Admin (HO) | Trực hộp thư Messenger, hỏi số điện thoại, ghi nhu cầu | Trong ngày | Tin nhắn `MessengerMessage`; khi có SĐT hợp lệ + ghi chú → bấm "đủ điều kiện" ⇒ sinh `Lead` và đóng mốc **L2** (`qualifiedAt`) |
| 3 | Sale Admin (HO) | Bàn giao lead về cơ sở phù hợp | Sau khi đủ điều kiện | Mốc `handedAt` |
| 4 | Quản lý cơ sở | Xác nhận đã tiếp nhận lead | Sau bàn giao | Mốc `receivedConfirmedAt` |
| 5 | Hệ thống **hoặc** Quản lý cơ sở | Phân lead cho một Sale (tự động luân phiên / theo tỷ lệ chốt / gán tay) | Ngay khi tiếp nhận | `Lead.assignedToId`, mốc `assignedAt` |
| 6 | Sale/CSM | Gọi điện, nhắn tin cho phụ huynh; ghi lại vào dòng thời gian **bằng tay** | Trong vòng SLA 3 giờ | `LeadActivity` (loại `CALL`/`MESSAGE`/`NOTE`/`EMAIL`) + mốc `firstContactAt` (chỉ đặt 1 lần) |
| 7 | Sale/CSM | Khai báo (các) con của phụ huynh | Khi tư vấn | `LeadChild` (1 lead có N con) |
| 8 | Sale/CSM | Hẹn và xếp buổi học thử/trải nghiệm | Khi phụ huynh đồng ý | `TrialClassV2` + `LeadTrialHistory`; trạng thái lead lên `TRIAL_SCHEDULED` → `TRIAL_IN_PROGRESS` → `TRIAL_ATTENDED` |
| 9 | Hệ thống | Đủ số buổi thử ⇒ đẩy lead sang **Chờ quyết định** | Tự động | `LeadStatus = AWAITING_DECISION` |
| 10 | Sale/CSM | **Tạo đơn hàng trước**, chọn khoá/gói/sản phẩm, giá, ưu đãi | Khi phụ huynh chốt | `Order` + `OrderItem` |
| 11 | Sale/CSM | Ghi nhận khoản thu (Sale ghi nhận, chưa phải kế toán xác nhận) | Khi nhận tiền/chuyển khoản | `Payment.saleStatus = RECORDED`; nếu lead đang `AWAITING_DECISION` ⇒ **tự động lên `REGISTERED`** |
| 12 | Sale/CSM | Bấm **Chuyển đổi** trên trang lead | Sau khi có khoản ghi nhận | Trong 1 giao dịch: tạo/tái dùng `User(PARENT)` → `Student` → `Enrollment` → gắn khoản thu vào từng đăng ký → ghi audit → lead khoá về `ENROLLED` |
| 13 | Kế toán | Xác nhận khoản thu | Sau đó | `Payment.accountantStatus = CONFIRMED` → sinh `Receipt` |
| 14 | Quản lý / BGĐ | Xem phễu L1→L2→L3, chi phí, CPL/CPA, bảng kê hoa hồng | Hằng ngày / cuối kỳ | Trang `/admin/crm`, `/admin/marketing/funnel`, `/admin/crm/commission` |
| 15 | Hệ thống (cron 15 phút) | Quét vi phạm SLA, đẩy thông báo cho người phụ trách | Tự động | `StaffNotification` chống trùng theo `dedupeKey` |

### A.2 Sơ đồ luồng bằng chữ

```
[KÊNH VÀO — 7 đường]
  Messenger Page HO/CS ─┐
  Form public (web) ────┤
  Facebook Lead Ads ────┤
  Zalo (shared secret) ─┼──▶  Chống trùng SĐT (3 tầng)  ──▶  LEAD (status = NEW)
  Google Form ──────────┤            │ trùng ⇒ ghi LeadDuplicate, KHÔNG tạo mới
  Import Excel ─────────┤            │
  Nhập tay /admin ──────┘            ▼
                              Phân bổ tự động
                        (ROUND_ROBIN / CLOSE_RATE / MANUAL)
                                     │
        ┌────────────────────────────┴────────────────────────────┐
        │  ĐƯỜNG A (mới): form public + nhập tay + nút thủ công    │
        │     → đọc LeadAssignmentConfig, chọn cơ sở theo tải,     │
        │       ghi orgUnitId, khoá nếu lead đã có tương tác       │
        │  ĐƯỜNG B (cũ):  MỌI WEBHOOK (FB / Zalo / Google Form)    │
        │     → luôn round-robin, BỎ QUA cấu hình, KHÔNG gán cơ sở │  ⚠️ ĐG-01
        └────────────────────────────┬────────────────────────────┘
                                     ▼
   PHỄU 15 TRẠNG THÁI (bảng Kanban 14 cột, 1 giá trị deprecated ẩn)
   NEW → ASSIGNED → CONTACTED → (NO_ANSWER) → CONSULTING
       → TRIAL_SCHEDULED → TRIAL_IN_PROGRESS → TRIAL_ATTENDED
       → AWAITING_DECISION → REGISTERED → ENROLLED
       (nhánh rẽ bất kỳ lúc nào: NURTURING · LOST · DUPLICATE)
                                     │
   ĐỒNG HỒ SLA chạy song song: SLA-0 (5') SLA-1 (4h) SLA-2 (30')
                               SLA-3 (3h) SLA-4 (2 ngày) + idle
                                     │
                                     ▼
        ORDER  ──▶  PAYMENT(RECORDED)  ──▶  CONVERT (1 transaction)
                                     │              │
                                     │              ├─▶ User(PARENT) + Student + Enrollment
                                     │              ├─▶ StudentConsent (nếu tick)
                                     │              └─▶ DomainEvent "lead.converted"
                                     ▼
                        Kế toán xác nhận ──▶ Receipt ──▶ Hoa hồng 4 tầng
```

**Ba nhận xét về sơ đồ này:**

- Toàn bộ hình trên chạy trên **một bản ghi `Lead` duy nhất**. Không có nhánh nào tách ra thành "cơ hội bán hàng" riêng.
- **Bàn giao HO → cơ sở** (mốc `handedAt` / `receivedConfirmedAt`) là bước Sata Robo có mà MISA không có sẵn — nó sinh ra từ mô hình Messenger-first tập trung ở Page HO.
- Sau khi convert, lead **khoá cứng ở `ENROLLED`** và mọi hoạt động chuyển sang thế giới học vụ (`Student`/`Enrollment`/`ClassSession`). Không có đường quay lại để bán khoá tiếp theo trên cùng bản ghi.

### A.3 Bảng vai trò × thao tác × quyền (ma trận đang enforce trên production)

Nguồn: `lib/auth/permissions.ts:298-318` (đã đọc trực tiếp, xác minh lại từng dòng).

| Thao tác | Khoá quyền | SUPER_ADMIN | CENTER_MANAGER | SALES_CSM | MARKETING | **ACCOUNTANT** | Ghi chú |
|---|---|:--:|:--:|:--:|:--:|:--:|---|
| Xem toàn bộ lead trong phạm vi | `leads:view-all` | ✅ | ✅ | — | ✅ | — | `:299` |
| Xem lead của mình | `leads:view-own` | ✅ | — | ✅ | — | — | `:303`. SUPER_ADMIN có mặt **cố ý** để khớp bypass của `can()` v2, tránh đẻ lệch shadow — comment `:300-302` |
| Xem thông tin cá nhân (SĐT, email, tên PH/HS, ghi chú tư vấn) | `leads:view-pii` | ✅ | ✅ | ✅ | ✅ | — | `:309`. MARKETING **được mở 21/07/2026**, đảo quyết định 20/07 — comment `:304-308` |
| Tạo lead | `leads:create` | ✅ | ✅ | ✅ | ✅ | — | `:310` |
| Sửa lead, ghi hoạt động, đổi trạng thái | `leads:edit` | ✅ | ✅ | ✅ | ✅ | — | `:311` |
| Phân công / đổi người phụ trách | `leads:assign` | ✅ | ✅ | — | — | — | `:312` |
| Xoá lead | `leads:delete` | ✅ | ✅ | — | — | — | `:313` |
| Xuất danh sách lead | `leads:export` | ✅ | ✅ | — | ✅ | — | `:314`. Route xuất **có tồn tại**: `app/api/admin/leads/export/route.ts` (đã che PII tại server trước khi ghi file) |
| Nhập lead từ Excel | `leads:import` | ✅ | ✅ | ✅ | — | — | `:318`, theo quyết định 07/07/2026 |
| **Xem bảng kê hoa hồng** | `payments:manage` | ✅ | ✅ **(vô điều kiện)** | — | — | ✅ | `[CODE] lib/auth/permissions.ts:551` ghi cứng `["SUPER_ADMIN", "CENTER_MANAGER", "ACCOUNTANT"]`. Gate ở `app/(admin)/admin/crm/commission/page.tsx:24` — **không dùng khoá `leads:*`** |

> ⚠️ **Hai điểm sửa so với bản trước, đều liên quan dữ liệu TIỀN — đọc kỹ:**
> 1. Ô CENTER_MANAGER ở dòng `payments:manage` trước đây ghi *"tuỳ cấu hình"* — **SAI**. Ma trận v1 đang enforce ghi cứng CENTER_MANAGER, **không phụ thuộc cấu hình nào** (`lib/auth/permissions.ts:551`).
> 2. **`ACCOUNTANT` không có bất kỳ khoá `leads:*` nào, nhưng vẫn VÀO ĐƯỢC trang bảng kê hoa hồng qua `payments:manage`.** Bảng trước không có cột ACCOUNTANT nên người đọc kết luận sai rằng chỉ 4 vai trò chạm được CRM. Đã bổ sung cột.
>
> **Ghi chú giới hạn của bảng này:** bảng chỉ liệt kê các khoá **`leads:*` + `payments:manage`**. Các khoá tiền khác cũng chạm vùng CRM và **có danh sách vai trò khác nhau** — `payments:record` = SUPER_ADMIN / CENTER_MANAGER / **SALES_CSM** / ACCOUNTANT (`:552`); `payments:confirm` = SUPER_ADMIN / ACCOUNTANT (`:553`). Trước khi ký duyệt, rà lại toàn bộ bảng bằng cách đối chiếu từng dòng với `lib/auth/permissions.ts:299-318` và `:551-553` một lần nữa.

**Bốn quy tắc bổ sung ngoài ma trận:**

| Quy tắc | Nội dung | Vị trí |
|---|---|---|
| Thu hẹp theo chủ sở hữu | Người chỉ có `leads:view-own` chỉ thấy lead **được giao cho mình** hoặc lead có cờ "dùng chung" | `app/(admin)/admin/leads/page.tsx:85-96` |
| Lead "dùng chung" | `Lead.isSharedWithTeam` — bật bởi chủ sở hữu hoặc người có `leads:assign`. Người xem nhờ chia sẻ **chỉ xem + ghi chú**, không sửa/chuyển/convert | `prisma/schema.prisma:971-973`; `app/(admin)/admin/leads/actions.ts:47-56, 79-83` |
| Che PII tại server | Người không có `leads:view-pii` nhận bản đã che **trước khi** dữ liệu rời máy chủ: tên → "Nguyễn T. L.", ghi chú → ẩn hẳn | `lib/lead/pii.ts:11-31` |
| Cách ly cơ sở | `Lead` thuộc `SCOPED_MODELS` (`lib/db-scope.ts:12`) ⇒ mọi truy vấn **đọc cấp trên cùng** qua `scopedDb(actor)` tự chèn `centerId IN (danh sách cơ sở nhìn thấy được)`. **Ghi thì phải tự kiểm** bằng `passesScope()` | `lib/db-scope.ts:11-38`; ví dụ `actions.ts:140`, `:876-879` |

### A.4 Mô hình dữ liệu CRM hiện tại

**Nhóm 1 — lõi phễu bán hàng**

| Model | Ý nghĩa nghiệp vụ | Trường chính | Cách ly theo cơ sở? |
|---|---|---|---|
| `Lead` (`prisma/schema.prisma:957-1061`) | **Gộp làm ba vai**: khách tiềm năng + người liên hệ + cơ hội bán hàng | `parentName`, `phone`, `email`, `childName/childAge` (cũ, chỉ đọc), `centerId`, `orgUnitId`, `assignedToId`, `status`, `source`, 5 trường UTM + `fbclid/gclid/fbp/fbc`, `consentMarketing`, `isSharedWithTeam`, 7 mốc phễu | ✅ thuộc `SCOPED_MODELS` |
| `LeadChild` (`:1063-1085`) | Danh sách con của một phụ huynh (nhiều con) | tên, tuổi, trạng thái học thử | Theo lead cha |
| `LeadActivity` (`:2944-2956`) | **Dòng thời gian tương tác** | `type` (CALL/MESSAGE/NOTE/STATUS_CHANGE/EMAIL/HANDOVER), `content`, `metadata Json?`, `actorId/actorName` | Theo lead cha (ghi có kiểm `passesScope`) |
| `Note` (`:1087-1099`) | Ghi chú rời | nội dung, người ghi | Theo lead cha. ⚠️ **Trùng chức năng** với `LeadActivity(NOTE)` |
| `LeadTask` (`:2958-2975`) | Việc cần làm / nhắc lịch chăm sóc | `title`, `dueAt`, `status` OPEN/DONE/SKIPPED | ⚠️ **Model còn sống, giao diện đã gỡ** — `app/(admin)/admin/leads/[id]/page.tsx:53` |
| `LeadTrialHistory` (`:5125-5145`) | Lịch sử từng con đã học thử | `centerId`, buổi, kết quả | ✅ thuộc `SCOPED_MODELS` |

**Nhóm 2 — phân bổ, bàn giao, chống trùng**

| Model | Ý nghĩa | Cách ly? |
|---|---|---|
| `LeadAssignmentConfig` (`:2911-2918`) | Chế độ chia lead **theo từng cơ sở** (`@unique centerId`) | Miễn scope có chủ ý (`lib/db-scope.ts` `SCOPE_EXEMPT`) — `centerId = null` nghĩa là quy tắc toàn hệ thống |
| `LeadAssignmentHistory` (`:4479-4493`) | Lịch sử đổi người phụ trách (bàn giao hàng loạt) | Theo lead |
| `LeadTransfer` (`:2920-2936`) | Log chuyển lead (đổi Sale / đổi cơ sở) + ghi chú bàn giao bắt buộc | ⚠️ **Không** thuộc `SCOPED_MODELS` → báo cáo phải scope tay (`app/(admin)/admin/leads/bao-cao-chuyen/page.tsx:22-30`) |
| `LeadDuplicate` (`:2977-2987`) | Log lần gửi trùng số điện thoại | Chỉ log, **không có màn hình gộp bản ghi** |
| `ConvertConflict` (`:5233-5247`) | Xung đột hồ sơ phụ huynh khi chuyển đổi (email thuộc hồ sơ A, SĐT thuộc hồ sơ B) | Có màn xử lý `/admin/convert-conflicts` |
| `IdempotencyKey` (`:5250-5260`) | Chống bấm chuyển đổi hai lần | Khoá dạng `convert:{leadId}:{hash}` |
| `LeadAuditLog` (`:2869-2892`) | Sổ audit **riêng** cho lead | ⚠️ Song song với `AuditLog` hợp nhất (`:394`) — **hai sổ cùng tồn tại** |

**Nhóm 3 — kênh và marketing**

| Model | Ý nghĩa | Ghi chú |
|---|---|---|
| `MessengerConversation` (`:477-498`) | Hội thoại Page = **bậc L1** của phễu | ✅ thuộc `SCOPED_MODELS`; có `firstMessageAt`/`respondedAt` để đo tốc độ phản hồi |
| `MessengerMessage` (`:500-513`) | Tin nhắn vào/ra; `externalEventId @unique` chống trùng webhook | ⚠️ Tin **gửi đi chỉ ghi vào CSDL, không gọi Send API của Meta** — `lib/crm/messenger-service.ts:106-122` |
| `FacebookPageMapping` (`:465-475`) | Ánh xạ Page Facebook → HO hoặc một cơ sở | Cấu hình hạ tầng |
| `AdsInsightDaily` (`:615-629`) | Chi phí quảng cáo theo ngày × kênh | Khoá duy nhất `(date, channel)` — **không có chiều cơ sở** |
| `MarketingCostPeriod` (`:603-613`), `MarketingReport` (`:584-595`), `MarketingConfig` (`:1687-1695`) | Kỳ phân bổ chi phí, ảnh chụp báo cáo, cấu hình | |
| `WebhookDelivery` (`:3673-3689`) | Log mọi lần webhook vào + chạy lại | Có màn `/admin/crm/webhook-replay` |

> ⚠️ **KHÔNG có model `Campaign`.** "Chiến dịch" hiện chỉ là chuỗi tự do `Lead.utmCampaign` (`prisma/schema.prisma:978`). Không có ngân sách, không có đối tượng, không có kết quả gắn theo chiến dịch.
> ⚠️ **KHÔNG có model `Source`.** `Lead.source` là `String?` tự do (`:975`), giá trị do từng đường ghi vào ("facebook" / "zalo" / "google-form" / slug khoá học / "Nhập tay"). Không có danh mục chuẩn, không quy nguồn được.

**Nhóm 4 — tiền và hoa hồng**

| Model / thành phần | Ý nghĩa | Vị trí |
|---|---|---|
| `Order` / `OrderItem` / `OrderInstallment` / `OrderStatusHistory` | Đơn hàng, dòng hàng, kế hoạch 2 đợt, lịch sử trạng thái | `:3085`, `:3206`, `:3184`, `:3248` |
| `Payment` | Khoản thu, hai trạng thái độc lập: `saleStatus` (RECORDED / COLLECT_CONFIRMED) và `accountantStatus` (PENDING / CONFIRMED / REJECTED / REFUNDED / ADJUSTED) | `:4899-4910`, `:4918` |
| `CommissionStatement` / `CommissionLine` / `CommissionRateConfig` | Bảng kê hoa hồng theo kỳ, DRAFT→APPROVED→REOPENED | `:521-546`, `:564-577` |
| Engine hoa hồng | 4 tầng: QC 1% · SALE_ADMIN 1% · SALE 4% · QL_TT 2%, trần tổng 8%; **tái tục không có hoa hồng**; hoàn tiền thì thu hồi theo tỷ lệ | `lib/crm/commission.ts:10-17`, `:62`, `:77-88` |

**Nhóm 5 — tích hợp bên ngoài (hiện trạng thật)**

| Tích hợp | Trạng thái thật | Vị trí |
|---|---|---|
| Meta CAPI + GA4 (bắn sự kiện lead) | ✅ đang chạy từ form public | `lib/tracking.ts`; gọi ở `app/api/leads/route.ts:156-186` |
| Meta Ads Insights (kéo chi phí quảng cáo) | ✅ có mã gọi Graph API v21.0 (cần token) | `lib/crm/ads-insights.ts:90` |
| Messenger — **nhận** tin | ✅ có xác thực chữ ký HMAC, chống trùng theo `mid` | `lib/crm/meta-webhook.ts:8-19, 63-104` |
| Messenger — **gửi** tin | ❌ **chỉ ghi vào CSDL, không gọi Send API** | `lib/crm/messenger-service.ts:106-122` |
| Zalo ZNS (tin mẫu đã duyệt gửi tới số điện thoại) | 🟡 có adapter thật, tắt an toàn khi thiếu thông tin xác thực; chỉ gửi thật khi `ZALO_LIVE=true` | `lib/zalo/provider.ts:15` (điểm cuối ZNS), `:39-44` (`hasCredentials`), `:96-98` (`isLive`), `:99-105` (hàm `send`) |
| Zalo — chat OA 2 chiều | ❌ không có | — |
| Zalo — gọi thoại | ❌ không có | — |
| MISA AMIS | 🟡 **khung rỗng có chủ ý** — bật/tắt được, ghi log được; chế độ live trả thẳng `MISA_LIVE_NOT_IMPLEMENTED`; **chưa có nghiệp vụ nào gọi**, chỉ có nút "Chạy thử" | `lib/misa/service.ts:54-105`; `app/(admin)/admin/tich-hop/_actions.ts:28` |
| Email (Resend + hàng đợi) | ✅ nhưng **chỉ giao dịch** — 7 trigger, **không có** email marketing/chiến dịch | `prisma/schema.prisma:3516-3524` |
| **Gọi điện / tổng đài / OMICall** | ❌ **KHÔNG TỒN TẠI** — quét toàn repo `omicall / stringee / click2call / webrtc / SIP / tổng đài` ra **0 kết quả thật** (chỉ dương tính giả từ chữ "atomically") | — |
| Tầng cổng ra `modules/integration` | ❌ **CHƯA TỒN TẠI** — `ls modules/` không có thư mục; `CLAUDE.md:72` tự khai | — |

### A.5 Điểm đứt gãy hiện tại

> Toàn bộ mục này đọc từ mã nguồn, **chưa chạy thử để tái hiện**. Trước khi coi là "lỗi phải vá", cần một test xác nhận. Cột "Mức" là đánh giá của BA.

| Mã | Mức | Điểm đứt gãy | Bằng chứng | Hệ quả nghiệp vụ |
|---|---|---|---|---|
| **ĐG-01** | Cao | **Lead vào qua webhook không tôn trọng cấu hình chia lead và không được gán cơ sở.** Webhook dùng đường phân bổ **cũ** (`autoAssignLead`), luôn luân phiên cứng; hàm trích trường của webhook **không trả `centerId`** nên lead vào luôn để trống cơ sở | `lib/lead/ingest.ts:76` (đường cũ) vs `app/api/leads/route.ts:151` (đường mới); `lib/lead/webhook.ts:187-226` không có `centerId` | Cơ sở đặt chế độ "gán tay" vẫn bị chia tự động; lead Facebook/Zalo/Google Form **vô hình với mọi vai cấp cơ sở** cho tới khi ai đó gán tay |
| **ĐG-02** | Cao | **Ghi đè cứng "đã đồng ý nhận marketing".** Mọi lead vào qua webhook được đặt `consentMarketing = true` bất kể thực tế; thêm 2 form public cũng hardcode | `lib/lead/ingest.ts:70`; `app/(public)/lien-he/_components/contact-form.tsx:123`; `components/legacy-laptrinhrobot/_utils/tracking.ts:113`; mặc định CSDL là `false` (`prisma/schema.prisma:990`) | Cột này được hiển thị cho Sale và **được xuất ra file** như bằng chứng đồng ý (`app/api/admin/leads/export/route.ts`). Nếu khiếu nại, hệ thống **chứng minh sai** |
| **ĐG-03** | Cao | **Đặt tay trạng thái "Đã ghi danh" mà không có học viên/đăng ký/khoản thu nào.** Bộ kiểm chuyển trạng thái chỉ chặn đích `REGISTERED`; mọi đích khác đều cho qua | `lib/leads/status.ts:118-137`, nhánh cuối `return { ok: true }` tại `:136` | Báo cáo chuyển đổi có thể bị thổi phồng; đối soát doanh thu lệch |
| **ĐG-04** | Cao | **Không có tầng "Cơ hội bán hàng".** Một phụ huynh quay lại mua khoá thứ hai không có chỗ ghi — phải mở lead mới (rồi bị chặn vì trùng số) hoặc chỉ tạo `Order` rời | Không có model `Opportunity` trong `prisma/schema.prisma` | Không đo được pipeline theo giai đoạn, không có tỷ lệ thắng, không dự báo doanh số, không đo được doanh thu tái tục |
| **ĐG-05** | Cao | **Pipeline đóng cứng trong mã.** Bậc phễu là enum Prisma; cột Kanban là mảng TypeScript | `prisma/schema.prisma:37-55`; `lib/leads/status.ts` | Mỗi lần Kinh doanh muốn đổi cách quản lý phễu → phải chờ một chu kỳ phát triển + migration + deploy |
| **ĐG-06** | Cao | **Không có nơi lưu chi tiết cuộc gọi.** `LeadActivityType.CALL` chỉ là nhãn nhật ký nhập tay; chi tiết nằm trong `metadata Json?` tự do | `prisma/schema.prisma:2896`, `:2952`; giao diện `app/(admin)/admin/leads/[id]/_components/lead-activity-panel.tsx:85-97` | Không truy vấn được, không báo cáo được, không đo được KPI gọi. Sale gọi bằng máy cá nhân → **không có bản ghi nào trong hệ thống**; nhân viên nghỉ là mất liên hệ khách |
| **ĐG-07** | Trung bình | **SLA-0 không bao giờ kích hoạt trong cron.** Hàm đánh giá được gọi mà **không truyền** `firstMessageAt`/`respondedAt` (hai trường này nằm trên `MessengerConversation`, không nằm trên `Lead`) | `lib/crm/sla.ts:124-135` | Mức SLA nghiêm ngặt nhất (5 phút phản hồi tin nhắn) trên thực tế không được giám sát |
| **ĐG-08** | Trung bình | **SLA-4 dùng sai trường và không loại lead đã mất.** Truyền `lead.updatedAt` thay cho `lastActivityAt` thật; cờ "đã xử lý" không được truyền nên luôn coi là chưa xử lý | `lib/crm/sla.ts:112`, `:131` | Cảnh báo rác cho lead đã `LOST`; nhân viên mất niềm tin vào chuông thông báo |
| **ĐG-09** | Trung bình | **CPL/CPA theo cơ sở đang chia trên tổng chi phí toàn hệ thống.** Truy vấn tổng chi phí quảng cáo **không lọc theo cơ sở**, trong khi số lead thì có lọc | `lib/crm/funnel-query.ts:15` (`db.adsInsightDaily.aggregate` không nhận `centerFilter`) | Chỉ số chi phí/lead của từng cơ sở **sai lệch có hệ thống** — không dùng để ra quyết định được |
| **ĐG-10** | Trung bình | **Quét SLA không phân trang.** Cron đọc toàn bộ bảng lead mỗi lần chạy (15 phút/lần) | `lib/crm/sla.ts:111-119` | Rủi ro hết thời gian chạy khi dữ liệu lớn dần |
| **ĐG-11** | Trung bình | **Bốn dòng lịch sử tách rời.** `LeadActivity` (lead) · `Note` (lead) · `MessengerMessage` (Page) · `ConversationMessage` (phụ huynh ↔ nhân viên) không có màn hình hợp nhất | `prisma/schema.prisma:2944`, `:1087`, `:500` | Không có hồ sơ 360° của khách; nhân viên phải mở nhiều nơi |
| **ĐG-12** | Trung bình | **Hai sổ audit song song.** `LeadAuditLog` riêng + `AuditLog` hợp nhất | `prisma/schema.prisma:2869` và `:394` | Tra soát sự cố phải nhìn hai nơi, dễ sót |
| **ĐG-13** | Trung bình | **Không có màn hình gộp bản ghi trùng.** `LeadDuplicate` chỉ ghi log | `prisma/schema.prisma:2977-2987` | Trùng tồn đọng, không dọn được |
| **ĐG-14** | Trung bình | **Tin nhắn Messenger gửi đi không thật sự gửi.** Hành động "trả lời" chỉ tạo một dòng trong CSDL | `lib/crm/messenger-service.ts:106-122`; `app/(admin)/admin/crm/messenger/actions.ts:25` | Nhân viên tưởng đã trả lời khách; mốc `respondedAt` bị đặt sai ⇒ số liệu SLA phản hồi không đáng tin |
| **ĐG-15** | Thấp–TB | **Việc cần làm của Sale: model còn, giao diện đã gỡ.** Server action `addLeadTask` vẫn sống nhưng trang chi tiết không hiển thị | `app/(admin)/admin/leads/actions.ts:351`; `[id]/page.tsx:53` | Sale không có danh sách việc cần làm trong hệ thống — đang quản lý bằng công cụ ngoài |
| **ĐG-16** | Thấp | **Chống trùng số điện thoại chạy toàn hệ thống, không giới hạn thời gian** khi tạo lead thủ công | `app/(admin)/admin/leads/actions.ts:594-621` | Cơ sở B không tạo được lead hợp lệ khi cơ sở A đã có cùng số (cùng phụ huynh, con khác). Đây là **lựa chọn có chủ ý** (ghi rõ trong `lib/eslint/db-import-allowlist.mjs:14-20`), nhưng gây ma sát vận hành |
| **ĐG-17** | Thấp | **`LeadTransfer` không nằm trong danh sách model được cách ly tự động** — báo cáo phải tự lọc | `lib/db-scope.ts:11-38`; `bao-cao-chuyen/page.tsx:22-30` | Rủi ro rò dữ liệu nếu có màn hình mới quên lọc tay |
| **ĐG-18** | Thấp | **Không có trường tuỳ chỉnh.** Thêm một trường thu thập mới = migration + deploy | — | Kinh doanh không tự bổ sung được thông tin cần theo dõi |
| **ĐG-19** | Nền tảng | **Chưa có tầng cổng gọi dịch vụ ngoài.** `modules/integration` chưa tồn tại; theo audit nội bộ có **17 file gọi thẳng nhà cung cấp ngoài, 9 file nằm ngay trong `app/**`** | `CLAUDE.md:72`; `docs/taicautruc/01-intended-vs-implemented.md:196` | Mỗi tích hợp mới (tổng đài) lại đẻ thêm một đường gọi rời rạc, khó thay nhà cung cấp |
| **ĐG-20** | Nền tảng | **Chưa có đường chạy lại sự kiện `DomainEvent` thất bại.** Webhook có màn replay; `DomainEvent` thì không có trang, không có action, không có cron đọc lại `FAILED` | `docs/taicautruc/01-intended-vs-implemented.md:200` | Nếu nhật ký cuộc gọi đi qua sự kiện, một sự kiện `FAILED` = **mất vĩnh viễn bản ghi đó**, không ai biết |
| **ĐG-21** | Nền tảng | **Bẫy thông báo nhân viên.** Cơ chế "dựng lại chuông" tự đánh dấu **đã đọc** mọi thông báo có khoá chống trùng không nằm trong tập việc-cần-làm sinh sẵn — trong đó có thông báo sinh từ `DomainEvent` | `lib/staff-notifications.ts:70-81` vs `lib/portal/parent-request-notify.ts:83` | `[SUY LUẬN — chưa chạy thử]` Thông báo "cuộc gọi nhỡ" nếu bắn theo cách này sẽ **im lặng biến mất**. **Phải kiểm chứng bằng test trước khi thiết kế** |

---

## 4. PHẦN B — MISA LÀM NHƯ THẾ NÀO

### B.0 Cảnh báo trước khi đọc

1. **MISA bán ba sản phẩm dễ bị gọi nhầm là một.** `[WEB]` N2:

| Tên | Bản chất | Số tính năng |
|---|---|---|
| **AMIS CRM** | Bản đầy đủ, nằm trong nền tảng MISA AMIS, tích hợp sâu hệ sinh thái (Kế toán, Khuyến mại, Công việc, aiMarketing, WeSign, Mua hàng) | 31 |
| **MISA CRM 2** | Gần bằng AMIS CRM, thiếu đúng 2 thứ: tích hợp hệ sinh thái AMIS và Cổng tự đặt hàng cho nhà phân phối | 30 |
| **MISA CRM** (đời cũ) | Chỉ mức cơ bản, giá cao hơn, dung lượng giới hạn | 9 |

→ Khi tài liệu này nói "mô hình MISA", nghĩa là **AMIS CRM**. Đây là bản MISA đang bán và đang viết tài liệu.

2. **Mốc thời gian nguồn.** Bảng so sánh tính năng gốc có mốc **08/2024** `[WEB]` N2 — gần hai năm. Số tính năng có thể đã đổi. Bảng giá lấy từ trang chính thức hiện hành `[WEB]` N4.
3. **Nội dung web trong mục này là diễn giải, không phải trích nguyên văn**, trừ các đoạn trong ngoặc kép. Trước khi đưa vào tài liệu ký duyệt, cần mở lại URL đối chiếu tay.
4. **Không có tài liệu nội bộ nào của Sata Robo nói về hợp đồng/gói MISA đang dùng.** `[CHƯA KIỂM CHỨNG]` — repo chỉ có khung kỹ thuật `PUSH_INVOICE` / `PUSH_PAYMENT` (`lib/misa/service.ts:41`).

### B.1 Bản đồ phân hệ — khung sườn để sao chép

MISA chia AMIS CRM thành **5 nhóm**. `[WEB]` N3 (cổng tài liệu chính thức `helpcrm.misa.vn`).

**Nhóm "Hướng dẫn nghiệp vụ" — 34 phân hệ:**

| Cụm chức năng | Phân hệ |
|---|---|
| **Đối tượng CRM lõi** | Tiềm năng · Khách hàng · Liên hệ · Cơ hội · Ao cơ hội |
| **Chứng từ bán hàng** | Báo giá · Đơn hàng · Hoá đơn · Trả lại hàng bán · Đơn hàng NPP · Trả hàng NPP · Yêu cầu mua hàng |
| **Danh mục** | Hàng hoá · Loại hàng hoá · Loại khách hàng · Chính sách giá |
| **Tương tác / chăm sóc** | Hoạt động · Thẻ tư vấn · Thẻ chăm sóc · Lịch sử tin nhắn · Tin nhắn hàng loạt |
| **Marketing** | Chào hàng, Chiến dịch · aiMarketing |
| **Quản trị đội ngũ** | Mục tiêu · Đi tuyến · Dự án bán hàng |
| **Sau bán** | Phiếu bảo hành |
| **Cạnh tranh** | Đối thủ |
| **Kho / logistics** | Tra cứu tồn kho · Tuyến vận chuyển |
| **Kênh đối tác** | Cổng thông tin |
| **Điều hướng & báo cáo** | Bàn làm việc · Báo cáo · Tiện ích chung |

**Nhóm "Thiết lập" — 10 mục:** Thiết lập chung · Thiết lập cá nhân · **Phân quyền** · Kênh bán hàng · **Tuỳ chỉnh** · **Quy trình tự động** · **Quy tắc tự động** · Quản trị dữ liệu · **Kết nối** · **Kết nối MISA**.

> **Nhận xét BA — đây là bài học kiến trúc đáng giá nhất của MISA:** hệ thống tách rõ **ba tầng** — (1) đối tượng nghiệp vụ, (2) thiết lập/cấu hình, (3) tự động hoá. Và tầng (3) lại tách làm hai loại rất khác nhau: **"Quy trình tự động"** (chuỗi bước, có phê duyệt) và **"Quy tắc tự động"** (luật đơn lẻ: chấm điểm, phân bổ, xếp hạng). Sata Robo hiện gộp cả ba tầng vào mã nguồn.

### B.2 Vòng đời khách hàng theo MISA

```
Chiến dịch / Webform / Facebook / Zalo OA / nhập tay
                    │
                    ▼
              TIỀM NĂNG  (có chấm điểm, phân bổ tự động, phát hiện & gộp trùng)
                    │  ── CHUYỂN ĐỔI (một lần, sinh tối đa 3 bản ghi) ──▶
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   KHÁCH HÀNG    LIÊN HỆ     CƠ HỘI ──▶ BÁO GIÁ ──▶ ĐƠN HÀNG ──▶ HOÁ ĐƠN ──▶ CÔNG NỢ
        │           │           │                       │
        │           │           │                       ├──▶ Trả lại hàng bán
        │           │           │                       └──▶ Phiếu bảo hành
        └───────────┴───────────┴──◀── HOẠT ĐỘNG (gọi điện · gặp gỡ · nhiệm vụ · email)
                                └──◀── ĐỐI THỦ (gắn vào cơ hội để phân tích thắng/thua)
```

**Bốn đối tượng Sata Robo chưa có, giải thích ngắn:**

| Đối tượng MISA | Vai trò | Nguồn |
|---|---|---|
| **Liên hệ (Contact)** | Người cụ thể thuộc một Khách hàng. Có phân hệ riêng, có chấm điểm riêng | `[WEB]` N3 |
| **Cơ hội (Opportunity)** | Thương vụ đang theo đuổi. **Đây là nơi chạy quy trình bán hàng theo giai đoạn.** Xem lại được thông tin tiềm năng gốc; ghi nhận được cơ hội do đối tác/CTV giới thiệu; gọi điện được ngay trên cơ hội | `[WEB]` N8 |
| **Báo giá (Quote)** | Chứng từ chào giá; chuyển thành đơn hàng; ký số qua AMIS WeSign | `[WEB]` N18, N5 |
| **Chiến dịch (Campaign)** | Gom tiềm năng/liên hệ/khách hàng vào một đợt tiếp cận; gửi SMS và gọi nhanh ngay từ giao diện chiến dịch | `[WEB]` N15 |
| **Ao cơ hội** | Kho cơ hội chưa có chủ để Sale "nhận" về | `[WEB]` N3 — `[CHƯA KIỂM CHỨNG]` cơ chế nhận/trả, hết hạn |

### B.3 Số phận của Tiềm năng sau khi chuyển đổi — điểm thiết kế quan trọng nhất

`[WEB]` N24 (bài hỏi–đáp chính thức của MISA):

| Câu hỏi | Trả lời của MISA |
|---|---|
| Tiềm năng có bị xoá không? | **Không.** Bản ghi vẫn còn trong hệ thống |
| Hiển thị thế nào? | Hiện thông báo *"Tiềm năng đã được chuyển đổi sang Khách hàng, Liên hệ, Cơ hội tương ứng"* |
| Còn thao tác được không? | **Không.** Trở thành **chỉ-đọc, không tác nghiệp** |
| Vì sao vẫn giữ? | **Để kiểm tra trùng dữ liệu** — lead mới được đối chiếu cả với lead đã chuyển đổi |
| Lịch sử đi đâu? | Ghi chú, nhiệm vụ, cuộc gọi, thẻ **chuyển sang bản ghi nghiệp vụ mới sinh ra** |
| Nhìn ngược lại được không? | **Được** — từ Khách hàng/Cơ hội xem lại được thông tin tiềm năng gốc `[WEB]` N8 |

> **Bài học:** MISA dùng mô hình **"lead đóng băng + con trỏ hai chiều"**, không dùng mô hình "một bản ghi đổi loại". Sata Robo hiện mới có **một chiều** (`convertedById` / `convertedAt` — `prisma/schema.prisma:994-995`), thiếu chiều ngược từ học viên nhìn về lead gốc.

### B.4 Quy trình bán hàng cấu hình được — phần đáng sao chép nhất

`[WEB]` N6.

**Nơi cấu hình:** Tuỳ chỉnh → Quy trình bán hàng (hoặc Tuỳ chỉnh → Phân hệ và trường → chọn phân hệ Cơ hội). Nghĩa là **giai đoạn bán hàng là dữ liệu cấu hình gắn vào phân hệ Cơ hội, không nằm trong mã**.

**Mỗi giai đoạn có 4 thuộc tính sửa được:**

| Thuộc tính | Ý nghĩa |
|---|---|
| Tên giai đoạn | Nhãn hiển thị |
| **Tỷ lệ thành công (%)** | Xác suất thắng khi cơ hội đang ở giai đoạn này → dùng để **tính doanh số dự kiến** |
| Loại dự báo | Phân loại phục vụ dự báo |
| Phân loại dự báo | Phân loại phục vụ dự báo |

**Thao tác quản lý:** thêm/xoá giai đoạn · **kéo thả sắp xếp thứ tự** · **"Thêm từ giá trị chưa sử dụng"** (khôi phục giai đoạn đã ẩn) · cấu hình "ngày kỳ vọng" (không gợi ý, hoặc tự tính = ngày tạo + N ngày).

> **Hai bài học:**
> 1. MISA **không xoá cứng** giá trị giai đoạn — nó ẩn đi và cho khôi phục. Đây đúng là mô hình hai pha mà Sata Robo đang dùng cho enum (`prisma/schema.prisma:51` — `DEMO_SCHEDULED // deprecated … giữ cho back-compat`).
> 2. "Tỷ lệ thành công" gắn vào giai đoạn là thứ biến pipeline từ **bảng theo dõi** thành **công cụ dự báo doanh số**. Sata Robo hiện không có.

**Kết thúc cơ hội:** khi chuyển sang "Hoàn thành thành công" hoặc "Hoàn thành thất bại", nhân viên **bắt buộc khai báo lý do thắng/thua** `[WEB]` N23. Kèm theo là các báo cáo cho lãnh đạo "hiểu được lý do thắng/thua của từng cơ hội".
> `[CHƯA KIỂM CHỨNG]` Danh mục lý do thua chuẩn của MISA là danh sách chọn cấu hình được hay nhập tự do.

**Nhắc cơ hội bị bỏ quên:** "khi một cơ hội chưa được nhân viên kinh doanh chăm sóc thì hệ thống sẽ thông báo tới nhân viên phụ trách hay quản lý" `[WEB]` N5 *(trang giới thiệu sản phẩm — mức tin cậy trung bình)*.

### B.5 Tự động hoá — MISA tách làm hai loại

#### B.5.1 "Quy trình tự động" — 5 nhánh `[WEB]` N12

| Nhánh | Nội dung |
|---|---|
| Quy trình làm việc (Workflow) | Xem B.5.2 |
| Quy trình phê duyệt | Xem B.5.3 |
| Quy trình ghi doanh số | Duyệt/từ chối việc ghi nhận doanh số cho đơn hàng |
| Quy trình chăm sóc | Kịch bản chăm sóc khách hàng tự động |
| Hành động trong quy trình | Thư viện hành động dùng chung |

#### B.5.2 Quy trình làm việc `[WEB]` N27 — bản thiết kế engine hoàn chỉnh

| Hạng mục | Nội dung |
|---|---|
| **Phạm vi áp dụng** | Tiềm năng, Cơ hội, Khách hàng, Đơn hàng, Liên hệ, Hoá đơn, Chiến dịch **và hơn 20 phân hệ khác** |
| **Giới hạn** | *"Hệ thống đáp ứng kích hoạt tối đa 10 Quy trình làm việc cho 1 phân hệ"* |
| **Điều kiện kích hoạt** | Thêm · Thêm hoặc sửa · Sửa · Xoá |
| **Hành động tự động** | ① Cập nhật trường ② Gửi email (cho khách hoặc nội bộ) ③ Giao nhiệm vụ ④ Bàn giao theo quy tắc phân bổ ⑤ Gửi thông báo / SMS / Zalo ZNS ⑥ Thêm thẻ chăm sóc (chỉ phân hệ Đơn hàng) ⑦ Ghi doanh số tự động |
| **Quản lý** | Lọc theo phân hệ · **sắp xếp thứ tự ưu tiên** · **phải ngừng kích hoạt mới sửa được** · nhân bản · xoá |

> **Bốn chi tiết đáng học:** (a) bộ kích hoạt theo CRUD chuẩn, (b) danh sách hành động **hữu hạn, có thứ tự ưu tiên** — không phải ngôn ngữ lập trình tự do, (c) giới hạn 10 quy trình/phân hệ để chống vòng lặp và loạn thứ tự, (d) **phải tắt mới sửa được** — chống sửa nóng khi đang chạy.

#### B.5.3 Quy trình phê duyệt nhiều cấp `[WEB]` N28

Có quy trình mẫu tạo nhanh; **phê duyệt đơn hàng theo điều kiện giá** (đơn có đơn giá thấp hơn mức sàn → bắt buộc duyệt); thông báo ngược lên các cấp đã duyệt; gửi email + giao nhiệm vụ kèm tệp đính kèm. Áp dụng cho báo giá, đơn hàng, giảm giá.

> **Đáng lấy nguyên cho Sata Robo:** "duyệt khi giá bán dưới mức sàn" chính là bài toán **duyệt học phí/chiết khấu ngoại lệ** mà Sata Robo hiện chỉ có ở đúng một chỗ (duyệt kế hoạch trả 2 đợt — `prisma/schema.prisma:3178`).

#### B.5.4 "Quy tắc tự động" — 3 luật `[WEB]` N13b

| Quy tắc | Nội dung đã xác nhận |
|---|---|
| **Quy tắc phân bổ** | Thiết lập/sửa/xoá/áp dụng quy tắc phân bổ tiềm năng và khách hàng cho nhân viên. **Gắn với webform, Facebook, Zalo.** Có thông báo cho người được phân `[WEB]` N29 |
| **Quy tắc chấm điểm** | Áp dụng cho **4 phân hệ**: Tiềm năng, Khách hàng, Liên hệ, Cơ hội. Chấm dựa trên "các đặc điểm và hoạt động". Cấu hình bằng thêm/xoá điều kiện + **"Sửa công thức"** ⇒ có **biểu thức logic ghép điều kiện**, không chỉ AND phẳng. Mục đích: đánh giá mức độ quan tâm và trung thành để ưu tiên chăm sóc `[WEB]` N30 |
| **Xếp hạng khách hàng** | Xác nhận tồn tại — `[CHƯA KIỂM CHỨNG]` chi tiết |

> `[CHƯA KIỂM CHỨNG]` Thuật toán phân bổ cụ thể (luân phiên / theo khu vực / theo tải / theo tỷ lệ chốt) và công thức chấm điểm (thang điểm, ngưỡng nóng/lạnh) — tài liệu mục lục không nêu, bài chi tiết không đọc được.

#### B.5.5 Webform

Có trong bảng tính năng và được nhắc trong quy tắc phân bổ `[WEB]` N1, N29. Trang `/ac/webform/` **trả HTTP 404** khi truy cập → `[CHƯA KIỂM CHỨNG]` luồng cấu hình.

### B.6 Gọi điện trong CRM — mô hình MISA

`[WEB]` N11 (bài hướng dẫn thiết lập tổng đài điện thoại) và N32 (bài hướng dẫn gọi điện bằng tổng đài).

**MISA hỗ trợ chính thức 8 nhà cung cấp tổng đài:**
> Stringee · CMC · STelecom · VCC · **OMICall** · VOIP24H · FPT OnCall · FPT OnCallCX

**Thông tin cấu hình theo nhà cung cấp:**

| Nhà cung cấp | Thông tin bắt buộc |
|---|---|
| Stringee, CMC, STelecom, VCC | App ID + Secret Key |
| **OMICall** | **Api-key + Domain** |
| VOIP24H | ApiKey + IP Server |
| FPT OnCall | Username + Password |

**Đường dẫn cấu hình:** Thiết lập → Kênh bán hàng → **Tổng đài** → chọn nhà cung cấp. Sau khi kết nối: tạo hoặc nhập **số máy lẻ** → chọn đầu số → **chỉ định nhân viên được gán**.

**Ma trận năng lực theo nhà cung cấp:**

| Năng lực | Nhà cung cấp hỗ trợ |
|---|---|
| Ghi âm cuộc gọi | Stringee, CMC, **OMICall**, VOIP24h, FPT OnCall |
| Ghi nhận cuộc gọi nhỡ | Stringee, **OMICall**, VOIP24H, FPT OnCall, FPT OnCallCX |
| Gọi trên ứng dụng di động | **Chỉ Stringee** |
| Chuyển tiếp cuộc gọi | **Chỉ Stringee** |
| Bảo mật số điện thoại khách (ẩn/hiện) | Tính năng chung của CRM |

**Luồng gọi ra:** bấm số ở cột liên hệ trong danh sách khách hàng, hoặc bấm biểu tượng gọi trong màn hình chi tiết rồi chọn số. Gọi được từ: **Tiềm năng, Khách hàng, Cơ hội, Đơn hàng, Báo giá, Hoá đơn, Hoạt động, Chào hàng/Chiến dịch**.

**Luồng gọi vào:** hệ thống hiện **cửa sổ cuộc gọi đến** kèm chuông; **tự động tra ngược cơ sở dữ liệu** để nhận diện người gọi theo thứ tự ưu tiên **Khách hàng → Liên hệ → Tiềm năng**; nếu là số lạ thì cho phép **gắn cuộc gọi vào một bản ghi khách hàng mới** `[WEB]` N16.

**Ghi nhận sau cuộc gọi:**
- **Mọi cuộc gọi — thành công hay không — đều tự động được ghi thành một Hoạt động.**
- Trường ghi nhận: ngày bắt đầu gọi · thời lượng · ngày kết thúc · **kết quả cuộc gọi**.
- **File ghi âm** truy cập qua liên kết trong chi tiết hoạt động (với tổng đài hỗ trợ).
- **Cuộc gọi nhỡ** → tạo hoạt động với *kết quả = cuộc gọi nhỡ*.
- **Tạo đơn hàng ngay trong lúc đang gọi.**

> **Điểm cốt lõi để sao chép:** trong MISA, **cuộc gọi không phải một đối tượng riêng — nó là một `Hoạt động` loại "gọi điện"**, có kết quả, thời lượng và liên kết ghi âm. Sata Robo đã có sẵn `LeadActivityType.CALL` (`prisma/schema.prisma:2896`) — cùng ý tưởng, chỉ thiếu phần tự động và phần dữ liệu có kiểu.

### B.7 Zalo trong MISA — chỉ là kênh CHAT, không phải kênh GỌI

`[WEB]` N13:

| Hạng mục | Nội dung |
|---|---|
| Gói yêu cầu | **Chỉ gói Professional và Enterprise** |
| Đường dẫn | Thiết lập → Kênh bán hàng → **Mạng xã hội** → tab Zalo Official Account |
| Sử dụng | Phân hệ Mạng xã hội → tab **Tin nhắn** → chọn tài khoản OA → **chat** |
| Thu lead | Nút **"Thêm vào CRM"** → liên kết liên hệ có sẵn hoặc tạo mới |
| Giới hạn 1 | Tối đa **20 tài khoản Zalo OA** |
| Giới hạn 2 | **Chỉ hiển thị tin nhắn từ sau thời điểm kết nối thành công** (không kéo lịch sử cũ) |
| Giới hạn 3 | Từ 01/08/2022 cần gói cước **Nâng cao/Premium** của Zalo |
| Giới hạn 4 | **CRM không nhận tin nếu khách chưa theo dõi Official Account** |

> ⚠️ **Trả lời thẳng cho yêu cầu gốc:** trong mô hình MISA, **Zalo OA là kênh nhắn tin, không phải kênh gọi điện**. Kênh gọi điện là **tổng đài VOIP** (§B.6), trong đó có OMICall. Zalo còn xuất hiện dưới dạng **ZNS** (gửi tin mẫu chăm sóc) — cũng không phải gọi.
> → **Yêu cầu "gọi điện qua OMICall" hoàn toàn khớp mô hình MISA. Yêu cầu "gọi điện qua Zalo OA" thì không.** Chi tiết kỹ thuật về khả năng thoại của Zalo nằm ở §D.2.6.

### B.8 Phân quyền — mô hình 4 lớp của MISA

`[WEB]` N9, N10.

| Lớp | Nội dung | Sata Robo tương ứng |
|---|---|---|
| **Người dùng** | Quản lý tài khoản | `User` |
| **Vai trò** | Định nghĩa vai trò, gán quyền chức năng | `RoleDef` + `RolePermission` (v2) / ma trận tĩnh (v1) |
| **Quyền dữ liệu** | Phạm vi bản ghi được xem/sửa: bản ghi riêng · của nhóm · của phòng ban cấp dưới · toàn công ty. **Quy tắc chia sẻ theo cơ cấu tổ chức, tự cập nhật khi đổi phòng ban** | `UserOrgRole` + `scopedDb` |
| **Dữ liệu nhạy cảm** | Che/mở trường nhạy cảm (ví dụ ẩn/hiện số điện thoại khách) | `leads:view-pii` + `lib/lead/pii.ts` |

**Chênh lệch duy nhất đáng kể:** MISA có **chia sẻ bản ghi lẻ cho người dùng cụ thể**; Sata Robo mới có chia sẻ ở mức "cả cơ sở" (`Lead.isSharedWithTeam` — `prisma/schema.prisma:971`).

### B.9 Quản lý đội ngũ và báo cáo

| Hạng mục | Nội dung MISA | Nguồn |
|---|---|---|
| **Mục tiêu** | 3 loại: Doanh số · Số lượng · Sản phẩm. Giao từ **Ban Giám đốc → phòng ban → từng nhân viên**, gắn vào **cơ cấu tổ chức** (không gắn cứng vào người). Cập nhật theo Tuần/Tháng/Quý/Năm, import/export hàng loạt, theo dõi tiến độ | `[WEB]` N25, N22 |
| **Đi tuyến** | Theo dõi lộ trình di chuyển thực tế của nhân viên kinh doanh · giám sát trên bản đồ · phân tuyến · tạo tuyến · quản lý danh sách tuyến. Có bản di động riêng | `[WEB]` N26, N3 |
| **Affiliate / CTV** | Có trong bảng tính năng; xác nhận cụ thể: cơ hội ghi nhận được **"do đối tác/CTV giới thiệu"**. `[CHƯA KIỂM CHỨNG]` cơ chế hoa hồng | `[WEB]` N1, N8 |
| **Báo cáo** | "trên 20 loại báo cáo"; hai điểm truy cập: phân hệ Báo cáo và Bàn làm việc. Quản lý thư mục báo cáo · báo cáo yêu thích · **thêm cột tính toán** · **phân quyền xem theo từng báo cáo** · "Thiết lập báo cáo thông minh" (tự dựng) | `[WEB]` N22, N35, N1 |

> ⚠️ Mô tả "check-in GPS, chụp ảnh" trong Đi tuyến xuất hiện ở bản tóm tắt công cụ nhưng **không xác nhận được câu gốc của MISA** → `[CHƯA KIỂM CHỨNG]`. Tuy vậy có một điểm đáng chú ý cho tài liệu song sinh: **MISA đặt "đi tuyến + lộ trình bản đồ" trong CRM, không đặt trong Chấm công.** Đây là ranh giới nghiệp vụ đáng tham khảo.

### B.10 Hệ sinh thái MISA — phát hiện quan trọng cho dự án

`[WEB]` N34. AMIS CRM kết nối với: **AMIS Kế toán · aiMarketing · WeSign · Quy trình–Mua hàng · Tiền lương · AMIS Chấm công · Công việc**. Dữ liệu đồng bộ gồm: dữ liệu khách hàng và **nhân viên** · hoá đơn bán hàng và trả lại · đề nghị mua hàng · sản phẩm combo · **danh mục dùng chung giữa các ứng dụng**.

> 🔴 **AMIS Chấm công nằm cùng hệ sinh thái và dùng chung danh mục nhân viên với CRM.** Nghĩa là trong mô hình MISA, CRM và Chấm công **không phải hai hệ rời** — chúng chia sẻ **một danh mục nhân viên + một cơ cấu tổ chức**. Đây là luận cứ mạnh để Sata Robo giữ **một `Employee` và một `OrgUnit` duy nhất** dùng chung cho cả hai module. Tài liệu song sinh về Chấm công dùng chung kết luận này.

### B.11 Giá tham chiếu

`[WEB]` N4 (bảng giá chính thức):

| Gói | VNĐ/người dùng/tháng | 10 người dùng/tháng | Số tính năng |
|---|---|---|---|
| Starter | 55.000 | 550.000 | 11 |
| Standard | 85.000 | 850.000 | 14 |
| Professional | 105.000 | 1.050.000 | 22 |
| Enterprise | 120.000 | 1.200.000 | 30 |

Ràng buộc: cam kết tối thiểu **12 tháng**; cấu hình cơ sở 10 người dùng, mở rộng theo bước 3 người; báo giá riêng cho đội từ 20 Sale.

> **Đối chiếu:** 120.000 × 10 × 12 = **14.400.000 đ/năm** — trùng khít con số trong bảng so sánh 08/2024 `[WEB]` N1. `[SUY LUẬN]` Con số đó chính là **gói Enterprise, 10 người dùng**.
> ⚠️ `[CHƯA KIỂM CHỨNG]` Một nguồn khác nêu Standard 80.000 / Professional 100.000 — mâu thuẫn với N4. **Không dùng số đó.**
> **Điểm quan trọng về phân tầng gói:** kết nối Zalo OA **chỉ có ở Professional và Enterprise** `[WEB]` N13. `[SUY LUẬN]` các tính năng tự động hoá/đa kênh khác cũng phân tầng tương tự. Nếu Sata Robo tự xây thì **không có ràng buộc gói** — đây là lợi thế cần cân nhắc ở §G câu Q1.

---

## 5. PHẦN C — BẢNG ĐỐI CHIẾU (GAP)

> **Cách đọc cột "Quyết định đề xuất":**
> **LẤY CỦA MISA** = sao chép mô hình MISA · **GIỮ CỦA SATA** = giữ nguyên cách làm hiện tại vì tốt hơn hoặc đặc thù · **LAI GHÉP** = lấy khung MISA nhưng đổ nội dung Sata Robo · **BỎ** = không đưa vào phạm vi.
> **Cột "Shadow"** = đề xuất này có chạm vùng shadow-compare RBAC đang chạy không (🔴 = có, ⚪ = không, 🟡 = ranh giới).

### C.1 Đối tượng nghiệp vụ

| Hạng mục | Sata Robo hiện tại | MISA | Chênh lệch | Quyết định đề xuất | Shadow |
|---|---|---|---|---|---|
| Khách tiềm năng | ✅ `Lead` đầy đủ nhất hệ thống: 15 trạng thái, 7 mốc phễu, UTM đầy đủ, consent, chia sẻ nhóm (`prisma/schema.prisma:957-1061`) | Tiềm năng, có chấm điểm + phân bổ + gộp trùng | Ngang nhau về dữ liệu; MISA hơn về chấm điểm và gộp trùng | **GIỮ CỦA SATA**, bổ sung chấm điểm + màn gộp trùng | ⚪ |
| Khách hàng (đã mua) | ⚠️ Gián tiếp — sau chuyển đổi thành `User(PARENT)` + `Student`. **Không có hồ sơ 360° hợp nhất trước/sau chuyển đổi** | Khách hàng có dòng thời gian giao dịch, lịch sử trao đổi, "ngừng theo dõi" | Sata Robo mất mạch lịch sử tại điểm chuyển đổi | **LAI GHÉP** — không đẻ model "Khách hàng" mới; dựng **màn hình Hồ sơ gia đình 360°** gộp Lead + Parent + Student + Order (xem D.5) | ⚪ |
| Người liên hệ | ❌ Chỉ một cặp `parentName` + `phone` trên lead | Liên hệ là phân hệ riêng, nhiều liên hệ/khách hàng | Không hỗ trợ 2 phụ huynh / ông bà / người trả tiền khác người quyết định | **LẤY CỦA MISA** — thêm khái niệm **Người liên hệ của gia đình** (nhiều người, có vai trò, có người liên hệ chính) | ⚪ |
| **Cơ hội bán hàng** | ❌ **Không có.** Vai trò bị gộp vào `Lead` + `Order` | Cơ hội là trung tâm quản trị bán hàng | **Khoảng cách lớn nhất.** Phụ huynh mua khoá 2 không có chỗ ghi; không đo được tỷ lệ thắng theo giai đoạn; không dự báo | **LẤY CỦA MISA** — thêm **Nhu cầu học** (= Cơ hội) gắn theo **từng học viên**, xem D.1 | ⚪ |
| Ao cơ hội | ❌ Không có | Có | Sata Robo có `isSharedWithTeam` làm việc gần giống | **GIỮ CỦA SATA** ở giai đoạn này — mở rộng "dùng chung" thay vì đẻ khái niệm mới | ⚪ |
| Báo giá | ❌ Nhảy thẳng Lead → `Order` | Báo giá có phiên bản, gửi khách, ký số | Không có bản nháp giá gửi phụ huynh xem trước | **LẤY CỦA MISA nhưng rút gọn** — Báo giá khoá/gói ở dạng nhẹ (in/gửi được, chuyển thành đơn), **không làm ký số** giai đoạn này | ⚪ |
| Đơn hàng | ✅ `Order` + `OrderItem` + `OrderInstallment` + lịch sử trạng thái | Đơn hàng + đề nghị/duyệt ghi doanh số | Sata Robo thiếu "duyệt ghi doanh số" | **GIỮ CỦA SATA**, bổ sung bước duyệt ngoại lệ (xem C.3) | ⚪ |
| Hoá đơn / công nợ | ✅ `Payment` hai tầng trạng thái + `Receipt` + nhắc công nợ | Hoá đơn đồng bộ sang AMIS Kế toán | Sata Robo tự chủ, khác cách | **GIỮ CỦA SATA** | ⚪ |
| Sản phẩm / bảng giá | 🟡 Có `Course.price`, `Product`, `CourseDiscount`, `Voucher`, `Promotion` — nhưng đường chuyển đổi **ép `discount: null`** (`app/(admin)/admin/leads/[id]/convert/actions.ts:104,123`) | Hàng hoá + loại hàng hoá + chính sách giá, chọn theo mã quy cách kèm tồn kho | Ưu đãi không đi qua đường chuyển đổi | **GIỮ CỦA SATA** + **vá lỗ ưu đãi** ở đường chuyển đổi | ⚪ |
| **Chiến dịch** | ❌ Chỉ chuỗi tự do `utmCampaign` (`:978`) | Chiến dịch là đối tượng: gom danh sách, gửi SMS, gọi nhanh từ giao diện chiến dịch | Không đo được hiệu quả marketing ngoài UTM thô | **LẤY CỦA MISA** — thêm **Chiến dịch** + **Danh mục nguồn** chuẩn | ⚪ |
| Hợp đồng | ❌ Không có | Không phải phân hệ riêng của MISA (dùng WeSign) | — | **BỎ** khỏi phạm vi này | — |
| Đối thủ | ❌ Không có | Có, gắn vào cơ hội để phân tích thắng/thua | B2C giáo dục địa phương ít giá trị | **BỎ** — thay bằng **danh mục lý do thua** có sẵn "chọn trung tâm khác" | ⚪ |
| Phiếu bảo hành | ❌ Không có | Có | Không áp dụng cho khoá học; robot/KIT bán ra thì có thể cần | **BỎ** giai đoạn này, ghi nhận là nhu cầu tương lai | — |
| Thẻ chăm sóc / ticket | 🟡 `ParentRequest` (cổng phụ huynh) tồn tại nhưng **không nối vào CRM** | Thẻ chăm sóc / thẻ tư vấn có người xử lý | Yêu cầu của phụ huynh và lịch sử CRM là hai thế giới | **LAI GHÉP** — nối `ParentRequest` vào dòng thời gian 360° thay vì đẻ ticket mới | ⚪ |
| **Cuộc gọi** | ❌ Chỉ nhãn nhập tay `LeadActivityType.CALL` (`:2896`), chi tiết nằm trong JSON tự do (`:2952`) | Cuộc gọi = một Hoạt động, tự sinh, có kết quả/thời lượng/ghi âm | **Khoảng cách trọng tâm của yêu cầu này** | **LẤY CỦA MISA** — xem toàn bộ §D.2.5 | ⚪ (bảng mới) / 🔴 (nếu thêm quyền `calls:*`) |

### C.2 Quy trình

| Hạng mục | Sata Robo hiện tại | MISA | Chênh lệch | Quyết định đề xuất | Shadow |
|---|---|---|---|---|---|
| **Pipeline cấu hình được** | ❌ Hardcode: enum Prisma (`:37-55`) + mảng TypeScript (`lib/leads/status.ts`) | Cấu hình từ giao diện, kéo thả, ẩn/khôi phục | Đổi phễu = migration + deploy | **LẤY CỦA MISA** — bảng giai đoạn cấu hình được, hai pha (giữ enum cũ làm giá trị hệ thống) | ⚪ |
| Tỷ lệ thành công theo giai đoạn | ❌ Không có | ✅ Có, dùng để tính doanh số dự kiến | Không dự báo được | **LẤY CỦA MISA** | ⚪ |
| Nhiều pipeline song song | ❌ Một pipeline duy nhất | Pipeline gắn phân hệ Cơ hội | Không tách được tuyển sinh mới / tái tục / bán robot | **LẤY CỦA MISA** — 3 quy trình: Khoá học · Tái tục · Sản phẩm robot/KIT | ⚪ |
| Lý do thắng/thua | ❌ Không bắt buộc; `LOST` không có lý do có cấu trúc | ✅ **Bắt buộc khai báo** khi kết thúc | Không biết vì sao mất khách | **LẤY CỦA MISA** | ⚪ |
| **Chấm điểm tiềm năng** | ❌ Không có trường điểm, không có quy tắc | ✅ 4 phân hệ, có công thức ghép điều kiện | Không ưu tiên được lead | **LẤY CỦA MISA nhưng đơn giản hoá** — luật cộng/trừ điểm theo bảng, **không làm trình soạn công thức** giai đoạn 1 | ⚪ |
| **Phân bổ tự động** | 🟡 3 chế độ theo cơ sở (`LeadAssignMode`), nhưng **webhook bỏ qua cấu hình** (ĐG-01) và không có luật theo nguồn/khoá/khu vực | Quy tắc phân bổ gắn với webform/Facebook/Zalo, có thông báo người nhận | Sata Robo có nền tốt nhưng đứt ở đường webhook | **LAI GHÉP** — **vá ĐG-01 trước** (dùng chung một đường phân bổ), rồi mở rộng thành luật có điều kiện | ⚪ |
| Quy trình phê duyệt nhiều cấp | 🟡 Chỉ có ở tiền (duyệt kế hoạch 2 đợt — `prisma/schema.prisma:3178`) | Engine chung, có mẫu, có điều kiện giá sàn | Chiết khấu học phí ngoại lệ đang không có đường duyệt | **LẤY CỦA MISA** — duyệt khi giá dưới sàn / chiết khấu vượt ngưỡng | ⚪ |
| Nhắc việc / lịch làm việc của Sale | ⚠️ **Model có, giao diện đã gỡ** (ĐG-15) | Nhiệm vụ gắn hoạt động, giao từ workflow | Sale đang dùng công cụ ngoài | **GIỮ CỦA SATA** (bật lại `LeadTask`) + **LẤY CỦA MISA** phần giao nhiệm vụ tự động | ⚪ |
| **Kịch bản chăm sóc tự động** | ❌ Không có trình tạo luồng; mọi tự động là mã cứng (cron + `DomainEvent`) | ✅ Quy trình làm việc: 4 kích hoạt × 7 hành động, tối đa 10/phân hệ | Mỗi "nếu… thì…" mới đều phải viết mã | **LẤY CỦA MISA nhưng thu hẹp** — bộ hành động **hữu hạn**, chạy trên `DomainEvent` sẵn có | ⚪ |
| Dự báo doanh số | ❌ `RevenueTarget` chỉ là mục tiêu KPI (`:5042`) | Dự báo theo cơ hội × tỷ lệ thành công | Không có | **LẤY CỦA MISA** (hệ quả của pipeline + cơ hội) | ⚪ |
| Mục tiêu & bảng xếp hạng Sale | 🟡 Có nhóm theo người phụ trách trên dashboard, không có mục tiêu từng người | 3 loại mục tiêu, giao theo **cơ cấu tổ chức** | Không giao chỉ tiêu trong hệ thống | **LẤY CỦA MISA** — mục tiêu gắn `OrgUnit`, khớp kiến trúc sẵn có | ⚪ |
| Màn hình gộp bản ghi trùng | ❌ Chỉ log `LeadDuplicate` | ✅ Có phát hiện + gộp | Trùng tồn đọng | **LẤY CỦA MISA** | ⚪ |
| **Lead sau chuyển đổi** | 🟡 Khoá về `ENROLLED`, chỉ có con trỏ một chiều | **Đóng băng chỉ-đọc + con trỏ hai chiều**, vẫn dùng để chống trùng | Không nhìn ngược từ học viên về lead gốc | **LẤY CỦA MISA** — bổ sung chiều ngược | ⚪ |
| Nhật ký 360° | ❌ 4 dòng lịch sử tách rời (ĐG-11) | Hoạt động gắn được vào mọi đối tượng | Không có hồ sơ khách hợp nhất | **LẤY CỦA MISA** | ⚪ |
| Trường tuỳ chỉnh | ❌ Thêm trường = migration | ✅ Tuỳ chỉnh phân hệ và trường (`[CHƯA KIỂM CHỨNG]` kiểu dữ liệu hỗ trợ) | Kinh doanh không tự bổ sung được | **LẤY CỦA MISA nhưng hoãn** — giá trị/công sức thấp hơn các mục trên, xếp GĐ-3 | ⚪ |

### C.3 Kênh và tích hợp

| Hạng mục | Sata Robo hiện tại | MISA | Chênh lệch | Quyết định đề xuất | Shadow |
|---|---|---|---|---|---|
| **Gọi điện trong CRM** | ❌ Không có dòng mã nào | ✅ 8 nhà cung cấp, click-to-call, cửa sổ gọi đến, tự tra ngược khách, ghi âm | **Khoảng trống trọng tâm** | **LẤY CỦA MISA** — nhưng **tự tích hợp thẳng với nhà cung cấp**, không qua MISA. Xem §D.2.5–D.2.6 | ⚪/🔴 |
| Tổng đài / IVR / phân phối cuộc gọi | ❌ Không có | Do nhà cung cấp tổng đài đảm nhiệm | — | **LẤY CỦA MISA** — để nhà cung cấp lo, CRM chỉ nhận sự kiện | ⚪ |
| Messenger 2 chiều thật | ❌ Chỉ ghi CSDL, không gọi Send API (ĐG-14) | Kết nối Fanpage, thu lead | Nhân viên tưởng đã trả lời khách | **GIỮ CỦA SATA + VÁ** — Messenger-first là đặc thù Sata Robo, phải làm cho gửi thật | ⚪ |
| Zalo OA chat 2 chiều | ❌ Chỉ có ZNS một chiều + webhook nhận lead | ✅ Chat OA trong CRM (gói Professional trở lên) | Không chat được với phụ huynh dùng Zalo | **LẤY CỦA MISA nhưng hoãn** — GĐ-3, sau khi có tổng đài | ⚪ |
| Zalo ZNS | ✅ Có adapter thật, tự xoay token, log đầy đủ | ✅ Có | Ngang | **GIỮ CỦA SATA** | ⚪ |
| Email marketing / chiến dịch | ❌ Chỉ 7 trigger giao dịch (`:3516-3524`) | ✅ aiMarketing + mẫu Email/SMS + tin nhắn hàng loạt | Không gửi được đợt chăm sóc | **LẤY CỦA MISA nhưng thu hẹp** — gửi theo chiến dịch, **bắt buộc kiểm consent thật** | ⚪ |
| SMS Brandname | ❌ Chỉ OTP | ✅ Có | Thiếu kênh nhắc | **BỎ** giai đoạn này — ZNS rẻ hơn và đã có | — |
| Webform | 🟡 Form public có, nhưng cố định trong mã | ✅ Webform cấu hình được, gắn quy tắc phân bổ | Marketing không tự tạo form | **LẤY CỦA MISA nhưng hoãn** — GĐ-3 | ⚪ |
| Chat trực tuyến trên website | ❌ Không có | Không phải phân hệ MISA | — | **BỎ** | — |
| Đồng bộ đối tượng quảng cáo lại | ❌ Không có | Có qua kết nối | — | **BỎ** giai đoạn này | — |
| **Tích hợp MISA (kế toán)** | 🟡 Khung rỗng: `IntegrationConfig` + `IntegrationLog` + `syncToMisa`, chế độ live trả `MISA_LIVE_NOT_IMPLEMENTED` (`lib/misa/service.ts:90-104`) | — | Chưa từng chạy thật | **GIỮ nguyên khung** — quyết định nối thật thuộc module Kế toán, ngoài phạm vi tài liệu này | ⚪ |
| API mở cho đối tác/nhượng quyền | ❌ Chỉ 3 webhook một chiều | ✅ Có API + Cổng thông tin cho NPP | Cơ sở nhượng quyền không tự tích hợp được | **BỎ** giai đoạn này, ghi nhận cho lộ trình nhượng quyền | — |
| Tầng cổng gọi dịch vụ ngoài | ❌ `modules/integration` chưa tồn tại (ĐG-19) | (kiến trúc nội bộ MISA, không công bố) | Mỗi tích hợp đẻ một đường gọi rời | **Điều kiện tiên quyết** — xem §G câu Q4 | ⚪ |

### C.4 Vận hành, phân quyền, báo cáo

| Hạng mục | Sata Robo hiện tại | MISA | Chênh lệch | Quyết định đề xuất | Shadow |
|---|---|---|---|---|---|
| Phân quyền chức năng | ✅ Ma trận 9 vai trò đang enforce (v1), engine động (v2) chờ bật | Vai trò + quyền chức năng | Ngang | **GIỮ CỦA SATA** — **không làm song song với RBAC v2** | 🔴 nếu chạm |
| Quyền dữ liệu theo tổ chức | ✅ `UserOrgRole` + `scopedDb` cách ly cơ sở, có test CI | ✅ Quy tắc chia sẻ theo cơ cấu tổ chức, tự cập nhật khi đổi phòng ban | Ngang về ý tưởng | **GIỮ CỦA SATA** | 🔴 nếu chạm |
| Chia sẻ bản ghi lẻ | ⚠️ Chỉ mức "cả cơ sở" | ✅ Chia sẻ cho người dùng cụ thể | MISA linh hoạt hơn | **HOÃN** — đụng thẳng logic phạm vi dữ liệu, làm sau khi đóng cửa sổ shadow | 🔴 |
| Che dữ liệu nhạy cảm | ✅ Che tại server, có quyền riêng `leads:view-pii` | ✅ Ẩn/hiện số điện thoại khách | Ngang | **GIỮ CỦA SATA** | ⚪ |
| Audit | 🟡 Hai sổ song song (ĐG-12) | Lịch sử thay đổi theo bản ghi | Tra soát phải nhìn hai nơi | **GIỮ CỦA SATA** + hợp nhất dần theo hướng `AuditLog` | ⚪ |
| Báo cáo | 🟡 Có phễu, CPL/CPA (đang sai theo ĐG-09), bảng kê hoa hồng, báo cáo lead | ✅ >20 loại, thư mục, cột tính toán, **phân quyền theo từng báo cáo** | Sata Robo ít báo cáo và một chỉ số đang sai | **LAI GHÉP** — vá ĐG-09 trước, sau đó bổ sung bộ báo cáo ở §D.6 | ⚪ |
| Xuất dữ liệu | ✅ Có route xuất lead, đã che PII tại server | ✅ Có | Ngang, nhưng Sata Robo **chưa có đóng dấu người tải + audit lần xuất** | **LAI GHÉP** — thêm đóng dấu + audit theo yêu cầu R-DP-07 (`docs/taicautruc/02-prd-franchise-platform.md:347`) | ⚪ |
| Ứng dụng di động | ❌ Không có (chỉ web tương thích di động) | ✅ Có app riêng, 9 phân hệ | Sale ngoài hiện trường bất tiện | **BỎ** — ưu tiên web tương thích di động; máy lẻ tổng đài trên điện thoại giải quyết phần lớn nhu cầu | — |
| Trợ lý AI | ❌ Không có | ✅ Có | — | **BỎ** — Doc 15 đã loại AI dự đoán khỏi phạm vi; nhu cầu "gợi ý" làm theo luật | ⚪ |

### C.5 Những thứ Sata Robo có mà MISA không có — **phải giữ**

| Hạng mục | Vì sao MISA không có | Quyết định |
|---|---|---|
| **Phễu SR.QD.217 L1→L2→L3** (hội thoại → đủ điều kiện → chuyển đổi) với 7 mốc thời gian | MISA là CRM tổng quát, không có khái niệm "hội thoại Page = bậc 1" | **GIỮ** — làm **lớp đo lường** chạy song song với giai đoạn cơ hội (xem D.3, QT-12) |
| **5 mức SLA + luật lead im lặng**, ngưỡng cấu hình được (`lib/crm/sla.ts:12-18, 21-36`) | MISA chỉ nhắc "cơ hội bị bỏ quên", không có bậc SLA theo mốc bàn giao | **GIỮ** và mở rộng cho cuộc gọi |
| **Bàn giao HO → cơ sở có xác nhận tiếp nhận** (`handedAt` / `receivedConfirmedAt`) | MISA phân bổ thẳng cho người, không có bước "cơ sở nhận" | **GIỮ** — cần cho mô hình đa cơ sở và nhượng quyền |
| **Buổi học thử / lớp trải nghiệm** (`TrialClassV2`, `LeadTrialHistory`) và tự động đẩy sang "Chờ quyết định" khi đủ buổi | Không phải nghiệp vụ bán hàng tổng quát | **GIỮ** — đây là bước bán hàng đặc thù giáo dục, **quan trọng hơn báo giá** |
| **Chuyển đổi nguyên tử sang học viên + đăng ký + gắn khoản thu** trong một giao dịch, có chống bấm hai lần | MISA chuyển đổi ra 3 bản ghi CRM, không đụng học vụ | **GIỮ** — không được thay bằng luồng MISA |
| **Engine hoa hồng 4 tầng, trần 8%, không hoa hồng tái tục, thu hồi khi hoàn tiền** (`lib/crm/commission.ts:10-17, 62, 77-88`) | MISA có affiliate nhưng khác bản chất | **GIỮ** |
| **Cách ly cơ sở ở tầng truy vấn** (`scopedDb`) có test CI bắt buộc | MISA làm ở tầng cấu hình, không phải tầng truy vấn | **GIỮ** — mạnh hơn |
| **Xử lý xung đột hồ sơ phụ huynh khi chuyển đổi** (`ConvertConflict` + màn hình riêng) | Không có tương đương | **GIỮ** |
| **Messenger-first** với ánh xạ Page → cơ sở | MISA có Fanpage nhưng không đặt Messenger làm bậc đầu phễu | **GIỮ** |

---

## 6. PHẦN D — BA MỚI (TRẠNG THÁI ĐÍCH)

### D.0 Ba nguyên tắc chi phối toàn bộ phần này

| # | Nguyên tắc | Ý nghĩa cụ thể |
|---|---|---|
| **NT-1** | **Một nguồn sự thật — không đẻ hệ thứ hai** | Mọi đối tượng lấy từ MISA phải **cắm vào** `Lead` / `Order` / `Enrollment` / `Student` đang có. Tuyệt đối không dựng "CRM mới" chạy song song với CRM cũ, không dùng mini-CRM của nhà cung cấp tổng đài, không đồng bộ hai chiều khách hàng sang MISA AMIS CRM. |
| **NT-2** | **Cộng thêm trước, bỏ sau** | Enum `LeadStatus` giữ nguyên làm **giá trị hệ thống**; bảng giai đoạn cấu hình được chạy chồng lên. Chỉ khi dữ liệu ổn định mới xét việc bỏ giá trị cũ. Đây đúng tiền lệ `DEMO_SCHEDULED` (`prisma/schema.prisma:51`). |
| **NT-3** | **Không chạm vùng shadow-compare RBAC nếu chưa cần** | Mọi bảng mới, màn hình mới, webhook mới đều **không** đụng shadow. Chỉ việc **thêm khoá quyền mới** mới đụng. Giai đoạn đầu **mượn quyền `leads:*` đã có**. |

### D.1 Khái niệm và đối tượng nghiệp vụ mới

#### D.1.1 Bảng ánh xạ đối tượng MISA → Sata Robo

> Đây là bảng trả lời trực tiếp yêu cầu "lấy hoàn toàn mô hình CRM của MISA". Cột **Xử lý** cho biết đối tượng đó được **GIỮ NGUYÊN** (đã có, dùng tiếp) / **ĐỔI TÊN** (đã có, đặt lại tên nghiệp vụ) / **THÊM MỚI** / **GỘP** (nhập vào đối tượng sẵn có) / **BỎ**.

> 🔴 **HỘP CẢNH BÁO — DANH SÁCH PHÂN HỆ MISA BỊ BỎ, CẦN BAN GIÁM ĐỐC XÁC NHẬN.**
> Yêu cầu gốc của Ban là **"LẤY HOÀN TOÀN theo mô hình CRM của MISA"**. Bảng dưới đây **thu hẹp phạm vi so với câu chữ đó**: bỏ **6 phân hệ** và gộp mất **1**. Lý do BA đưa ra đều có căn cứ nghiệp vụ, **nhưng đây là quyết định của Ban chứ không phải của BA** ⇒ đã thành câu **Q9** ở §G. Đọc bảng 7 dòng này thay vì phải rà hết 23 dòng bên dưới:
>
> | # | Phân hệ MISA | Xử lý | Lý do bỏ | Hệ quả nếu sau này cần lại | Chi phí thêm lại sau |
> |---|---|---|---|---|---|
> | 5 | **Ao cơ hội** | **GỘP** vào cơ chế "dùng chung" sẵn có (`Lead.isSharedWithTeam`) | Đội 6 người, không cần một hàng đợi riêng | Không mất gì — cơ chế dùng chung đã bao được | Thấp |
> | 16 | **Đi tuyến** | **BỎ** | Sata Robo không có Sale đi thị trường; phần "check-in theo vị trí" đã thuộc module Chấm công | Nếu mở mô hình Sale đi trường học/hội chợ thì thiếu | Trung bình — nhưng dùng lại được điểm chấm công của module Chấm công |
> | 17 | **Đối thủ** | **BỎ** | Thay bằng **danh mục lý do thua** có sẵn giá trị "chọn trung tâm khác" | Mất khả năng phân tích cạnh tranh có cấu trúc (thị phần, giá đối thủ) | Thấp — là bảng danh mục đơn giản |
> | 18 | **Phiếu bảo hành** | **BỎ** giai đoạn này | Hiện bán robot/KIT ít | Khi bán thiết bị nhiều sẽ cần thật — bảo hành là nghĩa vụ pháp lý | Trung bình |
> | 19 | **Dự án bán hàng** | **BỎ** | Mô hình B2C, không có bán theo dự án nhiều bên | Nếu chuyển sang bán cho trường học (B2B) thì **cần hẳn** | Cao — kéo theo cả báo giá nhiều vòng, nhiều người quyết |
> | 20 | **Cổng thông tin cho NPP** | **BỎ** giai đoạn này | Chưa có nhà phân phối / bên nhận quyền vận hành thật | Là thứ **cơ sở nhượng quyền sẽ hỏi** khi mở | Cao — cổng riêng cho bên ngoài, kèm cách ly và phân quyền riêng |
> | — | **Hợp đồng** | **BỎ** (không có dòng riêng trong bảng dưới) | Ghi danh + học phí đang chạy qua `Order` / `OrderInstallment`, chưa có nhu cầu quản lý vòng đời hợp đồng riêng | Nếu ký hợp đồng nhượng quyền / hợp đồng đào tạo doanh nghiệp thì cần | Trung bình |
>
> ⇒ **Câu hỏi cho Ban:** chấp nhận bỏ cả 7 mục trên, hay muốn giữ lại mục nào vào phạm vi đợt này? **Không trả lời câu này thì §F đang lập lịch cho một phạm vi hẹp hơn phạm vi Ban đã nói.**

| # | Đối tượng MISA | Tên trong bối cảnh Sata Robo | Định nghĩa nghiệp vụ | Xử lý | Hoà nhập với cái đã có như thế nào |
|---|---|---|---|---|---|
| 1 | **Tiềm năng** | **Phụ huynh quan tâm** | Một phụ huynh (hoặc người nhà) đã để lại liên hệ, chưa mua | **GIỮ NGUYÊN** = `Lead` | Không đổi bảng. Chỉ bổ sung trường điểm, trạng thái "đã chuyển đổi/đóng băng", và liên kết ngược từ học viên |
| 2 | **Khách hàng** | **Gia đình (hồ sơ 360°)** | Toàn bộ quan hệ của một gia đình với Sata Robo: đã từng là lead, đang có con học, đã mua bao nhiêu đơn | **GỘP — không đẻ bảng** | Là một **màn hình hợp nhất**, khoá gắn kết = `User(PARENT)` đã sinh ra ở bước chuyển đổi. Không tạo model "Account" mới |
| 3 | **Liên hệ** | **Người liên hệ của gia đình** | Người cụ thể có thể liên lạc: mẹ, bố, ông bà, người trả tiền. Có vai trò và cờ "liên hệ chính" | **THÊM MỚI** | Bảng con của gia đình. `Lead.parentName/phone` trở thành **người liên hệ đầu tiên** được tạo tự động, giữ nguyên để không phá dữ liệu cũ |
| 4 | **Cơ hội** | **Nhu cầu học** | Một ý định mua cụ thể, gắn với **một học viên** và **một loại nhu cầu** (khoá mới / học tiếp / mua robot). Chạy theo giai đoạn, có giá trị dự kiến và ngày kỳ vọng | **THÊM MỚI — hạng mục quan trọng nhất** | Nhu cầu học nối tới: `LeadChild` (khi chưa chuyển đổi) hoặc `Student` (khi đã là học viên), và tới `Order` khi chốt. **Một lead có N nhu cầu học** (mỗi con một nhu cầu, hoặc một con nhiều đợt) |
| 5 | **Ao cơ hội** | (không dùng tên riêng) | Nhu cầu học chưa có người phụ trách | **GỘP** vào cơ chế "dùng chung" sẵn có (`Lead.isSharedWithTeam`) | Không đẻ khái niệm mới |
| 6 | **Báo giá** | **Báo giá khoá / gói** | Bản chào giá gửi phụ huynh: khoá nào, bao nhiêu buổi, giá gốc, ưu đãi, thành tiền, hạn hiệu lực | **THÊM MỚI (bản rút gọn)** | Sinh ra từ Nhu cầu học; **chuyển thành `Order`** khi phụ huynh đồng ý. Ưu đãi khai ở đây phải **chảy được vào đơn** — vá lỗ `discount: null` hiện tại |
| 7 | **Đơn hàng** | **Đơn ghi danh / đơn bán hàng** | Chốt bán | **GIỮ NGUYÊN** = `Order` | Bổ sung liên kết ngược về Nhu cầu học và Báo giá gốc |
| 8 | **Hoá đơn / công nợ** | **Khoản thu / phiếu thu / công nợ** | | **GIỮ NGUYÊN** = `Payment` / `Receipt` / `OrderInstallment` | Không đổi |
| 9 | **Hàng hoá / Chính sách giá** | **Khoá học Sata 1–8, Combo 1&2, robot/cảm biến bán hoặc cho thuê** | Danh mục bán được | **GIỮ NGUYÊN** = `Course` + `Product` + `CourseDiscount` + `Voucher` + `Promotion` | Không đẻ danh mục mới. Chỉ chuẩn hoá cách chọn khi lập báo giá |
| 10 | **Hoạt động** | **Hoạt động chăm sóc** | Gọi điện · nhắn tin · gặp mặt · email · ghi chú | **GIỮ NGUYÊN** = `LeadActivity` | Mở rộng để gắn được vào **Nhu cầu học** và **Học viên**, không chỉ vào lead. Gộp `Note` vào đây (bỏ cơ chế ghi chú trùng — ĐG-11) |
| 11 | **Nhiệm vụ** | **Việc cần làm của Sale** | | **GIỮ NGUYÊN** = `LeadTask` — **bật lại giao diện** | Đang có model, đã gỡ màn hình (ĐG-15) |
| 12 | **Thẻ chăm sóc** | **Yêu cầu của phụ huynh** | | **GỘP** vào `ParentRequest` đã có | Nối vào dòng thời gian 360°, không đẻ ticket mới |
| 13 | **Chiến dịch / Chào hàng** | **Chiến dịch tuyển sinh** | Một đợt tiếp cận có tên, thời gian, ngân sách, danh sách đối tượng, kết quả | **THÊM MỚI** | `Lead.utmCampaign` (chuỗi) trở thành **khoá đối chiếu** với bảng chiến dịch; giữ nguyên cột cũ để không phá dữ liệu lịch sử |
| 14 | (ngầm định trong MISA) | **Danh mục nguồn lead** | Danh sách nguồn chuẩn (Messenger HO, Facebook Lead Ads, Zalo, Google Form, giới thiệu, vãng lai, hội thảo…) | **THÊM MỚI** | `Lead.source` (chuỗi tự do) được ánh xạ dần sang danh mục; giữ cột cũ |
| 15 | **Mục tiêu** | **Chỉ tiêu doanh số / tuyển sinh** | Chỉ tiêu giao theo **đơn vị tổ chức** rồi xuống từng người, theo tuần/tháng/quý/năm | **GỘP + MỞ RỘNG** `RevenueTarget` đã có (`prisma/schema.prisma:5042`) | Gắn vào `OrgUnit` thay vì cấu hình rời |
| 16 | **Đi tuyến** | — | | **BỎ** | Sata Robo không có Sale đi thị trường. Phần "check-in theo vị trí" thuộc module **Chấm công**, không thuộc CRM |
| 17 | **Đối thủ** | — | | **BỎ** | Thay bằng **danh mục lý do thua** có sẵn giá trị "chọn trung tâm khác" |
| 18 | **Phiếu bảo hành** | — | | **BỎ** giai đoạn này | Ghi nhận là nhu cầu tương lai khi bán robot/KIT nhiều hơn |
| 19 | **Dự án bán hàng** | — | | **BỎ** | Không phù hợp B2C |
| 20 | **Cổng thông tin cho NPP** | — | | **BỎ** giai đoạn này | Ghi nhận cho lộ trình nhượng quyền |
| 21 | **Tra cứu tồn kho, công nợ** | **Tra tồn kho robot/KIT + công nợ học phí** | | **GIỮ NGUYÊN** — đã có `StockBalance`, `OrderInstallment` | Chỉ cần đưa lên màn bán hàng |
| 22 | **Bàn làm việc** | **Trang việc của tôi** | Dashboard cá nhân của Sale | **GIỮ NGUYÊN + MỞ RỘNG** — đã có cơ chế "việc cần làm" (`lib/pending-tasks.ts`) | Thêm khối SLA đang vi phạm + cuộc gọi cần gọi lại |
| 23 | **Cuộc gọi (trong Hoạt động)** | **Cuộc gọi** | Bản ghi kỹ thuật của một cuộc gọi thật | **THÊM MỚI** — xem D.1.4 | Dòng hiển thị trên timeline vẫn là `LeadActivity(CALL)`; bản ghi kỹ thuật là bảng riêng |

#### D.1.2 Đối tượng THÊM MỚI — định nghĩa và dữ liệu logic

> Mô tả ở mức **khái niệm và dữ liệu logic**. Không phải schema, không phải migration. Tên trường là tên nghiệp vụ để đội kỹ thuật đặt tên thật.

**(1) NHU CẦU HỌC** *(= Cơ hội bán hàng)*

| Nhóm | Thông tin | Ghi chú |
|---|---|---|
| Định danh | Mã nhu cầu, tên gợi nhớ | Ví dụ "Bé An – Sata 3 – HK1/2026" |
| Chủ thể | Gắn với **một trong hai**: `LeadChild` (chưa là học viên) hoặc `Student` (đã học) | **Bắt buộc có một** — đây là điểm nối hai thế giới |
| Gia đình | Người liên hệ chính, lead gốc | Cho phép nhìn ngược |
| Loại nhu cầu | Khoá mới · Học tiếp/tái tục · Mua robot/KIT · Thuê thiết bị | Quyết định **dùng quy trình bán hàng nào** |
| Quy trình & giai đoạn | Mã quy trình bán hàng + giai đoạn hiện tại | Đọc từ cấu hình, không từ enum |
| Giá trị | Giá trị dự kiến, đơn vị tiền | Dùng để dự báo |
| Thời gian | Ngày tạo, **ngày kỳ vọng chốt**, ngày vào giai đoạn hiện tại | "Ngày kỳ vọng" tự tính = ngày tạo + N ngày theo cấu hình |
| Người phụ trách | Sale phụ trách; **cơ sở** (bắt buộc) | Cơ sở là trường cách ly |
| Kết thúc | Trạng thái đóng (Thắng / Thua / Ngừng theo dõi), **lý do** (chọn từ danh mục), ghi chú | **Bắt buộc khai lý do khi đóng** |
| Nguồn | Chiến dịch, nguồn lead | Để quy nguồn doanh thu |
| Liên kết | Báo giá đã lập, đơn hàng đã chốt | Một nhu cầu có N báo giá, tối đa 1 đơn thắng |

**(2) BÁO GIÁ KHOÁ / GÓI**

| Nhóm | Thông tin |
|---|---|
| Định danh | Số báo giá, phiên bản, ngày lập, **hạn hiệu lực** |
| Gắn vào | Nhu cầu học, người liên hệ nhận báo giá |
| Nội dung | Danh sách dòng: khoá/gói/sản phẩm, số buổi, đơn giá gốc, ưu đãi áp dụng, thành tiền |
| Tổng | Tổng gốc, tổng ưu đãi, **tổng phải trả**, phương án trả (1 đợt / 2 đợt) |
| Trạng thái | Nháp · Đã gửi · Được chấp nhận · Bị từ chối · Hết hạn |
| Duyệt | Cần duyệt hay không (theo quy tắc giá sàn), người duyệt, thời điểm, lý do |
| Kết quả | Đơn hàng sinh ra từ báo giá này |

**(3) CHIẾN DỊCH TUYỂN SINH**

| Nhóm | Thông tin |
|---|---|
| Định danh | Mã chiến dịch, tên, loại (quảng cáo trả phí · giới thiệu · sự kiện · tái tiếp cận · hội thảo) |
| Thời gian | Từ ngày – đến ngày |
| Phạm vi | **Đơn vị tổ chức áp dụng** (toàn hệ thống / HO / một hoặc nhiều cơ sở) |
| Ngân sách | Ngân sách dự kiến, chi phí thực (nối `AdsInsightDaily` / `MarketingCostPeriod` đã có) |
| Mục tiêu | Số lead mục tiêu, số ghi danh mục tiêu, doanh thu mục tiêu |
| Đối chiếu | Danh sách giá trị `utmCampaign` thuộc chiến dịch này | 
| Kết quả (tính, không nhập) | Số lead, số đủ điều kiện, số nhu cầu học, số thắng, doanh thu, chi phí/lead, chi phí/ghi danh |

**(4) DANH MỤC NGUỒN LEAD**

Mã nguồn · Tên hiển thị · Nhóm (kênh trả phí / tự nhiên / giới thiệu / trực tiếp) · Có tính chi phí không · Đang dùng hay đã ngừng · Thứ tự hiển thị.

**(5) NGƯỜI LIÊN HỆ CỦA GIA ĐÌNH**

Họ tên · Quan hệ với học viên (mẹ/bố/ông/bà/người giám hộ/người trả tiền) · Số điện thoại (chuẩn hoá) · Email · Zalo có/không · **Cờ liên hệ chính** · **Cờ đồng ý nhận marketing riêng cho người này** · Ghi chú · Trạng thái (đang dùng / đã ngừng liên hệ).

> ⚠️ **Đồng ý nhận marketing phải gắn vào NGƯỜI, không gắn vào lead.** Đây là chỗ vá gốc rễ cho ĐG-02.

#### D.1.3 Đối tượng cấu hình — thứ biến pipeline thành dữ liệu

**(6) QUY TRÌNH BÁN HÀNG**

Mã quy trình · Tên · Loại nhu cầu áp dụng · Đang bật/tắt · Là mặc định hay không · Đơn vị tổ chức áp dụng (null = toàn hệ thống).

**(7) GIAI ĐOẠN BÁN HÀNG** *(bảng con của quy trình)*

| Thông tin | Ý nghĩa |
|---|---|
| Mã giai đoạn, tên hiển thị | |
| Thứ tự | Kéo thả sắp xếp |
| **Tỷ lệ thành công (%)** | Nhân với giá trị dự kiến ⇒ doanh số dự kiến |
| Loại giai đoạn | Đang mở · Đóng-thắng · Đóng-thua | 
| **Ánh xạ sang trạng thái hệ thống** | Chỉ tới một giá trị `LeadStatus` đang có — **đây là cầu nối bắt buộc để không phá báo cáo cũ** |
| Số ngày kỳ vọng | Dùng để tự tính ngày kỳ vọng chốt |
| Trạng thái | Đang dùng / **Đã ẩn** (ẩn chứ không xoá — theo mô hình MISA và tiền lệ `DEMO_SCHEDULED`) |
| Yêu cầu khi rời giai đoạn | Danh sách điều kiện bắt buộc (ví dụ: phải có ≥1 hoạt động; phải có báo giá; phải có khoản ghi nhận) |

**(8) DANH MỤC LÝ DO THUA**

Mã · Tên (ví dụ: học phí cao · lịch không phù hợp · xa nhà · chọn trung tâm khác · con không thích · liên hệ không được · sai số điện thoại · trùng bản ghi) · Nhóm · Có yêu cầu ghi chú bắt buộc không · Đang dùng.

**(9) QUY TẮC CHẤM ĐIỂM**

Mã · Tên · Đối tượng áp dụng (Lead / Nhu cầu học) · Danh sách điều kiện, mỗi điều kiện gồm: trường xét, phép so sánh, giá trị, **điểm cộng/trừ** · Ngưỡng phân loại (ví dụ ≥70 = Nóng, 40–69 = Ấm, <40 = Lạnh) · Đang bật/tắt · Đơn vị tổ chức áp dụng.

**(10) QUY TẮC PHÂN BỔ**

Mã · Tên · **Thứ tự ưu tiên** · Điều kiện áp dụng (nguồn, chiến dịch, khoá quan tâm, khu vực, khung giờ) · Kết quả (cơ sở đích, cách chọn người: luân phiên / theo tỷ lệ chốt / theo tải / gán cố định) · Người nhận dự phòng · Đang bật/tắt.

**(11) QUY TẮC TỰ ĐỘNG (kịch bản chăm sóc)**

Mã · Tên · Đối tượng áp dụng · **Sự kiện kích hoạt** (tạo mới · cập nhật · đổi giai đoạn · quá hạn không hoạt động · đóng thắng · đóng thua · cuộc gọi kết thúc) · Điều kiện lọc · **Danh sách hành động** (từ bộ hữu hạn, xem D.2.4) · Thứ tự ưu tiên · **Giới hạn tối đa 10 quy tắc đang bật trên một đối tượng** (theo mô hình MISA) · **Chỉ sửa được khi đã tắt**.

**(12) QUY TẮC PHÊ DUYỆT**

Mã · Tên · Đối tượng (báo giá / đơn hàng / kế hoạch trả góp) · Điều kiện kích hoạt (ví dụ: ưu đãi > X% hoặc đơn giá < mức sàn của khoá) · **Chuỗi cấp duyệt** (mỗi cấp: vai trò hoặc chức danh trong đơn vị tổ chức, thời hạn duyệt, ai thay khi vắng) · Hành vi khi quá hạn (nhắc / tự đẩy lên cấp trên) · Đang bật/tắt.

#### D.1.4 Đối tượng CUỘC GỌI — mô hình dữ liệu logic

> Trả lời trực tiếp yêu cầu "mô hình dữ liệu logic cho cuộc gọi (khái niệm, không phải migration)".

**(13) CUỘC GỌI**

| Nhóm | Thông tin | Vì sao cần |
|---|---|---|
| **Định danh** | Mã cuộc gọi nội bộ · **tên nhà cung cấp** (OMICALL / …) · **mã cuộc gọi của nhà cung cấp — DUY NHẤT** | Mã duy nhất là **khoá chống trùng bắt buộc**: tài liệu OMICall ghi rõ *"transaction_id … OMI có thể gửi nhiều lần"* `[WEB]` |
| **Ai gọi** | Nhân viên thực hiện (có thể trống) · số máy lẻ · **cơ sở (bắt buộc)** · đơn vị tổ chức | Trống được vì có cuộc gọi hệ thống không xác định được người (`create_default_by_tenant`) `[WEB]` |
| **Gọi cho ai** | Lead (có thể trống) · Nhu cầu học (có thể trống) · Học viên (có thể trống) · Người liên hệ (có thể trống) | Cuộc gọi đến từ số lạ chưa gắn được ai |
| **Số máy** | Hướng gọi (gọi ra / gọi vào / nội bộ) · số gọi đi · số nhận · **số đã chuẩn hoá** · đầu số hiển thị | Số chuẩn hoá là khoá đối khớp lead |
| **Thời gian** | Bắt đầu · Bắt đầu đàm thoại · Kết thúc · Thời lượng đàm thoại (giây) · Thời lượng tính cước | Đưa về cùng một chuẩn múi giờ với toàn hệ thống |
| **Kết quả** | Trạng thái (Khởi tạo · Đổ chuông · Có người nghe · Không nghe máy · Máy bận · Thất bại · Chưa gán chủ) · **Kết quả nghiệp vụ do Sale chọn** (quan tâm · hẹn gọi lại · từ chối · sai số · nhầm máy) · Ghi chú | Trạng thái kỹ thuật ≠ kết quả nghiệp vụ. Phải tách. |
| **Mục đích** | **Chăm sóc / xử lý yêu cầu** hoặc **Chào bán, quảng cáo** | ⚠️ **Bắt buộc chọn trước khi gọi** — quyết định cuộc gọi có bị ràng buộc Danh sách không quảng cáo hay không (xem QT-33) |
| **Ghi âm** | Có ghi âm hay không · **khoá tệp ghi âm nội bộ (KHÔNG lưu liên kết thô)** · đã thông báo ghi âm hay chưa · hạn xoá dự kiến | Xem QT-35, QT-36 |
| **Kiểm soát** | Cờ "cần rà soát" · lý do cần rà soát · thứ tự sự kiện nhà cung cấp gửi · bản ghi thô nhận được | Chống ghi đè ngược trạng thái, phục vụ đối soát |
| **Chi phí** | Cước cuộc gọi (nếu nhà cung cấp trả về) | Báo cáo chi phí theo cơ sở/theo Sale |

**Ba điểm nối vào cái đã có — không đẻ bảng thừa:**

| Việc | Dùng lại cái gì |
|---|---|
| Hiển thị trên dòng thời gian lead | `LeadActivity` loại `CALL` (`prisma/schema.prisma:2896`), tham chiếu mã cuộc gọi trong `metadata` (`:2952`) — **không tạo bảng dòng thời gian mới** |
| Cấu hình bật/tắt + log kỹ thuật của nhà cung cấp | `IntegrationConfig` + `IntegrationLog` (`prisma/schema.prisma:4747-4768`) — cùng chỗ với MISA và Zalo |
| Nhận và lưu vết webhook + chạy lại khi lỗi | `WebhookDelivery` (`:3673-3689`) + màn hình `/admin/crm/webhook-replay` đã có |

**(14) ÁNH XẠ MÁY LẺ ↔ NHÂN VIÊN ↔ CƠ SỞ**

Số máy lẻ · Nhân viên · Cơ sở · Đầu số hiển thị mặc định · Đang dùng hay không.
> Hiện `Employee` **không có trường số máy lẻ**. Đây là mảnh còn thiếu bắt buộc trước khi bấm gọi được.

**(15) DANH SÁCH KHÔNG GỌI (nội bộ)**

Số điện thoại chuẩn hoá · Nguồn (khách tự yêu cầu / nhà cung cấp trả về `do_not_call` / nhập tay) · Thời điểm · Người ghi · Ghi chú · Có hạn không.

### D.2 Luồng nghiệp vụ mới — mô tả từng bước

#### D.2.1 Luồng chính: từ tin nhắn đầu tiên tới ghi danh

```
BƯỚC 1 — VÀO
  Kênh (Messenger HO/CS · form web · Facebook Lead Ads · Zalo · Google Form · import · nhập tay)
  → ghi NGUỒN theo danh mục chuẩn + CHIẾN DỊCH (đối chiếu utmCampaign)
  → chống trùng số điện thoại (giữ nguyên 3 tầng hiện có)
  → tạo LEAD + tạo NGƯỜI LIÊN HỆ CHÍNH từ parentName/phone
  → GHI ĐÚNG sự đồng ý nhận marketing (không ghi đè cứng — QT-31)

BƯỚC 2 — CHẤM ĐIỂM (mới)
  Áp quy tắc chấm điểm → điểm + phân loại Nóng/Ấm/Lạnh
  → điểm là GỢI Ý ƯU TIÊN, không phải điều kiện chặn

BƯỚC 3 — PHÂN BỔ (một đường duy nhất — vá ĐG-01)
  Chạy quy tắc phân bổ theo thứ tự ưu tiên → chọn CƠ SỞ → chọn NGƯỜI
  → MỌI đường vào (kể cả webhook) đều đi qua đường này
  → thông báo cho người nhận

BƯỚC 4 — ĐỦ ĐIỀU KIỆN (giữ nguyên)
  Có số điện thoại hợp lệ + có ghi chú nhu cầu ⇒ đóng mốc L2 (qualifiedAt)

BƯỚC 5 — BÀN GIAO HO → CƠ SỞ (giữ nguyên)
  handedAt → receivedConfirmedAt → assignedAt

BƯỚC 6 — LIÊN HỆ (mới: có nút GỌI)
  Bấm "Gọi" ngay trên màn lead → sinh CUỘC GỌI → tổng đài kết nối
  → cuộc gọi CÓ NGƯỜI NGHE ⇒ đóng mốc firstContactAt ⇒ tắt vi phạm SLA-3
  → mọi cuộc gọi ⇒ cập nhật lastActivityAt ⇒ reset đồng hồ SLA-4

BƯỚC 7 — TẠO NHU CẦU HỌC (mới)
  Khai (các) con → mỗi con + mỗi ý định = một NHU CẦU HỌC
  → chọn LOẠI NHU CẦU ⇒ hệ thống chọn QUY TRÌNH BÁN HÀNG tương ứng
  → nhu cầu bắt đầu ở giai đoạn đầu của quy trình đó

BƯỚC 8 — HỌC THỬ / TRẢI NGHIỆM (giữ nguyên, đặc thù Sata Robo)
  Xếp lớp trải nghiệm → dạy → ghi nhận
  → đủ buổi ⇒ nhu cầu tự chuyển giai đoạn "Chờ quyết định"

BƯỚC 9 — BÁO GIÁ (mới)
  Lập báo giá từ nhu cầu học: khoá, số buổi, giá gốc, ưu đãi, thành tiền, hạn hiệu lực
  → nếu ưu đãi vượt ngưỡng hoặc giá dưới sàn ⇒ CHẠY QUY TRÌNH DUYỆT
  → gửi phụ huynh (in / email / Zalo ZNS)

BƯỚC 10 — CHỐT
  Báo giá được chấp nhận ⇒ sinh ĐƠN HÀNG (ưu đãi chảy vào đơn — vá lỗ hiện tại)
  → ghi nhận khoản thu (Payment RECORDED)
  → lead lên REGISTERED (giữ nguyên luật hiện có)

BƯỚC 11 — CHUYỂN ĐỔI (giữ nguyên nguyên tử)
  User(PARENT) + Student + Enrollment + gắn khoản thu + audit, trong 1 giao dịch
  → NHU CẦU HỌC đóng ở giai đoạn "Thắng"
  → LEAD ĐÓNG BĂNG chỉ-đọc + GẮN CON TRỎ HAI CHIỀU với học viên (mới)

BƯỚC 12 — SAU BÁN
  Kế toán xác nhận → phiếu thu → hoa hồng
  → Học viên gần kết thúc khoá ⇒ TỰ SINH NHU CẦU HỌC loại "Học tiếp"
     (đây là chỗ mô hình cũ không có — mỗi lần tái tục là một cơ hội đo được)
```

#### D.2.2 Luồng "quy trình bán hàng cấu hình được"

**Ai làm:** Quản trị viên hệ thống hoặc Trưởng Kinh doanh (quyền cấu hình), **không cần đội kỹ thuật**.

| Bước | Thao tác | Ràng buộc |
|---|---|---|
| 1 | Mở màn "Quy trình bán hàng", chọn hoặc tạo quy trình theo loại nhu cầu | Mỗi loại nhu cầu có đúng một quy trình mặc định |
| 2 | Thêm/bớt/đổi tên giai đoạn, kéo thả sắp xếp | **Không xoá cứng** — chỉ ẩn; ẩn rồi khôi phục lại được |
| 3 | Đặt **tỷ lệ thành công** cho từng giai đoạn | 0–100%. Giai đoạn "Đóng-thắng" = 100%, "Đóng-thua" = 0% |
| 4 | Đặt **số ngày kỳ vọng** | Dùng để tự tính ngày kỳ vọng chốt |
| 5 | **Ánh xạ giai đoạn sang trạng thái hệ thống** (`LeadStatus`) | **Bắt buộc** — nếu không ánh xạ, báo cáo cũ và luật SLA sẽ đứt |
| 6 | Đặt điều kiện bắt buộc khi rời giai đoạn | Ví dụ: rời "Đã tư vấn" phải có ≥1 hoạt động |
| 7 | Lưu | Chỉ có hiệu lực cho **nhu cầu học tạo mới**; nhu cầu đang chạy giữ nguyên giai đoạn cho tới khi được chuyển tay |

**Ba quy trình đề xuất mặc định:**

| Quy trình | Giai đoạn | Ghi chú |
|---|---|---|
| **A. Khoá học (tuyển sinh mới)** | Mới → Đã liên hệ → Đang tư vấn → Đã hẹn học thử → Đang học thử → Đã học thử → Chờ quyết định → Đã báo giá → Đã đăng ký → **Thắng** / **Thua** | Ánh xạ 1-1 với `LeadStatus` đang có; đây là quy trình mặc định |
| **B. Học tiếp / tái tục** | Sắp kết thúc khoá → Đã trao đổi → Đã báo giá → Đã đăng ký → **Thắng** / **Thua** | Ngắn hơn, **không có bước học thử**. Nhu cầu sinh tự động từ học viên sắp kết thúc |
| **C. Sản phẩm robot / KIT** | Quan tâm → Báo giá → Chờ hàng/kiểm tồn → Đặt cọc → Giao hàng → **Thắng** / **Thua** | Có bước kiểm tồn kho; không có học thử; hoa hồng có thể khác — cần Kế toán xác nhận |

#### D.2.3 Luồng chấm điểm và phân bổ

**Chấm điểm** — chạy khi lead được tạo và mỗi khi có hoạt động mới.

Bộ điều kiện đề xuất khởi đầu (Ban Kinh doanh chỉnh sau):

| Điều kiện | Điểm |
|---|---|
| Có số điện thoại hợp lệ | +20 |
| Có ghi rõ tên và tuổi con | +10 |
| Tuổi con nằm trong dải phục vụ (lớp 1–8) | +15 |
| Chủ động hỏi học phí hoặc lịch học | +15 |
| Đã trả lời tin nhắn của Sale | +10 |
| Nhà ở cùng quận với cơ sở | +10 |
| Đã từng cho con học thử | +20 |
| Đã từng là học viên (tái tục) | +25 |
| Không liên hệ được 3 lần liên tiếp | −20 |
| Nguồn là kênh có tỷ lệ chốt thấp (tính từ lịch sử) | −10 |

Phân loại: **Nóng ≥70 · Ấm 40–69 · Lạnh <40**. Điểm chỉ **sắp xếp thứ tự ưu tiên chăm sóc**, không chặn thao tác nào.

**Phân bổ** — chạy sau chấm điểm, theo thứ tự ưu tiên quy tắc:

| Bước | Nội dung |
|---|---|
| 1 | Duyệt quy tắc theo thứ tự ưu tiên, lấy quy tắc **đầu tiên** khớp điều kiện |
| 2 | Xác định **cơ sở đích**: theo quy tắc, hoặc theo Page Facebook nguồn (`FacebookPageMapping` đã có), hoặc chia đều theo tải |
| 3 | Xác định **người**: luân phiên · theo tỷ lệ chốt · theo tải · gán cố định (giữ 3 thuật toán đã có ở `lib/lead/assign-strategy.ts`) |
| 4 | Nếu lead **đã có tương tác của Sale** ⇒ **không phân lại** (giữ luật khoá hiện có) |
| 5 | Ghi mốc `assignedAt`, gửi thông báo cho người nhận |
| 6 | Nếu không quy tắc nào khớp ⇒ đưa vào **hàng chờ "Lead chưa phân"** cho Quản lý cơ sở xử lý tay — **tuyệt đối không để lead trôi vô hình** |

> **Vá ĐG-01 là điều kiện tiên quyết:** hôm nay webhook đi đường phân bổ cũ. Luồng mới chỉ đúng khi **mọi đường vào dùng chung một hàm phân bổ**.

#### D.2.4 Luồng tự động hoá (kịch bản chăm sóc)

**Bộ sự kiện kích hoạt — hữu hạn:**

| Mã | Sự kiện |
|---|---|
| SK-01 | Lead được tạo |
| SK-02 | Lead được phân cho người phụ trách |
| SK-03 | Nhu cầu học chuyển giai đoạn |
| SK-04 | Nhu cầu học đóng (Thắng / Thua) |
| SK-05 | Không có hoạt động nào trong N ngày |
| SK-06 | Vi phạm một mức SLA |
| SK-07 | Cuộc gọi kết thúc (kèm kết quả) |
| SK-08 | Báo giá được gửi / được chấp nhận / hết hạn |
| SK-09 | Khoản thu được ghi nhận / được kế toán xác nhận |
| SK-10 | Buổi học thử kết thúc |
| SK-11 | Học viên còn N buổi là hết khoá |

**Bộ hành động — hữu hạn, có thứ tự ưu tiên (theo mô hình MISA §B.5.2):**

| Mã | Hành động | Ghi chú |
|---|---|---|
| HĐ-01 | Cập nhật một trường của bản ghi | |
| HĐ-02 | Đổi giai đoạn nhu cầu học | |
| HĐ-03 | **Giao việc cần làm** cho người phụ trách | Dùng lại `LeadTask` |
| HĐ-04 | Gửi **thông báo trong hệ thống** cho nhân viên | ⚠️ Phải kiểm chứng bẫy ĐG-21 trước |
| HĐ-05 | Gửi **email** cho phụ huynh | Qua hàng đợi email sẵn có |
| HĐ-06 | Gửi **Zalo ZNS** cho phụ huynh | Qua adapter sẵn có; **bắt buộc kiểm đồng ý** |
| HĐ-07 | **Phân bổ lại** theo quy tắc phân bổ | |
| HĐ-08 | **Tạo nhu cầu học mới** | Dùng cho SK-11 (tái tục) |
| HĐ-09 | Gắn nhãn / cờ cần rà soát | |

**Ràng buộc bắt buộc của engine:**

| # | Ràng buộc | Lý do |
|---|---|---|
| 1 | Tối đa **10 quy tắc đang bật trên một đối tượng** | Theo mô hình MISA — chống loạn thứ tự và vòng lặp |
| 2 | **Phải tắt quy tắc mới sửa được** | Chống sửa nóng khi đang chạy |
| 3 | Một hành động do quy tắc sinh ra **không được kích hoạt quy tắc khác quá 1 tầng** | Chống vòng lặp vô hạn |
| 4 | Mọi hành động gửi ra ngoài (email/ZNS) đi qua **sự kiện miền**, **không gọi trực tiếp trong luồng** | Đúng quy ước kiến trúc dự án |
| 5 | Mọi lần chạy quy tắc **ghi vết**: quy tắc nào, bản ghi nào, hành động nào, kết quả | Không có vết = không gỡ lỗi được |
| 6 | Hành động gửi tin cho phụ huynh **luôn kiểm sự đồng ý thật** trước khi gửi | Xem QT-31 |

> ⚠️ **Điều kiện tiên quyết:** engine này chạy trên `DomainEvent` sẵn có (`lib/events/`). Nhưng theo audit nội bộ, **chưa có đường chạy lại sự kiện thất bại** (ĐG-20). Nếu một sự kiện `FAILED`, kịch bản chăm sóc **im lặng không chạy** và không ai biết. **Phải bổ sung màn hình chạy lại sự kiện trước khi phụ thuộc vào engine này.**

#### D.2.5 GỌI ĐIỆN TÍCH HỢP CRM — phần trọng tâm

##### (a) Kết luận thẳng về Zalo

> ### ⚠️ **KHUYẾN NGHỊ LOẠI ZALO KHỎI VAI TRÒ TRỤC CHÍNH — CHỜ XÁC MINH Z-1.**
>
> **Đây là khuyến nghị của BA, chưa phải kết luận đã kiểm chứng.** Trụ chính của khuyến nghị là **Z-1**, mà Z-1 được đánh dấu `[SUY LUẬN, độ tin cao]` từ **3 nguồn thứ cấp** — **không phải câu khẳng định trực tiếp của Zalo**. Chính PL.1 mục C4 tự ghi: *"Đây là điểm quan trọng nhất của phần gọi điện → **phải xác nhận lại với Zalo trước khi Ban ra quyết định**"*.
> ⇒ Đã đưa việc **F0-11 "Xác minh Z-1 với Zalo/đại lý Zalo"** vào §F.0, **phải xong TRƯỚC khi Ban giám đốc trả lời Q2**. Nếu F0-11 cho kết quả ngược (ZCC gọi được vào SIM, có webhook trạng thái, có tệp ghi âm) thì **phải viết lại mục này**.

**Zalo *có* API gọi thoại** — Zalo For Developers có nhánh tài liệu `official-account/goi-thoai/` `[WEB]` https://developers.zalo.me/docs/official-account/goi-thoai/tong-quan, và nhóm quyền OA có nhóm "Gọi thoại" riêng. Nhưng có **năm khái niệm Zalo rất dễ nhầm**, phải tách bạch:

| # | Tên | Bản chất | Có API cho bên thứ ba? | Gọi ra SIM của khách được không? |
|---|---|---|---|---|
| 1 | **Tin nhắn OA** | Chat với người đã quan tâm OA | Có | ❌ không phải thoại |
| 2 | **ZNS** | Gửi tin **theo mẫu đã duyệt** tới **số điện thoại** | Có — **Sata Robo đang dùng** (`lib/zalo/provider.ts:15` điểm cuối ZNS; `:99-105` hàm gửi) | ❌ không phải thoại |
| 3 | **MiniCall (MCC)** | Gọi thoại **thủ công ngay trên OA Manager** | ❌ là giao diện của Zalo | Gọi được, nhưng nhân viên phải rời CRM |
| 4 | **Zalo Cloud Connect (ZCC)** | **SIP Trunk** nối OA Zalo với tổng đài/IP PBX/SBC của doanh nghiệp | ✅ có | Xem cảnh báo dưới |
| 5 | **Gọi thoại Zalo cá nhân** | Người dùng gọi nhau miễn phí | ❌ không có API doanh nghiệp | Không áp dụng |

**Ba lý do đề xuất loại Zalo khỏi vai trò trục chính** — *lưu ý mức chắc chắn của từng lý do khác nhau rõ rệt:*

| # | Lý do | Bằng chứng |
|---|---|---|
| **Z-1** | **Cuộc gọi Zalo đổ chuông TRONG ỨNG DỤNG ZALO, không phải vào SIM.** Số điện thoại chỉ đóng vai trò tra ra tài khoản Zalo, không phải đích quay số | `[WEB]` oa.zalo.me: *"Gọi thoại là tính năng tương tác hai chiều giữa **Zalo OA** của doanh nghiệp và **người dùng Zalo**"*; `[WEB]` mitek.vn mô tả ZCC là *"giải pháp gọi CSKH **thông qua ứng dụng Zalo**"*; `[WEB]` kinhdoanhso.com nêu ZCC nhận diện người dùng **kể cả khi họ đổi số điện thoại** ⇒ định danh là tài khoản Zalo. — `[SUY LUẬN, độ tin cao]` từ 3 nguồn nhất quán, **không phải câu khẳng định trực tiếp của Zalo** |
| **Z-2** | **ZCC yêu cầu doanh nghiệp ĐÃ CÓ tổng đài SIP** (IP PBX / SBC / Gateway) để nối vào. Sata Robo **không có** tổng đài nào — quét toàn repo `omicall / stringee / SIP / webrtc / click2call` ra **0 kết quả thật** | `[WEB]` oa.zalo.me; khảo sát mã nguồn |
| **Z-3** | **Lead của Sata Robo đến từ Messenger-first (Page HO)**, không phải từ Zalo OA. Phần lớn phụ huynh **chưa từng tương tác Zalo OA** ⇒ rơi vào ô "phải xin quyền gọi, mất phí, khách có thể từ chối" | `CLAUDE.md` mục Business context; `[WEB]` developers.zalo.me có hẳn API "Gửi yêu cầu cấp quyền gọi" |

**Zalo hoạt động ra sao trong thực tế nghiệp vụ:**

| Tình huống phụ huynh | Gọi bằng Zalo OA | Gọi bằng tổng đài đám mây |
|---|---|---|
| Có Zalo, đang online | ✅ gọi được, **hiện tên thương hiệu Sata Robo** | ✅ gọi được |
| Có Zalo nhưng tắt thông báo / app chạy nền | ⚠️ rủi ro nhỡ cuộc gọi cao | ✅ gọi được |
| Không cài Zalo | ❌ **không gọi được** | ✅ gọi được |
| Số cố định, số công ty | ❌ **không gọi được** | ✅ gọi được |
| Chưa tương tác OA quá 30 ngày | ⚠️ phải xin quyền, mất phí, khách có thể từ chối | ✅ gọi được ngay |

> **KẾT LUẬN (có điều kiện).** Yêu cầu "gọi điện tích hợp CRM" là **KHẢ THI**. Theo bằng chứng hiện có, **không khả thi bằng Zalo OA đơn thuần** ⇒ khuyến nghị dùng **tổng đài đám mây**. ⚠️ **Kết luận này treo trên Z-1 (`[SUY LUẬN]`) và chỉ được coi là chốt sau khi F0-11 xác nhận.** Riêng **Z-2 và Z-3 đứng độc lập với Z-1** và tự chúng đã đủ để nói "Zalo không thể là trục chính **ở thời điểm hiện tại**": Sata Robo chưa có tổng đài SIP để ZCC nối vào, và phần lớn phụ huynh đến từ Messenger chứ không từ Zalo OA.
> **Zalo giữ đúng vai trò hiện tại:** ZNS để nhắn nhắc (đã chạy), và **giai đoạn sau** có thể bật thêm ZCC để hưởng lợi thế *hiện tên thương hiệu khi gọi* cho nhóm phụ huynh thân thiết — nhưng đó là **cộng thêm**, không phải thay thế, và chỉ làm sau khi đã có tổng đài SIP.
> **Mô hình MISA xác nhận cùng kết luận:** trong AMIS CRM, Zalo OA là kênh **chat**; kênh gọi là **tổng đài VOIP** với 8 nhà cung cấp, **trong đó có OMICall** `[WEB]` N11, N13.

> ⚠️ `[CHƯA KIỂM CHỨNG]` **Toàn bộ chi tiết kỹ thuật API gọi thoại của Zalo** — tên endpoint, tham số, mã lỗi, có webhook trạng thái không, có tệp ghi âm không. Lý do: trang `developers.zalo.me` dựng bằng JavaScript, công cụ tải về chỉ nhận được tiêu đề; tệp PDF chính thức về ZCC tải được nhưng không giải mã thành văn bản. **Nếu Ban giám đốc muốn cân nhắc Zalo nghiêm túc, phải mở trực tiếp bằng trình duyệt và làm việc với đại lý Zalo.**

##### (b) Luồng gọi RA — từng bước

```
[1]  Sale mở màn hình lead / nhu cầu học → bấm nút "Gọi"
       ↓
[2]  Máy chủ kiểm: đã đăng nhập → có quyền → lead thuộc phạm vi cơ sở của mình
       → số KHÔNG nằm trong Danh sách không gọi nội bộ
       → nếu mục đích là "chào bán, quảng cáo" thì phải có đồng ý marketing THẬT
       ↓
[3]  Lấy: số điện thoại của lead (đã chuẩn hoá) + số máy lẻ của Sale
       + ĐẦU SỐ HIỂN THỊ THEO CƠ SỞ (CS1 hiện số CS1, CS2 hiện số CS2)
       ↓
[4]  Gọi API nhà cung cấp: {máy lẻ, đầu số, số khách}
       ↓
[5]  Nhận về MÃ CUỘC GỌI → TẠO NGAY bản ghi CUỘC GỌI (trạng thái "Khởi tạo")
       gắn lead + nhân viên + CƠ SỞ + mã nhà cung cấp
       ⚠️ Tạo TRƯỚC khi webhook về — nếu webhook không bao giờ tới,
          ta vẫn biết "đã có người bấm gọi". Không mất dấu vết.
       ↓
[6]  Tổng đài đổ chuông MÁY LẺ CỦA SALE trước → Sale nhấc → tổng đài mới quay số phụ huynh
       ⚠️ Máy lẻ có thể là app trên điện thoại, IP phone, hoặc softphone.
          Sale KHÔNG cần cắm tai nghe vào máy tính. Rất hợp đội hay di chuyển CS1↔CS2.
       ↓
[7]  Nhà cung cấp bắn webhook trạng thái: tạo → sớm → đổ chuông → có người nghe → kết thúc
       ↓
[8]  Endpoint nhận webhook:
       - ghi WebhookDelivery (nguồn + mã ngoài)
       - mã ngoài đã tồn tại ⇒ đánh dấu TRÙNG, DỪNG
       - bỏ qua cuộc gọi nội bộ (hướng = nội bộ)
       - cập nhật bản ghi CUỘC GỌI, CHỈ CHO PHÉP TRẠNG THÁI TIẾN, KHÔNG LÙI
       ↓
[9]  Khi kết thúc: ghi thời lượng, kết quả, khoá tệp ghi âm
       ↓
[10] TRONG CÙNG MỘT GIAO DỊCH:
       - tạo LeadActivity loại CALL (dòng hiển thị trên timeline)
       - cập nhật lastActivityAt (reset đồng hồ SLA-4)
       - nếu CÓ NGƯỜI NGHE và firstContactAt đang trống ⇒ đóng mốc firstContactAt (tắt SLA-3)
       ↓
[11] Phát sự kiện "cuộc gọi kết thúc" (chống trùng theo mã cuộc gọi)
       → việc phụ: cập nhật KPI, chạy kịch bản chăm sóc SK-07, thống kê
       ↓
[12] Sale khai KẾT QUẢ NGHIỆP VỤ (quan tâm / hẹn gọi lại / từ chối / sai số)
       → nếu "hẹn gọi lại" ⇒ tự tạo việc cần làm kèm hạn
       ↓
[13] Timeline lead hiển thị: 14:32 · Gọi ra · 2 phút 15 giây · Quan tâm · [Nghe lại]
```

**Ba điểm thiết kế cốt lõi:** bước [5] tạo bản ghi **trước** webhook (không mất dấu vết); bước [10] đúng quy tắc "dữ liệu ràng buộc nhau đi trong giao dịch, việc phụ đi qua sự kiện" của dự án; bước [11] dùng lại cơ chế phát sự kiện chống trùng đã có (`lib/events/publish.ts:11-36`).

##### (c) Luồng gọi VÀO và đối khớp số điện thoại

```
Phụ huynh gọi vào đầu số của cơ sở → tổng đài đổ chuông theo nhóm/IVR
       ↓
webhook: hướng = gọi vào, kèm SỐ CỦA KHÁCH
       ↓
CHUẨN HOÁ SỐ về một dạng duy nhất, rồi tra ngược theo thứ tự ưu tiên:
       ① Học viên đang học (qua người liên hệ của gia đình)
       ② Người liên hệ của gia đình
       ③ Nhu cầu học đang mở
       ④ Lead
       ↓
   ┌───────────────┬──────────────────────┬─────────────────────────┐
   │ TÌM THẤY 1    │ TÌM THẤY NHIỀU       │ KHÔNG THẤY              │
   ├───────────────┼──────────────────────┼─────────────────────────┤
   │ gắn vào đó    │ gắn vào bản ghi ĐANG │ tạo CUỘC GỌI "chưa rõ   │
   │               │ MỞ, MỚI NHẤT         │ chủ" (không lead)       │
   │               │ + bật cờ CẦN RÀ SOÁT │ → vào hàng chờ xử lý tay│
   └───────────────┴──────────────────────┴─────────────────────────┘
       ↓
Hiển thị cửa sổ "Cuộc gọi đến" cho nhân viên đang trực (nếu đang mở trình duyệt)
       ↓
Nếu KHÔNG AI NGHE ⇒ cuộc gọi nhỡ ⇒ tạo việc cần làm "Gọi lại" cho người phụ trách
```

> **Thứ tự tra ngược này khác MISA có chủ ý.** MISA tra Khách hàng → Liên hệ → Tiềm năng. Sata Robo phải đặt **học viên đang học lên trước** vì phần lớn cuộc gọi đến là phụ huynh của học viên hiện tại hỏi việc học, không phải khách mới.

**Quy tắc đối khớp số — chi tiết:**

| # | Tình huống | Xử lý |
|---|---|---|
| 1 | Một số, nhiều định dạng (`0905123456` / `+84905123456` / `84905123456` / `0905 123 456`) | Chuẩn hoá về **một dạng duy nhất** và lưu thành trường riêng. Dự án **đã có hàm chuẩn hoá** (`lib/zalo/provider.ts:47-52`, đưa về dạng `84xxxxxxxxx`) — **tách ra dùng chung, đừng viết lại lần hai** |
| 2 | Một số ứng với nhiều lead (phụ huynh có 2 con, 2 lần đăng ký) | Ưu tiên bản ghi **đang mở, mới nhất**; bật cờ cần rà soát |
| 3 | Số không khớp bất kỳ ai | Vẫn **lưu cuộc gọi**, để trống chủ, đưa vào **hàng chờ "Cuộc gọi chưa gán"**. Quản lý gán tay hoặc bấm **"Tạo lead từ cuộc gọi này"**. ⚠️ **Tuyệt đối không vứt bỏ** |
| 4 | Số đã gắn nhưng sau đó phát hiện sai | Cho phép gán lại; **ghi vết ai gán lại, khi nào, lý do** |
| 5 | Cuộc gọi nội bộ giữa hai nhân viên | **Lọc bỏ ngay tại endpoint** — không đưa vào CRM, không tính KPI |

##### (d) Chống trùng, chống ghi đè, cách ly cơ sở

| Mã | Vấn đề | Biểu hiện nếu bỏ qua | Cách xử lý bắt buộc |
|---|---|---|---|
| **CG-01** | **Webhook gửi trùng.** Tài liệu OMICall ghi rõ *"transaction_id … OMI có thể gửi nhiều lần"* (do chuyển tiếp cuộc gọi) `[WEB]` | Một cuộc gọi hiện 3 lần trên timeline; KPI Sale bị thổi phồng | **Mã cuộc gọi nhà cung cấp là khoá DUY NHẤT** trong CSDL; ghi theo kiểu "tạo-hoặc-cập-nhật". Dùng lại `WebhookDelivery` (`prisma/schema.prisma:3673-3689`) đã có chỉ mục theo `(nguồn, mã ngoài)` |
| **CG-02** | **Webhook đến sai thứ tự** (kết thúc về trước có-người-nghe do mạng) | Cuộc gọi bị ghi đè ngược về trạng thái cũ | Lưu **thứ tự/mốc thời gian của nhà cung cấp**; **chỉ cho trạng thái tiến, không lùi** |
| **CG-03** | **Cách ly cơ sở** — CS1 xem/nghe được cuộc gọi của CS2 | Rò dữ liệu; đúng loại lỗi hệ thống vừa vá xong ở đợt RBAC | **Cuộc gọi bắt buộc có `centerId`** và **phải nằm trong danh sách model được cách ly** (`lib/db-scope.ts:11-38`). ⚠️ Nhắc lại: **`scopedDb` KHÔNG che thao tác GHI** (`CLAUDE.md`) — mọi lệnh tạo phải tự đặt `centerId`, mọi lệnh sửa/xoá phải tự kiểm phạm vi. **Bắt buộc có kiểm thử CI**: "CS1 không thấy cuộc gọi CS2" |
| **CG-04** | **Webhook giả mạo.** Tài liệu OMICall **không mô tả cơ chế ký/xác thực** | Kẻ xấu bơm cuộc gọi giả, phá KPI và làm sai báo cáo | **Bắt buộc hỏi nhà cung cấp trước khi ký hợp đồng.** Nếu không có chữ ký: URL bí mật + token bí mật trong header + lọc dải IP + giới hạn tần suất. Mẫu chuẩn có sẵn trong repo: `lib/crm/meta-webhook.ts:8-19` (so sánh chữ ký an toàn theo thời gian) |
| **CG-05** | **Webhook rớt** (mạng lỗi, hết thời gian, đang deploy) | Thiếu cuộc gọi trong báo cáo, KPI sai | **Cron đối soát hằng đêm**: gọi API lịch sử cuộc gọi của nhà cung cấp, so với dữ liệu nội bộ, vá phần thiếu. Hệ thống đã có 15 cron chạy ổn định |
| **CG-06** | **Cuộc gọi 0 giây tính là "đã liên hệ"** | Sale "chống cháy SLA" bằng cách bấm gọi rồi cúp | **Chỉ đóng mốc `firstContactAt` khi có người nghe VÀ thời lượng ≥ ngưỡng tối thiểu** (đề xuất 10 giây), ngưỡng khai trong `SystemSetting` như các ngưỡng SLA hiện có (`lib/crm/sla.ts:21-36`) |
| **CG-07** | **Sai lệch múi giờ** — nhà cung cấp trả mốc dạng Unix (giây × 1000) | Lệch 7 giờ trong báo cáo | Chuẩn hoá về cùng kiểu thời gian có múi giờ như toàn bộ schema hiện tại |
| **CG-08** | **Cuộc gọi không rõ người thực hiện** (nhà cung cấp trả giá trị mặc định cấp tenant) | Cuộc gọi treo lơ lửng, không ai chịu trách nhiệm | Vẫn lưu, để trống nhân viên, trạng thái "chưa gán chủ", đưa vào hàng chờ |

##### (e) Ghi âm — ai được nghe, lưu bao lâu, thông báo thế nào

| Hạng mục | Quy định đề xuất | Căn cứ |
|---|---|---|
| **Thông báo trước khi ghi âm** | **Bật lời thông báo tự động đầu mỗi cuộc gọi**: *"Cuộc gọi có thể được ghi âm nhằm nâng cao chất lượng dịch vụ."* Thông báo phải **trước khi** ghi âm bắt đầu. Lưu cờ "đã thông báo" trên bản ghi cuộc gọi | Luật 91/2025 cấm ghi âm khi không có sự đồng ý; tổng đài CSKH tự động ghi âm **phải thông báo rõ ràng trước khi ghi** `[WEB]` thuvienphapluat.vn |
| **Khách từ chối ghi âm** | **Vẫn phải gọi được**, chỉ tắt ghi âm. Không được biến ghi âm thành điều kiện để được phục vụ | `[SUY LUẬN]` từ nguyên tắc đồng ý tự nguyện |
| **Ai được nghe** | Mặc định: **Quản lý cơ sở và Quản trị viên hệ thống**. **KHÔNG mặc định cho Sale** (kể cả cuộc gọi của chính mình — cần quyết định ở §G câu Q3) | `[SUY LUẬN]` — dữ liệu cá nhân của phụ huynh, có thể nhắc tên con |
| **Mỗi lần nghe** | **Ghi audit**: ai nghe, cuộc gọi nào, khi nào, từ đâu | Nguyên tắc "xuất/đọc dữ liệu nhạy cảm có ghi vết" của dự án |
| **Không lộ liên kết thô** | **Không bao giờ trả liên kết tệp ghi âm của nhà cung cấp ra trình duyệt.** Phải đi qua một endpoint trung gian có kiểm quyền, cấp liên kết hạn ngắn | Liên kết thô ai có cũng nghe được |
| **Thời hạn lưu** | Đề xuất **90 ngày** cho mục đích chất lượng dịch vụ; kéo dài tối đa **12 tháng** chỉ cho cuộc gọi được gắn cờ tranh chấp/khiếu nại. Hết hạn ⇒ xoá tự động | ⚠️ **Pháp luật KHÔNG nêu con số cụ thể** cho ghi âm CSKH, chỉ nêu nguyên tắc "chỉ lưu trong thời gian cần thiết". **Con số 90 ngày / 12 tháng là ĐỀ XUẤT của BA, không phải quy định** — Ban giám đốc phải chốt và chịu trách nhiệm giải trình |
| **Tệp lưu ở đâu** | Phải xác định: trên hạ tầng nhà cung cấp hay tải về kho R2 của Sata Robo | ⚠️ **Nếu lưu ở máy chủ nước ngoài** ⇒ phát sinh hồ sơ chuyển dữ liệu xuyên biên giới, mức phạt vi phạm là **5% doanh thu năm trước** `[WEB]`. **Câu hỏi bắt buộc hỏi nhà cung cấp** |
| **Dữ liệu trẻ em** | Cuộc gọi thường nhắc tên con, lớp, tình hình học. **Không ghi thông tin con vào ghi chú cuộc gọi ngoài mức cần thiết** | Đối tượng là học sinh lớp 1–8; kế thừa nguyên tắc `StudentConsent` sẵn có |
| **Giọng nói có phải sinh trắc học?** | ⚠️ `[CHƯA KIỂM CHỨNG]` — nếu **có**, ghi âm trở thành **dữ liệu nhạy cảm** và chi phí tuân thủ tăng đáng kể (phải có đồng ý riêng + hồ sơ đánh giá tác động riêng). **Đây là câu hỏi bắt buộc cho luật sư** | Xem §E.1 |

##### (f) Gắn vào SLA và KPI

| Luật SLA đang có | Cuộc gọi tác động thế nào |
|---|---|
| **SLA-3** — "Chưa liên hệ khách > 3 giờ" (`lib/crm/sla.ts:42`) | Cuộc gọi **có người nghe ≥ ngưỡng** ⇒ đóng mốc `firstContactAt` ⇒ tắt vi phạm. **Đây là điểm tích hợp rõ nhất** |
| **SLA-4** — "Lead im lặng > 2 ngày" (`:43`) | Mọi cuộc gọi ⇒ cập nhật `lastActivityAt` ⇒ reset đồng hồ. ⚠️ Phải **vá ĐG-08 trước** (hiện đang dùng nhầm trường) |
| **SLA mới đề xuất — SLA-5** | "Cuộc gọi nhỡ chưa gọi lại > 2 giờ trong giờ hành chính" |

**KPI mới cho Sale:**

| Chỉ số | Cách tính | Cảnh báo |
|---|---|---|
| Số cuộc gọi/ngày | Đếm cuộc gọi ra | ⚠️ **Không được đặt KPI thuần "số cuộc gọi"** — sẽ đẻ ra hành vi bấm gọi rồi cúp máy |
| **Tỷ lệ nghe máy** | Số cuộc có người nghe / tổng số cuộc gọi ra | Đo chất lượng dữ liệu số điện thoại và khung giờ gọi |
| Tổng thời lượng đàm thoại | Cộng thời lượng | |
| **Thời gian từ nhận lead tới cuộc gọi đầu tiên** | Trung vị | Chỉ số quan trọng nhất — phản ánh trực tiếp SLA-3 |
| Tỷ lệ chốt trên số cuộc gọi | Số nhu cầu thắng / số cuộc gọi có người nghe | Đo hiệu quả thật, không đo độ ồn |
| **Tỷ lệ cuộc gọi đi qua tổng đài** | Cuộc gọi trong hệ thống / (ước lượng tổng cuộc gọi thực tế) | Chống việc Sale dùng SIM cá nhân — xem QT-38 |

##### (g) Điều kiện tiên quyết — nói rõ hạ tầng còn thiếu

| # | Mảnh còn thiếu | Hiện trạng | Mức |
|---|---|---|---|
| **TQ-1** | **Bảng dữ liệu cuộc gọi** | Không tồn tại. Chỉ có JSON tự do trong `LeadActivity.metadata` (`prisma/schema.prisma:2952`) — không truy vấn, không báo cáo được | **CHẶN** |
| **TQ-2** | **Lớp bọc gọi nhà cung cấp** (kiểm cấu hình / gọi / kết thúc cuộc gọi) | Không tồn tại. `lib/zalo/provider.ts` chỉ biết gửi ZNS | **CHẶN** |
| **TQ-3** | **Endpoint webhook trạng thái cuộc gọi** có xác thực + chống trùng | Không tồn tại. Mẫu tốt để sao chép: `lib/crm/meta-webhook.ts` + `WebhookDelivery` | **CHẶN** |
| **TQ-4** | **Ánh xạ số máy lẻ ↔ nhân viên ↔ cơ sở** | Không tồn tại. `Employee` **không có trường số máy lẻ** | **CHẶN** |
| **TQ-5** | **Giao diện gọi trong màn lead** | Chưa có. Điểm gắn tự nhiên: `app/(admin)/admin/leads/[id]/_components/lead-activity-panel.tsx` (form nhập tay hiện tại) | **CHẶN** |
| **TQ-6** | **Tầng cổng gọi dịch vụ ngoài `modules/integration`** | ❌ **CHƯA TỒN TẠI** (`CLAUDE.md:72`; `ls modules/` không có). Quy ước "external call chỉ qua `modules/integration`" là **mong muốn**, không phải hiện trạng; rule chặn trong `.dependency-cruiser.cjs:76-85` khớp **0 file** | **Nợ kiến trúc — cần quyết định §G câu Q4** |
| **TQ-7** | **Chính sách lưu trữ tệp ghi âm** trên R2 + hạn lưu + thu hồi | Có kho R2 nhưng **chưa có văn bản nào** về ai được đọc, hạn lưu, thu hồi (`docs/taicautruc/01-intended-vs-implemented.md`) | **Cao (pháp lý)** |
| **TQ-8** | **Đường chạy lại sự kiện miền thất bại** | Không có trang, không có action, không có cron đọc lại (ĐG-20) | **Trung bình** — bắt buộc nếu nhật ký cuộc gọi phụ thuộc sự kiện |
| **TQ-9** | **Kiểm chứng bẫy thông báo nhân viên** (ĐG-21) | `[SUY LUẬN]` chưa chạy thử | **Trung bình** — phải test trước khi thiết kế thông báo "cuộc gọi nhỡ" |

> ⚠️ **KHÔNG được viết tiêu chí nghiệm thu dạng "đi qua `modules/integration`" như thể tầng đó đã có.** Phải viết rõ đây là việc mới cần dựng, hoặc chấp nhận tạm đặt lớp bọc ở `lib/telephony/` cho nhất quán với `lib/zalo/`, `lib/misa/`.

**Những gì KHÔNG thiếu — đừng lập kế hoạch làm lại:**

| Đã có | Vị trí |
|---|---|
| Hộp thư sự kiện miền + bộ điều phối chạy mỗi phút + thử lại + dọn tồn | `lib/events/dispatcher.ts:17-79` |
| Hàng đợi email + thử lại + Resend + log | `lib/email/queue.ts:60-146`; `lib/email/send.ts:28-120` |
| Giới hạn tần suất dùng chung (tự tụt về bộ nhớ khi lỗi) | `lib/rate-limit.ts:153-158` |
| Bảng cấu hình + bảng log tích hợp dùng chung | `prisma/schema.prisma:4747-4768` |
| Mẫu webhook có xác thực chữ ký + lưu vết + màn hình chạy lại | `lib/crm/meta-webhook.ts:8-19`; `app/(admin)/admin/crm/webhook-replay/` |
| Sentry bắt lỗi các lệnh gọi ra ngoài | `sentry.server.config.ts:18` |
| Dòng thời gian lead + reset đồng hồ SLA khi có hoạt động | `app/(admin)/admin/leads/actions.ts:301-349` |
| Hàm chuẩn hoá số điện thoại Việt Nam | `lib/zalo/provider.ts:47-52` |

#### D.2.6 Chọn nhà cung cấp tổng đài — so sánh và tiêu chí

**Khuyến nghị: chọn OMICall làm ứng viên số 1, nhưng lấy báo giá song song Stringee trước khi ký.**

| Tiêu chí | **OMICall** | **Stringee** | **Caresoft** | **3CX** | **Zalo ZCC** |
|---|---|---|---|---|---|
| Gọi tới SIM / số cố định | ✅ | ✅ | ✅ | ✅ | ❌ chỉ tới app Zalo |
| Bấm-gọi từ CRM qua API | ✅ | ✅ | ✅ | ✅ | Có API nhưng khác bản chất |
| Softphone trên trình duyệt | ✅ SDK v3 | ✅ | ✅ | ✅ | ❌ |
| Webhook trạng thái cuộc gọi | ✅ mô tả chi tiết tới từng trường, 5 trạng thái | ✅ | ✅ | ✅ | `[CHƯA KIỂM CHỨNG]` |
| Tệp ghi âm qua API | ✅ | ✅ (ghi âm thoại 0đ/phút) | `[CHƯA KIỂM CHỨNG]` | ✅ | `[CHƯA KIỂM CHỨNG]` |
| Ghi nhận cuộc gọi nhỡ | ✅ | ✅ | — | ✅ | `[CHƯA KIỂM CHỨNG]` |
| **Nhiều đầu số theo chi nhánh** | ✅ có API danh sách đầu số | — | — | ✅ | ❌ |
| Chất lượng tài liệu API | **Rất tốt** — có bản Markdown, có đánh phiên bản rõ (v2 khai tử 01/04/2026, v3 hiện hành) | Tốt | Tốt | Rất tốt | **Kém tiếp cận** |
| Mô hình giá | Theo người dùng/tháng | **Theo phút HOẶC theo kênh thoại đồng thời** | `[CHƯA KIỂM CHỨNG]` | Theo số cuộc gọi đồng thời | Theo yêu cầu cấp quyền + cuộc gọi thành công |
| Dùng thử | `[CHƯA KIỂM CHỨNG]` | **30 ngày** | `[CHƯA KIỂM CHỨNG]` | Có | Gói dùng thử OA |
| Hiện tên thương hiệu khi gọi | Theo đầu số | Theo đầu số | Theo đầu số | Theo đầu số | ✅ **hiện tên OA — điểm mạnh riêng** |
| **Được MISA hỗ trợ sẵn** | ✅ (Api-key + Domain) | ✅ (App ID + Secret) | ❌ | ❌ | (chỉ chat) |
| Kết luận | ⭐ **Ứng viên số 1** | ⭐ Ứng viên số 2 | Cần khảo sát thêm | Nặng vận hành, cần người quản trị PBX | Bổ sung, không thay thế |

**Lý do chọn OMICall:**
1. **Tài liệu API tốt nhất trong nhóm khảo sát** — có bản Markdown, có đánh phiên bản rõ ràng. Giảm rủi ro triển khai đáng kể.
2. Webhook mô tả **chi tiết tới từng trường**, kể cả cảnh báo "mã cuộc gọi có thể gửi nhiều lần" — dấu hiệu nhà cung cấp hiểu bài toán tích hợp.
3. Có API danh sách đầu số ⇒ **mỗi cơ sở một đầu số riêng**, khớp thẳng mô hình đơn vị tổ chức và **sẵn sàng cho cơ sở nhượng quyền ở tỉnh khác**.
4. Luồng "gọi máy lẻ trước, rồi mới quay số khách" ⇒ Sale **không cần cắm tai nghe vào máy tính**, dùng app trên điện thoại được.
5. Có sẵn cơ chế **danh sách chặn gọi** phía nhà cung cấp (mã lỗi `do_not_call`) — hữu ích cho tuân thủ.
6. Giá công khai, minh bạch.

**Lý do vẫn phải hỏi Stringee:** mô hình "theo kênh thoại đồng thời" có thể **rẻ hơn đáng kể** với đội 6 người nhưng chỉ 2–3 cuộc gọi cùng lúc; ghi âm thoại 0đ/phút; **dùng thử 30 ngày** ⇒ rủi ro thấp.

**Chi phí ước tính** `[WEB]` + `[SUY LUẬN]` — giả định 6 tài khoản Sale (HO + CS1 + CS2), gói Call Center:

| Khoản | Số tiền |
|---|---|
| Thuê bao phần mềm | 6 × 200.000đ = **1.200.000 đ/tháng** |
| Phí khởi tạo (một lần, dưới 10 người dùng) | **800.000 – 1.000.000 đ** |
| Cước viễn thông gọi ra | **Chưa có số liệu** — phụ thuộc sản lượng |
| Phí thuê đầu số | **Chưa có số liệu**. Đầu số 1800 khởi tạo ~1.800.000đ + thuê bao từ 400.000đ/tháng. `[SUY LUẬN]` Với B2C giáo dục, **đầu số cố định Đà Nẵng (0236) hoặc SIP di động thường hợp lý và rẻ hơn** 1800/1900 |

**Mười câu bắt buộc hỏi nhà cung cấp trước khi ký:**

| # | Câu hỏi | Vì sao |
|---|---|---|
| 1 | **URL môi trường sản xuất** là gì? | Tài liệu đang ghi địa chỉ có hậu tố `-stg` (thử nghiệm) |
| 2 | **Webhook có chữ ký xác thực không?** (HMAC / token dùng chung / dải IP cố định) | CG-04 — nếu không có là lỗ hổng nghiêm trọng |
| 3 | **Giới hạn tần suất** của API bấm-gọi và API lịch sử cuộc gọi? | Tài liệu không nêu |
| 4 | **Tệp ghi âm lưu ở đâu, giữ bao lâu, xoá theo yêu cầu được không?** | Nghĩa vụ bảo vệ dữ liệu cá nhân |
| 5 | Liên kết tệp ghi âm **có hạn dùng không** hay công khai vĩnh viễn? | CG rò dữ liệu |
| 6 | Có **môi trường thử nghiệm riêng** không? | Kiểm chứng trước khi cam kết |
| 7 | **Cam kết thời gian hoạt động và hỗ trợ sự cố?** | |
| 8 | SDK web **đã kiểm thử với React 19 chưa?** Bao giờ có gói npm? | Tài liệu chỉ ghi "React 18+", dự án chạy React 19; SDK hiện **chỉ cài qua CDN** — va với quy ước server-first của dự án |
| 9 | Hỗ trợ **nhiều đầu số theo chi nhánh** trong cùng một tài khoản không? | Bài toán đa cơ sở + nhượng quyền |
| 10 | **Dữ liệu khách hàng và tệp ghi âm lưu ở máy chủ tại Việt Nam?** | Chuyển dữ liệu xuyên biên giới — mức phạt 5% doanh thu |

> ⚠️ **KHÔNG dùng mini-CRM của nhà cung cấp tổng đài.** OMICall có sẵn CRM riêng. Dùng song song sẽ tạo **hai nguồn sự thật** về khách hàng — đúng loại lỗi kiến trúc dự án đang cố tránh — và đưa dữ liệu phụ huynh/học sinh sang bên thứ ba làm phức tạp nghĩa vụ pháp lý. **Chỉ dùng nhà cung cấp như hạ tầng thoại thuần tuý. CRM ở lại Sata Robo.**

#### D.2.7 Giữ nguyên những gì Sata Robo đang làm đúng — cách dùng chung với mô hình MISA

| Đặc thù Sata Robo | Cách hoà vào mô hình MISA |
|---|---|
| **Phễu SR.QD.217 (L1→L2→L3)** | Giữ nguyên **7 mốc thời gian trên `Lead`** làm **lớp đo lường**. Giai đoạn bán hàng của Nhu cầu học là **lớp tác nghiệp**. Hai lớp nối nhau bằng bảng ánh xạ giai đoạn → `LeadStatus`. **L1 = hội thoại · L2 = lead đủ điều kiện · L3 = nhu cầu thắng.** Báo cáo phễu cũ tiếp tục chạy không gián đoạn |
| **5 mức SLA + luật lead im lặng** | Giữ nguyên bộ luật và ngưỡng cấu hình được. **Bổ sung** SLA-5 (cuộc gọi nhỡ chưa gọi lại). Vá ĐG-07, ĐG-08 trước khi mở rộng |
| **Messenger-first (Page HO)** | Giữ nguyên. Hội thoại Messenger vẫn là bậc L1. **Bổ sung**: gửi tin thật (vá ĐG-14), và hiện hội thoại trong dòng thời gian 360° |
| **Bàn giao HO → cơ sở có xác nhận tiếp nhận** | Giữ nguyên. Đây là bước MISA không có, cần cho mô hình đa cơ sở và nhượng quyền. Trong quy trình bán hàng, đây là **hai mốc nội bộ**, không phải giai đoạn bán hàng |
| **Buổi học thử / lớp trải nghiệm** | Giữ nguyên toàn bộ. **Nâng lên thành giai đoạn chính thức** trong quy trình bán hàng A (Đã hẹn học thử → Đang học thử → Đã học thử). Đây là bước bán hàng **quan trọng hơn báo giá** trong giáo dục |
| **Chuyển đổi nguyên tử sang học viên** | Giữ nguyên toàn bộ, kể cả chống bấm hai lần, xử lý xung đột hồ sơ, gắn khoản thu theo tỷ trọng. **Bổ sung** duy nhất: đóng Nhu cầu học ở giai đoạn "Thắng" và gắn con trỏ hai chiều |
| **Học phí trả 2 đợt + duyệt của Quản lý cơ sở** | Giữ nguyên. Đưa vào engine phê duyệt chung như **một quy tắc phê duyệt**, không viết riêng |
| **Hoa hồng 4 tầng, trần 8%, không hoa hồng tái tục, thu hồi khi hoàn tiền** | Giữ nguyên. Nguồn tính hoa hồng vẫn là `Order`/`Payment`, **không đổi sang Nhu cầu học** |
| **Cách ly cơ sở ở tầng truy vấn (`scopedDb`)** | Giữ nguyên và **áp cho mọi bảng mới** (Nhu cầu học, Báo giá, Cuộc gọi, Chiến dịch). Mạnh hơn mô hình cấu hình của MISA |
| **Che thông tin cá nhân tại máy chủ** | Giữ nguyên và **mở rộng cho số điện thoại trong màn hình cuộc gọi** — không được để lộ đường vòng |

### D.3 Quy tắc nghiệp vụ

> Mỗi quy tắc là một câu khẳng định kiểm chứng được. Cột "Nguồn gốc": **MISA** = lấy từ mô hình MISA · **SATA** = giữ/mở rộng cái đang có · **MỚI** = phát sinh từ yêu cầu này · **LUẬT** = do pháp luật.

#### Nhóm 1 — Đối tượng và vòng đời (QT-01 → QT-11)

| Mã | Quy tắc | Nguồn gốc |
|---|---|---|
| **QT-01** | Một **Nhu cầu học** bắt buộc gắn với **đúng một** học viên — hoặc `LeadChild` (chưa chuyển đổi) hoặc `Student` (đã học). Không có nhu cầu học "chung chung cho cả gia đình". | MISA |
| **QT-02** | Một **Lead** có thể có **nhiều Nhu cầu học** (nhiều con, hoặc một con nhiều đợt). Một **Học viên** cũng có thể có nhiều Nhu cầu học theo thời gian. | MISA |
| **QT-03** | **Loại nhu cầu quyết định quy trình bán hàng.** Khi tạo nhu cầu, hệ thống tự chọn quy trình mặc định của loại đó; người dùng đổi được nếu có nhiều quy trình cùng loại. | MISA |
| **QT-04** | **Nhu cầu học bắt buộc có cơ sở.** Không cho lưu nếu chưa xác định cơ sở. Cơ sở kế thừa từ lead, đổi được bằng thao tác chuyển có ghi vết. | SATA |
| **QT-05** | **Đóng nhu cầu bắt buộc chọn lý do** từ danh mục. Với các lý do được cấu hình "cần ghi chú", bắt buộc nhập thêm ghi chú tự do. | MISA |
| **QT-06** | Một Nhu cầu học có **tối đa một đơn hàng thắng**. Đơn hàng thứ hai cho cùng học viên phải sinh từ một Nhu cầu học mới. | MISA |
| **QT-07** | Sau khi chuyển đổi, **Lead chuyển sang trạng thái đóng băng: chỉ đọc, không tác nghiệp** — vẫn xem được, vẫn dùng để chống trùng, nhưng không sửa/không đổi trạng thái/không chuyển. Mọi công việc chuyển sang hồ sơ Học viên. | MISA |
| **QT-08** | Con trỏ giữa Lead và Học viên là **hai chiều**: từ lead nhìn ra học viên đã sinh, và từ học viên nhìn ngược về lead gốc + nhu cầu gốc + chiến dịch gốc. | MISA |
| **QT-09** | **Người liên hệ chính** của một gia đình là duy nhất tại một thời điểm. Đổi người liên hệ chính phải ghi vết. | MISA |
| **QT-10** | Học viên còn **N buổi là hết khoá** (N cấu hình được) ⇒ hệ thống **tự sinh Nhu cầu học loại "Học tiếp"** ở giai đoạn đầu của quy trình B, gán cho Sale/CSM phụ trách cơ sở. | MỚI |
| **QT-11** | **Chống trùng lead giữ nguyên 3 tầng hiện có** và **mở rộng đối chiếu cả lead đã chuyển đổi** (theo mô hình MISA). Riêng luật chặn cross-center khi tạo tay (ĐG-16) được **nới**: nếu số trùng thuộc cơ sở khác, hệ thống **cảnh báo và cho tạo Nhu cầu học mới trên lead cũ** thay vì chặn cứng. | MISA + SATA |

#### Nhóm 2 — Quy trình bán hàng cấu hình được (QT-12 → QT-19)

| Mã | Quy tắc | Nguồn gốc |
|---|---|---|
| **QT-12** | **Mỗi giai đoạn bán hàng bắt buộc ánh xạ tới đúng một `LeadStatus` hiện có.** Không ánh xạ ⇒ không lưu được cấu hình. Đây là điều kiện để phễu SR.QD.217, luật SLA và mọi báo cáo cũ **không đứt gãy**. | MỚI (điều kiện tương thích ngược) |
| **QT-13** | **Giai đoạn không bị xoá cứng — chỉ ẩn.** Ẩn rồi khôi phục lại được. Bản ghi đang ở giai đoạn bị ẩn vẫn hiển thị đúng tên giai đoạn đó. | MISA |
| **QT-14** | Mỗi quy trình bắt buộc có **đúng một giai đoạn Đóng-thắng** và **ít nhất một giai đoạn Đóng-thua**. | MISA |
| **QT-15** | **Tỷ lệ thành công** nằm trong 0–100%. Giai đoạn Đóng-thắng = 100%, Đóng-thua = 0%, hệ thống tự đặt và không cho sửa. | MISA |
| **QT-16** | **Doanh số dự kiến** của một nhu cầu = giá trị dự kiến × tỷ lệ thành công của giai đoạn hiện tại. Tổng dự báo = tổng các nhu cầu **đang mở** trong kỳ. | MISA |
| **QT-17** | **Ngày kỳ vọng chốt** tự tính = ngày tạo nhu cầu + số ngày kỳ vọng của quy trình; người phụ trách sửa được, sửa thì ghi vết. | MISA |
| **QT-18** | Rời một giai đoạn phải thoả **điều kiện bắt buộc** đã cấu hình cho giai đoạn đó (ví dụ: phải có ≥1 hoạt động, phải có báo giá, phải có khoản ghi nhận). Không thoả ⇒ chặn, hiện lý do cụ thể. | MISA |
| **QT-19** | Sửa cấu hình quy trình **chỉ áp dụng cho nhu cầu tạo mới**. Nhu cầu đang chạy giữ nguyên giai đoạn hiện tại cho tới khi được chuyển tay. | MỚI (an toàn dữ liệu) |

#### Nhóm 3 — Chấm điểm, phân bổ, phê duyệt (QT-20 → QT-28)

| Mã | Quy tắc | Nguồn gốc |
|---|---|---|
| **QT-20** | **Điểm tiềm năng chỉ để sắp xếp ưu tiên, không bao giờ chặn thao tác.** Sale vẫn chăm sóc được lead điểm thấp. | MỚI (chống lạm dụng) |
| **QT-21** | Điểm được tính lại khi: tạo lead · có hoạt động mới · đổi giai đoạn · thay đổi thông tin xét điểm. Mỗi lần tính lưu lại **điểm cũ, điểm mới, quy tắc áp dụng**. | MISA |
| **QT-22** | **MỌI đường vào lead — kể cả webhook — đều đi qua cùng một hàm phân bổ.** Không tồn tại đường phân bổ thứ hai. *(Vá ĐG-01 — điều kiện tiên quyết của toàn bộ nhóm này.)* | MỚI |
| **QT-23** | Quy tắc phân bổ chạy **theo thứ tự ưu tiên, lấy quy tắc đầu tiên khớp**. Không quy tắc nào khớp ⇒ lead vào **hàng chờ "Chưa phân"** và bắn thông báo cho Quản lý cơ sở. **Không bao giờ để lead trôi vô hình.** | MISA + MỚI |
| **QT-24** | **Lead đã có tương tác của Sale thì không bị phân lại tự động** (giữ luật hiện có). Chuyển tay vẫn được, nhưng bắt buộc có ghi chú bàn giao ≥ 5 ký tự (giữ luật hiện có). | SATA |
| **QT-25** | Lead vào từ webhook **bắt buộc được gán cơ sở** — theo Page Facebook nguồn, theo quy tắc phân bổ, hoặc theo chia đều tải. Không có trường hợp lead tồn tại lâu dài mà không thuộc cơ sở nào. | MỚI |
| **QT-26** | **Báo giá vượt ngưỡng ưu đãi hoặc dưới giá sàn của khoá ⇒ bắt buộc chạy quy trình phê duyệt**, không được gửi phụ huynh khi chưa duyệt. | MISA |
| **QT-27** | Quy trình phê duyệt chạy **theo cấp trong đơn vị tổ chức**, không theo tên người cụ thể. Người vắng ⇒ theo người thay đã khai. Quá hạn ⇒ nhắc, sau đó tự đẩy lên cấp trên. | MISA |
| **QT-28** | Mọi lần duyệt/từ chối **bắt buộc có lý do** và được ghi vào sổ audit. | MISA + SATA |

#### Nhóm 4 — Chiến dịch và quy nguồn (QT-29 → QT-30)

| Mã | Quy tắc | Nguồn gốc |
|---|---|---|
| **QT-29** | Mỗi lead **bắt buộc có nguồn thuộc danh mục chuẩn**. Giá trị không khớp danh mục ⇒ gán vào nguồn "Khác" và bật cờ cần rà soát; **không được từ chối tạo lead vì lý do nguồn**. | MỚI |
| **QT-30** | **Doanh thu được quy về chiến dịch qua chuỗi: Chiến dịch → Lead → Nhu cầu học → Đơn hàng → Khoản thu đã xác nhận.** Chi phí/lead và chi phí/ghi danh của một cơ sở **chỉ được tính trên chi phí thuộc cơ sở đó**. *(Vá ĐG-09 — hiện đang chia trên tổng chi phí toàn hệ thống.)* | MỚI |

#### Nhóm 5 — Sự đồng ý và gửi tin (QT-31 → QT-33)

| Mã | Quy tắc | Nguồn gốc |
|---|---|---|
| **QT-31** | **Cấm ghi đè cứng sự đồng ý.** `consentMarketing` chỉ được đặt bằng **hành vi thật** của người dùng. Phải lưu được **thời điểm, nội dung đã đồng ý, và đường vào nào ghi nhận**. **Cấm ô tick sẵn.** *(Vá ĐG-02 — hiện 3 chỗ hardcode `true`.)* | LUẬT |
| **QT-32** | **Mọi hành động gửi tin cho phụ huynh (email chiến dịch, ZNS chăm sóc, tin hàng loạt) đều kiểm sự đồng ý thật ngay trước khi gửi.** Không có đồng ý ⇒ không gửi, ghi lý do bỏ qua. Tin **giao dịch** (biên nhận, nhắc lịch học, nhắc học phí) không thuộc phạm vi này. | LUẬT |
| **QT-33** | **Bắt buộc phân loại mục đích cuộc gọi trước khi gọi**: *chăm sóc/xử lý yêu cầu* hay *chào bán/quảng cáo*. Cuộc gọi loại **chào bán/quảng cáo** phải: có đồng ý marketing thật, không nằm trong danh sách không gọi nội bộ, và tuân thủ quy định về Danh sách không quảng cáo. ⚠️ `[CHƯA KIỂM CHỨNG]` có API tra cứu Danh sách không quảng cáo quốc gia tự động hay không — nếu không, phải đối chiếu theo lô định kỳ. | LUẬT |

#### Nhóm 6 — Cuộc gọi (QT-34 → QT-40)

| Mã | Quy tắc | Nguồn gốc |
|---|---|---|
| **QT-34** | **Mã cuộc gọi của nhà cung cấp là duy nhất trong hệ thống.** Webhook trùng mã ⇒ đánh dấu trùng và dừng, không tạo bản ghi thứ hai, không cộng KPI lần hai. | MỚI (CG-01) |
| **QT-35** | **Trạng thái cuộc gọi chỉ tiến, không lùi.** Sự kiện đến sau nhưng mô tả trạng thái sớm hơn ⇒ bỏ qua phần trạng thái, vẫn lưu vết. | MỚI (CG-02) |
| **QT-36** | **Không bao giờ trả liên kết tệp ghi âm thô ra trình duyệt.** Mọi lượt nghe đi qua endpoint có kiểm quyền, cấp liên kết hạn ngắn, và **ghi audit từng lượt nghe**. | LUẬT + MỚI |
| **QT-37** | **Mốc "đã liên hệ" chỉ đóng khi cuộc gọi có người nghe VÀ thời lượng ≥ ngưỡng tối thiểu** (mặc định đề xuất 10 giây, khai trong cấu hình hệ thống). Chống hành vi bấm gọi rồi cúp để tắt cảnh báo SLA. | MỚI (CG-06) |
| **QT-38** | **KPI Sale không được đặt thuần theo số cuộc gọi.** Bộ chỉ số bắt buộc gồm ít nhất: tỷ lệ nghe máy, thời gian tới cuộc gọi đầu tiên, tỷ lệ chốt trên cuộc gọi có người nghe. | MỚI |
| **QT-39** | **Cuộc gọi không đối khớp được vẫn phải lưu**, để trống chủ, đưa vào hàng chờ "Cuộc gọi chưa gán". Cấm loại bỏ dữ liệu cuộc gọi. | MISA + MỚI |
| **QT-40** | **Cuộc gọi nội bộ giữa nhân viên không được đưa vào CRM** và không tính KPI. | MỚI (CG-Tổng) |

#### Nhóm 7 — Cách ly, lưu vết, tự động hoá (QT-41 → QT-47)

| Mã | Quy tắc | Nguồn gốc |
|---|---|---|
| **QT-41** | **Mọi bảng CRM mới (Nhu cầu học, Báo giá, Cuộc gọi, Chiến dịch) bắt buộc có trường cơ sở và nằm trong danh sách model được cách ly.** Mọi lệnh tạo phải tự đặt cơ sở; mọi lệnh sửa/xoá phải tự kiểm phạm vi. **`scopedDb` KHÔNG che thao tác ghi.** | SATA (`CLAUDE.md`) |
| **QT-42** | **Cấm hardcode danh sách cơ sở ở bất kỳ đâu.** Mọi thứ đi qua cây đơn vị tổ chức. Mở cơ sở mới hoặc cơ sở nhượng quyền = thêm dữ liệu, **không sửa mã**. | SATA |
| **QT-43** | Mọi thay đổi trên bản ghi CRM có giá trị quản trị (đổi giai đoạn, đổi người phụ trách, đổi cơ sở, duyệt/từ chối, đóng nhu cầu, nghe ghi âm, xuất dữ liệu) **đều ghi audit kèm người thực hiện, thời điểm và lý do khi cần**. | SATA + MISA |
| **QT-44** | **Tối đa 10 quy tắc tự động đang bật trên một đối tượng.** Vượt ⇒ chặn bật thêm. | MISA |
| **QT-45** | **Quy tắc tự động chỉ sửa được khi đã tắt.** | MISA |
| **QT-46** | **Hành động do quy tắc sinh ra không được kích hoạt quy tắc khác quá một tầng.** Chống vòng lặp. | MISA + MỚI |
| **QT-47** | **Mọi việc gửi ra ngoài hệ thống (email, ZNS, gọi API nhà cung cấp) đi qua sự kiện miền, không gọi thẳng trong luồng nghiệp vụ.** Dữ liệu ràng buộc nhau (tiền, đơn hàng, ghi danh) đi trong giao dịch. | SATA (`CLAUDE.md`) |

### D.4 Ma trận phân quyền và cách ly đa cơ sở

#### D.4.1 Nguyên tắc trước khi đọc bảng

> ⚠️ **Hệ thống đang trong cửa sổ shadow-compare RBAC.** Bảng dưới là **trạng thái đích**, không phải việc làm ngay. Xem §E.4 để biết cái gì làm được ngay, cái gì phải đợi.
> **Giai đoạn 1 khuyến nghị: KHÔNG thêm khoá quyền mới.** Mượn `leads:edit` cho hành vi gọi, `leads:view-all` / `leads:view-own` cho việc xem, `leads:view-pii` cho việc thấy số điện thoại. Chỉ tách quyền riêng sau khi đóng cửa sổ shadow.

#### D.4.2 Ma trận quyền đích

| Nhóm | Khoá quyền đề xuất | SUPER_ADMIN | CENTER_MANAGER | SALES_CSM | MARKETING | TRAINING | ACCOUNTANT | Ghi chú |
|---|---|:--:|:--:|:--:|:--:|:--:|:--:|---|
| **Lead** | `leads:*` (9 khoá hiện có) | — | — | — | — | — | — | **Giữ nguyên ma trận đang enforce** (`lib/auth/permissions.ts:299-318`), không đụng |
| **Nhu cầu học** | `opportunities:view-all` | ✅ | ✅ | — | ✅ | — | — | Xem mọi nhu cầu trong phạm vi cơ sở |
| | `opportunities:view-own` | ✅ | — | ✅ | — | — | — | |
| | `opportunities:create` / `:edit` | ✅ | ✅ | ✅ | — | — | — | Marketing **không** tác nghiệp bán hàng |
| | `opportunities:change-stage` | ✅ | ✅ | ✅ | — | — | — | |
| | `opportunities:close` | ✅ | ✅ | ✅ | — | — | — | Bắt buộc chọn lý do (QT-05) |
| | `opportunities:reassign` | ✅ | ✅ | — | — | — | — | |
| **Báo giá** | `quotes:view` | ✅ | ✅ | ✅ | — | — | ✅ | Kế toán xem để đối chiếu |
| | `quotes:create` / `:edit` | ✅ | ✅ | ✅ | — | — | — | |
| | `quotes:send` | ✅ | ✅ | ✅ | — | — | — | Chặn nếu đang chờ duyệt (QT-26) |
| | `quotes:approve` | ✅ | ✅ | — | — | — | — | Cấp duyệt lấy từ đơn vị tổ chức, không cứng theo vai |
| **Cuộc gọi** | `calls:make` | ✅ | ✅ | ✅ | — | — | — | ⚠️ GĐ-1 mượn `leads:edit` |
| | `calls:view-own` | ✅ | — | ✅ | — | — | — | |
| | `calls:view-all` | ✅ | ✅ | — | — | — | — | Trong phạm vi cơ sở |
| | **`calls:listen-recording`** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | 🔴 **Tách riêng, KHÔNG mặc định cho Sale.** Mỗi lượt nghe ghi audit (QT-36) |
| | `calls:export` | ✅ | ✅ | — | — | — | — | Kèm đóng dấu người tải + audit |
| | `calls:assign` (gán cuộc gọi chưa rõ chủ) | ✅ | ✅ | — | — | — | — | |
| **Chiến dịch** | `campaigns:view` | ✅ | ✅ | ✅ | ✅ | — | ✅ | |
| | `campaigns:manage` | ✅ | — | — | ✅ | — | — | Marketing sở hữu chiến dịch |
| | `campaigns:view-cost` | ✅ | ✅ (cơ sở mình) | — | ✅ | — | ✅ | Chi phí quảng cáo |
| **Cấu hình CRM** | `crm-config:view` | ✅ | ✅ | — | ✅ | — | — | |
| | `crm-config:manage` (quy trình, giai đoạn, lý do thua, chấm điểm, phân bổ, quy tắc tự động, phê duyệt) | ✅ | — | — | — | — | — | 🔴 **Chỉ Quản trị viên hệ thống.** Mọi thay đổi **bắt buộc có lý do + audit** |
| **Danh mục nguồn** | `crm-config:manage` | ✅ | — | — | — | — | — | |
| **Báo cáo CRM** | `crm-reports:view-center` | ✅ | ✅ | — | ✅ | — | ✅ | Số liệu cơ sở mình |
| | `crm-reports:view-all` | ✅ | — | — | ✅ | — | ✅ | Toàn hệ thống, **theo module** |

#### D.4.3 Cách ly dữ liệu đa cơ sở — ai xem được gì

| Đối tượng | SUPER_ADMIN | Vai trò cấp HO (theo chức năng) | CENTER_MANAGER (CS của mình) | SALES_CSM (CS của mình) | Cơ sở **nhượng quyền** |
|---|---|---|---|---|---|
| **Lead** | Toàn bộ | HO Kinh doanh: **xem** phạm vi được giao, **không sửa** | Toàn bộ lead cơ sở mình | Lead được giao + lead "dùng chung" cùng cơ sở | ⚠️ Chỉ cơ sở mình. **HO chỉ được xem số liệu tổng hợp, KHÔNG xem danh sách số điện thoại** |
| **Số điện thoại / thông tin cá nhân** | Toàn bộ (có audit) | Theo `leads:view-pii` | ✅ cơ sở mình | ✅ lead của mình | ⚠️ **Không chia sẻ ra ngoài pháp nhân** |
| **Nhu cầu học** | Toàn bộ | Xem tổng hợp | Toàn bộ cơ sở mình | Nhu cầu mình phụ trách | Chỉ cơ sở mình |
| **Báo giá** | Toàn bộ | Xem tổng hợp | Toàn bộ cơ sở mình | Báo giá mình lập | Chỉ cơ sở mình |
| **Cuộc gọi (bản ghi)** | Toàn bộ (có audit) | ❌ **Không** — trừ khi có nhu cầu nghiệp vụ rõ và được cấp quyền riêng | Toàn bộ cơ sở mình | Cuộc gọi của mình | Chỉ cơ sở mình |
| **Tệp ghi âm** | ✅ (audit từng lượt) | ❌ | ✅ cơ sở mình (audit) | ❌ mặc định | ⚠️ **Chỉ trong pháp nhân của mình** — HO không nghe được |
| **Chiến dịch** | Toàn bộ | HO Marketing: toàn bộ | Chiến dịch áp dụng cho cơ sở mình | Xem tên chiến dịch | Chiến dịch của mình + chiến dịch thương hiệu dùng chung |
| **Chi phí quảng cáo** | Toàn bộ | HO Marketing / Kế toán: toàn bộ | **Chỉ chi phí thuộc cơ sở mình** (vá ĐG-09) | ❌ | Chỉ chi phí mình chi |
| **Báo cáo doanh số** | Toàn bộ | HO Kế toán: toàn bộ | Cơ sở mình | Của mình | Cơ sở mình. **HO chỉ xem phần liên quan phí nhượng quyền** |
| **Cấu hình quy trình bán hàng** | ✅ sửa | ❌ | ❌ xem | ❌ | ⚠️ **Câu hỏi mở** — bên nhận quyền có được tự sửa quy trình không (xem §G câu Q7) |

#### D.4.4 Bảy ràng buộc bắt buộc cho cơ sở nhượng quyền

Nguồn: `docs/taicautruc/02-prd-franchise-platform.md:341-347` (R-DP-01 … R-DP-07). PRD nội bộ tự đánh giá: *"dữ liệu tài chính và dữ liệu cá nhân trẻ em của hai pháp nhân đang nằm chung một không gian, **cách nhau đúng một bộ lọc `centerId`**"* (`:69`).

| Mã | Ràng buộc | Ảnh hưởng tới CRM mới |
|---|---|---|
| **R-DP-01** | **Chốt vai trò pháp lý giữa hai pháp nhân** — mỗi bên là Bên Kiểm soát riêng, hay HO kiểm soát còn bên nhận là Bên Xử lý. *"Đây là câu gốc"*, mọi yêu cầu khác treo theo | Quyết định **HO có được xem lead/cuộc gọi của cơ sở nhượng quyền không**. Khuyến nghị `[SUY LUẬN]`: **mỗi bên là Bên Kiểm soát riêng** — rủi ro cho HO thấp nhất |
| **R-DP-02** | Cần vai trò **"người phụ trách dữ liệu" theo từng đơn vị**; hiện chỉ Quản trị viên hệ thống của HO xử lý được yêu cầu xoá/ẩn danh | 🔴 Đụng thẳng RBAC v2 — **hoãn tới sau khi lật cờ** |
| **R-DP-03** | **Thời hạn lưu khai theo từng đơn vị**; hiện là một biến môi trường duy nhất toàn hệ thống (`lib/compliance/retention.ts:11`) | Áp thẳng cho **hạn lưu tệp ghi âm** — mỗi pháp nhân có thể có chính sách khác |
| **R-DP-04** | Thông báo quyền riêng tư phải nêu **đúng pháp nhân** của cơ sở học viên đang theo học | Câu thông báo ghi âm đầu cuộc gọi phải nêu đúng tên pháp nhân |
| **R-DP-05** | `StudentConsent` phải ghi **phạm vi bên được dùng** (chỉ cơ sở / cả hệ thống thương hiệu) | Áp cho đồng ý marketing và đồng ý ghi âm |
| **R-DP-06** | Tệp trên kho R2 phải nằm dưới **tiền tố theo đơn vị**; hiện chia theo **loại tệp** ⇒ cắt hợp đồng thì **không xoá cũng không bàn giao được** | 🔴 **Nếu tải tệp ghi âm về R2, bắt buộc chia theo đơn vị ngay từ đầu.** Sửa sau rất đắt |
| **R-DP-07** | Mọi **kết xuất** chứa dữ liệu cá nhân phải giới hạn theo phạm vi + ghi nhật ký + có dấu nhận diện người tải | Áp cho xuất danh sách lead và xuất báo cáo cuộc gọi |

### D.5 Màn hình và chức năng cần có

> Mô tả **chức năng**, không vẽ giao diện. Cột "Trạng thái": **CÓ** = đã tồn tại, dùng tiếp · **SỬA** = đã có, cần bổ sung · **MỚI** = phải xây.

#### D.5.1 Nhóm tác nghiệp hằng ngày

| # | Màn hình | Chức năng chính | Trạng thái |
|---|---|---|---|
| M-01 | **Danh sách lead** | Bảng + Kanban, lọc theo trạng thái/cơ sở/người phụ trách/nguồn/chiến dịch/**điểm**/khoảng ngày; che thông tin cá nhân theo quyền | **SỬA** — thêm lọc theo điểm, chiến dịch, nguồn chuẩn |
| M-02 | **Chi tiết lead** | Thông tin phụ huynh, **danh sách người liên hệ**, danh sách con, **danh sách Nhu cầu học**, dòng thời gian hợp nhất, nút **Gọi**, nút chuyển, nút chia sẻ | **SỬA** — thêm khối người liên hệ, khối nhu cầu học, nút gọi |
| M-03 | **Bảng Kanban Nhu cầu học** | Cột = giai đoạn **đọc từ cấu hình**; kéo thả đổi giai đoạn (chặn theo QT-18); hiện giá trị dự kiến và ngày kỳ vọng trên thẻ; **cảnh báo thẻ quá hạn** | **MỚI** |
| M-04 | **Chi tiết Nhu cầu học** | Giai đoạn hiện tại + lịch sử giai đoạn, giá trị, ngày kỳ vọng, học viên gắn kèm, báo giá, đơn hàng, dòng thời gian, nút đóng (bắt lý do) | **MỚI** |
| M-05 | **Lập báo giá** | Chọn khoá/gói/sản phẩm, số buổi, giá gốc, ưu đãi (**có kiểm ngưỡng duyệt**), tổng, phương án trả, hạn hiệu lực; in / gửi email / gửi ZNS; **chuyển thành đơn hàng** | **MỚI** |
| M-06 | **Hàng chờ duyệt** | Danh sách báo giá/đơn/kế hoạch trả góp đang chờ; duyệt/từ chối **bắt buộc lý do**; xem chuỗi cấp duyệt | **MỚI** (gộp cả duyệt trả góp đang có) |
| M-07 | **Việc của tôi** | Việc cần làm đến hạn, lead vi phạm SLA, **cuộc gọi cần gọi lại**, nhu cầu quá hạn giai đoạn | **SỬA** — mở rộng cơ chế "việc cần làm" đã có |
| M-08 | **Hồ sơ gia đình 360°** | Một màn hình duy nhất: lead gốc → người liên hệ → các con → nhu cầu học → đơn hàng → khoản thu → học viên đang học → yêu cầu của phụ huynh → **toàn bộ dòng thời gian hợp nhất** (hoạt động + Messenger + tin nhắn + cuộc gọi) | **MỚI** — vá ĐG-11 |
| M-09 | **Hộp thư Messenger** | Đọc và **trả lời thật** (vá ĐG-14); gán hội thoại vào lead; "Thêm vào CRM" | **SỬA** |
| M-10 | **Cuộc gọi chưa gán** | Danh sách cuộc gọi không đối khớp được; gán tay vào lead/học viên hoặc **tạo lead mới từ cuộc gọi** | **MỚI** |
| M-11 | **Nhật ký cuộc gọi** | Lọc theo cơ sở/người/hướng/kết quả/khoảng ngày; nghe lại (kiểm quyền, ghi audit); xuất (đóng dấu + audit) | **MỚI** |
| M-12 | **Gộp bản ghi trùng** | Danh sách nghi trùng; so sánh cạnh nhau; chọn bản giữ; gộp lịch sử; ghi vết | **MỚI** — vá ĐG-13 |
| M-13 | **Lead chưa phân** | Hàng chờ lead không quy tắc nào khớp; phân tay | **MỚI** — hệ quả QT-23 |
| M-14 | **Bàn giao lead hàng loạt** | Khi Sale nghỉ việc/nghỉ phép | **CÓ** — `/admin/ban-giao-lead` |
| M-15 | **Xử lý xung đột hồ sơ khi chuyển đổi** | | **CÓ** — `/admin/convert-conflicts` |

#### D.5.2 Nhóm cấu hình (chỉ Quản trị viên hệ thống)

| # | Màn hình | Chức năng chính | Trạng thái |
|---|---|---|---|
| M-20 | **Quy trình bán hàng** | Tạo/sửa quy trình theo loại nhu cầu; thêm/ẩn/khôi phục giai đoạn; kéo thả; đặt tỷ lệ thành công, số ngày kỳ vọng, **ánh xạ sang trạng thái hệ thống**, điều kiện rời giai đoạn | **MỚI** — hạng mục cốt lõi |
| M-21 | **Danh mục lý do thua** | Thêm/sửa/ẩn; đánh dấu lý do cần ghi chú bắt buộc | **MỚI** |
| M-22 | **Danh mục nguồn lead** | Thêm/sửa/ẩn; gán nhóm; đánh dấu nguồn có tính chi phí | **MỚI** |
| M-23 | **Quy tắc chấm điểm** | Danh sách điều kiện + điểm; ngưỡng Nóng/Ấm/Lạnh; bật/tắt; **xem thử trên tập lead mẫu** | **MỚI** |
| M-24 | **Quy tắc phân bổ** | Điều kiện + kết quả + thứ tự ưu tiên; người nhận dự phòng; bật/tắt | **SỬA** — mở rộng từ `/admin/leads/cau-hinh-chia` |
| M-25 | **Quy tắc tự động (kịch bản chăm sóc)** | Sự kiện kích hoạt + điều kiện + danh sách hành động + thứ tự; **giới hạn 10/đối tượng**; **phải tắt mới sửa**; nhật ký chạy | **MỚI** |
| M-26 | **Quy tắc phê duyệt** | Điều kiện kích hoạt; chuỗi cấp duyệt theo đơn vị tổ chức; thời hạn; hành vi khi quá hạn | **MỚI** |
| M-27 | **Chiến dịch tuyển sinh** | Tạo/sửa; gán đơn vị áp dụng; ngân sách; mục tiêu; danh sách `utmCampaign` đối chiếu; **bảng kết quả tính tự động** | **MỚI** |
| M-28 | **Chỉ tiêu doanh số** | Giao theo đơn vị tổ chức → phòng ban → cá nhân; theo tuần/tháng/quý/năm; nhập/xuất hàng loạt; theo dõi tiến độ | **SỬA** — mở rộng `RevenueTarget` |
| M-29 | **Tích hợp** | Thêm khối **Tổng đài**: bật/tắt, trạng thái kết nối, 30 log gần nhất, nút chạy thử | **SỬA** — `/admin/tich-hop`. ⚠️ 3 action hiện tại **không ghi audit** — phải vá cùng lúc |
| M-30 | **Máy lẻ và đầu số** | Ánh xạ máy lẻ ↔ nhân viên ↔ cơ sở; đầu số hiển thị theo cơ sở; đồng bộ từ nhà cung cấp | **MỚI** |
| M-31 | **Danh sách không gọi** | Thêm/xoá số; nguồn; lý do; tra cứu nhanh | **MỚI** |
| M-32 | **Chạy lại webhook** | Đã có cho webhook lead | **CÓ** — cần **mở rộng cho webhook cuộc gọi** |
| M-33 | **Chạy lại sự kiện miền thất bại** | Danh sách sự kiện `FAILED`, chạy lại, xem lỗi | **MỚI** — vá ĐG-20, điều kiện tiên quyết của M-25 |

### D.6 Báo cáo và chỉ số

#### D.6.1 Nguyên tắc

| # | Nguyên tắc |
|---|---|
| 1 | **Mọi báo cáo đều bị cách ly theo cơ sở** trước khi tổng hợp. Người cấp cơ sở chỉ thấy số của cơ sở mình. |
| 2 | **Chi phí và doanh thu phải cùng phạm vi.** Vá ĐG-09 là điều kiện tiên quyết — hiện chi phí/lead của một cơ sở đang chia trên tổng chi phí toàn hệ thống. |
| 3 | **Phễu SR.QD.217 tiếp tục là báo cáo chính thức.** Báo cáo theo giai đoạn bán hàng là lớp bổ sung, không thay thế. |
| 4 | **Phân quyền xem theo từng báo cáo** (theo mô hình MISA), không chỉ theo màn hình. |
| 5 | **Mọi lần xuất dữ liệu chứa thông tin cá nhân**: đóng dấu nhận diện người tải + ghi audit (R-DP-07). |

#### D.6.2 Bộ báo cáo đề xuất

| # | Báo cáo | Nội dung | Ai xem | Trạng thái |
|---|---|---|---|---|
| BC-01 | **Phễu SR.QD.217** | L1 (hội thoại) → L2 (đủ điều kiện) → L3 (chốt), theo cơ sở/kỳ/nguồn | BGĐ, Marketing, QL cơ sở | **CÓ** — cần vá chi phí |
| BC-02 | **Phễu theo giai đoạn bán hàng** | Số nhu cầu và giá trị ở từng giai đoạn; **tỷ lệ chuyển giai đoạn**; thời gian trung bình ở mỗi giai đoạn | BGĐ, QL cơ sở | **MỚI** |
| BC-03 | **Dự báo doanh số** | Tổng (giá trị dự kiến × tỷ lệ thành công) của nhu cầu đang mở, theo kỳ và cơ sở; so với chỉ tiêu | BGĐ | **MỚI** |
| BC-04 | **Phân tích lý do thua** | Đếm và tỷ trọng theo lý do, theo cơ sở/nguồn/khoá; xu hướng theo thời gian | BGĐ, QL cơ sở, Marketing | **MỚI** |
| BC-05 | **Hiệu quả chiến dịch** | Theo chiến dịch: chi phí, số lead, số đủ điều kiện, số nhu cầu, số thắng, doanh thu, **chi phí/lead**, **chi phí/ghi danh**, tỷ suất | Marketing, BGĐ | **MỚI** |
| BC-06 | **Hiệu quả nguồn lead** | Như BC-05 nhưng cắt theo nguồn chuẩn | Marketing, BGĐ | **MỚI** |
| BC-07 | **Tuân thủ SLA** | Số vi phạm theo từng mức SLA, theo người và cơ sở; thời gian trung bình từng chặng (đủ điều kiện → bàn giao → phân công → liên hệ đầu) | QL cơ sở, BGĐ | **SỬA** |
| BC-08 | **Năng suất và chất lượng gọi** | Theo Sale: số cuộc gọi, **tỷ lệ nghe máy**, tổng thời lượng, thời gian tới cuộc gọi đầu tiên, **tỷ lệ chốt trên cuộc gọi có người nghe** | QL cơ sở, BGĐ | **MỚI** |
| BC-09 | **Cuộc gọi nhỡ và tồn đọng** | Cuộc gọi nhỡ chưa gọi lại, cuộc gọi chưa gán chủ, theo cơ sở | QL cơ sở | **MỚI** |
| BC-10 | **Chi phí viễn thông** | Cước theo cơ sở, theo Sale, theo tháng | Kế toán, BGĐ | **MỚI** |
| BC-11 | **Tiến độ chỉ tiêu** | Chỉ tiêu vs thực hiện, theo đơn vị tổ chức → cá nhân, theo tuần/tháng/quý | BGĐ, QL cơ sở | **SỬA** |
| BC-12 | **Bảng kê hoa hồng** | 4 tầng, theo kỳ, DRAFT→APPROVED | Kế toán, BGĐ | **CÓ** |
| BC-13 | **Tái tục** | Số học viên sắp hết khoá, số nhu cầu "Học tiếp" đã tạo, tỷ lệ tái tục, doanh thu tái tục | BGĐ, Đào tạo, QL cơ sở | **MỚI** |
| BC-14 | **Chất lượng dữ liệu CRM** | Lead thiếu cơ sở, lead thiếu nguồn, nghi trùng chưa xử lý, nhu cầu quá hạn giai đoạn, cuộc gọi chưa gán | QL cơ sở, Quản trị viên | **MỚI** |
| BC-15 | **Nhật ký truy cập dữ liệu nhạy cảm** | Ai nghe ghi âm nào, ai xuất danh sách nào, khi nào | Quản trị viên, BGĐ | **MỚI** — nghĩa vụ tuân thủ |

#### D.6.3 Bộ chỉ số theo dõi thường xuyên

| Chỉ số | Định nghĩa | Ngưỡng cảnh báo đề xuất |
|---|---|---|
| Tỷ lệ L1→L2 | Lead đủ điều kiện / hội thoại | Giảm > 20% so với trung bình 4 tuần |
| Tỷ lệ L2→L3 | Nhu cầu thắng / lead đủ điều kiện | Giảm > 20% |
| Chi phí/ghi danh theo cơ sở | Chi phí quảng cáo cơ sở / số ghi danh cơ sở | Vượt 130% ngưỡng do BGĐ đặt |
| Thời gian tới cuộc gọi đầu tiên (trung vị) | Từ `assignedAt` tới cuộc gọi có người nghe đầu tiên | > 3 giờ (khớp SLA-3) |
| Tỷ lệ nghe máy | Cuộc có người nghe / cuộc gọi ra | < 40% |
| Tỷ lệ cuộc gọi đi qua tổng đài | Cuộc gọi trong hệ thống / tổng ước lượng | < 80% ⇒ Sale đang dùng SIM riêng |
| Tồn đọng "cuộc gọi chưa gán" | Số bản ghi chưa gán quá 24 giờ | > 10 |
| Tồn đọng lead chưa phân | Số lead trong hàng chờ quá 2 giờ | > 5 |
| Nhu cầu quá hạn ngày kỳ vọng | Số nhu cầu đang mở quá ngày kỳ vọng | > 20% tổng nhu cầu mở |
| Sự kiện miền thất bại | Đếm bản ghi trạng thái `FAILED` | > 0 (phải bằng 0) |

---

## 7. PHẦN E — RÀNG BUỘC VÀ RỦI RO

### E.1 Pháp lý

#### E.1.1 Căn cứ pháp lý đã đổi — đề bài đang dùng văn bản hết hiệu lực

| Sự kiện | Nội dung | Nguồn |
|---|---|---|
| 26/06/2025 | Quốc hội thông qua **Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15** | `[WEB]` https://bocongan.gov.vn/chinh-sach-phap-luat/bai-viet/luat-bao-ve-du-lieu-ca-nhan-chinh-thuc-co-hieu-luc-thi-hanh-tu-ngay-01-01-2026-1767186124 |
| 31/12/2025 | Chính phủ ban hành **Nghị định 356/2025/NĐ-CP** quy định chi tiết | `[WEB]` https://vanban.chinhphu.vn/?pageid=27160&docid=216387 |
| **01/01/2026** | Luật 91/2025 + NĐ 356/2025 **có hiệu lực**; **NĐ 356/2025 THAY THẾ NĐ 13/2023** | `[WEB]` EY, Frasers |

> 🔴 **Hệ quả trực tiếp cho repo:** trang chính sách bảo mật công khai vẫn ghi *"Theo Nghị định 13/2023/NĐ-CP"* (`app/(public)/chinh-sach-bao-mat/page.tsx:7` mô tả SEO và `:23` phụ đề). Comment nghiệp vụ trong mã cũng vẫn ghi "NĐ13" (`lib/compliance/retention.ts:5`; `app/api/cron/retention-scan/route.ts:7`). Đây là **sai căn cứ pháp lý hiển thị công khai**, sửa được ngay, **không đụng RBAC**.
> **Chuyển tiếp:** sự đồng ý thu thập hợp lệ theo NĐ 13 **trước 01/01/2026 vẫn còn giá trị** `[WEB]` EY. Nhưng đồng ý **chưa từng thu** thì không có gì để chuyển tiếp — đây chính là vấn đề của ĐG-02.

#### E.1.2 Ba rủi ro pháp lý cao nhất của module CRM

| # | Rủi ro | Mức | Diễn giải | Biện pháp |
|---|---|---|---|---|
| **PL-1** | **Bằng chứng đồng ý sai** | 🔴 **Cao nhất** | 3 đường vào ghi đè cứng `consentMarketing = true`; cột này được hiển thị cho Sale và **xuất ra file** như bằng chứng. Chuẩn mới đòi đồng ý **rõ ràng, kiểm chứng được, cấm ô tick sẵn** `[WEB]` EY | **Sửa trước mọi tính năng CRM mới.** Rẻ, không đụng RBAC. Xem QT-31 |
| **PL-2** | **Ghi âm không thông báo** | 🔴 Cao | Luật 91/2025 cấm ghi âm cuộc gọi khi không có sự đồng ý; tổng đài CSKH tự động ghi âm **phải thông báo rõ ràng trước khi ghi** `[WEB]` thuvienphapluat.vn. NĐ 15/2020 điểm q khoản 3 Điều 102: phạt tối đa **10 triệu (cá nhân) / 20 triệu (tổ chức)** | Lời thông báo tự động đầu mỗi cuộc gọi; lưu cờ đã thông báo; khách từ chối vẫn gọi được, chỉ tắt ghi âm. Xem QT-36 |
| **PL-3** | **Gọi/nhắn quảng cáo vào Danh sách không quảng cáo** | 🔴 Cao | NĐ 91/2020 cấm gọi/nhắn quảng cáo tới số trong Danh sách không quảng cáo (https://khongquangcao.ais.gov.vn). Phạt **80–100 triệu đồng** `[WEB]` vneconomy.vn | **Bắt Sale phân loại mục đích cuộc gọi trước khi gọi** (QT-33). Phân biệt rõ: gọi **chăm sóc/xử lý yêu cầu của chính khách** ≠ gọi **quảng cáo**; ràng buộc chỉ áp cho loại quảng cáo. ⚠️ `[CHƯA KIỂM CHỨNG]` có API tra cứu tự động hay không |

#### E.1.3 Các nghĩa vụ khác cần biết

| Hạng mục | Nội dung | Nguồn |
|---|---|---|
| **Thời hạn trả lời chủ thể dữ liệu** | Rút đồng ý/hạn chế xử lý: xác nhận 2 ngày làm việc, hoàn tất 15 ngày (+15). Truy cập/chỉnh sửa: 2 ngày, hoàn tất 10 ngày (+10). **Xoá dữ liệu: 2 ngày, hoàn tất 20 ngày (+20)** | `[WEB]` EY |
| **Hồ sơ đánh giá tác động xử lý dữ liệu cá nhân (DPIA)** | Lập ngay từ khi bắt đầu xử lý; nộp **Cục A05 – Bộ Công an**; Mẫu số 10 + bản sao hợp đồng xử lý dữ liệu với bên thứ ba; cập nhật định kỳ 6 tháng; yêu cầu mới: **sơ đồ luồng dữ liệu chi tiết theo từng vai trò** | `[WEB]` LuatVietnam, ThuVienPhapLuat, EY |
| **Bên thứ ba trở thành Bên Xử lý dữ liệu** | Nhà cung cấp tổng đài lưu số điện thoại + tệp ghi âm của phụ huynh ⇒ **phải có hợp đồng xử lý dữ liệu cá nhân**, và bản sao hợp đồng là **thành phần bắt buộc của hồ sơ DPIA** | `[WEB]` như trên |
| **Chuyển dữ liệu xuyên biên giới** | Nếu tệp ghi âm lưu ở máy chủ nước ngoài ⇒ phát sinh hồ sơ riêng; mức phạt vi phạm **5% doanh thu năm trước liền kề** (hoặc 3 tỷ nếu cao hơn) | `[WEB]` ThuVienPhapLuat, EY |
| **Dữ liệu trẻ em** | Đối tượng là học sinh lớp 1–8. Điều 19 Luật 91/2025: với trẻ **từ đủ 7 tuổi**, việc **công bố/tiết lộ** thông tin đời sống riêng tư phải có đồng ý **của cả trẻ và người đại diện**. `[SUY LUẬN]` Lưu tên/tuổi con trong CRM để tư vấn **không phải "công bố, tiết lộ"** ⇒ chưa kích hoạt đồng ý kép; nhưng **dùng tên/ảnh học viên cho truyền thông thì có** | `[WEB]` mps.gov.vn, plo.vn |
| **Chế tài chung** | Mua bán dữ liệu cá nhân: phạt tới **10 lần khoản thu**; vi phạm khác: tối đa **3 tỷ đồng** (tổ chức), cá nhân bằng 1/2 | `[WEB]` ThuVienPhapLuat |

#### E.1.4 Ba câu bắt buộc hỏi luật sư trước khi bật tính năng gọi

| # | Câu hỏi | Vì sao chặn |
|---|---|---|
| **LS-1** | **Sata Robo có được miễn trừ theo Điều 41 NĐ 356/2025 (doanh nghiệp nhỏ) không?** Ngoại lệ được nêu: **không miễn trừ** với đơn vị **xử lý dữ liệu nhạy cảm** hoặc **trên 100.000 chủ thể** `[WEB]` EY. Hệ thống đang xử lý dữ liệu vị trí nhân viên (nhạy cảm) ⇒ `[SUY LUẬN]` **nhiều khả năng KHÔNG được miễn trừ** | Quyết định **toàn bộ khối lượng tuân thủ** của cả hai module |
| **LS-2** | **DPIA là tiền kiểm hay hậu kiểm?** Hai nguồn uy tín mâu thuẫn: LuatVietnam/ThuVienPhapLuat nói "nộp trong 60 ngày kể từ ngày xử lý" (hậu kiểm); EY nói NĐ 356 chuyển sang **tiền kiểm** — A05 thẩm định 15 ngày, doanh nghiệp có 30 ngày chỉnh sửa | Nếu là **tiền kiểm**, mọi tính năng chạm dữ liệu nhạy cảm mới (ghi âm) phải **cộng thêm ~45 ngày** vào tiến độ |
| **LS-3** | **Giọng nói có phải "dữ liệu sinh trắc học" theo NĐ 356 không?** | Nếu **có**, tệp ghi âm trở thành **dữ liệu nhạy cảm** ⇒ cần đồng ý riêng + DPIA riêng ⇒ chi phí tuân thủ tăng đáng kể |

> ⚠️ **Toàn bộ số điều/khoản/điểm trong §E.1 lấy từ nguồn thứ cấp** (cổng Bộ Công an, EY, Frasers, LuatVietnam, MPS, báo chí). **Chưa đọc được bản gốc** Luật 91/2025 và NĐ 356/2025 (`thuvienphapluat.vn/van-ban/...` trả HTTP 403). Phải đối chiếu Công báo (https://congbao.chinhphu.vn) trước khi đưa vào tài liệu ký duyệt.

### E.2 Bảo mật và dữ liệu cá nhân — mức kỹ thuật

| # | Rủi ro | Mức | Biện pháp bắt buộc |
|---|---|---|---|
| **BM-1** | **Liên kết tệp ghi âm bị lộ** — liên kết do nhà cung cấp cấp, ai có cũng nghe được | Cao | Không bao giờ trả liên kết thô ra trình duyệt; đi qua endpoint có kiểm quyền, cấp liên kết hạn ngắn, ghi audit từng lượt nghe (QT-36) |
| **BM-2** | **Nghe lại ghi âm tràn lan** | Cao | Quyền `calls:listen-recording` tách riêng, **không mặc định cho Sale**. ⚠️ **Thiết kế bằng ALLOW, KHÔNG dùng DENY** — bật RBAC v2 sẽ **âm thầm vô hiệu hoá mọi DENY** (`CLAUDE.md`) |
| **BM-3** | **Rò cuộc gọi giữa các cơ sở** | Cao | Trường cơ sở bắt buộc + nằm trong danh sách model được cách ly + **kiểm thử CI** "CS1 không thấy cuộc gọi CS2" (QT-41) |
| **BM-4** | **Webhook giả mạo** — tài liệu OMICall **không mô tả cơ chế ký** | Cao | Hỏi nhà cung cấp (câu 2 §D.2.6). Nếu không có: URL bí mật + token + lọc IP + giới hạn tần suất |
| **BM-5** | **Xuất báo cáo kèm số điện thoại phụ huynh** | Trung bình | Đóng dấu nhận diện người tải + ghi audit (R-DP-07) |
| **BM-6** | **Token nhà cung cấp lưu dạng văn bản thuần** — token Zalo hiện lưu trong cột JSON `IntegrationConfig.settings` **không mã hoá ở tầng ứng dụng** (`lib/zalo/token.ts:48-54`; `prisma/schema.prisma:4747-4754`). Token tổng đài sẽ đi cùng chỗ | Trung bình | Đánh giá lại cách lưu bí mật trước khi thêm nhà cung cấp thứ ba. ⚠️ `[CHƯA KIỂM CHỨNG]` có mã hoá ở tầng hạ tầng Supabase hay không |
| **BM-7** | **Bật/tắt tích hợp không ghi audit** — 3 action ở `/admin/tich-hop/_actions.ts` chỉ làm mới trang, **không ghi vết** | Trung bình | Vá cùng lúc khi thêm khối Tổng đài (M-29) |
| **BM-8** | **Endpoint cron hàng đợi email chấp nhận phiên người dùng** — bất kỳ nhân viên nào có `emails:view` đều gọi được, ép gửi hàng đợi của **mọi cơ sở** (`app/api/cron/email-queue/route.ts:12-20`) | Trung bình | Vá trước khi dùng email cho chiến dịch marketing |
| **BM-9** | **Tệp trên kho R2 chia theo loại tệp, không theo đơn vị** (R-DP-06) | Cao (nhượng quyền) | Nếu tải tệp ghi âm về R2 ⇒ **chia theo đơn vị ngay từ đầu**. Sửa sau rất đắt |

### E.3 Cách ly đa cơ sở và nhượng quyền

| # | Ràng buộc | Diễn giải |
|---|---|---|
| **NQ-1** | **Câu hỏi gốc chưa chốt:** hai pháp nhân — ai là Bên Kiểm soát dữ liệu? (R-DP-01) | Mọi yêu cầu nhượng quyền khác **treo theo câu này**. Khuyến nghị `[SUY LUẬN]`: **mỗi bên là Bên Kiểm soát riêng** + một thoả thuận chia sẻ dữ liệu hẹp cho phần dùng chung (chương trình học, thương hiệu, **báo cáo tổng hợp đã ẩn danh**). Lý do: học viên ký với pháp nhân nào thì pháp nhân đó kiểm soát; tránh HO gánh trách nhiệm cho lỗi của đối tác ở tỉnh xa |
| **NQ-2** | **Cách ly hiện tại mỏng** — PRD nội bộ tự đánh giá: hai pháp nhân *"cách nhau đúng một bộ lọc `centerId`"* (`docs/taicautruc/02-prd-franchise-platform.md:69`) | Mọi bảng CRM mới phải làm đúng ngay từ đầu, không để nợ |
| **NQ-3** | **Cấm hardcode danh sách cơ sở** (QT-42) | Sắp mở cơ sở mới + cơ sở nhượng quyền tỉnh khác |
| **NQ-4** | **Đầu số hiển thị theo cơ sở** | CS1 gọi hiện số CS1, CS2 hiện số CS2, cơ sở nhượng quyền hiện số của họ. API danh sách đầu số của OMICall hỗ trợ việc này |
| **NQ-5** | **Tin tốt:** cả hai pháp nhân đều ở Việt Nam ⇒ **không phát sinh nghĩa vụ chuyển dữ liệu xuyên biên giới** `[SUY LUẬN]`. Nghĩa vụ này **chỉ phát sinh** nếu nhà cung cấp tổng đài đặt máy chủ ở nước ngoài | Đây là lý do câu hỏi số 10 với nhà cung cấp là bắt buộc |
| **NQ-6** | **15 cron + 4 webhook hiện chạy trên kết nối CSDL trần, không qua tầng cách ly, không có người thực hiện để ghi audit** (`docs/taicautruc/01-intended-vs-implemented.md:201`) | Quan trọng khi mở cơ sở nhượng quyền. Webhook cuộc gọi mới **không được lặp lại lỗi này** |

### E.4 Xung đột với cửa sổ shadow-compare RBAC và đợt siết bảo mật đang chạy

#### E.4.1 Trạng thái thực tế của cửa sổ shadow

| Sự kiện | Bằng chứng |
|---|---|
| ~~`RBAC_V2_ENABLED` **đang TẮT**~~ → **ĐÍNH CHÍNH 29/07/2026: cờ ĐÃ BẬT**, production enforce **v2 động**. Mặc định trong code vẫn OFF (`lib/flags.ts:8`) nên local/dev chạy v1 — khác prod | Vercel → Environment Variables → Production: `RBAC_V2_ENABLED="true"` (đọc bằng `vercel env pull --environment=production`, 29/07); `lib/auth/shadow-compare.ts:27` |
| Lệch giữa v1 và v2 được ghi vào bảng `RbacShadowDiff` (`action`, `userId`, `v1`, `v2`, `targetKey`) | `prisma/schema.prisma:548-559` |
| Menu **cố ý không ghi** shadow để không dìm tín hiệu | `lib/auth/menu-permissions.ts:14-16` |
| Có workflow "bấm đồng hồ" — xoá sạch bảng lệch để đếm lại | commit `5c652c9b`; `.github/workflows/truncate-shadow-diff.yml` |
| Điều kiện lật cờ: **3–5 ngày Việt Nam liên tiếp 0 lệch trên lưu lượng thật** | `docs/ke-hoach-go-live-2607/shadow-log.md:3` |
| **Quy tắc vàng:** mọi thay đổi làm đổi hành vi v2 ⇒ **xoá bảng lệch và đếm lại từ đầu** | `shadow-log.md:13-15` |
| 🔴 **TRẠNG THÁI ĐỒNG HỒ: CHƯA CHẠY** — *"🔴 **CHƯA CHẠY** — chặn bởi preflight P1 (3 nhân viên thiếu `UserOrgRole`)"*, **Ngày sạch liên tiếp = 0**, mốc bấm đồng hồ = *(chưa)* | `shadow-log.md:22-23` |
| **Điều kiện để BẤM được đồng hồ:** *"Đồng hồ chỉ được bấm khi **preflight coverage = 0** (mọi nhân viên đều có `UserOrgRole` ACTIVE)"* — thiếu dòng đó thì v2 từ chối sạch ⇒ lệch giả tràn bảng, và khi lật cờ sẽ **khoá tài khoản đó** | `shadow-log.md:9` |

> ⚠️ **Đọc hai dòng cuối trước khi lập lịch bất cứ việc nào ở §F.4.** Đồng hồ chưa bấm được ⇒ **chưa có ngày sạch nào để đếm** ⇒ mốc lật cờ **chưa xác định**. Việc chặn không phải việc kỹ thuật lớn — chỉ là **gán `UserOrgRole` cho 3 nhân viên** — nhưng **hiện chưa ai được giao và chưa có hạn**. Đã đưa thành **F0-10** ở §F.0.
> ⚠️ **Đây là việc chặn dùng CHUNG với module Chấm công** (`docs/ba-cham-cong-hien-trang-va-misa.md` §7.5): mọi hạng mục "chờ sau khi lật cờ" của **cả hai** module đều treo sau việc này.

#### E.4.2 Phân loại từng đề xuất trong tài liệu này

| Đề xuất | Đụng shadow? | Lý do |
|---|---|---|
| Thêm bảng Nhu cầu học / Báo giá / Chiến dịch / Cuộc gọi / các bảng cấu hình | ⚪ **Không** | Bảng mới, không sửa `can()`, không sửa `RolePermission`, không sửa `scopedDb` |
| Endpoint webhook trạng thái cuộc gọi | ⚪ **Không** | Máy gọi máy, xác thực bằng token nhà cung cấp, **không đi qua `can()`** |
| Ghi hoạt động/cuộc gọi từ webhook | ⚪ **Không** | Chạy dưới danh nghĩa hệ thống, không có phiên người dùng |
| Màn hình mới, báo cáo mới (dùng quyền `leads:*` sẵn có) | ⚪ **Không** | |
| Vá ĐG-01, ĐG-02, ĐG-07, ĐG-08, ĐG-09, ĐG-14 | ⚪ **Không** | Sửa logic nghiệp vụ, không sửa ma trận quyền |
| **Thêm khoá quyền `calls:*` / `opportunities:*` / `quotes:*` vào ma trận tĩnh v1 mà KHÔNG nạp `RolePermission` v2 tương ứng** | 🔴 **CÓ — nguy hiểm** | v1 = cho phép, v2 = từ chối ⇒ **đẻ hàng loạt bản ghi lệch giả**, làm bẩn số liệu quyết định lật cờ. Cảnh báo này đã có sẵn trong mã: `lib/auth/permissions.ts:300-302` |
| Thêm khoá quyền vào **cả v1 và v2 đồng thời, cùng một lần triển khai** | 🟡 **Ranh giới** | Không đẻ lệch nếu khớp tuyệt đối, nhưng **làm đổi tập action giữa chừng** ⇒ reset ý nghĩa của đồng hồ. **Cần người theo dõi shadow xác nhận trước** |
| **Thêm bảng Cuộc gọi vào danh sách model được cách ly** | 🟡 **Ranh giới** | `scopedDb` là tầng cách ly, không phải tầng quyền — nhưng nó đổi hành vi đọc. Đã có tiền lệ: đổi `scopedDb` theo vai ⇒ reset đồng hồ (`lib/auth/active-role.ts:11`) |
| **Mô hình chia sẻ bản ghi lẻ kiểu MISA** | 🔴 **CÓ — hoãn** | Đụng trực tiếp logic phạm vi dữ liệu |
| **Vai trò/quyền dữ liệu 4 lớp kiểu MISA** | 🔴 **CÓ — không làm** | Trùng lặp với RBAC v2 đang chờ bật. **Không làm song song** |
| **Vai trò "người phụ trách dữ liệu theo đơn vị" (R-DP-02)** | 🔴 **CÓ — hoãn** | Thêm vai trò = đụng thẳng v2 |
| Sửa `isHoLevel` hoặc logic phạm vi hiện có | 🔴 **CẤM** | Audit nội bộ xếp đây là vùng nặng nhất |

#### E.4.3 Khuyến nghị vận hành

| # | Khuyến nghị |
|---|---|
| 1 | **Giai đoạn 1 KHÔNG thêm khoá quyền mới.** Mượn `leads:edit` cho hành vi gọi, `leads:view-all`/`leads:view-own` cho việc xem, `leads:view-pii` cho việc thấy số điện thoại. |
| 2 | Nếu **buộc phải** thêm trong cửa sổ shadow: thêm **đồng thời vào cả v1 và v2** trong **cùng một lần triển khai**, và **báo trước cho người theo dõi shadow**. |
| 3 | **Thiết kế quyền nghe ghi âm bằng ALLOW, tuyệt đối không dùng DENY.** Bật RBAC v2 sẽ **âm thầm vô hiệu hoá mọi `UserPermissionGrant` kiểu DENY** (v1 tôn trọng DENY, v2 chỉ lọc ALLOW). |
| 4 | Ghi rõ trong báo cáo shadow rằng các action `calls:*` là **mới**, để người đọc không nhầm là lỗi hồi quy. |
| 5 | **Ưu tiên xếp toàn bộ việc chạm quyền vào sau khi lật cờ RBAC v2.** Các việc còn lại (chiếm >80% khối lượng) đều làm được ngay. |

### E.5 Phụ thuộc nhà cung cấp

| # | Rủi ro | Biện pháp |
|---|---|---|
| **NCC-1** | **Khoá chân một nhà cung cấp thoại** | Thiết kế bảng Cuộc gọi **trung lập nhà cung cấp** (có trường tên nhà cung cấp); phần gọi API tách thành **một lớp bọc riêng**. Đổi OMICall → Stringee không phải viết lại nghiệp vụ |
| **NCC-2** | **SDK web chỉ cài qua CDN, chưa có gói npm** ("comming soon", không có mốc thời gian) | **Giai đoạn 1 không nhúng softphone.** Chỉ dùng bấm-gọi qua API; Sale nghe bằng app trên điện thoại hoặc IP phone |
| **NCC-3** | **SDK ghi "React 18+", dự án chạy React 19** | `[CHƯA KIỂM CHỨNG]` khả năng tương thích. **Phải làm thử nghiệm nhỏ trước khi cam kết** softphone |
| **NCC-4** | **Tài liệu ghi địa chỉ có hậu tố `-stg`** (môi trường thử nghiệm) | Hỏi URL sản xuất trước khi triển khai |
| **NCC-5** | **API v2 của nhà cung cấp khai tử 01/04/2026** | Dùng thẳng v3 ngay từ đầu |
| **NCC-6** | **Không rõ giới hạn tần suất API** | Hỏi trước; thiết kế có giới hạn tần suất phía Sata Robo để tự bảo vệ |
| **NCC-7** | **Vercel có giới hạn số cron; hiện đã có 15 cron** | ⚠️ `[CHƯA KIỂM CHỨNG]` gói hiện tại còn dư chỗ hay không. Cron đối soát cuộc gọi (CG-05) là cron thứ 16 |
| **NCC-8** | **MISA AMIS: chưa từng chạy thật.** Nếu sau này nối thật, chế độ live hiện trả `MISA_LIVE_NOT_IMPLEMENTED` | Ngoài phạm vi tài liệu này; ghi nhận để không ai tưởng "MISA đã tích hợp xong" |

### E.6 Chi phí

| Khoản | Ước tính | Độ tin cậy |
|---|---|---|
| Tổng đài — thuê bao phần mềm (6 tài khoản, gói Call Center) | **1.200.000 đ/tháng** = 14,4 triệu/năm | `[WEB]` giá công khai + `[SUY LUẬN]` số tài khoản |
| Tổng đài — phí khởi tạo (một lần, dưới 10 người dùng) | **800.000 – 1.000.000 đ** | `[WEB]` |
| Cước viễn thông gọi ra | **Chưa có số liệu** | ⚠️ Không đo được vì **chưa biết sản lượng cuộc gọi hiện tại** |
| Phí thuê đầu số | **Chưa có số liệu.** Đầu số 1800: khởi tạo ~1.800.000đ + thuê bao từ 400.000đ/tháng. `[SUY LUẬN]` đầu số cố định 0236 rẻ hơn nhiều | `[WEB]` + `[SUY LUẬN]` |
| **Tham chiếu — nếu mua MISA AMIS CRM** | Enterprise 10 người dùng = **14.400.000 đ/năm**, cam kết tối thiểu 12 tháng | `[WEB]` |
| Chi phí xây trong nhà | **Chưa ước lượng** — đội kỹ thuật phải ước lượng theo §F | — |
| Chi phí tuân thủ (DPIA, tư vấn luật sư, hợp đồng xử lý dữ liệu) | **Chưa ước lượng** | — |

> ⚠️ **Không so sánh được "tự xây vs mua MISA" nếu chưa có hai số liệu:** (a) ước lượng công sức của đội kỹ thuật; (b) sản lượng cuộc gọi thực tế. **Đề nghị đo sản lượng cuộc gọi trong 2 tuần trước khi lấy báo giá.**

---

## 8. PHẦN F — LỘ TRÌNH ĐỀ XUẤT

> ⚠️ **Không gán các giai đoạn dưới đây vào "Phase A0–R5" đã đóng.** Khung lập lịch hiện hành là GĐ0→GĐ4 + ticket K\*/L\*/V\* + lane #NN (`docs/ke-hoach-go-live-2607/`). Các mốc thời gian là **ước lượng thô của BA**; đội kỹ thuật phải ước lượng lại.
> **Nguyên tắc xếp thứ tự:** giá trị cao / công sức thấp trước · vá dữ liệu sai trước khi xây tính năng mới · mọi việc chạm quyền xếp sau cùng.

### F.0 — VÁ NỀN (ước lượng 2 tuần) · *Điều kiện tiên quyết của mọi thứ sau*

| Mục tiêu | Hệ thống ngừng tạo dữ liệu sai và ngừng báo cáo sai |
|---|---|

| # | Việc chính | Điểm đứt gãy vá | Đụng shadow |
|---|---|---|---|
| F0-1 | **Bỏ ghi đè cứng "đã đồng ý nhận marketing"** ở 3 vị trí; ghi đúng hành vi thật; lưu thời điểm + đường vào | ĐG-02 · PL-1 | ⚪ |
| F0-2 | **Hợp nhất một đường phân bổ duy nhất** — webhook dùng chung hàm với form/nhập tay; **bắt buộc gán cơ sở** | ĐG-01 | ⚪ |
| F0-3 | **Vá chỉ số chi phí** — lọc chi phí quảng cáo theo cơ sở khi tính chi phí/lead và chi phí/ghi danh | ĐG-09 | ⚪ |
| F0-4 | **Vá SLA-0 và SLA-4** — truyền đủ tham số, dùng đúng trường, loại lead đã mất | ĐG-07, ĐG-08 | ⚪ |
| F0-5 | **Siết chuyển trạng thái** — không cho đặt tay "Đã ghi danh" khi chưa có học viên/đăng ký/khoản thu | ĐG-03 | ⚪ |
| F0-6 | **Sửa căn cứ pháp lý** trên trang chính sách bảo mật và comment nội bộ (NĐ 13/2023 → Luật 91/2025 + NĐ 356/2025) | §E.1.1 | ⚪ |
| F0-7 | **Hỏi luật sư 3 câu LS-1, LS-2, LS-3** (việc giấy tờ, chạy song song) | §E.1.4 | ⚪ |
| F0-8 | **Đo sản lượng cuộc gọi thực tế trong 2 tuần** (Sale tự khai) — đầu vào bắt buộc để lấy báo giá | §E.6 | ⚪ |
| F0-9 | **Kiểm chứng bẫy thông báo nhân viên** (ĐG-21) bằng một kiểm thử nhỏ | ĐG-21 | ⚪ |
| **F0-10** | 🔴 **ĐÓNG KIỂM TRA TIỀN ĐỀ P1 — gán `UserOrgRole` cho 3 nhân viên còn thiếu**, để **bấm được đồng hồ shadow**. Hiện đồng hồ **CHƯA CHẠY**, số ngày sạch = 0 (`shadow-log.md:22-23`), điều kiện bấm là *"preflight coverage = 0"* (`shadow-log.md:9`). **Đây là việc CHẶN toàn bộ §F.4 của tài liệu này VÀ toàn bộ phần "sau khi lật cờ" của module Chấm công.** ⚠️ **Người phụ trách: `[CHƯA XÁC ĐỊNH — cần Ban giao]` · Hạn: `[CHƯA XÁC ĐỊNH — đề nghị đặt trước mọi mốc của F.1]`** | §E.4.1 | ⚪ (bản thân việc gán là **thay đổi hành vi v2** ⇒ phải làm **trước** khi bấm đồng hồ, không làm giữa chừng) |
| **F0-11** | **Xác minh Z-1 với Zalo / đại lý Zalo** — ba câu: (a) cuộc gọi ZCC **có đổ chuông vào SIM** của khách không, hay chỉ trong ứng dụng Zalo? (b) có **webhook trạng thái cuộc gọi** không? (c) có **tệp ghi âm** lấy về được không? Kết luận loại Zalo ở §D.2.5(a) đang dựa trên **`[SUY LUẬN]` từ 3 nguồn thứ cấp**, chính PL.1 C4 tự nhận *"phải xác nhận lại với Zalo trước khi Ban ra quyết định"*. ⚠️ **Người phụ trách: `[CHƯA XÁC ĐỊNH]` · Hạn: phải xong TRƯỚC khi Ban giám đốc trả lời Q2** | §D.2.5(a) · PL.1 C4 | ⚪ |

**Điều kiện hoàn thành:** không còn đường vào nào ghi đè consent · mọi lead mới đều có cơ sở · chi phí/lead của CS1 khác CS2 · cảnh báo SLA-0 xuất hiện trong nhật ký cron · có văn bản trả lời của luật sư cho 3 câu · có con số sản lượng cuộc gọi · **kiểm tra tiền đề P1 = 0 dòng và đồng hồ shadow đã bấm** · **có văn bản trả lời của Zalo/đại lý cho 3 câu Z-1**.
**Phụ thuộc:** không có. **Làm được ngay** — và **F0-10 phải làm sớm nhất** vì mọi thứ ở §F.4 xếp sau nó.

### F.1 — NỀN CRM CẤU HÌNH ĐƯỢC (ước lượng 4–6 tuần)

| Mục tiêu | Kinh doanh tự sửa được quy trình bán hàng; có tầng Cơ hội để đo và dự báo |
|---|---|

| # | Việc chính | Đối tượng | Đụng shadow |
|---|---|---|---|
| F1-1 | **Quy trình + Giai đoạn bán hàng cấu hình được**, có tỷ lệ thành công, ánh xạ sang trạng thái hệ thống, ẩn/khôi phục | (6)(7) | ⚪ |
| F1-2 | **Nhu cầu học** (Cơ hội) + Kanban + chi tiết + đóng bắt lý do | (4) | ⚪ |
| F1-3 | **Danh mục lý do thua** + **Danh mục nguồn lead** | (8)(14) | ⚪ |
| F1-4 | **Người liên hệ của gia đình** + đồng ý marketing gắn vào người | (5) | ⚪ |
| F1-5 | **Lead đóng băng sau chuyển đổi + con trỏ hai chiều** | QT-07, QT-08 | ⚪ |
| F1-6 | **Ba quy trình mặc định**: Khoá học · Tái tục · Sản phẩm robot | §D.2.2 | ⚪ |
| F1-7 | **Tự sinh nhu cầu "Học tiếp"** khi học viên sắp hết khoá | QT-10 | ⚪ |
| F1-8 | Báo cáo BC-02, BC-03, BC-04 | §D.6.2 | ⚪ |
| F1-9 | **Bật lại giao diện Việc cần làm của Sale** | ĐG-15 | ⚪ |

**Điều kiện hoàn thành:** Trưởng Kinh doanh tự thêm một giai đoạn mới **không cần đội kỹ thuật** · báo cáo phễu cũ vẫn chạy đúng (kiểm chứng bằng so số liệu trước/sau) · có bảng dự báo doanh số · một phụ huynh mua khoá thứ hai tạo được nhu cầu mới không bị chặn trùng.
**Phụ thuộc:** F.0 hoàn tất.

### F.2 — GỌI ĐIỆN (ước lượng 4–6 tuần, chia 2 bước)

#### F.2a — Ghi nhận (rủi ro thấp nhất, làm trước)

| # | Việc chính |
|---|---|
| F2a-1 | Chọn nhà cung cấp, **lấy trả lời cho 10 câu §D.2.6**, ký hợp đồng gồm **hợp đồng xử lý dữ liệu cá nhân** |
| F2a-2 | Bảng **Cuộc gọi** + đưa vào danh sách model được cách ly + kiểm thử CI "CS1 không thấy CS2" |
| F2a-3 | **Ánh xạ máy lẻ ↔ nhân viên ↔ cơ sở** + đầu số theo cơ sở |
| F2a-4 | **Endpoint webhook** có xác thực + chống trùng + chỉ-tiến-không-lùi + lọc cuộc gọi nội bộ |
| F2a-5 | **Đối khớp số điện thoại** — tách hàm chuẩn hoá dùng chung; xử lý 5 tình huống §D.2.5(c) |
| F2a-6 | Hiển thị cuộc gọi trên **dòng thời gian lead**; màn **Cuộc gọi chưa gán**; màn **Nhật ký cuộc gọi** |
| F2a-7 | **Cron đối soát hằng đêm** với API lịch sử của nhà cung cấp |
| F2a-8 | **Chính sách ghi âm**: lời thông báo đầu cuộc gọi · endpoint nghe có kiểm quyền + audit · hạn lưu · cơ chế xoá |
| F2a-9 | Lập **DPIA (Mẫu số 10)** + sơ đồ luồng dữ liệu theo vai trò |

> **Vì sao tách F.2a riêng:** giai đoạn này **chỉ nhận dữ liệu vào, không gọi ra**. Không đụng tiền, không đụng ghi danh, không đụng quyền ghi. Là bước an toàn nhất để kiểm chứng nhà cung cấp trước khi cam kết sâu. Sale vẫn gọi bằng app của nhà cung cấp trên điện thoại.

**Điều kiện hoàn thành:** mọi cuộc gọi tự động hiện trong CRM, gắn đúng lead, đúng cơ sở · webhook gửi trùng không tạo bản ghi thứ hai · CS1 không thấy cuộc gọi CS2 (kiểm thử CI xanh) · nghe ghi âm ghi được audit · hồ sơ DPIA đã nộp (hoặc đã lập, tuỳ trả lời LS-2).

#### F.2b — Bấm gọi

| # | Việc chính |
|---|---|
| F2b-1 | **Nút "Gọi"** trên màn lead và màn nhu cầu học; bắt chọn **mục đích cuộc gọi** trước khi gọi |
| F2b-2 | **Danh sách không gọi nội bộ** + kiểm trước khi gọi |
| F2b-3 | Gắn vào **SLA-3** (chỉ khi có người nghe ≥ ngưỡng) và **SLA-4** |
| F2b-4 | **Khai kết quả nghiệp vụ** sau cuộc gọi; "hẹn gọi lại" tự tạo việc cần làm |
| F2b-5 | **SLA-5** cuộc gọi nhỡ chưa gọi lại |
| F2b-6 | Báo cáo BC-08, BC-09, BC-10 |
| F2b-7 | 🔴 **Quyết định thời điểm thêm quyền `calls:*`** — xem §G câu Q5 |

**Điều kiện hoàn thành:** Sale bấm một nút là gọi được · SLA-3 tự tắt khi gọi thành công · bấm gọi rồi cúp **không** tắt được SLA-3 (kiểm thử) · báo cáo năng suất gọi chạy đúng.
**Phụ thuộc:** F.2a hoàn tất; nếu thêm quyền mới thì phụ thuộc trạng thái cửa sổ shadow.

### F.3 — TỰ ĐỘNG HOÁ, CHIẾN DỊCH VÀ BÁO CÁO (ước lượng 6–8 tuần)

| # | Việc chính | Ghi chú |
|---|---|---|
| F3-1 | **Màn hình chạy lại sự kiện miền thất bại** | ⚠️ **Điều kiện tiên quyết** của F3-2 (ĐG-20) |
| F3-2 | **Engine quy tắc tự động** — 11 sự kiện × 9 hành động, giới hạn 10/đối tượng, phải tắt mới sửa, nhật ký chạy | |
| F3-3 | **Quy tắc chấm điểm** + phân loại Nóng/Ấm/Lạnh | |
| F3-4 | **Quy tắc phân bổ có điều kiện** (mở rộng từ cấu hình chia hiện có) | |
| F3-5 | **Engine phê duyệt nhiều cấp** + hàng chờ duyệt; gộp cả duyệt trả góp đang có | |
| F3-6 | **Báo giá khoá/gói** + vá lỗ ưu đãi không chảy vào đơn | |
| F3-7 | **Chiến dịch tuyển sinh** + quy nguồn doanh thu + BC-05, BC-06 | |
| F3-8 | **Chỉ tiêu doanh số theo đơn vị tổ chức** + BC-11 | |
| F3-9 | **Hồ sơ gia đình 360°** — dòng thời gian hợp nhất | Vá ĐG-11 |
| F3-10 | **Màn gộp bản ghi trùng** | Vá ĐG-13 |
| F3-11 | **Vá tin nhắn Messenger gửi thật** | Vá ĐG-14 |
| F3-12 | BC-13, BC-14, BC-15 | |

**Điều kiện hoàn thành:** một kịch bản chăm sóc mẫu chạy end-to-end có nhật ký · sự kiện thất bại chạy lại được · báo cáo hiệu quả chiến dịch khớp với chi phí quảng cáo thực · nhân viên trả lời Messenger, khách nhận được thật.
**Phụ thuộc:** F.1 hoàn tất; F3-2 phụ thuộc F3-1.

### F.4 — SAU KHI LẬT CỜ RBAC V2 (chưa xếp lịch)

> 🔴 **CẢNH BÁO LỊCH — đọc trước khi hứa mốc nào ở mục này.** "Chưa xếp lịch" ở đây **không có nghĩa là "chờ vài ngày nữa"**. Đồng hồ shadow **CHƯA CHẠY**, số ngày sạch = **0**, và **chưa bấm được** vì kiểm tra tiền đề P1 còn 3 nhân viên thiếu `UserOrgRole` (`shadow-log.md:9, 22-23`). Chuỗi phụ thuộc thật là:
>
> **F0-10 (gán `UserOrgRole` — chưa ai được giao, chưa có hạn)** → bấm đồng hồ → **3–5 ngày sạch liên tiếp trên lưu lượng thật** → lật cờ → **rồi mới tới F.4**.
>
> Mắt xích đầu tiên hiện **không có người phụ trách và không có hạn** ⇒ **F.4 có thể treo vô hạn**. Đây cũng là mắt xích chặn phần "sau khi lật cờ" của module Chấm công. **Việc cần Ban giám đốc làm ngay: giao người + đặt hạn cho F0-10.**

| # | Việc | Vì sao phải đợi |
|---|---|---|
| F4-1 | Tách quyền riêng `calls:*`, `opportunities:*`, `quotes:*`, `campaigns:*`, `crm-config:*` | Thêm khoá quyền trong cửa sổ shadow làm bẩn số liệu |
| F4-2 | **Chia sẻ bản ghi lẻ cho người dùng cụ thể** (mô hình MISA) | Đụng trực tiếp logic phạm vi dữ liệu |
| F4-3 | **Vai trò "người phụ trách dữ liệu theo đơn vị"** (R-DP-02) | Thêm vai trò = đụng thẳng v2 |
| F4-4 | Trường tuỳ chỉnh cho lead/nhu cầu học | Giá trị/công sức thấp hơn các mục trên |
| F4-5 | Webform cấu hình được | |
| F4-6 | Zalo OA chat 2 chiều trong CRM | Sau khi đã có tổng đài |
| F4-7 | Softphone trên trình duyệt | Sau khi kiểm chứng tương thích React 19 |
| F4-8 | **Cân nhắc bổ sung Zalo ZCC** để hiện tên thương hiệu khi gọi khách thân thiết | Cần đã có tổng đài SIP trước |

### F.5 — Ưu tiên theo giá trị / công sức

| Ưu tiên | Việc | Giá trị | Công sức | Đụng shadow |
|:--:|---|:--:|:--:|:--:|
| 1 | F0-1 bỏ ghi đè consent | Rất cao (pháp lý) | Thấp | ⚪ |
| 2 | F0-2 hợp nhất đường phân bổ | Rất cao | Thấp–TB | ⚪ |
| 3 | F0-3 vá chỉ số chi phí | Cao | Thấp | ⚪ |
| 4 | F0-4 vá SLA | Cao | Thấp | ⚪ |
| 5 | F1-1 quy trình cấu hình được | Rất cao | TB–Cao | ⚪ |
| 6 | F1-2 Nhu cầu học | Rất cao | Cao | ⚪ |
| 7 | F2a ghi nhận cuộc gọi | Cao | TB–Cao | ⚪ |
| 8 | F2b bấm gọi | Cao | TB | ⚪/🔴 |
| 9 | F3-1 chạy lại sự kiện | TB (nhưng chặn F3-2) | Thấp–TB | ⚪ |
| 10 | F3-2 engine tự động hoá | Cao | Rất cao | ⚪ |
| 11 | F3-6, F3-7 báo giá + chiến dịch | TB–Cao | Cao | ⚪ |
| 12 | F4-* mọi việc chạm quyền | TB | TB | 🔴 |

---

## 9. PHẦN G — CÂU HỎI CẦN BAN CHỐT

### Q1 — Tự xây hay mua MISA AMIS CRM?

**Vì sao chặn:** quyết định này thay đổi toàn bộ §F. Nếu mua, phần lớn công việc chuyển thành cấu hình + đồng bộ dữ liệu; nếu tự xây, đó là 4 giai đoạn phát triển.

| Phương án | Hệ quả |
|---|---|
| **A. Tự xây theo mô hình MISA** *(khuyến nghị)* | ✅ Không có ràng buộc gói tính năng (Zalo OA chỉ có ở Professional+; các tính năng tự động hoá cũng phân tầng) · ✅ Giữ được toàn bộ đặc thù Sata Robo ở §C.5 mà MISA **không có** (phễu SR.QD.217, SLA 5 mức, bàn giao HO→cơ sở, học thử, chuyển đổi nguyên tử sang học vụ, hoa hồng 4 tầng, cách ly cơ sở ở tầng truy vấn) · ✅ Một nguồn sự thật · ❌ Tốn công sức đội kỹ thuật · ❌ Không có sẵn 20+ báo cáo |
| **B. Mua MISA AMIS CRM và chuyển phần bán hàng sang** | ✅ Có ngay pipeline cấu hình được, tự động hoá, tổng đài tích hợp sẵn, báo cáo · ✅ Chi phí rõ (14,4 triệu/năm cho 10 người dùng gói Enterprise) · ❌ **Đẻ ra hệ thứ hai** — lead nằm ở MISA, học viên/đăng ký/học phí nằm ở Sata Robo ⇒ phải đồng bộ hai chiều, đúng loại lỗi kiến trúc dự án đang cố tránh · ❌ Học thử, bàn giao HO→cơ sở, hoa hồng 4 tầng **không có chỗ trong MISA** · ❌ Cách ly cơ sở phải làm lại theo mô hình MISA, mất kiểm thử CI đang có · ❌ Dữ liệu phụ huynh/trẻ em nằm ở bên thứ ba |
| **C. Lai — mua MISA chỉ cho tổng đài** | ❌ Không hợp lý: MISA chỉ là lớp trung gian tới OMICall/Stringee. Nối thẳng với nhà cung cấp rẻ hơn và ít phụ thuộc hơn |

**Khuyến nghị BA: phương án A.** Lý do quyết định: các đặc thù ở §C.5 chiếm phần lớn giá trị vận hành của Sata Robo và **không có chỗ đứng trong MISA**.

### Q2 — Nhà cung cấp tổng đài nào?

**Vì sao chặn:** không chốt thì không lấy được báo giá, không ký được hợp đồng xử lý dữ liệu, không bắt đầu F.2a.

| Phương án | Hệ quả |
|---|---|
| **A. OMICall** *(khuyến nghị số 1)* | ✅ Tài liệu API tốt nhất, có đánh phiên bản · ✅ Webhook mô tả chi tiết tới từng trường · ✅ Có API danh sách đầu số ⇒ đa đầu số theo cơ sở, sẵn sàng nhượng quyền · ✅ Được MISA hỗ trợ sẵn (có tiền lệ) · ✅ Giá minh bạch ~1,2 triệu/tháng cho 6 người · ❌ Tài liệu **không mô tả cơ chế ký webhook** · ❌ Không rõ chính sách dùng thử |
| **B. Stringee** *(ứng viên số 2, bắt buộc lấy báo giá song song)* | ✅ Mô hình **theo kênh thoại đồng thời** có thể rẻ hơn hẳn với đội 6 người chỉ 2–3 cuộc cùng lúc · ✅ Ghi âm thoại 0đ/phút · ✅ **Dùng thử 30 ngày** ⇒ rủi ro thấp · ✅ Duy nhất hỗ trợ gọi trên app di động và chuyển tiếp cuộc gọi (theo bảng của MISA) · ❌ Chưa khảo sát sâu tài liệu webhook |
| **C. Zalo ZCC** | ⚠️ **Khuyến nghị không dùng làm trục chính** — xem §D.2.5(a). Đề xuất giữ ở vai trò cộng thêm giai đoạn sau. **CHỈ ĐƯỢC LOẠI BỎ CHÍNH THỨC SAU KHI F0-11 XÁC NHẬN Z-1** (cuộc gọi ZCC có đổ chuông vào SIM không, có webhook trạng thái không, có tệp ghi âm không). Hai lý do còn lại (Z-2 chưa có tổng đài SIP, Z-3 lead đến từ Messenger) **đứng độc lập** và vẫn đúng dù Z-1 ra kết quả nào |

**Khuyến nghị: lấy báo giá cả A và B với cùng một kịch bản sử dụng** (số Sale, số phút/tháng ước tính từ F0-8), rồi chọn. **Không ký trước khi có trả lời cho 10 câu §D.2.6.**
⚠️ **Thứ tự bắt buộc: F0-11 (xác minh Z-1) phải xong TRƯỚC khi Ban giám đốc trả lời câu Q2 này.** Yêu cầu gốc của Ban nêu tên "Zalo OA (hoặc dịch vụ liên quan Zalo) **HOẶC** OMICall" — loại bỏ một phương án Ban đã nêu tên mà chưa xác minh là không đúng quy trình BA.

### Q3 — Ghi âm cuộc gọi: bật hay không, lưu bao lâu, ai được nghe?

**Vì sao chặn:** quyết định trước khi ký hợp đồng nhà cung cấp và trước khi lập DPIA. Ảnh hưởng cả chi phí lẫn nghĩa vụ pháp lý.

| Phương án | Hệ quả |
|---|---|
| **A. Bật ghi âm, lưu 90 ngày, chỉ Quản lý cơ sở + Quản trị viên nghe được, mỗi lượt nghe ghi audit** *(khuyến nghị)* | ✅ Đủ cho đào tạo Sale và xử lý khiếu nại · ✅ Khối lượng tuân thủ vừa phải · ❌ Phải có lời thông báo đầu cuộc gọi · ❌ Phải lập DPIA · ❌ Nếu luật sư trả lời LS-3 là "giọng nói = sinh trắc học" thì chi phí tuân thủ tăng |
| **B. Không bật ghi âm** | ✅ Nghĩa vụ pháp lý thấp nhất · ✅ Không cần trả lời LS-3 · ❌ Không đào tạo được Sale bằng cuộc gọi thật · ❌ Tranh chấp "Sale đã nói gì" không có bằng chứng · ❌ Mất một lợi thế lớn của tổng đài |
| **C. Bật ghi âm, lưu 12 tháng, Sale nghe được cuộc gọi của chính mình** | ✅ Sale tự cải thiện · ❌ Diện tiếp cận dữ liệu cá nhân rộng hơn nhiều · ❌ Khó giải trình "chỉ lưu trong thời gian cần thiết" |

**Câu hỏi phụ phải trả lời cùng lúc:** Sale có được nghe lại cuộc gọi **của chính mình** không? *(BA nghiêng về **không** ở giai đoạn 1, mở sau khi có quy trình đào tạo rõ.)*

### Q4 — Có dựng tầng cổng gọi dịch vụ ngoài `modules/integration` trước không?

**Vì sao chặn:** quyết định nơi đặt mã tích hợp tổng đài. `modules/*` **chưa tồn tại**; quy ước "external call chỉ qua `modules/integration`" là mong muốn, không phải hiện trạng; câu hỏi này đang treo trong `docs/ke-hoach-go-live-2607/cau-hoi-lam-ro-kiet.md:197-198`.

| Phương án | Hệ quả |
|---|---|
| **A. Dựng `modules/integration` trước, tổng đài là khách hàng đầu tiên** | ✅ Đúng blueprint · ✅ Đổi nhà cung cấp về sau rẻ · ✅ Cơ hội gom 17 file đang gọi thẳng nhà cung cấp ngoài · ❌ **Cộng thêm một khối công việc trước khi có giá trị nghiệp vụ nào** · ❌ Rủi ro chạm nhiều file đang chạy production |
| **B. Đặt tạm ở `lib/telephony/` cho nhất quán với `lib/zalo/`, `lib/misa/`; gom vào `modules/` sau** *(khuyến nghị)* | ✅ Có giá trị nghiệp vụ nhanh · ✅ Nhất quán với cách đang làm · ✅ Không chạm mã đang chạy · ❌ Nợ kiến trúc tăng thêm một đầu mối · ❌ Phải cam kết bằng văn bản thời điểm gom lại |

**Lưu ý viết tiêu chí nghiệm thu:** dù chọn phương án nào, **không được viết AC dạng "đi qua `modules/integration`"** như thể tầng đó đã có.

### Q5 — Thời điểm thêm quyền `calls:*` so với cửa sổ shadow-compare?

**Vì sao chặn:** thêm sai thời điểm làm bẩn số liệu quyết định lật cờ RBAC v2 và có thể làm chậm cả đợt go-live.

| Phương án | Hệ quả |
|---|---|
| **A. Giai đoạn 1 mượn quyền `leads:*` đã có; tách `calls:*` sau khi lật cờ** *(khuyến nghị)* | ✅ Không đẻ lệch giả · ✅ Không reset đồng hồ shadow · ✅ Triển khai được ngay · ❌ Trong giai đoạn 1, **ai sửa được lead thì gọi được** — không tách được "được xem lead nhưng không được gọi" · ❌ **Quyền nghe ghi âm cũng phải mượn** ⇒ nếu chọn Q3 phương án A thì phải mượn `leads:view-all` (Quản lý cơ sở có, Sale không có) — chấp nhận được nhưng không sạch |
| **B. Thêm `calls:*` vào cả v1 và v2 đồng thời, trong cùng một lần triển khai** | ✅ Mô hình quyền sạch ngay từ đầu · ❌ **Đổi tập action giữa chừng ⇒ reset ý nghĩa của đồng hồ shadow** · ❌ Phải có người theo dõi shadow xác nhận trước · ❌ Rủi ro làm chậm quyết định lật cờ |

### Q6 — Ba quy trình bán hàng mặc định có đúng nhu cầu không?

**Vì sao chặn:** cấu trúc quy trình quyết định toàn bộ báo cáo và cách Sale làm việc hằng ngày.

| Phương án | Hệ quả |
|---|---|
| **A. Ba quy trình: Khoá học · Tái tục · Sản phẩm robot** *(đề xuất)* | ✅ Tách được doanh thu tuyển sinh mới vs tái tục — chỉ số quản trị quan trọng · ✅ Bán robot có bước kiểm tồn kho riêng · ❌ Sale phải chọn đúng loại nhu cầu khi tạo |
| **B. Một quy trình duy nhất như hiện nay** | ✅ Đơn giản, Sale không phải chọn · ❌ Không đo được tái tục · ❌ Bán robot bị ép qua các bước học thử vô nghĩa |

**Câu hỏi phụ:** hoa hồng cho quy trình "Sản phẩm robot" tính thế nào? (Engine hiện tại thiết kế cho khoá học; tái tục **không có hoa hồng** — `lib/crm/commission.ts:62`.) **Cần Kế toán và BGĐ chốt.**

### Q7 — Cơ sở nhượng quyền được tự cấu hình đến đâu?

**Vì sao chặn:** ảnh hưởng thiết kế phạm vi áp dụng của mọi bảng cấu hình (quy trình, quy tắc, chiến dịch), và ảnh hưởng R-DP-01.

| Phương án | Hệ quả |
|---|---|
| **A. Cấu hình dùng chung toàn thương hiệu, bên nhận quyền chỉ dùng, không sửa** | ✅ Số liệu so sánh được giữa các cơ sở · ✅ Chuẩn hoá chất lượng thương hiệu · ❌ Bên nhận quyền không thích ứng được đặc thù địa phương · ❌ Củng cố lập luận "HO là Bên Kiểm soát" ⇒ HO gánh nhiều trách nhiệm pháp lý hơn |
| **B. Bên nhận quyền tự cấu hình quy trình và quy tắc của mình** *(khuyến nghị nếu chọn R-DP-01 phương án "mỗi bên kiểm soát riêng")* | ✅ Phù hợp mô hình "mỗi bên là Bên Kiểm soát riêng" ⇒ rủi ro pháp lý của HO thấp nhất · ✅ Linh hoạt địa phương · ❌ Báo cáo tổng hợp toàn thương hiệu khó hơn — phải quy về **bộ giai đoạn chuẩn** để so sánh · ❌ Mọi bảng cấu hình phải có trường "đơn vị áp dụng" ngay từ đầu |

> ⚠️ **Q7 phụ thuộc R-DP-01** — câu hỏi gốc về vai trò pháp lý giữa hai pháp nhân, hiện đang treo (`docs/taicautruc/02-prd-franchise-platform.md:341`). **Chốt R-DP-01 trước.**

### Q8 — Có mở màn hình "nghe lại ghi âm" cho cơ sở nhượng quyền không?

**Vì sao chặn:** liên quan trực tiếp R-DP-01 và nghĩa vụ trả/xoá dữ liệu khi cắt hợp đồng (R-DP-06).

| Phương án | Hệ quả |
|---|---|
| **A. Có — trong phạm vi pháp nhân của họ; HO không nghe được** *(khuyến nghị)* | ✅ Nhất quán với "mỗi bên là Bên Kiểm soát riêng" · ✅ HO không gánh trách nhiệm cho cuộc gọi của đối tác · ❌ **Bắt buộc tệp ghi âm chia theo đơn vị trên kho lưu trữ ngay từ đầu** (R-DP-06) — nếu không thì khi cắt hợp đồng **không thực hiện được nghĩa vụ trả/xoá dữ liệu** |
| **B. Không — chỉ HO nghe được** | ❌ Mâu thuẫn với mô hình pháp nhân độc lập · ❌ Bên nhận quyền không đào tạo được đội của họ · ❌ Củng cố lập luận HO là Bên Kiểm soát ⇒ trách nhiệm cao hơn |

### Q9 — Chấp nhận bỏ 6 phân hệ MISA (và gộp 1) khỏi phạm vi?

**Vì sao chặn:** yêu cầu gốc của Ban là **"lấy HOÀN TOÀN theo mô hình CRM của MISA"**. Bảng §D.1.1 **thu hẹp phạm vi so với câu chữ đó** — bỏ Đi tuyến, Đối thủ, Phiếu bảo hành, Dự án bán hàng, Cổng thông tin cho NPP, Hợp đồng; và gộp mất Ao cơ hội. Lý do BA đưa ra đều có căn cứ, **nhưng thu hẹp phạm vi là quyết định của Ban, không phải của BA.** Không trả lời câu này thì §F đang lập lịch cho một phạm vi hẹp hơn phạm vi Ban đã nói.

**Bảng 7 dòng đầy đủ (phân hệ · lý do bỏ · hệ quả nếu cần lại · chi phí thêm lại sau): xem hộp cảnh báo ngay dưới tiêu đề §D.1.1.**

| Phương án | Hệ quả |
|---|---|
| **A. Chấp nhận toàn bộ đề xuất thu hẹp của BA** *(khuyến nghị)* | ✅ Phạm vi vừa quy mô B2C 6 người · ✅ §F giữ nguyên · ❌ Ba mục **Phiếu bảo hành**, **Dự án bán hàng**, **Cổng thông tin cho NPP** sẽ phải làm lại từ đầu nếu chuyển hướng sang bán thiết bị nhiều / bán cho trường học / mở nhượng quyền thật |
| **B. Giữ lại một số mục vào phạm vi đợt này** | ✅ Không phải làm lại sau · ❌ Mỗi mục giữ lại kéo dài §F thêm; **Dự án bán hàng** và **Cổng thông tin cho NPP** là hai mục đắt nhất, và cả hai đều **chưa có nhu cầu vận hành thật** ⇒ rơi vào đúng loại việc "xây trước khi cần" |
| **C. Bỏ hết nhưng ghi vào lộ trình có mốc** | ✅ Không mất trí nhớ tổ chức · ✅ Có điều kiện kích hoạt rõ · ❌ Cần Ban nêu **điều kiện kích hoạt** cho từng mục (ví dụ: "khi ký bên nhận quyền thứ nhất" ⇒ mở Cổng NPP) |

---

## 10. PHỤ LỤC

### PL.1 Những điều CHƯA KIỂM CHỨNG ĐƯỢC

> Liệt kê thẳng, không giấu. **Không mục nào trong danh sách này được trình bày như sự thật ở phần thân tài liệu.**

#### A. Về hệ thống Sata Robo

| # | Nội dung chưa kiểm chứng | Cách kiểm chứng |
|---|---|---|
| A1 | **Số liệu production**: hiện có bao nhiêu lead, phân bố trạng thái thật, bao nhiêu lead thiếu cơ sở, `DEMO_SCHEDULED` còn dữ liệu không | Một truy vấn chỉ-đọc trên production |
| A2 | **Bao nhiêu lead đang mang `consentMarketing = true` giả** (vào qua 3 đường hardcode) | Truy vấn theo `source` + đối chiếu đường vào |
| A3 | **Webhook Facebook / Zalo / Google Form có được cấu hình bí mật trên production không** — không đọc `.env`. Mã fail-closed trên production nên nếu thiếu bí mật sẽ trả 503; **chưa biết thực tế đã có lead nào vào qua các đường này chưa** | Hỏi người phụ trách hạ tầng hoặc xem biến môi trường trên Vercel |
| A4 | **Messenger có đang chạy thật không** — cần Meta App Review + token của Page | Hỏi người phụ trách |
| A5 | **Zalo ZNS có đang gửi thật không** — phụ thuộc `ZALO_LIVE` và token | Cách rẻ nhất: đếm bản ghi `ZaloMessageLog` có mã tin nhắn **không** bắt đầu bằng `SIMULATED-` |
| A6 | `ZALO_OA_ID` mặc định trong mã (`lib/zalo/provider.ts:14`) **có phải OA thật của Sata Robo không** | Đối chiếu với tài khoản OA của công ty |
| A7 | **`IntegrationConfig(provider="MISA").isEnabled` đang bật hay tắt trên production**, và có credential không | Truy vấn chỉ-đọc |
| A8 | **Sata Robo hiện có tài khoản MISA AMIS nào, gói nào, module nào** — **không có tài liệu nội bộ nào trong repo nói điều này** | Hỏi Kế toán / BGĐ; xem hợp đồng |
| A9 | **Tình trạng thật của 21 điểm đứt gãy ở §A.5** — tất cả đều là suy luận từ đọc mã, **chưa chạy test tái hiện** | Viết kiểm thử cho từng điểm trước khi xếp vào việc phải vá |
| A10 | **Bẫy thông báo nhân viên (ĐG-21)** — suy ra từ đọc mã, chưa chạy thử. Có thể có nhánh nào đó làm nó vô hại | Một kiểm thử nhỏ (F0-9) |
| A11 | **`lib/observability/slo.ts` có thật sự không có nơi nào gọi không** — lấy từ audit nội bộ, chưa tự đếm lại | Đếm lại |
| A12 | **Con số "17 file gọi thẳng nhà cung cấp ngoài, 9 file nằm trong `app/**`"** — lấy từ audit nội bộ, chưa tự đếm lại | Đếm lại |
| A13 | **Quan hệ giữa `TrialClass` (cũ) và `TrialClassV2`** — hai hệ thống học thử cùng tồn tại có chủ đích, chưa khảo sát đường nào đang dùng chính trên production | Khảo sát riêng |
| A14 | **Các cơ sở đang đặt chế độ chia lead nào** (bảng rỗng ⇒ mặc định luân phiên) | Truy vấn chỉ-đọc |
| A15 | **Vercel còn dư chỗ cho cron thứ 16 không** (hiện 15 cron) | Kiểm tra gói Vercel |
| A16 | **Token nhà cung cấp trong `IntegrationConfig.settings` có được mã hoá ở tầng hạ tầng Supabase không** — chỉ khẳng định được **mã ứng dụng không mã hoá** | Hỏi người phụ trách hạ tầng |
| A17 | **Đội Sale hiện đang gọi bằng gì** (SIM cá nhân? máy bàn? Zalo?) và **sản lượng cuộc gọi mỗi tháng** | ⚠️ **Không có con số này thì không chọn được mô hình giá.** Đo trong 2 tuần (F0-8) |
| A18 | **Sata Robo đã có đầu số hotline nào chưa** | Hỏi hành chính |
| A19 | **Nội dung thân bài trang chính sách bảo mật** — nội dung nằm trong CSDL (CMS), không nằm trong repo. Chỉ xác minh được tiêu đề phụ và mô tả SEO vẫn dẫn NĐ 13/2023 | Đọc từ trang public hoặc CMS |
| A20 | **Hệ thống có đang lưu hồ sơ ứng viên tuyển dụng không** — nếu có, nghĩa vụ xoá hồ sơ ứng viên không trúng tuyển có thể đang bị bỏ sót | Khảo sát module tuyển dụng |

#### B. Về MISA

| # | Nội dung chưa kiểm chứng |
|---|---|
| B1 | **Kiểu dữ liệu của trường tuỳ chỉnh** trong AMIS CRM — bài chi tiết trả HTTP 404. Đây là khoảng trống lớn nhất vì "trường tuỳ chỉnh" là thứ BA cần nhất khi sao chép mô hình |
| B2 | **Webform** — trang mục lục trả HTTP 404. Chỉ biết tính năng tồn tại, không biết luồng cấu hình |
| B3 | **Thuật toán phân bổ cụ thể** (luân phiên / theo khu vực / theo tải / theo tỷ lệ chốt) |
| B4 | **Công thức chấm điểm** — thang điểm, điểm cộng/trừ, ngưỡng phân loại |
| B5 | **Danh mục "lý do thua" chuẩn** — là danh sách chọn cấu hình được hay nhập tự do |
| B6 | **Bộ giai đoạn pipeline mặc định của MISA** (tên các giai đoạn ra khỏi hộp) — chỉ xác nhận có "Hoàn thành thành công" / "Hoàn thành thất bại" |
| B7 | **"Ao cơ hội"** — cơ chế nhận/trả, ai được nhận, hết hạn thì sao |
| B8 | **"Dự án bán hàng"** và **"Xếp hạng khách hàng"** — chưa đọc chi tiết |
| B9 | **Danh sách đầy đủ tên báo cáo** — trang có phân trang, mới đọc trang đầu. Con số "90+ báo cáo" chỉ có trên trang giới thiệu sản phẩm, không có trên cổng tài liệu |
| B10 | **Nguồn dữ liệu của "Tra cứu tồn kho, công nợ"** — suy đoán là AMIS Kế toán, chưa xác nhận |
| B11 | **Cơ chế hoa hồng cộng tác viên/Affiliate** — chỉ xác nhận có ghi nhận "cơ hội do CTV giới thiệu" |
| B12 | **Chi tiết "check-in GPS / chụp ảnh" trong Đi tuyến** — bản tóm tắt công cụ có nhắc, **không xác nhận được câu gốc của MISA** |
| B13 | **SLA của Thẻ chăm sóc** |
| B14 | **Mốc thời gian bảng so sánh tính năng là 08/2024** — gần hai năm. Số tính năng (31/30/9) có thể đã thay đổi |
| B15 | **Giá "Standard 80.000 / Professional 100.000"** xuất hiện trong một kết quả tìm kiếm, **mâu thuẫn** với bảng giá chính thức (85.000 / 105.000). **Không dùng số đó** |
| B16 | **Toàn bộ nội dung web về MISA là bản tóm tắt do công cụ sinh ra**, không phải trích nguyên văn (trừ đoạn trong ngoặc kép). Trước khi ký duyệt, cần mở lại URL đối chiếu tay |

#### C. Về gọi điện (Zalo, OMICall, các nhà cung cấp khác)

| # | Nội dung chưa kiểm chứng |
|---|---|
| C1 | **Không đọc được nội dung bất kỳ trang tài liệu nào trên `developers.zalo.me`** — trang dựng bằng JavaScript, công cụ tải về chỉ nhận tiêu đề. Đã thử 2 URL, đều thất bại |
| C2 | **Tệp PDF chính thức về ZCC** tải về được 945 KB nhưng **không giải mã thành văn bản đọc được** |
| C3 | → **Toàn bộ chi tiết kỹ thuật API gọi thoại Zalo là chưa kiểm chứng**: tên endpoint, tham số, mã lỗi, định dạng phản hồi, cơ chế webhook, giới hạn tần suất |
| C4 | **Khẳng định "cuộc gọi Zalo đổ chuông trong app, không phải vào SIM"** (Z-1) là `[SUY LUẬN]` từ 3 nguồn mô tả nhất quán, **không phải câu khẳng định trực tiếp của Zalo**. Đây là điểm quan trọng nhất của phần gọi điện → **phải xác nhận lại với Zalo trước khi Ban ra quyết định**. ✅ **Đã thành việc có chủ: F0-11 ở §F.0**, phải xong **trước** khi Ban trả lời Q2. Trước khi F0-11 xong, §D.2.5(a) chỉ là **khuyến nghị**, không phải kết luận |
| C5 | **Phí 550đ/yêu cầu cấp quyền gọi (ZCC)** và **quy tắc "miễn phí trong 30 ngày kể từ lần tương tác gần nhất"** — chỉ có từ tổng hợp kết quả tìm kiếm, không mở được trang gốc |
| C6 | **Tên gói OA mâu thuẫn giữa các nguồn** ("Premium 399.000đ/tháng" vs "Tiêu chuẩn/Tăng trưởng/Toàn diện"). Lấy trang chính thức `zalo.solutions` làm chuẩn, xác nhận lại với đại lý |
| C7 | **Zalo ZCC có bắn webhook trạng thái cuộc gọi và có tệp ghi âm không** — hoàn toàn chưa rõ |
| C8 | **URL môi trường sản xuất của OMICall** — tài liệu ghi địa chỉ có hậu tố `-stg` (thử nghiệm) |
| C9 | **Cơ chế bảo mật webhook của OMICall** — tài liệu **không mô tả** chữ ký, token hay danh sách IP. Là lỗ hổng thiết kế nghiêm trọng nếu không có |
| C10 | **Giới hạn tần suất** của API bấm-gọi và API lịch sử cuộc gọi |
| C11 | **Chính sách lưu trữ tệp ghi âm của OMICall** — lưu bao lâu, liên kết có hết hạn không, xoá theo yêu cầu được không, **máy chủ đặt ở đâu** |
| C12 | **SDK web v3 có chạy với React 19 không** — tài liệu chỉ ghi "React 18+" |
| C13 | **Bao giờ có gói npm** cho SDK — tài liệu ghi "comming soon", không có mốc |
| C14 | **Có môi trường thử nghiệm riêng không** và cách đăng ký |
| C15 | **Giá OMICall đã bao gồm cước viễn thông chưa** — bảng giá công khai chỉ ghi phí phần mềm/người dùng |
| C16 | **Chính sách dùng thử của OMICall** — không tìm thấy (Stringee công bố 30 ngày) |
| C17 | **VNPT và CMC — chưa khảo sát.** Không có bất kỳ dữ liệu nào |
| C18 | **Caresoft** — chỉ xác nhận có tài liệu bấm-gọi. Chưa có giá, chưa có chi tiết webhook, chưa rõ chính sách ghi âm |
| C19 | **3CX** — chỉ xác nhận có tích hợp CRM. Chưa đánh giá chi phí vận hành, chưa rõ ai quản trị PBX tại Sata Robo |
| C20 | **Không có bảng so sánh giá cùng đơn vị** giữa OMICall (theo người dùng/tháng) và Stringee (theo phút hoặc theo kênh). Cần báo giá thật với cùng một kịch bản |

#### D. Về pháp lý

| # | Nội dung chưa kiểm chứng |
|---|---|
| D1 | **Chưa đọc được bản gốc Luật 91/2025 và NĐ 356/2025** (`thuvienphapluat.vn/van-ban/...` trả HTTP 403). Toàn bộ số điều, số khoản, số điểm lấy từ **nguồn thứ cấp**. Phải đối chiếu Công báo trước khi ký duyệt |
| D2 | **Danh mục dữ liệu nhạy cảm NĐ 356 Điều 4** — số hiệu điểm lấy từ tóm tắt. *Bản chất kết luận thì chắc chắn* (được xác nhận chéo nhiều nguồn); chỉ **số hiệu điểm** là chưa chắc |
| D3 | **DPIA là tiền kiểm hay hậu kiểm** — hai nguồn uy tín mâu thuẫn. Chưa giải quyết được (câu LS-2) |
| D4 | **Miễn trừ doanh nghiệp nhỏ (Điều 41 NĐ 356)** — điều kiện loại trừ ("xử lý dữ liệu nhạy cảm" / ">100.000 chủ thể") chỉ có ở một bản tin. Nếu sai, khối lượng tuân thủ thay đổi hoàn toàn (câu LS-1) |
| D5 | **Lệnh cấm nghe lén/ghi âm** — chưa xác định được là **hành vi bị nghiêm cấm chung** hay **nghĩa vụ riêng của nhà cung cấp mạng xã hội/dịch vụ truyền thông trực tuyến**. Nguồn báo chí trình bày hai cách khác nhau |
| D6 | **Giọng nói có phải "dữ liệu sinh trắc học"** theo NĐ 356 hay không (câu LS-3) |
| D7 | **Thời hạn lưu tệp ghi âm CSKH** — pháp luật **không nêu con số**. Con số 90 ngày / 12 tháng trong tài liệu này là **đề xuất của BA, không phải quy định** |
| D8 | **Danh sách không quảng cáo có API tra cứu tự động không** — nếu chỉ tra thủ công thì thiết kế CRM phải khác (đối chiếu theo lô định kỳ thay vì kiểm lúc bấm gọi) |
| D9 | **Nhà cung cấp tổng đài có ký hợp đồng xử lý dữ liệu cá nhân theo mẫu Việt Nam không** — điều kiện tiên quyết |
| D10 | **Thủ tục nhượng quyền trong nước** (đăng ký hay chỉ báo cáo Sở Công Thương) — không ảnh hưởng thiết kế phần mềm |

#### E. Chỉnh lý so với khảo sát nền

| # | Nội dung |
|---|---|
| E1 | Khảo sát nền ghi *"không tìm thấy route xuất lead"*. **Sai — route có tồn tại**: `app/api/admin/leads/export/route.ts`, và có che thông tin cá nhân tại máy chủ trước khi ghi file. Tài liệu này đã sửa lại ở §A.3. |
| E2 | Khảo sát nền ghi vị trí truy vấn tổng chi phí quảng cáo là `lib/crm/funnel-query.ts:16`. **Vị trí đúng là `:15`** (đã đếm lại trực tiếp). Kết luận về lỗi vẫn đúng. |
| E3 | Khảo sát nền ghi nhánh cuối của bộ kiểm chuyển trạng thái ở `lib/leads/status.ts:133`. **Vị trí đúng là `:136`**, hàm bắt đầu ở `:118`. Kết luận vẫn đúng. |
| E4 | Khảo sát nền ghi *"ingest không set `centerId`"*. **Chính xác hơn:** hàm nhận lead **có** chấp nhận `centerId` (`lib/lead/ingest.ts:63`), nhưng hàm trích trường của webhook (`lib/lead/webhook.ts:187-226`) **không trả về `centerId`** ⇒ trên thực tế lead từ webhook luôn thiếu cơ sở. Kết luận nghiệp vụ không đổi. |

### PL.2 Danh sách nguồn

#### Nguồn mã nguồn nội bộ (đã đọc trực tiếp)

`E:/satarobo-vn/CLAUDE.md` · `prisma/schema.prisma` (các dòng 37-55, 394, 420-434, 465-513, 521-577, 584-629, 631-651, 957-1099, 1687-1695, 2869-2987, 3085-3248, 3516-3524, 3666-3689, 4073-4084, 4479-4493, 4715-4768, 4899-4918, 5042, 5094-5145, 5226-5260, 548-559) · `lib/auth/permissions.ts` · `lib/db-scope.ts` · `lib/leads/status.ts` · `lib/lead/ingest.ts` · `lib/lead/webhook.ts` · `lib/lead/auto-assign.ts` · `lib/lead/assign.ts` · `lib/lead/assign-strategy.ts` · `lib/lead/pii.ts` · `lib/lead/dedup.ts` · `lib/crm/sla.ts` · `lib/crm/funnel-query.ts` · `lib/crm/handover.ts` · `lib/crm/lead-qualify.ts` · `lib/crm/convert-lead-v2.ts` · `lib/crm/dedupe.ts` · `lib/crm/commission.ts` · `lib/crm/cost-allocation.ts` · `lib/crm/ads-insights.ts` · `lib/crm/messenger-service.ts` · `lib/crm/meta-webhook.ts` · `lib/crm/webhook-replay.ts` · `lib/crm/transfer-validate.ts` · `lib/zalo/provider.ts` · `lib/zalo/service.ts` · `lib/zalo/token.ts` · `lib/misa/service.ts` · `lib/events/publish.ts` · `lib/events/dispatcher.ts` · `lib/events/registry.ts` · `lib/email/queue.ts` · `lib/email/send.ts` · `lib/rate-limit.ts` · `lib/staff-notifications.ts` · `lib/compliance/retention.ts` · `lib/attendance/geofence.ts` · `lib/eslint/db-import-allowlist.mjs` · `lib/reports/lead.ts` · `lib/observability/slo.ts` · `app/(admin)/admin/leads/**` · `app/(admin)/admin/crm/**` · `app/(admin)/admin/tich-hop/**` · `app/api/leads/route.ts` · `app/api/admin/leads/export/route.ts` · `app/api/public/webhook/**` · `app/(public)/chinh-sach-bao-mat/page.tsx` · `sentry.server.config.ts` · `vercel.json` · `.dependency-cruiser.cjs`

#### Tài liệu nội bộ

`docs/taicautruc/01-intended-vs-implemented.md` · `docs/taicautruc/02-prd-franchise-platform.md` · `docs/misa-amis-sync.md` · `docs/zalo-notification-adapter.md` *(một phần đã lỗi thời)* · `docs/ke-hoach-go-live-2607/shadow-log.md` · `docs/ke-hoach-go-live-2607/cau-hoi-lam-ro-kiet.md` · `Document/2-architecture-design/15-final-architecture-blueprint.md`

#### MISA `[WEB]`

| Mã | URL |
|---|---|
| N1/N2 | https://helpcrm.misa.vn/wp-content/uploads/2024/08/Bang-so-sanh-tinh-nang-cua-AMIS-CRM-va-MISA-CRM-MISA-CRM2.pdf |
| N3 | https://helpcrm.misa.vn/ |
| N4 | https://amis.misa.vn/bang-gia-phan-mem-misa-amis-crm/ |
| N5 | https://amis.misa.vn/phan-mem-crm-amis/ |
| N6 | https://helpcrm.misa.vn/kb/thiet-lap-quy-trinh-ban-hang/ |
| N7 | https://helpcrm.misa.vn/kb/quan-ly-chi-tiet-ban-ghi-tiem-nang/ |
| N8 | https://helpcrm.misa.vn/ac/co-hoi/ |
| N9 | https://helpcrm.misa.vn/ac/phan-quyen/ |
| N10 | https://helpcrm.misa.vn/ac/quyen-du-lieu/ |
| N11 | https://helpcrm.misa.vn/kb/thiet-lap-tong-dai-dien-thoai/ |
| N12 | https://helpcrm.misa.vn/ac/quy-trinh-tu-dong/ |
| N13 | https://helpcrm.misa.vn/kb/ket-noi-voi-zalo-official-account/ |
| N13b | https://helpcrm.misa.vn/ac/quy-tac-tu-dong/ |
| N14 | https://helpcrm.misa.vn/ac/the-cham-soc/ |
| N15 | https://helpcrm.misa.vn/ac/chao-hang-chien-dich/ |
| N16 | https://helpcrm.misa.vn/ac/khach-hang/ |
| N17 | https://helpcrm.misa.vn/ac/don-hang/ |
| N18 | https://helpcrm.misa.vn/ac/bao-gia/ |
| N19 | https://helpcrm.misa.vn/ac/hoat-dong/ |
| N20 | https://helpcrm.misa.vn/ac/doi-thu/ |
| N21b | https://helpcrm.misa.vn/ac/tra-cuu-ton-kho/ |
| N22 | https://helpcrm.misa.vn/kb/quan-ly-ban-hang/ |
| N23 | https://helpcrm.misa.vn/kb/co-hoi/ |
| N24 | https://helpcrm.misa.vn/kb/tiem-nang-khi-da-duoc-sinh-co-hoi-khach-hang-thi-con-o-tiem-nang-khong/ |
| N25 | https://helpcrm.misa.vn/ac/muc-tieu/ |
| N26 | https://helpcrm.misa.vn/ac/di-tuyen/ |
| N27 | https://helpcrm.misa.vn/kb/quy-trinh-lam-viec/ |
| N28 | https://helpcrm.misa.vn/ac/quy-trinh-phe-duyet/ |
| N29 | https://helpcrm.misa.vn/ac/quy-tac-phan-bo/ |
| N30 | https://helpcrm.misa.vn/kb/quy-tac-cham-diem/ |
| N31 | https://helpcrm.misa.vn/ac/ket-noi/ |
| N32 | https://helpcrm.misa.vn/kb/goi-dien-bang-tong-dai-dien-thoai/ |
| N33 | https://helpcrm.misa.vn/kb/ket-noi-voi-facebook-fanpage/ |
| N34 | https://helpcrm.misa.vn/ac/ket-noi-misa/ |
| N35 | https://helpcrm.misa.vn/ac/bao-cao/ |
| N36 | https://helpcrm.misa.vn/kb/bao-cao-phan-tich-co-hoi-theo-giai-doan/ |
| N37 | https://helpcrm.misa.vn/kb/gioi-thieu-amis-crm/ |
| N38 | https://helpcrm.misa.vn/ac/tuy-chinh/ |
| N39 | https://helpcrm.misa.vn/kb/ket-noi-voi-zalo-zns/ |
| N40 | https://helpcrm.misa.vn/kb/mang-xa-hoi/ |

#### Zalo `[WEB]`

- https://oa.zalo.me/home/function/interaction?type=goi-thoai ✅ *(đọc được)*
- https://zalo.solutions/oa/pricing ✅ *(đọc được)*
- https://developers.zalo.me/docs/official-account/goi-thoai/tong-quan *(chỉ đọc được tiêu đề)*
- https://developers.zalo.me/docs/official-account/goi-thoai/cap-quyen-goi/gui-yeu-cau-cap-quyen-goi *(chỉ đọc được tiêu đề)*
- https://developers.zalo.me/docs/official-account/goi-thoai/cap-quyen-goi/kiem-tra-khach-hang-da-cap-quyen-goi *(không đọc được nội dung)*
- https://developers.zalo.me/docs/official-account/bat-dau/gioi-thieu-official-account-api-va-cac-nhom-quyen
- https://stc-developers.zdn.vn/docs/assets/files/Zalo_Ket%20noi%20giua%20ZCC%20cua%20Zalo%20voi%20Callcenter%20cua%20doanh%20nghiep-16343724d8b7aafff98b5deaa27cd243.pdf *(tải được, không giải mã được)*
- https://mitek.vn/zalo-cloud-connect-zcc-giai-phap-goi-cskh-thong-qua-ung-dung-zalo/
- https://kinhdoanhso.com/cong-nghe/zcc-dich-vu-goi-thoai-qua-tai-khoan-zalo-oa.html ✅

#### OMICall `[WEB]`

- https://api.omicall.com/ ✅
- https://api.omicall.com/omicall-api/overview ✅
- https://api.omicall.com/omicall-api/click-to-call ✅
- https://api.omicall.com/omicall-api/call-center ✅
- https://api.omicall.com/omicall-api/call-transaction/v2.md ✅
- https://api.omicall.com/webhooks/call-hooks ✅
- https://api.omicall.com/sdk/web-sdk ✅ · https://api.omicall.com/sdk/web-sdk/v3-integration.md ✅
- https://omicall.com/bang-gia/ ✅
- https://api.omicall.com/llms.txt · https://api.omicall.com/llms-full.txt *(chưa khai thác — nguồn tốt cho khảo sát sâu)*

#### Nhà cung cấp thay thế `[WEB]`

- https://stringee.com/vi/pricing-call · https://stringee.com/vi/use-cases/integrate-contact-center-into-your-crm-application · https://techtalk.stringee.com/call-api-document · https://stringeex.com/vi/product/call-center
- https://docs.caresoft.vn/danh-muc/tich-hop-thoai/tich-hop-goi-ra-su-dung-click-to-call-tren-web
- https://www.3cx.com/call-center/crm-integration/

#### Pháp lý `[WEB]`

- https://bocongan.gov.vn/chinh-sach-phap-luat/bai-viet/luat-bao-ve-du-lieu-ca-nhan-chinh-thuc-co-hieu-luc-thi-hanh-tu-ngay-01-01-2026-1767186124
- https://bocongan.gov.vn/chinh-sach-phap-luat/bai-viet/mot-so-quy-dinh-dang-chu-y-trong-luat-bao-ve-du-lieu-ca-nhan-2025-1753847906
- https://vanban.chinhphu.vn/?pageid=27160&docid=216387 *(NĐ 356/2025)*
- https://congbao.chinhphu.vn/van-ban/luat-so-91-2025-qh15-45578.htm *(bản gốc — cần đối chiếu tay)*
- https://www.ey.com/vi_vn/technical/tax/tax-and-law-updates/nghi-dinh-so-356-2025-nd-cp-quy-dinh-chi-tiet-mot-so-dieu-va-bien-phap-thi-hanh-luat-bao-ve-du-lieu-ca-nhan
- https://www.frasersvn.com/vi/legal-updates-and-publications/the-next-chapter-in-data-protection-new-decree-guiding-the-personal-data-protection-law
- https://luatvietnam.vn/thong-tin/nghi-dinh-356-2025-nd-cp-quy-dinh-chi-tiet-luat-bao-ve-du-lieu-ca-nhan-422896-d1.html
- https://mps.gov.vn/chinh-sach-phap-luat/bai-viet/bao-ve-du-lieu-ca-nhan-trong-mot-so-hoat-dong-1754989261
- https://thuvienphapluat.vn/phap-luat/cong-ty-ghi-am-cuoc-goi-tu-van-cua-nhan-vien-voi-khach-hang-co-vi-pham-phap-luat-hay-khong-ghi-am-c-193103-24522.html
- https://thuvienphapluat.vn/hoi-dap-phap-luat/trong-luat-bao-ve-du-lieu-ca-nhan-nam-2025-muc-phat-tien-toi-da-trong-xu-phat-vi-pham-hanh-chinh-do-138073320.html
- https://hatinh.gov.vn/vi/bai-viet/quy-dinh-bao-ve-du-lieu-ca-nhan-thu-duoc-tu-hoat-dong-ghi-am-ghi-hinh-tai-noi-cong-cong
- https://cspl.mic.gov.vn/Pages/TinTuc/tinchitiet.aspx?tintucid=138202 *(Danh sách không quảng cáo)*
- https://khongquangcao.ais.gov.vn
- https://vneconomy.vn/phat-tan-tin-nhan-rac-cuoc-goi-quang-cao-co-the-bi-phat-toi-170-trieu-dong.htm
- https://vneconomy.vn/nhung-diem-moi-trong-luat-bao-ve-du-lieu-ca-nhan-tu-112026.htm
- https://plo.vn/cong-bo-du-lieu-ca-nhan-cua-tre-tu-7-tuoi-phai-duoc-tre-va-nguoi-dai-dien-dong-y-post888944.html
- https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-dinh-13-2023-nd-cp-bao-ve-du-lieu-ca-nhan-119230516104357809.htm *(văn bản CŨ, đã bị thay thế — chỉ để đối chiếu)*

---

*Hết tài liệu. Bản thảo BA — cần Ban giám đốc chốt **9 câu** ở §G trước khi chuyển thành đặc tả kỹ thuật. Trong đó **Q7 và Q8 phải chốt SỚM** (chúng định hình trường "đơn vị áp dụng" và cách chia thư mục tệp ghi âm — sửa sau rất đắt), và **F0-10 + F0-11 ở §F.0 phải xong trước khi trả lời Q2 và trước khi lập lịch §F.4**.*

