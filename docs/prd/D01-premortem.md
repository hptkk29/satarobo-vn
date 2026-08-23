# PRE-MORTEM — JOB D-01: cron đồng bộ chi tiêu Facebook Ads

**Phạm vi:** CHỈ job D-01 (*"Cron 00:00 hằng ngày, quét chi tiêu và lưu snapshot theo từng ngày vào DB"*)
và những gì phụ thuộc trực tiếp vào con số nó sinh ra (D-03, D-04, D-05, D-06, D-07, D-08).
Không mở rộng sang B/C/E/F/G trừ chỗ mẫu số của D nằm ở đó.

**Nguồn spec:** `docs/specs/spec-dashboard-qlcs-duyet-media-lead.md` — KHU VỰC D.
**PRD nền:** `docs/prd/A-nen-tang.md` (§6.2 bộ lọc A-02, §10.4 nợ chặn D), `docs/prd/G-lead.md` (§6.3.b campaign/adset/ad).
**Nhánh khảo sát:** `hptkk29/runhop20_08`.

> **CÂU HỎI TRUNG TÂM:** job này có thể **âm thầm cho ra số SAI mà không ai phát hiện** bằng những cách nào,
> và cơ chế đối soát nào bắt được?

**Quy ước đọc tài liệu này:**

- Mọi khẳng định hiện trạng kèm `file:dòng`, đọc trực tiếp trên nhánh này.
- **MÃ CHẾT** = hàm/model tồn tại nhưng không có call-site sản phẩm (chỉ test gọi).
- **CHƯA CÓ** = grep toàn repo không ra kết quả.
- Chú thích trong mã nguồn được coi là **lời khai cần kiểm chứng**, không phải sự thật. Chỗ nào tài liệu này
  dựa vào chú thích (vd mô tả sự cố 20 cron ở `proxy.ts:122-131`) thì ghi rõ đó là chú thích.

---

## 0. Vì sao job này thuộc loại "sai im lặng", không phải "hỏng ồn ào"

Ba tính chất cộng lại tạo ra vùng mù. Thiếu bất kỳ tính chất nào thì lỗi đã tự lộ:

| # | Tính chất | Bằng chứng |
|---|---|---|
| 1 | **Không ai biết số đúng là bao nhiêu.** Chi phí QC nằm ở hệ thống bên ngoài (Ads Manager); người đọc dashboard không đối chiếu hằng ngày. | Không có màn nhập tay chi phí, không có bản ghi đối soát nào: `upsertDraftCost` (`lib/crm/cost-allocation.ts:40`) là **MÃ CHẾT** |
| 2 | **Mọi kiểu hỏng đều ra một con số hợp lệ.** Chia-0 trả `0` (`lib/crm/cost-allocation.ts:18,23`); UPSERT giữ nguyên số cũ khi job không chạy; parser hụt gom vào một rổ. Không kiểu hỏng nào trả `null`, `NaN`, hay lỗi hiển thị. | `computeCpl`/`computeCpa` `lib/crm/cost-allocation.ts:17-24`; `ratio` `lib/crm/marketing-metrics.ts:21` |
| 3 | **Không có bản ghi nào chứng minh job đã chạy.** `withCron` chỉ `console.error` khi lỗi, không ghi gì khi thành công. | `lib/cron/handler.ts:16-27` |

Đối chiếu: repo **đã** có 2 job xây đúng hướng ngược lại — `orgunit-drift` ghi `OrgUnitDriftRun`
(`prisma/schema.prisma:6706-6717`) và `chat-membership-reconcile` ghi `ConversationReconcileRun`
(`:6623-6634`). D-01 không có gì tương đương, và đó là khoảng cách phải lấp **trước** khi bật.

---

## 1. Hiện trạng khu vực D — cái gì đã có, cái gì là MÃ CHẾT, cái gì CHƯA CÓ

| Thành phần | Trạng thái | Bằng chứng |
|---|---|---|
| `syncMetaAds()` — gọi Meta Graph API | **MÃ CHẾT** | `lib/crm/ads-insights.ts:78-99`. Grep call-site: chỉ chính nó — **0 file trong `app/`** |
| `upsertAdsInsight()` — đường ghi duy nhất | **MÃ CHẾT** + **GHI ĐÈ** | `lib/crm/ads-insights.ts:52-72`. Chỉ `tests/e2e/r1/ads-insights.spec.ts:17,19,27,28` gọi |
| `parseMetaInsights()` | Có, THUẦN, có test | `lib/crm/ads-insights.ts:24-41`; test `lib/crm/ads-insights.test.ts` |
| `upsertDraftCost` / `confirmCostPeriod` / `reopenCostPeriod` | **MÃ CHẾT** | `lib/crm/cost-allocation.ts:40/63/82`. Chỉ `tests/e2e/r1/cost-allocation.spec.ts` gọi |
| `AdsInsightDaily` — bảng snapshot | Có, nhưng **không đủ chiều** | `prisma/schema.prisma:948-961`. **KHÔNG** `centerId`, **KHÔNG** `orgUnitId`, **KHÔNG** campaign/adset/ad. Khoá tự nhiên `@@unique([date, channel])` (`:959`) |
| `MarketingCostPeriod` | Có, **không tách được cơ sở** | `prisma/schema.prisma:936-945`. `period String @unique` (`:938`), không có `centerId` |
| Trang đọc số `/admin/marketing/funnel` | **CÓ THẬT, đang chạy** | `app/(admin)/admin/marketing/funnel/page.tsx:26,35-38` — 4 ô Chi phí QC · CPL · CPA · ROAS |
| Cron job cho ads | **CHƯA CÓ** | `vercel.json` có **đúng 23** cron, khớp 23 thư mục `app/api/cron/*`; không có `ads` |
| Parser tên campaign (D-06) | **CHƯA CÓ** | `SR.QD.232` chỉ tồn tại dưới dạng văn bản kế hoạch trong `docs/specs/…` |
| Bảng mapping override campaign→cơ sở (D-07) | **CHƯA CÓ** | Grep schema: 0 model |
| `Lead.campaignId` / `adsetId` / `adId` | **CHƯA CÓ** | Grep `prisma/schema.prisma`: 0 hit. Chỉ có `utmSource/utmMedium/utmCampaign/utmContent/utmTerm` (`:1328-1332`) + `fbclid/gclid/fbp/fbc` |
| Quyền `ads:*` / `marketing:*` | **CHƯA CÓ** | Grep `lib/permissions/registry/` + `lib/auth/permissions.ts` + `prisma/seed-roles.ts`: 0 hit |
| Cron làm mới token Meta | **CHƯA CÓ** | `vercel.json:40-43` chỉ có `zalo-token-refresh`. `META_PAGE_ACCESS_TOKEN` là env tĩnh (`.env.example:80`, `documentation/variables.md:91`) |
| Bản ghi lần chạy job cho ads | **CHƯA CÓ** | — |

**Suy ra (chưa đo trên DB prod — đây là suy luận từ mã, không phải phép đo):** không có call-site sản phẩm
nào ghi vào `AdsInsightDaily` ⇒ bảng nhiều khả năng **RỖNG** trên prod ⇒ `/admin/marketing/funnel` đang hiển
thị `Chi phí QC 0 · CPL 0 · CPA 0 · ROAS 0`. **Việc đầu tiên phải làm là ĐO, không phải tin dòng này.**

---

## 2. Bản đồ 11 đường sai im lặng

Mã `IM-xx` dùng riêng trong tài liệu này (không đụng `SL-xx` của `A-nen-tang.md` §10).

| Mã | Đường sai | Số hiện ra khi hỏng | Có dấu hiệu trong app? |
|---|---|---|---|
| IM-01 | Job không chạy | **Số cũ, không đổi** (do UPSERT) hoặc 0 | ❌ Không |
| IM-02 | Meta trả dữ liệu chưa chốt (attribution) | Thấp hơn thực, hợp lệ | ❌ Không |
| IM-03 | Token hết hạn / bị thu hồi | Số đứng hình từ một ngày trở đi | ❌ Không |
| IM-04 | UPSERT ghi đè lịch sử | Số mới đè số cũ, **mất dấu vết** | ❌ Không — đường DUY NHẤT không để lại vết nào |
| IM-05 | Parser tên campaign hụt/sai | Tiền rơi vào `CHƯA PHÂN BỔ`, hoặc **rơi nhầm cơ sở khác** | ⚠️ Chỉ khi có D-08 — hiện **CHƯA CÓ** |
| IM-06 | Múi giờ tài khoản QC ≠ giờ VN | Lệch đúng 1 ngày; lộ ở ranh giới cuối tháng | ❌ Không |
| IM-07 | Đơn vị tiền (USD vs VND) | Sai ~26.000 lần, ROAS vọt lên | ⚠️ Số quá đẹp — dễ bị coi là "cuối cùng cũng có số" |
| IM-08 | Chạy một phần rồi lỗi giữa chừng | Ngày đó **có** số nhưng thiếu campaign | ❌ Không |
| IM-09 | Chạy hai lần (retry) | Cộng đôi — nếu bỏ UPSERT mà thiếu khoá | ❌ Không |
| IM-10 | Lead không nối được campaign / mẫu số rỗng | **CPL = 0, CPA = 0** | ⚠️ Trùng hình với "chưa tiêu tiền" |
| IM-11 | `funnel-query.ts:15` aggregate không có `where` | Mọi cơ sở thấy chi phí toàn hệ thống | ❌ Không |

---

### IM-01 — Job KHÔNG CHẠY mà không ai biết

**Cơ chế sai (4 lớp độc lập, mỗi lớp đủ để giết job):**

1. **Tiền lệ có thật trên chính prod này.** Chú thích tại `proxy.ts:122-131` khai: mọi cron chết im từ lúc
   dựng vì Vercel Cron gọi vào URL deployment (`satarobo-vn.vercel.app`), request rơi vào nhánh canonical-hoá
   rồi ăn 308 sang host thật; header `Authorization: Bearer` **rụng khi đổi host** nên có follow redirect
   cũng 401. Triệu chứng khai kèm: `DomainEvent` tích 285 dòng `PENDING`, `attempts = 0`, không log lỗi,
   không ai biết. Đã vá bằng `if (isInfraPath(pathname)) return NextResponse.next();` (`proxy.ts:132`) —
   nhưng lớp vá đó chỉ đúng chừng nào `/api/*` còn nằm trong `isInfraPath` (`lib/auth/route-policy.ts`).
   **Đây là chú thích, phải kiểm lại `isInfraPath` trước khi tin.**
2. **`CRON_SECRET` thiếu hoặc lệch.** `verifyCronAuth` trả `false` và chỉ `console.warn`
   (`lib/cron/auth.ts:10-13`); route trả 401 (`lib/cron/handler.ts:13-15`). Đã xảy ra trên môi trường test:
   `cron-pump-test.yml:36-39` phải thêm hẳn thông báo lỗi riêng vì *"đỏ suốt cả ngày vì lệch secret, không ai
   đọc log"*.
3. **`withCron` không lưu vết.** Thành công → trả JSON, không ghi DB. Thất bại → `console.error`
   (`lib/cron/handler.ts:22`) rồi 500. Log Vercel có hạn lưu trữ và không ai mở nó hằng ngày.
4. **Trên `test.satarobo.vn`, Vercel Cron KHÔNG chạy.** Bằng chứng cứng, không phải suy đoán:
   `/api/cron/orgunit-drift` **có** đăng ký trong `vercel.json:88-91`, nhưng `OrgUnitDriftRun` **rỗng** trên
   DB test cho tới khi có người thêm job bơm riêng — `cron-pump-test.yml:47-55` ghi rõ. Tức **"đã đăng ký
   trong `vercel.json`" ≠ "đã chạy"**, và nghiệm thu trên test sẽ **không** phát hiện.

**Dấu hiệu quan sát được:** không có dấu hiệu nào trong ứng dụng. Do đường ghi là UPSERT, số của ngày cũ vẫn
nằm nguyên trong bảng ⇒ tab D hiển thị số > 0, trông y hệt bình thường. Người duy nhất phát hiện được là
người tình cờ để ý *"chi phí hôm nay giống hệt hôm qua"* — mà chi phí QC thật cũng hay giống nhau, nên tín
hiệu đó vô dụng.

**Cách bắt:**
- Bảng `AdsSyncRun` (§9.1) — mỗi lượt chạy một dòng, **kể cả lượt không ghi được dòng nào**.
- Cảnh báo "N ngày không có lần chạy THÀNH CÔNG nào" (§9.3) — bắt cả 4 lớp trên bằng một tín hiệu.
- Thêm endpoint vào `cron-pump-test.yml` kèm assert giống job `doi-soat-dem` (`:56-78`); nếu không thì trên
  test job này vĩnh viễn không chạy.

---

### IM-02 — Meta trả DỮ LIỆU CHƯA CHỐT (attribution window)

**Cơ chế sai:** `syncMetaAds` gọi `time_range={since,until}` + `time_increment=1`
(`lib/crm/ads-insights.ts:91-92`) rồi ghi thẳng. Facebook điều chỉnh `spend` của một ngày trong nhiều ngày
sau (loại click gian lận, đối soát thanh toán, hoàn tiền). Snapshot ngày N lấy vào N+1 **khác** số của chính
ngày N nhìn vào N+7.

Với thiết kế hiện tại có đúng hai lối, cả hai đều sai:

| Lối đi | Hậu quả |
|---|---|
| Chỉ chạy 1 lần cho ngày N−1 | Số **đóng băng ở bản chưa chốt** (thường thấp hơn thực) ⇒ CPL/CPA thấp giả, ROAS cao giả, **vĩnh viễn** |
| Chạy lại cửa sổ N−7…N−1 mỗi đêm | Số **đổi ngược về quá khứ**; báo cáo tháng đã gửi BGĐ tuần trước hôm nay ra số khác — và vì UPSERT (IM-04) nên **không chứng minh được** là do Meta điều chỉnh hay do job hỏng |

**Dấu hiệu quan sát được:** tổng spend tháng trong hệ thống **thấp hơn** tổng trên Ads Manager, và khoảng
chênh **nhỏ dần** khi so ở thời điểm muộn hơn. Trong ứng dụng: không dấu hiệu nào.

**Cách bắt:**
- Trên mỗi dòng snapshot lưu **cả ba**: `spendFirstSeen`, `spend` (mới nhất), `restatedCount` (số lần Meta
  đổi số của ngày đó). Ngày nào `restatedCount` nhảy bất thường là ngày cần soi.
- Đối soát tổng kỳ với Ads Manager (§9.2) — cơ chế **duy nhất** bắt được IM-02 từ bên ngoài.
- **Chốt chính sách khoá sổ**: sau X ngày (đề xuất 7) thì kỳ đóng, số không đổi nữa. Mô hình
  `DRAFT → CONFIRMED → REOPENED` đã có sẵn ở `lib/crm/cost-allocation.ts:40-101` — nhưng **toàn bộ đường ghi
  đó là MÃ CHẾT**, dùng lại nghĩa là phải xây màn cho nó, không phải "đã có".

---

### IM-03 — Token hết hạn / bị thu hồi ⇒ job chết câm

**Cơ chế sai:**

```
lib/crm/ads-insights.ts:84-88   thiếu env    → throw AdsError("META_CREDENTIALS_MISSING")
lib/crm/ads-insights.ts:94-95   res.ok=false → throw AdsError("META_API_ERROR", `Meta API lỗi ${res.status}`)
lib/cron/handler.ts:21-27       catch        → console.error + HTTP 500. KHÔNG ghi DB, KHÔNG gửi thông báo.
```

Token Meta bị vô hiệu khi: người cấp đổi mật khẩu, gỡ app khỏi tài khoản, đổi vai trò trong Business Manager,
hoặc Meta thu hồi vì chính sách. Tất cả nằm ngoài tầm kiểm soát của hệ thống và **không báo trước**.
`META_PAGE_ACCESS_TOKEN` là env tĩnh (`.env.example:80`); **CHƯA CÓ** cron làm mới — `vercel.json:40-43` chỉ
có `zalo-token-refresh`, và job đó tồn tại chính vì bài học *"token sống ~3 tháng không được để chết trong
giai đoạn ít gửi tin"* (`app/api/cron/zalo-token-refresh/route.ts:8-10`).

**Dấu hiệu quan sát được:** từ một ngày trở đi **không có dòng mới**, các ngày cũ vẫn nguyên. Biểu đồ "đứng
hình" chứ không rỗng — trông giống *"hết chiến dịch"* hơn là *"hỏng"*.

**Cách bắt:**
- Cùng cơ chế IM-01 (không có lần chạy thành công N ngày).
- Nhưng phải **tách mã lỗi**: lưu `errorCode` vào `AdsSyncRun` và bắn cảnh báo **riêng** cho lỗi xác thực
  (Meta trả `error.code = 190`). Cách xử khác hẳn: lỗi mạng thì chờ, lỗi 190 thì phải có người đi lấy token
  mới **ngay**. Gộp hai loại vào một cảnh báo là biến việc khẩn thành việc thường.
- `syncMetaAds` hiện **không đọc body lỗi** (`:95` chỉ lấy `res.status`) ⇒ không phân biệt được 190 với 400
  khác. Phải sửa khi viết lại.

---

### IM-04 — UPSERT ghi đè lịch sử (trái thẳng câu chữ D-01)

**Cơ chế sai:**

```ts
// lib/crm/ads-insights.ts:55-71
return db.adsInsightDaily.upsert({
  where: { date_channel: { date: record.date, channel: record.channel } },  // :56
  update: { spend: record.spend, ... },                                     // :57-62  ← ĐÈ
  create: { ... },
});
```

Khoá tự nhiên `@@unique([date, channel])` (`prisma/schema.prisma:959`). Chạy lại một ngày = **xoá vĩnh viễn**
số cũ. Spec D-01 nói nguyên văn *"lưu snapshot theo từng ngày vào DB (bất biến, **không ghi đè lịch sử**)"* —
đường ghi duy nhất đang tồn tại làm **đúng điều bị cấm**.

**Dấu hiệu quan sát được: KHÔNG CÓ — và đây là điều nguy hiểm nhất trong 11 đường.**
`updatedAt` là `@updatedAt` (`:957`) nên sau khi đè, thứ duy nhất còn lại là *"có ai đó ghi lại dòng này"*:
không biết ghi cái gì, không biết ghi bằng gì, không khôi phục được. Mọi đường sai khác (IM-02, IM-05, IM-06,
IM-07, IM-08) **trở nên không điều tra được** một khi IM-04 còn đó — vì bằng chứng đã bị đè.

**Cách bắt:** không bắt được bằng giám sát. Chỉ chữa được bằng thiết kế:
- Bảng snapshot **append-only**: mỗi lượt chạy sinh dòng mới; dòng cũ được đánh `supersededAt` +
  `supersededByRunId`, **không xoá**.
- Hoặc giữ một dòng "hiện hành" nhưng ghi lịch sử thay đổi sang bảng phụ.
- Quyết định này phải chốt **trước migration đầu tiên**: đổi khoá tự nhiên trên bảng đã có dữ liệu prod vi
  phạm luật cứng #4 của Nền Hệ thống (`CLAUDE.md`).

---

### IM-05 — Parser tên campaign (D-06/D-07)

**Cơ chế sai:** hiện **CHƯA CÓ** parser — và còn xa hơn thế: `syncMetaAds` thậm chí **không xin** tên campaign
từ Meta (`?fields=spend,impressions,clicks`, `lib/crm/ads-insights.ts:91`), `parseMetaInsights` cũng chỉ đọc
`date_start/spend/impressions/clicks` (`:30`). Hôm nay **không có gì để parse**.

Khi làm, 5 kiểu hỏng — mỗi kiểu ra một con số hợp lệ khác nhau:

| # | Kiểu hỏng | Kết quả | Vì sao im lặng |
|---|---|---|---|
| a | Marketing **đổi tên campaign giữa chừng** | Meta trả tên **hiện tại**, không trả tên tại thời điểm chi ⇒ backfill cùng một ngày ra kết quả **khác** lần chạy đầu | Không có gì để so, vì IM-04 đã đè mất bản đầu |
| b | Gõ sai prefix (`CS1` → `CS_1`, `Cs1`) | Rơi vào `CHƯA PHÂN BỔ` | Chỉ lộ nếu có D-08 — mà D-08 **CHƯA CÓ** |
| c | Dùng mã cơ sở **không tồn tại** | Rơi `CHƯA PHÂN BỔ`; nếu parser fuzzy-match thì **rơi nhầm cơ sở khác** | Cơ sở nhận nhầm thấy chi phí "hơi cao", không ai nghi |
| d | Campaign `MULTI` **không khai tỷ lệ** ở D-07 | Toàn bộ tiền của campaign lớn nhất rơi vào một rổ | Spec đã lường (bắt buộc khai) nhưng ràng buộc nằm ở **quy trình người**, không ở DB |
| e | Mã đúng nhưng trỏ cơ sở đã đóng / chưa có `code` | `Center.code` là `String? @unique` (`prisma/schema.prisma:237`) — **nullable** ⇒ có cơ sở chưa có mã. Thêm nữa `Center("hoi-so")` là bản ghi **mồ côi đã biết** (`CLAUDE.md`) | Parser trả null, tiền rơi `CHƯA PHÂN BỔ` |

**Dấu hiệu quan sát được:** cụm `CHƯA PHÂN BỔ` phình to. **Nhưng trường hợp tệ nhất (c-fuzzy) lại KHÔNG làm
cụm đó phình** — tiền đi thẳng vào cơ sở sai. Đó là lý do cảnh báo "% chưa phân bổ" một mình **không đủ**.

**Cách bắt:**
- Trên mỗi dòng snapshot lưu **nguyên văn** `campaignNameRaw` + `parsedCenterCode` + `resolvedBy`
  (`PARSER` | `OVERRIDE` | `NONE`). Không lưu tên gốc = không bao giờ điều tra lại được.
- Tách **hai** cảnh báo, không gộp: (1) *không parse được*; (2) *parse ra mã không khớp danh mục `Center.code`
  đang `isActive`*. Kiểu (2) là lỗi quy ước; kiểu (1) là campaign mới. Gộp lại là mất tín hiệu.
- **CẤM fuzzy-match.** Khớp đúng-bằng hoặc bỏ vào `CHƯA PHÂN BỔ`. Đoán là cách biến lỗi ồn ào thành lỗi im lặng.
- Test CI: mọi dòng trong bảng override D-07 phải trỏ tới một `Center.code` tồn tại và `isActive`.

---

### IM-06 — Múi giờ: Meta theo timezone TÀI KHOẢN QUẢNG CÁO, hệ thống theo giờ VN

**Cơ chế sai — hai lệch chồng nhau:**

**(a) Lệch "ngày" của dữ liệu.** Meta trả `date_start` theo timezone của tài khoản quảng cáo (đặt lúc mở tài
khoản, **không đổi được sau đó**). `parseMetaInsights` làm `new Date(row.date_start)`
(`lib/crm/ads-insights.ts:33`) — chuỗi `"YYYY-MM-DD"` parse thành `00:00Z` — rồi ghi vào cột
`date DateTime @db.Date` (`prisma/schema.prisma:950`). Hệ thống thì tính kỳ theo giờ VN: `monthKeyVN` /
`dateKeyVN` cộng cứng +7h (`lib/reports/lead.ts:90-99`), `lib/time/vn.ts:16` `VN_UTC_OFFSET_MINUTES = 420`.
Nếu tài khoản đặt `America/Los_Angeles` thì "ngày" của Meta lệch **14–15 giờ** so với ngày VN ⇒ chi tiêu ngày
cuối tháng rơi sang tháng sau.

**(b) Lệch giờ chạy cron.** Vercel Cron chạy theo **UTC**. Repo đã có quy ước phải trừ 7 giờ, viết rõ trong
nhiều route:

```
app/api/cron/class-schedule-sync/route.ts:12       "Cron này chạy 00:10 giờ VN (17:10 UTC hôm trước)"
app/api/cron/student-birthday/route.ts:14          "chạy 01:00 UTC = 08:00 giờ VN"
app/api/cron/chat-membership-reconcile/route.ts:7  "02:00 VN (vercel.json: 0 19 * * * UTC)"
```

⇒ Viết `"0 0 * * *"` cho D-01 (như `substitute-teacher-notify` đang dùng, `vercel.json:64-67`) nghĩa là chạy
**07:00 giờ VN**, KHÔNG phải 00:00 VN như spec. Chạy 00:00 VN = `"0 17 * * *"`. Và 00:00 VN có thể **quá
sớm** so với thời điểm ngày đó đóng theo timezone tài khoản QC.

**Dấu hiệu quan sát được:** chỉ lộ ở **ranh giới cuối tháng** — tổng tháng lệch đúng bằng chi tiêu 1 ngày.
Trong tháng thì tổng vẫn khớp ⇒ **đối soát theo THÁNG một mình sẽ không bắt được** nếu chỉ so tổng gộp nhiều
tháng.

**Cách bắt:**
- Xin và **lưu** `timezone_name` của tài khoản QC vào mỗi `AdsSyncRun`. Khác giá trị kỳ vọng đã chốt ⇒ **dừng
  job và báo**, không tự quy đổi.
- Đối soát **theo NGÀY** ở tối thiểu 3 mẫu: ngày đầu tháng, một ngày giữa tháng, **ngày cuối tháng**. Ngày
  cuối tháng là mẫu **bắt buộc** — đó là ngày duy nhất phân biệt được IM-06 với "số khớp".
- Viết lịch cron kèm chú thích giờ VN, đúng quy ước 3 route trên. Dòng chú thích đó là **bắt buộc**, không
  phải cho đẹp: sai 7 giờ ở đây làm job đọc nhầm ngày.

---

### IM-07 — Đơn vị tiền: Meta có thể trả USD, báo cáo tính VND

**Cơ chế sai:**

```ts
// lib/crm/ads-insights.ts:35
spend: Number(row.spend ?? 0),   // không đọc account_currency, không quy đổi, không kiểm
```

Cột nhận: `spend Float @default(0)` (`prisma/schema.prisma:952`) — **kiểu Float**, trong khi mọi cột tiền khác
của hệ là Int VND. Đối chiếu ngay bảng bên cạnh: `MarketingCostPeriod.totalQcCost Int` (`:939`) kèm chú thích
*"VND (số nguyên) — H5/COL2"*, và `lib/crm/cost-allocation.ts:48-49` phải `Math.round` trước khi ghi. Tức repo
**đã** có luật "tiền là số nguyên VND", và `AdsInsightDaily` là chỗ **duy nhất** phá luật đó.

Nếu tài khoản QC tính bằng USD: `spend = 120.5` (USD) được cộng thẳng vào cùng thang với doanh thu VND ở
`ROAS = revenue / spend` (`lib/crm/marketing-metrics.ts:28` + `lib/crm/funnel-query.ts:15,17-20`) ⇒ sai khoảng
**26.000 lần**, theo hướng làm ROAS **đẹp lên**.

**Dấu hiệu quan sát được:** ROAS lớn bất thường (hàng nghìn), CPL/CPA nhỏ bất thường. **Nhưng** vì hôm nay
trang funnel đang hiển thị `0` ở cả 4 ô, lần đầu bật job con số nhảy vọt sẽ dễ bị đọc là *"cuối cùng cũng có
số"* thay vì *"số này sai đơn vị"*. Đây là bẫy tâm lý, không phải bẫy kỹ thuật.

**Cách bắt:**
- Xin `account_currency` trong `fields` và **lưu** vào từng lần chạy.
- **Chặn cứng:** currency ≠ `VND` ⇒ job dừng, ghi `AdsSyncRun` trạng thái `BLOCKED`, bắn cảnh báo. **Không tự
  đoán tỷ giá** — tỷ giá đổi theo ngày; một hằng số trong mã là một lỗi im lặng mới.
- Nếu buộc phải đa tiền tệ: lưu **rời** `spendRaw` + `currency` + `fxRate` + `fxRateSource` + `spendVnd`,
  không bao giờ gộp. Không có `fxRate` = không đối soát lại được.
- Đổi kiểu `Float` → `Int` (VND) **hoặc** `Decimal`: chốt cùng lúc với IM-04 vì cả hai là migration trên cùng
  một bảng.

---

### IM-08 — Chạy MỘT PHẦN rồi lỗi giữa chừng

**Cơ chế sai:**

```ts
// lib/crm/ads-insights.ts:97-99
const records = parseMetaInsights(json, "facebook");
for (const r of records) await upsertAdsInsight({ ...r, source: "META_API" });  // tuần tự, KHÔNG transaction
return { synced: records.length };                                             // chỉ chạy khi thành công HẾT
```

Lỗi ở bản ghi thứ k (DB nghẽn, timeout hàm serverless, dữ liệu lạ) ⇒ **k−1 dòng đã ghi**, hàm ném lỗi,
`withCron` trả 500. Ngày đó **có** số trong bảng nhưng **thiếu** một phần campaign. Và vì `return` nằm sau
vòng lặp, `synced` không bao giờ được trả ⇒ **không ai biết đã ghi được bao nhiêu**.

Thêm một lớp âm thầm ngay trong parser: `if (!row.date_start) continue;` (`lib/crm/ads-insights.ts:31`) — dòng
thiếu `date_start` bị **bỏ qua không đếm, không log**. Nếu Meta đổi tên trường, `parseMetaInsights` trả `[]`,
`syncMetaAds` trả `{ synced: 0 }` và **HTTP 200 thành công**. Job "chạy tốt", ghi 0 dòng.

**Dấu hiệu quan sát được:** tổng của ngày đó thấp hơn thực tế nhưng vẫn > 0 ⇒ trông hoàn toàn hợp lệ.

**Cách bắt:**
- Lưu **cả mẫu số lẫn tử số** vào `AdsSyncRun`: `rowsFetched` / `rowsParsed` / `rowsWritten` / `rowsSkipped`.
  Repo đã có đúng bài học này: `OrgUnitDriftItem.totalRows` mang chú thích *"MẪU SỐ bắt buộc: prod đã dọn sạch
  dữ liệu 01/08 nên '0 lệch' rất dễ là XANH GIẢ"* (`prisma/schema.prisma:6727-6728`), và
  `app/api/cron/orgunit-drift/route.ts:63` trả cờ `inconclusive: rep.totalRows === 0`.
- Trạng thái lần chạy **`PARTIAL` tách riêng** khỏi `FAILED`. Ngày nào có `PARTIAL` mà không có lần chạy `OK`
  sau đó ⇒ cảnh báo.
- `rowsFetched = 0` mà HTTP 200 ⇒ **không được coi là thành công**, phải là `INCONCLUSIVE` — sao chép nguyên
  logic của `cron-pump-test.yml:72-77`.

---

### IM-09 — TRÙNG LẶP: chạy hai lần trong ngày

**Cơ chế sai:** hiện tại UPSERT nên chạy hai lần **không** cộng đôi — mặt tốt **duy nhất** của
`upsertAdsInsight`. Nhưng D-01 yêu cầu bỏ ghi đè để giữ lịch sử (IM-04); một bảng append-only **thiếu khoá tự
nhiên** sẽ cộng đôi ngay lượt retry đầu tiên.

Repo đã trả giá cho đúng bài này và ghi lại nguyên văn tại `prisma/schema.prisma:6637-6643`:

> *"Bảng này là CHỐT CHỐNG TRÙNG, không phải log cho vui: mỗi tin 400đ và ZNS không thu hồi được. Hai lượt
> cron chồng nhau (**Vercel retry**, **GitHub pump trên test**) phải va vào UNIQUE `(conversationId, userId,
> messageId)` chứ không được gửi đôi. Quy trình: GIÀNH CHỖ trước (status PENDING) → gửi → cập nhật kết quả."*

Hai nguồn gọi trùng đó **cùng áp dụng cho D-01**: Vercel retry trên prod, và `cron-pump-test.yml:31` (chạy
**mỗi 5 phút**) nếu ai đó thêm endpoint ads vào vòng lặp bơm mà không nghĩ. Mô hình thứ ba đã có sẵn:
`DomainEvent.dedupeKey String? @unique` (`prisma/schema.prisma:598`).

**Dấu hiệu quan sát được:** spend gấp đôi đúng một ngày. Nếu job chạy đôi **đều đặn** thì mọi ngày đều gấp đôi
⇒ nhìn không ra, vì không ai thuộc con số đúng.

**Cách bắt:**
- UNIQUE trên khoá tự nhiên đầy đủ: `(date, channel, campaignId, adsetId)` + chiều phiên bản nếu giữ lịch sử.
- **Giành chỗ trước khi gọi Meta**: tạo dòng `AdsSyncRun` trạng thái `RUNNING` với `@@unique` theo
  `(targetDate, channel, kind)`; lượt thứ hai va UNIQUE thì thoát êm. Fail-safe nghiêng về *"thiếu một lượt
  đồng bộ"* thay vì *"cộng đôi tiền"* — đúng nguyên tắc đã chốt ở `ChatZnsNotification`.
- Đối soát tổng kỳ (§9.2) là lưới cuối: cộng đôi làm tổng hệ thống **cao hơn** Ads Manager — hướng lệch
  **ngược** với IM-02 ⇒ dấu của độ lệch cho biết luôn nên nghi ngờ nào.

---

### IM-10 — Lead không nối được với campaign ⇒ CPL/CPA chia cho tập lead SAI

**Cơ chế sai — ba tầng, mỗi tầng đủ để làm sai:**

**Tầng 1 — không có khoá nối.** `Lead` **CHƯA CÓ** `campaignId`/`adsetId`/`adId` (grep schema = 0 hit). Chỉ có
`utmSource/utmMedium/utmCampaign/utmContent/utmTerm` (`prisma/schema.prisma:1328-1332`) và `fbclid/gclid/fbp/fbc`.
`docs/prd/G-lead.md` §6.3.b khai cả 3 trường là **THÊM MỚI**, kèm ghi chú *"`utm*` là nhãn, không phải ID
Meta"*; `docs/prd/A-nen-tang.md` §10.3 (SL-10) nói cùng một điều. ⇒ Trước khi G xong, D-04/D-05 chỉ tính được
**ở mức tổng**, không bóc theo campaign.

**Tầng 2 — mẫu số CPL nhiều khả năng bằng 0.**

```ts
// lib/crm/funnel-query.ts:13
db.lead.count({ where: { deletedAt: null, qualifiedAt: { not: null }, ...centerFilter } })   // L2
```

Writer **duy nhất** của `qualifiedAt` là `lib/crm/lead-qualify.ts:93`. File đó chỉ được import bởi
`tests/e2e/r1/lead-qualify.spec.ts:7` — **không Server Action / route nào gọi**. ⇒ Trên prod `L2` nhiều khả
năng bằng **0** ⇒ `computeCpl(spend, 0)` trả `0` do chia-0 an toàn (`lib/crm/cost-allocation.ts:18`).

> **"CPL = 0" hôm nay mang HAI nghĩa hoàn toàn khác nhau — *chưa tiêu tiền* hoặc *không có mẫu số* — và màn
> hình hiển thị y hệt nhau.**

**Tầng 3 — "đã chốt" có nhiều định nghĩa.** `L3` = `convertedAt != null` (`lib/crm/funnel-query.ts:14`). Nhưng
`lib/finance/payment.ts:152-155` nâng lead lên `REGISTERED` **mà không set `convertedAt`**, trong khi
`CONVERTED_STATUSES = { ENROLLED, REGISTERED }` (`lib/reports/lead.ts:45`) lại đếm cả `REGISTERED` ⇒ CPA ở tab
D và "tỷ lệ chốt" ở tab C **chắc chắn** dùng hai mẫu số khác nhau.

**Dấu hiệu quan sát được:** `CPL = 0` và `CPA = 0` trong khi `Chi phí QC > 0`. Một người đọc cẩn thận sẽ thấy
vô lý — nhưng chỉ khi cả hai ô cùng hiện trên màn, và chỉ khi họ biết CPL đáng lẽ phải khác 0.

**Cách bắt:**
- **Không bao giờ hiển thị `0` cho một tỷ số có mẫu số `0`.** Hiện `—` kèm lý do *"chưa có lead đạt chuẩn
  trong kỳ"*. Sửa ở tầng hiển thị, rẻ, bắt được cả 3 tầng.
- **Hiện mẫu số ngay cạnh tỷ số**: `CPL 120.000đ (4.800.000đ / 40 lead)`. Người đọc phát hiện `/ 0 lead` ngay.
- Chốt **một** định nghĩa "đã chốt" trước khi bật tab D — quyết định nghiệp vụ, không phải việc code.

---

### IM-11 — `lib/crm/funnel-query.ts:15` aggregate KHÔNG có `where`

**Cơ chế sai — đọc lại nguyên văn:**

```ts
// lib/crm/funnel-query.ts:9
const centerFilter = opts.centerIds ? { centerId: { in: opts.centerIds } } : {};
// :11-21
const [l1, l2, l3, spendAgg, revenueAgg] = await Promise.all([
  db.messengerConversation.count({ where: centerFilter }),                                       // :12  lọc cơ sở
  db.lead.count({ where: { deletedAt: null, qualifiedAt: { not: null }, ...centerFilter } }),    // :13  lọc cơ sở
  db.lead.count({ where: { deletedAt: null, convertedAt: { not: null }, ...centerFilter } }),    // :14  lọc cơ sở
  db.adsInsightDaily.aggregate({ _sum: { spend: true } }),                                       // :15  KHÔNG có where
  db.order.aggregate({ _sum: { totalAmount: true }, where: { status: { in: [...] }, ...centerFilter } }), // :17-20
]);
```

Bốn hệ quả, tất cả đều im lặng:

| # | Hệ quả | Bằng chứng |
|---|---|---|
| 1 | **Không lọc ngày** — tổng MỌI ngày từ khi có dữ liệu | `:15` không có `where` |
| 2 | **Không lọc cơ sở**, và **không lọc được**: `AdsInsightDaily` không có `centerId`/`orgUnitId` | `prisma/schema.prisma:948-961` |
| 3 | File dùng `db` trần (`lib/crm/funnel-query.ts:3`), không `scopedDb`. Kể cả đổi sang `scopedDb` cũng vô ích: `injectScope` **thoát ngay** dòng đầu với model ngoài `SCOPED_MODELS` | `lib/db-scope.ts:268` — `if (!SCOPED_MODELS.has(model) …) return args;` |
| 4 | 4 ô trên trang funnel đang trộn hai phạm vi: lead/doanh thu **theo cơ sở**, chi phí **toàn hệ thống** | `app/(admin)/admin/marketing/funnel/page.tsx:24-27,35-38` |

**Dấu hiệu quan sát được:** `CENTER_MANAGER` của CS1 thấy đúng số lead của CS1 nhưng chi phí QC của **toàn
công ty** ⇒ CPL của CS1 bị thổi lên đúng bằng số lần số cơ sở (2 cơ sở ⇒ gấp ~2). Con số vẫn hợp lý về đơn vị
(vẫn là "đồng/lead", vẫn trong khoảng tin được) nên **không ai nghi**. Đây là kiểu sai nguy hiểm nhất: sai đủ
nhiều để ra quyết định hỏng, không đủ nhiều để lộ.

**Cách bắt:**
- `docs/prd/A-nen-tang.md` **đã ra luật cho đúng tình huống này** (A-02-7): *"Bật được 'Tất cả cơ sở' cho một
  tab **chỉ khi** mọi model tab đó đọc đều đã cách ly được"*, và liệt kê đích danh `AdsInsightDaily`,
  `MarketingCostPeriod` trong nhóm chưa cách ly ⇒ **tab D chưa được bật "Tất cả"** cho tới khi có cột phạm vi.
- Test cách ly **bắt buộc trong CI**: dựng 2 cơ sở, gắn spend chỉ cho CS1, đọc bằng actor CS2 ⇒ phải ra `0`.
- Trong lúc chưa có cột phạm vi: **gắn nhãn ngay trên ô số** — *"Chi phí QC (toàn hệ thống)"*. Nhãn là biện
  pháp tạm, không phải biện pháp.
- ⚠️ **Không tưởng "thêm `orgUnitId` là xong"**: `injectScope` chỉ chèn `centerId` (`lib/db-scope.ts:277-279`)
  cho tới khi cutover `orgScope.cutoverEnabled` bật. Bảng cần `scopedDb` cách ly phải mang **CẢ HAI** cột —
  đây là SL-00 trong `A-nen-tang.md` §10.

---

### Risk Summary

D-01 không phải "thêm một cron". Trên nhánh này, **toàn bộ đường ghi của khu vực D là MÃ CHẾT** — chưa từng
có một lần chạy thật nào. Nghĩa là mọi rủi ro dưới đây là rủi ro của một hệ thống **sắp ra đời**, chưa có
người vận hành, chưa có ai thuộc con số, và chưa có bất kỳ vết chạy nào để đối chiếu.

Đặc điểm chi phối toàn bộ hồ sơ rủi ro: **không có kiểu hỏng nào của job này tạo ra triệu chứng nhìn thấy
được.** 11 đường sai đã dò ở §2 thì 8 đường **không để lại dấu hiệu nào** trong ứng dụng, 3 đường còn lại chỉ
có dấu hiệu mơ hồ (số quá đẹp, `0` thay vì `—`). Đây là cùng một họ sự cố mà repo đã trả giá 3 lần và ghi lại
trong mã: 20 cron chết im từ lúc dựng (`proxy.ts:122-131`), webhook SePay trả 401 im lặng 6 ngày nuốt ~26,8
triệu (`lib/lead/intake/health.ts:11-13`), `OrgUnitDriftRun` rỗng suốt vì không ai gọi
(`cron-pump-test.yml:48-52`).

| Nhóm | Số mục | Bản chất |
|---|---|---|
| **Launch-Blocking** | 9 | Nếu thiếu, job chạy được nhưng số sai **không phát hiện được**, hoặc bằng chứng bị đè mất vĩnh viễn |
| **Fast-Follow** | 7 | Cần trong 1–2 tuần đầu; thiếu thì job đúng lúc bật rồi sai âm thầm về sau |
| **Track** | 6 | Nợ đã biết, chưa chặn; ghi để không bị quên khi mở B/C |
| **Paper Tiger** | 6 | Nghe đáng sợ, đo ra không phải rủi ro thật ở quy mô này |
| **Elephant** | 7 | Vấn đề tổ chức/quy trình, không sửa được bằng code |

**Kết luận một dòng:** ưu tiên số 1 **không phải** là làm job chạy đúng — mà là làm cho **lần chạy sai đầu
tiên trở nên nhìn thấy được**. Nếu buộc phải cắt phạm vi, cắt D-06/D-07 (phân bổ theo cơ sở) chứ **đừng cắt**
sổ lần chạy (§9.1) và đối soát tổng (§9.2).

---

### Launch-Blocking Tigers

Phải xong **trước khi job chạy thật lần đầu**. "Chủ" ghi theo vai, không theo tên.

| # | Rủi ro | Khả năng | Tác động | Giảm thiểu CỤ THỂ | Chủ | Hạn |
|---|---|---|---|---|---|---|
| **T-01** | **Không có sổ lần chạy** ⇒ IM-01 + IM-03 + IM-08 đều vô hình. Job chết im, không ai biết, số cũ vẫn hiển thị | Cao | Cao | Tạo model `AdsSyncRun` (§9.1) và ghi **một dòng mỗi lượt chạy, kể cả lượt ghi 0 dòng**. Test CI: gọi handler với Meta giả → assert có đúng 1 dòng `AdsSyncRun` với `rowsFetched`/`rowsWritten` khớp. **Không merge PR job nếu chưa có test này** (luật Nền Hệ thống #5: test viết trước) | Dev BE | Cùng PR tạo job |
| **T-02** | **UPSERT ghi đè lịch sử** (`lib/crm/ads-insights.ts:55-71`) — trái thẳng câu chữ D-01, và **xoá bằng chứng của 5 rủi ro khác** | Chắc chắn (mã hiện tại làm đúng vậy) | Cao | Bảng snapshot **MỚI** `AdsSpendDaily` append-only (§9.1), khoá `@@unique([runId, date, channel, campaignId, adsetId])`; bản cũ đánh `supersededAt`/`supersededByRunId`, **không xoá**. **KHÔNG tái dùng `upsertAdsInsight`** — đánh dấu deprecated hoặc gỡ cùng PR để người sau không "dùng lại cho nhanh" | Dev BE + chủ dự án duyệt schema | Trước migration đầu tiên |
| **T-03** | **Snapshot thiếu chiều campaign + cơ sở** ⇒ D-06/D-07/D-08 **bất khả thi**, và IM-11 không vá được | Chắc chắn | Cao | `AdsSpendDaily` mang `campaignId` + `campaignNameRaw` (nguyên văn) + `adsetId` + **CẢ HAI** `centerId` và `orgUnitId` (SL-00, `A-nen-tang.md` §10). Khai vào **cả hai** nơi: `SCOPED_MODELS` (`lib/db-scope.ts:10`) **và** `BACKFILL_SPECS` (`lib/org/center-bridge.ts:45`) — quên nơi thứ hai thì test `[US-07-IT-08b]` đỏ hoặc dữ liệu rò im lặng | Dev BE | Cùng T-02 |
| **T-04** | **Đơn vị tiền không xác minh** — USD cộng thẳng vào thang VND, sai ~26.000 lần theo hướng làm ROAS đẹp | Trung bình | **Rất cao** | Xin `account_currency`; currency ≠ `VND` ⇒ `AdsSyncRun.status = BLOCKED` + cảnh báo, **không tự đoán tỷ giá**. Đổi cột tiền sang `Int` (VND) hoặc `Decimal`, bỏ `Float` (`prisma/schema.prisma:952`) | Dev BE; xác nhận currency thật: Trưởng Marketing (người có quyền Ads Manager) | Trước lần chạy thật đầu tiên |
| **T-05** | **Múi giờ**: (a) Meta trả theo timezone tài khoản QC, hệ tính theo giờ VN; (b) cron Vercel chạy UTC — `"0 0 * * *"` = **07:00 VN**, không phải 00:00 VN như spec | Cao | Trung bình–Cao | Lưu `accountTimezone` mỗi lần chạy; khác giá trị kỳ vọng đã chốt ⇒ `BLOCKED`. Lịch cron `"0 17 * * *"` **kèm chú thích giờ VN** đúng quy ước 3 route đang có (`class-schedule-sync/route.ts:12`, `student-birthday/route.ts:14`, `chat-membership-reconcile/route.ts:7`). Đối soát bắt buộc có mẫu **ngày cuối tháng** | Dev BE | Cùng PR tạo job |
| **T-06** | **Token nằm trong QUERY STRING** (`lib/crm/ads-insights.ts:93`) ⇒ lọt vào log/trace/Sentry | Trung bình | Cao | Chuyển sang header `Authorization: Bearer <token>` (Meta hỗ trợ). Lý do khẩn: `Sentry.httpIntegration()` (`sentry.server.config.ts:18`) bắt outgoing fetch, còn `beforeSend` (`:22-32`) **chỉ** xoá `event.request.headers`/`cookies` — **không** scrub URL của span ⇒ token đi thẳng vào Sentry | Dev BE | Cùng PR, không hoãn |
| **T-07** | **Bật job trước khi ban hành `SR.QD.232`** ⇒ mọi ngày đầu rơi `CHƯA PHÂN BỔ`; cộng IM-04 thì **không sửa lại được** | Cao (spec đã cảnh báo đúng điều này) | Trung bình | Cổng người: ban hành văn bản + **đổi tên các campaign đang chạy** trước, rồi mới bật. Nếu buộc bật trước thì T-02 (append-only + backfill được) trở thành điều kiện **cứng**, không phải "nên có" | Trưởng Marketing | Trước ngày bật job |
| **T-08** | **Mẫu số 0 hiển thị thành `0`** — `CPL = 0` mang hai nghĩa khác nhau (chưa tiêu tiền / không có mẫu số) và màn hình y hệt nhau | Cao (writer `qualifiedAt` là MÃ CHẾT — `lib/crm/lead-qualify.ts:93`) | Cao | Quy tắc hiển thị: mẫu số = 0 ⇒ hiện `—` + lý do, **không bao giờ** hiện `0`. Hiện mẫu số cạnh tỷ số: `CPL 120.000đ (4.800.000đ / 40 lead)`. Chốt **một** định nghĩa "đã chốt" cho cả C và D | Dev FE + chủ dự án | Trước khi mở tab D cho QLCS |
| **T-09** | **Chi phí QC toàn công ty lộ cho mọi CENTER_MANAGER**: trang funnel gate bằng `leads:view-all` (`app/(admin)/admin/marketing/funnel/page.tsx:18`), mà `leads:view-all` = `SUPER_ADMIN, CENTER_MANAGER, MARKETING` (`lib/auth/permissions.ts:346`); cộng IM-11 (spend không lọc cơ sở) ⇒ QLCS CS1 thấy ngân sách toàn hệ thống | Chắc chắn (đang đúng như vậy) | Trung bình–Cao | Thêm permission key `ads:view` / `ads:manage` vào `lib/permissions/registry/` (**hiện 0 key nào**), gate riêng cho tab D thay vì mượn `leads:view-all`. Trong lúc chưa có cột phạm vi: theo A-02-7, **không bật "Tất cả cơ sở"** cho tab D và gắn nhãn "(toàn hệ thống)" ngay trên ô số | Dev BE + chủ dự án | Trước khi mở tab D cho QLCS |

---

### Fast-Follow Tigers

Cần trong **1–2 tuần đầu**, trước khi con số của D được dùng để báo cáo hoặc đánh giá người.

| # | Rủi ro | Khả năng | Tác động | Giảm thiểu CỤ THỂ | Chủ | Hạn |
|---|---|---|---|---|---|---|
| **F-01** | Không ai đối chiếu tổng hệ thống với Ads Manager ⇒ IM-02/IM-06/IM-07/IM-09 chạy tự do | Cao | Cao | Đối soát tổng kỳ (§9.2): màn nhập tổng từ Ads Manager + so sánh + lệch > ngưỡng ⇒ cảnh báo. **Dấu của độ lệch chỉ ra nghi ngờ nào**: âm ⇒ IM-02/IM-08; dương ⇒ IM-09 | Trưởng Marketing (nhập) + Dev BE (màn) | Cuối tháng đầu tiên có dữ liệu |
| **F-02** | Job tịt vài ngày mà không ai để ý | Cao | Cao | Cảnh báo im lặng theo **nền của chính nó** (§9.3), sao chép mô hình `lib/lead/intake/health.ts:89-133` — không đặt ngưỡng tuyệt đối vì báo động giả bị phớt lờ thì lần hỏng thật cũng bị phớt theo (`health.ts:20-24`) | Dev BE | Trong 1 tuần sau khi bật |
| **F-03** | Tiền rơi `CHƯA PHÂN BỔ` mà không ai nhìn bảng đó (D-08 hiện **CHƯA CÓ**) | Cao | Trung bình | Cảnh báo % chưa phân bổ vượt ngưỡng (§9.4) + hiện cảnh báo ngay trên tab D theo đúng D-08. Kèm cảnh báo **thứ hai, tách riêng**: mã cơ sở parse ra **không khớp** `Center.code` đang `isActive` | Dev BE | Trong 2 tuần |
| **F-04** | Chi tiêu nhảy vọt/rơi đột ngột (tài khoản bị khoá, ai đó đổi ngân sách) không ai biết | Trung bình | Trung bình | Cảnh báo biến động so trung bình động (§9.5), có ngưỡng **tuyệt đối tối thiểu** để số nhỏ không đẻ báo động giả | Dev BE | Trong 2 tuần |
| **F-05** | Chạy lại/backfill làm số đổi mà không phân biệt được với bản gốc | Cao (chắc chắn sẽ phải backfill vì IM-02) | Cao | Script `scripts/ads-backfill.ts` **dry-run mặc định** theo mẫu `scripts/nen-p1-doi-soat-orgunit.ts:1-20`; `AdsSyncRun.kind = BACKFILL` + `triggeredById`; bản cũ `supersededAt` chứ không xoá (§9.6) | Dev BE | Trước lần backfill đầu tiên |
| **F-06** | Token Meta hết hạn/bị thu hồi, không có gì canh | Trung bình | Cao | Job kiểm hạn token (gọi endpoint debug token) + cảnh báo trước khi hết hạn, theo mẫu `zalo-token-refresh` (`vercel.json:40-43`). Tối thiểu: tách `errorCode = 190` thành cảnh báo riêng, mức P1 | Dev BE | Trong 2 tuần |
| **F-07** | `canEditAds` so `roleCode === "HO_MARKETING"` inline (`lib/crm/ads-insights.ts:44-49`) — trái luật cứng #1 của Nền Hệ thống | Chắc chắn (mã đang vậy) | Thấp–Trung bình | Thay bằng `can(actor, "ads:manage", target)`. ⚠️ Lint `no-inline-authz` **không bắt được chỗ này**: glob chỉ phủ `app/**` (`eslint.config.mjs:115-121`), file nằm ở `lib/` ⇒ đây là nợ **im lặng với cả công cụ**, phải sửa bằng tay | Dev BE | Cùng F-01 (khi làm màn quản trị) |

---

### Track Tigers

Đã biết, chưa chặn D-01. Ghi để không bị quên khi mở B/C.

| # | Vấn đề | Bằng chứng | Chặn cái gì |
|---|---|---|---|
| **K-01** | Chưa biết Meta điều chỉnh số **thường xuyên đến đâu** trên tài khoản này ⇒ chưa chốt được cửa sổ backfill và ngày khoá sổ | — (phải đo 30 ngày thật) | Chính sách khoá sổ của IM-02 |
| **K-02** | Kênh bị **hardcode `"facebook"`** (`lib/crm/ads-insights.ts:97`) dù cột `channel` cho phép nhiều kênh (`prisma/schema.prisma:951`) | `ads-insights.ts:97` | Google Ads / TikTok về sau |
| **K-03** | `MarketingCostPeriod` **không có `centerId`**, `period String @unique` ⇒ không tách chi phí theo cơ sở | `prisma/schema.prisma:936-945`; `A-nen-tang.md` §10.4 | B-03 (Chi phí theo cơ sở) |
| **K-04** | Hệ thống **KHÔNG CÓ khái niệm "chi"** — không model phiếu chi, không bảng expense ⇒ "dòng tiền = thu − chi" (B-03) chưa lấy được số chi từ bất cứ đâu | Khảo sát khu vực B | B-03 (Dòng tiền), B-05 (Import chi phí) |
| **K-05** | `Lead` chưa có `campaignId`/`adsetId`/`adId` ⇒ CPL/CPA **theo campaign** chưa làm được, chỉ ở mức tổng | Grep schema = 0 hit; `G-lead.md` §6.3.b; `A-nen-tang.md` §10.3 SL-10 | D-04/D-05 mức campaign |
| **K-06** | *(ngoài phạm vi D nhưng chạm mẫu số)* `lib/crm/sla.ts:132` truyền `lastActivityAt: lead.updatedAt` thay vì `lead.lastActivityAt` — dòng `:117` **có** select đúng trường nhưng chỉ dùng ở `:156`. Vì `Lead.updatedAt` là `@updatedAt`, mọi lần chạm record đều reset ⇒ SLA-4 "lead idle" hỏng | `lib/crm/sla.ts:117,132,156` | Chất lượng tập lead dùng làm mẫu số của D-04/D-05 |

---

### Paper Tigers

Những lo lắng hay được nêu nhưng **không phải** rủi ro thật ở quy mô này. Ghi ra để không tiêu công vào đó.

| # | Lo lắng | Vì sao KHÔNG phải rủi ro thật | Rủi ro thật nằm ở đâu |
|---|---|---|---|
| **P-01** | "Meta rate-limit / chặn API" | 1 lượt/ngày, 1 tài khoản, `time_increment=1` — xa trần rate limit | Lỗi **xác thực** (`code 190`), không phải lỗi hạn ngạch — xem IM-03 |
| **P-02** | "Cần message broker / hàng đợi cho job này" | `CLAUDE.md` cấm message broker (modular monolith). Ở quy mô vài trăm dòng/ngày, `DomainEvent` outbox cũng không cần | Thiếu **sổ lần chạy**, không phải thiếu hàng đợi — T-01 |
| **P-03** | "`Float` làm tròn sai tiền" | Sai số dấu phẩy động ở thang triệu VND không phải nguồn lệch thực tế | **Đơn vị tiền** (USD vs VND) — IM-07/T-04. Đổi `Float`→`Int` là việc nên làm, nhưng **đừng tưởng làm xong là đã xử lý xong đơn vị tiền** |
| **P-04** | "Cron chạy trễ vài phút thì số sai" | Đơn vị dữ liệu là **NGÀY**; trễ vài phút không ảnh hưởng | Chạy **sai ngày** vì timezone/UTC — IM-06/T-05 |
| **P-05** | "Ai đó gọi trộm endpoint cron" | `verifyCronAuth` dùng `safeEqual` với `Bearer ${CRON_SECRET}` (`lib/cron/auth.ts:14-15`) — đủ | Ngược lại: **secret lệch gây 401 im lặng**, đã xảy ra trên test (`cron-pump-test.yml:36-39`) |
| **P-06** | "Phải viết lại trang funnel" | Trang chỉ đọc và render (`app/(admin)/admin/marketing/funnel/page.tsx:16-63`); mọi lỗi số nằm ở tầng query | `lib/crm/funnel-query.ts:15` — sửa 1 dòng query, không sửa trang |

---

### Elephants in the Room

Những thứ không sửa được bằng code, và nếu không nói ra thì sẽ quay lại dưới dạng "vì sao số sai mà không ai
báo".

**E-01 — "Bật job D-01" thực chất là XÂY MỚI, không phải thêm một dòng vào `vercel.json`.**
Toàn bộ đường ghi của khu vực D là MÃ CHẾT (§1): `syncMetaAds`, `upsertAdsInsight`, `upsertDraftCost`,
`confirmCostPeriod`, `reopenCostPeriod` — không hàm nào có call-site sản phẩm. Mọi ước lượng dựa trên *"code
đã có sẵn rồi, chỉ cần gọi"* là sai bản chất khối lượng việc. Cái "đã có sẵn" là `parseMetaInsights` — 18
dòng thuần, phần dễ nhất.

**E-02 — Không ai trong tổ chức sở hữu con số chi phí quảng cáo.**
Không có quyền `ads:*` (0 key trong `lib/permissions/registry/`), không có màn nhập, `MarketingCostPeriod`
chưa từng được ghi. Người nhận cảnh báo marketing hiện tại là **SUPER_ADMIN** (`lib/crm/marketing-alerts.ts:42`
`getSuperAdminUserIds`) — tức mặc định gửi cho người **ít có khả năng đi kiểm Ads Manager nhất**. Trước khi
bật job phải trả lời: *ai là người, khi cảnh báo nổ, sẽ mở Ads Manager ra đối chiếu?* Không có tên người thì
mọi cơ chế ở §9 chỉ là bản ghi cho lịch sử.

**E-03 — Không có môi trường nào nghiệm thu được job này ngoài prod.**
Hai lý do cộng lại: (a) `test.satarobo.vn` và máy local **dùng chung một DB** (`CLAUDE.md`); (b) Vercel Cron
**không chạy** trên environment `test` (`cron-pump-test.yml:1-3`), bằng chứng cứng là `OrgUnitDriftRun` rỗng
suốt cho tới khi có người thêm job bơm riêng (`:47-55`). ⇒ Lần chạy thật đầu tiên **là trên prod**. Đây cùng
họ với điểm mù ZNS đã ghi trong `CLAUDE.md`. Hệ quả bắt buộc: lần chạy đầu phải **dry-run ghi vào sổ mà không
ghi số** (`AdsSyncRun` có, `AdsSpendDaily` không), rồi mới bật ghi thật.

**E-04 — Spec và mã đang mâu thuẫn trực tiếp, và mã dễ thắng.**
D-01 nói *"bất biến, không ghi đè lịch sử"*; `upsertAdsInsight` làm đúng ngược lại. Hàm đó **đang nằm sẵn, có
test xanh** (`tests/e2e/r1/ads-insights.spec.ts`), trông y như "đã có". Nếu không quyết dứt điểm và **gỡ/đánh
dấu deprecated ngay trong PR đầu**, xác suất rất cao là người viết job sẽ gọi lại nó cho nhanh — và toàn bộ
T-02 mất trắng mà không ai thấy trong review.

**E-05 — Con số này được dùng để đánh giá người, nên không ai có động cơ đi tìm lỗi theo hướng có lợi.**
Sai theo hướng **thấp** (IM-02 attribution, IM-08 chạy một phần) làm chi phí đẹp, CPL đẹp — có lợi cho
marketing. Sai theo hướng **cao** (IM-09 cộng đôi, IM-11 chi phí toàn hệ thống chia cho lead một cơ sở) làm
sale/QLCS bị oan CPL. Trong cả hai trường hợp, phía được lợi không đi báo và phía bị thiệt không có bằng
chứng. ⇒ **Đối soát phải là cơ chế máy móc định kỳ**, không thể là "để ý là thấy".

**E-06 — B, C, D đang dùng ba định nghĩa doanh thu/chốt khác nhau; ROAS ở tab D sẽ không bao giờ khớp doanh
thu ở tab B.**
D lấy doanh thu = `Order.totalAmount` với `status ∈ {CONFIRMED, COMPLETED}` (`lib/crm/funnel-query.ts:17-20`);
B lấy **thực thu** = `Payment` `accountantStatus = CONFIRMED` theo `paidDate`. Hai số này **không bao giờ bằng
nhau**: đơn đã CONFIRMED mà kế toán chưa xác nhận khoản thì D tính đủ, B tính 0. Câu hỏi *"vì sao hai tab lệch
nhau"* sẽ đến trong tuần đầu — chuẩn bị câu trả lời trước, hoặc hợp nhất định nghĩa trước.

**E-07 — Kênh cảnh báo có thể đã bị bão hoà trước khi ta thêm cảnh báo mới vào đó.**
`runMarketingAlerts` bắn *"Chi phí marketing kỳ X chưa CONFIRMED"* cho SUPER_ADMIN mỗi ngày sau ngày 05
(`lib/crm/marketing-alerts.ts:47-55`), và cron `marketing-alerts` **đang đăng ký chạy** (`vercel.json:32-35`).
Nếu `MarketingCostPeriod` rỗng trên prod (rất có thể — đường ghi là MÃ CHẾT) thì cảnh báo đó **đang nổ hằng
ngày và đã bị coi là nhiễu**. Thêm 4 loại cảnh báo mới vào **cùng một chuông, cùng một người nhận** mà không
dọn cái cũ = cảnh báo mới cũng bị phớt lờ ngay từ ngày đầu. **Phải đo trên prod trước** (đếm
`StaffNotification` với `dedupeKey LIKE 'cost-unconfirmed:%'`), rồi hoặc dọn, hoặc đổi người nhận.

---

### Cơ chế đối soát đề xuất

Mọi mục dưới đây kèm cách hiện thực cụ thể trên repo này. Ưu tiên theo đúng thứ tự liệt kê.

#### 9.1 — Bản ghi lần chạy (job run log)

Hai bảng: **sổ lần chạy** (nhật ký vận hành) và **snapshot** (dữ liệu nghiệp vụ). Tách bạch vì hai bảng có
quy tắc phạm vi **khác nhau**.

```prisma
/// Sổ lần chạy job đồng bộ Ads. CỐ Ý KHÔNG mang centerId/orgUnitId — đây là nhật ký
/// vận hành của job, không phải dữ liệu theo đơn vị (ngoại lệ có chủ đích của SL-00,
/// cùng loại với UserTablePreference / SL-13 trong A-nen-tang.md §10.3).
model AdsSyncRun {
  id            String    @id @default(cuid())
  /// Khoá chống trùng — mô hình DomainEvent.dedupeKey (schema:598) + ChatZnsNotification
  /// (schema:6637-6643): GIÀNH CHỖ trước khi gọi Meta. Lượt thứ hai va UNIQUE thì thoát êm.
  /// Ví dụ: "sched:2026-08-22:facebook" · "backfill:2026-08-15..2026-08-22:facebook:<uuid>"
  runKey        String    @unique
  /// Ngày dữ liệu (theo timezone TÀI KHOẢN QC, KHÔNG phải giờ VN) — IM-06.
  targetDateFrom DateTime @db.Date
  targetDateTo   DateTime @db.Date
  channel       String
  /// SCHEDULED | BACKFILL | MANUAL — phân biệt bản ghi gốc với lần chạy lại (§9.6).
  kind          String    @default("SCHEDULED")
  /// RUNNING | OK | PARTIAL | FAILED | BLOCKED | INCONCLUSIVE
  /// PARTIAL tách riêng khỏi FAILED (IM-08). INCONCLUSIVE = HTTP 200 nhưng 0 dòng
  /// (sao chép logic cron-pump-test.yml:72-77 + orgunit-drift/route.ts:63).
  status        String
  startedAt     DateTime  @default(now()) @db.Timestamptz(6)
  finishedAt    DateTime? @db.Timestamptz(6)
  durationMs    Int       @default(0)

  // ── MẪU SỐ BẮT BUỘC (bài học OrgUnitDriftItem.totalRows, schema:6727-6728) ──
  rowsFetched   Int       @default(0)  // Meta trả về bao nhiêu dòng
  rowsParsed    Int       @default(0)  // parse được bao nhiêu
  rowsWritten   Int       @default(0)  // ghi thật bao nhiêu
  rowsSkipped   Int       @default(0)  // bị bỏ qua — hôm nay ads-insights.ts:31 nuốt im

  // ── BỐI CẢNH phải lưu, nếu không thì không đối soát lại được ──
  accountId        String?
  accountCurrency  String?   // IM-07 — khác "VND" ⇒ status = BLOCKED
  accountTimezone  String?   // IM-06 — khác kỳ vọng ⇒ status = BLOCKED
  spendTotalVnd    Int       @default(0)
  unallocatedVnd   Int       @default(0)  // rơi vào CHƯA PHÂN BỔ — nguồn của §9.4
  errorCode        String?   // "190" | "META_API_ERROR" | "META_CREDENTIALS_MISSING" | …
  errorMessage     String?   @db.Text
  triggeredById    String?   // null = cron; có giá trị = người bấm chạy lại

  items         AdsSpendDaily[]

  @@index([status, startedAt])
  @@index([targetDateFrom])
}

/// Snapshot chi tiêu NGÀY × KÊNH × CAMPAIGN. APPEND-ONLY (D-01 "bất biến").
/// Mang CẢ HAI cột phạm vi theo SL-00: orgUnitId cho tương lai, centerId vì injectScope
/// hôm nay chỉ chèn centerId (lib/db-scope.ts:277-279).
/// PHẢI khai vào SCOPED_MODELS (lib/db-scope.ts:10) VÀ BACKFILL_SPECS (lib/org/center-bridge.ts:45).
model AdsSpendDaily {
  id              String   @id @default(cuid())
  runId           String
  run             AdsSyncRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  date            DateTime @db.Date
  channel         String
  campaignId      String
  /// NGUYÊN VĂN tên campaign tại thời điểm đọc — IM-05a. Không lưu = không điều tra lại được
  /// khi marketing đổi tên giữa chừng.
  campaignNameRaw String   @db.Text
  adsetId         String?

  spendVnd        Int      @default(0)
  spendRaw        Decimal? @db.Decimal(18, 4)   // số Meta trả, nguyên trạng
  currency        String
  fxRate          Decimal? @db.Decimal(18, 6)   // null khi currency = VND
  impressions     Int      @default(0)
  clicks          Int      @default(0)

  parsedCenterCode String?
  /// PARSER | OVERRIDE | NONE — biết vì sao dòng này thuộc cơ sở đó (IM-05).
  resolvedBy      String
  centerId        String?
  orgUnitId       String?

  /// Bản cũ KHÔNG bị xoá khi chạy lại — chỉ bị đánh dấu (IM-04).
  supersededAt      DateTime? @db.Timestamptz(6)
  supersededByRunId String?
  createdAt       DateTime @default(now()) @db.Timestamptz(6)

  @@unique([runId, date, channel, campaignId, adsetId])   // IM-09 — chống cộng đôi
  @@index([date, channel])
  @@index([centerId, date])
  @@index([supersededAt])
}
```

**Quy tắc đọc:** mọi báo cáo chỉ đọc dòng `supersededAt IS NULL`. Đây là chỗ dễ quên nhất — gói vào **một**
helper dùng chung (vd `lib/crm/ads-query.ts`), không để mỗi trang tự viết `where`.

**Màn xem:** một trang `/admin/marketing/ads-sync` liệt kê 30 lần chạy gần nhất, cột `targetDate · kind ·
status · rowsFetched/rowsWritten · spendTotal · errorCode`. Không có màn này thì sổ chỉ có giá trị khi ai đó
mở SQL — tức là không bao giờ.

#### 9.2 — Đối soát tổng: hệ thống ↔ Facebook Ads Manager

Đây là cơ chế **duy nhất** bắt được IM-02, IM-06, IM-07, IM-09 từ bên ngoài — vì cả bốn đều tạo ra số hợp lệ
bên trong hệ thống.

```prisma
model AdsSpendReconciliation {
  id               String   @id @default(cuid())
  /// "2026-08" (MONTH) hoặc "2026-08-31" (DAY).
  period           String
  scope            String   // MONTH | DAY
  channel          String
  systemTotalVnd   Int      // Σ AdsSpendDaily (supersededAt IS NULL) trong kỳ — máy tính
  externalTotalVnd Int      // người nhập từ Ads Manager
  diffVnd          Int
  diffPercent      Float
  note             String?  @db.Text
  enteredById      String
  enteredAt        DateTime @default(now()) @db.Timestamptz(6)

  @@unique([period, scope, channel])
}
```

**Cách vận hành:**

| Bước | Việc | Ai |
|---|---|---|
| 1 | Hệ thống tự tính `systemTotalVnd` và hiện sẵn trên màn | máy |
| 2 | Người mở Ads Manager, gõ **một** con số tổng vào ô `externalTotalVnd`, bấm lưu | Trưởng Marketing |
| 3 | Hệ thống tính `diffVnd`/`diffPercent`, lưu, và bắn cảnh báo nếu vượt ngưỡng | máy |

**Kỳ bắt buộc:** hằng tháng (MONTH) + **3 mẫu ngày** mỗi tháng (DAY): ngày đầu, một ngày giữa, **ngày cuối
tháng**. Mẫu ngày cuối tháng là bắt buộc — đó là mẫu duy nhất phân biệt IM-06 (lệch múi giờ) với "số khớp",
vì lệch múi giờ **không lộ** khi so tổng tháng gộp nhiều tháng.

**Đọc dấu của độ lệch — đây là giá trị lớn nhất của cơ chế này:**

| Dấu | Nghi ngờ đầu tiên | Kiểm tiếp bằng |
|---|---|---|
| `systemTotal < externalTotal` | IM-02 (attribution chưa chốt) hoặc IM-08 (chạy một phần) | `AdsSyncRun.status = PARTIAL`? `rowsFetched` vs `rowsWritten` lệch? |
| `systemTotal > externalTotal` | IM-09 (cộng đôi) | Có ≥ 2 `AdsSyncRun` `kind = SCHEDULED` cùng `targetDate`? |
| Lệch đúng bằng chi tiêu ~1 ngày, chỉ ở kỳ cuối tháng | IM-06 (múi giờ) | `AdsSyncRun.accountTimezone` |
| Lệch cỡ ~26.000 lần | IM-07 (đơn vị tiền) | `AdsSyncRun.accountCurrency` |

Ngưỡng: setting `ads.reconDiffPercentThreshold`, mặc định `2` (%). Khai vào `lib/settings/registry.ts` theo
mẫu `intake.alertFailedPerHour` (`:653-660`).

#### 9.3 — Cảnh báo KHÔNG CÓ DỮ LIỆU N ngày liên tiếp

**Không đặt ngưỡng tuyệt đối.** Lý do đã được viết sẵn trong repo cho đúng bài này
(`lib/lead/intake/health.ts:20-24`): *"phải so với chính nền của nó… đặt ngưỡng cứng chỉ tạo ra báo động giả —
mà báo động giả bị phớt lờ thì lần hỏng thật cũng bị phớt lờ theo"*.

Hai tín hiệu, cố ý khác bản chất (sao chép cấu trúc `detectIntakeAlerts`, `health.ts:60-136`):

| Tín hiệu | Điều kiện | Ý nghĩa |
|---|---|---|
| **`no-run`** | Không có `AdsSyncRun` nào với `status ∈ {OK, PARTIAL}` trong `ads.alertSilentHours` giờ qua | Job **không chạy** — IM-01, IM-03 |
| **`no-data`** | Có lần chạy `OK` nhưng `rowsFetched = 0` trong khi 7 ngày trước đó **có** dữ liệu | Job chạy nhưng Meta **không trả gì** — IM-08 lớp parser, hoặc tài khoản ngừng chi |

Tách hai tín hiệu là bắt buộc: gộp lại thì "job chết" và "hết chiến dịch" cùng một thông báo, và người nhận
sẽ học cách bỏ qua cả hai.

Setting mới (`lib/settings/registry.ts`, `group: "crm"` hoặc nhóm mới `"ads"`):

| Key | Mặc định | Ý nghĩa |
|---|---|---|
| `ads.alertSilentHours` | `36` | Job chạy 1 lần/ngày ⇒ cho trượt đúng 1 nhịp rồi mới báo |
| `ads.baselineMinDays` | `7` | Nền phải đủ dày mới coi là "từng chạy đều" (`health.ts:118-121`) |

Cron: chạy chung `marketing-alerts` (`vercel.json:32-35`, đã có) thay vì thêm cron thứ 25 — job đó đã gọi
`notifyStaff` và đã có `getSuperAdminUserIds`.

#### 9.4 — Cảnh báo nhóm `CHƯA PHÂN BỔ` vượt ngưỡng %

Nguồn số: `AdsSyncRun.unallocatedVnd / spendTotalVnd` của kỳ đang xét (hoặc tính lại từ `AdsSpendDaily` với
`resolvedBy = NONE`).

| Cảnh báo | Điều kiện | Vì sao tách riêng |
|---|---|---|
| **`unallocated`** | `unallocatedVnd / spendTotalVnd > ads.unallocatedPercentThreshold` (mặc định `5`%) | Campaign mới chưa đặt tên đúng quy ước — việc của Marketing |
| **`bad-center-code`** | Parse ra mã cơ sở **không khớp** `Center.code` nào đang `isActive` (`prisma/schema.prisma:237` — cột **nullable**) | Lỗi **quy ước/danh mục** — việc của admin. Gộp với cái trên là mất hẳn tín hiệu này |

⚠️ Cảnh báo này **một mình không đủ** cho IM-05: trường hợp tệ nhất (parser fuzzy khớp nhầm cơ sở khác) làm
tiền đi thẳng vào cơ sở sai mà nhóm `CHƯA PHÂN BỔ` **không phình**. Vì vậy **cấm fuzzy-match** là ràng buộc
song song, không thay thế được bằng cảnh báo.

Ngoài cảnh báo: hiện banner ngay trên tab D theo đúng D-08, kèm **danh sách campaign** chưa phân bổ và số tiền
từng cái — cảnh báo chỉ nói "có vấn đề", danh sách mới nói "sửa cái nào".

#### 9.5 — Cảnh báo biến động bất thường so với trung bình động

```
baseline(d) = trung bình spendVnd của 4 lần xuất hiện gần nhất CÙNG THỨ trong tuần
              (chi tiêu QC có nhịp tuần rõ — so với 7 ngày liền kề sẽ báo động giả
               vào mỗi cuối tuần)
báo khi:  |spend(d) − baseline(d)| / baseline(d) > ads.anomalyPercentThreshold
    VÀ    baseline(d) >= ads.anomalyMinBaselineVnd
```

Điều kiện thứ hai là bắt buộc: không có nó thì mọi campaign nhỏ (nền vài chục nghìn đồng) sẽ đẻ báo động mỗi
ngày.

| Key | Mặc định | Ghi chú |
|---|---|---|
| `ads.anomalyPercentThreshold` | `60` (%) | Nới rộng có chủ đích — mục tiêu là bắt sự cố, không bắt dao động |
| `ads.anomalyMinBaselineVnd` | `500000` | Dưới mức này không báo |

Cảnh báo này bắt được thứ mà §9.2 và §9.3 không bắt: tài khoản bị khoá giữa tháng, ai đó nhân đôi ngân sách,
hoặc IM-09 cộng đôi **trong ngày** (trước khi đối soát tháng phát hiện).

#### 9.6 — Chạy lại có chủ đích (backfill) và cách phân biệt với bản ghi gốc

**Ba tầng phân biệt, không tầng nào thay được tầng nào:**

| Tầng | Cơ chế | Trả lời câu hỏi |
|---|---|---|
| 1 | `AdsSyncRun.kind ∈ {SCHEDULED, BACKFILL, MANUAL}` + `triggeredById` | *Ai chạy, chạy kiểu gì* |
| 2 | `AdsSpendDaily.runId` (mọi dòng số đều trỏ về một lần chạy) | *Dòng số này ra đời từ lượt chạy nào* |
| 3 | `supersededAt` + `supersededByRunId` trên bản cũ | *Số cũ là bao nhiêu, bị bản nào thay* |

**Đường chạy lại — hai lối, cả hai đều phải có, dùng cho hai tình huống khác nhau:**

1. **Script dòng lệnh** `scripts/ads-backfill.ts --from=YYYY-MM-DD --to=YYYY-MM-DD [--save]` —
   theo đúng mẫu `scripts/nen-p1-doi-soat-orgunit.ts:1-20`: **dry-run là mặc định**, `--save` mới ghi, in
   bảng Markdown so sánh *số hiện có* vs *số Meta trả bây giờ* trước khi ghi. Dùng cho backfill dài ngày,
   người vận hành chạy tay (luật cứng #4 của Nền Hệ thống).
2. **Server Action "Đồng bộ lại ngày này"** trên màn `/admin/marketing/ads-sync` — theo mẫu
   `app/(admin)/admin/_actions/cron-trigger.ts` (`triggerType: "MANUAL"` `:87`), có `auth()` +
   `assertCan("ads:manage")` ngay đầu hàm. Dùng cho 1 ngày lẻ, không cần Dev.

**Ba luật của backfill:**

- **KHÔNG xoá dòng cũ.** Chạy lại sinh `AdsSyncRun` mới + bộ `AdsSpendDaily` mới; bộ cũ được đánh
  `supersededAt = now()` + `supersededByRunId`. Đây chính là điều IM-04 đang phá.
- **Backfill không được ghi đè kỳ đã khoá sổ** (`MarketingCostPeriod.status = CONFIRMED`) — trừ khi kỳ được
  `REOPEN`, đúng mô hình đã có ở `lib/crm/cost-allocation.ts:82-101`.
- Quy ước cột `source` `"META_API" | "MANUAL"` đã tồn tại (`prisma/schema.prisma:955`) — **giữ nguyên tên**,
  đừng đẻ hệ mã thứ hai.

#### 9.7 — Ai nhận cảnh báo, qua kênh nào

Kênh: `StaffNotification` qua **đường ghi duy nhất** `notifyStaff` (`lib/notifications/notify.ts:47`). Không
tự gọi `db.staffNotification.upsert` — file đó ghi rõ vì sao (`:8-19`: trước đây 17 nơi tự ghi, mỗi nơi một
kiểu).

**Bốn việc bắt buộc, thiếu bất kỳ cái nào thì cảnh báo có tồn tại nhưng vô dụng:**

**(a) Khai tiền tố `dedupeKey` vào `lib/notifications/catalog.ts`.** Không khai ⇒ `console.warn` *"dedupeKey …
chưa khai trong catalog — thông báo sẽ nằm chót panel"* (`notify.ts:62-67`). Mẫu có sẵn ngay cạnh:
`"cost-unconfirmed:"` và `"report-missing:"` (`catalog.ts:281-290`).

| dedupeKey đề nghị | Nhóm | Mức | Nội dung |
|---|---|---|---|
| `ads-sync-norun:<vnYmd>` | `action_required` | **1** (khẩn) | Job không chạy — §9.3 |
| `ads-sync-nodata:<vnYmd>` | `action_required` | 2 | Chạy nhưng Meta không trả gì — §9.3 |
| `ads-sync-auth:<vnYmd>` | `action_required` | **1** (khẩn) | Lỗi token (`errorCode = 190`) — IM-03 |
| `ads-unallocated:<period>` | `action_required` | 2 | % chưa phân bổ vượt ngưỡng — §9.4 |
| `ads-badcode:<period>` | `action_required` | 2 | Mã cơ sở không khớp danh mục — §9.4 |
| `ads-anomaly:<vnYmd>` | `system` | 3 | Biến động bất thường — §9.5 |
| `ads-recon-gap:<period>` | `action_required` | 2 | Lệch đối soát vượt ngưỡng — §9.2 |

Khoá theo **ngày VN** (`vnYmd`, `lib/time/vn.ts:55-60`) hoặc theo kỳ ⇒ tối đa 1 thông báo/loại/ngày/người.
**Không dùng `reopen`** — cron chạy hằng ngày, kéo về chưa-đọc mỗi lượt là biến chuông thành nguồn nhiễu
(`marketing-alerts.ts:22-24` đã ghi đúng lý do này).

**(b) Người nhận phải theo QUYỀN, không theo `SUPER_ADMIN` mặc định.**
Mẫu đúng đã có ở `app/api/cron/payment-reconcile/route.ts:47-60`: lấy **hợp** của RBAC v2 động (`RolePermission`
theo action) và ma trận v1 tĩnh, vì cron chạy ở cả hai môi trường và lấy hợp thì không môi trường nào im lặng
không báo cho ai. Áp dụng với quyền `ads:manage` — **quyền này CHƯA CÓ**, phải thêm vào
`lib/permissions/registry/` + `prisma/seed-roles.ts`, và **sau khi merge lên main phải chạy
`seed-prod-roles.yml`**, nếu không thì trên prod không ai có quyền ⇒ không ai nhận cảnh báo.

| Loại cảnh báo | Người nhận đề nghị |
|---|---|
| `ads-sync-norun` · `ads-sync-nodata` · `ads-sync-auth` | Người giữ `ads:manage` (Marketing HO) **+** SUPER_ADMIN — đây là sự cố kỹ thuật |
| `ads-unallocated` · `ads-badcode` | Người giữ `ads:manage` — việc đặt tên campaign |
| `ads-recon-gap` | Người giữ `ads:manage` **+** kế toán HO |
| `ads-anomaly` | Người giữ `ads:manage` |

**(c) `href` dùng clean-URL, KHÔNG tiền tố `/admin`.** Quy ước đã ghi tại `lib/lead/intake/health.ts:156-159`
(giữ `/admin/...` thì link vẫn tới nơi nhưng ăn thêm một hop redirect legacy). Đích: `/marketing/ads-sync`
cho nhóm kỹ thuật, `/marketing/funnel` cho nhóm số liệu (`marketing-alerts.ts:32` đã dùng đích thứ hai).

**(d) Nội dung cảnh báo KHÔNG nên chứa số tiền tuyệt đối.** `kiemPii` bắt regex số tiền
(`lib/notifications/pii.ts:27`) và `notifyStaff` sẽ `console.warn` mỗi lần (`notify.ts:53-60`); `cheSdt` **cố
ý không che tiền** (`pii.ts:44-49`) nên con số sẽ nằm nguyên trên dòng xem trước của panel chuông — mà panel
mở giữa chỗ đông người. Viết theo **% lệch + đường dẫn**, để con số thật nằm sau màn có kiểm quyền:

```
❌ "Chi phí QC tháng 08 lệch 12.450.000đ so với Ads Manager"
✅ "Đối soát chi phí QC kỳ 2026-08 lệch 8,3% — mở trang đối soát để xem chi tiết"
```

**(e) Không có ai để gửi thì phải kêu vào log.** Sao chép nguyên `health.ts:146-154`: nếu danh sách người nhận
rỗng thì `console.error` kèm danh sách cảnh báo — nuốt im ở đây là tái lập đúng cái lỗi mà cả cơ chế này sinh
ra để chặn.

---

### Go/No-Go Checklist

Mỗi dòng phải kiểm được bằng một thao tác cụ thể, không chấp nhận "đã xem qua".

**Cổng A — trước khi viết dòng code đầu tiên (quyết định, không phải migration)**

| # | Điều kiện | Cách kiểm | Đạt? |
|---|---|---|---|
| A1 | Chốt: snapshot **append-only**, `upsertAdsInsight` bị gỡ/deprecated | Đọc lại quyết định trong PRD khu vực D; grep `upsertAdsInsight` sau PR = 0 call-site mới | ☐ |
| A2 | Chốt `accountCurrency` và `accountTimezone` kỳ vọng của tài khoản QC thật | Trưởng Marketing mở Ads Manager, chụp màn hai giá trị, ghi vào tài liệu | ☐ |
| A3 | Chốt **một** định nghĩa "đã chốt" dùng chung cho C và D | Văn bản quyết định; sau đó `funnel-query.ts:14` và `lib/reports/lead.ts:45` phải nhất quán | ☐ |
| A4 | Chốt danh sách `Center.code` đầy đủ, mọi cơ sở đang hoạt động **đều có mã** | `SELECT code FROM "Center" WHERE "isActive" AND code IS NULL` ⇒ phải 0 dòng | ☐ |
| A5 | `SR.QD.232` đã ban hành **và** campaign đang chạy đã đổi tên theo quy ước | Trưởng Marketing xác nhận; đếm campaign chưa đúng quy ước trên Ads Manager | ☐ |
| A6 | Đo prod: `AdsInsightDaily` và `MarketingCostPeriod` hiện có bao nhiêu dòng | 2 câu `SELECT COUNT(*)` — **không suy đoán từ mã** | ☐ |
| A7 | Đo prod: `StaffNotification` với `dedupeKey LIKE 'cost-unconfirmed:%'` đang tồn đọng bao nhiêu (E-07) | 1 câu `SELECT COUNT(*)`; > 30 ⇒ phải dọn/đổi người nhận trước khi thêm cảnh báo mới | ☐ |

**Cổng B — trước khi bật cron ghi thật**

| # | Điều kiện | Cách kiểm | Đạt? |
|---|---|---|---|
| B1 | `AdsSyncRun` + `AdsSpendDaily` đã migrate, `AdsSpendDaily` khai **cả** `SCOPED_MODELS` **và** `BACKFILL_SPECS` | `pnpm test` — test `[US-07-IT-08b]` xanh | ☐ |
| B2 | Test CI: gọi handler với Meta giả → đúng 1 dòng `AdsSyncRun`, `rowsFetched/rowsWritten` khớp | `pnpm test:e2e` | ☐ |
| B3 | Test CI: gọi handler **hai lần** cùng `runKey` → không cộng đôi (`AdsSpendDaily` count không đổi) | `pnpm test:e2e` | ☐ |
| B4 | Test CI: Meta trả `currency = "USD"` → `status = BLOCKED`, **0 dòng** `AdsSpendDaily` | `pnpm test:e2e` | ☐ |
| B5 | Test CI cách ly: 2 cơ sở, spend chỉ gắn CS1, đọc bằng actor CS2 ⇒ **0** | `pnpm test:e2e` | ☐ |
| B6 | Token gửi qua header, **không** qua query string | Đọc lại `syncMetaAds`; grep `access_token=` = 0 hit | ☐ |
| B7 | Lịch cron viết đúng UTC + có chú thích giờ VN | Đọc `vercel.json` + dòng chú thích trong route | ☐ |
| B8 | Endpoint đã thêm vào `cron-pump-test.yml` kèm assert `inconclusive` | Chạy `workflow_dispatch` một lượt, xem xanh | ☐ |
| B9 | **Chạy dry-run trên prod 1 lượt**: ghi `AdsSyncRun`, **không** ghi `AdsSpendDaily` | Kiểm 1 dòng `AdsSyncRun` với `rowsFetched > 0`, `rowsWritten = 0`; đối chiếu `spendTotalVnd` bằng mắt với Ads Manager | ☐ |
| B10 | `pnpm typecheck && pnpm lint && pnpm build` PASS | — | ☐ |

**Cổng C — trước khi mở tab D cho QLCS (số bắt đầu được người ngoài đọc)**

| # | Điều kiện | Cách kiểm | Đạt? |
|---|---|---|---|
| C1 | Đã có **7 ngày liên tiếp** `AdsSyncRun.status = OK` với `rowsFetched > 0` | `SELECT` trên `AdsSyncRun`; ⚠️ ngày nào `rowsFetched = 0` **không tính** là ngày sạch (bài học `cron-pump-test.yml:72-77`) | ☐ |
| C2 | Đã chạy **1 lượt đối soát tổng tháng** với lệch ≤ ngưỡng | Bản ghi `AdsSpendReconciliation` | ☐ |
| C3 | Đã chạy **đối soát mẫu ngày cuối tháng**, lệch ≤ ngưỡng (bắt IM-06) | Bản ghi `AdsSpendReconciliation` `scope = DAY` | ☐ |
| C4 | 4 cảnh báo §9.3–§9.5 đã khai trong `catalog.ts` và **đã bắn thử một lần tới đúng người** | Người nhận xác nhận thấy trên chuông | ☐ |
| C5 | Quyền `ads:manage` đã seed **trên prod** (`seed-prod-roles.yml` đã chạy) và có ≥ 1 người giữ | `list-permissions.ts` hoặc màn `/admin/user-groups` | ☐ |
| C6 | Tab D **không** bật "Tất cả cơ sở" (A-02-7), hoặc đã có cột phạm vi + test C5 xanh | Đọc màn lọc | ☐ |
| C7 | Tỷ số có mẫu số 0 hiện `—`, **không** hiện `0`; mẫu số hiện cạnh tỷ số | Xem trực tiếp trên màn với dữ liệu thật | ☐ |
| C8 | Có tên người cụ thể chịu trách nhiệm mở Ads Manager khi cảnh báo nổ (E-02) | Ghi tên vào tài liệu vận hành | ☐ |

**Điều kiện NO-GO (bất kỳ mục nào đúng ⇒ dừng, không bật):**

- `upsertAdsInsight` vẫn là đường ghi ⇒ mọi bằng chứng của 5 rủi ro khác sẽ bị đè mất (T-02).
- Không có `AdsSyncRun` ⇒ lần chạy sai đầu tiên sẽ không nhìn thấy được (T-01).
- `accountCurrency` chưa xác minh ⇒ sai ~26.000 lần theo hướng làm số đẹp (T-04).
- Chưa ban hành `SR.QD.232` mà không có đường backfill ⇒ dữ liệu những ngày đầu hỏng vĩnh viễn (T-07).
