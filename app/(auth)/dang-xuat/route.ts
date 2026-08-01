import { NextResponse, type NextRequest } from "next/server";
import { signOut } from "@/lib/auth";

export const dynamic = "force-dynamic";

// =============================================================================
// AUTH-SĐT P6 — lối thoát cho PHIÊN ĐÃ CHẾT.
//
// Bug tìm ra khi viết e2e [P6-C2] (có sẵn trước P6, không phải do P6 đẻ ra):
// bump `tokenVersion` — admin reset mật khẩu, hoặc chính chủ đặt lại mật khẩu ở
// thiết bị khác — làm người dùng rơi vào **vòng lặp redirect vô tận**, trình duyệt
// bó tay với `ERR_TOO_MANY_REDIRECTS`:
//
//   /dashboard → middleware thấy JWT còn hợp lệ (proxy.ts:146 `sessionValid =
//   Boolean(session?.user)`, KHÔNG biết tokenVersion vì không có DB) → cho qua
//   → layout admin đọc DB, thấy tokenVersion lệch → redirect /login
//   → middleware thấy vẫn còn JWT ⇒ "đã đăng nhập rồi" → đá về /dashboard → lặp.
//
// Mắt xích thiếu: KHÔNG ai xoá cookie. Route này làm đúng một việc đó — `signOut`
// dọn cookie (nó biết tên + domain cookie theo cấu hình, đừng tự xoá tay), rồi
// mới đưa về /login kèm lý do để form hiển thị thông báo.
// =============================================================================

const ALLOWED_REASONS = new Set(["session-invalidated", "session-disabled", "password-changed"]);

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("reason");
  // Chỉ nhận lý do trong danh sách trắng — tham số này chạy thẳng vào URL đích,
  // không để nó thành chỗ nhét nội dung tuỳ ý.
  const reason = raw && ALLOWED_REASONS.has(raw) ? raw : null;

  await signOut({ redirect: false });

  const to = new URL("/login", req.nextUrl.origin);
  if (reason) to.searchParams.set("reason", reason);
  return NextResponse.redirect(to, { status: 303 });
}
