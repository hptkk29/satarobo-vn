// 28/08 — lớp trải nghiệm bỏ giờ/sĩ số/giáo viên ở cấp lớp; tên lớp tự sinh.
//
// Ba hàm THUẦN dưới đây là chỗ duy nhất quyết định ba luật mới, nên khoá ở đây thay vì
// rải assert trong action (action cần auth + Postgres, không chạy được ở lane unit).
import { describe, it, expect } from "vitest";
import { isOverCapacity } from "./service";
import { tenLopTrial, trungKhungGio } from "./lop-moi";

describe("[28/08] sĩ số null = KHÔNG giới hạn", () => {
  it("capacity null → không bao giờ vượt, kể cả lớp đã đông", () => {
    // Bẫy dễ mắc: coi null là 0 thì lớp mới tạo chặn ngay học viên đầu tiên, và thông
    // báo lại là "Vượt sĩ số" — người dùng không có cách nào đoán ra nguyên nhân.
    expect(isOverCapacity(0, null, false)).toBe(false);
    expect(isOverCapacity(99, null, false)).toBe(false);
  });

  it("capacity có số → giữ nguyên hành vi cũ", () => {
    expect(isOverCapacity(7, 8, false)).toBe(false);
    expect(isOverCapacity(8, 8, false)).toBe(true);
    expect(isOverCapacity(8, 8, true)).toBe(false); // người có quyền vượt
  });
});

describe("[28/08] tên lớp tự sinh theo quy ước Cơ sở_Lớp trial số", () => {
  it("ghép mã cơ sở với số thứ tự", () => {
    expect(tenLopTrial("CS1", 5)).toBe("CS1_Lớp trial 5");
    expect(tenLopTrial("CS2", 31)).toBe("CS2_Lớp trial 31");
  });

  it("mã cơ sở được chuẩn hoá: bỏ dấu, bỏ ký tự lạ, viết hoa", () => {
    // Mã cơ sở do người nhập, đã gặp cả "cs1", "Cơ sở 1", "CS-1". Tên lớp lọt ký tự lạ
    // sẽ đi thẳng vào phiếu gửi phụ huynh.
    expect(tenLopTrial("cs1", 2)).toBe("CS1_Lớp trial 2");
    expect(tenLopTrial("Cơ sở 1", 2)).toBe("COSO1_Lớp trial 2");
    expect(tenLopTrial("CS-1", 2)).toBe("CS1_Lớp trial 2");
  });

  it("thiếu mã cơ sở vẫn ra tên đọc được, không ra chuỗi cụt", () => {
    expect(tenLopTrial("", 3)).toBe("CS_Lớp trial 3");
  });
});

describe("[28/08] đánh dấu giáo viên bận theo khung giờ", () => {
  const b = (s: string, e: string) => ({ startTime: s, endTime: e });

  it("trùng một phần là BẬN", () => {
    expect(trungKhungGio(b("18:00", "19:30"), b("19:00", "20:00"))).toBe(true);
    expect(trungKhungGio(b("19:00", "20:00"), b("18:00", "19:30"))).toBe(true);
  });

  it("lồng nhau là BẬN", () => {
    expect(trungKhungGio(b("18:00", "20:00"), b("18:30", "19:00"))).toBe(true);
  });

  it("sát nhau KHÔNG tính là bận — dạy 18:00–19:30 rồi 19:30–21:00 là hợp lệ", () => {
    expect(trungKhungGio(b("18:00", "19:30"), b("19:30", "21:00"))).toBe(false);
    expect(trungKhungGio(b("19:30", "21:00"), b("18:00", "19:30"))).toBe(false);
  });

  it("rời hẳn nhau thì rảnh", () => {
    expect(trungKhungGio(b("08:00", "09:30"), b("18:00", "19:30"))).toBe(false);
  });

  it("giờ hỏng (thiếu, sai định dạng) → coi là KHÔNG trùng, không ném", () => {
    // Buổi cũ có thể thiếu giờ. Ném ở đây là cả form thêm buổi chết, trong khi hậu quả
    // đúng của dữ liệu hỏng chỉ là "không đánh dấu được", không phải "không dùng được".
    expect(trungKhungGio(b("", "19:30"), b("18:00", "19:30"))).toBe(false);
    expect(trungKhungGio(b("18:00", "19:30"), b("xx:yy", "19:30"))).toBe(false);
  });
});
