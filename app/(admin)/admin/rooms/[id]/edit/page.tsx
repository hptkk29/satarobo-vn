import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveActor } from "@/lib/auth/actor";
import { getSelectableOrgUnits } from "@/lib/org/org-service";
import { RoomForm } from "../../_components/room-form";
import { DeleteRoomButton } from "../../_components/delete-button";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function EditRoomPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect("/login");
  const actor = await resolveActor(session.user.id);

  // Room = vị trí vật lý → chỉ chọn CENTER, loại HO (Hội sở không có phòng học).
  const [room, orgUnits] = await Promise.all([
    db.room.findUnique({ where: { id } }),
    getSelectableOrgUnits(actor, { types: ["CENTER"] }),
  ]);

  if (!room) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/rooms"
            className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
          >
            <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
          </Link>
          <h1 className="text-3xl font-black text-neutral-900">
            Sửa phòng:{" "}
            <span className="font-mono text-orange-600">{room.code}</span>{" "}
            <span className="font-bold text-neutral-700">— {room.name}</span>
          </h1>
        </div>
        <DeleteRoomButton id={room.id} name={`${room.code} — ${room.name}`} />
      </div>

      <RoomForm
        room={{
          id: room.id,
          name: room.name,
          code: room.code,
          orgUnitId: room.orgUnitId,
          capacity: room.capacity,
          equipment: room.equipment,
          status: room.status,
          notes: room.notes,
          displayOrder: room.displayOrder,
        }}
        orgUnits={orgUnits.map((o) => ({ id: o.orgUnitId, name: o.name }))}
      />
    </div>
  );
}
