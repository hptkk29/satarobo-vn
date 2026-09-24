// app/(admin)/admin/zalo-crm/nick/page.tsx — GIAO NICK ZALO CHO NGƯỜI.
//
// Ba cổng, theo đúng thứ tự của màn `/zalo-crm` ngay cạnh:
//  1. Cờ `ZALOCRM_ENABLED` TẮT ⇒ `notFound()` — màn KHÔNG TỒN TẠI, không phải "bị chặn".
//  2. Chưa đăng nhập ⇒ về `/login`.
//  3. Thiếu quyền ⇒ về `/dashboard`. Cổng là `PAGE_GATES["/zalo-crm/nick"]`
//     (= `zalocrm:manage-nick`), HẸP HƠN `zalocrm:use`: tư vấn viên dùng nick thì được,
//     tự giao nick cho mình thì không.
//
// Tầm nhìn theo cơ sở KHÔNG do cổng quyền lo (quyền khai GLOBAL vì cổng trang gọi trần).
// Nó do `docTongQuanNick(actor)` lo, qua `whereNickTheoActor` — quản lý CS1 chỉ thấy nick
// CS1. Cùng mảnh `where` ấy được dùng lại ở cổng GHI (`giao-nick.ts`), nên hai đường
// không thể lệch nhau.
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { checkAnyPermission } from "@/lib/auth/check-permission";
import { PAGE_GATES } from "@/lib/auth/page-gates";
import { isZalocrmEnabled } from "@/lib/flags";
import { docTongQuanNick } from "@/lib/integrations/zalocrm/nick-admin";
import { nguoiNhanDuocNick, type NguoiNhanDuoc } from "@/lib/integrations/zalocrm/giao-nick";
import { scopedDb } from "@/lib/db-scope";
import { PageHeader } from "@/components/admin/ui/page-header";
import { BangGiaoNick } from "./_bang";

export const dynamic = "force-dynamic";

export const metadata = { title: "Giao nick Zalo" };

export default async function TrangGiaoNick() {
  if (!isZalocrmEnabled()) notFound();

  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=%2Fzalo-crm%2Fnick");
  if (!(await checkAnyPermission(PAGE_GATES["/zalo-crm/nick"]))) {
    redirect("/dashboard?error=unauthorized");
  }

  const actor = await resolveActor(session.user.id);
  const tamNhin = {
    isSuperAdmin: actor.isSuperAdmin,
    isHoLevel: actor.isHoLevel,
    visibleCenterIds: actor.visibleCenterIds,
  };
  const { rows } = await docTongQuanNick(tamNhin);

  // Ô chọn người: chỉ nạp cho những CƠ SỞ đang có nick trên màn. Nạp cho mọi cơ sở là
  // một câu tra cho mỗi cơ sở mà phần lớn không ai mở tới.
  const centerIds = [...new Set(rows.map((r) => r.centerId).filter((v): v is string => !!v))];
  // `scopedDb` chứ không `db` trần: luật cứng #4 của repo cấm import `@/lib/db` trong
  // `app/(admin)/**`, và ESLint chặn ở mức ERROR. Ở đây nó cũng đúng việc — danh sách
  // cơ sở phải nằm trong tầm nhìn của người đang xem.
  const sdb = scopedDb(actor);
  const coSo = centerIds.length
    ? await sdb.center.findMany({
        where: { id: { in: centerIds } },
        select: { id: true, code: true },
      })
    : [];
  const nguoiTheoCoSo: Record<string, NguoiNhanDuoc[]> = {};
  for (const c of coSo) {
    if (!c.code) continue;
    nguoiTheoCoSo[c.id] = await nguoiNhanDuocNick(c.code);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Giao nick Zalo"
        subtitle="Nick đã giao thì chỉ người được giao và quản lý cơ sở đọc được. Nick chưa giao thì cả cơ sở đều thấy."
      />
      <BangGiaoNick
        rows={rows.map((r) => ({
          zcrmAccountId: r.zcrmAccountId,
          displayName: r.displayName,
          status: r.status,
          centerId: r.centerId,
          centerName: r.centerName,
          sataUserId: r.sataUserId,
          sataUserName: r.sataUserName,
        }))}
        nguoiTheoCoSo={nguoiTheoCoSo}
      />
    </div>
  );
}
