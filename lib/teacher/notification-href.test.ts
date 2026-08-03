// Map sai là đẩy GV thuần sang host admin rồi bị route-policy 307 đá ngược.
import { describe, it, expect } from "vitest";
import { teacherHref } from "./notification-href";

describe("teacherHref — map href admin sang màn site GV", () => {
  it("giữ nguyên query khi đổi path", () => {
    expect(teacherHref("/attendance?sessionId=abc")).toBe("/diem-danh?sessionId=abc");
    expect(teacherHref("/classes/c1?tab=sessions")).toBe("/lop?tab=sessions");
  });

  it("map đủ các nguồn StaffNotification đang tồn tại", () => {
    expect(teacherHref("/attendance")).toBe("/diem-danh");
    expect(teacherHref("/sessions/s1")).toBe("/lich");
    expect(teacherHref("/assignments")).toBe("/cham-bai");
    expect(teacherHref("/report-cards/e1")).toBe("/hoc-ba");
    expect(teacherHref("/don-tu")).toBe("/don-tu");
    expect(teacherHref("/cham-cong/lich-ca")).toBe("/bang-cong");
    expect(teacherHref("/trial-classes/t1")).toBe("/trial");
  });

  it("đường không có màn GV → null (hiện text thuần, KHÔNG đẩy sang host admin)", () => {
    expect(teacherHref("/users")).toBeNull();
    expect(teacherHref("/orders/o1")).toBeNull();
    expect(teacherHref(null)).toBeNull();
  });
});
