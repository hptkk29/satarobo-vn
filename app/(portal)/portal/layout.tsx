import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { hasStaffRole } from "@/lib/auth/permissions";
import { getPortalContext } from "@/lib/portal/session";
import { hotlinesInline } from "@/lib/locations";
import { getParentNotificationCount } from "@/lib/portal/notifications";
import { getParentNotificationBadge } from "@/lib/portal/notification-feed";
import { countUnreadForParent } from "@/lib/conversation/service";
import { isEvalV2Enabled, isPortalV2Enabled } from "@/lib/flags";
import { SiteSwitcher } from "./_components/site-switcher";
import { PortalNav } from "./_components/portal-nav";
import { PortalV2Shell } from "@/components/portal/v2-shell";

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
  // Defense-in-depth: portal chỉ cho PARENT. Có BẤT KỲ vai trò nhân viên nào
  // (đa vai trò 3B) → đẩy về admin dashboard.
  if (hasStaffRole(session.user)) redirect("/dashboard");

  const ctx = await getPortalContext();
  // ctx luôn khác null vì role PARENT, nhưng guard cho chắc.
  const children_ = ctx?.children ?? [];

  // Portal v2 (merge SataUI) — shell phụ huynh mới (sidebar coral + topbar profile),
  // chạy SONG SONG shell cũ qua flag PORTAL_V2_ENABLED.
  if (isPortalV2Enabled()) {
    // Badge chuông v2 = unreadTotal của feed tổng hợp — CÙNG nguồn với badge
    // "Tất cả" trên trang Thông báo (tránh 2 con số lệch nhau). Bản badge có
    // cache 60s: layout KHÔNG fan-out full feed trên mọi page view.
    const [notifCount, msgCount] = await Promise.all([
      getParentNotificationBadge(session.user.id).catch(() => 0),
      countUnreadForParent(session.user.id).catch(() => 0),
    ]);
    return (
      <PortalV2Shell
        parentName={ctx?.parentName ?? session.user.name ?? "Phụ huynh"}
        parentEmail={session.user.email}
        notifCount={notifCount}
        msgCount={msgCount}
      >
        {children_.length === 0 ? (
          // Chưa liên kết học viên: KHÔNG render page (page gọi
          // requireActiveStudent → redirect "/" → rewrite /portal = vòng lặp
          // vô hạn trên host portal). Giữ empty-state như shell cũ.
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Tài khoản chưa được liên kết với học viên nào. Vui lòng liên hệ
              trung tâm Sata Robo ({hotlinesInline()}) để được hỗ trợ.
            </p>
          </div>
        ) : (
          children
        )}
      </PortalV2Shell>
    );
  }

  const [notifCount, msgCount] = await Promise.all([
    getParentNotificationCount(session.user.id).catch(() => 0),
    countUnreadForParent(session.user.id).catch(() => 0),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
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
      </header>

      {children_.length === 0 ? (
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
            <p className="text-sm text-neutral-500">
              Tài khoản chưa được liên kết với học viên nào. Vui lòng liên hệ
              trung tâm Sata Robo ({hotlinesInline()}) để được hỗ trợ.
            </p>
          </div>
        </main>
      ) : (
        // Sidebar DỌC + nội dung: desktop 2 cột, mobile xếp dọc (nav thu gọn "Menu").
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6 lg:flex-row lg:gap-6">
          <PortalNav notifCount={notifCount} msgCount={msgCount} evalV2Enabled={isEvalV2Enabled()} />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      )}
    </div>
  );
}
