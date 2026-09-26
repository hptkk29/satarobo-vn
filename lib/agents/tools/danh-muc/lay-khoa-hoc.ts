// lib/agents/tools/danh-muc/lay-khoa-hoc.ts — công cụ 2 `danh_muc.lay_khoa_hoc` (spec §9).
// Khuôn: `schema/khoa_hoc.schema.json` — ma, ten, lop[], so_buoi, hoc_phi_niem_yet, trang_thai.
//
// ── NGUỒN ────────────────────────────────────────────────────────────────────────────
// Bảng `Course`, lọc ĐÚNG như form tạo đơn và màn Tra cứu của Sale (`isTeachable: true` —
// `lib/catalog/sale-catalog.ts`): agent và Sale phải thấy cùng một danh mục, không thì agent
// chấm Sale theo một bảng giá mà Sale không nhìn thấy (luật 12b: đọc số của admin, đừng dựng
// lại). Hai bản ghi "danh mục" marketing (Lập trình Robot / Luyện thi RoboSim) bị loại vì
// `isTeachable = false` trên dữ liệu thật.
//
// `hoc_phi_niem_yet` = `Course.price` THÔ — chủ dự án chốt "DB THẮNG" (`lib/gia-cong-khai.ts`).
// KHÔNG dùng chuỗi hiển thị (`giaHienThi`, "Chỉ từ …đ"): khuôn đòi số nguyên VND.
// `trang_thai`: `isActive` → "dang_ban", tắt → "tam_dung" (spec: khoá đã ngừng "có trang_thai
// = tam_dung"). Không có trạng thái thứ ba trong dữ liệu.
//
// ── `lop` ────────────────────────────────────────────────────────────────────────────
// Không có cột số. `Course.ageRange` là chuỗi tự do ("Lớp 3 – 8", "Lớp 5", có bản cũ "6-8
// tuổi"). Đọc được dạng "Lớp …" thì trả mảng lớp; dạng tuổi hoặc trống ⇒ `[]` (nói thật là
// không biết, không đoán tuổi → lớp).
//
// `diem_nhan`, `noi_lo_ph` (tuỳ chọn trong khuôn) CHƯA có nguồn — BA Q-D3: Marketing soạn,
// lưu thành trường của Course; việc riêng. Không trả trường tuỳ chọn còn hơn trả chuỗi rỗng.
//
// Không lọc theo `ctx.phamViCoSo`: danh mục khoá là toàn hệ thống, không thuộc cơ sở nào.
import { z } from "zod";
import { dinhNghiaCongCu } from "../kieu";
import { catTrang, kiemConTro, thamSoTrang } from "../trang";

const khoaHoc = z.object({
  ma: z.string(),
  ten: z.string(),
  lop: z.array(z.number().int()),
  so_buoi: z.number().int().nullable(),
  hoc_phi_niem_yet: z.number().int().nullable(),
  trang_thai: z.enum(["dang_ban", "tam_dung"]),
});

export type KhoaHocAgent = z.infer<typeof khoaHoc>;

/** Mã khoá dùng CHUNG cho mọi công cụ (`lay_khoa_hoc.ma` = `lay_dang_ky.khoa`). */
export function maKhoa(c: { code: string | null; slug: string }): string {
  const code = c.code?.trim();
  return code ? code : c.slug;
}

/**
 * "Lớp 3 – 8" → [3,4,5,6,7,8] · "Lớp 5" → [5] · "Lớp 1, 2" → [1,2] · "6-8 tuổi"/null → [].
 * Chỉ nhận lớp 1–12; khoảng ngược hoặc vượt 12 ⇒ [] (dữ liệu lạ thì nói không biết).
 */
export function lopTuChuoi(s: string | null | undefined): number[] {
  if (!s) return [];
  const t = s.normalize("NFC").toLowerCase();
  if (!/^\s*lớp\b/u.test(t)) return [];
  const so = [...t.matchAll(/\d+/g)].map((m) => Number(m[0]));
  if (so.length === 0 || so.some((n) => n < 1 || n > 12)) return [];
  const laKhoang = /\d\s*(–|—|-|đến|tới)\s*\d/u.test(t);
  if (laKhoang && so.length === 2) {
    const [a, b] = so as [number, number];
    if (b < a) return [];
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  return [...new Set(so)].sort((x, y) => x - y);
}

export const layKhoaHoc = dinhNghiaCongCu({
  ten: "danh_muc.lay_khoa_hoc",
  moTa:
    "Danh mục khoá học Sata Robo đang dạy: mã khoá, tên, các lớp phù hợp, số buổi, học phí NIÊM YẾT " +
    "(chưa trừ khuyến mãi — tra văn bản khuyến mãi bằng van_ban.lay_khuyen_mai_hieu_luc) và trạng thái " +
    "đang bán/tạm dừng. Lọc được theo trang_thai.",
  cheDo: "doc",
  nhayCam: "thap",
  quyenCan: ["courses:view"],
  thamSo: z
    .object({ trang_thai: z.enum(["dang_ban", "tam_dung"]).optional(), ...thamSoTrang })
    .strict(),
  ketQua: z.array(khoaHoc),
  dangDuLieu: "array",
  phienBanKhuon: "1.0",
  kiemThem: (i) => kiemConTro(i),
  async thucThi(ctx, i) {
    const rows: {
      id: string;
      code: string | null;
      slug: string;
      name: string;
      ageRange: string | null;
      totalSessions: number | null;
      price: number | null;
      isActive: boolean;
    }[] = await ctx.sdb.course.findMany({
      where: {
        isTeachable: true,
        ...(i.trang_thai === undefined ? {} : { isActive: i.trang_thai === "dang_ban" }),
      },
      // Thứ tự ổn định cho phân trang: displayOrder rồi id phá hoà.
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        code: true,
        slug: true,
        name: true,
        ageRange: true,
        totalSessions: true,
        price: true,
        isActive: true,
      },
    });
    const ds: KhoaHocAgent[] = rows.map((c) => ({
      ma: maKhoa(c),
      ten: c.name,
      lop: lopTuChuoi(c.ageRange),
      so_buoi: c.totalSessions,
      hoc_phi_niem_yet: c.price,
      trang_thai: c.isActive ? "dang_ban" : "tam_dung",
    }));
    return catTrang(ds, i, ctx.hanMuc);
  },
});
