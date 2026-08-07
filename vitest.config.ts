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
