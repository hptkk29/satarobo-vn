"use server";

// Sửa danh mục LOẠI CÔNG DẠY — hệ số, cách tính, bật/tắt.
//
// Đây là toàn bộ phần "tự tạo tự add được qua hệ thống chứ không cần code" mà chủ dự án yêu
// cầu: BLĐ muốn tính công cho buổi trải nghiệm thì bật dòng đó lên và đặt hệ số, không cần
// deploy. Sáu dòng là cố định (nguồn × vai) nên màn không có nút Thêm/Xoá — thêm một tổ hợp
// thứ bảy là việc của dữ liệu buổi, không phải của danh mục.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { writeAudit } from "@/lib/audit/audit-log";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { HO_CENTER_ID } from "@/lib/cham-cong/home-center";

type Res = { ok: true } | { ok: false; error: string };

const schema = z.object({
  code: z.string().min(1),
  basis: z.enum(["PER_SESSION", "PER_HOUR"]),
  // Hệ số âm là trừ công dạy — không có nghĩa nào đúng, chặn ở đây thay vì để ai đó gõ nhầm
  // dấu trừ rồi cả kỳ ra số lạ.
  factor: z.coerce.number().min(0).max(10),
  countsInPeriod: z.boolean(),
  isActive: z.boolean(),
});

export async function saveTeachingCreditTypeAction(input: unknown): Promise<Res> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };

  // Danh mục DÙNG CHUNG mọi cơ sở ⇒ gác ở Hội sở, giống Loại nghỉ. Để cấp cơ sở sửa được là
  // mỗi nơi một hệ số mà tổng công dạy toàn hệ thống thì không ai giải thích nổi.
  if (!(await checkPermission("hr_attendance:config", { centerId: HO_CENTER_ID }))) {
    return { ok: false, error: "Sửa hệ số công dạy cần quyền cấu hình tại Hội sở" };
  }

  const sdb = scopedDb(await resolveActor(session.user.id));
  const old = await sdb.teachingCreditType.findUnique({
    where: { code: p.data.code },
    select: { id: true, basis: true, factor: true, countsInPeriod: true, isActive: true },
  });
  if (!old) return { ok: false, error: "Không tìm thấy loại công dạy này" };

  await sdb.teachingCreditType.update({
    where: { code: p.data.code },
    data: {
      basis: p.data.basis,
      factor: p.data.factor,
      countsInPeriod: p.data.countsInPeriod,
      isActive: p.data.isActive,
    },
  });

  await writeAudit({
    actor: { id: session.user.id, name: session.user.name ?? "" },
    module: "hr_attendance",
    entityType: "TeachingCreditType",
    entityId: p.data.code,
    action: "UPDATE",
    oldValues: { basis: old.basis, factor: old.factor, countsInPeriod: old.countsInPeriod, isActive: old.isActive },
    newValues: { basis: p.data.basis, factor: p.data.factor, countsInPeriod: p.data.countsInPeriod, isActive: p.data.isActive },
  });
  revalidatePath("/cham-cong/cong-day");
  revalidatePath("/cham-cong/ky-cong");
  return { ok: true };
}
