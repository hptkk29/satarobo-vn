import "server-only";
/**
 * Site Sale — truy vấn màn "Tài khoản phụ huynh".
 *
 * ── ĐÂY LÀ BẢN ĐÔI CỦA TỆP NÀO, VÀ VÌ SAO ───────────────────────────────────
 * Bản gốc: khối truy vấn nằm THẲNG trong
 * `app/(admin)/admin/students/tai-khoan/page.tsx` (từ `sdb.user.findMany` tới
 * `latestZnsByPhone`). Không có hàm dùng chung nào ở `lib/` để gọi lại — đã soi
 * `lib/otp/`, `lib/zalo/` (chỉ có đường GỬI, không có đường ĐỌC danh sách) — nên
 * đợt tách 04/09/2026 buộc phải CHÉP truy vấn.
 *
 * ⚠️ NỢ TRÔI LỆCH CÓ GHI SỔ. Đổi bộ lọc / đổi cột chọn / đổi trần `take: 500` /
 *    đổi cách suy trạng thái ZNS ở trang admin mà quên tệp này ⇒ hai màn cùng tên
 *    cho hai kết quả khác nhau, và không có gì báo. Chủ dự án đã được nêu rủi ro
 *    này và vẫn chọn tách bản. Chỗ ĐÚNG để trả nợ là nâng chính hàm này thành hàm
 *    dùng chung rồi cho trang admin gọi vào — việc đó sửa `app/(admin)/**`, ngoài
 *    phạm vi đợt này.
 *
 * ── CÁCH LY CƠ SỞ ───────────────────────────────────────────────────────────
 * `User` KHÔNG thuộc `SCOPED_MODELS` ⇒ `scopedDb` đi qua (pass-through) và KHÔNG
 * tự chèn `centerId`. Nên phải lọc TAY theo `actor.visibleCenterIds`, đúng như
 * bản admin và `_actions.ts` của nó (`parentCenterWhere`). Bỏ đoạn này là mọi vai
 * cấp cơ sở nhìn thấy tài khoản phụ huynh của MỌI cơ sở — lỗi đã xảy ra thật ở
 * bản đầu của màn admin (review 02/08: bản đó chỉ chặn đúng `CENTER_MANAGER`).
 *
 * ── KHÁC BẢN ADMIN Ở ĐÂU (có chủ đích, KHÔNG đổi thứ người dùng thấy hôm nay) ─
 * Che SĐT/email làm ở ĐÂY, trên máy chủ, chứ không ở lúc vẽ. Bản admin chọn
 * `phone`/`email` thật rồi in thẳng ra JSX ⇒ số thật đi xuống trình duyệt trong
 * payload RSC **và** trong tệp CSV mà nút "Xuất CSV" dựng từ chính payload đó.
 * Cùng nguyên tắc đã chốt ở `lib/catalog/sale-catalog.ts` và `lib/sale/dang-ky-hoc.ts`:
 * "không vẽ ra trên giao diện" là chưa đủ.
 *
 * ⚠️ QUYẾT ĐỊNH CHE BẰNG QUYỀN, KHÔNG BẰNG MÃ VAI. Cửa duy nhất là DENY cấp
 *    trường của US-03 (`checkPermissionDetail(...).fieldMask`) — xem `hienLienHe`
 *    ở chỗ gọi. KHÔNG dùng `canViewParentContact()`: hàm đó so `User.role`/`roles`
 *    với danh sách mã vai CŨ, mà trên máy thật đang chạy bảng quyền động — một vai
 *    v2 (vd `HO_SALE`) qua được cổng `students:edit` nhưng không khớp mã vai cũ sẽ
 *    bị che SĐT của chính màn mà việc DUY NHẤT của nó là gọi điện cho phụ huynh.
 *    Hỏng theo kiểu im lặng, không lỗi nào nổ.
 *    Hôm nay bảng grant rỗng ⇒ `fieldMask` rỗng ⇒ hiển thị y hệt bản admin; đây là
 *    cái LEVER cho quản trị viên, không phải một lần siết quyền lén.
 */
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { maskEmail, maskPhone } from "@/lib/utils";

/** Trần số dòng — giữ nguyên `take: 500` của bản admin. */
const TRAN_DONG = 500;

/** Lần gửi ZNS "báo cấp tài khoản" gần nhất của một số máy. */
export type TinhTrangZns = {
  trangThai: string;
  /** Tin ghi nhận ở chế độ MÔ PHỎNG (`ZALO_LIVE` chưa bật) — chưa rời hệ thống. */
  moPhong: boolean;
  loi: string | null;
  /** "YYYY-MM-DD HH:mm". */
  luc: string;
} | null;

export type DongTaiKhoanPh = {
  id: string;
  ten: string | null;
  /** Đã che sẵn nếu người xem bị DENY cấp trường. `null` = tài khoản không có số. */
  sdt: string | null;
  email: string | null;
  /** Mã cơ sở (rơi về tên nếu chưa có mã), "—" nếu tài khoản chưa gắn cơ sở. */
  coSo: string;
  trangThai: string;
  /** "YYYY-MM-DD". */
  ngayTao: string;
  hocVien: { id: string; ten: string; ma: string | null }[];
  zns: TinhTrangZns;
  /** Có gửi được ZNS cho dòng này không — tính TRÊN MÁY CHỦ vì `sdt` có thể đã che. */
  guiZnsDuoc: boolean;
};

export type KetQuaTaiKhoanPh = {
  dong: DongTaiKhoanPh[];
  demChoKichHoat: number;
  demDaKichHoat: number;
  /** `ZALO_ZNS_TEMPLATE_ACCOUNT` đã cấu hình chưa (mẫu 616899 chờ Zalo duyệt). */
  daCauHinhZns: boolean;
};

export async function layDanhSachTaiKhoanPh({
  actor,
  xemTatCa,
  hienLienHe,
}: {
  actor: Actor;
  /** `?status=all` — xem cả tài khoản đã kích hoạt, không chỉ nhóm chờ. */
  xemTatCa: boolean;
  /** Người xem có được thấy SĐT/email THẬT không (xem ghi chú đầu tệp). */
  hienLienHe: boolean;
}): Promise<KetQuaTaiKhoanPh> {
  const sdb = scopedDb(actor);

  // Xem ghi chú "CÁCH LY CƠ SỞ" đầu tệp: `User` ∉ SCOPED_MODELS nên phải lọc tay.
  const locCoSo =
    actor.isSuperAdmin || actor.isHoLevel
      ? {}
      : { centerId: { in: actor.visibleCenterIds } };

  const phuHuynh = await sdb.user.findMany({
    where: {
      role: "PARENT",
      deletedAt: null,
      ...(xemTatCa ? {} : { accountStatus: "PENDING_ACTIVATION" }),
      ...locCoSo,
    },
    orderBy: { createdAt: "desc" },
    take: TRAN_DONG,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      centerId: true,
      accountStatus: true,
      createdAt: true,
      children: {
        where: { deletedAt: null },
        select: { id: true, name: true, studentCode: true },
      },
    },
  });

  const [demChoKichHoat, demDaKichHoat] = await Promise.all([
    sdb.user.count({
      where: {
        role: "PARENT",
        deletedAt: null,
        accountStatus: "PENDING_ACTIVATION",
        ...locCoSo,
      },
    }),
    sdb.user.count({
      where: { role: "PARENT", deletedAt: null, accountStatus: "ACTIVE", ...locCoSo },
    }),
  ]);

  // Trạng thái gửi ZNS "báo cấp TK": lần gửi GẦN NHẤT per SĐT với mẫu đang cấu hình.
  const mauZns = process.env.ZALO_ZNS_TEMPLATE_ACCOUNT || null;
  const soMay = phuHuynh.map((p) => p.phone).filter((p): p is string => Boolean(p));
  const nhatKy =
    mauZns && soMay.length
      ? await sdb.zaloMessageLog.findMany({
          where: { templateKey: mauZns, toPhone: { in: soMay } },
          orderBy: { createdAt: "desc" },
          select: {
            toPhone: true,
            status: true,
            providerMessageId: true,
            errorMessage: true,
            createdAt: true,
          },
        })
      : [];

  // Đã sắp giảm dần theo `createdAt` ⇒ bản ghi ĐẦU TIÊN của mỗi số là bản mới nhất.
  const znsTheoSo = new Map<string, NonNullable<TinhTrangZns>>();
  for (const log of nhatKy) {
    if (!log.toPhone || znsTheoSo.has(log.toPhone)) continue;
    znsTheoSo.set(log.toPhone, {
      trangThai: log.status,
      moPhong: Boolean(log.providerMessageId?.startsWith("SIMULATED-")),
      loi: log.errorMessage,
      luc: log.createdAt.toISOString().slice(0, 16).replace("T", " "),
    });
  }

  const coSo = await sdb.center.findMany({ select: { id: true, name: true, code: true } });
  const tenCoSo = new Map(coSo.map((c) => [c.id, c.code || c.name]));

  return {
    demChoKichHoat,
    demDaKichHoat,
    daCauHinhZns: Boolean(mauZns),
    dong: phuHuynh.map((p) => ({
      id: p.id,
      ten: p.name,
      // Che ở đây, một lần. Trình duyệt không bao giờ nhận chuỗi thật khi bị DENY,
      // nên tệp CSV dựng từ payload này cũng sạch theo — không phải nhớ che hai chỗ.
      sdt: p.phone ? (hienLienHe ? p.phone : maskPhone(p.phone)) : null,
      email: p.email ? (hienLienHe ? p.email : maskEmail(p.email)) : null,
      coSo: (p.centerId && tenCoSo.get(p.centerId)) || "—",
      trangThai: p.accountStatus,
      ngayTao: p.createdAt.toISOString().slice(0, 10),
      hocVien: p.children.map((s) => ({ id: s.id, ten: s.name, ma: s.studentCode })),
      zns: p.phone ? (znsTheoSo.get(p.phone) ?? null) : null,
      // Tính từ số THẬT: bản admin khoá nút bằng `!p.phone`, mà sau khi che thì
      // `sdt` luôn khác null ⇒ nút sẽ mở cho cả tài khoản không có số nếu suy từ
      // giá trị đã che. Đây đúng là kiểu lỗi mà việc che PII hay kéo theo.
      guiZnsDuoc: Boolean(p.phone),
    })),
  };
}
