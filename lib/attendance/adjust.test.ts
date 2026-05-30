import { describe, it, expect } from "vitest";
import { canAdjustTimesheet, daysSinceWork, combineVNDateTime } from "./adjust";

describe("canAdjustTimesheet", () => {
  const now = new Date(2026, 5, 10); // 10/06/2026

  it("SUPER_ADMIN chỉnh mọi lúc", () => {
    const old = new Date(2026, 0, 1);
    expect(canAdjustTimesheet({ isSuperAdmin: true, isCenterManager: false, workDate: old, now })).toEqual({ ok: true });
  });

  it("CENTER_MANAGER trong 2 ngày → ok", () => {
    expect(canAdjustTimesheet({ isSuperAdmin: false, isCenterManager: true, workDate: new Date(2026, 5, 8), now }).ok).toBe(true);
    expect(canAdjustTimesheet({ isSuperAdmin: false, isCenterManager: true, workDate: new Date(2026, 5, 10), now }).ok).toBe(true);
  });

  it("CENTER_MANAGER quá 2 ngày → khoá", () => {
    const r = canAdjustTimesheet({ isSuperAdmin: false, isCenterManager: true, workDate: new Date(2026, 5, 7), now });
    expect(r.ok).toBe(false);
  });

  it("không phải quản lý → từ chối", () => {
    expect(canAdjustTimesheet({ isSuperAdmin: false, isCenterManager: false, workDate: now, now }).ok).toBe(false);
  });

  it("daysSinceWork đếm theo ngày", () => {
    expect(daysSinceWork(new Date(2026, 5, 8), new Date(2026, 5, 10))).toBe(2);
  });
});

describe("combineVNDateTime", () => {
  it("ghép ngày + giờ GMT+7", () => {
    const d = combineVNDateTime("2026-06-15", "08:30");
    // 08:30 +07:00 = 01:30 UTC
    expect(d?.toISOString()).toBe("2026-06-15T01:30:00.000Z");
  });
  it("rỗng/sai → null", () => {
    expect(combineVNDateTime("2026-06-15", null)).toBeNull();
    expect(combineVNDateTime("2026-06-15", "xx")).toBeNull();
  });
});
