// lib/leads/set-status.ts — GĐ1. CỬA DUY NHẤT để đổi `Lead.status`.
//
// Vì sao phải có cửa: trước GĐ1 trạng thái lead bị ghi từ bảy chỗ không đi qua đâu
// cả. Hai trong số đó (module học thử) đổi trạng thái mà KHÔNG để lại vết nào — đúng
// đường có lưu lượng cao nhất. Hệ quả là lịch sử khuyết ở chỗ đông nhất, và mọi báo
// cáo tỷ lệ chuyển đổi phải suy ngược từ trạng thái HIỆN TẠI (lead đã rớt thì biến
// mất khỏi mọi bậc, mẫu số các bậc đầu bị thiếu).
//
// Hàm này KHÔNG kiểm quyền. Quyền là việc của call-site (`can()` / `checkPermission`)
// vì mỗi đường vào có ngữ cảnh khác nhau — cửa này chỉ lo ghi cho đúng và đủ.
import type { LeadStatus, Prisma } from "@prisma/client";
import { LEAD_DROP_STATUSES } from "@/lib/leads/status";
import { recordLeadStatusChange as ghiVetNguoiDoc } from "@/lib/lead/status-trail-write";
import type { LeadStatusTrailSource } from "@/lib/lead/status-trail";

/**
 * HAI SỔ, MỘT CỬA — vì sao file này gọi sang `lib/lead/status-trail-write`.
 *
 * Hai nhánh làm song song cùng dựng "đường ghi duy nhất" cho trạng thái lead, khác cơ chế:
 *   • C-07 (`status-trail-write`) ghi VẾT NGƯỜI ĐỌC: `AuditLog` + `LeadActivity` +
 *     bump `Lead.lastActivityAt`. Có màn đọc thật — mục "Lịch sử thay đổi" ở trang
 *     chi tiết lead, thứ QLCS xem hằng ngày.
 *   • GĐ1 (file này) ghi SỔ ĐẾM: `LeadStatusHistory` — có cấu trúc (from/to/source/
 *     centerId/orgUnitId) để tính tỷ lệ chuyển đổi theo BẬC, kể cả lead đã rụng.
 *
 * Chúng BÙ nhau, không thay nhau: sổ đếm không hiển thị được cho người đọc, còn
 * `AuditLog` không đếm phễu được (dữ liệu nằm trong JSON, không index theo bậc).
 * Nhưng hai "cửa duy nhất" thì không còn cửa nào duy nhất — nên cửa là hàm này, và
 * nó gọi sang bên kia. ⚠️ Chỗ gọi KHÔNG được tự ghi `LeadActivity` nữa: bên kia ghi rồi.
 */
const NGUON_SANG_VET: Record<LeadStatusSource, LeadStatusTrailSource> = {
  admin: "MANUAL",
  assign: "ASSIGN",
  // Chia tự động vẫn là "khi chia/gán lead" dưới mắt người đọc — họ không cần biết
  // tay hay máy, cột người thực hiện đã nói điều đó.
  "auto-assign": "ASSIGN",
  trial: "TRIAL",
  payment: "PAYMENT",
  convert: "CONVERT",
  import: "IMPORT",
  // Bàn giao là một dạng đổi người phụ trách — cùng nhóm với gán.
  handover: "ASSIGN",
};

/** Đường nào đổi trạng thái. Dùng để tách số liệu người làm và máy chạy. */
export type LeadStatusSource =
  | "admin" // người dùng bấm ở màn lead
  | "assign" // gán tay cho sale
  | "auto-assign" // chia tự động
  | "trial" // tiến độ điểm danh học thử
  | "payment" // webhook/ghi nhận tiền
  | "convert" // chốt lead thành học viên
  | "import" // nhập từ tệp
  | "handover"; // bàn giao khi sale nghỉ

export type SetLeadStatusParams = {
  tx: Prisma.TransactionClient;
  leadId: string;
  /** Trạng thái muốn chuyển sang. */
  to: LeadStatus;
  source: LeadStatusSource;
  actorId?: string | null;
  actorName?: string | null;
  /** Lý do — bắt buộc về mặt nghiệp vụ khi lead rơi khỏi phễu, nhưng KHÔNG ép ở đây. */
  reason?: string | null;
};

export type SetLeadStatusResult =
  /** Đã đổi thật và đã ghi một dòng sổ. */
  | { changed: true; from: LeadStatus; to: LeadStatus }
  /** Không đổi gì (trạng thái đã đúng, hoặc lead không tồn tại). */
  | { changed: false; reason: "KHONG_DOI" | "KHONG_THAY_LEAD" };

// Trạng thái coi là "rơi khỏi phễu" — khi vào đây thì ghi lại BẬC TRƯỚC ĐÓ vào
// `Lead.droppedAtStage`, nếu không thì mất luôn thông tin rơi ở đâu.
//
// Lấy từ `@/lib/leads/status` chứ KHÔNG chép tay: tầng giao diện dùng đúng tập này
// để quyết định có bắt nhập lý do hay không. Hai bản sao lệch nhau nghĩa là có bậc
// bị ghi `droppedAtStage` mà không ai hỏi lý do, hoặc ngược lại — hỏi lý do rồi vứt.

/**
 * Đổi trạng thái lead và ghi sổ trong CÙNG một giao dịch.
 *
 * Idempotent: gọi lại với cùng trạng thái thì không ghi thêm dòng sổ nào. Đây là
 * tính chất bắt buộc — module học thử gọi lại mỗi lần điểm danh, không có nó thì
 * sổ đầy dòng rác và tỷ lệ chuyển đổi bị thổi lên.
 */
export async function setLeadStatus(
  params: SetLeadStatusParams,
): Promise<SetLeadStatusResult> {
  const { tx, leadId, to, source } = params;

  // Luôn đọc một lượt: một lần findUnique theo khoá chính trong transaction là không
  // đáng kể, và nó loại hẳn khả năng call-site "khai" nhầm trạng thái hiện tại.
  const lead = await tx.lead.findUnique({
    where: { id: leadId },
    select: { status: true, centerId: true, orgUnitId: true },
  });
  if (!lead) return { changed: false, reason: "KHONG_THAY_LEAD" };
  if (lead.status === to) return { changed: false, reason: "KHONG_DOI" };

  // Chốt bậc CŨ ngay bây giờ. Đọc `lead.status` sau lệnh update là dựa vào việc
  // Prisma trả về object rời không bị lệnh sau ghi đè — đúng trong thực tế nhưng là
  // may, và bộ test với tx giả bắt được ngay.
  const from = lead.status;
  const centerId = lead.centerId;
  // Chép thẳng orgUnitId của lead, KHÔNG tra ngược từ centerId: hàm tra dùng `db`
  // toàn cục nên sẽ THOÁT khỏi transaction đang chạy. Lead nào lệch hai cột là việc
  // của cron đối soát đêm /api/cron/orgunit-drift, không phải việc của cửa ghi này.
  const orgUnitId = lead.orgUnitId;

  const now = new Date();
  const roi = LEAD_DROP_STATUSES.includes(to);
  // Lý do rớt: CHỈ ghi khi lượt này thật sự mang lý do.
  //
  // 27/08 — gộp hai cột lý do rớt về `Lead.lostNote` (bỏ `Lead.dropReason`). Bản cũ
  // ghi `dropReason: params.reason ?? null`, tức lượt không kèm lý do thì xoá trắng
  // cột. Với `dropReason` việc đó vô hại vì không ai khác ghi vào đó. `lostNote` thì
  // KHÁC: `markLeadChildLostAction` dùng chính cột này để giữ lý do rớt của TỪNG CON.
  // Bê nguyên nếp cũ sang là mỗi lượt đổi trạng thái không kèm lý do — điểm danh học
  // thử, nhập tệp, cron — sẽ xoá lý do những đứa con đã đánh dấu trước đó.
  const lyDoRoi = roi ? (params.reason?.trim() || null) : null;

  await tx.lead.update({
    where: { id: leadId },
    data: {
      status: to,
      statusChangedAt: now,
      // Chỉ ghi bậc rơi khi ĐANG rơi. Lead quay lại phễu thì giữ nguyên bậc rơi cũ
      // để còn đếm được "đã từng rơi ở đâu"; xoá đi là mất số liệu cứu lead.
      ...(roi ? { droppedAtStage: from } : {}),
      ...(lyDoRoi ? { lostNote: lyDoRoi, lostAt: now } : {}),
    },
  });

  await tx.leadStatusHistory.create({
    data: {
      leadId,
      fromStatus: from,
      toStatus: to,
      changedById: params.actorId ?? null,
      changedByName: params.actorName ?? null,
      source,
      reason: params.reason ?? null,
      centerId,
      orgUnitId,
    },
  });

  // Vết cho NGƯỜI ĐỌC (AuditLog + LeadActivity + lastActivityAt) — xem NGUON_SANG_VET.
  await ghiVetNguoiDoc({
    tx,
    leadId,
    actorId: params.actorId ?? null,
    actorName: params.actorName ?? "Hệ thống",
    from,
    to,
    source: NGUON_SANG_VET[source],
    reason: params.reason ?? null,
  });

  return { changed: true, from, to };
}

/**
 * Chỉ GHI SỔ cho một lượt đổi trạng thái đã xảy ra ở nơi khác.
 *
 * Dùng cho hai chỗ CỐ Ý không đi qua `setLeadStatus`: nhận tiền và chốt convert.
 * Hai chỗ đó đổi trạng thái bằng `updateMany` kèm điều kiện lọc — một lệnh SQL duy
 * nhất, nên hai lượt chạy song song thì chỉ một lượt thắng. Thay bằng đọc-rồi-ghi là
 * mở lại đúng cái đua mà `updateMany` sinh ra để chặn (Prisma mặc định READ COMMITTED,
 * transaction KHÔNG cứu được). Vì vậy giữ nguyên cách ghi, chỉ nối thêm sổ.
 *
 * ⚠️ KHÁC `setLeadStatus`: hàm này CHỈ ghi sổ đếm, KHÔNG ghi vết người đọc. Hai chỗ
 * dùng nó (`payment.ts`, `convert-lead-v2.ts`) tự gọi `recordLeadStatusChange` của
 * `lib/lead/status-trail-write` vì chúng còn kèm ô phụ riêng (mã đơn, mã học viên,
 * cờ `auditAlreadyWritten`) mà cửa chung không biết. Bỏ một trong hai lời gọi là mất
 * đúng một nửa dấu vết — nửa nào thì tuỳ chỗ bỏ, và không ai báo.
 */
export async function recordLeadStatusLedger(params: {
  tx: Prisma.TransactionClient;
  leadId: string;
  from: LeadStatus | null;
  to: LeadStatus;
  source: LeadStatusSource;
  actorId?: string | null;
  actorName?: string | null;
  reason?: string | null;
}): Promise<void> {
  const { tx, leadId } = params;
  const lead = await tx.lead.findUnique({
    where: { id: leadId },
    select: { centerId: true, orgUnitId: true },
  });
  const centerId = lead?.centerId ?? null;
  // Cùng lý do như trên: không tra ngược orgUnitId ở đây.
  const orgUnitId = lead?.orgUnitId ?? null;

  await tx.lead.update({
    where: { id: leadId },
    data: { statusChangedAt: new Date() },
  });
  await tx.leadStatusHistory.create({
    data: {
      leadId,
      fromStatus: params.from,
      toStatus: params.to,
      changedById: params.actorId ?? null,
      changedByName: params.actorName ?? null,
      source: params.source,
      reason: params.reason ?? null,
      centerId,
      orgUnitId,
    },
  });
}
