/**
 * ZZTEST — US-12 Chat Realtime: thu hồi & gỡ tin (F-DEL).
 *
 *   pnpm exec tsx scripts/_zztest-chat-us12.ts
 *
 * Kiểm trên DB dev THẬT (quy ước ZZTEST: prefix ZZTEST_CHAT_US12_, cleanup try/finally,
 * chạy lại được, ép DIRECT_URL như US-03/04/06):
 *   1. PH thu hồi tin mình gửi 10' trước → ok · `deletedAt`/`deletedById` set ·
 *      **`body` trong DB CÒN NGUYÊN** (AC3 — giữ bằng chứng để đối chất).
 *   2. Tin gửi 20' trước → RECALL_WINDOW_EXPIRED (TS-03.5b — server là chốt chặn thật,
 *      không phụ thuộc việc UI đã ẩn nút).
 *   3. PH gỡ tin của PH khác → PERMISSION_DENIED (TS-03.6a) — kiểm CẢ HAI cửa:
 *      đường kiểm duyệt lẫn đường "thu hồi" (không ai thu hồi hộ ai).
 *   4. GV gỡ tin PH trong lớp mình: KHÔNG lý do → VALIDATION 400 field=reason;
 *      CÓ lý do → ok + tin SYSTEM vào nhóm (AC4) + AuditLog kèm reason (TS-03.6b).
 *   5. QLCS gỡ tin người khác → PERMISSION_DENIED (TS-03.6c).
 *   6. Sau khi gỡ, `getMessagesPage` (lib/chat/queries.ts) KHÔNG trả `body` thật.
 *   7. AC5 — ảnh của tin đã gỡ: xin signed read URL → MESSAGE_DELETED (liên thông với
 *      `lib/chat/attachments.ts`, chứng minh 2 module khớp nhau chứ không chỉ khớp docs).
 *
 * Tự dựng RoleDef riêng (ZZTEST_CHAT_US12_*) để KHÔNG phụ thuộc DB dev đã seed
 * `prisma/seed-roles.ts` bản mới hay chưa, và KHÔNG đụng role thật. Toàn bộ dấu vết bị
 * xoá ở finally. CHẠY 2 LẦN — cả 2 lần PASS toàn bộ mới đạt (quy tắc dự án).
 */
import "./_load-env";
import { currentDbHost } from "./_load-env";
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import Module from "node:module";

// ⚠️ `lib/chat/broadcast.ts` + `lib/chat/attachments.ts` mở đầu bằng `import "server-only"`
// (chặn service role key / R2 credential lọt xuống client). Package đó do Next tự cấp lúc
// build, KHÔNG nằm trong node_modules → chạy dưới `tsx` sẽ chết MODULE_NOT_FOUND. Trỏ nó
// về đúng file stub mà vitest đang dùng — chỉ ảnh hưởng tiến trình script này.
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
// DIRECT_URL (session pooler) TRƯỚC rồi mới dynamic-import, tránh lỗi prepared statement
// của transaction pooler khi script bắn nhiều query.
// (Static import bị hoist chạy trước dòng gán env → phải dùng import() động.)
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
const moderationModule = import("../lib/chat/moderation");
const queriesModule = import("../lib/chat/queries");
const attachmentsModule = import("../lib/chat/attachments");
const actorModule = import("../lib/auth/actor");

const db = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const P = "ZZTEST_CHAT_US12_";
const SLUG = "zztest-chat-us12";
const EMAIL = (x: string) => `${SLUG}-${x}@zztest.local`;
const ROLE_CODES = [`${P}PARENT`, `${P}TEACHER`, `${P}CENTER_MANAGER`];
const BODY_RECALL = `${P}Nội dung tin PH tự thu hồi — phải CÒN NGUYÊN trong DB`;
const BODY_MODERATED = `${P}Nội dung tin bị GV gỡ — phải CÒN NGUYÊN trong DB`;
const REASON = "Nội dung quảng cáo, không liên quan lớp học";

let pass = true;
function report(label: string, ok: boolean, detail: string) {
  pass = pass && ok;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

/** Mã lỗi của `ActionResult` (hoặc "ok" khi thành công) — gọn cho dòng report. */
function codeOf(res: { ok: true } | { ok: false; error: { code: string } }): string {
  return res.ok ? "ok" : res.error.code;
}

/** Xoá mọi dấu vết ZZTEST của script này (kể cả rác lần chạy trước) — idempotent. */
async function cleanup(): Promise<void> {
  const classes = await db.class.findMany({
    where: { name: { startsWith: P } },
    select: { id: true },
  });
  const classIds = classes.map((c) => c.id);
  const convs = await db.conversation.findMany({
    where: {
      OR: [
        { title: { startsWith: P } },
        ...(classIds.length
          ? [{ type: "CLASS_GROUP" as const, subjectId: { in: classIds } }]
          : []),
      ],
    },
    select: { id: true },
  });
  const convIds = convs.map((c) => c.id);
  if (convIds.length > 0) {
    const msgs = await db.message.findMany({
      where: { conversationId: { in: convIds } },
      select: { id: true },
    });
    const msgIds = msgs.map((m) => m.id);
    if (msgIds.length > 0) {
      await db.messageAttachment.deleteMany({ where: { messageId: { in: msgIds } } });
    }
    await db.message.deleteMany({ where: { conversationId: { in: convIds } } });
    await db.conversationParticipant.deleteMany({
      where: { conversationId: { in: convIds } },
    });
    await db.conversation.deleteMany({ where: { id: { in: convIds } } });
  }
  if (classIds.length > 0) {
    await db.enrollment.deleteMany({ where: { classId: { in: classIds } } });
    await db.class.deleteMany({ where: { id: { in: classIds } } });
  }

  const users = await db.user.findMany({
    where: { email: { startsWith: `${SLUG}-` } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await db.userOrgRole.deleteMany({ where: { userId: { in: userIds } } });
  }

  const roles = await db.roleDef.findMany({
    where: { code: { in: ROLE_CODES } },
    select: { id: true },
  });
  const roleIds = roles.map((r) => r.id);
  if (roleIds.length > 0) {
    await db.userOrgRole.deleteMany({ where: { roleId: { in: roleIds } } });
    await db.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await db.roleDef.deleteMany({ where: { id: { in: roleIds } } });
  }

  await db.user.deleteMany({ where: { email: { startsWith: `${SLUG}-` } } });
  await db.course.deleteMany({ where: { slug: `${SLUG}-course` } });
  await db.center.deleteMany({ where: { slug: `${SLUG}-center` } });
}

async function main() {
  console.log(`DB host: ${currentDbHost()}`);
  const { recallOwnMessageAsActor, deleteMessageAsModeratorAsActor } =
    await moderationModule;
  const { getMessagesPage, DELETED_MESSAGE_TEXT } = await queriesModule;
  const { getChatAttachmentReadUrl } = await attachmentsModule;
  const { resolveActorUncached } = await actorModule;

  await cleanup(); // dọn rác lần chạy trước (idempotent)

  try {
    // ── Seed ────────────────────────────────────────────────────────────────
    const orgUnit =
      (await db.orgUnit.findFirst({ where: { type: "CENTER", deletedAt: null } })) ??
      (await db.orgUnit.findFirst({ where: { deletedAt: null } }));
    if (!orgUnit) throw new Error("DB dev không có OrgUnit nào — không dựng được actor");

    const center = await db.center.create({
      data: { name: `${P}Center`, slug: `${SLUG}-center`, address: "ZZTEST", city: "" },
    });
    const course = await db.course.create({
      data: { name: `${P}Course`, slug: `${SLUG}-course` },
    });

    // Tạo tuần tự (không Promise.all) — pooler Supabase hay lỗi prepared-statement khi
    // bắn song song từ script ngoài Next.
    const parentRole = await db.roleDef.create({
      data: {
        code: `${P}PARENT`,
        name: "ZZTEST US-12 phụ huynh",
        permissions: {
          create: [
            { action: "chat:read", scopeType: "OWN" },
            { action: "chat:send", scopeType: "OWN" },
          ],
        },
      },
    });
    const teacherRole = await db.roleDef.create({
      data: {
        code: `${P}TEACHER`,
        name: "ZZTEST US-12 giáo viên",
        permissions: {
          create: [
            { action: "chat:read", scopeType: "ASSIGNED" },
            { action: "chat:send", scopeType: "ASSIGNED" },
            // Đúng như prisma/seed-roles.ts: GV chỉ kiểm duyệt lớp ĐƯỢC PHÂN CÔNG.
            { action: "chat:moderate", scopeType: "ASSIGNED" },
          ],
        },
      },
    });
    const managerRole = await db.roleDef.create({
      data: {
        code: `${P}CENTER_MANAGER`,
        name: "ZZTEST US-12 quản lý cơ sở",
        permissions: {
          create: [
            // ⚠️ GLOBAL là CỐ Ý (role thật của QLCS là CENTER): để case 5 chứng minh
            // QLCS bị chặn vì THIẾU `chat:moderate`, chứ không phải vì trượt scope cơ sở.
            // Không có `chat:moderate` — đúng ô ❌ của permissions.md.
            { action: "chat:read", scopeType: "GLOBAL" },
            { action: "chat:send", scopeType: "GLOBAL" },
          ],
        },
      },
    });

    const mkUser = (slug: string, role: "PARENT" | "TEACHER" | "CENTER_MANAGER") =>
      db.user.create({
        data: {
          email: EMAIL(slug),
          name: `${P}${slug}`,
          role,
          roles: [role],
          centerId: center.id,
        },
      });
    const ph1 = await mkUser("ph1", "PARENT");
    const ph2 = await mkUser("ph2", "PARENT");
    const gv1 = await mkUser("gv1", "TEACHER");
    const ql1 = await mkUser("ql1", "CENTER_MANAGER");

    for (const [u, role] of [
      [ph1, parentRole],
      [ph2, parentRole],
      [gv1, teacherRole],
      [ql1, managerRole],
    ] as const) {
      await db.userOrgRole.create({
        data: {
          userId: u.id,
          orgUnitId: orgUnit.id,
          roleId: role.id,
          status: "ACTIVE",
          grantedById: gv1.id,
        },
      });
    }

    // Lớp thật + GV được PHÂN CÔNG → `actor.assignedClassIds` có lớp này ⇒ scope
    // ASSIGNED của `chat:moderate` mới khớp (nếu không, case 4 sẽ đỏ vì PERMISSION_DENIED).
    const lop = await db.class.create({
      data: {
        name: `${P}LopA`,
        courseId: course.id,
        centerId: center.id,
        teacherId: gv1.id,
        status: "ACTIVE",
      },
    });

    const conv = await db.conversation.create({
      data: {
        type: "CLASS_GROUP",
        subjectType: "CLASS",
        subjectId: lop.id,
        status: "ACTIVE",
        centerId: center.id,
        orgUnitId: orgUnit.id,
        title: `${P}Nhóm lớp A`,
      },
    });
    for (const [u, role, derivedFrom] of [
      [gv1, "MODERATOR", "CLASS_TEACHER"],
      [ph1, "MEMBER", "CLASS_STUDENT_PARENT"],
      [ph2, "MEMBER", "CLASS_STUDENT_PARENT"],
      [ql1, "MEMBER", "CENTER_MANAGER"],
    ] as const) {
      await db.conversationParticipant.create({
        data: {
          conversationId: conv.id,
          userId: u.id,
          role,
          source: "DERIVED",
          derivedFrom,
        },
      });
    }

    const mkMsg = (senderId: string, body: string, ago: number) =>
      db.message.create({
        data: {
          conversationId: conv.id,
          senderId,
          kind: "CHAT",
          body,
          createdAt: minutesAgo(ago),
        },
      });
    const msgRecall = await mkMsg(ph1.id, BODY_RECALL, 10);
    const msgOld = await mkMsg(ph1.id, `${P}Tin 20 phút trước`, 20);
    const msgOfPh2 = await mkMsg(ph2.id, BODY_MODERATED, 30);
    const msgOfPh2b = await mkMsg(ph2.id, `${P}Tin thứ hai của PH2`, 5);
    const msgImg = await mkMsg(ph1.id, `${P}Tin có ảnh`, 5);
    const att = await db.messageAttachment.create({
      data: {
        messageId: msgImg.id,
        storagePath: `chat-attachments/${conv.id}/2026-08/${SLUG}.jpg`,
        fileName: "anh-lop.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 12_345,
      },
    });

    const actorPh1 = await resolveActorUncached(ph1.id);
    const actorGv1 = await resolveActorUncached(gv1.id);
    const actorQl1 = await resolveActorUncached(ql1.id);
    console.log(
      `Seed xong: conv=${conv.id} · lớp=${lop.id} · GV assignedClassIds=${[...actorGv1.assignedClassIds].length}`,
    );

    // ── 1. PH thu hồi tin mình gửi 10' trước ────────────────────────────────
    const res1 = await recallOwnMessageAsActor(actorPh1, `${P}ph1`, {
      messageId: msgRecall.id,
    });
    const row1 = await db.message.findUniqueOrThrow({ where: { id: msgRecall.id } });
    const ok1 =
      res1.ok &&
      row1.deletedAt !== null &&
      row1.deletedById === ph1.id &&
      row1.deletedReason === null &&
      row1.body === BODY_RECALL; // AC3 — nội dung KHÔNG bị đụng tới
    report(
      "1. PH thu hồi tin 10' trước → ok + soft delete + body CÒN NGUYÊN (AC1/AC3)",
      ok1,
      `${codeOf(res1)} · deletedAt=${row1.deletedAt?.toISOString() ?? "null"} · deletedById=${
        row1.deletedById === ph1.id ? "ph1" : String(row1.deletedById)
      } · body giữ nguyên=${row1.body === BODY_RECALL}${res1.ok ? "" : ` · err=${JSON.stringify(res1.error)}`}`,
    );

    // ── 2. Tin 20' trước → RECALL_WINDOW_EXPIRED (TS-03.5b) ─────────────────
    const res2 = await recallOwnMessageAsActor(actorPh1, `${P}ph1`, {
      messageId: msgOld.id,
    });
    const row2 = await db.message.findUniqueOrThrow({ where: { id: msgOld.id } });
    report(
      "2. tin 20' trước → RECALL_WINDOW_EXPIRED (server chặn dù UI đã ẩn nút)",
      !res2.ok && res2.error.code === "RECALL_WINDOW_EXPIRED" && row2.deletedAt === null,
      `${res2.ok ? "ok:true (SAI)" : `code=${res2.error.code} · msg="${res2.error.message}"`} · tin vẫn còn=${row2.deletedAt === null}`,
    );

    // ── 3. PH gỡ tin của PH khác → PERMISSION_DENIED (TS-03.6a) ─────────────
    const res3a = await deleteMessageAsModeratorAsActor(actorPh1, `${P}ph1`, {
      messageId: msgOfPh2.id,
      reason: REASON, // có lý do hẳn hoi — cái sai là VAI, không phải biểu mẫu
    });
    const res3b = await recallOwnMessageAsActor(actorPh1, `${P}ph1`, {
      messageId: msgOfPh2.id, // thử luôn cửa "thu hồi" để không lọt đường vòng
    });
    const row3 = await db.message.findUniqueOrThrow({ where: { id: msgOfPh2.id } });
    report(
      "3. PH gỡ/thu hồi tin của PH khác → PERMISSION_DENIED cả 2 cửa (TS-03.6a)",
      !res3a.ok &&
        res3a.error.code === "PERMISSION_DENIED" &&
        !res3b.ok &&
        res3b.error.code === "PERMISSION_DENIED" &&
        row3.deletedAt === null,
      `gỡ=${codeOf(res3a)} · thu hồi=${codeOf(res3b)} · tin vẫn còn=${row3.deletedAt === null}`,
    );

    // ── 4. GV gỡ tin PH trong lớp mình: thiếu lý do → 400, có lý do → ok ────
    const sysBefore = await db.message.count({
      where: { conversationId: conv.id, kind: "SYSTEM" },
    });
    const res4a = await deleteMessageAsModeratorAsActor(actorGv1, `${P}gv1`, {
      messageId: msgOfPh2.id,
    });
    const row4a = await db.message.findUniqueOrThrow({ where: { id: msgOfPh2.id } });
    const status4a = res4a.ok
      ? 200
      : (
          {
            VALIDATION: 400,
            PERMISSION_DENIED: 403,
          } as Record<string, number>
        )[res4a.error.code];
    report(
      "4a. GV gỡ KHÔNG lý do → VALIDATION 400 field=reason (KHÔNG phải 403 — TS-03.6b)",
      !res4a.ok &&
        res4a.error.code === "VALIDATION" &&
        res4a.error.field === "reason" &&
        status4a === 400 &&
        row4a.deletedAt === null,
      `${res4a.ok ? "ok:true (SAI)" : `code=${res4a.error.code} · field=${res4a.error.field} · http=${status4a} · msg="${res4a.error.message}"`} · tin vẫn còn=${row4a.deletedAt === null}`,
    );

    const res4b = await deleteMessageAsModeratorAsActor(actorGv1, `${P}gv1`, {
      messageId: msgOfPh2.id,
      reason: REASON,
    });
    const row4b = await db.message.findUniqueOrThrow({ where: { id: msgOfPh2.id } });
    const sysMsgs = await db.message.findMany({
      where: { conversationId: conv.id, kind: "SYSTEM" },
      orderBy: { createdAt: "desc" },
    });
    const audits = await db.auditLog.findMany({
      where: { module: "chat", entityType: "Message", entityId: msgOfPh2.id },
    });
    const audit = audits[0];
    report(
      "4b. GV gỡ CÓ lý do → ok + soft delete + body CÒN NGUYÊN + deletedReason (AC2/AC3)",
      res4b.ok &&
        row4b.deletedAt !== null &&
        row4b.deletedById === gv1.id &&
        row4b.deletedReason === REASON &&
        row4b.body === BODY_MODERATED,
      `${codeOf(res4b)} · deletedById=${row4b.deletedById === gv1.id ? "gv1" : String(row4b.deletedById)} · reason="${row4b.deletedReason}" · body giữ nguyên=${row4b.body === BODY_MODERATED}${res4b.ok ? "" : ` · err=${JSON.stringify(res4b.error)}`}`,
    );
    report(
      "4c. người gỡ ≠ tác giả → tin SYSTEM vào nhóm (AC4)",
      sysMsgs.length === sysBefore + 1 &&
        sysMsgs[0]?.body === "Một tin nhắn đã được quản trị viên gỡ." &&
        sysMsgs[0]?.senderId === null &&
        (res4b.ok ? res4b.data.systemMessageId === sysMsgs[0]?.id : false),
      `SYSTEM trước=${sysBefore} · sau=${sysMsgs.length} · body="${sysMsgs[0]?.body ?? "(không có)"}" · senderId=${String(sysMsgs[0]?.senderId)}`,
    );
    report(
      "4d. AuditLog ghi đúng 1 bản ghi DELETE kèm reason (module chat / entityType Message)",
      audits.length === 1 &&
        audit?.action === "DELETE" &&
        audit?.reason === REASON &&
        audit?.actorId === gv1.id,
      `số bản ghi=${audits.length} · action=${audit?.action} · reason="${audit?.reason}" · actor=${audit?.actorId === gv1.id ? "gv1" : String(audit?.actorId)}`,
    );

    // ── 5. QLCS gỡ tin người khác → PERMISSION_DENIED (TS-03.6c) ────────────
    const res5 = await deleteMessageAsModeratorAsActor(actorQl1, `${P}ql1`, {
      messageId: msgOfPh2b.id,
      reason: REASON,
    });
    const row5 = await db.message.findUniqueOrThrow({ where: { id: msgOfPh2b.id } });
    report(
      "5. QLCS gỡ tin người khác → PERMISSION_DENIED (thiếu chat:moderate — TS-03.6c)",
      !res5.ok && res5.error.code === "PERMISSION_DENIED" && row5.deletedAt === null,
      `${res5.ok ? "ok:true (SAI)" : `code=${res5.error.code} · msg="${res5.error.message}"`} · tin vẫn còn=${row5.deletedAt === null}`,
    );

    // ── 6. Tầng đọc KHÔNG trả body của tin đã gỡ (AC3) ──────────────────────
    const page = await getMessagesPage(conv.id, ph1.id, { limit: 50 });
    const viewRecall = page.messages.find((m) => m.id === msgRecall.id);
    const viewModerated = page.messages.find((m) => m.id === msgOfPh2.id);
    const anyLeak = page.messages.some(
      (m) => m.body === BODY_RECALL || m.body === BODY_MODERATED,
    );
    report(
      "6. getMessagesPage KHÔNG trả body tin đã gỡ (AC3 — DB giữ, API giấu)",
      viewRecall?.deleted === true &&
        viewRecall?.body === DELETED_MESSAGE_TEXT &&
        viewModerated?.deleted === true &&
        viewModerated?.body === DELETED_MESSAGE_TEXT &&
        !anyLeak,
      `tin thu hồi: deleted=${viewRecall?.deleted} body="${viewRecall?.body}" · tin bị gỡ: deleted=${viewModerated?.deleted} body="${viewModerated?.body}" · rò nội dung thật=${anyLeak}`,
    );

    // ── 7. AC5 — ảnh của tin đã gỡ ─────────────────────────────────────────
    // Không viết lại logic: `getChatAttachmentReadUrl` đã có guard MESSAGE_DELETED.
    // Việc của case này là chứng minh HAI module LIÊN THÔNG — gỡ tin bằng hàm US-12
    // thì cửa cấp URL của US-11 đóng lại thật.
    const codeOfAttachment = async (): Promise<string> => {
      try {
        await getChatAttachmentReadUrl(att.id, ph1.id);
        return "ok";
      } catch (e) {
        return (e as { code?: string }).code ?? "UNKNOWN";
      }
    };
    const before7 = await codeOfAttachment(); // "ok" hoặc STORAGE_NOT_CONFIGURED (thiếu env R2)
    const res7 = await recallOwnMessageAsActor(actorPh1, `${P}ph1`, {
      messageId: msgImg.id,
    });
    const after7 = await codeOfAttachment();
    report(
      "7. AC5 — ảnh của tin đã gỡ: signed read URL bị từ chối MESSAGE_DELETED",
      before7 !== "MESSAGE_DELETED" && res7.ok && after7 === "MESSAGE_DELETED",
      `trước khi gỡ=${before7} (không được là MESSAGE_DELETED) · gỡ tin=${codeOf(res7)} · sau khi gỡ=${after7}`,
    );
  } finally {
    await cleanup();
    await db.$disconnect();
  }

  console.log(`\n=== ${pass ? "TẤT CẢ PASS" : "CÓ CASE FAIL"} ===`);
  if (!pass) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
