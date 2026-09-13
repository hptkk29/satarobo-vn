"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { setGlobalSetting, setCenterSetting, type SetResult } from "@/lib/settings/service";
import { catalogPrefixes } from "@/lib/notifications/catalog";

function actorName(user: { id: string; name?: string | null; email?: string | null }): string {
  return user.name ?? user.email ?? user.id;
}

/** R6-A — Lưu cấu hình GLOBAL (chỉ SUPER_ADMIN). */
export async function saveGlobalSettingAction(input: {
  key: string;
  value: unknown;
  reason: string;
}): Promise<SetResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: { code: "AUTH", message: "Chưa đăng nhập" } };
  const actor = await resolveActor(session.user.id);
  const res = await setGlobalSetting(actor, {
    key: input.key,
    value: input.value,
    reason: input.reason,
    actorName: actorName(session.user),
  });
  if (res.ok) revalidatePath("/admin/cau-hinh-van-hanh");
  return res;
}

/** R6-A — Lưu override theo cơ sở (CENTER_MANAGER cơ sở đó / SUPER_ADMIN). */
export async function saveCenterSettingAction(input: {
  orgUnitId: string;
  key: string;
  value: unknown;
  reason: string;
}): Promise<SetResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: { code: "AUTH", message: "Chưa đăng nhập" } };
  const actor = await resolveActor(session.user.id);
  const res = await setCenterSetting(actor, {
    orgUnitId: input.orgUnitId,
    key: input.key,
    value: input.value,
    reason: input.reason,
    actorName: actorName(session.user),
  });
  if (res.ok) revalidatePath("/admin/cau-hinh-van-hanh");
  return res;
}

/**
 * Lưu danh sách loại thông báo được đẩy Web Push (tab "Thông báo điện thoại").
 *
 * Chỉ SUPER_ADMIN — cổng nằm trong `setGlobalSetting`, KHÔNG lặp lại ở đây. Lặp lại là tạo ra
 * hai nguồn sự thật cho cùng một câu hỏi, và nguồn ở tầng dưới mới là nguồn thật.
 *
 * ⚠️ Ghi CẢ DANH SÁCH chứ không ghi từng mục bật/tắt. Nghe thì thừa, nhưng đây là chỗ tránh
 * một lớp lỗi thật: hai người cùng mở màn này, mỗi người bấm một công tắc khác nhau rồi lưu —
 * với API "bật mục X" thì cả hai cùng thắng và ra một trạng thái chưa ai chọn. Ghi cả danh
 * sách thì người lưu sau ghi đè người trước, và nhật ký kiểm toán có `oldValues` đủ để thấy
 * chuyện gì vừa xảy ra.
 */
export async function luuLoaiDuocDayAction(input: {
  tienTo: string[];
  reason: string;
}): Promise<SetResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: { code: "AUTH", message: "Chưa đăng nhập" } };
  }

  // Chuẩn hoá TRƯỚC khi đưa xuống: bỏ trùng, bỏ rỗng, sắp theo đúng thứ tự khai trong catalog.
  //
  // Vì sao sắp lại: giá trị này nằm trong `oldValues`/`newValues` của nhật ký kiểm toán. Nếu
  // thứ tự chạy theo thứ tự người dùng bấm thì hai lần lưu CÙNG một lựa chọn vẫn ra hai JSON
  // khác nhau, và người đọc nhật ký sẽ đi tìm một thay đổi không tồn tại.
  const thuTu = new Map(catalogPrefixes().map((p, i) => [p, i] as const));
  const tienTo = [...new Set(input.tienTo.filter((t) => typeof t === "string" && t.length > 0))].sort(
    (a, b) => (thuTu.get(a) ?? 9999) - (thuTu.get(b) ?? 9999) || a.localeCompare(b),
  );

  const actor = await resolveActor(session.user.id);
  const res = await setGlobalSetting(actor, {
    key: "push.tienToDuocDay",
    value: tienTo,
    reason: input.reason,
    actorName: session.user.name ?? session.user.email ?? session.user.id,
  });

  if (res.ok) revalidatePath("/admin/cau-hinh-van-hanh");
  return res;
}
