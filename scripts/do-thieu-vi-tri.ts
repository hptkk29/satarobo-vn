/**
 * scripts/do-thieu-vi-tri.ts — LƯỢT QUÉT KHÔNG CÓ TOẠ ĐỘ đến từ trình duyệt nào. CHỈ ĐỌC.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO — sự cố 16/09/2026, và để KHÔNG phải đoán thêm lần nữa
 *
 * Nhân viên báo trên PROD: chấm công nói *"không lấy được vị trí"* dù đã bật định vị, **và
 * không có hộp thoại nào hỏi**. Tôi đã loại được hai giả thuyết bằng phép đo:
 *   · `Permissions-Policy` prod trả về `geolocation=(self)` ⇒ header CHO PHÉP, không chặn;
 *   · họ vào bằng địa chỉ prod HTTPS, không phải `http://192.168.…` ⇒ secure context OK.
 *
 * Giả thuyết còn lại mạnh nhất: **họ mở trang trong TRÌNH DUYỆT NHÚNG** (Zalo, Messenger,
 * hoặc webview của chính app quét mã QR). Nhiều webview Android không được cấp quyền vị trí
 * cho app chủ, nên `getCurrentPosition` hỏng **im lặng, không hiện hộp thoại nào** — đúng
 * triệu chứng. Và nó giải thích được vì sao NHIỀU người cùng dính, chứ không phải một người
 * lỡ bấm "Không cho phép".
 *
 * `StaffTimeLog.userAgent` đã được lưu sẵn từ trước ⇒ **prod tự trả lời được**, không cần
 * mượn máy ai. Đây là chỗ phải đo thay vì suy tiếp.
 *
 * ⚠️ CHỈ ĐỌC. Không in họ tên — luật ở `docs/cham-cong/USER-CHI-DOC-PROD.md`.
 *    `userAgent` KHÔNG phải tên người: nó là chuỗi phiên bản trình duyệt, và ở đây còn được
 *    rút về NHÃN NHÓM chứ không in nguyên chuỗi.
 *
 * CHẠY: pnpm tsx scripts/do-thieu-vi-tri.ts
 */
// `_load-env` phải chạy TRƯỚC mọi import chạm Prisma.
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";
import { inQuyen, kiemQuyen } from "./_kiem-quyen";
import { db } from "../lib/db";

const kiemDb = scriptDb();

function tieu(s: string) {
  console.log("");
  console.log("═".repeat(100));
  console.log(s);
  console.log("═".repeat(100));
}
function dong(nhan: string, n: number | string) {
  console.log(`  ${nhan.padEnd(64)} ${String(n).padStart(10)}`);
}

/**
 * Rút `userAgent` về một NHÃN NHÓM.
 *
 * Thứ tự kiểm QUAN TRỌNG: trình duyệt nhúng của Zalo/Facebook đều kèm luôn chuỗi "Chrome"
 * trong UA của chúng, nên kiểm "Chrome" trước là mọi webview đều bị xếp nhầm thành Chrome —
 * và đó đúng là kết luận sai mà phép đo này sinh ra để tránh. Nhúng kiểm TRƯỚC.
 */
function nhomTrinhDuyet(ua: string | null): string {
  if (!ua) return "(không có userAgent)";
  const u = ua.toLowerCase();
  // ── Trình duyệt NHÚNG (in-app webview) — kiểm trước mọi thứ khác ──
  if (u.includes("zalo")) return "NHÚNG · Zalo";
  if (u.includes("fban") || u.includes("fbav") || u.includes("fb_iab")) return "NHÚNG · Facebook";
  if (u.includes("instagram")) return "NHÚNG · Instagram";
  if (u.includes("line/")) return "NHÚNG · LINE";
  if (u.includes("micromessenger")) return "NHÚNG · WeChat";
  if (u.includes("tiktok")) return "NHÚNG · TikTok";
  // `wv` là dấu hiệu chuẩn của Android WebView; `Version/…Chrome` cũng vậy.
  if (u.includes("; wv)")) return "NHÚNG · Android WebView";
  // ── Trình duyệt thật ──
  if (u.includes("edg/")) return "Edge";
  if (u.includes("opr/") || u.includes("opera")) return "Opera";
  if (u.includes("samsungbrowser")) return "Samsung Internet";
  if (u.includes("firefox")) return "Firefox";
  if (u.includes("crios")) return "Chrome (iOS)";
  if (u.includes("chrome")) return "Chrome";
  if (u.includes("safari")) return "Safari";
  return "Khác";
}

const laNhung = (nhom: string) => nhom.startsWith("NHÚNG");

async function main() {
  console.log(`DB host: ${currentDbHost() ?? "(không đọc được)"}`);
  inQuyen(await kiemQuyen(kiemDb), false);

  const luot = await db.staffTimeLog.findMany({
    select: {
      workDate: true,
      latitude: true,
      longitude: true,
      accuracyMeters: true,
      flags: true,
      source: true,
      result: true,
      userAgent: true,
    },
    orderBy: { workDate: "desc" },
    take: 5000,
  });

  const coToaDo = (l: (typeof luot)[number]) => l.latitude != null && l.longitude != null;
  const thieu = luot.filter((l) => !coToaDo(l));
  const co = luot.filter(coToaDo);

  tieu("① LƯỢT QUÉT CÓ / KHÔNG CÓ TOẠ ĐỘ");
  dong("Tổng lượt đọc được (5000 gần nhất)", luot.length);
  dong("CÓ toạ độ", co.length);
  dong("KHÔNG có toạ độ", thieu.length);
  dong("Tỉ lệ thiếu", luot.length ? `${Math.round((thieu.length / luot.length) * 1000) / 10}%` : "—");

  // ── VẾ QUYẾT ĐỊNH ─────────────────────────────────────────────────────────
  //
  // Bảng này trả lời thẳng câu "có phải do trình duyệt nhúng không". In CẢ hai cột —
  // thiếu và có — vì một nhóm chiếm nhiều lượt thiếu CHỈ vì nó chiếm nhiều lượt nói chung
  // thì chẳng chứng minh gì. Thứ cần nhìn là TỈ LỆ THIẾU TRONG TỪNG NHÓM.
  tieu("② THEO TRÌNH DUYỆT — cột cuối mới là cột phải đọc");
  const nhom = new Map<string, { thieu: number; co: number }>();
  for (const l of luot) {
    const k = nhomTrinhDuyet(l.userAgent);
    const v = nhom.get(k) ?? { thieu: 0, co: 0 };
    if (coToaDo(l)) v.co += 1;
    else v.thieu += 1;
    nhom.set(k, v);
  }
  console.log(
    `  ${"TRÌNH DUYỆT".padEnd(26)}${"TỔNG".padStart(7)}${"CÓ TOẠ ĐỘ".padStart(11)}${"THIẾU".padStart(8)}${"TỈ LỆ THIẾU".padStart(13)}`,
  );
  for (const [k, v] of [...nhom.entries()].sort((a, b) => b[1].thieu + b[1].co - (a[1].thieu + a[1].co))) {
    const tong = v.thieu + v.co;
    console.log(
      `  ${k.padEnd(26)}${String(tong).padStart(7)}${String(v.co).padStart(11)}${String(v.thieu).padStart(8)}` +
        `${`${Math.round((v.thieu / tong) * 1000) / 10}%`.padStart(13)}`,
    );
  }

  tieu("③ GỘP: TRÌNH DUYỆT NHÚNG vs TRÌNH DUYỆT THẬT");
  const gop = { nhung: { thieu: 0, co: 0 }, that: { thieu: 0, co: 0 } };
  for (const [k, v] of nhom.entries()) {
    const o = laNhung(k) ? gop.nhung : gop.that;
    o.thieu += v.thieu;
    o.co += v.co;
  }
  const ti = (o: { thieu: number; co: number }) =>
    o.thieu + o.co ? `${Math.round((o.thieu / (o.thieu + o.co)) * 1000) / 10}%` : "—";
  dong("NHÚNG — tổng lượt", gop.nhung.thieu + gop.nhung.co);
  dong("NHÚNG — tỉ lệ thiếu toạ độ", ti(gop.nhung));
  dong("THẬT  — tổng lượt", gop.that.thieu + gop.that.co);
  dong("THẬT  — tỉ lệ thiếu toạ độ", ti(gop.that));
  console.log("");
  console.log("  ⓘ Nếu NHÚNG thiếu cao hẳn so với THẬT ⇒ giả thuyết webview ĐÚNG, và cách sửa là");
  console.log("    hướng người dùng 'mở bằng trình duyệt' chứ không phải sửa mã định vị.");
  console.log("    Nếu hai tỉ lệ ngang nhau ⇒ giả thuyết SAI, phải tìm tiếp chỗ khác.");

  // ── Cờ đi kèm, để đối chiếu với cách hệ đang ghi ─────────────────────────
  tieu("④ CỜ TRÊN CÁC LƯỢT THIẾU TOẠ ĐỘ");
  const demCo = new Map<string, number>();
  for (const l of thieu) for (const f of l.flags) demCo.set(f, (demCo.get(f) ?? 0) + 1);
  if (demCo.size === 0) console.log("  (không cờ nào)");
  for (const [f, n] of [...demCo.entries()].sort((a, b) => b[1] - a[1])) dong(`  ${f}`, n);

  tieu("⑤ ĐƯỜNG GHI — quét QR hay nút công tác");
  const demNguon = new Map<string, { thieu: number; co: number }>();
  for (const l of luot) {
    const k = String(l.source);
    const v = demNguon.get(k) ?? { thieu: 0, co: 0 };
    if (coToaDo(l)) v.co += 1;
    else v.thieu += 1;
    demNguon.set(k, v);
  }
  for (const [k, v] of [...demNguon.entries()].sort((a, b) => b[1].thieu + b[1].co - (a[1].thieu + a[1].co)))
    console.log(`  ${k.padEnd(14)} tổng=${String(v.thieu + v.co).padStart(5)}  thiếu=${String(v.thieu).padStart(5)}  (${ti(v)})`);

  // ── ⑥ VẾ QUYẾT ĐỊNH CÒN LẠI: các lượt thiếu là CŨ hay MỚI ─────────────────
  //
  // Lượt chạy đầu cho thấy: MỌI lượt có `userAgent` đều CÓ toạ độ (0% thiếu ở mọi nhóm
  // trình duyệt), còn MỌI lượt thiếu toạ độ thì cũng thiếu luôn `userAgent`. Hai cột cùng
  // rỗng không phải trùng hợp — nó nói rằng những dòng ấy KHÔNG đi qua đường trình duyệt
  // bình thường.
  //
  // `checkin-action.ts:52` CÓ truyền `userAgent`, nên lượt quét QR hôm nay phải có. Vậy
  // những dòng rỗng cả hai hoặc là ghi từ trước khi cột đó được nối, hoặc đi đường khác.
  // Mốc NGÀY phân biệt được hai khả năng ấy — và nếu chúng đều CŨ thì lỗi nhân viên đang
  // gặp KHÔNG nằm trong bảng này, tức nó hỏng TRƯỚC khi kịp ghi dòng nào.
  tieu("⑥ LƯỢT QUÉT QR (TICKET) THEO NGÀY — thiếu toạ độ là chuyện CŨ hay ĐANG XẢY RA");
  const ve = luot.filter((l) => String(l.source) === "TICKET");
  const theoNgay = new Map<string, { co: number; thieu: number; coUA: number }>();
  for (const l of ve) {
    const k = l.workDate.toISOString().slice(0, 10);
    const v = theoNgay.get(k) ?? { co: 0, thieu: 0, coUA: 0 };
    if (coToaDo(l)) v.co += 1;
    else v.thieu += 1;
    if (l.userAgent) v.coUA += 1;
    theoNgay.set(k, v);
  }
  console.log(
    `  ${"NGÀY".padEnd(12)}${"TỔNG".padStart(6)}${"CÓ TOẠ ĐỘ".padStart(11)}${"THIẾU".padStart(7)}${"CÓ userAgent".padStart(14)}`,
  );
  for (const [k, v] of [...theoNgay.entries()].sort()) {
    console.log(
      `  ${k.padEnd(12)}${String(v.co + v.thieu).padStart(6)}${String(v.co).padStart(11)}${String(v.thieu).padStart(7)}${String(v.coUA).padStart(14)}`,
    );
  }
  console.log("");
  console.log("  ⓘ Nếu cột THIẾU chỉ có ở những ngày ĐẦU rồi tắt hẳn ⇒ đó là dữ liệu cũ, và lỗi");
  console.log("    nhân viên đang báo KHÔNG để lại dòng nào — tức nó hỏng TRƯỚC lúc gửi, chứ");
  console.log("    không phải gửi lên mà thiếu toạ độ. Hai chuyện ấy vá ở hai chỗ khác nhau.");

  console.log("");
  console.log("Xong. Không dòng nào bị ghi.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await kiemDb.$disconnect();
    await db.$disconnect();
  });
