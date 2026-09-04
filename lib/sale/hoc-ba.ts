import "server-only";
/**
 * Site Sale — dữ liệu màn "Học bạ".
 *
 * ⚠️ LỊCH SỬ, ĐỌC TRƯỚC KHI ĐỤNG CỔNG. Ban giám đốc chốt 10/07/2026 rằng Sale
 *    KHÔNG xem học bạ (`lib/auth/page-gates.ts`, ô `/hoc-ba`). Chủ dự án 27–28/08
 *    yêu cầu đưa MỤC này về site Sale, nên ĐƯỜNG có mặt còn CỔNG giữ nguyên hai
 *    action của quyết định cũ: `["curriculum:view", "students:view-own-class"]`.
 *    Sale chỉ vào được khi quản trị viên cấp một trong hai quyền đó trong giao
 *    diện phân quyền — tức một lần đảo quyết định CÓ DẤU VẾT. Nới cổng bằng mã là
 *    lặng lẽ lật quyết định của BGĐ.
 *
 * ── DÙNG LẠI, KHÔNG CHÉP ────────────────────────────────────────────────────
 * `getStudentTranscript()` (`lib/transcript/service.ts`) tổng hợp trọn học bạ và
 * được gọi lại nguyên vẹn. Tệp này chỉ làm hai việc quanh nó:
 *   1. Danh sách học viên để chọn — qua `scopedDb` (`Student` ∈ SCOPED_MODELS).
 *   2. Chốt chặn IDOR: học viên ngoài tầm nhìn cơ sở thì như KHÔNG TỒN TẠI.
 *
 * ⚠️ `getStudentTranscript` đọc bằng `db` TRẦN và chú thích của chính nó ghi rõ
 *    "Caller PHẢI tự kiểm quyền TRƯỚC khi gọi". Nên `soiTrongTam()` chạy trước là
 *    BẮT BUỘC, không phải cho chắc: bỏ nó đi thì gõ `?studentId=` của một học viên
 *    cơ sở khác là đọc được trọn học bạ.
 *
 * Bọc `try/catch` quanh phần tổng hợp — giữ đúng lựa chọn của bản admin: một lỗi
 * tổng hợp (thiếu giáo trình, dữ liệu điểm lệch) không được làm trắng cả trang.
 */
import type { Actor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { getStudentTranscript, type StudentTranscript } from "@/lib/transcript/service";

/** Trần danh sách chọn — giữ nguyên `take: 500` của bản admin. */
const TRAN_HOC_VIEN = 500;

export type MucChonHocVien = { id: string; ten: string; ma: string | null };

export type KetQuaHocBa = {
  danhSach: MucChonHocVien[];
  /** `null` khi chưa chọn ai, hoặc khi học viên nằm ngoài tầm nhìn cơ sở. */
  hocBa: StudentTranscript | null;
};

export async function layDuLieuHocBa({
  actor,
  maHocVien,
}: {
  actor: Actor;
  maHocVien?: string;
}): Promise<KetQuaHocBa> {
  const sdb = scopedDb(actor);

  const hocVien = await sdb.student.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    take: TRAN_HOC_VIEN,
    select: { id: true, name: true, studentCode: true },
  });

  let hocBa: StudentTranscript | null = null;
  if (maHocVien) {
    // Chống IDOR: `scopedDb` tự chèn `centerId IN visibleCenterIds` ⇒ học viên
    // ngoài tầm nhìn trả `null` và ta không gọi tiếp. SUPER_ADMIN/Hội sở thấy mọi HV.
    const trongTam = await sdb.student.findFirst({
      where: { id: maHocVien, deletedAt: null },
      select: { id: true },
    });
    if (trongTam) {
      try {
        hocBa = await getStudentTranscript(maHocVien);
      } catch (err) {
        console.error("[sale/hoc-ba] lỗi tổng hợp học bạ:", err);
      }
    }
  }

  return {
    danhSach: hocVien.map((s) => ({ id: s.id, ten: s.name, ma: s.studentCode })),
    hocBa,
  };
}
