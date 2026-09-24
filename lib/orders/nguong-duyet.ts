// lib/orders/nguong-duyet.ts — ĐƠN NÀY CÓ PHẢI QUA DUYỆT KHÔNG. THUẦN, không DB.
//
// ─────────────────────────────────────────────────────────────────────────────
// Chủ dự án chốt 22/09/2026: khoá kế hoạch thanh toán ở 4 đợt + cọc, và tối đa 1 ưu đãi
// mỗi con. Vượt thì "cần quản lý duyệt thì mới được xuất mã QR".
//
// ⚠️ ĐÂY LÀ CƠ CHẾ DUYỆT THEO NGƯỠNG, KHÔNG PHẢI KHÔI PHỤC CƠ CHẾ CŨ. Cơ chế cũ (gỡ
// 13/09, `a99e777c`) bắt duyệt MỌI đơn có giảm giá — không ngưỡng. Đo prod 23/09 cho
// thấy vì sao khác biệt ấy quan trọng: phân bố số đợt là 1×1 · 2×3 · 4×2 ⇒ **0 đơn vượt
// trần 4**, và đúng **1** đơn vượt trần ưu đãi. Bật lại luật cũ là đẩy gần như mọi đơn
// vào hàng chờ; bật luật ngưỡng là chạm đúng một đơn.
//
// ─────────────────────────────────────────────────────────────────────────────
// VÌ SAO THUẦN VÀ KHÔNG `server-only`
//
// Form tạo đơn (client component) phải nói trước cho sale biết "đơn này sẽ phải chờ
// duyệt", còn server action phải QUYẾT ĐỊNH điều đó. Hai bản cài đặt là hai câu trả lời,
// và câu trên màn hình sẽ khác câu vào sổ — đúng bài học đã ghi ở đầu
// `lib/orders/giam-gia-dong.ts`. Một hàm, hai chỗ gọi.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ NGƯỠNG LÀ THAM SỐ BẮT BUỘC, CỐ Ý KHÔNG CÓ MẶC ĐỊNH (luật 7).
//
// Mặc định ở đây nguy hiểm theo chiều NỚI: người vận hành hạ trần xuống 1 mà một chỗ gọi
// quên truyền thì chỗ đó vẫn cho tới 4 — fail OPEN, tức đơn vượt chính sách vẫn xuất được
// QR và không lỗi nào báo. Bỏ mặc định thì `tsc` liệt kê đủ chỗ gọi khi con số đổi nhà.
// Cùng khuôn `tranPhanTram` của `gopGiamGia`/`tienDong`/`tienDon`.

/** Ngưỡng CHÍNH SÁCH, đọc từ tham số vận hành (`orders.maxInstallments`/`maxDiscountItems`). */
export type NguongDuyetDon = {
  /** `orders.maxInstallments` — đếm theo TỪNG CON, KHÔNG tính phiếu cọc. */
  tranSoDot: number;
  /** `orders.maxDiscountItems` — đếm theo TỪNG DÒNG đơn (mỗi con một dòng). */
  tranUuDaiMoiDong: number;
};

/**
 * Một KẾ HOẠCH ĐỢT cần xét.
 *
 * ⚠️ HÔM NAY MỘT ĐƠN CÓ ĐÚNG MỘT KẾ HOẠCH, không phải mỗi con một kế hoạch — đo prod
 * 23/09: luồng "đợt theo con" (`PaymentRequest.orderItemId NOT NULL`) có **0 dòng**. Form
 * tạo đơn khai `keHoachDot` ở cấp ĐƠN. Nên danh sách này thường chỉ có một phần tử; nó là
 * danh sách để khi yêu cầu #3 bật lên (mỗi con một kế hoạch) thì chỗ gọi truyền nhiều
 * phần tử mà KHÔNG phải đổi hàm.
 *
 * ⚠️ VÌ SAO TÁCH KHỎI `uuDaiTheoDong` thay vì gộp vào một danh sách: hai thứ đếm theo HAI
 * ĐƠN VỊ KHÁC NHAU (kế hoạch theo ĐƠN hôm nay / theo CON sau này · ưu đãi luôn theo DÒNG),
 * và số phần tử của chúng KHÁC NHAU. Bản đầu của tệp này gộp làm một `DongDeXet` mang cả
 * hai con số — nó chỉ lộ ra là sai lúc nối dây: đơn 2 con với một kế hoạch 5 đợt sẽ báo
 * CÙNG MỘT vi phạm hai lần, một lần cho mỗi con.
 */
export type KeHoachDeXet = {
  /**
   * Số ĐỢT HỌC PHÍ. KHÔNG đếm phiếu cọc.
   *
   * ⚠️ Cọc là dòng RIÊNG, ngoài 4 đợt (chủ dự án chốt 22/09: tối đa 5 dòng = cọc + 4 đợt).
   * Khuôn đếm đã có sẵn ở `ke-hoach-dot-editor.tsx`: `dots.filter((d) => !d.laCoc).length`.
   * Truyền vào đây con số ĐÃ TRỪ cọc — hàm này không đoán được dòng nào là cọc.
   */
  soDot: number;
  /** Rỗng thì câu lỗi nói "Kế hoạch thanh toán"; có tên con thì nói tên con. */
  nhan?: string;
};

/** Một DÒNG đơn (một con) và số ưu đãi chồng trên nó. */
export type DongDeXet = {
  soUuDai: number;
  /** Nhãn để câu lỗi gọi đúng tên con, vd "Bé An". Rỗng thì câu lỗi nói theo số thứ tự. */
  nhan?: string;
};

export type KetQuaXetDuyet =
  | { canDuyet: false }
  /** `lyDo` viết cho SALE đọc trên màn, mỗi vi phạm một dòng. */
  | { canDuyet: true; lyDo: string[] };

/**
 * Đơn này có phải vào hàng chờ duyệt không.
 *
 * Trả về LÝ DO chứ không chỉ boolean: sale phải biết sửa gì để khỏi phải chờ, và Quản lý
 * cơ sở phải biết mình đang duyệt cái gì. Một cổng chỉ nói "không được" là một cổng người
 * ta học cách bấm qua.
 *
 * ⚠️ KHÔNG dùng hàm này làm cổng CHẶN LƯU ĐƠN. Chủ dự án chốt: vượt trần thì đơn **vẫn lưu
 * được**, chỉ không xuất được QR. Chặn lưu là bắt sale gõ lại từ đầu một đơn đã đúng về
 * tiền — và họ sẽ lách bằng cách chia nhỏ đơn, tức mất luôn dấu vết.
 */
export function xetDuyetDon(input: {
  /** Hôm nay: 1 phần tử (kế hoạch cấp đơn). Khi bật yêu cầu #3: mỗi con một phần tử. */
  keHoach: readonly KeHoachDeXet[];
  /** Mỗi con một phần tử. */
  uuDaiTheoDong: readonly DongDeXet[];
  nguong: NguongDuyetDon;
}): KetQuaXetDuyet {
  const { keHoach, uuDaiTheoDong, nguong } = input;
  const lyDo: string[] = [];

  for (const k of keHoach) {
    if (k.soDot > nguong.tranSoDot) {
      const ten = k.nhan?.trim() || "Kế hoạch thanh toán";
      lyDo.push(
        `${ten}: chia ${k.soDot} đợt, vượt mức ${nguong.tranSoDot} đợt (cọc không tính).`,
      );
    }
  }

  uuDaiTheoDong.forEach((d, i) => {
    if (d.soUuDai > nguong.tranUuDaiMoiDong) {
      const ten = d.nhan?.trim() || `Dòng ${i + 1}`;
      lyDo.push(
        `${ten}: áp ${d.soUuDai} ưu đãi, vượt mức ${nguong.tranUuDaiMoiDong} ưu đãi một dòng.`,
      );
    }
  });

  return lyDo.length === 0 ? { canDuyet: false } : { canDuyet: true, lyDo };
}

/**
 * Câu nói cho người dùng khi đơn bị chặn XUẤT QR vì chưa duyệt.
 *
 * ⚠️ Câu lỗi nói bằng NGÔN NGỮ CỦA NGUYÊN NHÂN, không chỉ "không có quyền". Bài học đã ghi
 * trong CLAUDE.md ở cổng tạo đợt: sale đọc số trên màn rồi gõ đúng số đó, nên một câu cụt
 * lủn đọc như hệ thống bị lỗi — rồi người ta học cách bỏ qua cổng.
 */
export function loiChuaDuyet(lyDo: readonly string[]): string {
  return [
    "Đơn này vượt mức cho phép nên cần Quản lý cơ sở duyệt trước khi xuất mã QR:",
    ...lyDo.map((l) => `• ${l}`),
  ].join("\n");
}
