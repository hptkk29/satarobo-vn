"use server";

import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { passesScope, scopedDb } from "@/lib/db-scope";
import { writeAudit } from "@/lib/audit/audit-log";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseVnYmd } from "@/lib/time/vn";
import { buildCostDedupeKey } from "@/lib/finance/cost-import";

// B-03 (B.9) — nhập tay + duyệt khoản chi.
//
// 🔴 BA CHỐT CHẶN, mỗi cái chặn một kiểu sai khác nhau — đừng gộp:
//  1. `costs:manage` để NHẬP, `costs:approve` để DUYỆT. QĐ-B5: *người nhập không tự
//     duyệt*. Gộp một key là bỏ mất toàn bộ ý nghĩa của bước duyệt.
//  2. Đầu phí `isSystemFed` (ADS) **cấm** nhập tay — chi phí quảng cáo đọc từ D1. Không
//     chặn ở đây thì kế toán nhập hoá đơn Meta và lợi nhuận bị trừ HAI LẦN.
//  3. `scopedDb` KHÔNG che WRITE ⇒ mọi create tự set `centerId`, mọi update tự
//     `passesScope`. Quên vế đầu là khoản chi vô hình với chính người vừa nhập.

type ActionResult = { ok: boolean; error?: string };

const costEntrySchema = z.object({
  // "" / "COMPANY" → null = chi phí CẤP CÔNG TY (nghĩa riêng, không phải "chưa gán").
  centerId: z
    .string()
    .optional()
    .transform((s) => (!s || s === "" || s === "COMPANY" ? null : s)),
  categoryId: z.string().min(1, "Chọn đầu mục chi"),
  spentDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải dạng YYYY-MM-DD"),
  amount: z.coerce
    .number()
    .int("Số tiền phải là số nguyên")
    .positive("Số tiền phải lớn hơn 0")
    .max(50_000_000_000, "Số tiền vượt ngưỡng hợp lý"),
  vendor: z
    .string()
    .optional()
    .transform((s) => s?.trim() || null),
  note: z
    .string()
    .optional()
    .transform((s) => s?.trim() || null),
});

export async function createCostEntryAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("costs:manage"))) {
    return { ok: false, error: "Không có quyền nhập chi phí" };
  }

  const parsed = costEntrySchema.safeParse({
    centerId: formData.get("centerId") ?? undefined,
    categoryId: formData.get("categoryId") ?? "",
    spentDate: formData.get("spentDate") ?? "",
    amount: formData.get("amount") ?? "",
    vendor: formData.get("vendor") ?? undefined,
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const { centerId, categoryId, spentDate, amount, vendor, note } = parsed.data;

  const spent = parseVnYmd(spentDate);
  if (!spent) return { ok: false, error: "Ngày chi không hợp lệ" };

  const actor = await resolveActor(session.user.id);
  // `CostCategory` la SCOPE_EXEMPT va `CostEntry` khong che WRITE — `sdb` o day la de
  // di dung mot cua theo luat R6-F1, khong phai vi no tu cach ly ho.
  const sdb = scopedDb(actor);
  const isGlobalAllowed = actor.isSuperAdmin || actor.isHoLevel;
  if (centerId === null) {
    if (!isGlobalAllowed) {
      return { ok: false, error: "Chỉ cấp hội sở mới ghi được chi phí cấp công ty" };
    }
  } else if (!isGlobalAllowed && !actor.visibleCenterIds.includes(centerId)) {
    return { ok: false, error: "Cơ sở ngoài phạm vi quản lý của bạn" };
  }

  // Chốt chặn 2 — đầu phí do hệ thống nạp thì cấm nhập tay.
  const category = await sdb.costCategory.findUnique({
    where: { id: categoryId },
    select: { id: true, code: true, isSystemFed: true, isActive: true },
  });
  if (!category || !category.isActive) return { ok: false, error: "Đầu mục chi không hợp lệ" };
  if (category.isSystemFed) {
    return {
      ok: false,
      error: `Đầu mục "${category.code}" do hệ thống tự nạp — nhập tay sẽ làm lợi nhuận bị trừ hai lần`,
    };
  }

  const entry = await sdb.costEntry.create({
    data: {
      centerId, // scopedDb không che write — phải tự set, quên là khoản vô hình
      categoryId,
      spentDate: spent,
      amount,
      vendor,
      note,
      status: "DRAFT", // luôn vào DRAFT; lên báo cáo chỉ sau khi có người DUYỆT
      source: "MANUAL",
      dedupeKey: buildCostDedupeKey({ spentDate, categoryId, centerId, amount, vendor }),
      createdById: session.user.id,
    },
    select: { id: true },
  });

  await writeAudit({
    actor: { id: session.user.id, name: session.user.name ?? "Không rõ" },
    module: "finance",
    entityType: "CostEntry",
    entityId: entry.id,
    action: "CREATE",
    newValues: { categoryId, centerId, spentDate, amount, vendor },
    orgUnitId: centerId,
  }).catch(() => {});

  revalidatePath("/admin/chi-phi");
  return { ok: true };
}

const decideSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["APPROVED", "VOID"]),
});

/**
 * Duyệt / huỷ một khoản chi.
 *
 * ⚠️ `VOID` chứ không xoá cứng: sổ chi là chứng từ, mất dòng là mất vết. `deletedAt`
 * để dành cho thao tác quản trị thật sự, không dùng cho "từ chối".
 */
export async function decideCostEntryAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("costs:approve"))) {
    return { ok: false, error: "Không có quyền duyệt chi phí" };
  }

  const parsed = decideSchema.safeParse({
    id: formData.get("id") ?? "",
    decision: formData.get("decision") ?? "",
  });
  if (!parsed.success) return { ok: false, error: "Dữ liệu không hợp lệ" };

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const entry = await sdb.costEntry.findFirst({
    where: { id: parsed.data.id, deletedAt: null },
    select: { id: true, centerId: true, status: true, amount: true, createdById: true },
  });
  if (!entry) return { ok: false, error: "Không tìm thấy khoản chi" };
  // Đọc đã qua scopedDb, nhưng GHI thì không — tự kiểm lại trước khi update.
  if (!passesScope("CostEntry", entry, actor)) {
    return { ok: false, error: "Khoản chi ngoài phạm vi của bạn" };
  }
  // 🔴 `passesScope` MỘT MÌNH LÀ CHƯA ĐỦ ở bảng này. `CostEntry` ∈ NULL_IS_GLOBAL_MODELS
  // nên dòng `centerId = null` (chi phí CẤP CÔNG TY) luôn trả `true` — đúng cho đường
  // ĐỌC (kế toán cơ sở cần thấy để B2/B3 của cơ sở không báo lãi ảo), nhưng nếu để
  // nguyên ở đường DUYỆT thì kế toán một cơ sở duyệt được khoản chi của hội sở.
  if (entry.centerId === null && !(actor.isSuperAdmin || actor.isHoLevel)) {
    return { ok: false, error: "Chi phí cấp công ty chỉ hội sở duyệt được" };
  }
  // 🔴 QĐ-B5 nói *người nhập không tự duyệt*. Hai permission key riêng KHÔNG đủ để đạt
  // điều đó: vai kế toán giữ CẢ `costs:manage` LẪN `costs:approve`, nên nếu không chặn
  // ở đây thì họ tự nhập rồi tự duyệt và bước duyệt thành nghi thức rỗng.
  // ⚠️ Đánh đổi có thật: cơ sở chỉ có MỘT kế toán sẽ phải nhờ kế toán hội sở duyệt.
  // Đó là cái giá của việc tách nhiệm vụ — nới ra thì dễ, thu lại thì không.
  if (entry.createdById && entry.createdById === session.user.id) {
    return {
      ok: false,
      error: "Người nhập không tự duyệt khoản chi của mình — nhờ kế toán khác hoặc hội sở duyệt",
    };
  }
  if (entry.status !== "DRAFT") {
    return { ok: false, error: "Khoản chi này đã được xử lý rồi" };
  }

  await sdb.costEntry.update({
    where: { id: entry.id },
    data: {
      status: parsed.data.decision,
      approvedById: session.user.id,
      approvedAt: new Date(),
    },
  });

  await writeAudit({
    actor: { id: session.user.id, name: session.user.name ?? "Không rõ" },
    module: "finance",
    entityType: "CostEntry",
    entityId: entry.id,
    action: "STATUS_CHANGE",
    oldValues: { status: "DRAFT" },
    newValues: { status: parsed.data.decision, amount: entry.amount },
    orgUnitId: entry.centerId,
  }).catch(() => {});

  revalidatePath("/admin/chi-phi");
  revalidatePath("/admin/dashboard");
  return { ok: true };
}
