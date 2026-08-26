import { describe, it, expect } from "vitest";
import { maskPersonName, maskFreeText, maskLeadPiiFields, MASKED_TEXT, redactContactsInText } from "./pii";

describe("#11 T2 — mask PII lead", () => {
  it("maskPersonName: giữ họ + viết tắt phần còn lại", () => {
    expect(maskPersonName("Nguyễn Thị Lan")).toBe("Nguyễn T. L.");
    expect(maskPersonName("Lan")).toBe("L•••");
    expect(maskPersonName(null)).toBe("");
  });

  it("maskFreeText: ẩn hẳn nội dung tự do, giữ null/rỗng", () => {
    expect(maskFreeText("PH than phiền học phí")).toBe(MASKED_TEXT);
    expect(maskFreeText(null)).toBeNull();
    expect(maskFreeText("")).toBe("");
  });

  it("maskLeadPiiFields: canViewPii=true → nguyên vẹn; false → mask đủ 5 field", () => {
    const lead = {
      id: "l1",
      parentName: "Nguyễn Thị Lan",
      phone: "0909123456",
      email: "lan.nguyen@gmail.com",
      childName: "Bé Bin",
      note: "Đã tư vấn gói combo",
      status: "NEW",
    };
    expect(maskLeadPiiFields(lead, true)).toEqual(lead);

    const masked = maskLeadPiiFields(lead, false);
    expect(masked.parentName).toBe("Nguyễn T. L.");
    expect(masked.phone).toBe("090xxxx456");
    expect(masked.email).toBe("la********@gmail.com");
    expect(masked.childName).toBe("Bé B.");
    expect(masked.note).toBe(MASKED_TEXT);
    // Field không PII giữ nguyên.
    expect(masked.id).toBe("l1");
    expect(masked.status).toBe("NEW");
  });

  it("field vắng mặt/null không bị chế tác", () => {
    const masked = maskLeadPiiFields({ phone: "0909123456", email: null }, false);
    expect(masked.email).toBeNull();
    expect(masked.phone).toBe("090xxxx456");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// G-01 (26/08/2026) — NGÀY SINH PHỤ HUYNH đi qua đúng tầng che này
// ═════════════════════════════════════════════════════════════════════════════
//
// Ngày sinh là mẩu định danh trực tiếp một người thật, ngang tên và SĐT. Cột mới
// mà không khai vào đây thì `leads:view-pii` chỉ còn che được một nửa hồ sơ, và
// nửa còn lại rò ra qua RSC payload — đúng lỗ mà #11 T2 dựng tầng này để bịt.
//
// Che bằng cách GIẤU HẲN (null), không "mờ hoá" thành 01/01/1985: một ngày sinh
// giả trông y hệt ngày sinh thật, và người đọc không có cách nào biết mình đang
// nhìn dữ liệu bịa. Cùng luật với `LeadChild.dob` (leads/[id]/page.tsx đã truyền
// null cho non-holder từ trước).
describe("[G-01] maskLeadPiiFields — ngày sinh phụ huynh", () => {
  const NGAY = new Date("1985-03-12T00:00:00.000Z");

  it("có quyền PII → giữ nguyên ngày sinh", () => {
    const lead = { parentName: "Nguyễn Thị Lan", parentDob: NGAY };
    expect(maskLeadPiiFields(lead, true).parentDob).toBe(NGAY);
  });

  it("KHÔNG có quyền PII → giấu hẳn (null), không lộ năm sinh", () => {
    const masked = maskLeadPiiFields({ parentName: "Nguyễn Thị Lan", parentDob: NGAY }, false);
    expect(masked.parentDob).toBeNull();
    // Không được rò qua bất kỳ đường serialize nào xuống client.
    expect(JSON.stringify(masked)).not.toContain("1985");
  });

  it("phiếu không khai ngày sinh → vẫn null, không đẻ khoá lạ", () => {
    expect(maskLeadPiiFields({ parentDob: null }, false).parentDob).toBeNull();
  });

  it("phiếu KHÔNG mang khoá `parentDob` → không tự chèn khoá vào kết quả", () => {
    // Nhiều đường đọc select hẹp. Tự chèn `parentDob: null` vào đó là đẻ ra một
    // khẳng định sai ("phụ huynh này không có ngày sinh") ở nơi thật ra là chưa hỏi.
    const masked = maskLeadPiiFields({ phone: "0909123456" }, false);
    expect("parentDob" in masked).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Đợt E (22/08/2026) — che SĐT trong NỘI DUNG tin nhắn
// ═════════════════════════════════════════════════════════════════════════════
//
// Vì sao cần: từ 22/08 Quản lý cơ sở KHÔNG còn `leads:view-pii` (Q9). Nhưng inbox
// Messenger vẫn in NGUYÊN VĂN tin khách gửi, mà khách thì hay tự gõ số vào tin
// ("sdt em 0905123456 nhé"). Che cột `phone` mà để nguyên nội dung = che hình thức.
//
// Khác `maskFreeText` (ẩn hẳn cả đoạn): ở đây phải GIỮ ĐỌC ĐƯỢC — inbox mà thành
// "•••" thì QL không còn theo dõi được hội thoại, tức là đổi một lỗ hổng lấy một
// tính năng chết. Nên chỉ cắt đúng mẩu trông giống liên hệ.
describe("[Đợt E] redactContactsInText — cắt liên hệ, giữ nội dung", () => {
  it("cắt SĐT giữa câu, giữ phần còn lại đọc được", () => {
    expect(redactContactsInText("sdt em la 0905123456 nhe chi")).toBe("sdt em la ••• nhe chi");
  });

  it("cắt cả dạng +84 và 84", () => {
    expect(redactContactsInText("+84905123456")).toBe("•••");
    expect(redactContactsInText("goi 84905123456")).toBe("goi •••");
  });

  it("cắt email", () => {
    expect(redactContactsInText("mail a.b+c@sata-robo.vn nhe")).toBe("mail ••• nhe");
  });

  it("cắt nhiều số trong một tin", () => {
    expect(redactContactsInText("0905123456 hoac 0912345678")).toBe("••• hoac •••");
  });

  it("KHÔNG cắt số không phải SĐT — học phí, năm, mã lớp", () => {
    expect(redactContactsInText("hoc phi 2500000 dong")).toBe("hoc phi 2500000 dong");
    expect(redactContactsInText("Lop Sata 1 - 2026")).toBe("Lop Sata 1 - 2026");
    expect(redactContactsInText("clz9k2h4t0000abcd")).toBe("clz9k2h4t0000abcd");
  });

  it("chuỗi rỗng / null / undefined → trả lại y nguyên, không nổ", () => {
    expect(redactContactsInText("")).toBe("");
    expect(redactContactsInText(null)).toBeNull();
    expect(redactContactsInText(undefined)).toBeNull();
  });

  it("người CÓ quyền vẫn đọc nguyên văn — hàm này chỉ chạy khi thiếu quyền", () => {
    // Ghi thành test để chỗ gọi không tự ý áp cho mọi người xem.
    const raw = "sdt em la 0905123456";
    expect(redactContactsInText(raw)).not.toBe(raw);
    expect(raw).toBe("sdt em la 0905123456");
  });
});
