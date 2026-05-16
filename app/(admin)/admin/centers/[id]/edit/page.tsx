import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { CenterForm } from "../../_components/center-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditCenterPage({ params }: Props) {
  const { id } = await params;
  const center = await db.center.findUnique({ where: { id } });
  if (!center) notFound();

  return (
    <div>
      <h1 className="mb-6 text-3xl font-black text-neutral-900">
        Sửa cơ sở: <span className="font-bold text-orange-600">{center.name}</span>
      </h1>
      <CenterForm
        center={{
          id: center.id,
          name: center.name,
          address: center.address,
          phone: center.phone,
          email: center.email,
          isActive: center.isActive,
        }}
      />
    </div>
  );
}
