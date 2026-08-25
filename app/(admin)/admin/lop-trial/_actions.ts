"use server";

// app/(admin)/admin/lop-trial/_actions.ts — GĐ2.
//
// Lớp action RIÊNG của màn "Lớp Trial". CỐ Ý không import bất cứ thứ gì từ
// `../trials/**` hay `../trial-classes/**`: hai màn cũ phải chạy nguyên vẹn suốt
// giai đoạn nghiệm thu song song, và ở GĐ6 xoá chúng phải không kéo theo màn này.
// Logic dùng chung nằm ở `@/lib/trial/service.ts`; phần nào action cũ tự làm thì
// được CHÉP sang đây kèm ghi chú nguồn.
//
// Hậu tố `LopTrial` trong tên hàm là có chủ đích: suốt giai đoạn chạy song song,
// log và audit sẽ có hai bộ action làm việc giống nhau — trùng tên là nguồn nhầm lẫn.
import { revalidatePath } from "next/cache";
import type { LeadStatus, Prisma, TrialClassStatus } from "@prisma/client";
import { checkPermission } from "@/lib/auth/check-permission";
import { scopedDb } from "@/lib/db-scope";
import { getAuditActor } from "@/lib/audit/log";
import { writeAudit } from "@/lib/audit/audit-log";
import { publishEvent } from "@/lib/events/publish";
import { teacherCenterAssignmentError } from "@/lib/teachers/center-filter";
import { leadStatusLabel } from "@/lib/leads/status";
import { phoneSearchTerm } from "@/lib/phone";
import {
  setTrialProgramConfig,
  createTrialClass,
  addTrialSession,
  enrollLeadChild,
  unenrollLeadChild,
  markAttendance,
  completeTrialSession,
  cancelTrialClass,
  notifyTrialTeacherAssigned,
} from "@/lib/trial/service";
import {
  actorCanUseCenter,
  loadScopedBooking,
  loadScopedTrialClass,
  loadScopedTrialSession,
  requireActor,
} from "./_lib/guards";
import {
  addSessionSchema,
  attendanceSchema,
  configSchema,
  createClassSchema,
  parseVnInput,
  updateBookingSchema,
} from "./_lib/schemas";
import { ngayVnSangUtc } from "./_lib/filters";
import type { ActionResult, Candidate } from "./_lib/types";

const CHUA_DANG_NHAP = "Chưa đăng nhập" as const;
const KHONG_THAY_LOP = "Không tìm thấy lớp trải nghiệm" as const;

/**
 * Ai được điểm danh / hoàn tất một buổi trải nghiệm.
 *
 * Người quản lý cơ sở làm được mọi lớp trong tầm nhìn; ngoài ra chỉ giáo viên phụ
 * trách chính lớp đó.
 *
 * ⚠️ Màn cũ viết rào này là `!isManager && hasRole(user, "TEACHER") && ...`. Bản mới
 * BỎ vế `hasRole` vì hai lý do: (1) luật cứng Nền Hệ thống #1 cấm so vai thủ công
 * trong Server Action — file cũ chỉ chạy được nhờ nằm trong danh sách miễn trừ, và
 * code mới không xin miễn trừ; (2) bỏ vế đó làm rào CHẶT hơn theo hướng fail-closed:
 * vai nào có `trials:feedback` mà không có `trials:manage` thì nay cũng chỉ thao tác
 * được lớp mình dạy. Hôm nay điều đó KHÔNG đổi hành vi của ai — trong seed vai, vai
 * duy nhất có feedback mà không có manage đúng là TEACHER.
 */
async function duocThaoTacBuoi(ses: {
  centerId: string;
  classTeacherId: string | null;
}): Promise<boolean> {
  if (await checkPermission("trials:manage", { centerId: ses.centerId })) return true;
  const ctx = await requireActor();
  return Boolean(ctx && ses.classTeacherId === ctx.session.user.id);
}

/**
 * Làm mới cả màn mới LẪN hai màn cũ.
 * Trong giai đoạn chạy song song, người nghiệm thu sẽ mở chéo hai bên trên cùng một
 * dữ liệu; thiếu mấy dòng này thì màn kia hiện số cũ và bị báo là "lỗi mất dữ liệu".
 * GĐ6 gỡ ba dòng cuối cùng với hai màn cũ.
 */
function lamMoi(trialClassId?: string): void {
  revalidatePath("/lop-trial");
  if (trialClassId) revalidatePath(`/lop-trial/${trialClassId}`);
  revalidatePath("/trial-classes");
  if (trialClassId) revalidatePath(`/trial-classes/${trialClassId}`);
}

function lamMoiHen(leadId?: string): void {
  revalidatePath("/lop-trial/lich-hen");
  revalidatePath("/trials");
  if (leadId) revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}

// ═══════════════════════════════════════════════════════════════════════════
// 1) Cấu hình số buổi
// ═══════════════════════════════════════════════════════════════════════════

export async function saveTrialConfigLopTrialAction(
  input: unknown,
): Promise<ActionResult> {
  const ctx = await requireActor();
  if (!ctx) return { ok: false, error: CHUA_DANG_NHAP };
  if (!(await checkPermission("trials:config"))) {
    return { ok: false, error: "Không có quyền cấu hình số buổi" };
  }

  const parsed = configSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const res = await setTrialProgramConfig({
    name: parsed.data.name,
    sessionCount: parsed.data.sessionCount,
    actorId: ctx.session.user.id,
  });
  if (!res?.ok) return { ok: false, error: res?.error ?? "Lưu cấu hình thất bại" };

  lamMoi();
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2) Tạo lớp
// ═══════════════════════════════════════════════════════════════════════════

export async function createLopTrialClassAction(
  input: unknown,
): Promise<ActionResult<{ id?: string }>> {
  const ctx = await requireActor();
  if (!ctx) return { ok: false, error: CHUA_DANG_NHAP };
  if (!(await checkPermission("trials:manage"))) {
    return { ok: false, error: "Không có quyền tạo lớp trải nghiệm" };
  }

  const parsed = createClassSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  if (!actorCanUseCenter(ctx.actor, data.centerId)) {
    return { ok: false, error: "Bạn không có quyền tạo lớp tại cơ sở này" };
  }

  const res = await createTrialClass({
    centerId: data.centerId,
    name: data.name,
    configId: null,
    roomId: data.roomId ?? null,
    teacherId: data.teacherId ?? null,
    // QĐ-R2-1 — lớp là slot tái sử dụng, KHÔNG gắn ngày khai giảng. Buổi tạo ad-hoc.
    startDate: null,
    sessionCount: data.sessionCount,
    startTime: data.startTime,
    endTime: data.endTime,
    capacity: data.capacity,
    actorId: ctx.session.user.id,
  });
  if (!res?.ok) return { ok: false, error: res?.error ?? "Tạo lớp thất bại" };

  lamMoi();
  return { ok: true, id: res.trialClassId };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3) Thêm buổi
// ═══════════════════════════════════════════════════════════════════════════

export async function addLopTrialSessionAction(
  input: unknown,
): Promise<ActionResult<{ sessionId?: string }>> {
  const ctx = await requireActor();
  if (!ctx) return { ok: false, error: CHUA_DANG_NHAP };
  if (!(await checkPermission("trials:manage"))) {
    return { ok: false, error: "Không có quyền thêm buổi trải nghiệm" };
  }

  const parsed = addSessionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const cls = await loadScopedTrialClass(ctx.actor, data.trialClassId);
  if (!cls) return { ok: false, error: KHONG_THAY_LOP };

  // Cột `date` là `@db.Date` → lưu UTC 00:00 của NGÀY VN. Không dùng `new Date(str)`:
  // hàm đó đọc múi giờ tiến trình, Vercel chạy UTC còn máy dev +07 nên lệch một ngày.
  const date = ngayVnSangUtc(data.date);
  if (!date) return { ok: false, error: "Ngày buổi học không hợp lệ" };

  const res = await addTrialSession({
    trialClassId: data.trialClassId,
    date,
    startTime: data.startTime,
    endTime: data.endTime,
    // undefined = kế thừa GV/phòng của lớp; null = cố ý bỏ trống. Quy ước của service.
    teacherId: data.teacherId === undefined ? undefined : data.teacherId,
    roomId: data.roomId === undefined ? undefined : data.roomId,
    actorId: ctx.session.user.id,
  });
  if (!res?.ok) return { ok: false, error: res?.error ?? "Thêm buổi thất bại" };

  lamMoi(data.trialClassId);
  return { ok: true, sessionId: res.sessionId };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4) Xếp học viên vào lớp
// ═══════════════════════════════════════════════════════════════════════════

export async function enrollLeadChildLopTrialAction(input: {
  trialClassId: string;
  leadChildId: string;
  allowOverride?: boolean;
  totalSessions?: number;
  sessionId?: string | null;
}): Promise<ActionResult> {
  const ctx = await requireActor();
  if (!ctx) return { ok: false, error: CHUA_DANG_NHAP };
  if (!(await checkPermission("trials:manage"))) {
    return { ok: false, error: "Không có quyền xếp chỗ học trải nghiệm" };
  }

  const allowOverride = input.allowOverride === true;
  if (allowOverride && !(await checkPermission("trials:override-capacity"))) {
    return { ok: false, error: "Không có quyền vượt sĩ số" };
  }
  if (!input.trialClassId || !input.leadChildId) {
    return { ok: false, error: "Thiếu lớp hoặc học viên" };
  }

  let totalSessions: number | undefined;
  if (input.totalSessions != null) {
    const n = Number(input.totalSessions);
    if (!Number.isInteger(n) || n < 1 || n > 60) {
      return { ok: false, error: "Số buổi học thử phải là số nguyên từ 1 đến 60" };
    }
    totalSessions = n;
  }

  const cls = await loadScopedTrialClass(ctx.actor, input.trialClassId);
  if (!cls) return { ok: false, error: KHONG_THAY_LOP };

  // Buổi được chọn phải thuộc ĐÚNG lớp đang xếp — chống POST thẳng buổi của lớp khác.
  if (input.sessionId) {
    const ses = await scopedDb(ctx.actor).trialClassSession.findUnique({
      where: { id: input.sessionId },
      select: { trialClassId: true },
    });
    if (!ses || ses.trialClassId !== input.trialClassId) {
      return { ok: false, error: "Buổi học không thuộc lớp đã chọn" };
    }
  }

  const res = await enrollLeadChild({
    trialClassId: input.trialClassId,
    leadChildId: input.leadChildId,
    allowOverride,
    addedById: ctx.session.user.id,
    totalSessions,
    sessionId: input.sessionId ?? null,
  });
  if (!res?.ok) {
    // Surface cờ overCapacity để UI mời người có quyền bấm xác nhận vượt sĩ số.
    return {
      ok: false,
      error: res?.error ?? "Xếp chỗ thất bại",
      overCapacity: res?.overCapacity === true,
    };
  }

  lamMoi(input.trialClassId);
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5) Tìm học viên để xếp
// ═══════════════════════════════════════════════════════════════════════════

export async function searchLopTrialCandidatesAction(input: {
  trialClassId: string;
  query: string;
}): Promise<ActionResult<{ candidates: Candidate[] }>> {
  const ctx = await requireActor();
  if (!ctx) return { ok: false, error: CHUA_DANG_NHAP };
  if (!(await checkPermission("trials:manage"))) {
    return { ok: false, error: "Không có quyền tìm học viên" };
  }

  const cls = await loadScopedTrialClass(ctx.actor, input.trialClassId);
  if (!cls) return { ok: false, error: KHONG_THAY_LOP };

  const q = (input.query ?? "").trim();
  // SĐT lưu 2 dạng trong DB (0… cũ / 84… mới) — tìm theo phần lõi để không sót.
  const qPhone = phoneSearchTerm(q) ?? q;
  const sdb = scopedDb(ctx.actor);
  // Chỉ con CHƯA ở lớp ACTIVE nào (partial-unique cho phép đúng 1 lớp ACTIVE / con).
  const childFree = { trialEnrollments: { none: { status: "ACTIVE" as const } } };

  const leads = await sdb.lead.findMany({
    where: {
      centerId: cls.centerId,
      status: { notIn: ["ENROLLED", "LOST", "DUPLICATE", "REGISTERED"] },
      children: { some: childFree },
      ...(q
        ? {
            OR: [
              { parentName: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: qPhone } },
              {
                children: {
                  some: { fullName: { contains: q, mode: "insensitive" as const } },
                },
              },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      parentName: true,
      phone: true,
      status: true,
      children: { where: childFree, select: { id: true, fullName: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  const candidates: Candidate[] = leads.flatMap((l) =>
    l.children.map((c) => ({
      leadChildId: c.id,
      childName: c.fullName,
      parentName: l.parentName,
      phone: l.phone,
      leadStatus: leadStatusLabel(l.status),
    })),
  );
  return { ok: true, candidates };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6) Gỡ học viên khỏi lớp
// ═══════════════════════════════════════════════════════════════════════════

export async function unenrollLeadChildLopTrialAction(input: {
  trialClassId: string;
  leadChildId: string;
}): Promise<ActionResult> {
  const ctx = await requireActor();
  if (!ctx) return { ok: false, error: CHUA_DANG_NHAP };
  if (!(await checkPermission("trials:manage"))) {
    return { ok: false, error: "Không có quyền gỡ học viên" };
  }
  if (!input.trialClassId || !input.leadChildId) {
    return { ok: false, error: "Thiếu lớp hoặc học viên" };
  }

  const cls = await loadScopedTrialClass(ctx.actor, input.trialClassId);
  if (!cls) return { ok: false, error: KHONG_THAY_LOP };

  const res = await unenrollLeadChild({
    trialClassId: input.trialClassId,
    leadChildId: input.leadChildId,
    actorId: ctx.session.user.id,
  });
  if (!res?.ok) return { ok: false, error: res?.error ?? "Gỡ học viên thất bại" };

  lamMoi(input.trialClassId);
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// 7) Gán giáo viên phụ trách lớp
// ═══════════════════════════════════════════════════════════════════════════

export async function assignLopTrialTeacherAction(
  trialClassId: string,
  teacherId: string | null,
): Promise<ActionResult> {
  const ctx = await requireActor();
  if (!ctx) return { ok: false, error: CHUA_DANG_NHAP };
  if (!(await checkPermission("trials:assign-teacher"))) {
    return { ok: false, error: "Không có quyền gán giáo viên" };
  }

  const cls = await loadScopedTrialClass(ctx.actor, trialClassId);
  if (!cls) return { ok: false, error: KHONG_THAY_LOP };

  const sdb = scopedDb(ctx.actor);

  // Backstop cho dropdown. Từ 06/08 hàm này chỉ còn chặn user KHÔNG TỒN TẠI —
  // chính sách hiện hành là "giáo viên là nguồn lực chung", không ràng buộc cơ sở.
  if (teacherId) {
    const t = await sdb.user.findUnique({
      where: { id: teacherId },
      select: { centerId: true },
    });
    const err = teacherCenterAssignmentError(cls.centerId, [
      { id: teacherId, centerId: t?.centerId },
    ]);
    if (err) return { ok: false, error: err };
  }

  // ⚠️ update/updateMany KHÔNG được scopedDb che. An toàn nhờ loadScopedTrialClass ở trên.
  await sdb.trialClassV2.update({
    where: { id: trialClassId },
    data: { teacherId: teacherId || null },
  });
  // Lan GV xuống các buổi CHƯA diễn ra; buổi đã xong giữ nguyên GV cũ để không viết
  // lại lịch sử ai đã dạy.
  await sdb.trialClassSession.updateMany({
    where: { trialClassId, status: "SCHEDULED" },
    data: { teacherId: teacherId || null },
  });

  // Không báo khi: gỡ gán, gán lại chính GV cũ, hoặc tự gán mình.
  if (teacherId && teacherId !== cls.teacherId && teacherId !== ctx.session.user.id) {
    await notifyTrialTeacherAssigned({
      teacherId,
      title: "Bạn được phân công lớp trải nghiệm",
      body: `Bạn vừa được gán phụ trách lớp trải nghiệm ${cls.name}. Xem lịch và học viên ở mục Lớp Trial.`,
      dedupeKey: `trial-class.assigned:${trialClassId}`,
      entityId: trialClassId,
    });
  }

  lamMoi(trialClassId);
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// 8) Huỷ lớp
// ═══════════════════════════════════════════════════════════════════════════

export async function cancelLopTrialClassAction(
  trialClassId: string,
): Promise<ActionResult> {
  const ctx = await requireActor();
  if (!ctx) return { ok: false, error: CHUA_DANG_NHAP };
  if (!(await checkPermission("trials:manage"))) {
    return { ok: false, error: "Không có quyền huỷ lớp" };
  }

  const cls = await loadScopedTrialClass(ctx.actor, trialClassId);
  if (!cls) return { ok: false, error: KHONG_THAY_LOP };

  const res = await cancelTrialClass({ trialClassId, actorId: ctx.session.user.id });
  if (!res?.ok) return { ok: false, error: res?.error ?? "Huỷ lớp thất bại" };

  lamMoi(trialClassId);
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// 9) Điểm danh buổi trải nghiệm
// ═══════════════════════════════════════════════════════════════════════════

export async function markLopTrialAttendanceAction(
  input: unknown,
): Promise<ActionResult> {
  const ctx = await requireActor();
  if (!ctx) return { ok: false, error: CHUA_DANG_NHAP };
  if (!(await checkPermission("trials:feedback"))) {
    return { ok: false, error: "Không có quyền điểm danh" };
  }

  const parsed = attendanceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const ses = await loadScopedTrialSession(ctx.actor, parsed.data.trialSessionId);
  if (!ses) return { ok: false, error: "Không tìm thấy buổi học" };

  if (!(await duocThaoTacBuoi(ses))) {
    return { ok: false, error: "Bạn chỉ được điểm danh lớp được phân công" };
  }

  // ⚠️ KHÔNG atomic cả buổi: service ghi 1 bản ghi mỗi lần gọi nên vòng lặp này dừng ở
  // lỗi đầu tiên và để lại nửa lớp đã ghi. Đây là hành vi của màn cũ, chép nguyên có
  // chủ đích — đổi sang transaction là thay đổi nghiệp vụ, không thuộc phạm vi GĐ2.
  for (const r of parsed.data.records) {
    const res = await markAttendance({
      trialSessionId: parsed.data.trialSessionId,
      trialEnrollmentId: r.trialEnrollmentId,
      status: r.status,
      note: r.note ?? null,
      actorId: ctx.session.user.id,
    });
    if (!res?.ok) return { ok: false, error: res?.error ?? "Điểm danh thất bại" };
  }

  lamMoi(ses.trialClassId);
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// 10) Hoàn tất buổi
// ═══════════════════════════════════════════════════════════════════════════

export async function completeLopTrialSessionAction(
  trialSessionId: string,
): Promise<ActionResult> {
  const ctx = await requireActor();
  if (!ctx) return { ok: false, error: CHUA_DANG_NHAP };
  if (!(await checkPermission("trials:feedback"))) {
    return { ok: false, error: "Không có quyền hoàn tất buổi" };
  }
  if (!trialSessionId) return { ok: false, error: "Thiếu buổi học" };

  const ses = await loadScopedTrialSession(ctx.actor, trialSessionId);
  if (!ses) return { ok: false, error: "Không tìm thấy buổi học" };

  if (!(await duocThaoTacBuoi(ses))) {
    return { ok: false, error: "Bạn chỉ được thao tác lớp được phân công" };
  }

  const res = await completeTrialSession({
    trialSessionId,
    actorId: ctx.session.user.id,
  });
  if (!res?.ok) return { ok: false, error: res?.error ?? "Hoàn tất buổi thất bại" };

  lamMoi(ses.trialClassId);
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// 11) Cập nhật buổi hẹn học thử (mặt phẳng V1)
// ═══════════════════════════════════════════════════════════════════════════

/** Trạng thái buổi hẹn → trạng thái lead. Chỉ "tiến", không "lùi". */
const HEN_SANG_LEAD: Partial<Record<TrialClassStatus, LeadStatus>> = {
  ATTENDED: "TRIAL_ATTENDED",
  REJECTED: "LOST",
};

export async function updateBookingLopTrialAction(
  trialId: string,
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireActor();
  if (!ctx) return { ok: false, error: CHUA_DANG_NHAP };
  if (!(await checkPermission("trials:manage"))) {
    return { ok: false, error: "Không có quyền xếp lịch học thử" };
  }

  const parsed = updateBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const booking = await loadScopedBooking(ctx.actor, trialId);
  if (!booking) return { ok: false, error: "Buổi học thử không tồn tại" };

  const sdb = scopedDb(ctx.actor);

  if (parsed.data.teacherId && parsed.data.teacherId !== booking.teacherId) {
    const t = await sdb.user.findUnique({
      where: { id: parsed.data.teacherId },
      select: { centerId: true },
    });
    const err = teacherCenterAssignmentError(booking.centerId, [
      { id: parsed.data.teacherId, centerId: t?.centerId },
    ]);
    if (err) return { ok: false, error: err };
  }

  // Khác màn cũ ĐÚNG một chỗ: giờ được quy đổi từ chuỗi ĐỒNG HỒ VN ở server, thay vì
  // nhận ISO do client dựng bằng `new Date(...)` của máy người dùng. Máy đặt múi giờ
  // khác +07 trước đây hiện sai giờ rồi lưu đè sai luôn.
  const newAt = parseVnInput(parsed.data.scheduledAtVn);
  if (!newAt) return { ok: false, error: "Thời gian không hợp lệ" };

  const { actorId, actorName } = getAuditActor(ctx.session);
  const becameAttended =
    parsed.data.status === "ATTENDED" && booking.status !== "ATTENDED";
  const leadNextStatus = HEN_SANG_LEAD[parsed.data.status];
  const scheduleChanged = booking.scheduledAt?.getTime() !== newAt.getTime();

  await sdb.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Prisma.TransactionClient;
    await tx.trialClass.update({
      where: { id: trialId },
      data: {
        scheduledAt: newAt,
        status: parsed.data.status,
        teacherId: parsed.data.teacherId,
        roomId: parsed.data.roomId,
        classId: parsed.data.classId,
        notes: parsed.data.notes,
        ...(becameAttended && { attendedAt: new Date() }),
      },
    });

    // dedupeKey kèm GIỜ MỚI: đổi lịch thật thì phát tin mới, bấm lại cùng giờ thì không.
    if (scheduleChanged) {
      await publishEvent(
        "trial.schedule_changed",
        {
          trialId,
          leadId: booking.leadId,
          fromAt: booking.scheduledAt?.toISOString() ?? null,
          toAt: newAt.toISOString(),
        },
        { tx, dedupeKey: `trial.schedule_changed:${trialId}:${newAt.getTime()}` },
      );
    }

    if (leadNextStatus && parsed.data.status !== booking.status) {
      const lead = await tx.lead.findUnique({
        where: { id: booking.leadId },
        select: { status: true },
      });
      // Không đè lead đã ghi danh — buổi hẹn không được kéo lùi kết quả đã chốt.
      const guarded =
        lead && lead.status !== "ENROLLED" && lead.status !== leadNextStatus;
      if (guarded) {
        await tx.lead.update({
          where: { id: booking.leadId },
          data: { status: leadNextStatus },
        });
        await tx.leadActivity.create({
          data: {
            leadId: booking.leadId,
            actorId,
            actorName,
            type: "STATUS_CHANGE",
            content: `Chuyển trạng thái: ${lead.status} → ${leadNextStatus} (từ buổi học thử)`,
            metadata: { from: lead.status, to: leadNextStatus, via: "trial" },
          },
        });
      }
    }
  });

  // Ngoài transaction: gửi thông báo không được phép làm rollback việc ghi sổ.
  if (
    parsed.data.teacherId &&
    parsed.data.teacherId !== booking.teacherId &&
    parsed.data.teacherId !== ctx.session.user.id
  ) {
    await notifyTrialTeacherAssigned({
      teacherId: parsed.data.teacherId,
      title: "Bạn được phân công buổi học thử",
      body: `Bạn phụ trách buổi học thử lúc ${newAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}.`,
      dedupeKey: `trial-v1.assigned:${trialId}`,
      href: "/lop-trial/lich-hen",
      entityId: trialId,
    });
  }

  lamMoiHen(booking.leadId);
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// 12) Xoá buổi hẹn học thử
// ═══════════════════════════════════════════════════════════════════════════

export async function deleteBookingLopTrialAction(
  trialId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireActor();
  if (!ctx) return { ok: false, error: CHUA_DANG_NHAP };
  if (!(await checkPermission("trials:manage"))) {
    return { ok: false, error: "Không có quyền xoá buổi học thử" };
  }

  const booking = await loadScopedBooking(ctx.actor, trialId);
  if (!booking) return { ok: false, error: "Buổi học thử không tồn tại" };

  // Buổi đã phát sinh kết quả thật thì không xoá cứng — giữ vết để báo cáo còn đúng.
  if (
    booking.status === "ATTENDED" ||
    booking.status === "ENROLLED" ||
    booking.hasFeedback
  ) {
    return {
      ok: false,
      error:
        "Buổi học thử đã phát sinh kết quả (đã học/đã chốt/có nhận xét) — không thể xoá. Hãy đổi trạng thái thay vì xoá.",
    };
  }

  const { actorId, actorName } = getAuditActor(ctx.session);
  const sdb = scopedDb(ctx.actor);

  await sdb.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Prisma.TransactionClient;
    await tx.trialClass.delete({ where: { id: trialId } });
    await writeAudit({
      actor: { id: actorId, name: actorName },
      module: "trials",
      entityType: "TrialClass",
      entityId: trialId,
      action: "DELETE",
      oldValues: {
        leadId: booking.leadId,
        status: booking.status,
        scheduledAt: booking.scheduledAt?.toISOString() ?? null,
      },
      orgUnitId: booking.centerId,
      tx,
    });
  });

  lamMoiHen(booking.leadId);
  return { ok: true };
}
