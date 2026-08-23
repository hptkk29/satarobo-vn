/**
 * EL-08 — DÀN BÀI KHOÁ: sắp thứ tự chương và bài.
 *
 * ⚠️ Bài toán thật ở đây KHÔNG phải "đổi chỗ hai phần tử trong mảng" mà là
 * **khoá duy nhất chặn ngang giữa chừng**. `TrnModule` có
 * `@@unique([courseId, orderIndex])`, `TrnLesson` có `@@unique([moduleId, orderIndex])`.
 *
 * Kéo bài số 3 lên vị trí 1 rồi ghi lần lượt `3→1, 1→2, 2→3` sẽ VA KHOÁ ngay ở
 * bước đầu, vì lúc đó vẫn còn một bài mang số 1. Nó không hỏng dữ liệu — nó chỉ
 * làm thao tác kéo thả thất bại với một lỗi khó hiểu, và người soạn khoá sẽ nghĩ
 * hệ thống hỏng.
 *
 * Cách vá: ghi HAI PHA. Pha 1 đẩy toàn bộ sang dải âm (không ai dùng), pha 2 ghi
 * số thật. Dải âm không bao giờ va vì mọi số dương đã rời đi.
 */

export type BuocGhiThuTu = { id: string; orderIndex: number };

/**
 * Đổi vị trí một phần tử trong danh sách đã sắp.
 *
 * Trả về danh sách id theo THỨ TỰ MỚI. Không đụng DB, không biết gì về Prisma.
 */
export function chuyenViTri(ids: string[], id: string, viTriMoi: number): string[] {
  const cu = ids.indexOf(id);
  if (cu < 0) return [...ids];
  const dich = Math.max(0, Math.min(ids.length - 1, viTriMoi));
  if (cu === dich) return [...ids];
  const ra = [...ids];
  ra.splice(cu, 1);
  ra.splice(dich, 0, id);
  return ra;
}

/**
 * Từ thứ tự mong muốn ra HAI PHA lệnh ghi.
 *
 * Pha 1 dùng số ÂM để không va khoá duy nhất; pha 2 ghi số thật từ 0.
 *
 * ⚠️ Pha 1 phải phủ MỌI phần tử, kể cả phần tử không đổi chỗ. Chỉ đẩy những cái
 * "có đổi" thì vẫn còn số dương nằm lại, và pha 2 va đúng vào chúng.
 */
export function dungHaiPhaGhiThuTu(idsTheoThuTuMoi: string[]): {
  pha1: BuocGhiThuTu[];
  pha2: BuocGhiThuTu[];
} {
  const pha1 = idsTheoThuTuMoi.map((id, i) => ({ id, orderIndex: -(i + 1) }));
  const pha2 = idsTheoThuTuMoi.map((id, i) => ({ id, orderIndex: i }));
  return { pha1, pha2 };
}

/**
 * Kiểm dàn bài trước khi cho XUẤT BẢN.
 *
 * ⚠️ Đây là hàng rào cuối trước khi một khoá đi ra với người học. Mọi thứ lọt qua
 * đây sẽ được phát cho người thật, và họ sẽ mở một chương rỗng rồi tự hỏi mình
 * làm sai gì.
 */
export type LoiDanBai =
  | "KHONG_CO_CHUONG"
  | "CHUONG_RONG"
  | "KHONG_CO_BAI_BAT_BUOC"
  | "BAI_DOC_TRONG";

export type BaiTrongDanBai = {
  id: string;
  title: string;
  kind: string;
  contentMd: string | null;
  required: boolean;
};

export type ChuongTrongDanBai = {
  id: string;
  title: string;
  lessons: BaiTrongDanBai[];
};

export function kiemDanBai(chuong: ChuongTrongDanBai[]): {
  ok: boolean;
  loi: { code: LoiDanBai; chiTiet: string }[];
} {
  const loi: { code: LoiDanBai; chiTiet: string }[] = [];

  if (chuong.length === 0) {
    loi.push({ code: "KHONG_CO_CHUONG", chiTiet: "Khoá chưa có chương nào" });
  }

  for (const c of chuong) {
    if (c.lessons.length === 0) {
      loi.push({ code: "CHUONG_RONG", chiTiet: `Chương "${c.title}" chưa có bài nào` });
    }
    for (const b of c.lessons) {
      // Bài dạng ĐỌC mà rỗng thì người học mở ra thấy trang trắng — và vì tiến độ
      // đọc tính theo số chữ, họ không bao giờ "đủ điều kiện hoàn thành".
      if (b.kind === "READ" && !b.contentMd?.trim()) {
        loi.push({ code: "BAI_DOC_TRONG", chiTiet: `Bài "${b.title}" chưa có nội dung` });
      }
    }
  }

  const coBatBuoc = chuong.some((c) => c.lessons.some((b) => b.required));
  if (chuong.length > 0 && !coBatBuoc) {
    // Không bài nào bắt buộc thì phép cuộn tiến độ ra mẫu số 0 và KHÔNG AI từng
    // "hoàn thành" khoá này — im lặng, không có gì vỡ.
    loi.push({
      code: "KHONG_CO_BAI_BAT_BUOC",
      chiTiet: "Khoá phải có ít nhất một bài bắt buộc, nếu không sẽ không ai hoàn thành được",
    });
  }

  return { ok: loi.length === 0, loi };
}
