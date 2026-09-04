/**
 * Site Sale — TRUY VẤN danh sách buổi học cho màn `/sale/buoi-hoc`.
 *
 * ══ ĐÂY LÀ BẢN ĐÔI CỦA TRUY VẤN TRONG `app/(admin)/admin/sessions/page.tsx` ══
 *
 * ── Vì sao nó tồn tại ───────────────────────────────────────────────────────
 * Chủ dự án chốt 04/09/2026: các màn site Sale TÁCH BẢN RIÊNG, không mount lại
 * component của khu quản trị nữa — để thiết kế lại site Sale mà KHÔNG đụng một
 * pixel nào của khu quản trị (9 vai đang làm việc hằng ngày trên đó). Rủi ro
 * trôi lệch đã được nêu trước khi chốt; chủ dự án vẫn chọn đường này. Trang
 * admin truy vấn DB ngay trong `page.tsx` nên không có hàm nào để gọi lại.
 *
 * ── NỢ TRÔI LỆCH: sửa bên nào cũng phải sửa bên kia ─────────────────────────
 *   1. Bộ `select` của buổi (thêm/bớt cột hiển thị).
 *   2. `classWhere.deletedAt = null` — QA 21/07: lớp đã xoá mềm biến khỏi
 *      `/classes` nhưng buổi của nó vẫn hiện ở `?scope=all`. Bỏ vế này là hồi
 *      sinh đúng lỗi đó.
 *   3. `orderBy` (past → `date desc`, còn lại `date asc`) và trần `take: 200`.
 *   4. Cửa sổ ngày nghỉ 90 ngày + `take: 20`.
 * KHÔNG phải nợ vì đã dùng chung ở `lib/`: `scopedDb` (cách ly cơ sở).
 *
 * ── MỘT CHỖ CỐ Ý KHÁC BẢN ADMIN, ĐỌC KỸ ─────────────────────────────────────
 * Bản admin quyết định "thấy mọi lớp hay chỉ lớp mình dạy" bằng MÃ VAI gõ tay:
 *
 *     const isManager = actor.isSuperAdmin ||
 *       actor.orgRoles.some((r) =>
 *         ["CENTER_MANAGER", "SALES_CSM", "ACCOUNTANT", "HR"].includes(r.roleCode));
 *
 * Ba trong bốn mã đó KHÔNG CÒN TỒN TẠI trong `prisma/seed-roles.ts`: mã thật
 * hôm nay là `CENTER_SALES_CSM`, `HO_ACCOUNTANT`/`CENTER_ACCOUNTANT`,
 * `HO_HR`/`CENTER_HR`. Vai khớp mã cũ = 0 người ⇒ ba vai đó rơi vào nhánh "chỉ
 * lớp mình dạy", mà họ không dạy lớp nào ⇒ **bảng trắng, không một dòng lỗi**.
 * Đây đúng là kiểu hỏng câm mà luật "đừng phân nhánh bằng mã vai" sinh ra để
 * chặn.
 *
 * Bản Sale hỏi QUYỀN thay vì hỏi mã vai: `xemDuocMoiLop` = `classes:view-all`.
 * Đối chiếu với Ý ĐỊNH của danh sách cũ thì trùng khít — CENTER_MANAGER, kế
 * toán, nhân sự, tư vấn đều giữ `classes:view-all`; giáo viên chỉ có
 * `classes:view-own` nên vẫn bị thu về lớp mình dạy/trợ giảng, y như cũ.
 *
 * ⚠️ ĐÂY LÀ MỘT CHỖ NỚI, không phải siết — phải nói thẳng: vai nào có
 *    `sessions:view` + `classes:view-all` mà KHÔNG mang đúng mã `CENTER_MANAGER`
 *    thì bản admin cho thấy bảng trắng còn bản Sale cho thấy mọi lớp TRONG TẦM
 *    NHÌN CƠ SỞ. Hôm nay không ai rơi vào đó (chỉ CENTER_MANAGER và TEACHER giữ
 *    `sessions:view`), nên khác biệt này chưa đổi hành vi của một người dùng
 *    nào. Cách ly cơ sở KHÔNG bị đụng tới: nó do `scopedDb(actor)` lo, và
 *    `ClassSession` ∈ SCOPED_MODELS nên `centerId IN <tầm nhìn>` được tiêm tự
 *    động ở cả hai bản.
 */
import { type Prisma } from "@prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";

/** Ba phạm vi thời gian của bộ lọc — khớp từng chuỗi với hợp đồng URL bản admin. */
// Hằng phạm vi ĐÃ DỜI sang `lib/sale/pham-vi-buoi-hoc.ts` (04/09) — thanh lọc chạy
// trên trình duyệt cần chúng, mà tệp này chạm Prisma. Xem lý do đầy đủ ở tệp đó.
import { MOI_PHAM_VI, NHAN_PHAM_VI, type PhamVi } from "@/lib/sale/pham-vi-buoi-hoc";
// Tái xuất để các tệp CHỈ CHẠY TRÊN MÁY CHỦ (page.tsx) nhập một chỗ như trước.
// Phải `import` TRƯỚC rồi mới `export` — `export … from` tái xuất mà KHÔNG đưa
// tên vào phạm vi tệp này, nên `docPhamVi(): PhamVi` bên dưới sẽ mất kiểu.
export { MOI_PHAM_VI, NHAN_PHAM_VI, type PhamVi };

/** Trần số dòng đọc về — giữ nguyên 200 của bản admin (câu "hiển thị 200 mới nhất"). */
export const TRAN_BUOI = 200;

/** Giá trị lạ trên URL → mốc mặc định, không ném lỗi. Khớp bản admin từng nhánh. */
export function docPhamVi(v: string | undefined): PhamVi {
  return v === "past" ? "past" : v === "all" ? "all" : "upcoming";
}

/**
 * `dd/MM/yyyy · HH:mm` — ĐÚNG chuỗi mà `formatDateTime()` trong
 * `app/(admin)/admin/sessions/_components/session-list-row.tsx` dựng.
 *
 * ⚠️ Ở BẢN ADMIN HÀM NÀY CHẠY TRÊN CLIENT, và đó là một quả bom hẹn giờ:
 *    `toLocaleTimeString` đọc múi giờ của MÁY, nên máy chủ và máy khách lệch múi
 *    là hai lần vẽ đầu tiên ra hai chuỗi khác nhau (hydration mismatch). Bản Sale
 *    định dạng ở MÁY CHỦ rồi truyền chuỗi xuống — cùng nếp với
 *    `lop-hoc/_components/bang-lop-hoc.tsx` ("cố ý ngu": component chỉ nhận chuỗi
 *    đã định dạng). Chuỗi in ra không đổi một ký tự.
 *
 * Không dùng `formatDateTimeVN` của `lib/format/date`: hàm đó trả
 * `HH:mm:ss dd/MM/yyyy` — khác thứ tự VÀ có giây.
 */
export function chuoiNgayGio(d: Date): string {
  const ngay = new Date(d).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const gio = new Date(d).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${ngay} · ${gio}`;
}

export type DongBuoi = {
  id: string;
  date: Date;
  topic: string | null;
  classId: string;
  class: { name: string };
  _count: { attendances: number };
};

export type ChonLop = { id: string; name: string };

export type NgayNghi = {
  id: string;
  name: string;
  date: Date;
  endDate: Date | null;
  center: { name: string } | null;
};

export type ThamSoBuoiHoc = {
  actor: Actor;
  /** Id người đang đăng nhập — dùng khi không có `classes:view-all`. */
  userId: string;
  phamVi: PhamVi;
  /** Id lớp đang lọc; rỗng/không có = mọi lớp. */
  classId: string | undefined;
  /**
   * Kết quả `checkPermission("classes:view-all")` — quyết định ở trang vì cần
   * session. Xem khối "MỘT CHỖ CỐ Ý KHÁC BẢN ADMIN" đầu tệp.
   */
  xemDuocMoiLop: boolean;
};

export type KetQuaBuoiHoc = {
  buoi: DongBuoi[];
  lop: ChonLop[];
  ngayNghi: NgayNghi[];
};

export async function docDanhSachBuoiHoc(t: ThamSoBuoiHoc): Promise<KetQuaBuoiHoc> {
  const sdb = scopedDb(t.actor);
  // MỘT mốc thời gian cho cả ba truy vấn. Gọi `new Date()` ba lần là ba mốc lệch
  // nhau vài mili giây — vô hại ở đây nhưng là thói quen đẻ ra lỗi biên ở chỗ khác.
  const bayGio = new Date();

  // Cách ly cơ sở (FL3-02): `ClassSession` ∈ SCOPED_MODELS → `scopedDb` tự tiêm
  // `centerId IN <tầm nhìn>`. KHÔNG scope tay qua `class.centerId`.
  // Ràng buộc dưới đây là NARROWING THEO PHÂN CÔNG (giáo viên chỉ thấy buổi của
  // lớp mình dạy/trợ giảng), KHÔNG phải cách ly cơ sở — hai việc khác nhau.
  const locLop: Prisma.ClassWhereInput = { deletedAt: null };
  if (!t.xemDuocMoiLop) {
    locLop.OR = [{ teacherId: t.userId }, { assistantId: t.userId }];
  }

  const where: Prisma.ClassSessionWhereInput = {
    ...(t.phamVi === "upcoming" ? { date: { gte: bayGio } } : {}),
    ...(t.phamVi === "past" ? { date: { lt: bayGio } } : {}),
    ...(t.classId ? { classId: t.classId } : {}),
    class: locLop,
  };

  const [buoi, lop, ngayNghi] = await Promise.all([
    sdb.classSession.findMany({
      where,
      orderBy: { date: t.phamVi === "past" ? "desc" : "asc" },
      take: TRAN_BUOI,
      select: {
        id: true,
        date: true,
        topic: true,
        classId: true,
        class: { select: { name: true } },
        _count: { select: { attendances: true } },
      },
    }),
    sdb.class.findMany({
      where: {
        deletedAt: null,
        ...(!t.xemDuocMoiLop
          ? { OR: [{ teacherId: t.userId }, { assistantId: t.userId }] }
          : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: TRAN_BUOI,
    }),
    // P1-f — ngày nghỉ sắp tới (90 ngày) để người xem hiểu vì sao vài buổi bị dời.
    sdb.holiday.findMany({
      where: { date: { gte: bayGio, lte: new Date(bayGio.getTime() + 90 * 86400000) } },
      orderBy: { date: "asc" },
      take: 20,
      select: {
        id: true,
        name: true,
        date: true,
        endDate: true,
        center: { select: { name: true } },
      },
    }),
  ]);

  return { buoi, lop, ngayNghi };
}
