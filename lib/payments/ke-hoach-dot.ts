// lib/payments/ke-hoach-dot.ts — LÕI của "thanh toán linh hoạt": kế hoạch n đợt.
//
// ─────────────────────────────────────────────────────────────────────────────
// TRẦN "2 ĐỢT" KHÔNG NẰM Ở KIỂU DỮ LIỆU
//
// `OrderInstallment.soDot` là `Int` và `PaymentRequest.installmentNo` cũng vậy; sổ mới +
// QR + portal + webhook + đối soát ĐÃ n-đợt sạch. Trần 2 đợt là do MÃ: chữ ký
// `recordInstallmentPlan({dot1Amount, dot2Amount, dot2DueDate})`, validator tổng, hai lệnh
// `create` cứng, và cron nhắc nợ lọc `where: { soDot: 2 }` (⇒ đợt 3+ KHÔNG BAO GIỜ được
// nhắc). Nên đổi sang n đợt KHÔNG cần migration.
//
// ─────────────────────────────────────────────────────────────────────────────
// SỐ ĐỢT: 1/2/3/4 LÀ CHÍNH SÁCH CỦA CHỦ DỰ ÁN, KHÔNG PHẢI CÔNG VĂN
//
// Công văn nói khác hướng và phải ghi ra đây để người sau không tưởng đã thi hành:
//   · SR.QD.219 Điều 2 — "đóng toàn bộ một lần hoặc đóng theo THÁNG (chia đều 12 tháng)"
//   · SR.QD.223 — "đóng theo đợt (có thể 2 ĐỢT CÁCH 30 NGÀY)"
//   · Học phần chỉ là mốc HỌC (Điều 4: 48 buổi = 4 học phần × 12 buổi; Điều 7: cuối mỗi
//     học phần thuyết trình dự án) — không câu nào nói "đóng theo học phần".
// Thứ CÓ văn bản: bước hạn 30 ngày, trần 12 kỳ. Hai con số đó lấy từ công văn; con số 4
// là chính sách, nên nó là MẶC ĐỊNH chứ không phải hằng chặn.
// ─────────────────────────────────────────────────────────────────────────────
import { allocateByWeight } from "@/lib/finance/allocate";

/** Trần kỹ thuật — SR.QD.219 Điều 2 cho phép chia đều 12 kỳ (theo tháng). */
export const TRAN_SO_DOT = 12;

/** Bước ngày giữa hai đợt — SR.QD.223 "2 đợt cách 30 ngày". */
export const BUOC_HAN_MAC_DINH = 30;

/**
 * Chia `tongTien` thành `soDot` phần.
 *
 * ⚠️ BẤT BIẾN: Σ các phần === `tongTien`, luôn luôn. Một đồng lệch ở đây là một đồng lệch
 * giữa số phải thu của đơn và tổng phiếu thu, và nó không tự lộ ra ở màn nào.
 *
 * Không có `tiLe` → CHIA ĐỀU, phần lẻ DỒN VÀO ĐỢT CUỐI (các đợt đầu tròn số — đó là thứ
 * người thu tiền mong đợi). Có `tiLe` → dùng `allocateByWeight` (largest-remainder), vì
 * khi đã cho tỉ lệ tuỳ ý thì "đợt cuối gánh lẻ" không còn đúng hơn cách nào khác.
 *
 * Ghi chú số đo: cả 5 khoá Sata3-7 chia 1/2/3/4 đều CHẴN TUYỆT ĐỐI (giá niêm yết = 48 ×
 * bội 10.000). Phần lẻ thật đến từ giảm giá kiểu SỐ TIỀN, không từ bảng giá.
 */
export function chiaDotHocPhi(tongTien: number, soDot: number, tiLe?: number[]): number[] {
  const n = Math.floor(Number.isFinite(soDot) ? soDot : 0);
  if (n <= 0) return [];
  const tong = Number.isFinite(tongTien) ? Math.max(0, Math.round(tongTien)) : 0;

  if (tiLe && tiLe.length === n) return allocateByWeight(tong, tiLe);

  const moi = Math.floor(tong / n);
  const ra = Array.from({ length: n }, () => moi);
  ra[n - 1] = tong - moi * (n - 1);
  return ra;
}

/**
 * Hạn đóng cho từng đợt: đợt 1 đến hạn NGAY mốc, các đợt sau cách đều `buoc` ngày.
 *
 * ⚠️ Mốc BẮT BUỘC truyền vào — hàm không đọc `new Date()`. Test có ngày tuyệt đối mà hàm
 * rơi về đồng hồ thật là bom hẹn giờ: mã không đổi, tờ lịch đổi, CI đỏ (luật 19).
 *
 * ⚠️ Đợt 1 đến hạn ngay mốc là CÓ CHỦ ĐÍCH và có hệ quả: nếu đợt 1 chưa thu thì khách
 * ĐANG nợ ngay hôm đó, và cron nhắc nợ sẽ nhắc. Đó là hành vi đúng — người lập kế hoạch
 * vẫn sửa được hạn từng đợt trên form nếu muốn lùi.
 */
export function hanChoDot(moc: Date, soDot: number, buoc = BUOC_HAN_MAC_DINH): Date[] {
  const n = Math.floor(Number.isFinite(soDot) ? soDot : 0);
  if (n <= 0) return [];
  const b = Math.max(1, Math.floor(Number.isFinite(buoc) ? buoc : BUOC_HAN_MAC_DINH));
  return Array.from({ length: n }, (_, k) => {
    const d = new Date(moc.getTime());
    d.setUTCDate(d.getUTCDate() + k * b);
    return d;
  });
}

export type DotKeHoach = {
  amount: number;
  /** Đợt này đã thu tiền rồi (sale cầm tiền trước khi lưu kế hoạch). */
  daThu: boolean;
  dueDate: Date | null;
};

export type KiemKeHoachKetQua =
  | { ok: true; coDotChuaThu: boolean }
  | { ok: false; error: string; coDotChuaThu?: undefined };

const vnd = (n: number) => n.toLocaleString("vi-VN");

export function kiemKeHoachDot(dots: DotKeHoach[], totalAmount: number): KiemKeHoachKetQua {
  if (dots.length === 0) return { ok: false, error: "Kế hoạch phải có ít nhất một đợt" };
  if (dots.length > TRAN_SO_DOT) {
    return { ok: false, error: `Tối đa ${TRAN_SO_DOT} đợt` };
  }
  if (dots.some((d) => !Number.isFinite(d.amount) || d.amount < 0)) {
    return { ok: false, error: "Số tiền của đợt không hợp lệ" };
  }

  const tong = dots.reduce((s, d) => s + Math.round(d.amount), 0);
  const phai = Math.round(totalAmount);
  if (tong !== phai) {
    return { ok: false, error: `Tổng các đợt phải bằng học phí (${vnd(phai)}đ), đang là ${vnd(tong)}đ` };
  }

  // Đợt chưa thu mà không có hạn thì cron nhắc nợ không nhắc được ai, và công nợ quá hạn
  // không bao giờ hiện — khoản đó lặng lẽ biến mất khỏi mọi màn theo dõi.
  const thieuHan = dots.findIndex((d) => !d.daThu && d.dueDate == null);
  if (thieuHan >= 0) {
    return { ok: false, error: `Đợt ${thieuHan + 1} chưa thu — phải có ngày hẹn đóng` };
  }

  // ⚠️ `coDotChuaThu`, KHÔNG phải `dots.length > 1`. Kế hoạch MỘT đợt trả sau là 100% nợ
  // và phải đi qua đúng những cổng mà kế hoạch nhiều đợt đi qua; đếm số đợt thì nó lọt.
  return { ok: true, coDotChuaThu: dots.some((d) => !d.daThu) };
}

/**
 * Phân phần chênh Ledger-A cho TỪNG đợt đã thu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO KHÔNG THỂ DÙNG MỘT CON SỐ CHÊNH CHO N LỜI GỌI
 *
 * `ensureOrderPaymentRecorded` idempotent theo SỰ TỒN TẠI của marker `[auto:order-installment:dotN]`,
 * KHÔNG so số tiền: có marker thì return, không có thì `create`. Marker là per-soDot.
 *
 * Nên "tính chênh theo TỔNG rồi lặp các đợt đã thu, mỗi đợt gọi một lần" là tạo tiền mới:
 * một con số chênh, n marker khác nhau, không marker nào dedupe được marker nào ⇒ n dòng
 * Payment. Còn "dồn hết vào một marker" thì tổng đúng lúc lưu nhưng đợt 2..n PAID mà
 * KHÔNG có marker của nó — bất biến "đợt PAID ⇒ có marker dot_k" gãy, và mọi đường ghi bù
 * sau này (dữ liệu cũ, ca REJECTED→APPROVED) sẽ `create` thêm vì không thấy marker.
 *
 * Luật ở đây giữ CẢ HAI: tổng phần ghi thêm === phần còn thiếu so với sổ (R-01, không
 * cộng đôi với tiền cổng/backfill), VÀ mỗi đợt đã thu nhận phần của riêng nó theo marker
 * riêng. Đổ vào đợt ĐẦU trước — đợt sớm hơn là đợt khách đóng trước.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function phanBoGhiTheoDot(soTienCacDotDaThu: number[], daCoTrongSo: number): number[] {
  const dots = soTienCacDotDaThu.map((n) =>
    Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0,
  );
  if (dots.length === 0) return [];

  const tongKeHoach = dots.reduce((s, x) => s + x, 0);
  const daCo = Number.isFinite(daCoTrongSo) ? Math.max(0, Math.round(daCoTrongSo)) : 0;
  let conPhaiGhi = Math.max(0, tongKeHoach - daCo);

  return dots.map((amount) => {
    const ghi = Math.min(amount, conPhaiGhi);
    conPhaiGhi -= ghi;
    return ghi;
  });
}
