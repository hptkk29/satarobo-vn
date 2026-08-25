// Bản thiết kế giáo trình Sata phải khớp đúng data marketing — vì đây là nguồn tên dự
// án gửi cho phụ huynh. Test này chốt các con số + vài tên bài mốc, để lần sau ai sửa
// roadmap mà lệch cấu trúc thì đỏ ngay chứ không âm thầm ra phiếu sai.
import { describe, it, expect } from "vitest";
import { buildSataCurricula, courseSlugFor } from "./curriculum-sata";

const bySlug = new Map(buildSataCurricula().map((c) => [c.courseSlug, c]));

describe("buildSataCurricula", () => {
  it("đủ 9 giáo trình: Sata1–Sata8 + Combo", () => {
    expect([...bySlug.keys()].sort()).toEqual(
      [
        "combo-luyen-thi",
        "sata1",
        "sata2",
        "sata3",
        "sata4",
        "sata5",
        "sata6",
        "sata7",
        "sata8",
      ].sort(),
    );
  });

  it("slug khớp quy tắc của prisma/seed-courses.ts", () => {
    expect(courseSlugFor("Sata3")).toBe("sata3");
    expect(courseSlugFor("Combo")).toBe("combo-luyen-thi");
  });

  it.each([
    ["sata3", 48],
    ["sata4", 48],
    ["sata5", 48],
    ["sata6", 48],
    ["sata7", 48],
    ["sata1", 16],
    ["sata2", 16],
    ["sata8", 5],
    ["combo-luyen-thi", 32],
  ])("%s có đúng %i buổi", (slug, n) => {
    expect(bySlug.get(slug)?.lessons).toHaveLength(n);
  });

  it("order đánh liên tục 1..N xuyên học phần, không trùng không hụt", () => {
    for (const [slug, cur] of bySlug) {
      const orders = cur.lessons.map((l) => l.order);
      expect(orders, slug).toEqual(orders.map((_, i) => i + 1));
    }
  });

  it("khoá 48 buổi chia đúng 4 học phần × 12 buổi", () => {
    for (const slug of ["sata3", "sata4", "sata5", "sata6", "sata7"]) {
      const cur = bySlug.get(slug)!;
      const counts = new Map<string, number>();
      for (const l of cur.lessons) {
        expect(l.moduleCode, `${slug} buổi ${l.order} phải có học phần`).toBeTruthy();
        counts.set(l.moduleCode!, (counts.get(l.moduleCode!) ?? 0) + 1);
      }
      expect([...counts.keys()].sort(), slug).toEqual(["HP1", "HP2", "HP3", "HP4"]);
      expect([...counts.values()], slug).toEqual([12, 12, 12, 12]);
    }
  });

  it("khoá luyện thi Sata1/2/8 KHÔNG chia học phần", () => {
    for (const slug of ["sata1", "sata2", "sata8"]) {
      const cur = bySlug.get(slug)!;
      expect(cur.lessons.every((l) => l.moduleCode === null), slug).toBe(true);
    }
  });

  it("Combo = Sata1 (HP1) + Sata2 (HP2), 16+16", () => {
    const combo = bySlug.get("combo-luyen-thi")!;
    expect(combo.lessons.filter((l) => l.moduleCode === "HP1")).toHaveLength(16);
    expect(combo.lessons.filter((l) => l.moduleCode === "HP2")).toHaveLength(16);
    expect(combo.lessons[16]!.order).toBe(17);
    expect(combo.lessons[16]!.moduleCode).toBe("HP2");
  });

  it("tên bài mốc đúng nguyên văn giáo trình (đây là chuỗi gửi phụ huynh)", () => {
    const sata3 = bySlug.get("sata3")!;
    expect(sata3.lessons[0]).toMatchObject({
      order: 1,
      title: "Bàn Tay Ma Thuật",
      moduleCode: "HP1",
      moduleName: "Học phần 1",
    });
    // buổi 13 = bài đầu của học phần 2
    expect(sata3.lessons[12]).toMatchObject({
      order: 13,
      title: "Chiến Binh Cua Biển",
      moduleCode: "HP2",
    });
    // buổi 48 = bài cuối khoá
    expect(sata3.lessons[47]).toMatchObject({ order: 48, moduleCode: "HP4" });
  });

  it("không bài nào để tên trống — phiếu phụ huynh không được in chuỗi rỗng", () => {
    for (const [slug, cur] of bySlug) {
      for (const l of cur.lessons) {
        expect(l.title.trim(), `${slug} buổi ${l.order}`).not.toBe("");
      }
    }
  });
});
