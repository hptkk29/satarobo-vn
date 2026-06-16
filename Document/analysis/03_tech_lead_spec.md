# Technical Specification & Code Skeletons — Sata Robo VN

**Tác giả:** Tech Lead Agent  
**Trạng thái:** Hoàn thành Thiết kế Kỹ thuật  
**Dự án:** Quản lý Học viên & LMS tích hợp kết hợp Module CRM Tuyển sinh  

Tài liệu này cung cấp hướng dẫn thiết kế kiến trúc phần mềm, cập nhật schema database, khai báo các API routes mới và cung cấp các đoạn mã nguồn mẫu (Code Skeletons) để các lập trình viên triển khai ngay.

---

## 1. Thiết kế Cơ sở dữ liệu (Database Schema updates)

Lập trình viên cần bổ sung các trường dữ liệu và bảng biểu sau vào tệp tin `prisma/schema.prisma` và chạy lệnh `pnpm db:migrate` để đồng bộ:

```prisma
// 1. Khai báo enum cho trạng thái phễu leads
enum LeadFunnelStatus {
  LEADS_1 // Tin nhắn tương tác thô từ quảng cáo
  LEADS_2 // Có SĐT, sẵn sàng bàn giao cơ sở
  LEADS_3 // Đã đóng học phí, ghi nhận doanh thu
}

// 2. Cập nhật Model Lead để tích hợp với phễu tuyển sinh mới
model Lead {
  id              String           @id @default(cuid())
  parentName      String
  phone           String           @unique
  email           String?
  childName       String?
  childAge        Int?
  status          LeadFunnelStatus @default(LEADS_1)
  
  // Nguồn marketing
  source          String           @default("facebook_ads")
  utmSource       String?
  utmMedium       String?
  utmCampaign     String?
  fbclid          String?
  gclid           String?
  
  // Bàn giao & Phân bổ
  centerId        String?
  center          Center?          @relation(fields: [centerId], references: [id])
  assignedToId    String?
  assignedTo      User?            @relation("AssignedLeads", fields: [assignedToId], references: [id])
  
  // Timestamps phục vụ tính SLA
  created_at      DateTime         @default(now())
  updated_at      DateTime         @updatedAt
  handed_at       DateTime?        // Thời gian bàn giao về cơ sở
  assigned_at     DateTime?        // Thời gian phân công cho TVV/Sales
  closed_at       DateTime?        // Thời gian đóng phí chốt lead
  
  activities      LeadActivity[]
  duplicates      LeadDuplicate[]
}

// 3. Model cấu hình phân chia lead tự động của từng trung tâm
model LeadAssignmentConfig {
  id        String   @id @default(cuid())
  centerId  String   @unique
  center    Center   @relation(fields: [centerId], references: [id], onDelete: Cascade)
  mode      String   @default("ROUND_ROBIN") // ROUND_ROBIN, CLOSE_RATE, MANUAL
  createdAt DateTime @default(now())
}

// 4. Bảng lưu trữ nhật ký tính toán hoa hồng 4 tầng cuối tháng
model CommissionPayout {
  id           String   @id @default(cuid())
  month        String   // Định dạng YYYY-MM
  centerId     String
  center       Center   @relation(fields: [centerId], references: [id])
  employeeId   String
  employee     Employee @relation(fields: [employeeId], references: [id])
  roleType     String   // QC_MARKETING, SALE_ADMIN, SALE_CSM, CENTER_MANAGER
  revenueBasis Float    // Doanh số dùng làm cơ sở tính
  percentage   Float    // Phần trăm hoa hồng (1%, 4%, 2%)
  amount       Float    // Số tiền hoa hồng được nhận (VND)
  createdAt    DateTime @default(now())
  
  @@unique([month, employeeId, roleType])
}
```

---

## 2. Thiết kế API & Server Actions

### 2.1. API endpoint thu thập lead có chống Spam (POST `/api/leads`)
*   **Tệp tin cần sửa/tạo:** [app/api/leads/route.ts](file:///d:/Code/RoboDev/satarobo-vn/app/api/leads/route.ts)
*   **Logic chống bot & spam:**
    *   Honeypot check: `if (body.website) { return fakeSuccess() }`
    *   Time check: `if (timeOnPage < 3) { return fakeSuccess() }`
    *   Deduplication: Truy vấn database tìm lead cùng số điện thoại tạo trong vòng 90 ngày:
        ```typescript
        const recentLead = await db.lead.findFirst({
          where: {
            phone: body.phone,
            created_at: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
          }
        })
        ```

### 2.2. Server Action tự động gán Lead theo cấu hình trung tâm (Auto-Assign Action)
*   **Tệp tin cần tạo:** `lib/lead/auto-assign.ts`
*   **Thuật toán phân phối:**
    *   Đọc cấu hình gán của `centerId`.
    *   Nếu là `ROUND_ROBIN`: Lấy danh sách Sales thuộc cơ sở có trạng thái đang kích hoạt, sắp xếp tăng dần theo thời gian tiếp nhận lead gần nhất. Gán lead cho người đứng đầu danh sách.
    *   Nếu là `CLOSE_RATE`: Truy vấn bảng `Order` trong 30 ngày qua để tính tỷ lệ chốt đơn thành công (`doanh số chốt / số lead được gán`). Gán lead cho Sales có tỷ lệ cao nhất.

---

## 3. Mã nguồn mẫu (Code Skeletons)

### 3.1. Logic tính toán Hoa hồng 4 tầng cuối tháng (Commission Calculation Engine)
Đoạn code dưới đây triển khai thuật toán tính toán hoa hồng tự động chạy bằng Cron Job hoặc kích hoạt thủ công từ giao diện Admin:

```typescript
// scripts/agents/commission-engine.ts
import { db } from '@/lib/db'

export async function calculateMonthlyCommission(month: string, centerId: string) {
  // Trích xuất khoảng thời gian trong tháng (ví dụ: month = "2026-06")
  const startDate = new Date(`${month}-01T00:00:00.000Z`)
  const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59, 999)
  
  console.log(`[Commission Engine] Bắt đầu tính toán cho tháng ${month} từ ${startDate.toISOString()} đến ${endDate.toISOString()}`)
  
  // 1. Lấy tất cả leads chuyển sang LEADS_3 (đã đóng học phí) trong tháng
  const closedLeads = await db.lead.findMany({
    where: {
      centerId,
      status: 'LEADS_3',
      closed_at: { gte: startDate, lte: endDate }
    },
    include: {
      assignedTo: true
    }
  })
  
  // Giả sử doanh thu mỗi lead lấy từ đơn hàng tương ứng
  // Tính tổng hoa hồng cho từng vai trò
  for (const lead of closedLeads) {
    const revenue = 10000000 // Ví dụ doanh thu 10 triệu đồng đóng phí
    
    // Tầng 3: Hoa hồng 4% cho Sales trực tiếp tư vấn chốt đơn
    if (lead.assignedToId) {
      await db.commissionPayout.upsert({
        where: {
          month_employeeId_roleType: {
            month,
            employeeId: lead.assignedToId,
            roleType: 'SALE_CSM'
          }
        },
        create: {
          month,
          centerId,
          employeeId: lead.assignedToId,
          roleType: 'SALE_CSM',
          revenueBasis: revenue,
          percentage: 4.0,
          amount: revenue * 0.04
        },
        update: {
          revenueBasis: { increment: revenue },
          amount: { increment: revenue * 0.04 }
        }
      })
    }
    
    // Tầng 2: Hoa hồng 1% cho Sale Admin bàn giao lead
    // (Lập trình viên bổ sung query tìm admin_id đã handover lead và tính tương tự)
  }
  
  console.log(`[Commission Engine] Hoàn thành tính hoa hồng tháng ${month} tại cơ sở ${centerId}`)
}
```

### 3.2. Cấu trúc Token Session Đa con cho Phụ huynh (Portal Multi-Student Context)
Cung cấp Provider để phụ huynh chuyển đổi nhanh thông tin học tập của các con trên Portal:

```typescript
// components/portal/student-context.tsx
'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'

interface Student {
  id: string
  fullName: string
  code: string
}

interface StudentContextType {
  activeStudent: Student | null
  studentsList: Student[]
  setActiveStudent: (student: Student) => void
}

const StudentContext = createContext<StudentContextType | undefined>(undefined)

export function StudentProvider({ children, initialStudents }: { children: React.ReactNode, initialStudents: Student[] }) {
  const [students, setStudents] = useState<Student[]>(initialStudents)
  const [activeStudent, setActiveStudentState] = useState<Student | null>(null)

  useEffect(() => {
    // Mặc định chọn đứa con đầu tiên
    if (initialStudents.length > 0) {
      const savedId = localStorage.getItem('portal_active_student_id')
      const found = initialStudents.find(s => s.id === savedId)
      setActiveStudentState(found || initialStudents[0])
    }
  }, [initialStudents])

  const setActiveStudent = (student: Student) => {
    setActiveStudentState(student)
    localStorage.setItem('portal_active_student_id', student.id)
  }

  return (
    <StudentContext.Provider value={{ activeStudent, studentsList: students, setActiveStudent }}>
      {children}
    </StudentContext.Provider>
  )
}

export function usePortalStudent() {
  const context = useContext(StudentContext)
  if (!context) {
    throw new Error('usePortalStudent must be used within a StudentProvider')
  }
  return context;
}
```

---

## 4. Hướng dẫn Kiểm tra & Nghiệm thu Kỹ thuật (Verification)

*   **Kiểm tra Unit Test (`lib/lead/dedup.test.ts`)**: Viết test giả lập tạo lead mới để đảm bảo thuật toán dedup số điện thoại trong 90 ngày hoạt động chính xác.
*   **Smoke Test Webhook**: Sử dụng Postman để giả lập gọi POST tới `/api/leads` với body chứa honeypot field `website: "spam.com"`. Xác minh HTTP Status phản hồi là 200 nhưng database không được tăng số bản ghi lead.
