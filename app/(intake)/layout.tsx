// app/(intake)/layout.tsx — khung cho biểu mẫu nhập khách hàng nội bộ.
//
// 22/08/2026: biểu mẫu công khai `sale.satarobo.vn` NGHỈ; bản thay thế đứng ở
// `satarobo.vn/nhap-khach-hang` và **bắt buộc đăng nhập**.
//
// Vì sao là route group RIÊNG chứ không nằm trong `(public)` hay `(admin)`:
//   - `(public)` kéo theo header/footer/popup/CTA marketing — đây là công cụ
//     làm việc, không phải trang bán hàng, và nó `noindex`.
//   - `(admin)` sinh URL `/admin/...` và bị host `admin.satarobo.vn` chiếm; chủ
//     dự án chốt địa chỉ là `satarobo.vn/nhap-khach-hang` (một đường duy nhất,
//     người nhập không phải nhớ subdomain nào).
//
// Cổng 3 tầng, soi chiếu `app/(sale)/sale/layout.tsx`:
//   (1) chưa đăng nhập → /login (giữ callbackUrl để quay lại đúng đây)
//   (2) không có quyền `leads:create` → về khu đúng của họ
//   (3) tài khoản đã bị vô hiệu / đổi tokenVersion / bắt đổi mật khẩu → xử lý ngay
//
// UI: shadcn thuần — KHÔNG Magic UI / Framer Motion / Recharts (ESLint chặn khối
// `app/(intake)/**` trong `eslint.config.mjs`).
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { hasStaffRole } from "@/lib/auth/permissions";
import { checkAnyPermission } from "@/lib/auth/check-permission";
import { PAGE_GATES } from "@/lib/auth/page-gates";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Nhập khách hàng | Sata Robo",
  robots: { index: false, follow: false },
};

export default async function IntakeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fnhap-khach-hang");
  }

  if (!(await checkAnyPermission(PAGE_GATES["/nhap-khach-hang"]))) {
    redirect(hasStaffRole(session.user) ? "/dashboard?error=unauthorized" : "/portal");
  }

  // Liveness (phòng thủ nhiều lớp như admin/teacher/sale layout): vô hiệu hoá tài
  // khoản / xoá mềm / bump tokenVersion → đăng xuất ngay request kế tiếp.
  // `User` ∈ SCOPE_EXEMPT nên scopedDb không lọc — vẫn đi qua cổng scopedDb theo
  // chuẩn site mới (ESLint chặn `@/lib/db` trần trong `app/(intake)`).
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
  // Mật khẩu do admin cấp/reset: bắt đổi trước khi dùng.
  // `/doi-mat-khau` nằm ở `app/(auth)` (ngoài layout này) → không vòng lặp.
  if (dbUser.mustChangePassword) redirect("/doi-mat-khau");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4">
          <span className="text-sm font-semibold">Sata Robo · Nhập khách hàng</span>
          <span className="flex items-center gap-3 text-sm text-muted-foreground">
            {/* Trên host thật, `/leads` bị đá 308 sang admin.satarobo.vn —
                đúng chỗ danh sách khách đang sống. */}
            <Link href="/leads" className="font-medium text-primary hover:underline">
              Danh sách khách
            </Link>
            <span className="truncate">{session.user.name ?? session.user.email}</span>
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
