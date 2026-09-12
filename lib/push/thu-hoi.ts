import "server-only";

// lib/push/thu-hoi.ts — thu hồi đăng ký push PHÍA SERVER khi phiên kết thúc. Web Push Đợt 5.
//
// ── CA THẬT PHẢI ĐÓNG ───────────────────────────────────────────────────────────────────
// Service worker khoá theo ORIGIN, KHÔNG theo phiên đăng nhập. Máy lễ tân dùng chung, một hồ
// sơ Chrome: Sale A bật thông báo ⇒ dòng `(endpoint E, userId = A, ACTIVE)`. A đăng xuất, Sale B
// đăng nhập trên đúng hồ sơ đó. Đăng ký E vẫn sống và vẫn mang `userId = A`, nên mọi lead chia
// cho A từ đó nổ trên màn hình khoá của máy B đang cầm — kèm tên phụ huynh. B không có lý do
// nào để bấm "Bật thông báo" nên không có gì tự chữa.
//
// ── VÌ SAO PHẢI CÓ NỬA SERVER, KHÔNG CHỈ NỬA CLIENT ─────────────────────────────────────
// Nửa client (`lib/auth/logout-client.ts`) chỉ chạy khi người dùng CHỦ ĐỘNG bấm đăng xuất.
// Nhưng bốn layout (`admin`/`teacher`/`portal`/`sale`) còn tự `redirect("/dang-xuat?reason=…")`
// khi tài khoản bị XOÁ (`deletedAt`), bị VÔ HIỆU HOÁ (`!isActive`), hoặc `tokenVersion` lệch
// (đổi mật khẩu) — ba đường mà client tuyệt đối không chạy được gì. Đó cũng là ba ca NGUY HIỂM
// NHẤT: nhân viên vừa rời công ty mà đăng ký push của họ còn sống trên MỌI máy, và lưới thứ hai
// (chuyển chủ khi người mới đăng ký) cũng không với tới vì không ai bật thông báo trên máy đó.
//
// ⚠️ PHẠM VI hai hàm dưới đây CỐ Ý KHÁC NHAU, và đó là quyết định vận hành chứ không phải
// chuyện gọn gàng:
//  · người dùng TỰ bấm đăng xuất ⇒ chỉ gỡ ĐÚNG máy đang ngồi (nửa client, theo endpoint) —
//    gỡ hết là đăng xuất ở desktop công ty làm mất push trên điện thoại riêng, mà người ta
//    đăng xuất hằng ngày;
//  · server ĐÁ RA vì tài khoản chết ⇒ gỡ TẤT CẢ. Ở ca đó "gỡ hết" là ĐÚNG, không phải quá tay.

import { db } from "@/lib/db";

/** Lý do mà route `/dang-xuat` nhận — trùng `ALLOWED_REASONS` của route đó. */
export type LyDoThuHoiPush = "session-invalidated" | "session-disabled" | "password-changed";

const NHAN_LY_DO: Record<LyDoThuHoiPush, string> = {
  "session-invalidated": "Tài khoản bị xoá hoặc phiên bị vô hiệu hoá",
  "session-disabled": "Tài khoản bị vô hiệu hoá",
  "password-changed": "Đổi mật khẩu — mọi phiên bị đá",
};

/**
 * Thu hồi MỌI đăng ký còn sống của một người.
 *
 * @returns số dòng thật sự bị thu hồi (0 nếu người đó chưa bật thông báo ở đâu).
 *
 * ⚠️ KHÔNG BAO GIỜ NÉM. Hàm này nằm trên đường ĐĂNG XUẤT — mà route `/dang-xuat` tồn tại chính
 * để cứu người khỏi một phiên đã chết (nó vá vòng lặp `ERR_TOO_MANY_REDIRECTS`). Một lỗi ở đây
 * mà lọt ra ngoài sẽ giam người dùng lại trong đúng cái vòng lặp đó. Ca cụ thể đang chờ sẵn:
 * migration hai bảng push CHƯA chạy ở môi trường nào, nên Prisma ném P2021 ở mọi lượt gọi cho
 * tới lần merge đầu tiên. Nuốt lỗi + log là hành vi đúng: cùng lắm là push của một tài khoản đã
 * chết còn sống thêm một lúc, và push service sẽ trả 410 khi thiết bị thật gỡ ứng dụng.
 */
export async function thuHoiMoiThietBiCuaNguoi(params: {
  userId: string;
  lyDo: LyDoThuHoiPush;
  now?: Date;
}): Promise<number> {
  if (!params.userId) return 0;
  const now = params.now ?? new Date();
  try {
    const kq = await db.webPushSubscription.updateMany({
      // Chỉ đụng dòng đang `ACTIVE`: `REVOKED`/`EXPIRED` đã chốt, ghi lại là xoá mất mốc
      // `revokedAt` thật và lý do thật của lần thu hồi trước.
      where: { userId: params.userId, status: "ACTIVE" },
      data: {
        status: "REVOKED",
        revokedAt: now,
        revokedReason: NHAN_LY_DO[params.lyDo],
      },
    });
    return kq.count;
  } catch (err) {
    console.warn(
      `[push] không thu hồi được thiết bị lúc đăng xuất (${params.lyDo}) — phiên vẫn được dọn:`,
      err,
    );
    return 0;
  }
}
