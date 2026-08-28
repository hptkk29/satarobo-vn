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
import { checkPermission } from "@/lib/auth/check-permission";
import { scopedDb } from "@/lib/db-scope";
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
import { getSetting } from "@/lib/settings/service";
import {
  actorCanUseCenter,
  loadScopedTrialClass,
  loadScopedTrialSession,
  requireActor,
} from "./_lib/guards";
import {
  addSessionSchema,
  updateSessionSchema,
  cancelSessionSchema,
  attendanceSchema,
  configSchema,
  createClassSchema,
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
 * Làm mới màn "Lớp Trial".
 *
 * Giai đoạn chạy song song hai màn đã kết thúc ở GĐ6a: `/trial-classes` và `/trials`
 * nay chỉ là `redirect()`, làm mới chúng là làm mới một trang không có gì để làm mới.
 * Ba dòng đó đã gỡ đúng như chú thích cũ hứa.
 */
function lamMoi(trialClassId?: string): void {
  revalidatePath("/lop-trial");
  if (trialClassId) revalidatePath(`/lop-trial/${trialClassId}`);
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
    courseId: data.courseId ?? null,
    configId: null,
    // QĐ-R2-1 — lớp là slot tái sử dụng, KHÔNG gắn ngày khai giảng. Buổi tạo ad-hoc.
    startDate: null,
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
// 3b) Sửa / huỷ một buổi — kèm LÝ DO, và lý do đó đi thẳng sang giáo viên
// ═══════════════════════════════════════════════════════════════════════════

/** Nhãn ngày VN cho nội dung thông báo (cột `@db.Date` = UTC-midnight ngày VN). */
function nhanNgayVn(d: Date): string {
  return d.toLocaleDateString("vi-VN", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Sửa buổi: ngày · giờ · phòng · giáo viên.
 *
 * Chủ dự án 28/08: "nếu sửa lịch học của buổi thì cần xác nhận và ghi chú là dời lịch
 * … lấy chính ghi chú này đẩy qua thông báo cho giáo viên".
 *
 * Ai được báo: giáo viên MỚI (buổi của bạn đổi / bạn nhận buổi này) VÀ giáo viên CŨ nếu
 * bị thay người. Bỏ sót người cũ là họ vẫn giữ buổi đó trong đầu và có thể tới lớp.
 */
export async function updateLopTrialSessionAction(
  input: unknown,
): Promise<ActionResult> {
  const ctx = await requireActor();
  if (!ctx) return { ok: false, error: CHUA_DANG_NHAP };
  if (!(await checkPermission("trials:manage"))) {
    return { ok: false, error: "Không có quyền sửa buổi trải nghiệm" };
  }

  const parsed = updateSessionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const ses = await loadScopedTrialSession(ctx.actor, data.sessionId);
  if (!ses) return { ok: false, error: "Không tìm thấy buổi học" };
  if (ses.status === "CANCELLED") {
    return { ok: false, error: "Buổi đã huỷ — không sửa được nữa" };
  }

  const date = ngayVnSangUtc(data.date);
  if (!date) return { ok: false, error: "Ngày buổi học không hợp lệ" };

  const gvMoi = data.teacherId === undefined ? ses.teacherId : data.teacherId;
  const doiLich =
    date.getTime() !== ses.date.getTime() ||
    data.startTime !== ses.startTime ||
    data.endTime !== ses.endTime;

  const sdb = scopedDb(ctx.actor);
  // ⚠️ update KHÔNG được scopedDb che — an toàn nhờ `loadScopedTrialSession` ở trên.
  await sdb.trialClassSession.update({
    where: { id: data.sessionId },
    data: {
      date,
      startTime: data.startTime,
      endTime: data.endTime,
      roomId: data.roomId === undefined ? ses.roomId : data.roomId,
      teacherId: gvMoi,
    },
  });

  const moTa = `Buổi ${ses.seq} · ${nhanNgayVn(date)} ${data.startTime}–${data.endTime}`;
  // Người CŨ bị thay: báo là buổi không còn của họ nữa.
  if (ses.teacherId && ses.teacherId !== gvMoi) {
    await notifyTrialTeacherAssigned({
      teacherId: ses.teacherId,
      title: "Bạn không còn phụ trách một buổi trải nghiệm",
      body: `${moTa} đã chuyển cho người khác. Lý do: ${data.reason}`,
      // Mốc thời gian trong khoá: một buổi có thể đổi nhiều lần, khử trùng theo id
      // buổi thôi thì lần đổi thứ hai bị nuốt.
      dedupeKey: `trial-session.moved-out:${data.sessionId}:${Date.now()}`,
      entityId: data.sessionId,
    });
  }
  if (gvMoi) {
    await notifyTrialTeacherAssigned({
      teacherId: gvMoi,
      title: doiLich ? "Buổi trải nghiệm đã dời lịch" : "Buổi trải nghiệm vừa được sửa",
      body: `${moTa}. Lý do: ${data.reason}`,
      dedupeKey: `trial-session.updated:${data.sessionId}:${Date.now()}`,
      entityId: data.sessionId,
    });
  }

  lamMoi(ses.trialClassId);
  return { ok: true };
}

/**
 * Huỷ một buổi. Buổi CANCELLED biến khỏi lịch giáo viên ngay: mọi truy vấn lịch/roster
 * đều lọc `status: { not: "CANCELLED" }` (`lib/lms/teacher-schedule.ts`).
 *
 * KHÔNG xoá dòng: điểm danh và phiếu đã chấm của buổi đó vẫn phải tra lại được.
 */
export async function cancelLopTrialSessionAction(
  input: unknown,
): Promise<ActionResult> {
  const ctx = await requireActor();
  if (!ctx) return { ok: false, error: CHUA_DANG_NHAP };
  if (!(await checkPermission("trials:manage"))) {
    return { ok: false, error: "Không có quyền huỷ buổi trải nghiệm" };
  }

  const parsed = cancelSessionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const ses = await loadScopedTrialSession(ctx.actor, data.sessionId);
  if (!ses) return { ok: false, error: "Không tìm thấy buổi học" };
  if (ses.status === "CANCELLED") return { ok: true }; // idempotent

  const sdb = scopedDb(ctx.actor);
  await sdb.trialClassSession.update({
    where: { id: data.sessionId },
    data: { status: "CANCELLED" },
  });

  if (ses.teacherId) {
    await notifyTrialTeacherAssigned({
      teacherId: ses.teacherId,
      title: "Buổi trải nghiệm đã bị huỷ",
      body:
        `Buổi ${ses.seq} · ${nhanNgayVn(ses.date)} ${ses.startTime}–${ses.endTime} đã huỷ ` +
        `và đã gỡ khỏi lịch dạy của bạn. Lý do: ${data.reason}`,
      dedupeKey: `trial-session.cancelled:${data.sessionId}`,
      entityId: data.sessionId,
    });
  }

  lamMoi(ses.trialClassId);
  return { ok: true };
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

  // GĐ3 (chốt câu 5) — trần đọc từ cấu hình hệ thống, mặc định 4. Admin đổi được ở
  // /admin/cau-hinh-van-hanh mà không cần deploy. Dữ liệu cũ vượt trần KHÔNG bị đụng:
  // trần chỉ kiểm lúc ghi mới.
  let totalSessions: number | undefined;
  if (input.totalSessions != null) {
    const tran = await getSetting("crm.trialMaxSessions");
    const n = Number(input.totalSessions);
    if (!Number.isInteger(n) || n < 1 || n > tran) {
      return {
        ok: false,
        error: `Số buổi học thử phải là số nguyên từ 1 đến ${tran}`,
      };
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
      // GĐ5 — bốn giá trị cũ gộp còn hai: ENROLLED+REGISTERED → DA_DANG_KY,
      // LOST+DUPLICATE → DA_MAT. Tập lead bị loại khỏi danh sách ứng viên KHÔNG đổi.
      status: { notIn: ["DA_DANG_KY", "DA_MAT"] },
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
  // GĐ4 — điểm danh là việc của SALE, gác bằng quyền riêng `trials:attendance`.
  // Trước GĐ4 gác bằng `trials:feedback` (quyền của giáo viên) nên Sale không làm được
  // đúng việc quy trình giao cho họ.
  if (!(await checkPermission("trials:attendance"))) {
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
  // "Hoàn tất buổi" đóng vòng đời buổi sau khi đã điểm danh xong ⇒ đi cùng cổng với
  // điểm danh, không phải cổng nộp phiếu đánh giá.
  if (!(await checkPermission("trials:attendance"))) {
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
// ĐÃ GỠ 28/08/2026 — ba action không còn đường gọi nào
// ═══════════════════════════════════════════════════════════════════════════
//
//   · rescheduleLopTrialAction        — dời lịch theo TỪNG HỌC VIÊN
//   · proposeLopTrialTeacherAction    — Sale ĐỀ XUẤT giáo viên cho một ca
//   · assignLopTrialCaseTeacherAction — Đào tạo PHÂN CÔNG giáo viên cho một ca
//
// Chủ dự án 28/08 gỡ cả ba khỏi giao diện: học viên vào lớp là học TOÀN BỘ buổi (nên
// không còn "dời một em sang buổi khác"), và giáo viên đặt ở TỪNG BUỔI (nên không còn
// đề xuất/phân công theo ca). Server Action không còn ai gọi mà vẫn export là một
// endpoint sống — ai biết tên hàm vẫn POST được và sửa được dữ liệu qua đường đã bỏ.
//
// Cột `gvDeXuatId` / `gvPhanCongId` và bảng `TrialReschedule` GIỮ NGUYÊN trong DB (nếp
// 2 pha): dữ liệu cũ còn đọc được, và `gvPhanCongId` vẫn là một trong ba đường nối học
// viên ↔ giáo viên ở roster site GV.
