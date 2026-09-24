"use server";

// Server Action của màn "Giao nick Zalo".
//
// Cổng ở ĐÂY là bắt buộc, không phải lặp lại cổng của trang: layout gate và page gate
// không chặn được một lượt POST gọi thẳng vào Server Action (luật cứng #5 của repo).
//
// Luật "ai được nhận nick" nằm trong `giaoNick` (`lib/integrations/zalocrm/giao-nick.ts`),
// KHÔNG viết lại ở đây — hai bản của cùng một luật là hai bản sẽ lệch nhau.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { checkPermission } from "@/lib/auth/check-permission";
import { isZalocrmEnabled } from "@/lib/flags";
import { giaoNick, type MaLoiGiaoNick } from "@/lib/integrations/zalocrm/giao-nick";
import { writeAudit } from "@/lib/audit/audit-log";

const schema = z.object({
  zcrmAccountId: z.string().min(1).max(128),
  // Chuỗi rỗng từ ô chọn = GỠ GIAO. Dùng `null` ở tầng dưới cho rõ nghĩa.
  sataUserId: z.string().max(128).nullable(),
});

const THONG_DIEP: Record<MaLoiGiaoNick, string> = {
  KHONG_THAY_NICK: "Không tìm thấy nick này.",
  NICK_NGOAI_TAM_NHIN: "Nick không thuộc cơ sở bạn quản lý.",
  NICK_CHUA_CO_CO_SO: "Nick chưa gắn cơ sở (hoặc cơ sở chưa đặt mã) nên chưa giao được.",
  NGUOI_NGOAI_CO_SO: "Người này không thuộc cơ sở của nick, hoặc không giữ vai được dùng nick.",
};

export async function giaoNickAction(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  if (!isZalocrmEnabled()) return { ok: false, error: "Tính năng chưa bật." };

  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("zalocrm:manage-nick"))) return { ok: false, error: "Không có quyền" };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu sai" };

  const actor = await resolveActor(session.user.id);
  const kq = await giaoNick({
    actor: {
      isSuperAdmin: actor.isSuperAdmin,
      isHoLevel: actor.isHoLevel,
      visibleCenterIds: actor.visibleCenterIds,
    },
    zcrmAccountId: parsed.data.zcrmAccountId,
    sataUserId: parsed.data.sataUserId || null,
  });
  if (!kq.ok) return { ok: false, error: THONG_DIEP[kq.ma] };

  // Đây là thay đổi PHÂN QUYỀN trên dữ liệu khách hàng thật — phải có vết. Ghi cả giá trị
  // mới lẫn nick, để đọc `AuditLog` là dựng lại được ai giao nick nào cho ai, lúc nào.
  await writeAudit({
    actor: {
      id: session.user.id,
      name: session.user.name ?? session.user.email ?? session.user.id,
    },
    module: "integrations",
    entityType: "ZaloCrmNick",
    entityId: parsed.data.zcrmAccountId,
    action: "GIAO_NICK",
    newValues: { sataUserId: kq.daGiaoCho },
    changedFields: ["sataUserId"],
  });

  revalidatePath("/admin/zalo-crm/nick");
  return { ok: true };
}
