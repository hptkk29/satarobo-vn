"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import {
  inventoryItemSchema,
  type InventoryItemInput,
} from "@/lib/validators/inventory";

type Result<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const ALLOWED_ROLES = ["SUPER_ADMIN", "MANAGER", "ACCOUNTANT"] as const;

async function requireRole(): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return { ok: false, error: "Không có quyền quản lý kho" };
  }
  return { ok: true };
}

export async function createItem(
  input: InventoryItemInput,
): Promise<Result<{ itemId: string }>> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = inventoryItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const existing = await db.inventoryItem.findUnique({
    where: { itemCode: data.itemCode },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: `Mã hàng "${data.itemCode}" đã tồn tại` };
  }

  const centers = await db.center.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  try {
    const created = await db.$transaction(async (tx) => {
      const item = await tx.inventoryItem.create({
        data,
        select: { id: true },
      });
      if (centers.length > 0) {
        await tx.stockBalance.createMany({
          data: centers.map((c) => ({
            itemId: item.id,
            centerId: c.id,
            quantity: 0,
            reserved: 0,
          })),
        });
      }
      return item;
    });
    revalidatePath("/inventory/items");
    return { ok: true, data: { itemId: created.id } };
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
}

export async function createItemAndRedirect(input: InventoryItemInput) {
  const res = await createItem(input);
  if (!res.ok) return res;
  redirect(`/inventory/items/${res.data!.itemId}/edit`);
}

export async function updateItem(
  id: string,
  input: InventoryItemInput,
): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = inventoryItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const current = await db.inventoryItem.findUnique({
    where: { id },
    select: { itemCode: true },
  });
  if (!current) return { ok: false, error: "Không tìm thấy hàng" };

  if (data.itemCode !== current.itemCode) {
    const dup = await db.inventoryItem.findUnique({
      where: { itemCode: data.itemCode },
      select: { id: true },
    });
    if (dup && dup.id !== id) {
      return { ok: false, error: `Mã hàng "${data.itemCode}" đã tồn tại` };
    }
  }

  try {
    await db.inventoryItem.update({ where: { id }, data });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
  revalidatePath("/inventory/items");
  revalidatePath(`/inventory/items/${id}/edit`);
  return { ok: true };
}

export async function deleteItem(id: string): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const nonZero = await db.stockBalance.findFirst({
    where: {
      itemId: id,
      OR: [{ quantity: { gt: 0 } }, { reserved: { gt: 0 } }],
    },
    select: { id: true },
  });
  if (nonZero) {
    return {
      ok: false,
      error:
        "Còn tồn (quantity hoặc reserved > 0) ở ít nhất một cơ sở. Xuất hết hoặc giảm tồn về 0 trước khi xoá.",
    };
  }

  try {
    await db.inventoryItem.delete({ where: { id } });
  } catch (err) {
    return {
      ok: false,
      error: `Không xoá được: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
  revalidatePath("/inventory/items");
  return { ok: true };
}

export async function deleteItemAndRedirect(id: string): Promise<Result> {
  const res = await deleteItem(id);
  if (!res.ok) return res;
  redirect("/inventory/items");
}

const ThresholdSchema = z.object({
  itemId: z.string().min(1),
  centerId: z.string().min(1),
  minThreshold: z
    .union([z.coerce.number().int().min(0), z.null()])
    .optional()
    .transform((v) => (v === undefined ? null : v)),
});

export async function updateMinThreshold(
  input: z.infer<typeof ThresholdSchema>,
): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = ThresholdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Tham số không hợp lệ" };
  }

  try {
    await db.stockBalance.update({
      where: {
        itemId_centerId: {
          itemId: parsed.data.itemId,
          centerId: parsed.data.centerId,
        },
      },
      data: { minThreshold: parsed.data.minThreshold },
    });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
  revalidatePath(`/inventory/items/${parsed.data.itemId}/edit`);
  return { ok: true };
}

// Initialize StockBalance=0 for a newly-active center across all items.
// Called manually after activating a center; safe to re-run thanks to
// skipDuplicates on the unique (itemId, centerId).
export async function syncBalancesForCenter(
  centerId: string,
): Promise<Result<{ created: number }>> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const items = await db.inventoryItem.findMany({ select: { id: true } });
  if (items.length === 0) return { ok: true, data: { created: 0 } };

  try {
    const result = await db.stockBalance.createMany({
      data: items.map((i) => ({
        itemId: i.id,
        centerId,
        quantity: 0,
        reserved: 0,
      })),
      skipDuplicates: true,
    });
    return { ok: true, data: { created: result.count } };
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
}
