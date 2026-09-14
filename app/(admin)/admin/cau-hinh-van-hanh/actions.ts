"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { setGlobalSetting, setCenterSetting, type SetResult } from "@/lib/settings/service";
import { z } from "zod";
import { SETTINGS } from "@/lib/settings/registry";
import { getSetting } from "@/lib/settings/service";
import { kiemChinhSach, type ChinhSachHoaHong } from "@/lib/crm/chinh-sach-hoa-hong";

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
 * Lưu TOÀN BỘ chính sách hoa hồng (key `crm.commissionPolicies`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO CÓ ACTION RIÊNG, KHÔNG DÙNG `saveGlobalSettingAction`
 *
 * Vì luật nghiệp vụ phải chạy TRƯỚC khi ghi, và luật đó cần MỘT key khác trong cùng
 * registry: trần `crm.commissionMaxTotalRate`. `setGlobalSetting` chỉ kiểm zod của chính
 * key đang ghi, nên nó không thể biết tổng tỉ lệ có vượt trần hay không.
 *
 * ⚠️ Màn cũng chạy `kiemChinhSach` để người khai thấy lỗi ngay khi gõ. Điều đó KHÔNG
 * thay được cổng ở đây: Server Action là endpoint HTTP riêng — gọi thẳng nó thì màn
 * không đứng chắn được. Hai nơi, MỘT hàm, không chép luật.
 *
 * ⚠️ Trần đọc từ CẤU HÌNH, không dùng hằng `MAX_TOTAL_RATE` trong mã: đúng bài học
 * `crm.commissionMaxTotalRate` đã ghi ở CLAUDE.md — người vận hành nới trần ở màn mà
 * đường ghi vẫn chặn theo số cũ thì trần thành đồ trang trí.
 */
export async function luuChinhSachHoaHongAction(input: {
  chinhSach: ChinhSachHoaHong[];
  lyDo: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };

  const parsed = z
    .object({
      chinhSach: SETTINGS["crm.commissionPolicies"].schema,
      lyDo: z.string().trim().min(5, "Nhập lý do thay đổi (tối thiểu 5 ký tự)").max(500),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const tran = await getSetting("crm.commissionMaxTotalRate");
  const loi = kiemChinhSach(parsed.data.chinhSach as ChinhSachHoaHong[], {
    tranTongTiLe: typeof tran === "number" ? tran : 0.09,
  });
  if (loi.length > 0) return { ok: false, error: loi.join(" · ") };

  const actor = await resolveActor(session.user.id);
  const res = await setGlobalSetting(actor, {
    key: "crm.commissionPolicies",
    value: parsed.data.chinhSach,
    reason: parsed.data.lyDo,
    actorName: actorName(session.user),
  });
  if (!res.ok) return { ok: false, error: res.error.message };

  revalidatePath("/admin/cau-hinh-van-hanh");
  revalidatePath("/cau-hinh-van-hanh");
  return { ok: true };
}
