// scripts/apply-r2-cors.ts — apply CORS lên R2 bucket để browser PUT trực tiếp
// (SCORM upload). Đọc creds từ .env.local, rules từ scripts/r2-cors.json.
// Chạy: pnpm dlx tsx scripts/apply-r2-cors.ts  (cần mạng ra ngoài → ngoài sandbox)
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import {
  S3Client,
  PutBucketCorsCommand,
  GetBucketCorsCommand,
  type CORSRule,
} from "@aws-sdk/client-s3";

config({ path: ".env.local" });

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET_NAME;

const missing = [
  ["R2_ACCOUNT_ID", accountId],
  ["R2_ACCESS_KEY_ID", accessKeyId],
  ["R2_SECRET_ACCESS_KEY", secretAccessKey],
  ["R2_BUCKET_NAME", bucket],
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
