# Bàn giao lead (Cụm C2)

## Bối cảnh

Sale nghỉ việc → cần chuyển hàng loạt lead của họ sang sale khác mà **không sửa tài khoản
sale cũ** (giữ nguyên record User để truy vết).

## Model (additive, migration `20260601080000_lead_assignment_history`)

`LeadAssignmentHistory` (leadId, fromUserId, toUserId, assignedById, reason, createdAt) —
mỗi lần bàn giao 1 lead ghi 1 dòng.

## Service (`lib/lead-handover/service.ts`)

- `previewHandover(fromUserId, filters)` → đếm số lead khớp (xem trước, không đổi gì).
- `bulkReassignLeads({ fromUserId, toUserId, filters, actor, reason })`:
  - Lọc lead: `assignedToId = fromUserId`, deletedAt null + `statuses` (in) + `campaign` (utmCampaign)
    + `onlyActive` (loại ENROLLED/LOST/DUPLICATE).
  - Mỗi lead (transaction): đổi `assignedToId` → sale mới + cập nhật `handoverNote`;
    ghi `LeadAssignmentHistory`; chuyển `LeadTask` OPEN của sale cũ → sale mới; `logLeadAudit` ASSIGN.
  - **KHÔNG** sửa record sale cũ.

## UI

- Admin `/admin/ban-giao-lead` (gate `leads:assign` = SUPER_ADMIN/CENTER_MANAGER, center scope):
  chọn sale nguồn + sale đích, lọc trạng thái/chiến dịch/chỉ-chưa-đóng, **Xem trước số lead** rồi
  **Thực hiện**. Báo số lead + số task đã chuyển.

## Test (ZZTEST_)

1. Tạo vài lead `ZZTEST_*` gán cho sale A (vài trạng thái + 1 LeadTask OPEN).
2. Xem trước với onlyActive → đúng số lead chưa đóng.
3. Thực hiện sang sale B → lead đổi assignedToId, LeadAssignmentHistory + LeadAuditLog ASSIGN ghi,
   task OPEN chuyển sang B. Tài khoản sale A không đổi.
