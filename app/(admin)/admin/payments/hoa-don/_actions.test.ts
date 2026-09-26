// @vitest-environment node
//
// Ca [HDA-*] — TẢI LÊN HAI BƯỚC: ký URL PUT (bước 1) → trình duyệt PUT thẳng R2 → xác minh (bước 2).
// (docs/ke-toan-hoa-don/PLAN.md §6.) GĐ 3 chưa tạo hoá đơn NHÁP — việc đó ở GĐ 5 và sẽ xác minh lại.
//
// Cổng chung của hai bước — mỗi vế một ca, và ca kiêm nhiệm là ca đáng giá nhất: người vừa là kế toán
// CS2 vừa là sale CS1 qua được `checkPermission("payments:confirm")` trần VÀ thấy đơn CS1, nhưng
// KHÔNG được tải tệp hoá đơn lên đơn CS1.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  bat: vi.fn(async () => true),
  auth: vi.fn(),
  checkPermission: vi.fn(async () => true),
  resolveActor: vi.fn(),
  findUnique: vi.fn(),
  rateLimit: vi.fn(async (_args: { key: string; max: number; windowMs: number }) => ({
    success: true,
    remaining: 59,
    resetAt: 0,
  })),
  khoOk: vi.fn(() => true),
  kyPut: vi.fn(async (khoa: string, ct: string, ttl: number) => `https://r2.test/${khoa}?ct=${ct}&ttl=${ttl}`),
  xacMinh: vi.fn(),
}));
vi.mock("@/lib/finance/hoa-don/feature", () => ({ laHoaDonBat: h.bat }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@/lib/auth/check-permission", () => ({ checkPermission: h.checkPermission }));
vi.mock("@/lib/auth/actor", () => ({ resolveActor: h.resolveActor }));
vi.mock("@/lib/db-scope", () => ({ scopedDb: () => ({ order: { findUnique: h.findUnique } }) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: h.rateLimit }));
vi.mock("@/lib/finance/hoa-don/kho-tep", async (goc) => ({
  ...(await goc<typeof import("@/lib/finance/hoa-don/kho-tep")>()),
  khoHoaDonDaCauHinh: h.khoOk,
  kyUrlTaiLenHoaDon: h.kyPut,
  xacMinhTepHoaDon: h.xacMinh,
}));

import { kyTaiLenHoaDonAction, xacMinhTepHoaDonAction } from "./_actions";
import { khoaThuocDon } from "@/lib/finance/hoa-don/kho-tep";

const perm = (action: string, centerScope: "ALL" | string[]) => ({
  action,
  scopeType: "GLOBAL",
  orgUnitId: "ou",
  roleCode: "X",
  centerScope,
});
const KE_TOAN_CS1 = { isSuperAdmin: false, grantsAllow: new Set(), permissions: [perm("payments:confirm", ["cs1"])] };
const KIEM = {
  isSuperAdmin: false,
  grantsAllow: new Set(),
  permissions: [perm("payments:confirm", ["cs2"]), perm("payments:record", ["cs1"])],
};
const DON = { id: "don1", centerId: "cs1", orgUnitId: "ou-cs1", center: { code: "CS1" } };

beforeEach(() => {
  vi.clearAllMocks();
  h.bat.mockResolvedValue(true);
  h.auth.mockResolvedValue({ user: { id: "u1", name: "Kế toán" } });
  h.checkPermission.mockResolvedValue(true);
  h.resolveActor.mockResolvedValue(KE_TOAN_CS1);
  h.findUnique.mockResolvedValue({ ...DON });
  h.rateLimit.mockResolvedValue({ success: true, remaining: 59, resetAt: 0 });
  h.khoOk.mockReturnValue(true);
});

describe("[HDA-01] cổng chung — mỗi vế một ca", () => {
  it("cờ TẮT ⇒ từ chối, không hỏi quyền", async () => {
    h.bat.mockResolvedValue(false);
    expect(await kyTaiLenHoaDonAction({ orderId: "don1", loai: "pdf" })).toMatchObject({ ok: false });
    expect(h.checkPermission).not.toHaveBeenCalled();
  });

  it("chưa đăng nhập ⇒ từ chối", async () => {
    h.auth.mockResolvedValue(null);
    expect(await kyTaiLenHoaDonAction({ orderId: "don1", loai: "pdf" })).toMatchObject({ ok: false });
  });

  it("thiếu payments:confirm ⇒ từ chối, không ký", async () => {
    h.checkPermission.mockResolvedValue(false);
    expect(await kyTaiLenHoaDonAction({ orderId: "don1", loai: "pdf" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/quyền/i),
    });
    expect(h.kyPut).not.toHaveBeenCalled();
  });

  it("đơn ngoài tầm nhìn ⇒ 'Không tìm thấy đơn hàng'", async () => {
    h.findUnique.mockResolvedValue(null);
    expect(await kyTaiLenHoaDonAction({ orderId: "don1", loai: "pdf" })).toMatchObject({
      ok: false,
      error: "Không tìm thấy đơn hàng",
    });
  });

  it("KIÊM NHIỆM: kế toán CS2 + sale CS1 ⇒ KHÔNG ký được cho đơn CS1", async () => {
    h.resolveActor.mockResolvedValue(KIEM);
    expect(await kyTaiLenHoaDonAction({ orderId: "don1", loai: "pdf" })).toMatchObject({
      ok: false,
      error: "Không tìm thấy đơn hàng",
    });
    expect(h.kyPut).not.toHaveBeenCalled();
  });

  it("cơ sở của đơn chưa có mã ⇒ từ chối (khoá tệp cần mã cơ sở)", async () => {
    h.findUnique.mockResolvedValue({ ...DON, center: { code: null } });
    expect(await kyTaiLenHoaDonAction({ orderId: "don1", loai: "pdf" })).toMatchObject({ ok: false });
    expect(h.kyPut).not.toHaveBeenCalled();
  });

  it("kho chưa cấu hình ⇒ từ chối, nói ra (không để PUT chết câm)", async () => {
    h.khoOk.mockReturnValue(false);
    expect(await kyTaiLenHoaDonAction({ orderId: "don1", loai: "pdf" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/chưa cấu hình/),
    });
  });

  it("vượt giới hạn lượt ⇒ từ chối, khoá giới hạn theo NGƯỜI", async () => {
    h.rateLimit.mockResolvedValue({ success: false, remaining: 0, resetAt: 0 });
    expect(await kyTaiLenHoaDonAction({ orderId: "don1", loai: "pdf" })).toMatchObject({ ok: false });
    expect(h.rateLimit.mock.calls[0]![0]).toMatchObject({ key: expect.stringContaining("u1") });
  });

  it("đầu vào sai (loại lạ) ⇒ từ chối trước mọi truy vấn", async () => {
    expect(await kyTaiLenHoaDonAction({ orderId: "don1", loai: "exe" })).toMatchObject({ ok: false });
    expect(h.findUnique).not.toHaveBeenCalled();
  });
});

describe("[HDA-02] bước 1 — ký URL PUT", () => {
  it("khoá tệp nằm DƯỚI đơn + cơ sở, ký đúng mime PDF, TTL 300 giây", async () => {
    const r = await kyTaiLenHoaDonAction({ orderId: "don1", loai: "pdf" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(khoaThuocDon(r.data.khoa, "CS1", "don1")).toBe(true);
    expect(r.data.khoa).toMatch(/\.pdf$/);
    expect(r.data.contentType).toBe("application/pdf");
    const [khoa, ct, ttl] = h.kyPut.mock.calls[0]!;
    expect(khoa).toBe(r.data.khoa);
    expect(ct).toBe("application/pdf");
    expect(ttl).toBe(300);
  });

  it("hai lần ký cho cùng đơn ⇒ hai khoá KHÁC nhau (không ghi đè tệp đang dùng)", async () => {
    const a = await kyTaiLenHoaDonAction({ orderId: "don1", loai: "pdf" });
    const b = await kyTaiLenHoaDonAction({ orderId: "don1", loai: "pdf" });
    expect(a.ok && b.ok && a.data.khoa !== b.data.khoa).toBe(true);
  });
});

describe("[HDA-03] bước 2 — xác minh tệp", () => {
  const KHOA_DUNG = "hoa-don/CS1/2026/don1/0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b.pdf";

  it("khoá của đơn KHÁC ⇒ từ chối, KHÔNG đụng kho", async () => {
    const r = await xacMinhTepHoaDonAction({
      orderId: "don1",
      loai: "pdf",
      khoa: "hoa-don/CS1/2026/don-khac/0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b.pdf",
    });
    expect(r).toMatchObject({ ok: false });
    expect(h.xacMinh).not.toHaveBeenCalled();
  });

  it("đuôi khoá khác loại khai (xin xml, khoá .pdf) ⇒ từ chối", async () => {
    expect(await xacMinhTepHoaDonAction({ orderId: "don1", loai: "xml", khoa: KHOA_DUNG })).toMatchObject({ ok: false });
    expect(h.xacMinh).not.toHaveBeenCalled();
  });

  it("tệp đạt ⇒ trả cỡ + sha256", async () => {
    h.xacMinh.mockResolvedValue({ ok: true, co: 1234, sha256: "ab".repeat(32) });
    expect(await xacMinhTepHoaDonAction({ orderId: "don1", loai: "pdf", khoa: KHOA_DUNG })).toEqual({
      ok: true,
      data: { khoa: KHOA_DUNG, co: 1234, sha256: "ab".repeat(32) },
    });
    expect(h.xacMinh).toHaveBeenCalledWith({ khoa: KHOA_DUNG, loai: "pdf" });
  });

  it("tệp sai loại ⇒ chuyển nguyên câu lỗi cho người dùng", async () => {
    h.xacMinh.mockResolvedValue({ ok: false, ma: "SAI_LOAI", thongDiep: "Tệp không phải PDF" });
    expect(await xacMinhTepHoaDonAction({ orderId: "don1", loai: "pdf", khoa: KHOA_DUNG })).toEqual({
      ok: false,
      error: "Tệp không phải PDF",
    });
  });

  it("KIÊM NHIỆM cũng bị chặn ở bước 2", async () => {
    h.resolveActor.mockResolvedValue(KIEM);
    expect(await xacMinhTepHoaDonAction({ orderId: "don1", loai: "pdf", khoa: KHOA_DUNG })).toMatchObject({ ok: false });
    expect(h.xacMinh).not.toHaveBeenCalled();
  });
});
