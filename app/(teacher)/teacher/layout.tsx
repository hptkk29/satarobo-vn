// app/(teacher)/teacher/layout.tsx — L5: khung site giáo viên (giaovien.satarobo.vn).
// Phiếu BGĐ câu 7 (ký 04/07/2026) duyệt "làm riêng cho giáo viên" — đảo Doc 15 §0.
// Gate 3 tầng: (1) chưa login → /login; (2) flag TEACHER_SITE_ENABLED OFF → site
// chưa mở, về khu hiện tại (GV vẫn dùng admin — 2-phase, KHÔNG đá GV khỏi admin);
// (3) login nhưng KHÔNG có role TEACHER → về khu đúng của họ (staff → admin,
// PARENT → portal). UI: shadcn thuần — KHÔNG Magic UI/Framer/Recharts (ESLint chặn).
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasRole, hasStaffRole } from "@/lib/auth/permissions";
import { isTeacherSiteEnabled } from "@/lib/flags";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { Toaster } from "@/components/ui/sonner";
import { TeacherNav } from "./_components/teacher-nav";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Giáo viên | Sata Robo",
  robots: { index: false, follow: false },
};

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // 2-phase: flag OFF → site GV chưa mở. GV (và mọi staff) tiếp tục làm việc
  // trên admin như hiện tại; PARENT về portal. Bật flag khi L6 đủ tính năng.
  if (!isTeacherSiteEnabled()) {
    redirect(hasStaffRole(session.user) ? "/dashboard" : "/portal");
  }

  // Gate role: site GV chỉ cho user CÓ role TEACHER (kể cả kiêm nhiệm đa vai trò).
  if (!hasRole(session.user, "TEACHER")) {
    redirect(hasStaffRole(session.user) ? "/dashboard" : "/portal");
  }

  // Liveness (defense-in-depth như admin layout): disable user / soft-delete /
  // bump tokenVersion → logout ngay request kế tiếp. User ∈ SCOPE_EXEMPT
  // (identity đọc toàn cục) nên scopedDb không lọc — vẫn đi qua cổng scopedDb
  // theo chuẩn site mới (A0-04, ESLint chặn @/lib/db trần trong app/(teacher)).
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const dbUser = await sdb.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true, tokenVersion: true, deletedAt: true },
  });
  if (!dbUser || dbUser.deletedAt) redirect("/login?reason=session-invalidated");
  if (!dbUser.isActive) redirect("/login?reason=session-disabled");
  if (dbUser.tokenVersion !== session.user.tokenVersion) {
    redirect("/login?reason=session-invalidated");
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-baseline gap-1 text-lg font-bold">
            <span className="bg-gradient-to-r from-orange-500 to-purple-700 bg-clip-text text-transparent">
              Sata
            </span>
            <span className="bg-gradient-to-r from-purple-700 to-orange-500 bg-clip-text text-transparent">
              Robo
            </span>
            <span className="ml-1 text-xs font-normal text-neutral-400">
              Giáo viên
            </span>
          </div>
          <span className="truncate text-sm text-neutral-500">
            {session.user.name ?? session.user.email}
          </span>
        </div>
        <TeacherNav />
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

      <Toaster richColors position="top-right" />
    </div>
  );
}
