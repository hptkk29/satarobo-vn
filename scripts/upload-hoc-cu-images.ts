/**
 * Upload 9 ảnh học cụ ZMROBO lên Cloudflare R2 + cập nhật DB.
 *
 * Cách dùng:
 *   1. Tải 9 file png về `_temp-uploads/hoc-cu/`:
 *        alpha-main.png, alpha-sub1.png, alpha-sub2.png,
 *        beta-main.png,  beta-sub1.png,  beta-sub2.png,
 *        storm-main.png, storm-sub1.png, storm-sub2.png
 *   2. Đảm bảo .env.local có R2_ACCOUNT_ID / R2_ACCESS_KEY_ID /
 *      R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME / R2_PUBLIC_URL.
 *   3. `pnpm tsx scripts/upload-hoc-cu-images.ts`
 *
 * Script không destructive: file đã upload sẽ bị overwrite, kit chưa có file
 * sẽ được skip (giữ nguyên DB).
 */
import { PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { getR2Client, getR2Bucket, getR2PublicUrl } from "@/lib/storage/r2-client";

interface UploadDef {
  local: string;
  remote: string;
  slug: string;
  role: "main" | "gallery";
}

const UPLOADS: UploadDef[] = [
  { local: "alpha-main.png", remote: "hoc-cu/alpha/main.png", slug: "alpha", role: "main" },
  { local: "alpha-sub1.png", remote: "hoc-cu/alpha/sub1.png", slug: "alpha", role: "gallery" },
  { local: "alpha-sub2.png", remote: "hoc-cu/alpha/sub2.png", slug: "alpha", role: "gallery" },
  { local: "beta-main.png", remote: "hoc-cu/beta/main.png", slug: "beta", role: "main" },
  { local: "beta-sub1.png", remote: "hoc-cu/beta/sub1.png", slug: "beta", role: "gallery" },
  { local: "beta-sub2.png", remote: "hoc-cu/beta/sub2.png", slug: "beta", role: "gallery" },
  { local: "storm-main.png", remote: "hoc-cu/intelligence-storm/main.png", slug: "intelligence-storm", role: "main" },
  { local: "storm-sub1.png", remote: "hoc-cu/intelligence-storm/sub1.png", slug: "intelligence-storm", role: "gallery" },
  { local: "storm-sub2.png", remote: "hoc-cu/intelligence-storm/sub2.png", slug: "intelligence-storm", role: "gallery" },
];

async function main() {
  const localFolder = path.resolve(process.cwd(), "_temp-uploads/hoc-cu");
  const client = getR2Client();
  const bucket = getR2Bucket();
  const publicBase = getR2PublicUrl();

  const urlsBySlug: Record<string, { main: string; gallery: string[] }> = {};

  for (const up of UPLOADS) {
    const filePath = path.join(localFolder, up.local);
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  Skip ${up.local} — không tồn tại tại ${filePath}`);
      continue;
    }

    const body = fs.readFileSync(filePath);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: up.remote,
        Body: body,
        ContentType: "image/png",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    const publicUrl = `${publicBase}/${up.remote}`;
    console.log(`✅ Uploaded: ${publicUrl}`);

    if (!urlsBySlug[up.slug]) urlsBySlug[up.slug] = { main: "", gallery: [] };
    if (up.role === "main") urlsBySlug[up.slug].main = publicUrl;
    else urlsBySlug[up.slug].gallery.push(publicUrl);
  }

  for (const [slug, urls] of Object.entries(urlsBySlug)) {
    const data: { mainImage?: string; galleryImages?: string[] } = {};
    if (urls.main) data.mainImage = urls.main;
    if (urls.gallery.length > 0) data.galleryImages = urls.gallery;
    if (Object.keys(data).length === 0) continue;

    await db.zMRoboKit.update({ where: { slug }, data });
    console.log(`✅ DB updated cho kit: ${slug}`);
  }

  console.log("\n🎉 All done!");
}

main()
  .catch((err) => {
    console.error("❌ Failed:", err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
