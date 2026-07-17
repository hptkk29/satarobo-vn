import "server-only";
import { db } from "@/lib/db";
import { sendZaloNotification } from "@/lib/zalo/service";
import { formatDateVN } from "@/lib/format/date";

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

// =============================================================================
// Task #16 (Kiệt duyệt 07/07/2026) — báo GIÁO VIÊN đứng lớp khi 1 buổi ĐÃ điểm
// danh bị người khác SỬA/hồi tố (CSKH SALES_CSM / Quản lý cơ sở / Quản lý lớp học).
//  - Kênh: StaffNotification (chuông inbox admin) — theo mẫu r7-notifications.ts.
//  - Bỏ qua nếu người sửa CHÍNH là GV của lớp (không tự báo mình).
//  - dedupeKey ổn định theo buổi → mỗi lần sửa cập nhật nội dung + đưa lại về CHƯA
//    đọc (readAt=null) thay vì tạo hàng loạt bản ghi.
// =============================================================================
export async function notifyTeacherAttendanceEdited(params: {
  sessionId: string;
  editedByUserId: string;
  editedByName?: string | null;
}): Promise<void> {
  const sess = await db.classSession.findUnique({
    where: { id: params.sessionId },
    select: {
      date: true,
      class: { select: { name: true, teacherId: true } },
    },
  });
  const teacherId = sess?.class.teacherId ?? null;
  // Không có GV, hoặc GV chính là người vừa sửa → không cần báo.
  if (!sess || !teacherId || teacherId === params.editedByUserId) return;

  const dateStr = formatDateVN(sess.date);
  const by = params.editedByName?.trim() ? ` bởi ${params.editedByName.trim()}` : "";
  const dedupeKey = `attendance.edited:${params.sessionId}`;
  await db.staffNotification.upsert({
    where: { userId_dedupeKey: { userId: teacherId, dedupeKey } },
    create: {
      userId: teacherId,
      category: "CLASS",
      title: "Điểm danh buổi học bị chỉnh sửa",
      body: `Điểm danh buổi ${dateStr} lớp ${sess.class.name} vừa được cập nhật${by}. Vui lòng kiểm tra lại.`,
      href: `/attendance?sessionId=${params.sessionId}`,
      dedupeKey,
    },
    // Sửa lại lần nữa → làm mới nội dung + đưa về chưa đọc để GV thấy.
    update: {
      body: `Điểm danh buổi ${dateStr} lớp ${sess.class.name} vừa được cập nhật${by}. Vui lòng kiểm tra lại.`,
      readAt: null,
    },
  });
}
