/**
 * Site Sale — màn "Buổi học" (`/sale/buoi-hoc`).
 *
 * ══ BẢN ĐÔI CỦA `app/(admin)/admin/sessions/page.tsx` ═══════════════════════
 *
 * ── Vì sao tồn tại ──────────────────────────────────────────────────────────
 * Tới 04/09/2026 tệp này chỉ là một lớp bọc `<AdminSessionsPage searchParams/>`.
 * Chủ dự án chốt ngày đó rằng các màn site Sale phải TÁCH BẢN RIÊNG: họ muốn
 * thiết kế lại site Sale mà KHÔNG đụng một pixel nào của khu quản trị, nơi 9 vai
 * đang làm việc hằng ngày. Rủi ro trôi lệch đã được nêu rõ trước khi chốt; chủ
 * dự án vẫn chọn đường này. Bản admin giữ nguyên, không sửa.
 *
 * NỘI DUNG GIỮ NGUYÊN 100%: cùng ba phạm vi (Sắp tới / Đã diễn ra / Tất cả),
 * cùng ô lọc lớp, cùng dải "Ngày nghỉ sắp tới", cùng bốn cột, cùng từng chữ của
 * câu rỗng và câu "Đang xem: …". Chỉ đổi CÁCH BÀY.
 *
 * ── Dùng lại được, KHÔNG chép ───────────────────────────────────────────────
 * `scopedDb` · `checkPermission` · `PhanTrangBang` · `formatDateVN` ·
 * `deleteSession` (Server Action của khu quản trị — xem `nut-xoa-buoi-hoc.tsx`).
 *
 * ── Buộc phải chép (nợ trôi lệch) ───────────────────────────────────────────
 * Truy vấn danh sách + ràng buộc phân công + cửa sổ ngày nghỉ. Đã dời vào
 * `lib/sale/du-lieu-buoi-hoc.ts` để phần trùng nằm ở một tệp có tên chứ không
 * lẫn trong JSX; danh sách đầy đủ những thứ hai bản phải khớp nằm ở đầu tệp đó.
 * Ở đó cũng ghi MỘT CHỖ CỐ Ý KHÁC bản admin (mã vai chết → hỏi quyền).
 *
 * ── CỔNG QUYỀN ──────────────────────────────────────────────────────────────
 * `chanNeuThieuQuyen("/sale/buoi-hoc", …)` chạy TRƯỚC mọi truy vấn, KHÔNG phải
 * `redirect("/dashboard")` như bản admin — `/dashboard` chỉ có nghĩa trên tên
 * miền quản trị; trên host Sale và trên mọi host "không xác định" (localhost,
 * test.satarobo.vn) nó là 404 trắng trơn. Lý do đầy đủ ở `lib/sale/cong-trang.tsx`.
 *
 * ⚠️ CỔNG KHÔNG RỘNG HƠN MÀN, đã đối chiếu từng tầng:
 *      `PAGE_GATES["/sale/buoi-hoc"]` = ["sessions:view"]
 *      bản admin gác  `checkPermission("sessions:view")`          ⇒ TRÙNG KHÍT
 *    Nên KHÔNG dựng tầng thứ hai ở đây: một `if` luôn đúng là mã chết, và mã
 *    chết trong cổng quyền là thứ người sau đọc rồi tưởng đã được bảo vệ hai lần.
 *
 * ⚠️ ĐƯỜNG GHI HẸP HƠN CỔNG XEM. Cả `createSession`, `updateSession` lẫn
 *    `deleteSession` đều gác `sessions:edit` (`_actions.ts:requireTeacherOrAdmin`),
 *    và khi thiếu quyền chúng `redirect("/dashboard?error=unauthorized")` — trên
 *    host Sale là 404 trắng, tệ hơn cả một câu báo lỗi. Nên ba lối ghi (Thêm buổi
 *    học · Sửa · Xoá) chỉ được vẽ khi có `sessions:edit`. Vẽ một cái nút chỉ để
 *    nó bắn người dùng vào trang trắng là hứa suông. Cùng nếp với nút "Chạy quét
 *    sinh nhật" ở `/sale/sinh-nhat`.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { checkPermission } from "@/lib/auth/check-permission";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { GiaiThichTrang } from "@/components/sale/ui/giai-thich-trang";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { formatDateVN } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import {
  chuoiNgayGio,
  docDanhSachBuoiHoc,
  docPhamVi,
  NHAN_PHAM_VI,
  TRAN_BUOI,
} from "@/lib/sale/du-lieu-buoi-hoc";
import { BoLocBuoiHoc } from "./_components/bo-loc-buoi-hoc";
import { BangBuoiHoc, type DongBangBuoi } from "./_components/bang-buoi-hoc";

export const dynamic = "force-dynamic";
export const metadata = { title: "Buổi học | Tư vấn tuyển sinh" };

type ThamSo = {
  searchParams: Promise<{ scope?: string; classId?: string }>;
};

export default async function ManBuoiHocSale({ searchParams }: ThamSo) {
  const chan = await chanNeuThieuQuyen("/sale/buoi-hoc", "Buổi học");
  if (chan) return chan;

  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fbuoi-hoc");

  const sp = await searchParams;
  const phamVi = docPhamVi(sp.scope);
  const classId = sp.classId?.trim() || undefined;

  // Hỏi quyền MỘT LẦN rồi truyền xuống — hỏi rải rác ở nhiều chỗ là cách chắc
  // chắn để hai chỗ trả lời khác nhau khi cờ RBAC đổi (bài học 10/07 site admin).
  const [ghiDuoc, xemDuocMoiLop, actor] = await Promise.all([
    checkPermission("sessions:edit"),
    checkPermission("classes:view-all"),
    resolveActor(session.user.id),
  ]);

  const { buoi, lop, ngayNghi } = await docDanhSachBuoiHoc({
    actor,
    userId: session.user.id,
    phamVi,
    classId,
    xemDuocMoiLop,
  });

  // QA 20/07 Vấn đề C — bộ lọc hiện tại, để form Sửa quay về đúng ngữ cảnh.
  // ⚠️ NỢ ĐÃ BIẾT: chuỗi này vẫn trỏ `/sessions` (đường KHU QUẢN TRỊ), CÓ CHỦ
  //    ĐÍCH. Bản Sale chưa có màn sửa buổi, nên nút "Sửa" vốn đã là một liên kết
  //    404 trên host Sale (xem `bang-buoi-hoc.tsx`); đổi `returnTo` sang
  //    `/sale/buoi-hoc` chỉ khiến người mở đúng liên kết đó TRÊN HOST ADMIN bị
  //    ném ra khỏi khu quản trị sau khi lưu. Giữ nguyên = không tạo hồi quy mới.
  const thamSoQuayVe = new URLSearchParams();
  if (phamVi !== "upcoming") thamSoQuayVe.set("scope", phamVi);
  if (classId) thamSoQuayVe.set("classId", classId);
  const quayVe = thamSoQuayVe.toString()
    ? `/sessions?${thamSoQuayVe.toString()}`
    : "/sessions";

  // Định dạng ngày/giờ ở MÁY CHỦ rồi truyền chuỗi xuống — xem `chuoiNgayGio`.
  const bayGio = Date.now();
  const dong: DongBangBuoi[] = buoi.map((b) => ({
    id: b.id,
    ngayGio: chuoiNgayGio(b.date),
    daDienRa: b.date.getTime() < bayGio,
    chuDe: b.topic,
    tenLop: b.class.name,
    soDiemDanh: b._count.attendances,
  }));

  return (
    <KhungDuLieu className="max-w-[84rem]">
      <KhungDuLieu.Dau
        ten="Buổi học"
        mo={
          <>
            Đang xem:{" "}
            <span className="font-medium text-foreground">{NHAN_PHAM_VI[phamVi]}</span> ·{" "}
            {buoi.length} buổi
            {buoi.length >= TRAN_BUOI ? "+ (hiển thị 200 mới nhất)" : ""}
          </>
        }
        hanhDong={
          ghiDuoc ? (
            /* ⚠️ NỢ ĐÃ BIẾT — `/sessions/new` là đường của KHU QUẢN TRỊ. Trên
               host `sale.satarobo.vn`, `decideRoute` viết lại mọi đường lạ thành
               `/sale/<đường>` (route-policy.ts, nhánh host "sale") nên nó thành
               `/sale/sessions/new` → 404. Bản mount cũ cũng đã như vậy: giữ
               nguyên ở đây là KHÔNG tạo hồi quy, chứ không phải là đúng. Vá thật
               = dựng màn tạo buổi trong `app/(sale)/sale/buoi-hoc/**`, và đó là
               việc THÊM MÀN, phải hỏi chủ dự án. */
            <Link
              href="/sessions/new"
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-medium",
                "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
                "transition-colors hover:bg-[color:var(--primary-dark)]",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2",
              )}
            >
              <Plus className="h-4 w-4" />
              Thêm buổi học
            </Link>
          ) : null
        }
      />

      {/* Dải ngày nghỉ ở bản admin là một thẻ VÀNG luôn mở, nằm chen giữa bộ lọc
          và bảng — nó chiếm chỗ của dữ liệu mỗi ngày để nói một điều người trực
          chỉ cần đọc một lần. Nay nó vào `GiaiThichTrang` (thu lại theo mặc
          định, `<details>` gốc nên chạy trước cả khi JS tải xong). Không mất một
          chữ nào, kể cả câu trong ngoặc. */}
      {ngayNghi.length > 0 && (
        <GiaiThichTrang nhan="🎌 Ngày nghỉ sắp tới (buổi trùng đã được tự dời)">
          <div className="flex flex-wrap gap-2">
            {ngayNghi.map((n) => (
              <span
                key={n.id}
                className="rounded-full bg-state-warning-soft px-2.5 py-1 text-xs text-state-warning-ink"
              >
                {n.name}: {formatDateVN(n.date)}
                {n.endDate ? `–${formatDateVN(n.endDate)}` : ""}
                {n.center?.name ? ` · ${n.center.name}` : " · Toàn hệ thống"}
              </span>
            ))}
          </div>
        </GiaiThichTrang>
      )}

      <KhungDuLieu.Loc>
        <BoLocBuoiHoc phamVi={phamVi} classId={classId ?? ""} lop={lop} />
      </KhungDuLieu.Loc>

      <BangBuoiHoc dong={dong} quayVe={quayVe} ghiDuoc={ghiDuoc} />
    </KhungDuLieu>
  );
}
