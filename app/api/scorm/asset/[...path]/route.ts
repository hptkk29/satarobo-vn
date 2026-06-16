// app/api/scorm/asset/[...path]/route.ts — R7-12: resolver tài nguyên SCORM.
// Mỗi request asset của iframe player đi qua đây: xác vé (ticket HMAC, TTL 10p, buộc
// packageId+session+userId) → ký presigned R2 → 302 redirect. Vé sai/hết hạn/IDOR
// hoặc user không khớp (PARENT/HV/chia sẻ link) → 403. Path traversal → 403.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isScormEnabled } from "@/lib/flags";
import { verifyScormTicket } from "@/lib/scorm/ticket";
import { signedMediaUrl } from "@/lib/storage/signed-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Segment nguy hiểm: rỗng, ".", "..", backslash, NUL → traversal/absolute. */
function isUnsafeSegments(segs: string[]): boolean {
  if (segs.length === 0) return true;
  for (const s of segs) {
    if (!s || s === "." || s === "..") return true;
    if (s.includes("\\") || s.includes("\0") || s.startsWith("/")) return true;
  }
  return false;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  if (!isScormEnabled()) {
    return new NextResponse("Not found", { status: 404 });
  }

  // 1. Vé (ticket) — chữ ký + hạn.
  const token = req.nextUrl.searchParams.get("t") ?? "";
  const v = verifyScormTicket(token);
  if (!v.ok || !v.payload) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // 2. Buộc vé theo user đăng nhập — chặn chia sẻ link + PARENT/HV (không có vé hợp lệ).
  const session = await auth();
  if (!session?.user || session.user.id !== v.payload.userId) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // 3. Path traversal guard.
  const { path } = await ctx.params;
  if (isUnsafeSegments(path)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // 4. Key R2 = storagePrefix gói (theo VÉ, không theo URL) + path → chống IDOR sang gói khác.
  const pkg = await db.scormPackage.findUnique({
    where: { id: v.payload.packageId },
    select: { storagePrefix: true },
  });
  if (!pkg) {
    return new NextResponse("Not found", { status: 404 });
  }
  const prefix = pkg.storagePrefix.endsWith("/")
    ? pkg.storagePrefix
    : `${pkg.storagePrefix}/`;
  const key = `${prefix}${path.join("/")}`;

  try {
    const url = await signedMediaUrl(key, 600);
    return NextResponse.redirect(url, 302);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
