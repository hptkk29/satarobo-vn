# Sata Robo Platform Architecture Evolution

## Mục tiêu
Thiết kế lại kiến trúc hệ thống từ monolith MVP hiện tại sang Modular Monolith có khả năng mở rộng cho:
- Head Office (HO)
- Multi Center
- Franchise
- LMS + CRM + SIS + Finance
- AI Platform
- Marketplace
- SaaS Partner

---

# 1. Current Architecture

```text
Next.js Application
│
├── CRM
├── Student
├── Class
├── LMS
├── Finance
├── HR
├── Parent Portal
├── Teacher Portal
│
└── Prisma Schema (Shared)
```

## Vấn đề

### Hard-coded Role

```text
SUPER_ADMIN
CENTER_MANAGER
TEACHER
PARENT
```

### User phụ thuộc Center

```text
User
 └── centerId
```

### Domain Coupling

```text
CRM
 ↓
Student
 ↓
Finance
 ↓
Notification
```

### Prisma Schema phình to

```text
CRM
Student
Finance
Attendance
HR
LMS
...
```

---

# 2. Target Architecture

## High Level Architecture

```text
┌──────────────────────────────────────────────┐
│                 Frontend Layer               │
├──────────────────────────────────────────────┤
│ Public Website                               │
│ Admin Portal                                 │
│ Teacher Portal                               │
│ Parent Portal                                │
│ Student Portal                               │
└──────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────┐
│               API Gateway Layer              │
├──────────────────────────────────────────────┤
│ Auth.js                                      │
│ Middleware                                   │
│ RBAC / ABAC                                  │
│ Rate Limit                                   │
└──────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────┐
│            Application Modules               │
├──────────────────────────────────────────────┤
│ Identity Module                              │
│ Organization Module                          │
│ CRM Module                                   │
│ SIS Module                                   │
│ LMS Module                                   │
│ Attendance Module                            │
│ Finance Module                               │
│ Notification Module                          │
│ Reporting Module                             │
│ Integration Module                           │
└──────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────┐
│                 Event Bus                    │
├──────────────────────────────────────────────┤
│ Domain Events                                │
│ Internal Queue                               │
│ Workflow Automation                          │
└──────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────┐
│                 Data Layer                   │
├──────────────────────────────────────────────┤
│ PostgreSQL                                   │
│ Redis                                        │
│ Object Storage (R2/S3)                       │
│ Audit Log                                    │
│ Analytics                                    │
└──────────────────────────────────────────────┘
```

---

# 3. Organization Architecture

```text
Tenant
│
└── Sata Robo
    │
    ├── Head Office (HO)
    │
    ├── Center A
    ├── Center B
    ├── Center C
    │
    └── Franchise Partner
```

## Organization Types

```text
HO
CENTER
CAMPUS
PARTNER
FRANCHISE
```

---

# 4. Dynamic RBAC Architecture

## Current

```text
Role Enum
```

## New Model

```text
User
│
├── UserRole
│
├── Role
│   └── RolePermission
│
├── Permission
│
└── UserScope
```

## Sample Roles

```text
HO_ADMIN
HO_MANAGER
HO_HR
HO_ACCOUNTANT

CENTER_MANAGER
CENTER_SALES
CENTER_CSM

TEACHER
PARENT
STUDENT
```

---

# 5. Scope Based Authorization

```text
GLOBAL
CENTER
CLASS
OWN
CHILDREN
ASSIGNED
```

Examples:

Teacher

```text
student.read
scope=ASSIGNED
```

Center Manager

```text
student.read
scope=CENTER
```

HO

```text
student.read
scope=GLOBAL
```

---

# 6. Event Driven Architecture

## Current

```text
CRM
 ↓
Student
 ↓
Finance
 ↓
Notification
```

## Proposed

```text
CRM
 │
 └── Publish LeadConverted Event
            │
            ├── SIS Create Student
            │
            ├── Finance Create Invoice
            │
            ├── Notification Send Message
            │
            └── Analytics Update Dashboard
```

Benefits:

- Loose Coupling
- Independent Modules
- Easier Testing
- Easier Scaling

---

# 7. Module Boundaries

## CRM

```text
Lead
Pipeline
Campaign
Commission
```

## SIS

```text
Student
Parent
Enrollment
Competency Profile
```

## LMS

```text
Course
Lesson
Assignment
Quiz
Certificate
```

## Attendance

```text
Attendance
Face Recognition
IoT
Geofencing
```

## Finance

```text
Invoice
Payment
Debt
Revenue
Wallet
```

---

# 8. Database Architecture

```text
PostgreSQL
│
├── identity
├── organization
├── crm
├── sis
├── lms
├── attendance
├── finance
├── report
└── audit
```

Alternative:

```text
prisma/
├── identity.prisma
├── organization.prisma
├── crm.prisma
├── sis.prisma
├── lms.prisma
├── finance.prisma
```

---

# 9. Audit Architecture

```text
AuditLog
```

Fields

```text
user_id
module
entity
action
old_value
new_value
ip_address
device
created_at
```

---

# 10. Integration Architecture

```text
Integration Module
│
├── Zalo OA
├── MISA
├── Resend
├── Google
├── AI Camera
├── Blockchain
└── Future Integrations
```

Rule:

Không module nào gọi trực tiếp hệ thống bên ngoài.

---

# 11. AI Architecture

```text
AI Gateway
│
├── OpenAI
├── Gemini
├── Claude
├── DeepSeek
└── Local LLM
```

Applications

```text
AI Tutor
AI CRM Assistant
AI Reporting
AI Competency Analysis
AI Learning Path
```

---

# 12. Multi Tenant Ready

```text
Platform
│
├── Sata Robo
├── Partner A
├── Partner B
└── Partner C
```

Required Columns

```text
tenant_id
organization_id
```

---

# 13. Refactoring Roadmap

## Phase 1

- Dynamic Role
- Permission
- Scope

## Phase 2

- Organization Module
- HO Structure
- Multi Center

## Phase 3

- Event Bus
- Domain Event

## Phase 4

- CRM
- SIS
- LMS
- Finance

Module Isolation

## Phase 5

- Marketplace
- AI Platform
- Franchise SaaS
- White Label

---

# 14. Expected Improvements

| Area | Current | New |
|--------|----------|------|
| Roles | Hard-code | Dynamic |
| Centers | Single Center | Multi Center |
| HO | Not supported | Supported |
| Franchise | Difficult | Native |
| Dependency | Tight Coupling | Loose Coupling |
| Scaling | Medium | High |
| SaaS Ready | No | Yes |
| AI Ready | Limited | Native |
| Audit | Partial | Full |
| Security | RBAC | RBAC + ABAC + Scope |

---

# Final Recommendation

Không chuyển sang Microservice ở giai đoạn hiện tại.

Kiến trúc phù hợp nhất:

```text
Modular Monolith
+
Dynamic RBAC
+
Organization Hierarchy
+
Event Driven Internal
+
Multi Tenant Ready
+
AI Gateway
```

Mục tiêu phục vụ 5-10 năm tiếp theo của hệ sinh thái Sata Robo.
