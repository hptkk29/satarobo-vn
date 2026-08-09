/**
 * ZZTEST US-02 / TS-02 — cách ly realtime private channel trên DB + Realtime DEV THẬT.
 *
 *   pnpm exec tsx scripts/_zztest-chat-us02.ts
 *
 * Kịch bản (TestScenarios TS-02 + bonus đường server):
 *   1. Participant hiệu lực subscribe `conv:{id}` private → SUBSCRIBED.
 *   2. User KHÔNG phải participant → không bao giờ SUBSCRIBED (CHANNEL_ERROR/CLOSED),
 *      không nhận payload nào trong suốt phiên.
 *   3. Participant có leftAt đã set → như bước 2.
 *   4. Client gọi channel.send broadcast trực tiếp → bị từ chối (không có policy
 *      INSERT): send !== 'ok' HOẶC listener participant khác không nhận được gì.
 *   5. CANARY TS-02.5: subscribe topic bằng anon key thuần, KHÔNG private:true →
 *      nếu SUBSCRIBED nghĩa là "Allow public access" đang BẬT → FAIL toàn script.
 *   6. Bonus: service role broadcast vào topic → participant nhận payload ≤5s.
 *
 * Seed 2 user + 1 conversation + participant (prefix ZZTEST_CHAT_US02),
 * cleanup try/finally + dọn rác lần chạy trước (idempotent).
 * CHẠY 2 LẦN — cả 2 lần PASS toàn bộ mới đạt (quy tắc dự án).
 */
import "./_load-env";
import { currentDbHost } from "./_load-env";
import { db } from "@/lib/db";
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { v5 as uuidv5 } from "uuid";

const PREFIX = "ZZTEST_CHAT_US02";
const EMAIL_1 = "zztest-chat-us02-participant@zztest.local";
const EMAIL_2 = "zztest-chat-us02-outsider@zztest.local";
// PHẢI trùng namespace trong lib/chat/realtime-token.ts (file đó là server-only,
// không import được dưới tsx — nên mint lại tại đây theo đúng thiết kế mục B).
const SUB_NAMESPACE = "7d5c1af6-2b4e-4c39-9f1d-8a0e3b6d2c91";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

type StepResult = { step: string; pass: boolean; detail: string };
const results: StepResult[] = [];
function record(step: string, pass: boolean, detail: string) {
  results.push({ step, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} · ${step} — ${detail}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function mintToken(userId: string): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  return new SignJWT({ app_user_id: userId, role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(uuidv5(userId, SUB_NAMESPACE))
    .setAudience("authenticated")
    .setIssuedAt(iat)
    .setExpirationTime(iat + 15 * 60)
    .sign(new TextEncoder().encode(JWT_SECRET));
}

function newClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type Sub = {
  client: SupabaseClient;
  channel: RealtimeChannel;
  statuses: string[];
  payloads: unknown[];
};

/**
 * Subscribe topic và quan sát trong `watchMs`: ghi lại MỌI status + payload.
 * Trả về sớm khi đạt SUBSCRIBED (case dương); case âm chờ hết cửa sổ để chắc
 * rejoin-retry cũng không lọt vào.
 */
async function subscribeAndWatch(
  client: SupabaseClient,
  topic: string,
  opts: { privateChannel: boolean; jwt?: string; watchMs: number; stopOnSubscribed: boolean },
): Promise<Sub> {
  if (opts.jwt) await client.realtime.setAuth(opts.jwt);
  const channel = client.channel(topic, {
    config: opts.privateChannel ? { private: true } : {},
  });
  const sub: Sub = { client, channel, statuses: [], payloads: [] };
  channel.on("broadcast", { event: "*" }, (msg) => {
    sub.payloads.push(msg);
  });
  channel.subscribe((status) => {
    sub.statuses.push(status);
  });
  const deadline = Date.now() + opts.watchMs;
  while (Date.now() < deadline) {
    if (opts.stopOnSubscribed && sub.statuses.includes("SUBSCRIBED")) break;
    await sleep(200);
  }
  return sub;
}

async function cleanup(convId?: string) {
  // Dọn theo dấu vết cố định — an toàn chạy lại nhiều lần, kể cả sau lần vỡ giữa chừng.
  const conv = await db.conversation.findFirst({ where: { dmKey: `${PREFIX}_DM` } });
  const targetConvId = convId ?? conv?.id;
  if (targetConvId) {
    await db.message.deleteMany({ where: { conversationId: targetConvId } });
    await db.conversationParticipant.deleteMany({ where: { conversationId: targetConvId } });
    await db.conversation.deleteMany({ where: { id: targetConvId } });
  }
  await db.user.deleteMany({ where: { email: { in: [EMAIL_1, EMAIL_2] } } });
}

async function main() {
  console.log(`DB host: ${currentDbHost()}`);
  for (const [name, val] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_JWT_SECRET: JWT_SECRET,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  })) {
    if (!val) throw new Error(`Thiếu env ${name} trong .env.local`);
  }

  // Bằng chứng policy US-02 tồn tại (pg_policies) — SELECT duy nhất, không INSERT.
  const policies = await db.$queryRaw<{ policyname: string; cmd: string }[]>`
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages'`;
  const hasSelect = policies.some(
    (p) => p.policyname === "participant_can_receive_conversation_broadcast" && p.cmd === "SELECT",
  );
  const hasInsert = policies.some((p) => p.cmd === "INSERT");
  record(
    "0. policy pg_policies",
    hasSelect && !hasInsert,
    `policies=${JSON.stringify(policies)}`,
  );
  if (!hasSelect) throw new Error("Policy SELECT chưa tồn tại — apply migration trước");

  await cleanup(); // idempotent — dọn rác lần chạy trước nếu có

  const clients: SupabaseClient[] = [];
  let convId: string | undefined;
  try {
    // ── Seed ──────────────────────────────────────────────────────────────
    const u1 = await db.user.create({
      data: { email: EMAIL_1, name: `${PREFIX} participant`, role: "PARENT", roles: ["PARENT"] },
    });
    const u2 = await db.user.create({
      data: { email: EMAIL_2, name: `${PREFIX} outsider`, role: "PARENT", roles: ["PARENT"] },
    });
    const conv = await db.conversation.create({
      data: { type: "DM_TEACHER_PARENT", subjectType: "NONE", dmKey: `${PREFIX}_DM`, title: PREFIX },
    });
    convId = conv.id;
    await db.conversationParticipant.create({
      data: { conversationId: conv.id, userId: u1.id, role: "MEMBER", source: "MANUAL" },
    });
    const topic = `conv:${conv.id}`;
    console.log(`Seed xong: conv=${conv.id}`);

    // ── 1. Participant subscribe private → SUBSCRIBED ─────────────────────
    const c1 = newClient();
    clients.push(c1);
    const s1 = await subscribeAndWatch(c1, topic, {
      privateChannel: true,
      jwt: await mintToken(u1.id),
      watchMs: 10_000,
      stopOnSubscribed: true,
    });
    record(
      "1. participant SUBSCRIBED",
      s1.statuses.includes("SUBSCRIBED"),
      `statuses=${JSON.stringify(s1.statuses)}`,
    );

    // ── 2. Non-participant → CHANNEL_ERROR/CLOSED, không SUBSCRIBED ───────
    const c2 = newClient();
    clients.push(c2);
    const s2 = await subscribeAndWatch(c2, topic, {
      privateChannel: true,
      jwt: await mintToken(u2.id),
      watchMs: 6_000,
      stopOnSubscribed: false,
    });
    const s2Denied =
      !s2.statuses.includes("SUBSCRIBED") &&
      s2.statuses.some((s) => s === "CHANNEL_ERROR" || s === "CLOSED" || s === "TIMED_OUT");
    record(
      "2. non-participant bị chặn",
      s2Denied,
      `statuses=${JSON.stringify(s2.statuses)}`,
    );

    // ── 3. Participant đã rời (leftAt set) → như bước 2 ───────────────────
    await db.conversationParticipant.create({
      data: {
        conversationId: conv.id,
        userId: u2.id,
        role: "MEMBER",
        source: "MANUAL",
        leftAt: new Date(),
      },
    });
    const c3 = newClient();
    clients.push(c3);
    const s3 = await subscribeAndWatch(c3, topic, {
      privateChannel: true,
      jwt: await mintToken(u2.id),
      watchMs: 6_000,
      stopOnSubscribed: false,
    });
    const s3Denied =
      !s3.statuses.includes("SUBSCRIBED") &&
      s3.statuses.some((s) => s === "CHANNEL_ERROR" || s === "CLOSED" || s === "TIMED_OUT");
    record("3. participant leftAt bị chặn", s3Denied, `statuses=${JSON.stringify(s3.statuses)}`);

    // ── 4. Client tự send broadcast → bị từ chối (không có policy INSERT) ──
    // Listener "phía kia": kết nối thứ hai của chính participant u1.
    const c4 = newClient();
    clients.push(c4);
    const s4listener = await subscribeAndWatch(c4, topic, {
      privateChannel: true,
      jwt: await mintToken(u1.id),
      watchMs: 10_000,
      stopOnSubscribed: true,
    });
    if (!s4listener.statuses.includes("SUBSCRIBED")) {
      record("4. client send bị từ chối", false, "listener phụ không SUBSCRIBED được — không kết luận");
    } else {
      const before = s4listener.payloads.length;
      const sendResult = await s1.channel.send({
        type: "broadcast",
        event: "zztest-client-send",
        payload: { from: "client", t: Date.now() },
      });
      await sleep(3_000);
      const received = s4listener.payloads.length - before;
      record(
        "4. client send bị từ chối",
        sendResult !== "ok" || received === 0,
        `sendResult=${String(sendResult)}, listener nhận thêm=${received}`,
      );
    }

    // ── 5. CANARY TS-02.5: anon thuần + channel KHÔNG private ─────────────
    const c5 = newClient(); // KHÔNG setAuth JWT user — anon key thuần
    clients.push(c5);
    const s5 = await subscribeAndWatch(c5, topic, {
      privateChannel: false,
      watchMs: 8_000,
      stopOnSubscribed: true,
    });
    const publicOpen = s5.statuses.includes("SUBSCRIBED");
    record(
      "5. CANARY public access",
      !publicOpen,
      publicOpen
        ? "CANARY: Allow public access dang BAT - vao Supabase Dashboard > Realtime Settings tat di"
        : `statuses=${JSON.stringify(s5.statuses)} (public channel bị từ chối — đúng)`,
    );

    // ── 6. Bonus: service role broadcast → participant nhận ≤5s ───────────
    const before6 = s1.payloads.length;
    const resp = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            topic,
            event: "zztest-server-broadcast",
            payload: { from: "service-role", t: Date.now() },
            private: true,
          },
        ],
      }),
    });
    const deadline6 = Date.now() + 5_000;
    while (Date.now() < deadline6 && s1.payloads.length === before6) await sleep(200);
    const got6 = s1.payloads.length > before6;
    record(
      "6. service role broadcast tới participant",
      resp.status < 300 && got6,
      `http=${resp.status}, participant nhận=${s1.payloads.length - before6} payload trong 5s`,
    );

    // Xác nhận xuyên suốt: 2 client bị chặn không nhận payload nào.
    record(
      "2b/3b. bị chặn không nhận payload nào",
      s2.payloads.length === 0 && s3.payloads.length === 0,
      `outsider=${s2.payloads.length}, left=${s3.payloads.length}`,
    );
  } finally {
    for (const c of clients) {
      try {
        await c.removeAllChannels();
        c.realtime.disconnect();
      } catch {
        /* bỏ qua lỗi đóng kết nối lúc dọn */
      }
    }
    await cleanup(convId);
    await db.$disconnect();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== KẾT QUẢ: ${results.length - failed.length}/${results.length} PASS ===`);
  if (failed.length > 0) {
    for (const f of failed) console.log(`FAIL: ${f.step} — ${f.detail}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    // WebSocket/timer có thể giữ event loop — thoát tường minh theo exitCode.
    setTimeout(() => process.exit(process.exitCode ?? 0), 500);
  });
