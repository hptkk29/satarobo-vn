import type { NextRequest } from "next/server";

/**
 * Verify Vercel Cron Authorization header.
 * Returns true if request from Vercel Cron with matching CRON_SECRET.
 */
export function verifyCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron] CRON_SECRET missing — rejecting all cron requests");
    return false;
  }
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}
