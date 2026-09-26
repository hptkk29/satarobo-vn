// lib/agents/tools/kinh-doanh/lay-chi-tieu.ts — công cụ 10 `kinh_doanh.lay_chi_tieu` (spec §9).
// Khuôn: `schema/chi_tieu.schema.json` — co_so, thang, hoc_vien_muc_tieu,
// ty_le_lead_len_hoc_thu, ty_le_hoc_thu_len_dang_ky. Tham số `{ thang: "YYYY-MM", co_so? }`.
//
// ── NGUỒN ────────────────────────────────────────────────────────────────────────────
// · `hoc_vien_muc_tieu` = `LeadTarget.targetCount` (SỐ HỌC SINH, bảng chỉ tiêu tháng × cơ sở
//   mà QLCS đặt ở màn Chỉ tiêu). `centerId = NULL` ở bảng này = chỉ tiêu TOÀN HỆ THỐNG ⇒ trả
//   với `co_so` = mã Hội sở.
// · Hai tỷ lệ = MỘT CẶP THAM SỐ CHUNG ở Cấu hình vận hành (chủ dự án chốt 26/09/2026):
//   `crm.targetLeadToTrialRate`, `crm.targetTrialToEnrollRate`. Mọi dòng cùng một cặp.
//
// ⚠️ `LeadTarget` ∈ SCOPE_EXEMPT (`lib/db-scope.ts`): `scopedDb` KHÔNG lọc gì. Lọc phạm vi ở
// đây là rào DUY NHẤT — dòng có mã cơ sở ngoài `ctx.phamViCoSo` bị loại; dòng có `centerId`
// không nối được cây OrgUnit bị loại (không chứng minh được nó trong phạm vi).
//
// Tháng không có dòng chỉ tiêu nào ⇒ mảng rỗng (chưa ai đặt), KHÔNG tự bịa số 0.
import { z } from "zod";
import { getSetting } from "@/lib/settings/service";
import { laThangHopLe } from "../../gateway/thoi-gian";
import { dinhNghiaCongCu } from "../kieu";
import { catTrang, kiemConTro, thamSoTrang } from "../trang";
import { docBanDoCoSo, maCoSoCua } from "../ban-do-co-so";

const chiTieu = z.object({
  co_so: z.string(),
  thang: z.string(),
  hoc_vien_muc_tieu: z.number().int(),
  ty_le_lead_len_hoc_thu: z.number(),
  ty_le_hoc_thu_len_dang_ky: z.number(),
});

export type ChiTieuAgent = z.infer<typeof chiTieu>;

export const layChiTieu = dinhNghiaCongCu({
  ten: "kinh_doanh.lay_chi_tieu",
  moTa:
    "Chỉ tiêu tuyển sinh của một tháng theo cơ sở: số học viên mục tiêu, cùng tỷ lệ chuyển đổi mục " +
    "tiêu lead → học thử và học thử → đăng ký (số thập phân, 0.35 = 35%; dùng chung mọi cơ sở). " +
    "co_so = Hội sở là chỉ tiêu toàn hệ thống.",
  cheDo: "doc",
  nhayCam: "thap",
  quyenCan: ["lead_targets:view"],
  thamSo: z
    .object({
      thang: z.string().refine(laThangHopLe, "YYYY-MM"),
      co_so: z.string().min(1).max(32).optional(),
      ...thamSoTrang,
    })
    .strict(),
  coSoCuaThamSo: (i) => (i.co_so ? [i.co_so] : null),
  ketQua: z.array(chiTieu),
  dangDuLieu: "array",
  phienBanKhuon: "1.0",
  kiemThem: (i) => kiemConTro(i),
  async thucThi(ctx, i) {
    const phamVi = new Set(ctx.phamViCoSo);
    const [ban, rows, leadLenThu, thuLenDk] = await Promise.all([
      docBanDoCoSo(ctx.sdb),
      ctx.sdb.leadTarget.findMany({
        where: { period: i.thang },
        orderBy: [{ centerId: "asc" }, { id: "asc" }],
        select: { centerId: true, period: true, targetCount: true },
      }) as Promise<{ centerId: string | null; period: string; targetCount: number }[]>,
      getSetting("crm.targetLeadToTrialRate"),
      getSetting("crm.targetTrialToEnrollRate"),
    ]);
    const ds: ChiTieuAgent[] = [];
    for (const r of rows) {
      const ma = maCoSoCua(ban, r.centerId, "hoi_so");
      if (ma === null || !phamVi.has(ma)) continue;
      ds.push({
        co_so: ma,
        thang: r.period,
        hoc_vien_muc_tieu: r.targetCount,
        ty_le_lead_len_hoc_thu: leadLenThu,
        ty_le_hoc_thu_len_dang_ky: thuLenDk,
      });
    }
    ds.sort((a, b) => a.co_so.localeCompare(b.co_so));
    return catTrang(ds, i, ctx.hanMuc);
  },
});
