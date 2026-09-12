/**
 * `logoutToGate()` — đăng xuất từ bất kỳ host nào, nay kèm gỡ đăng ký push CỦA ĐÚNG MÁY NÀY
 * trước khi `signOut` (US-14b Đợt 5).
 *
 * Ca thật phải đóng: máy lễ tân dùng chung, Sale A bật thông báo rồi đăng xuất, Sale B đăng
 * nhập cùng hồ sơ Chrome — service worker khoá theo ORIGIN chứ không theo phiên, nên mọi lead
 * chia cho A từ đó nổ trên màn hình khoá của máy B đang cầm, kèm tên phụ huynh.
 *
 * Bất biến pin ở đây:
 *  • MÁY CHỦ TRƯỚC, `unsubscribe()` SAU — `unsubscribe` không hoàn tác được, gọi trước là phá
 *    mất thứ duy nhất định danh được dòng cần thu hồi (đúng bài học `tatMayNay` ở Đợt 3).
 *  • NHƯNG `unsubscribe()` vẫn chạy dù máy chủ hỏng — một endpoint đã huỷ là endpoint không
 *    giao được cho AI, an toàn hơn để nguyên. Đây là chỗ KHÁC `tatMayNay` (thao tác sổ sách).
 *  • Cả hai việc trên chạy TRƯỚC `signOut`: action lấy `userId` từ phiên server, sau `signOut`
 *    nó chỉ trả "Chưa đăng nhập".
 *  • Máy chủ treo KHÔNG được giam người dùng lại — có trần thời gian chờ.
 *  • Nơi không có service worker (portal phụ huynh, site sale) ⇒ thoát sớm, KHÔNG một lượt
 *    gọi máy chủ nào.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const thuTu: string[] = [];
  return {
    thuTu,
    signOut: vi.fn(async (_o: { redirect: boolean }) => {
      thuTu.push("signOut");
    }),
    huyAction: vi.fn(async (_i: { endpoint: string }) => {
      thuTu.push("action");
      return { ok: true as const };
    }),
    unsubscribe: vi.fn(async () => {
      thuTu.push("unsubscribe");
      return true;
    }),
  };
});

vi.mock("next-auth/react", () => ({ signOut: h.signOut }));
vi.mock("@/app/(admin)/admin/settings/_push-actions", () => ({
  huyThietBiTheoEndpointAction: h.huyAction,
}));

import { logoutToGate } from "./logout-client";

const EP = "https://fcm.googleapis.com/wp/may-le-tan-dung-chung";

/** Dựng `navigator.serviceWorker` với (hoặc không có) một đăng ký push. */
function dungNavigator(opts: { coWorker?: boolean; coSub?: boolean } = {}) {
  const { coWorker = true, coSub = true } = opts;
  const sub = { endpoint: EP, unsubscribe: h.unsubscribe };
  const reg = { pushManager: { getSubscription: vi.fn(async () => (coSub ? sub : null)) } };
  const sw = { getRegistration: vi.fn(async () => (coWorker ? reg : undefined)) };
  Object.defineProperty(window, "navigator", {
    value: coWorker ? { serviceWorker: sw } : {},
    configurable: true,
    writable: true,
  });
  return { sw, reg };
}

beforeEach(() => {
  // KHÔNG dùng `mockResolvedValue`: nó ĐÈ implementation, làm nhật ký thứ tự (`thuTu`) rỗng và
  // mọi khẳng định về thứ tự thành `-1 < -1` — xanh/đỏ vì lý do không liên quan tới mã đang kiểm.
  h.thuTu.length = 0;
  h.signOut.mockClear().mockImplementation(async () => {
    h.thuTu.push("signOut");
  });
  h.huyAction.mockClear().mockImplementation(async () => {
    h.thuTu.push("action");
    return { ok: true as const };
  });
  h.unsubscribe.mockClear().mockImplementation(async () => {
    h.thuTu.push("unsubscribe");
    return true;
  });
  // jsdom không cho gán `window.location.href` (ném "Not implemented: navigation"), mà chính
  // dòng gán đó là bước cuối của hàm. Thay bằng một object thường để đọc lại được đích.
  Object.defineProperty(window, "location", {
    value: { href: "", hostname: "admin.satarobo.vn" },
    configurable: true,
    writable: true,
  });
  dungNavigator();
});

describe("[PUSH-D5-T04] gỡ đăng ký push của máy này trước khi đăng xuất", () => {
  it("gọi action với ĐÚNG endpoint của máy này, rồi unsubscribe, rồi mới signOut", async () => {
    await logoutToGate();
    expect(h.huyAction).toHaveBeenCalledWith({ endpoint: EP });
    expect(h.thuTu).toEqual(["action", "unsubscribe", "signOut"]);
  });

  it("MÁY CHỦ TRƯỚC trình duyệt — đảo lại là phá mất thứ định danh dòng cần thu hồi", async () => {
    await logoutToGate();
    expect(h.thuTu.indexOf("action")).toBeLessThan(h.thuTu.indexOf("unsubscribe"));
  });

  it("cả hai việc chạy TRƯỚC signOut — sau đó action chỉ trả 'Chưa đăng nhập'", async () => {
    await logoutToGate();
    expect(h.thuTu.indexOf("action")).toBeLessThan(h.thuTu.indexOf("signOut"));
    expect(h.thuTu.indexOf("unsubscribe")).toBeLessThan(h.thuTu.indexOf("signOut"));
  });

  it("vẫn điều hướng về cổng login sau khi xong", async () => {
    await logoutToGate();
    expect(window.location.href).toBe("/login");
  });
});

describe("[PUSH-D5-T05] hỏng nửa đường vẫn phải bảo vệ người ngồi sau", () => {
  it("action NÉM ⇒ VẪN unsubscribe (endpoint đã huỷ không giao được cho ai)", async () => {
    // Khác `tatMayNay`: ở đây mục đích là BẢO VỆ, không phải sổ sách. Dòng DB còn ACTIVE sẽ tự
    // chết ở lượt gửi kế (push service trả 410 ⇒ engine đánh EXPIRED).
    h.huyAction.mockRejectedValue(new Error("mạng hỏng"));
    await logoutToGate();
    expect(h.unsubscribe).toHaveBeenCalledTimes(1);
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe("/login");
  });

  it("action trả ok:false (phiên vừa hết) ⇒ vẫn unsubscribe", async () => {
    h.huyAction.mockResolvedValue({ ok: false, error: "Chưa đăng nhập" } as never);
    await logoutToGate();
    expect(h.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe NÉM ⇒ vẫn signOut và vẫn điều hướng, không giam người dùng", async () => {
    h.unsubscribe.mockRejectedValue(new Error("worker đã chết"));
    await logoutToGate();
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe("/login");
  });

  it("máy chủ TREO ⇒ vẫn đăng xuất, không chờ vô hạn", async () => {
    // Người bấm "Đăng xuất" trên máy dùng chung là đang muốn ĐỨNG LÊN ĐI. Chờ vô hạn thì họ
    // bỏ đi với phiên còn mở — tệ hơn hẳn cái ta đang cố vá.
    vi.useFakeTimers();
    h.huyAction.mockImplementation(() => new Promise(() => {})); // không bao giờ xong
    const p = logoutToGate();
    await vi.advanceTimersByTimeAsync(2_000);
    await p;
    vi.useRealTimers();
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe("/login");
  });
});

describe("[PUSH-D5-T06] nơi không có push thì không tốn gì", () => {
  it("không có service worker (portal phụ huynh) ⇒ KHÔNG gọi máy chủ", async () => {
    dungNavigator({ coWorker: false });
    await logoutToGate();
    expect(h.huyAction).not.toHaveBeenCalled();
    expect(h.signOut).toHaveBeenCalledTimes(1);
  });

  it("có worker nhưng chưa ai bật thông báo ⇒ KHÔNG gọi máy chủ", async () => {
    dungNavigator({ coSub: false });
    await logoutToGate();
    expect(h.huyAction).not.toHaveBeenCalled();
    expect(h.unsubscribe).not.toHaveBeenCalled();
    expect(h.signOut).toHaveBeenCalledTimes(1);
  });
});
