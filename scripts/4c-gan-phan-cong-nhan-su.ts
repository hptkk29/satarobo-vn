/**
 * scripts/4c-gan-phan-cong-nhan-su.ts — ghi bản đồ phân công nhân sự đã duyệt 08/09/2026.
 *
 * Ghi `EmployeeOrgAssignment` cho 6 người làm ở nhiều hơn một nơi (12 dòng).
 *
 * ĐỊNH NGHĨA RANH GIỚI Ở ĐÂU: `docs/nen-he-thong/RANH-GIOI-PHAN-CONG-NHAN-SU.md`.
 * Đọc nó TRƯỚC khi thêm ai vào `BAN_DO` — năm giá trị enum không tự giải thích, và hai
 * người đoán khác nhau là hai nửa bảng nói hai chuyện mà không có gì báo lỗi.
 *
 * ⚠️ BẢNG NÀY KHÔNG SINH QUYỀN. Quyền chỉ từ `UserOrgRole`. Chạy script này không cho ai
 * thêm quyền xem gì, và cũng không thu hồi của ai.
 *
 * CHẠY:
 *   pnpm tsx scripts/4c-gan-phan-cong-nhan-su.ts            # CHẠY THỬ (mặc định, chỉ in)
 *   pnpm tsx scripts/4c-gan-phan-cong-nhan-su.ts --apply    # ghi thật
 *
 * VÌ SAO LÀ SCRIPT CHỨ KHÔNG PHẢI MIGRATION: luật cứng Nền Hệ thống #4 — dữ liệu trên DB
 * đang chạy thì Dev chạy tay, có bước xem trước. Nhét vào migration là tước mất bước đó.
 *
 * AN TOÀN:
 *  · Mặc định KHÔNG ghi. Phải có `--apply`.
 *  · **Idempotent**: dòng đã có (cùng employee + orgUnit + type, đang ACTIVE) thì BỎ QUA.
 *    Chạy lần hai không đẻ bản sao.
 *  · Đi qua `createAssignment` chứ không `create` trần ⇒ có AuditLog, có cổng chặn
 *    `PRIMARY` thứ hai, có kiểm `allocationPercent`.
 *  · Người không tìm thấy / đơn vị không tìm thấy ⇒ BÁO RÕ rồi bỏ qua người đó, KHÔNG
 *    ném giữa lô làm hỏng phần còn lại.
 */
import { createAssignment, isActiveAssignment } from "../lib/org/assignment-service";
import "./_load-env";
import { scriptDb } from "./_script-db";

type Type = "PRIMARY" | "SECONDARY" | "SUPPORT" | "SUBSTITUTE" | "SHARED";

/**
 * Bản đồ đã duyệt 08/09/2026 — chép từ §3 của file ranh giới.
 *
 * `noiLam` là **mã đơn vị** (`OrgUnit.code`), không phải tên. `allocationPercent` bỏ
 * trống toàn bộ: chưa chia chi phí theo tỉ lệ, và điền số không có căn cứ là bịa độ
 * chính xác.
 */
const BAN_DO: { maNv: string; noiLam: string; loai: Type; viSao: string }[] = [
  // Phụ trách hai cơ sở NGANG NHAU ⇒ không dòng PRIMARY nào.
  { maNv: "SR.NV.003", noiLam: "CS1", loai: "SHARED", viSao: "phụ trách CS1 và CS2 ngang nhau" },
  { maNv: "SR.NV.003", noiLam: "CS2", loai: "SHARED", viSao: "phụ trách CS1 và CS2 ngang nhau" },

  // Biên chế Hội sở, sang cơ sở làm việc chuyên môn.
  { maNv: "SR.NV.004", noiLam: "HO", loai: "PRIMARY", viSao: "biên chế Hội sở" },
  { maNv: "SR.NV.004", noiLam: "CS1", loai: "SUPPORT", viSao: "sang CS1 làm việc chuyên môn" },
  { maNv: "SR.NV.005", noiLam: "HO", loai: "PRIMARY", viSao: "biên chế Hội sở" },
  { maNv: "SR.NV.005", noiLam: "CS2", loai: "SUPPORT", viSao: "sang CS2 làm việc chuyên môn" },

  // ⚠️ SECONDARY, KHÔNG phải SUBSTITUTE: một buổi CỐ ĐỊNH mỗi tuần vẫn là lịch cố định.
  // `SUBSTITUTE` gắn với dạy thay (`substituteTeacherId`) nên dùng sai sẽ khiến buổi đó
  // bị đọc là bất thường và bị lọc khỏi báo cáo "ai làm ở cơ sở này".
  { maNv: "SR.NV.007", noiLam: "CS1", loai: "PRIMARY", viSao: "trực CS1" },
  { maNv: "SR.NV.007", noiLam: "CS2", loai: "SECONDARY", viSao: "một buổi CỐ ĐỊNH mỗi tuần ở CS2" },

  { maNv: "SR.NV.009", noiLam: "CS2", loai: "PRIMARY", viSao: "trực CS2" },
  { maNv: "SR.NV.009", noiLam: "CS1", loai: "SECONDARY", viSao: "có lớp đều đặn ở CS1" },
  { maNv: "SR.NV.010", noiLam: "CS2", loai: "PRIMARY", viSao: "trực CS2" },
  { maNv: "SR.NV.010", noiLam: "CS1", loai: "SECONDARY", viSao: "có lớp đều đặn ở CS1" },
];

const APPLY = process.argv.includes("--apply");

async function main() {
  const db = scriptDb();
  console.log(APPLY ? "── GHI THẬT ──" : "── CHẠY THỬ (không ghi gì) ──");
  console.log(`Ranh giới: docs/nen-he-thong/RANH-GIOI-PHAN-CONG-NHAN-SU.md\n`);

  const maNvs = [...new Set(BAN_DO.map((r) => r.maNv))];
  const nhanSu = new Map(
    (
      await db.employee.findMany({
        where: { employeeCode: { in: maNvs } },
        select: { id: true, employeeCode: true, fullName: true },
      })
    ).map((e) => [e.employeeCode, e]),
  );

  const maDonVi = [...new Set(BAN_DO.map((r) => r.noiLam))];
  const donVi = new Map(
    (
      await db.orgUnit.findMany({
        where: { code: { in: maDonVi } },
        select: { id: true, code: true, name: true, isActive: true, deletedAt: true },
      })
    ).map((o) => [o.code, o]),
  );

  // Ảnh TRƯỚC — để đối chiếu sau khi ghi, và để biết dòng nào đã có sẵn.
  const daCo = await db.employeeOrgAssignment.findMany({
    where: { employeeId: { in: [...nhanSu.values()].map((e) => e.id) } },
    select: {
      employeeId: true,
      orgUnitId: true,
      assignmentType: true,
      status: true,
      effectiveFrom: true,
      effectiveTo: true,
    },
  });
  console.log(`Đang có sẵn: ${daCo.length} dòng cho ${maNvs.length} mã NV được nhắc tới\n`);

  let ghi = 0;
  let boQua = 0;
  let hong = 0;

  for (const r of BAN_DO) {
    const e = nhanSu.get(r.maNv);
    const o = donVi.get(r.noiLam);
    const nhan = `${r.maNv} → ${r.loai} @ ${r.noiLam}`;

    if (!e) {
      console.log(`  ❌ ${nhan}: KHÔNG tìm thấy mã nhân sự`);
      hong += 1;
      continue;
    }
    if (!o || !o.isActive || o.deletedAt) {
      console.log(`  ❌ ${nhan}: đơn vị "${r.noiLam}" không tồn tại hoặc đã ngừng`);
      hong += 1;
      continue;
    }

    // Idempotent: cùng người + cùng đơn vị + cùng loại + đang hiệu lực ⇒ bỏ qua.
    const trung = daCo.find(
      (a) =>
        a.employeeId === e.id &&
        a.orgUnitId === o.id &&
        a.assignmentType === r.loai &&
        isActiveAssignment(a),
    );
    if (trung) {
      console.log(`  ⏭  ${nhan}: đã có, bỏ qua`);
      boQua += 1;
      continue;
    }

    if (!APPLY) {
      console.log(`  +  ${nhan}  (${e.fullName} · ${o.name}) — ${r.viSao}`);
      ghi += 1;
      continue;
    }

    try {
      const { warning } = await createAssignment(
        { id: null, name: "script 4c" },
        {
          employeeId: e.id,
          orgUnitId: o.id,
          assignmentType: r.loai,
          // `allocationPercent` bỏ trống có chủ đích — xem §2 của file ranh giới.
          reason: `Bản đồ phân công duyệt 08/09/2026 — ${r.viSao}`,
        },
      );
      console.log(`  ✅ ${nhan}  (${e.fullName} · ${o.name})`);
      if (warning) console.log(`     ⚠️ ${warning}`);
      ghi += 1;
    } catch (err) {
      // Không ném ra ngoài: hỏng một người không được làm hỏng phần còn lại của lô.
      console.log(`  ❌ ${nhan}: ${err instanceof Error ? err.message : String(err)}`);
      hong += 1;
    }
  }

  console.log(
    `\n${APPLY ? "Đã ghi" : "Sẽ ghi"}: ${ghi} · bỏ qua (đã có): ${boQua} · hỏng: ${hong}`,
  );
  if (!APPLY) console.log("\nChưa ghi gì. Thêm --apply để ghi thật.");
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
