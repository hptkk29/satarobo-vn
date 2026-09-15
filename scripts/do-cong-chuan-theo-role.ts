/**
 * scripts/do-cong-chuan-theo-role.ts — CÔNG CHUẨN đang là gì trên prod, và
 * KHOÁ nào chia người ra được. CHỈ ĐỌC.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO — mục 4 yêu cầu "công chuẩn THEO ROLE", nhưng chưa ai đo "role" là cột nào
 *
 * Công chuẩn là MẪU SỐ của hệ số công ⇒ chạm lương cơ bản. Trước khi thêm một chiều
 * mới vào bảng chạm lương, phải biết ba thứ:
 *
 *   1. Hôm nay công chuẩn đang được đặt bằng gì, cho từng kỳ (số + ghi chú + ai sửa).
 *   2. Người trong kỳ chia theo khoá nào thì ĐỦ — mỗi khoá ứng viên phủ bao nhiêu
 *      phần trăm, và có bao nhiêu người rơi ra ngoài (`null`).
 *   3. Khoá ấy có ĐƠN TRỊ không. Vai RBAC KHÔNG đơn trị: `UserOrgRole` là (người ×
 *      đơn vị × vai), một người mang nhiều vai là chuyện thường. Một người hai vai thì
 *      "công chuẩn theo vai" không có câu trả lời — trừ khi có luật phá hoà, mà luật
 *      phá hoà cho một con số chạm lương là thứ phải CHỌN, không phải đoán.
 *
 * ⚠️ Đây đúng hình dạng luật 5: "một tập dựng cho mục đích A đem phục vụ mục đích B".
 * `UserOrgRole` dựng cho QUYỀN. Lấy nó làm khoá LƯƠNG là lặp lại lỗi `assignedClassIds`
 * (đúng cho quyền, sai cho thước đo công — 76 buổi của trợ giảng, prod 08/09).
 * Phép đo này để chọn khoá bằng SỐ, không bằng cảm giác.
 *
 * ⚠️ CHỈ ĐỌC. Không tham số nào bật ghi.
 * ⚠️ KHÔNG in họ tên, email, `actorName` (repo PUBLIC — log Actions ai cũng đọc được;
 *    xem `docs/cham-cong/VE-TEN-THAT-TRONG-LOG-ACTIONS.md`). Chỉ in ĐẾM và mã/enum.
 *
 * CHẠY: pnpm tsx scripts/do-cong-chuan-theo-role.ts
 */
// `_load-env` phải chạy TRƯỚC mọi import chạm Prisma.
import { currentDbHost } from "./_load-env";
import { scriptDb } from "./_script-db";
import { inQuyen, kiemQuyen } from "./_kiem-quyen";
import { db } from "../lib/db";

const kiemDb = scriptDb();

function tieu(s: string) {
  console.log("");
  console.log("═".repeat(96));
  console.log(s);
  console.log("═".repeat(96));
}
function dong(nhan: string, n: number | string) {
  console.log(`  ${nhan.padEnd(62)} ${String(n).padStart(8)}`);
}

/** Đếm theo khoá, trả về danh sách đã sắp giảm dần. `null` gom vào nhãn riêng. */
function gom<T>(items: T[], khoa: (x: T) => string | null): [string, number][] {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = khoa(it) ?? "(null — KHÔNG phân loại được)";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

async function main() {
  console.log(`DB host: ${currentDbHost() ?? "(không đọc được)"}`);
  inQuyen(await kiemQuyen(kiemDb), false);

  // ── 1. CÔNG CHUẨN đang đặt bằng gì ────────────────────────────────────────
  //
  // `standardUnits` là cột trên `AttendancePeriod`, khoá `@@unique([centerId, periodKey])`
  // ⇒ MỘT số cho cả kỳ × cơ sở, không có chiều người nào. Bảng dưới là toàn bộ chiều
  // đang tồn tại — nhìn nó là thấy ngay thứ mục 4 muốn thêm chưa có chỗ nào để ở.
  const kyCong = await db.attendancePeriod.findMany({
    select: {
      centerId: true,
      periodKey: true,
      status: true,
      standardUnits: true,
      standardUnitsNote: true,
      lockedAt: true,
    },
    orderBy: [{ periodKey: "desc" }, { centerId: "asc" }],
  });

  tieu("1. KỲ CÔNG trên prod — công chuẩn hiện đặt bằng gì");
  dong("Số kỳ công", kyCong.length);
  if (kyCong.length === 0) {
    console.log("  (Chưa kỳ nào. Số dưới đây vẫn đo được — chúng nói về NGƯỜI, không về kỳ.)");
  }
  for (const k of kyCong) {
    console.log(
      `  ${k.periodKey}  cơ sở=${k.centerId.padEnd(10)} ${String(k.status).padEnd(7)}` +
        ` công chuẩn=${k.standardUnits ?? "— (rơi về công thức)"}` +
        ` ghi chú=${k.standardUnitsNote ? `"${k.standardUnitsNote}"` : "KHÔNG CÓ"}`,
    );
  }
  const coNote = kyCong.filter((k) => k.standardUnitsNote).length;
  const daDat = kyCong.filter((k) => k.standardUnits != null).length;
  dong("Kỳ có standardUnits khác null (đã ghi số)", daDat);
  dong("Kỳ có ghi chú 'vì sao'", coNote);
  console.log(
    `  ⓘ Hôm nay ô ghi chú là \`.optional()\` trong \`setStandardUnitsAction\` ⇒ "vì sao"` +
      ` KHÔNG bắt buộc. Con số ${coNote}/${kyCong.length} ở trên là hệ quả đo được của điều đó.`,
  );

  // ── 2. AI ĐÃ TỪNG SỬA công chuẩn ──────────────────────────────────────────
  //
  // Audit ĐÃ có sẵn (`writeAudit`, action `SET_STANDARD_UNITS`, kèm old/new). Câu hỏi
  // còn lại của mục 4 không phải "có audit không" mà "audit có ghi VÌ SAO không" —
  // `reason` lấy từ `note`, và `note` đang không bắt buộc.
  const audit = await db.auditLog.findMany({
    where: { action: "SET_STANDARD_UNITS" },
    select: { entityId: true, oldValues: true, newValues: true, reason: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  tieu("2. AUDIT sửa công chuẩn (action = SET_STANDARD_UNITS) — 50 dòng gần nhất");
  dong("Số dòng audit", audit.length);
  dong("Dòng CÓ lý do (reason khác rỗng)", audit.filter((a) => a.reason).length);
  dong("Dòng KHÔNG có lý do", audit.filter((a) => !a.reason).length);
  for (const a of audit.slice(0, 20)) {
    // KHÔNG in `actorName` — nó là tên thật.
    console.log(
      `  ${a.createdAt.toISOString().slice(0, 16)}  kỳ=${a.entityId}` +
        `  ${JSON.stringify(a.oldValues)} → ${JSON.stringify(a.newValues)}` +
        `  lý do=${a.reason ? `"${a.reason}"` : "KHÔNG"}`,
    );
  }

  // ── 3. NGƯỜI trong kỳ gần nhất ────────────────────────────────────────────
  //
  // Lấy đúng tập người mà bảng kỳ công đang in ra: có ngày công HOẶC có ca xếp trong
  // kỳ. Đây mới là tập cần mẫu số, không phải "toàn bộ nhân sự".
  const kyMoiNhat = kyCong[0]?.periodKey ?? null;
  let userIds: string[] = [];
  if (kyMoiNhat) {
    const [y, m] = kyMoiNhat.split("-").map(Number);
    const from = new Date(Date.UTC(y!, m! - 1, 1));
    const to = new Date(Date.UTC(y!, m!, 0));
    const [ngay, ca] = await Promise.all([
      db.staffAttendanceDay.findMany({
        where: { workDate: { gte: from, lte: to } },
        select: { userId: true },
      }),
      db.shiftAssignment.findMany({
        where: { workDate: { gte: from, lte: to }, status: "ACTIVE" },
        select: { userId: true },
      }),
    ]);
    userIds = [...new Set([...ngay.map((r) => r.userId), ...ca.map((r) => r.userId)])];
  }

  tieu(`3. NGƯỜI trong kỳ gần nhất (${kyMoiNhat ?? "chưa có kỳ"}) — tập cần mẫu số`);
  dong("Số người có ngày công hoặc có ca trong kỳ", userIds.length);

  if (userIds.length === 0) {
    console.log("  Không có ai ⇒ mục 4 dưới đây đo trên TOÀN BỘ nhân sự đang làm việc thay thế.");
    const tatCa = await db.employee.findMany({
      where: { status: "ACTIVE" },
      select: { userAccount: { select: { id: true } } },
    });
    userIds = tatCa.map((e) => e.userAccount?.id).filter((x): x is string => !!x);
    dong("Số nhân sự ACTIVE có tài khoản", userIds.length);
  }

  // ── 4. BỐN KHOÁ ỨNG VIÊN — khoá nào phủ đủ, khoá nào đơn trị ──────────────
  const [nhanSu, hoSoGV, vai] = await Promise.all([
    db.employee.findMany({
      where: { userAccount: { id: { in: userIds } } },
      select: {
        jobTitle: true,
        department: true,
        contractType: true,
        status: true,
        userAccount: { select: { id: true } },
      },
    }),
    db.teacherProfile.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, employmentType: true },
    }),
    db.userOrgRole.findMany({
      where: { userId: { in: userIds }, status: "ACTIVE" },
      select: { userId: true, role: { select: { code: true } } },
    }),
  ]);

  const coHoSo = new Set(nhanSu.map((e) => e.userAccount?.id).filter(Boolean) as string[]);

  tieu("4. BỐN KHOÁ ỨNG VIÊN cho 'công chuẩn theo role' — phủ được bao nhiêu");

  console.log("");
  console.log("  ── (a) Employee.department — enum NOT NULL, phòng ban do Nhân sự giữ ──");
  dong("Người trong kỳ CÓ hồ sơ Employee", coHoSo.size);
  dong("Người trong kỳ KHÔNG có hồ sơ Employee (không khoá được)", userIds.length - coHoSo.size);
  for (const [k, n] of gom(nhanSu, (e) => String(e.department))) dong(`    ${k}`, n);

  console.log("");
  console.log("  ── (b) TeacherProfile.employmentType — FULLTIME/PARTTIME, CHỈ giáo viên ──");
  dong("Người trong kỳ có TeacherProfile", hoSoGV.length);
  dong("Người trong kỳ KHÔNG có TeacherProfile", userIds.length - hoSoGV.length);
  for (const [k, n] of gom(hoSoGV, (t) => String(t.employmentType))) dong(`    ${k}`, n);

  console.log("");
  console.log("  ── (c) Employee.contractType — nullable, 7 giá trị ──");
  for (const [k, n] of gom(nhanSu, (e) => (e.contractType ? String(e.contractType) : null)))
    dong(`    ${k}`, n);

  console.log("");
  console.log("  ── (d) UserOrgRole → RoleDef.code — vai RBAC (dựng cho QUYỀN) ──");
  const vaiTheoNguoi = new Map<string, Set<string>>();
  for (const v of vai) {
    const s = vaiTheoNguoi.get(v.userId) ?? new Set<string>();
    s.add(v.role.code);
    vaiTheoNguoi.set(v.userId, s);
  }
  dong("Người trong kỳ có ≥1 vai ACTIVE", vaiTheoNguoi.size);
  dong("Người trong kỳ KHÔNG có vai nào (không khoá được)", userIds.length - vaiTheoNguoi.size);
  const nhieuVai = [...vaiTheoNguoi.values()].filter((s) => s.size >= 2).length;
  dong("Người mang ≥ 2 vai KHÁC NHAU ⇒ KHOÁ KHÔNG ĐƠN TRỊ", nhieuVai);
  console.log(
    nhieuVai > 0
      ? `  ⚠️ ${nhieuVai} người không có câu trả lời duy nhất cho "công chuẩn của vai nào".` +
          ` Dùng vai RBAC làm mẫu số thì PHẢI kèm luật phá hoà, và luật đó chạm lương.`
      : "  ⓘ Chưa ai mang 2 vai — nhưng đó là số HÔM NAY, không phải ràng buộc của lược đồ:" +
          " `UserOrgRole` khoá (người × đơn vị × vai), không có gì chặn người thứ hai.",
  );
  for (const [k, n] of gom([...vaiTheoNguoi.entries()], ([, s]) =>
    s.size === 1 ? [...s][0]! : `NHIỀU VAI: ${[...s].sort().join("+")}`,
  ))
    dong(`    ${k}`, n);

  console.log("");
  console.log("  ── (e) Employee.jobTitle — chuỗi TỰ DO (để so sánh, KHÔNG phải ứng viên) ──");
  const dsChucDanh = gom(nhanSu, (e) => e.jobTitle || null);
  dong("Số chức danh phân biệt", dsChucDanh.length);
  for (const [k, n] of dsChucDanh) dong(`    "${k}"`, n);
  console.log(
    "  ⓘ Chuỗi tự do gõ tay: hai người cùng việc gõ lệch một dấu cách là hai nhóm khác nhau." +
      " Không dùng làm khoá của một con số chạm lương.",
  );

  // ── 4bis. BA KHOÁ CÓ ĐỒNG Ý VỚI NHAU KHÔNG ────────────────────────────────
  //
  // Đếm riêng từng khoá chỉ nói "khoá nào phủ đủ". Câu quyết định là khoá nào NÓI
  // CÙNG MỘT CHUYỆN — vì nếu ba khoá bất đồng về việc ai là giáo viên, thì chọn khoá
  // là chọn luôn một danh sách người khác nhau, và danh sách ấy là mẫu số lương.
  //
  // Bảng chéo dưới đây in ĐẾM, không in ai.
  const vaiCua = (uid: string) => vaiTheoNguoi.get(uid) ?? new Set<string>();
  const nsCoId = nhanSu
    .map((e) => ({ ...e, uid: e.userAccount?.id ?? null }))
    .filter((e): e is typeof e & { uid: string } => !!e.uid);

  tieu("4bis. BA KHOÁ CÓ ĐỒNG Ý 'AI LÀ GIÁO VIÊN' KHÔNG");
  const theoPhongBan = nsCoId.filter((e) => String(e.department) === "DAO_TAO" || String(e.department) === "GIANG_DAY");
  const theoVai = nsCoId.filter((e) => vaiCua(e.uid).has("TEACHER"));
  const theoChucDanh = nsCoId.filter((e) => /gi[áa]o vi[êe]n/i.test(e.jobTitle));
  dong("Là GV theo Employee.department (DAO_TAO/GIANG_DAY)", theoPhongBan.length);
  dong("Là GV theo vai RBAC (có TEACHER)", theoVai.length);
  dong("Là GV theo jobTitle (khớp 'giáo viên')", theoChucDanh.length);
  const bo = (a: typeof nsCoId) => new Set(a.map((e) => e.uid));
  const A = bo(theoPhongBan), B = bo(theoVai), C = bo(theoChucDanh);
  const hieu = (x: Set<string>, y: Set<string>) => [...x].filter((u) => !y.has(u)).length;
  dong("Có phòng ban đào tạo NHƯNG không vai TEACHER", hieu(A, B));
  dong("Có vai TEACHER NHƯNG phòng ban khác", hieu(B, A));
  dong("Chức danh 'giáo viên' NHƯNG không vai TEACHER", hieu(C, B));
  dong("Có vai TEACHER NHƯNG chức danh không ghi 'giáo viên'", hieu(B, C));
  console.log(
    A.size === B.size && B.size === C.size && hieu(A, B) === 0 && hieu(B, C) === 0
      ? "  ⓘ Ba khoá cho CÙNG một danh sách người."
      : "  ⚠️ BA KHOÁ CHO BA DANH SÁCH KHÁC NHAU. Chọn khoá = chọn ai được mẫu số nào.",
  );

  console.log("");
  console.log("  ── Bảng chéo: phòng ban × loại hợp đồng (đếm người) ──");
  const loaiHD = [...new Set(nsCoId.map((e) => (e.contractType ? String(e.contractType) : "(null)")))].sort();
  const phongBan = [...new Set(nsCoId.map((e) => String(e.department)))].sort();
  console.log(`  ${"".padEnd(22)}${loaiHD.map((l) => l.padStart(12)).join("")}`);
  for (const pb of phongBan) {
    const hang = loaiHD.map(
      (l) =>
        String(
          nsCoId.filter(
            (e) => String(e.department) === pb && (e.contractType ? String(e.contractType) : "(null)") === l,
          ).length,
        ).padStart(12),
    );
    console.log(`  ${pb.padEnd(22)}${hang.join("")}`);
  }
  console.log(
    "  ⓘ 'GV fulltime / GV parttime' mà mục 4 nói tới ĐỌC ĐƯỢC ở đúng ô (DAO_TAO × FULLTIME)" +
      " và (DAO_TAO × PARTTIME) của bảng này — KHÔNG đọc được từ `TeacherProfile.employmentType`" +
      " nếu bảng đó rỗng, và KHÔNG đọc được từ vai RBAC (vai không phân biệt fulltime/parttime).",
  );

  // ── 5. CÔNG CHUẨN CÓ ĐANG LÀ MẪU SỐ THẬT KHÔNG ────────────────────────────
  //
  // Đo bằng mã nguồn chứ không bằng DB, nên in ra đây như một lời khai để người đọc
  // không phải tự tra: KHÔNG chỗ nào trong repo CHIA cho `standardUnits`. Nó được IN
  // (thẻ "Công thực tế / công chuẩn" ở site GV; cột "Công chuẩn" trong Excel — cùng
  // một số lặp lại trên MỌI dòng người). Phép chia đang xảy ra ở ngoài hệ thống, trong
  // file Excel của Kế toán.
  tieu("5. LỜI KHAI — công chuẩn hôm nay được IN, chưa từng được CHIA");
  console.log("  Đo bằng `grep standardUnits|congChuan` trên toàn repo (không phải suy đoán):");
  console.log("    · lib/cham-cong/export-xlsx.ts:16 — cột 'Công chuẩn', `summary.standardUnits`");
  console.log("      ⇒ MỘT số của kỳ, lặp lại y nguyên trên mọi dòng người.");
  console.log("    · app/(teacher)/teacher/bang-cong/page.tsx:567 — in `${cong} / ${congChuan}`");
  console.log("      ⇒ hiển thị hai số cạnh nhau, KHÔNG thực hiện phép chia.");
  console.log("    · KHÔNG có chỗ nào chia. Hệ số công tính ngoài hệ thống, trong Excel Kế toán.");
  console.log("");
  console.log("  Hệ quả cho mục 4: thêm chiều theo role là đổi CỘT 'Công chuẩn' của Excel từ");
  console.log("  'một số lặp lại' thành 'số riêng từng người'. Đó là chỗ thay đổi chạm lương,");
  console.log("  chứ không phải màn hình.");

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
