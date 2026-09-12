// @vitest-environment node
/**
 * `GET /dang-xuat` — lối thoát cho phiên đã chết, nay kèm thu hồi đăng ký push (US-14b Đợt 5).
 *
 * Bất biến pin ở đây:
 *  • ⚠️ `?reason=` KHÔNG PHẢI BẰNG CHỨNG. Bản đầu của Đợt 5 tin nó và lăng kính phản biện tìm
 *    ra: cookie phiên khai `sameSite: "lax"`, nên một ĐIỀU HƯỚNG TOP-LEVEL (link trong tin
 *    nhắn) tới `/dang-xuat?reason=session-disabled` mang cookie đi theo ⇒ nạn nhân mất push
 *    trên MỌI máy dù tài khoản còn sống. Không cần kẻ tấn công cũng chạm được: route
 *    `force-dynamic`, nên sau khi bị đá ra rồi đăng nhập lại, bấm Back hai nhịp là gọi lại GET
 *    này với cookie MỚI. Nay route HỎI DB (`checkSessionLiveness`) và chỉ thu hồi khi tài khoản
 *    THẬT SỰ chết; `reason` chỉ còn dùng để hiện thông báo ở `/login`.
 *  • Thu hồi là gỡ TẤT CẢ thiết bị — đúng ở ca này, vì tài khoản đã chết thì không nhận push ở
 *    đâu cả. Ca người dùng TỰ bấm (tài khoản còn sống) đi đường `lib/auth/logout-client.ts` và
 *    chỉ gỡ đúng máy đang ngồi.
 *  • `auth()` phải đọc TRƯỚC `signOut()`. Sau `signOut` cookie đã dọn, không còn cách nào biết
 *    vừa thu hồi cho ai — và lỗi đó sẽ IM LẶNG.
 *  • Kiểm tình trạng phiên chạy cho MỌI lượt ghé, không chỉ khi có `reason`: nút đăng xuất của
 *    site Sale (`components/sale/sale-nav.tsx`) trỏ `/dang-xuat` KHÔNG kèm reason.
 *  • `reason` lạ vẫn phải bị lọc khỏi URL đích (danh sách trắng có từ trước, đừng làm hỏng).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Song = { live: true } | { live: false; reason: "session-invalidated" | "session-disabled" };

const h = vi.hoisted(() => {
  const thuTu: string[] = [];
  return {
    thuTu,
    auth: vi.fn(async () => null as { user?: { id?: string; tokenVersion?: number } } | null),
    signOut: vi.fn(async (_o: { redirect: boolean }) => {}),
    liveness: vi.fn(async (_u: string, _v: number | undefined) => ({ live: true }) as Song),
    thuHoi: vi.fn(async (_p: { userId: string; lyDo: string }) => 0),
  };
});

vi.mock("@/lib/auth", () => ({ auth: h.auth, signOut: h.signOut }));
vi.mock("@/lib/auth/live-session", () => ({ checkSessionLiveness: h.liveness }));
vi.mock("@/lib/push/thu-hoi", () => ({ thuHoiMoiThietBiCuaNguoi: h.thuHoi }));

import { GET } from "./route";

function req(qs = ""): NextRequest {
  return new NextRequest(`https://admin.satarobo.vn/dang-xuat${qs}`);
}

/**
 * Đặt lại implementation. KHÔNG dùng `mockResolvedValue`: nó ĐÈ implementation, làm nhật ký
 * thứ tự (`thuTu`) rỗng và mọi khẳng định về thứ tự thành `-1 < -1`.
 */
function datLai(
  opts: { phien?: { user?: { id?: string; tokenVersion?: number } } | null; song?: Song } = {},
) {
  const phien = opts.phien === undefined ? { user: { id: "usr_a", tokenVersion: 3 } } : opts.phien;
  const song: Song = opts.song ?? { live: true };
  h.thuTu.length = 0;
  h.auth.mockClear().mockImplementation(async () => {
    h.thuTu.push("auth");
    return phien;
  });
  h.signOut.mockClear().mockImplementation(async () => {
    h.thuTu.push("signOut");
  });
  h.liveness.mockClear().mockImplementation(async () => {
    h.thuTu.push("liveness");
    return song;
  });
  h.thuHoi.mockClear().mockImplementation(async () => {
    h.thuTu.push("thuHoi");
    return 1;
  });
}

beforeEach(() => datLai());

describe("[PUSH-D5-T02] tài khoản ĐÃ CHẾT (theo DB) ⇒ thu hồi MỌI thiết bị", () => {
  it.each([
    ["session-invalidated", "session-invalidated"],
    ["session-disabled", "session-disabled"],
    // Đổi mật khẩu ⇒ `tokenVersion` lệch ⇒ DB nói `session-invalidated`. Lý do GHI VÀO SỔ là
    // lý do của DB, không phải chuỗi người gọi tự khai trên URL.
    ["password-changed", "session-invalidated"],
  ] as const)("URL nói %s, DB nói chết ⇒ thu hồi với lý do CỦA DB (%s)", async (urlReason, lyDo) => {
    datLai({ song: { live: false, reason: lyDo } });
    const res = await GET(req(`?reason=${urlReason}`));
    expect(h.thuHoi).toHaveBeenCalledTimes(1);
    expect(h.thuHoi.mock.calls[0]?.[0]).toEqual({ userId: "usr_a", lyDo });
    // Vẫn phải làm đúng việc cũ: dọn cookie rồi 303 về /login kèm lý do (để form hiện thông báo).
    expect(h.signOut).toHaveBeenCalledWith({ redirect: false });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain(`reason=${urlReason}`);
  });

  it("KHÔNG có reason mà tài khoản đã chết ⇒ VẪN thu hồi (đóng đường nút của site Sale)", async () => {
    // `components/sale/sale-nav.tsx` là `<a href="/dang-xuat">` không kèm reason. Nếu cổng chỉ
    // chạy khi có reason thì đường đó không nửa nào thu hồi.
    datLai({ song: { live: false, reason: "session-disabled" } });
    await GET(req());
    expect(h.thuHoi).toHaveBeenCalledTimes(1);
  });

  it("ĐỌC PHIÊN + HỎI DB TRƯỚC KHI signOut — đảo thứ tự là thu hồi cho `undefined`, im lặng", async () => {
    datLai({ song: { live: false, reason: "session-disabled" } });
    await GET(req("?reason=session-disabled"));
    expect(h.thuTu.indexOf("auth")).toBeGreaterThanOrEqual(0);
    expect(h.thuTu.indexOf("auth")).toBeLessThan(h.thuTu.indexOf("signOut"));
    expect(h.thuTu.indexOf("liveness")).toBeLessThan(h.thuTu.indexOf("signOut"));
    expect(h.thuTu.indexOf("thuHoi")).toBeLessThan(h.thuTu.indexOf("signOut"));
  });
});

describe("[PUSH-D5-T03] tài khoản CÒN SỐNG ⇒ TUYỆT ĐỐI không gỡ thiết bị", () => {
  it("⚠️ URL khai reason=session-disabled nhưng DB nói còn sống ⇒ KHÔNG thu hồi", async () => {
    // ĐÂY LÀ CA QUAN TRỌNG NHẤT CỦA TỆP. `reason` là tham số URL, ai cũng đặt được, và cookie
    // `sameSite: "lax"` mang theo trong điều hướng top-level. Tin nó là biến một cú "bị đăng
    // xuất" (đăng nhập lại là xong) thành PHÁ TRẠNG THÁI LÂU DÀI trên mọi thiết bị.
    datLai({ song: { live: true } });
    const res = await GET(req("?reason=session-disabled"));
    expect(h.liveness).toHaveBeenCalledWith("usr_a", 3);
    expect(h.thuHoi).not.toHaveBeenCalled();
    // Vẫn đăng xuất bình thường — hành vi cũ của route không đổi.
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(303);
  });

  it("người dùng tự bấm (không reason, còn sống) ⇒ không thu hồi", async () => {
    await GET(req());
    expect(h.thuHoi).not.toHaveBeenCalled();
    expect(h.signOut).toHaveBeenCalledTimes(1);
  });

  it("reason LẠ ⇒ không thu hồi, và không lọt vào URL đích", async () => {
    const res = await GET(req("?reason=" + encodeURIComponent("https://evil.example/x")));
    expect(h.thuHoi).not.toHaveBeenCalled();
    expect(res.headers.get("location")).not.toContain("evil.example");
  });
});

describe("[PUSH-D5-T03b] hỏng ở đâu cũng KHÔNG được giam người dùng", () => {
  it("phiên đã mất hẳn (auth trả null) ⇒ không hỏi DB, không thu hồi, vẫn dọn cookie", async () => {
    datLai({ phien: null });
    const res = await GET(req("?reason=session-disabled"));
    expect(h.liveness).not.toHaveBeenCalled();
    expect(h.thuHoi).not.toHaveBeenCalled();
    expect(h.signOut).toHaveBeenCalled();
    expect(res.status).toBe(303);
  });

  it("hỏi DB mà NÉM ⇒ bỏ thu hồi, vẫn đăng xuất và vẫn điều hướng", async () => {
    // Route này tồn tại để CỨU người khỏi vòng lặp `ERR_TOO_MANY_REDIRECTS`. Một lỗi lọt ra
    // ngoài sẽ giam họ lại trong đúng cái vòng lặp đó.
    datLai();
    h.liveness.mockImplementation(async () => {
      throw new Error("pooler chập");
    });
    const res = await GET(req("?reason=session-disabled"));
    expect(h.thuHoi).not.toHaveBeenCalled();
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(303);
  });
});
