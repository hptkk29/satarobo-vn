/**
 * scripts/do-buoi-ket-theo-lop.ts — buổi quá hạn KHÔNG đóng được, gom theo LỚP. CHỈ ĐỌC.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO — câu hỏi mang đi hỏi Đào tạo
 *
 * Sau khi backfill đóng nhóm THOẢ, phần còn lại là buổi **không đóng được bằng bất cứ
 * đường tự động nào**: cổng tự đóng không mở (chưa điểm danh đủ sĩ số), backfill không
 * đụng tới (nó chỉ đóng nhóm THOẢ). Chúng chỉ thoát ra bằng người.
 *
 * Script trả lời đúng bốn câu để mang đi hỏi:
 *   1. thuộc bao nhiêu lớp, lớp nào;
 *   2. trạng thái lớp là gì;
 *   3. sĩ số đang học của lớp đó;
 *   4. có học viên nào TỪNG ghi danh rồi rời đi không.
 *
 * ⚠️ Dùng CHÍNH `quyetDinhTuHoanTat` để phân nhóm — không chép lại luật (luật 9). Ba chỗ
 * (cổng thật · phép đo backlog · script này) cùng một hàm.
 *
 * ⚠️ CHỈ ĐỌC. Không có chế độ ghi, không tham số nào bật ghi.
 *
 * CHẠY: pnpm tsx scripts/do-buoi-ket-theo-lop.ts
 */
// `_load-env` phải chạy TRƯỚC mọi import chạm Prisma.
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";
import { inQuyen, kiemQuyen } from "./_kiem-quyen";
import { db } from "../lib/db";
import { quyetDinhTuHoanTat } from "../lib/lms/tu-hoan-tat-buoi";
import { rosterWhere } from "../lib/enrollment-scope";
import { vnDateOnly, vnYmd } from "../lib/time/vn";

const kiemDb = scriptDb();

function tieu(s: string) {
  console.log("");
  console.log("═".repeat(96));
  console.log(s);
  console.log("═".repeat(96));
}
function dong(nhan: string, n: number | string) {
  console.log(`  ${nhan.padEnd(58)} ${String(n).padStart(8)}`);
}

async function main() {
  console.log(`DB host: ${currentDbHost() ?? "(không đọc được)"}`);
  inQuyen(await kiemQuyen(kiemDb), false);
  tieu("BUỔI QUÁ HẠN KHÔNG ĐÓNG ĐƯỢC — gom theo LỚP (chỉ đọc)");

  const homNayUtcMs = vnDateOnly(new Date()).getTime();
  const buoi = await db.classSession.findMany({
    where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
    select: { id: true, classId: true, status: true, date: true },
    orderBy: { date: "asc" },
  });
  const daQua = buoi.filter((b) => vnDateOnly(b.date).getTime() <= homNayUtcMs);
  if (buoi.length === 0) {
    console.log('\n⚠️ Không đọc được buổi nào — xem docs/cham-cong/USER-CHI-DOC-PROD.md mục "Nếu số đo ra 0".');
    return;
  }

  const classIds = [...new Set(daQua.map((b) => b.classId))];
  const [ghiDanhDangHoc, diemDanh] = await Promise.all([
    db.enrollment.findMany({
      where: { classId: { in: classIds }, ...rosterWhere("dang-hoc") },
      select: { classId: true, studentId: true },
    }),
    db.attendance.findMany({
      where: { sessionId: { in: daQua.map((b) => b.id) } },
      select: { sessionId: true, studentId: true },
    }),
  ]);
  const siSo = new Map<string, string[]>();
  for (const e of ghiDanhDangHoc) {
    const a = siSo.get(e.classId) ?? [];
    a.push(e.studentId);
    siSo.set(e.classId, a);
  }
  const dau = new Map<string, string[]>();
  for (const a of diemDanh) {
    const x = dau.get(a.sessionId) ?? [];
    x.push(a.studentId);
    dau.set(a.sessionId, x);
  }

  // Phân nhóm bằng CHÍNH hàm của cổng thật.
  const theoLyDo = new Map<string, { id: string; classId: string; date: Date }[]>();
  for (const b of daQua) {
    const qd = quyetDinhTuHoanTat({
      trangThaiBuoi: b.status,
      ngayBuoi: b.date,
      homNayUtcMs,
      siSoStudentIds: siSo.get(b.classId) ?? [],
      daDanhDauStudentIds: dau.get(b.id) ?? [],
    });
    const k = qd.tuHoanTat ? "THOA" : qd.lyDo;
    const a = theoLyDo.get(k) ?? [];
    a.push({ id: b.id, classId: b.classId, date: b.date });
    theoLyDo.set(k, a);
  }

  dong("buổi chưa chốt", buoi.length);
  dong("  trong đó ĐÃ QUA NGÀY", daQua.length);
  for (const [k, v] of [...theoLyDo.entries()].sort((a, b) => b[1].length - a[1].length)) {
    dong(`  nhóm ${k}`, v.length);
  }

  // ── Chi tiết theo lớp, cho MỖI nhóm không đóng được ────────────────────────
  //
  // In cả nhóm RỖNG và nói rõ nó rỗng: "không có dòng nào" là một câu trả lời, và nó khác
  // hẳn "chưa đo" (luật 1). Nhóm SI_SO_RONG hay bị hỏi tới nên phải nói ra kể cả khi = 0.
  for (const nhom of ["DIEM_DANH_THIEU", "SI_SO_RONG", "CHUA_TOI_NGAY", "DA_XONG"]) {
    const ds = theoLyDo.get(nhom) ?? [];
    tieu(`Nhóm ${nhom} — ${ds.length} buổi`);
    if (ds.length === 0) {
      console.log("  KHÔNG có buổi nào thuộc nhóm này. (Đây là số ĐO, không phải chưa đo.)");
      continue;
    }

    const ids = [...new Set(ds.map((x) => x.classId))];
    const lop = await db.class.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, name: true, status: true, centerId: true,
        startDate: true, endDate: true,
        center: { select: { code: true } },
      },
      orderBy: { name: "asc" },
    });
    // MỌI ghi danh của các lớp này, kể cả đã rời — để trả lời "có ai từng học rồi đi không".
    const moiGhiDanh = await db.enrollment.findMany({
      where: { classId: { in: ids } },
      select: { classId: true, studentId: true, status: true, deletedAt: true },
    });
    const DANG_HOC = new Set(ghiDanhDangHoc.map((e) => `${e.classId}|${e.studentId}`));

    console.log(`  ${ds.length} buổi · ${ids.length} lớp`);
    console.log("");
    console.log(
      `  ${"lớp".padEnd(30)}${"cơ sở".padEnd(8)}${"trạng thái".padEnd(12)}` +
        `${"buổi kẹt".padStart(9)}${"đang học".padStart(10)}${"đã rời".padStart(8)}  khoảng ngày buổi kẹt`,
    );
    for (const c of lop) {
      const cua = ds.filter((x) => x.classId === c.id);
      const gd = moiGhiDanh.filter((e) => e.classId === c.id);
      const dangHoc = gd.filter((e) => DANG_HOC.has(`${e.classId}|${e.studentId}`)).length;
      const daRoi = gd.length - dangHoc;
      const ngay = cua.map((x) => vnYmd(x.date)).sort();
      console.log(
        `  ${c.name.slice(0, 28).padEnd(30)}${(c.center?.code ?? "—").padEnd(8)}${c.status.padEnd(12)}` +
          `${String(cua.length).padStart(9)}${String(dangHoc).padStart(10)}${String(daRoi).padStart(8)}` +
          `  ${ngay[0]} → ${ngay[ngay.length - 1]}`,
      );
    }

    // Tổng hợp — thứ mang đi hỏi Đào tạo.
    const lopKhongCoAiDangHoc = lop.filter((c) => (siSo.get(c.id) ?? []).length === 0).length;
    const lopDaKetThuc = lop.filter((c) => c.status !== "ACTIVE").length;
    console.log("");
    dong("lớp KHÔNG còn ai đang học", lopKhongCoAiDangHoc);
    dong("lớp KHÔNG còn ở trạng thái ACTIVE", lopDaKetThuc);
    dong("lớp có người TỪNG ghi danh rồi rời đi", lop.filter((c) => {
      const gd = moiGhiDanh.filter((e) => e.classId === c.id);
      return gd.some((e) => !DANG_HOC.has(`${e.classId}|${e.studentId}`));
    }).length);
  }

  console.log("");
  console.log("Toàn bộ phép đo trên là SELECT. Không dòng nào bị ghi.");
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
