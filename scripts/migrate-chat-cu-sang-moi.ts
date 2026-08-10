/**
 * Sóng 3 Đợt 1 — chuyển tin nhắn chat CŨ (`ConversationMessage`) sang hệ MỚI
 * (`Conversation`/`Message`).
 *
 *   pnpm exec tsx scripts/migrate-chat-cu-sang-moi.ts                 # DRY-RUN (mặc định)
 *   pnpm exec tsx scripts/migrate-chat-cu-sang-moi.ts --limit 200     # DRY-RUN 200 tin đầu
 *   pnpm exec tsx scripts/migrate-chat-cu-sang-moi.ts --classes a,b   # DRY-RUN vài lớp
 *   MIGRATE_CONFIRM=<project ref> pnpm exec tsx scripts/migrate-chat-cu-sang-moi.ts --apply
 *
 * ⚠️ Mặc định KHÔNG ghi gì. `--apply` phải đi kèm biến môi trường `MIGRATE_CONFIRM` bằng
 * ĐÚNG **project ref Supabase** đang trỏ tới (script in ra ở dòng `DB target`) — hàng rào
 * chống chạy nhầm vào PROD. Nhớ: **DB của môi trường `test` CHÍNH LÀ DB dev**, chạy
 * `--apply` ở máy local là đổi luôn dữ liệu đang hiện trên test.satarobo.vn.
 *
 * Bảng ánh xạ, danh sách trường hợp không migrate được, cách kiểm sau khi chạy và cách
 * quay lui: docs/chat-realtime/04-migrate-chat-cu.md.
 *
 * Script CHỈ ĐỌC bảng cũ — không sửa, không xoá một dòng `ConversationMessage` nào.
 */
import "./_load-env";
import { currentDbHost } from "./_load-env";
import { PrismaClient } from "@prisma/client";
import type {
  LegacyMigrationPlan,
  MigrateLegacyChatResult,
  SkipReason,
} from "../lib/chat/migrate-legacy";

// ⚠️ `lib/chat/sync-membership` → `lib/events/publish` → singleton `@/lib/db` (đọc
// DATABASE_URL LÚC KHỞI TẠO). Ép DIRECT_URL (session pooler) TRƯỚC rồi mới dynamic-import,
// y hệt _zztest-chat-us03/us04: transaction pooler 6543 chạy lặp sẽ lỗi prepared-statement
// 42P05. (Static import bị hoist chạy trước dòng gán env → bắt buộc import() động.)
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
const migrateModule = import("../lib/chat/migrate-legacy");

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");

function argValue(name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1];
  const inline = argv.find((a) => a.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

const limitRaw = argValue("--limit");
const LIMIT = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
const ONLY_CLASS_IDS = argValue("--classes")
  ?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Mã xác nhận cho `--apply`.
 *
 * ⚠️ KHÔNG dùng tên database: Supabase đặt tên `postgres` cho MỌI project ⇒ gõ
 * `MIGRATE_CONFIRM=postgres` thì prod và dev giống hệt nhau, hàng rào thành vô dụng.
 * Thứ phân biệt được project là **project ref**, nằm trong username `postgres.<ref>`
 * (xem .claude/rules/prisma-db.md). Không đọc được ref thì rơi về `<user>@<host>` —
 * dài, khó gõ nhầm, vẫn phân biệt được môi trường.
 */
function currentDbTarget(): string {
  const raw = process.env.DATABASE_URL ?? "";
  try {
    const url = new URL(raw);
    const user = decodeURIComponent(url.username);
    const ref = /^postgres\.(.+)$/.exec(user)?.[1];
    return ref ?? `${user}@${url.host}`;
  } catch {
    return "(không đọc được DATABASE_URL)";
  }
}

const SKIP_LABEL: Record<SkipReason, string> = {
  ENROLLMENT_MISSING: "không còn enrollment (không suy được lớp)",
  ENROLLMENT_DELETED: "enrollment đã xoá mềm — hệ cũ đã ẩn, cố ý không hồi sinh",
  CLASS_MISSING: "không suy được lớp từ enrollment",
  NO_CONVERSATION: "lớp không ACTIVE và chưa có nhóm — sync không dựng nhóm (BR-01)",
  SENDER_UNRESOLVED: "không xác định được người gửi (PH chưa có TK / user đã xoá)",
  EMPTY_BODY: "nội dung rỗng — Message.body không nhận rỗng",
};

function printPlan(plan: LegacyMigrationPlan): void {
  const s = plan.stats;
  console.log("── KẾ HOẠCH ─────────────────────────────────────────────────────");
  console.log(`Tổng tin cũ đọc được         : ${s.totalRows}`);
  console.log(`Sẽ đổ sang hệ mới            : ${s.plannedMessages}`);
  console.log(`Đã migrate từ lần chạy trước : ${s.alreadyMigrated}`);
  console.log(`KHÔNG migrate được           : ${s.skipped}`);
  for (const [reason, n] of Object.entries(s.skippedByReason)) {
    if (n > 0) console.log(`   • ${n.toString().padStart(6)} — ${reason}: ${SKIP_LABEL[reason as SkipReason]}`);
  }
  console.log("");
  console.log(`Lớp liên quan (có tin để đổ)  : ${s.classes}`);
  console.log(`   • dùng nhóm đã có          : ${s.classesReusingConversation}`);
  console.log(`   • sẽ dựng nhóm mới (sync)  : ${s.classesCreatingConversation}`);
  console.log(`Lớp KHÔNG dựng được nhóm      : ${s.classesWithoutConversation}`);
  console.log("");
  console.log(`Người gửi lấy từ bản ghi gốc  : ${s.senderResolution.AUTHOR_RECORDED}`);
  console.log(`Người gửi SUY ĐOÁN            : ${s.guessedSenders}`);
  console.log(`   • PH hiện tại của học viên : ${s.senderResolution.PARENT_FALLBACK}`);
  console.log(`   • GV/trợ giảng của lớp     : ${s.senderResolution.CLASS_TEACHER_GUESS}`);
  console.log(`Mốc "đã đọc" suy được (PH)    : ${s.plannedReads}`);
  console.log("");

  if (s.plannedMessages > 0) {
    console.log("── CẢNH BÁO RIÊNG TƯ (đọc trước khi --apply) ────────────────────");
    console.log(
      `Hệ cũ: mỗi enrollment là luồng RIÊNG giữa PH của đúng học viên đó và nhân viên.\n` +
        `Hệ mới KHÔNG có hội thoại-theo-enrollment ⇒ ${s.plannedMessages} tin trên sẽ nằm\n` +
        `trong nhóm lớp và hiện với MỌI thành viên nhóm (mọi PH của lớp + GV + QLCS).\n` +
        `Trong đó ${s.classesWithMultipleStudents}/${s.classes} lớp có từ 2 học viên trở lên từng nhắn tin.`,
    );
    console.log("");
  }

  const preview = plan.classes.slice(0, 20);
  if (preview.length > 0) {
    console.log("── CHI TIẾT THEO LỚP (tối đa 20 lớp đầu) ────────────────────────");
    for (const c of preview) {
      console.log(
        `  ${c.classId}  ${(c.className ?? "?").padEnd(28).slice(0, 28)}  ` +
          `${String(c.messages.length).padStart(5)} tin · ${c.distinctStudents} HV · ` +
          `${c.conversationId ? `nhóm ${c.conversationId}` : "sẽ dựng nhóm"} · ` +
          `${c.reads.length} mốc đọc`,
      );
    }
    if (plan.classes.length > preview.length) {
      console.log(`  … và ${plan.classes.length - preview.length} lớp nữa`);
    }
    console.log("");
  }

  const skippedPreview = plan.skipped.slice(0, 20);
  if (skippedPreview.length > 0) {
    console.log("── TIN KHÔNG MIGRATE ĐƯỢC (tối đa 20 dòng đầu) ──────────────────");
    for (const s2 of skippedPreview) console.log(`  [${s2.reason}] ${s2.legacyId} — ${s2.detail}`);
    if (plan.skipped.length > skippedPreview.length) {
      console.log(`  … và ${plan.skipped.length - skippedPreview.length} tin nữa`);
    }
    console.log("");
  }
}

function printApplyResult(res: MigrateLegacyChatResult): void {
  console.log("── KẾT QUẢ GHI ──────────────────────────────────────────────────");
  console.log(`Tin đã chèn      : ${res.insertedMessages}`);
  console.log(`Mốc đọc đã set   : ${res.updatedReads}`);
  console.log(`Lớp xong         : ${res.classesDone}`);
  console.log(`Lớp lỗi          : ${res.classesFailed}`);
  for (const e of res.errors) console.log(`   • ${e.classId}: ${e.message}`);
  console.log(`Thời gian        : ${res.durationMs}ms`);
}

async function main(): Promise<void> {
  const { migrateLegacyChat } = await migrateModule;

  const dbHost = currentDbHost();
  const dbTarget = currentDbTarget();
  console.log("");
  console.log("═══ MIGRATE CHAT CŨ → HỆ MỚI ═══════════════════════════════════");
  console.log(`Chế độ   : ${APPLY ? "⚠️  APPLY — SẼ GHI VÀO DB" : "DRY-RUN (không ghi gì)"}`);
  console.log(`DB host  : ${dbHost}`);
  console.log(`DB target: ${dbTarget}  ← mã xác nhận cho --apply (project ref Supabase)`);
  if (LIMIT !== undefined) console.log(`Giới hạn : ${LIMIT} tin cũ đầu tiên (theo createdAt)`);
  if (ONLY_CLASS_IDS) console.log(`Chỉ lớp  : ${ONLY_CLASS_IDS.join(", ")}`);
  console.log("");

  if (limitRaw !== undefined && (LIMIT === undefined || !Number.isFinite(LIMIT) || LIMIT <= 0)) {
    console.error(`--limit phải là số nguyên dương, nhận được "${limitRaw}".`);
    process.exitCode = 1;
    return;
  }

  if (APPLY) {
    const confirm = process.env.MIGRATE_CONFIRM;
    if (confirm !== dbTarget) {
      console.error(
        `DỪNG — chưa xác nhận đúng database.\n` +
          `  Đang trỏ tới : ${dbTarget} @ ${dbHost}\n` +
          `  MIGRATE_CONFIRM = ${confirm === undefined ? "(chưa đặt)" : `"${confirm}"`}\n\n` +
          `Chạy lại với: MIGRATE_CONFIRM=${dbTarget} … --apply\n` +
          `(Hàng rào này để không ai lỡ tay đổ dữ liệu vào DB PROD. Đọc kỹ host ở trên.)`,
      );
      process.exitCode = 1;
      return;
    }
  }

  // Client TRẦN: migrate là thao tác mức hệ thống (không scopedDb, không extension
  // soft-delete) — phải thấy mọi lớp/enrollment kể cả đã xoá mềm để còn ĐÁNH DẤU BỎ.
  // Session pooler (DIRECT_URL) như mọi script chạy ngoài Next.
  const db = new PrismaClient({
    datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  });

  try {
    const res = await migrateLegacyChat({
      db,
      apply: APPLY,
      limit: LIMIT,
      onlyClassIds: ONLY_CLASS_IDS,
    });
    printPlan(res.plan);
    if (res.applied) {
      printApplyResult(res);
      if (res.classesFailed > 0) process.exitCode = 1;
    } else {
      console.log(
        "DRY-RUN — chưa ghi gì. Muốn ghi thật:\n" +
          `  MIGRATE_CONFIRM=${dbTarget} pnpm exec tsx scripts/migrate-chat-cu-sang-moi.ts --apply`,
      );
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
