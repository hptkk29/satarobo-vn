// Ca [HDC-*] — CHỐT HOÁ ĐƠN (bước ⑤) + LÕI XÁC NHẬN KHOẢN trên Postgres THẬT.
// docs/ke-toan-hoa-don/PLAN.md §4 ⑤ + §0.1 phương án (b) + "Điều chỉnh sau GĐ 0" mục 1.
//
//   · Chốt = hoá đơn NHAP → DA_XAC_NHAN. Khoản còn CHỜ mà đủ điều kiện ⇒ xác nhận + RCP cùng lượt;
//     không đủ (thiếu ghi danh / AC5) ⇒ GIỮ CHỜ, hoá đơn VẪN chốt.
//   · Mọi cổng đứng trước phép ghi đầu tiên: từ chối ⇒ KHÔNG ghi gì (hoá đơn vẫn NHAP, khoản vẫn CHỜ).
//   · Bấm đôi ⇒ đúng MỘT lượt thắng, một phiếu RCP, một lượt email.
//   · Lõi `xacNhanKhoanTrongTx` (qua `confirmPayment`): AC5 + tiền ròng > 0 nay nằm ở lõi.
//
// Bộ này KHÔNG gọi `resetDb()`: fixture tự dựng, tự dọn theo tiền tố id.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { RUN_DB_TESTS, LY_DO_BO_QUA } from "@/tests/_helpers/db-gate";
import { chotHoaDon, LoiChotHoaDon } from "@/lib/finance/hoa-don/chot-hoa-don";
import { confirmPayment } from "@/lib/finance/payment";

if (!RUN_DB_TESTS) console.warn(`[HDC] BỎ QUA bộ chạm DB: ${LY_DO_BO_QUA}`);

const T = "fx-hdc-";
const CS = `${T}center`;
const KHOA = `${T}khoa`;
const LOP = `${T}lop`;
const HS = `${T}hs`;
const GD = `${T}gd`;
const DON = `${T}don`;
const HD = `${T}hd`;
const KT = { id: `${T}ke-toan`, name: "Kế toán fixture" };
const SALE = `${T}sale`;
const P_OK = `${T}p-ok`;
const P_NOGD = `${T}p-nogd`;
const P_TU = `${T}p-tu`;
const NOW = new Date("2699-09-26T08:00:00Z");

async function don() {
  await db.hoaDonDienTu.deleteMany({ where: { orderId: DON } });
  await db.receipt.deleteMany({ where: { paymentId: { startsWith: T } } });
  await db.domainEvent.deleteMany({ where: { dedupeKey: { contains: T } } });
  await db.auditLog.deleteMany({ where: { entityId: { startsWith: T } } });
  await db.payment.deleteMany({ where: { orderId: DON } });
  await db.order.deleteMany({ where: { id: DON } });
  await db.enrollment.deleteMany({ where: { id: GD } });
  await db.class.deleteMany({ where: { id: LOP } });
  await db.course.deleteMany({ where: { id: KHOA } });
  await db.student.deleteMany({ where: { id: HS } });
  await db.center.deleteMany({ where: { id: CS } });
}

const khoan = (id: string, amount: number, o: { enrollmentId?: string | null; recordedById?: string | null } = {}) =>
  db.payment.create({
    data: {
      id,
      orderId: DON,
      amount,
      method: "BANK_TRANSFER",
      paidDate: new Date("2699-09-20T03:00:00Z"),
      saleStatus: "RECORDED",
      accountantStatus: "PENDING",
      enrollmentId: o.enrollmentId === undefined ? GD : o.enrollmentId,
      recordedById: o.recordedById === undefined ? SALE : o.recordedById,
      centerId: CS,
    },
  });

async function dungFixture() {
  await don();
  await db.center.create({ data: { id: CS, name: "Cơ sở fixture HDC", slug: `${T}co-so`, address: "114 Hoàng Diệu" } });
  await db.course.create({ data: { id: KHOA, name: "Sata 5 fixture", slug: `${T}sata-5` } });
  await db.class.create({ data: { id: LOP, name: "Lớp fixture HDC", courseId: KHOA } });
  await db.student.create({ data: { id: HS, name: "Bé HDC" } });
  await db.enrollment.create({ data: { id: GD, studentId: HS, classId: LOP, courseId: KHOA, finalPrice: 9_000_000 } });
  await db.order.create({
    data: { id: DON, code: "ORD-269926-000201", type: "COURSE", status: "CONFIRMED", customerName: "PH HDC", customerPhone: "0999000888", totalAmount: 9_000_000, centerId: CS },
  });
}

/** Hoá đơn NHÁP đủ tệp + số, giữ các khoản cho trước. */
const nhap = (ids: string[], o: Partial<{ emailNhan: string | null; guiEmailKhach: boolean; soHoaDon: string | null; soTien: number }> = {}) =>
  db.hoaDonDienTu.create({
    data: {
      id: HD,
      orderId: DON,
      centerId: CS,
      trangThai: "NHAP",
      kyHieu: "1C26TSR",
      soHoaDon: o.soHoaDon === undefined ? "901" : o.soHoaDon,
      ngayPhatHanh: new Date("2026-09-20T00:00:00Z"),
      tepPdfKey: `hoa-don/CS1/2026/${DON}/u.pdf`,
      tepPdfTen: "hd.pdf",
      emailNhan: o.emailNhan === undefined ? "ph@example.com" : o.emailNhan,
      guiEmailKhach: o.guiEmailKhach ?? true,
      tongTien: (o.soTien ?? 3_000_000) * ids.length,
      taoBoiId: KT.id,
      khoan: { create: ids.map((paymentId) => ({ paymentId, soTien: o.soTien ?? 3_000_000 })) },
    },
  });

const chot = () => chotHoaDon({ nguoiChot: KT, orderId: DON, hoaDonId: HD, now: NOW });

async function maLoi(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof LoiChotHoaDon ? e.ma : String(e);
  }
}

describe.skipIf(!RUN_DB_TESTS)("[HDC] chốt hoá đơn — Postgres thật", () => {
  beforeEach(dungFixture);
  afterAll(don);

  it("[HDC-01] đường vui: hoá đơn ĐÃ XÁC NHẬN · khoản CHỜ ⇒ CONFIRMED + đúng MỘT phiếu RCP · một lượt email", async () => {
    await khoan(P_OK, 3_000_000);
    await nhap([P_OK]);
    const kq = await chot();

    expect(kq.daXacNhan.map((x) => x.paymentId)).toEqual([P_OK]);
    expect(kq.daXacNhan[0]!.receiptCode).toMatch(/^RCP-/);
    expect(kq.conCho).toEqual([]);
    expect(await db.hoaDonDienTu.findUniqueOrThrow({ where: { id: HD } })).toMatchObject({
      trangThai: "DA_XAC_NHAN",
      xacNhanBoiId: KT.id,
    });
    expect(await db.payment.findUniqueOrThrow({ where: { id: P_OK } })).toMatchObject({
      accountantStatus: "CONFIRMED",
      confirmedById: KT.id,
    });
    expect(await db.receipt.count({ where: { paymentId: P_OK } })).toBe(1);
    const email = await db.hoaDonGuiEmail.findMany({ where: { hoaDonId: HD } });
    expect(email.map((e) => [e.lanGui, e.toi, e.trangThai])).toEqual([[1, "ph@example.com", "CHO"]]);
    expect(await db.auditLog.count({ where: { entityId: HD, action: "XAC_NHAN_HOA_DON" } })).toBe(1);
  });

  it("[HDC-02] khoản thiếu ghi danh + khoản do CHÍNH kế toán ghi ⇒ hoá đơn VẪN chốt, hai khoản GIỮ CHỜ, không phiếu", async () => {
    await khoan(P_NOGD, 3_000_000, { enrollmentId: null });
    await khoan(P_TU, 3_000_000, { recordedById: KT.id });
    await nhap([P_NOGD, P_TU]);
    const kq = await chot();

    expect(kq.daXacNhan).toEqual([]);
    expect(kq.conCho.map((c) => c.paymentId).sort()).toEqual([P_NOGD, P_TU].sort());
    expect(kq.conCho.find((c) => c.paymentId === P_TU)!.lyDo).toMatch(/chính bạn/);
    expect((await db.hoaDonDienTu.findUniqueOrThrow({ where: { id: HD } })).trangThai).toBe("DA_XAC_NHAN");
    const ps = await db.payment.findMany({ where: { id: { in: [P_NOGD, P_TU] } }, select: { accountantStatus: true } });
    expect(ps.map((p) => p.accountantStatus)).toEqual(["PENDING", "PENDING"]);
    expect(await db.receipt.count({ where: { paymentId: { in: [P_NOGD, P_TU] } } })).toBe(0);
  });

  it("[HDC-03] bỏ tick gửi email / khách không có email ⇒ KHÔNG có lượt gửi", async () => {
    await khoan(P_OK, 3_000_000);
    await nhap([P_OK], { guiEmailKhach: false });
    await chot();
    expect(await db.hoaDonGuiEmail.count({ where: { hoaDonId: HD } })).toBe(0);

    await dungFixture();
    await khoan(P_OK, 3_000_000);
    await nhap([P_OK], { emailNhan: null });
    await chot();
    expect(await db.hoaDonGuiEmail.count({ where: { hoaDonId: HD } })).toBe(0);
  });

  it("[HDC-04] hai kế toán bấm CÙNG LÚC ⇒ đúng một lượt thắng, một phiếu RCP, một lượt email", async () => {
    await khoan(P_OK, 3_000_000);
    await nhap([P_OK]);
    const kq = await Promise.allSettled([chot(), chot()]);
    expect(kq.filter((k) => k.status === "fulfilled")).toHaveLength(1);
    const thua = kq.find((k): k is PromiseRejectedResult => k.status === "rejected")!;
    expect((thua.reason as LoiChotHoaDon).ma).toBe("DA_DOI");
    expect(await db.receipt.count({ where: { paymentId: P_OK } })).toBe(1);
    expect(await db.hoaDonGuiEmail.count({ where: { hoaDonId: HD } })).toBe(1);
  });

  it("[HDC-05] tiền của khoản ĐỔI sau khi lưu nháp (bút toán đảo) ⇒ TIEN_DA_DOI, KHÔNG ghi gì", async () => {
    await khoan(P_OK, 3_000_000);
    await nhap([P_OK]);
    await db.payment.create({
      data: {
        id: `${T}p-dao`,
        orderId: DON,
        amount: -1_000_000,
        method: "BANK_TRANSFER",
        paidDate: new Date("2699-09-21T03:00:00Z"),
        paymentType: "ADJUSTMENT",
        adjustmentOfId: P_OK,
        saleStatus: "RECORDED",
        accountantStatus: "PENDING",
        centerId: CS,
      },
    });
    expect(await maLoi(chot())).toBe("TIEN_DA_DOI");
    expect((await db.hoaDonDienTu.findUniqueOrThrow({ where: { id: HD } })).trangThai).toBe("NHAP");
    expect((await db.payment.findUniqueOrThrow({ where: { id: P_OK } })).accountantStatus).toBe("PENDING");
    expect(await db.hoaDonGuiEmail.count({ where: { hoaDonId: HD } })).toBe(0);
  });

  it("[HDC-06] đơn đã HUỶ ⇒ DON_DA_HUY; thiếu số hoá đơn ⇒ THIEU_THONG_TIN — cả hai không ghi gì", async () => {
    await khoan(P_OK, 3_000_000);
    await nhap([P_OK], { soHoaDon: null });
    expect(await maLoi(chot())).toBe("THIEU_THONG_TIN");

    await db.hoaDonDienTu.update({ where: { id: HD }, data: { soHoaDon: "902" } });
    await db.order.update({ where: { id: DON }, data: { status: "CANCELLED" } });
    expect(await maLoi(chot())).toBe("DON_DA_HUY");
    expect((await db.hoaDonDienTu.findUniqueOrThrow({ where: { id: HD } })).trangThai).toBe("NHAP");
    expect(await db.receipt.count({ where: { paymentId: P_OK } })).toBe(0);
  });
});

describe.skipIf(!RUN_DB_TESTS)("[HDC-L] lõi xác nhận khoản (qua confirmPayment) — cổng mới nằm ở LÕI", () => {
  beforeEach(dungFixture);
  afterAll(don);

  it("[HDC-L1] AC5: người ghi nhận TỰ xác nhận ⇒ từ chối (trước chỉ có ở tầng action)", async () => {
    await khoan(P_TU, 3_000_000, { recordedById: KT.id });
    const r = await confirmPayment({ paymentId: P_TU, confirmedById: KT.id });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/tự xác nhận/);
    expect((await db.payment.findUniqueOrThrow({ where: { id: P_TU } })).accountantStatus).toBe("PENDING");
  });

  it("[HDC-L2] dòng gốc đã bị ĐẢO TRỌN ⇒ không cấp phiếu thu cho tiền đã gỡ", async () => {
    await khoan(P_OK, 3_000_000);
    await db.payment.create({
      data: {
        id: `${T}p-dao-tron`,
        orderId: DON,
        amount: -3_000_000,
        method: "BANK_TRANSFER",
        paidDate: new Date("2699-09-21T03:00:00Z"),
        paymentType: "ADJUSTMENT",
        adjustmentOfId: P_OK,
        saleStatus: "RECORDED",
        accountantStatus: "PENDING",
        centerId: CS,
      },
    });
    const r = await confirmPayment({ paymentId: P_OK, confirmedById: KT.id });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/gỡ \/ tách hết/);
    expect(await db.receipt.count({ where: { paymentId: P_OK } })).toBe(0);
  });

  it("[HDC-L3] đối chứng dương: khoản hợp lệ ⇒ xác nhận, một phiếu; gọi lại ⇒ idempotent, không phiếu thứ hai", async () => {
    await khoan(P_OK, 3_000_000);
    const a = await confirmPayment({ paymentId: P_OK, confirmedById: KT.id });
    expect(a).toMatchObject({ ok: true, alreadyConfirmed: false });
    const b = await confirmPayment({ paymentId: P_OK, confirmedById: KT.id });
    expect(b).toMatchObject({ ok: true, alreadyConfirmed: true });
    expect(await db.receipt.count({ where: { paymentId: P_OK } })).toBe(1);
  });
});
