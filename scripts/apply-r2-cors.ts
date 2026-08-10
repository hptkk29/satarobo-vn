// scripts/apply-r2-cors.ts — apply CORS lên R2 bucket để browser PUT trực tiếp.
// Đọc creds từ .env.local, rules từ scripts/r2-cors.json.
//
//   pnpm exec tsx scripts/apply-r2-cors.ts              # bucket upload chung (SCORM…)
//   pnpm exec tsx scripts/apply-r2-cors.ts chat         # bucket ẢNH CHAT (R2_CHAT_BUCKET_NAME)
//   pnpm exec tsx scripts/apply-r2-cors.ts --bucket=X   # chỉ đích danh
//
// ⚠️ NGHIỆM THU 10/08/2026 — VÌ SAO CÓ CHẾ ĐỘ `chat`: bucket ảnh chat được tách riêng
// (US-11/Q2) nhưng KHÔNG ai apply CORS cho nó, nên trình duyệt bị chặn ở bước PUT:
//   Access to XMLHttpRequest at 'https://satarobo-chat.<acct>.r2.cloudflarestorage.com/…'
//   from origin 'https://test.satarobo.vn' has been blocked by CORS policy
// Server vẫn trả ticket 200 nên KHÔNG cổng test nào bắt được — cả `attachments.test.ts`
// lẫn `chat-storage.test.ts` đều giả lập tầng mạng. Triệu chứng phía người dùng: chọn
// ảnh xong dải xem trước báo "Lỗi", nút Gửi không bao giờ bật.
// Bucket MỚI nào cũng phải chạy lệnh này một lần, nếu không tính năng ảnh chết câm.
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import {
  S3Client,
  PutBucketCorsCommand,
  GetBucketCorsCommand,
  type CORSRule,
} from "@aws-sdk/client-s3";

config({ path: ".env.local" });

const arg = process.argv[2] ?? "";
const explicit = arg.startsWith("--bucket=") ? arg.slice("--bucket=".length) : null;
const bucketEnvName = arg === "chat" ? "R2_CHAT_BUCKET_NAME" : "R2_BUCKET_NAME";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = explicit ?? process.env[bucketEnvName];

const missing = [
  ["R2_ACCOUNT_ID", accountId],
  ["R2_ACCESS_KEY_ID", accessKeyId],
  ["R2_SECRET_ACCESS_KEY", secretAccessKey],
  [bucketEnvName, bucket],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error(`❌ Thiếu env: ${missing.join(", ")}`);
  process.exit(1);
}

const { CORSRules } = JSON.parse(
  readFileSync("scripts/r2-cors.json", "utf8"),
) as { CORSRules: CORSRule[] };

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
  },
});

async function main() {
  console.log(`→ Bucket: ${bucket}`);
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: { CORSRules },
    }),
  );
  console.log("✅ PutBucketCors OK");

  const verify = await client.send(
    new GetBucketCorsCommand({ Bucket: bucket }),
  );
  console.log("✅ CORS hiện tại:");
  console.log(JSON.stringify(verify.CORSRules, null, 2));
}

main().catch((e) => {
  console.error("❌ Lỗi apply CORS:", e instanceof Error ? e.message : e);
  process.exit(1);
});
