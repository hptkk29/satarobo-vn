// lib/lead/activity-write.ts — N-4: ĐƯỜNG GHI DUY NHẤT của một dòng hoạt động lead.
//
// Trước ticket này có 13 chỗ gọi `leadActivity.create`, và chỉ 3 chỗ (đều trong
// `app/(admin)/admin/leads/actions.ts`) nhớ cập nhật `Lead.lastActivityAt` kèm
// theo. Mười chỗ còn lại — tự chia lead, gán tay, chia lại khi sale nghỉ, ghi
// nhận tiền, phiếu trùng SĐT, phiếu thêm con, gán theo mã NV, bàn giao, đổi
// trạng thái — ghi hoạt động xong để nguyên đồng hồ.
//
// Hậu quả không nằm ở "code xấu" mà ở con số QLCS đọc: cột "số ngày chưa tiếp
// cận lại" (C-05) sai theo CẢ HAI chiều — lead vừa được máy chia vẫn hiện treo
// nhiều ngày, còn `isLeadIdle` (`lib/crm/sla.ts:100`) rơi ngược về `createdAt`
// nên che mất lead đã có hoạt động thật. Ngưỡng vàng ≥ 2 / đỏ ≥ 7 ngày (chốt
// 24/08/2026) vì thế báo động nhầm cả hai chiều.
//
// Hàm này ghi ĐỦ hai thứ, trong CÙNG transaction mà chỗ gọi đang mở:
//   1. dòng `LeadActivity`;
//   2. `Lead.lastActivityAt` = ĐÚNG `createdAt` của dòng vừa ghi.
//
// ⚠️ Vì sao lấy `createdAt` trả về chứ không `new Date()`: đợt vá N-4 có bước
// backfill so `lastActivityAt` với `MAX(LeadActivity.createdAt)`. Lấy đồng hồ
// tiến trình thì hai số lệch vài mili-giây trên MỌI dòng ⇒ lần đối soát nào cũng
// báo lệch và không còn phân biệt được lệch thật. `@default(now())` của Postgres
// là mốc TRANSACTION, nên nhiều dòng ghi trong cùng một lượt sẽ trùng khít nhau.
//
// ⚠️ KHÔNG `.catch()` nuốt lỗi ở đây và cũng đừng thêm ở chỗ gọi: bump hỏng mà
// dòng hoạt động vẫn lưu thì đồng hồ đứng im — đúng loại sai làm lead treo
// "hết treo" mà không ai biết vì sao. Cùng bài học đã vá ở C-07.
//
// ⚠️ `lastActivityAt` là "có hoạt động", KHÔNG phải "đã tiếp cận khách" — dòng
// máy ghi cũng bump. Đồng hồ tiếp cận nằm ở `activity-clock.ts` (hàm thuần, nhận
// danh sách loại truyền vào), đừng đem cột này dùng thẳng cho C-05.
import type { LeadActivityType, Prisma } from "@prisma/client";

export type RecordLeadActivityInput = {
  /** Transaction của chính lượt ghi — bắt buộc, đồng hồ phải cùng số phận với dòng hoạt động. */
  tx: Prisma.TransactionClient;
  leadId: string;
  /** `null` cho đường máy (cron, webhook, tự chia). */
  actorId?: string | null;
  actorName: string;
  type: LeadActivityType;
  content: string;
  metadata?: Prisma.InputJsonValue | null;
};

export async function recordLeadActivity(
  input: RecordLeadActivityInput,
): Promise<{ id: string; createdAt: Date }> {
  const row = await input.tx.leadActivity.create({
    data: {
      leadId: input.leadId,
      actorId: input.actorId ?? null,
      actorName: input.actorName,
      type: input.type,
      content: input.content,
      // Chỉ set khi chỗ gọi có truyền → không ghi đè `null` lên dòng cũ.
      ...(input.metadata != null ? { metadata: input.metadata } : {}),
    },
    select: { id: true, createdAt: true },
  });

  await input.tx.lead.update({
    where: { id: input.leadId },
    data: { lastActivityAt: row.createdAt },
  });

  return row;
}
