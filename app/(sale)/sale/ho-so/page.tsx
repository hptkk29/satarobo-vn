/**
 * Site Sale — màn "Hồ sơ của tôi" (bản admin: `/admin/settings`).
 *
 * ── ĐÂY LÀ BẢN ĐÔI CỦA `app/(admin)/admin/settings/page.tsx` ────────────────
 * Trước 04/09/2026 tệp này chỉ MOUNT LẠI trang admin. Chủ dự án chốt 04/09/2026:
 * màn site Sale **tách bản riêng**, không dùng chung component với khu quản trị,
 * để thiết kế lại giao diện Sale mà **không đụng một pixel nào** của khu quản
 * trị. Rủi ro trôi lệch đã được nêu; chủ dự án vẫn chọn đường này.
 *
 * NỘI DUNG GIỮ NGUYÊN 100% — năm khối đúng thứ tự (Thông tin tài khoản · Đổi mật
 * khẩu · Hướng dẫn sử dụng · Danh sách cơ sở · Thông tin môi trường), đúng nhãn,
 * đúng câu chữ, đúng điều kiện hiện.
 *
 * ⚠️ TIÊU ĐỀ VẪN LÀ "Cài đặt", KHÔNG đổi thành "Hồ sơ của tôi". Mục điều hướng
 *    gọi nó là "Hồ sơ của tôi" (`components/sale/sale-nav.tsx:384`) và thẻ tiêu
 *    đề trình duyệt cũng vậy, nhưng H1 của màn từ trước tới nay là "Cài đặt" —
 *    người dùng đang thấy đúng chữ đó. Đổi tiêu đề là đổi NỘI DUNG, ngoài phạm vi
 *    đợt tách này. Đã báo lại chỗ lệch tên cho chủ dự án.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚠️ CỐ Ý KHÔNG GÁC CỔNG QUYỀN — ngoại lệ DUY NHẤT của nhóm màn này, và không
 *    phải sơ suất.
 * ══════════════════════════════════════════════════════════════════════════════
 * Màn này hiển thị hồ sơ và ô đổi mật khẩu CỦA CHÍNH NGƯỜI ĐANG ĐĂNG NHẬP. Gác
 * `chanNeuThieuQuyen` ở đây là khoá người dùng khỏi chính họ: ai chưa được cấp
 * thêm quyền nào sẽ không xem nổi tên mình và không đổi nổi mật khẩu mình. Đăng
 * nhập được là điều kiện đủ — bản admin cũng chỉ kiểm `auth()`, không kiểm quyền
 * nào.
 *
 * Vì vậy `/sale/ho-so` KHÔNG có mặt trong `PAGE_GATES` — và cũng ĐỪNG thêm vào:
 * `chanNeuThieuQuyen` coi đường không khai là CHƯA CÓ CỔNG rồi chặn, nên chỉ cần
 * khai vào bảng là màn này chết ngay cả khi không ai gọi cổng.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BookOpenText } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { roleLabel } from "@/lib/labels";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { StatusPill } from "@/components/admin/ui/status-pill";
import { FormDoiMatKhau } from "./_components/form-doi-mat-khau";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hồ sơ của tôi | Tư vấn tuyển sinh" };

/** Băng tiêu đề khối — nền chìm để đọc ra là "vách ngăn", không phải dữ liệu. */
const BANG_TIEU_DE =
  "border-b border-border bg-[color:var(--surface-chim)] px-5 py-2.5 " +
  "text-sm font-semibold text-foreground";

/**
 * ⚠️ NỢ ĐÃ BIẾT — bộ tài liệu hướng dẫn chưa có bản Sale.
 * `/huong-dan` là clean URL host quản trị; trên `sale.satarobo.vn` luật cuối viết
 * lại thành `/sale/huong-dan` → 404. Giữ nguyên (bản mount cũ hỏng y hệt) thay vì
 * trỏ bừa; vá thật = dựng `/sale/huong-dan` với bộ bài viết của site Sale, việc
 * THÊM MÀN, đã báo lại cho chủ dự án.
 */
const DUONG_HUONG_DAN = "/huong-dan";

export default async function SaleProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fho-so");

  // Center ∈ SCOPE_EXEMPT → scopedDb pass-through; superAdmin vẫn thấy mọi cơ sở (#03).
  const sdb = scopedDb(await resolveActor(session.user.id));

  // ⚠️ Chép NGUYÊN cách bản admin quyết định: `isSuperAdmin(session.user.role)`.
  //
  // Biết đây là kiểu suy theo MÃ VAI, thứ đã gây trang trắng ở chỗ khác. Ở đây nó
  // KHÔNG gây được chuyện đó, và đổi nguồn thì mới nguy hiểm:
  //   · Màn không có cổng nào — hai khối dưới đây là PHỤ (danh sách cơ sở + thông
  //     tin môi trường). Đoán sai chỉ là thiếu hai khối tham khảo, không phải mất
  //     màn.
  //   · Dùng `actor.isSuperAdmin` thay vào trông "đúng chuẩn hơn" nhưng đó là một
  //     NGUỒN KHÁC (đòi có dòng `UserOrgRole` SUPER_ADMIN tại HO/ROOT còn hiệu
  //     lực). Hai khu sẽ hiện hai thứ khác nhau cho cùng một người — đúng kiểu
  //     trôi lệch mà đợt tách này phải tránh.
  //   · Trên host Sale hai khối này thực tế không tới được: `route-policy` chỉ cho
  //     Sale THUẦN vào host Sale, mà Sale thuần không bao giờ là SUPER_ADMIN. Giữ
  //     lại là để bản đôi khớp bản gốc, không phải vì ai sẽ thấy chúng.
  const superAdmin = isSuperAdmin(session.user.role);

  const centers = superAdmin
    ? await sdb.center
        .findMany({
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
            email: true,
            isActive: true,
          },
        })
        .catch(() => [])
    : [];

  return (
    <KhungDuLieu className="max-w-3xl">
      <KhungDuLieu.Dau ten="Cài đặt" mo="Quản lý tài khoản và cấu hình hệ thống" />

      {/* ── Thông tin tài khoản ─────────────────────────────────────────── */}
      <h2 className={BANG_TIEU_DE}>Thông tin tài khoản</h2>
      <dl className="grid grid-cols-1 gap-4 border-b border-border px-5 py-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Tên</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">
            {session.user.name ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Email</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">{session.user.email}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Vai trò</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">
            {roleLabel(session.user.role)}
          </dd>
        </div>
      </dl>

      {/* ── Đổi mật khẩu ────────────────────────────────────────────────── */}
      <h2 className={BANG_TIEU_DE}>Đổi mật khẩu</h2>
      <div className="border-b border-border px-5 py-4">
        <p className="mb-4 text-sm text-muted-foreground">
          Mật khẩu tối thiểu 8 ký tự, bao gồm chữ hoa và số
        </p>
        <FormDoiMatKhau />
      </div>

      {/* ── Hướng dẫn sử dụng ───────────────────────────────────────────── */}
      <h2 className={BANG_TIEU_DE}>
        <span className="flex items-center gap-2">
          <BookOpenText aria-hidden="true" className="size-4 text-[color:var(--primary-ink)]" />
          Hướng dẫn sử dụng
        </span>
      </h2>
      <div className="flex flex-col items-start gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Tài liệu hướng dẫn trang quản trị theo từng khối chức năng — kèm các bước thao
          tác và đường dẫn mở thẳng trang.
        </p>
        <Link
          href={DUONG_HUONG_DAN}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-[color:var(--surface-chim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30"
        >
          Mở hướng dẫn
          <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
        </Link>
      </div>

      {/* ── Danh sách cơ sở — chỉ super admin ───────────────────────────── */}
      {superAdmin && (
        <>
          <h2 className={BANG_TIEU_DE}>Danh sách cơ sở</h2>
          <div className="space-y-3 border-b border-border px-5 py-4">
            {centers.map((c) => (
              <div
                key={c.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-[color:var(--surface-chim)] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.address}</p>
                  {c.phone && (
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{c.phone}</p>
                  )}
                </div>
                <StatusPill tone={c.isActive ? "success" : "muted"}>
                  {c.isActive ? "Hoạt động" : "Tắt"}
                </StatusPill>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Thông tin môi trường — chỉ super admin ──────────────────────── */}
      {superAdmin && (
        <>
          <h2 className={BANG_TIEU_DE}>Thông tin môi trường</h2>
          <ul className="space-y-1.5 px-5 py-4 font-mono text-xs text-muted-foreground">
            <li>NODE_ENV: {process.env.NODE_ENV}</li>
            <li>NEXT_PUBLIC_APP_URL: {process.env.NEXT_PUBLIC_APP_URL}</li>
            <li>Meta Pixel ID: {process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "(chưa set)"}</li>
            <li>GA4 ID: {process.env.NEXT_PUBLIC_GA4_ID ?? "(chưa set)"}</li>
          </ul>
        </>
      )}
    </KhungDuLieu>
  );
}
