// Thu hồi đăng ký push phía server khi phiên kết thúc. Không chạm Postgres — `@/lib/db` mock.

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const updateMany = vi.fn(
    async (_a: { where: Record<string, unknown>; data: Record<string, unknown> }) => ({ count: 0 }),
  );
  const userFindUnique = vi.fn(
    async (_a: unknown) => null as { isActive: boolean; deletedAt: Date | null } | null,
  );
  return {
    updateMany,
    userFindUnique,
    mockDb: {
      webPushSubscription: { updateMany },
      user: { findUnique: userFindUnique },
    },
  };
});

vi.mock("@/lib/db", () => ({ db: h.mockDb }));

import { thuHoiMoiThietBiCuaNguoi, thuHoiNeuTaiKhoanChet } from "./thu-hoi";

const NOW = new Date("2026-09-13T03:00:00.000Z");

/** Tham số của lần `updateMany` gần nhất. */
function goi(): { where: Record<string, unknown>; data: Record<string, unknown> } {
  const c = h.updateMany.mock.calls.at(-1)?.[0];
  if (!c) throw new Error("updateMany chưa được gọi lần nào");
  return c;
}

beforeEach(() => {
  h.updateMany.mockReset().mockResolvedValue({ count: 2 });
  h.userFindUnique.mockReset().mockResolvedValue({ isActive: true, deletedAt: null });
});

describe("[PUSH-D5-T01] thu hồi MỌI thiết bị của một người", () => {
  it("lọc đúng người + chỉ dòng ACTIVE, ghi mốc và lý do", async () => {
    const n = await thuHoiMoiThietBiCuaNguoi({
      userId: "usr_a",
      lyDo: "bi-vo-hieu-hoa",
      now: NOW,
    });
    expect(n).toBe(2);
    expect(goi().where).toEqual({ userId: "usr_a", status: "ACTIVE" });
    expect(goi().data).toMatchObject({ status: "REVOKED", revokedAt: NOW });
    expect(String(goi().data.revokedReason)).toContain("vô hiệu hoá");
  });

  it("chỉ chạm dòng ACTIVE — mốc và lý do của lần thu hồi TRƯỚC là bằng chứng", async () => {
    // Ghi lại lên dòng đã chốt là xoá mất `revokedAt` thật của lần trước; sổ vận hành mất khả
    // năng trả lời "thiết bị này chết lúc nào, vì sao". Bất biến này cũng được `_push-actions.ts`
    // tôn trọng ở nhánh chuyển chủ (nó cũng lọc `status: "ACTIVE"`) — hai mảnh của cùng một đợt
    // phải nói cùng một điều.
    await thuHoiMoiThietBiCuaNguoi({ userId: "usr_a", lyDo: "da-xoa", now: NOW });
    expect(goi().where.status).toBe("ACTIVE");
    expect(goi().data).not.toHaveProperty("userId");
  });

  it("hai lý do ghi hai câu KHÁC nhau — người trực đọc sổ phải phân biệt được", async () => {
    const cau = new Set<string>();
    for (const l of ["da-xoa", "bi-vo-hieu-hoa"] as const) {
      await thuHoiMoiThietBiCuaNguoi({ userId: "usr_a", lyDo: l, now: NOW });
      cau.add(String(goi().data.revokedReason));
    }
    expect(cau.size).toBe(2);
  });

  it("userId rỗng ⇒ KHÔNG gọi DB (một câu thiếu vế where là thu hồi cả bảng)", async () => {
    expect(await thuHoiMoiThietBiCuaNguoi({ userId: "", lyDo: "bi-vo-hieu-hoa" })).toBe(0);
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("bảng chưa tồn tại (migration chưa chạy) ⇒ nuốt lỗi, trả 0, KHÔNG ném", async () => {
    // Hàm này nằm trên đường ĐĂNG XUẤT — mà route `/dang-xuat` tồn tại chính để cứu người khỏi
    // vòng lặp ERR_TOO_MANY_REDIRECTS. Một lỗi lọt ra ngoài sẽ giam họ lại trong đúng vòng lặp
    // đó. Và ca này đang chờ sẵn: migration hai bảng push CHƯA chạy ở môi trường nào.
    h.updateMany.mockRejectedValue(
      Object.assign(new Error("The table `public.WebPushSubscription` does not exist"), {
        code: "P2021",
      }),
    );
    await expect(
      thuHoiMoiThietBiCuaNguoi({ userId: "usr_a", lyDo: "bi-vo-hieu-hoa" }),
    ).resolves.toBe(0);
  });
});

describe("[PUSH-D5-T14] CHỈ thu hồi khi tài khoản THẬT SỰ chết", () => {
  it("tài khoản bị XOÁ (deletedAt) ⇒ thu hồi, lý do 'đã bị xoá'", async () => {
    h.userFindUnique.mockResolvedValue({ isActive: true, deletedAt: NOW });
    const kq = await thuHoiNeuTaiKhoanChet({ userId: "usr_a", now: NOW });
    expect(kq).toEqual({ chet: true, soDong: 2 });
    expect(String(goi().data.revokedReason)).toContain("xoá");
  });

  it("tài khoản bị VÔ HIỆU HOÁ ⇒ thu hồi, lý do 'bị vô hiệu hoá'", async () => {
    h.userFindUnique.mockResolvedValue({ isActive: false, deletedAt: null });
    const kq = await thuHoiNeuTaiKhoanChet({ userId: "usr_a", now: NOW });
    expect(kq.chet).toBe(true);
    expect(String(goi().data.revokedReason)).toContain("vô hiệu hoá");
  });

  it("không tìm thấy bản ghi (xoá cứng) ⇒ coi là chết", async () => {
    h.userFindUnique.mockResolvedValue(null);
    expect((await thuHoiNeuTaiKhoanChet({ userId: "usr_a" })).chet).toBe(true);
  });

  it("⚠️ TÀI KHOẢN CÒN SỐNG ⇒ TUYỆT ĐỐI không thu hồi, dù đang trên đường đăng xuất", async () => {
    // CA QUAN TRỌNG NHẤT CỦA TỆP. Bản trước của Đợt 5 dùng `checkSessionLiveness`, mà hàm đó
    // trả CÙNG nhãn `session-invalidated` cho "tài khoản bị xoá" và cho "`tokenVersion` lệch".
    // Bump `tokenVersion` là thao tác THƯỜNG NGÀY — đo được 9 nơi trong repo: đổi vai, cấp/thu
    // quyền per-user (3 nơi), force logout, tự đặt lại mật khẩu. Hệ quả của bản trước: SUPER_ADMIN
    // cấp thêm một quyền cho một Sale ⇒ lượt tải trang kế bị layout đá qua
    // `/dang-xuat?reason=session-invalidated` ⇒ gỡ sạch push trên MỌI máy của họ, im lặng.
    h.userFindUnique.mockResolvedValue({ isActive: true, deletedAt: null });
    const kq = await thuHoiNeuTaiKhoanChet({ userId: "usr_a" });
    expect(kq).toEqual({ chet: false, soDong: 0 });
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("chỉ đọc hai cột NÓI VỀ SỰ SỐNG — không đọc tokenVersion", async () => {
    // Đọc `tokenVersion` ở đây là mở lại đúng cửa vừa đóng: nó không nói gì về việc tài khoản
    // còn sống hay không.
    await thuHoiNeuTaiKhoanChet({ userId: "usr_a" });
    const w = h.userFindUnique.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      select: Record<string, true>;
    };
    expect(w.where).toEqual({ id: "usr_a" });
    expect(Object.keys(w.select).sort()).toEqual(["deletedAt", "isActive"]);
  });

  it("userId rỗng ⇒ không đọc DB, không thu hồi", async () => {
    expect(await thuHoiNeuTaiKhoanChet({ userId: "" })).toEqual({ chet: false, soDong: 0 });
    expect(h.userFindUnique).not.toHaveBeenCalled();
  });

  it("đọc DB mà NÉM ⇒ KHÔNG thu hồi, KHÔNG ném ra ngoài", async () => {
    // Fail-safe đúng chiều: không đọc được tình trạng thì đừng gỡ gì. Gỡ khi không chắc là
    // biến một sự cố DB thành mất push hàng loạt.
    h.userFindUnique.mockRejectedValue(new Error("pooler chập"));
    await expect(thuHoiNeuTaiKhoanChet({ userId: "usr_a" })).resolves.toEqual({
      chet: false,
      soDong: 0,
    });
    expect(h.updateMany).not.toHaveBeenCalled();
  });
});
