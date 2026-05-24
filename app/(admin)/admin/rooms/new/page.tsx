import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { RoomForm } from "../_components/room-form";

export const dynamic = "force-dynamic";

export default async function NewRoomPage() {
  const centers = await db.center.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true },
  });

  if (centers.length === 0) {
    return (
      <div className="max-w-3xl">
        <Link
          href="/rooms"
          className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
        </Link>
        <h1 className="mb-4 text-3xl font-black text-neutral-900">Thêm phòng học</h1>
        <div className="rounded-xl border-2 border-dashed border-orange-300 bg-orange-50 p-8 text-center">
          <p className="font-semibold text-neutral-900">Chưa có cơ sở nào đang hoạt động.</p>
          <p className="mt-1 text-sm text-neutral-600">
            Tạo ít nhất 1 cơ sở (Active) trước khi thêm phòng.
          </p>
          <Link
            href="/centers/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600"
          >
            Thêm cơ sở →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/rooms"
        className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
      >
        <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
      </Link>
      <h1 className="mb-6 text-3xl font-black text-neutral-900">Thêm phòng học</h1>
      <RoomForm centers={centers} />
    </div>
  );
}
