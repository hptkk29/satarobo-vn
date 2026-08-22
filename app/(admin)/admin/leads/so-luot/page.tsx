// Sổ lượt chia lead — Đợt D (22/08/2026).
//
// Vì sao có trang này: chủ dự án chốt chia đều theo SỐ LƯỢT (Q7). Một thuật toán
// công bằng mà không ai kiểm được thì vẫn bị nghi thiên vị y như cũ — và nghi ngờ
// đó chính là thứ khởi đầu cả việc này. Đặc tả gốc ghi rõ đây là "điểm bắt buộc
// dù chọn phương án nào" (plan/15 §5).
//
// Trang CHỈ ĐỌC. Không có nút sửa sổ: sổ lượt sửa được thì nó không còn là bằng
// chứng. Muốn đổi cách chia thì vào Cấu hình chia lead.
import { redirect } from "next/navigation";
import Link from "next/link";
import { ListOrdered } from "lucide-react";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/auth/permissions";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { orgUnitIdForCenter } from "@/lib/org/org-service";
import { getRotationBoard } from "@/lib/lead/rotation";
import { formatDateVN } from "@/lib/format/date";
import { PageHelp } from "@/components/admin/ui/page-help";

export const metadata = { title: "Sổ lượt chia lead | Admin" };
export const dynamic = "force-dynamic";

export default async function LeadRotationBoardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Ai xem được toàn bộ lead của cơ sở thì xem được sổ lượt của cơ sở đó — đây
  // là bản giải thích cho chính những lead ấy, không phải dữ liệu mới.
  if (!(await checkPermission("leads:view-all"))) redirect("/leads");

  const isSuper = hasRole(session.user, "SUPER_ADMIN");
  const isCM = hasRole(session.user, "CENTER_MANAGER") && !isSuper;

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  // Center là SCOPE_EXEMPT (hạ tầng) ⇒ sdb pass-through; lọc theo cơ sở của QL
  // bằng tay, giống trang Cấu hình chia lead ngay bên cạnh.
  const centers = await sdb.center.findMany({
    where: {
      isActive: true,
      ...(isCM && session.user.centerId ? { id: session.user.centerId } : {}),
    },
    orderBy: { displayOrder: "asc" },
    select: { id: true, name: true },
  });

  const boards = await Promise.all(
    centers.map(async (c) => {
      const orgUnitId = await orgUnitIdForCenter(c.id);
      const rows = orgUnitId ? await getRotationBoard(orgUnitId) : [];
      return { center: c, orgUnitId, rows };
    }),
  );

  const userIds = [...new Set(boards.flatMap((b) => b.rows.map((r) => r.userId)))];
  const users = userIds.length
    ? await sdb.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, isActive: true, deletedAt: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  return (
    <div className="max-w-3xl p-6">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <ListOrdered className="h-6 w-6 text-primary" /> Sổ lượt chia lead
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ai đã tới lượt bao nhiêu lần, tính từ đầu
        </p>
      </div>

      <PageHelp>
        <p>
          Lead vào hệ thống được chia <strong>luân phiên theo lượt</strong>: ai ít
          lượt nhất thì tới lượt tiếp theo. Sổ này{" "}
          <strong>không reset theo ngày hay theo tháng</strong> — hôm nay ai thiệt
          một lượt thì ngày mai được bù. Chênh lệch giữa người nhiều nhất và ít
          nhất trong cùng cơ sở{" "}
          <strong>không bao giờ quá 1 lượt</strong>, trừ khi có người mới vào hoặc
          có lead được giao tay.
        </p>
        <p className="mt-2">
          Sổ chỉ đếm lead <strong>đi qua vòng chia tự động</strong>. Lead do quản
          lý giao tay, lead sale tự nhập của mình, và lead nhập từ Excel{" "}
          <strong>không tiêu lượt</strong> — nên tổng số lead của một người có thể
          cao hơn số lượt, và đó không phải lỗi.
        </p>
        <p className="mt-2">
          Người vào sau <strong>không phải nhận bù cả quá khứ</strong>: họ được đặt
          ngang mức thấp nhất của vòng lúc vào. Vì vậy cột{" "}
          <strong>Vị trí vòng</strong> của họ cao hơn số lead thật đã nhận — cột{" "}
          <strong>Lead đã nhận</strong> mới là con số để đối chiếu với thực tế.
        </p>
      </PageHelp>

      <div className="mt-4 space-y-5">
        {boards.map(({ center, orgUnitId, rows }) => {
          // Chênh lệch đo trên VỊ TRÍ trong vòng (`turns`) — đó mới là thứ có bất
          // biến "không quá 1". Số lead THẬT (`turns - seedTurns`) lệch nhiều là
          // bình thường khi có người vào sau, và nói ngược lại là bảng nói dối.
          const vals = rows.map((r) => r.turns);
          const lech = vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
          return (
            <section key={center.id} className="rounded-xl border border-border p-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold text-foreground">{center.name}</h2>
                {rows.length > 0 ? (
                  <span className="text-sm text-muted-foreground">
                    Chênh lệch: <strong className="tabular-nums">{lech}</strong> lượt
                  </span>
                ) : null}
              </div>

              {!orgUnitId ? (
                <p className="text-sm text-muted-foreground">
                  Cơ sở này chưa gắn với đơn vị trong sơ đồ tổ chức — chưa chia
                  lead tự động được.
                </p>
              ) : rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Chưa có lead nào được chia tự động ở cơ sở này.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Tư vấn viên</th>
                      <th className="pb-2 text-right font-medium">Lead đã nhận</th>
                      <th className="pb-2 text-right font-medium">Vị trí vòng</th>
                      <th className="pb-2 text-right font-medium">Lần gần nhất</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const u = userById.get(r.userId);
                      const nghi = u ? !u.isActive || u.deletedAt !== null : true;
                      return (
                        <tr key={r.userId} className="border-b border-border/50 last:border-0">
                          <td className="py-2 text-foreground">
                            {u?.name ?? r.userId}
                            {nghi ? (
                              <span className="ml-2 text-xs text-muted-foreground">
                                (không còn nhận lead)
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 text-right tabular-nums text-foreground">
                            {r.turns - r.seedTurns}
                          </td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">
                            {r.turns}
                            {r.seedTurns > 0 ? (
                              <span className="ml-1 text-xs">(vào vòng ở {r.seedTurns})</span>
                            ) : null}
                          </td>
                          <td className="py-2 text-right text-muted-foreground">
                            {r.lastTurnAt ? formatDateVN(r.lastTurnAt) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          );
        })}
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        <Link href="/leads" className="text-primary hover:underline">
          ← Về danh sách lead
        </Link>
      </p>
    </div>
  );
}
