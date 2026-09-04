/**
 * scripts/hoan-tien-do-lech-cong-no.ts — HT · BƯỚC 1 "ĐO TRƯỚC" (27/08/2026).
 *
 * CHỈ ĐỌC. Không ghi một dòng nào. Không có cờ `--apply` và sẽ không bao giờ có.
 *
 * Việc duy nhất của nó: nói ra TRƯỚC con số mà công nợ và cổng phụ huynh sẽ đổi khi bản
 * vá "hoàn tiền vào thực thu" lên prod, để báo cho kế toán / quản lý cơ sở / phụ huynh
 * thay vì để họ tự phát hiện bằng cách hoảng.
 *
 *   pnpm tsx scripts/hoan-tien-do-lech-cong-no.ts               # chỉ ghi danh ĐÃ HOÀN
 *   pnpm tsx scripts/hoan-tien-do-lech-cong-no.ts --all         # mọi ghi danh đã chốt giá
 *   pnpm tsx scripts/hoan-tien-do-lech-cong-no.ts --limit 300   # nới trần in (mặc định 100)
 *   pnpm tsx scripts/hoan-tien-do-lech-cong-no.ts --csv         # in CSV để dán vào bảng tính
 *
 * ── Hai công thức đang so ──
 * • CÁCH CŨ (thứ phụ huynh ĐANG nhìn thấy): `Σ amount(Payment accountantStatus=CONFIRMED)`
 *   — đúng bộ lọc của `lib/finance/debt.ts`, `lib/portal/billing.ts`,
 *   `lib/portal/billing-student.ts` và `lib/portal/dashboard.ts` trước bản vá. Bút toán
 *   hoàn (REFUNDED, số ÂM) và bản điều chỉnh (ADJUSTED) đều rơi ra ngoài phép cộng.
 * • CÁCH ĐÚNG: `tinhThucThu` / `computeEnrollmentDebt` — CHÍNH các hàm sản phẩm, import
 *   thẳng từ `lib/finance/`, KHÔNG chép lại công thức. Sửa công thức mà quên script này
 *   là không thể: nó đi cùng một đường.
 *
 * ⚠️ CÁCH ĐỌC SAI THƯỜNG GẶP:
 *   1. "0 dòng lệch" KHÔNG có nghĩa là lỗi không tồn tại — chỉ có nghĩa là **chưa ai
 *      bấm hoàn tiền**. Lỗ vẫn còn nguyên, và nó sẽ mở ra ở lần hoàn đầu tiên.
 *   2. ĐỪNG hứa trước chiều thay đổi. Tiền lệ B-02 (`lib/finance/thuc-thu.ts` §B.6.8):
 *      thông báo viết "số sẽ TỤT", đo xong mới thấy có màn NHẢY LÊN, phải soạn lại.
 *      Đọc số THẬT ở đây rồi mới viết câu chữ.
 *   3. Dòng "hoàn mồ côi" ở cuối là bút toán hoàn KHÔNG gắn ghi danh nào — nó không lọt
 *      vào bảng trên, nhưng vẫn đang làm phồng sổ ở chỗ khác.
 *
 * Người chạy: NGƯỜI VẬN HÀNH, trên máy có `.env`/`.env.local` trỏ đúng DB muốn đo.
 * Agent KHÔNG chạy script này trên DB thật.
 */
import "./_load-env";
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";
import {
  doLechGhiDanh,
  tomTatDoLech,
  type DongDoLech,
  type GhiDanhCanDo,
} from "../lib/finance/hoan-tien-do-lech";

const db = scriptDb();

const PAGE = 200;

const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;
const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s.padEnd(n));
const padL = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s.padStart(n));

/** Nạp và đo — trả về mảng dòng đã so lệch. */
async function nap(tatCa: boolean): Promise<DongDoLech[]> {
  const rows: DongDoLech[] = [];
  let skip = 0;

  for (;;) {
    const enrollments = await db.enrollment.findMany({
      where: {
        deletedAt: null,
        finalPrice: { not: null },
        // Mặc định CHỈ những ghi danh dính tới hoàn tiền — đúng phạm vi câu hỏi
        // "liệt kê mọi trường hợp đã hoàn tiền từ trước tới nay".
        ...(tatCa
          ? {}
          : {
              OR: [
                { payments: { some: { accountantStatus: "REFUNDED", deletedAt: null } } },
                { payments: { some: { accountantStatus: "ADJUSTED", deletedAt: null } } },
                { refundRequests: { some: {} } },
              ],
            }),
      },
      orderBy: { createdAt: "asc" },
      skip,
      take: PAGE,
      select: {
        id: true,
        finalPrice: true,
        tuition: true,
        status: true,
        student: { select: { name: true } },
        course: { select: { name: true } },
        class: { select: { name: true, center: { select: { name: true } } } },
        payments: {
          where: { deletedAt: null },
          select: { id: true, amount: true, accountantStatus: true, adjustmentOfId: true },
        },
        refundRequests: { select: { status: true, approvedAmount: true } },
      },
    });
    if (enrollments.length === 0) break;

    for (const e of enrollments) {
      const hoanDaDuyet = e.refundRequests
        .filter((r) => r.status === "APPROVED" || r.status === "PAID")
        .reduce((s, r) => s + (r.approvedAmount ?? 0), 0);

      const canDo: GhiDanhCanDo = {
        enrollmentId: e.id,
        studentName: e.student?.name ?? null,
        courseName: e.course?.name ?? null,
        className: e.class?.name ?? null,
        centerName: e.class?.center?.name ?? null,
        enrollmentStatus: e.status,
        finalPrice: e.finalPrice ?? e.tuition ?? 0,
        butToan: e.payments,
        hoanDaDuyet,
        soDeXuatHoan: e.refundRequests.length,
      };
      rows.push(doLechGhiDanh(canDo));
    }

    skip += enrollments.length;
    if (enrollments.length < PAGE) break;
  }

  return rows;
}

function inBang(rows: DongDoLech[], limit: number): void {
  console.log(
    `${pad("HỌC VIÊN", 22)} ${pad("LỚP", 16)} ${pad("CƠ SỞ", 10)} ${pad("T.THÁI", 12)} ` +
      `${padL("ĐÃ THU (CŨ)", 15)} ${padL("ĐÃ THU (ĐÚNG)", 15)} ${padL("CHÊNH", 14)} ` +
      `${padL("NỢ CŨ", 14)} ${padL("NỢ MỚI", 14)} ${padL("SỐ LẦN HOÀN", 12)}  CẢNH BÁO`,
  );
  console.log("─".repeat(190));
  for (const r of rows.slice(0, limit)) {
    console.log(
      `${pad(r.studentName ?? "(không tên)", 22)} ${pad(r.className ?? "—", 16)} ` +
        `${pad(r.centerName ?? "—", 10)} ${pad(r.enrollmentStatus ?? "—", 12)} ` +
        `${padL(vnd(r.daThuCachCu), 15)} ${padL(vnd(r.daThuCachDung), 15)} ` +
        `${padL(vnd(r.chenhLechDaThu), 14)} ${padL(vnd(r.congNoCachCu), 14)} ` +
        `${padL(vnd(r.congNoCachDung), 14)} ${padL(String(r.soLanHoan), 12)}  ` +
        (r.canhBao.join(" · ") || "—"),
    );
  }
  if (rows.length > limit) {
    console.log(`… còn ${rows.length - limit} dòng (dùng --limit N hoặc --csv).`);
  }
}

function inCsv(rows: DongDoLech[]): void {
  const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  console.log(
    [
      "maGhiDanh",
      "hocVien",
      "khoaHoc",
      "lop",
      "coSo",
      "trangThaiGhiDanh",
      "hocPhi",
      "daThuCachCu",
      "daThuCachDung",
      "chenhLechDaThu",
      "congNoCachCu",
      "congNoCachDung",
      "soLanHoan",
      "tongDaHoan",
      "hoanDaDuyet",
      "hoanChuaGhiSo",
      "soDeXuatHoan",
      "canhBao",
    ].join(","),
  );
  for (const r of rows) {
    console.log(
      [
        esc(r.enrollmentId),
        esc(r.studentName),
        esc(r.courseName),
        esc(r.className),
        esc(r.centerName),
        esc(r.enrollmentStatus),
        r.finalPrice,
        r.daThuCachCu,
        r.daThuCachDung,
        r.chenhLechDaThu,
        r.congNoCachCu,
        r.congNoCachDung,
        r.soLanHoan,
        r.tongDaHoan,
        r.hoanDaDuyet,
        r.hoanChuaGhiSo,
        r.soDeXuatHoan,
        esc(r.canhBao.join(" · ")),
      ].join(","),
    );
  }
}

async function main(): Promise<void> {
  const tatCa = process.argv.includes("--all");
  const csv = process.argv.includes("--csv");
  const iLimit = process.argv.indexOf("--limit");
  const limit = iLimit >= 0 ? Number(process.argv[iLimit + 1]) || 100 : 100;

  if (!csv) {
    console.log(`\n═══ ĐO LỆCH HOÀN TIỀN → CÔNG NỢ & CỔNG PHỤ HUYNH (chỉ đọc) ═══`);
    console.log(`DB đang trỏ tới: ${currentDbHost()}`);
    console.log(`CHỈ ĐỌC — script này không ghi gì.`);
    console.log(
      tatCa
        ? `Phạm vi: MỌI ghi danh đã chốt giá (--all).\n`
        : `Phạm vi: ghi danh có hoàn / điều chỉnh / đề xuất hoàn. Dùng --all để xem tất cả.\n`,
    );
  }

  const rows = await nap(tatCa);
  // Lệch nhiều nhất lên đầu — người đọc chỉ có thời gian cho vài dòng đầu.
  rows.sort((a, b) => Math.abs(b.chenhLechDaThu) - Math.abs(a.chenhLechDaThu));

  if (csv) {
    inCsv(rows);
    return;
  }

  if (rows.length === 0) {
    console.log("Không có ghi danh nào dính hoàn tiền / điều chỉnh.");
    console.log(
      "⚠️ ĐỪNG đọc thành 'lỗi không tồn tại'. Nó chỉ có nghĩa là CHƯA AI bấm hoàn tiền —\n" +
        "   lỗ vẫn nguyên và sẽ mở ra ở lần hoàn đầu tiên.\n",
    );
  } else {
    inBang(rows, limit);
  }

  const t = tomTatDoLech(rows);
  console.log(`\n── Tổng kết ──`);
  console.log(`Ghi danh quét:                 ${t.soGhiDanh}`);
  console.log(`Ghi danh ĐỔI SỐ sau khi vá:    ${t.soGhiDanhLech}`);
  console.log(`Σ đã thu — cách CŨ (PH đang thấy): ${vnd(t.tongDaThuCachCu)}`);
  console.log(`Σ đã thu — cách ĐÚNG:              ${vnd(t.tongDaThuCachDung)}`);
  console.log(`Σ chênh lệch (âm = PH thấy giảm):  ${vnd(t.tongChenhLech)}`);
  console.log(`Σ công nợ — cách CŨ:               ${vnd(t.tongCongNoCachCu)}`);
  console.log(`Σ công nợ — cách ĐÚNG:             ${vnd(t.tongCongNoCachDung)}`);
  console.log(`Σ đã hoàn (bút toán âm):           ${vnd(t.tongDaHoan)}`);

  const canhBao = Object.entries(t.demCanhBao).sort((a, b) => b[1] - a[1]);
  if (canhBao.length) {
    console.log(`\n── Cảnh báo (đếm theo ghi danh) ──`);
    for (const [ten, so] of canhBao) console.log(`  ${padL(String(so), 5)}  ${ten}`);
  }

  // Bút toán hoàn KHÔNG gắn ghi danh — không lọt vào bảng trên nhưng vẫn có thật.
  const hoanMoCoi = await db.payment.aggregate({
    where: { accountantStatus: "REFUNDED", deletedAt: null, enrollmentId: null },
    _sum: { amount: true },
    _count: true,
  });
  if (hoanMoCoi._count > 0) {
    console.log(
      `\n⚠️ ${hoanMoCoi._count} bút toán hoàn KHÔNG gắn ghi danh ` +
        `(Σ ${vnd(hoanMoCoi._sum.amount ?? 0)}) — không nằm trong bảng trên. ` +
        `Chúng không đụng cổng phụ huynh nhưng vẫn nằm trong sổ.`,
    );
  }

  console.log(
    `\nBƯỚC TIẾP: đọc số thật ở trên RỒI mới soạn thông báo. ` +
      `Đừng hứa trước là số sẽ tăng hay giảm.\n`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
