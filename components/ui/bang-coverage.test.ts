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
  "app/(admin)/admin/leads/so-luot/page.tsx":
    "một bảng = MỘT cơ sở, số dòng = số tư vấn viên từng nhận lead ở cơ sở đó (thực tế 2). Phân trang một bảng 2 dòng là thêm thanh điều khiển vô nghĩa, mà đây lại đúng là bảng cần nhìn HẾT một lượt để tin là công bằng",
  "app/(admin)/admin/cham-cong/danh-muc-ca/_components/template-editor.tsx":
    "bảng ĐOẠN CA bên trong form sửa một mã (tối đa 6 dòng, là ô nhập chứ không phải danh sách) — phân trang một form là vô nghĩa",
  "app/(admin)/admin/cham-cong/phan-ca/import/_components/result-diff-table.tsx":
    "bảng đối chiếu 15–21 MÃ CA (Sheet vs hệ thống) sau khi áp — số dòng chặn bởi danh mục mã ca, và đây là bằng chứng \"khớp hay lệch\" phải đọc trọn vẹn một lần; phân trang một bảng đối chiếu là giấu mất dòng lệch",
  "app/(admin)/admin/cham-cong/phan-ca/import/_components/mapping-table.tsx":
    "bảng ánh xạ tên = số người trên Sheet (19–20 dòng, nhóm theo khối CS1/CS2/HO) — phải nhìn HẾT một lượt để xác nhận từng người và thấy ai CHƯA ánh xạ; cắt trang là giấu mất đúng thứ người dùng đang phải soát trước khi bấm Áp",
  "components/legacy-laptrinhrobot/InternalAwards.tsx":
    "bảng giải thưởng trên landing cũ — danh sách chốt cứng trong code, không đọc từ DB",
  "app/(sale)/sale/trial/_components/trial-list.tsx":
    "một bảng = MỘT khung giờ, số dòng chặn bởi sức chứa lớp trải nghiệm (6–8 bé). Phân trang trong một buổi 6 bé là thêm thanh điều khiển vô nghĩa; lượng dữ liệu cả trang đã chặn bằng cửa sổ 21 ngày + take:200 ở lib/trial/sale-roster.ts",
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

// ─────────────────────────────────────────────────────────────────────────────────────
// Ba luật về VỎ của bảng — thêm 06/09/2026 sau khi chủ dự án báo "một số bảng bị mất một
// góc bên phải".
//
// Triệu chứng đó không đến từ cái bảng mà từ CÁI VỎ mỗi chỗ gọi tự dựng, và có đúng hai
// tổ hợp sinh ra nó:
//
//   1. Vùng cuộn TRÙNG với thẻ bo góc (`overflow-x-auto` cùng phần tử với `rounded-*`).
//      Viền vẽ theo border-box và không cuộn, còn nội dung bị cắt theo padding-box đã bo,
//      nên kéo ngang là dải nền `<thead>` bị vạt chéo ở góc. Đúng khuôn phải đẩy việc cuộn
//      xuống div con — `PhanTrangBang cuonNgang` làm sẵn việc đó.
//   2. `<table>` có `min-w-[Npx]` mà THIẾU `w-full`. Bảng co theo nội dung, nên khi thẻ
//      rộng hơn N thì bảng dừng ở N và chừa một dải nền trống bên phải: dải header và
//      đường kẻ hàng không chạm viền — nhìn đúng như mất một góc.
//
// Hai lỗi này im lặng tuyệt đối: không cảnh báo, không lỗi thời gian chạy, chỉ xấu. Vá
// từng chỗ thì lần thêm bảng thứ mười một lại tái phát, nên khoá bằng luật tĩnh.
describe("Vỏ bảng — không sinh ra 'mất góc bên phải'", () => {
  /** Dòng chứa `<PhanTrangBang`, kèm 3 dòng ngay trước để soi thẻ bọc. */
  function khoiPhanTrang(src: string): { truoc: string; dong: string; sau: string }[] {
    const dong = src.split("\n");
    const ra: { truoc: string; dong: string; sau: string }[] = [];
    for (let i = 0; i < dong.length; i++) {
      if (!/<PhanTrangBang[\s>]/.test(dong[i])) continue;
      ra.push({
        truoc: dong.slice(Math.max(0, i - 3), i).join("\n"),
        dong: dong[i],
        sau: dong.slice(i, Math.min(dong.length, i + 6)).join("\n"),
      });
    }
    return ra;
  }

  it("vùng cuộn không được trùng với thẻ bo góc", () => {
    const xau: string[] = [];
    for (const ten of fileCoBang()) {
      const src = boChuThich(fs.readFileSync(path.join(ROOT, ten), "utf8"));
      for (const k of khoiPhanTrang(src)) {
        // Bắt cả `overflow-auto`, không riêng `overflow-x-auto`: đổi sang tên khác mà vẫn đặt
        // vùng cuộn lên thẻ bo góc thì bệnh y nguyên, chỉ là test thôi nhìn thấy.
        //
        // NGOẠI LỆ CÓ NGUYÊN TẮC: thẻ đặt `max-h-*` là một HỘP CUỘN DỌC (xem trước file nhập,
        // danh sách chấm bài…), thường kèm `<thead sticky top-0>`. Ở đó vùng cuộn BẮT BUỘC nằm
        // trên chính thẻ giới hạn chiều cao — đẩy xuống div con là mất hàng tiêu đề dính. Bệnh
        // "mất góc phải" chỉ nói về bảng RỘNG cuộn ngang trong thẻ bo góc không giới hạn cao.
        const thePhamLoi = k.truoc
          .split("\n")
          .find(
            (d) => /overflow-(?:x-)?auto/.test(d) && /rounded-/.test(d) && !/max-h-/.test(d),
          );
        if (thePhamLoi) xau.push(`${ten} — ${thePhamLoi.trim()}`);
      }
    }
    expect(
      xau,
      "Thẻ bọc bảng vừa `overflow-x-auto` vừa `rounded-*` ⇒ nội dung bị vạt góc khi kéo ngang.\n" +
        "Đổi thẻ sang `overflow-hidden` và cho `PhanTrangBang` prop `cuonNgang`:\n  - " +
        xau.join("\n  - ") +
        "\n",
    ).toEqual([]);
  });

  it("bảng cuộn ngang phải có w-full bên cạnh min-w", () => {
    const xau: string[] = [];
    for (const ten of fileCoBang()) {
      const src = boChuThich(fs.readFileSync(path.join(ROOT, ten), "utf8"));
      for (const k of khoiPhanTrang(src)) {
        if (!/cuonNgang/.test(k.dong)) continue;
        const the = k.sau.match(/<table className="([^"]*)"/);
        if (!the) continue;
        const cls = the[1];
        if (/min-w-\[/.test(cls) && !/\bw-full\b/.test(cls)) xau.push(`${ten} — <table className="${cls}">`);
      }
    }
    expect(
      xau,
      "Bảng có `min-w-[…]` mà thiếu `w-full` ⇒ chừa dải trống bên phải khi thẻ rộng hơn:\n  - " +
        xau.join("\n  - ") +
        "\n",
    ).toEqual([]);
  });
});
