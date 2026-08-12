import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { QrScreen } from "./_components/qr-screen";

export const metadata = { title: "Màn hình chấm công | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ centerId?: string }>;
}

export default async function ManHinhPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { centerId } = await searchParams;
  if (!(await checkPermission("hr_attendance:view", { centerId: centerId ?? session.user.centerId ?? null }))) {
    redirect("/dashboard");
  }
  const sdb = scopedDb(await resolveActor(session.user.id));
  const centers = await sdb.center.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { displayOrder: "asc" },
  });
  const active = centers.find((c) => c.id === centerId);

  return (
    <div className="min-h-screen bg-muted p-6">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Link href="/cham-cong" className="text-sm text-muted-foreground hover:text-foreground">
            ← Bảng chấm công
          </Link>
          <div className="flex flex-wrap gap-2">
            {centers.map((c) => (
              <Link
                key={c.id}
                href={`/cham-cong/man-hinh?centerId=${c.id}`}
                className={`rounded-full px-3 py-1 text-xs font-medium ${ active?.id === c.id ? "bg-primary text-white" : "bg-card text-muted-foreground hover:bg-muted" }`}
              >
                {c.name}
              </Link>
            ))}
          </div>
        </div>

        {active ? (
          <QrScreen centerId={active.id} centerName={active.name} />
        ) : (
          <p className="rounded-2xl bg-card p-10 text-center text-sm text-muted-foreground">
            Chọn cơ sở để hiển thị mã QR chấm công.
          </p>
        )}
      </div>
    </div>
  );
}
