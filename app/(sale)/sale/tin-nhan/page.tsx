/**
 * Site Sale — màn "Tin nhắn" (hội thoại phụ huynh ↔ nhân viên).
 *
 * ── ĐÂY LÀ BẢN ĐÔI CỦA `app/(admin)/admin/tin-nhan/page.tsx` ───────────────
 * Trước 04/09/2026 tệp này chỉ MOUNT LẠI trang admin:
 *
 *     return <AdminMessagesPage searchParams={searchParams} />;
 *
 * Chốt 04/09/2026: màn site Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 PHẦN TÁCH DỪNG Ở TRANG. `<StaffChatWorkspace>` KHÔNG được nhân bản —
 *    và đây là một quyết định kỹ thuật, không phải một chỗ làm dở.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. **Nó không phải component của khu quản trị.** `components/chat/staff/*` là
 *    module chat DÙNG CHUNG, đã phục vụ CẢ site giáo viên
 *    (`app/(teacher)/teacher/tin-nhan/page.tsx`) trước khi site Sale có mặt.
 *    Nó cùng họ với `lib/chat/**` — thứ đợt này cấm đụng — chứ không cùng họ với
 *    `app/(admin)/**`. Chốt "Sale không dùng chung component với khu quản trị"
 *    không với tới nó, y như nó không với tới `components/ui/*`.
 *
 * 2. **Nhân bản là chép cả năm luật realtime, mà không chép được bộ test giữ
 *    chúng.** `docs/chat-realtime/00-dieu-chinh-cho-repo.md` §E-ter ghi bốn điểm
 *    mù đã phải ĐO THẬT mới thấy: cấm `setAuth` khi còn kênh `joined`; phải
 *    `await` vé trước khi join; phải tự cấp callback `accessToken` (thiếu là vé
 *    bị heartbeat ghi đè bằng anon key ⇒ **realtime chết vĩnh viễn** tới khi tải
 *    lại trang); kênh đã CLOSED không bao giờ tự hồi. Cả bốn đều XANH ở
 *    typecheck + lint + build + toàn bộ unit test khi hỏng. Một bản sao Sale sẽ
 *    ra đời KHÔNG có `use-chat-channel.test.ts` / `supabase-client.test.ts` canh
 *    — tức mất realtime một cách IM LẶNG: không lỗi, không dấu hiệu, giao diện
 *    vẫn trông bình thường.
 *
 * 3. **PII.** `chat-workspace` cố ý KHÔNG đưa `contact` (SĐT/email) của thành
 *    viên xuống payload RSC, và luật ẩn liên hệ nằm ở MỘT chỗ duy nhất
 *    (`hidesContactOf` trong `lib/chat/queries.ts`) đúng vì "hai chỗ lọc là hai
 *    chỗ trôi lệch". Một bản vẽ thứ hai là một chỗ nữa để rò.
 *
 * ⇒ Tách phần TRANG (cổng, dữ liệu chuẩn bị, câu chữ, đường dẫn gốc), giữ nguyên
 *   cỗ máy hội thoại. Đã báo lại chủ dự án để họ quyết có muốn đi xa hơn không.
 *
 * ── BA CHỖ TRANG NÀY KHÁC BẢN ADMIN, VÀ MỖI CHỖ SỬA MỘT LỖI THẬT ───────────
 *
 * 1. 🔴 `basePath="/sale/tin-nhan"`, KHÔNG PHẢI `"/tin-nhan"`.
 *    Bản admin đưa `basePath="/tin-nhan"` cho khung chat, và khung chat lấy nó
 *    dựng MỌI liên kết nội bộ: chọn hội thoại (`?c=`), tab Thành viên, tab Thông
 *    báo, "Xem thông báo cũ hơn", nút "← Về luồng hội thoại", `hrefTemplate` của
 *    "Nhắn riêng". Bản mount cũ chuyển nguyên chuỗi đó sang site Sale với lý lẽ
 *    "proxy sẽ viết lại". Lý lẽ đó ĐÚNG trên `sale.satarobo.vn` (nhánh host sale
 *    của `decideRoute` rewrite `/tin-nhan` → `/sale/tin-nhan`) và **SAI ở mọi
 *    host khác**: trên `localhost` và `test.satarobo.vn` — nơi bốn khu dùng chung
 *    một tên miền và không nhánh host nào chạy — `/tin-nhan` không khớp route nào
 *    (màn admin ở `/admin/tin-nhan`) ⇒ **404 trắng trơn ở mọi cú bấm**.
 *    Tức đúng môi trường dùng để nghiệm thu là môi trường màn này hỏng. Đường
 *    `/sale/tin-nhan` chạy ở CẢ HAI: host Sale cho `/sale/*` đi thẳng, host lạ
 *    khớp route thật.
 *
 * 2. **Bỏ phép so mã vai `laSaleThuan`.** Bản admin tính:
 *
 *        const vaiTro = [session.user.role, ...(session.user.roles ?? [])].filter(Boolean);
 *        const laSaleThuan = vaiTro.includes("SALES_CSM")
 *                         && vaiTro.every((r) => r === "SALES_CSM" || r === "PARENT");
 *
 *    Nó gộp CẢ `user.role` lẫn `user.roles`, ngược với `getEffectiveRoles` (hàm
 *    này bỏ qua `user.role` khi `roles` không rỗng). Hệ quả trên host Sale: một
 *    tư vấn viên có `roles: ["SALES_CSM"]` nhưng còn sót `role: "CENTER_MANAGER"`
 *    **được layout cho vào site** (`isSaleOnly` dùng đúng `getEffectiveRoles`)
 *    nhưng lại nhận câu gợi ý dành cho quản lý — nói về nhóm lớp tự sinh, không
 *    chỉ đường mở kênh riêng, tức hướng dẫn sai cho đúng người cần hướng dẫn.
 *    Không lỗi nào nổ. Đây đúng loại "vai qua cổng nhưng không khớp mã vai cũ".
 *    Trên site này phép so đó là thừa: `app/(sale)/sale/layout.tsx` chỉ cho Sale
 *    THUẦN vào, nên câu trả lời luôn là "đúng, Sale thuần". Nói thẳng.
 *
 * 3. **Câu gợi ý rỗng nói THẬT theo dữ liệu, không chỉ theo vai.** Câu của bản
 *    admin ("gõ tên phụ huynh vào ô tìm kiếm bên trái để mở kênh riêng") chỉ đúng
 *    khi người này CÓ phụ huynh được gán. Với tư vấn viên chưa có đăng ký nào
 *    đứng tên mình, `assignableParents` rỗng ⇒ ô tìm kiếm không bao giờ ra kết
 *    quả, và câu gợi ý biến thành một ngõ cụt. Giữ NGUYÊN VĂN câu cũ cho trường
 *    hợp nó đúng; thêm một câu thật cho trường hợp còn lại.
 *
 * ── CỔNG QUYỀN ──────────────────────────────────────────────────────────────
 * `chanNeuThieuQuyen("/sale/tin-nhan", …)` thay cho `redirect("/dashboard")` của
 * bản admin (`/dashboard` là 404 trên host Sale và trên mọi host không xác định —
 * `lib/sale/cong-trang.tsx`).
 *
 * ⚠️ CỔNG **KHÔNG** RỘNG HƠN MÀN — đã đối chiếu, và kết luận ngược với linh cảm:
 *      vào trang :  PAGE_GATES["/sale/tin-nhan"] = ["parent-requests:manage"]
 *      bản admin :  PAGE_GATES["/tin-nhan"]      = ["students:view-own-class",
 *                                                   "classes:view-own",
 *                                                   "parent-requests:manage"]   (phép HOẶC)
 *    Cổng Sale là TẬP CON của cổng admin, nên qua được cổng Sale là chắc chắn qua
 *    được cổng admin — gọi lại tầng hai không thêm được gì. KHÔNG gỡ bớt cổng
 *    Sale cho "khớp" bản admin: hai action kia là chìa của GV và Giáo vụ, thêm
 *    vào đây là mở cửa site Sale cho vai không thuộc site này.
 *
 * ⚠️ VÀ CỔNG NÀY KHÔNG PHẢI PHÉP KIỂM CUỐI. Phạm vi đọc chat là
 *    **participant-based**, không phải role-based: `listConversationsForUser` chỉ
 *    trả hội thoại mà chính người này còn là thành viên hiệu lực. Quyền gửi / gửi
 *    thông báo / gỡ tin được kiểm CÓ TARGET trong `chat-workspace` **và** lại một
 *    lần nữa trong từng Server Action. Cố ý KHÔNG gác trang bằng `chat:read`: dưới
 *    RBAC v2 (đang bật trên prod) Sale giữ `chat:read` scope OWN, mà `scopeMatches`
 *    đòi target ⇒ gọi trần trả FALSE và khoá cửa chính, trong khi máy dev (v1
 *    tĩnh) vẫn xanh — đúng dạng "chạy máy tôi thì được".
 *
 * 🔴 KHÔNG CÓ ĐƯỜNG GHI NÀO Ở TỆP NÀY. Mọi thao tác ghi của chat đi qua Server
 *    Action sẵn có; client chỉ ĐỌC realtime (luật cứng #1 của
 *    `docs/chat-realtime/00-dieu-chinh-cho-repo.md`).
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { StaffChatWorkspace } from "@/components/chat/staff/chat-workspace";
import { listAssignableParentsForSale } from "@/lib/chat/dm";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tin nhắn | Tư vấn tuyển sinh" };

/** Đường gốc của màn chat TRÊN SITE NÀY — xem ghi chú (1) ở đầu tệp. */
const DUONG_GOC = "/sale/tin-nhan";

export default async function SaleMessagesPage({
  searchParams,
}: {
  // Chữ ký phải khớp đúng bản admin: khung chat đọc `c` (hội thoại đang mở),
  // `tab` (thành viên / thông báo) và `ac` (con trỏ trang thông báo) từ địa chỉ.
  // Nuốt mất `searchParams` là bấm vào hội thoại nào cũng không mở ra hội thoại
  // đó, mà không lỗi nào nổ.
  searchParams: Promise<{ c?: string; tab?: string; ac?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=%2Fsale%2Ftin-nhan");

  const chan = await chanNeuThieuQuyen("/sale/tin-nhan", "Tin nhắn");
  if (chan) return chan;

  const [sp, phDuocGan] = await Promise.all([
    searchParams,
    // Phụ huynh mình đang phụ trách nhưng CHƯA có kênh riêng — nguồn của khối
    // "mở kênh mới" trong ô tìm kiếm. Gọi lại đúng hàm của `lib/chat/dm.ts`,
    // không chép: nó lọc theo `Enrollment.saleId` + trạng thái đăng ký còn hiệu
    // lực + tài khoản phụ huynh còn sống, và mỗi điều kiện đó là một chỗ để chép
    // sót. Trên site Sale mọi người dùng đều mở được kênh riêng (layout chỉ cho
    // Sale THUẦN vào), nên không cần rẽ nhánh theo vai như bản admin.
    listAssignableParentsForSale(session.user.id),
  ]);

  return (
    // Chat chiếm TRỌN chiều cao khả dụng — yêu cầu chủ dự án 10/08 ("bấm vào tin
    // nhắn thì cả màn hình là các cuộc hội thoại"). Vì thế trang này CỐ Ý không
    // có dải tiêu đề: khung chat tự tính `h-[calc(100vh-8rem)]`, thêm bất cứ thứ
    // gì phía trên là đẩy ô nhập tin ra khỏi tầm mắt trên máy tính xách tay.
    <div>
      <StaffChatWorkspace
        userId={session.user.id}
        basePath={DUONG_GOC}
        conversationId={sp.c}
        tab={sp.tab}
        announcementCursor={sp.ac}
        emptyHint={
          phDuocGan.length > 0
            ? "Chưa có hội thoại nào. Gõ tên phụ huynh hoặc tên học viên vào ô tìm kiếm bên trái để mở kênh riêng."
            : "Chưa có hội thoại nào, và bạn cũng chưa có phụ huynh nào để mở kênh. Kênh riêng chỉ mở được với phụ huynh của học viên đang có đăng ký đứng tên bạn — hãy chốt đăng ký cho khách của mình trước."
        }
        assignableParents={phDuocGan}
      />
    </div>
  );
}
