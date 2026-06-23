import { describe, it, expect } from "vitest";
import type { OrgUnitType } from "@prisma/client";
import {
  nonEnrollableCenterIds,
  notHeadOfficeWhere,
  buildStudentCourseChain,
} from "./enrollment-flow";

// FL2-05 — nhận diện Hội sở QUA OrgUnit tree (type ≠ CENTER), không hardcode "HO".
describe("nonEnrollableCenterIds", () => {
  const ou = (type: OrgUnitType, centerId: string | null, deletedAt: Date | null = null) => ({
    type,
    centerId,
    deletedAt,
  });

  it("trả centerId của HO (đơn vị không nhận học viên), bỏ CENTER", () => {
    const ids = nonEnrollableCenterIds([
      ou("ROOT", null),
      ou("HO", "c-ho"),
      ou("CENTER", "c-cs1"),
      ou("CENTER", "c-cs2"),
    ]);
    expect(ids).toEqual(["c-ho"]);
  });

  it("mở cơ sở mới (type=CENTER) tự được coi là nhận HV → KHÔNG bị loại", () => {
    const ids = nonEnrollableCenterIds([ou("CENTER", "c-cs3")]);
    expect(ids).toEqual([]);
  });

  it("bỏ qua đơn vị xoá mềm và đơn vị không có centerId", () => {
    const ids = nonEnrollableCenterIds([
      ou("HO", "c-ho", new Date()), // xoá mềm → bỏ
      ou("PARTNER", null), // không có centerId → bỏ
    ]);
    expect(ids).toEqual([]);
  });
});

describe("notHeadOfficeWhere", () => {
  it("rỗng khi không có cơ sở cần loại (no-op)", () => {
    expect(notHeadOfficeWhere([])).toEqual({});
  });

  it("giữ row centerId=null, chỉ loại đúng cơ sở Hội sở", () => {
    expect(notHeadOfficeWhere(["c-ho"])).toEqual({
      OR: [{ centerId: null }, { centerId: { notIn: ["c-ho"] } }],
    });
  });
});

// FL2-06 — dây chuyền HS → khoá đang học → lớp.
describe("buildStudentCourseChain", () => {
  const e = (courseId: string, courseName: string, classId: string, name: string, classCode: string | null = null) => ({
    courseId,
    course: { name: courseName },
    classId,
    class: { name, classCode },
  });

  it("gom enrollment theo khoá, mỗi khoá liệt kê lớp đang theo", () => {
    const chain = buildStudentCourseChain([
      e("co-1", "Sata 1", "cl-1", "Lớp A", "A01"),
      e("co-1", "Sata 1", "cl-2", "Lớp B", null),
      e("co-2", "Sata 2", "cl-3", "Lớp C", "C03"),
    ]);
    expect(chain).toHaveLength(2);
    expect(chain[0]).toEqual({
      courseId: "co-1",
      courseName: "Sata 1",
      classes: [
        { classId: "cl-1", label: "Lớp A (A01)" },
        { classId: "cl-2", label: "Lớp B" },
      ],
    });
    expect(chain[1].classes).toEqual([{ classId: "cl-3", label: "Lớp C (C03)" }]);
  });

  it("khử trùng lớp trong cùng khoá", () => {
    const chain = buildStudentCourseChain([
      e("co-1", "Sata 1", "cl-1", "Lớp A"),
      e("co-1", "Sata 1", "cl-1", "Lớp A"),
    ]);
    expect(chain[0].classes).toHaveLength(1);
  });

  it("không enrollment → dây chuyền rỗng", () => {
    expect(buildStudentCourseChain([])).toEqual([]);
  });
});
