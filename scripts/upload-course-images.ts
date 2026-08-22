/**
 * Upload Course Cover Images to R2 + Update Course.thumbnail
 *
 * Usage:
 *   pnpm dotenv -e .env.local -- pnpm tsx scripts/upload-course-images.ts
 *
 * Source: _temp-uploads/khoa-hoc/luyenthirobosim.jpg
 *         _temp-uploads/khoa-hoc/laptrinhrobot.jpg
 *
 * R2 destination: cdn.satarobo.vn/khoa-hoc/{slug}/cover.{ext}
 *
 * v2: Fixed env var names to match real .env.local
 *     - R2_BUCKET_NAME (was R2_BUCKET)
 *     - R2_PUBLIC_URL  (was R2_PUBLIC_DOMAIN)
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ============ R2 CONFIG (matches real .env.local) ============
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;

// Try multiple env var names for backward compatibility
const R2_BUCKET = process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || "satarobo-assets";
const R2_PUBLIC_URL_BASE = (
  process.env.R2_PUBLIC_URL ||
  (process.env.R2_PUBLIC_DOMAIN ? `https://${process.env.R2_PUBLIC_DOMAIN}` : "https://cdn.satarobo.vn")
).replace(/\/+$/, ""); // strip trailing slashes

// ============ DEBUG ENV LOADING ============
console.log("🔧 ENV CONFIG:");
console.log(`  R2_ACCOUNT_ID:        ${R2_ACCOUNT_ID?.substring(0, 8)}...`);
console.log(`  R2_ACCESS_KEY_ID:     ${R2_ACCESS_KEY_ID?.substring(0, 8)}...`);
console.log(`  R2_SECRET_LEN:        ${R2_SECRET_ACCESS_KEY?.length || 0}`);
console.log(`  R2_BUCKET:            ${R2_BUCKET}`);
console.log(`  R2_PUBLIC_URL_BASE:   ${R2_PUBLIC_URL_BASE}`);
console.log("");

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error("❌ Missing R2 env vars in .env.local");
  console.error("   Required: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// ============ UPLOAD MAPPING ============
const UPLOAD_DIR = path.resolve(process.cwd(), "_temp-uploads/khoa-hoc");

const COURSES_TO_UPLOAD = [
  { slug: "luyenthirobosim", sourceFilename: "luyenthirobosim.jpg" },
  { slug: "laptrinhrobot", sourceFilename: "laptrinhrobot.jpg" },
];

// ============ HELPERS ============
function getContentType(ext: string): string {
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".avif": "image/avif",
  };
  return map[ext.toLowerCase()] || "application/octet-stream";
}

async function uploadFile(localPath: string, r2Key: string): Promise<string> {
  const buffer = fs.readFileSync(localPath);
  const ext = path.extname(localPath);
  const contentType = getContentType(ext);

  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: r2Key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return `${R2_PUBLIC_URL_BASE}/${r2Key}`;
}

function findSourceFile(filename: string): string | null {
  const exact = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(exact)) return exact;

  const base = path.basename(filename, path.extname(filename));
  const alternatives = [".jpg", ".jpeg", ".png", ".webp"];
  for (const ext of alternatives) {
    const alt = path.join(UPLOAD_DIR, base + ext);
    if (fs.existsSync(alt)) return alt;
  }

  return null;
}

// ============ MAIN ============
async function main() {
  console.log("🚀 Upload Course Cover Images\n");
  console.log(`📂 Source: ${UPLOAD_DIR}\n`);

  if (!fs.existsSync(UPLOAD_DIR)) {
    console.error(`❌ Source folder not found: ${UPLOAD_DIR}`);
    process.exit(1);
  }

  const results: Array<{ slug: string; url: string; status: "ok" | "fail"; error?: string }> = [];

  for (const course of COURSES_TO_UPLOAD) {
    console.log(`\n📦 Processing: ${course.slug}`);

    const sourcePath = findSourceFile(course.sourceFilename);
    if (!sourcePath) {
      console.error(`  ❌ Source file not found: ${course.sourceFilename}`);
      results.push({ slug: course.slug, url: "", status: "fail", error: "Source not found" });
      continue;
    }
    console.log(`  📄 Found: ${path.basename(sourcePath)}`);

    const ext = path.extname(sourcePath).toLowerCase();
    const r2Key = `khoa-hoc/${course.slug}/cover${ext}`;

    try {
      const publicUrl = await uploadFile(sourcePath, r2Key);
      console.log(`  ☁️  Uploaded: ${publicUrl}`);

      const updated = await prisma.course.update({
        where: { slug: course.slug },
        data: { thumbnail: publicUrl },
      });
      console.log(`  ✅ DB updated: Course[${updated.slug}].thumbnail`);

      results.push({ slug: course.slug, url: publicUrl, status: "ok" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ Failed: ${msg}`);
      // `Code` là trường riêng của lỗi AWS SDK (S3/R2), không có trên Error chuẩn.
      const code = (err as { Code?: unknown }).Code;
      if (code) console.error(`     Code: ${String(code)}`);
      results.push({ slug: course.slug, url: "", status: "fail", error: msg });
    }
  }

  // ============ SUMMARY ============
  console.log("\n\n========== SUMMARY ==========");
  const okCount = results.filter(r => r.status === "ok").length;
  const failCount = results.filter(r => r.status === "fail").length;
  console.log(`✅ Success: ${okCount}/${results.length}`);
  console.log(`❌ Failed: ${failCount}/${results.length}\n`);

  results.forEach(r => {
    if (r.status === "ok") {
      console.log(`✅ ${r.slug}`);
      console.log(`   ${r.url}`);
    } else {
      console.log(`❌ ${r.slug}: ${r.error}`);
    }
  });

  if (okCount === results.length) {
    console.log("\n🎉 All uploads successful! Verify on web:");
    console.log("   https://satarobo-vn.vercel.app/khoa-hoc/luyenthirobosim");
    console.log("   https://satarobo-vn.vercel.app/khoa-hoc/laptrinhrobot");
  }
}

main()
  .catch(err => {
    console.error("\n💥 FATAL ERROR:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
