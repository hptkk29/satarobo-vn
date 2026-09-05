// @vitest-environment node
/**
 * LÕI HỘP THƯ — ba lỗi có sẵn (B2/B3/B6) + gắn đơn vị theo nick. Tầng DB thật.
 *
 * Ba lỗi dưới đây có chung một tính chất: KHÔNG lỗi nào văng ra màn hình. Chúng chỉ
 * lộ khi có người khiếu nại, và lúc đó dữ liệu đã lẫn rồi.
 *
 *   B2 — `ganNguoiPhuTrach` không ghi `orgUnitId` ⇒ hội thoại ĐÃ có người nhận vẫn
 *        nằm nhóm mồ côi, mà nhóm mồ côi thì MỌI cơ sở đọc được. Rò chéo cơ sở.
 *   B3 — `timLeadTheoSdt` tra `Lead` không giới hạn cơ sở ⇒ nối hội thoại của CS1
 *        vào phiếu của CS2 khi hai bên trùng số.
 *   B6 — `sendInboxReply` bước 3 ghi `channelMessageId` VÔ ĐIỀU KIỆN, ngoài
 *        try/catch ⇒ echo về trước là ném P2002 ra thẳng Server Action, trong khi
 *        tin đã THẬT SỰ tới khách. Người trực thấy "lỗi" và bấm gửi lại.
 *
 * ⚠️ Bộ này TỰ SKIP khi không có Postgres local. Thấy SKIP trong log nghĩa là CHƯA
 * KIỂM ĐƯỢC GÌ, không phải "xanh". Và KHÔNG `resetDb()` — dọn theo TIỀN TỐ riêng.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const RUN =
  /(@|\/\/)(localhost|127\.0\.0\.1)[:/]/.test(DB_URL) || /satarobo_test|ci_test/.test(DB_URL);

if (!RUN) {
  console.warn("[zalocrm] SKIP: DATABASE_URL không trỏ Postgres local.");
}

const db = new PrismaClient();

/** Bảng `Inbox*` chưa có ⇒ SKIP kèm câu chỉ việc, đừng đổ một đống `P2021`. */
const CO_BANG =
  RUN &&
  (await db.inboxConversation
    .count()
    .then(() => true)
    .catch(() => {
      console.warn(
        "[zalocrm] SKIP: chưa có bảng Inbox*. Chạy `prisma migrate deploy` trên DB " +
          "test trước (migration 20260827120000_hop_thu_da_kenh).",
      );
      return false;
    }));

/** Tiền tố RIÊNG của bộ này — dùng lại `HTDK_` là hai file dọn dữ liệu của nhau. */
const P = "ZCRM_";
const OA = `${P}oa1`;
const CS1 = `${P}ou-cs1`;
const CS2 = `${P}ou-cs2`;
const LUC = new Date("2026-09-06T02:00:00.000Z");

async function purge() {
  const hoi = await db.inboxConversation.findMany({
    where: { accountId: { startsWith: P } },
    select: { id: true },
  });
  if (hoi.length) {
    await db.inboxMessage.deleteMany({ where: { conversationId: { in: hoi.map((h) => h.id) } } });
    await db.inboxConversation.deleteMany({ where: { id: { in: hoi.map((h) => h.id) } } });
  }
  await db.inboxIdentity.deleteMany({ where: { accountId: { startsWith: P } } });
  await db.lead.deleteMany({ where: { parentName: { startsWith: P } } });
  await db.user.deleteMany({ where: { name: { startsWith: P } } });
}

/** Tin đến chuẩn — chỉ đổi phần cần đổi ở từng ca. */
function tinDen(khoa: string, extra?: { body?: string; sentAt?: Date }) {
  return {
    channel: "ZALO_OA" as const,
    accountId: OA,
    externalUserId: `u-${khoa}`,
    channelMessageId: `${P}m-${khoa}`,
    body: extra?.body ?? "alo",
    sentAt: extra?.sentAt ?? LUC,
  };
}

describe.skipIf(!CO_BANG)("lõi hộp thư — B2 · B3 · B6 · gắn đơn vị theo nick", () => {
  beforeAll(purge);
  afterAll(async () => {
    await purge();
    await db.$disconnect();
  });
  beforeEach(purge);
  afterEach(() => {
    // Ca B6 thay sổ đăng ký adapter bằng bản giả; không gỡ là mọi ca sau đó gửi tin
    // qua adapter giả mà không ai biết.
    vi.doUnmock("@/lib/integrations/registry");
    vi.resetModules();
  });

  // ── B2 — gán người phụ trách phải HẾT mồ côi ───────────────────────────────
  describe("🔴 B2 — hội thoại đã có người nhận không được nằm nhóm 'ai cũng đọc'", () => {
    it("[ZC-17] gán người phụ trách ⇒ đơn vị của người đó lan xuống identity + hội thoại + tin", async () => {
      const { ingestInboundMessage } = await import("@/lib/inbox/ingest");
      const { ganNguoiPhuTrach } = await import("@/lib/inbox/thao-tac");

      const sale = await db.user.create({ data: { name: `${P}Sale CS1`, orgUnitId: CS1 } });
      const r = await ingestInboundMessage(tinDen("gan"));

      const truoc = await db.inboxConversation.findUniqueOrThrow({
        where: { id: r.conversationId },
      });
      expect(truoc.orgUnitId, "tin đầu tiên phải mồ côi — đó là trạng thái ĐÚNG").toBeNull();

      await ganNguoiPhuTrach({
        conversationId: r.conversationId,
        assigneeId: sale.id,
        boiUserId: sale.id,
      });

      const sau = await db.inboxConversation.findUniqueOrThrow({
        where: { id: r.conversationId },
        include: { identity: true },
      });
      expect(sau.assigneeId).toBe(sale.id);
      expect(sau.orgUnitId).toBe(CS1);
      expect(sau.identity.orgUnitId).toBe(CS1);

      const tin = await db.inboxMessage.findMany({ where: { conversationId: r.conversationId } });
      expect(tin.length).toBeGreaterThan(0);
      expect(tin.every((t) => t.orgUnitId === CS1)).toBe(true);
    });

    it("[ZC-05] gán về CS1 rồi thì Sale CS2 KHÔNG còn thấy hội thoại đó", async () => {
      const { ingestInboundMessage } = await import("@/lib/inbox/ingest");
      const { ganNguoiPhuTrach } = await import("@/lib/inbox/thao-tac");
      const { listInboxConversations, getInboxThread } = await import("@/lib/inbox/queries");

      const sale = await db.user.create({ data: { name: `${P}Sale CS1 b`, orgUnitId: CS1 } });
      const r = await ingestInboundMessage(tinDen("scope"));
      await ganNguoiPhuTrach({
        conversationId: r.conversationId,
        assigneeId: sale.id,
        boiUserId: sale.id,
      });

      const cs1 = await listInboxConversations({ actor: actorCoSo(CS1), canViewPii: true });
      const cs2 = await listInboxConversations({ actor: actorCoSo(CS2), canViewPii: true });
      expect(cs1.rows.map((x) => x.id)).toContain(r.conversationId);
      expect(cs2.rows.map((x) => x.id)).not.toContain(r.conversationId);

      // Gõ thẳng id cũng không vào được — cách ly phải ở TẦNG DỮ LIỆU.
      const goThang = await getInboxThread({
        actor: actorCoSo(CS2),
        canViewPii: true,
        conversationId: r.conversationId,
      });
      expect(goThang).toBeNull();
    });

    it("[ZC-17b] KHÔNG đè đơn vị đã có từ nối lead (gán người CS2 không kéo hội thoại CS1 đi)", async () => {
      // `Lead` là nguồn mạnh hơn người phụ trách. Đè là chuyển hội thoại sang cơ sở
      // khác sau lưng người đang xử lý, không một dòng log nào nói ra.
      const { ingestInboundMessage } = await import("@/lib/inbox/ingest");
      const { noiIdentityVaoLead } = await import("@/lib/inbox/identity");
      const { ganNguoiPhuTrach } = await import("@/lib/inbox/thao-tac");

      const lead = await db.lead.create({
        data: { parentName: `${P}Mẹ CS1`, phone: "84905000901", orgUnitId: CS1 },
      });
      const nguoiCs2 = await db.user.create({ data: { name: `${P}Sale CS2`, orgUnitId: CS2 } });
      const r = await ingestInboundMessage(tinDen("khongde"));
      const hoi0 = await db.inboxConversation.findUniqueOrThrow({
        where: { id: r.conversationId },
      });
      await noiIdentityVaoLead({
        identityId: hoi0.identityId,
        leadId: lead.id,
        source: "MANUAL",
        boiUserId: null,
      });

      await ganNguoiPhuTrach({
        conversationId: r.conversationId,
        assigneeId: nguoiCs2.id,
        boiUserId: nguoiCs2.id,
      });

      const sau = await db.inboxConversation.findUniqueOrThrow({
        where: { id: r.conversationId },
      });
      expect(sau.assigneeId).toBe(nguoiCs2.id); // vẫn gán được (điều phối là việc của người)
      expect(sau.orgUnitId, "đơn vị phải GIỮ theo lead").toBe(CS1);
    });

    it("[ZC-17c] trả hội thoại về hàng đợi chung KHÔNG xoá đơn vị", async () => {
      // Xoá đơn vị lúc bỏ gán là mở lại đúng lỗ B2: hội thoại rơi về nhóm mồ côi và
      // mọi cơ sở đọc lại được. Muốn gỡ đơn vị thì gỡ nối lead (`goNoiIdentity`).
      const { ingestInboundMessage } = await import("@/lib/inbox/ingest");
      const { ganNguoiPhuTrach } = await import("@/lib/inbox/thao-tac");

      const sale = await db.user.create({ data: { name: `${P}Sale CS1 c`, orgUnitId: CS1 } });
      const r = await ingestInboundMessage(tinDen("bogan"));
      await ganNguoiPhuTrach({
        conversationId: r.conversationId,
        assigneeId: sale.id,
        boiUserId: sale.id,
      });
      await ganNguoiPhuTrach({
        conversationId: r.conversationId,
        assigneeId: null,
        boiUserId: sale.id,
      });

      const sau = await db.inboxConversation.findUniqueOrThrow({
        where: { id: r.conversationId },
      });
      expect(sau.assigneeId).toBeNull();
      expect(sau.orgUnitId).toBe(CS1);
    });

    it("[ZC-17d] người được gán chưa khai đơn vị ⇒ vẫn gán được, hội thoại vẫn mồ côi", async () => {
      // Không được ném lỗi: điều phối là việc hằng ngày, còn đơn vị của tài khoản là
      // dữ liệu quản trị. Chặn gán vì thiếu dữ liệu quản trị là chặn nhầm chỗ.
      const { ingestInboundMessage } = await import("@/lib/inbox/ingest");
      const { ganNguoiPhuTrach } = await import("@/lib/inbox/thao-tac");

      const lac = await db.user.create({ data: { name: `${P}Sale chua khai` } });
      const r = await ingestInboundMessage(tinDen("khongdonvi"));
      await ganNguoiPhuTrach({
        conversationId: r.conversationId,
        assigneeId: lac.id,
        boiUserId: lac.id,
      });

      const sau = await db.inboxConversation.findUniqueOrThrow({
        where: { id: r.conversationId },
      });
      expect(sau.assigneeId).toBe(lac.id);
      expect(sau.orgUnitId).toBeNull();
    });
  });

  // ── B3 — nối lead phải cùng cơ sở ──────────────────────────────────────────
  describe("🔴 B3 — không nối hội thoại sang phiếu của cơ sở khác", () => {
    it("[ZC-03] SĐT khớp phiếu của CS2 ⇒ hội thoại CS1 KHÔNG được nối", async () => {
      const { timLeadTheoSdt, thuNoiTheoSdt } = await import("@/lib/inbox/identity");
      const { ingestInboundMessage } = await import("@/lib/inbox/ingest");

      const leadCs2 = await db.lead.create({
        data: { parentName: `${P}Mẹ CS2 b`, phone: "84905111222", orgUnitId: CS2 },
      });

      expect((await timLeadTheoSdt("0905111222", CS1)).map((x) => x.id)).not.toContain(leadCs2.id);
      expect((await timLeadTheoSdt("0905111222", CS2)).map((x) => x.id)).toContain(leadCs2.id);

      const r = await ingestInboundMessage(tinDen("noicheo"));
      const hoi0 = await db.inboxConversation.findUniqueOrThrow({
        where: { id: r.conversationId },
      });

      const qd = await thuNoiTheoSdt({
        identityId: hoi0.identityId,
        sdt: "0905111222",
        orgUnitId: CS1,
      });
      expect(qd).toEqual({ noi: false, lyDo: "KHONG_KHOP_LEAD" });

      const dt = await db.inboxIdentity.findUniqueOrThrow({ where: { id: hoi0.identityId } });
      expect(dt.leadId).toBeNull();
    });

    it("[ZC-03b] phiếu CHƯA có đơn vị vẫn nối được (đừng bỏ rơi phiếu tồn đọng)", async () => {
      const { thuNoiTheoSdt } = await import("@/lib/inbox/identity");
      const { ingestInboundMessage } = await import("@/lib/inbox/ingest");

      const leadTroi = await db.lead.create({
        data: { parentName: `${P}Mẹ chưa gán`, phone: "84905111333" },
      });
      const r = await ingestInboundMessage(tinDen("noitroi"));
      const hoi0 = await db.inboxConversation.findUniqueOrThrow({
        where: { id: r.conversationId },
      });

      const qd = await thuNoiTheoSdt({
        identityId: hoi0.identityId,
        sdt: "0905111333",
        orgUnitId: CS1,
      });
      expect(qd).toEqual({ noi: true, leadId: leadTroi.id, source: "PHONE_MATCH" });
    });

    it("[ZC-03c] chưa biết đơn vị ⇒ giữ nguyên hành vi cũ, vẫn nối theo SĐT", async () => {
      const { timLeadTheoSdt } = await import("@/lib/inbox/identity");
      const lead = await db.lead.create({
        data: { parentName: `${P}Mẹ CS2 c`, phone: "84905111444", orgUnitId: CS2 },
      });
      expect((await timLeadTheoSdt("0905111444")).map((x) => x.id)).toContain(lead.id);
    });

    it("[ZC-15] nối lead ⇒ đơn vị lan đủ ba bảng (identity + hội thoại + tin)", async () => {
      const { ingestInboundMessage } = await import("@/lib/inbox/ingest");
      const { noiIdentityVaoLead } = await import("@/lib/inbox/identity");

      const lead = await db.lead.create({
        data: { parentName: `${P}Mẹ lan`, phone: "84905111555", orgUnitId: CS1 },
      });
      const r = await ingestInboundMessage(tinDen("lan3bang"));
      const hoi0 = await db.inboxConversation.findUniqueOrThrow({
        where: { id: r.conversationId },
      });
      await noiIdentityVaoLead({
        identityId: hoi0.identityId,
        leadId: lead.id,
        source: "MANUAL",
        boiUserId: null,
      });

      const sau = await db.inboxConversation.findUniqueOrThrow({
        where: { id: r.conversationId },
        include: { identity: true },
      });
      const tin = await db.inboxMessage.findMany({ where: { conversationId: r.conversationId } });
      expect(sau.identity.orgUnitId).toBe(CS1);
      expect(sau.identity.leadId).toBe(lead.id);
      expect(sau.orgUnitId).toBe(CS1);
      expect(tin.every((t) => t.orgUnitId === CS1)).toBe(true);
    });
  });

  // ── B6 — echo về trước không được ném P2002 ────────────────────────────────
  describe("🔴 B6 — echo về trước bước 3 không được làm vỡ lượt gửi", () => {
    it("[ZC-B6] echo mang đúng id nhà cung cấp về TRƯỚC ⇒ không ném, id vẫn thuộc đúng một dòng", async () => {
      // Trước khi sửa: bước 3 ghi `channelMessageId` vô điều kiện và nằm NGOÀI
      // try/catch ⇒ P2002 bay thẳng ra Server Action. Người trực đọc "lỗi hệ thống"
      // và bấm gửi lại, trong khi tin đã tới khách rồi.
      const { ingestOutboundEcho } = await import("@/lib/inbox/ingest");
      const { ingestInboundMessage } = await import("@/lib/inbox/ingest");

      const r = await ingestInboundMessage(tinDen("echotruoc"));
      const ID_NCC = `${P}prov-truoc`;
      await ingestOutboundEcho({
        channel: "ZALO_OA",
        accountId: OA,
        externalUserId: "u-echotruoc",
        channelMessageId: ID_NCC,
        body: "Dạ em nghe ạ",
        sentAt: new Date(LUC.getTime() + 30_000),
      });

      const sendInboxReply = await napSendVoiAdapterThat(ID_NCC);
      const kq = await sendInboxReply({
        conversationId: r.conversationId,
        body: "Dạ em nghe ạ",
        sentByUserId: "u-sale",
        outboundKey: `${P}key-echotruoc`,
      });

      expect(kq.outcome.status).toBe("SENT");
      expect(kq.daTraLoiKhach).toBe(true);

      // Kết quả gửi VẪN được ghi sổ — mất nó là mất luôn bằng chứng đã trả lời khách.
      const cuaMinh = await db.inboxMessage.findUniqueOrThrow({ where: { id: kq.messageId } });
      expect(cuaMinh.deliveryStatus).toBe("SENT");
      expect(cuaMinh.providerMessageId).toBe(ID_NCC);
      expect(cuaMinh.channelMessageId, "id đã thuộc dòng echo — không giành lại").toBeNull();

      const giu = await db.inboxMessage.count({
        where: { channel: "ZALO_OA", channelMessageId: ID_NCC },
      });
      expect(giu).toBe(1);
    });

    it("[ZC-B6b] gửi đi trước, echo về sau ⇒ echo bị nhận ra là TRÙNG, không có dòng OUT thứ hai", async () => {
      // Mặt còn lại của B6: tách hai lệnh không được làm mất tác dụng chống echo.
      const { ingestInboundMessage, ingestOutboundEcho } = await import("@/lib/inbox/ingest");

      const r = await ingestInboundMessage(tinDen("echosau"));
      const ID_NCC = `${P}prov-sau`;
      const sendInboxReply = await napSendVoiAdapterThat(ID_NCC);
      const kq = await sendInboxReply({
        conversationId: r.conversationId,
        body: "Dạ vâng ạ",
        sentByUserId: "u-sale",
        outboundKey: `${P}key-echosau`,
      });
      expect(kq.outcome.status).toBe("SENT");

      const echo = await ingestOutboundEcho({
        channel: "ZALO_OA",
        accountId: OA,
        externalUserId: "u-echosau",
        channelMessageId: ID_NCC,
        body: "Dạ vâng ạ",
        sentAt: new Date(LUC.getTime() + 90_000),
      });
      expect(echo.duplicate).toBe(true);

      const soRa = await db.inboxMessage.count({
        where: { conversationId: r.conversationId, direction: "OUT" },
      });
      expect(soRa).toBe(1);
    });
  });

  // ── Gắn đơn vị theo nick ───────────────────────────────────────────────────
  describe("gắn cơ sở NGAY lúc nhận tin đầu tiên (theo nick)", () => {
    it("[ZC-16] gắn theo nick ⇒ hội thoại hết 'chưa biết cơ sở', tin sau tự thừa hưởng", async () => {
      // Mục đích: nhóm "mồ côi" chỉ còn nghĩa CHƯA NỐI LEAD, không còn nghĩa CHƯA
      // BIẾT CƠ SỞ. Nick ZaloCRM luôn thuộc đúng một cơ sở — biết rồi thì gắn ngay.
      const { ingestInboundMessage } = await import("@/lib/inbox/ingest");
      const { ganDonViTheoNick } = await import("@/lib/inbox/don-vi");
      const { listInboxConversations } = await import("@/lib/inbox/queries");

      const r = await ingestInboundMessage(tinDen("nick"));
      const kq = await ganDonViTheoNick({ conversationId: r.conversationId, orgUnitId: CS1 });
      expect(kq.daGan).toBe(true);

      const sau = await db.inboxConversation.findUniqueOrThrow({
        where: { id: r.conversationId },
        include: { identity: true },
      });
      expect(sau.orgUnitId).toBe(CS1);
      expect(sau.identity.orgUnitId).toBe(CS1);
      expect(sau.identity.leadId, "vẫn CHƯA nối lead — hai chuyện khác nhau").toBeNull();
      const tin1 = await db.inboxMessage.findMany({ where: { conversationId: r.conversationId } });
      expect(tin1.every((t) => t.orgUnitId === CS1)).toBe(true);

      // Tin thứ hai của cùng khách thừa hưởng đơn vị mà không cần gọi lại.
      await ingestInboundMessage({
        channel: "ZALO_OA",
        accountId: OA,
        externalUserId: "u-nick",
        channelMessageId: `${P}m-nick-2`,
        body: "cho hỏi học phí",
        sentAt: new Date(LUC.getTime() + 60_000),
      });
      const tin2 = await db.inboxMessage.findMany({ where: { conversationId: r.conversationId } });
      expect(tin2.length).toBe(2);
      expect(tin2.every((t) => t.orgUnitId === CS1)).toBe(true);

      const cs2 = await listInboxConversations({ actor: actorCoSo(CS2), canViewPii: true });
      expect(cs2.rows.map((x) => x.id)).not.toContain(r.conversationId);
    });

    it("[ZC-16b] nick chưa khai cơ sở (`null`) ⇒ không đụng gì, hội thoại giữ nguyên", async () => {
      const { ingestInboundMessage } = await import("@/lib/inbox/ingest");
      const { ganDonViTheoNick } = await import("@/lib/inbox/don-vi");

      const r = await ingestInboundMessage(tinDen("nicktrong"));
      const kq = await ganDonViTheoNick({ conversationId: r.conversationId, orgUnitId: null });
      expect(kq).toEqual({ daGan: false, lyDo: "KHONG_BIET_DON_VI" });

      const sau = await db.inboxConversation.findUniqueOrThrow({
        where: { id: r.conversationId },
      });
      expect(sau.orgUnitId).toBeNull();
    });

    it("[ZC-16c] hội thoại đã thuộc CS1, nick khai CS2 ⇒ TỪ CHỐI, dữ liệu không đổi", async () => {
      const { ingestInboundMessage } = await import("@/lib/inbox/ingest");
      const { ganDonViTheoNick } = await import("@/lib/inbox/don-vi");

      const r = await ingestInboundMessage(tinDen("nickdoi"));
      await ganDonViTheoNick({ conversationId: r.conversationId, orgUnitId: CS1 });
      const kq = await ganDonViTheoNick({ conversationId: r.conversationId, orgUnitId: CS2 });
      expect(kq).toEqual({ daGan: false, lyDo: "DA_CO_DON_VI_KHAC" });

      const sau = await db.inboxConversation.findUniqueOrThrow({
        where: { id: r.conversationId },
      });
      expect(sau.orgUnitId).toBe(CS1);
    });

    it("[ZC-16d] id không tồn tại ⇒ trả KHONG_TIM_THAY, không ném", async () => {
      // Đường gọi là WEBHOOK: ném ở đây là nhà cung cấp thấy 5xx và retry mãi một
      // payload không bao giờ xử lý được.
      const { ganDonViTheoNick } = await import("@/lib/inbox/don-vi");
      expect(
        await ganDonViTheoNick({ conversationId: `${P}khong-co`, orgUnitId: CS1 }),
      ).toEqual({ daGan: false, lyDo: "KHONG_TIM_THAY" });
    });
  });
});

/**
 * Nạp `sendInboxReply` với sổ đăng ký adapter GIẢ trả `SENT` kèm id cho trước.
 *
 * Vì sao phải giả: môi trường test không có khoá kết nối Zalo/Meta ⇒ mọi adapter
 * thật trả `SIMULATED` với `providerMessageId = null`, mà `null` thì bước 3 không
 * bao giờ va khoá chống trùng — tức không tái hiện được B6.
 */
async function napSendVoiAdapterThat(providerMessageId: string) {
  vi.resetModules();
  vi.doMock("@/lib/integrations/registry", () => ({
    getChannelProvider: () => ({
      channel: "ZALO_OA",
      name: "gia-lap",
      label: "Giả lập",
      isConfigured: () => true,
      send: async () => ({ status: "SENT" as const, providerMessageId }),
    }),
    khongCoAdapter: (channel: string) => ({
      status: "SKIPPED" as const,
      errorCode: `KENH_KHONG_GUI_DUOC_${channel}`,
    }),
  }));
  const { sendInboxReply } = await import("@/lib/inbox/send");
  return sendInboxReply;
}

/** Actor cấp cơ sở tối thiểu — chỉ cần field mà `inboxOrgScopeWhere` đọc. */
function actorCoSo(orgUnitId: string) {
  return {
    userId: "u-test",
    isSuperAdmin: false,
    isHoLevel: false,
    orgRoles: [],
    permissions: [],
    visibleCenterIds: [],
    visibleOrgUnitIds: [orgUnitId],
    grantsAllow: new Set<string>(),
    assignedClassIds: new Set<string>(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}
