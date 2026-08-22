// Khoá luật R5 (21/08): tên dự án của phiếu nhận xét SUY TỪ BUỔI, không nhập tay.
import { describe, it, expect } from "vitest";
import { deriveSessionProjectName } from "./session-project-name";
import { DEFAULT_PROJECT_NAME } from "./session-eval-rubric";

describe("deriveSessionProjectName", () => {
  it("ưu tiên customTitle của lớp hơn tên bài giáo trình", () => {
    expect(
      deriveSessionProjectName({
        sessionNumber: 3,
        planTitle: "Xe dò line nâng cao",
        lessonTitle: "Cảm biến dò line",
      }),
    ).toBe("Dự án 3: Xe dò line nâng cao");
  });

  it("không có customTitle → dùng tên bài giáo trình", () => {
    expect(
      deriveSessionProjectName({ sessionNumber: 5, lessonTitle: "Cảm biến siêu âm" }),
    ).toBe("Dự án 5: Cảm biến siêu âm");
  });

  it("chỉ có topic của buổi → vẫn ra tên có số buổi", () => {
    expect(deriveSessionProjectName({ sessionNumber: 2, topic: "Ôn tập giữa khoá" })).toBe(
      "Dự án 2: Ôn tập giữa khoá",
    );
  });

  it("có số buổi nhưng KHÔNG có tên nào → 'Dự án N'", () => {
    expect(deriveSessionProjectName({ sessionNumber: 9 })).toBe("Dự án 9");
  });

  it("chưa tra được số buổi → lùi về Lesson.order", () => {
    expect(deriveSessionProjectName({ lessonOrder: 4, lessonTitle: "Vòng lặp" })).toBe(
      "Dự án 4: Vòng lặp",
    );
  });

  it("không có số nào → in tên bài trần, không bịa số", () => {
    expect(deriveSessionProjectName({ lessonTitle: "Vòng lặp" })).toBe("Vòng lặp");
  });

  it("không có gì → hằng mặc định (ô Dự án không bao giờ trống)", () => {
    expect(deriveSessionProjectName({})).toBe(DEFAULT_PROJECT_NAME);
  });

  it("tên bài ĐÃ mở đầu bằng 'Dự án' → giữ nguyên, không lồng hai lần", () => {
    expect(
      deriveSessionProjectName({ sessionNumber: 1, lessonTitle: "Dự án 1: Làm quen hệ thống" }),
    ).toBe("Dự án 1: Làm quen hệ thống");
  });

  it("chuỗi rỗng / toàn khoảng trắng không được coi là tên bài", () => {
    expect(deriveSessionProjectName({ sessionNumber: 6, planTitle: "   ", lessonTitle: "" })).toBe(
      "Dự án 6",
    );
  });
});
