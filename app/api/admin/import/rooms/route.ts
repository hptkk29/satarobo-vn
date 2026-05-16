import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const ALLOWED_ROLES = ["SUPER_ADMIN", "MANAGER"];

const intish = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => {
    if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : 0;
    if (typeof v === "string") {
      const n = parseInt(v.trim(), 10);
      return Number.isNaN(n) ? 0 : n;
    }
    return 0;
  });

const equipmentish = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (!v) return [];
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  });

const capacityish = z
  .union([z.number(), z.string()])
  .transform((v, ctx) => {
    const n = typeof v === "number" ? v : parseInt(String(v).trim(), 10);
    if (!Number.isFinite(n) || n < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sức chứa phải >= 1",
      });
      return z.NEVER;
    }
    return Math.trunc(n);
  });

const RoomImportSchema = z.object({
  name: z.string().trim().min(1, "Thiếu tên"),
  code: z
    .string()
    .trim()
    .min(1, "Thiếu mã phòng")
    .regex(/^[A-Z0-9-]+$/, "Mã chỉ A-Z, 0-9, dấu -"),
  centerSlug: z.string().trim().min(1, "Thiếu centerSlug"),
  capacity: capacityish,
  equipment: equipmentish,
  status: z.enum(["ACTIVE", "MAINTENANCE", "INACTIVE"]).default("ACTIVE"),
  notes: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (!v) return null;
      const t = v.trim();
      return t.length > 0 ? t : null;
    }),
  displayOrder: intish,
});

type ImportError = { row: number; error: string };

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rows = (body as { rows?: unknown[] })?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "Không có dữ liệu" }, { status: 400 });
  }
  if (rows.length > 5000) {
    return NextResponse.json({ error: "Quá 5000 rows" }, { status: 400 });
  }

  // First pass: parse each row's shape
  const stageOne: ({ ok: true; data: z.infer<typeof RoomImportSchema> } | { ok: false; row: number; error: string })[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = RoomImportSchema.safeParse(rows[i]);
    if (r.success) {
      stageOne.push({ ok: true, data: r.data });
    } else {
      stageOne.push({
        row: i + 2,
        ok: false,
        error: r.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
      });
    }
  }

  // Lookup centerSlug → id (only for shape-valid rows)
  const slugs = [
    ...new Set(
      stageOne.flatMap((r) => (r.ok ? [r.data.centerSlug] : [])),
    ),
  ];
  const centers = slugs.length
    ? await db.center.findMany({
        where: { slug: { in: slugs } },
        select: { id: true, slug: true },
      })
    : [];
  const slugToId = new Map(centers.map((c) => [c.slug, c.id]));

  const validRows: { data: z.infer<typeof RoomImportSchema>; centerId: string }[] = [];
  const errors: ImportError[] = [];

  for (let i = 0; i < stageOne.length; i++) {
    const entry = stageOne[i];
    if (!entry.ok) {
      errors.push({ row: entry.row, error: entry.error });
      continue;
    }
    const centerId = slugToId.get(entry.data.centerSlug);
    if (!centerId) {
      errors.push({
        row: i + 2,
        error: `Không tìm thấy cơ sở với slug "${entry.data.centerSlug}"`,
      });
      continue;
    }
    validRows.push({ data: entry.data, centerId });
  }

  if (validRows.length === 0) {
    return NextResponse.json({ success: 0, errors });
  }

  try {
    await db.$transaction(
      validRows.map((r) =>
        db.room.upsert({
          where: {
            centerId_code: { centerId: r.centerId, code: r.data.code },
          },
          create: {
            name: r.data.name,
            code: r.data.code,
            centerId: r.centerId,
            capacity: r.data.capacity,
            equipment: r.data.equipment ?? [],
            status: r.data.status,
            notes: r.data.notes ?? null,
            displayOrder: r.data.displayOrder ?? 0,
          },
          update: {
            name: r.data.name,
            capacity: r.data.capacity,
            equipment: r.data.equipment ?? [],
            status: r.data.status,
            notes: r.data.notes ?? null,
            displayOrder: r.data.displayOrder ?? 0,
          },
        }),
      ),
    );
  } catch (err) {
    return NextResponse.json(
      {
        success: 0,
        errors: [
          ...errors,
          {
            row: 0,
            error: `Transaction failed: ${err instanceof Error ? err.message : "Unknown"}`,
          },
        ],
      },
      { status: 500 },
    );
  }

  revalidatePath("/admin/rooms");

  return NextResponse.json({ success: validRows.length, errors });
}
