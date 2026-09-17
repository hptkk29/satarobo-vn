/**
 * NHẮC GIÁO VIÊN TRƯỚC GIỜ DẠY TRẢI NGHIỆM (V2-d, chủ dự án chốt 17/09/2026).
 *
 * ── VÌ SAO BỘ NÀY RA ĐỜI ─────────────────────────────────────────────────────────────────
 * Cron `trial-reminder` trước đợt này chỉ nhắc SALE, và thân của nó nằm thẳng trong
 * `route.ts` mở màn bằng `const now = new Date()` — tức KHÔNG ca test nào chạm được vào
 * phần rẽ mốc. Thêm một nhánh người nhận vào một vùng không có test là cách chắc chắn nhất
 * để Sale ăn thêm chuông lạ mà không ai biết.
 *
 * Bốn thứ bộ này canh, theo đúng thứ tự dễ hỏng:
 *   1. MỘT BUỔI = MỘT CHUÔNG cho giáo viên. Nhánh Sale nhắc theo CA (mỗi ca một phụ huynh
 *      phải gọi); bê nguyên vòng lặp đó sang là buổi 5 bé thành 5 lần rung máy.
 *   2. Hai nhánh KHÔNG rò sang nhau: mốc GV không gửi Sale, mốc Sale không gửi GV.
 *   3. Buổi tới mốc mà chưa ai dạy ⇒ leo thang Đào tạo bằng khoá RIÊNG (trùng khoá cũ là
 *      ĐÈ mất tin gốc lúc tạo buổi).
 *   4. Body của chuông GV KHÔNG chứa PII. Chuông này đi tiếp ra Web Push, hiện trên MÀN HÌNH
 *      KHOÁ — không `can()` nào gác được (xem `lib/push/payload.ts`).
 *
 * ⚠️ Luật 19: mọi mốc thời gian ở đây là TUYỆT ĐỐI và `now` được TRUYỀN vào. Không ca nào
 * đọc đồng hồ thật, nên bộ này không có ngày hết hạn.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const trangThai = {
    buoi: [
      {
        id: "ts1",
        date: new Date("2026-09-20T00:00:00.000Z"),
        startTime: "18:00",
        seq: 2,
        teacherId: "u_gv" as string | null,
        trialClass: { name: "Lớp trải nghiệm T7", centerId: "cs1" } as {
          name: string;
          centerId: string | null;
        } | null,
      },
    ],
    // BA ca trong CÙNG một buổi, ba Sale khác nhau — đúng hình dạng làm lộ lỗi "5 bé, 5 chuông".
    cas: [
      caHocThu("te1", "Bé An", "u_sale_1"),
      caHocThu("te2", "Bé Bình", "u_sale_2"),
      caHocThu("te3", "Bé Chi", "u_sale_3"),
    ],
    nguoiDaoTao: [{ id: "u_daotao" }] as { id: string }[],
  };

  function caHocThu(id: string, ten: string, saleId: string) {
    return {
      id,
      leadChild: {
        fullName: ten,
        lead: {
          id: `lead_${id}`,
          parentName: `Phụ huynh ${ten}`,
          phone: "0905123456",
          assignedToId: saleId,
          adminId: null as string | null,
        },
      },
    };
  }

  /**
   * ⚠️ Mock TÔN TRỌNG `select` — không trả nguyên bản ghi.
   *
   * Đo thật 17/09: bản mock đầu tiên trả thẳng `trangThai.buoi`, và khi CẤY LỖI bằng cách
   * xoá dòng `teacherId: true` khỏi câu truy vấn thì cả 12 ca VẪN XANH. Mock rộng hơn truy
   * vấn thật thì nó tự vá giúp mã đang hỏng — đúng lớp lỗi "quên `select` cột nguồn" mà luật
   * 7 nói tới, và là loại chỉ lộ ra trên PROD (Prisma trả `undefined`, nhánh GV im lặng rơi
   * hết sang leo thang Đào tạo).
   *
   * Phép chiếu cố ý THÔ: chỉ đủ để cột không khai trong `select` biến mất.
   */
  function chieuTheoSelect(
    row: Record<string, unknown>,
    select?: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!select) return row;
    const out: Record<string, unknown> = {};
    for (const [khoa, gia] of Object.entries(select)) {
      if (!gia) continue;
      const val = row[khoa];
      const conSelect =
        typeof gia === "object" && gia !== null
          ? (gia as { select?: Record<string, unknown> }).select
          : undefined;
      out[khoa] =
        conSelect && val && typeof val === "object"
          ? chieuTheoSelect(val as Record<string, unknown>, conSelect)
          : val;
    }
    return out;
  }

  type ThamSoTruyVan = { select?: Record<string, unknown> } | undefined;

  const notifyStaff = vi.fn(async (_p: Record<string, unknown>) => 1);
  const mockDb = {
    trialClassSession: {
      findMany: vi.fn(async (a: ThamSoTruyVan) =>
        trangThai.buoi.map((r) => chieuTheoSelect(r as unknown as Record<string, unknown>, a?.select)),
      ),
    },
    trialEnrollment: {
      findMany: vi.fn(async (a: ThamSoTruyVan) =>
        trangThai.cas.map((r) => chieuTheoSelect(r as unknown as Record<string, unknown>, a?.select)),
      ),
    },
    user: {
      findMany: vi.fn(async (a: ThamSoTruyVan) =>
        trangThai.nguoiDaoTao.map((r) => chieuTheoSelect(r as unknown as Record<string, unknown>, a?.select)),
      ),
    },
  };
  return { trangThai, caHocThu, notifyStaff, mockDb };
});

vi.mock("@/lib/db", () => ({ db: h.mockDb }));
vi.mock("@/lib/notifications/notify", () => ({ notifyStaff: h.notifyStaff }));

import { chayNhacTrial } from "./nhac-buoi";

// Buổi 18:00 giờ VN ngày 20/09/2026. Cột `@db.Date` ⇒ Prisma trả UTC-midnight của ngày VN,
// nên mốc bắt đầu THẬT = 2026-09-20T11:00:00.000Z (18:00 − 7h).
const BAT_DAU = new Date("2026-09-20T11:00:00.000Z");
/** Còn đúng 1,0h ⇒ rơi vào cửa sổ "1-gio" [0.4, 1.5) — mốc của GIÁO VIÊN. */
const NOW_MOC_GV = new Date("2026-09-20T10:00:00.000Z");
/** Còn đúng 2,0h ⇒ rơi vào cửa sổ "2-gio" [1.5, 2.5) — mốc của SALE. */
const NOW_MOC_SALE = new Date("2026-09-20T09:00:00.000Z");

/** Mọi tham số đã truyền cho `notifyStaff` trong lượt chạy. */
function moiTin(): Record<string, unknown>[] {
  return h.notifyStaff.mock.calls.map((c) => c[0] as Record<string, unknown>);
}

function khoa(): string[] {
  return moiTin().map((t) => String(t.dedupeKey));
}

/** Mọi userId đã nhận chuông, gộp lại. */
function moiNguoiNhan(): string[] {
  return moiTin().flatMap((t) => (t.userIds as string[]) ?? []);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Dựng lại TOÀN BỘ trạng thái ở mỗi ca (luật 18: mỗi ca phải xanh khi chạy MỘT MÌNH).
  // `h.trangThai.*` là đối tượng dùng chung giữa các ca, nên thiếu chỗ này là ca sau mượn
  // trạng thái ca trước và cả bộ chỉ xanh nhờ thứ tự chạy hiện tại.
  h.trangThai.buoi[0]!.teacherId = "u_gv";
  h.trangThai.buoi[0]!.startTime = "18:00";
  h.trangThai.buoi[0]!.trialClass = { name: "Lớp trải nghiệm T7", centerId: "cs1" };
  h.trangThai.cas = [
    h.caHocThu("te1", "Bé An", "u_sale_1"),
    h.caHocThu("te2", "Bé Bình", "u_sale_2"),
    h.caHocThu("te3", "Bé Chi", "u_sale_3"),
  ];
  h.trangThai.nguoiDaoTao = [{ id: "u_daotao" }];
  h.notifyStaff.mockResolvedValue(1);
});

describe("[TRIAL-T50] mốc 1 tiếng — nhắc GIÁO VIÊN", () => {
  it("⚠️ ĐÚNG MỘT chuông cho MỘT BUỔI, dù buổi có 3 ca", async () => {
    // Đây là ca quan trọng nhất của bộ. Nhánh Sale nhắc theo CA; bê nguyên vòng lặp đó sang
    // nhánh GV là 3 lần rung máy cho cùng một việc dạy, và `dedupeKey` không cứu được vì
    // mỗi ca sinh một khoá khác nhau.
    const kq = await chayNhacTrial({ now: NOW_MOC_GV });

    expect(h.notifyStaff).toHaveBeenCalledTimes(1);
    expect(khoa()).toEqual(["trial.reminder-gv:1-gio:ts1"]);
    expect(moiTin()[0]!.userIds).toEqual(["u_gv"]);
    expect(kq.daNhacGv).toBe(1);
    expect(kq.daNhac).toBe(0);
  });

  it("nội dung nói rõ GIỜ và LỚP — thiếu thì người nhận phải mở app ra mới biết dạy gì", async () => {
    await chayNhacTrial({ now: NOW_MOC_GV });
    const tin = moiTin()[0]!;
    expect(String(tin.title)).toContain("18:00");
    expect(String(tin.title)).toContain("20/09");
    expect(String(tin.body)).toContain("Lớp trải nghiệm T7");
  });

  it("⚠️ KHÔNG có PII trong chuông GV — nó hiện trên MÀN HÌNH KHOÁ qua Web Push", async () => {
    await chayNhacTrial({ now: NOW_MOC_GV });
    const chu = `${moiTin()[0]!.title} ${moiTin()[0]!.body}`;
    expect(chu).not.toContain("0905123456");
    expect(chu).not.toContain("Phụ huynh");
    expect(chu).not.toContain("Bé An");
  });

  it("buổi CHƯA CÓ giáo viên ⇒ leo thang Đào tạo bằng khoá RIÊNG, không đè tin gốc", async () => {
    h.trangThai.buoi[0]!.teacherId = null;
    const kq = await chayNhacTrial({ now: NOW_MOC_GV });

    expect(khoa()).toEqual(["trial.cho-phan-cong-gap:ts1"]);
    // KHÔNG được là `trial.cho-phan-cong:ts1` — khoá đó thuộc tin lúc TẠO buổi, và
    // `@@unique([userId, dedupeKey])` nghĩa là trùng khoá thì lượt sau ĐÈ lên bản ghi cũ.
    expect(khoa()).not.toContain("trial.cho-phan-cong:ts1");
    expect(moiTin()[0]!.userIds).toEqual(["u_daotao"]);
    expect(kq.leoThang).toBe(1);
    expect(kq.daNhacGv).toBe(0);
  });

  it("chưa có giáo viên VÀ không ai thuộc Đào tạo ⇒ im, đếm vào boQua", async () => {
    h.trangThai.buoi[0]!.teacherId = null;
    h.trangThai.nguoiDaoTao = [];
    const kq = await chayNhacTrial({ now: NOW_MOC_GV });

    expect(h.notifyStaff).not.toHaveBeenCalled();
    expect(kq.boQua).toBe(1);
  });

  it("buổi KHÔNG còn ca ACTIVE nào ⇒ IM HẲN (buổi rỗng là bình thường, slot tái sử dụng)", async () => {
    h.trangThai.cas = [];
    const kq = await chayNhacTrial({ now: NOW_MOC_GV });

    expect(h.notifyStaff).not.toHaveBeenCalled();
    expect(kq.daNhacGv).toBe(0);
    expect(kq.leoThang).toBe(0);
  });
});

describe("[TRIAL-T51] hai nhánh KHÔNG rò sang nhau", () => {
  it("mốc 1 tiếng: KHÔNG một chuông nào tới Sale", async () => {
    await chayNhacTrial({ now: NOW_MOC_GV });

    expect(khoa().filter((k) => k.startsWith("trial.reminder:"))).toEqual([]);
    for (const sale of ["u_sale_1", "u_sale_2", "u_sale_3"]) {
      expect(moiNguoiNhan()).not.toContain(sale);
    }
  });

  it("mốc 2 tiếng: nhắc ĐỦ 3 Sale và KHÔNG chuông nào tới giáo viên", async () => {
    const kq = await chayNhacTrial({ now: NOW_MOC_SALE });

    expect(khoa()).toEqual([
      "trial.reminder:2-gio:te1:ts1",
      "trial.reminder:2-gio:te2:ts1",
      "trial.reminder:2-gio:te3:ts1",
    ]);
    expect(moiNguoiNhan()).toEqual(["u_sale_1", "u_sale_2", "u_sale_3"]);
    expect(moiNguoiNhan()).not.toContain("u_gv");
    expect(kq.daNhac).toBe(3);
    expect(kq.daNhacGv).toBe(0);
  });

  it("mốc 2 tiếng mà buổi chưa có giáo viên ⇒ KHÔNG leo thang (leo thang chỉ ở mốc GV)", async () => {
    // Còn 2 tiếng thì việc phân công vẫn theo đường thường; leo thang sớm là làm nhiễu.
    h.trangThai.buoi[0]!.teacherId = null;
    const kq = await chayNhacTrial({ now: NOW_MOC_SALE });

    expect(khoa().some((k) => k.startsWith("trial.cho-phan-cong-gap:"))).toBe(false);
    expect(kq.leoThang).toBe(0);
    expect(kq.daNhac).toBe(3);
  });
});

describe("[TRIAL-T52] ngoài mọi cửa sổ", () => {
  it("còn 6 tiếng ⇒ không mốc nào khớp ⇒ im", async () => {
    const kq = await chayNhacTrial({ now: new Date(BAT_DAU.getTime() - 6 * 3_600_000) });
    expect(h.notifyStaff).not.toHaveBeenCalled();
    expect(kq.buoiQuet).toBe(1);
  });

  it("còn 20 phút ⇒ đã TRƯỢT mép dưới của mốc GV (0,4h) ⇒ im", async () => {
    // Hệ quả đã biết và đã ghi trong `_moc.ts`: buổi tạo muộn hơn ~24 phút trước giờ dạy
    // KHÔNG BAO GIỜ nhận chuông của mốc này.
    const kq = await chayNhacTrial({ now: new Date(BAT_DAU.getTime() - 20 * 60_000) });
    expect(h.notifyStaff).not.toHaveBeenCalled();
    expect(kq.daNhacGv).toBe(0);
  });

  it("giờ bắt đầu hỏng ⇒ bỏ qua buổi, không đoán, không ném", async () => {
    h.trangThai.buoi[0]!.startTime = "18h00";
    const kq = await chayNhacTrial({ now: NOW_MOC_GV });
    expect(h.notifyStaff).not.toHaveBeenCalled();
    expect(kq.boQua).toBe(1);
    // Không dọn ở đây: `beforeEach` mới là chỗ dựng lại trạng thái. Dọn ở cuối ca thì
    // một assertion ném là ca sau thừa hưởng dữ liệu hỏng (luật 18).
  });
});
