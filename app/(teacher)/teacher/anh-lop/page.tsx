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
// getClassUploadContext của admin (gate canPublishToClass: GV lớp teacherId/assistantId
// → GV đăng ĐƯỢC, ảnh vào PENDING chờ QL duyệt). GV chỉ XEM mọi status (cần biết ảnh
// nào chưa duyệt) + đăng — KHÔNG có nút duyệt/xoá (media:approve = QL).
// 11/08: kho (DRAFT) của lớp còn nhận ảnh do Marketing/Giáo vụ góp (media:upload-draft)
// — GV là người DUY NHẤT chọn ảnh trong kho gửi phụ huynh.
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
import { getNonConsentStudents } from "@/lib/lms/media-consent";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "../_components/ui/page-header";
import { EmptyState } from "../_components/ui/empty-state";
import { UploadPhotoDialog } from "./_components/upload-photo-dialog";
import { DraftStorePanel, type DraftItem } from "./_components/draft-store-panel";
import { BackLink } from "../_components/ui/back-link";

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
  PENDING: {
    label: "Chờ duyệt",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  APPROVED: {
    label: "Đã duyệt",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-200",
  },
  REJECTED: {
    label: "Từ chối",
    cls: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  },
  // Kho ảnh — GV upload cả loạt, CHƯA chọn gửi PH (không hiện portal, không vào hàng duyệt).
  DRAFT: {
    label: "Trong kho",
    cls: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  },
};

// Cover gradient album (port visual mock media/page.tsx `album.cover`) — xoay vòng theo
// lớp. Chỉ dùng hue được phép ở site GV (bỏ tím/violet) — cam/sky/emerald/amber/cyan.
const COVERS = [
  "from-orange-400 to-orange-600",
  "from-sky-400 to-blue-600",
  "from-emerald-400 to-teal-600",
  "from-amber-400 to-orange-600",
  "from-cyan-400 to-sky-600",
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
          // Kho có ảnh của nhiều vai (GV/Marketing/Giáo vụ — chốt 11/08) → hiện tên
          // người tải lên trên thẻ ảnh trong kho. Chỉ TÊN NHÂN SỰ, không PII PH.
          uploadedByName: true,
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
    // Ảnh DRAFT (kho — chưa gửi PH) TÁCH RIÊNG khỏi album, render ở DraftStorePanel.
    const groups = new Map<string, AlbumGroup>();
    const draftItems: DraftItem[] = [];
    media.forEach((m, i) => {
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
      if (m.status === "DRAFT") {
        draftItems.push({
          id: m.id,
          url: displayUrls[i] ?? m.fileUrl,
          label,
          uploader: m.uploadedByName,
        });
        return;
      }
      const view: MediaView = {
        id: m.id,
        url: displayUrls[i] ?? m.fileUrl,
        status: m.status,
        caption: m.caption,
        isClassWide: m.isClassWide,
        tagNames: m.tags.map((t) => nameMap.get(t.studentId) ?? "?"),
      };
      const g = groups.get(key);
      if (g) g.items.push(view);
      else groups.set(key, { key, label, sortKey, items: [view] });
    });
    const ordered = [...groups.values()].sort((a, b) => b.sortKey - a.sortKey);

    // Roster cho panel kho (chip chọn HS + disable chưa consent) — CÙNG nguồn dữ liệu
    // getClassUploadContext của dialog upload. Câu 46: chỉ id + TÊN học viên.
    // B3: kèm danh sách BUỔI của lớp để GV gán buổi ngay lúc gửi (publishClassMedia đã
    // nhận classSessionId từ trước — chỉ nối UI); mặc định buổi gần nhất ĐÃ diễn ra.
    let rosterStudents: { id: string; name: string }[] = [];
    let nonConsentIds: string[] = [];
    let sessionOptions: { id: string; label: string }[] = [];
    let defaultSessionId = "";
    if (draftItems.length > 0) {
      const [enrRows, nonConsent, sessionRows] = await Promise.all([
        xdb.enrollment.findMany({
          where: { classId, status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } },
          select: { student: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        }),
        getNonConsentStudents(classId),
        // ClassSession ∈ MAKEUP_EXCEPTION_MODELS — cùng đường đọc sessionMap ở trên.
        xdb.classSession.findMany({
          where: { classId, status: { not: "CANCELLED" } },
          select: { id: true, date: true, topic: true },
          orderBy: { date: "desc" },
          take: 200,
        }),
      ]);
      rosterStudents = enrRows.map((e) => e.student);
      nonConsentIds = nonConsent.map((s) => s.id);
      sessionOptions = sessionRows.map((sn) => ({
        id: sn.id,
        label: `${dayFmt.format(sn.date)}${sn.topic ? ` · ${sn.topic}` : ""}`,
      }));
      const now = new Date();
      defaultSessionId = sessionRows.find((sn) => sn.date <= now)?.id ?? "";
    }

    return (
      <div className="space-y-6">
        <BackLink href="?" label="Ảnh lớp" />
        <PageHeader
          title={`Ảnh lớp — ${cls?.name ?? "Lớp"}`}
          subtitle="Ảnh gom theo buổi học. Bạn đăng ảnh → quản lý duyệt → phụ huynh xem ảnh con được gắn thẻ (hoặc ảnh chung lớp)."
          actions={<UploadPhotoDialog classId={classId} />}
        />

        {/* Kho ảnh — chưa gửi PH: multi-select + gắn HS/cả lớp + gửi/xoá (client) */}
        {draftItems.length > 0 && (
          <DraftStorePanel
            drafts={draftItems}
            students={rosterStudents}
            nonConsentIds={nonConsentIds}
            sessions={sessionOptions}
            defaultSessionId={defaultSessionId}
          />
        )}

        {media.length === 0 ? (
          <EmptyBox text="Lớp chưa có ảnh nào — bấm “Đăng ảnh lớp” để tải ảnh buổi học." />
        ) : ordered.length === 0 ? null : (
          <div className="space-y-6">
            {ordered.map((g) => (
              <section key={g.key}>
                <div className="mb-2 flex items-center gap-2">
                  <Images className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden />
                  <h2 className="text-sm font-bold capitalize text-foreground">{g.label}</h2>
                  <Badge variant="outline">{g.items.length} ảnh</Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {g.items.map((m) => (
                    <figure key={m.id} className="t-card overflow-hidden">
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
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                              Ảnh chung lớp
                            </span>
                          )}
                        </div>
                        {m.caption && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">{m.caption}</p>
                        )}
                        {m.tagNames.length > 0 && (
                          <p className="truncate text-[11px] text-muted-foreground">
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
  const statByClass = new Map<
    string,
    { total: number; pending: number; draft: number; latest: Date | null }
  >();
  for (const s of stats) {
    const cur =
      statByClass.get(s.classId) ?? { total: 0, pending: 0, draft: 0, latest: null };
    cur.total += s._count._all;
    if (s.status === "PENDING") cur.pending += s._count._all;
    if (s.status === "DRAFT") cur.draft += s._count._all;
    const max = s._max.createdAt;
    if (max && (!cur.latest || max > cur.latest)) cur.latest = max;
    statByClass.set(s.classId, cur);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ảnh lớp"
        subtitle="Ảnh các buổi học ở những lớp bạn phụ trách — chọn lớp để xem album và đăng ảnh mới."
      />
      {classes.length === 0 ? (
        <EmptyBox text="Bạn chưa được phân công lớp nào." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c, i) => {
            const st =
              statByClass.get(c.id) ?? { total: 0, pending: 0, draft: 0, latest: null };
            return (
              // href CHỈ-query (giữ path hiện tại): chạy đúng cả trên host giaovien
              // (clean URL /anh-lop) LẪN localhost/preview (path thật /teacher/anh-lop).
              <Link key={c.id} href={`?classId=${c.id}`} className="block">
                <div className="t-card t-card-hover h-full overflow-hidden">
                  <div className={cn("h-28 bg-gradient-to-br", COVERS[i % COVERS.length])} />
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <h2 className="font-semibold text-foreground">{c.name}</h2>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Images className="h-4 w-4" aria-hidden />
                        {st.total} ảnh
                      </span>
                      {st.latest && (
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4" aria-hidden />
                          {shortFmt.format(st.latest)}
                        </span>
                      )}
                    </div>
                    {(st.pending > 0 || st.draft > 0) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {st.pending > 0 && (
                          <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                            {st.pending} chờ duyệt
                          </span>
                        )}
                        {st.draft > 0 && (
                          <span className="inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                            {st.draft} trong kho
                          </span>
                        )}
                      </div>
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

function EmptyBox({ text }: { text: string }) {
  return <EmptyState icon={Images} title={text} />;
}

function NotYours() {
  return (
    <div className="space-y-4">
      <BackLink href="?" label="Ảnh lớp" />
      <EmptyBox text="Lớp không thuộc danh sách bạn phụ trách." />
    </div>
  );
}
