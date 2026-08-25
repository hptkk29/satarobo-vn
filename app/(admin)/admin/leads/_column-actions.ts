"use server";

// G-04 — lưu / khôi phục tuỳ chọn cột của bảng lead.
//
// Hai action này ghi vào bảng khoá theo NGƯỜI. Điều duy nhất ngăn người A sửa cấu
// hình của người B là: `userId` lấy từ PHIÊN ĐĂNG NHẬP, không bao giờ từ payload —
// nên lược đồ Zod cũng cố ý không có trường `userId` (Zod loại khoá lạ).
//
// Cổng quyền dùng lại đúng cổng của trang danh sách (`leads:view-all` HOẶC
// `leads:view-own`): xem được lead thì tự chọn được cột của mình. KHÔNG đẻ thêm
// permission key cho việc này — một key mới phải khai ở ba nơi và phải chạy
// seed-prod-roles.yml, đổi lấy đúng con số không lợi ích về mặt kiểm soát.
import { auth } from "@/lib/auth";
import { checkAnyPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { revalidatePath } from "next/cache";
import { getTableCatalog } from "@/lib/tables/lead-columns";
import { normalizeColumnsForSave } from "@/lib/tables/column-preference";
import { tableColumnsInputSchema, tableKeyOnlySchema } from "@/lib/validators/table-preference";

type ActionResult = { ok: boolean; error?: string };

/** Cổng chung của cả hai action. Trả actor để khỏi resolve hai lần. */
const CONG_XEM_LEAD = ["leads:view-all", "leads:view-own"] as const;

/**
 * Lưu danh sách cột đang hiện (theo đúng thứ tự người dùng đã kéo).
 *
 * Client chỉ gửi `visible`; `hidden` được suy ra từ danh mục ở server. Nhận cả hai
 * mảng từ client là mở đường cho một payload tự mâu thuẫn (một khoá nằm ở cả hai)
 * mà không ai kiểm được, và cũng thừa: mọi cột không hiện SAU khi bấm Lưu đều là
 * cột người ta chủ ý tắt.
 */
export async function saveLeadTableColumnsAction(input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkAnyPermission(CONG_XEM_LEAD))) {
    return { ok: false, error: "Không có quyền" };
  }

  const parsed = tableColumnsInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const catalog = getTableCatalog(parsed.data.tableKey);
  if (!catalog) return { ok: false, error: "Không biết bảng này" };

  // Nắn theo danh mục Ở SERVER: khoá lạc bị loại khỏi bản ghi mới (tự dọn theo nhịp
  // người dùng, không cần cron), và `hidden` được điền đủ phần còn lại.
  const columns = normalizeColumnsForSave(catalog, parsed.data.visible);
  if (columns.visible.length === 0) {
    // Client gửi toàn khoá lạc (cấu hình cũ của một bản phát hành trước). Lưu vào
    // là bảng 0 cột — thà báo lỗi còn hơn để họ nhìn một bảng trắng không lý do.
    return { ok: false, error: "Không còn cột nào hợp lệ — hãy chọn lại" };
  }

  const actor = await resolveActor(session.user.id);
  // UserTablePreference không có centerId ⇒ scopedDb là pass-through. Vẫn đi qua nó
  // để không có đường `db` trần nào trong app/(admin) (ESLint chặn, và đúng luật nhà).
  const sdb = scopedDb(actor);

  try {
    await sdb.userTablePreference.upsert({
      where: {
        userId_tableKey: { userId: session.user.id, tableKey: parsed.data.tableKey },
      },
      update: { columns },
      create: { userId: session.user.id, tableKey: parsed.data.tableKey, columns },
    });
  } catch {
    return { ok: false, error: "Lỗi cơ sở dữ liệu — không lưu được tuỳ chọn cột" };
  }

  revalidatePath("/leads");
  revalidatePath("/admin/leads");
  return { ok: true };
}

/**
 * Khôi phục mặc định = XOÁ dòng cấu hình.
 *
 * KHÔNG ghi một JSON "bản mặc định" vào DB: làm vậy là đóng băng mặc định ở thời
 * điểm bấm nút, và đợt sau thêm cột thì đúng người vừa bấm "khôi phục" lại là
 * người KHÔNG nhận được cột mới.
 */
export async function resetLeadTableColumnsAction(input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkAnyPermission(CONG_XEM_LEAD))) {
    return { ok: false, error: "Không có quyền" };
  }

  const parsed = tableKeyOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu không hợp lệ" };

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  try {
    // deleteMany + điều kiện userId từ phiên: không cần biết dòng đó có tồn tại không,
    // và không có cách nào chạm vào dòng của người khác.
    await sdb.userTablePreference.deleteMany({
      where: { userId: session.user.id, tableKey: parsed.data.tableKey },
    });
  } catch {
    return { ok: false, error: "Lỗi cơ sở dữ liệu — không khôi phục được" };
  }

  revalidatePath("/leads");
  revalidatePath("/admin/leads");
  return { ok: true };
}
