import "server-only";
// lib/inbox/send.ts — GỬI MỘT LƯỢT TRẢ LỜI. Quy trình GIÀNH CHỖ TRƯỚC, GỬI SAU.
//
// ── Vì sao giành chỗ trước (spec §3.3 S3) ───────────────────────────────────
// Mẫu đang chạy đúng trong repo là `ChatZnsNotification`: ghi dòng `PENDING` (UNIQUE
// ở tầng DB chặn đua) → gọi nhà cung cấp → cập nhật kết quả. Tiến trình chết giữa
// chừng thì dừng ở `PENDING` và KHÔNG gửi lại — cố ý nghiêng về "thiếu một tin" thay
// vì "gửi đôi cho khách". Tin đã đi không thu hồi được; một tin thiếu thì người trực
// nhìn thấy và gửi lại.
//
// ── 🔴 Vì sao `lastOutboundAt` chỉ đổi khi tin THẬT SỰ đi được ──────────────
// Module Messenger cũ set `MessengerConversation.respondedAt` ngay khi ghi dòng OUT,
// mà `lib/crm/sla.ts` đọc đúng cột đó để bật cảnh báo chậm phản hồi ⇒ mỗi lần bấm
// "Gửi" là TẮT cảnh báo của một khách chưa ai trả lời. Ở đây điều kiện là
// `ketQuaGuiToSoGhi(...).daTraLoiKhach`, và nó chỉ true với `SENT`.
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getChannelProvider, khongCoAdapter } from "@/lib/integrations/registry";
import type { ChannelSendOutcome } from "@/lib/integrations/types";
import { ketQuaGuiToSoGhi } from "@/lib/inbox/send-rules";
import { tinhChoTraLoi } from "@/lib/inbox/view";

export type KetQuaTraLoi = {
  messageId: string;
  outcome: ChannelSendOutcome;
  /** Tin có tới khách không. `false` ⇒ giao diện PHẢI nói thẳng là chưa gửi. */
  daTraLoiKhach: boolean;
};

/** Bấm hai lần / hai tab cùng gửi ⇒ va vào `@@unique([conversationId, outboundKey])`. */
export class TrungLuotGuiError extends Error {
  readonly code = "TRUNG_LUOT_GUI";
  constructor() {
    super("Lượt gửi này đã được ghi nhận.");
  }
}

export class KhongTimThayHoiThoaiError extends Error {
  readonly code = "KHONG_TIM_THAY_HOI_THOAI";
  constructor() {
    super("Không tìm thấy hội thoại.");
  }
}

/**
 * Gửi một tin trả lời.
 *
 * ⚠️ KHÔNG kiểm quyền ở đây — đó là việc của Server Action gọi vào (luật cứng #1:
 * mọi kiểm quyền đi qua `can()`, và nó phải nằm ở lớp có `actor`). Hàm này giả định
 * người gọi đã gác xong cả quyền lẫn tầm nhìn (`passesInboxScope`).
 */
export async function sendInboxReply(input: {
  conversationId: string;
  body: string;
  sentByUserId: string;
  /** Khoá giành chỗ do chỗ gọi sinh (một lượt bấm = một khoá). */
  outboundKey: string;
  now?: Date;
}): Promise<KetQuaTraLoi> {
  const luc = input.now ?? new Date();

  const hoi = await db.inboxConversation.findFirst({
    where: { id: input.conversationId, deletedAt: null },
    select: {
      id: true,
      channel: true,
      accountId: true,
      orgUnitId: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      lastMessageAt: true,
      identity: { select: { externalUserId: true } },
    },
  });
  if (!hoi) throw new KhongTimThayHoiThoaiError();

  // ── 1. GIÀNH CHỖ ──────────────────────────────────────────────────────────
  let tinId: string;
  try {
    const tin = await db.inboxMessage.create({
      data: {
        conversationId: hoi.id,
        channel: hoi.channel,
        direction: "OUT",
        body: input.body,
        sentByUserId: input.sentByUserId,
        deliveryStatus: "PENDING",
        outboundKey: input.outboundKey,
        sentAt: luc,
        orgUnitId: hoi.orgUnitId,
      },
      select: { id: true },
    });
    tinId = tin.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new TrungLuotGuiError();
    }
    throw err;
  }

  // ── 2. GỬI ────────────────────────────────────────────────────────────────
  const provider = getChannelProvider(hoi.channel);
  const outcome: ChannelSendOutcome = provider
    ? await provider.send({
        accountId: hoi.accountId,
        externalUserId: hoi.identity.externalUserId,
        body: input.body,
      })
    : khongCoAdapter(hoi.channel);

  // ── 3. GHI KẾT QUẢ ────────────────────────────────────────────────────────
  const so = ketQuaGuiToSoGhi(outcome);
  await db.inboxMessage.update({
    where: { id: tinId },
    data: {
      deliveryStatus: so.deliveryStatus,
      providerMessageId: so.providerMessageId,
      errorCode: so.errorCode,
      // Ghi luôn vào `channelMessageId` để ECHO của chính tin này (Meta gửi lại
      // tin mình vừa gửi) va vào `@@unique([channel, channelMessageId])` và bị
      // nhận ra là trùng — spec §4.3 MS-3. Không làm thì mỗi tin gửi đi hiện hai
      // lần trên màn hình.
      channelMessageId: so.providerMessageId,
    },
  });

  if (so.daTraLoiKhach) {
    await db.inboxConversation.update({
      where: { id: hoi.id },
      data: {
        lastOutboundAt: luc,
        lastMessageAt: hoi.lastMessageAt && hoi.lastMessageAt > luc ? hoi.lastMessageAt : luc,
        awaitingReply: tinhChoTraLoi({
          lastInboundAt: hoi.lastInboundAt,
          lastOutboundAt: luc,
        }),
        unreadCount: 0,
      },
    });
  }
  // KHÔNG có nhánh `else` đụng `lastOutboundAt`. Tin chưa đi thì đồng hồ "chưa ai
  // trả lời" phải tiếp tục chạy — đó là toàn bộ điểm của khối này.

  return { messageId: tinId, outcome, daTraLoiKhach: so.daTraLoiKhach };
}
