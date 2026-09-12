import { NextResponse, type NextRequest } from "next/server";
import { auth, signOut } from "@/lib/auth";
import { thuHoiMoiThietBiCuaNguoi, type LyDoThuHoiPush } from "@/lib/push/thu-hoi";

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

  // ── THU HỒI ĐĂNG KÝ PUSH — chỉ khi CÓ `reason` (US-14b Đợt 5).
  //
  // Có `reason` nghĩa là KHÔNG PHẢI người dùng tự bấm: một trong bốn layout vừa đọc DB và thấy
  // tài khoản bị xoá (`deletedAt`), bị vô hiệu hoá (`!isActive`), hoặc `tokenVersion` lệch (đổi
  // mật khẩu) rồi `redirect` sang đây. Ba ca đó là ba ca mà nửa client KHÔNG BAO GIỜ chạy được
  // — trang đã điều hướng — nên nếu không thu hồi ở đây thì đăng ký push của một nhân viên vừa
  // rời công ty còn sống trên MỌI máy của họ, và lưới thứ hai (chuyển chủ khi người mới bấm bật
  // thông báo) cũng không với tới vì chẳng ai bật thông báo trên máy đó nữa.
  //
  // Gỡ TẤT CẢ thiết bị ở đây là ĐÚNG, không quá tay: tài khoản đã chết thì không được nhận push
  // ở đâu cả. Ca người dùng TỰ bấm đăng xuất đi đường khác (`lib/auth/logout-client.ts`) và chỉ
  // gỡ đúng máy đang ngồi — gỡ hết ở đó mới là quá tay, vì người ta đăng xuất hằng ngày và sẽ
  // mất push trên điện thoại riêng.
  //
  // ⚠️ PHẢI đọc `auth()` TRƯỚC `signOut()`. Sau `signOut` thì cookie đã dọn và không còn cách
  // nào biết vừa thu hồi cho ai. Ở đúng ba ca này JWT vẫn còn hợp lệ (chỉ DB nói phiên đã chết,
  // mà middleware không đọc DB — xem khối chú thích trên), nên `auth()` vẫn trả về người dùng.
  //
  // `thuHoiMoiThietBiCuaNguoi` cam kết KHÔNG NÉM: route này tồn tại để CỨU người khỏi vòng lặp
  // redirect, một lỗi lọt ra ngoài sẽ giam họ lại trong đúng cái vòng lặp đó.
  if (reason) {
    const session = await auth();
    const userId = session?.user?.id;
    if (userId) {
      await thuHoiMoiThietBiCuaNguoi({ userId, lyDo: reason as LyDoThuHoiPush });
    }
  }

  await signOut({ redirect: false });

  const to = new URL("/login", req.nextUrl.origin);
  if (reason) to.searchParams.set("reason", reason);
  return NextResponse.redirect(to, { status: 303 });
}
