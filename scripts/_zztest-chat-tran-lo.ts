/**
 * ZZTEST — ĐO RIÊNG cái trần đang giết fan-out, để trả lời ĐÚNG MỘT câu hỏi mà phương
 * án vá phụ thuộc vào:
 *
 *     `BROADCAST_MAX_PER_POST` (lib/chat/broadcast.ts:43) nên hạ xuống bao nhiêu —
 *     và HẠ KÍCH THƯỚC LÔ CÓ ĐỦ KHÔNG?
 *
 *   pnpm exec tsx scripts/_zztest-chat-tran-lo.ts
 *
 * Vì sao phải tách khỏi `_zztest-chat-token-va-lo.ts`: ở đó phép thử "chia nhỏ" chạy
 * TUẦN TỰ và tổng 3 POST mất 137 GIÂY ⇒ nó KHÔNG hề kiểm được giả thuyết "trần theo
 * SỐ EVENT/GIÂY", vì 201 event đã bị rải ra hơn 2 phút. Mà `broadcastMessages`
 * (broadcast.ts:148) bắn các lô **SONG SONG** bằng `Promise.allSettled` ⇒ đúng cái
 * kịch bản chưa được kiểm. Nếu trần là event/giây thì hạ `BROADCAST_MAX_PER_POST`
 * KHÔNG cứu được gì: 260 người vẫn thành 4 lô bắn cùng lúc trong một giây.
 *
 * ⛔ CHỐNG PASS GIẢ: mọi kết luận "MẤT" đều kèm `probeAlive()` — bắn một mồi nhỏ vào
 * đúng kênh đó ngay sau đó và bắt buộc phải thấy nó tới. Không thấy ⇒ in "KHÔNG KẾT
 * LUẬN ĐƯỢC", không được đọc thành "server không gửi".
 *
 * ⚠️ KHÔNG CHẠM DB: policy `user_can_receive_own_user_broadcast`
 * (`prisma/migrations/20260809160000_chat_user_topic_rls`) chỉ so `realtime.topic()`
 * với claim `app_user_id`, KHÔNG join bảng nào ⇒ không cần seed User/Conversation.
 * Script này tạo 0 hàng, nên không có gì để dọn (vẫn in xác nhận ở cuối).
 */
import "./_load-env";
import { randomUUID } from "node:crypto";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { v5 as uuidv5 } from "uuid";

/** PHẢI trùng namespace trong lib/chat/realtime-token.ts:20. */
const SUB_NAMESPACE = "7d5c1af6-2b4e-4c39-9f1d-8a0e3b6d2c91";
/** Trần đang khai trong lib/chat/broadcast.ts:43 — script không import được (không export). */
const MAX_PER_POST_HIEN_TAI = 200;
/** Trần chờ trong lib/chat/broadcast.ts:33 — dùng để đối chiếu độ trễ đo được. */
const BROADCAST_TIMEOUT_MS = 5_000;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Hai "người" ảo chỉ tồn tại trong claim JWT — không có hàng nào trong DB. */
const UID_A = `zztestTranLoA${randomUUID().replace(/-/g, "")}`;
const UID_B = `zztestTranLoB${randomUUID().replace(/-/g, "")}`;

type StepResult = { step: string; pass: boolean; detail: string };
const results: StepResult[] = [];
function report(step: string, pass: boolean, detail: string) {
  results.push({ step, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${step} — ${detail}`);
}
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

async function mintToken(appUserId: string, ttlSeconds = 30 * 60): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: "authenticated", app_user_id: appUserId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(uuidv5(appUserId, SUB_NAMESPACE))
    .setAudience("authenticated")
    .setIssuedAt(iat)
    .setExpirationTime(iat + ttlSeconds)
    .sign(new TextEncoder().encode(JWT_SECRET));
}

type Hit = { payload: Record<string, unknown>; at: number };
type Sub = { label: string; client: SupabaseClient; channel: RealtimeChannel; hits: Hit[]; subscribed: boolean };
const clients: SupabaseClient[] = [];

async function openSub(label: string, userId: string): Promise<Sub> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  clients.push(client);
  await client.realtime.setAuth(await mintToken(userId));
  const channel = client.channel(`user:${userId}`, { config: { private: true } });
  const sub: Sub = { label, client, channel, hits: [], subscribed: false };
  channel.on("broadcast", { event: "*" }, (msg) => {
    const m = msg as { payload?: unknown };
    sub.hits.push({ payload: (m.payload ?? {}) as Record<string, unknown>, at: Date.now() });
  });
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") sub.subscribed = true;
  });
  return sub;
}

type PostResult = { status: number; ms: number; body: string };

/** MỘT POST service-role. KHÔNG đặt timeout — mục đích là ĐO độ trễ thật, kể cả khi nó
 *  vượt xa `BROADCAST_TIMEOUT_MS` mà code sản phẩm đang cắt. */
async function postBatch(
  messages: { topic: string; event: string; payload: Record<string, unknown> }[],
): Promise<PostResult> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages: messages.map((m) => ({ ...m, private: true })) }),
    });
    const body = res.ok ? "" : (await res.text()).slice(0, 160).replace(/\s+/g, " ");
    return { status: res.status, ms: Date.now() - t0, body };
  } catch (e) {
    return { status: -1, ms: Date.now() - t0, body: String(e).slice(0, 160) };
  }
}

/** Dựng một lô n phần tử: phần tử ĐẦU về kênh A, phần tử CUỐI về kênh B, giữa là topic mồ côi. */
function mkBatch(n: number, mark: string) {
  const out: { topic: string; event: string; payload: Record<string, unknown> }[] = [];
  for (let i = 0; i < n; i += 1) {
    const who = i === 0 ? UID_A : i === n - 1 ? UID_B : null;
    out.push({
      topic: who ? `user:${who}` : `user:zztest-tranlo-don-${randomUUID()}`,
      event: "conversation.bumped",
      payload: {
        conversationId: mark,
        messageId: `${mark}#${i === 0 ? "F" : i === n - 1 ? "L" : i}`,
        kind: "CHAT",
        at: "",
      },
    });
  }
  return out;
}

function got(sub: Sub, messageId: string) {
  return sub.hits.some((h) => h.payload.messageId === messageId);
}

/** ĐỐI CHỨNG SỐNG — bắt buộc trước khi đọc bất kỳ chữ "MẤT" nào. */
async function probeAlive(subs: Sub[], userIds: string[]): Promise<boolean> {
  const mark = `TRANLO_ALIVE_${randomUUID()}`;
  await postBatch(
    userIds.map((id) => ({
      topic: `user:${id}`,
      event: "conversation.bumped",
      payload: { conversationId: mark, messageId: mark, kind: "CHAT", at: "" },
    })),
  );
  return waitUntil(() => subs.every((s) => got(s, mark)), 10_000);
}

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
    `\n❌ Thiếu env Supabase THẬT: ${missing.join(", ")} — không đo được gì, thoát mã 1.\n` +
      "Điền vào .env.local (project Supabase DEV, KHÔNG PROD). Không dán giá trị vào chat.\n",
  );
  return false;
}

async function main() {
  console.log(`Supabase host: ${SUPABASE_URL.replace(/^https?:\/\//, "")}`);
  if (!requireEnv()) {
    process.exitCode = 1;
    return;
  }

  const subA = await openSub("A", UID_A);
  const subB = await openSub("B", UID_B);
  const ok = await waitUntil(() => subA.subscribed && subB.subscribed, 20_000);
  report(
    "0. hai kênh user: mở được bằng JWT tự ký (policy không cần hàng DB nào)",
    ok,
    `A=${subA.subscribed} B=${subB.subscribed}`,
  );
  if (!ok) {
    process.exitCode = 1;
    for (const c of clients) c.realtime.disconnect();
    return;
  }

  try {
    // ── A. THANG KÍCH THƯỚC: tìm mốc gãy CHÍNH XÁC, mỗi phép cách nhau 20s ────
    // 20s > mọi cửa sổ đếm theo giây ⇒ mỗi phép dò đứng một mình, không dính "vừa nãy
    // bắn quá nhiều".
    const ladder = [60, 70, 80, 85, 90, 95, 100];
    const rowsA: string[] = [];
    const passA: number[] = [];
    for (const n of ladder) {
      const mark = `TRANLO_A${n}_${randomUUID()}`;
      const r = await postBatch(mkBatch(n, mark));
      await waitUntil(() => got(subA, `${mark}#F`) && got(subB, `${mark}#L`), 8_000);
      const f = got(subA, `${mark}#F`);
      const l = got(subB, `${mark}#L`);
      if (r.status === 202 && f && l) passA.push(n);
      rowsA.push(
        `n=${n}:http=${r.status} ${r.ms}ms đầu=${f ? "✓" : "✗"} cuối=${l ? "✓" : "✗"}` +
          (r.body ? ` body=${JSON.stringify(r.body)}` : ""),
      );
      await sleep(20_000);
    }
    const aliveA = await probeAlive([subA, subB], [UID_A, UID_B]);
    const maxClean = passA.length > 0 ? Math.max(...passA) : 0;
    const firstBroken = ladder.find((n) => !passA.includes(n));
    report(
      "A. thang kích thước MỘT POST (tuần tự, giãn 20s)",
      aliveA,
      `${rowsA.join(" | ")} · đối_chứng_tai_còn_nghe=${aliveA}` +
        (aliveA ? "" : " ⇒ KHÔNG KẾT LUẬN ĐƯỢC"),
    );
    measure(
      "kích thước LỚN NHẤT còn giao trọn vẹn (http 202 + cả hai đầu nhận)",
      `${maxClean} · mốc hỏng đầu tiên=${firstBroken ?? "không có"} · ` +
        `ngưỡng lib đang đặt=${MAX_PER_POST_HIEN_TAI}`,
    );

    await sleep(25_000);

    // ── B. SONG SONG — ĐÚNG cách `broadcastMessages` bắn (Promise.allSettled) ──
    // Đây là phép thử QUYẾT ĐỊNH phương án vá:
    //   • tất cả 202 + giao đủ ⇒ trần theo KÍCH THƯỚC MỘT POST ⇒ hạ
    //     BROADCAST_MAX_PER_POST là ĐỦ, không phải giãn nhịp.
    //   • có 429 ⇒ trần theo SỐ EVENT/GIÂY ⇒ hạ kích thước lô KHÔNG cứu được,
    //     phải tuần tự hoá / giãn nhịp / nâng hạn ngạch.
    const parallelPlan = [
      { lo: 4, moi: 65, ten: "260 event = 4 lô × 65 (đúng cỡ hội thoại LỖ 4)" },
      { lo: 8, moi: 65, ten: "520 event = 8 lô × 65 (nhóm gộp / thông báo toàn cơ sở)" },
    ];
    for (const plan of parallelPlan) {
      const mark = `TRANLO_P${plan.lo}_${randomUUID()}`;
      // Mỗi lô có đầu về A và cuối về B ⇒ mất lô nào cũng thấy được.
      const batches = Array.from({ length: plan.lo }, (_, k) => mkBatch(plan.moi, `${mark}#b${k}`));
      const t0 = Date.now();
      const res = await Promise.all(batches.map((b) => postBatch(b)));
      const wallMs = Date.now() - t0;
      await waitUntil(
        () =>
          res.every((_, k) => got(subA, `${mark}#b${k}#F`) && got(subB, `${mark}#b${k}#L`)),
        12_000,
      );
      const rows = res.map((r, k) => {
        const f = got(subA, `${mark}#b${k}#F`);
        const l = got(subB, `${mark}#b${k}#L`);
        return (
          `lô${k + 1}:http=${r.status} ${r.ms}ms ${f && l ? "GIAO" : "MẤT"}` +
          (r.body ? ` body=${JSON.stringify(r.body)}` : "")
        );
      });
      const allOk = res.every((r, k) => r.status === 202 && got(subA, `${mark}#b${k}#F`) && got(subB, `${mark}#b${k}#L`));
      const alive = allOk ? true : await probeAlive([subA, subB], [UID_A, UID_B]);
      const overTimeout = res.filter((r) => r.ms > BROADCAST_TIMEOUT_MS).length;
      report(
        `B. SONG SONG — ${plan.ten}`,
        allOk && alive,
        `${rows.join(" | ")} · tổng thời gian (song song)=${wallMs}ms · ` +
          `số lô vượt trần chờ ${BROADCAST_TIMEOUT_MS}ms của sản phẩm=${overTimeout}/${res.length} · ` +
          `đối_chứng_tai_còn_nghe=${alive}` +
          (alive ? "" : " ⇒ KHÔNG KẾT LUẬN ĐƯỢC"),
      );
      // ⚠️ ĐỌC KẾT QUẢ CHO ĐÚNG — có HAI kiểu hỏng khác hẳn nhau, đừng gộp làm một:
      //   • HTTP 429 + body "reduce the batch size" ⇒ endpoint TỪ CHỐI vì lô quá to.
      //     Đây mới là bằng chứng cho "trần theo KÍCH THƯỚC".
      //   • HTTP 502 ở ~60s ⇒ chỉ là GATEWAY HẾT GIỜ vì POST quá chậm. Endpoint dev
      //     này xuống cấp dần: cùng một lô 65 phần tử lúc đầu 0,4s, sau vài phút thành
      //     45–60s. 502 KHÔNG chứng minh được trần nhịp — nó chỉ nói "lúc đó đang chậm".
      // Nên chỉ kết luận "có trần theo nhịp" khi thấy 429, không phải khi thấy 502.
      const soc429 = res.filter((r) => r.status === 429).length;
      const soc502 = res.filter((r) => r.status === 502).length;
      const chamHon5s = res.filter((r) => r.ms > BROADCAST_TIMEOUT_MS).length;
      measure(
        `KẾT LUẬN cho ${plan.lo}×${plan.moi}`,
        allOk
          ? `${plan.lo * plan.moi} event bắn CÙNG LÚC trong ${wallMs}ms ĐỀU QUA ⇒ trần theo ` +
            `KÍCH THƯỚC MỘT POST, KHÔNG phải event/giây`
          : soc429 > 0
            ? `${soc429}/${res.length} lô bị 429 "reduce the batch size" khi bắn cùng lúc ` +
              `⇒ CÓ trần theo NHỊP; hạ BROADCAST_MAX_PER_POST một mình KHÔNG đủ`
            : `KHÔNG KẾT LUẬN ĐƯỢC về trần nhịp: 0 lô bị 429, nhưng ${soc502}/${res.length} lô ` +
              `bị 502 (gateway hết giờ ~60s) và ${chamHon5s}/${res.length} lô chậm hơn trần ` +
              `${BROADCAST_TIMEOUT_MS}ms của sản phẩm ⇒ endpoint đang XUỐNG CẤP, phép đo này ` +
              `chỉ nói "chậm", không nói "bị chặn theo nhịp". Đo lại lúc endpoint còn tươi.`,
      );
      await sleep(25_000);
    }
  } finally {
    for (const c of clients) {
      try {
        await c.removeAllChannels();
        c.realtime.disconnect();
      } catch {
        /* bỏ qua lỗi lúc đóng kết nối */
      }
    }
    report(
      "9. dọn sạch",
      true,
      "script này KHÔNG ghi hàng nào vào DB (policy `user:` chỉ đọc claim JWT) ⇒ không có gì để dọn",
    );
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
    setTimeout(() => process.exit(process.exitCode ?? 0), 500);
  });
