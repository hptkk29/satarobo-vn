/**
 * EL-10 — CHUẨN NỘP TỆP cho thư viện media đào tạo nội bộ.
 *
 * ⚠️ Bảng chuẩn RIÊNG, KHÔNG sửa `lib/storage/upload-config.ts`. Trần 500MB ở đó
 * là trần CHUNG của năm module khác; siết nó vì e-learning là đổi luật của người
 * không liên quan, còn nới nó vì e-learning là mở cửa cho cả năm module kia.
 *
 * ⚠️ Chuẩn ở đây CHẶT HƠN trần chung, và có case test khẳng định điều đó — bắt
 * được ngày ai đó "hợp nhất hai bảng cho gọn".
 */

/** Trần dung lượng một video bài học. */
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024;
/** Trần thời lượng một video bài học — §11 khuyến nghị bài ngắn. */
export const VIDEO_MAX_SEC = 900;
/** Sàn thời lượng: dưới mức này gần như chắc chắn là tải nhầm tệp. */
export const VIDEO_MIN_SEC = 5;

/**
 * Chỉ MP4/H.264. Không nhận `.mov`, `.webm`, `.mkv`.
 *
 * Không phải vì chúng "kém" mà vì mỗi định dạng thêm vào là một tổ hợp
 * trình duyệt × hệ điều hành nữa phải thử — và người phát hiện ra tổ hợp hỏng
 * sẽ là người học, giữa buổi học.
 */
export const VIDEO_MIME = "video/mp4";
export const VIDEO_EXT = ".mp4";

export const CAPTION_MAX_BYTES = 2 * 1024 * 1024;
export const CAPTION_EXT = [".vtt", ".srt"] as const;

export type LoiChuanNop =
  | "SAI_DINH_DANG"
  | "SAI_DUOI_TEP"
  | "MIME_LECH_DUOI"
  | "QUA_LON"
  | "QUA_DAI"
  | "QUA_NGAN"
  | "THIEU_THOI_LUONG";

export type KetQuaChuanNop =
  | { ok: true }
  | { ok: false; code: LoiChuanNop; message: string };

const duoiCua = (ten: string): string => {
  const i = ten.lastIndexOf(".");
  return i < 0 ? "" : ten.slice(i).toLowerCase();
};

/**
 * Kiểm một lượt nộp VIDEO.
 *
 * ⚠️ `durationSec` ở đây là con số do TRÌNH DUYỆT khai. Nó dùng để chặn SỚM
 * những trường hợp rõ ràng sai, KHÔNG phải để tin. Con số thật đọc từ hộp `moov`
 * của tệp sau khi tải xong (xem `mp4-probe.ts`) — chốt của chủ dự án 24/08.
 */
export function kiemChuanNopVideo(input: {
  filename: string;
  mime: string;
  sizeBytes: number;
  durationSec?: number | null;
}): KetQuaChuanNop {
  const duoi = duoiCua(input.filename);

  if (input.mime !== VIDEO_MIME) {
    return {
      ok: false,
      code: "SAI_DINH_DANG",
      message: `Chỉ nhận video MP4 (H.264). Tệp này là ${input.mime || "không rõ định dạng"}.`,
    };
  }
  if (duoi !== VIDEO_EXT) {
    return {
      ok: false,
      code: "SAI_DUOI_TEP",
      message: `Tên tệp phải kết thúc bằng ${VIDEO_EXT}.`,
    };
  }
  // Mime khớp nhưng đuôi lệch là dấu hiệu đổi tên tệp cho lọt cổng. Hai điều
  // kiện trên đã phủ, nhưng để riêng mã lỗi này cho trường hợp ngược lại về sau.

  if (input.sizeBytes <= 0) {
    return { ok: false, code: "QUA_LON", message: "Tệp rỗng hoặc không đọc được dung lượng." };
  }
  if (input.sizeBytes > VIDEO_MAX_BYTES) {
    return {
      ok: false,
      code: "QUA_LON",
      message: `Video tối đa ${Math.round(VIDEO_MAX_BYTES / 1024 / 1024)}MB. Tệp này ${Math.round(
        input.sizeBytes / 1024 / 1024,
      )}MB — cắt ngắn hoặc nén lại.`,
    };
  }

  if (input.durationSec == null) {
    // KHÔNG bỏ qua: thời lượng là thứ quyết định bài này có nằm trong chuẩn
    // "bài ngắn" hay không, và bỏ qua nghĩa là chuẩn đó chỉ áp cho ai trình
    // duyệt đọc được thời lượng.
    return {
      ok: false,
      code: "THIEU_THOI_LUONG",
      message: "Không đọc được thời lượng video — thử tệp khác hoặc đổi trình duyệt.",
    };
  }
  if (input.durationSec > VIDEO_MAX_SEC) {
    return {
      ok: false,
      code: "QUA_DAI",
      message: `Video tối đa ${VIDEO_MAX_SEC / 60} phút. Tệp này ${Math.round(
        input.durationSec / 60,
      )} phút — tách thành nhiều bài.`,
    };
  }
  if (input.durationSec < VIDEO_MIN_SEC) {
    return {
      ok: false,
      code: "QUA_NGAN",
      message: `Video dưới ${VIDEO_MIN_SEC} giây gần như chắc chắn là tải nhầm tệp.`,
    };
  }

  return { ok: true };
}

export function kiemChuanNopPhuDe(input: {
  filename: string;
  sizeBytes: number;
}): KetQuaChuanNop {
  const duoi = duoiCua(input.filename);
  if (!(CAPTION_EXT as readonly string[]).includes(duoi)) {
    return {
      ok: false,
      code: "SAI_DUOI_TEP",
      message: `Phụ đề phải là ${CAPTION_EXT.join(" hoặc ")}.`,
    };
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > CAPTION_MAX_BYTES) {
    return {
      ok: false,
      code: "QUA_LON",
      message: `Tệp phụ đề tối đa ${CAPTION_MAX_BYTES / 1024 / 1024}MB.`,
    };
  }
  return { ok: true };
}

/**
 * Khoá lưu trên R2 cho một tệp media của bài học.
 *
 * ⚠️ Khoá KHÔNG chứa tên tệp gốc. Tên tệp người soạn đặt có thể mang tên khách
 * hàng, tên nhân sự, hay số hiệu văn bản nội bộ — và khoá thì đi vào log, vào
 * URL, vào mọi chỗ khó xoá.
 */
export function khoaMedia(input: {
  lessonId: string;
  loai: "master" | "caption" | "audio";
  uuid: string;
}): string {
  const duoi =
    input.loai === "master" ? "mp4" : input.loai === "caption" ? "vtt" : "m4a";
  return `elearning/${input.loai}/${input.lessonId}/${input.uuid}.${duoi}`;
}
