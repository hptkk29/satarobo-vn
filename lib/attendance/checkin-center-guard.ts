// lib/attendance/checkin-center-guard.ts — L0 0.3 (05/09/2026): gác chấm chéo cơ sở. THUẦN.
//
// Vì sao cần: `hr_attendance:checkin` seed GLOBAL cho mọi vai, mà `can()` GLOBAL bỏ qua
// target ⇒ nhân sự CS1 quét mã QR của CS2 vẫn ghi được `EmployeeCheckin(centerId=CS2)`.
// `Center ∈ SCOPE_EXEMPT` nên `scopedDb` cũng không chặn; geofence thì fail-open vì
// prod chưa cơ sở nào có toạ độ. Tức là hôm nay KHÔNG có kiểm vị trí nào cả.
//
// Đây là bản VÁ TẠM tới khi engine mới (kế hoạch v3.3 §4) ghi lượt kèm cờ
// `SAI_NOI_LAM` thay vì từ chối. Luật tạm — cố ý hẹp:
//   - HO-level (vai neo tại HO/ROOT): chấm mọi cơ sở (Q-04).
//   - Không suy được cơ sở của người dùng (chưa có UserOrgRole ⇒ visibleCenterIds rỗng):
//     KHÔNG chặn — chặn là tái diễn sự cố 07/08 (nhân sự thiếu UserOrgRole bị khoá
//     im lặng). Fail-open có chủ đích, có test khoá.
//   - Còn lại: mã QR phải thuộc một cơ sở người đó nhìn thấy (`visibleCenterIds`).
//
// Giới hạn đã biết (chấp nhận ở L0, gỡ ở L4): GV dạy thay ở cơ sở khác mà vai chỉ neo
// ở cơ sở nhà thì bị chặn — trước L0 GV thuần còn không chấm được ở đâu cả.

export type CheckinCenterActor = {
  isHoLevel: boolean;
  visibleCenterIds: readonly string[];
};

export type CheckinCenterDecision =
  | { ok: true; reason: "HO_LEVEL" | "UNKNOWN_SCOPE" | "VISIBLE" }
  | { ok: false; error: string };

export function decideCheckinCenter(
  actor: CheckinCenterActor,
  qrCenterId: string,
  qrCenterName?: string | null,
): CheckinCenterDecision {
  if (actor.isHoLevel) return { ok: true, reason: "HO_LEVEL" };
  if (actor.visibleCenterIds.length === 0) return { ok: true, reason: "UNKNOWN_SCOPE" };
  if (actor.visibleCenterIds.includes(qrCenterId)) return { ok: true, reason: "VISIBLE" };
  const name = qrCenterName?.trim() ? `cơ sở ${qrCenterName.trim()}` : "cơ sở khác";
  return {
    ok: false,
    error: `Mã QR này của ${name}. Bạn chỉ chấm công được tại cơ sở của mình — nếu đang làm việc ở đây theo phân công, báo Quản lý cơ sở xác nhận công.`,
  };
}
