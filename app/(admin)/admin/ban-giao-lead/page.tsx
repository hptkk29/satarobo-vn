import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/auth/permissions";
import { checkPermission } from "@/lib/auth/check-permission";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import { HandoverForm } from "./_components/handover-form";
import { PageHelp } from "@/components/admin/ui/page-help";
import type { LeadStatus } from "@prisma/client";

export const metadata = { title: "Bàn giao lead | Admin" };
export const dynamic = "force-dynamic";

// Trạng thái được phép bàn giao. Khai kiểu LeadStatus[] có chủ ý: prop nhận string[]
// nên trước đây mảng này KHÔNG được kiểm kiểu — đổi tên enum ở GĐ5 không làm tsc đỏ
// một dòng nào, màn hình chỉ lặng lẽ hiện 9 ô trọn lọc ra 0 lead.
//
// GĐ5 — 9 giá trị cũ gộp còn 7: NEW+ASSIGNED → MOI ("đã phân công" nay đọc từ
// assignedToId), CONTACTED+NO_ANSWER → DA_LIEN_HE ("không nghe máy" là thuộc tính của
// LẦN GỌI, không phải của lead).
//
// ⚠️ Danh sách này VẪN thiếu DANG_HOC_THU (trước là TRIAL_IN_PROGRESS) — giữ nguyên
// thiếu sót có sẵn từ bản cũ, KHÔNG tự thêm ở đợt đổi tên này.
const LEAD_STATUSES: LeadStatus[] = [
  "MOI",
  "DA_LIEN_HE",
  "DANG_TU_VAN",
  "DA_HEN_HOC_THU",
  "DA_HOC_THU",
  "CHO_QUYET_DINH",
  "DANG_NUOI_DUONG",
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
      </PageHelp>

      <HandoverForm
        sales={saleOptions}
        statuses={LEAD_STATUSES}
        campaigns={campaignList}
      />
    </div>
  );
}
