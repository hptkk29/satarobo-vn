/**
 * scripts/nen-p1-doi-soat-orgunit.ts — Nền Hệ thống P1 · US-07 AC3 (bản chạy tay).
 *
 * Đếm theo `centerId` vs `orgUnitId` từng bảng, in bảng Markdown. Bản cron đêm dùng CHUNG
 * lõi `lib/org/drift-report.ts` (một hiện thực, hai vỏ).
 *
 * CHẠY:
 *   pnpm tsx scripts/nen-p1-doi-soat-orgunit.ts           # chỉ in, không ghi nhật ký
 *   pnpm tsx scripts/nen-p1-doi-soat-orgunit.ts --save    # ghi thêm vào OrgUnitDriftRun
 *
 * CHỈ ĐỌC (trừ --save). Không sửa dữ liệu nghiệp vụ.
 *
 * ⚠️ Đọc kỹ dòng cuối khi báo cáo "sạch": nếu `tổng dòng = 0` thì 0 lệch là XANH GIẢ —
 * prod đã bị dọn sạch dữ liệu vận hành 01/08/2026. TS-07 phần TAY (7 đêm sạch trước cổng
 * P4) chỉ có giá trị khi mẫu số khác 0.
 */
import { formatDriftMarkdown, runDriftReport, saveDriftRun } from "../lib/org/drift-report";
import { db } from "../lib/db";
import "./_load-env";

const SAVE = process.argv.includes("--save");

async function main() {
  const rep = await runDriftReport();
  console.log("\n" + formatDriftMarkdown(rep) + "\n");

  if (SAVE) {
    const id = await saveDriftRun(rep, "chạy tay");
    console.log(`Đã ghi nhật ký OrgUnitDriftRun ${id}\n`);
  }

  // Mã thoát khác 0 khi có lệch → dùng được trong CI/cron mà không phải đọc log.
  if (rep.drift.length > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("❌", e);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
