import { redirect } from "next/navigation";
import { ClipboardEdit } from "lucide-react";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/auth/permissions";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { centerWhereManagedByRole } from "@/lib/auth/managed-centers";
import { scopedDb } from "@/lib/db-scope";
import { canAdjustTimesheet } from "@/lib/attendance/adjust";
import { getSetting } from "@/lib/settings/service";
import { ReviewRow, type ReviewItem } from "./_components/review-row";
import { PageHelp } from "@/components/admin/ui/page-help";

export const metadata = { title: "Duyệt chỉnh công | Admin" };
export const dynamic = "force-dynamic";

export default async function ChinhCongPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isSuper = hasRole(session.user, "SUPER_ADMIN");
  const isCM = hasRole(session.user, "CENTER_MANAGER");

  // Giá trị truyền vào `checkPermission` KHÔNG đổi: biểu thức cũ
  // `centerScope ?? session.user.centerId ?? null` luôn rút gọn về đúng vế này.
  if (
    !(await checkPermission("hr_attendance:adjust", {
      centerId: session.user.centerId ?? null,
    }))
  ) {
    redirect("/dashboard");
  }

  // Cách ly cơ sở (A0-04): TimesheetAdjustmentRequest ∈ SCOPED_MODELS → đọc qua scopedDb.
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  // ── A-01-6d (26/08/2026) — DANH SÁCH phải đo cùng thước với cổng DUYỆT ────────────
  // `reviewAdjustmentRequest` (./_actions.ts) đã chuyển sang
  // `roleManagesCenter(actor, "CENTER_MANAGER", req.centerId)`, còn trang này — trang DUY
  // NHẤT gọi nó — vẫn lọc `session.user.centerId`, một cơ sở neo chụp lúc đăng nhập. QLCS
  // giữ CS1+CS2 không thấy yêu cầu của CS2 ⇒ nó nằm PENDING vô thời hạn dù server đã sẵn
  // sàng cho duyệt.
  //
  // ⚠️ GIỮ NGUYÊN việc yêu cầu chưa gắn cơ sở (`centerId` null) không hiện ở đây: hành vi
  // cũ đã vậy (`centerId: "cs-1"` loại hết dòng null). Cổng duyệt cố ý không chặn nhóm đó
  // (vế `req.centerId &&`) nhưng đó là chuyện của cổng, không phải lý do nới danh sách.
  const rows = await sdb.timesheetAdjustmentRequest.findMany({
    where: {
      status: "PENDING",
      ...(isCM && !isSuper ? centerWhereManagedByRole(actor, "CENTER_MANAGER") : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = userIds.length
    ? await sdb.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          name: true,
          email: true,
          center: { select: { name: true } },
        },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const now = new Date();
  const editWindowDays = await getSetting("shift.managerEditWindowDays");
  const items: ReviewItem[] = rows.map((r) => {
    const u = userMap.get(r.userId);
    const gate = canAdjustTimesheet(
      { isSuperAdmin: isSuper, isCenterManager: isCM, workDate: r.date, now },
      editWindowDays,
    );
    return {
      id: r.id,
      userName: u?.name ?? u?.email ?? "(không tên)",
      centerName: u?.center?.name ?? null,
      date: r.date.toISOString(),
      reason: r.reason,
      requested: r.requested,
      createdAt: r.createdAt.toISOString(),
      locked: !gate.ok,
      lockReason: gate.ok ? null : gate.reason,
    };
  });

  return (
    <div className="max-w-3xl p-6">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <ClipboardEdit className="h-6 w-6 text-primary" /> Duyệt chỉnh công
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Duyệt đề nghị chỉnh giờ công
        </p>
      </div>

      <PageHelp>
        <p>
          Quản lý cơ sở duyệt trong vòng 2 ngày kể từ ngày công; admin cấp cao
          duyệt mọi lúc. Duyệt có nhập giờ → áp chỉnh + ghi log.
        </p>
      </PageHelp>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Không có yêu cầu chỉnh công nào chờ duyệt.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <ReviewRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
