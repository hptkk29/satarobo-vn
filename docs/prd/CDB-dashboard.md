# PRD — DASHBOARD SỐ LIỆU: KHU VỰC C (Kinh doanh) · D (Chi phí Marketing) · B (Tài chính)

**Trạng thái:** Draft
**Nguồn spec (đã chốt):** `docs/specs/spec-dashboard-qlcs-duyet-media-lead.md` — KHU VỰC B, C, D
**PRD nền phụ thuộc:** `docs/prd/A-nen-tang.md` (§6.2 bộ lọc phạm vi A-02 · §10 danh sách khoá schema) · `docs/prd/G-lead.md` (schema lead mới)
**Nhánh khảo sát:** `hptkk29/runhop20_08`

> Mọi khẳng định hiện trạng trong tài liệu này đều kèm `file:dòng`, đọc trực tiếp từ mã nguồn trên nhánh này.
> Ba chữ dùng nhất quán: **CHƯA CÓ** = không tồn tại trong repo · **MÃ CHẾT** = mã tồn tại nhưng không call-site sản phẩm nào gọi · **SAI** = có mã, chạy được, và cho ra con số không đúng nghĩa mà nó tự khai.
>
> ⚠️ **Vài số dòng ở đây lệch với `docs/prd/G-lead.md`.** Tài liệu này đọc lại `prisma/schema.prisma` từng dòng, nên dùng số của tài liệu này. Các chỗ lệch đã xác minh: `Lead.centerId` = **`:1316`** (G-lead ghi `:1315`, dòng đó là `childAge`) · `Lead.orgUnitId` = **`:1317`** · `Lead.courseId` = **`:1318`** · `Lead.assignedToId` = **`:1319`** · `LeadChild.interestedCourseId` = **`:1471`** · `LeadChild.interestedCenterId` = **`:1472`** · `LeadChild.trialStatus` = **`:1474`**. Cùng một cột, chỉ khác con số — không phải mâu thuẫn nội dung.

---

## 0. Thứ tự phụ thuộc — vì sao viết C trước, rồi D, rồi B

Spec (`docs/specs/spec-dashboard-qlcs-duyet-media-lead.md:199`) ghi thứ tự thi công **C → D → B**. Tài liệu này viết theo đúng thứ tự đó, và dưới đây là lý do kỹ thuật, không phải quy ước.

```
            ┌──────────────────────────────────────────┐
            │  A-02  resolveScopeFilters()             │  ← CHƯA CÓ
            │  centerIds[] + dateFrom + dateTo         │     (chỉ có resolveReportFilters
            └───────┬──────────┬──────────────┬────────┘      lib/reports/filters.ts:50)
                    │          │              │
   G (schema lead)  ▼          ▼              ▼
   LeadChild.status   ┌─────────┐   ┌─────────┐   ┌─────────┐
   LeadChild.closedAt │    C    │──►│    D    │──►│    B    │
   lastActivityAt ───►│ Kinh    │   │  Ads    │   │Tài chính│
      (vá N-4)        │ doanh   │   │         │   │         │
                      └────┬────┘   └────┬────┘   └─────────┘
                           │             │             ▲
        C1 tổng lead ──────┴──► D2 CPL   │             │
        C3 lead chốt ─────────► D3 CPA   │             │
                                         │             │
   job đồng bộ ads (D-01) ──► D1 ngân sách ──► B2 chi phí (một đầu phí)
                                                       │
                                                       ▼
                                        B3 lợi nhuận · B4 dòng tiền
```

| # | Ràng buộc | Bằng chứng |
|---|---|---|
| 1 | **C phải xong trước D** vì D2 (CPL) và D3 (CPA) lấy **mẫu số** từ C. `computeCpl(spend, l2)` / `computeCpa(spend, l3)` (`lib/crm/marketing-metrics.ts:26-27`) — không chốt "tổng lead" và "lead chốt" là gì thì CPL/CPA không định nghĩa được. Mẫu số hôm nay là `qualifiedAt IS NOT NULL` / `convertedAt IS NOT NULL` (`lib/crm/funnel-query.ts:13-14`), mà cả hai trường gần như **không có dữ liệu** (§C.2.3) ⇒ CPL/CPA đang chia cho gần-0 | `lib/crm/funnel-query.ts:13-14` · `lib/crm/marketing-metrics.ts:24-31` |
| 2 | **D phải xong trước B** vì chi phí quảng cáo là **một đầu phí** của B2. Nếu B dựng bảng chi phí trước rồi D lại đẻ bảng ads riêng, cùng một khoản tiền quảng cáo nằm ở hai bảng và B3 (lợi nhuận) trừ hai lần. B2 phải khai ngay từ đầu rằng đầu phí "Quảng cáo" **không nhập tay**, mà đọc từ nguồn của D | spec `:24` (B-03) và `:62` (D-01) cùng nói về tiền chi |
| 3 | **C phụ thuộc G** (schema lead mới). Chỉ tiêu C-01 đếm theo **học sinh** (`lead_student`), mà `LeadChild` hôm nay **không có** `status` / `closedAt` / `centerId` — đúng SL-08 + SL-09 trong `docs/prd/A-nen-tang.md` §10.3 | `prisma/schema.prisma:1461-1483` — 14 trường, không có ba cột trên |
| 4 | **Cả ba phụ thuộc A-02.** `resolveScopeFilters()` **CHƯA CÓ** — grep toàn repo = 0 kết quả. Chỉ có `resolveReportFilters` với `centerId` **đơn** (`lib/reports/filters.ts:11`), không phải mảng ⇒ QLCS đa cơ sở (A-01) không diễn đạt được bằng hàm cũ | `lib/reports/filters.ts:9-16,50` |
| 5 | **B đứng cuối** vì B3 = B1 − B2 và B4 = thu − chi: hai vế trừ đều phụ thuộc thứ chưa tồn tại. Riêng B1 làm được ngay — nhưng làm B1 rồi dừng thì hàng chỉ số B-03 (Chi phí · Lợi nhuận · Dòng tiền) là **ba ô trống** | spec `:24` |

### 0.1 Ba yêu cầu bắt buộc chung — áp cho cả C, D, B

| # | Luật | Áp ở metric |
|---|---|---|
| **CHUNG-1** | 🔴 **Toàn bộ doanh thu tính theo THỰC THU**, không theo giá trị hợp đồng. Repo hiện có **HAI** định nghĩa doanh thu chạy song song (§B.2.2). PRD này **chọn định nghĩa sổ `Payment` (`accountantStatus` đã xác nhận)**. Hệ quả **bắt buộc nói ra**: số của tab B sẽ **KHÁC** dashboard kế toán (`accountant-dashboard.tsx:26-31`) và **KHÁC** mẫu số ROAS (`lib/crm/funnel-query.ts:17-20`) — hai chỗ đó dùng `Order.totalAmount`. Phải **hoặc** thống nhất lại cả ba, **hoặc** đổi tên metric để người đọc biết đang xem con số nào | B1 · B3 · B4 · B6 · C3 (cột giá trị) · ROAS của D |
| **CHUNG-2** | 🔴 **Chỉ tiêu lead C-01 đếm theo HỌC SINH (`lead_student`), KHÔNG đếm phụ huynh.** Nhất quán với `docs/prd/G-lead.md` §6.5 và spec `:190` (*"đề xuất đếm học sinh, vì đó mới là đơn vị sinh doanh thu"*). Kéo theo: C1, C2, C3, C4 **và mẫu số của D2/D3** đều là học sinh | C1 · C2 · C3 · C4 · D2 · D3 |
| **CHUNG-3** | Bộ lọc phạm vi dùng chung của A-02 (`resolveScopeFilters`) là **đầu vào của cả 4 tab**. **Mọi** truy vấn trong tài liệu này nhận đúng ba tham số `centerIds[]` · `dateFrom` · `dateTo`. Không truy vấn nào được tự lấy phạm vi từ nơi khác | toàn bộ |

**Chữ ký hàm dùng chung (đề nghị, khớp `A-nen-tang.md` §6.2):**

```ts
// lib/reports/filters.ts — THÊM MỚI cạnh resolveReportFilters, KHÔNG sửa hàm cũ.
// (A-nen-tang.md §6.2 ràng buộc 6: đổi kiểu ReportFilters làm vỡ 11 chỗ đọc / 8 page
//  + lan sang ĐƯỜNG GHI mục tiêu doanh thu ở bao-cao/doanh-thu/_actions.ts:48.)
export type ScopeFilters = {
  centerIds: string[] | null; // null = toàn bộ phạm vi cho phép của actor
  dateFrom: Date;             // mặc định: 00:00 ngày 01 tháng hiện tại — GIỜ VN
  dateTo: Date;               // mặc định: 00:00 ngày MAI — GIỜ VN. Khoảng NỬA MỞ [from, to)
};
```

> 🔴 **Bẫy giờ VN đã nằm sẵn trong hàm cũ — đừng chép lại.** `resolveReportFilters` parse hai đầu ngày bằng **hai cách khác nhau**: `parseDateStart` dùng `new Date("2026-08-01")` → JS hiểu là **00:00 UTC** = 07:00 giờ VN; `parseDateEnd` dùng `new Date("2026-08-31T23:59:59.999")` (không có hậu tố `Z`) → JS hiểu là **giờ máy chủ**, mà Vercel chạy UTC ⇒ 06:59:59 sáng 01/09 giờ VN (`lib/reports/filters.ts:35-44`). Hệ quả trên prod: bộ lọc "tháng 8" **mất** mọi giao dịch 00:00–07:00 giờ VN ngày 01/08 và **ăn nhầm** giao dịch 00:00–07:00 giờ VN ngày 01/09. `resolveScopeFilters` phải neo cả hai đầu vào `Asia/Ho_Chi_Minh` và dùng nửa mở `[dateFrom, dateTo)`, **không** dùng `lte` với mốc `.999`.

> 🔴 **Bẫy khoá cache.** `reportFilterCacheKey` (`lib/reports/filters.ts:88-90`) ghép đúng `centerId|dateFrom|dateTo` và là **discriminator DUY NHẤT** của `safeCache` — 8 trang `/bao-cao/*` gọi nó với closure 0 tham số. 4 tab dashboard phải có khoá cache riêng gồm cả mảng `centerIds` đã **sắp xếp** (cùng tập nhưng khác thứ tự phải ra cùng khoá), nếu không hai bộ lọc khác nhau dùng chung một entry ⇒ **sai số liệu im lặng 120 giây** (`A-nen-tang.md` §6.2 ràng buộc 7).

### 0.2 Bảng tình trạng 14 metric — đọc trước khi ước lượng

| Metric | Tên | Tính được hôm nay? | Chặn bởi |
|---|---|---|---|
| **C1** | Tổng lead (đếm học sinh) | ⚠️ Một phần — đếm được `LeadChild`, nhưng **không lọc được theo cơ sở** | SL-08 (`LeadChild.centerId`) |
| **C2** | Tỷ lệ đạt mục tiêu lead | ❌ **KHÔNG** | Model mục tiêu lead **CHƯA CÓ** |
| **C3** | Tỷ lệ thành công (chốt/tổng) | ❌ **KHÔNG** — 3 định nghĩa "đã chốt" chạy song song, **chắc chắn lệch nhau trên prod** | Chốt định nghĩa + SL-09 |
| **C4** | Thời gian chốt trung bình | ❌ **KHÔNG** — `convertedAt` là **trường chết** trong báo cáo | SL-09 (`LeadChild.closedAt`) + vá đường ghi |
| **C5** | Số ngày chưa tiếp cận lại | ⚠️ Tính được từ `LeadActivity`; **KHÔNG** tin được nếu đọc `lastActivityAt` | Vá N-4 (nếu dùng cột denormalize) |
| **D1** | Ngân sách thực tế theo cơ sở | ❌ **KHÔNG** — toàn bộ đường ghi ads là **MÃ CHẾT**, bảng không có cột đơn vị | Bảng snapshot mới + job D-01 |
| **D2** | CPL | ❌ **KHÔNG** — tử số (D1) chưa có, mẫu số (C1) chưa chốt | D1 + C1 |
| **D3** | CPA | ❌ **KHÔNG** — như trên, mẫu số là C3 | D1 + C3 |
| **B1** | Doanh thu thực thu | ✅ **CÓ** — nhưng lặp 3 chỗ, và **bỏ sót hoàn tiền + điều chỉnh** | — (dọn mã, không cần schema) |
| **B2** | Chi phí | ❌ **KHÔNG** — hệ thống **không có khái niệm "chi"**: 207 model, 0 model chi phí | Bảng chi phí mới + màn nhập + import B-05 |
| **B3** | Lợi nhuận = thực thu − chi phí | ❌ **KHÔNG** — thiếu vế trừ | B2 |
| **B4** | Dòng tiền = thu − chi | ❌ **KHÔNG** — thiếu vế trừ; vế "thu" còn 3 nghĩa khác nhau | B2 + chốt nghĩa "thu" |
| **B5** | Doanh thu chi tiết theo NGÀY | ❌ **KHÔNG** — **chưa từng có trục NGÀY**, mọi thứ là tháng (`monthKeyVN`) | — (chỉ là mã) |
| **B6** | Mục tiêu + tỷ lệ hoàn thành | ⚠️ Một phần — có `RevenueTarget`, nhưng hàm đọc **bỏ qua mục tiêu từng cơ sở** khi actor cấp HO | Vá `lib/reports/revenue-target-data.ts:24-25` |

---

# PRD C — KHU VỰC C: Dashboard / Tab Kinh doanh

**Phạm vi:** C-01 → C-07. Không mở sang A/B/D/E/F/G.
**Phụ thuộc cứng:** `docs/prd/G-lead.md` (SL-08 · SL-09) · `docs/prd/A-nen-tang.md` §6.2 (A-02) + §10.3.

---

## C.1 Executive Summary

Tab Kinh doanh làm ba việc:

1. **Khối chỉ số lead** (C-02): Tổng lead · Tỷ lệ đạt mục tiêu · Tỷ lệ thành công — cả ba **đếm theo học sinh** (CHUNG-2).
2. **Hai bảng làm việc**: *Lead đã chuyển đổi* (C-03) và *Lead rớt* (C-05), cộng cột "số ngày chưa tiếp cận lại" phải đưa **lên cả bảng lead đang chăm** kèm cảnh báo vượt ngưỡng (yêu cầu vận hành, spec `:54`).
3. **Kỷ luật dữ liệu** để hai bảng trên có nghĩa: đánh dấu rớt bắt buộc lý do (C-06) và audit đổi trạng thái hiển thị được (C-07).

**Ba điều phải chốt trước dòng code đầu tiên:**

| # | Vấn đề | Vì sao chặn |
|---|---|---|
| 1 | 🔴 **"Đã chốt" đang có BA nghĩa song song** — và vì `lib/finance/payment.ts:152-155` đưa lead lên `REGISTERED` mà **không** set `convertedAt`, ba con số **chắc chắn lệch nhau trên prod** | C3 (tỷ lệ thành công), C4 (thời gian chốt), C-03 (bảng lead đã chuyển đổi) và **mẫu số D3 (CPA)** đều đứng trên nó |
| 2 | 🔴 **"Thời gian chốt" CHƯA TỒN TẠI.** `Lead.convertedAt` có thật, được `SELECT` ở `app/(admin)/admin/bao-cao/lead/page.tsx:64`, map vào record ở `:79`, khai kiểu ở `lib/reports/lead.ts:12` — nhưng **không hàm nào đọc nó**. Không có phép trừ `convertedAt − createdAt` ở bất kỳ đâu trong repo | C4 xây mới từ đầu |
| 3 | 🔴 **Đồng hồ "chưa tiếp cận lại" hiện SAI.** `Lead.lastActivityAt` chỉ được ghi ở **3** chỗ trong khi có **15** chỗ tạo `LeadActivity`; và `lib/crm/sla.ts:132` còn truyền nhầm `lead.updatedAt` thay cho `lead.lastActivityAt` | C5 — số ngày hiển thị sẽ **làm đẹp giả**, đúng thứ spec `:54` cảnh báo |

---

## C.2 Background & Context

### C.2.1 Cái đang có

| Thứ | Vị trí | Quy mô |
|---|---|---|
| Bộ hàm thuần báo cáo lead | `lib/reports/lead.ts` | **303 dòng, 12 hàm export** + `lib/reports/lead.test.ts` **181 dòng** |
| Trang báo cáo lead | `app/(admin)/admin/bao-cao/lead/page.tsx` | Phễu cumulative 8 bước (`FUNNEL_ORDER`, `lib/reports/lead.ts:48-57`), nhóm theo nguồn / cơ sở / tháng / nguồn-hoa-hồng |
| Bộ lọc dùng chung | `lib/reports/filters.ts:50` `resolveReportFilters` | `centerId` **đơn**, không phải mảng |
| Bảng lead | `Lead` `prisma/schema.prisma:1309` · `LeadChild` `:1461` | 49 / 14 trường vô hướng |
| Timeline | `LeadActivity` `:3527`, enum `LeadActivityType` `:3471-3478` (`CALL` `MESSAGE` `NOTE` `STATUS_CHANGE` `EMAIL` `HANDOVER`) | index `[leadId, createdAt]` `:3538` |
| Audit hợp nhất | `AuditLog` `:564-585` | `logLeadAudit` (`lib/audit/log.ts:128-156`) ghi `module: "leads"`, `action: "lead.<verb>"` |

### C.2.2 🔴 "Tỷ lệ chốt" hiện có **ÍT NHẤT 8** công thức khác nhau — không có nguồn sự thật

| # | Nơi | Tử số | Mẫu số |
|---|---|---|---|
| 1 | `lib/reports/lead.ts:273` `leadSummary` | `status ∈ {ENROLLED, REGISTERED}` (`CONVERTED_STATUSES` `:45`) | mọi lead trong bộ lọc |
| 2 | `app/(admin)/admin/dashboard/_components/manager-dashboard.tsx:117` | `status = ENROLLED` (`:86`) | **mọi** lead chưa xoá (`ACTIVE_LEAD`), **không lọc kỳ** |
| 3 | `app/(admin)/admin/dashboard/_components/sales-dashboard.tsx:49` | `countByStatus["ENROLLED"]` | lead **của tôi** |
| 4 | `app/(admin)/admin/dashboard/_components/marketing-hr-dashboards.tsx:50` | `enrolledTotal` | `total` |
| 5 | `app/(admin)/admin/crm/page.tsx:96` | `enrolledTotal` | `nonDuplicate` — **loại `DUPLICATE`** khỏi mẫu số |
| 6 | `lib/crm/marketing-metrics.ts:30` `crL2L3` | `convertedAt IS NOT NULL` (`funnel-query.ts:14`) | `qualifiedAt IS NOT NULL` (`:13`) |
| 7 | `lib/lead/assign-strategy.ts:15` `computeCloseRate` | `closed` | `handled` — dùng để **chia lead**, không phải báo cáo |
| 8 | `lib/reports/trial.ts:196` | `registered` | `attended` — tỷ lệ chuyển đổi **học thử** |

⇒ Năm màn hình khác nhau đang trả lời cùng một câu hỏi bằng năm con số. C3 phải chốt **một** công thức và ghi rõ nó **không bằng** năm con số kia.

### C.2.3 🔴 Ba định nghĩa "đã chốt" và bằng chứng chúng lệch trên prod

| Định nghĩa | Nơi dùng | Ghi ở đâu |
|---|---|---|
| **(a)** `status ∈ {ENROLLED, REGISTERED}` | `lib/reports/lead.ts:45` `CONVERTED_STATUSES` | — |
| **(b)** `status = ENROLLED` | `manager-dashboard.tsx:86` · `sales-dashboard.tsx:49` · `app/(admin)/admin/leads/bao-cao-chuyen/page.tsx:15` (`CLOSED_STATUSES`) | `lib/crm/convert-lead.ts:77` · `lib/crm/convert-lead-v2.ts:170` |
| **(c)** `convertedAt IS NOT NULL` | `lib/crm/funnel-query.ts:14` (mẫu số ROAS + CPA) | **chỉ** `convert-lead.ts:77` và `convert-lead-v2.ts:170` |

🔴 **Bằng chứng lệch:** `lib/finance/payment.ts:152-155` nâng lead từ `AWAITING_DECISION` → `REGISTERED` bằng `updateMany` mà **không** set `convertedAt`:

```ts
// lib/finance/payment.ts:151-155
const upd = await tx.lead.updateMany({
  where: { id: params.leadId, status: "AWAITING_DECISION", deletedAt: null },
  data: { status: "REGISTERED" },   // ← không có convertedAt
});
```

Kết quả với một lead vừa ghi nhận thanh toán nhưng chưa convert sang ghi danh: **(a) đếm 1 · (b) đếm 0 · (c) đếm 0**. Đường ghi này chạy tự động mỗi lần `ensureOrderPayment` tạo khoản (`payment.ts:135`), nên đây không phải ca hiếm.

### C.2.4 🔴 Mốc phễu SR.QD.217 gần như **không có dữ liệu**

| Trường | Đường ghi DUY NHẤT | Ai gọi đường đó? |
|---|---|---|
| `qualifiedAt` | `lib/crm/lead-qualify.ts:93` | **Chỉ** `tests/e2e/r1/lead-qualify.spec.ts:7` — **không** Server Action / route nào |
| `handedAt` · `receivedConfirmedAt` · `firstContactAt` | `lib/crm/handover.ts` | **Chỉ** `tests/e2e/r1/handover.spec.ts:11` |
| `assignedAt` | `lib/crm/handover.ts:59` (chết) · `lib/lead/intake/ingest.ts:352` (sống, **chỉ khi phiếu có mã NV**) · `app/api/admin/import/leads/registered/route.ts:508,549` (import Excel) | — |

Các đường phân công **bình thường** — `lib/lead/auto-assign.ts:168-173` và `:229-235`, `lib/lead/assign.ts:109-115`, `app/(admin)/admin/leads/actions.ts:936-944` — **KHÔNG** set `assignedAt`. Đọc trực tiếp `auto-assign.ts:167-172`:

```ts
await tx.lead.update({
  where: { id: leadId },
  data: {
    assignedToId: target,
    ...(lead.status === "NEW" ? { status: "ASSIGNED" as LeadStatus } : {}),
  },                                   // ← không có assignedAt
});
```

⇒ **Đừng dựng metric nào của C lên `qualifiedAt` / `handedAt` / `firstContactAt`.** Hệ quả kéo sang D: mẫu số CPL hiện tại (`funnel-query.ts:13`) là `qualifiedAt IS NOT NULL` — tức gần bằng 0.

### C.2.5 🔴 `Lead.lastActivityAt` — hai lỗi chồng nhau

**Lỗi 1 — 12/15 đường ghi bỏ sót.** Có **15** chỗ tạo `LeadActivity`:

```
lib/finance/payment.ts:157          lib/lead/intake/ingest.ts:203
lib/lead/assign.ts:126              lib/lead/intake/ingest.ts:230
lib/lead/assign.ts:205              lib/lead/intake/ingest.ts:380
lib/lead/auto-assign.ts:184         app/(admin)/admin/leads/actions.ts:109
lib/lead/auto-assign.ts:246         app/(admin)/admin/leads/actions.ts:183
lib/lead/dedup.ts:40                app/(admin)/admin/leads/actions.ts:209
app/(admin)/admin/trials/actions.ts:131
app/(admin)/admin/leads/actions.ts:333   app/(admin)/admin/leads/actions.ts:946
```

Nhưng chỉ **3** chỗ bump `lastActivityAt`: `app/(admin)/admin/leads/actions.ts:346`, `:395`, `:431`.

**Lỗi 2 — truyền nhầm trường, ĐÃ XÁC MINH.** `lib/crm/sla.ts:117` select **đúng** cả `updatedAt` lẫn `lastActivityAt`, `:156` dùng **đúng** `lead.lastActivityAt` cho `isLeadIdle`, nhưng `:132` truyền nhầm:

```ts
// lib/crm/sla.ts:126-133
const rules = evaluateSla({
  qualifiedAt: lead.qualifiedAt,
  handedAt: lead.handedAt,
  receivedConfirmedAt: lead.receivedConfirmedAt,
  assignedAt: lead.assignedAt,
  firstContactAt: lead.firstContactAt,
  lastActivityAt: lead.updatedAt,     // ← SAI: phải là lead.lastActivityAt
}, now, thresholds);
```

`Lead.updatedAt` là `@updatedAt` (`prisma/schema.prisma:1373`) ⇒ **mọi** lần chạm bản ghi đều reset. Rule `SLA-4` ("Lead im lặng > 2 ngày", `lib/crm/sla.ts:44,80`) vì thế **không bao giờ nổ** cho lead có bất kỳ thao tác hệ thống nào.

⇒ **Điều kiện cần của C5**: nếu C5 đọc `lastActivityAt` mà chưa vá, cột "số ngày chưa tiếp cận lại" sẽ hiển thị số nhỏ giả tạo — đúng thứ QLCS dùng để soi lead treo.

### C.2.6 Đường tính "giá trị lead" hôm nay

```
Lead (:1309)
  └── Order.leadId String?   (:3687, relation :3688, @@index :3758)  ← CHỈ có leadId
        └── Payment.orderId  (:5689)
              └── Payment.enrollmentId String?  (:5691, SetNull)  ← nullable
                    └── Enrollment.leadChildId String?  (:1833, SetNull) ← nullable
```

`Order` **KHÔNG có `leadChildId`** — model `Order` (`prisma/schema.prisma:3668-3762`) có `studentId` `:3685`, `leadId` `:3687`, `centerId` `:3690`; các `@@index` `:3755-3762` cũng không có. `Enrollment` **không có** `leadId`, chỉ nối gián tiếp qua `Enrollment.leadChildId → LeadChild.leadId`.

⇒ **C-03 cột "giá trị" phụ thuộc quyết định OQ-G1 của `docs/prd/G-lead.md`** (chọn `Order.leadChildId` hay bảng phân bổ). PRD C **không** mở lại câu hỏi đó; C chỉ ghi ràng buộc: cột "giá trị" của C-03 lấy **thực thu** (CHUNG-1), không lấy `Order.totalAmount`, không lấy `LeadChild.contractValue`.

### C.2.7 Audit lead — đã hợp nhất, đừng làm lại

`LeadAuditLog` (`prisma/schema.prisma:3445`) **đã đóng băng từ 09/07/2026**: `lib/audit/legacy-log.ts:1-4` ghi rõ *"ĐỌC 5 bảng audit cũ (chỉ đọc, không bao giờ ghi)"*. Ghi mới đi vào `AuditLog` hợp nhất qua `writeAudit(...)` — `lib/audit/log.ts:141-155`:

```ts
// lib/audit/log.ts:140-155 (rút gọn)
await writeAudit({
  actor: { id: params.actorId, name: params.actorName },
  module: "leads",
  entityType: "Lead",
  entityId: params.leadId,
  action: `lead.${params.action.toLowerCase()}`,   // "lead.status_change", "lead.assign", ...
  oldValues, newValues, changedFields, reason,
  orgUnitId: await resolveOrgUnitId(client, "lead", params.leadId),
  ip, userAgent, tx,
});
```

⇒ **C-07 không cần cơ chế audit mới.** Việc phải làm là **UI**: `app/(admin)/admin/leads/[id]/page.tsx` hiện chỉ đọc `activities` (`:54`), grep `auditLog` trên file này = 0 kết quả.

### C.2.8 Mục tiêu lead theo tháng — CHƯA CÓ model

`RevenueTarget` (`prisma/schema.prisma:6022`) là mục tiêu **tiền**. Không có model nào cho mục tiêu **số lead** — grep `LeadTarget` / `leadGoal` / `targetCount` trên `prisma/schema.prisma` = 0 kết quả. ⇒ C-01/C2 phải tạo bảng mới.

---

## C.3 Objectives · Non-Goals · Success Metrics

### Goals

1. Một con số "tổng lead" duy nhất, đếm theo **học sinh**, lọc được theo cơ sở + khoảng ngày.
2. Một định nghĩa "đã chốt" duy nhất, viết ra thành văn, dùng chung cho C3 · C4 · C-03 · D3.
3. "Thời gian chốt" đo được, và đo bằng **trung vị + p90**, không chỉ trung bình.
4. QLCS soi được lead treo: cột "số ngày chưa tiếp cận lại" trên **cả ba** bảng (đang chăm · đã chuyển đổi · rớt), có cảnh báo vượt ngưỡng.
5. Lead rớt luôn có lý do phân loại được; đổi trạng thái luôn để lại vết đọc được trên trang chi tiết lead.

### Non-Goals (cố ý không làm trong C)

1. **Không** sửa 8 công thức tỷ lệ chốt cũ ở §C.2.2 — chỉ **thêm** một công thức chuẩn cho tab C và ghi rõ nó khác. Sửa 5 màn cũ là việc riêng, có rủi ro riêng.
2. **Không** viết migration schema lead — thuộc `docs/prd/G-lead.md` (SL-08 → SL-13). C chỉ **tiêu thụ**.
3. **Không** đổi cơ chế/quyền export — thuộc A-03 (`docs/prd/A-nen-tang.md` §6.3). C-04 chỉ tham chiếu.
4. **Không** drop giá trị nào của `LeadStatus` (15 giá trị, `prisma/schema.prisma:37-55`) — SL-14 + luật cứng #4.
5. **Không** viết cron/trigger tự đồng bộ `LeadChild.status` ↔ `Lead.status` — `docs/prd/G-lead.md` §6.5 đã chốt: suy diễn trạng thái là việc của **resolver lúc đọc**.
6. **Không** làm tab E (tương tác KH) — khác khu vực.

### Success Metrics

| Chỉ số | Hiện tại | Đích | Cách đo |
|---|---|---|---|
| Số công thức "tỷ lệ chốt" trong tab dashboard | 5 màn / 5 công thức | **1** | Đọc mã: chỉ `lib/reports/lead-kpi.ts` (mới) được gọi từ tab C |
| Chênh lệch (a) vs (b) vs (c) trên prod | Chưa đo | Đo được, công bố | Chạy truy vấn §C.6.9 trên prod trước khi chốt |
| "Thời gian chốt" | Không tính được | Có trung vị + p90 | C4 trả `medianDays`, `p90Days`, `avgDays` |
| `lastActivityAt` phản ánh đủ hoạt động | 3/15 đường ghi | 15/15 | Test: mỗi đường tạo `LeadActivity` → `lastActivityAt` bump |
| `SLA-4` nổ được | Không bao giờ (`sla.ts:132`) | Nổ đúng | Unit test `runSlaCheck` với lead `updatedAt` mới nhưng `lastActivityAt` cũ |
| Lead rớt có lý do | 0% (không có cột) | 100% lead rớt mới | `SELECT count(*) FROM "LeadChild" WHERE status='LOST' AND "lostReasonId" IS NULL` = 0 với bản ghi sau ngày bật |
| Lịch sử đổi trạng thái nhìn thấy được | Ghi `AuditLog`, UI không hiện | Hiện trên trang chi tiết | e2e: đổi trạng thái → mục "Lịch sử trạng thái" hiện cũ → mới + người + giờ |
| Cách ly cơ sở của số liệu C | `LeadChild` không có cột để lọc | `scopedDb` chặn được | e2e: actor CS1 xem tab C → 0 dòng của CS2 |

---

## C.4 Target Users & Segments

| Vai | Cần gì từ tab C | Ràng buộc |
|---|---|---|
| **QLCS (`CENTER_MANAGER`)** — người dùng chính | Soi lead treo (C-05 + cột ngày trên bảng đang chăm), tỷ lệ thành công của cơ sở mình, so với mục tiêu | Đa cơ sở (A-01) ⇒ **mọi** truy vấn nhận `centerIds[]`, không phải `centerId` đơn |
| **Sale (`SALES_CSM`)** | Bảng lead đã chuyển đổi của mình; đánh dấu rớt kèm lý do (C-06) | `actorMayMutateLead` (`app/(admin)/admin/leads/actions.ts:50-56`): chủ lead **hoặc** `leads:view-all` |
| **BGĐ / Chủ dự án** | Tỷ lệ đạt mục tiêu, thời gian chốt trung bình — để so cơ sở | Số phải khớp sổ tiền của tab B (CHUNG-1) |
| **Marketing (`MARKETING` / `HO_MARKETING`)** | Tổng lead + lead chốt làm mẫu số CPL/CPA của tab D | ⚠️ Vai này **không** có `leads:view-pii` mặc định ở v1 matrix? — **CÓ**: `lib/lead/pii.ts:5-6` ghi MARKETING đã được mở 21/07. Nhưng cột PII trong bảng C-03/C-05 **vẫn** phải qua `maskLeadPiiFields` ở **server** (`lib/lead/pii.ts:42-51`) |
| **Kế toán** | Cột "giá trị" và "% trên tổng doanh thu" của C-03 phải khớp `Payment` | CHUNG-1 |

---

## C.5 User Stories & Requirements

### P0 — Must Have

| # | User story | Acceptance criteria |
|---|---|---|
| **C-02-1** | Là QLCS, tôi thấy **Tổng lead** của phạm vi đang chọn, đếm theo **học sinh**. | Truy vấn §C.6.1. Đếm `LeadChild`, không đếm `Lead`. Nhận `centerIds[] + dateFrom + dateTo`. Actor CS1 không thấy con số của CS2 (e2e). |
| **C-02-2** | Là QLCS, tôi thấy **Tỷ lệ đạt mục tiêu** lead của tháng. | Truy vấn §C.6.2. Cần bảng `LeadTarget` (§C.6.10). Chưa đặt mục tiêu → hiện **"Chưa đặt mục tiêu"**, **KHÔNG** hiện `0%` (0% và "chưa đặt" là hai chuyện khác nhau — `computeAchievement` `lib/reports/revenue-target.ts:32-39` đã có tiền lệ trả `null`). |
| **C-02-3** | 🔴 Là QLCS, tôi thấy **Tỷ lệ thành công (chốt/tổng)** theo **một** định nghĩa duy nhất. | Truy vấn §C.6.3. Định nghĩa "đã chốt" chốt ở §C.6.0 và ghi thành hằng số **một chỗ**. Tooltip trên ô số ghi rõ mẫu số là **cohort** (lead vào hệ thống trong kỳ), không phải "chốt trong kỳ". |
| **C-03-1** | Là QLCS, tôi xem bảng **Lead đã chuyển đổi** đủ 9 cột spec đòi. | Bảng §C.6.7 — mỗi cột chỉ rõ nguồn. **Đếm theo học sinh**: một PH hai con chốt cả hai ⇒ **2 dòng**. Tên KH link sang `/admin/leads/<leadId>`. |
| **C-04-1** | 🔴 Là QLCS, tôi biết **thời gian chốt trung bình**. | Truy vấn §C.6.4. Trả **avg + median + p90**, đơn vị **ngày** (1 chữ số thập phân). Loại bản ghi `closedAt < createdAt` khỏi phép tính và **đếm riêng** (dữ liệu bẩn, không im lặng bỏ). |
| **C-05-1** | Là QLCS, tôi xem bảng **Lead rớt** với cột "số ngày chưa tiếp cận lại". | Truy vấn §C.6.5. Nguồn đồng hồ chốt ở §C.6.5 (từ `LeadActivity`, **không** từ `lastActivityAt` cho tới khi N-4 được vá). |
| **C-05-2** | 🔴 Là QLCS, tôi thấy cột "số ngày chưa tiếp cận lại" **trên cả bảng lead đang chăm**, có cảnh báo khi vượt ngưỡng. | Yêu cầu vận hành spec `:54`. Ngưỡng để ở **Cấu hình vận hành** — thêm key vào `lib/settings/registry.ts` group `"crm"` (§C.6.11), **không** hardcode. Vượt ngưỡng → badge cảnh báo trên dòng. |
| **C-06-1** | 🔴 Là Sale, khi đánh dấu **Rớt** tôi **bắt buộc** chọn lý do. | Server Action từ chối nếu thiếu `lostReasonId`. Lý do lấy từ bảng danh mục `LeadLostReason` (`docs/prd/G-lead.md` §6.6), **không** phải enum Postgres. Ghi chú tự do là **tuỳ chọn**. ⚠️ `updateLeadStatus` hiện có chữ ký `(leadId, rawStatus)` (`app/(admin)/admin/leads/actions.ts:127-130`) — **phải đổi chữ ký**, không nhét lý do vào `note`. |
| **C-06-2** | Là Sale, tôi đánh dấu rớt **cho từng con**, không cho cả phụ huynh. | `LeadChild.status = LOST` + `lostReasonId` + `lostNote` + `lostAt` (SL-09/SL-10 — xem OQ-C3 về mâu thuẫn tầng với `A-nen-tang.md`). `Lead.status` **không** tự đổi (`docs/prd/G-lead.md` §6.5). |
| **C-07-1** | 🔴 Là QLCS, trên trang chi tiết lead tôi thấy **ai đổi trạng thái, lúc nào, từ trạng thái nào**. | Truy vấn §C.6.6 đọc `AuditLog` (`module='leads'`, `entityType='Lead'`, `entityId=<leadId>`, `action='lead.status_change'`). **Không** tạo bảng audit mới — `LeadAuditLog` đã đóng băng (`lib/audit/legacy-log.ts:1-4`). Việc là **UI**: `app/(admin)/admin/leads/[id]/page.tsx` hiện chỉ đọc `activities` (`:54`). |
| **C-00-1** | 🔴 Là dev, tôi có **một** hằng số định nghĩa "đã chốt". | `lib/reports/lead-kpi.ts` export `CLOSED_CHILD_STATUSES` + `isChildClosed()`. Tab C, D2/D3 và C-03 **chỉ** dùng hàm này. Có unit test khẳng định nó **khác** `CONVERTED_STATUSES` (`lib/reports/lead.ts:45`) — để người sau không tưởng hai thứ là một. |

### P1 — Should Have

| # | User story | Acceptance criteria |
|---|---|---|
| **C-05-3** | 🔴 Là QLCS, đồng hồ "chưa tiếp cận lại" phải đúng ngay cả khi bảng đông. | Vá N-4 (`docs/prd/G-lead.md` G-06-8): gom ghi `LeadActivity` + bump `lastActivityAt` vào **một** helper, dùng ở đủ **15** call-site; backfill `lastActivityAt = MAX(LeadActivity.createdAt)`. Sau đó C5 chuyển sang đọc cột denormalize (§C.6.5 biến thể B) — nhanh hơn nhiều. |
| **C-05-4** | 🔴 Là QLCS, cảnh báo `SLA-4` phải nổ. | Vá `lib/crm/sla.ts:132` `lead.updatedAt` → `lead.lastActivityAt`. Unit test: lead có `updatedAt = now`, `lastActivityAt = 3 ngày trước` → `evaluateSla` trả `["SLA-4"]`. |
| **C-01-1** | Là QLCS, tôi đặt **mục tiêu lead theo tháng cho từng cơ sở**. | Bảng `LeadTarget` §C.6.10. Màn đặt mục tiêu tái dùng khuôn `RevenueTargetForm` + `setRevenueTargetAction` (`app/(admin)/admin/bao-cao/doanh-thu/_actions.ts:40-101`), **kể cả nhánh xử lý `centerId = null`** (Postgres coi `NULL` là DISTINCT trong unique index ⇒ upsert không match, phải `findFirst` + create/update tay — `_actions.ts:72-87`). |
| **C-03-2** | Là QLCS, tôi thấy cột **% trên tổng doanh thu**. | Mẫu số = **tổng thực thu của cùng phạm vi + cùng kỳ** (B1). Không phải tổng doanh thu toàn hệ thống. Nếu B1 = 0 → hiện `—`, không chia. |
| **C-04-2** | Là QLCS, tôi so thời gian chốt **giữa các cơ sở**. | Cùng truy vấn C4, thêm `GROUP BY centerId`. |
| **C-06-3** | Là admin, tôi thêm/sửa/ẩn **lý do rớt** không cần deploy. | `LeadLostReason(code, label, isActive, displayOrder)` — `docs/prd/G-lead.md` §6.6. Ẩn bằng `isActive = false`, **không xoá cứng** (xoá = mất lý do rớt lịch sử, tức mất chính thứ C-05 cần). |

### P2 — Nice to Have / Future

| # | User story | Acceptance criteria |
|---|---|---|
| **C-03-3** | Xuất Excel bảng C-03 (C-04 trong spec). | **Thuộc A-03.** C chỉ ràng buộc: file xuất dùng **bộ cột cố định**, không theo tuỳ chọn cột của người xuất (nếu không hai người xuất ra hai file khác nhau — `docs/prd/G-lead.md` OQ-G12). |
| **C-02-4** | Biểu đồ tỷ lệ thành công theo tuần. | Tái dùng `groupByWeek` (`lib/reports/lead.ts:210-231`) — nhưng **phải viết lại** cho đơn vị học sinh; hàm hiện nhận `LeadReportRecord` cấp lead. |
| **C-05-5** | Cảnh báo lead treo bắn vào hệ thống thông báo. | Tái dùng `notifyStaff` + `dedupeKey` như `runSlaCheck` (`lib/crm/sla.ts:139-152`). **Chỉ làm sau khi C-05-3 + C-05-4 xong** — bắn chuông trên đồng hồ sai là làm hỏng niềm tin vào cả hệ thống cảnh báo. |
| **C-07-2** | Xem lịch sử chuyển sale hợp nhất. | `docs/prd/G-lead.md` OQ-G10 — 3 bảng, 3 đường ghi, không bảng nào phủ hết. Ngoài phạm vi C. |

---

## C.6 Solution Overview — truy vấn tham chiếu cho từng metric

### C.6.0 🔴 Chốt định nghĩa "đã chốt" — một chỗ, dùng cho C3 · C4 · C-03 · D3

**Quyết định:** *"Đã chốt" = một **học sinh** (`LeadChild`) có `status = 'ENROLLED'` **và** `closedAt IS NOT NULL`.*

```ts
// lib/reports/lead-kpi.ts — THÊM MỚI. Nguồn sự thật DUY NHẤT cho tab C + D2/D3.
// KHÔNG tái dùng CONVERTED_STATUSES (lib/reports/lead.ts:45) — tập đó là ENROLLED+REGISTERED
// ở CẤP LEAD (phụ huynh), khác đơn vị đếm và khác nghĩa. Xem test khẳng định ở cuối file.
import type { LeadChildStatus } from "@prisma/client"; // enum MỚI — docs/prd/G-lead.md §6.5

/** Trạng thái con được coi là ĐÃ CHỐT. Một giá trị — cố ý không mở rộng. */
export const CLOSED_CHILD_STATUSES = ["ENROLLED"] as const satisfies readonly LeadChildStatus[];

/** Trạng thái con được coi là RỚT. */
export const LOST_CHILD_STATUSES = ["LOST"] as const satisfies readonly LeadChildStatus[];

export function isChildClosed(c: { status: LeadChildStatus; closedAt: Date | null }): boolean {
  return (CLOSED_CHILD_STATUSES as readonly string[]).includes(c.status) && c.closedAt != null;
}
```

| Vì sao chọn thế này | Bằng chứng |
|---|---|
| **Đơn vị là học sinh**, không phải phụ huynh | CHUNG-2 · spec `:188` (*"C-03 đếm theo học sinh chốt, không theo lead"*) |
| **Bắt buộc `closedAt IS NOT NULL`** vì C4 phải trừ được `closedAt − createdAt`. Nếu chấp nhận `status='ENROLLED'` mà `closedAt` null thì C3 và C4 sẽ đếm hai tập khác nhau — đúng bệnh đang có ở cấp lead (§C.2.3) | `lib/reports/lead.ts:12` khai `convertedAt` rồi không dùng — chính là ca này ở quy mô nhỏ |
| **Không** lấy `REGISTERED` (đã trả tiền nhưng chưa ghi danh) vào tử số | `LeadChildStatus` (`docs/prd/G-lead.md` §6.5) chỉ có 6 giá trị, **không có** `REGISTERED`. Nếu vận hành muốn đếm "đã trả tiền" là chốt thì phải thêm giá trị vào enum trước — xem **OQ-C1** |

**Điều kiện bắt buộc đi kèm — không có thì định nghĩa này cũng sai:**

1. Phải có **một** đường ghi set `LeadChild.status = 'ENROLLED'` **và** `closedAt = now()` **trong cùng transaction**. Hai đường convert hiện tại (`lib/crm/convert-lead.ts:77`, `lib/crm/convert-lead-v2.ts:170`) đang set ở **cấp `Lead`**, không cấp con.
2. Đường thanh toán `lib/finance/payment.ts:152-155` **không** được phép đưa con lên `ENROLLED` — nó chỉ đưa `Lead.status` lên `REGISTERED`. Giữ nguyên hành vi đó, và **ghi vào tài liệu** rằng `Lead.status = 'REGISTERED'` **không** tính vào C3.
3. Test đỏ trước (luật cứng Nền Hệ thống #5): "lead 1 PH – 2 con, con A convert, con B chưa → C1 = 2, C3 tử số = 1".

---

### C.6.1 — **C1 · Tổng lead**

**Định nghĩa bằng lời.** Số **học sinh** (`lead_student`) mới vào hệ thống trong khoảng ngày đang chọn, thuộc các cơ sở đang chọn. Đây là **số đếm**, không phải tỷ lệ. Học sinh thứ hai của một phụ huynh cũ, thêm vào tháng này, tính là **một lead mới của tháng này**.

**Nguồn dữ liệu.**

| Thứ | Bảng · cột | Ghi chú |
|---|---|---|
| Đơn vị đếm | `LeadChild.id` (`prisma/schema.prisma:1462`) | CHUNG-2 |
| Trục ngày | `LeadChild.createdAt` (`:1475`) | **KHÔNG** dùng `Lead.createdAt` — con thứ hai thêm sau phải rơi vào kỳ nó được thêm |
| Cơ sở | `LeadChild.centerId` **sau SL-08**; **trước SL-08** phải join `Lead.centerId` (`:1316`) | `LeadChild` hôm nay **không có cột phạm vi nào** (`:1461-1483`) |
| Loại bỏ | `Lead.deletedAt IS NULL` (`:1371`) | `LeadChild` **không có** `deletedAt` — xoá theo cha bằng `onDelete: Cascade` (`:1463`) |

**Truy vấn SQL (PostgreSQL) — bản dùng được NGAY (trước SL-08), scope qua `Lead` cha:**

```sql
-- C1 · Tổng lead = số HỌC SINH vào hệ thống trong kỳ.
-- $1 = centerIds text[]  (NULL = toàn bộ phạm vi actor — caller đã giải quyết IDOR)
-- $2 = dateFrom timestamptz (đã neo 00:00 giờ VN)
-- $3 = dateTo   timestamptz (00:00 ngày kế — khoảng NỬA MỞ, xem CHUNG-3)
SELECT count(*)::int AS total_leads
FROM "LeadChild" lc
JOIN "Lead" l ON l.id = lc."leadId"
WHERE l."deletedAt" IS NULL                       -- LeadChild không có deletedAt riêng
  AND lc."createdAt" >= $2
  AND lc."createdAt" <  $3                        -- nửa mở: không dùng <= với .999
  AND (
        $1::text[] IS NULL                         -- NULL = không giới hạn cơ sở
     OR l."centerId" = ANY($1)                     -- lead chưa gán cơ sở (NULL) KHÔNG khớp ANY
  );
```

**Truy vấn SQL — bản đích (sau SL-08, `LeadChild` mang `centerId`):**

```sql
SELECT count(*)::int AS total_leads
FROM "LeadChild" lc
JOIN "Lead" l ON l.id = lc."leadId"
WHERE l."deletedAt" IS NULL
  AND lc."createdAt" >= $2 AND lc."createdAt" < $3
  AND ($1::text[] IS NULL OR lc."centerId" = ANY($1));
```

**Truy vấn Prisma tương đương.**

```ts
// LeadChild CHƯA nằm trong SCOPED_MODELS (lib/db-scope.ts:11-49) ⇒ scopedDb KHÔNG
// auto-scope nó. Trước SL-08 phải scope TAY qua Lead cha; sau SL-08 thì khai
// "LeadChild" vào SCOPED_MODELS + BACKFILL_SPECS + getModelPrefixes (docs/prd/G-lead.md §6.7)
// và dòng `lead: { ... }` bên dưới rút gọn được.
import { scopedDb, getModelVisibleCenterIds } from "@/lib/db-scope";

export async function countLeadStudents(actor: Actor, f: ScopeFilters): Promise<number> {
  const sdb = scopedDb(actor);

  // Phạm vi HIỆU LỰC = giao của (bộ lọc người dùng chọn) ∩ (tầm nhìn actor).
  // getModelVisibleCenterIds trả "ALL" | string[] (lib/db-scope.ts:222).
  const visible = getModelVisibleCenterIds("Lead", actor);
  const effective =
    f.centerIds === null
      ? (visible === "ALL" ? null : visible)
      : (visible === "ALL" ? f.centerIds : f.centerIds.filter((c) => visible.includes(c)));

  return sdb.leadChild.count({
    where: {
      createdAt: { gte: f.dateFrom, lt: f.dateTo },
      lead: {
        deletedAt: null,
        ...(effective ? { centerId: { in: effective } } : {}),
      },
    },
  });
}
```

**Giả định.**

| # | Giả định | Nếu sai thì sao |
|---|---|---|
| G1 | Mỗi học sinh quan tâm = **một** `LeadChild`. Không có bản ghi trùng cho cùng đứa trẻ | Đếm phồng. Repo có `LeadDuplicate` (`:3560`) nhưng chỉ ghi ở **một** chỗ: `lib/lead/dedup.ts:37` (đường công khai); đường nhập tay ở admin **không ghi** và còn so khớp chuỗi đúng-bằng (`app/(admin)/admin/leads/actions.ts:596`, `:731`) ⇒ nhập `0905…` khi đã có `84905…` **tạo lead trùng** (nợ N-3, `docs/prd/G-lead.md` §2.2) |
| G2 | `LeadChild.createdAt` phản ánh đúng lúc học sinh vào hệ thống | Với dữ liệu migrate từ `Lead.childName` (G-05), `createdAt` sẽ là **ngày chạy migration**, không phải ngày lead vào. Kế hoạch migration phải chép `Lead.createdAt` xuống — nếu không, C1 của mọi tháng cũ = 0 và tháng migrate = tất cả |
| G3 | `Lead.centerId` không NULL | Lead chưa gán cơ sở **rơi khỏi mọi bộ lọc có `centerIds`** — kể cả bộ lọc "tất cả cơ sở của tôi". Với QLCS đó là đúng; với BGĐ xem toàn hệ thống thì `f.centerIds = null` mới thấy đủ |

**Bẫy.**

| # | Bẫy | Xử lý |
|---|---|---|
| B1 | 🔴 **`LeadChild` không có cột phạm vi** ⇒ trước SL-08, bản ghi con của CS2 hoàn toàn đọc được bởi actor CS1 nếu ai đó quên join `Lead` | Không viết truy vấn `LeadChild` trần ở bất kỳ đâu. Sau SL-08: khai vào **cả ba** nơi (`SCOPED_MODELS` `lib/db-scope.ts:11` · `BACKFILL_SPECS` `lib/org/center-bridge.ts:45` · `getModelPrefixes` `lib/db-scope.ts:135-140`) — thiếu chỗ thứ hai thì test `[US-07-IT-08b]` đỏ |
| B2 | **Hiệu năng:** `LeadChild` chỉ có `@@index([leadId])` (`prisma/schema.prisma:1482`). Lọc theo `createdAt` = seq scan | Thêm `@@index([centerId, createdAt])` cùng lúc với SL-08. Additive, an toàn |
| B3 | `centerId = ANY(NULL::text[])` trả **NULL**, không phải TRUE | Đã xử: `$1::text[] IS NULL OR …` |
| B4 | 🔴 `db.$queryRaw` **bỏ qua** `scopedDb` — extension chỉ chạy cho query top-level của Prisma Client (`lib/db-scope.ts:4-5`) | Mọi truy vấn SQL thô **phải** tự truyền `effective` đã giao với `getModelVisibleCenterIds`, y như đoạn Prisma ở trên. Và **cấm `$queryRawUnsafe`** (`.claude/rules/prisma-db.md` mục Banned) |
| B5 | Lead `status = 'DUPLICATE'` (`prisma/schema.prisma:37-55`) vẫn được đếm | **Quyết định:** đếm. Lý do: `DUPLICATE` gán bằng tay, gần như không ai gán (§C.2.3 — 9/15 giá trị chỉ đổi tay). Loại nó ra sẽ tạo mẫu số thứ 6 (`app/(admin)/admin/crm/page.tsx:96` đã loại). Nếu vận hành muốn loại → **OQ-C2** |

---

### C.6.2 — **C2 · Tỷ lệ đạt mục tiêu lead**

**Định nghĩa bằng lời.** Phần trăm giữa **số học sinh thực tế vào hệ thống trong kỳ** (tử số = C1) và **chỉ tiêu số học sinh đã đặt cho kỳ + cơ sở đó** (mẫu số). Chưa đặt chỉ tiêu ⇒ **không có tỷ lệ** (`null`), **không** phải `0%`.

**Nguồn dữ liệu.**

| Thứ | Bảng · cột |
|---|---|
| Tử số | C1 (§C.6.1) |
| Mẫu số | `LeadTarget.targetCount` — **BẢNG MỚI**, §C.6.10 |
| Trục kỳ | `LeadTarget.period` dạng `"YYYY-MM"` — cùng quy ước `RevenueTarget.period` (`prisma/schema.prisma:6030`) và `monthKeyVN` (`lib/reports/lead.ts:87-90`) |

**Truy vấn SQL.**

```sql
-- C2 · Tỷ lệ đạt mục tiêu lead, tách theo từng KỲ (tháng VN) trong range.
-- Trả cả kỳ CÓ mục tiêu mà 0 lead, và kỳ CÓ lead mà chưa đặt mục tiêu (FULL JOIN).
WITH actual AS (
  SELECT
    -- Gom theo tháng GIỜ VN. AT TIME ZONE trên timestamptz -> timestamp giờ VN.
    to_char(lc."createdAt" AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM') AS period,
    count(*)::int AS actual_count
  FROM "LeadChild" lc
  JOIN "Lead" l ON l.id = lc."leadId"
  WHERE l."deletedAt" IS NULL
    AND lc."createdAt" >= $2 AND lc."createdAt" < $3
    AND ($1::text[] IS NULL OR l."centerId" = ANY($1))
  GROUP BY 1
),
target AS (
  SELECT t."period", sum(t."targetCount")::int AS target_count
  FROM "LeadTarget" t
  WHERE t."period" >= to_char($2 AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM')
    AND t."period" <= to_char(($3 - interval '1 microsecond') AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM')
    AND (
      CASE
        -- Xem TOÀN HỆ THỐNG: chỉ lấy dòng mục tiêu toàn hệ thống (centerId IS NULL).
        WHEN $1::text[] IS NULL THEN t."centerId" IS NULL
        -- Xem N cơ sở: CỘNG mục tiêu của đúng N cơ sở đó. KHÔNG cộng thêm dòng
        -- centerId IS NULL (nếu không sẽ đếm đôi mục tiêu công ty + mục tiêu cơ sở).
        ELSE t."centerId" = ANY($1)
      END
    )
  GROUP BY t."period"
)
SELECT
  COALESCE(a.period, g.period)                       AS period,
  COALESCE(a.actual_count, 0)                        AS actual_count,
  g.target_count                                     AS target_count,   -- NULL = chưa đặt
  CASE
    WHEN g.target_count IS NULL OR g.target_count = 0 THEN NULL          -- không chia
    ELSE round(COALESCE(a.actual_count, 0)::numeric / g.target_count, 4)
  END                                                AS achieved_rate
FROM actual a
FULL OUTER JOIN target g ON g.period = a.period
ORDER BY 1;
```

**Truy vấn Prisma tương đương.**

```ts
// Giữ đúng khuôn buildRevenueTargetReport (lib/reports/revenue-target.ts:52-74):
// tầng query CHỈ fetch, ghép + chia ở HÀM THUẦN → unit test không cần Postgres.
import { monthKeyVN } from "@/lib/reports/lead";
import { computeAchievement } from "@/lib/reports/revenue-target"; // :32-39, đã trả null an toàn

export async function getLeadTargetRows(actor: Actor, f: ScopeFilters) {
  const sdb = scopedDb(actor);
  const effective = effectiveCenterIds(actor, f); // như §C.6.1

  const [children, targets] = await Promise.all([
    sdb.leadChild.findMany({
      where: {
        createdAt: { gte: f.dateFrom, lt: f.dateTo },
        lead: { deletedAt: null, ...(effective ? { centerId: { in: effective } } : {}) },
      },
      select: { createdAt: true },
      take: 50_000, // trần cứng như payment ở doanh-thu/page.tsx:73
    }),
    // LeadTarget: khai vào SCOPE_EXEMPT (cùng lý do RevenueTarget — lib/db-scope.ts:84-86)
    // ⇒ scopedDb là pass-through, PHẢI tự lọc centerId.
    sdb.leadTarget.findMany({
      where: effective ? { centerId: { in: effective } } : { centerId: null },
      select: { centerId: true, period: true, targetCount: true },
    }),
  ]);

  const actualByPeriod = new Map<string, number>();
  for (const c of children) {
    const k = monthKeyVN(c.createdAt);
    actualByPeriod.set(k, (actualByPeriod.get(k) ?? 0) + 1);
  }
  const targetByPeriod = new Map<string, number>();
  for (const t of targets) {
    targetByPeriod.set(t.period, (targetByPeriod.get(t.period) ?? 0) + t.targetCount);
  }

  const periods = new Set([...actualByPeriod.keys(), ...targetByPeriod.keys()]);
  return [...periods].sort().map((period) => {
    const actual = actualByPeriod.get(period) ?? 0;
    const target = targetByPeriod.has(period) ? targetByPeriod.get(period)! : null;
    return { period, actual, target, ...computeAchievement(actual, target) };
  });
}
```

**Giả định.**

- Mục tiêu đặt theo **tháng**, không theo tuần/quý (spec `:41` C-01 nói "theo tháng").
- Range người dùng chọn có thể **cắt giữa tháng**. Khi đó tử số là **một phần** tháng nhưng mẫu số là **cả** tháng ⇒ tỷ lệ thấp giả. Xem bẫy B2.

**Bẫy.**

| # | Bẫy | Xử lý |
|---|---|---|
| B1 | 🔴 **Đếm đôi mục tiêu.** `RevenueTarget` có `@@unique([centerId, period])` với `centerId` nullable (`prisma/schema.prisma:6037`) và Postgres coi `NULL` là DISTINCT — nên **cùng lúc tồn tại** "mục tiêu toàn hệ thống tháng 8" và "mục tiêu CS1 tháng 8". `LeadTarget` sẽ y hệt. Cộng cả hai = đếm đôi | Nhánh `CASE` trong SQL ở trên: xem toàn hệ thống → **chỉ** dòng `centerId IS NULL`; xem N cơ sở → **chỉ** dòng của N cơ sở đó. **Không bao giờ trộn** |
| B2 | 🔴 **Range cắt giữa tháng.** Bộ lọc mặc định của A-02 là "01 → hôm nay" (`A-nen-tang.md` §6.2) ⇒ ngày 05 hằng tháng tỷ lệ luôn ~15% và trông như thảm hoạ | Hiện thêm **tỷ lệ theo tiến độ**: `achieved_rate / (số ngày đã qua / số ngày trong tháng)`, nhãn "so với tiến độ tháng". Và ghi rõ trên tooltip mẫu số là mục tiêu **cả tháng** |
| B3 | Chưa đặt mục tiêu mà hiện `0%` | SQL trả `NULL`; UI hiện chữ **"Chưa đặt mục tiêu"**. Đây là lý do `computeAchievement` (`lib/reports/revenue-target.ts:32-39`) trả `achievedRate: null` — dùng lại nguyên hàm đó |
| B4 | `LeadTarget` bị auto-scope làm biến mất dòng `centerId = NULL` | Khai vào `SCOPE_EXEMPT` (`lib/db-scope.ts:84-86` — `RevenueTarget` đã có tiền lệ, kèm chú thích lý do). **Đừng** khai vào `SCOPED_MODELS`: `injectScope` chèn `centerId: { in: [...] }` trần (`lib/db-scope.ts:277-279`) và dòng mục tiêu toàn hệ thống sẽ tàng hình |
| B5 | Chỉ số cần thêm | `LeadTarget`: `@@unique([centerId, period])` + `@@index([period])` |

---

### C.6.3 — **C3 · Tỷ lệ thành công (chốt / tổng)**

**Định nghĩa bằng lời.** Trong số **học sinh vào hệ thống trong kỳ** (mẫu số = C1), bao nhiêu phần trăm **đã chốt** (tử số) — "đã chốt" theo đúng §C.6.0. Đây là tỷ lệ **theo lứa (cohort)**: mẫu số neo vào ngày *vào hệ thống*, tử số **không** giới hạn ngày chốt.

> **Vì sao chọn cohort, không chọn "chốt trong kỳ / vào trong kỳ".** Hai vế của phép chia phải nói về **cùng một tập người**. Công thức "số chốt trong tháng 8 ÷ số lead vào tháng 8" trộn hai tập khác nhau (chốt tháng 8 phần lớn là lead vào tháng 6–7) và có thể **vượt 100%**. Đổi lại, cohort có nhược điểm phải nói ra: **tỷ lệ của tháng gần nhất luôn thấp** vì lứa đó chưa kịp chín (bẫy B1).

**Nguồn dữ liệu.**

| Thứ | Bảng · cột |
|---|---|
| Mẫu số | `LeadChild` — như C1 |
| Tử số | `LeadChild.status` (SL-09, enum `LeadChildStatus`) + `LeadChild.closedAt` (SL-09) |
| Trục ngày | `LeadChild.createdAt` (**cả hai vế**) |

**Truy vấn SQL.**

```sql
-- C3 · Tỷ lệ thành công theo LỨA: mẫu số neo createdAt, tử số KHÔNG neo closedAt.
SELECT
  count(*)::int                                                        AS total_leads,
  count(*) FILTER (
    WHERE lc."status" = 'ENROLLED' AND lc."closedAt" IS NOT NULL        -- §C.6.0
  )::int                                                                AS closed_leads,
  count(*) FILTER (WHERE lc."status" = 'LOST')::int                      AS lost_leads,
  CASE WHEN count(*) = 0 THEN NULL                                       -- chia-0 an toàn
       ELSE round(
         count(*) FILTER (WHERE lc."status" = 'ENROLLED' AND lc."closedAt" IS NOT NULL)::numeric
         / count(*), 4)
  END                                                                   AS success_rate
FROM "LeadChild" lc
JOIN "Lead" l ON l.id = lc."leadId"
WHERE l."deletedAt" IS NULL
  AND lc."createdAt" >= $2 AND lc."createdAt" < $3
  AND ($1::text[] IS NULL OR l."centerId" = ANY($1));
```

**Bản tách theo cơ sở (cho bảng so sánh của QLCS đa cơ sở):**

```sql
SELECT
  l."centerId",
  count(*)::int AS total_leads,
  count(*) FILTER (WHERE lc."status" = 'ENROLLED' AND lc."closedAt" IS NOT NULL)::int AS closed_leads,
  CASE WHEN count(*) = 0 THEN NULL
       ELSE round(count(*) FILTER (WHERE lc."status"='ENROLLED' AND lc."closedAt" IS NOT NULL)::numeric / count(*), 4)
  END AS success_rate
FROM "LeadChild" lc
JOIN "Lead" l ON l.id = lc."leadId"
WHERE l."deletedAt" IS NULL
  AND lc."createdAt" >= $2 AND lc."createdAt" < $3
  AND ($1::text[] IS NULL OR l."centerId" = ANY($1))
GROUP BY l."centerId"
ORDER BY total_leads DESC;
```

**Truy vấn Prisma tương đương.**

```ts
// groupBy đủ cho C3 — không cần kéo hàng chục nghìn dòng về app.
export async function getSuccessRate(actor: Actor, f: ScopeFilters) {
  const sdb = scopedDb(actor);
  const effective = effectiveCenterIds(actor, f);
  const scopeWhere = {
    createdAt: { gte: f.dateFrom, lt: f.dateTo },
    lead: { deletedAt: null, ...(effective ? { centerId: { in: effective } } : {}) },
  } as const;

  const [total, closed, lost] = await Promise.all([
    sdb.leadChild.count({ where: scopeWhere }),
    sdb.leadChild.count({
      where: { ...scopeWhere, status: { in: [...CLOSED_CHILD_STATUSES] }, closedAt: { not: null } },
    }),
    sdb.leadChild.count({ where: { ...scopeWhere, status: { in: [...LOST_CHILD_STATUSES] } } }),
  ]);

  return { total, closed, lost, successRate: total > 0 ? closed / total : null };
}
```

**Giả định.**

- `LeadChild.status` được cập nhật **kịp thời**. Spec `:47` đã chốt lead rớt là **thủ công** ⇒ lead bị bỏ quên nằm mãi ở trạng thái đang chăm và **thổi phồng mẫu số** — chính spec `:54` cảnh báo điều này. C5 là biện pháp đối trọng, **không** phải thứ tuỳ chọn.
- Không có trạng thái "tạm dừng"/"hoãn" nào cần loại khỏi mẫu số.

**Bẫy.**

| # | Bẫy | Xử lý |
|---|---|---|
| B1 | 🔴 **Lứa chưa chín.** Lead vào ngày 30 tháng này gần như chắc chắn chưa chốt ⇒ tỷ lệ tháng hiện tại luôn thấp và **không so được** với tháng trước | Hiện kèm **"tỷ lệ của lứa đã đủ N ngày"** (N = thời gian chốt p90 từ C4). Và ghi nhãn rõ trên ô số: *"tính theo lứa vào hệ thống"* |
| B2 | 🔴 **Con số này KHÁC 5 màn hình khác** đang chạy (§C.2.2) — người dùng sẽ hỏi ngay hôm đầu | Bắt buộc: đặt tên metric **khác** ("Tỷ lệ thành công theo học sinh") và có tooltip nêu công thức. Hoặc thống nhất cả 5 màn — việc riêng, ngoài phạm vi C (Non-Goal 1) |
| B3 | Học sinh vừa `ENROLLED` vừa có `lostAt` (dữ liệu bẩn do đổi trạng thái qua lại) | `count(*) FILTER` dùng `status` hiện tại nên không đếm đôi. Nhưng nên có query rà: `SELECT count(*) FROM "LeadChild" WHERE status='ENROLLED' AND "lostAt" IS NOT NULL` |
| B4 | Hiệu năng: 3 `count` = 3 lượt quét | Với dữ liệu Sata Robo (một trung tâm, 2 cơ sở) không đáng lo. Nếu cần: dùng bản SQL `FILTER` một lượt qua `$queryRaw` (nhớ bẫy B4 của §C.6.1) |
| B5 | Chỉ số cần thêm | `@@index([centerId, status, closedAt])` trên `LeadChild` sau SL-09 |

---

### C.6.4 — **C4 · Thời gian chốt trung bình**

**Định nghĩa bằng lời.** Với các học sinh **đã chốt** (§C.6.0) mà **thời điểm chốt** rơi trong khoảng ngày đang chọn: khoảng cách từ lúc vào hệ thống (`LeadChild.createdAt`) đến lúc chốt (`LeadChild.closedAt`), tính bằng **ngày** (số thực). Báo cáo trả **ba** con số: trung bình, **trung vị**, **p90**.

> Trục ngày ở đây là `closedAt`, **khác** C1/C2/C3 (dùng `createdAt`). Cố ý: "thời gian chốt trung bình của tháng 8" là câu hỏi về **các thương vụ chốt trong tháng 8**, không phải về lứa vào tháng 8 (lứa đó phần lớn còn chưa chốt).

**Nguồn dữ liệu.**

| Thứ | Bảng · cột | Trạng thái |
|---|---|---|
| Mốc đầu | `LeadChild.createdAt` (`prisma/schema.prisma:1475`) | **ĐÃ CÓ** |
| Mốc cuối | `LeadChild.closedAt` | 🔴 **CHƯA CÓ** — SL-09 |
| Trục ngày | `LeadChild.closedAt` | như trên |

🔴 **Hôm nay metric này KHÔNG tính được.** Bằng chứng đầy đủ:

| Sự thật | Bằng chứng |
|---|---|
| `Lead.convertedAt` tồn tại | `prisma/schema.prisma:1347` |
| Được `SELECT` trong báo cáo lead | `app/(admin)/admin/bao-cao/lead/page.tsx:64` |
| Được map vào record | `app/(admin)/admin/bao-cao/lead/page.tsx:79` |
| Được khai kiểu | `lib/reports/lead.ts:12` (`convertedAt?: Date \| null`) |
| **Không hàm nào đọc nó** | grep `convertedAt` trong `lib/reports/lead.ts` = **đúng 1 hit, tại dòng khai kiểu :12**. 12 hàm export không hàm nào chạm |
| **Không có phép trừ nào** trong repo | grep `convertedAt` toàn `lib/` + `app/` cho ra đúng 4 nơi: `funnel-query.ts:14` (`{not: null}`), `sla.ts:113` (`: null`), và 2 nơi ghi (`convert-lead.ts:77`, `convert-lead-v2.ts:170`) |
| Đường ghi thiếu | `lib/finance/payment.ts:152-155` đưa lead lên `REGISTERED` **không** set `convertedAt` |

⇒ **Điều kiện tiên quyết của C4:** (1) chốt §C.6.0; (2) thêm `LeadChild.closedAt` (SL-09); (3) **vá đường ghi** để mọi đường "chốt" set `closedAt` trong cùng transaction. Không có (3) thì C4 sẽ chỉ đo được tập con và **im lặng** bỏ phần còn lại.

**Truy vấn SQL.**

```sql
-- C4 · Thời gian chốt: avg + median + p90, đơn vị NGÀY (số thực).
WITH closed AS (
  SELECT
    lc.id,
    l."centerId",
    -- EXTRACT(EPOCH FROM interval) -> giây. /86400 -> ngày. Cả hai cột là timestamptz
    -- nên phép trừ KHÔNG phụ thuộc múi giờ — không cần AT TIME ZONE ở đây.
    EXTRACT(EPOCH FROM (lc."closedAt" - lc."createdAt")) / 86400.0 AS days_to_close
  FROM "LeadChild" lc
  JOIN "Lead" l ON l.id = lc."leadId"
  WHERE l."deletedAt" IS NULL
    AND lc."status" = 'ENROLLED'
    AND lc."closedAt" IS NOT NULL
    AND lc."closedAt" >= $2 AND lc."closedAt" < $3     -- trục = NGÀY CHỐT
    AND ($1::text[] IS NULL OR l."centerId" = ANY($1))
)
SELECT
  -- Dòng bẩn (chốt TRƯỚC khi vào hệ thống) tách riêng, KHÔNG im lặng bỏ.
  count(*) FILTER (WHERE days_to_close <  0)::int AS invalid_rows,
  count(*) FILTER (WHERE days_to_close >= 0)::int AS closed_rows,
  round(avg(days_to_close)      FILTER (WHERE days_to_close >= 0)::numeric, 1) AS avg_days,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY days_to_close)
        FILTER (WHERE days_to_close >= 0)::numeric, 1)                         AS median_days,
  round(percentile_cont(0.9) WITHIN GROUP (ORDER BY days_to_close)
        FILTER (WHERE days_to_close >= 0)::numeric, 1)                         AS p90_days
FROM closed;
```

**Truy vấn Prisma tương đương.**

```ts
// Prisma KHÔNG có percentile / trừ hai cột trong aggregate ⇒ fetch 2 cột rồi tính
// ở HÀM THUẦN (đúng khuôn lib/reports/*.ts: "KHÔNG gọi DB ở đây").
export async function getTimeToClose(actor: Actor, f: ScopeFilters) {
  const sdb = scopedDb(actor);
  const effective = effectiveCenterIds(actor, f);

  const rows = await sdb.leadChild.findMany({
    where: {
      status: { in: [...CLOSED_CHILD_STATUSES] },
      closedAt: { not: null, gte: f.dateFrom, lt: f.dateTo },
      lead: { deletedAt: null, ...(effective ? { centerId: { in: effective } } : {}) },
    },
    select: { createdAt: true, closedAt: true },
    take: 50_000,
  });

  return summarizeDaysToClose(
    rows.map((r) => (r.closedAt!.getTime() - r.createdAt.getTime()) / 86_400_000),
  );
}

/** THUẦN — test được không cần Postgres. Trả null khi không có mẫu (không trả 0). */
export function summarizeDaysToClose(days: number[]) {
  const valid = days.filter((d) => d >= 0).sort((a, b) => a - b);
  const invalid = days.length - valid.length;   // dữ liệu bẩn — HIỆN ra, không nuốt
  if (valid.length === 0) {
    return { count: 0, invalid, avgDays: null, medianDays: null, p90Days: null };
  }
  const at = (q: number) => valid[Math.min(valid.length - 1, Math.floor(q * (valid.length - 1)))];
  return {
    count: valid.length,
    invalid,
    avgDays: valid.reduce((s, d) => s + d, 0) / valid.length,
    medianDays: at(0.5),
    p90Days: at(0.9),
  };
}
```

**Giả định.**

- `closedAt` được set **đúng thời điểm nghiệp vụ chốt**, không phải thời điểm ai đó bấm nút cập nhật muộn. Nếu Sale chốt hôm thứ 2 nhưng nhập máy thứ 6, C4 dài thêm 4 ngày. Không có cách phát hiện tự động — chỉ ghi vào tài liệu vận hành.
- `createdAt` của con migrate từ dữ liệu cũ đã được chép từ `Lead.createdAt` (bẫy G2 của §C.6.1). Nếu không, mọi lead cũ có `days_to_close` **âm** và rơi vào `invalid_rows`.

**Bẫy.**

| # | Bẫy | Xử lý |
|---|---|---|
| B1 | 🔴 **Trung bình bị outlier kéo lệch.** Một lead ủ 8 tháng rồi chốt sẽ đẩy `avg` lên gấp đôi trong khi 90% chốt trong 2 tuần | Vì thế C4 **bắt buộc** trả cả `median` và `p90`. UI hiển thị median là số chính, avg là số phụ |
| B2 | 🔴 **`days_to_close` âm** — chốt trước khi vào hệ thống. Xảy ra khi backfill hoặc khi nhập lead muộn cho khách đã đóng tiền | Đếm riêng `invalid_rows`, **hiện lên UI** dạng cảnh báo *"N bản ghi có mốc thời gian không hợp lệ"*. Tuyệt đối không `WHERE days >= 0` im lặng |
| B3 | Chốt trong ngày ⇒ `days_to_close < 1`, làm tròn thành `0.0` trông như lỗi | Đơn vị hiển thị: `< 1 ngày` khi giá trị < 1, ngược lại `X,Y ngày` |
| B4 | `percentile_cont` không dùng được qua Prisma aggregate | Đã xử: tính ở hàm thuần, hoặc `$queryRaw` (nhớ tự truyền `effective` — bẫy B4 §C.6.1) |
| B5 | Chỉ số cần thêm | `@@index([closedAt])` hoặc gộp `@@index([centerId, status, closedAt])` |

---

### C.6.5 — **C5 · Số ngày chưa tiếp cận lại**

**Định nghĩa bằng lời.** Với **một lead (cấp phụ huynh)**: số ngày trọn vẹn từ **lần tiếp cận gần nhất** đến **bây giờ**. "Lần tiếp cận" = bản ghi `LeadActivity` thuộc nhóm **liên hệ người thật** (`CALL`, `MESSAGE`, `NOTE`, `EMAIL`). Chưa có lần tiếp cận nào ⇒ lấy mốc `Lead.createdAt`.

> **Vì sao loại `STATUS_CHANGE` và `HANDOVER` khỏi định nghĩa.** Hai loại này sinh **tự động** mỗi lần đổi trạng thái (`app/(admin)/admin/leads/actions.ts:183-192`) hoặc bàn giao (`:946`). Nếu tính chúng là "tiếp cận", một Sale chỉ cần bấm đổi trạng thái qua lại là **reset đồng hồ** mà chưa gọi khách lần nào — đúng thứ spec `:54` gọi là *"làm đẹp giả"*. Đây là **quyết định**, không phải mặc định; nếu vận hành muốn khác thì xem **OQ-C4**.
>
> Cột này neo ở **cấp phụ huynh**, không cấp con — vì Sale gọi cho **một gia đình**, không gọi riêng từng đứa trẻ (`docs/prd/G-lead.md` §6.3.a, dòng `lastActivityAt`).

**Nguồn dữ liệu.**

| Thứ | Bảng · cột | Trạng thái |
|---|---|---|
| Mốc gần nhất — **biến thể A (đúng hôm nay)** | `MAX(LeadActivity.createdAt)` theo `leadId`, lọc `type` (`prisma/schema.prisma:3527-3539`) | **ĐÃ CÓ** — index `[leadId, createdAt]` `:3538` |
| Mốc gần nhất — **biến thể B (nhanh, cần vá)** | `Lead.lastActivityAt` (`:1401`) | 🔴 **SAI** — 3/15 đường ghi |
| Mốc dự phòng | `Lead.createdAt` | **ĐÃ CÓ** — cùng cách `isLeadIdle` xử lý (`lib/crm/sla.ts:100`) |
| Ngưỡng cảnh báo | Cấu hình vận hành — key mới (§C.6.11) | **CHƯA CÓ** |

🔴 **Vì sao KHÔNG được dùng `Lead.lastActivityAt` ở v1.** Hai lỗi chồng nhau, cả hai đã xác minh — xem §C.2.5. Tóm tắt: **12/15** đường tạo `LeadActivity` không bump cột này, và `lib/crm/sla.ts:132` truyền nhầm `lead.updatedAt` (là `@updatedAt`, reset mỗi lần chạm bản ghi). Dùng cột này thì cột "số ngày chưa tiếp cận lại" hiển thị **số nhỏ giả**, và QLCS soi lead treo sẽ thấy sạch bong.

**Truy vấn SQL — biến thể A (dùng NGAY, không phụ thuộc vá N-4):**

```sql
-- C5 · Số ngày chưa tiếp cận lại — tính THẲNG từ LeadActivity.
-- LATERAL + LIMIT 1 dùng được index [leadId, createdAt] (schema.prisma:3538);
-- MAX() + GROUP BY trên toàn bảng thì không.
SELECT
  l.id                                   AS lead_id,
  l."parentName",
  l.phone,
  l."centerId",
  l."assignedToId",
  la."createdAt"                         AS last_contact_at,   -- NULL = chưa tiếp cận lần nào
  COALESCE(la."createdAt", l."createdAt") AS clock_from,        -- mốc dự phòng
  -- Số ngày TRỌN VẸN theo lịch VN: so hai NGÀY, không so hai thời điểm.
  -- Tiếp cận 23:00 hôm qua -> hôm nay là 1 ngày, không phải 0.
  (   (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    - (COALESCE(la."createdAt", l."createdAt") AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  )::int                                 AS days_since_contact
FROM "Lead" l
LEFT JOIN LATERAL (
  SELECT a."createdAt"
  FROM "LeadActivity" a
  WHERE a."leadId" = l.id
    AND a."type" IN ('CALL', 'MESSAGE', 'NOTE', 'EMAIL')   -- loại STATUS_CHANGE + HANDOVER
  ORDER BY a."createdAt" DESC
  LIMIT 1
) la ON TRUE
WHERE l."deletedAt" IS NULL
  AND ($1::text[] IS NULL OR l."centerId" = ANY($1))
  -- Bảng "lead đang chăm": loại lead đã chốt/rớt. Điều kiện đặt Ở ĐÂY, không ở HAVING.
  AND l."status" NOT IN ('ENROLLED', 'REGISTERED', 'LOST', 'DUPLICATE')
ORDER BY days_since_contact DESC NULLS LAST
LIMIT $4 OFFSET $5;
```

**Biến thể B (sau khi vá N-4 + backfill) — bỏ hẳn LATERAL:**

```sql
SELECT
  l.id, l."parentName", l.phone, l."centerId", l."assignedToId",
  l."lastActivityAt" AS last_contact_at,
  (   (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    - (COALESCE(l."lastActivityAt", l."createdAt") AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  )::int AS days_since_contact
FROM "Lead" l
WHERE l."deletedAt" IS NULL
  AND ($1::text[] IS NULL OR l."centerId" = ANY($1))
  AND l."status" NOT IN ('ENROLLED','REGISTERED','LOST','DUPLICATE')
ORDER BY days_since_contact DESC;
```

**SQL backfill đi kèm việc vá N-4** (chạy tay, có dry-run — luật cứng #4):

```sql
-- DRY-RUN trước: đếm bao nhiêu dòng sẽ đổi và lệch bao nhiêu ngày.
SELECT count(*) AS rows_to_fix,
       round(avg(EXTRACT(EPOCH FROM (m.max_at - l."lastActivityAt")) / 86400.0)::numeric, 1) AS avg_drift_days
FROM "Lead" l
JOIN (SELECT "leadId", max("createdAt") AS max_at FROM "LeadActivity" GROUP BY "leadId") m
  ON m."leadId" = l.id
WHERE l."lastActivityAt" IS DISTINCT FROM m.max_at;

-- Áp dụng (chỉ chạy sau khi đã có helper ghi mới, nếu không sẽ lệch lại ngay).
UPDATE "Lead" l
SET "lastActivityAt" = m.max_at
FROM (SELECT "leadId", max("createdAt") AS max_at FROM "LeadActivity" GROUP BY "leadId") m
WHERE m."leadId" = l.id
  AND l."lastActivityAt" IS DISTINCT FROM m.max_at;
```

⚠️ `UPDATE "Lead"` sẽ bump `updatedAt` (`@updatedAt`, `prisma/schema.prisma:1373`) cho toàn bảng. Với `lib/crm/sla.ts:132` chưa vá, việc backfill này **làm cho SLA-4 im lặng thêm một lượt**. ⇒ **Vá `sla.ts:132` TRƯỚC, backfill SAU.**

**Truy vấn Prisma tương đương (biến thể A).**

```ts
// Prisma KHÔNG có LATERAL. Hai lượt: lấy lead trong scope, rồi lấy activity gần nhất
// theo lô. Chấp nhận được vì bảng phân trang (take/skip), không kéo cả bảng.
const CONTACT_TYPES = ["CALL", "MESSAGE", "NOTE", "EMAIL"] as const; // §C.6.5, KHÔNG có STATUS_CHANGE

export async function getStaleLeadRows(actor: Actor, f: ScopeFilters, page: { take: number; skip: number }) {
  const sdb = scopedDb(actor); // Lead ∈ SCOPED_MODELS (lib/db-scope.ts:12) → auto-scope
  const effective = effectiveCenterIds(actor, f);

  const leads = await sdb.lead.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ["ENROLLED", "REGISTERED", "LOST", "DUPLICATE"] },
      ...(effective ? { centerId: { in: effective } } : {}),
    },
    select: {
      id: true, parentName: true, phone: true, centerId: true, createdAt: true,
      assignedTo: { select: { id: true, name: true } },
      // Quan hệ lồng KHÔNG được scopedDb auto-scope (lib/db-scope.ts:4-5) — ở đây
      // an toàn vì LeadActivity chỉ đọc qua đúng lead đã scope ở tầng trên.
      activities: {
        where: { type: { in: [...CONTACT_TYPES] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
    take: page.take,
    skip: page.skip,
  });

  return leads.map((l) => {
    const last = l.activities[0]?.createdAt ?? null;
    return {
      ...l,
      lastContactAt: last,
      daysSinceContact: daysBetweenVN(last ?? l.createdAt, new Date()), // THUẦN, §C.6.12
    };
  });
}
```

**Giả định.**

- Bốn loại `CALL`/`MESSAGE`/`NOTE`/`EMAIL` thực sự chỉ được tạo khi có tiếp xúc với khách. Kiểm chứng: `app/(admin)/admin/leads/actions.ts:333` (ghi chú tay, có bump `lastActivityAt` ở `:346`) — đúng. Nhưng `lib/lead/dedup.ts:40` tạo `LeadActivity` khi phát hiện **trùng** — cần đọc `type` của call-site đó trước khi bật, nếu nó là `NOTE` thì một lần trùng lặp sẽ reset đồng hồ.
- Lead chưa gán Sale vẫn hiện trong bảng (chưa ai chăm = trường hợp nặng nhất, không được ẩn).

**Bẫy.**

| # | Bẫy | Xử lý |
|---|---|---|
| B1 | 🔴 **`lastActivityAt` SAI** — dùng nó ở v1 là làm đẹp giả | Dùng biến thể A cho tới khi N-4 vá xong + backfill xong + có test 15/15 đường ghi |
| B2 | 🔴 **Vá `sla.ts:132` trước, backfill sau** — backfill bump `updatedAt` toàn bảng, mà rule SLA-4 đang đọc nhầm `updatedAt` | Thứ tự bắt buộc ghi trong runbook |
| B3 | **`GROUP BY` toàn bảng `LeadActivity` là seq scan.** `MAX(createdAt) GROUP BY leadId` không dùng được index composite hiệu quả khi bảng lớn | `LEFT JOIN LATERAL … LIMIT 1` như trên — dùng đúng `@@index([leadId, createdAt])` (`:3538`) |
| B4 | **So thời điểm vs so ngày.** `now() - lastAt` cho `0.9` ngày với lần tiếp cận 23:00 hôm qua ⇒ hiện "0 ngày" trong khi vận hành hiểu là "hôm qua" | Trừ **hai NGÀY lịch VN** như SQL trên: `(… AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` |
| B5 | Bảng "đang chăm" lọc trạng thái bằng danh sách cứng 4 giá trị | Đặt danh sách trong `lib/reports/lead-kpi.ts` (`ACTIVE_LEAD_STATUSES`), không rải chuỗi trong SQL nhiều chỗ. `LeadStatus` có 15 giá trị (`prisma/schema.prisma:37-55`) — SL-14 cấm drop, nên danh sách phải khai đủ |
| B6 | PII trên bảng | `parentName` / `phone` phải qua `maskLeadPiiFields` ở **server** (`lib/lead/pii.ts:42-51`) trước khi trả xuống client. Bảng này người không có `leads:view-pii` cũng xem được (để soi lead treo), nên **phải** mask |
| B7 | Chỉ số cần thêm | `Lead` đã có `@@index([centerId, status, createdAt])` (`prisma/schema.prisma:1416`) — dùng được cho bộ lọc. Biến thể B nên thêm `@@index([centerId, lastActivityAt])` |

> 🔴 **Bổ sung bắt buộc cho bộ lọc `type` ở C5.** `lib/lead/dedup.ts:40-49` tạo `LeadActivity` **type `NOTE`** với `actorName: "Hệ thống (web)"` và **không truyền `actorId`** mỗi khi có submit trùng SĐT. Nếu C5 chỉ lọc theo `type`, một lần khách tự submit lại form sẽ **reset đồng hồ** của Sale. Vì `LeadActivity.actorId` là nullable (`prisma/schema.prisma:3531`), điều kiện đúng là:
>
> ```sql
> AND a."type" IN ('CALL','MESSAGE','NOTE','EMAIL')
> AND a."actorId" IS NOT NULL      -- loại hoạt động do HỆ THỐNG sinh (dedup.ts:40-49)
> ```
>
> Prisma: thêm `actorId: { not: null }` vào `where` của quan hệ `activities`.

---

### C.6.6 — **C-07 · Audit trạng thái** (ai đổi · lúc nào · từ trạng thái nào)

**Không tạo cơ chế mới.** Bằng chứng ở §C.2.7: `LeadAuditLog` (`prisma/schema.prisma:3445`) **đã đóng băng từ 09/07/2026** (`lib/audit/legacy-log.ts:1-4` — *"chỉ đọc, không bao giờ ghi"*); ghi mới đi vào `AuditLog` hợp nhất qua `writeAudit(...)` trong `logLeadAudit` (`lib/audit/log.ts:128-156`), với `module: "leads"`, `entityType: "Lead"`, `action: "lead.status_change"`, `oldValues: { status: <cũ> }`, `newValues: { status: <mới> }` — đường ghi có sẵn ở `app/(admin)/admin/leads/actions.ts:170-179`.

**Việc phải làm là UI.** `app/(admin)/admin/leads/[id]/page.tsx` (508 dòng) hiện chỉ `include: { activities: … }` (`:54`); grep `auditLog` trên file này = **0 kết quả**.

**Truy vấn SQL.**

```sql
-- C-07 · Lịch sử đổi trạng thái của MỘT lead. $6 = leadId.
SELECT
  al."createdAt",
  al."actorId",
  al."actorName",                         -- snapshot tên tại thời điểm ghi (schema:567)
  al."oldValues" ->> 'status' AS from_status,
  al."newValues" ->> 'status' AS to_status,
  al."reason",
  al."ip"
FROM "AuditLog" al
WHERE al."module"     = 'leads'
  AND al."entityType" = 'Lead'
  AND al."entityId"   = $6
  AND al."action"     = 'lead.status_change'     -- logLeadAudit ghi `lead.${action.toLowerCase()}`
ORDER BY al."createdAt" DESC
LIMIT 200;
```

**Truy vấn Prisma tương đương.**

```ts
// AuditLog KHÔNG nằm trong SCOPED_MODELS (lib/db-scope.ts:11-49) ⇒ scopedDb pass-through.
// Cách ly ở đây đến TỪ Lead: trang chi tiết đã fetch lead qua sdb.lead.findFirst
// (leads/[id]/page.tsx:46) — actor CS1 không mở được lead CS2 nên không tới được đây.
// KHÔNG tự query AuditLog theo entityId nhận thẳng từ URL mà chưa qua cổng đó.
export async function getLeadStatusHistory(leadId: string) {
  return db.auditLog.findMany({
    where: { module: "leads", entityType: "Lead", entityId: leadId, action: "lead.status_change" },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      createdAt: true, actorId: true, actorName: true,
      oldValues: true, newValues: true, reason: true,
    },
  });
}
```

**Giả định.** Mọi đường đổi trạng thái đều gọi `logLeadAudit`. Kiểm chứng: `updateLeadStatus` có (`actions.ts:170`), `assign`/`auto-assign` có (`lib/lead/assign.ts:116`, `lib/lead/auto-assign.ts:176`). ⚠️ **`lib/finance/payment.ts:152-155` thì KHÔNG** — nó `updateMany` thẳng rồi chỉ tạo `LeadActivity` (`:157`). ⇒ Lần lead lên `REGISTERED` tự động sẽ **không** có dòng trong `AuditLog`. Phải bổ sung `logLeadAudit` ở đó, nếu không C-07 thiếu đúng bước quan trọng nhất.

**Bẫy.**

| # | Bẫy | Xử lý |
|---|---|---|
| B1 | 🔴 **`AuditLog` không được `scopedDb` che.** Query theo `entityId` lấy thẳng từ URL = IDOR đọc lịch sử lead cơ sở khác | Chỉ gọi sau khi `sdb.lead.findFirst` đã trả về bản ghi (`leads/[id]/page.tsx:46`). Có e2e cho ca này |
| B2 | Lịch sử **trước 09/07/2026** nằm ở `LeadAuditLog`, không ở `AuditLog` | Nếu cần hiện đủ: đọc thêm qua `lib/audit/legacy-log.ts` — nhưng bảng cũ **không có `orgUnitId`/`centerId`**, nên tab "Lịch sử cũ" giới hạn **SUPER_ADMIN / HO-level** (`legacy-log.ts:6-10`). QLCS cơ sở **không** xem được. Đây là giới hạn cố ý, không phải bug |
| B3 | `oldValues`/`newValues` là `Json?` — có thể thiếu khoá `status` | `->> 'status'` trả `NULL`, hiện `—`. Không throw |
| B4 | PII trong `oldValues`/`newValues` (khi audit sửa `parentName`/`phone`) | Dùng `maskAuditValues` (`lib/audit/audit-log.ts`, đã có, được `legacy-log.ts:15` import) trước khi trả xuống client |
| B5 | Chỉ số | Đã có `@@index([entityType, entityId, createdAt])` (`prisma/schema.prisma:581`) — truy vấn trên dùng đúng nó |

---

### C.6.7 — **C-03 · Bảng "Lead đã chuyển đổi"** (đếm theo HỌC SINH)

Spec `:43` liệt kê 9 cột. Dưới đây là nguồn của **từng** cột — không cột nào để trống.

| # | Cột (spec) | Nguồn dữ liệu | Trạng thái |
|---|---|---|---|
| 1 | **Tên KH** (link trang chi tiết lead) | Hiển thị `LeadChild.fullName` (`prisma/schema.prisma:1465`) + `Lead.parentName` (`:1311`) trên hai dòng; link `/admin/leads/<Lead.id>`. **Qua `maskLeadPiiFields`** ở server (`lib/lead/pii.ts:42-51`) | ĐÃ CÓ |
| 2 | **Khoá học** | `LeadChild.interestedCourseId` (`:1471`) → `Course.name`. ⚠️ Là **tham chiếu mềm, không FK cứng** (chú thích `:1471-1472`) ⇒ phải tự join, Prisma không có relation. Rơi về `Lead.courseId` (`:1318`) nếu con chưa khai | ĐÃ CÓ |
| 3 | **Cơ sở** | `LeadChild.centerId` sau SL-08; trước đó `Lead.centerId` (`:1316`) → `Center.name` (`:238`) | SL-08 |
| 4 | **Sale** | `Lead.assignedToId` (`:1319`) → `User.name`. ⚠️ Đây là *ai đang chăm*, **không phải** *ai mang lead về* — hai thứ hiện bị trộn (nợ N-2, `docs/prd/G-lead.md` §2.2). Sau G-01-2 thì có thêm `Lead.createdByCode` | ĐÃ CÓ (nghĩa còn lẫn) |
| 5 | 🔴 **Giá trị** | **THỰC THU** = Σ `Payment.amount` với `accountantStatus` đã xác nhận, quy về đúng con qua đường nối chốt ở `docs/prd/G-lead.md` OQ-G1. **KHÔNG** dùng `Order.totalAmount`, **KHÔNG** dùng `LeadChild.contractValue` (đó là *cam kết của Sale*, hiển thị cột riêng nếu muốn) | Chặn bởi OQ-G1/OQ-G2 |
| 6 | 🔴 **% trên tổng doanh thu** | Tử = cột 5 của dòng; **mẫu = B1 của CÙNG phạm vi + CÙNG kỳ** (§B.6.1), không phải doanh thu toàn hệ thống. B1 = 0 → hiện `—` | Chặn bởi B1 |
| 7 | **Thời điểm lead vào hệ thống** | `LeadChild.createdAt` (`:1475`) — đơn vị là học sinh nên lấy mốc của con, không lấy `Lead.createdAt` | ĐÃ CÓ (xem bẫy G2 §C.6.1) |
| 8 | **Thời điểm chốt** | `LeadChild.closedAt` | 🔴 SL-09 — **CHƯA CÓ** |
| 9 | **Thời gian chốt** (chốt − vào hệ thống) | Tính, không lưu: `closedAt − createdAt`, hiển thị theo quy ước §C.6.4 (`< 1 ngày` / `X,Y ngày`) | 🔴 SL-09 |

**Truy vấn SQL (bản đích, sau SL-08 + SL-09 + OQ-G1 phương án (a) `Order.leadChildId`):**

```sql
-- C-03 · Bảng "Lead đã chuyển đổi" — MỘT DÒNG MỘT HỌC SINH.
-- Trục ngày = closedAt (bảng nói về thương vụ chốt trong kỳ).
WITH revenue_per_child AS (
  -- Thực thu quy về từng con. Định nghĩa "thực thu" khớp B1 (§B.6.1) — GỘP ở đây,
  -- phần thuần (trừ hoàn/điều chỉnh) xử lý ở B1; cột này chỉ để xếp hạng tương đối.
  SELECT o."leadChildId", sum(p."amount")::bigint AS revenue
  FROM "Payment" p
  JOIN "Order" o ON o.id = p."orderId"
  WHERE p."deletedAt" IS NULL
    AND p."accountantStatus" = 'CONFIRMED'
    AND o."leadChildId" IS NOT NULL
  GROUP BY o."leadChildId"
),
total_revenue AS (
  -- Mẫu số cột "% trên tổng doanh thu" = B1 của CÙNG phạm vi + CÙNG kỳ.
  SELECT COALESCE(sum(p."amount"), 0)::bigint AS total
  FROM "Payment" p
  WHERE p."deletedAt" IS NULL
    AND p."accountantStatus" = 'CONFIRMED'
    AND p."paidDate" >= $2 AND p."paidDate" < $3
    AND ($1::text[] IS NULL OR p."centerId" = ANY($1))
)
SELECT
  lc.id                                        AS lead_child_id,
  l.id                                         AS lead_id,          -- link /admin/leads/<id>
  l."parentName",
  lc."fullName"                                AS student_name,
  co."name"                                    AS course_name,
  c."name"                                     AS center_name,
  u."name"                                     AS sale_name,
  COALESCE(r.revenue, 0)                       AS revenue,
  CASE WHEN t.total = 0 THEN NULL
       ELSE round(COALESCE(r.revenue, 0)::numeric / t.total, 4) END AS revenue_share,
  lc."createdAt"                               AS entered_at,
  lc."closedAt"                                AS closed_at,
  round((EXTRACT(EPOCH FROM (lc."closedAt" - lc."createdAt")) / 86400.0)::numeric, 1)
                                               AS days_to_close
FROM "LeadChild" lc
JOIN "Lead"   l  ON l.id  = lc."leadId"
LEFT JOIN "Course" co ON co.id = COALESCE(lc."interestedCourseId", l."courseId")  -- tham chiếu MỀM
LEFT JOIN "Center" c  ON c.id  = COALESCE(lc."centerId", l."centerId")
LEFT JOIN "User"   u  ON u.id  = l."assignedToId"
LEFT JOIN revenue_per_child r ON r."leadChildId" = lc.id
CROSS JOIN total_revenue t
WHERE l."deletedAt" IS NULL
  AND lc."status" = 'ENROLLED' AND lc."closedAt" IS NOT NULL       -- §C.6.0
  AND lc."closedAt" >= $2 AND lc."closedAt" < $3
  AND ($1::text[] IS NULL OR COALESCE(lc."centerId", l."centerId") = ANY($1))
ORDER BY lc."closedAt" DESC
LIMIT $4 OFFSET $5;
```

**Bẫy riêng của C-03.**

| # | Bẫy | Xử lý |
|---|---|---|
| B1 | 🔴 **Một PH hai con = HAI dòng.** Người đọc quen bảng lead cũ sẽ tưởng dữ liệu trùng | Header bảng ghi rõ *"mỗi dòng = một học sinh"*; hai dòng cùng PH hiển thị tên PH nhóm lại |
| B2 | 🔴 **Đơn không quy được về con** (đơn cũ, đơn combo, đơn bán học cụ) → `revenue = 0` | Không được hiện `0đ` như thể đã thu 0. Hiện `—` + tooltip *"đơn chưa quy về học sinh"*, và có **một bộ đếm** ở đầu bảng: *"N đơn chưa quy được về học sinh"*. `docs/prd/G-lead.md` §6.4 liệt kê 4 lỗ hổng của đường vòng hiện tại |
| B3 | Cột 6 dùng mẫu số **toàn hệ thống** thay vì mẫu số cùng phạm vi | Đã xử bằng CTE `total_revenue` nhận đúng `$1/$2/$3` |
| B4 | `interestedCourseId` là tham chiếu mềm ⇒ trỏ tới `Course` đã xoá | `LEFT JOIN` + hiện `—`. Không `INNER JOIN` (mất dòng im lặng) |
| B5 | PII | Cột 1 qua `maskLeadPiiFields` server-side. Xuất Excel (C-04) đi theo quyền A-03, **không** theo tuỳ chọn cột |

---

### C.6.8 — **C-05 · Bảng "Lead rớt"** và **C-06 · Đánh dấu rớt**

**Cột bảng C-05** (spec `:45`):

| # | Cột | Nguồn |
|---|---|---|
| 1 | Tên KH (link) | `LeadChild.fullName` + `Lead.parentName` → `/admin/leads/<Lead.id>`, qua mask PII |
| 2 | Khoá học | `LeadChild.interestedCourseId` → `Course.name` (tham chiếu mềm) |
| 3 | Sale phụ trách | `Lead.assignedToId` → `User.name` |
| 4 | Thời gian vào hệ thống | `LeadChild.createdAt` |
| 5 | **Lần tiếp cận gần nhất** | §C.6.5 biến thể A (`LeadActivity`, lọc `type` + `actorId IS NOT NULL`) |
| 6 | **Số ngày chưa tiếp cận lại** | §C.6.5, trừ **hai ngày lịch VN** |
| 7 | *(thêm)* Lý do rớt | `LeadChild.lostReasonId` → `LeadLostReason.label` (SL-10/SL-11) |
| 8 | *(thêm)* Ghi chú rớt | `LeadChild.lostNote` |
| 9 | *(thêm)* Thời điểm rớt | `LeadChild.lostAt` |

Ba cột 7–9 **không có trong spec** nhưng bắt buộc phải có: C-06 đòi lý do rớt là dữ liệu có cấu trúc, mà bảng lead rớt không hiện lý do thì dữ liệu đó không ai dùng được.

**C-06 — Server Action đánh dấu rớt (đặc tả).**

```ts
// app/(admin)/admin/leads/actions.ts — HÀNH ĐỘNG MỚI, KHÔNG sửa updateLeadStatus.
// LÝ DO tách hàm: updateLeadStatus hiện có chữ ký (leadId, rawStatus) — :126-128 —
// và đổi trạng thái ở CẤP LEAD. C-06 đổi ở CẤP CON và bắt buộc thêm 2 tham số.
const markChildLostSchema = z.object({
  leadChildId: z.string().min(1),
  lostReasonId: z.string().min(1, "Bắt buộc chọn lý do rớt"),   // C-06: KHÔNG optional
  lostNote: z.string().trim().max(2000).optional().transform((s) => (s ? s : null)),
});

export async function markLeadChildLostAction(input: unknown) {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("leads:edit"))) return { ok: false, error: "Không có quyền" };

  const parsed = markChildLostSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  // Cách ly: đọc con QUA lead cha đã scope. scopedDb KHÔNG che WRITE (lib/db-scope.ts:4-5)
  // ⇒ phải tự passesScope trước khi update.
  const child = await sdb.leadChild.findFirst({
    where: { id: parsed.data.leadChildId },
    select: { id: true, status: true, centerId: true, lead: { select: { id: true, assignedToId: true, centerId: true } } },
  });
  if (!child || !passesScope("Lead", child.lead, actor)) return { ok: false, error: "Không tìm thấy" };
  if (!(await actorMayMutateLead(session.user.id, child.lead.assignedToId))) {
    return { ok: false, error: MUTATE_DENIED };   // actions.ts:50-56
  }

  // Lý do phải còn hiệu lực — chặn gán mã đã ẩn.
  const reason = await db.leadLostReason.findFirst({
    where: { id: parsed.data.lostReasonId, isActive: true },
    select: { id: true, label: true },
  });
  if (!reason) return { ok: false, error: "Lý do rớt không hợp lệ hoặc đã ngừng dùng" };

  await db.$transaction(async (tx) => {
    await tx.leadChild.update({
      where: { id: child.id },
      data: {
        status: "LOST",
        lostReasonId: reason.id,
        lostNote: parsed.data.lostNote,
        lostAt: new Date(),
      },
    });
    // Audit: đi qua đường CÓ SẴN, không đẻ bảng mới (§C.2.7).
    await logLeadAudit({
      leadId: child.lead.id,
      action: "STATUS_CHANGE",
      actorId: session.user.id,
      actorName: session.user.name ?? "",
      oldValues: { childStatus: child.status },
      newValues: { childStatus: "LOST", lostReasonId: reason.id, lostReason: reason.label },
      changedFields: ["childStatus", "lostReasonId"],
      reason: parsed.data.lostNote ?? reason.label,
      tx,
    });
    // Timeline + bump đồng hồ — QUA HELPER DUY NHẤT của N-4, không viết tay.
    await recordLeadActivity(tx, {
      leadId: child.lead.id, actorId: session.user.id, actorName: session.user.name ?? "",
      type: "STATUS_CHANGE",
      content: `Đánh dấu RỚT học sinh — lý do: ${reason.label}`,
    });
  });

  revalidatePath(`/leads/${child.lead.id}`);
  revalidatePath("/leads");
  return { ok: true };
}
```

**Bẫy của C-06.**

| # | Bẫy | Xử lý |
|---|---|---|
| B1 | 🔴 **`Lead.status` KHÔNG tự chuyển `LOST` khi mọi con đều rớt** | `docs/prd/G-lead.md` §6.5 + OQ-G4 đã chốt: **không tự động**. Đừng viết cron đồng bộ |
| B2 | Xoá cứng dòng danh mục lý do đang dùng | `LeadLostReason` ẩn bằng `isActive = false` (`docs/prd/G-lead.md` §6.6). FK `SetNull` sẽ **mất lý do lịch sử** — tức mất chính thứ C-05 cần |
| B3 | 🔴 `scopedDb` **không che write** | Đã xử: `passesScope` tường minh trước `update`, và mọi `create` `LeadChild` phải tự set `centerId` (`docs/prd/G-lead.md` §6.7 mục 4) |
| B4 | Đánh dấu rớt rồi đổi lại — `lostAt` cũ còn nguyên | Khi chuyển khỏi `LOST`, **xoá** `lostReasonId`/`lostNote`/`lostAt` trong cùng transaction, nếu không §C.6.3 bẫy B3 sẽ có dữ liệu bẩn |

---

### C.6.9 — Truy vấn ĐO CHÊNH LỆCH trước khi chốt (chạy trên prod, chỉ đọc)

Trước khi chốt §C.6.0, phải biết ba định nghĩa hiện tại lệch bao nhiêu. Truy vấn dưới đây **chỉ đọc**, chạy được ngay hôm nay:

```sql
-- Đo lệch 3 định nghĩa "đã chốt" ở CẤP LEAD (chưa có LeadChild.status).
SELECT
  count(*) FILTER (WHERE l."status" IN ('ENROLLED','REGISTERED'))            AS def_a_enrolled_or_registered,
  count(*) FILTER (WHERE l."status" = 'ENROLLED')                            AS def_b_enrolled_only,
  count(*) FILTER (WHERE l."convertedAt" IS NOT NULL)                        AS def_c_converted_at,
  -- Nhóm gây lệch: REGISTERED mà convertedAt NULL (đường payment.ts:152-155).
  count(*) FILTER (WHERE l."status" = 'REGISTERED' AND l."convertedAt" IS NULL) AS registered_without_converted_at,
  -- Nhóm ngược: ENROLLED mà thiếu convertedAt (convert v1 cũ / backfill).
  count(*) FILTER (WHERE l."status" = 'ENROLLED'   AND l."convertedAt" IS NULL) AS enrolled_without_converted_at
FROM "Lead" l
WHERE l."deletedAt" IS NULL;

-- Đo mức hỏng của đồng hồ lastActivityAt (điều kiện của C5).
SELECT
  count(*)                                                          AS total_leads,
  count(*) FILTER (WHERE l."lastActivityAt" IS NULL)                AS never_bumped,
  count(*) FILTER (WHERE l."lastActivityAt" IS DISTINCT FROM m.max_at) AS out_of_sync,
  round(avg(EXTRACT(EPOCH FROM (m.max_at - l."lastActivityAt")) / 86400.0)
        FILTER (WHERE l."lastActivityAt" IS NOT NULL)::numeric, 1)  AS avg_drift_days
FROM "Lead" l
LEFT JOIN (SELECT "leadId", max("createdAt") AS max_at FROM "LeadActivity" GROUP BY "leadId") m
  ON m."leadId" = l.id
WHERE l."deletedAt" IS NULL;
```

⚠️ Chạy trên **prod**, không phải local — `CLAUDE.md` ghi rõ `test.satarobo.vn` và máy local **dùng chung một DB**, và DB đó **không phải** prod.

---

### C.6.10 — Bảng MỚI `LeadTarget` (chỉ tiêu lead theo tháng × cơ sở)

```prisma
/// C-01 — chỉ tiêu SỐ HỌC SINH theo tháng × cơ sở. Song sinh với RevenueTarget (:6022).
/// centerId = NULL  ⇒  chỉ tiêu TOÀN HỆ THỐNG (KHÔNG phải "chưa gán").
/// ⚠️ Khai vào SCOPE_EXEMPT (lib/db-scope.ts:84-86), KHÔNG khai SCOPED_MODELS —
///    injectScope chèn `centerId IN (...)` trần (:277-279) sẽ ẩn mất dòng toàn hệ thống.
model LeadTarget {
  id        String  @id @default(cuid())
  centerId  String?
  // Luật cứng Nền Hệ thống #3: bảng MỚI mang orgUnitId. Nhưng SL-00 (A-nen-tang.md §10)
  // buộc mang CẢ HAI vì injectScope hôm nay chỉ đọc centerId — ở đây bảng nằm ngoài
  // scope nên orgUnitId chỉ để ghi kép/đối soát, không phải cột lọc.
  orgUnitId String?

  period      String   // "YYYY-MM" — cùng quy ước RevenueTarget.period (:6030) + monthKeyVN
  targetCount Int      // SỐ HỌC SINH (CHUNG-2), không phải số phụ huynh
  note        String?
  createdById String?
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @db.Timestamptz(6)

  @@unique([centerId, period])   // ⚠️ Postgres coi NULL là DISTINCT — xem bẫy dưới
  @@index([period])
  @@index([orgUnitId])
}
```

| Điểm | Ghi chú |
|---|---|
| `centerId = NULL` | **Chỉ tiêu toàn hệ thống**. Không được cộng chung với chỉ tiêu từng cơ sở (§C.6.2 bẫy B1) |
| `@@unique([centerId, period])` với `centerId` nullable | Postgres coi `NULL` là DISTINCT ⇒ `upsert` **không match** nhánh toàn hệ thống. Phải `findFirst` + create/update tay — khuôn có sẵn ở `app/(admin)/admin/bao-cao/doanh-thu/_actions.ts:72-87`, chú thích `:37-38` đã giải thích đúng bẫy này |
| Quyền đặt chỉ tiêu | Tái dùng gate của `setRevenueTargetAction` (`_actions.ts:43,62-69`): `centerId = null` chỉ HO-level/SUPER_ADMIN; `centerId` cụ thể phải nằm trong `actor.visibleCenterIds`. Permission key: đề nghị dùng lại `leads:assign-config` (đã có, `lib/permissions/registry/crm.ts:22`) thay vì đẻ key mới — xem **OQ-C5** |

---

### C.6.11 — Hai key MỚI cho Cấu hình vận hành

Spec `:218` ghi *"Điền nốt 2 giá trị mặc định còn trống trong Cấu hình vận hành: ngưỡng cảnh báo lead treo (số ngày) và enum lý do rớt"*. Enum lý do rớt là **bảng danh mục** (`LeadLostReason`, `docs/prd/G-lead.md` §6.6), không phải setting. Còn ngưỡng thì vào registry:

```ts
// lib/settings/registry.ts — THÊM vào group "crm" (SettingGroup đã có "crm", :27)
"crm.staleLeadWarnDays": def({
  key: "crm.staleLeadWarnDays",
  group: "crm",
  label: "C-05: cảnh báo lead treo khi quá N ngày chưa tiếp cận lại",
  schema: z.number().int().min(1).max(365),
  default: 7,                 // ĐỀ XUẤT — chờ vận hành chốt (OQ-C6)
  centerOverridable: true,    // như sla.leadIdleHours (:395), mỗi cơ sở nhịp khác nhau
}),
"crm.staleLeadDangerDays": def({
  key: "crm.staleLeadDangerDays",
  group: "crm",
  label: "C-05: mức đỏ — lead treo quá N ngày",
  schema: z.number().int().min(1).max(365),
  default: 14,
  centerOverridable: true,
}),
```

⚠️ **Đừng nhầm với `sla.leadIdleHours`** (`lib/settings/registry.ts:389-396`, mặc định 24 giờ): key đó phục vụ `isLeadIdle` (`lib/crm/sla.ts:92-103`) — quét lead `NEW`/`ASSIGNED` để **bắn thông báo**, đơn vị **giờ**, và chỉ áp cho 2 trạng thái. C-05 là **cột hiển thị** cho mọi lead đang chăm, đơn vị **ngày**. Hai thứ khác nhau; gộp lại sẽ làm một trong hai sai.

---

### C.6.12 — Helper thuần dùng chung

```ts
// lib/reports/date-vn.ts — THUẦN, không gọi DB. Bổ sung cạnh monthKeyVN/dateKeyVN
// đang nằm trong lib/reports/lead.ts:87-96 (hai hàm đó cộng 7 giờ rồi đọc getUTC*).

const VN_OFFSET_MS = 7 * 3_600_000; // UTC+7, không DST — cùng giả định lead.ts:87

/** Số NGÀY LỊCH VN giữa hai thời điểm. Trừ hai NGÀY, không trừ hai thời điểm. */
export function daysBetweenVN(from: Date, to: Date): number {
  const day = (d: Date) => Math.floor((d.getTime() + VN_OFFSET_MS) / 86_400_000);
  return day(to) - day(from);
}

/** 00:00 giờ VN của ngày chứa `d`, trả về Date (UTC thật). */
export function startOfDayVN(d: Date): Date {
  return new Date(Math.floor((d.getTime() + VN_OFFSET_MS) / 86_400_000) * 86_400_000 - VN_OFFSET_MS);
}
```

Dùng ở: C5 (số ngày), B5 (trục ngày), `resolveScopeFilters` (neo hai đầu range — CHUNG-3).

---

## C.7 Open Questions

| # | Câu hỏi | Vì sao chặn | Chủ | Hạn |
|---|---|---|---|---|
| **OQ-C1** | 🔴 "Đã chốt" = `ENROLLED` (đã ghi danh) hay tính cả "đã trả tiền nhưng chưa ghi danh"? | §C.6.0 chọn **chỉ `ENROLLED`**. Nếu vận hành coi "đóng tiền là chốt" thì `LeadChildStatus` (`docs/prd/G-lead.md` §6.5, 6 giá trị) phải thêm giá trị — mà thêm giá trị enum **sau khi có dữ liệu prod** là migration trên bảng đang chạy (luật cứng #4) | Chủ dự án | **Trước migration G** |
| **OQ-C2** | Lead `status = 'DUPLICATE'` có bị loại khỏi mẫu số C3 không? | §C.6.1 bẫy B5 chọn **không loại**. `app/(admin)/admin/crm/page.tsx:96` đang loại ⇒ hai màn cho hai số | Chủ dự án | Trước khi code C3 |
| **OQ-C3** | 🔴 **Lý do rớt** đặt ở `LeadChild` (PRD G §6.3.b) hay `Lead` (SL-10 trong `A-nen-tang.md` §10.3)? | Hai tài liệu nền đang **lệch nhau**. PRD C viết theo `LeadChild` vì C-03/C-05 đếm theo học sinh. Chốt sai = migrate cột sang bảng khác sau khi đã có dữ liệu | Chủ dự án | **Trước migration G** (trùng OQ-G3) |
| **OQ-C4** | "Lần tiếp cận gần nhất" tính những loại hoạt động nào? | §C.6.5 chọn `CALL/MESSAGE/NOTE/EMAIL` **và** `actorId IS NOT NULL`. Nếu tính cả `STATUS_CHANGE` thì Sale reset được đồng hồ mà không gọi khách | Vận hành | Trước khi code C5 |
| **OQ-C5** | Quyền đặt chỉ tiêu lead dùng key nào? | Đề nghị dùng lại `leads:assign-config` (`lib/permissions/registry/crm.ts:22`). Nếu đẻ key mới thì phải seed `RolePermission` trên prod (`seed-prod-roles.yml`) — quên là QLCS trắng màn | Chủ dự án | Trước khi code C-01 |
| **OQ-C6** | Ngưỡng cảnh báo lead treo mặc định là bao nhiêu ngày (cảnh báo / đỏ)? | Spec `:218` ghi rõ đang **để trống**. Không có số thì C-05-2 không nghiệm thu được. PRD đề xuất 7 / 14 | Vận hành | Trước khi bật C-05 |
| **OQ-C7** | Danh mục **lý do rớt** ban đầu gồm những giá trị nào? | Trùng `docs/prd/G-lead.md` OQ-G6. Không có danh sách thì C-06 chặn cứng người dùng: bắt buộc chọn lý do mà danh mục rỗng | Vận hành + Sale | Trước khi seed danh mục |
| **OQ-C8** | Tỷ lệ thành công tính theo **lứa** (PRD chọn) hay theo **kỳ chốt**? | §C.6.3 chọn lứa vì hai vế phải cùng tập người. Kỳ chốt dễ hiểu hơn với BGĐ nhưng **có thể vượt 100%** | Chủ dự án | Trước khi code C3 |
| **OQ-C9** | 5 màn hình cũ (§C.2.2) có được sửa về công thức chuẩn không, hay để nguyên? | Non-Goal 1 nói **để nguyên**. Nhưng để nguyên thì cùng lúc có 6 con số "tỷ lệ chốt" trên cùng hệ thống. Nếu sửa: phải thông báo trước cho người dùng, vì số của họ sẽ nhảy | Chủ dự án | Sau khi C3 chạy |

---

## C.8 Timeline & Phasing

| Bước | Nội dung | Phụ thuộc | Ghi chú |
|---|---|---|---|
| **C.0** | Trả lời **OQ-C1, OQ-C3, OQ-C6, OQ-C7** + chạy truy vấn đo lệch §C.6.9 trên prod | — | 🔴 Bốn câu này khoá enum + danh mục. Không có kết quả đo thì không ai biết chốt định nghĩa nào làm số nhảy bao nhiêu |
| **C.1** | **A-02** — `resolveScopeFilters` + `ScopeFilters` + `<ScopeFilterBar>` + khoá cache mới | — | Thuộc khu vực A. C **không** khởi động trước bước này (CHUNG-3) |
| **C.2** | **G.2** — migration SL-08 (`LeadChild.centerId/orgUnitId`) → SL-09 (`LeadChildStatus`, `closedAt`) → SL-10 (`lostReasonId`/`lostNote`/`lostAt`) → SL-11 (`LeadLostReason`) | C.0 | Thuộc khu vực G. Additive toàn bộ |
| **C.3** | Test đỏ trước: cách ly `LeadChild` theo cơ sở · C1 đếm đúng học sinh · C3 lứa · C4 loại dòng âm | C.2 | Luật cứng Nền Hệ thống #5 |
| **C.4** | `lib/reports/lead-kpi.ts` (§C.6.0) + `lib/reports/date-vn.ts` (§C.6.12) — **hàm thuần, có unit test, không gọi DB** | C.3 | Khuôn `lib/reports/lead.ts` |
| **C.5** | Vá **N-4** (helper `recordLeadActivity` dùng ở đủ 15 call-site) → vá **`sla.ts:132`** → backfill `lastActivityAt` | C.2 | 🔴 **Thứ tự bắt buộc**: vá `sla.ts` **trước** backfill (§C.6.5 bẫy B2) |
| **C.6** | Bảng `LeadTarget` + màn đặt chỉ tiêu (khuôn `RevenueTargetForm`) | C.2 | Nhớ nhánh `centerId = null` không upsert được |
| **C.7** | Tab C: C1 · C2 · C3 · C4 (§C.6.1–C.6.4) | C.4 + C.6 | |
| **C.8** | Bảng C-03 + C-05, cột "số ngày chưa tiếp cận lại" **trên cả bảng lead đang chăm** + cảnh báo ngưỡng | C.5 + C.7 | Cột giá trị của C-03 chặn bởi OQ-G1/OQ-G2 + B1 |
| **C.9** | C-06 (đánh dấu rớt bắt buộc lý do) + C-07 (mục "Lịch sử trạng thái" trên trang chi tiết lead) | C.2 | C-07 là **UI thuần** — audit đã có |
| **C.10** | C-04 xuất Excel | A-03 xong | Quyền + định dạng thuộc khu vực A |
| **C.11** | Cập nhật `documentation/` + liệt kê file đổi, rồi **DỪNG** | C.4–C.10 | Luật cứng Nền Hệ thống #10 |

**Ràng buộc môi trường.** Toàn bộ migration của C đi qua khu vực G và là **additive**. `test.satarobo.vn` và máy local **dùng chung một DB** (`CLAUDE.md`) ⇒ đừng chạy DROP/RENAME trong lúc đang làm việc ở local.

**Điểm mù không khép được bằng code.** Spec `:47` chốt lead rớt là **thủ công**. Nghĩa là chất lượng của C2/C3 phụ thuộc **kỷ luật nhập liệu của Sale**, không phụ thuộc phần mềm. C-05-2 (cột ngày + cảnh báo trên bảng đang chăm) là biện pháp đối trọng duy nhất — bỏ nó đi thì C3 là con số tự khen.

---

# PRD D — KHU VỰC D: Dashboard / Tab Chi phí Marketing

**Phạm vi:** D-01 → D-08. Không mở sang A/B/C/E/F/G.
**Phụ thuộc cứng:** PRD C (mẫu số của D2/D3) · `docs/prd/A-nen-tang.md` §6.2 (A-02) + §10.4 · quy ước đặt tên `SR.QD.232`.

---

## D.1 Executive Summary

Tab Chi phí Marketing trả lời đúng ba câu: **tiêu bao nhiêu · mỗi lead tốn bao nhiêu · mỗi khách chốt tốn bao nhiêu** — tách theo **từng cơ sở**.

🔴 **Hôm nay không câu nào trả lời được.** Không phải vì thiếu tính năng, mà vì **toàn bộ đường ghi dữ liệu quảng cáo là MÃ CHẾT** và bảng lưu **không có cột đơn vị**:

| Sự thật | Bằng chứng |
|---|---|
| `syncMetaAds` không có call-site sản phẩm | `lib/crm/ads-insights.ts:78`. grep toàn repo: chỉ `tests/e2e/r1/ads-insights.spec.ts` |
| `upsertAdsInsight` không có call-site sản phẩm | `lib/crm/ads-insights.ts:52`. Cùng nguồn grep |
| `upsertDraftCost` / `confirmCostPeriod` / `reopenCostPeriod` không có call-site sản phẩm | `lib/crm/cost-allocation.ts:40` / `:63` / `:82`. Chỉ `tests/e2e/r1/cost-allocation.spec.ts` gọi |
| **Không có cron ads** | `vercel.json` có đúng **23** cron, khớp **23** thư mục `app/api/cron/` — không thư mục nào là ads |
| `AdsInsightDaily` **không có** `centerId` lẫn `orgUnitId`, khoá tự nhiên chỉ `(date, channel)` | `prisma/schema.prisma:948-961`, `@@unique([date, channel])` `:959` |
| `MarketingCostPeriod` **không có** `centerId`, `period` là `@unique` **đơn** | `prisma/schema.prisma:936-945`, `:938` |
| Không có bảng mapping campaign → cơ sở | grep `CampaignMapping` / `AdsMapping` trên schema = 0 |
| Không có `campaignId` / `adId` trên `Lead` | `prisma/schema.prisma:1309-1416` — chỉ có `utmSource/utmMedium/utmCampaign/utmContent/utmTerm` `:1328-1332` + `fbclid/gclid/fbp/fbc` `:1333-1336` |
| Parser `SR.QD.232` chưa tồn tại | Quy ước chỉ nằm ở dạng văn bản kế hoạch trong `docs/specs/spec-dashboard-qlcs-duyet-media-lead.md:78-83` |

⇒ Suy ra trên prod, `AdsInsightDaily` và `MarketingCostPeriod` **nhiều khả năng RỖNG**, và `/admin/marketing/funnel` đang hiển thị **Chi phí QC 0 · CPL 0 · CPA 0 · ROAS 0** (`app/(admin)/admin/marketing/funnel/page.tsx:35-38`, giá trị đi qua `computeCpl`/`computeCpa` chia-0-an-toàn trả 0).

**Ba việc nặng nhất, theo thứ tự:**

1. **D-01 — job snapshot BẤT BIẾN theo từng ngày.** Thiết kế hiện tại là **UPSERT** (`lib/crm/ads-insights.ts:55`) tức **GHI ĐÈ lịch sử** — trái thẳng yêu cầu spec `:62` (*"lưu snapshot theo từng ngày vào DB (bất biến, không ghi đè lịch sử)"*). **Phải đổi thiết kế**, không vá.
2. **D-06/D-07 — phân bổ theo cơ sở.** Bóc mã cơ sở từ prefix tên campaign, có bảng override **ưu tiên cao hơn** parser, và bắt buộc khai tỷ lệ cho `MULTI`.
3. **Bảng lưu phải mang cột đơn vị** — mà `AdsInsightDaily` đang chạy trên prod thì **đổi khoá unique là migration PHÁ VỠ** (luật cứng #4). Lối ra: bảng **MỚI**, không sửa bảng cũ.

**Một lỗ hổng bảo mật phải vá cùng đợt:** `syncMetaAds` nhét `access_token` vào **query string** của URL (`lib/crm/ads-insights.ts:93`) — token lọt vào log, Sentry, trace, và mọi proxy trên đường. Meta cho phép gửi qua header `Authorization`.

---

## D.2 Background & Context

### D.2.1 Bốn thứ đang có, và tình trạng thật của từng thứ

| Thứ | Vị trí | Tình trạng |
|---|---|---|
| `AdsInsightDaily` | `prisma/schema.prisma:948-961` | Bảng có. **MÃ CHẾT** ở đường ghi. Không cột đơn vị. Không lưu campaign |
| `MarketingCostPeriod` | `prisma/schema.prisma:936-945` | Bảng có. **MÃ CHẾT** ở đường ghi. Không `centerId`. `period` unique **đơn** ⇒ không tách được theo cơ sở |
| `lib/crm/ads-insights.ts` | 100 dòng | `parseMetaInsights` (thuần, `:24`) + `canEditAds` (thuần, `:44`) **sống được**; `upsertAdsInsight` (`:52`) + `syncMetaAds` (`:78`) là **MÃ CHẾT** |
| `lib/crm/funnel-query.ts` | 30 dòng | **SỐNG** — được `app/(admin)/admin/marketing/funnel/page.tsx:26` gọi. Nhưng xem §D.2.3 |

### D.2.2 🔴 Ghi bằng UPSERT = ghi đè lịch sử — trái D-01

```ts
// lib/crm/ads-insights.ts:52-72
export async function upsertAdsInsight(record: AdsInsightRecord & { source?: string }) {
  return db.adsInsightDaily.upsert({
    where: { date_channel: { date: record.date, channel: record.channel } },   // :56
    update: { spend: record.spend, impressions: …, clicks: …, source: … },     // :57-62  ← ĐÈ
    create: { … },
  });
}
```

Chạy job hai lần cho cùng một ngày ⇒ **số cũ biến mất, không dấu vết**. Meta còn có thói quen **chỉnh lại số của những ngày trước** (attribution window đóng muộn), nên đây không phải ca hiếm — đây là hành vi thường ngày của Ads API. Spec `:62` đòi ngược lại: *"snapshot theo từng ngày… bất biến, không ghi đè lịch sử"*.

### D.2.3 🔴 `funnel-query.ts:15` — aggregate spend KHÔNG CÓ `where`

```ts
// lib/crm/funnel-query.ts:9-21
const centerFilter = opts.centerIds ? { centerId: { in: opts.centerIds } } : {};
const [l1, l2, l3, spendAgg, revenueAgg] = await Promise.all([
  db.messengerConversation.count({ where: centerFilter }),                              // :12
  db.lead.count({ where: { deletedAt: null, qualifiedAt: { not: null }, ...centerFilter } }), // :13
  db.lead.count({ where: { deletedAt: null, convertedAt: { not: null }, ...centerFilter } }), // :14
  db.adsInsightDaily.aggregate({ _sum: { spend: true } }),   // :15  ← KHÔNG where. Không ngày. Không cơ sở.
  db.order.aggregate({ _sum: { totalAmount: true },
    where: { status: { in: ["CONFIRMED", "COMPLETED"] }, ...centerFilter } }),           // :17-20
]);
```

Ba hệ quả, cả ba đều là số sai chứ không phải số thiếu:

1. **Không lọc ngày** — `spend` là tổng **mọi ngày từ đầu**, trong khi `l1/l2/l3` cũng không lọc ngày ⇒ CPL/CPA là số "từ khai thiên lập địa", không phải của kỳ.
2. **Không lọc cơ sở** — `CENTER_MANAGER` của CS1 thấy chi phí quảng cáo **toàn công ty** chia cho lượng lead **riêng CS1** ⇒ CPL của CS1 bị thổi phồng theo đúng tỷ lệ số cơ sở.
3. Mẫu số CPL là `qualifiedAt IS NOT NULL` (`:13`) mà `qualifiedAt` **gần như không có dữ liệu** (§C.2.4) ⇒ chia cho gần-0.

Trang này dùng `db` trần (`funnel-query.ts:3`), không qua `scopedDb`, nên `AdsInsightDaily` cũng **không có** cơ chế nào chặn — mà chặn cũng không được: bảng không có cột để chặn.

### D.2.4 🔴 `AdsInsightDaily` không có cột đơn vị — và không sửa được rẻ

```prisma
// prisma/schema.prisma:948-961
model AdsInsightDaily {
  id          String   @id @default(cuid())
  date        DateTime @db.Date
  channel     String                       // "facebook" | "google" | "manual"
  spend       Float    @default(0)
  impressions Int      @default(0)
  clicks      Int      @default(0)
  source      String   @default("META_API")
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @db.Timestamptz(6)

  @@unique([date, channel])                // :959  ← khoá tự nhiên CHỈ có ngày + kênh
  @@index([date])
}
```

`A-nen-tang.md` §10.4 đã ghi đúng: bảng này **không có `centerId`** ⇒ `scopedDb` không thể chặn. Nhưng vấn đề nặng hơn thế:

| Vấn đề | Vì sao không sửa tại chỗ được |
|---|---|
| Không lưu `campaignId`/`campaignName` | `parseMetaInsights` (`:24-41`) **chỉ đọc** `date_start`, `spend`, `impressions`, `clicks` — không có trường nào để bóc mã cơ sở ra (D-06). Thêm cột thì phải viết lại parser và đổi URL truy vấn Meta (`:91` chỉ `fields=spend,impressions,clicks`) |
| Khoá `@@unique([date, channel])` | Muốn nhiều dòng/ngày (mỗi campaign một dòng) thì **phải bỏ hoặc đổi khoá unique** — trên bảng đang có dữ liệu prod. Luật cứng #4: *"Không tự ý sinh migration đổi/bỏ cột trên bảng đang có dữ liệu PROD"*. Đổi unique là **migration PHÁ VỠ** |
| Luật cứng #3 | Bảng **mới** phải mang `orgUnitId` (không thêm `centerId` mới); bảng **cũ** ghi kép cả hai. `AdsInsightDaily` là bảng cũ ⇒ nếu vá tại chỗ phải ghi kép — thêm việc, mà vẫn không giải được hai dòng trên |

⇒ **Kết luận thiết kế: tạo BẢNG MỚI, giữ `AdsInsightDaily` đọc-only (2-phase, không drop).** Chi tiết §D.6.4.

### D.2.5 🔴 Token Meta — hai vấn đề

**(a) Token nằm trong query string.**

```ts
// lib/crm/ads-insights.ts:89-94
const url =
  `https://graph.facebook.com/v21.0/act_${acct}/insights` +
  `?fields=spend,impressions,clicks&time_increment=1` +
  `&time_range=${encodeURIComponent(JSON.stringify({ since: opts.since, until: opts.until }))}` +
  `&access_token=${token}`;                       // :93 ← token trong URL
const res = await fetch(url);
```

URL đi vào log ứng dụng, breadcrumb Sentry, span tracing, và bất kỳ proxy nào trên đường. Vi phạm luật cứng Nền Hệ thống #9 (*"Secret chỉ trong env; không hardcode, **không log giá trị secret**"*) — token không bị hardcode, nhưng nó **bị log**, mà hậu quả giống hệt. Meta chấp nhận `Authorization: Bearer <token>`.

**(b) Không có cơ chế làm mới token.** `vercel.json:40-43` có `zalo-token-refresh` chạy 6 giờ/lần; **không có** `meta-token-refresh`. Token Meta là **env tĩnh** (`process.env.META_PAGE_ACCESS_TOKEN`, `ads-insights.ts:84`). Token Page/User của Meta hết hạn ⇒ job D-01 **chết im lặng** đúng kiểu 20 cron đã từng chết im (xem D.2.6).

### D.2.6 Tiền lệ đã có: cron chết im lặng suốt nhiều tháng

`proxy.ts:122-131` ghi lại sự cố: **mọi** cron chết từ lúc dựng vì Vercel Cron gọi vào URL deployment `*.vercel.app`, request ăn **308** sang host thật, và header `Authorization: Bearer` **rụng khi đổi host** ⇒ handler không bao giờ chạy, `DomainEvent` tích 285 dòng `PENDING` với `attempts = 0`, **không log lỗi, không ai biết**. Đã vá bằng `if (isInfraPath(pathname)) return NextResponse.next();` (`proxy.ts:131`).

⇒ Job D-01 phải có **cơ chế tự tố cáo khi không chạy** (§D.6.2 mục 5), không dựa vào việc ai đó nhìn dashboard thấy số lạ.

### D.2.7 Cái đang thiếu hoàn toàn

| Thứ | Trạng thái |
|---|---|
| Bảng mapping campaign/adset → cơ sở (D-07) | **CHƯA CÓ** |
| Parser tên campaign theo `SR.QD.232` (D-06) | **CHƯA CÓ** — quy ước chỉ là văn bản ở `docs/specs/…:78-83` |
| `Lead.campaignId` / `adsetId` / `adId` (nối lead ↔ campaign) | **CHƯA CÓ** — `docs/prd/G-lead.md` §6.3.b, SL-10 |
| Chỉ tiêu ngân sách theo tháng × cơ sở (D-02) | **CHƯA CÓ** — `MarketingCostPeriod` chỉ có `period` unique đơn |
| Cron ads | **CHƯA CÓ** — 23/23 cron đã dùng hết cho việc khác |

---

## D.3 Objectives · Non-Goals · Success Metrics

### Goals

1. Mỗi ngày có **một snapshot bất biến** chi tiêu quảng cáo, tách đến mức campaign, **không bao giờ ghi đè** số của ngày đã chốt.
2. Mỗi đồng chi tiêu quy được về **một cơ sở** (hoặc chia theo tỷ lệ đã khai), hoặc nằm công khai trong nhóm `CHƯA PHÂN BỔ` — **không có đồng nào biến mất im lặng**.
3. CPL và CPA tính đúng phạm vi: QLCS CS1 thấy chi phí **của CS1** chia cho lead **của CS1**.
4. Token Meta không lọt vào log, và job chết thì có người biết trong vòng 24 giờ.

### Non-Goals (cố ý không làm trong D)

1. **Không** sửa `AdsInsightDaily` tại chỗ — giữ đọc-only 2-phase (luật cứng #4 + §D.2.4).
2. **Không** đụng `MarketingCostPeriod` / `lib/crm/cost-allocation.ts` — mã chết, để nguyên, đánh dấu deprecated. Xoá là việc riêng.
3. **Không** đồng bộ Google Ads ở v1 — `channel` giữ chỗ nhưng chỉ chạy `facebook`.
4. **Không** làm attribution lead ↔ ad ở mức từng lead (`Lead.campaignId` thuộc SL-10 của khu vực G). D v1 phân bổ ở mức **chi phí**, không ở mức **lead**.
5. **Không** sửa `/admin/marketing/funnel` cũ trong đợt này — nhưng **phải** treo cảnh báo trên trang đó (§D.5 P0 `D-00-2`), vì để nguyên là để một màn hình nói sai công khai.
6. **Không** dùng AI/dự báo ngân sách — `CLAUDE.md` Don'ts: nhu cầu "dự báo/khuyến nghị" làm **rule-based**.

### Success Metrics

| Chỉ số | Hiện tại | Đích | Cách đo |
|---|---|---|---|
| Số ngày có dữ liệu chi tiêu | 0 (bảng nhiều khả năng rỗng) | 100% ngày từ lúc bật job | `SELECT count(DISTINCT "statDate") FROM "AdsSpendDaily"` = số ngày trong kỳ |
| Chi phí quy được về cơ sở | 0% (không có cột) | ≥ 95% | `sum(spend) FILTER (WHERE centerId IS NOT NULL) / sum(spend)` |
| Lịch sử bị ghi đè | Có (UPSERT `:55`) | **0** | Chạy job 2 lần cùng ngày → số dòng tăng, **không** dòng nào đổi giá trị |
| CPL/CPA lọc đúng phạm vi | Không (`funnel-query.ts:15`) | Có | e2e: actor CS1 và actor CS2 cho hai con số chi phí khác nhau |
| Token trong URL | Có (`:93`) | Không | grep `access_token=` trong `lib/` = 0 |
| Job chết mà không ai biết | Có (tiền lệ `proxy.ts:122`) | Không | Không có snapshot > 26 giờ → thông báo cho SUPER_ADMIN |
| Chi tiêu nhóm `CHƯA PHÂN BỔ` | — | Hiện cảnh báo khi > 0 | D-08 |

---

## D.4 Target Users & Segments

| Vai | Cần gì | Ràng buộc |
|---|---|---|
| **Marketing (`MARKETING` / `HO_MARKETING`)** | Đặt chỉ tiêu ngân sách, xem thực chi vs chỉ tiêu, dọn nhóm `CHƯA PHÂN BỔ` | `canEditAds` (`lib/crm/ads-insights.ts:44-49`) hiện chỉ cho `isSuperAdmin` **hoặc** `roleCode === "HO_MARKETING"` — vai `MARKETING` cấp cơ sở **không** sửa được. Giữ nguyên hay nới là **OQ-D5** |
| **QLCS (`CENTER_MANAGER`)** | Chi phí + CPL + CPA **của riêng cơ sở mình** | 🔴 Hôm nay thấy chi phí toàn công ty (§D.2.3). Sửa được điều này chính là lý do D tồn tại |
| **BGĐ / Chủ dự án** | So CPL/CPA giữa cơ sở; biết bao nhiêu tiền chưa quy được về đâu | D-08 phải hiện, không được giấu |
| **Người vận hành (Dev)** | Chạy lại job cho một ngày cụ thể mà không hỏng lịch sử | §D.6.2 mục 4 — chạy lại tạo bản ghi mới, không đè |

---

## D.5 User Stories & Requirements

### P0 — Must Have

| # | User story | Acceptance criteria |
|---|---|---|
| **D-01-1** | 🔴 Là hệ thống, mỗi 00:00 tôi quét chi tiêu Facebook Ads của ngày hôm trước và lưu **snapshot bất biến theo từng ngày**. | Cron `/api/cron/ads-sync`, lịch `"0 17 * * *"` UTC = **00:00 giờ VN** (§D.6.2 mục 2). Ghi bằng **INSERT**, không `upsert`. Chạy lại cùng ngày → **thêm** bản ghi mới với `fetchedAt` mới, bản cũ **nguyên vẹn**. Đọc mặc định lấy bản `fetchedAt` mới nhất. |
| **D-01-2** | 🔴 Là dev, tôi biết job có chạy hay không. | Không có snapshot nào cho ngày `D-1` sau 26 giờ → `notifyStaff` tới SUPER_ADMIN + `HO_MARKETING` (khuôn `lib/crm/marketing-alerts.ts`, `dedupeKey` idempotent như `lib/crm/sla.ts:141`). **Không** dựa vào việc ai đó nhìn dashboard. |
| **D-01-3** | 🔴 Là người vận hành, token Meta không lọt vào log. | `syncMetaAds` mới gửi token qua header `Authorization: Bearer …`, **không** qua query string. grep `access_token=` trong `lib/` = 0. Lỗi API log `res.status` + `res.statusText`, **không** log URL. |
| **D-06-1** | 🔴 Là hệ thống, tôi bóc **mã cơ sở** từ prefix tên campaign theo `SR.QD.232`. | Hàm thuần `parseCenterCodeFromCampaignName()` (§D.6.5) + bảng test-case đầy đủ. Không parse được → mã `null` → nhóm **`CHƯA PHÂN BỔ`**, **không** đoán, **không** gán đại về một cơ sở. |
| **D-07-1** | 🔴 Là admin, tôi gán tay campaign/ad set → cơ sở, và mapping tay **thắng** kết quả parser. | Bảng `AdsCampaignMapping` (§D.6.6). Thứ tự quyết định: **adset override → campaign override → parser → `CHƯA PHÂN BỔ`**. Có test khẳng định thứ tự này. |
| **D-07-2** | 🔴 Là admin, campaign `MULTI` **bắt buộc** khai tỷ lệ phân bổ. | Campaign parse ra mã `MULTI` mà **chưa** có dòng phân bổ trong `AdsCampaignMapping` → toàn bộ chi tiêu của nó vào **`CHƯA PHÂN BỔ`** (không chia đều, không đoán). Tổng tỷ lệ của một campaign phải = **100%** (ràng buộc ở Server Action + test bất biến tổng). |
| **D-01-4** | 🔴 Là QLCS, dữ liệu chi tiêu phải **lọc được theo cơ sở**. | Bảng snapshot mang **cả** `centerId` lẫn `orgUnitId` (SL-00 của `A-nen-tang.md` §10: `injectScope` chỉ chèn `centerId` — `lib/db-scope.ts:277-279`). Khai vào `SCOPED_MODELS` + `BACKFILL_SPECS` + `getModelPrefixes`. e2e: actor CS1 không thấy chi tiêu CS2. |
| **D-03-1** | Là Marketing, tôi thấy **Chỉ tiêu · Ngân sách thực tế · % thực tế/chỉ tiêu**. | Chỉ tiêu từ bảng `AdsBudgetTarget` (§D.6.7). Chưa đặt → **"Chưa đặt chỉ tiêu"**, không phải `0%` (cùng luật C2). |
| **D-04-1** | Là Marketing, tôi thấy **CPL**. | §D.6.9. Mẫu số = **C1** (tổng lead, đếm học sinh — CHUNG-2), **không** phải `qualifiedAt IS NOT NULL` như `funnel-query.ts:13`. |
| **D-05-1** | Là Marketing, tôi thấy **CPA**. | §D.6.10. Mẫu số = **C3 tử số** (lead chốt theo §C.6.0). |
| **D-08-1** | 🔴 Là QLCS, tôi được cảnh báo khi có chi tiêu ở nhóm `CHƯA PHÂN BỔ` trong range đang xem. | §D.6.11. Banner hiện **số tiền** + **số campaign** + link tới màn D-07 để gán. Không có chi tiêu chưa phân bổ → không hiện gì. |
| **D-00-1** | 🔴 Là dev, tôi có **một** hàm tính chi tiêu theo phạm vi. | `lib/reports/ads-spend.ts`. Tab D **và** mọi chỗ khác dùng chung. `lib/crm/funnel-query.ts:15` là ví dụ điển hình của việc mỗi chỗ tự viết một kiểu. |
| **D-00-2** | 🔴 Là người dùng, tôi không bị màn hình cũ nói sai. | `/admin/marketing/funnel` treo banner *"Số liệu chi phí trên trang này chưa lọc theo cơ sở và theo kỳ — xem tab Chi phí Marketing"* cho tới khi trang đó được viết lại. Đây là **thay đổi một dòng JSX**, không phải refactor. |

### P1 — Should Have

| # | User story | Acceptance criteria |
|---|---|---|
| **D-02-1** | Là Marketing, tôi đặt **chỉ tiêu ngân sách theo tháng × cơ sở**. | `AdsBudgetTarget` §D.6.7, khuôn `RevenueTarget` + `setRevenueTargetAction` (`app/(admin)/admin/bao-cao/doanh-thu/_actions.ts:40-101`), **kể cả** nhánh `centerId = null` không upsert được. |
| **D-01-5** | Là hệ thống, tôi lấy lại số của **7 ngày gần nhất** mỗi lần chạy. | Meta chỉnh lại số của ngày cũ khi attribution window đóng. Job quét `since = D-7`, `until = D-1`; mỗi ngày sinh snapshot mới với `fetchedAt` mới. Bản mới nhất thắng khi đọc; bản cũ **giữ nguyên** để đối soát. |
| **D-07-3** | Là admin, tôi thấy campaign nào chưa được gán. | Màn D-07 có tab "Chưa phân bổ" liệt kê campaign + chi tiêu + lần thấy gần nhất. |
| **D-01-6** | Là hệ thống, tôi làm mới token Meta tự động. | Cron `meta-token-refresh` theo khuôn `zalo-token-refresh` (`vercel.json:40-43`). ⚠️ Xem OQ-D4 — token dài hạn của Meta có cơ chế khác Zalo. |
| **D-04-2** | Là Marketing, tôi xem CPL/CPA **theo campaign**, không chỉ theo cơ sở. | Cần `Lead.campaignId` (SL-10, khu vực G). Không có thì CPL chỉ tính được ở mức cơ sở. |

### P2 — Nice to Have / Future

| # | User story | Acceptance criteria |
|---|---|---|
| **D-01-7** | Đồng bộ Google Ads. | Cột `channel` đã có chỗ. Cần adapter riêng — `modules/integration` **chưa tồn tại** (`CLAUDE.md`), nên tạm đặt cạnh adapter Meta. |
| **D-03-2** | Biểu đồ chi tiêu theo ngày. | Tái dùng `<LineChart>` (`components/charts/`, admin-only, animation 300ms — `.claude/rules/ui-libraries.md`). |
| **D-09-1** | Nhập tay chi tiêu cho kênh ngoài (tờ rơi, sự kiện). | **Trùng phạm vi B2** — đưa vào bảng chi phí của B, **không** đưa vào bảng ads (nếu không B3 trừ hai lần). Xem §B.6.2. |

---

## D.6 Solution Overview

### D.6.1 🔴 Quyết định gốc: **snapshot ghi thô + phân bổ tính lúc ĐỌC**

Hai việc phải tách ra, đây là quyết định nặng nhất của khu vực D:

| Tầng | Nội dung | Tính chất |
|---|---|---|
| **Ghi** — `AdsSpendSnapshot` | Đúng những gì Meta trả về, theo từng ngày × campaign × ad set. **Chỉ INSERT.** Không cột cơ sở, không tỷ lệ | **BẤT BIẾN** |
| **Đọc** — resolver | Ghép snapshot với `AdsCampaignMapping` + parser `SR.QD.232` → ra chi tiêu theo cơ sở | **TÍNH LẠI MỖI LẦN ĐỌC** |

**Vì sao tách:**

1. Đây đúng nguyên tắc repo đã chốt ở chỗ khác: *"suy diễn trạng thái là việc của **resolver lúc đọc**, không phải job ghi đè"* (`docs/prd/G-lead.md` §6.5), cùng tinh thần luật cứng Nền Hệ thống #8.
2. **Sửa mapping là cơ chế sửa sai duy nhất.** Marketing đặt sai tên campaign hôm nay, hai tuần sau admin gán override — nếu phân bổ đã đóng băng trong bảng snapshot thì phải viết script sửa dữ liệu lịch sử. Tính lúc đọc thì **toàn bộ lịch sử tự đúng**.
3. Bỏ hẳn bài toán `NULL` trong khoá unique: campaign `MULTI` chia cho 2 cơ sở sinh 2 dòng đọc, nhưng vẫn **1** dòng ghi.

**Đánh đổi phải nói ra:**

| Đánh đổi | Mức độ | Xử lý |
|---|---|---|
| Đọc chậm hơn (join + nhân tỷ lệ mỗi lần) | Thấp — vài trăm dòng/tháng ở quy mô Sata Robo (1 tài khoản quảng cáo, 2 cơ sở) | `safeCache` TTL 120s như các trang `/bao-cao/*` |
| 🔴 **Số lịch sử THAY ĐỔI khi ai đó sửa mapping** | Cao — báo cáo tháng trước có thể khác giữa hai lần mở | `AdsCampaignMapping` mang `effectiveFrom` / `effectiveTo` (khuôn `UserOrgRole`) ⇒ sửa mapping từ hôm nay **không** đụng số quá khứ, muốn sửa quá khứ phải chỉnh `effectiveFrom` một cách có chủ ý + ghi audit |
| Không có "số đã chốt sổ" | Trung bình | Nếu kế toán cần đóng sổ: thêm bảng `AdsSpendLocked(period, centerId, amount, lockedAt)` ở giai đoạn sau — **additive**, không phá thiết kế này |

### D.6.2 **D-01 · Đặc tả job đồng bộ**

**1. Nơi đặt.**

```
app/api/cron/ads-sync/route.ts     — dùng withCron("ads-sync", …) (lib/cron/handler.ts:8)
lib/ads/meta-client.ts             — gọi Graph API. Token qua HEADER, không qua URL
lib/ads/sync.ts                    — điều phối: fetch → parse → INSERT snapshot
lib/ads/campaign-code.ts           — parser SR.QD.232 (§D.6.5) — THUẦN
lib/reports/ads-spend.ts           — resolver ĐỌC (§D.6.8) — hàm dùng chung của tab D
```

**2. Lịch chạy.** Spec `:62` đòi **00:00 hằng ngày**. Vercel Cron chạy theo **UTC**; VN = UTC+7 ⇒ `"0 17 * * *"`. Tiền lệ trong repo: `class-schedule-sync` dùng `"10 17 * * *"` (`vercel.json:5-7`) chính là 00:10 giờ VN.

```json
// vercel.json — THÊM mục thứ 24. Hiện có ĐÚNG 23 cron, khớp 23 thư mục app/api/cron/.
{ "path": "/api/cron/ads-sync", "schedule": "0 17 * * *" }
```

**3. Cửa sổ quét.** `since = D-7`, `until = D-1` theo **lịch của tài khoản quảng cáo** (xem bẫy B3 §D.6.3). Lý do quét lại 7 ngày: Meta **chỉnh lại** số của ngày cũ khi attribution window đóng muộn — đây là hành vi bình thường của Ads API, không phải sự cố.

**4. 🔴 Chạy lại cùng một ngày — hai phương án và lựa chọn.**

| | **(A) Append-only + `fetchedAt`** ✅ CHỌN | **(B) Unique chặn ghi đè** |
|---|---|---|
| Khoá tự nhiên | `(statDate, level, campaignId, adsetId, fetchedAt)` | `(statDate, level, campaignId, adsetId)` |
| Cách ghi | `INSERT` luôn | `INSERT … ON CONFLICT DO NOTHING` |
| Chạy lại | Thêm dòng mới, dòng cũ **nguyên vẹn** | Không ghi gì — **lần đầu thắng vĩnh viễn** |
| Meta chỉnh lại số | ✅ Ghi nhận được, và **so được** hai lần đo | ❌ **Mất** — số đầu tiên (thường chưa đủ) đóng băng mãi mãi |
| Cách đọc | `DISTINCT ON (…) ORDER BY … fetchedAt DESC` | `SELECT` thẳng |
| Dung lượng | Lớn hơn ~7× (mỗi ngày được đo 7 lần) | Nhỏ |
| Hỏng thế nào khi sai | Đọc quên `DISTINCT ON` → **cộng 7 lần cùng một khoản** | Số sai và **không có cách sửa** ngoài xoá dòng (mà xoá là mất bất biến) |

**Chọn (A).** Lý do quyết định: (B) mâu thuẫn trực tiếp với D-01-5 — quét lại 7 ngày mà không ghi được gì thì quét làm gì. Và spec `:62` nói *"bất biến, không ghi đè lịch sử"* — (A) giữ **cả** lịch sử; (B) chỉ giữ bản đầu và **vứt** các bản sau, tức cũng là mất lịch sử, chỉ theo chiều ngược lại.

Rào cản cho rủi ro "cộng 7 lần": resolver `lib/reports/ads-spend.ts` là **cửa duy nhất** để đọc bảng này, và có unit test khẳng định 3 snapshot cùng khoá chỉ ra **một** số.

**5. Tự tố cáo khi không chạy** (tiền lệ 20 cron chết im — §D.2.6):

```ts
// Trong cùng route ads-sync, chạy TRƯỚC khi gọi Meta.
// Nếu ngày D-1 chưa có snapshot nào sau 26 giờ → thông báo. dedupeKey idempotent
// theo khuôn lib/crm/sla.ts:141 (không dội chuông mỗi lượt cron cho cùng một việc).
await notifyStaff({
  userIds: await getSuperAdminUserIds(),         // lib/crm/marketing-alerts.ts (đã export)
  dedupeKey: `ads-sync-missing:${dateKeyVN(yesterday)}`,
  category: "SLA",
  title: "Đồng bộ chi phí quảng cáo chưa chạy",
  body: `Không có snapshot cho ngày ${dateKeyVN(yesterday)} sau 26 giờ.`,
  href: "/marketing/chi-phi",
});
```

**6. Chống lỗi từng phần.** Một campaign lỗi không được làm hỏng cả lượt: gói mỗi trang kết quả trong `try/catch`, đếm `synced` / `failed`, trả cả hai trong payload của `withCron` (`lib/cron/handler.ts:18`). `failed > 0` → thông báo.

**7. Gọi Meta — token qua header.**

```ts
// lib/ads/meta-client.ts — THAY cho lib/crm/ads-insights.ts:89-95.
// Sửa đúng một điều so với bản cũ: token KHÔNG nằm trong URL (:93).
const params = new URLSearchParams({
  // 'campaign_id'/'campaign_name'/'adset_id'/'adset_name' là thứ bản cũ THIẾU —
  // không có chúng thì D-06 không có gì để bóc mã cơ sở ra.
  fields: "campaign_id,campaign_name,adset_id,adset_name,spend,impressions,clicks",
  level: "adset",
  time_increment: "1",
  time_range: JSON.stringify({ since, until }),
  limit: "500",
});
const res = await fetch(`https://graph.facebook.com/v21.0/act_${acct}/insights?${params}`, {
  headers: { Authorization: `Bearer ${token}` },   // ← KHÔNG đưa token vào query string
});
if (!res.ok) {
  // KHÔNG log url (chứa tham số), KHÔNG log token.
  throw new AdsError("META_API_ERROR", `Meta API lỗi ${res.status} ${res.statusText}`);
}
```

### D.6.3 Schema MỚI — `AdsSpendSnapshot`

```prisma
enum AdsSpendLevel {
  CAMPAIGN
  ADSET
}

/// D-01 — SNAPSHOT BẤT BIẾN chi tiêu quảng cáo theo từng ngày. CHỈ INSERT, KHÔNG update,
/// KHÔNG upsert, KHÔNG delete. Phân bổ về cơ sở KHÔNG lưu ở đây — tính lúc đọc (§D.6.1).
///
/// ⚠️ ĐÂY LÀ BẢNG MỚI, KHÔNG sửa AdsInsightDaily (:948). Lý do: bảng cũ có
/// @@unique([date, channel]) (:959) — đổi khoá trên bảng đang có dữ liệu PROD là
/// migration PHÁ VỠ (luật cứng #4). Bảng cũ giữ ĐỌC-ONLY, 2-phase, không drop.
model AdsSpendSnapshot {
  id String @id @default(cuid())

  /// Ngày CHI TIÊU theo lịch của TÀI KHOẢN QUẢNG CÁO (Meta `date_start`), không phải
  /// ngày job chạy. Kiểu Date — không giờ, không múi giờ. Xem bẫy B3.
  statDate DateTime @db.Date
  channel  String   @default("facebook")
  accountId String                        // "act_123456789"

  level        AdsSpendLevel
  campaignId   String
  campaignName String                     // snapshot TÊN tại thời điểm quét — parser đọc cột này
  /// "" khi level = CAMPAIGN. CỐ Ý không dùng NULL: Postgres coi NULL là DISTINCT
  /// trong unique index ⇒ khoá tự nhiên sẽ mất tác dụng (cùng bẫy RevenueTarget :6037).
  adsetId      String @default("")
  adsetName    String @default("")

  /// VND, số NGUYÊN (đồng). ⚠️ AdsInsightDaily.spend là Float (:952) — KHÔNG lặp lại:
  /// tiền trong repo này luôn Int (Payment.amount :5693, Order.totalAmount :3701,
  /// MarketingCostPeriod.totalQcCost :939).
  spend       Int @default(0)
  impressions Int @default(0)
  clicks      Int @default(0)
  currency    String @default("VND")

  /// Thời điểm ĐO. Cùng (statDate, campaignId, adsetId) có nhiều dòng khác fetchedAt —
  /// đó chính là cơ chế "không ghi đè lịch sử" (§D.6.2 mục 4 phương án A).
  fetchedAt  DateTime @db.Timestamptz(6)
  /// Nguyên văn payload Meta cho dòng này — để đối soát khi số bị nghi ngờ.
  rawPayload Json     @default("{}")

  createdAt DateTime @default(now()) @db.Timestamptz(6)

  @@unique([statDate, level, campaignId, adsetId, fetchedAt])
  @@index([statDate, campaignId])          // resolver lọc theo ngày rồi ghép mapping
  @@index([campaignId, statDate])          // màn D-07 "chưa phân bổ" tra ngược theo campaign
}
```

**Bảng này CỐ Ý KHÔNG mang `centerId` / `orgUnitId`** — và đây là ngoại lệ phải viết ra, không để người sau đoán:

1. Một dòng snapshot có thể thuộc **nhiều** cơ sở (campaign `MULTI`) ⇒ không có một giá trị `centerId` nào đúng.
2. Phân bổ **thay đổi được** (admin sửa override) trong khi snapshot **bất biến** ⇒ hai thứ có vòng đời khác nhau, không được ở chung bảng.
3. Cách ly cơ sở **không** mất: nó nằm ở **tầng resolver** (`lib/reports/ads-spend.ts`) — resolver luôn nhận `centerIds[]` đã giao với `getModelVisibleCenterIds` và chỉ trả phần chi tiêu thuộc các cơ sở đó. Kiểu ngoại lệ này đã có tiền lệ trong `SCOPE_EXEMPT` với lý do ghi tại chỗ (`lib/db-scope.ts:75-131`).
4. Khai vào `SCOPE_EXEMPT` (`lib/db-scope.ts:75`) kèm chú thích trên, **không** khai `SCOPED_MODELS` — bảng không có `centerId` thì `injectScope` (`:277-279`) chỉ tạo ra query lỗi.

**Bẫy schema.**

| # | Bẫy | Xử lý |
|---|---|---|
| B1 | 🔴 `spend` kiểu `Float` ở bảng cũ (`:952`) — tiền dấu phẩy động, cộng nhiều dòng sinh sai số | Bảng mới dùng `Int` (đồng). Meta trả chuỗi `"123.45"` ⇒ `Math.round(Number(s))` khi parse |
| B2 | `adsetId` NULL trong unique | Đã xử: `@default("")`, không nullable |
| B3 | 🔴 **`statDate` là ngày của TÀI KHOẢN QUẢNG CÁO**, theo múi giờ cấu hình trên Meta — có thể **không** phải `Asia/Ho_Chi_Minh` | Kiểm tra `timezone_name` của ad account **một lần** khi bật job và ghi vào tài liệu. Nếu khác VN → chi tiêu "ngày 15" của Meta lệch với doanh thu "ngày 15" của B5 vài giờ. **Không tự quy đổi** — quy đổi mù còn tệ hơn lệch đã biết |
| B4 | Bảng phình 7× | Chấp nhận (§D.6.2 mục 4). Nếu cần: job dọn giữ **bản mới nhất + bản đầu tiên** của mỗi khoá sau 90 ngày — **giai đoạn sau**, và phải ghi rõ là mất dữ liệu đối soát |

### D.6.4 `AdsInsightDaily` + `MarketingCostPeriod` — xử lý thế nào

| Bảng | Quyết định | Lý do |
|---|---|---|
| `AdsInsightDaily` (`:948`) | **Giữ nguyên, ĐỌC-ONLY, không drop** (2-phase). Thêm chú thích deprecated trên model. Gỡ `upsertAdsInsight` khỏi mọi đường sản phẩm (hiện đã không có đường nào) | Luật cứng #4 — bảng có thể có dữ liệu prod. Đổi `@@unique([date, channel])` là migration phá vỡ |
| `MarketingCostPeriod` (`:936`) | **Giữ nguyên, ĐỌC-ONLY.** `lib/crm/cost-allocation.ts` (`upsertDraftCost` `:40` · `confirmCostPeriod` `:63` · `reopenCostPeriod` `:82`) đánh dấu deprecated, **không xoá** | Mã chết nhưng `lib/crm/marketing-alerts.ts:47` **có đọc** nó (cron `marketing-alerts` chạy thật, `vercel.json:32-35`). Xoá bảng = vỡ cron |
| `lib/crm/funnel-query.ts:15` | **Không sửa trong D** (Non-Goal 5), nhưng **bắt buộc** treo banner cảnh báo trên `/admin/marketing/funnel` (D-00-2) | Sửa nó kéo theo đổi cả `computeFunnelMetrics` + trang funnel — việc riêng, rủi ro riêng |

### D.6.5 **D-06 · Parser tên campaign theo `SR.QD.232`**

**Quy ước** (`docs/specs/spec-dashboard-qlcs-duyet-media-lead.md:78-83`):

```
[MÃ CƠ SỞ]_[MỤC TIÊU]_[KHOÁ HỌC]_[ĐỊNH DẠNG]_[MMYY]_[MÃ NỘI DUNG]
Ví dụ:      CS1_LEAD_ROBOTICS-L1_VIDEO_0826_A03
```

Ràng buộc bắt buộc trong văn bản: **mã cơ sở luôn đứng đầu** · dùng **đúng danh mục mã cơ sở của hệ thống** · ngăn cách bằng `_` · **không dấu tiếng Việt** · campaign chạy nhiều cơ sở dùng mã `MULTI` và **bắt buộc** khai tỷ lệ ở D-07.

**Danh mục mã cơ sở là `Center.code`** — `prisma/schema.prisma:237`: `code String? @unique // Phase T0.2 — mã cơ sở "CS1", "CS2" cho codegen`. Parser **không** hardcode danh sách; nó nhận danh mục vào để giữ được tính "mở cơ sở mới = thêm data, không sửa code" (`CLAUDE.md` Don'ts).

```ts
// lib/ads/campaign-code.ts — THUẦN, không gọi DB, unit test không cần Postgres.
// Quy ước SR.QD.232. KHÔNG hardcode danh sách cơ sở — nhận `knownCodes` vào
// (nguồn: Center.code, prisma/schema.prisma:237) để mở CS3/CS4 không phải sửa file này.

/** Mã đặc biệt: campaign chạy chung nhiều cơ sở. BẮT BUỘC khai tỷ lệ ở D-07. */
export const MULTI_CENTER_CODE = "MULTI";

/** Nhóm gom chi tiêu không quy được về cơ sở nào — hiện trên UI đúng chữ này. */
export const UNALLOCATED_LABEL = "CHƯA PHÂN BỔ";

export type CampaignCodeParse =
  | { kind: "CENTER"; centerCode: string }
  | { kind: "MULTI" }
  | { kind: "UNKNOWN"; reason: "EMPTY" | "NO_PREFIX" | "CODE_NOT_FOUND"; token: string };

/**
 * Bóc mã cơ sở từ PREFIX tên campaign.
 *
 * Luật, theo đúng thứ tự:
 *  1. Cắt khoảng trắng hai đầu. Rỗng            -> UNKNOWN/EMPTY
 *  2. Tách bằng "_" — CHỈ "_", không tách bằng "-".
 *     Lý do: "-" được dùng BÊN TRONG trường theo chính ví dụ chuẩn ("ROBOTICS-L1");
 *     tách thêm "-" sẽ bẻ gãy đúng khuôn mà quy ước yêu cầu.
 *  3. Lấy token[0], bỏ khoảng trắng, viết HOA (nhận cả "cs1").
 *  4. Token = "MULTI"        -> MULTI
 *  5. Token ∈ knownCodes     -> CENTER
 *  6. Còn lại                -> UNKNOWN (phân biệt NO_PREFIX vs CODE_NOT_FOUND để D-08
 *     nói được "sai quy ước" khác với "mã lạ")
 *
 * KHÔNG đoán, KHÔNG khớp mờ, KHÔNG rơi về cơ sở mặc định. Đoán sai một campaign là
 * gán nhầm toàn bộ chi tiêu của nó sang cơ sở khác, và không ai phát hiện được.
 */
export function parseCenterCodeFromCampaignName(
  campaignName: string | null | undefined,
  knownCodes: ReadonlySet<string>,          // vd new Set(["CS1", "CS2"])
): CampaignCodeParse {
  const name = (campaignName ?? "").trim();
  if (name === "") return { kind: "UNKNOWN", reason: "EMPTY", token: "" };

  const parts = name.split("_");
  const token = parts[0].trim().toUpperCase();

  if (token === MULTI_CENTER_CODE) return { kind: "MULTI" };
  if (knownCodes.has(token)) return { kind: "CENTER", centerCode: token };

  // Không có dấu "_" nào => tên không theo quy ước chút nào.
  const reason = parts.length === 1 ? "NO_PREFIX" : "CODE_NOT_FOUND";
  return { kind: "UNKNOWN", reason, token };
}
```

**Bảng test-case bắt buộc** (`lib/ads/campaign-code.test.ts`), với `knownCodes = {"CS1","CS2"}`:

| # | Chuỗi vào | Kết quả | Vì sao |
|---|---|---|---|
| 1 | `CS1_LEAD_ROBOTICS-L1_VIDEO_0826_A03` | `CENTER "CS1"` | Ví dụ chuẩn của spec `:80` |
| 2 | `CS2_MESS_COMBO12_IMAGE_0826_B07` | `CENTER "CS2"` | Đúng quy ước |
| 3 | `MULTI_LEAD_ROBOSIM_VIDEO_0926_C01` | `MULTI` | Campaign chung — spec `:83` |
| 4 | `cs1_lead_robotics_video_0826_a03` | `CENTER "CS1"` | Viết thường vẫn nhận (`toUpperCase`) |
| 5 | `  CS1_LEAD_ROBOTICS_VIDEO_0826_A03  ` | `CENTER "CS1"` | Khoảng trắng hai đầu bị cắt |
| 6 | `CS1 _LEAD_ROBOTICS_VIDEO_0826_A03` | `CENTER "CS1"` | Khoảng trắng trong token bị cắt (`parts[0].trim()`) |
| 7 | `CS1` | `CENTER "CS1"` | Chỉ có mã — vẫn phân bổ được. Phần còn lại là kỷ luật đặt tên, không phải việc của parser |
| 8 | `CS3_LEAD_ROBOTICS_VIDEO_0826_A03` | `UNKNOWN "CODE_NOT_FOUND"` token `CS3` | Chưa mở CS3 ⇒ **CHƯA PHÂN BỔ**, không đoán. Mở CS3 trong `Center` là tự nhận |
| 9 | `LEAD_CS1_ROBOTICS_VIDEO_0826_A03` | `UNKNOWN "CODE_NOT_FOUND"` token `LEAD` | Mã **không** đứng đầu — spec `:83` bắt buộc đứng đầu |
| 10 | `CS1-LEAD-ROBOTICS-VIDEO-0826-A03` | `UNKNOWN "NO_PREFIX"` token `CS1-LEAD-…` | Dùng `-` thay `_`. **Cố ý không nhận** — xem chú thích luật 2 |
| 11 | `Cơ sở 1_LEAD_ROBOTICS_VIDEO_0826_A03` | `UNKNOWN "CODE_NOT_FOUND"` token `CƠ SỞ 1` | Có dấu tiếng Việt — spec `:83` cấm |
| 12 | `""` | `UNKNOWN "EMPTY"` | Tên rỗng |
| 13 | `"   "` | `UNKNOWN "EMPTY"` | Toàn khoảng trắng |
| 14 | `null` / `undefined` | `UNKNOWN "EMPTY"` | Meta có thể không trả `campaign_name` |
| 15 | `_CS1_LEAD_ROBOTICS` | `UNKNOWN "NO_PREFIX"`? → **`CODE_NOT_FOUND`** token `""` | `split("_")` cho `["", "CS1", …]`, token rỗng, `parts.length > 1` ⇒ `CODE_NOT_FOUND`. Không nhận — bắt đầu bằng dấu ngăn cách là sai quy ước |
| 16 | `MULTI` | `MULTI` | Chỉ mã MULTI, vẫn phải khai tỷ lệ ở D-07 |
| 17 | `multi_lead_robosim_0826` | `MULTI` | Viết thường |
| 18 | `CS1_` | `CENTER "CS1"` | Token đầu hợp lệ, đuôi rỗng — chấp nhận |

⚠️ **Điều kiện ngoài code:** spec `:216` ghi rõ — ban hành `SR.QD.232` cho Marketing **TRƯỚC** ngày bật job D-01. Bật trước khi phổ biến thì dữ liệu những ngày đầu **rơi hết** vào `CHƯA PHÂN BỔ`, và không có cách nào sửa ngược ngoài gán tay từng campaign ở D-07.

### D.6.6 **D-07 · Bảng mapping override**

```prisma
enum AdsMappingLevel {
  CAMPAIGN
  ADSET
}

/// D-07 — gán TAY campaign/ad set về cơ sở. ƯU TIÊN CAO HƠN parser (§D.6.5).
///
/// Một (level, entityId) có thể có NHIỀU dòng — mỗi dòng một cơ sở kèm tỷ lệ.
/// Đó chính là cách khai tỷ lệ cho campaign MULTI (spec :83 "BẮT BUỘC khai tỷ lệ").
/// Tổng ratioBp của cùng (level, entityId, khoảng hiệu lực) PHẢI = 10000.
model AdsCampaignMapping {
  id String @id @default(cuid())

  level    AdsMappingLevel
  /// campaignId khi level=CAMPAIGN, adsetId khi level=ADSET. Lấy từ Meta.
  entityId String
  /// Snapshot tên tại lúc gán — để màn quản trị đọc được mà không phải join snapshot.
  entityName String?

  centerId  String                         // NOT NULL: mapping là để CHỈ ĐÍCH, không để bỏ ngỏ
  orgUnitId String?                        // ghi kép — luật cứng #3

  /// Tỷ lệ phân bổ theo PHẦN VẠN (basis point): 10000 = 100%, 3000 = 30%.
  /// Dùng số nguyên để tổng luôn cộng khít — không dùng Float (bẫy B1 §D.6.3).
  ratioBp Int @default(10000)

  /// Khoảng hiệu lực — khuôn UserOrgRole. Sửa mapping từ hôm nay KHÔNG đụng số quá khứ
  /// (§D.6.1 đánh đổi 2). NULL ở effectiveTo = còn hiệu lực.
  effectiveFrom DateTime  @db.Date
  effectiveTo   DateTime? @db.Date

  note        String?
  createdById String?
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @db.Timestamptz(6)

  @@unique([level, entityId, centerId, effectiveFrom])
  @@index([level, entityId, effectiveFrom, effectiveTo])
  @@index([centerId])
  @@index([orgUnitId])
}
```

**🔴 Thứ tự ưu tiên — chốt tường minh, có test:**

```ts
// lib/reports/ads-spend.ts — resolver phân bổ. Thứ tự KHÔNG được đổi.
// 1. Override cấp AD SET     (cụ thể nhất — thắng tất cả)
// 2. Override cấp CAMPAIGN
// 3. Parser SR.QD.232 trên campaignName
// 4. Không ra gì            -> CHƯA PHÂN BỔ
//
// MULTI parse ra ở bước 3 mà KHÔNG có dòng mapping nào => CHƯA PHÂN BỔ.
// Cố ý: chia đều cho các cơ sở là ĐOÁN, và đoán sai thì không ai phát hiện.
export function resolveAllocation(
  row: { campaignId: string; campaignName: string; adsetId: string; statDate: Date },
  ctx: { mappings: AdsCampaignMapping[]; knownCodes: ReadonlySet<string>; codeToCenterId: Map<string, string> },
): { centerId: string; ratioBp: number }[] {          // [] = CHƯA PHÂN BỔ
  const active = (m: AdsCampaignMapping) =>
    m.effectiveFrom <= row.statDate && (m.effectiveTo === null || row.statDate <= m.effectiveTo);

  const adset = ctx.mappings.filter((m) => m.level === "ADSET" && m.entityId === row.adsetId && active(m));
  if (adset.length > 0) return adset.map((m) => ({ centerId: m.centerId, ratioBp: m.ratioBp }));

  const camp = ctx.mappings.filter((m) => m.level === "CAMPAIGN" && m.entityId === row.campaignId && active(m));
  if (camp.length > 0) return camp.map((m) => ({ centerId: m.centerId, ratioBp: m.ratioBp }));

  const parsed = parseCenterCodeFromCampaignName(row.campaignName, ctx.knownCodes);
  if (parsed.kind === "CENTER") {
    const id = ctx.codeToCenterId.get(parsed.centerCode);
    if (id) return [{ centerId: id, ratioBp: 10_000 }];
  }
  // MULTI chưa khai tỷ lệ, hoặc UNKNOWN => CHƯA PHÂN BỔ.
  return [];
}
```

**Ràng buộc tổng tỷ lệ** — ép ở Server Action, không ép được ở DB:

```ts
// Trước khi lưu mapping của một (level, entityId, effectiveFrom):
const total = rows.reduce((s, r) => s + r.ratioBp, 0);
if (total !== 10_000) {
  return { ok: false, error: `Tổng tỷ lệ phải bằng 100% (đang là ${(total / 100).toFixed(2)}%)` };
}
```

**Chia tiền theo tỷ lệ — bất biến tổng.** Nhân `spend × ratioBp / 10000` rồi làm tròn từng dòng sẽ **mất/thừa vài đồng**. Repo đã có tiền lệ chia tiền theo trọng số giữ bất biến tổng: `allocateByWeight` (`lib/finance/allocate.ts`, đã dùng ở `payment.ts:213`). **Dùng lại hàm đó**, đừng viết phép chia thứ hai.

**Bẫy của D-07.**

| # | Bẫy | Xử lý |
|---|---|---|
| B1 | 🔴 Tổng tỷ lệ ≠ 100% ⇒ **mất tiền im lặng** hoặc **đếm thừa** | Validate ở Server Action + unit test bất biến tổng: `Σ phần chia = spend` với mọi bộ tỷ lệ |
| B2 | Hai dòng mapping **chồng khoảng hiệu lực** cho cùng entity + center | `@@unique([level, entityId, centerId, effectiveFrom])` chặn trùng ngày bắt đầu, **không** chặn chồng khoảng. Phải validate ở Server Action |
| B3 | Sửa mapping làm số tháng trước đổi | Đã xử bằng `effectiveFrom/To`. UI phải nói rõ: *"áp dụng từ ngày …"* — mặc định là **hôm nay**, không phải đầu tháng |
| B4 | Đổi tên campaign trên Meta sau khi đã gán | Mapping neo theo `entityId` (ID Meta), **không** theo tên ⇒ đổi tên không ảnh hưởng. `entityName` chỉ để hiển thị |
| B5 | Xoá dòng mapping của campaign đã có chi tiêu lịch sử | **Không xoá** — đặt `effectiveTo = hôm qua`. Xoá làm lịch sử rơi về `CHƯA PHÂN BỔ` |
| B6 | Quyền | `AdsCampaignMapping` là dữ liệu theo đơn vị ⇒ mang `centerId` + `orgUnitId`, khai `SCOPED_MODELS` + `BACKFILL_SPECS`. Nhưng **ghi** chỉ Marketing HO / SUPER_ADMIN (`canEditAds`, `lib/crm/ads-insights.ts:44-49`) — vì gán một campaign cho CS1 là **lấy tiền khỏi** CS2 |

### D.6.7 Bảng chỉ tiêu ngân sách `AdsBudgetTarget` (D-02)

```prisma
/// D-02 — chỉ tiêu ngân sách quảng cáo theo tháng × cơ sở. Song sinh RevenueTarget (:6022)
/// và LeadTarget (§C.6.10). centerId = NULL ⇒ chỉ tiêu TOÀN HỆ THỐNG.
/// ⚠️ Khai SCOPE_EXEMPT, KHÔNG khai SCOPED_MODELS (cùng lý do RevenueTarget, lib/db-scope.ts:84-86).
model AdsBudgetTarget {
  id           String   @id @default(cuid())
  centerId     String?
  orgUnitId    String?
  period       String   // "YYYY-MM"
  targetAmount Int      // VND, số nguyên
  note         String?
  createdById  String?
  createdAt    DateTime @default(now()) @db.Timestamptz(6)
  updatedAt    DateTime @updatedAt @db.Timestamptz(6)

  @@unique([centerId, period])   // NULL DISTINCT — nhánh toàn hệ thống KHÔNG upsert được
  @@index([period])
  @@index([orgUnitId])
}
```

Toàn bộ bẫy của `RevenueTarget` áp lại nguyên si — xem §C.6.2 bẫy B1/B4 và `app/(admin)/admin/bao-cao/doanh-thu/_actions.ts:37-38,72-87`.

### D.6.8 Resolver đọc — hàm dùng chung

```ts
// lib/reports/ads-spend.ts — CỬA DUY NHẤT đọc AdsSpendSnapshot.
// Không màn nào được query bảng đó trực tiếp: quên DISTINCT ON là cộng 7 lần
// cùng một khoản (§D.6.2 mục 4).
export type AdsSpendByCenter = {
  byCenter: { centerId: string; spend: number }[];
  unallocated: { spend: number; campaigns: { campaignId: string; campaignName: string; spend: number }[] };
  total: number;   // = Σ byCenter + unallocated. Bất biến tổng — có test.
};
```

### D.6.9 — **D1 · Ngân sách thực tế theo cơ sở**

**Định nghĩa bằng lời.** Tổng số tiền **thực chi** cho quảng cáo trong khoảng ngày đang chọn, quy về từng cơ sở theo thứ tự ưu tiên §D.6.6. Phần không quy được về cơ sở nào gom vào nhóm `CHƯA PHÂN BỔ` và **hiển thị riêng**, không cộng vào cơ sở nào và **không** bị giấu đi.

**Nguồn dữ liệu.**

| Thứ | Bảng · cột |
|---|---|
| Số tiền | `AdsSpendSnapshot.spend` (Int, đồng) — **bản `fetchedAt` mới nhất** của mỗi `(statDate, level, campaignId, adsetId)` |
| Trục ngày | `AdsSpendSnapshot.statDate` (`@db.Date`) — ngày của **tài khoản quảng cáo** (bẫy B3 §D.6.3) |
| Phân bổ | `AdsCampaignMapping` (override) → parser `campaignName` (§D.6.5) |

**Truy vấn SQL.**

```sql
-- D1 · Ngân sách thực tế theo cơ sở.
-- $1 = centerIds text[] (NULL = toàn phạm vi) · $2 = dateFrom date · $3 = dateTo date (NỬA MỞ)
WITH latest AS (
  -- DISTINCT ON: mỗi khoá tự nhiên chỉ lấy BẢN ĐO MỚI NHẤT. Bỏ bước này = cộng
  -- 7 lần cùng một khoản (job quét lại 7 ngày — §D.6.2 mục 3).
  SELECT DISTINCT ON (s."statDate", s."level", s."campaignId", s."adsetId")
         s."statDate", s."campaignId", s."campaignName", s."adsetId", s."spend"
  FROM "AdsSpendSnapshot" s
  WHERE s."statDate" >= $2 AND s."statDate" < $3
  ORDER BY s."statDate", s."level", s."campaignId", s."adsetId", s."fetchedAt" DESC
),
alloc AS (
  -- Ưu tiên: ADSET override > CAMPAIGN override > parser. Parser làm ở tầng ứng dụng
  -- (§D.6.5) nên ở SQL chỉ ghép hai mức override; dòng không khớp -> centerId NULL,
  -- ứng dụng chạy parser cho phần còn lại. Ranh giới này CỐ Ý: quy ước đặt tên là
  -- luật nghiệp vụ, không nhét vào SQL.
  SELECT
    l."statDate", l."campaignId", l."campaignName", l."adsetId", l."spend",
    COALESCE(ma."centerId", mc."centerId")            AS center_id,
    COALESCE(ma."ratioBp",  mc."ratioBp", 10000)      AS ratio_bp,
    CASE WHEN ma."centerId" IS NOT NULL THEN 'OVERRIDE_ADSET'
         WHEN mc."centerId" IS NOT NULL THEN 'OVERRIDE_CAMPAIGN'
         ELSE 'NEEDS_PARSER' END                      AS alloc_source
  FROM latest l
  LEFT JOIN "AdsCampaignMapping" ma
    ON ma."level" = 'ADSET' AND ma."entityId" = l."adsetId"
   AND ma."effectiveFrom" <= l."statDate"
   AND (ma."effectiveTo" IS NULL OR l."statDate" <= ma."effectiveTo")
  LEFT JOIN "AdsCampaignMapping" mc
    ON mc."level" = 'CAMPAIGN' AND mc."entityId" = l."campaignId"
   AND ma."centerId" IS NULL                            -- chỉ dùng khi KHÔNG có override adset
   AND mc."effectiveFrom" <= l."statDate"
   AND (mc."effectiveTo" IS NULL OR l."statDate" <= mc."effectiveTo")
)
SELECT
  center_id,
  -- Nhân tỷ lệ TRƯỚC khi cộng; làm tròn ở tầng ứng dụng bằng allocateByWeight
  -- (lib/finance/allocate.ts — xem cách dùng ở payment.ts:213) để giữ bất biến tổng.
  sum(spend * ratio_bp)::bigint / 10000 AS spend_alloc,
  sum(spend)::bigint                    AS spend_raw
FROM alloc
WHERE ($1::text[] IS NULL OR center_id = ANY($1) OR center_id IS NULL)
GROUP BY center_id
ORDER BY center_id NULLS LAST;   -- NULL = CHƯA PHÂN BỔ (+ dòng cần parser), hiện CUỐI
```

**Truy vấn Prisma tương đương.**

```ts
// AdsSpendSnapshot ∈ SCOPE_EXEMPT (§D.6.3) ⇒ scopedDb là pass-through: KHÔNG có
// cách ly tự động ở đây. Cách ly nằm ở resolver — bắt buộc lọc `effective` sau khi
// phân bổ, KHÔNG trước.
export async function getAdsSpendByCenter(actor: Actor, f: ScopeFilters): Promise<AdsSpendByCenter> {
  const sdb = scopedDb(actor);
  const effective = effectiveCenterIds(actor, f);   // như §C.6.1

  const [rows, mappings, centers] = await Promise.all([
    // Prisma KHÔNG có DISTINCT ON. Hai lối: (a) $queryRaw như SQL trên;
    // (b) fetch rồi rút bản mới nhất ở bộ nhớ. Ở quy mô này (b) chấp nhận được.
    sdb.adsSpendSnapshot.findMany({
      where: { statDate: { gte: f.dateFrom, lt: f.dateTo } },
      orderBy: { fetchedAt: "desc" },
      select: {
        statDate: true, level: true, campaignId: true, campaignName: true,
        adsetId: true, spend: true, fetchedAt: true,
      },
      take: 50_000,
    }),
    sdb.adsCampaignMapping.findMany({
      where: {
        effectiveFrom: { lte: f.dateTo },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: f.dateFrom } }],
      },
    }),
    sdb.center.findMany({ where: { isActive: true }, select: { id: true, code: true } }),
  ]);

  // Rút bản mới nhất theo khoá tự nhiên — orderBy fetchedAt desc nên bản đầu tiên thắng.
  const seen = new Set<string>();
  const latest = rows.filter((r) => {
    const k = `${r.statDate.toISOString()}|${r.level}|${r.campaignId}|${r.adsetId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const knownCodes = new Set(centers.map((c) => c.code).filter((c): c is string => !!c));
  const codeToCenterId = new Map(centers.filter((c) => c.code).map((c) => [c.code!, c.id]));

  return aggregateAdsSpend(latest, { mappings, knownCodes, codeToCenterId, effective }); // THUẦN
}
```

**Giả định.**

- Một tài khoản quảng cáo (`META_AD_ACCOUNT_ID`, `lib/crm/ads-insights.ts:85`). Nhiều tài khoản thì `accountId` đã có sẵn cột, nhưng job phải lặp qua danh sách — chưa làm ở v1.
- Meta trả `spend` theo **VND**. Nếu tài khoản đặt USD thì mọi con số sai 25.000 lần. Kiểm `currency` của ad account **một lần** khi bật và **chặn job** nếu khác `VND` — thà không có số còn hơn có số sai 25.000 lần.

**Bẫy.**

| # | Bẫy | Xử lý |
|---|---|---|
| B1 | 🔴 **Quên `DISTINCT ON`** ⇒ cộng 7 lần cùng một khoản | Chỉ đọc bảng qua `lib/reports/ads-spend.ts`. Unit test: 3 snapshot cùng khoá → tổng = 1 lần |
| B2 | 🔴 **`CHƯA PHÂN BỔ` bị lọc mất** khi người dùng chọn cơ sở cụ thể | SQL trên giữ `OR center_id IS NULL`. Nhưng phải hiện **tách riêng**, **không** cộng vào cơ sở đang chọn. Đây là ranh giới mỏng — có e2e |
| B3 | Làm tròn tỷ lệ mất/thừa vài đồng | Dùng `allocateByWeight` (`lib/finance/allocate.ts`, dùng ở `lib/finance/payment.ts:213`) — đã có, đã test bất biến tổng |
| B4 | 🔴 Tiền tệ / múi giờ của ad account khác VN | Chặn job nếu `currency ≠ VND`; ghi `timezone_name` vào tài liệu vận hành (bẫy B3 §D.6.3) |
| B5 | Cách ly cơ sở **không** tự động (bảng SCOPE_EXEMPT) | Resolver **bắt buộc** lọc theo `effective`. e2e: actor CS1 gọi resolver không nhận được đồng nào của CS2 |
| B6 | Chỉ số | `@@index([statDate, campaignId])` phục vụ `DISTINCT ON`; `@@index([level, entityId, effectiveFrom, effectiveTo])` phục vụ join mapping |

### D.6.10 — **D2 · CPL**

**Định nghĩa bằng lời.** Trung bình mỗi **học sinh** vào phễu tốn bao nhiêu tiền quảng cáo. **Tử số** = D1 (ngân sách thực tế của phạm vi + kỳ). **Mẫu số** = C1 (tổng lead, đếm **học sinh** — CHUNG-2). Mẫu số = 0 ⇒ trả `null`, **không** trả 0.

**Nguồn dữ liệu.** Tử: `AdsSpendSnapshot` qua §D.6.9. Mẫu: `LeadChild` qua §C.6.1.

**Truy vấn SQL.**

```sql
-- D2 · CPL theo cơ sở. GHÉP hai vế đã lọc CÙNG phạm vi + CÙNG kỳ.
-- ⚠️ Hai vế dùng hai trục ngày khác nhau về BẢN CHẤT:
--    - spend theo statDate (lịch tài khoản quảng cáo)
--    - lead  theo LeadChild.createdAt (giờ VN)
--    Lệch vài giờ ở biên kỳ là CHẤP NHẬN ĐƯỢC và phải ghi trong tooltip.
WITH spend AS (
  -- DÁN NGUYÊN hai CTE `latest` + `alloc` của D1 (§D.6.9) vào trước khối WITH này,
  -- rồi lấy kết quả nhóm theo center_id. KHÔNG viết lại phép DISTINCT ON ở đây —
  -- viết lại là có hai bản công thức và đến ngày lệch nhau không ai biết chỗ nào đúng.
  SELECT center_id, sum(spend * ratio_bp)::bigint / 10000 AS spend_alloc
  FROM alloc GROUP BY center_id
),
leads AS (
  SELECT l."centerId" AS center_id, count(*)::int AS lead_count
  FROM "LeadChild" lc
  JOIN "Lead" l ON l.id = lc."leadId"
  WHERE l."deletedAt" IS NULL
    AND lc."createdAt" >= $2 AND lc."createdAt" < $3
    AND ($1::text[] IS NULL OR l."centerId" = ANY($1))
  GROUP BY l."centerId"
)
SELECT
  COALESCE(s.center_id, g.center_id)  AS center_id,
  COALESCE(s.spend_alloc, 0)          AS spend,
  COALESCE(g.lead_count, 0)           AS lead_count,
  CASE WHEN COALESCE(g.lead_count, 0) = 0 THEN NULL          -- chia-0 -> NULL, KHÔNG 0
       ELSE round(COALESCE(s.spend_alloc, 0)::numeric / g.lead_count, 0) END AS cpl
FROM spend s
FULL OUTER JOIN leads g ON g.center_id = s.center_id
ORDER BY 1 NULLS LAST;
```

**Truy vấn Prisma tương đương.**

```ts
export async function getCpl(actor: Actor, f: ScopeFilters) {
  const [spend, leads] = await Promise.all([
    getAdsSpendByCenter(actor, f),   // §D.6.9
    countLeadStudentsByCenter(actor, f), // biến thể GROUP BY của §C.6.1
  ]);
  return computeCostPerUnit(spend, leads); // THUẦN — chia-0 trả null
}

/** THUẦN. Chia-0 trả null (KHÁC computeCpl hiện tại — xem bẫy B1). */
export function computeCostPerUnit(spend: number, units: number): number | null {
  return units > 0 ? spend / units : null;
}
```

**Bẫy.**

| # | Bẫy | Xử lý |
|---|---|---|
| B1 | 🔴 **`computeCpl` hiện tại trả 0 khi mẫu số = 0** — `lib/crm/marketing-metrics.ts:21` `ratio = (n, d) => d > 0 ? n / d : 0`. "CPL = 0đ" đọc như *quảng cáo miễn phí*, trong khi sự thật là *không có lead* | Hàm mới trả `null`; UI hiện `—`. **Không** tái dùng `computeCpl`/`computeCpa` cũ |
| B2 | 🔴 Mẫu số hiện tại là `qualifiedAt IS NOT NULL` (`funnel-query.ts:13`) — trường **gần như rỗng** (§C.2.4) | D2 dùng **C1**. Ghi vào tài liệu rằng con số này **khác** CPL trên `/admin/marketing/funnel` |
| B3 | Chi phí `CHƯA PHÂN BỔ` có vào CPL không? | **Không** vào CPL của cơ sở nào. Hiện thêm một dòng "CPL toàn hệ thống (gồm cả chưa phân bổ)" để người đọc thấy khoảng cách |
| B4 | Lệch trục ngày giữa hai vế | Ghi trong tooltip. **Không** tự quy đổi múi giờ ad account |

### D.6.11 — **D3 · CPA**

**Định nghĩa bằng lời.** Trung bình mỗi **học sinh chốt thành công** tốn bao nhiêu tiền quảng cáo. **Tử số** = D1. **Mẫu số** = số học sinh **đã chốt** theo §C.6.0, **cùng phạm vi và cùng kỳ**. Mẫu số = 0 ⇒ `null`.

**Trục ngày của mẫu số:** dùng **`closedAt`** (chốt trong kỳ), không dùng `createdAt`. Lý do: CPA trả lời *"tháng này tiêu X đồng và mang về Y khách"* — Y là khách **chốt trong tháng**. Ghi rõ vì nó **khác** mẫu số của C3 (lứa theo `createdAt`).

**Truy vấn SQL.**

```sql
-- D3 · CPA theo cơ sở.
WITH spend AS (
  -- DÁN NGUYÊN hai CTE `latest` + `alloc` của D1 (§D.6.9) vào trước khối WITH này,
  -- rồi lấy kết quả nhóm theo center_id. KHÔNG viết lại phép DISTINCT ON ở đây —
  -- viết lại là có hai bản công thức và đến ngày lệch nhau không ai biết chỗ nào đúng.
  SELECT center_id, sum(spend * ratio_bp)::bigint / 10000 AS spend_alloc
  FROM alloc GROUP BY center_id
),
closed AS (
  SELECT COALESCE(lc."centerId", l."centerId") AS center_id, count(*)::int AS closed_count
  FROM "LeadChild" lc
  JOIN "Lead" l ON l.id = lc."leadId"
  WHERE l."deletedAt" IS NULL
    AND lc."status" = 'ENROLLED' AND lc."closedAt" IS NOT NULL     -- §C.6.0
    AND lc."closedAt" >= $2 AND lc."closedAt" < $3                 -- trục = NGÀY CHỐT
    AND ($1::text[] IS NULL OR COALESCE(lc."centerId", l."centerId") = ANY($1))
  GROUP BY 1
)
SELECT
  COALESCE(s.center_id, c.center_id) AS center_id,
  COALESCE(s.spend_alloc, 0)         AS spend,
  COALESCE(c.closed_count, 0)        AS closed_count,
  CASE WHEN COALESCE(c.closed_count, 0) = 0 THEN NULL
       ELSE round(COALESCE(s.spend_alloc, 0)::numeric / c.closed_count, 0) END AS cpa
FROM spend s
FULL OUTER JOIN closed c ON c.center_id = s.center_id
ORDER BY 1 NULLS LAST;
```

**Truy vấn Prisma tương đương.** Như D2, thay `countLeadStudentsByCenter` bằng `countClosedChildrenByCenter` (biến thể `GROUP BY` của §C.6.3, lọc `closedAt` trong kỳ).

**Giả định.** Chi tiêu tháng này và khách chốt tháng này **không** phải cùng một lứa — lead chốt tháng 9 phần lớn tốn tiền quảng cáo tháng 7–8. CPA vì thế là chỉ số **theo dõi xu hướng**, không phải phép tính chi phí thật của từng khách. Phải ghi câu này lên tooltip, nếu không BGĐ sẽ dùng nó để ra quyết định sai.

**Bẫy.**

| # | Bẫy | Xử lý |
|---|---|---|
| B1 | 🔴 **Trễ chuyển đổi.** Kỳ tăng ngân sách mạnh làm CPA vọt lên dù không có gì xấu | Hiện kèm CPA của kỳ **dịch lùi** theo `p90Days` của C4 (*"CPA điều chỉnh theo độ trễ chốt"*). Rule-based, không AI (`CLAUDE.md` Don'ts) |
| B2 | Mẫu số D3 (`closedAt` trong kỳ) **khác** mẫu số C3 (lứa `createdAt`) | Cố ý. Ghi trong tooltip cả hai chỗ, nếu không sẽ bị coi là bug |
| B3 | Chia-0 trả 0 | Như D2 bẫy B1 |

### D.6.12 — **D-08 · Cảnh báo `CHƯA PHÂN BỔ`**

**Định nghĩa bằng lời.** Nếu trong khoảng ngày đang xem có **bất kỳ đồng nào** không quy được về cơ sở, hiện cảnh báo ngay đầu tab D: **số tiền** · **số campaign** · **link tới màn D-07 để gán**. Không có thì không hiện gì.

```sql
-- D-08 · Chi tiêu CHƯA PHÂN BỔ trong range. Chạy trên kết quả CTE `alloc` của D1.
SELECT
  sum(spend)::bigint       AS unallocated_spend,
  count(DISTINCT "campaignId")::int AS unallocated_campaigns,
  array_agg(DISTINCT "campaignName" ORDER BY "campaignName") FILTER (WHERE "campaignName" <> '')
                           AS campaign_names
FROM alloc
WHERE center_id IS NULL;    -- không override, và parser cũng không ra gì
HAVING sum(spend) > 0;
```

```tsx
// Tab D — banner. Ngôn ngữ phải nói ĐƯỢC VIỆC: bao nhiêu tiền, bao nhiêu campaign, sửa ở đâu.
{unallocated.spend > 0 && (
  <div className="rounded-lg border border-state-warning-soft bg-state-warning-soft p-3 text-sm text-state-warning-ink">
    <strong>{formatVnd(unallocated.spend)}</strong> chi tiêu chưa quy được về cơ sở nào
    ({unallocated.campaigns.length} chiến dịch). Số này <strong>không</strong> nằm trong
    CPL/CPA của bất kỳ cơ sở nào.{" "}
    <Link href="/marketing/phan-bo-chien-dich" className="underline">Gán cơ sở</Link>
  </div>
)}
```

**Bẫy.**

| # | Bẫy | Xử lý |
|---|---|---|
| B1 | 🔴 **Cảnh báo mà không nói được làm gì tiếp** ⇒ sau hai tuần ai cũng bỏ qua | Banner phải có **link trực tiếp** tới màn gán, và màn đó mở sẵn danh sách campaign chưa phân bổ của đúng range |
| B2 | Ngày đầu bật job, **100%** rơi vào `CHƯA PHÂN BỔ` (Marketing chưa đổi tên campaign) | Đây là lý do spec `:216` bắt ban hành `SR.QD.232` **trước**. Nếu vẫn bật trước: chấp nhận và gán tay ở D-07, **đừng** viết script đoán |
| B3 | `MULTI` chưa khai tỷ lệ trông giống "sai tên" | Tách hai nhóm trong banner: *"chưa khai tỷ lệ (MULTI)"* và *"tên không theo quy ước"* — parser đã trả `kind`/`reason` phân biệt được (§D.6.5) |

---

## D.7 Open Questions

| # | Câu hỏi | Vì sao chặn | Chủ | Hạn |
|---|---|---|---|---|
| **OQ-D1** | 🔴 `SR.QD.232` đã ban hành cho team Marketing chưa? Ngày áp dụng? | Spec `:216`: bật D-01 trước khi phổ biến thì dữ liệu những ngày đầu **rơi hết** vào `CHƯA PHÂN BỔ` và chỉ sửa được bằng gán tay | Chủ dự án + Marketing | **Trước khi bật job** |
| **OQ-D2** | 🔴 Ad account Meta đặt **tiền tệ** gì và **múi giờ** gì? | Tiền tệ khác VND ⇒ mọi con số sai ~25.000 lần. Múi giờ khác VN ⇒ `statDate` lệch với trục ngày của B5 | Marketing | Trước khi bật job |
| **OQ-D3** | Có bao nhiêu ad account? Một hay nhiều? | `syncMetaAds` hiện đọc **một** `META_AD_ACCOUNT_ID` (`ads-insights.ts:85`). Nhiều tài khoản thì job phải lặp | Marketing | Trước khi code job |
| **OQ-D4** | 🔴 Token Meta là loại gì (Page / System User / long-lived User) và hết hạn bao lâu? | Quyết định có cần `meta-token-refresh` không, và refresh kiểu gì. **Không** có cơ chế nào hôm nay (`vercel.json` chỉ có `zalo-token-refresh` `:40-43`) ⇒ token hết hạn là job chết im | Dev + Marketing | Trước khi bật job |
| **OQ-D5** | Vai `MARKETING` cấp cơ sở có được sửa mapping D-07 không? | `canEditAds` (`lib/crm/ads-insights.ts:44-49`) hiện chỉ `isSuperAdmin` **hoặc** `HO_MARKETING`. Gán campaign cho CS1 là **lấy tiền khỏi** CS2 ⇒ PRD nghiêng về **giữ nguyên** (chỉ HO) | Chủ dự án | Trước khi code D-07 |
| **OQ-D6** | Đơn vị chi tiết nhất là **campaign** hay **ad set**? | Ảnh hưởng `level` khi gọi Meta và dung lượng bảng. PRD đề xuất `level=adset` (chi tiết hơn, gộp lên campaign lúc đọc luôn được; ngược lại thì không) | Marketing | Trước khi code job |
| **OQ-D7** | Có cần "chốt sổ" chi phí quảng cáo theo tháng không? | Nếu có, sửa mapping sau khi chốt **không** được đổi số quá khứ ⇒ cần bảng `AdsSpendLocked` (§D.6.1). Additive, làm sau được | Kế toán | Trước khi B đóng sổ |
| **OQ-D8** | Chi phí marketing **ngoài Meta** (tờ rơi, sự kiện, KOL) đi đường nào? | PRD đề xuất: đi qua **bảng chi phí của B** (§B.6.2), **không** nhét vào bảng ads — nếu không B3 trừ hai lần | Chủ dự án | Trước khi code B2 |
| **OQ-D9** | `/admin/marketing/funnel` cũ: sửa hay bỏ? | Non-Goal 5 chọn **không sửa, treo banner**. Nhưng để lâu thì có hai trang nói hai số | Chủ dự án | Sau khi tab D chạy |

---

## D.8 Timeline & Phasing

| Bước | Nội dung | Phụ thuộc | Ghi chú |
|---|---|---|---|
| **D.0** | Trả lời **OQ-D1, OQ-D2, OQ-D4, OQ-D6** | — | 🔴 OQ-D2 chặn cứng: sai tiền tệ thì mọi con số vô nghĩa |
| **D.1** | Ban hành `SR.QD.232` cho Marketing, có ngày áp dụng | D.0 | **Việc ngoài code.** Spec `:216` |
| **D.2** | Test đỏ trước: parser 18 ca (§D.6.5) · thứ tự ưu tiên D-07 · `DISTINCT ON` không cộng trùng · bất biến tổng khi chia tỷ lệ | D.0 | Luật cứng Nền Hệ thống #5 |
| **D.3** | Migration additive: `AdsSpendSnapshot` + `AdsCampaignMapping` + `AdsBudgetTarget` + 2 enum. Khai `SCOPE_EXEMPT` / `SCOPED_MODELS` / `BACKFILL_SPECS` cùng lúc | D.2 | **Additive toàn bộ.** KHÔNG đụng `AdsInsightDaily` / `MarketingCostPeriod` |
| **D.4** | `lib/ads/campaign-code.ts` (parser) + `lib/ads/meta-client.ts` (token qua **header**) | D.2 | 🔴 Vá lỗ hổng token (`ads-insights.ts:93`) ngay ở bước này |
| **D.5** | Job D-01: `lib/ads/sync.ts` + `app/api/cron/ads-sync/route.ts` + mục thứ 24 trong `vercel.json` | D.3 + D.4 | Kèm cơ chế tự tố cáo (§D.6.2 mục 5) |
| **D.6** | Màn D-07 (gán mapping, tab "Chưa phân bổ") | D.3 | Ràng buộc tổng tỷ lệ = 100% |
| **D.7** | `lib/reports/ads-spend.ts` (resolver) + D1 | D.5 + D.6 | Cửa **duy nhất** đọc snapshot |
| **D.8** | D-02/D-03 (chỉ tiêu + % thực tế/chỉ tiêu) · D2 (CPL) · D3 (CPA) | D.7 + **C.7** | 🔴 CPL/CPA **không** chạy trước khi C1/C3 chốt |
| **D.9** | D-08 cảnh báo chưa phân bổ + banner trên `/admin/marketing/funnel` (D-00-2) | D.7 | Banner là một dòng JSX — làm sớm được |
| **D.10** | Cập nhật `documentation/` + liệt kê file đổi, rồi **DỪNG** | D.3–D.9 | Luật cứng Nền Hệ thống #10 |

**Ràng buộc môi trường.**

- 🔴 **Không test được đầy đủ trên `test.satarobo.vn`.** Cùng họ với điểm mù ZNS đã ghi trong `CLAUDE.md`: creds nhà cung cấp chỉ có ở scope Production. Nếu `META_PAGE_ACCESS_TOKEN` chỉ ở Production thì trên test job D-01 luôn ném `META_CREDENTIALS_MISSING` (`ads-insights.ts:87`). Nghiệm thu parser + resolver + phân bổ bằng **fixture**; khâu gọi Meta thật chỉ smoke được trên prod sau merge.
- **Cron không chạy trên custom environment** của Vercel — repo đã có `cron-pump-test.yml` bơm 2 job. Nếu muốn test D-01 trên `test`, phải thêm nó vào workflow bơm.
- `test.satarobo.vn` và máy local **dùng chung một DB** (`CLAUDE.md`) — mọi migration của D là additive nên an toàn.

---

# PRD B — KHU VỰC B: Dashboard / Tab Tài chính

**Phạm vi:** B-01 → B-05. Không mở sang A/C/D/E/F/G.
**Phụ thuộc cứng:** PRD D (chi phí quảng cáo là một đầu phí của B2) · PRD C (cột "% trên tổng doanh thu" của C-03 lấy mẫu số từ B1) · `docs/prd/A-nen-tang.md` §6.2 + §10.4.

---

## B.1 Executive Summary

Tab Tài chính hiện đúng **6** con số (spec `:23-24`): **Mục tiêu · Doanh thu · Tỷ lệ hoàn thành** ở hàng 1; **Chi phí · Lợi nhuận · Dòng tiền** ở hàng 2. Cộng bảng doanh thu **theo ngày** (B-04) và màn nhập chi phí bằng **file mẫu** (B-05).

**Tình trạng thật: 1 trên 6 con số tính được hôm nay.**

| Con số | Được? | Vì sao |
|---|---|---|
| Doanh thu (B1) | ✅ | Có sổ `Payment`, có 3 chỗ đang tính — nhưng lặp 3 lần và **bỏ sót hoàn tiền + điều chỉnh** |
| Mục tiêu (B6) | ⚠️ | Có `RevenueTarget` (`prisma/schema.prisma:6022`), nhưng hàm đọc **bỏ qua mục tiêu từng cơ sở** khi actor cấp HO |
| Tỷ lệ hoàn thành (B6) | ⚠️ | Kéo theo B6 |
| **Chi phí (B2)** | ❌ | 🔴 Hệ thống **không có khái niệm "chi"**. 207 model trong `prisma/schema.prisma`, grep `expense` toàn `lib/` + `app/` + `prisma/` = **0 kết quả** |
| **Lợi nhuận (B3)** | ❌ | Thiếu vế trừ |
| **Dòng tiền (B4)** | ❌ | Thiếu vế trừ; và vế "thu" hiện có **ba** nghĩa khác nhau |
| **Doanh thu theo ngày (B-04/B5)** | ❌ | 🔴 **Chưa từng có trục NGÀY.** Mọi báo cáo tiền gom theo **tháng** qua `monthKeyVN` (`lib/reports/lead.ts:87-90`). `dateKeyVN` (`:93-96`) có sẵn nhưng chỉ dùng cho lead |

**Ba quyết định nặng nhất:**

| # | Quyết định | Hệ quả |
|---|---|---|
| 1 | 🔴 **CHỌN sổ `Payment` làm nguồn doanh thu** (CHUNG-1) | Số của tab B sẽ **KHÁC** dashboard kế toán và **KHÁC** mẫu số ROAS — hai chỗ đó dùng `Order.totalAmount`. §B.2.2 |
| 2 | 🔴 **Doanh thu tính THUẦN**, có trừ hoàn tiền và thay bản gốc bằng bản điều chỉnh | Số sẽ **thấp hơn** con số 3 màn hiện tại đang hiện. §B.6.1 |
| 3 | 🔴 **Phải xây bảng chi phí trước khi có B2/B3/B4** | Không phải "thêm màn hình", mà là thêm một khái niệm nghiệp vụ chưa từng có. §B.6.2 |

---

## B.2 Background & Context

### B.2.1 "Thực thu" trong mã hôm nay

Định nghĩa đang chạy: `Payment { accountantStatus: "CONFIRMED", deletedAt: null }`, trục thời gian = **`paidDate`** (không phải `confirmedAt`, không phải `createdAt`).

Lặp **Y HỆT ở 3 chỗ**, **không có helper dùng chung cho phần `WHERE`**:

```ts
// 1) app/(admin)/admin/bao-cao/doanh-thu/page.tsx:63-74
sdb.payment.findMany({
  where: {
    accountantStatus: "CONFIRMED",
    deletedAt: null,
    ...(filters.centerId ? { centerId: filters.centerId } : {}),
    ...(dateWhere ? { paidDate: dateWhere } : {}),
  },
  select: { amount: true, centerId: true, paidDate: true },
  take: 50_000,
})

// 2) app/(admin)/admin/dashboard/_components/manager-dashboard.tsx:93-95
sdb.payment.findMany({
  where: { accountantStatus: "CONFIRMED", deletedAt: null, paidDate: { gte: sixMonthsAgo } },
  select: { amount: true, centerId: true, paidDate: true },
  take: 50_000,
})

// 3) app/(admin)/admin/bao-cao/trung-tam/page.tsx:331-343 — kéo MỌI trạng thái rồi
//    lọc accountantStatus ở tầng hàm thuần (select có accountantStatus: true, :339)
```

Phần **tính** thì có dùng chung: `buildRevenueTargetReport` (`lib/reports/revenue-target.ts:52-74`) gom theo `monthKeyVN(p.paidDate)` (`:58`). Nhưng phần **lọc** thì mỗi chỗ tự viết ⇒ đổi định nghĩa phải sửa 3 nơi và rất dễ sót.

### B.2.2 🔴 CÓ HAI ĐỊNH NGHĨA DOANH THU CHẠY SONG SONG

| | **(a) Sổ `Payment`** | **(b) Sổ `Order`** |
|---|---|---|
| Điều kiện | `accountantStatus = 'CONFIRMED'`, `deletedAt IS NULL` | `status IN ('CONFIRMED','COMPLETED')` |
| Trục thời gian | `Payment.paidDate` | `Order.paidAt` |
| Dùng ở | `bao-cao/doanh-thu/page.tsx:63-74` · `manager-dashboard.tsx:93-95` · `bao-cao/trung-tam/page.tsx:334` | `accountant-dashboard.tsx:26-31` (`PAID_STATUSES = ["CONFIRMED","COMPLETED"]`, `:9`) · `lib/crm/funnel-query.ts:17-20` (**mẫu số ROAS**) |
| Nghĩa | **Tiền đã được kế toán xác nhận** | **Giá trị đơn đã chốt** |

🔴 **HAI SỐ NÀY KHÔNG BAO GIỜ BẰNG NHAU.** Ca điển hình: đơn đã `CONFIRMED` nhưng kế toán chưa xác nhận khoản thu ⇒ **(b) tính đủ giá trị đơn, (a) tính 0**. Ngược lại, đơn trả góp đã thu đợt 1 thì (a) tính phần đã thu, (b) tính **toàn bộ** giá trị đơn ngay từ đầu.

Trên **cùng một dashboard**, `manager-dashboard` (a) và `accountant-dashboard` (b) đang hiện hai con số cho cùng một chữ "doanh thu".

⇒ **CHUNG-1: PRD này chọn (a).** Spec `:28-29` chốt *"ghi nhận theo thực thu… không tính giá trị hợp đồng chưa thu"* — (b) chính là giá trị hợp đồng. **Hệ quả bắt buộc nói ra:** khi tab B lên, người dùng sẽ thấy hai con số khác nhau giữa tab B và dashboard kế toán, và ROAS ở `/admin/marketing/funnel` vẫn đang dùng (b). Phải chọn một trong hai đường:

- **Đường 1 — thống nhất:** đổi `accountant-dashboard.tsx:26-31` và `funnel-query.ts:17-20` sang (a). Rủi ro: số của kế toán và ROAS **tụt** ngay lập tức, phải báo trước.
- **Đường 2 — đổi tên:** giữ nguyên hai chỗ đó nhưng **đổi nhãn** thành *"Giá trị đơn đã chốt"* / *"ROAS theo giá trị đơn"*, để không ai nhầm với "doanh thu".

PRD nghiêng về **Đường 2** ở v1 (rẻ, không đụng logic tiền), và Đường 1 ở giai đoạn sau — xem **OQ-B1**.

### B.2.3 🔴 HOÀN TIỀN KHÔNG TRỪ DOANH THU

`refundPayment` tạo **bản ghi mới** với `amount` **ÂM** và `accountantStatus = "REFUNDED"` (`lib/finance/payment.ts:617-632`):

```ts
// lib/finance/payment.ts:618-632
const ref = await tx.payment.create({
  data: {
    orderId: original.orderId,
    enrollmentId: original.enrollmentId,
    amount: negative,                       // ← số ÂM (:601 `const negative = -refundAbs`)
    paidDate: now,                          // ← :623 ngày HOÀN, không phải ngày thu gốc
    accountantStatus: "REFUNDED",           // ← :626
    adjustmentOfId: original.id,            // ← :629
    centerId: original.centerId,
  },
});
```

Vì cả 3 chỗ ở §B.2.1 lọc **chính xác** `accountantStatus = "CONFIRMED"`, dòng `REFUNDED` **bị loại hoàn toàn** ⇒ **hoàn tiền không làm giảm doanh thu ở bất kỳ báo cáo nào.**

### B.2.4 🔴 BẢN ĐIỀU CHỈNH CŨNG BỊ LOẠI — và bản gốc vẫn được tính

`adjustPayment` tạo bản ghi mới `accountantStatus = "ADJUSTED"`, **chép lại `paidDate` của bản gốc** và **không đổi trạng thái bản gốc** (`lib/finance/payment.ts:543-557`):

```ts
// lib/finance/payment.ts:544-557
const adj = await tx.payment.create({
  data: {
    orderId: original.orderId,
    amount,                                 // ← số ĐÚNG sau điều chỉnh
    paidDate: original.paidDate,            // ← :548 CHÉP LẠI ngày của bản gốc
    accountantStatus: "ADJUSTED",           // ← :550
    adjustmentOfId: original.id,            // ← :554
  },
});
// Bản GỐC: chỉ bị "touch" updatedAt để chốt lock (:535-541), accountantStatus GIỮ NGUYÊN.
```

⇒ Sau một lần điều chỉnh, sổ có **hai** dòng: bản gốc (`CONFIRMED`, số **cũ**) và bản điều chỉnh (`ADJUSTED`, số **đúng**). Báo cáo lọc `CONFIRMED` ⇒ **lấy số CŨ, bỏ số ĐÚNG**. Điều chỉnh không có tác dụng gì lên báo cáo.

### B.2.5 🔴 TIỀN ĐÃ VỀ NGÂN HÀNG VẪN CHƯA PHẢI DOANH THU

Webhook SePay/payOS ghi `Payment` ở trạng thái **`PENDING`** (`lib/payments/payos-ingest.ts:1044-1055`):

```ts
// lib/payments/payos-ingest.ts:1044-1055
await tx.payment.create({
  data: {
    orderId: order.id,
    amount: allocated,
    method: provider.toLowerCase(),
    paidDate: new Date(),                   // ← :1049 GIỜ INGEST, không phải giờ bank báo
    note: `Tiền về qua ${provider} ${providerTxnId} ${marker}`,
    saleStatus: "RECORDED",
    accountantStatus: "PENDING",            // ← :1052
    recordedById: null,
    centerId: order.centerId,
  },
});
```

Phải có người bấm **Xác nhận** trên `/admin/payments` mới thành `CONFIRMED`. Trong khi đó **số tiền vật lý đã về** nằm ở `BankTransaction.amount` + `transferredAt` (`prisma/schema.prisma:5843-5844`) — có `@@unique([provider, providerTxnId])` `:5861` và `@@index([status, createdAt])` `:5862`.

⇒ Trên hệ thống này có **ba** loại "thu" khác nhau, và ba số **không bằng nhau**:

| Loại | Nguồn | Nghĩa |
|---|---|---|
| **Tiền vật lý đã về** | `BankTransaction.amount` / `transferredAt` | Ngân hàng đã ghi có |
| **Tiền đã ghi nhận** | `Payment` mọi trạng thái, `paidDate` | Sale/webhook đã ghi vào sổ |
| **Doanh thu** | `Payment` `CONFIRMED`, `paidDate` | Kế toán đã xác nhận |

B1 dùng loại 3. B4 (dòng tiền) phải chọn — xem §B.6.4 và **OQ-B3**.

### B.2.6 🔴 `paidDate` mang nghĩa KHÁC NHAU theo đường ghi

| Đường ghi | `paidDate` = | Dòng |
|---|---|---|
| Sale ghi tay (`recordPayment`) | **Ngày người dùng chọn** trên form | `lib/finance/payment.ts:284` |
| Tự động khi chốt đơn (`ensureOrderPayment`) | `now` lúc chốt đơn | `lib/finance/payment.ts:106` (biến `now` khai `:104`) |
| Webhook SePay/payOS | `new Date()` **lúc ingest** — **KHÔNG** phải giờ bank báo | `lib/payments/payos-ingest.ts:1049` |
| Bản điều chỉnh | **Chép lại** `original.paidDate` | `lib/finance/payment.ts:548` |
| Bản hoàn | `now` lúc hoàn | `lib/finance/payment.ts:623` |

⇒ `paidDate` là *"ngày tiền được coi là đã thu"*, và độ chính xác của nó phụ thuộc đường ghi. Đây là **trục của cả B1 và B5** ⇒ phải ghi vào tài liệu, nếu không B5 (theo ngày) sẽ bị chất vấn từng ngày một.

Với B5 đặc biệt đáng chú ý: webhook đặt `paidDate` = giờ ingest, nên tiền về lúc 23:55 mà webhook chậm 10 phút sẽ rơi sang **ngày hôm sau**.

### B.2.7 Hai enum trạng thái Payment

```prisma
// prisma/schema.prisma:5668-5679
enum PaymentSaleStatus {
  RECORDED           // Sale ghi nhận đã thu
  COLLECT_CONFIRMED  // Sale xác nhận thực thu (chuẩn bị bàn giao kế toán)
}
enum PaymentAccountantStatus {
  PENDING    // chờ kế toán
  CONFIRMED  // kế toán xác nhận (giảm công nợ, sinh Receipt)
  REJECTED   // kế toán từ chối (bắt buộc reason)
  REFUNDED   // hoàn (bút toán âm, không xóa gốc)
  ADJUSTED   // bản điều chỉnh (trỏ adjustmentOfId)
}
```

⚠️ **`COLLECT_CONFIRMED` là giá trị CHẾT** ở đường ghi sản phẩm: grep toàn repo cho ra `app/(admin)/admin/payments/_components/payments-client.tsx:71,75` (nhãn UI), `prisma/seed-lms/crm.ts:394` (seed), và chú thích `scripts/backfill-payment-requests.ts:35` (*"chỉ là nhãn UI"*). Không đường ghi nào set nó ⇒ **đừng** dùng `saleStatus` làm điều kiện lọc doanh thu.

### B.2.8 🔴 CHI PHÍ — chỉ có 2 bảng, cả hai là mã chết và cả hai không đủ dùng

| Bảng | Vị trí | Vấn đề |
|---|---|---|
| `MarketingCostPeriod` | `prisma/schema.prisma:936-945` | `totalQcCost Int` theo kỳ `"YYYY-MM"`, `period` là `@unique` **đơn** (`:938`) ⇒ **KHÔNG có `centerId`**, không tách được theo cơ sở. Đường ghi `upsertDraftCost` (`lib/crm/cost-allocation.ts:40`) / `confirmCostPeriod` (`:63`) / `reopenCostPeriod` (`:82`) **chỉ được gọi từ `tests/e2e/r1/cost-allocation.spec.ts`** |
| `AdsInsightDaily` | `prisma/schema.prisma:948-961` | `spend Float`, theo `(date, channel)`. Không `centerId`. Đường ghi là **mã chết** (§D.2.1) |

**Không có màn nhập tay. Không có luồng import. Không có đầu phí nào ngoài quảng cáo.**

### B.2.9 🔴 DÒNG TIỀN — hệ thống KHÔNG CÓ khái niệm "chi"

Đo trên schema: **207** model (`grep -c "^model " prisma/schema.prisma`). Grep `expense` (không phân biệt hoa thường) trên `lib/` + `app/` + `prisma/` = **0 kết quả**. Không model phiếu chi, không bảng expense, không đường ghi tiền ra nào.

`RefundStatus.PAID` (`prisma/schema.prisma:5953`) trông như "đã chi tiền hoàn" nhưng là **giá trị CHẾT**: `lib/finance/refund.ts` chỉ set `APPROVED` (`:163`) và `REJECTED` (`:205`); `PENDING` là mặc định (`:5975`). Không đường nào set `PAID`.

⇒ **"Dòng tiền = thu − chi" hiện KHÔNG lấy được số "chi" từ bất cứ đâu.**

### B.2.10 🔴 DOANH THU THEO NGÀY — chưa từng tồn tại

Mọi trục thời gian của tiền đều là **THÁNG**: `buildRevenueTargetReport` gom bằng `monthKeyVN(p.paidDate)` (`lib/reports/revenue-target.ts:58`), `RevenueTarget.period` là `"YYYY-MM"` (`prisma/schema.prisma:6030`), `bao-cao/trung-tam` gom `revenueByMonth`. Hàm `dateKeyVN` **có sẵn** (`lib/reports/lead.ts:93-96`) nhưng chỉ dùng cho lead (`groupByWeek` `:229`).

Kèm theo: `Payment` **không có index nào trên `paidDate`** — `@@index` hiện có là `[orderId]` `:5725`, `[enrollmentId]` `:5726`, `[centerId]` `:5727`, `[accountantStatus]` `:5728`, `[orgUnitId]` `:5729`.

### B.2.11 `RevenueTarget` — cái đang có và cái đang sai

```prisma
// prisma/schema.prisma:6022-6040
model RevenueTarget {
  id String @id @default(cuid())
  centerId String?          // NULL = mục tiêu TOÀN HỆ THỐNG
  orgUnitId String?
  period String             // "YYYY-MM"
  targetAmount Int
  note String?
  createdById String?
  @@unique([centerId, period])   // :6037 — Postgres coi NULL là DISTINCT
}
```

- Nằm trong `SCOPE_EXEMPT` (`lib/db-scope.ts:84-86`) với chú thích: *"config mục tiêu KPI; centerId null = mục tiêu toàn hệ thống; scope tay qua `getRevenueTargets`"*.
- `Payment` nằm trong **`SCOPED_MODELS`** (`lib/db-scope.ts:21`) **và** `SOFT_DELETE_MODELS` (re-export `lib/soft-delete.ts` qua `lib/db-scope.ts:71`).

🔴 **Lỗi đã xác minh trong `getRevenueTargets`:**

```ts
// lib/reports/revenue-target-data.ts:22-30
export async function getRevenueTargets(actor: Actor): Promise<RevenueTargetRow[]> {
  const scope = getModelVisibleCenterIds("Payment", actor);
  const where =
    scope === "ALL" ? { centerId: null } : { centerId: { in: scope } };   // :24-25
  const rows = await db.revenueTarget.findMany({ where, … });
  …
}
```

Khi actor là SUPER_ADMIN / HO-level (`scope === "ALL"`), hàm lấy **chỉ** dòng `centerId = null` — tức **bỏ qua toàn bộ mục tiêu đã đặt cho từng cơ sở**. Hệ quả trên `manager-dashboard.tsx:99`: người cấp hội sở nhìn thấy "chưa đặt mục tiêu" trong khi từng cơ sở đều đã đặt. Đây là hành vi có thể **cố ý** (tránh đếm đôi mục tiêu công ty + mục tiêu cơ sở — đúng bẫy B1 của §C.6.2), nhưng nó **không** khớp với B-01 (spec `:22`: *"Set mục tiêu theo tháng, theo từng cơ sở"*) ⇒ B6 phải xử lý tường minh (§B.6.6).

---

## B.3 Objectives · Non-Goals · Success Metrics

### Goals

1. **Một** định nghĩa doanh thu thực thu, viết ra thành văn, dùng ở **một** hàm.
2. Doanh thu **thuần**: hoàn tiền trừ đi, bản điều chỉnh thay bản gốc.
3. Có khái niệm **chi phí** trong hệ thống: model + màn nhập tay + import file mẫu.
4. Doanh thu **theo ngày**, giờ VN, ngày không có giao dịch vẫn hiện `0`.
5. Mục tiêu theo **tháng × cơ sở** đọc đúng, kể cả với người cấp hội sở.

### Non-Goals (cố ý không làm trong B)

1. **Không** đổi `accountant-dashboard.tsx` / `funnel-query.ts` sang định nghĩa (a) trong v1 — chỉ **đổi nhãn** (§B.2.2 Đường 2, OQ-B1).
2. **Không** làm kế toán kép / sổ cái / báo cáo tài chính chuẩn mực. B là **dashboard vận hành**, không phải phần mềm kế toán.
3. **Không** tự động hoá phê duyệt chi. B2 v1 chỉ ghi nhận + duyệt một cấp.
4. **Không** đụng luồng `PaymentRequest` / `PaymentAllocation` / cờ `PAYMENT_LEDGER_V2` (`prisma/schema.prisma:5869`, chú thích `:3756-3757`) — sổ v2 đang chạy song song, ngoài phạm vi.
5. **Không** sửa `paidDate` của dữ liệu cũ. Nghĩa của nó lệch theo đường ghi (§B.2.6) — ghi vào tài liệu, không sửa ngược.
6. **Không** làm dự báo doanh thu (`CLAUDE.md` Don'ts — nhu cầu dự báo làm rule-based).

### Success Metrics

| Chỉ số | Hiện tại | Đích | Cách đo |
|---|---|---|---|
| Số chỗ lặp điều kiện "thực thu" | 3 (`doanh-thu:63-74` · `manager-dashboard:93-95` · `trung-tam:334`) | 1 hàm dùng chung | grep `accountantStatus: "CONFIRMED"` trong `app/` = 0 |
| Hoàn tiền trừ khỏi doanh thu | **Không** | Có | Test: thu 5tr rồi hoàn 2tr → B1 = 3tr |
| Điều chỉnh thay bản gốc | **Không** | Có | Test: thu 5tr rồi điều chỉnh còn 4tr → B1 = 4tr |
| Số đầu phí ghi nhận được | 0 | ≥ 5 nhóm | Danh mục `CostCategory` seed đủ nhóm |
| Doanh thu theo ngày | Không có trục ngày | Có, giờ VN, đủ ngày trống | e2e: range 7 ngày, 2 ngày có giao dịch → trả **7** dòng |
| Mục tiêu cơ sở với actor HO | Bỏ qua (`revenue-target-data.ts:24-25`) | Đọc đủ, không đếm đôi | Test: 2 cơ sở đặt mục tiêu + 1 mục tiêu công ty → HO thấy đúng theo chế độ đang chọn |
| Lệch giữa B1 và tiền về ngân hàng | Chưa đo | Đo được, hiện lên | Truy vấn đối soát §B.6.4 |

---

## B.4 Target Users & Segments

| Vai | Cần gì | Ràng buộc |
|---|---|---|
| **QLCS (`CENTER_MANAGER`)** | 6 con số của cơ sở mình; biết còn cách mục tiêu bao xa | `Payment` ∈ `SCOPED_MODELS` (`lib/db-scope.ts:21`) ⇒ đọc đã cách ly. Nhưng bảng chi phí **mới** phải tự khai |
| **Kế toán (`ACCOUNTANT` / `HO_ACCOUNTANT`)** | Nhập chi phí, import file mẫu, đối soát B1 với tiền về ngân hàng | Quyền `payments:manage` / `payments:confirm` đã có (`lib/permissions/registry/finance.ts:9,25`). Chi phí cần key mới — OQ-B5 |
| **BGĐ / Chủ dự án** | Lợi nhuận + dòng tiền theo cơ sở | Số phải khớp cách hiểu kế toán, hoặc được gọi tên khác (§B.2.2) |
| **Sale** | Không phải người dùng của tab B | Không có quyền xem chi phí/lợi nhuận |

---

## B.5 User Stories & Requirements

### P0 — Must Have

| # | User story | Acceptance criteria |
|---|---|---|
| **B-02-1** | 🔴 Là QLCS, tôi thấy **Doanh thu** thực thu của phạm vi + kỳ đang chọn. | §B.6.1. **Một** hàm `revenueWhere()` dùng chung, thay 3 chỗ lặp. Số là **thuần**: trừ hoàn, thay bản gốc bằng bản điều chỉnh. |
| **B-02-2** | 🔴 Là người dùng, tôi biết con số này **khác** con số ở dashboard kế toán. | Tooltip trên ô Doanh thu ghi công thức. Đồng thời đổi nhãn ở `accountant-dashboard.tsx` thành *"Giá trị đơn đã chốt"* và ở `/admin/marketing/funnel` thành *"ROAS theo giá trị đơn"* (§B.2.2 Đường 2). |
| **B-01-1** | Là QLCS, tôi đặt **mục tiêu doanh thu theo tháng, theo từng cơ sở**. | Dùng lại `RevenueTarget` + `setRevenueTargetAction` (`app/(admin)/admin/bao-cao/doanh-thu/_actions.ts:40-101`). `centerId = null` = **mục tiêu toàn hệ thống**, chỉ HO-level/SUPER_ADMIN đặt được (`_actions.ts:62-69`). |
| **B-02-3** | 🔴 Là QLCS, **Tỷ lệ hoàn thành** đọc đúng mục tiêu của cơ sở tôi. | §B.6.6. Vá `lib/reports/revenue-target-data.ts:24-25` (bỏ qua mục tiêu cơ sở khi actor HO). Chưa đặt → **"Chưa đặt mục tiêu"**, không phải `0%`. |
| **B-03-1** | 🔴 Là QLCS, tôi thấy **Chi phí** của kỳ. | §B.6.2. **Cần model mới.** Chi phí quảng cáo **không** nhập tay — đọc từ D1, đánh dấu `source = ADS_SYNC` để không trùng. |
| **B-03-2** | 🔴 Là QLCS, tôi thấy **Lợi nhuận** = thực thu − chi phí. | §B.6.3. Thiếu B2 → hiện `—`, **không** hiện `= doanh thu` (như thể chi phí bằng 0). |
| **B-03-3** | 🔴 Là QLCS, tôi thấy **Dòng tiền** = thu − chi. | §B.6.4. Chốt nghĩa "thu" ở §B.6.4 (OQ-B3). Hiện kèm **đối soát 3 lớp tiền** để người dùng thấy khoảng cách giữa tiền về và doanh thu. |
| **B-04-1** | 🔴 Là QLCS, tôi xem **doanh thu chi tiết theo ngày**. | §B.6.5. Trục **ngày lịch VN**. Ngày không giao dịch vẫn hiện dòng `0` (dùng `generate_series`). Range 90 ngày trả 90 dòng. |
| **B-05-1** | 🔴 Là kế toán, tôi nhập chi phí bằng **file mẫu**. | §B.6.7. Template cột cố định + validate từng dòng + **báo đủ dòng lỗi** (không dừng ở dòng đầu). Khuôn có sẵn: `app/api/admin/import/holidays/route.ts` (2 stage + mảng `errors: {row, error}[]`). |
| **B-00-1** | 🔴 Là dev, tôi có **một** nơi định nghĩa "thực thu". | `lib/finance/revenue.ts` export `revenueWhere(filters)` + `netRevenueOf(rows)`. 3 chỗ cũ chuyển sang dùng. Có unit test đối chiếu **gộp vs thuần**. |

### P1 — Should Have

| # | User story | Acceptance criteria |
|---|---|---|
| **B-03-4** | Là kế toán, tôi nhập chi phí **bằng tay** trên màn, không chỉ import. | Form shadcn/ui (`.claude/rules/admin-site.md`: admin = shadcn/ui + Recharts). Server Action `auth()` + `assertCan` ngay đầu. |
| **B-03-5** | Là QLCS, chi phí có **duyệt** trước khi vào báo cáo. | `CostEntry.status` `DRAFT → APPROVED → VOID`. Chỉ `APPROVED` vào B2/B3/B4. Khuôn `DiscountApprovalStatus` trên `Order` (`prisma/schema.prisma:3728`). |
| **B-04-2** | Là QLCS, tôi xem doanh thu theo ngày dưới dạng **biểu đồ**. | `<LineChart>` từ `components/charts/` — admin-only, animation **300ms** (`.claude/rules/ui-libraries.md`). |
| **B-02-4** | 🔴 Là kế toán, tôi thấy **tiền đã về ngân hàng mà chưa xác nhận**. | §B.6.4 truy vấn đối soát. Đây là khoảng cách giữa `BankTransaction` và `Payment CONFIRMED` — số này lớn nghĩa là kế toán đang tồn việc, không phải hệ thống sai. |
| **B-05-2** | Là kế toán, tôi tải **file mẫu** ngay trên màn import. | `public/templates/mau-chi-phi-v2.xlsx`. ⚠️ `CLAUDE.md` ghi rõ: các file `*-v2` là **binary soạn tay**, `build:templates` **đã xoá — đừng khôi phục**. |

### P2 — Nice to Have / Future

| # | User story | Acceptance criteria |
|---|---|---|
| **B-03-6** | Chi phí phân bổ theo tỷ lệ cho nhiều cơ sở. | Dùng lại `allocateByWeight` (`lib/finance/allocate.ts`, dùng ở `lib/finance/payment.ts:213`) — đừng viết phép chia thứ ba (`AdsCampaignMapping` là thứ hai). |
| **B-02-5** | Doanh thu tách theo **khoá học / sản phẩm**. | Cần đi qua `Order.items` (`OrderItem`) — chưa nối vào `Payment`. |
| **B-06-1** | Đóng sổ theo tháng (khoá không cho sửa). | Trùng OQ-D7. Additive. |

---

## B.6 Solution Overview — truy vấn tham chiếu cho từng metric

### B.6.0 🔴 Chốt định nghĩa "thực thu" — một chỗ

**Quyết định:** *Doanh thu thực thu của một kỳ = **tổng THUẦN** các khoản trên sổ `Payment` mà kế toán đã xác nhận, tính theo `paidDate`, trong đó:*

| Loại dòng | Vào doanh thu? | Vì sao |
|---|---|---|
| `CONFIRMED` **chưa** bị điều chỉnh | ✅ nguyên giá trị | Khoản thu bình thường |
| `CONFIRMED` **đã** có bản `ADJUSTED` trỏ về | ❌ **loại** | Bản gốc mang số **cũ**; bản điều chỉnh mang số đúng (§B.2.4) |
| `ADJUSTED` | ✅ nguyên giá trị | Thay bản gốc. `paidDate` đã chép từ gốc (`payment.ts:548`) ⇒ rơi đúng kỳ gốc |
| `REFUNDED` | ✅ nguyên giá trị (**âm**) | Trừ doanh thu (§B.2.3). `paidDate = now` lúc hoàn (`payment.ts:623`) ⇒ rơi vào **kỳ hoàn**, không phải kỳ thu gốc |
| `PENDING` | ❌ | Chưa xác nhận (§B.2.5) |
| `REJECTED` | ❌ | Kế toán từ chối |
| `deletedAt IS NOT NULL` | ❌ | Soft-delete tài chính (`prisma/schema.prisma:5723`) |

```ts
// lib/finance/revenue.ts — THÊM MỚI. NGUỒN SỰ THẬT DUY NHẤT cho "thực thu".
// Thay 3 chỗ lặp: bao-cao/doanh-thu/page.tsx:63-74 · manager-dashboard.tsx:93-95 ·
// bao-cao/trung-tam/page.tsx:334.

/** Trạng thái kế toán được tính vào doanh thu THUẦN. */
export const NET_REVENUE_STATUSES = ["CONFIRMED", "ADJUSTED", "REFUNDED"] as const;

/**
 * WHERE dùng chung cho sổ thực thu. `centerIds` đã được caller giao với tầm nhìn actor.
 * KHÔNG bao gồm điều kiện "loại bản gốc đã bị điều chỉnh" — điều kiện đó cần quan hệ
 * `adjustments`, xử ở netRevenueOf() hoặc ở SQL (§B.6.1).
 */
export function revenueWhere(f: { centerIds: string[] | null; dateFrom: Date; dateTo: Date }) {
  return {
    deletedAt: null,
    accountantStatus: { in: [...NET_REVENUE_STATUSES] },
    paidDate: { gte: f.dateFrom, lt: f.dateTo },     // NỬA MỞ — CHUNG-3
    ...(f.centerIds ? { centerId: { in: f.centerIds } } : {}),
  } as const;
}

/**
 * THUẦN. Nhận mảng đã fetch (có `id`, `amount`, `accountantStatus`, `adjustmentOfId`)
 * và trả tổng THUẦN. Bản gốc bị thay khi tồn tại một dòng ADJUSTED trỏ về nó.
 * ⚠️ Chỉ xét trong TẬP ĐÃ FETCH — xem bẫy B3 §B.6.1.
 */
export function netRevenueOf(
  rows: { id: string; amount: number; accountantStatus: string; adjustmentOfId: string | null }[],
): number {
  const supersededIds = new Set(
    rows.filter((r) => r.accountantStatus === "ADJUSTED" && r.adjustmentOfId)
        .map((r) => r.adjustmentOfId as string),
  );
  let sum = 0;
  for (const r of rows) {
    if (r.accountantStatus === "CONFIRMED" && supersededIds.has(r.id)) continue; // bản cũ
    sum += r.amount;   // REFUNDED đã mang dấu ÂM (payment.ts:601)
  }
  return sum;
}

/** Bản GỘP — giữ để đối chiếu với 3 màn cũ, KHÔNG dùng làm số chính. */
export function grossRevenueOf(rows: { amount: number; accountantStatus: string }[]): number {
  return rows.filter((r) => r.accountantStatus === "CONFIRMED").reduce((s, r) => s + r.amount, 0);
}
```

🔴 **Hệ quả bắt buộc thông báo trước khi bật:** số B1 sẽ **thấp hơn** con số 3 màn hiện tại đang hiện, đúng bằng (tổng hoàn tiền) + (chênh lệch điều chỉnh). Chạy truy vấn đo ở §B.6.8 **trước** để biết con số đó là bao nhiêu.

---

### B.6.1 — **B1 · Doanh thu thực thu**

**Định nghĩa bằng lời.** Tổng tiền **thuần** đã được kế toán xác nhận, theo `paidDate`, trong phạm vi + kỳ đang chọn (§B.6.0). **Không** phải giá trị hợp đồng, **không** phải tiền đã về ngân hàng.

**Nguồn dữ liệu.**

| Thứ | Bảng · cột |
|---|---|
| Số tiền | `Payment.amount` (`prisma/schema.prisma:5693`, `Int`) |
| Trạng thái | `Payment.accountantStatus` (`:5700`, enum `:5673-5679`) |
| Quan hệ điều chỉnh | `Payment.adjustmentOfId` (`:5706`) + self-relation `adjustments` (`:5708`) |
| **Trục thời gian** | `Payment.paidDate` (`:5695`, `Timestamptz(6)`) — **không** `confirmedAt` (`:5703`), **không** `createdAt` (`:5721`) |
| Cơ sở | `Payment.centerId` (`:5710`) |
| Loại bỏ | `Payment.deletedAt IS NULL` (`:5723`) |

**Truy vấn SQL.**

```sql
-- B1 · Doanh thu thực thu THUẦN.
-- $1 = centerIds text[] (NULL = toàn phạm vi) · $2 = dateFrom · $3 = dateTo (NỬA MỞ)
SELECT
  -- Số CHÍNH: thuần.
  COALESCE(sum(p."amount") FILTER (
    WHERE p."accountantStatus" IN ('CONFIRMED','ADJUSTED','REFUNDED')
      -- Loại bản GỐC đã bị thay bởi một bản ADJUSTED (§B.2.4).
      -- NOT EXISTS chỉ tìm con ADJUSTED, KHÔNG tìm con REFUNDED — refundPayment cũng
      -- set adjustmentOfId (payment.ts:629) nhưng nó là bút toán BỔ SUNG, không thay thế.
      AND NOT (
        p."accountantStatus" = 'CONFIRMED'
        AND EXISTS (
          SELECT 1 FROM "Payment" a
          WHERE a."adjustmentOfId" = p."id"
            AND a."accountantStatus" = 'ADJUSTED'
            AND a."deletedAt" IS NULL
        )
      )
  ), 0)::bigint AS net_revenue,

  -- Số ĐỐI CHIẾU: gộp, đúng công thức 3 màn hiện tại đang dùng.
  COALESCE(sum(p."amount") FILTER (WHERE p."accountantStatus" = 'CONFIRMED'), 0)::bigint AS gross_revenue,
  COALESCE(sum(p."amount") FILTER (WHERE p."accountantStatus" = 'REFUNDED'), 0)::bigint  AS refunded,
  count(*) FILTER (WHERE p."accountantStatus" = 'ADJUSTED')::int                          AS adjusted_rows
FROM "Payment" p
WHERE p."deletedAt" IS NULL
  AND p."paidDate" >= $2
  AND p."paidDate" <  $3
  AND ($1::text[] IS NULL OR p."centerId" = ANY($1));
```

**Truy vấn Prisma tương đương.**

```ts
// Payment ∈ SCOPED_MODELS (lib/db-scope.ts:21) ⇒ scopedDb TỰ chèn centerId IN visible.
// Payment ∈ SOFT_DELETE_MODELS ⇒ deletedAt: null cũng được chèn ở tầng base (lib/db.ts).
// Vẫn ghi tường minh cả hai để người đọc mã không phải nhớ.
import { revenueWhere, netRevenueOf, grossRevenueOf } from "@/lib/finance/revenue";

export async function getNetRevenue(actor: Actor, f: ScopeFilters) {
  const sdb = scopedDb(actor);
  const effective = effectiveCenterIds(actor, f);

  const rows = await sdb.payment.findMany({
    where: revenueWhere({ centerIds: effective, dateFrom: f.dateFrom, dateTo: f.dateTo }),
    select: {
      id: true, amount: true, accountantStatus: true, adjustmentOfId: true,
      centerId: true, paidDate: true,
    },
    take: 50_000,   // trần cứng, giống doanh-thu/page.tsx:73 — xem bẫy B4
  });

  return { net: netRevenueOf(rows), gross: grossRevenueOf(rows), rows };
}
```

**Giả định.**

| # | Giả định | Nếu sai |
|---|---|---|
| G1 | `paidDate` là "ngày tiền được coi là đã thu" | Nghĩa **lệch theo đường ghi** (§B.2.6). Webhook đặt = giờ ingest ⇒ tiền về 23:55 mà webhook chậm sẽ rơi sang ngày sau. Ảnh hưởng B5 nhiều hơn B1 |
| G2 | Một bản gốc chỉ bị điều chỉnh **một** lần | `adjustPayment` không chặn điều chỉnh chồng: nó đọc `original` bằng `findUnique` theo `paymentId` (`payment.ts:521`) và **không** kiểm tra bản đó đã có con `ADJUSTED` chưa. Điều chỉnh hai lần ⇒ **hai** dòng `ADJUSTED` cùng trỏ một gốc ⇒ **cộng cả hai**. Xem bẫy B2 |
| G3 | `centerId` của `Payment` luôn có giá trị | `ensureOrderPayment` suy `centerId` theo chuỗi order → lead → actor (`payment.ts:92-98`) nhưng vẫn có thể ra `null`. Khoản `centerId = null` **rơi khỏi mọi bộ lọc có `centerIds`** |

**Bẫy.**

| # | Bẫy | Xử lý |
|---|---|---|
| B1 | 🔴 **Số sẽ tụt so với 3 màn hiện tại** | Đo trước bằng §B.6.8, thông báo cho kế toán/BGĐ trước khi bật. Hiện cả `net` và `gross` trong tooltip ở tháng đầu |
| B2 | 🔴 **Điều chỉnh chồng** (G2) ⇒ cộng nhiều bản `ADJUSTED` của cùng một gốc | Truy vấn rà: `SELECT "adjustmentOfId", count(*) FROM "Payment" WHERE "accountantStatus"='ADJUSTED' AND "deletedAt" IS NULL GROUP BY 1 HAVING count(*) > 1`. Nếu prod có ca này → phải chốt quy tắc "bản `ADJUSTED` mới nhất thắng" (thêm `ORDER BY createdAt DESC LIMIT 1`) — **OQ-B2** |
| B3 | 🔴 **`netRevenueOf` chỉ xét trong tập ĐÃ FETCH.** Bản gốc thu tháng 7, bản điều chỉnh chép `paidDate` tháng 7 ⇒ cùng kỳ, an toàn. Nhưng nếu bộ lọc **cơ sở** khác nhau giữa hai dòng (điều chỉnh chép `original.centerId`, `payment.ts:556` — nên thực tế **luôn cùng**) | An toàn nhờ `payment.ts:548` + `:556` chép cả `paidDate` lẫn `centerId`. Ghi test khẳng định, vì nếu ai đó đổi hai dòng đó thì `netRevenueOf` hỏng im lặng |
| B4 | **`take: 50_000`** — vượt trần thì **âm thầm cụt số** | Đếm trước: nếu `count > 45_000` thì chuyển sang `groupBy`/`$queryRaw` thay vì `findMany`. **Không** để trần cứng cắt tiền |
| B5 | 🔴 **Không có index trên `paidDate`** (§B.2.10) | Thêm `@@index([centerId, paidDate])` và `@@index([accountantStatus, paidDate])` trên `Payment`. **Additive**, an toàn (luật cứng #4 chỉ cấm đổi/bỏ cột) |
| B6 | `REFUNDED` rơi vào **kỳ hoàn**, không phải kỳ thu gốc | Đúng theo nghĩa dòng tiền, lệch theo nghĩa ghi nhận doanh thu. Ghi vào tooltip. **Không** sửa `payment.ts:623` (Non-Goal 5) |

---

### B.6.2 — **B2 · Chi phí**

🔴 **KHÔNG TÍNH ĐƯỢC HÔM NAY.** Bằng chứng đầy đủ ở §B.2.8 + §B.2.9: **207 model, 0 model chi phí**, hai bảng gần nhất (`MarketingCostPeriod` `:936` và `AdsInsightDaily` `:948`) đều **không có `centerId`**, đều **không có màn nhập**, và cả hai đường ghi đều **chỉ được gọi từ file test**.

**Điều kiện tiên quyết: phải xây khái niệm "chi" trước.** Đề xuất model tối thiểu:

```prisma
/// B-03/B-05 — DANH MỤC đầu phí. Cấu hình được, không phải enum Postgres
/// (cùng lý do LeadLostReason — docs/prd/G-lead.md §6.6: enum = migration, trái
/// tinh thần "admin tự set").
/// KHÔNG mang centerId/orgUnitId: danh mục dùng chung toàn hệ thống, cùng loại
/// ngoại lệ Affiliate đang hưởng (lib/db-scope.ts SCOPE_EXEMPT).
model CostCategory {
  id           String  @id @default(cuid())
  code         String  @unique     // "ADS", "RENT", "SALARY", "UTILITY", "MARKETING_OFFLINE", "OTHER"
  label        String              // "Chi phí quảng cáo", "Thuê mặt bằng", …
  /// true = đầu phí này do HỆ THỐNG ghi (vd ADS đọc từ D1) ⇒ CẤM nhập tay/import.
  /// Không có cờ này thì kế toán nhập tay tiền quảng cáo và B3 trừ HAI LẦN.
  isSystemFed  Boolean @default(false)
  isActive     Boolean @default(true)
  displayOrder Int     @default(0)
  createdAt    DateTime @default(now()) @db.Timestamptz(6)
  updatedAt    DateTime @updatedAt @db.Timestamptz(6)

  entries CostEntry[]
  @@index([isActive, displayOrder])
}

enum CostEntryStatus {
  DRAFT     // vừa nhập/import, chưa vào báo cáo
  APPROVED  // đã duyệt — CHỈ trạng thái này vào B2/B3/B4
  VOID      // huỷ (không xoá cứng — giữ vết)
}

enum CostEntrySource {
  MANUAL      // nhập tay trên màn
  IMPORT      // từ file mẫu B-05
  ADS_SYNC    // suy từ D1 — KHÔNG có bản ghi thật, xem chú thích dưới
}

/// B-03 — MỘT KHOẢN CHI. Trục thời gian = spentDate (ngày phát sinh chi phí),
/// KHÔNG phải ngày nhập liệu — đối xứng với Payment.paidDate của B1.
model CostEntry {
  id String @id @default(cuid())

  /// Luật cứng #3: bảng MỚI mang orgUnitId. Nhưng SL-00 (A-nen-tang.md §10) buộc mang
  /// CẢ HAI vì injectScope hôm nay chỉ chèn centerId (lib/db-scope.ts:277-279).
  /// centerId = NULL ⇒ chi phí CẤP CÔNG TY (chưa phân bổ về cơ sở) — nghĩa RIÊNG,
  /// phải khai vào BACKFILL_SPECS với nullMeaning "NULL_TOAN_HE_THONG".
  centerId  String?
  orgUnitId String?

  categoryId String
  category   CostCategory @relation(fields: [categoryId], references: [id], onDelete: Restrict)

  spentDate DateTime @db.Date        // ngày phát sinh — trục của B2/B3/B4
  amount    Int                      // VND, số NGUYÊN (như Payment.amount :5693)
  vendor    String?                  // nhà cung cấp
  note      String?  @db.Text
  evidenceUrl String?                // ảnh/PDF hoá đơn trên R2 (như Payment.evidenceUrl :5696)

  status CostEntryStatus @default(DRAFT)
  source CostEntrySource @default(MANUAL)

  /// Chống import trùng: cùng khoá thì lần import thứ hai bị bỏ qua.
  /// Sinh từ (spentDate, categoryId, centerId, amount, vendor) — xem §B.6.7.
  dedupeKey String? @unique

  createdById  String?
  approvedById String?
  approvedAt   DateTime? @db.Timestamptz(6)
  createdAt    DateTime  @default(now()) @db.Timestamptz(6)
  updatedAt    DateTime  @updatedAt @db.Timestamptz(6)
  deletedAt    DateTime? @db.Timestamptz(6)

  @@index([centerId, spentDate])
  @@index([status, spentDate])
  @@index([categoryId])
  @@index([orgUnitId])
}
```

🔴 **Chi phí quảng cáo KHÔNG được nhập tay.** Đầu phí `ADS` mang `isSystemFed = true`; B2 cộng nó **từ D1** (`lib/reports/ads-spend.ts`), **không** đọc từ `CostEntry`. Không có cờ này thì kế toán nhập tay hoá đơn Meta và B3 trừ **hai lần** — đúng ràng buộc §0 mục 2. Vì thế `CostEntrySource.ADS_SYNC` tồn tại như **giá trị dự phòng**, không dùng ở v1.

**Truy vấn SQL.**

```sql
-- B2 · Chi phí của kỳ = (chi nhập tay/import đã DUYỆT) + (chi quảng cáo từ D1).
-- Hai nguồn TÁCH BIỆT, cộng ở tầng ứng dụng để không ai trừ hai lần.
WITH manual_cost AS (
  SELECT
    ce."centerId",
    cc."code"  AS category_code,
    cc."label" AS category_label,
    sum(ce."amount")::bigint AS amount
  FROM "CostEntry" ce
  JOIN "CostCategory" cc ON cc.id = ce."categoryId"
  WHERE ce."deletedAt" IS NULL
    AND ce."status" = 'APPROVED'              -- DRAFT/VOID KHÔNG vào báo cáo
    AND cc."isSystemFed" = false              -- ADS đi đường D1, không đi đường này
    AND ce."spentDate" >= $2::date AND ce."spentDate" < $3::date
    AND ($1::text[] IS NULL OR ce."centerId" = ANY($1) OR ce."centerId" IS NULL)
  GROUP BY 1, 2, 3
)
SELECT * FROM manual_cost ORDER BY amount DESC;
-- Chi phí quảng cáo lấy riêng: getAdsSpendByCenter(actor, f) — §D.6.9.
```

**Truy vấn Prisma tương đương.**

```ts
export async function getCostBreakdown(actor: Actor, f: ScopeFilters) {
  const sdb = scopedDb(actor);            // CostEntry ∈ SCOPED_MODELS (khai cùng migration)
  const effective = effectiveCenterIds(actor, f);

  const [manual, ads] = await Promise.all([
    sdb.costEntry.groupBy({
      by: ["categoryId", "centerId"],
      where: {
        deletedAt: null,
        status: "APPROVED",
        spentDate: { gte: f.dateFrom, lt: f.dateTo },
        category: { isSystemFed: false },
        ...(effective ? { centerId: { in: effective } } : {}),
      },
      _sum: { amount: true },
    }),
    getAdsSpendByCenter(actor, f),        // §D.6.9 — nguồn DUY NHẤT của đầu phí quảng cáo
  ]);

  return combineCost(manual, ads);        // THUẦN — có test khẳng định KHÔNG cộng đôi
}
```

**Giả định.** Chi phí "cấp công ty" (`centerId = null`) — thuê văn phòng hội sở, lương HO — **không** phân bổ về cơ sở ở v1. Hiện thành một dòng riêng "Chi phí công ty". Muốn phân bổ thì dùng `allocateByWeight` (`lib/finance/allocate.ts`, dùng ở `lib/finance/payment.ts:213`) — **giai đoạn sau**.

**Bẫy.**

| # | Bẫy | Xử lý |
|---|---|---|
| B1 | 🔴 **Trừ hai lần chi phí quảng cáo** | `isSystemFed` chặn ở **hai** tầng: validator import từ chối `code = 'ADS'`, và query B2 lọc `isSystemFed = false`. Có test |
| B2 | 🔴 `centerId = NULL` trên `CostEntry` có **nghĩa riêng** ("cấp công ty"), khác nghĩa mặc định | Khai vào `BACKFILL_SPECS` (`lib/org/center-bridge.ts:45`) với `nullMeaning: "NULL_TOAN_HE_THONG"`. Nếu khai `SCOPED_MODELS` mà quên `NULL_IS_GLOBAL_MODELS` thì `injectScope` (`lib/db-scope.ts:277-279`) sẽ **ẩn mất** toàn bộ chi phí công ty khỏi mọi người |
| B3 | `scopedDb` **không che write** (`lib/db-scope.ts:4-5`) | Mọi `create`/`update` `CostEntry` phải tự set `centerId` + tự `passesScope` |
| B4 | Chi phí `DRAFT` lọt vào báo cáo | Điều kiện `status = 'APPROVED'` ở **cả** SQL lẫn Prisma. Có test |
| B5 | Chỉ số | `@@index([centerId, spentDate])` + `@@index([status, spentDate])` đã khai |

---

### B.6.3 — **B3 · Lợi nhuận** (= thực thu − chi phí)

**Định nghĩa bằng lời.** `B3 = B1 − B2` trong cùng phạm vi + cùng kỳ. **Không** phải lợi nhuận kế toán chuẩn mực (không khấu hao, không thuế, không phân bổ chi phí công ty) — là **lợi nhuận vận hành thô** để QLCS tự soi.

🔴 **KHÔNG TÍNH ĐƯỢC cho tới khi B2 xong.**

**Nguồn.** B1 (§B.6.1) + B2 (§B.6.2).

**Truy vấn SQL.**

```sql
-- B3 · Lợi nhuận vận hành theo cơ sở. Ghép hai vế ĐÃ lọc cùng phạm vi + cùng kỳ.
WITH rev AS (
  -- Y HỆT công thức net_revenue của B1 (§B.6.1), chỉ thêm GROUP BY centerId.
  SELECT
    p."centerId" AS center_id,
    COALESCE(sum(p."amount") FILTER (
      WHERE p."accountantStatus" IN ('CONFIRMED','ADJUSTED','REFUNDED')
        AND NOT (
          p."accountantStatus" = 'CONFIRMED'
          AND EXISTS (SELECT 1 FROM "Payment" a
                       WHERE a."adjustmentOfId" = p."id"
                         AND a."accountantStatus" = 'ADJUSTED' AND a."deletedAt" IS NULL)
        )
    ), 0)::bigint AS net_revenue
  FROM "Payment" p
  WHERE p."deletedAt" IS NULL
    AND p."paidDate" >= $2 AND p."paidDate" < $3
    AND ($1::text[] IS NULL OR p."centerId" = ANY($1))
  GROUP BY 1
),
cost AS (
  SELECT ce."centerId" AS center_id, sum(ce."amount")::bigint AS cost_amount
  FROM "CostEntry" ce
  JOIN "CostCategory" cc ON cc.id = ce."categoryId"
  WHERE ce."deletedAt" IS NULL AND ce."status" = 'APPROVED' AND cc."isSystemFed" = false
    AND ce."spentDate" >= $2::date AND ce."spentDate" < $3::date
    AND ($1::text[] IS NULL OR ce."centerId" = ANY($1) OR ce."centerId" IS NULL)
  GROUP BY 1
)
SELECT
  COALESCE(r.center_id, c.center_id)                       AS center_id,
  COALESCE(r.net_revenue, 0)                               AS revenue,
  COALESCE(c.cost_amount, 0)                               AS cost_manual,
  -- Chi phí quảng cáo CỘNG Ở TẦNG ỨNG DỤNG từ D1 (§D.6.9) — cố ý không join ở đây,
  -- vì phân bổ ads là resolver lúc đọc, không phải bảng (§D.6.1).
  COALESCE(r.net_revenue, 0) - COALESCE(c.cost_amount, 0)  AS profit_before_ads
FROM rev r
FULL OUTER JOIN cost c ON c.center_id = r.center_id
ORDER BY 1 NULLS LAST;
```

**Truy vấn Prisma tương đương.**

```ts
export async function getProfit(actor: Actor, f: ScopeFilters) {
  const [rev, cost] = await Promise.all([getNetRevenue(actor, f), getCostBreakdown(actor, f)]);
  // Thiếu vế chi phí -> KHÔNG trả revenue như thể lợi nhuận. Trả null, UI hiện "—".
  if (!cost.available) return { revenue: rev.net, cost: null, profit: null };
  return { revenue: rev.net, cost: cost.total, profit: rev.net - cost.total };
}
```

**Bẫy.**

| # | Bẫy | Xử lý |
|---|---|---|
| B1 | 🔴 **Chưa có chi phí mà hiện lợi nhuận = doanh thu** — con số đẹp giả và sẽ được dùng để ra quyết định | `profit = null` ⇒ UI hiện `—` kèm chữ *"Chưa nhập chi phí kỳ này"*. **Tuyệt đối không** `cost ?? 0` |
| B2 | Chi phí công ty (`centerId = null`) không thuộc cơ sở nào ⇒ tổng lợi nhuận các cơ sở **≠** lợi nhuận toàn hệ thống | Hiện dòng "Chi phí công ty (chưa phân bổ)" riêng, và một dòng tổng có nó |
| B3 | Chi phí quảng cáo `CHƯA PHÂN BỔ` (§D.6.12) cũng không thuộc cơ sở nào | Cùng cách xử lý B2 |
| B4 | Kỳ nhập chi phí trễ ⇒ lợi nhuận tháng trước đổi khi kế toán nhập bù | Bình thường về nghiệp vụ. Hiện `updatedAt` gần nhất của `CostEntry` trong kỳ để người đọc biết số còn động |

---

### B.6.4 — **B4 · Dòng tiền** (= thu − chi)

**Định nghĩa bằng lời.** Tiền **vào** trừ tiền **ra** trong kỳ. 🔴 Vế "vào" có **ba** nghĩa trên hệ thống này (§B.2.5) — PRD phải chọn một.

**Quyết định v1:** *B4 = B1 (thực thu đã xác nhận) − B2 (chi đã duyệt).* Cùng nguồn với B3; khác B3 ở chỗ B4 hiện kèm **bảng đối soát 3 lớp tiền** để người đọc thấy khoảng cách với tiền vật lý.

**Vì sao không dùng `BankTransaction` làm vế "vào" ở v1:**

| Lý do | Bằng chứng |
|---|---|
| Tiền mặt **không** đi qua ngân hàng | `Payment.method` là chuỗi tự do (`prisma/schema.prisma:5694` *"tiền mặt / chuyển khoản / ..."*) ⇒ dùng `BankTransaction` là **bỏ sót** toàn bộ khoản thu tiền mặt |
| `BankTransaction` có nhóm **chưa khớp** | `centerId = NULL` nghĩa là *"chưa biết của cơ sở nào"* — nó nằm trong `NULL_IS_GLOBAL_MODELS` (`lib/db-scope.ts:66-69`) đúng vì lý do đó. Không quy được về cơ sở ⇒ không dựng dòng tiền theo cơ sở |
| Không có vế "ra" tương ứng | Không có bảng giao dịch chi ngân hàng. Trộn "vào theo ngân hàng" với "ra theo sổ chi" là so hai thước đo khác nhau |

⇒ Nếu BGĐ muốn dòng tiền **ngân hàng thật**, đó là metric **khác**, cần bảng giao dịch chi — xem **OQ-B3**.

**Bảng đối soát 3 lớp tiền (bắt buộc hiện cùng B4).**

```sql
-- Đối soát: tiền VẬT LÝ đã về vs tiền ĐÃ GHI NHẬN vs DOANH THU.
-- Ba số này KHÔNG bằng nhau, và khoảng cách chính là thông tin cần nhìn.
SELECT
  -- Lớp 1 — tiền vật lý về ngân hàng (KHÔNG gồm tiền mặt).
  (SELECT COALESCE(sum(bt."amount"), 0)::bigint
     FROM "BankTransaction" bt
    WHERE bt."transferredAt" >= $2 AND bt."transferredAt" < $3
      AND ($1::text[] IS NULL OR bt."centerId" = ANY($1) OR bt."centerId" IS NULL)
  ) AS bank_in,

  -- Lớp 2 — đã ghi nhận vào sổ Payment (mọi trạng thái trừ REJECTED).
  (SELECT COALESCE(sum(p."amount"), 0)::bigint
     FROM "Payment" p
    WHERE p."deletedAt" IS NULL
      AND p."accountantStatus" <> 'REJECTED'
      AND p."paidDate" >= $2 AND p."paidDate" < $3
      AND ($1::text[] IS NULL OR p."centerId" = ANY($1))
  ) AS recorded,

  -- Lớp 3 — doanh thu (B1 thuần). Xem §B.6.1.
  (SELECT COALESCE(sum(p."amount"), 0)::bigint
     FROM "Payment" p
    WHERE p."deletedAt" IS NULL
      AND p."accountantStatus" = 'CONFIRMED'
      AND p."paidDate" >= $2 AND p."paidDate" < $3
      AND ($1::text[] IS NULL OR p."centerId" = ANY($1))
  ) AS confirmed_gross,

  -- Việc tồn của kế toán: tiền đã ghi nhận nhưng CHƯA xác nhận.
  (SELECT COALESCE(sum(p."amount"), 0)::bigint
     FROM "Payment" p
    WHERE p."deletedAt" IS NULL
      AND p."accountantStatus" = 'PENDING'
      AND p."paidDate" >= $2 AND p."paidDate" < $3
      AND ($1::text[] IS NULL OR p."centerId" = ANY($1))
  ) AS pending_confirm,

  -- Giao dịch ngân hàng CHƯA KHỚP được về đơn nào.
  (SELECT COALESCE(sum(bt."amount"), 0)::bigint
     FROM "BankTransaction" bt
    WHERE bt."status" = 'UNMATCHED'
      AND bt."transferredAt" >= $2 AND bt."transferredAt" < $3
  ) AS bank_unmatched;
```

**Truy vấn Prisma tương đương.**

```ts
export async function getCashFlow(actor: Actor, f: ScopeFilters) {
  const sdb = scopedDb(actor);   // BankTransaction ∈ SCOPED_MODELS (lib/db-scope.ts:47)
                                 // và ∈ NULL_IS_GLOBAL_MODELS (:68) ⇒ dòng chưa khớp VẪN hiện
  const effective = effectiveCenterIds(actor, f);
  const range = { gte: f.dateFrom, lt: f.dateTo };

  const [rev, cost, bankIn, pending, unmatched] = await Promise.all([
    getNetRevenue(actor, f),
    getCostBreakdown(actor, f),
    sdb.bankTransaction.aggregate({ _sum: { amount: true }, where: { transferredAt: range } }),
    sdb.payment.aggregate({
      _sum: { amount: true },
      where: { deletedAt: null, accountantStatus: "PENDING", paidDate: range,
               ...(effective ? { centerId: { in: effective } } : {}) },
    }),
    sdb.bankTransaction.aggregate({
      _sum: { amount: true }, where: { status: "UNMATCHED", transferredAt: range },
    }),
  ]);

  return {
    cashIn: rev.net,
    cashOut: cost.available ? cost.total : null,
    netCashFlow: cost.available ? rev.net - cost.total : null,   // thiếu chi -> null
    reconcile: {
      bankIn: bankIn._sum.amount ?? 0,
      pendingConfirm: pending._sum.amount ?? 0,
      bankUnmatched: unmatched._sum.amount ?? 0,
    },
  };
}
```

**Bẫy.**

| # | Bẫy | Xử lý |
|---|---|---|
| B1 | 🔴 **Gọi "dòng tiền" cho một con số không phải dòng tiền ngân hàng** | Nhãn ghi rõ *"Dòng tiền vận hành (thu ghi nhận − chi đã duyệt)"*, và bảng đối soát 3 lớp đặt **ngay dưới**, không giấu trong drill-down |
| B2 | 🔴 `BankTransaction.transferredAt` là **giờ bank báo**, còn `Payment.paidDate` của webhook là **giờ ingest** (`payos-ingest.ts:1049`) ⇒ hai lớp lệch nhau ở biên ngày | Chấp nhận và ghi vào tooltip. **Không** tự căn chỉnh |
| B3 | Tiền mặt không có `BankTransaction` ⇒ `bank_in < recorded` là **bình thường**, không phải lỗi | Ghi chú dưới bảng đối soát |
| B4 | `BankTransaction` với `centerId = NULL` bị lọc mất | `BankTransaction` ∈ `NULL_IS_GLOBAL_MODELS` (`lib/db-scope.ts:68`) nên `injectScope` dùng `OR centerId IS NULL` (`:277-278`) ⇒ nhóm chưa khớp **vẫn hiện**. Chú thích tại chỗ đã nêu đúng lý do: *"ẩn nhóm này khỏi người đối soát chính là làm mất đúng thứ họ cần xử lý"* |
| B5 | `RefundStatus.PAID` là giá trị chết (§B.2.9) ⇒ hoàn tiền **thực chi** không có vết | Vế "ra" của B4 v1 **không** gồm tiền hoàn đã chi. Hoàn tiền đã thể hiện ở B1 (dòng `REFUNDED` âm). Nếu tính thêm ở vế ra là **trừ hai lần**. Ghi rõ trong tài liệu |

---

### B.6.5 — **B5 · Doanh thu chi tiết theo NGÀY**

**Định nghĩa bằng lời.** Với mỗi **ngày lịch Việt Nam** trong khoảng đang chọn: tổng thực thu **thuần** của ngày đó (§B.6.0), theo `paidDate`. **Ngày không có giao dịch vẫn có dòng, giá trị 0.**

🔴 **Chưa từng tồn tại** — §B.2.10.

**Nguồn dữ liệu.** Như B1. Khác duy nhất: gom theo `(paidDate AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`.

**Truy vấn SQL.**

```sql
-- B5 · Doanh thu theo NGÀY (lịch VN), đủ ngày trống.
WITH days AS (
  -- generate_series trên NGÀY VN. $2/$3 đã neo 00:00 giờ VN (CHUNG-3).
  SELECT d::date AS day
  FROM generate_series(
         ($2 AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
         ($3 AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1,   -- NỬA MỞ: bỏ ngày cuối
         interval '1 day'
       ) d
),
rev AS (
  SELECT
    -- timestamptz -> giờ VN -> cắt lấy NGÀY. Đây là chỗ DUY NHẤT quyết định
    -- một giao dịch 23:30 giờ VN thuộc ngày nào.
    (p."paidDate" AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
    sum(p."amount") FILTER (
      WHERE p."accountantStatus" IN ('CONFIRMED','ADJUSTED','REFUNDED')
        AND NOT (
          p."accountantStatus" = 'CONFIRMED'
          AND EXISTS (SELECT 1 FROM "Payment" a
                       WHERE a."adjustmentOfId" = p."id"
                         AND a."accountantStatus" = 'ADJUSTED' AND a."deletedAt" IS NULL)
        )
    )::bigint AS net_revenue,
    count(*) FILTER (WHERE p."accountantStatus" = 'CONFIRMED')::int AS txn_count
  FROM "Payment" p
  WHERE p."deletedAt" IS NULL
    AND p."paidDate" >= $2 AND p."paidDate" < $3
    AND ($1::text[] IS NULL OR p."centerId" = ANY($1))
  GROUP BY 1
)
SELECT
  d.day,
  COALESCE(r.net_revenue, 0)::bigint AS net_revenue,   -- ngày trống -> 0, KHÔNG bỏ dòng
  COALESCE(r.txn_count, 0)           AS txn_count
FROM days d
LEFT JOIN rev r ON r.day = d.day
ORDER BY d.day;
```

**Truy vấn Prisma tương đương.**

```ts
// Prisma KHÔNG có generate_series và KHÔNG gom được theo ngày-múi-giờ trong groupBy.
// Fetch rồi gom ở HÀM THUẦN — đúng khuôn buildRevenueTargetReport (revenue-target.ts:52).
import { dateKeyVN } from "@/lib/reports/lead";          // :93-96 — đã có, dùng lại
import { netRevenueOf } from "@/lib/finance/revenue";

export async function getDailyRevenue(actor: Actor, f: ScopeFilters) {
  const { rows } = await getNetRevenue(actor, f);        // §B.6.1 — cùng bộ lọc, không lặp WHERE
  return buildDailyRevenue(rows, f.dateFrom, f.dateTo);
}

/** THUẦN. Trả ĐỦ ngày trong [from, to), ngày trống = 0. Test không cần Postgres. */
export function buildDailyRevenue(
  rows: { id: string; amount: number; accountantStatus: string; adjustmentOfId: string | null; paidDate: Date }[],
  from: Date, to: Date,
) {
  const byDay = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = dateKeyVN(r.paidDate);                     // "YYYY-MM-DD" giờ VN
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(r);
  }
  const out: { day: string; netRevenue: number; txnCount: number }[] = [];
  for (let t = startOfDayVN(from).getTime(); t < to.getTime(); t += 86_400_000) {
    const k = dateKeyVN(new Date(t));
    const dayRows = byDay.get(k) ?? [];
    out.push({
      day: k,
      netRevenue: netRevenueOf(dayRows),
      txnCount: dayRows.filter((r) => r.accountantStatus === "CONFIRMED").length,
    });
  }
  return out;
}
```

**Giả định.**

- `paidDate` phản ánh đúng ngày thu. Với webhook thì là **giờ ingest** (§B.2.6) ⇒ tiền về 23:55 mà webhook chậm 10 phút rơi sang ngày sau. Ở mức **ngày** điều này nhìn thấy được; ở mức tháng thì không.
- VN là UTC+7 **không DST** — giả định đã dùng trong `monthKeyVN`/`dateKeyVN` (`lib/reports/lead.ts:87-96`, cộng thẳng 7 giờ).

**Bẫy.**

| # | Bẫy | Xử lý |
|---|---|---|
| B1 | 🔴 **Ngày trống bị bỏ dòng** ⇒ biểu đồ nối thẳng qua ngày nghỉ, trông như doanh thu liên tục | `generate_series` (SQL) / vòng lặp ngày (TS). Có test: range 7 ngày, 2 ngày có giao dịch → **7** dòng |
| B2 | 🔴 **Gom theo ngày UTC thay vì ngày VN** ⇒ mọi giao dịch từ 00:00–07:00 giờ VN rơi sang ngày hôm trước | `AT TIME ZONE 'Asia/Ho_Chi_Minh'` (SQL) / `dateKeyVN` (TS). Test: giao dịch 06:00 giờ VN ngày 15 phải thuộc ngày 15 |
| B3 | 🔴 **Không có index trên `paidDate`** (§B.2.10) — B5 quét theo range ngày là nặng nhất trong 6 metric | Thêm `@@index([centerId, paidDate])` trên `Payment`. **Additive** |
| B4 | Range quá dài (2 năm = 730 dòng) làm biểu đồ vô nghĩa | Trần: range > 92 ngày → tự chuyển sang gom **tuần**, và nói rõ trên nhãn |
| B5 | Bản `REFUNDED` rơi vào ngày hoàn ⇒ có ngày doanh thu **âm** | Đúng theo định nghĩa thuần. Biểu đồ phải chịu được giá trị âm (trục Y không neo 0) |

---

### B.6.6 — **B6 · Mục tiêu + Tỷ lệ hoàn thành**

**Định nghĩa bằng lời.** **Mục tiêu** = tổng `RevenueTarget.targetAmount` của các kỳ trong range, theo đúng chế độ phạm vi đang chọn. **Tỷ lệ hoàn thành** = B1 ÷ mục tiêu. Chưa đặt mục tiêu ⇒ `null`, hiện **"Chưa đặt mục tiêu"**.

**Nguồn dữ liệu.** `RevenueTarget` (`prisma/schema.prisma:6022-6040`), `@@unique([centerId, period])` `:6037`, `SCOPE_EXEMPT` (`lib/db-scope.ts:84-86`).

🔴 **Phải vá `getRevenueTargets` trước.** `lib/reports/revenue-target-data.ts:24-25`:

```ts
const where = scope === "ALL" ? { centerId: null } : { centerId: { in: scope } };
```

Actor cấp HO (`scope === "ALL"`) chỉ lấy dòng **toàn hệ thống**, bỏ qua mục tiêu từng cơ sở. Điều này **tránh được đếm đôi** nhưng **mâu thuẫn** B-01 (spec `:22`: đặt mục tiêu **theo từng cơ sở**) — nếu HO chỉ đặt mục tiêu cho CS1 và CS2, không đặt mục tiêu công ty, thì màn của HO hiện *"chưa đặt mục tiêu"*.

**Quy tắc chốt (thay cho dòng `:24-25`):**

| Chế độ phạm vi | Lấy mục tiêu nào |
|---|---|
| Người dùng chọn **N cơ sở cụ thể** | **Chỉ** dòng của N cơ sở đó, **cộng lại**. Không lấy dòng `centerId = null` |
| Người dùng chọn **"tất cả"** và có dòng `centerId = null` cho kỳ đó | **Chỉ** dòng `centerId = null` (mục tiêu công ty đã bao trùm) |
| Người dùng chọn **"tất cả"** và **không** có dòng `centerId = null` | **Cộng** mục tiêu của mọi cơ sở trong tầm nhìn |

Quy tắc 3 là phần **thêm mới** so với mã hiện tại, và là phần vá lỗi.

**Truy vấn SQL.**

```sql
-- B6 · Mục tiêu + tỷ lệ hoàn thành, tách theo KỲ (tháng VN).
WITH periods AS (
  SELECT to_char(gs, 'YYYY-MM') AS period
  FROM generate_series(
         date_trunc('month', ($2 AT TIME ZONE 'Asia/Ho_Chi_Minh')),
         date_trunc('month', ($3 AT TIME ZONE 'Asia/Ho_Chi_Minh') - interval '1 microsecond'),
         interval '1 month') gs
),
target AS (
  SELECT p.period,
    CASE
      -- Chọn N cơ sở cụ thể -> chỉ dòng của N cơ sở đó.
      WHEN $1::text[] IS NOT NULL THEN (
        SELECT sum(t."targetAmount")::bigint FROM "RevenueTarget" t
        WHERE t."period" = p.period AND t."centerId" = ANY($1))
      -- "Tất cả" + CÓ mục tiêu công ty -> dùng mục tiêu công ty.
      WHEN EXISTS (SELECT 1 FROM "RevenueTarget" t
                    WHERE t."period" = p.period AND t."centerId" IS NULL) THEN (
        SELECT sum(t."targetAmount")::bigint FROM "RevenueTarget" t
        WHERE t."period" = p.period AND t."centerId" IS NULL)
      -- "Tất cả" + KHÔNG có mục tiêu công ty -> cộng mục tiêu các cơ sở (phần VÁ LỖI).
      ELSE (SELECT sum(t."targetAmount")::bigint FROM "RevenueTarget" t
             WHERE t."period" = p.period AND t."centerId" IS NOT NULL)
    END AS target_amount
  FROM periods p
),
actual AS (
  SELECT to_char(p."paidDate" AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM') AS period,
         sum(p."amount") FILTER (
           WHERE p."accountantStatus" IN ('CONFIRMED','ADJUSTED','REFUNDED')
             AND NOT (p."accountantStatus" = 'CONFIRMED'
                      AND EXISTS (SELECT 1 FROM "Payment" a
                                   WHERE a."adjustmentOfId" = p."id"
                                     AND a."accountantStatus" = 'ADJUSTED' AND a."deletedAt" IS NULL))
         )::bigint AS net_revenue
  FROM "Payment" p
  WHERE p."deletedAt" IS NULL
    AND p."paidDate" >= $2 AND p."paidDate" < $3
    AND ($1::text[] IS NULL OR p."centerId" = ANY($1))
  GROUP BY 1
)
SELECT
  t.period,
  COALESCE(a.net_revenue, 0) AS actual,
  t.target_amount            AS target,          -- NULL = chưa đặt
  CASE WHEN t.target_amount IS NULL OR t.target_amount = 0 THEN NULL
       ELSE round(COALESCE(a.net_revenue, 0)::numeric / t.target_amount, 4) END AS achieved_rate
FROM target t
LEFT JOIN actual a ON a.period = t.period
ORDER BY t.period;
```

**Truy vấn Prisma tương đương.**

```ts
// Dùng lại buildRevenueTargetReport (lib/reports/revenue-target.ts:52-74) và
// computeAchievement (:32-39) — HAI hàm đã có, đã test, đã trả null an toàn.
// Chỉ THAY hàm nạp mục tiêu (getRevenueTargets, revenue-target-data.ts:22-31).
export async function getRevenueTargetsFixed(actor: Actor, f: ScopeFilters): Promise<RevenueTargetRow[]> {
  const effective = effectiveCenterIds(actor, f);
  const sdb = scopedDb(actor);   // RevenueTarget ∈ SCOPE_EXEMPT -> pass-through, PHẢI tự lọc

  if (effective) {
    return sdb.revenueTarget.findMany({
      where: { centerId: { in: effective } },
      select: { centerId: true, period: true, targetAmount: true },
    });
  }
  // "Tất cả": ưu tiên mục tiêu công ty; không có thì cộng mục tiêu các cơ sở.
  const global = await sdb.revenueTarget.findMany({
    where: { centerId: null },
    select: { centerId: true, period: true, targetAmount: true },
  });
  const globalPeriods = new Set(global.map((t) => t.period));
  const perCenter = await sdb.revenueTarget.findMany({
    where: { centerId: { not: null }, period: { notIn: [...globalPeriods] } },
    select: { centerId: true, period: true, targetAmount: true },
  });
  return [...global, ...perCenter];
}
```

**Bẫy.**

| # | Bẫy | Xử lý |
|---|---|---|
| B1 | 🔴 **Đếm đôi mục tiêu** (công ty + cơ sở cùng kỳ) | Quy tắc 3 dòng ở trên. Có test cho cả ba chế độ |
| B2 | 🔴 `@@unique([centerId, period])` với `centerId` nullable ⇒ **`upsert` không match** nhánh toàn hệ thống | Đường ghi đã xử đúng: `findFirst` + create/update tay (`app/(admin)/admin/bao-cao/doanh-thu/_actions.ts:72-87`, chú thích `:37-38`). **Đừng** "tối ưu" nó thành upsert |
| B3 | Range cắt giữa tháng ⇒ tỷ lệ thấp giả | Như §C.6.2 bẫy B2: hiện thêm **tỷ lệ theo tiến độ tháng** |
| B4 | Chưa đặt mục tiêu mà hiện `0%` | `computeAchievement` (`lib/reports/revenue-target.ts:32-39`) đã trả `achievedRate: null` khi `target === null`. Dùng lại nguyên hàm |
| B5 | 🔴 **Mục tiêu đặt theo tiền THU, không theo số hợp đồng chốt** | Spec `:33`: *"hợp đồng trả góp/đóng theo đợt sẽ rải doanh thu qua nhiều tháng → mục tiêu tháng (B-01) phải set theo tiền thu"*. Ghi câu này **ngay trên form đặt mục tiêu**, không giấu trong tài liệu |

---

### B.6.7 — **B-05 · Import chi phí bằng file mẫu**

**Template cột** — `public/templates/mau-chi-phi-v2.xlsx`.

⚠️ `CLAUDE.md` ghi rõ: các file `*-v2` trong `public/templates/` là **binary soạn tay**, script `build:templates` **ĐÃ XOÁ — đừng khôi phục**. File mẫu này soạn tay, đặt cạnh 9 file hiện có.

| Cột | Tên trên file | Bắt buộc | Kiểu | Validate |
|---|---|---|---|---|
| A | `Ngày chi (YYYY-MM-DD)` | ✅ | Ngày | Dùng lại `parseExcelDate` (`app/api/admin/import/holidays/route.ts:12-40`) — nhận `Date`, chuỗi ISO, `DD/MM/YYYY`, **và số serial Excel** |
| B | `Mã đầu phí` | ✅ | Chuỗi | ∈ `CostCategory.code` với `isActive = true`. 🔴 **Từ chối `ADS`** (`isSystemFed = true`) kèm thông báo *"Chi phí quảng cáo lấy tự động, không nhập tay"* |
| C | `Cơ sở (mã CS, để trống = cấp công ty)` | ❌ | Chuỗi | ∈ `Center.code` (`prisma/schema.prisma:237`). Rỗng ⇒ `centerId = null`. Nhãn cột phải nói rõ nghĩa của ô trống — tiền lệ: `CLAUDE.md` ghi mẫu lead đã vá đúng kiểu nhãn này |
| D | `Số tiền (VND)` | ✅ | Số nguyên | `> 0`, `Int`. Từ chối số thập phân, từ chối chuỗi có dấu chấm/phẩy phân nhóm chưa làm sạch |
| E | `Nhà cung cấp` | ❌ | Chuỗi | ≤ 255 |
| F | `Ghi chú` | ❌ | Chuỗi | ≤ 2000 |

**Sheet 2 `Danh mục`** (chỉ đọc): bảng mã đầu phí + mã cơ sở đang hiệu lực, để người nhập khỏi đoán. Cùng khuôn 3-sheet của bộ template v2.

**Luồng xử lý** — theo đúng khuôn `app/api/admin/import/holidays/route.ts`:

```ts
// app/api/admin/import/costs/route.ts
// Stage 1 — parse schema TỪNG DÒNG, gom LỖI, KHÔNG dừng ở dòng đầu (holidays:108-124).
// Stage 2 — giải mã cơ sở + đầu phí, kiểm passesScope TỪNG DÒNG (holidays:132-190).
// Stage 3 — bỏ qua dòng trùng theo dedupeKey, INSERT phần còn lại.
// Trả về: { success: number; skipped: number; errors: { row: number; error: string }[] }
// `row` = chỉ số dòng TRÊN FILE (i + 2, vì dòng 1 là header) — holidays:120.

const costRowSchema = z.object({
  spentDate: dateField,                                   // holidays:43-53
  categoryCode: z.string().trim().min(1, "Thiếu mã đầu phí"),
  centerCode: optionalString,                             // holidays:60-66
  amount: z.coerce.number().int("Số tiền phải là số nguyên").positive("Số tiền phải lớn hơn 0"),
  vendor: optionalString,
  note: optionalString,
});

// Chống trùng: import lại cùng file KHÔNG được nhân đôi chi phí.
function costDedupeKey(r: { spentDate: Date; categoryId: string; centerId: string | null; amount: number; vendor: string | null }) {
  return [dateKeyVN(r.spentDate), r.categoryId, r.centerId ?? "HQ", r.amount, (r.vendor ?? "").toLowerCase()].join("|");
}
```

**Quy tắc bắt buộc.**

| # | Quy tắc | Vì sao |
|---|---|---|
| 1 | **Báo ĐỦ dòng lỗi**, không dừng ở dòng đầu tiên | Kế toán import 200 dòng, sửa từng dòng một là không dùng được. Khuôn `holidays:108-124` đã đúng |
| 2 | Dòng lỗi **không** chặn dòng đúng | `holidays` cho qua phần hợp lệ và trả `errors[]` |
| 3 | 🔴 Kiểm `passesScope` **từng dòng** | `scopedDb` **không che write** (`lib/db-scope.ts:4-5`). Khuôn `holidays:179-190`: cơ sở ngoài phạm vi → lỗi dòng; ô trống (cấp công ty) → chỉ HO/SUPER_ADMIN |
| 4 | 🔴 Từ chối `Mã đầu phí = ADS` | Chống trừ hai lần (§B.6.2 bẫy B1) |
| 5 | Import ra `status = DRAFT` | Phải có người duyệt mới vào B2/B3/B4 (B-03-5) |
| 6 | Trần **5000 dòng** | Khuôn `holidays:105` |
| 7 | Trùng `dedupeKey` → **bỏ qua**, đếm vào `skipped`, **không** báo lỗi | Import lại cùng file là thao tác thường; nhân đôi chi phí là hỏng sổ |
| 8 | Có màn **xem trước** trước khi ghi | Khuôn `app/api/admin/import/precheck/route.ts` |

**Bẫy.**

| # | Bẫy | Xử lý |
|---|---|---|
| B1 | 🔴 **Import hai lần nhân đôi chi phí** | `dedupeKey` `@unique` + bỏ qua trùng |
| B2 | Số tiền dạng `"1.500.000"` từ Excel → `Number()` ra `1.5` | Làm sạch dấu phân nhóm **trước** `z.coerce.number()`; và test đúng ca `"1.500.000"` (tiền lệ `CLAUDE.md`: lỗi hiển thị `"1.000.0000Đ"` từng bị treo) |
| B3 | Ngày Excel là **số serial** (vd `45900`) | `parseExcelDate` (`holidays:18-23`) đã xử: `epoch = Date.UTC(1899, 11, 30)` |
| B4 | Người nhập để trống cột cơ sở vì tưởng "không bắt buộc" | Nhãn cột ghi thẳng `(để trống = cấp công ty)`; sheet `Danh mục` liệt kê mã cơ sở |
| B5 | File tải về từ `public/` | ⚠️ **Không** sinh file bằng script — `build:templates` đã xoá có chủ ý |

---

### B.6.8 — Truy vấn ĐO CHÊNH LỆCH trước khi chốt (chạy trên prod, chỉ đọc)

```sql
-- Đo chênh giữa doanh thu GỘP (3 màn hiện tại) và THUẦN (PRD này chọn).
-- Chạy cho 6 tháng gần nhất, TRƯỚC khi bật tab B.
SELECT
  to_char(p."paidDate" AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM') AS period,
  sum(p."amount") FILTER (WHERE p."accountantStatus" = 'CONFIRMED')::bigint AS gross,
  sum(p."amount") FILTER (WHERE p."accountantStatus" = 'REFUNDED')::bigint  AS refunded,
  count(*) FILTER (WHERE p."accountantStatus" = 'ADJUSTED')::int            AS adjusted_rows,
  -- Phần bị "đếm số cũ": bản gốc CONFIRMED đã có con ADJUSTED.
  sum(p."amount") FILTER (
    WHERE p."accountantStatus" = 'CONFIRMED'
      AND EXISTS (SELECT 1 FROM "Payment" a WHERE a."adjustmentOfId" = p."id"
                    AND a."accountantStatus" = 'ADJUSTED' AND a."deletedAt" IS NULL)
  )::bigint AS superseded_amount
FROM "Payment" p
WHERE p."deletedAt" IS NULL
  AND p."paidDate" >= now() - interval '6 months'
GROUP BY 1 ORDER BY 1;

-- Rà điều chỉnh CHỒNG (giả định G2 §B.6.1). Có kết quả => phải chốt OQ-B2.
SELECT "adjustmentOfId", count(*) AS n
FROM "Payment"
WHERE "accountantStatus" = 'ADJUSTED' AND "deletedAt" IS NULL AND "adjustmentOfId" IS NOT NULL
GROUP BY 1 HAVING count(*) > 1;

-- Khoản CONFIRMED không có centerId => rơi khỏi mọi bộ lọc theo cơ sở.
SELECT count(*), COALESCE(sum("amount"), 0)::bigint
FROM "Payment"
WHERE "deletedAt" IS NULL AND "accountantStatus" = 'CONFIRMED' AND "centerId" IS NULL;

-- Đối chiếu 2 định nghĩa doanh thu (§B.2.2) trên cùng kỳ.
SELECT
  (SELECT COALESCE(sum(p."amount"),0)::bigint FROM "Payment" p
    WHERE p."deletedAt" IS NULL AND p."accountantStatus"='CONFIRMED'
      AND p."paidDate" >= date_trunc('month', now()))                       AS def_a_payment,
  (SELECT COALESCE(sum(o."totalAmount"),0)::bigint FROM "Order" o
    WHERE o."deletedAt" IS NULL AND o."status" IN ('CONFIRMED','COMPLETED')
      AND o."paidAt" >= date_trunc('month', now()))                          AS def_b_order;
```

⚠️ Chạy trên **prod**. `test.satarobo.vn` và máy local dùng chung một DB, và DB đó **không phải** prod (`CLAUDE.md`).

---

## B.7 Open Questions

| # | Câu hỏi | Vì sao chặn | Chủ | Hạn |
|---|---|---|---|---|
| **OQ-B1** | 🔴 Có **thống nhất** `accountant-dashboard.tsx:26-31` và `funnel-query.ts:17-20` sang định nghĩa (a) không, hay chỉ **đổi nhãn**? | §B.2.2. Thống nhất ⇒ số của kế toán và ROAS **tụt** ngay, phải báo trước. Đổi nhãn ⇒ rẻ, nhưng hệ thống vẫn có hai con số "doanh thu" | Chủ dự án + Kế toán | **Trước khi bật tab B** |
| **OQ-B2** | 🔴 Một khoản bị điều chỉnh **nhiều lần** thì tính bản nào? | §B.6.1 giả định G2 + bẫy B2. `adjustPayment` **không chặn** điều chỉnh chồng (`payment.ts:521-557`). Đề xuất: **bản `ADJUSTED` mới nhất thắng**. Chạy truy vấn rà ở §B.6.8 để biết prod có ca này chưa | Kế toán | Trước khi code B1 |
| **OQ-B3** | 🔴 "Dòng tiền" nghĩa là gì với BGĐ: **thu ghi nhận** hay **tiền vật lý về ngân hàng**? | §B.6.4. Chọn tiền ngân hàng ⇒ bỏ sót toàn bộ thu tiền mặt và cần bảng giao dịch chi (chưa có). PRD chọn thu ghi nhận + bảng đối soát 3 lớp | Chủ dự án | Trước khi code B4 |
| **OQ-B4** | 🔴 Danh mục **đầu phí** gồm những nhóm nào? | §B.6.2 đề xuất `ADS · RENT · SALARY · UTILITY · MARKETING_OFFLINE · OTHER`. Không có danh sách thì B-05 không có template và B2 không nghiệm thu được | Kế toán | Trước khi seed danh mục |
| **OQ-B5** | Permission key cho chi phí? | Đề xuất `costs:view` / `costs:manage` / `costs:approve` trong `lib/permissions/registry/finance.ts`. ⚠️ Key mới **phải** seed `RolePermission` trên prod qua `seed-prod-roles.yml` **sau** khi merge — quên là kế toán trắng màn (tiền lệ đã ghi trong `MEMORY.md`) | Chủ dự án | Trước khi code B2 |
| **OQ-B6** | Chi phí **cấp công ty** (`centerId = null`) có phân bổ về cơ sở không? | §B.6.2 giả định: **không** ở v1, hiện dòng riêng. Phân bổ ⇒ lợi nhuận từng cơ sở đổi, và cần chốt tiêu chí chia (doanh thu? sĩ số?) | BGĐ | Trước khi code B3 |
| **OQ-B7** | Chi phí cần **duyệt** mới vào báo cáo, hay nhập là tính? | §B.6.2 chọn phải duyệt (`status = APPROVED`). Nếu bỏ duyệt thì nhanh hơn nhưng ai cũng đổi được lợi nhuận | Kế toán | Trước khi code B2 |
| **OQ-B8** | Có cần **đóng sổ theo tháng** (khoá không cho sửa) không? | Trùng OQ-D7. Không đóng sổ thì báo cáo tháng trước có thể đổi bất kỳ lúc nào | Kế toán | Sau khi B2 chạy |
| **OQ-B9** | Range mặc định của tab B là gì? | A-02 chốt mặc định *"01 → hôm nay"* (`A-nen-tang.md` §6.2). Với tài chính, người dùng thường muốn **tháng trước trọn vẹn**. Đổi mặc định riêng cho tab B thì 4 tab không còn dùng chung một bộ lọc | Chủ dự án | Trước khi code A-02 |

---

## B.8 Timeline & Phasing

| Bước | Nội dung | Phụ thuộc | Ghi chú |
|---|---|---|---|
| **B.0** | Chạy §B.6.8 trên prod → trả lời **OQ-B1, OQ-B2, OQ-B4, OQ-B7** | — | 🔴 Không có số đo thì không ai dám đổi định nghĩa doanh thu |
| **B.1** | **A-02** — `resolveScopeFilters` + `<ScopeFilterBar>` + khoá cache | — | Thuộc khu vực A (CHUNG-3) |
| **B.2** | Test đỏ trước: hoàn tiền trừ doanh thu · bản điều chỉnh thay bản gốc · B5 đủ ngày trống · B5 ranh giới ngày VN · B6 ba chế độ mục tiêu | B.0 | Luật cứng Nền Hệ thống #5 |
| **B.3** | `lib/finance/revenue.ts` (§B.6.0) — `revenueWhere` + `netRevenueOf` + `grossRevenueOf`. Chuyển **3 chỗ lặp** sang dùng | B.2 | Hàm thuần, unit test không cần Postgres |
| **B.4** | Migration additive: index `[centerId, paidDate]` + `[accountantStatus, paidDate]` trên `Payment` | B.2 | **Additive** — luật cứng #4 chỉ cấm đổi/bỏ cột |
| **B.5** | Vá `lib/reports/revenue-target-data.ts:24-25` theo quy tắc §B.6.6 | B.3 | Có test cho **cả ba** chế độ phạm vi |
| **B.6** | B1 + B5 + B6 trên tab Tài chính (hàng chỉ số 1 + bảng theo ngày) | B.3 + B.5 | Ba trong sáu con số lên được ở đây |
| **B.7** | Đổi nhãn `accountant-dashboard.tsx` + `/admin/marketing/funnel` theo OQ-B1 | B.6 | Một dòng JSX mỗi chỗ. **Đừng** đổi logic nếu OQ-B1 chọn Đường 2 |
| **B.8** | Migration additive: `CostCategory` + `CostEntry` + 2 enum. Khai `SCOPED_MODELS` + `BACKFILL_SPECS` (`nullMeaning: "NULL_TOAN_HE_THONG"`) + `getModelPrefixes` cùng lúc | B.2 + OQ-B4 + OQ-B5 | Thiếu `BACKFILL_SPECS` → test `[US-07-IT-08b]` đỏ |
| **B.9** | Màn nhập chi phí tay + duyệt | B.8 | shadcn/ui, `auth()` + `assertCan` đầu mỗi Server Action |
| **B.10** | B-05 import: `public/templates/mau-chi-phi-v2.xlsx` (soạn tay) + `app/api/admin/import/costs/route.ts` + màn xem trước | B.8 | Khuôn `holidays/route.ts`. **Không** khôi phục `build:templates` |
| **B.11** | B2 + B3 + B4 (hàng chỉ số 2) + bảng đối soát 3 lớp tiền | B.9 + B.10 + **D.7** | 🔴 Chi phí quảng cáo đọc từ D1, **không** nhập tay |
| **B.12** | Cập nhật `documentation/` + liệt kê file đổi, rồi **DỪNG** | B.3–B.11 | Luật cứng Nền Hệ thống #10 |

**Ràng buộc môi trường.**

- Mọi migration của B là **additive** (2 index + 2 bảng + 2 enum) ⇒ an toàn với việc `test.satarobo.vn` và máy local dùng chung một DB (`CLAUDE.md`).
- 🔴 Nếu OQ-B5 chốt key quyền mới: **sau khi merge `test` → `main`, phải chạy `seed-prod-roles.yml`**. Tiền lệ đã ghi trong `MEMORY.md`: quên bước này thì vai liên quan trên prod **thấy màn trắng** dù mã đã lên.
- Khâu đối soát ngân hàng (`BankTransaction`) phụ thuộc webhook SePay/payOS — cùng họ với điểm mù ZNS: creds nhà cung cấp chỉ ở scope Production, nên số lớp 1 của bảng đối soát chỉ smoke được trên prod.

---

## Phụ lục — bảng tra nhanh: metric ↔ nguồn ↔ điều kiện tiên quyết

| Metric | Bảng nguồn chính | Trục thời gian | Điều kiện tiên quyết |
|---|---|---|---|
| C1 Tổng lead | `LeadChild` | `LeadChild.createdAt` | SL-08 (`centerId`) |
| C2 Tỷ lệ đạt mục tiêu | `LeadChild` + `LeadTarget` | `createdAt` / `period` | `LeadTarget` (bảng mới) |
| C3 Tỷ lệ thành công | `LeadChild` | `createdAt` (lứa) | SL-09 + §C.6.0 |
| C4 Thời gian chốt | `LeadChild` | `closedAt` | SL-09 + vá đường ghi |
| C5 Ngày chưa tiếp cận | `LeadActivity` (→ `Lead.lastActivityAt`) | `LeadActivity.createdAt` | Vá N-4 + `sla.ts:132` |
| D1 Ngân sách thực tế | `AdsSpendSnapshot` + `AdsCampaignMapping` | `statDate` | Job D-01 + parser + mapping |
| D2 CPL | D1 ÷ C1 | — | D1 + C1 |
| D3 CPA | D1 ÷ C3(tử) | `closedAt` cho mẫu số | D1 + C3 |
| B1 Doanh thu | `Payment` | `paidDate` | §B.6.0 (chốt định nghĩa) |
| B2 Chi phí | `CostEntry` + D1 | `spentDate` / `statDate` | `CostEntry` (bảng mới) + D1 |
| B3 Lợi nhuận | B1 − B2 | — | B2 |
| B4 Dòng tiền | B1 − B2 (+ `BankTransaction` đối soát) | `paidDate` / `transferredAt` | B2 + OQ-B3 |
| B5 Doanh thu theo ngày | `Payment` | `paidDate` (ngày VN) | Index `[centerId, paidDate]` |
| B6 Mục tiêu | `RevenueTarget` | `period` | Vá `revenue-target-data.ts:24-25` |
