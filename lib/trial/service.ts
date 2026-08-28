// lib/trial/service.ts — R7-02: service layer cho LỚP TRẢI NGHIỆM V2 (N buổi).
//
// Sinh buổi theo lịch TUẦN (mỗi 7 ngày) từ startDate, né Holiday (dời buổi +7).
// Ghi danh 1 con / 1 lớp ACTIVE (partial-unique ở DB) — bắt P2002 thành lỗi VI.
// FL-R2 (QĐ-R2-W3): tiến độ do markAttendance lo per-lead (idempotent): ≥1 buổi PRESENT →
// con IN_PROGRESS + lead "Đang học thử"; đủ buổi (totalSessions per-lead) → con ATTENDED +
// lead "Chờ quyết định" (AWAITING_DECISION) NGAY (TBD-2). TRIAL_ATTENDED để dành lead đã chốt.
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { notifyStaff } from "@/lib/notifications/notify";
import { teacherCenterAssignmentError } from "@/lib/teachers/center-filter";
import { nextSeq, yy } from "@/lib/codegen";
import { publishEvent } from "@/lib/events/publish";
import { writeAudit } from "@/lib/audit/audit-log";
import { LEAD_PIPELINE_EXIT_STATUSES } from "@/lib/leads/status";
import { setLeadStatus } from "@/lib/leads/set-status";
import { danhGiaDoiLich, saleDuocDeXuat } from "@/lib/trial/reschedule-rules";
import { getSetting } from "@/lib/settings/service";

// ─── PURE helpers (deterministic — KHÔNG new Date() ở top) ─────────────────────

/** "YYYY-MM-DD" theo local (so khớp Holiday). */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Ngày của N buổi trải nghiệm: TUẦN (mỗi 7 ngày) kể từ `startDate`, BỎ QUA ngày
 * rơi vào Holiday — buổi đó DỜI tới tuần kế (+7). Deterministic.
 */
export function buildTrialSessionDates(startDate: Date, count: number, holidays: Date[]): Date[] {
  const out: Date[] = [];
  if (count <= 0) return out;
  const holiSet = new Set(holidays.map(ymd));
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const maxIter = count + holidays.length + 400; // chặn vòng lặp vô hạn
  let i = 0;
  while (out.length < count && i < maxIter) {
    i++;
    if (!holiSet.has(ymd(cur))) {
      out.push(new Date(cur));
    }
    cur.setDate(cur.getDate() + 7);
  }
  return out;
}

/** Quyết định vượt sĩ số (PURE): tại/quá sức chứa + KHÔNG override. */
export function isOverCapacity(activeCount: number, capacity: number, allowOverride: boolean): boolean {
  return !allowOverride && activeCount >= capacity;
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Mốc UTC 00:00 của NGÀY hôm nay theo giờ VN — khớp cột @db.Date của buổi Trial. */
export function vnTodayUtc(now = new Date()): Date {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()));
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

type DbClient = Prisma.TransactionClient | typeof db;

/** Mã cơ sở cho code lớp: Center.code (vd "CS1") → fallback sanitize id. */
function sanitizeCenter(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "CS";
}

/** Mở rộng các khoảng Holiday (date..endDate) thành Date[] (1 phần tử / ngày). */
function expandHolidayDates(rows: { date: Date; endDate: Date | null }[]): Date[] {
  const out: Date[] = [];
  for (const h of rows) {
    const start = new Date(h.date.getFullYear(), h.date.getMonth(), h.date.getDate());
    const end = h.endDate
      ? new Date(h.endDate.getFullYear(), h.endDate.getMonth(), h.endDate.getDate())
      : start;
    const cur = new Date(start);
    let guard = 0;
    while (cur <= end && guard < 400) {
      guard++;
      out.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
  }
  return out;
}

async function actorName(actorId: string | null | undefined, client: DbClient = db): Promise<string> {
  if (!actorId) return "system";
  const u = await client.user.findUnique({ where: { id: actorId }, select: { name: true } });
  return u?.name ?? actorId;
}

// ─── Config ────────────────────────────────────────────────────────────────────

/** Cấu hình lớp trải nghiệm đang ÁP DỤNG (active). */
export async function getActiveTrialConfig(): Promise<{ id: string; sessionCount: number } | null> {
  const cfg = await db.trialProgramConfig.findFirst({
    where: { active: true },
    orderBy: { updatedAt: "desc" },
    select: { id: true, sessionCount: true },
  });
  return cfg;
}

/** Tạo/cập nhật + kích hoạt cấu hình (deactivate các config khác) + audit. */
export async function setTrialProgramConfig(params: {
  name: string;
  sessionCount: number;
  actorId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const name = params.name?.trim();
  if (!name) return { ok: false, error: "Tên cấu hình là bắt buộc" };
  if (!Number.isInteger(params.sessionCount) || params.sessionCount < 1) {
    return { ok: false, error: "Số buổi phải là số nguyên ≥ 1" };
  }

  try {
    const aName = await actorName(params.actorId);
    await db.$transaction(async (tx) => {
      const existing = await tx.trialProgramConfig.findFirst({ where: { name } });
      // tắt mọi config khác (chỉ 1 active tại 1 thời điểm)
      await tx.trialProgramConfig.updateMany({
        where: existing ? { id: { not: existing.id } } : {},
        data: { active: false },
      });
      const saved = existing
        ? await tx.trialProgramConfig.update({
            where: { id: existing.id },
            data: { sessionCount: params.sessionCount, active: true, updatedById: params.actorId },
          })
        : await tx.trialProgramConfig.create({
            data: { name, sessionCount: params.sessionCount, active: true, updatedById: params.actorId },
          });
      await writeAudit({
        actor: { id: params.actorId, name: aName },
        module: "trial",
        entityType: "TrialProgramConfig",
        entityId: saved.id,
        action: existing ? "UPDATE" : "CREATE",
        oldValues: existing ? { sessionCount: existing.sessionCount, active: existing.active } : null,
        newValues: { name, sessionCount: params.sessionCount, active: true },
        tx,
      });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi lưu cấu hình" };
  }
}

// ─── Lớp ─────────────────────────────────────────────────────────────────────

export async function createTrialClass(params: {
  name: string;
  centerId: string;
  roomId?: string | null;
  // FL-R2 (QĐ-R2-1): slot tái sử dụng — startDate tuỳ chọn (null = không gắn ngày cố định).
  startDate?: Date | null;
  startTime: string;
  endTime: string;
  capacity: number;
  teacherId?: string | null;
  // Số buổi nhập trực tiếp khi tạo (không phụ thuộc TrialProgramConfig ngoài).
  sessionCount: number;
  configId?: string | null;
  actorId: string;
}): Promise<{ ok: boolean; error?: string; trialClassId?: string }> {
  if (!params.name?.trim()) return { ok: false, error: "Tên lớp là bắt buộc" };
  if (!Number.isInteger(params.capacity) || params.capacity < 1) {
    return { ok: false, error: "Sĩ số phải là số nguyên ≥ 1" };
  }
  if (!Number.isInteger(params.sessionCount) || params.sessionCount < 1) {
    return { ok: false, error: "Số buổi phải là số nguyên ≥ 1" };
  }

  // R2-RBAC-3 — GV (nếu gán) phải CÙNG cơ sở lớp trải nghiệm (cách ly CS1↔CS2;
  // backstop server cho lọc client ở form). teacher centerId NULL/khác → chặn.
  if (params.teacherId) {
    const t = await db.user.findUnique({
      where: { id: params.teacherId },
      select: { centerId: true },
    });
    const err = teacherCenterAssignmentError(params.centerId, [
      { id: params.teacherId, centerId: t?.centerId },
    ]);
    if (err) return { ok: false, error: err };
  }

  try {
    const sessionCount = params.sessionCount;
    const trialClassId = await db.$transaction(async (tx) => {
      // mã cơ sở cho code.
      const center = await tx.center.findUnique({
        where: { id: params.centerId },
        select: { code: true },
      });
      const cc = sanitizeCenter(center?.code ?? params.centerId);
      const y = yy();
      const seq = await nextSeq(`TRIAL:${cc}:${y}`, tx);
      const code = `TRIAL-${cc}-${y}-${String(seq).padStart(3, "0")}`;

      const trialClass = await tx.trialClassV2.create({
        data: {
          code,
          name: params.name.trim(),
          centerId: params.centerId,
          roomId: params.roomId ?? null,
          startDate: params.startDate ?? null,
          startTime: params.startTime,
          endTime: params.endTime,
          capacity: params.capacity,
          teacherId: params.teacherId ?? null,
          configId: params.configId ?? null,
          sessionCount,
        },
        select: { id: true },
      });

      // FL-R2 (QĐ-R2-1): slot tái sử dụng — KHÔNG auto-gen buổi cohort. Chỉ sinh buổi theo
      // lịch khi CÓ ngày bắt đầu cố định (giữ tương thích đường gọi cũ/lớp có lịch).
      if (params.startDate) {
        const holidayRows = await tx.holiday.findMany({
          where: { OR: [{ centerId: params.centerId }, { centerId: null }] },
          select: { date: true, endDate: true },
        });
        const holidays = expandHolidayDates(holidayRows);
        const dates = buildTrialSessionDates(params.startDate, sessionCount, holidays);
        if (dates.length > 0) {
          await tx.trialClassSession.createMany({
            data: dates.map((d, idx) => ({
              trialClassId: trialClass.id,
              seq: idx + 1,
              date: d,
              startTime: params.startTime,
              endTime: params.endTime,
              roomId: params.roomId ?? null,
              teacherId: params.teacherId ?? null,
            })),
          });
        }
      }
      return trialClass.id;
    });
    return { ok: true, trialClassId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi tạo lớp trải nghiệm" };
  }
}

// ─── Buổi ad-hoc (QĐ-R2-1: slot tái sử dụng — lớp không gắn ngày, buổi thêm tay) ──

/**
 * #6 — báo GV qua chuông StaffNotification khi được gán buổi/lớp trải nghiệm
 * (mẫu notifyTeacherAttendanceEdited). Non-fatal: lỗi notify không phá nghiệp vụ.
 */
export async function notifyTrialTeacherAssigned(params: {
  teacherId: string;
  title: string;
  body: string;
  dedupeKey: string;
  href?: string;
  /** Id buổi/lớp trải nghiệm mà thông báo nói tới — để sau này thu hồi khi nó bị xoá. */
  entityId?: string;
}): Promise<void> {
  // `href` phải viết theo đường ADMIN clean-URL: chuông admin push thẳng, chuông site GV
  // đổi qua `teacherHref()`. Mặc định cũ "/teacher/trial" sai cả hai đầu — trên host admin
  // bị route-policy 308 sang public rồi 404, còn `teacherHref` không nhận diện được nên
  // trả null (thông báo thành text chết). "/lop-trial" là màn admin có thật và
  // teacherHref map đúng sang "/trial" của site GV.
  //
  // ⚠️ GĐ6 — thông báo CŨ trong DB vẫn mang href "/trials". Đó là lý do route cũ được
  // giữ dưới dạng chuyển hướng thay vì xoá, và `teacherHref` vẫn nhận diện case cũ.
  const href = params.href ?? "/lop-trial";
  try {
    await notifyStaff({
      userIds: [params.teacherId],
      dedupeKey: params.dedupeKey,
      category: "CLASS",
      title: params.title,
      body: params.body,
      href,
      entityId: params.entityId ?? null,
      // `reopen` — gán lại/đổi nội dung là một lần phân công MỚI cho chính GV đó; đọc bản
      // cũ rồi không có nghĩa là đã biết ca mới.
      reopen: true,
    });
  } catch {
    // nuốt lỗi notify — không chặn luồng chính.
  }
}

/**
 * #1 (BLOCKER go-live) — thêm 1 buổi ad-hoc cho lớp trải nghiệm slot-tái-sử-dụng
 * (startDate null → createTrialClass KHÔNG sinh buổi; trước đây KHÔNG có đường nào
 * tạo TrialClassSession ⇒ roster/lịch GV trống trơn). Buổi nhận GV/phòng của lớp
 * làm mặc định; GV (nếu có) phải CÙNG cơ sở lớp (R2-RBAC-3).
 */
export async function addTrialSession(params: {
  trialClassId: string;
  date: Date; // UTC 00:00 của ngày VN (@db.Date)
  startTime: string;
  endTime: string;
  /** undefined → mặc định GV của lớp; null → buổi chưa gán GV. */
  teacherId?: string | null;
  /** undefined → mặc định phòng của lớp; null → không phòng. */
  roomId?: string | null;
  actorId: string;
}): Promise<{ ok: boolean; error?: string; sessionId?: string }> {
  try {
    const cls = await db.trialClassV2.findUnique({
      where: { id: params.trialClassId },
      select: { id: true, name: true, centerId: true, teacherId: true, roomId: true, status: true },
    });
    if (!cls) return { ok: false, error: "Lớp trải nghiệm không tồn tại" };
    if (cls.status === "CANCELLED" || cls.status === "COMPLETED") {
      return { ok: false, error: "Lớp đã kết thúc/đã huỷ — không thể thêm buổi" };
    }

    const teacherId = params.teacherId === undefined ? cls.teacherId : params.teacherId;
    // R2-RBAC-3 — GV của buổi phải CÙNG cơ sở lớp (chặn gán chéo CS1↔CS2).
    if (teacherId) {
      const t = await db.user.findUnique({
        where: { id: teacherId },
        select: { centerId: true },
      });
      const err = teacherCenterAssignmentError(cls.centerId, [
        { id: teacherId, centerId: t?.centerId },
      ]);
      if (err) return { ok: false, error: err };
    }
    const roomId = params.roomId === undefined ? cls.roomId : params.roomId;

    const sessionId = await db.$transaction(async (tx) => {
      const agg = await tx.trialClassSession.aggregate({
        where: { trialClassId: params.trialClassId },
        _max: { seq: true },
      });
      const created = await tx.trialClassSession.create({
        data: {
          trialClassId: params.trialClassId,
          seq: (agg._max.seq ?? 0) + 1,
          date: params.date,
          startTime: params.startTime,
          endTime: params.endTime,
          roomId,
          teacherId,
        },
        select: { id: true },
      });
      return created.id;
    });

    // #6 — báo GV được gán buổi (không tự báo mình).
    if (teacherId && teacherId !== params.actorId) {
      const dateStr = params.date.toLocaleDateString("vi-VN", { timeZone: "UTC" });
      await notifyTrialTeacherAssigned({
        teacherId,
        title: "Bạn được phân công buổi trải nghiệm",
        body: `Buổi ${dateStr} ${params.startTime}–${params.endTime} · lớp ${cls.name}.`,
        dedupeKey: `trial-session.assigned:${sessionId}`,
        entityId: sessionId,
      });
    }
    return { ok: true, sessionId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi thêm buổi trải nghiệm" };
  }
}

// ─── Ghi danh ─────────────────────────────────────────────────────────────────

export async function enrollLeadChild(params: {
  trialClassId: string;
  leadChildId: string;
  addedById: string;
  allowOverride?: boolean;
  // FL-R2 (QĐ-R2-W3): ngưỡng "đủ buổi" cấu hình RIÊNG từng lead (không lấy sessionCount lớp).
  // Bỏ trống → fallback sessionCount của lớp.
  totalSessions?: number;
  // #2 — buổi (TrialClassSession) cụ thể. Bỏ trống → AUTO-GÁN buổi SCHEDULED gần nhất
  // (roster GV ghép HV CHỈ qua scheduledSessionId — enroll không buổi = HV tàng hình).
  sessionId?: string | null;
}): Promise<{ ok: boolean; error?: string; overCapacity?: boolean }> {
  const allowOverride = params.allowOverride ?? false;
  try {
    return await db.$transaction(async (tx) => {
      const cls = await tx.trialClassV2.findUnique({
        where: { id: params.trialClassId },
        select: { id: true, capacity: true, centerId: true, sessionCount: true },
      });
      if (!cls) return { ok: false, error: "Lớp trải nghiệm không tồn tại" };

      const activeCount = await tx.trialEnrollment.count({
        where: { trialClassId: params.trialClassId, status: "ACTIVE" },
      });
      if (isOverCapacity(activeCount, cls.capacity, allowOverride)) {
        return { ok: false, overCapacity: true, error: "Vượt sĩ số" };
      }

      // Buổi của ghi danh. `null` = học TOÀN BỘ buổi của lớp — đây là MẶC ĐỊNH từ
      // 28/08 (chủ dự án: "add vào là add toàn bộ buổi của lớp trải nghiệm đó").
      //
      // ⚠️ ĐẢO nếp #2. Bản cũ AUTO-GÁN buổi gần nhất khi không truyền `sessionId`, với
      // lý do ghi rõ: "GV chỉ thấy HV qua scheduledSessionId — enroll không buổi = HV
      // tàng hình". Lý do đó nay KHÔNG còn đúng: roster giáo viên đã xếp ghi danh
      // `scheduledSessionId = null` vào MỌI buổi của lớp (xem `lib/lms/teacher-schedule.ts`),
      // và bảng điểm danh vốn đã hiểu null là "hiện ở mọi buổi". Gỡ auto-gán mà KHÔNG
      // sửa roster trước là dựng lại đúng lỗi tàng hình đó — hai thay đổi đi cùng một
      // commit là có chủ đích.
      //
      // Xếp riêng một buổi vẫn làm được: truyền `sessionId` (màn chi tiết lớp, dời lịch).
      const scheduledSessionId: string | null = params.sessionId ?? null;
      if (scheduledSessionId) {
        // Buổi truyền vào phải thuộc đúng lớp đang xếp (chống chọn buổi lớp khác).
        const ses = await tx.trialClassSession.findUnique({
          where: { id: scheduledSessionId },
          select: { trialClassId: true },
        });
        if (!ses || ses.trialClassId !== params.trialClassId) {
          return { ok: false, error: "Buổi học không thuộc lớp đã chọn" };
        }
      }

      const enrollment = await tx.trialEnrollment.create({
        data: {
          trialClassId: params.trialClassId,
          leadChildId: params.leadChildId,
          addedById: params.addedById,
          scheduledSessionId,
        },
      });
      await tx.leadChild.update({
        where: { id: params.leadChildId },
        data: { trialStatus: "SCHEDULED" },
      });
      // FL-R2 (item 6) — mở/ghi lịch sử học thử per-lead (giữ kể cả khi rời pipeline).
      // totalSessions chốt tại lúc gán; nếu đã có history (lead quay lại) → giữ count cũ.
      //
      // ⚠️ TRẦN ÁP Ở ĐÂY, không chỉ ở tầng action.
      // Chủ dự án chốt trần 4 buổi (đổi được qua cấu hình `crm.trialMaxSessions`).
      // Tầng action chỉ kiểm khi người dùng GÕ SỐ vào ô; bỏ trống ô — thao tác THƯỜNG
      // NHẤT — thì rơi xuống `cls.sessionCount`, mà số buổi của lớp cho phép tới 20.
      // Không kẹp ở đây thì chốt câu 5 không có hiệu lực trên luồng chính.
      const tranBuoi = await getSetting("crm.trialMaxSessions");
      const soBuoiMongMuon =
        params.totalSessions && params.totalSessions > 0
          ? params.totalSessions
          : cls.sessionCount;
      const totalSessions = Math.min(soBuoiMongMuon, tranBuoi);
      await tx.leadTrialHistory.upsert({
        where: {
          leadChildId_trialClassId: {
            leadChildId: params.leadChildId,
            trialClassId: params.trialClassId,
          },
        },
        create: {
          leadChildId: params.leadChildId,
          trialClassId: params.trialClassId,
          centerId: cls.centerId,
          attendedCount: 0,
          totalSessions,
          outcome: "PENDING",
        },
        update: { totalSessions, outcome: "PENDING" },
      });
      // R7-17 — báo Sale phụ trách lead đã xếp lớp trải nghiệm (atomic cùng tx).
      await publishEvent(
        "trial.assigned",
        {
          trialEnrollmentId: enrollment.id,
          leadChildId: params.leadChildId,
          trialClassId: params.trialClassId,
        },
        { tx, dedupeKey: `trial.assigned:${enrollment.id}` },
      );
      // AC4 — ghi audit khi override sĩ số (xếp vượt capacity bằng quyền override).
      if (allowOverride && activeCount >= cls.capacity) {
        await writeAudit({
          actor: { id: params.addedById, name: await actorName(params.addedById, tx) },
          module: "trial",
          entityType: "TrialEnrollment",
          entityId: enrollment.id,
          action: "CREATE",
          newValues: { override: true, capacity: cls.capacity, activeCount, trialClassId: params.trialClassId, leadChildId: params.leadChildId },
          tx,
        });
      }
      return { ok: true };
    });
  } catch (e) {
    // Partial-unique: con đang ACTIVE ở lớp khác (AC3).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "Học viên đang ở lớp trải nghiệm khác" };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi ghi danh" };
  }
}

/**
 * Huỷ lớp trải nghiệm: status=CANCELLED + mọi TrialEnrollment ACTIVE → WITHDRAWN
 * (giải phóng partial-unique 1 lớp ACTIVE/con). Audit. (§6 edge case.)
 */
export async function cancelTrialClass(params: {
  trialClassId: string;
  actorId: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    return await db.$transaction(async (tx) => {
      const cls = await tx.trialClassV2.findUnique({
        where: { id: params.trialClassId },
        select: { id: true, status: true },
      });
      if (!cls) return { ok: false, error: "Lớp trải nghiệm không tồn tại" };
      if (cls.status === "CANCELLED") return { ok: true };
      await tx.trialClassV2.update({
        where: { id: params.trialClassId },
        data: { status: "CANCELLED" },
      });
      const freed = await tx.trialEnrollment.updateMany({
        where: { trialClassId: params.trialClassId, status: "ACTIVE" },
        data: { status: "WITHDRAWN" },
      });
      await writeAudit({
        actor: { id: params.actorId, name: await actorName(params.actorId, tx) },
        module: "trial",
        entityType: "TrialClassV2",
        entityId: params.trialClassId,
        action: "STATUS_CHANGE",
        oldValues: { status: cls.status },
        newValues: { status: "CANCELLED", withdrawnEnrollments: freed.count },
        tx,
      });
      return { ok: true };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi huỷ lớp" };
  }
}

// ─── Điểm danh ──────────────────────────────────────────────────────────────────

/**
 * FL-R2 (QĐ-R2-W3 item 6,7) — đồng bộ tiến độ học thử của 1 ghi danh sau mỗi lần điểm danh.
 * IDEMPOTENT: tính lại từ số buổi PRESENT thực tế (gọi lại bao nhiêu lần cũng cho cùng kết quả).
 *  - Cập nhật LeadTrialHistory: attendedCount (chỉ đếm PRESENT) + first/lastAttendedAt.
 *  - Auto-Kanban per-con: ≥1 buổi → IN_PROGRESS; đủ buổi (totalSessions per-lead) → ATTENDED.
 *  - Auto-Kanban per-lead: có con đang học → "Đang học thử"; MỌI con đủ buổi & chưa chốt
 *    → "Chờ quyết định" (AWAITING_DECISION) NGAY (TBD-2). KHÔNG đụng lead đã chốt/rời pipeline.
 */
async function syncTrialProgress(
  tx: Prisma.TransactionClient,
  trialEnrollmentId: string,
  // Ai gây ra lượt đổi trạng thái này. Cần cho CẢ HAI sổ: sổ đếm phân biệt người làm
  // với máy chạy (GĐ1), còn vết người đọc mà thiếu nó thì ghi ra "Hệ thống" và mất
  // người chịu trách nhiệm (C-07). BẮT BUỘC — bỏ mặc định để không chỗ nào quên.
  actorId: string | null,
): Promise<void> {
  const enr = await tx.trialEnrollment.findUnique({
    where: { id: trialEnrollmentId },
    select: {
      id: true,
      status: true,
      trialClassId: true,
      leadChildId: true,
      trialClass: { select: { centerId: true, sessionCount: true } },
      leadChild: { select: { id: true, leadId: true, trialStatus: true } },
    },
  });
  if (!enr) return;

  // buổi PRESENT của ghi danh này (kèm ngày buổi để tính first/last).
  const presents = await tx.trialAttendance.findMany({
    where: { trialEnrollmentId, status: "PRESENT" },
    select: { trialSession: { select: { date: true } } },
  });
  const attendedCount = presents.length;
  const dates = presents
    .map((p) => p.trialSession.date)
    .sort((a, b) => a.getTime() - b.getTime());
  const firstAttendedAt = dates[0] ?? null;
  const lastAttendedAt = dates[dates.length - 1] ?? null;

  // totalSessions per-lead: giữ giá trị đã chốt khi gán; fallback sessionCount lớp.
  const existing = await tx.leadTrialHistory.findUnique({
    where: {
      leadChildId_trialClassId: { leadChildId: enr.leadChildId, trialClassId: enr.trialClassId },
    },
    select: { totalSessions: true },
  });
  const totalSessions = existing?.totalSessions ?? enr.trialClass.sessionCount;

  await tx.leadTrialHistory.upsert({
    where: {
      leadChildId_trialClassId: { leadChildId: enr.leadChildId, trialClassId: enr.trialClassId },
    },
    create: {
      leadChildId: enr.leadChildId,
      trialClassId: enr.trialClassId,
      centerId: enr.trialClass.centerId,
      attendedCount,
      totalSessions,
      firstAttendedAt,
      lastAttendedAt,
      outcome: "PENDING",
    },
    update: { attendedCount, firstAttendedAt, lastAttendedAt },
  });

  // ── Kanban per-con ──
  const reachedThreshold = totalSessions > 0 && attendedCount >= totalSessions;
  let childStatus = enr.leadChild.trialStatus;
  if (reachedThreshold) childStatus = "ATTENDED";
  else if (attendedCount >= 1 && childStatus !== "ATTENDED") childStatus = "IN_PROGRESS";
  if (childStatus !== enr.leadChild.trialStatus) {
    await tx.leadChild.update({ where: { id: enr.leadChildId }, data: { trialStatus: childStatus } });
  }
  // đủ buổi → đóng ghi danh (giải phóng partial-unique 1 lớp ACTIVE/con).
  if (reachedThreshold && enr.status === "ACTIVE") {
    await tx.trialEnrollment.update({ where: { id: enr.id }, data: { status: "COMPLETED" } });
  }

  // ── Kanban per-lead ──
  const leadId = enr.leadChild.leadId;
  const lead = await tx.lead.findUnique({ where: { id: leadId }, select: { status: true } });
  if (!lead) return;
  // KHÔNG động vào lead đã chốt / rời pipeline (sale tự quản từ đây).
  // GĐ0 — đây là chỗ DUY NHẤT dùng tập "rời phễu" (có thêm DA_DANG_KY so với tập
  // "đã đóng" của round-robin/bàn giao). Trước GĐ0 hai tập nằm ở 5 file rời và không
  // ai biết vì sao chúng lệch nhau; nay khác biệt được đặt tên và có test khoá.
  if (LEAD_PIPELINE_EXIT_STATUSES.includes(lead.status)) return;

  // mọi con (đang/đã học thử) của lead này đã đủ buổi?
  const siblings = await tx.trialEnrollment.findMany({
    where: { status: { in: ["ACTIVE", "COMPLETED"] }, leadChild: { leadId } },
    select: { leadChild: { select: { trialStatus: true } } },
  });
  const allAttended =
    siblings.length > 0 && siblings.every((s) => s.leadChild.trialStatus === "ATTENDED");

  // HAI SỔ — trước đây hai đường này đổi trạng thái lead mà KHÔNG để lại vết nào
  // (không `AuditLog`, không `LeadActivity`, không sổ đếm), dù đây là đường có lưu
  // lượng cao nhất: mỗi lượt điểm danh đều chạy qua. Mốc "lead vào Đang học thử /
  // Chờ quyết định" — đúng khúc giữa phễu — không truy được ai làm, lúc nào.
  // Nay đi chung cửa `setLeadStatus`, và cửa đó ghi CẢ sổ đếm lẫn vết người đọc.
  // Hàm tự bỏ qua khi trạng thái không đổi nên gọi lại nhiều lần không đẻ dòng rác.
  if (allAttended) {
    const res = await setLeadStatus({
      tx,
      leadId,
      to: "CHO_QUYET_DINH",
      source: "trial",
      actorId,
      actorName: await actorName(actorId, tx),
    });
    if (res.changed) {
      await publishEvent(
        "lead.awaitingDecision",
        { leadId },
        { tx, dedupeKey: `lead.awaitingDecision:${leadId}` },
      );
    }
  } else if (attendedCount >= 1 && lead.status === "DA_HEN_HOC_THU") {
    const res = await setLeadStatus({
      tx,
      leadId,
      to: "DANG_HOC_THU",
      source: "trial",
      actorId,
      actorName: await actorName(actorId, tx),
    });
    if (res.changed) {
      await publishEvent(
        "lead.trialInProgress",
        { leadId },
        { tx, dedupeKey: `lead.trialInProgress:${leadId}` },
      );
    }
  }
}

export async function markAttendance(params: {
  trialSessionId: string;
  trialEnrollmentId: string;
  status: "PRESENT" | "ABSENT";
  note?: string | null;
  actorId: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    // ⚠️ CHỐNG IDOR — kiểm CA và BUỔI thuộc CÙNG MỘT LỚP trước khi ghi.
    //
    // Action gọi vào đây chỉ scope được `trialSessionId` (qua `loadScopedTrialSession`),
    // còn `trialEnrollmentId` đi thẳng từ client. Không kiểm thì POST tay ghi được điểm
    // danh cho ca của lớp/cơ sở KHÁC — và tệ hơn, `syncTrialProgress` bên dưới sẽ đổi
    // luôn trạng thái lead bên đó. Lỗ này có từ màn cũ, không phải hồi quy của đợt này.
    const [ses, enr] = await Promise.all([
      db.trialClassSession.findUnique({
        where: { id: params.trialSessionId },
        select: { trialClassId: true },
      }),
      db.trialEnrollment.findUnique({
        where: { id: params.trialEnrollmentId },
        select: { trialClassId: true },
      }),
    ]);
    if (!ses || !enr) return { ok: false, error: "Không tìm thấy buổi hoặc ca trải nghiệm" };
    if (ses.trialClassId !== enr.trialClassId) {
      // Gộp một thông điệp cho cả hai ca (không tồn tại / khác lớp) — nói rõ hơn là
      // biến thông báo lỗi thành kênh dò id.
      return { ok: false, error: "Học viên không thuộc lớp của buổi này" };
    }

    await db.$transaction(async (tx) => {
      await tx.trialAttendance.upsert({
        where: {
          trialSessionId_trialEnrollmentId: {
            trialSessionId: params.trialSessionId,
            trialEnrollmentId: params.trialEnrollmentId,
          },
        },
        create: {
          trialSessionId: params.trialSessionId,
          trialEnrollmentId: params.trialEnrollmentId,
          status: params.status,
          note: params.note ?? null,
          // GĐ4 — ghi AI điểm danh. Từ GĐ4 việc này chuyển từ giáo viên sang Sale, nên
          // không lưu người thao tác là mất luôn khả năng quy trách nhiệm khi có tranh cãi.
          markedById: params.actorId,
        },
        update: {
          status: params.status,
          note: params.note ?? null,
          markedById: params.actorId,
        },
      });
      // ghi lịch sử + auto-Kanban (idempotent — tính lại từ số buổi PRESENT).
      await syncTrialProgress(tx, params.trialEnrollmentId, params.actorId);
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi điểm danh" };
  }
}

// ─── Hoàn tất buổi ────────────────────────────────────────────────────────────

export async function completeTrialSession(params: {
  trialSessionId: string;
  actorId: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    return await db.$transaction(async (tx) => {
      const session = await tx.trialClassSession.findUnique({
        where: { id: params.trialSessionId },
        select: { id: true, trialClassId: true },
      });
      if (!session) return { ok: false, error: "Buổi học không tồn tại" };

      await tx.trialClassSession.update({
        where: { id: session.id },
        data: { status: "COMPLETED" },
      });
      // FL-R2 (QĐ-R2-W3): tiến độ lead/Kanban do markAttendance lo per-lead (đủ buổi →
      // AWAITING_DECISION NGAY, không chờ buổi cuối). Hoàn tất buổi chỉ khoá lifecycle buổi.
      return { ok: true };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi hoàn tất buổi học" };
  }
}

// ─── Huỷ gán học viên ────────────────────────────────────────────────────────────

/**
 * FL-R2 (item 4) — gỡ 1 học viên khỏi lớp trải nghiệm: SOFT-withdraw (status=WITHDRAWN),
 * GIỮ LeadTrialHistory (lead quay lại không mất dấu). Nếu CHƯA điểm danh buổi nào →
 * revert trialStatus về NONE + xoá history rỗng (chưa từng học). Audit.
 */
export async function unenrollLeadChild(params: {
  trialClassId: string;
  leadChildId: string;
  actorId: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    return await db.$transaction(async (tx) => {
      const enr = await tx.trialEnrollment.findFirst({
        where: { trialClassId: params.trialClassId, leadChildId: params.leadChildId, status: "ACTIVE" },
        select: {
          id: true,
          leadChildId: true,
          _count: { select: { attendances: true } },
          trialClass: { select: { centerId: true } },
        },
      });
      if (!enr) return { ok: false, error: "Không tìm thấy ghi danh đang hoạt động" };

      await tx.trialEnrollment.update({ where: { id: enr.id }, data: { status: "WITHDRAWN" } });

      const neverAttended = enr._count.attendances === 0;
      if (neverAttended) {
        // chưa học buổi nào → coi như chưa từng học thử lớp này.
        await tx.leadChild.update({ where: { id: enr.leadChildId }, data: { trialStatus: "NONE" } });
        await tx.leadTrialHistory.deleteMany({
          where: { leadChildId: enr.leadChildId, trialClassId: params.trialClassId, attendedCount: 0 },
        });
      }

      await writeAudit({
        actor: { id: params.actorId, name: await actorName(params.actorId, tx) },
        module: "trial",
        entityType: "TrialEnrollment",
        entityId: enr.id,
        action: "STATUS_CHANGE",
        oldValues: { status: "ACTIVE" },
        newValues: { status: "WITHDRAWN", neverAttended, leadChildId: enr.leadChildId, trialClassId: params.trialClassId },
        tx,
      });
      return { ok: true };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi gỡ học viên" };
  }
}

// ─── DỜI LỊCH một ca trải nghiệm ─────────────────────────────────────────────
//
// ⚠️ HAI NHÁNH CÙNG VIẾT HÀM NÀY, đây là bản gộp. GĐ3 (25/08) làm phần "giáo viên mất
// phân công + sổ dời lịch"; site GV 25/08 làm phần "buổi CŨ + báo Sale". Bỏ nửa nào
// cũng hỏng một màn: thiếu `rescheduledFromSessionId` thì bảng Trial của site GV không
// in được "Bị dời lịch"; thiếu `gvPhanCongId: null` thì giáo viên cũ vẫn ôm ca đã dời.

/**
 * Dời một ca trải nghiệm sang buổi khác CÙNG LỚP.
 *
 * Luồng đã chốt với chủ dự án (25/08/2026): phụ huynh vắng hoặc xin dời → Sale bấm
 * "Dời lịch", chọn buổi mới → **giáo viên đang phụ trách ca đó MẤT PHÂN CÔNG**, Sale
 * đề xuất lại nếu muốn (không bắt buộc), và giáo viên được BÁO là lịch đã dời.
 *
 * Vì sao tới 25/08 mới có: `scheduledSessionId` được ghi ĐÚNG MỘT LẦN ở `enrollLeadChild`
 * rồi bất biến — muốn dời phải gỡ con ra (WITHDRAWN, mất dấu) rồi xếp lại.
 *
 * Buổi mới BẮT BUỘC thuộc CÙNG lớp: sĩ số và `LeadTrialHistory` gắn theo lớp. Muốn
 * chuyển lớp Trial khác thì gỡ + xếp lại.
 *
 * Bốn điều dễ làm sai, đã xử ở đây:
 *
 * 1. **Không xoá bản ghi điểm danh của buổi cũ.** Bé vắng ở buổi cũ chính là lý do
 *    phải dời; xoá đi là mất luôn bằng chứng và `attendedCount` sẽ tính sai.
 * 2. **Không đụng giáo viên của LỚP hay của BUỔI.** Chỉ ca này mất phân công; lớp có
 *    nhiều bé, gỡ ở cấp lớp là gỡ nhầm của người khác.
 * 3. **Ghi vết vào `TrialReschedule` dù trên màn bé đó biến mất khỏi buổi cũ.** Tỷ lệ
 *    dời lịch là chỉ số chất lượng chốt lịch của Sale, xoá thẳng là mất hẳn.
 * 4. **`dedupeKey` của sự kiện phải mang MỐC DỜI, không chỉ buổi đích.** Khoá theo đích
 *    thì dãy A→B→A→B trùng khoá ở lần thứ ba; `DomainEvent.dedupeKey` là @unique nên
 *    `publishEvent` ăn P2002 — lỗi đó nổ TRONG transaction này, Postgres huỷ cả
 *    transaction, cú update ngay trên bị rollback. Nói cách khác: học viên vĩnh viễn
 *    không dời về được buổi đã từng ở.
 */
export async function rescheduleTrialEnrollment(params: {
  trialEnrollmentId: string;
  toSessionId: string;
  reason?: string | null;
  actorId: string | null;
}): Promise<{ ok: boolean; error?: string; gvBiGoId?: string | null }> {
  try {
    return await db.$transaction(async (tx) => {
      const enr = await tx.trialEnrollment.findUnique({
        where: { id: params.trialEnrollmentId },
        select: {
          id: true,
          status: true,
          trialClassId: true,
          leadChildId: true,
          scheduledSessionId: true,
          gvPhanCongId: true,
          rescheduleCount: true,
          leadChild: { select: { leadId: true } },
          trialClass: { select: { centerId: true, orgUnitId: true, name: true } },
        },
      });
      if (!enr) return { ok: false, error: "Không tìm thấy ca trải nghiệm" };

      // Buổi mới phải thuộc ĐÚNG lớp đó và chưa diễn ra. Kiểm ở server chứ không chỉ
      // ở UI: action nhận id thẳng từ client.
      const ses = await tx.trialClassSession.findUnique({
        where: { id: params.toSessionId },
        select: { id: true, trialClassId: true, status: true, date: true },
      });

      // Toàn bộ phần quyết định nằm ở hàm thuần (có test phủ đủ nhánh) — ở đây chỉ
      // nạp dữ liệu rồi hỏi. Hai bản logic là hai cơ hội lệch nhau.
      const luat = danhGiaDoiLich({
        caStatus: enr.status,
        caTrialClassId: enr.trialClassId,
        caSessionId: enr.scheduledSessionId,
        buoiMoi: ses
          ? { id: ses.id, trialClassId: ses.trialClassId, status: ses.status }
          : null,
      });
      if (!luat.ok) return { ok: false, error: luat.error };

      const buoiCu = enr.scheduledSessionId
        ? await tx.trialClassSession.findUnique({
            where: { id: enr.scheduledSessionId },
            select: { date: true },
          })
        : null;

      const gvBiGoId = enr.gvPhanCongId;
      const mocDoi = new Date();
      const lyDo = params.reason?.trim() || null;

      await tx.trialEnrollment.update({
        where: { id: enr.id },
        data: {
          scheduledSessionId: params.toSessionId,
          // Buổi CŨ — site GV đọc cột này để in trạng thái "Bị dời lịch"
          // (`lib/lms/trial-row-status.ts`). Dời nhiều lần chỉ giữ lần gần nhất;
          // chuỗi đầy đủ nằm ở `TrialReschedule` ngay dưới.
          rescheduledFromSessionId: enr.scheduledSessionId,
          rescheduledAt: mocDoi,
          rescheduleReason: lyDo,
          // Mất phân công. Xoá luôn đề xuất cũ để Sale đề xuất lại từ đầu — giữ đề
          // xuất cũ thì Đào tạo dễ tưởng Sale đã cân nhắc cho lịch MỚI.
          gvPhanCongId: null,
          gvDeXuatId: null,
          rescheduleCount: enr.rescheduleCount + 1,
        },
      });

      await tx.trialReschedule.create({
        data: {
          trialEnrollmentId: enr.id,
          fromSessionId: enr.scheduledSessionId,
          toSessionId: params.toSessionId,
          gvBiGoId,
          reason: lyDo,
          changedById: params.actorId,
          changedByName: await actorName(params.actorId, tx),
          centerId: enr.trialClass.centerId,
          orgUnitId: enr.trialClass.orgUnitId,
        },
      });

      // Cùng tên sự kiện với đường buổi hẹn V1 để Sale phụ trách nhận đúng MỘT loại
      // thông báo "Đổi lịch học thử", bất kể lịch nằm ở hệ nào.
      await publishEvent(
        "trial.schedule_changed",
        {
          trialId: enr.id,
          leadId: enr.leadChild.leadId,
          fromAt: buoiCu?.date?.toISOString() ?? null,
          toAt: ses!.date.toISOString(),
        },
        {
          tx,
          dedupeKey: `trial.schedule_changed:${enr.id}:${params.toSessionId}:${mocDoi.getTime()}`,
        },
      );

      await writeAudit({
        actor: { id: params.actorId, name: await actorName(params.actorId, tx) },
        module: "trial",
        entityType: "TrialEnrollment",
        entityId: enr.id,
        action: "UPDATE",
        oldValues: { scheduledSessionId: enr.scheduledSessionId, gvPhanCongId: gvBiGoId },
        newValues: { scheduledSessionId: params.toSessionId, gvPhanCongId: null },
        reason: lyDo ?? undefined,
        orgUnitId: enr.trialClass.centerId,
        tx,
      });

      return { ok: true, gvBiGoId };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi dời lịch" };
  }
}

/**
 * Người được ĐỀ XUẤT hoặc PHÂN CÔNG cho một ca phải THẬT SỰ là giáo viên đang hoạt động.
 *
 * ⚠️ Trước bản vá này, hai hàm dưới chỉ `findUnique` kiểm TỒN TẠI, nên gọi thẳng action
 * gán được tài khoản phụ huynh hoặc kế toán làm giáo viên của ca. Đường gán ở cấp LỚP
 * vốn đã kiểm (`teacherCenterAssignmentError`), chỉ đường theo CA là hở.
 *
 * Tính cả người giữ TEACHER ở vị trí PHỤ (`roles[]`), giống mọi nơi khác trong repo —
 * quản lý cơ sở kiêm dạy là ca có thật.
 */
async function laGiaoVienHopLe(userId: string): Promise<boolean> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { isActive: true, deletedAt: true, role: true, roles: true },
  });
  if (!u || !u.isActive || u.deletedAt) return false;
  return u.role === "TEACHER" || u.roles.includes("TEACHER");
}

const KHONG_PHAI_GV = "Người được chọn không phải giáo viên đang hoạt động" as const;

/**
 * Sale ĐỀ XUẤT giáo viên cho một ca. Chỉ ghi được khi Đào tạo CHƯA chốt — sau khi
 * `gvPhanCongId` có giá trị thì Sale không sửa nữa (chốt câu 1).
 */
export async function proposeTrialTeacher(params: {
  trialEnrollmentId: string;
  gvDeXuatId: string | null;
  actorId: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const enr = await db.trialEnrollment.findUnique({
    where: { id: params.trialEnrollmentId },
    select: { id: true, status: true, gvPhanCongId: true },
  });
  if (!enr) return { ok: false, error: "Không tìm thấy ca trải nghiệm" };
  const luat = saleDuocDeXuat({ status: enr.status, gvPhanCongId: enr.gvPhanCongId });
  if (!luat.ok) return { ok: false, error: luat.error };
  if (params.gvDeXuatId && !(await laGiaoVienHopLe(params.gvDeXuatId))) {
    return { ok: false, error: KHONG_PHAI_GV };
  }
  await db.trialEnrollment.update({
    where: { id: enr.id },
    data: { gvDeXuatId: params.gvDeXuatId },
  });
  return { ok: true };
}

/**
 * Đào tạo PHÂN CÔNG giáo viên cho một ca (duyệt đề xuất của Sale hoặc chỉ định người
 * khác). Ghi đè được, vì đây là quyền quyết định cuối.
 */
export async function assignTrialCaseTeacher(params: {
  trialEnrollmentId: string;
  gvPhanCongId: string | null;
  actorId: string | null;
}): Promise<{ ok: boolean; error?: string; daDoi?: boolean }> {
  const enr = await db.trialEnrollment.findUnique({
    where: { id: params.trialEnrollmentId },
    select: { id: true, status: true, gvPhanCongId: true },
  });
  if (!enr) return { ok: false, error: "Không tìm thấy ca trải nghiệm" };
  if (enr.status !== "ACTIVE") return { ok: false, error: "Ca này đã kết thúc" };
  if (params.gvPhanCongId && !(await laGiaoVienHopLe(params.gvPhanCongId))) {
    return { ok: false, error: KHONG_PHAI_GV };
  }
  await db.trialEnrollment.update({
    where: { id: enr.id },
    data: { gvPhanCongId: params.gvPhanCongId },
  });
  return { ok: true, daDoi: enr.gvPhanCongId !== params.gvPhanCongId };
}
