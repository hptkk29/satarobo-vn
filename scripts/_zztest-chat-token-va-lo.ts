/**
 * ZZTEST — ĐO hai điểm mù chưa từng có số đo thật trên Supabase Realtime:
 *
 *   LỖ 3 — gia hạn token GIỮA PHIÊN (`realtime.setAuth`) và hạn sống của kênh khi
 *          token HẾT HẠN mà không gia hạn. Con số (c) chính là CẬN TRÊN của LỖ 2
 *          ("người đã bị gỡ khỏi nhóm còn nghe được bao lâu"), nên phải ĐO chứ
 *          không được ước lượng.
 *   LỖ 4 — fan-out vượt `BROADCAST_MAX_PER_POST = 200` (lib/chat/broadcast.ts:43).
 *          Đường >200 chưa từng chạy dù chỉ một lần, kể cả trên dev.
 *
 *   pnpm exec tsx scripts/_zztest-chat-token-va-lo.ts
 *
 * ⚠️ TẤT CẢ unit test của hai nhánh này đều là fake-timer + transport giả
 * (`components/chat/use-chat-channel.test.ts`, `user-channel.test.ts`) ⇒ xoá sạch
 * logic gia hạn hoặc đổi ngưỡng lô thì typecheck+lint+build+unit VẪN XANH.
 *
 * ⛔ LUẬT CHỐNG PASS GIẢ (áp cho MỌI vế phủ định trong file này):
 * "im lặng vì bị chặn" và "im lặng vì chẳng có gì để nhận" trông y hệt nhau.
 * Mỗi lần kết luận "không nhận được" phải có ĐỦ HAI đối chứng DƯƠNG trong CÙNG
 * lần chạy:
 *   (a) event đó CÓ THẬT và đã tới được một kênh khác đủ quyền (kênh CONTROL);
 *   (b) kênh đang xét THẬT SỰ còn sống — bắn mồi thẳng vào kênh riêng của họ
 *       (`probeAlive`) và thấy nó tới.
 * Riêng LỖ 3(c) thì (b) bị ĐẢO: chính việc kênh chết là thứ đang đo, nên đối
 * chứng là "kênh đó đã nhận được tick TRƯỚC khi token hết hạn" + "kênh CONTROL
 * vẫn nhận sau đó".
 *
 * Quy ước ZZTEST: prefix `ZZTEST_CHAT_TOKENLO_`, ép DIRECT_URL, cleanup try/finally
 * + dọn rác lần chạy trước (idempotent), không in giá trị secret, CHẠY 2 LẦN.
 *
 * ⚠️ Script này dựng 266 User + 267 ConversationParticipant trên DB DÙNG CHUNG với
 * test.satarobo.vn ⇒ cleanup bắt buộc, và cuối cùng in SỐ BẢN GHI CÒN SÓT để chứng
 * minh đã sạch (bước "9. dọn sạch").
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

// ⚠️ `lib/chat/broadcast.ts` + `lib/chat/realtime-token.ts` mở đầu bằng `import "server-only"`
// (package do Next cấp lúc build, KHÔNG có trong node_modules) → trỏ về stub của vitest.
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

// ⚠️ Ép DIRECT_URL TRƯỚC khi import động `lib/chat/*` (bám singleton `@/lib/db`, đọc
// DATABASE_URL LÚC KHỞI TẠO). Không ép thì lần chạy THỨ HAI dính 42P05 của transaction pooler.
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
const chatModule = import("../lib/chat/messages");
const actorModule = import("../lib/auth/actor");
const broadcastModule = import("../lib/chat/broadcast");
/**
 * Tầng điều phối vé của BẢN VÁ (`applyRealtimeAuth` — chu kỳ rời-đổi-join mức kết nối).
 * File đó mở đầu bằng `"use client"`, dưới `tsx` chỉ là một biểu thức chuỗi ⇒ nạp được;
 * nó chỉ cần `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
 * ⚠️ Phải đo ĐƯỜNG NÀY chứ không phải `setAuth` trần: `setAuth` trần vẫn giết kênh (bước
 * 3c/3d/3d-quater bên dưới là bằng chứng), câu hỏi cần trả lời là bản vá có thoát khỏi nó không.
 */
const patchedAuthModule = import("../lib/chat/supabase-client");

const db = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const P = "ZZTEST_CHAT_TOKENLO_";
const ROLE_CODE = `${P}PARENT`;
const EMAIL_PREFIX = "zztest-chat-tokenlo-";
const EMAIL = (slug: string) => `${EMAIL_PREFIX}${slug}@zztest.local`;

/** Số người nhận của hội thoại LỖ 4 — 260 người ⇒ mảng phát 261 phần tử ⇒ CHẮC CHẮN 2 lô. */
const FANOUT_RECIPIENTS = 260;
/** Vị trí (theo thứ tự seed) của những người được mở socket thật để quan sát. */
const SAMPLE_POS = [0, 1, 99, 100, 150, 198, 199, 200, 201, 202, 203, 259] as const;
/**
 * Trần lô đang khai trong lib/chat/broadcast.ts — script KHÔNG import hằng (nó không export).
 * ⚠️ 10/08: hạ 200 → 60 sau khi đo được endpoint TỪ CHỐI lô 200 (HTTP 429 "reduce the batch
 * size", 0 người nhận). Con số ở đây phải BÁM theo lib, nếu không bước 4a/4e đo đúng nhưng
 * kết luận sai chỉ vì kỳ vọng lỗi thời.
 */
const MAX_PER_POST = 60;

// PHẢI trùng namespace trong lib/chat/realtime-token.ts:20.
const SUB_NAMESPACE = "7d5c1af6-2b4e-4c39-9f1d-8a0e3b6d2c91";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
/** ZZ_SKIP_LO4=1 ⇒ bỏ phần LỖ 4 (nó làm endpoint xuống cấp) để đo LỖ 3 cho sạch. */
const SKIP_LO4 = process.env.ZZ_SKIP_LO4 === "1";

type StepResult = { step: string; pass: boolean; detail: string };
const results: StepResult[] = [];
function report(step: string, pass: boolean, detail: string) {
  results.push({ step, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${step} — ${detail}`);
}
/** Số đo thuần tuý (không phải cổng pass/fail) — vẫn phải in ra để người điều phối đọc. */
function measure(label: string, value: string) {
  console.log(`  ↳ ĐO  ${label}: ${value}`);
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

// ── Bắt POST broadcast THẬT (đếm số lô, kích thước lô, thời gian) ────────────
// Không sửa được lib/chat/broadcast.ts (agent khác đang giữ), và cũng KHÔNG NÊN:
// đo bằng cách bọc `globalThis.fetch` cho ra đúng số lần gọi mạng THẬT mà hàm đó
// phát ra, kể cả khi nó đổi cách chia lô.
type PostCapture = { at: number; ms: number; status: number; topics: string[]; body: string };
let captures: PostCapture[] | null = null;
const origFetch: typeof globalThis.fetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!captures || !url.includes("/realtime/v1/api/broadcast")) {
    return origFetch(input as RequestInfo, init);
  }
  let topics: string[] = [];
  try {
    const parsed = JSON.parse(String(init?.body ?? "{}")) as { messages?: { topic?: string }[] };
    topics = (parsed.messages ?? []).map((m) => String(m.topic ?? "?"));
  } catch {
    /* body không phải JSON — vẫn ghi nhận lời gọi */
  }
  // ⚠️ Ghi nhận NGAY lúc PHÁT lời gọi, không phải lúc nhận phản hồi: `broadcastMessages`
  // bắn các lô SONG SONG bằng `Promise.allSettled`, ghi sau `await` thì thứ tự mảng
  // `captures` là thứ tự lô nào về trước ⇒ không còn ánh xạ được "lô 1 / lô 2".
  const rec: PostCapture = { at: Date.now(), ms: -1, status: -1, topics, body: "" };
  captures.push(rec);
  const res = await origFetch(input as RequestInfo, init);
  rec.ms = Date.now() - rec.at;
  rec.status = res.status;
  if (!res.ok) {
    // `clone()` để KHÔNG nuốt body của caller (broadcastMessages không đọc body, nhưng
    // đừng để phép đo làm đổi hành vi thứ đang đo).
    rec.body = (await res.clone().text()).slice(0, 300);
  }
  return res;
}) as typeof globalThis.fetch;

function startCapture(): void {
  captures = [];
}
function stopCapture(): PostCapture[] {
  const out = captures ?? [];
  captures = null;
  return out;
}
function batchSizes(caps: PostCapture[]): number[] {
  return caps.map((c) => c.topics.length);
}
/** Cách chia lô mà `broadcastMessages` PHẢI cho ra với trần `MAX_PER_POST`. */
function splitExpect(total: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < total; i += MAX_PER_POST) out.push(Math.min(MAX_PER_POST, total - i));
  return out;
}
function sameSizes(got: number[], want: number[]): boolean {
  return got.length === want.length && got.every((n, i) => n === want[i]);
}
/** Chỉ số PHẲNG của topic trong toàn bộ fan-out (nối các lô theo đúng thứ tự gửi). */
function flatIndexOf(caps: PostCapture[], topic: string): { flat: number; batch: number } | null {
  let base = 0;
  for (let b = 0; b < caps.length; b += 1) {
    const cap = caps[b];
    if (!cap) continue;
    const i = cap.topics.indexOf(topic);
    if (i >= 0) return { flat: base + i, batch: b };
    base += cap.topics.length;
  }
  return null;
}

// ── JWT ─────────────────────────────────────────────────────────────────────

type Minted = { token: string; expAt: number };
async function mintToken(appUserId: string, ttlSeconds = 15 * 60): Promise<Minted> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSeconds;
  const token = await new SignJWT({ role: "authenticated", app_user_id: appUserId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(uuidv5(appUserId, SUB_NAMESPACE))
    .setAudience("authenticated")
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(JWT_SECRET));
  return { token, expAt: exp * 1000 };
}

// ── Realtime helpers ────────────────────────────────────────────────────────

type Hit = { event: string; payload: Record<string, unknown>; at: number };
/** `err` = tham số thứ 2 của `channel.subscribe(cb)` — LÝ DO Realtime đóng/từ chối kênh. */
type StatusRec = { status: string; at: number; err?: string };
type Sub = {
  label: string;
  client: SupabaseClient;
  channel: RealtimeChannel;
  statuses: StatusRec[];
  hits: Hit[];
  /** Mốc hết hạn của token dùng để JOIN (ms epoch) — LỖ 3 đo tương đối với mốc này. */
  expAt: number;
  /**
   * Nhịp heartbeat của socket (realtime-js đập 25s/lần). Ghi lại để đối chiếu thời điểm
   * kênh bị đóng — nghi vấn từ 2 lần chạy đầu: kênh vừa `setAuth` chết đúng vào nhịp
   * heartbeat KẾ TIẾP, chứ không chết ngay lúc gọi.
   */
  heartbeats: { at: number; status: string; latency?: number }[];
};

const clients: SupabaseClient[] = [];
/** Kênh mở qua module sản phẩm — phải tự đóng ở `finally`, module không nằm trong `clients`. */
const patchedSubs: { unsubscribe: () => void }[] = [];
function newClient(): SupabaseClient {
  const c = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  clients.push(c);
  return c;
}

/**
 * Mở thêm MỘT kênh trên client đã có (dùng để dựng lại hình dạng thật của một tab:
 * `conv:` + `user:` trên CÙNG một kết nối). KHÔNG gọi `setAuth` lần nữa.
 */
async function openSubOn(client: SupabaseClient, label: string, topic: string, minted: Minted) {
  return openSubRaw(client, label, topic, minted);
}

async function openSub(label: string, topic: string, minted: Minted): Promise<Sub> {
  const client = newClient();
  await client.realtime.setAuth(minted.token);
  return openSubRaw(client, label, topic, minted);
}

/** Như `openSub` nhưng KHÔNG chờ `setAuth` — dựng lại đúng hình dạng của bản vá. */
async function openSubVoidAuth(label: string, topic: string, minted: Minted): Promise<Sub> {
  const client = newClient();
  void client.realtime.setAuth(minted.token);
  return openSubRaw(client, label, topic, minted);
}

async function openSubRaw(
  client: SupabaseClient,
  label: string,
  topic: string,
  minted: Minted,
): Promise<Sub> {
  const channel = client.channel(topic, { config: { private: true } });
  const sub: Sub = {
    label,
    client,
    channel,
    statuses: [],
    hits: [],
    expAt: minted.expAt,
    heartbeats: [],
  };
  client.realtime.onHeartbeat((status: string, latency?: number) =>
    sub.heartbeats.push({ at: Date.now(), status, latency }),
  );
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
 * ⚠️ LỊCH SỬ, không phải "đang sống": mảng `statuses` chỉ được ghi thêm ⇒ hàm này
 * trả true mãi mãi kể từ lần SUBSCRIBED đầu tiên, kể cả khi socket đã chết sau đó.
 * KHÔNG dùng nó làm đối chứng cho các bước "phải KHÔNG nhận được gì".
 */
function isSubscribed(s: Sub) {
  return s.statuses.some((x) => x.status === "SUBSCRIBED");
}
function statusLine(s: Sub, t0: number) {
  return `${s.label}: ${s.statuses
    .map(
      (x) =>
        `${x.status}@+${((x.at - t0) / 1000).toFixed(1)}s` +
        (x.err ? `(lý do: ${x.err})` : ""),
    )
    .join(",")} · exp@+${((s.expAt - t0) / 1000).toFixed(1)}s hits=${s.hits.length}`;
}
/** Trạng thái lỗi TƯỜNG MINH đầu tiên xuất hiện SAU mốc `after`. */
function firstErrorAfter(s: Sub, after: number): StatusRec | null {
  return (
    s.statuses.find(
      (x) =>
        x.at > after &&
        (x.status === "CHANNEL_ERROR" || x.status === "CLOSED" || x.status === "TIMED_OUT"),
    ) ?? null
  );
}

/** Bắn MỘT POST service-role mang nhiều topic — đúng đường `broadcastMessages` đang dùng. */
async function serviceBroadcastFull(
  messages: { topic: string; event: string; payload: Record<string, unknown> }[],
): Promise<{ status: number; body: string }> {
  const res = await origFetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages: messages.map((m) => ({ ...m, private: true })) }),
  });
  const body = res.ok ? "" : (await res.text()).slice(0, 200);
  return { status: res.status, body };
}
async function serviceBroadcast(
  messages: { topic: string; event: string; payload: Record<string, unknown> }[],
): Promise<number> {
  return (await serviceBroadcastFull(messages)).status;
}

/**
 * ĐỐI CHỨNG SỐNG cho các bước "phải KHÔNG nhận được gì": bắn mồi thẳng vào kênh
 * RIÊNG của từng người rồi bắt buộc kênh đó nhận được. Nhận được ⇒ tại ĐÚNG khoảng
 * thời gian vừa đo, socket còn sống, token còn hiệu lực, tai còn nghe được.
 */
async function probeAlive(
  targets: { sub: Sub; userId: string }[],
  mark: string,
): Promise<Map<string, boolean>> {
  if (targets.length === 0) return new Map();
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

// ── Ticker (nguồn phát nhịp cho LỖ 3) ───────────────────────────────────────

type Tick = { seq: number; at: number; http: number };
type Ticker = { ticks: Tick[]; stop: () => void; done: Promise<void> };

function startTicker(topic: string, phase: string, intervalMs: number, maxSeq: number): Ticker {
  const ticks: Tick[] = [];
  let stopped = false;
  const done = (async () => {
    let seq = 0;
    while (!stopped && seq < maxSeq) {
      seq += 1;
      const at = Date.now();
      const http = await serviceBroadcast([
        { topic, event: "zztest.tick", payload: { phase, seq, at } },
      ]);
      ticks.push({ seq, at, http });
      await sleep(intervalMs);
    }
  })();
  return { ticks, stop: () => (stopped = true), done };
}

// ── Ghi nhận cho kênh mở qua MODULE SẢN PHẨM (bản vá) ───────────────────────
// Không dùng `Sub` được: module tự giữ `RealtimeChannel` bên trong (và thay nó mỗi lần gia
// hạn), script chỉ nắm được hai callback. Đó CHÍNH LÀ điều đang đo — nếu script cầm được
// channel thì nó đang đo một đường khác với đường sản phẩm chạy.
type PatchedRec = { label: string; hits: Hit[]; statuses: StatusRec[] };
function newPatchedRec(label: string): PatchedRec {
  return { label, hits: [], statuses: [] };
}
function patchedHandlers(rec: PatchedRec) {
  return {
    onBroadcast: (event: string, payload: Record<string, unknown>) =>
      rec.hits.push({ event, payload, at: Date.now() }),
    onStatus: (status: string, err?: Error) =>
      rec.statuses.push({ status, at: Date.now(), err: err ? err.message : undefined }),
  };
}
function patchedTickSeqs(rec: PatchedRec, phase: string): Set<number> {
  const out = new Set<number>();
  for (const h of rec.hits) {
    if (h.event === "zztest.tick" && h.payload.phase === phase) out.add(Number(h.payload.seq));
  }
  return out;
}
function patchedLastTickAt(rec: PatchedRec, phase: string): number | null {
  let last: number | null = null;
  for (const h of rec.hits) {
    if (h.event === "zztest.tick" && h.payload.phase === phase) last = h.at;
  }
  return last;
}
function patchedStatusLine(rec: PatchedRec, t0: number): string {
  return `${rec.label}: ${rec.statuses
    .map((x) => `${x.status}@+${((x.at - t0) / 1000).toFixed(1)}s` + (x.err ? `(${x.err})` : ""))
    .join(",")} hits=${rec.hits.length}`;
}

function tickSeqs(s: Sub, phase: string): Set<number> {
  const out = new Set<number>();
  for (const h of s.hits) {
    if (h.event === "zztest.tick" && h.payload.phase === phase) out.add(Number(h.payload.seq));
  }
  return out;
}
function lastTickAt(s: Sub, phase: string): number | null {
  let last: number | null = null;
  for (const h of s.hits) {
    if (h.event === "zztest.tick" && h.payload.phase === phase) last = h.at;
  }
  return last;
}
function firstTickAt(s: Sub, phase: string): number | null {
  for (const h of s.hits) {
    if (h.event === "zztest.tick" && h.payload.phase === phase) return h.at;
  }
  return null;
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

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
    where: { email: { startsWith: EMAIL_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    // Participant mồ côi (hội thoại đã bị xoá ở lần chạy trước mà hàng participant còn).
    await db.conversationParticipant.deleteMany({ where: { userId: { in: userIds } } });
    await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await db.userOrgRole.deleteMany({ where: { userId: { in: userIds } } });
  }

  const role = await db.roleDef.findUnique({ where: { code: ROLE_CODE } });
  if (role) {
    await db.userOrgRole.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.roleDef.delete({ where: { id: role.id } });
  }

  await db.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
}

/** Đếm rác còn sót — bằng chứng "đã dọn sạch" chứ không phải lời hứa. */
async function leftovers(): Promise<Record<string, number>> {
  const [convs, users, roles] = await Promise.all([
    db.conversation.count({ where: { title: { startsWith: P } } }),
    db.user.count({ where: { email: { startsWith: EMAIL_PREFIX } } }),
    db.roleDef.count({ where: { code: ROLE_CODE } }),
  ]);
  return { conversation: convs, user: users, roleDef: roles };
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
      "Script này đo hành vi của Supabase Realtime THẬT (gia hạn token + fan-out >200).",
      "Không có 4 biến trên thì KHÔNG đo được gì — không giả vờ pass, thoát mã 1.",
      "Điền vào .env.local (project Supabase DEV, KHÔNG PROD). Không dán giá trị vào chat.",
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
  const { broadcastMessages } = await broadcastModule;

  // ── 0. Policy phải TỒN TẠI (thứ CI không bao giờ chứng minh được) ─────────
  const policies = await db.$queryRaw<{ policyname: string; cmd: string }[]>`
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages'`;
  const hasUserPolicy = policies.some(
    (p) => p.policyname === "user_can_receive_own_user_broadcast" && p.cmd === "SELECT",
  );
  const hasConvPolicy = policies.some(
    (p) =>
      p.policyname === "participant_can_receive_conversation_broadcast" && p.cmd === "SELECT",
  );
  const hasInsert = policies.some((p) => p.cmd === "INSERT");
  report(
    "0. policy realtime.messages",
    hasUserPolicy && hasConvPolicy && !hasInsert,
    `user_policy=${hasUserPolicy} conv_policy=${hasConvPolicy} có_INSERT=${hasInsert}`,
  );
  if (!hasUserPolicy || !hasConvPolicy) {
    console.error("\n⛔ Thiếu policy — mọi phép đo sau vô nghĩa, dừng tại đây.\n");
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
        name: "ZZTEST token + lô broadcast",
        permissions: {
          create: [
            { action: "chat:send", scopeType: "OWN" },
            { action: "chat:read", scopeType: "OWN" },
          ],
        },
      },
    });

    // KHÔNG set `User.phone` (unique toàn DB — nhét số thật vào là tự đặt bẫy đụng hàng).
    const mkUser = (slug: string) =>
      db.user.create({
        data: { email: EMAIL(slug), name: `${P}${slug}`, role: "PARENT", roles: ["PARENT"] },
      });
    const uS = await mkUser("s"); // người gửi (cả LỖ 3 và LỖ 4)
    const uCtrl = await mkUser("ctrl"); // CONTROL: token dài, không bao giờ gia hạn
    const uR = await mkUser("r"); // gia hạn 1 lần giữa phiên
    const uR2 = await mkUser("r2"); // gia hạn 2 lần cách nhau 200ms
    // R3: token TTL DÀI (200s, hết hạn ngoài cửa sổ quan sát) + setAuth ở +45s — tức
    // NGAY SAU nhịp heartbeat +37s và TRƯỚC nhịp +62s. Đây là phép thử tách nguyên nhân:
    // chết ở ~+57s ⇒ "một khoảng cố định sau setAuth"; chết ở ~+62s ⇒ "nhịp heartbeat kế
    // tiếp". R và R2 chết CÙNG một mốc tuyệt đối nên hai giả thuyết đó không tách được.
    const uR3 = await mkUser("r3");
    const uE70 = await mkUser("e70"); // sinh đôi của R: TTL 70s nhưng KHÔNG gia hạn
    const uE50 = await mkUser("e50"); // token TTL 50s, KHÔNG gia hạn
    const uE80 = await mkUser("e80"); // token TTL 80s, KHÔNG gia hạn
    // P: sinh đôi THỨ BA của R/E70 (cũng TTL 70s) nhưng gia hạn bằng ĐƯỜNG ĐÃ VÁ
    // (`applyRealtimeAuth` — rời hết kênh → setAuth → join lại). Ba anh em cùng TTL, cùng
    // dòng thời gian, cùng nguồn phát nhịp ⇒ khác biệt duy nhất là CÁCH gia hạn.
    const uP = await mkUser("p");

    await db.userOrgRole.create({
      data: {
        userId: uS.id,
        orgUnitId: orgUnit.id,
        roleId: role.id,
        status: "ACTIVE",
        grantedById: uS.id,
      },
    });

    // 260 người nhận cho LỖ 4 — chỉ cần hàng User + hàng Participant (policy `user:`
    // chỉ so topic với claim `app_user_id`, không đọc bảng nào khác).
    await db.user.createMany({
      data: Array.from({ length: FANOUT_RECIPIENTS }, (_, i) => ({
        email: EMAIL(`r${String(i).padStart(3, "0")}`),
        name: `${P}r${i}`,
        role: "PARENT" as const,
        roles: ["PARENT" as const],
      })),
    });
    // Lấy TẤT CẢ user tiền tố rồi lọc bằng regex `-rNNN@` — `r` và `r2` (LỖ 3) cũng có
    // tiền tố nên `startsWith` một mình sẽ vơ nhầm.
    const recAll = await db.user.findMany({
      where: { email: { startsWith: EMAIL_PREFIX } },
      select: { id: true, email: true },
    });
    const posOf = (email: string): number | null => {
      const m = /-r(\d{3})@/.exec(email);
      return m ? Number(m[1]) : null;
    };
    const recipients: { id: string; pos: number }[] = recAll
      .map((u) => ({ id: u.id, pos: posOf(u.email ?? "") }))
      .filter((x): x is { id: string; pos: number } => x.pos !== null)
      .sort((a, b) => a.pos - b.pos);
    if (recipients.length !== FANOUT_RECIPIENTS) {
      throw new Error(`Seed hỏng: ${recipients.length}/${FANOUT_RECIPIENTS} người nhận`);
    }

    const conv3 = await db.conversation.create({
      data: {
        type: "CLASS_GROUP",
        subjectType: "NONE",
        status: "ACTIVE",
        title: `${P}conv_lo3`,
      },
    });
    for (const u of [uS, uCtrl, uR, uR2, uR3, uE70, uE50, uE80, uP]) {
      await db.conversationParticipant.create({
        data: { conversationId: conv3.id, userId: u.id, role: "MEMBER", source: "MANUAL" },
      });
    }

    // conv5 chỉ để V3 có một topic CHƯA dùng trên kết nối V2 (xem chú thích V3).
    const conv5 = await db.conversation.create({
      data: {
        type: "CLASS_GROUP",
        subjectType: "NONE",
        status: "ACTIVE",
        title: `${P}conv_v3`,
      },
    });
    await db.conversationParticipant.create({
      data: { conversationId: conv5.id, userId: uP.id, role: "MEMBER", source: "MANUAL" },
    });

    const conv4 = await db.conversation.create({
      data: {
        type: "CLASS_GROUP",
        subjectType: "NONE",
        status: "ACTIVE",
        title: `${P}conv_lo4`,
      },
    });
    await db.conversationParticipant.create({
      data: { conversationId: conv4.id, userId: uS.id, role: "MEMBER", source: "MANUAL" },
    });
    await db.conversationParticipant.createMany({
      data: recipients.map((r) => ({
        conversationId: conv4.id,
        userId: r.id,
        role: "MEMBER" as const,
        source: "MANUAL" as const,
      })),
    });
    console.log(
      `Seed xong: conv3=${conv3.id} conv4=${conv4.id} · người nhận LỖ 4=${recipients.length}`,
    );

    const actorS = await resolveActorUncached(uS.id);

    // ══════════════════════════════════════════════════════════════════════
    // LỖ 4 — fan-out vượt ngưỡng lô (chạy trước vì nhanh)
    // ══════════════════════════════════════════════════════════════════════
    const samples = SAMPLE_POS.map((pos) => {
      const r = recipients[pos];
      if (!r) throw new Error(`không có người nhận ở vị trí ${pos}`);
      return { pos, userId: r.id };
    });
    const sampleSubs: { pos: number; userId: string; sub: Sub }[] = [];
    for (const s of samples) {
      const minted = await mintToken(s.userId, 30 * 60);
      sampleSubs.push({
        ...s,
        sub: await openSub(`mẫu#${s.pos}`, `user:${s.userId}`, minted),
      });
    }
    const allSampleSubbed = await waitUntil(
      () => sampleSubs.every((s) => isSubscribed(s.sub)),
      25_000,
    );
    report(
      "4-0. mở được 12 socket mẫu (mỗi người 1 socket — token gắn theo người)",
      allSampleSubbed,
      `SUBSCRIBED=${sampleSubs.filter((s) => isSubscribed(s.sub)).length}/${sampleSubs.length}`,
    );

    const first = sampleSubs[0];
    const last = sampleSubs[sampleSubs.length - 1];
    if (!first || !last) throw new Error("không có socket mẫu nào — không đo được LỖ 4");

    // ⛔ ZZ_SKIP_LO4=1 — BỎ toàn bộ LỖ 4 để đo LỖ 3 trên endpoint NGUỘI.
    // Vì sao cần cờ này: phần LỖ 4 bắn ~800 event và đẩy endpoint vào backpressure
    // (đo được: một POST 9 phần tử vượt 5s ngay sau đó). Nhịp của LỖ 3 là 1 POST/500ms —
    // trên endpoint kiệt sức thì nhịp giãn ra hàng chục giây và mọi kết luận "kênh còn
    // nhận nhịp không" mất nghĩa. Hai lỗ phải đo được RỜI NHAU.
    if (SKIP_LO4) {
      console.log("\n───── LỖ 4: BỎ QUA (ZZ_SKIP_LO4=1) — đo LỖ 3 trên endpoint nguội ─────");
      for (const s of sampleSubs) {
        try {
          await s.sub.client.removeAllChannels();
          s.sub.client.realtime.disconnect();
        } catch {
          /* bỏ qua lỗi lúc đóng */
        }
      }
    } else {
    // ── 4-cap. TRẦN của CHÍNH endpoint Supabase, đo TRƯỚC mọi thứ khác ─────
    // Nếu endpoint có trần riêng < 200 thì `BROADCAST_MAX_PER_POST = 200` đang LUÔN
    // hỏng ở lô đầy — phát hiện đó lớn hơn cả câu hỏi ranh giới.
    // ⚠️ GIÃN 12s giữa các phép dò: trần của Realtime tính theo GIÂY, bắn liên tiếp thì
    // không phân biệt được "POST này quá to" với "vừa nãy bắn quá nhiều" (lần chạy đầu
    // đã dính đúng bẫy đó). Tăng dần kích thước để mốc gãy đọc được.
    // `tag` (không phải `n`) làm khoá: cần lặp lại cùng một kích thước để phân biệt
    // "trần cố định theo kích thước" với "kết quả dao động theo hạn ngạch".
    // ⚠️ 10/08 — kế hoạch dò được RÚT GỌN có chủ đích. Bản cũ bắn 1+50+80+80+95+100+200+200
    // = 806 event chỉ để dò trần, và chính nó làm endpoint xuống cấp (đo được 0,68 s/phần tử)
    // ⇒ mọi phép đo SAU nó (tầng A/B của LỖ 4) đều chạm trần chờ và không còn nói lên điều gì
    // về bản vá. Nay chỉ giữ đúng ba mốc cần cho kết luận:
    //   60 ×2  — trần ĐANG ĐẶT trong lib phải qua, và qua LẶP LẠI (không phải may)
    //   95     — mốc gãy đã đo lần trước (502)
    //   200    — ngưỡng CŨ, phải thấy nó bị TỪ CHỐI thì việc hạ hằng số mới có căn cứ
    const probePlan: { n: number; tag: string }[] = [
      { n: 60, tag: "60a" },
      { n: 60, tag: "60b" },
      { n: 95, tag: "95" },
      { n: 200, tag: "200" },
    ];
    const probeMark = `LO4CAP_${randomUUID()}`;
    const probeRes = new Map<string, { n: number; status: number; body: string }>();
    const mkProbeMsgs = (n: number, tag: string) => {
      const msgs: { topic: string; event: string; payload: Record<string, unknown> }[] = [];
      for (let i = 0; i < n; i += 1) {
        const isFirst = i === 0;
        const isLast = i === n - 1;
        const who = isFirst ? first.userId : isLast ? last.userId : null;
        msgs.push({
          topic: who ? `user:${who}` : `user:zztest-don-${randomUUID()}`,
          event: "conversation.bumped",
          payload: {
            conversationId: probeMark,
            messageId: `${probeMark}#${tag}#${isFirst ? "F" : isLast ? "L" : i}`,
            kind: "CHAT",
            at: "",
          },
        });
      }
      return msgs;
    };
    for (const p of probePlan) {
      probeRes.set(p.tag, { n: p.n, ...(await serviceBroadcastFull(mkProbeMsgs(p.n, p.tag))) });
      await sleep(12_000);
    }
    const gotProbe = (tag: string, which: "F" | "L") =>
      (which === "F" ? first.sub : last.sub).hits.some(
        (h) => h.payload.messageId === `${probeMark}#${tag}#${which}`,
      );
    const capRows = probePlan.map((p) => {
      const r = probeRes.get(p.tag);
      const f = gotProbe(p.tag, "F");
      const l = p.n === 1 ? f : gotProbe(p.tag, "L");
      return (
        `n=${p.n}(${p.tag}):http=${r ? r.status : "?"} đầu=${f ? "✓" : "✗"} cuối=${l ? "✓" : "✗"}` +
        (r && r.body ? ` body=${JSON.stringify(r.body)}` : "")
      );
    });
    const okStatus = (s: number | undefined) => s === 202 || s === 200;
    // Cổng của BẢN VÁ, đảo chiều so với bản cũ: ngưỡng ĐANG ĐẶT (60) phải qua và giao đủ,
    // còn ngưỡng CŨ (200) phải BỊ TỪ CHỐI. Nếu 200 bỗng qua được thì việc hạ hằng số mất căn
    // cứ và phải đo lại, chứ không được im lặng coi là "vẫn an toàn".
    const cap60Ok = ["60a", "60b"].every(
      (t) => okStatus(probeRes.get(t)?.status) && gotProbe(t, "F") && gotProbe(t, "L"),
    );
    const cap200Rejected = !okStatus(probeRes.get("200")?.status);
    report(
      `4-cap. endpoint NHẬN lô ${MAX_PER_POST} (ngưỡng lib đang đặt) và TỪ CHỐI lô 200 (ngưỡng cũ)`,
      cap60Ok && cap200Rejected,
      `lô_${MAX_PER_POST}_qua=${cap60Ok} lô_200_bị_từ_chối=${cap200Rejected} · ` + capRows.join(" | "),
    );
    const brokeAt = probePlan.find((p) => !okStatus(probeRes.get(p.tag)?.status));
    measure(
      "mốc GÃY của endpoint (mỗi phép dò cách nhau 12s ⇒ không phải lỗi dồn nhịp)",
      brokeAt === undefined
        ? `không gãy tới ${probePlan[probePlan.length - 1]?.n} phần tử/POST`
        : `POST bắt đầu bị từ chối từ ${brokeAt.n} phần tử (tag ${brokeAt.tag})`,
    );

    await sleep(15_000);

    // ── 4-cap-rate. PHÉP THỬ QUYẾT ĐỊNH cho phương án vá ───────────────────
    // Cùng TỔNG số event (201) nhưng chia 3 POST × 67 bắn LIÊN TIẾP KHÔNG NGHỈ.
    //   • cả 3 POST 202 + giao đủ ⇒ trần là KÍCH THƯỚC MỘT POST ⇒ hạ
    //     BROADCAST_MAX_PER_POST là đủ.
    //   • có POST bị 429 ⇒ trần là SỐ EVENT / GIÂY của tenant ⇒ hạ kích thước lô KHÔNG
    //     cứu được, phải giãn nhịp (hoặc nâng hạn ngạch) — vá sai chỗ thì vẫn mất tin.
    // 60 = ĐÚNG kích thước lô của sản phẩm sau bản vá ⇒ 3 POST liên tiếp ở đây là bản sao
    // thu nhỏ của một lần fan-out thật, không còn là một con số tuỳ ý.
    const RATE_N = 60;
    const rateMark = `LO4RATE_${randomUUID()}`;
    const rateRes: { status: number; body: string }[] = [];
    const t0rate = Date.now();
    for (let k = 0; k < 3; k += 1) {
      const msgs: { topic: string; event: string; payload: Record<string, unknown> }[] = [];
      for (let i = 0; i < RATE_N; i += 1) {
        const who = i === 0 ? first.userId : i === RATE_N - 1 ? last.userId : null;
        msgs.push({
          topic: who ? `user:${who}` : `user:zztest-don-${randomUUID()}`,
          event: "conversation.bumped",
          payload: {
            conversationId: rateMark,
            messageId: `${rateMark}#${k}#${i === 0 ? "F" : i === RATE_N - 1 ? "L" : i}`,
            kind: "CHAT",
            at: "",
          },
        });
      }
      rateRes.push(await serviceBroadcastFull(msgs));
    }
    const rateMs = Date.now() - t0rate;
    await waitUntil(
      () =>
        [0, 1, 2].every(
          (k) =>
            first.sub.hits.some((h) => h.payload.messageId === `${rateMark}#${k}#F`) &&
            last.sub.hits.some((h) => h.payload.messageId === `${rateMark}#${k}#L`),
        ),
      10_000,
    );
    const rateRows = [0, 1, 2].map((k) => {
      const r = rateRes[k];
      const f = first.sub.hits.some((h) => h.payload.messageId === `${rateMark}#${k}#F`);
      const l = last.sub.hits.some((h) => h.payload.messageId === `${rateMark}#${k}#L`);
      return (
        `POST${k + 1}:http=${r ? r.status : "?"} đầu=${f ? "✓" : "✗"} cuối=${l ? "✓" : "✗"}` +
        (r && r.body ? ` body=${JSON.stringify(r.body)}` : "")
      );
    });
    const rateAllOk = rateRes.every((r) => okStatus(r.status));
    const rateAllDelivered = [0, 1, 2].every(
      (k) =>
        first.sub.hits.some((h) => h.payload.messageId === `${rateMark}#${k}#F`) &&
        last.sub.hits.some((h) => h.payload.messageId === `${rateMark}#${k}#L`),
    );
    // Chống pass giả cho vế phủ định (nếu có POST rụng): kiểm tai của chính 2 người mẫu.
    let aliveRate = new Map<string, boolean>();
    if (!rateAllDelivered) {
      aliveRate = await probeAlive(
        [
          { sub: first.sub, userId: first.userId },
          { sub: last.sub, userId: last.userId },
        ],
        `LO4RATE_PROBE_${randomUUID()}`,
      );
    }
    report(
      `4-cap-rate. 201 event chia 3 POST × ${RATE_N} bắn liên tiếp — trần là KÍCH THƯỚC POST hay SỐ EVENT/GIÂY?`,
      rateAllOk && rateAllDelivered,
      `${rateRows.join(" | ")} · tổng thời gian 3 POST=${rateMs}ms` +
        (rateAllDelivered ? "" : ` · tai_còn_nghe=${JSON.stringify([...aliveRate])}`),
    );
    measure(
      "KẾT LUẬN trần",
      rateAllOk && rateAllDelivered
        ? `201 event/3 POST × ${RATE_N} trong ${rateMs}ms ĐỀU QUA ⇒ trần theo KÍCH THƯỚC MỘT POST ` +
          `(không phải event/giây) ⇒ hạ BROADCAST_MAX_PER_POST là ĐỦ`
        : `chia nhỏ VẪN hỏng (${rateRows.join(" ")}) ⇒ trần theo SỐ EVENT/GIÂY của tenant ⇒ ` +
          `hạ kích thước lô KHÔNG đủ, phải giãn nhịp hoặc nâng hạn ngạch`,
    );

    await sleep(15_000); // hạ nhiệt trước tầng A

    // ── 4A. TẦNG A: pin ĐÚNG ranh giới lô bằng mảng script tự dựng ─────────
    // Thứ tự người nhận của đường thật do `findMany` KHÔNG `orderBy` quyết định
    // (lib/chat/messages.ts:526-533) ⇒ không đoán được ai rơi vào lô 2. Ở tầng này
    // script tự kiểm soát chỉ số: đặt 12 người thật vào đúng các vị trí quanh mốc 200.
    const MARK_A = `LO4A_${randomUUID()}`;
    const synth: { topic: string; event: string; payload: Record<string, unknown>; private: true }[] =
      [];
    const posToIndex = new Map<number, number>();
    // Đặt người thật ĐÚNG hai bên MỌI ranh giới lô của trần mới (59|60, 119|120, 179|180)
    // + hai đầu mảng. Bản cũ đặt quanh mốc 200 — với trần 60 thì cả 12 mẫu rơi vào lô cuối
    // và bước 4b không còn chứng minh được gì về ranh giới.
    const wantIdx = [0, 1, 59, 60, 61, 119, 120, 121, 179, 180, 181, 204];
    for (let i = 0; i < 205; i += 1) {
      const slot = wantIdx.indexOf(i);
      const s = slot >= 0 ? sampleSubs[slot] : undefined;
      if (s) {
        posToIndex.set(s.pos, i);
        synth.push({
          topic: `user:${s.userId}`,
          event: "conversation.bumped",
          payload: { conversationId: MARK_A, messageId: `${MARK_A}#${i}`, kind: "CHAT", at: "" },
          private: true,
        });
      } else {
        synth.push({
          topic: `user:zztest-don-${randomUUID()}`,
          event: "conversation.bumped",
          payload: { conversationId: MARK_A, messageId: `${MARK_A}#${i}`, kind: "CHAT", at: "" },
          private: true,
        });
      }
    }
    startCapture();
    const tA0 = Date.now();
    const okA = await broadcastMessages(synth);
    const tA1 = Date.now();
    const capA = stopCapture();
    await waitUntil(
      () =>
        sampleSubs.every((s) =>
          s.sub.hits.some((h) => String(h.payload.messageId ?? "").startsWith(MARK_A)),
        ),
      10_000,
    );
    await sleep(1_500);

    const sizesA = batchSizes(capA);
    const expectA = splitExpect(205);
    report(
      `4a. mảng 205 phần tử được CHIA ĐÚNG ${expectA.length} LÔ (${expectA.join("+")})`,
      sameSizes(sizesA, expectA),
      `số POST=${capA.length} kích_thước_lô=${JSON.stringify(sizesA)} ` +
        `http=${JSON.stringify(capA.map((c) => c.status))} broadcastMessages→${okA} ` +
        `body_lỗi=${JSON.stringify(capA.map((c) => c.body).filter(Boolean))}`,
    );
    measure("thời gian broadcastMessages(205)", `${tA1 - tA0}ms`);
    measure(
      "độ trễ từng POST",
      capA.map((c, i) => `lô${i + 1}=${c.ms}ms`).join(" "),
    );

    const gotA = (s: Sub, idx: number) =>
      s.hits.some((h) => h.payload.messageId === `${MARK_A}#${idx}`);
    const missA: string[] = [];
    const tableA: string[] = [];
    for (const s of sampleSubs) {
      const idx = posToIndex.get(s.pos) ?? -1;
      const lo = idx < MAX_PER_POST ? 1 : 2;
      const ok = gotA(s.sub, idx);
      tableA.push(`idx${idx}(lô${lo})=${ok ? "NHẬN" : "MẤT"}`);
      if (!ok) missA.push(`idx${idx}`);
    }
    // Chống pass giả cho vế phủ định: chỉ khi CÓ người mất mới cần kiểm tai họ.
    let aliveA = new Map<string, boolean>();
    if (missA.length > 0) {
      aliveA = await probeAlive(
        sampleSubs.map((s) => ({ sub: s.sub, userId: s.userId })),
        `LO4A_PROBE_${randomUUID()}`,
      );
    }
    report(
      "4b. mọi vị trí quanh ranh giới lô (198,199 | 200,201 … 204) đều nhận",
      missA.length === 0,
      `${tableA.join(" ")}` +
        (missA.length > 0
          ? ` · MẤT=${missA.join(",")} · tai_còn_nghe=${JSON.stringify([...aliveA])}`
          : ""),
    );

    await sleep(15_000); // hạ nhiệt trước tầng B (đường thật)

    // ── 4B. TẦNG B: đường end-to-end THẬT (261 phần tử ⇒ 2 lô) ─────────────
    const baseline = new Map<number, number>(sampleSubs.map((s) => [s.pos, s.sub.hits.length]));
    startCapture();
    const tB0 = Date.now();
    const sent4 = await sendChatMessageAsActor(actorS, `${P}s`, {
      conversationId: conv4.id,
      body: `${P} fan-out ${FANOUT_RECIPIENTS} người nhận`,
      clientMsgId: randomUUID(),
    });
    const tB1 = Date.now();
    const capB = stopCapture();
    const sentOk4 = sent4.ok === true;
    const msgId4 = sentOk4 ? (sent4 as { data: { id: string } }).data.id : "";
    report(
      "4d. gửi tin THẬT vào hội thoại 260 người nhận",
      sentOk4,
      sentOk4 ? `messageId=${msgId4} · tổng thời gian action=${tB1 - tB0}ms` : JSON.stringify(sent4),
    );

    const sizesB = batchSizes(capB);
    const expectB = splitExpect(FANOUT_RECIPIENTS + 1);
    report(
      `4e. fan-out thật = ${expectB.length} LÔ (${expectB.join("+")}), KHÔNG phải 1 POST`,
      sameSizes(sizesB, expectB),
      `số POST=${capB.length} kích_thước=${JSON.stringify(sizesB)} ` +
        `http=${JSON.stringify(capB.map((c) => c.status))} ` +
        `độ_trễ=${JSON.stringify(capB.map((c) => `${c.ms}ms`))} ` +
        `body_lỗi=${JSON.stringify(capB.map((c) => c.body).filter(Boolean))}`,
    );
    measure(
      "thời gian fan-out (POST đầu bắt đầu → POST cuối xong)",
      capB.length > 0
        ? `${Math.max(...capB.map((c) => c.at + c.ms)) - Math.min(...capB.map((c) => c.at))}ms`
        : "không bắt được POST nào",
    );

    const bumpOf = (s: Sub, pos: number) =>
      s.hits
        .slice(baseline.get(pos) ?? 0)
        .filter((h) => h.event === "conversation.bumped" && h.payload.messageId === msgId4);
    await waitUntil(
      () => sampleSubs.every((s) => bumpOf(s.sub, s.pos).length > 0),
      12_000,
    );
    await sleep(2_000);

    const tableB: string[] = [];
    const missB: typeof sampleSubs = [];
    let lastDelivery = 0;
    for (const s of sampleSubs) {
      const b = bumpOf(s.sub, s.pos);
      const where = flatIndexOf(capB, `user:${s.userId}`);
      for (const h of b) lastDelivery = Math.max(lastDelivery, h.at);
      tableB.push(
        `seed#${s.pos}→mảng[${where ? where.flat : "?"}]lô${where ? where.batch + 1 : "?"}` +
          `=${b.length}bump`,
      );
      if (b.length !== 1) missB.push(s);
    }
    let aliveB = new Map<string, boolean>();
    if (missB.length > 0) {
      aliveB = await probeAlive(
        sampleSubs.map((s) => ({ sub: s.sub, userId: s.userId })),
        `LO4B_PROBE_${randomUUID()}`,
      );
    }
    const batchesHit = new Set(
      sampleSubs
        .map((s) => flatIndexOf(capB, `user:${s.userId}`)?.batch)
        .filter((x): x is number => x !== undefined),
    );
    report(
      "4f. cả 12 mẫu nhận ĐÚNG 1 bump (không mất, không trùng)",
      missB.length === 0 && sentOk4,
      `${tableB.join(" ")} · mẫu chạm ${batchesHit.size} lô khác nhau` +
        (missB.length > 0 ? ` · tai_còn_nghe=${JSON.stringify([...aliveB])}` : ""),
    );
    report(
      "4g. mẫu CÓ chạm cả lô 2 (nếu không, 4f chưa nói được gì về ranh giới)",
      batchesHit.has(1),
      `các lô mẫu rơi vào=${JSON.stringify([...batchesHit].map((b) => b + 1))} ` +
        `(bằng chứng ranh giới chính xác nằm ở bước 4a/4b — tầng A kiểm soát được chỉ số)`,
    );
    measure(
      "độ trễ giao (action trả về → bump cuối cùng của mẫu tới)",
      lastDelivery > 0 ? `${lastDelivery - tB1}ms` : "không đo được",
    );

    // Đóng 12 socket mẫu để không giữ kết nối suốt phần LỖ 3 (dài ~2 phút).
    for (const s of sampleSubs) {
      try {
        await s.sub.client.removeAllChannels();
        s.sub.client.realtime.disconnect();
      } catch {
        /* bỏ qua lỗi lúc đóng */
      }
    }
    } // hết nhánh !SKIP_LO4

    // ══════════════════════════════════════════════════════════════════════
    // LỖ 3 — gia hạn token giữa phiên + hạn sống khi token hết hạn
    // ══════════════════════════════════════════════════════════════════════
    await sleep(20_000); // hạ nhiệt: đừng để trần nhịp của LỖ 4 dính sang phép đo LỖ 3

    // Một dòng thời gian DUY NHẤT, một nguồn phát nhịp duy nhất trên `conv:{conv3}`:
    //   CTRL  TTL 1800s, không gia hạn        → CONTROL cho toàn bộ phép đo
    //   R     TTL  70s, setAuth ở +25s        → phải sống QUÁ mốc 70s
    //   R2    TTL  70s, setAuth 2 lần ở +35s  → ghi đè token liên tiếp có đá kênh không
    //   E70   TTL  70s, KHÔNG gia hạn         → ANH EM SINH ĐÔI của R, khác đúng 1 biến
    //                                           (`setAuth`) ⇒ nếu R chết SỚM hơn E70 thì
    //                                           thủ phạm là chính lời gọi gia hạn.
    //   E50   TTL  50s, KHÔNG gia hạn         → đo cận trên (c)
    //   E80   TTL  80s, KHÔNG gia hạn         → đo lần 2, mốc khác (chứng minh bám `exp`)
    const mCtrl = await mintToken(uCtrl.id, 1800);
    const mR = await mintToken(uR.id, 70);
    const mR2 = await mintToken(uR2.id, 70);
    const mR3 = await mintToken(uR3.id, 200);
    const mE70 = await mintToken(uE70.id, 70);
    const mE50 = await mintToken(uE50.id, 50);
    const mE80 = await mintToken(uE80.id, 80);

    const sCtrl = await openSub("CTRL(1800s)", `conv:${conv3.id}`, mCtrl);
    const sR = await openSub("R(70s→gia hạn)", `conv:${conv3.id}`, mR);
    const sR2 = await openSub("R2(70s→gia hạn ×2)", `conv:${conv3.id}`, mR2);
    const sR3 = await openSub("R3(200s→gia hạn ở +45s)", `conv:${conv3.id}`, mR3);
    const sE70 = await openSub("E70(70s, sinh đôi của R)", `conv:${conv3.id}`, mE70);
    const sE50 = await openSub("E50(50s, KHÔNG gia hạn)", `conv:${conv3.id}`, mE50);
    const sE80 = await openSub("E80(80s, KHÔNG gia hạn)", `conv:${conv3.id}`, mE80);
    // ── BIẾN THỂ TÁCH NGUYÊN NHÂN cho kênh của bản vá ────────────────────────
    // Lần chạy đầu (10/08) cho kết quả kỳ lạ: kênh `conv:` của MODULE chết ~1,5–2s sau MỖI
    // lần SUBSCRIBED, trong khi kênh `user:` cùng kết nối sống nguyên. Module khác các kênh
    // đối chứng ở ĐÚNG hai điểm — nên dựng hai biến thể RAW, mỗi biến thể một điểm:
    //   V1 = `void setAuth` (không chờ) + MỘT kênh   → cô lập "không chờ setAuth"
    //   V2 = `await setAuth` + HAI kênh conv:+user:  → cô lập "hai kênh trên một kết nối"
    // Nghi phạm đã tra được trong thư viện: `SupabaseClient` LUÔN truyền
    // `accessToken: _getAccessToken` cho `RealtimeClient`, và hàm đó rơi về **anon key** khi
    // không có phiên Supabase Auth (repo dùng Auth.js). Vì `this.accessToken` tồn tại nên
    // `_performAuth` đặt `_manuallySetToken = false`, và `RealtimeChannel.subscribe()` khi
    // nhận 'ok' sẽ gọi `socket.setAuth()` KHÔNG THAM SỐ ⇒ ghi đè vé của ta bằng anon key và
    // `push(access_token)` xuống mọi kênh đang `joined`.
    const mV1 = await mintToken(uP.id, 1800);
    const sV1 = await openSubVoidAuth("V1(void setAuth, 1 kênh)", `conv:${conv3.id}`, mV1);
    const mV2 = await mintToken(uP.id, 1800);
    const sV2a = await openSub("V2a(await setAuth, kênh conv: 1/2)", `conv:${conv3.id}`, mV2);
    const sV2b = await openSubOn(
      sV2a.client,
      "V2b(cùng kết nối, kênh user: 2/2)",
      `user:${uP.id}`,
      mV2,
    );

    // V3 = câu hỏi riêng, KHÔNG liên quan cách gia hạn: sau vài nhịp heartbeat, kết nối
    // còn giữ ĐÚNG vé không? Đọc nguồn cho thấy `SupabaseClient` luôn cài
    // `accessToken: _getAccessToken` (rơi về ANON KEY khi không có phiên Supabase Auth), và
    // `RealtimeClient._wrapHeartbeatCallback` gọi `_setAuthSafely()` mỗi nhịp ⇒ về lý thuyết
    // `accessTokenValue` bị thay bằng anon key, mà `RealtimeChannel.subscribe()` nhét CHÍNH
    // `socket.accessTokenValue` vào payload JOIN. Nếu đúng thì MỌI lần join lại sau nhịp
    // heartbeat đầu tiên (chu kỳ gia hạn, đường tự nối lại sau CLOSED) sẽ join bằng anon key
    // và bị RLS từ chối — tức realtime chết vĩnh viễn tới khi tải lại trang.
    // V3 mở kênh THỨ HAI trên kết nối V2 SAU khi đã qua ≥2 nhịp heartbeat, không gọi lại
    // `setAuth`. Nó join được ⇒ giả thuyết SAI; bị từ chối ⇒ giả thuyết ĐÚNG.
    const lo3Subs = [sCtrl, sR, sR2, sR3, sE70, sE50, sE80];

    // ── Kênh của BẢN VÁ: mở bằng ĐÚNG module sản phẩm ───────────────────────
    // Hai kênh cùng lúc trên MỘT kết nối (đúng hình dạng thật của một tab: `conv:` của
    // hội thoại đang mở + `user:` của badge chưa đọc). Đây là chỗ bản cũ chết: gia hạn
    // của kênh này giết kênh kia vì `client.channel()` là singleton dùng chung.
    const { applyRealtimeAuth, subscribeConversation, subscribeUserTopic } =
      await patchedAuthModule;
    const mP = await mintToken(uP.id, 70);
    const authOf = (m: Minted) => ({
      token: m.token,
      expiresAt: new Date(m.expAt).toISOString(),
    });
    const pConv = newPatchedRec("P@conv (bản vá)");
    const pUser = newPatchedRec("P@user (kênh anh em cùng kết nối)");
    const subPConv = subscribeConversation(conv3.id, authOf(mP), patchedHandlers(pConv));
    const subPUser = subscribeUserTopic(uP.id, authOf(mP), patchedHandlers(pUser));
    patchedSubs.push(subPConv, subPUser);
    const pSubscribed = (rec: PatchedRec) => rec.statuses.some((x) => x.status === "SUBSCRIBED");

    const allSub3 = await waitUntil(
      () => lo3Subs.every(isSubscribed) && pSubscribed(pConv) && pSubscribed(pUser),
      20_000,
    );
    report(
      "3-0bis. hai kênh của BẢN VÁ (conv: + user:) cùng SUBSCRIBED trên MỘT kết nối",
      pSubscribed(pConv) && pSubscribed(pUser),
      `${patchedStatusLine(pConv, Date.now())} | ${patchedStatusLine(pUser, Date.now())}`,
    );
    report(
      "3-0. cả 6 kênh conv: SUBSCRIBED (kể cả token TTL 50s)",
      allSub3,
      lo3Subs.map((s) => `${s.label}=${isSubscribed(s) ? "OK" : "KHÔNG"}`).join(" "),
    );

    // ── 3a. ĐỐI CHỨNG DƯƠNG: token TTL ngắn nhận được TIN THẬT ─────────────
    const sentReal = await sendChatMessageAsActor(actorS, `${P}s`, {
      conversationId: conv3.id,
      body: `${P} doi chung token ngan han`,
      clientMsgId: randomUUID(),
    });
    const realOk = sentReal.ok === true;
    const realId = realOk ? (sentReal as { data: { id: string } }).data.id : "";
    const gotReal = (s: Sub) =>
      s.hits.some((h) => h.event === "message.created" && h.payload.id === realId);
    await waitUntil(() => lo3Subs.every(gotReal), 10_000);
    report(
      "3a. kênh mở bằng token TTL ngắn NHẬN được tin thật (đối chứng dương)",
      realOk && lo3Subs.every(gotReal),
      `messageId=${realId} · ` + lo3Subs.map((s) => `${s.label}=${gotReal(s) ? "✓" : "✗"}`).join(" "),
    );

    // ── Chạy nhịp: 500ms/tick trên conv:{conv3} ────────────────────────────
    const PHASE = "L3";
    const T0 = Date.now();
    const expR = mR.expAt;
    const expE50 = mE50.expAt;
    const expE80 = mE80.expAt;
    const hardCapAt = Math.max(expE50, expE80, expR) + 180_000;
    const ticker = startTicker(`conv:${conv3.id}`, PHASE, 500, 1200);
    // Nhịp RIÊNG trên `user:{P}` — kênh anh em cùng kết nối với `conv:` của bản vá. Không có
    // nhịp này thì không chứng minh được "gia hạn của kênh này KHÔNG giết kênh kia" (đúng
    // triệu chứng nặng nhất của bản cũ). 1000ms để không nhân đôi tải lên endpoint.
    const PHASE_U = "L3U";
    const tickerU = startTicker(`user:${uP.id}`, PHASE_U, 1000, 600);

    let v3At = 0;
    let sV3: Sub | null = null;
    let swapPAt = 0;
    let swapPEff = "";
    let swap1At = 0;
    let swap1Ms = 0;
    let swap2At = 0;
    let swap2Ms = 0;
    let swap3At = 0;
    let seqBeforeSwap1 = 0;
    let seqBeforeSwap2 = 0;
    let swapErr = "";

    const silentFor = (s: Sub, ms: number) => {
      const last = lastTickAt(s, PHASE);
      // Chưa từng nhận tick nào ⇒ phép đo của kênh đó vô nghĩa (bước 3e sẽ bắt);
      // đừng để nó giữ vòng lặp chạy tới trần 4 phút.
      if (last === null) return Date.now() - T0 > 40_000;
      return Date.now() - last > ms;
    };

    while (Date.now() < hardCapAt) {
      const elapsed = Date.now() - T0;
      if (swap1At === 0 && elapsed >= 25_000) {
        seqBeforeSwap1 = ticker.ticks.length;
        const t = await mintToken(uR.id, 1800);
        const a = Date.now();
        try {
          await sR.client.realtime.setAuth(t.token);
        } catch (e) {
          swapErr += `R:${String(e)} `;
        }
        swap1At = Date.now();
        swap1Ms = swap1At - a;
      }
      // BẢN VÁ gia hạn ở CÙNG mốc +25s với R (setAuth trần) ⇒ hai đường đi qua đúng
      // cùng một nhịp heartbeat, cùng một trạng thái endpoint. Khác nhau chỉ còn là cách gọi.
      if (swapPAt === 0 && elapsed >= 25_000) {
        const t = await mintToken(uP.id, 1800);
        try {
          swapPEff = applyRealtimeAuth(authOf(t));
        } catch (e) {
          swapErr += `P:${String(e)} `;
        }
        swapPAt = Date.now();
      }
      // V3: join kênh THỨ BA trên kết nối V2 ở +60s — đã qua ≥2 nhịp heartbeat mà KHÔNG
      // gọi lại setAuth. Nếu thư viện đã thay vé bằng anon key thì lần join này bị từ chối.
      if (v3At === 0 && elapsed >= 60_000) {
        v3At = Date.now();
        // Topic KHÁC hai topic đã dùng trên kết nối này: `client.channel()` khử trùng theo
        // topic, join lại đúng topic cũ sẽ ném "tried to subscribe multiple times" chứ
        // không đo được gì.
        sV3 = await openSubOn(
          sV2a.client,
          "V3(join MUỘN sau ≥2 heartbeat, không setAuth lại)",
          `conv:${conv5.id}`,
          mV2,
        );
      }
      if (swap2At === 0 && elapsed >= 35_000) {
        seqBeforeSwap2 = ticker.ticks.length;
        const t1 = await mintToken(uR2.id, 1800);
        const t2 = await mintToken(uR2.id, 1800);
        const a = Date.now();
        try {
          await sR2.client.realtime.setAuth(t1.token);
          await sleep(200);
          await sR2.client.realtime.setAuth(t2.token);
        } catch (e) {
          swapErr += `R2:${String(e)} `;
        }
        swap2At = Date.now();
        swap2Ms = swap2At - a;
      }
      if (swap3At === 0 && elapsed >= 45_000) {
        const t = await mintToken(uR3.id, 1800);
        try {
          await sR3.client.realtime.setAuth(t.token);
        } catch (e) {
          swapErr += `R3:${String(e)} `;
        }
        swap3At = Date.now();
      }
      // Dừng sớm khi CẢ HAI kênh không gia hạn đã im ≥25s và đã qua mốc exp muộn nhất.
      // Chạy thêm tới ít nhất T0+120s để cửa sổ quan sát "kênh chết có tự hồi không"
      // đủ dài (R chết quanh T0+37s ⇒ ≥80s theo dõi sau đó).
      if (
        Date.now() > expE80 + 25_000 &&
        Date.now() > T0 + 120_000 &&
        silentFor(sE50, 25_000) &&
        silentFor(sE80, 25_000)
      ) {
        break;
      }
      await sleep(500);
    }
    ticker.stop();
    tickerU.stop();
    await ticker.done;
    await tickerU.done;
    const sentSeqs = ticker.ticks.length;
    const badHttp = ticker.ticks.filter((t) => t.http !== 202 && t.http !== 200).length;
    measure(
      "nhịp phát",
      `${sentSeqs} tick × 500ms trong ${((Date.now() - T0) / 1000).toFixed(1)}s · ` +
        `POST lỗi=${badHttp}`,
    );

    // ── 3b. gia hạn giữa phiên: kênh KHÔNG rớt + KHÔNG mất tin ─────────────
    const ctrlSeqs = tickSeqs(sCtrl, PHASE);
    const ctrlAliveLate =
      (lastTickAt(sCtrl, PHASE) ?? 0) > Math.max(expE50, expE80) + 5_000;
    const analyzeRenew = (s: Sub, swapAt: number, seqBefore: number, label: string) => {
      const got = tickSeqs(s, PHASE);
      // Chỉ tính các seq mà CONTROL cũng nhận được — seq nào CONTROL cũng mất thì lỗi
      // nằm ở nguồn phát/mạng, không phải ở `setAuth`.
      const missOwn: number[] = [];
      for (const n of ctrlSeqs) if (!got.has(n)) missOwn.push(n);
      missOwn.sort((a, b) => a - b);
      const near = missOwn.filter((n) => n >= seqBefore - 6 && n <= seqBefore + 12);
      const errAfter = firstErrorAfter(s, swapAt - 1_000);
      const reSub = s.statuses.filter((x) => x.status === "SUBSCRIBED").length;
      const lastAt = lastTickAt(s, PHASE);
      const survivedPastExp = lastAt !== null && lastAt > s.expAt + 5_000;
      return { missOwn, near, errAfter, reSub, survivedPastExp, lastAt, label };
    };
    const aR = analyzeRenew(sR, swap1At, seqBeforeSwap1, "R");
    const aR2 = analyzeRenew(sR2, swap2At, seqBeforeSwap2, "R2");

    report(
      "3b. ĐỐI CHỨNG — kênh CONTROL nhận nhịp suốt phép đo (nguồn phát còn sống)",
      ctrlSeqs.size > sentSeqs * 0.9 && ctrlAliveLate,
      `CTRL nhận ${ctrlSeqs.size}/${sentSeqs} tick · còn nhận sau mốc exp muộn nhất=${ctrlAliveLate}`,
    );
    // ⚠️ NĂM BƯỚC "ĐỐI CHỨNG ÂM" (3c, 3d, 3d-bis, 3P-e, 3P-f) ĐÃ ĐẢO CHIỀU KHẲNG ĐỊNH.
    // Chúng đo hành vi của ĐƯỜNG CŨ / thư viện trần, tức thứ bản vá phải tránh. PASS ở đây
    // nghĩa là "lỗi vẫn tái hiện đúng như mô tả" ⇒ các bước 3P-a/b/c mới có ý nghĩa so sánh.
    // Nếu một trong năm bước này chuyển sang FAIL thì Supabase/thư viện đã đổi hành vi và
    // TOÀN BỘ lý do tồn tại của bản vá phải được đo lại — đừng lặng lẽ gỡ nó đi.
    report(
      "3c. TÁI HIỆN LỖ 3 — `setAuth` trần giữa phiên ĐÁ kênh (đối chứng ÂM của bản vá)",
      aR.errAfter !== null,
      `setAuth mất ${swap1Ms}ms · lỗi sau swap=${aR.errAfter ? aR.errAfter.status : "không"} · ` +
        `số lần SUBSCRIBED=${aR.reSub} · mất riêng quanh swap=${JSON.stringify(aR.near)} · ` +
        `mất riêng cả phiên=${aR.missOwn.length} tick · ` +
        `sống quá mốc exp token cũ (+${((aR.lastAt ?? 0) - sR.expAt) / 1000}s)=${aR.survivedPastExp}` +
        (swapErr ? ` · lỗi setAuth=${swapErr}` : ""),
    );
    report(
      "3d. TÁI HIỆN — `setAuth` trần HAI LẦN cách 200ms cũng đá kênh (R2, đối chứng ÂM)",
      aR2.errAfter !== null,
      `2×setAuth mất ${swap2Ms}ms · lỗi sau swap=${aR2.errAfter ? aR2.errAfter.status : "không"} · ` +
        `số lần SUBSCRIBED=${aR2.reSub} · mất riêng quanh swap=${JSON.stringify(aR2.near)} · ` +
        `mất riêng cả phiên=${aR2.missOwn.length} tick · sống quá exp cũ=${aR2.survivedPastExp}`,
    );

    // ── 3P. BẢN VÁ: `applyRealtimeAuth` vs `setAuth` trần vs CONTROL ────────
    // Ba kênh cùng TTL 70s trên cùng một dòng thời gian:
    //   R   gia hạn bằng `setAuth` trần   → (đã đo) chết ở nhịp heartbeat kế tiếp
    //   E70 KHÔNG gia hạn                  → chết đúng lúc token hết hạn
    //   P   gia hạn bằng ĐƯỜNG ĐÃ VÁ       → phải sống QUÁ mốc 70s và vẫn nhận nhịp
    // Vế phủ định ("bản vá không giết kênh") chỉ có giá trị khi CÙNG LẦN CHẠY chứng minh
    // được nguồn phát vẫn chạy (CONTROL) — nên mọi con số dưới đây lọc theo `ctrlSeqs`.
    const pSeqs = patchedTickSeqs(pConv, PHASE);
    const pLast = patchedLastTickAt(pConv, PHASE);
    const pMissOwn: number[] = [];
    for (const n of ctrlSeqs) if (!pSeqs.has(n)) pMissOwn.push(n);
    pMissOwn.sort((a, b) => a - b);
    const pTicksBeforeSwap = [...pSeqs].filter((n) => {
      const t = ticker.ticks.find((x) => x.seq === n);
      return t !== undefined && t.at < swapPAt;
    }).length;
    const pTicksAfterSwap = [...pSeqs].filter((n) => {
      const t = ticker.ticks.find((x) => x.seq === n);
      return t !== undefined && t.at > swapPAt;
    }).length;
    // "Sống quá mốc exp của vé GỐC" là bằng chứng gia hạn ĐÃ CÓ TÁC DỤNG (không phải chỉ
    // "chưa kịp chết"): vé gốc TTL 70s, mà kênh còn nhận nhịp sau mốc đó ⇒ vé mới đã vào.
    const pSurvivedPastExp = pLast !== null && pLast > mP.expAt + 5_000;
    const pClose = pConv.statuses.find(
      (x) => x.at > swapPAt && (x.status === "CLOSED" || x.status === "CHANNEL_ERROR"),
    );
    const pReSub = pConv.statuses.filter((x) => x.status === "SUBSCRIBED").length;
    report(
      "3P-a. ĐỐI CHỨNG DƯƠNG — kênh bản vá nhận nhịp TRƯỚC lúc gia hạn",
      pTicksBeforeSwap > 0,
      `nhận ${pTicksBeforeSwap} tick trước swap · gia hạn@+${((swapPAt - T0) / 1000).toFixed(1)}s`,
    );
    report(
      "3P-b. BẢN VÁ — gia hạn KHÔNG giết kênh: vẫn nhận nhịp SAU khi gia hạn và SỐNG QUÁ hạn vé gốc",
      pTicksAfterSwap > 0 && pSurvivedPastExp,
      `sau swap nhận ${pTicksAfterSwap} tick · tick cuối ở exp_vé_gốc` +
        `${pLast === null ? "n/a" : `${pLast - mP.expAt >= 0 ? "+" : ""}${((pLast - mP.expAt) / 1000).toFixed(1)}s`}` +
        ` · số lần SUBSCRIBED=${pReSub} (2 = rời rồi join lại ĐÚNG như thiết kế) · ` +
        `mốc hiệu lực applyRealtimeAuth trả về=${swapPEff} · ` +
        `mất riêng so với CONTROL cả phiên=${pMissOwn.length} tick`,
    );
    // Khe hở lúc rời-join: đây là CÁI GIÁ của bản vá, phải in ra chứ không giấu.
    // (Client thật bù bằng `reconcile()` ở mỗi lần SUBSCRIBED — use-chat-channel.ts.)
    const gapSeqs = pMissOwn.filter((n) => {
      const t = ticker.ticks.find((x) => x.seq === n);
      return t !== undefined && t.at >= swapPAt - 1_000 && t.at <= swapPAt + 20_000;
    });
    measure(
      "BẢN VÁ · khe hở lúc rời-đổi-join (số tick 500ms rơi quanh lúc gia hạn)",
      `${gapSeqs.length} tick ≈ ${(gapSeqs.length * 0.5).toFixed(1)}s ` +
        `(client thật bù bằng reconcile() ở MỖI lần SUBSCRIBED)`,
    );
    // Kênh ANH EM trên cùng kết nối — thứ bản cũ giết oan.
    const pUserSeqs = patchedTickSeqs(pUser, PHASE_U);
    const pUserAfter = [...pUserSeqs].filter((n) => {
      const t = tickerU.ticks.find((x) => x.seq === n);
      return t !== undefined && t.at > swapPAt;
    }).length;
    const pUserLast = patchedLastTickAt(pUser, PHASE_U);
    report(
      "3P-c. BẢN VÁ — gia hạn của kênh `conv:` KHÔNG giết kênh `user:` cùng kết nối",
      pUserAfter > 0 && pUserLast !== null && pUserLast > mP.expAt + 5_000,
      `user: nhận ${pUserSeqs.size}/${tickerU.ticks.length} tick, trong đó ${pUserAfter} sau swap · ` +
        `tick cuối ở exp_vé_gốc${pUserLast === null ? "n/a" : `${pUserLast - mP.expAt >= 0 ? "+" : ""}${((pUserLast - mP.expAt) / 1000).toFixed(1)}s`}`,
    );
    measure(
      "BẢN VÁ · so ba anh em cùng TTL 70s",
      `P(applyRealtimeAuth) tick cuối@+${pLast === null ? "n/a" : ((pLast - T0) / 1000).toFixed(1)}s · ` +
        `R(setAuth trần) tick cuối@+${(() => {
          const l = lastTickAt(sR, PHASE);
          return l === null ? "n/a" : ((l - T0) / 1000).toFixed(1);
        })()}s · ` +
        `E70(không gia hạn) tick cuối@+${(() => {
          const l = lastTickAt(sE70, PHASE);
          return l === null ? "n/a" : ((l - T0) / 1000).toFixed(1);
        })()}s · ` +
        `CTRL(vé 1800s) tick cuối@+${(() => {
          const l = lastTickAt(sCtrl, PHASE);
          return l === null ? "n/a" : ((l - T0) / 1000).toFixed(1);
        })()}s`,
    );
    console.log(`        ${patchedStatusLine(pConv, T0)}`);
    console.log(`        ${patchedStatusLine(pUser, T0)}`);

    // ── 3P-d. TÁCH NGUYÊN NHÂN: `void setAuth` hay "hai kênh một kết nối"? ───
    const v1Ticks = tickSeqs(sV1, PHASE).size;
    const v2aTicks = tickSeqs(sV2a, PHASE).size;
    const v2bTicks = tickSeqs(sV2b, PHASE_U).size;
    const closeInfo = (s: Sub) => {
      const c = s.statuses.find((x) => x.status === "CLOSED" || x.status === "CHANNEL_ERROR");
      const first = s.statuses.find((x) => x.status === "SUBSCRIBED");
      return c === null || c === undefined
        ? "không bị đóng"
        : `${c.status}@+${((c.at - T0) / 1000).toFixed(1)}s (` +
          `${first ? `${((c.at - first.at) / 1000).toFixed(1)}s sau SUBSCRIBED` : "chưa từng SUBSCRIBED"}` +
          `, lý do=${c.err ?? "không có"})`;
    };
    measure("BIẾN THỂ · tách nguyên nhân cái chết của kênh conv: bản vá", "");
    console.log(`        V1 (void setAuth, 1 kênh)      : ${v1Ticks}/${sentSeqs} tick · ${closeInfo(sV1)}`);
    console.log(`        V2a(await setAuth, conv: 1/2)  : ${v2aTicks}/${sentSeqs} tick · ${closeInfo(sV2a)}`);
    console.log(`        V2b(cùng kết nối, user: 2/2)   : ${v2bTicks}/${tickerU.ticks.length} tick · ${closeInfo(sV2b)}`);
    console.log(`        CTRL(await setAuth, 1 kênh)    : ${ctrlSeqs.size}/${sentSeqs} tick · ${closeInfo(sCtrl)}`);
    report(
      "3P-d. HAI kênh private trên MỘT kết nối cùng sống được (V2a + V2b)",
      v2aTicks > sentSeqs * 0.8 && v2bTicks > tickerU.ticks.length * 0.8,
      `V2a=${v2aTicks}/${sentSeqs} V2b=${v2bTicks}/${tickerU.ticks.length} — ` +
        `hỏng ⇒ vấn đề là HÌNH DẠNG "conv: + user: cùng kết nối" (có từ trước bản vá), ` +
        `KHÔNG phải cách gia hạn`,
    );
    // ĐẢO CHIỀU — đây là LÝ DO TỒN TẠI của callback `accessToken` trong `getSupabaseBrowserClient`.
    // V3 chạy trên client MẶC ĐỊNH (không có callback đó): sau ≥2 nhịp heartbeat, thư viện đã
    // thay vé bằng ANON KEY, nên một lần join MỚI trên chính kết nối ấy bị từ chối vĩnh viễn
    // — dù người dùng vẫn là participant hợp lệ. Đó chính là đường "gia hạn / tự nối lại".
    const v3Denied =
      sV3 !== null &&
      !isSubscribed(sV3) &&
      sV3.statuses.some((x) => x.status === "CHANNEL_ERROR" || x.status === "CLOSED");
    report(
      "3P-f. TÁI HIỆN — join MUỘN trên client MẶC ĐỊNH bị từ chối (vé đã bị thay bằng anon key)",
      v3Denied,
      sV3 === null
        ? "không mở được V3 — không kết luận được"
        : `join@+${((v3At - T0) / 1000).toFixed(1)}s · trạng thái=${JSON.stringify(
            sV3.statuses.map((x) => `${x.status}@+${((x.at - T0) / 1000).toFixed(1)}s${x.err ? `(${x.err})` : ""}`),
          )}`,
    );
    report(
      "3P-e. TÁI HIỆN — `void setAuth` rồi join NGAY làm kênh chết câm (V1, đối chứng ÂM)",
      v1Ticks === 0,
      `V1=${v1Ticks}/${sentSeqs} tick · ${closeInfo(sV1)} — so với V2a/CTRL (await setAuth) ` +
        `nhận đủ nhịp: khác nhau ĐÚNG một biến là chờ hay không chờ \`setAuth\``,
    );
    if (pClose) {
      console.log(
        `        ⚠️ kênh bản vá CÓ trạng thái đóng sau swap: ${pClose.status}@+${((pClose.at - T0) / 1000).toFixed(1)}s (${pClose.err ?? "không lý do"})`,
      );
    }

    // ── 3d-bis. PHÉP THỬ QUYẾT ĐỊNH: R vs E70 — hai kênh y hệt nhau, khác đúng
    // MỘT biến là lời gọi `setAuth`. Gia hạn mà lại chết SỚM HƠN kênh không gia
    // hạn ⇒ chính lời gọi gia hạn là thủ phạm, không phải nhiễu mạng.
    const lastR = lastTickAt(sR, PHASE);
    const lastE70 = lastTickAt(sE70, PHASE);
    // ĐẢO CHIỀU: bằng chứng buộc tội `setAuth` trần là R chết SỚM HƠN sinh đôi không gia hạn.
    const renewHurt = lastR !== null && lastE70 !== null && lastR < lastE70;
    report(
      "3d-bis. TÁI HIỆN — R (setAuth trần) chết SỚM HƠN sinh đôi E70 (không gia hạn)",
      renewHurt,
      lastR === null || lastE70 === null
        ? "một trong hai kênh không nhận được tick nào — vô nghĩa"
        : `R nhận tick cuối ở exp_token_gốc${lastR - sR.expAt >= 0 ? "+" : ""}` +
          `${((lastR - sR.expAt) / 1000).toFixed(1)}s · ` +
          `E70 nhận tick cuối ở exp${lastE70 - sE70.expAt >= 0 ? "+" : ""}` +
          `${((lastE70 - sE70.expAt) / 1000).toFixed(1)}s · ` +
          `chênh lệch R−E70=${((lastR - lastE70) / 1000).toFixed(1)}s ` +
          `(âm = gia hạn LÀM KÊNH CHẾT SỚM HƠN)`,
    );

    // ── 3d-ter. TRUY THỦ PHẠM: kênh chết vào lúc nào so với NHỊP HEARTBEAT? ──
    // realtime-js đập heartbeat 25s/lần và trên mỗi nhịp có chạm lại lớp auth. Nếu kênh
    // vừa `setAuth` chết đúng nhịp heartbeat KẾ TIẾP (chứ không chết ngay lúc gọi), thủ
    // phạm là tương tác setAuth × heartbeat chứ không phải bản thân token mới.
    const closeOf = (s: Sub) =>
      s.statuses.find((x) => x.status === "CLOSED" || x.status === "CHANNEL_ERROR") ?? null;
    const hbGap = (s: Sub, swapAt: number) => {
      const close = closeOf(s);
      if (!close) return null;
      const hbAfterSwap = s.heartbeats.filter((h) => h.at >= swapAt);
      const nearest = hbAfterSwap.find((h) => Math.abs(h.at - close.at) < 3_000) ?? null;
      return { close, hbAfterSwap, nearest };
    };
    const gR = hbGap(sR, swap1At);
    const gR2 = hbGap(sR2, swap2At);
    const gR3 = hbGap(sR3, swap3At);
    const hbLine = (s: Sub, g: ReturnType<typeof hbGap>, swapAt: number) =>
      g === null
        ? `${s.label}: không bị đóng`
        : `${s.label}: setAuth@+${((swapAt - T0) / 1000).toFixed(1)}s → ` +
          `đóng@+${((g.close.at - T0) / 1000).toFixed(1)}s (${((g.close.at - swapAt) / 1000).toFixed(1)}s sau khi gọi) · ` +
          `heartbeat sau swap=${g.hbAfterSwap
            .map((h) => `${h.status}@+${((h.at - T0) / 1000).toFixed(1)}s`)
            .join(",")} · trùng nhịp heartbeat=${g.nearest ? "CÓ" : "không"}`;
    measure("nhịp heartbeat vs thời điểm kênh bị đóng", "");
    console.log(`        ${hbLine(sR, gR, swap1At)}`);
    console.log(`        ${hbLine(sR2, gR2, swap2At)}`);
    console.log(`        ${hbLine(sR3, gR3, swap3At)}`);
    console.log(
      `        CTRL (không gọi setAuth giữa phiên): heartbeat=${sCtrl.heartbeats
        .map((h) => `${h.status}@+${((h.at - T0) / 1000).toFixed(1)}s`)
        .join(",")} · trạng thái=${sCtrl.statuses.map((x) => x.status).join(",")}`,
    );

    // Kênh chết rồi có TỰ HỒI không? (quyết định mức thiệt hại thật của lỗi gia hạn)
    const recovered = (s: Sub) => {
      const close = closeOf(s);
      if (!close) return "không bị đóng";
      const back = s.statuses.find((x) => x.at > close.at && x.status === "SUBSCRIBED");
      const tickAfter = s.hits.some((h) => h.event === "zztest.tick" && h.at > close.at + 1_000);
      return back
        ? `có, SUBSCRIBED lại sau ${((back.at - close.at) / 1000).toFixed(1)}s`
        : `KHÔNG hồi trong ${((Date.now() - close.at) / 1000).toFixed(0)}s quan sát ` +
            `(nhận thêm tick sau khi đóng=${tickAfter})`;
    };
    measure("kênh bị đóng có tự SUBSCRIBED lại không", "");
    console.log(`        R : ${recovered(sR)}`);
    console.log(`        R2: ${recovered(sR2)}`);
    console.log(`        R3: ${recovered(sR3)}`);

    // ── 3d-quater. TÁCH NGUYÊN NHÂN bằng R3 ────────────────────────────────
    // R3 gia hạn ở +45s (giữa hai nhịp heartbeat +37s và +62s) và token gốc của nó
    // sống tới +200s ⇒ nếu nó chết thì KHÔNG thể do hết hạn.
    //   chết ≈ nhịp heartbeat kế tiếp  ⇒ thủ phạm = setAuth × heartbeat
    //   chết ≈ swap3At + hằng số       ⇒ thủ phạm = một khoảng chờ cố định sau setAuth
    //   KHÔNG chết                     ⇒ giả thuyết "setAuth giết kênh" SAI, phải tìm lại
    const closeR3 = closeOf(sR3);
    const lastR3 = lastTickAt(sR3, PHASE);
    const hbAfter3 = sR3.heartbeats.filter((h) => h.at >= swap3At);
    const nextHb3 = hbAfter3[0] ?? null;
    report(
      "3d-quater. R3 (gia hạn ở +45s, token gốc còn sống tới +200s) — tách heartbeat vs hằng số",
      closeR3 !== null || (lastR3 !== null && Date.now() - lastR3 > 20_000),
      closeR3 === null
        ? `KHÔNG bị đóng · tick cuối@+${lastR3 === null ? "n/a" : ((lastR3 - T0) / 1000).toFixed(1)}s ` +
          `· exp token gốc@+${((sR3.expAt - T0) / 1000).toFixed(1)}s ⇒ giả thuyết "setAuth giết kênh" KHÔNG tái hiện ở R3`
        : `setAuth@+${((swap3At - T0) / 1000).toFixed(1)}s → đóng@+${((closeR3.at - T0) / 1000).toFixed(1)}s ` +
          `(${((closeR3.at - swap3At) / 1000).toFixed(1)}s sau khi gọi) · ` +
          `nhịp heartbeat KẾ TIẾP sau swap@${nextHb3 ? `+${((nextHb3.at - T0) / 1000).toFixed(1)}s` : "không có"} · ` +
          `lệch so với nhịp đó=${nextHb3 ? `${((closeR3.at - nextHb3.at) / 1000).toFixed(1)}s` : "n/a"} · ` +
          `exp token gốc@+${((sR3.expAt - T0) / 1000).toFixed(1)}s (chết TRƯỚC exp ⇒ không phải hết hạn) · ` +
          `lý do=${closeR3.err ?? "(không có)"}`,
    );
    measure(
      "R3 · so R và R2 (cùng chết ở một mốc tuyệt đối nên không tách được nguyên nhân)",
      closeR3 === null
        ? "R3 sống ⇒ setAuth KHÔNG phải điều kiện đủ để giết kênh — phải xem lại kết luận của R/R2"
        : nextHb3 && Math.abs(closeR3.at - nextHb3.at) < 3_000
          ? `R3 chết TRÙNG nhịp heartbeat kế tiếp ⇒ khớp giả thuyết setAuth × heartbeat`
          : `R3 chết ${((closeR3.at - swap3At) / 1000).toFixed(1)}s sau setAuth, KHÔNG trùng nhịp heartbeat ` +
            `⇒ nguyên nhân là một khoảng chờ cố định sau setAuth, không phải heartbeat`,
    );

    // ── 3e/3f. KHÔNG gia hạn → đo SỐ GIÂY sống thêm sau khi token hết hạn ──
    const analyzeExpiry = (s: Sub) => {
      const firstAt = firstTickAt(s, PHASE);
      const lastAt = lastTickAt(s, PHASE);
      const gotBeforeExp = firstAt !== null && firstAt < s.expAt;
      const err = firstErrorAfter(s, T0);
      const died = lastAt !== null && Date.now() - lastAt > 20_000;
      return {
        gotBeforeExp,
        lastAt,
        err,
        died,
        afterExpSec: lastAt === null ? null : (lastAt - s.expAt) / 1000,
        errAfterExpSec: err === null ? null : (err.at - s.expAt) / 1000,
        tickTotal: tickSeqs(s, PHASE).size,
      };
    };
    const x50 = analyzeExpiry(sE50);
    const x70 = analyzeExpiry(sE70);
    const x80 = analyzeExpiry(sE80);
    for (const [s, x] of [
      [sE50, x50],
      [sE70, x70],
      [sE80, x80],
    ] as const) {
      // ĐỐI CHỨNG bắt buộc cho vế phủ định "ngừng nhận": (a) kênh này ĐÃ nhận tick
      // TRƯỚC khi token hết hạn (tai vốn nghe được), (b) CONTROL vẫn nhận tick SAU đó
      // (nguồn phát vẫn chạy) ⇒ im lặng là do token hết hạn, không phải hết tin.
      const conclusive = x.gotBeforeExp && ctrlAliveLate;
      const sec = x.afterExpSec;
      const errSec = x.errAfterExpSec;
      const sign = (v: number) => (v >= 0 ? "+" : "");
      report(
        `3e. [${s.label}] đo được cận trên (đối chứng đủ)`,
        conclusive,
        `nhận tick trước exp=${x.gotBeforeExp} (tổng ${x.tickTotal} tick) · ` +
          `CONTROL còn sống sau exp=${ctrlAliveLate}`,
      );
      report(
        `3f. [${s.label}] kênh THỰC SỰ ngừng nhận sau khi token hết hạn`,
        conclusive && x.died,
        sec === null
          ? "không nhận được tick nào — vô nghĩa"
          : `tin CUỐI CÙNG lọt vào lúc exp${sign(sec)}${sec.toFixed(1)}s · ` +
            `trạng thái lỗi đầu tiên: ${
              x.err && errSec !== null
                ? `${x.err.status} @ exp${sign(errSec)}${errSec.toFixed(1)}s`
                : "KHÔNG CÓ"
            } · đã im ≥20s=${x.died}`,
      );
      measure(
        `[${s.label}] CẬN TRÊN của LỖ 2`,
        sec === null
          ? "không đo được"
          : `kẻ đã bị gỡ mà KHÔNG tự rời kênh còn nghe được TỐI ĐA ` +
            `${Math.max(0, sec).toFixed(1)}s sau khi token hết hạn ⇒ tối đa ` +
            `(TTL token còn lại) + ${Math.max(0, sec).toFixed(1)}s kể từ lúc bị gỡ`,
      );
    }
    console.log(`  ↳ ĐO  timeline LỖ 3:`);
    for (const s of lo3Subs) console.log(`        ${statusLine(s, T0)}`);
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
    const clean = Object.values(left).every((n) => n === 0);
    report(
      "9. dọn sạch DB (dùng chung với test.satarobo.vn — cấm để rác)",
      clean,
      `còn sót: ${JSON.stringify(left)}`,
    );
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
