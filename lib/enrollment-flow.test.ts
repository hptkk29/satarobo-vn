import { describe, it, expect } from "vitest";
import type { OrgUnitType } from "@prisma/client";
import {
  nonEnrollableCenterIds,
  notHeadOfficeWhere,
  buildStudentCourseChain,
} from "./enrollment-flow";

// FL2-05 — "cơ sở nhận học viên" = Center CÓ OrgUnit type=CENTER trỏ tới.
// Ca prod 10/07: Center(hoi-so) MỒ CÔI — không OrgUnit nào trỏ tới nó, nên bản cũ
// (đi từ OrgUnit ra, đòi type != CENTER && centerId != null) không thể thấy.
describe("nonEnrollableCenterIds", () => {
  const ou = (type: OrgUnitType, centerId: string | null, deletedAt: Date | null = null) => ({
    type,
    centerId,
    deletedAt,
  });
  const cs = (...ids: string[]) => ids.map((id) => ({ id }));

  it("[PROD 10/07] Center mồ côi (không OrgUnit nào trỏ tới) → bị loại", () => {
    const ids = nonEnrollableCenterIds(cs("c-cs1", "c-cs2", "hoi-so"), [
      ou("ROOT", null),
      ou("HO", null), // ĐÚNG như seed-orgunit.ts: HO không có centerId
      ou("CENTER", "c-cs1"),
      ou("CENTER", "c-cs2"),
    ]);
    expect(ids).toEqual(["hoi-so"]);
  });

  it("tương thích ngược: nếu ai đó nối OrgUnit(HO).centerId thì vẫn loại (type ≠ CENTER)", () => {
    const ids = nonEnrollableCenterIds(cs("c-cs1", "c-ho"), [ou("HO", "c-ho"), ou("CENTER", "c-cs1")]);
    expect(ids).toEqual(["c-ho"]);
  });

  it("mở cơ sở mới: thêm OrgUnit type=CENTER trỏ vào Center đó → tự nhận HV, không sửa code", () => {
    expect(nonEnrollableCenterIds(cs("c-cs3"), [ou("CENTER", "c-cs3")])).toEqual([]);
  });

  it("OrgUnit type=CENTER đã xoá mềm → Center của nó thành mồ côi → bị loại", () => {
    const ids = nonEnrollableCenterIds(cs("c-cs1", "c-cs2"), [
      ou("CENTER", "c-cs1"),
      ou("CENTER", "c-cs2", new Date()),
    ]);
    expect(ids).toEqual(["c-cs2"]);
  });

  it("chưa dựng cây OrgUnit ⇒ trả [] (fail-open) — không khoá sạch mọi picker", () => {
    expect(nonEnrollableCenterIds(cs("c-cs1", "c-cs2"), [ou("ROOT", null)])).toEqual([]);
    expect(nonEnrollableCenterIds(cs("c-cs1"), [])).toEqual([]);
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
