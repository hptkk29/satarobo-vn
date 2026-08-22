/* Phân tích "mùi" tối ưu cấp cột từ prisma/schema.prisma (không cần DMMF). */
const fs = require('fs');
const path = require('path');
const raw = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
const lines = raw.split(/\r?\n/);

const enums = new Set(), models = new Set();
for (const l of lines) {
  let m = l.match(/^enum\s+(\w+)\s*\{/); if (m) enums.add(m[1]);
  m = l.match(/^model\s+(\w+)\s*\{/); if (m) models.add(m[1]);
}

const tables = {};
let i = 0;
while (i < lines.length) {
  const head = lines[i].match(/^model\s+(\w+)\s*\{/);
  if (!head) { i++; continue; }
  const name = head[1]; const body = []; i++;
  while (i < lines.length && !/^\}/.test(lines[i])) { body.push(lines[i]); i++; }
  i++;

  const fkSet = new Set();
  for (const ln of body) { const r = ln.match(/@relation\([^)]*fields:\s*\[([^\]]+)\]/); if (r) r[1].split(',').forEach(s => fkSet.add(s.trim())); }

  const cols = [];
  for (const lnRaw of body) {
    const ln = lnRaw.trim();
    if (!ln || ln.startsWith('//') || ln.startsWith('@@')) continue;
    const tok = ln.split(/\s+/); const fname = tok[0];
    if (!/^\w+$/.test(fname)) continue;
    const tt = tok[1] || ''; const base = tt.replace(/[?[\]]/g, '');
    if (models.has(base)) continue; // navigation, không phải cột
    cols.push({
      name: fname, base, list: /\[\]/.test(tt), opt: /\?/.test(tt),
      isEnum: enums.has(base), isBool: base === 'Boolean', isJson: base === 'Json',
      isFloat: base === 'Float', isInt: base === 'Int', isStr: base === 'String',
      isPk: /@id\b/.test(ln), isFk: fkSet.has(fname),
      hasDefault: /@default/.test(ln), comment: (ln.split('//')[1] || '').trim(),
    });
  }
  tables[name] = cols;
}

// ---- detectors ----
const moneyRe = /(price|amount|total|fee|cost|salary|balance|paid|revenue|subtotal|tuition|debt|deposit|refund)/i;
const enumishRe = /(type|status|kind|level|category|role|state|mode|rank|grade|gender|relation|channel|severity)$/i;
const rows = [];
for (const [t, cols] of Object.entries(tables)) {
  const n = cols.length;
  const nul = cols.filter(c => c.opt && !c.isPk).length;
  const nulRatio = n ? Math.round((nul / n) * 100) : 0;
  const bools = cols.filter(c => c.isBool);
  const jsons = cols.filter(c => c.isJson);
  const floatsMoney = cols.filter(c => c.isFloat && moneyRe.test(c.name));
  const intMoney = cols.filter(c => c.isInt && moneyRe.test(c.name));
  const orphanIds = cols.filter(c => /Id$/.test(c.name) && c.name !== 'id' && !c.isFk && (c.isStr || c.isInt));
  const enumStr = cols.filter(c => c.isStr && enumishRe.test(c.name));
  const hasCreated = cols.some(c => c.name === 'createdAt');
  const hasUpdated = cols.some(c => c.name === 'updatedAt');
  rows.push({ t, n, nul, nulRatio, bools, jsons, floatsMoney, intMoney, orphanIds, enumStr, hasCreated, hasUpdated });
}

function list(arr) { return arr.map(c => c.name).join(', '); }
const out = [];
out.push('# Per-column optimization audit\n');
out.push(`Tổng: ${Object.keys(tables).length} bảng, ${Object.values(tables).reduce((a, c) => a + c.length, 0)} cột.\n`);

out.push('## A. God-table (>30 cột)');
rows.filter(r => r.n > 30).sort((a, b) => b.n - a.n).forEach(r => out.push(`- **${r.t}** — ${r.n} cột (nullable ${r.nulRatio}%)`));

out.push('\n## B. Nullable tràn lan (≥70% cột nullable, bảng ≥8 cột)');
rows.filter(r => r.nulRatio >= 70 && r.n >= 8).sort((a, b) => b.nulRatio - a.nulRatio).forEach(r => out.push(`- **${r.t}** — ${r.nulRatio}% (${r.nul}/${r.n})`));

out.push('\n## C. Boolean flag bùng nổ (≥4 boolean)');
rows.filter(r => r.bools.length >= 4).sort((a, b) => b.bools.length - a.bools.length).forEach(r => out.push(`- **${r.t}** — ${r.bools.length}: ${list(r.bools)}`));

out.push('\n## D. Json nhiều (≥2 cột Json — denormalize quá đà?)');
rows.filter(r => r.jsons.length >= 2).sort((a, b) => b.jsons.length - a.jsons.length).forEach(r => out.push(`- **${r.t}** — ${r.jsons.length}: ${list(r.jsons)}`));

out.push('\n## E. Float cho tiền (sai số)');
rows.filter(r => r.floatsMoney.length).forEach(r => out.push(`- **${r.t}** — ${list(r.floatsMoney)}`));

out.push('\n## F. Int cho cột tổng/tiền (nguy cơ tràn 2.1 tỷ → BigInt)');
rows.filter(r => r.intMoney.some(c => /(total|amount|revenue|subtotal|balance|debt)/i.test(c.name))).forEach(r => out.push(`- **${r.t}** — ${list(r.intMoney)}`));

out.push('\n## G. FK ngầm / orphan (cột *Id scalar không khai báo @relation)');
const orphanTotal = rows.reduce((a, r) => a + r.orphanIds.length, 0);
out.push(`Tổng ${orphanTotal} cột. Bảng có nhiều:`);
rows.filter(r => r.orphanIds.length).sort((a, b) => b.orphanIds.length - a.orphanIds.length).slice(0, 25).forEach(r => out.push(`- **${r.t}** — ${list(r.orphanIds)}`));

out.push('\n## H. String nên là enum (tên kết thúc type/status/kind/level/...)');
rows.filter(r => r.enumStr.length).sort((a, b) => b.enumStr.length - a.enumStr.length).slice(0, 30).forEach(r => out.push(`- **${r.t}** — ${list(r.enumStr)}`));

out.push('\n## I. Bảng mutable thiếu updatedAt (có createdAt nhưng không updatedAt)');
rows.filter(r => r.hasCreated && !r.hasUpdated).forEach(r => out.push(`- ${r.t}`));

const summary = {
  god: rows.filter(r => r.n > 30).length,
  nullable: rows.filter(r => r.nulRatio >= 70 && r.n >= 8).length,
  flag: rows.filter(r => r.bools.length >= 4).length,
  json: rows.filter(r => r.jsons.length >= 2).length,
  floatMoney: rows.filter(r => r.floatsMoney.length).length,
  intOverflow: rows.filter(r => r.intMoney.some(c => /(total|amount|revenue|subtotal|balance|debt)/i.test(c.name))).length,
  orphan: orphanTotal,
  enumStr: rows.reduce((a, r) => a + r.enumStr.length, 0),
  noUpdated: rows.filter(r => r.hasCreated && !r.hasUpdated).length,
};
console.log(out.join('\n'));
console.error('\n=== SUMMARY ===\n' + JSON.stringify(summary, null, 2));
