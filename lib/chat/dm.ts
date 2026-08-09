// lib/chat/dm.ts — US-13: nhắn riêng 1-1 giữa GIÁO VIÊN và PHỤ HUYNH
// (`ConversationType.DM_TEACHER_PARENT`).
//
// Một chỗ duy nhất sở hữu 3 thứ của DM:
//   1. Công thức `dmKey` (BR-06) — hàm THUẦN, xem {@link dmKeyOf}.
//   2. Định nghĩa "quan hệ dạy học còn hiệu lực" — xem {@link findTeachingClassIds}.
//   3. findOrCreate + mở lại hội thoại cũ (AC2) + chống đua (AC5).
//
// ⚠️ KHÔNG `"use server"` ở đầu file (luật E-bis #1): file này còn export schema, hằng
// và hàm thuần cho test. Cửa cho Client Component là `lib/chat/_actions.ts`.
//
// ⚠️ KHÔNG `import "server-only"` — cùng lý do đã ghi ở `lib/chat/queries.ts`: module
// này phải chạy được dưới `tsx` (script vận hành) và trong cron. Chốt chặn "không lọt
// xuống client" là `@/lib/db`.
//
// ⚠️ ĐỌC/GHI BẰNG `db` TRẦN, KHÔNG `scopedDb` (luật E-bis #5): quan hệ dạy học là dữ
// kiện MỨC HỆ THỐNG. `Class`/`Student`/`Enrollment` ∈ SCOPED_MODELS ⇒ đi qua scopedDb
// thì GV dạy chéo cơ sở, hoặc học viên đã chuyển cơ sở mà còn học lớp cũ, sẽ BIẾN MẤT
// khỏi kết quả ⇒ cặp GV–PH hợp lệ bị chặn im lặng. Mọi truy vấn chạm SCOPED_MODELS đi
// bằng `$queryRaw` tagged template (extension của scopedDb/soft-delete KHÔNG áp lên raw
// — nên `deletedAt IS NULL` phải viết tay).
//
// ⚠️ `Conversation.centerId` của DM LUÔN null (delta E.3) — đó chính là cơ chế chặn
// QLCS/Giáo vụ: họ giữ `chat:read/send` scope CENTER, mà `scopeMatches` (lib/auth/can.ts)
// đòi `target.centerId` ⇒ null là deny. ĐỪNG "gán centerId cho tiện truy vấn admin":
// làm thế là mở cửa cho QLCS đọc 1-1 (test pin: lib/auth/chat-permissions.test.ts).
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { Actor, Target } from "@/lib/auth/actor";
import {
  runAction,
  actionFail,
  ActionError,
  type ActionConfig,
  type ActionResult,
} from "@/lib/actions/factory";
import { writeAudit } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import { rateLimit } from "@/lib/rate-limit";

/** Tên hiển thị dự phòng của hội thoại 1-1 (tên thật dựng động từ người còn lại). */
export const DM_TITLE = "Nhắn riêng";

/**
 * Trần mở 1-1: 20 lượt/phút/người (delta E.5 — mọi điểm vào chat phải có rate limit).
 *
 * Vì sao con số này và vì sao chặn TRƯỚC khi đọc DB: mỗi lượt `openDm` chạy
 * `loadOpenDmContext` = 1 `user.findFirst` + 2 truy vấn join `Class × Enrollment ×
 * Student` (`resolveTeacherParentRelation`) + 1 `conversation.findUnique`. Nút bấm trên
 * UI có cờ `pending` nhưng nút KHÔNG phải chốt chặn — Server Action gọi thẳng được, nên
 * không có gì cản một vòng lặp bắn `peerUserId` bất kỳ. 20/phút rộng hơn mọi thao tác
 * thật (mở 1-1 là việc hiếm) nhưng đủ để việc quét id trở nên vô nghĩa.
 */
export const OPEN_DM_RATE_MAX = 20;
const OPEN_DM_RATE_WINDOW_MS = 60_000;

/** Dấu nối trong `dmKey`. Đổi giá trị này = phải migrate dữ liệu `Conversation.dmKey`. */
export const DM_KEY_SEPARATOR = ":";

// ─── PHẦN THUẦN (không DB — unit test ở dm.test.ts) ─────────────────────────

/**
 * **BR-06** — khoá duy nhất của hội thoại 1-1: **sort 2 `User.id` rồi nối**.
 * Đúng nguyên văn chú thích của cột `Conversation.dmKey` trong `prisma/schema.prisma`.
 *
 * Đây là ĐỊNH NGHĨA DUY NHẤT của công thức trong toàn repo — fixture test
 * (`tests/chat/_helpers/seed-chat.ts`) import lại hàm này chứ không chép công thức.
 * Hai bản chép tay lệch nhau = test DM xanh giả (fixture tra một key, code sản phẩm
 * ghi một key khác, không ai thấy).
 *
 * Sắp xếp làm cho khoá ĐỐI XỨNG: `dmKeyOf(a,b) === dmKeyOf(b,a)` ⇒ hai người bấm
 * "Nhắn riêng" cùng lúc va vào CÙNG một unique index (AC5), không sinh 2 hội thoại.
 *
 * ⚠️ KHÔNG có phần phân biệt loại DM trong khoá. Ở P0 chỉ tồn tại
 * `DM_TEACHER_PARENT`, và một cặp (GV, PH) chỉ có đúng một hội thoại riêng. Khi Đợt 3
 * mở `DM_SALE_PARENT`/`DM_STAFF`, nếu CÙNG một cặp user có thể có hai DM khác loại thì
 * phải thêm phần loại vào khoá **ở đây** + migrate dữ liệu cũ — đừng vá bằng cách sinh
 * khoá riêng ở call-site.
 */
export function dmKeyOf(userIdA: string, userIdB: string): string {
  const a = typeof userIdA === "string" ? userIdA.trim() : "";
  const b = typeof userIdB === "string" ? userIdB.trim() : "";
  if (!a || !b) throw new Error("dmKeyOf: thiếu userId");
  if (a === b) throw new Error("dmKeyOf: không thể mở hội thoại riêng với chính mình");
  return [a, b].sort().join(DM_KEY_SEPARATOR);
}

/** Mã lỗi EN + thông điệp VI (quy ước API contract) — client hiện `message` nguyên văn. */
export type DmError = { code: string; message: string };

/** Chiều quan hệ đã xác định: ai là GV, ai là PH, và (các) lớp làm chứng. */
export type TeacherParentRelation = {
  teacherUserId: string;
  parentUserId: string;
  /** Lớp ACTIVE làm chứng cho quan hệ — phần tử đầu dùng làm `target.classId` cho can(). */
  classIds: string[];
};

/**
 * Target cho `can()`. Hàm THUẦN để test được không cần DB.
 *
 * • `createdById = actor.userId` — thủ thuật ĐÃ CÓ TIỀN LỆ ở `sendTargetOf`
 *   (lib/chat/messages.ts): PARENT chỉ giữ `chat:send` scope **OWN**, mà DM có đúng một
 *   `Conversation.createdById` ⇒ nếu lấy giá trị thật thì chỉ NGƯỜI MỞ TRƯỚC qua được
 *   cổng vai, người còn lại nhận PERMISSION_DENIED **trên prod (v2)** trong khi máy local
 *   (v1 tĩnh) vẫn xanh. "Của mình" ở module chat là quan hệ participant, không phải cột
 *   `createdById`. Chốt chặn thật của US-13 là quan hệ dạy học, kiểm trong handler.
 * • `classId` = lớp làm chứng ⇒ TEACHER (scope **ASSIGNED**) khớp vì lớp đó nằm trong
 *   `actor.assignedClassIds`. Không có quan hệ ⇒ null ⇒ GV rụng ngay ở cổng vai.
 * • `centerId` LUÔN null ⇒ QLCS/Giáo vụ (scope CENTER) tự deny (TS-04.6).
 */
export function openDmTargetOf(relation: TeacherParentRelation | null, actor: Actor): Target {
  return {
    createdById: actor.userId,
    classId: relation?.classIds[0] ?? null,
    centerId: null,
  };
}

/** P2002 (unique) — nhận diện theo `code` để không phụ thuộc instanceof (mock được). */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2002"
  );
}

// ─── PHẦN DB ────────────────────────────────────────────────────────────────

type Db = Pick<typeof db, "$queryRaw">;
type Tx = Prisma.TransactionClient;

/**
 * ⭐ ĐỊNH NGHĨA DỨT KHOÁT — "QUAN HỆ DẠY HỌC CÒN HIỆU LỰC" giữa 1 GV và 1 PH:
 *
 *   tồn tại ≥ 1 lớp L thoả ĐỒNG THỜI:
 *     • `L.deletedAt IS NULL` và `L.status = 'ACTIVE'`
 *       (đúng điều kiện sinh nhóm lớp — BR-01: lớp chưa khai giảng / đã kết thúc thì
 *       không có nhóm chat, nên cũng không có cửa nhắn riêng);
 *     • GV là `L.teacherId` **hoặc** `L.assistantId`
 *       (trợ giảng cũng đứng lớp — cùng luật với `computeDerivedMembership`);
 *     • tồn tại học viên S: `S.parentUserId = PH`, `S.deletedAt IS NULL`;
 *     • tồn tại ghi danh E: `E.classId = L.id`, `E.studentId = S.id`,
 *       `E.deletedAt IS NULL`, `E.status ∈ ENROLLMENT_ACTIVE_STATUSES`
 *       (ACTIVE/CONFIRMED/STUDYING/PAUSED — `lib/enrollment-status.ts`).
 *
 * Vì sao dùng CẢ BỘ `ENROLLMENT_ACTIVE_STATUSES` chứ không riêng `CONFIRMED`: đây đúng
 * bộ mà `loadDerivedMembership` dùng để đưa PH vào nhóm lớp. Lấy bộ hẹp hơn sẽ đẻ ra
 * nghịch lý "PH đứng chung nhóm lớp với GV nhưng không được nhắn riêng GV đó" — và
 * PAUSED (bảo lưu) vẫn thuộc lớp theo chốt sẵn có của repo.
 *
 * Trần 20 lớp: chỉ cần BIẾT có quan hệ hay không + một lớp làm chứng cho `target.classId`.
 */
export async function findTeachingClassIds(
  teacherUserId: string,
  parentUserId: string,
  client: Db = db,
): Promise<string[]> {
  if (!teacherUserId || !parentUserId || teacherUserId === parentUserId) return [];
  // RAW có chủ đích — xem khối "BẪY scopedDb" đầu file. `e."deletedAt" IS NULL` và
  // `s."deletedAt" IS NULL` viết tay vì raw không qua extension soft-delete.
  const rows = await client.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT cl."id"
    FROM "Class" cl
    JOIN "Enrollment" e ON e."classId" = cl."id"
    JOIN "Student" s ON s."id" = e."studentId"
    WHERE cl."deletedAt" IS NULL
      AND cl."status" = 'ACTIVE'::"ClassStatus"
      AND (cl."teacherId" = ${teacherUserId} OR cl."assistantId" = ${teacherUserId})
      AND e."deletedAt" IS NULL
      AND e."status" = ANY(${ENROLLMENT_ACTIVE_STATUS_LIST}::"EnrollmentStatus"[])
      AND s."deletedAt" IS NULL
      AND s."parentUserId" = ${parentUserId}
    ORDER BY cl."id" ASC
    LIMIT 20
  `;
  return rows.map((r) => r.id);
}

/**
 * Xác định chiều quan hệ giữa 2 user bất kỳ: ai là GV, ai là PH. `null` = KHÔNG có
 * quan hệ dạy học nào còn hiệu lực (⇒ không mở được 1-1; hội thoại cũ chuyển ARCHIVED).
 *
 * Thử CẢ HAI chiều vì hàm này phục vụ cả nút bấm phía PH lẫn phía GV. Trường hợp cả hai
 * chiều đều có (A dạy con của B, đồng thời B dạy con của A — GV có con học ở trung tâm)
 * thì lấy chiều `userA là GV`: người bấm nút đứng ở vai nào không đổi kết quả cuối
 * (cùng `dmKey`, cùng một hội thoại), chỉ ảnh hưởng lớp làm chứng.
 */
export async function resolveTeacherParentRelation(
  userA: string,
  userB: string,
  client: Db = db,
): Promise<TeacherParentRelation | null> {
  if (!userA || !userB || userA === userB) return null;
  const [aTeaches, bTeaches] = await Promise.all([
    findTeachingClassIds(userA, userB, client),
    findTeachingClassIds(userB, userA, client),
  ]);
  if (aTeaches.length > 0) {
    return { teacherUserId: userA, parentUserId: userB, classIds: aTeaches };
  }
  if (bTeaches.length > 0) {
    return { teacherUserId: userB, parentUserId: userA, classIds: bTeaches };
  }
  return null;
}

/**
 * ⭐ LỚP LÀM CHỨNG của một hội thoại 1-1 — `target.classId` cho `can()` khi thao tác
 * diễn ra TRONG hội thoại (gửi tin, thu hồi tin), không phải lúc mở nó.
 *
 * VÌ SAO PHẢI CÓ (bug đã đo 09/08, US-13 "hộp câm một chiều"): hội thoại 1-1 có
 * `subjectType = NONE` ⇒ mọi hàm suy target theo `subjectId` trả `classId = null`, mà
 * TEACHER/ASSISTANT_TEACHER chỉ giữ `chat:send` scope **ASSIGNED** (`prisma/seed-roles.ts`)
 * và `scopeMatches` (lib/auth/can.ts) đòi `target.classId ∈ assignedClassIds`. Kết quả:
 * PH gửi được (scope OWN khớp), GV nhận `PERMISSION_DENIED` — trái ma trận
 * `docs/chat-realtime/permissions.md` ("1-1 · Gửi · GV = ✅ khi ACTIVE").
 *
 * Trả về lớp mà CHÍNH `actorUserId` đang dạy con của người còn lại. Chỉ hỏi một chiều
 * (không dùng `resolveTeacherParentRelation`) vì `classId` chỉ có tác dụng cho scope
 * ASSIGNED — tức chỉ khi người thao tác là GV; phụ huynh vốn đi cửa OWN.
 *
 * `null` = không có quan hệ dạy học còn hiệu lực ⇒ GV rụng ở cổng vai (FAIL-CLOSED,
 * đúng AC3: quan hệ hết thì 1-1 chỉ còn đọc). PH không bị ảnh hưởng.
 */
export async function dmWitnessClassId(
  conversationId: string,
  actorUserId: string,
  client: Db = db,
): Promise<string | null> {
  if (!conversationId || !actorUserId) return null;
  // Người còn lại của hội thoại. Lấy CẢ bản ghi đã `leftAt` (ưu tiên bản còn hiệu lực):
  // hai người đó vẫn là hai đầu của 1-1, giống `reconcileDmConversations`.
  const peers = await client.$queryRaw<{ userId: string }[]>`
    SELECT p."userId"
    FROM "ConversationParticipant" p
    WHERE p."conversationId" = ${conversationId}
      AND p."userId" <> ${actorUserId}
    ORDER BY p."leftAt" NULLS FIRST, p."joinedAt" ASC
    LIMIT 1
  `;
  const peerUserId = peers[0]?.userId;
  if (!peerUserId) return null;
  const classIds = await findTeachingClassIds(actorUserId, peerUserId, client);
  return classIds[0] ?? null;
}

// ─── findOrCreate (AC2 + AC5) ───────────────────────────────────────────────

export type OpenedDm = {
  conversationId: string;
  /** ACTIVE | ARCHIVED | LOCKED — UI dùng để bật/tắt ô nhập. */
  status: string;
  /** true = vừa tạo mới; false = dùng lại hội thoại đã có (AC2). */
  created: boolean;
  /** true = hội thoại cũ đang ARCHIVED, vừa được mở lại (AC2). */
  reopened: boolean;
  peerUserId: string;
  /** Tên người còn lại — UI hiện ngay khi điều hướng, không phải hỏi lại. */
  peerName: string | null;
};

/**
 * Bảo đảm CẢ HAI người có bản ghi participant còn hiệu lực. Chạy trong tx của caller.
 *
 * `source = MANUAL` có chủ đích: participant của DM KHÔNG do
 * `syncConversationMembership` dẫn xuất (service đó chỉ đụng `CLASS_GROUP`). Nhãn MANUAL
 * còn là lớp bảo hiểm: mọi job đối soát đều bỏ qua MANUAL (BR-15), nên không job nào có
 * thể "dọn" thành viên 1-1.
 */
async function ensureDmParticipants(
  tx: Tx,
  conversationId: string,
  userIds: readonly string[],
): Promise<void> {
  const rows = await tx.conversationParticipant.findMany({
    where: { conversationId, userId: { in: [...userIds] } },
    select: { id: true, userId: true, leftAt: true },
  });
  const byUserId = new Map(rows.map((r) => [r.userId, r]));
  for (const userId of userIds) {
    const cur = byUserId.get(userId);
    if (!cur) {
      await tx.conversationParticipant.create({
        data: {
          conversationId,
          userId,
          role: "MEMBER",
          source: "MANUAL",
          derivedFrom: null,
        },
      });
    } else if (cur.leftAt !== null) {
      // Mở lại bản ghi CŨ (không tạo bản ghi thứ hai — unique(conversationId,userId)),
      // giữ nguyên `joinedAt` để lịch sử đọc được đúng như trước.
      await tx.conversationParticipant.update({
        where: { id: cur.id },
        data: { leftAt: null },
      });
    }
  }
}

/**
 * Dùng lại hội thoại đã có (AC2): ARCHIVED → ACTIVE, `archivedAt` về null, lịch sử tin
 * GIỮ NGUYÊN (không xoá, không tạo hội thoại thứ hai).
 *
 * LOCKED thì KHÔNG tự mở: khoá là quyết định của Admin (US-15) và nó thắng luồng nghiệp
 * vụ — cùng luật đã áp cho nhóm lớp (`syncConversationMembership`). Hội thoại vẫn được
 * trả về để người dùng đọc lịch sử; ô nhập tự vô hiệu theo `status`.
 */
async function reuseDmConversation(
  conversation: { id: string; status: string },
  userIds: readonly string[],
): Promise<{ conversationId: string; status: string; created: false; reopened: boolean }> {
  const reopened = conversation.status === "ARCHIVED";
  await db.$transaction(async (tx) => {
    if (reopened) {
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { status: "ACTIVE", archivedAt: null },
      });
    }
    await ensureDmParticipants(tx as Tx, conversation.id, userIds);
  });
  return {
    conversationId: conversation.id,
    status: reopened ? "ACTIVE" : conversation.status,
    created: false,
    reopened,
  };
}

/**
 * findOrCreate hội thoại 1-1 theo `dmKey`.
 *
 * **AC5 — hai người bấm cùng lúc**: KHÔNG dùng "kiểm rồi tạo" (hai request song song đều
 * thấy "chưa có" rồi cùng tạo). Chốt chặn là **UNIQUE `Conversation.dmKey`** + bắt
 * `P2002` rồi ĐỌC LẠI. Việc bắt P2002 nằm NGOÀI transaction có chủ đích: Postgres đánh
 * dấu transaction hỏng ngay khi một câu lệnh lỗi, nên mọi truy vấn sau đó trong CÙNG tx
 * đều chết ("current transaction is aborted") — tiền lệ đã ghi ở `lib/chat/messages.ts`.
 */
async function findOrCreateDm(
  actorUserId: string,
  peerUserId: string,
  dmKey: string,
): Promise<OpenedDm> {
  const userIds = [actorUserId, peerUserId] as const;

  const found = await db.conversation.findUnique({
    where: { dmKey },
    select: { id: true, status: true },
  });
  if (found) {
    return { ...(await reuseDmConversation(found, userIds)), peerUserId, peerName: null };
  }

  try {
    const conv = await db.$transaction(async (tx) => {
      const created = await tx.conversation.create({
        data: {
          type: "DM_TEACHER_PARENT",
          subjectType: "NONE",
          subjectId: null,
          dmKey,
          // centerId/orgUnitId = null: DM không thuộc cơ sở nào (delta E.3) — xem đầu file.
          centerId: null,
          orgUnitId: null,
          status: "ACTIVE",
          title: DM_TITLE,
          createdById: actorUserId,
        },
        select: { id: true, status: true },
      });
      await ensureDmParticipants(tx as Tx, created.id, userIds);
      return created;
    });
    return {
      conversationId: conv.id,
      status: conv.status,
      created: true,
      reopened: false,
      peerUserId,
      peerName: null,
    };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Người kia vừa tạo xong trong lúc ta đang tạo → đọc lại chính hội thoại đó.
    const raced = await db.conversation.findUnique({
      where: { dmKey },
      select: { id: true, status: true },
    });
    if (!raced) throw err;
    return { ...(await reuseDmConversation(raced, userIds)), peerUserId, peerName: null };
  }
}

/**
 * **AC3** — quan hệ dạy học hết hiệu lực ⇒ hội thoại chuyển ARCHIVED (đọc được, KHÔNG
 * gửi được — guard gửi tin đã có sẵn ở `lib/chat/messages.ts`). Idempotent.
 * LOCKED giữ nguyên (khoá của Admin thắng).
 */
async function archiveDmConversation(conversationId: string): Promise<boolean> {
  const res = await db.conversation.updateMany({
    where: { id: conversationId, status: "ACTIVE" },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
  return res.count > 0;
}

/** SYSTEM message ghi lại vì sao hội thoại đóng — người dùng thấy lý do, không "tự dưng câm". */
const DM_ARCHIVED_SYSTEM_TEXT =
  "Quan hệ dạy học đã kết thúc — hội thoại chuyển sang chế độ chỉ đọc.";

/**
 * ĐƯỜNG DUY NHẤT đóng một 1-1 vì hết quan hệ dạy học — dùng CHUNG cho cả hai lối:
 * job đêm ({@link reconcileDmConversations}) và lối tức thời trong `openDm`.
 *
 * Trước 09/08 hai lối làm hai kiểu: cron archive + ghi SYSTEM message, còn `openDm`
 * chỉ archive rồi ném lỗi ⇒ hội thoại đột ngột thành chỉ-đọc mà trong luồng không có
 * dòng nào giải thích — đúng cái "tự dưng câm" mà tin SYSTEM được viết ra để tránh.
 * Gộp lại đây để không thể lệch lần nữa. Idempotent: đã ARCHIVED thì trả `false` và
 * KHÔNG ghi thêm tin SYSTEM thứ hai.
 */
async function archiveDmForEndedRelation(conversationId: string): Promise<boolean> {
  const archived = await archiveDmConversation(conversationId);
  if (!archived) return false;
  const now = new Date();
  await db.message.create({
    data: {
      conversationId,
      kind: "SYSTEM",
      senderId: null,
      body: DM_ARCHIVED_SYSTEM_TEXT,
    },
  });
  await db.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: now },
  });
  return true;
}

// ─── ActionConfig ───────────────────────────────────────────────────────────

export const openDmSchema = z.object({
  /** `User.id` (cuid) của người còn lại — GV nếu người bấm là PH và ngược lại. */
  peerUserId: z.string().trim().min(1, "Thiếu người nhận").max(64, "Người nhận không hợp lệ"),
});

export type OpenDmInput = z.infer<typeof openDmSchema>;

/** Ngữ cảnh nạp TRƯỚC `runAction` (target của can() cần đọc DB — xem messages.ts). */
export type OpenDmContext = {
  peerUserId: string;
  peerName: string | null;
  /** null = người này không tồn tại / đã khoá / đã xoá. */
  peerExists: boolean;
  dmKey: string | null;
  relation: TeacherParentRelation | null;
  existing: { id: string; status: string } | null;
};

/** `User.id` là cuid — chỉ nhận ký tự an toàn, sai dạng thì để zod báo VALIDATION. */
const USER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function extractPeerUserId(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const v = (raw as { peerUserId?: unknown }).peerUserId;
  return typeof v === "string" && USER_ID_RE.test(v.trim()) ? v.trim() : null;
}

export async function loadOpenDmContext(
  actorUserId: string,
  peerUserId: string,
): Promise<OpenDmContext> {
  const empty: OpenDmContext = {
    peerUserId,
    peerName: null,
    peerExists: false,
    dmKey: null,
    relation: null,
    existing: null,
  };
  if (!peerUserId || peerUserId === actorUserId) return empty;

  // `User` ∈ SCOPE_EXEMPT → Prisma API an toàn (không dính BẪY scopedDb).
  const peer = await db.user.findFirst({
    where: { id: peerUserId, deletedAt: null, isActive: true },
    select: { id: true, name: true },
  });
  if (!peer) return empty;

  const dmKey = dmKeyOf(actorUserId, peerUserId);
  const [relation, existing] = await Promise.all([
    resolveTeacherParentRelation(actorUserId, peerUserId),
    db.conversation.findUnique({ where: { dmKey }, select: { id: true, status: true } }),
  ]);
  return { peerUserId, peerName: peer.name, peerExists: true, dmKey, relation, existing };
}

function buildOpenDmConfig(
  ctx: OpenDmContext,
  actor: Actor,
  actorName: string,
): ActionConfig<OpenDmInput, OpenedDm> {
  return {
    name: "chat.openDm",
    // Quyền dùng `chat:send` chứ không phải một action mới: mở 1-1 chính là mở đường
    // GỬI tin riêng, và bộ vai của `chat:send` đã đúng ma trận permissions.md cho DM
    // (PH ✅ OWN · GV ✅ ASSIGNED · QLCS/Giáo vụ ❌ vì CENTER trượt trên centerId=null ·
    // Sale ❌ vì không có action nào). Thêm quyền mới sẽ phải seed lại RolePermission
    // trên prod (delta mục G) mà không được lợi gì.
    permission: "chat:send",
    schema: openDmSchema,
    target: () => openDmTargetOf(ctx.relation, actor),
    module: "chat",
    entityType: "Conversation",
    auditAction: ctx.existing ? "UPDATE" : "CREATE",
    handler: async () => {
      if (ctx.peerUserId === actor.userId) {
        throw new ActionError("DM_SELF", "Không thể mở hội thoại riêng với chính mình.");
      }
      if (!ctx.peerExists || !ctx.dmKey) {
        throw new ActionError("PEER_NOT_FOUND", "Không tìm thấy người này.");
      }

      // ── AC3: quan hệ dạy học không còn hiệu lực ──
      if (!ctx.relation) {
        // Hội thoại cũ (nếu có) chuyển ARCHIVED NGAY tại đây, không đợi job đêm:
        // đọc được, không gửi được. Không có rủi ro bên thứ ba — `ctx` được khoá theo
        // đúng cặp (actor, peer), và cổng vai `can()` đã chạy trước handler.
        //
        // ⚠️ AUDIT PHẢI GHI TẠI CHỖ: nhánh này ném `ActionError` ngay dưới, mà
        // `runAction` chỉ `writeAudit` ở BƯỚC 5 (sau handler) — tức đường này đổi
        // trạng thái hội thoại ACTIVE→ARCHIVED mà không để lại một dòng nhật ký nào.
        // Đi cùng `archiveDmForEndedRelation` để lối tức thời và job đêm để lại CÙNG
        // một hiện trạng (tin SYSTEM giải thích lý do).
        if (ctx.existing) {
          const archived = await archiveDmForEndedRelation(ctx.existing.id);
          if (archived) {
            try {
              await writeAudit({
                actor: { id: actor.userId, name: actorName },
                module: "chat",
                entityType: "Conversation",
                entityId: ctx.existing.id,
                action: "UPDATE",
                oldValues: { status: "ACTIVE" },
                newValues: { status: "ARCHIVED", cause: "TEACHING_RELATION_ENDED" },
                // DM không thuộc đơn vị nào ⇒ chỉ scope "ALL" (SUPER_ADMIN) thấy lại
                // dòng này trong /admin/audit-log. Có chủ đích, như mọi audit của DM.
                orgUnitId: null,
              });
            } catch (err) {
              // Audit hỏng KHÔNG được biến một câu "hết quan hệ dạy học" thành 500:
              // việc archive đã commit, người dùng vẫn phải nhận đúng mã lỗi bên dưới.
              console.error("[chat/openDm] ghi audit archive 1-1 lỗi:", err);
            }
          }
        }
        // Mã PERMISSION_DENIED theo QUY ƯỚC MÃ LỖI chốt 09/08 (tests/chat/
        // permission-matrix.spec.ts, TS-04.5): đây là quyết định về quyền, không phải
        // về tư cách thành viên.
        throw new ActionError(
          "PERMISSION_DENIED",
          "Chỉ nhắn riêng được giữa giáo viên và phụ huynh của lớp đang học.",
        );
      }

      const opened = await findOrCreateDm(actor.userId, ctx.peerUserId, ctx.dmKey);
      return {
        entityId: opened.conversationId,
        data: { ...opened, peerName: ctx.peerName },
        // KHÔNG ghi nội dung/liên hệ vào AuditLog. `orgUnitId` để null vì DM không
        // thuộc đơn vị nào — hệ quả CÓ CHỦ ĐÍCH: chỉ SUPER_ADMIN (scope "ALL") thấy
        // dòng audit này trong /admin/audit-log.
        newValues: {
          peerUserId: ctx.peerUserId,
          relationClassId: ctx.relation.classIds[0] ?? null,
          created: opened.created,
          reopened: opened.reopened,
          status: opened.status,
        },
        orgUnitId: null,
      };
    },
  };
}

// ─── Lõi + Server Action ────────────────────────────────────────────────────

/**
 * Lõi THUẦN NGỮ CẢNH — nhận Actor đã resolve (test gọi thẳng, không cần phiên).
 *
 * Cố ý KHÔNG có bản "tự `auth()`" trong file này (khác `lib/chat/messages.ts`): import
 * `@/lib/auth` kéo theo `next-auth` → module chết khi chạy ngoài Next (vitest node, tsx,
 * script vận hành) và cả `tests/chat/permission-matrix.spec.ts` cũng không import nổi.
 * Phần ghép phiên nằm ở `lib/chat/_actions.ts` — đúng chỗ biên HTTP.
 */
export async function openDmAsActor(
  actor: Actor,
  actorName: string,
  rawInput: unknown,
): Promise<ActionResult<OpenedDm>> {
  // ⚠️ RATE LIMIT ĐẶT TRƯỚC `loadOpenDmContext`, KHÔNG đặt trong handler: chính
  // `loadOpenDmContext` mới là phần tốn kém (4 truy vấn, 2 trong đó join 3 bảng lớn),
  // mà `runAction` chạy handler SAU khi ta đã nạp ngữ cảnh. Chặn ở trong handler thì
  // trần vẫn có nhưng DB đã ăn đủ tải của mọi lượt gọi.
  const limit = await rateLimit({
    key: `chat:openDm:${actor.userId}`,
    max: OPEN_DM_RATE_MAX,
    windowMs: OPEN_DM_RATE_WINDOW_MS,
  });
  if (!limit.success) {
    const giay = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
    return actionFail(
      "RATE_LIMITED",
      `Bạn thao tác quá nhanh (tối đa ${OPEN_DM_RATE_MAX} lượt/phút). Vui lòng thử lại sau ${giay} giây.`,
    );
  }

  const peerUserId = extractPeerUserId(rawInput);
  const ctx = peerUserId
    ? await loadOpenDmContext(actor.userId, peerUserId)
    : {
        peerUserId: "",
        peerName: null,
        peerExists: false,
        dmKey: null,
        relation: null,
        existing: null,
      };
  const { res } = await runAction(buildOpenDmConfig(ctx, actor, actorName), actor, rawInput, {
    actorName,
  });
  return res;
}

// ─── Đối soát DM (AC3, chạy trong job đêm US-04) ────────────────────────────

export type DmReconcileSummary = {
  /** Số DM ACTIVE đã kiểm. */
  dmChecked: number;
  /** Số DM vừa chuyển ARCHIVED vì hết quan hệ dạy học. */
  dmArchived: number;
  /** DM có số thành viên khác 2 (dữ liệu lạ) — chỉ đếm + log, KHÔNG tự sửa. */
  dmSkipped: number;
};

/**
 * **AC3 (lưới cuối)** — DM còn ACTIVE nhưng cặp GV–PH đã hết quan hệ dạy học ⇒ ARCHIVED.
 *
 * Vì sao nằm ở job đêm chứ không nhét vào `syncConversationMembership`: service đó đồng bộ
 * theo MỘT lớp, trong transaction của thao tác nghiệp vụ; còn quan hệ GV–PH là hợp của
 * MỌI lớp, muốn kết luận "hết quan hệ" phải quét toàn bộ lớp của cặp đó — kéo việc quét ấy
 * vào mọi tx đổi enrollment/phân công là mua thêm rủi ro timeout cho một câu trả lời không
 * cần tức thời. Đường tức thời vẫn có: `openDm` archive ngay khi ai đó bấm "Nhắn riêng"
 * mà quan hệ đã hết.
 *
 * KHÔNG hard delete, KHÔNG gỡ participant (lịch sử vẫn đọc được — BR-03/BR-04).
 */
export async function reconcileDmConversations(opts?: {
  onlyConversationIds?: string[];
}): Promise<DmReconcileSummary> {
  const conversations = await db.conversation.findMany({
    where: {
      type: "DM_TEACHER_PARENT",
      status: "ACTIVE",
      ...(opts?.onlyConversationIds ? { id: { in: opts.onlyConversationIds } } : {}),
    },
    select: {
      id: true,
      participants: { select: { userId: true }, orderBy: { joinedAt: "asc" } },
    },
  });

  let dmChecked = 0;
  let dmArchived = 0;
  let dmSkipped = 0;

  for (const conv of conversations) {
    // Lấy CẢ participant đã `leftAt` — hai người đó vẫn là hai đầu của hội thoại.
    const userIds = [...new Set(conv.participants.map((p) => p.userId))];
    if (userIds.length !== 2) {
      dmSkipped += 1;
      console.warn(
        `[chat-reconcile] DM ${conv.id} có ${userIds.length} thành viên (≠2) — bỏ qua, không tự sửa.`,
      );
      continue;
    }
    dmChecked += 1;
    const relation = await resolveTeacherParentRelation(userIds[0] as string, userIds[1] as string);
    if (relation) continue;

    const archived = await archiveDmForEndedRelation(conv.id);
    if (!archived) continue;
    dmArchived += 1;
  }

  if (dmArchived > 0) {
    console.log(`[chat-reconcile] DM: ${dmArchived}/${dmChecked} chuyển ARCHIVED (hết quan hệ dạy học).`);
  }
  return { dmChecked, dmArchived, dmSkipped };
}
