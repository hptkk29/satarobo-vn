/**
 * Phạm vi thời gian của màn "Buổi học" — HẰNG SỐ THUẦN, tách riêng có chủ đích.
 *
 * ── Vì sao tệp này tồn tại (04/09/2026) ─────────────────────────────────────
 * Ba hằng dưới đây từng nằm chung `lib/sale/du-lieu-buoi-hoc.ts` với truy vấn
 * Prisma. Thanh lọc (`_components/bo-loc-buoi-hoc.tsx`) là thành phần CHẠY TRÊN
 * TRÌNH DUYỆT và nhập `MOI_PHAM_VI`/`NHAN_PHAM_VI` — hai GIÁ TRỊ thật, không
 * phải kiểu — nên cả module bị gói cho trình duyệt, kéo theo
 * `db-scope` → `audit/log` → `audit/headers` → `next/headers`.
 * Kết quả: **`pnpm build` gãy**, còn `tsc`, `eslint` và toàn bộ bài kiểm đều xanh.
 *
 * Đây là lần thứ ba kho này dính đúng bẫy đó (trước là `teacher-vocab` và
 * `case-status`). Luật rút ra, áp cho mọi module sau: **hằng số và hàm thuần mà
 * phía trình duyệt cần thì phải ở TỆP RIÊNG, không dùng chung tệp với đường chạm
 * cơ sở dữ liệu.** `import type` cứu được kiểu, KHÔNG cứu được giá trị.
 */

/** Ba phạm vi của bộ lọc. Thứ tự này là thứ tự hiện trên màn. */
export const MOI_PHAM_VI = ["upcoming", "past", "all"] as const;
export type PhamVi = (typeof MOI_PHAM_VI)[number];

/** Nhãn hiện trên bộ lọc VÀ trong câu "Đang xem: …" — một nguồn, không gõ hai lần. */
export const NHAN_PHAM_VI: Record<PhamVi, string> = {
  upcoming: "Sắp tới",
  past: "Đã diễn ra",
  all: "Tất cả",
};
