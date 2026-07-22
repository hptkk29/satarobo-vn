// app/(teacher)/teacher/don-tu/page.tsx — Đơn từ GV (site giáo viên).
//
// Port reference :3001 don-tu: danh sách đơn CỦA MÌNH + form tạo đơn 10 loại/3 nhóm
// (field điều kiện theo loại) + tìm kiếm/lọc. Server fetch đơn của mình + dữ liệu
// dropdown (lớp mình, GV cùng cơ sở, ca sắp tới); client lo form + filter.
// Preset ?type=<kind> / ?swap=<shiftId> mở form + chọn sẵn.
//
// WorkRequest ∉ SCOPED_MODELS → own-scope qua requesterId. ⚠️ Câu 46: đơn từ là dữ
// liệu nhân sự của chính GV — không chạm HV/PH.
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { shiftLabel } from "@/lib/shifts";
import type { WorkRequestKindV } from "@/lib/work-request";
import { DonTuClient, type WorkRequestRow } from "./_components/don-tu-client";

export const metadata = { title: "Đơn từ | Giáo viên Sata Robo" };

const dateFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});
const sentFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});

function startOfTodayUtc(): Date {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()));
}

export default async function DonTuPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; swap?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate

  const sp = await searchParams;
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const classIds = [...actor.assignedClassIds];
  const centerId = session.user.centerId ?? null;

  const [requests, myClasses, otherTeachers, myShifts] = await Promise.all([
    sdb.workRequest.findMany({
      where: { requesterId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    classIds.length
      ? sdb.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : [],
    centerId
      ? sdb.user.findMany({
          where: { centerId, id: { not: session.user.id }, roles: { has: "TEACHER" } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: 100,
        })
      : [],
    sdb.shiftRegistration.findMany({
      where: { userId: session.user.id, date: { gte: startOfTodayUtc() } },
      select: { id: true, date: true, shifts: true },
      orderBy: { date: "asc" },
      take: 40,
    }),
  ]);

  const rows: WorkRequestRow[] = requests.map((r) => ({
    id: r.id,
    kind: r.kind as WorkRequestKindV,
    status: r.status,
    fromLabel: r.fromDate ? dateFmt.format(r.fromDate) : null,
    toLabel: r.toDate ? dateFmt.format(r.toDate) : null,
    startTime: r.startTime,
    endTime: r.endTime,
    hours: r.hours,
    className: r.className,
    detail: r.detail,
    reason: r.reason,
    reviewNote: r.reviewNote,
    createdAtLabel: sentFmt.format(r.createdAt),
  }));

  return (
    <DonTuClient
      rows={rows}
      myClasses={myClasses}
      otherTeachers={otherTeachers.map((t) => ({ id: t.id, name: t.name ?? "GV" }))}
      myShifts={myShifts.map((s) => ({
        id: s.id,
        label: `${dateFmt.format(s.date)} · ${s.shifts.map((sh) => shiftLabel(sh)).join(", ")}`,
      }))}
      presetKind={sp.type ?? null}
      presetSwap={sp.swap ?? null}
    />
  );
}
