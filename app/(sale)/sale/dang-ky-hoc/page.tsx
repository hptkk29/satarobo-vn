/**
 * Site Sale — màn "Đăng ký học".
 *
 * ── ĐÂY LÀ BẢN ĐÔI CỦA `app/(admin)/admin/enrollments/page.tsx` ─────────────
 * Trước 04/09/2026 tệp này chỉ MOUNT LẠI trang admin:
 *
 *     return <AdminEnrollmentsPage searchParams={searchParams} />;
 *
 * Chủ dự án chốt 04/09/2026: các màn site Sale **tách bản riêng**, không dùng
 * chung component với khu quản trị nữa, để thiết kế lại giao diện site Sale mà
 * **không đụng một pixel nào** của khu quản trị. Rủi ro trôi lệch giữa hai bản
 * đã được nêu; chủ dự án vẫn chọn đường này.
 *
 * NỘI DUNG GIỮ NGUYÊN 100% — cùng cột, cùng nhãn, cùng bộ lọc, cùng câu chữ.
 * Chỉ đổi CÁCH BÀY, và bày theo hệ thiết kế Sale đã có:
 *   `KhungDuLieu` (bề mặt dữ liệu 3 tầng) + `.bang-sale` (mật độ) +
 *   `StatusPill` (thang màu ngữ nghĩa) + token tím của `sale.css`.
 *
 * ── BA MẢNH CỦA MÀN NÀY ─────────────────────────────────────────────────────
 *   `_components/bo-loc.tsx`      — thanh lọc (4 điều khiển của bản admin)
 *   `_components/bang-dang-ky.tsx`— bảng 5 cột + 3 hành động trên dòng
 *   `_components/nut-xoa.tsx`     — nút xoá 2 lần bấm (gọi Server Action admin)
 * Truy vấn ở `lib/sale/dang-ky-hoc.ts`, nhãn + màu ở `lib/sale/trang-thai-dang-ky.ts`.
 *
 * ⚠️ Cổng quyền vẫn là `chanNeuThieuQuyen("/sale/dang-ky-hoc", …)`, KHÔNG phải
 *    `redirect("/dashboard")` như bản admin. Lý do đầy đủ ở `lib/sale/cong-trang.tsx`:
 *    `/dashboard` chỉ có nghĩa trên tên miền quản trị; trên host Sale và trên mọi
 *    host "không xác định" (localhost, test.satarobo.vn) nó là 404 trắng trơn.
 *    Bài kiểm `lib/auth/page-gates.test.ts` cũng nhận đúng hai dạng gác này.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canViewLeadPii,
  checkPermission,
  checkPermissionDetail,
} from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { layDanhSachDangKyHoc } from "@/lib/sale/dang-ky-hoc";
import { docLocTrangThai, LOC_DANG_HOAT_DONG } from "@/lib/sale/trang-thai-dang-ky";
import { BoLocDangKyHoc } from "./_components/bo-loc";
import { BangDangKyHoc } from "./_components/bang-dang-ky";

export const dynamic = "force-dynamic";
export const metadata = { title: "Đăng ký học | Tư vấn tuyển sinh" };

export default async function SaleEnrollmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    classId?: string;
    centerId?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fdang-ky-hoc");

  const chan = await chanNeuThieuQuyen("/sale/dang-ky-hoc", "Đăng ký học");
  if (chan) return chan;

  const canDelete = await checkPermission("enrollments:delete");
  // Che SĐT phụ huynh nếu thiếu quyền PII, VÀ nếu bị DENY cấp trường từ grant
  // nhóm (US-03 / TS-02) — đồng nhất với `/students` và bản admin của màn này.
  const canViewPii = await canViewLeadPii();
  const { fieldMask } = await checkPermissionDetail("students:view-all");
  const hienSdt = canViewPii && !fieldMask.includes("parentPhone");

  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const locTrangThai = docLocTrangThai(sp.status);
  const locLop = sp.classId?.trim() || undefined;
  const locCoSo = sp.centerId?.trim() || undefined;

  const actor = await resolveActor(session.user.id);
  const { dong, lop, coSo } = await layDanhSachDangKyHoc({
    actor,
    userId: session.user.id,
    q,
    locTrangThai,
    locLop,
    locCoSo,
    hienSdt,
  });

  return (
    <KhungDuLieu>
      <KhungDuLieu.Dau
        ten="Đăng ký học"
        // Câu mô tả chép nguyên ý bản admin: đếm số dòng, và nói rõ khi đang ở
        // bộ lọc mặc định — nếu không, người dùng thấy "37 đăng ký" mà không biết
        // đó là 37 đăng ký ĐANG HOẠT ĐỘNG, không phải toàn bộ sổ.
        mo={
          dong.length > 0
            ? `${dong.length} đăng ký${locTrangThai === LOC_DANG_HOAT_DONG ? " (đang hoạt động)" : ""}`
            : "Chưa có đăng ký nào"
        }
        hanhDong={
          <Link
            href="/enrollments/new"
            className="inline-flex h-9 items-center rounded-lg bg-[color:var(--primary)] px-4 text-sm font-medium text-[color:var(--primary-foreground)] transition-colors hover:bg-[color:var(--primary-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2"
          >
            Đăng ký mới
          </Link>
        }
      />

      <KhungDuLieu.Loc>
        <BoLocDangKyHoc
          q={q ?? ""}
          trangThai={sp.status ?? ""}
          lopId={locLop ?? ""}
          coSoId={locCoSo ?? ""}
          danhSachLop={lop}
          danhSachCoSo={coSo}
          timDuocSdt={hienSdt}
        />
      </KhungDuLieu.Loc>

      <BangDangKyHoc dong={dong} coQuyenXoa={canDelete} />
    </KhungDuLieu>
  );
}
