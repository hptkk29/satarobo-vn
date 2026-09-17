// Ca [NTC-*] — công nợ theo từng con + cổng tạo/huỷ đợt (PHIÊN A).
//
// Sáu nhóm chủ dự án yêu cầu, và CÁCH kiểm từng nhóm:
//   1 · tạo đợt An/Bình, vượt còn nợ → chặn      → [NTC-02] thuần
//   2 · Payment của An không đổi nợ Bình          → [NTC-01] thuần
//   3 · "Lưu kế hoạch" → số dòng Payment không đổi → [NTC-05] LƯỚI GHIM MÃ NGUỒN
//   4 · huỷ đơn → đợt chưa PAID thành VOID         → [NTC-05] LƯỚI GHIM MÃ NGUỒN
//   5 · hai người khác cơ sở → cùng con số         → [NTC-05] LƯỚI GHIM MÃ NGUỒN
//   6 · công tắc tắt/bật                           → [NTC-06] thuần + đã phủ ở `feature.test.ts`
//
// ⚠️ Vì sao 3·4·5 là lưới ghim mã nguồn chứ không phải test hành vi: cả ba là luật về HÌNH
// DẠNG ĐƯỜNG GHI ("không gọi hàm này", "phải gọi hàm kia", "đọc bằng client nào"), và đường đó
// chạm DB. `pnpm test:unit` của repo CẤM chạm DB (chốt 04/09 sau khi `resetDb()` xoá mất 250
// học viên). Một test hành vi cho chúng sẽ phải là test tích hợp — và test tích hợp thì không
// ai viết đủ ca. Theo luật 11: neo chuỗi hẹp, KHÔNG cờ `/s`, ĐẾM số lần khớp, BÓC CHÚ THÍCH.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  kiemHuyDot,
  kiemTaoDot,
  tinhNoTheoCon,
  type DotCuaDong,
  type DongDon,
} from "./no-theo-con";
import { giaiCongTac } from "./feature";
import {
  donNhanTienTuDong,
  locDonNhanTien,
  qrConRotDuocTien,
} from "@/lib/payments/don-nhan-tien";

/** Số của chủ dự án: An Sata3 8.640.000 · Bình Sata5 12.000.000. */
const AN = "oi-an";
const BINH = "oi-binh";

const dong = (): DongDon[] => [
  { orderItemId: AN, ten: "Nguyễn Minh An", khoa: "Sata3", tamTinh: 9_600_000, giam: 960_000 },
  { orderItemId: BINH, ten: "Nguyễn Minh Bình", khoa: "Sata5", tamTinh: 12_000_000, giam: 0 },
];

const dot = (
  orderItemId: string,
  installmentNo: number,
  amountDue: number,
  x: Partial<DotCuaDong> = {},
): DotCuaDong => ({
  id: `pr-${orderItemId}-${installmentNo}`,
  orderItemId,
  installmentNo,
  amountDue,
  dueDate: null,
  trangThai: "PENDING",
  daRot: 0,
  ...x,
});

describe("[NTC-01] công nợ tách theo con — tiền của bé này không đụng bé kia", () => {
  it("chưa thu gì ⇒ mỗi con nợ đúng học phí thực của mình", () => {
    const r = tinhNoTheoCon({ dong: dong(), khoanDaXacNhan: [], khoanChoXacNhan: [], dot: [] });
    expect(r.con.map((c) => c.phaiThu)).toEqual([8_640_000, 12_000_000]);
    expect(r.con.map((c) => c.conNo)).toEqual([8_640_000, 12_000_000]);
    expect(r.tongPhaiThu).toBe(20_640_000);
  });

  it("Payment gắn AN KHÔNG làm đổi còn nợ của BÌNH", () => {
    // Đây là toàn bộ điểm của phiên A. Trước khi có `Payment.orderItemId`, mọi khoản của đơn
    // đều là "tiền của đơn" và không cách nào nói bé nào đã đóng.
    const r = tinhNoTheoCon({
      dong: dong(),
      khoanDaXacNhan: [{ orderItemId: AN, amount: 4_320_000 }],
      khoanChoXacNhan: [],
      dot: [],
    });
    expect(r.con[0]!.daThu).toBe(4_320_000);
    expect(r.con[0]!.conNo).toBe(4_320_000);
    expect(r.con[1]!.daThu).toBe(0);
    expect(r.con[1]!.conNo).toBe(12_000_000); // KHÔNG đổi
  });

  it("khoản CHƯA XÁC NHẬN ra cột riêng, KHÔNG trừ vào còn nợ", () => {
    // Nói với phụ huynh rằng họ hết nợ rồi sau đó gọi lại đòi tiếp (vì kế toán từ chối khoản
    // đó) là thứ không sửa được bằng một bản vá.
    const r = tinhNoTheoCon({
      dong: dong(),
      khoanDaXacNhan: [],
      khoanChoXacNhan: [{ orderItemId: AN, amount: 4_320_000 }],
      dot: [],
    });
    expect(r.con[0]!.choXacNhan).toBe(4_320_000);
    expect(r.con[0]!.conNo).toBe(8_640_000); // vẫn nợ đủ
  });

  it("khoản CHƯA GẮN CON ra ô riêng, không cộng vào bé nào", () => {
    // 24 khoản / 178.544.000đ của prod nằm đúng ở đây.
    const r = tinhNoTheoCon({
      dong: dong(),
      khoanDaXacNhan: [{ orderItemId: null, amount: 5_000_000 }],
      khoanChoXacNhan: [],
      dot: [],
    });
    expect(r.chuaGanCon).toBe(5_000_000);
    expect(r.tongDaThu).toBe(0);
    expect(r.con.every((c) => c.daThu === 0)).toBe(true);
  });

  it("đóng THỪA ⇒ còn nợ ÂM, trả số thô chứ không kẹp về 0", () => {
    // Kẹp về 0 là giấu mất chuyện khách đã trả dư — và đó là việc kế toán phải xử.
    const r = tinhNoTheoCon({
      dong: dong(),
      khoanDaXacNhan: [{ orderItemId: AN, amount: 9_000_000 }],
      khoanChoXacNhan: [],
      dot: [],
    });
    expect(r.con[0]!.conNo).toBe(-360_000);
  });

  it("chỉ đợt PENDING/PARTIAL là 'đang mở'; VOID và PAID không tính", () => {
    const r = tinhNoTheoCon({
      dong: dong(),
      khoanDaXacNhan: [],
      khoanChoXacNhan: [],
      dot: [
        dot(AN, 1, 4_320_000),
        dot(AN, 2, 1_000_000, { trangThai: "VOID" }),
        dot(AN, 3, 2_000_000, { trangThai: "PAID" }),
        dot(AN, 4, 500_000, { trangThai: "PARTIAL", daRot: 100_000 }),
      ],
    });
    expect(r.con[0]!.dotDangMo.map((d) => d.installmentNo)).toEqual([1, 4]);
    expect(r.con[0]!.tongDotDangMo).toBe(4_820_000);
  });

  it("đợt sắp theo HẠN SỚM trước; đợt KHÔNG hạn xuống CUỐI", () => {
    // Đợt thiếu hạn là đợt chưa ai xếp lịch, không phải đợt gấp nhất — để nó lên đầu là đảo
    // ngược thứ tự nhắc nợ.
    const r = tinhNoTheoCon({
      dong: dong(),
      khoanDaXacNhan: [],
      khoanChoXacNhan: [],
      dot: [
        dot(AN, 1, 1_000_000, { dueDate: null }),
        dot(AN, 2, 1_000_000, { dueDate: new Date("2026-12-01T00:00:00Z") }),
        dot(AN, 3, 1_000_000, { dueDate: new Date("2026-10-01T00:00:00Z") }),
      ],
    });
    expect(r.con[0]!.dotDangMo.map((d) => d.installmentNo)).toEqual([3, 2, 1]);
  });
});

describe("[NTC-02] cổng TẠO ĐỢT", () => {
  it("An 4.320.000 và Bình 6.000.000 — tạo được", () => {
    expect(kiemTaoDot({ soTien: 4_320_000, conNo: 8_640_000, tongDotDangMo: 0, tenCon: "An" })).toEqual({
      ok: true,
      soTien: 4_320_000,
    });
    expect(kiemTaoDot({ soTien: 6_000_000, conNo: 12_000_000, tongDotDangMo: 0, tenCon: "Bình" })).toEqual({
      ok: true,
      soTien: 6_000_000,
    });
  });

  it("VƯỢT còn nợ ⇒ chặn, và câu lỗi nói TÊN CON + SỐ TỐI ĐA", () => {
    const r = kiemTaoDot({ soTien: 8_640_001, conNo: 8_640_000, tongDotDangMo: 0, tenCon: "An" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.loi).toContain("An");
    expect(r.ok === false && r.loi).toContain("8.640.000");
  });

  it("phải trừ Σ ĐỢT ĐANG MỞ — nếu không, hai QR cùng đòi đủ tiền", () => {
    // Đây là lỗi tiền im lặng: không cổng nào khác canh, và nó chỉ lộ ra khi khách đã chuyển
    // gấp đôi. An còn nợ 8.640.000 nhưng đã có một đợt mở 4.320.000 ⇒ tối đa còn 4.320.000.
    expect(
      kiemTaoDot({ soTien: 4_320_000, conNo: 8_640_000, tongDotDangMo: 4_320_000, tenCon: "An" }).ok,
    ).toBe(true);
    const vuot = kiemTaoDot({
      soTien: 4_320_001,
      conNo: 8_640_000,
      tongDotDangMo: 4_320_000,
      tenCon: "An",
    });
    expect(vuot.ok).toBe(false);
    expect(vuot.ok === false && vuot.loi).toContain("4.320.000");
  });

  it("đợt đang mở đã phủ hết nợ ⇒ chặn với lý do RIÊNG, không phải 'vượt'", () => {
    const r = kiemTaoDot({ soTien: 1, conNo: 8_640_000, tongDotDangMo: 8_640_000, tenCon: "An" });
    expect(r.ok === false && r.loi).toContain("đã phủ hết");
  });

  it("số tiền ≤ 0 hoặc rác ⇒ chặn", () => {
    for (const x of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        kiemTaoDot({ soTien: x, conNo: 8_640_000, tongDotDangMo: 0, tenCon: "An" }).ok,
        String(x),
      ).toBe(false);
    }
  });

  it("KHÔNG có trần số đợt — sale tạo bao nhiêu đợt cũng được nếu tổng không vượt", () => {
    // Chủ dự án: *"Không bắt lên lịch cả khoá, không trần số đợt."* Đây là điểm khác hẳn kế
    // hoạch trả góp cũ (trần 12 đợt).
    let daMo = 0;
    for (let i = 0; i < 40; i++) {
      const r = kiemTaoDot({ soTien: 100_000, conNo: 8_640_000, tongDotDangMo: daMo, tenCon: "An" });
      expect(r.ok, `đợt thứ ${i + 1}`).toBe(true);
      daMo += 100_000;
    }
  });
});

describe("[NTC-03] cổng HUỶ ĐỢT", () => {
  it("đợt chưa có tiền ⇒ huỷ được", () => {
    expect(kiemHuyDot({ trangThai: "PENDING", daRot: 0 }).ok).toBe(true);
  });

  it("đợt ĐÃ CÓ TIỀN ⇒ không huỷ, kể cả 1đ", () => {
    const r = kiemHuyDot({ trangThai: "PENDING", daRot: 1 });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.loi).toContain("không huỷ được");
  });

  it("đo bằng `daRot`, KHÔNG bằng trạng thái — trạng thái có lúc chưa kịp tính lại", () => {
    // Một đợt còn `PENDING` mà đã có tiền rót vào vẫn là đợt có tiền. Tin `trangThai` ở đây là
    // huỷ mất một đợt đang giữ tiền thật.
    expect(kiemHuyDot({ trangThai: "PENDING", daRot: 500_000 }).ok).toBe(false);
    expect(kiemHuyDot({ trangThai: "VOID", daRot: 0 }).ok).toBe(false);
  });
});

describe("[NTC-04] tổng đơn = Σ các con", () => {
  it("cộng đúng, và KHÔNG đọc `Order.totalAmount`", () => {
    const r = tinhNoTheoCon({
      dong: dong(),
      khoanDaXacNhan: [
        { orderItemId: AN, amount: 4_320_000 },
        { orderItemId: BINH, amount: 6_000_000 },
      ],
      khoanChoXacNhan: [],
      dot: [],
    });
    expect(r.tongDaThu).toBe(10_320_000);
    expect(r.tongConNo).toBe(10_320_000);
    expect(r.tongConNo).toBe(r.con.reduce((s, c) => s + c.conNo, 0));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LƯỚI GHIM MÃ NGUỒN — ba luật về HÌNH DẠNG đường ghi
// ─────────────────────────────────────────────────────────────────────────────

/** Bóc chú thích để lưới soi MÃ, không soi lời kể. `/\r?\n/` + `[^\n]*` — xem `feature.test.ts`. */
function docMa(duong: string): string {
  return readFileSync(resolve(process.cwd(), duong), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((d) => d.replace(/\/\/[^\n]*$/, ""))
    .join("\n");
}

describe("[NTC-05] ba lỗ đã bịt — luật về hình dạng đường ghi", () => {
  it("LỖ 1 · 'Lưu kế hoạch' KHÔNG chạm `Payment` khi công tắc bật", () => {
    // Chủ dự án: *"Lưu/sửa đợt không bao giờ chạm dòng Payment đã có."* Phép xoá mềm sinh ra
    // cho luồng CŨ (nơi kế hoạch tự đẻ dòng Ledger-A rồi phải tự dọn). Luồng MỚI không đẻ dòng
    // nào ⇒ mọi `Payment` đang có đều là TIỀN THẬT.
    const src = docMa("lib/orders/installments.ts");
    // Phải đọc cờ, và đọc theo cơ sở GIỮ ĐƠN (không theo người bấm).
    expect(src.match(/laThuTienLinhHoatBat\(\s*order\.orgUnitId\s*\)/g) ?? []).toHaveLength(1);
    // Và phép xoá mềm phải nằm TRONG nhánh cờ-tắt.
    const khoi = /if \(!batLuongMoi\) \{[\s\S]*?\n {4}\}/.exec(src)?.[0] ?? "";
    expect(khoi).not.toBe("");
    expect(khoi).toContain("tx.payment.updateMany");
    // Đúng MỘT chỗ xoá mềm Payment trong cả tệp — thêm chỗ thứ hai là mở lại lỗ.
    expect(src.match(/tx\.payment\.updateMany/g) ?? []).toHaveLength(1);
  });

  it("LỖ 2 · huỷ đơn PHẢI VOID mọi phiếu chưa PAID", () => {
    const src = docMa("app/(admin)/admin/orders/_actions.ts");
    const khoi = /if \(parsed\.data\.toStatus === "CANCELLED"\) \{[\s\S]*?\n {4}\}/.exec(src)?.[0] ?? "";
    expect(khoi).not.toBe("");
    expect(khoi).toContain("tx.paymentRequest.updateMany");
    // PARTIAL phải nằm trong danh sách: đó là phiếu khách ĐÃ từng quét thành công một lần —
    // phiếu nguy hiểm nhất, không phải phiếu để tha.
    expect(khoi).toMatch(/status:\s*\{\s*in:\s*\["PENDING",\s*"PARTIAL"\]\s*\}/);
    // Và mã QR đang sống phải chết theo, kẻo affordance nói dối.
    expect(khoi).toContain("tx.qrSession.updateMany");
  });

  it("LỖ 3 · vị từ 'đơn nhận tiền tự động' đúng HÀNH VI, cả ba vế là VÀ", () => {
    // ⚠️ Ca này viết lại sau một lượt cấy LỌT. Bản đầu soi VĂN BẢN `payos-ingest.ts` và đếm số
    // lần `TRANG_THAI_DON_KHONG_NHAN_TIEN` xuất hiện. Đổi một dấu `&&` thành `||` trong biểu
    // thức gác — cổng mở toang, mà mọi chuỗi lưới tìm vẫn còn nguyên nên nó VẪN XANH.
    //
    // Soi văn bản ĐẾM được số lần xuất hiện nhưng KHÔNG kiểm được phép nối. Nên luật đã tách
    // thành hàm THUẦN (`lib/payments/don-nhan-tien.ts`) và ca này kiểm HÀNH VI.
    const ok = { trangThaiDon: "PENDING_PAYMENT", donDaXoa: false, trangThaiPhieu: "PENDING" };
    expect(donNhanTienTuDong(ok)).toBe(true);
    for (const st of ["DRAFT", "CANCELLED", "REFUNDED"]) {
      expect(donNhanTienTuDong({ ...ok, trangThaiDon: st }), st).toBe(false);
    }
    expect(donNhanTienTuDong({ ...ok, donDaXoa: true })).toBe(false);
    expect(donNhanTienTuDong({ ...ok, trangThaiPhieu: "VOID" })).toBe(false);
    // Và mỗi vế phải TỰ MÌNH đủ để từ chối — đó là thứ `||` nhầm chỗ phá mất.
    expect(donNhanTienTuDong({ trangThaiDon: "CANCELLED", donDaXoa: false, trangThaiPhieu: "PENDING" })).toBe(false);
    expect(donNhanTienTuDong({ trangThaiDon: "PENDING_PAYMENT", donDaXoa: false, trangThaiPhieu: "VOID" })).toBe(false);
  });

  it("LỖ 3 · bản nhận `null` — không có phép nối nào để lật", () => {
    expect(qrConRotDuocTien(null)).toBe(false);
    expect(qrConRotDuocTien(undefined)).toBe(false);
    expect(
      qrConRotDuocTien({ status: "PENDING", order: { status: "PENDING_PAYMENT", deletedAt: null } }),
    ).toBe(true);
    expect(
      qrConRotDuocTien({ status: "PENDING", order: { status: "CANCELLED", deletedAt: null } }),
    ).toBe(false);
    expect(
      qrConRotDuocTien({ status: "VOID", order: { status: "PENDING_PAYMENT", deletedAt: null } }),
    ).toBe(false);
    expect(
      qrConRotDuocTien({ status: "PENDING", order: { status: "PENDING_PAYMENT", deletedAt: new Date() } }),
    ).toBe(false);
  });

  it("LỖ 3 · mảnh lọc `where` nói ĐÚNG một luật với vị từ thuần", () => {
    // Hai hình dạng của cùng một luật (một cho Prisma, một cho TS thuần) là hai chỗ để lệch.
    // Ca này ghim chúng vào nhau: sửa danh sách ở hằng thì cả hai đổi theo, quên sửa một bên
    // thì đỏ ở đây.
    expect(locDonNhanTien()).toEqual({
      deletedAt: null,
      status: { notIn: ["DRAFT", "CANCELLED", "REFUNDED"] },
    });
    expect(locDonNhanTien()).not.toBe(locDonNhanTien());
    // Danh sách trên đã bị `toEqual` ghim, nên lặp trên chính nó là đủ để nối hai hình dạng:
    // đổi hằng mà quên một bên ⇒ `toEqual` đỏ; giữ danh sách mà đổi vị từ ⇒ vòng này đỏ.
    for (const st of ["DRAFT", "CANCELLED", "REFUNDED"]) {
      expect(donNhanTienTuDong({ trangThaiDon: st, donDaXoa: false, trangThaiPhieu: "PENDING" }), st).toBe(false);
    }
  });

  it("LỖ 3 · CẢ BỐN nhánh tra đơn đều đi qua luật đó", () => {
    // ⚠️ PHIÊN A chỉ vá (a) và (b). Ca này viết lại ở PHIÊN B sau khi đo ra nhánh (c) — nhánh
    // của nội dung CK đời cũ `ORD…D<số>`, tức nhánh dữ liệu THẬT đi qua nhiều nhất — chưa hề
    // được kiểm, và nhánh (d) thì đúng luật nhưng bằng một mảng gõ tay riêng.
    const src = docMa("lib/payments/payos-ingest.ts");
    // (a) matchKey · (c) orderCode · (d) SĐT — cả ba nhét mảnh lọc vào `where` của Prisma.
    expect(src.match(/locDonNhanTien\(\)/g) ?? []).toHaveLength(3);
    // (b) QrSession: `findUnique` khoá theo `providerOrderCode` nên phải lọc SAU khi tra ⇒ vị từ.
    expect(src.match(/qrConRotDuocTien\(/g) ?? []).toHaveLength(1);
    // ⚠️ Và nhánh đó phải là MỘT LỜI GỌI TRẦN, không có `&&` nào ghép vào — xem chú thích
    // `qrConRotDuocTien`: một `&&` đổi thành `||` là cổng mở mà lưới vẫn xanh.
    expect(src).toMatch(/const qrConHieuLuc = qrConRotDuocTien\(phieuCuaQr\);/);
    expect(src).toMatch(/status:\s*\{\s*not:\s*"VOID"\s*\}/);
    // Không còn bản CHÉP TAY nào của danh sách trạng thái trong tệp này.
    expect(src).not.toMatch(/notIn:\s*\[\s*"DRAFT"/);
    // Và nhánh (c) phải là `findFirst`: `findUnique` chỉ nhận đúng khoá, không nhét lọc vào được.
    // ⚠️ Neo vào TRA-THEO-`code`, không phải mọi `findUnique`: tệp còn một câu tra theo `id`
    // CHẠY SAU khi đã resolve xong (`where: { id: target.orderId }`) — đơn đó đã qua cổng rồi,
    // cấm nó là cấm nhầm và sẽ đẩy người sau đi vòng.
    expect(src).toMatch(/where:\s*\{\s*code,\s*\.\.\.locDonNhanTien\(\)\s*\}/);
    expect(src).not.toMatch(/findUnique\(\{\s*where:\s*\{\s*code[,:]/);
  });

  it("LỖ 3 · đường SePay đi CHUNG tầng đối khớp — không có cổng thứ hai", () => {
    // Câu hỏi của chủ dự án: SePay có qua `resolvePaymentTargetDetailed` không.
    // ĐO ĐƯỢC: có, ở CẢ HAI nhánh của route (nhánh "không tra ra đơn" và nhánh CONFIRM) —
    // cả hai đều gọi `ingestPayosWebhook`, mà hàm đó gọi `resolvePaymentTargetDetailed`.
    // Nên bốn ca trên đã phủ luôn SePay, không cần vá riêng.
    const rt = docMa("app/api/public/webhook/sepay/route.ts");
    expect(rt.match(/ingestPayosWebhook\(/g) ?? []).toHaveLength(2);
    const ing = docMa("lib/payments/payos-ingest.ts");
    expect(ing).toMatch(/const resolved = await resolvePaymentTargetDetailed\(data\);/);
    // Còn đơn XOÁ MỀM ở route thì tầng base lo: `Order` ∈ `SOFT_DELETE_MODELS`, và hook
    // `findUnique` của `lib/db.ts` lọc hậu kỳ trả `null`. Đã thử vá thêm ở route rồi HOÀN
    // NGUYÊN — vá một lỗ không tồn tại thì chỗ vá ấy sẽ được ai đó tin là có lý do.
    expect(rt).toMatch(/db\.order\.findUnique\(/);
  });

  it("LUẬT 5 · `noTheoCon` đọc bằng `db` TRẦN — ai mở đơn cũng ra CÙNG con số", () => {
    // Chủ dự án: *"KHÔNG lọc theo scopedDb/cơ sở của người xem."* `Payment` nằm trong
    // `SCOPED_MODELS` và KHÔNG nằm trong `NULL_IS_GLOBAL_MODELS`, nên đọc qua `scopedDb` là
    // con số "đã thu" KHÁC NHAU tuỳ ai mở màn — và không lỗi nào báo.
    // ⚠️ SỬA 17/09/2026 — PHIÊN B tách thân thật ra `docSoTheoCon(doc, orderId)` để đường GHI
    // đọc được BÊN TRONG transaction đang giữ khoá của đơn. `noTheoCon` nay chỉ còn là cửa
    // ĐỌC-HIỂN-THỊ và uỷ quyền với `db` TRẦN. Luật không đổi một chữ; chỗ phải soi thì đổi.
    const src = docMa("lib/finance/debt.ts");
    expect(src).toMatch(
      /export async function noTheoCon\(orderId: string\): Promise<NoTheoConKetQua> \{\s*return docSoTheoCon\(db, orderId\);/,
    );
    const than = /export async function docSoTheoCon\([\s\S]*?\n\}/.exec(src)?.[0] ?? "";
    expect(than).not.toBe("");
    expect(than).not.toMatch(/\bsdb\./);
    expect(than).not.toContain("scopedDb");
    // Và nó phải thật sự đọc ba bảng qua client ĐƯỢC TRUYỀN VÀO — nếu không thì phép khẳng
    // định trên là rỗng.
    for (const bang of [
      "doc.orderItem.findMany",
      "doc.payment.findMany",
      "doc.paymentRequest.findMany",
    ]) {
      expect(than, bang).toContain(bang);
    }
  });

  it("LƯỚI CANH LƯỚI · phép bóc chú thích thật sự bóc", () => {
    // Một phép bóc hỏng bóc được 0 dòng và trông y hệt một phép bóc đang làm việc — đã trả giá
    // hai lần trong ngày 16/09.
    const src = docMa("lib/orders/installments.ts");
    expect(src.split(/\r?\n/).some((d) => d.trimStart().startsWith("//"))).toBe(false);
    expect(src).toContain("export async function recordInstallmentPlan");
  });
});

describe("[NTC-06] CÔNG TẮC — tắt thì luồng cũ y nguyên", () => {
  it("tắt ⇒ khối công nợ theo con KHÔNG dựng (trang không thêm truy vấn nào)", () => {
    const src = docMa("app/(admin)/admin/orders/[id]/page.tsx");
    // Ghim đúng hình dạng "tắt thì không tính": biểu thức điều kiện, không phải tính rồi ẩn.
    expect(src).toMatch(/batThuTheoCon \? await noTheoCon\(order\.id\) : null/);
    expect(src).toMatch(/\{soTheoCon && \(/);
  });

  it("hai action đợt-theo-con đều GÁC công tắc", () => {
    const src = docMa("app/(admin)/admin/orders/_actions.ts");
    for (const ten of ["taoDotChoConAction", "huyDotChoConAction"]) {
      // Neo vào `}` ĐỨNG MỘT MÌNH trên dòng (`\n}\n`), không phải `\n}` — dấu `}` đóng khối
      // THAM SỐ (`}) {`) cũng nằm đầu dòng, nên `\n}` cắt thân hàm ngay ở chữ ký và mọi phép
      // khẳng định phía sau thành vô nghĩa. Đã đỏ một lượt vì đúng chuyện này.
      const than =
        new RegExp(`export async function ${ten}\\([\\s\\S]*?\\n\\}\\n`).exec(src)?.[0] ?? "";
      expect(than, ten).not.toBe("");
      expect(than, ten).toContain("laThuTienLinhHoatBat");
    }
  });

  it("phép giải công tắc vẫn đúng cả hai chiều (nhắc lại từ `feature.test.ts`)", () => {
    expect(giaiCongTac({ toanHe: false, coSo: true })).toBe(true);
    expect(giaiCongTac({ toanHe: true, coSo: false })).toBe(false);
  });
});

describe("[NTC-07] đợt CHƯA GẮN CON — đơn cũ không được rơi khỏi kết quả", () => {
  // ⚠️ Nhóm này thêm 17/09. Trước đó `tinhNoTheoCon` lọc đợt theo `x.orderItemId === d.orderItemId`
  // nên đợt NULL không thuộc bé nào và BIẾN MẤT khỏi kết quả — màn gắn dựng danh sách từ `con[]`
  // nên đơn trước 16/09 hiện ra 0 đợt để chia.
  const dotChung = (installmentNo: number, amountDue: number, x: Partial<DotCuaDong> = {}) =>
    ({ ...dot("", installmentNo, amountDue, x), orderItemId: null }) as DotCuaDong;

  it("đợt NULL đang mở ra `dotChuaGanCon`, KHÔNG lẫn vào bé nào", () => {
    const r = tinhNoTheoCon({
      dong: dong(),
      khoanDaXacNhan: [],
      khoanChoXacNhan: [],
      dot: [dot(AN, 1, 3_000_000), dotChung(1, 5_000_000)],
    });
    expect(r.dotChuaGanCon.map((d) => d.amountDue)).toEqual([5_000_000]);
    // Không bé nào nhận đợt chung — nếu lẫn vào, `tongDotDangMo` của bé đó phình lên và cổng
    // tạo đợt sẽ chặn oan.
    expect(r.con.find((c) => c.orderItemId === AN)!.tongDotDangMo).toBe(3_000_000);
    expect(r.con.find((c) => c.orderItemId === BINH)!.tongDotDangMo).toBe(0);
  });

  it("chỉ đợt ĐANG MỞ — VOID/PAID không vào danh sách", () => {
    const r = tinhNoTheoCon({
      dong: dong(),
      khoanDaXacNhan: [],
      khoanChoXacNhan: [],
      dot: [
        dotChung(1, 1_000_000, { trangThai: "PENDING" }),
        dotChung(2, 2_000_000, { trangThai: "PARTIAL" }),
        dotChung(3, 3_000_000, { trangThai: "PAID" }),
        dotChung(4, 4_000_000, { trangThai: "VOID" }),
      ],
    });
    expect(r.dotChuaGanCon.map((d) => d.installmentNo)).toEqual([1, 2]);
  });

  it("xếp theo hạn rồi tới số đợt; đợt KHÔNG hạn xuống cuối", () => {
    const r = tinhNoTheoCon({
      dong: dong(),
      khoanDaXacNhan: [],
      khoanChoXacNhan: [],
      dot: [
        dotChung(3, 1_000_000),
        dotChung(1, 1_000_000, { dueDate: new Date("2026-12-01") }),
        dotChung(2, 1_000_000, { dueDate: new Date("2026-10-01") }),
      ],
    });
    expect(r.dotChuaGanCon.map((d) => d.installmentNo)).toEqual([2, 1, 3]);
  });
});
