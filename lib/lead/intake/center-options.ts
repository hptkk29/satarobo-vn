import "server-only";
import { scopedDb } from "@/lib/db-scope";
import { getNonEnrollableCenterIds } from "@/lib/enrollment-flow";
import type { Actor } from "@/lib/auth/actor";

export type IntakeCenterOption = { code: string; name: string };

/**
 * Danh sách cơ sở cho ô "Cơ sở phụ huynh chọn" của biểu mẫu nhập khách.
 *
 * Tách khỏi trang để **site Sale sau này dùng lại nguyên vẹn** — chép tay đoạn
 * lọc này sang chỗ thứ hai là mở đường cho hai biểu mẫu lệch nhau, đúng kiểu
 * hỏng đã gặp với hai màn nhận xét buổi học.
 *
 * ⚠️ Chủ dự án chốt 04/08: **lead KHÔNG BAO GIỜ về Hội sở** — chỉ cơ sở dạy học
 * mới nhận lead. Dùng đúng `getNonEnrollableCenterIds()` mà `autoAssignNewLead`
 * dùng để chia lead, để hai đường không lệch nhau. Mở CS3 = thêm data, KHÔNG
 * sửa code.
 *
 * Đi qua `scopedDb(actor)` nên người cấp cơ sở chỉ thấy cơ sở của mình.
 */
export async function loadIntakeCenterOptions(
  actor: Actor,
): Promise<IntakeCenterOption[]> {
  const sdb = scopedDb(actor);
  const [centers, nonEnrollable] = await Promise.all([
    sdb.center.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    getNonEnrollableCenterIds(),
  ]);

  return centers
    .filter((c) => c.code && !nonEnrollable.includes(c.id))
    .map((c) => ({ code: c.code as string, name: c.name }));
}
