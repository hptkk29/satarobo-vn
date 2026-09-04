/**
 * Site Sale — TRUY VẤN thư viện ảnh lớp cho màn `/sale/anh-lop-hoc`.
 *
 * ══ ĐÂY LÀ BẢN ĐÔI CỦA TRUY VẤN TRONG `app/(admin)/admin/media/page.tsx` ════
 *
 * ── Vì sao nó tồn tại ───────────────────────────────────────────────────────
 * Chủ dự án chốt 04/09/2026: các màn site Sale TÁCH BẢN RIÊNG, không mount lại
 * component của khu quản trị nữa — để thiết kế lại site Sale mà KHÔNG đụng một
 * pixel nào của khu quản trị. Rủi ro trôi lệch đã được nêu; chủ dự án vẫn chọn
 * đường này. Trang admin truy vấn DB ngay trong `page.tsx`.
 *
 * ── NỢ TRÔI LỆCH: sửa bên nào cũng phải sửa bên kia ─────────────────────────
 *   1. `ClassSessionMedia` ∉ SCOPED_MODELS ⇒ cách ly cơ sở đi VÒNG qua
 *      `classIds` đã được `scopedDb` cắt ở truy vấn lớp. Bỏ vế này là mở toang
 *      ảnh của cơ sở khác. KHÔNG "tối ưu" bằng cách bỏ bước lấy `classIds`.
 *   2. Hai truy vấn RIÊNG cho DRAFT và không-DRAFT, mỗi bên `take: 100` (review
 *      02/08): một lô 40 ảnh DRAFT từng chiếm trọn cửa sổ 100 dòng và đẩy ảnh
 *      PENDING cũ ra khỏi hàng chờ duyệt mà không ai hay. Gộp lại thành một
 *      truy vấn `take: 200` là hồi sinh đúng lỗi đó.
 *   3. Trần 200 lớp, `orderBy createdAt desc`.
 *
 * ── KHÔNG phải nợ vì đã dùng chung ở `lib/` ─────────────────────────────────
 * `scopedDb` · `resolveMediaUrl` (`lib/storage/signed-url.ts`).
 *
 * ⚠️ ĐƯỜNG CẤP LIÊN KẾT ẢNH: đi ĐÚNG `resolveMediaUrl` mà bản admin dùng, không
 *    có đường tắt nào. Hàm đó ký presigned GET (TTL 600s) KHI cờ
 *    `MEDIA_SIGNED_URL` bật, và trả `fileUrl` TRẦN khi cờ tắt.
 *
 *    🔴 CỜ ĐÓ MẶC ĐỊNH TẮT VÀ ĐANG TẮT TRÊN PROD (`lib/flags.ts:81`;
 *       `Document/3-hien-trang/07-thong-ke-tinh-nang-dang-phat-trien.md:41` xác
 *       nhận lại 18/08/2026) ⇒ **hôm nay màn này — y như bản admin và y như
 *       portal phụ huynh — trả ra URL R2 CÔNG KHAI, ai có link là tải được, vĩnh
 *       viễn.** Đây là hiện trạng ĐÃ BIẾT của kho tệp dùng chung
 *       (`docs/taicautruc/01-intended-vs-implemented.md` §Câu 3), KHÔNG phải thứ
 *       màn Sale được phép tự vá: bật ký link ở riêng một màn không làm ảnh bớt
 *       công khai (link cũ vẫn sống), còn đổi `lib/storage/**` là đổi hành vi
 *       của cả portal lẫn khu quản trị. Vá thật = bật cờ + chuyển bucket sang
 *       private, và đó là quyết định vận hành, phải hỏi chủ dự án.
 */
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { resolveMediaUrl } from "@/lib/storage/signed-url";

/** Trần số ảnh đọc về MỖI NHÓM (DRAFT và không-DRAFT) — giữ nguyên 100 của bản admin. */
export const TRAN_ANH_MOI_NHOM = 100;

/** Trần số lớp đổ vào ô chọn — giữ nguyên 200 của bản admin. */
export const TRAN_LOP = 200;

export type ChonLopAnh = { id: string; label: string };

export type AnhLop = {
  id: string;
  /** Đã qua `resolveMediaUrl` — xem cảnh báo đầu tệp. */
  fileUrl: string;
  caption: string | null;
  status: string;
  className: string;
  uploadedByName: string | null;
  /** Ai đưa ảnh này lên — để hiện nút xoá ảnh CỦA MÌNH trong kho (server chốt lại). */
  uploadedById: string | null;
  tagNames: string[];
  takenAt: string | null;
  hasSession: boolean;
  createdAt: string;
};

export type KetQuaAnhLop = {
  lop: ChonLopAnh[];
  anh: AnhLop[];
};

export async function docThuVienAnhLop(actor: Actor): Promise<KetQuaAnhLop> {
  const sdb = scopedDb(actor);

  // Cách ly cơ sở: chỉ thấy lớp + ảnh thuộc cơ sở trong tầm nhìn (SUPER_ADMIN/HO bypass).
  const lop = await sdb.class.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, name: true, classCode: true },
    orderBy: { createdAt: "desc" },
    take: TRAN_LOP,
  });
  const lopIds = lop.map((c) => c.id);

  // ClassSessionMedia ∉ SCOPED_MODELS → cách ly qua `lopIds` đã scope ở trên.
  // DRAFT (kho GV) fetch RIÊNG — xem nợ trôi lệch #2 ở đầu tệp.
  const [dongChinh, dongKho] = lopIds.length
    ? await Promise.all([
        sdb.classSessionMedia.findMany({
          where: { classId: { in: lopIds }, status: { not: "DRAFT" } },
          orderBy: { createdAt: "desc" },
          take: TRAN_ANH_MOI_NHOM,
          include: { tags: { select: { studentId: true } } },
        }),
        sdb.classSessionMedia.findMany({
          where: { classId: { in: lopIds }, status: "DRAFT" },
          orderBy: { createdAt: "desc" },
          take: TRAN_ANH_MOI_NHOM,
          include: { tags: { select: { studentId: true } } },
        }),
      ])
    : [[], []];
  const dong = [...dongChinh, ...dongKho];

  // Tên lớp + tên học viên được gắn thẻ.
  const bangLop = new Map(lop.map((c) => [c.id, c]));
  const hocVienIds = [...new Set(dong.flatMap((r) => r.tags.map((t) => t.studentId)))];
  const hocVien = hocVienIds.length
    ? await sdb.student.findMany({
        where: { id: { in: hocVienIds } },
        select: { id: true, name: true },
      })
    : [];
  const bangHocVien = new Map(hocVien.map((s) => [s.id, s.name]));

  const duong = await Promise.all(dong.map((m) => resolveMediaUrl(m.fileUrl)));

  return {
    lop: lop.map((c) => ({
      id: c.id,
      label: c.classCode ? `${c.classCode} · ${c.name}` : c.name,
    })),
    anh: dong.map((m, i) => ({
      id: m.id,
      fileUrl: duong[i] ?? m.fileUrl,
      caption: m.caption,
      status: m.status,
      className: bangLop.get(m.classId)?.name ?? "(lớp đã xoá)",
      uploadedByName: m.uploadedByName,
      uploadedById: m.uploadedById,
      tagNames: m.tags.map((t) => bangHocVien.get(t.studentId) ?? "?"),
      takenAt: m.takenAt?.toISOString() ?? null,
      hasSession: m.classSessionId != null,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}
