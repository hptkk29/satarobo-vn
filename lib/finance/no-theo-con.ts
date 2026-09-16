// lib/finance/no-theo-con.ts — CÔNG NỢ THEO TỪNG CON. Thuần, không chạm DB.
//
// ─────────────────────────────────────────────────────────────────────────────
// PHIÊN A · Chủ dự án chốt 16/09/2026
//
//   *"Phải thu con = học phí thực của orderItem (sau giảm). Đã thu con = Σ Payment của
//   orderItem đó. Còn nợ con = phải thu − đã thu. Đơn = Σ các con."*
//
// Phần THUẦN nằm ở đây; phần đọc DB nằm ở `debt.ts` (nhà duy nhất của mọi phép cộng tiền).
// Tách đôi để mọi luật ở đây kiểm được không cần Postgres — `pnpm test:unit` CẤM chạm DB.
//
// ─────────────────────────────────────────────────────────────────────────────
// TẬP TRẠNG THÁI `Payment` ĐƯỢC CỘNG — NÓI RÕ MỘT LẦN, DÙNG Ở MỌI CHỖ
//
// "Đã thu" ở đây là **TRỤC A**: `accountantStatus = CONFIRMED` và `deletedAt IS NULL`
// (`KHOAN_DA_XAC_NHAN` trong `debt.ts`). Không phải "mọi dòng Payment".
//
// Vì sao trục A chứ không phải "mọi khoản đã ghi nhận":
//   · Đây là con số đi vào câu "bé này còn nợ bao nhiêu" mà sale đọc cho phụ huynh. Một khoản
//     kế toán chưa xác nhận có thể bị TỪ CHỐI, và khi đó số nợ tăng lại — nói với phụ huynh
//     rằng họ hết nợ rồi sau đó gọi lại đòi tiếp là thứ không sửa được bằng một bản vá.
//   · Toàn bộ phần còn lại của repo đã cộng theo trục A (`KHOAN_DA_XAC_NHAN` dùng ở
//     `debt.ts`, `sumConfirmed`, `computeEnrollmentDebt`). Thêm một định nghĩa "đã thu" thứ
//     sáu là đúng thứ module này sinh ra để chấm dứt.
//
// Tiền ĐÃ VỀ mà kế toán chưa xác nhận KHÔNG biến mất — nó ra `choXacNhan`, một cột RIÊNG.
// Màn hình phải in cả hai; gộp chúng lại là làm mất đúng thông tin mà kế toán cần.

/** Một dòng hàng của đơn, đã có sẵn số tiền. Người gọi nạp từ DB. */
export type DongDon = {
  orderItemId: string;
  /** Tên hiển thị (tên con / tên sản phẩm) — `OrderItem.itemName`. */
  ten: string;
  /** Khoá học, nếu dòng là ghi danh. */
  khoa: string | null;
  /** Tạm tính TRƯỚC giảm: `unitPrice × quantity` (= `OrderItem.totalPrice`). */
  tamTinh: number;
  /** Giảm giá của RIÊNG dòng (`OrderItem.discountAmount`). */
  giam: number;
};

/** Một khoản tiền đã gắn vào dòng. Người gọi đã lọc theo tập trạng thái. */
export type KhoanCuaDong = {
  orderItemId: string | null;
  amount: number;
};

/** Một đợt thu của dòng. */
export type DotCuaDong = {
  id: string;
  orderItemId: string | null;
  installmentNo: number;
  amountDue: number;
  dueDate: Date | null;
  /** `PaymentRequest.status`. */
  trangThai: "PENDING" | "PARTIAL" | "PAID" | "VOID";
  /** Σ `PaymentAllocation.amount` đã rót vào đợt này. */
  daRot: number;
};

export type NoCuaCon = {
  orderItemId: string;
  ten: string;
  khoa: string | null;
  /** Học phí thực của con = tạm tính − giảm giá của dòng. */
  phaiThu: number;
  /** TRỤC A — xem chú thích đầu file. */
  daThu: number;
  /** Tiền đã về mà kế toán CHƯA xác nhận. KHÔNG trừ vào `conNo`. */
  choXacNhan: number;
  /** `phaiThu − daThu`. Có thể ÂM (đóng thừa) — trả số thô, màn hình tự diễn giải. */
  conNo: number;
  /** Các đợt CHƯA đóng xong của con (PENDING/PARTIAL), theo hạn rồi tới số đợt. */
  dotDangMo: DotCuaDong[];
  /** Σ `amountDue` của các đợt đang mở — dùng cho cổng "tạo đợt không vượt còn nợ". */
  tongDotDangMo: number;
};

export type NoTheoConKetQua = {
  con: NoCuaCon[];
  /** Σ các con. KHÔNG đọc `Order.totalAmount` — xem chú thích dưới. */
  tongPhaiThu: number;
  tongDaThu: number;
  tongChoXacNhan: number;
  tongConNo: number;
  /**
   * Tiền đã vào đơn nhưng CHƯA gắn dòng nào (`Payment.orderItemId IS NULL`).
   *
   * ⚠️ KHÔNG cộng vào `tongDaThu`, và đó là chủ ý: khoản chưa gắn con thì không nói được
   * bé nào hết nợ. Cộng nó vào tổng sẽ làm tổng đơn "đúng" trong khi từng con vẫn sai — đúng
   * kiểu số liệu khiến người ta tin nhầm. Đây chính là 24 khoản / 178.544.000đ trên prod, và
   * màn hình phải HIỆN nó ra như một việc cần làm.
   */
  chuaGanCon: number;
};

const tron = (n: number) => (Number.isFinite(n) ? Math.round(n) : 0);

/**
 * Tính công nợ từng con của một đơn. THUẦN.
 *
 * ⚠️ `tongPhaiThu` là Σ các dòng, KHÔNG phải `Order.totalAmount`. Hai số đó có thể lệch nhau
 * (header đơn đến từ đường ghi riêng ở `backfill-order.ts` / `ghi-giao-dich-cu.ts` và không
 * phải lúc nào cũng do các dòng sinh ra). Lấy Σ dòng là lấy con số mà TỪNG CON cộng lại ra —
 * nếu nó lệch `totalAmount` thì đó là một sự thật phải thấy, không phải thứ để che bằng cách
 * đọc header.
 */
export function tinhNoTheoCon(input: {
  dong: readonly DongDon[];
  khoanDaXacNhan: readonly KhoanCuaDong[];
  khoanChoXacNhan: readonly KhoanCuaDong[];
  dot: readonly DotCuaDong[];
}): NoTheoConKetQua {
  const cong = (ds: readonly KhoanCuaDong[], id: string) =>
    ds.reduce((s, k) => (k.orderItemId === id ? s + tron(k.amount) : s), 0);

  const con: NoCuaCon[] = input.dong.map((d) => {
    const phaiThu = Math.max(0, tron(d.tamTinh) - tron(d.giam));
    const daThu = cong(input.khoanDaXacNhan, d.orderItemId);
    const choXacNhan = cong(input.khoanChoXacNhan, d.orderItemId);
    const dotDangMo = input.dot
      .filter(
        (x) =>
          x.orderItemId === d.orderItemId &&
          (x.trangThai === "PENDING" || x.trangThai === "PARTIAL"),
      )
      // Hạn sớm trước; đợt không hạn xuống cuối (không phải "đầu" — đợt thiếu hạn là đợt
      // chưa ai xếp lịch, không phải đợt gấp nhất).
      .sort((a, b) => {
        const ha = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
        const hb = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
        return ha - hb || a.installmentNo - b.installmentNo;
      });

    return {
      orderItemId: d.orderItemId,
      ten: d.ten,
      khoa: d.khoa,
      phaiThu,
      daThu,
      choXacNhan,
      conNo: phaiThu - daThu,
      dotDangMo,
      tongDotDangMo: dotDangMo.reduce((s, x) => s + tron(x.amountDue), 0),
    };
  });

  return {
    con,
    tongPhaiThu: con.reduce((s, c) => s + c.phaiThu, 0),
    tongDaThu: con.reduce((s, c) => s + c.daThu, 0),
    tongChoXacNhan: con.reduce((s, c) => s + c.choXacNhan, 0),
    tongConNo: con.reduce((s, c) => s + c.conNo, 0),
    chuaGanCon: input.khoanDaXacNhan.reduce(
      (s, k) => (k.orderItemId == null ? s + tron(k.amount) : s),
      0,
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CỔNG TẠO ĐỢT
// ─────────────────────────────────────────────────────────────────────────────

export type KiemTaoDot =
  | { ok: true; soTien: number }
  | { ok: false; loi: string };

/**
 * Tạo được một đợt số tiền này cho con này không.
 *
 * Luật (chủ dự án chốt): *"số tiền > 0 và ≤ còn nợ con − Σ đợt đang mở của con. Không bắt lên
 * lịch cả khoá, không trần số đợt."*
 *
 * ⚠️ Trừ **Σ đợt đang mở** chứ không chỉ so với còn nợ. Bỏ vế đó là sale tạo được hai đợt,
 * mỗi đợt bằng trọn số nợ — rồi hệ thống phát hai mã QR, mỗi mã đòi đủ tiền, và phụ huynh nào
 * quét cả hai thì trả gấp đôi. Đây là lỗi tiền im lặng: không cổng nào khác canh, và nó chỉ lộ
 * ra khi khách đã chuyển.
 *
 * ⚠️ KHÔNG có trần số đợt và KHÔNG bắt lên lịch cả khoá — đó là toàn bộ điểm khác của phiên
 * này so với kế hoạch trả góp cũ. Sale tạo một đợt khi phụ huynh nói sẽ đóng bao nhiêu, không
 * phải khai trước cả năm.
 */
export function kiemTaoDot(input: {
  soTien: number;
  conNo: number;
  tongDotDangMo: number;
  tenCon: string;
}): KiemTaoDot {
  const vnd = (n: number) => tron(n).toLocaleString("vi-VN");
  const soTien = tron(input.soTien);
  if (!Number.isFinite(input.soTien) || soTien <= 0) {
    return { ok: false, loi: "Số tiền đợt phải lớn hơn 0" };
  }
  const conLai = tron(input.conNo) - tron(input.tongDotDangMo);
  if (conLai <= 0) {
    return {
      ok: false,
      loi:
        `${input.tenCon}: các đợt đang mở đã phủ hết phần còn nợ ` +
        `(còn nợ ${vnd(input.conNo)}đ, đang mở ${vnd(input.tongDotDangMo)}đ)`,
    };
  }
  if (soTien > conLai) {
    return {
      ok: false,
      loi:
        `${input.tenCon}: tối đa ${vnd(conLai)}đ ` +
        `(còn nợ ${vnd(input.conNo)}đ − đợt đang mở ${vnd(input.tongDotDangMo)}đ)`,
    };
  }
  return { ok: true, soTien };
}

/**
 * Huỷ được đợt này không.
 *
 * Luật: *"Huỷ đợt chưa có tiền: được. Đợt đã có tiền: không huỷ."*
 *
 * ⚠️ "Có tiền" đo bằng `daRot` (Σ phân bổ THẬT), KHÔNG bằng `trangThai`. Trạng thái là thứ
 * tính lại được và có lúc chưa kịp tính; số tiền đã rót thì không nói dối. Một đợt còn
 * `PENDING` mà đã có 1đ rót vào vẫn là đợt có tiền.
 */
export function kiemHuyDot(dot: Pick<DotCuaDong, "trangThai" | "daRot">): KiemTaoDot {
  if (dot.trangThai === "VOID") return { ok: false, loi: "Đợt này đã huỷ rồi" };
  if (tron(dot.daRot) > 0) {
    return {
      ok: false,
      loi: `Đợt đã nhận ${tron(dot.daRot).toLocaleString("vi-VN")}đ — không huỷ được. Sửa bằng cách tạo đợt mới cho phần còn lại.`,
    };
  }
  return { ok: true, soTien: 0 };
}
