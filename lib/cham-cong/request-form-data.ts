// lib/cham-cong/request-form-data.ts — Dữ liệu cho FORM ĐƠN TỪ dùng chung (RSC gọi, không action).
// Cùng một loader cho site admin (tư vấn/giáo vụ/HO) và site GV → hai màn không lệch lựa chọn.
import "server-only";
import { db } from "@/lib/db";
import { resolveActor } from "@/lib/auth/actor";
import { getSetting } from "@/lib/settings/service";
import { HO_CENTER_ID, loadCenterMap } from "./home-center";
import { resolveRequestCenter } from "./requests";

export type RequestFormOptions = {
  /** Cơ sở nhận đơn suy ra được (null = Hội sở, người nộp chọn trong `centers`). */
  defaultCenter: { id: string; label: string } | null;
  centers: { id: string; label: string }[];
  templates: { id: string; code: string; name: string }[];
  leaveTypes: { id: string; code: string; name: string; paidRatio: number }[];
  /** Đồng nghiệp cùng cơ sở (nhận ca / làm thay). */
  colleagues: { id: string; name: string; isTeacher: boolean }[];
  myClasses: { id: string; name: string }[];
  timesheetExempt: boolean;
  noticeDays: number;
};

export async function loadRequestFormOptions(userId: string): Promise<RequestFormOptions> {
  const [map, resolved, actor] = await Promise.all([loadCenterMap(), resolveRequestCenter(userId, null), resolveActor(userId)]);
  const centerRows = await db.center.findMany({
    where: { isActive: true, code: { in: Object.keys(map.byCode) } },
    select: { id: true, code: true, name: true },
    orderBy: { displayOrder: "asc" },
  });
  const centers = centerRows.map((c) => ({ id: c.id, label: `${c.code} · ${c.name}` }));
  const defaultCenter = resolved.centerId ? (centers.find((c) => c.id === resolved.centerId) ?? { id: resolved.centerId, label: resolved.centerId }) : null;
  const scopeCenterIds = resolved.centerId && resolved.centerId !== HO_CENTER_ID ? [resolved.centerId] : centers.map((c) => c.id);

  const [templates, leaveTypes, colleagues, myClasses, noticeDays] = await Promise.all([
    db.shiftTemplate.findMany({ where: { isActive: true, centerId: null, isLeave: false, kind: { not: "OFF" } }, select: { id: true, code: true, name: true }, orderBy: { displayOrder: "asc" } }),
    db.leaveType.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true, paidRatio: true }, orderBy: { displayOrder: "asc" } }),
    db.user.findMany({
      where: { id: { not: userId }, isActive: true, centerId: { in: scopeCenterIds }, roles: { hasSome: ["TEACHER", "SALES_CSM", "CENTER_MANAGER", "HR", "TRAINING", "MARKETING", "ACCOUNTANT"] } },
      select: { id: true, name: true, email: true, roles: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    actor.assignedClassIds.size > 0
      ? db.class.findMany({ where: { id: { in: [...actor.assignedClassIds] } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([] as { id: string; name: string }[]),
    getSetting("shift.requestNoticeDays"),
  ]);

  return {
    defaultCenter,
    centers,
    templates,
    leaveTypes,
    colleagues: colleagues.map((u) => ({ id: u.id, name: u.name ?? u.email ?? u.id, isTeacher: u.roles.includes("TEACHER") })),
    myClasses,
    timesheetExempt: resolved.timesheetExempt,
    noticeDays,
  };
}
