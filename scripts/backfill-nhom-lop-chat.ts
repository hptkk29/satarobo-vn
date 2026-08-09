/**
 * BACKFILL — tạo nhóm chat cho các lớp ĐÃ ACTIVE từ trước khi module chat ra đời.
 *
 *   pnpm exec tsx scripts/backfill-nhom-lop-chat.ts                 # DRY-RUN (mặc định)
 *   pnpm exec tsx scripts/backfill-nhom-lop-chat.ts --apply         # ghi thật
 *   pnpm exec tsx scripts/backfill-nhom-lop-chat.ts --limit 3
 *   pnpm exec tsx scripts/backfill-nhom-lop-chat.ts --classes id1,id2
 *   pnpm exec tsx scripts/backfill-nhom-lop-chat.ts --preview 10    # số lớp in chi tiết
 *
 * ── VÌ SAO CẦN ────────────────────────────────────────────────────────────────
 * BR-01 viết "nhóm lớp được tạo tự động khi Class CHUYỂN sang trạng thái hoạt động", và
 * `syncConversationMembership` chỉ chạy khi có SỰ KIỆN nghiệp vụ (duyệt lớp, sửa lớp, đổi
 * ghi danh, đổi QLCS…). Lớp vốn ĐÃ ACTIVE từ trước khi module chat tồn tại chưa bao giờ
 * phát sự kiện nào ⇒ không có nhóm. Job đối soát đêm cũng không cứu được: nó bỏ qua lớp
 * chưa có nhóm (`if (!conversationId) continue`) vì luật "job không tự tạo nhóm/không tự
 * thêm người". Kết quả đo trên DB dev 09/08/2026: 24 lớp ACTIVE / 0 Conversation — mở
 * chat ra là GV lẫn PH thấy màn trắng.
 *
 * Script này là ĐƯỜNG DUY NHẤT được phép tạo bù, và cố ý chạy TAY có dry-run: tạo nhóm =
 * mở một kênh riêng tư giữa GV và phụ huynh, phải có người soi danh sách trước khi bấm.
 *
 * ── AN TOÀN ───────────────────────────────────────────────────────────────────
 *  • DRY-RUN mặc định — không có `--apply` thì KHÔNG ghi một dòng nào.
 *  • CHỈ đụng lớp `status=ACTIVE`, `deletedAt IS NULL`, và CHƯA có Conversation
 *    CLASS_GROUP. Lớp đã có nhóm bị bỏ qua HOÀN TOÀN — không chạy sync lên chúng: sync sẽ
 *    thi hành cả phần diff (set `leftAt`, ghi SYSTEM "đã rời nhóm"), mà đây là thao tác
 *    TẠO BÙ, không phải đối soát. Đối soát là việc của cron US-04.
 *  • Mỗi lớp một transaction riêng (timeout 30s) — lớp lỗi không phá lớp khác.
 *  • Idempotent: chạy lại → 0 lớp cần tạo (điều kiện lọc ở trên), và bản thân
 *    `syncConversationMembership` cũng idempotent.
 *  • KHÔNG rải SYSTEM message hàng loạt: sync đặt cờ `isNewConversation` ở lần tạo nhóm
 *    đầu tiên và bỏ qua toàn bộ nhánh ghi message "đã tham gia nhóm"
 *    (lib/chat/sync-membership.ts). Phía "rời nhóm" cũng không thể xảy ra vì nhóm vừa
 *    tạo chưa có participant nào. Đã kiểm chứng bằng scripts/_zztest-chat-backfill.ts
 *    (đếm message = 0 sau khi backfill lớp có GV + 2 PH + QLCS + Giáo vụ).
 */
import "./_load-env";
import { currentDbHost } from "./_load-env";
import path from "node:path";
import Module from "node:module";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  loadDerivedMembership,
  syncConversationMembership,
  type ClassForMembership,
} from "../lib/chat/sync-membership";

// ⚠️ `lib/chat/sync-membership` kéo `lib/events/publish` (F-KICK) — chuỗi import đó chạm
// `server-only`, package do Next cấp lúc build, KHÔNG có trong node_modules ⇒ chạy dưới
// `tsx` chết MODULE_NOT_FOUND. Trỏ về đúng stub vitest đang dùng (như _zztest-chat-us06).
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

type Tx = Prisma.TransactionClient;

// Script chạy ngoài Next: đi session pooler (DIRECT_URL). Transaction pooler (6543) lỗi
// prepared-statement/42P05 khi bắn nhiều query — vết đã gặp ở mọi ZZTEST chat.
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;

/** timeout 30s như mọi điểm gọi sync thật — trần 5s mặc định của Prisma đứt giữa chừng
 *  khi lớp đông/RTT cao, lớp đó rơi vào catch và trông như lỗi code. */
const TX_OPTS = { timeout: 30_000, maxWait: 10_000 } as const;

export type BackfillOptions = {
  /** Ghi thật. Thiếu cờ này = DRY-RUN (mặc định, không ghi gì). */
  apply?: boolean;
  /** Chỉ xử lý tối đa N lớp (chạy thử). */
  limit?: number;
  /** Chỉ xử lý đúng các classId này (chạy thử / vá 1 lớp). */
  classIds?: string[];
  /** Số lớp in chi tiết danh sách thành viên dự kiến (mặc định 5). */
  previewCount?: number;
  /** Prisma client dùng chung (test truyền vào). Mặc định: client riêng của script. */
  client?: PrismaClient;
  /** Ghi log ra đâu (test nuốt log). */
  log?: (line: string) => void;
};

export type BackfillPreviewMember = {
  userId: string;
  name: string;
  role: string;
  derivedFrom: string;
};

export type BackfillClassPreview = {
  classId: string;
  className: string;
  centerId: string | null;
  members: BackfillPreviewMember[];
};

export type BackfillResult = {
  /** Lớp ACTIVE (sau khi áp --classes/--limit). */
  totalActive: number;
  /** Trong đó đã có nhóm sẵn → BỎ QUA, không đụng tới. */
  alreadyHad: number;
  /** Lớp thiếu nhóm = việc cần làm. */
  missing: number;
  /** Nhóm đã tạo thật (dry-run: luôn 0). */
  created: number;
  /** Lớp lỗi khi tạo (đã log, không phá lớp khác). */
  failed: { classId: string; className: string; error: string }[];
  /** Chi tiết thành viên dự kiến của `previewCount` lớp đầu. */
  preview: BackfillClassPreview[];
  dryRun: boolean;
};

const VAI = {
  CLASS_TEACHER: "GV",
  CLASS_STUDENT_PARENT: "PH",
  CENTER_MANAGER: "QLCS/Giáo vụ",
} as const;

/**
 * Lõi backfill — export để `scripts/_zztest-chat-backfill.ts` chạy CHÍNH hàm này (test
 * bản sao logic thì chứng minh được gì).
 */
export async function backfillClassConversations(
  opts: BackfillOptions = {},
): Promise<BackfillResult> {
  const dryRun = !opts.apply;
  const log = opts.log ?? ((line: string) => console.log(line));
  const db =
    opts.client ??
    new PrismaClient({ datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL });

  // 1) Lớp ACTIVE còn sống. `db` trần (KHÔNG scopedDb) — backfill là thao tác mức hệ
  //    thống, phải thấy mọi cơ sở (cùng lý do với job đối soát US-04).
  const classes = await db.class.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      ...(opts.classIds?.length ? { id: { in: opts.classIds } } : {}),
    },
    select: {
      id: true,
      name: true,
      centerId: true,
      orgUnitId: true,
      teacherId: true,
      assistantId: true,
    },
    orderBy: [{ centerId: "asc" }, { id: "asc" }],
  });

  // 2) Lớp nào ĐÃ có nhóm → loại khỏi việc cần làm.
  const existing = classes.length
    ? await db.conversation.findMany({
        where: {
          type: "CLASS_GROUP",
          subjectType: "CLASS",
          subjectId: { in: classes.map((c) => c.id) },
        },
        select: { subjectId: true },
      })
    : [];
  const hadConversation = new Set(existing.map((c) => c.subjectId as string));

  // ⚠️ ĐIỀU KIỆN SỐNG CÒN — đừng gỡ "cho chạy lại từ đầu cho chắc". Bỏ nó đi thì backfill
  // chạy sync lên CẢ lớp đã có nhóm: sync sẽ diff và thi hành phần REMOVE (set `leftAt` +
  // ghi SYSTEM "đã rời nhóm" cho GV/PH lệch), biến một thao tác TẠO BÙ thành một đợt gỡ
  // người hàng loạt không ai duyệt. Đối soát là việc của cron US-04, không phải của
  // script này. `_zztest-chat-backfill.ts` (ZZ5) đỏ ngay nếu gỡ.
  let missingList = classes.filter((c) => !hadConversation.has(c.id));
  if (opts.limit !== undefined) missingList = missingList.slice(0, opts.limit);

  // 3) Xem trước thành viên của vài lớp đầu (đọc thuần, chạy cả ở dry-run).
  const previewCount = opts.previewCount ?? 5;
  const preview: BackfillClassPreview[] = [];
  for (const cls of missingList.slice(0, previewCount)) {
    const forMembership: ClassForMembership = {
      id: cls.id,
      centerId: cls.centerId,
      teacherId: cls.teacherId,
      assistantId: cls.assistantId,
    };
    try {
      const { desired, userById } = await db.$transaction(
        (tx) => loadDerivedMembership(tx as Tx, forMembership),
        TX_OPTS,
      );
      preview.push({
        classId: cls.id,
        className: cls.name,
        centerId: cls.centerId,
        members: desired.map((d) => {
          const u = userById.get(d.userId);
          return {
            userId: d.userId,
            name: u?.name ?? u?.email ?? u?.phone ?? "(không tên)",
            role: d.role,
            derivedFrom: d.derivedFrom,
          };
        }),
      });
    } catch (err) {
      log(`  ! Không xem trước được lớp ${cls.name} (${cls.id}): ${String(err)}`);
    }
  }

  // 4) Tạo nhóm — CHỈ khi --apply.
  let created = 0;
  const failed: BackfillResult["failed"] = [];
  if (!dryRun) {
    for (const cls of missingList) {
      try {
        // Mỗi lớp 1 transaction riêng: lớp lỗi (dữ liệu bẩn, timeout) không kéo theo lớp
        // khác — nửa vời trong PHẠM VI một lớp vẫn không xảy ra vì tx bao trọn sync.
        await db.$transaction(
          (tx) => syncConversationMembership(tx as Tx, cls.id),
          TX_OPTS,
        );
        created += 1;
        log(`  ✓ ${cls.name} (${cls.id})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failed.push({ classId: cls.id, className: cls.name, error: msg });
        console.error(`[backfill-nhom-lop] ERROR class=${cls.id} (${cls.name})`, err);
      }
    }
  }

  if (!opts.client) await db.$disconnect();

  return {
    totalActive: classes.length,
    alreadyHad: classes.filter((c) => hadConversation.has(c.id)).length,
    missing: missingList.length,
    created,
    failed,
    preview,
    dryRun,
  };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): BackfillOptions {
  const opts: BackfillOptions = { apply: argv.includes("--apply") };
  const valueOf = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const limit = valueOf("--limit");
  if (limit) opts.limit = Number.parseInt(limit, 10);
  const preview = valueOf("--preview");
  if (preview) opts.previewCount = Number.parseInt(preview, 10);
  const classes = valueOf("--classes");
  if (classes) opts.classIds = classes.split(",").map((x) => x.trim()).filter(Boolean);
  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`DB host: ${currentDbHost()}`);
  console.log(
    opts.apply
      ? "CHẾ ĐỘ: --apply — SẼ GHI vào DB"
      : "CHẾ ĐỘ: DRY-RUN (không ghi gì). Thêm --apply để tạo thật.",
  );
  if (opts.classIds?.length) console.log(`Giới hạn lớp: ${opts.classIds.join(", ")}`);
  if (opts.limit !== undefined) console.log(`Giới hạn: ${opts.limit} lớp`);
  console.log("");

  const r = await backfillClassConversations(opts);

  console.log("── TỔNG QUAN ───────────────────────────────────────────────");
  console.log(`Lớp ACTIVE (còn sống)        : ${r.totalActive}`);
  console.log(`  · đã có nhóm → BỎ QUA      : ${r.alreadyHad}`);
  console.log(`  · CHƯA có nhóm → cần tạo   : ${r.missing}`);
  console.log(`Đã tạo trong lần chạy này    : ${r.created}${r.dryRun ? " (dry-run)" : ""}`);
  if (r.failed.length > 0) {
    console.log(`Lỗi                          : ${r.failed.length}`);
    for (const f of r.failed) console.log(`  ! ${f.className} (${f.classId}): ${f.error}`);
  }

  if (r.preview.length > 0) {
    console.log("");
    console.log(
      `── AI SẼ VÀO NHÓM (${r.preview.length} lớp đầu — soi kỹ trước khi --apply) ──`,
    );
    for (const p of r.preview) {
      console.log(`\n▸ ${p.className}  [${p.classId}]  cơ sở=${p.centerId ?? "(trống)"}`);
      if (p.members.length === 0) {
        console.log("    (không ai — lớp chưa có GV, chưa có HV, cơ sở chưa có QLCS)");
        continue;
      }
      const dem = { GV: 0, PH: 0, "QLCS/Giáo vụ": 0 } as Record<string, number>;
      for (const m of p.members) {
        const nhan = VAI[m.derivedFrom as keyof typeof VAI] ?? m.derivedFrom;
        dem[nhan] = (dem[nhan] ?? 0) + 1;
        console.log(`    - ${nhan.padEnd(12)} ${m.role.padEnd(9)} ${m.name}`);
      }
      console.log(
        `    → ${p.members.length} người (GV ${dem.GV} · PH ${dem.PH} · QLCS/Giáo vụ ${dem["QLCS/Giáo vụ"]})`,
      );
    }
  }

  console.log("");
  if (r.dryRun) {
    console.log(
      r.missing > 0
        ? `DRY-RUN xong — CHƯA ghi gì. Chạy lại với --apply để tạo ${r.missing} nhóm.`
        : "DRY-RUN xong — không có lớp nào thiếu nhóm.",
    );
  } else {
    console.log(`XONG — đã tạo ${r.created}/${r.missing} nhóm, ${r.failed.length} lỗi.`);
  }
  process.exitCode = r.failed.length > 0 ? 1 : 0;
}

// Chỉ chạy khi gọi TRỰC TIẾP — file này còn được `_zztest-chat-backfill.ts` import để
// test đúng lõi thật (import mà tự chạy main() thì test sẽ đụng dữ liệu lớp thật).
const invokedPath = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (invokedPath.endsWith("scripts/backfill-nhom-lop-chat.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
