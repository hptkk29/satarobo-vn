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
  attendanceSchema,
  gvChoBuoiSchema,
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
  // 28/08 — form tạo lớp RÚT còn CƠ SỞ + KHOÁ. Bộ cũ khoá sĩ số / giờ / số buổi / tên;
  // bốn thứ đó nay không còn đi qua đây nữa:
  //   · tên  → server tự sinh (`tenLopTrial`), client gửi lên cũng bị bỏ qua;
  //   · giờ  → thuộc tính của TỪNG BUỔI (`addSessionSchema` vẫn khoá, xem describe dưới);
  //   · sĩ số → bỏ hẳn, `capacity = null` nghĩa là không giới hạn;
  //   · số buổi → nay là số buổi ĐÃ THÊM, không phải con số khai trước.
  const hopLe = { centerId: "cs1" };

  it("chỉ cần cơ sở là qua", () => {
    expect(createClassSchema.safeParse(hopLe).success).toBe(true);
  });

  it("khoá trải nghiệm là tuỳ chọn", () => {
    expect(createClassSchema.safeParse({ ...hopLe, courseId: "kh1" }).success).toBe(true);
    expect(createClassSchema.safeParse({ ...hopLe, courseId: null }).success).toBe(true);
  });

  it("thiếu hẳn trường cơ sở thì bị chặn", () => {
    expect(createClassSchema.safeParse({}).success).toBe(false);
  });

  it("cơ sở là chuỗi rỗng bị chặn, kèm thông điệp người đọc hiểu", () => {
    // Lớp không cơ sở là lớp KHÔNG AI THẤY: `scopedDb` lọc theo `centerId`, nên nó tàng
    // hình với mọi tài khoản cấp cơ sở mà chẳng có thông báo nào.
    const r = createClassSchema.safeParse({ centerId: "   " });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("Chọn cơ sở");
  });

  it("trường cũ gửi kèm KHÔNG làm hỏng: zod bỏ qua khoá lạ", () => {
    // Bản client cũ còn nằm trong tab đang mở của ai đó vẫn POST đủ 6 trường. Chặn ở
    // đây là họ nhận lỗi khó hiểu; bỏ qua là lớp vẫn tạo đúng theo luật mới.
    const r = createClassSchema.safeParse({
      ...hopLe,
      name: "Tên gõ tay",
      capacity: 8,
      startTime: "18:00",
      endTime: "19:30",
      sessionCount: 8,
    });
    expect(r.success).toBe(true);
    if (r.success) expect("name" in r.data).toBe(false);
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

// 28/08/2026 — bỏ ca kiểm `configSchema`: khối "Cấu hình số buổi (mặc định)" đã gỡ khỏi
// màn Lớp Trial, schema theo đó cũng gỡ. Trần số buổi nay nằm ở tham số vận hành
// `crm.trialMaxSessions`, không phải ở một bản ghi cấu hình.
describe("zod điểm danh", () => {
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

// 17/09/2026 — cổng HÌNH DẠNG của đường ĐỌC `layGvChoBuoiAction`.
//
// Vì sao một đường đọc cũng đáng một khối test: bốn action GHI trong cùng tệp đều
// `safeParse`, riêng đường này lúc đầu chỉ có chữ ký TypeScript. Kiểu của Server Action
// là lời hứa với `tsc`, không phải cổng — trình duyệt POST thẳng payload bất kỳ vào
// được, và payload bẩn ở đây KHÔNG rơi vào nhánh `{ ok: false }`: `ngayVnSangUtc` gọi
// `.trim()` nên `date: 123` làm action NÉM. Action ném thì client nhận promise bị từ
// chối, ô chọn giáo viên đứng im với danh sách cũ, không một dòng chữ nào hiện ra.
describe("zod lọc giáo viên theo khung giờ (17/09)", () => {
  const hopLe = {
    trialClassId: "lop-1",
    date: "2026-09-19",
    startTime: "18:00",
    endTime: "19:30",
  };

  it("khung giờ hợp lệ đi qua, `excludeSessionId` bỏ trống được", () => {
    const r = gvChoBuoiSchema.safeParse(hopLe);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.excludeSessionId).toBeUndefined();
  });

  it("`excludeSessionId: null` (cửa THÊM buổi) đi qua", () => {
    expect(gvChoBuoiSchema.safeParse({ ...hopLe, excludeSessionId: null }).success).toBe(true);
  });

  it("ngày KHÔNG phải chuỗi bị chặn — đây là payload làm action NÉM", () => {
    // Ca chịu lực. `123` không có `.trim`, nên thiếu cổng này là TypeError chứ không
    // phải một `error` gọn gàng trả về client.
    const r = gvChoBuoiSchema.safeParse({ ...hopLe, date: 123 });
    expect(r.success).toBe(false);
  });

  it("ngày sai định dạng bị chặn kèm câu người đọc được", () => {
    const r = gvChoBuoiSchema.safeParse({ ...hopLe, date: "19/09/2026" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("Ngày buổi học không hợp lệ");
  });

  it("giờ sai định dạng bị chặn", () => {
    expect(gvChoBuoiSchema.safeParse({ ...hopLe, startTime: "25:00" }).success).toBe(false);
    expect(gvChoBuoiSchema.safeParse({ ...hopLe, endTime: "7h30" }).success).toBe(false);
  });

  it("thiếu lớp bị chặn — không cho hỏi danh sách giáo viên mà không nói lớp nào", () => {
    expect(gvChoBuoiSchema.safeParse({ ...hopLe, trialClassId: "  " }).success).toBe(false);
  });

  it("giờ kết thúc KHÔNG sau giờ bắt đầu bị chặn, cùng luật với hai schema ghi", () => {
    // Thiếu vế này thì khung ngược đời lọt tới `caPhuTronKhungGio`, ra KHONG_PHU cho TẤT
    // CẢ, và màn hình đổ lỗi cho lưới ca ("không ai có ca phủ trọn 19:30–18:00") trong
    // khi lỗi nằm ở hai ô giờ người dùng vừa gõ.
    const r = gvChoBuoiSchema.safeParse({ ...hopLe, startTime: "19:30", endTime: "18:00" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("Giờ kết thúc phải sau giờ bắt đầu");
    expect(gvChoBuoiSchema.safeParse({ ...hopLe, startTime: "18:00", endTime: "18:00" }).success)
      .toBe(false);
  });
});
