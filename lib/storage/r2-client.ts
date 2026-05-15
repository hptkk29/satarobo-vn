import { S3Client } from "@aws-sdk/client-s3";

// Cloudflare R2 — S3-compatible API.
// Endpoint: https://<account-id>.r2.cloudflarestorage.com · region "auto".
//
// LAZY INITIALIZATION: throw chỉ khi consumer gọi getR2Client / getR2Bucket / etc.
// Nếu throw ở module evaluation, Vercel build collect-page-data sẽ fail
// dù route không static-rendered. Lazy pattern cho phép build pass khi
// env vars chỉ có ở runtime.

function readEnv() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  const missing: string[] = [];
  if (!accountId) missing.push("R2_ACCOUNT_ID");
  if (!accessKeyId) missing.push("R2_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
  if (!bucket) missing.push("R2_BUCKET_NAME");
  if (!publicUrl) missing.push("R2_PUBLIC_URL");

  if (missing.length > 0) {
    throw new Error(
      `R2 env vars missing: ${missing.join(", ")}. Add to .env.local (local) hoặc Vercel Environment Variables (production/preview/development).`,
    );
  }

  return {
    accountId: accountId!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    bucket: bucket!,
    publicUrl: publicUrl!.replace(/\/$/, ""),
  };
}

let _client: S3Client | null = null;

// Lazy R2 client — chỉ khởi tạo khi gọi.
export function getR2Client(): S3Client {
  if (_client) return _client;
  const env = readEnv();
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
  });
  return _client;
}

export function getR2Bucket(): string {
  return readEnv().bucket;
}

export function getR2PublicUrl(): string {
  return readEnv().publicUrl;
}

export function getPublicUrl(key: string): string {
  const cleanKey = key.startsWith("/") ? key.slice(1) : key;
  return `${getR2PublicUrl()}/${cleanKey}`;
}
