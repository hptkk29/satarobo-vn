// app/(admin)/admin/lop-trial/_lib/queries.ts — GĐ2.
//
// Mọi truy vấn ĐỌC của màn "Lớp Trial". Tất cả đi qua `scopedDb(actor)` để cách ly
// cơ sở (CS1 không thấy lớp CS2). Hai hàm dựng `where` nằm ở ./filters — tách ra để
// test được bằng vitest mà không phải nạp Prisma Client.
// 🔴 S-1 — tên phụ huynh + SĐT lấy từ `lead` phải qua `maskLeadPiiFields` NGAY Ở ĐÂY,
// không che ở JSX: tầng này còn phục vụ chỗ khác, che ở giao diện là che một chỗ và hở
// mọi chỗ còn lại. `canViewPii` do TRANG GỌI truyền xuống (đã hỏi `canViewLeadPii()`),
// tầng truy vấn không tự hỏi quyền.
// (Cấy lại khi hợp nhất `main` → `test` ngày 16/09/2026 — nhánh `main` chưa có chốt S-1.)
import { maskLeadPiiFields } from "@/lib/lead/pii";
import { scopedDb } from "@/lib/db-scope";
import { getCenterOptions } from "@/lib/org/center-options";
import type { Actor } from "@/lib/auth/actor";
// Module soát trùng DUY NHẤT của LỚP CHÍNH (T4.2). Dùng lại `rowsToSlots` thay vì tự
// suy `substitute ?? actual ?? class.teacherId` — bản thứ hai của một luật là bản sẽ lệch.
import { rowsToSlots } from "@/lib/lms/schedule-conflict";
import type { BuoiBanCuaGv } from "@/lib/trial/gv-kha-dung";
import { vnAddDays, vnParts, vnStartOfDay, vnYmd } from "@/lib/time/vn";
import { toVnInput } from "./schemas";
import { buildClassListWhere, buildBookingListWhere, ngayVnSangUtc } from "./filters";
import type {
  BookingRow,
  ClassRow,
  EnrollmentRow,
  Option,
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

/** Cơ sở + phòng để đổ vào form tạo lớp. */
export async function layLuaChonTaoLop(
  actor: Actor,
): Promise<{
  centers: (Option & { code: string | null })[];
  courses: (Option & { slug: string })[];
}> {
  const sdb = scopedDb(actor);
  const [centers, courses] = await Promise.all([
    // 03/09 — dùng helper chung: bản cũ (`center.findMany` trần) bày cả Hội sở, các
    // dòng Center mồ côi (`ITLI_*`), và không cắt theo tầm nhìn actor nên người dùng
    // chọn được cơ sở mình không quản. Helper vẫn trả `code` mà form cần để xem trước
    // tên lớp ("CS2-sata4-Lớp trial …").
    getCenterOptions(actor),
    // Khoá trải nghiệm = khoá quan tâm. `Course` không thuộc SCOPED_MODELS (danh mục
    // dùng chung toàn hệ) nên `sdb` chỉ pass-through.
    sdb.course.findMany({
      where: { isActive: true },
      // 29/08 — `slug` là phần MÃ KHOÁ trong tên lớp; form cần nó để xem trước.
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { centers, courses };
}

export type ChiTietLop = {
  id: string;
  code: string;
  name: string;
  status: TrialClassStatusV2;
  centerId: string;
  /** 28/08 — giờ/sĩ số ở CẤP LỚP đã thôi dùng; giờ thật nằm ở từng buổi. */
  startTime: string | null;
  endTime: string | null;
  /** `null` = không giới hạn sĩ số. */
  capacity: number | null;
  sessionCount: number;
  configName: string | null;
  teacherId: string | null;
  sessions: SessionRow[];
  enrollments: EnrollmentRow[];
};

// ─── Lịch đã kín của giáo viên — nguồn của note ĐỎ "trùng lịch" (chốt V2-b) ────
//
// ĐÚNG HAI NGUỒN, không hơn: buổi của lớp TRIAL khác + buổi LỚP CHÍNH (`ClassSession`).
//
// ⛔ KHÔNG tính trùng với ca làm trong lưới chấm công. Chủ dự án 17/09 nói thẳng:
// "ca hành chính của Kiệt và Toại thì cả 2 người đều trial bình thường, không cần note
// đỏ." Ca làm trả lời câu "người này CÓ MẶT không" (luật PHỦ TRỌN, ở
// `lib/trial/gv-kha-dung.ts`); trùng lịch trả lời câu "người này ĐÃ NHẬN việc khác
// chưa". Trộn hai câu là biến mọi người đang đi làm thành người bận.

/**
 * Nhãn CHUNG, cố ý không mang tên lớp / tên học viên.
 *
 * ⚠️ ĐÂY LÀ MỘT CỔNG, không phải lười đặt tên. Hai truy vấn dưới **cố ý bỏ khoá
 * `centerId`** (giáo viên là nguồn lực chung từ 06/08 — người của CS2 được điều sang dạy
 * CS1, và phép soát trùng phải thấy cả hai phía), nên dòng trả về có thể thuộc cơ sở mà
 * người đang xem KHÔNG được đọc dữ liệu. In tên lớp ra là rò rỉ đúng thứ `scopedDb` sinh
 * ra để chặn: người CS1 đọc được tên lớp CS2 qua một cái note đỏ.
 *
 * Giờ + nguồn là đủ để người xếp lịch quyết định ("18:00–19:30 đã có buổi lớp chính");
 * muốn biết lớp nào thì hỏi người phụ trách cơ sở đó — đúng quy trình.
 */
const NHAN_TRIAL = "buổi lớp trải nghiệm" as const;
const NHAN_LOP_CHINH = "buổi lớp chính" as const;

/**
 * `BuoiBanCuaGv` (hợp đồng dùng chung) KHÔNG mang `teacherId` — ở đó nó đã được gom
 * theo người rồi. Hai hàm truy vấn dưới trả danh sách PHẲNG nên phải kèm khoá người,
 * và `layLichBanGiaoVien` mới là chỗ gom lại đúng hình dạng hợp đồng.
 */
type BuoiBanKemGv = BuoiBanCuaGv & { teacherId: string };

/** "HH:mm" theo đồng hồ VN của một mốc thời gian THẬT. */
function gioVn(d: Date): string {
  const p = vnParts(d);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** Buổi trial khác đã chiếm chỗ của giáo viên trong NGÀY `ymd`. */
async function buoiTrialDaChiem(
  actor: Actor,
  opts: { ymd: string; excludeSessionId: string | null },
): Promise<BuoiBanKemGv[]> {
  const sdb = scopedDb(actor);
  const ngay = ngayVnSangUtc(opts.ymd);
  if (!ngay) return [];

  const rows = await sdb.trialClassSession.findMany({
    where: {
      status: "SCHEDULED",
      teacherId: { not: null },
      // Cột `@db.Date` — so BẰNG với nửa đêm UTC của ngày VN. KHÔNG dùng khoảng
      // `gte/lt` như `ClassSession` ngay dưới: cột này không mang giờ.
      date: ngay,
      // 17/09 — BỎ khoá `centerId`. `TrialClassSession` KHÔNG thuộc `SCOPED_MODELS`
      // (xem `_lib/guards.ts`) nên không có lưới nào chèn lại — đó chính là lý do nhãn
      // phải là chuỗi chung ở trên.
      trialClass: { status: { not: "CANCELLED" } },
      // Sửa một buổi thì phải LOẠI chính nó, nếu không đổi mỗi ô ghi chú cũng tự báo
      // "trùng lịch" với bản thân và người dùng học cách bỏ qua note đỏ.
      ...(opts.excludeSessionId ? { id: { not: opts.excludeSessionId } } : {}),
    },
    select: { teacherId: true, startTime: true, endTime: true },
    take: 500,
  });

  const out: BuoiBanKemGv[] = [];
  for (const r of rows) {
    if (!r.teacherId) continue;
    out.push({
      teacherId: r.teacherId,
      ymd: opts.ymd,
      startTime: r.startTime,
      endTime: r.endTime,
      nhan: NHAN_TRIAL,
      nguon: "TRIAL",
    });
  }
  return out;
}

/**
 * Buổi LỚP CHÍNH đã chiếm chỗ của giáo viên trong NGÀY `ymd`.
 *
 * ⚠️ HAI CỘT `date` CÙNG TÊN, KHÁC NGHĨA — khớp theo tên cột ở đây là sai:
 *   · `TrialClassSession.date` là `@db.Date` — nửa đêm UTC, KHÔNG mang giờ.
 *   · `ClassSession.date`      là `@db.Timestamptz(6)` — MANG GIỜ THẬT của buổi.
 * Nên ngày của lớp chính phải lọc bằng KHOẢNG `[00:00 VN, 00:00 VN hôm sau)`, quy đổi
 * tường minh qua `lib/time/vn.ts`. Lọc bằng một mốc UTC-midnight sẽ khớp đúng các buổi
 * 07:00 giờ VN và bỏ sót tất cả buổi còn lại.
 *
 * ⚠️ Người dạy KHÔNG tự suy — `substitute ?? actual ?? class.teacherId` là luật của
 * `lib/lms/schedule-conflict.ts`, module soát trùng DUY NHẤT của lớp chính. Chép lại
 * luật đó ở đây là đẻ bản thứ hai, và bản thứ hai sẽ trôi lệch (đó đúng là lý do bản cũ
 * `findScheduleConflicts` đã bị gỡ bỏ).
 */
async function buoiLopChinhDaChiem(
  actor: Actor,
  opts: { ymd: string },
): Promise<BuoiBanKemGv[]> {
  const sdb = scopedDb(actor);
  const moc = ngayVnSangUtc(opts.ymd);
  if (!moc) return [];
  const dauNgay = vnStartOfDay(moc);
  const cuoiNgay = vnAddDays(dauNgay, 1);

  // `ClassSession` ∈ SCOPED_MODELS ⇒ `scopedDb` tự chèn `centerId IN visibleCenterIds`.
  // GIỚI HẠN ĐÃ BIẾT, cố ý giữ: với người cấp cơ sở, buổi lớp chính ở cơ sở ngoài tầm
  // nhìn KHÔNG sinh note đỏ (fail-closed — thà thiếu cảnh báo còn hơn rò dữ liệu, và
  // gỡ lưới ở đây là mở một đường đọc `ClassSession` liên cơ sở không ai gác).
  const rows = await sdb.classSession.findMany({
    where: {
      status: { not: "CANCELLED" },
      date: { gte: dauNgay, lt: cuoiNgay },
      class: { deletedAt: null },
    },
    // ĐÚNG bộ cột mà `rowsToSlots` đọc — thiếu một cột là nó suy sai người dạy hoặc
    // sai khung giờ, im lặng. Giữ nguyên hình dạng, đừng rút gọn.
    select: {
      id: true,
      date: true,
      roomId: true,
      actualRoomId: true,
      actualTeacherId: true,
      substituteRoomId: true,
      substituteTeacherId: true,
      class: {
        select: { roomId: true, teacherId: true, startTime: true, endTime: true },
      },
    },
    take: 500,
  });

  const out: BuoiBanKemGv[] = [];
  for (const slot of rowsToSlots(rows)) {
    if (!slot.teacherId) continue;
    out.push({
      teacherId: slot.teacherId,
      // Ngày lấy từ CHÍNH mốc bắt đầu của buổi (đã quy về đồng hồ VN), không lấy lại
      // `opts.ymd`: một buổi 23:30–01:00 nằm vắt qua nửa đêm thì hai giá trị khác nhau,
      // và hàm lọc trùng so khớp theo `ymd`.
      ymd: vnYmd(slot.startAt),
      startTime: gioVn(slot.startAt),
      endTime: gioVn(slot.endAt),
      nhan: NHAN_LOP_CHINH,
      nguon: "LOP_CHINH",
    });
  }
  return out;
}

/**
 * Lịch đã kín của TỪNG giáo viên trong một ngày — gom cả hai nguồn, gom theo `teacherId`.
 *
 * Trả về đúng hình dạng `banTheoGv` mà `locGiaoVienChoBuoi` ăn vào. Người gọi KHÔNG phải
 * biết có mấy nguồn.
 */
export async function layLichBanGiaoVien(
  actor: Actor,
  opts: { ymd: string; excludeSessionId: string | null },
): Promise<Record<string, BuoiBanCuaGv[]>> {
  const [trial, lopChinh] = await Promise.all([
    buoiTrialDaChiem(actor, opts),
    buoiLopChinhDaChiem(actor, { ymd: opts.ymd }),
  ]);

  const out: Record<string, BuoiBanCuaGv[]> = {};
  for (const b of [...trial, ...lopChinh]) {
    (out[b.teacherId] ??= []).push(b);
  }
  // Sắp theo giờ bắt đầu: note đỏ chỉ in buổi ĐẦU TIÊN khớp (xem `timTrungLich`), nên
  // không sắp thì người dùng thấy buổi nào là do thứ tự DB trả về — đổi giữa hai lần bấm.
  for (const ds of Object.values(out)) {
    ds.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
  return out;
}

/** Phòng học ĐANG DÙNG của một cơ sở. `Room.centerId` là NOT NULL nên không có phòng
 *  dùng chung — đừng thêm nhánh `centerId: null`, nó không bao giờ khớp dòng nào. */
export async function layPhongTheoCoSo(
  actor: Actor,
  centerId: string,
): Promise<RoomOption[]> {
  const sdb = scopedDb(actor);
  const rooms = await sdb.room.findMany({
    where: { status: "ACTIVE", centerId },
    select: { id: true, name: true, centerId: true },
    orderBy: { displayOrder: "asc" },
  });
  return rooms;
}

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
      teacherId: s.teacherId,
      roomId: s.roomId,
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

// 28/08 — `layDanhSachHen` ĐÃ GỠ cùng tab "Lịch hẹn học thử".
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
    const che = maskLeadPiiFields(
      { parentName: t.lead?.parentName ?? null, phone: t.lead?.phone ?? null },
      opts.canViewPii,
    );
    return {
    id: t.id,
    leadId: t.leadId,
    parentName: che.parentName ?? null,
    phone: che.phone ?? null,
    childName: t.lead?.children[0]?.fullName ?? t.lead?.childName ?? null,
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
