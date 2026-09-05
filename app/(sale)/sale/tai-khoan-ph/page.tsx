/**
 * Site Sale — màn "Tài khoản phụ huynh" (`/sale/tai-khoan-ph`).
 *
 * ══ BẢN ĐÔI CỦA `app/(admin)/admin/students/tai-khoan/page.tsx` ═════════════
 *
 * ── Vì sao tồn tại ──────────────────────────────────────────────────────────
 * Tới 04/09/2026 tệp này chỉ là một lớp bọc `<AdminParentAccountsPage />`. Chủ
 * dự án chốt ngày đó rằng các màn site Sale phải TÁCH BẢN RIÊNG: họ muốn thiết
 * kế lại site Sale mà KHÔNG đụng một pixel nào của khu quản trị, nơi 9 vai đang
 * làm việc hằng ngày. Rủi ro trôi lệch đã được nêu rõ trước khi chốt; chủ dự án
 * vẫn chọn đường này.
 *
 * ── Dùng lại được, KHÔNG chép ───────────────────────────────────────────────
 * `scopedDb` · `checkPermissionDetail` · `maskPhone`/`maskEmail` ·
 * `PhanTrangBang` · `StatusPill` · `KhungDuLieu` · và **cả ba Server Action**
 * của khu quản trị (`resendActivationOtpByUser` · `sendAccountZns` ·
 * `sendAccountZnsBulk`) — đường GHI không nhân bản, xem `_components/`.
 *
 * ── Buộc phải chép (nợ trôi lệch) ───────────────────────────────────────────
 * Truy vấn danh sách + cách suy trạng thái ZNS: đã dồn vào `lib/sale/tai-khoan-ph.ts`
 * để phần trùng nằm ở một tệp có tên chứ không lẫn trong JSX.
 *
 * ── Cổng quyền ──────────────────────────────────────────────────────────────
 * `PAGE_GATES["/sale/tai-khoan-ph"]` = `["students:edit"]`, ĐÚNG BẰNG quyền mà
 * bản admin đòi (`checkPermission('students:edit')`). Cổng không rộng hơn màn,
 * nên KHÔNG cần tầng kiểm thứ hai ở đây.
 *
 * ⚠️ Vẫn phải là `chanNeuThieuQuyen`, KHÔNG phải `redirect('/students')` như bản
 *    admin: `/students` là clean URL của tên miền quản trị; trên host Sale nó bị
 *    viết lại thành `/sale/students` → 404 trắng trơn.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermissionDetail } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { GiaiThichTrang } from "@/components/sale/ui/giai-thich-trang";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { layDanhSachTaiKhoanPh } from "@/lib/sale/tai-khoan-ph";
import { cn } from "@/lib/utils";
import { BangTaiKhoanPh } from "./_components/bang-tai-khoan-ph";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tài khoản phụ huynh | Tư vấn tuyển sinh" };

/** Hai thẻ lọc trạng thái — cùng hình dáng, chỉ khác thẻ đang đứng. */
const THE_LOC =
  "inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40";

export default async function ManTaiKhoanPhuHuynh({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Ftai-khoan-ph");

  const chan = await chanNeuThieuQuyen("/sale/tai-khoan-ph", "Tài khoản phụ huynh");
  if (chan) return chan;

  // Che SĐT/email theo DENY cấp trường (US-03 / TS-02), KHÔNG theo mã vai — lý do
  // đầy đủ ở đầu `lib/sale/tai-khoan-ph.ts`. Bảng grant rỗng ⇒ hiện y hệt bản admin.
  //
  // MỘT cờ cho cả SĐT lẫn email, và DENY ở BẤT KỲ trường liên hệ nào cũng che cả
  // hai: hai thứ này luôn đứng cạnh nhau trong cùng một ô, cùng một cột CSV. Tách
  // hai cờ thì DENY "email" vẫn để lộ SĐT ngay bên cạnh — che nửa vời còn tệ hơn
  // không che, vì nó tạo cảm giác đã che.
  const { fieldMask } = await checkPermissionDetail("students:edit");
  const hienLienHe = !["phone", "parentPhone", "email"].some((f) => fieldMask.includes(f));

  const { status } = await searchParams;
  const xemTatCa = status === "all";

  const actor = await resolveActor(session.user.id);
  const du = await layDanhSachTaiKhoanPh({ actor, xemTatCa, hienLienHe });

  return (
    <div className="space-y-3">
      {/* Đường lui giữ nguyên của bản admin, nhưng trỏ BẢN SALE: `/students` trần
          là clean URL của host quản trị ⇒ `/sale/students` → 404. `/sale/hoc-vien`
          có thật (đã tách 04/09). */}
      <Link
        href="/sale/hoc-vien"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft aria-hidden="true" className="size-4" /> Học viên
      </Link>

      <KhungDuLieu>
        <KhungDuLieu.Dau
          ten="Tài khoản phụ huynh"
          mo="Theo dõi tài khoản chờ kích hoạt · gửi lại mã OTP · báo cấp tài khoản qua Zalo · xuất danh sách gọi điện."
          hanhDong={
            <>
              <Link
                href="/sale/tai-khoan-ph"
                aria-current={!xemTatCa ? "page" : undefined}
                className={cn(
                  THE_LOC,
                  !xemTatCa
                    ? "bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:bg-[color:var(--primary-dark)]"
                    : "border border-border text-foreground hover:bg-[color:var(--surface-chim)]",
                )}
              >
                Chờ kích hoạt ({du.demChoKichHoat})
              </Link>
              <Link
                href="/sale/tai-khoan-ph?status=all"
                aria-current={xemTatCa ? "page" : undefined}
                className={cn(
                  THE_LOC,
                  xemTatCa
                    ? "bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:bg-[color:var(--primary-dark)]"
                    : "border border-border text-foreground hover:bg-[color:var(--surface-chim)]",
                )}
              >
                Tất cả ({du.demChoKichHoat + du.demDaKichHoat})
              </Link>
            </>
          }
        />

        {/* Câu chỉ đường cho phụ huynh — giữ nguyên câu chữ bản admin, chỉ thu vào
            dải hướng dẫn: nó là thứ đọc MỘT LẦN rồi thuộc, không phải thứ phải
            nhìn mỗi lần mở màn. */}
        <GiaiThichTrang>
          <p>
            Phụ huynh tự kích hoạt tại <span className="font-mono">satarobo.vn/kich-hoat</span>{" "}
            (nhập SĐT → nhận OTP Zalo → đặt mật khẩu).
          </p>
        </GiaiThichTrang>

        {!du.daCauHinhZns ? (
          <div className="border-b border-border bg-[color:var(--state-warning-soft)] px-5 py-3 text-sm text-[color:var(--state-warning)]">
            <b>Mẫu ZNS &quot;báo cấp tài khoản&quot; chưa cấu hình</b> (env{" "}
            <span className="font-mono">ZALO_ZNS_TEMPLATE_ACCOUNT</span> — mẫu 616899 đang chờ
            Zalo duyệt). Trong lúc chờ: dùng nút <b>Xuất CSV</b> để gọi điện/nhắn Zalo OA thủ
            công hướng dẫn phụ huynh vào <span className="font-mono">/kich-hoat</span>, hoặc{" "}
            <b>Gửi lại OTP</b> khi phụ huynh đang thao tác trực tiếp.
          </div>
        ) : null}

        <BangTaiKhoanPh dong={du.dong} daCauHinhZns={du.daCauHinhZns} />
      </KhungDuLieu>
    </div>
  );
}
