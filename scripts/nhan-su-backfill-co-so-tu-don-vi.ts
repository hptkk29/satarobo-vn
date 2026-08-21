/**
 * Vá dữ liệu đã lỡ: hồ sơ nhân sự CÓ đơn vị làm việc nhưng THIẾU cơ sở.
 *
 * Nguyên nhân gốc đã vá trong mã (`lib/hr/employee-unit.ts` + màn nhân sự gọi nó),
 * nhưng bản vá chỉ có tác dụng từ LẦN LƯU SAU. Những hồ sơ đã nhập trong thời gian
 * lỗi vẫn `centerId = NULL`, và hậu quả không phải chỉ là cột trống:
 * `Employee` ∈ `SCOPED_MODELS` và KHÔNG ∈ `NULL_IS_GLOBAL_MODELS` ⇒ người đó **vô
 * hình với mọi actor cấp cơ sở**, kể cả quản lý của chính cơ sở họ làm việc.
 *
 *   pnpm tsx scripts/nhan-su-backfill-co-so-tu-don-vi.ts            # CHỈ XEM
 *   pnpm tsx scripts/nhan-su-backfill-co-so-tu-don-vi.ts --apply    # ghi thật
 *
 * ─── Ba việc script này TỪ CHỐI làm ──────────────────────────────────────────
 *  1. **Không đoán đơn vị cho người chưa có đơn vị.** Gán ai vào cơ sở nào là quyết
 *     định tổ chức, có tên người và lý do — không phải phép biến đổi dữ liệu. Nhóm
 *     đó chỉ được LIỆT KÊ để phòng Nhân sự tự điền (QĐ-CDA-10 việc 3).
 *  2. **Không dùng cầu `OrgUnit.code = Center.code`.** Chỉ đọc thẳng khoá ngoại
 *     `OrgUnit.centerId`. Cầu theo `code` bị QĐ-CDA-11 bước 4 cấm và chỉ được sống
 *     trong `ORG_UNIT_FOR_CENTER_SQL`.
 *  3. **Không đụng `UserOrgRole`.** Neo vai là chuyện quyền, không phải chuyện hồ sơ;
 *     neo nhầm ở HO là biến người ta thành `isHoLevel` ⇒ thấy mọi cơ sở. Việc đó
 *     thuộc script chẩn đoán riêng của EL-02 PR2.
 *
 * ⚠️ Chạy trên PROD là việc của người vận hành, chạy tay, sau khi đọc bản CHỈ XEM
 * (luật cứng #4 trong CLAUDE.md).
 */
import { PrismaClient } from "@prisma/client";

/**
 * Transaction pooler (:6543) làm Prisma chết với "prepared statement ... does not exist"
 * khi chạy nhiều truy vấn rời — đã gặp thật. Script vận hành dùng SESSION pooler
 * (`DIRECT_URL`, :5432), cùng lý do workflow `seed-prod-roles.yml` dùng `PROD_DIRECT_URL`.
 */
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL || "" },
  },
});
const APPLY = process.argv.includes("--apply");

type Hang = {
  id: string;
  fullName: string;
  employeeCode: string | null;
  centerId: string | null;
  orgUnitId: string | null;
};

async function main() {
  console.log(
    APPLY
      ? "⚠️  CHẾ ĐỘ GHI THẬT (--apply)\n"
      : "🔍 CHỈ XEM — không ghi gì. Thêm --apply để ghi thật.\n",
  );

  const dangLam = await prisma.employee.findMany({
    where: { isActive: true, status: "ACTIVE" },
    select: {
      id: true,
      fullName: true,
      employeeCode: true,
      centerId: true,
      orgUnitId: true,
    },
    orderBy: { fullName: "asc" },
  });

  // Đơn vị → cơ sở, đọc THẲNG khoá ngoại. Đơn vị không trỏ Center nào (HO và các
  // phòng ban dưới HO) trả null — đó là câu trả lời ĐÚNG, không phải thiếu dữ liệu.
  const donViIds = [
    ...new Set(dangLam.map((e) => e.orgUnitId).filter((x): x is string => !!x)),
  ];
  const donVi = await prisma.orgUnit.findMany({
    where: { id: { in: donViIds } },
    select: { id: true, code: true, name: true, type: true, centerId: true },
  });
  const coSoCuaDonVi = new Map(donVi.map((d) => [d.id, d]));

  const suaDuoc: Array<{ e: Hang; centerId: string; donVi: string }> = [];
  const donViKhongCoCoSo: Array<{ e: Hang; donVi: string }> = [];
  const thieuDonVi: Hang[] = [];
  const daDung: Hang[] = [];
  const lechCanNguoiXem: Array<{ e: Hang; suyRa: string | null; donVi: string }> = [];

  for (const e of dangLam) {
    if (!e.orgUnitId) {
      thieuDonVi.push(e);
      continue;
    }
    const d = coSoCuaDonVi.get(e.orgUnitId);
    const nhan = d ? `${d.code} (${d.name}, ${d.type})` : `?? ${e.orgUnitId}`;
    const suyRa = d?.centerId ?? null;

    if (suyRa === null) {
      donViKhongCoCoSo.push({ e, donVi: nhan });
      continue;
    }
    if (e.centerId === suyRa) {
      daDung.push(e);
      continue;
    }
    if (e.centerId === null) {
      suaDuoc.push({ e, centerId: suyRa, donVi: nhan });
    } else {
      // Có cơ sở NHƯNG khác cơ sở của đơn vị. Không tự sửa: một trong hai ô đang
      // sai và script không biết ô nào — đổi bừa là điều động người ta trong im lặng.
      lechCanNguoiXem.push({ e, suyRa, donVi: nhan });
    }
  }

  const ten = (e: Hang) => `${e.fullName}${e.employeeCode ? ` [${e.employeeCode}]` : ""}`;

  console.log(`Tổng nhân sự đang làm việc: ${dangLam.length}`);
  console.log(`  ✅ đã khớp sẵn:            ${daDung.length}`);
  console.log(`  🔧 sửa được (nhóm 1):      ${suaDuoc.length}`);
  console.log(`  📋 đơn vị không có cơ sở:  ${donViKhongCoCoSo.length}`);
  console.log(`  ✋ chưa có đơn vị:          ${thieuDonVi.length}`);
  console.log(`  ⚠️  lệch, cần người xem:    ${lechCanNguoiXem.length}\n`);

  if (suaDuoc.length) {
    console.log("── NHÓM 1 — sửa được (đơn vị đã có, chỉ thiếu cơ sở) ──");
    for (const r of suaDuoc) console.log(`   ${ten(r.e)}  ←  ${r.donVi}`);
    console.log();
  }

  if (donViKhongCoCoSo.length) {
    console.log("── NHÓM 2 — đơn vị KHÔNG trỏ cơ sở nào (Hội sở / phòng ban) ──");
    console.log("   Đúng theo thiết kế: người Hội sở không thuộc cơ sở nào.");
    for (const r of donViKhongCoCoSo) console.log(`   ${ten(r.e)}  @  ${r.donVi}`);
    console.log();
  }

  if (thieuDonVi.length) {
    console.log("── NHÓM 3 — CHƯA CÓ ĐƠN VỊ: phòng Nhân sự phải điền, script KHÔNG đoán ──");
    for (const e of thieuDonVi) console.log(`   ${ten(e)}`);
    console.log();
  }

  if (lechCanNguoiXem.length) {
    console.log("── NHÓM 4 — cơ sở hiện tại KHÁC cơ sở của đơn vị: cần người quyết ──");
    for (const r of lechCanNguoiXem) {
      console.log(`   ${ten(r.e)}  đang: ${r.e.centerId}  ≠  theo ${r.donVi}: ${r.suyRa}`);
    }
    console.log();
  }

  if (!APPLY) {
    console.log("🔍 Chưa ghi gì. Chạy lại với --apply nếu nhóm 1 ở trên là đúng.");
    return;
  }

  if (!suaDuoc.length) {
    console.log("✅ Không có gì để ghi.");
    return;
  }

  // Ghi từng dòng, KHÔNG updateMany: mỗi người một cơ sở khác nhau, và cơ chế ghi
  // kép trong `lib/db.ts` không hook `updateMany`.
  let n = 0;
  for (const r of suaDuoc) {
    await prisma.employee.update({
      where: { id: r.e.id },
      data: { centerId: r.centerId },
    });
    n++;
  }
  console.log(`✅ Đã ghi cơ sở cho ${n} hồ sơ.`);
  console.log(
    "⚠️  Còn một việc NỮA, không thuộc script này: tài khoản đăng nhập và neo vai\n" +
      "   (`User.orgUnitId` + `UserOrgRole`) không tự chạy theo. Xem script chẩn đoán\n" +
      "   của EL-02 PR2, hoặc mở lại hồ sơ trên màn Nhân sự và bấm Lưu để đường\n" +
      "   `keoTaiKhoanTheoHoSo` chạy.",
  );
}

main()
  .catch((e) => {
    console.error("❌", e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
