// lib/crm/commission-run.ts — CHỐT KỲ HOA HỒNG từ sổ tiền thật.
//
// Đây là mảnh còn thiếu suốt từ R1: engine 4 tầng (`commission.ts`) và bảng kê
// (`commission-statement.ts`) đã có và có test, nhưng KHÔNG chỗ nào trong sản phẩm
// gọi `setStatementLines` — nên bảng kê kỳ nào cũng rỗng và Sale chưa từng nhận một
// dòng hoa hồng nào. File này nối hai đầu đó vào `Payment`.
//
// ─────────────────────────────────────────────────────────────────────────────
// NGUỒN "TIỀN ĐÃ THU" — DÙNG LẠI, KHÔNG VIẾT CÔNG THỨC THỨ HAI
//
// `lib/finance/thuc-thu.ts` (quyết định B3, 24/08) là công thức thực thu DUY NHẤT của
// hệ thống — màn kế toán, ROAS, báo cáo doanh thu đều đã đi qua nó. Hoa hồng đi cùng
// một cửa: cùng `WHERE_THUC_THU`, cùng `butToanThucThu`. Nếu ngày nào luật thực thu
// đổi thì hoa hồng đổi theo, không lệch âm thầm.
//
//   CONFIRMED → cộng · REFUNDED (âm) → cộng ⇒ trừ ra · ADJUSTED → cộng và LOẠI bản gốc
//   PENDING / REJECTED → bỏ.
//
// ⚠️ CHÊNH CÓ CHỦ ĐÍCH VỚI CÔNG NỢ/CỔNG PH: `lib/finance/debt.ts` và `lib/portal/*`
// vẫn chỉ cộng `accountantStatus = CONFIRMED` (chưa chuyển sang `thuc-thu`), nên khoản
// hoàn KHÔNG làm tăng công nợ và KHÔNG trừ "đã đóng" mà phụ huynh nhìn thấy. Hoa hồng
// CỐ Ý không bắt chước chỗ đó — nó dùng bản đúng. Chênh lệch này đã được báo lại cho
// chủ dự án; sửa `debt.ts`/portal là đổi con số phụ huynh đang nhìn nên phải có quyết
// định riêng, KHÔNG gộp vào ticket hoa hồng.
//
// ─────────────────────────────────────────────────────────────────────────────
// AI HƯỞNG TẦNG NÀO — VÀ VÌ SAO HAI TẦNG CỐ Ý BỎ TRỐNG
//
//   SALE (4%)       ← `Lead.convertedById` — người CHỐT CUỐI (B5/OI-26/C10.5).
//   SALE_ADMIN (1%) ← `Lead.adminId` — Sale Admin bàn giao L1→L2.
//   QC (1%)         ← ❌ KHÔNG CÓ NGUỒN. Đặc tả chỉ nói base ("DS L3 nguồn MKT toàn
//                     TT") và "chia cho user QC phụ trách", nhưng KHÔNG bảng/cột nào
//                     định nghĩa "phụ trách". `AdsInsightDaily`/`MarketingCostPeriod`
//                     không có owner; không có model Campaign có chủ.
//   QL_TT (2%)      ← ❌ KHÔNG CÓ NGUỒN. `Center.managerName` là CHUỖI TÊN (không FK),
//                     `OrgUnit` không có `managerId`. Cơ sở có 2 người CENTER_MANAGER
//                     thì cũng không có luật chia.
//
// Bịa người hưởng cho 2 tầng đó = chuyển tiền thật vào tài khoản sai, và sai theo kiểu
// không ai soi ra vì con số vẫn "đẹp". `computeCommission()` bỏ qua tầng thiếu người
// (`if (!recipientId) continue`), nên 3% pool nằm im chờ BGĐ chốt thay vì chảy nhầm chỗ.
// `chotKyHoaHong()` trả về `chuaCoNguoiHuong` để màn chốt kỳ NÓI RA số tiền đang treo —
// im lặng mới là thứ nguy hiểm.
//
// ⚠️ KHÔNG THÊM TẦNG vào `COMMISSION_TIERS` để "vá" hai chỗ trống này. Σ 4 tầng đúng
// bằng trần 8% ⇒ tầng thứ 5 giết luôn `computeCommission()`. Nâng trần là quyết định
// chính sách tiền của BGĐ.
import { db } from "@/lib/db";
import type { AuditActor } from "@/lib/audit/audit-log";
import { WHERE_THUC_THU, butToanThucThu, SELECT_THUC_THU } from "@/lib/finance/thuc-thu";
import { pickEffectiveRates } from "@/lib/crm/commission-config";
import { setStatementLines } from "@/lib/crm/commission-statement";
import { COMMISSION_TIERS, type CommissionTier } from "@/lib/crm/commission";
import {
  khoangKy,
  tinhHoaHongTheoKy,
  type ButToanHoaHong,
  type DongHoaHongKy,
} from "@/lib/crm/commission-thuc-thu";

/** Một dòng sổ `Payment` với đúng những cột phép tính hoa hồng cần. */
export type HangThanhToanHoaHong = {
  id: string;
  amount: number;
  accountantStatus: string;
  adjustmentOfId: string | null;
  paidDate: Date;
  /** Khoản gốc bị hoàn/điều chỉnh — cho `rateDate` của bút toán hoàn. */
  adjustmentOf: { paidDate: Date } | null;
  enrollment: { renewedFromEnrollmentId: string | null } | null;
  order: {
    leadId: string | null;
    lead: { convertedById: string | null; adminId: string | null } | null;
  } | null;
};

/** `select` chuẩn — giữ khớp 1-1 với `HangThanhToanHoaHong`. */
export const SELECT_HOA_HONG = {
  ...SELECT_THUC_THU,
  paidDate: true,
  adjustmentOf: { select: { paidDate: true } },
  enrollment: { select: { renewedFromEnrollmentId: true } },
  order: {
    select: {
      leadId: true,
      lead: { select: { convertedById: true, adminId: true } },
    },
  },
} as const;

/**
 * THUẦN — dịch sổ `Payment` sang bút toán hoa hồng.
 *
 * Chạy `butToanThucThu` TRƯỚC: nó loại bản gốc đã bị một bản ADJUSTED thay thế. Lớp
 * này trùng với `WHERE_THUC_THU` ở tầng SQL và đó là CHỦ ĐÍCH — caller nào quên mảnh
 * `where` vẫn không tạo ra tiền khống.
 */
export function mapButToanHoaHong(rows: HangThanhToanHoaHong[]): ButToanHoaHong[] {
  return butToanThucThu(rows).map((r) => {
    const laHoan = r.accountantStatus === "REFUNDED";
    return {
      paymentId: r.id,
      amount: r.amount,
      // KỲ đi theo ngày bút toán vào sổ. Bút toán hoàn mang ngày HOÀN ⇒ thu hồi rơi
      // vào kỳ đang mở, không thò ngược vào kỳ đã duyệt.
      paidDate: r.paidDate,
      // TỈ LỆ đi theo kỳ GỐC với khoản hoàn: đòi lại đúng % đã trả, kể cả khi BGĐ
      // vừa đổi tỉ lệ. Mất dấu gốc thì lùi về ngày hoàn (vẫn thu hồi được).
      rateDate: laHoan ? (r.adjustmentOf?.paidDate ?? r.paidDate) : r.paidDate,
      refundOfPaymentId: laHoan ? r.adjustmentOfId : null,
      leadId: r.order?.leadId ?? null,
      isRenewal: r.enrollment?.renewedFromEnrollmentId != null,
      recipients: nguoiHuong(r.order?.lead ?? null),
    };
  });
}

/** Người hưởng từng tầng. Tầng thiếu người → bỏ trống (xem đầu file). */
function nguoiHuong(
  lead: { convertedById: string | null; adminId: string | null } | null,
): Partial<Record<CommissionTier, string>> {
  const out: Partial<Record<CommissionTier, string>> = {};
  if (lead?.convertedById) out.SALE = lead.convertedById;
  if (lead?.adminId) out.SALE_ADMIN = lead.adminId;
  return out;
}

export type KetQuaChotKy = {
  period: string;
  /** Số bút toán thực thu đã đọc trong kỳ. */
  soButToan: number;
  /** Số dòng hoa hồng đã ghi. */
  soDong: number;
  /** Tổng tiền hoa hồng của kỳ (đã trừ thu hồi). */
  tongTien: number;
  /** Tổng phần thu hồi (số âm) — tách ra để kế toán thấy ngay. */
  tongThuHoi: number;
  /**
   * Tiền hoa hồng KHÔNG chi được vì tầng chưa có người hưởng — theo tầng.
   * Đây là con số phải hiện lên màn hình, không được nuốt.
   */
  chuaCoNguoiHuong: Partial<Record<CommissionTier, number>>;
  /** Thực thu trong kỳ KHÔNG quy được về lead nào (đơn vãng lai). */
  thucThuKhongCoLead: number;
};

/**
 * Chốt (hoặc chốt lại) kỳ hoa hồng từ tiền đã thu.
 *
 * ⚠️ CHẠY LẠI KHÔNG CỘNG ĐÔI — nhưng KHÔNG nhờ khoá unique.
 * `@@unique([statementId, tier, recipientId, enrollmentId])` VÔ TÁC DỤNG với 4 tầng
 * Sale: các dòng này để `enrollmentId = NULL`, mà trong UNIQUE của Postgres NULL không
 * bằng NULL ⇒ ghi bao nhiêu lần cũng lọt (chính migration
 * `20260825110000_teacher_site_2508` nói thẳng điều đó). Khoá ấy chỉ che tầng
 * TRIAL_TEACHER, nơi `enrollmentId` luôn có giá trị.
 * Chống trùng thật nằm ở `setStatementLines`: XOÁ hết dòng 4 tầng Sale của kỳ rồi GHI
 * lại, cả hai trong MỘT transaction. Cộng với `tinhHoaHongTheoKy` tất định ⇒ chạy lần
 * thứ hai cho ra bảng kê trùng khít. Không cần migration nào.
 *
 * Kỳ đã APPROVED → `setStatementLines` ném `STATEMENT_LOCKED` (phải REOPEN bằng
 * SUPER_ADMIN). Cố ý: kỳ đã duyệt là kỳ đã trả lương.
 */
export async function chotKyHoaHong(
  actor: AuditActor,
  input: { period: string; reason?: string },
): Promise<KetQuaChotKy> {
  // Ném sớm nếu kỳ sai định dạng — đừng đi quét cả bảng Payment rồi mới biết.
  const { start, end } = khoangKy(input.period);

  const [rows, rateRows] = await Promise.all([
    db.payment.findMany({
      where: { ...WHERE_THUC_THU, paidDate: { gte: start, lt: end } },
      select: SELECT_HOA_HONG,
      orderBy: { id: "asc" }, // thứ tự ổn định ⇒ chạy lại cho ra `note` giống hệt
    }),
    db.commissionRateConfig.findMany({
      select: { tier: true, rate: true, effectiveFrom: true, effectiveTo: true },
    }),
  ]);

  const butToan = mapButToanHoaHong(rows);
  const lines = tinhHoaHongTheoKy({
    period: input.period,
    butToan,
    ratesAt: (at) => pickEffectiveRates(rateRows, at),
  });

  await setStatementLines(actor, {
    period: input.period,
    lines: lines.map((l) => ({
      tier: l.tier,
      recipientId: l.recipientId,
      amount: l.amount,
      isClawback: l.isClawback,
      leadId: l.leadId,
      note: l.note,
    })),
    reason: input.reason ?? `Chốt kỳ hoa hồng ${input.period} theo tiền đã thu`,
  });

  return thongKe(input.period, butToan, lines, (at) => pickEffectiveRates(rateRows, at));
}

/**
 * THUẦN — số liệu để màn chốt kỳ nói thật về những gì KHÔNG chi được.
 * Tách khỏi `chotKyHoaHong` để test được mà không cần DB.
 */
export function thongKe(
  period: string,
  butToan: ButToanHoaHong[],
  lines: DongHoaHongKy[],
  ratesAt: (at: Date) => Record<CommissionTier, number>,
): KetQuaChotKy {
  const chuaCoNguoiHuong: Partial<Record<CommissionTier, number>> = {};
  let thucThuKhongCoLead = 0;

  for (const bt of butToan) {
    if (bt.isRenewal) continue; // tái tục vốn không hưởng ⇒ không phải "treo"
    if (!bt.leadId) thucThuKhongCoLead += bt.amount;
    const rates = ratesAt(bt.rateDate);
    for (const tier of COMMISSION_TIERS) {
      if (bt.recipients[tier]) continue;
      chuaCoNguoiHuong[tier] =
        (chuaCoNguoiHuong[tier] ?? 0) + Math.sign(bt.amount) * Math.round(Math.abs(bt.amount) * rates[tier]);
    }
  }

  return {
    period,
    soButToan: butToan.length,
    soDong: lines.length,
    tongTien: lines.reduce((s, l) => s + l.amount, 0),
    tongThuHoi: lines.filter((l) => l.isClawback).reduce((s, l) => s + l.amount, 0),
    chuaCoNguoiHuong,
    thucThuKhongCoLead,
  };
}
