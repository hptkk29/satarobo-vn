import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    // ⚠️ ĐỒNG HỒ CỦA BỘ TEST = UTC, GIỐNG PROD (13/09/2026).
    //
    // Vercel chạy UTC; máy dev ở Asia/Saigon (+07). Mọi chỗ test dùng `getDay()`/
    // `getDate()`/`new Date(y, m, d)` (giờ MÁY) vì thế hành xử khác nhau ở hai nơi —
    // đúng loại bug "chạy máy tôi thì được". Ép UTC ở đây làm máy dev khắt khe BẰNG
    // prod, nên lệch lộ ra ngay tại local thay vì đợi CI hay đợi người dùng.
    //
    // Đã ĐO trước khi bật, nên biết nó miễn phí: `TZ=UTC pnpm test:unit` → 5970/5970
    // xanh; `tests/cham-cong` trên Postgres local → 65/65 xanh. Không ca nào đang dựa
    // vào máy dev ở +07.
    //
    // ⚠️ KHÔNG phải là "đặt TZ toàn cục" mà ghi chép dự án cấm: lệnh cấm đó nhắm việc
    // đặt `TZ` cho TIẾN TRÌNH ỨNG DỤNG (làm vỡ cách Prisma đọc cột `@db.Date`). Đây chỉ
    // là tiến trình chạy test, và đặt về ĐÚNG thứ prod dùng — ngược chiều với cái bị cấm.
    env: { TZ: "UTC" },
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    // `app/**` — nhiều component client nằm trong route group (`_components/`) chứ không
    // ở `components/`; không gom vào đây thì chúng không test được (07/08).
    include: [
      "lib/**/*.test.{ts,tsx}",
      "components/**/*.test.{ts,tsx}",
      "app/**/*.test.{ts,tsx}",
      // US-05 — bộ ma trận quyền chat (tầng động, tự skip khi không có DB local).
      "tests/chat/**/*.{test,spec}.ts",
      // P2 — TS-08/TS-10 nền hệ thống. Không khai ở đây thì `vitest run tests/nen` báo
      // "No test files found" và job CI đỏ dù test viết đúng: `include` là bộ lọc CỨNG,
      // đường dẫn truyền ở dòng lệnh chỉ lọc TIẾP trong tập này chứ không mở rộng nó.
      "tests/nen/**/*.{test,spec}.ts",
      // Nhận lead từ nguồn ngoài (form Sale / quatang) — tầng DB thật, tự skip
      // khi không có Postgres local. Cùng lý do phải khai ở đây như 2 dòng trên.
      "tests/lead-intake/**/*.{test,spec}.ts",
      // EL-07 — đào tạo nội bộ. Cùng lý do phải khai ở đây như 3 dòng trên: `include`
      // là bộ lọc CỨNG, nên `vitest run tests/elearning` sẽ báo "No test files found"
      // và job CI vẫn XANH dù test viết đúng — hỏng câm đúng loại nguy hiểm nhất.
      "tests/elearning/**/*.{test,spec}.ts",
      // Module chấm công v3 (06/09) — test tích hợp import/engine trên Postgres local, tự skip
      // khi không có DB. Cùng lý do phải khai ở đây: `include` là bộ lọc CỨNG.
      "tests/cham-cong/**/*.{test,spec}.ts",
      // Seed UAT — bộ rải buổi học theo thứ (prisma/seed-uat/lich.ts). Cùng lý do
      // phải khai ở đây như các dòng trên: `include` là bộ lọc CỨNG, không khai thì
      // `vitest run prisma/seed-uat` báo "No test files found" và CI vẫn XANH dù
      // test viết đúng — hỏng câm đúng loại nguy hiểm nhất.
      "prisma/seed-uat/**/*.{test,spec}.ts",
      // Bước 6 — bút toán điều chỉnh khoản thu, tầng DB thật (tự skip khi vắng Postgres
      // local / vắng ALLOW_DB_RESET). Cùng lý do phải khai ở đây như các dòng trên:
      // `include` là bộ lọc CỨNG, không khai thì `vitest run tests/finance` báo
      // "No test files found" và CI vẫn XANH dù test viết đúng.
      "tests/finance/**/*.{test,spec}.ts",
      // Hook an toàn (luật 14): lưới phải có test của chính nó. `include` là bộ lọc
      // CỨNG — không khai ở đây thì `vitest` báo "No test files found" và CI vẫn XANH
      // dù test viết đúng; đúng loại hỏng câm đã giết hai hook suốt nhiều tháng.
      ".claude/hooks/**/*.test.ts",
      // Cổng `db-gate.ts` — thứ đứng TRƯỚC `resetDb()` (TRUNCATE mọi bảng). Nó KHÔNG có
      // test nào của chính nó cho tới 09/09/2026 (luật 14). Cùng lý do phải khai ở đây
      // như mọi dòng trên: `include` là bộ lọc CỨNG — và lần này bẫy đó tái diễn ngay
      // trước mắt: `vitest run tests/_helpers/db-gate.test.ts` báo "No test files found".
      "tests/_helpers/**/*.test.ts",
    ],
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: [
        "**/node_modules/**",
        "**/.next/**",
        "**/tests/e2e/**",
        "**/*.config.{ts,js,mjs}",
        "**/*.d.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
    },
  },
});
