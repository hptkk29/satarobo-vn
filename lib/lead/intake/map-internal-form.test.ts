// G-D (biên bản chốt 4 cổng, 21/08/2026) — test viết TRƯỚC hiện thực (luật cứng #5).
//
// Biểu mẫu nhập khách hàng bản CÓ ĐĂNG NHẬP: bỏ ô "Mã số NV" (người nhập tự gõ,
// gõ sai/gõ hộ nhau được), lấy danh tính từ phiên đăng nhập.
import { describe, it, expect } from "vitest";
import { mapInternalForm } from "./map-internal-form";

const STAFF = { employeeCode: "CS1.TVV.007", displayName: "Nguyễn Thị Diệu" };
const BASE = {
  parentName: "Chị Hương",
  phone: "0905123456",
  childName: "Bé Minh",
  schoolName: null,
  gradeLevel: null,
  centerCode: "CS1",
  email: null,
  note: null,
};

describe("[G-D] mapInternalForm — phiếu nhập khách hàng sau đăng nhập", () => {
  it("chuẩn hoá SĐT về dạng nội bộ 84… (KHÔNG dấu +)", () => {
    const r = mapInternalForm(BASE, STAFF);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lead.phone).toBe("84905123456");
      expect(r.lead.phone.startsWith("+")).toBe(false);
    }
  });

  it("SĐT không hợp lệ → từ chối cả phiếu (lead không gọi được thì vô dụng)", () => {
    const r = mapInternalForm({ ...BASE, phone: "123" }, STAFF);
    expect(r.ok).toBe(false);
  });

  it("mã nhân viên LẤY TỪ PHIÊN ĐĂNG NHẬP, không lấy từ dữ liệu người dùng gửi lên", () => {
    // Kể cả khi client cố nhét mã người khác vào payload, mapper không đọc tới nó.
    const r = mapInternalForm(
      { ...BASE, employeeCode: "CS2.TVV.999" } as never,
      STAFF,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lead.employeeCode).toBe("CS1.TVV.007");
      expect(JSON.stringify(r.lead)).not.toContain("CS2.TVV.999");
    }
  });

  it("ghi lại người nhập trong ghi chú để người xử lý lead biết hỏi ai", () => {
    const r = mapInternalForm(BASE, STAFF);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lead.noteLines.some((l) => l.includes("CS1.TVV.007"))).toBe(true);
    }
  });

  it("người nhập CHƯA có mã nhân viên: vẫn tạo lead, nhưng nói rõ ra", () => {
    const r = mapInternalForm(BASE, { employeeCode: null, displayName: "Trần Marketing" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lead.employeeCode).toBeNull();
      // Vẫn phải biết ai nhập — nếu không thì mất dấu vết.
      expect(r.lead.noteLines.some((l) => l.includes("Trần Marketing"))).toBe(true);
      expect(r.lead.warnings.length).toBeGreaterThan(0);
    }
  });

  it("thiếu tên phụ huynh → suy từ tên con + cảnh báo, không chặn phiếu", () => {
    const r = mapInternalForm({ ...BASE, parentName: "" }, STAFF);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lead.parentName.length).toBeGreaterThan(0);
      expect(r.lead.warnings.some((w) => w.toLowerCase().includes("phụ huynh"))).toBe(true);
    }
  });

  it("thiếu cả tên phụ huynh lẫn tên con → từ chối (không còn gì để gọi)", () => {
    const r = mapInternalForm({ ...BASE, parentName: "", childName: "" }, STAFF);
    expect(r.ok).toBe(false);
  });

  it("email sai định dạng → cảnh báo, KHÔNG chặn phiếu", () => {
    const r = mapInternalForm({ ...BASE, email: "abc@@" }, STAFF);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lead.email).toBeNull();
      expect(r.lead.warnings.some((w) => w.includes("Email"))).toBe(true);
    }
  });

  it("cơ sở đi theo MÃ cơ sở thật, không theo số thứ tự của biểu mẫu cũ", () => {
    const r = mapInternalForm({ ...BASE, centerCode: "CS2" }, STAFF);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lead.centerHint).toEqual({ kind: "code", value: "CS2" });
  });

  it("không chọn cơ sở → không đoán bừa, để tầng sau tự chia", () => {
    const r = mapInternalForm({ ...BASE, centerCode: null }, STAFF);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lead.centerHint).toBeNull();
  });

  it("có tên con → tạo bản ghi con thật, kèm trường/lớp khi có", () => {
    const r = mapInternalForm(
      { ...BASE, childName: "Bé Minh", schoolName: "TH Lê Lợi", gradeLevel: "Lớp 2" },
      STAFF,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lead.child).toEqual({
        fullName: "Bé Minh",
        schoolName: "TH Lê Lợi",
        gradeLevel: "Lớp 2",
      });
    }
  });

  it("ghi chú người nhập gõ tay được giữ nguyên trong ghi chú của lead", () => {
    const r = mapInternalForm({ ...BASE, note: "Khách hỏi lớp thứ Bảy" }, STAFF);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lead.noteLines.some((l) => l.includes("Khách hỏi lớp thứ Bảy"))).toBe(true);
    }
  });

  it("phiếu nội bộ KHÔNG mang mã ngoài ⇒ không tự khử trùng theo externalId", () => {
    const r = mapInternalForm(BASE, STAFF);
    expect(r.ok).toBe(true);
    // externalId null ⇒ chống trùng dựa trên SĐT (lib/lead/dedup.ts), đúng ý:
    // hai nhân viên nhập cùng một khách phải bị chặn, không tạo 2 lead.
    if (r.ok) expect(r.lead.externalId ?? null).toBeNull();
  });
});
