// lib/events/handlers/scorm-ingest.ts — R7-11: pipeline giải nén gói SCORM.
//
// Consumer cho `scorm.uploaded` { packageId }. Vercel serverless không giữ tiến
// trình dài → job chạy qua DomainEvent outbox (dispatcher cron) và RESUME được:
//   1. Tải zip gốc từ R2 (uploadKey).
//   2. JSZip.loadAsync → validateZipEntries (chặn traversal/ext lạ/quá số tệp).
//      Fail = set FAILED + error, KHÔNG ghi object rác lên R2 (validate trước upload).
//   3. parseManifest(imsmanifest.xml) → scormVersion + launchUrl.
//   4. normalizeRootPrefix → strip thư mục gốc đơn; upload từng entry lên
//      `${storagePrefix}<relpath>` (PutObject).
//   5. entryCursor flush định kỳ → replay/resume bỏ qua entry đã xong (idempotent:
//      ghi đè cùng key vô hại). Xong = status TESTING (Đào tạo xem thử).
//
// Lock/heartbeat: status PROCESSING. Lỗi hạ tầng (tải zip/PutObject) → THROW để
// dispatcher retry (resume từ cursor). Lỗi nội dung (zip hỏng/validate/manifest)
// → fail() permanent (event DONE, không retry vô ích).
import JSZip from "jszip";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { getR2Client, getR2Bucket } from "@/lib/storage/r2-client";
import { on, type DomainEventLite } from "@/lib/events/registry";
import {
  validateZipEntries,
  normalizeRootPrefix,
  resolveLaunchPath,
  type ZipEntry,
} from "@/lib/scorm/ingest";
import { parseManifest } from "@/lib/scorm/manifest";

const str = (v: unknown): string => (v == null ? "" : String(v));
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Flush con trỏ entry mỗi N tệp (giảm số lần ghi DB, vẫn đủ để resume). */
const CURSOR_FLUSH = 25;
/** Trần dung lượng khi giải nén (đồng bộ DEFAULT_MAX_BYTES của lib/scorm/ingest). */
const MAX_BYTES = 200 * 1024 * 1024;

/** Content-Type theo phần mở rộng (whitelist khớp ALLOWED_EXTENSIONS). */
const MIME: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  js: "text/javascript",
  css: "text/css",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "audio/ogg",
  xml: "application/xml",
  json: "application/json",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  eot: "application/vnd.ms-fontobject",
};

function contentTypeFor(path: string): string {
  const base = path.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
  return MIME[ext] ?? "application/octet-stream";
}

/** Đánh dấu gói FAILED (lỗi nội dung — không retry). */
async function fail(packageId: string, message: string): Promise<void> {
  await db.scormPackage.update({
    where: { id: packageId },
    data: { status: "FAILED", error: message.slice(0, 500) },
  });
}

export async function onScormUploaded(event: DomainEventLite): Promise<void> {
  const packageId = str(event.payload.packageId);
  if (!packageId) return;

  const pkg = await db.scormPackage.findUnique({
    where: { id: packageId },
    select: {
      id: true,
      status: true,
      uploadKey: true,
      storagePrefix: true,
      entryCursor: true,
      sizeBytes: true,
    },
  });
  if (!pkg) return;

  // Idempotent: đã giải nén/phát hành/lưu trữ → không xử lý lại.
  if (
    pkg.status === "TESTING" ||
    pkg.status === "PUBLISHED" ||
    pkg.status === "ARCHIVED"
  ) {
    return;
  }
  if (!pkg.uploadKey) {
    await fail(packageId, "Thiếu uploadKey — zip chưa upload xong");
    return;
  }

  // Lock/heartbeat: UPLOADING/PROCESSING/FAILED → PROCESSING (cho phép resume).
  await db.scormPackage.update({
    where: { id: packageId },
    data: { status: "PROCESSING", error: null },
  });

  // 1. Tải zip gốc từ R2 (lỗi hạ tầng → throw để dispatcher retry).
  const obj = await getR2Client().send(
    new GetObjectCommand({ Bucket: getR2Bucket(), Key: pkg.uploadKey }),
  );
  if (!obj.Body) {
    await fail(packageId, "Không đọc được zip từ R2 (body rỗng)");
    return;
  }
  const bytes = await obj.Body.transformToByteArray();

  // 2. Mở zip + validate (lỗi nội dung → fail permanent, CHƯA ghi R2).
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (e) {
    await fail(packageId, `Zip hỏng hoặc không đọc được: ${msg(e)}`);
    return;
  }

  const fileObjs = Object.values(zip.files)
    .filter((f) => !f.dir)
    .sort((a, b) => a.name.localeCompare(b.name));
  const allPaths = Object.values(zip.files).map((f) => f.name);

  const entries: ZipEntry[] = fileObjs.map((f) => ({ path: f.name, size: 0 }));
  const validation = validateZipEntries(entries);
  if (!validation.ok) {
    await fail(packageId, validation.error ?? "Gói SCORM không hợp lệ");
    return;
  }

  // 3. Manifest (chọn imsmanifest.xml nông nhất = gần gốc nhất).
  const manifestObj = fileObjs
    .filter((f) => f.name.split("/").pop()?.toLowerCase() === "imsmanifest.xml")
    .sort((a, b) => a.name.split("/").length - b.name.split("/").length)[0];
  if (!manifestObj) {
    await fail(packageId, "Thiếu imsmanifest.xml trong gói SCORM");
    return;
  }
  const xml = await manifestObj.async("string");
  const parsed = parseManifest(xml);
  if (!parsed.version || !parsed.launchUrl) {
    await fail(packageId, parsed.error ?? "imsmanifest.xml không hợp lệ");
    return;
  }

  const rootPrefix = normalizeRootPrefix(allPaths);
  const launchPath = resolveLaunchPath(parsed.launchUrl, rootPrefix);
  const storagePrefix = pkg.storagePrefix.endsWith("/")
    ? pkg.storagePrefix
    : `${pkg.storagePrefix}/`;

  // 4+5. Upload từng entry (resume từ entryCursor; lỗi PutObject → throw retry).
  const client = getR2Client();
  const bucket = getR2Bucket();
  let totalBytes = pkg.sizeBytes ?? 0;
  let cursor = pkg.entryCursor;

  for (let i = 0; i < fileObjs.length; i++) {
    if (i < cursor) continue; // đã upload ở lần chạy trước.
    const f = fileObjs[i];
    const rel0 = f.name.replace(/\\/g, "/");
    const rel =
      rootPrefix && rel0.startsWith(rootPrefix)
        ? rel0.slice(rootPrefix.length)
        : rel0;
    if (!rel) {
      cursor = i + 1;
      continue;
    }

    const content = await f.async("uint8array");
    totalBytes += content.length;
    if (totalBytes > MAX_BYTES) {
      await fail(
        packageId,
        `Gói vượt giới hạn dung lượng khi giải nén (> ${MAX_BYTES} byte)`,
      );
      return;
    }

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `${storagePrefix}${rel}`,
        Body: content,
        ContentType: contentTypeFor(rel),
      }),
    );

    cursor = i + 1;
    if (cursor % CURSOR_FLUSH === 0) {
      await db.scormPackage.update({
        where: { id: packageId },
        data: { entryCursor: cursor, sizeBytes: totalBytes },
      });
    }
  }

  // Hoàn tất → TESTING (Đào tạo xem thử trước publish).
  await db.scormPackage.update({
    where: { id: packageId },
    data: {
      status: "TESTING",
      scormVersion: parsed.version,
      launchUrl: launchPath,
      sizeBytes: totalBytes,
      fileCount: fileObjs.length,
      entryCursor: cursor,
      error: null,
    },
  });
}

export function registerScormIngestHandlers(): void {
  on("scorm.uploaded", onScormUploaded);
}
