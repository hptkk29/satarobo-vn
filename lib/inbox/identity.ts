import "server-only";
// lib/inbox/identity.ts — DANH TÍNH NGOÀI ↔ `Lead`, tầng chạm DB.
//
// Luật quyết định nằm ở `identity-rules.ts` (thuần, có test). File này chỉ đi lấy
// ứng viên và ghi kết quả.
//
// ⚠️ Đọc `Lead` ở đây dùng `db` TRẦN chứ không `scopedDb`, CÓ CHỦ ĐÍCH: đường ghi
// này chạy từ WEBHOOK — không có actor, không có phiên. Đổi lại nó chỉ ĐỌC đúng
// `id`/`orgUnitId` để nối và suy đơn vị, KHÔNG trả nội dung nào ra ngoài. Mọi
// đường đọc CÓ NGƯỜI đều qua `lib/inbox/queries.ts`, và ở đó `Lead` đi qua
// `scopedDb`.
import { db } from "@/lib/db";
import { phoneVariants } from "@/lib/phone";
import { quyetDinhNoiTheoSdt, type QuyetDinhNoiLead } from "@/lib/inbox/identity-rules";
import type { InboxIdentityLinkSource } from "@prisma/client";

/**
 * Tìm lead theo SĐT.
 *
 * ⚠️ BẮT BUỘC `{ in: phoneVariants(x) }`, KHÔNG so bằng: DB còn tồn tại CẢ HAI
 * định dạng (`0…` và `84…` — đo trên DEV 03/08: 99 và 8 bản). So bằng một dạng là
 * bỏ sót đúng nửa dữ liệu mà không có dấu hiệu nào.
 */
export async function timLeadTheoSdt(sdt: unknown): Promise<{ id: string }[]> {
  const bienThe = phoneVariants(sdt);
  if (bienThe.length === 0) return [];
  return db.lead.findMany({
    where: { phone: { in: bienThe }, deletedAt: null },
    select: { id: true },
    // Trần 2: chỉ cần biết "đúng một" hay "nhiều hơn một" (`quyetDinhNoiTheoSdt`).
    take: 2,
  });
}

/**
 * Thử nối tự động một danh tính với `Lead` theo SĐT vừa biết được.
 *
 * Chỉ nối khi có ĐÚNG MỘT phiếu khớp. Mọi ca còn lại để MỒ CÔI cho người xử lý —
 * nối nhầm nghĩa là hội thoại của khách A nằm trong hồ sơ khách B, và nó chỉ lộ ra
 * lúc Sale gọi nhầm người.
 */
export async function thuNoiTheoSdt(input: {
  identityId: string;
  sdt: unknown;
}): Promise<QuyetDinhNoiLead> {
  const ungVien = await timLeadTheoSdt(input.sdt);
  const qd = quyetDinhNoiTheoSdt(input.sdt, ungVien);
  if (!qd.noi) return qd;
  await noiIdentityVaoLead({
    identityId: input.identityId,
    leadId: qd.leadId,
    source: "PHONE_MATCH",
    boiUserId: null,
  });
  return qd;
}

/**
 * Nối một danh tính vào `Lead` và LAN đơn vị xuống cả hội thoại lẫn tin nhắn.
 *
 * Lan `orgUnitId` là phần dễ quên nhất: không lan thì hội thoại vẫn nằm trong nhóm
 * mồ côi (ai cũng thấy) dù đã biết nó thuộc cơ sở nào — tức cách ly cơ sở không
 * bao giờ bật lên.
 */
export async function noiIdentityVaoLead(input: {
  identityId: string;
  leadId: string;
  source: InboxIdentityLinkSource;
  boiUserId: string | null;
}): Promise<void> {
  const lead = await db.lead.findUnique({
    where: { id: input.leadId },
    select: { id: true, orgUnitId: true },
  });
  if (!lead) return;

  await db.$transaction(async (tx) => {
    await tx.inboxIdentity.update({
      where: { id: input.identityId },
      data: {
        leadId: lead.id,
        linkedAt: new Date(),
        linkedById: input.boiUserId,
        linkSource: input.source,
        orgUnitId: lead.orgUnitId,
      },
    });
    const hoi = await tx.inboxConversation.findMany({
      where: { identityId: input.identityId },
      select: { id: true },
    });
    if (hoi.length === 0) return;
    const ids = hoi.map((h) => h.id);
    await tx.inboxConversation.updateMany({
      where: { id: { in: ids } },
      data: { orgUnitId: lead.orgUnitId },
    });
    await tx.inboxMessage.updateMany({
      where: { conversationId: { in: ids } },
      data: { orgUnitId: lead.orgUnitId },
    });
  });
}

/** Gỡ nối — hội thoại quay lại nhóm mồ côi. Dùng khi nối nhầm. */
export async function goNoiIdentity(input: {
  identityId: string;
  boiUserId: string | null;
}): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.inboxIdentity.update({
      where: { id: input.identityId },
      data: {
        leadId: null,
        linkedAt: null,
        linkedById: input.boiUserId,
        linkSource: null,
        orgUnitId: null,
      },
    });
    const hoi = await tx.inboxConversation.findMany({
      where: { identityId: input.identityId },
      select: { id: true },
    });
    if (hoi.length === 0) return;
    const ids = hoi.map((h) => h.id);
    await tx.inboxConversation.updateMany({
      where: { id: { in: ids } },
      data: { orgUnitId: null },
    });
    await tx.inboxMessage.updateMany({
      where: { conversationId: { in: ids } },
      data: { orgUnitId: null },
    });
  });
}
