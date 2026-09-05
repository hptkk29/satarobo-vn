"use client";

/**
 * Site Sale — khối "Chốt kỳ từ tiền đã thu".
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/crm/commission/_components/chot-ky-form.tsx` ──
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * ⚠️ CHỈ NHÂN BẢN LỚP VỎ. Việc chốt kỳ vẫn do ĐÚNG một Server Action
 *    `chotKyHoaHongAction` của khu quản trị thực hiện — nơi có cổng
 *    `commission_periods:manage` và `chotKyHoaHong()` xoá-rồi-ghi-lại cả kỳ trong
 *    MỘT transaction. KHÔNG có phép tính hoa hồng nào ở tệp này; mọi con số hiển
 *    thị dưới đây đến thẳng từ `KetQuaChotKy` mà action trả về.
 *
 * GIỮ NGUYÊN 100%: tiêu đề, đoạn giải thích chính sách ("số tiền thực thu trong
 * tháng"…), nhãn ô kỳ, nhãn nút và trạng thái "Đang tính…", cả bốn con số của
 * khối kết quả, khối "Chưa chi được — tầng chưa có người hưởng" kèm danh sách cơ
 * sở còn thiếu, câu dài giải thích vì sao hệ thống KHÔNG tự đoán người hưởng,
 * câu "khách vãng lai", và cả câu dành cho người KHÔNG chốt kỳ được.
 *
 * ── ĐIỀU QUAN TRỌNG NHẤT CỦA MÀN NÀY KHÔNG PHẢI CÁI NÚT ────────────────────
 * Là khối treo: nó NÓI RA phần tiền KHÔNG chi được vì tầng chưa có người hưởng.
 * Nuốt con số đó đi thì kế toán chốt kỳ xong sẽ tưởng đã trả đủ 8%, trong khi
 * thực tế mới trả 5%. Đừng rút gọn khối đó cho "gọn màn hình".
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * Khối treo ở bản admin tô bằng `border-amber-500/50 bg-amber-500/10` — class màu
 * RỜI của Tailwind. Hệ thiết kế Sale cấm (`lib/sale/ky-luat-mau.test.ts` canh
 * đúng chỗ này): thang ngữ nghĩa nằm ở token `--state-*`, gõ `amber` là dựng
 * thang thứ hai và hai thang sẽ trôi lệch. Đổi sang `--state-warning`, cùng một
 * sắc độ, khác một nguồn.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { chotKyHoaHongAction } from "@/app/(admin)/admin/crm/commission/actions";
import type { KetQuaChotKy } from "@/lib/crm/commission-run";

/** Chép nguyên `NHAN_TANG` của bản admin. */
const NHAN_TANG: Record<string, string> = {
  QC: "Quảng cáo (QC)",
  SALE_ADMIN: "Sale Admin",
  SALE: "Sale",
  QL_TT: "Quản lý TT",
};

/**
 * ⚠️ NỢ ĐÃ BIẾT — màn "Người hưởng hoa hồng theo cơ sở" chưa có bản Sale.
 * `/crm/commission/nguoi-huong` là clean URL host quản trị; trên `sale.satarobo.vn`
 * luật cuối viết lại thành `/sale/crm/commission/nguoi-huong` → 404. Site Sale có
 * `/sale/crm` nhưng đó là màn KHÁC (chỉ số CRM), trỏ sang là đổi một liên kết 404
 * lấy một liên kết sai đích. Giữ nguyên (bản mount cũ hỏng y hệt); vá thật = dựng
 * màn tương ứng, việc THÊM MÀN, đã báo lại cho chủ dự án.
 */
const DUONG_NGUOI_HUONG = "/crm/commission/nguoi-huong";

/** Kỳ mặc định = THÁNG TRƯỚC (giờ VN): chốt kỳ luôn là chốt tháng đã đóng sổ. */
function kyThangTruoc(): string {
  const vn = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const y = vn.getUTCFullYear();
  const m = vn.getUTCMonth(); // 0-based ⇒ chính là tháng trước dạng 1-based
  const d = m === 0 ? { y: y - 1, m: 12 } : { y, m };
  return `${d.y}-${String(d.m).padStart(2, "0")}`;
}

/** Chép nguyên `tien()` của bản admin: KHÔNG khoảng trắng trước "đ". */
const tien = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

export function FormChotKy({ canChotKy }: { canChotKy: boolean }) {
  const router = useRouter();
  const [ky, setKy] = useState(kyThangTruoc());
  const [ketQua, setKetQua] = useState<KetQuaChotKy | null>(null);
  const [pending, start] = useTransition();

  function chot() {
    start(async () => {
      const res = await chotKyHoaHongAction(ky, `Chốt kỳ ${ky} qua UI`);
      if (res.ok) {
        setKetQua(res.ketQua);
        toast.success(`Đã chốt kỳ ${ky}: ${res.ketQua.soDong} dòng`);
        // `revalidatePath("/admin/crm/commission")` của action trỏ đường KHU QUẢN
        // TRỊ, không phủ `/sale/hoa-hong` → phải tự làm mới bảng bên dưới.
        router.refresh();
      } else {
        setKetQua(null);
        toast.error(res.error);
      }
    });
  }

  const treo = ketQua
    ? Object.entries(ketQua.chuaCoNguoiHuong).filter(([, v]) => v !== 0)
    : [];

  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground">Chốt kỳ từ tiền đã thu</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Hoa hồng tính trên <strong className="font-semibold text-foreground">số tiền thực thu trong tháng</strong> (không
        phải giá trị hợp đồng). Khoản hoàn tiền sinh dòng thu hồi âm ở{" "}
        <strong className="font-semibold text-foreground">tháng hoàn</strong>. Chốt lại một kỳ chưa duyệt là an
        toàn — hệ thống ghi đè cả kỳ, không cộng dồn.
      </p>

      {canChotKy ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Kỳ (tháng)</span>
            <input
              type="month"
              value={ky}
              onChange={(e) => setKy(e.target.value)}
              className={cn(
                "h-9 w-44 rounded-lg border border-border bg-card px-3 text-sm tabular-nums",
                "focus-visible:border-[color:var(--primary)] focus-visible:outline-none",
                "focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/25",
              )}
            />
          </label>
          <button
            type="button"
            onClick={chot}
            disabled={pending || !/^\d{4}-\d{2}$/.test(ky)}
            className={cn(
              "h-9 shrink-0 rounded-lg px-4 text-sm font-medium transition-colors",
              "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
              "hover:bg-[color:var(--primary-dark)] disabled:opacity-50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2",
            )}
          >
            {pending ? "Đang tính…" : "Chốt kỳ"}
          </button>
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-border bg-card p-2.5 text-sm text-muted-foreground">
          Bạn xem được bảng hoa hồng nhưng không chốt/duyệt kỳ được — kỳ hoa hồng là kỳ
          của TOÀN CÔNG TY, chỉ kế toán Hội sở và quản trị hệ thống chốt được. Cần chốt
          kỳ thì báo kế toán Hội sở.
        </p>
      )}

      {ketQua ? (
        <div className="mt-3 space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>
              Bút toán thực thu:{" "}
              <strong className="font-semibold tabular-nums">{ketQua.soButToan}</strong>
            </span>
            <span>
              Số dòng: <strong className="font-semibold tabular-nums">{ketQua.soDong}</strong>
            </span>
            <span>
              Tổng hoa hồng:{" "}
              <strong className="font-semibold tabular-nums">{tien(ketQua.tongTien)}</strong>
            </span>
            {ketQua.tongThuHoi !== 0 ? (
              <span className="text-[color:var(--state-danger)]">
                Thu hồi do hoàn tiền:{" "}
                <strong className="font-semibold tabular-nums">{tien(ketQua.tongThuHoi)}</strong>
              </span>
            ) : null}
          </div>

          {treo.length > 0 ? (
            <div className="rounded-lg border border-state-warning-soft bg-state-warning-soft/60 p-2.5">
              <p className="font-medium text-foreground">
                Chưa chi được — tầng chưa có người hưởng:
              </p>
              <ul className="ml-4 list-disc">
                {treo.map(([tang, v]) => (
                  <li key={tang}>
                    {NHAN_TANG[tang] ?? tang}:{" "}
                    <strong className="font-semibold tabular-nums">{tien(v as number)}</strong>
                  </li>
                ))}
              </ul>

              {ketQua.treoTheoCoSo.length > 0 ? (
                <>
                  <p className="mt-2 font-medium text-foreground">Cơ sở còn thiếu:</p>
                  <ul className="ml-4 list-disc">
                    {ketQua.treoTheoCoSo.map((t) => (
                      <li key={`${t.centerId ?? "none"}|${t.tier}`}>
                        {t.centerId
                          ? (ketQua.tenCoSo[t.centerId] ?? t.centerId)
                          : "Không rõ cơ sở (bút toán không quy được về cơ sở nào)"}{" "}
                        — {NHAN_TANG[t.tier] ?? t.tier}:{" "}
                        <strong className="font-semibold tabular-nums">{tien(t.amount)}</strong>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              <p className="mt-1 text-xs text-muted-foreground">
                Khai người phụ trách tại{" "}
                <Link
                  href={DUONG_NGUOI_HUONG}
                  className="font-medium text-[color:var(--primary-ink)] underline underline-offset-2"
                >
                  Người hưởng hoa hồng theo cơ sở
                </Link>{" "}
                rồi <strong className="font-semibold">chốt lại kỳ này</strong> — phần treo sẽ chảy vào bảng
                kê. Hệ thống cố ý KHÔNG tự đoán người hưởng: gán bừa là chuyển tiền thật
                vào tài khoản sai, và sai theo kiểu con số vẫn &quot;đẹp&quot; nên không
                ai soi ra. Dòng &quot;không rõ cơ sở&quot; thì phải sửa cơ sở của phiếu
                thu/đơn hàng trước.
              </p>
            </div>
          ) : null}

          {ketQua.thucThuKhongCoLead !== 0 ? (
            <p className="text-muted-foreground">
              Thực thu không quy được về phiếu nào (khách vãng lai):{" "}
              <strong className="font-semibold tabular-nums">
                {tien(ketQua.thucThuKhongCoLead)}
              </strong>{" "}
              — không sinh hoa hồng.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
