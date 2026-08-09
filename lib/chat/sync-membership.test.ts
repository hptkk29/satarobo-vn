// lib/chat/sync-membership.test.ts — US-03 unit (thuần, không DB):
// computeDerivedMembership — bẫy BA mục 5 + BR-11/BR-14.
import { describe, expect, it } from "vitest";
import {
  computeDerivedMembership,
  type ClassMembershipSnapshot,
} from "./sync-membership";

function snap(partial: Partial<ClassMembershipSnapshot>): ClassMembershipSnapshot {
  return { teacherIds: [], students: [], centerManagerIds: [], ...partial };
}

function byUser(list: ReturnType<typeof computeDerivedMembership>) {
  return new Map(list.map((p) => [p.userId, p]));
}

describe("computeDerivedMembership (US-03)", () => {
  it("[TS-06] PH có 2 con cùng lớp → đúng MỘT entry (bẫy BA: tập học viên)", () => {
    const out = computeDerivedMembership(
      snap({
        students: [
          { id: "hs1", parentIds: ["ph1"] },
          { id: "hs2", parentIds: ["ph1"] },
        ],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      userId: "ph1",
      role: "MEMBER",
      derivedFrom: "CLASS_STUDENT_PARENT",
    });
  });

  it("[BR-14] học viên có 2 PH (bố + mẹ) → 2 entry riêng biệt, đều MEMBER", () => {
    const out = computeDerivedMembership(
      snap({ students: [{ id: "hs1", parentIds: ["bo", "me"] }] }),
    );
    expect(out).toHaveLength(2);
    const m = byUser(out);
    for (const id of ["bo", "me"]) {
      expect(m.get(id)).toEqual({
        userId: id,
        role: "MEMBER",
        derivedFrom: "CLASS_STUDENT_PARENT",
      });
    }
  });

  it("[BR-11a] GV chính + trợ giảng → cả hai MODERATOR/CLASS_TEACHER", () => {
    const out = computeDerivedMembership(
      snap({ teacherIds: ["gv1", "ta1"] }),
    );
    const m = byUser(out);
    expect(out).toHaveLength(2);
    expect(m.get("gv1")).toEqual({
      userId: "gv1",
      role: "MODERATOR",
      derivedFrom: "CLASS_TEACHER",
    });
    expect(m.get("ta1")).toEqual({
      userId: "ta1",
      role: "MODERATOR",
      derivedFrom: "CLASS_TEACHER",
    });
  });

  it("teacherIds có null/undefined (lớp chưa gán trợ giảng) → tự bỏ", () => {
    const out = computeDerivedMembership(
      snap({ teacherIds: ["gv1", null, undefined] }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.userId).toBe("gv1");
  });

  it("[US-03 AC1] QLCS → MEMBER/CENTER_MANAGER (chốt 07/08: MEMBER, không OBSERVER)", () => {
    const out = computeDerivedMembership(snap({ centerManagerIds: ["ql1"] }));
    expect(out).toEqual([
      { userId: "ql1", role: "MEMBER", derivedFrom: "CENTER_MANAGER" },
    ]);
  });

  it("lớp không học viên → chỉ GV + QLCS", () => {
    const out = computeDerivedMembership(
      snap({ teacherIds: ["gv1"], centerManagerIds: ["ql1"] }),
    );
    expect(out).toHaveLength(2);
    const m = byUser(out);
    expect(m.get("gv1")!.role).toBe("MODERATOR");
    expect(m.get("ql1")!.role).toBe("MEMBER");
  });

  it("snapshot rỗng hoàn toàn → []", () => {
    expect(computeDerivedMembership(snap({}))).toEqual([]);
  });

  it("ưu tiên tư cách: GV kiêm PH → MODERATOR/CLASS_TEACHER, vẫn 1 entry", () => {
    const out = computeDerivedMembership(
      snap({
        teacherIds: ["u1"],
        students: [{ id: "hs1", parentIds: ["u1"] }],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      userId: "u1",
      role: "MODERATOR",
      derivedFrom: "CLASS_TEACHER",
    });
  });

  it("ưu tiên tư cách: PH kiêm QLCS → giữ CLASS_STUDENT_PARENT (sát lớp học nhất)", () => {
    const out = computeDerivedMembership(
      snap({
        students: [{ id: "hs1", parentIds: ["u2"] }],
        centerManagerIds: ["u2"],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.derivedFrom).toBe("CLASS_STUDENT_PARENT");
    expect(out[0]!.role).toBe("MEMBER");
  });

  it("hàm thuần + xác định: cùng input gọi 2 lần → cùng output (nền cho AC6)", () => {
    const input = snap({
      teacherIds: ["gv1"],
      students: [
        { id: "hs1", parentIds: ["ph1", "ph2"] },
        { id: "hs2", parentIds: ["ph1"] },
      ],
      centerManagerIds: ["ql1"],
    });
    const a = computeDerivedMembership(input);
    const b = computeDerivedMembership(input);
    expect(a).toEqual(b);
    expect(a).toHaveLength(4); // gv1, ph1 (1 entry cho 2 con), ph2, ql1
  });
});
