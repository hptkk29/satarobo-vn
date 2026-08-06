import { describe, it, expect } from "vitest";
import {
  ZNS_TUITION_PARAM_SPEC,
  ZNS_ACCOUNT_PARAM_SPEC,
  ZNS_BIRTHDAY_PARAM_SPEC,
  buildTuitionZnsParams,
  buildAccountZnsParams,
  buildBirthdayZnsParams,
  formatZnsDateTime,
  type TuitionZnsInput,
} from "./templates";

// =============================================================================
// Bất biến: params gửi đi PHẢI khớp bảng khai của mẫu đã duyệt.
//
// Vì sao cần lưới này: mọi nơi gọi ZNS đều nuốt lỗi (`.catch(() => {})`) để
// không chặn luồng tiền ⇒ gửi sai tham số thì Zalo trả -1122, tin không tới,
// mà log ứng dụng vẫn sạch và người dùng vẫn thấy "thành công". Không có test
// nào bắt được, chỉ phụ huynh im lặng không nhận tin. Bug PR #77 sống được là
// vì vậy — và trước bản vá này nó đang lặp lại ở 2 chỗ gọi mẫu 616258.
// =============================================================================

const BASE: TuitionZnsInput = {
  at: new Date("2026-07-31T05:00:00.000Z"), // 12:00:00 giờ VN
  phone: "84901234567",
  courseName: "Sata 4",
  totalFee: 5_000_000,
  paidFee: 2_500_000,
  studentName: "Nguyễn Văn A",
};

describe("buildTuitionZnsParams — hợp đồng với mẫu 616258", () => {
  it("trả ĐÚNG bộ khoá mà mẫu khai — không thiếu, không thừa", () => {
    const params = buildTuitionZnsParams(BASE);
    expect(Object.keys(params).sort()).toEqual(Object.keys(ZNS_TUITION_PARAM_SPEC).sort());
  });

  it("mỗi tham số đúng KIỂU mẫu khai (tiền là number, không phải chuỗi có dấu chấm)", () => {
    const params = buildTuitionZnsParams(BASE);
    for (const [key, spec] of Object.entries(ZNS_TUITION_PARAM_SPEC)) {
      expect(typeof params[key], `tham số ${key}`).toBe(spec.type);
    }
    expect(params.total_course_fee).toBe(5_000_000);
    expect(params.paid_fee).toBe(2_500_000);
  });

  it("không tham số nào vượt giới hạn ký tự của mẫu", () => {
    const params = buildTuitionZnsParams({
      ...BASE,
      courseName: "K".repeat(500),
      studentName: "T".repeat(200),
    });
    for (const [key, spec] of Object.entries(ZNS_TUITION_PARAM_SPEC)) {
      expect(String(params[key]).length, `tham số ${key}`).toBeLessThanOrEqual(spec.max);
    }
  });

  it("SĐT hiển thị dạng nội địa 0… (mẫu khai ví dụ 0987654321), nhận vào dạng nào cũng được", () => {
    expect(buildTuitionZnsParams({ ...BASE, phone: "84901234567" }).phone).toBe("0901234567");
    expect(buildTuitionZnsParams({ ...BASE, phone: "0901234567" }).phone).toBe("0901234567");
    expect(buildTuitionZnsParams({ ...BASE, phone: "+84 901 234 567" }).phone).toBe("0901234567");
  });

  it("thiếu tên học viên / tên khoá thì thay bằng chữ đỡ, KHÔNG gửi chuỗi rỗng", () => {
    const params = buildTuitionZnsParams({ ...BASE, courseName: null, studentName: "  " });
    expect(params.course).toBe("Khoá học");
    expect(params.studentName).toBe("Quý phụ huynh");
  });

  it("số tiền âm / NaN bị kéo về 0 thay vì đẩy rác sang Zalo", () => {
    const params = buildTuitionZnsParams({ ...BASE, totalFee: Number.NaN, paidFee: -1 });
    expect(params.total_course_fee).toBe(0);
    expect(params.paid_fee).toBe(0);
  });
});

describe("buildAccountZnsParams — hợp đồng với mẫu 616899", () => {
  it("trả ĐÚNG bộ khoá mà mẫu khai — không thiếu, không thừa (login_url là nội dung tĩnh)", () => {
    const params = buildAccountZnsParams({ customerName: "Nguyễn Văn A", phone: "84901234567" });
    expect(Object.keys(params).sort()).toEqual(Object.keys(ZNS_ACCOUNT_PARAM_SPEC).sort());
  });

  it("không tham số nào vượt giới hạn ký tự của mẫu", () => {
    const params = buildAccountZnsParams({ customerName: "T".repeat(200), phone: "84901234567" });
    for (const [key, spec] of Object.entries(ZNS_ACCOUNT_PARAM_SPEC)) {
      expect(String(params[key]).length, `tham số ${key}`).toBeLessThanOrEqual(spec.max);
    }
  });

  it("login_id là SĐT dạng nội địa 0…, nhận vào dạng nào cũng được", () => {
    expect(buildAccountZnsParams({ customerName: "A", phone: "84901234567" }).login_id).toBe("0901234567");
    expect(buildAccountZnsParams({ customerName: "A", phone: "0901234567" }).login_id).toBe("0901234567");
  });

  it("thiếu tên thì thay bằng chữ đỡ, KHÔNG gửi chuỗi rỗng", () => {
    expect(buildAccountZnsParams({ customerName: "  ", phone: "84901234567" }).name).toBe("Quý phụ huynh");
    expect(buildAccountZnsParams({ customerName: null, phone: "84901234567" }).name).toBe("Quý phụ huynh");
  });
});

describe("buildBirthdayZnsParams — hợp đồng với mẫu chúc mừng sinh nhật", () => {
  const BIRTHDAY = { studentName: "Nguyễn Văn A", dateText: "20/08/2026" };

  it("trả ĐÚNG bộ khoá mà mẫu khai — không thiếu, không thừa", () => {
    expect(Object.keys(buildBirthdayZnsParams(BIRTHDAY)).sort()).toEqual(
      Object.keys(ZNS_BIRTHDAY_PARAM_SPEC).sort(),
    );
  });

  it("mỗi tham số đúng KIỂU mẫu khai", () => {
    const params = buildBirthdayZnsParams(BIRTHDAY);
    for (const [key, spec] of Object.entries(ZNS_BIRTHDAY_PARAM_SPEC)) {
      expect(typeof params[key], `tham số ${key}`).toBe(spec.type);
    }
  });

  it("không tham số nào vượt giới hạn ký tự của mẫu", () => {
    const params = buildBirthdayZnsParams({ studentName: "T".repeat(200), dateText: "20/08/2026" });
    for (const [key, spec] of Object.entries(ZNS_BIRTHDAY_PARAM_SPEC)) {
      expect(String(params[key]).length, `tham số ${key}`).toBeLessThanOrEqual(spec.max);
    }
  });

  it("thiếu tên học viên thì thay bằng chữ đỡ, KHÔNG gửi chuỗi rỗng", () => {
    expect(buildBirthdayZnsParams({ ...BIRTHDAY, studentName: "  " }).studentName).toBe("Bé yêu");
    expect(buildBirthdayZnsParams({ ...BIRTHDAY, studentName: null }).studentName).toBe("Bé yêu");
  });
});

describe("formatZnsDateTime", () => {
  it("đúng định dạng HH:mm:ss dd/MM/yyyy", () => {
    expect(formatZnsDateTime(BASE.at)).toMatch(/^\d{2}:\d{2}:\d{2} \d{2}\/\d{2}\/\d{4}$/);
  });

  it("lấy GIỜ VIỆT NAM, không lấy giờ máy chủ (Vercel chạy hnd1 = UTC+9)", () => {
    // 2026-07-31T05:00:00Z = 12:00 VN (UTC+7). Lấy giờ hnd1 sẽ ra 14:00 → sai.
    expect(formatZnsDateTime(BASE.at)).toBe("12:00:00 31/07/2026");
  });

  it("nửa đêm ra 00:xx chứ không phải 24:xx", () => {
    // 2026-07-30T17:00:00Z = 00:00 ngày 31/07 giờ VN.
    expect(formatZnsDateTime(new Date("2026-07-30T17:00:00.000Z"))).toBe("00:00:00 31/07/2026");
  });
});
