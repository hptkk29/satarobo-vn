// scripts/probe-r2-access.ts — kiểm CHỈ-ĐỌC xem credential R2 hiện tại có thật sự
// chạm được các bucket mà ứng dụng sẽ dùng hay không.
//
//   pnpm exec tsx scripts/probe-r2-access.ts
//   pnpm exec tsx scripts/probe-r2-access.ts satarobo-class-media   # thêm bucket cần đo
//
// ⚠️ VÌ SAO CÓ FILE NÀY — sự cố đo được ngày 26/08/2026:
// Token R2 trong `.env.local` là token **giới hạn theo bucket**, không phải account-level.
// Nó đọc/ghi được `satarobo-test` và `satarobo-chat`, nhưng trả `AccessDenied` với
// `satarobo-uploads` lẫn `satarobo-class-media`. Hệ quả nếu không đo trước:
//   1. `apply-r2-cors.ts` báo "Access Denied" ⇒ dễ kết luận nhầm là "token thiếu quyền
//      Admin cho CORS", rồi đi dán CORS bằng tay trong dashboard cho xong.
//   2. Dán tay xong, CORS đúng, nhưng **ứng dụng vẫn không ghi nổi file** vì cùng token đó
//      cũng bị chặn ở bước PUT — hỏng ở tầng khác, triệu chứng lại giống hệt.
// R2 trả `AccessDenied` cho cả ca "bucket không tồn tại" lẫn ca "token không có bucket này"
// nên KHÔNG phân biệt được bằng mắt — phải đo bằng cách đối chiếu với một bucket đã biết là chạy.
//
// Chỉ gọi ListObjectsV2 (MaxKeys=1) và ListBuckets — KHÔNG ghi, KHÔNG xoá gì.
import { config } from "dotenv";
import { S3Client, ListObjectsV2Command, ListBucketsCommand } from "@aws-sdk/client-s3";

config({ path: ".env.local" });

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

const missing = [
  ["R2_ACCOUNT_ID", accountId],
  ["R2_ACCESS_KEY_ID", accessKeyId],
  ["R2_SECRET_ACCESS_KEY", secretAccessKey],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error(`❌ Thiếu env trong .env.local: ${missing.join(", ")}`);
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
});

/** Bucket ứng dụng đang/sẽ dùng — đọc từ env, bỏ giá trị trống, bỏ trùng. */
const fromEnv = [
  process.env.R2_BUCKET_NAME,
  process.env.R2_CHAT_BUCKET_NAME,
  process.env.R2_CLASS_MEDIA_BUCKET_NAME,
].filter((v): v is string => !!v && v.trim().length > 0);

const buckets = [...new Set([...fromEnv, ...process.argv.slice(2)])];

async function probe(bucket: string): Promise<boolean> {
  try {
    await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
    console.log(`✅ ${bucket} — chạm được`);
    return true;
  } catch (err) {
    const name = (err as Error).name;
    console.log(`❌ ${bucket} — ${name}`);
    return false;
  }
}

async function main() {
  if (!buckets.length) {
    console.error("❌ Không có bucket nào để đo (env trống và không truyền tham số).");
    process.exit(1);
  }
  console.log(`→ Tài khoản R2: ${accountId!.slice(0, 6)}… · đo ${buckets.length} bucket\n`);

  const ket: Record<string, boolean> = {};
  for (const b of buckets) ket[b] = await probe(b);

  try {
    const r = await client.send(new ListBucketsCommand({}));
    console.log(`\nℹ️  Token thấy được: ${(r.Buckets ?? []).map((b) => b.Name).join(", ")}`);
    console.log("   (ListBuckets chạy được ⇒ token cấp TÀI KHOẢN)");
  } catch {
    console.log("\nℹ️  ListBuckets bị từ chối ⇒ token GIỚI HẠN THEO BUCKET.");
    console.log("   Bucket mới nào cũng phải được thêm vào token, nếu không ứng dụng ghi hỏng.");
  }

  const hong = Object.entries(ket).filter(([, ok]) => !ok).map(([b]) => b);
  if (hong.length) {
    console.log(
      `\n🔴 ${hong.length} bucket KHÔNG chạm được: ${hong.join(", ")}\n` +
        "   R2 trả AccessDenied cho CẢ HAI ca — bucket chưa tồn tại, HOẶC token không gồm bucket đó.\n" +
        "   Cách phân biệt: mở Cloudflare → R2 → xem bucket có trong danh sách không.\n" +
        "   ⚠️ Đừng chỉ đi đặt CORS bằng tay: CORS đúng mà token không ghi được thì vẫn hỏng,\n" +
        "      chỉ khác chỗ báo lỗi. Xem docs/runbook-bucket-media-lop.md §2.",
    );
    process.exit(2);
  }
  console.log("\n✅ Mọi bucket đều chạm được.");
}

main();
