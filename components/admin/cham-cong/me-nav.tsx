// components/admin/cham-cong/me-nav.tsx — cụm "Của tôi" của nhân viên.
//
// Vì sao file này tồn tại: lịch ca, đơn của tôi và chấm công là việc của CHÍNH người đăng nhập,
// không phải việc quản lý khối — nên chúng không dùng ModuleNav (không khối, không kỳ) và cũng
// không có ScopeBar. Tách hẳn hàng tab riêng để nhân viên không lạc vào màn quản lý và ngược lại.
//
// `?month=` phải được mang theo: người đang xem tháng 08 mà bấm "Đơn của tôi" rồi quay lại thì
// tháng phải còn nguyên. Href là chuỗi literal — nav-coverage đếm ở đây (2 route này đã rời sidebar).
import Link from "next/link";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { hrefWith } from "@/lib/cham-cong/scope-href";
import { BTN_OUTLINE, TAB, TAB_ACTIVE, TAB_IDLE } from "./classes";

export type MeNavKey = "lich-ca" | "cua-toi";

export function MeNav({ active, month }: { active: MeNavKey; month?: string | null }) {
  const tabs: { key: MeNavKey; label: string; href: string }[] = [
    { key: "lich-ca", label: "Lịch ca", href: hrefWith("/cham-cong/lich-ca", { month }) },
    { key: "cua-toi", label: "Đơn của tôi", href: "/don-tu/cua-toi" },
  ];

  return (
    <div className="mb-4 flex items-end justify-between gap-3 border-b border-border">
      <nav aria-label="Điều hướng cá nhân" className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(TAB, isActive ? TAB_ACTIVE : TAB_IDLE)}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <Link href="/cham-cong/checkin" className={cn(BTN_OUTLINE, "mb-2 shrink-0")}>
        <Clock aria-hidden className="h-4 w-4" />
        Chấm công
      </Link>
    </div>
  );
}
