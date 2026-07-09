/**
 * scripts/rbac-parity.ts — #09 gate: đối chiếu TĨNH matrix v1 ↔ seed RoleDef v2.
 *
 *   pnpm exec tsx scripts/rbac-parity.ts
 *
 * Không cần DB, không cần traffic. Trả lời đúng câu hỏi mà shadow-compare phải chờ
 * 3-5 ngày mới trả lời được: "flip RBAC_V2_ENABLED thì ai MẤT quyền gì?"
 *
 * v1 = PERMISSIONS (lib/auth/permissions.ts, Record<Action, Role[]>).
 * v2 = ROLE_SEED   (prisma/seed-roles.ts, RoleDef → RolePermission).
 * SUPER_ADMIN bỏ qua: can() v2 bypass toàn bộ khi actor.isSuperAdmin.
 *
 * Ánh xạ legacy Role → RoleDef code lấy đúng từ LEGACY_TO_ROLEDEF của
 * prisma/patch-rbac-staff.ts (nguồn sự thật đang chạy trên prod).
 */
import { PERMISSIONS, ALL_ACTIONS } from "../lib/auth/permissions";
import { ROLE_SEED } from "../prisma/seed-roles";

/** Ánh xạ đang dùng thật trên prod (xem dry-run patch-rbac-staff 09/07). */
const LEGACY_TO_V2: Record<string, string> = {
  CENTER_MANAGER: "CENTER_MANAGER",
  SALES_CSM: "CENTER_SALES_CSM",
  TEACHER: "TEACHER",
  ACCOUNTANT: "HO_ACCOUNTANT", // Huệ = kế toán Hội sở (không centerId)
  MARKETING: "HO_MARKETING",
  HR: "CENTER_HR", // Mai@CS1, Liên@CS2 (có centerId)
  TRAINING: "TRAINING",
};

const v2ByCode = new Map(ROLE_SEED.map((r) => [r.code, new Set(r.perms.map((p) => p.action))]));

/** v1: role → tập action. */
function v1Actions(role: string): Set<string> {
  return new Set(ALL_ACTIONS.filter((a) => PERMISSIONS[a].includes(role as never)));
}

let tongMat = 0;
console.log("# Đối chiếu quyền v1 ↔ v2 (tĩnh)\n");

for (const [legacy, v2code] of Object.entries(LEGACY_TO_V2)) {
  const v1 = v1Actions(legacy);
  const v2 = v2ByCode.get(v2code);
  if (!v2) {
    console.log(`## ${legacy} → ${v2code}\n🔴 KHÔNG có RoleDef \`${v2code}\` trong seed.\n`);
    continue;
  }
  const mat = [...v1].filter((a) => !v2.has(a)).sort();
  const them = [...v2].filter((a) => !v1.has(a)).sort();
  tongMat += mat.length;

  console.log(`## ${legacy} → ${v2code}`);
  console.log(`v1: ${v1.size} action · v2: ${v2.size} action`);
  if (mat.length === 0) console.log("✅ Không mất quyền nào sau flip.");
  else {
    console.log(`🔴 MẤT ${mat.length} action sau flip #09:`);
    console.log(mat.map((a) => `   - ${a}`).join("\n"));
  }
  if (them.length) {
    console.log(`ℹ️  v2 cấp thêm ${them.length} action (v1 không có):`);
    console.log(them.map((a) => `   + ${a}`).join("\n"));
  }
  console.log("");
}

console.log(`\n# Tổng: ${tongMat} action bị mất khi flip.`);
if (tongMat > 0) {
  console.log("Mỗi dòng 🔴 = một người thật mất một chức năng thật ngay khi đổi env.");
  console.log("Xử lý: bổ sung vào prisma/seed-roles.ts (kèm scopeType đúng) → re-seed prod → chạy lại script này.");
  process.exitCode = 1;
}
