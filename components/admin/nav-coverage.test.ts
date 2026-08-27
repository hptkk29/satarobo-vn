/**
 * MÀN NÀO CŨNG PHẢI CÓ LỐI VÀO — không màn nào chỉ mở được bằng cách gõ URL.
 *
 * Vì sao cần test: rà 11/08/2026 tìm ra **8 màn admin có thật, có gate, có người cần
 * dùng** mà chưa bao giờ có nút bấm tới — trong đó có `/roles` (màn cấu hình vai trò,
 * trung tâm của RBAC v2) và `/compliance` (xoá ẩn danh theo NĐ13). Loại lỗi này không ai
 * phát hiện bằng cách dùng thử, vì người dùng không thể biết cái mình chưa từng thấy.
 * Nó cũng không đau ngay: màn vẫn chạy, chỉ là không ai vào được.
 *
 * Quét TĨNH nên màn thêm sau này cũng bị soi. Cách "sửa" khi test đỏ:
 *   · Màn thật, có người dùng  → thêm mục vào sidebar (hoặc nút bấm ở màn cha).
 *   · Màn dev/thử nghiệm/stub  → khai vào ALLOWLIST bên dưới KÈM LÝ DO.
 * Đừng xoá test.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ADMIN_DIR = path.join(ROOT, "app", "(admin)", "admin");

/** Route được phép không có mục menu — mỗi dòng phải nêu lý do. */
const ALLOWLIST: Record<string, string> = {
  "/dashboard-qlcs":
    "27/08/2026 — chủ dự án chốt GỠ mục menu: bốn khối của màn này nay hiện THẲNG trong " +
    "/dashboard cho Quản lý cơ sở + Quản trị hệ thống (không phân tab), nên hai vai cần " +
    "nó thấy nội dung ngay khi đăng nhập, không phải qua menu. Route giữ lại vì đường dẫn " +
    "cũ đã gửi đi và PAGE_GATES vẫn gác nó. Gỡ hẳn route khi không còn liên kết nào trỏ tới.",
  "/charts-test": "màn thử wrapper Recharts, chỉ dev dùng",
  "/design-system-preview": "bảng màu/typography, chỉ dev dùng",
  "/design-system-preview-v2": "bảng màu/typography bản 2, chỉ dev dùng",
  "/r2-test": "màn thử upload R2, chỉ dev dùng",
  "/parent-requests/bao-vang":
    "stub chuyển hướng sang /parent-requests (giữ cho link cũ không vỡ)",
  "/trials":
    "GĐ6 — stub chuyển hướng sang /lop-trial/lich-hen. Màn gộp vào Lớp Trial; route " +
    "giữ lại vì thông báo CŨ trong DB mang href \"/trials\" và không sửa hồi tố được, " +
    "còn tài liệu hướng dẫn sinh tự động cũng trỏ tới đó. Gỡ khi đo được là không còn " +
    "thông báo nào trỏ tới, đừng gỡ theo lịch.",
  "/trial-classes":
    "GĐ6 — stub chuyển hướng sang /lop-trial. Cùng lý do với /trials; bản /trial-classes/[id] " +
    "còn giữ nguyên id khi chuyển để thông báo cũ không rơi về danh sách.",
  "/search": "vào bằng ô tìm kiếm trên topbar (<form action=\"/search\">), không phải mục menu",
  "/thong-bao":
    "CỐ Ý không lên sidebar — ràng buộc cốt lõi của PRD hệ thông báo: chuông ở topbar là điểm " +
    "vào DUY NHẤT, thêm mục menu là phá chính tiền đề đó. Vào từ nút \"Xem tất cả thông báo\" ở " +
    "chân panel chuông. Nếu nghiệm thu cho thấy người dùng không tìm ra trang thì chữa bằng " +
    "onboarding hoặc menu avatar, TUYỆT ĐỐI không bằng cách thêm sidebar.",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Route tĩnh của site admin (bỏ route động — vào từ danh sách cha). */
function adminRoutes(): string[] {
  return walk(ADMIN_DIR)
    .filter((f) => f.endsWith("page.tsx"))
    .map((f) => "/" + path.relative(ADMIN_DIR, path.dirname(f)).split(path.sep).join("/"))
    .map((r) => (r === "/." ? "/" : r))
    .filter((r) => !r.includes("["))
    .sort();
}

/** Mọi đường dẫn xuất hiện trong href / push / replace / redirect / form action. */
function duongDanDuocTroToi(): Set<string> {
  const files = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "components"))].filter(
    (f) => /\.tsx?$/.test(f),
  );
  const out = new Set<string>();
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(
      /(?:href|action|push|replace|redirect)\(?\s*[=:]?\s*[`"']([^`"'$)]*)/g,
    )) {
      const raw = m[1];
      if (!raw.startsWith("/")) continue;
      const sach = raw.split("?")[0].replace(/\/$/, "");
      out.add(sach);
      out.add(sach.replace(/^\/admin/, ""));
    }
  }
  return out;
}

function hrefSidebar(): string[] {
  const src = fs.readFileSync(path.join(ROOT, "components/admin/sidebar.tsx"), "utf8");
  return [...src.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);
}

describe("Sidebar admin — mọi màn đều có lối vào", () => {
  it("không route tĩnh nào chỉ vào được bằng URL", () => {
    const trongSidebar = new Set(hrefSidebar());
    const duocTroToi = duongDanDuocTroToi();
    const moCoi = adminRoutes().filter(
      (r) =>
        !(r in ALLOWLIST) &&
        !trongSidebar.has(r) &&
        !trongSidebar.has(`/admin${r}`) &&
        !duocTroToi.has(r) &&
        !duocTroToi.has(`/admin${r}`),
    );
    expect(
      moCoi,
      `Màn admin không có lối vào (thêm mục sidebar, hoặc khai ALLOWLIST kèm lý do):\n  - ${moCoi.join("\n  - ")}\n`,
    ).toEqual([]);
  });

  it("không mục nào bị lặp hai lần trong sidebar", () => {
    const dem = new Map<string, number>();
    for (const h of hrefSidebar()) dem.set(h, (dem.get(h) ?? 0) + 1);
    const trung = [...dem.entries()].filter(([, n]) => n > 1).map(([h, n]) => `${h} ×${n}`);
    expect(trung, `Mục lặp trong sidebar:\n  - ${trung.join("\n  - ")}\n`).toEqual([]);
  });

  it("ALLOWLIST không có dòng chết (route đã xoá hoặc đã được gắn menu)", () => {
    // Allowlist mà không ai dọn thì lần sau nó che mất lỗi thật.
    const routes = new Set(adminRoutes());
    const trongSidebar = new Set(hrefSidebar());
    const chet = Object.keys(ALLOWLIST).filter(
      (r) => !routes.has(r) || trongSidebar.has(r) || trongSidebar.has(`/admin${r}`),
    );
    expect(chet, `Dòng ALLOWLIST không còn cần thiết:\n  - ${chet.join("\n  - ")}\n`).toEqual([]);
  });

  it("mỗi dòng ALLOWLIST đều có lý do viết ra", () => {
    for (const [route, lyDo] of Object.entries(ALLOWLIST)) {
      expect(lyDo.trim().length, `${route} thiếu lý do`).toBeGreaterThan(10);
    }
  });
});
