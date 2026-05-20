import { headers } from "next/headers";

export type RequestMetadata = {
  ip?: string;
  userAgent?: string;
};

/**
 * Extract IP + User-Agent từ incoming request headers.
 * Phải gọi trong context Server Component / Server Action.
 * Trả về object rỗng nếu fail — audit không được phép crash request.
 */
export async function getRequestMetadata(): Promise<RequestMetadata> {
  try {
    const h = await headers();

    const forwarded = h.get("x-forwarded-for");
    const ip = forwarded
      ? forwarded.split(",")[0]?.trim()
      : (h.get("x-real-ip") ?? undefined);

    return {
      ip: ip || undefined,
      userAgent: h.get("user-agent") ?? undefined,
    };
  } catch {
    return {};
  }
}
