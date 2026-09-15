import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { getModelVisibleCenterIds, scopedDb } from "@/lib/db-scope";
import { NGUONG_NGUOI_MAC_DINH } from "@/lib/lead/lead-nguoi";
import { timLeadNguoi } from "@/lib/lead/nguoi-service";
import { BangLeadNguoi } from "./_components/bang-lead-nguoi";

export const dynamic = "force-dynamic";

/**
 * LEAD NGUỘI — khách chưa chốt mà lâu rồi không ai chăm.
 *
 * Yêu cầu 15/09/2026 của chủ dự án. Khác màn Bàn giao lead ở chỗ nó quét TOÀN BỘ tư vấn viên
 * cùng lúc, nên quản lý nhìn ra bức tranh "ai đang ôm lead mà không chăm" thay vì phải mở
 * từng người một.
 */
export default async function LeadNguoiPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Trạng thái "không có quyền" là màn hạng nhất ở hệ này (DESIGN.md §5) — nói rõ thiếu
  // quyền nào và hỏi ai, chứ không đá về dashboard cho người dùng tự đoán.
  if (!(await checkPermission("leads:assign"))) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">Bạn chưa có quyền xem trang này</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Trang này cần quyền <b className="text-foreground">phân công lead</b> (
          <code className="rounded bg-muted px-1 py-0.5 text-xs">leads:assign</code>) — thường
          chỉ Quản lý cơ sở và Quản trị hệ thống mới có. Cần dùng thì nhờ quản trị hệ thống cấp
          quyền giúp.
        </p>
      </div>
    );
  }

  const actor = await resolveActor(session.user.id);
  const visibleCenterIds = getModelVisibleCenterIds("Lead", actor);
  const now = new Date();

  const [{ tong, dong }, coSo, saleList] = await Promise.all([
    timLeadNguoi({ now, nguongNgay: NGUONG_NGUOI_MAC_DINH, visibleCenterIds }),
    scopedDb(actor).center.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { code: "asc" },
    }),
    // Danh sách người có thể nhận — dùng cho nhánh "giao đích danh".
    scopedDb(actor).user.findMany({
      where: { isActive: true, deletedAt: null, roles: { has: "SALES_CSM" } },
      select: { id: true, name: true, email: true, centerId: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <BangLeadNguoi
      tongBanDau={tong}
      dongBanDau={dong}
      nguongBanDau={NGUONG_NGUOI_MAC_DINH}
      coSo={coSo.map((c) => ({ id: c.id, ten: c.name, ma: c.code ?? "—" }))}
      nguoiNhan={saleList.map((u) => ({
        id: u.id,
        ten: u.name ?? u.email ?? "(không tên)",
        centerId: u.centerId,
      }))}
    />
  );
}
