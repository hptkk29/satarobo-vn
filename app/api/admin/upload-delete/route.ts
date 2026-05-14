import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/storage/r2-client";

// DELETE /api/admin/upload-delete
// Xoá file khỏi R2. Chỉ cho phép xoá file dưới prefix "uploads/" để tránh
// xoá nhầm asset hệ thống. Chỉ SUPER_ADMIN và MANAGER được phép.
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowedRoles = ["SUPER_ADMIN", "MANAGER"];
  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { url, key: rawKey } = (body ?? {}) as { url?: string; key?: string };

  let key: string;
  if (rawKey) {
    key = rawKey.startsWith("/") ? rawKey.slice(1) : rawKey;
  } else if (url) {
    if (!url.startsWith(R2_PUBLIC_URL)) {
      return NextResponse.json(
        { error: "URL không thuộc R2 bucket của Sata Robo" },
        { status: 400 },
      );
    }
    key = url.slice(R2_PUBLIC_URL.length + 1);
  } else {
    return NextResponse.json(
      { error: "Phải có url hoặc key" },
      { status: 400 },
    );
  }

  if (!key.startsWith("uploads/")) {
    return NextResponse.json(
      { error: "Chỉ cho phép xoá file trong /uploads/" },
      { status: 400 },
    );
  }

  try {
    await r2Client.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
      }),
    );
    return NextResponse.json({ success: true, key });
  } catch (err) {
    console.error("Failed to delete from R2:", err);
    return NextResponse.json(
      { error: "Failed to delete file" },
      { status: 500 },
    );
  }
}
