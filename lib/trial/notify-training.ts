// lib/trial/notify-training.ts — GĐ3.
//
// Tìm người của bộ phận ĐÀO TẠO để báo khi có ca trải nghiệm cần phân công giáo viên.
//
// ⚠️ Vì sao tra theo `User.roles` (enum v1) chứ không theo `UserOrgRole` (v2):
// máy local, CI và dev chạy RBAC v1, chỉ prod bật v2. Tra bằng `UserOrgRole` thì ở
// mọi nơi trừ prod danh sách người nhận sẽ RỖNG, và thông báo im lặng không đến ai —
// đúng loại hỏng câm khó phát hiện nhất. Cột `roles` có ở cả hai chế độ.
//
// Đổi lại, ai được nhận tin phụ thuộc cột `roles` chứ không phụ thuộc bảng quyền động.
// Đó là đánh đổi có chủ đích: thông báo là tiện ích nhắc việc, không phải cổng bảo mật —
// cổng bảo mật vẫn là `checkPermission("trials:assign-teacher")` ở action.
import { db } from "@/lib/db";
import { notifyStaff } from "@/lib/notifications/notify";

/** Vai được báo khi có ca chờ phân công. Đào tạo là người quyết; Admin để dự phòng. */
const VAI_NHAN_TIN = ["TRAINING", "SUPER_ADMIN"] as const;

/**
 * Người của bộ phận Đào tạo. `centerId` chỉ dùng để THU HẸP khi có người Đào tạo gắn
 * cơ sở; người Đào tạo Hội sở (`centerId` null) LUÔN nhận, vì họ phụ trách mọi cơ sở.
 */
export async function layNguoiDaoTao(centerId: string | null): Promise<string[]> {
  const rows = await db.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      roles: { hasSome: [...VAI_NHAN_TIN] },
      ...(centerId ? { OR: [{ centerId }, { centerId: null }] } : {}),
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Báo Đào tạo có ca trải nghiệm chờ phân công giáo viên.
 *
 * Non-fatal: hỏng chuông KHÔNG được làm hỏng việc xếp lịch. `dedupeKey` gắn theo ca
 * nên xếp đi xếp lại cùng một ca không dội chuông nhiều lần; `reopen` bật để lần dời
 * lịch sau kéo tin về chưa đọc (việc đã đổi, người ta cần thấy lại).
 */
export async function baoDaoTaoChoPhanCong(params: {
  trialEnrollmentId: string;
  centerId: string | null;
  childName: string;
  className: string;
  /** Buổi mới, dạng người đọc — vd "Buổi 2 · 05/09/2026 18:00". Bỏ trống thì không nhắc giờ. */
  moTaBuoi?: string | null;
  /** true = ca này vừa bị dời lịch (khác với ca mới xếp lần đầu). */
  laDoiLich?: boolean;
}): Promise<void> {
  try {
    const userIds = await layNguoiDaoTao(params.centerId);
    if (userIds.length === 0) return;

    const dau = params.laDoiLich ? "Ca trải nghiệm vừa dời lịch" : "Ca trải nghiệm chờ phân công";
    const than = params.laDoiLich
      ? `${params.childName} (lớp ${params.className}) đã dời sang ${params.moTaBuoi ?? "buổi khác"} và MẤT phân công giáo viên. Cần phân công lại.`
      : `${params.childName} vừa được xếp vào lớp ${params.className}${params.moTaBuoi ? ` — ${params.moTaBuoi}` : ""}. Cần phân công giáo viên.`;

    await notifyStaff({
      userIds,
      // Mốc thời gian KHÔNG nằm trong khoá: một ca dời lịch nhiều lần vẫn là một việc
      // cần làm, không phải nhiều việc. `reopen` lo phần "kéo về chưa đọc".
      dedupeKey: `trial.cho-phan-cong:${params.trialEnrollmentId}`,
      category: "TRIAL",
      title: dau,
      body: than,
      href: "/lop-trial",
      entityId: params.trialEnrollmentId,
      reopen: true,
    });
  } catch (e) {
    console.error("[trial:baoDaoTaoChoPhanCong]", e);
  }
}
