import type { Prisma, LeadActivityType } from "@prisma/client";
import { CONTACT_ACTIVITY_TYPES } from "@/lib/reports/lead-kpi";

// N-4 (C-05-3) — MỘT CỬA ghi `LeadActivity`.
//
// 🔴 Vì sao phải có file này. Trước 28/08 repo có 12 chỗ gọi `leadActivity.create` và
// chỉ 3 chỗ nhớ bump `Lead.lastActivityAt` kèm theo. Hệ quả đo được: cột đó hiển thị
// "vừa mới chăm" cho lead đã bị bỏ quên hàng tuần — sai theo hướng TRẤN AN, tức là
// hướng không ai đi kiểm.
//
// ⚠️ CHỈ hoạt động TIẾP CẬN NGƯỜI THẬT mới bump đồng hồ (OQ-C4):
//   • `CALL` · `MESSAGE` · `NOTE` · `EMAIL` → bump
//   • `STATUS_CHANGE` · `HANDOVER` → **KHÔNG** bump
// Bump cả hai nhóm là mở lại đúng cái lỗ mà OQ-C4 vừa bịt: Sale bấm đổi trạng thái qua
// lại là đồng hồ về 0 mà chưa gọi khách lần nào. Đó là lý do hàm này KHÔNG có tham số
// kiểu "forceBump" — thêm vào là có ngày ai đó dùng.
//
// ⚠️ `actorId = null` (hệ thống sinh) cũng KHÔNG bump, cùng lý do: đường đọc C5 loại
// những dòng đó, nên bump ở đây sẽ làm hai bên lệch nhau. Hai điều kiện, không phải một.

export type RecordLeadActivityInput = {
  leadId: string;
  /** `null` = hệ thống sinh ⇒ KHÔNG bump đồng hồ (xem ghi chú trên). */
  actorId: string | null;
  actorName: string;
  type: LeadActivityType;
  content: string;
  metadata?: Prisma.InputJsonValue;
};

/** Hoạt động này có được tính là "một lần tiếp cận" không (⇒ có bump đồng hồ không). */
export function bumpsContactClock(input: {
  type: LeadActivityType;
  actorId: string | null;
}): boolean {
  return (
    input.actorId != null && (CONTACT_ACTIVITY_TYPES as readonly string[]).includes(input.type)
  );
}

/**
 * Ghi một `LeadActivity` **và** bump `Lead.lastActivityAt` khi đó là tiếp cận thật.
 *
 * Nhận `tx` (client trong transaction) chứ không tự mở transaction: mọi call-site hiện
 * tại đều đã nằm trong một transaction lớn hơn — hoạt động phải commit/rollback CÙNG
 * thay đổi nghiệp vụ sinh ra nó, không được sống sót riêng.
 */
export async function recordLeadActivity(
  tx: Prisma.TransactionClient,
  input: RecordLeadActivityInput,
): Promise<void> {
  await tx.leadActivity.create({
    data: {
      leadId: input.leadId,
      actorId: input.actorId,
      actorName: input.actorName,
      type: input.type,
      content: input.content,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    },
  });

  if (bumpsContactClock(input)) {
    await tx.lead.update({
      where: { id: input.leadId },
      data: { lastActivityAt: new Date() },
    });
  }
}
