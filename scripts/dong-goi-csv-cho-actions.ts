/**
 * Đóng gói `staging_leads.csv` thành GIÁ TRỊ SECRET cho GitHub Actions.
 *
 *   pnpm csv:dong-goi-secret              # tự chia phần nếu cần
 *   pnpm csv:dong-goi-secret -- --phan=2  # ép chia 2 phần
 *
 * VÌ SAO PHẢI QUA SECRET. Repo `hptkk29/satarobo-vn` là PUBLIC. File CSV mang 795
 * SĐT + tên phụ huynh/trẻ THẬT nên không được commit (đã chặn ở `.gitignore`).
 * Nhưng workflow chỉ đọc được thứ nằm trong repo hoặc trong secret ⇒ nhét file vào
 * secret là đường duy nhất đưa dữ liệu lên runner mà không công khai nó.
 *
 * VÌ SAO BROTLI CHỨ KHÔNG GZIP. Tài liệu GitHub ghi hạn mức 64 KB cho một secret,
 * nhưng ô nhập THỰC TẾ chặt hơn — bản gzip 55.360 ký tự bị từ chối thẳng với
 * "Value is too large" (đo 27/08/2026). Brotli q11 nén 287 KB xuống 32,5 KB,
 * base64 còn 43,3 KB ⇒ lọt. Đừng đổi lại gzip để "cho quen thuộc": nó không vừa.
 *
 * NẾU VẪN BỊ TỪ CHỐI thì chạy lại với `--phan=2` (hoặc 3). Workflow tự nối
 * `LEGACY_LEADS_CSV_B64` + `_2` + `_3` nên không phải sửa gì bên đó.
 */
import { createHash, type BinaryLike } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const NGUON = path.resolve(process.cwd(), "docs/merge-lead/staging_leads.csv");
const THU_MUC = path.dirname(NGUON);
/** Ngưỡng an toàn cho một ô secret. Thấp hơn 48 KB mà ô nhập chấp nhận. */
const NGUONG = 46_000;

const argPhan = process.argv.find((a) => a.startsWith("--phan="));
const phanEp = argPhan ? Number(argPhan.slice(7)) : 0;

const tho = fs.readFileSync(NGUON);
const nen = zlib.brotliCompressSync(tho, {
  params: {
    [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
    [zlib.constants.BROTLI_PARAM_SIZE_HINT]: tho.length,
    [zlib.constants.BROTLI_PARAM_LGWIN]: 24,
  },
});
const b64 = nen.toString("base64");
const bam = (x: BinaryLike) => createHash("sha256").update(x).digest("hex").slice(0, 16);

const soPhan = Math.max(phanEp || 1, Math.ceil(b64.length / NGUONG));
const coPhan = Math.ceil(b64.length / soPhan);

const soDong = tho.toString("utf8").trimEnd().split(/\r?\n/).length;
console.log(`Nguồn      : ${NGUON}`);
console.log(`             ${tho.length} bytes · ${soDong} dòng (kể cả header)`);
console.log(`brotli q11 : ${nen.length} bytes`);
console.log(`base64     : ${b64.length} ký tự`);
console.log(`sha256(16) : ${bam(tho)}   ← workflow sẽ in lại số này để đối chiếu`);
console.log(`\nChia ${soPhan} phần (mỗi phần ≤ ${NGUONG} ký tự):\n`);

// Dọn phần cũ để lần chạy trước chia 3, lần này chia 2 thì không còn file mồ côi
// mà người vận hành lỡ dán nhầm.
for (const f of fs.readdirSync(THU_MUC))
  if (/^csv-b64-cho-actions.*\.txt$/.test(f)) fs.unlinkSync(path.join(THU_MUC, f));

for (let i = 0; i < soPhan; i++) {
  const phan = b64.slice(i * coPhan, (i + 1) * coPhan);
  const ten = `csv-b64-cho-actions${i === 0 ? "" : `-${i + 1}`}.txt`;
  fs.writeFileSync(path.join(THU_MUC, ten), phan, "utf8");
  const secret = `LEGACY_LEADS_CSV_B64${i === 0 ? "" : `_${i + 1}`}`;
  console.log(`  ${secret.padEnd(28)} ← ${ten}  (${phan.length} ký tự)`);
}

console.log(
  `\nGitHub → Settings → Secrets and variables → Actions → New repository secret.` +
    `\nDán TỪNG file vào ĐÚNG tên secret ở trên. Copy nhanh (PowerShell):\n` +
    `  Get-Content ${path.join(THU_MUC, "csv-b64-cho-actions.txt")} -Raw | Set-Clipboard\n` +
    `\n⚠️ Thứ tự các phần là quan trọng — nối sai thứ tự thì workflow báo header lệch.\n` +
    `   Nếu ô nhập vẫn báo "Value is too large", chạy lại với --phan=${soPhan + 1}.\n`,
);
