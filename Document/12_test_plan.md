# Sata Robo VN — Quality Assurance & Test Plan

Tài liệu này xác định kế hoạch kiểm thử, các công cụ sử dụng và bộ quy tắc kiểm soát chất lượng (Quality Assurance) trước khi triển khai hệ thống Sata Robo VN lên môi trường sản phẩm (Production).

---

## 1. Các cấp độ Kiểm thử (Test Levels)

Hệ thống áp dụng chiến lược kiểm thử đa tầng để phát hiện lỗi sớm và tối ưu hóa thời gian phát triển:

*   **Kiểm thử Đơn vị (Unit Tests)**:
    *   *Công cụ:* **Vitest 4.x** (được cấu hình trong `vitest.config.ts` kết hợp với `@vitejs/plugin-react` và môi trường giả lập trình duyệt `jsdom`).
    *   *Mục tiêu:* Kiểm tra các hàm logic nghiệp vụ độc lập, thuật toán chia ca làm việc, tính công chấm công, cấu hình phân quyền và bộ lọc dữ liệu.
*   **Kiểm thử Tích hợp (Integration Tests)**:
    *   *Công cụ:* Vitest kết hợp thư viện `@testing-library/react` và `@testing-library/jest-dom`.
    *   *Mục tiêu:* Kiểm tra sự tương tác giữa các React components và luồng hoạt động của Server Actions (xác thực dữ liệu đầu vào + kiểm tra quyền hạn trước khi ghi nhận vào database giả lập).
*   **Kiểm thử Giao diện thực tế (End-to-End - E2E Tests)**:
    *   *Công cụ:* **Playwright 1.60** (được cấu hình trong `playwright.config.ts`).
    *   *Mục tiêu:* Giả lập hành vi thực tế của người dùng trên trình duyệt (quét mã QR chấm công, quy trình điền form lead, đặt lịch học thử, phụ huynh kiểm tra thời khóa biểu trên Portal).
*   **Kiểm tra Kiểu dữ liệu & Linting**:
    *   *Công cụ:* TypeScript Compiler (`tsc --noEmit`) và ESLint.
    *   *Mục tiêu:* Đảm bảo tính nhất quán của mã nguồn, phát hiện sớm lỗi cú pháp và kiểm soát việc phân chia thư viện UI (không import sai thư viện giữa Admin và Public).

---

## 2. Các kịch bản chạy Kiểm thử (Test Scripts)

Các lệnh kiểm thử được định nghĩa trong `package.json` để chạy tự động hoặc thủ công:

*   `pnpm typecheck`: Thực hiện biên dịch kiểm tra lỗi kiểu dữ liệu TypeScript toàn dự án.
*   `pnpm lint`: Thực hiện quét lỗi cú pháp và tiêu chuẩn code bằng ESLint.
*   `pnpm test:unit`: Chạy toàn bộ các bài unit tests và integration tests bằng Vitest (chạy 1 lần rồi thoát).
*   `pnpm test:unit:watch`: Chạy Vitest ở chế độ quan sát (chế độ phát triển, tự động chạy lại khi sửa file).
*   `pnpm test:e2e`: Khởi động máy chủ phát triển local và chạy toàn bộ các bài test E2E bằng Playwright.
*   `pnpm test:e2e:ui`: Chạy Playwright ở giao diện đồ hoạ tương tác trực quan để debug luồng giao diện.
*   `pnpm test:e2e:smoke`: Chỉ chạy riêng các bài test E2E kiểm tra khói (Smoke Tests) nhanh cho các trang chính.
*   `pnpm test`: Lệnh tổng hợp chạy tuần tự `typecheck` -> `lint` -> `test:unit` -> `test:e2e:smoke`.

---

## 3. Các bài Kiểm thử hiện có (Existing Tests)

Hệ thống đã triển khai sẵn các bộ test mẫu làm tiền đề mở rộng:
*   **Unit Tests (`lib/`)**:
    *   `lib/cookie-consent.test.ts`: Kiểm tra lưu trữ và chấp thuận chính sách cookie của người dùng.
    *   `lib/shifts.test.ts`: Kiểm tra logic tính toán giờ làm việc, ca gãy, ca đêm của nhân viên.
    *   `lib/work-schedule.test.ts`: Kiểm tra thuật toán xếp lịch làm việc và cảnh báo trùng ca trực.
*   **E2E Tests (`tests/e2e/`)**:
    *   `tests/e2e/smoke.spec.ts`: Kiểm tra xem các trang Landing Page chính có tải thành công và hiển thị đầy đủ các thành phần giao diện cốt lõi (Header, Footer, form đăng ký).
    *   `tests/setup.ts`: File cấu hình khởi tạo môi trường và dọn dẹp dữ liệu trước khi chạy test.

---

## 4. Mục tiêu Độ phủ Kiểm thử (Coverage Targets)

Hệ thống đặt ra chỉ số KPI độ phủ kiểm thử nghiêm ngặt đối với các phần mã nguồn quan trọng:

*   **Logic Nghiệp vụ (`lib/`)**: Độ phủ (Code Coverage) đạt tối thiểu **> 80%**. Đặc biệt các hàm tính toán lương, chấm công và sắp xếp học bù cần đạt 100%.
*   **Xác thực Đầu vào (`lib/validators/`)**: Đạt **100%** độ phủ kiểm thử. Mọi Zod schema đều phải được chạy test kiểm tra các trường hợp nhập đúng, nhập thiếu và nhập sai định dạng.
*   **Ma trận Phân quyền (`lib/auth/permissions.ts`)**: Đạt **100%** độ phủ kiểm thử để đảm bảo tính an toàn tuyệt đối. Cần kiểm duyệt toàn bộ hành động tương ứng với từng role, đặc biệt kiểm tra chặn role `PARENT` khỏi trang Admin.

---

## 5. Quy trình Kiểm thử thủ công trước khi Deploy (QA Checklist)

Trước khi thực hiện merge code vào nhánh `main` để deploy lên production, lập trình viên bắt buộc phải hoàn thành các bước kiểm tra thủ công sau:

1.  **Chạy kiểm tra tự động**: Lệnh `pnpm test` phải PASS hoàn toàn không có bất kỳ cảnh báo đỏ nào.
2.  **Smoke Test trên Localhost**: Chạy thử dự án ở local (`pnpm dev`), thực hiện thao tác cơ bản: đăng nhập với 3 tài khoản mẫu (`SUPER_ADMIN`, `TEACHER`, `PARENT`) để đảm bảo giao diện hiển thị đúng phân quyền.
3.  **Kiểm tra Viewport Mobile 375px**: Mở Chrome DevTools chuyển sang chế độ Responsive giả lập màn hình di động chiều rộng 375px. Kiểm tra xem thanh điều hướng (Hamburger Menu), bảng biểu, và form đăng ký lead có bị tràn viền (overflow) hoặc lỗi hiển thị không.
4.  **Kiểm tra Tương thích ngược Migrations**: Nếu có thay đổi database, đảm bảo đã chạy script di chuyển dữ liệu cũ và hệ thống hoạt động tương thích ở Phase A trước khi tiến hành Phase B.

---

## 6. Kiểm thử Hiệu năng & Chỉ số Web Vitals

*   **Tốc độ Tải trang (Lighthouse)**:
    *   Trang Landing Page Công cộng: Chỉ số hiệu năng đạt tối thiểu **>= 85** trên thiết bị di động.
    *   Trang Admin / Portal: Đạt tối thiểu **>= 90** trên thiết bị di động (nhờ tối giản hoá các hiệu ứng chuyển động).
*   **Ngưỡng đo lường Web Vitals**:
    *   *Largest Contentful Paint (LCP):* Thời gian tải thành phần nội dung lớn nhất phải dưới **2.5 giây**.
    *   *Cumulative Layout Shift (CLS):* Tỉ lệ thay đổi bố cục bất ngờ khi tải trang phải dưới **0.1**.
