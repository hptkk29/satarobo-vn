"use client";

// components/sale/sale-nav.tsx — thanh điều hướng site Sale.
//
// Vì sao có file này: trước 23/08 site Sale chỉ có một header gồm hai dòng chữ và
// KHÔNG một liên kết nào — kể cả tới `/sale/trial` đang chạy được. Muốn vào phải
// gõ tay URL, và không có nút đăng xuất. Một màn hình dựng xong mà không có lối
// vào thì với người dùng nó không tồn tại.
//
// ⚠️ Theo khuôn `components/admin/sidebar.tsx` (CÓ lọc quyền), KHÔNG theo
// `sidebar-nav` của site giáo viên — khuôn đó vẽ mọi mục cho mọi người, đúng với
// site GV vì ở đó chỉ có một vai, nhưng ở đây thì đẻ dead-link ngay khi Sale có
// hai hạng quyền khác nhau.
//
// `perm` của mỗi mục lấy THẲNG từ `PAGE_GATES` chứ không gõ lại: menu và cổng
// trang phải là cùng một danh sách, nếu không sẽ tái sinh đúng hai lớp lỗi mà
// `lib/auth/page-gates.ts` sinh ra để diệt (menu hiện mà trang đá ra; hoặc menu
// giấu mà gõ URL vẫn vào).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { CalendarDays, LayoutList, LogOut, UserPlus, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PAGE_GATES } from "@/lib/auth/page-gates";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Hiện mục nếu có quyền với BẤT KỲ action nào trong đây. Bỏ trống = luôn hiện. */
  perm?: readonly string[];
};

const NAV: NavItem[] = [
  // Trang chủ luôn hiện — layout đã gác ai vào được site này rồi.
  { label: "Bảng việc", href: "/sale", icon: LayoutList },
  {
    label: "Khách của tôi",
    href: "/sale/khach-cua-toi",
    icon: Users,
    perm: PAGE_GATES["/sale/khach-cua-toi"],
  },
  { label: "Lớp trải nghiệm", href: "/sale/trial", icon: CalendarDays, perm: PAGE_GATES["/sale/trial"] },
  {
    label: "Nhập khách hàng",
    href: "/sale/nhap-khach-hang",
    icon: UserPlus,
    perm: PAGE_GATES["/sale/nhap-khach-hang"],
  },
];

export function SaleNav({
  granted,
  userLabel,
}: {
  /** Danh sách action user thực sự có — layout tính bằng cùng hàm mà cổng trang dùng. */
  granted: readonly string[];
  userLabel: string;
}) {
  const pathname = usePathname();
  const grantedSet = useMemo(() => new Set(granted), [granted]);
  const items = useMemo(
    () => NAV.filter((it) => !it.perm || it.perm.some((p) => grantedSet.has(p))),
    [grantedSet],
  );

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
        <span className="text-sm font-semibold">Sata Robo · Tư vấn tuyển sinh</span>

        <nav className="flex flex-1 flex-wrap items-center gap-1">
          {items.map((it) => {
            // `/sale` chỉ sáng khi đúng nó — nếu không thì mọi trang con đều làm
            // trang chủ sáng theo và thanh điều hướng hết chỉ được chỗ đang đứng.
            const active =
              it.href === "/sale" ? pathname === "/sale" : pathname.startsWith(it.href);
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {it.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{userLabel}</span>
          {/* `/dang-xuat` là trang công khai có chủ đích: nó tồn tại để dọn cookie
              của một phiên đã chết, mà phiên đó theo định nghĩa là không hợp lệ. */}
          <Link
            href="/dang-xuat"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Đăng xuất
          </Link>
        </div>
      </div>
    </header>
  );
}
