// tests/finance/cong-tao-dot.test.ts — CỔNG TẠO ĐỢT phải trừ KHOẢN CHƯA GẮN CON, trên Postgres THẬT.
//
// ─────────────────────────────────────────────────────────────────────────────
// Chạy:  pnpm test:finance-db      (CI: job "Chat DB invariants", một required check)
// `pnpm test:unit` trần sẽ SKIP — thiếu `ALLOW_DB_RESET=1`, xem tests/_helpers/db-gate.ts.
// Bộ này KHÔNG gọi `resetDb()`: fixture tự dựng, tự dọn theo tiền tố id.
//
// ─────────────────────────────────────────────────────────────────────────────
// LUẬT ĐANG KHOÁ — chủ dự án chốt 17/09/2026
//
//     số tiền đợt ≤ min( còn nợ con − Σ đợt mở của con ,
//                        còn nợ ĐƠN − Σ đợt mở của cả đơn )
//
// với *còn nợ đơn* = Σ học phí thực các con − Σ **mọi** Payment đã thu của đơn, **kể cả khoản
// chưa gắn con** (`Payment.orderItemId IS NULL`).
//
// ─────────────────────────────────────────────────────────────────────────────
// VÌ SAO KHÔNG THỂ CHỈ LÀ TEST THUẦN
//
// Phần số học của cổng đã thuần và đã phủ ở `lib/finance/no-theo-con.test.ts`
// (`[NTC-02b]`, `[NTC-02c]`). Nhưng con bug KHÔNG nằm ở số học — nó nằm ở chỗ `taoDotChoCon`
// **cho cổng ăn con số nào**. Đúng lớp lỗi của `[DS-01b]`: hàm thuần test bao nhiêu cũng xanh
// trong khi lời gọi truyền một hằng hẹp hơn sự thật.
//
// Kiểm được điều đó thì phải có đường thật: `Payment` với `orderItemId` NULL nằm trong DB,
// `docSoTheoCon` đọc nó ra, `ghiTienChoDon` khoá đơn, rồi cổng mới nhận số. Đó là luật 9 —
// *cổng phải được cho ăn bằng thứ đường THẬT cho nó ăn*; ca test gõ tay đầu vào của cổng thì
// nó kiểm cổng, không kiểm hệ thống.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { RUN_DB_TESTS, LY_DO_BO_QUA } from "@/tests/_helpers/db-gate";
import { noTheoCon } from "@/lib/finance/debt";
import { taoDotChoCon } from "@/lib/finance/ghi-tien-don";

if (!RUN_DB_TESTS) console.warn(`[CTD] BỎ QUA bộ chạm DB: ${LY_DO_BO_QUA}`);

const T = "fx-ctd-";
const ACTOR = { id: `${T}actor`, name: "Sale fixture" };

const DON = `${T}don`;
const AN = `${T}item-an`;
const BINH = `${T}item-binh`;

/** Mỗi bé 6.000.000đ ⇒ đơn phải thu 12.000.000đ. Số của chủ dự án. */
const HOC_PHI_MOI_BE = 6_000_000;
const DA_THU_CHUA_GAN = 6_000_000;

async function don() {
  await db.paymentAllocation.deleteMany({ where: { paymentRequest: { orderId: DON } } });
  await db.payment.deleteMany({ where: { orderId: DON } });
  await db.paymentRequest.deleteMany({ where: { orderId: DON } });
  await db.orderItem.deleteMany({ where: { orderId: DON } });
  await db.order.deleteMany({ where: { id: DON } });
}

/**
 * Đơn HAI CON × 6.000.000đ, **chưa có đợt nào**, và **6.000.000đ đã thu mang
 * `orderItemId = NULL`** — đúng hình dạng 146 khoản đang nằm trên prod.
 *
 * ⚠️ `accountantStatus: "CONFIRMED"` là bắt buộc: "đã thu" của module này là TRỤC A
 * (`KHOAN_DA_XAC_NHAN`). Một khoản `RECORDED` sẽ ra `choXacNhan` và **không** trừ vào
 * `conNoDon` — nếu fixture đặt sai trục thì ca test xanh vì cổng không thấy tiền, chứ không
 * phải vì cổng làm việc.
 */
async function dungFixture(opts: { chuaGanCon?: number } = {}) {
  await don();
  await db.order.create({
    data: {
      id: DON,
      code: "ORD-269903-000001",
      type: "COURSE",
      status: "PENDING_PAYMENT",
      customerName: "Phụ huynh fixture",
      customerPhone: "0999000222",
      totalAmount: HOC_PHI_MOI_BE * 2,
    },
  });
  for (const [id, ten] of [
    [AN, "Nguyễn Minh An"],
    [BINH, "Nguyễn Minh Bình"],
  ] as const) {
    await db.orderItem.create({
      data: {
        id,
        orderId: DON,
        type: "COURSE_ENROLLMENT",
        itemName: ten,
        quantity: 1,
        unitPrice: HOC_PHI_MOI_BE,
        totalPrice: HOC_PHI_MOI_BE,
      },
    });
  }
  const tien = opts.chuaGanCon ?? DA_THU_CHUA_GAN;
  if (tien > 0) {
    await db.payment.create({
      data: {
        id: `${T}pay-chung`,
        orderId: DON,
        orderItemId: null, // ← mấu chốt: tiền đã về mà chưa biết của bé nào
        amount: tien,
        method: "BANK_TRANSFER",
        accountantStatus: "CONFIRMED",
        paidDate: new Date("2699-03-01T03:00:00Z"),
      },
    });
  }
}

describe.skipIf(!RUN_DB_TESTS)("[CTD] cổng tạo đợt vs khoản chưa gắn con — DB thật", () => {
  beforeEach(async () => {
    await dungFixture();
  });
  afterAll(don);

  it("[CTD-01] fixture đúng hình dạng: đơn 12tr · 6tr đã thu chưa gắn con · từng bé vẫn nợ đủ", async () => {
    // Ca này không kiểm cổng — nó kiểm FIXTURE. Nếu `chuaGanCon` ra 0 thì mọi ca dưới sẽ
    // xanh vì cổng không thấy tiền, và bộ test trở thành vô dụng mà trông vẫn xanh.
    const so = await noTheoCon(DON);
    expect(so.tongPhaiThu).toBe(12_000_000);
    expect(so.chuaGanCon, "6tr phải nằm ở khoản CHƯA GẮN CON, không rơi vào bé nào").toBe(
      DA_THU_CHUA_GAN,
    );
    expect(so.tongDaThu, "không bé nào được nhận 6tr ấy").toBe(0);
    expect(so.con.map((c) => c.conNo), "từng bé vẫn nợ đủ học phí của mình").toEqual([
      HOC_PHI_MOI_BE,
      HOC_PHI_MOI_BE,
    ]);
    // Hai vế của cổng, đọc qua đường thật:
    expect(so.conNoDon, "còn nợ ĐƠN = 12tr − 6tr").toBe(6_000_000);
    expect(so.tongDotDangMoDon).toBe(0);
  });

  it("[CTD-02] tạo đợt VƯỢT còn nợ ĐƠN ⇒ CHẶN, dù còn nợ của BÉ vẫn đủ", async () => {
    // Đây là ca chủ dự án yêu cầu. Bé An còn nợ 6.000.000 nên vế CON cho qua trọn số; nhưng
    // đơn chỉ còn thiếu 6.000.000 và ta xin 6.000.001 ⇒ vế ĐƠN phải cắn.
    const r = await taoDotChoCon({
      orderId: DON,
      orderItemId: AN,
      soTien: 6_000_001,
      dueDate: null,
      centerId: null,
      actor: ACTOR,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("đơn");

    // TỪ CHỐI THÌ DB KHÔNG ĐỔI MỘT DÒNG NÀO — luật rollback (CLAUDE.md mục 7).
    expect(await db.paymentRequest.count({ where: { orderId: DON } })).toBe(0);
    expect(await db.payment.count({ where: { orderId: DON, deletedAt: null } })).toBe(1);
  });

  it("[CTD-03] hai đợt mỗi bé trọn học phí ⇒ đợt THỨ HAI bị chặn (tổng QR không vượt đơn)", async () => {
    // Nếu chỉ có vế CON: An 6tr OK, Bình 6tr OK ⇒ hai QR cộng lại 12.000.000đ trong khi đơn
    // chỉ còn thiếu 6.000.000đ. Phụ huynh quét cả hai là trả lần thứ hai phần đã trả.
    const dotAn = await taoDotChoCon({
      orderId: DON,
      orderItemId: AN,
      soTien: HOC_PHI_MOI_BE,
      dueDate: null,
      centerId: null,
      actor: ACTOR,
    });
    expect(dotAn.ok, "đợt đầu nằm trong phần đơn còn thiếu ⇒ phải tạo được").toBe(true);

    const dotBinh = await taoDotChoCon({
      orderId: DON,
      orderItemId: BINH,
      soTien: HOC_PHI_MOI_BE,
      dueDate: null,
      centerId: null,
      actor: ACTOR,
    });
    expect(dotBinh.ok, "đợt thứ hai vượt phần còn được thu của CẢ ĐƠN").toBe(false);

    // Đúng MỘT đợt tồn tại, và Σ amountDue không vượt phần đơn còn thiếu.
    const dot = await db.paymentRequest.findMany({
      where: { orderId: DON },
      select: { orderItemId: true, amountDue: true },
    });
    expect(dot).toHaveLength(1);
    expect(dot.reduce((s, d) => s + d.amountDue, 0)).toBeLessThanOrEqual(6_000_000);
  });

  it("[CTD-04] chia 6tr còn lại làm hai đợt 3tr cho hai bé ⇒ CẢ HAI tạo được", async () => {
    // Cổng không được chặn quá tay: nó chỉ canh TỔNG, không cấm chia.
    for (const item of [AN, BINH]) {
      const r = await taoDotChoCon({
        orderId: DON,
        orderItemId: item,
        soTien: 3_000_000,
        dueDate: null,
        centerId: null,
        actor: ACTOR,
      });
      expect(r.ok, `đợt của ${item}`).toBe(true);
    }
    const so = await noTheoCon(DON);
    expect(so.tongDotDangMoDon).toBe(6_000_000);

    // Đồng thêm 1đ nữa thì hết chỗ.
    const them = await taoDotChoCon({
      orderId: DON,
      orderItemId: AN,
      soTien: 1,
      dueDate: null,
      centerId: null,
      actor: ACTOR,
    });
    expect(them.ok).toBe(false);
    expect(them.ok === false && them.error).toContain("Cả đơn không còn phần được thu thêm");
  });

  it("[CTD-05] đơn KHÔNG có khoản chưa gắn con ⇒ hành vi cũ KHÔNG đổi", async () => {
    // Bản vá không được làm hẹp đường đi của đơn sạch. Đây là ca hồi quy: bỏ hẳn khoản NULL
    // thì mỗi bé vẫn tạo được đợt trọn học phí, y như trước 17/09.
    await dungFixture({ chuaGanCon: 0 });
    const so = await noTheoCon(DON);
    expect(so.chuaGanCon).toBe(0);
    expect(so.conNoDon).toBe(12_000_000);

    for (const item of [AN, BINH]) {
      const r = await taoDotChoCon({
        orderId: DON,
        orderItemId: item,
        soTien: HOC_PHI_MOI_BE,
        dueDate: null,
        centerId: null,
        actor: ACTOR,
      });
      expect(r.ok, `đợt trọn học phí của ${item} trên đơn sạch`).toBe(true);
    }
    expect(await db.paymentRequest.count({ where: { orderId: DON } })).toBe(2);
  });

  it("[CTD-06] đợt `orderItemId` NULL của luồng cũ CŨNG chiếm chỗ", async () => {
    // Đơn trước 16/09 thì đợt nào cũng NULL. Nếu vế ĐƠN chỉ cộng `Σ con[].tongDotDangMo` thì
    // nó bỏ sạch chúng — tức mở toang đúng tập đơn cũ, là tập đang có tiền thật.
    await dungFixture({ chuaGanCon: 0 });
    await db.paymentRequest.create({
      data: {
        id: `${T}pr-cu`,
        orderId: DON,
        orderItemId: null,
        installmentNo: 1,
        amountDue: 12_000_000,
        status: "PENDING",
        sortOrder: 1,
      },
    });

    const so = await noTheoCon(DON);
    expect(so.tongDotDangMoDon, "đợt NULL phải được đếm").toBe(12_000_000);
    expect(so.con.every((c) => c.tongDotDangMo === 0), "vế CON không thấy nó — đúng").toBe(true);

    const r = await taoDotChoCon({
      orderId: DON,
      orderItemId: AN,
      soTien: 1,
      dueDate: null,
      centerId: null,
      actor: ACTOR,
    });
    expect(r.ok).toBe(false);
    expect(await db.paymentRequest.count({ where: { orderId: DON } })).toBe(1);
  });

  it("[CTD-07] khoản `RECORDED` (chưa xác nhận) KHÔNG nới cổng — nó không phải tiền đã thu", async () => {
    // Trục A là định nghĩa "đã thu" của module. Một khoản kế toán chưa xác nhận có thể bị TỪ
    // CHỐI; trừ nó vào còn-nợ-đơn là nói với phụ huynh rằng họ đã đóng rồi.
    await dungFixture({ chuaGanCon: 0 });
    await db.payment.create({
      data: {
        id: `${T}pay-cho`,
        orderId: DON,
        orderItemId: null,
        amount: 6_000_000,
        method: "BANK_TRANSFER",
        // ⚠️ `RECORDED` là giá trị của `saleStatus`, KHÔNG phải `accountantStatus` (enum kế
        // toán chỉ có PENDING/CONFIRMED/REJECTED/REFUNDED). "Chưa xác nhận" ở đây =
        // `accountantStatus: PENDING` + `saleStatus: RECORDED` — đúng hai vế mà
        // `docSoTheoCon` dùng để xếp một khoản vào `choXacNhan`.
        accountantStatus: "PENDING",
        saleStatus: "RECORDED",
        paidDate: new Date("2699-03-02T03:00:00Z"),
      },
    });

    const so = await noTheoCon(DON);
    expect(so.chuaGanCon, "`chuaGanCon` chỉ đếm trục A ⇒ khoản PENDING không vào").toBe(0);
    expect(so.conNoDon, "còn nợ đơn KHÔNG trừ khoản chưa xác nhận").toBe(12_000_000);

    // ⚠️ MỘT CHỖ BẤT ĐỐI XỨNG CỦA MODULE, ghi lại vì nó dễ làm người sau viết sai khẳng định
    // (tôi đã viết sai ở lượt đầu và ca này ĐỎ):
    //
    //   `tongChoXacNhan` là **Σ theo TỪNG CON** (`con.reduce(... c.choXacNhan)`), nên một
    //   khoản chưa-xác-nhận mang `orderItemId = NULL` **không xuất hiện ở đâu cả**. Trục A có
    //   `chuaGanCon` để hứng phần không thuộc bé nào; trục "chờ xác nhận" thì KHÔNG có trường
    //   tương ứng.
    //
    // Với CỔNG TẠO ĐỢT điều đó vô hại — ta cố ý không trừ tiền chưa xác nhận. Nhưng nếu có
    // ngày cần in "tiền đang chờ kế toán" của cả đơn thì con số này thiếu, và nó thiếu IM
    // LẶNG. Đừng dùng `tongChoXacNhan` làm số của ĐƠN mà chưa đọc lại chỗ này.
    expect(so.tongChoXacNhan, "khoản chờ xác nhận KHÔNG gắn con thì rơi khỏi Σ theo con").toBe(0);

    const r = await taoDotChoCon({
      orderId: DON,
      orderItemId: AN,
      soTien: HOC_PHI_MOI_BE,
      dueDate: null,
      centerId: null,
      actor: ACTOR,
    });
    expect(r.ok).toBe(true);
  });
});
