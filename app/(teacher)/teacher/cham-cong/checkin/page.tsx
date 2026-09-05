// app/(teacher)/teacher/cham-cong/checkin/page.tsx — L0 chấm công (05/09/2026).
//
// Đích của mã QR tại quầy khi người quét là GV THUẦN: `admin.satarobo.vn/cham-cong/
// checkin?c=&t=` → decideRoute đá sang giaovien GIỮ path+query → rewrite vào đây.
// Từ 10/07/2026 (bật TEACHER_SITE_ENABLED) tới nay GV thuần quét xong rơi trang chủ
// site GV, không chấm công được ngày nào.
//
// Cùng client + action với màn admin (`components/cham-cong/checkin-client.tsx`,
// `lib/attendance/checkin-action.ts`). Layout (teacher) đã gác login + role TEACHER.
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { CheckinClient } from "@/components/cham-cong/checkin-client";
import { PageHeader } from "../../_components/ui/page-header";

export const metadata = { title: "Chấm công | Giáo viên", robots: { index: false } };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ c?: string; t?: string }>;
}

export default async function TeacherCheckinPage({ searchParams }: Props) {
  const session = await auth();
  const { c, t } = await searchParams;
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/cham-cong/checkin?c=${c ?? ""}&t=${t ?? ""}`)}`);
  }
  if (!(await checkPermission("hr_attendance:checkin", { centerId: c ?? null }))) {
    redirect("/teacher");
  }

  return (
    <div className="mx-auto max-w-sm">
      <PageHeader title="Chấm công" subtitle="Bấm Check-in khi tới, Check-out khi về." />
      {c && t ? (
        <CheckinClient centerId={c} token={t} />
      ) : (
        <p className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground">
          Mã QR không hợp lệ. Vui lòng quét lại mã trên màn hình chấm công tại quầy.
        </p>
      )}
    </div>
  );
}
