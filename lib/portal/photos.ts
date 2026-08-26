import "server-only";
import { db } from "@/lib/db";
import { hasMediaConsent } from "@/lib/lms/media-consent";
import { resolveMediaUrl } from "@/lib/storage/signed-url";
import { meaningfulSessionTitle } from "@/lib/lms/session-project-name";

// Portal v2 — ảnh lớp theo buổi của con đang chọn. Cùng luật với bản v1 (C6.2):
// ảnh APPROVED và (được GẮN THẺ con HOẶC đánh dấu "Ảnh chung cả lớp").
// Gate theo StudentConsent CLASS_MEDIA (privacy C3/C6). URL đi qua
// resolveMediaUrl → signed URL khi bật MEDIA_SIGNED_URL (OFF → fileUrl trần).

const ACTIVE = ["CONFIRMED", "STUDYING", "ACTIVE"] as const;

export type PhotoItem = { id: string; caption: string | null; url: string };
export type PhotoGroup = { sessionId: string; order: number | null; title: string; dateISO: string; photos: PhotoItem[] };
export type StudentPhotos = { consentGranted: boolean; className: string | null; total: number; groups: PhotoGroup[] };

export async function getStudentPhotos(studentId: string): Promise<StudentPhotos> {
  const consentGranted = await hasMediaConsent(studentId);
  if (!consentGranted) return { consentGranted: false, className: null, total: 0, groups: [] };

  const enr = await db.enrollment.findMany({
    where: { studentId, status: { in: [...ACTIVE] }, deletedAt: null },
    select: { classId: true, class: { select: { classCode: true } } },
  });
  const classIds = enr.map((e) => e.classId);
  const className = enr[0]?.class?.classCode ?? null;
  if (classIds.length === 0) return { consentGranted: true, className, total: 0, groups: [] };

  const media = await db.classSessionMedia.findMany({
    where: {
      classId: { in: classIds },
      status: "APPROVED",
      OR: [
        { tags: { some: { studentId } } }, // ảnh gắn thẻ con
        { isClassWide: true }, // ảnh chung cả lớp
      ],
    },
    orderBy: { takenAt: "asc" },
    select: { id: true, caption: true, fileUrl: true, classSessionId: true, takenAt: true },
    take: 200,
  });

  // Signed URL khi bật MEDIA_SIGNED_URL — cùng helper với bản v1.
  const urls = await Promise.all(media.map((m) => resolveMediaUrl(m.fileUrl)));

  const sessionIds = [...new Set(media.map((m) => m.classSessionId).filter((x): x is string => !!x))];
  const sessions = sessionIds.length
    ? await db.classSession.findMany({
        where: { id: { in: sessionIds } },
        select: { id: true, date: true, lesson: { select: { order: true, title: true } } },
      })
    : [];
  const smap = new Map(sessions.map((s) => [s.id, s]));

  const byS = new Map<string, PhotoGroup>();
  media.forEach((m, i) => {
    const key = m.classSessionId ?? "khac";
    if (!byS.has(key)) {
      const ses = m.classSessionId ? smap.get(m.classSessionId) : undefined;
      const les = ses?.lesson;
      const lesTitle = meaningfulSessionTitle(les?.title);
      byS.set(key, {
        sessionId: key,
        order: les?.order ?? null,
        // 26/08 — cắt tiền tố "Buổi N —" thừa của tên bài trước khi ghép (xem
        // lib/lms/session-project-name.ts), kẻo ra "Buổi 7: Buổi 7 — …".
        title: lesTitle ? `Buổi ${les?.order}: ${lesTitle}` : "Buổi học",
        dateISO: (ses?.date ?? m.takenAt)?.toISOString() ?? "",
        photos: [],
      });
    }
    byS.get(key)!.photos.push({ id: m.id, caption: m.caption, url: urls[i] ?? m.fileUrl });
  });
  const groups = [...byS.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return { consentGranted: true, className, total: media.length, groups };
}
