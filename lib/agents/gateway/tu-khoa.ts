// lib/agents/gateway/tu-khoa.ts — TỰ KHOÁ client khi có dấu hiệu bất thường (spec §12).
//
// Bốn dấu hiệu: sai mật khẩu vượt ngưỡng · gọi từ IP ngoài danh sách (bằng thông tin xác thực
// ĐÚNG — tức khoá đã lộ) · đọc quá hạn mức bản ghi CAO/ngày · (Đợt sau) nhiều lỗi ngoài phạm vi.
//
// Khoá = chuyển SUSPENDED + thu hồi MỌI token đang sống, rồi báo người duyệt NGAY. Mở lại
// cần người có `agent_gateway:approve` (màn quản trị) — cố ý không tự mở theo thời gian.
//
// ⚠️ Đây KHÔNG phải cron ghi quyền (luật cứng #8): nó chạy trong chính lượt gọi bất thường,
// do một sự kiện cụ thể kích hoạt, và chỉ ĐÓNG chứ không bao giờ mở.
import { writeAudit } from "@/lib/audit/audit-log";
import { notifyStaff } from "@/lib/notifications/notify";
import { khoCong } from "../kho";

export type LyDoTuKhoa = "SAI_MAT_KHAU" | "IP_LA" | "VUOT_HAN_MUC_CAO";

const MO_TA: Record<LyDoTuKhoa, string> = {
  SAI_MAT_KHAU: "sai mật khẩu nhiều lần liên tiếp (nghi dò mật khẩu)",
  IP_LA: "dùng thông tin xác thực ĐÚNG nhưng gọi từ IP ngoài danh sách (nghi lộ khoá)",
  VUOT_HAN_MUC_CAO: "đọc vượt hạn mức dữ liệu nhạy cảm trong ngày (nghi rút dữ liệu hàng loạt)",
};

/** Người nhận báo: ai đang giữ `agent_gateway:approve` (qua vai v2) + SUPER_ADMIN. */
async function nguoiNhanBao(now: Date): Promise<string[]> {
  const [quaVai, quanTri] = await Promise.all([
    khoCong.userOrgRole.findMany({
      where: {
        status: "ACTIVE",
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
        role: { isActive: true, permissions: { some: { action: "agent_gateway:approve" } } },
      },
      select: { userId: true },
    }),
    khoCong.user.findMany({
      where: { OR: [{ role: "SUPER_ADMIN" }, { roles: { has: "SUPER_ADMIN" } }] },
      select: { id: true },
    }),
  ]);
  const ids = [...new Set([...quaVai.map((r) => r.userId), ...quanTri.map((u) => u.id)])];
  if (ids.length === 0) return [];
  const conSong = await khoCong.user.findMany({
    where: { id: { in: ids }, isActive: true, deletedAt: null, isServiceAccount: false },
    select: { id: true },
  });
  return conSong.map((u) => u.id);
}

/**
 * Khoá client đang ACTIVE. Idempotent: client đã khoá/thu hồi thì không làm gì và KHÔNG báo
 * lại (không để một agent lỗi bắn 20 thông báo một phút).
 *
 * Không ném: tự khoá chạy trong đường xử lý lỗi của cổng, và một lỗi ở đây không được biến
 * lượt từ chối thành lỗi 500 — lượt gọi vẫn bị từ chối như cũ.
 */
export async function tuKhoaClient(clientId: string, lyDo: LyDoTuKhoa, now: Date): Promise<boolean> {
  try {
    const up = await khoCong.agentClient.updateMany({
      where: { id: clientId, status: "ACTIVE" },
      data: { status: "SUSPENDED", suspendedAt: now, suspendReason: `Tự khoá: ${MO_TA[lyDo]}` },
    });
    if (up.count === 0) return false;
    await khoCong.agentAccessToken.updateMany({
      where: { clientId, revokedAt: null },
      data: { revokedAt: now },
    });
    await writeAudit({
      actor: { id: null, name: "Cổng dữ liệu agent (tự khoá)" },
      module: "agent-gateway",
      entityType: "AgentClient",
      entityId: clientId,
      action: "AUTO_SUSPEND",
      newValues: { status: "SUSPENDED", lyDo },
      reason: MO_TA[lyDo],
    });
    const nhan = await nguoiNhanBao(now);
    if (nhan.length > 0) {
      const client = await khoCong.agentClient.findUnique({ where: { id: clientId }, select: { name: true } });
      await notifyStaff({
        userIds: nhan,
        // Theo LƯỢT khoá (mốc thời gian), không theo ngày: khoá → mở → bị khoá lại trong cùng
        // ngày là một sự việc MỚI, phải báo lại. Chống trùng vẫn giữ nhờ `updateMany` ở trên
        // chỉ cho đúng một lượt chuyển ACTIVE→SUSPENDED đi tới đây.
        dedupeKey: `agent-gateway.tu-khoa:${clientId}:${now.toISOString()}`,
        title: `Agent "${client?.name ?? clientId}" đã bị tự khoá`,
        body: `Lý do: ${MO_TA[lyDo]}. Mọi token của agent đã bị thu hồi. Kiểm tra nhật ký gọi trước khi mở lại.`,
        href: "/cong-du-lieu-agent?tab=ung-dung",
        entityId: clientId,
        reopen: true,
      });
    }
    return true;
  } catch (e) {
    console.error("[agent-gateway] tự khoá lỗi", { clientId, lyDo, loi: e instanceof Error ? e.name : "?" });
    return false;
  }
}
