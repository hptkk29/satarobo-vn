// lib/settings/quyen-co-so.ts — AI SỬA ĐƯỢC CẤU HÌNH CỦA CƠ SỞ NÀO. THUẦN, không DB.
//
// ─────────────────────────────────────────────────────────────────────────────
// VÌ SAO TÁCH RA MỘT TỆP RIÊNG
//
// Cùng một điều kiện đang có HAI BẢN chép tay trong `service.ts` (`setCenterSetting` và
// `clearCenterSetting`), và từ 24/09 màn Cấu hình vận hành cần bản THỨ BA để biết bày cơ sở
// nào ra. Ba bản của một luật quyền là ba chỗ để lệch.
//
// Và lệch ở đây KHÔNG kêu: màn bày thừa một cơ sở thì ô của cơ sở đó hiện ra mở, người dùng
// gõ số, bấm Lưu, rồi nhận "Không có quyền sửa cấu hình cơ sở này". Không lỗi nào báo trước
// đó — đúng lớp affordance nói dối của luật 12, chỉ người bấm mới biết.
//
// ⚠️ Tệp này KHÔNG `server-only`: nó phải test được mà không dựng DB, và nó không chạm DB.

/**
 * Vai được sửa cấu hình của một cơ sở.
 *
 * ⚠️ Trùng với `MANAGER_ROLE_CODES` cũ trong `service.ts` — tệp này nay là nhà của nó.
 * KHÔNG thêm vai vào đây mà không hỏi: đây là danh sách người được đổi tham số TIỀN của một
 * cơ sở (trần số đợt, trần ưu đãi, làm tròn, hạn QR).
 */
export const VAI_QUAN_LY_CO_SO: ReadonlySet<string> = new Set([
  "CENTER_MANAGER",
  "SUPER_ADMIN",
]);

/** Phần của `Actor` mà luật này cần — khai hẹp để test không phải dựng cả actor. */
export type ActorCoSo = {
  isSuperAdmin: boolean;
  orgRoles: readonly { orgUnitId: string; roleCode: string }[];
};

/**
 * Phạm vi cơ sở một người sửa được.
 *
 * `"TAT_CA"` là một GIÁ TRỊ, không phải mảng rỗng và cũng không phải `undefined` — hai thứ
 * đó đã gây lỗi thật ở repo này theo hai chiều ngược nhau (mảng rỗng đọc thành "không cơ sở
 * nào", `undefined` đọc thành "không lọc" tức mọi cơ sở). Kiểu liên hợp buộc chỗ dùng phải
 * xử lý cả hai nhánh, và `tsc` nói ngay nếu quên.
 */
export type PhamViCoSo = "TAT_CA" | readonly string[];

/**
 * Người này có sửa được cấu hình của ĐÚNG đơn vị này không.
 *
 * ⚠️ So khớp CHÍNH XÁC `orgUnitId`, KHÔNG theo cây con. Vai neo tại HO không kéo theo quyền
 * sửa cấu hình của từng cơ sở — đó là hành vi có sẵn của `setCenterSetting` từ R6-A, và đổi
 * nó là nới quyền, phải hỏi chứ không "dọn dẹp" tiện tay.
 */
export function laQuanLyCoSo(actor: ActorCoSo, orgUnitId: string): boolean {
  if (actor.isSuperAdmin) return true;
  return actor.orgRoles.some(
    (r) => r.orgUnitId === orgUnitId && VAI_QUAN_LY_CO_SO.has(r.roleCode),
  );
}

/**
 * Những cơ sở người này sửa được cấu hình.
 *
 * ⚠️ Trả `[]` khi không quản lý cơ sở nào — KHÔNG trả `"TAT_CA"`. Mặc định của SCOPE phải
 * fail-closed (luật đọc số 7): một lỗi ở đây mà rơi về "tất cả" là bày cấu hình mọi cơ sở
 * cho người không quản lý cơ sở nào, và nó trông y hệt lúc chạy đúng.
 */
export function coSoSuaDuoc(actor: ActorCoSo): PhamViCoSo {
  if (actor.isSuperAdmin) return "TAT_CA";
  return [
    ...new Set(
      actor.orgRoles.filter((r) => VAI_QUAN_LY_CO_SO.has(r.roleCode)).map((r) => r.orgUnitId),
    ),
  ];
}

/** Đơn vị này có nằm trong phạm vi không. */
export function trongPhamVi(pham: PhamViCoSo, orgUnitId: string): boolean {
  return pham === "TAT_CA" || pham.includes(orgUnitId);
}
