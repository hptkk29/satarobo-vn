# Sata Robo VN — Backend Technical Specification

## 1. Môi trường Thực thi & Middleware Stack (Runtime & Middleware)

*   **Môi trường chạy (Runtime)**: Chạy trên Vercel Serverless Functions dưới dạng môi trường Node.js.
*   **Mạch xử lý Middleware (`proxy.ts`)**:
    *   Mỗi yêu cầu HTTP đi qua file định nghĩa middleware ở mức edge để nhận diện phân loại host và định tuyến.
    *   **Host Detection**: Đọc thông tin header host để gán nhãn loại luồng (Public, Admin, Portal, Vercel, Unknown).
    *   **Route Policy Checks**: Gọi hàm `decideRoute` từ thư viện `@/lib/auth/route-policy.ts` để kiểm tra nhanh token bảo mật JWT.
    *   **Bảo vệ Subdomain Admin**: Thêm header `X-Robots-Tag: noindex, nofollow, noarchive` cho subdomain `admin.satarobo.vn` để ngăn chặn các bot tìm kiếm (Google, Bing) lập chỉ mục trang quản trị nội bộ.
    *   **Chặn Portal**: Yêu cầu người dùng đăng nhập phải có vai trò `PARENT` mới được truy cập cổng Portal học sinh, ngược lại sẽ redirect về `/login`.
    *   **Localhost Simulation**: Khi chạy ở local, giả lập các subdomain bằng tiền tố đường dẫn `/admin/*` và `/portal/*`.

---

## 2. Thiết kế Nghiệp vụ đột biến dữ liệu (Server Actions Pattern)

Tất cả các hành động ghi hoặc thay đổi cơ sở dữ liệu (Mutations) từ phía client bắt buộc phải sử dụng **Server Actions** để đảm bảo tính an toàn bảo mật, tránh lộ lọt API endpoint ra bên ngoài. Các bước thực thi chuẩn trong 1 Server Action:

```typescript
'use server'

import { auth } from '@/lib/auth'
import { assertCan } from '@/lib/auth/permissions'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { leadUpdateSchema } from '@/lib/validators/lead'

export async function updateLead(leadId: string, data: unknown) {
  try {
    // 1. Kiểm tra xác thực (Authentication)
    const session = await auth()
    if (!session?.user) {
      return { ok: false, error: 'Chưa đăng nhập' }
    }

    // 2. Kiểm tra phân quyền chi tiết (Authorization - RBAC check)
    // Ví dụ: Chỉ Sales, Center Manager hoặc Super Admin mới được sửa Lead
    assertCan(session.user.role, 'leads:edit')

    // 3. Xác thực dữ liệu đầu vào (Safe Parse Input với Zod)
    const parsed = leadUpdateSchema.safeParse(data)
    if (!parsed.success) {
      return { ok: false, error: 'Dữ liệu không hợp lệ', issues: parsed.error.issues }
    }

    // 4. Thực thi nghiệp vụ qua Prisma ORM
    const updated = await db.lead.update({
      where: { id: leadId },
      data: parsed.data
    })

    // 5. Đồng bộ hóa bộ nhớ đệm (Cache Invalidation)
    revalidatePath('/admin/leads')

    // 6. Trả về kết quả chuẩn hoá
    return { ok: true, data: updated }
  } catch (error) {
    console.error('[Action UpdateLead Error]', error)
    return { ok: false, error: 'Lỗi hệ thống trong quá trình cập nhật' }
  }
}
```

---

## 3. Xác thực Dữ liệu Biểu mẫu (Validation Rules & Sanitization)

Toàn bộ biểu mẫu đầu vào được kiểm soát chặt chẽ thông qua các Zod schemas đặt tại thư mục `@/lib/validators/`. Hệ thống triển khai 22 bộ schema validators cho các đối tượng khác nhau:

*   **Chuyển đổi chuỗi rỗng thành Null**: Trong các biểu mẫu, người dùng thường để trống các trường tùy chọn, dẫn đến gửi chuỗi rỗng `""`. Zod schema triển khai biến đổi tự động:
    ```typescript
    const nullableStr = z.string().trim().transform(v => v === "" ? null : v).nullable()
    ```
*   **Vệ sinh mã độc (Sanitization)**: Trước khi lưu trữ nội dung văn bản thô dạng Markdown (ví dụ: bài viết tin tức), dữ liệu được làm sạch thông qua thư viện `isomorphic-dompurify` để loại bỏ toàn bộ các thẻ HTML độc hại có nguy cơ gây tấn công Cross-Site Scripting (XSS).

---

## 4. Quản lý Rate Limiting & Chống Spam Leads

*   **Endpoint `/api/leads`**: Đây là endpoint public nhận thông tin điền form của phụ huynh, dễ bị tấn công spam. Hệ thống áp dụng:
    *   **Rate Limit**: Giới hạn tối đa **5 lượt submit lead trên 1 IP trong vòng 60 giây**. Sử dụng thư viện `@/lib/rate-limit.ts` giao tiếp qua Upstash Redis (nếu không có Redis sẽ fallback về in-memory Map lưu tạm).
    *   **Honeypot Trap**: Thêm trường nhập liệu ẩn tên là `website`. Trình duyệt người dùng sẽ ẩn trường này đi, nhưng bot auto điền form sẽ điền vào. Nếu trường `website` có chứa dữ liệu, hệ thống lập tức giả lập kết quả gửi thành công 200 nhưng thực chất loại bỏ lead âm thầm.
    *   **Time-on-page Check**: Nếu lead được submit từ lúc tải trang đến lúc nhấn gửi dưới 3 giây, hệ thống từ chối ghi nhận vì đây là tốc độ của bot.
    *   **Deduplication**: Số điện thoại gửi lên được đối soát trong bảng `LeadDuplicate` kiểm tra xem đã có lead nào cùng số điện thoại tạo trong vòng 90 ngày hay chưa. Nếu có, ghi nhận liên kết lead trùng và không phân chia lại cho Sales khác.

---

## 5. Các Hệ thống Nghiệp vụ Nền (Background Subsystems)

### 5.1. Hệ thống Gửi Email qua Hàng đợi (Email Queue System)
Để tránh làm chậm luồng xử lý chính khi người dùng thực hiện thao tác (như đăng ký học phí, xếp lịch), hệ thống gửi email chạy bất đồng bộ:
*   Mỗi khi có sự kiện cần gửi email, hệ thống tạo bản ghi `EmailQueue` ở trạng thái `PENDING`.
*   Cron job `/api/cron/email-queue` chạy mỗi 5 phút sẽ lấy các email này ra, kết xuất HTML dựa trên `EmailTemplate` cấu hình sẵn, thực hiện gửi qua Resend API và cập nhật trạng thái kết quả.

### 5.2. Quản lý Lưu trữ Tệp tin (Cloudflare R2 Storage Flow)
Để tránh overload RAM của Next.js serverless functions khi tải file lớn:
1.  Client gửi yêu cầu lấy URL ký sẵn (Presigned URL) thông qua endpoint `/api/admin/upload-url`.
2.  Server sử dụng AWS S3 SDK tạo ra một URL ký sẵn có thời hạn 15 phút và trả về cho client.
3.  Client thực hiện tải trực tiếp tệp tin (ảnh học viên, ảnh hoạt động) từ trình duyệt lên Cloudflare R2 bucket thông qua URL ký sẵn đó.
4.  Sau khi upload thành công, client gửi URL của tệp tin lên server để lưu vào database.

### 5.3. Trình sinh mã định danh tự động (Code Generator)
Các mã số như Mã học viên (`CS1.HV.26.0001`), Mã đơn hàng (`ORD-260521-000001`), Mã lớp học được tạo ra thông qua thư viện `@/lib/codegen.ts`. Thư viện này thực hiện tăng biến đếm nguyên tử (Atomic Counter) trong bảng `Counter` của database để đảm bảo không bao giờ bị trùng lặp mã khi có nhiều yêu cầu tạo đồng thời.

### 5.4. Cơ chế Soft Delete (Xóa tạm)
Tất cả các thực thể quan trọng trong hệ thống đều triển khai thuộc tính `deletedAt DateTime?`.
*   Khi người dùng nhấn xóa, hệ thống chỉ cập nhật trường `deletedAt = now()` thay vì chạy lệnh `DELETE` vật lý.
*   Toàn bộ câu lệnh tìm kiếm Prisma đều tự động lọc điều kiện `{ deletedAt: null }`. Chỉ duy nhất người dùng có vai trò `SUPER_ADMIN` mới có quyền xóa vĩnh viễn (Hard Delete) khỏi database.

### 5.5. Nhật ký Thay đổi Dữ liệu (Audit Trail)
Mọi thay đổi dữ liệu trên các bảng quan trọng (Lead, Student, Order, Enrollment) đều được lưu trữ thông tin lịch sử thay đổi vào các bảng Audit Log tương ứng:
*   Cấu trúc bản ghi chứa: `changedByUserId`, `changedByName` (lấy snapshot tên nhân viên lúc đó phòng trường hợp tài khoản nhân viên bị xóa), `oldValues` (dữ liệu JSON trước khi sửa), `newValues` (dữ liệu JSON sau khi sửa) và mảng các cột bị thay đổi `changedFields`.
*   Bảng Audit log là append-only (chỉ thêm mới, không sửa, không xóa) để phục vụ công tác thanh tra khi có tranh chấp dữ liệu.
