import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { listActiveCostCategories } from "@/lib/finance/cost";
import { getTeachingCenterIds } from "@/lib/org/org-service";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { CostEntryForm } from "./_components/cost-entry-form";
import { CostDecideButtons } from "./_components/cost-decide-buttons";

export const metadata = { title: "Sổ chi phí | Admin" };
export const dynamic = "force-dynamic";

const vnd = (n: number) => n.toLocaleString("vi-VN") + "₫";
const dmy = (d: Date) => d.toLocaleDateString("vi-VN");

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  VOID: "Đã huỷ",
};

export default async function CostBookPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // `costs:view` là cổng ĐỌC. Nhập/duyệt còn hai cổng riêng bên dưới — và Server Action
  // vẫn tự kiểm, gate ở trang chỉ để khỏi hiện nút vô dụng.
  if (!(await checkPermission("costs:view"))) redirect("/admin/dashboard");

  const [canManage, canApprove] = await Promise.all([
    checkPermission("costs:manage"),
    checkPermission("costs:approve"),
  ]);

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const isGlobalAllowed = actor.isSuperAdmin || actor.isHoLevel;

  const teachingIds = new Set(await getTeachingCenterIds());
  const [entries, categories, allCenters] = await Promise.all([
    sdb.costEntry.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        spentDate: true,
        amount: true,
        vendor: true,
        note: true,
        status: true,
        source: true,
        centerId: true,
        createdById: true,
        category: { select: { label: true, code: true } },
      },
      orderBy: [{ spentDate: "desc" }, { createdAt: "desc" }],
      take: 500,
    }),
    listActiveCostCategories(),
    sdb.center.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const centers = allCenters
    .filter((c) => teachingIds.has(c.id))
    .filter((c) => isGlobalAllowed || actor.visibleCenterIds.includes(c.id));
  const centerNames = new Map(allCenters.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-5 p-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Sổ chi phí</h1>
        <p className="text-sm text-muted-foreground">
          Khoản chi <strong>chỉ vào báo cáo sau khi được duyệt</strong>. Chi phí quảng cáo{" "}
          <strong>không nhập ở đây</strong> — nó đọc thẳng từ dữ liệu đồng bộ quảng cáo, nhập
          tay sẽ làm lợi nhuận bị trừ hai lần.
        </p>
      </div>

      {canManage ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Nhập khoản chi</h2>
            <Link
              href="/chi-phi/import"
              className="text-sm font-medium text-primary hover:underline"
            >
              Import từ Excel →
            </Link>
          </div>
          <CostEntryForm
            categories={categories.filter((c) => !c.isSystemFed)}
            centers={centers}
            allowCompanyLevel={isGlobalAllowed}
          />
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Các khoản chi gần đây</h2>
        <PhanTrangBang tenDonVi="khoản chi">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Ngày chi</th>
                <th className="py-2 pr-3">Đầu mục</th>
                <th className="py-2 pr-3">Phạm vi</th>
                <th className="py-2 pr-3">Nhà cung cấp</th>
                <th className="py-2 pr-3 text-right">Số tiền</th>
                <th className="py-2 pr-3">Trạng thái</th>
                <th className="py-2 pr-3">Nguồn</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    Chưa có khoản chi nào.
                  </td>
                </tr>
              )}
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-border/60">
                  <td className="py-2 pr-3 tabular-nums">{dmy(e.spentDate)}</td>
                  <td className="py-2 pr-3">{e.category.label}</td>
                  <td className="py-2 pr-3">
                    {e.centerId ? (centerNames.get(e.centerId) ?? "—") : "Cấp công ty"}
                  </td>
                  <td className="py-2 pr-3">{e.vendor ?? "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{vnd(e.amount)}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={
                        e.status === "APPROVED"
                          ? "text-emerald-700"
                          : e.status === "VOID"
                            ? "text-muted-foreground line-through"
                            : "text-amber-700"
                      }
                    >
                      {STATUS_LABEL[e.status] ?? e.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{e.source}</td>
                  <td className="py-2 pr-3">
                    {canApprove && e.status === "DRAFT" ? (
                      <CostDecideButtons
                        id={e.id}
                        // Người nhập không tự duyệt (QĐ-B5) — ẩn nút cho chính họ để khỏi
                        // bấm rồi nhận lỗi. Server vẫn chặn lại, gate UI không phải chốt chặn.
                        selfCreated={e.createdById === session.user.id}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PhanTrangBang>
      </section>
    </div>
  );
}
