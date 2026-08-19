import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, AlertCircle } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/auth/permissions";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { AttendanceGrid } from "./_components/attendance-grid";
import { AttendanceSelector } from "./_components/attendance-selector";
import {
  buildSessionAttendanceRows,
  type AttendanceRosterRow,
} from "@/lib/attendance/roster";
import { vnEndOfDay } from "@/lib/time/vn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Điểm danh | Admin" };

interface SearchParams {
  searchParams: Promise<{ sessionId?: string; classId?: string }>;
}

function formatDateTime(d: Date): string {
  const date = new Date(d);
  const time = date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const day = date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `${day} · ${time}`;
}

export default async function AttendanceAdminPage({ searchParams }: SearchParams) {
  const sp = await searchParams;
  const sessionId = sp.sessionId?.trim();
  const classFilter = sp.classId?.trim();

  // LMS-1 / W1-1 — owner-scope cho selector: GV chỉ thấy lớp mình dạy/trợ giảng;
  // CENTER_MANAGER theo cơ sở; SUPER_ADMIN toàn bộ (cùng quy tắc canManageSessionClass).
  const gateUser = (await auth())?.user;
  if (!gateUser) redirect("/login");
  const NONE: Prisma.ClassWhereInput = { id: "__none__" };
  // Cách ly cơ sở (A0-04): Class/ClassSession ∈ SCOPED_MODELS → đọc qua scopedDb.
  const actor = await resolveActor(gateUser.id);
  const sdb = scopedDb(actor);

  // Ai được sửa điểm danh thì phải VÀO ĐƯỢC màn này. Trước 03/08 selector dựng
  // bằng hasRole v1 tĩnh (SA/CM/GV, còn lại NONE) nên CSKH bị chặn trắng, trong khi
  // chính markAttendance cho họ sửa hồi tố 7 ngày qua attendance:edit (Task #16) —
  // họ phải đi vòng qua hub lớp. Nay hỏi đúng quyền, và hỏi THEO TỪNG CƠ SỞ vì
  // `attendance:edit` là scope CENTER (R1: action non-GLOBAL cấm gọi trần).
  const editableCenterIds = (
    await Promise.all(
      actor.visibleCenterIds.map(async (centerId) =>
        (await checkPermission("attendance:edit", { centerId })) ? centerId : null,
      ),
    )
  ).filter((id): id is string => id !== null);

  const classScope: Prisma.ClassWhereInput = actor.isSuperAdmin
    ? {}
    : editableCenterIds.length > 0
      ? { centerId: { in: editableCenterIds } }
      : hasRole(gateUser, "TEACHER")
        ? { OR: [{ teacherId: gateUser.id }, { assistantId: gateUser.id }] }
        : NONE;

  // Load list of sessions for selector (upcoming or recent past)
  // QA 21/07 — loại buổi của lớp đã xoá mềm khỏi selector (đồng bộ /sessions).
  //
  // ⚠️ 19/08 — TÁCH LÀM 2 TRUY VẤN, đừng gộp lại thành `orderBy date desc + take 100`.
  // Bản gộp lấy 100 NGÀY LỚN NHẤT, mà lịch được sinh sẵn tới tận năm sau nên hạn ngạch bị
  // buổi TƯƠNG LAI ăn hết: đo trên DB dev/test ở khung "tất cả lớp" thì 28/36 buổi ĐÃ điểm
  // danh nằm ngoài cửa sổ — người dùng mở dropdown không thấy buổi mình vừa dạy đâu.
  // Điểm danh nhìn về quá khứ, nên quá khứ phải được ưu tiên chỗ và xếp trước.
  const selectorWhere: Prisma.ClassSessionWhereInput = {
    ...(classFilter ? { classId: classFilter } : {}),
    class: { deletedAt: null, ...classScope },
  };
  const selectorSelect = {
    id: true,
    date: true,
    topic: true,
    classId: true,
    class: { select: { name: true } },
    _count: { select: { attendances: true } },
  } as const;
  const selectorTodayEnd = vnEndOfDay(new Date());
  const [pastSessions, upcomingSessions] = await Promise.all([
    sdb.classSession.findMany({
      where: { ...selectorWhere, date: { lte: selectorTodayEnd } },
      orderBy: { date: "desc" },
      take: classFilter ? 300 : 120,
      select: selectorSelect,
    }),
    sdb.classSession.findMany({
      where: { ...selectorWhere, date: { gt: selectorTodayEnd } },
      orderBy: { date: "asc" },
      take: classFilter ? 300 : 40,
      select: selectorSelect,
    }),
  ]);
  // Buổi đã diễn ra (mới nhất trước) rồi mới tới buổi sắp tới (gần nhất trước).
  const sessions = [...pastSessions, ...upcomingSessions];
  const upcomingIds = new Set(upcomingSessions.map((s) => s.id));

  const classes = await sdb.class.findMany({
    where: { deletedAt: null, ...classScope },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
    take: 200,
  });

  // If sessionId selected, load enrolled students + existing attendance
  let selectedSession: {
    id: string;
    date: Date;
    topic: string | null;
    className: string;
  } | null = null;
  let rows: AttendanceRosterRow[] = [];

  if (sessionId) {
    // 19/08 — DÙNG CHUNG buildSessionAttendanceRows với trang chi tiết lớp và site GV.
    //
    // Trước đây trang này tự dựng roster bằng một truy vấn chép tay gần y hệt helper,
    // nhưng THIẾU hai bộ lọc xoá mềm (`enrollment.deletedAt`, `student.deletedAt`). Hệ
    // quả không phải chỉ là "hiện thừa vài dòng": khi lưu, markAttendance đối chiếu với
    // getSessionRosterStudentIds — vốn đi qua helper ĐÚNG — nên mọi bản ghi của học viên
    // đã xoá đều bị từ chối, và vì $transaction là trọn lô nên CẢ LỚP không lưu được với
    // thông báo "Có học viên không thuộc danh sách buổi này". Một roster, một sự thật.
    //
    // Helper KHÔNG tự kiểm cách ly cơ sở (xem docstring của nó) — cổng scope giữ nguyên
    // ở truy vấn dưới đây.
    const gate = await sdb.classSession.findFirst({
      where: { id: sessionId, class: { deletedAt: null, ...classScope } },
      select: { id: true },
    });
    if (gate) {
      const roster = await buildSessionAttendanceRows(actor, sessionId);
      if (roster.session) {
        selectedSession = roster.session;
        rows = roster.rows;
      }
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl font-black text-foreground">
          <ClipboardCheck className="h-7 w-7 text-primary" />
          Điểm danh
        </h1>
        <p className="mt-1 text-muted-foreground">
          Chọn buổi học để điểm danh các học viên đăng ký
        </p>
      </div>

      {/* Session selector — client-side nav + pending "Đang mở…" (Lỗi 2-click QA 20/07) */}
      <AttendanceSelector
        key={classFilter ?? ""}
        classId={classFilter ?? ""}
        sessionId={sessionId ?? ""}
        classes={classes.map((c) => ({ id: c.id, label: c.name }))}
        sessions={sessions.map((s) => ({
          id: s.id,
          label: `${formatDateTime(s.date)} · ${s.class.name}${s.topic ? ` — ${s.topic}` : ""}${
            upcomingIds.has(s.id)
              ? " (sắp tới)"
              : s._count.attendances > 0
                ? ` (đã điểm danh ${s._count.attendances})`
                : " (chưa điểm danh)"
          }`,
        }))}
      />

      {!selectedSession && (
        <div className="rounded-xl border-2 border-dashed border-border bg-muted p-12 text-center">
          <ClipboardCheck className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">
            Chọn một buổi học từ dropdown phía trên để bắt đầu điểm danh.
          </p>
          {sessions.length === 0 && (
            <p className="mt-2 text-sm text-state-warning-ink">
              <AlertCircle className="mr-1 inline h-4 w-4" />
              Chưa có buổi học nào.{" "}
              <Link href="/sessions/new" className="text-primary hover:underline">
                Tạo buổi học →
              </Link>
            </p>
          )}
        </div>
      )}

      {selectedSession && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-primary-soft p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-primary">
              Buổi học đang điểm danh
            </div>
            <div className="mt-1 text-2xl font-black text-foreground">
              {selectedSession.className}
            </div>
            <div className="mt-1 text-sm text-foreground">
              {formatDateTime(selectedSession.date)}
              {selectedSession.topic && <> · 📚 {selectedSession.topic}</>}
            </div>
          </div>

          {/* key = buổi: đổi ?sessionId= là điều hướng client, React giữ nguyên instance
              cũ ⇒ state (chỉ khởi tạo 1 lần) còn của buổi trước. Có key thì lưới nạp lại. */}
          <AttendanceGrid key={selectedSession.id} sessionId={selectedSession.id} rows={rows} />
        </div>
      )}
    </div>
  );
}
