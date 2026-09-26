// lib/agents/tools/danh-muc/lay-co-so.ts — công cụ 1 `danh_muc.lay_co_so` (spec §9).
// Khuôn: `schema/co_so.schema.json` của xưởng — id, ten, phap_nhan, dia_chi, la_trung_tam.
//
// Nguồn: cây OrgUnit (loại HO + CENTER). `id` là MÃ đơn vị ("HO", "CS1"…), đúng thứ agent
// dùng lại ở tham số `co_so` của các công cụ khác.
//
// ⚠️ `OrgUnit` và `Center` nằm trong `SCOPE_EXEMPT` (`lib/db-scope.ts`) ⇒ `scopedDb` KHÔNG tự
// lọc. Hai lớp lọc ở đây là bắt buộc, không phải trang trí:
//   1. theo phạm vi grant (`ctx.phamViCoSo`) — agent chỉ thấy cơ sở được cấp;
//   2. theo `can(actor, "centers:view", …)` của user dịch vụ — nếu vai dịch vụ không nhìn
//      thấy một cơ sở trong phạm vi grant thì TỪ CHỐI, không lặng lẽ bỏ dòng (fail closed:
//      agent phải biết cấu hình đang lệch, không được tưởng cơ sở đó không tồn tại).
//
//   ⚠️ NÓI THẬT (rà bảo mật 25/09): với cấu hình Đợt 0, lớp 2 KHÔNG BAO GIỜ loại được dòng
//   nào — user dịch vụ neo vai `AGENT_*` ở Hội sở (`quan-tri/client.ts`) ⇒ `centerScope =
//   "ALL"`, và vai seed `centers:view` GLOBAL. Rào THẬT của công cụ này là lớp 1 (phạm vi
//   grant). Lớp 2 giữ lại cho ngày có vai dịch vụ neo ở một cơ sở; muốn nó có nghĩa hôm nay
//   thì phải đổi nơi neo — quyết định riêng, không làm lặng ở đây.
//
// `phap_nhan` lấy từ `OrgUnit.legalEntity` gần nhất đi ngược lên cây — theo DỮ LIỆU hệ thống,
// không theo tên trong mẫu của xưởng (mẫu còn ghi hai pháp nhân khác nhau cho CS1/CS2, trong
// khi quyết định BLĐ 22/09/2026 đã gộp về SATA ROBO — BA Q-D1).
import { z } from "zod";
import { can } from "@/lib/auth/can";
import { LoiCong } from "../../gateway/loi";
import { dinhNghiaCongCu } from "../kieu";

const coSo = z.object({
  id: z.string(),
  ten: z.string(),
  phap_nhan: z.string(),
  dia_chi: z.string(),
  la_trung_tam: z.boolean(),
});

export type CoSoAgent = z.infer<typeof coSo>;

type DongDonVi = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  type: string;
  parentId: string | null;
  centerId: string | null;
  legalEntity: { legalName: string } | null;
};

/** Pháp nhân gần nhất đi ngược lên cây (đơn vị con không khai thì kế thừa cha). */
export function phapNhanGanNhat(
  id: string,
  theoId: ReadonlyMap<string, Pick<DongDonVi, "parentId" | "legalEntity">>,
): string | null {
  const daQua = new Set<string>();
  let cur: string | null = id;
  while (cur && !daQua.has(cur)) {
    daQua.add(cur);
    const n = theoId.get(cur);
    if (!n) return null;
    if (n.legalEntity?.legalName) return n.legalEntity.legalName;
    cur = n.parentId;
  }
  return null;
}

export const layCoSo = dinhNghiaCongCu({
  ten: "danh_muc.lay_co_so",
  moTa:
    "Danh sách Hội sở và các trung tâm của Sata Robo mà agent được cấp: mã (dùng làm tham số " +
    "co_so ở công cụ khác), tên, pháp nhân, địa chỉ, có phải trung tâm đào tạo không.",
  cheDo: "doc",
  nhayCam: "thap",
  quyenCan: ["centers:view"],
  thamSo: z.object({}).strict(),
  ketQua: z.array(coSo),
  dangDuLieu: "array",
  phienBanKhuon: "1.0",
  async thucThi(ctx) {
    const phamVi = new Set(ctx.phamViCoSo);
    // Đọc CẢ cây còn sống (bảng rất nhỏ) để đi ngược tìm pháp nhân; lọc phạm vi SAU.
    const tatCa: DongDonVi[] = await ctx.sdb.orgUnit.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        address: true,
        type: true,
        parentId: true,
        centerId: true,
        legalEntity: { select: { legalName: true } },
      },
    });
    const theoId = new Map(tatCa.map((u) => [u.id, u]));
    const chon = tatCa
      .filter((u) => (u.type === "HO" || u.type === "CENTER") && phamVi.has(u.code))
      .sort((a, b) => (a.type === b.type ? a.code.localeCompare(b.code) : a.type === "HO" ? -1 : 1));

    // Lớp lọc 2 — RBAC của user dịch vụ, qua `can()` (luật cứng #1: không so tay).
    for (const u of chon) {
      const thay = u.centerId
        ? can(ctx.actor, "centers:view", { centerId: u.centerId })
        : can(ctx.actor, "centers:view");
      if (!thay) throw new LoiCong("KHONG_DU_QUYEN");
    }

    const centerIds = chon.map((u) => u.centerId).filter((x): x is string => !!x);
    const centers =
      centerIds.length === 0
        ? []
        : await ctx.sdb.center.findMany({
            where: { id: { in: centerIds } },
            select: { id: true, address: true },
          });
    const diaChiCenter = new Map(centers.map((c) => [c.id, c.address]));

    const duLieu: CoSoAgent[] = chon.map((u) => ({
      id: u.code,
      ten: u.name,
      phap_nhan: phapNhanGanNhat(u.id, theoId) ?? "",
      dia_chi: u.address ?? (u.centerId ? diaChiCenter.get(u.centerId) : null) ?? "",
      la_trung_tam: u.type === "CENTER",
    }));
    return { duLieu, tiepTheo: null };
  },
});
