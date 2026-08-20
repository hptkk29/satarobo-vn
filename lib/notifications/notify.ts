import "server-only";
import { db } from "@/lib/db";
import { broadcastMessages, notificationBumpBroadcasts } from "@/lib/chat/broadcast";
import { classifyNotification } from "./catalog";
import { cheSdt, kiemPii } from "./pii";

// =============================================================================
// ĐƯỜNG GHI DUY NHẤT của thông báo nhân sự.
//
// Trước đây 17 nơi tự gọi `db.staffNotification.upsert` với mỗi nơi một kiểu: nơi set href ở
// `create` mà quên `update` (bản ghi cũ giữ href sai vĩnh viễn), nơi quên href hẳn, không nơi nào
// khai nhóm/mức, và không nơi nào phát tín hiệu realtime. Gom về đây để bốn thứ đó đúng một lần:
//   1. nhóm + mức lấy từ `catalog.ts` — thông báo mới không bao giờ rơi vào "Hệ thống/P3" vì quên;
//   2. href ghi ở CẢ create lẫn update — vá được cả bản ghi sinh trước bản vá;
//   3. che số điện thoại trước khi lưu (PRD T5) — panel chuông mở giữa chỗ đông người;
//   4. bắn `notification.bumped` để badge nhảy ngay, thay vì đợi vòng poll.
//
// ⚠️ KHÔNG nhận `tx`: broadcast phải chạy SAU commit. Gọi hàm này sau khi transaction nghiệp vụ
// đã đóng. Nếu cần ghi thông báo TRONG transaction thì ghi thẳng bằng Prisma rồi tự bắn tín hiệu
// sau — đừng nới hàm này để nhận tx rồi bắn sớm.
// =============================================================================

export interface NotifyStaffParams {
  /** Danh sách người nhận. Trùng nhau/chuỗi rỗng được tự lọc. */
  userIds: readonly string[];
  /** Khoá chống trùng. ĐỪNG đổi format của loại đang chạy — xem chú thích ở catalog.ts. */
  dedupeKey: string;
  title: string;
  body: string;
  /** Đường admin clean-URL, KHÔNG tiền tố `/admin`. `teacherHref()` lo phần site giáo viên. */
  href?: string | null;
  /** Id của đối tượng đích — để sau này thu hồi thông báo khi đối tượng bị xoá. */
  entityId?: string | null;
  /** Giữ tương thích với cột cũ; bỏ trống thì lấy đoạn đầu của `dedupeKey`. */
  category?: string;
  /** Quá mốc này thì thôi đếm vào badge. */
  expiresAt?: Date | null;
  /**
   * true = kéo bản ghi đã đọc về CHƯA ĐỌC khi nội dung đổi.
   * Chỉ bật khi sự việc thật sự lặp lại và người nhận PHẢI xem lại (vd điểm danh bị sửa lần hai).
   * Bật bừa là biến chuông thành nguồn nhiễu — đúng thứ PRD dựng trần 30 mục/ngày để chặn.
   */
  reopen?: boolean;
}

/** Ghi thông báo cho nhiều người + bắn tín hiệu realtime. Trả về số người thật sự được ghi. */
export async function notifyStaff(params: NotifyStaffParams): Promise<number> {
  const nguoiNhan = [...new Set(params.userIds.filter((id) => !!id))];
  if (nguoiNhan.length === 0) return 0;

  const canhBao = kiemPii(`${params.title}\n${params.body}`);
  if (canhBao.coSdt || canhBao.coTien) {
    // Không chặn — chặn ở đây là nuốt mất một thông báo nghiệp vụ thật. Nhưng phải để lại vết:
    // loại nào lọt SĐT/học phí ra panel là loại cần sửa mẫu câu, không phải sửa chỗ này.
    console.warn(
      `[notifications] ${params.dedupeKey} có dữ liệu nhạy cảm trong tiêu đề/nội dung`,
      canhBao,
    );
  }

  const phanLoai = classifyNotification(params.dedupeKey);
  if (!phanLoai.known) {
    console.warn(
      `[notifications] dedupeKey "${params.dedupeKey}" chưa khai trong catalog — thông báo sẽ nằm chót panel. Thêm một dòng vào lib/notifications/catalog.ts.`,
    );
  }

  const noiDung = {
    title: cheSdt(params.title),
    body: cheSdt(params.body),
    href: params.href ?? null,
    groupKey: phanLoai.groupKey,
    priority: phanLoai.priority,
    entityType: phanLoai.entityType,
    entityId: params.entityId ?? null,
    expiresAt: params.expiresAt ?? null,
  };

  const category = params.category ?? params.dedupeKey.split(":")[0] ?? "system";

  for (const userId of nguoiNhan) {
    await db.staffNotification.upsert({
      where: { userId_dedupeKey: { userId, dedupeKey: params.dedupeKey } },
      create: { userId, dedupeKey: params.dedupeKey, category, ...noiDung },
      // Ghi lại nội dung ở nhánh update là CÓ CHỦ ĐÍCH: nó là đường duy nhất chữa được những
      // bản ghi sinh ra trước khi href/nhóm/mức được sửa. Trạng thái đọc giữ nguyên trừ khi
      // nơi gọi xin `reopen`.
      update: { ...noiDung, ...(params.reopen ? { readAt: null } : {}) },
    });
  }

  // Fail-and-forget: `broadcastMessages` cam kết không throw, nhưng vẫn bọc — thông báo ĐÃ nằm
  // trong Postgres, mất tín hiệu realtime chỉ có nghĩa là badge nhảy ở nhịp poll kế tiếp.
  try {
    await broadcastMessages(
      notificationBumpBroadcasts(nguoiNhan, { at: new Date().toISOString() }),
    );
  } catch (err) {
    console.warn("[notifications] bắn tín hiệu realtime lỗi — thông báo vẫn đã lưu:", err);
  }

  return nguoiNhan.length;
}
