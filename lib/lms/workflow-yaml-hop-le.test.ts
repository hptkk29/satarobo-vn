// Ca [WFY-*] — MỌI workflow phải PARSE ĐƯỢC. Thuần, không DB.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 SỰ CỐ SINH RA LƯỚI NÀY — 26/09/2026, chính tôi gây ra và tự bắt được muộn.
//
// Tôi dựng `hoc-phan-dry-run-prod-chi-doc.yml` bằng `sed` từ một workflow đã chạy tốt,
// đổi tên job thành:
//
//     name: Dry-run: seed sẽ đổi gì (không ghi)
//              ▲
//              dấu hai chấm trong chuỗi KHÔNG đóng ngoặc ⇒ YAML HỎNG
//
// Hậu quả, và nó **không giống một lỗi**:
//   · GitHub vẫn nhận tệp, vẫn hiện trong `gh workflow list` là `active`;
//   · nhưng nó hiện TÊN LÀ ĐƯỜNG DẪN TỆP (không đọc nổi `name:`);
//   · `gh workflow run` trả `HTTP 422: Workflow does not have 'workflow_dispatch' trigger`
//     — một câu lỗi nói về TRIGGER, trong khi bệnh là cú pháp;
//   · và GitHub tự tạo một lượt chạy `failure` **không có log** (`log not found`).
//
// ⚠️ ĐIỀU ĐÁNG SỢ NHẤT: lưới `[DRH-03]` **vẫn XANH** suốt. Nó soi `on:`, `if:`, tham chiếu
// secret bằng REGEX TRÊN VĂN BẢN — mà văn bản thì vẫn chứa đủ các chuỗi ấy. Một lưới đọc
// mã bằng regex có thể ban phước cho một tệp mà GitHub từ chối chạy.
//
// ⇒ Bài học, ghi cho người sau: **regex trên văn bản KHÔNG thay được một phép PARSE.**
// Cùng họ luật 11 (CLAUDE.md), nhưng ở chiều ngược lại: không chỉ "lưới grep mong manh",
// mà "lưới grep có thể XANH trên một tệp đã chết".
//
// Repo KHÔNG có `yaml`/`js-yaml` (đã đo), và thêm thư viện chỉ để chạy một lưới là đổi một
// vấn đề nhỏ lấy một phụ thuộc mới. Nên lưới này kiểm ĐÚNG lớp lỗi đã cắn: một chuỗi vô
// hướng KHÔNG đóng ngoặc mà lại chứa `": "`.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const THU_MUC = ".github/workflows";

/**
 * Dòng khai `khoa: giá trị` mà GIÁ TRỊ chứa `": "` và không đóng ngoặc.
 *
 * YAML đọc `a: b: c` là lỗi cú pháp. Đóng ngoặc (`"b: c"`) hoặc dùng khối (`|`, `>`) thì hợp lệ.
 */
function dongHong(src: string): string[] {
  const ra: string[] = [];
  src.split(/\r?\n/).forEach((d, i) => {
    if (/^\s*#/.test(d)) return; // chú thích
    const m = /^(\s*)(-\s+)?([A-Za-z_][\w.-]*):\s+(.+)$/.exec(d);
    if (!m) return;
    const giaTri = m[4]!.trim();
    // Bỏ qua khi giá trị là:
    //   · chuỗi đã đóng ngoặc  `"a: b"` / `'a: b'`
    //   · khối                 `|` / `>`
    //   · FLOW MAPPING/SEQUENCE `{ version: 11 }` / `[a, b]` — YAML hợp lệ, và đây chính là
    //     thứ bản đầu của bộ so khớp báo oan: `with: { version: 11 }` xuất hiện ở 8 chỗ
    //     trong `ci.yml` nên lưới đỏ gần như MỌI workflow ngay lượt chạy đầu tiên.
    if (/^["'|>{[]/.test(giaTri)) return;
    // `${{ ... }}` của GitHub Actions không phải chuỗi YAML có hai chấm gây lỗi.
    const sachBieuThuc = giaTri.replace(/\$\{\{[^}]*\}\}/g, "");
    // Bỏ phần chú thích cuối dòng (` # ...`) trước khi soi.
    const sach = sachBieuThuc.replace(/\s+#.*$/, "");
    if (/:\s/.test(sach)) ra.push(`dòng ${i + 1}: ${d.trim()}`);
  });
  return ra;
}

const TEP = readdirSync(resolve(process.cwd(), THU_MUC)).filter((f) => f.endsWith(".yml"));

describe("[WFY-01] không workflow nào có chuỗi chứa `: ` mà quên đóng ngoặc", () => {
  it("có ít nhất một workflow để soi — lưới rỗng là lưới vô dụng", () => {
    // ⚠️ Đối chứng cho chính lưới: nếu `readdirSync` trả rỗng (sai `cwd`, đổi thư mục),
    // `it.each` bên dưới sẽ KHÔNG chạy ca nào và cả bộ vẫn xanh. Đúng lớp lỗi luật 14.
    expect(TEP.length).toBeGreaterThan(20);
  });

  it.each(TEP)("%s", (ten) => {
    const src = readFileSync(resolve(process.cwd(), THU_MUC, ten), "utf8");
    expect(dongHong(src), `${ten} có dòng YAML sẽ không parse được`).toEqual([]);
  });
});

describe("[WFY-02] chính bộ so khớp phải bắt được ca đã cắn", () => {
  // ⚠️ Không có describe này thì `dongHong` viết sai kiểu gì cũng "xanh" ở trên, vì mọi
  // tệp thật đều hợp lệ. Đây là phép CẤY sẵn trong lưới.
  it("bắt đúng dòng đã làm hỏng workflow 26/09", () => {
    expect(dongHong("    name: Dry-run: seed sẽ đổi gì (không ghi)")).toHaveLength(1);
  });

  it("KHÔNG kêu oan cho dòng đã đóng ngoặc", () => {
    expect(dongHong('    name: "Dry-run: seed sẽ đổi gì"')).toEqual([]);
    expect(dongHong("    name: 'A: B'")).toEqual([]);
  });

  it("KHÔNG kêu oan cho biểu thức `${{ }}` và chú thích cuối dòng", () => {
    expect(dongHong("          DATABASE_URL: ${{ secrets.PROD_DATABASE_URL_RO }}")).toEqual([]);
    expect(dongHong("    runs-on: ubuntu-latest # chạy trên: runner chung")).toEqual([]);
  });

  it("KHÔNG kêu oan cho dòng bình thường", () => {
    expect(dongHong("    timeout-minutes: 15")).toEqual([]);
    expect(dongHong("    if: github.ref == 'refs/heads/main'")).toEqual([]);
    expect(dongHong("        run: pnpm exec tsx scripts/dry-run-hoc-phan.ts")).toEqual([]);
  });
});
