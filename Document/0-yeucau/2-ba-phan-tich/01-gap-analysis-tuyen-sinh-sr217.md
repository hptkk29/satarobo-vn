# BA Gap Analysis #01 — Quy trình Tuyển sinh SR.QD.217

> 🔄 **ĐỒNG BỘ DOC 15 (2026-06-06) — các giá trị sau trong file này đã bị Doc 15 THAY:** SLA phản hồi 15' → **5'** (+rule lead im 2 ngày) · `PageInboundEvent` → **`MessengerConversation/MessengerMessage` + `FacebookPageMapping`** · webhook path → `/api/webhooks/meta/messenger` · CostAllocation status DRAFT/FINALIZED → **DRAFT/CONFIRMED/REOPENED** · role SALE_ADMIN/QC → **HO_SALE/HO_MARKETING** (RBAC động, OrgUnit). File giữ làm tham chiếu phân tích — spec cuối: Doc 15 §5.

> **Input:** `1-pm-tiep-nhan/02-phieu-tiep-nhan-tuyen-sinh-sr217.md` + codebase hiện tại.
> **Output:** thiết kế chức năng mức BA — mapping dữ liệu, model mới, luồng nghiệp vụ — làm đầu vào cho `3-ke-hoach-trien-khai/`.
> **Nguyên tắc:** TÁI DÙNG pipeline Lead/Order hiện có, chỉ thêm lớp mới (L1 aggregate, SLA, Commission, Cost Allocation). Không refactor đập bỏ.

---

## 1. Mapping phễu L1/L2/L3 → hệ thống hiện tại

| Khái niệm SR217 | Thực thể hệ thống | Ghi chú |
|---|---|---|
| LEADS_1 (tin nhắn page) | **MỚI: `PageInboundEvent`** (record từng hội thoại vào page, nhận **realtime qua Messenger API/webhook** — theo chỉnh sửa phiếu #02) + **`AdsDailyStat`** (chi phí QC/ngày/kênh, nhập/import) | Webhook FB Messenger → đếm L1 tự động theo ngày/kênh; file QC trước 21:00 còn vai trò **nhập chi phí + đối soát** số L1 kênh chưa có webhook (Zalo page…) |
| LEADS_2 (có SĐT + note) | `Lead` hiện có | Điều kiện L2 = `phone` + `summary` (map vào field ghi chú đầu tiên / `handoverNote`). Đánh dấu `qualifiedAt` |
| Bàn giao TT | `Lead.centerId` + `LeadTransfer` | Thêm: `handedAt`, `receivedConfirmedAt` (TT xác nhận), trạng thái `handed` |
| Phân công Sale | `Lead.assignedToId` + `LeadAssignmentHistory` | Đã có — thêm `assignedAt` để đo SLA 30' |
| Liên hệ ≤2h | `LeadActivity(type=CALL/MESSAGE)` đầu tiên sau assigned | `firstContactAt` derive từ activity |
| LEADS_3 (đóng học phí) | `Lead.status=ENROLLED` + **Order CONFIRMED có `leadId`** | Nguồn sự thật doanh số = `Order.totalAmount` (hoặc tiền thực thu installment — chờ B1) |
| Doanh số / source | `Order` + **MỚI: `Lead.commissionSource`** enum | `MARKETING_ADMIN / SALE_SELF / REFERRAL / OTHER` — bất biến sau khi L3 chốt |

### Map trạng thái: KHÔNG thêm enum LeadStatus mới
L1 không phải Lead record. L2 = Lead từ NEW trở đi. L3 = ENROLLED. Các mốc đo bằng **timestamp**, không bằng status:

```
createdAt (L2 sinh) → handedAt → receivedConfirmedAt → assignedAt → firstContactAt → convertedAt (L3)
```

## 2. Model mới đề xuất (Prisma — BA mức logic, DB chi tiết do dev)

```prisma
// (0) Hội thoại vào page — nguồn LEADS_1 realtime (Messenger API/webhook)
model PageInboundEvent {
  id            String   @id @default(cuid())
  source        String            // facebook | zalo...
  externalId    String            // conversation/sender id từ platform
  channel       String            // page nào / kênh QC
  firstMessageAt DateTime
  respondedAt   DateTime?         // page trả lời lần đầu — đo SLA 15'
  leadId        String?           // nối khi Admin xin được SĐT → L2
  raw           Json?
  @@unique([source, externalId])
  @@index([channel, firstMessageAt])
}

// (1) Số liệu QC hằng ngày — chi phí + đối soát L1 kênh chưa có webhook
model AdsDailyStat {
  id          String   @id @default(cuid())
  date        DateTime @db.Date
  channel     String          // facebook | zalo | google | tiktok...
  leads1Count Int
  cost        Decimal
  note        String?
  enteredById String          // QC Marketing
  @@unique([date, channel])
}

// (2) Kỳ phân bổ chi phí — chạy/chốt theo tháng
model CostAllocationPeriod {
  id          String   @id
  month       String   @unique        // "2026-06"
  totalQcCost Decimal                 // tổng CP QC (từ AdsDailyStat hoặc kế toán nhập đè)
  totalLeads2 Int
  totalLeads3 Int
  cpl         Decimal                 // totalQcCost / totalLeads2
  cpa         Decimal                 // totalQcCost / totalLeads3
  status      AllocationStatus        // DRAFT | FINALIZED (khóa số liệu)
  finalizedById String?
  lines       CostAllocationLine[]    // per center: leads2Count, allocatedCost = cpl × leads2Count
}

// (3) Kỳ hoa hồng — auto cuối tháng
model CommissionPeriod {
  id     String @id
  month  String @unique
  status CommissionStatus   // DRAFT | APPROVED | PAID
  items  CommissionItem[]
}
model CommissionItem {
  id        String @id
  periodId  String
  userId    String          // người hưởng
  tier      CommissionTier  // QC_MARKETING(1%) | SALE_ADMIN(1%) | SALE_TVV(4%) | CENTER_MANAGER(2%)
  centerId  String?
  baseRevenue Decimal       // tổng DS L3 thuộc tầng này
  rate      Decimal         // snapshot % tại thời điểm tính (config được)
  amount    Decimal
  detail    Json            // danh sách orderId cấu thành — phục vụ đối soát
  @@index([periodId, userId])
}

// (4) Cấu hình % hoa hồng (tránh hardcode 1/1/4/2)
model CommissionRateConfig { tier CommissionTier @id; rate Decimal; isActive Boolean }

// (5) Mở rộng Lead (thêm cột, không bảng mới)
//   qualifiedAt, handedAt, receivedConfirmedAt, assignedAt, firstContactAt (denormalize),
//   commissionSource (enum), adminId (Sale Admin bàn giao — hưởng tầng 1%)
```

Audit: `CommissionPeriod`/`CostAllocationPeriod` dùng pattern `*AuditLog` sẵn có (APPROVE/FINALIZE/RECALC ghi old/new).

## 3. Luồng nghiệp vụ chi tiết

### 3.1 Thu LEADS_1 + nhập liệu QC (bước 1)
- **Realtime:** webhook Messenger (`/api/public/webhook/facebook-messenger` — mở rộng hạ tầng webhook FB sẵn có) ghi `PageInboundEvent` idempotent theo `(source, externalId)`; ghi `respondedAt` khi page trả lời lần đầu → đo SLA phản hồi 15'.
  - ⚠️ Điều kiện: Facebook App quyền `pages_messaging`/webhook `messages` — cần **App Review + page token** từ khách (rủi ro thời gian duyệt).
- **Nhập/Import:** trang `/admin/marketing/ads-stats` nhập chi phí theo ngày×kênh + số L1 cho kênh chưa có webhook; import Excel theo file QC hiện hành.
- **Đối soát:** dashboard hiển thị song song L1 webhook vs L1 file QC theo kênh — lệch để QC kiểm tra.
- Sửa số liệu sau khi kỳ FINALIZED → chặn (yêu cầu mở khóa SUPER_ADMIN + audit).

### 3.2 SLA engine (bước 2–5)
Cron 15 phút quét + `StaffNotification` (dedupeKey chống spam) + email:

| Rule | Điều kiện | Alert tới |
|---|---|---|
| SLA-0 | `PageInboundEvent.firstMessageAt` non-null, `respondedAt` null > **15'** (giờ trực page) | Sale Admin |
| SLA-1 | Lead `qualifiedAt` non-null, `handedAt` null > **4h** | Sale Admin + QL TT |
| SLA-2 | `handedAt` non-null, `assignedAt` null > **30'** | QL TT |
| SLA-3 | `assignedAt` non-null, `firstContactAt` null > **3h** | QL TT (+ Sale) |
| SLA-4 | Báo cáo tuần chưa nộp T2 ≥ 17h / tháng ngày 01 ≥ 17h | QL TT + TGĐ |

### 3.3 Commission Engine (bước 6 + mục 4)
- **Trigger:** cron ngày 01 hằng tháng tạo `CommissionPeriod DRAFT` cho tháng trước; có nút "tính lại" (DRAFT only).
- **Input:** mọi Order CONFIRMED/COMPLETED trong tháng có `leadId` với lead `commissionSource` thuộc diện khai thác mới (chờ B1/B2).
- **Tính 4 tầng** theo `CommissionRateConfig` (mặc định 1/1/4/2%):
  - QC: 1% × Σ DS L3 có source=MARKETING_ADMIN (toàn TT) — chia cho user QC phụ trách.
  - Admin: 1% × Σ DS L3 từ leads có `adminId` = user đó.
  - Sale: 4% × Σ DS L3 mình chốt (`convertedById`).
  - QL TT: 2% × Σ DS L3 khai thác mới của center mình.
- **Guard:** Σ rate ≤ 8% validate khi sửa config; REFUNDED trong kỳ → dòng âm (clawback, chờ B4).
- **Duyệt:** ACCOUNTANT/TGĐ xem DRAFT → APPROVED (khóa) → export Excel bảng lương → PAID.

### 3.4 Cost Allocation (bước 8)
- Cron ngày 01: tạo `CostAllocationPeriod DRAFT` — tổng cost từ `AdsDailyStat`, đếm L2 theo `qualifiedAt` trong tháng per center, tính CPL/CPA/CP_TT.
- Kế toán Hội sở review, có thể nhập đè `totalQcCost` (số quyết toán) → FINALIZED **trước ngày 05** (SLA-5 alert nếu trễ).

### 3.5 Dashboard & báo cáo (bước 7)
- `/admin/crm` mở rộng: funnel L1→L2→L3 theo ngày/kênh/TT, conversion rate, CPL/CPA tháng hiện tại (ước tính realtime), DS theo Sale.
- **Dashboard thu lead Messenger** (yêu cầu 7.3 phiếu #01): hội thoại vào page theo ngày/kênh, thời gian phản hồi trung bình, tỉ lệ L1→L2, đối soát webhook vs file QC.
- Báo cáo tuần/tháng: nút "Nộp báo cáo" của QL TT (snapshot số liệu + ghi chú) → TGĐ xem danh sách; trễ hạn → SLA-4.
- Export Excel: 3 format theo file mẫu QC/Admin/TT (chờ B7 nhận file).

## 4. Phân quyền (mở rộng `ALL_ACTIONS`)

| Action mới | Role |
|---|---|
| `ads-stats:edit` | MARKETING, SUPER_ADMIN |
| `commission:view-own` | mọi staff (xem hoa hồng của mình) |
| `commission:view-all`, `commission:approve` | ACCOUNTANT, SUPER_ADMIN (TGĐ) |
| `commission:config` | SUPER_ADMIN |
| `cost-allocation:manage` | ACCOUNTANT, SUPER_ADMIN |
| `crm-report:submit` | CENTER_MANAGER |
| `crm-report:view-all` | SUPER_ADMIN, ACCOUNTANT |

## 5. Điểm mở (chờ trả lời nhóm B trước khi code)

B1 thời điểm L3 · B2 loại trừ tái tục · B3 referral · B4 clawback · B5 đổi sale · B6 kỳ tính CPL · B7 file Excel mẫu · B8 phạm vi hạch toán · B9 kênh alert. → Đã đề xuất phương án trong `03-cau-hoi-xac-nhan-khach-hang.md`; spec này viết theo phương án đề xuất, sẽ điều chỉnh khi khách chốt khác.

## 6. Tiêu chí nghiệm thu mức epic

1. Số liệu funnel tháng chạy thử khớp 100% với 3 file Excel đối chiếu cùng kỳ.
2. Bảng hoa hồng tháng đầu được Kế toán xác nhận đúng từng người (chênh lệch = 0đ).
3. Mọi alert SLA bắn đúng ngưỡng giờ (test giả lập).
4. Mọi thao tác APPROVE/FINALIZE/RECALC có audit log.
5. CPL/CPA hiển thị dashboard = công thức văn bản SR.QD.217.
