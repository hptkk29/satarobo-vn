/**
 * Chuyển GIÁO VIÊN về đơn vị HỘI SỞ (chủ dự án chốt 06/08).
 *
 * Mô hình mới: GV không thuộc một cơ sở cố định nữa — về HO rồi được phân lịch
 * xuống các cơ sở dạy.
 *
 *   pnpm tsx scripts/move-teachers-to-ho.ts           # DRY-RUN (mặc định)
 *   pnpm tsx scripts/move-teachers-to-ho.ts --apply   # ghi thật
 *
 * CHỈ đụng người có vai TEACHER và KHÔNG kiêm vai gắn cơ sở (CENTER_MANAGER,
 * SALES_CSM…) — người kiêm quản lý cơ sở mà đẩy về HO là mất quyền theo cơ sở.
 */
import { db } from "@/lib/db";
import { getNonEnrollableCenterIds } from "@/lib/enrollment-flow";

const APPLY = process.argv.includes("--apply");
/** Vai BUỘC phải gắn một cơ sở cụ thể → không đẩy về HO. */
const VAI_GAN_CO_SO = ["CENTER_MANAGER", "SALES_CSM", "CENTER_CLASS_MANAGER"];

async function main() {
  const hoIds = await getNonEnrollableCenterIds();
  const hoOrg = await db.orgUnit.findFirst({ where: { type: "HO", deletedAt: null }, select: { id: true, name: true, centerId: true } });
  if (!hoOrg) { console.log("❌ Không tìm thấy OrgUnit type=HO"); return; }
  // Center đại diện Hội sở (nếu có row Center) để set User.centerId cho nhất quán.
  const hoCenterId = hoOrg.centerId ?? hoIds[0] ?? null;
  console.log(`Hội sở: orgUnit="${hoOrg.name}" (${hoOrg.id}) · centerId=${hoCenterId ?? "(không có row Center)"}\n`);

  const gv = await db.user.findMany({
    where: { roles: { has: "TEACHER" }, deletedAt: null, isActive: true },
    select: { id: true, name: true, email: true, roles: true, centerId: true, orgUnitId: true,
      center: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  const chuyen: typeof gv = [], boQua: string[] = [];
  for (const u of gv) {
    if (hoCenterId && u.centerId === hoCenterId) { boQua.push(`${u.name} — đã ở Hội sở`); continue; }
    const kiem = u.roles.filter((r) => VAI_GAN_CO_SO.includes(r));
    if (kiem.length) { boQua.push(`${u.name} — kiêm ${kiem.join("/")}, giữ nguyên cơ sở`); continue; }
    chuyen.push(u);
  }

  console.log(`GV sẽ chuyển về Hội sở: ${chuyen.length}`);
  for (const u of chuyen) console.log(`  ${(u.name ?? "?").padEnd(26)} ${(u.center?.name ?? "(chưa gán)").padEnd(26)} → Hội sở`);
  if (boQua.length) console.log(`\nBỏ qua (${boQua.length}):\n${boQua.map((x) => "  " + x).join("\n")}`);

  if (!APPLY) { console.log("\nDRY-RUN — chưa ghi gì. Chạy lại với `--apply`."); return; }
  let n = 0;
  for (const u of chuyen) {
    await db.user.update({ where: { id: u.id }, data: { centerId: hoCenterId, orgUnitId: hoOrg.id } });
    n++;
  }
  console.log(`\n✓ Đã chuyển ${n} giáo viên về Hội sở.`);
  console.log("Lưu ý: RBAC v2 dùng UserOrgRole — nếu GV có vai gán ở OrgUnit cơ sở cũ, cần gán lại vai tại Hội sở.");
}
main().catch((e) => console.error(String(e).slice(0, 400))).finally(() => db.$disconnect());
