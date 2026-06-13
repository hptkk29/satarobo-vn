# R7-03 — Ưu đãi theo khóa + snapshot giá Enrollment

**ID** R7-03 · **PR** 1 · **Ưu tiên** P1 · **Ước lượng** M · **Phụ thuộc** R7-00 · **Trạng thái** TODO · **US** US-CRS-1..3 · **SRS** §9, §28.3

## 1. Mục tiêu & bối cảnh
Giá hiện ở `Course.price` (schema:734); ưu đãi chỉ có `Voucher` theo OrderType — không cấu hình được giảm giá/học bổng per khóa. Snapshot giá nằm rải ở Order/OrderItem, Enrollment thiếu cấu trúc 4 thành phần (niêm yết/loại ưu đãi/giảm/phải thu) → không bất biến tường minh khi đổi bảng giá.

## 2. Phạm vi
- **In:** model `CourseDiscount`; snapshot 4 cột trên Enrollment ghi tại convert; field tuổi/trình độ trên Course; guard "course chưa có curriculum xuất bản → không kích hoạt lớp" (logic dùng ở R7-06).
- **Out:** UI convert (R7-05); payment (R7-04); thay đổi cơ chế Voucher hiện có.

## 3. Thiết kế kỹ thuật
- `CourseDiscount{id, courseId FK, type enum(AMOUNT/PERCENT/SCHOLARSHIP/PROGRAM), value Int, note?, conditions?, active, validFrom?/validTo?}` — giá áp toàn hệ thống, KHÔNG per-center (QĐ-9 SRS).
- Enrollment thêm: `listPrice Int?`, `discountType String?`, `discountAmount Int?`, `finalPrice Int?` (additive; `tuition` cũ giữ — 2-phase). Helper `lib/finance/pricing.ts`: `computeEnrollmentPrice(course, discount)` (Vitest).
- Course thêm `ageRange String?`, `level String?`. UI admin: tab "Ưu đãi" trong course detail (can `courses:edit`).

## 4. Acceptance Criteria
- AC1: Cấu hình giảm 10% trên khóa 10tr → convert tính giảm 1tr, phải thu 9tr; giảm AMOUNT tương tự.
- AC2: Enrollment đã tạo giữ nguyên 4 giá trị snapshot khi Course đổi giá/sửa discount.
- AC3: Chỉ role được phân quyền cấu hình ưu đãi; mutation có audit.
- AC4: Biên: PERCENT 0/100, AMOUNT > listPrice → clamp về 0đ phải thu + cảnh báo.

## 5. Files dự kiến
schema + migration `add_course_discount_enrollment_snapshot` · `lib/finance/pricing.ts` (+test) · `lib/validators/course-discount.ts` · `app/(admin)/admin/courses/[id]` (tab ưu đãi) · `tests/e2e/r7/course-pricing.spec.ts`.

## 6. Edge cases & xử lý lỗi
Discount hết hạn validTo giữa lúc Sale đang nhập form → validate lại lúc submit · 2 discount cùng active → Sale chọn 1 (không cộng dồn v1) · course không giá (price null) → chặn convert với khóa đó.

## 7. Rollback / Feature flag
Additive — cột snapshot null với record cũ; helper đọc fallback `tuition` cũ. Không flag.

## 8. Test plan
| Case ID | Nhóm | B/E | Bước | Kết quả | Tool |
|---|---|---|---|---|---|
| R7-03-C1 | T1 | B | computeEnrollmentPrice các loại | đúng số | Vitest |
| R7-03-C2 | T12 | B | đổi Course.price sau convert | snapshot bất biến | Playwright |
| R7-03-C3 | T4/T9 | B | SALES_CSM tạo discount | chặn; admin tạo → audit | Playwright |
| R7-03-C4 | T3 | B | PERCENT=100, AMOUNT=price+1 | phải thu 0, không âm | Vitest |
| R7-03-C5 | T2 | E | value âm, type sai enum | Zod reject | Vitest |

## 9. Test data
Course 10tr/48 buổi + 3 discount (PERCENT 10, AMOUNT 500k, SCHOLARSHIP 100%).

## 10. RTM
AC1↔C1 · AC2↔C2 · AC3↔C3 · AC4↔C4 · validation↔C5.

## 11. DoD
DoD chuẩn + helper pricing là nguồn tính giá DUY NHẤT cho R7-05.
