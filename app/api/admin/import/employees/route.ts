import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  DepartmentEnum,
  GenderEnum,
  ContractTypeEnum,
  EmploymentStatusEnum,
} from "@/lib/validators/employee";

const ALLOWED_ROLES = ["SUPER_ADMIN", "CENTER_MANAGER", "HR"];

// Excel date parser — reused pattern from B3 holidays / B2 rooms.
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
  .transform((v) => {
    if (!v) return null;
    const s = v.trim();
    if (!s) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
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

const EmployeeImportSchema = z.object({
  employeeCode: requiredString.refine(
    (s) => /^[A-Za-z0-9.-]+$/.test(s),
    "Mã NV chỉ chứa chữ, số, dấu chấm/gạch",
  ),
  fullName: requiredString,
  jobTitle: requiredString,
  department: DepartmentEnum,
  status: EmploymentStatusEnum.default("ACTIVE"),
  phone: optionalString,
  email: optionalEmail,
  dateOfBirth: z.unknown().optional().transform((v) => parseExcelDate(v)),
  gender: z
    .union([GenderEnum, z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === null || v === undefined ? null : v)),
  nationalId: optionalString,
  contractType: z
    .union([ContractTypeEnum, z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === null || v === undefined ? null : v)),
  centerSlug: optionalString,
  managerCode: optionalString,
  joinedAt: z.unknown().optional().transform((v) => parseExcelDate(v)),
  endDate: z.unknown().optional().transform((v) => parseExcelDate(v)),
  address: optionalString,
  subjects: arrayFromCsv,
  certifications: arrayFromCsv,
  bio: optionalString,
  emergencyContact: optionalString,
  notes: optionalString,
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

  // Stage 1: schema parse each row
  type Parsed = z.infer<typeof EmployeeImportSchema>;
  const stageOne: (
    | { ok: true; data: Parsed }
    | { ok: false; row: number; error: string }
  )[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = EmployeeImportSchema.safeParse(rows[i]);
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

  // Stage 2: resolve centerSlug → centerId + managerCode → managerId
  const slugs = [
    ...new Set(
      stageOne.flatMap((r) => (r.ok && r.data.centerSlug ? [r.data.centerSlug] : [])),
    ),
  ];
  const managerCodes = [
    ...new Set(
      stageOne.flatMap((r) => (r.ok && r.data.managerCode ? [r.data.managerCode] : [])),
    ),
  ];

  const [centers, managers] = await Promise.all([
    slugs.length
      ? db.center.findMany({
          where: { slug: { in: slugs } },
          select: { id: true, slug: true },
        })
      : Promise.resolve([] as { id: string; slug: string }[]),
    managerCodes.length
      ? db.employee.findMany({
          where: { employeeCode: { in: managerCodes } },
          select: { id: true, employeeCode: true },
        })
      : Promise.resolve([] as { id: string; employeeCode: string }[]),
  ]);
  const slugToId = new Map(centers.map((c) => [c.slug, c.id]));
  const codeToManagerId = new Map(managers.map((m) => [m.employeeCode, m.id]));

  const errors: ImportError[] = [];
  const validRows: { data: Parsed; centerId: string | null; managerId: string | null }[] = [];

  for (let i = 0; i < stageOne.length; i++) {
    const entry = stageOne[i];
    if (!entry.ok) {
      errors.push({ row: entry.row, error: entry.error });
      continue;
    }

    let centerId: string | null = null;
    if (entry.data.centerSlug) {
      const id = slugToId.get(entry.data.centerSlug);
      if (!id) {
        errors.push({
          row: i + 2,
          error: `Không tìm thấy cơ sở với slug "${entry.data.centerSlug}"`,
        });
        continue;
      }
      centerId = id;
    }

    let managerId: string | null = null;
    if (entry.data.managerCode) {
      const id = codeToManagerId.get(entry.data.managerCode);
      if (!id) {
        errors.push({
          row: i + 2,
          error: `Không tìm thấy manager với mã "${entry.data.managerCode}"`,
        });
        continue;
      }
      managerId = id;
    }

    validRows.push({ data: entry.data, centerId, managerId });
  }

  if (validRows.length === 0) {
    return NextResponse.json({ success: 0, errors });
  }

  // Stage 3: upsert by employeeCode in a transaction.
  let success = 0;
  try {
    await db.$transaction(async (tx) => {
      for (let i = 0; i < validRows.length; i++) {
        const r = validRows[i];
        const base = {
          fullName: r.data.fullName,
          jobTitle: r.data.jobTitle,
          department: r.data.department,
          status: r.data.status,
          phone: r.data.phone,
          email: r.data.email,
          dateOfBirth: r.data.dateOfBirth,
          gender: r.data.gender,
          nationalId: r.data.nationalId,
          contractType: r.data.contractType,
          centerId: r.centerId,
          managerId: r.managerId,
          joinedAt: r.data.joinedAt,
          endDate: r.data.endDate,
          address: r.data.address,
          subjects: r.data.subjects ?? [],
          certifications: r.data.certifications ?? [],
          bio: r.data.bio,
          emergencyContact: r.data.emergencyContact,
          notes: r.data.notes,
          // Sync legacy isActive flag with new status field
          isActive: r.data.status === "ACTIVE",
        };
        try {
          await tx.employee.upsert({
            where: { employeeCode: r.data.employeeCode },
            create: { ...base, employeeCode: r.data.employeeCode },
            update: base,
          });
          success++;
        } catch (err) {
          // Most likely cause: email unique-constraint conflict with a row not
          // owned by this employeeCode. Wrap so the outer handler can report
          // which row failed without losing the original stack.
          throw new Error(
            `Row ${i + 2} (code=${r.data.employeeCode}): ${
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

  revalidatePath("/admin/nhan-su");

  return NextResponse.json({ success, errors });
}
