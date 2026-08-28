// scripts/rescale-trial-rubric-10.ts — đổi phiếu trải nghiệm ĐÃ CHẤM từ thang 8.0 sang 10.0.
//
// VÌ SAO CẦN. `RUBRIC_MAX` đổi 8 → 10 ngày 27/08. Phiếu PDF in "totalScore / RUBRIC_MAX"
// và xếp loại tính lại lúc HIỂN THỊ, nên bản ghi cũ sai theo HAI hướng cùng lúc: một em
// đạt tuyệt đối ngày hôm qua nay in ra "8.0 / 10.0", và ngưỡng mới (8/6/4) đọc con số
// cũ thành xếp loại thấp hơn thực tế. Không có thông báo lỗi nào — chỉ là phụ huynh
// nhận một tờ phiếu nói sai về con mình.
//
// CÁCH QUY ĐỔI: theo VỊ TRÍ MỨC, không nhân hệ số. Mỗi tiêu chí có đúng 3 mức
// [tối đa, một nửa, 0]; script tra điểm cũ nằm ở mức thứ mấy rồi lấy điểm MỚI của đúng
// mức đó. Nhân 1.25 sẽ ra 1.875 / 0.9375 — không phải giá trị hợp lệ của bộ mới, và
// action lưu sẽ từ chối ở lần giáo viên sửa phiếu tiếp theo.
//
// IDEMPOTENT: chỉ đổi giá trị TRÙNG KHỚP một mức của thang CŨ. Chạy lần hai thì điểm
// đã là giá trị mới (không nằm trong thang cũ, trừ hai tiêu chí vốn không đổi) nên
// không có gì để đổi nữa.
//
// CHẠY:
//   pnpm exec tsx scripts/rescale-trial-rubric-10.ts --dry-run   # xem trước, KHÔNG ghi
//   pnpm exec tsx scripts/rescale-trial-rubric-10.ts             # ghi thật
//
// ⚠️ Ép `DATABASE_URL` = `DIRECT_URL` (session pooler :5432): PrismaClient trần chạy
// qua transaction pooler :6543 sẽ đâm `42P05 prepared statement "s0" already exists`.
import { PrismaClient } from "@prisma/client";
import { RUBRIC_CRITERIA, computeTotal, rankOf } from "@/lib/trial/rubric";

const db = new PrismaClient();
const DRY = process.argv.includes("--dry-run");

/** Thang CŨ (8.0) — chép cứng vì `lib/trial/rubric.ts` nay đã là thang mới. */
const THANG_CU: Record<string, number[]> = {
  focus: [1.5, 0.75, 0],
  interact: [1.5, 0.75, 0],
  keyboard: [1, 0.5, 0],
  experience: [1, 0.5, 0],
  absorb: [1.5, 0.75, 0],
  logic: [1.5, 0.75, 0],
};

/** Thang MỚI theo đúng thứ tự mức, đọc thẳng từ nguồn sự thật. */
const THANG_MOI: Record<string, number[]> = Object.fromEntries(
  RUBRIC_CRITERIA.map((c) => [c.id, c.levels.map((l) => l.points)]),
);

/** So sánh số thực an toàn — điểm là bội 0.25 nên sai số float vẫn có thể chen vào. */
function bang(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

/** Trả điểm mới, hoặc `null` nếu giá trị không khớp mức nào của thang cũ. */
function quyDoi(criterionId: string, diemCu: number): number | null {
  const cu = THANG_CU[criterionId];
  const moi = THANG_MOI[criterionId];
  if (!cu || !moi) return null;
  const i = cu.findIndex((p) => bang(p, diemCu));
  return i >= 0 ? (moi[i] ?? null) : null;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("Thiếu DATABASE_URL");
  console.log(
    `\n  Đích: ${(() => {
      try {
        return new URL(url).host;
      } catch {
        return "(không đọc được)";
      }
    })()}${DRY ? "   [XEM TRƯỚC — không ghi]" : ""}`,
  );

  const rows = await db.trialRubricEval.findMany({
    select: { id: true, scores: true, totalScore: true, rank: true },
  });
  console.log(`  Phiếu đã chấm: ${rows.length}`);

  let doi = 0;
  let boQua = 0;
  let laKhongKhop = 0;

  for (const r of rows) {
    const cu = (r.scores ?? {}) as Record<string, number>;
    const moi: Record<string, number> = {};
    let coDoi = false;
    let coLa = false;

    for (const c of RUBRIC_CRITERIA) {
      const d = cu[c.id];
      if (typeof d !== "number") continue;
      const q = quyDoi(c.id, d);
      if (q === null) {
        // Giá trị không thuộc thang cũ = phiếu đã ở thang mới (chạy lại), hoặc dữ liệu
        // lạ. Cả hai trường hợp đều GIỮ NGUYÊN — đoán bừa là ghi đè điểm thật.
        moi[c.id] = d;
        coLa = true;
        continue;
      }
      moi[c.id] = q;
      if (!bang(q, d)) coDoi = true;
    }

    if (coLa) laKhongKhop++;
    if (!coDoi) {
      boQua++;
      continue;
    }

    const tong = computeTotal(moi);
    const xep = rankOf(tong).label;
    doi++;
    if (rows.length <= 20 || doi <= 5) {
      console.log(
        `    ${r.id.slice(0, 10)}…  ${r.totalScore} (${r.rank})  →  ${tong} (${xep})`,
      );
    }
    if (DRY) continue;
    await db.trialRubricEval.update({
      where: { id: r.id },
      data: { scores: moi, totalScore: tong, rank: xep },
    });
  }

  console.log(
    `\n  ${DRY ? "[XEM TRƯỚC] " : ""}Đổi ${doi} phiếu · giữ nguyên ${boQua}` +
      (laKhongKhop ? ` · ${laKhongKhop} phiếu có điểm ngoài thang cũ (giữ nguyên)` : "") +
      "\n",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
