import "server-only";
/**
 * Site Sale — truy vấn danh sách "Đăng ký học".
 *
 * ── ĐÂY LÀ BẢN ĐÔI CỦA TỆP NÀO, VÀ VÌ SAO ───────────────────────────────────
 * Bản gốc: khối truy vấn nằm THẲNG trong `app/(admin)/admin/enrollments/page.tsx`
 * (dòng `const [enrollments, classes, centers] = await Promise.all([...])`).
 * Không có hàm dùng chung nào ở `lib/` để gọi lại — đã soi cả `lib/enrollments/`
 * (chỉ có state-machine `canTransition`) lẫn `lib/enrollment-status.ts` (chỉ có
 * hằng số) — nên đợt tách 04/09/2026 buộc phải CHÉP truy vấn.
 *
 * ⚠️ NỢ TRÔI LỆCH CÓ GHI SỔ. Đổi bộ lọc / đổi cột chọn / đổi thứ tự sắp xếp ở
 *    trang admin mà quên tệp này ⇒ hai màn cùng tên cho hai kết quả khác nhau,
 *    và không có gì báo. Chủ dự án đã được nêu rủi ro này và vẫn chọn tách bản.
 *    Chỗ ĐÚNG để trả nợ là nâng chính hàm này thành hàm dùng chung rồi cho trang
 *    admin gọi vào — nhưng việc đó sửa `app/(admin)/**`, ngoài phạm vi đợt này.
 *
 * ── KHÁC BẢN ADMIN Ở ĐÂU (có chủ đích, KHÔNG đổi nội dung màn) ───────────────
 * 1. Che SĐT làm ở ĐÂY, trên máy chủ, chứ không ở lúc vẽ. Bản admin chọn
 *    `parentPhone`/`phone` thật rồi mới `maskPhone()` trong JSX ⇒ số thật vẫn đi
 *    xuống trình duyệt trong payload RSC. Cùng nguyên tắc đã chốt ở
 *    `lib/catalog/sale-catalog.ts`: "không vẽ ra trên giao diện" là chưa đủ.
 * 2. `saleId` không rời máy chủ — quy về đúng một cờ `nhanRiengDuoc`.
 * Cả hai đều KHÔNG đổi thứ người dùng nhìn thấy.
 *
 * Cách ly cơ sở: `Enrollment` ∈ `SCOPED_MODELS` nên `scopedDb(actor)` tự chèn
 * `centerId IN visibleCenters`. Bộ lọc cơ sở của giao diện áp THẲNG lên
 * `Enrollment.centerId`; chọn cơ sở ngoài tầm nhìn → AND về rỗng, không lộ data.
 */
import { EnrollmentStatus, type Prisma } from "@prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { maskPhone } from "@/lib/utils";
import { phoneSearchTerm } from "@/lib/phone";
import { ENROLLMENT_ACTIVE_STATUSES } from "@/lib/enrollment-status";
import {
  LOC_DANG_HOAT_DONG,
  LOC_TAT_CA,
  TRANG_THAI_DANG_HOAT_DONG,
  type LocTrangThaiDangKy,
} from "@/lib/sale/trang-thai-dang-ky";

/** Trần số dòng — giữ nguyên `take: 100` của bản admin. */
const TRAN_DONG = 100;

/** Một dòng của bảng, đã sạch PII và không mang khoá nội bộ nào. */
export type DongDangKyHoc = {
  id: string;
  trangThai: EnrollmentStatus;
  ngayDangKy: string | null;
  hocVien: {
    ten: string;
    anh: string | null;
    /** Đã che sẵn nếu người xem không đủ quyền. `null` = không có số. */
    sdtPhuHuynh: string | null;
    /** `User.id` của phụ huynh — chỉ có khi nút "Nhắn riêng" được phép hiện. */
    phuHuynhUserId: string | null;
  };
  lop: { ten: string; ma: string | null; coSo: string | null };
  /** Nút "Nhắn riêng" có được hiện không (điều kiện phải TRÙNG KHÍT server). */
  nhanRiengDuoc: boolean;
};

export type KetQuaDangKyHoc = {
  dong: DongDangKyHoc[];
  lop: Array<{ id: string; ten: string; ma: string | null }>;
  coSo: Array<{ id: string; ten: string }>;
};

export async function layDanhSachDangKyHoc({
  actor,
  userId,
  q,
  locTrangThai,
  locLop,
  locCoSo,
  hienSdt,
}: {
  actor: Actor;
  /** `session.user.id` — để biết ghi danh nào do CHÍNH người đang xem phụ trách. */
  userId: string;
  q?: string;
  locTrangThai: LocTrangThaiDangKy;
  locLop?: string;
  locCoSo?: string;
  /**
   * Người xem có được thấy SĐT phụ huynh THẬT không.
   * Dùng cho CẢ hiển thị lẫn phạm vi tìm kiếm — nợ #11 (search-oracle): cho tìm
   * theo số mà không cho xem số là vẫn dò ra được số.
   */
  hienSdt: boolean;
}): Promise<KetQuaDangKyHoc> {
  const sdb = scopedDb(actor);

  const where: Prisma.EnrollmentWhereInput = {};
  if (locTrangThai === LOC_DANG_HOAT_DONG) {
    where.status = { in: TRANG_THAI_DANG_HOAT_DONG };
  } else if (locTrangThai !== LOC_TAT_CA) {
    where.status = locTrangThai;
  }
  if (locLop) where.classId = locLop;
  if (locCoSo) where.centerId = locCoSo;

  if (q) {
    // SĐT lưu 2 dạng (0… cũ / 84… mới) — tìm theo phần lõi để không sót.
    const qSdt = phoneSearchTerm(q) ?? q;
    where.OR = [
      { student: { name: { contains: q, mode: "insensitive" } } },
      ...(hienSdt
        ? [
            { student: { parentPhone: { contains: qSdt } } },
            { student: { phone: { contains: qSdt } } },
          ]
        : []),
      { class: { name: { contains: q, mode: "insensitive" } } },
      { class: { classCode: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [ghiDanh, lop, coSo] = await Promise.all([
    sdb.enrollment.findMany({
      where,
      orderBy: [{ status: "asc" }, { enrolledAt: "desc" }],
      take: TRAN_DONG,
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        saleId: true,
        student: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            parentPhone: true,
            phone: true,
            parentUserId: true,
          },
        },
        class: {
          select: {
            id: true,
            name: true,
            classCode: true,
            center: { select: { name: true } },
          },
        },
      },
    }),
    sdb.class.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, classCode: true },
      take: 200,
    }),
    sdb.center.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return {
    dong: ghiDanh.map((e) => {
      const soThat = e.student.parentPhone ?? e.student.phone;
      // F5 — nút "Nhắn riêng" CHỈ hiện đúng khi server sẽ cho qua: người xem là
      // sale được gán CỦA CHÍNH ghi danh này, phụ huynh đã có tài khoản, và ghi
      // danh còn hiệu lực. Điều kiện phải TRÙNG KHÍT
      // `findSaleAssignedEnrollmentIds` (lib/chat/dm.ts) — hiện nút rộng hơn
      // server là đẩy người dùng vào PERMISSION_DENIED.
      const nhanRiengDuoc =
        e.saleId === userId &&
        Boolean(e.student.parentUserId) &&
        (ENROLLMENT_ACTIVE_STATUSES as readonly string[]).includes(e.status);
      return {
        id: e.id,
        trangThai: e.status,
        ngayDangKy: e.enrolledAt ? e.enrolledAt.toISOString() : null,
        hocVien: {
          ten: e.student.name,
          anh: e.student.avatarUrl,
          sdtPhuHuynh: soThat ? (hienSdt ? soThat : maskPhone(soThat)) : null,
          phuHuynhUserId: nhanRiengDuoc ? e.student.parentUserId : null,
        },
        lop: {
          ten: e.class.name,
          ma: e.class.classCode,
          coSo: e.class.center?.name ?? null,
        },
        nhanRiengDuoc,
      };
    }),
    lop: lop.map((c) => ({ id: c.id, ten: c.name, ma: c.classCode })),
    coSo: coSo.map((c) => ({ id: c.id, ten: c.name })),
  };
}
