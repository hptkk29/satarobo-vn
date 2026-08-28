"use client";

// components/sale/sale-nav.tsx — RUỘT thanh bên site Sale (logo · nhóm · chân).
//
// Vì sao có file này: trước 23/08 site Sale chỉ có một header gồm hai dòng chữ và
// KHÔNG một liên kết nào — kể cả tới `/sale/trial` đang chạy được. Muốn vào phải
// gõ tay URL, và không có nút đăng xuất. Một màn hình dựng xong mà không có lối
// vào thì với người dùng nó không tồn tại.
//
// ⚠️ LỌC QUYỀN LÀ THỨ KHÔNG ĐƯỢC BỎ khi mượn hình dáng của site giáo viên.
// `sidebar-nav` bên đó vẽ mọi mục cho mọi người — đúng với site GV vì ở đó chỉ có
// một vai, nhưng ở đây thì đẻ dead-link ngay khi Sale có hai hạng quyền khác nhau.
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
//
// ─────────────────────────────────────────────────────────────────────────────
// 28/08/2026 — MƯỢN HÌNH DÁNG THANH BÊN CỦA SITE GIÁO VIÊN.
//
// Chốt của chủ dự án: "lấy thiết kế giống, không lấy màu, không lấy nội dung".
// Nên file này nay theo đúng khuôn `app/(teacher)/teacher/_components/sidebar*`:
// hàng logo cao 4rem ở đỉnh · vùng nhóm CUỘN được ở giữa · dải chân cố định ·
// nhóm GẬP ĐƯỢC bằng nút có mũi tên. Hình học từng con số nằm ở `.s-nav-*` trong
// `sale.css`, khớp `.t-nav-*` bên GV.
//
// GIỮ NGUYÊN của Sale: bộ token TÍM, 8 nhóm và các mục của chính site này, lọc
// quyền, và chân "Cá nhân" mang tên người + lối đăng xuất.
// KHÔNG mượn: màu cam, mục menu của GV, badge tin nhắn, nút Sáng/Tối (site này
// chỉ có chế độ Sáng — xem đầu `sale.css`).
// ─────────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  LayoutList,
  LogOut,
  MessageSquare,
  UserPlus,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PAGE_GATES } from "@/lib/auth/page-gates";
import { cn } from "@/lib/utils";
import { SaleLogo } from "@/components/sale/shell/sale-logo";

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
      // Hộp thư đa kênh nằm ở nhóm này chứ không phải CSKH: nó là chỗ TRÒ CHUYỆN
      // với khách tiềm năng (Zalo/Messenger), cùng việc với "Khách của tôi".
      // CSKH là chăm khách ĐÃ ghi danh — khác giai đoạn, khác người dùng.
      {
        label: "Hộp thư",
        href: "/sale/hop-thu",
        icon: MessageSquare,
        perm: PAGE_GATES["/sale/hop-thu"],
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

/**
 * Một nhóm gập được. Mặc định MỞ — gập là để người dùng tự dọn cho gọn, không
 * phải để giấu mục khỏi họ ngay lần đầu vào.
 */
function KhoiNhom({
  nhom,
  muc,
  pathname,
  onNavigate,
}: {
  nhom: string;
  muc: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const [mo, setMo] = useState(true);

  return (
    <div>
      <button
        type="button"
        onClick={() => setMo((v) => !v)}
        aria-expanded={mo}
        className="s-section-label flex w-full items-center justify-between"
      >
        <span>{nhom}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", mo ? "rotate-0" : "-rotate-90")}
          aria-hidden
        />
      </button>

      {mo ? (
        <ul className="space-y-0.5">
          {muc.map((it) => {
            const active = dangDung(it.href, pathname);
            const Icon = it.icon;
            return (
              <li key={it.href}>
                <Link
                  href={it.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn("s-nav-link", active && "s-nav-link-active")}
                >
                  <Icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0",
                      active ? "text-[color:var(--primary-ink)]" : "text-muted-foreground",
                    )}
                    strokeWidth={2}
                    aria-hidden
                  />
                  {/* `min-w-0 flex-1 truncate`: nhãn tiếng Việt dài phải bị CẮT
                      chứ không đẩy nội dung tràn ra ngoài khung 16rem. */}
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Ruột thanh bên — dùng chung cho bản cố định (desktop) và ngăn kéo (mobile),
 * đúng cách site GV làm: MỘT ruột vẽ ở hai nơi, không nhân bản hai bản đi lệch.
 */
export function SaleNav({
  granted,
  userLabel,
  onNavigate,
}: {
  /** Danh sách action user thực sự có — layout tính bằng cùng hàm mà cổng trang dùng. */
  granted: readonly string[];
  userLabel: string;
  /** Ngăn kéo mobile truyền vào để tự đóng sau khi bấm một mục. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
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

  return (
    <div className="flex h-full flex-col bg-[color:var(--surface-chrome)]">
      {/* Hàng logo cao đúng 4rem — bằng thanh đầu trang, để hai bên thẳng hàng
          nhau ở đường chân trời trên cùng. */}
      <div className="flex h-16 shrink-0 items-center px-5">
        <SaleLogo />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <nav aria-label="Điều hướng tư vấn tuyển sinh" className="space-y-1 px-3 pb-6">
          {nhomHien.map((g) => (
            <KhoiNhom
              key={g.nhom}
              nhom={g.nhom}
              muc={g.muc}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ))}
        </nav>
      </div>

      {/* Nhóm "Cá nhân" của tài liệu. Giữ ở thanh bên chứ không dời hết lên menu
          người dùng: lối ra phải THẤY ĐƯỢC mà không cần mở thêm một lớp nào. */}
      <div className="shrink-0 border-t border-border px-3 py-3">
        <p className="s-section-label pt-1">Cá nhân</p>
        <p className="truncate px-3 pb-1 text-sm text-foreground">{userLabel}</p>
        {/* `/dang-xuat` là trang công khai có chủ đích: nó tồn tại để dọn cookie
            của một phiên đã chết, mà phiên đó theo định nghĩa là không hợp lệ. */}
        <Link href="/dang-xuat" onClick={onNavigate} className="s-nav-link">
          <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
          <span className="min-w-0 flex-1 truncate">Đăng xuất</span>
        </Link>
      </div>
    </div>
  );
}
