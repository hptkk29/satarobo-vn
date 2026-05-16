import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { HolidayForm } from "../../_components/holiday-form";
import { DeleteHolidayButton } from "../../_components/delete-button";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function EditHolidayPage({ params }: Props) {
  const { id } = await params;

  const [holiday, centers] = await Promise.all([
    db.holiday.findUnique({ where: { id } }),
    db.center.findMany({
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  if (!holiday) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/admin/holidays"
            className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
          >
            <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
          </Link>
          <h1 className="text-3xl font-black text-neutral-900">
            Sửa ngày nghỉ:{" "}
            <span className="font-bold text-orange-600">{holiday.name}</span>
          </h1>
        </div>
        <DeleteHolidayButton id={holiday.id} name={holiday.name} />
      </div>

      <HolidayForm
        holiday={{
          id: holiday.id,
          name: holiday.name,
          date: holiday.date,
          endDate: holiday.endDate,
          centerId: holiday.centerId,
          type: holiday.type,
          note: holiday.note,
        }}
        centers={centers}
      />
    </div>
  );
}
