"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { auth } from "@/lib/auth";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { writeAudit } from "@/lib/audit/audit-log";
import { publishEvent } from "@/lib/events/publish";
import { getR2Client, getR2Bucket } from "@/lib/storage/r2-client";
import { isScormEnabled } from "@/lib/flags";

// =============================================================================
// R7-11/R7-12 — Server Actions cho pipeline SCORM (admin/Đào tạo).
//   createScormPackage  → tạo row UPLOADING + presign PUT zip lên R2.
//   confirmUpload       → PROCESSING + emit scorm.uploaded (job giải nén consume).
//   publishScorm        → TESTING → PUBLISHED.
//   activateForLesson   → bật 1 bản active/buổi (tắt bản khác trong 1 tx); đổi bản
//                         đang dùng cần reason + AuditLog. Bản cũ KHÔNG bị xoá.
//   archiveScorm        → ARCHIVED + tắt active.
// Mọi action: auth + can(training:manage) + isScormEnabled (gate kép).
// =============================================================================

type Result<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

const PRESIGN_TTL_SEC = 3600; // 1h — zip SCORM có thể lớn, cho thời gian upload rộng.

async function gate(): Promise<
  | { ok: true; userId: string; name: string; sdb: ReturnType<typeof scopedDb> }
  | { ok: false; error: string }
> {
  if (!isScormEnabled()) return { ok: false, error: "Tính năng SCORM đang tắt" };
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "training:manage")) return { ok: false, error: "Không có quyền" };
  // ScormPackage/Lesson không center-scoped → scopedDb pass-through (đúng rule R6-F1,
  // không import @/lib/db trần). Quyền đã chặn ở training:manage.
  const sdb = scopedDb(await resolveActor(session.user.id));
  return {
    ok: true,
    userId: session.user.id,
    name: session.user.name ?? session.user.email ?? "—",
    sdb,
  };
}

const createInputSchema = z.object({
  lessonId: z.string().min(1, "Thiếu buổi học"),
  name: z.string().trim().min(1, "Tên gói không được trống").max(200),
  fileName: z.string().trim().min(1, "Thiếu tên tệp"),
  mimeType: z.string().trim().min(1, "Thiếu kiểu tệp"),
  sizeBytes: z.number().int().positive("Kích thước tệp không hợp lệ"),
});

/**
 * Tạo bản ghi ScormPackage trạng thái UPLOADING + presign PUT để browser upload
 * trực tiếp zip lên R2. Version tăng dần theo buổi (bản mới không động bản cũ).
 */
export async function createScormPackage(
  input: unknown,
): Promise<Result<{ id: string; uploadUrl: string; uploadKey: string; expiresIn: number }>> {
  const g = await gate();
  if (!g.ok) return g;

  const parsed = createInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const { lessonId, name, mimeType, sizeBytes } = parsed.data;

  const lesson = await g.sdb.lesson.findUnique({ where: { id: lessonId }, select: { id: true } });
  if (!lesson) return { ok: false, error: "Không tìm thấy buổi học" };

  const last = await g.sdb.scormPackage.findFirst({
    where: { lessonId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (last?.version ?? 0) + 1;

  // storagePrefix/uploadKey phụ thuộc id → tạo row rồi cập nhật.
  const created = await g.sdb.scormPackage.create({
    data: {
      lessonId,
      name,
      version,
      sizeBytes,
      status: "UPLOADING",
      storagePrefix: "pending",
      uploadedById: g.userId,
    },
    select: { id: true },
  });
  const storagePrefix = `scorm/${created.id}/`;
  const uploadKey = `${storagePrefix}source.zip`;
  await g.sdb.scormPackage.update({
    where: { id: created.id },
    data: { storagePrefix, uploadKey },
  });

  let uploadUrl: string;
  try {
    const command = new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: uploadKey,
      ContentType: mimeType,
    });
    uploadUrl = await getSignedUrl(getR2Client(), command, { expiresIn: PRESIGN_TTL_SEC });
  } catch {
    // Dọn row mồ côi nếu không ký được URL.
    await g.sdb.scormPackage.delete({ where: { id: created.id } }).catch(() => {});
    return { ok: false, error: "Không tạo được liên kết upload" };
  }

  await writeAudit({
    actor: { id: g.userId, name: g.name },
    module: "scorm",
    entityType: "ScormPackage",
    entityId: created.id,
    action: "CREATE",
    newValues: { name, lessonId, version, sizeBytes },
  });
  revalidatePath("/admin/scorm");
  return { ok: true, data: { id: created.id, uploadUrl, uploadKey, expiresIn: PRESIGN_TTL_SEC } };
}

/**
 * Xác nhận browser đã PUT xong zip → chuyển PROCESSING + phát scorm.uploaded để
 * job giải nén (đọc manifest, đẩy asset, set TESTING) xử lý. Idempotent qua dedupeKey.
 */
export async function confirmUpload(packageId: string): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  if (!packageId) return { ok: false, error: "Thiếu mã gói" };

  const pkg = await g.sdb.scormPackage.findUnique({
    where: { id: packageId },
    select: { id: true, status: true, uploadKey: true, storagePrefix: true },
  });
  if (!pkg) return { ok: false, error: "Không tìm thấy gói" };
  if (pkg.status !== "UPLOADING" && pkg.status !== "FAILED") {
    return { ok: false, error: "Gói không ở trạng thái chờ upload" };
  }
  if (!pkg.uploadKey) return { ok: false, error: "Gói chưa có tệp upload" };

  await g.sdb.scormPackage.update({
    where: { id: packageId },
    data: { status: "PROCESSING", error: null },
  });
  await publishEvent(
    "scorm.uploaded",
    { packageId, uploadKey: pkg.uploadKey, storagePrefix: pkg.storagePrefix },
    { dedupeKey: `scorm.uploaded:${packageId}` },
  );
  revalidatePath("/admin/scorm");
  return { ok: true };
}

/** TESTING → PUBLISHED (Đào tạo phát hành sau khi xem thử). */
export async function publishScorm(packageId: string): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  if (!packageId) return { ok: false, error: "Thiếu mã gói" };

  const pkg = await g.sdb.scormPackage.findUnique({
    where: { id: packageId },
    select: { id: true, status: true, lessonId: true, name: true },
  });
  if (!pkg) return { ok: false, error: "Không tìm thấy gói" };
  if (pkg.status !== "TESTING") {
    return { ok: false, error: "Chỉ phát hành được gói đang ở trạng thái TESTING" };
  }

  await g.sdb.scormPackage.update({ where: { id: packageId }, data: { status: "PUBLISHED" } });
  await writeAudit({
    actor: { id: g.userId, name: g.name },
    module: "scorm",
    entityType: "ScormPackage",
    entityId: packageId,
    action: "UPDATE",
    oldValues: { status: "TESTING" },
    newValues: { status: "PUBLISHED" },
  });
  revalidatePath("/admin/scorm");
  return { ok: true };
}

/**
 * Đặt 1 gói làm bản active của buổi: tắt bản active khác CÙNG buổi trong 1
 * transaction (partial unique 1 active/lesson). Bản cũ KHÔNG bị xoá (vẫn PUBLISHED).
 * Nếu đang thay bản khác đang dùng → BẮT BUỘC reason + ghi AuditLog (truy vết).
 */
export async function activateForLesson(
  packageId: string,
  reason?: string,
): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  if (!packageId) return { ok: false, error: "Thiếu mã gói" };

  const pkg = await g.sdb.scormPackage.findUnique({
    where: { id: packageId },
    select: { id: true, status: true, lessonId: true, isActiveForLesson: true },
  });
  if (!pkg) return { ok: false, error: "Không tìm thấy gói" };
  if (pkg.status !== "PUBLISHED") {
    return { ok: false, error: "Chỉ kích hoạt được gói đã PUBLISHED" };
  }
  if (pkg.isActiveForLesson) return { ok: true }; // đã active — không làm gì.

  const current = await g.sdb.scormPackage.findFirst({
    where: { lessonId: pkg.lessonId, isActiveForLesson: true, NOT: { id: packageId } },
    select: { id: true, name: true, version: true },
  });
  const cleanReason = reason?.trim();
  if (current && !cleanReason) {
    return { ok: false, error: "Đổi bản đang dùng của buổi cần nêu lý do" };
  }

  await g.sdb.$transaction(async (tx) => {
    if (current) {
      await tx.scormPackage.updateMany({
        where: { lessonId: pkg.lessonId, isActiveForLesson: true, NOT: { id: packageId } },
        data: { isActiveForLesson: false },
      });
    }
    await tx.scormPackage.update({
      where: { id: packageId },
      data: { isActiveForLesson: true },
    });
  });

  await writeAudit({
    actor: { id: g.userId, name: g.name },
    module: "scorm",
    entityType: "ScormPackage",
    entityId: packageId,
    action: "UPDATE",
    reason: cleanReason,
    oldValues: current
      ? { activePackageId: current.id, activeName: current.name, activeVersion: current.version }
      : null,
    newValues: { isActiveForLesson: true, lessonId: pkg.lessonId },
  });
  revalidatePath("/admin/scorm");
  return { ok: true };
}

/** Lưu trữ gói (ARCHIVED) + tắt active. Bản cũ giữ nguyên dữ liệu (không xoá vật lý). */
export async function archiveScorm(packageId: string): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  if (!packageId) return { ok: false, error: "Thiếu mã gói" };

  const pkg = await g.sdb.scormPackage.findUnique({
    where: { id: packageId },
    select: { id: true, status: true },
  });
  if (!pkg) return { ok: false, error: "Không tìm thấy gói" };
  if (pkg.status === "ARCHIVED") return { ok: true };

  await g.sdb.scormPackage.update({
    where: { id: packageId },
    data: { status: "ARCHIVED", isActiveForLesson: false },
  });
  await writeAudit({
    actor: { id: g.userId, name: g.name },
    module: "scorm",
    entityType: "ScormPackage",
    entityId: packageId,
    action: "UPDATE",
    oldValues: { status: pkg.status },
    newValues: { status: "ARCHIVED", isActiveForLesson: false },
  });
  revalidatePath("/admin/scorm");
  return { ok: true };
}
