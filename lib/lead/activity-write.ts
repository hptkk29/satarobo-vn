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
//
// ─────────────────────────────────────────────────────────────────────────────
// S-3 — hàm này còn đóng nốt mốc `Lead.firstContactAt` ("Sale liên hệ lần đầu").
//
// Trước S-3 cột đó có mà KHÔNG AI GHI: chỗ ghi duy nhất `recordFirstContact`
// (`lib/crm/handover.ts:69`) không được gọi từ bất kỳ đâu trong `app/`/`lib/` —
// người gọi duy nhất là một file e2e. Hệ quả trên máy thật: bảng việc của Sale
// báo "chưa liên hệ lần nào" cho cả khách đã gọi 10 lần (`soChuaLienHe`,
// `lib/crm/sale-board.ts:207`), còn cảnh báo SLA-3 ("Chưa liên hệ khách > 3
// giờ", `lib/crm/sla.ts:78`) KHÔNG BAO GIỜ TẮT vì điều kiện tắt là
// `firstContactAt != null`. Chuông kêu mãi thì tư vấn viên học cách phớt lờ
// chuông — đúng thứ làm cả cơ chế SLA thành vô dụng.
//
// Đóng dấu ở ĐÂY chứ không thêm một hàm `recordFirstContact` thứ hai vì đây đã
// là cửa ghi hoạt động DUY NHẤT (test "chốt chặn nguồn" giữ nó duy nhất): mọi
// đường chạm khách — nhật ký tay của Sale trên màn lead lẫn trên site Sale
// (`addLeadActivity`), bàn giao — đều chảy qua đây, nên không có cửa nào ghi
// hoạt động mà quên mốc.
// ─────────────────────────────────────────────────────────────────────────────
import type { LeadActivityType, Prisma } from "@prisma/client";
import { LEAD_OUTREACH_TYPES, isLeadOutreach } from "./activity-clock";

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

  // S-3 — chỉ lượt CHẠM KHÁCH THẬT mới đóng dấu. Bộ lọc dùng lại nguyên
  // `isLeadOutreach`; đừng viết điều kiện loại thứ hai ở đây, vì lúc chủ dự án
  // chốt danh sách thì hai bản sẽ lệch nhau mà không ai biết.
  if (
    isLeadOutreach(
      { type: input.type, createdAt: row.createdAt, metadata: input.metadata },
      LEAD_OUTREACH_TYPES,
    )
  ) {
    // `updateMany` chứ không `update`: điều kiện "chỉ khi còn trống" nằm TRONG
    // `where` để Postgres tự lọc. Đọc-rồi-ghi thì hai lượt chạm gần nhau sẽ
    // cùng thấy `null` và lượt sau dời mốc — "liên hệ LẦN ĐẦU" hoá ra là "lần
    // gần nhất", và báo cáo "bao lâu từ lúc nhận khách tới cuộc gọi đầu" mất
    // nghĩa. `count: 0` là kết quả ĐÚNG cho lead đã có mốc, không phải lỗi.
    await input.tx.lead.updateMany({
      where: { id: input.leadId, firstContactAt: null },
      data: { firstContactAt: row.createdAt },
    });
  }

  return row;
}
