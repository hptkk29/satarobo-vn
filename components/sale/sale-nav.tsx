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
//
// ─────────────────────────────────────────────────────────────────────────────
// S-10 (27/08/2026) — 5 mục phẳng → 8 NHÓM, và header ngang → SIDEBAR DỌC.
//
// Tên 8 nhóm LẤY TỪ tài liệu yêu cầu, không tự đặt cho gọn: §5 của
// `Document/0-yeucau/2-ba-phan-tich/09-ui-ux-site-sale-tuyensinh.md` (FINAL
// 16/07 — "Cấu trúc Sidebar (IA — 8 nhóm / 28 tab)"). Test
// `[S-10] nav khai đủ 8 nhóm, ĐÚNG TÊN và ĐÚNG THỨ TỰ` đọc thẳng tài liệu đó và
// so từng chữ, nên tài liệu đổi thì file này đỏ.
//
// ⚠️ SỰ THẬT PHẢI NÓI RA: tài liệu khai 28 tab, hôm nay repo mới có 5 trang vào
// được từ menu. Nên 3 trong 8 nhóm (Ghi danh & Thu phí · Chăm sóc & Tái tục ·
// Kinh doanh của tôi) đang RỖNG và KHÔNG được vẽ ra. Khai sẵn nhóm rỗng là có
// chủ đích — nó là bản đồ để người dựng trang sau bỏ tab vào đúng chỗ thay vì
// đẻ nhóm thứ chín. Nhưng VẼ một nhãn nhóm rồi bên dưới trống không thì người
// dùng tưởng mình thiếu quyền, nên nhóm rỗng bị lọc trước khi render.
//
// ⚠️ "Ghi danh & Thu phí" rỗng KHÔNG có nghĩa là chưa làm được việc đó:
// `/sale/chot-don/[leadId]` và `/sale/ghi-danh/[leadId]` đã chạy, chỉ là chúng
// luôn gắn với MỘT khách cụ thể nên vào từ trang khách — một mục menu trần sẽ
// dẫn tới câu hỏi "đơn cho ai?" mà không trả lời được. Ngoại lệ này được khai
// tường minh kèm lý do trong `sale-nav.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  LayoutList,
  LogOut,
  Menu,
  UserPlus,
  Users,
  X,
} from "lucide-react";
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

type NavGroup = {
  /** Tên nhóm — phải khớp từng chữ với §5 của tài liệu yêu cầu. */
  nhom: string;
  muc: NavItem[];
};

const NHOM: NavGroup[] = [
  {
    nhom: "Tổng quan",
    // Trang chủ luôn hiện — layout đã gác ai vào được site này rồi.
    muc: [{ label: "Bảng việc hôm nay", href: "/sale", icon: LayoutList }],
  },
  {
    nhom: "Lead & Tư vấn",
    muc: [
      {
        label: "Khách của tôi",
        href: "/sale/khach-cua-toi",
        icon: Users,
        perm: PAGE_GATES["/sale/khach-cua-toi"],
      },
      {
        label: "Nhập khách hàng",
        href: "/sale/nhap-khach-hang",
        icon: UserPlus,
        perm: PAGE_GATES["/sale/nhap-khach-hang"],
      },
    ],
  },
  {
    nhom: "Học thử / Trải nghiệm",
    muc: [
      {
        label: "Lớp trải nghiệm",
        href: "/sale/trial",
        icon: CalendarDays,
        perm: PAGE_GATES["/sale/trial"],
      },
    ],
  },
  // Chốt đơn + ghi danh đã chạy nhưng luôn gắn với MỘT khách → vào từ trang
  // khách, không có mục menu trần. Xem ghi chú đầu file.
  { nhom: "Ghi danh & Thu phí", muc: [] },
  { nhom: "Chăm sóc & Tái tục (CSKH)", muc: [] },
  { nhom: "Kinh doanh của tôi", muc: [] },
  {
    nhom: "Danh mục & Tra cứu",
    muc: [
      {
        label: "Tra cứu",
        href: "/sale/tra-cuu",
        icon: BookOpen,
        perm: PAGE_GATES["/sale/tra-cuu"],
      },
    ],
  },
  // Tài liệu xếp "đăng xuất" vào nhóm Cá nhân (qua UserMenu). Chưa có
  // `/sale/ho-so` nên nhóm này hiện chỉ có lối ra — nhưng phải có: thiếu nó thì
  // người dùng kẹt trong site và phải xoá cookie bằng tay.
  { nhom: "Cá nhân", muc: [] },
];

/** `/sale` chỉ sáng khi đúng nó — nếu không thì mọi trang con đều làm trang chủ
 *  sáng theo và thanh điều hướng hết chỉ được chỗ đang đứng. */
function dangDung(href: string, pathname: string): boolean {
  return href === "/sale" ? pathname === "/sale" : pathname.startsWith(href);
}

export function SaleNav({
  granted,
  userLabel,
}: {
  /** Danh sách action user thực sự có — layout tính bằng cùng hàm mà cổng trang dùng. */
  granted: readonly string[];
  userLabel: string;
}) {
  const pathname = usePathname();
  const [moNgang, setMoNgang] = useState(false);
  const grantedSet = useMemo(() => new Set(granted), [granted]);

  // Lọc theo quyền TRƯỚC, bỏ nhóm rỗng SAU. Làm ngược lại thì một nhóm mà người
  // này không có quyền với mục nào vẫn hiện nhãn — trông như lỗi tải dở.
  const nhomHien = useMemo(
    () =>
      NHOM.map((g) => ({
        ...g,
        muc: g.muc.filter((it) => !it.perm || it.perm.some((p) => grantedSet.has(p))),
      })).filter((g) => g.muc.length > 0),
    [grantedSet],
  );

  const than = (
    <>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {nhomHien.map((g) => (
          <div key={g.nhom}>
            <p className="px-3 pb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
              {g.nhom}
            </p>
            <div className="space-y-0.5">
              {g.muc.map((it) => {
                const active = dangDung(it.href, pathname);
                const Icon = it.icon;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={() => setMoNgang(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {it.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Nhóm "Cá nhân" của tài liệu — hôm nay mới có lối ra. */}
      <div className="border-t border-border px-3 py-3">
        <p className="px-3 pb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
          Cá nhân
        </p>
        <p className="truncate px-3 pb-1.5 text-sm text-foreground">{userLabel}</p>
        {/* `/dang-xuat` là trang công khai có chủ đích: nó tồn tại để dọn cookie
            của một phiên đã chết, mà phiên đó theo định nghĩa là không hợp lệ. */}
        <Link
          href="/dang-xuat"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Đăng xuất
        </Link>
      </div>
    </>
  );

  return (
    <>
      {/* Thanh trên cùng — chỉ ở màn hẹp, mở/đóng ngăn kéo. */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={() => setMoNgang((v) => !v)}
          aria-expanded={moNgang}
          aria-label={moNgang ? "Đóng menu" : "Mở menu"}
          className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {moNgang ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <span className="text-sm font-semibold">Sata Robo · Tư vấn tuyển sinh</span>
      </header>

      {/* Nền mờ của ngăn kéo. Bấm ra ngoài là đóng — không bẫy người dùng. */}
      {moNgang ? (
        <button
          type="button"
          aria-label="Đóng menu"
          onClick={() => setMoNgang(false)}
          className="fixed inset-0 z-30 bg-foreground/20 md:hidden"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-card transition-transform duration-200 md:translate-x-0",
          moNgang ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="hidden border-b border-border px-6 py-4 md:block">
          <p className="text-sm font-semibold leading-tight">Sata Robo</p>
          <p className="text-xs text-muted-foreground">Tư vấn tuyển sinh</p>
        </div>
        {than}
      </aside>
    </>
  );
}
