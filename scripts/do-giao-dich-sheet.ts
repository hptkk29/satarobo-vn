/**
 * scripts/do-giao-dich-sheet.ts — ĐO file "Danh sách đăng ký" trước khi nhập. CHỈ ĐỌC.
 *
 *   pnpm exec tsx scripts/do-giao-dich-sheet.ts "E:\\websatarobo data\\Satarobo - Danh sách đăng ký.xlsx"
 *
 * ⚠️ File nguồn KHÔNG được commit vào repo: nó chứa CCCD học viên, CCCD phụ huynh và địa
 * chỉ nhà. Script nhận đường dẫn qua tham số, và không in CCCD/địa chỉ ra màn hình.
 *
 * Dùng CHUNG phép đọc với màn nhập (`lib/finance/nhap-giao-dich-sheet.ts`) — hai phép
 * tính khác nhau là hai con số khác nhau, và người ta sẽ tin con số nào hiện ra trước.
 */
import * as XLSX from "xlsx";

import {
  docDongGiaoDich,
  gopTheoHocVien,
  sheetChuaTronSheet,
  type GiaoDichSheet,
} from "@/lib/finance/nhap-giao-dich-sheet";

/** Sheet "Thuê Robot" cố ý KHÔNG có ở đây: cột khác hẳn (gói thuê, đặt cọc, số lượng) — nó là bán/thuê thiết bị, không phải học phí. */
const SHEET_HOC_PHI = [
  "Tháng 52026",
  "Tháng 62026",
  "Tháng 72026 CS1",
  "Tháng 72026 CS2",
  "Tháng 82026 CS1",
  "Tháng 82026 CS2",
  "Tháng 92026 CS1",
  "Tháng 92026 CS2",
];

const vnd = (n: number) => n.toLocaleString("vi-VN") + "đ";

/** Header không cùng một dòng giữa các sheet ("Tháng 52026" ở dòng 2). Dò, đừng đoán. */
function dongHeader(ws: XLSX.WorkSheet): number {
  const tho = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  for (let i = 0; i < Math.min(4, tho.length); i++) {
    const hang = tho[i];
    if (
      Array.isArray(hang) &&
      hang.some((v) => String(v ?? "").toLowerCase().includes("họ và tên học viên"))
    ) {
      return i;
    }
  }
  return 0;
}

export function docFile(duongDan: string): Map<string, GiaoDichSheet[]> {
  const wb = XLSX.readFile(duongDan, { cellDates: true });
  const ra = new Map<string, GiaoDichSheet[]>();
  for (const n of SHEET_HOC_PHI) {
    const ws = wb.Sheets[n];
    if (!ws) continue;
    const hr = dongHeader(ws);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      range: hr,
      defval: null,
    });
    const gd: GiaoDichSheet[] = [];
    rows.forEach((r, i) => {
      const g = docDongGiaoDich(r, n, hr + 2 + i);
      if (g) gd.push(g);
    });
    ra.set(n, gd);
  }
  return ra;
}

function main() {
  const duongDan = process.argv[2];
  if (!duongDan) {
    console.error("Thiếu đường dẫn file. Xem chú thích đầu file.");
    process.exit(1);
  }

  const theoSheet = docFile(duongDan);

  console.log("── THEO SHEET ──");
  for (const [n, gd] of theoSheet) {
    const tong = gd.reduce((s, g) => s + g.hocPhi, 0);
    console.log(`  ${n.padEnd(18)} ${String(gd.length).padStart(4)} giao dịch  ${vnd(tong).padStart(16)}`);
  }

  console.log("\n── SHEET LỒNG NHAU (đếm đôi) ──");
  const ten = [...theoSheet.keys()];
  const boQua = new Set<string>();
  for (const a of ten) {
    for (const b of ten) {
      if (a === b || boQua.has(a)) continue;
      const r = sheetChuaTronSheet(theoSheet.get(a)!, theoSheet.get(b)!);
      if (r.chuaTron && (theoSheet.get(a)?.length ?? 0) > 0) {
        console.log(`  "${a}" nằm TRỌN trong "${b}" — ${r.soDongTrung} dòng, cộng đôi ${vnd(r.tienCongDoi)}`);
        boQua.add(a);
      }
    }
  }
  if (boQua.size === 0) console.log("  (không có)");

  const dung = ten.filter((n) => !boQua.has(n));
  const tatCa = dung.flatMap((n) => theoSheet.get(n)!);
  const gop = gopTheoHocVien(tatCa);

  console.log("\n── SỐ DÙNG ĐỂ NHẬP (đã loại dòng tổng + sheet lồng) ──");
  console.log(`  giao dịch : ${tatCa.length}`);
  console.log(`  tổng tiền : ${vnd(tatCa.reduce((s, g) => s + g.hocPhi, 0))}`);
  console.log(`  học viên  : ${gop.length}`);
  console.log(`  thiếu SĐT (phải có người chỉ đúng em): ${gop.filter((g) => g.canNguoiXem).length}`);

  // Khoá khớp là (SĐT phụ huynh, họ tên) theo chốt 14/09. Một SĐT có thể là của HAI em
  // (anh chị em) — con số này phải nói ra, vì nó là lý do không được gộp theo SĐT.
  const theoSdt = new Map<string, Set<string>>();
  for (const g of gop) {
    if (!g.sdt) continue;
    if (!theoSdt.has(g.sdt)) theoSdt.set(g.sdt, new Set());
    theoSdt.get(g.sdt)!.add(g.hoTen ?? "");
  }
  const nhieuCon = [...theoSdt.entries()].filter(([, v]) => v.size > 1);
  console.log(`  SĐT riêng biệt: ${theoSdt.size}   trong đó DÙNG CHO >1 EM: ${nhieuCon.length}`);
  for (const [sdt, ten] of nhieuCon.slice(0, 5)) {
    console.log(`     ${sdt} → ${[...ten].join(" | ")}`);
  }

  const phanBo = new Map<number, number>();
  for (const g of gop) phanBo.set(g.soDot, (phanBo.get(g.soDot) ?? 0) + 1);
  console.log(
    "  phân bố: " +
      [...phanBo.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k} đợt → ${v} em`).join("   "),
  );

  console.log("\n── ĐÓNG NHIỀU ĐỢT NHẤT ──");
  for (const g of [...gop].sort((a, b) => b.soDot - a.soDot).slice(0, 5)) {
    console.log(`  ${(g.maHV ?? "(thiếu mã)").padEnd(16)} ${g.soDot} đợt  ${vnd(g.tongTien).padStart(14)}  ${g.hoTen ?? ""}`);
  }
}

main();
