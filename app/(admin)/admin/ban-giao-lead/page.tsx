import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/auth/permissions";
import { checkPermission } from "@/lib/auth/check-permission";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import { HandoverForm } from "./_components/handover-form";
import { PageHelp } from "@/components/admin/ui/page-help";

export const metadata = { title: "Bàn giao lead | Admin" };
export const dynamic = "force-dynamic";

// ⚠️ Phải có REGISTERED + ENROLLED: lead đã convert LUÔN mang `status = ENROLLED`, và đó
// chính là nhóm mang `Enrollment.saleId` + kênh chat riêng Sale↔PH. Thiếu 2 chip này thì
// không có cách nào nhắm đúng nhóm cần bàn giao nhất.
const LEAD_STATUSES = [
  "NEW",
  "ASSIGNED",
  "CONTACTED",
  "NO_ANSWER",
  "CONSULTING",
  "TRIAL_SCHEDULED",
  "TRIAL_ATTENDED",
  "AWAITING_DECISION",
  "NURTURING",
  "REGISTERED",
  "ENROLLED",
];

export default async function HandoverPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("leads:assign"))) redirect("/dashboard");

  const centerScope =
    hasRole(session.user, "CENTER_MANAGER") &&
    !hasRole(session.user, "SUPER_ADMIN")
      ? session.user.centerId
      : null;

  // Cách ly cơ sở: Lead ∈ SCOPED_MODELS → đọc qua scopedDb để chỉ thấy chiến dịch
  // của lead trong tầm nhìn cơ sở (SUPER_ADMIN/HO bypass → ALL). User là SCOPE_EXEMPT
  // (identity, đọc toàn cục) → sdb pass-through + lọc center thủ công như cũ.
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const [sales, campaigns] = await Promise.all([
    sdb.user.findMany({
      where: {
        roles: { has: "SALES_CSM" },
        deletedAt: null,
        ...(centerScope ? { centerId: centerScope } : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, isActive: true },
    }),
    sdb.lead.findMany({
      where: { utmCampaign: { not: null }, deletedAt: null },
      distinct: ["utmCampaign"],
      select: { utmCampaign: true },
      take: 100,
    }),
  ]);

  const saleOptions = sales.map((s) => ({
    id: s.id,
    label: (s.name ?? s.email ?? s.id) + (s.isActive ? "" : " (đã nghỉ)"),
  }));
  const campaignList = campaigns
    .map((c) => c.utmCampaign)
    .filter((x): x is string => !!x);

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Bàn giao lead</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chuyển lead của một sale sang sale khác
        </p>
      </div>

      <PageHelp>
        <p>
          Chuyển hàng loạt lead của một sale (vd khi nghỉ việc) sang sale khác.
          Có thể lọc theo trạng thái, chiến dịch, chỉ lead chưa đóng. Task đang
          mở cũng được chuyển. Ghi lịch sử + nhật ký kiểm toán; KHÔNG sửa tài
          khoản sale cũ.
        </p>
        <p className="mt-2">
          Với lead đã ghi danh (trạng thái ENROLLED), lượt bàn giao còn chuyển{" "}
          <strong>sale phụ trách của ghi danh</strong> và <strong>đóng kênh chat riêng</strong>{" "}
          giữa sale cũ với phụ huynh. Ghi danh ở cơ sở KHÁC sale nhận sẽ bị gỡ phân công
          (phải gán lại ở màn học viên của lớp) — số lượng hiện trong thông báo sau khi chạy.
        </p>
      </PageHelp>

      <HandoverForm
        sales={saleOptions}
        statuses={LEAD_STATUSES}
        campaigns={campaignList}
      />
    </div>
  );
}
