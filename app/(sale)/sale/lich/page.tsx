/**
 * Site Sale — màn "Lịch dạy" (lịch tổng buổi học theo tháng).
 *
 * ── ĐÂY LÀ BẢN ĐÔI CỦA `app/(admin)/admin/lich/page.tsx` ────────────────────
 * Màn này TRƯỚC ĐÂY KHÔNG TỒN TẠI trên site Sale. Chủ dự án chốt 04/09/2026:
 * các màn site Sale tách bản riêng, không dùng chung component với khu quản trị
 * nữa, để thiết kế lại giao diện Sale mà không đụng một pixel nào của khu quản
 * trị. Bản admin giữ nguyên, không sửa.
 *
 * NỘI DUNG GIỮ NGUYÊN 100%: cùng dữ liệu (buổi học trong lưới tháng, không tính
 * buổi đã huỷ), cùng nhãn tháng, cùng đầu tuần T2…CN, cùng "← Trước / Sau →".
 * Chỉ đổi CÁCH BÀY: khung `KhungDuLieu` + token tím của `sale.css`.
 *
 * ── DÙNG LẠI ĐƯỢC GÌ Ở `lib/` ───────────────────────────────────────────────
 * TẤT CẢ phần dữ liệu, không chép một dòng truy vấn nào:
 *   `monthGridRange` / `shiftMonth` — `lib/lms/calendar.ts` (hàm THUẦN)
 *   `getAdminCalendarEvents(actor, from, to)` — `lib/lms/calendar-data.ts`
 * Hàm sau nhận `actor` và tự cắt phạm vi bằng
 * `getModelVisibleCenterIds("ClassSession", actor)` — cùng cỗ máy cách ly cơ sở
 * mà `scopedDb` dùng, nên site Sale KHÔNG cần (và không được) tự viết `where`
 * theo `centerId`. Tên hàm mang chữ "Admin" là di sản đặt tên; nó không cấp
 * quyền gì, chỉ nói "phạm vi theo nhân viên" để phân biệt với bản của portal
 * (`getStudentCalendarEvents`, cắt theo học viên).
 *
 * ⚠️ CỔNG `/sale/lich` CHƯA ĐƯỢC KHAI TRONG `PAGE_GATES` — CÓ CHỦ ĐÍCH.
 *    `lib/auth/page-gates.ts` nằm ngoài phạm vi đợt này (chủ dự án tự khai).
 *    `chanNeuThieuQuyen` fail-closed: khoá chưa khai ⇒ trả màn "chưa có quyền"
 *    thay vì mở toang. Nên tới khi khoá được khai, màn này hiện thông báo cho
 *    MỌI người — đó là hành vi ĐÚNG, đừng "vá" bằng cách bỏ cổng.
 *
 *    Đề xuất cho lúc khai (khớp `checkAnyPermission` của bản admin):
 *        "/sale/lich": ["sessions:view", "classes:view-all", "classes:view-own"],
 *    Khai xong PHẢI thêm một mục vào `components/sale/sale-nav.tsx` với
 *    `perm: PAGE_GATES["/sale/lich"]`, nếu không bài kiểm "không có màn mồ côi"
 *    trong `components/sale/sale-nav.test.ts` sẽ đỏ.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { monthGridRange, shiftMonth } from "@/lib/lms/calendar";
import { getAdminCalendarEvents } from "@/lib/lms/calendar-data";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { LichThangSale } from "./_components/lich-thang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lịch dạy | Tư vấn tuyển sinh" };

/** Đọc số nguyên trên URL; giá trị lạ → mốc mặc định, không ném lỗi. */
function docSo(v: string | undefined, macDinh: number): number {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : macDinh;
}

const LOP_NUT_THANG =
  "inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-sm text-foreground transition-colors hover:bg-[color:var(--surface-chim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30";

export default async function SaleCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Flich");

  // Tên mục "Lịch tổng" là tên chủ dự án dùng khi giao việc; tiêu đề màn giữ
  // "Lịch dạy" theo đúng bản admin. Hai tên cho một màn là chuyện phải chốt —
  // đã báo lại chứ không tự chọn hộ.
  const chan = await chanNeuThieuQuyen("/sale/lich", "Lịch tổng");
  if (chan) return chan;

  const sp = await searchParams;
  const now = new Date();
  const year = docSo(sp.y, now.getFullYear());
  const month0 = docSo(sp.m, now.getMonth());

  const actor = await resolveActor(session.user.id);
  const { from, to } = monthGridRange(year, month0);
  const events = await getAdminCalendarEvents(actor, from, to);

  const truoc = shiftMonth(year, month0, -1);
  const sau = shiftMonth(year, month0, 1);

  return (
    <KhungDuLieu className="max-w-[76rem]">
      <KhungDuLieu.Dau
        ten="Lịch dạy"
        mo="Buổi học của các lớp trong tầm nhìn của bạn. Buổi đã huỷ không hiện."
      />

      {/* Điều hướng tháng nằm ở dải LỌC chứ không cạnh tiêu đề: nó là công cụ
          chọn phạm vi đang xem, cùng loại việc với một thanh lọc. Nhãn tháng
          đứng GIỮA hai nút — bản admin để nó lạc xuống trên lưới, nên mắt phải
          nhảy hai chỗ mới biết đang xem tháng nào và bấm đâu để đổi. */}
      <KhungDuLieu.Loc>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/sale/lich?y=${truoc.year}&m=${truoc.month0}`} className={LOP_NUT_THANG}>
            <ChevronLeft aria-hidden="true" className="size-4" />
            Trước
          </Link>
          <span className="min-w-[9rem] text-center text-sm font-medium tabular-nums text-foreground">
            Tháng {month0 + 1} / {year}
          </span>
          <Link href={`/sale/lich?y=${sau.year}&m=${sau.month0}`} className={LOP_NUT_THANG}>
            Sau
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </KhungDuLieu.Loc>

      {/* `overflow-x-auto` nằm ở THÂN KHUNG, không ở trang: lưới bảy cột phải tự
          cuộn bên trong khung của nó, không được đẩy cả trang trượt ngang. */}
      <KhungDuLieu.Than>
        <LichThangSale year={year} month0={month0} events={events} />
      </KhungDuLieu.Than>
    </KhungDuLieu>
  );
}
