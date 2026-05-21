# SataWorld Feature Parity Analysis — satarobo-vn

**Status**: Sprint 5.5 deliverable, finalized 2026-05-21
**Reference system**: SataWorld production (`admin.sataworld.vn`)
**Audit method**: Claude in Chrome read-only navigation
**Scope chosen**: Option B — Robotics + Offline course parity (~25 ngày, 8 sprints)

---

## 1. Scope decisions

### In scope ✅
- Financial foundation (Payment, Order, Voucher, Confirmation flow)
- Student lifecycle states (reserve/resume/dropout/waiting/absent)
- Học cụ Robotics product catalog (kits, sensors, mission blocks)
- Robot rental contracts
- Competition management (Cuộc thi/Vòng loại/Bảng đấu/Đội thi)
- Notification per-course + Email template

### Out of scope ❌
- Thần số học (different vertical)
- Beekids exams (different brand)
- Online course delivery module (defer — activate khi launch online platform)
- Đơn hàng tiếp thị / Affiliate (defer — depends on online course)
- Wallet system (defer — use direct VNPAY gateway, no middleware credit)
- Performance review GV (HR feature, defer P3)
- Certificate templates (defer P3)
- Form builder (skip — too broad)
- Complaint management (defer P3)

### Constraints
- ⛔ KHÔNG modify SataWorld production
- ⛔ KHÔNG clone test data ("DÂDADADA", "Lorem Ipsum", wallet 1 nghìn tỷ tỷ VND, dummy bank "NGUYEN VAN A 999999999")
- ✅ Chỉ lấy structure/patterns/business logic

---

## 2. Gap analysis (in-scope modules)

| # | SataWorld module | satarobo-vn status | Priority | Effort | Sprint |
|---|---|---|---|---|---|
| 1 | Phương thức thanh toán | ❌ Missing | P0 | 1d | 5.6 |
| 2 | Đơn hàng (Course/Exam/Product) | ❌ Missing | P0 | 2d | 5.6 |
| 3 | Voucher / Mã KM (4 loại) | ❌ Missing | P0 | 3d | 5.7 |
| 4 | Manual confirmation flow | ❌ Missing | P0 | 1.5d | 5.8 |
| 5 | Transaction history (deposit/withdraw) | ❌ Missing | P0 | 0.5d | 5.8 |
| 6 | Student lifecycle states | ⚠️ Partial (enum only) | P1 | 3d | 5.9 |
| 7 | Học cụ Robotics product | ⚠️ Partial (inventory yes, product no) | P1 | 3d | 5.10 |
| 8 | Cuộc thi + 5 sub-modules | ❌ Missing | P2 | 5d | 5.11 |
| 9 | Hợp đồng cho thuê Robot | ❌ Missing | P2 | 3d | 5.12 |
| 10 | Notification per-course config | ❌ Missing | P2 | 2d | 5.13 |
| 11 | Email template module | ❌ Missing | P2 | 1d | 5.13 |

**Total: 25 ngày work**

---

## 3. Modules already covered by satarobo-vn

Modules satarobo-vn đã có equivalent (no gap):

| satarobo-vn module | SataWorld equivalent | Note |
|---|---|---|
| `centers` + `rooms` + `holidays` | Chi nhánh + Phòng + Nghỉ lễ | ✅ Full |
| `classes` + `sessions` + `attendance` | Lớp + Buổi + Điểm danh | ✅ Full |
| `students` + `enrollments` | Học sinh + Đăng ký | ✅ Core |
| `teachers` + `nhan-su` (Employee) | Giáo viên + Nhân sự | ✅ Full |
| `curriculums` + `documents` + `assignments` | Khung CT + Tài liệu + Bài tập | ✅ Full |
| `exams` + `questions` | Kỳ thi + Câu hỏi | ✅ Full |
| `leads` + `marketing` + `news` | CRM Lead + Marketing + News | ✅ Full |
| `jobs` (JobPosting) | HR Recruitment | ✅ Full |
| `inventory` + `kits` | Kho + Bộ học cụ | ⚠️ Partial — cần Product layer (Sprint 5.10) |
| `audit-log` (5-tab) | (chưa thấy trong SataWorld) | ✅ **Advantage** |
| `users` + permissions | Tài khoản + Vai trò | ✅ **Advantage** — per-user grant chưa thấy ở SataWorld |
| `honors` (vinh danh) | (chưa thấy) | ✅ **Advantage** |
| `site-content` | (chưa thấy) | ✅ Custom |

---

## 4. Sprint roadmap

### Phase 1 — Financial Foundation (Sprints 5.6-5.8, ~8 ngày)

#### Sprint 5.6 — Payment Method + Order schema (3 ngày)
**Goal**: Schema foundation cho toàn bộ financial system.

**New models**:
- `PaymentMethod` (WALLET/VNPAY/COD/TRANSFER_MONEY/TINGEE) với 8 boolean flags allowed-for (course/exam/product/kit/...)
- `Order` (universal: course/exam/product/combo) với status workflow
- `OrderItem` (line items)
- `OrderStatusHistory` (audit chain)

**New enums**: `OrderType`, `OrderStatus`, `PaymentMethodType`

**Admin UI**: `/admin/payment-methods`, `/admin/orders` (list + detail, no creation flow yet)

#### Sprint 5.7 — Voucher module (3 ngày)
**Goal**: Voucher creation + apply logic.

**New models**: `Voucher`, `VoucherRedemption`
**Voucher types**: COURSE, EXAM, PRODUCT, QUESTION_SET (match SataWorld)
**Apply logic**: % discount OR fixed amount, min order value, max discount cap, quantity limit, validity period

**Admin UI**: `/admin/vouchers` (full CRUD)
**Integration**: hook vào Order creation (Sprint 5.8) để apply

#### Sprint 5.8 — Manual confirmation flow + Transaction history (2 ngày)
**Goal**: Admin xác nhận thanh toán chuyển khoản thủ công.

**New models**: `Transaction` (deposit/withdraw), `PaymentConfirmation`
**Flow**: PH chuyển khoản → tạo `Transaction` PENDING → admin click "Xác nhận" → `Transaction.status = COMPLETED` + `Order.status = PAID`

**Admin UI**: `/admin/transactions` (deposit + withdraw tabs), `/admin/payment-confirmations` (pending queue)

### Phase 2 — Operations (Sprints 5.9-5.10, ~6 ngày)

#### Sprint 5.9 — Student lifecycle states (3 ngày)
**Goal**: Proper state machine cho student journey.

**Schema changes**:
- `Student.status` enum mới: ACTIVE, WAITING_FOR_CLASS, RESERVED, ABSENT_FREQUENT, RENEWING, DROPPED_OUT
- `StudentStatusHistory` (audit per change)
- `StudentReserve` (track timing + reason cho học sinh bảo lưu)

**Admin UI**: 5 tab phụ trong `/admin/students`:
- Chờ xếp lớp
- Bảo lưu
- Vắng nhiều
- Tái tục
- Nghỉ học

**Business logic**:
- Reserve >30 ngày không hoạt động → auto suggest DROPPED_OUT
- Tái tục: tạo Enrollment mới reference Student cũ
- Track refund/credit khi reserve (link tới Phase 1 Order/Transaction)

#### Sprint 5.10 — Học cụ Robotics product catalog (3 ngày)
**Goal**: Product layer trên inventory hiện tại.

**New models**:
- `Product` (Kit/Sensor/MissionBlock/RobotUnit) với category, price, image, description
- `ProductCategory` (Kit, Sensor cảm ứng, Khối nhiệm vụ, Robot, Phụ kiện)
- Link với existing `InventoryItem` (stock tracking)

**Admin UI**: `/admin/products` (full CRUD), tích hợp với inventory view
**Integration**: Product có thể là `OrderItem` (Sprint 5.6) → PH mua bộ học cụ về nhà

### Phase 3 — Robotics Differentiation (Sprints 5.11-5.13, ~11 ngày)

#### Sprint 5.11 — Competition management (5 ngày)
**Goal**: Support tổ chức cuộc thi nội bộ + tham dự cuộc thi ngoài.

**New models**:
- `Competition` (TW Đoàn lần 6, WRC, internal contests)
- `CompetitionRound` (Vòng loại/Bán kết/Chung kết)
- `CompetitionBracket` (Bảng đấu)
- `Team` (Đội thi)
- `TeamMember` (Student + role: leader/member)
- `Score` + `CompetitionResult`

**Admin UI**: `/admin/competitions` với 6 sub-views (theo pattern SataWorld)

#### Sprint 5.12 — Robot rental contracts (3 ngày)
**Goal**: Cho thuê robot/equipment.

**New models**:
- `RentalContract` (start/end date, customer, products, deposit, monthly fee)
- `RentalReturn` (return condition, damage notes)
- Link với Product (Sprint 5.10) → Robot là Product

**Admin UI**: `/admin/rentals` (CRUD + return flow)

#### Sprint 5.13 — Notification + Email template (3 ngày)
**Goal**: Auto-notify per-course events.

**New models**:
- `NotificationConfig` (per course/class — what events trigger which template)
- `EmailTemplate` (subject + body + placeholder variables: {studentName}, {className}, {date}, etc.)
- `NotificationLog` (sent history)

**Integration**: Resend (already configured), Cron job (Vercel Cron) cho scheduled reminders

---

## 5. Risks + assumptions

### Risks
1. **Wallet defer**: Nếu PH yêu cầu credit/refund accumulator → cần Sprint thêm
2. **VNPAY integration**: Chưa trong scope 5.6 — initial chỉ track method, integration thật trong sprint sau
3. **Online course defer**: Affiliate + Online course delivery defer cùng nhau → 2 sprints khi launch
4. **Cuộc thi scope**: 5 ngày có thể không đủ nếu yêu cầu scoring sâu (multi-criteria, judges) → có thể tách Phase 4

### Assumptions
- Sata Robo dùng VNPAY/Tingee là 2 gateway chính → schema support TINGEE từ đầu
- Student lifecycle định nghĩa theo policy hiện tại Sata Robo (có thể khác SataWorld)
- Học cụ chia 4 category chính: Kit, Sensor cảm ứng, Khối nhiệm vụ, Robot — không sub-category sâu
- Mỗi sprint test trên Vercel preview trước khi merge production

---

## 6. Out-of-scope decisions log

| Module | Reason | Reactivation trigger |
|---|---|---|
| Numerology (Thần số học) | Different business vertical | N/A — không phải core business |
| Beekids exams | Different brand | N/A |
| Online course delivery | Future capability | Khi launch SataRobo Online platform |
| Affiliate orders | Depends on online course | Cùng với online course module |
| Wallet system | Use direct gateway thay middleware | Khi cần refund/credit accumulator |
| Performance review GV | HR feature, low priority | Khi >20 GV cần đánh giá định kỳ |
| Certificate templates | P3 nice-to-have | Khi có yêu cầu cấp giấy hoàn thành mass |
| Form builder | Quá rộng | Skip — dùng Google Forms nếu cần |
| Complaint management | P3 | Khi có >5 khiếu nại/tháng |

---

## 7. Next actions

- [x] Sprint 5.5 deliverable: this file
- [ ] Sprint 5.6 spec — Payment Method + Order schema (start ngay sau khi commit file này)
- [ ] Per-sprint detailed specs sẽ viết tại từng sprint start, không pre-batch
- [ ] Review meeting sau Phase 1 (sau 5.8) để re-evaluate scope nếu cần
- [ ] Memory update: add Sprint 5.5 completed + roadmap link
