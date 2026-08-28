// app/(admin)/admin/lop-trial/_lib/queries.ts — GĐ2.
//
// Mọi truy vấn ĐỌC của màn "Lớp Trial". Tất cả đi qua `scopedDb(actor)` để cách ly
// cơ sở (CS1 không thấy lớp CS2). Hai hàm dựng `where` nằm ở ./filters — tách ra để
// test được bằng vitest mà không phải nạp Prisma Client.
//
// ⚠️ S-1 (26/08/2026) — CÁCH LY CƠ SỞ KHÔNG PHẢI LÀ CHE PII. `scopedDb` chỉ trả
// lời "lead này có thuộc cơ sở của bạn không", không trả lời "bạn có được đọc số
// điện thoại của họ không". Màn này mở cho `trials:view` = Quản lý cơ sở + Sale +
// **Giáo viên** + **Đào tạo**; trong đó chỉ Sale có `leads:view-pii`. Nên tên phụ
// huynh + SĐT lấy từ `lead` phải qua `maskLeadPiiFields` NGAY Ở ĐÂY — che ở JSX
// thì số thật vẫn xuống trình duyệt trong payload RSC.
//
// `canViewPii` truyền từ trang gọi (đã hỏi `canViewLeadPii()`), không tự hỏi tại
// chỗ: file này là tầng truy vấn thuần, giữ nó không dính next-auth để còn test.
import { scopedDb } from "@/lib/db-scope";
import { maskLeadPiiFields } from "@/lib/lead/pii";
import type { Actor } from "@/lib/auth/actor";
import { vnParts } from "@/lib/time/vn";
import { toVnInput } from "./schemas";
import { buildClassListWhere, buildBookingListWhere } from "./filters";
import type {
  BookingRow,
  ClassRow,
  EnrollmentRow,
  Option,
  ProgramConfig,
  RoomOption,
  SessionRow,
  TrialClassStatusV2,
} from "./types";

// ─── Truy vấn thật ───────────────────────────────────────────────────────────

/** Mốc UTC-midnight của NGÀY hôm nay theo lịch VN — khớp cột `@db.Date`. */
function vnTodayUtc(now = new Date()): Date {
  const p = vnParts(now);
  return new Date(Date.UTC(p.year, p.month, p.day));
}

/** Danh sách lớp trải nghiệm cho trang chính. */
export async function layDanhSachLop(
  actor: Actor,
  status: string | undefined,
  q: string | undefined,
): Promise<ClassRow[]> {
  const sdb = scopedDb(actor);
  const rows = await sdb.trialClassV2.findMany({
    where: buildClassListWhere(status, q),
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      config: { select: { name: true, sessionCount: true } },
      enrollments: { where: { status: "ACTIVE" }, select: { id: true } },
      sessions: {
        select: { date: true, status: true },
        orderBy: { date: "asc" },
      },
    },
  });

  const today = vnTodayUtc();
  return rows.map((r) => {
    const next = r.sessions.find(
      (s) => s.status === "SCHEDULED" && s.date.getTime() >= today.getTime(),
    );
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      status: r.status as TrialClassStatusV2,
      startTime: r.startTime,
      endTime: r.endTime,
      capacity: r.capacity,
      activeUsed: r.enrollments.length,
      sessionCount: r.sessionCount,
      configName: r.config?.name ?? null,
      nextSessionDate: next ? next.date.toISOString().slice(0, 10) : null,
    };
  });
}

/** Cấu hình số buổi đang hiệu lực (bản mới nhất). */
export async function layCauHinh(actor: Actor): Promise<ProgramConfig> {
  const sdb = scopedDb(actor);
  const cfg = await sdb.trialProgramConfig.findFirst({
    where: { active: true },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, sessionCount: true },
  });
  return cfg ?? null;
}

/** Cơ sở + phòng để đổ vào form tạo lớp. */
export async function layLuaChonTaoLop(
  actor: Actor,
): Promise<{ centers: Option[]; rooms: RoomOption[] }> {
  const sdb = scopedDb(actor);
  const [centers, rooms] = await Promise.all([
    sdb.center.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    sdb.room.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, centerId: true },
      orderBy: { displayOrder: "asc" },
    }),
  ]);
  return { centers, rooms };
}

export type ChiTietLop = {
  id: string;
  code: string;
  name: string;
  status: TrialClassStatusV2;
  centerId: string;
  startTime: string;
  endTime: string;
  capacity: number;
  sessionCount: number;
  configName: string | null;
  teacherId: string | null;
  sessions: SessionRow[];
  enrollments: EnrollmentRow[];
};

/** Chi tiết một lớp. Trả null nếu ngoài tầm nhìn của actor (chống IDOR). */
export async function layChiTietLop(
  actor: Actor,
  id: string,
  canViewPii: boolean,
): Promise<ChiTietLop | null> {
  const sdb = scopedDb(actor);
  const cls = await sdb.trialClassV2.findUnique({
    where: { id },
    include: {
      config: { select: { name: true, sessionCount: true } },
      sessions: {
        orderBy: { seq: "asc" },
        include: {
          attendances: {
            select: { trialEnrollmentId: true, status: true, note: true },
          },
        },
      },
      enrollments: {
        orderBy: { createdAt: "asc" },
        include: {
          leadChild: {
            select: {
              id: true,
              fullName: true,
              lead: { select: { id: true, parentName: true, phone: true } },
            },
          },
        },
      },
    },
  });
  if (!cls) return null;

  // Phiếu rubric đã chấm, gom theo (buổi × ca) — nguồn cho nút "Xuất PDF" trên dòng
  // điểm danh. Chỉ lấy hai cột khoá: ở đây chỉ cần biết CÓ hay KHÔNG, nội dung phiếu
  // do route PDF đọc lại khi người dùng bấm.
  //
  // `trialRubricEval` không thuộc SCOPED_MODELS (bảng không có centerId) nên `sdb` chỉ
  // pass-through — cách ly cơ sở ở đây đến từ chỗ khác: `enrollmentIds` lấy từ chính
  // lớp vừa qua `sdb.trialClassV2.findUnique`, tức đã lọc theo tầm nhìn của actor.
  const enrollmentIds = cls.enrollments.map((e) => e.id);
  const phieuDaCham = enrollmentIds.length
    ? await sdb.trialRubricEval.findMany({
        where: { trialEnrollmentId: { in: enrollmentIds } },
        select: { trialEnrollmentId: true, trialClassSessionId: true },
      })
    : [];
  const phieuTheoBuoi = new Map<string, Record<string, true>>();
  for (const p of phieuDaCham) {
    // Phiếu KHÔNG gắn buổi là dữ liệu trước GĐ4 — bỏ qua thay vì gán bừa vào một buổi.
    if (!p.trialClassSessionId) continue;
    const m = phieuTheoBuoi.get(p.trialClassSessionId) ?? {};
    m[p.trialEnrollmentId] = true;
    phieuTheoBuoi.set(p.trialClassSessionId, m);
  }

  return {
    id: cls.id,
    code: cls.code,
    name: cls.name,
    status: cls.status as TrialClassStatusV2,
    centerId: cls.centerId,
    startTime: cls.startTime,
    endTime: cls.endTime,
    capacity: cls.capacity,
    sessionCount: cls.sessionCount,
    configName: cls.config?.name ?? null,
    teacherId: cls.teacherId,
    sessions: cls.sessions.map((s) => ({
      id: s.id,
      seq: s.seq,
      date: s.date.toISOString(),
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.status as SessionRow["status"],
      attendance: Object.fromEntries(
        s.attendances.map((a) => [
          a.trialEnrollmentId,
          { status: a.status as "PRESENT" | "ABSENT", note: a.note },
        ]),
      ),
      danhGia: phieuTheoBuoi.get(s.id) ?? {},
    })),
    enrollments: cls.enrollments.map((e) => {
      const che = maskLeadPiiFields(
        {
          parentName: e.leadChild?.lead?.parentName ?? null,
          phone: e.leadChild?.lead?.phone ?? null,
        },
        canViewPii,
      );
      return {
        id: e.id,
        leadChildId: e.leadChild?.id ?? null,
        childName: e.leadChild?.fullName ?? "(không rõ)",
        parentName: che.parentName ?? null,
        phone: che.phone ?? null,
        leadId: e.leadChild?.lead?.id ?? null,
        status: e.status as EnrollmentRow["status"],
        scheduledSessionId: e.scheduledSessionId,
        gvDeXuatId: e.gvDeXuatId,
        gvPhanCongId: e.gvPhanCongId,
        rescheduleCount: e.rescheduleCount,
      };
    }),
  };
}

/** Danh sách buổi hẹn học thử (V1) + dữ liệu cho các ô sửa. */
export async function layDanhSachHen(
  actor: Actor,
  status: string | undefined,
  // `canViewPii` cai QUẢN CẢ HAI việc: che cột hiển thị VÀ cho phép ô tìm quét cột
  // SĐT. Hai việc đó phải cùng một cờ — che cột mà vẫn cho tìm là vẫn dò ra số.
  opts: { ownTeacherId?: string | null; q?: string; canViewPii: boolean },
): Promise<{ bookings: BookingRow[]; rooms: RoomOption[]; classes: Option[] }> {
  const sdb = scopedDb(actor);
  const [rows, rooms, classes] = await Promise.all([
    sdb.trialClass.findMany({
      where: buildBookingListWhere(status, { ...opts, canSearchPhone: opts.canViewPii }),
      orderBy: [{ status: "asc" }, { scheduledAt: "asc" }],
      take: 200,
      include: {
        lead: {
          select: {
            id: true,
            parentName: true,
            phone: true,
            childName: true,
            children: { select: { fullName: true } },
          },
        },
        center: { select: { name: true } },
        teacher: { select: { id: true, name: true } },
      },
    }),
    sdb.room.findMany({
      where: { status: "ACTIVE" },
      // `centerId` là bắt buộc, không phải trang trí: dropdown phòng ở màn buổi hẹn
      // lọc theo cơ sở CỦA TỪNG BUỔI, nên client phải biết phòng thuộc cơ sở nào.
      select: { id: true, name: true, centerId: true },
      orderBy: { displayOrder: "asc" },
    }),
    sdb.class.findMany({
      where: { status: { in: ["PLANNED", "ACTIVE"] } },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const bookings: BookingRow[] = rows.map((t) => {
    // ⚠️ Bất đối xứng CÓ CHỦ ĐÍCH với `layChiTietLop`: ở đây tên con đi qua tầng
    // che (giống `/admin/leads` và `/sale/khach-cua-toi` — cùng loại màn "danh
    // sách phiếu"), còn danh sách lớp bên kia thì KHÔNG. Lý do: bảng lớp là sổ
    // điểm danh, giáo viên phải gọi đúng tên đứa trẻ đang ngồi trước mặt. Đừng
    // "sửa cho đồng bộ" mà không đọc dòng này.
    const che = maskLeadPiiFields(
      {
        parentName: t.lead?.parentName ?? null,
        phone: t.lead?.phone ?? null,
        childName: t.lead?.children[0]?.fullName ?? t.lead?.childName ?? null,
      },
      opts.canViewPii,
    );
    return {
      id: t.id,
      leadId: t.leadId,
      parentName: che.parentName ?? null,
      phone: che.phone ?? null,
      childName: che.childName ?? null,
      centerId: t.centerId,
      centerName: t.center?.name ?? null,
      status: t.status as BookingRow["status"],
      // Server quy đổi sang đồng hồ VN — client KHÔNG tự tính (xem ghi chú ở types.ts).
      scheduledAtVn: t.scheduledAt ? toVnInput(t.scheduledAt) : "",
      teacherId: t.teacherId,
      teacherName: t.teacher?.name ?? null,
      roomId: t.roomId,
      classId: t.classId,
      notes: t.notes,
    };
  });

  return { bookings, rooms, classes };
}
