/**
 * Site Sale — màn "Leads" (`/sale/leads`).
 *
 * ══ BẢN ĐÔI CỦA `app/(admin)/admin/leads/page.tsx` ═══════════════════════════
 *
 * ── Vì sao tồn tại ──────────────────────────────────────────────────────────
 * Tới 04/09/2026 tệp này chỉ là một lớp bọc `<AdminLeadsPage searchParams/>`.
 * Chủ dự án chốt ngày đó rằng các màn site Sale phải TÁCH BẢN RIÊNG: họ muốn
 * thiết kế lại site Sale mà KHÔNG đụng một pixel nào của khu quản trị, nơi 9 vai
 * đang làm việc hằng ngày. Rủi ro trôi lệch giữa hai bản đã được nêu rõ trước khi
 * chốt; chủ dự án vẫn chọn đường này.
 *
 * ⚠️ NGƯỜI SỬA MỘT BÊN PHẢI BIẾT CÒN BÊN KIA. Danh sách những thứ hai bản phải
 *    khớp nhau nằm ở đầu `lib/sale/leads.ts` (truy vấn + bộ lọc).
 *
 * ── Dùng lại được, KHÔNG chép ───────────────────────────────────────────────
 * `leadOwnershipWhere` · `leadSharingEnabled` · `maskLeadPiiFields` ·
 * `splitLeadNote` · `phoneSearchTerm` · `getNonEnrollableCenterIds` ·
 * `LEAD_TABLE_COLUMNS` + `resolveColumnLayout` · `ALL_LEAD_STATUSES` +
 * `KANBAN_COLUMNS` + `LEAD_STATUS_LABEL` · `docSoDong` · `ChonSoDong` ·
 * `DieuHuongTrang` · `scopedDb` · `checkPermission*` · `canViewLeadPii` ·
 * `toneTrangThaiKhach` (thang màu ngữ nghĩa của site Sale, đã có sẵn) · và cả
 * bốn Server Action ghi dữ liệu (`updateLeadStatus` · `updateLeadNote` ·
 * `deleteLead` · `autoAssignLeadAction` · hai action tuỳ chọn cột).
 *
 * ── Buộc phải chép (nợ trôi lệch) ───────────────────────────────────────────
 * Truy vấn danh sách + kanban + đếm badge (trang admin gọi DB ngay trong
 * `page.tsx` nên không có hàm để gọi lại) → đã dồn vào `lib/sale/leads.ts`; và
 * năm mảnh giao diện ở `_components/` (bảng · kanban · thanh lọc · ngăn chi tiết ·
 * chọn cột) vì chúng sống trong `app/(admin)/admin/leads/_components/`.
 *
 * ⚠️ CỔNG QUYỀN `chanNeuThieuQuyen` PHẢI CHẠY TRƯỚC MỌI THỨ. Không được thay bằng
 *    `redirect("/dashboard")` kiểu bản admin: đường đó chỉ có nghĩa trên tên miền
 *    quản trị, còn trên host Sale (và mọi host dùng chung như `localhost` hay
 *    `test.satarobo.vn`) nó là 404 trắng trơn. Bài kiểm `lib/auth/page-gates.test.ts`
 *    cũng đòi đúng lời gọi này với đúng khoá `/sale/leads`.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, FileSpreadsheet, Kanban, Plus, Table2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import {
  canViewLeadPii,
  checkPermission,
  checkPermissionDetail,
} from "@/lib/auth/check-permission";
import { scopedDb } from "@/lib/db-scope";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import {
  demLeadDaDangKy,
  docBoLocLead,
  docMucLocLead,
  docTheKanbanLead,
  docTrangBangLead,
  dungWhereLead,
  type QuyenDocLead,
  type ThamSoLead,
} from "@/lib/sale/leads";
import { LEAD_TABLE_COLUMNS, LEAD_TABLE_KEY } from "@/lib/tables/lead-columns";
import { resolveColumnLayout } from "@/lib/tables/column-preference";
import { SO_DONG_MAC_DINH } from "@/lib/ui/phan-trang";
import { cn } from "@/lib/utils";
import { BangLeads } from "./_components/bang-leads";
import { BoLocLeads } from "./_components/bo-loc-leads";
import { ChonCotLead } from "./_components/chon-cot";
import { KanbanLeads } from "./_components/kanban-leads";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads | Tư vấn tuyển sinh" };

/** Nút phụ ở dải tiêu đề — viền, nền thẻ. Chỉ MỘT nút được là nút chính. */
const NUT_PHU =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 " +
  "text-sm font-medium text-foreground transition-colors hover:bg-[color:var(--surface-chim)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30";

/** Bóc đúng phần màn chọn cột cần (khoá/nhãn/nhóm/cờ PII) — không đẩy cả
 *  `defaultOrder`/`defaultVisible` xuống trình duyệt: đó là chuyện của tầng ghép. */
function bocCot(c: (typeof LEAD_TABLE_COLUMNS)[number]) {
  return { key: c.key, label: c.label, group: c.group, pii: c.pii };
}

export default async function ManLeadsSale({
  searchParams,
}: {
  searchParams: Promise<ThamSoLead>;
}) {
  const chan = await chanNeuThieuQuyen("/sale/leads", "Leads");
  if (chan) return chan;

  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fleads");

  // ⚠️ Cổng `PAGE_GATES["/sale/leads"]` hôm nay CHỈ có `leads:view-all`, nên nhánh
  // "chỉ thấy lead của mình" ở dưới thực tế chưa chạy tới. Vẫn giữ nguyên logic
  // của bản admin, và giữ có chủ đích: đúng phút quản trị viên thêm
  // `leads:view-own` vào cổng (đợt 28/08 chốt "admin cấp quyền, không phải code
  // cấp"), màn này phải TỰ thu về lead của người đó — chứ không lặng lẽ mở toàn
  // bộ danh sách cơ sở cho một vai chỉ được xem lead của mình.
  const xemTatCa = await checkPermission("leads:view-all");
  const themDuoc = await checkPermission("leads:create");
  const suaDuoc = await checkPermission("leads:edit");
  // 27/08 — quyền RIÊNG: chỉ Tư vấn viên đẩy lead trên phễu. Tách hẳn khỏi
  // `leads:edit` (Quản lý cơ sở / Marketing vẫn sửa hồ sơ + ghi chú như cũ).
  const doiTrangThaiDuoc = await checkPermission("leads:change-status");
  const xoaDuoc = await checkPermission("leads:delete");
  // Quyền XUẤT tách khỏi quyền XEM. Giấu nút chỉ là chuyện giao diện — đường
  // `/api/admin/leads/export` tự gác lại bằng chính quyền này.
  const xuatDuoc = await checkPermission("leads:export");
  const phanCongDuoc = await checkPermission("leads:assign");
  const chotDuoc =
    (await checkPermission("students:create")) && (await checkPermission("enrollments:create"));

  // Che PII ở SERVER cho actor thiếu quyền — chặn rò qua gói RSC, không chỉ giấu
  // bằng CSS. Hai điều kiện và cả hai đều cần: quyền `leads:view-pii`, VÀ không bị
  // DENY cấp trường `phone` từ grant nhóm (US-03 · TS-02).
  const xemDuocPii = await canViewLeadPii();
  const { fieldMask } = await checkPermissionDetail("leads:view-pii");
  const quyen: QuyenDocLead = {
    xemTatCa,
    xemDuocPii,
    timDuocSdt: xemDuocPii && !fieldMask.includes("phone"),
  };

  const sp = await searchParams;
  const loc = docBoLocLead(sp);
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const { base, chinh } = dungWhereLead({ userId: session.user.id, loc, quyen });

  const [demDaDangKy, mucLoc] = await Promise.all([
    demLeadDaDangKy(actor, base),
    docMucLocLead(actor, xemTatCa),
  ]);

  // Tuỳ chọn cột THEO TỪNG NGƯỜI. `UserTablePreference` không mang `centerId` nên
  // `scopedDb` là pass-through (cố ý — sở thích cá nhân không phải dữ liệu theo
  // đơn vị). Khoá bảng dùng chung với khu quản trị: một người chỉnh cột ở bên nào
  // thì bên kia theo đúng như vậy — đó là điều họ mong đợi, không phải trôi lệch.
  //
  // ⚠️ Che PII KHÔNG phụ thuộc cấu hình này: dữ liệu đã qua `maskLeadPiiFields`,
  // nên bật cột SĐT/email lên mà thiếu quyền thì vẫn ra bản đã che.
  const cauHinhCot = await sdb.userTablePreference.findUnique({
    where: { userId_tableKey: { userId: session.user.id, tableKey: LEAD_TABLE_KEY } },
    select: { columns: true },
  });
  const boCot = resolveColumnLayout(LEAD_TABLE_COLUMNS, cauHinhCot?.columns);

  const bang =
    loc.cheDo === "table"
      ? await docTrangBangLead({ actor, where: chinh, loc, quyen })
      : null;
  const kanban =
    loc.cheDo === "kanban" ? await docTheKanbanLead({ actor, where: chinh, quyen }) : null;
  const tong = bang?.tong ?? kanban?.tong ?? 0;

  /** Dựng URL giữ nguyên bộ lọc khi đổi tab hoặc đổi chế độ xem. */
  function duong(doi: { cheDo?: "table" | "kanban"; trangThai?: string | null }): string {
    const u = new URLSearchParams();
    const cheDo = doi.cheDo ?? loc.cheDo;
    if (cheDo === "kanban") u.set("view", "kanban");
    // Giữ lựa chọn số dòng — mất nó là mỗi lần đổi tab lại về 20.
    if (loc.soDong !== SO_DONG_MAC_DINH) u.set("size", String(loc.soDong));
    if (loc.q) u.set("q", loc.q);
    if (loc.coSoId) u.set("centerId", loc.coSoId);
    if (loc.saleId) u.set("assignedToId", loc.saleId);
    if (loc.nguon) u.set("source", loc.nguon);
    if (loc.tuNgay) u.set("dateFrom", loc.tuNgay);
    if (loc.denNgay) u.set("dateTo", loc.denNgay);
    // ⚠️ Khác bản admin một chút, có chủ đích: nút chuyển chế độ xem của bản admin
    // KHÔNG mang theo `status`, nên bấm "Kanban" rồi bấm "Bảng" là mất luôn tab
    // "Đã đăng ký" đang đứng. Ở đây `status` sống sót vòng đi-về. Không có tác dụng
    // phụ: truy vấn kanban vẫn bỏ qua vế trạng thái (hiện đủ mười cột), và hai tab
    // chỉ sáng ở chế độ bảng.
    const tt = doi.trangThai === undefined ? loc.trangThai : doi.trangThai;
    if (tt) u.set("status", tt);
    const qs = u.toString();
    return qs ? `/sale/leads?${qs}` : "/sale/leads";
  }

  // Tệp xuất mang THEO CẢ bộ lọc đang hiện (cơ sở, sale, nguồn, khoảng ngày…),
  // không chỉ trạng thái + từ khoá. Bỏ `page`/`size`/`view`: đó là chuyện phân
  // trang trên màn, tệp xuất trọn bộ lọc.
  const thamSoXuat = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v && !["page", "size", "view"].includes(k)) thamSoXuat.set(k, String(v));
  }
  const duongXuat = `/api/admin/leads/export${thamSoXuat.toString() ? `?${thamSoXuat}` : ""}`;

  const dangOTabDaDangKy = loc.cheDo === "table" && loc.trangThai === "DA_DANG_KY";
  const lopTab = (dangDung: boolean) =>
    cn(
      "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
      dangDung
        ? "border-[color:var(--primary)] text-[color:var(--primary-ink)]"
        : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
    );
  const lopCheDo = (dangDung: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 px-3 text-sm font-medium transition-colors",
      dangDung
        ? "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]"
        : "bg-card text-muted-foreground hover:bg-[color:var(--surface-chim)]",
    );

  return (
    // Bảng lead có thể bật tới 13 cột nên trần rộng hơn màn "Khách của tôi".
    // Bề rộng theo NỘI DUNG chứ không theo trần của trang.
    <KhungDuLieu className="max-w-[100rem]">
      <KhungDuLieu.Dau
        ten="Danh sách Lead"
        mo={
          tong > 0
            ? `Tổng ${tong} lead${
                // Điều kiện là "hiện ÍT HƠN tổng", không phải "đã chạm trần": nạp
                // đúng 500 trên tổng 500 là hiện đủ, nói "hiển thị 500 mới nhất"
                // lúc đó là doạ người dùng có dữ liệu bị giấu trong khi không có.
                kanban && kanban.the.length < kanban.tong
                  ? ` (hiển thị ${kanban.the.length} mới nhất)`
                  : ""
              }`
            : "Chưa có lead nào"
        }
        hanhDong={
          themDuoc ? (
            <>
              {/* Đường `/api/...` KHÔNG bị `decideRoute` viết lại (`isInfraPath`),
                  nên hai lối tải/xuất chạy đúng trên host Sale. */}
              <a href="/api/admin/templates/leads" download="mau-lead.xlsx" className={NUT_PHU}>
                Tải file mẫu
              </a>
              {/* ⚠️ NỢ ĐÃ BIẾT — `/leads/import` và `/leads/new` là đường của KHU
                  QUẢN TRỊ; trên host Sale chúng bị viết lại thành `/sale/leads/...`
                  → 404 (lý do đầy đủ ở `_components/bang-leads.tsx`). Bản mount cũ
                  cũng vậy: giữ nguyên là KHÔNG tạo hồi quy. Vá thật = dựng màn
                  tương ứng trong `app/(sale)/sale/leads/**`, tức THÊM MÀN — phải
                  hỏi chủ dự án.
                  ⚠️ `/sale/nhap-khach-hang` KHÔNG phải bản Sale của "+ Thêm lead":
                  đó là biểu mẫu nhập nhanh (`QuickLeadForm` + `ingestIntakeLead`),
                  ít trường hơn hẳn form tạo lead đầy đủ. Đổi đích sang đó là đổi
                  NỘI DUNG màn, không phải sửa một đường hỏng. */}
              <Link href="/leads/import" className={NUT_PHU}>
                <FileSpreadsheet aria-hidden="true" className="size-4" />
                Import Excel
              </Link>
              {xemTatCa ? (
                // Màn này ĐÃ CÓ bản Sale (`/sale/chot-hang-loat`) — trỏ thẳng vào
                // bản Sale thay vì đường `/leads/bulk-convert` của khu quản trị.
                <Link href="/sale/chot-hang-loat" className={NUT_PHU}>
                  Chốt hàng loạt
                </Link>
              ) : null}
              <Link
                href="/leads/new"
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-medium",
                  "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
                  "transition-colors hover:bg-[color:var(--primary-dark)]",
                  "focus-visible:outline-none focus-visible:ring-2",
                  "focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2",
                )}
              >
                <Plus aria-hidden="true" className="size-4" />
                Thêm lead
              </Link>
            </>
          ) : null
        }
      />

      {/* Tầng điều hướng: tab trạng thái bên trái, chế độ xem + công cụ bảng bên
          phải. Một tầng riêng giữa DANH TÍNH màn và CÔNG CỤ lọc — bản admin để ba
          tầng này trôi trên nền trang nên mắt phải tự đoán ranh giới. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border px-5">
        <nav aria-label="Nhóm lead" className="-mb-px flex gap-1 overflow-x-auto">
          <Link
            href={duong({ cheDo: "table", trangThai: null })}
            aria-current={loc.cheDo === "table" && !loc.trangThai ? "page" : undefined}
            className={lopTab(loc.cheDo === "table" && !loc.trangThai)}
          >
            Tất cả
          </Link>
          <Link
            href={duong({ cheDo: "table", trangThai: "DA_DANG_KY" })}
            aria-current={dangOTabDaDangKy ? "page" : undefined}
            className={lopTab(dangOTabDaDangKy)}
          >
            Đã đăng ký
            <span
              className={cn(
                "ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                dangOTabDaDangKy
                  ? "bg-[color:var(--primary-soft)] text-[color:var(--primary-ink)]"
                  : "bg-[color:var(--surface-chim)] text-muted-foreground",
              )}
            >
              {demDaDangKy}
            </span>
          </Link>
        </nav>

        <div className="flex items-center gap-2 py-2">
          {/* Chuyển chế độ xem. Tím = "đang đứng ở đây", cùng ngôn ngữ với mục
              điều hướng đang chọn — KHÔNG mượn màu ngữ nghĩa nào. */}
          <div className="inline-flex overflow-hidden rounded-lg border border-border">
            <Link
              href={duong({ cheDo: "table" })}
              aria-current={loc.cheDo === "table" ? "page" : undefined}
              className={lopCheDo(loc.cheDo === "table")}
            >
              <Table2 aria-hidden="true" className="size-4" />
              Bảng
            </Link>
            <Link
              href={duong({ cheDo: "kanban" })}
              aria-current={loc.cheDo === "kanban" ? "page" : undefined}
              className={cn(lopCheDo(loc.cheDo === "kanban"), "border-l border-border")}
            >
              <Kanban aria-hidden="true" className="size-4" />
              Kanban
            </Link>
          </div>

          {/* Tuỳ chọn cột + xuất tệp CHỈ có nghĩa ở chế độ bảng. Tệp xuất cố ý dùng
              bộ cột cố định, không chạy theo tuỳ chọn hiển thị. */}
          {loc.cheDo === "table" ? (
            <>
              <ChonCotLead
                tableKey={LEAD_TABLE_KEY}
                dangHien={boCot.visible.map(bocCot)}
                dangAn={boCot.hidden.map(bocCot)}
                cheePii={!xemDuocPii}
              />
              {xuatDuoc ? (
                <a
                  href={duongXuat}
                  download
                  title="Xuất Excel danh sách lead đang lọc"
                  className={NUT_PHU}
                >
                  <Download aria-hidden="true" className="size-4" />
                  <span className="hidden sm:inline">Xuất Excel</span>
                </a>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <KhungDuLieu.Loc>
        <BoLocLeads
          cheDo={loc.cheDo}
          soDong={loc.soDong}
          q={loc.q ?? ""}
          trangThai={loc.trangThai ?? ""}
          coSoId={loc.coSoId ?? ""}
          saleId={loc.saleId ?? ""}
          nguon={loc.nguon ?? ""}
          tuNgay={loc.tuNgay ?? ""}
          denNgay={loc.denNgay ?? ""}
          danhSachCoSo={mucLoc.coSo}
          danhSachSale={mucLoc.sale}
          xemTatCa={xemTatCa}
          timDuocSdt={quyen.timDuocSdt}
        />
      </KhungDuLieu.Loc>

      {bang ? (
        <BangLeads
          dong={bang.dong}
          tong={bang.tong}
          trang={loc.trang}
          soDong={loc.soDong}
          cot={boCot.visible.map((c) => ({ key: c.key, label: c.label }))}
          suaDuoc={suaDuoc}
          doiTrangThaiDuoc={doiTrangThaiDuoc}
          xoaDuoc={xoaDuoc}
          nguoiDangXemId={session.user.id}
        />
      ) : null}

      {kanban ? (
        <KanbanLeads
          the={kanban.the}
          tong={kanban.tong}
          doiTrangThaiDuoc={doiTrangThaiDuoc}
          chotDuoc={chotDuoc}
          phanCongDuoc={phanCongDuoc}
          nguoiDangXemId={session.user.id}
        />
      ) : null}
    </KhungDuLieu>
  );
}
