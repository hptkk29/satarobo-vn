// app/(teacher)/teacher/bang-cong/page.tsx — #06 (L6): "Bảng công" site GV.
//
// ⚠️ ĐÍNH CHÍNH CHÚ THÍCH CŨ. Bản trước viết: *"Bố cục theo reference TeachUI: 4 StatCard
// (Số ca · Buổi dạy · Tổng giờ công · Ngày nghỉ)"*. BỐN THẺ ĐÓ KHÔNG CÒN — chúng bị thay ở
// bộ chốt 15/09/2026 và chú thích không được sửa theo, nên nó đã mô tả một màn không tồn
// tại. Chú thích không phải bằng chứng; ai đọc nó mà không mở trang sẽ đi tìm nhầm chỗ.
//
// BỐ CỤC THẬT (chốt 10/09, dựng 15/09) — hai tầng, đọc từ trên xuống:
//   1. BỐN SỐ luôn hiện: Công tháng (thực/chuẩn) · Ngày đã đi làm · Đi muộn & Về sớm ·
//      Ngày nghỉ phép. Đây là thứ người ta mở trang để xem, không phải bới ra.
//   2. KHỐI GẤP LẠI (`<details>` thuần, không JS): nghỉ tách loại · giờ làm/kế hoạch ·
//      ngày có vấn đề · đơn của tôi · công dạy (chỉ GV). Tự MỞ SẴN khi có việc phải làm —
//      gấp một vấn đề vào trong là giấu nó.
//   3. Bảng CHI TIẾT CA gộp 3 loại: Dạy (ClassSession) · Trải nghiệm (TrialClassSession) ·
//      Ca làm (ShiftRegistration). Tiêu đề bảng PHẢI khai nó gộp ba loại — xem chỗ đó.
//
// Chọn tháng qua ?thang=YYYY-MM; lọc ngày cần xử lý qua ?loc=co.
//
// 🔴 LUẬT 12b — mọi con số ở đây đọc từ ĐÚNG hàm admin đọc (`getMyAttendanceDays` →
// `gopNgayCong` → `tomTatCongThang`; công dạy qua `loadBuoiDay` + `congDayCuaNguoi`).
// Đây là lần thứ TƯ site GV được thêm cột số; ba lần trước đều tự dựng lại và đều sai.
//
// L5 chấm công v3 (06/09/2026): ca làm đọc từ lưới ShiftAssignment (Quản lý xếp), công
// ngày từ StaffAttendanceDay (engine tính theo ca — T-01), đơn từ là WorkRequest nộp ở
// /teacher/don-tu. Giờ dạy/trải nghiệm vẫn là ước tính từ khung giờ (không phải công).
//
// 🔴 Vá 10/09/2026 — LẦN THỨ BA site GV dựng lại con số của admin. Hai bug cùng gốc:
//   · ngày nghỉ X/P hiện "Ca làm · theo nơi làm" (lọc bằng `isLeave`, mà X mang isLeave=false);
//   · Trạng thái in "Đã làm" cho MỌI dòng quá khứ vì `done = dateKey < todayKey`.
// `getMyAttendanceDays` VỐN đã được gọi ở màn này — nhưng chỉ để cộng một con tổng, còn từng
// dòng thì tự suy từ ngày. Nay mọi ô số/nhãn đi qua `lib/cham-cong/nhan-ca.ts` (dùng chung với
// admin) và đọc thẳng `StaffAttendanceDay` — KHÔNG có phép tính thứ hai ở đây.
//
// Nguồn (own-rows): getMyAssignments/getMyAttendanceDays (lib/cham-cong/my-schedule) ·
// getTeacherTrialSessions (lib/lms/teacher-schedule); buổi dạy qua
// withMakeupException (dạy thay/bù liên cơ sở). ⚠️ Câu 46: chỉ tên lớp/cơ sở + giờ — không HV/PH.
import Link from "next/link";
import {
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
} from "lucide-react";
import type { SessionStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { withMakeupException } from "@/lib/db-scope";
import { checkPermission } from "@/lib/auth/check-permission";
import {
  getTeacherTrialSessions,
} from "@/lib/lms/teacher-schedule";
import {
  getMyAssignments,
  getMyAttendanceDays,
  getMyPeriod,
} from "@/lib/cham-cong/my-schedule";
import {
  NHAN_TRANG_THAI,
  type TrangThaiNgay,
} from "@/lib/cham-cong/nhan-ca";
import {
  CO_CAN_XU_LY,
  dungDongBangCong,
  tomTatCongThang,
  type LoaiOCa,
} from "@/lib/cham-cong/bang-cong-gv";
import { congDayCuaNguoi } from "@/lib/cham-cong/cong-day";
import { loadBuoiDay, loadLoaiCongDay } from "@/lib/cham-cong/cong-day-db";
import { FlagList } from "@/components/cham-cong/ui/flag-chip";
import { scopedDb } from "@/lib/db-scope";
import {
  WR_KIND_LABEL,
  WR_STATUS_LABEL,
  type WorkRequestKindV,
  type WorkRequestStatusV,
} from "@/lib/work-request";
import { cn } from "@/lib/utils";
import { dieuKienBuoiTinhCong } from "@/lib/lms/session-ownership";
import { PageHeader } from "../_components/ui/page-header";
import { EmptyState } from "../_components/ui/empty-state";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";

export const metadata = { title: "Bảng công | Giáo viên Sata Robo" };

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function vnTodayUtc(now = new Date()): Date {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  return new Date(
    Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()),
  );
}
function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function addMonthsUtc(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}
function toVnInstant(dayUtc: Date): Date {
  return new Date(dayUtc.getTime() - VN_OFFSET_MS);
}
const two = (n: number) => String(n).padStart(2, "0");
function monthKey(monthStart: Date): string {
  return `${monthStart.getUTCFullYear()}-${two(monthStart.getUTCMonth() + 1)}`;
}
function parseThang(raw?: string): Date | null {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return null;
  const [y, m] = raw.split("-").map(Number);
  if (y < 2000 || y > 2100 || m < 1 || m > 12) return null;
  return new Date(Date.UTC(y, m - 1, 1));
}

function parseHHmm(s: string | null): number | null {
  if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}
/** Giờ (số) giữa 2 mốc "HH:mm" — thiếu/không hợp lệ → 0. */
function hoursBetween(start: string | null, end: string | null): number {
  const a = parseHHmm(start);
  const b = parseHHmm(end);
  if (a === null || b === null || b <= a) return 0;
  return (b - a) / 60;
}
const fmtHours = (h: number) =>
  h.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
/** "sáng" (<12) · "chiều" (12–17) · "tối" (≥17) từ giờ bắt đầu — đặt tên "Ca dạy …". */
function shiftOfDay(start: string | null): string {
  const m = parseHHmm(start);
  if (m === null) return "";
  if (m < 12 * 60) return "sáng";
  if (m < 17 * 60) return "chiều";
  return "tối";
}

/** "YYYY-MM-DD" theo giờ VN cho cột Timestamptz. */
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});
function isoKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "2026-08-03" → "03/08/2026". Đảo chuỗi thuần, không đụng múi giờ. */
function viDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
/* Ngày HIỂN THỊ trong bảng công — dd/mm/yyyy. (`isoKey`/`dayKeyFmt` ở trên vẫn
   giữ ISO vì chúng là KHOÁ tra bản đồ, không phải chữ cho người đọc.)
   timeZone UTC là cố ý: cột `date` kiểu @db.Date, đổi múi giờ sẽ lệch một ngày. */
const dateFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

const REQ_STATUS_CLS: Record<WorkRequestStatusV, string> = {
  PENDING: "bg-state-warning-soft text-state-warning-ink",
  APPROVED: "bg-state-success-soft text-state-success-ink",
  REJECTED: "bg-state-danger-soft text-state-danger-ink",
};

const TYPE_TONE: Record<LoaiOCa, string> = {
  Dạy: "bg-state-info-soft text-state-info-ink",
  "Trải nghiệm": "bg-primary-soft text-primary-ink",
  "Ca làm": "bg-muted text-muted-foreground",
  Nghỉ: "bg-muted text-muted-foreground",
  "Nghỉ phép": "bg-state-warning-soft text-state-warning-ink",
};

/** Tông của chip Trạng thái. Chỉ "Đã làm" được nhuộm xanh — nhãn khẳng định thì phải có chứng. */
const TRANG_THAI_TONE: Record<TrangThaiNgay, string> = {
  DA_LAM: "bg-state-success-soft text-state-success-ink",
  SAP_TOI: "bg-state-info-soft text-state-info-ink",
  NGHI: "bg-muted text-muted-foreground",
  CHUA_CHAM: "bg-state-warning-soft text-state-warning-ink",
  CHUA_TINH: "bg-muted text-muted-foreground",
  CHUA_CHOT: "bg-state-warning-soft text-state-warning-ink",
};

/** 411 phút → "6h51". Giống hệt `fmtMin` của màn admin /cham-cong/lich-ca. */
const fmtMin = (m: number) =>
  m ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : "—";

/**
 * `null` ⇒ "—". Đây là ràng buộc 3 của chủ dự án, viết thành MỘT hàm để không chỗ nào
 * lỡ in `0` cho một thứ chưa đo được: số 0 và "chưa có dữ liệu" là hai chuyện khác nhau.
 */
function soHoacGach(n: number | null, donVi: string): string {
  return n == null ? "—" : `${n} ${donVi}`;
}

/**
 * Một ô trong hàng năm số.
 *
 * `nhan` và `phu` CỐ Ý không `truncate`: nhãn ở màn này phải khai đúng thứ nó đếm và khai
 * cả phạm vi, mà nhãn đúng thì dài (13/09: "Công tháng này / công chuẩn" bị cắt thành
 * "Công tháng nà…" ở 375px). Ô cao thêm một dòng rẻ hơn một nhãn nói dối.
 */
function OTong({
  nhan,
  chinh,
  phu,
  nhanManh = false,
  canhBao = false,
  href,
  nhanLink,
}: {
  nhan: string;
  chinh: string;
  phu: string;
  nhanManh?: boolean;
  canhBao?: boolean;
  href?: string;
  nhanLink?: string;
}) {
  return (
    <div className="relative flex min-w-0 flex-col gap-1 bg-card p-4 sm:p-5">
      <p className="text-xs leading-snug font-semibold text-muted-foreground">
        {nhan}
      </p>
      <p
        className={cn(
          "leading-tight font-bold tabular-nums",
          // `text-2xl` chứ không `text-4xl`: DESIGN.md §3 — số tiền/số dài đã từng TRÀN
          // ra ngoài thẻ ở cỡ lớn, và đây là giao diện dữ liệu dày chứ không phải hero.
          nhanManh ? "text-2xl" : "text-xl",
          canhBao
            ? "text-state-warning-ink"
            : nhanManh
              ? "text-primary-ink"
              : "text-foreground",
        )}
      >
        {chinh}
      </p>
      <p className="text-[11px] leading-snug text-muted-foreground">{phu}</p>
      {href && nhanLink && (
        <Link
          href={href}
          scroll={false}
          // Vùng bấm phủ CẢ ô (`after:absolute after:inset-0`) chứ không chỉ dòng chữ —
          // luật 12: mở rộng vùng bấm, đừng để một lời hứa bé bằng con chữ. ≥44px nhờ ô.
          className="mt-0.5 text-[11px] font-semibold text-primary-ink after:absolute after:inset-0 hover:underline"
        >
          {nhanLink} →
        </Link>
      )}
    </div>
  );
}

/**
 * Câu khai phạm vi cho ô "Ngày nghỉ phép": nó KHÔNG gồm những loại nghỉ nào.
 *
 * Chỉ kể loại thật sự CÓ. Bản đầu in cứng cả hai vế và ra "KHÔNG gồm 0 ngày lễ và 0 ngày
 * nghỉ theo ca" — một câu đính chính cho thứ không tồn tại, vừa dài vừa làm người đọc
 * dừng lại tìm xem mình có bỏ sót gì không. Ảnh chụp bắt được; không cổng nào khác bắt.
 */
function khaiNghiKhac(nghiLe: number, nghiTuan: number): string {
  const ve: string[] = [];
  if (nghiLe > 0) ve.push(`${nghiLe} ngày lễ`);
  if (nghiTuan > 0) ve.push(`${nghiTuan} ngày nghỉ theo ca`);
  return ve.length
    ? `KHÔNG gồm ${ve.join(" và ")} — xem chi tiết dưới`
    : "ngày bạn xin nghỉ · không gồm nghỉ lễ và nghỉ theo ca";
}

/**
 * Ô có HAI con số ngang hàng nhau (Đi muộn / Về sớm).
 *
 * Vì sao không nhét thành một con số: "3 lần muộn + 1 lần sớm = 4" là một phép cộng SAI —
 * một ngày vừa đi muộn vừa về sớm bị đếm hai lần, và hai việc ấy cũng không cùng một loại
 * lỗi để cộng. Chủ dự án chốt ô này in "số LẦN + số PHÚT", nên nó in đúng bốn con số.
 */
function ODoi({
  nhan,
  dong,
  phu,
}: {
  nhan: string;
  dong: { nhan: string; lan: number; phut: number }[];
  phu: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-card p-4 sm:p-5">
      <p className="text-xs leading-snug font-semibold text-muted-foreground">
        {nhan}
      </p>
      <dl className="mt-0.5 space-y-1">
        {dong.map((d) => (
          <div key={d.nhan} className="flex items-baseline justify-between gap-2">
            <dt className="text-sm leading-snug text-muted-foreground">{d.nhan}</dt>
            <dd
              className={cn(
                "shrink-0 text-base leading-tight font-bold whitespace-nowrap tabular-nums",
                d.lan > 0 ? "text-state-warning-ink" : "text-foreground",
              )}
            >
              {/* 0 lần thì in "—" chứ không "0 lần · 0′": ràng buộc 3, và bốn số 0 xếp
                  chồng nhau chỉ làm mắt phải đọc thêm mà không biết thêm gì. */}
              {d.lan > 0 ? `${d.lan} lần · ${d.phut}′` : "—"}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-auto pt-1 text-[11px] leading-snug text-muted-foreground">{phu}</p>
    </div>
  );
}

/** Một nhóm nhãn→giá trị trong khối chi tiết. */
function NhomSo({
  tieuDe,
  dong,
}: {
  tieuDe: string;
  dong: [string, string][];
}) {
  return (
    <div className="min-w-0 bg-card p-4 sm:p-5">
      <h3 className="mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">
        {tieuDe}
      </h3>
      <dl className="space-y-1.5">
        {dong.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3">
            <dt className="min-w-0 text-sm leading-snug text-muted-foreground">
              {k}
            </dt>
            <dd className="shrink-0 text-sm font-semibold whitespace-nowrap text-foreground tabular-nums">
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default async function TeacherTimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ thang?: string; loc?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate

  const sp = await searchParams;
  const todayUtc = vnTodayUtc();
  const todayKey = isoKey(todayUtc);
  const thisMonth = startOfMonthUtc(todayUtc);
  const monthStart = parseThang(sp.thang) ?? thisMonth;
  // Bộ lọc "ngày cần xử lý" sống trong URL, không trong state — trang này là RSC, và một
  // đường dẫn chia sẻ được thì người ta gửi cho quản lý được.
  const locCo = sp.loc === "co";
  const hrefThang = (loc: string | null) => {
    const q = new URLSearchParams();
    if (sp.thang) q.set("thang", sp.thang);
    if (loc) q.set("loc", loc);
    const t = q.toString();
    return t ? `?${t}` : "?";
  };
  const nextMonth = addMonthsUtc(monthStart, 1);

  const actor = await resolveActor(session.user.id);
  const xdb = withMakeupException(actor);
  const classIds = [...actor.assignedClassIds];

  // L5 chấm công v3: ca làm đọc từ lưới ShiftAssignment; công ngày từ StaffAttendanceDay;
  // đơn từ (chỉnh công, đổi ca, nghỉ…) là WorkRequest — nộp ở /teacher/don-tu.
  const canRequestAdjust = await checkPermission("hr_attendance:checkin", {
    centerId: session.user.centerId ?? "hoi-so",
  });
  const sdb = scopedDb(actor);

  const [sessions, trials, shiftRows, myDays, myRequests] =
    await Promise.all([
      // Buổi lớp trong tháng (mọi trạng thái trừ hủy) — lớp mình / thực dạy.
      xdb.classSession.findMany({
        where: {
          status: { not: "CANCELLED" },
          date: { gte: toVnInstant(monthStart), lt: toVnInstant(nextMonth) },
          // ⚠️ Trước 08/09/2026 thiếu nhánh `substituteTeacherId`: buổi được xếp dạy
          // thay KHÔNG hiện trên bảng công của chính người dạy thay. Luật ở MỘT chỗ:
          // `dieuKienBuoiTinhCong` (`lib/lms/session-ownership.ts`) — và nó cố ý KHÁC
          // `isSessionOwnedByTeacher`: quyền xem ≠ công đứng lớp.
          ...dieuKienBuoiTinhCong(session.user.id, classIds),
        },
        select: {
          id: true,
          date: true,
          status: true,
          class: {
            select: {
              name: true,
              startTime: true,
              endTime: true,
              center: { select: { name: true } },
            },
          },
        },
        orderBy: { date: "asc" },
        take: 500,
      }),
      getTeacherTrialSessions(session.user.id, monthStart, nextMonth),
      getMyAssignments(session.user.id, monthStart, nextMonth),
      getMyAttendanceDays(session.user.id, monthStart, nextMonth),
      sdb.workRequest.findMany({
        where: {
          requesterId: session.user.id,
          fromDate: { gte: monthStart, lt: nextMonth },
        },
        select: {
          id: true,
          kind: true,
          status: true,
          fromDate: true,
          requestedInAt: true,
          requestedOutAt: true,
          reason: true,
          reviewNote: true,
          applyError: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);
  // ── Kỳ công của tháng đang xem ────────────────────────────────────────────────
  // `standardUnits` là MẪU SỐ của thẻ "Công thực tế / công chuẩn", và nó sống ở
  // `AttendancePeriod` theo (cơ sở × kỳ) — không phải theo người.
  //
  // ⚠️ Đi qua `getMyPeriod` (own-rows) chứ KHÔNG qua `scopedDb`: xem chú thích ở hàm đó.
  // Bản đầu tra bằng `sdb` và thẻ in "Chưa lập kỳ" cho một kỳ ĐÃ lập — vì giáo viên thiếu
  // `UserOrgRole` thì `scopedDb` lọc sạch và trả `null`, không phân biệt được "chưa có"
  // với "không được xem".
  //
  // `standardUnits` vẫn CÓ THỂ null thật (kế toán chưa điền) — lúc đó in "—", không in 0.
  const kyCong = await getMyPeriod(session.user.id, monthKey(monthStart));

  // ĐƠN của tôi trong tháng, đếm theo trạng thái. Đây là NGOẠI LỆ duy nhất của ràng buộc
  // "mọi số đọc từ StaffAttendanceDay": đơn là một sự việc riêng, không phải lượt quét —
  // và nó KHÔNG phải `StaffTimeLog`, tức không mở lại đường đã sinh ra bug nơi chịu công.
  const donTheoTrangThai = myRequests.reduce(
    (a, r) => {
      if (r.status === "PENDING") a.choDuyet += 1;
      else if (r.status === "REJECTED") a.tuChoi += 1;
      else if (r.status === "APPROVED" && r.kind === "TIMESHEET_FIX")
        a.daDuyetChinhCong += 1;
      return a;
    },
    { choDuyet: 0, daDuyetChinhCong: 0, tuChoi: 0 },
  );

  const tomTat = tomTatCongThang({
    ngay: myDays.map((d) => d.gop),
    kyKhoa: monthKey(monthStart),
    congChuan: kyCong.standardUnits,
    kyTrangThai: kyCong.status,
    kyChotLuc: kyCong.lockedAt,
    homNay: todayKey,
    dauThang: isoKey(monthStart),
    cuoiThang: isoKey(new Date(nextMonth.getTime() - 86_400_000)),
    don: donTheoTrangThai,
  });

  // CÔNG DẠY — đọc bằng ĐÚNG đường admin dùng (`loadBuoiDay` + `congDayCuaNguoi`), tách theo
  // từng `TeachingCreditType` vì mỗi loại một hệ số. Không tự đếm `rows` ở trang này.
  const [buoiDayThat, danhMucCongDay] = await Promise.all([
    loadBuoiDay([session.user.id], monthStart, nextMonth),
    loadLoaiCongDay(),
  ]);
  const congDay = congDayCuaNguoi(buoiDayThat, danhMucCongDay);

  // BUỔI QUÁ HẠN CHƯA CHỐT — "việc phải làm", nên nó đi kèm ĐƯỜNG ĐI, không chỉ con số.
  //
  // Phạm vi: ĐÚNG tháng đang xem (cùng `sessions` mà bảng dưới dùng), không phải mọi thời
  // gian — hai phạm vi khác nhau trên cùng một màn là cách chắc chắn để người ta cộng nhầm.
  // Nhãn nói rõ "trong tháng này".
  //
  // `IN_PROGRESS` CỐ Ý cũng tính: buổi mở ra rồi bỏ dở vẫn là buổi chưa chốt, và với người
  // dạy thì việc phải làm y hệt. Chỉ `COMPLETED` mới là xong (`CANCELLED` đã bị loại từ truy vấn).
  const buoiQuaHan = sessions.filter(
    (s) =>
      (s.status as SessionStatus) !== "COMPLETED" &&
      dayKeyFmt.format(s.date) < todayKey,
  ).length;

  // Khối chi tiết có tự MỞ SẴN không. Ba điều kiện, và cả ba đều là "có việc phải làm",
  // không phải "có số khác 0": gấp một VIỆC vào trong rồi coi như đã hiển thị là đúng lớp
  // lỗi luật 12 — người dùng không bấm thì không thấy.
  //
  // `ngayCanXuLy` gồm đi muộn/về sớm/thiếu lượt/sai nơi làm; `chuaCham` là ngày có ca mà
  // chưa có dấu nào; `buoiQuaHan` là buổi dạy quá ngày chưa chốt. Không có cái nào thì khối
  // gấp lại — lúc ấy nó là số để tra cứu, không phải việc.
  const coViecPhaiLam =
    tomTat.ngayCanXuLy > 0 || tomTat.chuaCham > 0 || buoiQuaHan > 0;

  // ── Chuẩn hoá về CA rows ──────────────────────────────────────────────────────
  // 🔴 Phép nối "ngày công đã tính × ca đã xếp" nằm ở `lib/cham-cong/bang-cong-gv.ts`, KHÔNG
  // ở đây. Trang chỉ chuyển dữ liệu về hình dạng của hàm đó rồi in ra. Đây là chỗ đã ba lần
  // đẻ ra một bản tính thứ hai cho con số admin đã có (luật 12b).
  const rows = dungDongBangCong({
    buoi: [
      ...sessions.map((s) => {
        const hrs = hoursBetween(s.class.startTime, s.class.endTime);
        return {
          key: `d-${s.id}`,
          ngay: dayKeyFmt.format(s.date),
          loai: "Dạy" as const,
          ten: `Ca dạy ${shiftOfDay(s.class.startTime)}`.trim(),
          phu:
            [s.class.name, s.class.center?.name].filter(Boolean).join(" · ") || null,
          gio:
            s.class.startTime && s.class.endTime
              ? `${s.class.startTime}–${s.class.endTime}`
              : "—",
          soGio: hrs > 0 ? hrs : null,
          hoanTat: (s.status as SessionStatus) === "COMPLETED",
        };
      }),
      ...trials.map((t) => {
        const hrs = hoursBetween(t.startTime, t.endTime);
        return {
          key: `t-${t.id}`,
          ngay: isoKey(t.date),
          loai: "Trải nghiệm" as const,
          ten: t.trialClassName,
          phu: null,
          gio: `${t.startTime}–${t.endTime}`,
          soGio: hrs > 0 ? hrs : null,
          hoanTat: t.status === "COMPLETED",
        };
      }),
    ],
    ca: shiftRows.map((r) => ({
      ngay: isoKey(r.date),
      ma: r.code,
      ten: r.name,
      kind: r.kind,
      noi: r.centerLabel,
      gio: r.timeLabel,
    })),
    cong: myDays.map((d) => ({
      ngay: isoKey(d.date),
      phutLam: d.worked,
      cong: d.units,
      flags: d.flags,
      ma: d.code,
    })),
    homNay: todayKey,
  });

  // Bộ lọc của thẻ "Ngày cần xử lý". Dùng ĐÚNG tập cờ mà thẻ đếm (`CO_CAN_XU_LY`) —
  // hai danh sách rời nhau là cách chắc chắn để thẻ nói "3" mà bảng lọc ra 5 dòng.
  const dongHienThi = locCo
    ? rows.filter((r) => r.flags.some((f) => CO_CAN_XU_LY.has(f)))
    : rows;

  // Đếm theo LOẠI cho câu khai phạm vi của tiêu đề bảng.
  //
  // ⚠️ Phải đứng SAU `rows` — bản đầu đặt nó lên trước và `tsc` KHÔNG bắt: lời gọi
  // `rows.filter` nằm trong callback của `.map`, nên bộ kiểm tra "dùng trước khi khai báo"
  // không nhìn thấy, còn lúc chạy thì nổ `ReferenceError`. Typecheck xanh không phải bằng
  // chứng thứ tự đúng.
  //
  // Đếm trên `rows` (TOÀN THÁNG) chứ không `dongHienThi`: câu này khai phạm vi của bảng
  // đầy đủ; phần bị lọc đã nói ở "N / M" trong tiêu đề. Bỏ loại 0 dòng — "0 trải nghiệm"
  // không nói thêm gì.
  const demTheoLoai = (["Dạy", "Trải nghiệm", "Ca làm"] as const)
    .map((nhan) => ({ nhan, n: rows.filter((r) => r.loai === nhan).length }))
    .filter((d) => d.n > 0);


  const monthLabel = `Tháng ${monthStart.getUTCMonth() + 1}/${monthStart.getUTCFullYear()}`;

  return (
    <div>
      <PageHeader
        title="Bảng công"
        subtitle="Công, giờ làm và ngày nghỉ của bạn theo từng tháng. Số ở đây đọc cùng nguồn với bảng công của quản lý — giờ dạy là ước tính từ khung giờ lớp, không phải công."
        actions={
          canRequestAdjust ? (
            <Link
              href="/teacher/don-tu?type=TIMESHEET_FIX"
              className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Đơn chỉnh công
            </Link>
          ) : null
        }
      />

      <div className="space-y-6">
        {/* Chọn tháng */}
        <div className="flex flex-wrap items-center gap-2">
          <NavLink
            href={`?thang=${monthKey(addMonthsUtc(monthStart, -1))}`}
            aria="Tháng trước"
          >
            <ChevronLeft className="h-4 w-4" />
          </NavLink>
          <NavLink href={`?thang=${monthKey(nextMonth)}`} aria="Tháng sau">
            <ChevronRight className="h-4 w-4" />
          </NavLink>
          <Link
            href="?"
            scroll={false}
            className="ml-1 inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/50"
          >
            Tháng này
          </Link>
          <p className="ml-2 text-base font-bold text-foreground">
            {monthLabel}
          </p>
        </div>

        {/* ══ TỔNG HỢP CÔNG THÁNG ══════════════════════════════════════════════
            MỘT panel liền mạch, đường kẻ dựng bằng `gap-px` trên nền `bg-border`.
            Vì sao KHÔNG phải các thẻ rời: lưới thẻ rời luôn đẻ ra một ô mồ côi ở hàng cuối
            khi số cột không chia hết — `gap-px` cho đường kẻ tự khớp với MỌI số cột, từ
            320px tới 8K, không cần luật `border-r last:border-r-0` cho từng breakpoint. */}
        <section
          aria-labelledby="tong-hop-thang"
          className="overflow-hidden rounded-xl border border-border bg-card"
        >
          {/* Câu KHAI PHẠM VI — ràng buộc 2. Người đọc không phải đoán "tháng này tính tới
              đâu" và "có gồm ngày chưa tới không".

              TẠM TÍNH đứng NGAY CẠNH tiêu đề, không nằm dưới chân: chủ dự án chốt "kỳ chưa
              chốt ⇒ ghi rõ TẠM TÍNH", và một lời cảnh báo đặt sau khi người ta đã đọc xong
              số thì đã muộn. Nó nói về CẢ khối, nên không thể là một ô trong lưới. */}
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-4 py-3 sm:px-5">
            <h2 id="tong-hop-thang" className="text-sm font-bold text-foreground">
              Tổng hợp {monthLabel.toLowerCase()}
            </h2>
            {tomTat.kyTrangThai === "LOCKED" ? (
              <span className="inline-flex items-center rounded-full bg-state-success-soft px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-state-success-ink">
                ĐÃ CHỐT
                {tomTat.kyChotLuc ? ` ${dayKeyFmt.format(tomTat.kyChotLuc)}` : ""}
              </span>
            ) : (
              // `title` KHÔNG đủ để mang một thông tin: trên điện thoại không có hover,
              // nên tooltip là chữ không ai đọc được. "Chưa lập kỳ" khác hẳn "đang mở" —
              // nó nghĩa là Kế toán chưa lập kỳ cho tháng này, và đó là lý do công chuẩn
              // in "—" — nên nó phải nằm TRONG nhãn.
              <span className="inline-flex items-center rounded-full bg-state-warning-soft px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-state-warning-ink">
                TẠM TÍNH{tomTat.kyTrangThai === null ? " · CHƯA LẬP KỲ" : ""}
              </span>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
              {tomTat.tinhToiNgay
                ? `tính tới hết ngày ${tomTat.tinhToiNgay.slice(8)}/${tomTat.tinhToiNgay.slice(5, 7)}`
                : "trọn tháng"}
              {" · "}
              {tomTat.gomNgayTuongLai
                ? "chưa gồm ngày chưa tới"
                : "đã gồm mọi ngày trong tháng"}
              {tomTat.kyTrangThai !== "LOCKED" &&
                " · số còn đổi tới khi Kế toán chốt kỳ"}
            </p>
          </header>

          {/* ── A · BỐN SỐ luôn hiện (chốt 10/09) ─────────────────────────────
              Bốn, không phải năm: "Giờ làm" và "Kỳ công" xuống khối gấp. Giờ làm một mình
              không nói được gì khi thiếu vế kế hoạch (nó nằm dưới, có cả cặp), còn trạng
              thái kỳ nay là cái nhãn TẠM TÍNH ở header — nó nói về cả khối chứ không phải
              là một số ngang hàng với bốn số kia. */}
          <div className="grid gap-px bg-border min-[420px]:grid-cols-2 xl:grid-cols-4">
            <OTong
              nhan="Công tháng — thực tế / công chuẩn"
              chinh={
                tomTat.congChuan == null
                  ? String(tomTat.cong)
                  : `${tomTat.cong} / ${tomTat.congChuan}`
              }
              phu={
                tomTat.congChuan == null
                  ? "kỳ chưa có công chuẩn — Kế toán chưa lập"
                  : "chưa nhân hệ số lương — Kế toán tính riêng"
              }
              nhanManh
            />
            <OTong
              nhan="Ngày đã đi làm"
              chinh={`${tomTat.ngayDaCham} / ${tomTat.ngayCoCa}`}
              phu={
                tomTat.chuaCham > 0
                  ? `trên ${tomTat.ngayCoCa} ngày có ca · còn ${tomTat.chuaCham} ngày chưa có dấu nào`
                  : `trên ${tomTat.ngayCoCa} ngày có ca · mọi ngày đều đã có dấu`
              }
              canhBao={tomTat.chuaCham > 0}
            />
            <ODoi
              nhan="Đi muộn & Về sớm"
              dong={[
                { nhan: "Đi muộn", lan: tomTat.lateCount, phut: tomTat.latePhut },
                { nhan: "Về sớm", lan: tomTat.earlyCount, phut: tomTat.earlyPhut },
              ]}
              phu="số lần và tổng số phút trong tháng"
            />
            {/* ⚠️ NHÃN ĐÃ TỪNG SAI — chủ dự án 15/09: *"'Ngày nghỉ = 2' đang đếm ngày lễ."*
                Ngày lễ là ngày công ty cho nghỉ, KHÔNG trừ vào phép của ai; gộp nó vào đây
                là báo cho người ta rằng họ đã tiêu phép mà họ chưa tiêu. Nay ô này đếm ĐÚNG
                ngày xin nghỉ, và câu phụ KHAI RA hai loại còn lại cùng con số của chúng —
                để không ai phải đoán "vậy mấy ngày lễ đi đâu". Ca ghim:
                `lib/cham-cong/tong-hop-cong.test.ts` — "ngày lễ KHÔNG rơi vào nghỉ phép". */}
            <OTong
              nhan="Ngày nghỉ phép"
              chinh={`${tomTat.nghiPhep}`}
              phu={khaiNghiKhac(tomTat.nghiLe, tomTat.nghiTuan)}
            />
          </div>

          {/* ── B · KHỐI GẤP LẠI ──────────────────────────────────────────────
              `<details>` thuần HTML: không `'use client'`, không state, mở/gấp chạy cả khi
              JS chưa tải xong, và trình duyệt tự lo phím Enter/Space + vai trò ARIA.

              MỞ SẴN khi có việc phải làm. Gấp một vấn đề vào trong rồi coi như đã hiển thị
              là đúng lớp lỗi luật 12 (affordance nói dối): người dùng không bấm thì không
              thấy, và không ai bấm vào một mũi tên không hứa hẹn gì. */}
          <details
            open={coViecPhaiLam}
            className="group border-t border-border [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted/50 sm:px-5">
              <ChevronRight
                aria-hidden
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
              />
              Chi tiết tháng
              {tomTat.ngayCanXuLy > 0 && (
                <span className="inline-flex items-center rounded-full bg-state-warning-soft px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-state-warning-ink">
                  {tomTat.ngayCanXuLy} ngày cần xử lý
                </span>
              )}
              <span className="text-xs font-normal text-muted-foreground">
                nghỉ tách loại · giờ làm · ngày có vấn đề · đơn của tôi
                {congDay.dong.length > 0 ? " · công dạy" : ""}
              </span>
            </summary>

            <div className="grid gap-px border-t border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
              <NhomSo
                tieuDe="Ngày nghỉ tách loại"
                dong={[
                  ["Nghỉ phép (P)", `${tomTat.nghiPhep} ngày`],
                  ["— trong đó có lương", `${tomTat.nghiPhepCoLuong} ngày`],
                  ["— không lương", `${tomTat.nghiPhepKhongLuong} ngày`],
                  ["Nghỉ theo ca (X)", `${tomTat.nghiTuan} ngày`],
                  ["Nghỉ lễ", `${tomTat.nghiLe} ngày`],
                ]}
              />
              {/* Giờ làm PHẢI đi cặp với kế hoạch. Một mình "120h" không nói được nhiều hay
                  ít — nó phụ thuộc tháng ấy xếp bao nhiêu ca, con số người đọc không có
                  sẵn trong đầu. Đó là lý do ô này rời hàng đầu xuống đây dưới dạng cặp. */}
              <NhomSo
                tieuDe="Giờ làm"
                dong={[
                  ["Thực tế", fmtMin(tomTat.phutLam)],
                  ["Theo kế hoạch", fmtMin(tomTat.phutKeHoach)],
                  [
                    "Chênh lệch",
                    tomTat.phutLam === tomTat.phutKeHoach
                      ? "đúng kế hoạch"
                      : `${tomTat.phutLam > tomTat.phutKeHoach ? "+" : "−"}${fmtMin(Math.abs(tomTat.phutLam - tomTat.phutKeHoach))}`,
                  ],
                  ["Ngày đi công tác", `${tomTat.congTacNgay} ngày`],
                  ["— đủ cặp vào/ra", `${tomTat.congTacDuCap} ngày`],
                ]}
              />
              <NhomSo
                tieuDe="Ngày có vấn đề"
                dong={[
                  ["Thiếu lượt vào/ra", `${tomTat.thieuLuotNgay} ngày`],
                  ["Chưa chấm ngày nào", `${tomTat.chuaCham} ngày`],
                  ["Quản lý chỉnh tay công", `${tomTat.ghiDeCong} ngày`],
                  ["Tự chỉnh", soHoacGach(tomTat.tuChinh, "đơn")],
                ]}
              />
              <NhomSo
                tieuDe="Đơn của tôi"
                dong={[
                  ["Giờ thêm qua đơn duyệt", soHoacGach(tomTat.donChinhDaDuyet, "đơn")],
                  ["Đơn chờ duyệt", soHoacGach(tomTat.donChoDuyet, "đơn")],
                  ["Đơn bị từ chối", soHoacGach(tomTat.donTuChoi, "đơn")],
                ]}
              />
            </div>

            {/* Đường đi xuống bảng — ĐẶT NGOÀI lưới `NhomSo` vì nó là một HÀNH ĐỘNG, không
                phải một con số. Chỉ hiện khi thật sự có gì để lọc (luật 12: affordance chỉ
                được hứa thứ nó làm được). */}
            {tomTat.ngayCanXuLy > 0 && (
              <div className="border-t border-border px-4 py-3 sm:px-5">
                <Link
                  href={locCo ? hrefThang(null) : hrefThang("co")}
                  scroll={false}
                  className="text-sm font-semibold text-primary-ink hover:underline"
                >
                  {locCo
                    ? "Bỏ lọc, xem lại tất cả các ca →"
                    : `Lọc bảng xuống ${tomTat.ngayCanXuLy} ngày cần xử lý →`}
                </Link>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  Gồm: đi muộn · về sớm · thiếu lượt · sai nơi làm. Nộp đơn chỉnh công được
                  tới khi kỳ chốt.
                </p>
              </div>
            )}

            {/* ── CÔNG DẠY — chỉ hiện khi CÓ ─────────────────────────────────── */}
            {(congDay.dong.length > 0 || buoiQuaHan > 0) && (
              <div className="border-t border-border px-4 py-4 sm:px-5">
                <div className="mb-3">
                  <h3 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                    Công dạy
                  </h3>
                  {/* Định nghĩa IN RA, không để người đọc tự suy vì sao hai số khác nhau. */}
                  <p className="mt-1 max-w-prose text-[11px] leading-relaxed text-muted-foreground">
                    Tách theo loại công dạy, đếm theo NGƯỜI — gồm cả buổi dạy thay ở cơ sở
                    khác. Số này khác &ldquo;ngày có ca&rdquo; ở trên: ca là NGÀY được xếp
                    lịch, buổi dạy là LẦN đứng lớp, và một ngày có thể có nhiều buổi.
                  </p>
                </div>
                {buoiQuaHan > 0 && (
                  <Link
                    href="/teacher/diem-danh"
                    className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-state-warning-soft px-3 py-2 text-sm font-semibold text-state-warning-ink hover:underline"
                  >
                    {buoiQuaHan} buổi trong tháng này đã qua ngày mà chưa chốt
                    <span className="text-xs font-normal">
                      — mở màn Điểm danh để chốt →
                    </span>
                  </Link>
                )}
                {/* Số cột theo SỐ DÒNG THẬT, không cố định 4.
                    Lưới `gap-px` trên nền `bg-border` vẽ đường kẻ bằng chính nền — nên ô
                    TRỐNG cũng được tô. Với 1 loại công dạy (ca thường gặp nhất: chỉ "Lớp
                    chính"), bản cố định `xl:grid-cols-4` in ra một ô số rồi BA mảng xám
                    trống toang bằng 3/4 bề ngang. Ảnh chụp 1531px bắt được; tsc và lint thì
                    không, vì nó là CSS đúng cú pháp làm đúng thứ nó được bảo. */}
                <div
                  className={cn(
                    "grid gap-px bg-border",
                    congDay.dong.length >= 2 && "sm:grid-cols-2",
                    congDay.dong.length >= 3 && "xl:grid-cols-3",
                    congDay.dong.length >= 4 && "xl:grid-cols-4",
                  )}
                >
                  {congDay.dong.map((d) => (
                    <div key={d.code} className="bg-card p-3">
                      <p className="text-lg leading-tight font-bold text-foreground tabular-nums">
                        {d.buoi} buổi
                        <span className="ml-2 text-xs font-semibold text-muted-foreground">
                          {d.cong} công
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                        {d.name}
                        {!d.tinhVaoKy && " · không tính vào kỳ"}
                      </p>
                      {d.boQuaThieuGio > 0 && (
                        <p className="mt-1 text-[11px] leading-snug text-state-warning-ink">
                          {d.boQuaThieuGio} buổi chưa có giờ nên chưa tính công
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </details>
        </section>

        {/* ══ CHI TIẾT CA ══════════════════════════════════════════════════════
            ⚠️ NHÃN ĐÃ TỪNG SAI — chủ dự án 15/09: *"'Số ca 34' không nói ra nó gộp buổi dạy
            + trải nghiệm."*

            Con số này gộp BA loại dòng: `Dạy` (ClassSession) · `Trải nghiệm`
            (TrialClassSession) · `Ca làm` (ShiftAssignment). Nên nó KHÔNG bằng con số
            "buổi" ở khối Công dạy phía trên, và cũng không bằng "ngày có ca" — ba thước đo
            khác nhau đứng chung một màn.

            Hai số gần giống nhau mà không nhãn thì sẽ có người sửa cho khớp, và sửa nhầm
            cái đang đúng (đúng lý do bảng kỳ công của admin không dám đặt tên cột là "Dạy"
            trần). Nên phần đếm theo loại in NGAY trong tiêu đề, không giấu vào tooltip. */}
        <section className="space-y-3" aria-labelledby="chi-tiet-ca">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2
              id="chi-tiet-ca"
              className="text-sm font-bold tracking-wide text-muted-foreground uppercase"
            >
              Chi tiết ca ({dongHienThi.length}
              {locCo ? ` / ${rows.length}` : ""})
            </h2>
            {/* Khai PHẠM VI ngay cạnh con số: gộp những loại nào, mỗi loại mấy dòng.
                Đếm trên `rows` (TOÀN THÁNG) chứ không trên `dongHienThi` — khi đang lọc,
                câu này nói về cái bảng ĐẦY ĐỦ, và con số bị lọc đã có ở "N / M" bên trên. */}
            <p className="text-xs leading-snug font-normal text-muted-foreground normal-case">
              {/* `{" "}` TƯỜNG MINH: JSX nuốt khoảng trắng ở cuối dòng trước khi xuống dòng,
                  nên bản đầu in ra "26 ca làm— một NGÀY" dính liền. Ảnh chụp bắt, tsc không. */}
              gộp {demTheoLoai.map((d) => `${d.n} ${d.nhan.toLowerCase()}`).join(" · ")}{" "}
              — một NGÀY có thể có nhiều dòng, nên số này khác &ldquo;ngày có ca&rdquo; và
              khác &ldquo;buổi&rdquo; ở khối Công dạy
            </p>
            {/* Đang lọc thì PHẢI nói ra và phải có đường thoát — bảng thiếu dòng mà không
                giải thích là dạng nói dối im lặng tệ nhất ở màn số liệu. */}
            {locCo && (
              <span className="inline-flex items-center gap-2 rounded-full bg-state-warning-soft px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-state-warning-ink">
                Đang lọc: ngày cần xử lý
                <Link
                  href={hrefThang(null)}
                  scroll={false}
                  className="underline underline-offset-2"
                >
                  bỏ lọc
                </Link>
              </span>
            )}
          </div>
          {dongHienThi.length === 0 ? (
            <EmptyState
              icon={CalendarX2}
              title={
                locCo
                  ? "Không ngày nào trong tháng này cần xử lý."
                  : "Không có ca dạy, trải nghiệm hay ca làm nào trong tháng này."
              }
            />
          ) : (
            <div className="t-card overflow-hidden">
              <PhanTrangBang cuonNgang khoaGhiNho="gv-bang-cong">
                <table className="min-w-[1000px] w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      <th scope="col" className="px-4 py-3">
                        Ca
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Loại
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Ngày
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Giờ
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Giờ dạy
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Giờ làm
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Công
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Cờ
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Trạng thái
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dongHienThi.map((r) => (
                      <tr
                        key={r.key}
                        className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold text-foreground">
                            {r.ten}
                          </p>
                          {r.phu && (
                            <p className="text-xs text-muted-foreground">
                              {r.phu}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                              TYPE_TONE[r.loai],
                            )}
                          >
                            {r.loai}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                          {viDate(r.ngay)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-foreground">
                          {r.gio}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold text-foreground">
                          {r.soGio != null ? (
                            `${fmtHours(r.soGio)}h`
                          ) : (
                            <span className="font-normal text-muted-foreground">
                              —
                            </span>
                          )}
                        </td>
                        {/* Giờ làm + Công: đọc thẳng StaffAttendanceDay — CÙNG số admin hiện. */}
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums text-foreground">
                          {r.phutLam != null ? (
                            fmtMin(r.phutLam)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold tabular-nums text-foreground">
                          {r.cong != null ? (
                            r.cong
                          ) : (
                            <span className="font-normal text-muted-foreground">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <FlagList codes={r.flags} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                              TRANG_THAI_TONE[r.trangThai],
                            )}
                          >
                            {NHAN_TRANG_THAI[r.trangThai]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </PhanTrangBang>
            </div>
          )}
        </section>

        {/* Đơn từ của mình trong tháng (chấm công v3 — WorkRequest) */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
            Đơn từ trong tháng ({myRequests.length})
          </h2>
          {myRequests.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="Chưa có đơn nào cho tháng này."
            />
          ) : (
            <ul className="space-y-2">
              {myRequests.map((r) => (
                <li key={r.id} className="t-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">
                      {WR_KIND_LABEL[r.kind as WorkRequestKindV] ?? r.kind}
                      {r.fromDate ? ` · ${dateFmt.format(r.fromDate)}` : ""}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        REQ_STATUS_CLS[r.status as WorkRequestStatusV],
                      )}
                    >
                      {WR_STATUS_LABEL[r.status as WorkRequestStatusV]}
                    </span>
                  </div>
                  {(r.requestedInAt || r.requestedOutAt) && (
                    <p className="mt-1 text-sm text-foreground">
                      Đề nghị: vào {r.requestedInAt ?? "—"} · ra{" "}
                      {r.requestedOutAt ?? "—"}
                    </p>
                  )}
                  <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
                    {r.reason}
                  </p>
                  {r.reviewNote && (
                    <p className="mt-2 rounded-lg bg-muted/50 p-2 text-sm text-muted-foreground">
                      Phản hồi: {r.reviewNote}
                    </p>
                  )}
                  {r.status === "PENDING" && r.applyError && (
                    <p className="mt-2 text-xs text-state-danger-ink">
                      Lần duyệt gần nhất không áp được: {r.applyError}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** Nút lùi/tiến tháng — `scroll={false}`: đổi tháng chỉ đổi ?thang= của CHÍNH trang này,
 *  để mặc định thì App Router cuộn vọt lên đầu, mất chỗ đang xem trong bảng chi tiết ca. */
function NavLink({
  href,
  aria,
  children,
}: {
  href: string;
  aria: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={aria}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted/50"
    >
      {children}
    </Link>
  );
}
