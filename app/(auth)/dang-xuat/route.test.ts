// @vitest-environment node
/**
 * `GET /dang-xuat` — lối thoát cho phiên đã chết, nay kèm thu hồi đăng ký push (US-14b Đợt 5).
 *
 * Bất biến pin ở đây:
 *  • CÓ `reason` = server vừa đá người ra vì tài khoản chết (xoá / vô hiệu hoá / đổi mật khẩu).
 *    Ba ca đó nửa client KHÔNG BAO GIỜ chạy được, nên đây là chỗ DUY NHẤT thu hồi được —
 *    và ở đó gỡ TẤT CẢ thiết bị là đúng: tài khoản đã chết thì không nhận push ở đâu cả.
 *  • KHÔNG có `reason` = người dùng tự bấm đăng xuất ⇒ TUYỆT ĐỐI không gỡ hết. Gỡ hết ở đây
 *    là đăng xuất ở desktop công ty làm mất push trên điện thoại riêng, mà người ta đăng xuất
 *    hằng ngày. Ca đó đi đường `lib/auth/logout-client.ts` và chỉ gỡ đúng máy đang ngồi.
 *  • `auth()` phải đọc TRƯỚC `signOut()`. Sau `signOut` cookie đã dọn, không còn cách nào biết
 *    vừa thu hồi cho ai — và lỗi đó sẽ IM LẶNG (không ai bị gỡ, không ai báo gì).
 *  • `reason` lạ vẫn phải bị lọc khỏi URL đích (danh sách trắng có từ trước, đừng làm hỏng).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const thuTu: string[] = [];
  return {
    thuTu,
    auth: vi.fn(async () => {
      thuTu.push("auth");
      return { user: { id: "usr_a" } } as { user?: { id?: string } } | null;
    }),
    signOut: vi.fn(async (_o: { redirect: boolean }) => {
      thuTu.push("signOut");
    }),
    thuHoi: vi.fn(async (_p: { userId: string; lyDo: string }) => {
      thuTu.push("thuHoi");
      return 1;
    }),
  };
});

vi.mock("@/lib/auth", () => ({ auth: h.auth, signOut: h.signOut }));
vi.mock("@/lib/push/thu-hoi", () => ({ thuHoiMoiThietBiCuaNguoi: h.thuHoi }));

import { GET } from "./route";

function req(qs = ""): NextRequest {
  return new NextRequest(`https://admin.satarobo.vn/dang-xuat${qs}`);
}

/**
 * Đặt lại implementation, KHÔNG dùng `mockResolvedValue`.
 *
 * `mockResolvedValue` ĐÈ implementation, nên nhật ký thứ tự (`thuTu`) sẽ rỗng và mọi khẳng
 * định về thứ tự thành `-1 < -1` — xanh/đỏ vì lý do không liên quan tới mã đang kiểm.
 */
function datLai(phien: { user?: { id?: string } } | null = { user: { id: "usr_a" } }) {
  h.thuTu.length = 0;
  h.auth.mockClear().mockImplementation(async () => {
    h.thuTu.push("auth");
    return phien;
  });
  h.signOut.mockClear().mockImplementation(async () => {
    h.thuTu.push("signOut");
  });
  h.thuHoi.mockClear().mockImplementation(async () => {
    h.thuTu.push("thuHoi");
    return 1;
  });
}

beforeEach(() => datLai());

describe("[PUSH-D5-T02] tài khoản chết ⇒ thu hồi MỌI thiết bị", () => {
  it.each(["session-invalidated", "session-disabled", "password-changed"])(
    "reason=%s ⇒ gọi thu hồi cho đúng người trong phiên",
    async (reason) => {
      const res = await GET(req(`?reason=${reason}`));
      expect(h.thuHoi).toHaveBeenCalledTimes(1);
      expect(h.thuHoi.mock.calls[0]?.[0]).toEqual({ userId: "usr_a", lyDo: reason });
      // Vẫn phải làm đúng việc cũ: dọn cookie rồi 303 về /login kèm lý do.
      expect(h.signOut).toHaveBeenCalledWith({ redirect: false });
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toContain(`reason=${reason}`);
    },
  );

  it("ĐỌC PHIÊN TRƯỚC KHI signOut — đảo thứ tự là thu hồi cho `undefined`, im lặng", async () => {
    await GET(req("?reason=session-disabled"));
    expect(h.thuTu.indexOf("auth")).toBeGreaterThanOrEqual(0);
    expect(h.thuTu.indexOf("thuHoi")).toBeLessThan(h.thuTu.indexOf("signOut"));
    expect(h.thuTu.indexOf("auth")).toBeLessThan(h.thuTu.indexOf("signOut"));
  });

  it("phiên đã mất hẳn (auth trả null) ⇒ không thu hồi, vẫn dọn cookie và điều hướng", async () => {
    datLai(null);
    const res = await GET(req("?reason=session-disabled"));
    expect(h.thuHoi).not.toHaveBeenCalled();
    expect(h.signOut).toHaveBeenCalled();
    expect(res.status).toBe(303);
  });
});

describe("[PUSH-D5-T03] người dùng TỰ bấm đăng xuất ⇒ KHÔNG gỡ hết", () => {
  it("không có reason ⇒ không gọi thu hồi, không cả đọc phiên", async () => {
    // Gỡ hết ở đây là mất push trên điện thoại riêng mỗi lần đăng xuất ở máy công ty.
    const res = await GET(req());
    expect(h.thuHoi).not.toHaveBeenCalled();
    expect(h.auth).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).not.toContain("reason=");
  });

  it("reason LẠ ⇒ đối xử như không có: không gỡ hết, và không lọt vào URL đích", async () => {
    const res = await GET(req("?reason=" + encodeURIComponent("https://evil.example/x")));
    expect(h.thuHoi).not.toHaveBeenCalled();
    expect(res.headers.get("location")).not.toContain("evil.example");
  });
});
