"use server";

// app/(admin)/admin/cham-cong/khung-ca/_actions.ts — L3: KHUNG CA CỐ ĐỊNH HẰNG TUẦN (ShiftWeeklyPattern)
// + nút "Sinh lưới tháng". Quyền `hr_attendance:assign` theo khối (cơ sở / "hoi-so").
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { writeAudit } from "@/lib/audit/audit-log";
import { HO_CENTER_ID, loadCenterMap } from "@/lib/cham-cong/home-center";
import {
  generateMonthAssignments,
  type GenerateDb,
  type GenerateResult,
} from "@/lib/cham-cong/generate-db";
import { chanSuaKyDaChot } from "@/lib/cham-cong/ky-gac";

type Res<T = null> = { ok: true; data: T } | { ok: false; error: string };
const DEFAULT_EFFECTIVE_FROM = new Date(Date.UTC(2000, 0, 1));

const cellSchema = z.object({
  userId: z.string().min(1),
  centerId: z.string().min(1), // khối: centerId thật hoặc "hoi-so"
  weekday: z.number().int().min(0).max(6),
  code: z.string().trim().toUpperCase().nullable(),
  sheetName: z.string().trim().max(60).optional(),
  jobLabel: z.string().trim().max(60).optional(),
});

/** Ghi một ô khung ca (mã hoặc trống). Trống = xoá dòng pattern của thứ đó. */
export async function savePatternCellAction(input: unknown): Promise<Res> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  const p = cellSchema.safeParse(input);
  if (!p.success)
    return {
      ok: false,
      error: p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  const { userId, centerId, weekday, code } = p.data;
  if (!(await checkPermission("hr_attendance:assign", { centerId })))
    return { ok: false, error: "Không có quyền xếp khung ca ở khối này" };
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const where = {
    userId_centerId_weekday_effectiveFrom: {
      userId,
      centerId,
      weekday,
      effectiveFrom: DEFAULT_EFFECTIVE_FROM,
    },
  };
  if (!code) {
    await sdb.shiftWeeklyPattern.deleteMany({
      where: {
        userId,
        centerId,
        weekday,
        effectiveFrom: DEFAULT_EFFECTIVE_FROM,
      },
    });
  } else {
    // Khối HO không có Center thật ⇒ chỉ nhận mã dùng chung; khối cơ sở nhận mã dùng chung + mã riêng.
    const isHoBlock = centerId === HO_CENTER_ID;
    const tpl = await sdb.shiftTemplate.findFirst({
      where: {
        code,
        isActive: true,
        OR: isHoBlock
          ? [{ centerId: null }]
          : [{ centerId: null }, { centerId }],
      },
      select: { id: true, code: true },
    });
    if (!tpl)
      return { ok: false, error: `Mã "${code}" không có trong danh mục` };
    const map = await loadCenterMap();
    const orgUnitId = isHoBlock
      ? null
      : // eslint-disable-next-line no-restricted-syntax -- tra bảng đơn vị, không phải kiểm quyền
        (Object.values(map.byCode).find((c) => c.centerId === centerId)
          ?.orgUnitId ?? null);
    await sdb.shiftWeeklyPattern.upsert({
      where,
      create: {
        userId,
        centerId,
        orgUnitId,
        weekday,
        templateId: tpl.id,
        templateCode: tpl.code,
        sheetName: p.data.sheetName ?? null,
        jobLabel: p.data.jobLabel ?? null,
        effectiveFrom: DEFAULT_EFFECTIVE_FROM,
      },
      update: {
        templateId: tpl.id,
        templateCode: tpl.code,
        orgUnitId,
        ...(p.data.sheetName ? { sheetName: p.data.sheetName } : {}),
        ...(p.data.jobLabel ? { jobLabel: p.data.jobLabel } : {}),
      },
    });
  }
  revalidatePath("/cham-cong/khung-ca");
  return { ok: true, data: null };
}

/** Thêm một người vào khối (7 ô trống) — chỉ ghi khi người dùng chọn mã; ở đây tạo dòng Thứ Hai = X để hàng xuất hiện. */
export async function addPersonToBlockAction(input: {
  userId: string;
  centerId: string;
  sheetName?: string;
  jobLabel?: string;
}): Promise<Res> {
  return savePatternCellAction({ ...input, weekday: 1, code: "X" });
}

const genSchema = z.object({
  periodKey: z.string().regex(/^\d{4}-\d{2}$/),
  centerIds: z.array(z.string().min(1)).min(1).max(10),
  /** Đường vượt cổng "kỳ đã chốt sổ" — chỉ cấp Hội sở, bắt buộc lý do. */
  boQuaKyDaChot: z.boolean().optional(),
  lyDo: z.string().trim().max(300).optional(),
});

/** Sinh lưới tháng từ khung ca cho các khối được chọn. Không đè ô đã sửa tay / đơn / file. */
export async function generateMonthAction(
  input: unknown,
): Promise<Res<GenerateResult>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  const p = genSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Kỳ / khối không hợp lệ" };
  const allowed = new Set<string>();
  for (const id of p.data.centerIds)
    if (await checkPermission("hr_attendance:assign", { centerId: id }))
      allowed.add(id);
  if (allowed.size === 0)
    return { ok: false, error: "Không có quyền phân ca ở khối nào đã chọn" };

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  // ── CHẶN CỨNG: không xếp lại khung ca vào kỳ ĐÃ CHỐT SỔ (08/09/2026) ─────────
  //
  // `generateMonthAssignments` ghi đè `ShiftAssignment` cho cả tháng và KHÔNG hỏi
  // trạng thái kỳ. Kỳ đã chốt thì `StaffAttendanceDay` đã đóng băng theo số cũ, nên ghi
  // đè là làm lệch bảng công đã ký. Đo 08/09: prod 1 kỳ OPEN / 0 LOCKED — lỗ chưa ai
  // khai thác được, và đang mở sẵn cho lần chốt kỳ ĐẦU TIÊN.
  //
  // Đặt TRƯỚC khi gọi engine: cổng phải chặn trước khi có dòng nào bị ghi.
  const kyDaChot = await sdb.attendancePeriod.findMany({
    where: {
      centerId: { in: [...allowed] },
      periodKey: p.data.periodKey,
      status: "LOCKED",
    },
    select: { centerId: true },
  });
  if (kyDaChot.length > 0) {
    const loi = chanSuaKyDaChot({
      status: "LOCKED",
      periodKey: p.data.periodKey,
    });
    // Đường vượt cấp HỘI SỞ + lý do bắt buộc — cùng khuôn `reopenPeriodAction`. Cơ sở tự
    // vượt cổng chặn của chính mình thì cổng đó không tồn tại.
    if (!p.data.boQuaKyDaChot) return { ok: false, error: loi! };
    if (
      !(await checkPermission("hr_attendance:close-period", {
        centerId: HO_CENTER_ID,
      }))
    ) {
      return {
        ok: false,
        error: "Chỉ cấp Hội sở mới xếp lại được khung ca của kỳ đã chốt",
      };
    }
    if ((p.data.lyDo ?? "").trim().length < 5) {
      return {
        ok: false,
        error:
          "Xếp lại khung ca của kỳ đã chốt phải ghi lý do (tối thiểu 5 ký tự)",
      };
    }
  }

  const map = await loadCenterMap();
  const result = await generateMonthAssignments({
    db: sdb as unknown as GenerateDb,
    periodKey: p.data.periodKey,
    centerMap: map,
    centerIds: [...allowed],
    canWriteCenter: (c) => allowed.has(c),
    actorUserId: session.user.id,
  });
  await writeAudit({
    actor: { id: session.user.id, name: session.user.name ?? "" },
    module: "hr_attendance",
    entityType: "ShiftAssignment",
    entityId: p.data.periodKey,
    action: "GENERATE",
    newValues: {
      periodKey: p.data.periodKey,
      centerIds: [...allowed],
      boQuaKyDaChot: p.data.boQuaKyDaChot === true,
      kyDaChot: kyDaChot.map((k: { centerId: string }) => k.centerId),
      ...result,
      restWarnings: result.restWarnings.length,
    },
    reason: p.data.lyDo,
  });
  // Làm giàu TÊN cho cảnh báo 7 ngày không nghỉ. Tầng lib cố ý không tra được tên
  // (`GenerateDb` chỉ có 3 model, không có `user`), nên hộp thoại trước đây chỉ in được khoảng
  // ngày rồi phải nói vòng "xem lưới bên dưới để biết là ai" — tự nó thừa nhận thiếu.
  // `User` thuộc `SCOPE_EXEMPT` nên `sdb` vẫn tra được tên; rỗng thì bỏ hẳn truy vấn, đừng bắn
  // `in: []`. Audit ở trên GIỮ NGUYÊN chỉ số đếm — đừng nhét tên người vào `newValues`.
  const idCanhBao = [...new Set(result.restWarnings.map((w) => w.userId))];
  const tenCua = idCanhBao.length
    ? new Map(
        (
          await sdb.user.findMany({
            where: { id: { in: idCanhBao } },
            select: { id: true, name: true, email: true },
          })
        ).map((u) => [u.id, u.name ?? u.email ?? u.id]),
      )
    : new Map<string, string>();

  revalidatePath("/cham-cong/phan-ca");
  return {
    ok: true,
    data: {
      ...result,
      restWarnings: result.restWarnings.map((w) => ({
        ...w,
        name: tenCua.get(w.userId) ?? null,
      })),
    },
  };
}
