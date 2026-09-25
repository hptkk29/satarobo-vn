// lib/agents/quan-tri/chung.ts — phần dùng chung của tầng quản trị Cổng dữ liệu agent.
//
// Tầng này ÉP LUẬT NGHIỆP VỤ (người duyệt ≠ người tạo, trần hạn, trạng thái hợp lệ, audit).
// Kiểm QUYỀN (`agent_gateway:manage` / `:approve`) và mã 2FA là việc của Server Action gọi
// nó — luật cứng #1 đòi `assertPermission` nằm ngay trong thân action (lint đọc AST).
import type { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit/audit-log";

export type NguoiThaoTac = { userId: string; ten: string };

export type MaLoiQuanTri =
  | "KHONG_TIM_THAY"
  | "SAI_TRANG_THAI"
  | "TU_DUYET"
  | "HAN_KHONG_HOP_LE"
  | "DU_LIEU_SAI"
  | "CHUA_CO_HOI_SO";

/** Lỗi nghiệp vụ có chủ đích — action dịch thành `{ ok: false, error }`. */
export class LoiQuanTri extends Error {
  constructor(
    readonly ma: MaLoiQuanTri,
    message: string,
  ) {
    super(message);
    this.name = "LoiQuanTri";
  }
}

export const NGAY_MS = 24 * 60 * 60 * 1000;
/** Trần hạn (spec §4.1, §5.2). */
export const HAN_TOI_DA = {
  clientNgay: 365,
  matKhauNgay: 90,
  grantDocNgay: 180,
  xemGocNgay: 30,
  chongLanXoayGio: 24,
} as const;

export function kiemHan(hetHan: Date, now: Date, toiDaNgay: number, ten: string): void {
  if (hetHan.getTime() <= now.getTime()) {
    throw new LoiQuanTri("HAN_KHONG_HOP_LE", `Hạn ${ten} phải sau hôm nay.`);
  }
  if (hetHan.getTime() > now.getTime() + toiDaNgay * NGAY_MS) {
    throw new LoiQuanTri("HAN_KHONG_HOP_LE", `Hạn ${ten} tối đa ${toiDaNgay} ngày.`);
  }
}

/**
 * Chặn TỰ DUYỆT (spec §5.3, ca B10) — "kể cả khi người đó có cả hai quyền". Đây là luật
 * nghiệp vụ trên từng đối tượng (người tạo của CHÍNH bản ghi này), không phải so vai.
 * Khuôn đã có ở `lib/elearning/training-need.ts` (`SELF_APPROVAL`).
 */
export function chanTuDuyet(nguoi: NguoiThaoTac, createdById: string): void {
  if (nguoi.userId === createdById) {
    throw new LoiQuanTri("TU_DUYET", "Người duyệt phải khác người tạo — nhờ người khác duyệt.");
  }
}

export async function ghiAudit(
  tx: Prisma.TransactionClient | undefined,
  nguoi: NguoiThaoTac,
  p: { entityType: string; entityId: string; action: string; newValues?: Record<string, unknown>; lyDo?: string },
): Promise<void> {
  await writeAudit({
    actor: { id: nguoi.userId, name: nguoi.ten },
    module: "agent-gateway",
    entityType: p.entityType,
    entityId: p.entityId,
    action: p.action,
    newValues: p.newValues ?? null,
    reason: p.lyDo,
    tx,
  });
}
