// Khoá luật R5 (21/08): tên dự án của phiếu nhận xét SUY TỪ BUỔI, không nhập tay.
// Sửa 25/08: tên dự án gửi PH là TÊN BÀI TRẦN (bỏ tiền tố "Dự án N:"), còn số buổi +
// học phần chuyển hết sang NHÃN BUỔI của bảng (deriveSessionLabel).
import { describe, it, expect } from "vitest";
import { deriveSessionLabel, deriveSessionProjectName } from "./session-project-name";
import { DEFAULT_PROJECT_NAME } from "./session-eval-rubric";

describe("deriveSessionProjectName — tên gửi phụ huynh", () => {
  it("ưu tiên customTitle của lớp hơn tên bài giáo trình", () => {
    expect(
      deriveSessionProjectName({
        sessionNumber: 3,
        planTitle: "Xe dò line nâng cao",
        lessonTitle: "Cảm biến dò line",
      }),
    ).toBe("Xe dò line nâng cao");
  });

  it("không có customTitle → dùng tên bài giáo trình", () => {
    expect(
      deriveSessionProjectName({ sessionNumber: 5, lessonTitle: "Cảm biến siêu âm" }),
    ).toBe("Cảm biến siêu âm");
  });

  it("chỉ có topic của buổi → dùng topic", () => {
    expect(deriveSessionProjectName({ sessionNumber: 2, topic: "Ôn tập giữa khoá" })).toBe(
      "Ôn tập giữa khoá",
    );
  });

  it("KHÔNG còn gắn tiền tố 'Dự án N:' vào tên bài", () => {
    expect(
      deriveSessionProjectName({ sessionNumber: 7, lessonTitle: "Bàn Tay Ma Thuật" }),
    ).toBe("Bàn Tay Ma Thuật");
  });

  it("có số buổi nhưng KHÔNG có tên nào → 'Dự án N'", () => {
    expect(deriveSessionProjectName({ sessionNumber: 9 })).toBe("Dự án 9");
  });

  it("chưa tra được số buổi → lùi về Lesson.order", () => {
    expect(deriveSessionProjectName({ lessonOrder: 4 })).toBe("Dự án 4");
  });

  it("không có gì → hằng mặc định (ô Dự án không bao giờ trống)", () => {
    expect(deriveSessionProjectName({})).toBe(DEFAULT_PROJECT_NAME);
  });

  it("tên bài giáo trình cũ đã mang tiền tố 'Dự án' → giữ nguyên, không lồng hai lần", () => {
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

describe("deriveSessionLabel — nhãn cột 'Buổi học'", () => {
  it("đủ ba mảnh → 'Buổi 1 - HP1 - Bàn Tay Ma Thuật'", () => {
    expect(
      deriveSessionLabel({
        sessionNumber: 1,
        moduleCode: "HP1",
        lessonTitle: "Bàn Tay Ma Thuật",
      }),
    ).toBe("Buổi 1 - HP1 - Bàn Tay Ma Thuật");
  });

  it("khoá không chia học phần → bỏ hẳn mảnh HP, không để dấu '-' cụt", () => {
    expect(
      deriveSessionLabel({
        sessionNumber: 4,
        moduleCode: null,
        lessonTitle: "Dự án xe robot tự hành",
      }),
    ).toBe("Buổi 4 - Dự án xe robot tự hành");
  });

  it("lớp chưa ghim giáo trình → chỉ còn số buổi", () => {
    expect(deriveSessionLabel({ sessionNumber: 12 })).toBe("Buổi 12");
  });

  it("customTitle của lớp thắng tên bài giáo trình, học phần vẫn giữ", () => {
    expect(
      deriveSessionLabel({
        sessionNumber: 2,
        moduleCode: "HP3",
        planTitle: "Buổi bù — Đấu Trường Con Quay",
        lessonTitle: "Đấu Trường Con Quay",
      }),
    ).toBe("Buổi 2 - HP3 - Buổi bù — Đấu Trường Con Quay");
  });

  it("chưa tra được số buổi → lùi về Lesson.order", () => {
    expect(
      deriveSessionLabel({ lessonOrder: 13, moduleCode: "HP2", lessonTitle: "Họa Sĩ Robot" }),
    ).toBe("Buổi 13 - HP2 - Họa Sĩ Robot");
  });

  it("không có gì → chuỗi rỗng để chỗ gọi tự quyết", () => {
    expect(deriveSessionLabel({})).toBe("");
  });

  it("khoảng trắng thừa không sinh mảnh rác", () => {
    expect(
      deriveSessionLabel({ sessionNumber: 5, moduleCode: "  ", lessonTitle: " Vũ Công Robot " }),
    ).toBe("Buổi 5 - Vũ Công Robot");
  });
});

describe("ô trống 'Buổi N' không được coi là tên bài", () => {
  // Lớp tạo TRƯỚC khi có giáo trình thật mang customTitle = "Buổi 7" (bản sao đông cứng
  // của ô trống do nút "Áp dụng số buổi" sinh ra). Nếu nó vẫn thắng, nạp giáo trình xong
  // nhãn in ra "Buổi 7 - HP1 - Buổi 7" và phiếu phụ huynh in "Buổi 7" — xấu hơn lúc chưa nạp.
  it("customTitle rỗng nghĩa → rơi xuống tên bài của giáo trình", () => {
    const src = {
      sessionNumber: 7,
      moduleCode: "HP1",
      planTitle: "Buổi 7",
      lessonTitle: "Bàn Tay Ma Thuật",
    };
    expect(deriveSessionLabel(src)).toBe("Buổi 7 - HP1 - Bàn Tay Ma Thuật");
    expect(deriveSessionProjectName(src)).toBe("Bàn Tay Ma Thuật");
  });

  it("cả plan lẫn lesson đều là ô trống → rơi xuống topic", () => {
    expect(
      deriveSessionLabel({
        sessionNumber: 3,
        planTitle: "Buổi 3",
        lessonTitle: "Buổi 3",
        topic: "Học bù thứ 7",
      }),
    ).toBe("Buổi 3 - Học bù thứ 7");
  });

  it("không còn nguồn nào → chỉ in số buổi, không in 'Buổi 7' hai lần", () => {
    expect(deriveSessionLabel({ sessionNumber: 7, planTitle: "Buổi 7" })).toBe("Buổi 7");
    expect(deriveSessionProjectName({ sessionNumber: 7, planTitle: "Buổi 7" })).toBe("Dự án 7");
  });

  it("chỉ loại đúng dạng 'Buổi <số>' — tên thật có chữ 'Buổi' vẫn giữ", () => {
    expect(
      deriveSessionLabel({ sessionNumber: 2, planTitle: "Buổi 2: Ôn tập giữa kỳ" }),
    ).toBe("Buổi 2 - Buổi 2: Ôn tập giữa kỳ");
    expect(deriveSessionLabel({ sessionNumber: 5, lessonTitle: "Buổi diễn tập" })).toBe(
      "Buổi 5 - Buổi diễn tập",
    );
  });
});
