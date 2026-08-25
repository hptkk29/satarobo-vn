// lib/leads/set-status.test.ts — GĐ1.
//
// Bốn tính chất phải khoá, vì sai cái nào cũng hỏng âm thầm:
//  1. Idempotent — module học thử gọi lại mỗi lượt điểm danh; không có tính chất này
//     thì sổ đầy dòng rác và tỷ lệ chuyển đổi bị thổi lên.
//  2. `statusChangedAt` phải dời — đây là mốc thay cho `updatedAt` ở nhắc việc.
//  3. Rơi khỏi phễu phải ghi BẬC TRƯỚC ĐÓ, và lead quay lại phễu KHÔNG được xoá bậc cũ.
//  4. KHÔNG tra ngược orgUnitId từ centerId — hàm tra dùng `db` toàn cục nên sẽ thoát
//     khỏi transaction. Test này chạy với tx giả, không có DB, nên nó bắt được ngay.
import { describe, it, expect } from "vitest";
import type { LeadStatus, Prisma } from "@prisma/client";
import { setLeadStatus, recordLeadStatusChange } from "./set-status";

type LeadRow = {
  status: LeadStatus;
  centerId: string | null;
  orgUnitId: string | null;
  statusChangedAt: Date | null;
  droppedAtStage: LeadStatus | null;
  dropReason: string | null;
};

type HistoryRow = {
  leadId: string;
  fromStatus: LeadStatus | null;
  toStatus: LeadStatus;
  source: string;
  changedById: string | null;
  changedByName: string | null;
  reason: string | null;
  centerId: string | null;
  orgUnitId: string | null;
};

function fakeTx(lead: LeadRow | null, history: HistoryRow[]): Prisma.TransactionClient {
  return {
    lead: {
      findUnique: async () => lead,
      update: async (args: { data: Partial<LeadRow> }) => {
        if (lead) Object.assign(lead, args.data);
        return lead;
      },
    },
    leadStatusHistory: {
      create: async (args: { data: HistoryRow }) => {
        history.push(args.data);
        return args.data;
      },
    },
  } as unknown as Prisma.TransactionClient;
}

function leadMau(over: Partial<LeadRow> = {}): LeadRow {
  return {
    status: "CONSULTING",
    centerId: "cs1",
    orgUnitId: "ou-cs1",
    statusChangedAt: null,
    droppedAtStage: null,
    dropReason: null,
    ...over,
  };
}

describe("setLeadStatus — cửa duy nhất đổi trạng thái", () => {
  it("đổi thật thì ghi đúng một dòng sổ", async () => {
    const lead = leadMau();
    const history: HistoryRow[] = [];
    const res = await setLeadStatus({
      tx: fakeTx(lead, history),
      leadId: "l1",
      to: "TRIAL_SCHEDULED",
      source: "admin",
      actorId: "u1",
      actorName: "Sale A",
    });

    expect(res).toEqual({ changed: true, from: "CONSULTING", to: "TRIAL_SCHEDULED" });
    expect(lead.status).toBe("TRIAL_SCHEDULED");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      fromStatus: "CONSULTING",
      toStatus: "TRIAL_SCHEDULED",
      source: "admin",
      changedById: "u1",
      changedByName: "Sale A",
      centerId: "cs1",
      orgUnitId: "ou-cs1",
    });
  });

  it("dời mốc statusChangedAt — mốc mà nhắc việc đọc", async () => {
    const lead = leadMau();
    const truoc = Date.now();
    await setLeadStatus({
      tx: fakeTx(lead, []),
      leadId: "l1",
      to: "TRIAL_SCHEDULED",
      source: "admin",
    });
    expect(lead.statusChangedAt).toBeInstanceOf(Date);
    expect(lead.statusChangedAt!.getTime()).toBeGreaterThanOrEqual(truoc);
  });

  it("IDEMPOTENT: gọi lại cùng trạng thái thì không ghi thêm dòng nào", async () => {
    const lead = leadMau({ status: "AWAITING_DECISION" });
    const history: HistoryRow[] = [];
    const tx = fakeTx(lead, history);

    const r1 = await setLeadStatus({ tx, leadId: "l1", to: "AWAITING_DECISION", source: "trial" });
    const r2 = await setLeadStatus({ tx, leadId: "l1", to: "AWAITING_DECISION", source: "trial" });

    expect(r1).toEqual({ changed: false, reason: "KHONG_DOI" });
    expect(r2).toEqual({ changed: false, reason: "KHONG_DOI" });
    expect(history).toHaveLength(0);
  });

  it("lead không tồn tại → không ném lỗi, báo rõ", async () => {
    const history: HistoryRow[] = [];
    const res = await setLeadStatus({
      tx: fakeTx(null, history),
      leadId: "khong-co",
      to: "LOST",
      source: "admin",
    });
    expect(res).toEqual({ changed: false, reason: "KHONG_THAY_LEAD" });
    expect(history).toHaveLength(0);
  });

  it("rơi khỏi phễu thì ghi BẬC TRƯỚC ĐÓ và lý do", async () => {
    const lead = leadMau({ status: "TRIAL_ATTENDED" });
    await setLeadStatus({
      tx: fakeTx(lead, []),
      leadId: "l1",
      to: "LOST",
      source: "admin",
      reason: "Phụ huynh chọn trung tâm khác",
    });
    expect(lead.droppedAtStage).toBe("TRIAL_ATTENDED");
    expect(lead.dropReason).toBe("Phụ huynh chọn trung tâm khác");
  });

  it("nuôi dưỡng cũng tính là rơi", async () => {
    const lead = leadMau({ status: "CONTACTED" });
    await setLeadStatus({ tx: fakeTx(lead, []), leadId: "l1", to: "NURTURING", source: "admin" });
    expect(lead.droppedAtStage).toBe("CONTACTED");
  });

  it("lead quay lại phễu thì GIỮ bậc rơi cũ — xoá đi là mất số liệu cứu lead", async () => {
    const lead = leadMau({ status: "NURTURING", droppedAtStage: "CONTACTED" });
    await setLeadStatus({ tx: fakeTx(lead, []), leadId: "l1", to: "CONSULTING", source: "admin" });
    expect(lead.status).toBe("CONSULTING");
    expect(lead.droppedAtStage).toBe("CONTACTED");
  });

  it("lead chưa gán cơ sở vẫn ghi sổ được, hai cột để null", async () => {
    const lead = leadMau({ centerId: null, orgUnitId: null });
    const history: HistoryRow[] = [];
    await setLeadStatus({ tx: fakeTx(lead, history), leadId: "l1", to: "ASSIGNED", source: "auto-assign" });
    expect(history[0]).toMatchObject({ centerId: null, orgUnitId: null });
  });

  it("KHÔNG tra ngược orgUnitId từ centerId", async () => {
    // Tx giả không có `db`, nên nếu hàm cố tra ngược thì test này nổ chứ không im.
    const lead = leadMau({ centerId: "cs1", orgUnitId: null });
    const history: HistoryRow[] = [];
    await setLeadStatus({ tx: fakeTx(lead, history), leadId: "l1", to: "ASSIGNED", source: "assign" });
    expect(history[0].orgUnitId).toBeNull();
    expect(history[0].centerId).toBe("cs1");
  });
});

describe("recordLeadStatusChange — chỉ ghi sổ cho lượt đã claim ở nơi khác", () => {
  it("ghi sổ với from do call-site đưa, không tự đọc lại", async () => {
    // Ở đường tiền/convert, `updateMany` đã đổi status TRƯỚC khi hàm này chạy, nên
    // đọc lại `lead.status` sẽ ra giá trị MỚI. Vì vậy `from` phải do call-site truyền.
    const lead = leadMau({ status: "REGISTERED" });
    const history: HistoryRow[] = [];
    await recordLeadStatusChange({
      tx: fakeTx(lead, history),
      leadId: "l1",
      from: "AWAITING_DECISION",
      to: "REGISTERED",
      source: "payment",
      actorId: "u9",
    });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      fromStatus: "AWAITING_DECISION",
      toStatus: "REGISTERED",
      source: "payment",
    });
  });

  it("vẫn dời statusChangedAt", async () => {
    const lead = leadMau({ status: "ENROLLED" });
    await recordLeadStatusChange({
      tx: fakeTx(lead, []),
      leadId: "l1",
      from: "AWAITING_DECISION",
      to: "ENROLLED",
      source: "convert",
    });
    expect(lead.statusChangedAt).toBeInstanceOf(Date);
  });
});
