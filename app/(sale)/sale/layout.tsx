// app/(sale)/sale/layout.tsx — Đợt B: khung site Sale (sale.satarobo.vn).
//
// Chốt Q11 (21/08/2026): Sale Hub là **site riêng**; biểu mẫu nhập khách đang ở
// host này sẽ dời sang `satarobo.vn/nhap-khach-hang` (đợt F).
//
// Gate 3 tầng, soi chiếu `app/(teacher)/teacher/layout.tsx`:
//   (1) chưa đăng nhập → /login
//   (2) cờ SALE_SITE_ENABLED OFF → site chưa mở, về khu hiện tại (Sale vẫn dùng
//       admin như hôm nay — 2 pha, KHÔNG đá ai khỏi admin)
//   (3) đã đăng nhập nhưng KHÔNG phải Sale THUẦN → về khu đúng của họ
//
// ⚠️ Vì sao "Sale THUẦN" chứ không phải "có vai Sale" (QĐ-3, 16/07/2026): quản lý
// cơ sở kiêm Sale mà bị nhốt trong site hẹp này thì mất toàn bộ quyền quản lý.
// Cùng lý do với `isTeacherOnly` của site giáo viên.
//
// UI: shadcn thuần — KHÔNG Magic UI / Framer Motion / Recharts (ESLint chặn khối
// `app/(sale)/**` trong `eslint.config.mjs`).
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasRole, hasStaffRole } from "@/lib/auth/permissions";
import { isSaleSiteEnabled } from "@/lib/flags";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tư vấn tuyển sinh | Sata Robo",
  robots: { index: false, follow: false },
};

/** Sale THUẦN = vai nhân sự duy nhất là SALES_CSM. Khớp `isSaleOnly` của route-policy. */
function isSaleOnly(user: Parameters<typeof hasRole>[0]): boolean {
  if (!hasRole(user, "SALES_CSM")) return false;
  const roles = ((user as { roles?: string[] }).roles ?? []).filter(
    (r) => r !== "PARENT",
  );
  return roles.length > 0 && roles.every((r) => r === "SALES_CSM");
}

export default async function SaleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // 2 pha: cờ OFF → site Sale chưa mở. Mọi người tiếp tục làm việc như hôm nay.
  if (!isSaleSiteEnabled()) {
    redirect(hasStaffRole(session.user) ? "/dashboard" : "/portal");
  }

  if (!isSaleOnly(session.user)) {
    redirect(hasStaffRole(session.user) ? "/dashboard" : "/portal");
  }

  // Liveness (phòng thủ nhiều lớp như admin/teacher layout): vô hiệu hoá tài
  // khoản / xoá mềm / bump tokenVersion → đăng xuất ngay request kế tiếp.
  // `User` ∈ SCOPE_EXEMPT nên scopedDb không lọc — vẫn đi qua cổng scopedDb theo
  // chuẩn site mới (ESLint chặn `@/lib/db` trần trong `app/(sale)`).
  const actor = await resolveActor(session.user.id);
  const dbUser = await scopedDb(actor).user.findUnique({
    where: { id: session.user.id },
    select: {
      isActive: true,
      tokenVersion: true,
      deletedAt: true,
      mustChangePassword: true,
    },
  });
  if (!dbUser || dbUser.deletedAt) redirect("/dang-xuat?reason=session-invalidated");
  if (!dbUser.isActive) redirect("/dang-xuat?reason=session-disabled");
  if (dbUser.tokenVersion !== session.user.tokenVersion) {
    redirect("/dang-xuat?reason=session-invalidated");
  }
  // Mật khẩu do admin cấp/reset: bắt đổi trước khi dùng site.
  // `/doi-mat-khau` nằm ở `app/(auth)` (ngoài layout này) → không vòng lặp.
  if (dbUser.mustChangePassword) redirect("/doi-mat-khau");

  return (
    <div className="sale-root min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-sm font-semibold">Sata Robo · Tư vấn tuyển sinh</span>
          <span className="text-sm text-muted-foreground">
            {session.user.name ?? session.user.email}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
