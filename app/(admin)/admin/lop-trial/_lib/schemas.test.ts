// GĐ2 — [LT-U-04] / [LT-U-05].
//
// Điểm chịu lực: màn cũ dựng chuỗi giờ bằng `date.getFullYear()`… của MÁY NGƯỜI DÙNG,
// nên máy đặt múi giờ khác +07 hiện sai giờ rồi lưu đè sai luôn. Màn mới đổi hợp đồng
// sang chuỗi đồng hồ VN và để server quy đổi. Bộ test này khoá cả hai chiều.
import { describe, it, expect } from "vitest";
import {
  toVnInput,
  parseVnInput,
  createClassSchema,
  addSessionSchema,
  updateBookingSchema,
  configSchema,
  attendanceSchema,
} from "./schemas";

describe("[LT-U-04] chuỗi giờ VN đi và về", () => {
  it("đổi một mốc UTC sang đồng hồ VN đúng +7", () => {
    // 2026-06-20T10:30Z = 17:30 cùng ngày ở VN.
    expect(toVnInput(new Date("2026-06-20T10:30:00.000Z"))).toBe("2026-06-20T17:30");
  });

  it("qua nửa đêm VN vẫn đúng NGÀY", () => {
    // 2026-06-20T18:00Z = 01:00 NGÀY HÔM SAU ở VN. Đây là ca màn cũ hay sai.
    expect(toVnInput(new Date("2026-06-20T18:00:00.000Z"))).toBe("2026-06-21T01:00");
  });

  it("parse ngược lại ra đúng mốc ban đầu", () => {
    expect(parseVnInput("2026-06-20T17:30")?.toISOString()).toBe("2026-06-20T10:30:00.000Z");
  });

  it("đi rồi về là bất biến, KỂ CẢ khi đổi múi giờ tiến trình", () => {
    const goc = process.env.TZ;
    const moc = new Date("2026-12-31T17:05:00.000Z");
    try {
      for (const tz of ["UTC", "Asia/Ho_Chi_Minh", "America/Los_Angeles"]) {
        process.env.TZ = tz;
        const s = toVnInput(moc);
        expect(s).toBe("2027-01-01T00:05");
        expect(parseVnInput(s)?.getTime()).toBe(moc.getTime());
      }
    } finally {
      process.env.TZ = goc;
    }
  });

  it("chuỗi sai định dạng → null", () => {
    expect(parseVnInput("2026-06-20 17:30")).toBeNull();
    expect(parseVnInput("20/06/2026T17:30")).toBeNull();
    expect(parseVnInput("")).toBeNull();
  });
});

describe("[LT-U-05] zod tạo lớp", () => {
  const hopLe = {
    name: "Trial tối T3",
    centerId: "cs1",
    sessionCount: 8,
    startTime: "18:00",
    endTime: "19:30",
    capacity: 8,
  };

  it("dữ liệu hợp lệ thì qua", () => {
    expect(createClassSchema.safeParse(hopLe).success).toBe(true);
  });

  it("sĩ số 0 bị chặn — lớp không sĩ số là lớp không xếp được ai", () => {
    expect(createClassSchema.safeParse({ ...hopLe, capacity: 0 }).success).toBe(false);
  });

  it("sĩ số 101 bị chặn", () => {
    expect(createClassSchema.safeParse({ ...hopLe, capacity: 101 }).success).toBe(false);
  });

  it("giờ kết thúc không sau giờ bắt đầu thì báo đúng thông điệp", () => {
    const r = createClassSchema.safeParse({ ...hopLe, endTime: "18:00" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("Giờ kết thúc phải sau giờ bắt đầu");
    }
  });

  it("số buổi 21 bị chặn (trần của lớp là 20)", () => {
    expect(createClassSchema.safeParse({ ...hopLe, sessionCount: 21 }).success).toBe(false);
  });

  it("tên 161 ký tự bị chặn", () => {
    expect(createClassSchema.safeParse({ ...hopLe, name: "x".repeat(161) }).success).toBe(false);
  });

  it("giờ sai định dạng bị chặn", () => {
    expect(createClassSchema.safeParse({ ...hopLe, startTime: "25:00" }).success).toBe(false);
    expect(createClassSchema.safeParse({ ...hopLe, startTime: "8:00" }).success).toBe(false);
  });
});

describe("zod thêm buổi", () => {
  const hopLe = {
    trialClassId: "lop1",
    date: "2026-09-05",
    startTime: "18:00",
    endTime: "19:30",
  };

  it("hợp lệ thì qua", () => {
    expect(addSessionSchema.safeParse(hopLe).success).toBe(true);
  });

  it("bỏ trống giáo viên vẫn hợp lệ — nghĩa là kế thừa GV của lớp", () => {
    expect(addSessionSchema.safeParse({ ...hopLe, teacherId: undefined }).success).toBe(true);
    expect(addSessionSchema.safeParse({ ...hopLe, teacherId: null }).success).toBe(true);
  });

  it("ngày sai định dạng bị chặn", () => {
    expect(addSessionSchema.safeParse({ ...hopLe, date: "05/09/2026" }).success).toBe(false);
  });
});

describe("zod cập nhật buổi hẹn", () => {
  const hopLe = {
    scheduledAtVn: "2026-09-05T18:00",
    status: "SCHEDULED" as const,
    teacherId: null,
    roomId: null,
    classId: null,
    notes: null,
  };

  it("hợp lệ thì qua", () => {
    expect(updateBookingSchema.safeParse(hopLe).success).toBe(true);
  });

  it("chuỗi rỗng ở ô chọn được quy về null, không lưu chuỗi rỗng xuống DB", () => {
    const r = updateBookingSchema.safeParse({ ...hopLe, teacherId: "", roomId: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.teacherId).toBeNull();
      expect(r.data.roomId).toBeNull();
    }
  });

  it("nhận chuỗi ISO là SAI định dạng — hợp đồng mới dùng đồng hồ VN", () => {
    expect(
      updateBookingSchema.safeParse({ ...hopLe, scheduledAtVn: "2026-09-05T18:00:00.000Z" })
        .success,
    ).toBe(false);
  });

  it("trạng thái ngoài 7 giá trị bị chặn", () => {
    expect(updateBookingSchema.safeParse({ ...hopLe, status: "LINH_TINH" }).success).toBe(false);
  });
});

describe("zod cấu hình và điểm danh", () => {
  it("cấu hình: số buổi phải nguyên trong 1..60", () => {
    expect(configSchema.safeParse({ name: "Chuẩn", sessionCount: 4 }).success).toBe(true);
    expect(configSchema.safeParse({ name: "Chuẩn", sessionCount: 0 }).success).toBe(false);
    expect(configSchema.safeParse({ name: "Chuẩn", sessionCount: 61 }).success).toBe(false);
    expect(configSchema.safeParse({ name: "", sessionCount: 4 }).success).toBe(false);
  });

  it("điểm danh: danh sách rỗng bị chặn", () => {
    const r = attendanceSchema.safeParse({ trialSessionId: "b1", records: [] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("Chưa có học viên để điểm danh");
  });

  it("điểm danh: chỉ nhận PRESENT/ABSENT", () => {
    expect(
      attendanceSchema.safeParse({
        trialSessionId: "b1",
        records: [{ trialEnrollmentId: "e1", status: "LATE" }],
      }).success,
    ).toBe(false);
  });
});
