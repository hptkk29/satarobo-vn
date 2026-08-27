// GĐ2 — [LT-U-02] / [LT-U-03] / [LT-S-09 phần thuần].
//
// Bộ này khoá đúng ba thứ dễ vỡ nhất của màn mới:
//  1. Chế độ lọc mặc định phải ẩn đúng những gì màn cũ ẩn — bớt một điều kiện là
//     người dùng thấy lead lẽ ra đã đóng, thừa một điều kiện là "sao mất lead".
//  2. Bấm chip lọc rồi gõ tìm phải cộng dồn chứ không ghi đè nhau.
//  3. Ngày buổi học ghi vào cột `@db.Date` phải là UTC-midnight BẤT KỂ múi giờ tiến
//     trình. Đây là bug "chạy máy tôi thì được" đã có tiền lệ trong repo.
import { describe, it, expect } from "vitest";
import {
  buildClassListWhere,
  buildBookingListWhere,
  ngayVnSangUtc,
} from "./filters";

describe("[LT-U-02] where danh sách lớp trải nghiệm", () => {
  it("không chọn gì → ẩn lớp đã xong và đã huỷ", () => {
    expect(buildClassListWhere(undefined, undefined)).toEqual({
      status: { notIn: ["COMPLETED", "CANCELLED"] },
    });
  });

  it("'all' → không lọc trạng thái", () => {
    expect(buildClassListWhere("all", undefined)).toEqual({});
  });

  it("chọn một trạng thái cụ thể → lọc đúng trạng thái đó", () => {
    expect(buildClassListWhere("OPEN", undefined)).toEqual({ status: "OPEN" });
    expect(buildClassListWhere("CANCELLED", undefined)).toEqual({ status: "CANCELLED" });
  });

  it("trạng thái rác → rơi về chế độ mặc định, không ném lỗi", () => {
    // URL do người dùng gõ tay được, không tin được.
    expect(buildClassListWhere("KHONG_CO_THAT", undefined)).toEqual({
      status: { notIn: ["COMPLETED", "CANCELLED"] },
    });
  });

  it("ô tìm cộng dồn với chip lọc, không ghi đè", () => {
    const w = buildClassListWhere("OPEN", " robo ");
    expect(w.status).toBe("OPEN");
    expect(w.OR).toEqual([
      { name: { contains: "robo", mode: "insensitive" } },
      { code: { contains: "robo", mode: "insensitive" } },
    ]);
  });

  it("ô tìm toàn khoảng trắng coi như bỏ trống", () => {
    expect(buildClassListWhere("all", "   ")).toEqual({});
  });
});

describe("[LT-U-03] where lịch hẹn học thử giữ đúng luật ẩn của màn cũ", () => {
  it("mặc định: ẩn buổi đã chốt/từ chối VÀ ẩn lead đã rời phễu", () => {
    const w = buildBookingListWhere(undefined, {});
    expect(w.status).toEqual({ notIn: ["ENROLLED", "REJECTED"] });
    expect(w.lead).toEqual({
      deletedAt: null,
      status: { notIn: ["DA_DANG_KY", "DA_MAT"] },
    });
  });

  it("'all': chỉ còn ràng buộc lead chưa xoá mềm", () => {
    const w = buildBookingListWhere("all", {});
    expect(w.status).toBeUndefined();
    expect(w.lead).toEqual({ deletedAt: null });
  });

  it("lead xoá mềm LUÔN bị ẩn ở mọi chế độ", () => {
    // Xoá lead là soft-delete nên cascade không chạy, buổi cũ vẫn nằm lại trong bảng.
    for (const s of [undefined, "all", "SCHEDULED", "ATTENDED"]) {
      const w = buildBookingListWhere(s, {});
      expect((w.lead as { deletedAt: null }).deletedAt).toBeNull();
    }
  });

  it("chọn một trạng thái cụ thể thì KHÔNG ẩn lead rời phễu nữa", () => {
    // Cố ý: người dùng chủ động lọc "Đã chốt" thì phải thấy được lead đã ghi danh.
    const w = buildBookingListWhere("ENROLLED", {});
    expect(w.status).toBe("ENROLLED");
    expect(w.lead).toEqual({ deletedAt: null });
  });

  it("giáo viên thuần bị ép chỉ thấy buổi của mình", () => {
    expect(buildBookingListWhere(undefined, { ownTeacherId: "gv-1" }).teacherId).toBe("gv-1");
  });

  it("người kiêm nhiệm không bị ép own-rows", () => {
    expect(buildBookingListWhere(undefined, { ownTeacherId: null }).teacherId).toBeUndefined();
  });

  // S-1 (26/08/2026) — nhánh SĐT nay phải xin phép: `canSearchPhone` là kết quả
  // của `canViewLeadPii()`. Ca này giữ nguyên câu hỏi cũ ("tìm không được làm mất
  // bộ lọc rời-phễu") nhưng chạy ở nhánh CÓ quyền; nhánh KHÔNG quyền nằm ở
  // `lib/lead/lead-pii-callsites.test.ts`.
  it("ô tìm phủ 3 nhánh mà KHÔNG làm mất điều kiện lead của chế độ mặc định", () => {
    const w = buildBookingListWhere(undefined, { q: "Hương", canSearchPhone: true });
    const lead = w.lead as {
      deletedAt: null;
      status?: unknown;
      OR?: unknown[];
    };
    // Đây là chỗ dễ sai nhất: gán đè `where.lead` là mất luôn bộ lọc rời-phễu.
    expect(lead.deletedAt).toBeNull();
    expect(lead.status).toEqual({ notIn: ["DA_DANG_KY", "DA_MAT"] });
    expect(lead.OR).toHaveLength(3);
  });
});

describe("ngày buổi học ghi vào cột @db.Date", () => {
  it("trả đúng UTC-midnight của ngày VN", () => {
    expect(ngayVnSangUtc("2026-09-05")?.toISOString()).toBe("2026-09-05T00:00:00.000Z");
  });

  it("bất biến với múi giờ của tiến trình", () => {
    // Vercel chạy UTC, máy dev +07. `new Date("2026-09-05")` lệch một ngày giữa hai
    // nơi; hàm này phải cho cùng kết quả ở cả hai.
    const goc = process.env.TZ;
    try {
      for (const tz of ["UTC", "Asia/Ho_Chi_Minh", "America/Los_Angeles"]) {
        process.env.TZ = tz;
        expect(ngayVnSangUtc("2026-09-05")?.toISOString()).toBe("2026-09-05T00:00:00.000Z");
      }
    } finally {
      process.env.TZ = goc;
    }
  });

  it("sai định dạng → null, không ném lỗi", () => {
    expect(ngayVnSangUtc("05/09/2026")).toBeNull();
    expect(ngayVnSangUtc("")).toBeNull();
    expect(ngayVnSangUtc("2026-9-5")).toBeNull();
  });
});
