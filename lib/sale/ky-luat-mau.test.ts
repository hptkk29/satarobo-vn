// @vitest-environment node
/**
 * KỶ LUẬT MÀU của site Sale — bài kiểm chống tái phạm, không phải bài kiểm chức năng.
 *
 * Vì sao cần: `DESIGN.md §1` đã cấm hex/màu rời trong component từ 11/08, nhưng
 * đến 28/08 site Sale vẫn có 11 chỗ gõ tay `text-amber-600`, `bg-amber-100`,
 * `text-emerald-700`… Luật nằm trong tài liệu thì người viết màn mới không đọc;
 * luật nằm trong bài kiểm thì CI đọc hộ.
 *
 * Ba thứ bài này giữ, và mỗi thứ đều là một lỗi ĐÃ XẢY RA chứ không phải giả định:
 *   1. Màu trạng thái phải đi qua token — không class màu rời của Tailwind.
 *   2. Không màn nào tự dựng nhãn trạng thái bằng `<Badge>` — mười trạng thái ra
 *      một màu, và màu hết mang tin.
 *   3. Một thước tiêu đề cho cả site — `text-2xl font-bold` lẫn `text-xl` cùng
 *      tồn tại làm các màn trông như của hai sản phẩm khác nhau.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const GOC = [join(process.cwd(), "app", "(sale)"), join(process.cwd(), "components", "sale")];

function moiTepTsx(thuMuc: string): string[] {
  const ra: string[] = [];
  for (const ten of readdirSync(thuMuc)) {
    const duong = join(thuMuc, ten);
    if (statSync(duong).isDirectory()) ra.push(...moiTepTsx(duong));
    else if (ten.endsWith(".tsx")) ra.push(duong);
  }
  return ra;
}

/** Bỏ chú thích để câu văn giải thích lỗi cũ không bị tính là tái phạm. */
function boChuThich(nguon: string): string {
  return nguon.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const TEP = GOC.flatMap(moiTepTsx);

describe("[S-UI-3] site Sale không gõ màu bằng tay", () => {
  it("có tệp để soi (nếu 0 thì bài kiểm này đang tự lừa mình)", () => {
    expect(TEP.length).toBeGreaterThan(10);
  });

  it("🔴 không class màu rời của Tailwind cho trạng thái", () => {
    // Thang ngữ nghĩa nằm ở token `--state-*` (khai ở `:root`, app/globals.css).
    // Gõ `text-amber-600` là dựng thang thứ hai, và hai thang sẽ trôi lệch.
    const xau = /\b(?:text|bg|border)-(?:amber|emerald|sky|rose|lime|teal|fuchsia)-[0-9]{2,3}\b/;
    const pham = TEP.filter((t) => xau.test(boChuThich(readFileSync(t, "utf8"))));
    expect(pham, `Dùng token --state-* thay vì class màu rời:\n${pham.join("\n")}`).toEqual([]);
  });

  it("🔴 bảng dữ liệu không tự dựng nhãn trạng thái bằng <Badge>", () => {
    // `<Badge variant="outline">` cho MỌI trạng thái là lỗi đã sống trong bảng
    // "Khách của tôi": mười giai đoạn ra một màu tím nhạt.
    const bang = TEP.filter((t) => /lead-table|bang/i.test(t));
    const pham = bang.filter((t) => /<Badge\b/.test(boChuThich(readFileSync(t, "utf8"))));
    expect(pham, `Dùng <StatusPill tone={toneTrangThaiKhach(...)}>:\n${pham.join("\n")}`).toEqual(
      [],
    );
  });

  it("một thước tiêu đề cho cả site", () => {
    const pham = TEP.filter((t) => /text-2xl\s+font-bold/.test(boChuThich(readFileSync(t, "utf8"))));
    expect(
      pham,
      `Tiêu đề màn dùng "text-xl font-semibold tracking-tight":\n${pham.join("\n")}`,
    ).toEqual([]);
  });
});

describe("[S-UI-4] mật độ bảng nằm ở CSS, không rải vào từng màn", () => {
  const css = readFileSync(
    join(process.cwd(), "app", "(sale)", "sale", "sale.css"),
    "utf8",
  );

  it("`.bang-sale` ép nowrap trên CẢ th VÀ td", () => {
    // Đây là thứ duy nhất chặn chiều cao dòng nhảy loạn khi một nhãn xuống hai
    // dòng — lỗi đã đo được ở admin: 65–71px và không đều nhau.
    const th = /\.bang-sale thead th\s*\{[^}]*white-space:\s*nowrap/s.test(css);
    const td = /\.bang-sale tbody td\s*\{[^}]*white-space:\s*nowrap/s.test(css);
    expect(th, "thiếu nowrap trên th").toBe(true);
    expect(td, "thiếu nowrap trên td").toBe(true);
  });

  it("có tầng nền thứ hai cho khung máy", () => {
    expect(css).toContain("--surface-chrome");
    expect(css).toContain("--surface-chim");
  });

  it("bóng đổ có OFFSET, không phải quầng sáng bao quanh", () => {
    // `0 0 …` là quầng, và quầng làm mọi thẻ trông như đang được chọn.
    const bong = css.match(/--bong-the:\s*([^;]+);/)?.[1] ?? "";
    expect(bong).not.toMatch(/(^|,)\s*0\s+0\s/);
    expect(bong).toMatch(/\d+px\s+-?\d+px/);
  });
});
