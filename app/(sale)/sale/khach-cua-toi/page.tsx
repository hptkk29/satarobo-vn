// app/(sale)/sale/khach-cua-toi/page.tsx — danh sách khách của tư vấn viên.
//
// Đây là màn việc hằng ngày. Thiếu nó, tư vấn viên phải quay về `/admin/leads`
// mỗi ngày và site Sale mất lý do tồn tại.
//
// Khác `/admin/leads`: trang kia phục vụ CẢ quản lý (xem toàn cơ sở, đổi người
// phụ trách, bàn giao) lẫn sale; trang này chỉ trả lời một câu — "khách nào của
// tôi, ai đang bị bỏ quên". Nên không có cột "Phụ trách", không có bộ lọc cơ sở,
// không có kanban.
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  checkAnyPermission,
  canViewLeadPii,
  checkPermissionDetail,
} from "@/lib/auth/check-permission";
import { PAGE_GATES } from "@/lib/auth/page-gates";
import { resolveActor } from "@/lib/auth/actor";
import { getMyLeads } from "@/lib/lead/sale-leads";
import { maskLeadPiiFields } from "@/lib/lead/pii";
import { ALL_LEAD_STATUSES, LEAD_STATUS_LABEL } from "@/lib/leads/status";
import type { LeadStatus } from "@prisma/client";
import { LeadListFilters } from "./_components/filters";
import { MyLeadTable } from "./_components/lead-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Khách của tôi | Tư vấn tuyển sinh" };

export default async function KhachCuaToiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fkhach-cua-toi");
  if (!(await checkAnyPermission(PAGE_GATES["/sale/khach-cua-toi"]))) redirect("/sale");

  const sp = await searchParams;
  const raw = typeof sp.status === "string" ? sp.status : undefined;
  const status =
    raw && ALL_LEAD_STATUSES.includes(raw as LeadStatus) ? (raw as LeadStatus) : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const gomDaDong = sp.dong === "1";

  const actor = await resolveActor(session.user.id);
  // Sale vốn có `leads:view-pii`, nhưng quyền có thể bị thu bằng grant cấp người
  // (US-03). Hỏi thật thay vì giả định theo vai.
  const canViewPii = await canViewLeadPii();
  // S-1 — ô tìm phải gác bằng CHÍNH quyền xem SĐT, cùng điều kiện với hiển thị.
  // Chép nguyên mẫu đã có ở `/admin/leads` và `/admin/search`: `canViewPii` VÀ
  // không bị DENY cấp trường `phone` (TS-02). Trước S-1 trang này tính `canViewPii`
  // để che cột rồi… không truyền gì xuống truy vấn, nên ô tìm vẫn quét cột SĐT.
  const { fieldMask: leadPiiMask } = await checkPermissionDetail("leads:view-pii");
  const canSearchPhone = canViewPii && !leadPiiMask.includes("phone");

  const rows = await getMyLeads({
    actor,
    userId: session.user.id,
    status,
    q: q || undefined,
    gomDaDong,
    canSearchPhone,
  });

  const view = rows.map((r) => {
    const m = maskLeadPiiFields(
      { parentName: r.parentName, phone: r.phone, childName: r.childName },
      canViewPii,
    );
    return {
      id: r.id,
      parentName: m.parentName ?? null,
      phone: m.phone ?? null,
      childName: m.childName ?? null,
      status: r.status,
      statusLabel: LEAD_STATUS_LABEL[r.status] ?? r.status,
      source: r.source,
      createdAt: r.createdAt.toISOString(),
      lastActivityAt: r.lastActivityAt ? r.lastActivityAt.toISOString() : null,
      viecSapToi: r.viecSapToi
        ? { title: r.viecSapToi.title, dueAt: r.viecSapToi.dueAt.toISOString() }
        : null,
    };
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Khách của tôi</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {gomDaDong
              ? "Gồm cả khách đã ghi danh / đã mất."
              : "Khách đang trong quá trình tư vấn. Xếp theo lần chạm gần nhất — cuối danh sách là người lâu chưa được liên hệ."}
          </p>
        </div>
        <Link
          href="/sale/nhap-khach-hang"
          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          + Nhập khách mới
        </Link>
      </div>

      <LeadListFilters
        status={status ?? ""}
        q={q}
        gomDaDong={gomDaDong}
        timDuocSdt={canSearchPhone}
      />

      {view.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {q || status
            ? "Không có khách nào khớp bộ lọc."
            : "Bạn chưa có khách nào. Khách được chia tự động khi có lead mới về cơ sở của bạn, hoặc bấm “Nhập khách mới”."}
        </p>
      ) : (
        <MyLeadTable rows={view} />
      )}
    </div>
  );
}
