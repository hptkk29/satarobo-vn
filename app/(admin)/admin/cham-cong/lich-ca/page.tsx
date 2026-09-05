// app/(admin)/admin/cham-cong/lich-ca/page.tsx — LỊCH CA CỦA TÔI (L5, chấm công v3): đọc lưới
// ShiftAssignment tháng + công ngày của chính mình. Thay màn "đề xuất ca" cũ (ShiftRegistration —
// đóng băng L5): nhân viên KHÔNG tự đăng ký ca nữa, Quản lý xếp lịch; muốn đổi thì nộp đơn.
// Giữ đường dẫn vì thông báo shift.changed / shift.brief trỏ tới đây.
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMyAssignments, getMyAttendanceDays } from "@/lib/cham-cong/my-schedule";
import { currentPeriodKey, parsePeriodKey, periodRange } from "@/lib/cham-cong/period";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";

export const metadata = { title: "Lịch ca của tôi | Admin" };
export const dynamic = "force-dynamic";

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const fmtMin = (m: number) => (m ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : "—");

export default async function MyShiftsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { month } = await searchParams;
  const ky = month && parsePeriodKey(month) ? month : currentPeriodKey();
  const { from, to, days } = periodRange(ky);
  const toExclusive = new Date(to.getTime() + 86_400_000);
  const [shifts, dayRows] = await Promise.all([getMyAssignments(session.user.id, from, toExclusive), getMyAttendanceDays(session.user.id, from, toExclusive)]);
  const shiftOf = new Map(shifts.map((s) => [s.date.toISOString().slice(0, 10), s]));
  const dayOf = new Map(dayRows.map((d) => [d.date.toISOString().slice(0, 10), d]));
  const p = parsePeriodKey(ky)!;
  const prev = `${new Date(Date.UTC(p.y, p.m - 2, 1)).toISOString().slice(0, 7)}`;
  const next = `${new Date(Date.UTC(p.y, p.m, 1)).toISOString().slice(0, 7)}`;
  const totalUnits = Math.round(dayRows.reduce((s, d) => s + d.units, 0) * 100) / 100;
  const rows = Array.from({ length: days }, (_, i) => {
    const d = new Date(from.getTime() + i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    return { key, wd: WD[d.getUTCDay()], label: `${String(d.getUTCDate()).padStart(2, "0")}/${String(p.m).padStart(2, "0")}`, shift: shiftOf.get(key) ?? null, day: dayOf.get(key) ?? null };
  });

  return (
    <div className="max-w-4xl p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lịch ca của tôi</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ca do Quản lý xếp trên lưới phân ca. Muốn đổi ca / nghỉ / quên quét thì nộp đơn — duyệt xong lịch đổi ngay và có thông báo.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/don-tu/cua-toi" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark">Nộp đơn</Link>
          <Link href="/cham-cong/checkin" className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted">Chấm công</Link>
        </div>
      </div>
      <div className="mb-4 flex items-center gap-2 text-sm">
        <Link className="rounded-md border border-border px-2 py-1" href={`/cham-cong/lich-ca?month=${prev}`}>‹</Link>
        <span className="font-mono font-semibold">{ky}</span>
        <Link className="rounded-md border border-border px-2 py-1" href={`/cham-cong/lich-ca?month=${next}`}>›</Link>
        <span className="ml-auto text-muted-foreground">Tổng công tạm tính: <strong className="text-foreground">{totalUnits}</strong> · {shifts.filter((s) => !s.isLeave).length} ca</span>
      </div>
      <PhanTrangBang cuonNgang>
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-3 py-2">Ngày</th><th className="px-3 py-2">Ca</th><th className="px-3 py-2">Giờ</th><th className="px-3 py-2">Nơi</th><th className="px-3 py-2 text-right">Giờ làm</th><th className="px-3 py-2 text-right">Công</th><th className="px-3 py-2">Cờ</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={`border-b border-border ${r.shift ? "" : "text-muted-foreground"}`}>
                <td className="px-3 py-1.5 whitespace-nowrap"><span className="mr-1 text-xs text-muted-foreground">{r.wd}</span>{r.label}</td>
                <td className="px-3 py-1.5">{r.shift ? <><span className="font-mono font-semibold">{r.shift.code}</span> <span className="text-xs text-muted-foreground">{r.shift.name}</span></> : "—"}</td>
                <td className="px-3 py-1.5 text-xs">{r.shift?.timeLabel || (r.shift ? "theo nơi làm" : "")}</td>
                <td className="px-3 py-1.5 text-xs">{r.shift?.centerLabel ?? ""}</td>
                <td className="px-3 py-1.5 text-right">{r.day ? fmtMin(r.day.worked) : ""}</td>
                <td className="px-3 py-1.5 text-right font-semibold">{r.day ? <>{r.day.units}{r.day.override && <span className="text-xs text-amber-600">*</span>}{r.day.locked && <span title="Kỳ đã chốt" className="ml-1 text-xs">🔒</span>}</> : ""}</td>
                <td className="px-3 py-1.5 text-xs">{r.day?.flags.filter((f) => f !== "KHONG_CO_LUOT" || r.shift).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PhanTrangBang>
      <p className="mt-3 text-xs text-muted-foreground">Công ngày cập nhật vài phút sau mỗi lượt quét/đổi ca. * = Quản lý ghi đè. Thắc mắc số công: nộp đơn chỉnh công kèm giờ vào/ra đề nghị.</p>
    </div>
  );
}
