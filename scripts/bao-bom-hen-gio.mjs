// Đọc kết quả JSON của lưới "bom hẹn giờ" rồi mở / cập nhật issue trên GitHub.
//
// ══ Hai điều kiện chủ dự án đặt ra, và chúng quyết định toàn bộ thiết kế file này ══
//
// 1. **Issue phải nói được BOM NÀO** — tên file, tên ca, và NGÀY CỨNG trong ca. Một issue chỉ
//    ghi "job đỏ" thì người đọc vẫn phải điều tra lại từ đầu, và lưới mất phần lớn giá trị.
//    ⇒ Script trích ngày cứng bằng cách đọc CHÍNH file test của ca đỏ (`utc(2026, 9, 11)`,
//      `new Date("2026-11-01")`), chứ không đoán từ tên ca.
//
// 2. **Không mở issue thứ hai cho cùng một ca** — tuần nào cũng một issue mới là cách nhanh
//    nhất để người ta thôi đọc nhãn `bom-hen-gio`.
//    ⇒ Khoá trùng là `<file> > <tên ca>`, nhúng vào tiêu đề issue. Trước khi tạo, tra issue
//      ĐANG MỞ cùng nhãn; trùng khoá thì **comment vào cái cũ**, không tạo mới.
//
// CHẠY (trong workflow, sau bước test):
//   node scripts/bao-bom-hen-gio.mjs <đường-dẫn-json> <DAY_OFFSET>
//
// Không có ca đỏ ⇒ không làm gì, thoát 0.

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const [, , duongDanJson, dayOffsetRaw] = process.argv;
const DAY_OFFSET = dayOffsetRaw ?? "?";
const NHAN = "bom-hen-gio";

/**
 * `--thu` — in ra thứ SẼ mở, không gọi `gh`. Có để kiểm được chính file này mà không rải
 * issue thật lên repo; cũng là cách duy nhất thử đường trích dữ liệu trước khi tin nó.
 */
const THU = process.argv.includes("--thu");

if (!duongDanJson || !existsSync(duongDanJson)) {
  console.error(`Không thấy file kết quả: ${duongDanJson}`);
  process.exit(1);
}

/** Chạy `gh`, trả stdout. Ném nếu lỗi. */
function gh(args, opts = {}) {
  return execFileSync("gh", args, { encoding: "utf8", ...opts }).trim();
}

/**
 * Trích MỌI ngày cứng năm 2026+ trong file test — đây là thứ làm issue đọc được ngay.
 * Bắt hai hình dạng repo đang dùng: `utc(2026, 9, 11)` và `"2026-09-11"`.
 */
function ngayCungTrongFile(duongDan) {
  if (!existsSync(duongDan)) return [];
  const noiDung = readFileSync(duongDan, "utf8");
  const ra = new Set();
  for (const m of noiDung.matchAll(/utc\(\s*(20\d{2})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*\)/g)) {
    ra.add(`${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`);
  }
  for (const m of noiDung.matchAll(/["'](20\d{2}-\d{2}-\d{2})/g)) ra.add(m[1]);
  return [...ra].sort();
}

const bao = JSON.parse(readFileSync(duongDanJson, "utf8"));

/** Gom ca ĐỎ: {file, ten, loi}. Định dạng JSON reporter của Vitest. */
const caDo = [];
for (const f of bao.testResults ?? []) {
  for (const t of f.assertionResults ?? []) {
    if (t.status !== "failed") continue;
    caDo.push({
      file: (f.name ?? "").replace(/\\/g, "/").replace(/^.*?\/turbot\//, ""),
      ten: [...(t.ancestorTitles ?? []), t.title].join(" > "),
      loi: (t.failureMessages ?? []).join("\n").split("\n").slice(0, 12).join("\n"),
    });
  }
}

if (caDo.length === 0) {
  console.log(`✔ Không ca nào đỏ ở +${DAY_OFFSET} ngày — không bom nào sắp nổ.`);
  process.exit(0);
}

console.log(`⚠️  ${caDo.length} ca đỏ ở +${DAY_OFFSET} ngày.`);

// Issue ĐANG MỞ cùng nhãn — để biết cái nào cần cập nhật thay vì tạo mới.
let dangMo = [];
if (THU) {
  console.log("[THỬ] bỏ qua `gh issue list`.");
} else {
  try {
    dangMo = JSON.parse(gh(["issue", "list", "--label", NHAN, "--state", "open", "--limit", "100", "--json", "number,title"]));
  } catch (e) {
    console.error("Không đọc được danh sách issue (nhãn có thể chưa tồn tại):", e.message);
  }
}

const repo = process.env.GITHUB_REPOSITORY ?? "";
const runUrl = process.env.GITHUB_RUN_ID ? `https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}` : "(chạy tay)";

for (const ca of caDo) {
  const khoa = `${ca.file} > ${ca.ten}`;
  const tieuDe = `[bom] ${khoa}`;
  const ngay = ngayCungTrongFile(ca.file);

  const than = [
    `**Lưới bom hẹn giờ** phát hiện ca này sẽ đỏ khi đồng hồ đi tới tương lai.`,
    ``,
    `| | |`,
    `|---|---|`,
    `| File | \`${ca.file}\` |`,
    `| Ca | \`${ca.ten}\` |`,
    `| Mốc phát hiện | **+${DAY_OFFSET} ngày** |`,
    `| Ngày cứng trong file | ${ngay.length ? ngay.map((d) => `\`${d}\``).join(" · ") : "_không tìm thấy ngày cứng — có thể là họ lỗi khác_"} |`,
    `| Lượt chạy | ${runUrl} |`,
    ``,
    `### Vì sao nó sẽ đỏ`,
    ``,
    `Ca dựng ngày **cứng** rồi gọi hàm có cổng so ngày đó với "hôm nay" (\`input.now ?? new Date()\`).`,
    `Khi ngày thật vượt qua ngày cứng, cổng đổi câu trả lời và ca **đỏ một chiều** — không có`,
    `cửa sổ giờ để nó tự xanh lại.`,
    ``,
    `### Cách vá`,
    ``,
    `Chốt \`now\` tường minh ngay tại lời gọi, mốc cố định và hợp lý so với ngày trong ca:`,
    ``,
    "```ts",
    `const now = new Date("2026-09-09T03:00:00Z");`,
    `await submitAttendanceRequest({ ...base, now, fromDate: d11 });`,
    "```",
    ``,
    `Rule \`thoigian/require-now-in-tests\` đã chặn hình dạng này cho \`submitAttendanceRequest\`/`,
    `\`decideRequest\`. Nếu ca đỏ gọi hàm KHÁC, cân nhắc thêm hàm đó vào \`HAM_NHAY_THOI_GIAN\``,
    `(\`lib/eslint/require-now-in-tests.mjs\`) — nhưng chỉ khi nó thật sự **đối chiếu** \`now\``,
    `với ngày do caller truyền, đừng thêm hàm chỉ vì nó nhận \`now\`.`,
    ``,
    `<details><summary>Lỗi</summary>`,
    ``,
    "```",
    ca.loi,
    "```",
    ``,
    `</details>`,
  ].join("\n");

  const cu = dangMo.find((i) => i.title === tieuDe);

  if (THU) {
    console.log(`
[THỬ] ${cu ? `SẼ CẬP NHẬT issue #${cu.number}` : "SẼ MỞ issue mới"}`);
    console.log(`  tiêu đề : ${tieuDe}`);
    console.log(`  file    : ${ca.file}`);
    console.log(`  ca      : ${ca.ten}`);
    console.log(`  ngày cứng: ${ngay.length ? ngay.join(" · ") : "(không tìm thấy)"}`);
    continue;
  }

  if (cu) {
    // ĐÃ CÓ issue mở cho đúng ca này ⇒ cập nhật, KHÔNG mở cái thứ hai.
    gh(["issue", "comment", String(cu.number), "--body",
      `Vẫn đỏ ở mốc **+${DAY_OFFSET} ngày** — lượt ${runUrl}.\n\nNgày cứng trong file: ${ngay.length ? ngay.map((d) => `\`${d}\``).join(" · ") : "_không tìm thấy_"}`]);
    console.log(`  ↻ cập nhật issue #${cu.number} — ${khoa}`);
  } else {
    const url = gh(["issue", "create", "--title", tieuDe, "--label", NHAN, "--body", than]);
    console.log(`  + mở issue mới — ${khoa}\n    ${url}`);
  }
}
