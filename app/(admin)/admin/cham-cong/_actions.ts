"use server";

// app/(admin)/admin/cham-cong/_actions.ts — L5: GHI ĐÈ CÔNG NGÀY (hộp cờ Quản lý — T-01: lượt quét chỉ
// sinh cờ, người quyết là Quản lý). Quyền `hr_attendance:adjust` tại cơ sở chịu công của ngày đó.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { writeAudit } from "@/lib/audit/audit-log";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { setDayOverride } from "@/lib/cham-cong/period";

type Res = { ok: true } | { ok: false; error: string };

const schema = z.object({
  userId: z.string().min(1),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  units: z.coerce.number().min(0).max(3).nullable(),
  note: z.string().trim().max(300).nullable(),
});

export async function setDayOverrideAction(input: unknown): Promise<Res> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const [y, m, d] = p.data.workDate.split("-").map(Number);
  const workDate = new Date(Date.UTC(y, m - 1, d));
  const sdb = scopedDb(await resolveActor(session.user.id));
  const row = await sdb.staffAttendanceDay.findUnique({ where: { userId_workDate: { userId: p.data.userId, workDate } }, select: { centerId: true } });
  if (!row) return { ok: false, error: "Ngày này chưa được tính" };
  if (!(await checkPermission("hr_attendance:adjust", { centerId: row.centerId }))) return { ok: false, error: "Không có quyền chỉnh công ở cơ sở này" };
  const r = await setDayOverride({ userId: p.data.userId, workDate, units: p.data.units, note: p.data.note, actorId: session.user.id });
  if (!r.ok) return r;
  await writeAudit({
    actor: { id: session.user.id, name: session.user.name ?? "" },
    module: "hr_attendance",
    entityType: "StaffAttendanceDay",
    entityId: `${p.data.userId}:${p.data.workDate}`,
    action: p.data.units == null ? "CLEAR_OVERRIDE" : "SET_OVERRIDE",
    oldValues: { overrideUnits: r.before },
    newValues: { overrideUnits: p.data.units },
    reason: p.data.note ?? undefined,
  });
  revalidatePath("/cham-cong");
  revalidatePath("/cham-cong/ky-cong");
  return { ok: true };
}

// ── Kết luận NGÀY VẮNG (đợt 2, chốt 07/09/2026) ────────────────────────────────────────────
//
// Vì sao phải có người bấm: cờ `KHONG_CO_LUOT` KHÔNG đồng nghĩa nghỉ không phép — nó còn do
// quên quét, quầy hỏng, đi công tác, làm ngoài trung tâm. Chủ dự án chốt không tự động trừ 2%
// từ cờ đó; chỉ ngày quản lý xác nhận mới vào cột trừ nội quy.
//
// Ghi thẳng vào 4 cột `absence*` của `StaffAttendanceDay` thay vì bảng riêng: đúng grain
// (một người × một ngày), và `recomputeAttendanceDay` liệt kê TƯỜNG MINH các cột nó ghi nên
// kết luận của người sống sót qua mọi lần tính lại — y như cặp `override*`.
const absenceSchema = z.object({
  userId: z.string().min(1),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** null = gỡ kết luận, trả ngày về diện "chờ kết luận". */
  status: z.enum(["UNAUTHORISED", "EXCUSED"]).nullable(),
  note: z.string().trim().max(300).nullable(),
});

export async function setDayAbsenceAction(input: unknown): Promise<Res> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  const p = absenceSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  // Kết luận "không phép" là chuyện tiền bạc — bắt buộc nêu căn cứ. "Có lý do" thì không ép,
  // vì lý do thường đã nằm ở đơn từ hoặc tin nhắn.
  if (p.data.status === "UNAUTHORISED" && !p.data.note) {
    return { ok: false, error: "Ghi lý do kết luận không phép — đây là căn cứ trừ % nội quy" };
  }

  const [y, m, d] = p.data.workDate.split("-").map(Number);
  const workDate = new Date(Date.UTC(y, m - 1, d));
  const sdb = scopedDb(await resolveActor(session.user.id));
  const row = await sdb.staffAttendanceDay.findUnique({
    where: { userId_workDate: { userId: p.data.userId, workDate } },
    select: { centerId: true, status: true, absenceStatus: true },
  });
  if (!row) return { ok: false, error: "Ngày này chưa được tính" };
  // `scopedDb` KHÔNG che đường ghi — phải tự gác bằng target thật.
  if (!(await checkPermission("hr_attendance:adjust", { centerId: row.centerId }))) {
    return { ok: false, error: "Không có quyền kết luận ngày vắng ở cơ sở này" };
  }
  if (row.status === "LOCKED") {
    return { ok: false, error: "Kỳ đã chốt — mở lại kỳ trước khi đổi kết luận" };
  }

  // Ghi qua `sdb`: `scopedDb` KHÔNG tự che đường ghi, nhưng dòng này đã qua hai cổng thật —
  // `findUnique` ở trên chạy qua sdb (nên actor phải NHÌN THẤY được dòng) và `checkPermission`
  // với target là cơ sở chịu công của chính ngày đó.
  await sdb.staffAttendanceDay.update({
    where: { userId_workDate: { userId: p.data.userId, workDate } },
    data: {
      absenceStatus: p.data.status,
      absenceById: p.data.status ? session.user.id : null,
      absenceAt: p.data.status ? new Date() : null,
      absenceNote: p.data.status ? p.data.note : null,
    },
  });

  await writeAudit({
    actor: { id: session.user.id, name: session.user.name ?? "" },
    module: "hr_attendance",
    entityType: "StaffAttendanceDay",
    entityId: `${p.data.userId}:${p.data.workDate}`,
    action: p.data.status ? "SET_ABSENCE" : "CLEAR_ABSENCE",
    oldValues: { absenceStatus: row.absenceStatus },
    newValues: { absenceStatus: p.data.status },
    reason: p.data.note ?? undefined,
  });
  revalidatePath("/cham-cong");
  revalidatePath("/cham-cong/thong-ke");
  revalidatePath("/cham-cong/ky-cong");
  return { ok: true };
}
