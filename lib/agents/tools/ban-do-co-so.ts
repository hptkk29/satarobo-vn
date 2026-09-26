// lib/agents/tools/ban-do-co-so.ts — nối MÃ cơ sở của cổng ("HO", "CS1"…) với khoá nội bộ.
//
// Agent nói bằng MÃ `OrgUnit.code` (tham số `co_so`, grant, `meta.pham_vi_co_so`); bảng nghiệp
// vụ lưu `centerId` (Center.id) hoặc `orgUnitId`. Mỗi công cụ Đợt 1 phải đổi qua lại — gom một
// chỗ để không có năm cách đổi lệch nhau.
//
// ⚠️ HAI LUẬT, cả hai fail-closed:
//  1. `centerId = NULL` trên dòng nghiệp vụ nghĩa KHÁC NHAU theo bảng (`BACKFILL_SPECS`). Hàm
//     ở đây KHÔNG tự đoán: người gọi phải nói rõ NULL của bảng mình là "Hội sở" hay "không
//     xác định" (`nullLa`). Không xác định ⇒ dòng bị LOẠI, không rơi vào "HO".
//  2. `centerId` không có OrgUnit tương ứng (cơ sở chưa nối cây, đơn vị đã xoá) ⇒ LOẠI. Không
//     biết thuộc cơ sở nào thì không chứng minh được nó nằm trong phạm vi grant.
//
// Đọc qua `ctx.sdb` (OrgUnit ∈ SCOPE_EXEMPT ⇒ không lọc gì thêm) — không import DB trần.
import type { NguCanhCongCu } from "./kieu";

export type BanDoCoSo = {
  /** Mã của đơn vị HO (thường "HO"); null nếu cây chưa có HO. */
  maHoiSo: string | null;
  /** Center.id → mã OrgUnit. */
  maTheoCenter: ReadonlyMap<string, string>;
  /** OrgUnit.id → mã (chỉ HO + CENTER). */
  maTheoOrgUnit: ReadonlyMap<string, string>;
  /** Mã → Center.id (chỉ CENTER có centerId). */
  centerTheoMa: ReadonlyMap<string, string>;
};

export async function docBanDoCoSo(sdb: NguCanhCongCu["sdb"]): Promise<BanDoCoSo> {
  const rows: { id: string; code: string; type: string; centerId: string | null }[] = await sdb.orgUnit.findMany({
    where: { deletedAt: null, isActive: true, type: { in: ["HO", "CENTER"] } },
    select: { id: true, code: true, type: true, centerId: true },
  });
  return dungBanDo(rows);
}

/** THUẦN — tách khỏi truy vấn để test không cần DB. */
export function dungBanDo(rows: readonly { id: string; code: string; type: string; centerId: string | null }[]): BanDoCoSo {
  const maTheoCenter = new Map<string, string>();
  const centerTheoMa = new Map<string, string>();
  const maTheoOrgUnit = new Map<string, string>();
  let maHoiSo: string | null = null;
  for (const r of rows) {
    maTheoOrgUnit.set(r.id, r.code);
    if (r.type === "HO") {
      maHoiSo ??= r.code;
    } else if (r.centerId) {
      maTheoCenter.set(r.centerId, r.code);
      centerTheoMa.set(r.code, r.centerId);
    }
  }
  return { maHoiSo, maTheoCenter, maTheoOrgUnit, centerTheoMa };
}

/**
 * Mã cơ sở của một dòng nghiệp vụ theo `centerId`. `nullLa`:
 *   "hoi_so"        — bảng coi NULL = Hội sở / toàn hệ thống (vd `LeadTarget`, `Employee`);
 *   "khong_xac_dinh" — bảng coi NULL = chưa gán ⇒ trả null (người gọi LOẠI dòng).
 */
export function maCoSoCua(
  ban: BanDoCoSo,
  centerId: string | null,
  nullLa: "hoi_so" | "khong_xac_dinh",
): string | null {
  if (centerId === null) return nullLa === "hoi_so" ? ban.maHoiSo : null;
  return ban.maTheoCenter.get(centerId) ?? null;
}

/** Center.id của những mã CENTER nằm trong phạm vi (bỏ HO — HO không có centerId). */
export function centerIdTrongPhamVi(ban: BanDoCoSo, phamVi: readonly string[]): string[] {
  return phamVi.map((m) => ban.centerTheoMa.get(m)).filter((x): x is string => !!x);
}
