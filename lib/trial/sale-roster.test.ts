// Đợt C (kế hoạch Site Sale, 22/08/2026) — test viết TRƯỚC hiện thực (luật cứng #5).
//
// Trang trải nghiệm bản SALE khác bản GIÁO VIÊN ở đúng hai cột, và cả hai đều là
// chỗ dễ sai:
//   • **Phụ huynh** — site giáo viên CỐ Ý ẩn (quyết định câu 46). Trên site Sale
//     là dữ liệu nghiệp vụ chính đáng, nhưng phải qua kiểm quyền, không select thẳng.
//   • **Đã nhập học** — nguồn đúng là `LeadTrialHistory.outcome`, không phải suy
//     từ trạng thái ghi danh.
import { describe, it, expect } from "vitest";
import { buildSaleTrialStudent } from "./sale-roster";

const NEN = {
  enrollmentId: "te-1",
  studentName: "Bé Minh",
  birthYear: 2018,
  courseName: "Sata 3",
  status: "ACTIVE" as const,
  evaluated: false,
  enrolled: false,
  parentName: "Nguyễn Thị Hương",
  parentPhone: "84905123456",
};

describe("[Đợt C] buildSaleTrialStudent — cột Phụ huynh đi qua kiểm quyền", () => {
  it("có quyền xem liên hệ → thấy đầy đủ tên và số", () => {
    const r = buildSaleTrialStudent(NEN, { canViewParentContact: true });
    expect(r.parentName).toBe("Nguyễn Thị Hương");
    expect(r.parentPhone).toBe("84905123456");
  });

  it("KHÔNG có quyền → thấy bản che, KHÔNG rò số thật", () => {
    const r = buildSaleTrialStudent(NEN, { canViewParentContact: false });
    expect(r.parentPhone).not.toBe("84905123456");
    expect(r.parentPhone).not.toContain("905123456");
    expect(r.parentName).not.toBe("Nguyễn Thị Hương");
    // Che chứ không xoá trắng — người dùng vẫn cần phân biệt các dòng với nhau.
    expect(r.parentName?.length).toBeGreaterThan(0);
  });

  it("che ở TẦNG DỮ LIỆU, không phải tầng giao diện", () => {
    // Toàn bộ đối tượng trả về không được chứa số thật ở bất kỳ trường nào —
    // nếu lọt, nó đi thẳng vào payload gửi xuống trình duyệt.
    const r = buildSaleTrialStudent(NEN, { canViewParentContact: false });
    expect(JSON.stringify(r)).not.toContain("84905123456");
  });

  it("lead không có tên/số phụ huynh → null, không bịa chuỗi che", () => {
    const r = buildSaleTrialStudent(
      { ...NEN, parentName: null, parentPhone: null },
      { canViewParentContact: false },
    );
    expect(r.parentName).toBeNull();
    expect(r.parentPhone).toBeNull();
  });
});

describe("[Đợt C] buildSaleTrialStudent — cờ đã nhập học", () => {
  it("đã ghi danh khoá chính → bật cờ", () => {
    expect(buildSaleTrialStudent({ ...NEN, enrolled: true }, { canViewParentContact: true }).enrolled).toBe(true);
  });

  it("học xong buổi trải nghiệm nhưng CHƯA chốt khoá → KHÔNG bật cờ", () => {
    // Bẫy: bản mẫu suy "đã nhập học" từ trạng thái ghi danh trải nghiệm.
    // COMPLETED nghĩa là học hết buổi thử, không phải đã mua khoá.
    const r = buildSaleTrialStudent(
      { ...NEN, status: "COMPLETED", enrolled: false },
      { canViewParentContact: true },
    );
    expect(r.enrolled).toBe(false);
  });

  it("giữ nguyên các trường còn lại", () => {
    const r = buildSaleTrialStudent({ ...NEN, evaluated: true }, { canViewParentContact: true });
    expect(r).toMatchObject({
      enrollmentId: "te-1",
      studentName: "Bé Minh",
      birthYear: 2018,
      courseName: "Sata 3",
      status: "ACTIVE",
      evaluated: true,
    });
  });
});
