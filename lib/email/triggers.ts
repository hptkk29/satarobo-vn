import { enqueueEmail } from "./queue";

// =============================================================================
// Cụm A2 — enqueue helper cho các trigger phase đầu.
// MỖI email chỉ chứa dữ liệu CỦA CON LIÊN QUAN — không lộ con khác.
// Dùng inline content (hoạt động ngay cả khi chưa seed template); nếu có
// EmailTemplate.code tương ứng, truyền templateKey để render qua template.
// =============================================================================

const SIGNATURE = "\n\n— Trung tâm Sata Robo";
const wrap = (title: string, lines: string[]) =>
  `<div style="font-family:system-ui,sans-serif;color:#333">
    <h2 style="color:#F97316">${title}</h2>
    ${lines.map((l) => `<p>${l}</p>`).join("")}
    <p style="color:#999;font-size:12px">— Trung tâm Sata Robo</p>
  </div>`;

/** (a) Tài khoản phụ huynh được kích hoạt. */
export function enqueueAccountActivated(p: { to: string; parentName?: string | null; childName?: string | null }) {
  return enqueueEmail({
    to: p.to,
    toName: p.parentName ?? undefined,
    subject: "Tài khoản phụ huynh Sata Robo đã kích hoạt",
    bodyText: `Chào ${p.parentName ?? "quý phụ huynh"},\nTài khoản theo dõi học tập${p.childName ? ` của bé ${p.childName}` : ""} đã được kích hoạt. Bạn có thể đăng nhập tại hocvien.satarobo.vn.${SIGNATURE}`,
    bodyHtml: wrap("Tài khoản đã kích hoạt", [
      `Chào <b>${p.parentName ?? "quý phụ huynh"}</b>,`,
      `Tài khoản theo dõi học tập${p.childName ? ` của bé <b>${p.childName}</b>` : ""} đã được kích hoạt.`,
      `Đăng nhập tại <a href="https://hocvien.satarobo.vn">hocvien.satarobo.vn</a>.`,
    ]),
    context: { type: "ACCOUNT_ACTIVATED", id: p.to },
  });
}

/** (b) Xác nhận đăng ký khoá. */
export function enqueueEnrollmentConfirmation(p: {
  to: string;
  parentName?: string | null;
  studentName: string;
  studentCode?: string | null;
  className: string;
  courseName: string;
  startDate?: string | null;
}) {
  const lines = [
    `Chào ${p.parentName ?? "quý phụ huynh"},`,
    `Bé <b>${p.studentName}</b>${p.studentCode ? ` (mã ${p.studentCode})` : ""} đã được đăng ký vào lớp <b>${p.className}</b> — khoá ${p.courseName}.`,
    p.startDate ? `Ngày bắt đầu: <b>${p.startDate}</b>.` : "",
  ].filter(Boolean);
  return enqueueEmail({
    to: p.to,
    toName: p.parentName ?? undefined,
    subject: `Xác nhận đăng ký khoá học — ${p.studentName}`,
    bodyText: lines.map((l) => l.replace(/<[^>]+>/g, "")).join("\n") + SIGNATURE,
    bodyHtml: wrap("Xác nhận đăng ký", lines),
    context: { type: "ENROLLMENT_CONFIRMATION", id: p.studentCode ?? p.studentName },
  });
}

/** (e) Có nhận xét mới cho bé. */
export function enqueueNewFeedback(p: {
  to: string;
  parentName?: string | null;
  studentName: string;
  className: string;
  comment: string;
  rating?: number | null;
}) {
  const lines = [
    `Chào ${p.parentName ?? "quý phụ huynh"},`,
    `Giáo viên vừa có nhận xét mới cho bé <b>${p.studentName}</b> (lớp ${p.className}):`,
    `<i>"${p.comment}"</i>${p.rating ? ` — ${p.rating}/5⭐` : ""}`,
    `Xem chi tiết tại mục Nhận xét trên cổng học viên.`,
  ];
  return enqueueEmail({
    to: p.to,
    toName: p.parentName ?? undefined,
    subject: `Nhận xét mới cho bé ${p.studentName}`,
    bodyText: lines.map((l) => l.replace(/<[^>]+>/g, "")).join("\n") + SIGNATURE,
    bodyHtml: wrap("Nhận xét mới", lines),
    context: { type: "NEW_FEEDBACK", id: p.studentName },
  });
}

/** (f) Có bài tập mới. */
export function enqueueNewAssignment(p: {
  to: string;
  parentName?: string | null;
  studentName: string;
  className: string;
  assignmentTitle: string;
  dueAt?: string | null;
}) {
  const lines = [
    `Chào ${p.parentName ?? "quý phụ huynh"},`,
    `Lớp <b>${p.className}</b> của bé <b>${p.studentName}</b> vừa có bài tập mới: <b>${p.assignmentTitle}</b>.`,
    p.dueAt ? `Hạn nộp: <b>${p.dueAt}</b>.` : "",
  ].filter(Boolean);
  return enqueueEmail({
    to: p.to,
    toName: p.parentName ?? undefined,
    subject: `Bài tập mới — ${p.assignmentTitle}`,
    bodyText: lines.map((l) => l.replace(/<[^>]+>/g, "")).join("\n") + SIGNATURE,
    bodyHtml: wrap("Bài tập mới", lines),
    context: { type: "NEW_ASSIGNMENT", id: p.studentName },
  });
}

/** (g) Bài đã chấm. */
export function enqueueAssignmentGraded(p: {
  to: string;
  parentName?: string | null;
  studentName: string;
  assignmentTitle: string;
  score: number | null;
  total: number;
}) {
  const lines = [
    `Chào ${p.parentName ?? "quý phụ huynh"},`,
    `Bài tập <b>${p.assignmentTitle}</b> của bé <b>${p.studentName}</b> đã được chấm: <b>${p.score ?? "—"}/${p.total}</b>.`,
  ];
  return enqueueEmail({
    to: p.to,
    toName: p.parentName ?? undefined,
    subject: `Kết quả bài tập — ${p.studentName}`,
    bodyText: lines.map((l) => l.replace(/<[^>]+>/g, "")).join("\n") + SIGNATURE,
    bodyHtml: wrap("Bài tập đã chấm", lines),
    context: { type: "ASSIGNMENT_GRADED", id: p.studentName },
  });
}
