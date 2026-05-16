import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  BulkAuditForm,
  type AuditRowInit,
} from "../../_components/bulk-audit-form";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["SUPER_ADMIN", "MANAGER", "ACCOUNTANT"];

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditAuditPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    redirect("/admin/dashboard?error=unauthorized");
  }

  const { id } = await params;

  const audit = await db.inventoryAudit.findUnique({
    where: { id },
    include: {
      center: { select: { id: true, name: true } },
      items: true,
    },
  });
  if (!audit) notFound();
  if (audit.status !== "DRAFT") {
    redirect(`/admin/inventory/audit/${id}`);
  }

  // Load every active item + this center's current balance.
  const items = await db.inventoryItem.findMany({
    where: { isActive: true },
    include: {
      balances: {
        where: { centerId: audit.centerId },
        select: { quantity: true },
      },
    },
    orderBy: [{ category: "asc" }, { itemCode: "asc" }],
  });

  // Map any existing draft lines to preserve user input across reloads.
  const existing = new Map(audit.items.map((line) => [line.itemId, line]));

  const rows: AuditRowInit[] = items.map((item) => {
    const draftLine = existing.get(item.id);
    const currentQty = item.balances[0]?.quantity ?? 0;
    return {
      itemId: item.id,
      itemCode: item.itemCode,
      itemName: item.name,
      unit: item.unit,
      category: item.category,
      previousQty: draftLine?.previousQty ?? currentQty,
      actualQty: draftLine?.actualQty ?? currentQty,
      reason: draftLine?.reason ?? "",
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin/inventory/audit"
          className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
        </Link>
        <h1 className="text-2xl font-bold text-neutral-900">
          Kiểm kê:{" "}
          <span className="font-bold text-orange-600">
            {audit.center.name}
          </span>
        </h1>
        {audit.notes && (
          <p className="mt-1 text-sm text-neutral-500">{audit.notes}</p>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Chưa có mặt hàng active nào. Tạo / kích hoạt mặt hàng trước tại{" "}
          <Link
            href="/admin/inventory/items"
            className="font-semibold underline hover:text-amber-900"
          >
            /admin/inventory/items
          </Link>
          .
        </div>
      ) : (
        <BulkAuditForm
          auditId={audit.id}
          centerName={audit.center.name}
          auditCode={audit.auditCode}
          rows={rows}
        />
      )}
    </div>
  );
}
