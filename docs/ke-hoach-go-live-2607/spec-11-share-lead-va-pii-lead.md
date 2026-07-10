# Spec #11 — 2 ticket: "dùng chung" lead + field-level PII lead (trình BGĐ/Kiệt duyệt)

> Ngày 09/07/2026 · lane #11 (P2, KHÔNG bắt buộc go-live) · nguồn: phiếu BGĐ **câu 10** + **OI-4** Doc 15
> **DoD lane #11:** spec này được **duyệt bằng văn bản TRƯỚC khi code** (thêm addendum hoặc note đã ký).
> Doc này chỉ **trình phương án + câu hỏi**; KHÔNG tự quyết quyền (rút kinh nghiệm "agent tự suy luận quyền bị chặn").

---

## Ticket 1 — Nút "dùng chung" data khách hàng (Sale/CSKH)

### Nguồn (câu 10 BGĐ, mục Tư vấn/CSKH)
> "…nên có 1 nút chọn **dùng chung** cho các data khách hàng muốn chia sẻ thì các thành viên cskh khác
> trong trung tâm có thể nhìn thấy chung để cùng hỗ trợ."

### Vì sao KHÔNG seed thêm quyền là xong
Cơ chế hiện tại: `leads:view-own` scope **OWN** (mỗi sale thấy lead của mình). "Chia sẻ theo từng bản ghi"
là **per-record opt-in** — không khớp 6 giá trị `ScopeType` (GLOBAL/CENTER/CLASS/OWN/CHILDREN/ASSIGNED).
Không có `ScopeType` nào diễn tả được "lead này owner đã bật chia sẻ". Phải xử ở **tầng query**, không đụng `can()`.

### Thiết kế đề xuất (giữ RBAC sạch)
1. **Migration additive:** `Lead.isSharedWithTeam Boolean @default(false)` (+ optional `sharedAt`, `sharedById`
   để audit hiển thị "ai chia sẻ, khi nào"). Không drop cột nào — 2-phase an toàn.
2. **Toggle trên lead detail** — ghi `writeAudit` mỗi lần bật/tắt (module `crm`, action `lead.share-toggle`).
3. **Logic đọc** mở rộng ở tầng query (KHÔNG ở `scopedDb`/`scopeType`):
   `WHERE assigneeId = me OR (isSharedWithTeam = true AND centerId IN visibleCenterIds)`.
   → cách ly cơ sở vẫn do `scopedDb` gác (`centerId IN visibleCenterIds`); "dùng chung" chỉ nới **trong cùng cơ sở**.
4. **Badge "được chia sẻ"** trên list + detail để phân biệt lead của mình vs lead được chia sẻ.

### ❓ Câu hỏi BGĐ/Kiệt phải chốt TRƯỚC khi code
| # | Câu hỏi | Mặc định đề xuất (chờ xác nhận) |
|---|---|---|
| Q1 | **Ai được bật** nút chia sẻ? Chỉ owner (assignee)? Hay cả QL cơ sở? | Owner **hoặc** QL cơ sở (CENTER_MANAGER) |
| Q2 | Lead đã chia sẻ: người khác được **SỬA** hay chỉ **XEM**? | Chỉ **XEM** + ghi chú; SỬA vẫn của owner (tránh giẫm chân) |
| Q3 | Có cho **thu hồi** chia sẻ (tắt lại) không? Ai được tắt? | Có — owner hoặc QL tắt được |
| Q4 | Chia sẻ trong **cơ sở** hay toàn hệ thống? | Trong **cơ sở** (`centerId IN visibleCenterIds`) — an toàn nhất |
| Q5 | Có giới hạn **CSKH** thấy, hay mọi role trong cơ sở? | Chỉ role có `leads:view-own` (Sale/CSKH) trong cơ sở |

**Est sau khi có spec ký:** ~1.5d (migration + toggle + query mở rộng + badge + e2e cách ly cơ sở).

---

## Ticket 2 — Field-level PII cho `leads:*` (Marketing / HO_SALE — OI-4)

### Nguồn (OI-4 Doc 15 + mapping đã duyệt)
`HO_MARKETING` (và HO_SALE nếu tách sau) có `leads:view-all` **GLOBAL** ⇒ xem được **PII** (SĐT, tên
PH/HS, lịch sử tư vấn) **toàn hệ thống**. Blueprint OI-4 yêu cầu: PII cho role HO phải **"tuỳ permission
admin cấp"**, không mặc định. Ghi chú cảnh báo đã có sẵn trong `seed-roles.ts` ở block `HO_MARKETING`
("⚠️ Escalate riêng OI-4 … leads:view-all kèm PII chưa có field-level tách riêng").

### Vì sao KHÔNG làm ngay được
`Action` type hiện chỉ có field-level cho **Employee** (`employees:view-salary` / `view-personal`).
`leads:*` chưa tách PII khỏi metadata. (Tiền lệ đã có: #15 vừa thêm `payments:view-pii` cho phiếu thu.)

### 2 phương án (Kiệt chọn 1)
| | (A) Action con `leads:view-pii` | (B) `UserPermissionGrant` thuần |
|---|---|---|
| Cách làm | Thêm `leads:view-pii` vào registry; UI mask SĐT/email/tên khi thiếu action; seed **KHÔNG** cấp mặc định cho HO_MARKETING/HO_SALE, cấp per-user qua grant khi cần | Không thêm action; helper `canViewLeadPII(actor)` đọc `UserPermissionGrant` per-user + mask ở UI |
| Ưu | **Nhất quán** pattern `employees:*` + `payments:view-pii` (#15); introspect được | Nhanh (~1d) |
| Nhược | Phải rà **~15 điểm render PII lead** | Lệch pattern; khó introspect; dễ sót điểm render |
| Est | ~2d | ~1d |
| **Đề xuất** | ✅ **(A)** — nhất quán với `payments:view-pii` #15 vừa ship; reveal có reason+audit như #05 | |

### ❓ Câu hỏi phải chốt
| # | Câu hỏi | Đề xuất |
|---|---|---|
| Q6 | Chọn **(A)** hay **(B)**? | (A) — đồng bộ `payments:view-pii` #15 |
| Q7 | "PII lead" gồm những field nào? | SĐT, email, tên PH, tên HS, lịch sử tư vấn (nội dung) |
| Q8 | Reveal PII có cần **reason + audit** như #05 break-glass không? | Có — dùng lại pattern `revealPaymentsPii` (#15) |
| Q9 | Mặc định role nào **được** xem PII lead (không cần grant)? | SALES_CSM/CENTER_MANAGER trong cơ sở (đang trực tiếp CSKH); HO_MARKETING/HO_SALE **không** mặc định |

**Est sau khi chọn:** (A) ~2d · (B) ~1d.

---

## DoD chung (bám plan gốc)
- [ ] Spec này **duyệt bằng văn bản** (addendum/note đã ký) TRƯỚC khi code — chốt Q1–Q9.
- [ ] Mỗi ticket **1 PR riêng + e2e riêng**.
- [ ] Ticket 1: e2e cách ly cơ sở (CS1 chia sẻ → CS2 KHÔNG thấy).
- [ ] Ticket 2: e2e mask PII khi thiếu quyền + reveal có audit+reason.

## Trạng thái
🟢 **ĐÃ KÝ 10/07 (Kiệt: "không có chỉnh sửa" — theo đúng mặc định đề xuất Q1–Q9)** → code cùng ngày.

### Ghi chú thực thi (10/07)
- **Q1–Q5 (T1):** `Lead.isSharedWithTeam/sharedAt/sharedById` + `toggleLeadShareAction` (owner/QL) +
  guard 6 mutator (owner-hoặc-view-all; `addLeadActivity` giữ mở = "ghi chú") + mở rộng read view-own
  `OR isSharedWithTeam` (AND-wrap, scopedDb cách ly Q4). Pending-tasks + KPI sales-dashboard GIỮ owner-only
  (lead chia sẻ không phải việc-phải-nhắc/thành tích của viewer).
- **Q6–Q7, Q9 (T2):** action `leads:view-pii` (v1 matrix SA/CM/SALES_CSM; v2 seed CM+CENTER_SALES_CSM GLOBAL);
  mask server-side 5 nhóm field (SĐT/email/tên PH/tên HS/nội dung tư vấn) tại list + detail + activities +
  children + export CSV + messenger + oracle trùng-SĐT. `canViewLeadPii` cố ý v1-only tới sau flip #09
  (né bẩn shadow); MARKETING cần xem → Kiệt cấp grant per-user tại `/admin/users/[id]/permissions`.
- **Q8 (reveal):** thực thi ở granularity **grant per-user** — cấp `leads:view-pii` qua UI grant (bắt buộc
  reason + `RbacAuditLog`) rồi thấy raw; KHÔNG làm nút reveal per-lead vì với mặc định Q9 nó không có
  đối tượng dùng hợp lý (holder thấy thẳng để làm việc; non-holder mà tự reveal được thì mask vô nghĩa).
  Nếu Kiệt muốn ceremony per-lead (như `revealPaymentsPii` #15) → follow-up ~0.5d, pattern sẵn.
- **Edit page:** thêm 2 lớp gate (ownership + PII) — MARKETING không còn vào form edit lead (form prefill
  PII raw + nguy cơ save đè bản mask); tạo lead + import vẫn nguyên.
