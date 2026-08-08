// @vitest-environment node
/**
 * US-05 — Bộ test ma trận quyền chat, TẦNG ĐỘNG (DB thật, khung dựng TRƯỚC hiện thực).
 *
 * Quy ước Nền Hệ thống (CLAUDE.md, luật 5): test AUTO-CI viết TRƯỚC — các Server
 * Action chat (sendMessage, sendAnnouncement, deleteMessage, recallMessage,
 * listConversations, getMessages, openDm, adminLookup) CHƯA TỒN TẠI, nên từng ô
 * ma trận nằm ở `it.todo(...)` với tên chứa mã ô + mã lỗi kỳ vọng + story sẽ mở.
 * Story sau (US-06/US-08/US-10/US-12/US-13/US-15) đổi todo → test thật chạy qua
 * `runAction` (lib/actions/factory.ts) với actor seed — KHÔNG cần HTTP.
 *
 * TS-02 (cách ly realtime channel) KHÔNG lặp lại ở đây — đã có
 * scripts/_zztest-chat-us02.ts chạy trên DB + Realtime DEV thật (CI không có
 * Realtime service; phần unit JWT nằm ở lib/chat/realtime-token.test.ts).
 *
 * DB guard: chỉ chạy khi có Postgres LOCAL (.env.test / TEST_DATABASE_URL trỏ
 * localhost — xem .claude/rules/prisma-db.md). Máy không có DB → skip có thông
 * điệp, `pnpm test:unit -- --run` vẫn xanh.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../lib/db";
import { disconnectDb } from "../e2e/_helpers/seed";
import { seedChatFixture, type ChatFixture } from "./_helpers/seed-chat";

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const HAS_LOCAL_DB =
  /(@|\/\/)(localhost|127\.0\.0\.1)[:/]/.test(DB_URL) ||
  /satarobo_test|ci_test/.test(DB_URL);

// ─────────────────────────────────────────────────────────────────────────────
// Seed chuẩn TestScenarios — phần CHẠY THẬT ngay từ US-05 (khi có DB local).
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!HAS_LOCAL_DB)(
  "US-05 tầng động — seed chuẩn TestScenarios (DB local)",
  () => {
    let fx: ChatFixture;

    beforeAll(async () => {
      fx = await seedChatFixture();
    });

    afterAll(async () => {
      await disconnectDb();
    });

    it("seed dựng đủ: 3 nhóm lớp (LopC ARCHIVED) + 1 DM centerId=null", async () => {
      const [convA, convC, dm] = await Promise.all([
        db.conversation.findUniqueOrThrow({ where: { id: fx.conversations.lopA } }),
        db.conversation.findUniqueOrThrow({ where: { id: fx.conversations.lopC } }),
        db.conversation.findUniqueOrThrow({ where: { id: fx.conversations.dmGv1Ph1 } }),
      ]);
      expect(convA.status).toBe("ACTIVE");
      expect(convA.centerId).toBe(fx.centers.cs1);
      expect(convC.status).toBe("ARCHIVED");
      expect(dm.type).toBe("DM_TEACHER_PARENT");
      expect(dm.centerId).toBeNull(); // delta E.3 — DM không thuộc cơ sở nào
    });

    it("participant đúng vai: gv MODERATOR, ql1 MEMBER/CENTER_MANAGER, ph4 leftAt ĐÃ SET", async () => {
      const parts = await db.conversationParticipant.findMany({
        where: { conversationId: fx.conversations.lopA },
      });
      const byUser = new Map(parts.map((p) => [p.userId, p]));
      expect(byUser.get(fx.users.gv1)?.role).toBe("MODERATOR");
      expect(byUser.get(fx.users.gv3)?.role).toBe("MODERATOR"); // dạy chéo — vẫn là GV nhóm LopA
      expect(byUser.get(fx.users.ql1)?.role).toBe("MEMBER"); // chốt 07/08: QLCS = MEMBER
      expect(byUser.get(fx.users.ql1)?.derivedFrom).toBe("CENTER_MANAGER");
      expect(byUser.get(fx.users.ph1)?.leftAt).toBeNull();
      expect(byUser.get(fx.users.ph4)?.leftAt).not.toBeNull(); // TS-01.7 tiền đề
      // sale1 KHÔNG bao giờ là participant (P0 — F5 đã dời).
      expect(byUser.has(fx.users.sale1)).toBe(false);
    });

    it("seed idempotent — chạy lần 2 không nhân đôi participant (US-03 AC6 tiền đề)", async () => {
      const before = await db.conversationParticipant.count({
        where: { conversationId: fx.conversations.lopA },
      });
      await seedChatFixture();
      const after = await db.conversationParticipant.count({
        where: { conversationId: fx.conversations.lopA },
      });
      expect(after).toBe(before);
    });
  },
);

if (!HAS_LOCAL_DB) {
  describe("US-05 tầng động — SKIP", () => {
    it.skip("cần Postgres LOCAL: nạp .env.test (DATABASE_URL=localhost/satarobo_test) hoặc TEST_DATABASE_URL — xem .claude/rules/prisma-db.md; CI e2e là nơi chạy đủ", () => {
      /* skip có chủ đích — máy này không có DB test local */
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TS-01 · Cách ly đọc theo lớp và cơ sở — mở ở US-06 (getMessages) + US-08
// (listConversations). Mã lỗi kỳ vọng ghi trong tên test.
// ─────────────────────────────────────────────────────────────────────────────
describe("TS-01 · Cách ly đọc theo lớp và cơ sở [todo — mở dần theo story]", () => {
  it.todo("TS-01.1 ph1 listConversations → chỉ nhóm LopA (+DM của mình), KHÔNG LopB/LopC [US-08]");
  it.todo("TS-01.2 ph1 getMessages(LopB) trực tiếp bằng ID → 403 PERMISSION_DENIED [US-06]");
  it.todo("TS-01.3 ph2 (con ở cả 2 lớp) listConversations → đúng 2 nhóm LopA + LopB [US-08]");
  it.todo("TS-01.4a ql1 listConversations → LopA + LopC (cùng CS1), KHÔNG LopB [US-08]");
  it.todo("TS-01.4b ql1 getMessages(LopB) bằng ID → 403 PERMISSION_DENIED [US-06]");
  it.todo("TS-01.5 gv3 (dạy chéo) listConversations → CẢ LopA + LopB dù khác cơ sở — theo phân công, không theo centerId [US-08]");
  it.todo("TS-01.6 sale1 gọi MỌI endpoint chat (listConversations/getMessages/sendMessage/sendAnnouncement/openDm/deleteMessage/adminLookup) → 403 PERMISSION_DENIED toàn bộ [US-06→US-15]");
  it.todo("TS-01.7 ph4 (leftAt đã set) getMessages(LopA) → 403 PERMISSION_DENIED ngay, KHÔNG grace period ở API [US-06]");
});

// ─────────────────────────────────────────────────────────────────────────────
// TS-02 · Cách ly realtime channel — KHÔNG dup ở đây.
// Đã phủ bởi scripts/_zztest-chat-us02.ts (TS-02.1→02.5, chạy tay trên DEV có
// Realtime thật + canary private-flag) và lib/chat/realtime-token.test.ts (unit JWT).
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// TS-03 · Ma trận hành động ghi — mở ở US-06 (sendMessage), US-10
// (sendAnnouncement), US-12 (recall/deleteMessage). Trạng thái ACTIVE/ARCHIVED/
// LOCKED × participant hiệu lực/đã rời sinh tổ hợp bên dưới.
// ─────────────────────────────────────────────────────────────────────────────
describe("TS-03 · Ma trận hành động ghi [todo — mở dần theo story]", () => {
  it.todo("TS-03.1a ph1 sendMessage CHAT vào LopA → ok:true [US-06]");
  it.todo("TS-03.1b ph1 gửi ANNOUNCEMENT vào LopA → 403 PERMISSION_DENIED [US-10]");
  it.todo("TS-03.2a gv1 sendAnnouncement vào LopA → ok:true [US-10]");
  it.todo("TS-03.2b gv1 sendAnnouncement vào LopB (không dạy) → 403 PERMISSION_DENIED [US-10]");
  it.todo("TS-03.3a ql1 sendMessage + sendAnnouncement vào LopA → ok:true CẢ HAI (chốt QLCS=MEMBER) [US-06/US-10]");
  it.todo("TS-03.3b ql1 sendMessage/sendAnnouncement vào LopB → 403 PERMISSION_DENIED [US-06/US-10]");
  it.todo("TS-03.4a admin1 sendAnnouncement vào LopA → ok:true [US-10]");
  it.todo("TS-03.4b admin1 sendMessage CHAT vào hội thoại KHÔNG phải thành viên → 403 PERMISSION_DENIED (US-15 AC4 — v2 bypass không cứu, participant-check trong action chặn) [US-06]");
  it.todo("TS-03.5a ph1 recallMessage tin mình gửi 10 phút trước → ok:true [US-12]");
  it.todo("TS-03.5b ph1 recallMessage tin gửi 20 phút trước → 403 RECALL_WINDOW_EXPIRED (quá 15') [US-12]");
  it.todo("TS-03.6a ph1 deleteMessage tin của ph2 → 403 PERMISSION_DENIED [US-12]");
  it.todo("TS-03.6b gv1 deleteMessage tin của ph2 trong LopA KHÔNG lý do → 400 VALIDATION (field reason); CÓ lý do → ok:true [US-12]");
  it.todo("TS-03.6c ql1 deleteMessage tin người khác → 403 PERMISSION_DENIED [US-12]");
  it.todo("TS-03.7a sendMessage vào LopC (ARCHIVED) với MỌI actor (ph1/gv1/ql1/admin1) → 403 CONVERSATION_ARCHIVED — mã lỗi PHÂN BIỆT với 'không phải thành viên' [US-06]");
  it.todo("TS-03.7b hội thoại LOCKED → sendMessage 403 CONVERSATION_LOCKED mọi vai kể cả GV; đọc vẫn được cho thành viên [US-15]");
  it.todo("TS-03.8 ph4 (participant đã rời) sendMessage vào LopA → 403 PERMISSION_DENIED [US-06]");
});

// ─────────────────────────────────────────────────────────────────────────────
// TS-04 · Riêng tư 1-1 và tra cứu admin — mở ở US-13 (openDm) + US-15 (adminLookup).
// ─────────────────────────────────────────────────────────────────────────────
describe("TS-04 · Riêng tư 1-1 và tra cứu admin [todo — mở dần theo story]", () => {
  it.todo("TS-04.1 DM gv1↔ph1: ql1 / gv2 / ph2 / sale1 getMessages bằng ID → 403 PERMISSION_DENIED TOÀN BỘ [US-13]");
  it.todo("TS-04.2a admin1 adminLookup DM KHÔNG nhập lý do → 403/400, nội dung KHÔNG trả về [US-15]");
  it.todo("TS-04.2b admin1 adminLookup CÓ lý do → ok:true + 1 bản ghi AuditLog đúng (ai/khi nào/hội thoại/lý do) ghi TRƯỚC khi trả nội dung (F-AUDIT) [US-15]");
  it.todo("TS-04.3 gọi thẳng adminLookup (bỏ qua UI/modal) không kèm reason → 403 — modal không phải chốt chặn duy nhất [US-15]");
  it.todo("TS-04.4a ph1 listMembers(LopA) → payload KHÔNG chứa SĐT/email PH khác (BR-30 — kiểm JSON, không chỉ UI) [US-08]");
  it.todo("TS-04.4b gv1 listMembers(LopA) → đầy đủ liên hệ [US-08]");
  it.todo("TS-04.5 ph1 openDm với gv2 (KHÔNG dạy con mình) → 403 PERMISSION_DENIED (quan hệ không hiệu lực) [US-13]");
  it.todo("TS-04.6 ql1 openDm với ph1 → 403 PERMISSION_DENIED (QLCS không mở 1-1 ở P0) [US-13]");
});
