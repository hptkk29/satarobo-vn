"use server";

// Đăng ký / gỡ THIẾT BỊ nhận thông báo đẩy — Web Push Đợt 3.
//
// Đặt cạnh `settings/actions.ts` và site giáo viên import sang, đúng tiền lệ đã có:
// `app/(teacher)/teacher/ho-so/_components/change-password-dialog.tsx` import `changePassword`
// từ chính thư mục này. Hai màn, một đường ghi.
//
// ⚠️ BA THỨ KHÔNG BAO GIỜ NHẬN TỪ CLIENT:
//   · `userId`     — lấy từ phiên. Nhận từ client là cho phép bất kỳ ai gắn thiết bị của mình
//                    vào tài khoản người khác rồi đọc trộm mọi thông báo của họ.
//   · `origin`     — suy từ header request. Client tự khai thì cột đó thành lời kể, không còn
//                    là số đo.
//   · `vapidKeyId` — suy từ chính khoá server đang dùng. Client không có cách nào biết đúng, và
//                    cột này sinh ra để phân biệt "khoá đã xoay" với "người dùng gỡ quyền".
//
// ⚠️ CHỈ GHI TỪ `parsed.data`. `webPushSubscriptionSchema` là `z.object` chế độ STRIP — nó BỎ
// khoá lạ chứ KHÔNG TỪ CHỐI, nên ghi từ input thô là mọi khoá lạ đi thẳng vào Prisma.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { hasStaffRole } from "@/lib/auth/permissions";
import { webPushSubscriptionSchema } from "@/lib/push/subscription";
import { vapidKeyIdTuKhoa } from "@/lib/push/vapid";
import { originTuHeaders } from "@/lib/push/origin";

export interface KetQuaThietBi {
  ok: boolean;
  error?: string;
}

/**
 * Chế độ hiển thị lúc đăng ký. Danh sách đóng theo spec `display-mode` của CSS — nhận chuỗi tự
 * do là mở một ô để client nhồi bất cứ gì vào cột dùng để CHẨN ĐOÁN.
 */
const displayModeSchema = z.enum([
  "standalone",
  "browser",
  "minimal-ui",
  "fullscreen",
  "window-controls-overlay",
]);

const dangKySchema = z.object({
  subscription: webPushSubscriptionSchema,
  /** Cắt ngắn: một số trình duyệt trả chuỗi rất dài, và cột này chỉ để người trực nhìn. */
  userAgent: z.string().trim().max(500).optional(),
  deviceLabel: z.string().trim().max(100).optional(),
  displayMode: displayModeSchema.optional(),
});

const huyTheoIdSchema = z.object({ id: z.string().min(1) });
const huyTheoEndpointSchema = z.object({ endpoint: z.string().min(1) });

/** Ai được đăng ký thiết bị: nhân viên đã đăng nhập. Phụ huynh KHÔNG — phạm vi đã chốt. */
async function nhanSuDangNhap(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Chưa đăng nhập" };
  // Không tạo permission key mới: đây là thao tác TỰ PHỤC VỤ trên chính tài khoản mình, cùng
  // hạng với đổi mật khẩu. Thêm key mới sẽ kéo theo sửa 4 nơi + bấm tay `seed-prod-roles.yml`
  // trên prod, đổi lấy một lớp gác không quyết định gì thêm.
  if (!hasStaffRole(session.user)) return { ok: false, error: "Không có quyền" };
  return { ok: true, userId: session.user.id };
}

/**
 * Ghi/đè đăng ký của MỘT thiết bị.
 *
 * UPSERT theo `endpoint` chứ không theo `(userId, endpoint)`: trình duyệt cấp lại đúng endpoint
 * cũ cho cùng máy + cùng khoá VAPID, và một máy DÙNG CHUNG có thể đổi người đăng nhập. Ghi đè
 * `userId` trong nhánh `update` là CÓ CHỦ ĐÍCH — nếu không, thông báo của người trước vẫn bắn
 * vào máy người sau đang cầm.
 */
// TỰ PHỤC VỤ: thao tác chỉ đụng thiết bị của CHÍNH người đang đăng nhập, cùng hạng với đổi
// mật khẩu. Cổng là `nhanSuDangNhap()` (phiên + hasStaffRole) và `userId` của phiên nằm trong
// MỌI câu ghi. KHÔNG tạo permission key riêng: nó không quyết định gì thêm mà kéo theo sửa 4
// nơi + bấm tay `seed-prod-roles.yml` trên prod.
//
// ⚠️ Dòng miễn trừ phải nằm NGAY TRƯỚC `export` — chèn chú thích xen vào giữa là nó vô hiệu,
// và ESLint chỉ báo "Unused eslint-disable directive" chứ không nói rule kia vẫn đang đỏ.
// eslint-disable-next-line authz/require-can-in-write-action
export async function dangKyThietBiAction(input: unknown): Promise<KetQuaThietBi> {
  const ai = await nhanSuDangNhap();
  if (!ai.ok) return { ok: false, error: ai.error };

  const parsed = dangKySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const { subscription, userAgent, deviceLabel, displayMode } = parsed.data;

  const origin = originTuHeaders(await headers());
  if (!origin) return { ok: false, error: "Không xác định được địa chỉ trang — thử tải lại." };

  const khoaCongKhai = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!khoaCongKhai) {
    // Nói thẳng thay vì ghi một dòng vô dụng: thiếu khoá thì đăng ký này không bao giờ nhận
    // được gì, và người vận hành cần biết ngay chứ không phải vào Đợt 4 mới phát hiện.
    return { ok: false, error: "Hệ thống chưa cấu hình khoá thông báo (VAPID)." };
  }
  const vapidKeyId = vapidKeyIdTuKhoa(khoaCongKhai);

  const sdb = scopedDb(await resolveActor(ai.userId));
  const now = new Date();
  const chung = {
    userId: ai.userId,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    origin,
    vapidKeyId,
    userAgent: userAgent ?? null,
    deviceLabel: deviceLabel || null,
    displayMode: displayMode ?? null,
    status: "ACTIVE" as const,
    lastSeenAt: now,
  };

  await sdb.webPushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: { endpoint: subscription.endpoint, ...chung },
    // Hồi sinh một dòng đã REVOKED/EXPIRED: dọn sạch vết hỏng cũ, nếu không thì engine Đợt 4
    // đọc `failureCount` của lần trước và bỏ qua một thiết bị vừa được bật lại.
    update: { ...chung, revokedAt: null, revokedReason: null, failureCount: 0, lastErrorCode: null },
  });

  // Hai màn dùng chung component này — phải làm mới CẢ HAI, nếu không người dùng bật xong
  // vẫn thấy "Chưa có thiết bị nào" ngay cạnh dòng chữ "Đã bật".
  revalidatePath("/settings");
  revalidatePath("/teacher/ho-so");
  return { ok: true };
}

/**
 * Gỡ một thiết bị khỏi danh sách của CHÍNH MÌNH.
 *
 * `updateMany` với `userId` NẰM TRONG `where` là chốt chống IDOR: `scopedDb` không che đường
 * GHI, nên nếu chỉ lọc theo `id` thì ai biết id là gỡ được thiết bị của người khác. Và bảng này
 * không có cột đơn vị nên cũng không có lưới nào khác đỡ hộ.
 */
// TỰ PHỤC VỤ: thao tác chỉ đụng thiết bị của CHÍNH người đang đăng nhập, cùng hạng với đổi
// mật khẩu. Cổng là `nhanSuDangNhap()` (phiên + hasStaffRole) và `userId` của phiên nằm trong
// MỌI câu ghi. KHÔNG tạo permission key riêng: nó không quyết định gì thêm mà kéo theo sửa 4
// nơi + bấm tay `seed-prod-roles.yml` trên prod.
//
// ⚠️ Dòng miễn trừ phải nằm NGAY TRƯỚC `export` — chèn chú thích xen vào giữa là nó vô hiệu,
// và ESLint chỉ báo "Unused eslint-disable directive" chứ không nói rule kia vẫn đang đỏ.
// eslint-disable-next-line authz/require-can-in-write-action
export async function huyThietBiAction(input: unknown): Promise<KetQuaThietBi> {
  const ai = await nhanSuDangNhap();
  if (!ai.ok) return { ok: false, error: ai.error };

  const parsed = huyTheoIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Thiếu thiết bị cần gỡ" };

  const sdb = scopedDb(await resolveActor(ai.userId));
  const kq = await sdb.webPushSubscription.updateMany({
    where: { id: parsed.data.id, userId: ai.userId, status: "ACTIVE" },
    data: { status: "REVOKED", revokedAt: new Date(), revokedReason: "Người dùng tự gỡ" },
  });
  if (kq.count === 0) return { ok: false, error: "Không tìm thấy thiết bị này" };

  // Hai màn dùng chung component này — phải làm mới CẢ HAI, nếu không người dùng bật xong
  // vẫn thấy "Chưa có thiết bị nào" ngay cạnh dòng chữ "Đã bật".
  revalidatePath("/settings");
  revalidatePath("/teacher/ho-so");
  return { ok: true };
}

/**
 * Tắt thông báo trên CHÍNH máy đang dùng — client đã gọi `subscription.unsubscribe()` trước.
 *
 * Tách khỏi hàm trên vì trình duyệt chỉ biết `endpoint` của mình, không biết id dòng.
 */
// TỰ PHỤC VỤ: thao tác chỉ đụng thiết bị của CHÍNH người đang đăng nhập, cùng hạng với đổi
// mật khẩu. Cổng là `nhanSuDangNhap()` (phiên + hasStaffRole) và `userId` của phiên nằm trong
// MỌI câu ghi. KHÔNG tạo permission key riêng: nó không quyết định gì thêm mà kéo theo sửa 4
// nơi + bấm tay `seed-prod-roles.yml` trên prod.
//
// ⚠️ Dòng miễn trừ phải nằm NGAY TRƯỚC `export` — chèn chú thích xen vào giữa là nó vô hiệu,
// và ESLint chỉ báo "Unused eslint-disable directive" chứ không nói rule kia vẫn đang đỏ.
// eslint-disable-next-line authz/require-can-in-write-action
export async function huyThietBiTheoEndpointAction(input: unknown): Promise<KetQuaThietBi> {
  const ai = await nhanSuDangNhap();
  if (!ai.ok) return { ok: false, error: ai.error };

  const parsed = huyTheoEndpointSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Thiếu endpoint" };

  await scopedDb(await resolveActor(ai.userId)).webPushSubscription.updateMany({
    where: { endpoint: parsed.data.endpoint, userId: ai.userId, status: "ACTIVE" },
    data: { status: "REVOKED", revokedAt: new Date(), revokedReason: "Tắt trên máy này" },
  });
  // KHÔNG báo lỗi khi không có dòng nào: người dùng vừa tắt ở máy này, và việc DB không còn bản
  // ghi tương ứng là kết quả họ muốn. Bắt họ đọc một thông báo lỗi là nói sai về kết quả.

  // Hai màn dùng chung component này — phải làm mới CẢ HAI, nếu không người dùng bật xong
  // vẫn thấy "Chưa có thiết bị nào" ngay cạnh dòng chữ "Đã bật".
  revalidatePath("/settings");
  revalidatePath("/teacher/ho-so");
  return { ok: true };
}
