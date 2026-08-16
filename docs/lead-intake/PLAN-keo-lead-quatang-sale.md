# Kéo lead từ quatang.edu.vn + sale.satarobo.vn về bảng `Lead`

> Lập 16/08/2026. Nguồn quyết định: user chốt 3 điểm ngày 16/08 (mục §0).
>
> **Trạng thái 16/08/2026:** P0 ✅ · **P1 ✅** · **P2 ✅** · **P4 ✅** — đã đẩy lên nhánh `test`
> (CI + Migrate TEST DB xanh), **chưa merge `main`** nên `sale.satarobo.vn` trên prod CHƯA đổi.
> **P3 ✅ (code xong, chờ anh cấu hình Apps Script + secret)** · P5 ⬜.
> **Nghiệm thu trên `test.satarobo.vn` 16/08: ĐẠT 7/7** (§12) — đường Sale chạy thật, đo cả trong DB.
> Chốt chặn còn lại của P3: `WEBHOOK_QUATANG_SECRET` chưa đặt trên env `test` (endpoint đang trả 503).
> Chi tiết: §8 (P1/P2) · §9 (nhật ký review) · §10 (P4) · §11 (P3 + bug Hội sở) · §12 (nghiệm thu).

---

## 0. Ba quyết định đã chốt (16/08/2026)

| # | Câu hỏi | Chốt |
|---|---|---|
| QĐ-1 | Data 2 site hiện đổ đâu | `quatang.edu.vn` → **Google Sheet + MISA**. `sale.satarobo.vn` → **chỉ MISA**. Site sale nằm **chung project này** ⇒ kéo về Lead bằng đường nội bộ. |
| QĐ-2 | Backfill dữ liệu cũ | **KHÔNG.** Chỉ nhận lead phát sinh từ thời điểm bật. Không đụng lịch sử trong MISA. |
| QĐ-3 | Số phận MISA | Kéo về chạy ổn ⇒ **Sale làm việc hẳn trên Sata Robo, bỏ MISA.** Đồng bộ **MỘT CHIỀU** (ngoài → ta). Không xây đẩy-ngược. |

Hệ quả của QĐ-2: **không** cần MISA Open API, không cần app_id/client_secret, không cần cron pull. Cả hai nguồn bắt tại **điểm nhập**.
Hệ quả của QĐ-3: mọi thứ dính MISA phải **tắt được bằng cấu hình**, không phải gỡ code — để ngày bỏ MISA không cần deploy.

---

## 1. Hiện trạng đã đo trong repo

| Thứ | Chỗ | Ghi chú |
|---|---|---|
| Form Sale | `public/sale/nhap-lieu.html` (251 KB, self-contained) | `<form action="https://amisapp.misa.vn/crm/gc/api/open/WebForm/savecollection" method="POST">`, Form ID `c53af301…`, Companycode `uys4eef4`, `RedirectURL=http://sale.satarobo.vn/thank-you`. **Không tạo Lead nào trong DB ta** — BA doc 09 §7 tab 6 ghi rõ đây là cố ý. |
| Host sale | `proxy.ts:20,27` + `lib/auth/route-policy.ts:475-492` | Site tĩnh CÔNG KHAI, không auth, chỉ 2 trang. **`isInfraPath()` cho `/api/*` đi thẳng** (`route-policy.ts:481`) ⇒ POST same-origin về API app được ngay, không phải mở CORS. |
| Xương sống nhận lead ngoài | `lib/lead/ingest.ts` | Idempotent theo `Lead.eventId` (unique) → chống trùng SĐT trong cửa sổ `crm.dedupWindowDays` (default 90) → `autoAssignLead`. |
| Pipeline webhook | `lib/lead/webhook.ts` | verify shared-secret (fail-**closed** trên production) → `WebhookDelivery` → `extractLeadFields` → `ingestLead` → mark status. 3 nguồn đang chạy: `facebook` / `zalo` / `google-form`. |
| Replay | `lib/crm/webhook-replay.ts` | Đã có hàm đọc + replay `WebhookDelivery`. |
| Dedup | `lib/lead/dedup.ts` | Khớp `phoneVariants` (`84…` lẫn `0…`); trùng ⇒ ghi `LeadDuplicate` + 1 `LeadActivity` NOTE trên lead gốc, **KHÔNG tạo lead mới**. |
| Auto-chia | `lib/lead/auto-assign.ts:121` | `autoAssignNewLead` bỏ qua nếu `assignedToId` đã có ⇒ gán tay theo mã NV sẽ thắng round-robin, không cần sửa gì. |
| Mã NV → tài khoản | `Employee.employeeCode` (unique) → `Employee.userAccount` (`User`) | Đường map mã NV trên form sang `Lead.assignedToId`. |

**Kết luận: không xây từ đầu.** Việc cần làm là thêm 2 nguồn + 2 mapper vào bộ khung đã chạy 3 nguồn.

---

## 2. Kiến trúc — một cửa vào duy nhất

```
sale.satarobo.vn/nhap-lieu.html  ──POST form-urlencoded──┐
   (same-origin, không auth)                             │
                                                         ├──►  lib/lead/intake/  ──► ingestLead()  ──► Lead
Google Sheet (quatang) ──Apps Script POST JSON──►         │      (mapper theo nguồn)      │            + WebhookDelivery
   x-webhook-secret                                       ┘                               │            + LeadActivity
                                                                                          └──► autoAssignNewLead
                                          (chuyển tiếp) ──► mirror sang MISA, tắt được bằng SystemSetting
```

Luật: **Postgres là nguồn sự thật.** Mirror sang MISA hỏng ⇒ log, KHÔNG rollback lead. (Cùng luật đã áp cho broadcast ở module chat.)

---

## 3. Kế hoạch theo giai đoạn

### P0 — Chốt đầu vào ✅ ĐÃ ĐÓNG (16/08/2026)

| Hỏi | Trả lời |
|---|---|
| Sheet quatang | ID `1CHX3GmjVXb69cng5Ogve2ATgP2FbqLRPVWMwsNxt3hQ` — 22 cột (§6). **Chứa PII thật (SĐT/email PH) — không sao chép nội dung vào repo/chat.** |
| Sheet ghi bằng gì | **Site tự POST vào Apps Script web-app** ⇒ hook vào `doPost`, **KHÔNG cần trigger** (thoát luôn bẫy `onEdit` không gọi được `UrlFetch`). |
| Ai sửa Apps Script | Mọi người. |
| Có chọn cơ sở không | **Có, bắt buộc.** |
| `Lead.source` | `sale-form` và `quatang`. |

### P1 — Lõi ingest dùng chung (1 ngày)

Test viết **TRƯỚC** phần hiện thực (luật cứng Nền Hệ thống #5).

- `lib/lead/intake/` (module mới):
  - `map-sale-form.ts` — map bộ trường MISA của form Sale.
  - `map-quatang.ts` — map cột Sheet quatang.
  - `center.ts` — mã cơ sở của nguồn → `Center.code` → `centerId`. **Không hardcode id**; CS3 mở thêm là thêm data.
  - `owner.ts` — `employeeCode` → `Employee.userAccount.id`. Không khớp ⇒ `null` (rơi về auto-chia) + ghi 1 dòng cảnh báo vào `note`, không nuốt im lặng.
  - `note.ts` — gom field không có cột riêng (trường, lớp, tỉnh/TP, địa chỉ, khoá quan tâm, mã NV) thành block `note` **định dạng cố định**, giữ đúng pattern `Khoá quan tâm: …` mà `/api/leads` đang parse.
- Mở rộng `ingestLead()` (`lib/lead/ingest.ts`) thêm optional: `assignedToId`, `childAge`, `consentMarketing`, `utmMedium/Content/Term`, `referrer`, `landingPage`.
  - ⚠️ Hiện `ingest.ts:70` **hardcode `consentMarketing: true`**. Đổi thành tham số, **default `true`** để không đổi hành vi 3 nguồn cũ.
- Chuẩn hoá SĐT về canonical **trước khi ghi** (`lib/phone`), nếu không dedup lệch âm thầm.
- Cho `processLeadWebhook()` nhận thêm tham số `mapper` optional (mặc định giữ `extractLeadFields` → 3 route cũ không đổi 1 dòng).

**Test P1:** mapper đúng/thiếu SĐT/thiếu tên PH/mã NV sai/mã cơ sở lạ/SĐT dạng `84…` vs `0…`/submit trùng.

### P2 — sale.satarobo.vn (1–1,5 ngày) — phần dễ

1. `public/sale/nhap-lieu.html`: đổi **duy nhất** thuộc tính `action` → `/api/public/lead-intake/sale-form`, thêm 1 hidden `formVersion`. **Giữ nguyên tên field MISA** (`LastName`, `CustomField15`…) để không phải viết lại UI 251 KB.
2. Route mới `app/api/public/lead-intake/sale-form/route.ts`:
   - Nhận `application/x-www-form-urlencoded` → honeypot → `rateLimit` (dùng lại `lib/rate-limit`) → mapper → `ingestLead` → **303** về `/thank-you?ok=1` (trùng: `?dup=1`).
   - **Mapping chốt:**

     | Field form (MISA) | → Lead |
     |---|---|
     | `LastName` (tên học sinh) | `childName` |
     | `CustomField25` (tên PH) | `parentName` — rỗng ⇒ fallback `"PH của <childName>"` + cờ cần bổ sung trong note |
     | `CustomField15` (SĐT PH) | `phone` — **bắt buộc ở server ta** |
     | `Email` | `email` |
     | `CustomField17` (`1`/`2`) | `centerId` qua `Center.code` CS1/CS2 |
     | `CustomField26` (mã NV) | `assignedToId` qua `employeeCode` |
     | `CustomField14/13`, `ShippingProvinceID`, `ShippingAddress` | gộp vào `note` |
     | — | `source = "sale-form"`, `landingPage`, `ipAddress`, `userAgent` |

   - ⚠️ **SĐT hiện KHÔNG bắt buộc phía MISA** (BA doc 09 dòng 628 — GAP đã biết). Ta bắt buộc ở server: thiếu SĐT ⇒ trả trang lỗi tiếng Việt có nút quay lại, **không** nuốt im lặng.
3. **Mirror sang MISA (chỉ giai đoạn chuyển tiếp):** sau khi tạo Lead, forward y nguyên payload sang endpoint MISA cũ. Fire-and-forget, timeout 5s, lỗi chỉ log. Bật/tắt bằng `SystemSetting "intake.mirrorMisa"` (SystemSetting chứ không phải env — tắt bằng 1 nút, không deploy). QĐ-3 nói MISA sẽ bỏ ⇒ đây là thứ có ngày chết định sẵn.
4. **e2e** (Postgres local): submit → lead hiện ở `/admin/leads`, đúng cơ sở, đúng owner; submit lần 2 cùng SĐT → không đẻ lead trùng + có `LeadActivity` "[Trùng SĐT]"; thiếu SĐT → 400 có thông báo.

### P3 — quatang.edu.vn (1 ngày) — bắt trong `doPost` của Apps Script

Điểm bắt = **`doPost` của Apps Script web-app**, tức chỗ nhận payload GỐC từ site — **KHÔNG** đọc hàng đã ghi xuống sheet.
Lý do quyết định (xem §6): sheet **làm hỏng SĐT** (nuốt số 0 đầu vì ô định dạng số) và **thứ tự cột đã đổi 3 lần**. Payload gốc thì sạch và có tên trường. Đọc sheet là tự chuốc 2 lớp lỗi không cần thiết.

1. Route `app/api/public/webhook/quatang/route.ts` = `processLeadWebhook("quatang", req, mapQuatang)`.
2. Thêm `WEBHOOK_QUATANG_SECRET` vào `SECRET_ENV` (`lib/lead/webhook.ts:19`) + `.env.example`. Production thiếu secret ⇒ 503 (đã fail-closed sẵn).
3. Trong `doPost`, **sau khi `appendRow` thành công**, thêm 1 `UrlFetchApp.fetch` POST JSON sang route trên, header `x-webhook-secret`, `muteHttpExceptions: true`, bọc `try/catch`.
   - Ta chết ⇒ sheet vẫn ghi ⇒ **không mất lead**. Đây là lý do bắt sau `appendRow` chứ không phải trước.
   - `eventId = "quatang:<timestamp>-<sđt chuẩn hoá>"` (payload không có id riêng) ⇒ script chạy lại không đẻ lead trùng.
   - Ghi kết quả vào cột **`MISA status`** (hoặc thêm cột `SR status`) → đối soát bằng mắt ngay trên sheet.
4. **Trước khi code: đọc mã `doPost` hiện tại** để lấy đúng tên trường payload (`e.postData.contents`) và xem MISA đang được đẩy thế nào — cột `MISA status` đang trống 100% (§6-F5), có khả năng nhánh MISA của quatang đã hỏng sẵn.
5. Đường lui nếu không đụng được Apps Script: sửa trang quatang dual-post giống P2.

### P4 — Nhìn thấy được & không chết im (0,5–1 ngày)

- Thêm `sale-form` + `quatang` vào bộ lọc **Nguồn** ở `/admin/leads` (và site Sale khi P1 site Sale lên).
- Màn quản trị `WebhookDelivery`: dùng lại `lib/crm/webhook-replay.ts` — xem lead nào vào lỗi và bấm replay.
- **Cảnh báo im lặng:** 1 nguồn không có lead nào trong X giờ ⇒ báo HO. Đây đúng bài học SePay: 401 im lặng 6 ngày, nuốt 4 giao dịch ~26,8 tr. Đường nhận lead cũng vậy — hỏng mà không ai biết là chế độ hỏng tệ nhất.

### P5 — Bỏ MISA (sau khi ổn 1–2 tuần, QĐ-3)

Chỉ làm khi có số: đối chiếu **7 ngày liên tiếp** số bản ghi MISA vs số `Lead` theo nguồn, lệch 0.
Rồi: tắt `intake.mirrorMisa` → gỡ tab 6 (MISA) khỏi đặc tả site Sale → cập nhật BA doc 09 + `CLAUDE.md` (`proxy.ts:20` đang chú thích "site tĩnh → MISA AMIS CRM", sẽ sai).

---

## 4. Cạm bẫy phải nhớ

1. **Dedup 90 ngày nuốt lead thứ 2 — và trong dữ liệu thật đã có ca "cùng SĐT, KHÁC CON".** (§6-F4) Một PH đăng ký 2 con trong 2 phút (2 khối lớp khác nhau). Luật hiện tại chỉ ghi 1 `LeadActivity` NOTE ⇒ **mất hẳn đứa con thứ 2**. Model đã có `LeadChild` (N con / 1 lead) ⇒ xử lý đúng là **gắn thêm `LeadChild` vào lead cũ**, không phải chỉ log. **Cần user chốt** (xem §7-D1).
2. **`Lead.parentName` bắt buộc trong DB, form MISA chỉ bắt buộc tên học sinh.** Không có fallback thì lead rụng hàng loạt ngay ngày đầu.
3. **Endpoint công khai = bề mặt spam.** Honeypot + rate limit là mức tối thiểu; cân nhắc Turnstile nếu bị bơm.
4. **TZ:** `createdAt` là UTC, báo cáo theo giờ VN — đi qua `lib/time/vn.ts`, đừng `new Date(y,m,d)`.
5. **Nghiệm thu:** `sale.satarobo.vn` chỉ trỏ **prod**. Trên `test.satarobo.vn` host rơi vào nhánh "unknown" ⇒ vẫn mở được `test.satarobo.vn/sale/nhap-lieu.html` và form POST relative vẫn trúng API ⇒ **nghiệm thu được đủ luồng trên test**. Chỉ 2 thứ là prod-only: binding host thật + mirror MISA thật.
6. **DB test = DB local** (chung một Supabase) ⇒ lead nghịch lúc nghiệm thu sẽ hiện ở máy dev và ngược lại. Đặt SĐT test có tiền tố dễ lọc rồi dọn.
7. **Nhánh:** `feature → PR → test → nghiệm thu trên test.satarobo.vn → PR test → main`. Không đẩy thẳng main.

---

## 5. Ước lượng

| Giai đoạn | Công |
|---|---|
| P0 chốt đầu vào | 0,5 ngày (chờ user) |
| P1 lõi + test | 1 ngày |
| P2 site sale | 1–1,5 ngày |
| P3 quatang | 1 ngày |
| P4 quan sát + cảnh báo | 0,5–1 ngày |
| **Tổng** | **~4–5 ngày công** (chưa tính P5 bỏ MISA) |

Thứ tự đề nghị: **P1 → P2 trước** (tự chủ hoàn toàn, không chờ ai), P3 chạy song song ngay khi có thông tin sheet ở P0.

---

## 6. Số liệu THẬT đo từ sheet quatang (16/08/2026)

Đọc ~100 dòng đầu, 19/05/2026 → 10/07/2026. **Không chép PII vào đây** — chỉ ghi hình dạng dữ liệu.

**F1 — Sheet đã đổi schema 3 lần; dữ liệu cũ LỆCH CỘT so với hàng tiêu đề hiện tại.**

| Đợt | Khoảng | Hình dạng |
|---|---|---|
| A | 19/05 → 01/07 | **Thiếu** cột `Họ tên con` và `Tỉnh/Thành phố`; thứ tự `Lớp` **trước** `Trường` (ngược header). Giá trị nằm trong ô `Họ tên con` thực chất là tên **phụ huynh**. |
| B | 01/07 19:13 → 07/07 | Khớp header nhưng `Họ tên con` **trống toàn bộ**, không có `User Agent`. |
| C | 08/07 → nay | Khớp header đủ 22 cột. |

⇒ **Kết luận thiết kế: mapper phải khoá theo TÊN TRƯỜNG trong payload, tuyệt đối không theo vị trí cột.** (Không ảnh hưởng vận hành vì QĐ-2 không backfill, nhưng chứng minh payload site đã đổi hình — mapper phải chịu được đổi tiếp.)

**F2 — SĐT trong sheet BỊ HỎNG (mất số 0 đầu).** Xuất hiện đủ 4 dạng: 9 chữ số mất số 0 (`9xxxxxxxx`), có tiền tố `84`, có `0` đầu đàng hoàng, và **1 số chỉ 8 chữ số** (rác). Nguyên nhân: ô sheet định dạng số. Đây đúng landmine đã ghi trong memory *"Flake SĐT test mất số 0 đầu"*.
⇒ Lý do chốt bắt ở `doPost` chứ không đọc sheet. Kèm theo: `lib/lead/intake/phone.ts` phải chuẩn hoá **9 chữ số không bắt đầu bằng 0 ⇒ thêm 0**, và **số <9 chữ số ⇒ TỪ CHỐI, không đoán**.

**F3 — Cơ sở có 2 cách ghi khác nhau theo đợt.** Đợt A/B: `"211 Nguyễn Hữu Thọ"` / `"114 Hoàng Diệu"`. Đợt C: `"Cơ sở 1 - 211 Nguyễn Hữu Thọ, Đà Nẵng"` / `"Cơ sở 2 - 114 Hoàng Diệu, Đà Nẵng"`.
⇒ Khớp bằng **chuỗi con đã chuẩn hoá** (`211 nguyen huu tho` → CS1, `114 hoang dieu` → CS2), rồi tra `Center.code` trong DB. Không so bằng `===`, không hardcode id.

**F4 — Trùng lặp có thật, ~6% số dòng, và có 1 ca nguy hiểm.** Các dạng gặp: cùng người submit 2 lần trong 30 giây; cùng người cách 1 ngày với SĐT ghi 2 kiểu (`905…` và `84905…` — `phoneVariants` bắt được); cách 33 ngày. **Ca nguy hiểm: 1 PH submit 2 lần cách 2 phút cho 2 CON KHÁC NHAU (khối 3-4 và 8-9).** Luật dedupe hiện tại sẽ nuốt mất đứa thứ hai → §7-D1.

**F5 — Cột `MISA status` TRỐNG 100%; toàn bộ 6 cột `Aff *` cũng trống 100%.**
⇒ (a) Nhánh đẩy MISA của quatang **có thể đã hỏng sẵn / chưa từng chạy** — phải xem `doPost` mới biết. Nếu đúng vậy thì QĐ-3 "bỏ MISA" phía quatang gần như miễn phí. (b) Tracking affiliate chưa bao giờ bắn ⇒ map `Aff mã link` → `Lead.affiliateId` (qua `resolveAffiliateByCode`) cứ làm nhưng **không phải đường chính**, không chặn go-live.

**F6 — Cột `Trạng thái` / `Ghi chú` / `Tên NV giới thiệu` đang được SỬA TAY trong sheet.** Thấy giá trị `Mới`, `Đã liên hệ - Chưa đặt lịch`, `Đã đặt lịch hẹn` và tên nhân viên.
⇒ **Sale đang chăm lead ngay trong sheet.** Kéo về mà không dặn ⇒ **hai nguồn sự thật**, lead chăm 2 nơi. Phải có buổi chuyển giao: từ ngày X, sheet chỉ còn là bản ghi thô, mọi thao tác nằm ở admin/site Sale. Đây là việc **tổ chức**, không phải việc code, nhưng nó quyết định thành bại.

**F7 — `Họ tên phụ huynh` trống ở khá nhiều dòng** (cả đợt B trống `Họ tên con`, đợt C có dòng trống PH).
⇒ Fallback `parentName` là **bắt buộc cho cả 2 nguồn**, không riêng form Sale.

**F8 — Có dòng rác** (1 dòng chỉ có chữ `D`, vài dòng test của nội bộ). Mapper phải bỏ qua êm, ghi `WebhookDelivery` FAILED, không ném 500.

**F9 — Lưu lượng thấp: ~2 lead/ngày** (~100 dòng / 52 ngày). Rate limit và hiệu năng không phải vấn đề.

**F10 — ⚠️ Dòng cuối đọc được là 10/07/2026, cách hôm nay hơn 5 tuần.** Có thể do công cụ đọc cắt bớt file, **hoặc** form quatang đã ngừng chạy/ngừng ghi từ 10/07. **Phải xác nhận trước khi làm P3** — xây đường ống cho một cái vòi đã khoá thì vô nghĩa.

---

## 7. Quyết định (chốt 16/08/2026)

- **D1 — Trùng SĐT nhưng KHÁC tên con ⇒ gắn thêm `LeadChild` vào lead cũ** + 1 `LeadActivity` báo "PH đăng ký thêm con". Không đẻ lead thứ 2. Sale gọi 1 lần chốt được 2 suất.
  - Ràng buộc: chỉ gắn khi **tên con khác** (so sánh đã chuẩn hoá dấu/hoa-thường). Tên con **trùng hoặc trống** ⇒ giữ hành vi cũ (chỉ ghi `LeadDuplicate` + NOTE), tránh đẻ `LeadChild` rác từ ca submit 2 lần trong 30 giây (có thật, F4).
- **D2 — CÒN TREO:** ngày Sale ngừng chăm lead trong sheet (F6). Việc tổ chức, không chặn code, nhưng phải có mốc trước khi bật P3.
- **D3 — Form quatang VẪN CHẠY bình thường**; dòng cuối 10/07 chỉ là do công cụ đọc cắt bớt. P3 giữ nguyên ưu tiên.

### Hệ quả của D1 lên P1 (sửa thiết kế)

`LeadChild` có sẵn `fullName` / `schoolName` / `gradeLevel` / `interestedCenterId` — **khớp 1-1 với bộ trường của cả hai form**.
⇒ Đổi so với bản plan đầu: tên con / trường / lớp / cơ sở đi vào **`LeadChild` thật**, KHÔNG nhét vào blob `note`. `note` chỉ còn giữ thứ không có cột (tỉnh/TP, địa chỉ, mã NV không khớp, cảnh báo mapper).
⇒ `ingestLead()` nhận thêm `child?: { fullName, schoolName, gradeLevel, interestedCenterId }`:
  - lead mới ⇒ tạo lead + 1 `LeadChild` **trong cùng transaction**;
  - trùng SĐT + tên con mới ⇒ chỉ thêm `LeadChild` vào lead cũ;
  - trùng SĐT + tên con đã có ⇒ y như cũ.
  - `Lead.childName` vẫn set (con đầu tiên) để không vỡ UI/report đang đọc cột đó.

---

## 8. Đã dựng gì (16/08/2026) — nhánh `feat/lead-intake-quatang-sale`

### Kiến trúc thực tế

```
public/sale/nhap-lieu.html  ──POST form-urlencoded──►  /api/public/lead-intake/sale-form
   (chỉ đổi thuộc tính `action`)                              │
                                                              ▼
                          mapSaleForm()  ── hàm THUẦN, không chạm DB ──►  MappedLead
                                                              │
                                                              ▼
                          ingestIntakeLead()  ── ĐƯỜNG GHI DUY NHẤT ──►  Lead + LeadChild
                                                              │              + LeadActivity
                                                              ├─► mirror MISA (tắt được)
                                                              └─► autoAssignNewLead
```

`lib/lead/ingest.ts` (3 webhook cũ facebook/zalo/google-form) nay là **lớp bọc mỏng** gọi vào
cùng lõi ⇒ đúng một đường ghi cho mọi nguồn ngoài.

### File

| File | Vai trò |
|---|---|
| `lib/lead/intake/types.ts` | `MappedLead` / `CenterHint` — ranh giới mapper thuần ↔ tầng DB |
| `lib/lead/intake/normalize.ts` | `normalizeVi`, `matchCenter`, `isSameChildName`, fallback tên PH |
| `lib/lead/intake/map-sale-form.ts` | Bộ trường MISA → `MappedLead` |
| `lib/lead/intake/misa-provinces.ts` | 63 mã tỉnh MISA → tên (**sinh tự động** từ chính form) |
| `lib/lead/intake/ingest.ts` | Tra cơ sở/chủ sở hữu, chống trùng, QĐ-D1, tạo Lead |
| `lib/lead/intake/misa-mirror.ts` | Bản sao sang MISA — có ngày chết |
| `app/api/public/lead-intake/sale-form/route.ts` | Nhận POST trình duyệt, trả 303 / trang lỗi |

### Ba điều dễ hiểu nhầm

1. **`LastName` của MISA là TÊN HỌC SINH**, không phải họ phụ huynh. Tên PH ở `CustomField25`.
   Map ngược là hỏng toàn bộ dữ liệu.
2. **Không hardcode cơ sở.** `matchCenter()` là hàm thuần nhận danh sách cơ sở ĐỌC TỪ DB,
   khớp theo `code` → `name` → `address` là chuỗi con. Mơ hồ (≥2 khớp) ⇒ `null`, không đoán.
   Mở CS3 = thêm 1 dòng Center, không sửa code.
3. **Cờ mirror ở `SystemSetting`, tham số form MISA ở `env`.** Tắt mirror = 1 nút ở
   `/admin/cau-hinh-van-hanh`. Cờ BẬT mà thiếu env ⇒ log lỗi to, không im lặng.

### Đã kiểm

- `pnpm typecheck` · `pnpm lint` · `pnpm build` — xanh (route `/api/public/lead-intake/sale-form` có trong bảng build).
- **41 unit test** mapper/normalize (thuần, chạy mọi máy): `pnpm vitest run lib/lead/intake`.
- **9 test tích hợp DB thật**: `pnpm test:lead-intake` (tự SKIP khi không có Postgres local ⇒ CI không đỏ).
  Phủ: tạo Lead+LeadChild, **QĐ-D1 khác con**, cùng con không đẻ `LeadChild` rác, `0…`/`84…` nhận ra trùng,
  gán theo mã NV, mã NV sai vẫn tạo lead + cảnh báo, cơ sở lạ, idempotent theo `externalId`, và đường trọn vẹn form→DB.
- **Smoke HTTP thật** (dev server trỏ DB test local): tạo lead → `303 ?ok=1`; con thứ 2 → `303 ?ok=1&dup=1&child=1`;
  thiếu SĐT → `400` kèm thông báo tiếng Việt; honeypot → giả thành công và **không tạo lead**.
- **UTF-8**: chứng minh nguyên vẹn theo code point (`"Chị Đặng Thị Ánh Nguyệt"` round-trip khớp tuyệt đối).
  Chữ méo khi xem qua terminal Windows chỉ là lỗi hiển thị của shell, không phải dữ liệu.
- **375px**: không tràn ngang ở cả 2 trang; ô bẫy bot nằm ở `-9649px`, không kéo dài trang.
  Guard SĐT chặn submit tại chỗ, hiện lỗi inline, focus đúng ô, **không dùng `alert()`**.

### Việc phải làm khi go-live P2

1. *(tuỳ chọn)* Đặt `MISA_WEBFORM_ID` / `MISA_WEBFORM_COMPANYCODE` / `MISA_WEBFORM_KEY`
   trên Vercel Production nếu muốn **ghim cứng** tham số form. Bỏ trống cũng chạy: server
   lấy chính 3 input ẩn mà form gửi lên (đúng thứ trình duyệt vẫn gửi sang MISA từ trước),
   nên **không có bước ops nào có thể quên mà làm MISA tắt tiếng**.
2. Nghiệm thu trên `test.satarobo.vn/sale/nhap-lieu.html` — đường dẫn tự đổi sang
   `/sale/thank-you.html` trên host không phải sale, nên chạy được đủ luồng.
3. Sau khi lên prod: gửi 1 phiếu thật, kiểm lead hiện ở `/admin/leads` (lọc Nguồn = `sale-form`).

### Chưa làm (cố ý)

- **P3 quatang** — chờ mã `doPost`. Lõi + `matchCenter` đã sẵn sàng cho chuỗi cơ sở tự do.
- **P4** — màn `WebhookDelivery` + cảnh báo "nguồn X im lặng N giờ".
- Gộp 3 webhook cũ sang `autoAssignNewLead` (hiện giữ `assignStrategy: "legacy"` để KHÔNG
  đổi hành vi vận hành của facebook/zalo/google-form trong đợt này).

---

## 9. Vòng review đối kháng 16/08 — 13/24 phát hiện sống sót, đã vá hết

Chạy 4 lăng kính độc lập (đúng/sai · endpoint công khai · toàn vẹn dữ liệu · quy ước repo),
mỗi phát hiện bị một agent khác **cố bác bỏ** bằng cách đọc code thật. 11 bị bác, 13 đứng vững.
Tất cả đã vá + có test hồi quy.

### Hai lỗi mức CAO — đều là lead "còn sống nhưng không ai xử lý được"

| # | Lỗi | Vì sao nguy hiểm | Cách vá |
|---|---|---|---|
| 1 | `resolveOwner` gán lead cho **bất kỳ** nhân viên nào khớp mã NV | Ô mã NV là BẮT BUỘC trên form ⇒ giáo viên/lễ tân thu số ở sự kiện cũng gõ mã của mình. Lead thành `ASSIGNED` cho người **không có quyền xử lý lead**, và `autoAssignNewLead` thoát sớm ⇒ không ai được chia lại. Phá bất biến mà `manualAssignLead`/`getSalesLoad`/`getSaleStats` đều giữ. | Chỉ gán khi tài khoản giữ vai `SALES_CSM`; không thì cảnh báo + để auto-chia. Công người nhập vẫn ghi trong `note`. |
| 2 | `centerId` (từ ô cơ sở) và cơ sở của người nhập **không đối chiếu** | Sale CS1 nhập cho gia đình học CS2 ⇒ `centerId=CS2, assignedToId=<sale CS1>`. `Lead ∈ SCOPED_MODELS` nên `scopedDb` giấu lead khỏi **chính người được gán**; auto-chia đã thoát ⇒ lead nằm chết. | Cơ sở của **gia đình thắng**; lệch cơ sở thì không gán người nhập, để auto-chia chọn Sale đúng cơ sở + ghi rõ lý do vào `note`. |

### Mười một lỗi còn lại

- **Cảnh báo bị nuốt ở nhánh trùng SĐT** — `buildNote` chỉ chạy ở nhánh tạo lead mới, nên mã NV sai / cơ sở lạ / thiếu tên PH bốc hơi. → thêm `recordIntakeNotes()` ghi vào `LeadActivity` của lead cũ.
- **Con thứ hai bị chôn vào hồ sơ ĐÃ ĐÓNG** — nhà cho con cả nhập học rồi hỏi cho con thứ hai trong 90 ngày: `findRecentDuplicate` không lọc trạng thái ⇒ gắn `LeadChild` vào lead `ENROLLED`, không sinh việc cho ai. → hồ sơ ở `TERMINAL_LEAD_STATUSES` thì **tạo lead mới**, vẫn ghi `LeadDuplicate` để truy vết.
- **Chốt `content-length` bỏ qua được** — HTTP/2 không gửi header đó, `Number(null ?? 0)` = 0 lọt mọi so sánh. → đo lại chính chuỗi đã đọc.
- **Không có trần độ dài trường** trên endpoint công khai (đường lead kia có). → trần theo `lib/validators/lead.ts`, báo đúng tên trường; email sai định dạng thì cảnh báo chứ không chặn phiếu.
- **Mirror MISA hỏng chỉ có `console.error`** — không tới Sentry, không ai đọc log Vercel. → ghi `WebhookDelivery(source="misa-mirror", FAILED)` để thấy được và gửi lại được.
- **Honeypot dính là mất phiếu không dấu vết** → ghi cả payload vào `WebhookDelivery`; đổi tên ô `website` → `sr_website` (tên cũ dễ bị trình quản lý mật khẩu tự điền ⇒ nuốt lead thật).
- **Ô "Cơ sở" âm thầm mặc định CS1** — `<select>` không có option trống nên phiếu không đụng tới ô này vẫn gửi `CustomField17=1`. Đây chính là ngòi nổ của lỗi #2. → thêm `— Chọn cơ sở —` + guard bắt chọn.
- **Nút trên trang cảm ơn trỏ cứng PROD** — nghiệm thu trên test bấm nút là nhảy sang `sale.satarobo.vn`, phiếu thử tiếp theo đẻ **lead thật trên prod**. → ở lại đúng host đang đứng.
- **CI không chạy `tests/lead-intake`** — job `unit-tests` không có Postgres nên skip sạch; job `chat-db-tests` (nơi duy nhất có Postgres) không gọi. Xoá trắng luật D1 mà CI vẫn xanh. → thêm bước `pnpm test:lead-intake`.
- **3 webhook cũ bị đổi hành vi ngoài ý muốn** (đẻ `LeadChild` từ tên moi ở text tự do + dính luật D1 + SĐT thô bị từ chối). → gom về **một** cờ `legacyWebhook: true`, giữ nguyên 100% hành vi cũ.
- **`MappedLead.landingPage` là field chết** → gỡ khỏi kiểu.

### Không vá (có chủ đích)

- **Đua 2 request song song cùng SĐT mới** có thể đẻ 2 lead: `findRecentDuplicate` là read-then-write không khoá. Giống hệt `/api/leads` đang chạy, lưu lượng ~2 lead/ngày, và client đã disable nút Gửi. Muốn triệt để thì cần unique index — việc riêng.
- `/api/leads` (form khách công khai) **vẫn** gắn con vào hồ sơ đã đóng như cũ; đợt này chỉ sửa đường intake mới. Nếu muốn thống nhất thì làm ở P4.

### Số cuối

`typecheck` · `lint` · `build` xanh · **48 unit test** · **13 test tích hợp DB** (thêm 4 ca hồi quy đúng cho
2 lỗi CAO + cảnh báo bị nuốt + hồ sơ đóng) · smoke HTTP lại đủ 5 đường đã sửa · guard UI kiểm trên trình duyệt.

---

## 10. P4 — nhìn thấy được & không chết im (16/08/2026)

Không có phần này thì cả đợt là một đường ống **không có đồng hồ**: form vẫn hiện, người nhập
vẫn thấy trang cảm ơn, lead cứ thế không về mà chẳng ai biết. Đúng hình dạng sự cố webhook SePay
(401 im lặng 6 ngày, nuốt 4 giao dịch ~26,8 triệu).

### Đã có sẵn, không phải xây lại

Trang `/admin/crm/webhook-replay` vốn liệt kê **mọi** `WebhookDelivery` FAILED, nên phiếu lỗi của
đợt này (`sale-form` khi honeypot dính, `misa-mirror` khi MISA từ chối) **tự hiện ở đó**.

### Việc thêm

**1. Replay được cho 2 nguồn mới** (`lib/crm/webhook-replay.ts`) — trước chỉ `facebook-messenger`,
nguồn khác ném `SOURCE_UNSUPPORTED`, tức nhìn thấy mà không cứu được.
- `sale-form` → map lại + `ingestIntakeLead`. **Bỏ ô bẫy bot trước khi map**, không thì replay
  rơi vào đúng cái bẫy cũ. Trùng SĐT ⇒ tính là xong, không phải lỗi.
- `misa-mirror` → gửi lại sang MISA; cờ đang tắt / thiếu tham số / MISA vẫn từ chối đều báo
  lý do RIÊNG chứ không gộp thành "thất bại".

**2. Cron canh sức khoẻ** — `lib/lead/intake/health.ts` + `/api/cron/lead-intake-health`,
chạy **mỗi giờ** (`35 * * * *`), đẩy `StaffNotification` cho SUPER_ADMIN (dedupe chống spam).

Hai tín hiệu, **cố ý khác bản chất**:

| Tín hiệu | Cách dò | Vì sao làm thế |
|---|---|---|
| `failing` | ≥ N phiếu FAILED của cùng 1 nguồn trong 1 giờ (`intake.alertFailedPerHour`, mặc định 3) | Tín hiệu TRỰC TIẾP, không cần biết lưu lượng bình thường |
| `silent` | Nguồn có **≥7 lead trong 7 ngày trước** mà **0 lead trong 24 giờ qua** (`intake.alertSilentHours`) | So với **nền của chính nguồn đó**, KHÔNG đặt ngưỡng tuyệt đối |

> Vì sao không đặt ngưỡng cứng kiểu "0 lead trong 6 giờ ⇒ kêu": lưu lượng thật chỉ **~2 lead/ngày**
> (đo trên sheet quatang, §6-F9). Ngưỡng cứng ở mức đó kêu suốt ngày, bị phớt lờ, rồi **lần hỏng
> thật cũng bị phớt lờ theo**. Một bộ dò hay báo động giả còn tệ hơn không có bộ dò nào.

Khoá dedupe mang **ngày/giờ VN** (`lib/time/vn.ts`) chứ không phải UTC — cron chạy trên UTC còn
người đọc thông báo sống ở +07; lệch múi giờ là cảnh báo bị gom nhầm ngày.

### Test (8 ca, `tests/lead-intake/health.spec.ts`)

Phần đáng test nhất **không phải "có kêu không" mà là "có kêu SAI không"**:
dưới ngưỡng ⇒ im · lỗi cũ hơn 1 giờ ⇒ không kêu lại · **nguồn lưu lượng thấp im 1 ngày ⇒ KHÔNG kêu** ·
nguồn vẫn đang về lead ⇒ không kêu dù nền dày · nguồn ngoài danh sách canh ⇒ bỏ qua ·
khoá dedupe đúng giờ VN (17:00 VN chứ không phải 10:00 UTC).

> Chính bộ test này bắt được một lỗi rò dữ liệu giữa các ca: các ca "im lặng" buộc phải dùng
> tên nguồn THẬT (`sale-form`) vì bộ dò chỉ xét `MONITORED_SOURCES`, nên hàm dọn lọc theo tiền tố
> nguồn đã bỏ sót chúng — lead ca trước đẩy nền ca sau vượt ngưỡng. Nay dọn theo `parentName`.

### Còn thiếu (không chặn go-live)

- Chưa gửi email/ZNS — mới dừng ở chuông `StaffNotification` trong admin.
- `quatang` đã nằm trong `MONITORED_SOURCES` nhưng chưa có lead nào, nên nhánh `silent`
  chỉ thực sự có ý nghĩa sau khi P3 chạy.

---

## 11. P3 quatang — ĐÃ DỰNG (16/08/2026)

Anh gửi mã `doPost` v2.5, nên phần đoán mò biến mất. Ba điều đọc ra từ script:

**a) MISA KHÔNG do Apps Script đẩy.** Trong script không có `UrlFetchApp` nào tới MISA — nó chỉ
*ghi lại* giá trị `misa_status` mà **site** gửi lên. Cột U trống 100% ⇒ site đang gửi rỗng.

**b) Cảnh báo email của chính script chưa từng chạy được.** Guard là
`if (misaStatus && misaStatus !== 'OK')` — chuỗi rỗng là falsy ⇒ nhánh gửi mail không bao giờ vào.
Cái lưới "không im lặng" (FR-E04) tự nó đang im lặng. Mapper của ta nay đẩy `misa_status ≠ OK`
thành cảnh báo trên chính lead, để nó không chỉ nằm ở sheet.

**c) IP trong payload là IP THẬT của phụ huynh.** Request tới ta xuất phát từ máy chủ Google
(Apps Script) nên `x-forwarded-for` là IP của Google. `quatangClientMeta()` lấy `ip`/`user_agent`
từ payload — không thì mọi lead quatang mang chung một IP và trường đó thành vô nghĩa.

### File

| File | Vai trò |
|---|---|
| `lib/lead/intake/map-quatang.ts` | JSON của `doPost` → `MappedLead` (thuần, 30 unit test) |
| `app/api/public/webhook/quatang/route.ts` | Adapter cắm vào `processLeadWebhook` |
| `lib/lead/webhook.ts` | Thêm `LeadWebhookAdapter` (tuỳ chọn) + `WEBHOOK_QUATANG_SECRET` |
| `docs/lead-intake/apps-script-quatang-snippet.js` | **Đoạn dán vào `doPost`** + hàm gửi lại dòng lỗi |

Hợp đồng trường: `ho_ten_con` · `ho_ten` · `sdt` · `email` · `truong` · `lop` · `co_so` · `tinh` ·
`ip` · `user_agent` · `aff_ma_nv` · `aff_ten_nv` · `aff_ma_link_cuoi/dau` · `aff_click_id` ·
`aff_utm` · `misa_status` · `event_id`.

### 🐞 Bug bắt được lúc đối chiếu `prisma/seed.ts` — sẽ nổ trên prod

`Center("hoi-so")` có **`address = "Đà Nẵng"`**, mà chuỗi cơ sở của quatang **luôn kết thúc bằng
`", Đà Nẵng"`**. Bản `matchCenter` đầu tiên đòi "khớp đúng 1 cơ sở" ⇒ CS1 và Hội sở cùng khớp ⇒
trả `null` ⇒ **toàn bộ lead quatang mất cơ sở**. DB test local không có Hội sở nên smoke không lộ;
chỉ lộ khi đọc dữ liệu seed thật.

Vá hai lớp:
1. **Loại cơ sở không nhận ghi danh** trước khi khớp, dùng đúng `getNonEnrollableCenterIds()` mà
   `autoAssignNewLead` đang dùng — hai đường không được lệch nhau.
2. **Cụ thể nhất thắng**: địa chỉ khớp DÀI NHẤT ăn (`"211 Nguyễn Hữu Thọ"` > `"Đà Nẵng"`). Chỉ khi
   hai địa chỉ dài BẰNG NHAU mới thật sự là mơ hồ ⇒ `null`.

Hồi quy: 3 ca unit + 1 "Hội sở" giả lập thêm hẳn vào fixture DB.

### Đã kiểm

- 76 unit test (thêm 30 ca quatang) · 22 test tích hợp DB.
- **Smoke HTTP thật** qua cổng secret: không secret → 401 · secret sai → 401 · secret đúng → 200
  tạo lead · gửi lại y hệt → `duplicate: true`, KHÔNG đẻ lead thứ hai · SĐT 8 chữ số → `ok:false`
  kèm `WebhookDelivery` FAILED (gửi lại được).
- SĐT `935269128` (sheet nuốt số 0) → lưu `84935269128`; IP lấy đúng từ payload.

### Việc của anh (theo thứ tự)

1. Script Properties: `SATAROBO_WEBHOOK_URL` + `SATAROBO_WEBHOOK_SECRET`
   (trỏ `test.satarobo.vn` trước).
2. Đặt `WEBHOOK_QUATANG_SECRET` trên Vercel (env `test`, sau đó Production) — **trùng tuyệt đối**.
3. Dán 3 khối trong `apps-script-quatang-snippet.js` → thêm `'SR status'` vào `HEADERS` →
   chạy `setupHeaders()` → Deploy **New version**.
4. Gửi 1 phiếu thật trên quatang → cột W phải ra `OK`, lead hiện ở `/admin/leads` (Nguồn `quatang`).
5. Chạy ổn thì đổi URL sang `https://satarobo.vn/api/public/webhook/quatang`.

⚠️ **Thiếu 2 Script Property ⇒ script BỎ QUA im lặng**, sheet vẫn ghi như cũ — cố ý, chưa cấu hình
xong thì không được làm gãy luồng đang chạy.

---

## 12. Nghiệm thu THẬT trên `test.satarobo.vn` (16/08/2026, sau khi CI xanh)

Bắn HTTP thật vào `test.satarobo.vn` rồi **đọc ngược trong DB** (DB của env `test` chính là DB dev
nên `.env` local đọc thẳng được). Dữ liệu nghiệm thu đã dọn sạch sau khi đo (`lead=0 · child=0 ·
activity=0 · duplicate=0 · webhookDelivery=0`).

| # | Việc | Kết quả đo |
|---|---|---|
| 1 | `GET /sale/nhap-lieu.html` | `200`, `action="/api/public/lead-intake/sale-form"`, có ô bẫy `sr_website`, có option `— Chọn cơ sở —` |
| 2 | Gửi 1 phiếu | `303 → /sale/thank-you.html?ok=1` · Lead tạo đúng |
| 3 | Gửi lại y hệt | `303 → ?ok=1&dup=1` · **không** đẻ lead thứ hai |
| 4 | Con thứ hai cùng SĐT (QĐ-D1) | `303 → ?ok=1&dup=1&child=1` · lead cũ có **2 `LeadChild`** |
| 5 | Bot dính bẫy `sr_website` | `303 → ?ok=1` (giả thành công) · **0 lead** · có `WebhookDelivery` FAILED kèm IP |
| 6 | Thiếu SĐT | `400` kèm thông báo tiếng Việt |
| 7 | Cron mới `/api/cron/lead-intake-health` | `401` — **không phải 308**, không tái diễn sự cố canonical 10/08 |

Đọc trong DB thấy đúng như thiết kế:

- `parentName = "Chị Đặng Thị Ánh Nguyệt"` — **UTF-8 nguyên vẹn qua đường thật**.
- `center = CS1`, `assignedTo = <tài khoản giữ vai SALES_CSM>`, `status = ASSIGNED`
  ⇒ hai lỗi mức CAO ở §9 **không tái phát trên môi trường thật**.
- Nhánh trùng SĐT có ghi `LeadActivity`: `[Trùng SĐT]` · `[Phiếu mới cùng SĐT]` · `[Thêm con]`
  ⇒ cảnh báo không bị nuốt.
- `WebhookDelivery(misa-mirror, FAILED)`: *"Thiếu env MISA_WEBFORM_ID/COMPANYCODE/KEY"*
  ⇒ **lưới "MISA tắt tiếng" hoạt động**. (Phiếu nghiệm thu cố ý không mang 3 input ẩn nên
  không có gì lọt sang CRM thật của MISA.)

### Chốt chặn duy nhất còn lại của P3

`POST /api/public/webhook/quatang` trên test trả **`503 {"ok":false,"error":"Webhook chưa cấu hình secret"}`**
⇒ **`WEBHOOK_QUATANG_SECRET` CHƯA được đặt trên env `test`**. Đây là số đo, không phải suy đoán:
`503` = server chưa có secret, `401` = đã có secret (và phía gọi gửi sai). Khi nào endpoint này đổi
sang `401` thì đường quatang mới sẵn sàng nhận Apps Script.

⚠️ Cron `/api/cron/lead-intake-health` **không chạy trên `test`** (Vercel Cron chỉ chạy ở Production;
`cron-pump-test.yml` chỉ bơm `dispatch-events`/`email-queue`/`chat-zns-notify`). Lưới "nguồn im lặng"
chỉ thực sự sống sau khi merge `main`.
