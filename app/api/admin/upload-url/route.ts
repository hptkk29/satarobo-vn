import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuid } from "uuid";
import { r2Client, R2_BUCKET, getPublicUrl } from "@/lib/storage/r2-client";
import {
  UPLOAD_CONFIG,
  UploadCategory,
  validateFile,
} from "@/lib/storage/upload-config";

// POST /api/admin/upload-url
// Sinh presigned URL để browser PUT trực tiếp lên R2 (không qua server).
// Server validate role + file rules TRƯỚC khi ký URL.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowedRoles = ["SUPER_ADMIN", "MANAGER", "MARKETING"];
  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.json(
      { error: "Forbidden: insufficient permissions" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { category, filename, mimeType, sizeBytes } = (body ?? {}) as {
    category?: UploadCategory;
    filename?: string;
    mimeType?: string;
    sizeBytes?: number;
  };

  if (!category || !filename || !mimeType || typeof sizeBytes !== "number") {
    return NextResponse.json(
      {
        error:
          "Missing required fields: category, filename, mimeType, sizeBytes",
      },
      { status: 400 },
    );
  }

  if (!UPLOAD_CONFIG[category]) {
    return NextResponse.json(
      {
        error: `Category không hợp lệ. Cho phép: ${Object.keys(UPLOAD_CONFIG).join(", ")}`,
      },
      { status: 400 },
    );
  }

  const validationError = validateFile(category, filename, mimeType, sizeBytes);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const config = UPLOAD_CONFIG[category];
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  const safeName = filename
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);

  const datePrefix = new Date().toISOString().slice(0, 7);
  const uniqueId = uuid().slice(0, 8);
  const key = `${config.folder}/${datePrefix}/${safeName || "file"}-${uniqueId}${ext}`;

  try {
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: mimeType,
      ContentLength: sizeBytes,
      Metadata: {
        "uploaded-by": session.user.email ?? "unknown",
        "uploaded-at": new Date().toISOString(),
        "original-filename": encodeURIComponent(filename),
      },
    });

    const uploadUrl = await getSignedUrl(r2Client, command, {
      expiresIn: 300,
    });

    return NextResponse.json({
      uploadUrl,
      publicUrl: getPublicUrl(key),
      key,
      expiresIn: 300,
    });
  } catch (err) {
    console.error("Failed to generate presigned URL:", err);
    return NextResponse.json(
      { error: "Failed to generate upload URL. Try again." },
      { status: 500 },
    );
  }
}
