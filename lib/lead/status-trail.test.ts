// @vitest-environment node
/**
 * C-07 — "Log ai đổi trạng thái, đổi lúc nào, TỪ trạng thái nào — hiện ở trang
 * chi tiết lead."
 *
 * Đợt 1 đã dựng mục "Lịch sử thay đổi" (đọc `AuditLog` lọc cứng theo lead đang
 * mở — `lib/lead/audit-history.ts`). Cái còn hỏng nằm ở ĐƯỜNG GHI, và hỏng theo
 * ba kiểu khác nhau nên nhìn từ màn hình thì chỉ thấy "thiếu vài mốc":
 *
 *  (a) ĐỔI TAY (`updateLeadStatus`) — ghi ĐỦ: 1 dòng `AuditLog`
 *      (`lead.status_change`, có `oldValues.status`) + 1 dòng `LeadActivity`.
 *      Đây là hình mẫu đúng.
 *
 *  (b) HAI ĐƯỜNG TỰ ĐỘNG GHI LỆCH NHAU:
 *      · `maybeAdvanceLeadToRegistered` (`lib/finance/payment.ts`) — CHỜ QUYẾT
 *        ĐỊNH → ĐÃ ĐĂNG KÝ khi ghi nhận tiền: chỉ tạo `LeadActivity`, KHÔNG có
 *        dòng `AuditLog` nào ⇒ mục "Lịch sử thay đổi" (thứ QLCS được xem) mất
 *        hẳn mốc này.
 *      · `convertLeadToEnrollment(V2)` (`lib/crm/convert-lead*.ts`) — → ĐÃ GHI
 *        DANH: chỉ ghi `AuditLog` (module `enrollment`), KHÔNG có dòng timeline
 *        nào ⇒ dòng thời gian của Sale mất mốc chốt.
 *      · `syncTrialProgress` (`lib/trial/service.ts`) — → ĐANG HỌC THỬ / CHỜ
 *        QUYẾT ĐỊNH: KHÔNG ghi cái nào cả (chỉ `publishEvent`).
 *      · `updateTrialAction` (`app/(admin)/admin/trials/actions.ts`) — → ĐÃ HỌC
 *        THỬ / ĐÃ MẤT: chỉ `LeadActivity`.
 *
 *  (c) ĐƯỜNG TỰ CHIA KHÁCH (`lib/lead/assign.ts` · `lib/lead/auto-assign.ts`)
 *      lật `MỚI → ĐÃ PHÂN CÔNG` ngay trong lượt chia, nhưng dòng audit của nó
 *      là `ASSIGN` và chỉ mang `assignedToId`. Trạng thái đổi mà KHÔNG một bảng
 *      nào ghi lại — không `AuditLog`, không `LeadActivity`. Đây là mốc đầu tiên
 *      của mọi phễu, mất nó là mất luôn "lead nằm ở NEW bao lâu".
 *
 * ⚠️ C-06 vừa thêm `LeadChild.status` ⇒ trạng thái CON đổi cũng phải để lại vết
 * cùng một dạng, không đẻ định dạng thứ hai.
 *
 * Chốt của ticket: MỘT đường ghi duy nhất — `recordLeadStatusChange` — ghi CẢ
 * hai dòng (AuditLog + LeadActivity) TRONG CÙNG transaction với lượt đổi.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const h = vi.hoisted(() => ({
  logLeadAudit: vi.fn(),
  activityCreate: vi.fn(),
  // N-4 — đường ghi hoạt động chung bump `Lead.lastActivityAt` trong cùng tx.
  leadUpdate: vi.fn(),
}));
vi.mock("@/lib/audit/log", () => ({ logLeadAudit: h.logLeadAudit }));

import {
  LEAD_STATUS_TRAIL_SOURCE_LABEL,
  isLeadStatusTrailRow,
  leadStatusTrailAudit,
  leadStatusTrailContent,
  leadStatusTrailMetadata,
  selectLeadStatusTrail,
} from "./status-trail";
import { recordLeadStatusChange } from "./status-trail-write";
import {
  LEAD_AUDIT_ACTION_LABEL,
  LEAD_AUDIT_FIELD_LABEL,
  formatLeadAuditFieldValue,
  getLeadStatusHistory,
} from "./audit-history";

// ─── Phần 1: hình dạng của vết (thuần) ───────────────────────────────────────

describe("[C-07] leadStatusTrailAudit — vết mang ĐỦ 'từ trạng thái nào'", () => {
  it("đổi trạng thái PHIẾU: cũ → mới nằm ở đúng ô `status`", () => {
    const v = leadStatusTrailAudit({ from: "NEW", to: "ASSIGNED", source: "ASSIGN" });

    expect(v.oldValues.status).toBe("NEW");
    expect(v.newValues.status).toBe("ASSIGNED");
    expect(v.changedFields).toContain("status");
  });

  it("ghi kèm NGUỒN của lượt đổi — để sau này phân biệt tay/máy mà không đoán", () => {
    const v = leadStatusTrailAudit({ from: "NEW", to: "ASSIGNED", source: "ASSIGN" });

    expect(v.newValues.statusSource).toBe("ASSIGN");
    // Nguồn KHÔNG phải một ô bị đổi — lọt vào `changedFields` là màn hình hiện
    // thêm một dòng "cũ → mới" rỗng nghĩa.
    expect(v.changedFields).not.toContain("statusSource");
  });

  it("đổi trạng thái CON dùng ô `childStatus`, KHÔNG đụng ô `status` của phiếu", () => {
    const v = leadStatusTrailAudit({
      from: "CONSULTING",
      to: "LOST",
      source: "MANUAL",
      child: { id: "child-1", fullName: "Bé Minh" },
    });

    expect(v.oldValues.childStatus).toBe("CONSULTING");
    expect(v.newValues.childStatus).toBe("LOST");
    expect(v.changedFields).toEqual(["childStatus"]);
    expect(v.newValues).not.toHaveProperty("status");
    // Lần ra được ĐÚNG đứa con nào (C-06: lý do ghi ở cấp phụ huynh, bị đè).
    expect(v.newValues.leadChildId).toBe("child-1");
    expect(v.newValues.childName).toBe("Bé Minh");
  });

  it("ô phụ đi kèm (vd lý do rớt) vào được cả vết lẫn danh sách ô đổi", () => {
    const v = leadStatusTrailAudit({
      from: "CONSULTING",
      to: "LOST",
      source: "MANUAL",
      child: { id: "c1", fullName: "Bé Minh" },
      extra: { lostNote: "Học phí cao" },
      extraChangedFields: ["lostNote"],
    });

    expect(v.newValues.lostNote).toBe("Học phí cao");
    expect(v.changedFields).toEqual(["childStatus", "lostNote"]);
  });
});

describe("[C-07] leadStatusTrailContent — dòng timeline đọc được bằng tiếng Việt", () => {
  it("phiếu: nhãn tiếng Việt cả hai đầu, không phải mã enum trần", () => {
    const s = leadStatusTrailContent({ from: "NEW", to: "ASSIGNED", source: "ASSIGN" });

    expect(s).toContain("Mới");
    expect(s).toContain("Đã phân công");
    expect(s).toContain("→");
  });

  it("nguồn tự động được nói ra; đổi tay thì không thêm chữ thừa", () => {
    expect(leadStatusTrailContent({ from: "AWAITING_DECISION", to: "REGISTERED", source: "PAYMENT" }))
      .toContain(LEAD_STATUS_TRAIL_SOURCE_LABEL.PAYMENT);
    expect(leadStatusTrailContent({ from: "NEW", to: "CONTACTED", source: "MANUAL" }))
      .not.toContain(LEAD_STATUS_TRAIL_SOURCE_LABEL.ASSIGN);
  });

  it("con: nêu TÊN con + lý do (C-06 cần lần ra lý do của từng đứa)", () => {
    const s = leadStatusTrailContent({
      from: "CONSULTING",
      to: "LOST",
      source: "MANUAL",
      child: { id: "c1", fullName: "Bé Minh" },
      reason: "Học phí cao",
    });

    expect(s).toContain("Bé Minh");
    expect(s).toContain("Học phí cao");
  });

  it("trạng thái đầu chưa biết (lead vừa tạo) vẫn ra câu đọc được", () => {
    const s = leadStatusTrailContent({ from: null, to: "ASSIGNED", source: "ASSIGN" });

    expect(s).toContain("Đã phân công");
    expect(s).not.toContain("null");
  });
});

describe("[C-07] leadStatusTrailMetadata — giữ nguyên khoá from/to đã dùng", () => {
  it("`from`/`to` là khoá cũ của timeline — đổi tên là làm hỏng dữ liệu đang có", () => {
    const m = leadStatusTrailMetadata({ from: "NEW", to: "ASSIGNED", source: "ASSIGN" });

    expect(m.from).toBe("NEW");
    expect(m.to).toBe("ASSIGNED");
    expect(m.source).toBe("ASSIGN");
    expect(m.auto).toBe(true);
  });

  it("đổi tay → `auto` false; đổi trạng thái con kèm mã con", () => {
    expect(leadStatusTrailMetadata({ from: "NEW", to: "CONTACTED", source: "MANUAL" }).auto).toBe(false);
    expect(
      leadStatusTrailMetadata({
        from: "NEW",
        to: "LOST",
        source: "MANUAL",
        child: { id: "c9", fullName: "Bé Na" },
      }).leadChildId,
    ).toBe("c9");
  });
});

// ─── Phần 2: đường ĐỌC — gạn đúng mốc trạng thái ra khỏi nhật ký chung ───────

describe("[C-07] isLeadStatusTrailRow — nhặt đúng dòng đổi trạng thái", () => {
  const dong = (over: Record<string, unknown>) => ({
    id: "a1",
    createdAt: "2026-08-25T03:00:00.000Z",
    actorName: "Sale CS1",
    action: "lead.status_change",
    changedFields: [] as string[],
    reason: null,
    oldValues: null,
    newValues: null,
    ...over,
  });

  it("dòng có `status` mới → nhận", () => {
    expect(isLeadStatusTrailRow(dong({ newValues: { status: "ASSIGNED" } }))).toBe(true);
  });

  it("dòng có `childStatus` mới → nhận (C-06)", () => {
    expect(isLeadStatusTrailRow(dong({ newValues: { childStatus: "LOST" } }))).toBe(true);
  });

  it("dòng convert (module enrollment, action 'STATUS_CHANGE' trần) → vẫn nhận", () => {
    expect(
      isLeadStatusTrailRow(
        dong({ action: "STATUS_CHANGE", oldValues: { status: "REGISTERED" }, newValues: { status: "ENROLLED", orderCode: "DH1" } }),
      ),
    ).toBe(true);
  });

  it("🔴 bàn giao HO→CS cũng mang action 'STATUS_CHANGE' nhưng KHÔNG đổi trạng thái → loại", () => {
    // `lib/crm/handover.ts` ghi action "STATUS_CHANGE" cho centerId/handedAt.
    // Lọc theo action là kéo nhầm nó vào bảng mốc trạng thái.
    expect(
      isLeadStatusTrailRow(
        dong({ action: "STATUS_CHANGE", oldValues: { centerId: "cs1" }, newValues: { centerId: "cs2", handedAt: "2026-08-01" } }),
      ),
    ).toBe(false);
  });

  it("sửa tên/SĐT (lead.update) → loại", () => {
    expect(
      isLeadStatusTrailRow(
        dong({ action: "lead.update", changedFields: ["parentName"], newValues: { parentName: "A" } }),
      ),
    ).toBe(false);
  });
});

describe("[C-07] selectLeadStatusTrail — bảng mốc: ai · lúc nào · từ đâu → đâu", () => {
  const rows = [
    {
      id: "a3",
      createdAt: "2026-08-25T03:00:00.000Z",
      actorName: "Hệ thống",
      action: "lead.status_change",
      changedFields: ["status"],
      reason: null,
      oldValues: { status: "AWAITING_DECISION" },
      newValues: { status: "REGISTERED", statusSource: "PAYMENT" },
    },
    {
      id: "a2",
      createdAt: "2026-08-24T03:00:00.000Z",
      actorName: "Sale CS1",
      action: "lead.update",
      changedFields: ["parentName"],
      reason: null,
      oldValues: { parentName: "Lan" },
      newValues: { parentName: "Lan Anh" },
    },
    {
      id: "a1",
      createdAt: "2026-08-23T03:00:00.000Z",
      actorName: "Sale CS1",
      action: "lead.status_change",
      changedFields: ["childStatus", "lostNote"],
      reason: "Học phí cao",
      oldValues: { childStatus: "CONSULTING", leadChildId: "c1", childName: "Bé Minh" },
      newValues: { childStatus: "LOST", leadChildId: "c1", childName: "Bé Minh", statusSource: "MANUAL" },
    },
  ];

  it("chỉ giữ mốc trạng thái, bỏ lượt sửa hồ sơ", () => {
    const out = selectLeadStatusTrail(rows);

    expect(out.map((r) => r.id)).toEqual(["a3", "a1"]);
  });

  it("mỗi mốc nói đủ: ai · lúc nào · từ trạng thái nào → trạng thái nào", () => {
    const [moi] = selectLeadStatusTrail(rows);

    expect(moi.actorName).toBe("Hệ thống");
    expect(moi.createdAt).toBe("2026-08-25T03:00:00.000Z");
    expect(moi.from).toBe("AWAITING_DECISION");
    expect(moi.to).toBe("REGISTERED");
    expect(moi.fromLabel).toBe("Chờ quyết định");
    expect(moi.toLabel).toBe("Đã đăng ký");
    expect(moi.sourceLabel).toBe(LEAD_STATUS_TRAIL_SOURCE_LABEL.PAYMENT);
  });

  it("mốc của CON dùng nhãn trạng thái con + nêu tên con + lý do", () => {
    const con = selectLeadStatusTrail(rows)[1];

    expect(con.isChild).toBe(true);
    expect(con.childName).toBe("Bé Minh");
    expect(con.toLabel).toBe("Rớt");
    expect(con.reason).toBe("Học phí cao");
  });

  it("vết cũ (trước C-07, không có `statusSource`) vẫn hiện được, chỉ khuyết nguồn", () => {
    const out = selectLeadStatusTrail([
      {
        id: "cu",
        createdAt: "2026-07-01T03:00:00.000Z",
        actorName: "Sale CS1",
        action: "lead.status_change",
        changedFields: ["status"],
        reason: null,
        oldValues: { status: "NEW" },
        newValues: { status: "CONTACTED" },
      },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].sourceLabel).toBeNull();
  });

  it("PII đã che ở tầng trên vẫn đi qua được (không tự đọc lại giá trị thô)", () => {
    const out = selectLeadStatusTrail([
      {
        id: "che",
        createdAt: "2026-07-01T03:00:00.000Z",
        actorName: "Sale CS1",
        action: "lead.status_change",
        changedFields: ["childStatus"],
        reason: null,
        oldValues: { childStatus: "CONSULTING", childName: "B••• M•••" },
        newValues: { childStatus: "LOST", childName: "B••• M•••" },
      },
    ]);

    expect(out[0].childName).toBe("B••• M•••");
  });
});

// ─── Phần 3: đường GHI — một hàm, hai dòng, cùng transaction ─────────────────

/** N-4 MOC — mốc `createdAt` mà tx giả trả cho dòng hoạt động. */
const MOC_TX = new Date("2026-08-25T03:00:00.000Z");
const tx = {
  leadActivity: { create: h.activityCreate },
  lead: { update: h.leadUpdate },
} as never;

describe("[C-07] recordLeadStatusChange — MỘT đường ghi cho mọi lượt đổi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.logLeadAudit.mockResolvedValue(undefined);
    h.activityCreate.mockResolvedValue({ id: "act-1", createdAt: MOC_TX });
    h.leadUpdate.mockResolvedValue({ id: "lead-1" });
  });

  it("[N-4] lượt đổi trạng thái cũng bump `lastActivityAt`, cùng tx", async () => {
    await recordLeadStatusChange({
      tx,
      leadId: "lead-1",
      actorId: null,
      actorName: "Hệ thống",
      from: "AWAITING_DECISION",
      to: "REGISTERED",
      source: "PAYMENT",
    });

    expect(h.leadUpdate).toHaveBeenCalledTimes(1);
    expect(h.leadUpdate.mock.calls[0][0]).toEqual({
      where: { id: "lead-1" },
      data: { lastActivityAt: MOC_TX },
    });
  });

  it("ghi ĐỦ hai dòng: nhật ký + timeline", async () => {
    await recordLeadStatusChange({
      tx,
      leadId: "lead-1",
      actorId: "u-1",
      actorName: "Sale CS1",
      from: "NEW",
      to: "ASSIGNED",
      source: "ASSIGN",
    });

    expect(h.logLeadAudit).toHaveBeenCalledTimes(1);
    expect(h.activityCreate).toHaveBeenCalledTimes(1);
  });

  it("🔴 cả hai dòng đi CÙNG transaction của lượt đổi", async () => {
    await recordLeadStatusChange({
      tx,
      leadId: "lead-1",
      actorId: "u-1",
      actorName: "Sale CS1",
      from: "NEW",
      to: "ASSIGNED",
      source: "ASSIGN",
    });

    // Vết nằm ngoài transaction thì lượt đổi hỏng mà vết vẫn sống (và ngược lại).
    expect(h.logLeadAudit.mock.calls[0][0].tx).toBe(tx);
  });

  it("hàm KHÔNG nuốt lỗi ghi vết — hỏng thì cả lượt đổi phải đổ", async () => {
    h.logLeadAudit.mockRejectedValue(new Error("audit chết"));

    await expect(
      recordLeadStatusChange({
        tx,
        leadId: "lead-1",
        actorId: null,
        actorName: "Hệ thống",
        from: "AWAITING_DECISION",
        to: "REGISTERED",
        source: "PAYMENT",
      }),
    ).rejects.toThrow();
  });

  it("không đổi gì (cũ = mới) → không đẻ vết rỗng", async () => {
    await recordLeadStatusChange({
      tx,
      leadId: "lead-1",
      actorId: "u-1",
      actorName: "Sale CS1",
      from: "ASSIGNED",
      to: "ASSIGNED",
      source: "ASSIGN",
    });

    expect(h.logLeadAudit).not.toHaveBeenCalled();
    expect(h.activityCreate).not.toHaveBeenCalled();
  });

  it("🔴 đánh dấu RỚT lại cho con ĐÃ rớt với lý do KHÁC → vẫn phải có vết", async () => {
    // C-06 ghi lý do ở cấp phụ huynh và ĐÈ lên lý do cũ. Bỏ qua lượt này vì
    // "trạng thái không đổi" là để lý do mới đè lý do cũ mà không còn vết nào.
    await recordLeadStatusChange({
      tx,
      leadId: "lead-1",
      actorId: "u-1",
      actorName: "Sale CS1",
      from: "LOST",
      to: "LOST",
      source: "MANUAL",
      child: { id: "c1", fullName: "Bé Minh" },
      reason: "Đổi ý, chọn chỗ gần nhà",
      extra: { lostNote: "Đổi ý, chọn chỗ gần nhà" },
      extraChangedFields: ["lostNote"],
    });

    expect(h.logLeadAudit).toHaveBeenCalledTimes(1);
    expect(h.logLeadAudit.mock.calls[0][0].reason).toBe("Đổi ý, chọn chỗ gần nhà");
  });

  it("chỗ gọi đã tự ghi dòng nhật ký (convert) → chỉ bù timeline, không ghi đôi", async () => {
    await recordLeadStatusChange({
      tx,
      leadId: "lead-1",
      actorId: "u-1",
      actorName: "Sale CS1",
      from: "REGISTERED",
      to: "ENROLLED",
      source: "CONVERT",
      auditAlreadyWritten: true,
    });

    expect(h.logLeadAudit).not.toHaveBeenCalled();
    expect(h.activityCreate).toHaveBeenCalledTimes(1);
  });

  it("dòng timeline luôn mang type STATUS_CHANGE + metadata from/to", async () => {
    await recordLeadStatusChange({
      tx,
      leadId: "lead-1",
      actorId: "u-1",
      actorName: "Sale CS1",
      from: "TRIAL_SCHEDULED",
      to: "TRIAL_IN_PROGRESS",
      source: "TRIAL",
    });

    const data = h.activityCreate.mock.calls[0][0].data;
    expect(data.leadId).toBe("lead-1");
    expect(data.type).toBe("STATUS_CHANGE");
    expect(data.metadata).toMatchObject({ from: "TRIAL_SCHEDULED", to: "TRIAL_IN_PROGRESS" });
  });
});

// ─── Phần 3b: truy vấn RIÊNG cho bảng mốc ───────────────────────────────────

describe("[C-07] getLeadStatusHistory — mốc phễu không bị lượt sửa hồ sơ đẩy ra ngoài", () => {
  const rows = [
    {
      id: "s1",
      createdAt: new Date("2026-08-25T03:00:00.000Z"),
      actorName: "Hệ thống",
      action: "lead.status_change",
      changedFields: ["status"],
      reason: null,
      oldValues: { status: "NEW" },
      newValues: { status: "ASSIGNED", statusSource: "ASSIGN" },
    },
    {
      id: "bangiao",
      createdAt: new Date("2026-08-24T03:00:00.000Z"),
      actorName: "HO",
      action: "STATUS_CHANGE",
      changedFields: [] as string[],
      reason: null,
      oldValues: { centerId: "cs1" },
      newValues: { centerId: "cs2", handedAt: "2026-08-24" },
    },
  ];
  const findMany = vi.fn(async (_args: unknown) => rows);
  const sdb = { auditLog: { findMany } } as unknown as Parameters<typeof getLeadStatusHistory>[0];

  beforeEach(() => findMany.mockClear());

  it("`where` khoá cứng vào đúng lead đang mở, không nhận bộ lọc từ người gọi", async () => {
    await getLeadStatusHistory(sdb, "lead-1");

    const arg = findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(arg.where.entityType).toBe("Lead");
    expect(arg.where.entityId).toBe("lead-1");
  });

  it("truy vấn phủ CẢ hai kiểu action (logLeadAudit lẫn writeAudit của convert)", async () => {
    await getLeadStatusHistory(sdb, "lead-1");

    const arg = findMany.mock.calls[0][0] as { where: { action: { in: string[] } } };
    expect(arg.where.action.in).toContain("lead.status_change");
    expect(arg.where.action.in).toContain("STATUS_CHANGE");
  });

  it("🔴 lượt BÀN GIAO lọt qua bộ lọc action vẫn bị gạn ở tầng giá trị", async () => {
    const out = await getLeadStatusHistory(sdb, "lead-1");

    expect(out.map((r) => r.id)).toEqual(["s1"]);
  });

  it("mới nhất lên trước + có trần số dòng", async () => {
    await getLeadStatusHistory(sdb, "lead-1", { take: 5000 });

    const arg = findMany.mock.calls[0][0] as { orderBy: unknown; take: number };
    expect(arg.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(arg.take).toBeLessThanOrEqual(200);
  });
});

describe("[C-07] nhãn hiển thị — không bày mã enum ra cho người dùng", () => {
  it("ô trạng thái phiếu/con ra tiếng Việt, ô khác giữ nguyên cách cũ", () => {
    expect(formatLeadAuditFieldValue("status", "AWAITING_DECISION")).toBe("Chờ quyết định");
    expect(formatLeadAuditFieldValue("childStatus", "LOST")).toBe("Rớt");
    expect(formatLeadAuditFieldValue("source", "Facebook")).toBe("Facebook");
    expect(formatLeadAuditFieldValue("status", null)).toBe("—");
  });

  it("có nhãn cho ô của C-06 + cho action trần của convert", () => {
    expect(LEAD_AUDIT_FIELD_LABEL.childStatus).toBeTruthy();
    expect(LEAD_AUDIT_FIELD_LABEL.lostNote).toBeTruthy();
    expect(LEAD_AUDIT_ACTION_LABEL.STATUS_CHANGE).toBe("Đổi trạng thái");
  });
});

// ─── Phần 4: chốt chặn nguồn — mọi đường đổi trạng thái phải đi qua đây ──────

const goc = process.cwd();
const doc = (p: string) => fs.readFileSync(path.join(goc, p), "utf8");
/** Bỏ chú thích trước khi quét: chú thích GIẢI THÍCH lỗi cũ có nhắc đúng các chuỗi này. */
const boChuThich = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

describe("[C-07] chốt chặn nguồn — không còn đường đổi trạng thái nào ghi kiểu riêng", () => {
  const DUONG_DOI_TRANG_THAI = [
    "app/(admin)/admin/leads/actions.ts", // đổi tay + đánh dấu rớt theo con (C-06)
    "app/(admin)/admin/trials/actions.ts", // kết quả buổi học thử → trạng thái phiếu
    "lib/finance/payment.ts", // ghi nhận tiền → Đã đăng ký
    "lib/trial/service.ts", // điểm danh học thử → Đang học thử / Chờ quyết định
    "lib/lead/assign.ts", // ĐƯỜNG TỰ CHIA (1)
    "lib/lead/auto-assign.ts", // ĐƯỜNG TỰ CHIA (2) + gán tay
    "lib/crm/convert-lead.ts", // chốt ghi danh
    "lib/crm/convert-lead-v2.ts", // chốt ghi danh (v2)
    // Đường GỘP của import Excel đẩy lead cũ sang "Đã đăng ký"; vết cũ chỉ là mấy
    // chữ "chuyển REGISTERED" nhét trong `content` của một dòng ghi chú.
    "app/api/admin/import/leads/registered/route.ts",
  ];

  it.each(DUONG_DOI_TRANG_THAI)("%s đi qua `recordLeadStatusChange`", (p) => {
    expect(boChuThich(doc(p))).toContain("recordLeadStatusChange");
  });

  it("trang chi tiết lead có bày mục 'Mốc trạng thái' và nạp bằng truy vấn riêng", () => {
    const trang = boChuThich(doc("app/(admin)/admin/leads/[id]/page.tsx"));

    expect(trang).toContain("getLeadStatusHistory");
    expect(trang).toContain("LeadStatusTrail");
    // Vết mang tên con (PII) — phải che bằng CÙNG cổng `canViewPii` của trang.
    expect(trang).toContain("maskLeadAuditValues");
  });

  it("🔴 CHỈ `status-trail-write.ts` được tự tay tạo LeadActivity kiểu STATUS_CHANGE", () => {
    // Đây chính là cái làm hai đường tự động ghi lệch nhau: mỗi chỗ tự viết một
    // dòng timeline theo ý mình, chỗ thì quên hẳn dòng nhật ký.
    const viPham: string[] = [];
    const quet = (thuMuc: string) => {
      for (const e of fs.readdirSync(path.join(goc, thuMuc), { withFileTypes: true })) {
        const con = `${thuMuc}/${e.name}`;
        if (e.isDirectory()) {
          if (e.name === "node_modules" || e.name === ".next") continue;
          quet(con);
          continue;
        }
        if (!/\.tsx?$/.test(e.name) || /\.(test|spec)\.tsx?$/.test(e.name)) continue;
        if (con.endsWith("lib/lead/status-trail-write.ts")) continue;
        const than = boChuThich(fs.readFileSync(path.join(goc, con), "utf8"));
        if (/leadActivity\.create\(\{[\s\S]{0,400}?["']STATUS_CHANGE["']/.test(than)) {
          viPham.push(con);
        }
      }
    };
    quet("lib");
    quet("app");

    expect(viPham).toEqual([]);
  });
});
