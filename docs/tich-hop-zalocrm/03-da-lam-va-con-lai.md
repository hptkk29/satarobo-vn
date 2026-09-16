# ZaloCRM — đã làm gì, còn lại gì (06/09/2026)

> Nhánh `feat/zalocrm` (cắt từ `origin/test`). **4 commit**, ~7.000 dòng mã + **312 ca kiểm thử** cho riêng module.
> 🔴 **Toàn bộ nằm sau cờ `ZALOCRM_ENABLED` mặc định TẮT.** Cờ tắt thì: mục sidebar ẩn · trang `/zalo-crm` trả 404 ·
> webhook trả 404 · nút "Nhắn Zalo" không hiện · màn Tích hợp không có mục ZaloCRM. Merge được an toàn trước khi
> máy chủ ZaloCRM tồn tại.

| Commit | Nội dung |
|---|---|
| `d9efae78` | nền: cờ · 3 tham số vận hành · schema (enum + 2 bảng) · quyền `zalocrm:use` · prefill form nhập khách · pháp lý · cron dọn |
| `3406fa4e` | màn `/admin/zalo-crm` + SSO · vá 3 lỗ rò có sẵn của hộp thư · mốc dòng thời gian lead |
| `5167ea70` | webhook nhận tin + dịch payload · nút "Nhắn Zalo" trên phiếu lead |
| `da5ea73e` | màn Tích hợp theo dõi nick · đóng đường ghi dòng "đặt trước" |

---

## 1. Việc S1–S12 của kế hoạch §5 — trạng thái

| # | Việc | Xong? | Ghi chú |
|---|---|---|---|
| S1 | Trang `/admin/zalo-crm` + SSO + mục sidebar | ✅ | vé JWT 60 giây (`jose` HS256), `jti` mỗi lần một khác, token trong `#fragment` nên không vào query/log; tab cơ sở theo `zalocrm.orgCodes` |
| S2 | Nút "Nhắn Zalo" trên phiếu lead | ✅ | chỉ hiện khi ĐỦ: xem được PII **và** có `zalocrm:use` **và** cờ bật |
| S3 | Webhook receiver + dịch payload | ✅ | 7 bước, HMAC bắt buộc, đục PII trước khi ghi vết, 200-nghiệp-vụ/5xx-hạ-tầng |
| S4 | Nối lead hai chiều | ✅ (chiều về) / ⚠️ (chiều đi) | chiều chat→lead và SĐT→lead xong. `PUT /contacts/:id/external-ref` sang ZaloCRM là **GĐ3**, cần fork có API |
| S5 | Dòng thời gian lead + SLA | ✅ | đúng luật S-9: tin ĐẾN không ghi gì; lead chưa giao ⇒ NOTE máy |
| S6 | Quyền `zalocrm:use` | ✅ | **scope GLOBAL, không phải CENTER** — xem lý do ở kế hoạch §5 S6 |
| S7 | Đồng bộ nick + màn Tích hợp | ✅ | có cảnh báo "báo connected mà im quá N giờ" |
| S8 | Pháp lý nền | ✅ | `consentMarketing` thôi ghi cứng `true`; chính sách bảo mật sang Luật 91/2025 + NĐ 356/2025 |
| S9 | Vá 7 lỗi có sẵn (B1–B7) | ✅ 7/7 | xem §2 |
| S10 | Site Sale giữ cờ OFF, không xoá | ✅ | không đụng dòng nào |
| S12 | Đường ghi dòng "đặt trước" | ✅ | phát sinh khi thi công — đường ĐỌC có mà đường GHI thì không |

**F1–F7 (fork ZaloCRM): CHƯA làm.** Repo khác, và chặn ở ba việc ngoài code (9.16/9.17/9.18).

---

## 2. Bảy lỗi có sẵn trên `test` — đã vá hết

| # | Lỗi | Vá thế nào |
|---|---|---|
| B1 | Sale không gửi lại được cùng một câu ("Dạ vâng ạ") trong một hội thoại | `outboundKey` bỏ hash nội dung, dùng nonce mỗi lượt soạn |
| B2 | 🔴 Hội thoại đã nhận việc **vẫn mồ côi** ⇒ hiện với MỌI cơ sở (rò chéo cơ sở) | `ganNguoiPhuTrach` nay ghi `orgUnitId` và lan xuống đủ 3 bảng |
| B3 | Nối SĐT kéo hội thoại sang lead **cơ sở khác** | `timLeadTheoSdt` nhận `orgUnitId` (vẫn giữ `db` trần — webhook không có actor) |
| B4 | `INBOX_ENABLED` được nhắc nhưng không tồn tại | thêm `isInboxEnabled()` |
| B5 | 🔴 14 ca hộp thư **chưa từng chạy trong CI** (xanh giả từ 27/08) | CI nay gọi `pnpm test:inbox-db` |
| B6 | Echo về trước ⇒ P2002 không ai bắt | `send.ts` bước 3 tách hai lệnh, giành id có điều kiện |
| B7 | Không cron nào dọn `WebhookDelivery`/`DomainEvent` (PII vô thời hạn) | cron `webhook-retention`, giữ 30 ngày |

---

## 3. Đã kiểm bằng máy (không phải suy đoán)

- `pnpm typecheck` · `pnpm lint` · `pnpm build` — **xanh**; build đăng ký đủ `/admin/zalo-crm` và `/api/webhooks/zalocrm/[org]`.
- `vitest` **478 tệp / 7.291 ca xanh** (đúng điều kiện CI: 14 tệp chạm DB tự skip vì không có Postgres).
- Bộ chạm Postgres local: `inbox 58/58` · `chat 94/94` · `nen 18/18` · `lead-intake 27/27`.
- **Smoke thật trên dev server + Postgres thật** (`satarobo_local`), 8 tình huống webhook bằng `curl` có ký HMAC thật:

  | Tình huống | Mã | Kết quả |
  |---|---|---|
  | không chữ ký / chữ ký rỗng / chữ ký sai / ký bằng khoá org khác | 401 | ✅ 4/4 |
  | org chưa khai · org sai khuôn | 404 | ✅ 2/2 |
  | chữ ký đúng | 200 | ✅ tin vào hộp thư |
  | gửi lại đúng tin đó | 200 `duplicate:true` | ✅ không đẻ dòng thứ hai |

  Sau đó đo thẳng trong DB: `channelMessageId = cs1:smoke-msg-1` (có tiền tố org) · `accountId` = nick chứ không phải hằng ·
  `orgUnitId` lan tới cả identity lẫn message · `ZaloCrmNick` tự sinh, khớp đúng cơ sở · và **PII bị đục thật**:
  nội dung tin trong `WebhookDelivery` là `{"len":35,"sha256":"47c3a5…"}`, SĐT là `"[đã đục]"`.
- **Smoke giao diện**: đăng nhập thật → `/zalo-crm` hiện đủ hai tab cơ sở; `iframe src` =
  `https://zalo.satarobo.vn/sso#token=…&next=/chat` — **token chỉ ở fragment**, phần query sạch, claims đủ, `exp − iat = 60` giây;
  màn Tích hợp hiện đúng nick vừa sinh và đúng 5 dòng nhật ký lỗi của bài smoke.
  Khung nhúng **trắng** — đúng như thiết kế, vì `zalo.satarobo.vn` chưa tồn tại.

### 3.1 Chạy thật đầu-cuối với fork dựng trên máy lẻ (07/09/2026)

Fork chạy bằng Docker ở `E:/zalocrm/app` (6 dịch vụ), `ZALOCRM_APP_URL=http://localhost:3080`,
tổ chức `cs1`. Kết quả: **Sale mở `/zalo-crm` là vào thẳng giao diện chat, không phải đăng
nhập lần hai** — khung dựng đủ thanh điều hướng, danh sách hội thoại, ô soạn tin.

Đo được, không phải nhìn:

- mỗi lần mở màn ⇒ **đúng MỘT** dòng `login_success` `via=sata-sso` trong nhật ký của fork;
- đổi cơ sở trên dropdown ⇒ URL sang `?org=cs2`, **ký vé cho tổ chức khác**, fork trả đúng
  "Tổ chức chưa được khai mã" (máy này mới dựng org `cs1`) — tức mỗi cơ sở là một phiên riêng,
  không dùng chung;
- `chonCoSoZaloCrm` (ca ZC-ORG-01…09) phủ luật cách ly: `?org=` lạ rơi về cơ sở đầu, không
  nhìn thấy cơ sở nào thì danh sách RỖNG.

**Bốn lỗi phía fork lộ ra ở lượt chạy này** — tất cả đều cho ra cùng một triệu chứng "khung
trắng, không lỗi", và đều đã vá (chi tiết ở `THAY-DOI-BAN-PHAI-SINH.md` của repo fork):
tài khoản SSO bị nhốt ở màn đổi mật khẩu lần đầu · `/auth/sso` không được kể là endpoint
xác thực nên 401 ở đó **xoá token của phiên vừa mở** · `/sso` thiếu trong danh sách trang
công khai nên vé hỏng đá về /login trước khi kịp hiện lỗi · `SsoView` đổi vé hai lượt.

⚠️ **Một bẫy khi tự kiểm bằng công cụ tự động:** thao tác chụp màn hình của trình duyệt
làm **tải lại khung nhúng**, mà `src` thì vẫn mang vé cũ ⇒ hiện "Vé đăng nhập đã được dùng".
Đó là hiện vật của công cụ đo, không phải lỗi sản phẩm: mở màn rồi để yên 30 giây, nhật ký
chỉ có đúng một lần đổi vé. (Nay fork cũng tự chữa: vé đã dùng mà phiên còn sống thì đi tiếp.)

---

## 3.2 GĐ3 đã làm xong CODE (13/09/2026)

Kế hoạch xếp GĐ3 là **tuỳ chọn**; chủ dự án chốt làm luôn để sẵn sàng khi có nick thật.

**Bên fork — F4** (`public-api-routes.ts`, migration thuần thêm `Contact.externalRef`):
`GET /conversations` thêm `zaloAccountId` + `contact.externalRef` + bộ lọc `since` ·
`GET /conversations/:id` mới · `POST /messages/send` đi qua **trần chống khoá nick**
(bản gốc gửi thẳng, không hỏi trần), **trả `msgId`**, và nhận `idempotencyKey` ·
`PUT /contacts/:id/external-ref` mới. Đã thử sống bằng khoá API thật: khoá sai 401 · id
bịa 404 · kiểu sai 400 · gắn 200 · gắn chồng **409 `EXTERNAL_REF_TAKEN`** · gỡ 200.

**Bên Sata:**
- adapter kênh `ZALO_CA_NHAN` — người trực gửi ngay trong hộp thư Sata;
- cron **đối soát 5 phút** (`/api/cron/zalocrm-doi-soat`) nạp bù tin webhook làm rơi,
  đi qua ĐÚNG đường nạp của webhook, chống trùng bằng `channelMessageId`;
- màn **Phản hồi hộp thư** (`/bao-cao/phan-hoi-hop-thu`, quyền `inbox:view`).

Ba chốt thiết kế đáng nhớ, đừng "sửa" ngược:
1. **Thiếu `msgId` ⇒ `FAILED`, không bịa id.** `providerMessageId` được ghi làm
   `channelMessageId` để bản echo về sau bị nhận ra là trùng — bịa id là mỗi tin hiện
   hai lần trong hội thoại.
2. **Trần chống khoá nick do FORK gác, Sata không gác lần hai** — hai bên đếm riêng là
   hai con số lệch nhau. Fork trả 429 ⇒ `FAILED` có mã, người trực đọc được và chờ.
3. **Báo cáo CỐ Ý không có "thời gian phản hồi trung bình".** Cách tính rẻ tiền
   (`lastOutboundAt − lastInboundAt`) nói dối theo hướng đẹp: hội thoại bỏ quên ba ngày
   rồi mới trả lời vẫn ra "2 phút". Thà thiếu một cột còn hơn có một cột làm người đọc
   yên tâm sai.

⚠️ **Chưa thể nghiệm thu bằng người:** cả ba đều cần một nick Zalo thật (việc 9.16).
Trước đó cơ sở chưa khai `ZALOCRM_API_KEYS` thì adapter trả `SIMULATED` và cron bỏ qua
lặng lẽ — không tốn gì, không kêu sai.

---

## 4. Còn lại — và ai làm

### 4.1 Chủ dự án (chặn cứng, ngoài code)
| # | Việc |
|---|---|
| 9.15 | **Biên bản ký giấy** 13 chốt 05/09 + đảo hai biên bản 21/08 và 27/08 về site Sale |
| 9.16 | Một SIM công ty cho nick thử **org TEST**; danh sách Sale ↔ SIM cho CS1, CS2 |
| 9.17 | Máy chủ + UPS + đường mạng theo §7.1 |
| 9.18 | **Tên sản phẩm mới** cho fork (nghĩa vụ giấy phép L4) |
| 9.14 | Quyết định mua giấy phép thương mại (gỡ banner) hay giữ banner |

### 4.2 Fork ZaloCRM (F1–F7) — **ĐÃ XONG CẢ BẢY** (07–13/09/2026)
Repo công khai <https://github.com/sataroboit-coder/sata-crm>, nhánh `feat/sata-sso`.
F1 SSO · F2 webhook giàu ngữ cảnh + outbox retry · F3 cho nhúng iframe · **F4 Public API** ·
F5 nút "Tạo lead" trong chat · F6 giấy phép · F7 tắt cứng AI.

🔴 **Nghĩa vụ AGPL là LIÊN TỤC:** mỗi lần sửa thêm rồi đưa lên máy chủ cho nhân viên
dùng thì phải đẩy bản công khai TRƯỚC, triển khai SAU.

Vế "Mở lead" của F5 (`sata:open-lead`) nay đã có chỗ dựa (`Contact.externalRef` của F4)
nhưng CHƯA nối — không có nick thật thì không có liên hệ nào để gắn thử.

🔴 **Hai hợp đồng phải thống nhất bằng văn bản với bên fork TRƯỚC khi họ code** (phần Sata mù hoàn toàn ở đây):
1. **Đường SSO**: `<appUrl>/sso`, đọc fragment bằng `new URLSearchParams(location.hash.slice(1))`, hai khoá `token` và `next`.
2. **HMAC ký trên CHÍNH chuỗi JSON đã serialize** (Sata tính trên chuỗi đã giải mã UTF-8) — ký trên buffer đã biến đổi
   thì tin có emoji sẽ 401 ngẫu nhiên.
3. Payload `message.*` phải thêm: `zaloAccountId`, `threadId`, `threadType`, `contactId`, `contact.phone`, `sentByExternalId`.
   Thiếu ⇒ Sata trả 200 + FAILED **có mã lỗi**, thấy ngay ở màn Tích hợp (hỏng THẤY ĐƯỢC, cố ý không đoán bừa).

### 4.3 Thứ tự bật trên môi trường thật — KHÔNG ĐẢO ĐƯỢC
1. Đặt `webhook_secret` **ở phía ZaloCRM trước**. (Org bên đó chưa có secret thì nó gửi chữ ký RỖNG, Sata trả 401, tin rơi im.)
2. Khai `ZALOCRM_WEBHOOK_SECRETS` (JSON theo orgCode) trên Vercel.
3. Khai tham số `zalocrm.orgCodes` ở màn Cấu hình vận hành (**khoá = `Center.code`**, giá trị = orgCode bên ZaloCRM).
4. **Sau cùng** mới bật `ZALOCRM_ENABLED="true"`.

Bật cờ muộn **không mất tin** — ZaloCRM giữ outbox và retry khi thấy mã không phải 2xx.

### 4.4 Sau khi merge `test` → `main`
🔴 **Chạy tay `.github/workflows/seed-prod-roles.yml`.** `zalocrm:use` là key MỚI; quên seed thì prod giữ `RolePermission`
cũ ⇒ người mở `/zalo-crm` bị đá về dashboard **không kèm lỗi**, và **không tái hiện được ở local** (local chạy RBAC v1 tĩnh,
prod chạy v2 động). Đây là lỗi đã dính nhiều lần.

Và: hai migration mới là **thuần thêm** (ALTER TYPE + CREATE TABLE), không đụng bảng nào đang có dữ liệu.

---

## 5. Nợ đã biết, ghi ra để không ai tưởng là sót

| # | Nợ | Mức |
|---|---|---|
| 1 | `tests/e2e/a0/zalocrm-gate.spec.ts` **chưa chạy lần nào** — bật cờ cho `webServer` của bộ a0 nằm ngoài phạm vi các lô. Ca "cờ TẮT" sẽ chạy thật ở CI ngay lần đầu; ba ca "cờ BẬT" chạy lần đầu ở GĐ1. | TB |
| 2 | ~~Nút "Nhắn Zalo" **không mang `?org=`**~~ **ĐÃ VÁ 13/09/2026.** Nút nay mang cơ sở của chính phiếu (`orgCodeCuaCoSo` tra `zalocrm.orgCodes` theo `Center.code`). Trước đó người kiêm nhiều cơ sở bấm từ phiếu CS2 mở nhầm cơ sở đầu bảng chữ cái, và `datTruocLuongZalo` bỏ qua với mã `KHAC_CO_SO` (`dat-truoc.ts:157`) ⇒ hội thoại **không tự nối vào phiếu** — tức mất đúng thứ cái nút sinh ra để làm. Thiếu ánh xạ vẫn ra nút, chỉ là không kèm `?org=` (lối lùi có chủ đích). Ca `ZC-CU-10…15`. | — |
| 3 | ~~Hình dạng payload là **phỏng đoán**~~ **ĐÃ ĐỐI CHIẾU 13/09/2026** với mã fork. `message.*` do chính ta dựng ở F2 nên khớp sẵn. `GET /api/v1/zalo-accounts` (`zalo-routes.ts`) trả **mảng TRẦN** — và **phỏng đoán cũ SAI một chỗ có hậu quả**: `ownerUserId` ở gốc là id **nội bộ của fork**, không phải `User.id` Sata, nên bộ lọc người dùng loại sạch ⇒ cột "người sở hữu" ở màn Tích hợp **rỗng vĩnh viễn, không một dòng lỗi**. Vá hai đầu: fork thêm `owner.externalId` vào select (thuần thêm), Sata đọc `owner.externalId` và **cố ý bỏ** `ownerUserId` khỏi danh sách ứng viên. `status` thật có ba giá trị `connected`/`disconnected`/`qr_pending` — cái thứ ba ra `UNKNOWN`, đúng ý ("chưa quét mã" khác "đã rớt"). Ca `ZC-NA-06d/06e`, `ZC-NA-09b/09c`. | — |
| 4 | `ZaloCrmNick`/`ZaloCrmThread` **không** ở `SOFT_DELETE_MODELS` ⇒ mọi truy vấn MỚI chạm hai bảng này phải tự thêm `deletedAt: null`. Không có lint bắt việc quên. | TB |
| 5 | Không màn nào hiện bảng `ZaloCrmThread` ⇒ ánh xạ số ↔ phiếu sai thì không có lối vào để sửa (chỉ có `console.warn`). Cách xử đúng là gộp phiếu trùng. | Thấp |
| 6 | `frame-src` trong `next.config.ts` **chưa có tác dụng** — CSP đang gửi dưới tên `Report-Only`. Thứ chặn iframe thật là header của chính ZaloCRM (việc F3). | Thấp |
| 7 | Chuỗi xử lý một tin gồm nhiều lệnh ghi **rời nhau**, không trong một transaction. Chết giữa chừng ⇒ tin đã có nhưng chưa nối phiếu, và lượt retry sau dừng ở nhánh `duplicate`. Kế thừa từ `ingestInboundMessage`, không phải nợ mới. | TB |

## 6. Hai thay đổi hành vi phải báo trước, kẻo bị coi là lỗi mới

1. **Lead mới từ 3 webhook cũ (facebook/zalo/google-form) nay mang `consentMarketing = false`.** `lib/calls/muc-dich.ts`
   lấy cột này làm cổng cho cuộc gọi mục đích MARKETING ⇒ Sale sẽ bị chặn khi chọn mục đích đó với nhóm lead này
   (gọi CHĂM SÓC thì không bị chặn). Đây là kết quả **đúng về pháp lý**, không phải hồi quy. Dữ liệu cũ **không** bị sửa ngược.
2. **Hội thoại mồ côi mà Sale CS1 bấm "nhận việc" sẽ biến mất khỏi danh sách của Sale CS2.** Đó chính là mục đích của
   vá B2 (bịt rò chéo cơ sở).
