/**
 * scripts/nen-p1-reshape-org-tree.ts — Nền Hệ thống P1 · US-05 AC2.
 *
 * DỜI cây tổ chức trên một DB ĐANG CÓ DỮ LIỆU sang hình chốt 11/08/2026 (BA 08/08 §1.1):
 *
 *   TRƯỚC:  SATAROBO (ROOT) → HO, CS1, CS2   (ngang hàng)
 *   SAU:    HO (gốc) → DANANG (REGION) → CS1, CS2
 *
 * VÌ SAO LÀ SCRIPT CHỨ KHÔNG PHẢI MIGRATION: luật cứng Nền Hệ thống #4 — "Không tự ý sinh
 * migration đổi/bỏ cột trên bảng đang có dữ liệu PROD. Migration chỉ nằm trong story được
 * giao, có dry-run, và Dev chạy tay trên PROD." Dời node là ĐỔI DỮ LIỆU, không phải đổi
 * schema; nhét vào migration là tước mất bước xem trước.
 *
 * CHẠY:
 *   pnpm tsx scripts/nen-p1-reshape-org-tree.ts            # DRY-RUN (mặc định, chỉ in)
 *   pnpm tsx scripts/nen-p1-reshape-org-tree.ts --apply    # ghi thật, trong 1 transaction
 *
 * AN TOÀN:
 *  · Mặc định KHÔNG ghi. Phải có --apply.
 *  · Idempotent: chạy lần 2 trên cây đã dời → "không có gì để làm".
 *  · Không XOÁ node SATAROBO. Nó được chuyển thành đơn vị đã đóng (status CLOSED +
 *    deletedAt) SAU KHI hết con — vì `UserOrgRole` có thể đang trỏ vào nó. Script in ra
 *    số dòng UserOrgRole đang gắn ROOT và CHUYỂN chúng sang HO, vì HO nay là gốc và
 *    `isHoRoot()` vốn đã coi ROOT ≡ HO nên quyền của những người đó KHÔNG đổi.
 *  · Tính lại path/depth cho TOÀN BỘ cây ở cuối, bằng cùng công thức với lib/org/path.ts.
 */
import { PrismaClient } from "@prisma/client";
import { childPath, recomputeSubtree } from "../lib/org/path";
import type { OrgUnitNode, OrgUnitType } from "../lib/org/types";
import "./_load-env";

const APPLY = process.argv.includes("--apply");
const db = new PrismaClient();

/** Vùng mặc định gom CS1/CS2 — đúng cơ cấu thật (HO + CS1 + CS2 đều ở Đà Nẵng). */
const REGION_CODE = "DANANG";
const REGION_NAME = "Khối Đà Nẵng";

type Row = {
  id: string;
  code: string;
  type: string;
  parentId: string | null;
  path: string | null;
  depth: number | null;
  centerId: string | null;
};

function toNode(r: Row): OrgUnitNode {
  return {
    id: r.id,
    code: r.code,
    type: r.type as OrgUnitType,
    parentId: r.parentId,
    centerId: r.centerId,
    path: r.path,
    depth: r.depth,
  };
}

async function main() {
  const rows: Row[] = await db.orgUnit.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, type: true, parentId: true, path: true, depth: true, centerId: true },
    orderBy: { code: "asc" },
  });

  const byCode = new Map(rows.map((r) => [r.code, r]));
  const ho = byCode.get("HO");
  const root = rows.find((r) => r.type === "ROOT") ?? null;

  console.log(`\n=== DỜI CÂY TỔ CHỨC — ${APPLY ? "GHI THẬT (--apply)" : "DRY-RUN (chỉ in)"} ===\n`);
  console.log(`Đơn vị đang sống: ${rows.length}`);
  for (const r of rows) {
    console.log(
      `  ${r.code.padEnd(12)} type=${r.type.padEnd(10)} parent=${
        rows.find((x) => x.id === r.parentId)?.code ?? "—"
      } path=${r.path ?? "(chưa có)"}`,
    );
  }

  if (!ho) {
    console.error("\n❌ Không tìm thấy đơn vị code=HO. Dừng — không đoán.");
    process.exitCode = 1;
    return;
  }

  const viec: string[] = [];

  // ── 1. HO lên gốc ──────────────────────────────────────────────────────────
  if (ho.parentId !== null) viec.push(`HO: gỡ cha (đang là ${rows.find((x) => x.id === ho.parentId)?.code}) → đứng gốc`);

  // ── 2. HO nhận Center "hoi-so" (bịt Center mồ côi) ─────────────────────────
  const hoCenter = await db.center.findFirst({ where: { code: "HO" }, select: { id: true, name: true } });
  if (hoCenter && ho.centerId !== hoCenter.id) {
    viec.push(`HO: gắn centerId="${hoCenter.id}" (${hoCenter.name}) — đang mồ côi`);
  }

  // ── 3. Tạo/tìm vùng ────────────────────────────────────────────────────────
  const region = byCode.get(REGION_CODE) ?? null;
  if (!region) viec.push(`Tạo đơn vị ${REGION_CODE} (REGION, "${REGION_NAME}") dưới HO`);

  // ── 4. Dời CENTER đang treo ở ROOT/HO xuống vùng ───────────────────────────
  const centersToMove = rows.filter(
    (r) => r.type === "CENTER" && (r.parentId === root?.id || r.parentId === ho.id),
  );
  for (const c of centersToMove) viec.push(`${c.code}: dời xuống ${REGION_CODE}`);

  // ── 5. UserOrgRole đang gắn ROOT → chuyển sang HO ──────────────────────────
  let uorAtRoot = 0;
  if (root) {
    uorAtRoot = await db.userOrgRole.count({ where: { orgUnitId: root.id } });
    if (uorAtRoot > 0) {
      viec.push(
        `UserOrgRole: chuyển ${uorAtRoot} dòng từ ${root.code} sang HO ` +
          `(quyền KHÔNG đổi — isHoRoot() vốn coi ROOT ≡ HO)`,
      );
    }
  }

  // ── 6. Đóng node ROOT sau khi hết con ──────────────────────────────────────
  if (root) viec.push(`${root.code}: đóng (status=CLOSED, deletedAt) sau khi hết đơn vị con`);

  if (viec.length === 0) {
    console.log("\n✅ Cây đã đúng hình. Không có gì để làm.");
    return;
  }

  console.log(`\nSẽ làm ${viec.length} việc:`);
  viec.forEach((v, i) => console.log(`  ${i + 1}. ${v}`));

  if (!APPLY) {
    console.log("\n⚠️  DRY-RUN — chưa ghi gì. Xem kỹ danh sách trên rồi chạy lại với --apply.\n");
    return;
  }

  await db.$transaction(async (tx) => {
    if (hoCenter && ho.centerId !== hoCenter.id) {
      await tx.orgUnit.update({ where: { id: ho.id }, data: { centerId: hoCenter.id } });
    }
    if (ho.parentId !== null) {
      await tx.orgUnit.update({ where: { id: ho.id }, data: { parentId: null } });
    }

    const hoPath = childPath(null, ho.code);
    const regionRow =
      region ??
      (await tx.orgUnit.create({
        data: {
          code: REGION_CODE,
          type: "REGION",
          name: REGION_NAME,
          parentId: ho.id,
          path: childPath(hoPath, REGION_CODE),
          depth: 1,
          relationshipType: "OWNED",
          status: "ACTIVE",
        },
        select: { id: true, code: true, type: true, parentId: true, path: true, depth: true, centerId: true },
      }));
    if (region && region.parentId !== ho.id) {
      await tx.orgUnit.update({ where: { id: region.id }, data: { parentId: ho.id } });
    }

    for (const c of centersToMove) {
      await tx.orgUnit.update({ where: { id: c.id }, data: { parentId: regionRow.id } });
    }

    if (root && uorAtRoot > 0) {
      await tx.userOrgRole.updateMany({
        where: { orgUnitId: root.id },
        data: { orgUnitId: ho.id },
      });
    }

    // Tính lại path/depth CẢ CÂY từ HO (gốc mới) — cùng công thức lib/org/path.ts.
    const after: Row[] = await tx.orgUnit.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, type: true, parentId: true, path: true, depth: true, centerId: true },
    });
    for (const r of recomputeSubtree(after.map(toNode), ho.id)) {
      await tx.orgUnit.update({ where: { id: r.id }, data: { path: r.path, depth: r.depth } });
    }

    // Đóng ROOT SAU CÙNG — lúc này nó đã hết con.
    if (root) {
      const conConLai = await tx.orgUnit.count({ where: { parentId: root.id, deletedAt: null } });
      if (conConLai === 0) {
        await tx.orgUnit.update({
          where: { id: root.id },
          data: { isActive: false, status: "CLOSED", deletedAt: new Date() },
        });
      } else {
        throw new Error(
          `Node ${root.code} còn ${conConLai} đơn vị con — không đóng được. Kiểm tra rồi chạy lại.`,
        );
      }
    }
  });

  const sau: Row[] = await db.orgUnit.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, type: true, parentId: true, path: true, depth: true, centerId: true },
    orderBy: { path: "asc" },
  });
  console.log("\n✅ Xong. Cây sau khi dời:");
  for (const r of sau) console.log(`  ${(r.path ?? "?").padEnd(24)} ${r.code} (${r.type})`);
  console.log();
}

main()
  .catch((e) => {
    console.error("❌", e);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
