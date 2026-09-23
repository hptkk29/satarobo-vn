/**
 * scripts/bao-cao-rbac-prod.ts — ĐỌC PROD, KHÔNG GHI GÌ.
 *
 * Trả lời hai câu mà một phép diff tệp KHÔNG trả lời được:
 *
 *   1. "Đã chạy `seed-prod-roles.yml` chưa" — câu hỏi thật ra là **DB prod có khớp với
 *      `ROLE_SEED` trong mã không**. So `4e57a623` với `origin/main` chỉ nói hai TỆP giống
 *      nhau; nó KHÔNG nói DB đang giữ gì. Lượt seed có thể chạy lỗi giữa chừng, có người
 *      chỉnh role qua UI, hoặc lượt seed cuối chạy trên một commit khác hẳn.
 *   2. "Ai thật sự mở được Zalo CRM trên prod" — `can()` v2 trả `true` cho `SUPER_ADMIN`
 *      VÔ ĐIỀU KIỆN (`lib/auth/can.ts`), nên việc quản trị tối cao vào được **không chứng
 *      minh** người khác vào được. Đây đúng là lớp lỗi đã làm mục "Zalo CRM" ẩn 11 ngày mà
 *      mọi ca nghiệm thu vẫn "đạt" (luật 11 — ca khẳng định SỰ VẮNG MẶT luôn đạt khi tính
 *      năng hỏng hoàn toàn).
 *
 * ── BỐN LỚP KHOÁ (cùng khuôn `bao-cao-doi-soat-tien.ts`) ────────────────────────────
 * 1. KHÔNG CÓ CHẾ ĐỘ GHI — tệp này không chứa một lời gọi ghi nào, không cờ `--apply`.
 *    Ca `[RBAC-CD-01]` quét chính tệp này.
 * 2. `SET TRANSACTION READ ONLY` + ROLLBACK canh sẵn — Postgres tự từ chối mọi phép ghi.
 * 3. Chạy bằng USER CHỈ-ĐỌC (`PROD_DATABASE_URL_RO`); workflow cố ý không biết hai secret
 *    đầy quyền.
 * 4. Script TỰ KHAI ai đang kết nối (`_kiem-quyen.ts`).
 *
 * ── ⚠️ LỚP KHOÁ THỨ NĂM, RIÊNG CHO SCRIPT NÀY ──────────────────────────────────────
 * `kiemQuyen()` dùng chung hỏi quyền trên `ClassSession` (tên bảng đóng cứng từ đợt chấm
 * công — nợ đang ghim ở CLAUDE.md). Script này KHÔNG đọc `ClassSession`; nó đọc `RoleDef`,
 * `RolePermission`, `UserOrgRole`, `User`, `OrgUnit`. Thiếu SELECT trên đúng những bảng ấy
 * thì mọi con số dưới đây là **0, và số 0 đó không phải sự thật** — nên `kiemBangDocDuoc()`
 * hỏi thẳng từng bảng mình sắp đọc và DỪNG nếu thiếu. Thà không có báo cáo còn hơn một báo
 * cáo nói "0 vai có quyền" vì lý do sai.
 *
 * ── CHE DỮ LIỆU CÁ NHÂN ─────────────────────────────────────────────────────────────
 * Báo cáo đi vào job summary + artifact, tức RỜI KHỎI vòng kiểm soát của DB. Nên: KHÔNG in
 * họ tên, email che còn 2 ký tự đầu + tên miền. Đếm theo vai × đơn vị là đủ để quyết.
 */
import { writeFileSync } from "node:fs";
import { ROLE_SEED } from "../prisma/seed-roles";
import { scriptDb } from "./_script-db";
import { kiemQuyen } from "./_kiem-quyen";

const db = scriptDb();

const ra: string[] = [];
const in_ = (s = ""): void => {
  ra.push(s);
  console.log(s);
};

/** `an.nguyen@satarobo.vn` → `an…@satarobo.vn`. Đủ để nhận ra người, không đủ để thành danh bạ. */
function cheEmail(e: string | null): string {
  if (!e) return "(không có email)";
  const [ten, mien] = e.split("@");
  if (!mien) return "(email lạ)";
  return `${(ten ?? "").slice(0, 2)}…@${mien}`;
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** Quyền `zalocrm:use` là thứ cổng trang `/zalo-crm` gọi (`page.tsx` → `checkPermission`). */
const QUYEN_ZALOCRM = "zalocrm:use";

// ═══════════════════════════════════════════════════════════════════════════
// CỔNG — đọc được đúng những bảng mình sắp đọc không
// ═══════════════════════════════════════════════════════════════════════════
const BANG_CAN_DOC = ["RoleDef", "RolePermission", "UserOrgRole", "User", "OrgUnit"] as const;

async function kiemBangDocDuoc(): Promise<{ ok: boolean; thieu: string[] }> {
  const thieu: string[] = [];
  for (const b of BANG_CAN_DOC) {
    try {
      // Tên bảng đi vào như THAM SỐ RÀNG BUỘC, không ghép chuỗi: `has_table_privilege` nhận
      // đối số thứ hai kiểu text nên bind được. (Biến thể `Unsafe` của `$queryRaw` nằm trong
      // danh sách cấm của CLAUDE.md.)
      const ten = `public."${b}"`;
      const r = await db.$queryRaw<{ doc: boolean | null }[]>`
        SELECT has_table_privilege(current_user, ${ten}, 'SELECT') AS doc
      `;
      if (r[0]?.doc !== true) thieu.push(b);
    } catch {
      thieu.push(b);
    }
  }
  return { ok: thieu.length === 0, thieu };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHẦN A — DB PROD có khớp `ROLE_SEED` trong mã không
//   Đây là câu trả lời cho "đã chạy seed-prod-roles.yml chưa".
// ═══════════════════════════════════════════════════════════════════════════
async function phanA(tx: Tx): Promise<void> {
  const roles = await tx.roleDef.findMany({
    select: { code: true, isActive: true, permissions: { select: { action: true, scopeType: true } } },
  });

  const tren = (xs: { action: string; scopeType: string }[]): Map<string, string> =>
    new Map(xs.map((p) => [p.action, String(p.scopeType)]));

  const dbTheoVai = new Map(roles.map((r) => [r.code, tren(r.permissions)]));
  const maTheoVai = new Map(ROLE_SEED.map((r) => [r.code, tren(r.perms)]));

  const vaiThieuTrenDb = [...maTheoVai.keys()].filter((c) => !dbTheoVai.has(c));
  const vaiThuaTrenDb = [...dbTheoVai.keys()].filter((c) => !maTheoVai.has(c));

  let soThieu = 0;
  let soThua = 0;
  let soLech = 0;
  const viDu: string[] = [];
  for (const [vai, ma] of maTheoVai) {
    const d = dbTheoVai.get(vai);
    if (!d) continue;
    for (const [act, scope] of ma) {
      const s = d.get(act);
      if (s === undefined) {
        soThieu++;
        if (viDu.length < 12) viDu.push(`\`${vai}\` THIẾU \`${act}\``);
      } else if (s !== scope) {
        soLech++;
        if (viDu.length < 12) viDu.push(`\`${vai}\` · \`${act}\`: DB \`${s}\` ≠ mã \`${scope}\``);
      }
    }
    for (const act of d.keys()) {
      if (!ma.has(act)) {
        soThua++;
        if (viDu.length < 12) viDu.push(`\`${vai}\` THỪA \`${act}\` (không có trong mã)`);
      }
    }
  }

  const khop =
    soThieu === 0 && soThua === 0 && soLech === 0 && vaiThieuTrenDb.length === 0 && vaiThuaTrenDb.length === 0;

  in_(`## A · DB prod **${khop ? "KHỚP" : "LỆCH"}** với \`ROLE_SEED\` trong mã`);
  in_();
  in_(`| | mã (\`prisma/seed-roles.ts\`) | DB prod |`);
  in_(`|---|---|---|`);
  in_(`| số vai | ${maTheoVai.size} | ${dbTheoVai.size} |`);
  in_(
    `| số dòng quyền | ${[...maTheoVai.values()].reduce((a, m) => a + m.size, 0)} | ` +
      `${[...dbTheoVai.values()].reduce((a, m) => a + m.size, 0)} |`,
  );
  in_();

  if (khop) {
    in_(`✅ **Không cần chạy \`seed-prod-roles.yml\`.** Mọi vai × action × scopeType trùng khít.`);
  } else {
    in_(`🔴 **CẦN chạy \`seed-prod-roles.yml\`.** Lệch:`);
    in_();
    in_(`- thiếu trên DB: **${soThieu}** dòng · thừa trên DB: **${soThua}** · lệch scopeType: **${soLech}**`);
    if (vaiThieuTrenDb.length) in_(`- vai có trong mã mà DB chưa có: ${vaiThieuTrenDb.map((v) => `\`${v}\``).join(", ")}`);
    if (vaiThuaTrenDb.length) in_(`- vai có trên DB mà mã không khai: ${vaiThuaTrenDb.map((v) => `\`${v}\``).join(", ")}`);
    in_();
    in_(`Ví dụ (tối đa 12):`);
    for (const v of viDu) in_(`- ${v}`);
    in_();
    in_(
      `⚠️ \`seedRoles()\` **RESET** toàn bộ \`RolePermission\` theo định nghĩa trong mã. Dòng "thừa ` +
        `trên DB" nếu là chỉnh tay qua UI thì nó sẽ **bị xoá** — đối chiếu trước khi chạy.`,
    );
  }
  in_();
}

// ═══════════════════════════════════════════════════════════════════════════
// PHẦN B — `zalocrm:use` trên DB prod THẬT
// ═══════════════════════════════════════════════════════════════════════════
async function phanB(tx: Tx): Promise<string[]> {
  const rows = await tx.rolePermission.findMany({
    where: { action: QUYEN_ZALOCRM },
    select: { scopeType: true, role: { select: { code: true, isActive: true } } },
  });

  in_(`## B · Vai nào giữ \`${QUYEN_ZALOCRM}\` **trên DB prod**`);
  in_();
  if (rows.length === 0) {
    in_(`🔴 **KHÔNG vai nào.** Cổng trang \`/zalo-crm\` gọi \`checkPermission("${QUYEN_ZALOCRM}")\`, nên`);
    in_(`chỉ \`SUPER_ADMIN\` mở được (can() v2 bypass vô điều kiện cho vai đó). Mọi người khác bị đá ra.`);
    in_();
    return [];
  }
  in_(`| vai | scopeType | vai đang bật |`);
  in_(`|---|---|---|`);
  for (const r of rows) in_(`| \`${r.role.code}\` | \`${r.scopeType}\` | ${r.role.isActive ? "có" : "**KHÔNG**"} |`);
  in_();
  in_(
    `⚠️ \`SUPER_ADMIN\` mở được màn này **kể cả khi không có dòng nào ở trên** — \`can()\` v2 trả ` +
      `\`true\` vô điều kiện cho vai đó. Nên bảng này mới là thứ nói ai THẬT SỰ dùng được.`,
  );
  in_();
  return rows.filter((r) => r.role.isActive).map((r) => r.role.code);
}

// ═══════════════════════════════════════════════════════════════════════════
// PHẦN C — ai đang neo những vai đó, ở đơn vị nào
//   Trả lời: "CS2 đã có người dùng được Zalo CRM chưa, hay phải tạo tài khoản mới".
// ═══════════════════════════════════════════════════════════════════════════
async function phanC(tx: Tx, vaiCoQuyen: string[]): Promise<void> {
  in_(`## C · Ai đang giữ các vai đó (ACTIVE, còn hiệu lực)`);
  in_();
  if (vaiCoQuyen.length === 0) {
    in_(`_Bỏ qua — phần B không tìm thấy vai nào._`);
    in_();
    return;
  }

  const bayGio = new Date();
  const gans = await tx.userOrgRole.findMany({
    where: {
      status: "ACTIVE",
      role: { code: { in: vaiCoQuyen } },
      effectiveFrom: { lte: bayGio },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: bayGio } }],
    },
    select: { userId: true, orgUnitId: true, role: { select: { code: true } } },
  });

  if (gans.length === 0) {
    in_(`🔴 **0 người.** Vai có quyền, nhưng KHÔNG ai được neo vai đó ⇒ trên thực tế chỉ`);
    in_(`\`SUPER_ADMIN\` dùng được Zalo CRM. Đây đúng hình dạng sự cố 10/08 (114 tài khoản PARENT`);
    in_(`/ 0 dòng \`UserOrgRole\` — xem CLAUDE.md mục "VAI QUAN HỆ").`);
    in_();
    return;
  }

  const dvIds = [...new Set(gans.map((g) => g.orgUnitId))];
  const dvs = await tx.orgUnit.findMany({
    where: { id: { in: dvIds } },
    select: { id: true, code: true, name: true, type: true },
  });
  const tenDv = new Map(dvs.map((d) => [d.id, `${d.code} (${d.type})`]));

  const uIds = [...new Set(gans.map((g) => g.userId))];
  const us = await tx.user.findMany({
    where: { id: { in: uIds } },
    select: { id: true, email: true, isActive: true },
  });
  const uMap = new Map(us.map((u) => [u.id, u]));

  in_(`| vai | đơn vị neo | số người | đang bật |`);
  in_(`|---|---|---|---|`);
  const gom = new Map<string, { tong: number; bat: number }>();
  for (const g of gans) {
    const k = `${g.role.code}|${tenDv.get(g.orgUnitId) ?? "(đơn vị lạ)"}`;
    const c = gom.get(k) ?? { tong: 0, bat: 0 };
    c.tong++;
    if (uMap.get(g.userId)?.isActive) c.bat++;
    gom.set(k, c);
  }
  for (const [k, c] of [...gom].sort()) {
    const [vai, dv] = k.split("|");
    in_(`| \`${vai}\` | ${dv} | ${c.tong} | ${c.bat} |`);
  }
  in_();

  // Danh sách ngắn, email CHE — đủ để người vận hành biết nhờ ai thử, không thành danh bạ.
  in_(`<details><summary>Danh sách (email che)</summary>`);
  in_();
  in_(`| vai | đơn vị | tài khoản | đang bật |`);
  in_(`|---|---|---|---|`);
  for (const g of gans.slice(0, 40)) {
    const u = uMap.get(g.userId);
    in_(
      `| \`${g.role.code}\` | ${tenDv.get(g.orgUnitId) ?? "?"} | ${cheEmail(u?.email ?? null)} | ` +
        `${u?.isActive ? "có" : "**KHÔNG**"} |`,
    );
  }
  if (gans.length > 40) in_(`| … | | còn ${gans.length - 40} dòng | |`);
  in_();
  in_(`</details>`);
  in_();
}

// ═══════════════════════════════════════════════════════════════════════════
async function main(): Promise<void> {
  const quyen = await kiemQuyen(db);
  in_(`# RBAC trên PROD — báo cáo CHỈ ĐỌC`);
  in_();
  in_(
    `**Kết nối:** user \`${quyen.nguoiDung}\` · ghi được: ` +
      `**${quyen.ghiDuoc === null ? "không kiểm được" : quyen.ghiDuoc ? "CÓ QUYỀN GHI ⚠️" : "KHÔNG (chỉ đọc)"}**`,
  );
  in_();
  if (quyen.ghiDuoc === true) {
    in_(
      `> ⚠️ Kết nối này CÓ QUYỀN GHI. Script không ghi gì, nhưng nếu đây là workflow đo prod thì ` +
        `secret đang trỏ nhầm sang chuỗi đầy quyền.`,
    );
    in_();
  }

  // ⚠️ Cổng riêng của script này — xem chú thích đầu tệp. `kiemQuyen` hỏi `ClassSession`,
  // KHÔNG phải bảng ta đọc, nên một mình nó không đủ.
  const bang = await kiemBangDocDuoc();
  if (!bang.ok) {
    in_(`🔴 **DỪNG — user này KHÔNG đọc được: ${bang.thieu.join(", ")}.**`);
    in_();
    in_(`Mọi con số sẽ là 0, và con số 0 đó **không phải sự thật**. Cấp SELECT cho user chỉ-đọc`);
    in_(`trên những bảng trên rồi chạy lại. Xem \`docs/cham-cong/USER-CHI-DOC-PROD.md\`.`);
    writeFileSync("bao-cao-rbac-prod.md", ra.join("\n"), "utf8");
    process.exitCode = 1;
    return;
  }

  const KET = "__BAO_CAO_XONG__";
  try {
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await phanA(tx);
        const vai = await phanB(tx);
        await phanC(tx, vai);
        throw new Error(KET);
      },
      { timeout: 120_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (!(e instanceof Error) || e.message !== KET) throw e;
  }

  writeFileSync("bao-cao-rbac-prod.md", ra.join("\n"), "utf8");
  console.error("\n[ĐÃ GHI] bao-cao-rbac-prod.md");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
