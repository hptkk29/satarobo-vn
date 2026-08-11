/**
 * Đơn vị của một người nằm ở HAI bảng — sửa một là sửa cả hai.
 *
 * Test THUẦN với client giả: thứ cần chứng minh là LUẬT (khi nào kéo theo, khi nào không,
 * nhận nhau bằng gì), không phải SQL.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit/audit-log", () => ({ writeAudit: vi.fn(async () => null) }));

import { keoHoSoTheoTaiKhoan, keoTaiKhoanTheoHoSo } from "@/lib/hr/sync-employee-unit";
import { writeAudit } from "@/lib/audit/audit-log";

type Ban = { id: string; centerId: string | null; orgUnitId: string | null; employeeId?: string | null };

function fakeTx(opts: { taiKhoan?: Ban | null; hoSo?: Ban | null }) {
  const userUpdate = vi.fn(async () => ({}));
  const empUpdate = vi.fn(async () => ({}));
  return {
    tx: {
      user: {
        findFirst: vi.fn(async () => opts.taiKhoan ?? null),
        update: userUpdate,
      },
      employee: {
        findUnique: vi.fn(async () => opts.hoSo ?? null),
        update: empUpdate,
      },
    } as never,
    userUpdate,
    empUpdate,
  };
}

const ACTOR = { id: "admin1", name: "Admin" };

beforeEach(() => vi.clearAllMocks());

describe("hồ sơ nhân sự → tài khoản", () => {
  it("đổi cơ sở ở hồ sơ ⇒ tài khoản đổi theo CẢ HAI cột", async () => {
    const { tx, userUpdate } = fakeTx({
      taiKhoan: { id: "u1", centerId: "cs1", orgUnitId: "org-cs1" },
    });
    const coGhi = await keoTaiKhoanTheoHoSo(tx, {
      employeeId: "e1",
      donVi: { centerId: "cs2", orgUnitId: "org-cs2" },
      actor: ACTOR,
    });
    expect(coGhi).toBe(true);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { centerId: "cs2", orgUnitId: "org-cs2" },
    });
  });

  it("chuyển về Hội sở (centerId = null) ⇒ vẫn kéo theo, KHÔNG bỏ qua vì null", async () => {
    // Nhân sự Hội sở có `centerId = null` một cách hợp lệ. Coi null là "không có gì để
    // đồng bộ" là đúng cái làm hồ sơ TGĐ lệch tài khoản suốt mấy tháng.
    const { tx, userUpdate } = fakeTx({
      taiKhoan: { id: "u1", centerId: "cs1", orgUnitId: "org-cs1" },
    });
    await keoTaiKhoanTheoHoSo(tx, {
      employeeId: "e1",
      donVi: { centerId: null, orgUnitId: "org-ho" },
      actor: ACTOR,
    });
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { centerId: null, orgUnitId: "org-ho" },
    });
  });

  it("cùng centerId nhưng KHÁC orgUnitId ⇒ vẫn phải kéo theo", async () => {
    // Ca này KHÔNG hiếm sau P1: mọi phòng ban của Hội sở đều `centerId = null`, phân biệt
    // nhau bằng `orgUnitId`. Chỉ so `centerId` là chuyển người từ phòng Đào tạo sang
    // phòng Kế toán mà tài khoản vẫn nằm phòng cũ.
    const { tx, userUpdate } = fakeTx({
      taiKhoan: { id: "u1", centerId: null, orgUnitId: "org-dao-tao" },
    });
    const coGhi = await keoTaiKhoanTheoHoSo(tx, {
      employeeId: "e1",
      donVi: { centerId: null, orgUnitId: "org-ke-toan" },
      actor: ACTOR,
    });
    expect(coGhi).toBe(true);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { centerId: null, orgUnitId: "org-ke-toan" },
    });
  });

  it("hai bên đã khớp ⇒ KHÔNG ghi, KHÔNG đẻ dòng audit rác", async () => {
    const { tx, userUpdate } = fakeTx({
      taiKhoan: { id: "u1", centerId: "cs1", orgUnitId: "org-cs1" },
    });
    const coGhi = await keoTaiKhoanTheoHoSo(tx, {
      employeeId: "e1",
      donVi: { centerId: "cs1", orgUnitId: "org-cs1" },
      actor: ACTOR,
    });
    expect(coGhi).toBe(false);
    expect(userUpdate).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("hồ sơ chưa có tài khoản ⇒ no-op, không nổ", async () => {
    const { tx, userUpdate } = fakeTx({ taiKhoan: null });
    expect(
      await keoTaiKhoanTheoHoSo(tx, {
        employeeId: "e1",
        donVi: { centerId: "cs2", orgUnitId: "org-cs2" },
        actor: ACTOR,
      }),
    ).toBe(false);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("có ghi ⇒ có audit, và audit NÓI RÕ đây là đồng bộ tự động", async () => {
    const { tx } = fakeTx({ taiKhoan: { id: "u1", centerId: null, orgUnitId: null } });
    await keoTaiKhoanTheoHoSo(tx, {
      employeeId: "e1",
      donVi: { centerId: "cs2", orgUnitId: "org-cs2" },
      actor: ACTOR,
    });
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "User", reason: expect.stringContaining("Đồng bộ") }),
    );
  });
});

describe("tài khoản → hồ sơ nhân sự", () => {
  it("đổi đơn vị ở tài khoản ⇒ hồ sơ đổi theo", async () => {
    const { tx, empUpdate } = fakeTx({ hoSo: { id: "e1", centerId: null, orgUnitId: null } });
    const coGhi = await keoHoSoTheoTaiKhoan(tx, {
      employeeId: "e1",
      donVi: { centerId: "cs1", orgUnitId: "org-cs1" },
      actor: ACTOR,
    });
    expect(coGhi).toBe(true);
    expect(empUpdate).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { centerId: "cs1", orgUnitId: "org-cs1" },
    });
  });

  it("tài khoản KHÔNG gắn hồ sơ (phụ huynh) ⇒ no-op, và KHÔNG đẻ hồ sơ nhân sự", async () => {
    const { tx, empUpdate } = fakeTx({ hoSo: { id: "e1", centerId: null, orgUnitId: null } });
    expect(
      await keoHoSoTheoTaiKhoan(tx, {
        employeeId: null,
        donVi: { centerId: "cs1", orgUnitId: "org-cs1" },
        actor: ACTOR,
      }),
    ).toBe(false);
    expect(empUpdate).not.toHaveBeenCalled();
  });

  it("employeeId trỏ hồ sơ không tồn tại ⇒ no-op, không nổ", async () => {
    const { tx, empUpdate } = fakeTx({ hoSo: null });
    expect(
      await keoHoSoTheoTaiKhoan(tx, {
        employeeId: "khong-co",
        donVi: { centerId: "cs1", orgUnitId: "org-cs1" },
        actor: ACTOR,
      }),
    ).toBe(false);
    expect(empUpdate).not.toHaveBeenCalled();
  });
});
