/**
 * EL-02 PR2 — CHẨN ĐOÁN: ai đăng nhập được nhưng KHÔNG có Actor hợp lệ.
 *
 *   pnpm tsx scripts/elearning-actor-audit.ts             # CHỈ XEM (mặc định)
 *   pnpm tsx scripts/elearning-actor-audit.ts --apply     # gắn UserOrgRole cho NHÓM 1
 *
 * ─── Vì sao ticket này tồn tại ────────────────────────────────────────────────
 * Sự cố 10/08/2026: **114 tài khoản PARENT / 0 dòng `UserOrgRole`** ⇒ phụ huynh
 * không gửi được tin nào (`PERMISSION_DENIED`). Nó ẩn kỹ vì đường ĐỌC kiểm theo tư
 * cách thành viên hội thoại chứ không qua `can()` — người dùng vào đọc bình thường,
 * chỉ không ghi được. Người học e-learning thiếu dòng đó cũng vậy: xem bài được,
 * bấm "Đánh dấu đã đọc" thì bị chặn IM LẶNG.
 *
 * ─── Bốn nhóm, in TÁCH BẠCH, và chỉ MỘT nhóm được `--apply` chạm vào ─────────
 *  NHÓM 1 — có `Employee`, có đơn vị neo, THIẾU `UserOrgRole` → sửa được.
 *  NHÓM 2 — KHÔNG có `Employee`. Script **tuyệt đối không** gắn: không biết gắn ở
 *           đâu, và gắn ở HO là biến họ thành `isHoLevel` ⇒ thấy mọi cơ sở. Cổng
 *           chặn nhóm này khỏi khu e-learning nằm ở EL-01, không nằm ở đây.
 *  NHÓM 3 — có `Employee` nhưng THIẾU đơn vị neo → không có chỗ để gắn. Gán ai vào
 *           đơn vị nào là quyết định TỔ CHỨC, có tên người và lý do, không phải
 *           phép biến đổi dữ liệu (QĐ-CDA-10 việc 3).
 *  NHÓM 4 — đang neo tại HO/ROOT ⇒ `isHoLevel` ⇒ **thấy MỌI cơ sở**. Đây là cổng
 *           thứ ba của GĐ0 (QĐ-CDA-11 bước 5): đối chiếu với danh sách Hội sở đã
 *           duyệt. Nhóm này KHÔNG phải lỗi — nhưng mỗi người trong đó phải có tên
 *           trong danh sách duyệt, nếu không thì đó là US-05 tái diễn.
 *
 * ─── Ba việc script TỪ CHỐI làm ──────────────────────────────────────────────
 *  1. Không gắn `UserOrgRole` ở HO cho bất kỳ ai. `lib/auth/actor.ts` cho
 *     `isHoLevel = true` với BẤT KỲ vai nào neo tại HO/ROOT.
 *  2. Không đoán đơn vị (nhóm 3) và không đoán chủ sở hữu (nhóm 2).
 *  3. Không sửa nhóm 4. Gỡ quyền cross-center của một người là quyết định có tên
 *     người; script chỉ nêu ra để người có thẩm quyền quyết.
 *
 * ⚠️ Chạy PROD là việc người vận hành làm TAY, sau khi đọc bản chỉ-xem (luật cứng #4).
 * `--apply` ghi danh sách id đã tạo ra `elearning-actor-audit-<n>.log` để gỡ tay nếu cần.
 */
import { PrismaClient, type Prisma, type Role } from "@prisma/client";
import { writeFileSync } from "node:fs";
import { reconcileUserOrgRoles } from "../lib/auth/org-role-sync";

/**
 * Transaction pooler (:6543) làm Prisma chết với "prepared statement ... does not exist"
 * khi chạy nhiều truy vấn rời. Script vận hành dùng SESSION pooler (`DIRECT_URL`, :5432)
 * — cùng lý do workflow `seed-prod-roles.yml` cũng dùng `PROD_DIRECT_URL`.
 */
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL || "" },
  },
});
const APPLY = process.argv.includes("--apply");

type Nguoi = {
  id: string;
  email: string | null;
  name: string | null;
  role: Role;
  roles: Role[];
  orgUnitId: string | null;
  centerId: string | null;
  employeeId: string | null;
};

function ten(u: Nguoi): string {
  return `${u.name ?? "(không tên)"} <${u.email ?? "không email"}>`;
}

async function main() {
  console.log(
    APPLY
      ? "⚠️  CHẾ ĐỘ GHI THẬT (--apply) — chỉ chạm NHÓM 1\n"
      : "🔍 CHỈ XEM — không ghi gì. Thêm --apply để gắn UserOrgRole cho NHÓM 1.\n",
  );

  const now = new Date();

  const donVi = await prisma.orgUnit.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, name: true, type: true },
  });
  const donViTheoId = new Map(donVi.map((d) => [d.id, d]));
  const laHoRoot = (id: string | null) => {
    if (!id) return false;
    const t = donViTheoId.get(id)?.type;
    return t === "HO" || t === "ROOT";
  };

  // Tài khoản NHÂN SỰ = không phải chỉ-PARENT. Phụ huynh là VAI QUAN HỆ: quyền nạp
  // thẳng từ RoleDef, cố ý KHÔNG cần dòng UserOrgRole nào (xem RELATIONSHIP_ROLE_CODES).
  const tatCa = (await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      roles: true,
      orgUnitId: true,
      centerId: true,
      employeeId: true,
    },
    orderBy: { name: "asc" },
  })) as Nguoi[];

  const laNhanSu = (u: Nguoi) => {
    const vai = u.roles.length > 0 ? u.roles : [u.role];
    return vai.some((r) => r !== "PARENT");
  };
  const nhanSu = tatCa.filter(laNhanSu);

  // Dòng UserOrgRole ĐANG HIỆU LỰC — cùng bộ lọc với `buildActor` (T7), không phải
  // "có dòng nào đó": dòng hết hạn trông y hệt dòng sống nếu chỉ đếm.
  const dongVai = await prisma.userOrgRole.findMany({
    where: {
      userId: { in: nhanSu.map((u) => u.id) },
      status: "ACTIVE",
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      role: { isActive: true },
    },
    select: { userId: true, orgUnitId: true, role: { select: { code: true } } },
  });
  const vaiTheoNguoi = new Map<string, typeof dongVai>();
  for (const r of dongVai) {
    const arr = vaiTheoNguoi.get(r.userId) ?? [];
    arr.push(r);
    vaiTheoNguoi.set(r.userId, arr);
  }

  // Đơn vị neo của nhân sự: ưu tiên User.orgUnitId, rồi tới Employee.orgUnitId.
  // KHÔNG suy từ centerId — cầu `OrgUnit.code = Center.code` bị QĐ-CDA-11 bước 4 cấm.
  const hoSo = await prisma.employee.findMany({
    where: { id: { in: nhanSu.map((u) => u.employeeId).filter((x): x is string => !!x) } },
    select: { id: true, orgUnitId: true, centerId: true, fullName: true },
  });
  const hoSoTheoId = new Map(hoSo.map((e) => [e.id, e]));

  const nhom1: Array<{ u: Nguoi; neo: string }> = [];
  const nhom2: Nguoi[] = [];
  const nhom3: Nguoi[] = [];
  const nhom4: Array<{ u: Nguoi; taiDonVi: string[] }> = [];
  const daDu: Nguoi[] = [];

  for (const u of nhanSu) {
    const vaiSong = vaiTheoNguoi.get(u.id) ?? [];

    const neoHo = vaiSong.filter((r) => laHoRoot(r.orgUnitId));
    if (neoHo.length > 0) {
      nhom4.push({
        u,
        taiDonVi: neoHo.map(
          (r) => `${donViTheoId.get(r.orgUnitId)?.code ?? r.orgUnitId}/${r.role.code}`,
        ),
      });
    }

    if (vaiSong.length > 0) {
      if (neoHo.length === 0) daDu.push(u);
      continue;
    }

    if (!u.employeeId) {
      nhom2.push(u);
      continue;
    }
    const neo = u.orgUnitId ?? hoSoTheoId.get(u.employeeId)?.orgUnitId ?? null;
    if (!neo) {
      nhom3.push(u);
      continue;
    }
    if (laHoRoot(neo)) {
      // Có đơn vị neo, nhưng đơn vị đó là HO ⇒ gắn vào là cấp cross-center.
      // Đẩy sang nhóm 3 (chờ người quyết), KHÔNG tự gắn.
      nhom3.push(u);
      continue;
    }
    nhom1.push({ u, neo });
  }

  console.log(`Tài khoản nhân sự (không phải chỉ-PARENT): ${nhanSu.length}`);
  console.log(`  ✅ đã có vai hiệu lực ở cơ sở:     ${daDu.length}`);
  console.log(`  🔧 NHÓM 1 — sửa được:              ${nhom1.length}`);
  console.log(`  📋 NHÓM 2 — không có hồ sơ NS:     ${nhom2.length}`);
  console.log(`  ✋ NHÓM 3 — thiếu đơn vị neo:       ${nhom3.length}`);
  console.log(`  🌐 NHÓM 4 — đang là HO-level:      ${nhom4.length}\n`);

  if (nhom1.length) {
    console.log("── NHÓM 1 — có hồ sơ + có đơn vị, thiếu vai. `--apply` sửa nhóm này ──");
    for (const r of nhom1) {
      const d = donViTheoId.get(r.neo);
      console.log(`   ${ten(r.u)}  →  ${d?.code ?? r.neo} (${d?.name ?? "?"})`);
    }
    console.log();
  }

  if (nhom2.length) {
    console.log("── NHÓM 2 — KHÔNG có hồ sơ nhân sự → chuyển phòng Nhân sự ──");
    console.log("   Cỗ máy giao bài nhắm vào `Employee` nên sẽ không bao giờ giao gì");
    console.log("   cho nhóm này. Cổng chặn họ khỏi khu e-learning nằm ở EL-01.");
    for (const u of nhom2) console.log(`   ${ten(u)}  [${u.roles.join(", ") || u.role}]`);
    console.log();
  }

  if (nhom3.length) {
    console.log("── NHÓM 3 — THIẾU ĐƠN VỊ NEO → chờ Nhân sự, script KHÔNG đoán ──");
    for (const u of nhom3) {
      const e = u.employeeId ? hoSoTheoId.get(u.employeeId) : null;
      console.log(`   ${ten(u)}${e ? `  (hồ sơ: ${e.fullName})` : ""}`);
    }
    console.log();
  }

  if (nhom4.length) {
    console.log("── NHÓM 4 — HO-LEVEL: THẤY MỌI CƠ SỞ. Cổng thứ ba của GĐ0 ──");
    console.log("   Đối chiếu TỪNG DÒNG với danh sách Hội sở đã duyệt. Người không có");
    console.log("   trong danh sách đó là US-05 tái diễn — gỡ `UserOrgRole` tại HO và");
    console.log("   neo lại ở đúng cơ sở của họ (KHÔNG dùng grant DENY: `can()` v2 là");
    console.log("   ALLOW-wins thuần, DENY bị bỏ qua im lặng).");
    console.log("   Cột đọc: [neo vai] ← thứ QUYẾT ĐỊNH quyền · tk=User.orgUnitId · hs=Employee.orgUnitId");
    console.log("   Neo vai ở HO trong khi tk/hs đã là cơ sở = dữ liệu ĐÚNG nhưng vai CHƯA DẮT theo.");
    for (const r of nhom4) {
      const e = r.u.employeeId ? hoSoTheoId.get(r.u.employeeId) : null;
      const nhan = (id: string | null | undefined) =>
        id ? (donViTheoId.get(id)?.code ?? id) : "—";
      console.log(
        `   ${ten(r.u)}  @  ${r.taiDonVi.join(", ")}` +
          `   [tk=${nhan(r.u.orgUnitId)} hs=${nhan(e?.orgUnitId)}]`,
      );
    }
    console.log();
  }

  if (!APPLY) {
    console.log("🔍 Chưa ghi gì. Chạy lại với --apply nếu NHÓM 1 ở trên là đúng.");
    return;
  }

  if (!nhom1.length) {
    console.log("✅ NHÓM 1 rỗng — không có gì để ghi.");
    return;
  }

  const nhatKy: string[] = [];
  for (const r of nhom1) {
    const vai: Role[] = r.u.roles.length > 0 ? r.u.roles : [r.u.role];
    await prisma.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Prisma.TransactionClient;
      const kq = await reconcileUserOrgRoles({
        tx,
        userId: r.u.id,
        // Trước: KHÔNG có vai nào (đó là lý do người này ở nhóm 1) ⇒ previous rỗng,
        // reconcile chỉ CẤP chứ không thu hồi gì.
        previous: { roles: [], orgUnitId: r.neo },
        next: { roles: vai, orgUnitId: r.neo },
        actorId: null,
        actorName: "scripts/elearning-actor-audit",
        reason: "EL-02 — backfill UserOrgRole cho tài khoản nhân sự thiếu Actor hợp lệ",
      });
      nhatKy.push(
        `${r.u.id}\t${r.u.email ?? ""}\t${r.neo}\t${JSON.stringify(kq)}`,
      );
    });
  }

  const tep = `elearning-actor-audit-${nhatKy.length}.log`;
  writeFileSync(tep, nhatKy.join("\n") + "\n", "utf8");
  console.log(`✅ Đã gắn vai cho ${nhatKy.length} tài khoản. Nhật ký: ${tep}`);
  console.log("   Backfill KHÔNG tự rollback được — dùng nhật ký này để gỡ tay nếu cần.");
  console.log("\n⚠️  NHÓM 2/3/4 KHÔNG bị đụng tới. Chạy lại bản chỉ-xem để xác nhận.");
}

main()
  .catch((e) => {
    console.error("❌", e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
