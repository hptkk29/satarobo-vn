// S-6 (c) — `components/sale/**` phải nằm TRONG một khối ESLint.
//
// Vì sao cần test này chứ không chỉ sửa config: cấu hình flat của ESLint gắn luật
// theo GLOB TỪNG THƯ MỤC, không thừa hưởng theo cây. `app/(sale)/**` có khối riêng
// (thêm ở Đợt B), nhưng phần giao diện của chính site đó sống ở `components/sale/`
// — nơi KHÔNG khối nào phủ. Hậu quả không phải "code xấu": ở đúng thư mục ấy,
// `import { db } from "@/lib/db"` là HỢP LỆ ⇒ cổng cách ly cơ sở thủng mà lint
// vẫn xanh, và Magic UI / Framer Motion / Recharts vào được một khu quản trị nội bộ.
//
// Site Sale là site NGHIỆP VỤ NỘI BỘ (nhân viên tư vấn đăng nhập làm việc), KHÔNG
// phải trang tiếp thị cho khách. Theo `.claude/rules/ui-libraries.md`: Magic UI +
// Motion là "CLIENT only" (hiệu ứng wow cho marketing) còn Recharts là "ADMIN only".
// Site Sale không thuộc bên nào trọn vẹn nên lấy đúng luật mà `app/(sale)/**` và
// site giáo viên đang chịu: **shadcn THUẦN** — chặn CẢ Magic/Motion (như admin) LẪN
// Recharts (như client) — cộng chặn `@/lib/db` trần.
//
// Mẫu dựng test: `db-restriction.test.ts` (ESLint Node API + filePath giả).
import { describe, it, expect, beforeAll } from "vitest";
import { ESLint } from "eslint";

const eslint = new ESLint();
const RULE = "no-restricted-imports";

const CODE_DB = `import { db } from "@/lib/db"\nexport async function x() { return db }\n`;
const CODE_MOTION = `import { motion } from "framer-motion"\nexport const A = motion\n`;
const CODE_MAGIC = `import { Particles } from "@/components/magic/particles"\nexport const B = Particles\n`;
const CODE_RECHARTS = `import { LineChart } from "recharts"\nexport const C = LineChart\n`;

async function lint(code: string, filePath: string) {
  const [res] = await eslint.lintText(code, { filePath });
  return res.messages.filter((m) => m.ruleId === RULE);
}

// Lần lintText đầu nạp cả config + typescript-eslint (~30s). Warm-up trước.
beforeAll(async () => {
  await lint(CODE_DB, "lib/__warmup_sale__.ts");
}, 90_000);

describe("[S-6c] components/sale/** chịu đúng luật của site Sale", () => {
  it(
    "import @/lib/db trần → lỗi (cổng cách ly cơ sở)",
    { timeout: 60_000 },
    async () => {
      const msgs = await lint(CODE_DB, "components/sale/__s6_new__.tsx");
      expect(msgs.length).toBeGreaterThan(0);
      expect(msgs.map((m) => m.message).join("\n")).toContain("@/lib/db");
    },
  );

  it("import framer-motion → lỗi (khu quản trị dùng shadcn thuần)", async () => {
    const msgs = await lint(CODE_MOTION, "components/sale/__s6_new__.tsx");
    expect(msgs.length).toBeGreaterThan(0);
  });

  it("import @/components/magic/* → lỗi", async () => {
    const msgs = await lint(CODE_MAGIC, "components/sale/__s6_new__.tsx");
    expect(msgs.length).toBeGreaterThan(0);
  });

  it("import recharts → lỗi (Recharts là admin-only, site Sale không kéo vào)", async () => {
    const msgs = await lint(CODE_RECHARTS, "components/sale/__s6_new__.tsx");
    expect(msgs.length).toBeGreaterThan(0);
  });

  it("luật đến TỪ khối glob, không phải mặc định toàn repo (đối chứng)", async () => {
    // Thư mục không được khối nào khai → 0 lỗi. Nếu case này cũng đỏ nghĩa là 4 case
    // trên đang xanh vì lý do khác, và test mất giá trị.
    const msgs = await lint(CODE_DB, "components/__s6_doi_chung__/x.tsx");
    expect(msgs.length).toBe(0);
  });
});

// ── Nửa thứ hai của lỗ hổng: no-inline-authz cũng chỉ phủ `app/**` ─────────────
// File action đặt trong `components/sale/` (site Sale dùng chung giao diện, nên
// action dễ trôi về đây) sẽ không bị 2 tầng no-inline-authz soi. Khai glob TRƯỚC
// khi có file đầu tiên; khai sau thì file đầu tiên viết kiểu gì cũng hợp lệ.
const RULE_AUTHZ_A = "no-restricted-syntax";
const RULE_AUTHZ_B = "authz/require-can-in-write-action";

const CODE_INLINE_AUTHZ = `declare const session: { user: { role: string } };
export async function ghiBua() {
  if (session.user.role !== "SUPER_ADMIN") throw new Error("x");
}
`;
const CODE_GHI_THIEU_CAN = `declare const db: { order: { create: (a: unknown) => Promise<unknown> } };
export async function taoDon() {
  return db.order.create({ data: {} });
}
`;

async function lintAuthz(code: string, filePath: string) {
  const [res] = await eslint.lintText(code, { filePath });
  return res.messages.filter(
    (m) => m.ruleId === RULE_AUTHZ_A || m.ruleId === RULE_AUTHZ_B,
  );
}

describe("[S-6c] file action trong components/sale/** chịu no-inline-authz", () => {
  it("kiểm quyền inline (.role !==) trong _actions.ts → lỗi", async () => {
    const msgs = await lintAuthz(CODE_INLINE_AUTHZ, "components/sale/_actions.ts");
    expect(msgs.some((m) => m.ruleId === RULE_AUTHZ_A)).toBe(true);
  });

  it("action GHI mà không gọi can()/checkPermission() → lỗi", async () => {
    const msgs = await lintAuthz(CODE_GHI_THIEU_CAN, "components/sale/_actions.ts");
    expect(msgs.some((m) => m.ruleId === RULE_AUTHZ_B)).toBe(true);
  });

  it("file giao diện thường (.tsx) KHÔNG bị 2 rule này (đối chứng)", async () => {
    const msgs = await lintAuthz(CODE_GHI_THIEU_CAN, "components/sale/panel.tsx");
    expect(msgs.length).toBe(0);
  });
});
