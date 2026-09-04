/**
 * Site Sale — DỮ LIỆU cho năm màn nhóm "Chấm công".
 *
 * ══ BẢN ĐÔI CỦA TRUY VẤN NẰM TRONG BỐN TRANG ADMIN ═════════════════════════
 *   `app/(admin)/admin/cham-cong/page.tsx`                  → layChamCongNgay
 *   `app/(admin)/admin/cham-cong/lich-ca/page.tsx`           → layLichCaCuaToi
 *   `app/(admin)/admin/cham-cong/yeu-cau-cong/page.tsx`      → layYeuCauChinhCong
 *   `app/(admin)/admin/cham-cong/lich-ca-nhan-vien/page.tsx` → layTongHopCongCa
 *
 * Chủ dự án chốt 04/09/2026: màn site Sale tách bản riêng, không dùng chung
 * component với khu quản trị. Bốn trang trên truy vấn THẲNG trong `page.tsx` nên
 * không có hàm nào để gọi lại; chép vào đây để phần trôi lệch nằm ở MỘT tệp có
 * tên, thay vì nằm trong JSX của hai site. Bản admin GIỮ NGUYÊN, không sửa.
 *
 * ── DÙNG LẠI ĐƯỢC GÌ Ở `lib/` (KHÔNG chép) ─────────────────────────────────
 *   `scopedDb(actor)`                    — cách ly cơ sở (lib/db-scope)
 *   `computeShiftAttendance`             — chấm đủ công / đi muộn / thiếu giờ
 *   `formatVNTime` · `formatRegisteredShifts`          } lib/work-schedule
 *   `SHIFT_DEFS` · `SHIFT_ORDER` · `EMERGENCY_MONTHLY_LIMIT`
 *   `isNextMonthWindowOpen` · `isWeekendEditWindow`    } lib/shifts
 *   `ymdVN` (lib/classes/schedule) · `formatDateVN` (lib/format/date)
 *   `getSetting` (lib/settings/service)
 * Phần chép thật sự chỉ còn các truy vấn Prisma + phép gộp theo người/ngày.
 *
 * ── NỢ TRÔI LỆCH: sửa bên nào cũng phải sửa bên kia ─────────────────────────
 *   1. Chỉ lịch **APPROVED** mới dùng tính công (cả màn ngày lẫn màn tuần). Nới
 *      sang REGISTERED là tính công theo ĐỀ XUẤT chưa duyệt — sai bản chất.
 *   2. Cửa sổ màn tuần bắt đầu từ **Thứ 2** (`mondayOf`), màn ngày là **một ngày
 *      địa phương** `[00:00, 24:00)`.
 *   3. Bảng gộp check-in: bản ghi `CHECK_IN`/`CHECK_OUT` cuối cùng trong ngày
 *      ghi đè bản trước (vòng lặp gán thẳng) — cố ý, đúng bản admin.
 *   4. `computeShiftAttendance` nhận dung sai từ `getSetting("shift.toleranceMinutes")`,
 *      KHÔNG dùng hằng mặc định. Quên truyền là công tính theo dung sai khác với
 *      màn admin, và không có gì báo.
 *
 * ── KHÔNG CÓ PII Ở ĐÂY, VÀ ĐÓ LÀ CHỦ ĐÍCH ──────────────────────────────────
 * Năm màn chấm công không đọc `phone`/`parentPhone` của ai. `User.email` chỉ
 * dùng làm TÊN DỰ PHÒNG khi nhân viên chưa đặt tên hiển thị — đúng như bản
 * admin. Muốn thêm SĐT vào bất kỳ bảng nào thì phải đi qua `canViewLeadPii()` +
 * `maskPhone`; `lib/lead/lead-pii-callsites.test.ts` quét cả `lib/sale/**` và sẽ
 * đỏ nếu quên.
 */
import "server-only";
import type { Prisma, WorkShift } from "@prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { ymdVN } from "@/lib/classes/schedule";
import { formatDateVN } from "@/lib/format/date";
import { getSetting } from "@/lib/settings/service";
import {
  EMERGENCY_MONTHLY_LIMIT,
  isNextMonthWindowOpen,
  isWeekendEditWindow,
} from "@/lib/shifts";
import {
  computeShiftAttendance,
  formatRegisteredShifts,
  formatVNTime,
  type AttendanceTag,
} from "@/lib/work-schedule";
import type { PillTone } from "@/components/admin/ui/status-pill";

// ─────────────────────────────────────────────────────────────────────────────
// Màu: ba tone của `computeShiftAttendance` → thang ngữ nghĩa của `StatusPill`
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Bản admin gõ tay chuỗi class cho từng tone (`bg-state-success-soft
 * text-state-success-ink`…). Ở site Sale màu trạng thái đi qua `StatusPill` —
 * `lib/sale/ky-luat-mau.test.ts` cấm class màu rời, và một site có hai thang màu
 * là một site có hai sự thật.
 *
 * Ánh xạ 1–1, KHÔNG diễn giải lại: `warn` là "cần để mắt" (đi muộn / về sớm /
 * thiếu check-out), `danger` là "công không đủ hoặc chấm ngoài vùng".
 */
const TONE: Record<AttendanceTag["tone"], PillTone> = {
  ok: "success",
  warn: "warning",
  danger: "danger",
};

/** Một nhãn tình trạng công đã sẵn sàng để vẽ. */
export type NhanCong = {
  nhan: string;
  tone: PillTone;
  /**
   * Bản admin gắn icon `MapPinOff` khi nhãn đúng bằng chuỗi "Ngoài vùng". So
   * chuỗi trong JSX là thứ vỡ im lặng lúc ai đó sửa câu chữ ở
   * `lib/work-schedule.ts`; quyết ở đây rồi truyền xuống một lần.
   */
  ngoaiVung: boolean;
};

function nhanTuTag(t: AttendanceTag): NhanCong {
  return { nhan: t.label, tone: TONE[t.tone], ngoaiVung: t.label === "Ngoài vùng" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ngày tháng
// ─────────────────────────────────────────────────────────────────────────────
/**
 * `YYYY-MM-DD` theo giờ MÁY CHỦ, không phải giờ VN.
 *
 * ⚠️ CỐ Ý KHÁC `ymdVN`. Ba trong bốn trang admin (`lich-ca`,
 * `lich-ca-nhan-vien`) dựng mốc tuần/tháng bằng `new Date(year, month, day)` —
 * tức nửa đêm giờ máy chủ — rồi đọc nhãn lại bằng chính `getFullYear/Month/Date`.
 * Đổi sang `ymdVN` ở giữa chuỗi đó là lệch một ngày trên máy chạy UTC. Trang
 * `/cham-cong` (màn ngày) thì ngược lại: nó dùng `ymdVN` và ở đây cũng vậy.
 */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Thứ 2 của tuần chứa `d` (giờ máy chủ) — chép nguyên `mondayOf` bản admin. */
function thuHaiCua(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = (x.getDay() + 6) % 7; // 0 = Thứ 2
  x.setDate(x.getDate() - wd);
  return x;
}

/**
 * Cơ sở mà người xem được phép nhìn, dùng cho các bảng KHÔNG nằm trong
 * `SCOPED_MODELS`.
 *
 * ⚠️ VÌ SAO CẦN HÀM NÀY. `User` và `Center` **không** thuộc `SCOPED_MODELS`
 * (`lib/db-scope.ts`) ⇒ `sdb.user.findMany` là đường THẲNG, không có `centerId
 * IN [...]` nào được tiêm vào. Bản admin bù chỗ đó bằng `hasRole(…,
 * "CENTER_MANAGER")` để ép `filterCenter`; ai không khớp mã vai đó thì rơi vào
 * nhánh `filterCenter = null` — tức **liệt kê toàn bộ nhân sự của mọi cơ sở**.
 * Trên site Sale không ai mang mã `CENTER_MANAGER` (khung site chỉ cho Sale
 * THUẦN vào), nên bản mount cũ rơi đúng vào nhánh đó.
 *
 * Nên ở đây phạm vi lấy từ ACTOR chứ không từ mã vai: `null` = không chặn
 * (SUPER_ADMIN, hoặc vai neo ở Hội sở — cross-center theo chức năng, đúng thiết
 * kế `buildActor`); ngược lại là danh sách cơ sở actor nhìn thấy. Danh sách rỗng
 * ⇒ không thấy ai: fail-closed, cùng hướng với `scopedDb`.
 */
function coSoChoPhep(actor: Actor): string[] | null {
  if (actor.isSuperAdmin || actor.isHoLevel) return null;
  return actor.visibleCenterIds;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1) MÀN NGÀY — `/sale/cham-cong`
// ═════════════════════════════════════════════════════════════════════════════

export type DongChamCongNgay = {
  userId: string;
  tenNhanVien: string;
  /** "—" khi nhân viên chưa gắn cơ sở. */
  tenCoSo: string;
  /** "Sáng + Chiều" hoặc "—". */
  caDangKy: string;
  gioVao: string;
  gioRa: string;
  /** "8h" khi có đủ vào/ra, "—" khi thiếu. */
  gioCong: string;
  nhan: NhanCong[];
};

export type KetQuaChamCongNgay = {
  /** `YYYY-MM-DD` của ngày đang xem — nhãn đọc lại theo giờ VN. */
  ngay: string;
  dong: DongChamCongNgay[];
  /** Số người đã quét vào mà chưa quét ra — dải cảnh báo đầu màn. */
  thieuCheckOut: number;
};

/**
 * Bảng công của MỘT ngày, mọi nhân viên trong tầm nhìn của `actor`.
 *
 * @param ngay chuỗi `?date=` thô của trang; rỗng/không hợp lệ → hôm nay.
 */
export async function layChamCongNgay({
  actor,
  ngay,
}: {
  actor: Actor;
  ngay?: string;
}): Promise<KetQuaChamCongNgay> {
  const goc = ngay ? new Date(ngay) : new Date();
  const dau = new Date(Number.isNaN(goc.getTime()) ? Date.now() : goc.getTime());
  dau.setHours(0, 0, 0, 0);
  const cuoi = new Date(dau);
  cuoi.setDate(cuoi.getDate() + 1);

  // `dau` là NỬA ĐÊM GIỜ ĐỊA PHƯƠNG → đọc nhãn theo ngày ĐỊA PHƯƠNG (ymdVN),
  // KHÔNG qua toISOString() (UTC): trên máy +7 sẽ lệch -1 ngày và ngày người
  // dùng tự chọn cũng bị hiển thị lùi một ngày.
  const nhanNgay = ymdVN(dau);

  // Cách ly cơ sở (A0-04): EmployeeCheckin / ShiftRegistration ∈ SCOPED_MODELS
  // ⇒ `scopedDb` tự tiêm `centerId IN [...]`, không cần mệnh đề tay.
  const sdb = scopedDb(actor);

  const [banGhi, dangKy] = await Promise.all([
    sdb.employeeCheckin.findMany({
      where: { checkedAt: { gte: dau, lt: cuoi } },
      orderBy: { checkedAt: "asc" },
    }),
    sdb.shiftRegistration.findMany({
      // Chỉ lịch CHÍNH THỨC (APPROVED) mới dùng tính công.
      where: { date: { gte: dau, lt: cuoi }, status: "APPROVED" },
      select: { userId: true, shifts: true, user: { select: { name: true, centerId: true } } },
    }),
  ]);

  type Gop = {
    userId: string;
    ten: string;
    vao: Date | null;
    ra: Date | null;
    centerId: string | null;
    ngoaiVung: boolean;
    ca: WorkShift[];
  };
  const theoNguoi = new Map<string, Gop>();
  const lay = (userId: string, ten: string, centerId: string | null): Gop => {
    let g = theoNguoi.get(userId);
    if (!g) {
      g = { userId, ten, vao: null, ra: null, centerId, ngoaiVung: false, ca: [] };
      theoNguoi.set(userId, g);
    }
    return g;
  };
  for (const r of banGhi) {
    const g = lay(r.userId, r.userName ?? "(không tên)", r.centerId);
    if (r.type === "CHECK_IN") g.vao = r.checkedAt;
    else g.ra = r.checkedAt;
    if (!r.withinGeofence) g.ngoaiVung = true;
  }
  // Nhân viên CÓ đăng ký ca ngày đó (kể cả chưa quét → để hiện "Thiếu ca").
  for (const dk of dangKy) {
    const g = lay(dk.userId, dk.user.name ?? "(không tên)", dk.user.centerId);
    g.ca = dk.shifts;
  }

  const dungSai = await getSetting("shift.toleranceMinutes");
  const coSo = await sdb.center.findMany({ select: { id: true, name: true } });
  const tenCoSo = new Map(coSo.map((c) => [c.id, c.name]));

  const dong = [...theoNguoi.values()]
    .sort((a, b) => a.ten.localeCompare(b.ten))
    .map((g) => {
      const tinh = computeShiftAttendance(
        { checkIn: g.vao, checkOut: g.ra, geofenceFlag: g.ngoaiVung, registeredShifts: g.ca },
        dungSai,
      );
      return {
        userId: g.userId,
        tenNhanVien: g.ten,
        tenCoSo: g.centerId ? tenCoSo.get(g.centerId) ?? "—" : "—",
        caDangKy: formatRegisteredShifts(g.ca),
        gioVao: formatVNTime(g.vao),
        gioRa: formatVNTime(g.ra),
        gioCong: g.vao && g.ra ? `${tinh.workedHours}h` : "—",
        nhan: tinh.tags.map(nhanTuTag),
      } satisfies DongChamCongNgay;
    });

  return {
    ngay: nhanNgay,
    dong,
    thieuCheckOut: [...theoNguoi.values()].filter((g) => g.vao && !g.ra).length,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 2) LỊCH CA CỦA TÔI — `/sale/cham-cong/lich-ca`
// ═════════════════════════════════════════════════════════════════════════════

export type ODangKyCa = { shifts: WorkShift[]; status: string; note: string };
export type OTietDay = { start: string; end: string; label: string };

export type DuLieuLichCa = {
  /** Lưới tháng, đã chèn ô trống đầu tuần (CN = 0). */
  o: { dateStr: string | null; day: number | null }[];
  theoNgay: Record<string, ODangKyCa>;
  dayTheoNgay: Record<string, OTietDay[]>;
  homNay: string;
  /** "Tháng 9/2026". */
  nhanThang: string;
  /** `YYYY-MM` để dựng liên kết lùi/tiến. */
  thangTruoc: string;
  thangSau: string;
  daDungKhanCap: number;
  tranKhanCap: number;
  /** Câu nhắc về cửa sổ đề xuất ca — ba trường hợp, y bản admin. */
  goYCuaSo: string;
};

/**
 * Lịch ca một tháng của CHÍNH người đăng nhập + các tiết dạy trong tháng.
 *
 * @param thang `YYYY-MM`; sai định dạng → tháng hiện tại.
 */
export async function layLichCaCuaToi({
  actor,
  userId,
  thang,
}: {
  actor: Actor;
  userId: string;
  thang?: string;
}): Promise<DuLieuLichCa> {
  const bayGio = new Date();
  const m =
    thang && /^\d{4}-\d{2}$/.test(thang)
      ? thang
      : `${bayGio.getFullYear()}-${String(bayGio.getMonth() + 1).padStart(2, "0")}`;
  const nam = Number(m.slice(0, 4));
  const thangIdx = Number(m.slice(5, 7)) - 1;
  const dauThang = new Date(nam, thangIdx, 1);
  const cuoiThang = new Date(nam, thangIdx + 1, 1);

  // Cách ly cơ sở (A0-04): ShiftRegistration / ClassSession ∈ SCOPED_MODELS.
  const sdb = scopedDb(actor);

  const [dangKy, buoiDay] = await Promise.all([
    sdb.shiftRegistration.findMany({
      where: { userId, date: { gte: dauThang, lt: cuoiThang } },
      select: { date: true, shifts: true, status: true, note: true },
    }),
    // Buổi dạy của người này (phụ trách chính hoặc trợ giảng) trong tháng.
    sdb.classSession.findMany({
      where: {
        date: { gte: dauThang, lt: cuoiThang },
        class: { OR: [{ teacherId: userId }, { assistantId: userId }] },
      },
      select: {
        date: true,
        class: { select: { name: true, classCode: true, startTime: true, endTime: true } },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const theoNgay: Record<string, ODangKyCa> = {};
  for (const r of dangKy) {
    theoNgay[ymd(new Date(r.date))] = {
      shifts: r.shifts,
      status: r.status,
      note: r.note ?? "",
    };
  }

  // Số lần khẩn cấp đã dùng trong THÁNG ĐANG XEM.
  const daDungKhanCap = await sdb.shiftRegistration.count({
    where: { userId, status: "LEAVE_REQUESTED", date: { gte: dauThang, lt: cuoiThang } },
  });

  const dayTheoNgay: Record<string, OTietDay[]> = {};
  for (const s of buoiDay) {
    const ds = ymd(new Date(s.date));
    const start = s.class.startTime ?? "00:00";
    const end = s.class.endTime ?? start;
    const label = s.class.classCode ? `${s.class.classCode} · ${s.class.name}` : s.class.name;
    (dayTheoNgay[ds] ??= []).push({ start, end, label });
  }

  // Lưới tháng: chèn ô trống cho các ngày trước Thứ 2 đầu tiên (CN = 0).
  const thuDauThang = dauThang.getDay();
  const soNgay = new Date(nam, thangIdx + 1, 0).getDate();
  const o: { dateStr: string | null; day: number | null }[] = [];
  for (let i = 0; i < thuDauThang; i++) o.push({ dateStr: null, day: null });
  for (let d = 1; d <= soNgay; d++) o.push({ dateStr: ymd(new Date(nam, thangIdx, d)), day: d });

  const cuaSo = await getSetting("shift.proposalWindow");
  const nhanCuaSo = `${cuaSo.fromDay}–${cuaSo.toDay}`;
  const goYCuaSo = isNextMonthWindowOpen(bayGio, cuaSo)
    ? `Đang trong cửa sổ ĐỀ XUẤT ca THÁNG SAU (ngày ${nhanCuaSo}). Lịch bạn chọn là ĐỀ XUẤT — quản lý duyệt (import Excel) để chốt chính thức.`
    : isWeekendEditWindow(bayGio)
      ? "Cuối tuần — được phép sửa đề xuất ca trong tháng."
      : `Ngoài cửa sổ đề xuất chuẩn (${nhanCuaSo} cho tháng sau / cuối tuần để sửa). Vẫn lưu được, lịch là ĐỀ XUẤT chờ quản lý duyệt.`;

  return {
    o,
    theoNgay,
    dayTheoNgay,
    homNay: ymd(bayGio),
    nhanThang: `Tháng ${thangIdx + 1}/${nam}`,
    thangTruoc: ymd(new Date(nam, thangIdx - 1, 1)).slice(0, 7),
    thangSau: ymd(new Date(nam, thangIdx + 1, 1)).slice(0, 7),
    daDungKhanCap,
    tranKhanCap: EMERGENCY_MONTHLY_LIMIT,
    goYCuaSo,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 3) YÊU CẦU CHỈNH CÔNG — `/sale/cham-cong/yeu-cau-cong`
// ═════════════════════════════════════════════════════════════════════════════

export type DongYeuCauCong = {
  id: string;
  ngay: string;
  trangThai: { nhan: string; tone: PillTone };
  deNghi: string | null;
  lyDo: string;
  phanHoi: string | null;
};

/** Ba trạng thái của `TimesheetAdjustmentRequest` — nhãn giữ nguyên bản admin. */
const TRANG_THAI: Record<string, { nhan: string; tone: PillTone }> = {
  PENDING: { nhan: "Chờ duyệt", tone: "warning" },
  APPROVED: { nhan: "Đã duyệt", tone: "success" },
  REJECTED: { nhan: "Từ chối", tone: "danger" },
};

/** 100 yêu cầu gần nhất của CHÍNH người đăng nhập — `take` giữ nguyên bản admin. */
export async function layYeuCauChinhCong({
  actor,
  userId,
}: {
  actor: Actor;
  userId: string;
}): Promise<DongYeuCauCong[]> {
  // Cách ly cơ sở (A0-04): TimesheetAdjustmentRequest ∈ SCOPED_MODELS.
  const rows = await scopedDb(actor).timesheetAdjustmentRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return rows.map((r) => ({
    id: r.id,
    ngay: formatDateVN(r.date),
    trangThai: TRANG_THAI[r.status] ?? { nhan: r.status, tone: "muted" as PillTone },
    deNghi: r.requested,
    lyDo: r.reason,
    phanHoi: r.reviewNote,
  }));
}

// ═════════════════════════════════════════════════════════════════════════════
// 4) TỔNG HỢP CÔNG CA (tuần) — `/sale/cham-cong/tong-hop`
// ═════════════════════════════════════════════════════════════════════════════

export type ONgayTongHop = {
  coDuLieu: boolean;
  /** "Sáng + Chiều" — `null` khi chưa đăng ký ca nào. */
  caDangKy: string | null;
  /** Có quét vào nhưng KHÔNG đăng ký ca — nhắc "Chưa ĐK ca". */
  chuaDangKyCa: boolean;
  /** "07:30–17:30" — `null` khi không quét lần nào. */
  gio: string | null;
  /** Nhãn ĐẦU TIÊN của `computeShiftAttendance` (ô tuần chỉ đủ chỗ cho một). */
  nhan: NhanCong | null;
  /** Tóm tắt để trong `title` của dấu giải trình. */
  giaiTrinh: string | null;
};

export type DongTongHop = {
  userId: string;
  ten: string;
  /** Chỉ hiện khi KHÔNG lọc theo một cơ sở cụ thể — y bản admin. */
  tenCoSo: string | null;
  /** Đúng 7 ô, Thứ 2 → Chủ nhật. */
  ngay: ONgayTongHop[];
};

export type KetQuaTongHop = {
  /** 7 chuỗi `YYYY-MM-DD`, Thứ 2 → Chủ nhật. */
  ngayTrongTuan: string[];
  dong: DongTongHop[];
  /** `true` = người xem không có `hr_attendance:view` ⇒ chỉ thấy chính mình. */
  chiMinh: boolean;
  /** Rỗng khi không được chọn cơ sở (chỉ-mình, hoặc chỉ nhìn thấy một cơ sở). */
  coSo: { id: string; name: string }[];
  locCoSo: string | null;
  /** `?date=` cho hai nút lùi/tiến tuần. */
  tuanTruoc: string;
  tuanSau: string;
  /** Mỏ neo tuần hiện tại — dùng lại trong `<input type="hidden">` của bộ lọc. */
  neoTuan: string;
};

/**
 * Bảng công 7 ngày × N nhân viên.
 *
 * @param xemDuocNguoiKhac kết quả `hr_attendance:view` do TRANG hỏi (một lần, có
 *   target cơ sở). Truyền vào thay vì tự hỏi lại: hỏi rải rác ở hai chỗ là cách
 *   chắc chắn để hai chỗ trả lời khác nhau khi cờ RBAC đổi (bài học 10/07).
 */
export async function layTongHopCongCa({
  actor,
  userId,
  xemDuocNguoiKhac,
  neo,
  locCoSo,
}: {
  actor: Actor;
  userId: string;
  xemDuocNguoiKhac: boolean;
  neo?: string;
  locCoSo?: string;
}): Promise<KetQuaTongHop> {
  const moNeo =
    neo && /^\d{4}-\d{2}-\d{2}$/.test(neo) ? new Date(`${neo}T00:00:00`) : new Date();
  const dauTuan = thuHaiCua(moNeo);
  const cuoiTuan = new Date(dauTuan);
  cuoiTuan.setDate(cuoiTuan.getDate() + 7);
  const ngayTrongTuan = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(dauTuan);
    d.setDate(d.getDate() + i);
    return ymd(d);
  });

  const chiMinh = !xemDuocNguoiKhac;
  const loc = chiMinh ? null : locCoSo ?? null;

  // Cách ly cơ sở (A0-04): ShiftRegistration / EmployeeCheckin /
  // TimesheetAdjustmentRequest ∈ SCOPED_MODELS → `scopedDb` tự chặn.
  const sdb = scopedDb(actor);

  // ⚠️ `User` và `Center` KHÔNG thuộc SCOPED_MODELS — phải tự chặn (xem
  //    `coSoChoPhep`). Đây là chỗ bản admin để hở cho mọi vai không mang mã
  //    `CENTER_MANAGER`.
  const choPhep = coSoChoPhep(actor);

  const coSo =
    !chiMinh && (choPhep === null || choPhep.length > 1)
      ? await sdb.center.findMany({
          where: { isActive: true, ...(choPhep ? { id: { in: choPhep } } : {}) },
          orderBy: { displayOrder: "asc" },
          select: { id: true, name: true },
        })
      : [];

  const dieuKienNguoi: Prisma.UserWhereInput = chiMinh
    ? { id: userId }
    : {
        role: { not: "PARENT" },
        isActive: true,
        deletedAt: null,
        ...(loc ? { centerId: loc } : choPhep ? { centerId: { in: choPhep } } : {}),
      };

  const [nhanSuTho, dangKy, banGhi, giaiTrinh] = await Promise.all([
    sdb.user.findMany({
      where: dieuKienNguoi,
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, center: { select: { name: true } } },
    }),
    sdb.shiftRegistration.findMany({
      where: {
        date: { gte: dauTuan, lt: cuoiTuan },
        status: "APPROVED", // chỉ lịch CHÍNH THỨC
        ...(chiMinh ? { userId } : loc ? { user: { centerId: loc } } : {}),
      },
      select: { userId: true, date: true, shifts: true },
    }),
    sdb.employeeCheckin.findMany({
      where: {
        checkedAt: { gte: dauTuan, lt: cuoiTuan },
        ...(chiMinh ? { userId } : loc ? { centerId: loc } : {}),
      },
      select: { userId: true, type: true, checkedAt: true, withinGeofence: true },
    }),
    sdb.timesheetAdjustmentRequest.findMany({
      where: {
        date: { gte: dauTuan, lt: cuoiTuan },
        ...(chiMinh ? { userId } : loc ? { centerId: loc } : {}),
      },
      select: { userId: true, date: true, reason: true, status: true },
    }),
  ]);

  // Gộp đúng 1 dòng/nhân viên (dedup theo id, phòng nhân đôi) — y bản admin.
  const nhanSu = Array.from(new Map(nhanSuTho.map((u) => [u.id, u])).values());

  const banDoCa = new Map<string, Map<string, WorkShift[]>>();
  for (const r of dangKy) {
    const ds = ymd(new Date(r.date));
    if (!banDoCa.has(r.userId)) banDoCa.set(r.userId, new Map());
    banDoCa.get(r.userId)!.set(ds, r.shifts);
  }

  type Quet = { vao: Date | null; ra: Date | null; ngoaiVung: boolean };
  const banDoQuet = new Map<string, Map<string, Quet>>();
  for (const c of banGhi) {
    const ds = ymd(new Date(c.checkedAt));
    if (!banDoQuet.has(c.userId)) banDoQuet.set(c.userId, new Map());
    const ngay = banDoQuet.get(c.userId)!;
    const cur = ngay.get(ds) ?? { vao: null, ra: null, ngoaiVung: false };
    if (c.type === "CHECK_IN") cur.vao = c.checkedAt;
    else cur.ra = c.checkedAt;
    if (!c.withinGeofence) cur.ngoaiVung = true;
    ngay.set(ds, cur);
  }

  const banDoGiaiTrinh = new Map<string, Map<string, { reason: string; status: string }>>();
  for (const a of giaiTrinh) {
    const ds = ymd(new Date(a.date));
    if (!banDoGiaiTrinh.has(a.userId)) banDoGiaiTrinh.set(a.userId, new Map());
    banDoGiaiTrinh.get(a.userId)!.set(ds, { reason: a.reason, status: a.status });
  }

  const dungSai = await getSetting("shift.toleranceMinutes");

  const dong: DongTongHop[] = nhanSu.map((u) => ({
    userId: u.id,
    // `?? ""` chứ không phải một chuỗi thay thế tự nghĩ ra: bản admin viết
    // `{u.name ?? u.email}` trong JSX, và khi CẢ HAI cùng rỗng thì ô tên trống.
    // Giữ y hệt để không đẻ ra một nhãn chỉ site Sale có. (Màn `/sale/cham-cong`
    // dùng "(không tên)" — đó cũng là lựa chọn của chính bản admin ở màn đó.)
    ten: u.name ?? u.email ?? "",
    tenCoSo: !loc ? u.center?.name ?? null : null,
    ngay: ngayTrongTuan.map((ds) => {
      const ca = banDoCa.get(u.id)?.get(ds) ?? [];
      const quet = banDoQuet.get(u.id)?.get(ds) ?? { vao: null, ra: null, ngoaiVung: false };
      const gt = banDoGiaiTrinh.get(u.id)?.get(ds);
      const tinh = computeShiftAttendance(
        {
          checkIn: quet.vao,
          checkOut: quet.ra,
          geofenceFlag: quet.ngoaiVung,
          registeredShifts: ca,
        },
        dungSai,
      );
      const dau = tinh.tags[0];
      return {
        coDuLieu: ca.length > 0 || !!quet.vao || !!quet.ra || !!gt,
        caDangKy: ca.length > 0 ? formatRegisteredShifts(ca) : null,
        chuaDangKyCa: ca.length === 0 && !!quet.vao,
        gio: quet.vao || quet.ra ? `${formatVNTime(quet.vao)}–${formatVNTime(quet.ra)}` : null,
        nhan: dau ? nhanTuTag(dau) : null,
        giaiTrinh: gt ? `Giải trình (${gt.status}): ${gt.reason}` : null,
      } satisfies ONgayTongHop;
    }),
  }));

  const truoc = new Date(dauTuan);
  truoc.setDate(truoc.getDate() - 7);
  const sau = new Date(dauTuan);
  sau.setDate(sau.getDate() + 7);

  return {
    ngayTrongTuan,
    dong,
    chiMinh,
    coSo,
    locCoSo: loc,
    tuanTruoc: ymd(truoc),
    tuanSau: ymd(sau),
    neoTuan: ymd(dauTuan),
  };
}
