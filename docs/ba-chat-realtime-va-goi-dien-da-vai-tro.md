# CHAT REALTIME + GỌI ĐIỆN ĐA VAI TRÒ — RESEARCH, PHƯƠNG ÁN VÀ PHÂN TÍCH GIẢ ĐỊNH

> **Người đọc:** Ban giám đốc · Trưởng Kinh doanh/Đào tạo · Đội kỹ thuật.
> **Ngày lập:** 29/07/2026 · **Nhánh khảo sát:** `claude/email-sms-auth-docs-5vztac` (base `main`, commit `7cd00415`) · **Trạng thái:** bản thảo, CHƯA ký duyệt — **đã qua 1 vòng kiểm chứng đối kháng 29/07** (7 agent độc lập: 29 trích dẫn mã nguồn xác minh 28 đúng 1 sửa; 2 khẳng định bị bác và đã đính chính — xem các mục đánh dấu "xác minh 29/07"; Z-1 nâng từ suy luận lên ĐÃ XÁC NHẬN từ nguồn sơ cấp Zalo).
> **Đề bài gốc:** *"research và lên phương án tích hợp chat realtime + gọi điện qua Zalo tương tự ZaloCRM (github.com/locphamnguyen/ZaloCRM) và OMICall, giữa Quản lý lớp học, Quản lý cơ sở, Giáo viên, Sale với Khách hàng."*
> **Phương pháp:** đọc mã nguồn tĩnh (không chạy DB, không build, không đọc `.env`) + tài liệu công khai + tài liệu nội bộ.
> **Quy ước trích dẫn:** `đường/dẫn:dòng` = đã đọc trực tiếp · `[WEB]` = nguồn công khai · `[FILE]` = tài liệu nội bộ · `[SUY LUẬN]` = kết luận của người viết · `[CHƯA KIỂM CHỨNG]` = không xác nhận được, **không được trình bày như sự thật**.

---

## 0. TÀI LIỆU NÀY QUAN HỆ THẾ NÀO VỚI `ba-crm-hien-trang-va-misa.md`

`[FILE] docs/ba-crm-hien-trang-va-misa.md` (28/07/2026) **đã trả lời phần "gọi điện"** — kết luận: loại Zalo khỏi vai trò trục chính, dùng tổng đài đám mây (OMICall #1, Stringee #2), có luồng gọi ra/gọi vào, 8 rủi ro CG-01…CG-08, 9 điều kiện tiên quyết TQ-1…TQ-9, 10 câu hỏi nhà cung cấp.

**Tài liệu này KHÔNG lặp lại phần đó.** Nó bổ sung đúng ba thứ mà đề bài mới đặt ra và tài liệu cũ chưa phủ:

| Phần mới | Vì sao tài liệu cũ chưa phủ |
|---|---|
| **Chat realtime** — hạ tầng thời gian thực, kênh khách hàng hai chiều | Tài liệu cũ chỉ nói "vá ĐG-14 (gửi tin Messenger thật)", không thiết kế kênh chat |
| **Đa vai trò** — Giáo viên · Quản lý lớp · Quản lý cơ sở · Sale cùng nói chuyện với khách | Tài liệu cũ chỉ có trục **Sale ↔ Lead**. Giáo viên và Quản lý cơ sở nằm ngoài phạm vi |
| **Mô hình ZaloCRM** (đề bài trỏ tới) | Tài liệu cũ không khảo sát repo này. **Kết quả khảo sát bên dưới là một phát hiện chặn — §2.1** |

> ⚠️ **Ranh giới cần giữ:** mọi kết luận về **nhà cung cấp tổng đài, ghi âm, webhook cuộc gọi, chi phí gọi** ở tài liệu cũ vẫn có hiệu lực. Tài liệu này chỉ mở rộng, không đảo.

---

## 1. TÓM TẮT CHO LÃNH ĐẠO — 10 điểm

1. **Đề bài đang trộn ba bài toán rất khác nhau** vào một câu: (a) hộp thư hợp nhất cho nhân viên, (b) hạ tầng thời gian thực, (c) tổng đài. Ba cái này khác nhau về chi phí, rủi ro pháp lý và thời gian tới 10 lần. **Phải tách trước khi ước lượng.**
2. **ZaloCRM trong đề bài KHÔNG dùng API chính thức của Zalo.** Nó điều khiển **tài khoản Zalo cá nhân** qua thư viện `zca-js` (giả lập trình duyệt Zalo Web) `[WEB]`. Chính tác giả cảnh báo *"có thể bị khoá tài khoản"* và *"có thể vi phạm Điều khoản dịch vụ của Zalo"* `[WEB]`. **Khuyến nghị: KHÔNG dùng mô hình này** — §2.1.
3. **Thêm một điểm chặn nữa của ZaloCRM: giấy phép AGPL-3.0** `[WEB]`. Sata Robo đang định hướng **nền tảng nhượng quyền** (`[FILE] docs/taicautruc/02-prd-franchise-platform.md`). Nhúng mã AGPL vào sản phẩm phục vụ bên thứ ba qua mạng ⇒ **nghĩa vụ công khai mã nguồn**. Đây là quyết định pháp lý, không phải kỹ thuật.
4. **Sata Robo ĐÃ CÓ chat phụ huynh ↔ nhân viên đang chạy production** — `ConversationMessage` theo từng đăng ký học, có đánh dấu đã đọc hai phía, có thông báo qua sự kiện miền, liền mạch khi học viên chuyển lớp/cơ sở (`lib/conversation/service.ts:33-75`, `:90-119`; `prisma/schema.prisma:5029-5047`). **Trước khi xây kênh mới, phải trả lời: kênh đang có, có ai dùng không?** Nếu không ai dùng, xây kênh thứ hai cũng sẽ không ai dùng — §5, giả định **V-01**.
5. **Không có kênh ĐẨY (push) thời gian thực nào — nhưng polling đã có tiền lệ** *(đính chính sau kiểm chứng 29/07 — bản trước viết "con số 0" là nói quá)*. Không websocket / SSE / pusher / supabase-js ở đâu trong repo lẫn `package.json`; nhưng đã có 2 chỗ client tự poll: **chuông thông báo admin mỗi 60 giây** (`components/admin/notification-bell.tsx:36-40`) và màn SCORM poll 4 giây (`app/(admin)/admin/scorm/_components/scorm-manager.tsx:93-104`). Nghĩa là: mở rộng pattern polling sẵn có sang tin nhắn (chu kỳ 3–5 giây, endpoint nhẹ trả tin sau con trỏ) là **bước đi nhỏ trong khuôn khổ hiện tại**, không phải xin một tầng hạ tầng mới. Đường nâng cấp không-vendor-mới: **Supabase Realtime** (dự án đã chạy Supabase Postgres) — xem §4 PA-1.
6. **Zalo OA chính thức không phải kênh chat tự do — nhưng đỡ ngặt hơn bản thảo trước** *(cập nhật sau xác minh 29/07)*. Cửa sổ tương tác 7 ngày; tối đa 8 tin/48 giờ mỗi hội thoại, **nhưng hạn mức và cửa sổ RESET theo MỖI tương tác mới của khách** (nhắn tin, follow, bấm menu, gọi) `[WEB]` ⇒ hội thoại tư vấn qua-lại gần như không mất phí; chỉ **độc thoại chủ động** (nhắc học phí, báo đổi lịch ngoài cửa sổ) mới tính phí — **55đ/tin** theo biểu giá 01/06/2026, hoặc đi đường ZNS. Ràng buộc tiền mới phát hiện: **Open API/webhook chỉ có từ gói Tăng trưởng ~2,5 triệu đ/12 tháng** (100 req/phút, 3 app; Toàn diện 6tr/năm = 2.000 req/phút) `[WEB]` — **điều kiện tiên quyết của PA-1**.
7. **Bốn vai trò trong đề bài có nhu cầu ngược nhau.** Sale cần **gọi ra hàng loạt** cho người **chưa** là khách. Giáo viên cần **nhắn ít, đúng lớp, đúng phụ huynh**. Quản lý cơ sở cần **xem được tất cả nhưng không phải trả lời tất cả**. *(Đính chính sau kiểm chứng 29/07 — bản trước viết "vai trò chưa tồn tại" là SAI:)* "Quản lý lớp học" **ĐÃ được định nghĩa ở RBAC v2** — RoleDef `CENTER_CLASS_MANAGER`, tên "Quản lý lớp học" (`prisma/seed-roles.ts:397`, 5 quyền attendance/classes/students/parent-requests, Kiệt duyệt 07/07/2026, **chưa gán cho ai**) — nhưng **KHÔNG nằm trong ma trận v1 đang enforce** (enum 9 vai, `lib/auth/permissions.ts`), tức quyền chat cho vai này chỉ có hiệu lực sau khi lật cờ RBAC v2 (liên đới **B-09**). Gộp cả bốn vào một hộp thư là **giả định thiết kế mạnh nhất và rủi ro nhất** của đề bài — §5, **V-05**.
8. **Có một rào chắn pháp lý phải dỡ TRƯỚC mọi tính năng chat/gọi:** hệ thống đang ghi đè cứng `consentMarketing = true` cho lead vào qua webhook (`lib/lead/ingest.ts:70` — ĐG-02 trong tài liệu cũ). Luật 91/2025/QH15 + NĐ 356/2025/NĐ-CP hiệu lực 01/01/2026 `[WEB]` yêu cầu sự đồng ý **kiểm chứng được**. Bật thêm kênh liên lạc trên nền dữ liệu đồng ý sai = **nhân rộng rủi ro**, không phải tạo mới.
9. **Khuyến nghị: PA-1 (§4)** — giữ Zalo ở vai trò **nhắn tin chính thức (OA + ZNS)**, dựng **hộp thư hợp nhất trong hệ thống Sata Robo**, thời gian thực theo **3 nấc: polling 3–5 giây (bản đầu) → Supabase Realtime (nâng cấp, KHÔNG vendor mới) → LOẠI SSE tự dựng** (đắt nhất và ngược pattern Vercel — số liệu ở §4). Gọi điện theo kết luận tài liệu cũ (tổng đài đám mây); **mới sau xác minh:** Z-1 **đã xác nhận từ nguồn sơ cấp Zalo** (gọi OA chỉ đổ chuông TRONG app, không tới SIM), và Zalo có **MCC — tổng đài mini 0đ không cần PBX** có thể pilot làm kênh gọi PHỤ (không ghi âm ⇒ không giải được ĐG-06). **Tuyệt đối không dùng tài khoản Zalo cá nhân của nhân viên làm hạ tầng.**
10. **Việc cần làm ngay không phải viết mã, mà là đo.** §6 liệt kê **8 phép thử rẻ (≤ 2 tuần, không cần deploy)** đủ để giết hoặc xác nhận phần lớn giả định. Chi phí của việc bỏ qua bước này: 4–6 tuần công sức cho một kênh không ai dùng.

---

## 2. RESEARCH — BÊN NGOÀI

### 2.1 ZaloCRM (`github.com/locphamnguyen/ZaloCRM`) — khảo sát và cảnh báo

| Hạng mục | Kết quả khảo sát `[WEB]` |
|---|---|
| **Bản chất** | Quản lý **nhiều tài khoản Zalo CÁ NHÂN** qua một giao diện web. Đăng nhập bằng **quét mã QR**, mỗi tài khoản cấu hình proxy riêng |
| **Đường kết nối Zalo** | Thư viện **`zca-js`** (MIT) qua cầu CLI `openzca`. **Không phải Official Account API.** `zca-js` tự mô tả: *"Unofficial Zalo API… works by simulating the browser to interact with Zalo Web"* |
| **Công nghệ** | Node.js 20 · Fastify 5 · Prisma 7 · Vue 3 + Vuetify · PostgreSQL 16 · **Socket.IO** · MinIO/S3 · Redis 7 · Docker Compose |
| **Tính năng** | Chat 2 chiều kèm ảnh/video/âm thanh · CRM (chấm điểm lead, phễu 5 bậc) · lịch hẹn · báo cáo · webhook · cầu nối Zalo–Telegram · gợi ý trả lời bằng AI |
| **Giấy phép** | **AGPL-3.0** — copyleft. Triển khai dạng dịch vụ qua mạng ⇒ **phải công khai mã nguồn bản sửa đổi**. Có bán giấy phép thương mại kép |
| **Cảnh báo của chính tác giả** | *"Using automation tools may violate Zalo's Terms of Service and could result in account suspension or restrictions."* Của `zca-js`: *"could get your account locked or banned… use it at your own risk"* |
| **Hạ tầng tối thiểu** | 2 vCPU / 2GB RAM / 20GB (khuyến nghị 4 vCPU / 4GB / 40GB SSD, Ubuntu 22.04) — **máy chủ chạy liên tục**, không phải serverless |

> ### ⛔ **KHUYẾN NGHỊ: KHÔNG áp dụng mô hình ZaloCRM cho Sata Robo.** Bốn lý do, mỗi lý do tự nó đã đủ:
>
> | # | Lý do | Mức |
> |---|---|---|
> | **ZC-1** | **Rủi ro khoá tài khoản.** Kênh liên lạc với phụ huynh treo trên một tài khoản cá nhân có thể bị khoá bất cứ lúc nào, không báo trước, không khiếu nại được. Mất tài khoản = mất toàn bộ lịch sử hội thoại đang nằm ở phía Zalo | **CHẶN** |
> | **ZC-2** | **Giấy phép AGPL-3.0** va thẳng định hướng nhượng quyền. Cần ý kiến luật sư trước khi đọc dòng mã đầu tiên | **CHẶN** |
> | **ZC-3** | **Số Zalo là của nhân viên, không phải của công ty.** Nhân viên nghỉ ⇒ mang theo khách. Đây **chính là vấn đề** đang muốn giải (ĐG-06 tài liệu cũ), mô hình này làm nó **nặng thêm** | **Cao** |
> | **ZC-4** | **Kiến trúc lệch hoàn toàn.** Sata Robo là Next.js 16 serverless trên Vercel (`CLAUDE.md` Tech stack FROZEN). ZaloCRM là Fastify + Socket.IO + máy chủ thường trực. Không có phần nào tái sử dụng được ngoài **ý tưởng** | **Trung bình** |
>
> **Điều đáng học từ ZaloCRM (miễn phí, không cần mã):** mô hình dữ liệu hộp thư hợp nhất · trạng thái lead 5 bậc kèm tự-giảm-điểm theo thời gian · phát hiện "lead bị kẹt" · gợi ý trả lời bằng AI · nhật ký truy cập + mã PIN riêng tư cho hội thoại nhạy cảm. **Lấy ý tưởng, không lấy mã, không lấy đường kết nối.**

### 2.2 Zalo — bốn khái niệm dễ nhầm (bản cập nhật 2026)

| # | Kênh | Chính thức? | Chat 2 chiều | Chủ động nhắn | Ghi chú |
|---|---|---|---|---|---|
| 1 | **Tin nhắn OA** (Official Account) | ✅ | ✅ có webhook `user_send_text` `[WEB]` | ⚠️ **giới hạn có cơ chế reset** | Cửa sổ 7 ngày; **8 tin/48 giờ** mỗi hội thoại — **reset theo MỖI tương tác mới của khách**; vượt: **55đ/tin** (biểu giá 01/06/2026). ⚠️ **Open API/webhook chỉ từ gói Tăng trưởng 2,5tr/năm** `[WEB]` |
| 2 | **ZNS** (tin mẫu tới số điện thoại) | ✅ | ❌ một chiều | ✅ | **Sata Robo đang dùng** — `lib/zalo/provider.ts:15-18, 90-119` |
| 3 | **MCC** (Mini Call Center) *(mới phát hiện 29/07)* | ✅ | — thoại | — | Tổng đài mini **MIỄN PHÍ, tích hợp sẵn OA Manager, KHÔNG cần PBX/hạ tầng gì** — ghế 1/5/10 theo gói OA. Không có API/ghi âm được tài liệu hoá ⇒ chỉ đáng làm **kênh gọi phụ** (pilot 0đ) `[WEB]` |
| 4 | **ZCC** (Zalo Cloud Connect) | ✅ | — thoại | — | **SIP Trunk** nối OA ↔ tổng đài. ✅ **Z-1 ĐÃ XÁC NHẬN** (PDF chính chủ Zalo `stc-developers.zdn.vn` + 3 vendor độc lập): cuộc gọi là VoIP qua hạ tầng Zalo, **chỉ đổ chuông TRONG app Zalo, không tới SIM/PSTN**; gọi ra bắt buộc bước **xin quyền trong app** (có API gửi/kiểm tra quyền + webhook hết hạn); **có webhook kết thúc cuộc gọi**; ghi âm nằm ở PBX/vendor, **KHÔNG phải API Zalo**. "Đòi có tổng đài SIP" **hết là rào**: 6+ vendor (OMICall, VoIP24h, ePacific, MITEK…) cho thuê trọn phần SIP. Giới hạn 10.000 cuộc/DN/tháng, inbound miễn phí; gọi thoại chỉ từ gói Tăng trưởng `[WEB]` |
| 5 | **Zalo cá nhân qua `zca-js`** | ❌ | ✅ | ✅ | Đường của ZaloCRM. Xem §2.1 |

**Một OA, nhiều nhân viên — đã có lời giải chính thức (xác minh 29/07, gỡ khỏi danh sách "chưa kiểm chứng"):** OA Manager hỗ trợ tới **100 admin/OA với 6 tầng quyền** (2 vai trả lời chat được: *Soạn nội dung*, *Chăm sóc khách hàng*); có chức năng **chỉ định nhân viên xử lý từng hội thoại** + lọc theo người phụ trách — nhưng chỉ từ gói trả phí; số ghế admin theo gói mới: **3 / 5 / 15 / 100** `[WEB]`. ⚠️ **Giới hạn quyết định cho PA-1:** webhook chiều OA-gửi-tin chỉ chứa `sender.id` = **id của OA** — KHÔNG có trường nào định danh nhân viên đã gõ. Muốn attribution theo Sale/GV thì **100% tin gửi đi phải qua API của hộp thư tự xây** và phải **cấm trả lời trực tiếp trên oa.zalo.me** (giả định **U-09**, §5.2). Đây chính là lý do tồn tại của các vendor helpdesk (CareSoft, Subiz…).

**Lấy số điện thoại của khách từ hội thoại OA (xác minh 29/07):** webhook `user_send_text` **không bao giờ chứa SĐT** — chỉ có `user_id` scoped theo OA, không quy đổi ra SĐT được. Đường chính thức duy nhất: OA gửi tin **`request_user_info`** → khách bấm **"Chia sẻ thông tin"** → webhook **`user_submit_info`** trả SĐT/tên/địa chỉ (hoặc API "Truy xuất chi tiết người dùng" v3.0 trả `shared_info` sau khi khách đã đồng ý) `[WEB]`. Với AUTH-SĐT canonical của repo (`lib/phone.ts`), đây là **bước bắt buộc** để nối hội thoại Zalo ↔ `Lead`/`Student` — vừa là ma sát UX (F-02), vừa là **điểm cộng pháp lý** (§2.4).

**Thay đổi chính sách 2026 — giá ĐÃ xác minh từ trang chính chủ `zalo.solutions/oa/pricing` (gồm VAT), không còn là số bên thứ ba:** từ **01/2026** tách 2 loại tin (Tin cơ bản / ZBS); từ **01/06/2026** bốn gói mới, gói cũ ngừng gia hạn: **Cơ bản 0đ** (3 admin, KHÔNG API) · **Tiêu chuẩn 1.000.000đ/12 tháng** (5 admin, KHÔNG API) · **Tăng trưởng 2.500.000đ/12 tháng** (15 admin, Open API 100 req/phút + 3 app, gọi thoại, ~500 tin tư vấn ngoài-48h/tháng) · **Toàn diện 6.000.000đ/12 tháng** (100 admin, 2.000 req/phút, CRM, ~2.000 tin/tháng) `[WEB]`. ⚠️ Cột hạn mức tin ngoài-48h **lệch giữa các lần trích bảng** — xác minh trực tiếp trước khi chốt ngân sách. Zalo đã đổi chính sách **hai lần trong sáu tháng** — `[SUY LUẬN]` mọi dự toán phí Zalo có tuổi thọ ngắn, không đưa vào cam kết dài hạn.

### 2.3 OMICall và các tổng đài — bổ sung số liệu giá

Bảng giá công khai `[WEB] omicall.com/bang-gia` (cam kết 6 tháng, mỗi người dùng/tháng):

| Gói | Giá | Điểm khác biệt |
|---|---|---|
| **Call Center** | **200.000đ** | Gọi đa thiết bị, phiếu hỗ trợ, mini-CRM |
| **Omni Channel** | **220.000đ** | ➕ **Facebook + Zalo OA + live chat** trong cùng giao diện |
| Call Center AI | 280.000đ | ➕ tự động hoá thoại bằng AI |
| Omni Channel AI | 350.000đ | Trọn bộ |

Phí khởi tạo một lần: **800.000đ** (<10 người dùng, không AI). Cước viễn thông **không có trong bảng giá** — phải hỏi riêng.

> 💡 **Phát hiện đáng chú ý:** chênh lệch **Call Center → Omni Channel chỉ 20.000đ/người/tháng** (6 người = **120.000đ/tháng**). Nghĩa là **hộp thư Zalo OA + Facebook có sẵn** ở phía nhà cung cấp với giá gần như bằng không so với việc tự xây. Đây là lý do **PA-3** (§4) phải được cân nhắc nghiêm túc chứ không loại ngay — dù nó đánh đổi bằng việc **dữ liệu hội thoại của phụ huynh nằm ở bên thứ ba**, và va cảnh báo *"không dùng mini-CRM của nhà cung cấp"* của tài liệu cũ (§D.2.6).

### 2.4 Pháp lý — cập nhật cho phần chat (khác phần gọi)

Luật 91/2025/QH15 + NĐ 356/2025/NĐ-CP (hiệu lực 01/01/2026) `[WEB]`:

| Điểm | Nội dung | Hệ quả cho chat |
|---|---|---|
| Hình thức đồng ý hợp lệ được **mở rộng** | Bao gồm **cuộc gọi có ghi âm**, tin nhắn cú pháp, email, nền tảng điện tử có cơ chế đồng ý kỹ thuật `[WEB]` | 🟢 **Tin tốt** — có thể lấy đồng ý **ngay trong hội thoại chat**, không cần giấy. Nhưng phải **lưu được bằng chứng** (thời điểm, nội dung, danh tính) |
| Bên kiểm soát dữ liệu **phải lưu trữ sự đồng ý** | `[WEB]` | Cần một bảng đồng ý có mốc thời gian — **không phải một cột boolean** như `Lead.consentMarketing` hiện nay |
| **Cấm nghe lén, ghi âm cuộc gọi, đọc tin nhắn khi không có sự đồng ý** | `[WEB]` | ⚠️ Chạm thẳng vào **"Quản lý cơ sở đọc được hội thoại của Giáo viên với phụ huynh"** — §5, **B-05** |
| Dữ liệu trẻ em | Điều 19 (đã nêu ở tài liệu cũ §E.1.3) | Hội thoại GV↔PH **luôn** nói về trẻ. Toàn bộ luồng chat này là dữ liệu trẻ em theo mặc định |
| **Luồng "Chia sẻ thông tin" của Zalo OA** *(bổ sung sau xác minh 29/07)* | `request_user_info` → khách bấm **"Chia sẻ thông tin"** → webhook `user_submit_info` trả SĐT `[WEB]` | 🟢 Đúng nghĩa **"cơ chế đồng ý kỹ thuật" lưu vết được** theo NĐ 356 — vừa là đường lấy SĐT hợp lệ duy nhất (F-02), vừa là **bằng chứng đồng ý thật** thay cho `consentMarketing` giả (ĐG-02) trên kênh Zalo |

---

## 3. HIỆN TRẠNG — CÁI GÌ ĐÃ CÓ, CÁI GÌ KHÔNG

### 3.1 Bốn kênh liên lạc rời rạc đang tồn tại

| Kênh | Model | Ai dùng | Trạng thái thật |
|---|---|---|---|
| **Chat PH ↔ nhân viên theo đăng ký học** | `ConversationMessage` (`prisma/schema.prisma:5029-5047`) | Phụ huynh (portal) ↔ STAFF | ✅ **ĐANG CHẠY.** Có đánh dấu đã đọc 2 phía, thông báo qua `DomainEvent "conversation.message_posted"`, liền mạch khi chuyển lớp (`lib/conversation/service.ts:90-119`), giới hạn 2000 ký tự, giáo viên chỉ đọc luồng lớp mình (`opts.classIds`) |
| **Yêu cầu của phụ huynh** | `ParentRequest` (`:3771-3792`) | Phụ huynh → nhân viên xử lý | ✅ đang chạy — dạng **phiếu**, không phải chat |
| **Messenger Page Facebook** | `MessengerConversation` / `MessengerMessage` (`:477-513`) | Marketing/Sale Admin ↔ khách mới | 🟡 **Nhận được, KHÔNG GỬI ĐƯỢC** — `lib/crm/messenger-service.ts:106-122` chỉ ghi vào CSDL (ĐG-14) |
| **Zalo ZNS** | `ZaloMessageLog` | Hệ thống → phụ huynh | 🟡 một chiều, chỉ tin mẫu đã duyệt; live khi `ZALO_LIVE=true` |

> **Kết luận quan trọng:** đề bài nói "xây chat", nhưng **chat PH↔GV đã có và đã chạy**. Câu hỏi đúng không phải *"xây thế nào"* mà là **_"cái đang có hỏng ở đâu?"_** — §6, phép thử **T-1**.

**Bề mặt giao diện đã xác minh của kênh chat đang có (kiểm chứng 29/07):**

- **Portal:** `app/(portal)/portal/tin-nhan/page.tsx` — danh sách luồng theo con, badge chưa đọc 2 cấp (badge nav ở `app/(portal)/portal/layout.tsx:46` + badge từng luồng); gửi tin qua server action rồi `router.refresh()`.
- **Admin:** `app/(admin)/admin/tin-nhan/page.tsx` — hộp thư theo học viên trong scope (`scopedDb`), badge `unreadFromParent` từng học viên; **GV dùng được** với `classes:view-own`, scope `assignedClassIds` (`page.tsx:53-55`).
- **Site giáo viên: KHÔNG có màn chat nào** — `app/(teacher)/` không có surface nào đụng `ConversationMessage`; GV muốn nhắn PH phải **rời site GV sang site admin**.
- **ParentRequest:** đủ 2 đầu — portal tạo (`app/(portal)/portal/yeu-cau/`, 8 loại đơn) + admin xử lý (`app/(admin)/admin/parent-requests/`); site GV cũng **không** xử lý ParentRequest (mục `don-tu` của GV là đơn từ nội bộ nhân sự, không chạm PH).

**Bốn điểm yếu UX đã xác minh — "nghi phạm" cụ thể cho phép thử T-1:**

| # | Điểm yếu | Bằng chứng |
|---|---|---|
| 1 | **GV không có lối vào chat từ site giáo viên** (site vừa go-live 10/07 — flag `TEACHER_SITE_ENABLED`) — ứng viên số 1 giải thích "vì sao GV không dùng" | grep `app/(teacher)` = 0 surface chat |
| 2 | **Không ai thấy tin mới nếu không tự điều hướng** — mọi badge/luồng tính lúc render server, không poll, không push; PH đang mở `/portal/tin-nhan` **không thấy** GV trả lời cho tới khi bấm sang trang khác | cả 2 trang tin-nhắn là RSC `force-dynamic`, 0 `setInterval` |
| 3 | Sidebar admin **không có badge chưa đọc** cho chat (badge chỉ nằm bên trong trang `/tin-nhan`) | `components/admin/sidebar.tsx:150` |
| 4 | Chuông thông báo admin **có poll 60 giây** nhưng **không đếm tin chat** — hạ tầng "gần realtime" đã có mà chat không cắm vào | `components/admin/notification-bell.tsx:36-40` |

### 3.2 Cái gì KHÔNG có

| # | Thiếu | Bằng chứng | Mức |
|---|---|---|---|
| **K-1** | **Kênh ĐẨY (push) thời gian thực** — không websocket/SSE/pusher/supabase-js *(đính chính 29/07: bản trước viết "bất kỳ hạ tầng realtime nào" — sai, polling đã có)* | Đã quét toàn repo + `package.json`. **Polling đã có tiền lệ:** chuông admin 60s (`components/admin/notification-bell.tsx:36-40`), SCORM 4s | **CHẶN cho push — polling là đường sẵn có** |
| **K-2** | **Hộp thư hợp nhất** — 4 kênh trên không có màn hình chung (ĐG-11 tài liệu cũ) | `prisma/schema.prisma:477, 3771, 4724, 5029` *(đã sửa 2 số dòng sai 29/07)* | Cao |
| **K-3** | **Vai "Quản lý lớp học" trong ma trận v1 ĐANG enforce** *(đính chính 29/07: vai này ĐÃ tồn tại ở v2)* | RoleDef v2 `CENTER_CLASS_MANAGER` **đã có** (`prisma/seed-roles.ts:397`, 5 quyền, chưa gán ai) nhưng KHÔNG nằm trong enum v1 9 vai | Cao — quyền chat cho vai này **treo trên việc lật cờ RBAC v2** (B-09) |
| **K-4** | **Chat 2 chiều với Zalo OA** | `lib/zalo/` chỉ có ZNS + token | Cao |
| **K-5** | **Bảng cuộc gọi + lớp bọc tổng đài + webhook cuộc gọi** | TQ-1…TQ-5 tài liệu cũ | **CHẶN cho "gọi"** |
| **K-6** | **Đường chạy lại `DomainEvent` thất bại** | ĐG-20 tài liệu cũ | Cao — thông báo chat đi qua sự kiện; sự kiện `FAILED` = **mất im lặng** |
| **K-7** | **Kiểm chứng bẫy thông báo nhân viên** | ĐG-21 (`lib/staff-notifications.ts:70-81`) | Cao — cùng lý do K-6 |
| **K-8** | **Đẩy thông báo lên điện thoại** (web push / PWA) | Đã quét toàn repo 29/07: **0** service worker / manifest / PushManager / next-pwa. ⚠️ `lib/auth/route-policy.ts:190` whitelist `/manifest.json` cho một file **không tồn tại** — dead code, đừng hiểu nhầm là đã có PWA | Cao — **chat không có thông báo đẩy = chat chết**, §5 **U-04** |
| **K-9** | **Tầng cổng dịch vụ ngoài `modules/integration`** | `CLAUDE.md:72`; `.dependency-cruiser.cjs:76-85` khớp 0 file | Nợ kiến trúc (Q4 tài liệu cũ) |

### 3.3 Ràng buộc kiến trúc phải tôn trọng

| Ràng buộc | Nguồn | Hệ quả cho chat/gọi |
|---|---|---|
| Server-first, **cấm `useEffect` để lấy dữ liệu** | `CLAUDE.md` §1 + Don'ts | Tiền lệ ngoại lệ **đã tồn tại** (chuông thông báo poll 60s bằng `useEffect`+`setInterval`) ⇒ chat chỉ **mở rộng tiền lệ có kiểm soát** — vẫn nên ghi thành quyết định, nhưng không phải xin phá luật từ đầu |
| `scopedDb` **chỉ tự động cách ly ĐỌC** | `CLAUDE.md` §5; `lib/db-scope.ts` | Mọi lệnh tạo tin nhắn/cuộc gọi **phải tự đặt `centerId`** |
| `ConversationMessage.centerId` **đang pha A, còn nullable** | `prisma/schema.prisma:5040-5043`; `lib/conversation/service.ts:45-60` | Đường tạo mới quên đặt ⇒ tin nhắn **vô hình** sau khi flip pha B |
| Cửa sổ shadow-compare RBAC **chưa chạy** | `[FILE] docs/ke-hoach-go-live-2607/shadow-log.md:22-23` | Thêm quyền `chat:*` / `calls:*` lúc này ⇒ **đẻ lệch giả hàng loạt** (Q5 tài liệu cũ) |
| Deadline go-live **26/07/2026 vừa qua**, đội còn **3 người** | `[FILE] docs/ke-hoach-go-live-2607/README.md`; bộ nhớ dự án | Năng lực thực thi là ràng buộc cứng — §5 **B-08** |

---

## 4. BỐN PHƯƠNG ÁN

> Cả bốn đều **giữ nguyên** kết luận về gọi điện của tài liệu cũ (tổng đài đám mây, không phải Zalo). Khác nhau ở **kênh chat**.

### PA-0 — "Đo trước, sửa cái đang có" (2 tuần, gần như không viết mã mới)

Không xây kênh mới. Làm 3 việc: (1) đo mức sử dụng thật của `ConversationMessage` và `ParentRequest`; (2) vá ĐG-14 (gửi tin Messenger thật); (3) vá ĐG-02 (đồng ý marketing giả).
**Được:** rẻ nhất, gỡ rào pháp lý, có dữ liệu để quyết định đúng. **Mất:** không có tính năng mới. **Rủi ro:** thấp nhất.
→ **PA-0 là điều kiện tiên quyết của cả ba phương án còn lại, không phải một lựa chọn thay thế.**

### PA-1 — Hộp thư hợp nhất trong nhà + Zalo OA chính thức ⭐ **KHUYẾN NGHỊ**

- **Kênh:** Zalo OA chính thức (webhook `user_send_text`) + Messenger (vá ĐG-14) + chat portal đang có → **một hộp thư hợp nhất** trong `/admin`, phân luồng theo cơ sở + vai trò.
- **Điều kiện tiên quyết (xác minh 29/07):** OA xác thực + **gói Tăng trưởng ≥ 2,5 triệu đ/12 tháng** — gói Cơ bản/Tiêu chuẩn **KHÔNG có Open API/webhook** `[WEB]`.
- **Thời gian thực — 3 nấc, chọn từ rẻ lên** *(viết lại sau kiểm chứng — bản trước khuyến nghị SSE là SAI về kinh tế)*:
  1. **Polling 3–5 giây** (endpoint nhẹ trả tin sau con trỏ, KHÔNG `router.refresh()` cả trang) — 0 hạ tầng mới, đạt mục tiêu ≤5 giây, mở rộng tiền lệ chuông admin 60s. **Mặc định bản đầu.** Ước phí: 100 người dùng poll 5s ≈ 5,2 triệu invocation/tháng ≈ **~3 USD/tháng** trên Vercel Pro `[WEB]`.
  2. **Supabase Realtime — Broadcast from Database** (trigger Postgres → broadcast): hoạt động nguyên vẹn với ghi qua Prisma/Server Action (mọi enforce scopedDb + RBAC giữ nguyên phía server — trigger là cơ chế thuần DB), nằm trong **danh sách provider Vercel chính thức khuyến nghị**, và là cách **Supabase 2026 chính thức khuyên** (Broadcast, không dùng Postgres Changes — có vách đá hiệu năng ~3.000 subscriber). Free tier: 200 kết nối đồng thời + 2M tin/tháng (Pro 25 USD: 500 + 5M) `[WEB]`. ⚠️ Open item: kênh private cần **JWT Supabase** — nối Auth.js session → JWT Supabase là bước tích hợp chưa có tài liệu chính thức (phép thử T-5).
  3. **SSE tự dựng trên Vercel — LOẠI:** Vercel KB chính thức: functions *"should not subscribe to data events"*; stream bị cắt cứng ở maxDuration (300s Hobby / 800s Pro); Fluid tính **Provisioned Memory theo wall-clock cho mọi stream đang mở** — vùng `hnd1` của dự án thuộc nhóm đắt nhất (~0,0167 USD/GB-giờ, cao hơn `iad1` ~57%; 1 instance 2GB giữ 24/7 ≈ 24 USD/tháng) `[WEB]`. (WebSocket native Vercel: Public Beta từ 22/06/2026, Next.js chỉ qua API experimental, vẫn chết ở maxDuration — **chưa dùng cho production 2026**.)
- **Gọi:** theo tài liệu cũ (OMICall/Stringee), làm **sau**. **Mới (xác minh 29/07):** có thể pilot **Zalo MCC 0đ** (tổng đài mini trong OA Manager, không cần PBX) làm kênh gọi PHỤ cho nhóm PH thân thiết — nhưng **không ghi âm, không API** ⇒ không giải được ĐG-06, không thay tổng đài.
- **Được:** dữ liệu phụ huynh ở lại Sata Robo · một nguồn sự thật · sẵn sàng nhượng quyền · dùng lại `WebhookDelivery`, `DomainEvent`, `scopedDb` đã có.
- **Mất:** công sức lớn nhất (ước lượng thô **6–10 tuần** sau PA-0, đội kỹ thuật phải ước lượng lại) · **attribution nhân viên chỉ tồn tại khi 100% tin gửi đi qua API của hộp thư mình** — webhook Zalo không cho biết ai gõ trên OA Manager ⇒ phải cấm trả lời trực tiếp trên `oa.zalo.me` (giả định **U-09**).
- **Rủi ro chính** *(viết lại)*: không **CHỦ ĐỘNG** nhắn ngoài cửa sổ 48h/7 ngày được — thông báo một chiều (nhắc phí, đổi lịch) phải phối hợp ZNS. Hội thoại 2 chiều thì nhẹ hơn bản thảo trước: hạn mức 8 tin **tự reset theo mỗi tương tác của khách**.

### PA-2 — Mô hình ZaloCRM (tài khoản Zalo cá nhân qua `zca-js`) ⛔ **KHÔNG KHUYẾN NGHỊ**

Xem §2.1. Chặn bởi **ZC-1** (khoá tài khoản) và **ZC-2** (AGPL-3.0). Chỉ đưa vào đây để ghi rõ **đã cân nhắc và loại**, kèm lý do — nếu Ban giám đốc vẫn muốn, phải có ý kiến luật sư về AGPL và chấp nhận bằng văn bản rủi ro mất kênh liên lạc.

### PA-3 — Thuê hộp thư của OMICall (gói Omni Channel)

- Mua thẳng gói **220.000đ/người/tháng**: Zalo OA + Facebook + live chat + thoại trong một giao diện. Sata Robo chỉ **đồng bộ siêu dữ liệu** về (ai gọi/nhắn ai, khi nào, kết quả) — **không** đồng bộ nội dung.
- **Được:** nhanh nhất (tuần chứ không phải tháng) · rẻ · nhà cung cấp gánh việc chạy theo chính sách Zalo đổi liên tục.
- **Mất:** nội dung hội thoại **phụ huynh và trẻ em nằm ở bên thứ ba** ⇒ phát sinh hợp đồng xử lý dữ liệu, câu hỏi máy chủ đặt ở đâu · nhân viên làm việc trên **hai hệ thống** · va cảnh báo "hai nguồn sự thật" của tài liệu cũ · **cơ sở nhượng quyền** dùng chung tài khoản nhà cung cấp là bài toán chưa có lời giải.
- **Rủi ro chính:** phụ thuộc nhà cung cấp ở đúng chỗ nhạy cảm nhất (dữ liệu trẻ em).

### Bảng chọn nhanh

| Tiêu chí | PA-0 | **PA-1** | PA-2 | PA-3 |
|---|:--:|:--:|:--:|:--:|
| Thời gian tới giá trị đầu tiên | 2 tuần | 6–10 tuần | 3–5 tuần | 2–4 tuần |
| Rủi ro pháp lý | ⬇️ giảm | Thấp | ⛔ Cao | Trung bình |
| Rủi ro mất kênh | Không | Thấp | ⛔ Cao | Trung bình |
| Dữ liệu ở đâu | Sata Robo | **Sata Robo** | Zalo + máy chủ tự vận hành | Bên thứ ba |
| Sẵn sàng nhượng quyền | — | ✅ | ⛔ (AGPL) | ⚠️ chưa rõ |
| Công sức đội kỹ thuật | Rất thấp | **Cao** | Trung bình | Thấp |
| Chi phí nền tảng Zalo/năm *(xác minh 29/07)* | 0 | **2,5tr — gói Tăng trưởng, bắt buộc cho Open API** | 0 (đổi bằng rủi ro khoá tài khoản) | Gói OA vẫn cần cho kênh Zalo của vendor — **hỏi vendor ai trả** |

---

## 5. PHÂN TÍCH GIẢ ĐỊNH — PHẦN CHÍNH

> Phương pháp: nhìn từ **ba góc** (Quản lý sản phẩm · Thiết kế · Kỹ thuật), phân theo **bốn nhóm rủi ro** (Giá trị · Khả dụng · Khả thi kinh doanh · Khả thi kỹ thuật). Cột **Tin cậy** = mức tin của người viết vào việc *giả định đó ĐÚNG*: **Thấp** = rất có thể sai, phải thử ngay.

### 5.1 GIÁ TRỊ — "Có tạo ra giá trị thật không?"

| Mã | Giả định đang được mặc nhiên chấp nhận | Điều gì có thể sai | Tin cậy | Cách thử |
|---|---|---|---|---|
| **V-01** | Phụ huynh **muốn** nhắn tin trong hệ thống của Sata Robo | Kênh chat PH↔GV **đã tồn tại và đang chạy** (`ConversationMessage`). Nếu số tin nhắn 90 ngày qua gần bằng 0 thì giả định này **đã bị thực tế bác bỏ rồi** — và kênh mới sẽ chết y hệt | 🔴 **Thấp** | **T-1** — truy vấn: số tin, số phụ huynh hoạt động, thời gian phản hồi trung vị, tỷ lệ luồng chết. **Làm trước mọi thứ khác** |
| **V-02** | Phụ huynh sẵn sàng rời Zalo để vào portal | Zalo là nơi phụ huynh Việt Nam đã ở. Bắt họ đăng nhập một web khác để đọc tin = **ma sát cao hơn giá trị** | 🔴 **Thấp** | **T-2** — hỏi 15 phụ huynh: "Nếu cô giáo nhắn qua Zalo và qua portal, chị đọc cái nào?" |
| **V-03** | Giáo viên **muốn** chat với phụ huynh | Giáo viên được trả lương để **dạy**. Chat là việc phát sinh không được tính công. Nếu GV không muốn, kênh chết bất kể xây tốt đến đâu | 🟡 Trung bình | **T-3** — hỏi 5 GV: hiện đang liên lạc PH bằng gì, mấy lần/tuần, phiền nhất ở đâu |
| **V-04** | "Realtime" là thứ khách hàng cần | `[SUY LUẬN]` Nhu cầu thật gần như chắc chắn là **"được trả lời trong X phút"** (SLA), không phải "tin hiện ra tức thì". Nhầm hai cái này ⇒ tiêu tiền vào hạ tầng WebSocket rồi vẫn bị chê chậm vì **không ai trực** | 🔴 **Thấp** | **T-4** — nhìn dữ liệu ĐG-07: SLA-0 (5 phút) hiện **không hề chạy**. Hỏi: mục tiêu phản hồi là bao lâu? |
| **V-05** | Bốn vai trò nên dùng **chung một kênh** | Sale nói với **người chưa mua**; GV nói với **người đã mua, về con họ**. Trộn ⇒ Sale thấy chuyện học của trẻ, GV thấy chuyện tiền. Vừa sai quyền, vừa sai nghiệp vụ | 🔴 **Thấp** | **T-5** — vẽ 10 tình huống thật, đánh dấu tình huống nào **thật sự** cần cả 4 vai |
| **V-06** | "Gọi qua Zalo" giải quyết vấn đề đang có | Vấn đề thật (ĐG-06) là **cuộc gọi không được ghi lại ở đâu cả** — Sale gọi bằng SIM cá nhân. Cái đó **bất kỳ tổng đài nào** cũng giải được; đi qua Zalo hay không **không liên quan** | 🟡 Trung bình | **T-6** — hỏi lại Ban: điều phiền nhất là *cước gọi*, *không có bản ghi*, hay *khách không bắt máy số lạ*? Ba câu trả lời ⇒ ba giải pháp khác nhau |
| **V-07** | Hộp thư hợp nhất tạo giá trị **đủ lớn** để bù công sức | `[SUY LUẬN]` Với quy mô hiện tại (HO + 2 cơ sở, 6 nhân viên kinh doanh), tổng thời gian tiết kiệm có thể **nhỏ hơn** 6–10 tuần công sức | 🟡 Trung bình | **T-7** — đếm: mỗi ngày nhân viên mở bao nhiêu kênh, mất bao nhiêu phút |
| **V-08** | Quản lý cơ sở cần **đọc** hội thoại GV↔PH | Có thể chỉ cần **chỉ số** (số tin chưa trả lời, thời gian phản hồi), không cần **nội dung**. Đọc nội dung mở ra rủi ro pháp lý B-05 mà **có thể không cần** | 🟡 Trung bình | **T-8** — hỏi Quản lý cơ sở: "chị cần **biết** hay cần **đọc**?" |

### 5.2 KHẢ DỤNG — "Người dùng có dùng nổi không?"

| Mã | Giả định | Điều gì có thể sai | Tin cậy | Cách thử |
|---|---|---|---|---|
| **U-01** | Phụ huynh biết **nên hỏi ai** | Phụ huynh không quan tâm sơ đồ tổ chức. Họ nhắn một chỗ và mong được trả lời. Nếu bắt chọn "hỏi Giáo viên / Quản lý / Kinh doanh" ⇒ chọn sai ⇒ **không ai nhận việc** | 🟡 Trung bình | Thử giấy với 5 phụ huynh: đưa 6 câu hỏi thật, xem họ định gửi cho ai |
| **U-02** | Nhân viên chịu mở **thêm** một hộp thư | Đây sẽ là kênh **thứ tư hoặc thứ năm** (Zalo cá nhân, Messenger, portal, điện thoại). Kênh mới không thay thế cái nào ⇒ **bị bỏ qua** | 🔴 **Thấp** | Đếm số kênh mỗi vai đang mở hằng ngày. Nếu kênh mới không **đóng** được ít nhất một kênh cũ ⇒ thiết kế lại |
| **U-03** | Trả lời ngoài giờ là chấp nhận được | Phụ huynh nhắn 22h. GV thấy thông báo. Không có chính sách giờ làm ⇒ hoặc GV kiệt sức, hoặc phụ huynh thất vọng | 🟡 Trung bình | Chốt **giờ phục vụ** + trả lời tự động ngoài giờ **trước khi** bật kênh |
| **U-04** | Có màn hình chat là đủ | **Không có đẩy thông báo lên điện thoại (K-8) thì chat chết.** GV không ngồi máy tính. Web push trên iOS Safari đòi cài PWA vào màn hình chính — **rào cản rất cao với người dùng phổ thông** | 🔴 **Thấp** | Thử: 3 GV cài PWA + bật thông báo. Đếm bao nhiêu người làm được **không cần hỗ trợ** |
| **U-05** | Bấm-gọi trên trình duyệt dùng được ngay | SDK web của OMICall **chỉ cài qua CDN**, tài liệu ghi "React 18+", dự án chạy **React 19**, và quy ước dự án là server-first (câu hỏi #8 tài liệu cũ) | 🟡 Trung bình | Dựng thử trang mẫu React 19 + SDK trước khi cam kết |
| **U-06** | Hội thoại theo **đăng ký học** là đơn vị đúng | ✅ **ĐÃ KIỂM 29/07:** cả portal lẫn admin đều hiển thị **gộp theo học viên** (`getThreadForStudent`) — portal chọn luồng theo `?e=<enrollmentId>` nhưng người dùng nhìn thấy theo con | 🟢 Cao (đã xác minh) | — xong, không cần thử thêm |
| **U-07** | Bàn giao hội thoại khi GV nghỉ/đổi lớp là chuyện nhỏ | GV nghỉ giữa khoá ⇒ ai kế thừa luồng? Phụ huynh có được báo không? `opts.classIds` giới hạn GV theo lớp — đổi lớp là **mất quyền đọc lịch sử** | 🟡 Trung bình | Diễn tập tình huống "GV nghỉ đột xuất" trên môi trường thử |
| **U-08** | Gửi ảnh/tệp là tính năng phụ | Phụ huynh **sẽ** gửi ảnh (bài làm, giấy khám bệnh, ảnh con). Ảnh trẻ em ⇒ chạm `StudentConsent` + quét mã độc + hạn lưu. **Không có kế hoạch = có lỗ hổng** | 🟡 Trung bình | Quyết định sớm: cho gửi tệp hay chặn hoàn toàn ở bản đầu |
| **U-09** *(mới sau xác minh 29/07)* | Nhân viên sẽ **chỉ trả lời trong hộp thư nội bộ**, không mở `oa.zalo.me` | Webhook Zalo **không định danh nhân viên** gõ trên OA Manager — chỉ một người "tiện tay" trả lời trên đó là mất attribution + hộp thư nội bộ lệch dữ liệu. Kỷ luật vận hành thuần tuý, kỹ thuật không chặn hết được | 🔴 **Thấp** | Thu hẹp vai OA Manager của nhân viên xuống mức **không trả lời chat được** (giữ 2 vai chat cho tài khoản hệ thống) + quy định thành văn |

### 5.3 KHẢ THI KINH DOANH — "Marketing/Kinh doanh/Tài chính/Pháp chế đỡ được không?"

| Mã | Giả định | Điều gì có thể sai | Tin cậy | Cách thử |
|---|---|---|---|---|
| **B-01** | Mô hình ZaloCRM dùng được | Đường kết nối **không chính thức**, chính tác giả cảnh báo khoá tài khoản `[WEB]` | 🔴 **Rất thấp** | Đã kết luận §2.1 — **loại**, trừ khi Ban chấp nhận rủi ro bằng văn bản |
| **B-02** | Giấy phép mã nguồn mở không thành vấn đề | **AGPL-3.0** + định hướng nhượng quyền = nghĩa vụ công khai mã | 🔴 **Rất thấp** | Hỏi luật sư. **Câu hỏi Q10 mới** |
| **B-03** | Chi phí Zalo dự đoán được | *(Hạ mức lo sau xác minh 29/07:)* hạn mức 8 tin/48h **tự reset theo mỗi tương tác của khách** ⇒ hội thoại 2 chiều ≈ 0đ; chỉ **độc thoại chủ động** tính phí **55đ/tin** (biểu giá 01/06/2026) `[WEB]`. Còn mờ duy nhất: cột hạn mức "tin ngoài 48h" theo gói lệch giữa các nguồn. Zalo vẫn đổi chính sách 2 lần/6 tháng | 🟡 Trung bình (đã có số) | Tính thẳng: (số thông báo chủ động/tháng) × 55đ, đối chiếu hạn mức gói Tăng trưởng (~500 tin/tháng); tách 2 kịch bản hội thoại 2 chiều (≈0đ) vs thông báo 1 chiều (ZNS/tin trả phí). Xác minh trực tiếp bảng giá trước khi chốt ngân sách |
| **B-04** | Đã có cơ sở pháp lý để nhắn/gọi khách | **`consentMarketing` đang bị ghi đè cứng = true** (`lib/lead/ingest.ts:70`). Cơ sở pháp lý hiện tại **là giả** | 🔴 **Rất thấp** | Đếm số lead có đồng ý **thật** vs bị gán. **Vá trước khi bật kênh** |
| **B-05** | Quản lý cơ sở đọc hội thoại GV↔PH là bình thường | NĐ 356/2025 nêu rõ **không được đọc tin nhắn khi không có sự đồng ý** `[WEB]`. Phụ huynh nhắn GV có biết quản lý đọc được không? | 🔴 **Thấp** | Hỏi luật sư (**câu 4** cho luật sư, bổ sung vào §E.1.4 tài liệu cũ) + ghi rõ trong chính sách bảo mật |
| **B-06** | Một OA dùng chung cho mọi cơ sở | Nhượng quyền: cơ sở tỉnh khác dùng OA của ai? Hội thoại thuộc về ai khi chấm dứt hợp đồng? **Chưa có lời giải** (R-DP-01 đang treo) | 🟡 Trung bình | Chốt cùng câu Q7 tài liệu cũ, **trước** khi thiết kế bảng |
| **B-07** | Nội dung hội thoại để ở bên thứ ba là chấp nhận được (PA-3) | Nội dung nhắc tên trẻ, lớp, tình hình học ⇒ dữ liệu trẻ em ở hạ tầng ngoài. Nếu máy chủ ngoài Việt Nam ⇒ hồ sơ chuyển dữ liệu xuyên biên giới, phạt **5% doanh thu năm trước** | 🔴 **Thấp** | Câu hỏi bắt buộc cho nhà cung cấp: máy chủ đặt ở đâu, có hợp đồng xử lý dữ liệu không |
| **B-08** | Đội có năng lực làm trong quý này | Đội còn **3 người**, vừa qua mốc go-live 26/07, còn tồn đọng: shadow-compare RBAC chưa chạy, ĐG-01…ĐG-21 chưa vá, `modules/*` chưa dựng | 🔴 **Thấp** | Xếp PA-1 lên lịch **cạnh** việc tồn đọng, không phải **thay thế**. Nếu không vừa ⇒ chọn PA-3 hoặc lùi |
| **B-09** | Thêm quyền `chat:*` / `calls:*` lúc này là an toàn | Cửa sổ shadow-compare **chưa bắt đầu đếm**. Thêm quyền mới vào ma trận tĩnh mà chưa nạp `RolePermission` ⇒ **đẻ lệch giả hàng loạt**, có thể **treo vô hạn** việc lật cờ RBAC v2 | 🔴 **Thấp** | Giai đoạn đầu **mượn quyền đã có** (`leads:*`, `students:*`), tách quyền riêng sau khi lật cờ (Q5) |
| **B-10** | Tự xây rẻ hơn thuê | Chênh Call Center → Omni Channel chỉ **120.000đ/tháng cho 6 người** = **1,44 triệu/năm**. 6–10 tuần công sức đội nội bộ đắt hơn nhiều lần | 🟡 Trung bình | So sánh thẳng: 1,44 triệu/năm vs chi phí cơ hội của 6–10 tuần |

### 5.4 KHẢ THI KỸ THUẬT — "Xây được không, bằng cái đang có?"

| Mã | Giả định | Điều gì có thể sai | Tin cậy | Cách thử |
|---|---|---|---|---|
| **F-01** | Thêm chat realtime là thêm một màn hình | *(Cập nhật 29/07 — đường đi đã rõ:)* **SSE tự dựng là lựa chọn TỆ NHẤT về kinh tế** (cắt ở maxDuration 300/800s, Provisioned Memory tính wall-clock, `hnd1` đắt); WebSocket Vercel mới **Public Beta** + API experimental trong Next.js. Lối đúng: polling 3–5s (tiền lệ chuông admin có sẵn) → Supabase Realtime Broadcast `[WEB]` | 🟡 Trung bình (đường đã rõ, còn thi công) | **T-5 (đã đổi):** spike Supabase Realtime Broadcast-from-Database — trigger trên bảng tin nhắn, đo message count/kết nối so quota free (200 conn / 2M tin), thử nối Auth.js → JWT Supabase |
| **F-02** | Zalo OA nhận diện được khách là ai | ✅ **ĐÃ XÁC NHẬN 29/07 là giới hạn thật, có workaround chính thức:** webhook `user_send_text` CHỈ chứa `user_id` scoped theo OA — **không bao giờ có SĐT**. Đường duy nhất: tin `request_user_info` → khách bấm "Chia sẻ thông tin" → webhook `user_submit_info` trả SĐT (hoặc API `shared_info` sau khi đã đồng ý) `[WEB]` | 🟢 Cao (cơ chế đã rõ) | **T-6 (đã đổi):** thử end-to-end luồng chia sẻ SĐT — đo tỷ lệ khách chịu bấm, lưu bằng chứng đồng ý vào bảng consent (nối B-04/ĐG-02) |
| **F-03** | Nhắn chủ động cho phụ huynh được | Cửa sổ **7 ngày** + **8 tin/48h**. Nhắc học phí, báo đổi lịch ⇒ phần lớn rơi ngoài cửa sổ ⇒ **phải dùng ZNS tin mẫu tính phí** | 🟢 Cao (giới hạn là thật) | Đã có nguồn `[WEB]`; xác nhận lại với đại lý Zalo |
| **F-04** | Gọi qua Zalo tới được điện thoại khách | ✅ **Z-1 ĐÃ XÁC NHẬN 29/07 từ nguồn sơ cấp** (PDF kết nối ZCC của chính Zalo + 3 vendor độc lập): gọi OA là VoIP qua hạ tầng Zalo, **chỉ đổ chuông TRONG app**, không tới SIM; gọi ra bắt buộc bước xin quyền trong app. "Đòi tổng đài SIP" **hết là rào**: 6+ vendor cho thuê trọn phần SIP, và **MCC 0đ không cần PBX** `[WEB]` | 🟢 Cao (đã xác nhận — Zalo KHÔNG thay được tổng đài) | **F0-11 thu hẹp còn:** đăng nhập đọc tay 5 trang API `goi-thoai` trên `developers.zalo.me` — payload webhook + giá vượt hạn mức (§9 mục 2) |
| **F-05** | Thông báo chat sẽ tới tay người nhận | Thông báo đi qua `DomainEvent` → **không có đường chạy lại khi thất bại (K-6)** + **bẫy tự-đánh-dấu-đã-đọc (K-7)**. Tin nhắn có thể **im lặng biến mất** | 🔴 **Thấp** | Viết test tái hiện ĐG-21 **trước khi** thiết kế thông báo |
| **F-06** | Cách ly cơ sở tự động lo | `scopedDb` **chỉ che ĐỌC**. Mọi lệnh tạo tin nhắn phải tự đặt `centerId`; `ConversationMessage.centerId` **còn nullable (pha A)** — quên đặt = tin nhắn vô hình sau pha B | 🟢 Cao (đã biết rõ) | Test CI bắt buộc: "CS1 không thấy hội thoại CS2" |
| **F-07** | Giáo viên chỉ thấy lớp mình là đủ chặt | `getThreadForStudent(studentId, {classIds})` — nhưng đây là **entitlement do caller gác** (`lib/conversation/service.ts:85-89`). Một màn hình mới quên truyền `classIds` = **rò toàn bộ** | 🟡 Trung bình | Rà mọi nơi gọi + thêm test IDOR |
| **F-08** | Tệp đính kèm là việc dễ | Ảnh/âm thanh vào R2 · liên kết hạn ngắn · quét mã độc · hạn lưu · quyền xoá theo yêu cầu (`lib/compliance/erasure.ts` đã đụng `ConversationMessage`) | 🟡 Trung bình | Quyết định bản đầu: **chặn tệp**, chỉ chữ |
| **F-09** | Webhook Zalo an toàn và không trùng | Zalo giới hạn ~10 yêu cầu/giây, yêu cầu HTTPS + bật xác thực MAC `[WEB]`. Có mẫu tốt sẵn (`lib/crm/meta-webhook.ts:8-19` + `WebhookDelivery`) | 🟢 Cao (giải được) | Dùng lại mẫu Meta, không viết mới |
| **F-10** | Token Zalo OA sống lâu | `lib/zalo/token.ts` đã có tự làm mới + thử lại khi lỗi auth (`provider.ts:111-116`). Nhưng OA chat 2 chiều cần **quyền khác** ZNS ⇒ phải cấp lại quyền | 🟡 Trung bình | Kiểm tra nhóm quyền OA hiện có trước khi ước lượng |
| **F-11** | Có thể xây song song việc đang tồn đọng | `modules/integration` chưa có (K-9) ⇒ tích hợp mới lại đẻ thêm một đường gọi rời rạc, đúng thứ audit nội bộ đang cảnh báo (17 file gọi thẳng bên ngoài) | 🟡 Trung bình | Chốt câu Q4 **trước** dòng mã đầu tiên |

### 5.5 Xếp ưu tiên — thử cái nào trước

Trục dọc = **hậu quả nếu giả định sai**; trục ngang = **mức không chắc chắn**.

```
        CAO │  V-02  V-05  F-01  │  ★ V-01  ★ B-04  ★ U-09
  Hậu quả  │  U-01  F-07  F-02  │  ★ B-01  ★ B-02
   nếu sai │  B-06  F-10  F-04  │  ★ U-04  ★ F-05  ★ B-09
        ─── ├────────────────────┼────────────────────────────
        THẤP│  U-06  F-09  B-03  │  V-07  U-08  F-08
            └────────────────────┴────────────────────────────
               Chắc chắn hơn        KHÔNG CHẮC CHẮN
```

**Tám giả định ô ★ (trên–phải) phải thử trước khi cam kết bất cứ điều gì:** `V-01` `B-04` `U-09` `B-01` `B-02` `U-04` `F-05` `B-09`.

> *Dịch chuyển sau vòng kiểm chứng 29/07:* `F-01` `F-02` `F-04` `B-03` đã **chuyển sang cột trái** (mức không chắc chắn giảm mạnh nhờ nguồn sơ cấp); `U-09` mới xuất hiện và vào thẳng ô ★ — nó là rủi ro vận hành thuần con người, không thử bằng tài liệu được.

---

## 6. TÁM PHÉP THỬ RẺ — 2 tuần, không cần deploy

| # | Phép thử | Giết/xác nhận | Ai làm | Công |
|---|---|---|---|---|
| **T-1** | Truy vấn 90 ngày `ConversationMessage`: số tin, số PH hoạt động, thời gian phản hồi trung vị, tỷ lệ luồng chết. **Kèm kiểm định tính:** nếu tin phía GV thấp → đối chiếu giả thuyết "GV không có lối vào từ site giáo viên" (§3.1) | **V-01** — **quan trọng nhất** | Kỹ thuật | 2 giờ |
| **T-2** | Phỏng vấn 15 phụ huynh: đang liên lạc bằng gì, muốn liên lạc bằng gì | V-01, V-02, U-01 | Kinh doanh | 1 tuần |
| **T-3** | Phỏng vấn 5 GV + 2 Quản lý cơ sở: kênh nào, mấy lần/tuần, phiền ở đâu | V-03, V-08, U-02 | Đào tạo | 3 ngày |
| **T-4** | Đếm số lead có `consentMarketing` **thật** vs bị ghi đè | **B-04** — rào pháp lý | Kỹ thuật | 2 giờ |
| **T-5** *(đổi 29/07 — bỏ SSE)* | Spike **Supabase Realtime Broadcast-from-Database**: trigger trên bảng tin nhắn → browser nhận qua supabase-js (chỉ phía subscribe); đo message count/kết nối so quota free; thử nối Auth.js → JWT Supabase cho kênh private | **F-01** | Kỹ thuật | 2 ngày |
| **T-6** *(đổi 29/07 — câu "webhook có SĐT không" đã có đáp án: KHÔNG)* | Thử Zalo OA thật với 3 số nội bộ: luồng **chia sẻ SĐT end-to-end** (`request_user_info` → "Chia sẻ thông tin" → `user_submit_info`) — đo tỷ lệ chịu bấm, lưu bằng chứng đồng ý (nối B-04); tiện thể xác nhận cơ chế reset 8 tin/48h | **F-02**, F-03, B-04 | Kỹ thuật | 2 ngày |
| **T-7** | Test tái hiện ĐG-21 (bẫy tự-đánh-dấu-đã-đọc) | **F-05** | Kỹ thuật | 4 giờ |
| **T-8** | Gửi 5 câu cho luật sư: AGPL · quản lý đọc hội thoại · giọng nói có phải sinh trắc học · dữ liệu trẻ em trong chat · chuyển dữ liệu xuyên biên giới | **B-02**, B-05, B-07 | BGĐ | 1 tuần chờ |

> **Nếu chỉ làm được một việc: làm T-1.** Nó tốn 2 giờ và có thể giết cả đề bài — hoặc biến nó từ *"xây kênh mới"* thành *"sửa kênh đang có"*, rẻ hơn khoảng một bậc.

---

## 7. CÂU HỎI CẦN BAN GIÁM ĐỐC CHỐT (bổ sung Q1–Q9 của tài liệu cũ)

| Câu | Nội dung | Chặn cái gì |
|---|---|---|
| **Q10** | **Chấp nhận rủi ro AGPL-3.0 + khoá tài khoản của mô hình ZaloCRM không?** Khuyến nghị: **KHÔNG** | Toàn bộ PA-2 |
| **Q11** | **Tự xây hộp thư (PA-1) hay thuê OMICall Omni Channel (PA-3)?** Cốt lõi: *nội dung hội thoại phụ huynh–trẻ em được phép nằm ở bên thứ ba không?* | PA-1 vs PA-3 |
| **Q12** | **Mục tiêu độ trễ của "realtime"?** ≤5 giây = polling, 0 hạ tầng mới · <1 giây = Supabase Realtime (đã có sẵn Supabase, không vendor mới). SSE tự dựng đã **LOẠI** sau xác minh chi phí | Kiến trúc F-01 |
| **Q13** | **Quản lý cơ sở được ĐỌC hay chỉ được BIẾT về hội thoại GV↔PH?** | B-05, thiết kế quyền |
| **Q14** *(viết lại 29/07)* | Vai "Quản lý lớp học" **đã seed ở RBAC v2** (`CENTER_CLASS_MANAGER`, chưa gán ai). **Có gán cho người thật + bổ sung quyền chat cho nó không**, hay dùng `TEACHER` + `CENTER_MANAGER`? Lưu ý: vai này chỉ có hiệu lực sau khi lật cờ RBAC v2 | K-3, B-09, ma trận quyền |
| **Q15** | **Bốn vai chung một kênh hay tách hai kênh** (Bán hàng ↔ khách mới · Học vụ ↔ phụ huynh hiện tại)? | V-05, toàn bộ mô hình dữ liệu |
| **Q16** | **Giờ phục vụ của kênh chat** + chính sách ngoài giờ? | U-03, kỳ vọng phụ huynh |

---

## 8. LỘ TRÌNH ĐỀ XUẤT (chỉ kích hoạt sau khi có kết quả §6)

| Giai đoạn | Nội dung | Điều kiện vào | Ước lượng thô |
|---|---|---|---|
| **CH-0** | Tám phép thử §6 + trả lời Q10–Q16 | Không | **2 tuần** |
| **CH-1** | Vá nền: ĐG-02 (đồng ý), ĐG-14 (gửi Messenger thật), ĐG-20/21 (sự kiện + thông báo). **Thêm 2 việc rẻ có thể tự cứu kênh hiện có** (từ §3.1): lối vào chat trên site giáo viên + badge chưa đọc ở sidebar admin / cắm chat vào chuông 60s sẵn có — vài ngày công | Xong T-1, T-4, T-7 | **2–3 tuần** |
| **CH-2** | Hộp thư hợp nhất **chỉ đọc** — gom 4 dòng lịch sử vào một màn hình 360°, chưa realtime, chưa Zalo OA | Xong CH-1 | **2–3 tuần** |
| **CH-3** | Zalo OA 2 chiều (cần gói Tăng trưởng 2,5tr/năm) + polling/Supabase Realtime + trả lời từ hộp thư + luồng chia sẻ SĐT (T-6) | Xong CH-2, xong T-5/T-6, chốt Q11/Q12 | **4–6 tuần** |
| **CH-4** | Gọi điện — theo đúng §F.2a/F.2b tài liệu cũ (ghi nhận trước, bấm-gọi sau). Tuỳ chọn chạy trước: pilot **MCC 0đ** làm kênh gọi phụ (không ghi âm — không thay tổng đài, không giải ĐG-06) | Xong F0-11 (đã thu hẹp — §9 mục 2), chốt Q2/Q3 | **4–6 tuần** |

> ⚠️ **Mọi con số trên là ước lượng thô của BA với đội 3 người, chưa trừ việc tồn đọng đang chạy (shadow-compare RBAC, ĐG-01…ĐG-21).** Đội kỹ thuật phải ước lượng lại. **Không được gán các giai đoạn này vào "Phase A0–R5" đã đóng.**

---

## 9. NHỮNG ĐIỀU CHƯA KIỂM CHỨNG ĐƯỢC

> **Dọn danh sách 29/07 sau vòng kiểm chứng:** các mục cũ "nhiều nhân viên trực một OA" (đã có lời giải — §2.2), "giới hạn SSE trên Vercel" (đã có số chính thức — §4 PA-1) và "bảng giá OA 2026" (đã lấy từ trang chính chủ `zalo.solutions`) **được gỡ**. Danh sách còn lại:

| # | Nội dung | Vì sao |
|---|---|---|
| 1 | **Mức sử dụng thật của `ConversationMessage`** | Không chạy truy vấn DB (nguyên tắc khảo sát tĩnh). **Đây là dữ liệu quan trọng nhất của cả tài liệu** — phép thử T-1 |
| 2 | **PAYLOAD webhook gọi thoại Zalo** (trường call_id/thời lượng, có link ghi âm không) + **giá vượt hạn mức "Yêu cầu gọi thoại" ZCC** | Trang `developers.zalo.me` là SPA — 4 cách tải máy đều thất bại. Người triển khai phải **đăng nhập đọc tay** 5 trang: `goi-thoai/tong-quan` · `goi-thoai/cap-quyen-goi/gui-yeu-cau-cap-quyen-goi` · `goi-thoai/cap-quyen-goi/kiem-tra-khach-hang-da-cap-quyen-goi` · `webhook/goi-thoai/su-kien-ket-thuc-cuoc-goi` · `webhook/goi-thoai/su-kien-yeu-cau-cap-quyen-duoc-gui-va-het-han` |
| 3 | **Cột hạn mức "tin tư vấn ngoài 48h" theo từng gói OA** | Lệch cột giữa các lần trích bảng giá (phương án nhiều nguồn nhất: Tăng trưởng ~500 / Toàn diện ~2.000) — xác minh trực tiếp trước khi chốt ngân sách |
| 4 | **Nối Auth.js session → JWT Supabase** cho kênh Realtime private | Bước tích hợp chưa có tài liệu chính thức — nằm trong phép thử T-5 |
| 5 | **Nội dung repo ZaloCRM ở mức mã nguồn** | Chỉ đọc phần mô tả và tài liệu công khai, **không đọc mã** — có chủ ý, vì rủi ro giấy phép AGPL (B-02) |
| 6 | **Cước viễn thông OMICall** | Không có trong bảng giá công khai |

---

## PHỤ LỤC — NGUỒN

**Mã nguồn nội bộ đã đọc trực tiếp:** `lib/conversation/service.ts` · `lib/zalo/provider.ts` · `prisma/schema.prisma` (`:477-513`, `:3771-3792`, `:5029-5047`) · `CLAUDE.md` · `.claude/rules/*`

**Tài liệu nội bộ:** `docs/ba-crm-hien-trang-va-misa.md` · `docs/zalo-notification-adapter.md` · `docs/ke-hoach-go-live-2607/` · `docs/taicautruc/`

**Nguồn công khai `[WEB]`:**
- [github.com/locphamnguyen/ZaloCRM](https://github.com/locphamnguyen/ZaloCRM) — repo trong đề bài
- [github.com/RFS-ADRENO/zca-js](https://github.com/RFS-ADRENO/zca-js) · [npmjs.com/package/zca-js](https://www.npmjs.com/package/zca-js) — thư viện Zalo không chính thức + cảnh báo khoá tài khoản
- [developers.zalo.me — sự kiện người dùng gửi tin nhắn](https://developers.zalo.me/docs/api/official-account-api/webhook/su-kien-nguoi-dung-gui-tin-nhan-post-3720) · [Zalo OA OpenAPI](https://developers.zalo.me/docs/api/official-account-api-230)
- [oa.zalo.me — tổng quan các loại tin nhắn](https://oa.zalo.me/home/documents/guides/tong-quan-cac-loai-tin-nhan-tren-zalo-official-account-_3651713298729094511) · [help.haravan.com — giới hạn & chi phí tin OA V3](https://help.haravan.com/docs/social/integration/gioi-han-tin-nhan-duoc-gui-trong-harasocial-theo-cac-goi-dich-vu-tai-zalo-oa-ver-3/) *(⚠️ Haravan còn ghi giá cũ "100 xu/tin" của chính sách 2023 — chỉ dùng cho cơ chế, KHÔNG dùng cho giá)*
- **Nguồn sơ cấp Zalo (bổ sung sau kiểm chứng 29/07):** [PDF "Kết nối giữa ZCC của Zalo với Callcenter của doanh nghiệp" — tài liệu chính chủ Zalo](https://stc-developers.zdn.vn/docs/assets/files/Zalo_Ket%20noi%20giua%20ZCC%20cua%20Zalo%20voi%20Callcenter%20cua%20doanh%20nghiep-16343724d8b7aafff98b5deaa27cd243.pdf) · [oa.zalo.me/home/call — MCC & ZCC](https://oa.zalo.me/home/call) · [zalo.solutions/oa/pricing — bảng giá 4 gói OA chính chủ](https://zalo.solutions/oa/pricing) · [oa.zalo.me — quản lý admin OA (100 admin, 6 vai)](https://oa.zalo.me/home/documents/guides/quan-ly-admin-oa_83) · [oa.zalo.me — quản lý hội thoại (chỉ định nhân viên)](https://oa.zalo.me/home/documents/guides/quan-ly-hoi-thoai_1287955702315829050) · [oa.zalo.me — thông báo 4 gói mới 01/06/2026](https://oa.zalo.me/home/resources/news/162026-zalo-official-account-trien-khai-4-goi-dich-vu-moi-toi-uu-hieu-suat-theo-nhu-cau-doanh-nghiep-_109742821673880689)
- **Hạ tầng realtime (bổ sung 29/07, toàn nguồn chính thức):** [vercel.com — duration limits](https://vercel.com/docs/functions/configuring-functions/duration) · [vercel.com — usage & pricing (Fluid)](https://vercel.com/docs/functions/usage-and-pricing) · [vercel.com KB — publish/subscribe realtime ("functions should not subscribe")](https://vercel.com/kb/guide/publish-and-subscribe-to-realtime-data-on-vercel) · [vercel.com — WebSockets (Public Beta 22/06/2026)](https://vercel.com/docs/functions/websockets) · [supabase.com — subscribing to database changes (Broadcast là cách khuyến nghị)](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes) · [supabase.com — Realtime limits](https://supabase.com/docs/guides/realtime/limits) · [supabase.com — Realtime pricing](https://supabase.com/docs/guides/realtime/pricing)
- [vihatsolutions.com — cập nhật chính sách Zalo 2026](https://vihatsolutions.com/tin-cong-nghe/cap-nhat-chinh-sach-zalo-2026/) · [v9.com.vn — bảng giá Zalo OA 4 gói mới từ 01/06/2026](https://v9.com.vn/bang-gia-zalo-oa-2026/)
- [omicall.com/bang-gia](https://omicall.com/bang-gia/) · [omicall.com — tổng đài call center](https://omicall.com/tong-dai-call-center/) · [stringee.com — Contact Center API](https://stringee.com/vi/contact-center-api)
- [mitek.vn — Zalo Cloud Connect](https://mitek.vn/zalo-cloud-connect-zcc-giai-phap-goi-cskh-thong-qua-ung-dung-zalo/) · [mipbx.vn — tích hợp ZCC](https://mipbx.vn/giai-phap-tich-hop-zalo-cloud-connect-zcc/)
- [Nghị định 356/2025/NĐ-CP (vanban.chinhphu.vn)](https://vanban.chinhphu.vn/?pageid=27160&docid=216387) · [EY Vietnam — bản tin pháp lý NĐ 356/2025](https://www.ey.com/vi_vn/technical/tax/tax-and-law-updates/nghi-dinh-so-356-2025-nd-cp-quy-dinh-chi-tiet-mot-so-dieu-va-bien-phap-thi-hanh-luat-bao-ve-du-lieu-ca-nhan)
