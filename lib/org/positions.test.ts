/**
 * TS-09 — chống vòng lặp cây báo cáo (US-08 AC4), và TS-08 phần THUẦN: vai của vị trí
 * biến thành hàng `UserOrgRoleRow` đúng khuôn `buildActor` ăn được.
 *
 * Tầng DB thật (TS-08 đủ vòng: gán → có quyền, gỡ → 403, người kế nhiệm hưởng nguyên bộ)
 * nằm ở `tests/chat`-style spec chạy trong job CI có Postgres — xem `tests/nen/`.
 * Ở đây chỉ dùng client giả, vì thứ cần chứng minh là THUẬT TOÁN lần cây, không phải SQL.
 */
import { describe, it, expect, vi } from "vitest";
import {
  ReportingCycleError,
  assertNoReportingCycle,
} from "@/lib/org/positions";

type Node = { id: string; title: string; reportsToPositionId: string | null };

/** Client giả chỉ có đúng thứ `assertNoReportingCycle` dùng: `position.findUnique`. */
function fakeClient(nodes: Node[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return {
    position: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => byId.get(where.id) ?? null),
    },
  } as never;
}

const N = (id: string, reportsTo: string | null = null): Node => ({
  id,
  title: id.toUpperCase(),
  reportsToPositionId: reportsTo,
});

describe("[TS-09] assertNoReportingCycle", () => {
  it("cấp trên hợp lệ (chuỗi hở) → cho qua", async () => {
    const c = fakeClient([N("a"), N("b", "c"), N("c")]);
    await expect(assertNoReportingCycle("a", "b", c)).resolves.toBeUndefined();
  });

  it("bỏ trống cấp trên → cho qua, không truy vấn gì", async () => {
    const c = fakeClient([]);
    await expect(assertNoReportingCycle("a", null, c)).resolves.toBeUndefined();
  });

  it("tự báo cáo về chính mình → chặn", async () => {
    const c = fakeClient([N("a")]);
    await expect(assertNoReportingCycle("a", "a", c)).rejects.toBeInstanceOf(ReportingCycleError);
  });

  it("vòng TRỰC TIẾP (B đã báo cáo về A, nay A trỏ về B) → chặn", async () => {
    const c = fakeClient([N("a"), N("b", "a")]);
    await expect(assertNoReportingCycle("a", "b", c)).rejects.toBeInstanceOf(ReportingCycleError);
  });

  it("vòng QUA CHUỖI (A ← B ← C, nay A trỏ về C) → chặn và NÊU RA chuỗi vòng", async () => {
    // Thông báo phải chỉ được mắt xích nào cắt, không chỉ nói "không hợp lệ".
    const c = fakeClient([N("a"), N("b", "a"), N("cc", "b")]);
    await expect(assertNoReportingCycle("a", "cc", c)).rejects.toThrow(/CC → B → A/);
  });

  it("cấp trên không tồn tại → KHÔNG ném ở đây (để FK của DB chặn)", async () => {
    const c = fakeClient([N("a")]);
    await expect(assertNoReportingCycle("a", "khong-co", c)).resolves.toBeUndefined();
  });

  it("cây hỏng sẵn sâu quá trần → fail-closed, không ghi thêm vào đống hỏng", async () => {
    // 100 cấp nối nhau: vượt trần 64 ⇒ phải chặn thay vì lặp mãi.
    const nodes: Node[] = [];
    for (let i = 0; i < 100; i++) nodes.push(N(`p${i}`, `p${i + 1}`));
    nodes.push(N("p100"));
    const c = fakeClient(nodes);
    await expect(assertNoReportingCycle("moi", "p0", c)).rejects.toThrow(/quá 64 cấp/);
  });
});
