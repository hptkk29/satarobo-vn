// Thu hồi đăng ký push phía server khi phiên kết thúc. Không chạm Postgres — `@/lib/db` mock.

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const updateMany = vi.fn(
    async (_a: { where: Record<string, unknown>; data: Record<string, unknown> }) => ({ count: 0 }),
  );
  return { updateMany, mockDb: { webPushSubscription: { updateMany } } };
});

vi.mock("@/lib/db", () => ({ db: h.mockDb }));

import { thuHoiMoiThietBiCuaNguoi } from "./thu-hoi";

const NOW = new Date("2026-09-13T03:00:00.000Z");

/** Tham số của lần `updateMany` gần nhất. */
function goi(): { where: Record<string, unknown>; data: Record<string, unknown> } {
  const c = h.updateMany.mock.calls.at(-1)?.[0];
  if (!c) throw new Error("updateMany chưa được gọi lần nào");
  return c;
}

beforeEach(() => {
  h.updateMany.mockReset().mockResolvedValue({ count: 2 });
});

describe("[PUSH-D5-T01] thu hồi MỌI thiết bị của một người", () => {
  it("lọc đúng người + chỉ dòng ACTIVE, ghi mốc và lý do", async () => {
    const n = await thuHoiMoiThietBiCuaNguoi({ userId: "usr_a", lyDo: "session-disabled", now: NOW });
    expect(n).toBe(2);
    expect(goi().where).toEqual({ userId: "usr_a", status: "ACTIVE" });
    expect(goi().data).toMatchObject({ status: "REVOKED", revokedAt: NOW });
    expect(String(goi().data.revokedReason)).toContain("vô hiệu hoá");
  });

  it("KHÔNG đụng dòng đã REVOKED/EXPIRED — mốc và lý do cũ là bằng chứng", async () => {
    // Ghi lại lên dòng đã chốt là xoá mất `revokedAt` thật của lần thu hồi trước; sổ vận hành
    // mất khả năng trả lời "thiết bị này chết lúc nào, vì sao".
    await thuHoiMoiThietBiCuaNguoi({ userId: "usr_a", lyDo: "session-invalidated", now: NOW });
    expect(goi().where.status).toBe("ACTIVE");
  });

  it("mỗi lý do ghi một câu KHÁC nhau — người trực đọc sổ phải phân biệt được", async () => {
    const lyDo = ["session-invalidated", "session-disabled", "password-changed"] as const;
    const cau = new Set<string>();
    for (const l of lyDo) {
      await thuHoiMoiThietBiCuaNguoi({ userId: "usr_a", lyDo: l, now: NOW });
      cau.add(String(goi().data.revokedReason));
    }
    expect(cau.size).toBe(3);
  });

  it("userId rỗng ⇒ KHÔNG gọi DB (một câu thiếu vế where là thu hồi cả bảng)", async () => {
    expect(await thuHoiMoiThietBiCuaNguoi({ userId: "", lyDo: "session-disabled" })).toBe(0);
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
      thuHoiMoiThietBiCuaNguoi({ userId: "usr_a", lyDo: "session-disabled" }),
    ).resolves.toBe(0);
  });
});
