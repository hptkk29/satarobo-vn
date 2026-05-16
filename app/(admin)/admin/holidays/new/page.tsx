import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { HolidayForm } from "../_components/holiday-form";

export const dynamic = "force-dynamic";

export default async function NewHolidayPage() {
  const centers = await db.center.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  return (
    <div>
      <Link
        href="/admin/holidays"
        className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
      >
        <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
      </Link>
      <h1 className="mb-6 text-3xl font-black text-neutral-900">Thêm ngày nghỉ</h1>
      <HolidayForm centers={centers} />
    </div>
  );
}
