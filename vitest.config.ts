import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
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
      // Hộp thư đa kênh — tầng DB thật. Cùng lý do phải khai ở đây như 4 dòng trên:
      // `include` là bộ lọc CỨNG, nên `vitest run tests/inbox` sẽ báo "No test files
      // found" và job CI vẫn XANH dù test viết đúng — hỏng câm đúng loại nguy hiểm nhất.
      "tests/inbox/**/*.{test,spec}.ts",
      // Trục gọi điện + ghi âm (OmiCall). Cùng lý do phải khai ở đây như 4 dòng
      // trên: `include` là bộ lọc CỨNG, nên `vitest run tests/goi-dien` sẽ báo
      // "No test files found" và job CI vẫn XANH dù test viết đúng.
      "tests/goi-dien/**/*.{test,spec}.ts",
      // Module chấm công v3 (06/09) — test tích hợp import/engine trên Postgres local, tự skip
      // khi không có DB. Cùng lý do phải khai ở đây: `include` là bộ lọc CỨNG.
      "tests/cham-cong/**/*.{test,spec}.ts",
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
