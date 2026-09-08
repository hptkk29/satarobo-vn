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

/** Kết quả của một lượt ghi — ai vừa được ghi MỚI hoặc MỞ LẠI là người cần rung chuông. */
export interface GhiThongBaoKetQua {
  /** Số người trong danh sách nhận (sau khi lọc trùng/rỗng). */
  soNguoi: number;
  /** Người có bản ghi mới tạo hoặc vừa kéo về CHƯA ĐỌC — chỉ những người này cần `notification.bumped`. */
  canRung: string[];
}

/** Các cột nội dung được so để biết bản ghi có thực sự đổi hay không. */
const COT_NOI_DUNG = ["title", "body", "href", "groupKey", "priority", "entityType", "entityId"] as const;

/**
 * Ghi thông báo cho nhiều người, KHÔNG bắn realtime. Dùng cho cron quét hàng loạt (vd `sla-check`)
 * để gom mọi tín hiệu của một lượt chạy thành MỘT lần `broadcastNotificationBump` ở cuối.
 *
 * ⚠️ Vì sao phải so trước rồi mới ghi (sự cố egress 05/09/2026): bản cũ upsert vô điều kiện rồi
 * bắn `notification.bumped` cho MỌI người nhận ở MỌI lượt gọi. Cron `sla-check` (mỗi 15 phút) đi qua đây
 * ~1.800 vi phạm/lượt ⇒ 1,34 triệu INSERT cho một bảng chỉ có ~2.000 dòng, và ~170.000 POST
 * broadcast/ngày làm Realtime cạn pool (`DBConnection.ConnectionError`), rồi mỗi bump lại kéo mọi
 * tab admin gọi `/api/notifications/summary`. Kết quả: prod vượt trần egress 5 GB dù DB chỉ 57 MB.
 * Nay: bản ghi đã có và nội dung không đổi ⇒ KHÔNG ghi, KHÔNG rung. Chỉ rung khi tạo mới hoặc
 * khi `reopen` kéo một bản đã đọc về chưa đọc — đúng nghĩa của dedupeKey.
 */
export async function ghiThongBaoNhanSu(params: NotifyStaffParams): Promise<GhiThongBaoKetQua> {
  const nguoiNhan = [...new Set(params.userIds.filter((id) => !!id))];
  if (nguoiNhan.length === 0) return { soNguoi: 0, canRung: [] };

  const canhBao = kiemPii(`${params.title}
${params.body}`);
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

  // Một câu đọc cho cả danh sách người nhận — thay cho N upsert mù.
  const daCo = await db.staffNotification.findMany({
    where: { dedupeKey: params.dedupeKey, userId: { in: nguoiNhan } },
    select: {
      userId: true,
      readAt: true,
      title: true,
      body: true,
      href: true,
      groupKey: true,
      priority: true,
      entityType: true,
      entityId: true,
      expiresAt: true,
      // BẮT BUỘC (vá 08/09/2026): thiếu cột này thì `REVOKED` thành ngõ cụt MỘT CHIỀU —
      // nội dung y hệt ⇒ vòng dưới `continue` ⇒ dòng nằm REVOKED vĩnh viễn và người đó
      // KHÔNG BAO GIỜ được báo lại cho cùng một việc. Ca thật: lead A→B→A.
      state: true,
    },
  });
  const theoUser = new Map(daCo.map((r) => [r.userId, r]));

  const canRung: string[] = [];
  for (const userId of nguoiNhan) {
    const cu = theoUser.get(userId);
    if (!cu) {
      // Chưa có ⇒ tạo. Vẫn dùng upsert để hai lượt cron chồng nhau không đẻ P2002.
      await db.staffNotification.upsert({
        where: { userId_dedupeKey: { userId, dedupeKey: params.dedupeKey } },
        create: { userId, dedupeKey: params.dedupeKey, category, ...noiDung },
        update: noiDung,
      });
      canRung.push(userId);
      continue;
    }

    const noiDungDoi =
      COT_NOI_DUNG.some((k) => cu[k] !== noiDung[k]) ||
      (cu.expiresAt?.getTime() ?? null) !== (noiDung.expiresAt?.getTime() ?? null);
    // Bản ghi đã bị THU HỒI (hoặc hết hạn) mà việc đó phát sinh LẠI ⇒ đây là một lần mới,
    // không phải bản trùng. Không có vế này thì `thuHoiThongBao` là cửa một chiều: đóng rồi
    // là đóng vĩnh viễn cặp (người, khoá) đó. Module cũ đã gặp đúng bẫy này và phải dựng khối
    // "MỞ LẠI" riêng — xem `lib/staff-notifications.ts` (EXPIRED → ACTIVE + reset mốc đọc).
    const daThuHoi = cu.state !== "ACTIVE";
    const moLai = (!!params.reopen && cu.readAt !== null) || daThuHoi;
    if (!noiDungDoi && !moLai) continue; // Y nguyên ⇒ không ghi, không rung.

    // Ghi lại nội dung là CÓ CHỦ ĐÍCH: đường duy nhất chữa được bản ghi sinh trước khi
    // href/nhóm/mức được sửa. Trạng thái đọc giữ nguyên trừ khi nơi gọi xin `reopen`,
    // hoặc bản ghi đang bị thu hồi và nay sống lại.
    await db.staffNotification.update({
      where: { userId_dedupeKey: { userId, dedupeKey: params.dedupeKey } },
      data: {
        ...noiDung,
        ...(moLai ? { readAt: null } : {}),
        ...(daThuHoi ? { state: "ACTIVE" } : {}),
      },
    });
    // Nội dung đổi nhưng vẫn đang chưa đọc ⇒ badge không đổi số, không cần rung.
    if (moLai) canRung.push(userId);
  }

  return { soNguoi: nguoiNhan.length, canRung };
}

/**
 * THU HỒI thông báo: đưa các bản ghi còn hiệu lực về trạng thái `REVOKED`.
 *
 * Vì sao cần (vá 08/09/2026): chuông của repo chưa từng có đường thu hồi — `entityId` được khai
 * với ý "để SAU NÀY thu hồi khi đối tượng bị xoá" nhưng chưa ai làm. Hệ quả cụ thể ở module lead:
 * lead chuyển từ A sang B thì B nhận chuông mới, còn A **giữ nguyên** dòng "Bạn có lead mới" trỏ
 * tới `/leads/<id>` — một lead họ không còn giữ. Nếu là chuyển XUYÊN CƠ SỞ thì tệ hơn: `Lead` nằm
 * trong `SCOPED_MODELS` nên `scopedDb` lọc mất, A bấm chuông ra trang "không tồn tại".
 *
 * `REVOKED` chứ không xoá: `conHieuLuc` (`service.ts`) chỉ đếm `state = "ACTIVE"`, nên đổi trạng
 * thái là đủ để mục biến khỏi badge lẫn panel — mà vẫn giữ được vết "đã từng báo cho ai" cho
 * việc đối soát. Xoá cứng là mất luôn dữ liệu đó.
 *
 * KHÔNG bắn realtime: badge chỉ có thể GIẢM, và người dùng không cần bị đánh động vì một mục vừa
 * biến mất. Nhịp poll kế tiếp sẽ đồng bộ. (Bắn ở đây là mời lại đúng bão broadcast của 05/09.)
 *
 * Chỉ đụng dòng đang `ACTIVE` — `updateMany` nên không ném khi không có gì để thu hồi.
 */
export async function thuHoiThongBao(params: {
  userIds: readonly string[];
  dedupeKey: string;
}): Promise<number> {
  const ds = [...new Set(params.userIds.filter((id) => !!id))];
  if (ds.length === 0 || !params.dedupeKey) return 0;
  const kq = await db.staffNotification.updateMany({
    where: { userId: { in: ds }, dedupeKey: params.dedupeKey, state: "ACTIVE" },
    data: { state: "REVOKED" },
  });
  return kq.count;
}

/**
 * Bắn `notification.bumped` cho danh sách người. Fail-and-forget: `broadcastMessages` cam kết
 * không throw, nhưng vẫn bọc — thông báo ĐÃ nằm trong Postgres, mất tín hiệu realtime chỉ có
 * nghĩa là badge nhảy ở nhịp poll kế tiếp. Người gọi hàng loạt gom một danh sách rồi gọi MỘT lần.
 */
export async function broadcastNotificationBump(userIds: readonly string[]): Promise<void> {
  const ds = [...new Set(userIds.filter((id) => !!id))];
  if (ds.length === 0) return;
  try {
    await broadcastMessages(notificationBumpBroadcasts(ds, { at: new Date().toISOString() }));
  } catch (err) {
    console.warn("[notifications] bắn tín hiệu realtime lỗi — thông báo vẫn đã lưu:", err);
  }
}

/** Ghi thông báo cho nhiều người + bắn tín hiệu realtime cho ai cần. Trả về số người nhận. */
export async function notifyStaff(params: NotifyStaffParams): Promise<number> {
  const kq = await ghiThongBaoNhanSu(params);
  await broadcastNotificationBump(kq.canRung);
  return kq.soNguoi;
}
