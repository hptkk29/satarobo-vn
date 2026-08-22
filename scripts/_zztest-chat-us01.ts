/**
 * ZZTEST — US-01 Chat Realtime Đợt 0: schema Conversation/Participant/Message.
 *
 *   pnpm tsx scripts/_zztest-chat-us01.ts
 *
 * Kiểm 4 AC (theo backlog US-01 + delta 00-dieu-chinh-cho-repo.md):
 *   AC1 — migrate status sạch (schema DB khớp migrations, không pending).
 *   AC2 — @@unique([type, subjectType, subjectId]) từ chối nhóm lớp thứ 2 (P2002).
 *   AC3 — dmKey @unique: 2 insert song song (2 transaction riêng) → đúng 1 thắng, 1 P2002.
 *   AC4 — EXPLAIN "hội thoại của tôi" + "30 tin mới nhất" không Seq Scan trên
 *         ConversationParticipant/Message; nếu planner seq-scan vì bảng quá nhỏ
 *         → fallback kiểm pg_indexes đúng định nghĩa + ghi chú planner-smalltable
 *         (KHÔNG dùng enable_seqscan=off).
 *   AC5 — cleanup try/finally theo prefix, chạy lại được (idempotent).
 *
 * Chạy trên DB dev (theo quy ước ZZTEST của repo) — chỉ tạo record prefix
 * ZZTEST_CHAT_US01_ trên 5 bảng chat MỚI, không đụng dữ liệu khác, xoá sạch khi xong.
 */
import "./_load-env";
import { currentDbHost } from "./_load-env";
import { execSync } from "node:child_process";
import { Prisma, PrismaClient } from "@prisma/client";

// Script chạy ngoài Next: đi session pooler (DIRECT_URL) nếu có — tránh lỗi pgbouncer
// "prepared statement s1 already exists" (42P05) của transaction pooler khi chạy lặp.
const db = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const P = "ZZTEST_CHAT_US01_";
const SUBJECT_ID = `${P}class_A`; // subjectId là String trần — không FK sang Class
const USER_1 = `${P}user_1`;
const USER_2 = `${P}user_2`;
const DM_KEY = `${P}${USER_1}:${USER_2}:DM_TEACHER_PARENT`;

let pass = true;
function report(label: string, ok: boolean, detail: string) {
  pass = pass && ok;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
}

function isP2002(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Xoá mọi record ZZTEST của script này — gọi được nhiều lần (idempotent). */
async function cleanup() {
  const convs = await db.conversation.findMany({
    where: {
      OR: [{ subjectId: { startsWith: P } }, { dmKey: { startsWith: P } }],
    },
    select: { id: true },
  });
  const convIds = convs.map((c) => c.id);
  if (convIds.length === 0) return 0;
  const msgs = await db.message.findMany({
    where: { conversationId: { in: convIds } },
    select: { id: true },
  });
  const msgIds = msgs.map((m) => m.id);
  await db.announcementRead.deleteMany({ where: { messageId: { in: msgIds } } });
  await db.messageAttachment.deleteMany({ where: { messageId: { in: msgIds } } });
  await db.message.deleteMany({ where: { conversationId: { in: convIds } } });
  await db.conversationParticipant.deleteMany({
    where: { conversationId: { in: convIds } },
  });
  await db.conversation.deleteMany({ where: { id: { in: convIds } } });
  return convIds.length;
}

// ---------- AC1: migrate status sạch ----------
function ac1MigrateStatus() {
  // Gộp cả stdout lẫn stderr — prisma in một phần ra stderr khi non-TTY,
  // chỉ đọc stdout có lúc thiếu chuỗi xác nhận (bug lộ ở tổng nghiệm thu Đợt 0).
  let out: string;
  try {
    out = execSync("pnpm exec prisma migrate status 2>&1", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: "cmd.exe",
    });
  } catch (e) {
    const err = e as { stdout?: unknown; stderr?: unknown };
    // Nối stdout + stderr; CHỈ khi cả hai đều rỗng mới rơi về String(e).
    // (Bản cũ viết `${a}\n${b}` || String(e)` — template literal luôn truthy vì có
    // "\n", nên nhánh dự phòng không bao giờ chạy: prisma chết câm thì `out` là "\n"
    // và AC1 báo FAIL mà không kèm lý do.)
    const joined = [err.stdout, err.stderr]
      .map((part) => String(part ?? "").trim())
      .filter(Boolean)
      .join("\n");
    out = joined || String(e);
  }
  const clean = out.includes("Database schema is up to date");
  report(
    "AC1 migrate status",
    clean,
    clean
      ? "Database schema is up to date (183+ migrations, không pending/drift)"
      : `output bất thường:\n${out.slice(-800)}`
  );
}

// ---------- AC2: unique (type, subjectType, subjectId) ----------
async function ac2ClassGroupUnique() {
  await db.conversation.create({
    data: {
      type: "CLASS_GROUP",
      subjectType: "CLASS",
      subjectId: SUBJECT_ID,
      title: `${P}Nhóm lớp A`,
    },
  });
  let rejected = false;
  try {
    await db.conversation.create({
      data: {
        type: "CLASS_GROUP",
        subjectType: "CLASS",
        subjectId: SUBJECT_ID,
        title: `${P}Nhóm lớp A (trùng)`,
      },
    });
  } catch (e) {
    rejected = isP2002(e);
    if (!rejected) throw e;
  }
  report(
    "AC2 unique (type, subjectType, subjectId)",
    rejected,
    rejected ? "nhóm lớp thứ 2 cùng Class bị P2002" : "nhóm lớp thứ 2 TẠO ĐƯỢC — sai!"
  );
}

// ---------- AC3: dmKey unique dưới race 2 transaction song song ----------
async function ac3DmKeyRace() {
  const mk = (title: string) =>
    db.$transaction(async (tx) =>
      tx.conversation.create({
        data: {
          type: "DM_TEACHER_PARENT",
          subjectType: "NONE",
          dmKey: DM_KEY,
          title,
        },
      })
    );
  const results = await Promise.allSettled([mk(`${P}DM_a`), mk(`${P}DM_b`)]);
  const wins = results.filter((r) => r.status === "fulfilled").length;
  const p2002s = results.filter(
    (r) => r.status === "rejected" && isP2002(r.reason)
  ).length;
  const ok = wins === 1 && p2002s === 1;
  report(
    "AC3 dmKey race (2 tx song song)",
    ok,
    `fulfilled=${wins}, P2002=${p2002s} (kỳ vọng 1/1)` +
      (ok
        ? ""
        : ` · lỗi lạ: ${results
            .filter((r) => r.status === "rejected" && !isP2002(r.reason))
            .map((r) => String((r as PromiseRejectedResult).reason))
            .join(" | ")}`)
  );
}

// ---------- AC4: EXPLAIN không Seq Scan (fallback pg_indexes) ----------
type PlanNode = {
  "Node Type"?: string;
  "Relation Name"?: string;
  "Index Name"?: string;
  Plans?: PlanNode[];
};

function findSeqScans(node: PlanNode, targets: string[], hits: string[]) {
  if (node["Node Type"] === "Seq Scan" && targets.includes(node["Relation Name"] ?? "")) {
    hits.push(node["Relation Name"] ?? "?");
  }
  for (const child of node.Plans ?? []) findSeqScans(child, targets, hits);
}

async function explainPlan(sql: Prisma.Sql): Promise<PlanNode> {
  const rows = await db.$queryRaw<Array<{ "QUERY PLAN": unknown }>>(sql);
  const raw = rows[0]?.["QUERY PLAN"];
  const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  const plan = (first as { Plan?: PlanNode } | undefined)?.Plan;
  if (!plan) throw new Error("Không đọc được QUERY PLAN từ EXPLAIN");
  return plan;
}

async function ac4Indexes(convId: string) {
  // Seed thêm dữ liệu để planner có cửa chọn index (bảng rỗng → luôn seq scan)
  await db.conversationParticipant.createMany({
    data: Array.from({ length: 80 }, (_, i) => ({
      conversationId: convId,
      userId: i === 0 ? USER_1 : `${P}filler_u${i}`,
    })),
    skipDuplicates: true,
  });
  await db.message.createMany({
    data: Array.from({ length: 200 }, (_, i) => ({
      conversationId: convId,
      senderId: USER_1,
      body: `${P}msg ${i}`,
      clientMsgId: `${P}cmid_${i}`,
    })),
    skipDuplicates: true,
  });

  const planMy = await explainPlan(
    Prisma.sql`EXPLAIN (FORMAT JSON) SELECT "conversationId" FROM "ConversationParticipant" WHERE "userId" = ${USER_1} AND "leftAt" IS NULL`
  );
  const plan30 = await explainPlan(
    Prisma.sql`EXPLAIN (FORMAT JSON) SELECT id, body, "createdAt" FROM "Message" WHERE "conversationId" = ${convId} ORDER BY "createdAt" DESC LIMIT 30`
  );

  const seqHits: string[] = [];
  findSeqScans(planMy, ["ConversationParticipant"], seqHits);
  findSeqScans(plan30, ["Message"], seqHits);

  if (seqHits.length === 0) {
    report(
      "AC4 EXPLAIN",
      true,
      "cả 2 query dùng index, không Seq Scan trên ConversationParticipant/Message"
    );
    return;
  }

  // Fallback cho phép theo đề bài: planner chọn seq scan vì bảng quá nhỏ.
  // KHÔNG ép enable_seqscan=off — thay bằng kiểm pg_indexes đúng định nghĩa.
  const idx = await db.$queryRaw<Array<{ indexname: string; indexdef: string }>>(
    Prisma.sql`SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('ConversationParticipant','Message') ORDER BY indexname`
  );
  // So khớp trên indexdef ĐÃ BỎ nháy kép: Postgres không quote identifier
  // lowercase (vd cột enum `kind`) nên so chuỗi có nháy sẽ trượt oan.
  const def = (name: string) =>
    (idx.find((r) => r.indexname === name)?.indexdef ?? "").replace(/"/g, "");
  const okMy = def("ConversationParticipant_userId_leftAt_idx").includes("(userId, leftAt)");
  const ok30 = def("Message_conversationId_createdAt_idx").includes(
    "(conversationId, createdAt DESC)"
  );
  const okKind = def("Message_conversationId_kind_createdAt_idx").includes(
    "(conversationId, kind, createdAt DESC)"
  );
  report(
    "AC4 index (fallback planner-smalltable)",
    okMy && ok30 && okKind,
    `Seq Scan trên [${seqHits.join(", ")}] vì bảng nhỏ (planner-smalltable — chấp nhận theo đề bài); ` +
      `pg_indexes: userId_leftAt=${okMy} · conv_createdAt_DESC=${ok30} · conv_kind_createdAt_DESC=${okKind}`
  );
}

async function main() {
  console.log(`DB host: ${currentDbHost()}`);
  try {
    // Idempotent: dọn rác của lần chạy trước (nếu có) TRƯỚC khi test
    const pre = await cleanup();
    if (pre > 0) console.log(`(dọn ${pre} conversation ZZTEST sót từ lần trước)`);

    ac1MigrateStatus();
    await ac2ClassGroupUnique();
    await ac3DmKeyRace();

    const conv = await db.conversation.findFirst({
      where: { subjectId: SUBJECT_ID },
      select: { id: true },
    });
    if (!conv) throw new Error("Mất conversation seed cho AC4");
    await ac4Indexes(conv.id);
  } finally {
    const n = await cleanup();
    const left = await db.conversation.count({
      where: { OR: [{ subjectId: { startsWith: P } }, { dmKey: { startsWith: P } }] },
    });
    report("AC5 cleanup", left === 0, `đã xoá ${n} conversation ZZTEST, còn sót ${left}`);
    await db.$disconnect();
  }
  console.log(pass ? "\n=> TẤT CẢ PASS" : "\n=> CÓ FAIL");
  process.exitCode = pass ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
