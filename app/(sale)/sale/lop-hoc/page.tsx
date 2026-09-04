/**
 * Site Sale — màn "Lớp học" (`/sale/lop-hoc`).
 *
 * ══ BẢN ĐÔI CỦA `app/(admin)/admin/classes/page.tsx` ═══════════════════════
 *
 * ── Vì sao tồn tại ──────────────────────────────────────────────────────────
 * Tới 04/09/2026 tệp này chỉ là một lớp bọc `<AdminClassesPage searchParams/>`.
 * Chủ dự án chốt ngày đó rằng các màn site Sale phải TÁCH BẢN RIÊNG: họ muốn
 * thiết kế lại site Sale mà KHÔNG đụng một pixel nào của khu quản trị, nơi 9 vai
 * đang làm việc hằng ngày. Rủi ro trôi lệch giữa hai bản đã được nêu rõ trước
 * khi chốt; chủ dự án vẫn chọn đường này.
 *
 * ⚠️ NGƯỜI SỬA MỘT BÊN PHẢI BIẾT CÒN BÊN KIA. Danh sách những thứ hai bản phải
 *    khớp nhau nằm ở đầu `lib/sale/du-lieu-lop-hoc.ts` (truy vấn + bộ lọc) và
 *    `lib/sale/trang-thai-dao-tao.ts` (nhãn trạng thái).
 *
 * ── Dùng lại được, KHÔNG chép ───────────────────────────────────────────────
 * `getAssignableTeachers` · `ENROLLMENT_ACTIVE_STATUS_LIST` · `scopedDb` ·
 * `checkPermission` · `PhanTrangBang` · `formatDateDMY`.
 *
 * ── Buộc phải chép (nợ trôi lệch) ───────────────────────────────────────────
 * Truy vấn danh sách + bảng nhãn trạng thái + nhãn thứ trong tuần
 * (`DAY_LABELS`) + cách dựng chuỗi lịch. Đã dời vào `lib/sale/` để phần trùng
 * nằm ở tệp có tên chứ không lẫn trong JSX.
 *
 * ⚠️ CỔNG QUYỀN `chanNeuThieuQuyen` PHẢI CHẠY TRƯỚC MỌI THỨ (xem
 *    `lib/sale/cong-trang.tsx`): bản admin đá về `/dashboard`, mà đường đó là
 *    404 trắng trơn trên host Sale. Bài kiểm `page-gates.test.ts` cũng đòi đúng
 *    lời gọi này với đúng khoá `/sale/lop-hoc`.
 *
 * ⚠️ Cổng của bản admin là BA quyền (`classes:view-all` HOẶC `classes:view-own`
 *    HOẶC `session-feedback:view-all` — lối đi của Đào tạo vào tab nhận xét).
 *    `PAGE_GATES["/sale/lop-hoc"]` chỉ có hai quyền đầu, CỐ Ý: site Sale không
 *    có màn nhận xét buổi học nên vế thứ ba không dẫn tới đâu ở đây. Đừng "đồng
 *    bộ" hai cổng cho giống nhau — cấp quyền là việc của màn Phân quyền.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck2, FileSpreadsheet, Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { checkPermission } from "@/lib/auth/check-permission";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { formatDateDMY } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import {
  docDanhSachLopHoc,
  MOI_TRANG_THAI_LOP,
  type DongLop,
} from "@/lib/sale/du-lieu-lop-hoc";
import { NHAN_THU, NHAN_TRANG_THAI_LOP } from "@/lib/sale/trang-thai-dao-tao";
import type { ClassStatus } from "@prisma/client";
import { BoLocLopHoc } from "./_components/bo-loc-lop-hoc";
import { BangLopHoc, type DongBangLop } from "./_components/bang-lop-hoc";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lớp học | Tư vấn tuyển sinh" };

type ThamSo = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    centerId?: string;
    courseId?: string;
    teacherId?: string;
  }>;
};

const NUT_PHU =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 " +
  "text-sm font-medium text-foreground transition-colors hover:bg-muted " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30";

/** Chuỗi lịch dạy: "T2 · T5" + "18:00–19:30". `null` = lớp chưa có lịch. */
function chuoiLich(l: DongLop): DongBangLop["lich"] {
  const ngay = l.scheduleDays ?? [];
  if (ngay.length === 0) return null;
  const thu = [...ngay]
    .sort((a, b) => a - b)
    .map((d) => NHAN_THU[d] ?? "")
    .filter(Boolean)
    .join(" · ");
  return { thu, gio: l.startTime && l.endTime ? `${l.startTime}–${l.endTime}` : "" };
}

export default async function ManLopHocSale({ searchParams }: ThamSo) {
  const chan = await chanNeuThieuQuyen("/sale/lop-hoc", "Lớp học");
  if (chan) return chan;

  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Flop-hoc");

  const themDuoc = await checkPermission("classes:create");
  const suaDuoc = await checkPermission("classes:edit");
  const xoaDuoc = await checkPermission("classes:delete");
  const xemDuocTatCa = await checkPermission("classes:view-all");
  const xemDuocCuaMinh = await checkPermission("classes:view-own");

  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const status =
    sp.status && MOI_TRANG_THAI_LOP.includes(sp.status as ClassStatus)
      ? (sp.status as ClassStatus)
      : undefined;
  const centerId = sp.centerId?.trim() || undefined;
  const courseId = sp.courseId?.trim() || undefined;
  const teacherId = sp.teacherId?.trim() || undefined;

  const actor = await resolveActor(session.user.id);
  const { lop, coSo, khoa, giaoVien } = await docDanhSachLopHoc({
    actor,
    userId: session.user.id,
    q,
    status,
    centerId,
    courseId,
    teacherId,
    xemDuocTatCa,
    xemDuocCuaMinh,
  });

  const dong: DongBangLop[] = lop.map((l) => ({
    id: l.id,
    name: l.name,
    classCode: l.classCode,
    khoaHoc: l.course?.name ?? "—",
    coSo: l.center?.name ?? "—",
    phong: l.room?.code ?? null,
    lich: chuoiLich(l),
    giaoVien: l.teacher?.name ?? "—",
    siSo: `${l._count.enrollments}/${l.maxStudents}`,
    khaiGiang: l.startDate ? formatDateDMY(l.startDate) : "—",
    trangThai: l.status,
    soHocVien: l._count.enrollments,
    soBuoi: l._count.sessions,
  }));

  return (
    <KhungDuLieu className="max-w-[92rem]">
      <KhungDuLieu.Dau
        ten="Lớp học"
        mo={lop.length > 0 ? `${lop.length} lớp` : "Chưa có lớp nào"}
        hanhDong={
          themDuoc ? (
            <>
              {/* ⚠️ NỢ ĐÃ BIẾT — ba đích dưới đây là đường của KHU QUẢN TRỊ. Trên
                  host `sale.satarobo.vn`, `decideRoute` viết lại mọi đường lạ
                  thành `/sale/<đường>` (route-policy.ts, nhánh host "sale") nên
                  `/classes/new` thành `/sale/classes/new` → 404. Bản mount cũ
                  cũng đã như vậy: giữ nguyên ở đây là KHÔNG tạo hồi quy, chứ
                  không phải là đúng. Vá thật = dựng màn tương ứng trong
                  `app/(sale)/sale/lop-hoc/**` — thêm màn, phải hỏi chủ dự án.
                  Vai Sale hôm nay không có `classes:create` nên khối này chưa
                  hiện với ai; đó là lý do nợ chưa nổ ra. */}
              <Link href="/classes/kiem-tra-lich" className={NUT_PHU}>
                <CalendarCheck2 className="h-4 w-4" />
                Kiểm tra lịch buổi
              </Link>
              <Link href="/classes/import" className={NUT_PHU}>
                <FileSpreadsheet className="h-4 w-4" />
                Import Excel
              </Link>
              <Link
                href="/classes/new"
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-medium",
                  "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
                  "transition-colors hover:bg-[color:var(--primary-dark)]",
                  "focus-visible:outline-none focus-visible:ring-2",
                  "focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2",
                )}
              >
                <Plus className="h-4 w-4" />
                Thêm lớp
              </Link>
            </>
          ) : null
        }
      />

      <KhungDuLieu.Loc>
        <BoLocLopHoc
          banDau={{ q, status, centerId, courseId, teacherId }}
          trangThai={MOI_TRANG_THAI_LOP.map((v) => ({
            value: v,
            label: NHAN_TRANG_THAI_LOP[v],
          }))}
          coSo={coSo}
          khoa={khoa}
          giaoVien={giaoVien}
        />
      </KhungDuLieu.Loc>

      <BangLopHoc dong={dong} suaDuoc={suaDuoc} xoaDuoc={xoaDuoc} />
    </KhungDuLieu>
  );
}
