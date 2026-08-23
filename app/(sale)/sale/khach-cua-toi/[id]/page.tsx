// Chi tiết một khách — hồ sơ + nhật ký chạm + việc follow-up.
//
// Trang KHÔNG có nút đổi người phụ trách, không có nút bàn giao, không có nút
// "dùng chung": đó là việc điều phối của quản lý, và Sale mở được chúng là mở
// đường đi vòng qua sổ lượt. Ở đây chỉ có việc của người trực tiếp chăm khách.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkAnyPermission, canViewLeadPii } from "@/lib/auth/check-permission";
import { PAGE_GATES } from "@/lib/auth/page-gates";
import { resolveActor } from "@/lib/auth/actor";
import { getMyLeadDetail } from "@/lib/lead/sale-leads";
import { LEAD_STATUS_LABEL } from "@/lib/leads/status";
import { formatDateVN } from "@/lib/format/date";
import { Badge } from "@/components/ui/badge";
import { LeadTouchPanel } from "../_components/touch-panel";
import { SaleOrderPanel } from "../_components/order-panel";
import { getSaleLeadOrders } from "@/lib/orders/sale-orders";
import { checkPermission } from "@/lib/auth/check-permission";
import { loadCreateOrderFormData } from "@/app/(admin)/admin/orders/_actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chi tiết khách | Tư vấn tuyển sinh" };

/** Nhãn tiếng Việt cho trạng thái học thử của từng con. Enum thô lọt ra màn hình
 *  là bắt người dùng học từ vựng của lập trình viên. */
const TRIAL_VI: Record<string, string> = {
  NONE: "chưa học thử",
  SCHEDULED: "đã hẹn học thử",
  IN_PROGRESS: "đang học thử",
  ATTENDED: "đã học thử",
};

export default async function SaleLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fkhach-cua-toi");
  if (!(await checkAnyPermission(PAGE_GATES["/sale/khach-cua-toi"]))) redirect("/sale");

  const { id } = await params;
  const actor = await resolveActor(session.user.id);
  const canViewPii = await canViewLeadPii();
  const lead = await getMyLeadDetail(actor, session.user.id, id, canViewPii);
  // `null` = không tồn tại HOẶC không phải khách của bạn — cố ý không phân biệt.
  if (!lead) notFound();

  // Khối đơn hàng chỉ nạp khi người xem thật sự tạo được đơn. Không có quyền mà
  // vẫn nạp là tốn hai truy vấn ở MỌI lần mở trang, chỉ để vẽ một khối rồi giấu.
  const coQuyenTaoDon = await checkPermission("orders:create");
  const [donHang, formTaoDon] = coQuyenTaoDon
    ? await Promise.all([
        getSaleLeadOrders(actor, session.user.id, lead.id),
        loadCreateOrderFormData(),
      ])
    : [null, null];

  return (
    <div>
      <Link
        href="/sale/khach-cua-toi"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Khách của tôi
      </Link>

      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold text-foreground">
          {lead.parentName || "(chưa có tên)"}
        </h1>
        <Badge variant="outline">{LEAD_STATUS_LABEL[lead.status] ?? lead.status}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {donHang && formTaoDon ? (
            <SaleOrderPanel
              leadId={lead.id}
              orders={donHang.orders.map((o) => ({
                id: o.id,
                code: o.code,
                status: o.status,
                totalAmount: o.totalAmount,
                daGhiNhan: o.daGhiNhan,
                createdAt: o.createdAt.toISOString(),
                items: o.items,
              }))}
              tongDon={donHang.tongDon}
              tongDaGhiNhan={donHang.tongDaGhiNhan}
              conThieu={donHang.conThieu}
              phuongThuc={formTaoDon.paymentMethods.map((m) => ({ id: m.id, name: m.name }))}
            />
          ) : null}

          <LeadTouchPanel
            leadId={lead.id}
            activities={lead.activities.map((a) => ({
              id: a.id,
              type: a.type,
              content: a.content,
              actorName: a.actorName,
              createdAt: a.createdAt.toISOString(),
            }))}
            tasks={lead.tasks.map((t) => ({
              id: t.id,
              title: t.title,
              description: t.description,
              dueAt: t.dueAt.toISOString(),
              status: t.status,
            }))}
          />
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Liên hệ</h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Điện thoại</dt>
                <dd className="tabular-nums text-foreground">{lead.phone || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="truncate text-foreground">{lead.email || "—"}</dd>
              </div>
              {lead.facebookUrl ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Facebook</dt>
                  <dd className="truncate">
                    {/* Giá trị này do người nhập gõ vào; đường ghi đã chặn scheme
                        lạ (javascript:) trước khi lưu. */}
                    <a
                      href={lead.facebookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      mở trang
                    </a>
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Cơ sở</dt>
                <dd className="text-foreground">{lead.center?.name ?? "chưa xác định"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Nguồn</dt>
                <dd className="text-foreground">{lead.source || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Khoá quan tâm</dt>
                <dd className="text-foreground">{lead.course?.name ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Tạo lúc</dt>
                <dd className="text-foreground">{formatDateVN(lead.createdAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">
              Con ({lead.children.length})
            </h2>
            {lead.children.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa ghi nhận con nào. Thêm ở màn quản trị khi đủ thông tin.
              </p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {lead.children.map((c) => (
                  <li key={c.id} className="flex items-baseline justify-between gap-2">
                    <span className="text-foreground">{c.fullName}</span>
                    <span className="text-xs text-muted-foreground">
                      {[c.ageYears ? `${c.ageYears} tuổi` : null, c.gradeLevel, TRIAL_VI[c.trialStatus] ?? null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {lead.note ? (
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-2 text-sm font-semibold">Ghi chú</h2>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{lead.note}</p>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
