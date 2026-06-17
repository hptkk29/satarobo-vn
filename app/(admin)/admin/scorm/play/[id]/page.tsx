// app/(admin)/admin/scorm/play/[id]/page.tsx — R7-12: màn hình GV mở bài SCORM.
// Server: resolve gói + buổi → gate canOpenScorm (GV phân công ∪ training:manage),
// ghi ScormAccessLog, cấp vé TTL 10p, render player (blur/watermark client).
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import {
  canOpenScorm,
  canManageTraining,
  type ScormClassSession,
} from "@/lib/scorm/access";
import { isScormEnabled } from "@/lib/flags";
import { signScormTicket } from "@/lib/scorm/ticket";
import { ScormPlayer } from "@/components/admin/scorm-player";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sessionId?: string }>;
}

export default async function ScormPlayPage({ params, searchParams }: PageProps) {
  if (!isScormEnabled()) notFound();

  const { id } = await params;
  const { sessionId: rawSessionId } = await searchParams;
  const sessionId = rawSessionId?.trim() || null;

  const session = await auth();
  if (!session?.user) notFound(); // layout admin đã redirect /login
  const actor = await resolveActor(session.user.id);
  // SCORM/ClassSession/User không center-scoped → scopedDb pass-through (rule R6-F1).
  const sdb = scopedDb(actor);

  const pkg = await sdb.scormPackage.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      launchUrl: true,
      status: true,
      storagePrefix: true,
    },
  });
  if (!pkg || !pkg.launchUrl) notFound();

  // Buổi học (nếu mở theo lớp) → xác GV phân công. Không có buổi → chỉ training:manage qua được.
  let classSession: ScormClassSession = {};
  if (sessionId) {
    const cs = await sdb.classSession.findUnique({
      where: { id: sessionId },
      select: {
        actualTeacherId: true,
        class: { select: { teacherId: true, assistantId: true } },
      },
    });
    if (cs) classSession = cs;
  }

  if (!canOpenScorm(actor, classSession)) notFound();

  // GV chỉ mở gói đã PUBLISHED; người quản lý đào tạo xem thử TESTING/PUBLISHED.
  const canManage = canManageTraining(actor);
  if (pkg.status !== "PUBLISHED" && !canManage) notFound();
  if (pkg.status !== "PUBLISHED" && pkg.status !== "TESTING") notFound();

  // Ghi nhật ký mở (truy vết — không chặn dạy học).
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  await sdb.scormAccessLog.create({
    data: {
      packageId: pkg.id,
      classSessionId: sessionId,
      userId: session.user.id,
      ip,
    },
  });

  // Vé mở (10 phút) — asset resolver xác quyền từng request.
  const ticket = signScormTicket(
    { packageId: pkg.id, sessionId, userId: session.user.id },
    600,
  );

  // Danh tính cho watermark (employeeCode + tên).
  const u = await sdb.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      employee: { select: { employeeCode: true, fullName: true } },
    },
  });
  const name = u?.employee?.fullName ?? u?.name ?? session.user.email ?? "";
  const employeeCode = u?.employee?.employeeCode ?? "";

  return (
    <ScormPlayer
      launchTicket={ticket}
      launchUrl={pkg.launchUrl}
      packageName={pkg.name}
      name={name}
      employeeCode={employeeCode}
    />
  );
}
