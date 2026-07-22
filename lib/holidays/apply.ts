import "server-only";
import { db } from "@/lib/db";
import { ymdLocal } from "@/lib/classes/schedule";
import { enqueueEmail } from "@/lib/email/queue";

// =============================================================================
// P1-f — khi THÊM/SỬA ngày nghỉ (Holiday): DỜI các buổi học TƯƠNG LAI rơi đúng
// ngày nghỉ sang ngày học hợp lệ kế tiếp (theo lịch lớp, bỏ qua ngày nghỉ +
// buổi đã có). Thông báo GV lớp bị ảnh hưởng (email, best-effort).
// =============================================================================

function expandRange(start: Date, end: Date | null): Set<string> {
  const set = new Set<string>();
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  // QA 21/07 (B3 — root cause chính): `last = cur` (CÙNG object) khi end=null →
  // vòng while tăng cur đồng thời tăng last → LẶP VÔ HẠN với mọi ngày nghỉ 1
  // ngày (crash "Set maximum size exceeded", bị try/catch nuốt → không dời buổi
  // nào bao giờ). PHẢI clone. Kèm guard 400 ngày như expandHolidaySet.
  const last = end
    ? new Date(end.getFullYear(), end.getMonth(), end.getDate())
    : new Date(cur);
  let guard = 0;
  while (cur <= last && guard < 400) {
    guard++;
    set.add(ymdLocal(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return set;
}

export async function applyHolidayShift(holiday: {
  date: Date;
  endDate: Date | null;
  centerId: string | null;
}): Promise<{ shifted: number; affectedClasses: number }> {
  const range = expandRange(holiday.date, holiday.endDate);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // QA 21/07 (B3) — holiday.date lưu 00:00 UTC nên `lte: holiday.date` tạo cửa sổ
  // RỖNG: buổi 09:00 VN (=02:00Z) đã bị loại ngay từ query → không buổi nào được
  // dời. Nới cửa sổ ±1 ngày đệm múi giờ; khớp CHÍNH XÁC theo ngày-local do filter
  // `range.has(ymdLocal(...))` bên dưới quyết định.
  const windowStart = new Date(holiday.date);
  windowStart.setDate(windowStart.getDate() - 1);
  const windowEnd = new Date(holiday.endDate ?? holiday.date);
  windowEnd.setDate(windowEnd.getDate() + 2);

  // Buổi tương lai rơi đúng ngày nghỉ (chỉ lớp đang hoạt động + đúng cơ sở nếu có).
  const sessions = await db.classSession.findMany({
    where: {
      status: "SCHEDULED",
      date: { gte: windowStart, lt: windowEnd },
      class: {
        deletedAt: null,
        ...(holiday.centerId ? { centerId: holiday.centerId } : {}),
      },
    },
    select: {
      id: true,
      date: true,
      classId: true,
      class: {
        select: {
          id: true,
          name: true,
          scheduleDays: true,
          centerId: true,
          teacher: { select: { name: true, email: true } },
        },
      },
    },
  });
  const affected = sessions.filter((s) => range.has(ymdLocal(s.date)) && s.date >= todayStart);
  if (affected.length === 0) return { shifted: 0, affectedClasses: 0 };

  // Tập ngày nghỉ TOÀN BỘ (để khi dời không rơi vào ngày nghỉ khác). Lấy cả
  // holiday toàn hệ thống (centerId null) + cùng cơ sở của lớp được xử lý ở dưới.
  const allHolidays = await db.holiday.findMany({ select: { date: true, endDate: true, centerId: true } });

  let shifted = 0;
  const affectedClassIds = new Set<string>();

  for (const s of affected) {
    const days = s.class.scheduleDays;
    if (!days || days.length === 0) continue; // không rõ lịch → bỏ qua

    // Ngày nghỉ áp dụng cho lớp này = holiday toàn hệ thống + holiday cùng cơ sở.
    const holSet = new Set<string>();
    for (const h of allHolidays) {
      if (h.centerId === null || h.centerId === s.class.centerId) {
        for (const d of expandRange(h.date, h.endDate)) holSet.add(d);
      }
    }
    // Các buổi đã có của lớp (tránh trùng ngày).
    const taken = new Set(
      (await db.classSession.findMany({ where: { classId: s.classId }, select: { date: true } })).map((x) => ymdLocal(x.date)),
    );

    // Tìm ngày học hợp lệ kế tiếp sau ngày nghỉ.
    const cursor = new Date(s.date);
    let found: Date | null = null;
    for (let i = 0; i < 120; i++) {
      cursor.setDate(cursor.getDate() + 1);
      const key = ymdLocal(cursor);
      if (days.includes(cursor.getDay()) && !holSet.has(key) && !taken.has(key)) {
        found = new Date(cursor);
        break;
      }
    }
    if (!found) continue;

    await db.classSession.update({ where: { id: s.id }, data: { date: found } });
    shifted++;
    affectedClassIds.add(s.classId);

    // Thông báo GV (best-effort).
    const email = s.class.teacher?.email;
    if (email) {
      await enqueueEmail({
        to: email,
        toName: s.class.teacher?.name ?? undefined,
        // B1.5: template DB (admin sửa) — inline dưới là fallback.
        templateKey: "HOLIDAY_SHIFT",
        vars: {
          teacherName: s.class.teacher?.name ?? "thầy/cô",
          className: s.class.name,
          oldDate: ymdLocal(s.date),
          newDate: ymdLocal(found),
        },
        subject: `Dời buổi học do nghỉ — lớp ${s.class.name}`,
        bodyText: `Buổi học lớp ${s.class.name} ngày ${ymdLocal(s.date)} trùng ngày nghỉ đã được dời sang ${ymdLocal(found)}.`,
        context: { type: "HOLIDAY_SHIFT", id: s.id },
      }).catch(() => {});
    }
  }

  return { shifted, affectedClasses: affectedClassIds.size };
}
