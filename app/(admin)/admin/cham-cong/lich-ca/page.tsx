// app/(admin)/admin/cham-cong/lich-ca/page.tsx — LỊCH CA CỦA TÔI.
//
// Vì sao màn này tồn tại: nhân viên KHÔNG tự đăng ký ca nữa (màn "đề xuất ca" cũ đã đóng băng ở
// L5) — Quản lý xếp lịch trên lưới phân ca, muốn đổi thì nộp đơn. Đây là chỗ DUY NHẤT một người
// thường thấy đủ ca của mình trong tháng, công tạm tính và cờ hậu kiểm của từng ngày.
//
// DỄ VỠ:
// 1. ĐƯỜNG DẪN LÀ HREF ĐANG NẰM TRONG DB — thông báo `shift.changed` / `shift.brief` /
//    `request.decided` trỏ thẳng vào đây (`lib/cham-cong/requests.ts`, `brief-db.ts`). Đổi route
//    là làm chết mọi thông báo đã gửi.
// 2. Không gate quyền: dữ liệu là của CHÍNH người đăng nhập (`getMyAssignments` lọc theo userId).
//    Thêm `checkPermission` ở đây là khoá màn của chính nhân viên.
// 3. Ngày `@db.Date` là UTC 00:00 — đọc bằng `getUTC*`, đừng dùng `getDay()/getDate()` (lệch 1
//    ngày trên Vercel chạy UTC).
// 4. Bảng phải hiện HẾT tháng: `soDongMacDinh={50}` vì 31 ngày + hàng tách tuần > 20 dòng mặc
//    định, và hàng tách tuần phải nằm TRONG `<tbody>` (PhanTrangBang chỉ nhận đúng một tbody).
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { auth } from "@/lib/auth";
import { getMyAssignments, getMyAttendanceDays } from "@/lib/cham-cong/my-schedule";
import { currentPeriodKey, parsePeriodKey, periodRange } from "@/lib/cham-cong/period";
import { hrefWith, shiftKy } from "@/lib/cham-cong/scope-href";
import { vnYmd } from "@/lib/time/vn";
import { cn } from "@/lib/utils";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { PageHeader } from "@/components/admin/ui/page-header";
import { PageHelp } from "@/components/admin/ui/page-help";
import { EmptyState } from "@/components/admin/ui/states";
import { adminTd, adminTh, adminTr } from "@/components/admin/ui/table";
import { MeNav } from "@/components/admin/cham-cong/me-nav";
import { BTN_PRIMARY, PILL } from "@/components/admin/cham-cong/classes";
import { FlagList } from "@/components/cham-cong/ui/flag-chip";
import { ShiftCodeChip, type ShiftSource } from "@/components/cham-cong/ui/shift-code-chip";

export const metadata = { title: "Lịch ca của tôi | Admin" };
export const dynamic = "force-dynamic";

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const SOURCES = new Set<string>(["PATTERN", "IMPORT", "MANUAL", "SWAP", "LEAVE", "HOLIDAY"]);
/** Cờ nói "thiếu mốc quét" ⇒ việc của người này là nộp đơn chỉnh công, không phải chờ ai. */
const MISSING_TAP = new Set(["KHONG_CO_LUOT", "THIEU_LUOT_RA", "RA_KHONG_CO_VAO", "THIEU_BUOI_SANG", "THIEU_BUOI_CHIEU"]);

const fmtMin = (m: number) => (m ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : "—");
const pad = (n: number) => String(n).padStart(2, "0");

export default async function MyShiftsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fcham-cong%2Flich-ca");

  const { month } = await searchParams;
  const ky = month && parsePeriodKey(month) ? month : currentPeriodKey();
  const { from, to, days } = periodRange(ky);
  const toExclusive = new Date(to.getTime() + 86_400_000);
  const [shifts, dayRows] = await Promise.all([
    getMyAssignments(session.user.id, from, toExclusive),
    getMyAttendanceDays(session.user.id, from, toExclusive),
  ]);

  const shiftOf = new Map(shifts.map((s) => [s.date.toISOString().slice(0, 10), s]));
  const dayOf = new Map(dayRows.map((d) => [d.date.toISOString().slice(0, 10), d]));
  const p = parsePeriodKey(ky)!;
  const totalUnits = Math.round(dayRows.reduce((s, d) => s + d.units, 0) * 100) / 100;
  const shiftCount = shifts.filter((s) => !s.isLeave).length;
  const todayYmd = vnYmd(new Date());
  const tomorrowYmd = vnYmd(new Date(Date.now() + 86_400_000));

  // Một hàng cho mỗi ngày của kỳ + nhãn tuần ở ngày đầu tiên và mỗi thứ Hai.
  const rows = Array.from({ length: days }, (_, i) => {
    const d = new Date(from.getTime() + i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    const wd = d.getUTCDay();
    const dayNo = d.getUTCDate();
    let weekLabel: string | null = null;
    if (i === 0 || wd === 1) {
      const endNo = Math.min(days, dayNo + (wd === 0 ? 0 : 7 - wd));
      weekLabel = `Tuần ${pad(dayNo)}–${pad(endNo)}/${pad(p.m)}`;
    }
    return {
      key,
      weekLabel,
      wd: WD[wd],
      label: `${pad(dayNo)}/${pad(p.m)}`,
      shift: shiftOf.get(key) ?? null,
      day: dayOf.get(key) ?? null,
    };
  });

  const prevHref = hrefWith("/cham-cong/lich-ca", { month: shiftKy(ky, -1) });
  const nextHref = hrefWith("/cham-cong/lich-ca", { month: shiftKy(ky, 1) });
  const isEmpty = shifts.length === 0 && dayRows.length === 0;

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Lịch ca của tôi"
        subtitle="Ca do Quản lý xếp trên lưới phân ca. Muốn đổi thì nộp đơn — duyệt xong lịch đổi ngay."
        actions={
          <Link href="/don-tu/cua-toi" className={BTN_PRIMARY}>
            <CalendarClock className="h-4 w-4" aria-hidden />
            Nộp đơn
          </Link>
        }
      />
      <MeNav active="lich-ca" month={ky} />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <Link
          href={prevHref}
          aria-label="Tháng trước"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card transition-colors hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Link>
        <span className="min-w-[9rem] text-center text-sm font-semibold tabular-nums text-foreground">
          Tháng {pad(p.m)}/{p.y}
        </span>
        <Link
          href={nextHref}
          aria-label="Tháng sau"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card transition-colors hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
        <span className="ml-auto text-xs text-muted-foreground">
          Tổng công tạm tính <strong className="tabular-nums text-foreground">{totalUnits}</strong> ·{" "}
          <strong className="tabular-nums text-foreground">{shiftCount}</strong> ca
        </span>
      </div>

      <PageHelp guideSlug="08-nhan-su-giao-vien">
        <p>
          Công ngày được máy tính lại vài phút sau mỗi lượt quét hoặc mỗi lần đổi ca, nên số ở đây là
          <strong> tạm tính</strong> cho tới khi kế toán chốt kỳ.
        </p>
        <p className="mt-2">
          Ô công có chữ <em>ghi đè</em> nghĩa là Quản lý đã sửa tay số công ngày đó. Ngày có ổ khoá là kỳ đã chốt —
          muốn đổi phải qua đơn chỉnh công. Thấy cờ &ldquo;Không có lượt&rdquo; hay &ldquo;Thiếu lượt ra&rdquo; thì
          bấm <em>Nộp đơn chỉnh công</em> ở cột cuối và điền mốc giờ bị thiếu.
        </p>
      </PageHelp>

      {isEmpty ? (
        <EmptyState
          title={`Tháng ${pad(p.m)}/${p.y} chưa có ca nào xếp cho bạn`}
          description="Người Hội sở và người thuộc diện miễn chấm công không có lịch ca — đây không phải lỗi. Nếu bạn có ca mà chưa thấy, hỏi Quản lý cơ sở đã sinh lưới tháng này chưa."
        />
      ) : (
        <PhanTrangBang cuonNgang tenDonVi="dòng" khoaGhiNho="lich-ca" soDongMacDinh={50}>
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th scope="col" className={adminTh}>Ngày</th>
                <th scope="col" className={adminTh}>Ca</th>
                <th scope="col" className={adminTh}>Giờ</th>
                <th scope="col" className={adminTh}>Nơi</th>
                <th scope="col" className={adminTh}>Giờ làm</th>
                <th scope="col" className={adminTh}>Công</th>
                <th scope="col" className={adminTh}>Cờ</th>
                <th scope="col" className={adminTh}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isToday = r.key === todayYmd;
                const flags = (r.day?.flags ?? []).filter((f) => f !== "KHONG_CO_LUOT" || r.shift);
                const locked = r.day?.locked ?? false;
                const needsFix = !locked && (r.day?.flags ?? []).some((f) => MISSING_TAP.has(f));
                const canSwap = Boolean(r.shift) && r.key > todayYmd;
                const source = r.shift && SOURCES.has(r.shift.source) ? (r.shift.source as ShiftSource) : undefined;
                return [
                  r.weekLabel ? (
                    <tr key={`w-${r.key}`}>
                      <td
                        colSpan={8}
                        className="bg-muted/40 px-5 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {r.weekLabel}
                      </td>
                    </tr>
                  ) : null,
                  <tr key={r.key} className={cn(adminTr, isToday && "bg-primary-soft", !r.shift && !r.day && "text-muted-foreground")}>
                    <td className={cn(adminTd, "whitespace-nowrap tabular-nums")}>
                      <span className="mr-1 text-xs text-muted-foreground">{r.wd}</span>
                      {r.label}
                      {r.key === tomorrowYmd && (
                        <span className={cn(PILL, "ml-1.5 bg-state-info-soft text-state-info-ink")}>Ngày mai</span>
                      )}
                    </td>
                    <td className={cn(adminTd, "whitespace-nowrap")}>
                      {r.shift ? (
                        <span className="inline-flex items-center gap-1.5">
                          <ShiftCodeChip code={r.shift.code} source={source} size="sm" />
                          <span className="max-w-[10rem] truncate text-xs text-muted-foreground" title={r.shift.name}>
                            {r.shift.name}
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={cn(adminTd, "whitespace-nowrap font-mono text-xs tabular-nums")}>
                      {r.shift ? r.shift.timeLabel || "theo nơi làm" : ""}
                    </td>
                    <td className={cn(adminTd, "whitespace-nowrap text-xs")}>{r.shift?.centerLabel ?? ""}</td>
                    <td className={cn(adminTd, "whitespace-nowrap tabular-nums")}>{r.day ? fmtMin(r.day.worked) : ""}</td>
                    <td className={cn(adminTd, "whitespace-nowrap font-semibold tabular-nums")}>
                      {r.day ? (
                        <span className="inline-flex items-center gap-1.5">
                          {r.day.units}
                          {r.day.override && (
                            <span className={cn(PILL, "bg-state-warning-soft text-state-warning-ink")}>ghi đè</span>
                          )}
                          {locked && (
                            <>
                              <Lock className="h-3 w-3 text-muted-foreground" aria-hidden />
                              <span className="sr-only">Kỳ đã chốt</span>
                            </>
                          )}
                        </span>
                      ) : (
                        ""
                      )}
                    </td>
                    <td className={cn(adminTd, "whitespace-normal")}>
                      <FlagList codes={flags} />
                    </td>
                    <td className={cn(adminTd, "whitespace-nowrap")}>
                      {needsFix ? (
                        <Link
                          href={`/don-tu/cua-toi?type=TIMESHEET_FIX&date=${r.key}`}
                          className="text-sm font-medium text-primary-ink hover:underline"
                        >
                          Nộp đơn chỉnh công
                        </Link>
                      ) : canSwap ? (
                        <Link
                          href={`/don-tu/cua-toi?type=SHIFT_SWAP&date=${r.key}`}
                          className="text-sm font-medium text-primary-ink hover:underline"
                        >
                          Xin đổi ca
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </PhanTrangBang>
      )}
    </div>
  );
}
