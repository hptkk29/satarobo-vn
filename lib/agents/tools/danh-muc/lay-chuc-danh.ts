// lib/agents/tools/danh-muc/lay-chuc-danh.ts — công cụ 5 `danh_muc.lay_chuc_danh` (spec §9).
// Khuôn: `schema/chuc_danh.schema.json` — ma, ten.
//
// Chủ dự án chốt 26/09/2026: chức danh = VAI phân quyền (`RoleDef`). Mã ở đây trùng với
// `chuc_danh` của `lay_nhan_su` (cùng luật `vai-nguoi.ts`).
//
// ⚠️ Mẫu của xưởng dùng bộ mã TGD/GDTT/TVV — hệ thống không có bộ mã đó; trả mã vai thật
// (CENTER_MANAGER, CENTER_SALES_CSM…). Xưởng ánh xạ phía họ nếu cần (BA Q-D4).
//
// Quyền `roles:view` (mới, chỉ đọc) — KHÔNG mượn `roles:manage` (quyền sửa RBAC).
import { z } from "zod";
import { dinhNghiaCongCu } from "../kieu";
import { catTrang, kiemConTro, thamSoTrang } from "../trang";
import { laVaiCuaNguoi } from "./vai-nguoi";

const chucDanh = z.object({ ma: z.string(), ten: z.string() });

export const layChucDanh = dinhNghiaCongCu({
  ten: "danh_muc.lay_chuc_danh",
  moTa:
    "Danh mục chức danh (vai trò) của nhân sự Sata Robo: mã và tên. Mã này là giá trị trường " +
    "chuc_danh của danh_muc.lay_nhan_su.",
  cheDo: "doc",
  nhayCam: "thap",
  quyenCan: ["roles:view"],
  thamSo: z.object({ ...thamSoTrang }).strict(),
  ketQua: z.array(chucDanh),
  dangDuLieu: "array",
  phienBanKhuon: "1.0",
  kiemThem: (i) => kiemConTro(i),
  async thucThi(ctx, i) {
    const rows: { code: string; name: string }[] = await ctx.sdb.roleDef.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { code: true, name: true },
    });
    const ds = rows.filter((r) => laVaiCuaNguoi(r.code)).map((r) => ({ ma: r.code, ten: r.name }));
    return catTrang(ds, i, ctx.hanMuc);
  },
});
