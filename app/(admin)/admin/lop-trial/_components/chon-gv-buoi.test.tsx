/**
 * `hauToGv` — hậu tố in trong `<option>` của ô chọn giáo viên.
 *
 * ── VÌ SAO TỆP NÀY RA ĐỜI (17/09/2026) ───────────────────────────────────────────────
 * Có HAI đường sinh nhãn chạy song song: `nhanChoDong` (tầng thuần, dùng cho khối cảnh
 * báo) và `hauToGv` (dùng cho `<option>`). Bản vá gỡ "CHƯA VÀO LƯỚI CA" chỉ chạm đường
 * thứ nhất, nên sau khi merge + deploy prod thì ô chọn VẪN in nguyên chữ đó — chủ dự án
 * phải báo lại đúng một lỗi đã báo.
 *
 * Bộ này khoá lại luật: `<option>` bám theo `nhan` của tầng thuần, KHÔNG tự suy từ `phu`.
 */
import { describe, expect, it, vi } from "vitest";
import type { DongGv } from "@/lib/trial/gv-kha-dung";

// `chon-gv-buoi.tsx` là client component và nó import `../_actions` (Server Action) —
// kéo theo cả `next-auth`, thứ không nạp được ngoài Next. Mock đúng khuôn của
// `add-session-form.test.tsx` cạnh bên; bộ này chỉ cần MỘT hàm thuần trong tệp đó.
vi.mock("../_actions", () => ({ layGvChoBuoiAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { hauToGv } from "./chon-gv-buoi";

function dong(over: Partial<DongGv>): DongGv {
  return { id: "u1", name: "GV", phu: "PHU_TRON", muc: "KHONG", nhan: "", ...over };
}

describe("hauToGv — ô chọn nói ĐÚNG thứ tầng thuần đã quyết định", () => {
  it("TRÙNG LỊCH luôn hiện — cảnh báo buổi dạy không bao giờ bị tắt", () => {
    expect(hauToGv(dong({ muc: "DO", nhan: "TRÙNG LỊCH: Lớp X 18:00–19:30" }))).toBe(
      " · TRÙNG LỊCH",
    );
  });

  // ⭐ CA KHOÁ của bản vá. Đây ĐÚNG hình dạng đang chạy trên prod khi cờ lọc TẮT:
  // tầng thuần trả `nhan: ""` (không nói gì về ca), nên ô chọn phải im theo.
  it("CHUA_VAO_LUOI + nhan rỗng ⇒ KHÔNG hậu tố (lỗi prod 17/09)", () => {
    expect(hauToGv(dong({ phu: "CHUA_VAO_LUOI", nhan: "" }))).toBe("");
  });

  it("KHONG_GIO + nhan rỗng (chưa bật lọc) ⇒ KHÔNG hậu tố", () => {
    expect(hauToGv(dong({ phu: "KHONG_GIO", nhan: "" }))).toBe("");
  });

  it("KHONG_GIO + nhan CÓ chữ (đang lọc thật) ⇒ có hậu tố", () => {
    expect(hauToGv(dong({ phu: "KHONG_GIO", nhan: "ca không nhận thêm buổi" }))).toBe(
      " · CA LINH ĐỘNG",
    );
  });

  it("mọi trạng thái còn lại: nhan rỗng ⇒ hậu tố rỗng", () => {
    const moi: DongGv["phu"][] = [
      "PHU_TRON",
      "KHONG_PHU",
      "NGHI",
      "KHONG_CO_CA",
      "CHUA_VAO_LUOI",
      "CHUA_CO_LUOI",
    ];
    expect(moi.map((p) => hauToGv(dong({ phu: p, nhan: "" })))).toEqual(["", "", "", "", "", ""]);
  });
});
