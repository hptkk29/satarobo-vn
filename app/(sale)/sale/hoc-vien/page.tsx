/**
 * Site Sale — màn "Học viên" (`/sale/hoc-vien`).
 *
 * ══ BẢN ĐÔI CỦA `app/(admin)/admin/students/page.tsx` ══════════════════════
 *
 * ── Vì sao tồn tại ──────────────────────────────────────────────────────────
 * Tới 04/09/2026 tệp này chỉ là một lớp bọc `<AdminStudentsPage searchParams/>`.
 * Chủ dự án chốt ngày đó rằng các màn site Sale phải TÁCH BẢN RIÊNG: họ muốn
 * thiết kế lại site Sale mà KHÔNG đụng một pixel nào của khu quản trị, nơi 9 vai
 * đang làm việc hằng ngày. Rủi ro trôi lệch giữa hai bản đã được nêu rõ trước
 * khi chốt; chủ dự án vẫn chọn đường này.
 *
 * ⚠️ NGƯỜI SỬA MỘT BÊN PHẢI BIẾT CÒN BÊN KIA. Danh sách những thứ hai bản phải
 *    khớp nhau nằm ở đầu `lib/sale/du-lieu-hoc-vien.ts` (truy vấn + bộ lọc) và
 *    `lib/sale/trang-thai-dao-tao.ts` (nhãn trạng thái).
 *
 * ── Dùng lại được, KHÔNG chép ───────────────────────────────────────────────
 * `buildLifecycleWhere` · `postFilterFrequentlyAbsent` · `LIFECYCLE_*` ·
 * `docSoDong` · `ChonSoDong` · `DieuHuongTrangLink` · `scopedDb` ·
 * `checkPermission*` · `canViewLeadPii` · `maskPhone` · `phoneSearchTerm`.
 *
 * ── Buộc phải chép (nợ trôi lệch) ───────────────────────────────────────────
 * Truy vấn danh sách (trang admin gọi DB ngay trong `page.tsx` nên không có hàm
 * để gọi lại) và bảng nhãn trạng thái. Cả hai đã dời vào `lib/sale/` để phần
 * trùng nằm ở tệp có tên chứ không lẫn trong JSX.
 *
 * ⚠️ CỔNG QUYỀN `chanNeuThieuQuyen` PHẢI CHẠY TRƯỚC MỌI THỨ. Không được thay
 *    bằng `redirect("/dashboard")` kiểu bản admin: đường đó chỉ có nghĩa trên
 *    tên miền admin, còn trên host Sale (và mọi host dùng chung như `localhost`
 *    hay `test.satarobo.vn`) nó là 404 trắng trơn. Bài kiểm `page-gates.test.ts`
 *    cũng đòi đúng lời gọi này với đúng khoá `/sale/hoc-vien`.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileSpreadsheet, Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import {
  canViewLeadPii,
  checkPermission,
  checkPermissionDetail,
} from "@/lib/auth/check-permission";
import { ChonSoDong } from "@/components/ui/chon-so-dong";
import { DieuHuongTrangLink } from "@/components/ui/dieu-huong-trang-link";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { docSoDong, SO_DONG_MAC_DINH } from "@/lib/ui/phan-trang";
import { cn } from "@/lib/utils";
import {
  LIFECYCLE_VIEWS,
  LIFECYCLE_VIEW_DESCRIPTION,
  LIFECYCLE_VIEW_LABEL,
  type LifecycleView,
} from "@/lib/students/lifecycle";
import {
  docCoSoChoLoc,
  docDanhSachHocVien,
  MOI_TRANG_THAI_HOC_VIEN,
  TRAN_VANG_NHIEU,
} from "@/lib/sale/du-lieu-hoc-vien";
import type { StudentStatus } from "@prisma/client";
import { BoLocHocVien } from "./_components/bo-loc-hoc-vien";
import { BangHocVien } from "./_components/bang-hoc-vien";

export const dynamic = "force-dynamic";
export const metadata = { title: "Học viên | Tư vấn tuyển sinh" };

type ThamSo = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    centerId?: string;
    grade?: string;
    page?: string;
    view?: string;
    size?: string;
  }>;
};

function laView(v: string | undefined): v is LifecycleView {
  return LIFECYCLE_VIEWS.includes(v as LifecycleView);
}

/** Nút phụ ở dòng đầu khung — viền, nền thẻ. Chỉ MỘT nút được là nút chính. */
const NUT_PHU =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 " +
  "text-sm font-medium text-foreground transition-colors hover:bg-muted " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30";

export default async function ManHocVienSale({ searchParams }: ThamSo) {
  const chan = await chanNeuThieuQuyen("/sale/hoc-vien", "Học viên");
  if (chan) return chan;

  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fhoc-vien");

  const themDuoc = await checkPermission("students:create");
  const suaDuoc = await checkPermission("students:edit");
  const xoaDuoc = await checkPermission("students:delete");

  // Che SĐT phụ huynh mặc định (đồng nhất với leads/payments). Hai điều kiện, và
  // cả hai đều cần: quyền xem PII liên hệ, VÀ không bị DENY cấp trường
  // `parentPhone` từ grant nhóm (US-03 · TS-02) — mask độc lập với quyết định
  // action, nên hỏi riêng.
  const { fieldMask } = await checkPermissionDetail("students:view-all");
  const xemDuocSdt = (await canViewLeadPii()) && !fieldMask.includes("parentPhone");

  const sp = await searchParams;
  const view: LifecycleView = laView(sp.view) ? sp.view : "all";
  const q = sp.q?.trim() ?? "";
  const centerId = sp.centerId?.trim() ?? "";
  const gradeRaw = sp.grade?.trim() ?? "";
  const grade =
    gradeRaw && /^\d+$/.test(gradeRaw)
      ? Math.max(1, Math.min(12, Number(gradeRaw)))
      : undefined;
  const status =
    sp.status && MOI_TRANG_THAI_HOC_VIEN.includes(sp.status as StudentStatus)
      ? (sp.status as StudentStatus)
      : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const soDong = docSoDong(sp.size);

  const actor = await resolveActor(session.user.id);
  const [ketQua, coSo] = await Promise.all([
    docDanhSachHocVien({
      actor,
      view,
      q,
      centerId,
      grade,
      status,
      page,
      soDong,
      xemDuocSdt,
    }),
    docCoSoChoLoc(actor),
  ]);

  /** Dựng URL giữ nguyên bộ lọc khi đổi tab hoặc đổi trang. */
  function duong(
    p: Partial<{
      view: LifecycleView;
      page: number;
      q: string;
      centerId: string;
      grade: string;
      status: string;
    }>,
  ): string {
    const u = new URLSearchParams();
    // Giữ lựa chọn số dòng khi qua trang — mất nó là mỗi lần bấm Sau lại về 20.
    if (soDong !== SO_DONG_MAC_DINH) u.set("size", String(soDong));
    if (p.view && p.view !== "all") u.set("view", p.view);
    if (p.page && p.page > 1) u.set("page", String(p.page));
    if (p.q) u.set("q", p.q);
    if (p.centerId) u.set("centerId", p.centerId);
    if (p.grade) u.set("grade", p.grade);
    if (p.status) u.set("status", p.status);
    return `/sale/hoc-vien${u.toString() ? "?" + u.toString() : ""}`;
  }

  return (
    // Chín cột nên trần rộng hơn màn "Khách của tôi" (bốn cột, 76rem). Bề rộng
    // theo NỘI DUNG chứ không theo trần của trang.
    <KhungDuLieu className="max-w-[92rem]">
      <KhungDuLieu.Dau
        ten="Học viên"
        mo={LIFECYCLE_VIEW_DESCRIPTION[view]}
        hanhDong={
          themDuoc ? (
            <>
              {/* ⚠️ NỢ ĐÃ BIẾT — ba đích dưới đây là đường của KHU QUẢN TRỊ.
                  Trên host `sale.satarobo.vn`, `decideRoute` viết lại mọi đường
                  lạ thành `/sale/<đường>` (route-policy.ts, nhánh host "sale")
                  nên `/students/new` thành `/sale/students/new` → 404. Bản mount
                  cũ cũng đã như vậy: giữ nguyên ở đây là KHÔNG tạo hồi quy, chứ
                  không phải là đúng. Vá thật = dựng màn tương ứng trong
                  `app/(sale)/sale/hoc-vien/**`, và đó là việc phải hỏi chủ dự án
                  vì nó thêm màn chứ không đổi cách bày.
                  Riêng "Tài khoản PH" ĐÃ có bản Sale nên trỏ thẳng vào đó. */}
              <Link href="/sale/tai-khoan-ph" className={NUT_PHU}>
                Tài khoản PH
              </Link>
              <Link href="/students/import" className={NUT_PHU}>
                <FileSpreadsheet className="h-4 w-4" />
                Import Excel
              </Link>
              <Link
                href="/students/new"
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-medium",
                  "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
                  "transition-colors hover:bg-[color:var(--primary-dark)]",
                  "focus-visible:outline-none focus-visible:ring-2",
                  "focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2",
                )}
              >
                <Plus className="h-4 w-4" />
                Thêm học viên
              </Link>
            </>
          ) : null
        }
      />

      {/* Tab vòng đời: một tầng riêng giữa DANH TÍNH màn và CÔNG CỤ lọc. Nền thẻ
          (không phải nền chìm) vì đây là điều hướng, không phải bộ lọc — bản
          admin để cả ba tầng trôi trên nền trang nên mắt phải tự đoán ranh giới. */}
      <div className="border-b border-border px-5">
        <nav aria-label="Nhóm học viên" className="-mb-px flex gap-1 overflow-x-auto">
          {LIFECYCLE_VIEWS.map((v) => {
            const dangDung = v === view;
            return (
              <Link
                key={v}
                href={duong({
                  view: v,
                  q,
                  centerId,
                  grade: grade != null ? String(grade) : "",
                })}
                aria-current={dangDung ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  dangDung
                    ? "border-[color:var(--primary)] text-[color:var(--primary-ink)]"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {LIFECYCLE_VIEW_LABEL[v]}
              </Link>
            );
          })}
        </nav>
      </div>

      <KhungDuLieu.Loc>
        <BoLocHocVien
          view={view}
          soDong={soDong}
          q={q}
          status={status ?? ""}
          centerId={centerId}
          grade={grade != null ? String(grade) : ""}
          coSo={coSo.map((c) => ({ value: c.id, label: c.name }))}
          trangThai={MOI_TRANG_THAI_HOC_VIEN}
          timDuocSdt={xemDuocSdt}
        />
      </KhungDuLieu.Loc>

      <BangHocVien dong={ketQua.dong} suaDuoc={suaDuoc} xoaDuoc={xoaDuoc} />

      <KhungDuLieu.Chan>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              {ketQua.tong.toLocaleString("vi-VN")} học viên
              {view === "frequent-absent" && ketQua.chamTran && (
                <span className="ml-2 text-[color:var(--primary-ink)]">
                  (cap {TRAN_VANG_NHIEU} — refine filter để xem hết)
                </span>
              )}
            </span>
            {ketQua.tong > 0 && (
              <>
                <ChonSoDong soDong={soDong} tong={ketQua.tong} tenDonVi="học viên" />
                <span>
                  Trang {page}/{ketQua.soTrang}
                </span>
              </>
            )}
          </div>
          {ketQua.tong > 0 && (
            <DieuHuongTrangLink
              trang={page}
              soTrang={ketQua.soTrang}
              hrefCua={(n: number) =>
                duong({
                  view,
                  page: n,
                  q,
                  centerId,
                  grade: grade != null ? String(grade) : "",
                  status,
                })
              }
            />
          )}
        </div>
      </KhungDuLieu.Chan>
    </KhungDuLieu>
  );
}
