import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  ItemForm,
  type BalanceRow,
  type ItemFormValue,
} from "../../_components/item-form";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditInventoryItemPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "inventory:edit")) {
    redirect("/dashboard?error=unauthorized");
  }

  const { id } = await params;

  const [item, balances, allCenters] = await Promise.all([
    db.inventoryItem.findUnique({ where: { id } }),
    db.stockBalance.findMany({
      where: { itemId: id },
      include: { center: { select: { name: true, displayOrder: true } } },
      orderBy: { center: { displayOrder: "asc" } },
    }),
    db.center.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { displayOrder: "asc" },
    }),
  ]);

  if (!item) notFound();

  const formValue: ItemFormValue = {
    id: item.id,
    itemCode: item.itemCode,
    name: item.name,
    description: item.description,
    category: item.category,
    unit: item.unit,
    pricePerUnit: item.pricePerUnit,
    supplier: item.supplier,
    defaultMinThreshold: item.defaultMinThreshold,
    imageUrl: item.imageUrl,
    tags: item.tags,
    isActive: item.isActive,
    notes: item.notes,
  };

  const balanceRows: BalanceRow[] = balances.map((b) => ({
    id: b.id,
    centerId: b.centerId,
    centerName: b.center.name,
    quantity: b.quantity,
    reserved: b.reserved,
    minThreshold: b.minThreshold,
  }));

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/inventory/items"
          className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại kho
        </Link>
        <h1 className="text-2xl font-bold text-neutral-900">
          Sửa mặt hàng:{" "}
          <span className="font-bold text-orange-600">{item.name}</span>
        </h1>
        <p className="mt-1 text-sm text-neutral-500 tabular-nums">{item.itemCode}</p>
      </div>

      <ItemForm
        item={formValue}
        balances={balanceRows}
        allCenters={allCenters}
      />
    </div>
  );
}
