import { NextResponse, type NextRequest } from "next/server";
import { auth, signOut } from "@/lib/auth";
import { checkSessionLiveness } from "@/lib/auth/live-session";
import { thuHoiMoiThietBiCuaNguoi } from "@/lib/push/thu-hoi";

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

  // ── THU HỒI ĐĂNG KÝ PUSH KHI TÀI KHOẢN ĐÃ CHẾT (US-14b Đợt 5) ─────────────────────────
  //
  // Vì sao cần ở ĐÂY: bốn layout (`admin`/`teacher`/`portal`/`sale`) `redirect` sang route này
  // khi đọc DB và thấy tài khoản bị xoá (`deletedAt`), bị vô hiệu hoá (`!isActive`), hoặc
  // `tokenVersion` lệch (đổi mật khẩu). Ba ca đó nửa client KHÔNG BAO GIỜ chạy được — trang đã
  // điều hướng — nên nếu không thu hồi ở đây thì đăng ký push của một nhân viên vừa rời công ty
  // còn sống trên MỌI máy của họ. Gỡ TẤT CẢ ở ca này là ĐÚNG, không quá tay.
  //
  // ⚠️⚠️ TUYỆT ĐỐI KHÔNG TIN `?reason=` LÀM BẰNG CHỨNG — bản đầu của Đợt 5 đã mắc đúng lỗi này
  // và lăng kính phản biện tìm ra. `reason` là THAM SỐ URL, ai cũng đặt được:
  //   · cookie phiên khai `sameSite: "lax"` (`lib/auth.ts`), nên một ĐIỀU HƯỚNG TOP-LEVEL — link
  //     trong tin nhắn, `window.open` — tới `/dang-xuat?reason=session-disabled` là mang cookie
  //     đi theo. Trước Đợt 5 hậu quả chỉ là "bị đăng xuất" (đăng nhập lại là xong); tin vào
  //     `reason` biến nó thành PHÁ TRẠNG THÁI LÂU DÀI: mất push trên mọi máy, phải đi bật tay
  //     từng cái mà không hiểu vì sao.
  //   · không cần kẻ tấn công: route `force-dynamic`, nên sau khi bị đá ra rồi đăng nhập lại,
  //     bấm Back hai nhịp là gọi lại GET này với cookie MỚI — tài khoản còn sống nguyên mà vẫn
  //     bị gỡ sạch thiết bị.
  //
  // Nên: HỎI DB. `checkSessionLiveness` là chính hàm mà ba trong bốn layout đang dùng, và nó
  // trả về đúng hai lý do của `LyDoThuHoiPush`. `reason` từ URL nay CHỈ còn dùng để hiện thông
  // báo ở `/login` (danh sách trắng bên trên), không quyết định gì.
  //
  // Cố ý KHÔNG gói trong `if (reason)`: bỏ điều kiện đó thì thêm một câu tra DB cho mỗi lượt ghé
  // route (route này chỉ được ghé bởi phiên đã chết + nút đăng xuất của site Sale — không phải
  // đường nóng), mà đóng thêm được đường `components/sale/sale-nav.tsx` vốn trỏ `/dang-xuat`
  // KHÔNG kèm reason.
  //
  // ⚠️ PHẢI đọc `auth()` TRƯỚC `signOut()`. Sau `signOut` cookie đã dọn, không còn cách nào biết
  // vừa thu hồi cho ai. Ở ba ca trên JWT vẫn hợp lệ (chỉ DB nói phiên đã chết, mà middleware
  // không đọc DB — xem khối chú thích trên), nên `auth()` vẫn trả về người dùng.
  //
  // `thuHoiMoiThietBiCuaNguoi` cam kết KHÔNG NÉM; `checkSessionLiveness` thì CÓ THỂ ném (nó tra
  // DB), nên bọc — route này tồn tại để CỨU người khỏi vòng lặp redirect, một lỗi lọt ra ngoài
  // sẽ giam họ lại trong đúng cái vòng lặp đó.
  const session = await auth();
  const userId = session?.user?.id;
  if (userId) {
    try {
      const song = await checkSessionLiveness(userId, session?.user?.tokenVersion);
      if (!song.live) {
        await thuHoiMoiThietBiCuaNguoi({ userId, lyDo: song.reason });
      }
    } catch (err) {
      console.warn("[push] không kiểm được tình trạng phiên khi đăng xuất — bỏ thu hồi:", err);
    }
  }

  await signOut({ redirect: false });

  const to = new URL("/login", req.nextUrl.origin);
  if (reason) to.searchParams.set("reason", reason);
  return NextResponse.redirect(to, { status: 303 });
}
