import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireLiveSession } from "@/lib/auth/live-session";
import { hasRole } from "@/lib/auth/permissions";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { SHIFT_EXCEL_COLUMNS, shiftsToCell } from "@/lib/attendance/shift-excel";
import { writeAudit } from "@/lib/audit/audit-log";
import { getAuditActor } from "@/lib/audit/log";
import { exportWatermark } from "@/lib/export/watermark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/cham-cong/shift-export?centerId=&month=YYYY-MM
// Xuất lịch ca ĐỀ XUẤT (REGISTERED) của cơ sở trong tháng — 1 sheet, cột chuẩn.
export async function GET(req: NextRequest) {
  const session = await requireLiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  let centerId = sp.get("centerId") ?? "";
  const month = sp.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Thiếu/sai tham số month (YYYY-MM)" }, { status: 400 });
  }

  // CENTER_MANAGER (không kèm SUPER_ADMIN) chỉ xuất cơ sở mình.
  if (hasRole(session.user, "CENTER_MANAGER") && !hasRole(session.user, "SUPER_ADMIN")) {
    centerId = session.user.centerId ?? "";
  }
  if (!centerId) return NextResponse.json({ error: "Thiếu centerId" }, { status: 400 });

  if (!(await checkPermission("hr_attendance:view", { centerId }))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const year = Number(month.slice(0, 4));
  const monthIdx = Number(month.slice(5, 7)) - 1;
  const monthStart = new Date(year, monthIdx, 1);
  const monthEnd = new Date(year, monthIdx + 1, 1);

  // Cách ly cơ sở (A0-04): ShiftRegistration ∈ SCOPED_MODELS → đọc qua scopedDb.
  const sdb = scopedDb(await resolveActor(session.user.id));
  const regs = await sdb.shiftRegistration.findMany({
    where: {
      date: { gte: monthStart, lt: monthEnd },
      status: "REGISTERED",
      user: { centerId },
    },
    select: {
      date: true,
      shifts: true,
      note: true,
      user: { select: { email: true, name: true } },
    },
    orderBy: [{ user: { name: "asc" } }, { date: "asc" }],
  });

  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const aoa: (string | null)[][] = [[...SHIFT_EXCEL_COLUMNS]];
  for (const r of regs) {
    aoa.push([
      r.user.email,
      r.user.name ?? "",
      ymd(new Date(r.date)),
      shiftsToCell(r.shifts),
      r.note ?? "",
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 26 }, { wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "LichCa");

  // SEC-M05: sheet watermark (truy vết) — không đụng sheet dữ liệu.
  const { actorId, actorName } = getAuditActor(session);
  const wmWs = XLSX.utils.aoa_to_sheet([
    ["Watermark"],
    [exportWatermark(actorName, actorId, regs.length, new Date())],
  ]);
  XLSX.utils.book_append_sheet(wb, wmWs, "_watermark");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  await writeAudit({
    actor: { id: actorId, name: actorName },
    module: "hr_attendance",
    entityType: "ShiftRegistration",
    entityId: `${centerId}:${month}`,
    action: "EXPORT",
    newValues: { centerId, month, count: regs.length },
  });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="lich-ca-${centerId}-${month}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
