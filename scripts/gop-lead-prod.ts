/**
 * scripts/gop-lead-prod.ts — gộp lead phụ vào lead chính (cùng một gia đình).
 *
 *   pnpm exec tsx scripts/gop-lead-prod.ts --phu=<leadId> --chinh=<leadId>          # CHẠY THỬ
 *   pnpm exec tsx scripts/gop-lead-prod.ts --phu=<leadId> --chinh=<leadId> --apply  # GHI THẬT
 *
 * Toàn bộ luật nằm ở `lib/lead/gop-lead.ts` (có test `[GOP-01..05]`); tệp này chỉ đọc tham
 * số, in đích kết nối + kế hoạch. Chạy thử = chạy đúng đường ghi rồi LÙI cả giao dịch, nên
 * con số in ra là số của phép ghi thật.
 *
 * Chạy trên prod qua `.github/workflows/gop-lead-prod.yml` — máy dev KHÔNG có chuỗi prod.
 */
import "./_cho-phep-server-only"; // ← phải TRƯỚC mọi import chạm `server-only`
import { scriptDb, scriptDatabaseUrl } from "./_script-db";

function thamSo(ten: string): string | null {
  const a = process.argv.find((x) => x.startsWith(`--${ten}=`));
  return a ? a.slice(ten.length + 3).trim() : null;
}

/** Mã lead là cuid — chặn mọi chuỗi lạ trước khi chạm DB. */
const MA_LEAD = /^c[a-z0-9]{20,32}$/;

async function main(): Promise<void> {
  const phuId = thamSo("phu");
  const chinhId = thamSo("chinh");
  const apply = process.argv.includes("--apply");
  if (!phuId || !chinhId || !MA_LEAD.test(phuId) || !MA_LEAD.test(chinhId)) {
    console.error("Cần --phu=<mã lead> --chinh=<mã lead> (dạng cuid).");
    process.exitCode = 1;
    return;
  }

  // Đích kết nối, che mật khẩu — cách duy nhất đối chiếu secret (GitHub không cho đọc lại).
  const url = scriptDatabaseUrl() ?? "";
  const dich = url.replace(/\/\/([^:@/]+):[^@]*@/, "//$1:***@").replace(/\?.*$/, "");
  console.log(`Đích: ${dich}`);
  console.log(`Chế độ: ${apply ? "GHI THẬT" : "CHẠY THỬ (ghi rồi lùi toàn bộ)"}`);

  // Nhập ĐỘNG: `lib/lead/gop-lead` kéo theo `assign-lead` (có `import "server-only"`), mà
  // import tĩnh được nâng lên chạy TRƯỚC bản vá ở dòng đầu.
  const { gopLead } = await import("../lib/lead/gop-lead");
  const db = scriptDb();
  try {
    const kq = await gopLead(db, { phuId, chinhId, apply, actorName: "Hệ thống (gộp lead)" });
    console.log("");
    console.log(`Lead chính: ${kq.chinh.id}  "${kq.chinh.parentName}"`);
    console.log(`Lead phụ  : ${kq.phu.id}  "${kq.phu.parentName}"  → xoá mềm`);
    console.log("");
    console.log("Số dòng dời sang lead chính:");
    for (const [bang, n] of Object.entries(kq.bangDoi)) if (n > 0) console.log(`  ${bang.padEnd(24)} ${n}`);
    console.log("");
    console.log("Con:");
    for (const c of kq.con) console.log(`  ${c.ten} — ${c.cach}`);
    console.log("");
    console.log(kq.daGhi ? "✅ ĐÃ GHI." : "Chạy thử xong — KHÔNG có gì đổi. Muốn ghi thật: thêm --apply.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
