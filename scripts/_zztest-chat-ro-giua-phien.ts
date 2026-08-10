/**
 * ZZTEST — PHÉP ĐO hai lỗ đã nghi ngờ nhưng CHƯA CÓ SỐ (không phải test pass/fail thường):
 *
 *   pnpm exec tsx scripts/_zztest-chat-ro-giua-phien.ts
 *
 * ┌ LỖ 2 (chính) — POLICY CHỈ KIỂM LÚC JOIN ─────────────────────────────────────┐
 * │ `prisma/migrations/20260809110000_..._participant_fn` chỉ chạy khi JOIN kênh. │
 * │ Người đã join `conv:{id}` rồi mới bị gỡ khỏi nhóm (`leftAt`) thì RLS KHÔNG    │
 * │ được đánh giá lại. Client thật tự rời kênh khi thấy `participant.removed`     │
 * │ (`components/chat/use-chat-channel.ts:360-366`) — nhưng đó là HỢP TÁC TỰ      │
 * │ NGUYỆN, client sửa đổi phớt lờ được. Script này ĐÓNG VAI client sửa đổi:      │
 * │ join hợp lệ → bị gỡ → CỐ Ý không rời kênh → đếm còn nhận được bao nhiêu tin,  │
 * │ trong bao lâu, và payload có mang `body` (NỘI DUNG TIN) hay không.            │
 * └──────────────────────────────────────────────────────────────────────────────┘
 * ┌ LỖ 1 — GỠ TIN ĐỌC NGƯỜI NHẬN NGOÀI TRANSACTION ─────────────────────────────┐
 * │ `lib/chat/moderation.ts:345-352` đọc danh sách người nhận bằng `db` TRẦN,     │
 * │ NGOÀI mọi transaction, SAU khi việc gỡ đã commit. Đường GỬI TIN thì đọc TRONG │
 * │ tx, ngay sau một `updateMany` khoá đúng các dòng participant                  │
 * │ (`lib/chat/messages.ts:509-533`). Hai đường có bảo đảm KHÁC NHAU trên cùng    │
 * │ một bất biến. Script dựng lại cửa sổ đua bằng một transaction TREO (gate) nên │
 * │ kết quả TẤT ĐỊNH, không phải rình xác suất.                                  │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * ⛔ LUẬT CHỐNG PASS GIẢ (bài học 09/08 — script trước báo 16/16 PASS trong khi kẻ nghe
 * lén CHƯA HỀ gọi `subscribe`): mọi khẳng định "KHÔNG nhận được gì" ở đây chỉ được tính
 * khi CÙNG LẦN CHẠY chứng minh được cả hai điều:
 *   (a) event đó CÓ THẬT và đã tới được một người khác đủ quyền (nhân chứng W/W2), và
 *   (b) kênh của đối tượng đang xét THẬT SỰ còn sống — `probeAlive()` bắn mồi thẳng vào
 *       `user:{id}` của họ và thấy nó tới.
 * Thiếu một trong hai ⇒ in FAIL kèm chữ "không kết luận được", TUYỆT ĐỐI không quy ra
 * "đã bị chặn".
 *
 * ⚠️ Ý NGHĨA MÃ THOÁT: đây là PHÉP ĐO. "Lỗ có thật, rộng N giây, nhận M tin kèm nội dung"
 * là KẾT QUẢ HỢP LỆ và KHÔNG làm script đỏ. `exitCode = 1` chỉ khi một **cổng hợp lệ**
 * (validity gate) hỏng ⇒ số đo vô nghĩa. Số đo in ở khối "SỐ ĐO" cuối cùng.
 *
 * Quy ước ZZTEST: prefix `ZZTEST_CHAT_ROGP_`, `import "./_load-env"` dòng đầu, ép
 * DIRECT_URL, try/finally dọn sạch, idempotent (dọn rác lần trước rồi mới seed),
 * không in giá trị secret, không trỏ DB prod.
 *
 * Biến điều chỉnh (env, đều có mặc định — không cần đặt gì):
 *   ZZ_TTL_X=<giây>   TTL token của kẻ ở lại kênh sau khi bị gỡ. Mặc định 90.
 *                     TTL THẬT của sản phẩm là 900 (`REALTIME_TOKEN_TTL_SECONDS`);
 *                     dùng 90 để đo được trong ~3 phút, số đo ghi rõ là ngoại suy.
 *                     Chạy `ZZ_TTL_X=900` một lần để xác nhận cận trên thật (~17 phút).
 *   ZZ_SKIP_LO1=1     bỏ phần LỖ 1 (chỉ đo LỖ 2).
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
// `tsx` sẽ chết MODULE_NOT_FOUND. Trỏ về stub mà vitest đang dùng.
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

// ⚠️ `lib/chat/*` bám singleton `@/lib/db` (đọc DATABASE_URL LÚC KHỞI TẠO) — ép đi
// DIRECT_URL (session pooler) TRƯỚC rồi mới dynamic-import, nếu không lần chạy THỨ HAI
// dính 42P05 "prepared statement s1 already exists" của transaction pooler.
// (Static import bị hoist chạy trước dòng gán env → bắt buộc import() động.)
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
const chatModule = import("../lib/chat/messages");
const moderationModule = import("../lib/chat/moderation");
const actorModule = import("../lib/auth/actor");
/**
 * Tầng điều phối vé của BẢN VÁ. `"use client"` dưới `tsx` chỉ là một biểu thức chuỗi ⇒
 * nạp được; module chỉ cần `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
 * Dùng để đo phần B5: chu kỳ gia hạn (rời hết kênh → setAuth → JOIN LẠI) có ĐÓNG được
 * cửa sổ LỖ 2 không — vì policy RLS chỉ chạy lúc JOIN, một lần join lại là một lần
 * đánh giá lại quyền.
 */
const patchedAuthModule = import("../lib/chat/supabase-client");

const DB_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const db = new PrismaClient({ datasourceUrl: DB_URL });
/** Client THỨ HAI: giữ một transaction TREO để dựng cửa sổ đua của LỖ 1. */
const db2 = new PrismaClient({ datasourceUrl: DB_URL });

const P = "ZZTEST_CHAT_ROGP_";
const ROLE_MEMBER = `${P}MEMBER`;
const ROLE_MOD = `${P}MOD`;
const SLUGS = ["s", "w", "x", "out", "mod", "w2", "v", "v2", "xp"] as const;
const EMAIL = (x: string) => `zztest-chat-rogp-${x}@zztest.local`;
const EMAILS = SLUGS.map(EMAIL);

/** Dấu vết cố ý nhét vào NỘI DUNG tin — để chứng minh rò NỘI DUNG chứ không chỉ tín hiệu. */
const LEAK_MARK = "ZZTEST_ROGP_NOI_DUNG_BI_MAT";

// PHẢI trùng namespace trong lib/chat/realtime-token.ts:20 (file đó `server-only`).
const SUB_NAMESPACE = "7d5c1af6-2b4e-4c39-9f1d-8a0e3b6d2c91";
/**
 * TTL thật của sản phẩm — `lib/chat/realtime-token.ts` (`REALTIME_TOKEN_TTL_SECONDS`).
 * ⚠️ 10/08: hạ 900 → 300 vì con số này CHÍNH LÀ cận trên của LỖ 2 trước một client sửa đổi.
 * Nếu ai đó đổi hằng số bên lib mà quên chỗ này thì mọi câu "ngoại suy" dưới đây thành sai.
 */
const PROD_TOKEN_TTL_SECONDS = 5 * 60;
/** Tỉ lệ gia hạn của client THẬT (`use-chat-channel.ts` / `user-channel.ts`). */
const PROD_RENEW_RATIO = 0.8;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const TTL_X = Math.max(45, Number(process.env.ZZ_TTL_X ?? 90) || 90);
const SKIP_LO1 = process.env.ZZ_SKIP_LO1 === "1";

// ── Báo cáo ─────────────────────────────────────────────────────────────────

/** Cổng HỢP LỆ: hỏng thì SỐ ĐO vô nghĩa ⇒ exitCode 1. */
type Gate = { step: string; pass: boolean; detail: string };
const gates: Gate[] = [];
function gate(step: string, pass: boolean, detail: string) {
  gates.push({ step, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${step} — ${detail}`);
}

/** SỐ ĐO: không có "đúng/sai", chỉ có giá trị. In lại thành khối ở cuối. */
const measures: { key: string; value: string }[] = [];
function measure(key: string, value: string) {
  measures.push({ key, value });
  console.log(`ĐO    ${key} = ${value}`);
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

type MintOpts = { appUserId: string; expInSeconds?: number };

/** Trả token + mốc hết hạn tuyệt đối (epoch ms) để tính "sống thêm bao lâu sau exp". */
async function mintToken(opts: MintOpts): Promise<{ jwt: string; expAtMs: number }> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + (opts.expInSeconds ?? PROD_TOKEN_TTL_SECONDS);
  const jwt = await new SignJWT({ role: "authenticated", app_user_id: opts.appUserId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(uuidv5(opts.appUserId, SUB_NAMESPACE))
    .setAudience("authenticated")
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(JWT_SECRET));
  return { jwt, expAtMs: exp * 1000 };
}

// ── Realtime helpers ────────────────────────────────────────────────────────

type Hit = { event: string; payload: Record<string, unknown>; at: number };
/** `err` = tham số thứ 2 của `channel.subscribe(cb)` — LÝ DO Realtime từ chối/đóng kênh. */
type StatusAt = { status: string; at: number; err?: string };
type Sub = {
  label: string;
  client: SupabaseClient;
  channel: RealtimeChannel;
  statuses: StatusAt[];
  hits: Hit[];
};

const clients: SupabaseClient[] = [];
/** Kênh mở qua MODULE SẢN PHẨM (B5) — module giữ client riêng, không nằm trong `clients`. */
const patchedSubs: { unsubscribe: () => void }[] = [];
function newClient(): SupabaseClient {
  const c = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  clients.push(c);
  return c;
}

/** Mở kênh và ghi nhận NGAY (không chờ) — caller tự quyết chờ bao lâu. */
async function openSub(
  label: string,
  topic: string,
  opts: { jwt: string; reuseClient?: SupabaseClient },
): Promise<Sub> {
  const client = opts.reuseClient ?? newClient();
  await client.realtime.setAuth(opts.jwt);
  const channel = client.channel(topic, { config: { private: true } });
  const sub: Sub = { label, client, channel, statuses: [], hits: [] };
  channel.on("broadcast", { event: "*" }, (msg) => {
    const m = msg as { event?: string; payload?: unknown };
    sub.hits.push({
      event: String(m.event ?? "?"),
      payload: (m.payload ?? {}) as Record<string, unknown>,
      at: Date.now(),
    });
  });
  channel.subscribe((status, err) =>
    sub.statuses.push({ status, at: Date.now(), err: err ? err.message : undefined }),
  );
  return sub;
}

/**
 * ⚠️ LỊCH SỬ, không phải "đang sống": mảng `statuses` chỉ được ghi thêm. Hàm này trả true
 * mãi mãi kể từ lần SUBSCRIBED đầu tiên, kể cả khi socket đã chết sau đó. KHÔNG dùng nó
 * làm đối chứng cho các bước "phải KHÔNG nhận được gì" — chỗ đó phải `probeAlive()`.
 */
function isSubscribed(s: Sub) {
  return s.statuses.some((x) => x.status === "SUBSCRIBED");
}
/**
 * "Bị từ chối" = có trạng thái lỗi TƯỜNG MINH và chưa bao giờ SUBSCRIBED.
 * ĐỪNG thay bằng `!isSubscribed`: kênh chưa hề `subscribe()` cũng cho `statuses=[]`.
 */
function isDenied(s: Sub) {
  return (
    !isSubscribed(s) &&
    s.statuses.some(
      (x) => x.status === "CHANNEL_ERROR" || x.status === "CLOSED" || x.status === "TIMED_OUT",
    )
  );
}
function statusOf(s: Sub) {
  return (
    `${s.label}: statuses=${JSON.stringify(
      s.statuses.map((x) => x.status + (x.err ? `(lý do: ${x.err})` : "")),
    )} hits=${s.hits.length}`
  );
}
/** Trạng thái lỗi/đóng XUẤT HIỆN SAU khi đã SUBSCRIBED (dấu hiệu Realtime tự cắt phiên). */
function closedAfterSubscribe(s: Sub): StatusAt | null {
  const sub = s.statuses.find((x) => x.status === "SUBSCRIBED");
  if (!sub) return null;
  return (
    s.statuses.find(
      (x) =>
        x.at > sub.at &&
        (x.status === "CLOSED" || x.status === "CHANNEL_ERROR" || x.status === "TIMED_OUT"),
    ) ?? null
  );
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
 * ĐỐI CHỨNG SỐNG cho mọi bước dạng "phải KHÔNG nhận được gì".
 * Bắn mồi (service role) thẳng vào kênh RIÊNG `user:{id}` của từng người rồi BẮT BUỘC
 * kênh đó nhận được. Nhận được ⇒ đúng khoảng thời gian vừa đo, socket còn sống, token còn
 * hiệu lực, tai còn nghe được ⇒ con số "0" mới có nghĩa "server cố ý không gửi".
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

  for (const code of [ROLE_MEMBER, ROLE_MOD]) {
    const role = await db.roleDef.findUnique({ where: { code } });
    if (role) {
      await db.userOrgRole.deleteMany({ where: { roleId: role.id } });
      await db.rolePermission.deleteMany({ where: { roleId: role.id } });
      await db.roleDef.delete({ where: { id: role.id } });
    }
  }

  await db.user.deleteMany({ where: { email: { in: EMAILS } } });
}

/**
 * Đếm rác còn sót — BẰNG CHỨNG "đã dọn sạch" chứ không phải lời hứa. DB này dùng CHUNG
 * với `test.satarobo.vn`, để lại một hàng User/Conversation là để lại rác cho người khác.
 */
async function leftovers(): Promise<Record<string, number>> {
  const [convs, users, roles, parts] = await Promise.all([
    db.conversation.count({ where: { title: { startsWith: P } } }),
    db.user.count({ where: { email: { in: EMAILS } } }),
    db.roleDef.count({ where: { code: { in: [ROLE_MEMBER, ROLE_MOD] } } }),
    db.conversationParticipant.count({ where: { conversation: { title: { startsWith: P } } } }),
  ]);
  return { conversation: convs, user: users, roleDef: roles, participant: parts };
}

// ── Env gate ────────────────────────────────────────────────────────────────

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
      "Phép đo này chạm Supabase Realtime THẬT; không có 4 biến trên thì không đo được",
      "gì cả. Không giả vờ pass — thoát với mã lỗi 1.",
      "",
      "Điền vào E:\\satarobo-vn\\.env.local (project Supabase DEV, KHÔNG PROD):",
      "   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /",
      "   SUPABASE_JWT_SECRET / SUPABASE_SERVICE_ROLE_KEY",
      "",
    ].join("\n"),
  );
  return false;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`DB host: ${currentDbHost()}`);
  console.log(
    `Cấu hình: TTL_X=${TTL_X}s (TTL sản phẩm=${PROD_TOKEN_TTL_SECONDS}s) · SKIP_LO1=${SKIP_LO1}`,
  );
  if (!requireEnv()) {
    process.exitCode = 1;
    return;
  }

  const { sendChatMessageAsActor } = await chatModule;
  const { deleteMessageAsModeratorAsActor } = await moderationModule;
  const { resolveActorUncached } = await actorModule;

  // ── Cổng 0: policy phải TỒN TẠI, nếu không mọi số đo đều vô nghĩa ─────────
  const policies = await db.$queryRaw<{ policyname: string; cmd: string }[]>`
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages'`;
  const hasConvPolicy = policies.some(
    (p) => p.policyname === "participant_can_receive_conversation_broadcast" && p.cmd === "SELECT",
  );
  const hasUserPolicy = policies.some(
    (p) => p.policyname === "user_can_receive_own_user_broadcast" && p.cmd === "SELECT",
  );
  const hasInsert = policies.some((p) => p.cmd === "INSERT");
  gate(
    "G0. policy realtime.messages có mặt",
    hasConvPolicy && hasUserPolicy && !hasInsert,
    `conv_policy=${hasConvPolicy} user_policy=${hasUserPolicy} có_INSERT=${hasInsert}`,
  );
  if (!hasConvPolicy || !hasUserPolicy) {
    console.error(
      "\n⛔ Thiếu policy trên DB này — migration chưa apply (hoặc apply trên Postgres trần).\n" +
        "   Mọi phép đo sau đều vô nghĩa. Dừng.\n",
    );
    process.exitCode = 1;
    await db.$disconnect();
    await db2.$disconnect();
    return;
  }

  await cleanup(); // dọn rác lần chạy trước (idempotent)

  try {
    // ── Seed ────────────────────────────────────────────────────────────────
    const orgUnit =
      (await db.orgUnit.findFirst({ where: { type: "CENTER", deletedAt: null } })) ??
      (await db.orgUnit.findFirst({ where: { deletedAt: null } }));
    if (!orgUnit) throw new Error("DB dev không có OrgUnit nào — không dựng được actor");

    const roleMember = await db.roleDef.create({
      data: {
        code: ROLE_MEMBER,
        name: "ZZTEST rò giữa phiên — thành viên",
        permissions: {
          create: [
            { action: "chat:send", scopeType: "OWN" },
            { action: "chat:read", scopeType: "OWN" },
          ],
        },
      },
    });
    // Người kiểm duyệt: `chat:moderate` GLOBAL (hội thoại seed có subjectType NONE ⇒
    // scope ASSIGNED của GV thật sẽ không khớp; GLOBAL ở đây là để phép đo đi tới được
    // đường code cần đo, KHÔNG phải mô hình quyền của sản phẩm).
    const roleMod = await db.roleDef.create({
      data: {
        code: ROLE_MOD,
        name: "ZZTEST rò giữa phiên — kiểm duyệt",
        permissions: {
          create: [
            { action: "chat:moderate", scopeType: "GLOBAL" },
            { action: "chat:send", scopeType: "GLOBAL" },
            { action: "chat:read", scopeType: "GLOBAL" },
          ],
        },
      },
    });

    // KHÔNG set `User.phone`: cột unique toàn DB dev — nhét số vào là tự đặt bẫy đụng hàng.
    const mkUser = (slug: string, role: "PARENT" | "TEACHER") =>
      db.user.create({
        data: {
          email: EMAIL(slug),
          name: `${P}${slug.toUpperCase()}`,
          role,
          roles: [role],
        },
      });
    const uS = await mkUser("s", "PARENT"); // người gửi
    const uW = await mkUser("w", "PARENT"); // nhân chứng LỖ 2 (ở lại nhóm)
    const uX = await mkUser("x", "PARENT"); // nạn nhân LỖ 2 (bị gỡ, cố ý ở lại kênh)
    const uOut = await mkUser("out", "PARENT"); // chưa bao giờ là thành viên
    const uMod = await mkUser("mod", "TEACHER"); // người gỡ tin (LỖ 1)
    const uW2 = await mkUser("w2", "PARENT"); // nhân chứng LỖ 1
    const uV = await mkUser("v", "PARENT"); // nạn nhân LỖ 1 — đường GỠ TIN
    const uV2 = await mkUser("v2", "PARENT"); // đối chứng LỖ 1 — đường GỬI TIN
    // XP: nạn nhân LỖ 2 nhưng đo trên ĐƯỜNG ĐÃ VÁ — kênh mở bằng chính module sản phẩm
    // (`lib/chat/supabase-client.ts`) và gia hạn bằng `applyRealtimeAuth`.
    const uXP = await mkUser("xp", "PARENT");

    for (const u of [uS, uW, uX, uOut, uW2, uV, uV2, uXP]) {
      await db.userOrgRole.create({
        data: {
          userId: u.id,
          orgUnitId: orgUnit.id,
          roleId: roleMember.id,
          status: "ACTIVE",
          grantedById: uS.id,
        },
      });
    }
    await db.userOrgRole.create({
      data: {
        userId: uMod.id,
        orgUnitId: orgUnit.id,
        roleId: roleMod.id,
        status: "ACTIVE",
        grantedById: uS.id,
      },
    });

    const mkConv = (suffix: string) =>
      db.conversation.create({
        data: {
          type: "CLASS_GROUP",
          subjectType: "NONE",
          status: "ACTIVE",
          title: `${P}${suffix}`,
        },
      });
    const convA = await mkConv("lo2_nhom_lop");
    const convB = await mkConv("lo1_nhom_lop");

    const addMember = (conversationId: string, userId: string) =>
      db.conversationParticipant.create({
        data: { conversationId, userId, role: "MEMBER", source: "MANUAL" },
      });
    for (const u of [uS, uW, uX, uXP]) await addMember(convA.id, u.id);
    for (const u of [uS, uMod, uW2, uV, uV2]) await addMember(convB.id, u.id);

    console.log(
      `Seed xong: convA=${convA.id} convB=${convB.id} · S=${uS.id} W=${uW.id} X=${uX.id}`,
    );

    // ════════════════════════════════════════════════════════════════════════
    // LỖ 2 — POLICY CHỈ KIỂM LÚC JOIN
    // ════════════════════════════════════════════════════════════════════════
    console.log("\n───── LỖ 2: người bị gỡ khỏi nhóm nhưng KHÔNG rời kênh ─────");

    const tkX = await mintToken({ appUserId: uX.id, expInSeconds: TTL_X });
    // W (nhân chứng) và các kênh phụ trợ dùng TTL dài để không tự chết giữa phép đo.
    const tkW = await mintToken({ appUserId: uW.id });
    const tkXUser = await mintToken({ appUserId: uX.id });
    const tkOut = await mintToken({ appUserId: uOut.id });

    // Kênh hội thoại của X — CHÍNH LÀ kênh sẽ bị bỏ quên sau khi X bị gỡ.
    const subXconv = await openSub("X@conv (kẻ ở lại)", `conv:${convA.id}`, { jwt: tkX.jwt });
    const subWconv = await openSub("W@conv (nhân chứng)", `conv:${convA.id}`, { jwt: tkW.jwt });
    // Kênh `user:{X}` riêng — dùng làm `probeAlive` (socket khác, token TTL dài) để đối
    // chứng "tai còn nghe" mà không làm nhiễu kênh conv đang đo.
    const subXuser = await openSub("X@user:X (mồi đối chứng)", `user:${uX.id}`, {
      jwt: tkXUser.jwt,
    });
    await waitUntil(
      () => isSubscribed(subXconv) && isSubscribed(subWconv) && isSubscribed(subXuser),
      20_000,
    );
    const tJoinX = Date.now();
    gate(
      "G1. X (còn là thành viên) join được conv:{id}",
      isSubscribed(subXconv) && isSubscribed(subWconv) && isSubscribed(subXuser),
      `${statusOf(subXconv)} | ${statusOf(subWconv)} | ${statusOf(subXuser)}`,
    );

    // Kiểm ngược: người CHƯA BAO GIỜ là thành viên phải bị từ chối ngay lúc join.
    // Không có bước này thì "X vẫn nhận" có thể là do policy hỏng hoàn toàn, chứ không
    // phải do "policy chỉ kiểm lúc join".
    const subOut = await openSub("người ngoài@conv", `conv:${convA.id}`, { jwt: tkOut.jwt });
    await waitUntil(() => isDenied(subOut), 15_000);
    gate(
      "G2. KIỂM NGƯỢC — người ngoài hội thoại bị từ chối lúc join",
      isDenied(subOut) && subOut.hits.length === 0,
      statusOf(subOut) + (isDenied(subOut) ? " (từ chối tường minh)" : " (KHÔNG có từ chối!)"),
    );

    // ── B1: đối chứng DƯƠNG trước khi gỡ — X phải nhận được tin thật ────────
    const actorS = await resolveActorUncached(uS.id);
    const sendReal = async (conversationId: string, tag: string) => {
      const r = await sendChatMessageAsActor(actorS, `${P}S`, {
        conversationId,
        body: `${LEAK_MARK} ${tag}`,
        clientMsgId: randomUUID(),
      });
      if (r.ok !== true) throw new Error(`gửi tin thật thất bại: ${JSON.stringify(r)}`);
      return (r as { data: { id: string } }).data.id;
    };

    const gotId = (s: Sub, id: string) => s.hits.some((h) => h.payload.id === id);
    const idBefore = await sendReal(convA.id, "TRUOC_KHI_GO");
    await waitUntil(() => gotId(subXconv, idBefore) && gotId(subWconv, idBefore), 12_000);
    const xGotBefore = gotId(subXconv, idBefore);
    gate(
      "G3. ĐỐI CHỨNG DƯƠNG — X nhận được tin khi CÒN là thành viên",
      xGotBefore && gotId(subWconv, idBefore),
      `X_nhận=${xGotBefore} W_nhận=${gotId(subWconv, idBefore)} messageId=${idBefore}`,
    );

    // ── B2: gỡ X khỏi nhóm ─────────────────────────────────────────────────
    // ⚠️ MÔ PHỎNG: UPDATE thẳng `leftAt`, KHÔNG chạy `syncConversationMembership`
    // (hàm đó cần một `Class` thật + enrollment; nó cũng chỉ ghi đúng cột này rồi
    // `publishEvent(CHAT_PARTICIPANT_REMOVED)` — mà event ấy đi qua outbox/cron, độ trễ
    // tới ~60s, và dù có chạy thì nó chỉ nhờ CLIENT tự rời kênh). Cột bị ghi và giá trị
    // ghi vào là y hệt đường thật: `lib/chat/sync-membership.ts:465-468`.
    const pX = await db.conversationParticipant.findFirstOrThrow({
      where: { conversationId: convA.id, userId: uX.id },
      select: { id: true },
    });
    const tLeft = Date.now();
    await db.conversationParticipant.update({
      where: { id: pX.id },
      data: { leftAt: new Date(tLeft) },
    });
    const leftRow = await db.conversationParticipant.findUniqueOrThrow({
      where: { id: pX.id },
      select: { leftAt: true },
    });
    gate(
      "G4. leftAt đã ghi vào DB (X không còn là thành viên)",
      leftRow.leftAt !== null,
      `leftAt=${leftRow.leftAt?.toISOString() ?? "null"} · CỐ Ý không gọi unsubscribe cho kênh X`,
    );

    // Kiểm ngược thứ hai: JOIN MỚI sau khi bị gỡ phải bị từ chối. Đây là cặp đối chiếu
    // quyết định — "join mới bị chặn" + "phiên cũ vẫn nghe" = policy chỉ kiểm lúc join.
    const subXrejoin = await openSub("X@conv (join LẠI sau khi bị gỡ)", `conv:${convA.id}`, {
      jwt: (await mintToken({ appUserId: uX.id })).jwt,
    });
    await waitUntil(() => isDenied(subXrejoin), 15_000);
    gate(
      "G5. KIỂM NGƯỢC — X join LẠI sau khi bị gỡ thì BỊ TỪ CHỐI",
      isDenied(subXrejoin) && subXrejoin.hits.length === 0,
      statusOf(subXrejoin),
    );

    // ── B3: gửi tiếp N tin THẬT — X còn nhận được không? ───────────────────
    const REAL_AFTER = 3;
    const realIdsAfter: string[] = [];
    for (let i = 1; i <= REAL_AFTER; i++) {
      realIdsAfter.push(await sendReal(convA.id, `SAU_KHI_GO_${i}`));
      await sleep(1_500);
    }
    await waitUntil(() => realIdsAfter.every((id) => gotId(subWconv, id)), 12_000);
    await sleep(2_000); // ân hạn cho tin lọt tới X (nếu có)

    const xRealHits = realIdsAfter.filter((id) => gotId(subXconv, id));
    const wRealHits = realIdsAfter.filter((id) => gotId(subWconv, id));
    gate(
      "G6. ĐỐI CHỨNG — nhân chứng W (còn trong nhóm) nhận đủ N tin thật",
      wRealHits.length === REAL_AFTER,
      `W nhận ${wRealHits.length}/${REAL_AFTER} tin`,
    );
    measure(
      "LỖ2 · số tin THẬT X nhận được SAU khi bị gỡ",
      `${xRealHits.length}/${REAL_AFTER}`,
    );

    // Payload X nhận được có mang NỘI DUNG TIN không?
    const leakedHit = subXconv.hits.find(
      (h) => h.at > tLeft && realIdsAfter.includes(String(h.payload.id)),
    );
    if (leakedHit) {
      const keys = Object.keys(leakedHit.payload).sort();
      const bodyVal = typeof leakedHit.payload.body === "string" ? leakedHit.payload.body : "";
      measure(
        "LỖ2 · payload X nhận CÓ trường `body`",
        `${Object.prototype.hasOwnProperty.call(leakedHit.payload, "body") ? "CÓ" : "KHÔNG"}` +
          ` · chứa dấu vết nội dung="${LEAK_MARK}"=${bodyVal.includes(LEAK_MARK) ? "CÓ" : "KHÔNG"}`,
      );
      measure("LỖ2 · các khoá trong payload rò", JSON.stringify(keys));
      measure(
        "LỖ2 · trích nội dung X đọc được",
        JSON.stringify(bodyVal.slice(0, 80)),
      );
    } else {
      measure("LỖ2 · payload X nhận CÓ trường `body`", "không có tin nào lọt để soi");
    }

    // ── B4: đo CẬN TRÊN — giữ kênh mở tới khi Realtime tự cắt vì JWT hết hạn ─
    // Ping bằng service role (không tốn quota `chat:send` 20/60s, cùng transport,
    // cùng policy). Ghi rõ trong báo cáo: đoạn này là ping service, KHÔNG phải tin thật.
    const PING = `${P}PING`;
    const pings: { id: string; at: number }[] = [];
    const hardDeadline = tkX.expAtMs + 120_000; // TTL + 2 phút đệm
    let silenceSince = Date.now();
    console.log(
      `Bắt đầu vòng ping 2s/lần tới conv:${convA.id} — chờ tới khi X câm hoặc ${new Date(hardDeadline).toISOString()}`,
    );
    for (let seq = 1; ; seq++) {
      const id = `${PING}_${seq}_${randomUUID()}`;
      await serviceBroadcast([
        {
          topic: `conv:${convA.id}`,
          event: "message.created",
          payload: {
            id,
            conversationId: convA.id,
            senderId: uS.id,
            kind: "CHAT",
            body: `${LEAK_MARK} PING_${seq}`,
            createdAt: new Date().toISOString(),
          },
        },
      ]);
      pings.push({ id, at: Date.now() });
      await sleep(2_000);
      if (gotId(subXconv, id)) silenceSince = Date.now();
      const closed = closedAfterSubscribe(subXconv) !== null;
      const silentMs = Date.now() - silenceSince;
      if (closed && silentMs > 8_000) break;
      if (silentMs > 25_000) break; // câm liên tục 25s ⇒ coi như đã bị cắt
      if (Date.now() > hardDeadline) break;
      if (seq > 600) break; // chốt chặn tuyệt đối
    }

    const xPingHits = pings.filter((p) => gotId(subXconv, p.id));
    const wPingHits = pings.filter((p) => gotId(subWconv, p.id));
    const lastXHitAt = xPingHits.length > 0 ? xPingHits[xPingHits.length - 1]!.at : null;
    const closeEvt = closedAfterSubscribe(subXconv);

    // ĐỐI CHỨNG bắt buộc trước khi kết luận bất kỳ số "0"/"ngừng nhận" nào:
    // (a) nhân chứng W phải nhận được 3 ping cuối (event có thật, có người nhận được);
    // (b) kênh riêng của X phải còn nghe được mồi — nhưng lưu ý subXuser dùng token TTL
    //     dài nên nó chỉ chứng minh "socket/hạ tầng của X còn sống", không chứng minh
    //     token TTL ngắn còn hiệu lực (đó chính là thứ đang đo).
    const last3 = pings.slice(-3);
    const wGotLast3 = last3.filter((p) => gotId(subWconv, p.id)).length;
    gate(
      "G7. ĐỐI CHỨNG — W vẫn nhận 3 ping cuối (nguồn phát còn chạy)",
      wGotLast3 === last3.length && last3.length > 0,
      `W nhận ${wGotLast3}/${last3.length} ping cuối · tổng W ${wPingHits.length}/${pings.length}`,
    );
    const aliveMap = await probeAlive(
      [{ sub: subXuser, userId: uX.id }],
      `${P}MOI_SONG_${randomUUID()}`,
    );
    const xStillReachable = aliveMap.get(subXuser.label) === true;
    gate(
      "G8. ĐỐI CHỨNG — hạ tầng phía X còn nhận được mồi trên kênh riêng",
      xStillReachable,
      `X@user:X nhận mồi=${xStillReachable} (false ⇒ mọi số 0 ở trên KHÔNG kết luận được)`,
    );

    measure("LỖ2 · TTL token của X (giây)", String(TTL_X));
    measure(
      "LỖ2 · số ping service X nhận được sau khi bị gỡ",
      `${xPingHits.length}/${pings.length} (W nhận ${wPingHits.length}/${pings.length})`,
    );
    measure(
      "LỖ2 · X còn nghe được BAO LÂU sau khi bị gỡ (giây)",
      lastXHitAt === null
        ? "0 — không nhận thêm tin nào sau leftAt"
        : `${((lastXHitAt - tLeft) / 1000).toFixed(1)}`,
    );
    measure(
      "LỖ2 · tin cuối X nghe được so với mốc HẾT HẠN token (giây, âm = trước khi hết hạn)",
      lastXHitAt === null ? "n/a" : `${((lastXHitAt - tkX.expAtMs) / 1000).toFixed(1)}`,
    );
    // `lastXHitAt` là mốc PHÁT của ping; đây là mốc NHẬN thật trên socket của X — hai con
    // số phải sát nhau, lệch lớn nghĩa là đang đo độ trễ mạng chứ không phải ranh giới token.
    const lastXRecvAt = subXconv.hits.filter((h) => h.at > tLeft).at(-1)?.at ?? null;
    measure(
      "LỖ2 · mốc NHẬN (không phải mốc phát) của event cuối trên socket X, so với exp (giây)",
      lastXRecvAt === null ? "n/a" : `${((lastXRecvAt - tkX.expAtMs) / 1000).toFixed(1)}`,
    );
    measure(
      "LỖ2 · Realtime tự đóng kênh X lúc nào so với exp (giây)",
      closeEvt === null
        ? "KHÔNG có trạng thái đóng nào (kênh vẫn mở tới hết phép đo)"
        : `${((closeEvt.at - tkX.expAtMs) / 1000).toFixed(1)} (status=${closeEvt.status})`,
    );
    const tBase = subXconv.statuses[0]?.at ?? tJoinX;
    measure(
      "LỖ2 · lịch sử trạng thái kênh X (mốc 0 = lúc join)",
      JSON.stringify(
        subXconv.statuses.map((s) => `${s.status}@+${((s.at - tBase) / 1000).toFixed(1)}s`),
      ),
    );
    measure(
      "LỖ2 · token của X còn lại bao nhiêu giây tại thời điểm BỊ GỠ",
      `${((tkX.expAtMs - tLeft) / 1000).toFixed(1)}s / TTL ${TTL_X}s`,
    );
    measure(
      `LỖ2 · NGOẠI SUY cho TTL sản phẩm (${PROD_TOKEN_TTL_SECONDS}s)`,
      lastXHitAt === null
        ? "n/a — không có tin nào lọt, không ngoại suy được"
        : `đo với TTL=${TTL_X}s: X nghe tới ${((lastXHitAt - tkX.expAtMs) / 1000).toFixed(1)}s ` +
          `so với mốc exp ⇒ cửa sổ rò = PHẦN CÒN LẠI CỦA VÉ kể từ lúc bị gỡ, không phụ ` +
          `thuộc lúc nào bị gỡ.\n` +
          `      ⚠️ PHẢI TÁCH HAI KẺ ĐE DOẠ, chúng có hai cận trên KHÁC NHAU:\n` +
          `        • client SỬA ĐỔI (đúng mô hình đe doạ của LỖ 2 — nó cố tình không rời kênh):\n` +
          `          nó cũng sẽ KHÔNG tự gia hạn, nên cận trên = TTL vé = ${PROD_TOKEN_TTL_SECONDS}s.\n` +
          `          Muốn kéo dài thì phải JOIN LẠI, mà join lại thì policy chạy lại và chặn\n` +
          `          (bước G5 là bằng chứng) ⇒ KHÔNG còn vô hạn như bản TTL 900s.\n` +
          `        • client THẬT (không sửa): nó gia hạn ở ${PROD_RENEW_RATIO * 100}% TTL, và bản vá\n` +
          `          biến mỗi lần gia hạn thành một lần JOIN LẠI ⇒ cận trên = ` +
          `${PROD_TOKEN_TTL_SECONDS * PROD_RENEW_RATIO}s (đo ở phần B5).`,
    );

    // ── B5: CỬA SỔ LỖ 2 TRÊN ĐƯỜNG ĐÃ VÁ ──────────────────────────────────
    // Câu hỏi: chu kỳ gia hạn của bản vá (rời hết kênh → setAuth → JOIN LẠI) có THẬT SỰ
    // đá người đã bị gỡ ra không? Policy chỉ chạy lúc JOIN, nên nếu đúng thì một lần gia
    // hạn = một lần đánh giá lại quyền = đóng cửa sổ.
    // Mọi bước dùng ĐÚNG module sản phẩm — không phải `setAuth` trần, không phải kênh do
    // script tự cầm. Script chỉ nắm hai callback, y như `useChatChannel` nắm.
    console.log("\n───── B5: cửa sổ LỖ 2 sau bản vá (applyRealtimeAuth = JOIN LẠI) ─────");
    const { applyRealtimeAuth, subscribeConversation, subscribeUserTopic } =
      await patchedAuthModule;
    type PRec = { label: string; hits: Hit[]; statuses: StatusAt[] };
    const pConv: PRec = { label: "XP@conv (module sản phẩm)", hits: [], statuses: [] };
    const pUser: PRec = { label: "XP@user (kênh anh em, đối chứng sống)", hits: [], statuses: [] };
    const pHandlers = (rec: PRec) => ({
      onBroadcast: (event: string, payload: Record<string, unknown>) =>
        rec.hits.push({ event, payload, at: Date.now() }),
      onStatus: (status: string, err?: Error) =>
        rec.statuses.push({ status, at: Date.now(), err: err ? err.message : undefined }),
    });
    const pSubbed = (rec: PRec) => rec.statuses.some((x) => x.status === "SUBSCRIBED");
    const pGotId = (rec: PRec, id: string) => rec.hits.some((h) => h.payload.id === id);
    const pLine = (rec: PRec, t0: number) =>
      `${rec.label}: ${rec.statuses
        .map((x) => `${x.status}@+${((x.at - t0) / 1000).toFixed(1)}s${x.err ? `(${x.err})` : ""}`)
        .join(",")} hits=${rec.hits.length}`;

    // ⚠️ TTL vé ĐẦU phải NGẮN. `applyRealtimeAuth` có luật "vé đang áp còn hơn NỬA đời vé
    // mới thì GIỮ NGUYÊN" (chống hai bộ hẹn giờ cùng đổi vé trong một chu kỳ). Lần đo đầu
    // dùng vé đầu 900s rồi gia hạn ngay sau 10s ⇒ còn 890s > 450s ⇒ vé mới BỊ BỎ, chu kỳ
    // rời-join KHÔNG chạy, và phép đo báo nhầm "lỗ chưa đóng".
    // Sản phẩm không bao giờ ở tình huống đó: nó gia hạn ở 80% TTL, tức vé đang áp chỉ còn
    // 20% (60s/300s) so với nửa đời vé mới (150s) ⇒ luôn đổi. Dựng lại đúng tỉ lệ đó ở đây.
    const tkXP = await mintToken({ appUserId: uXP.id, expInSeconds: 60 });
    const authXP = { token: tkXP.jwt, expiresAt: new Date(tkXP.expAtMs).toISOString() };
    const subXPconv = subscribeConversation(convA.id, authXP, pHandlers(pConv));
    const subXPuser = subscribeUserTopic(uXP.id, authXP, pHandlers(pUser));
    patchedSubs.push(subXPconv, subXPuser);
    const tB5 = Date.now();
    await waitUntil(() => pSubbed(pConv) && pSubbed(pUser), 20_000);
    gate(
      "G13. XP join được cả conv: lẫn user: qua MODULE SẢN PHẨM (một kết nối, hai kênh)",
      pSubbed(pConv) && pSubbed(pUser),
      `${pLine(pConv, tB5)} | ${pLine(pUser, tB5)}`,
    );

    // (1) đối chứng dương TRƯỚC khi gỡ
    const idXP1 = await sendReal(convA.id, "XP_TRUOC_KHI_GO");
    await waitUntil(() => pGotId(pConv, idXP1), 12_000);
    gate(
      "G14. ĐỐI CHỨNG DƯƠNG — XP nhận tin khi CÒN là thành viên",
      pGotId(pConv, idXP1),
      `XP_nhận=${pGotId(pConv, idXP1)} messageId=${idXP1}`,
    );

    // (2) gỡ XP — cửa sổ rò MỞ RA từ đây
    const pXP = await db.conversationParticipant.findFirstOrThrow({
      where: { conversationId: convA.id, userId: uXP.id },
      select: { id: true },
    });
    const tLeftXP = Date.now();
    await db.conversationParticipant.update({
      where: { id: pXP.id },
      data: { leftAt: new Date(tLeftXP) },
    });

    // (3) TRƯỚC khi gia hạn: lỗ VẪN mở — phải chứng minh, nếu không thì bước (5) có thể
    // "sạch" chỉ vì kênh đã chết sẵn từ trước.
    const idXP2 = await sendReal(convA.id, "XP_SAU_KHI_GO_TRUOC_GIA_HAN");
    await waitUntil(() => gotId(subWconv, idXP2), 12_000);
    await sleep(2_500);
    const leakBeforeRenew = pGotId(pConv, idXP2);
    gate(
      "G15. TRƯỚC gia hạn, lỗ VẪN mở (nếu không thì bước sau không chứng minh được gì)",
      leakBeforeRenew && gotId(subWconv, idXP2),
      `XP_còn_nhận=${leakBeforeRenew} · W(nhân chứng)_nhận=${gotId(subWconv, idXP2)} · ` +
        `messageId=${idXP2}`,
    );

    // (4) GIA HẠN bằng đường sản phẩm — đây là thao tác đang được kiểm chứng
    const tkXP2 = await mintToken({ appUserId: uXP.id, expInSeconds: 300 });
    const tRenew = Date.now();
    const effXP = applyRealtimeAuth({
      token: tkXP2.jwt,
      expiresAt: new Date(tkXP2.expAtMs).toISOString(),
    });
    // Chu kỳ rời-đổi-join là bất đồng bộ; chờ tới khi conv: có trạng thái lỗi HOẶC user:
    // SUBSCRIBED lần thứ hai (bằng chứng chu kỳ đã chạy xong).
    const convErrAfterRenew = () =>
      pConv.statuses.find(
        (x) =>
          x.at > tRenew &&
          (x.status === "CHANNEL_ERROR" || x.status === "TIMED_OUT" || x.status === "CLOSED"),
      ) ?? null;
    const userReSub = () =>
      pUser.statuses.filter((x) => x.status === "SUBSCRIBED" && x.at > tRenew).length;
    await waitUntil(() => convErrAfterRenew() !== null && userReSub() > 0, 30_000);
    const kickEvt = convErrAfterRenew();
    // CỔNG chống đọc nhầm: nếu chu kỳ rời-join KHÔNG chạy (vé mới bị luật "nửa đời" bỏ) thì
    // mọi số dưới đây chỉ nói "không có gì xảy ra", KHÔNG nói "lỗ đã đóng". Kênh `user:` phải
    // SUBSCRIBED lại ⇒ bằng chứng chu kỳ THẬT SỰ đã chạy.
    gate(
      "G15-bis. chu kỳ gia hạn THỰC SỰ đã chạy (kênh user: join lại)",
      userReSub() > 0,
      `số lần SUBSCRIBED của user: sau gia hạn=${userReSub()} · ` +
        `mốc hiệu lực trả về=${effXP} vs vé vừa xin=${new Date(tkXP2.expAtMs).toISOString()} ` +
        `(hai mốc BẰNG NHAU ⇒ vé mới được nhận; mốc cũ hơn ⇒ vé bị luật "nửa đời" bỏ, ` +
        `phép đo B5 KHÔNG kết luận được)`,
    );

    // (5) SAU gia hạn: gửi tiếp 3 tin thật — XP phải câm, W phải nhận đủ
    const afterIds: string[] = [];
    for (let i = 1; i <= 3; i++) {
      afterIds.push(await sendReal(convA.id, `XP_SAU_GIA_HAN_${i}`));
      await sleep(1_500);
    }
    await waitUntil(() => afterIds.every((id) => gotId(subWconv, id)), 15_000);
    await sleep(3_000); // ân hạn: cho tin kịp lọt tới XP NẾU lỗ còn mở
    const xpAfter = afterIds.filter((id) => pGotId(pConv, id));
    const wAfter = afterIds.filter((id) => gotId(subWconv, id));

    // (6) ĐỐI CHỨNG SỐNG bắt buộc — kênh `user:` của XP (cùng kết nối, đã join lại bằng vé
    // mới) phải còn nhận được mồi. Nếu nó cũng câm thì "XP không nhận" chỉ nói lên rằng
    // bản vá đã giết cả kết nối, KHÔNG nói lên rằng nó chặn đúng người.
    const probeMark = `${P}MOI_B5_${randomUUID()}`;
    await serviceBroadcast([
      {
        topic: `user:${uXP.id}`,
        event: "conversation.bumped",
        payload: {
          conversationId: probeMark,
          messageId: probeMark,
          kind: "CHAT",
          at: new Date().toISOString(),
        },
      },
    ]);
    await waitUntil(() => pUser.hits.some((h) => h.payload.messageId === probeMark), 12_000);
    const xpEarAlive = pUser.hits.some((h) => h.payload.messageId === probeMark);
    gate(
      "G16. ĐỐI CHỨNG SỐNG — kênh user: của XP vẫn nhận mồi SAU chu kỳ gia hạn",
      xpEarAlive,
      `user:XP nhận mồi=${xpEarAlive} · số lần SUBSCRIBED sau gia hạn=${userReSub()} ` +
        `(false ⇒ số 0 ở dưới KHÔNG kết luận được — có thể bản vá giết cả kết nối)`,
    );
    gate(
      "G17. ĐỐI CHỨNG — nhân chứng W nhận đủ 3 tin sau gia hạn (event có thật)",
      wAfter.length === 3,
      `W nhận ${wAfter.length}/3`,
    );

    const lastLeakAt = pConv.hits.filter((h) => h.at > tLeftXP).at(-1)?.at ?? null;
    measure(
      "BẢN VÁ · LỖ2 — XP nhận bao nhiêu tin SAU chu kỳ gia hạn",
      `${xpAfter.length}/3 (W nhận ${wAfter.length}/3, tai XP còn sống=${xpEarAlive}) ⇒ ` +
        (xpAfter.length === 0 && wAfter.length === 3 && xpEarAlive
          ? "CHU KỲ GIA HẠN ĐÃ ĐÓNG LỖ"
          : "LỖ CHƯA ĐÓNG hoặc chưa kết luận được"),
    );
    measure(
      "BẢN VÁ · LỖ2 — Realtime từ chối kênh conv: của XP lúc nào sau lời gọi gia hạn",
      kickEvt === null
        ? "KHÔNG có trạng thái từ chối nào (⇒ join lại VẪN được chấp nhận — lỗ chưa đóng!)"
        : `${((kickEvt.at - tRenew) / 1000).toFixed(1)}s sau applyRealtimeAuth · ` +
          `status=${kickEvt.status} · lý do=${kickEvt.err ?? "(không có)"}`,
    );
    measure(
      "BẢN VÁ · LỖ2 — độ rộng cửa sổ ĐO ĐƯỢC trong lần chạy này (giây)",
      lastLeakAt === null
        ? "0 — XP không nhận gì sau leftAt"
        : `${((lastLeakAt - tLeftXP) / 1000).toFixed(1)}s tính từ leftAt tới event CUỐI CÙNG ` +
          `lọt tới XP · (gia hạn được gọi TAY ở ${((tRenew - tLeftXP) / 1000).toFixed(1)}s ` +
          `sau leftAt — trong sản phẩm mốc đó do bộ hẹn giờ ${PROD_RENEW_RATIO * 100}% TTL ` +
          `quyết định, tức tối đa ${PROD_TOKEN_TTL_SECONDS * PROD_RENEW_RATIO}s)`,
    );
    measure(
      "BẢN VÁ · LỖ2 — mốc hiệu lực applyRealtimeAuth trả về (dùng để hẹn lần gia hạn kế)",
      `${effXP} (vé vừa xin hết hạn ${new Date(tkXP2.expAtMs).toISOString()})`,
    );
    measure("BẢN VÁ · LỖ2 — lịch sử trạng thái hai kênh", "");
    console.log(`      ${pLine(pConv, tB5)}`);
    console.log(`      ${pLine(pUser, tB5)}`);

    // ════════════════════════════════════════════════════════════════════════
    // LỖ 1 — GỠ TIN ĐỌC NGƯỜI NHẬN NGOÀI TRANSACTION
    // ════════════════════════════════════════════════════════════════════════
    if (SKIP_LO1) {
      console.log("\n───── LỖ 1: BỎ QUA (ZZ_SKIP_LO1=1) ─────");
    } else {
      console.log("\n───── LỖ 1: cửa sổ đua giữa `leftAt` và broadcast gỡ tin ─────");

      const tkV = await mintToken({ appUserId: uV.id });
      const tkV2 = await mintToken({ appUserId: uV2.id });
      const tkW2 = await mintToken({ appUserId: uW2.id });
      const subV = await openSub("V@user:V (bị gỡ trong lúc gỡ tin)", `user:${uV.id}`, {
        jwt: tkV.jwt,
      });
      const subV2 = await openSub("V2@user:V2 (bị gỡ trong lúc gửi tin)", `user:${uV2.id}`, {
        jwt: tkV2.jwt,
      });
      const subW2 = await openSub("W2@user:W2 (nhân chứng)", `user:${uW2.id}`, { jwt: tkW2.jwt });
      await waitUntil(
        () => isSubscribed(subV) && isSubscribed(subV2) && isSubscribed(subW2),
        20_000,
      );
      gate(
        "G9. ba kênh user: của LỖ 1 đã SUBSCRIBED",
        isSubscribed(subV) && isSubscribed(subV2) && isSubscribed(subW2),
        `${statusOf(subV)} | ${statusOf(subV2)} | ${statusOf(subW2)}`,
      );

      /** Mở một transaction TREO đã set `leftAt` — mô phỏng `syncConversationMembership`
       *  đang chạy dở (tx đó cũng `{timeout:30_000, maxWait:10_000}` theo luật E-bis #2). */
      async function holdLeftAt(participantId: string) {
        let release: () => void = () => {};
        let locked: () => void = () => {};
        const gateP = new Promise<void>((r) => (release = r));
        const lockedP = new Promise<void>((r) => (locked = r));
        const tx = db2.$transaction(
          async (t) => {
            await t.conversationParticipant.update({
              where: { id: participantId },
              data: { leftAt: new Date() },
            });
            locked();
            await gateP;
          },
          { timeout: 30_000, maxWait: 10_000 },
        );
        await lockedP;
        return { release, done: tx };
      }

      const pV = await db.conversationParticipant.findFirstOrThrow({
        where: { conversationId: convB.id, userId: uV.id },
        select: { id: true },
      });
      const pV2 = await db.conversationParticipant.findFirstOrThrow({
        where: { conversationId: convB.id, userId: uV2.id },
        select: { id: true },
      });

      // ── C1: tin để đem gỡ ──────────────────────────────────────────────────
      const msgToDelete = await sendReal(convB.id, "TIN_SE_BI_GO");
      await sleep(2_000);
      const baseV = subV.hits.length;
      const baseV2 = subV2.hits.length;
      const baseW2 = subW2.hits.length;

      // ── C2: ĐƯỜNG GỠ TIN — V bị set leftAt trong một tx CHƯA COMMIT ───────
      // ⚠️ VIẾT LẠI 10/08. Bản cũ gọi gỡ tin rồi mới `hold1.release()` SAU KHI đã có kết
      // quả — hợp lệ khi đường gỡ tin đọc NGOÀI transaction (nó trả về ngay). Sau bản vá,
      // đường gỡ tin khoá dòng participant TRONG tx của nó ⇒ nó CHỜ tx treo, còn tx treo
      // thì chờ `release()` ⇒ khoá chết cho tới khi tx treo hết hạn 30s (P2028). Nay nhả
      // khoá SONG SONG sau HOLD_DEL_MS: cùng dựng được cửa sổ đua, mà đo thêm được một
      // thứ bản cũ không đo được — đường gỡ tin có THẬT SỰ bị chặn chờ khoá không.
      const HOLD_DEL_MS = 5_000;
      const hold1 = await holdLeftAt(pV.id);
      const actorMod = await resolveActorUncached(uMod.id);
      const t0del = Date.now();
      const delPromise = deleteMessageAsModeratorAsActor(actorMod, `${P}MOD`, {
        messageId: msgToDelete,
        reason: "ZZTEST đo cửa sổ đua gỡ tin",
      });
      setTimeout(() => hold1.release(), HOLD_DEL_MS);
      const delRes = await delPromise;
      const delMs = Date.now() - t0del;
      await hold1.done;
      await sleep(3_000); // thu event sau khi tx treo đã commit
      const vDeleted = subV.hits
        .slice(baseV)
        .filter((h) => h.payload.kind === "DELETED" && h.payload.messageId === msgToDelete);
      const w2Deleted = subW2.hits
        .slice(baseW2)
        .filter((h) => h.payload.kind === "DELETED" && h.payload.messageId === msgToDelete);
      gate(
        "G9-bis. đường GỠ TIN BỊ CHẶN chờ khoá dòng participant (bằng chứng nó đọc TRONG tx)",
        delMs >= HOLD_DEL_MS - 250,
        `lời gọi mất ${delMs}ms · tx treo giữ khoá ${HOLD_DEL_MS}ms · ` +
          `<${HOLD_DEL_MS}ms ⇒ nó KHÔNG chạm khoá ⇒ vẫn đang đọc ngoài transaction`,
      );

      // ── C2-bis: SAU KHI tx đã COMMIT, V thật sự đã rời — còn rò nữa không? ──
      // Đây là ranh giới quyết định mức nghiêm trọng: nếu SAU commit vẫn rò thì đó là
      // lỗ THƯỜNG TRỰC; nếu hết rò thì cửa sổ ĐÚNG BẰNG thời gian tx `syncConversationMembership`
      // còn treo, và trong khoảng đó việc gỡ CHƯA có hiệu lực (tx có thể rollback).
      const leftV = await db.conversationParticipant.findUniqueOrThrow({
        where: { id: pV.id },
        select: { leftAt: true },
      });
      const baseV_post = subV.hits.length;
      const baseW2_post = subW2.hits.length;
      const msgToDelete3 = await sendReal(convB.id, "TIN_SE_BI_GO_SAU_COMMIT");
      await sleep(2_000);
      const del3 = await deleteMessageAsModeratorAsActor(actorMod, `${P}MOD`, {
        messageId: msgToDelete3,
        reason: "ZZTEST đối chứng sau commit",
      });
      await sleep(4_000);
      const vPost = subV.hits
        .slice(baseV_post)
        .filter((h) => h.payload.messageId === msgToDelete3);
      const w2Post = subW2.hits
        .slice(baseW2_post)
        .filter((h) => h.payload.messageId === msgToDelete3);
      const alivePost = await probeAlive(
        [{ sub: subV, userId: uV.id }],
        `${P}MOI_POST_${randomUUID()}`,
      );
      const vAlivePost = alivePost.get(subV.label) === true;
      gate(
        "G10-bis. ĐỐI CHỨNG DƯƠNG cho vế phủ định sau commit (W2 nhận + kênh V còn sống)",
        del3.ok === true && w2Post.length > 0 && vAlivePost,
        `gỡ_ok=${del3.ok} · W2 nhận ${w2Post.length} event cho tin sau-commit · ` +
          `kênh_V_còn_nghe=${vAlivePost} (false ⇒ số 0 dưới đây KHÔNG kết luận được)`,
      );
      measure(
        "LỖ1 · SAU KHI tx commit (leftAt đã có hiệu lực) — V còn nhận event không",
        `${vPost.length} event (leftAt=${leftV.leftAt ? "đã ghi" : "NULL!"}) · ` +
          `đối_chứng_W2=${w2Post.length} · kênh_V_còn_sống=${vAlivePost} ⇒ ` +
          (vPost.length === 0 && w2Post.length > 0 && vAlivePost
            ? "KHÔNG rò sau commit ⇒ cửa sổ CHỈ tồn tại trong lúc tx còn treo, KHÔNG thường trực"
            : "CÒN RÒ SAU COMMIT ⇒ lỗ THƯỜNG TRỰC, nghiêm trọng hơn hẳn"),
      );

      gate(
        "G10. gỡ tin thành công + nhân chứng W2 nhận bump DELETED",
        delRes.ok === true && w2Deleted.length > 0,
        `ok=${delRes.ok} · W2 nhận ${w2Deleted.length} bump DELETED · thời gian gọi=${delMs}ms`,
      );
      measure(
        "LỖ1 · V (bị gỡ trong tx chạy song song) nhận bump DELETED",
        `${vDeleted.length > 0 ? "CÓ — CỬA SỔ ĐUA VẪN CÒN" : "KHÔNG — cửa sổ đã đóng"} ` +
          `(${vDeleted.length} bump · đối chứng W2=${w2Deleted.length} bump · ` +
          `lời gọi gỡ bị chặn ${delMs}ms ≥ ${HOLD_DEL_MS}ms=${delMs >= HOLD_DEL_MS - 250})`,
      );
      measure("LỖ1 · thời gian lời gọi GỠ TIN khi participant đang bị khoá (ms)", String(delMs));

      // ── C3: ĐỐI CHỨNG — ĐƯỜNG GỬI TIN trong cùng kịch bản ─────────────────
      // `messages.ts:509-516` `updateMany` khoá đúng dòng participant ⇒ lời gọi này phải
      // BỊ CHẶN tới khi tx treo commit, rồi mới đọc danh sách người nhận (đã trừ V2).
      const HOLD_MS = 5_000;
      const hold2 = await holdLeftAt(pV2.id);
      const t0send = Date.now();
      const sendPromise = sendReal(convB.id, "TIN_TRONG_LUC_GO_V2");
      setTimeout(() => hold2.release(), HOLD_MS);
      const msg2 = await sendPromise;
      const sendMs = Date.now() - t0send;
      await hold2.done;
      await sleep(3_000);

      const v2Bumps = subV2.hits.slice(baseV2).filter((h) => h.payload.messageId === msg2);
      const w2Bumps = subW2.hits.slice(baseW2).filter((h) => h.payload.messageId === msg2);
      gate(
        "G11. ĐỐI CHỨNG — W2 nhận bump của tin gửi trong lúc V2 đang bị gỡ",
        w2Bumps.length > 0,
        `W2 nhận ${w2Bumps.length} bump cho messageId=${msg2}`,
      );

      const alive1 = await probeAlive(
        [
          { sub: subV, userId: uV.id },
          { sub: subV2, userId: uV2.id },
        ],
        `${P}MOI_LO1_${randomUUID()}`,
      );
      const aliveV = alive1.get(subV.label) === true;
      const aliveV2 = alive1.get(subV2.label) === true;
      gate(
        "G12. ĐỐI CHỨNG SỐNG — kênh V và V2 vẫn nhận được mồi",
        aliveV && aliveV2,
        `V=${aliveV} V2=${aliveV2} (false ⇒ mọi số 0 của LỖ 1 KHÔNG kết luận được)`,
      );

      measure(
        "LỖ1 · thời gian lời gọi GỬI TIN khi participant đang bị khoá (ms)",
        `${sendMs} (tx treo giữ khoá ${HOLD_MS}ms — ≥${HOLD_MS} nghĩa là đường gửi BỊ CHẶN chờ khoá)`,
      );
      measure(
        "LỖ1 · V2 (đang bị gỡ trong tx chưa commit) nhận bump của tin mới",
        `${v2Bumps.length > 0 ? "CÓ" : "KHÔNG"} (${v2Bumps.length} bump)` +
          ` · đối_chứng_W2=${w2Bumps.length > 0} · kênh_V2_còn_sống=${aliveV2}`,
      );
      measure(
        "LỖ1 · KẾT LUẬN đối chiếu hai đường",
        `gỡ_tin_rò=${vDeleted.length > 0} vs gửi_tin_rò=${v2Bumps.length > 0}` +
          ` · chênh thời gian gọi = ${sendMs - delMs}ms`,
      );
      measure(
        "LỖ1 · độ rộng cửa sổ THẬT",
        `KHÔNG đo trong script này. Cửa sổ = khoảng từ lúc \`leftAt\` được ghi trong tx của ` +
          `syncConversationMembership tới lúc tx đó commit; trần cấu hình = 30_000ms ` +
          `(E-bis #2). Script dựng cửa sổ nhân tạo ${HOLD_MS}ms nên kết quả TẤT ĐỊNH, ` +
          `không phải xác suất.`,
      );
    }
  } finally {
    for (const s of patchedSubs) {
      try {
        s.unsubscribe();
      } catch {
        /* bỏ qua lỗi lúc đóng kênh của module */
      }
    }
    for (const c of clients) {
      try {
        await c.removeAllChannels();
        c.realtime.disconnect();
      } catch {
        /* bỏ qua lỗi lúc đóng kết nối */
      }
    }
    await cleanup();
    const left = await leftovers();
    gate(
      "G99. dọn sạch DB (dùng chung với test.satarobo.vn — cấm để rác)",
      Object.values(left).every((n) => n === 0),
      `còn sót: ${JSON.stringify(left)}`,
    );
    await db.$disconnect();
    await db2.$disconnect();
  }

  // ── Tổng kết ──────────────────────────────────────────────────────────────
  console.log("\n══════════════════ SỐ ĐO ══════════════════");
  for (const m of measures) console.log(`  ${m.key}\n      → ${m.value}`);

  const failed = gates.filter((g) => !g.pass);
  console.log(
    `\n=== CỔNG HỢP LỆ: ${gates.length - failed.length}/${gates.length} PASS ===`,
  );
  if (failed.length > 0) {
    for (const f of failed) console.log(`FAIL: ${f.step} — ${f.detail}`);
    console.log(
      "=== CÓ CỔNG HỎNG ⇒ SỐ ĐO Ở TRÊN KHÔNG KẾT LUẬN ĐƯỢC (không được đọc là 'đã bị chặn') ===",
    );
    process.exitCode = 1;
  } else {
    console.log("=== MỌI CỔNG HỢP LỆ ĐỀU XANH ⇒ SỐ ĐO Ở TRÊN CÓ GIÁ TRỊ ===");
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
