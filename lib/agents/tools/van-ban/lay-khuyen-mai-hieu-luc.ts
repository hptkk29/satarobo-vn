// lib/agents/tools/van-ban/lay-khuyen-mai-hieu-luc.ts — công cụ 14 `van_ban.lay_khuyen_mai_hieu_luc`.
// Khuôn: `schema/khuyen_mai.schema.json` — ma_van_ban, ten, hieu_luc_tu, hieu_luc_den,
// trang_thai, noi_dung_uu_dai. Tham số `{ ngay: "YYYY-MM-DD" }`.
//
// Spec §9: "Trả các văn bản khuyến mãi còn hiệu lực tại `ngay`, VÀ các văn bản hết hiệu lực
// trong 180 ngày trước đó (gắn `het_hieu_luc`). Nhờ vậy agent phát hiện được nội dung đang
// trích văn bản đã hết hạn."
//
// ── NGUỒN ────────────────────────────────────────────────────────────────────────────
// Bảng `PromotionPolicy` — chính sách BLĐ ban hành ở màn /khuyen-mai (26/09/2026). "Hiệu lực"
// hỏi đúng MỘT hàm `lib/khuyen-mai/hieu-luc.ts` — cùng câu trả lời Sale thấy trên màn hình.
//   · `hieu_luc_den` = ngày hiệu lực cuối THẬT SỰ (thu hồi sớm thì là ngày trước ngày thu hồi);
//   · chính sách chưa tới ngày bắt đầu KHÔNG trả (chưa hiệu lực, cũng chưa hết);
//   · chính sách thu hồi trước cả ngày bắt đầu (chưa từng hiệu lực) KHÔNG trả.
//
// Trường THÊM ngoài khuôn (spec §7.2 cho phép): `dieu_kien`, `ap_dung_co_so` (mã cơ sở, rỗng =
// toàn hệ thống), `ap_dung_khoa` (mã khoá, rỗng = mọi khoá), `ma_voucher` (mã đang bật). Không
// có tệp văn bản gốc: URL tệp là đường vào R2, không đưa ra ngoài cổng.
//
// ── PHẠM VI ──────────────────────────────────────────────────────────────────────────
// Chính sách áp toàn hệ thống ⇒ mọi grant thấy. Chính sách áp riêng vài cơ sở ⇒ chỉ grant có
// ít nhất một cơ sở đó thấy. Cơ sở của chính sách không còn trên cây ⇒ không khớp phạm vi nào
// (KHÔNG coi là toàn hệ thống — đó là mở rộng phạm vi BLĐ không ban hành).
import { z } from "zod";
import { congNgay, laNgayHopLe } from "../../gateway/thoi-gian";
import { apDungTrongPhamVi, daTungHieuLuc, ngayBatDau, ngayKetThuc } from "@/lib/khuyen-mai/hieu-luc";
import { moTaUuDaiMa } from "@/lib/khuyen-mai/mo-ta";
import { dinhNghiaCongCu } from "../kieu";
import { catTrang, kiemConTro, thamSoTrang } from "../trang";
import { docBanDoCoSo } from "../ban-do-co-so";
import { maKhoa } from "../danh-muc/lay-khoa-hoc";

/** Spec §9: văn bản hết hiệu lực trong ngần này ngày trước `ngay` vẫn trả (gắn het_hieu_luc). */
export const SO_NGAY_NHIN_LAI = 180;

const khuyenMai = z.object({
  ma_van_ban: z.string(),
  ten: z.string(),
  hieu_luc_tu: z.string(),
  hieu_luc_den: z.string(),
  trang_thai: z.enum(["dang_hieu_luc", "het_hieu_luc"]),
  noi_dung_uu_dai: z.string(),
});

type KhuyenMaiAgent = z.infer<typeof khuyenMai> & {
  dieu_kien: string | null;
  ap_dung_co_so: string[];
  ap_dung_khoa: string[];
  ma_voucher: { ma: string; uu_dai: string }[];
};

export const layKhuyenMaiHieuLuc = dinhNghiaCongCu({
  ten: "van_ban.lay_khuyen_mai_hieu_luc",
  moTa:
    "Văn bản chính sách khuyến mãi do Ban lãnh đạo Sata Robo ban hành: còn hiệu lực tại ngay (trang_thai " +
    "= dang_hieu_luc) và các văn bản đã hết hiệu lực trong 180 ngày trước đó (het_hieu_luc) — để phát " +
    "hiện tư vấn viên trích văn bản đã hết hạn. Kèm điều kiện, cơ sở/khoá áp dụng (rỗng = tất cả) và mã " +
    "voucher đang bật.",
  cheDo: "doc",
  nhayCam: "thap",
  quyenCan: ["promotions:view"],
  thamSo: z.object({ ngay: z.string().refine(laNgayHopLe, "YYYY-MM-DD"), ...thamSoTrang }).strict(),
  ketQua: z.array(khuyenMai),
  dangDuLieu: "array",
  phienBanKhuon: "1.0",
  kiemThem: (i) => kiemConTro(i),
  async thucThi(ctx, i) {
    const moc = congNgay(i.ngay, -SO_NGAY_NHIN_LAI);
    const [ban, rows] = await Promise.all([
      docBanDoCoSo(ctx.sdb),
      // Lọc THÔ ở DB theo hai cột ngày; thu hồi sớm + phạm vi lọc chính xác ở bộ nhớ.
      ctx.sdb.promotionPolicy.findMany({
        where: {
          validFrom: { lte: new Date(`${i.ngay}T00:00:00Z`) },
          validUntil: { gte: new Date(`${moc}T00:00:00Z`) },
        },
        orderBy: [{ validFrom: "desc" }, { id: "asc" }],
        select: {
          documentCode: true,
          name: true,
          benefitText: true,
          conditionText: true,
          validFrom: true,
          validUntil: true,
          revokedAt: true,
          orgUnitIds: true,
          courseIds: true,
          vouchers: {
            where: { isActive: true },
            orderBy: { code: "asc" },
            select: { code: true, discountKind: true, discountPercent: true, discountAmount: true, maxDiscount: true },
          },
        },
      }),
    ]);

    const khoaIds = [...new Set(rows.flatMap((r) => r.courseIds))];
    const khoa =
      khoaIds.length === 0
        ? []
        : await ctx.sdb.course.findMany({ where: { id: { in: khoaIds } }, select: { id: true, code: true, slug: true } });
    const maKhoaTheoId = new Map(khoa.map((k) => [k.id, maKhoa(k)]));

    const ds: KhuyenMaiAgent[] = [];
    for (const r of rows) {
      if (!daTungHieuLuc(r)) continue;
      const ketThuc = ngayKetThuc(r);
      if (ketThuc < moc) continue;
      const maCoSo = r.orgUnitIds
        .map((id) => ban.maTheoOrgUnit.get(id))
        .filter((x): x is string => !!x);
      // Có khai cơ sở mà không cơ sở nào còn trên cây ⇒ không khớp phạm vi nào (fail closed).
      if (r.orgUnitIds.length > 0 && maCoSo.length === 0) continue;
      if (!apDungTrongPhamVi(maCoSo, ctx.phamViCoSo)) continue;
      ds.push({
        ma_van_ban: r.documentCode,
        ten: r.name,
        hieu_luc_tu: ngayBatDau(r),
        hieu_luc_den: ketThuc,
        trang_thai: i.ngay <= ketThuc ? "dang_hieu_luc" : "het_hieu_luc",
        noi_dung_uu_dai: r.benefitText,
        dieu_kien: r.conditionText,
        ap_dung_co_so: maCoSo.sort(),
        ap_dung_khoa: r.courseIds.map((id) => maKhoaTheoId.get(id)).filter((x): x is string => !!x).sort(),
        ma_voucher: r.vouchers.map((v) => ({ ma: v.code, uu_dai: moTaUuDaiMa(v) })),
      });
    }
    return catTrang(ds, i, ctx.hanMuc);
  },
});
