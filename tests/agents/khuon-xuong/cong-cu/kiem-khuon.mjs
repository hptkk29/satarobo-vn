#!/usr/bin/env node
/**
 * kiem-khuon.mjs — đội kỹ thuật Sata Robo tự kiểm một phản hồi của Cổng dữ liệu agent.
 * Node >= 18, không cần cài package.
 *
 *   node kiem-khuon.mjs <ten_cong_cu> <file_phan_hoi.json>   kiểm một phản hồi thật (lưu từ API/MCP)
 *   node kiem-khuon.mjs --mau                                kiểm toàn bộ file mẫu trong ../mau/
 *
 * Kiểm: (1) vỏ {du_lieu, meta} đủ trường · (2) du_lieu khớp khuôn trong ../schema/
 *       (3) không lọt trường nội bộ bắt đầu bằng "_" · (4) công cụ nhạy cảm CAO phải da_che_du_lieu = true
 *       (5) khi đã che: không còn SĐT, email, số CCCD; lead.sdt chỉ được là "[SĐT]" hoặc null,
 *           lead.ten_ph = "[TÊN_PH]", lead.ten_be = "[TÊN_CON]"
 * Thoát mã 1 nếu có lỗi.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.join(DIR, "..", "schema");
const MAU_DIR = path.join(DIR, "..", "mau");
const soCongCu = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, "danh-muc-cong-cu.json"), "utf8"));
const TRUONG_META = ["cong_cu", "phien_ban_khuon", "sinh_luc", "so_ban_ghi", "tiep_theo", "da_che_du_lieu", "pham_vi_co_so", "ma_yeu_cau"];

function kiemGiaTri(v, s, p, loi) {
  if (s.enum) { if (!s.enum.includes(v)) loi.push(`${p}: "${v}" không thuộc [${s.enum.join(", ")}]`); return; }
  const types = [].concat(s.type || []);
  const t = v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v;
  const hop = types.includes(t) || (t === "integer" && types.includes("number"));
  if (types.length && !hop) { loi.push(`${p}: kiểu ${t}, cần ${types.join("|")}`); return; }
  if (t === "object" && s.required) {
    for (const f of s.required) if (!(f in v)) loi.push(`${p}: thiếu trường "${f}"`);
    for (const [f, sub] of Object.entries(s.properties || {})) if (f in v) kiemGiaTri(v[f], sub, `${p}.${f}`, loi);
  }
  if (t === "array" && s.items) v.forEach((x, i) => kiemGiaTri(x, s.items, `${p}[${i}]`, loi));
}

function quetTruongNoiBo(v, p, loi) {
  if (Array.isArray(v)) return v.forEach((x, i) => quetTruongNoiBo(x, `${p}[${i}]`, loi));
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
    if (k.startsWith("_")) loi.push(`${p}.${k}: trường nội bộ không được trả ra API`);
    quetTruongNoiBo(x, `${p}.${k}`, loi);
  }
}

function quetDuLieuCaNhan(v, p, loi) {
  if (Array.isArray(v)) return v.forEach((x, i) => quetDuLieuCaNhan(x, `${p}[${i}]`, loi));
  if (v && typeof v === "object") return Object.entries(v).forEach(([k, x]) => quetDuLieuCaNhan(x, `${p}.${k}`, loi));
  if (typeof v !== "string") return;
  if (/(?:\+?84|\b0)\d{9}\b/.test(v)) loi.push(`${p}: còn số điện thoại chưa che`);
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(v)) loi.push(`${p}: còn email chưa che`);
  if (/\b\d{12}\b/.test(v)) loi.push(`${p}: còn dãy 12 số (nghi CCCD) chưa che`);
}

function kiem(tenCongCu, tep) {
  const loi = [];
  const cc = soCongCu.cong_cu.find((c) => c.ten === tenCongCu || c.ten_mcp === tenCongCu);
  if (!cc) return [`không có công cụ "${tenCongCu}" trong sổ (${SCHEMA_DIR}/danh-muc-cong-cu.json)`];
  let d;
  try { d = JSON.parse(fs.readFileSync(tep, "utf8")); } catch (e) { return [`không đọc được JSON: ${e.message}`]; }

  if (!("du_lieu" in d)) loi.push("vỏ: thiếu \"du_lieu\"");
  if (!d.meta) loi.push("vỏ: thiếu \"meta\"");
  else {
    for (const f of TRUONG_META) if (!(f in d.meta)) loi.push(`meta: thiếu "${f}"`);
    if (d.meta.cong_cu && d.meta.cong_cu !== cc.ten) loi.push(`meta.cong_cu = "${d.meta.cong_cu}", cần "${cc.ten}"`);
    if (cc.bat_buoc_che && d.meta.da_che_du_lieu !== true) loi.push("công cụ nhạy cảm CAO: meta.da_che_du_lieu phải là true");
    const n = Array.isArray(d.du_lieu) ? d.du_lieu.length : 1;
    if (typeof d.meta.so_ban_ghi === "number" && d.meta.so_ban_ghi !== n) loi.push(`meta.so_ban_ghi = ${d.meta.so_ban_ghi} nhưng du_lieu có ${n}`);
  }
  if (!("du_lieu" in d)) return loi;

  const s = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, cc.schema), "utf8"));
  if (cc.dang_du_lieu === "mang_doi_tuong") {
    if (!Array.isArray(d.du_lieu)) loi.push("du_lieu: phải là MẢNG các đối tượng");
    else d.du_lieu.forEach((x, i) => kiemGiaTri(x, s, `du_lieu[${i}]`, loi));
  } else kiemGiaTri(d.du_lieu, s, "du_lieu", loi);

  quetTruongNoiBo(d.du_lieu, "du_lieu", loi);
  if (d.meta?.da_che_du_lieu === true) {
    quetDuLieuCaNhan(d.du_lieu, "du_lieu", loi);
    if (cc.schema === "lead.schema.json" && Array.isArray(d.du_lieu))
      d.du_lieu.forEach((l, i) => {
        if (l.sdt !== null && l.sdt !== "[SĐT]") loi.push(`du_lieu[${i}].sdt: phải là "[SĐT]" hoặc null khi đã che`);
        if (l.ten_ph !== "[TÊN_PH]") loi.push(`du_lieu[${i}].ten_ph: phải là "[TÊN_PH]" khi đã che`);
        if (l.ten_be !== "[TÊN_CON]") loi.push(`du_lieu[${i}].ten_be: phải là "[TÊN_CON]" khi đã che`);
      });
  }
  return loi;
}

const args = process.argv.slice(2);
let viec;
if (args[0] === "--mau") viec = soCongCu.cong_cu.map((c) => [c.ten, path.join(MAU_DIR, `${c.ten}.json`)]);
else if (args.length === 2) viec = [[args[0], args[1]]];
else { console.log("Cách dùng:\n  node kiem-khuon.mjs <ten_cong_cu> <file_phan_hoi.json>\n  node kiem-khuon.mjs --mau"); process.exit(2); }

let tongLoi = 0;
for (const [ten, tep] of viec) {
  const loi = kiem(ten, tep);
  tongLoi += loi.length;
  console.log(`${loi.length ? "❌" : "✅"} ${ten}  (${path.basename(tep)})`);
  for (const l of loi.slice(0, 30)) console.log("     - " + l);
}
console.log(tongLoi ? `\nCHƯA ĐẠT: ${tongLoi} lỗi.` : `\nĐẠT: ${viec.length}/${viec.length} phản hồi khớp hợp đồng.`);
process.exit(tongLoi ? 1 : 0);
