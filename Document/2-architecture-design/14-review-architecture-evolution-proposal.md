# Doc 14 — Review: "SataRobo Architecture Evolution Proposal"

> ⚠️ **SUPERSEDED — chỉ là tham chiếu lịch sử.** Bản chốt: Doc 15 v2. Khác biệt đã chốt lại sau review này: resolution **không còn DENY override** (ALLOW thắng nếu ≥1 role cho phép — Doc 15 OI-7) · cấu trúc **ROOT → HO/CS1/CS2 độc lập ngang hàng** (không phải HO chứa Center) · không có HO_MANAGER. Không dùng file này làm spec.

> **Tài liệu được review:** `Document/0-yeucau/SataRobo_Architecture_Evolution_Proposal.md` (CEO soạn, 2026-06-05).
> **Đối chiếu với:** hiện trạng codebase (Doc 2–6) + đề xuất Doc 13 + quyết định scope đã chốt trong `0-yeucau/`.
> **Người review:** Tech Lead (Claude) — vai trò phản biện kỹ thuật.

---

## 1. KẾT LUẬN TỔNG QUAN

**Hướng đi: ĐÚNG và trùng ~80% với Doc 13.** Các quyết định chiến lược đều chuẩn:

| Quyết định trong proposal | Đánh giá |
|---|---|
| ❌ Không chuyển microservices | ✅ Đúng tuyệt đối với team size + Vercel |
| Modular Monolith | ✅ Trùng Doc 13 §2.5 |
| Dynamic RBAC (bỏ enum) | ✅ Trùng Doc 13 §2.2 |
| Organization Hierarchy (HO → Center → Franchise) | ✅ Trùng Doc 13 §2.1, mở rộng thêm PARTNER/FRANCHISE/CAMPUS — hợp lý |
| Event Driven internal | ✅ Trùng Doc 13 §2.4 |
| Multi-tenant ready | ✅ Đúng tầm nhìn (SR217 nhượng quyền) |
| **Scope-Based Authorization** (GLOBAL/CENTER/CLASS/OWN/CHILDREN/ASSIGNED) | ⭐ **Điểm proposal LÀM TỐT HƠN Doc 13** — Doc 13 chỉ có scope theo org-subtree; chiều scope ABAC này khớp đúng nhu cầu thật đang có trong code (`students:view-own-class` của TEACHER, `assertOwnsStudent` của PARENT) → **nên adopt** |
| AuditLog hợp nhất 1 bảng | ✅ Trùng Doc 13 §2.6 |
| Integration Module — "không module nào gọi trực tiếp hệ thống ngoài" | ✅ Rule rất tốt, Doc 13 chưa phát biểu tường minh → **nên adopt** |

**Nhưng ở mức thực thi, proposal CHƯA tối ưu** — 4 nhóm vấn đề dưới đây cần xử lý trước khi coi là blueprint cuối.

---

## 2. NHÓM A — Chẩn đoán hiện trạng chưa chính xác (ảnh hưởng sizing)

| Proposal nói | Thực tế codebase | Hệ quả nếu không sửa |
|---|---|---|
| Bảng §14: "Centers: **Single Center**" | Hệ thống **đã multi-center**: `centerId` trên ~30 models, `LeadAssignmentConfig` per center, geofence per center, StockBalance per center | Phase 2 "Multi Center" bị ước lượng thừa — cái thiếu là **HO + cây tổ chức + scope enforced**, không phải multi-center |
| §1: Role hardcode liệt kê 4 role | 8 role (+ per-user grant ALLOW/DENY đã chạy từ Sprint 5.3) | RBAC mới **phải tích hợp grants hiện có**, proposal không nhắc → mất tính năng nếu bỏ sót |
| §14: "Audit: **Partial**" | Audit **đậm**: 8 bảng `*AuditLog` + RoleAuditLog + EnrollmentAuditLog + OrderStatusHistory + TimesheetEditLog | Vấn đề thật là **trùng lặp** (8 bảng copy nhau) chứ không phải thiếu — giải pháp là hợp nhất, đúng như §9 proposal đề xuất, nhưng cần kế hoạch chuyển đổi 8 bảng cũ |
| §1 sơ đồ coupling `CRM → Student → Finance → Notification` | Đúng bản chất nhưng thiếu các luồng nặng nhất: `attendance.marked` → 4 hệ, `order.confirmed` → 5 hệ (Doc 9/10 đã vẽ chi tiết) | Phase 3 Event Bus nên ưu tiên 2 luồng này trước (nhiều consumer nhất) |

## 3. NHÓM B — Mâu thuẫn với quyết định scope ĐÃ CHỐT (cùng ngày!)

Đây là mâu thuẫn nội bộ lớn nhất cần anh tự quyết:

| Proposal có | Quyết định đã chốt 2026-06-05 (anh tự sửa phiếu) |
|---|---|
| §11 AI Architecture (AI Gateway, AI Tutor, AI Learning Path, AI CRM Assistant), §14 "AI Ready: Native" | **Loại toàn bộ hạng mục AI** khỏi scope |
| §7 Attendance module chứa "Face Recognition, IoT, Geofencing (HV)" | AI camera + IoT vòng đeo **đã loại** |
| §10 Integration có "AI Camera, Blockchain" | NFT/Blockchain **đã loại** |
| Frontend Layer có "**Student Portal**" | Hiện chỉ có Parent Portal; HV lớp 1–8 tự đăng nhập là **quyết định sản phẩm mới** (chưa ai duyệt) + cân nhắc bảo vệ trẻ em |

**Khuyến nghị:** không cần xóa khỏi proposal — nhưng phải **tách 2 tầng rõ ràng**:
- **Tầng "Vision 5–10 năm"** (AI Gateway, Blockchain, Marketplace, SaaS): chỉ là *placeholder kiến trúc* — thiết kế hiện tại "không đóng cửa" với chúng (event bus + integration module + org tree đã đảm bảo điều đó), **không nằm trong roadmap thực thi**.
- **Tầng "Refactoring roadmap thực thi"** (Phase 1–4): chỉ chứa thứ phục vụ SR217 + QL HV — đây mới là cam kết.

Nếu để lẫn (như §13 Phase 5 hiện tại), team/đối tác đọc sẽ hiểu nhầm AI/Blockchain là cam kết → đúng rủi ro "quản lý kỳ vọng" PM đã ghi.

## 4. NHÓM C — Rủi ro kỹ thuật trong giải pháp đề xuất

### C1. Event cho luồng TIỀN — sai chỗ nguy hiểm nhất ⚠️
Sơ đồ §6: `LeadConverted → SIS Create Student / Finance Create Invoice (async)`.
**Vấn đề:** tạo Student + Invoice là bước **giao dịch nghiệp vụ cần atomic** — nếu chạy async qua event: lead đã "converted" nhưng student/invoice tạo trễ hoặc fail → sale không thấy hồ sơ, tiền không khớp (đúng loại tranh chấp SR217 muốn tránh).
**Sửa:** quy tắc Doc 13 §2.4 — *inline transaction cho hệ quả atomic (student, enrollment, invoice, trừ kho); event chỉ cho side-effects (notification, analytics, commission stats, coin)*. Sơ đồ nên đổi: `LeadConverted` (đã gồm student+invoice trong transaction) → event → Notification + Analytics + Commission.

### C2. Event Bus trên Vercel serverless — thiếu cơ chế cụ thể
§2 ghi "Event Bus / Internal Queue / Workflow Automation" nhưng không nói chạy bằng gì. **Vercel không có process thường trú** → bắt buộc là **outbox table + cron dispatcher** (pattern EmailQueue đã chạy tốt trong repo — Doc 13 §2.4 đã spec sẵn `DomainEvent`). Nếu hiểu là message broker (Kafka/Rabbit) thì mâu thuẫn với "không microservice" + hạ tầng hiện tại.

### C3. PostgreSQL tách schema vật lý (§8 phương án 1) — chi phí > lợi ích
Tách `identity/crm/sis/...` thành **Postgres schemas** với 138 bảng đang có FK chéo dày đặc = migration rất nặng, Prisma multiSchema + cross-schema FK phức tạp, **không đem lại isolation thật** (vẫn 1 DB).
**Khuyến nghị:** chọn **phương án 2 của chính proposal** (multi-file Prisma — `prisma/identity.prisma, crm.prisma...`): đạt mục tiêu "schema không phình 1 file" với chi phí ~0. Tách schema vật lý chỉ làm khi thật sự đi SaaS (Phase 5, nếu xảy ra).

### C4. `tenant_id` required trên mọi bảng ngay bây giờ — quá sớm
Thêm `tenant_id` cho ~138 bảng = migration khổng lồ + mọi query đổi, trong khi **chưa có tenant thứ 2**.
**Khuyến nghị (trade-off hợp lý):** `OrgUnit` tree đã cho 80% nền multi-tenant (tenant = 1 subtree/root). Quy ước: **bảng MỚI từ nay có `orgUnitId`**; backfill toàn cục `tenantId` chỉ khi ký đối tác SaaS đầu tiên. Ghi rõ trong module template.

### C5. RBAC model §4 — thiếu 2 mảnh và 1 chỗ mơ hồ
1. **Thiếu per-user grant ALLOW/DENY** (Sprint 5.3 đang chạy, có UI + audit) — model mới phải giữ, thứ tự resolve: `SUPER_ADMIN > DENY > ALLOW > RolePermission`.
2. **Thiếu Action Registry** — `Permission` phải validate against danh sách action có thật trong code (`ALL_ACTIONS` hiện là source of truth cho Zod) — nếu không, admin gõ sai action string là quyền chết im lặng.
3. **`UserScope` đứng riêng là mơ hồ** — scope phải gắn vào **assignment** (user × role × orgUnit), không phải user trần: đề xuất hợp nhất `UserRole + UserScope` → `UserOrgRole(userId, roleId, orgUnitId)` (Doc 13) + mỗi `RolePermission` mang `scopeType` (GLOBAL/CENTER/CLASS/OWN/CHILDREN/ASSIGNED — lấy từ §5 proposal). Đây là bản merge tốt nhất của 2 tài liệu.

### C6. Thiếu lớp ENFORCEMENT cho scope
§5 định nghĩa ngữ nghĩa scope rất tốt nhưng không nói **ai ép buộc nó**. Thiếu nó thì scope chỉ là tài liệu. → `scopedDb(actor)` Prisma extension + ESLint chặn `db` trần (Doc 13 §2.3) chính là mảnh này.

## 5. NHÓM D — Những thứ proposal THIẾU (quyết định thành bại khi hệ thống đang chạy live)

| Thiếu | Vì sao chí mạng |
|---|---|
| **Migration plan từng bước** (backfill enum→RoleDef, centerId→OrgUnit, chạy song song, fallback, drop 2-phase) | Hệ thống đang phục vụ thật hằng ngày — roadmap 5 phase hiện viết như dự án greenfield. Doc 13 Phần 4 (A0.1→A0.5 + DoD) bù đúng mảnh này |
| **Session/JWT redesign** | JWT đang chứa role/grants — chuyển RBAC sang DB mà không gọt token (Doc 13 §2.7) thì quyền mới không có hiệu lực ngay |
| **Sequencing với SR217** | SR.QD.217 có deadline vận hành hằng tháng — roadmap proposal không nói Phase nào xong thì làm được Commission. Cần khớp: Phase 1+2+3 (rút gọn) = A0 ≈ 3 tuần → rồi R1 |
| **Timeline + DoD mỗi phase** | "Phase 1: Dynamic Role" không đo được khi nào xong. Doc 13 có DoD 5 tiêu chí |
| **Thứ tự Phase 1 ↔ 2 ngược** | Dynamic Role (Phase 1) phụ thuộc Organization (Phase 2) — scope của role gắn vào org node. Phải làm **cùng nhau** (A0.1) hoặc Org trước |
| Integration list sót **Meta CAPI + GA4** (đang gọi inline trong `/api/leads`) | Đây là 2 external call vi phạm rule §10 của chính proposal ngay hôm nay |

## 6. BẢN HỢP NHẤT ĐỀ XUẤT (proposal + Doc 13 → blueprint cuối)

| Chủ đề | Lấy từ | Ghi chú |
|---|---|---|
| Org tree (HO/CENTER/CAMPUS/PARTNER/FRANCHISE) | **Proposal** (types đầy đủ hơn Doc 13) | Implement = `OrgUnit` Doc 13 §2.1 |
| RBAC model | **Merge**: `RoleDef/RolePermission/UserOrgRole` (Doc 13) + `scopeType` 6 mức (Proposal §5) + giữ UserPermissionGrant | Resolve: SUPER_ADMIN > DENY > ALLOW > RolePermission@scope |
| Enforcement | **Doc 13** (`scopedDb` + ESLint) | Proposal thiếu |
| Event bus | **Doc 13** (outbox + cron) + quy tắc atomic-vs-event (sửa C1) | Proposal cho sơ đồ business đẹp, giữ làm minh họa sau khi sửa C1 |
| Module boundaries | **Proposal §7** (CRM/SIS/LMS/Attendance/Finance — gọn hơn Doc 13) + Commission nằm trong CRM hay tách? → đề xuất **tách `commission`** vì là tiền + audit nặng | ESLint boundary từ Doc 13 |
| Schema | **Proposal phương án 2** (multi-file Prisma), KHÔNG tách Postgres schema | |
| Audit | **Cả hai** (trùng nhau) + kế hoạch chuyển 8 bảng cũ (Doc 13) | |
| Integration module | **Proposal §10** + bổ sung Meta CAPI/GA4 | |
| Multi-tenant | **Proposal tầm nhìn** + chiến lược trì hoãn `tenantId` (mục C4 trên) | |
| AI/Blockchain/Marketplace/Student Portal | Giữ ở **tầng Vision** — ngoài roadmap thực thi | Khớp scope đã chốt |
| Roadmap thực thi | **Doc 13 Phần 4** (A0 ~3 tuần, DoD đo được) → R1 SR217 | Phase 4–5 proposal = backlog dài hạn |

## 7. TRẢ LỜI CÂU HỎI "ĐÃ TỐI ƯU CHƯA?"

**Chiến lược: ĐÃ tối ưu** — 6 thành phần trong Final Recommendation đều đúng, và 2 đóng góp vượt Doc 13 (scope ABAC 6 mức, integration rule).

**Thực thi: CHƯA** — vì 4 lỗ hổng phải vá trước khi gọi là blueprint:
1. Sửa **C1** (không cho luồng tiền đi qua event async) — đây là điểm duy nhất *sai* về kỹ thuật.
2. Bổ sung **migration plan + DoD + sequencing với SR217** (lấy từ Doc 13 Phần 4).
3. Tách **Vision vs Roadmap thực thi** để khớp scope AI/Blockchain đã loại (Nhóm B).
4. Chốt các lựa chọn Nhóm C: multi-file Prisma (không tách schema), hoãn tenantId, merge RBAC model, outbox-cron.

→ Nếu anh đồng ý mục 6, tôi sẽ hợp nhất proposal của anh + Doc 13 thành **blueprint cuối (Doc 15)** thay thế cả hai, và cập nhật A0 task list trong `0-yeucau/3-ke-hoach-trien-khai/`. 4 câu hỏi cuối Doc 13 vẫn chờ anh trả lời (HO?, duyệt A0?, danh sách role khởi điểm?, ai quản role?).
