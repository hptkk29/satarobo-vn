import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyScormTicket } from "@/lib/scorm/ticket";

export const dynamic = "force-dynamic";

// LMS-14 — runtime SCORM ghi điểm/hoàn thành. Auth = launch ticket (HMAC, TTL) —
// KHÔNG cần session (iframe content gọi). Ticket buộc packageId + userId + sessionId.
type Body = {
  ticket?: string;
  scoreRaw?: number | null;
  scoreMax?: number | null;
  lessonStatus?: string | null;
  completion?: string | null;
  suspendData?: string | null;
  rawCmi?: Record<string, unknown> | null;
};

function toInt(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v);
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
  }

  const v = verifyScormTicket(body.ticket ?? "");
  if (!v.ok || !v.payload) {
    return NextResponse.json({ ok: false, error: "INVALID_TICKET" }, { status: 401 });
  }
  const { packageId, userId, sessionId } = v.payload;

  const data = {
    scoreRaw: toInt(body.scoreRaw),
    scoreMax: toInt(body.scoreMax),
    lessonStatus: body.lessonStatus?.slice(0, 40) ?? null,
    completion: body.completion?.slice(0, 40) ?? null,
    suspendData: body.suspendData?.slice(0, 64_000) ?? null,
    rawCmi: (body.rawCmi ?? undefined) as object | undefined,
    classSessionId: sessionId,
  };

  try {
    const existing = await db.scormAttempt.findUnique({
      where: { packageId_userId: { packageId, userId } },
      select: { id: true },
    });
    if (existing) {
      await db.scormAttempt.update({ where: { id: existing.id }, data });
    } else {
      await db.scormAttempt.create({ data: { packageId, userId, ...data } });
    }
  } catch (err) {
    console.error("[scorm/runtime]", err);
    return NextResponse.json({ ok: false, error: "DB" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
