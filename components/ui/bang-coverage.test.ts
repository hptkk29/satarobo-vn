/**
 * MỌI BẢNG DỮ LIỆU ĐỀU PHẢI CÓ PHÂN TRANG — không màn nào đổ hết ra một trang.
 *
 * Vì sao cần test: sweep 11/08 bọc 111 bảng, nhưng rà lại 12/08 vẫn còn 19 bảng lọt —
 * nằm trong `components/**` (sweep chỉ quét `app/**`), hoặc bị bỏ qua vì có ô nhập bên
 * trong. Không có test thì lần thêm bảng mới sau này lại lọt tiếp, và không ai biết cho
 * tới khi người dùng phải cuộn hết bảng để xem thứ nằm dưới nó.
 *
 * Cách "sửa" khi test đỏ:
 *   · Bảng dữ liệu (số dòng có thể vượt 10) → bọc `<PhanTrangBang>`.
 *   · Bảng nội dung / vỏ dùng lại / bảng chốt cứng vài dòng → khai vào MIEN_TRU KÈM LÝ DO.
 * Đừng xoá test.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const GOC = ["app", "components"];

/** File có `<table>` mà CỐ Ý không phân trang — mỗi dòng phải nêu lý do. */
const MIEN_TRU: Record<string, string> = {
  "components/ui/table.tsx":
    "primitive shadcn — mọi nơi GỌI nó đã bọc rồi, bọc thêm ở đây là hai thanh điều khiển chồng nhau",
  "app/(admin)/admin/design-system-preview/client.tsx": "màn xem thử design system, chỉ dev dùng",
  "app/(admin)/admin/huong-dan/_components/guide-markdown.tsx": "bảng trong tài liệu hướng dẫn",
  "app/(portal)/portal/huong-dan/_components/guide-markdown.tsx": "bảng trong tài liệu hướng dẫn",
  "app/(teacher)/teacher/huong-dan/_components/guide-markdown.tsx": "bảng trong tài liệu hướng dẫn",
  "app/(public)/khoa-hoc/page.tsx": "bảng SO SÁNH hai khoá học — nội dung cố định, không phải danh sách",
  "app/(public)/hoc-cu/page.tsx": "bảng so sánh gói học cụ — nội dung cố định",
  "components/legacy-laptrinhrobot/InternalAwards.tsx":
    "bảng giải thưởng trên landing cũ — danh sách chốt cứng trong code, không đọc từ DB",
};

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Bỏ chú thích trước khi soi — `<table>` nằm trong JSDoc không phải một cái bảng. */
function boChuThich(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const TEN_TUONG_DOI = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");

// Quét CÓ NHỚ: cả ba `it` đều gọi `fileCoBang()`, mà mỗi lượt là một lần duyệt đồng bộ
// toàn bộ `app/` + `components/` rồi đọc từng file. Chạy riêng thì ~1s, nhưng trong cả bộ
// (267 file test chạy song song) lượt thứ hai vượt trần 5s và test đỏ vì HẾT GIỜ chứ
// không phải vì có bảng thiếu phân trang — đúng kiểu đỏ giả làm người ta mất niềm tin vào
// test. Cây thư mục không đổi giữa các `it` nên nhớ lại là an toàn tuyệt đối.
let _cache: string[] | null = null;

function fileCoBang(): string[] {
  if (_cache) return _cache;
  _cache = quetFileCoBang();
  return _cache;
}

function quetFileCoBang(): string[] {
  return GOC.flatMap((g) => walk(path.join(ROOT, g)))
    .filter((f) => !f.includes(".test."))
    .filter((f) => {
      const ten = TEN_TUONG_DOI(f);
      // Hai file ĐỊNH NGHĨA cỗ máy phân trang — chúng chứa `<table>` là đương nhiên.
      if (ten.endsWith("components/ui/bang-phan-trang.tsx")) return false;
      if (ten.endsWith("components/ui/phan-trang-bang.tsx")) return false;
      return /<table[\s>]|<Table[\s>]/.test(boChuThich(fs.readFileSync(f, "utf8")));
    })
    .map(TEN_TUONG_DOI);
}

describe("Mọi bảng dữ liệu đều có phân trang", () => {
  it("không file nào có <table> mà thiếu phân trang (trừ danh sách miễn trừ)", () => {
    const thieu = fileCoBang().filter((ten) => {
      if (ten in MIEN_TRU) return false;
      const src = fs.readFileSync(path.join(ROOT, ten), "utf8");
      // Tìm THẺ ĐANG DÙNG, không tìm tên: chỉ còn dòng `import` mà không còn thẻ thì bảng
      // đó KHÔNG hề phân trang — đột biến thử đã lọt đúng vì kiểm hớ chỗ này (12/08/2026).
      return !/<PhanTrangBang|<BangPhanTrang|<DieuHuongTrang/.test(src);
    });
    expect(
      thieu,
      `Bảng chưa phân trang (bọc <PhanTrangBang>, hoặc khai MIEN_TRU kèm lý do):\n  - ${thieu.join("\n  - ")}\n`,
    ).toEqual([]);
  });

  it("MIEN_TRU không có dòng chết (file đã xoá hoặc nay đã phân trang)", () => {
    // Danh sách miễn trừ không ai dọn thì lần sau nó che mất lỗi thật.
    const co = new Set(fileCoBang());
    const chet = Object.keys(MIEN_TRU).filter((ten) => {
      if (!co.has(ten)) return true;
      const src = fs.readFileSync(path.join(ROOT, ten), "utf8");
      return /<PhanTrangBang|<BangPhanTrang/.test(src);
    });
    expect(chet, `Dòng MIEN_TRU không còn cần thiết:\n  - ${chet.join("\n  - ")}\n`).toEqual([]);
  });

  it("mỗi dòng miễn trừ đều có lý do viết ra", () => {
    for (const [ten, lyDo] of Object.entries(MIEN_TRU)) {
      expect(lyDo.trim().length, `${ten} thiếu lý do`).toBeGreaterThan(15);
    }
  });
});
