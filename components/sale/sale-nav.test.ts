// Test khoá thanh điều hướng site Sale — quét NGUỒN, không render.
//
// Vì sao cần: hai lớp lỗi mà `lib/auth/page-gates.ts` sinh ra để diệt đều bắt đầu
// từ việc menu và cổng trang mỗi bên tự khai một danh sách action. Site Sale là
// site thứ tư dựng nav; ba site trước đều đã dính ít nhất một lần.
//
// Test này rẻ và bắt đúng lớp lỗi đó ở dạng sớm nhất: nav gõ action bằng tay.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PAGE_GATES } from "@/lib/auth/page-gates";

const ROOT = process.cwd();
const NAV = path.join(ROOT, "components/sale/sale-nav.tsx");
const LAYOUT = path.join(ROOT, "app/(sale)/sale/layout.tsx");

const doc = (p: string) => fs.readFileSync(p, "utf8");
const boChuThich = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("[site Sale] thanh điều hướng ≡ cổng trang", () => {
  it("mọi mục có quyền đều lấy `perm` TỪ PAGE_GATES, không gõ action rời", () => {
    const src = boChuThich(doc(NAV));
    // Bắt dạng `perm: ["leads:create"]` — gõ tay. Dạng đúng là
    // `perm: PAGE_GATES["/sale/..."]`.
    const goTay = [...src.matchAll(/perm:\s*\[/g)];
    expect(
      goTay.length,
      'nav còn mục khai `perm: [...]` bằng tay — phải dùng PAGE_GATES["/sale/..."]',
    ).toBe(0);
    expect(src).toContain('PAGE_GATES["/sale/trial"]');
    expect(src).toContain('PAGE_GATES["/sale/nhap-khach-hang"]');
  });

  it("mọi href trong nav đều có trang thật", () => {
    const src = boChuThich(doc(NAV));
    const hrefs = [...src.matchAll(/href:\s*"(\/sale[^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.length, "nav rỗng — chắc chắn là hỏng").toBeGreaterThan(0);
    for (const h of hrefs) {
      // "/sale" → app/(sale)/sale/page.tsx ; "/sale/trial" → .../trial/page.tsx
      const f = path.join(ROOT, "app/(sale)", h, "page.tsx");
      expect(fs.existsSync(f), `nav trỏ tới ${h} nhưng không có ${f}`).toBe(true);
    }
  });

  it("mọi route /sale/* trong PAGE_GATES đều có mặt trên nav (không có màn mồ côi)", () => {
    // Màn dựng xong mà không có lối vào thì với người dùng nó không tồn tại —
    // đúng tình trạng của /sale/trial suốt từ 22/08 tới 23/08.
    const src = boChuThich(doc(NAV));
    const thieu = Object.keys(PAGE_GATES)
      .filter((h) => h.startsWith("/sale/"))
      .filter((h) => !src.includes(`href: "${h}"`));
    expect(thieu, `Route có gate nhưng không có lối vào trên nav:\n  - ${thieu.join("\n  - ")}\n`).toEqual([]);
  });

  it("có nút đăng xuất", () => {
    // Site GV và admin đều có; thiếu nó thì người dùng kẹt trong site, phải xoá
    // cookie bằng tay. `/dang-xuat` là trang công khai có chủ đích.
    expect(boChuThich(doc(NAV))).toContain('href="/dang-xuat"');
  });

  it("layout tính quyền bằng grantedMenuActions, KHÔNG tự gọi can()", () => {
    // Menu phải hỏi đúng hàm quyết định mà cổng trang dùng. Tự gọi can() ở
    // component là cách chắc chắn để menu và cổng nói hai câu chuyện khác nhau
    // khi cờ RBAC đổi — bài học 10/07 của site admin.
    const src = boChuThich(doc(LAYOUT));
    expect(src).toContain("grantedMenuActions");
  });
});
