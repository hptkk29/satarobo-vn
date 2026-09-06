// lib/integrations/zalocrm/vai-tro.ts — ánh xạ vai Sata → vai ZaloCRM (S1 · QĐ Q12).
//
// Module THUẦN: không `server-only`, không `db`, không `process.env`. Nhờ vậy nó test
// được không cần DB và không cần fork chạy — mà đây đúng là thứ phải chắc chắn trước,
// vì nó quyết định người mở màn bước vào tổ chức bên kia với tư cách gì.
//
// 🔴 VÌ SAO LÀ MỘT BẢNG TRA, KHÔNG PHẢI `if` TRONG SERVER ACTION:
// luật cứng Nền Hệ thống #1 cấm viết điều kiện quyền (so `role`, so `centerId`) rải rác
// trong action/component — lint `no-inline-authz` chặn ở tầng action, và kỷ luật đó áp
// cho cả trang. Cổng "có được vào màn Zalo CRM không" là `zalocrm:use` qua `can()`; hàm
// dưới đây trả lời một câu KHÁC — "vào rồi thì bên kia gọi mình là gì" — nên nó là ánh
// xạ dữ liệu, không phải một cổng quyền thứ hai. Đừng dùng nó thay `can()`.

/** Vai của ZaloCRM mà Sata cấp được. */
export type VaiZaloCrm = "admin" | "member";

/**
 * Bảng ánh xạ, khai theo MÃ VAI.
 *
 * ⚠️ Ở đây có mặt CẢ HAI hệ tên vai đang chạy song song trong repo:
 *   · v1 — enum `Role` trên `User.role`/`User.roles[]` (`SALES_CSM`, `CENTER_MANAGER`…);
 *     đây là thứ chạy ở local/dev/CI.
 *   · v2 — `RoleDef.code` qua `UserOrgRole` (`CENTER_SALES_CSM`, `CENTER_CLASS_MANAGER`…);
 *     đây là thứ enforce trên PROD.
 * Khai thiếu một vế là lệch môi trường: Sale vào được ở máy mình mà bị từ chối trên prod
 * (hoặc ngược lại), và không tái hiện được — đúng loại lỗi CLAUDE.md cảnh báo.
 *
 * `CENTER_CLASS_MANAGER` (Giáo vụ) CHỈ tồn tại ở v2 — enum `Role` không có nó — nên ở
 * local vai này không ánh xạ được. Đó KHÔNG phải bug, cùng bản chất với ghi chú ở L2.
 *
 * Vai `owner` của fork cố ý KHÔNG có mặt: chủ tổ chức bên ZaloCRM (đổi cấu hình, xoá
 * org) do người vận hành tạo tay một lần, không cấp qua SSO.
 */
export const VAI_ZALOCRM: Readonly<Record<string, VaiZaloCrm>> = {
  // Quản trị tối cao + quản lý cơ sở + giáo vụ ⇒ đọc mọi hội thoại trong org của mình.
  SUPER_ADMIN: "admin",
  CENTER_MANAGER: "admin",
  CENTER_CLASS_MANAGER: "admin",
  // Tư vấn viên ⇒ chỉ nick của chính mình.
  SALES_CSM: "member", // v1
  CENTER_SALES_CSM: "member", // v2
};

/** Thứ tự ưu tiên khi một người giữ nhiều vai — vai rộng hơn đứng trước. */
const UU_TIEN: readonly VaiZaloCrm[] = ["admin", "member"];

/**
 * Vai ZaloCRM của một người, suy từ danh sách mã vai họ đang giữ.
 *
 * Trả `null` (fail-closed) khi không mã nào khớp — nơi gọi PHẢI hiểu là "không ký token",
 * không phải "cấp vai mặc định". Đây là hàng rào cuối: cổng `zalocrm:use` có thể được
 * cấp nhầm cho một vai lạ ở màn phân quyền, nhưng vé SSO vẫn không được ký.
 *
 * Kiêm nhiệm ⇒ vai RỘNG NHẤT thắng, không phải "vai đầu tiên khớp": lấy vai đầu tiên là
 * kết quả đổi theo thứ tự dòng `UserOrgRole` trong DB, tức cùng một người mở trang hai
 * lần có thể ra hai quyền khác nhau.
 */
export function vaiZaloCrm(maVai: readonly (string | null | undefined)[]): VaiZaloCrm | null {
  const co = new Set<VaiZaloCrm>();
  for (const ma of maVai) {
    const key = typeof ma === "string" ? ma.trim() : "";
    if (!key) continue;
    const vai = VAI_ZALOCRM[key];
    if (vai) co.add(vai);
  }
  return UU_TIEN.find((v) => co.has(v)) ?? null;
}

/**
 * Gom mã vai của một người từ CẢ HAI nguồn: phiên Auth.js (v1) và Actor dựng từ DB (v2).
 *
 * Vì sao phải gộp chứ không chọn một: `User.role` là vai GỐC lúc tạo tài khoản, còn vai
 * thực tế nâng/hạ bằng `UserOrgRole`. Đọc mỗi `session.user.role` thì một QLCS có tài
 * khoản gốc SALES_CSM sẽ bị cấp `member`; đọc mỗi `orgRoles` thì ở local (nhiều tài khoản
 * chưa có dòng `UserOrgRole` nào) không ai vào được.
 *
 * Mọi trường đều tuỳ chọn: ~35 chỗ trong repo dựng Actor bằng object literal thiếu field.
 */
export function maVaiCuaNguoiDung(input: {
  role?: string | null;
  roles?: readonly string[] | null;
  orgRoles?: readonly { roleCode: string }[] | null;
}): string[] {
  const ra = new Set<string>();
  if (typeof input.role === "string" && input.role.trim()) ra.add(input.role.trim());
  for (const r of input.roles ?? []) {
    if (typeof r === "string" && r.trim()) ra.add(r.trim());
  }
  for (const r of input.orgRoles ?? []) {
    if (typeof r?.roleCode === "string" && r.roleCode.trim()) ra.add(r.roleCode.trim());
  }
  return [...ra];
}
