import { requireActiveStudent } from "@/lib/portal/session";
import { db } from "@/lib/db";
import { hasMediaConsent } from "@/lib/lms/media-consent";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hình ảnh | Sata Robo", robots: { index: false } };

const ACTIVE_ENROLLMENT = ["CONFIRMED", "STUDYING", "ACTIVE"] as const;

export default async function HinhAnhPage() {
  const { studentId } = await requireActiveStudent();

  // Privacy (C3.2/C6.4): chỉ hiện ảnh khi PH đã ĐỒNG Ý dùng hình ảnh. Thu hồi → ẩn ngay.
  const consentGranted = await hasMediaConsent(studentId);

  // Lớp của con + ảnh APPROVED có tag con (chỉ ảnh được gắn thẻ con mới hiện).
  const enr = await db.enrollment.findMany({
    where: { studentId, status: { in: [...ACTIVE_ENROLLMENT] } },
    select: { classId: true },
  });
  const classIds = enr.map((e) => e.classId);

  const media =
    consentGranted && classIds.length > 0
      ? await db.classSessionMedia.findMany({
          where: {
            classId: { in: classIds },
            status: "APPROVED",
            tags: { some: { studentId } },
          },
          select: { id: true, fileUrl: true, caption: true, approvedAt: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      : [];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-neutral-900">Hình ảnh</h1>
      <p className="-mt-3 text-sm text-neutral-500">
        Ảnh hoạt động của con tại lớp (đã được trung tâm duyệt).
      </p>

      {media.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          Chưa có hình ảnh nào.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {media.map((m) => (
            <figure
              key={m.id}
              className="overflow-hidden rounded-xl border border-neutral-200 bg-white"
            >
              <a href={m.fileUrl} target="_blank" rel="noopener noreferrer">
                <img
                  src={m.fileUrl}
                  alt={m.caption ?? "Ảnh lớp"}
                  className="h-32 w-full object-cover sm:h-40"
                />
              </a>
              {m.caption && (
                <figcaption className="p-2 text-xs text-neutral-600">{m.caption}</figcaption>
              )}
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
