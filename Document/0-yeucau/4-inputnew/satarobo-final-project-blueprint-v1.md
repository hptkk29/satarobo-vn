# SataRobo Final Project Blueprint v1.0

> **Tài liệu chốt cho toàn bộ dự án SataRobo Admin / CRM / LMS / Portal / Marketing Automation**  
> **Ngày chốt:** 05/06/2026  
> **Phạm vi:** `satarobo.vn`, `admin.satarobo.vn`, `hocvien.satarobo.vn`  
> **Nguyên tắc:** tài liệu này thay thế các bản yêu cầu rời rạc trước đó. Những requirement đã bị loại bỏ theo quyết định mới nhất **không đưa lại vào roadmap core**.

---

## 0. Mục tiêu tài liệu

Tài liệu này dùng để:

1. Chốt phạm vi cuối cùng của dự án.
2. Loại bỏ các requirement không cần dùng, rủi ro pháp lý hoặc chưa phù hợp phase hiện tại.
3. Chốt kiến trúc kỹ thuật cuối cùng cho repo `satarobo-vn`.
4. Chốt module cần build theo thứ tự ưu tiên.
5. Làm đầu vào cho PM, Dev, Claude Code và kiểm thử.

---

## 1. Quyết định chiến lược đã chốt

| Nhóm | Quyết định cuối |
|---|---|
| Kiến trúc | Modular Monolith trên Next.js/Vercel, không chuyển Microservice hiện tại |
| Domain | `satarobo.vn`, `admin.satarobo.vn`, `hocvien.satarobo.vn` |
| Login | Cổng chung `satarobo.vn/login`, tự nhận diện role và redirect đúng site |
| Admin | `admin.satarobo.vn` cho nhân viên nội bộ |
| Portal | `hocvien.satarobo.vn` cho phụ huynh + học sinh, không tách parent/student domain |
| Route học viên | Route đẹp, không hiện `studentId`, dữ liệu theo active site/profile trong session |
| Online course | Tạm trỏ sang Sataworld, chưa build LMS video online trong phase core |
| Offline course | Tập trung Sata 1–8 và Combo Sata 1&2 |
| Kênh lead chính | Facebook Messenger Ads qua Page HO |
| Kênh lead phụ | Google Form, landing page, website form, import thủ công |
| OTP | Không dùng mật khẩu mặc định `123456`; tạm dùng Resend/email activation fallback; SMS brandname chưa triển khai trong core |
| Sale SLA | Sale liên hệ trong vòng 3 giờ sau khi được giao lead |
| Phân quyền | Dynamic RBAC + Scope + per-user grant ALLOW/DENY |
| Organization | Dùng `OrgUnit` tree cho HO/CS1/CS2 và mở rộng sau này |
| Event | Internal outbox + cron dispatcher, không dùng message broker hiện tại |
| Finance atomic | Luồng tiền, invoice, payment, enrollment phải đi transaction, không đi event async |
| Audit | AuditLog hợp nhất 1 bảng cho dữ liệu mới |
| Integration | Mọi external call qua Integration Module, không gọi thẳng từ module nghiệp vụ |

---

## 2. Phạm vi loại bỏ khỏi core requirement

Các mục dưới đây **bỏ khỏi core requirement**. Nếu xuất hiện trong tài liệu cũ hoặc file mới, bỏ theo quyết định này.

### 2.1. Loại bỏ hoàn toàn vì rủi ro pháp lý/dữ liệu trẻ em

Không build, không đưa vào roadmap gần:

```txt
AI camera nhận diện khuôn mặt học sinh
Face recognition điểm danh học sinh
Phân tích sức khỏe qua camera
Thu thập dữ liệu sinh trắc học học sinh
Geofencing học sinh
Check-in định vị học sinh
IoT/vòng đeo tracking học sinh
Định vị học sinh khi đi ngoại khóa
```

Requirement thay thế:

```txt
Điểm danh học sinh bằng giáo viên/admin thao tác thủ công.
Phụ huynh có thể báo vắng.
Học sinh vắng tạo nhu cầu học bù.
Hệ thống lưu lịch sử chỉnh sửa điểm danh.
Không thu thập sinh trắc học, sức khỏe hoặc định vị học sinh.
```

### 2.2. Loại bỏ khỏi core vì quá xa MVP hoặc không cần dùng nữa

Không build trong dự án core:

```txt
Web3
NFT Certificate
IPFS / Arweave
SataCoin blockchain
Learn2Earn blockchain
Marketplace
SaaS Partner Platform
White Label System
Franchise SaaS Billing
```

Phiên bản được phép giữ sau này:

```txt
Chứng chỉ PDF nội bộ
Mã chứng chỉ tra cứu trên hệ thống
Điểm thưởng nội bộ / badge / huy hiệu, không blockchain
```

### 2.3. Giữ backlog phase sau, chưa build core

Các mục này giữ lại trong backlog dài hạn, chỉ làm sau khi core hoàn thành:

```txt
MISA AMIS sync
Zalo OA / ZNS
VNPay / payment gateway
Flutter app
Push notification app
AI Tutor
AI CRM Assistant
AI Reporting
AI Competency Analysis
Gamification nội bộ nâng cao
Franchise / multi-tenant mở rộng
```

Thứ tự phase sau đề xuất:

```txt
1. Zalo OA/ZNS
2. Payment gateway nếu cần thu online
3. MISA AMIS sync
4. Flutter app
5. AI assistant/reporting
6. Franchise/SaaS mở rộng
```

### 2.4. Loại bỏ/sửa vì sai quyết định hiện tại

| Requirement cũ | Quyết định mới |
|---|---|
| Facebook Lead Form là main flow | Messenger Ads là main flow |
| Student login riêng | Học sinh dùng profile trong tài khoản phụ huynh |
| Teacher domain riêng | Giáo viên dùng `admin.satarobo.vn` theo role `TEACHER` |
| Online video LMS | Tạm trỏ Sataworld, chưa build |
| Route có `studentId` | Không expose `studentId`; dùng active profile/session |
| User phụ thuộc `User.centerId` | Dùng `OrgUnit + UserScope + EmployeeOrgAssignment` |
| AI learning path | Bỏ; dùng `nextCourseId` rule-based |
| AI prediction doanh thu/nghỉ học | Để sau; phase core dùng rule-based alert |

---

## 3. Wording chuẩn cho scope core

> Phạm vi phase core của hệ thống SataRobo tập trung vào vận hành trung tâm đào tạo offline, bao gồm CRM tuyển sinh từ Messenger Ads, quản lý lead theo LEADS_1/LEADS_2/LEADS_3, phân quyền HO/CS1/CS2, quản lý học viên/phụ huynh, LMS offline, học phí, công nợ, báo cáo và portal phụ huynh/học sinh.
>
> Các yêu cầu liên quan đến sinh trắc học trẻ em, AI camera, phân tích sức khỏe, định vị học sinh, blockchain/NFT/SataCoin, marketplace, app mobile, MISA/Zalo/VNPay live integration và AI prediction không thuộc phạm vi phase core. Những nội dung này chỉ được xem xét sau khi core system hoàn thiện và có đánh giá pháp lý/kỹ thuật riêng nếu cần.

---

## 4. Domain, app và route

### 4.1. Domain

```txt
satarobo.vn              → website chính + login chung
admin.satarobo.vn        → admin site cho nhân viên
hocvien.satarobo.vn      → portal phụ huynh + học sinh
```

### 4.2. Login chung

```txt
satarobo.vn/login
```

Sau login:

```txt
Staff account @satarobo.vn      → admin.satarobo.vn
Parent account phone/email      → hocvien.satarobo.vn
```

### 4.3. Staff login

Nhân viên đăng nhập bằng email công ty:

```txt
hovaten@satarobo.vn
```

Ví dụ:

```txt
hoangphantuankiet@satarobo.vn
```

### 4.4. Parent/student portal

Phụ huynh dùng một tài khoản, bên trong có các site/profile:

```txt
Site phụ huynh
Site con 1
Site con 2
...
```

Nguyên tắc:

```txt
Ở site phụ huynh: chỉ hiện chức năng phụ huynh.
Ở site con 1: chỉ hiện dữ liệu/chức năng của con 1.
Ở site con 2: chỉ hiện dữ liệu/chức năng của con 2.
Không lộ studentId trên URL.
```

Route đẹp:

```txt
hocvien.satarobo.vn/thong-bao
hocvien.satarobo.vn/lich-hoc
hocvien.satarobo.vn/bai-tap
hocvien.satarobo.vn/trac-nghiem
hocvien.satarobo.vn/nop-bai
hocvien.satarobo.vn/hinh-anh
hocvien.satarobo.vn/nhan-xet
hocvien.satarobo.vn/danh-gia
```

Active site/profile lưu trong signed session/cookie.

---

## 5. Organization Architecture

### 5.1. Tổ chức hiện tại

```txt
Tenant: SataRobo

OrgUnit:
- HO  — Hội sở
- CS1 — 211 Nguyễn Hữu Thọ, Đà Nẵng
- CS2 — 114 Hoàng Diệu, Đà Nẵng
```

CS2 vừa là cơ sở đào tạo vừa là nơi HO làm việc. Vì vậy cần tách rõ:

```txt
CS2 = center đào tạo
HO = đơn vị điều hành
Một nhân viên có thể thuộc cả HO và CS2
```

### 5.2. Organization Unit

```txt
OrgUnit
- id
- type: HO / REGION / CENTER / CAMPUS / PARTNER / FRANCHISE
- code: HO / CS1 / CS2
- name
- address
- parentId nullable
- centerId nullable
- isActive
```

### 5.3. Nhân sự nhiều đơn vị

```txt
EmployeeOrganizationAssignment
- employeeId
- orgUnitId
- roleInOrg
- startDate
- endDate
- isPrimary
- allocationPercent nullable
```

Dùng để xử lý:

```txt
Nhân viên vừa HO vừa thuộc CS2
Giáo viên CS2 sang CS1 dạy thay
Chi phí/lương dạy thay tính cho cơ sở cần giáo viên
Báo cáo doanh thu/lợi nhuận theo cơ sở sau này
```

---

## 6. Role, Permission, Scope

### 6.1. Role khởi điểm

| Nhóm | Role |
|---|---|
| HO | `SUPER_ADMIN`, `HO_MANAGER`, `HO_ACCOUNTANT`, `HO_HR`, `QC_MARKETING`, `SALE_ADMIN` |
| Center | `CENTER_MANAGER`, `CENTER_SALES_CSM`, `TEACHER`, `ASSISTANT_TEACHER`, `CENTER_ACCOUNTANT` |
| Portal | `PARENT` |

Ghi chú:

```txt
Sale + CSM + CRM gộp thành CENTER_SALES_CSM.
Student không có account login riêng trong phase core.
```

### 6.2. Permission model

```txt
RoleDef
RolePermission
UserOrgRole
Permission
UserPermissionGrant
```

### 6.3. Scope

```txt
GLOBAL      → toàn hệ thống
CENTER      → dữ liệu trong center/org subtree
CLASS       → lớp được phân công
OWN         → dữ liệu do mình tạo/phụ trách
CHILDREN    → dữ liệu con của phụ huynh
ASSIGNED    → lead/lớp/học viên được giao
```

### 6.4. Quy tắc quyền chính

```txt
SUPER_ADMIN: toàn hệ thống
HO_MANAGER: dashboard/báo cáo toàn hệ thống theo quyền được cấp
HO_ACCOUNTANT: tài chính, phân bổ chi phí, hoa hồng toàn hệ thống
QC_MARKETING: ads, campaign, dashboard marketing, không xem PII nếu không cần
SALE_ADMIN: trực Messenger, tạo LEADS_2, bàn giao trung tâm
CENTER_MANAGER: toàn bộ dữ liệu thuộc center mình
CENTER_SALES_CSM: lead/học viên được giao, chăm sóc, pipeline, tái tục
TEACHER: lớp mình dạy, điểm danh, nhận xét, bài tập, media
CENTER_ACCOUNTANT: học phí, công nợ, thanh toán trong center mình
PARENT: chỉ dữ liệu con của mình
```

---

## 7. Kiến trúc kỹ thuật cuối

### 7.1. Kiến trúc tổng thể

```txt
Frontend Layer
├── Public Website
├── Admin Portal
└── Parent/Student Portal

Gateway Layer
├── Auth.js
├── Middleware host routing
├── RBAC/ABAC can()
└── Rate limit

Application Modules
├── identity
├── organization
├── crm
├── sis
├── lms
├── attendance
├── finance
├── commission
├── notification
├── reporting
├── integration
└── audit/shared

Event Layer
├── DomainEvent outbox
└── Cron dispatcher

Data Layer
├── PostgreSQL
├── Redis/Upstash nếu cần
├── R2/S3 object storage
└── AuditLog
```

### 7.2. Cấu trúc code đề xuất

```txt
src/modules/
  identity/
  organization/
  crm/
  sis/
  lms/
  attendance/
  finance/
  commission/
  notification/
  reporting/
  integration/
  audit/
  shared/
```

Mỗi module có:

```txt
service
repository
events
permissions
validators
public API index.ts
```

### 7.3. Ranh giới import

```txt
app/** không import db trực tiếp
module A không import sâu module B
mọi external API đi qua modules/integration
mọi query data user-facing đi qua scopedDb/can()
```

### 7.4. Prisma

Dùng multi-file Prisma schema:

```txt
prisma/schema/
├── base.prisma
├── identity.prisma
├── organization.prisma
├── crm.prisma
├── commission.prisma
├── sis.prisma
├── lms.prisma
├── finance.prisma
├── engagement.prisma
├── hr.prisma
├── content.prisma
└── shared.prisma
```

Không tách Postgres schema vật lý trong phase hiện tại.

---

## 8. Event-driven nội bộ

### 8.1. Nguyên tắc

```txt
Không dùng message broker hiện tại.
Dùng DomainEvent outbox + cron dispatcher.
Luồng tiền/atomic phải nằm trong transaction.
Thông báo/thống kê/sync ngoài đi event.
```

### 8.2. DomainEvent

```txt
DomainEvent
- id
- type
- payloadJson
- status: PENDING / PROCESSING / DONE / FAILED
- attempts
- lastError
- createdAt
- processedAt
```

### 8.3. Event quan trọng

```txt
messenger.conversation.created
lead.qualified
lead.handed_to_center
lead.assigned_to_sale
lead.converted
invoice.created
payment.confirmed
parent.account.created
student.absent
course.completed
assignment.submitted
media.uploaded
marketing.cost_allocation.confirmed
```

### 8.4. Phân loại transaction/event

Trong transaction:

```txt
LeadConverted → tạo Student/Parent/Enrollment/Invoice/Payment nếu có
PaymentConfirmed → cập nhật invoice/debt/revenue
```

Qua event:

```txt
Gửi email/OTP
Cập nhật dashboard
Tạo alert SLA
Cập nhật commission draft
Đồng bộ external
```

---

## 9. CRM và tuyển sinh theo SR217

### 9.1. Phễu lead

```txt
LEADS_1 = Tin nhắn/tương tác vào Page Messenger
LEADS_2 = Có SĐT + ghi chú/tóm tắt, đủ điều kiện bàn giao trung tâm
LEADS_3 = Đã đóng học phí, doanh số thực tế
```

### 9.2. Nguồn lead

Nguồn chính:

```txt
Facebook Messenger Ads qua Page HO
```

Nguồn phụ:

```txt
Google Form
Landing page
Website form
Import thủ công
Phụ huynh giới thiệu
Đối tác/sự kiện
Data cũ chăm lại
```

### 9.3. Facebook Page hiện tại

Hiện tại chỉ có:

```txt
Facebook Page HO
```

Sau này có thể thêm:

```txt
Facebook Page CS1
Facebook Page CS2
```

Mapping:

```txt
FacebookPageMapping
- Page HO: scopeType=HO, centerId=null
- Page CS1: scopeType=CENTER, centerId=CS1
- Page CS2: scopeType=CENTER, centerId=CS2
```

### 9.4. Messenger workflow hiện tại

```txt
Messenger Ads Page HO
→ Phụ huynh nhắn tin
→ Messenger Webhook
→ MessengerConversation
→ MessengerMessage
→ LEADS_1
→ Sale Admin hỏi SĐT + thông tin con + cơ sở
→ Có SĐT + ghi chú = LEADS_2
→ Bàn giao CS1/CS2
→ Quản lý cơ sở xác nhận
→ Phân Sale/CSM
→ Sale liên hệ trong 3h
→ Chốt đóng học phí = LEADS_3
```

### 9.5. Kịch bản Sale Admin Messenger

```txt
Dạ SataRobo chào ba/mẹ ạ 😊
Để tư vấn đúng lớp cho bé, ba/mẹ cho em xin:
1. Số điện thoại
2. Bé đang học lớp mấy / bao nhiêu tuổi?
3. Ba/mẹ muốn bé học tại cơ sở nào?
   - CS1: 211 Nguyễn Hữu Thọ
   - CS2: 114 Hoàng Diệu
   - Chưa rõ, cần tư vấn
```

### 9.6. SLA tuyển sinh

```txt
Sale Admin phản hồi Messenger: mục tiêu ≤5 phút
LEADS_2 bàn giao trung tâm: trong ngày, không để qua đêm
Quản lý trung tâm xác nhận: trong 30 phút
Sale liên hệ sau khi được giao: trong 3 giờ
Lead không cập nhật trạng thái quá 2 ngày: cảnh báo
```

### 9.7. Handover workflow

```txt
LEADS_1
→ NEED_PHONE
→ LEADS_2
→ READY_TO_HANDOVER
→ HANDED_TO_CENTER
→ CENTER_ACCEPTED
→ ASSIGNED_TO_SALE
→ IN_PROGRESS
→ ENROLLED / LOST / NURTURING
```

---

## 10. Marketing Ads Dashboard

### 10.1. Data source

```txt
Meta Ads Insights API
MessengerConversation / MessengerMessage
Lead CRM
Invoice / Payment
MarketingCostAllocation
```

### 10.2. KPI

```txt
Spend
Impressions
Reach
Clicks
CTR
CPC
CPM
Messaging conversations
LEADS_1
LEADS_2
LEADS_3
Cost per conversation
CPL = spend / LEADS_2
CPA = spend / LEADS_3
Revenue
ROAS = revenue / spend
CR LEADS_1 → LEADS_2
CR LEADS_2 → LEADS_3
```

### 10.3. Dashboard tabs

```txt
Tổng quan
Theo HO/CS1/CS2
Campaign
Adset/Target
Creative
Phân bổ chi phí
SLA vận hành lead
```

### 10.4. Cost allocation

Công thức:

```txt
CPL hệ thống = Tổng chi phí QC / Tổng LEADS_2 toàn hệ thống
Chi phí phân bổ từng trung tâm = CPL hệ thống × LEADS_2 bàn giao cho trung tâm đó
CPA = Tổng chi phí QC / Tổng LEADS_3 toàn hệ thống
```

Trạng thái kỳ phân bổ:

```txt
DRAFT
CONFIRMED
REOPENED nếu cần tính lại
```

Chỉ `SUPER_ADMIN` và `HO_ACCOUNTANT` được confirm.

### 10.5. Commission 4 tầng

Chỉ tính khi LEADS_3 đã đóng học phí.

```txt
QC Marketing: 1% doanh số từ nguồn MKT
Sale Admin HO: 1% doanh số từ lead đã bàn giao và chốt
Sale/TVV Center: 4% doanh số mình chốt trực tiếp
Center Manager: 2% tổng doanh số khai thác mới của center
Tổng tối đa: 8%
```

Commission engine để phase R1 sau khi CRM + Finance ổn.

---

## 11. Lead conversion sang học viên

### 11.1. Flow chốt lead

```txt
Lead mới
→ Sale tư vấn
→ Học thử nếu có
→ Phụ huynh quyết định mua khóa offline
→ Sale chuyển pipeline sang Đã đăng ký
→ Sale điền/xác nhận đầy đủ:
   - thông tin phụ huynh
   - thông tin con
   - khóa
   - lớp
   - cơ sở
   - học phí/thanh toán
→ Transaction tạo dữ liệu chính thức
```

### 11.2. Transaction bắt buộc

Khi convert lead sang `ENROLLED`, một transaction phải tạo/cập nhật:

```txt
ParentProfile
Student
ParentStudentRelation
Enrollment
Class enrollment
Invoice
Payment nếu có tiền đã thu
Lead.convertedAt / convertedBy
AuditLog
DomainEvent lead.converted
```

Nếu một bước lỗi, rollback toàn bộ.

### 11.3. Parent account activation

Không dùng password mặc định.

Phase core:

```txt
ParentAccount status = PENDING_ACTIVATION
Gửi email activation qua Resend nếu có email
Thiết kế OTP provider abstraction để sau này cắm SMS/SpeedSMS/Zalo
Parent tạo mật khẩu lần đầu khi activation
```

---

## 12. Khóa học offline

### 12.1. Danh sách khóa

```txt
Sata 1 — Luyện thi
Sata 2 — Luyện thi
Combo Sata 1&2
Sata 3 — chuyên sâu 48 buổi
Sata 4 — chuyên sâu 48 buổi
Sata 5 — chuyên sâu 48 buổi
Sata 6 — chuyên sâu 48 buổi
Sata 7 — chuyên sâu 48 buổi
Sata 8 — cam kết pass vòng loại quốc gia đến vòng khu vực
```

### 12.2. Online course

```txt
Online course tạm thời trỏ sang Sataworld.
Không build video LMS, video progress, online access trong phase core.
```

### 12.3. Gợi ý khóa tiếp theo

Không dùng AI.

Dùng rule-based bằng `nextCourseId`:

```txt
Sata 3 → Sata 4
Sata 4 → Sata 5
Sata 5 → Sata 6
Sata 6 → Sata 7
Sata 7 → Sata 8 nếu đủ điều kiện
```

Nếu sau này có thêm nhiều khóa mới, build lại module gợi ý khóa sau.

---

## 13. LMS offline

### 13.1. LMS là gì trong phase core

LMS phase core không phải hệ thống video online. LMS là hệ thống vận hành đào tạo offline:

```txt
Khóa học
→ Giáo trình
→ Bài học
→ Lớp
→ Buổi học
→ Điểm danh
→ Nhận xét
→ Media
→ Bài tập
→ Bài nộp
→ Chấm bài
→ Đánh giá năng lực cơ bản
→ Báo cáo phụ huynh
→ CSM chăm sóc/tái đăng ký
```

### 13.2. Curriculum

```txt
Curriculum
- courseId
- version
- totalLessons
- status: DRAFT / ACTIVE / ARCHIVED
```

Mỗi lớp gắn với một curriculum version để lớp cũ không bị ảnh hưởng khi giáo trình đổi.

### 13.3. Lesson

```txt
Lesson
- curriculumId
- lessonNo
- title
- objective
- content
- teacherGuide
- requiredEquipment
- expectedOutput
- assessmentCriteria
- homeworkDefault
```

### 13.4. Class và ClassSession

```txt
Class
- centerId
- courseId
- curriculumId
- mainTeacherId
- maxStudents
- startDate
- expectedEndDate

ClassSession
- classId
- plannedLessonId
- actualLessonId
- scheduledStartAt
- scheduledEndAt
- actualStartAt
- actualEndAt
- status
```

### 13.5. Teacher checklist

Sau mỗi buổi học, giáo viên cần hoàn thành:

```txt
Điểm danh
Xác nhận bài đã dạy
Nhập nhận xét học sinh
Upload ảnh/video và tag học sinh
Giao bài tập nếu có
Ghi chú sự cố nếu có
Hoàn tất buổi học
```

---

## 14. Media, ảnh học viên và quyền riêng tư

### 14.1. Chốt requirement

```txt
Chỉ lưu ảnh học viên và ảnh/video lớp học.
Không lưu giấy tờ tùy thân học viên.
Không thu CMND/CCCD/hộ chiếu/giấy khai sinh trong phase hiện tại.
```

### 14.2. Media lớp học

```txt
Giáo viên/trợ giảng upload ảnh/video theo buổi học.
Mỗi ảnh/video phải tag học sinh liên quan.
Phụ huynh chỉ xem media có tag con mình.
Media không tag học sinh thì không hiển thị cho phụ huynh.
Có trạng thái duyệt nếu trung tâm muốn kiểm soát trước khi public.
Có audit log khi upload/sửa/xóa/duyệt media.
```

### 14.3. Model

```txt
ClassSessionMedia
- id
- classSessionId
- mediaType: IMAGE / VIDEO
- fileUrl
- uploadedById
- status: PENDING / APPROVED / REJECTED

MediaStudentTag
- mediaId
- studentId
```

### 14.4. Consent

Trong phase core, cần chuẩn bị consent cơ bản:

```txt
StudentConsent
- studentId
- consentType: CLASS_MEDIA
- status: GRANTED / REVOKED
- grantedByParentId
- grantedAt
- revokedAt
```

Nếu chưa có consent, media vẫn có thể lưu nội bộ nhưng không public cho phụ huynh nếu policy yêu cầu.

---

## 15. Bài tập, quiz, submission

### 15.1. Loại bài tập

```txt
IMAGE_UPLOAD
VIDEO_UPLOAD
FILE_UPLOAD
QUIZ
TEXT_ANSWER
PROJECT_SUBMISSION
```

### 15.2. Flow giao bài

```txt
Giáo viên chọn lớp/buổi học
→ Tạo bài tập
→ Chọn loại bài
→ Chọn deadline
→ Giao cho cả lớp / từng học sinh / nhóm
→ Học sinh thấy trong site con đang chọn
```

### 15.3. Flow nộp bài

```txt
Học sinh vào hocvien.satarobo.vn/bai-tap
→ Chọn bài
→ Upload ảnh/video/file hoặc làm quiz
→ Nộp bài
→ Giáo viên nhận thông báo
→ Giáo viên chấm/nhận xét
→ Phụ huynh và học sinh xem kết quả
```

---

## 16. Điểm danh học viên

### 16.1. Điểm danh học viên

Chỉ dùng phương án thủ công an toàn:

```txt
Giáo viên/admin chọn trạng thái học viên trong buổi học
PRESENT
LATE
ABSENT_EXCUSED
ABSENT_UNEXCUSED
```

Không dùng sinh trắc học, camera, định vị học sinh.

### 16.2. Đồng bộ học bạ/tiến độ

Attendance là source of truth.

Công thức:

```txt
totalSessions = số session đã COMPLETED
presentCount = PRESENT + LATE
absentCount = ABSENT_EXCUSED + ABSENT_UNEXCUSED
attendanceRate = presentCount / totalSessions
```

### 16.3. Học bù

```txt
Học sinh vắng
→ tạo MakeupNeed
→ phụ huynh gửi yêu cầu học bù
→ hệ thống/quản lý tìm buổi phù hợp theo lesson/progress
→ quản lý duyệt
→ học sinh học bù
```

Không cho học bù vượt bài/vượt tiến độ.

---

## 17. Nhân sự và chấm công nhân viên

### 17.1. Chấm công nhân viên

Phase sau của core có thể làm:

```txt
QR động 30 giây
GPS/geofence tại cơ sở
Check-in/check-out
Cảnh báo thiếu giờ
Quản lý duyệt công
```

Geofencing chỉ áp dụng cho nhân viên, không áp dụng học sinh.

### 17.2. QR rule

```txt
QR token đổi mỗi 30 giây
Có grace period 5–10 giây
Server xác thực nhanh
Không để nhân viên phải chờ lâu
```

---

## 18. Finance

### 18.1. Core finance

```txt
Invoice
Payment
Debt
Refund nếu có
Tuition config
Revenue report
Cost allocation
Commission base
```

### 18.2. Invoice khi chốt lead

Khi lead chuyển `ENROLLED`, invoice phải tự tạo trong transaction.

```txt
InvoiceCode = INV-{CENTER_CODE}-{YEAR}-{SEQUENCE}
Ví dụ: INV-CS1-2026-0001
```

### 18.3. Payment gateway

Không build live payment gateway trong phase core.

Phase hiện tại:

```txt
Ghi nhận thanh toán thủ công
Kế toán xác nhận
Xuất báo cáo/Excel
```

---

## 19. Reporting Dashboard

### 19.1. Dashboard cần có

```txt
Dashboard tổng HO
Dashboard center
CRM funnel dashboard
Marketing Ads dashboard
Finance dashboard
LMS quality dashboard
Attendance dashboard
SLA dashboard
```

### 19.2. Class Health Score

Rule-based, không AI:

```txt
Tỷ lệ chuyên cần
Tỷ lệ hoàn thành bài tập
Tiến độ so với giáo trình
Tỷ lệ nhập nhận xét đúng hạn
Tỷ lệ phụ huynh hài lòng nếu có NPS
Số học sinh rủi ro
```

### 19.3. Student Risk Alert

Rule-based:

```txt
Nghỉ 2 buổi liên tiếp
Không nộp bài nhiều lần
Sắp hết khóa
Phụ huynh phản hồi xấu
Học phí còn nợ
Lead/tái tục không được chăm
```

AI prediction để phase sau.

---

## 20. Integration Module

### 20.1. Nguyên tắc

```txt
Không module nào gọi trực tiếp API bên ngoài.
Tất cả external call đi qua modules/integration.
```

### 20.2. Provider phase core

```txt
Meta Messenger Webhook
Meta Ads Insights API
Resend Email
R2/S3 storage
```

### 20.3. Provider phase sau

```txt
SpeedSMS/SMS Brandname
Zalo OA/ZNS
MISA AMIS
VNPay/payment gateway
Flutter push notification
```

---

## 21. Audit và bảo mật

### 21.1. AuditLog hợp nhất

```txt
AuditLog
- id
- actorId
- module
- entityType
- entityId
- action
- oldValues
- newValues
- orgUnitId
- ipAddress
- userAgent
- createdAt
```

### 21.2. Bắt buộc audit

```txt
Lead create/update/status change/assign/handover/convert
Role/permission grant/revoke
Student create/update/transfer
Class create/update/teacher change
Invoice/payment/refund
Parent account activation
Media upload/approve/reject/delete
Attendance edit
Cost allocation confirm
Commission confirm
```

### 21.3. PII protection

```txt
Không leak SĐT/email phụ huynh cho role không cần.
Teacher không mặc định xem SĐT phụ huynh.
Marketing không xem PII nếu không cần.
Parent chỉ xem con mình.
Media chỉ hiển thị nếu tag đúng con.
Không expose studentId trên route.
Không lưu giấy tờ tùy thân học viên.
Không thu sinh trắc học/định vị học sinh.
```

---

## 22. Roadmap triển khai cuối

### Phase A0 — Foundation Architecture

Mục tiêu: dựng nền an toàn cho toàn bộ hệ thống.

```txt
A0.1 OrgUnit + RoleDef/UserOrgRole + can() v2 song song
A0.2 Session gọn + ActorResolver
A0.3 scopedDb + ESLint boundary
A0.4 DomainEvent outbox + dispatcher
A0.5 Module skeleton + AuditLog hợp nhất + Notifier + UI roles
```

Definition of Done:

```txt
Tạo role mới qua UI, không deploy
HO_ACCOUNTANT thấy toàn hệ thống
CENTER_ACCOUNTANT CS1 chỉ thấy CS1
scopedDb chặn query thiếu filter
DomainEvent handler chạy idempotent
Đổi quyền role hiệu lực request kế tiếp
```

### Phase R1 — SR217 CRM + Messenger + Marketing

```txt
R1.1 Messenger webhook L1 + Messenger Inbox CRM
R1.2 Ads Insights Sync + AdsDailyStat
R1.3 Lead handover HO → CS1/CS2
R1.4 SLA engine
R1.5 Marketing dashboard
R1.6 Cost allocation theo LEADS_2
R1.7 Commission engine 4 tầng
R1.8 Export Excel/báo cáo tuần/tháng
```

### Phase R2 — SIS + Finance conversion

```txt
Lead conversion transaction
Parent account activation via Resend/email
Student/Parent/Enrollment
Invoice/Payment/Debt
Duplicate phone UX
Audit coverage
```

### Phase R3 — LMS offline

```txt
Course/Curriculum/Lesson
Class/ClassSession
Attendance source of truth
Teacher checklist
Feedback/Media tagged child
Assignment/Quiz/Submission
Learning report
NextCourse rule-based
```

### Phase R4 — Portal hocvien.satarobo.vn

```txt
Parent site
Child profile site
Route đẹp không studentId
Lịch học
Bài tập/nộp bài/trắc nghiệm
Nhận xét
Hình ảnh/video của con
Yêu cầu báo vắng/học bù/chuyển lớp/bảo lưu
```

### Phase R5 — HR/Attendance nhân viên

```txt
Employee profile
Shift
QR 30s check-in/check-out
Geofence nhân viên
Worktime warning
Manager approval
```

### Phase sau khi core hoàn thành

```txt
Zalo OA/ZNS
Payment gateway
MISA AMIS
Flutter app
AI assistant/reporting
Franchise/SaaS mở rộng
```

---

## 23. PR sequencing đề xuất

### Nhóm A0 Foundation

```txt
PR-A0-01: OrgUnit schema + seed HO/CS1/CS2
PR-A0-02: RoleDef/RolePermission/UserOrgRole + seed role
PR-A0-03: can() v2 + ActorResolver + legacy fallback
PR-A0-04: scopedDb + tests chống lộ dữ liệu center
PR-A0-05: DomainEvent outbox + dispatcher
PR-A0-06: AuditLog hợp nhất
PR-A0-07: Module skeleton + lint boundary
```

### Nhóm CRM Messenger

```txt
PR-R1-01: FacebookPageMapping + MessengerConversation/MessengerMessage
PR-R1-02: /api/webhooks/meta/messenger
PR-R1-03: /admin/crm/messenger inbox
PR-R1-04: LEADS_1 → LEADS_2 conversion
PR-R1-05: Handover HO → Center
PR-R1-06: SLA alerts
PR-R1-07: Ads Insights sync
PR-R1-08: Marketing dashboard
PR-R1-09: Cost allocation
PR-R1-10: Commission engine
```

### Nhóm SIS/Finance

```txt
PR-SIS-01: Parent/Student/Relation cleanup
PR-SIS-02: convertLeadToEnrollment transaction
PR-SIS-03: Invoice/Payment auto-create
PR-SIS-04: Parent activation Resend/email
PR-SIS-05: Duplicate phone UX
PR-SIS-06: Student center transfer rules
```

### Nhóm LMS/Portal

```txt
PR-LMS-01: Course/Curriculum/Lesson
PR-LMS-02: Class/ClassSession/Progress
PR-LMS-03: Attendance summary
PR-LMS-04: Teacher feedback/checklist
PR-LMS-05: Media + tag child + consent
PR-LMS-06: Assignment/Submission
PR-LMS-07: Quiz
PR-PORTAL-01: hocvien route shell + active profile
PR-PORTAL-02: parent site
PR-PORTAL-03: child site
PR-PORTAL-04: requests: absence/makeup/transfer/reserve
```

---

## 24. Open items cần xác nhận trước khi code sâu

| Nhóm | Câu hỏi |
|---|---|
| HO | HO có phải OrgUnit độc lập để tính chi phí/lương không? Mặc định: có |
| Role | Chỉ SUPER_ADMIN được tạo/sửa role đúng không? Mặc định: đúng |
| Meta | Có Page HO token + App Review chưa? Nếu chưa, dashboard vẫn có thể build phần DB/UI trước |
| Commission | Cần file Excel mẫu hoa hồng hiện tại để đối chiếu công thức |
| Cost allocation | Có cần khóa kỳ sau khi confirmed không? Mặc định: có, chỉ reopen bằng SUPER_ADMIN/HO_ACCOUNTANT |
| Parent activation | Phase đầu dùng email Resend; SMS brandname sau đúng không? Mặc định: đúng |

---

## 25. Definition of Done toàn dự án core

Dự án core hoàn thành khi:

```txt
1. HO/CS1/CS2 được biểu diễn bằng OrgUnit, phân quyền theo scope chạy đúng.
2. Login chung redirect đúng admin/hocvien.
3. Messenger Page HO tự tạo LEADS_1.
4. Sale Admin chuyển LEADS_1 → LEADS_2 với SĐT + ghi chú.
5. LEADS_2 bàn giao CS1/CS2 theo SLA.
6. Sale/CSM chốt LEADS_3 tạo Student/Parent/Enrollment/Invoice/Payment.
7. Parent account activation không dùng mật khẩu mặc định.
8. Marketing dashboard hiển thị spend, L1/L2/L3, CPL, CPA, ROAS.
9. Cost allocation theo LEADS_2 hoạt động.
10. Commission 4 tầng tính được từ LEADS_3.
11. LMS offline quản lý khóa/giáo trình/lớp/buổi/điểm danh/bài tập/media.
12. Portal hocvien.satarobo.vn có site phụ huynh và site từng con, không lộ studentId.
13. Phụ huynh chỉ xem ảnh/video của con.
14. Không lưu giấy tờ tùy thân học viên.
15. Không có AI camera/sinh trắc học/định vị học sinh trong hệ thống core.
16. Audit log phủ các nghiệp vụ nhạy cảm.
17. Center manager CS1 không xem được CS2 và ngược lại.
18. Superadmin/HO xem được toàn hệ thống theo quyền.
```

---

## 26. Kết luận cuối

Hướng phát triển chính thức của SataRobo là:

```txt
Modular Monolith
+ Organization Hierarchy HO/CS1/CS2
+ Dynamic RBAC/ABAC Scope
+ Messenger-first CRM theo LEADS_1/2/3
+ LMS offline Sata 1–8
+ Finance/Invoice/Payment transaction-safe
+ Parent/Student portal hocvien.satarobo.vn
+ Marketing Ads dashboard + Cost allocation + Commission
+ Audit/Privacy-first cho dữ liệu trẻ em
```

Không đưa lại các requirement đã loại bỏ như AI camera, sinh trắc học trẻ em, định vị học sinh, Web3/NFT/SataCoin blockchain, marketplace, student login riêng, teacher domain riêng, online video LMS, AI learning path, AI prediction vào phase core.

