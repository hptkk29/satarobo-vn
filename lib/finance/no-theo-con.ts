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
  /**
   * Đợt ĐANG MỞ mà `orderItemId` là NULL — đợt của LUỒNG CŨ (mọi đơn trước 16/09).
   *
   * ⚠️ Trường này thêm ở PHIÊN B sau khi đo ra một lỗ: `con[].dotDangMo` lọc theo
   * `x.orderItemId === d.orderItemId`, nên đợt NULL KHÔNG thuộc bé nào và rơi khỏi kết quả
   * HOÀN TOÀN. Màn gắn tiền dựng danh sách đợt từ `con[]` ⇒ đơn cũ hiện ra 0 đợt để chia, và
   * cổng `kiemChiaTheoCon` từ chối chúng với câu "đợt không thuộc đơn này".
   *
   * Nghĩa là trước bản vá này, **24 giao dịch UNMATCHED của đơn cũ không gắn được bằng màn
   * mới** — đúng tập việc mà PHIÊN B sinh ra để dọn.
   */
  dotChuaGanCon: DotCuaDong[];
  /**
   * Còn nợ của **CẢ ĐƠN** = `tongPhaiThu − (tongDaThu + chuaGanCon)`.
   *
   * ⚠️ KHÁC `tongConNo`: `tongConNo` là Σ còn nợ từng con và **cố ý** không trừ khoản chưa
   * gắn con (xem chú thích `chuaGanCon`). Số đó đúng cho câu *"bé này còn nợ bao nhiêu"* và
   * SAI cho câu *"đơn này còn được phép thu thêm bao nhiêu"*. Hai câu hỏi khác nhau nên phải
   * là hai con số khác nhau — gộp lại là chỗ bug tiền nằm.
   *
   * Có thể ÂM (đơn đã đóng thừa). Trả số thô.
   */
  conNoDon: number;
  /**
   * Σ `amountDue` của **mọi** đợt đang mở của đơn, **KỂ CẢ** đợt `orderItemId` NULL.
   *
   * ⚠️ Không phải `Σ con[].tongDotDangMo` — vế đó bỏ mất đợt của luồng cũ, mà đơn trước 16/09
   * thì đợt nào cũng NULL. Dùng vế thiếu ấy làm cổng là mở toang đúng tập đơn cũ.
   */
  tongDotDangMoDon: number;
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

  const dotChuaGanCon = input.dot
    .filter((x) => x.orderItemId == null && (x.trangThai === "PENDING" || x.trangThai === "PARTIAL"))
    .sort((a, b) => {
      const ha = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
      const hb = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
      return ha - hb || a.installmentNo - b.installmentNo;
    });

  const tongPhaiThu = con.reduce((s, c) => s + c.phaiThu, 0);
  const tongDaThu = con.reduce((s, c) => s + c.daThu, 0);
  const chuaGanCon = input.khoanDaXacNhan.reduce(
    (s, k) => (k.orderItemId == null ? s + tron(k.amount) : s),
    0,
  );

  return {
    con,
    dotChuaGanCon,
    tongPhaiThu,
    tongDaThu,
    tongChoXacNhan: con.reduce((s, c) => s + c.choXacNhan, 0),
    tongConNo: con.reduce((s, c) => s + c.conNo, 0),
    chuaGanCon,
    // Cả đơn: trừ CẢ khoản chưa gắn con. Đây là số duy nhất trả lời được "đơn còn được thu
    // thêm bao nhiêu" — xem chú thích của trường.
    conNoDon: tongPhaiThu - (tongDaThu + chuaGanCon),
    // Mọi đợt đang mở của đơn = đợt của các con + đợt NULL (luồng cũ).
    tongDotDangMoDon:
      con.reduce((s, c) => s + c.tongDotDangMo, 0) +
      dotChuaGanCon.reduce((s, x) => s + tron(x.amountDue), 0),
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
 * Luật (chủ dự án chốt 17/09/2026 — **HAI VẾ**):
 *
 *     số tiền ≤ min( còn nợ con − Σ đợt mở của con ,
 *                    còn nợ ĐƠN − Σ đợt mở của cả đơn )
 *
 * với *còn nợ đơn* = Σ học phí thực các con − Σ **mọi** Payment đã thu của đơn, **kể cả khoản
 * chưa gắn con**. Không bắt lên lịch cả khoá, không trần số đợt.
 *
 * ⚠️ VẾ THỨ HAI THÊM 17/09 VÌ VẾ MỘT MÌNH KHÔNG ĐỦ — đo được, không phòng xa. `chuaGanCon` vốn
 * đã được tính từ PHIÊN A nhưng **chỉ để hiển thị**: hai màn in nó ra như một việc cần làm, và
 * không cổng nào đọc. Hệ quả trên đơn 2 con đã có 6.000.000đ vào mà chưa gắn bé nào: `conNo`
 * của từng bé không biết gì về 6 triệu ấy, nên sale tạo được các đợt cộng lại bằng TRỌN học
 * phí đơn, hệ thống phát QR đòi đủ số, và phụ huynh trả lần thứ hai phần họ đã trả.
 *
 * Đây là cùng một lớp lỗi với vế "Σ đợt đang mở" dưới đây: cổng đúng công thức nhưng **được
 * cho ăn một con số hẹp hơn sự thật**. Sửa bằng cách đưa thêm số vào cổng, không phải bằng
 * cách viết lại điều kiện ở chỗ gọi.
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
  /**
   * Còn nợ của CẢ ĐƠN — `NoTheoConKetQua.conNoDon`, đã trừ khoản chưa gắn con.
   *
   * ⚠️ BẮT BUỘC, không mặc định (luật 7). Một mặc định ở đây — kể cả
   * `Number.POSITIVE_INFINITY` — biến vế đơn thành vế im lặng không bao giờ cắn, và không có
   * gì báo cho người gọi biết họ vừa bỏ nó.
   */
  conNoDon: number;
  /** Σ đợt đang mở của CẢ ĐƠN, kể cả đợt NULL — `NoTheoConKetQua.tongDotDangMoDon`. */
  tongDotDangMoDon: number;
}): KiemTaoDot {
  const vnd = (n: number) => tron(n).toLocaleString("vi-VN");
  const soTien = tron(input.soTien);
  if (!Number.isFinite(input.soTien) || soTien <= 0) {
    return { ok: false, loi: "Số tiền đợt phải lớn hơn 0" };
  }
  const conLaiCon = tron(input.conNo) - tron(input.tongDotDangMo);
  const conLaiDon = tron(input.conNoDon) - tron(input.tongDotDangMoDon);

  if (conLaiCon <= 0) {
    return {
      ok: false,
      loi:
        `${input.tenCon}: các đợt đang mở đã phủ hết phần còn nợ ` +
        `(còn nợ ${vnd(input.conNo)}đ, đang mở ${vnd(input.tongDotDangMo)}đ)`,
    };
  }
  // Vế ĐƠN phải báo lỗi bằng NGÔN NGỮ CỦA NGUYÊN NHÂN, không phải "tối đa X đồng". Sale nhìn
  // số nợ của bé trên màn hình rồi gõ đúng số đó, nên một câu "tối đa 2.976.000đ" trong khi
  // màn in "còn nợ 8.976.000đ" đọc như hệ thống bị lỗi. Phải nói ra chỗ tiền đang nằm.
  if (conLaiDon <= 0) {
    return {
      ok: false,
      loi:
        `Cả đơn không còn phần được thu thêm (còn nợ đơn ${vnd(input.conNoDon)}đ, ` +
        `đợt đang mở của đơn ${vnd(input.tongDotDangMoDon)}đ). ` +
        `Kiểm khoản đã thu chưa gắn cho bé nào trước khi tạo đợt mới.`,
    };
  }
  if (soTien > conLaiDon) {
    return {
      ok: false,
      loi:
        `Vượt phần còn được thu của CẢ ĐƠN: tối đa ${vnd(conLaiDon)}đ ` +
        `(còn nợ đơn ${vnd(input.conNoDon)}đ − đợt đang mở của đơn ${vnd(input.tongDotDangMoDon)}đ). ` +
        `Nếu số nợ của ${input.tenCon} trông lớn hơn, đơn đang có tiền đã thu chưa gắn cho bé nào.`,
    };
  }
  if (soTien > conLaiCon) {
    return {
      ok: false,
      loi:
        `${input.tenCon}: tối đa ${vnd(conLaiCon)}đ ` +
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
