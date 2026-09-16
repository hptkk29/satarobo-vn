// lib/payments/chia-phieu-gop.ts — CHIA MỘT LẦN TIỀN VỀ CHO CÁC CON, THEO PHIẾU GỘP. Thuần.
//
// ─────────────────────────────────────────────────────────────────────────────
// VÌ SAO PHẢI CÓ BỘ CHIA THỨ HAI, TRONG KHI `planAllocation` ĐÃ TỐT
//
// `planAllocation` (allocation.ts) rót theo `sortOrder` TOÀN CỤC của đơn: hết các đợt của
// con thứ nhất rồi mới sang con thứ hai. Với tiền đi TAY KHÔNG thì đó là thứ tự duy nhất
// giải thích được, và nó vẫn là đường đúng.
//
// Nhưng nó KHÔNG giải được ca nghiệp vụ gốc của chủ dự án (đo bằng ca `[KHC-04]`):
//
//     *"đợt 1 đóng học phí cho cả 2 (hoặc cọc học phí) nhưng sang đợt 2 lại chỉ muốn đóng
//     cho 1 bạn"*
//
// Nhà chuyển đúng 2.000.000đ tiền cọc của CẢ HAI bé. Theo thứ tự toàn cục, số đó lấp trọn
// đợt 1 của bé A (1.000.000) rồi TRÀN sang đợt 2 của chính bé A — bé B vẫn trắng, và hệ
// thống đi đòi tiền cọc của một đứa trẻ mà bố mẹ vừa đóng.
//
// Không sửa được bằng cách đổi thứ tự toàn cục, vì tiền đi tay không thì hệ thống KHÔNG
// BIẾT nhà muốn gì: 2.000.000 có thể là "cọc cho hai bé", cũng có thể là "đóng trước cho
// bé A". Thứ tự nào cũng đoán sai một nửa số ca.
//
// ⇒ Thứ còn thiếu không phải một thuật toán khôn hơn, mà là **Ý ĐỊNH ĐƯỢC KHAI BÁO**. Đó
// là phiếu gộp: sale phát MỘT mã QR kèm danh sách dòng ("đợt 1 của cả nhà = bé A 1tr +
// bé B 1tr"), và tiền về khớp phiếu đó thì chia đúng theo danh sách ấy. Chủ dự án:
// *"webhook khớp phiếu → chia đích danh theo thứ tự dòng; thiếu lấp dần, thừa vào ví gia
// đình. Không chia theo tỷ lệ."*
//
// ─────────────────────────────────────────────────────────────────────────────
// KHÁC BIỆT VỚI `planAllocation` — BA ĐIỂM, ĐỪNG HỢP NHẤT HAI HÀM
//
//  1. Phạm vi: chỉ các dòng CỦA PHIẾU, không phải mọi phiếu chưa đóng của đơn.
//  2. Trần mỗi dòng: `min(phần của dòng trong phiếu, phần phiếu thu còn thiếu)` — không
//     rót quá phần đã hứa với khách trên tờ QR.
//  3. Thừa: ra VÍ GIA ĐÌNH, KHÔNG tràn sang đợt sau. Nhà chuyển dư 500.000 khi đóng cọc
//     không có nghĩa là họ muốn đóng trước đợt 2 của bé A.
//
// Hợp nhất hai hàm là đánh mất đúng ba điểm đó.

/** Một dòng của phiếu gộp, kèm tình trạng hiện tại của phiếu thu nó trỏ tới. */
export type DongPhieuGop = {
  paymentRequestId: string;
  /** Thứ tự rót đã CHỤP LẠI lúc phát phiếu (`PaymentBillLine.sortOrder`). */
  sortOrder: number;
  /** Phần của phiếu gộp dành cho dòng này (`PaymentBillLine.amount`). */
  amount: number;
  /** Tổng phải thu của phiếu thu đó (`PaymentRequest.amountDue`). */
  amountDue: number;
  /** Đã rót được bao nhiêu vào phiếu thu đó rồi (Σ `PaymentAllocation.amount`). */
  daRot: number;
};

export type KetQuaChiaPhieuGop = {
  /** Rót vào từng phiếu thu, theo đúng thứ tự đã rót. Dòng 0đ bị bỏ, không ghi. */
  lines: { paymentRequestId: string; amount: number }[];
  /** Phần thừa so với phiếu gộp → ví gia đình (`CreditBalance`). */
  du: number;
};

/**
 * Chia một lần tiền về cho các dòng của phiếu gộp.
 *
 * ⚠️ KHÔNG xử dung sai làm tròn ở đây, và đó là chủ ý: dung sai là một THAM SỐ VẬN HÀNH
 * đọc từ DB (`payment.roundingToleranceVnd`), còn hàm này phải thuần để test được không
 * cần DB. Nhà chuyển thiếu 1.000đ thì dòng cuối còn thiếu 1.000đ, và `deriveStatus` ở tầng
 * trên mới là chỗ quyết định có THA hay không — đúng một chỗ, như hôm nay.
 *
 * ⚠️ Số âm và số rác bị kẹp về 0 chứ không ném: hàm này chạy trong đường xử webhook, và
 * một ngoại lệ ở đây làm cả lượt nhận tiền thất bại — tiền đã vào tài khoản mà hệ thống
 * không ghi được gì là ca tệ nhất trong mọi ca.
 */
export function chiaTheoPhieuGop(
  soTienVe: number,
  dong: readonly DongPhieuGop[],
): KetQuaChiaPhieuGop {
  let conLai = Number.isFinite(soTienVe) ? Math.max(0, Math.round(soTienVe)) : 0;
  const lines: KetQuaChiaPhieuGop["lines"] = [];

  // Thứ tự rót là `sortOrder` của PHIẾU GỘP (đã chụp lúc phát), không phải của phiếu thu
  // hôm nay. Sale sửa kế hoạch sau khi đưa QR cho khách thì thứ tự trên tờ giấy khách
  // đang cầm vẫn là thứ tự tiền đi — đó là điều duy nhất giải thích được cho phụ huynh.
  //
  // `paymentRequestId` làm khoá phụ để hai dòng cùng `sortOrder` (dữ liệu hỏng) vẫn cho ra
  // thứ tự TẤT ĐỊNH. Ngẫu nhiên ở đây nghĩa là cùng một khoản tiền chia khác nhau giữa hai
  // lần chạy lại — không đối soát được.
  const theoThuTu = [...dong].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.paymentRequestId.localeCompare(b.paymentRequestId),
  );

  for (const d of theoThuTu) {
    if (conLai <= 0) break;

    const phanCuaDong = Number.isFinite(d.amount) ? Math.max(0, Math.round(d.amount)) : 0;
    const phaiThu = Number.isFinite(d.amountDue) ? Math.max(0, Math.round(d.amountDue)) : 0;
    const daCo = Number.isFinite(d.daRot) ? Math.max(0, Math.round(d.daRot)) : 0;

    // HAI trần, lấy cái nhỏ hơn:
    //  · phần đã hứa với khách trên tờ QR (`phanCuaDong`);
    //  · phần phiếu thu đó còn thiếu (`phaiThu - daCo`) — phiếu đã đóng đủ thì nhận 0 và
    //    tiền chảy tiếp sang dòng sau. Đây chính là "thiếu lấp dần" khi khách đã đóng lẻ
    //    một phần trước đó.
    const tran = Math.min(phanCuaDong, Math.max(0, phaiThu - daCo));
    if (tran <= 0) continue;

    const rot = Math.min(conLai, tran);
    lines.push({ paymentRequestId: d.paymentRequestId, amount: rot });
    conLai -= rot;
  }

  return { lines, du: conLai };
}

/**
 * Tổng phải thu của một phiếu gộp — số IN LÊN mã QR.
 *
 * Tách ra thành hàm (thay vì cộng tại chỗ) vì con số này phải KHỚP TỪNG ĐỒNG với Σ
 * `PaymentBillLine.amount` lưu trong DB. Hai phép cộng ở hai nơi là cách chắc chắn nhất để
 * một ngày nào đó QR in một số còn sổ ghi một số khác.
 */
export function tienPhieuGop(dong: readonly DongPhieuGop[]): number {
  return dong.reduce(
    (s, d) => s + (Number.isFinite(d.amount) ? Math.max(0, Math.round(d.amount)) : 0),
    0,
  );
}
