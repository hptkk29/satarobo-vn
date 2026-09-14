/**
 * GIẢM GIÁ THEO TỪNG DÒNG ĐƠN — phép tính tiền ở ĐÚNG MỘT chỗ.
 *
 * ── Vì sao có file này (15/09/2026) ──
 * Chủ dự án: "giảm giá tách riêng theo từng đơn luôn chứ không gộp chung giảm tổng đơn."
 * Từ khi một đơn chở được nhiều con ([[hoc-vien-dong-don]]), một ô giảm giá cấp đơn
 * không còn trả lời được câu duy nhất đáng hỏi: **bớt cho đứa nào**. Ưu đãi thật gần
 * như luôn bám vào một em — anh chị em học cùng, học bổng, chuyển tiếp khoá.
 *
 * ⚠️ File THUẦN — KHÔNG `import "server-only"`. Form tạo đơn (client) và
 * `createOrderManualAction` (server) phải tính ra CÙNG một con số; hai bản cài đặt là
 * hai con số, và con số người bán đọc trên màn hình sẽ khác con số vào sổ.
 * `lib/orders/discount.ts` là `server-only` nên `discountFromPercent` đã dời về đây và
 * được tệp đó nhập lại — MỘT cài đặt, không phải hai.
 *
 * ── Ba bất biến, mỗi cái đều từng là một lỗ tiền ở đâu đó ──
 *  1. Giảm KHÔNG vượt tạm tính của chính dòng đó ⇒ không có dòng âm, không có đơn âm.
 *  2. `unitPrice` KHÔNG BAO GIỜ bị hạ để thay cho giảm giá. `lib/orders/price-guard.ts`
 *     so `unitPrice` với giá niêm yết để phát hiện đơn bán lệch; nhét phần giảm vào đó
 *     là làm mù cổng soát giá (lý do đầy đủ ở đầu tệp ấy, mục (c)).
 *  3. `Order.discountAmount` = ĐÚNG tổng các dòng. Nó vốn đã được đọc bởi hoá đơn · ZNS
 *     · báo cáo, nên nó phải là tổng thật chứ không phải một số nhập độc lập — hai
 *     đường nhập cho cùng một con tiền là định nghĩa của sổ lệch.
 */

/** Cách người bán gõ phần giảm. Số tiền tuyệt đối hay phần trăm của tạm tính dòng. */
export const KIEU_GIAM = {
  SO_TIEN: "SO_TIEN",
  PHAN_TRAM: "PHAN_TRAM",
} as const;
export type KieuGiam = (typeof KIEU_GIAM)[keyof typeof KIEU_GIAM];

/**
 * Số tiền giảm từ % — làm tròn, kẹp trong `[0, goc]`.
 *
 * ⚠️ Dời từ `lib/orders/discount.ts` sang (15/09/2026) vì tệp đó `server-only` mà form
 * cũng cần đúng phép tính này. Tệp cũ nhập lại từ đây; đừng chép lại thân hàm.
 */
export function discountFromPercent(goc: number, percent: number): number {
  if (!(percent > 0)) return 0;
  const pct = Math.min(100, Math.max(0, percent));
  return Math.min(goc, Math.round((goc * pct) / 100));
}

/** Phần khai giảm giá của một dòng, đúng như người bán gõ. */
export type KhaiGiamDong = {
  kieu: KieuGiam;
  /** Số tiền (VND) khi `SO_TIEN`; phần trăm (0..100) khi `PHAN_TRAM`. */
  giaTri: number;
};

export type TienDong = {
  /** `unitPrice * quantity` — TRƯỚC giảm. Đây là thứ cộng thành `Order.subtotal`. */
  tamTinh: number;
  /** Phần giảm của dòng, đã kẹp `0 ≤ giam ≤ tamTinh`. */
  giam: number;
  /** `tamTinh - giam`. Không bao giờ âm. */
  thanhTien: number;
  /** % đã gõ, giữ lại để mở đơn ra còn thấy ý định. NULL khi gõ theo số tiền. */
  phanTram: number | null;
};

/**
 * Tiền của MỘT dòng. Nhận đúng những gì dòng có, không cần biết gì về đơn.
 *
 * `quantity`/`unitPrice` âm hoặc rác ⇒ kẹp về 0 thay vì ném: hàm này chạy ở client trên
 * từng phím gõ, ném ở đó là trắng màn hình giữa lúc nhập liệu. Cổng chặn giá trị bậy là
 * validator + action, không phải hàm tính.
 */
export function tienDong(input: {
  unitPrice: number;
  quantity: number;
  giam?: KhaiGiamDong | null;
}): TienDong {
  const tamTinh = Math.max(0, Math.round(input.unitPrice)) * Math.max(0, Math.round(input.quantity));
  const khai = input.giam;

  if (!khai || !(khai.giaTri > 0)) {
    return { tamTinh, giam: 0, thanhTien: tamTinh, phanTram: null };
  }

  if (khai.kieu === KIEU_GIAM.PHAN_TRAM) {
    const pct = Math.min(100, Math.max(0, khai.giaTri));
    const giam = discountFromPercent(tamTinh, pct);
    return { tamTinh, giam, thanhTien: tamTinh - giam, phanTram: pct };
  }

  // Bất biến 1: giảm không vượt tạm tính của chính dòng — chặn ở ĐÂY chứ không ở tổng.
  // Kẹp ở tổng thì một dòng giảm lố vẫn được dòng khác "gánh hộ", và đơn vẫn ra số
  // dương trông hợp lệ trong khi một dòng đang mang giá âm.
  const giam = Math.min(tamTinh, Math.max(0, Math.round(khai.giaTri)));
  return { tamTinh, giam, thanhTien: tamTinh - giam, phanTram: null };
}

export type TienDon = {
  /** Σ tạm tính từng dòng — đặt vào `Order.subtotal`. */
  tamTinh: number;
  /** Σ giảm từng dòng — đặt vào `Order.discountAmount` (bất biến 3). */
  tongGiam: number;
  /** `tamTinh - tongGiam + phiVanChuyen` — đặt vào `Order.totalAmount`. */
  tongDon: number;
  /** Tiền của từng dòng, cùng thứ tự đầu vào. */
  dong: TienDong[];
};

/** Tiền của CẢ ĐƠN, suy từ các dòng. Không có đường nhập giảm giá nào khác. */
export function tienDon(
  dong: readonly { unitPrice: number; quantity: number; giam?: KhaiGiamDong | null }[],
  phiVanChuyen = 0,
): TienDon {
  const tung = dong.map((d) => tienDong(d));
  const tamTinh = tung.reduce((s, d) => s + d.tamTinh, 0);
  const tongGiam = tung.reduce((s, d) => s + d.giam, 0);
  return {
    tamTinh,
    tongGiam,
    tongDon: tamTinh - tongGiam + Math.max(0, Math.round(phiVanChuyen)),
    dong: tung,
  };
}

/**
 * Dòng nào CÓ giảm mà THIẾU giải trình — trả về chỉ số (0-based) của chúng.
 *
 * Cơ chế DUYỆT giảm giá đã gỡ 14/09/2026, nhưng GIẢI TRÌNH thì giữ, và hai thứ đó hay
 * bị gộp làm một. "Duyệt" là một người phải bấm trước khi đơn đi tiếp — đó là thứ đã bỏ.
 * "Giải trình" là một dòng chữ nói vì sao bớt tiền — nó chính là cái THAY THẾ cổng duyệt,
 * nên bỏ nó là bỏ cả hai.
 *
 * Trả chỉ số chứ không trả boolean: người bán cần biết DÒNG NÀO thiếu, và với đơn bốn
 * dòng thì "thiếu giải trình" không đủ để họ biết đi sửa ở đâu.
 */
export function dongThieuGiaiTrinh(
  dong: readonly { unitPrice: number; quantity: number; giam?: KhaiGiamDong | null; lyDo?: string | null }[],
): number[] {
  const ra: number[] = [];
  dong.forEach((d, i) => {
    if (tienDong(d).giam > 0 && !d.lyDo?.trim()) ra.push(i);
  });
  return ra;
}
