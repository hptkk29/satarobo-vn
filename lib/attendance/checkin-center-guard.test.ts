import { describe, expect, it } from "vitest";
import { decideCheckinCenter } from "./checkin-center-guard";

// L0 0.3 (05/09/2026) — gác chấm chéo cơ sở. Bốn nhánh, mỗi nhánh một test; nhánh
// fail-open (không suy được cơ sở) phải có test riêng để ai siết lại thì thấy ngay.
describe("decideCheckinCenter — chấm chéo cơ sở", () => {
  it("nhân sự CS1 quét mã CS2 → chặn, ghi tên cơ sở trong lỗi", () => {
    const d = decideCheckinCenter({ isHoLevel: false, visibleCenterIds: ["cs1"] }, "cs2", "Cơ sở Hoàng Diệu");
    expect(d.ok).toBe(false);
    // Tên DB đã có "Cơ sở" — không được ghép thành "cơ sở Cơ sở Hoàng Diệu" (nghiệm thu 05/09).
    if (!d.ok) expect(d.error).toContain("của Cơ sở Hoàng Diệu.");
  });

  it("nhân sự CS1 quét mã CS1 → cho qua", () => {
    expect(decideCheckinCenter({ isHoLevel: false, visibleCenterIds: ["cs1"] }, "cs1")).toEqual({
      ok: true,
      reason: "VISIBLE",
    });
  });

  it("HO-level chấm mọi cơ sở (Q-04), kể cả cơ sở không nằm trong visibleCenterIds", () => {
    expect(decideCheckinCenter({ isHoLevel: true, visibleCenterIds: [] }, "cs3")).toEqual({
      ok: true,
      reason: "HO_LEVEL",
    });
  });

  it("không suy được cơ sở (visibleCenterIds rỗng, không HO) → KHÔNG chặn — fail-open có chủ đích", () => {
    // Sự cố 07/08: nhân sự thiếu UserOrgRole bị khoá im lặng. Gác này không được tái diễn nó.
    expect(decideCheckinCenter({ isHoLevel: false, visibleCenterIds: [] }, "cs1")).toEqual({
      ok: true,
      reason: "UNKNOWN_SCOPE",
    });
  });

  it("tên cơ sở trống → lỗi vẫn đọc được", () => {
    const d = decideCheckinCenter({ isHoLevel: false, visibleCenterIds: ["cs1"] }, "cs2", "  ");
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error).toContain("cơ sở khác");
  });
});
