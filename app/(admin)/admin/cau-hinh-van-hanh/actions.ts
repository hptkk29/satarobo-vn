"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { SETTINGS } from "@/lib/settings/registry";
import { kiemChinhSach, type ChinhSachHoaHong } from "@/lib/crm/chinh-sach-hoa-hong";
import {
  getSetting,
  setGlobalSetting,
  setCenterSetting,
  type SetResult,
} from "@/lib/settings/service";
// ⚠️ GỘP main 16/09: `main` KHÔNG đổi tên `catalogPrefixes` — nó THÊM
// `catalogPrefixesDayDuoc` (cả hai vẫn export ở `lib/notifications/catalog.ts`, dòng 487 và
// 524). Thân tệp sau gộp dùng bản `…DayDuoc` ở cả hai chỗ (:92 và :107), nên bản import
// `catalogPrefixes` của nhánh này thành mồ côi và bị bỏ — KHÔNG phải mất tính năng.
import { catalogPrefixesDayDuoc } from "@/lib/notifications/catalog";

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
  const thuTu = new Map(catalogPrefixesDayDuoc().map((p, i) => [p, i] as const));
  const tienTo = [...new Set(input.tienTo.filter((t) => typeof t === "string" && t.length > 0))].sort(
    (a, b) => (thuTu.get(a) ?? 9999) - (thuTu.get(b) ?? 9999) || a.localeCompare(b),
  );

  // ⚠️ ĐỐI CHIẾU DANH MỤC Ở ĐÂY, không ở registry — xem khối chú thích tại `push.tienToDuocDay`
  // trong `lib/settings/registry.ts`: đặt phép kiểm đó ở tầng kia tạo 11 vòng import mà
  // `lint:boundaries` chặn cứng.
  //
  // TỪ CHỐI chứ không lặng lẽ lọc bỏ. Lọc bỏ thì người dùng bấm Lưu, thấy báo thành công, rồi
  // loại họ vừa chọn biến mất không dấu vết — màn hình nói dối đúng nghĩa. Một khoá lạ tới được
  // đây nghĩa là giao diện và danh mục đã lệch nhau; đó là thứ phải nổ ra, không phải thứ để
  // dọn dẹp im lặng.
    // Danh sách HẸP: bỏ các loại của vòng quét — chúng không bao giờ đẩy được, nên lưu
  // vào cấu hình cũng vô nghĩa. Xem `catalogPrefixesDayDuoc`.
  const hopLe = new Set(catalogPrefixesDayDuoc());
  const la = tienTo.filter((t) => !hopLe.has(t));
  if (la.length > 0) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: `Không có loại thông báo nào mang mã ${la.join(", ")} — tải lại trang rồi thử lại`,
        field: "push.tienToDuocDay",
      },
    };
  }

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

/**
 * Lưu TOÀN BỘ chính sách hoa hồng (key `crm.commissionPolicies`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO CÓ ACTION RIÊNG, KHÔNG DÙNG `saveGlobalSettingAction`
 *
 * Vì luật nghiệp vụ phải chạy TRƯỚC khi ghi, và luật đó cần MỘT KEY KHÁC trong cùng
 * registry: trần `crm.commissionMaxTotalRate`. `setGlobalSetting` chỉ kiểm zod của chính
 * key đang ghi, nên nó không thể biết tổng tỉ lệ có vượt trần hay không.
 *
 * Đây cũng đúng khuôn mà `savePushTopicsAction` ngay trên đã dùng: phép kiểm cần dữ liệu
 * NGOÀI key đó thì đặt ở tầng action, không nhét vào registry — nhét vào là đẻ vòng import
 * mà `lint:boundaries` chặn cứng (11 vòng, đã gỡ ở `45fc7225`).
 *
 * ⚠️ Màn cũng chạy `kiemChinhSach` để người khai thấy lỗi ngay khi gõ. Điều đó KHÔNG thay
 * được cổng ở đây: Server Action là endpoint HTTP riêng — gọi thẳng nó thì màn không đứng
 * chắn được. Hai nơi, MỘT hàm, không chép luật.
 *
 * ⚠️ Trần đọc từ CẤU HÌNH, không dùng hằng `MAX_TOTAL_RATE` trong mã: đúng bài học
 * `crm.commissionMaxTotalRate` đã ghi ở CLAUDE.md — người vận hành nới trần ở màn mà đường
 * ghi vẫn chặn theo số cũ thì trần thành đồ trang trí.
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
    actorName: session.user.name ?? session.user.email ?? session.user.id,
  });
  if (!res.ok) return { ok: false, error: res.error.message };

  revalidatePath("/admin/cau-hinh-van-hanh");
  return { ok: true };
}
