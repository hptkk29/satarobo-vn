// @vitest-environment node
// LƯỚI GHIM MÃ NGUỒN (khuôn CLAUDE.md "Mẫu test: LƯỚI GHIM MÃ NGUỒN").
//
// Luật: user DỊCH VỤ của agent (`User.isServiceAccount = true`) KHÔNG BAO GIỜ đăng nhập được
// bằng giao diện. Chỗ chặn nằm trong `authorize()` của Auth.js (`lib/auth.ts`) — hàm đó sống
// trong cấu hình NextAuth, không gọi riêng được từ test, nên khoá bằng cách đọc chính mã.
//
// Mã TRƯỚC bản vá: `authorize` không `select` cột `isServiceAccount` và không có dòng chặn —
// user dịch vụ mà ai đó lỡ gán mật khẩu + SĐT qua màn nhân sự là đăng nhập được, mang theo
// quyền của agent.
//
// Neo vào BIỂU THỨC ĐIỀU KIỆN + số lần khớp, trên mã ĐÃ BỎ CHÚ THÍCH (chú thích giải thích bản
// vá có thể chứa đúng chuỗi đang tìm — bẫy đã gặp ở `affordance-coverage`).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function boChuThich(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const MA = boChuThich(readFileSync(resolve(process.cwd(), "lib/auth.ts"), "utf8"));

describe("[AG-DN-01] user dịch vụ bị chặn đăng nhập", () => {
  it("authorize select cột isServiceAccount", () => {
    expect(MA.match(/isServiceAccount:\s*true/g)?.length).toBe(1);
  });
  it("có ĐÚNG MỘT dòng từ chối theo isServiceAccount, trả null", () => {
    expect(MA.match(/if\s*\(\s*user\.isServiceAccount\s*\)\s*return\s+null\s*;/g)?.length).toBe(1);
  });
  it("dòng chặn nằm TRƯỚC phép so mật khẩu (không để bcrypt chạy cho user dịch vụ)", () => {
    const chan = MA.search(/if\s*\(\s*user\.isServiceAccount\s*\)/);
    const soMk = MA.search(/bcrypt\.compare\(/);
    expect(chan).toBeGreaterThan(0);
    expect(soMk).toBeGreaterThan(chan);
  });
});
