/**
 * Site Sale — màn "CRM" (`/sale/crm`): phễu chuyển đổi lead & hiệu suất đội sale.
 *
 * ══ BẢN ĐÔI CỦA `app/(admin)/admin/crm/page.tsx` ═════════════════════════════
 *
 * ── Vì sao tồn tại ──────────────────────────────────────────────────────────
 * Tới 04/09/2026 tệp này chỉ là một lớp bọc `<AdminCrmPage />`. Chủ dự án chốt
 * ngày đó rằng các màn site Sale phải TÁCH BẢN RIÊNG: họ muốn thiết kế lại site
 * Sale mà KHÔNG đụng một pixel nào của khu quản trị. Rủi ro trôi lệch đã được nêu
 * rõ trước khi chốt; chủ dự án vẫn chọn đường này.
 *
 * ⚠️ NGƯỜI SỬA MỘT BÊN PHẢI BIẾT CÒN BÊN KIA. Danh sách những thứ hai bản phải
 *    khớp nhau nằm ở đầu `lib/sale/crm.ts` (tám truy vấn + bốn định nghĩa số liệu).
 *
 * ── Dùng lại được, KHÔNG chép ───────────────────────────────────────────────
 * `LEAD_FUNNEL_STAGES` · `LEAD_CLOSED_STATUSES` · `LEAD_STATUS_LABEL` ·
 * `scopedDb` · `checkPermission` · `PhanTrangBang` · `KhungDuLieu`.
 *
 * ── Buộc phải chép (nợ trôi lệch) ───────────────────────────────────────────
 * Tám truy vấn tổng hợp (đã dồn vào `lib/sale/crm.ts`) và ba mảnh giao diện ở
 * `_components/` — dải chỉ số, dãy cột ngang, bảng đội sale.
 *
 * ⚠️ HAI BIỂU ĐỒ KHÔNG CÒN LÀ RECHARTS, và đó là RÀNG BUỘC chứ không phải sở
 *    thích: `eslint.config.mjs` chặn `@/components/charts/*` + `recharts` trong
 *    `app/(sale)/**`. Bản mount cũ lách được vì lời gọi nằm trong tệp admin. Lý do
 *    đầy đủ + số liệu giữ nguyên: xem `_components/day-cot-ngang.tsx`.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { checkPermission } from "@/lib/auth/check-permission";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { docSoLieuCrm } from "@/lib/sale/crm";
import { cn } from "@/lib/utils";
import { BangDoiSale } from "./_components/bang-doi-sale";
import { DaiChiSoCrm } from "./_components/dai-chi-so";
import { DayCotNgang } from "./_components/day-cot-ngang";

export const dynamic = "force-dynamic";
export const metadata = { title: "CRM | Tư vấn tuyển sinh" };

/** Băng tiêu đề của một khối trong khung — nền chìm để đọc ra là "vách ngăn". */
const BANG_TIEU_DE =
  "border-b border-border bg-[color:var(--surface-chim)] px-5 py-2.5 " +
  "text-sm font-semibold text-foreground";

export default async function ManCrmSale() {
  const chan = await chanNeuThieuQuyen("/sale/crm", "CRM");
  if (chan) return chan;

  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fcrm");

  // ⚠️ CỔNG RỘNG HƠN MÀN — đã báo lại cho chủ dự án, chưa vá được ở đây.
  //
  // `PAGE_GATES["/sale/crm"]` khai `["leads:view-all", "leads:view-own"]`, nhưng
  // bản admin của màn này đòi ĐÚNG `leads:view-all` (thiếu thì nó
  // `redirect("/dashboard")`). Nghĩa là một tư vấn viên chỉ có `view-own` QUA
  // được cổng rồi mới bị chặn — trước đợt này thì bị chặn bằng cách rơi vào
  // `/dashboard`, một đường KHÔNG tồn tại trên host Sale, tức 404 trắng trơn.
  // (Chú thích ở lớp bọc cũ nói "cổng chặn trước nên đường đó không bao giờ chạy"
  // — không đúng, đúng nhóm `view-own` là nhóm lọt qua.)
  //
  // Ở đây KHÔNG nới quyền: màn này tổng hợp lead của CẢ đội và cả cơ sở, cho một
  // người chỉ được xem lead của mình nhìn vào là mở dữ liệu, không phải sửa lỗi.
  // Chỗ vá ĐÚNG là thu cổng về `["leads:view-all"]` trong `lib/auth/page-gates.ts`
  // — tệp nằm ngoài phạm vi được sửa của đợt này. Trong lúc chờ, đá về `/sale`
  // (màn "Bảng việc hôm nay", có thật trên host Sale) thay vì `/dashboard`.
  if (!(await checkPermission("leads:view-all"))) redirect("/sale");

  const actor = await resolveActor(session.user.id);
  const so = await docSoLieuCrm(actor);

  return (
    <KhungDuLieu className="max-w-[76rem]">
      <KhungDuLieu.Dau
        ten="CRM Dashboard"
        mo="Phễu chuyển đổi lead & hiệu suất đội sale."
        hanhDong={
          // Màn Leads ĐÃ CÓ bản Sale — trỏ thẳng `/sale/leads`, không phải `/leads`
          // (đường của khu quản trị, trên host Sale bị viết lại thành
          // `/sale/leads` bằng rewrite: đúng đích nhưng thanh địa chỉ giữ URL cũ
          // và mục điều hướng không sáng đúng chỗ).
          <Link
            href="/sale/leads?view=kanban"
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3",
              "text-sm font-medium text-foreground transition-colors",
              "hover:bg-[color:var(--surface-chim)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30",
            )}
          >
            Mở Kanban Leads
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        }
      />

      <DaiChiSoCrm
        leadThangNay={so.leadThangNay}
        dangXuLy={so.dangXuLy}
        chotThangNay={so.chotThangNay}
        tiLeChuyenDoi={so.tiLeChuyenDoi}
      />

      <div className="grid border-b border-border lg:grid-cols-2">
        <section className="border-b border-border lg:border-b-0 lg:border-r">
          <h2 className={BANG_TIEU_DE}>Phễu chuyển đổi</h2>
          {/* Không có lead nào thì phễu là năm bậc số 0 — vẽ ra là năm thanh rỗng
              trông như hỏng. Truyền mảng rỗng để nó nói thẳng "Chưa có dữ liệu.",
              đúng như bản admin. */}
          <DayCotNgang du={so.tongLead === 0 ? [] : so.phieu} />
        </section>
        <section>
          <h2 className={BANG_TIEU_DE}>Lead theo nguồn</h2>
          <DayCotNgang du={so.nguon} />
        </section>
      </div>

      <section className="border-b border-border">
        <h2 className={BANG_TIEU_DE}>Hiệu suất đội sale</h2>
        <BangDoiSale dong={so.doiSale} />
      </section>

      <section>
        <h2 className={BANG_TIEU_DE}>Chi tiết theo trạng thái</h2>
        <div className="flex flex-wrap gap-2 px-5 py-4">
          {so.theoTrangThai.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
          ) : (
            so.theoTrangThai.map((x) => (
              // ⚠️ CỐ Ý KHÔNG dùng `StatusPill` ở đây. Đây là bảng ĐẾM, không phải
              // nhãn trạng thái của một bản ghi: mười chip cạnh nhau mà mỗi chip
              // một màu ngữ nghĩa thì màu chỉ còn là trang trí, và người dùng hết
              // đọc được màu ở chỗ nó thật sự có nghĩa (cột "Trạng thái" ở bảng
              // Leads). Con số mới là thứ cần đọc, nên nó là phần đậm.
              <span
                key={x.trangThai}
                className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--surface-chim)] px-3 py-1 text-xs text-muted-foreground"
              >
                {x.nhan}
                <span className="font-semibold tabular-nums text-foreground">{x.soLuong}</span>
              </span>
            ))
          )}
        </div>
      </section>
    </KhungDuLieu>
  );
}
