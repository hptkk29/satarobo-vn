// lib/_handlers/trial-eval-notif.ts — consumer cho DomainEvent "trial.evaluated".
//
// ─────────────────────────────────────────────────────────────────────────────
// Vì sao có file này (rà luồng Trial vs BA, 03/09/2026)
//
// Giáo viên chấm phiếu rubric xong (`saveTrialRubricAction`) thì **không có bước
// đẩy nào**: action chỉ `upsert` vào `TrialRubricEval` rồi `revalidatePath`. Sale
// muốn phiếu phải TỰ ĐI TÌM, mà cửa hay dùng (`/sale/trial`) trước 03/09 lại chỉ
// nhìn được buổi tương lai — trong khi phiếu bao giờ cũng thuộc buổi đã qua. Kết
// quả thực tế: phiếu chấm xong không ai biết mà đi lấy.
//
// Đây là nửa còn lại của lỗ đó (nửa kia: `lib/trial/sale-window.ts`). Phiếu vẫn
// KHÔNG được đính kèm — thông báo chỉ mang điểm, xếp loại và ĐƯỜNG tới chỗ xuất
// PDF. Cố ý: file PDF dựng theo yêu cầu ở `/lop-trial/pdf/[enrollmentId]`, đẩy
// một bản sao vào hộp thư là đẻ ra bản thứ hai không ai cập nhật khi giáo viên
// chấm lại.
//
// Đi qua DomainEvent chứ không gọi `notifyStaff` thẳng trong action: luật kiến
// trúc của repo (CLAUDE.md) là side-effect không-atomic tách khỏi đường ghi, và
// hai handler Trial còn lại (`trial-notif`, `trial-schedule-notif`) đã theo khuôn này.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "@/lib/db";
import { on, type DomainEventLite } from "@/lib/events/registry";
import { notifyStaff } from "@/lib/notifications/notify";

const str = (v: unknown): string => (v == null ? "" : String(v));

export async function onTrialEvaluated(event: DomainEventLite): Promise<void> {
  const trialEnrollmentId = str(event.payload.trialEnrollmentId);
  if (!trialEnrollmentId) return;

  const enr = await db.trialEnrollment.findUnique({
    where: { id: trialEnrollmentId },
    select: {
      trialClassId: true,
      trialClass: { select: { name: true } },
      leadChild: {
        select: {
          fullName: true,
          leadId: true,
          // Lead đã xoá mềm thì không còn ai để chốt — bỏ qua, y như đường đọc
          // bảng Trial của site GV vẫn lọc.
          lead: { select: { assignedToId: true, adminId: true, deletedAt: true } },
        },
      },
    },
  });
  const lead = enr?.leadChild.lead;
  if (!lead || lead.deletedAt) return;

  const userId = lead.assignedToId ?? lead.adminId;
  if (!userId) return;

  const diem = event.payload.totalScore;
  const rank = str(event.payload.rank);
  // Điểm/xếp loại in thẳng vào tin: phần lớn lượt chốt chỉ cần con số này, không
  // phải mở phiếu. Thiếu dữ liệu thì bỏ mệnh đề chứ không in "undefined".
  const veDiem =
    typeof diem === "number" && rank
      ? ` Điểm ${diem}/8 — ${rank}.`
      : typeof diem === "number"
        ? ` Điểm ${diem}/8.`
        : "";

  await notifyStaff({
    userIds: [userId],
    // Khoá theo CẶP (ca, buổi): chấm lại cùng một buổi không đáng một tin nữa, còn
    // buổi thứ hai của cùng ca thì có. Cùng quy ước với khoá phiếu trong DB
    // (`trialEnrollmentId_trialClassSessionId`).
    dedupeKey: `trial.evaluated:${trialEnrollmentId}:${str(event.payload.trialClassSessionId)}`,
    category: "LEAD",
    title: "Giáo viên đã chấm phiếu trải nghiệm",
    body:
      `${enr.leadChild.fullName} (lớp ${enr.trialClass.name}) đã có phiếu đánh giá.` +
      `${veDiem} Mở lớp trải nghiệm để xem / xuất PDF.`,
    // Trang lớp trải nghiệm: mỗi dòng điểm danh có nút lấy phiếu. KHÔNG trỏ thẳng
    // vào route PDF — thông báo mà bấm vào là tải file thì không quay lại được.
    href: `/lop-trial/${enr.trialClassId}`,
    entityId: trialEnrollmentId,
  });
}

export function registerTrialEvalNotifHandlers(): void {
  on("trial.evaluated", onTrialEvaluated);
}
