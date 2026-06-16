// lib/events/register.ts — A0-07: đăng ký handler 1 lần/process (idempotent).
// Nghiệp vụ thật thêm registerXxx() ở đây. Hiện chỉ demo.ping (A0 dựng cơ chế).
import { registerPingDemo } from "@/lib/events/_demo/ping-handlers";
import { registerLeadConvertedHandlers } from "@/lib/crm/_handlers/lead-converted";
import { registerR7NotificationHandlers } from "@/lib/_handlers/r7-notifications";
import { registerR7LifecycleHandlers } from "@/lib/_handlers/r7-lifecycle";
import { registerReportCardHandlers } from "@/lib/_handlers/report-card";
import { registerHomeworkAssignHandlers } from "@/lib/events/handlers/homework-assign";
import { registerTrialNotifHandlers } from "@/lib/_handlers/trial-notif";
import { registerMakeupNotifHandlers } from "@/lib/_handlers/makeup-notif";
import { registerEvalNotifHandlers } from "@/lib/_handlers/eval-notif";
import { registerHomeworkNotifHandlers } from "@/lib/_handlers/homework-notif";
import { registerScormIngestHandlers } from "@/lib/events/handlers/scorm-ingest";

let registered = false;

export function ensureHandlersRegistered(): void {
  if (registered) return;
  registered = true;
  registerPingDemo();
  registerLeadConvertedHandlers(); // R2 C2.5 — gửi xác nhận đăng ký sau convert
  registerR7NotificationHandlers(); // R7-17 — payment.confirmed / class.session_changed / lead.trialAttended
  registerR7LifecycleHandlers(); // R7-07 — enrollment.assigned / session.taught
  registerReportCardHandlers(); // R7-15 — reportcard.published → thông báo PH
  registerHomeworkAssignHandlers(); // R7-14 — session.taught → auto-giao HomeworkAssignment
  registerTrialNotifHandlers(); // R7-17 — trial.assigned → báo Sale xếp lớp trải nghiệm
  registerMakeupNotifHandlers(); // R7-17 — makeup.requested / makeup.confirmed → thông báo HV
  registerEvalNotifHandlers(); // R7-17 — eval.opened → thông báo HV/PH đợt đánh giá/khảo sát
  registerHomeworkNotifHandlers(); // R7-17 — session.taught → thông báo "Bài tập mới" cho HV
  registerScormIngestHandlers(); // R7-11 — scorm.uploaded → giải nén + upload R2 + parse manifest → TESTING
}
