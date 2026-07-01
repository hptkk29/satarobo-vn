import "server-only";
import { db } from "@/lib/db";
import { hasMediaConsent } from "@/lib/lms/media-consent";

// Portal v2 — ảnh lớp theo buổi (class-wide, APPROVED) của con đang chọn.
// Gate theo StudentConsent CLASS_MEDIA (privacy C3/C6).

const ACTIVE = ["CONFIRMED", "STUDYING", "ACTIVE"] as const;

export type PhotoItem = { id: string; caption: string | null };
export type PhotoGroup = { sessionId: string; order: number | null; title: string; dateISO: string; photos: PhotoItem[] };
export type StudentPhotos = { consentGranted: boolean; className: string | null; total: number; groups: PhotoGroup[] };

export async function getStudentPhotos(studentId: string): Promise<StudentPhotos> {
  const consentGranted = await hasMediaConsent(studentId);
  if (!consentGranted) return { consentGranted: false, className: null, total: 0, groups: [] };

  const enr = await db.enrollment.findMany({
    where: { studentId, status: { in: [...ACTIVE] } },
    select: { classId: true, class: { select: { classCode: true } } },
  });
  const classIds = enr.map((e) => e.classId);
  const className = enr[0]?.class?.classCode ?? null;
  if (classIds.length === 0) return { consentGranted: true, className, total: 0, groups: [] };

  const media = await db.classSessionMedia.findMany({
    where: { classId: { in: classIds }, status: "APPROVED", isClassWide: true },
    orderBy: { takenAt: "asc" },
    select: { id: true, caption: true, classSessionId: true, takenAt: true },
  });

  const sessionIds = [...new Set(media.map((m) => m.classSessionId).filter((x): x is string => !!x))];
  const sessions = sessionIds.length
    ? await db.classSession.findMany({
        where: { id: { in: sessionIds } },
        select: { id: true, date: true, lesson: { select: { order: true, title: true } } },
      })
    : [];
  const smap = new Map(sessions.map((s) => [s.id, s]));

  const byS = new Map<string, PhotoGroup>();
  for (const m of media) {
    const key = m.classSessionId ?? "khac";
    if (!byS.has(key)) {
      const ses = m.classSessionId ? smap.get(m.classSessionId) : undefined;
      const les = ses?.lesson;
      byS.set(key, {
        sessionId: key,
        order: les?.order ?? null,
        title: les ? `Buổi ${les.order}: ${les.title}` : "Buổi học",
        dateISO: (ses?.date ?? m.takenAt)?.toISOString() ?? "",
        photos: [],
      });
    }
    byS.get(key)!.photos.push({ id: m.id, caption: m.caption });
  }
  const groups = [...byS.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return { consentGranted: true, className, total: media.length, groups };
}
