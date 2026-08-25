// @vitest-environment node
/**
 * A-03 — CỔNG + ĐỊNH DẠNG của đường xuất lead (`GET /api/admin/leads/export`).
 *
 * Đây là đường xuất lead DUY NHẤT của repo (`docs/migration/G-lead-migration-plan.md:119`,
 * grep khớp: chỉ `leads-table.tsx:375` trỏ tới). Nên mọi bất biến về "ai được cầm file PII
 * lead" phải được ghim ở đây, không có chỗ thứ hai để ghim.
 *
 * Bốn điều file này pin — không test nào khác pin được:
 *
 * 1. **[L-A3] Cổng là AND, không phải thay thế.** `docs/prd/A-nen-tang.md` §6.3 bước 1 viết
 *    rõ: nếu ai đó THAY `leads:view-all` bằng `leads:export`, một người neo vai tại HO mà
 *    **không có `leads:*` nào** rơi vào nhánh `lib/db-scope.ts:236` (`!hasAnyPermissionForModel`
 *    → `isHoLevel` → `"ALL"`) ⇒ xuất được lead **toàn hệ thống**. Test "có cả hai thì 200"
 *    một mình KHÔNG bắt được lỗi đó; phải có nhánh "thiếu `leads:view-all` → 403".
 * 2. **[L-A8] Phạm vi dữ liệu do `scopedDb` quyết, không do query string.** `@/lib/db` được
 *    mock trả về DƯ dữ liệu: ai đó đổi `scopedDb(actor).lead` thành `db.lead` là file này đỏ,
 *    chứ không phải "vẫn xanh vì vẫn ra file".
 * 3. **Không rò khi bị từ chối.** 403 phải xảy ra TRƯỚC khi một dòng lead nào rời DB —
 *    kiểm bằng `findMany` chưa được gọi, không bằng mã trạng thái.
 * 4. **[A-03-6] Trần 5000 không được cắt im lặng.**
 *
 * Bản thân file .xlsx được ĐỌC LẠI bằng SheetJS rồi đối chiếu nội dung ô — không kiểm bằng
 * `Content-Type`, vì header đúng mà thân file vẫn là CSV thì Excel báo hỏng ở tay người dùng.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { MASKED_TEXT } from "@/lib/lead/pii";

type LeadRow = {
  id: string;
  parentName: string;
  phone: string;
  email: string | null;
  childName: string | null;
  childAge: number | null;
  status: string;
  source: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  note: string | null;
  consentMarketing: boolean;
  createdAt: Date;
  center: { name: string } | null;
  assignedTo: { name: string } | null;
};
type Fixture = LeadRow & { centerId: string };
type FindManyArgs = {
  where?: Record<string, unknown>;
  take?: number;
  orderBy?: unknown;
  select?: unknown;
};

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; name?: string | null } } | null,
  /** Tập quyền của phiên đang thử — mỗi test tự đặt. */
  granted: new Set<string>(),
  canViewPii: true,
  /** Tầm nhìn cơ sở mà `scopedDb` sẽ áp (giả lập `injectScope`). */
  visible: "ALL" as "ALL" | string[],
  requireLiveSession: vi.fn(),
  checkPermission: vi.fn(),
  canViewLeadPii: vi.fn(),
  resolveActor: vi.fn(),
  scopedFindMany: vi.fn(),
  /** Đường DB trần — cố ý trả DƯ dữ liệu để bắt kẻ bỏ qua scopedDb. */
  rawFindMany: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/auth/live-session", () => ({ requireLiveSession: h.requireLiveSession }));
vi.mock("@/lib/auth/check-permission", () => ({
  checkPermission: h.checkPermission,
  canViewLeadPii: h.canViewLeadPii,
}));
vi.mock("@/lib/auth/actor", () => ({ resolveActor: h.resolveActor }));
vi.mock("@/lib/db-scope", () => ({
  scopedDb: (actor: unknown) => ({ lead: { findMany: (args: FindManyArgs) => h.scopedFindMany(actor, args) } }),
}));
vi.mock("@/lib/db", () => ({ db: { lead: { findMany: h.rawFindMany } } }));
vi.mock("@/lib/audit/audit-log", () => ({ writeAudit: h.writeAudit }));

import { GET } from "./route";

const BASE = "https://admin.satarobo.vn/api/admin/leads/export";

function lead(id: string, centerId: string, over: Partial<Fixture> = {}): Fixture {
  return {
    id,
    centerId,
    parentName: `Phụ huynh ${id}`,
    phone: "0900000001",
    email: `${id}@example.com`,
    childName: `Bé ${id}`,
    childAge: 8,
    status: "NEW",
    source: "WEBSITE",
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    note: "Ghi chú tư vấn",
    consentMarketing: true,
    createdAt: new Date("2026-08-20T03:00:00Z"),
    center: { name: centerId === "c1" ? "Cơ sở 1" : "Cơ sở 2" },
    assignedTo: { name: "Sale A" },
    ...over,
  };
}

/** 2 lead CS1 + 1 lead CS2 — đủ để phân biệt "lọc đúng" với "trả hết". */
const LEADS: Fixture[] = [lead("l1", "c1"), lead("l2", "c1"), lead("l3", "c2")];

function strip(rows: Fixture[]): LeadRow[] {
  return rows.map(({ centerId: _bo, ...rest }) => rest);
}

async function readWorkbook(res: Response) {
  const ab = await res.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(ab), { type: "array" });
  const sheet = (name: string): unknown[][] => {
    const ws = wb.Sheets[name];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
  };
  return { names: wb.SheetNames, sheet };
}

const call = (url = BASE) => GET(new NextRequest(url));

beforeEach(() => {
  vi.clearAllMocks();
  h.session = { user: { id: "u-1", name: "Quản lý CS1" } };
  h.granted = new Set(["leads:view-all", "leads:export"]);
  h.canViewPii = true;
  h.visible = ["c1"];

  h.requireLiveSession.mockImplementation(async () => h.session);
  h.checkPermission.mockImplementation(async (action: string) => h.granted.has(action));
  h.canViewLeadPii.mockImplementation(async () => h.canViewPii);
  h.resolveActor.mockImplementation(async (userId: string) => ({
    userId,
    isSuperAdmin: false,
    isHoLevel: false,
    visibleCenterIds: h.visible === "ALL" ? [] : h.visible,
  }));
  // Giả lập injectScope: chỉ trả lead thuộc tầm nhìn cơ sở của actor, rồi mới `take`.
  h.scopedFindMany.mockImplementation(async (_actor: unknown, args: FindManyArgs) => {
    const rows = LEADS.filter((l) => h.visible === "ALL" || h.visible.includes(l.centerId));
    return strip(args.take != null ? rows.slice(0, args.take) : rows);
  });
  // Đường trần KHÔNG cách ly — nếu route dùng nó, lead CS2 sẽ lọt vào file.
  h.rawFindMany.mockImplementation(async () => strip(LEADS));
  h.writeAudit.mockResolvedValue(undefined);
});

// ─── [L-A3] Cổng quyền: AND, không phải thay thế ────────────────────────────

describe("[A-03-2 · L-A3] cổng export = leads:view-all AND leads:export", () => {
  it("chưa đăng nhập → 401, KHÔNG đọc lead nào", async () => {
    h.session = null;

    const res = await call();

    expect(res.status).toBe(401);
    expect(h.scopedFindMany).not.toHaveBeenCalled();
  });

  it("chỉ có leads:view-all (thiếu leads:export) → 403, KHÔNG đọc lead nào", async () => {
    h.granted = new Set(["leads:view-all", "leads:view-pii"]);

    const res = await call();

    expect(res.status).toBe(403);
    expect(h.scopedFindMany).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
  });

  it("🔴 chỉ có leads:export (thiếu leads:view-all) → 403 — đây là nhánh chống 'thay thế'", async () => {
    // Người neo vai tại HO không có `leads:*` nào: nếu cổng bị viết thành THAY THẾ thì
    // actor này rơi vào `lib/db-scope.ts:236` → isHoLevel → "ALL" → xuất toàn hệ thống.
    h.granted = new Set(["leads:export"]);

    const res = await call();

    expect(res.status).toBe(403);
    expect(h.scopedFindMany).not.toHaveBeenCalled();
  });

  it("không có quyền nào → 403", async () => {
    h.granted = new Set<string>();

    expect((await call()).status).toBe(403);
    expect(h.scopedFindMany).not.toHaveBeenCalled();
  });

  it("cổng hỏi ĐÚNG hai khoá này (không phải leads:view-own / leads:import)", async () => {
    await call();

    const asked = h.checkPermission.mock.calls.map((c) => c[0] as string);
    expect(asked).toContain("leads:view-all");
    expect(asked).toContain("leads:export");
  });

  it("có CẢ HAI → 200 + file .xlsx", async () => {
    const res = await call();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment; filename="leads-\d{4}-\d{2}-\d{2}\.xlsx"/);
  });
});

// ─── [L-A8] Cách ly cơ sở của FILE xuất ra ──────────────────────────────────

describe("[A-03-4 · L-A8] file chỉ chứa lead trong visibleCenterIds", () => {
  it("QLCS chỉ thấy CS1 → file không có một dòng nào của CS2", async () => {
    h.visible = ["c1"];

    const { sheet } = await readWorkbook(await call());
    const flat = JSON.stringify(sheet("Leads"));

    expect(flat).toContain("l1");
    expect(flat).toContain("l2");
    expect(flat).not.toContain("l3"); // lead CS2
    expect(flat).not.toContain("Cơ sở 2");
  });

  it("QLCS 2 cơ sở khác REGION → thấy đủ cả hai, không thấy cơ sở thứ ba", async () => {
    h.visible = ["c1", "c2"];
    const extra = lead("l9", "c3", { center: { name: "Cơ sở 3" } });
    LEADS.push(extra);
    try {
      const { sheet } = await readWorkbook(await call());
      const flat = JSON.stringify(sheet("Leads"));

      expect(flat).toContain("l3");
      expect(flat).not.toContain("l9");
    } finally {
      LEADS.pop();
    }
  });

  it("đi qua scopedDb(actor) chứ KHÔNG phải db trần", async () => {
    await call();

    expect(h.scopedFindMany).toHaveBeenCalledTimes(1);
    expect(h.rawFindMany).not.toHaveBeenCalled();
    const [actor] = h.scopedFindMany.mock.calls[0] as [{ userId: string }, FindManyArgs];
    // Actor của CHÍNH phiên, không phải id lấy từ query string.
    expect(actor.userId).toBe("u-1");
  });

  it("?centerId= trên URL KHÔNG được vào where (chống IDOR qua query string)", async () => {
    await call(`${BASE}?centerId=c2&center=c2`);

    const [, args] = h.scopedFindMany.mock.calls[0] as [unknown, FindManyArgs];
    expect(JSON.stringify(args.where ?? {})).not.toContain("centerId");
    expect(JSON.stringify(args.where ?? {})).not.toContain("c2");
  });
});

// ─── Nội dung file: giữ nguyên phần đã đúng (mask PII · watermark · audit) ──

describe("[A-03-5] phần đã có sẵn không được rơi rụng khi đổi định dạng", () => {
  it("người CÓ leads:view-pii → thấy số thật (mốc đối chứng cho test che bên dưới)", async () => {
    h.canViewPii = true;

    const flat = JSON.stringify((await readWorkbook(await call())).sheet("Leads"));

    expect(flat).toContain("0900000001");
    expect(flat).toContain("Ghi chú tư vấn");
  });

  it("người không có leads:view-pii → SĐT/ghi chú trong file bị che", async () => {
    h.canViewPii = false;

    const { sheet } = await readWorkbook(await call());
    const flat = JSON.stringify(sheet("Leads"));

    // Khẳng định DƯƠNG trước: sheet có dòng thật, nên 2 phủ định dưới không thể
    // "xanh vì rỗng" (bẫy đã gặp: đọc file CSV bằng SheetJS ⇒ sheet "Leads" rỗng).
    expect(flat).toContain(MASKED_TEXT);
    expect(flat).not.toContain("0900000001");
    expect(flat).not.toContain("Ghi chú tư vấn");
  });

  it("watermark nằm ở SHEET RIÊNG `_watermark`, không chen vào sheet dữ liệu", async () => {
    const { names, sheet } = await readWorkbook(await call());

    expect(names).toContain("Leads");
    expect(names).toContain("_watermark");
    const wm = JSON.stringify(sheet("_watermark"));
    expect(wm).toContain("Xuất bởi");
    expect(wm).toContain("u-1");
    // Sheet dữ liệu chỉ có tiêu đề + dòng lead, không có dòng watermark lạc.
    expect(JSON.stringify(sheet("Leads"))).not.toContain("Xuất bởi");
  });

  it("bộ cột CỐ ĐỊNH — không theo tuỳ chọn cột của người xuất", async () => {
    const { sheet } = await readWorkbook(await call(`${BASE}?cols=id,phone&fields=phone`));
    const header = sheet("Leads")[0] as unknown[];

    expect(header).toEqual([
      "ID", "Phụ huynh", "SĐT", "Email", "Tên con", "Tuổi",
      "Trạng thái", "Nguồn", "UTM Source", "UTM Medium", "UTM Campaign",
      "Cơ sở", "Phụ trách", "Ghi chú", "Ngày đăng ký",
    ]);
  });

  it("mỗi lần xuất để lại một dòng audit EXPORT", async () => {
    await call();

    expect(h.writeAudit).toHaveBeenCalledTimes(1);
    const [arg] = h.writeAudit.mock.calls[0] as [{ action: string; module: string; newValues: Record<string, unknown> }];
    expect(arg.action).toBe("EXPORT");
    expect(arg.module).toBe("leads");
    expect(arg.newValues).toMatchObject({ count: 2, piiMasked: false });
  });
});

// ─── [A-03-6] Trần 5000 dòng không được im lặng ─────────────────────────────

describe("[A-03-6] chạm trần 5000 dòng phải báo rõ", () => {
  beforeEach(() => {
    const many: Fixture[] = Array.from({ length: 5100 }, (_, i) => lead(`m${i}`, "c1"));
    h.scopedFindMany.mockImplementation(async (_actor: unknown, args: FindManyArgs) =>
      strip(args.take != null ? many.slice(0, args.take) : many),
    );
  });

  it("file cắt đúng 5000 dòng dữ liệu VÀ nói ra là đã cắt", async () => {
    const { sheet } = await readWorkbook(await call());

    expect(sheet("Leads").length).toBe(5001); // 1 tiêu đề + 5000 dòng
    const wm = JSON.stringify(sheet("_watermark"));
    expect(wm).toContain("5000");
    expect(wm.toUpperCase()).toContain("CẮT");
  });

  it("audit ghi lại việc bị cắt (người rà soát sau không bị đánh lừa)", async () => {
    await call();

    const [arg] = h.writeAudit.mock.calls[0] as [{ newValues: Record<string, unknown> }];
    expect(arg.newValues).toMatchObject({ truncated: true, count: 5000 });
  });

  it("dưới trần → KHÔNG có cảnh báo cắt, audit truncated = false", async () => {
    h.scopedFindMany.mockImplementation(async (_actor: unknown, args: FindManyArgs) =>
      strip(args.take != null ? LEADS.slice(0, args.take) : LEADS),
    );

    const { sheet } = await readWorkbook(await call());

    expect(JSON.stringify(sheet("_watermark")).toUpperCase()).not.toContain("CẮT");
    const [arg] = h.writeAudit.mock.calls[0] as [{ newValues: Record<string, unknown> }];
    expect(arg.newValues).toMatchObject({ truncated: false });
  });
});
