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
