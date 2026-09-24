// Ca [NZ-*] — LƯỚI GHIM MÃ NGUỒN cho bảng giao nick Zalo.
//
// 🔴 LỖI SINH RA FILE NÀY, chụp được trên prod 24/09: ô chọn hiện chuỗi `__chua-giao__`
// cho người dùng đọc. Đó là mã nội bộ của chính tôi rò ra giao diện.
//
// Nguyên nhân: `<SelectValue placeholder="…" />` KHÔNG CÓ CON sẽ render GIÁ TRỊ khi nó
// không khớp nhãn của một `SelectItem` nào — và `CHUA_GIAO` thì không khớp, vì nhãn của
// mục ấy là "Chưa giao — cả cơ sở đều thấy".
//
// ⚠️ Cách sửa KHÔNG phải đổi chuỗi sentinel cho dễ nhìn: chuỗi nào cũng sai, vì nó là mã
// nội bộ. Phải cho `SelectValue` một CON, để nhãn luôn do mình quyết.
//
// Là lưới GHIM MÃ NGUỒN chứ không phải test hành vi vì thứ cần khẳng định là "tệp này
// không để đường rơi về giá trị thô" — không đầu vào nào chứng minh được điều đó.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const TEP = "app/(admin)/admin/cau-hinh-van-hanh/_components/tab-nick-zalo-bang.tsx";

/** Bóc chú thích — lưới phải soi MÃ, không soi lời kể về mã (luật 11). Chính khối chú
 *  thích đầu tệp ấy có nhắc `__chua-giao__` để giải thích, nên không bóc là đỏ vì lời kể. */
function docMa(): string {
  return readFileSync(resolve(process.cwd(), TEP), "utf8")
    .split(/\r?\n/)
    .map((d) => d.replace(/\/\/[^\n]*$/, ""))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

describe("[NZ-01] mã nội bộ KHÔNG rò ra ô chọn", () => {
  const src = docMa();

  it("`SelectValue` có CON — không để rơi về giá trị thô", () => {
    // Dạng tự đóng `<SelectValue ... />` là đúng dạng đã sinh ra lỗi.
    const tuDong = [...src.matchAll(/<SelectValue\b[^>]*\/>/g)].map((m) => m[0]);
    expect(tuDong, `SelectValue tự đóng sẽ hiện giá trị thô: ${tuDong.join(", ")}`).toEqual([]);
    expect(src).toMatch(/<SelectValue>\{[^}]+\}<\/SelectValue>/);
  });

  it("có biến nhãn riêng cho mục đang chọn", () => {
    expect(src).toMatch(/nhanDangChon/);
  });

  it("nhãn của mục 'chưa giao' là tiếng Việt, không phải mã", () => {
    expect(src).toMatch(/<SelectItem value=\{CHUA_GIAO\}>Chưa giao/);
  });
});

describe("[NZ-02] mật độ và token theo DESIGN.md", () => {
  const src = docMa();

  it("dùng `adminTh`/`adminTd`/`adminTr`, không tự chế lớp bảng", () => {
    for (const k of ["adminTh", "adminTd", "adminTr"]) expect(src).toContain(k);
  });

  it("KHÔNG hex rời — mọi màu đi qua token", () => {
    // Luật §1 của DESIGN.md. Vi phạm dễ thấy nhất: `bg-[#...]`, `text-[#...]`.
    const hex = [...src.matchAll(/(?:bg|text|border)-\[#[0-9a-fA-F]{3,8}\]/g)].map((m) => m[0]);
    expect(hex, `hex rời: ${hex.join(", ")}`).toEqual([]);
  });

  it("trạng thái đi qua `StatusPill` (thang ngữ nghĩa), không tự tô màu", () => {
    // ⚠️ Neo vào LỜI GỌI TRONG JSX, không vào cái TÊN. Bản đầu của ca này dùng
    // `toContain("StatusPill")` và ĐÃ CHẾT — đo được bằng phép cấy 24/09: thay hẳn
    // `<StatusPill …>` bằng `<span>{r.status}</span>` mà 13/13 ca vẫn XANH, vì chuỗi
    // "StatusPill" còn nằm ở dòng `import` và tên hằng nhãn thì vẫn được khai.
    // Cùng lớp với S-1 trong luật 14 — lần thứ ba nó cắn trong repo này.
    expect(src, "StatusPill phải được DÙNG trong JSX, không chỉ được import").toMatch(
      /<StatusPill\b[^>]*>/,
    );
    expect(src).toMatch(/tone=\{tt\.tone\}/);

    // Và không đường nào in thẳng mã trạng thái ra màn.
    const tho = [...src.matchAll(/\{\s*r\.status\s*\}/g)].map((m) => m[0]);
    expect(tho, `mã trạng thái in thô: ${tho.join(", ")}`).toEqual([]);
  });

  it("KHÔNG in trạng thái thô ra màn — mọi mã đều có nhãn tiếng Việt", () => {
    // `UNKNOWN` từng hiện nguyên xi trên prod.
    for (const ma of ["CONNECTED", "DISCONNECTED", "UNKNOWN"]) {
      expect(src, `thiếu nhãn cho ${ma}`).toMatch(new RegExp(`${ma}:\\s*\\{ chu:`));
    }
  });
});

describe("[NZ-03] ô chọn có nhãn cho trình đọc màn hình", () => {
  it("`SelectTrigger` mang `aria-label`", () => {
    // Ô chọn không có nhãn nhìn thấy được — tên cột "Giao cho" nằm ở `th`, mà trình đọc
    // màn hình không tự nối nó vào từng ô.
    expect(docMa()).toMatch(/<SelectTrigger aria-label=/);
  });
});
