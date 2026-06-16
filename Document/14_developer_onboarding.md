# Sata Robo VN — Developer Onboarding Guide

Chào mừng bạn gia nhập đội ngũ phát triển dự án **Sata Robo VN**. Tài liệu này hướng dẫn chi tiết các bước thiết lập môi trường phát triển local và các quy chuẩn lập trình bắt buộc phải tuân thủ.

---

## 1. Yêu cầu Hệ thống & Công cụ cài đặt trước (Prerequisites)

Trước khi bắt đầu, hãy đảm bảo máy tính của bạn đã cài đặt các công cụ sau:
*   **Node.js**: Phiên bản LTS mới nhất (Khuyên dùng v20 trở lên).
*   **pnpm**: Phiên bản 11. Cài đặt bằng cách bật Corepack:
    ```bash
    corepack enable
    corepack prepare pnpm@latest --activate
    ```
*   **PostgreSQL Client**: Để mở kết nối trực tiếp đến database (hoặc dùng DBeaver, TablePlus).
*   **Git**: Đã cấu hình khoá SSH kết nối với GitHub.

---

## 2. Các bước Thiết lập Dự án (Setup Steps)

Chạy tuần tự các lệnh sau trong Terminal (đối với Windows khuyên dùng PowerShell):

```bash
# 1. Tải mã nguồn về máy local
git clone git@github.com:hptkk29/satarobo-vn.git
cd satarobo-vn

# 2. Tạo file cấu hình môi trường local từ file mẫu
cp .env.example .env.local

# 3. Mở file .env.local bằng VS Code và điền thông tin kết nối
# Cần điền ít nhất: DATABASE_URL, DIRECT_URL, NEXTAUTH_SECRET

# 4. Cài đặt toàn bộ các thư viện phụ thuộc
pnpm install

# 5. Chạy migrations để đồng bộ cấu trúc database mẫu vào DB local của bạn
pnpm db:migrate

# 6. Khởi tạo dữ liệu mẫu (Admin, Các khóa học, Cấu hình phân quyền)
pnpm db:seed

# 7. Khởi động máy chủ phát triển local
pnpm dev
```
Mở trình duyệt truy cập `http://localhost:3000` để kiểm tra kết quả chạy.

---

## 3. Thiết lập Cơ sở dữ liệu (Database Setup)

*   **Supabase Project**: Đăng ký dự án PostgreSQL miễn phí trên Supabase để lấy các chuỗi kết nối.
*   **DATABASE_URL (Runtime)**: Trỏ vào cổng PgBouncer Transaction Pooler (`:6543`), bắt buộc có thêm query parameter `?pgbouncer=true`.
*   **DIRECT_URL (Migrations)**: Trỏ vào cổng session pooler (`:5432`) không qua PgBouncer để chạy lệnh migrations an toàn.
*   *Lưu ý lỗi Windows DLL/EPERM:* Khi chạy `pnpm db:migrate` trên hệ điều hành Windows, thỉnh thoảng tiến trình phát triển `next-dev` đang giữ lock file DLL của Prisma. Hãy tắt dev server (`Ctrl+C`) trước khi chạy lệnh migration, sau đó khởi động lại dev server.
*   *Khởi động lại Dev Server:* Bất kỳ khi nào bạn chạy thay đổi cấu trúc database hoặc migrations, hãy **RESTART** lại dev server (`pnpm dev`) để xóa cache Prisma Client cũ trong RAM của Node.js.

---

## 4. Các lệnh Thường dùng (Key Commands Reference)

*   `pnpm dev`: Khởi chạy môi trường phát triển local.
*   `pnpm build`: Biên dịch dự án thành bản build production (lệnh này tự động chạy `prisma generate` trước).
*   `pnpm typecheck`: Thực hiện kiểm tra lỗi kiểu dữ liệu tĩnh TypeScript.
*   `pnpm lint`: Quét lỗi cú pháp và kiểm duyệt import thư viện UI.
*   `pnpm db:studio`: Khởi chạy công cụ trực quan hoá database của Prisma (mở cổng `localhost:5555`).
*   `pnpm test:unit`: Chạy toàn bộ Unit Tests bằng Vitest.
*   `pnpm test:e2e:smoke`: Chạy nhanh bài test E2E kiểm tra hoạt động các trang Landing Page.

---

## 5. Quy chuẩn viết code (Coding Conventions)

Để giữ code sạch và dễ bảo trì, dự án áp dụng các nguyên tắc sau:

1.  **Server-first**: Mọi trang và component mặc định là Server Component. Chỉ thêm chỉ thị `'use client'` khi thực sự cần xử lý tương tác phía trình duyệt.
2.  **TypeScript nghiêm ngặt**: Tuyệt đối cấm sử dụng kiểu `any`. Hãy khai báo kiểu rõ ràng hoặc dùng `unknown` kết hợp với narrow types. Khai báo Zod Schema làm gốc để tự suy ra TypeScript type qua `z.infer`.
3.  **Quy chuẩn đường dẫn Import (Path Aliases)**:
    *   `@/lib/db`: Kết nối Prisma Client.
    *   `@/lib/auth`: Cấu hình xác thực Auth.js.
    *   `@/lib/utils`: Sử dụng hàm cn helper cho CSS classes.
    *   `@/lib/validators/*`: Chứa các schemas xác thực dữ liệu đầu vào.
    *   `@/components/blog/markdown-renderer`: Thành phần kết xuất bài viết (Tuyệt đối không dùng trực tiếp thẻ `<Markdown>` thô).
4.  **Thiết kế Server Action chuẩn**: Mọi đột biến dữ liệu viết dưới dạng Server Action với quy trình bảo mật:
    `auth() (Xác thực)` -> `assertCan() (Phân quyền)` -> `safeParse() (Xác thực Zod)` -> `db.update() (Ghi DB)` -> `revalidatePath() (Invalidate Cache)`.

---

## 6. Quy chuẩn quản lý Git (Git & Commit Conventions)

*   **Tạo nhánh làm việc**: Các nhánh tính năng phải tuân thủ tiền tố đặt tên: `feature/tên-tính-năng` hoặc `bugfix/tên-sự-cố`.
*   **Cam kết code nhỏ lẻ (Chunk Commits)**: Commit code liên tục theo từng phần nhỏ hoàn thiện, không gom thành 1 commit lớn khổng lồ (big-bang commit).
*   **Pre-commit Hooks**: Hệ thống cài sẵn Husky và lint-staged để tự động chạy lint và typecheck trước khi commit. Hook này cũng tự động chặn commit các tệp tin `.env*` nhạy cảm và các file backup `*.bak` lên repository.

---

## 7. Các lỗi thường gặp và lưu ý nghiệp vụ (Gotchas & Don'ts)

*   ❌ **Không tự ý thêm thư viện giao diện mới**: Các thư viện UI cốt lõi đã được cố định bao gồm: shadcn/ui, Magic UI, và Recharts. Mọi thư viện giao diện bổ sung cần được họp bàn và CEO phê duyệt trước khi cài đặt.
*   ❌ **Không sử dụng useEffect để fetch dữ liệu ban đầu**: Hãy tận dụng cơ chế React Server Components và truyền dữ liệu xuống.
*   ❌ **Không drop các cột cũ của bảng Vinh danh (Honor)**: Các thuộc tính cũ của đợt di chuyển dữ liệu (`fullName`, `jobTitle`, `avatarUrl`, `yearsAtCompany`) cần được giữ lại ở trạng thái Nullable cho đến khi kết thúc giai đoạn Phase 4.7.1.
*   ❌ **Không sử dụng `dangerouslySetInnerHTML`**: Tránh hoàn toàn nguy cơ chèn mã độc, ngoại trừ thẻ chèn JSON-LD schema của Google.
