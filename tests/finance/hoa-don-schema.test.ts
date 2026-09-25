// Ca [HDB-*] — BẢNG HOÁ ĐƠN ĐIỆN TỬ TRÊN POSTGRES THẬT: các khoá mà mã ứng dụng sẽ DỰA VÀO.
//
// Kế hoạch: docs/ke-toan-hoa-don/PLAN.md §2.2. Lưới `[HDS-03]` chỉ bảo đảm câu SQL còn nằm trong
// migration; bộ này đo HÀNH VI — một chỉ mục từng phần viết sai điều kiện `WHERE` vẫn khớp regex
// mà không chặn gì cả.
//
// Vì sao các khoá này phải nằm ở DB chứ không chỉ ở mã: hai kế toán (Hội sở + cơ sở) có thể cùng
// bấm trên MỘT lần thu; kiểm-rồi-ghi ở tầng ứng dụng thì cả hai cùng thấy "chưa có hoá đơn".
//
// Bộ này KHÔNG gọi `resetDb()`: fixture tự dựng, tự dọn theo tiền tố id.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { RUN_DB_TESTS, LY_DO_BO_QUA } from "@/tests/_helpers/db-gate";

if (!RUN_DB_TESTS) console.warn(`[HDB] BỎ QUA bộ chạm DB: ${LY_DO_BO_QUA}`);

const T = "fx-hdb-";
const DON = `${T}don`;
const KHOAN = `${T}pay`;
const CS = `${T}center`; // không ánh xạ OrgUnit ⇒ ghi kép để trống orgUnitId, không ném
const MST = "0402301783";

async function don() {
  await db.hoaDonGuiEmail.deleteMany({ where: { hoaDon: { orderId: DON } } });
  await db.hoaDonKhoan.deleteMany({ where: { hoaDon: { orderId: DON } } });
  await db.hoaDonDienTu.deleteMany({ where: { orderId: DON } });
  await db.payment.deleteMany({ where: { orderId: DON } });
  await db.order.deleteMany({ where: { id: DON } });
}

async function dungFixture() {
  await don();
  await db.order.create({
    data: {
      id: DON,
      code: "ORD-269909-000001",
      type: "COURSE",
      status: "CONFIRMED",
      customerName: "Phụ huynh fixture",
      customerPhone: "0999000333",
      totalAmount: 3_000_000,
    },
  });
  await db.payment.create({
    data: {
      id: KHOAN,
      orderId: DON,
      amount: 3_000_000,
      method: "BANK_TRANSFER",
      paidDate: new Date("2699-09-01T03:00:00Z"),
    },
  });
}

function hoaDon(id: string, o: Partial<Prisma.HoaDonDienTuUncheckedCreateInput> = {}) {
  return db.hoaDonDienTu.create({
    data: {
      id: `${T}${id}`,
      orderId: DON,
      centerId: CS,
      trangThai: "DA_XAC_NHAN",
      tongTien: 3_000_000,
      taoBoiId: `${T}ke-toan`,
      ...o,
    },
  });
}

function gan(hoaDonId: string, hieuLuc = true) {
  return db.hoaDonKhoan.create({
    data: { hoaDonId: `${T}${hoaDonId}`, paymentId: KHOAN, soTien: 3_000_000, hieuLuc },
  });
}

/** Mã lỗi Prisma của một lời hứa bị từ chối — `null` nếu nó KHÔNG bị từ chối. */
async function maLoi(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof Prisma.PrismaClientKnownRequestError ? e.code : String(e);
  }
}

describe.skipIf(!RUN_DB_TESTS)("[HDB] bảng hoá đơn điện tử — Postgres thật", () => {
  beforeEach(dungFixture);
  afterAll(don);

  it("[HDB-01] RLS BẬT trên cả ba bảng", async () => {
    const r = await db.$queryRaw<{ relname: string; relrowsecurity: boolean }[]>`
      SELECT relname, relrowsecurity FROM pg_class
      WHERE relname IN ('HoaDonDienTu', 'HoaDonKhoan', 'HoaDonGuiEmail') AND relkind = 'r'
      ORDER BY relname`;
    expect(r).toEqual([
      { relname: "HoaDonDienTu", relrowsecurity: true },
      { relname: "HoaDonGuiEmail", relrowsecurity: true },
      { relname: "HoaDonKhoan", relrowsecurity: true },
    ]);
  });

  it("[HDB-02] một khoản KHÔNG thuộc hai hoá đơn còn hiệu lực cùng lúc", async () => {
    await hoaDon("a");
    await gan("a");
    await hoaDon("b", { trangThai: "NHAP" });
    // Đối chứng dương: chính khoản đó gắn vào hoá đơn thứ hai thì DB phải từ chối.
    expect(await maLoi(gan("b"))).toBe("P2002");
  });

  it("[HDB-03] … nhưng khi hoá đơn cũ hết hiệu lực (bị thay) thì gắn vào hoá đơn mới ĐƯỢC", async () => {
    await hoaDon("a", { trangThai: "THAY_THE" });
    await gan("a", false);
    await hoaDon("b", { thayTheChoId: `${T}a` });
    expect(await maLoi(gan("b"))).toBeNull();
  });

  it("[HDB-04] KHONG_XUAT cũng giữ chỗ — khoản đã đánh dấu 'không xuất' không gắn thêm được", async () => {
    await hoaDon("k", { trangThai: "KHONG_XUAT", lyDo: "Đã xuất ngoài hệ thống", tongTien: 3_000_000 });
    await gan("k");
    await hoaDon("b", { trangThai: "NHAP" });
    expect(await maLoi(gan("b"))).toBe("P2002");
  });

  it("[HDB-05] không hai hoá đơn CÒN SỐNG trùng (MST pháp nhân, ký hiệu, số)", async () => {
    const so = { phapNhanMst: MST, kyHieu: "1C26TSR", soHoaDon: "127" };
    await hoaDon("a", so);
    expect(await maLoi(hoaDon("b", { ...so, trangThai: "NHAP" }))).toBe("P2002");
  });

  it("[HDB-06] … nhưng bản đã bị THAY không giữ số — bản thay thế dùng lại số được", async () => {
    // Ca thật: kế toán tải nhầm tệp, huỷ bản cũ rồi tải lại ĐÚNG tờ hoá đơn đó.
    const so = { phapNhanMst: MST, kyHieu: "1C26TSR", soHoaDon: "127" };
    await hoaDon("a", { ...so, trangThai: "THAY_THE" });
    expect(await maLoi(hoaDon("b", so))).toBeNull();
  });

  it("[HDB-07] nhiều dòng KHONG_XUAT không có số — không đụng khoá số hoá đơn", async () => {
    await hoaDon("k1", { trangThai: "KHONG_XUAT", lyDo: "x" });
    expect(await maLoi(hoaDon("k2", { trangThai: "KHONG_XUAT", lyDo: "y" }))).toBeNull();
  });

  it("[HDB-08] xoá khoản đang có hoá đơn ⇒ DB TỪ CHỐI (không kéo mất hoá đơn)", async () => {
    await hoaDon("a");
    await gan("a");
    // DELETE thô, cố ý vòng qua tầng xoá mềm của `lib/db.ts`: câu hỏi là DB có tự chặn không
    // khi một đường SQL / script nào đó xoá cứng khoản tiền đang nằm trong hoá đơn.
    const loi = await maLoi(db.$executeRaw`DELETE FROM "Payment" WHERE id = ${KHOAN}`);
    expect(loi, "phải bị khoá ngoại RESTRICT chặn").not.toBeNull();
    expect(await db.payment.count({ where: { id: KHOAN } })).toBe(1);
  });

  it("[HDB-09] centerId BẮT BUỘC ở tầng DB, không chỉ ở kiểu TypeScript", async () => {
    const loi = await maLoi(
      db.$executeRaw`INSERT INTO "HoaDonDienTu" ("id","orderId","trangThai","tongTien","taoBoiId","updatedAt")
                     VALUES (${`${T}null-cs`}, ${DON}, 'NHAP', 0, 'x', now())`,
    );
    expect(loi, "INSERT thiếu centerId phải bị NOT NULL chặn").not.toBeNull();
  });

  it("[HDB-10] số lần gửi email của MỘT hoá đơn không trùng (chống gửi đôi ở tầng DB)", async () => {
    await hoaDon("a");
    const gui = () =>
      db.hoaDonGuiEmail.create({
        data: { hoaDonId: `${T}a`, lanGui: 1, toi: "ph@example.com" },
      });
    await gui();
    expect(await maLoi(gui())).toBe("P2002");
  });
});
