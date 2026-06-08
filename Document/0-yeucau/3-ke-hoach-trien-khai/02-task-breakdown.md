# Task breakdown chi tiết — A0 → R1 & R2 (sẵn sàng giao việc)

> Task ID: `R<release>.<sprint>-T<n>` · Layer: DB / BE / FE / QA / OPS.
> Quy ước thực hiện: theo `CLAUDE.md` (server-first, Zod, assertCan, audit, migration đặt tên rõ; verify trước khi PASS). R3/R4 sẽ breakdown khi R1 gần xong (tránh spec mục chưa chốt).
> 🔄 **ĐỒNG BỘ DOC 15 (2026-06-06):** **A0 chạy TRƯỚC R1** theo 8 PR dưới đây. R1 tasks trong file này thực thi TRÊN NỀN A0 (dùng `scopedDb`, can() v2, OrgUnit thay center hardcode, DomainEvent cho consumer). Khi xung đột, Doc 15 thắng.

---

## A0 — Foundation (8 PR — spec đầy đủ: Doc 15 "A0 PR breakdown" + §10 DoD + Doc 12 mục 10 test)

| PR | Nội dung | Test gate chính |
|---|---|---|
| PR-A0-01 | OrgUnit schema + seed ROOT/HO/CS1/CS2 | HO≠CS2 dù cùng address; unique code; no cycle; thêm CS3 không đổi logic |
| PR-A0-02 | RoleDef + Permission + UserOrgRole + UI cấp quyền | Multi-role/multi-org; effectivity; chỉ SUPER_ADMIN quản role + audit/reason |
| PR-A0-03 | ActorResolver + can() v2 | ALLOW thắng ≥1 role; HO cross-center theo chức năng; không DENY |
| PR-A0-04 | scopedDb | CS1⛔CS2 hai chiều; HO_SALE lead scope A&B xem-không-sửa |
| PR-A0-05 | Common login + redirect | staff→admin, parent→hocvien; route-policy tests |
| PR-A0-06 | AuditLog hợp nhất | Role/org/permission changes; export audit được audit lại |
| PR-A0-07 | DomainEvent outbox + dispatcher | Retry + idempotent handler |
| PR-A0-08 | EmployeeOrgAssignment foundation | 5 assignmentType + allocationPercent + effectivity; KHÔNG sinh quyền |

---

## R1.1 — Phễu LEADS (Messenger webhook) + nhập liệu QC

| ID | Layer | Task | Ghi chú / DoD |
|---|---|---|---|
| R1.1-T0 | OPS | Xin FB page access token + nộp **App Review** quyền webhook `messages` (làm NGAY — đường găng) | Khách cung cấp quyền admin page |
| R1.1-T1 | DB | Migration `add_funnel_timestamps_to_lead`: `qualifiedAt, handedAt, receivedConfirmedAt, assignedAt, firstContactAt, commissionSource (enum), adminId FK` + index `(centerId, qualifiedAt)`, `(commissionSource)` | Restart dev sau migrate |
| R1.1-T2 | DB | Migration `add_ads_daily_stat_page_inbound`: `AdsDailyStat` (unique `(date, channel)`) + `PageInboundEvent` (unique `(source, externalId)`, index `(channel, firstMessageAt)`) | |
| R1.1-T2b | BE | Webhook `/api/public/webhook/facebook-messenger`: verify token + signature, ghi `PageInboundEvent` idempotent, cập nhật `respondedAt` khi page reply (echo event); luôn trả 200 | Tái dùng pattern WebhookDelivery |
| R1.1-T3 | BE | Backfill script `scripts/backfill-lead-funnel-timestamps.ts` (suy từ LeadActivity/Audit hiện có, DRY-RUN mặc định) | Số lead backfill được report ra console |
| R1.1-T4 | BE | Validator `lib/validators/ads-stat.ts` + actions CRUD `ads-stats` (assertCan `ads-stats:edit`) + import Excel handler `/api/admin/import/ads-stats` | Lỗi từng dòng trả về rõ |
| R1.1-T4b | BE | Action nối `PageInboundEvent.leadId` khi Sale Admin tạo lead từ hội thoại (đo tỉ lệ L1→L2) | |
| R1.1-T5 | BE | Hook timestamps vào server actions lead hiện có: tạo lead đủ phone+summary → `qualifiedAt`; chọn TT → `handedAt`; assign → `assignedAt`; activity CALL/MESSAGE đầu → `firstContactAt` | Không đổi flow UI hiện tại |
| R1.1-T6 | BE | Action `confirmLeadReceived` (QL TT) → `receivedConfirmedAt` + audit | |
| R1.1-T7 | FE | Trang `/admin/marketing/ads-stats` (bảng tháng, form nhập ngày×kênh, nút import, tổng cost/L1) | shadcn only |
| R1.1-T8 | FE | Cột thời gian phễu + badge "chờ TT xác nhận" trên `/admin/leads`; nút Tiếp nhận cho QL TT | |
| R1.1-T9 | BE | Thêm actions mới vào `ALL_ACTIONS` + matrix (`ads-stats:edit`…) | route-policy/permissions test cập nhật |
| R1.1-T10 | QA | Unit: chuyển timestamp đúng thứ tự, không ghi đè; import ads-stats validate | `pnpm test:unit` xanh |

## R1.2 — SLA Engine

| ID | Layer | Task | Ghi chú |
|---|---|---|---|
| R1.2-T1 | BE | `lib/crm/sla.ts` (target: `modules/crm`): pure functions phát hiện vi phạm SLA từ timestamps (unit-test được, inject `now`) | Rule theo **Doc 15 §5.4**: phản hồi **5'** / bàn giao 4h / phân công 30' / liên hệ **3h** / lead im **2 ngày** / báo cáo hạn |
| R1.2-T2 | BE | Cron route `/api/cron/crm-sla` (15') → quét → `StaffNotification` (dedupeKey `sla:<rule>:<leadId>`) + email | Thêm vào `vercel.json` |
| R1.2-T3 | FE | Tab "Quá hạn SLA" trên `/admin/leads` (filter vi phạm, sort theo thời gian chờ) | |
| R1.2-T4 | QA | Unit `sla.test.ts` đủ biên 5'/4h/30'/3h/2 ngày (trước/đúng/sau ngưỡng, đã xử lý thì thôi) | |
| R1.2-T5 | OPS | Env check `CRON_SECRET`; cập nhật Doc 4 (cron mới) | |

## R1.3 — Commission Engine ⚠️ (chặn bởi câu hỏi B1–B5)

| ID | Layer | Task | Ghi chú |
|---|---|---|---|
| R1.3-T1 | DB | Migration `add_commission_engine`: `CommissionPeriod`, `CommissionItem`, `CommissionRateConfig`, enums + seed config 1/1/4/2% | |
| R1.3-T2 | BE | `lib/commission/calc.ts`: pure function `(orders, leads, config) → items[]` — 4 tầng + loại tái tục (B2) + clawback input (B4) | **Trái tim module — coverage 100% nhánh** |
| R1.3-T3 | BE | Job tạo kỳ DRAFT (cron ngày 01 + nút chạy tay), action recalc (DRAFT only) + audit | |
| R1.3-T4 | BE | Actions duyệt: DRAFT→APPROVED→PAID, mở khóa SUPER_ADMIN + lý do + audit; validate Σrate ≤ 8% khi sửa config | |
| R1.3-T5 | FE | `/admin/commission`: danh sách kỳ → chi tiết (group theo người, expand orderId cấu thành) → duyệt/export | ACCOUNTANT/SUPER_ADMIN |
| R1.3-T6 | FE | `/admin/commission/cua-toi`: tạm tính tháng hiện tại + lịch sử của user | mọi staff |
| R1.3-T7 | BE | Export Excel bảng hoa hồng (xlsx) | |
| R1.3-T8 | QA | Unit `calc.test.ts`: case chuẩn 4 tầng, refund clawback, đổi sale (B5), nguồn referral (B3), tháng không có L3 | Đối chiếu 1 bộ số liệu tay từ kế toán |

## R1.4 — Cost Allocation

| ID | Layer | Task |
|---|---|---|
| R1.4-T1 | DB | Migration `add_cost_allocation`: `CostAllocationPeriod`, `CostAllocationLine`, enum |
| R1.4-T2 | BE | `lib/cost-allocation/calc.ts` (pure: CPL/CPA/CP_TT theo B6) + job ngày 01 + action nhập đè cost + FINALIZE + audit |
| R1.4-T3 | FE | `/admin/cost-allocation`: kỳ → bảng CPL/CPA + line per TT → chốt → export |
| R1.4-T4 | BE | Alert ngày 05 chưa CONFIRMED (trạng thái kỳ theo Doc 15: DRAFT/CONFIRMED/REOPENED — gắn vào cron crm-sla) |
| R1.4-T5 | QA | Unit calc (chia 0 khi L2=0, làm tròn VND) |

## R1.5 — Dashboard + Báo cáo + Export

| ID | Layer | Task |
|---|---|---|
| R1.5-T1 | BE | Query aggregate funnel: L1 (PageInboundEvent + AdsDailyStat) / L2 (`qualifiedAt`) / L3 (`convertedAt`) theo ngày/kênh/TT + CR + DS theo Sale |
| R1.5-T2 | FE | Mở rộng `/admin/crm`: FunnelChart L1→L2→L3, line CPL/CPA theo tháng, bảng DS Sale; filter TT/kỳ; scope theo role |
| R1.5-T2b | FE | **Dashboard thu lead Messenger** (yêu cầu 7.3): hội thoại/ngày/kênh, thời gian phản hồi TB, tỉ lệ L1→L2, bảng đối soát webhook vs file QC |
| R1.5-T3 | DB+BE | `CrmReport` (snapshot tuần/tháng) + action nộp + danh sách TGĐ + alert hạn (cron) |
| R1.5-T4 | BE | Export Excel 3 format theo file mẫu (B7) — `lib/crm/export-{qc,admin,tt}.ts` |
| R1.5-T5 | QA | E2E: login QL TT → dashboard đúng scope → nộp báo cáo; số liệu khớp seed cố định |
| R1.5-T6 | OPS | Demo + chạy song song 1 tháng với Excel; biên bản đối chiếu |

## R2.1 — Cảnh báo trùng lịch & sức chứa

| ID | Layer | Task |
|---|---|---|
| R2.1-T1 | BE | `lib/classes/conflict.ts`: `findRoomConflicts / findTeacherConflicts / checkCapacity` (pure, nhận danh sách session/class) |
| R2.1-T2 | BE | Tích hợp vào actions: tạo/sửa Class, dời/tạo Session, tạo Enrollment — trả `{ ok:false, conflicts[] }` hoặc cờ `confirmOverride` |
| R2.1-T3 | FE | Dialog cảnh báo liệt kê xung đột (2-click override, riêng capacity chặn cứng + gợi ý lớp còn chỗ) |
| R2.1-T4 | QA | Unit conflict (giao nhau biên: chạm đầu giờ không tính trùng…) + e2e tạo lớp trùng phòng |

## R2.2 — TKB Portal

| ID | Layer | Task |
|---|---|---|
| R2.2-T1 | FE | `/portal/lich-hoc`: view tuần (mặc định) + tháng; nhãn buổi dời/lễ/học bù; RSC query theo con đang chọn |
| R2.2-T2 | QA | E2E portal: PARENT login → đúng lịch con; mobile 375px |

## R2.3 — Consent dữ liệu

| ID | Layer | Task |
|---|---|---|
| R2.3-T1 | DB | Migration `add_student_consent`: `StudentConsent` (type, grantedAt, revokedAt, byParentUserId, source) |
| R2.3-T2 | BE | Actions cấp/thu hồi (portal: own-child; admin: theo phiếu ký) + audit |
| R2.3-T3 | BE | Enforce: query media portal join consent PHOTO active; chặn tag HS đã từ chối |
| R2.3-T4 | FE | Portal `/portal/ho-so` khối consent; admin: badge thiếu consent ở màn tag ảnh |
| R2.3-T5 | QA | Unit enforce + e2e thu hồi → ảnh ẩn tag |

---

## Định nghĩa hoàn thành (DoD) chung mọi task

1. `pnpm typecheck && pnpm lint && pnpm build` PASS.
2. Server action mới có `auth()` + `assertCan` + Zod; action nhạy cảm có audit log.
3. Logic tính toán nằm trong `lib/` dạng pure function + unit test.
4. Migration tên rõ nghĩa; restart dev sau migrate.
5. UI đúng library theo site (admin: shadcn; portal: client rules) + mobile 375px với trang portal.
6. Cập nhật `Document/` liên quan khi đổi schema/API/flow (doc 3, 7, 8, 9).
