// @vitest-environment node
/**
 * BẤT BIẾN CỦA TRỤC GỌI ĐIỆN — thứ VẪN XANH khi bị phá nếu không canh.
 *
 * Không nhóm nào ở đây kiểm "mã có chạy không". Chúng canh những lần QUÊN: một
 * model rơi khỏi bảng phân loại cách ly, một cột `recordingKey` bị trả thẳng ra
 * trình duyệt, một bước audit bị đảo xuống sau khi đã đọc dữ liệu, một trang thử
 * nằm lại trong nav. Cả bốn đều là hỏng CÂM.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SCOPED_MODELS, NULL_IS_GLOBAL_MODELS, SCOPE_EXEMPT } from "@/lib/db-scope";
import { BACKFILL_SPECS } from "@/lib/org/center-bridge";
import { ALL_ACTIONS } from "@/lib/auth/permissions";
import { ACTION_REGISTRY } from "@/lib/auth/action-registry";
import { SETTING_KEYS } from "@/lib/settings/registry";
import { ROLE_SEED } from "../../prisma/seed-roles";

const ROOT = process.cwd();
const doc = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** Bỏ dòng bình luận để test không tự bắt chính lời giải thích của mình. */
const chiMa = (src: string) =>
  src
    .split("\n")
    .filter((l) => {
      const t = l.trimStart();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("///");
    })
    .join("\n");

const MIGRATION = "prisma/migrations/20260827120000_call_axis_omicall/migration.sql";
const sql = doc(MIGRATION);
const sqlMa = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

// ───────────────────────────────────────────────────────────────────────────
describe("Migration CHỈ-THÊM (luật cứng #4)", () => {
  it("tạo đúng 3 bảng", () => {
    const tables = [...sqlMa.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]).sort();
    expect(tables).toEqual(["CallDoNotCall", "CallExtension", "CallLog"]);
  });

  it("0 DROP, 0 ALTER COLUMN — không đụng bảng đang có dữ liệu PROD", () => {
    expect(sqlMa).not.toMatch(/\bDROP\b/);
    expect(sqlMa).not.toMatch(/ALTER COLUMN/);
  });

  it("mọi ALTER TABLE chỉ để BẬT RLS trên chính 3 bảng mới", () => {
    const alters = [...sqlMa.matchAll(/ALTER TABLE "(\w+)"[^\n;]*/g)].map((m) => m[0]);
    expect(alters.length).toBe(3);
    for (const a of alters) expect(a).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });

  it("cả 3 bảng đều BẬT RLS — bảng mới ra đời không tự có (sự cố 09/08)", () => {
    for (const t of ["CallLog", "CallExtension", "CallDoNotCall"]) {
      expect(sqlMa).toContain(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`);
    }
  });

  it("OC-1 — có UNIQUE (provider, providerCallId)", () => {
    expect(sqlMa).toMatch(
      /CREATE UNIQUE INDEX "CallLog_provider_providerCallId_key" ON "CallLog"\("provider", "providerCallId"\)/,
    );
  });

  it("mọi cột thời gian là `TIMESTAMPTZ(6)`, KHÔNG có TIMESTAMP(3)", () => {
    expect(sqlMa).not.toMatch(/TIMESTAMP\(3\)/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("Cách ly cơ sở — không model nào rơi khỏi bảng phân loại", () => {
  it("CallLog ∈ SCOPED_MODELS", () => {
    expect(SCOPED_MODELS.has("CallLog")).toBe(true);
  });

  it("CallLog ∈ NULL_IS_GLOBAL_MODELS — hàng đợi mồ côi KHÔNG được tàng hình", () => {
    // `centerId = NULL` ở đây nghĩa là "chưa đối khớp được cơ sở" (tiền lệ
    // BankTransaction). Ẩn nhóm này khỏi chính người phải gán nó là làm mất đúng
    // thứ họ cần xử lý — và OC-12 đòi cuộc gọi mồ côi phải xuất hiện ở hàng đợi.
    expect(NULL_IS_GLOBAL_MODELS.has("CallLog")).toBe(true);
  });

  it("CallExtension ∈ SCOPE_EXEMPT (bảng ÁNH XẠ hạ tầng, không phải dữ liệu nghiệp vụ)", () => {
    // Scope bảng này theo cơ sở là tự bắn chân: CDR của một máy nhánh CS2 về mà
    // người xử lý ở CS1 thì không tra nổi chủ máy nhánh ⇒ không gán được cuộc gọi.
    expect(SCOPE_EXEMPT.has("CallExtension")).toBe(true);
    expect(SCOPED_MODELS.has("CallExtension")).toBe(false);
  });

  it("CallDoNotCall KHÔNG có centerId ⇒ không nằm ở bảng phân loại nào", () => {
    // Khách nói "đừng gọi tôi" là nói với công ty. Gắn cơ sở vào là mở đường cho
    // cơ sở khác gọi lại đúng người vừa từ chối.
    expect(SCOPED_MODELS.has("CallDoNotCall")).toBe(false);
    expect(SCOPE_EXEMPT.has("CallDoNotCall")).toBe(false);
    expect(sqlMa).toMatch(/CREATE TABLE "CallDoNotCall"[\s\S]*?\);/);
    const block = sqlMa.match(/CREATE TABLE "CallDoNotCall"([\s\S]*?)\);/)?.[1] ?? "";
    expect(block).not.toContain("centerId");
    expect(block).not.toContain("orgUnitId");
  });

  it("hai bảng mang cả centerId + orgUnitId đều khai vào BACKFILL_SPECS", () => {
    // Quên khai ⇒ cron đối soát đêm lặng lẽ bỏ qua bảng, và test [US-07-IT-08b]
    // đỏ — nhưng nó cần Postgres nên hay bị skip ở local. Canh thêm ở đây.
    const models = BACKFILL_SPECS.map((s) => s.model);
    expect(models).toContain("CallLog");
    expect(models).toContain("CallExtension");
    expect(models).not.toContain("CallDoNotCall");
  });

  it("CallLog xếp nhóm NULL_CHUA_KHOP, CallExtension xếp BAT_BUOC", () => {
    const byModel = new Map(BACKFILL_SPECS.map((s) => [s.model, s]));
    expect(byModel.get("CallLog")?.nullMeaning).toBe("NULL_CHUA_KHOP");
    expect(byModel.get("CallLog")?.scoped).toBe(true);
    expect(byModel.get("CallExtension")?.nullMeaning).toBe("BAT_BUOC");
    expect(byModel.get("CallExtension")?.scoped).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("Quyền — OC-19 / BM-2", () => {
  const KEYS = [
    "calls:make",
    "calls:view-own",
    "calls:view-all",
    "calls:listen-recording",
    "calls:export",
    "calls:assign",
  ];

  it("6 key có trong ma trận v1 (nếu không, mọi grant mang key này bị vứt IM LẶNG)", () => {
    for (const k of KEYS) expect(ALL_ACTIONS).toContain(k);
  });

  it("6 key có trong ACTION_REGISTRY (gán RolePermission mới hợp lệ)", () => {
    for (const k of KEYS) expect(ACTION_REGISTRY).toContain(k);
  });

  it("`calls:listen-recording` KHÔNG mặc định cho Sale (BM-2)", () => {
    const perms = doc("lib/auth/permissions.ts");
    const dong = perms.match(/"calls:listen-recording":\s*\[([^\]]*)\]/)?.[1] ?? "";
    expect(dong).not.toContain("SALES_CSM");
    expect(dong).toContain("SUPER_ADMIN");
    expect(dong).toContain("CENTER_MANAGER");
  });

  it("seed-roles KHÔNG cấp quyền nghe ghi âm cho vai Sale", () => {
    // Đọc thẳng ROLE_SEED thay vì cắt chuỗi nguồn: bản cắt chuỗi đầu tiên tưởng
    // "khối vai" kết thúc ở `},\n{` nên nó nuốt cả phần còn lại của tệp và test
    // XANH GIẢ theo chiều ngược (báo đỏ nhầm). Dữ liệu có sẵn thì đừng parse text.
    const byCode = new Map(ROLE_SEED.map((r) => [r.code, r.perms.map((p) => p.action)]));
    for (const vai of ["HO_SALE", "CENTER_SALES_CSM"]) {
      const perms = byCode.get(vai);
      expect(perms, `không tìm thấy vai ${vai} trong ROLE_SEED`).toBeDefined();
      expect(perms, vai).not.toContain("calls:listen-recording");
    }
  });

  it("hai vai quản lý CÓ quyền nghe ghi âm (không siết nhầm thành không ai nghe được)", () => {
    const byCode = new Map(ROLE_SEED.map((r) => [r.code, r.perms.map((p) => p.action)]));
    for (const vai of ["SUPER_ADMIN", "CENTER_MANAGER"]) {
      expect(byCode.get(vai), vai).toContain("calls:listen-recording");
    }
  });

  it("mọi quyền calls:* seed ở scope GLOBAL — CENTER là khoá cửa chính trên prod", () => {
    // Bài học ghi trong `lib/auth/page-gates.ts`: `can()` v2 trả FALSE khi scope
    // CENTER mà call-site gọi trần. Cách ly cơ sở đến từ `scopedDb`, không từ scopeType.
    for (const r of ROLE_SEED) {
      for (const p of r.perms) {
        if (p.action.startsWith("calls:")) {
          expect(p.scopeType, `${r.code} · ${p.action}`).toBe("GLOBAL");
        }
      }
    }
  });

  it("KHÔNG dùng grant DENY ở đâu trong module (can() v2 bỏ qua DENY IM LẶNG)", () => {
    for (const f of [
      "lib/calls/nghe-ghi-am.ts",
      "lib/calls/muc-dich.ts",
      "lib/calls/nap-cdr.ts",
    ]) {
      expect(chiMa(doc(f))).not.toMatch(/\bDENY\b/);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("OC-3 — không bao giờ trả liên kết ghi âm THÔ ra trình duyệt", () => {
  const NGHE = doc("lib/calls/nghe-ghi-am.ts");
  const ROUTE = doc("app/api/calls/ghi-am/route.ts");

  it("đường nghe ký URL từ kho RIÊNG, không đọc URL nhà cung cấp", () => {
    expect(chiMa(NGHE)).toContain("kyUrlNgheGhiAm");
    expect(chiMa(NGHE)).not.toContain("nguonGhiAm");
    expect(chiMa(NGHE)).not.toContain("recording_url");
  });

  it("đường nghe KHÔNG chạm bucket công khai", () => {
    for (const cam of ["getR2Bucket", "getR2PublicUrl", "getPublicUrl", "signedMediaUrl"]) {
      expect(chiMa(NGHE), cam).not.toContain(cam);
      expect(chiMa(ROUTE), cam).not.toContain(cam);
    }
  });

  it("đường nghe KHÔNG phụ thuộc cờ MEDIA_SIGNED_URL (OC-17)", () => {
    // `resolveMediaUrl()` bị gate bởi cờ mặc định OFF — dùng nó là trả URL TRẦN.
    expect(chiMa(NGHE)).not.toContain("resolveMediaUrl");
    expect(chiMa(NGHE)).not.toContain("isMediaSignedUrlEnabled");
  });

  it("route trả URL đã ký + `no-store` (cache không được sống lâu hơn vé)", () => {
    expect(ROUTE).toContain('"Cache-Control": "no-store"');
    expect(chiMa(ROUTE)).not.toMatch(/max-age=\d+/);
  });
});

describe("OC-3 — audit ghi TRƯỚC, cấp URL SAU", () => {
  const NGHE = chiMa(doc("lib/calls/nghe-ghi-am.ts"));

  it("`writeAudit` xuất hiện TRƯỚC `kyUrlNgheGhiAm` trong nguồn", () => {
    // Ghi vết sau khi đã cấp URL nghĩa là một lần `writeAudit` hỏng = một lượt
    // nghe không để lại dấu. Khuôn đúng đã có ở `lib/chat/admin.ts`.
    const iAudit = NGHE.indexOf("writeAudit");
    const iKy = NGHE.indexOf("kyUrlNgheGhiAm");
    expect(iAudit).toBeGreaterThan(-1);
    expect(iKy).toBeGreaterThan(-1);
    expect(iAudit).toBeLessThan(iKy);
  });

  it("ghi audit hỏng ⇒ AUDIT_FAILED và KHÔNG cấp URL", () => {
    expect(NGHE).toContain("AUDIT_FAILED");
  });

  it("kiểm quyền bằng `can()`, không so role/centerId tay (luật Nền Hệ thống #1)", () => {
    expect(NGHE).toContain('can(actor, "calls:listen-recording"');
    expect(NGHE).not.toMatch(/\.role\s*===/);
    expect(NGHE).not.toMatch(/\.roles\.includes\(/);
    expect(NGHE).not.toMatch(/centerId\s*===/);
  });

  it("đòi LÝ DO ≥ 10 ký tự (khuôn của `lib/chat/admin.ts`)", () => {
    expect(NGHE).toMatch(/reason[\s\S]{0,120}min\(10/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("Webhook CDR — chép nguyên khuôn lib/lead/webhook.ts:260-338", () => {
  const WH_FULL = chiMa(doc("lib/calls/webhook.ts"));
  // Chỉ soi THÂN của `xuLyWebhookCdr`. Bản đầu soi cả tệp và đỏ nhầm vì
  // `kiemBiMatWebhook` xuất hiện ở chỗ ĐỊNH NGHĨA hàm (phía trên) trước khi được
  // GỌI trong pipeline — thứ tự cần canh là thứ tự GỌI, không phải thứ tự khai.
  const WH = WH_FULL.slice(WH_FULL.indexOf("export async function xuLyWebhookCdr"));

  it("có đủ 7 bước, ĐÚNG THỨ TỰ", () => {
    const buoc = [
      "rateLimit(",            // 1. giới hạn tần suất
      "content-length",        // 2. chặn thân quá lớn
      "kiemBiMatWebhook",      // 3. kiểm bí mật fail-closed
      "req.text()",            // 4. đọc thân thô ĐÚNG MỘT LẦN
      "kiemChuKy",             // 5. kiểm chữ ký
      "logWebhookDelivery(",   // 6. ghi WebhookDelivery TRƯỚC khi xử lý
      "markWebhookDelivery(",  // 7. đánh dấu kết quả
    ];
    let truoc = -1;
    for (const b of buoc) {
      const i = WH.indexOf(b);
      expect(i, `thiếu bước: ${b}`).toBeGreaterThan(-1);
      expect(i, `sai thứ tự tại: ${b}`).toBeGreaterThan(truoc);
      truoc = i;
    }
  });

  it("có trạng thái DUPLICATE riêng (OC-1: không cộng KPI lần hai)", () => {
    expect(WH).toContain('"DUPLICATE"');
  });

  it("nhét mã giao dịch nhà cung cấp vào `WebhookDelivery.externalId`", () => {
    expect(WH).toMatch(/externalId:\s*maCuocGoi/);
  });

  it("thiếu secret trên production ⇒ 503; chữ ký sai ⇒ 401", () => {
    expect(WH).toContain("503");
    expect(WH).toContain("401");
  });

  it("payload hợp lệ LUÔN trả 200 (tránh provider retry bão)", () => {
    expect(WH).toContain("httpStatus: 200");
  });

  it("đọc thân thô ĐÚNG MỘT LẦN — chữ ký tính trên byte gốc", () => {
    expect((WH.match(/req\.text\(\)/g) ?? []).length).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("Trang thử SDK (§5.2) — dựng sẵn, và phải XOÁ ĐƯỢC", () => {
  const SPIKE = doc("app/(admin)/admin/_spike/omicall/page.tsx");

  it("ghi rõ đây là trang THỬ và phải xoá sau khi có kết luận", () => {
    expect(SPIKE).toMatch(/TRANG THỬ/);
    expect(SPIKE).toMatch(/XOÁ|XÓA/);
  });

  it("có cổng quyền — không để hở một trang gọi điện", () => {
    // Cổng cấp TRANG của repo là `checkAnyPermission` (nó gọi `resolveActor` rồi
    // `can()` bên trong). Gọi `can()` trần ở page.tsx thì phải tự dựng Actor —
    // đúng loại "kiểm quyền tự chế" mà luật Nền Hệ thống #1 cấm.
    expect(SPIKE).toContain("checkAnyPermission");
    expect(SPIKE).toContain("calls:make");
    // Và không có nhánh so role/centerId tay.
    expect(SPIKE).not.toMatch(/\.role\s*===/);
    expect(SPIKE).not.toMatch(/centerId\s*===/);
  });

  it("KHÔNG đụng bảng nào (spec: không schema, không bảng)", () => {
    for (const cam of ["@/lib/db", "scopedDb", "prisma", "callLog"]) {
      expect(chiMa(SPIKE), cam).not.toContain(cam);
    }
  });

  it("KHÔNG vào thanh điều hướng", () => {
    const nav = doc("components/admin/sidebar.tsx");
    expect(nav).not.toContain("_spike");
    expect(nav).not.toContain("omicall");
  });

  it("segment `_spike` KHÔNG khai vào ADMIN_ROUTE_SEGMENTS", () => {
    // Cố ý: trang thử không được là một địa chỉ hợp lệ của site admin. Người chạy
    // spike mở nó ở local/preview, không mở trên prod.
    const rp = doc("lib/auth/route-policy.ts");
    expect(rp).not.toContain('"_spike"');
  });

  it("nạp SDK ĐỘNG (không `<script>` chặn render)", () => {
    const client = doc("app/(admin)/admin/_spike/omicall/spike-client.tsx");
    expect(client).toContain("document.createElement");
    expect(client).toContain("async");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("Công tắc & cờ", () => {
  it("5 tham số vận hành khai trong registry (§2.3 — vào registry, không vào env)", () => {
    for (const k of [
      "calls.live",
      "calls.recordingAnnouncement",
      "calls.recordingRetentionMonths",
      "calls.minTalkSecondsForContacted",
      "calls.listenUrlTtlSeconds",
    ]) {
      expect(SETTING_KEYS as readonly string[]).toContain(k);
    }
  });

  it("cờ OMICALL_ENABLED mặc định OFF", () => {
    const flags = doc("lib/flags.ts");
    expect(flags).toContain("OMICALL_ENABLED");
    expect(flags).toMatch(/OMICALL_ENABLED === "true"/);
  });

  it("bí mật chỉ ở env, KHÔNG hardcode (luật cứng #9)", () => {
    const provider = chiMa(doc("lib/integrations/omicall/provider.ts"));
    expect(provider).toContain("process.env.OMICALL_API_KEY");
    // Không có chuỗi nào trông như khoá thật bị nhét vào mã.
    expect(provider).not.toMatch(/OMICALL_API_KEY\s*=\s*["'][^"']+["']/);
  });

  it(".env.example khai đủ biến mới, tất cả để RỖNG", () => {
    const env = doc(".env.example");
    for (const k of [
      "OMICALL_API_BASE",
      "OMICALL_API_KEY",
      "OMICALL_TENANT",
      "OMICALL_WEBHOOK_SECRET",
      "R2_CALL_BUCKET_NAME",
    ]) {
      expect(env, k).toMatch(new RegExp(`^${k}=""`, "m"));
    }
  });
});
