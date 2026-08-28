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
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
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

  // `canhBaoCat` KHÔNG bỏ được: truy vấn cắt ở 200 dòng, mà thanh phân trang của
  // bảng chỉ đếm số dòng ĐÃ NHẬN nên nó in "/ 200 khách" cho cả người có 237
  // khách. Cắt câm ở đây là nói dối về số lượng — xem `moTaCatDanhSach`.
  const { rows, canhBaoCat } = await getMyLeads({
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
    // Bề rộng theo NỘI DUNG, không theo trần của trang. Bảng này có bốn cột;
    // kéo nó ra hết 88rem tạo một khoảng trống ~600px giữa "Việc sắp tới" và cột
    // ngày — mắt phải nhảy qua một vùng trắng để nối hai đầu của cùng một dòng.
    // Trần của trang vẫn rộng cho những màn thật sự cần (hộp thư, tra cứu).
    <KhungDuLieu className="max-w-[76rem]">
      <KhungDuLieu.Dau
        ten="Khách của tôi"
        mo={
          gomDaDong
            ? "Gồm cả khách đã ghi danh / đã mất."
            : "Khách đang trong quá trình tư vấn. Xếp theo lần chạm gần nhất — cuối danh sách là người lâu chưa được liên hệ."
        }
        hanhDong={
          <Link
            href="/sale/nhap-khach-hang"
            className="inline-flex h-9 items-center rounded-lg bg-[color:var(--primary)] px-4 text-sm font-medium text-[color:var(--primary-foreground)] transition-colors hover:bg-[color:var(--primary-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2"
          >
            Nhập khách mới
          </Link>
        }
      />

      <KhungDuLieu.Loc>
        <LeadListFilters
          status={status ?? ""}
          q={q}
          gomDaDong={gomDaDong}
          timDuocSdt={canSearchPhone}
        />
      </KhungDuLieu.Loc>

      {view.length === 0 && !q && !status ? (
        // Sổ trống thật khác với "lọc không ra gì" — hai câu khác nhau, và câu
        // này phải DẠY cách khách chảy vào sổ chứ không chỉ nói là trống.
        <KhungDuLieu.Rong
          ten="Bạn chưa có khách nào"
          mo="Khách được chia tự động khi có lead mới về cơ sở của bạn. Cần thêm tay thì bấm Nhập khách mới."
        />
      ) : (
        <MyLeadTable rows={view} canhBaoCat={canhBaoCat} />
      )}
    </KhungDuLieu>
  );
}
