import { createElement, type ReactElement } from "react";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasRole } from "@/lib/auth/permissions";
import { getStudentTranscript } from "@/lib/transcript/service";
import { TranscriptPdf } from "@/lib/pdf/transcript";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_ROLES = ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER", "HR", "SALES_CSM"];

function safeFilename(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_.-]/g, "_")
    .replace(/_+/g, "_");
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const studentId = req.nextUrl.searchParams.get("studentId");
  if (!studentId) return NextResponse.json({ error: "Thiếu studentId" }, { status: 400 });

  // Center scope: CENTER_MANAGER (không phải super) chỉ xem HV cơ sở mình.
  if (hasRole(session.user, "CENTER_MANAGER") && !hasRole(session.user, "SUPER_ADMIN")) {
    const ok = await db.student.findFirst({
      where: { id: studentId, centerId: session.user.centerId },
      select: { id: true },
    });
    if (!ok) return NextResponse.json({ error: "Ngoài phạm vi cơ sở" }, { status: 403 });
  }

  const t = await getStudentTranscript(studentId);
  if (!t) return NextResponse.json({ error: "Không tìm thấy học viên" }, { status: 404 });

  let pdf: Buffer;
  try {
    pdf = await renderToBuffer(createElement(TranscriptPdf, { t }) as unknown as ReactElement<DocumentProps>);
  } catch (err) {
    return NextResponse.json(
      { error: `Lỗi tạo PDF: ${err instanceof Error ? err.message : "Unknown"}` },
      { status: 500 },
    );
  }

  const filename = `HocBa-${safeFilename(t.student.name)}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
