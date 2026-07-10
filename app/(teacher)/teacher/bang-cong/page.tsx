// app/(teacher)/teacher/bang-cong/page.tsx — #06 (L6): màn "Bảng công" site GV
// (port visual từ mock satarobo-ui-giaovien cham-cong/page.tsx: chọn tháng +
// StatCard tổng hợp + bảng chi tiết theo ngày + nút "Yêu cầu chỉnh công").
//
// Điều hướng THUẦN server qua searchParams: ?thang=YYYY-MM (default tháng hiện
// tại giờ VN). Mọi nút prev/next/tháng-này là Link CHỈ-query — chạy đúng cả trên
// host giaovien (clean URL /bang-cong) LẪN localhost/preview (/teacher/bang-cong).
//
// Nguồn data (own-rows, không đụng ai khác):
// • Ca đăng ký: getOwnShiftRegistrations (TÁI DÙNG lib/lms/teacher-schedule —
//   ShiftRegistration ∈ SCOPED_MODELS nên KHÔNG đi qua scopedDb kẻo ẩn oan record
//   chính mình; WHERE userId = mình là ranh giới an toàn).
// • Buổi đã dạy: ClassSession COMPLETED trong tháng, OR [classId ∈ assignedClassIds,
//   actualTeacherId = mình] qua withMakeupException (∈ MAKEUP_EXCEPTION_MODELS —
//   GV dạy bù/thay LIÊN CƠ SỞ vẫn được đếm công đúng buổi ở cơ sở khác).
// • Giờ dạy: ƯỚC TÍNH từ khung giờ lớp class.startTime/endTime ("HH:mm"); lớp
//   thiếu khung giờ → tính 0h (có ghi chú trên UI — không phải công chính thức).
// • Yêu cầu chỉnh công của mình: getOwnAdjustmentRequests (lib/attendance/
//   own-adjustments — own-rows, cùng lý do ShiftRegistration ở trên).
//
// ⚠️ Câu 46: KHÔNG SĐT/email/tên phụ huynh/học viên — chỉ tên lớp + giờ + ca làm.
// ⚠️ Múi giờ: như lich/page.tsx — ngày VN biểu diễn bằng dayUtc (UTC 00:00) so
// thẳng cột @db.Date; ClassSession.date là Timestamptz → trừ 7h (toVnInstant).
import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock, GraduationCap, Layers } from "lucide-react";
import type { AdjustStatus, ShiftRegStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { withMakeupException } from "@/lib/db-scope";
import { checkPermission } from "@/lib/auth/check-permission";
import { SHIFT_ORDER, shiftLabel } from "@/lib/shifts";
import { getOwnShiftRegistrations } from "@/lib/lms/teacher-schedule";
import { getOwnAdjustmentRequests } from "@/lib/attendance/own-adjustments";
import { cn } from "@/lib/utils";
import { AdjustRequestDialog } from "./_components/adjust-request-dialog";

export const metadata = { title: "Bảng công | Giáo viên Sata Robo" };

/* ───────────────────────────── Helpers ngày (giờ VN) ─────────────────────────────
 * Quy ước "dayUtc" như lich/page.tsx: Date tại UTC 00:00 của một NGÀY theo lịch VN. */

const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Ho_Chi_Minh (UTC+7, không DST)

/** dayUtc của NGÀY HÔM NAY theo giờ tường VN. */
function vnTodayUtc(now = new Date()): Date {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()));
}
function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function addMonthsUtc(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}
/** dayUtc → mốc UTC THẬT của 00:00 giờ VN (query cột Timestamptz như ClassSession.date). */
function toVnInstant(dayUtc: Date): Date {
  return new Date(dayUtc.getTime() - VN_OFFSET_MS);
}
const two = (n: number) => String(n).padStart(2, "0");
/** "YYYY-MM" của mốc đầu tháng — giá trị ?thang=. */
function monthKey(monthStart: Date): string {
  return `${monthStart.getUTCFullYear()}-${two(monthStart.getUTCMonth() + 1)}`;
}
/** Parse ?thang=YYYY-MM → dayUtc đầu tháng; sai định dạng/tháng ảo → null. */
function parseThang(raw?: string): Date | null {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return null;
  const [y, m] = raw.split("-").map(Number);
  if (y < 2000 || y > 2100 || m < 1 || m > 12) return null;
  return new Date(Date.UTC(y, m - 1, 1));
}

/** "HH:mm" → phút trong ngày; sai định dạng → null. */
function parseHHmm(s: string | null): number | null {
  if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}
/** Giờ dạy ước tính 1 buổi từ khung giờ lớp — thiếu/không hợp lệ → 0 (ghi chú UI). */
function estimateHours(startTime: string | null, endTime: string | null): number {
  const a = parseHHmm(startTime);
  const b = parseHHmm(endTime);
  if (a === null || b === null || b <= a) return 0;
  return (b - a) / 60;
}
const fmtHours = (h: number) =>
  h.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

/** "YYYY-MM-DD" theo giờ VN cho cột Timestamptz — khóa gộp theo ngày. */
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});
const dayFmt = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

/* ───────────────────────────────── Nhãn hiển thị ───────────────────────────────── */

const SHIFT_STATUS: Record<ShiftRegStatus, { label: string; cls: string }> = {
  REGISTERED: { label: "Đã đăng ký", cls: "bg-neutral-100 text-neutral-600" },
  APPROVED: { label: "Đã duyệt", cls: "bg-emerald-100 text-emerald-700" },
  LEAVE_REQUESTED: { label: "Xin nghỉ khẩn", cls: "bg-rose-100 text-rose-700" },
};

// Đồng bộ trang admin /admin/cham-cong/yeu-cau-cong (STATUS_BADGE/STATUS_LABEL).
const ADJUST_STATUS: Record<AdjustStatus, { label: string; cls: string }> = {
  PENDING: { label: "Chờ duyệt", cls: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Đã duyệt", cls: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "Từ chối", cls: "bg-rose-100 text-rose-700" },
};

/** Dòng bảng chi tiết: 1 ngày có ca đăng ký và/hoặc buổi đã dạy. */
type DayRow = {
  key: string; // "YYYY-MM-DD"
  labelDate: Date;
  shiftLabels: string[];
  shiftStatus: ShiftRegStatus | null;
  sessions: { id: string; className: string; time: string; hours: number }[];
};

/* ──────────────────────────────────── Page ──────────────────────────────────── */

export default async function TeacherTimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ thang?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate — guard cho type-narrow

  const sp = await searchParams;
  const todayUtc = vnTodayUtc();
  const thisMonth = startOfMonthUtc(todayUtc);
  const monthStart = parseThang(sp.thang) ?? thisMonth;
  const nextMonth = addMonthsUtc(monthStart, 1);
  const isCurrentMonth = monthStart.getTime() === thisMonth.getTime();

  const actor = await resolveActor(session.user.id);
  const xdb = withMakeupException(actor);
  const classIds = [...actor.assignedClassIds];

  // Nút "Yêu cầu chỉnh công": gate đúng bằng permission mà action tái dùng kiểm tra
  // (hr_attendance:checkin — matrix v1 CÓ TEACHER). Fail → ẩn nút, không nới quyền.
  const canRequestAdjust = await checkPermission("hr_attendance:checkin", {
    centerId: session.user.centerId,
  });

  const [shiftRows, sessions, adjustRequests] = await Promise.all([
    // Ca của CHÍNH MÌNH trong tháng (own-rows — xem ghi chú đầu file).
    getOwnShiftRegistrations(session.user.id, monthStart, nextMonth),
    // Buổi ĐÃ DẠY: lớp mình phụ trách HOẶC mình thực dạy (dạy thay/dạy bù),
    // kể cả ở cơ sở khác (withMakeupException). Câu 46: chỉ lấy tên lớp + giờ.
    xdb.classSession.findMany({
      where: {
        status: "COMPLETED",
        date: { gte: toVnInstant(monthStart), lt: toVnInstant(nextMonth) },
        OR: [{ classId: { in: classIds } }, { actualTeacherId: session.user.id }],
      },
      select: {
        id: true,
        date: true,
        class: { select: { name: true, startTime: true, endTime: true } },
      },
      orderBy: { date: "asc" },
      take: 500,
    }),
    // Yêu cầu chỉnh công CỦA MÌNH có ngày công trong tháng (own-rows qua lib).
    getOwnAdjustmentRequests(session.user.id, monthStart, nextMonth),
  ]);

  // ── Tổng hợp ────────────────────────────────────────────────────────────────
  // Số ca đăng ký = tổng số ca trên các ngày (1 record/ngày, mỗi record nhiều ca).
  const totalShifts = shiftRows.reduce((n, r) => n + r.shifts.length, 0);
  const totalHours = sessions.reduce(
    (n, s) => n + estimateHours(s.class.startTime, s.class.endTime),
    0,
  );

  // ── Gộp theo NGÀY (khóa "YYYY-MM-DD" giờ VN) cho bảng chi tiết ────────────────
  const byDay = new Map<string, DayRow>();
  const dayRow = (key: string, labelDate: Date): DayRow => {
    let r = byDay.get(key);
    if (!r) {
      r = { key, labelDate, shiftLabels: [], shiftStatus: null, sessions: [] };
      byDay.set(key, r);
    }
    return r;
  };
  for (const r of shiftRows) {
    // @db.Date trả UTC 00:00 = 07:00 VN cùng ngày lịch → toISOString cắt 10 khớp khóa VN.
    const row = dayRow(r.date.toISOString().slice(0, 10), r.date);
    row.shiftLabels = SHIFT_ORDER.filter((c) => r.shifts.includes(c)).map(shiftLabel);
    row.shiftStatus = r.status;
  }
  for (const s of sessions) {
    const row = dayRow(dayKeyFmt.format(s.date), s.date);
    row.sessions.push({
      id: s.id,
      className: s.class.name,
      time:
        s.class.startTime && s.class.endTime
          ? `${s.class.startTime}–${s.class.endTime}`
          : "—",
      hours: estimateHours(s.class.startTime, s.class.endTime),
    });
  }
  const dayRows = [...byDay.values()].sort((a, b) => a.key.localeCompare(b.key));

  const monthLabel = `Tháng ${monthStart.getUTCMonth() + 1}/${monthStart.getUTCFullYear()}`;

  return (
    <div className="space-y-6">
      {/* Header + nút yêu cầu chỉnh công (port PageHeader actions từ mock) */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Bảng công</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Ca đăng ký và buổi đã dạy theo tháng — giờ dạy là ước tính từ khung giờ
            lớp, không phải công chính thức.
          </p>
        </div>
        {canRequestAdjust && (
          <AdjustRequestDialog defaultDate={todayUtc.toISOString().slice(0, 10)} />
        )}
      </div>

      {/* Chọn tháng — toàn Link CHỈ-query (giữ path hiện tại) */}
      <div className="flex flex-wrap items-center gap-2">
        <NavLink href={`?thang=${monthKey(addMonthsUtc(monthStart, -1))}`} aria="Tháng trước">
          <ChevronLeft className="h-4 w-4" />
        </NavLink>
        <NavLink href={`?thang=${monthKey(nextMonth)}`} aria="Tháng sau">
          <ChevronRight className="h-4 w-4" />
        </NavLink>
        <Link
          href="?"
          className="ml-1 inline-flex h-9 items-center rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-500 transition-colors hover:bg-neutral-50"
        >
          Tháng này
        </Link>
        <p className="ml-2 text-base font-bold text-neutral-900">{monthLabel}</p>
        {isCurrentMonth && (
          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
            tạm tính đến hôm nay
          </span>
        )}
      </div>

      {/* Tổng hợp (port StatCard từ mock — dựng bằng token repo, không thêm dep) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={<Layers className="h-5 w-5" />}
          tone="bg-violet-100 text-violet-700"
          value={String(totalShifts)}
          label="Số ca đăng ký"
        />
        <StatCard
          icon={<GraduationCap className="h-5 w-5" />}
          tone="bg-emerald-100 text-emerald-700"
          value={String(sessions.length)}
          label="Buổi đã dạy"
        />
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          tone="bg-blue-100 text-blue-700"
          value={`${fmtHours(totalHours)}h`}
          label="Giờ dạy (ước tính)"
        />
      </div>

      {/* Chi tiết theo ngày */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-500">
          Chi tiết theo ngày ({dayRows.length})
        </h2>
        {dayRows.length === 0 ? (
          <EmptyBox text="Không có ca đăng ký hay buổi dạy nào trong tháng này." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    <th scope="col" className="px-4 py-3">Ngày</th>
                    <th scope="col" className="px-4 py-3">Ca đăng ký</th>
                    <th scope="col" className="px-4 py-3">Buổi đã dạy</th>
                    <th scope="col" className="px-4 py-3 text-right">Giờ dạy (ước tính)</th>
                  </tr>
                </thead>
                <tbody>
                  {dayRows.map((r) => {
                    const dayHours = r.sessions.reduce((n, s) => n + s.hours, 0);
                    return (
                      <tr
                        key={r.key}
                        className="border-b border-neutral-100 align-top transition-colors last:border-0 hover:bg-neutral-50"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-semibold capitalize text-neutral-900">
                          {dayFmt.format(r.labelDate)}
                        </td>
                        <td className="px-4 py-3">
                          {r.shiftLabels.length === 0 ? (
                            <span className="text-neutral-400">—</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {r.shiftLabels.map((l) => (
                                <span
                                  key={l}
                                  className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-semibold text-violet-700"
                                >
                                  {l}
                                </span>
                              ))}
                              {r.shiftStatus && (
                                <span
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-xs font-medium",
                                    SHIFT_STATUS[r.shiftStatus].cls,
                                  )}
                                >
                                  {SHIFT_STATUS[r.shiftStatus].label}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r.sessions.length === 0 ? (
                            <span className="text-neutral-400">—</span>
                          ) : (
                            <div className="space-y-1">
                              {r.sessions.map((s) => (
                                <p key={s.id} className="text-neutral-700">
                                  <span className="font-medium text-neutral-900">
                                    {s.className}
                                  </span>{" "}
                                  <span className="text-xs text-neutral-500">{s.time}</span>
                                </p>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-neutral-900">
                          {r.sessions.length === 0 ? (
                            <span className="font-normal text-neutral-400">—</span>
                          ) : (
                            `${fmtHours(dayHours)}h`
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Yêu cầu chỉnh công của mình trong tháng */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-500">
          Yêu cầu chỉnh công trong tháng ({adjustRequests.length})
        </h2>
        {adjustRequests.length === 0 ? (
          <EmptyBox text="Chưa có yêu cầu chỉnh công nào cho tháng này." />
        ) : (
          <ul className="space-y-2">
            {adjustRequests.map((r) => (
              <li key={r.id} className="rounded-xl border border-neutral-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold capitalize text-neutral-900">
                    {dayFmt.format(r.date)}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      ADJUST_STATUS[r.status].cls,
                    )}
                  >
                    {ADJUST_STATUS[r.status].label}
                  </span>
                </div>
                {r.requested && (
                  <p className="mt-1 text-sm text-neutral-700">Đề nghị: {r.requested}</p>
                )}
                <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">{r.reason}</p>
                {r.reviewNote && (
                  <p className="mt-2 rounded-lg bg-neutral-50 p-2 text-sm text-neutral-600">
                    Phản hồi: {r.reviewNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ─────────────────────────────── UI phụ trợ (server) ─────────────────────────────── */

/** Nút prev/next tháng — Link chỉ-query (giữ path, đúng trên host giaovien lẫn localhost). */
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
      aria-label={aria}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 transition-colors hover:bg-neutral-50"
    >
      {children}
    </Link>
  );
}

/** StatCard tổng hợp — port visual từ mock (icon chip màu + số to + nhãn). */
function StatCard({
  icon,
  tone,
  value,
  label,
}: {
  icon: React.ReactNode;
  tone: string;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4">
      <span
        className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", tone)}
      >
        {icon}
      </span>
      <div>
        <p className="text-xl font-bold text-neutral-900">{value}</p>
        <p className="text-sm text-neutral-500">{label}</p>
      </div>
    </div>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
      <p className="text-sm text-neutral-500">{text}</p>
    </div>
  );
}
