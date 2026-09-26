// lib/agents/tools/kinh-doanh/lay-dang-ky.ts — công cụ 9 `kinh_doanh.lay_dang_ky` (spec §9).
// Khuôn: `schema/dang_ky.schema.json`. Tham số `{ tu_ngay, den_ngay, co_so?, gioi_han?, con_tro? }`.
// Nhạy cảm TB — KHÔNG có trường cá nhân nào (không tên bé, không SĐT): chỉ mã lead + khoá + ngày.
//
// ── MỘT DÒNG LÀ GÌ ───────────────────────────────────────────────────────────────────
// Trạng thái của một (bé × khoá) TÍNH ĐẾN HẾT NGÀY `den_ngay`, cho những bé có sự kiện trong
// khoảng — đúng hình dạng mẫu của xưởng (L-0004 xuất hiện MỘT lần, là `da_dang_ky`, kèm cả
// ngày học thử):
//   · `da_dang_ky` — ghi danh có ngày chốt trong khoảng (`confirmedAt`, trống thì `enrolledAt`);
//   · `hoan_tien`  — ghi danh đó có hoàn tiền đã duyệt trước hết `den_ngay`; cũng hiện khi CHỈ
//                    việc hoàn nằm trong khoảng (ghi danh cũ hơn);
//   · `da_hen_hoc_thu` — bé được xếp lớp trải nghiệm có ngày học thử trong khoảng (không có
//                    ngày thì lấy ngày xếp lớp) và CHƯA có dòng ghi danh trong kết quả.
// Luật chi tiết + lý do ở `dang-ky-thuan.ts`.
//
// ── NHỮNG GÌ CỐ Ý KHÔNG CÓ (nói trong `moTa` để agent biết) ─────────────────────────────
// · Ghi danh KHÔNG đi từ lead (`leadChildId` trống — tạo tay ở màn ghi danh): bỏ, theo BA
//   Q-D12. Khuôn đòi `lead_id`; bịa lead là tệ hơn bỏ.
// · Hệ học thử v1 (`TrialClass`) không đọc: đường ghi đã gỡ 28/08 và dữ liệu đã gộp sang v2
//   (`scripts/gop-trial-v1-sang-v2.ts`).
// · Khuôn không có mã bé ⇒ lead hai con học hai khoá ra hai dòng cùng `lead_id`.
//
// ── PHẠM VI + CÁCH LY ────────────────────────────────────────────────────────────────
// Mọi truy vấn lọc `centerId IN (cơ sở trong phạm vi grant)` TƯỜNG MINH — không trông vào
// `scopedDb` (user dịch vụ neo Hội sở ⇒ nó không hẹp đi). `TrialEnrollment` và `LeadChild`
// KHÔNG có cột cơ sở ⇒ chỉ đọc qua bảng cha có cơ sở (`trialClass.centerId`), không bao giờ
// truy vấn trần. `RefundRequest` ∈ SCOPE_EXEMPT ⇒ chỉ đọc qua quan hệ của `Enrollment` đã lọc.
// Ghi danh có `centerId` trống (chưa gán cơ sở) bị LOẠI — không chứng minh được nó trong phạm vi.
import { z } from "zod";
import { congNgay, dauNgayTuChuoi, laNgayHopLe, ngayVN, soNgayGiua } from "../../gateway/thoi-gian";
import { dinhNghiaCongCu } from "../kieu";
import { catTrang, kiemConTro, thamSoTrang } from "../trang";
import { centerIdTrongPhamVi, docBanDoCoSo, maCoSoCua } from "../ban-do-co-so";
import { maKhoa } from "../danh-muc/lay-khoa-hoc";
import {
  KHOA_HOC_THU,
  TRANG_THAI_DA_DANG_KY,
  TRANG_THAI_DA_HOAN,
  chonHocThu,
  danhDauDaDangKy,
  dongGhiDanh,
  ngayHocThuChoKhoa,
  ngayHocThuCua,
  sapDong,
  type DongCoMoc,
  type GhiDanhHocThu,
} from "./dang-ky-thuan";

const dangKy = z.object({
  lead_id: z.string(),
  khoa: z.string(),
  trang_thai: z.enum(["da_hen_hoc_thu", "da_dang_ky", "hoan_tien"]),
  ngay_hoc_thu: z.string().nullable(),
  ngay_dang_ky: z.string().nullable(),
  hoc_phi_niem_yet: z.number().int(),
  van_ban_khuyen_mai: z.string().nullable(),
  co_so: z.string(),
});

const ngay = z.string().refine(laNgayHopLe, "YYYY-MM-DD");

/** Select dùng chung cho mọi lượt đọc lượt xếp lớp trải nghiệm. */
const CHON_HOC_THU = {
  id: true,
  leadChildId: true,
  createdAt: true,
  scheduledSessionId: true,
  leadChild: { select: { leadId: true } },
  trialClass: {
    select: {
      id: true,
      centerId: true,
      theoKhung: true,
      courseId: true,
      sessions: { select: { id: true, date: true, status: true } },
    },
  },
} as const;

export const layDangKy = dinhNghiaCongCu({
  ten: "kinh_doanh.lay_dang_ky",
  moTa:
    "Kết quả tuyển sinh theo khoảng ngày: lead nào đã hẹn học thử (khoa = TRIAL_1_1), đã đăng ký khoá " +
    "nào, hay đã được hoàn tiền — trạng thái tính đến hết den_ngay. Mỗi dòng là một bé × một khoá (lead " +
    "nhiều con có thể ra nhiều dòng cùng lead_id). Ghi danh tạo tay không đi từ lead thì KHÔNG có ở " +
    "đây. hoc_phi_niem_yet là giá niêm yết lúc chốt (ghi danh cũ thiếu số đó thì là giá niêm yết hiện " +
    "tại của khoá; học thử = 0). co_so = Hội sở nghĩa là toàn hệ thống (Hội sở không có ghi danh riêng). " +
    "Không có thông tin cá nhân.",
  cheDo: "doc",
  nhayCam: "tb",
  quyenCan: ["trials:view", "enrollments:view-all", "refunds:view"],
  thamSo: z
    .object({
      tu_ngay: ngay,
      den_ngay: ngay,
      co_so: z.string().min(1).max(32).optional(),
      ...thamSoTrang,
    })
    .strict(),
  coSoCuaThamSo: (i) => (i.co_so ? [i.co_so] : null),
  kiemThem: (i, hanMuc) => {
    const sai = kiemConTro(i);
    const d = soNgayGiua(i.tu_ngay, i.den_ngay);
    // Khoảng ngược, hoặc dài quá trần cổng (spec §7.4 `maxRangeDays`) — tính CẢ HAI ĐẦU.
    if (d < 0 || d + 1 > hanMuc.maxRangeDays) sai.push("den_ngay");
    return sai;
  },
  ketQua: z.array(dangKy),
  dangDuLieu: "array",
  phienBanKhuon: "1.0",
  async thucThi(ctx, i) {
    const ban = await docBanDoCoSo(ctx.sdb);
    // Hội sở không có ghi danh/học thử riêng; mã HO chỉ có mặt trong phạm vi khi grant là HO (= toàn
    // hệ thống, Q-N9) ⇒ xin `co_so: "HO"` nghĩa là mọi cơ sở. Bản đầu trả mảng rỗng — nói dối agent
    // "không có ai đăng ký" (rà 26/09, AGT-04).
    const toanHeThong = ban.maHoiSo !== null && ctx.phamViCoSo.includes(ban.maHoiSo);
    const centerIds = toanHeThong ? [...ban.centerTheoMa.values()] : centerIdTrongPhamVi(ban, ctx.phamViCoSo);
    if (centerIds.length === 0) return { duLieu: [], tiepTheo: null };

    const tuTs = dauNgayTuChuoi(i.tu_ngay);
    const denTs = dauNgayTuChuoi(congNgay(i.den_ngay, 1)); // mốc TRÊN, không gồm
    const tuD = new Date(`${i.tu_ngay}T00:00:00Z`); // cột @db.Date
    const denD = new Date(`${i.den_ngay}T00:00:00Z`);
    const trongKhoang = { gte: tuTs, lt: denTs };

    const [ghiDanh, hocThu] = await Promise.all([
      ctx.sdb.enrollment.findMany({
        where: {
          deletedAt: null,
          leadChildId: { not: null },
          centerId: { in: centerIds },
          OR: [
            {
              status: { in: [...TRANG_THAI_DA_DANG_KY] },
              OR: [{ confirmedAt: trongKhoang }, { confirmedAt: null, enrolledAt: trongKhoang }],
            },
            { refundRequests: { some: { status: { in: [...TRANG_THAI_DA_HOAN] }, approvedAt: trongKhoang } } },
          ],
        },
        select: {
          id: true,
          leadChildId: true,
          courseId: true,
          centerId: true,
          listPrice: true,
          confirmedAt: true,
          enrolledAt: true,
          leadChild: { select: { leadId: true } },
          course: { select: { code: true, slug: true, price: true } },
          orderItems: { select: { orderId: true } },
          // Lượt hoàn đã duyệt MUỘN NHẤT trước hết `den_ngay` — quyết trạng thái tính đến cuối
          // khoảng. Lấy MUỘN nhất (không phải sớm nhất): có lượt hoàn nào trong khoảng thì lượt
          // muộn nhất chắc chắn nằm trong khoảng, nên phép lọc lần hai bên dưới không đánh rơi nó.
          refundRequests: {
            where: { status: { in: [...TRANG_THAI_DA_HOAN] }, approvedAt: { lt: denTs } },
            select: { approvedAt: true },
            orderBy: { approvedAt: "desc" },
            take: 1,
          },
        },
      }),
      ctx.sdb.trialEnrollment.findMany({
        where: {
          status: { not: "WITHDRAWN" },
          trialClass: { centerId: { in: centerIds }, status: { not: "CANCELLED" } },
          // Lọc THÔ ở DB (xếp lớp trong khoảng, hoặc lớp có buổi trong khoảng); lọc CHÍNH XÁC theo
          // ngày học thử ở bộ nhớ — ngày đó có bốn nguồn, không viết gọn thành một `where`.
          OR: [{ createdAt: trongKhoang }, { trialClass: { sessions: { some: { date: { gte: tuD, lte: denD } } } } }],
        },
        select: CHON_HOC_THU,
      }),
    ]);

    // Ngày học thử của các bé ĐÃ ghi danh (có thể học thử trước khoảng) — cùng phạm vi cơ sở.
    const beGhiDanh = [...new Set(ghiDanh.map((e) => e.leadChildId).filter((x): x is string => !!x))];
    const hocThuCuaBeGhiDanh =
      beGhiDanh.length === 0
        ? []
        : await ctx.sdb.trialEnrollment.findMany({
            where: {
              leadChildId: { in: beGhiDanh },
              status: { not: "WITHDRAWN" },
              trialClass: { centerId: { in: centerIds }, status: { not: "CANCELLED" } },
            },
            select: CHON_HOC_THU,
          });

    const moiHocThu = [...hocThu, ...hocThuCuaBeGhiDanh];
    const cacBe = [...new Set(moiHocThu.map((t) => t.leadChildId))];
    const [daHoc, khoaCuaLop, voucher] = await Promise.all([
      cacBe.length === 0
        ? []
        : ctx.sdb.leadTrialHistory.findMany({
            where: { leadChildId: { in: cacBe }, centerId: { in: centerIds } },
            select: { leadChildId: true, trialClassId: true, firstAttendedAt: true },
          }),
      (async () => {
        const ids = [...new Set(hocThu.map((t) => t.trialClass.courseId).filter((x): x is string => !!x))];
        return ids.length === 0
          ? []
          : ctx.sdb.course.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, slug: true } });
      })(),
      (async () => {
        const orderIds = [...new Set(ghiDanh.flatMap((e) => e.orderItems.map((o) => o.orderId)))];
        return orderIds.length === 0
          ? []
          : ctx.sdb.voucherRedemption.findMany({
              where: { orderId: { in: orderIds } },
              select: { orderId: true, voucher: { select: { policy: { select: { documentCode: true } } } } },
            });
      })(),
    ]);

    const daHocLuc = new Map(daHoc.map((h) => [`${h.leadChildId}|${h.trialClassId}`, h.firstAttendedAt]));
    const ngayCua = (t: (typeof moiHocThu)[number]): string | null => {
      const te: GhiDanhHocThu = {
        id: t.id,
        leadChildId: t.leadChildId,
        createdAt: t.createdAt,
        scheduledSessionId: t.scheduledSessionId,
        trialClassId: t.trialClass.id,
        theoKhung: t.trialClass.theoKhung,
        sessions: t.trialClass.sessions,
      };
      return ngayHocThuCua(te, daHocLuc.get(`${t.leadChildId}|${t.trialClass.id}`) ?? null);
    };
    const hocThuTheoBe = new Map<string, { courseId: string | null; ngay: string | null }[]>();
    for (const t of moiHocThu) {
      const ds = hocThuTheoBe.get(t.leadChildId) ?? [];
      ds.push({ courseId: t.trialClass.courseId, ngay: ngayCua(t) });
      hocThuTheoBe.set(t.leadChildId, ds);
    }
    const vanBanTheoDon = new Map(
      voucher
        .filter((v) => v.voucher.policy)
        .map((v) => [v.orderId, v.voucher.policy!.documentCode] as const),
    );
    const maKhoaTheoId = new Map(khoaCuaLop.map((c) => [c.id, maKhoa(c)]));

    const dong: DongCoMoc[] = [];
    const coDongGhiDanh: { leadChildId: string; courseId: string }[] = [];
    for (const e of ghiDanh) {
      const coSo = maCoSoCua(ban, e.centerId, "khong_xac_dinh");
      if (!coSo || !e.leadChild || !e.leadChildId) continue;
      const ngayDangKy = ngayVN(e.confirmedAt ?? e.enrolledAt);
      const hoan = e.refundRequests[0]?.approvedAt ?? null;
      const ngayHoan = hoan ? ngayVN(hoan) : null;
      // Lọc lần HAI ở bộ nhớ theo NGÀY VN đã tính — giữ đúng điều kiện "có sự kiện trong khoảng"
      // cho cả hai nhánh của `where`. Lưu ý: trạng thái ghi danh là trạng thái HIỆN TẠI (không có
      // lịch sử trạng thái để dựng lại tại `den_ngay`) — ghi danh chốt trong khoảng rồi sau đó bị
      // huỷ mà không hoàn tiền thì không còn ở đây.
      const coSuKien =
        (ngayDangKy >= i.tu_ngay && ngayDangKy <= i.den_ngay) ||
        (ngayHoan !== null && ngayHoan >= i.tu_ngay && ngayHoan <= i.den_ngay);
      if (!coSuKien) continue;
      coDongGhiDanh.push({ leadChildId: e.leadChildId, courseId: e.courseId });
      dong.push(
        dongGhiDanh({
          leadId: e.leadChild.leadId,
          khoa: maKhoa(e.course),
          coSo,
          ngayDangKy,
          ngayHoan,
          ngayHocThu: ngayHocThuChoKhoa(hocThuTheoBe.get(e.leadChildId) ?? [], e.courseId),
          giaNiemYet: e.listPrice ?? e.course.price,
          vanBan: e.orderItems.map((o) => vanBanTheoDon.get(o.orderId)).find((x) => !!x) ?? null,
          enrollmentId: e.id,
        }),
      );
    }

    const ungVien = hocThu.map((t) => ({
      t,
      id: t.id,
      leadChildId: t.leadChildId,
      courseId: t.trialClass.courseId,
      ngay: ngayCua(t),
      moc: ngayCua(t) ?? ngayVN(t.createdAt),
    }));
    for (const x of chonHocThu(ungVien, i.tu_ngay, i.den_ngay, danhDauDaDangKy(coDongGhiDanh))) {
      const coSo = maCoSoCua(ban, x.t.trialClass.centerId, "khong_xac_dinh");
      if (!coSo) continue;
      dong.push({
        dong: {
          lead_id: x.t.leadChild.leadId,
          khoa: KHOA_HOC_THU,
          trang_thai: "da_hen_hoc_thu",
          ngay_hoc_thu: x.ngay,
          ngay_dang_ky: null,
          hoc_phi_niem_yet: 0,
          van_ban_khuyen_mai: null,
          co_so: coSo,
          khoa_quan_tam: x.t.trialClass.courseId ? (maKhoaTheoId.get(x.t.trialClass.courseId) ?? null) : null,
        },
        moc: x.moc,
        khoaSap: `t:${x.id}`,
      });
    }

    return catTrang(sapDong(dong), i, ctx.hanMuc);
  },
});
