// lib/auth/menu-permissions.ts — tập action dùng để LỌC MENU, tính phía server.
//
// Vì sao tồn tại: `components/admin/sidebar.tsx` trước 10/07 lọc menu bằng `can(user, p)`
// — ma trận v1 TĨNH, luôn luôn. Còn `page.tsx` gác bằng `checkPermission()` — THEO CỜ
// `RBAC_V2_ENABLED`. Cờ OFF thì hai bên trùng nhau nên không ai thấy gì. Cờ ON thì chúng
// tách đôi ở mọi vai có v2 ≠ v1:
//   · CENTER_MANAGER mất 9 nhóm quyền ở v2 ⇒ menu v1 vẫn mời vào ⇒ 9 dead link.
//   · HO_MARKETING được `honors:settings` ở v2 ⇒ menu v1 vẫn giấu ⇒ trang mở mà không lối vào.
// Tức là bật cờ sẽ TỰ SINH lại đúng lớp lỗi mà `page-gates.ts` vừa diệt.
//
// Cách sửa: layout (server) hỏi CÙNG hàm quyết định mà cổng trang dùng
// (`evaluatePermission` + cờ), trả xuống sidebar một tập action đã chốt.
//
// Hai điều KHÔNG được làm ở đây, cố ý:
//  1. KHÔNG ghi shadow-diff. Menu không phải điểm cưỡng chế; ghi vào sẽ bơm ~120 dòng
//     RbacShadowDiff mỗi lần mở trang và dìm chết tín hiệu thật.
//  2. KHÔNG dùng logger mặc định. `decidePermission` mặc định `logger = console` và warn
//     mỗi lần v1≠v2 ⇒ ~120 lần warn/request. Truyền logger câm.
import { PERMISSIONS, type Action } from "@/lib/auth/permissions";
import { evaluatePermission } from "@/lib/auth/permission-eval";
import type { Actor } from "@/lib/auth/actor";
import type { ShadowLogger } from "@/lib/auth/shadow-compare";

/** Menu không log lệch — shadow chỉ đo ở điểm cưỡng chế (checkPermission). */
const SILENT: ShadowLogger = { warn: () => {} };

type MenuUser = Parameters<typeof evaluatePermission>[0]["sessionUser"];

/**
 * Mọi action user được phép, theo ĐÚNG hệ quyền mà cổng trang đang dùng.
 *
 * Đánh giá toàn bộ `PERMISSIONS` (~120 action) chứ không chỉ action có trong menu: rẻ
 * (thuần in-memory, không I/O) và tránh phải kéo cây menu vào server. Không rò rỉ gì —
 * trước đây client đã nhận cả ma trận v1 qua `can()` trong bundle sidebar.
 *
 * Action gọi TRẦN (không target): scope CENTER/CLASS/OWN ở v2 trả false — giống hệt cổng
 * trang, vốn cũng gọi trần. Nhờ vậy menu và cổng nói cùng một câu chuyện.
 */
export function grantedMenuActions(params: {
  sessionUser: MenuUser;
  actor: Actor | null;
  flagOn: boolean;
}): string[] {
  const out: string[] = [];
  for (const action of Object.keys(PERMISSIONS) as Action[]) {
    const ok = evaluatePermission({
      sessionUser: params.sessionUser,
      actor: params.actor,
      action,
      flagOn: params.flagOn,
      logger: SILENT,
    });
    if (ok) out.push(action);
  }
  return out;
}
