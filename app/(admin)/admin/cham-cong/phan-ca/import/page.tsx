// app/(admin)/admin/cham-cong/phan-ca/import/page.tsx — L1: import lịch phân ca từ Sheet.
// Gate: `hr_attendance:assign` ở ít nhất một cơ sở (QLCS cơ sở mình, HO_HR mọi cơ sở).
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { loadCenterMap } from "@/lib/cham-cong/home-center";
import { ImportWizard } from "./_components/import-wizard";

export const metadata = { title: "Import lịch phân ca | Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ImportPhanCaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fcham-cong%2Fphan-ca%2Fimport");
  const map = await loadCenterMap();
  const centerIds = [...Object.values(map.byCode).map((c) => c.centerId), map.hoCenterId];
  let allowed = false;
  for (const id of centerIds) {
    if (await checkPermission("hr_attendance:assign", { centerId: id })) {
      allowed = true;
      break;
    }
  }
  if (!allowed) redirect("/cham-cong");

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const employees = await sdb.employee.findMany({
    where: { status: "ACTIVE", userAccount: { isNot: null } },
    select: { fullName: true, employeeCode: true, center: { select: { code: true } }, userAccount: { select: { id: true } } },
    orderBy: { fullName: "asc" },
  });
  const candidates = employees.map((e) => ({
    userId: e.userAccount!.id,
    label: `${e.fullName} · ${e.employeeCode}`,
    centerCode: e.center?.code ?? null,
  }));

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <Link href="/cham-cong" className="text-sm text-muted-foreground hover:underline">
          ← Chấm công
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Import lịch phân ca từ Sheet</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Đọc file LỊCH PHÂN CA (.xlsx) → xác nhận ánh xạ tên → áp khung ca tuần và lưới tháng. Kết quả đối chiếu từng mã ca với Sheet.
        </p>
      </div>
      <ImportWizard candidates={candidates} />
    </div>
  );
}
