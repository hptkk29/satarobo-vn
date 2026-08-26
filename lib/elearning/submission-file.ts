import { z } from "zod";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client } from "@/lib/storage/r2-client";
import { getElearningBucket } from "@/lib/storage/elearning-storage";
import {
  NOP_MAX_BYTES,
  NOP_MAX_TEP,
  mimeDuocNhan,
  tienToKhoaBaiNop,
  khoaThuocLuotNop,
  vanTayKhop,
} from "@/lib/elearning/submission-file-rules";

/**
 * EL-15c — TỆP ĐÍNH KÈM của lượt nộp: ký URL và xác minh.
 *
 * ⚠️ ĐƯỜNG TẢI RIÊNG, không dùng lại `app/api/elearning/media/upload`. Route đó
 * đòi `elearning:content:author`, mà hai vai PHẢI nộp bài (`TEACHER`,
 * `CENTER_SALES_CSM`) chỉ có `portal:access` + `lesson:learn` + `progress:view-own`.
 * Hai lối vá đều bị cấm: cấp `content:author` cho giáo viên là mở quyền biên soạn
 * khoá cho toàn bộ giáo viên; đẻ khoá thứ 18 là đỏ CI.
 *
 * ⚠️ Dùng PUT MỘT LẦN, không multipart. Trần 300MB nằm gọn trong giới hạn của một
 * lượt PUT, và multipart kéo theo cả một vòng đời (tạo/ký từng phần/hoàn tất/dọn
 * dở) — mỗi bước là một chỗ hỏng nữa, cho một thứ người học chỉ làm vài lần.
 */

export const kyTepSchema = z
  .object({
    submissionId: z.string().min(1),
    tenTep: z.string().trim().min(1).max(200),
    mime: z.string().trim().min(1).max(100),
    size: z.number().int().min(1),
  })
  .strict();

export type KyTepInput = z.infer<typeof kyTepSchema>;

export type LoiKyTep =
  | { ma: "MIME_KHONG_NHAN"; noi: string }
  | { ma: "QUA_LON"; noi: string }
  | { ma: "QUA_NHIEU_TEP"; noi: string };

/**
 * Kiểm một tệp TRƯỚC khi ký URL — thuần, không chạm mạng.
 *
 * ⚠️ Kiểm ở đây là kiểm SỚM cho người dùng, KHÔNG phải cổng an toàn: `size` và
 * `mime` do phía tải lên tự khai. Cổng thật là bước XÁC MINH sau khi tệp đã nằm
 * trên kho (`xacMinhTep`), nơi đọc kích thước thật và vân tay thật.
 */
export function kiemTepTruocKhiKy(input: {
  mime: string;
  size: number;
  soTepHienCo: number;
}): LoiKyTep | null {
  if (!mimeDuocNhan(input.mime)) {
    return {
      ma: "MIME_KHONG_NHAN",
      noi: "Chỉ nhận video MP4, ghi âm MP3/M4A, hoặc PDF",
    };
  }
  if (input.size > NOP_MAX_BYTES) {
    return {
      ma: "QUA_LON",
      noi: `Tệp tối đa ${Math.round(NOP_MAX_BYTES / 1024 / 1024)}MB`,
    };
  }
  if (input.soTepHienCo >= NOP_MAX_TEP) {
    return {
      ma: "QUA_NHIEU_TEP",
      noi: `Mỗi lượt nộp tối đa ${NOP_MAX_TEP} tệp`,
    };
  }
  return null;
}

/**
 * Khoá trên kho cho một tệp.
 *
 * ⚠️ Tên tệp người dùng KHÔNG đi vào khoá. Nó có thể chứa dấu gạch chéo, ký tự
 * điều khiển, hay tên của một người (`ghi-am-chi-Lan-0905xxx.mp3`) — và khoá thì
 * hiện trong URL đã ký. Giữ tên gốc ở cột dữ liệu, không giữ trong đường dẫn.
 */
export function khoaChoTep(submissionId: string, stt: number, mime: string): string {
  const duoi =
    mime === "application/pdf" ? "pdf" : mime === "audio/mpeg" ? "mp3" : "mp4";
  return `${tienToKhoaBaiNop(submissionId)}${stt}.${duoi}`;
}

/** URL đã ký để TẢI LÊN. Chỉ ký `Content-Type` — xem chú thích ở `chat-storage`. */
export async function kyUrlTaiLen(
  khoa: string,
  mime: string,
  ttlSeconds = 900,
): Promise<string> {
  return getSignedUrl(
    getR2Client(),
    new PutObjectCommand({
      Bucket: getElearningBucket(),
      Key: khoa,
      ContentType: mime,
    }),
    { expiresIn: ttlSeconds },
  );
}

/**
 * URL đã ký để TẢI VỀ.
 *
 * ⚠️ Chỗ gọi PHẢI tự kiểm quyền trước. Hàm này không biết ai đang hỏi — nó chỉ ký.
 * Người chấm cần đọc được tệp của người khác (đó là việc của họ), nên không thể
 * dùng lại vé của EL-10 vốn buộc `ve.userId === session.user.id`.
 */
export async function kyUrlTaiVe(khoa: string, ttlSeconds = 600): Promise<string> {
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({ Bucket: getElearningBucket(), Key: khoa }),
    { expiresIn: ttlSeconds },
  );
}

export type KetQuaXacMinh =
  | { ok: true; size: number }
  | { ok: false; ma: "KHONG_THAY" | "QUA_LON" | "SAI_LOAI"; noi: string };

/**
 * XÁC MINH tệp SAU khi đã nằm trên kho — đây mới là cổng thật.
 *
 * ⚠️ Đọc kích thước THẬT và VÂN TAY THẬT. `size`/`mime` ở bước ký là lời khai của
 * phía tải lên; tin nó là để một tệp 3GB hay một tệp thực thi đặt tên `.mp4` nằm
 * trong kho và được phát ra cho người chấm tải về.
 *
 * ⚠️ Đọc ĐÚNG 16 byte đầu bằng `Range`, không tải cả tệp. Kéo nguyên một video
 * 300MB về máy chủ chỉ để xem 4 byte là đốt băng thông và giữ một khe socket lâu
 * hơn cần thiết.
 */
export async function xacMinhTep(input: {
  khoa: string;
  submissionId: string;
  mime: string;
}): Promise<KetQuaXacMinh> {
  if (!khoaThuocLuotNop(input.khoa, input.submissionId)) {
    return { ok: false, ma: "KHONG_THAY", noi: "Tệp không thuộc lượt nộp này" };
  }

  let than: import("@aws-sdk/client-s3").GetObjectCommandOutput;
  try {
    than = await getR2Client().send(
      new GetObjectCommand({
        Bucket: getElearningBucket(),
        Key: input.khoa,
        Range: "bytes=0-15",
      }),
    );
  } catch {
    return { ok: false, ma: "KHONG_THAY", noi: "Chưa thấy tệp trên kho" };
  }

  // `ContentRange` dạng `bytes 0-15/12345` — phần sau dấu `/` là kích thước THẬT.
  const dai = Number(String(than.ContentRange ?? "").split("/")[1] ?? NaN);
  if (Number.isFinite(dai) && dai > NOP_MAX_BYTES) {
    return {
      ok: false,
      ma: "QUA_LON",
      noi: `Tệp tối đa ${Math.round(NOP_MAX_BYTES / 1024 / 1024)}MB`,
    };
  }

  const buf = await than.Body?.transformToByteArray();
  if (!buf || !vanTayKhop(input.mime, buf)) {
    return {
      ok: false,
      ma: "SAI_LOAI",
      noi: "Nội dung tệp không khớp loại đã khai — tải lại đúng tệp",
    };
  }

  return { ok: true, size: Number.isFinite(dai) ? dai : 0 };
}
