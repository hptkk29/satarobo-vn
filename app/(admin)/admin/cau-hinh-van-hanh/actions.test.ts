/**
 * `luuLoaiDuocDayAction` — đường ghi DUY NHẤT của danh sách loại thông báo được đẩy.
 *
 * ── VÌ SAO BỘ NÀY TỒN TẠI ────────────────────────────────────────────────────────────────
 * Phép đối chiếu "khoá này có thật trong danh mục không" vốn nằm ở schema Zod trong
 * `lib/settings/registry.ts` — đúng chỗ theo thiết kế của repo ("schema là source-of-truth
 * validate"). Nhưng nó cần `import catalogPrefixes`, và `lint:boundaries` bắt được **11 vòng
 * import**:
 *
 *     registry → notifications/catalog → notifications/pending-sync → pending-tasks
 *     → settings/service · auth/actor · auth/permission-eval → … → registry
 *
 * `pending-sync` chỉ `import type` từ `pending-tasks` nên vòng ấy không tồn tại lúc chạy,
 * nhưng luật `no-circular` của repo không loại trừ import kiểu. Nới luật chung để hợp thức
 * hoá một tính năng là đổi rào cho cả repo — nên phép kiểm dời xuống đây.
 *
 * Dời xuống thì nó KHÔNG còn được schema bảo vệ nữa, và đây là bộ test thay chỗ đó.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ user: { id: "u_admin", name: "Quản trị", email: "a@b.vn" } })),
  resolveActor: vi.fn(async (_id: string) => ({ userId: "u_admin", isSuperAdmin: true })),
  setGlobalSetting: vi.fn(async (_a: unknown, _p: { key: string; value: unknown; reason: string }) => ({
    ok: true as const,
  })),
  setCenterSetting: vi.fn(async () => ({ ok: true as const })),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@/lib/auth/actor", () => ({ resolveActor: h.resolveActor }));
vi.mock("@/lib/settings/service", () => ({
  setGlobalSetting: h.setGlobalSetting,
  setCenterSetting: h.setCenterSetting,
}));

import { luuLoaiDuocDayAction } from "./actions";

/** Giá trị `value` của lần ghi gần nhất. */
function daGhi(): string[] {
  const c = h.setGlobalSetting.mock.calls.at(-1)?.[1];
  if (!c) throw new Error("setGlobalSetting chưa được gọi lần nào");
  return c.value as string[];
}

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue({ user: { id: "u_admin", name: "Quản trị", email: "a@b.vn" } });
  h.setGlobalSetting.mockResolvedValue({ ok: true });
});

describe("[PUSH-D7-T30] đối chiếu danh mục — cổng đã dời từ registry xuống đây", () => {
  it("khoá CÓ THẬT ⇒ ghi xuống", async () => {
    const kq = await luuLoaiDuocDayAction({ tienTo: ["lead.moi:", "sla:"], reason: "BGĐ duyệt" });
    expect(kq.ok).toBe(true);
    expect(daGhi()).toEqual(["lead.moi:", "sla:"]);
  });

  it("⚠️ khoá KHÔNG có trong danh mục ⇒ TỪ CHỐI, và KHÔNG ghi gì", async () => {
    // Đây là ca mà schema Zod từng gác. Mất nó thì một khoá gõ sai nằm im trong DB: danh sách
    // trông như đã bật mà `startsWith` không khớp gì — không lỗi, không cảnh báo, và cách duy
    // nhất phát hiện là có người báo "tôi không nhận được thông báo".
    const kq = await luuLoaiDuocDayAction({ tienTo: ["khong_ton_tai:"], reason: "x" });
    expect(kq.ok).toBe(false);
    expect(h.setGlobalSetting).not.toHaveBeenCalled();
  });

  it("TỪ CHỐI chứ không lặng lẽ lọc bỏ", async () => {
    // Lọc bỏ thì người dùng bấm Lưu, thấy báo thành công, rồi loại họ vừa chọn biến mất không
    // dấu vết. Một khoá lạ tới được đây nghĩa là giao diện và danh mục đã lệch nhau — thứ phải
    // nổ ra, không phải thứ để dọn dẹp im lặng.
    const kq = await luuLoaiDuocDayAction({ tienTo: ["lead.moi:", "bia_ra:"], reason: "x" });
    expect(kq.ok).toBe(false);
    expect(h.setGlobalSetting).not.toHaveBeenCalled();
  });

  it("⚠️ TỪ CHỐI loại KHÔNG ĐẨY ĐƯỢC, dù nó có thật trong danh mục chuông", async () => {
    // `class_no_teacher:` và `timesheet_adjust:` là thông báo CÓ THẬT — chúng hiện trong chuông
    // hằng ngày. Nhưng chúng do vòng quét việc tồn ghi thẳng `db.staffNotification.upsert`,
    // không đi qua `notifyStaff`, nên KHÔNG BAO GIỜ đẩy được (ranh giới cố ý, xem
    // `lib/notifications/notify.ts`).
    //
    // Lưu chúng vào cấu hình đẩy là để lại một công tắc không nối vào đâu — chủ dự án đã bật
    // thật cả hai ngày 13/09 rồi ngồi chờ. Đường ghi phải kiểm theo danh sách HẸP.
    for (const t of ["class_no_teacher:", "timesheet_adjust:", "renewal:", "student_risk:"]) {
      const kq = await luuLoaiDuocDayAction({ tienTo: ["lead.moi:", t], reason: "x" });
      expect(kq.ok, t).toBe(false);
    }
    expect(h.setGlobalSetting).not.toHaveBeenCalled();
  });

  it("thông báo lỗi NÓI RÕ mã nào sai", async () => {
    const kq = await luuLoaiDuocDayAction({ tienTo: ["bia_ra:"], reason: "x" });
    expect(kq.ok).toBe(false);
    if (!kq.ok) expect(kq.error.message).toContain("bia_ra:");
  });
});

describe("[PUSH-D7-T31] chuẩn hoá trước khi ghi", () => {
  it("bỏ trùng và chuỗi rỗng", async () => {
    // Chuỗi rỗng khớp MỌI khoá (`"x".startsWith("")` luôn đúng) — lọt vào là biến danh sách
    // trắng thành "đẩy tất cả 51 loại".
    await luuLoaiDuocDayAction({ tienTo: ["lead.moi:", "lead.moi:", ""], reason: "x" });
    expect(daGhi()).toEqual(["lead.moi:"]);
  });

  it("thứ tự ỔN ĐỊNH, không chạy theo thứ tự người dùng bấm", async () => {
    // Giá trị này nằm trong `oldValues`/`newValues` của nhật ký kiểm toán. Thứ tự chạy theo
    // thao tác thì hai lần lưu CÙNG một lựa chọn vẫn ra hai JSON khác nhau, và người đọc nhật
    // ký sẽ đi tìm một thay đổi không tồn tại.
    await luuLoaiDuocDayAction({ tienTo: ["sla:", "lead.moi:"], reason: "x" });
    const lan1 = daGhi();
    vi.clearAllMocks();
    h.setGlobalSetting.mockResolvedValue({ ok: true });
    await luuLoaiDuocDayAction({ tienTo: ["lead.moi:", "sla:"], reason: "x" });
    expect(daGhi()).toEqual(lan1);
  });

  it("danh sách RỖNG là lựa chọn hợp lệ — 'tắt hết'", async () => {
    const kq = await luuLoaiDuocDayAction({ tienTo: [], reason: "tạm dừng kênh" });
    expect(kq.ok).toBe(true);
    expect(daGhi()).toEqual([]);
  });
});

describe("[PUSH-D7-T32] cổng quyền nằm ở tầng dưới, không lặp lại ở đây", () => {
  it("chưa đăng nhập ⇒ từ chối trước khi chạm gì", async () => {
    h.auth.mockResolvedValue(null as never);
    const kq = await luuLoaiDuocDayAction({ tienTo: ["lead.moi:"], reason: "x" });
    expect(kq.ok).toBe(false);
    expect(h.setGlobalSetting).not.toHaveBeenCalled();
  });

  it("quyền SUPER_ADMIN do `setGlobalSetting` gác — action chỉ chuyển tiếp lý do", async () => {
    // Lặp lại cổng quyền ở đây là tạo hai nguồn sự thật cho cùng một câu hỏi, và nguồn ở tầng
    // dưới mới là nguồn thật.
    h.setGlobalSetting.mockResolvedValue({
      ok: false,
      error: { code: "FORBIDDEN", message: "Chỉ SUPER_ADMIN được sửa cấu hình toàn hệ thống" },
    } as never);
    const kq = await luuLoaiDuocDayAction({ tienTo: ["lead.moi:"], reason: "x" });
    expect(kq.ok).toBe(false);
    expect(h.setGlobalSetting.mock.calls[0]![1].reason).toBe("x");
  });
});
