/**
 * ZZTEST — Kênh realtime MỨC NGƯỜI DÙNG `user:{User.id}` (policy
 * `user_can_receive_own_user_broadcast`, migration 20260809160000).
 *
 *   pnpm exec tsx scripts/_zztest-chat-user-topic.ts
 *
 * ⚠️ VÌ SAO PHẢI CÓ SCRIPT NÀY (điểm mù đã ghi nhận):
 * migration 20260809160000 tự vô hiệu trên Postgres TRẦN (guard `realtime.messages`
 * + role `authenticated`) ⇒ trên CI/DB test local policy KHÔNG TỒN TẠI. Mọi unit test
 * đều mock `@supabase/supabase-js` hoặc mock `broadcastMessages`. Hệ quả: xoá nguyên
 * policy đi thì typecheck + lint + build + toàn bộ unit test VẪN XANH, và bảo đảm
 * "A không nghe lén được kênh của B" hiện KHÔNG có cổng nào khoá. Script này là cổng đó.
 *
 * Kịch bản (Supabase Realtime THẬT + DB dev THẬT):
 *   0. Policy `user_can_receive_own_user_broadcast` có mặt trong `pg_policies`,
 *      và KHÔNG có bất kỳ policy INSERT nào trên `realtime.messages`.
 *   1. A cầm token của CHÍNH MÌNH join `user:{A}` → SUBSCRIBED + nhận `conversation.bumped`.
 *   2. A cầm token của CHÍNH MÌNH join `user:{B}` → BỊ TỪ CHỐI, 0 payload.
 *      ⚠️ THIẾT KẾ CHỐNG "PASS GIẢ": cùng MỘT POST bắn 2 event — một tới `user:{A}`,
 *      một tới `user:{B}` — trong lúc CẢ BA kênh đang mở (A@A, B@B, A@B). Kênh B@B
 *      (chính chủ) PHẢI nhận được event của `user:{B}`; nếu nó không nhận thì bước 2
 *      KHÔNG được tính là pass (chứng tỏ "chẳng có gì để nhận" chứ không phải "bị chặn").
 *      Đồng thời A@A chỉ được nhận ĐÚNG event của mình, không nhận event của B.
 *      Và CHÍNH socket bị đá phải vào được `user:{A}` (loại trừ "client đó vốn không nối
 *      được"), và Realtime phải từ chối TƯỜNG MINH (`isDenied`) — im lặng KHÔNG tính.
 *   3. Token hỏng → không join được `user:{A}`: (a) hết hạn, (b) thiếu claim
 *      `app_user_id`, (c) `app_user_id` là id NGƯỜI KHÁC, (d) ký bằng secret sai.
 *      Kèm ĐỐI CHỨNG: token đúng của A join cùng lúc → SUBSCRIBED (nếu đối chứng cũng
 *      hỏng thì bước 3 vô nghĩa, script báo FAIL).
 *   4. Gửi tin THẬT vào nhóm lớp qua Server Action (`sendChatMessageAsActor`):
 *      B, C (còn hiệu lực) nhận bump; D (đã `leftAt`) KHÔNG nhận; A (người gửi) KHÔNG nhận.
 *      ⚠️ Hai vế "KHÔNG nhận" chỉ tính pass khi kênh của D và của A vừa NHẬN ĐƯỢC một event
 *      mồi bắn thẳng vào kênh riêng của họ (`probeAlive`) — bằng chứng tai còn nghe được.
 *   5. BR-30: payload bump ĐÚNG 4 khoá {conversationId, messageId, kind, at} — không nội
 *      dung tin, không tên/SĐT/email của ai.
 *   6. [bonus] Policy `user:` là PERMISSIVE (OR) — phải KHÔNG nới lỏng `conv:`:
 *      người ngoài hội thoại vẫn bị chặn ở `conv:{id}`, participant vẫn vào được.
 *   7. [bonus] CANARY: kênh `user:{A}` KHÔNG private + anon key thuần → phải bị từ chối
 *      ("Allow public access" bật lại thì kênh người dùng cũng hở).
 *
 * Quy ước ZZTEST: prefix `ZZTEST_CHAT_UTOPIC_`, cleanup try/finally + dọn rác lần chạy
 * trước (idempotent), ép DIRECT_URL, không in giá trị secret nào.
 * CHẠY 2 LẦN — cả 2 lần PASS toàn bộ mới đạt (quy tắc dự án).
 */
import "./_load-env";
import { currentDbHost } from "./_load-env";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import Module from "node:module";
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { v5 as uuidv5 } from "uuid";

// ⚠️ `lib/chat/broadcast.ts` mở đầu bằng `import "server-only"` (chặn service role key lọt
// xuống client). Package đó do Next cấp lúc build, KHÔNG có trong node_modules → chạy dưới
// `tsx` sẽ chết MODULE_NOT_FOUND. Trỏ về stub mà vitest đang dùng (khuôn _zztest-chat-us06).
{
  type ResolveFn = (this: unknown, request: string, ...rest: unknown[]) => string;
  const loader = Module as unknown as { _resolveFilename: ResolveFn };
  const original = loader._resolveFilename;
  const stub = path.resolve(process.cwd(), "tests/stubs/server-only.ts");
  loader._resolveFilename = function (request: string, ...rest: unknown[]): string {
    if (request === "server-only") return stub;
    return original.call(this, request, ...rest);
  };
}

// ⚠️ `lib/chat/messages` bám singleton `@/lib/db` (đọc DATABASE_URL LÚC KHỞI TẠO) — ép đi
// DIRECT_URL (session pooler) TRƯỚC rồi mới dynamic-import, nếu không lần chạy THỨ HAI dính
// 42P05 "prepared statement s1 already exists" của transaction pooler.
// (Static import bị hoist chạy trước dòng gán env → bắt buộc import() động.)
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
const chatModule = import("../lib/chat/messages");
const actorModule = import("../lib/auth/actor");

const db = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const P = "ZZTEST_CHAT_UTOPIC_";
const ROLE_CODE = `${P}PARENT`;
const SLUGS = ["a", "b", "c", "left", "outsider"] as const;
const EMAIL = (x: string) => `zztest-chat-utopic-${x}@zztest.local`;
const EMAILS = SLUGS.map(EMAIL);

/** Dấu vết PII cố ý nhét vào tin + hồ sơ người dùng, để bước 5 đi tìm trong payload. */
const PII_BODY = "ZZTEST_UTOPIC_NOI_DUNG_BI_MAT";
const PII_PHONE = "0912345678";
const PII_NAME_A = `${P}NGUOI_GUI_TEN_RIENG`;

// PHẢI trùng namespace trong lib/chat/realtime-token.ts (file đó `server-only`, không
// import trực tiếp được dưới tsx — mint lại tại đây theo đúng thiết kế mục B của docs).
const SUB_NAMESPACE = "7d5c1af6-2b4e-4c39-9f1d-8a0e3b6d2c91";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

type StepResult = { step: string; pass: boolean; detail: string };
const results: StepResult[] = [];
function report(step: string, pass: boolean, detail: string) {
  results.push({ step, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${step} — ${detail}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitUntil(pred: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (pred()) return true;
    await sleep(150);
  }
  return pred();
}

// ── JWT ─────────────────────────────────────────────────────────────────────

type MintOpts = {
  /** claim `app_user_id`; `null` = bỏ hẳn claim (mô phỏng token dị dạng). */
  appUserId: string | null;
  /** giây so với hiện tại; âm = đã hết hạn. */
  expInSeconds?: number;
  /** ký bằng secret khác (mô phỏng token giả mạo). */
  secret?: string;
};

async function mintToken(opts: MintOpts): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = { role: "authenticated" };
  if (opts.appUserId !== null) claims.app_user_id = opts.appUserId;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(uuidv5(opts.appUserId ?? "zztest-no-claim", SUB_NAMESPACE))
    .setAudience("authenticated")
    .setIssuedAt(iat)
    .setExpirationTime(iat + (opts.expInSeconds ?? 15 * 60))
    .sign(new TextEncoder().encode(opts.secret ?? JWT_SECRET));
}

// ── Realtime helpers ────────────────────────────────────────────────────────

type BroadcastHit = { event: string; payload: Record<string, unknown> };
type Sub = {
  label: string;
  client: SupabaseClient;
  channel: RealtimeChannel;
  statuses: string[];
  hits: BroadcastHit[];
};

const clients: SupabaseClient[] = [];
function newClient(): SupabaseClient {
  const c = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  clients.push(c);
  return c;
}

/**
 * Mở kênh và bắt đầu ghi nhận NGAY (không chờ) — caller tự quyết chờ bao lâu.
 * `opts.reuseClient`: dùng lại ĐÚNG client (đúng socket, đúng token) của một sub khác —
 * để chứng minh "kênh kia hỏng vì POLICY" chứ không phải "client đó vốn không kết nối được".
 */
async function openSub(
  label: string,
  topic: string,
  opts: { jwt?: string; privateChannel: boolean; reuseClient?: SupabaseClient },
): Promise<Sub> {
  const client = opts.reuseClient ?? newClient();
  if (opts.jwt) await client.realtime.setAuth(opts.jwt);
  const channel = client.channel(topic, {
    config: opts.privateChannel ? { private: true } : {},
  });
  const sub: Sub = { label, client, channel, statuses: [], hits: [] };
  channel.on("broadcast", { event: "*" }, (msg) => {
    const m = msg as { event?: string; payload?: unknown };
    sub.hits.push({
      event: String(m.event ?? "?"),
      payload: (m.payload ?? {}) as Record<string, unknown>,
    });
  });
  channel.subscribe((status) => sub.statuses.push(status));
  return sub;
}

/**
 * ⚠️ LỊCH SỬ, không phải "đang sống": mảng `statuses` chỉ được ghi thêm. Hàm này trả true
 * mãi mãi kể từ lần SUBSCRIBED đầu tiên, kể cả khi socket đã chết sau đó. Vì vậy nó KHÔNG
 * đủ để làm đối chứng cho các bước "phải KHÔNG nhận được gì" — chỗ đó phải dùng
 * `probeAlive()` (bắn thật một event rồi bắt buộc nhận được).
 */
function isSubscribed(s: Sub) {
  return s.statuses.includes("SUBSCRIBED");
}
/**
 * "Bị từ chối" = có trạng thái lỗi TƯỜNG MINH từ Realtime và chưa bao giờ SUBSCRIBED.
 *
 * ⚠️ ĐỪNG thay bằng `!isSubscribed(s)`: kênh chưa hề gọi `subscribe()`, hoặc socket không
 * bao giờ nối được, cũng cho `statuses=[]` ⇒ khẳng định "bị chặn" thành PASS GIẢ. Đã kiểm
 * ngược bằng đột biến: bỏ `channel.subscribe()` của kẻ nghe lén thì bước 2b vẫn PASS với
 * `statuses=[]` (tức "A không nghe lén được B" được kết luận trong khi A CHƯA HỀ thử nghe).
 */
function isDenied(s: Sub) {
  return (
    !isSubscribed(s) &&
    s.statuses.some((x) => x === "CHANNEL_ERROR" || x === "CLOSED" || x === "TIMED_OUT")
  );
}
function statusOf(s: Sub) {
  return `${s.label}: statuses=${JSON.stringify(s.statuses)} hits=${s.hits.length}`;
}

/** Bắn MỘT POST service-role mang nhiều topic — đúng đường `broadcastMessages` đang dùng. */
async function serviceBroadcast(
  messages: { topic: string; event: string; payload: Record<string, unknown> }[],
): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages: messages.map((m) => ({ ...m, private: true })) }),
  });
  return res.status;
}

/**
 * ĐỐI CHỨNG SỐNG cho các bước dạng "phải KHÔNG nhận được gì".
 *
 * Bắn một event mồi (service role) thẳng vào kênh RIÊNG của từng người rồi bắt buộc kênh
 * đó nhận được. Nhận được ⇒ tại ĐÚNG khoảng thời gian vừa đo, socket còn sống, token còn
 * hiệu lực, policy vẫn cho họ nghe kênh của chính mình ⇒ con số "0 bump" mới có nghĩa là
 * "server cố ý không gửi", chứ không phải "tai đã điếc".
 *
 * ⚠️ Vì sao bắt buộc: đã kiểm ngược bằng đột biến — ngắt `realtime.disconnect()` kênh của A
 * và của D ngay trước khi gửi tin thì bước 4c + 4d VẪN PASS (16/16) dù chẳng chứng minh gì.
 * `isSubscribed()` không cứu được vì nó đọc LỊCH SỬ trạng thái.
 *
 * @returns map label → đã nhận được mồi hay chưa
 */
async function probeAlive(
  targets: { sub: Sub; userId: string }[],
  mark: string,
): Promise<Map<string, boolean>> {
  const at = new Date().toISOString();
  await serviceBroadcast(
    targets.map((t) => ({
      topic: `user:${t.userId}`,
      event: "conversation.bumped",
      payload: { conversationId: mark, messageId: mark, kind: "CHAT", at },
    })),
  );
  const got = (s: Sub) => s.hits.some((h) => h.payload.messageId === mark);
  await waitUntil(() => targets.every((t) => got(t.sub)), 10_000);
  return new Map(targets.map((t) => [t.sub.label, got(t.sub)]));
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

/** Xoá mọi dấu vết ZZTEST của script này (kể cả rác lần chạy trước) — idempotent. */
async function cleanup(): Promise<void> {
  const convs = await db.conversation.findMany({
    where: { title: { startsWith: P } },
    select: { id: true },
  });
  const convIds = convs.map((c) => c.id);
  if (convIds.length > 0) {
    await db.messageAttachment.deleteMany({
      where: { message: { conversationId: { in: convIds } } },
    });
    await db.message.deleteMany({ where: { conversationId: { in: convIds } } });
    await db.conversationParticipant.deleteMany({
      where: { conversationId: { in: convIds } },
    });
    await db.conversation.deleteMany({ where: { id: { in: convIds } } });
  }

  const users = await db.user.findMany({
    where: { email: { in: EMAILS } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await db.userOrgRole.deleteMany({ where: { userId: { in: userIds } } });
  }

  const role = await db.roleDef.findUnique({ where: { code: ROLE_CODE } });
  if (role) {
    await db.userOrgRole.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.roleDef.delete({ where: { id: role.id } });
  }

  await db.user.deleteMany({ where: { email: { in: EMAILS } } });
}

// ── Main ────────────────────────────────────────────────────────────────────

function requireEnv(): boolean {
  const missing = Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_JWT_SECRET: JWT_SECRET,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length === 0) return true;
  console.error(
    [
      "",
      "❌ KHÔNG CHẠY ĐƯỢC — thiếu env Supabase THẬT:",
      ...missing.map((m) => `   • ${m}`),
      "",
      "Script này kiểm chứng policy RLS trên Supabase Realtime THẬT; không có 4 biến",
      "trên thì KHÔNG có cách nào chứng minh 'A không nghe lén được kênh của B'.",
      "Không giả vờ pass — thoát với mã lỗi 1.",
      "",
      "Cách khắc phục: điền vào E:\\satarobo-vn\\.env.local (project Supabase DEV, KHÔNG PROD):",
      "   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co",
      "   NEXT_PUBLIC_SUPABASE_ANON_KEY=<Project API keys → anon public>",
      "   SUPABASE_JWT_SECRET=<Project Settings → API → JWT Settings → JWT Secret>",
      "   SUPABASE_SERVICE_ROLE_KEY=<Project API keys → service_role>   # SERVER ONLY",
      "",
      "Lấy ở Supabase Dashboard > Project Settings > API. TUYỆT ĐỐI không dán giá trị",
      "vào chat/commit; không dùng key của project PROD.",
      "",
    ].join("\n"),
  );
  return false;
}

async function main() {
  console.log(`DB host: ${currentDbHost()}`);
  if (!requireEnv()) {
    process.exitCode = 1;
    return;
  }

  const { sendChatMessageAsActor } = await chatModule;
  const { resolveActorUncached } = await actorModule;

  // ── 0. Policy phải TỒN TẠI (thứ CI không bao giờ chứng minh được) ─────────
  const policies = await db.$queryRaw<{ policyname: string; cmd: string }[]>`
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages'`;
  const hasUserPolicy = policies.some(
    (p) => p.policyname === "user_can_receive_own_user_broadcast" && p.cmd === "SELECT",
  );
  const hasConvPolicy = policies.some(
    (p) => p.policyname === "participant_can_receive_conversation_broadcast" && p.cmd === "SELECT",
  );
  const hasInsert = policies.some((p) => p.cmd === "INSERT");
  report(
    "0. policy realtime.messages",
    hasUserPolicy && hasConvPolicy && !hasInsert,
    `user_policy=${hasUserPolicy} conv_policy=${hasConvPolicy} có_INSERT=${hasInsert} · ${JSON.stringify(policies)}`,
  );
  if (!hasUserPolicy) {
    console.error(
      "\n⛔ Policy `user_can_receive_own_user_broadcast` KHÔNG có trên DB này.\n" +
        "   Migration 20260809160000 chưa apply (hoặc apply trên Postgres trần nên tự bỏ qua).\n" +
        "   Mọi bước sau sẽ vô nghĩa — dừng tại đây.\n",
    );
    process.exitCode = 1;
    await db.$disconnect();
    return;
  }

  await cleanup(); // dọn rác lần chạy trước (idempotent)

  try {
    // ── Seed ────────────────────────────────────────────────────────────────
    const orgUnit =
      (await db.orgUnit.findFirst({ where: { type: "CENTER", deletedAt: null } })) ??
      (await db.orgUnit.findFirst({ where: { deletedAt: null } }));
    if (!orgUnit) throw new Error("DB dev không có OrgUnit nào — không dựng được actor");

    const role = await db.roleDef.create({
      data: {
        code: ROLE_CODE,
        name: "ZZTEST kênh user topic",
        permissions: {
          create: [
            { action: "chat:send", scopeType: "OWN" },
            { action: "chat:read", scopeType: "OWN" },
          ],
        },
      },
    });

    // KHÔNG set `User.phone`: cột đó unique trên toàn DB dev — nhét số thật vào là tự
    // đặt bẫy đụng hàng. Dấu vết SĐT chỉ cần nằm trong NỘI DUNG TIN (thứ payload bump
    // tuyệt đối không được mang theo).
    const mkUser = (slug: string, name: string) =>
      db.user.create({
        data: {
          email: EMAIL(slug),
          name,
          role: "PARENT",
          roles: ["PARENT"],
        },
      });
    const uA = await mkUser("a", PII_NAME_A);
    const uB = await mkUser("b", `${P}B`);
    const uC = await mkUser("c", `${P}C`);
    const uLeft = await mkUser("left", `${P}LEFT`);
    const uOut = await mkUser("outsider", `${P}OUTSIDER`);

    for (const u of [uA, uB, uC, uLeft, uOut]) {
      await db.userOrgRole.create({
        data: {
          userId: u.id,
          orgUnitId: orgUnit.id,
          roleId: role.id,
          status: "ACTIVE",
          grantedById: uA.id,
        },
      });
    }

    const conv = await db.conversation.create({
      data: {
        type: "CLASS_GROUP",
        subjectType: "NONE",
        status: "ACTIVE",
        title: `${P}nhom_lop`,
      },
    });
    for (const u of [uA, uB, uC]) {
      await db.conversationParticipant.create({
        data: { conversationId: conv.id, userId: u.id, role: "MEMBER", source: "MANUAL" },
      });
    }
    await db.conversationParticipant.create({
      data: {
        conversationId: conv.id,
        userId: uLeft.id,
        role: "MEMBER",
        source: "MANUAL",
        leftAt: new Date(),
      },
    });
    console.log(
      `Seed xong: conv=${conv.id} · A=${uA.id} B=${uB.id} C=${uC.id} left=${uLeft.id}`,
    );

    const tokenA = await mintToken({ appUserId: uA.id });
    const tokenB = await mintToken({ appUserId: uB.id });
    const tokenC = await mintToken({ appUserId: uC.id });
    const tokenLeft = await mintToken({ appUserId: uLeft.id });
    const tokenOut = await mintToken({ appUserId: uOut.id });

    // ── 1 + 2: chính chủ nhận / A nghe lén kênh B ───────────────────────────
    // Ba kênh mở CÙNG LÚC, rồi MỘT POST bắn 2 event (một cho user:A, một cho user:B).
    const subAonA = await openSub("A@user:A", `user:${uA.id}`, {
      jwt: tokenA,
      privateChannel: true,
    });
    const subBonB = await openSub("B@user:B", `user:${uB.id}`, {
      jwt: tokenB,
      privateChannel: true,
    });
    const subAonB = await openSub("A@user:B (nghe lén)", `user:${uB.id}`, {
      jwt: tokenA,
      privateChannel: true,
    });

    await waitUntil(() => isSubscribed(subAonA) && isSubscribed(subBonB), 15_000);
    // Cho kẻ nghe lén đủ thời gian: kể cả rejoin-retry cũng không được lọt.
    await waitUntil(() => isDenied(subAonB), 12_000);

    // ĐỐI CHỨNG CÙNG SOCKET: chính client vừa bị đá khỏi `user:{B}` phải vào được
    // `user:{A}` (kênh của chính chủ token nó đang cầm). Không có bước này thì "A bị chặn"
    // có thể chỉ là "client đó không kết nối được", chẳng liên quan gì tới policy.
    const subAonAsameSock = await openSub("A@user:A (cùng socket kẻ nghe lén)", `user:${uA.id}`, {
      jwt: tokenA,
      privateChannel: true,
      reuseClient: subAonB.client,
    });
    await waitUntil(() => isSubscribed(subAonAsameSock), 12_000);

    const MARK_A = "ZZTEST_BUMP_DANH_CHO_A";
    const MARK_B = "ZZTEST_BUMP_DANH_CHO_B";
    const nowIso = new Date().toISOString();
    const http12 = await serviceBroadcast([
      {
        topic: `user:${uA.id}`,
        event: "conversation.bumped",
        payload: { conversationId: conv.id, messageId: MARK_A, kind: "CHAT", at: nowIso },
      },
      {
        topic: `user:${uB.id}`,
        event: "conversation.bumped",
        payload: { conversationId: conv.id, messageId: MARK_B, kind: "CHAT", at: nowIso },
      },
    ]);
    const gotMark = (s: Sub, mark: string) =>
      s.hits.some((h) => h.payload.messageId === mark);
    await waitUntil(() => gotMark(subAonA, MARK_A) && gotMark(subBonB, MARK_B), 8_000);
    await sleep(2_500); // ân hạn: nếu có rò chéo thì cũng đủ thời gian lộ ra

    report(
      "1. chính chủ join user:{A} và NHẬN được bump",
      isSubscribed(subAonA) && gotMark(subAonA, MARK_A),
      `http=${http12} · ${statusOf(subAonA)}`,
    );

    // ĐỐI CHỨNG bắt buộc: event tới user:{B} có THẬT (chính chủ B nhận được).
    const controlOk = isSubscribed(subBonB) && gotMark(subBonB, MARK_B);
    report(
      "2a. ĐỐI CHỨNG — event tới user:{B} có thật (B nhận được)",
      controlOk,
      statusOf(subBonB),
    );
    // Ba điều kiện, thiếu một là vô nghĩa:
    //  (i)  event tới `user:{B}` CÓ THẬT (2a xanh) — nếu không thì chẳng có gì để nghe lén;
    //  (ii) chính socket đó vào được `user:{A}` — nếu không thì "bị chặn" chỉ là "mất mạng";
    //  (iii) Realtime từ chối TƯỜNG MINH (isDenied), không phải im lặng.
    const sameSockAlive = isSubscribed(subAonAsameSock);
    report(
      "2b. A KHÔNG nghe lén được user:{B}",
      controlOk && sameSockAlive && isDenied(subAonB) && subAonB.hits.length === 0,
      `đối_chứng_event_có_thật=${controlOk} · cùng_socket_vào_được_kênh_mình=${sameSockAlive} · ` +
        `${statusOf(subAonB)}` +
        (isDenied(subAonB) ? " (bị từ chối tường minh)" : " (KHÔNG có trạng thái từ chối!)"),
    );
    report(
      "2c. A không nhận nhầm bump của B trên kênh của mình",
      !gotMark(subAonA, MARK_B),
      `A nhận marks=${JSON.stringify(subAonA.hits.map((h) => h.payload.messageId))}`,
    );

    // ── 3: token hỏng → không join được ─────────────────────────────────────
    const badSubs = await Promise.all([
      openSub("token hết hạn", `user:${uA.id}`, {
        jwt: await mintToken({ appUserId: uA.id, expInSeconds: -60 }),
        privateChannel: true,
      }),
      openSub("thiếu claim app_user_id", `user:${uA.id}`, {
        jwt: await mintToken({ appUserId: null }),
        privateChannel: true,
      }),
      openSub("app_user_id là id người khác", `user:${uA.id}`, {
        jwt: await mintToken({ appUserId: uB.id }),
        privateChannel: true,
      }),
      openSub("ký bằng secret sai", `user:${uA.id}`, {
        jwt: await mintToken({
          appUserId: uA.id,
          secret: "zztest-secret-sai-hoan-toan-khong-phai-cua-supabase",
        }),
        privateChannel: true,
      }),
    ]);
    // Đối chứng: token ĐÚNG mở cùng thời điểm phải vào được (nếu không thì bước 3 vô nghĩa).
    const subCtrl3 = await openSub("đối chứng token đúng", `user:${uA.id}`, {
      jwt: tokenA,
      privateChannel: true,
    });
    await waitUntil(
      () => isSubscribed(subCtrl3) && badSubs.every((s) => isDenied(s)),
      10_000,
    );
    await sleep(1_500);

    const ctrl3Ok = isSubscribed(subCtrl3);
    for (const s of badSubs) {
      report(
        `3. token hỏng bị chặn — ${s.label}`,
        // `isDenied` chứ KHÔNG phải `!isSubscribed`: phải có lời từ chối tường minh của
        // Realtime, im lặng (statuses=[]) không được tính là "đã chặn".
        ctrl3Ok && isDenied(s) && s.hits.length === 0,
        `đối_chứng_token_đúng=${ctrl3Ok} · ${statusOf(s)}` +
          (isDenied(s) ? "" : " (KHÔNG có trạng thái từ chối!)"),
      );
    }

    // ── 4: gửi tin THẬT vào nhóm lớp qua Server Action ──────────────────────
    const subConC = await openSub("C@user:C", `user:${uC.id}`, {
      jwt: tokenC,
      privateChannel: true,
    });
    const subLeft = await openSub("D(đã rời)@user:D", `user:${uLeft.id}`, {
      jwt: tokenLeft,
      privateChannel: true,
    });
    await waitUntil(() => isSubscribed(subConC) && isSubscribed(subLeft), 12_000);

    const baseA = subAonA.hits.length;
    const baseB = subBonB.hits.length;
    const baseC = subConC.hits.length;
    const baseLeft = subLeft.hits.length;

    const actorA = await resolveActorUncached(uA.id);
    const sent = await sendChatMessageAsActor(actorA, PII_NAME_A, {
      conversationId: conv.id,
      body: `${PII_BODY} — gọi ${PII_PHONE} nhé, mail ${EMAIL("a")}`,
      clientMsgId: randomUUID(),
    });
    const sentOk = sent.ok === true;
    const messageId = sentOk ? (sent as { data: { id: string } }).data.id : "";

    const bumpOf = (s: Sub, base: number) =>
      s.hits.slice(base).filter((h) => h.event === "conversation.bumped");
    await waitUntil(
      () => bumpOf(subBonB, baseB).length > 0 && bumpOf(subConC, baseC).length > 0,
      8_000,
    );
    await sleep(2_500); // ân hạn để bump SAI (nếu có) kịp tới người đã rời / người gửi

    // Chốt số ĐO ĐƯỢC trước khi bắn mồi đối chứng — sau dòng này mọi hit mới là của mồi.
    const afterA = subAonA.hits.length;
    const afterLeft = subLeft.hits.length;

    // ĐỐI CHỨNG SỐNG cho 4c + 4d (xem `probeAlive`): kênh của A và của D phải nhận được
    // mồi bắn thẳng vào kênh riêng của họ. Không có bước này thì hai kênh chết cũng "PASS".
    const PROBE = "ZZTEST_MOI_DOI_CHUNG_CON_SONG";
    const alive = await probeAlive(
      [
        { sub: subAonA, userId: uA.id },
        { sub: subLeft, userId: uLeft.id },
      ],
      PROBE,
    );
    const aliveA = alive.get(subAonA.label) === true;
    const aliveLeft = alive.get(subLeft.label) === true;

    report(
      "4a. gửi tin thật thành công",
      sentOk,
      sentOk ? `messageId=${messageId}` : `lỗi=${JSON.stringify(sent)}`,
    );
    const bumpB = bumpOf(subBonB, baseB);
    const bumpC = bumpOf(subConC, baseC);
    report(
      "4b. B + C (còn hiệu lực) nhận bump đúng hội thoại",
      bumpB.length > 0 &&
        bumpC.length > 0 &&
        bumpB.every((h) => h.payload.conversationId === conv.id) &&
        bumpC.every((h) => h.payload.conversationId === conv.id) &&
        bumpB.some((h) => h.payload.messageId === messageId) &&
        bumpC.some((h) => h.payload.messageId === messageId),
      `B=${bumpB.length} bump, C=${bumpC.length} bump`,
    );
    report(
      "4c. người ĐÃ RỜI nhóm KHÔNG nhận bump",
      aliveLeft && afterLeft - baseLeft === 0,
      `kênh_D_còn_sống=${aliveLeft} (nhận được mồi bắn thẳng vào kênh riêng — nếu false ` +
        `thì "0 bump" là vô nghĩa) · nhận thêm=${afterLeft - baseLeft}`,
    );
    report(
      "4d. NGƯỜI GỬI không tự nhận bump",
      aliveA && afterA - baseA === 0,
      `kênh_A_còn_sống=${aliveA} · A nhận thêm=${afterA - baseA}`,
    );

    // ── 5: BR-30 — payload sạch PII trên đường THẬT ─────────────────────────
    const sample = bumpB[0];
    if (!sample) {
      report("5. BR-30 payload bump sạch PII", false, "không nhận được bump nào để soi");
    } else {
      const keys = Object.keys(sample.payload).sort();
      const keysOk =
        JSON.stringify(keys) === JSON.stringify(["at", "conversationId", "kind", "messageId"]);
      const raw = JSON.stringify(sample.payload);
      const leaks = [PII_BODY, PII_PHONE, PII_NAME_A, EMAIL("a"), uA.id].filter((needle) =>
        raw.includes(needle),
      );
      const badKey = keys.find((k) => /body|name|phone|email|preview|unread|sender/i.test(k));
      report(
        "5. BR-30 payload bump sạch PII",
        keysOk && leaks.length === 0 && !badKey && sample.payload.kind === "CHAT",
        `keys=${JSON.stringify(keys)} kind=${String(sample.payload.kind)} ` +
          `rò=${JSON.stringify(leaks)} khoá_xấu=${badKey ?? "không"}`,
      );
    }

    // ── 6 [bonus]: policy PERMISSIVE không nới lỏng kênh conv: ──────────────
    const subConvMember = await openSub("participant@conv:", `conv:${conv.id}`, {
      jwt: tokenB,
      privateChannel: true,
    });
    const subConvOut = await openSub("người ngoài@conv:", `conv:${conv.id}`, {
      jwt: tokenOut,
      privateChannel: true,
    });
    await waitUntil(() => isSubscribed(subConvMember), 12_000);
    await waitUntil(() => isDenied(subConvOut), 12_000);
    report(
      "6. [bonus] policy user: không nới lỏng conv:",
      isSubscribed(subConvMember) && isDenied(subConvOut),
      `${statusOf(subConvMember)} | ${statusOf(subConvOut)}` +
        (isDenied(subConvOut) ? "" : " (người ngoài KHÔNG có trạng thái từ chối!)"),
    );

    // ── 7 [bonus]: CANARY public access trên topic user: ────────────────────
    const subPublic = await openSub("anon thuần, KHÔNG private", `user:${uA.id}`, {
      privateChannel: false,
    });
    await waitUntil(() => isSubscribed(subPublic) || isDenied(subPublic), 12_000);
    const publicOpen = isSubscribed(subPublic);
    report(
      "7. [bonus] CANARY public access",
      // Phải bị TỪ CHỐI tường minh. Im lặng (statuses=[]) = client chưa hề nói chuyện được
      // với Realtime ⇒ không kết luận được gì về "Allow public access".
      isDenied(subPublic),
      publicOpen
        ? "CANARY DO: 'Allow public access' dang BAT - vao Supabase Dashboard > Realtime Settings tat di"
        : statusOf(subPublic) + (isDenied(subPublic) ? "" : " (im lặng — KHÔNG kết luận được!)"),
    );
  } finally {
    for (const c of clients) {
      try {
        await c.removeAllChannels();
        c.realtime.disconnect();
      } catch {
        /* bỏ qua lỗi lúc đóng kết nối */
      }
    }
    await cleanup();
    await db.$disconnect();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== KẾT QUẢ: ${results.length - failed.length}/${results.length} PASS ===`);
  if (failed.length > 0) {
    for (const f of failed) console.log(`FAIL: ${f.step} — ${f.detail}`);
    console.log("=== CÓ CASE FAIL ===");
    process.exitCode = 1;
  } else {
    console.log("=== TẤT CẢ PASS ===");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    // WebSocket + timer giữ event loop — thoát tường minh theo exitCode.
    setTimeout(() => process.exit(process.exitCode ?? 0), 500);
  });
