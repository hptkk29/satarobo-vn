// Ca [HDE-*] — GỬI HOÁ ĐƠN ĐIỆN TỬ CHO KHÁCH trên Postgres THẬT (docs/ke-toan-hoa-don/PLAN.md §7).
//
//   chốt (tx) ─► HoaDonGuiEmail CHO + sự kiện `hoa-don.gui` │ không email ⇒ `hoa-don.khong-email`
//   handler   ─► giành CHO→DANG_GUI + xếp EmailQueue trong MỘT transaction (xếp lỗi ⇒ cả hai lùi)
//   worker    ─► đọc LẠI hoá đơn: chỉ bản DA_XAC_NHAN mới gửi; đính kèm URL ký; khoá chống gửi đôi
//   đối soát  ─► lượt còn CHO quá 10 phút ⇒ xếp lại
//
// Ký URL tệp (R2) được giả — DB test không có kho; thứ cần đo là LUẬT đọc lại hoá đơn, không phải S3.
// Bộ này KHÔNG gọi `resetDb()` và KHÔNG chạy `processEmailQueue` (nó quét MỌI dòng hàng đợi của DB
// dùng chung) — nhánh worker đo ở `lib/email/queue.hoa-don.test.ts` bằng mock.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/finance/hoa-don/kho-tep", async (goc) => ({
  ...(await goc<typeof import("@/lib/finance/hoa-don/kho-tep")>()),
  kyUrlTaiVeHoaDon: async (khoa: string, ten: string, ttl: number) => `https://r2.test/${khoa}?ten=${encodeURIComponent(ten)}&ttl=${ttl}`,
}));

import { db } from "@/lib/db";
import { RUN_DB_TESTS, LY_DO_BO_QUA } from "@/tests/_helpers/db-gate";
import { chotHoaDon } from "@/lib/finance/hoa-don/chot-hoa-don";
import { baoKhongEmail, doiSoatGuiHoaDon, giuLuotGuiHoaDon } from "@/lib/finance/hoa-don/gui-email";
import { chuanBiGuiHoaDon, NGU_CANH_EMAIL_HOA_DON } from "@/lib/finance/hoa-don/dinh-kem-email";

if (!RUN_DB_TESTS) console.warn(`[HDE] BỎ QUA bộ chạm DB: ${LY_DO_BO_QUA}`);

const T = "fx-hde-";
const CS = `${T}center`;
const DON = `${T}don`;
const HD = `${T}hd`;
const P1 = `${T}p1`;
const KT = { id: `${T}ke-toan`, name: "Kế toán fixture" };
const SALE = `${T}sale`;
const NGUOI_LAP = `${T}nguoi-lap`;
const QL = `${T}ql`;
const LEAD = `${T}lead`;

async function don() {
  const hd = await db.hoaDonDienTu.findMany({ where: { orderId: DON }, select: { id: true } });
  const gui = await db.hoaDonGuiEmail.findMany({ where: { hoaDonId: { in: hd.map((h) => h.id) } }, select: { id: true } });
  await db.emailQueue.deleteMany({ where: { contextId: { in: gui.map((g) => g.id) } } });
  await db.domainEvent.deleteMany({ where: { dedupeKey: { contains: T } } });
  await db.domainEvent.deleteMany({ where: { dedupeKey: { in: gui.map((g) => `hoa-don.gui:${g.id}`) } } });
  await db.staffNotification.deleteMany({ where: { dedupeKey: { contains: T } } });
  await db.auditLog.deleteMany({ where: { entityId: { startsWith: T } } });
  await db.hoaDonDienTu.deleteMany({ where: { orderId: DON } });
  await db.payment.deleteMany({ where: { orderId: DON } });
  await db.order.deleteMany({ where: { id: DON } });
  await db.lead.deleteMany({ where: { id: LEAD } });
  await db.user.deleteMany({ where: { id: { in: [SALE, NGUOI_LAP, QL] } } });
  await db.center.deleteMany({ where: { id: CS } });
}

async function dungFixture(o: { leadCoSale?: boolean; nguoiLap?: boolean } = {}) {
  await don();
  await db.center.create({ data: { id: CS, name: "Cơ sở fixture HDE", slug: `${T}co-so`, address: "211 Nguyễn Hữu Thọ" } });
  for (const [id, role] of [
    [SALE, "SALES_CSM"],
    [NGUOI_LAP, "SALES_CSM"],
    [QL, "CENTER_MANAGER"],
  ] as const) {
    await db.user.create({ data: { id, name: id, email: `${id}@test.local`, role, roles: [role], centerId: CS } });
  }
  if (o.leadCoSale) {
    await db.lead.create({ data: { id: LEAD, parentName: "PH HDE", phone: "0999000666", assignedToId: SALE } });
  }
  await db.order.create({
    data: {
      id: DON,
      code: "ORD-269926-000301",
      type: "COURSE",
      status: "CONFIRMED",
      customerName: "PH HDE",
      customerPhone: "0999000666",
      totalAmount: 3_000_000,
      centerId: CS,
      leadId: o.leadCoSale ? LEAD : null,
      createdById: o.nguoiLap ? NGUOI_LAP : null,
    },
  });
  await db.payment.create({
    data: {
      id: P1,
      orderId: DON,
      amount: 3_000_000,
      method: "BANK_TRANSFER",
      paidDate: new Date("2699-09-20T03:00:00Z"),
      saleStatus: "RECORDED",
      accountantStatus: "CONFIRMED",
      centerId: CS,
    },
  });
}

const hoaDon = (o: Partial<{ emailNhan: string | null; guiEmailKhach: boolean; trangThai: "NHAP" | "DA_XAC_NHAN" }> = {}) =>
  db.hoaDonDienTu.create({
    data: {
      id: HD,
      orderId: DON,
      centerId: CS,
      trangThai: o.trangThai ?? "NHAP",
      kyHieu: "1C26TSR",
      soHoaDon: "555",
      ngayPhatHanh: new Date("2026-09-20T00:00:00Z"),
      tepPdfKey: `hoa-don/CS1/2026/${DON}/u.pdf`,
      tepPdfTen: "hoa-don-555.pdf",
      nguoiMuaTen: "Nguyễn <b>An</b>",
      phapNhanTen: "Công ty CP Sata Robo",
      emailNhan: o.emailNhan === undefined ? "ph@example.com" : o.emailNhan,
      guiEmailKhach: o.guiEmailKhach ?? true,
      tongTien: 3_000_000,
      taoBoiId: KT.id,
      khoan: { create: [{ paymentId: P1, soTien: 3_000_000 }] },
    },
  });

const chot = () => chotHoaDon({ nguoiChot: KT, orderId: DON, hoaDonId: HD, now: new Date("2699-09-26T08:00:00Z") });
const luotGui = () => db.hoaDonGuiEmail.findFirstOrThrow({ where: { hoaDonId: HD } });

describe.skipIf(!RUN_DB_TESTS)("[HDE] gửi hoá đơn cho khách — Postgres thật", () => {
  beforeEach(() => dungFixture());
  afterAll(don);

  it("[HDE-01] chốt có email ⇒ lượt CHO + sự kiện `hoa-don.gui` mang ĐÚNG lượt, trong CÙNG lượt chốt", async () => {
    await hoaDon();
    await chot();
    const g = await luotGui();
    expect(g).toMatchObject({ lanGui: 1, toi: "ph@example.com", trangThai: "CHO" });
    const ev = await db.domainEvent.findUniqueOrThrow({ where: { dedupeKey: `hoa-don.gui:${g.id}` } });
    expect(ev.type).toBe("hoa-don.gui");
    expect(ev.payloadJson).toEqual({ guiId: g.id });
  });

  it("[HDE-02] không email ⇒ sự kiện `hoa-don.khong-email`; bỏ tick gửi ⇒ KHÔNG sự kiện nào", async () => {
    await hoaDon({ emailNhan: null });
    await chot();
    expect(await db.domainEvent.count({ where: { dedupeKey: `hoa-don.khong-email:${HD}` } })).toBe(1);

    await dungFixture();
    await hoaDon({ emailNhan: null, guiEmailKhach: false });
    await chot();
    expect(await db.domainEvent.count({ where: { dedupeKey: `hoa-don.khong-email:${HD}` } })).toBe(0);
    expect(await db.hoaDonGuiEmail.count({ where: { hoaDonId: HD } })).toBe(0);
  });

  it("[HDE-03] handler: giành + xếp hàng NGUYÊN TỬ; chạy lại ⇒ bỏ qua, vẫn MỘT dòng hàng đợi", async () => {
    await hoaDon();
    await chot();
    const g = await luotGui();
    expect(await giuLuotGuiHoaDon(g.id)).toBe("da-xep");
    expect(await giuLuotGuiHoaDon(g.id)).toBe("bo-qua");

    const sau = await luotGui();
    expect(sau.trangThai).toBe("DANG_GUI");
    const q = await db.emailQueue.findMany({ where: { contextType: NGU_CANH_EMAIL_HOA_DON, contextId: g.id } });
    expect(q).toHaveLength(1);
    expect(q[0]!.id).toBe(sau.emailQueueId);
    expect(q[0]!.toEmail).toBe("ph@example.com");
    // Tên người mua là chữ NGƯỜI GÕ ⇒ phải được escape trong HTML.
    expect(q[0]!.bodyHtml).toContain("Nguyễn &lt;b&gt;An&lt;/b&gt;");
    expect(q[0]!.bodyHtml).not.toContain("<b>An</b>");
  });

  it("[HDE-04] xếp hàng LỖI ⇒ giành chỗ LÙI theo: lượt vẫn CHO, 0 dòng hàng đợi (lượt sau gửi được)", async () => {
    await hoaDon({ trangThai: "DA_XAC_NHAN" });
    // Địa chỉ chỉ có khoảng trắng ⇒ `enqueueEmail` trả { ok:false } ⇒ handler NÉM.
    const g = await db.hoaDonGuiEmail.create({ data: { hoaDonId: HD, lanGui: 1, toi: "   ", trangThai: "CHO" } });
    await expect(giuLuotGuiHoaDon(g.id)).rejects.toThrow(/Không xếp được/);
    expect((await luotGui()).trangThai).toBe("CHO");
    expect(await db.emailQueue.count({ where: { contextId: g.id } })).toBe(0);
  });

  it("[HDE-05] hoá đơn KHÔNG còn DA_XAC_NHAN lúc handler chạy ⇒ đóng lượt LOI, không xếp hàng", async () => {
    await hoaDon({ trangThai: "DA_XAC_NHAN" });
    const g = await db.hoaDonGuiEmail.create({ data: { hoaDonId: HD, lanGui: 1, toi: "ph@example.com", trangThai: "CHO" } });
    await db.hoaDonDienTu.update({ where: { id: HD }, data: { trangThai: "THAY_THE" } });
    expect(await giuLuotGuiHoaDon(g.id)).toBe("bo-qua");
    expect((await luotGui()).trangThai).toBe("LOI");
    expect(await db.emailQueue.count({ where: { contextId: g.id } })).toBe(0);
  });

  it("[HDE-06] worker: bản DA_XAC_NHAN ⇒ đính kèm URL ký 300s + khoá chống gửi đôi; bản bị THAY ⇒ CHẶN hẳn", async () => {
    await hoaDon({ trangThai: "DA_XAC_NHAN" });
    const g = await db.hoaDonGuiEmail.create({ data: { hoaDonId: HD, lanGui: 1, toi: "ph@example.com", trangThai: "DANG_GUI" } });
    const ok = await chuanBiGuiHoaDon(g.id);
    expect(ok).toMatchObject({ ok: true, idempotencyKey: `hoa-don:${g.id}` });
    expect(ok.ok && ok.attachments).toEqual([
      { filename: "hoa-don-555.pdf", path: `https://r2.test/hoa-don/CS1/2026/${DON}/u.pdf?ten=hoa-don-555.pdf&ttl=300` },
    ]);

    await db.hoaDonDienTu.update({ where: { id: HD }, data: { trangThai: "THAY_THE" } });
    expect(await chuanBiGuiHoaDon(g.id)).toMatchObject({ ok: false, chan: true });
  });

  it("[HDE-07] đối soát: lượt CHO quá 10 phút ⇒ xếp lại; lượt CHO mới ⇒ để yên", async () => {
    await hoaDon({ trangThai: "DA_XAC_NHAN" });
    const g = await db.hoaDonGuiEmail.create({ data: { hoaDonId: HD, lanGui: 1, toi: "ph@example.com", trangThai: "CHO" } });
    const bayGio = new Date(g.createdAt.getTime() + 5 * 60_000);
    expect(await doiSoatGuiHoaDon(bayGio)).toBe(0);
    expect((await luotGui()).trangThai).toBe("CHO");
    expect(await doiSoatGuiHoaDon(new Date(g.createdAt.getTime() + 11 * 60_000))).toBeGreaterThanOrEqual(1);
    expect((await luotGui()).trangThai).toBe("DANG_GUI");
  });
});

describe.skipIf(!RUN_DB_TESTS)("[HDE-K] khách không có email ⇒ báo đúng người gửi Zalo", () => {
  afterAll(don);
  const nguoiNhan = async () =>
    (await db.staffNotification.findMany({ where: { dedupeKey: `hoa-don.khong-email:${HD}` }, select: { userId: true } })).map((n) => n.userId).sort();

  it("[HDE-K1] ưu tiên SALE phụ trách lead (hơn người lập đơn)", async () => {
    await dungFixture({ leadCoSale: true, nguoiLap: true });
    await hoaDon({ trangThai: "DA_XAC_NHAN", emailNhan: null });
    await baoKhongEmail(HD);
    expect(await nguoiNhan()).toEqual([SALE]);
  });

  it("[HDE-K2] không có lead ⇒ người LẬP đơn; không có cả hai ⇒ Quản lý cơ sở", async () => {
    await dungFixture({ nguoiLap: true });
    await hoaDon({ trangThai: "DA_XAC_NHAN", emailNhan: null });
    await baoKhongEmail(HD);
    expect(await nguoiNhan()).toEqual([NGUOI_LAP]);

    await dungFixture();
    await hoaDon({ trangThai: "DA_XAC_NHAN", emailNhan: null });
    await baoKhongEmail(HD);
    expect(await nguoiNhan()).toEqual([QL]);
  });

  it("[HDE-K3] không có ai nhận ⇒ ghi nhật ký, KHÔNG im lặng", async () => {
    await dungFixture();
    await db.user.delete({ where: { id: QL } });
    await hoaDon({ trangThai: "DA_XAC_NHAN", emailNhan: null });
    expect(await baoKhongEmail(HD)).toBe(0);
    expect(await db.auditLog.count({ where: { entityId: HD, action: "KHONG_CO_NGUOI_NHAN_BAO" } })).toBe(1);
  });
});
