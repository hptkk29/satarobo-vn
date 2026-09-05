/**
 * Site Sale — màn "Đơn hàng".
 *
 * ── ĐÂY LÀ BẢN ĐÔI CỦA `app/(admin)/admin/orders/page.tsx` ──────────────────
 * Trước 04/09/2026 tệp này chỉ MOUNT LẠI trang admin (`return <AdminOrdersPage />`).
 * Chủ dự án chốt 04/09/2026: các màn site Sale **tách bản riêng**, không dùng
 * chung component với khu quản trị nữa, để thiết kế lại giao diện site Sale mà
 * **không đụng một pixel nào** của khu quản trị. Rủi ro trôi lệch giữa hai bản
 * đã được nêu; chủ dự án vẫn chọn đường này.
 *
 * NỘI DUNG GIỮ NGUYÊN 100% — cùng 8 cột, cùng 5 điều khiển lọc, cùng câu chữ,
 * cùng điều kiện quyền. Chỉ đổi CÁCH BÀY, theo hệ thiết kế Sale đã có:
 * `KhungDuLieu` + `.bang-sale` + `StatusPill` + token tím của `sale.css`.
 *
 * ── ĐƯỜNG DỮ LIỆU: GỌI LẠI, KHÔNG CHÉP ─────────────────────────────────────
 * Truy vấn danh sách vẫn là Server Action `queryOrders` của khu quản trị. Nó
 * mang sẵn `requireOrdersView()` + `scopedDb(actor)` + con trỏ trang. Chép truy
 * vấn sang `lib/sale/` là dựng bản thứ hai của một đường ĐỌC TIỀN — hai bản sẽ
 * trôi lệch và không có gì báo. Chỉ phần TRÌNH BÀY được nhân bản.
 *
 * ── CỔNG QUYỀN: MỘT TẦNG, VÌ HAI TẦNG SẼ TRÙNG KHÍT ────────────────────────
 *   `PAGE_GATES["/sale/don-hang"]` = `["orders:view"]`
 *   bản admin              = `checkPermission("orders:view")`
 *   `queryOrders` bên trong = `requireOrdersView()` → cũng `orders:view`
 * Ba chỗ CÙNG MỘT KHOÁ ⇒ thêm tầng hai ở đây là mã chết. (Đã kiểm, không suy
 * đoán.) Đường từ chối của bản admin — `redirect("/dashboard?error=unauthorized")`
 * — không bao giờ tới được từ host Sale vì cổng ở trên đã chặn cùng khoá đó;
 * nếu tới được thì đó là **404 trắng** (xem `lib/sale/cong-trang.tsx`).
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { DanhSachDonHang } from "./_components/danh-sach-don-hang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Đơn hàng | Tư vấn tuyển sinh" };

/**
 * ⚠️ NỢ ĐÃ BIẾT — ĐƯỜNG TẠO ĐƠN THỦ CÔNG CHƯA CÓ TRÊN HOST SALE.
 *
 * Bản admin trỏ `/orders/new`; đó là clean URL của host quản trị. Trên
 * `sale.satarobo.vn`, luật cuối của nhánh Sale là `rewrite "/sale" + pathname`
 * (`lib/auth/route-policy.ts`) ⇒ `/orders/new` thành `/sale/orders/new` → **404**.
 *
 * Site Sale CÓ `/sale/chot-don/[leadId]` nhưng đó là màn KHÁC: tạo đơn cho một
 * phiếu khách cụ thể, không phải "tạo đơn thủ công" chọn khách bất kỳ. Trỏ sang
 * đó là đổi một liên kết 404 lấy một liên kết sai đích — tệ hơn (cùng bài học
 * đã ghi ở `lib/sale/duong-dan-sale.ts`).
 *
 * Giữ nguyên đường cũ là KHÔNG tạo hồi quy (bản mount trước cũng hỏng y hệt),
 * chứ không phải là đúng. Vá thật = dựng `/sale/don-hang/moi` (dùng lại cổng
 * `PAGE_GATES["/sale/don-hang"]`, không cần khoá mới) — việc THÊM MÀN, đã báo
 * lại cho chủ dự án.
 */
const DUONG_TAO_DON = "/orders/new";

export default async function SaleOrdersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fdon-hang");

  const chan = await chanNeuThieuQuyen("/sale/don-hang", "Đơn hàng");
  if (chan) return chan;

  // G-A (21/08/2026) — nút "Tạo đơn" theo `orders:create` (Sale nay có). Hỏi ĐÚNG
  // khoá mà `createOrderManualAction` đòi, không suy từ vai: nút bấm vào rồi mới
  // báo "không có quyền" là một lời hứa suông.
  const canCreate = await checkPermission("orders:create");

  return (
    <KhungDuLieu>
      <KhungDuLieu.Dau
        ten="Đơn hàng"
        mo="Theo dõi & quản lý đơn hàng khoá học, gói combo, kỳ thi"
        hanhDong={
          canCreate ? (
            <Link
              href={DUONG_TAO_DON}
              className="inline-flex h-9 items-center rounded-lg bg-[color:var(--primary)] px-4 text-sm font-medium text-[color:var(--primary-foreground)] transition-colors hover:bg-[color:var(--primary-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2"
            >
              Tạo đơn thủ công
            </Link>
          ) : null
        }
      />

      <DanhSachDonHang />
    </KhungDuLieu>
  );
}
