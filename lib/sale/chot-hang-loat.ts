import "server-only";
/**
 * Site Sale — dữ liệu màn "Chốt hàng loạt — lead đã đăng ký".
 *
 * ── ĐÂY LÀ BẢN ĐÔI CỦA TỆP NÀO, VÀ VÌ SAO ───────────────────────────────────
 * Bản gốc: bốn truy vấn nằm THẲNG trong
 * `app/(admin)/admin/leads/bulk-convert/page.tsx`, cộng bốn hàm đọc nhãn trong
 * ghi chú (`readDiscount` / `readDiscountReason` / `readDue2` và biểu thức
 * `ĐãĐóng=`) nằm trong `_components/bulk-convert-client.tsx`.
 *
 * Đã soi `lib/crm/bulk-convert.ts` trước khi chép: tệp đó chỉ có phần GHI
 * (`convertOneLeadBackfill`, `bulkConvertIdempotencyKey`) — không có hàm nào đọc
 * danh sách lead chờ chốt. Nên đợt tách 04/09/2026 buộc phải chép phần ĐỌC.
 *
 * ⚠️ NỢ TRÔI LỆCH CÓ GHI SỔ. Đổi điều kiện `where` (nhất là cặp
 *    `status: "DA_DANG_KY"` + `convertedAt: null`), trần `take`, danh sách
 *    trạng thái lớp, hay CÚ PHÁP NHÃN trong ghi chú ở bản admin mà quên tệp này
 *    ⇒ hai màn cùng tên mời chốt hai danh sách khác nhau, hoặc điền sai số tiền.
 *
 * ── DÙNG LẠI ĐƯỢC, KHÔNG CHÉP ───────────────────────────────────────────────
 * `bulkConvertLeadsAction` (`app/(admin)/admin/leads/bulk-convert/_actions.ts`)
 * là logic GHI thật — gọi thẳng, KHÔNG nhân bản. Lý do đầy đủ ở
 * `app/(sale)/sale/dang-ky-hoc/_components/nut-xoa.tsx`.
 * `maskLeadPiiFields` (`lib/lead/pii.ts`) · `scopedDb` (`lib/db-scope.ts`).
 *
 * ── KHÁC BẢN ADMIN Ở ĐÂU (có chủ đích, KHÔNG đổi nội dung màn) ───────────────
 * Bốn nhãn trong ghi chú (`ĐãĐóng=` `Giảm=` `LýDoGiảm=` `HạnĐợt2=`) được đọc ở
 * ĐÂY, trên máy chủ, thay vì bằng bốn biểu thức chạy trong trình duyệt như bản
 * admin. Lý do: cú pháp nhãn là HỢP ĐỒNG với `lib/lead/import-registered.ts`
 * (nơi ghi ra chúng) — hợp đồng đó thuộc về máy chủ, không thuộc về một thành
 * phần giao diện. Người dùng thấy y hệt; chỉ khác chỗ tính.
 *
 * ── PII ─────────────────────────────────────────────────────────────────────
 * Che ở ĐÂY, trước khi dựng payload cho trình duyệt. Cổng vào màn này gồm Quản
 * lý cơ sở, vai đã mất `leads:view-pii` từ Q9.
 *
 * ⚠️ NỢ ĐÃ BIẾT — `maskLeadPiiFields` chỉ chạm khoá ở TẦNG NGOÀI của phiếu
 *    (`parentName` / `phone` / `email` / `note`…). Tên con (`LeadChild.fullName`)
 *    và ghi chú của con vẫn xuống trình duyệt NGUYÊN VĂN, trong khi Q7 xếp "tên
 *    HS (LeadChild)" vào PII lead. Bản admin có đúng lỗ này. KHÔNG vá ở đợt tách
 *    (vá là đổi thứ người dùng nhìn thấy — ngoài phạm vi), và cũng KHÔNG vá được
 *    bằng cách che ghi chú con: chính ghi chú đó mang số tiền `ĐãĐóng=` mà màn
 *    này phải đọc. Đã báo lại cho chủ dự án.
 *
 * An toàn cho nghiệp vụ: `bulkConvertAction` KHÔNG nhận SĐT từ client — nó đọc
 * lại phiếu từ DB theo `leadId`. Bản che chỉ để NHÌN và để lọc, không bao giờ
 * được ghi xuống hồ sơ học viên.
 *
 * Cách ly cơ sở: `Lead` / `Class` / `Center` / `Payment` đều đi qua
 * `scopedDb(actor)`.
 */
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { maskLeadPiiFields } from "@/lib/lead/pii";

/** Trần số phiếu — giữ nguyên `take: 500` của bản admin. */
const TRAN_LEAD = 500;
/** Trần số lớp — giữ nguyên `take: 300`. */
const TRAN_LOP = 300;

/** Trạng thái lớp được mời chọn — giữ nguyên bộ ba của bản admin. */
const TRANG_THAI_LOP_MO = ["PLANNED", "RECRUITING", "ACTIVE"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// NHÃN TRONG GHI CHÚ — hợp đồng với `lib/lead/import-registered.ts`
// ─────────────────────────────────────────────────────────────────────────────
// Người nhập gõ các số này ở màn XEM THỬ IMPORT; importer ghi chúng vào `note`
// của từng con. Đọc lại ở đây để đơn tạo ra đã đúng tiền ngay từ đầu, khỏi phải
// mở từng đơn sửa sau.

const NHAN_DA_DONG = /ĐãĐóng=(\d+)/;
const NHAN_GIAM = /Giảm=(\d+)(%|đ)/;
const NHAN_LY_DO_GIAM = /LýDoGiảm=([^·]+)/;
const NHAN_HAN_DOT_2 = /HạnĐợt2=(\d{4}-\d{2}-\d{2})/;

export type GiamGia = { type: "AMOUNT" | "PERCENT"; value: number };

function docGiamGia(note: string | null): GiamGia | null {
  const m = NHAN_GIAM.exec(note ?? "");
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { type: m[2] === "%" ? "PERCENT" : "AMOUNT", value };
}

export type ConTrongPhieu = {
  id: string;
  hoTen: string;
  /** `YYYY-MM-DD`, chuỗi rỗng nếu phiếu không ghi. */
  ngaySinh: string;
  khoiLop: string | null;
  maKhoaQuanTam: string | null;
  ghiChu: string | null;
  /** Khoản giảm đã đọc sẵn từ nhãn `Giảm=` trong ghi chú. */
  giamGia: GiamGia | null;
};

export type PhieuChotHangLoat = {
  id: string;
  tenPhuHuynh: string;
  /** Đã che sẵn nếu người xem thiếu `leads:view-pii`. */
  sdt: string;
  email: string | null;
  maCoSo: string | null;
  ghiChu: string | null;
  /** `YYYY-MM-DD` — ngày tạo phiếu. */
  ngayTao: string;
  con: ConTrongPhieu[];
  /**
   * Tổng số tiền các con đã đóng theo FILE EXCEL (`ĐãĐóng=` cộng lại).
   * `0` = file không ghi số nào — nút "Điền theo file Excel" bỏ qua phiếu này,
   * KHÔNG đoán.
   */
  daDongTheoFile: number;
  /** Giải trình giảm giá — lấy của con ĐẦU TIÊN có ghi (đơn gộp dùng chung). */
  lyDoGiam: string | null;
  /** Hạn đợt 2 do màn xem thử import ghi vào ghi chú. */
  hanDot2: string | null;
  /** Đã có khoản `RECORDED` trong hệ thống → khoá ô "đã đóng" (tránh ghi đôi). */
  daCoKhoanThu: boolean;
};

export type MucLop = {
  id: string;
  label: string;
  courseId: string;
  courseName: string;
  centerId: string | null;
  listPrice: number;
};

export type MucCoSo = { id: string; name: string; code: string | null };

export type DuLieuChotHangLoat = {
  phieu: PhieuChotHangLoat[];
  lop: MucLop[];
  coSo: MucCoSo[];
};

export async function layDuLieuChotHangLoat({
  actor,
  hienPii,
}: {
  actor: Actor;
  /** Người xem có `leads:view-pii` không — quyết định che ngay tại đây. */
  hienPii: boolean;
}): Promise<DuLieuChotHangLoat> {
  const sdb = scopedDb(actor);

  // GĐ5 — "đã đăng ký mà CHƯA convert" cần HAI điều kiện. Trước đây một mình
  // `REGISTERED` đã đủ vì lượt convert đẩy lead sang `ENROLLED`; enum mới gộp
  // hai bậc đó làm một, nên nếu chỉ lọc `DA_DANG_KY` thì danh sách này sẽ chứa
  // cả lead đã chốt rồi và mời người dùng chốt lại lần nữa.
  const leads = await sdb.lead.findMany({
    where: { status: "DA_DANG_KY", convertedAt: null, deletedAt: null },
    orderBy: { createdAt: "asc" },
    take: TRAN_LEAD,
    select: {
      id: true,
      parentName: true,
      phone: true,
      email: true,
      centerId: true,
      note: true,
      createdAt: true,
      children: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          fullName: true,
          dob: true,
          gradeLevel: true,
          interestedCourseId: true,
          note: true,
        },
      },
    },
  });

  const maLead = leads.map((l) => l.id);
  const daGhiNhan = maLead.length
    ? await sdb.payment.findMany({
        where: {
          saleStatus: "RECORDED",
          deletedAt: null,
          order: { leadId: { in: maLead } },
        },
        select: { order: { select: { leadId: true } } },
      })
    : [];
  const coKhoanThu = new Set(
    daGhiNhan
      .map((p) => p.order?.leadId)
      .filter((id): id is string => Boolean(id)),
  );

  const [lop, coSo] = await Promise.all([
    sdb.class.findMany({
      where: {
        deletedAt: null,
        status: { in: [...TRANG_THAI_LOP_MO] },
      },
      orderBy: { createdAt: "desc" },
      take: TRAN_LOP,
      select: {
        id: true,
        name: true,
        classCode: true,
        courseId: true,
        centerId: true,
        course: { select: { id: true, name: true, price: true } },
      },
    }),
    sdb.center.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { code: "asc" },
    }),
  ]);

  return {
    phieu: leads.map((raw) => {
      const l = maskLeadPiiFields(raw, hienPii);

      // Lead nhiều con → CỘNG số của các con (ô "đã đóng" là của cả phiếu).
      // Con nào không đọc được số thì bỏ qua con đó, không đoán.
      let daDongTheoFile = 0;
      for (const c of l.children) {
        const m = NHAN_DA_DONG.exec(c.note ?? "");
        if (m) daDongTheoFile += Number(m[1]);
      }

      const lyDoGiam =
        l.children
          .map((c) => NHAN_LY_DO_GIAM.exec(c.note ?? "")?.[1]?.trim())
          .find((x): x is string => Boolean(x)) ?? null;

      const hanDot2 =
        l.children
          .map((c) => NHAN_HAN_DOT_2.exec(c.note ?? "")?.[1])
          .find((x): x is string => Boolean(x)) ?? null;

      return {
        id: l.id,
        tenPhuHuynh: l.parentName,
        sdt: l.phone,
        email: l.email,
        maCoSo: l.centerId,
        ghiChu: l.note,
        ngayTao: l.createdAt.toISOString().slice(0, 10),
        con: l.children.map((c) => ({
          id: c.id,
          hoTen: c.fullName,
          ngaySinh: c.dob ? c.dob.toISOString().slice(0, 10) : "",
          khoiLop: c.gradeLevel,
          maKhoaQuanTam: c.interestedCourseId,
          ghiChu: c.note,
          giamGia: docGiamGia(c.note),
        })),
        daDongTheoFile,
        lyDoGiam,
        hanDot2,
        daCoKhoanThu: coKhoanThu.has(l.id),
      };
    }),
    lop: lop.map((c) => ({
      id: c.id,
      label: c.classCode ? `${c.classCode} · ${c.name}` : c.name,
      courseId: c.courseId,
      courseName: c.course?.name ?? "",
      centerId: c.centerId,
      listPrice: c.course?.price ?? 0,
    })),
    coSo,
  };
}
