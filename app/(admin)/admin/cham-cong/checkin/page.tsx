import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { CheckinClient } from "./_components/checkin-client";

export const metadata = { title: "Chấm công | Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ c?: string; t?: string }>;
}

export default async function CheckinPage({ searchParams }: Props) {
  const session = await auth();
  const { c, t } = await searchParams;
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/cham-cong/checkin?c=${c ?? ""}&t=${t ?? ""}`)}`);
  }
  if (!(await checkPermission("hr_attendance:checkin", { centerId: c ?? null }))) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-neutral-100 p-4">
      <div className="mx-auto max-w-sm pt-8">
        <h1 className="mb-4 text-center text-xl font-bold text-neutral-900">
          Chấm công nhân viên
        </h1>
        {c && t ? (
          <CheckinClient centerId={c} token={t} />
        ) : (
          <p className="rounded-2xl bg-white p-8 text-center text-sm text-neutral-400">
            Mã QR không hợp lệ. Vui lòng quét lại mã trên màn hình chấm công.
          </p>
        )}
      </div>
    </div>
  );
}
