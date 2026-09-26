// @vitest-environment node
//
// Ca [HDA-*] — TẢI LÊN HAI BƯỚC: ký URL PUT (bước 1) → trình duyệt PUT thẳng R2 → xác minh (bước 2).
// (docs/ke-toan-hoa-don/PLAN.md §6.) GĐ 4 thêm ghi bảng hoá đơn — lưu nháp / không xuất / gỡ ([HDA-04..]).
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
  nap: vi.fn(),
  tao: vi.fn(async () => ({ id: "hd-moi" })),
  capNhat: vi.fn(async () => ({ tepCanXoa: [] as string[] })),
  go: vi.fn(async () => ({ tepCanXoa: [] as string[] })),
  xoaTep: vi.fn(async () => undefined),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/finance/hoa-don/hang-cho", () => ({ napHangChoHoaDon: h.nap }));
vi.mock("@/lib/finance/hoa-don/ghi-hoa-don", async (goc) => ({
  ...(await goc<typeof import("@/lib/finance/hoa-don/ghi-hoa-don")>()),
  taoHoaDonChoLanThu: h.tao,
  capNhatHoaDonNhap: h.capNhat,
  goHoaDonChuaChot: h.go,
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
  xoaTepHoaDon: h.xoaTep,
}));

import {
  goHoaDonAction,
  khongXuatHoaDonAction,
  kyTaiLenHoaDonAction,
  luuHoaDonNhapAction,
  xacMinhTepHoaDonAction,
} from "./_actions";
import { khoaThuocDon } from "@/lib/finance/hoa-don/kho-tep";
import { LoiGhiHoaDon } from "@/lib/finance/hoa-don/ghi-hoa-don";

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

// ─── GĐ 4 — ghi bảng hoá đơn ──────────────────────────────────────────────────────────────────

const KHOA_PDF = "hoa-don/CS1/2026/don1/0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b.pdf";
const KHOA_PDF_2 = "hoa-don/CS1/2026/don1/1f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b.pdf";
const KHOA_XML = "hoa-don/CS1/2026/don1/2f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b.xml";

type DongGia = {
  key: string;
  orderId: string;
  ngan: string;
  khoan: { id: string; soTien: number }[];
  hoaDonNhap: { id: string } | null;
  hanhDong: { taiLen: { bat: boolean; lyDo?: string }; khongXuat: boolean };
};
const dong = (o: Partial<DongGia> = {}): DongGia => ({
  key: "dot:dot1",
  orderId: "don1",
  ngan: "cho",
  khoan: [
    { id: "p1", soTien: 3_000_000 },
    { id: "p2", soTien: 2_000_000 },
  ],
  hoaDonNhap: null,
  hanhDong: { taiLen: { bat: true }, khongXuat: true },
  ...o,
});
const coDong = (...ds: DongGia[]) => h.nap.mockResolvedValue({ dong: ds, thieuCoSo: 0, khoOk: true });
const LUU = {
  orderId: "don1",
  lanThuKey: "dot:dot1",
  pdf: { khoa: KHOA_PDF, ten: "C:\\fakepath\\HD 127.pdf" },
  kyHieu: "1C26TSR",
  soHoaDon: "00000127",
  ngayPhatHanh: "2026-09-12",
  guiEmailKhach: true,
};
const arg0 = (m: { mock: { calls: unknown[][] } }, i = 0) => m.mock.calls[i]![0] as Record<string, unknown>;

describe("[HDA-04] lưu nháp — tập khoản đến từ LOADER, tệp xác minh LẠI", () => {
  beforeEach(() => {
    coDong(dong());
    h.xacMinh.mockResolvedValue({ ok: true, co: 1234, sha256: "ab".repeat(32) });
  });

  it("tạo mới: khoản + số ròng của loader, tệp đã xác minh, số hoá đơn đã chuẩn hoá", async () => {
    expect(await luuHoaDonNhapAction({ ...LUU, khoan: [{ id: "p9", soTien: 1 }] })).toEqual({
      ok: true,
      data: { hoaDonId: "hd-moi" },
    });
    expect(h.nap).toHaveBeenCalledWith(KE_TOAN_CS1, expect.objectContaining({ orderId: "don1" }));
    expect(h.xacMinh).toHaveBeenCalledWith({ khoa: KHOA_PDF, loai: "pdf" });
    expect(arg0(h.tao)).toMatchObject({
      orderId: "don1",
      centerId: "cs1",
      lanThuKey: "dot:dot1",
      khoan: [
        { id: "p1", soTien: 3_000_000 },
        { id: "p2", soTien: 2_000_000 },
      ],
      loai: {
        trangThai: "NHAP",
        so: { kyHieu: "1C26TSR", soHoaDon: "127" },
        pdf: { khoa: KHOA_PDF, ten: "HD 127.pdf", co: 1234, sha256: "ab".repeat(32) },
        xml: null,
      },
    });
  });

  it("thiếu PDF khi tạo mới ⇒ từ chối, không ghi", async () => {
    const { pdf: _bo, ...khongPdf } = LUU;
    expect(await luuHoaDonNhapAction(khongPdf)).toMatchObject({ ok: false, error: expect.stringMatching(/PDF/) });
    expect(h.tao).not.toHaveBeenCalled();
  });

  it("khoá tệp của đơn khác ⇒ từ chối, không đụng kho, không ghi", async () => {
    const r = await luuHoaDonNhapAction({ ...LUU, pdf: { khoa: KHOA_PDF.replace("/don1/", "/don2/"), ten: "a.pdf" } });
    expect(r).toMatchObject({ ok: false, error: "Tệp không thuộc đơn này" });
    expect(h.xacMinh).not.toHaveBeenCalled();
    expect(h.tao).not.toHaveBeenCalled();
  });

  it("tệp không đạt khi xác minh lại ⇒ từ chối, không ghi", async () => {
    h.xacMinh.mockResolvedValue({ ok: false, ma: "SAI_LOAI", thongDiep: "Tệp không phải PDF" });
    expect(await luuHoaDonNhapAction(LUU)).toEqual({ ok: false, error: "Tệp không phải PDF" });
    expect(h.tao).not.toHaveBeenCalled();
  });

  it("khoá lần thu không còn / lần thu đã có hoá đơn ⇒ từ chối", async () => {
    expect(await luuHoaDonNhapAction({ ...LUU, lanThuKey: "dot:khac" })).toMatchObject({ ok: false });
    coDong(dong({ ngan: "nhap", hoaDonNhap: { id: "hd1" } }));
    expect(await luuHoaDonNhapAction(LUU)).toMatchObject({ ok: false });
    coDong(dong({ ngan: "da-xuat" }));
    expect(await luuHoaDonNhapAction(LUU)).toMatchObject({ ok: false });
    expect(h.tao).not.toHaveBeenCalled();
  });

  it("ô số sai (ký hiệu lệch năm phát hành) ⇒ từ chối trước khi nạp gì", async () => {
    expect(await luuHoaDonNhapAction({ ...LUU, kyHieu: "1C25TSR" })).toMatchObject({ ok: false });
    expect(h.nap).not.toHaveBeenCalled();
  });

  it("KIÊM NHIỆM kế toán CS2 + sale CS1 ⇒ không lưu được cho đơn CS1", async () => {
    h.resolveActor.mockResolvedValue(KIEM);
    expect(await luuHoaDonNhapAction(LUU)).toMatchObject({ ok: false, error: "Không tìm thấy đơn hàng" });
    expect(h.tao).not.toHaveBeenCalled();
  });

  it("lỗi nghiệp vụ của tầng ghi ⇒ câu cho người dùng; lỗi lạ ⇒ ném", async () => {
    h.tao.mockRejectedValueOnce(new LoiGhiHoaDon("TRUNG_SO"));
    expect(await luuHoaDonNhapAction(LUU)).toMatchObject({ ok: false, error: expect.stringMatching(/Số hoá đơn/) });
    h.tao.mockRejectedValueOnce(new Error("mất kết nối"));
    await expect(luuHoaDonNhapAction(LUU)).rejects.toThrow("mất kết nối");
  });
});

describe("[HDA-05] sửa nháp", () => {
  beforeEach(() => {
    coDong(dong({ ngan: "nhap", hoaDonNhap: { id: "hd1" } }));
    h.xacMinh.mockResolvedValue({ ok: true, co: 99, sha256: "cd".repeat(32) });
  });

  it("id nháp không khớp dòng ⇒ từ chối", async () => {
    expect(await luuHoaDonNhapAction({ ...LUU, hoaDonId: "hd-khac" })).toMatchObject({ ok: false });
    expect(h.capNhat).not.toHaveBeenCalled();
  });

  it("đổi PDF + gỡ XML ⇒ tệp cũ được dọn SAU khi ghi", async () => {
    h.capNhat.mockResolvedValueOnce({ tepCanXoa: [KHOA_PDF, KHOA_XML] });
    const r = await luuHoaDonNhapAction({ ...LUU, hoaDonId: "hd1", pdf: { khoa: KHOA_PDF_2, ten: "b.pdf" }, xml: null });
    expect(r).toEqual({ ok: true, data: { hoaDonId: "hd1" } });
    expect(arg0(h.capNhat)).toMatchObject({ hoaDonId: "hd1", pdf: { khoa: KHOA_PDF_2 }, xml: null });
    expect(h.xoaTep.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual([KHOA_PDF, KHOA_XML]);
  });

  it("sửa chỉ ô số (không gửi tệp) ⇒ giữ tệp: pdf/xml undefined, không xác minh", async () => {
    const { pdf: _bo, ...khongTep } = LUU;
    expect(await luuHoaDonNhapAction({ ...khongTep, hoaDonId: "hd1" })).toMatchObject({ ok: true });
    const arg = arg0(h.capNhat);
    expect(arg.pdf).toBeUndefined();
    expect(arg.xml).toBeUndefined();
    expect(h.xacMinh).not.toHaveBeenCalled();
  });
});

describe("[HDA-06] không xuất + gỡ", () => {
  beforeEach(() => coDong(dong()));

  it("lý do có sẵn ⇒ ghi KHONG_XUAT với khoản của loader", async () => {
    expect(
      await khongXuatHoaDonAction({ orderId: "don1", lanThuKey: "dot:dot1", lyDo: "Khách không lấy hoá đơn" }),
    ).toMatchObject({ ok: true });
    expect(arg0(h.tao)).toMatchObject({
      khoan: [{ id: "p1" }, { id: "p2" }],
      loai: { trangThai: "KHONG_XUAT", lyDo: "Khách không lấy hoá đơn" },
    });
  });

  it("'Khác' thiếu ghi chú ⇒ từ chối trước mọi truy vấn; đủ ghi chú ⇒ lý do 'Khác: …'", async () => {
    expect(
      await khongXuatHoaDonAction({ orderId: "don1", lanThuKey: "dot:dot1", lyDo: "Khác", ghiChu: "abc" }),
    ).toMatchObject({ ok: false });
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(
      await khongXuatHoaDonAction({ orderId: "don1", lanThuKey: "dot:dot1", lyDo: "Khác", ghiChu: "Trả lại học phí" }),
    ).toMatchObject({ ok: true });
    expect((arg0(h.tao).loai as { lyDo: string }).lyDo).toBe("Khác: Trả lại học phí");
  });

  it("dòng đã có hoá đơn nháp ⇒ không đánh dấu được", async () => {
    coDong(dong({ ngan: "nhap", hoaDonNhap: { id: "hd1" } }));
    expect(
      await khongXuatHoaDonAction({ orderId: "don1", lanThuKey: "dot:dot1", lyDo: "Khách không lấy hoá đơn" }),
    ).toMatchObject({ ok: false });
    expect(h.tao).not.toHaveBeenCalled();
  });

  it("gỡ ⇒ gọi lõi với đúng đơn, dọn tệp; KIÊM NHIỆM ⇒ chặn", async () => {
    h.go.mockResolvedValueOnce({ tepCanXoa: [KHOA_PDF] });
    expect(await goHoaDonAction({ orderId: "don1", hoaDonId: "hd1" })).toMatchObject({ ok: true });
    expect(arg0(h.go)).toMatchObject({ orderId: "don1", hoaDonId: "hd1" });
    expect(h.xoaTep).toHaveBeenCalledWith(KHOA_PDF);
    h.resolveActor.mockResolvedValue(KIEM);
    expect(await goHoaDonAction({ orderId: "don1", hoaDonId: "hd1" })).toMatchObject({ ok: false });
    expect(h.go).toHaveBeenCalledTimes(1);
  });
});
