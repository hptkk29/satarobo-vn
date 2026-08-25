// lib/finance/payment.ensure.test.ts — K3 (PAY-DEDUP): bất biến "1 khoản = 1 dòng ledger".
// ensureOrderPaymentRecorded idempotent theo (orderId, soDot) qua marker trong note;
// gọi lại KHÔNG tạo Payment trùng; ghi nhận tiền tự đẩy lead AWAITING_DECISION → REGISTERED.
import { describe, it, expect } from "vitest";
import type { Prisma } from "@prisma/client";
import { ensureOrderPaymentRecorded, maybeAdvanceLeadToRegistered } from "./payment";

type PaymentRow = {
  id: string;
  orderId: string;
  note: string;
  amount: number;
  deletedAt: Date | null;
  centerId: string | null;
};

type State = {
  payments: PaymentRow[];
  leadStatus: string;
  leadCenterId: string | null;
  activities: unknown[];
  audits: unknown[];
  /** N-4 — đồng hồ "hoạt động gần nhất"; `null` = chưa ai chạm. */
  leadLastActivityAt: Date | null;
};

/** Mốc `createdAt` mà tx giả trả cho dòng hoạt động — cùng vai `now()` của Postgres. */
const MOC_TX = new Date("2026-08-25T03:00:00.000Z");

/** Tx giả in-memory — mô phỏng đúng phần ensureOrderPaymentRecorded chạm tới. */
function fakeTx(state: State): Prisma.TransactionClient {
  return {
    payment: {
      findFirst: async (args: { where: { orderId: string; note: { contains: string } } }) =>
        state.payments.find(
          (p) =>
            p.orderId === args.where.orderId &&
            p.deletedAt === null &&
            p.note.includes(args.where.note.contains),
        ) ?? null,
      create: async (args: { data: { orderId: string; note: string; amount: number; centerId: string | null } }) => {
        const row: PaymentRow = {
          id: `p${state.payments.length + 1}`,
          orderId: args.data.orderId,
          note: args.data.note,
          amount: args.data.amount,
          centerId: args.data.centerId,
          deletedAt: null,
        };
        state.payments.push(row);
        return { id: row.id };
      },
    },
    lead: {
      findUnique: async () => ({ centerId: state.leadCenterId }),
      updateMany: async (args: { where: { status: string } }) => {
        if (state.leadStatus !== args.where.status) return { count: 0 };
        state.leadStatus = "REGISTERED";
        return { count: 1 };
      },
      // N-4 — đường ghi hoạt động chung bump `Lead.lastActivityAt` trong CÙNG tx.
      update: async (args: { data: { lastActivityAt?: Date } }) => {
        state.leadLastActivityAt = args.data.lastActivityAt ?? null;
        return { id: "l1" };
      },
    },
    leadActivity: {
      create: async (args: { data: unknown }) => {
        state.activities.push(args.data);
        // Trả `createdAt` như Prisma thật: đường ghi chung lấy đúng mốc này làm
        // `lastActivityAt` (không lấy đồng hồ tiến trình) — xem `activity-write.ts`.
        return { id: `a${state.activities.length}`, createdAt: MOC_TX };
      },
    },
    auditLog: {
      create: async (args: { data: unknown }) => {
        state.audits.push(args.data);
        return args.data;
      },
    },
  } as unknown as Prisma.TransactionClient;
}

const baseState = (): State => ({
  payments: [],
  leadStatus: "AWAITING_DECISION",
  leadCenterId: "center-lead",
  activities: [],
  audits: [],
  leadLastActivityAt: null,
});

describe("ensureOrderPaymentRecorded (K3 — 1 khoản = 1 dòng ledger)", () => {
  it("[K3-DoD] gọi 2 lần cùng (orderId, đợt 1) → chỉ tạo 1 Payment, lần 2 created=false", async () => {
    const state = baseState();
    const tx = fakeTx(state);
    const params = { orderId: "o1", soDot: 1, amount: 6_000_000, leadId: "l1", centerId: "c1", actor: { id: "u1" } };

    const r1 = await ensureOrderPaymentRecorded(tx, params);
    const r2 = await ensureOrderPaymentRecorded(tx, params);

    expect(r1).toMatchObject({ ok: true, created: true });
    expect(r2).toMatchObject({ ok: true, created: false, paymentId: (r1 as { paymentId: string }).paymentId });
    expect(state.payments).toHaveLength(1);
    expect(state.payments[0]!.note).toContain("[auto:order-installment:dot1]");
  });

  it("[K3-DoD] marker khác nhau theo nguồn: confirm-full ≠ đợt 1 ≠ đợt 2 (không đè nhầm nhau)", async () => {
    const state = baseState();
    const tx = fakeTx(state);
    await ensureOrderPaymentRecorded(tx, { orderId: "o1", soDot: null, amount: 1, actor: { id: "u1" } });
    await ensureOrderPaymentRecorded(tx, { orderId: "o1", soDot: 1, amount: 1, actor: { id: "u1" } });
    await ensureOrderPaymentRecorded(tx, { orderId: "o1", soDot: 2, amount: 1, actor: { id: "u1" } });
    expect(state.payments.map((p) => /\[auto:[^\]]+\]/.exec(p.note)?.[0])).toEqual([
      "[auto:order-confirm]",
      "[auto:order-installment:dot1]",
      "[auto:order-installment:dot2]",
    ]);
  });

  it("[K3] sau điều chỉnh (khoản cũ soft-deleted) → gọi lại TẠO khoản mới, không hồi sinh khoản cũ", async () => {
    const state = baseState();
    const tx = fakeTx(state);
    await ensureOrderPaymentRecorded(tx, { orderId: "o1", soDot: 1, amount: 6_000_000, centerId: "c1", actor: { id: "u1" } });
    // recordInstallmentPlan lần 2 soft-delete mọi [auto:*] trước khi dựng lại:
    state.payments[0]!.deletedAt = new Date();
    const r = await ensureOrderPaymentRecorded(tx, { orderId: "o1", soDot: 1, amount: 5_000_000, centerId: "c1", actor: { id: "u1" } });
    expect(r).toMatchObject({ ok: true, created: true });
    const active = state.payments.filter((p) => p.deletedAt === null);
    expect(active).toHaveLength(1);
    expect(active[0]!.amount).toBe(5_000_000); // tổng active = 5tr, không phải 11tr
  });

  it("amount = 0 (đợt 2 rỗng) → no-op thành công, không tạo dòng", async () => {
    const state = baseState();
    const r = await ensureOrderPaymentRecorded(fakeTx(state), { orderId: "o1", soDot: 2, amount: 0, actor: { id: "u1" } });
    expect(r).toMatchObject({ ok: true, created: false, paymentId: null });
    expect(state.payments).toHaveLength(0);
  });

  it("suy centerId: thiếu order.centerId → lấy từ lead; thiếu cả hai → actor.centerId", async () => {
    const viaLead = baseState();
    await ensureOrderPaymentRecorded(fakeTx(viaLead), { orderId: "o1", soDot: 1, amount: 1, leadId: "l1", actor: { id: "u1", centerId: "center-actor" } });
    expect(viaLead.payments[0]!.centerId).toBe("center-lead");

    const viaActor = baseState();
    viaActor.leadCenterId = null;
    await ensureOrderPaymentRecorded(fakeTx(viaActor), { orderId: "o1", soDot: 1, amount: 1, leadId: "l1", actor: { id: "u1", centerId: "center-actor" } });
    expect(viaActor.payments[0]!.centerId).toBe("center-actor");
  });

  it("[PH-2] ghi nhận tiền → lead AWAITING_DECISION tự lên REGISTERED + có activity; status khác giữ nguyên", async () => {
    const state = baseState();
    await ensureOrderPaymentRecorded(fakeTx(state), { orderId: "o1", soDot: 1, amount: 1, leadId: "l1", actor: { id: "u1" } });
    expect(state.leadStatus).toBe("REGISTERED");
    expect(state.activities).toHaveLength(1);
    // N-4 — ghi nhận tiền là 1 trong 10 đường trước đây ghi hoạt động mà để
    // nguyên đồng hồ. Mốc phải bằng đúng `createdAt` của dòng vừa ghi.
    expect(state.leadLastActivityAt).toEqual(MOC_TX);

    const converted = baseState();
    converted.leadStatus = "CONVERTED";
    const moved = await maybeAdvanceLeadToRegistered(fakeTx(converted), { leadId: "l1", actor: { id: "u1" } });
    expect(moved).toBe(false);
    expect(converted.leadStatus).toBe("CONVERTED"); // không lùi/đụng status khác
  });
});
