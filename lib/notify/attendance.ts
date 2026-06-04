import "server-only";
import { db } from "@/lib/db";
import { sendZaloNotification } from "@/lib/zalo/service";

// =============================================================================
// Commit 5 — thông báo điểm danh cho phụ huynh.
//  - Khi GV lưu điểm danh → báo phụ huynh con vừa được điểm danh.
//  - Kênh: Zalo OA (khi đã cấu hình) + fallback EMAIL (chạy ngay khi Zalo chưa
//    cấu hình) — qua sendZaloNotification.
//  - Chỉ gửi cho ĐÚNG phụ huynh của con đó; GỘP nếu 1 buổi nhiều con cùng phụ
//    huynh; mỗi (buổi, học viên) chỉ 1 lần (mốc Attendance.notifiedAt).
// =============================================================================

const STATUS_LABEL: Record<string, string> = {
  PRESENT: "Có mặt",
  ABSENT: "Vắng",
  LATE: "Đi muộn",
  EXCUSED: "Vắng có phép",
};

const ZNS_TEMPLATE = process.env.ZALO_ZNS_TEMPLATE_ATTENDANCE || null;

export async function notifyAttendanceForSession(sessionId: string): Promise<void> {
  // Các bản ghi CHƯA gửi thông báo của buổi này.
  const rows = await db.attendance.findMany({
    where: { sessionId, notifiedAt: null },
    select: {
      id: true,
      status: true,
      student: {
        select: {
          id: true,
          name: true,
          parentPhone: true,
          parentUser: { select: { email: true, name: true } },
          parentEmail: true,
        },
      },
      session: { select: { date: true, class: { select: { name: true } } } },
    },
  });
  if (rows.length === 0) return;

  const dateStr = rows[0].session.date.toLocaleDateString("vi-VN");
  const className = rows[0].session.class.name;

  // Gộp theo phụ huynh: ưu tiên email tài khoản PH, fallback parentEmail; phone PH.
  type Group = {
    email: string | null;
    phone: string | null;
    parentName: string | null;
    items: { studentName: string; statusLabel: string }[];
    attendanceIds: string[];
  };
  const groups = new Map<string, Group>();

  for (const r of rows) {
    const email = r.student.parentUser?.email ?? r.student.parentEmail ?? null;
    const phone = r.student.parentPhone ?? null;
    if (!email && !phone) {
      // Không có kênh liên hệ → vẫn đánh dấu để khỏi xử lý lại.
      groups.set(`__none_${r.id}`, { email: null, phone: null, parentName: null, items: [], attendanceIds: [r.id] });
      continue;
    }
    const key = email ?? `phone:${phone}`;
    const g = groups.get(key) ?? {
      email,
      phone,
      parentName: r.student.parentUser?.name ?? null,
      items: [],
      attendanceIds: [],
    };
    g.items.push({ studentName: r.student.name, statusLabel: STATUS_LABEL[r.status] ?? r.status });
    g.attendanceIds.push(r.id);
    groups.set(key, g);
  }

  for (const g of groups.values()) {
    if (g.items.length > 0 && (g.email || g.phone)) {
      const body = g.items
        .map((i) => `Bé ${i.studentName} đã điểm danh ${i.statusLabel} buổi ${dateStr} lớp ${className}.`)
        .join("\n");
      const subject = `Điểm danh buổi ${dateStr} — lớp ${className}`;

      await sendZaloNotification({
        toPhone: g.phone ?? "",
        templateKey: ZNS_TEMPLATE,
        params: {
          student: g.items.map((i) => i.studentName).join(", "),
          status: g.items.map((i) => i.statusLabel).join(", "),
          date: dateStr,
          class: className,
        },
        fallbackEmail: g.email
          ? { to: g.email, toName: g.parentName, subject, bodyText: body }
          : null,
      }).catch(() => {});
    }
    // Đánh dấu đã xử lý (kể cả nhóm không có kênh) → không gửi lại.
    if (g.attendanceIds.length > 0) {
      await db.attendance.updateMany({ where: { id: { in: g.attendanceIds } }, data: { notifiedAt: new Date() } });
    }
  }
}
