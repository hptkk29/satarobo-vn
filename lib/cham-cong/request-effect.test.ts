import { describe, it, expect } from "vitest";
import {
  describeEffect,
  effectHint,
  effectKey,
  effectQueryPlan,
  effectSummaries,
  leaveDayCount,
  type EffectInput,
  type EffectSummaryRow,
} from "./request-effect";
import { vnDateAt } from "@/lib/time/vn";

const D9 = vnDateAt(2026, 8, 9); // 09/09/2026 00:00 giờ VN
const D11 = vnDateAt(2026, 8, 11);

function input(over: Partial<EffectInput> = {}): EffectInput {
  return {
    kind: "SHIFT_SWAP",
    fromDate: D9,
    toDate: null,
    targetUserName: null,
    currentCode: null,
    targetCurrentCode: null,
    requesterNewCode: null,
    targetNewCode: null,
    leaveCode: null,
    currentIn: null,
    currentOut: null,
    requestedIn: null,
    requestedOut: null,
    className: null,
    ...over,
  };
}

describe("leaveDayCount", () => {
  it("tính cả hai đầu; thiếu mốc ⇒ 1 ngày", () => {
    expect(leaveDayCount(D9, D11)).toBe(3);
    expect(leaveDayCount(D9, D9)).toBe(1);
    expect(leaveDayCount(D9, null)).toBe(1);
    expect(leaveDayCount(null, null)).toBe(1);
  });
});

describe("effectHint — giữ nguyên văn 5 nhánh cũ", () => {
  it("in đúng câu của từng loại", () => {
    const base = { targetUserId: null, fromDate: D9, toDate: null };
    expect(effectHint({ ...base, kind: "CLASS_OFF" })).toBe(
      "huỷ buổi học của lớp trong ngày (sinh buổi bù theo luật lớp)",
    );
    expect(effectHint({ ...base, kind: "SUB_TEACH" })).toBe("gán giáo viên dạy thay cho buổi đó");
    expect(effectHint({ ...base, kind: "SHIFT_SWAP" })).toBe(
      "đổi mã ca trên lưới phân ca và tính lại công",
    );
    expect(effectHint({ ...base, kind: "SHIFT_SWAP", targetUserId: "u2" })).toBe(
      "đổi mã ca trên lưới phân ca cho cả hai người và tính lại công",
    );
    expect(effectHint({ ...base, kind: "LEAVE", toDate: D11 })).toBe("ghi mã nghỉ lên lưới cho 3 ngày");
    expect(effectHint({ ...base, kind: "LEAVE", toDate: D11, targetUserId: "u2" })).toBe(
      "ghi mã nghỉ lên lưới cho 3 ngày, xếp ca người làm thay",
    );
    expect(effectHint({ ...base, kind: "TIMESHEET_FIX" })).toBe(
      "ghi mốc giờ chỉnh tay và tính lại công ngày đó",
    );
    expect(effectHint({ ...base, kind: "OT" })).toBeNull();
  });
});

describe("describeEffect — 5 loại có hệ quả trên lịch", () => {
  it("SHIFT_SWAP: một chiều và hai chiều", () => {
    expect(describeEffect(input({ currentCode: "S", requesterNewCode: "CG" }))).toEqual({
      text: "S → CG",
      code: "CG",
      tone: "default",
    });
    expect(
      describeEffect(
        input({ currentCode: "S", requesterNewCode: "CG", targetUserName: "Trần B", targetCurrentCode: "CG" }),
      )?.text,
    ).toBe("S → CG · Trần B: CG → S");
  });

  it("SHIFT_SWAP: người nhận có ca riêng thì lấy đúng ca đó", () => {
    expect(
      describeEffect(
        input({
          currentCode: "S",
          requesterNewCode: "CG",
          targetUserName: "Trần B",
          targetCurrentCode: "CG",
          targetNewCode: "D2",
        }),
      )?.text,
    ).toBe("S → CG · Trần B: CG → D2");
  });

  it("LEAVE: mã ca → mã nghỉ kèm số ngày", () => {
    expect(describeEffect(input({ kind: "LEAVE", currentCode: "S", leaveCode: "P", toDate: D11 }))).toEqual({
      text: "S → P · 3 ngày",
      code: "P",
      tone: "default",
    });
  });

  it("TIMESHEET_FIX: mốc đang có ⇒ mốc đề nghị", () => {
    const r = describeEffect(
      input({
        kind: "TIMESHEET_FIX",
        currentIn: vnDateAt(2026, 8, 9, 7, 52),
        currentOut: null,
        requestedIn: "07:30",
        requestedOut: "17:30",
      }),
    );
    expect(r).toEqual({ text: "07:52→chưa quét ⇒ 07:30→17:30", tone: "default" });
  });

  it("CLASS_OFF / SUB_TEACH: nêu lớp và người", () => {
    expect(describeEffect(input({ kind: "CLASS_OFF", className: "Sata 3 · A1" }))?.text).toBe(
      "Huỷ buổi · Sata 3 · A1",
    );
    expect(
      describeEffect(input({ kind: "SUB_TEACH", targetUserName: "Trần B", className: "Sata 3 · A1" }))?.text,
    ).toBe("Dạy thay: Trần B · Sata 3 · A1");
  });

  it("loại đơn hợp lệ nhưng không đổi lịch ⇒ Chỉ đổi trạng thái (tông xám)", () => {
    for (const kind of ["OT", "LATE_EARLY", "REMOTE", "BUSINESS_TRIP", "CLASS_CHANGE"]) {
      expect(describeEffect(input({ kind }))).toEqual({ text: "Chỉ đổi trạng thái", tone: "muted" });
    }
  });

  it("loại lạ ⇒ null để chỗ gọi tự quyết", () => {
    expect(describeEffect(input({ kind: "KHONG_TON_TAI" }))).toBeNull();
  });
});

describe("describeEffect — phân biệt CHƯA CÓ (bình thường) với KHUYẾT (duyệt sẽ lỗi)", () => {
  // Ranh giới này là toàn bộ lý do khối test tồn tại. Ô lưới trống và lượt quét chưa có là
  // chuyện thường ngày — duyệt vẫn chạy. Còn thiếu mã ca mới / thiếu giờ đề nghị thì
  // `decide()` NÉM LỖI, nên cột phải cảnh báo trước khi người ta bấm Duyệt.
  it("thiếu mã ca mới ⇒ cảnh báo, không vẽ mũi tên rỗng", () => {
    expect(describeEffect(input({ kind: "SHIFT_SWAP" }))).toEqual({
      text: "Thiếu mã ca mới — duyệt sẽ báo lỗi",
      tone: "warning",
    });
    // Chuỗi rỗng / toàn khoảng trắng cũng là thiếu.
    expect(describeEffect(input({ currentCode: "  ", requesterNewCode: "" }))?.tone).toBe("warning");
    expect(describeEffect(input({ currentCode: "S", requesterNewCode: " " }))?.code).toBeUndefined();
  });

  it("thiếu loại nghỉ ⇒ cảnh báo (duyệt được nhưng rơi vào nhánh không lương)", () => {
    expect(describeEffect(input({ kind: "LEAVE" }))).toEqual({
      text: "Thiếu loại nghỉ · 1 ngày",
      tone: "warning",
    });
  });

  it("thiếu CẢ giờ vào và giờ ra ⇒ cảnh báo; còn một giờ thì vẫn ghi được", () => {
    expect(describeEffect(input({ kind: "TIMESHEET_FIX" }))).toEqual({
      text: "Thiếu giờ vào/ra — duyệt sẽ báo lỗi",
      tone: "warning",
    });
    expect(describeEffect(input({ kind: "TIMESHEET_FIX", requestedIn: "07:30" }))).toEqual({
      text: "chưa quét→chưa quét ⇒ 07:30→?",
      tone: "default",
    });
  });

  it("ô lưới trống nói bằng chữ, KHÔNG dùng dấu hỏi", () => {
    expect(describeEffect(input({ requesterNewCode: "CG" }))?.text).toBe("chưa xếp → CG");
    expect(describeEffect(input({ kind: "LEAVE", leaveCode: "P" }))?.text).toBe("chưa xếp → P · 1 ngày");
    expect(describeEffect(input({ currentCode: "S", requesterNewCode: "CG", targetUserName: "Trần B" }))?.text).toBe(
      "S → CG · Trần B: chưa xếp → S",
    );
  });

  it("loại không đụng lưới thì thiếu dữ liệu cũng in được", () => {
    expect(describeEffect(input({ kind: "CLASS_OFF" }))?.text).toBe("Huỷ buổi dạy");
    expect(describeEffect(input({ kind: "SUB_TEACH" }))?.text).toBe("Dạy thay");
  });
});

describe("effectQueryPlan", () => {
  const rows = [
    {
      id: "r1",
      kind: "SHIFT_SWAP",
      requesterId: "u1",
      targetUserId: "u2",
      fromDate: D9,
      requesterNewTemplateId: "t-cg",
      targetNewTemplateId: null,
      leaveTypeId: null,
    },
    {
      id: "r2",
      kind: "LEAVE",
      requesterId: "u1",
      targetUserId: null,
      fromDate: D9,
      requesterNewTemplateId: null,
      targetNewTemplateId: null,
      leaveTypeId: "lt-p",
    },
    {
      id: "r3",
      kind: "TIMESHEET_FIX",
      requesterId: "u3",
      targetUserId: null,
      fromDate: D11,
      requesterNewTemplateId: null,
      targetNewTemplateId: null,
      leaveTypeId: null,
    },
    {
      id: "r4",
      kind: "OT",
      requesterId: "u4",
      targetUserId: null,
      fromDate: D11,
      requesterNewTemplateId: null,
      targetNewTemplateId: null,
      leaveTypeId: null,
    },
  ];

  it("gộp khoá trùng và chỉ đọc thứ thật sự cần", () => {
    const plan = effectQueryPlan(rows);
    expect(plan.userIds).toEqual(["u2"]);
    expect(plan.templateIds).toEqual(["t-cg"]);
    expect(plan.leaveTypeIds).toEqual(["lt-p"]);
    // r1 (u1 + u2) và r2 (u1) cùng ngày ⇒ u1 chỉ đọc một lần; OT không cần ca.
    expect(plan.shiftKeys.map((k) => k.userId)).toEqual(["u1", "u2"]);
    expect(plan.timeLogKeys).toEqual([{ userId: "u3", workDate: D11 }]);
  });

  it("đơn thiếu ngày áp dụng thì không sinh khoá nào", () => {
    const plan = effectQueryPlan([{ ...rows[0], fromDate: null }]);
    expect(plan.shiftKeys).toEqual([]);
    expect(plan.timeLogKeys).toEqual([]);
    expect(plan.userIds).toEqual(["u2"]);
  });
});

describe("effectSummaries", () => {
  const rows: EffectSummaryRow[] = [
    {
      id: "r1",
      kind: "SHIFT_SWAP",
      requesterId: "u1",
      targetUserId: "u2",
      fromDate: D9,
      toDate: null,
      requesterNewTemplateId: "t-cg",
      targetNewTemplateId: null,
      leaveTypeId: null,
      className: null,
      requestedInAt: null,
      requestedOutAt: null,
    },
    {
      id: "r2",
      kind: "TIMESHEET_FIX",
      requesterId: "u3",
      targetUserId: null,
      fromDate: D11,
      toDate: null,
      requesterNewTemplateId: null,
      targetNewTemplateId: null,
      leaveTypeId: null,
      className: null,
      requestedInAt: "07:30",
      requestedOutAt: "17:30",
    },
    {
      id: "r3",
      kind: "KHONG_TON_TAI",
      requesterId: "u4",
      targetUserId: null,
      fromDate: D11,
      toDate: null,
      requesterNewTemplateId: null,
      targetNewTemplateId: null,
      leaveTypeId: null,
      className: null,
      requestedInAt: null,
      requestedOutAt: null,
    },
  ];

  it("ráp dữ liệu đã nạp về từng đơn theo khoá người × ngày", () => {
    const map = effectSummaries(rows, {
      userNameById: new Map([["u2", "Trần B"]]),
      templateCodeById: new Map([["t-cg", "CG"]]),
      leaveCodeById: new Map(),
      shiftCodeByUserDay: new Map([
        [effectKey("u1", D9), "S"],
        [effectKey("u2", D9), "CG"],
      ]),
      tapsByUserDay: new Map([[effectKey("u3", D11), { first: vnDateAt(2026, 8, 11, 7, 52), last: null }]]),
    });
    expect(map.get("r1")?.text).toBe("S → CG · Trần B: CG → S");
    expect(map.get("r1")?.code).toBe("CG");
    expect(map.get("r2")?.text).toBe("07:52→chưa quét ⇒ 07:30→17:30");
    // Loại lạ bị bỏ khỏi map — chỗ gọi in "—".
    expect(map.has("r3")).toBe(false);
  });

  it("bản đồ tra cứu rỗng vẫn ra dòng đọc được", () => {
    const map = effectSummaries(rows, {
      userNameById: new Map(),
      templateCodeById: new Map(),
      leaveCodeById: new Map(),
      shiftCodeByUserDay: new Map(),
      tapsByUserDay: new Map(),
    });
    // r1 mất mã ca mới ⇒ cảnh báo; r2 vẫn có giờ đề nghị nên duyệt được, chỉ là chưa quét.
    expect(map.get("r1")).toEqual({ text: "Thiếu mã ca mới — duyệt sẽ báo lỗi", tone: "warning" });
    expect(map.get("r2")?.text).toBe("chưa quét→chưa quét ⇒ 07:30→17:30");
  });
});
