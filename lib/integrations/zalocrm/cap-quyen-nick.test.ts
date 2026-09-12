// @vitest-environment node
/**
 * Cấp/GỠ quyền truy cập nick theo cơ sở (chốt 13/09/2026).
 *
 * ⚠️ VÌ SAO BỘ NÀY TỒN TẠI, và vì sao nửa số ca là về VẾ GỠ:
 * cấp thì ai cũng nhớ kiểm — mở hộp thư thấy hội thoại là biết chạy. GỠ thì không có
 * triệu chứng nào cả: người nghỉ việc vẫn đọc được chat của khách, mọi màn hình vẫn
 * xanh, không dòng lỗi nào. Kiểu hỏng ấy chỉ có test bắt được, nên nó nằm ở đây.
 *
 * Ca đắt thứ hai là [ZC-CQ-05]: cơ sở CHƯA CÓ NICK phải im lặng tuyệt đối. Bộ này chạy
 * 288 lượt/ngày và đó là hiện trạng của MỌI cơ sở cho tới khi có SIM thật (việc 9.16) —
 * kêu ở trạng thái bình thường là dạy người vận hành bỏ qua nhật ký.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DongVai = { userId: string };

const state = {
  anhXa: {} as Record<string, string>,
  coKhoa: new Set<string>(),
  nicks: {} as Record<string, { zcrmAccountId: string }[]>,
  vaiTheoDonVi: {} as Record<string, DongVai[]>,
  donViCo: new Set<string>(),
  /** Tài khoản đã nghỉ/khoá — vẫn còn dòng `UserOrgRole` nhưng phải bị loại. */
  daNghi: new Set<string>(),
  whereVai: [] as unknown[],
  whereNguoi: [] as unknown[],
  goi: [] as Array<{ orgCode: string; nick: string; externalIds: string[] }>,
  traLoi: { ok: true, data: { granted: 0, revoked: 0, unknown: 0 } } as Record<string, unknown>,
  nhatKy: [] as Array<{ orgCode: string; status: string }>,
};

vi.mock("@/lib/db", () => ({
  db: {
    zaloCrmNick: {
      findMany: vi.fn(async (args: { where?: { orgCode?: string } }) => {
        return state.nicks[args?.where?.orgCode ?? ""] ?? [];
      }),
    },
    orgUnit: {
      findFirst: vi.fn(async (args: { where?: { code?: string } }) => {
        const code = args?.where?.code ?? "";
        return state.donViCo.has(code) ? { id: `ou-${code}` } : null;
      }),
    },
    userOrgRole: {
      findMany: vi.fn(async (args: { where?: unknown }) => {
        state.whereVai.push(args?.where);
        const w = args?.where as { orgUnitId?: string };
        const code = (w?.orgUnitId ?? "").replace(/^ou-/, "");
        return state.vaiTheoDonVi[code] ?? [];
      }),
    },
    user: {
      findMany: vi.fn(async (args: { where?: { id?: { in?: string[] } } }) => {
        state.whereNguoi.push(args?.where);
        const ids = args?.where?.id?.in ?? [];
        return ids.filter((i) => !state.daNghi.has(i)).map((id) => ({ id }));
      }),
    },
  },
}));

vi.mock("@/lib/settings/service", () => ({
  getSetting: vi.fn(async (key: string) => {
    if (key === "zalocrm.orgCodes") return state.anhXa;
    throw new Error(`Unknown setting key: ${key}`);
  }),
}));

vi.mock("@/lib/integrations/zalocrm/client", () => ({
  docKhoaApi: vi.fn((orgCode: string) => (state.coKhoa.has(orgCode) ? "k" : null)),
  datQuyenNickZalocrm: vi.fn(async (orgCode: string, nick: string, ids: readonly string[]) => {
    state.goi.push({ orgCode, nick, externalIds: [...ids] });
    return state.traLoi;
  }),
}));

vi.mock("@/lib/integrations/zalocrm/log", () => ({
  ghiNhatKyZalocrm: vi.fn(async (i: { orgCode: string; status: string }) => {
    state.nhatKy.push({ orgCode: i.orgCode, status: i.status });
    return "log-1";
  }),
}));

import { capQuyenNickZalocrm } from "@/lib/integrations/zalocrm/cap-quyen-nick";

beforeEach(() => {
  state.anhXa = { CS1: "cs1" };
  state.coKhoa = new Set(["cs1"]);
  state.nicks = { cs1: [{ zcrmAccountId: "acc-1" }] };
  state.vaiTheoDonVi = { CS1: [{ userId: "u-sale-1" }, { userId: "u-sale-2" }, { userId: "u-qlcs" }] };
  state.donViCo = new Set(["CS1", "CS2"]);
  state.daNghi = new Set();
  state.whereVai = [];
  state.whereNguoi = [];
  state.goi = [];
  state.traLoi = { ok: true, data: { granted: 3, revoked: 0, unknown: 0 } };
  state.nhatKy = [];
});
afterEach(() => vi.clearAllMocks());

describe("cấp quyền", () => {
  it("[ZC-CQ-01] gửi ĐỦ danh sách người của cơ sở cho từng nick", () => {
    return capQuyenNickZalocrm().then((kq) => {
      expect(state.goi).toHaveLength(1);
      expect(state.goi[0]).toMatchObject({ orgCode: "cs1", nick: "acc-1" });
      expect([...state.goi[0]!.externalIds].sort()).toEqual(["u-qlcs", "u-sale-1", "u-sale-2"]);
      expect(kq.tong.capMoi).toBe(3);
    });
  });

  it("[ZC-CQ-02] nhiều nick ⇒ mỗi nick một lượt, cùng danh sách người", async () => {
    state.nicks.cs1 = [{ zcrmAccountId: "acc-1" }, { zcrmAccountId: "acc-2" }];
    await capQuyenNickZalocrm();
    expect(state.goi.map((g) => g.nick)).toEqual(["acc-1", "acc-2"]);
    expect(state.goi[0]!.externalIds).toEqual(state.goi[1]!.externalIds);
  });

  it("[ZC-CQ-03] chỉ lấy vai TRONG chính sách, và đúng đơn vị của cơ sở", async () => {
    await capQuyenNickZalocrm();
    const w = state.whereVai[0] as {
      status?: string;
      role?: { code?: { in?: string[] } };
      orgUnitId?: string;
    };
    expect(w.status).toBe("ACTIVE");
    expect([...(w.role?.code?.in ?? [])].sort()).toEqual([
      "CENTER_MANAGER",
      "CENTER_SALES_CSM",
      "SALES_CSM",
    ]);
    expect(w.orgUnitId).toBe("ou-CS1");
    // Nghỉ việc / khoá tài khoản là ca CHÍNH của vế gỡ — lọc ở bước tra `User`, vì dòng
    // `UserOrgRole` của người nghỉ thường VẪN CÒN.
    expect(state.whereNguoi[0]).toMatchObject({ isActive: true, deletedAt: null });
  });

  it("[ZC-CQ-03b] tài khoản đã khoá/nghỉ việc bị LOẠI dù vẫn còn dòng phân vai", async () => {
    state.daNghi = new Set(["u-sale-2"]);
    const kq = await capQuyenNickZalocrm();
    expect(state.goi[0]!.externalIds, "người đã nghỉ vẫn đọc được chat khách").not.toContain(
      "u-sale-2",
    );
    expect([...state.goi[0]!.externalIds].sort()).toEqual(["u-qlcs", "u-sale-1"]);
    expect(kq.theoOrg[0]?.soNguoi).toBe(2);
  });

  it("[ZC-CQ-03c] cơ sở chưa có đơn vị trong cây ⇒ danh sách RỖNG, không đoán", async () => {
    state.donViCo = new Set();
    await capQuyenNickZalocrm();
    expect(state.goi[0]!.externalIds).toEqual([]);
  });
});

describe("GỠ quyền — vế không có triệu chứng, chỉ test bắt được", () => {
  it("[ZC-CQ-04] người rời cơ sở KHÔNG còn trong danh sách gửi đi", async () => {
    // Lượt 1: ba người. Lượt 2: `u-sale-2` đã chuyển cơ sở / nghỉ việc ⇒ truy vấn không
    // trả họ nữa ⇒ danh sách gửi sang fork thiếu họ ⇒ fork gỡ bản ghi quyền.
    await capQuyenNickZalocrm();
    expect(state.goi[0]!.externalIds).toContain("u-sale-2");

    state.goi = [];
    state.vaiTheoDonVi.CS1 = [{ userId: "u-sale-1" }, { userId: "u-qlcs" }];
    state.traLoi = { ok: true, data: { granted: 2, revoked: 1, unknown: 0 } };
    const kq = await capQuyenNickZalocrm();

    expect(state.goi[0]!.externalIds, "người đã rời phải BIẾN MẤT khỏi danh sách").not.toContain(
      "u-sale-2",
    );
    expect([...state.goi[0]!.externalIds].sort()).toEqual(["u-qlcs", "u-sale-1"]);
    expect(kq.tong.daGo).toBe(1);
  });

  it("[ZC-CQ-04b] cơ sở không còn ai ⇒ gửi MẢNG RỖNG, không bỏ qua", async () => {
    // Bỏ qua khi danh sách rỗng là để nguyên quyền cho cả đội cũ — đúng cái bẫy "chỉ
    // thêm, không gỡ" mà endpoint thay-cả-tập sinh ra để tránh.
    state.vaiTheoDonVi.CS1 = [];
    state.traLoi = { ok: true, data: { granted: 0, revoked: 3, unknown: 0 } };
    const kq = await capQuyenNickZalocrm();
    expect(state.goi).toHaveLength(1);
    expect(state.goi[0]!.externalIds).toEqual([]);
    expect(kq.tong.daGo).toBe(3);
  });

  it("[ZC-CQ-04c] có GỠ thì PHẢI để lại vết trong nhật ký", async () => {
    state.traLoi = { ok: true, data: { granted: 2, revoked: 1, unknown: 0 } };
    await capQuyenNickZalocrm();
    expect(state.nhatKy).toHaveLength(1);
    expect(state.nhatKy[0]).toMatchObject({ orgCode: "cs1", status: "SUCCESS" });
  });
});

describe("im lặng khi không có gì để làm", () => {
  it("[ZC-CQ-05] cơ sở CHƯA CÓ NICK ⇒ không gọi mạng, không ghi nhật ký", async () => {
    // Hiện trạng của MỌI cơ sở cho tới khi có SIM thật (việc 9.16).
    state.nicks = { cs1: [] };
    const kq = await capQuyenNickZalocrm();
    expect(state.goi, "chưa có nick mà vẫn gọi API").toHaveLength(0);
    expect(state.nhatKy, "chưa có nick mà vẫn ghi nhật ký = rác 288 lượt/ngày").toHaveLength(0);
    expect(kq.theoOrg[0]).toMatchObject({ ok: true, ma: "CHUA_CO_NICK" });
    expect(kq.tong).toEqual({ capMoi: 0, daGo: 0, loi: 0 });
  });

  it("[ZC-CQ-06] chưa khai khoá API ⇒ bỏ qua lặng lẽ, KHÔNG đọc cả bảng nick", async () => {
    state.coKhoa = new Set();
    const kq = await capQuyenNickZalocrm();
    expect(state.goi).toHaveLength(0);
    expect(state.nhatKy).toHaveLength(0);
    expect(kq.theoOrg[0]).toMatchObject({ ok: false, ma: "CHUA_KHAI_KHOA_API" });
  });

  it("[ZC-CQ-07] lượt SẠCH (không gỡ ai, không lỗi) ⇒ im lặng", async () => {
    state.traLoi = { ok: true, data: { granted: 3, revoked: 0, unknown: 0 } };
    await capQuyenNickZalocrm();
    expect(state.nhatKy).toHaveLength(0);
  });
});

describe("hỏng hóc", () => {
  it("[ZC-CQ-08] gọi API hỏng ⇒ đếm lỗi + ghi nhật ký FAILED, không ném", async () => {
    state.traLoi = { ok: false, ma: "HET_GIO" };
    const kq = await capQuyenNickZalocrm();
    expect(kq.tong.loi).toBe(1);
    expect(state.nhatKy[0]).toMatchObject({ status: "FAILED" });
  });

  it("[ZC-CQ-09] một cơ sở hỏng KHÔNG chặn cơ sở kia", async () => {
    state.anhXa = { CS1: "cs1", CS2: "cs2" };
    state.coKhoa = new Set(["cs1", "cs2"]);
    state.nicks = { cs1: [{ zcrmAccountId: "acc-1" }], cs2: [{ zcrmAccountId: "acc-2" }] };
    state.vaiTheoDonVi = { CS1: [{ userId: "u-1" }], CS2: [{ userId: "u-2" }] };
    await capQuyenNickZalocrm();
    expect(state.goi.map((g) => g.orgCode)).toEqual(["cs1", "cs2"]);
    // Mỗi cơ sở gửi ĐÚNG người của mình — trộn danh sách là mở chéo cơ sở.
    expect(state.goi[0]!.externalIds).toEqual(["u-1"]);
    expect(state.goi[1]!.externalIds).toEqual(["u-2"]);
  });

  it("[ZC-CQ-10] hai cơ sở khai TRÙNG orgCode ⇒ chỉ chạy một lượt", async () => {
    state.anhXa = { CS1: "cs1", CS2: "cs1" };
    await capQuyenNickZalocrm();
    expect(state.goi).toHaveLength(1);
  });
});
