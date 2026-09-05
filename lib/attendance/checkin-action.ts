"use server";

// lib/attendance/checkin-action.ts — Server Action chấm công (L4, chấm công v3), DÙNG CHUNG cho
// admin `/cham-cong/checkin` và site GV `/teacher/cham-cong/checkin`.
//
// Luồng: màn hình quầy hiện QR XOAY (kiosk token 60s) → người quét mở trang check-in → trang xác
// minh token + cấp VÉ 120s (checkin-gate) → bấm Check-in/Check-out → action TIÊU VÉ NGUYÊN TỬ
// → ghi StaffTimeLog (Q-07: ghi luôn + cờ NGOAI_VUNG/THIEU_GPS/SAI_NOI_LAM/TRUNG/VUOT_TRAN) → xếp
// hàng tính lại bảng công ngày. Chỉ từ chối khi vé hỏng / hết hạn / đã dùng.
//
// Bảng cũ `EmployeeCheckin` KHÔNG còn được ghi từ đây (đóng băng, Pha B drop).
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { consumeTicket, recordRejectedLog, recordTimeLog } from "@/lib/cham-cong/timelog";

const schema = z.object({
  ticketId: z.string().min(1),
  nonce: z.string().min(1),
  type: z.enum(["CHECK_IN", "CHECK_OUT"]),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  accuracyMeters: z.number().optional().nullable(),
});

export type RecordCheckinInput = z.input<typeof schema>;
export type RecordCheckinResult = { ok: true; flags: string[]; warning?: string } | { ok: false; error: string };

const FLAG_TEXT: Record<string, string> = {
  NGOAI_VUNG: "ngoài bán kính cơ sở",
  THIEU_GPS: "không có định vị",
  CHUA_TOA_DO: "cơ sở chưa khai toạ độ",
  SAI_NOI_LAM: "khác nơi làm theo lịch",
  CHAM_NGOAI_LICH: "hôm nay bạn không có ca",
  TRUNG_2_PHUT: "bấm trùng",
  VUOT_TRAN: "quá số lượt trong ngày",
  GPS_KEM_CHINH_XAC: "định vị kém chính xác",
};

export async function recordCheckin(input: RecordCheckinInput): Promise<RecordCheckinResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  // Quyền self-action: GLOBAL cho mọi vai nhân sự (Q-12); nơi chấm không giới hạn — cờ SAI_NOI_LAM lo hậu kiểm.
  if (!(await checkPermission("hr_attendance:checkin", { centerId: null }))) return { ok: false, error: "Không có quyền chấm công" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const d = parsed.data;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = h.get("user-agent");

  const c = await consumeTicket({ ticketId: d.ticketId, nonce: d.nonce, userId: session.user.id });
  if (!c.ok) {
    await recordRejectedLog({ userId: session.user.id, workLocationId: null, direction: d.type, reason: c.reason, ip });
    return { ok: false, error: c.reason === "TICKET_EXPIRED" ? "Vé chấm công đã hết hạn (2 phút). Quét lại mã QR." : c.reason === "TICKET_REUSED" ? "Vé này đã dùng. Quét lại mã QR để chấm lượt mới." : "Vé chấm công không hợp lệ. Quét lại mã QR." };
  }
  const r = await recordTimeLog({
    userId: session.user.id,
    workLocationId: c.workLocationId,
    direction: d.type,
    latitude: d.latitude ?? null,
    longitude: d.longitude ?? null,
    accuracyMeters: d.accuracyMeters ?? null,
    ticketId: d.ticketId,
    ip,
    userAgent,
  });
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/cham-cong");
  const warn = r.flags.filter((f) => f !== "CHUA_TOA_DO").map((f) => FLAG_TEXT[f] ?? f);
  return { ok: true, flags: r.flags, warning: warn.length ? `Đã ghi, Quản lý sẽ rà: ${warn.join(", ")}.` : undefined };
}
