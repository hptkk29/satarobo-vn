// lib/events/register.ts — A0-07: đăng ký handler 1 lần/process (idempotent).
// Nghiệp vụ thật thêm registerXxx() ở đây. Hiện chỉ demo.ping (A0 dựng cơ chế).
import { registerPingDemo } from "@/lib/events/_demo/ping-handlers";
import { registerLeadConvertedHandlers } from "@/lib/crm/_handlers/lead-converted";
import { registerR7NotificationHandlers } from "@/lib/_handlers/r7-notifications";
import { registerR7LifecycleHandlers } from "@/lib/_handlers/r7-lifecycle";

let registered = false;

export function ensureHandlersRegistered(): void {
  if (registered) return;
  registered = true;
  registerPingDemo();
  registerLeadConvertedHandlers(); // R2 C2.5 — gửi xác nhận đăng ký sau convert
  registerR7NotificationHandlers(); // R7-17 — payment.confirmed / class.session_changed / lead.trialAttended
  registerR7LifecycleHandlers(); // R7-07 — enrollment.assigned / session.taught
}
