/**
 * Dọn `AuditLog.orgUnitId` đang mang `Center.id` → đổi sang `OrgUnit.id` tương ứng.
 *
 *   pnpm tsx scripts/nen-p1-sua-audit-orgunit.ts            # DRY-RUN (mặc định)
 *   pnpm tsx scripts/nen-p1-sua-audit-orgunit.ts --apply    # ghi thật
 *
 * ⚠️ Luật cứng #4: người vận hành chạy TAY trên PROD, sau khi xem dry-run.
 *
 * VÌ SAO CẦN. Đường đọc nhật ký lọc `orgUnitId IN visibleOrgUnitIds` — danh sách
 * đó toàn `OrgUnit.id` thật. Dòng mang `Center.id` không bao giờ khớp, nên với
 * quản lý cơ sở nó VÔ HÌNH: không lỗi, không cảnh báo, chỉ là nhật ký trống.
 * Đo trên DB dev 12/08: 246/369 dòng (67%) như vậy — enrollment 145, finance 93.
 *
 * Đường GHI đã vá ở `resolveAuditOrgUnitId` (lib/audit/audit-log.ts), nên script
 * này chỉ lo phần dữ liệu CŨ. Chạy lại nhiều lần vô hại: lần hai không còn gì để
 * đổi.
 *
 * AN TOÀN:
 *  · CHỈ đụng dòng có `orgUnitId` khớp đúng một `Center.id` và có OrgUnit trỏ tới.
 *  · KHÔNG đụng dòng `orgUnitId = null` — null nghĩa là "không suy được đơn vị",
 *    đoán thay là bịa dữ liệu nhật ký.
 *  · KHÔNG đụng dòng đã là OrgUnit.id hợp lệ.
 *  · Dòng mang id không khớp bảng nào (đơn vị đã xoá) được LIỆT KÊ, không tự sửa.
 *  · AuditLog là bảng bất biến về mặt nghiệp vụ — đây là sửa lỗi tham chiếu, không
 *    đổi nội dung sự kiện (actor/action/oldValues/newValues giữ nguyên).
 */
import { PrismaClient } from "@prisma/client";
import { scriptDatabaseUrl } from "./_script-db";

const APPLY = process.argv.includes("--apply");
const db = new PrismaClient({
  datasources: { db: { url: scriptDatabaseUrl() } },
});

async function main() {
  const orgUnits = await db.orgUnit.findMany({
    where: { deletedAt: null },
    select: { id: true, centerId: true, code: true },
  });
  const orgIds = new Set(orgUnits.map((o) => o.id));
  /** Center.id → OrgUnit.id (OrgUnit.centerId là @unique nên 1-1). */
  const theoCenter = new Map<string, { id: string; code: string }>();
  for (const o of orgUnits) {
    if (o.centerId) theoCenter.set(o.centerId, { id: o.id, code: o.code });
  }

  const rows = await db.auditLog.findMany({
    where: { orgUnitId: { not: null } },
    select: { id: true, orgUnitId: true, module: true },
  });

  const doiDuoc: { id: string; tu: string; sang: string; code: string }[] = [];
  const mocoi: { id: string; orgUnitId: string; module: string }[] = [];
  let daDung = 0;

  for (const r of rows) {
    const cur = r.orgUnitId!;
    if (orgIds.has(cur)) {
      daDung++;
      continue;
    }
    const map = theoCenter.get(cur);
    if (map) doiDuoc.push({ id: r.id, tu: cur, sang: map.id, code: map.code });
    else mocoi.push({ id: r.id, orgUnitId: cur, module: r.module });
  }

  const tong = await db.auditLog.count();
  console.log("TỔNG AuditLog            :", tong);
  console.log(
    "  orgUnitId = null       :",
    tong - rows.length,
    "(giữ nguyên — không đoán đơn vị)",
  );
  console.log("  đã đúng OrgUnit.id     :", daDung);
  console.log("  ĐỔI ĐƯỢC (Center.id)   :", doiDuoc.length);
  console.log("  mồ côi, KHÔNG tự sửa   :", mocoi.length);

  if (doiDuoc.length) {
    const theoDonVi = new Map<string, number>();
    for (const d of doiDuoc)
      theoDonVi.set(d.code, (theoDonVi.get(d.code) ?? 0) + 1);
    console.log("\n  Đổi về đơn vị:");
    for (const [code, n] of [...theoDonVi].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${code}: ${n} dòng`);
    }
  }
  if (mocoi.length) {
    console.log("\n  ⚠️ Mồ côi (id không khớp OrgUnit lẫn Center — xem tay):");
    for (const m of mocoi.slice(0, 10)) {
      console.log(`    ${m.id}  module=${m.module}  orgUnitId=${m.orgUnitId}`);
    }
    if (mocoi.length > 10)
      console.log(`    … và ${mocoi.length - 10} dòng nữa`);
  }

  if (!APPLY) {
    console.log("\nCHẾ ĐỘ: DRY-RUN — chưa ghi gì. Thêm --apply để ghi thật.");
    return;
  }

  // Gom theo giá trị đích để dùng updateMany thay vì N lần update.
  const theoDich = new Map<string, string[]>();
  for (const d of doiDuoc) {
    const arr = theoDich.get(d.sang) ?? [];
    arr.push(d.id);
    theoDich.set(d.sang, arr);
  }
  let daGhi = 0;
  for (const [sang, ids] of theoDich) {
    // Chia lô: tránh câu IN quá dài khi số dòng lớn.
    for (let i = 0; i < ids.length; i += 500) {
      const res = await db.auditLog.updateMany({
        where: { id: { in: ids.slice(i, i + 500) } },
        data: { orgUnitId: sang },
      });
      daGhi += res.count;
    }
  }
  console.log(`\nĐÃ GHI: ${daGhi} dòng.`);

  // Đối chiếu lại ngay — đừng tin con số vừa ghi, đo lại từ DB.
  const conLai = await db.auditLog.findMany({
    where: { orgUnitId: { not: null } },
    select: { orgUnitId: true },
  });
  const sai = conLai.filter((r) => !orgIds.has(r.orgUnitId!)).length;
  console.log(
    `ĐỐI CHIẾU LẠI: còn ${sai} dòng orgUnitId không phải OrgUnit.id` +
      (sai === mocoi.length
        ? " (đúng bằng số mồ côi đã liệt kê ⇒ đạt)."
        : " ⚠️ KHÁC số mồ côi — xem lại."),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
