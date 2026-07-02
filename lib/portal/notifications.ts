import "server-only";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getChildren } from "@/lib/portal/session";

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
  /** NotificationAudience — feed v2 cần phân biệt STUDENT (gửi riêng 1 con). */
  audience: string;
  /** Con được nhắm tới khi audience=STUDENT (null với các audience khác). */
  studentId: string | null;
};

/**
 * Điều kiện audience chung cho thông báo phụ huynh thấy — list + count dùng chung
 * để badge chuông và trang luôn khớp nhau. Danh sách con tái dùng getChildren
 * (React cache — CÙNG query Student với getPortalContext trong 1 request, không
 * query Student lần 2) + 1 query Enrollment. Bọc cache() để list + count gọi
 * chung 1 request không lặp query Enrollment.
 */
const parentAudienceOr = cache(async (
  parentUserId: string,
): Promise<Prisma.NotificationWhereInput[]> => {
  const children = await getChildren(parentUserId);
  const studentIds = children.map((c) => c.id);
  const centerIds = new Set<string>();
  for (const c of children) {
    if (c.centerId) centerIds.add(c.centerId);
    if (c.preferredCenterId) centerIds.add(c.preferredCenterId);
  }

  const classIds = new Set(
    (
      await db.enrollment.findMany({
        where: { studentId: { in: studentIds }, status: { in: [...ACTIVE_ENROLLMENT] }, deletedAt: null }, // FIX-C3
        select: { classId: true },
      })
    ).map((e) => e.classId),
  );

  return [
    { audience: "ALL_PARENTS" },
    { audience: "CENTER", centerId: { in: [...centerIds] } },
    { audience: "CLASS", classId: { in: [...classIds] } },
    // Đợt 6 #7 — thông báo gửi riêng cho con của phụ huynh này.
    { audience: "STUDENT", studentId: { in: studentIds } },
  ];
});

export const getParentNotifications = cache(async (
  parentUserId: string,
): Promise<NotificationRow[]> => {
  const audienceOr = await parentAudienceOr(parentUserId);

  const now = new Date();
  const rows = await db.notification.findMany({
    where: {
      isPublished: true,
      OR: audienceOr,
      AND: [{ OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] }],
    },
    select: {
      id: true,
      title: true,
      body: true,
      audience: true,
      studentId: true,
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
    STUDENT: "Riêng con bạn",
  };

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    publishedAt: (r.publishedAt ?? r.createdAt).toISOString(),
    scope: scopeLabel[r.audience] ?? "",
    audience: r.audience,
    studentId: r.studentId,
  }));
});

/** Số thông báo GẦN ĐÂY (7 ngày) cho badge chuông portal — React cache/request. */
export const getParentNotificationCount = cache(async (parentUserId: string): Promise<number> => {
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const now = new Date();
  const audienceOr = await parentAudienceOr(parentUserId);
  // Badge chạy trên MỌI page view portal v1 → chỉ COUNT trong DB, không fetch
  // 100 bản ghi đầy đủ title/body rồi đếm bằng JS.
  return db.notification.count({
    where: {
      isPublished: true,
      OR: audienceOr,
      AND: [
        { OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] },
        // Mốc 7 ngày theo publishedAt ?? createdAt — khớp filter JS trước đây.
        { OR: [{ publishedAt: { gte: since } }, { publishedAt: null, createdAt: { gte: since } }] },
      ],
    },
  });
});
