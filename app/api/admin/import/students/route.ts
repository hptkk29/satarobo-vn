import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  StudentStatusEnum,
  BloodTypeEnum,
  GenderEnum,
} from "@/lib/validators/student";
import { can } from "@/lib/auth/permissions";
import { orgUnitIdForCenter } from "@/lib/org/org-service";

// Excel date parser — reused pattern from B3 / C2.
function parseExcelDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + v * 86400000;
    const d = new Date(ms);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (dmy) return new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1]));
    const t = Date.parse(s);
    if (Number.isNaN(t)) return null;
    const d = new Date(t);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  return null;
}

const optionalString = z
  .union([z.string(), z.null(), z.number()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s.length > 0 ? s : null;
  });

const optionalEmail = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const s = v.trim();
    if (!s) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Email PH không hợp lệ",
      });
      return z.NEVER;
    }
    return s;
  });

const arrayFromCsv = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (!v) return [];
    return v
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  });

const requiredString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .pipe(z.string().min(1, "Trường bắt buộc"));

const gradeField = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : parseInt(String(v), 10);
    if (!Number.isFinite(n) || n < 1 || n > 12) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Lớp phải từ 1 đến 12",
      });
      return z.NEVER;
    }
    return n;
  });

const StudentImportSchema = z.object({
  studentCode: optionalString,
  fullName: requiredString, // DB field is `name`
  dateOfBirth: z.unknown().optional().transform((v) => parseExcelDate(v)),
  gender: z
    .union([GenderEnum, z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === null || v === undefined ? null : v)),
  currentGrade: gradeField,
  school: optionalString,

  parentName: requiredString,
  parentPhone: requiredString,
  parentEmail: optionalEmail,
  parentRelation: optionalString,
  parent2Name: optionalString,
  parent2Phone: optionalString,
  parent2Relation: optionalString,

  address: optionalString,
  ward: optionalString,
  district: optionalString,
  city: optionalString,

  centerSlug: optionalString,
  enrollmentDate: z.unknown().optional().transform((v) => parseExcelDate(v)),
  status: z
    .union([StudentStatusEnum, z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === null || v === undefined ? "ACTIVE" : v))
    .pipe(StudentStatusEnum),

  bloodType: z
    .union([BloodTypeEnum, z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === null || v === undefined ? null : v)),
  allergies: arrayFromCsv,
  healthNotes: optionalString,
  notes: optionalString,
});

type ImportError = { row: number; error: string };

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!can(session.user, "students:import")) {
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

  // Stage 1: schema parse each row
  type Parsed = z.infer<typeof StudentImportSchema>;
  const stageOne: (
    | { ok: true; data: Parsed }
    | { ok: false; row: number; error: string }
  )[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = StudentImportSchema.safeParse(rows[i]);
    if (r.success) {
      stageOne.push({ ok: true, data: r.data });
    } else {
      stageOne.push({
        ok: false,
        row: i + 2,
        error: r.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
      });
    }
  }

  // Stage 2: resolve centerSlug → preferredCenterId
  const slugs = [
    ...new Set(
      stageOne.flatMap((r) => (r.ok && r.data.centerSlug ? [r.data.centerSlug] : [])),
    ),
  ];
  const centers = slugs.length
    ? await db.center.findMany({
        where: { slug: { in: slugs } },
        select: { id: true, slug: true },
      })
    : [];
  const slugToId = new Map(centers.map((c) => [c.slug, c.id]));

  // Dual-write 2-phase: dựng map centerId → orgUnitId 1 lần (số cơ sở nhỏ).
  const centerIdToOrgUnitId = new Map<string, string | null>();
  for (const c of centers) {
    centerIdToOrgUnitId.set(c.id, await orgUnitIdForCenter(c.id));
  }

  const errors: ImportError[] = [];
  const validRows: {
    data: Parsed;
    preferredCenterId: string | null;
    preferredOrgUnitId: string | null;
  }[] = [];

  for (let i = 0; i < stageOne.length; i++) {
    const entry = stageOne[i];
    if (!entry.ok) {
      errors.push({ row: entry.row, error: entry.error });
      continue;
    }

    let preferredCenterId: string | null = null;
    if (entry.data.centerSlug) {
      const id = slugToId.get(entry.data.centerSlug);
      if (!id) {
        errors.push({
          row: i + 2,
          error: `Không tìm thấy cơ sở với slug "${entry.data.centerSlug}"`,
        });
        continue;
      }
      preferredCenterId = id;
    }

    const preferredOrgUnitId = preferredCenterId
      ? (centerIdToOrgUnitId.get(preferredCenterId) ?? null)
      : null;

    validRows.push({ data: entry.data, preferredCenterId, preferredOrgUnitId });
  }

  if (validRows.length === 0) {
    return NextResponse.json({ success: 0, errors });
  }

  // Stage 3: upsert by studentCode in a transaction. Empty code → create only.
  let success = 0;
  try {
    await db.$transaction(async (tx) => {
      for (let i = 0; i < validRows.length; i++) {
        const r = validRows[i];
        // Map Excel fullName → DB name (schema didn't rename in D1).
        const base = {
          name: r.data.fullName,
          dateOfBirth: r.data.dateOfBirth,
          gender: r.data.gender,
          currentGrade: r.data.currentGrade,
          school: r.data.school,
          parentName: r.data.parentName,
          parentPhone: r.data.parentPhone,
          parentEmail: r.data.parentEmail,
          parentRelation: r.data.parentRelation,
          parent2Name: r.data.parent2Name,
          parent2Phone: r.data.parent2Phone,
          parent2Relation: r.data.parent2Relation,
          address: r.data.address,
          ward: r.data.ward,
          district: r.data.district,
          city: r.data.city,
          preferredCenterId: r.preferredCenterId,
          preferredOrgUnitId: r.preferredOrgUnitId, // dual-write 2-phase
          enrollmentDate: r.data.enrollmentDate,
          status: r.data.status,
          bloodType: r.data.bloodType,
          allergies: r.data.allergies ?? [],
          healthNotes: r.data.healthNotes,
          notes: r.data.notes,
        };
        try {
          if (r.data.studentCode) {
            await tx.student.upsert({
              where: { studentCode: r.data.studentCode },
              create: { ...base, studentCode: r.data.studentCode },
              update: base,
            });
          } else {
            await tx.student.create({ data: base });
          }
          success++;
        } catch (err) {
          throw new Error(
            `Row ${i + 2}${r.data.studentCode ? ` (code=${r.data.studentCode})` : ""}: ${
              err instanceof Error ? err.message : "Unknown"
            }`,
            { cause: err },
          );
        }
      }
    });
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

  revalidatePath("/admin/students");

  return NextResponse.json({ success, errors });
}
