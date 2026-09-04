/**
 * Site Sale — màn "Chuyển lead liên cơ sở" (báo cáo theo tháng).
 *
 * ══ BẢN ĐÔI CỦA `app/(admin)/admin/leads/bao-cao-chuyen/page.tsx` ═══════════
 *
 * ── Vì sao tồn tại ──────────────────────────────────────────────────────────
 * Tới 04/09/2026 tệp này chỉ là một lớp bọc `<AdminTransferReportPage>`. Chủ dự
 * án chốt ngày đó rằng các màn site Sale phải TÁCH BẢN RIÊNG: họ muốn thiết kế
 * lại site Sale mà KHÔNG đụng một pixel nào của khu quản trị, nơi 9 vai đang làm
 * việc hằng ngày. Rủi ro trôi lệch đã được nêu rõ; chủ dự án vẫn chọn đường này.
 *
 * NỘI DUNG GIỮ NGUYÊN 100% — sáu cột đúng thứ tự đúng nhãn (Lead · Chuyển ·
 * Người chuyển · Lý do / bàn giao · Kết quả · Ngày), bốn ô số liệu, câu rỗng
 * nguyên văn, và hợp đồng URL `?month=YYYY-MM`.
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * 1. Bốn thẻ số rời → MỘT dải `DaiSoLieu` liền chia ô bằng đường kẻ dọc. Lý do
 *    đầy đủ ở `components/sale/ui/dai-so-lieu.tsx`: bốn thẻ rời nổi trên nền
 *    trang bắt mắt quyết định bốn lần "đây có phải một khối không".
 * 2. Số `text-2xl font-bold` → `text-xl` của dải. Số quá to là thứ đã làm
 *    `955.563.000đ` tràn thẻ ở admin (DESIGN.md §3).
 * 3. Bảng gõ class từng ô → `.bang-sale` của `sale.css` (mật độ nằm ở CSS thì
 *    bảng MỚI tự đúng), cột "Kết quả" dùng `<StatusPill>` thay hai `<span>` gõ
 *    tay chuỗi màu.
 *
 * ⚠️ MÀU — hai chỗ CỐ Ý bỏ màu của bản admin:
 *    · Ô "Đã chốt" ở admin tô xanh (`tone="ok"`) và ba ô kia tô tím
 *      (`text-primary`). Trên site Sale tím là màu của NÚT và MỤC ĐANG ĐỨNG; cho
 *      nó thêm nghĩa "một con số nào đó" là hỏng cả hai nghĩa
 *      (`lib/sale/trang-thai-khach.ts`). Còn xanh cho một chỉ số LUÔN hiện là
 *      trang trí: nó không đòi ai làm gì. Số về màu chữ thường.
 *    · Cột "Kết quả" thì VẪN có màu — ở đó màu mang tin thật (chốt / chưa) và
 *      hai giá trị trộn lẫn nhau trong cùng một cột nên mắt quét được.
 *
 * ⚠️ Cổng quyền `chanNeuThieuQuyen` chạy TRƯỚC: bản admin thiếu quyền thì
 *    `redirect("/leads")`, mà trên host Sale màn đó nằm ở `/sale/leads` nên
 *    đường trần là 404 (lý do đầy đủ ở `lib/sale/cong-trang.tsx`). Bài kiểm
 *    `lib/auth/page-gates.test.ts` cũng đòi đúng lời gọi này.
 *
 * Truy vấn + tính toán ở `lib/sale/chuyen-lead-lien-cs.ts` (sổ nợ trôi lệch ghi
 * ở đầu tệp đó). PII che TRÊN MÁY CHỦ, trong chính hàm đó.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftRight, ChevronLeft, ChevronRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { canViewLeadPii } from "@/lib/auth/check-permission";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { DaiSoLieu, type OSoLieu } from "@/components/sale/ui/dai-so-lieu";
import { StatusPill } from "@/components/admin/ui/status-pill";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { chanNeuThieuQuyen } from "@/lib/sale/cong-trang";
import { formatDateVN } from "@/lib/format/date";
import { layBaoCaoChuyenLead } from "@/lib/sale/chuyen-lead-lien-cs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chuyển lead liên cơ sở | Tư vấn tuyển sinh" };

/**
 * ⚠️ NỢ ĐÃ BIẾT — MÀN CHI TIẾT LEAD CHƯA CÓ TRÊN HOST SALE.
 *
 * Bản admin trỏ `/leads/{id}`: clean URL của host quản trị, nơi `decideRoute`
 * viết lại thành `/admin/leads/{id}`. Trên `sale.satarobo.vn` luật cuối của
 * nhánh Sale là `rewrite "/sale" + pathname` ⇒ `/sale/leads/{id}`, mà ở đó mới
 * chỉ có `page.tsx` chứ chưa có `[id]` — **404**.
 *
 * Giữ nguyên đường dẫn cũ là CỐ Ý, hai lý do:
 *   · Đổi sang `/sale/khach-cua-toi/{id}` chỉ là DỜI CHỖ VỠ: màn đó cố tình trả
 *     `notFound()` cho lead không phải khách của người đang xem, mà báo cáo này
 *     đầy lead đã chuyển đi cho người khác.
 *   · Ngày ai đó dựng `app/(sale)/sale/leads/[id]/page.tsx` thì liên kết này TỰ
 *     chạy đúng qua rewrite, không phải sửa lại chỗ nào.
 * Đã báo lại cho chủ dự án; dựng thêm màn nằm ngoài phạm vi đợt tách này.
 */
const duongChiTietLead = (id: string) => `/leads/${id}`;

interface Props {
  searchParams: Promise<{ month?: string }>;
}

export default async function SaleChuyenLeadLienCsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fsale%2Fchuyen-lead-lien-cs");

  const chan = await chanNeuThieuQuyen(
    "/sale/chuyen-lead-lien-cs",
    "Chuyển lead liên cơ sở",
  );
  if (chan) return chan;

  const actor = await resolveActor(session.user.id);
  const hienPii = await canViewLeadPii();
  const sp = await searchParams;
  const bc = await layBaoCaoChuyenLead({
    actor,
    thamSoThang: sp.month,
    hienPii,
  });

  const oSoLieu: OSoLieu[] = [
    { nhan: "Tổng chuyển", soLuong: bc.tong },
    ...bc.huongDongNhat.map(([huong, dem]) => ({ nhan: huong, soLuong: dem })),
    {
      nhan: "Đã chốt",
      soLuong: bc.soDaChot,
      // Bản admin in "3/17" trong một ô. Cùng hai con số, nhưng tách mẫu số
      // xuống dòng phụ thì con số chính vẫn đọc được bằng cùng một nhịp mắt với
      // ba ô kia — "3/17" đứng cạnh "17" là hai định dạng trong một dải.
      phu: `trên ${bc.tong} lượt chuyển`,
    },
  ];

  const duongThang = (m: string) => `/sale/chuyen-lead-lien-cs?month=${m}`;
  const lopNutThang =
    "inline-flex size-8 items-center justify-center rounded-lg border border-border " +
    "text-muted-foreground transition-colors hover:bg-[color:var(--surface-chim)] " +
    "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-[color:var(--primary)]/35";

  return (
    <div className="max-w-[76rem]">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
            <ArrowLeftRight
              aria-hidden="true"
              className="size-5 shrink-0 text-[color:var(--primary-ink)]"
            />
            Chuyển lead liên cơ sở
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {bc.toanHeThong ? "Toàn hệ thống" : "Lead vào/ra cơ sở của bạn"} · tháng{" "}
            {bc.thang}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-sm">
          <Link
            href={duongThang(bc.thangTruoc)}
            aria-label={`Tháng ${bc.thangTruoc}`}
            className={lopNutThang}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Link>
          <span className="font-semibold tabular-nums text-foreground">{bc.thang}</span>
          <Link
            href={duongThang(bc.thangSau)}
            aria-label={`Tháng ${bc.thangSau}`}
            className={lopNutThang}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <DaiSoLieu o={oSoLieu} />
      </div>

      <div className="mt-4">
        <KhungDuLieu>
          {bc.dong.length === 0 ? (
            <KhungDuLieu.Rong ten="Không có lead chuyển liên cơ sở trong tháng này." />
          ) : (
            <PhanTrangBang cuonNgang tenDonVi="lượt chuyển" khoaGhiNho="sale-chuyen-lead">
              <table className="bang-sale">
                <thead>
                  <tr>
                    <th scope="col">Lead</th>
                    <th scope="col">Chuyển</th>
                    <th scope="col">Người chuyển</th>
                    <th scope="col">Lý do / bàn giao</th>
                    <th scope="col">Kết quả</th>
                    <th scope="col" className="o-so">
                      Ngày
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bc.dong.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link
                          href={duongChiTietLead(r.leadId)}
                          className="font-medium text-[color:var(--primary-ink)] underline-offset-2 hover:underline"
                        >
                          {r.tenPhuHuynh}
                        </Link>
                        {r.sdt ? (
                          <span className="block text-xs tabular-nums text-muted-foreground">
                            {r.sdt}
                          </span>
                        ) : null}
                      </td>

                      <td className="font-medium text-foreground">
                        {r.tuCoSo} → {r.denCoSo}
                      </td>

                      <td className="text-muted-foreground">{r.nguoiChuyen}</td>

                      {/* Ghi chú bàn giao là trường TỰ DO, có phiếu dài cả đoạn.
                          Chặn bề rộng + cắt bằng dấu ba chấm, đọc đủ qua `title`
                          — y như bản admin. CỐ Ý không dùng lớp `o-dai` của
                          `sale.css`: lớp đó CHO PHÉP xuống dòng, mà một ô cao ba
                          dòng kéo cả hàng lên theo và phá mật độ 44px của bảng. */}
                      <td className="max-w-[22rem] truncate text-muted-foreground" title={r.lyDo}>
                        {r.lyDo}
                      </td>

                      <td>
                        {r.daChot ? (
                          <StatusPill tone="success">Đã chốt</StatusPill>
                        ) : (
                          <StatusPill tone="muted">Chưa</StatusPill>
                        )}
                      </td>

                      <td className="o-so text-muted-foreground">
                        {formatDateVN(r.ngayTao)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PhanTrangBang>
          )}
        </KhungDuLieu>
      </div>
    </div>
  );
}
