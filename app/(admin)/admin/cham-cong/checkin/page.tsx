// app/(admin)/admin/cham-cong/checkin/page.tsx — trang check-in sau khi quét QR xoay tại quầy (L4).
// ?w=<workLocationId>&t=<kiosk token>. Trang xác minh token + cấp vé 120s rồi giao cho client.
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { CheckinClient } from "@/components/cham-cong/checkin-client";
import { prepareCheckin } from "@/lib/cham-cong/checkin-gate";

export const metadata = { title: "Chấm công | Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ w?: string; t?: string; c?: string }>;
}

export default async function CheckinPage({ searchParams }: Props) {
  const session = await auth();
  const { w, t, c } = await searchParams;
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/cham-cong/checkin?w=${w ?? ""}&t=${t ?? ""}`)}`);
  }
  if (!(await checkPermission("hr_attendance:checkin", { centerId: null }))) redirect("/dashboard");
  const h = await headers();
  const gate = c && !w
    ? { ok: false as const, error: "Mã QR cũ (cố định theo cơ sở) không còn dùng. Mở màn hình chấm công mới tại quầy rồi quét lại." }
    : await prepareCheckin({ token: t, workLocationId: w, userId: session.user.id, ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null });

  return (
    <div className="min-h-screen bg-muted p-4">
      <div className="mx-auto max-w-sm pt-8">
        <h1 className="mb-4 text-center text-xl font-bold text-foreground">Chấm công nhân viên</h1>
        {gate.ok ? (
          <CheckinClient ticketId={gate.ticketId} nonce={gate.nonce} expiresAt={gate.expiresAt} locationName={gate.workLocation.name} geofenceEnabled={gate.workLocation.geofenceEnabled} />
        ) : (
          <p className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground">{gate.error}</p>
        )}
      </div>
    </div>
  );
}
