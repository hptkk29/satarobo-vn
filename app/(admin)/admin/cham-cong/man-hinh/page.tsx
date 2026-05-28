import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { QrScreen } from "./_components/qr-screen";

export const metadata = { title: "Màn hình chấm công | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ centerId?: string }>;
}

export default async function ManHinhPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "hr_attendance:view")) redirect("/dashboard");

  const { centerId } = await searchParams;
  const centers = await db.center.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { displayOrder: "asc" },
  });
  const active = centers.find((c) => c.id === centerId);

  return (
    <div className="min-h-screen bg-neutral-100 p-6">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Link href="/cham-cong" className="text-sm text-neutral-500 hover:text-neutral-700">
            ← Bảng chấm công
          </Link>
          <div className="flex flex-wrap gap-2">
            {centers.map((c) => (
              <Link
                key={c.id}
                href={`/cham-cong/man-hinh?centerId=${c.id}`}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  active?.id === c.id
                    ? "bg-orange-500 text-white"
                    : "bg-white text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {c.name}
              </Link>
            ))}
          </div>
        </div>

        {active ? (
          <QrScreen centerId={active.id} centerName={active.name} />
        ) : (
          <p className="rounded-2xl bg-white p-10 text-center text-sm text-neutral-400">
            Chọn cơ sở để hiển thị mã QR chấm công.
          </p>
        )}
      </div>
    </div>
  );
}
