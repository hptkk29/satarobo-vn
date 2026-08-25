"use client";

// app/(admin)/admin/lop-trial/_components/tab-bar.tsx — GĐ2.
//
// Thanh 2 tab của màn "Lớp Trial" (bản gộp của /admin/trials + /admin/trial-classes).
// Client Component vì cần `usePathname()` để biết tab nào đang mở.
//
// Đường dẫn KHÔNG có tiền tố "/admin": host admin.satarobo.vn dùng clean-URL, `proxy.ts`
// rewrite "/lop-trial" → "/admin/lop-trial". Cả sidebar lẫn các màn admin khác đều viết
// href kiểu này — thêm "/admin" vào là link chết trên host thật.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/lop-trial", label: "Lớp trải nghiệm" },
  { href: "/lop-trial/lich-hen", label: "Lịch hẹn học thử" },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-border" aria-label="Chuyển giữa hai màn Lớp Trial">
      {TABS.map((tab) => {
        // ⚠️ "/lop-trial" là TIỀN TỐ của "/lop-trial/lich-hen": dùng startsWith thì đứng ở
        // tab lịch hẹn cả hai tab đều sáng. Nên tab gốc so BẰNG (chấp cả dạng có dấu "/"
        // cuối), tab con mới được phép so theo tiền tố (để trang chi tiết bên dưới nó,
        // nếu sau này có, vẫn giữ tab sáng).
        const active =
          tab.href === "/lop-trial"
            ? pathname === "/lop-trial" || pathname === "/lop-trial/"
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors sm:px-4",
              active
                ? "border-primary bg-card text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
