# Sata Robo VN — Frontend Technical Specification

## 1. Công nghệ Giao diện chính (Frontend Stack)

*   **Framework**: Next.js 16 (App Router) tận dụng tối đa Server Components và Client Components để tối ưu hóa hiệu năng render và SEO.
*   **Thư viện Component**: React 19 chạy ở chế độ Strict Mode để đảm bảo code sạch, kiểm soát tối đa vòng đời của component và tránh rò rỉ bộ nhớ.
*   **Ngôn ngữ**: TypeScript cấu hình ở mức nghiêm ngặt nhất (`strict: true`), loại bỏ hoàn toàn việc sử dụng kiểu dữ liệu `any` vô tội vạ.
*   **Phong cách Thiết kế (Styling)**: Tailwind CSS v4 cấu hình mobile-first.
    *   *Màu chủ đạo thương hiệu (Brand Colors):* Cam (`#F97316` - tượng trưng cho sự năng động khoa học robot) và Tím (`#7C3AED` - tượng trưng cho công nghệ và trí tuệ).
*   **Font chữ & Icon**: Font `@fontsource/noto-sans` mang lại sự dễ đọc, hỗ trợ hiển thị tốt tiếng Việt trên các màn hình di động độ phân giải cao. Icon sử dụng bộ thư viện `lucide-react`.

---

## 2. Cây thư mục Component & Phân chia Thư viện UI (Component Split)

Để đảm bảo hiệu năng và bundle size của trang Public không bị phình to do các thư viện biểu đồ nặng của trang Admin, hệ thống áp dụng cấu hình quy tắc ESLint phân chia nghiêm ngặt:

```
components/
├── ui/         # [SHARED] Các components nền của shadcn/ui. Dùng chung cho cả Admin & Client.
├── magic/      # [CLIENT ONLY - PUBLIC] Hiệu ứng Magic UI dùng cho trang landing, marketing.
├── motion/     # [CLIENT ONLY - PUBLIC] Các wrapper hoạt ảnh cuộn trang từ Framer Motion.
└── charts/     # [ADMIN ONLY] Các component biểu đồ Recharts phục vụ phân tích báo cáo Admin.
```

### Quy tắc Phân chia (Enforced by ESLint):
*   **Admin Page**: Chỉ được phép import components từ `ui/`, `charts/` và `admin/`. Tuyệt đối cấm import từ `magic/` và `motion/` (để tối ưu hóa tốc độ tải trang Admin, giảm thiểu hoạt ảnh gây xao nhãng).
*   **Public Page**: Chỉ được phép import components từ `ui/`, `magic/`, `motion/` và các thư mục giao diện public khác (`honors/`, `blog/`, `jobs/`). Tuyệt đối cấm import từ `charts/` (để giữ bundle size của trang public ở mức tối thiểu).

---

## 3. Cấu trúc Trang & Nhóm Định tuyến (Routing Structure)

Hệ thống Next.js 16 sử dụng cơ chế định tuyến thư mục (Folder-based Routing) chia thành các route groups:

```
app/
├── (public)/          # satarobo.vn (Trang chủ, khoa-hoc, vinh-danh, tin-tuc, tuyen-dung, lien-he)
├── (admin)/admin/     # admin.satarobo.vn (Các module Dashboard, CRM, Học viên, Lớp học, Nhân sự)
├── (auth)/login/      # Trang đăng nhập tập trung
└── (portal)/portal/   # hocvien.satarobo.vn (Lịch học, nhận xét, học bạ, satacoin)
```

---

## 4. Cơ chế Render & Đồng bộ dữ liệu (Client-Server Synergy)

### 4.1. Nguyên lý Server-first
Mặc định mọi component trong thư mục `app/` đều là **React Server Components (RSC)** để thực hiện việc truy vấn cơ sở dữ liệu trực tiếp (`async/await` kết hợp với Prisma Client) ở phía server, giảm thiểu việc tải mã javascript thừa xuống trình duyệt và tối đa hóa SEO.
*   Chỉ khai báo `'use client'` ở đầu file đối với các components thực sự cần tương tác người dùng (như form, nút bấm có sự kiện click, sử dụng hooks `useState`, `useEffect` hoặc chạy hoạt ảnh Magic UI/Framer Motion).

### 4.2. Không sử dụng `useEffect` để fetch data
Tuyệt đối cấm sử dụng `useEffect` kết hợp với `fetch()` tại Client Components để lấy dữ liệu ban đầu. Toàn bộ dữ liệu phải được fetch từ RSC và truyền xuống Client Components dưới dạng `props`.

### 4.3. Biến đổi dữ liệu (Mutations) qua Server Actions
Mọi thao tác chỉnh sửa dữ liệu (Thêm, sửa, xoá) bắt buộc sử dụng **Server Actions** đặt trong file có chỉ thị `'use server'` ở đầu trang. Mô hình thực thi Server Actions:

```
[ Người dùng Submit Form ] ──► [ Gọi Server Action (Safe Parse Input với Zod) ]
                                                        │
                                                        ▼
[ Kiểm tra Auth & Permissions ] ──► [ Thực thi Prisma Mutation trong DB ]
                                                        │
                                                        ▼
[ revalidatePath / revalidateTag ] ──► [ Trả về kết quả { ok: true/false } ]
```

---

## 5. Quản lý Trạng thái & Biểu mẫu (State & Forms)

*   **Không sử dụng Redux/Zustand**: Vì hệ thống Next.js tận dụng cơ chế URL làm trạng thái chính (URL State như query parameters cho việc tìm kiếm, phân trang, bộ lọc) và truyền props trực tiếp, hệ thống không sử dụng các thư viện quản lý state toàn cục phức tạp.
*   **Quản lý Form lớn**: Sử dụng thư viện **React Hook Form** kết hợp với **Zod Resolver** để thực hiện xác thực dữ liệu ngay tại client trước khi gửi lên server.

---

## 6. Ngân sách Hoạt ảnh & Trải nghiệm (Animation Budget)

Để đảm bảo hiệu năng tải trang mượt mà trên thiết bị di động cấu hình yếu, hệ thống áp dụng ngân sách hoạt ảnh nghiêm ngặt:

| Phân hệ / Trang | Thư viện sử dụng | Ngân sách / Giới hạn |
| :--- | :--- | :--- |
| **Trang chủ / Hero** | Magic UI (Particles, Border Beam) | Chạy tối đa 600ms, tự động tắt hiệu ứng hạt trên mobile nếu FPS tụt. |
| **Trang Khoá học** | Framer Motion (RevealOnScroll) | Hoạt ảnh xuất hiện khi cuộn trang, chỉ chạy 1 lần (`viewport={{ once: true }}`). |
| **Trang Admin** | CSS Transitions đơn giản | Không dùng Framer Motion. Chỉ sử dụng hiệu ứng hover CSS thuần để tối ưu tốc độ phản hồi. |
| **Tuyển dụng / Liên hệ** | Không sử dụng hoạt ảnh | Tối giản, tập trung vào tốc độ phản hồi và điền biểu mẫu nhanh chóng. |

---

## 7. Cấu hình SEO & Siêu dữ liệu (SEO Best Practices & Metadata)

Tất cả các trang public đều tự động triển khai SEO bằng cách khai báo metadata:
*   **Metadata Tĩnh**: Export hằng số `metadata` ở các trang tĩnh (Tiêu đề trang, Meta Description, OpenGraph Image, Canonical URL).
*   **Metadata Động (Dynamic Metadata)**: Sử dụng hàm `generateMetadata` đối với các trang động như chi tiết khoá học `/khoa-hoc/[slug]` hay bài viết `/tin-tuc/[slug]` để đọc thông tin tiêu đề và ảnh đại diện từ database trước khi trả kết quả HTML về trình duyệt.
*   **Dữ liệu cấu trúc JSON-LD**: Tích hợp các Schema cấu trúc dữ liệu của Google (như `BreadcrumbList` cho mọi trang con và `Course` cho trang chi tiết khoá học) để nâng cao thứ hạng tìm kiếm và hiển thị rich snippets.
*   **Responsive Viewport**: Toàn bộ giao diện phải vượt qua bài kiểm tra độ thân thiện di động với kích thước thiết kế chuẩn 375px (Viewport Mobile tiêu chuẩn).
