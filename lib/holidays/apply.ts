import "server-only";
import { db } from "@/lib/db";
import { ymdVN } from "@/lib/classes/schedule";
import { enqueueEmail } from "@/lib/email/queue";
import { slotForDate, type SchedulePhase } from "@/lib/classes/phases";
import { parseHm } from "@/lib/classes/slots";
import { vnAddDays, vnDateAt, vnParts, vnStartOfDay, vnWeekday } from "@/lib/time/vn";

// =============================================================================
// P1-f — khi THÊM/SỬA ngày nghỉ (Holiday): DỜI các buổi học TƯƠNG LAI rơi đúng
// ngày nghỉ sang ngày học hợp lệ kế tiếp (theo lịch lớp, bỏ qua ngày nghỉ +
// buổi đã có). Thông báo GV lớp bị ảnh hưởng (email, best-effort).
// =============================================================================

function expandRange(start: Date, end: Date | null): Set<string> {
  const set = new Set<string>();
  // Ngày nghỉ khớp theo LỊCH VN (server Vercel chạy UTC — xem `@/lib/time/vn`).
  // QA 21/07 (B3 — root cause chính): `last = cur` (CÙNG object) khi end=null →
  // vòng while tăng cur đồng thời tăng last → LẶP VÔ HẠN với mọi ngày nghỉ 1
  // ngày (crash "Set maximum size exceeded", bị try/catch nuốt → không dời buổi
  // nào bao giờ). Nay `vnAddDays` trả object MỚI nên không còn bí danh. Giữ
  // guard 400 ngày như expandHolidaySet.
  let cur = vnStartOfDay(start);
  const last = end ? vnStartOfDay(end) : cur;
  let guard = 0;
  while (cur <= last && guard < 400) {
    guard++;
    set.add(ymdVN(cur));
    cur = vnAddDays(cur, 1);
  }
  return set;
}

/**
 * THỨ NÀO LỚP CÓ HỌC — dùng để tìm ngày dời khi buổi rơi vào ngày nghỉ.
 *
 * Tách thuần để test được: đây là chỗ lỗi prod 04/09/2026 nằm, và nó chỉ phụ
 * thuộc ba mẩu dữ liệu, không cần DB.
 *
 * Thứ tự ưu tiên:
 *   1. `scheduleDays` — bản sao phẳng trên `Class`, khi có thì tin.
 *   2. **Thứ của chính các buổi lớp đang có** — lớp học T3/T5 thì buổi của nó
 *      rơi vào T3/T5. Đây là vế MỚI, và là vế cứu cả tính năng: đo trên dữ liệu
 *      thật, 100/100 lớp không có `scheduleDays` lẫn `schedulePhases`, nên bản cũ
 *      `continue` im lặng ở mọi lớp và không buổi nào từng được dời.
 *   3. Cùng thứ với buổi đang dời — lớp mới tinh chỉ có đúng một buổi thì "tuần
 *      sau, cùng thứ" là phỏng đoán ít sai nhất, và vẫn hơn hẳn việc bỏ mặc buổi
 *      nằm trên ngày nghỉ.
 *
 * (Kế hoạch nhiều giai đoạn `schedulePhases` được xử RIÊNG ở nhánh `usePhases`
 * vì nó quyết định cả GIỜ, không chỉ thứ.)
 */
export function suyThuHopLe(
  scheduleDays: number[] | null | undefined,
  thuCuaCacBuoi: readonly number[],
  thuCuaBuoiDangDoi: number,
): number[] {
  if (scheduleDays && scheduleDays.length > 0) return scheduleDays;
  const tuBuoi = [...new Set(thuCuaCacBuoi)];
  if (tuBuoi.length > 0) return tuBuoi;
  return [thuCuaBuoiDangDoi];
}

export async function applyHolidayShift(holiday: {
  date: Date;
  endDate: Date | null;
  centerId: string | null;
}): Promise<{ shifted: number; affectedClasses: number }> {
  const range = expandRange(holiday.date, holiday.endDate);
  const now = new Date();
  const todayStart = vnStartOfDay(now);

  // QA 21/07 (B3) — holiday.date lưu 00:00 UTC nên `lte: holiday.date` tạo cửa sổ
  // RỖNG: buổi 09:00 VN (=02:00Z) đã bị loại ngay từ query → không buổi nào được
  // dời. Nới cửa sổ ±1 ngày đệm múi giờ; khớp CHÍNH XÁC theo ngày-local do filter
  // `range.has(ymdVN(...))` bên dưới quyết định.
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
          // 07/08 — lớp có kế hoạch nhiều giai đoạn: thứ VÀ giờ đổi theo giai đoạn, nên
          // không được dùng scheduleDays (bản sao của giai đoạn đang hiệu lực) để tìm
          // ngày dời — sẽ chọn nhầm thứ mà giai đoạn hiện tại không hề có lớp.
          schedulePhases: {
            orderBy: { effectiveFrom: "asc" },
            select: {
              effectiveFrom: true,
              effectiveTo: true,
              slots: { select: { weekday: true, startTime: true, endTime: true } },
            },
          },
        },
      },
    },
  });
  const affected = sessions.filter((s) => range.has(ymdVN(s.date)) && s.date >= todayStart);
  if (affected.length === 0) return { shifted: 0, affectedClasses: 0 };

  // Tập ngày nghỉ TOÀN BỘ (để khi dời không rơi vào ngày nghỉ khác). Lấy cả
  // holiday toàn hệ thống (centerId null) + cùng cơ sở của lớp được xử lý ở dưới.
  const allHolidays = await db.holiday.findMany({ select: { date: true, endDate: true, centerId: true } });

  let shifted = 0;
  const affectedClassIds = new Set<string>();

  for (const s of affected) {
    const phases: SchedulePhase[] = s.class.schedulePhases
      .map((p) => ({
        effectiveFrom: p.effectiveFrom,
        effectiveTo: p.effectiveTo,
        slots: p.slots.map((x) => ({
          weekday: x.weekday,
          startTime: x.startTime,
          endTime: x.endTime,
        })),
      }))
      .filter((p) => p.slots.length > 0);
    const usePhases = phases.length > 0;

    const days = s.class.scheduleDays;

    // Ngày nghỉ áp dụng cho lớp này = holiday toàn hệ thống + holiday cùng cơ sở.
    const holSet = new Set<string>();
    for (const h of allHolidays) {
      if (h.centerId === null || h.centerId === s.class.centerId) {
        for (const d of expandRange(h.date, h.endDate)) holSet.add(d);
      }
    }
    // Các buổi đã có của lớp (tránh trùng ngày).
    const buoiCuaLop = await db.classSession.findMany({
      where: { classId: s.classId },
      select: { date: true },
    });
    const taken = new Set(buoiCuaLop.map((x) => ymdVN(x.date)));

    // ── LỊCH SUY TỪ CHÍNH CÁC BUỔI CỦA LỚP ────────────────────────────────
    //
    // ⚠️ VÁ 04/09/2026 — đây là lý do THẬT khiến "thêm ngày nghỉ mà buổi học
    // không dời đi" trên prod.
    //
    // Bản cũ có dòng:
    //     if (!usePhases && (!days || days.length === 0)) continue;  // không rõ lịch
    // Dựng lại được trên dữ liệu thật: 9/9 buổi rơi đúng ngày nghỉ lọt qua MỌI
    // bộ lọc rồi chết ở đúng dòng đó, `applyHolidayShift` trả `shifted: 0`, và
    // vì nó `continue` IM LẶNG nên không log, không lỗi, không ai biết. Đo tiếp:
    // **100/100 lớp** không có `schedulePhases` LẪN `scheduleDays` — tức nhánh
    // "không rõ lịch" không phải ca hiếm, nó là ca DUY NHẤT.
    //
    // Nhưng lớp KHÔNG hề "không rõ lịch": dãy buổi của nó chính là lịch. Lớp học
    // thứ 3 và thứ 5 thì các buổi của nó rơi vào thứ 3 và thứ 5. Suy từ đó vừa
    // đúng hơn giả định, vừa không cần dữ liệu mới.
    //
    // Thứ tự ưu tiên giữ nguyên tinh thần cũ: kế hoạch nhiều giai đoạn (nguồn sự
    // thật) → `scheduleDays` (bản sao phẳng) → dãy buổi thật → cùng thứ tuần sau.
    const thuHopLe = suyThuHopLe(
      days,
      buoiCuaLop.map((x) => vnWeekday(x.date)),
      vnWeekday(s.date),
    );

    // Tìm ngày học hợp lệ kế tiếp sau ngày nghỉ (thứ tính theo lịch VN).
    // • Lớp có kế hoạch: thứ VÀ giờ lấy theo giai đoạn phủ ngày đích — buổi dời sang
    //   giai đoạn khác phải mang giờ của giai đoạn đó, không giữ giờ cũ.
    // • Lớp chưa có kế hoạch: giữ nguyên hành vi cũ (giữ giờ-phút của buổi).
    let cursor = s.date;
    let found: Date | null = null;
    for (let i = 0; i < 200; i++) {
      cursor = vnAddDays(cursor, 1);
      const key = ymdVN(cursor);
      if (holSet.has(key) || taken.has(key)) continue;
      if (usePhases) {
        const slot = slotForDate(phases, cursor);
        if (!slot) continue;
        const p = vnParts(cursor);
        const { h, m } = parseHm(slot.startTime);
        found = vnDateAt(p.year, p.month, p.day, h, m);
        break;
      }
      if (thuHopLe.includes(vnWeekday(cursor))) {
        found = new Date(cursor);
        break;
      }
    }
    if (!found) {
      // Không im lặng: 200 ngày liên tiếp không có ngày học hợp lệ nào là bất
      // thường (lịch nghỉ dày đặc, hoặc lớp chỉ có đúng một buổi). Buổi đó nằm
      // lại trên ngày nghỉ, và người vận hành cần biết để xử tay.
      console.warn(
        `[holiday-shift] KHÔNG tìm được ngày dời cho buổi ${s.id} (lớp "${s.class.name}", ${ymdVN(s.date)}) — buổi nằm lại trên ngày nghỉ.`,
      );
      continue;
    }

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
          oldDate: ymdVN(s.date),
          newDate: ymdVN(found),
        },
        subject: `Dời buổi học do nghỉ — lớp ${s.class.name}`,
        bodyText: `Buổi học lớp ${s.class.name} ngày ${ymdVN(s.date)} trùng ngày nghỉ đã được dời sang ${ymdVN(found)}.`,
        context: { type: "HOLIDAY_SHIFT", id: s.id },
      }).catch(() => {});
    }
  }

  return { shifted, affectedClasses: affectedClassIds.size };
}
