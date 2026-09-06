// app/(admin)/admin/cham-cong/diem-cham/page.tsx — ĐIỂM CHẤM CÔNG: quầy đặt màn hình QR của một cơ sở.
//
// Vì sao màn này tồn tại: không có điểm chấm công thì màn hình QR ở quầy không mở được, và mọi lượt
// quét thiếu chỗ để so toạ độ. Trên prod hiện CHƯA cơ sở nào khai toạ độ ⇒ trạng thái rỗng ở đây là
// điểm XUẤT PHÁT THẬT, không phải ca hiếm.
//
// Điều dễ vỡ:
//  · Hội sở KHÔNG có điểm chấm công (Q-04) — người HO chấm ở cơ sở nào cũng được. Vì thế cổng màn
//    này là `hr_attendance:config` tại CƠ SỞ, quyền ở khối Hội sở không mở được màn.
//  · Geofence CHỈ gắn cờ `NGOAI_VUNG`, KHÔNG từ chối lượt quét; chưa có toạ độ thì lượt vẫn ghi kèm
//    cờ `CHUA_TOA_DO`. Đừng viết lại thành "chặn" trong bất kỳ câu chữ nào.
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { HO_CENTER_ID } from "@/lib/cham-cong/home-center";
import { ASK_WHO, loadModuleScope } from "@/lib/cham-cong/module-scope";
import { PageHeader } from "@/components/admin/ui/page-header";
import { PageHelp } from "@/components/admin/ui/page-help";
import { NoPermission } from "@/components/admin/ui/states";
import { ModuleNav } from "@/components/admin/cham-cong/module-nav";
import { ConfigTabs } from "@/components/admin/cham-cong/config-tabs";
import { LocationList } from "./_components/location-table";

export const metadata = { title: "Điểm chấm công | Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function DiemChamPage({
  searchParams,
}: {
  searchParams: Promise<{ ky?: string; coSo?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fcham-cong%2Fdiem-cham");
  const sp = await searchParams;
  const ctx = { ky: sp.ky ?? null, coSo: sp.coSo ?? null };
  const scope = await loadModuleScope(session.user.id);
  // Chỉ cơ sở vận hành — khối Hội sở bị loại có chủ đích (Q-04).
  const editable = scope
    .blocksWith("hr_attendance:config")
    .filter((b) => b.id !== HO_CENTER_ID)
    .map((b) => ({ id: b.id, name: b.label }));

  const head = (
    <>
      <PageHeader
        title="Điểm chấm công"
        subtitle="Mỗi cơ sở một quầy: nơi treo màn hình QR và mốc toạ độ để đối chiếu lượt quét."
      />
      <ModuleNav active="cauhinh" scope={scope} ctx={ctx} />
    </>
  );

  if (editable.length === 0) {
    return (
      <div className="max-w-6xl">
        {head}
        <NoPermission
          permission="hr_attendance:config"
          what="điểm chấm công"
          askWho={ASK_WHO["hr_attendance:config"]}
        />
      </div>
    );
  }

  const sdb = scopedDb(await resolveActor(session.user.id));
  const rows = await sdb.workLocation.findMany({
    where: { centerId: { in: editable.map((c) => c.id) } },
    orderBy: { code: "asc" },
  });

  return (
    <div className="max-w-6xl">
      {head}
      <ConfigTabs active="diem-cham" scope={scope} ctx={ctx} />
      <PageHelp guideSlug="nhan-su-giao-vien">
        <p>
          Lấy toạ độ: mở Google Maps, nhấn giữ đúng vị trí quầy, chép hai số (vĩ độ, kinh độ) vào ô
          tương ứng. Bán kính 100m là đủ cho một toà nhà.
        </p>
        <p className="mt-2">
          Định vị chỉ để GẮN CỜ: quét ngoài bán kính vẫn ghi nhận lượt, chỉ kèm cờ &ldquo;Ngoài
          vùng&rdquo; cho quản lý rà. Chưa nhập toạ độ thì lượt quét kèm cờ &ldquo;Chưa toạ
          độ&rdquo;. Nên bật định vị sau khi đã quét thử vài lượt và thấy khoảng cách hợp lý.
        </p>
        <p className="mt-2">
          Hội sở không có điểm chấm công: người Hội sở quét ở quầy của bất kỳ cơ sở nào.
        </p>
      </PageHelp>
      <LocationList
        centers={editable}
        rows={rows.map((r) => ({
          id: r.id,
          centerId: r.centerId,
          code: r.code,
          name: r.name,
          latitude: r.latitude,
          longitude: r.longitude,
          radiusMeters: r.radiusMeters,
          geofenceEnabled: r.geofenceEnabled,
          isActive: r.isActive,
        }))}
      />
    </div>
  );
}
