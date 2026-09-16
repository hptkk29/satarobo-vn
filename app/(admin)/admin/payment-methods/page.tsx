import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, CreditCard } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { Button } from "@/components/ui/button";
import { PaymentMethodsTable } from "./_components/payment-methods-table";

export const metadata = { title: "Phương thức thanh toán | Admin" };
export const dynamic = "force-dynamic";

export default async function PaymentMethodsPage({
  searchParams,
}: {
  searchParams: Promise<{ centerId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Gate mức màn hình gọi trần; quyền đụng từng dòng do scopedDb (đọc) + passesScope
  // (ghi, trong _actions.ts) lo — xem ghi chú ở requirePaymentsManage.
  if (!(await checkPermission("payments:manage"))) {
    redirect("/dashboard?error=unauthorized");
  }

  // 30/08/2026 — PaymentMethod ∈ SCOPED_MODELS ∩ NULL_IS_GLOBAL_MODELS. Câu findMany
  // dưới đây KHÔNG cần thêm `where` nào: scopedDb tự chèn
  // `OR: [{ centerId: null }, { centerId: { in: visibleCenterIds } }]`, tức người cấp
  // cơ sở thấy phương thức của cơ sở mình + các phương thức dùng chung, KHÔNG thấy của
  // cơ sở khác. Hội sở / SUPER_ADMIN thấy toàn bộ.
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  // Bộ lọc theo cơ sở — đường vào từ trang Cơ sở ("Quản lý phương thức thanh toán →").
  // "Chỉ cơ sở X" nghĩa là phương thức RIÊNG của X *cộng* các phương thức dùng chung:
  // đó mới đúng bộ mà người tạo đơn cho cơ sở X thực sự chọn được. Lọc `centerId: X`
  // trần sẽ giấu mất tiền mặt/cổng online và làm màn này nói dối về thứ đang có.
  const { centerId: rawFilter } = await searchParams;
  const centerFilter = rawFilter?.trim() || null;
  const filterWhere = centerFilter
    ? { OR: [{ centerId: null }, { centerId: centerFilter }] }
    : {};

  const [methods, centers] = await Promise.all([
    sdb.paymentMethod.findMany({
      where: filterWhere,
      orderBy: [{ centerId: "asc" }, { displayOrder: "asc" }, { name: "asc" }],
    }),
    // Center ∈ SCOPE_EXEMPT → không tự lọc; ở đây chỉ cần map id→tên để hiển thị nên
    // lấy hết là đúng (không lộ gì: tên cơ sở vốn công khai trên trang Liên hệ).
    sdb.center.findMany({ select: { id: true, name: true } }),
  ]);
  const centerNames = Object.fromEntries(centers.map((c) => [c.id, c.name]));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Phương thức thanh toán
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Quản lý các phương thức thanh toán: tiền mặt, chuyển khoản,
              gateway online. Phương thức gắn cơ sở CHỈ hiện ở đơn của cơ sở đó.
            </p>
          </div>
        </div>
        <Link href="/payment-methods/new">
          <Button>
            <Plus className="h-4 w-4" />
            Thêm phương thức
          </Button>
        </Link>
      </div>

      {centerFilter && (
        // Bộ lọc đến từ URL nên KHÔNG có ô nào trên màn cho thấy nó đang bật — không có
        // dòng này thì người dùng đọc bảng thiếu dòng và tưởng dữ liệu bị mất.
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Đang lọc theo cơ sở:</span>
          <span className="font-semibold text-foreground">
            {centerNames[centerFilter] ?? centerFilter}
          </span>
          <span className="text-xs text-muted-foreground">
            (gồm cả phương thức dùng chung)
          </span>
          <Link
            href="/payment-methods"
            className="ml-auto font-semibold text-primary underline-offset-2 hover:underline"
          >
            Bỏ lọc
          </Link>
        </div>
      )}

      <PaymentMethodsTable methods={methods} centerNames={centerNames} />
    </div>
  );
}
