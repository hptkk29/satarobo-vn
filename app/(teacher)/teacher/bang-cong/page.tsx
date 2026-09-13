// app/(teacher)/teacher/bang-cong/page.tsx — #06 (L6): "Bảng công" site GV.
//
// Bố cục theo reference TeachUI: 4 StatCard (Số ca · Buổi dạy · Tổng giờ công ·
// Ngày nghỉ) + bảng CHI TIẾT CA gộp 3 loại: Dạy (ClassSession) · Trải nghiệm
// (TrialClassSession) · Ca làm (ShiftRegistration). Mỗi CA: giờ + trạng thái
// (Đã làm/Sắp tới theo ngày). Chọn tháng qua ?thang=YYYY-MM.
//
// L5 chấm công v3 (06/09/2026): ca làm đọc từ lưới ShiftAssignment (Quản lý xếp), công
// ngày từ StaffAttendanceDay (engine tính theo ca — T-01), đơn từ là WorkRequest nộp ở
// /teacher/don-tu. Giờ dạy/trải nghiệm vẫn là ước tính từ khung giờ (không phải công).
//
// 🔴 Vá 10/09/2026 — LẦN THỨ BA site GV dựng lại con số của admin. Hai bug cùng gốc:
//   · ngày nghỉ X/P hiện "Ca làm · theo nơi làm" (lọc bằng `isLeave`, mà X mang isLeave=false);
//   · Trạng thái in "Đã làm" cho MỌI dòng quá khứ vì `done = dateKey < todayKey`.
// `getMyAttendanceDays` VỐN đã được gọi ở màn này — nhưng chỉ để cộng một con tổng, còn từng
// dòng thì tự suy từ ngày. Nay mọi ô số/nhãn đi qua `lib/cham-cong/nhan-ca.ts` (dùng chung với
// admin) và đọc thẳng `StaffAttendanceDay` — KHÔNG có phép tính thứ hai ở đây.
//
// Nguồn (own-rows): getMyAssignments/getMyAttendanceDays (lib/cham-cong/my-schedule) ·
// getTeacherTrialSessions (lib/lms/teacher-schedule); buổi dạy qua
// withMakeupException (dạy thay/bù liên cơ sở). ⚠️ Câu 46: chỉ tên lớp/cơ sở + giờ — không HV/PH.
import Link from "next/link";
import {
  AlarmClock,
  CalendarCheck,
  CalendarOff,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
} from "lucide-react";
import type { SessionStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { withMakeupException } from "@/lib/db-scope";
import { checkPermission } from "@/lib/auth/check-permission";
import {
  getTeacherTrialSessions,
} from "@/lib/lms/teacher-schedule";
import {
  getMyAssignments,
  getMyAttendanceDays,
} from "@/lib/cham-cong/my-schedule";
import {
  NHAN_TRANG_THAI,
  type TrangThaiNgay,
} from "@/lib/cham-cong/nhan-ca";
import {
  dungDongBangCong,
  tomTatCongThang,
  type LoaiOCa,
} from "@/lib/cham-cong/bang-cong-gv";
import { resolveHomeCenter } from "@/lib/cham-cong/home-center";
import { FlagList } from "@/components/cham-cong/ui/flag-chip";
import { scopedDb } from "@/lib/db-scope";
import {
  WR_KIND_LABEL,
  WR_STATUS_LABEL,
  type WorkRequestKindV,
  type WorkRequestStatusV,
} from "@/lib/work-request";
import { cn } from "@/lib/utils";
import { dieuKienBuoiTinhCong } from "@/lib/lms/session-ownership";
import { PageHeader } from "../_components/ui/page-header";
import { StatCard } from "../_components/ui/stat-card";
import { EmptyState } from "../_components/ui/empty-state";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";

export const metadata = { title: "Bảng công | Giáo viên Sata Robo" };

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function vnTodayUtc(now = new Date()): Date {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  return new Date(
    Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()),
  );
}
function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function addMonthsUtc(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}
function toVnInstant(dayUtc: Date): Date {
  return new Date(dayUtc.getTime() - VN_OFFSET_MS);
}
const two = (n: number) => String(n).padStart(2, "0");
function monthKey(monthStart: Date): string {
  return `${monthStart.getUTCFullYear()}-${two(monthStart.getUTCMonth() + 1)}`;
}
function parseThang(raw?: string): Date | null {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return null;
  const [y, m] = raw.split("-").map(Number);
  if (y < 2000 || y > 2100 || m < 1 || m > 12) return null;
  return new Date(Date.UTC(y, m - 1, 1));
}

function parseHHmm(s: string | null): number | null {
  if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}
/** Giờ (số) giữa 2 mốc "HH:mm" — thiếu/không hợp lệ → 0. */
function hoursBetween(start: string | null, end: string | null): number {
  const a = parseHHmm(start);
  const b = parseHHmm(end);
  if (a === null || b === null || b <= a) return 0;
  return (b - a) / 60;
}
const fmtHours = (h: number) =>
  h.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
/** "sáng" (<12) · "chiều" (12–17) · "tối" (≥17) từ giờ bắt đầu — đặt tên "Ca dạy …". */
function shiftOfDay(start: string | null): string {
  const m = parseHHmm(start);
  if (m === null) return "";
  if (m < 12 * 60) return "sáng";
  if (m < 17 * 60) return "chiều";
  return "tối";
}

/** "YYYY-MM-DD" theo giờ VN cho cột Timestamptz. */
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});
function isoKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "2026-08-03" → "03/08/2026". Đảo chuỗi thuần, không đụng múi giờ. */
function viDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
/* Ngày HIỂN THỊ trong bảng công — dd/mm/yyyy. (`isoKey`/`dayKeyFmt` ở trên vẫn
   giữ ISO vì chúng là KHOÁ tra bản đồ, không phải chữ cho người đọc.)
   timeZone UTC là cố ý: cột `date` kiểu @db.Date, đổi múi giờ sẽ lệch một ngày. */
const dateFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

const REQ_STATUS_CLS: Record<WorkRequestStatusV, string> = {
  PENDING: "bg-state-warning-soft text-state-warning-ink",
  APPROVED: "bg-state-success-soft text-state-success-ink",
  REJECTED: "bg-state-danger-soft text-state-danger-ink",
};

const TYPE_TONE: Record<LoaiOCa, string> = {
  Dạy: "bg-state-info-soft text-state-info-ink",
  "Trải nghiệm": "bg-primary-soft text-primary-ink",
  "Ca làm": "bg-muted text-muted-foreground",
  Nghỉ: "bg-muted text-muted-foreground",
  "Nghỉ phép": "bg-state-warning-soft text-state-warning-ink",
};

/** Tông của chip Trạng thái. Chỉ "Đã làm" được nhuộm xanh — nhãn khẳng định thì phải có chứng. */
const TRANG_THAI_TONE: Record<TrangThaiNgay, string> = {
  DA_LAM: "bg-state-success-soft text-state-success-ink",
  SAP_TOI: "bg-state-info-soft text-state-info-ink",
  NGHI: "bg-muted text-muted-foreground",
  CHUA_CHAM: "bg-state-warning-soft text-state-warning-ink",
  CHUA_TINH: "bg-muted text-muted-foreground",
  CHUA_CHOT: "bg-state-warning-soft text-state-warning-ink",
};

/** 411 phút → "6h51". Giống hệt `fmtMin` của màn admin /cham-cong/lich-ca. */
const fmtMin = (m: number) =>
  m ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : "—";

/** Đếm đơn theo trạng thái. Tách ra để lời gọi trong JSX đọc được, không phải để tính gì. */
function demDon(
  ds: readonly { status: string }[],
  tt: "PENDING" | "REJECTED",
): number {
  return ds.filter((d) => d.status === tt).length;
}

/**
 * Một nhóm nhãn→giá trị trong khối gấp lại.
 *
 * `nhacDonTu`: khi nhóm "Ngày có vấn đề" có số > 0 thì chỉ luôn đường đi tiếp. Chủ dự án:
 * "Đây là thứ người dùng cần thấy để đi nộp đơn, và hôm nay họ không thấy" — bày con số mà
 * không bày lối đi thì mới đi được nửa quãng.
 */
function ThongTinNhom({
  tieuDe,
  dong,
  nhacDonTu = false,
}: {
  tieuDe: string;
  dong: [string, string][];
  nhacDonTu?: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">
        {tieuDe}
      </p>
      <dl className="space-y-1">
        {dong.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-2">
            <dt className="text-sm text-muted-foreground">{k}</dt>
            <dd className="text-sm font-semibold text-foreground tabular-nums">
              {v}
            </dd>
          </div>
        ))}
      </dl>
      {nhacDonTu && (
        <Link
          href="/teacher/don-tu?type=TIMESHEET_FIX"
          className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
        >
          Nộp đơn chỉnh công →
        </Link>
      )}
    </div>
  );
}

export default async function TeacherTimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ thang?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate

  const sp = await searchParams;
  const todayUtc = vnTodayUtc();
  const todayKey = isoKey(todayUtc);
  const thisMonth = startOfMonthUtc(todayUtc);
  const monthStart = parseThang(sp.thang) ?? thisMonth;
  const nextMonth = addMonthsUtc(monthStart, 1);
  const isCurrentMonth = monthStart.getTime() === thisMonth.getTime();

  const actor = await resolveActor(session.user.id);
  const xdb = withMakeupException(actor);
  const classIds = [...actor.assignedClassIds];

  // L5 chấm công v3: ca làm đọc từ lưới ShiftAssignment; công ngày từ StaffAttendanceDay;
  // đơn từ (chỉnh công, đổi ca, nghỉ…) là WorkRequest — nộp ở /teacher/don-tu.
  const canRequestAdjust = await checkPermission("hr_attendance:checkin", {
    centerId: session.user.centerId ?? "hoi-so",
  });
  const sdb = scopedDb(actor);

  const [sessions, trials, shiftRows, myDays, myRequests] =
    await Promise.all([
      // Buổi lớp trong tháng (mọi trạng thái trừ hủy) — lớp mình / thực dạy.
      xdb.classSession.findMany({
        where: {
          status: { not: "CANCELLED" },
          date: { gte: toVnInstant(monthStart), lt: toVnInstant(nextMonth) },
          // ⚠️ Trước 08/09/2026 thiếu nhánh `substituteTeacherId`: buổi được xếp dạy
          // thay KHÔNG hiện trên bảng công của chính người dạy thay. Luật ở MỘT chỗ:
          // `dieuKienBuoiTinhCong` (`lib/lms/session-ownership.ts`) — và nó cố ý KHÁC
          // `isSessionOwnedByTeacher`: quyền xem ≠ công đứng lớp.
          ...dieuKienBuoiTinhCong(session.user.id, classIds),
        },
        select: {
          id: true,
          date: true,
          status: true,
          class: {
            select: {
              name: true,
              startTime: true,
              endTime: true,
              center: { select: { name: true } },
            },
          },
        },
        orderBy: { date: "asc" },
        take: 500,
      }),
      getTeacherTrialSessions(session.user.id, monthStart, nextMonth),
      getMyAssignments(session.user.id, monthStart, nextMonth),
      getMyAttendanceDays(session.user.id, monthStart, nextMonth),
      sdb.workRequest.findMany({
        where: {
          requesterId: session.user.id,
          fromDate: { gte: monthStart, lt: nextMonth },
        },
        select: {
          id: true,
          kind: true,
          status: true,
          fromDate: true,
          requestedInAt: true,
          requestedOutAt: true,
          reason: true,
          reviewNote: true,
          applyError: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);
  // ── Kỳ công của tháng đang xem ────────────────────────────────────────────────
  // `standardUnits` là MẪU SỐ của thẻ "Công tháng này", và nó sống ở `AttendancePeriod`
  // theo (cơ sở × kỳ) — không phải theo người. Đọc bằng cơ sở NHÀ (`resolveHomeCenter`),
  // đúng cơ sở mà `buildPeriodSummary` của admin dùng cho người này.
  //
  // ⚠️ `standardUnits` CÓ THỂ null (kỳ chưa lập, hoặc kế toán chưa điền). Null thì in "—".
  // In 0 là bịa một mẫu số, và mẫu số bịa thì mọi tỷ lệ đọc từ nó đều sai.
  const nha = await resolveHomeCenter(session.user.id);
  const kyCong = await sdb.attendancePeriod.findFirst({
    where: { centerId: nha.centerId, periodKey: monthKey(monthStart) },
    select: { standardUnits: true, status: true },
  });
  const tomTat = tomTatCongThang({
    ngay: myDays.map((d) => d.gop),
    congChuan: kyCong?.standardUnits ?? null,
    // Chỉ `LOCKED` mới là đã chốt. `REOPENED` là kỳ đã mở lại ⇒ số còn đổi được ⇒ TẠM TÍNH.
    kyDaChot: kyCong?.status === "LOCKED",
  });

  // ── Chuẩn hoá về CA rows ──────────────────────────────────────────────────────
  // 🔴 Phép nối "ngày công đã tính × ca đã xếp" nằm ở `lib/cham-cong/bang-cong-gv.ts`, KHÔNG
  // ở đây. Trang chỉ chuyển dữ liệu về hình dạng của hàm đó rồi in ra. Đây là chỗ đã ba lần
  // đẻ ra một bản tính thứ hai cho con số admin đã có (luật 12b).
  const rows = dungDongBangCong({
    buoi: [
      ...sessions.map((s) => {
        const hrs = hoursBetween(s.class.startTime, s.class.endTime);
        return {
          key: `d-${s.id}`,
          ngay: dayKeyFmt.format(s.date),
          loai: "Dạy" as const,
          ten: `Ca dạy ${shiftOfDay(s.class.startTime)}`.trim(),
          phu:
            [s.class.name, s.class.center?.name].filter(Boolean).join(" · ") || null,
          gio:
            s.class.startTime && s.class.endTime
              ? `${s.class.startTime}–${s.class.endTime}`
              : "—",
          soGio: hrs > 0 ? hrs : null,
          hoanTat: (s.status as SessionStatus) === "COMPLETED",
        };
      }),
      ...trials.map((t) => {
        const hrs = hoursBetween(t.startTime, t.endTime);
        return {
          key: `t-${t.id}`,
          ngay: isoKey(t.date),
          loai: "Trải nghiệm" as const,
          ten: t.trialClassName,
          phu: null,
          gio: `${t.startTime}–${t.endTime}`,
          soGio: hrs > 0 ? hrs : null,
          hoanTat: t.status === "COMPLETED",
        };
      }),
    ],
    ca: shiftRows.map((r) => ({
      ngay: isoKey(r.date),
      ma: r.code,
      ten: r.name,
      kind: r.kind,
      noi: r.centerLabel,
      gio: r.timeLabel,
    })),
    cong: myDays.map((d) => ({
      ngay: isoKey(d.date),
      phutLam: d.worked,
      cong: d.units,
      flags: d.flags,
      ma: d.code,
    })),
    homNay: todayKey,
  });

  // ── Tổng hợp ─────────────────────────────────────────────────────────────────
  // ⚠️ HAI THẺ BỊ GỠ 13/09/2026 vì nhãn NÓI SAI thứ chúng đếm (mục 1, luật 12):
  //
  //  · "Ngày nghỉ" cũ = `holidayDays.size`, dựng từ `getVisibleHolidays` ⇒ nó đếm ngày LỄ
  //    CỦA CÔNG TY, không phải ngày nghỉ của người đang xem. Ai nghỉ phép 5 ngày vẫn thấy
  //    đúng số ngày lễ trong tháng. Nay đọc từ `StaffAttendanceDay.dayType`, tách 4 nhóm.
  //
  //  · "Số ca" cũ = `demCaLam(rows)`, mà `rows` là DÒNG của bảng: buổi dạy + ca làm + ngày
  //    mồ côi. Một GV dạy 2 lớp trong ngày có 1 ca làm được đếm 3 — và 2 trong số đó đã nằm
  //    ở thẻ "Buổi dạy" ngay cạnh. Nó là "số dòng làm việc", không phải "số ca".
  //
  // Cả hai thay bằng bốn số của `tomTatCongThang`, lấy từ CÙNG phép gộp admin dùng
  // (`gopNgayCong`). Số buổi dạy giữ lại nhưng chuyển vào khối gấp, mục "Công dạy".
  const teachingCount = rows.filter((r) => r.loai === "Dạy").length;
  const trialCount = rows.filter((r) => r.loai === "Trải nghiệm").length;
  const totalHours = rows.reduce((n, r) => n + (r.soGio ?? 0), 0);

  const monthLabel = `Tháng ${monthStart.getUTCMonth() + 1}/${monthStart.getUTCFullYear()}`;

  return (
    <div>
      <PageHeader
        title="Bảng công"
        subtitle="Số ca và giờ công theo tháng — giờ dạy/trải nghiệm ước tính từ khung giờ; công chính thức là số Công (tính theo ca đã xếp)."
        actions={
          canRequestAdjust ? (
            <Link
              href="/teacher/don-tu?type=TIMESHEET_FIX"
              className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Đơn chỉnh công
            </Link>
          ) : null
        }
      />

      <div className="space-y-6">
        {/* Chọn tháng */}
        <div className="flex flex-wrap items-center gap-2">
          <NavLink
            href={`?thang=${monthKey(addMonthsUtc(monthStart, -1))}`}
            aria="Tháng trước"
          >
            <ChevronLeft className="h-4 w-4" />
          </NavLink>
          <NavLink href={`?thang=${monthKey(nextMonth)}`} aria="Tháng sau">
            <ChevronRight className="h-4 w-4" />
          </NavLink>
          <Link
            href="?"
            scroll={false}
            className="ml-1 inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/50"
          >
            Tháng này
          </Link>
          <p className="ml-2 text-base font-bold text-foreground">
            {monthLabel}
          </p>
          {/* TẠM TÍNH đọc từ TRẠNG THÁI KỲ, không đoán theo "có phải tháng này không".
              Tháng 7 đã qua mà kỳ chưa chốt thì số vẫn còn đổi được — bản cũ in nó như số
              cuối cùng. Vế "đến hôm nay" giữ riêng cho tháng đang chạy vì nó nói thêm một
              điều khác: dữ liệu mới chạy được nửa tháng. */}
          {tomTat.tamTinh && (
            <span className="rounded bg-state-warning-soft px-2 py-0.5 text-xs font-semibold text-state-warning-ink">
              TẠM TÍNH{isCurrentMonth ? " — đến hôm nay" : " — kỳ chưa chốt"}
            </span>
          )}
        </div>

        {/* ── BỐN số (mục 1) ───────────────────────────────────────────────────
            Chủ dự án chốt: "Đừng bày mười số ngang nhau, không ai đọc số nào."
            Phần còn lại nằm trong khối gấp lại ngay dưới. */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={Clock}
            value={
              tomTat.congChuan == null
                ? `${tomTat.cong}`
                : `${tomTat.cong} / ${tomTat.congChuan}`
            }
            label={
              tomTat.congChuan == null
                ? "Công tháng này (chưa có công chuẩn)"
                : "Công tháng này / công chuẩn"
            }
            xuongDong
            tone="brand"
          />
          <StatCard
            icon={CalendarCheck}
            value={`${tomTat.ngayDaLam} / ${tomTat.ngayCoCa}`}
            label="Ngày đã đi làm / ngày có ca"
            xuongDong
            tone="green"
          />
          {/* Số LẦN và số PHÚT cùng lúc: phạt (mục 3) tính được theo một trong hai, và
              2 lần × 3′ khác hẳn 2 lần × 90′. Đi muộn và về sớm đi chung MỘT thẻ để hàng đầu
              đúng BỐN số — `hint` giữ vế thứ hai hiện đủ, không phải giấu nó. */}
          <StatCard
            icon={AlarmClock}
            value={`${tomTat.lateCount} lần · ${tomTat.latePhut}′`}
            label="Đi muộn"
            hint={`Về sớm: ${tomTat.earlyLeaveCount} lần · ${tomTat.earlyLeavePhut}′`}
            xuongDong
            tone="amber"
          />
          <StatCard
            icon={CalendarOff}
            value={tomTat.ngayNghi}
            label="Ngày nghỉ"
            hint={
              tomTat.nhomNghi.length
                ? tomTat.nhomNghi.map((n) => `${n.nhan} ${n.soNgay}`).join(" · ")
                : "không có ngày nghỉ nào"
            }
            xuongDong
            tone="blue"
          />
        </div>

        {/* ── Khối gấp lại ─────────────────────────────────────────────────── */}
        <details className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground select-none">
            Xem thêm — nghỉ, giờ làm, ngày có vấn đề, đơn của tôi
          </summary>
          <div className="grid gap-4 border-t border-border px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
            <ThongTinNhom
              tieuDe={`Ngày nghỉ · ${tomTat.ngayNghi}`}
              dong={
                tomTat.nhomNghi.length
                  ? tomTat.nhomNghi.map((n) => [n.nhan, String(n.soNgay)])
                  : [["Không có ngày nghỉ nào", ""]]
              }
            />
            <ThongTinNhom
              tieuDe="Giờ làm"
              dong={[
                ["Thực tế", fmtMin(tomTat.phutLam)],
                ["Kế hoạch", fmtMin(tomTat.phutKeHoach)],
              ]}
            />
            {/* "Đây là thứ người dùng cần thấy để đi nộp đơn, và hôm nay họ không thấy." */}
            <ThongTinNhom
              tieuDe="Ngày có vấn đề"
              dong={[
                ["Thiếu lượt ra", String(tomTat.thieuLuotRa)],
                ["Chưa chấm", String(tomTat.chuaCham)],
                ["Chỉnh tay", String(tomTat.chinhTay)],
              ]}
              nhacDonTu={tomTat.thieuLuotRa + tomTat.chuaCham > 0}
            />
            <ThongTinNhom
              tieuDe="Đơn của tôi"
              dong={[
                ["Đã nộp", String(myRequests.length)],
                ["Chờ duyệt", String(demDon(myRequests, "PENDING"))],
                ["Bị từ chối", String(demDon(myRequests, "REJECTED"))],
              ]}
            />
            {/* Công dạy chỉ hiện khi CÓ — người không đứng lớp không cần một khối toàn số 0. */}
            {teachingCount + trialCount > 0 && (
              <ThongTinNhom
                tieuDe="Công dạy"
                dong={[
                  ["Lớp chính", `${teachingCount} buổi`],
                  ["Trải nghiệm", `${trialCount} buổi`],
                  ["Giờ dạy ước tính", `${fmtHours(totalHours)}h`],
                ]}
              />
            )}
          </div>
        </details>

        {/* Chi tiết ca */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
            Chi tiết ca ({rows.length})
          </h2>
          {rows.length === 0 ? (
            <EmptyState
              icon={CalendarX2}
              title="Không có ca dạy, trải nghiệm hay ca làm nào trong tháng này."
            />
          ) : (
            <div className="t-card overflow-hidden">
              <PhanTrangBang cuonNgang khoaGhiNho="gv-bang-cong">
                <table className="min-w-[1000px] w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      <th scope="col" className="px-4 py-3">
                        Ca
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Loại
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Ngày
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Giờ
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Giờ dạy
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Giờ làm
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Công
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Cờ
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Trạng thái
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.key}
                        className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold text-foreground">
                            {r.ten}
                          </p>
                          {r.phu && (
                            <p className="text-xs text-muted-foreground">
                              {r.phu}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                              TYPE_TONE[r.loai],
                            )}
                          >
                            {r.loai}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                          {viDate(r.ngay)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-foreground">
                          {r.gio}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold text-foreground">
                          {r.soGio != null ? (
                            `${fmtHours(r.soGio)}h`
                          ) : (
                            <span className="font-normal text-muted-foreground">
                              —
                            </span>
                          )}
                        </td>
                        {/* Giờ làm + Công: đọc thẳng StaffAttendanceDay — CÙNG số admin hiện. */}
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums text-foreground">
                          {r.phutLam != null ? (
                            fmtMin(r.phutLam)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold tabular-nums text-foreground">
                          {r.cong != null ? (
                            r.cong
                          ) : (
                            <span className="font-normal text-muted-foreground">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <FlagList codes={r.flags} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                              TRANG_THAI_TONE[r.trangThai],
                            )}
                          >
                            {NHAN_TRANG_THAI[r.trangThai]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </PhanTrangBang>
            </div>
          )}
        </section>

        {/* Đơn từ của mình trong tháng (chấm công v3 — WorkRequest) */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
            Đơn từ trong tháng ({myRequests.length})
          </h2>
          {myRequests.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="Chưa có đơn nào cho tháng này."
            />
          ) : (
            <ul className="space-y-2">
              {myRequests.map((r) => (
                <li key={r.id} className="t-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">
                      {WR_KIND_LABEL[r.kind as WorkRequestKindV] ?? r.kind}
                      {r.fromDate ? ` · ${dateFmt.format(r.fromDate)}` : ""}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        REQ_STATUS_CLS[r.status as WorkRequestStatusV],
                      )}
                    >
                      {WR_STATUS_LABEL[r.status as WorkRequestStatusV]}
                    </span>
                  </div>
                  {(r.requestedInAt || r.requestedOutAt) && (
                    <p className="mt-1 text-sm text-foreground">
                      Đề nghị: vào {r.requestedInAt ?? "—"} · ra{" "}
                      {r.requestedOutAt ?? "—"}
                    </p>
                  )}
                  <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
                    {r.reason}
                  </p>
                  {r.reviewNote && (
                    <p className="mt-2 rounded-lg bg-muted/50 p-2 text-sm text-muted-foreground">
                      Phản hồi: {r.reviewNote}
                    </p>
                  )}
                  {r.status === "PENDING" && r.applyError && (
                    <p className="mt-2 text-xs text-state-danger-ink">
                      Lần duyệt gần nhất không áp được: {r.applyError}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** Nút lùi/tiến tháng — `scroll={false}`: đổi tháng chỉ đổi ?thang= của CHÍNH trang này,
 *  để mặc định thì App Router cuộn vọt lên đầu, mất chỗ đang xem trong bảng chi tiết ca. */
function NavLink({
  href,
  aria,
  children,
}: {
  href: string;
  aria: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={aria}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted/50"
    >
      {children}
    </Link>
  );
}
