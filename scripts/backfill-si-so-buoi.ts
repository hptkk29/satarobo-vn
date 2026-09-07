/**
 * scripts/backfill-si-so-buoi.ts — suy SĨ SỐ BIÊN CHẾ cho những buổi đã dạy TRƯỚC 07/09/2026.
 *
 * Từ 07/09, `completeSession` tự chốt `rosterSize` + `rosterSource = SNAPSHOT` ngay lúc hoàn tất
 * buổi. Script này chỉ lo phần QUÁ KHỨ.
 *
 * ⚠️ ĐỌC `docs/cham-cong/KE-HOACH-BACKFILL-SI-SO.md` TRƯỚC KHI CHẠY `--ghi`.
 *   Không có công thức nào đúng cho mọi dòng: đếm ghi danh thì THỪA người một chiều, đếm điểm danh
 *   thì THIẾU người một chiều với buổi trước 07/08/2026. Vì vậy script chia BA TẦNG và ghi tầng
 *   vào `rosterSource` — trộn số đo với số suy đoán vào một cột không nhãn là để người mở báo cáo
 *   tin số suy đoán như số đo.
 *
 * CHẠY:
 *   pnpm tsx scripts/backfill-si-so-buoi.ts          # ĐO, KHÔNG ghi (mặc định)
 *   pnpm tsx scripts/backfill-si-so-buoi.ts --ghi    # ghi thật — chỉ sau khi chủ dự án duyệt
 *
 * AN TOÀN:
 *  · Mặc định KHÔNG ghi. Phải có `--ghi`.
 *  · KHÔNG đụng buổi đã có `rosterSize` — số `SNAPSHOT` đo lúc dạy không bao giờ bị suy đoán đè.
 *  · KHÔNG đụng buổi chưa `COMPLETED` — buổi chưa dạy chưa có gì để chốt.
 *  · Idempotent: chạy lần 2 chỉ còn những dòng thật sự chưa có số.
 *  · Prod chỉ chạm được qua workflow GitHub (luật dự án). Chạy ĐO trước, đọc số, rồi mới quyết.
 */
// `_load-env` phải chạy TRƯỚC `_script-db` — Prisma đọc DATABASE_URL ngay lúc khởi tạo module.
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";
import { inQuyen, kiemQuyen } from "./_kiem-quyen";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "../lib/enrollment-status";

const GHI = process.argv.includes("--ghi");
const db = scriptDb();

/**
 * Mốc lưới điểm danh CHẶN lưu khi chưa đánh dấu đủ cả lớp (commit 563bb1f0).
 * Trước mốc này lưới chỉ gửi những em ĐÃ SỬA ⇒ số dòng điểm danh thiếu người một cách hệ thống,
 * và thiếu nhiều nhất đúng ở buổi đông người vắng. Không cứu được, chỉ tránh được.
 */
const MOC_DIEM_DANH_DU = new Date("2026-08-07T00:00:00+07:00");

type Tang = "FROM_ATTENDANCE" | "FROM_ENROLLMENT" | "UNKNOWN";

type KetQua = {
  sessionId: string;
  classId: string;
  ngay: Date;
  tang: Tang;
  siSo: number | null;
  /** Số của tầng còn lại khi tính được cả hai — dùng để ĐO độ lệch trên dữ liệu thật. */
  soDoiChung: number | null;
  ghiChu?: string;
};

function bac(n: number): string {
  if (n <= 0) return "0";
  if (n <= 4) return "1-4";
  if (n <= 8) return "5-8";
  if (n <= 12) return "9-12";
  return ">=13";
}

async function main() {
  // In host TRƯỚC mọi thứ: script này có chế độ ghi, và chạy nhầm DB là chuyện đã xảy ra trong
  // repo này. Thấy host lạ thì Ctrl-C.
  console.log(`[backfill-si-so] DB: ${currentDbHost()} · chế độ: ${GHI ? "GHI THẬT" : "chỉ ĐO"}`);
  inQuyen(await kiemQuyen(db), GHI);

  const buoi = await db.classSession.findMany({
    where: { status: "COMPLETED", rosterSize: null },
    select: { id: true, classId: true, date: true },
    orderBy: { date: "asc" },
  });

  console.log(`[backfill-si-so] ${buoi.length} buổi COMPLETED chưa có sĩ số.`);
  if (buoi.length === 0) {
    // 0 có thể là sự thật, mà cũng có thể là user chỉ-đọc đang bị RLS lọc sạch. Phân biệt bằng
    // tổng số buổi — nếu CẢ BẢNG cũng ra 0 trên prod thì đó không phải sự thật.
    const tongMoiBuoi = await db.classSession.count();
    if (tongMoiBuoi === 0) {
      console.log(
        "[backfill-si-so] ⚠️ Bảng ClassSession đọc ra 0 dòng. Trên prod đó KHÔNG phải sự thật —\n" +
          "        nhiều khả năng user chỉ-đọc đang bị Row Level Security lọc sạch.\n" +
          '        Xem docs/cham-cong/USER-CHI-DOC-PROD.md mục "Nếu số đo ra 0".',
      );
      return;
    }
    console.log("[backfill-si-so] Không có gì để làm.");
    return;
  }

  const ra: KetQua[] = [];

  for (const s of buoi) {
    // ── Nguồn A: dòng điểm danh của buổi, CHỈ tính em có ghi danh trong CHÍNH lớp này.
    // Vế "chính lớp này" là thứ loại khách HỌC BÙ: họ ngồi trong phòng và có dòng điểm danh,
    // nhưng biên chế của họ ở lớp khác.
    const tuDiemDanh = await db.attendance.count({
      where: {
        sessionId: s.id,
        student: { enrollments: { some: { classId: s.classId, deletedAt: null } } },
      },
    });
    const tongDongDiemDanh = await db.attendance.count({ where: { sessionId: s.id } });

    // ── Nguồn B: ghi danh của lớp tính đến ngày buổi.
    // `PENDING` bị loại (đã trỏ classId từ lúc tạo nhưng chưa từng bước vào lớp).
    // KHÔNG dùng vế `deletedAt > ngày buổi` như một mốc rời lớp — `deletedAt` của Enrollment là
    // SỔ SÁCH, gần như không bao giờ được set khi học viên nghỉ. Dùng nó là tự lừa mình rằng đã
    // lọc người đã rời, trong khi thực tế không lọc được ai.
    const tuGhiDanh = await db.enrollment.count({
      where: {
        classId: s.classId,
        deletedAt: null,
        createdAt: { lte: s.date },
        status: { in: ENROLLMENT_ACTIVE_STATUS_LIST },
      },
    });

    const duMoc = s.date.getTime() >= MOC_DIEM_DANH_DU.getTime();
    // Bẫy "dòng lẻ": duyệt đơn báo vắng của phụ huynh tạo đúng 1 dòng Attendance ở buổi CHƯA hề
    // điểm danh ⇒ ra "sĩ số = 1", nhìn vẫn hợp lệ. Không loại được bằng luật "≥2 dòng" — lớp
    // Coach 1-1 có sĩ số thật là 1. Nên chỉ nghi khi lớp rõ ràng đông hơn thế.
    const nghiDongLe = tongDongDiemDanh === 1 && tuGhiDanh > 1;

    if (duMoc && tongDongDiemDanh > 0 && !nghiDongLe) {
      ra.push({
        sessionId: s.id,
        classId: s.classId,
        ngay: s.date,
        tang: "FROM_ATTENDANCE",
        siSo: tuDiemDanh,
        soDoiChung: tuGhiDanh,
      });
    } else if (tuGhiDanh > 0) {
      ra.push({
        sessionId: s.id,
        classId: s.classId,
        ngay: s.date,
        tang: "FROM_ENROLLMENT",
        siSo: tuGhiDanh,
        soDoiChung: duMoc && tongDongDiemDanh > 0 ? tuDiemDanh : null,
        ghiChu: nghiDongLe ? "nghi dòng lẻ do đơn báo vắng" : !duMoc ? "trước mốc điểm danh đủ" : undefined,
      });
    } else {
      ra.push({
        sessionId: s.id,
        classId: s.classId,
        ngay: s.date,
        tang: "UNKNOWN",
        siSo: null,
        soDoiChung: null,
        ghiChu: "lớp không có ghi danh nào tính đến ngày buổi",
      });
    }
  }

  // ── Báo cáo ĐO ────────────────────────────────────────────────────────────────────────
  const dem = (t: Tang) => ra.filter((r) => r.tang === t).length;
  const pct = (n: number) => `${((n / ra.length) * 100).toFixed(1)}%`;
  console.log("\n── PHỦ THEO TẦNG ──");
  for (const t of ["FROM_ATTENDANCE", "FROM_ENROLLMENT", "UNKNOWN"] as Tang[]) {
    console.log(`  ${t.padEnd(16)} ${String(dem(t)).padStart(6)}  ${pct(dem(t))}`);
  }
  const truocMoc = ra.filter((r) => r.ngay.getTime() < MOC_DIEM_DANH_DU.getTime()).length;
  console.log(`\n  Buổi trước 07/08/2026: ${truocMoc} (${pct(truocMoc)}) — phần không cứu được`);

  // Số QUAN TRỌNG NHẤT: chênh lệch giữa hai nguồn ở những buổi tính được CẢ HAI. Nó đo trực tiếp
  // độ thừa của nguồn ghi danh trên dữ liệu thật, thay vì để ta suy luận.
  const caHai = ra.filter((r) => r.siSo != null && r.soDoiChung != null);
  if (caHai.length) {
    const lech = caHai.map((r) => (r.soDoiChung as number) - (r.siSo as number));
    const tb = lech.reduce((a, b) => a + b, 0) / lech.length;
    const sapXep = [...lech].sort((a, b) => a - b);
    const trungVi = sapXep[Math.floor(sapXep.length / 2)];
    console.log(`\n── CHÊNH LỆCH (ghi danh − điểm danh), ${caHai.length} buổi tính được cả hai ──`);
    console.log(`  trung bình ${tb.toFixed(2)} người · trung vị ${trungVi} · min ${sapXep[0]} · max ${sapXep[sapXep.length - 1]}`);
    console.log(`  số buổi lệch ≥ 1 người: ${lech.filter((x) => x >= 1).length} (${pct(lech.filter((x) => x >= 1).length)})`);
    console.log("  (số dương = nguồn ghi danh THỪA người, đúng như dự đoán)");
  }

  // Bậc sĩ số quyết định đơn giá PL04 ⇒ lệch một bậc là lệch tiền.
  const theoBac = new Map<string, number>();
  for (const r of ra) if (r.siSo != null) theoBac.set(bac(r.siSo), (theoBac.get(bac(r.siSo)) ?? 0) + 1);
  console.log("\n── PHÂN BỐ BẬC SĨ SỐ (bậc quyết định đơn giá PL04) ──");
  for (const b of ["0", "1-4", "5-8", "9-12", ">=13"]) {
    console.log(`  ${b.padEnd(6)} ${String(theoBac.get(b) ?? 0).padStart(6)}`);
  }

  const coGhiChu = ra.filter((r) => r.ghiChu);
  if (coGhiChu.length) {
    console.log(`\n── DÒNG CẦN LƯU Ý (${coGhiChu.length}) ──`);
    const nhom = new Map<string, number>();
    for (const r of coGhiChu) nhom.set(r.ghiChu as string, (nhom.get(r.ghiChu as string) ?? 0) + 1);
    for (const [k, v] of nhom) console.log(`  ${String(v).padStart(6)}  ${k}`);
  }

  if (!GHI) {
    console.log("\n[backfill-si-so] CHẾ ĐỘ ĐO — không ghi gì. Thêm --ghi để ghi thật.");
    console.log("[backfill-si-so] Đọc docs/cham-cong/KE-HOACH-BACKFILL-SI-SO.md §5 trước khi ghi.");
    return;
  }

  // ── GHI ───────────────────────────────────────────────────────────────────────────────
  const luc = new Date();
  let n = 0;
  for (const r of ra) {
    await db.classSession.update({
      where: { id: r.sessionId },
      // `rosterAt` = LÚC CHẠY SCRIPT, không phải ngày buổi. Đó là thời điểm con số được chốt, và
      // giữ nó là cách duy nhất về sau phân biệt "chốt lúc dạy" với "backfill tháng sau".
      data: { rosterSize: r.siSo, rosterSource: r.tang, rosterAt: luc },
    });
    n += 1;
  }
  console.log(`\n[backfill-si-so] ĐÃ GHI ${n} buổi.`);
}

main()
  .catch((e) => {
    console.error("[backfill-si-so] lỗi:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
