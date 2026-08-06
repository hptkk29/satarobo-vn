// T-RBAC (R2-RBAC-2/3) — lọc giáo viên theo cơ sở: CS1 không thấy GV CS2; guard
// gán chéo cơ sở. Thuần, không DB (chạy ở lane test:unit mặc định).
import { describe, it, expect } from "vitest";
import { filterTeachersByCenter, teacherCenterAssignmentError } from "./center-filter";

const TEACHERS = [
  { id: "t-cs1-a", centerId: "cs1" },
  { id: "t-cs1-b", centerId: "cs1" },
  { id: "t-cs2-a", centerId: "cs2" },
  { id: "t-ho", centerId: null },
];

describe("filterTeachersByCenter", () => {
  it("[T-RBAC-1] lọc CS1 → chỉ GV CS1, không lọt GV CS2", () => {
    const r = filterTeachersByCenter(TEACHERS, "cs1");
    expect(r.map((t) => t.id)).toEqual(["t-cs1-a", "t-cs1-b"]);
    expect(r.some((t) => t.centerId === "cs2")).toBe(false);
  });

  it("[T-RBAC-2] lọc CS2 → chỉ GV CS2", () => {
    expect(filterTeachersByCenter(TEACHERS, "cs2").map((t) => t.id)).toEqual(["t-cs2-a"]);
  });

  it("[T-RBAC-3] keepIds LUÔN giữ GV đang gán dù khác cơ sở (chống <Select> rớt value)", () => {
    const r = filterTeachersByCenter(TEACHERS, "cs1", ["t-cs2-a"]);
    expect(r.map((t) => t.id)).toEqual(["t-cs1-a", "t-cs1-b", "t-cs2-a"]);
  });

  it("[T-RBAC-4] centerId null (đơn vị HO) → chỉ giữ keepIds, không liệt kê đại trà", () => {
    expect(filterTeachersByCenter(TEACHERS, null)).toEqual([]);
    expect(filterTeachersByCenter(TEACHERS, null, ["t-ho"]).map((t) => t.id)).toEqual(["t-ho"]);
  });

  it("[T-RBAC-5] keepIds rỗng/null bỏ qua an toàn", () => {
    expect(filterTeachersByCenter(TEACHERS, "cs1", [null, undefined]).map((t) => t.id)).toEqual([
      "t-cs1-a",
      "t-cs1-b",
    ]);
  });
});

describe("teacherCenterAssignmentError (guard server-side)", () => {
  it("[T-RBAC-6] GV cùng cơ sở lớp → null (OK)", () => {
    expect(
      teacherCenterAssignmentError("cs1", [{ id: "t-cs1-a", centerId: "cs1" }]),
    ).toBeNull();
  });

  it("[T-RBAC-7] GV khác cơ sở → chặn", () => {
    expect(
      teacherCenterAssignmentError("cs1", [{ id: "t-cs2-a", centerId: "cs2" }]),
    ).toMatch(/cùng cơ sở/);
  });

  it("[T-RBAC-8] teacherId không tồn tại (centerId undefined) → chặn", () => {
    // 06/08: câu báo cho ca này đổi thành "không hợp lệ hoặc chưa gán đơn vị" —
    // chính xác hơn "phải cùng cơ sở". Ý định test không đổi: PHẢI bị chặn.
    expect(
      teacherCenterAssignmentError("cs1", [{ id: "ghost", centerId: undefined }]),
    ).not.toBeNull();
  });

  it("[T-RBAC-9] lớp HO/không cơ sở (centerId null) → không ràng buộc", () => {
    expect(teacherCenterAssignmentError(null, [{ id: "t-cs2-a", centerId: "cs2" }])).toBeNull();
  });

  it("[T-RBAC-10] TA khác cơ sở dù GV chính đúng → vẫn chặn", () => {
    expect(
      teacherCenterAssignmentError("cs1", [
        { id: "t-cs1-a", centerId: "cs1" },
        { id: "t-cs2-a", centerId: "cs2" },
      ]),
    ).toMatch(/cùng cơ sở/);
  });
});

// Chốt 06/08/2026: GV Đà Nẵng chuyển về HỘI SỞ rồi được phân lịch xuống các cơ sở.
// GV thuộc HO = nguồn lực chung, gán được cho lớp ở MỌI cơ sở. GV thuộc CS khác thì
// vẫn chặn (cách ly CS1↔CS2 giữ nguyên).
describe("GV Hội sở điều đi mọi cơ sở", () => {
  const HO = ["hoi-so"];
  const gv = (id: string, centerId: string | null) => ({ id, centerId });

  it("GV Hội sở KHÔNG bị chặn khi gán cho lớp CS1", () => {
    expect(teacherCenterAssignmentError("cs1", [gv("t1", "hoi-so")], HO)).toBeNull();
  });

  it("GV cơ sở KHÁC vẫn bị chặn", () => {
    expect(teacherCenterAssignmentError("cs1", [gv("t1", "cs2")], HO)).toMatch(/cùng cơ sở/);
  });

  it("GV cùng cơ sở với lớp → vẫn hợp lệ như cũ", () => {
    expect(teacherCenterAssignmentError("cs1", [gv("t1", "cs1")], HO)).toBeNull();
  });

  it("GV không tồn tại / chưa gán đơn vị → vẫn chặn", () => {
    expect(teacherCenterAssignmentError("cs1", [{ id: "x", centerId: undefined }], HO)).toMatch(/không hợp lệ/);
    expect(teacherCenterAssignmentError("cs1", [gv("t1", null)], HO)).toMatch(/không hợp lệ/);
  });

  it("KHÔNG truyền danh sách HO → giữ hành vi cũ (chặn hết trừ cùng cơ sở)", () => {
    expect(teacherCenterAssignmentError("cs1", [gv("t1", "hoi-so")])).not.toBeNull();
  });

  it("dropdown: GV Hội sở hiện ra khi chọn cơ sở CS1", () => {
    const ds = [gv("a", "cs1"), gv("b", "cs2"), gv("c", "hoi-so")];
    expect(filterTeachersByCenter(ds, "cs1", [], HO).map((t) => t.id).sort()).toEqual(["a", "c"]);
  });
});
