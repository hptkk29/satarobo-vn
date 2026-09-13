"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb, passesScope } from "@/lib/db-scope";
import type { Prisma } from "@prisma/client";
import { createBackfillOrderPaymentInTx } from "@/lib/crm/backfill-order";
import { getAuditActor } from "@/lib/audit/log";

/**
 * Ghi học phí cho học viên ĐÃ CHỐT nhưng CHƯA PHÁT SINH ĐƠN HÀNG.
 *
 * Nhóm này sinh ra từ nhánh `allowNoPayment` của `lib/crm/bulk-convert.ts`: chốt lead
 * hàng loạt mà không nhập tiền thì hệ thống CỐ Ý không bịa khoản thu — nên các em có
 * `Enrollment` nhưng không có `Order`/`Payment`, và học phí không nằm trong sổ nào.
 *
 * DÙNG LẠI `createBackfillOrderPaymentInTx` — cùng hàm mà màn import dùng. Không viết
 * đường tạo đơn thứ hai: nó tạo Order `CONFIRMED` + Payment mang dấu `[backfill-import]`,
 * và tự IDEMPOTENT theo lead (đã có khoản backfill thì trả `created: false`, không tạo
 * lần hai) ⇒ bấm hai lần không sinh hai đơn.
 *
 * Khoản tạo ra để `accountantStatus: PENDING` như mọi khoản backfill khác ⇒ muốn vào
 * doanh thu thì xác nhận ở `/payments` (nút "Xem thử: xác nhận học phí nhập từ sheet").
 * Cố ý KHÔNG tự xác nhận ở đây: đó là đường ghi `CONFIRMED` thứ hai.
 */
const schema = z.object({
  leadId: z.string().min(1),
  amount: z.number().int().positive("Số tiền phải lớn hơn 0"),
  paidDate: z.string().min(1),
  /** Giá niêm yết của khoá để dựng dòng đơn; bỏ trống → lấy đúng số đã thu. */
  listPrice: z.number().int().nonnegative().optional(),
  itemName: z.string().min(1).max(200),
  note: z.string().max(500).optional(),
});

export async function ghiHocPhiBackfillAction(input: unknown) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Cùng cổng với màn ghi nhận khoản thu — đây là hành vi GHI TIỀN.
  if (!(await checkPermission("payments:record"))) {
    return { ok: false as const, error: "Không có quyền ghi nhận khoản thu" };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const { leadId, amount, paidDate, listPrice, itemName, note } = parsed.data;

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  // scopedDb auto-scope READ; vẫn tự gác vì đây là đường GHI (Lead ∈ SCOPED_MODELS).
  const lead = await sdb.lead.findUnique({
    where: { id: leadId },
    select: { id: true, centerId: true, parentName: true, phone: true, email: true },
  });
  if (!lead || !passesScope("Lead", lead, actor)) {
    return { ok: false as const, error: "Không tìm thấy lead trong phạm vi của bạn" };
  }

  const ngay = new Date(paidDate);
  if (Number.isNaN(ngay.getTime())) {
    return { ok: false as const, error: "Ngày đóng không hợp lệ" };
  }

  const auditActor = getAuditActor(session);
  // tx từ scopedDb (ESLint R6-F1 chặn `@/lib/db` trần trong admin). Cast vì extended
  // client không structurally-assignable vào `Prisma.TransactionClient` — tiền lệ
  // `orders/_actions.ts:360-361`.
  const res = await sdb.$transaction((txRaw) =>
    createBackfillOrderPaymentInTx(txRaw as unknown as Prisma.TransactionClient, {
      actor: { id: auditActor.actorId, name: auditActor.actorName },
      lead,
      paid: {
        amount,
        paidDate: ngay,
        note: note?.trim() || null,
        // Giá niêm yết bỏ trống ⇒ lấy đúng số đã thu, tức đơn không có công nợ. Đó là
        // lựa chọn AN TOÀN: bịa giá niêm yết cao hơn là tự tạo ra một khoản nợ không
        // có căn cứ trên đầu phụ huynh.
        items: [{ itemName, unitPrice: listPrice ?? amount }],
        discountAmount: listPrice && listPrice > amount ? 0 : 0,
      },
    }),
  );

  if (!res.created) {
    return {
      ok: false as const,
      error: res.paymentId
        ? "Lead này đã có khoản nhập liệu ban đầu — không tạo thêm đơn thứ hai"
        : "Số tiền không hợp lệ",
    };
  }

  revalidatePath("/thieu-hoc-phi");
  revalidatePath("/payments");
  revalidatePath("/cong-no");
  revalidatePath(`/leads/${leadId}`);
  return { ok: true as const, paymentId: res.paymentId };
}
