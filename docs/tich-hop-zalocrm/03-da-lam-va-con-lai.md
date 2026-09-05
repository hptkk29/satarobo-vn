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

### 4.2 Fork ZaloCRM (F1–F7) — repo khác, làm sau khi có 9.17 + 9.18
F1 SSO · F2 webhook giàu ngữ cảnh + outbox retry · F3 cho nhúng iframe · F4 Public API (GĐ3) ·
F5 nút "Tạo lead" trong chat · F6 giấy phép (commit đầu tiên) · F7 tắt cứng AI.

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
| 2 | Nút "Nhắn Zalo" **không mang `?org=`** ⇒ người kiêm nhiều cơ sở bấm từ phiếu CS2 sẽ mở tab đầu bảng chữ cái. Người một cơ sở (phần lớn Sale) không dính. | TB |
| 3 | Hình dạng payload `GET /api/v1/zalo-accounts` và `message.*` là **phỏng đoán** — fork chưa có văn bản. Khi có payload thật chỉ sửa bảng ánh xạ + fixture, không sửa nơi khác. | TB |
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
