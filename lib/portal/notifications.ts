import "server-only";
import { db } from "@/lib/db";

// =============================================================================
// PORTAL NOTIFICATIONS — Phase NHÓM 3
// Thông báo phụ huynh thấy = ALL_PARENTS, hoặc CENTER khớp cơ sở của con,
// hoặc CLASS khớp lớp con đang học. Chỉ bản đã publish.
// =============================================================================

const ACTIVE_ENROLLMENT = ["CONFIRMED", "STUDYING", "ACTIVE"] as const;

export type NotificationRow = {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
  scope: string;
};

export async function getParentNotifications(
  parentUserId: string,
): Promise<NotificationRow[]> {
  // Cơ sở + lớp của các con.
  const children = await db.student.findMany({
    where: { parentUserId, deletedAt: null },
    select: { centerId: true, preferredCenterId: true },
  });
  const centerIds = new Set<string>();
  for (const c of children) {
    if (c.centerId) centerIds.add(c.centerId);
    if (c.preferredCenterId) centerIds.add(c.preferredCenterId);
  }

  const studentIds = (
    await db.student.findMany({
      where: { parentUserId, deletedAt: null },
      select: { id: true },
    })
  ).map((s) => s.id);

  const classIds = new Set(
    (
      await db.enrollment.findMany({
        where: { studentId: { in: studentIds }, status: { in: [...ACTIVE_ENROLLMENT] } },
        select: { classId: true },
      })
    ).map((e) => e.classId),
  );

  const now = new Date();
  const rows = await db.notification.findMany({
    where: {
      isPublished: true,
      OR: [
        { audience: "ALL_PARENTS" },
        { audience: "CENTER", centerId: { in: [...centerIds] } },
        { audience: "CLASS", classId: { in: [...classIds] } },
      ],
      AND: [{ OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] }],
    },
    select: {
      id: true,
      title: true,
      body: true,
      audience: true,
      publishedAt: true,
      createdAt: true,
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  const scopeLabel: Record<string, string> = {
    ALL_PARENTS: "Toàn trung tâm",
    CENTER: "Cơ sở",
    CLASS: "Lớp học",
  };

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    publishedAt: (r.publishedAt ?? r.createdAt).toISOString(),
    scope: scopeLabel[r.audience] ?? "",
  }));
}
