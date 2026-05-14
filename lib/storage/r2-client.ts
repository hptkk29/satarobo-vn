import { S3Client } from "@aws-sdk/client-s3";

// Cloudflare R2 dùng API tương thích S3. Endpoint dạng:
//   https://<account-id>.r2.cloudflarestorage.com
// Region phải là "auto". Credentials lấy từ .env.local.
// Xem: https://developers.cloudflare.com/r2/api/s3/

if (!process.env.R2_ACCOUNT_ID) {
  throw new Error("R2_ACCOUNT_ID is required in .env.local");
}
if (!process.env.R2_ACCESS_KEY_ID) {
  throw new Error("R2_ACCESS_KEY_ID is required in .env.local");
}
if (!process.env.R2_SECRET_ACCESS_KEY) {
  throw new Error("R2_SECRET_ACCESS_KEY is required in .env.local");
}
if (!process.env.R2_BUCKET_NAME) {
  throw new Error("R2_BUCKET_NAME is required in .env.local");
}
if (!process.env.R2_PUBLIC_URL) {
  throw new Error("R2_PUBLIC_URL is required in .env.local");
}

export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export const R2_BUCKET = process.env.R2_BUCKET_NAME;
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL.replace(/\/$/, "");

export function getPublicUrl(key: string): string {
  const cleanKey = key.startsWith("/") ? key.slice(1) : key;
  return `${R2_PUBLIC_URL}/${cleanKey}`;
}
