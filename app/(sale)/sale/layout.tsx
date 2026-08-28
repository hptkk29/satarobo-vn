// app/(sale)/sale/layout.tsx — Đợt B: khung site Sale (sale.satarobo.vn).
//
// Chốt Q11 (21/08/2026): Sale Hub là **site riêng**. Biểu mẫu nhập khách công
// khai cũ đã nghỉ (22/08); từ 23/08 site này có BẢN CÓ ĐĂNG NHẬP của riêng nó tại
// `/sale/nhap-khach-hang`, dùng chung ba mảnh với bản admin.
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
import { grantedMenuActions } from "@/lib/auth/menu-permissions";
import { isRbacV2Enabled } from "@/lib/flags";
import { SaleNav } from "@/components/sale/sale-nav";
// S-10 (27/08/2026) — token màu riêng của site Sale (tím #7C3AED, QĐ-2). Class
// `sale-root` dưới đây được gắn từ 23/08 nhưng KHÔNG file nào định nghĩa nó, nên
// site âm thầm mượn cam `:root` của trang public suốt bốn ngày. Thiếu dòng import
// này là quay lại đúng tình trạng đó, và không có gì báo.
import "./sale.css";

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

  // Thanh điều hướng hỏi ĐÚNG hàm quyết định mà cổng trang dùng
  // (`grantedMenuActions` → evaluatePermission + cờ). Tự gọi `can()` ở component
  // là cách chắc chắn để menu và cổng nói hai câu chuyện khác nhau khi cờ đổi —
  // bài học 10/07 của site admin, không lặp lại ở đây.
  //
  // Site Sale không có màn đổi vai (Sale thuần chỉ có một vai) nên truyền thẳng
  // session user + actor, không qua `menuUserForRole`.
  const granted = grantedMenuActions({
    sessionUser: {
      role: session.user.role,
      roles: session.user.roles,
      grants: session.user.grants,
    },
    actor,
    flagOn: isRbacV2Enabled(),
  });

  return (
    <div className="sale-root min-h-screen bg-background text-foreground">
      {/* S-10 — điều hướng nay là SIDEBAR DỌC 8 nhóm (tài liệu yêu cầu §5):
          cố định trái từ md trở lên, ngăn kéo ở màn hẹp. `md:pl-64` chừa đúng
          bề rộng thanh bên; dưới md thanh bên trượt ra ngoài nên không chừa. */}
      <SaleNav
        granted={granted}
        userLabel={session.user.name ?? session.user.email ?? ""}
      />
      {/* Bề rộng: `max-w-5xl` (64rem) là thước của trang ĐỌC, không phải của màn
          làm việc có bảng. Trên màn 1440px nó để trống gần một phần ba bên phải
          trong khi bảng khách phải cuộn ngang. PRODUCT.md §nguyên tắc 1: "mật độ
          thắng khoảng trắng — người dùng ngồi 8 tiếng và cần thấy nhiều dòng cùng
          lúc". Vẫn giữ trần để dòng chữ không dài quá tầm mắt trên màn siêu rộng. */}
      <main className="md:pl-64">
        <div className="mx-auto max-w-[88rem] px-6 py-7">{children}</div>
      </main>
    </div>
  );
}
