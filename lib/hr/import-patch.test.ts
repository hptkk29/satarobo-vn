import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { ANH_XA_COT, dungPatchNhanSu } from "./import-patch";

const GOC = join(__dirname, "..", "..");
const doc = (p: string) => readFileSync(join(GOC, p), "utf8");

/** Hồ sơ ĐỦ DỮ LIỆU đã chuẩn hoá — giống `base` mà route dựng. */
const DAY_DU = {
  fullName: "Nguyễn Văn A",
  jobTitle: "Giáo viên",
  department: "DAO_TAO",
  status: "RESIGNED",
  isActive: false,
  phone: "0900000000",
  email: "a@x.test",
  dateOfBirth: new Date("1995-05-05T00:00:00Z"),
  gender: "MALE",
  nationalId: "0123",
  contractType: "FULL_TIME",
  centerId: "cs1",
  orgUnitId: "ou-cs1",
  managerId: "mgr",
  joinedAt: new Date("2024-01-02T00:00:00Z"),
  endDate: null,
  address: "Đà Nẵng",
  subjects: ["Robotics"],
  certifications: ["ABC"],
  bio: "…",
  emergencyContact: "0911111111",
  notes: "ghi chú",
} as const;

describe("dungPatchNhanSu — cột không có trong file thì KHÔNG ĐỤNG TỚI", () => {
  // ⚠️ CA BẮT BUỘC 1: file chỉ có employeeCode + centerSlug, hồ sơ đích đủ dữ liệu.
  it("file 2 cột (employeeCode + centerSlug) chỉ ghi cơ sở, mọi trường khác GIỮ NGUYÊN", () => {
    const patch = dungPatchNhanSu(
      DAY_DU,
      new Set(["employeeCode", "centerSlug"]),
    );
    expect(patch).toEqual({ centerId: "cs1", orgUnitId: "ou-cs1" });

    // Nói thẳng từng thứ đã suýt bị xoá, để lần đọc sau thấy được cái giá.
    for (const k of [
      "phone",
      "email",
      "dateOfBirth",
      "joinedAt",
      "endDate",
      "nationalId",
      "address",
      "bio",
      "notes",
      "emergencyContact",
      "gender",
      "contractType",
      "subjects",
      "certifications",
      "managerId",
      "fullName",
      "jobTitle",
      "department",
    ]) {
      expect(Object.hasOwn(patch, k), `${k} KHÔNG được nằm trong patch`).toBe(
        false,
      );
    }
  });

  // ⚠️ CA BẮT BUỘC 2: hồ sơ đã nghỉ + file thiếu cột status ⇒ vẫn nghỉ.
  it("hồ sơ RESIGNED + file THIẾU cột status ⇒ status và isActive không bị đụng", () => {
    const patch = dungPatchNhanSu(
      DAY_DU,
      new Set(["employeeCode", "centerSlug"]),
    );
    expect(Object.hasOwn(patch, "status")).toBe(false);
    expect(Object.hasOwn(patch, "isActive")).toBe(false);
  });

  it("có cột status thì MỚI ghi status, và isActive đi kèm", () => {
    const patch = dungPatchNhanSu(DAY_DU, new Set(["status"]));
    expect(patch).toEqual({ status: "RESIGNED", isActive: false });
  });

  it("isActive KHÔNG bao giờ tự đi một mình — nó suy từ status", () => {
    // Không có cột `isActive` trong file; nó chỉ tới cùng `status`.
    expect(
      Object.values(ANH_XA_COT)
        .flat()
        .filter((t) => t === "isActive"),
    ).toEqual(["isActive"]);
    expect(ANH_XA_COT.status).toContain("isActive");
    expect(Object.hasOwn(ANH_XA_COT, "isActive")).toBe(false);
  });

  it("centerSlug kéo theo CẢ orgUnitId (ghi kép 2 pha)", () => {
    expect(dungPatchNhanSu(DAY_DU, new Set(["centerSlug"]))).toEqual({
      centerId: "cs1",
      orgUnitId: "ou-cs1",
    });
  });

  it("file không có cột nào ghi được ⇒ patch RỖNG (caller phải bỏ qua, đừng gọi update)", () => {
    // `update` với data rỗng vẫn đụng `updatedAt`, làm hỏng chính phép truy vết
    // "sửa mà không có audit" đã dùng để điều tra endpoint này.
    expect(dungPatchNhanSu(DAY_DU, new Set(["employeeCode"]))).toEqual({});
  });
});

describe("route nhập nhân sự cắm đúng luật", () => {
  const F = "app/api/admin/import/employees/route.ts";

  it("đường CẬP NHẬT dùng patch, KHÔNG ghi trọn `base`", () => {
    const src = doc(F);
    expect(src).toContain("dungPatchNhanSu(");
    expect(src).not.toContain("update: base");
  });

  it("patch rỗng thì KHÔNG gọi update", () => {
    expect(doc(F)).toContain("Object.keys(patch).length > 0");
  });

  it('`.default("ACTIVE")` KHÔNG còn ở schema — mặc định chuyển xuống nhánh TẠO MỚI', () => {
    const src = doc(F);
    // Ở schema, mặc định này áp cho CẢ đường cập nhật ⇒ im lặng cho người đã nghỉ đi
    // làm lại. Ở nhánh tạo mới thì nó hợp lý.
    expect(src).not.toContain('EmploymentStatusEnum.default("ACTIVE")');
    expect(src).toContain('base.status ?? "ACTIVE"');
  });

  it("tạo mới vẫn ĐÒI ĐỦ ba trường bắt buộc", () => {
    const src = doc(F);
    expect(src).toContain("Tạo mới nhân sự");
    for (const k of ["fullName", "jobTitle", "department"])
      expect(src).toContain(`base.${k}`);
  });
});

// ── Việc 8 (08/09/2026): lượt nhập phải để lại DẤU ────────────────────────────
//
// Kết quả đo tự nói ra vấn đề lớn hơn bản vá: một endpoint ghi HÀNG LOẠT mà không có
// dòng audit nào, trong khi đường sửa từng người ghi 9 chỗ. Nên câu "prod sạch" chỉ là
// "không thấy dấu", không phải "không xảy ra".
describe("nhập nhân sự ghi AuditLog", () => {
  const F = "app/api/admin/import/employees/route.ts";

  it("có audit cho CẢ cập nhật lẫn tạo mới", () => {
    const src = doc(F);
    expect(src).toContain("IMPORT_UPDATE");
    expect(src).toContain("IMPORT_CREATE");
  });

  it("audit nằm TRONG transaction — ghi ngoài là audit sống sót khi ghi hỏng", () => {
    expect(doc(F)).toContain(
      "tx: tx as unknown as Parameters<typeof writeAudit>[0]",
    );
  });

  it("KHÔNG ghi audit cho hồ sơ không đổi gì", () => {
    const src = doc(F);
    // Hai cổng: patch rỗng thì không vào nhánh ghi; và trong nhánh ghi, chỉ ghi khi có
    // trường THỰC SỰ đổi. Nhập lại cùng một file không được đẻ audit rỗng.
    expect(src).toContain("Object.keys(patch).length > 0");
    expect(src).toContain("Object.keys(moi).length > 0");
  });

  it("audit chỉ mang đúng tập trường mà import được phép ghi", () => {
    // Ảnh before đọc theo `IMPORT_AUDIT_SELECT` dựng TỪ `ANH_XA_COT`, nên không có
    // đường nào để một trường ngoài tập đó lọt vào sổ audit.
    expect(doc(F)).toContain("Object.values(ANH_XA_COT).flat()");
  });

  it("ghi rõ cột nào có trong file — để đọc lại biết vì sao trường khác không đổi", () => {
    expect(doc(F)).toContain("cột có trong file");
  });
});
