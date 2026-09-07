/**
 * scripts/do-backlog-buoi-chua-chot.ts — ĐO backlog buổi đã qua ngày mà chưa chốt.
 *
 * CHỈ ĐỌC. Không có chế độ ghi, không tham số nào bật ghi.
 *
 * ── Câu hỏi nó trả lời ──────────────────────────────────────────────────────────
 *
 * Cổng tự đóng buổi (`#TU-HOAN-TAT`) live từ 04/09/2026 nhưng hỏng hai chỗ, vá ngày
 * 07–08/09 (`4df347b4` so ngày sai · `a94e5aa7` so số đếm thay vì giao tập). Cổng chỉ
 * chạy khi giáo viên LƯU điểm danh, nên backlog buổi cũ nằm im mãi.
 *
 * Trước khi bàn "có đóng hàng loạt không", phải biết: trong đám buổi đang treo, bao
 * nhiêu buổi THOẢ CỔNG ĐÃ SỬA? Script này đếm đúng câu đó, tách theo tháng.
 *
 *   • phần lớn THOẢ   → một script chạy tay đóng đúng nhóm đó là hợp lý;
 *   • phần lớn KHÔNG  → chúng chưa từng được điểm danh đủ, đóng chúng là BỊA DỮ LIỆU.
 *
 * ⚠️ Dùng CHÍNH `quyetDinhTuHoanTat` — không chép lại luật. Số đo mà lệch với cổng thật
 * thì nó chỉ là một ý kiến.
 *
 * CHẠY:
 *   pnpm tsx scripts/do-backlog-buoi-chua-chot.ts
 */
// `_load-env` phải chạy TRƯỚC `_script-db` — Prisma đọc DATABASE_URL ngay lúc khởi tạo.
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";
import { inQuyen, kiemQuyen } from "./_kiem-quyen";
import { quyetDinhTuHoanTat } from "../lib/lms/tu-hoan-tat-buoi";
import { rosterWhere } from "../lib/enrollment-scope";
import { vnDateOnly, vnYmd } from "../lib/time/vn";

const db = scriptDb();

type LyDo = "THOA" | "DIEM_DANH_THIEU" | "SI_SO_RONG" | "CHUA_TOI_NGAY" | "DA_XONG";

function dong(nhan: string, n: number | string) {
  console.log(`  ${nhan.padEnd(46)} ${String(n).padStart(8)}`);
}

async function main() {
  console.log(`[backlog] DB: ${currentDbHost()} · CHỈ ĐỌC`);
  inQuyen(await kiemQuyen(db), false);

  const homNayUtcMs = vnDateOnly(new Date()).getTime();

  // Buổi ĐANG TREO: chưa chốt, chưa huỷ, đã tới/qua ngày. Lấy cả IN_PROGRESS vì cổng
  // nhận cả hai trạng thái đó.
  const buoi = await db.classSession.findMany({
    where: {
      status: { in: ["SCHEDULED", "IN_PROGRESS"] },
      class: { deletedAt: null },
    },
    select: { id: true, classId: true, status: true, date: true },
    orderBy: { date: "asc" },
  });
  const daQua = buoi.filter((b) => vnDateOnly(b.date).getTime() <= homNayUtcMs);

  if (buoi.length === 0) {
    console.log(
      "\n⚠️ Không đọc được buổi nào. Nếu đây là prod thì con số 0 này KHÔNG phải sự thật —\n" +
        '   xem docs/cham-cong/USER-CHI-DOC-PROD.md mục "Nếu số đo ra 0".',
    );
    return;
  }

  console.log(`[backlog] ${buoi.length} buổi chưa chốt · ${daQua.length} buổi ĐÃ QUA NGÀY\n`);
  if (daQua.length === 0) return;

  // Ba truy vấn gộp, không N+1.
  const classIds = [...new Set(daQua.map((b) => b.classId))];
  const sessionIds = daQua.map((b) => b.id);
  const [ghiDanh, diemDanh] = await Promise.all([
    db.enrollment.findMany({
      where: { classId: { in: classIds }, ...rosterWhere("dang-hoc") },
      select: { classId: true, studentId: true },
    }),
    db.attendance.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { sessionId: true, studentId: true },
    }),
  ]);

  const siSoTheoLop = new Map<string, string[]>();
  for (const e of ghiDanh) {
    const arr = siSoTheoLop.get(e.classId) ?? [];
    arr.push(e.studentId);
    siSoTheoLop.set(e.classId, arr);
  }
  const dauTheoBuoi = new Map<string, string[]>();
  for (const a of diemDanh) {
    const arr = dauTheoBuoi.get(a.sessionId) ?? [];
    arr.push(a.studentId);
    dauTheoBuoi.set(a.sessionId, arr);
  }

  // thang -> lyDo -> số buổi
  const theoThang = new Map<string, Map<LyDo, number>>();
  const tong = new Map<LyDo, number>();
  const themVao = (thang: string, ly: LyDo) => {
    const m = theoThang.get(thang) ?? new Map<LyDo, number>();
    m.set(ly, (m.get(ly) ?? 0) + 1);
    theoThang.set(thang, m);
    tong.set(ly, (tong.get(ly) ?? 0) + 1);
  };

  for (const b of daQua) {
    const qd = quyetDinhTuHoanTat({
      trangThaiBuoi: b.status,
      ngayBuoi: b.date,
      homNayUtcMs,
      siSoStudentIds: siSoTheoLop.get(b.classId) ?? [],
      daDanhDauStudentIds: dauTheoBuoi.get(b.id) ?? [],
    });
    themVao(vnYmd(b.date).slice(0, 7), qd.tuHoanTat ? "THOA" : qd.lyDo);
  }

  const COT: LyDo[] = ["THOA", "DIEM_DANH_THIEU", "SI_SO_RONG", "CHUA_TOI_NGAY", "DA_XONG"];

  console.log("══ THOẢ CỔNG ĐÃ SỬA hay không, theo tháng (giờ VN) ══");
  console.log(
    `  ${"tháng".padEnd(9)}${COT.map((c) => c.padStart(17)).join("")}${"tổng".padStart(9)}`,
  );
  for (const thang of [...theoThang.keys()].sort()) {
    const m = theoThang.get(thang)!;
    const t = COT.reduce((s, c) => s + (m.get(c) ?? 0), 0);
    console.log(
      `  ${thang.padEnd(9)}${COT.map((c) => String(m.get(c) ?? 0).padStart(17)).join("")}${String(t).padStart(9)}`,
    );
  }

  console.log("\n══ TỔNG ══");
  for (const c of COT) dong(c, tong.get(c) ?? 0);

  const thoa = tong.get("THOA") ?? 0;
  const pct = daQua.length > 0 ? ((thoa / daQua.length) * 100).toFixed(1) : "0.0";
  console.log(
    `\n  ${thoa}/${daQua.length} buổi (${pct}%) sẽ đóng được nếu chạy lại cổng đã sửa.`,
  );
  console.log(
    "  Phần còn lại KHÔNG được đóng: chúng chưa từng điểm danh đủ sĩ số, đóng là bịa dữ liệu.",
  );
  console.log(
    "\n  ⚠️ SI_SO_RONG = lớp không còn ai đang học (khoá đã kết thúc / chưa xếp học viên).\n" +
      "     Đây KHÔNG phải buổi 'còn nợ việc' — đừng gộp nó vào nhóm cần xử lý.",
  );

  console.log("\n[backlog] Xong. Không ghi gì.");
}

main()
  .catch((e) => {
    console.error("[backlog] lỗi:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
