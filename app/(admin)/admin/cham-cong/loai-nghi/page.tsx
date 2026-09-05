// app/(admin)/admin/cham-cong/loai-nghi/page.tsx — L5: danh mục loại nghỉ (K-06 theo MISA).
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { HO_CENTER_ID } from "@/lib/cham-cong/home-center";
import { LeaveTypeList } from "./_components/leave-type-list";

export const metadata = { title: "Loại nghỉ | Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function LoaiNghiPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fcham-cong%2Floai-nghi");
  const [canView, canEdit] = await Promise.all([checkPermission("hr_attendance:view"), checkPermission("hr_attendance:config", { centerId: HO_CENTER_ID })]);
  if (!canView && !canEdit) redirect("/cham-cong");
  const sdb = scopedDb(await resolveActor(session.user.id));
  const rows = await sdb.leaveType.findMany({ orderBy: [{ displayOrder: "asc" }, { code: "asc" }] });
  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4">
        <Link href="/cham-cong" className="text-sm text-muted-foreground hover:underline">← Chấm công</Link>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Loại nghỉ</h1>
        <p className="mt-1 text-sm text-muted-foreground">Danh mục dùng khi nộp đơn nghỉ. Tỷ lệ lương &gt; 0 ⇒ duyệt xong ghi mã <span className="font-mono">P</span> lên lưới, = 0 ⇒ mã <span className="font-mono">X</span>. Seed sẵn 8 loại theo MISA (K-06); thêm/sửa tại đây, không cần dev.</p>
      </div>
      <LeaveTypeList rows={rows.map((r) => ({ id: r.id, code: r.code, name: r.name, paidRatio: r.paidRatio, maxDaysPerYear: r.maxDaysPerYear, countsAsWorked: r.countsAsWorked, isActive: r.isActive }))} canEdit={canEdit} />
    </div>
  );
}
