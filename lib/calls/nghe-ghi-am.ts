import "server-only";
import { z } from "zod";
import { scopedDb } from "@/lib/db-scope";
import { can } from "@/lib/auth/can";
import type { Actor } from "@/lib/auth/actor";
import { writeAudit } from "@/lib/audit/audit-log";
import { getSetting } from "@/lib/settings/service";
import { kyUrlNgheGhiAm, isCallRecordingBucketConfigured } from "@/lib/calls/kho-ghi-am";

// =============================================================================
// OC-3 / QT-36 / BM-1 — NGHE LẠI GHI ÂM.
//
// "Không bao giờ trả liên kết ghi âm THÔ ra trình duyệt." Mọi lượt nghe đi qua
// đúng chuỗi này, và THỨ TỰ là phần quan trọng nhất:
//
//   zod (thiếu/ngắn lý do → VALIDATION) → bản ghi tồn tại? → can("calls:listen-recording")
//   → **writeAudit** → mới ký URL.
//
// · `writeAudit` ném ⇒ trả `AUDIT_FAILED` và KHÔNG cấp URL. Không có nhánh "log
//   lỗi rồi vẫn trả": với QT-36 thì audit là ĐIỀU KIỆN, không phải hiệu ứng phụ.
//   Ghi vết SAU khi đã cấp URL nghĩa là một lần `writeAudit` hỏng = một lượt nghe
//   không để lại dấu, và đó đúng là lượt nghe cần dấu nhất.
// · Khuôn chép từ `lib/chat/admin.ts:498-580` — nơi đã làm đúng chuyện này.
// · Lý do lưu NGUYÊN VĂN vào `AuditLog.reason`. Dùng bảng `AuditLog` chung, KHÔNG
//   đẻ bảng nhật ký thứ 14.
//
// ⚠️ Quyền là `calls:listen-recording` — key RIÊNG, KHÔNG mặc định cho Sale (BM-2).
//   Và thiết kế bằng ALLOW: `can()` v2 KHÔNG có nhánh DENY, một grant DENY bị bỏ
//   qua IM LẶNG. Muốn chặn ai thì gỡ `UserOrgRole`/`RolePermission`, đừng cấp DENY.
// =============================================================================

export const ngheGhiAmSchema = z.object({
  callLogId: z.string().min(1, "Thiếu mã cuộc gọi"),
  reason: z
    .string()
    .trim()
    .min(10, "Phải ghi lý do nghe lại ghi âm (ít nhất 10 ký tự)")
    .max(500, "Lý do quá dài"),
});

export type VeNgheGhiAm = {
  url: string;
  hetHanLuc: Date;
  auditLogId: string;
  callLogId: string;
};

export type NgheGhiAmKetQua =
  | { ok: true; data: VeNgheGhiAm }
  | { ok: false; ma: string; thongDiep: string; field?: string };

function that(ma: string, thongDiep: string, field?: string): NgheGhiAmKetQua {
  return { ok: false, ma, thongDiep, field };
}

export async function capVeNgheGhiAm(
  actor: Actor,
  actorName: string,
  rawInput: unknown,
): Promise<NgheGhiAmKetQua> {
  const parsed = ngheGhiAmSchema.safeParse(rawInput);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return that("VALIDATION", issue?.message ?? "Dữ liệu không hợp lệ", issue?.path.join("."));
  }
  const input = parsed.data;

  // Cách ly cơ sở đi qua `scopedDb` — đường đã được chứng minh. `findUnique` ở đây
  // lọc hậu kỳ bằng `passesScope`, nên cuộc gọi của cơ sở khác trả `null` (chống
  // IDOR) chứ không "tìm thấy rồi mới từ chối".
  //
  // ⚠️ Vì sao KHÔNG siết bằng `scopeType: CENTER` trong RoleDef: `can()` v2 trả
  // FALSE khi scope CENTER mà call-site không truyền target, và bài học đã trả giá
  // (ghi trong `lib/auth/page-gates.ts`) là kiểu siết đó khoá luôn cửa của chính
  // QLCS trên prod trong khi máy dev chạy v1 vẫn xanh. Quyền để GLOBAL, cách ly để
  // scopedDb — đúng doctrine `prisma/seed-roles.ts` đã ghi.
  const sdb = scopedDb(actor);
  const cuocGoi = await sdb.callLog.findUnique({
    where: { id: input.callLogId },
    select: {
      id: true,
      centerId: true,
      orgUnitId: true,
      userId: true,
      hasRecording: true,
      recordingKey: true,
      recordingNotice: true,
      leadId: true,
      startedAt: true,
    },
  });
  if (!cuocGoi) return that("CALL_NOT_FOUND", "Không tìm thấy cuộc gọi này.");

  // ⚠️ OC-7 — `scopedDb` lọc `centerId`, KHÔNG lọc `orgUnitId`. Vẫn truyền cả hai
  // vào target để khi P4 bật cutover (`orgScopeCutover`) thì nhánh đó có dữ liệu,
  // không phải sửa lại call-site.
  const target = {
    centerId: cuocGoi.centerId ?? undefined,
    orgUnitId: cuocGoi.orgUnitId ?? undefined,
    createdById: cuocGoi.userId ?? undefined,
  };
  if (!can(actor, "calls:listen-recording", target)) {
    return that("PERMISSION_DENIED", "Không có quyền nghe lại ghi âm cuộc gọi.");
  }

  if (!cuocGoi.hasRecording || !cuocGoi.recordingKey) {
    // `REFUSED` là trạng thái HỢP LỆ (khách từ chối ghi âm — OC-6), không phải lỗi
    // dữ liệu. Nói rõ để người dùng không đi báo hỏng.
    return cuocGoi.recordingNotice === "REFUSED"
      ? that("RECORDING_REFUSED", "Khách đã từ chối ghi âm nên cuộc gọi này không có bản ghi.")
      : that("RECORDING_NOT_FOUND", "Cuộc gọi này không có tệp ghi âm.");
  }

  if (!isCallRecordingBucketConfigured()) {
    return that(
      "STORAGE_NOT_CONFIGURED",
      "Kho ghi âm chưa được cấu hình (cần bucket R2 riêng). Liên hệ quản trị hệ thống.",
    );
  }

  // ── Ghi vết TRƯỚC, cấp URL SAU ─────────────────────────────────────────
  let auditLogId: string;
  try {
    const log = await writeAudit({
      actor: { id: actor.userId, name: actorName },
      module: "calls",
      entityType: "CallLog",
      entityId: cuocGoi.id,
      action: "LISTEN_RECORDING",
      // KHÔNG chép nội dung/khoá tệp vào audit. Chỉ đủ trả lời "ai / khi nào /
      // cuộc gọi nào / lý do" — nhật ký không phải bản sao của kho.
      newValues: {
        callStartedAt: cuocGoi.startedAt,
        leadId: cuocGoi.leadId,
        centerId: cuocGoi.centerId,
      },
      reason: input.reason, // NGUYÊN VĂN
      orgUnitId: cuocGoi.orgUnitId,
    });
    auditLogId = log.id;
  } catch (err) {
    console.error("[calls] KHÔNG ghi được AuditLog — từ chối cấp liên kết nghe:", err);
    return that(
      "AUDIT_FAILED",
      "Không ghi được nhật ký nên chưa mở được bản ghi âm. Vui lòng thử lại.",
    );
  }

  const ttl = await docTtl();
  const url = await kyUrlNgheGhiAm(cuocGoi.recordingKey, ttl);

  return {
    ok: true,
    data: {
      url,
      hetHanLuc: new Date(Date.now() + ttl * 1000),
      auditLogId,
      callLogId: cuocGoi.id,
    },
  };
}

/** TTL của liên kết nghe. Lỗi đọc setting ⇒ dùng mặc định NGẮN, không dùng dài. */
async function docTtl(): Promise<number> {
  const v = await getSetting("calls.listenUrlTtlSeconds").catch(() => 600);
  return typeof v === "number" && v > 0 ? v : 600;
}
