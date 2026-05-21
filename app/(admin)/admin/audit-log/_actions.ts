"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const PAGE_SIZE = 20;
const EXPORT_CAP = 5000;
const RETENTION_DAYS = 365;

async function requireAuditView() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "users:manage")) {
    redirect("/admin/dashboard?error=unauthorized");
  }
  return session.user;
}

export type AuditFilters = {
  dateFrom?: string;
  dateTo?: string;
  actorId?: string;
  action?: string;
  targetIdSearch?: string;
  freeText?: string;
};

export type AuditTab = "user" | "grant" | "lead" | "class" | "student";

export type Cursor = string;

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ c: createdAt.toISOString(), i: id }),
  ).toString("base64");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64").toString()) as {
      c: string;
      i: string;
    };
    return { createdAt: new Date(decoded.c), id: decoded.i };
  } catch {
    return null;
  }
}

type WhereAnd = Array<Record<string, unknown>>;

function buildCommonAnd(
  filters: AuditFilters,
  cursor: Cursor | null,
): WhereAnd {
  const AND: WhereAnd = [];

  if (filters.dateFrom) {
    AND.push({ createdAt: { gte: new Date(filters.dateFrom) } });
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    AND.push({ createdAt: { lte: to } });
  }
  if (filters.actorId) AND.push({ changedByUserId: filters.actorId });
  if (filters.action) AND.push({ action: filters.action });
  if (filters.freeText) {
    AND.push({
      reason: { contains: filters.freeText, mode: "insensitive" },
    });
  }

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      AND.push({
        OR: [
          { createdAt: { lt: decoded.createdAt } },
          {
            AND: [
              { createdAt: decoded.createdAt },
              { id: { lt: decoded.id } },
            ],
          },
        ],
      });
    }
  }

  return AND;
}

function paginate<T extends { createdAt: Date; id: string }>(rows: T[]): {
  items: T[];
  nextCursor: Cursor | null;
} {
  const hasMore = rows.length > PAGE_SIZE;
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;
  return { items, nextCursor };
}

// ─── QUERY USER AUDIT ───────────────────────────────────────────────
export async function queryUserAuditLogs(
  filters: AuditFilters,
  cursor: Cursor | null,
) {
  await requireAuditView();
  const AND = buildCommonAnd(filters, cursor);

  if (filters.targetIdSearch) {
    const search = filters.targetIdSearch.trim();
    AND.push({
      OR: [
        { userId: search },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ],
    });
  }

  const rows = await db.userAuditLog.findMany({
    where: AND.length ? { AND } : undefined,
    include: { user: { select: { email: true, name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
  });

  return paginate(rows);
}

// ─── QUERY GRANT AUDIT ──────────────────────────────────────────────
export async function queryGrantAuditLogs(
  filters: AuditFilters,
  cursor: Cursor | null,
) {
  await requireAuditView();
  const AND = buildCommonAnd(filters, cursor);

  if (filters.targetIdSearch) {
    const search = filters.targetIdSearch.trim();
    AND.push({
      OR: [
        { userId: search },
        { actionKey: { contains: search, mode: "insensitive" } },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ],
    });
  }

  const rows = await db.permissionGrantAuditLog.findMany({
    where: AND.length ? { AND } : undefined,
    include: { user: { select: { email: true, name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
  });

  return paginate(rows);
}

// ─── QUERY LEAD AUDIT ───────────────────────────────────────────────
export async function queryLeadAuditLogs(
  filters: AuditFilters,
  cursor: Cursor | null,
) {
  await requireAuditView();
  const AND = buildCommonAnd(filters, cursor);

  if (filters.targetIdSearch) {
    const search = filters.targetIdSearch.trim();
    AND.push({
      OR: [
        { leadId: search },
        { lead: { phone: { contains: search } } },
        { lead: { parentName: { contains: search, mode: "insensitive" } } },
      ],
    });
  }

  const rows = await db.leadAuditLog.findMany({
    where: AND.length ? { AND } : undefined,
    include: { lead: { select: { parentName: true, phone: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
  });

  return paginate(rows);
}

// ─── QUERY CLASS AUDIT ──────────────────────────────────────────────
export async function queryClassAuditLogs(
  filters: AuditFilters,
  cursor: Cursor | null,
) {
  await requireAuditView();
  const AND = buildCommonAnd(filters, cursor);

  if (filters.targetIdSearch) {
    const search = filters.targetIdSearch.trim();
    AND.push({
      OR: [
        { classId: search },
        { class: { name: { contains: search, mode: "insensitive" } } },
        { class: { classCode: { contains: search, mode: "insensitive" } } },
      ],
    });
  }

  const rows = await db.classAuditLog.findMany({
    where: AND.length ? { AND } : undefined,
    include: { class: { select: { name: true, classCode: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
  });

  return paginate(rows);
}

// ─── QUERY STUDENT AUDIT ────────────────────────────────────────────
export async function queryStudentAuditLogs(
  filters: AuditFilters,
  cursor: Cursor | null,
) {
  await requireAuditView();
  const AND = buildCommonAnd(filters, cursor);

  if (filters.targetIdSearch) {
    const search = filters.targetIdSearch.trim();
    AND.push({
      OR: [
        { studentId: search },
        { student: { name: { contains: search, mode: "insensitive" } } },
      ],
    });
  }

  const rows = await db.studentAuditLog.findMany({
    where: AND.length ? { AND } : undefined,
    include: { student: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
  });

  return paginate(rows);
}

// ─── EXPORT CSV ─────────────────────────────────────────────────────
function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str =
    typeof val === "object" && !(val instanceof Date)
      ? JSON.stringify(val)
      : val instanceof Date
        ? val.toISOString()
        : String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

type AuditMetadata = { ip?: string; userAgent?: string } | null;

export async function exportAuditLogsCSV(
  tab: AuditTab,
  filters: AuditFilters,
): Promise<
  | { ok: true; csv: string; filename: string }
  | { ok: false; error: string }
> {
  await requireAuditView();
  const AND = buildCommonAnd(filters, null);

  // Apply same targetIdSearch logic per tab
  if (filters.targetIdSearch) {
    const search = filters.targetIdSearch.trim();
    switch (tab) {
      case "user":
        AND.push({
          OR: [
            { userId: search },
            { user: { email: { contains: search, mode: "insensitive" } } },
          ],
        });
        break;
      case "grant":
        AND.push({
          OR: [
            { userId: search },
            { actionKey: { contains: search, mode: "insensitive" } },
            { user: { email: { contains: search, mode: "insensitive" } } },
          ],
        });
        break;
      case "lead":
        AND.push({
          OR: [
            { leadId: search },
            { lead: { phone: { contains: search } } },
            { lead: { parentName: { contains: search, mode: "insensitive" } } },
          ],
        });
        break;
      case "class":
        AND.push({
          OR: [
            { classId: search },
            { class: { name: { contains: search, mode: "insensitive" } } },
            { class: { classCode: { contains: search, mode: "insensitive" } } },
          ],
        });
        break;
      case "student":
        AND.push({
          OR: [
            { studentId: search },
            { student: { name: { contains: search, mode: "insensitive" } } },
          ],
        });
        break;
    }
  }

  const where = AND.length ? { AND } : undefined;
  const orderBy: Prisma.UserAuditLogOrderByWithRelationInput[] = [
    { createdAt: "desc" },
    { id: "desc" },
  ];

  let headers: string[];
  const lines: string[] = [];

  switch (tab) {
    case "user": {
      const rows = await db.userAuditLog.findMany({
        where,
        include: { user: { select: { email: true } } },
        orderBy,
        take: EXPORT_CAP,
      });
      headers = [
        "createdAt",
        "action",
        "targetEmail",
        "targetUserId",
        "actorName",
        "changedFields",
        "reason",
        "ip",
        "userAgent",
      ];
      lines.push(headers.join(","));
      for (const r of rows) {
        const meta = r.metadata as AuditMetadata;
        lines.push(
          [
            csvEscape(r.createdAt),
            csvEscape(r.action),
            csvEscape(r.user?.email),
            csvEscape(r.userId),
            csvEscape(r.changedByName),
            csvEscape(r.changedFields.join("|")),
            csvEscape(r.reason),
            csvEscape(meta?.ip),
            csvEscape(meta?.userAgent),
          ].join(","),
        );
      }
      break;
    }
    case "grant": {
      const rows = await db.permissionGrantAuditLog.findMany({
        where,
        include: { user: { select: { email: true } } },
        orderBy,
        take: EXPORT_CAP,
      });
      headers = [
        "createdAt",
        "action",
        "targetEmail",
        "actionKey",
        "oldGrant",
        "newGrant",
        "actorName",
        "reason",
        "ip",
        "userAgent",
      ];
      lines.push(headers.join(","));
      for (const r of rows) {
        const meta = r.metadata as AuditMetadata;
        lines.push(
          [
            csvEscape(r.createdAt),
            csvEscape(r.action),
            csvEscape(r.user?.email),
            csvEscape(r.actionKey),
            csvEscape(r.oldGrant),
            csvEscape(r.newGrant),
            csvEscape(r.changedByName),
            csvEscape(r.reason),
            csvEscape(meta?.ip),
            csvEscape(meta?.userAgent),
          ].join(","),
        );
      }
      break;
    }
    case "lead": {
      const rows = await db.leadAuditLog.findMany({
        where,
        include: { lead: { select: { parentName: true, phone: true } } },
        orderBy,
        take: EXPORT_CAP,
      });
      headers = [
        "createdAt",
        "action",
        "leadName",
        "leadPhone",
        "leadId",
        "actorName",
        "changedFields",
        "reason",
        "ip",
        "userAgent",
      ];
      lines.push(headers.join(","));
      for (const r of rows) {
        const meta = r.metadata as AuditMetadata;
        lines.push(
          [
            csvEscape(r.createdAt),
            csvEscape(r.action),
            csvEscape(r.lead?.parentName),
            csvEscape(r.lead?.phone),
            csvEscape(r.leadId),
            csvEscape(r.changedByName),
            csvEscape(r.changedFields.join("|")),
            csvEscape(r.reason),
            csvEscape(meta?.ip),
            csvEscape(meta?.userAgent),
          ].join(","),
        );
      }
      break;
    }
    case "class": {
      const rows = await db.classAuditLog.findMany({
        where,
        include: { class: { select: { name: true, classCode: true } } },
        orderBy,
        take: EXPORT_CAP,
      });
      headers = [
        "createdAt",
        "action",
        "className",
        "classCode",
        "classId",
        "actorName",
        "changedFields",
        "reason",
        "ip",
        "userAgent",
      ];
      lines.push(headers.join(","));
      for (const r of rows) {
        const meta = r.metadata as AuditMetadata;
        lines.push(
          [
            csvEscape(r.createdAt),
            csvEscape(r.action),
            csvEscape(r.class?.name),
            csvEscape(r.class?.classCode),
            csvEscape(r.classId),
            csvEscape(r.changedByName),
            csvEscape(r.changedFields.join("|")),
            csvEscape(r.reason),
            csvEscape(meta?.ip),
            csvEscape(meta?.userAgent),
          ].join(","),
        );
      }
      break;
    }
    case "student": {
      const rows = await db.studentAuditLog.findMany({
        where,
        include: { student: { select: { name: true } } },
        orderBy,
        take: EXPORT_CAP,
      });
      headers = [
        "createdAt",
        "action",
        "studentName",
        "studentId",
        "actorName",
        "changedFields",
        "reason",
        "ip",
        "userAgent",
      ];
      lines.push(headers.join(","));
      for (const r of rows) {
        const meta = r.metadata as AuditMetadata;
        lines.push(
          [
            csvEscape(r.createdAt),
            csvEscape(r.action),
            csvEscape(r.student?.name),
            csvEscape(r.studentId),
            csvEscape(r.changedByName),
            csvEscape(r.changedFields.join("|")),
            csvEscape(r.reason),
            csvEscape(meta?.ip),
            csvEscape(meta?.userAgent),
          ].join(","),
        );
      }
      break;
    }
    default:
      return { ok: false, error: "Tab không hợp lệ" };
  }

  const csv = "﻿" + lines.join("\n");
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `audit-log-${tab}-${dateStr}.csv`;

  return { ok: true, csv, filename };
}

// ─── CLEANUP >365 DAYS ──────────────────────────────────────────────
export async function cleanupOldAuditLogs(): Promise<
  | {
      ok: true;
      deleted: {
        user: number;
        grant: number;
        lead: number;
        class: number;
        student: number;
      };
    }
  | { ok: false; error: string }
> {
  await requireAuditView();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  const [user, grant, lead, cls, student] = await db.$transaction([
    db.userAuditLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    db.permissionGrantAuditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    }),
    db.leadAuditLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    db.classAuditLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    db.studentAuditLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
  ]);

  return {
    ok: true,
    deleted: {
      user: user.count,
      grant: grant.count,
      lead: lead.count,
      class: cls.count,
      student: student.count,
    },
  };
}

// ─── Row types for client (Promise return types from server actions) ──
export type UserAuditRow = Awaited<
  ReturnType<typeof queryUserAuditLogs>
>["items"][number];
export type GrantAuditRow = Awaited<
  ReturnType<typeof queryGrantAuditLogs>
>["items"][number];
export type LeadAuditRow = Awaited<
  ReturnType<typeof queryLeadAuditLogs>
>["items"][number];
export type ClassAuditRow = Awaited<
  ReturnType<typeof queryClassAuditLogs>
>["items"][number];
export type StudentAuditRow = Awaited<
  ReturnType<typeof queryStudentAuditLogs>
>["items"][number];

export type AnyAuditRow =
  | UserAuditRow
  | GrantAuditRow
  | LeadAuditRow
  | ClassAuditRow
  | StudentAuditRow;
