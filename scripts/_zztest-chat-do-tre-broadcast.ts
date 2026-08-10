/**
 * ZZTEST — ĐO ĐỘ TRỄ THẬT của endpoint `/realtime/v1/api/broadcast` theo KÍCH THƯỚC LÔ,
 * trên endpoint NGUỘI (không bị chính phép đo trước làm xuống cấp).
 *
 *   pnpm exec tsx scripts/_zztest-chat-do-tre-broadcast.ts
 *
 * VÌ SAO CẦN RIÊNG MỘT SCRIPT: `_zztest-chat-token-va-lo.ts` bắn hàng trăm event để dò trần
 * lô, và chính nó đẩy endpoint vào backpressure ⇒ mọi số đo độ trễ SAU đó là số đo của một
 * endpoint đã kiệt sức, không phải của đường chạy sản phẩm. Con số cần cho quyết định là:
 *
 *   "một lô `BROADCAST_MAX_PER_POST` phần tử, phát từ trạng thái bình thường, mất bao lâu?"
 *
 * vì `BROADCAST_TIMEOUT_MS = 5_000` CẮT NGANG lời gọi khi quá hạn — và cắt ngang là MẤT
 * người nhận thật (đã đo: 8/12 người mẫu mất bump trong khi tai họ chứng minh được là còn
 * nghe). Nếu độ trễ nguội > 5s thì trần chờ đang đặt sai, không phải endpoint đang lỗi.
 *
 * Không ghi gì vào DB (không seed, không cleanup): chỉ bắn vào các topic `user:zztest-…`
 * không có ai nghe. Đo THỜI GIAN + MÃ HTTP, không đo giao nhận.
 */
import "./_load-env";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Nghỉ giữa các phép đo — đủ dài để endpoint thoát backpressure của phép trước. */
const COOLDOWN_MS = 20_000;
/** Trần chờ ĐANG ĐẶT trong `lib/chat/broadcast.ts` — mốc để đọc kết quả. */
const PROD_TIMEOUT_MS = 5_000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function mkMessages(n: number, mark: string) {
  return Array.from({ length: n }, (_, i) => ({
    topic: `user:zztest-do-tre-${mark}-${i}`,
    event: "conversation.bumped",
    payload: { conversationId: mark, messageId: `${mark}#${i}`, kind: "CHAT", at: "" },
    private: true as const,
  }));
}

async function post(n: number, mark: string): Promise<{ ms: number; status: number }> {
  const t0 = Date.now();
  const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages: mkMessages(n, mark) }),
  });
  await res.text().catch(() => "");
  return { ms: Date.now() - t0, status: res.status };
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("❌ Thiếu NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong .env.local");
    process.exitCode = 1;
    return;
  }

  console.log(
    `Nghỉ ${COOLDOWN_MS / 1000}s cho endpoint nguội trước phép đo đầu tiên…`,
  );
  await sleep(COOLDOWN_MS);

  // Tăng dần, mỗi phép cách nhau COOLDOWN_MS. Lặp 1 và 60 hai lần: cần phân biệt
  // "chậm theo kích thước" với "chậm dần vì bắn liên tiếp".
  const plan = [1, 10, 30, 60, 1, 60] as const;
  const rows: string[] = [];
  for (let k = 0; k < plan.length; k += 1) {
    const n = plan[k]!;
    const r = await post(n, `L${k}_${Date.now()}`);
    const verdict = r.ms > PROD_TIMEOUT_MS ? "VƯỢT trần 5s" : "trong trần 5s";
    const line = `n=${n}\thttp=${r.status}\t${r.ms}ms\t${verdict}\t(${(r.ms / n).toFixed(1)}ms/phần tử)`;
    rows.push(line);
    console.log(`  ${line}`);
    if (k < plan.length - 1) await sleep(COOLDOWN_MS);
  }

  const sixties = rows.filter((r) => r.startsWith("n=60"));
  console.log("\n══════════ KẾT LUẬN ══════════");
  console.log(rows.join("\n"));
  console.log(
    `\nCâu hỏi cần trả lời: lô ${60} phần tử phát từ endpoint NGUỘI có nằm trong trần chờ ` +
      `${PROD_TIMEOUT_MS}ms không?\n  ${sixties.join("\n  ")}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 200));
