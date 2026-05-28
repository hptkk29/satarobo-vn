import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getPortalContext } from "@/lib/portal/session";
import { SiteSwitcher } from "./_components/site-switcher";
import { PortalNav } from "./_components/portal-nav";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Cổng học viên | Sata Robo",
  robots: { index: false, follow: false },
};

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "PARENT") redirect("/login");

  const ctx = await getPortalContext();
  // ctx luôn khác null vì role PARENT, nhưng guard cho chắc.
  const children_ = ctx?.children ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/portal" className="text-lg font-bold">
            <span className="bg-gradient-to-r from-orange-500 to-purple-700 bg-clip-text text-transparent">
              Sata
            </span>
            <span className="bg-gradient-to-r from-purple-700 to-orange-500 bg-clip-text text-transparent">
              Robo
            </span>
            <span className="ml-1 text-xs font-normal text-neutral-400">
              Học viên
            </span>
          </Link>
          <SiteSwitcher
            kids={children_.map((c) => ({
              id: c.id,
              name: c.name,
              studentCode: c.studentCode,
            }))}
            activeId={ctx?.activeStudent?.id ?? null}
          />
        </div>
        {children_.length > 0 && (
          <div className="mx-auto max-w-4xl px-4 pb-2">
            <PortalNav />
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        {children_.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
            <p className="text-sm text-neutral-500">
              Tài khoản chưa được liên kết với học viên nào. Vui lòng liên hệ
              trung tâm Sata Robo (0818823720) để được hỗ trợ.
            </p>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
