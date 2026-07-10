// app/(teacher)/teacher/anh-lop/page.tsx — #06 (L6): màn "Ảnh lớp" site GV
// (port VISUAL từ mock satarobo-ui-giaovien: media/page.tsx grid album theo lớp
// + class-hub tab "Ảnh lớp" gom ảnh theo buổi — data thật của repo này).
//
// 2 mức điều hướng qua searchParams (pattern lop/page.tsx, href CHỈ-query):
//   (a) không tham số → grid lớp mình (assignedClassIds) + số ảnh / chờ duyệt.
//   (b) ?classId=…    → album của lớp: ảnh gom theo BUỔI (classSessionId → fallback
//                       takenAt → fallback "mức lớp"), badge trạng thái duyệt
//                       (MediaStatus PENDING/APPROVED/REJECTED) + "Ảnh chung lớp".
//
// CONSENT (bất biến C6.2 — CLAUDE.md "media phải tag + tôn trọng StudentConsent"):
// trang này KHÔNG tự viết luật consent — upload TÁI DÙNG uploadClassMedia +
// getClassUploadContext của admin (gate canUploadToClass: GV lớp teacherId/assistantId
// → GV đăng ĐƯỢC, ảnh vào PENDING chờ QL duyệt). GV chỉ XEM mọi status (cần biết ảnh
// nào chưa duyệt) + đăng — KHÔNG có nút duyệt/xoá (media:approve = QL).
//
// Cách ly cơ sở: ClassSessionMedia ∉ SCOPED_MODELS (relation-scoped qua class.centerId,
// xem app/(admin)/admin/media/actions.ts) → đọc pass-through SAU guard assignedClassIds
// (ranh giới thật). Class/ClassSession đọc qua withMakeupException như lop/page.tsx
// (GV dạy bù liên cơ sở vẫn thấy đúng lớp/buổi mình phụ trách).
// ⚠️ Câu 46: tag chỉ hiện TÊN học viên — KHÔNG SĐT/email/tên phụ huynh trong payload.
import Link from "next/link";
import { Calendar, ChevronRight, Images } from "lucide-react";
import type { MediaStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { withMakeupException } from "@/lib/db-scope";
import { resolveMediaUrls } from "@/lib/storage/signed-url";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { UploadPhotoDialog } from "./_components/upload-photo-dialog";

export const metadata = { title: "Ảnh lớp | Giáo viên Sata Robo" };

// Nhãn ngày giờ VN — cùng quy ước các trang GV khác (lop/bang-cong).
const dayFmt = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});
const shortFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});
/** "YYYY-MM-DD" theo giờ VN — khóa gộp nhóm ảnh chỉ có takenAt (không gắn buổi). */
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

// Đồng bộ nhãn/màu trạng thái duyệt với admin media-client (Chờ/Duyệt/Từ chối).
const MEDIA_STATUS: Record<MediaStatus, { label: string; cls: string }> = {
  PENDING: { label: "Chờ duyệt", cls: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Đã duyệt", cls: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "Từ chối", cls: "bg-rose-100 text-rose-700" },
};

// Cover gradient album (port visual mock media/page.tsx `album.cover`) — xoay vòng theo lớp.
const COVERS = [
  "from-orange-400 to-purple-600",
  "from-sky-400 to-blue-600",
  "from-emerald-400 to-teal-600",
  "from-violet-400 to-purple-600",
  "from-amber-400 to-orange-500",
];

/** 1 ảnh trong album — payload đã lọc theo câu 46 (tag chỉ TÊN học viên). */
type MediaView = {
  id: string;
  url: string;
  status: MediaStatus;
  caption: string | null;
  isClassWide: boolean;
  tagNames: string[];
};
/** 1 nhóm album: theo buổi / theo ngày chụp / mức lớp (chưa gắn buổi). */
type AlbumGroup = { key: string; label: string; sortKey: number; items: MediaView[] };

export default async function TeacherClassPhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate — guard cho type-narrow

  const { classId } = await searchParams;
  const actor = await resolveActor(session.user.id);
  const xdb = withMakeupException(actor);
  const classIds = [...actor.assignedClassIds];

  // ── (b) Album 1 lớp: ảnh gom theo buổi ───────────────────────────────────────
  if (classId) {
    // Guard assigned (chống IDOR): lớp không phải của mình → không xem, không lộ tên lớp.
    if (!actor.assignedClassIds.has(classId)) return <NotYours />;

    const [cls, media] = await Promise.all([
      xdb.class.findUnique({ where: { id: classId }, select: { name: true } }),
      // ClassSessionMedia ∉ SCOPED_MODELS → pass-through sau guard assigned ở trên.
      // GV thấy MỌI status (kể cả PENDING/REJECTED của lớp mình) — khác portal PH
      // (chỉ APPROVED + consent, lo ở isMediaVisibleForStudent).
      xdb.classSessionMedia.findMany({
        where: { classId },
        select: {
          id: true,
          fileUrl: true,
          caption: true,
          status: true,
          isClassWide: true,
          classSessionId: true,
          takenAt: true,
          createdAt: true,
          tags: { select: { studentId: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 400,
      }),
    ]);

    // Buổi được ảnh tham chiếu (nhãn nhóm) — ClassSession ∈ MAKEUP_EXCEPTION_MODELS.
    const sessionIds = [
      ...new Set(media.map((m) => m.classSessionId).filter((x): x is string => !!x)),
    ];
    const sessions = sessionIds.length
      ? await xdb.classSession.findMany({
          where: { id: { in: sessionIds } },
          select: { id: true, date: true, topic: true },
        })
      : [];
    const sessionMap = new Map(sessions.map((s) => [s.id, s]));

    // Tên HS được tag — câu 46: CHỈ name. Student vẫn scoped (không nới) → ngoài
    // tầm nhìn (hiếm, ảnh cũ HV chuyển cơ sở) hiện "?" như admin media page.
    const studentIds = [...new Set(media.flatMap((m) => m.tags.map((t) => t.studentId)))];
    const students = studentIds.length
      ? await xdb.student.findMany({
          where: { id: { in: studentIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = new Map(students.map((s) => [s.id, s.name]));

    // Signed URL khi bật flag MEDIA_SIGNED_URL (OFF → fileUrl trần) — như admin.
    const displayUrls = await resolveMediaUrls(media.map((m) => m.fileUrl));

    // Gom nhóm: buổi → ngày chụp → mức lớp (fallback), nhóm mới nhất lên đầu.
    const groups = new Map<string, AlbumGroup>();
    media.forEach((m, i) => {
      const view: MediaView = {
        id: m.id,
        url: displayUrls[i] ?? m.fileUrl,
        status: m.status,
        caption: m.caption,
        isClassWide: m.isClassWide,
        tagNames: m.tags.map((t) => nameMap.get(t.studentId) ?? "?"),
      };
      const ses = m.classSessionId ? sessionMap.get(m.classSessionId) : undefined;
      let key: string;
      let label: string;
      let sortKey: number;
      if (ses) {
        key = `s:${ses.id}`;
        label = `Buổi ${dayFmt.format(ses.date)}${ses.topic ? ` · ${ses.topic}` : ""}`;
        sortKey = ses.date.getTime();
      } else if (m.takenAt) {
        key = `d:${dayKeyFmt.format(m.takenAt)}`;
        label = `Ngày ${shortFmt.format(m.takenAt)} (chưa gắn buổi)`;
        sortKey = m.takenAt.getTime();
      } else {
        key = "class";
        label = "Ảnh mức lớp (chưa gắn buổi)";
        sortKey = Number.NEGATIVE_INFINITY; // luôn xếp cuối
      }
      const g = groups.get(key);
      if (g) g.items.push(view);
      else groups.set(key, { key, label, sortKey, items: [view] });
    });
    const ordered = [...groups.values()].sort((a, b) => b.sortKey - a.sortKey);

    return (
      <div className="space-y-6">
        <BackLink href="?" label="← Ảnh lớp" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">
              Ảnh lớp — {cls?.name ?? "Lớp"}
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Ảnh gom theo buổi học. Bạn đăng ảnh → quản lý duyệt → phụ huynh xem
              ảnh con được gắn thẻ (hoặc ảnh chung lớp).
            </p>
          </div>
          <UploadPhotoDialog classId={classId} />
        </div>

        {media.length === 0 ? (
          <EmptyBox text="Lớp chưa có ảnh nào — bấm “Đăng ảnh lớp” để tải ảnh buổi học." />
        ) : (
          <div className="space-y-6">
            {ordered.map((g) => (
              <section key={g.key}>
                <div className="mb-2 flex items-center gap-2">
                  <Images className="h-4 w-4 text-purple-700" />
                  <h2 className="text-sm font-bold capitalize text-neutral-900">{g.label}</h2>
                  <Badge variant="outline">{g.items.length} ảnh</Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {g.items.map((m) => (
                    <figure
                      key={m.id}
                      className="overflow-hidden rounded-xl border border-neutral-200 bg-white"
                    >
                      {/* Preview thumbnail (R2 / presigned) — <img> như admin media-client */}
                      <img
                        src={m.url}
                        alt={m.caption ?? "Ảnh lớp"}
                        className="aspect-square w-full object-cover"
                      />
                      <figcaption className="space-y-1 p-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              MEDIA_STATUS[m.status].cls,
                            )}
                          >
                            {MEDIA_STATUS[m.status].label}
                          </span>
                          {m.isClassWide && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                              Ảnh chung lớp
                            </span>
                          )}
                        </div>
                        {m.caption && (
                          <p className="line-clamp-2 text-xs text-neutral-600">{m.caption}</p>
                        )}
                        {m.tagNames.length > 0 && (
                          <p className="truncate text-[11px] text-neutral-400">
                            Tag: {m.tagNames.join(", ")}
                          </p>
                        )}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── (a) Grid album theo lớp mình (port visual mock media/page.tsx) ────────────
  const classes = classIds.length
    ? await xdb.class.findMany({
        where: { id: { in: classIds } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];
  // Thống kê ảnh theo lớp (1 query): tổng + số chờ duyệt + ảnh mới nhất.
  const stats = classIds.length
    ? await xdb.classSessionMedia.groupBy({
        by: ["classId", "status"],
        where: { classId: { in: classIds } },
        _count: { _all: true },
        _max: { createdAt: true },
      })
    : [];
  const statByClass = new Map<string, { total: number; pending: number; latest: Date | null }>();
  for (const s of stats) {
    const cur = statByClass.get(s.classId) ?? { total: 0, pending: 0, latest: null };
    cur.total += s._count._all;
    if (s.status === "PENDING") cur.pending += s._count._all;
    const max = s._max.createdAt;
    if (max && (!cur.latest || max > cur.latest)) cur.latest = max;
    statByClass.set(s.classId, cur);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Ảnh lớp</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Ảnh các buổi học ở những lớp bạn phụ trách — chọn lớp để xem album và đăng
          ảnh mới.
        </p>
      </div>
      {classes.length === 0 ? (
        <EmptyBox text="Bạn chưa được phân công lớp nào." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c, i) => {
            const st = statByClass.get(c.id) ?? { total: 0, pending: 0, latest: null };
            return (
              // href CHỈ-query (giữ path hiện tại): chạy đúng cả trên host giaovien
              // (clean URL /anh-lop) LẪN localhost/preview (path thật /teacher/anh-lop).
              <Link key={c.id} href={`?classId=${c.id}`} className="block">
                <div className="h-full overflow-hidden rounded-xl border border-neutral-200 bg-white transition-colors hover:border-neutral-400">
                  <div className={cn("h-28 bg-gradient-to-br", COVERS[i % COVERS.length])} />
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <h2 className="font-semibold text-neutral-900">{c.name}</h2>
                      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm text-neutral-500">
                      <span className="flex items-center gap-1.5">
                        <Images className="h-4 w-4" />
                        {st.total} ảnh
                      </span>
                      {st.latest && (
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4" />
                          {shortFmt.format(st.latest)}
                        </span>
                      )}
                    </div>
                    {st.pending > 0 && (
                      <span className="mt-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                        {st.pending} chờ duyệt
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-sm text-neutral-500 hover:text-neutral-800">
      {label}
    </Link>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
      <p className="text-sm text-neutral-500">{text}</p>
    </div>
  );
}

function NotYours() {
  return (
    <div className="space-y-4">
      <BackLink href="?" label="← Ảnh lớp" />
      <EmptyBox text="Lớp không thuộc danh sách bạn phụ trách." />
    </div>
  );
}
