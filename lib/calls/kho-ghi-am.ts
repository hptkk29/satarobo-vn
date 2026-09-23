import "server-only";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client } from "@/lib/storage/r2-client";

// =============================================================================
// OC-14 / OC-15 — KHO GHI ÂM: BUCKET R2 RIÊNG. Không phải bucket mặc định.
//
// 🔴 `R2_BUCKET_NAME` gắn custom domain `R2_PUBLIC_URL` (= https://cdn.satarobo.vn).
// Mọi object trong đó tải được VÔ DANH qua `https://cdn…/<key>` (`.env.example:91-93`).
// Ký một signed GET vào bucket đó là VÔ NGHĨA: URL ký chứa nguyên `key`, người nhận
// chỉ việc ghép sang tên miền CDN là có bản vĩnh viễn. Với ghi âm giọng phụ huynh
// (và có thể là trẻ em) thì đó là rò rỉ không thu về được.
//
// Khuôn chép từ `lib/storage/chat-storage.ts` + `lib/storage/elearning-storage.ts` —
// hai nơi đã chặn đúng lỗ hổng này một lần. THROW thay vì fallback, cố ý: một
// đường dự phòng "tạm dùng bucket công khai" sẽ chạy đúng trong lúc thử và rò trên prod.
//
// ⚠️ `requestChecksumCalculation: "WHEN_REQUIRED"` (OC-18) đã đặt sẵn trong
// `getR2Client()` — thiếu nó thì presigned PUT chết và lỗi HIỆN RA NHƯ LỖI CORS.
// =============================================================================

export class CallRecordingStorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CallRecordingStorageConfigError";
  }
}

/**
 * Bucket R2 dành riêng cho tệp ghi âm. Đọc thẳng `process.env` (KHÔNG qua
 * `getR2Bucket()`) để không tồn tại đường nào rơi về bucket công khai.
 */
export function getCallRecordingBucket(): string {
  const bucket = (process.env.R2_CALL_BUCKET_NAME ?? "").trim();
  if (!bucket) {
    throw new CallRecordingStorageConfigError(
      "R2_CALL_BUCKET_NAME chưa đặt — ghi âm cuộc gọi cần bucket R2 RIÊNG (không gắn " +
        "custom domain). Không được dùng tạm R2_BUCKET_NAME: bucket đó phát công khai " +
        "qua R2_PUBLIC_URL.",
    );
  }

  const publicBucket = (process.env.R2_BUCKET_NAME ?? "").trim();
  if (publicBucket && bucket === publicBucket) {
    throw new CallRecordingStorageConfigError(
      "R2_CALL_BUCKET_NAME đang trỏ đúng vào bucket công khai (R2_BUCKET_NAME) — ghi âm " +
        "sẽ tải được vô danh qua R2_PUBLIC_URL. Hãy tạo bucket riêng.",
    );
  }

  // Trùng bucket chat / bucket đào tạo cũng chặn. Không phải sạch sẽ hình thức:
  // ghi âm có LỊCH XOÁ BẮT BUỘC (12 tháng), ảnh lớp và video đào tạo thì không.
  // Dùng chung bucket nghĩa là một job dọn theo tiền tố của bên này xoá nhầm tệp
  // của bên kia — và bên kia là ảnh trẻ em của phụ huynh.
  const chatBucket = (process.env.R2_CHAT_BUCKET_NAME ?? "").trim();
  if (chatBucket && bucket === chatBucket) {
    throw new CallRecordingStorageConfigError(
      "R2_CALL_BUCKET_NAME trùng bucket chat — ghi âm có lịch xoá bắt buộc còn ảnh chat " +
        "thì không; dùng chung là để job dọn của bên này xoá nhầm tệp của bên kia.",
    );
  }

  const elearningBucket = (process.env.R2_ELEARNING_BUCKET_NAME ?? "").trim();
  if (elearningBucket && bucket === elearningBucket) {
    throw new CallRecordingStorageConfigError(
      "R2_CALL_BUCKET_NAME trùng bucket đào tạo — hai module có luật giữ/xoá khác nhau.",
    );
  }

  return bucket;
}

/** Env đã đủ để ký URL cho ghi âm chưa (bucket riêng + credential R2). */
export function isCallRecordingBucketConfigured(): boolean {
  try {
    getCallRecordingBucket();
  } catch {
    return false;
  }
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}

/**
 * BM-9 — chia thư mục theo ĐƠN VỊ ngay từ đầu. Kho R2 hiện chia theo LOẠI TỆP, và
 * BA đã ghi rõ: nếu tải ghi âm về R2 thì chia theo đơn vị NGAY, "sửa sau rất đắt"
 * (ngày nào cần bàn giao dữ liệu một cơ sở cho bên nhượng quyền thì mới thấy).
 *
 * Chưa biết cơ sở ⇒ thư mục `chua-gan`, KHÔNG trộn vào cơ sở nào. Đối soát xong
 * thì tệp được chuyển — nhưng thà chuyển một lần còn hơn gán nhầm.
 */
export function khoaGhiAm(input: {
  centerId: string | null;
  providerCallId: string;
  startedAt: Date;
  ext: string;
}): string {
  const thuMuc = lamSach(input.centerId ?? "") || "chua-gan";
  const y = input.startedAt.getUTCFullYear();
  const m = String(input.startedAt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(input.startedAt.getUTCDate()).padStart(2, "0");
  const ten = lamSach(input.providerCallId) || "khong-ma";
  const ext = lamSach(input.ext).toLowerCase() || "bin";
  return `calls/${thuMuc}/${y}/${m}/${d}/${ten}.${ext}`;
}

/** Chỉ giữ chữ/số/gạch — chặn `..` và mọi mưu leo thư mục từ dữ liệu nhà cung cấp. */
function lamSach(s: string): string {
  return String(s ?? "").replace(/[^A-Za-z0-9_-]/g, "");
}

/** Signed PUT — dùng khi tải tệp ghi âm từ nhà cung cấp về kho riêng. */
export async function kyUrlTaiLenGhiAm(
  khoa: string,
  contentType: string,
  ttlSeconds: number,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getCallRecordingBucket(),
    Key: khoa,
    ContentType: contentType,
  });
  return getSignedUrl(getR2Client(), command, { expiresIn: ttlSeconds });
}

/**
 * OC-17 — signed GET hạn NGẮN để nghe.
 *
 * ⚠️ CỐ Ý không dùng `resolveMediaUrl()`: hàm đó bị gate bởi cờ `MEDIA_SIGNED_URL`
 * mặc định OFF (`lib/flags.ts:80-82`) và khi OFF thì nó trả URL TRẦN. Đường ghi âm
 * KHÔNG được phụ thuộc cờ đó — ký thẳng, luôn luôn.
 */
export async function kyUrlNgheGhiAm(khoa: string, ttlSeconds: number): Promise<string> {
  const command = new GetObjectCommand({ Bucket: getCallRecordingBucket(), Key: khoa });
  return getSignedUrl(getR2Client(), command, { expiresIn: ttlSeconds });
}
