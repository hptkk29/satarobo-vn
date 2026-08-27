import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { nguoiCoTheGan } from "@/lib/crm/commission-assignee-store";
import { CenterForm } from "../../_components/center-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditCenterPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Center ∈ SCOPE_EXEMPT → sdb pass-through (hành vi y nguyên); gate sửa/xoá nằm ở
  // server actions (`centers:edit`).
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const { id } = await params;
  const center = await sdb.center.findUnique({ where: { id } });
  if (!center) notFound();
  // 27/08 — danh sách tài khoản cho ô "Tài khoản quản lý cơ sở".
  const nguoiChon = await nguoiCoTheGan();

  return (
    <div>
      <h1 className="mb-6 text-3xl font-black text-foreground">
        Sửa cơ sở: <span className="font-bold text-primary">{center.name}</span>
      </h1>
      <CenterForm
        nguoiChon={nguoiChon}
        center={{
          id: center.id,
          name: center.name,
          slug: center.slug,
          address: center.address,
          ward: center.ward,
          district: center.district,
          city: center.city,
          phone: center.phone,
          email: center.email,
          googleMapUrl: center.googleMapUrl,
          workingHours: center.workingHours,
          managerName: center.managerName,
          managerUserId: center.managerUserId,
          logoUrl: center.logoUrl,
          bannerUrl: center.bannerUrl,
          description: center.description,
          isActive: center.isActive,
          displayOrder: center.displayOrder,
          latitude: center.latitude,
          longitude: center.longitude,
          allowedRadiusMeters: center.allowedRadiusMeters,
        }}
      />
    </div>
  );
}
