/**
 * Site Sale — hai khối về LEAD của màn `/sale/dashboard`:
 *   · "Lead của tôi theo giai đoạn"  (phễu hiện tại)
 *   · "Phễu lead theo tuần"          (8 tuần gần nhất)
 *
 * ── VÌ SAO KHÔNG CÓ BIỂU ĐỒ Ở ĐÂY ──────────────────────────────────────────
 * Bản admin vẽ khối thứ hai bằng `<BarChart>` (`@/components/charts/bar-chart`).
 * Trên site Sale điều đó KHÔNG làm được, và không phải vì thiếu thư viện:
 * ESLint chặn cứng `@/components/charts/*` và `recharts` trong `app/(sale)/**`
 * lẫn `components/sale/**` (`eslint.config.mjs`, khối "app/(sale)/**"). Site Sale
 * chịu luật "shadcn THUẦN" giống site giáo viên — Recharts là ADMIN only theo
 * `.claude/rules/ui-libraries.md`. Đừng "vá" bằng cách xin ngoại lệ lint.
 *
 * Nên hai khối này diễn đạt lại bằng DANH SÁCH + số:
 *   · Phễu hiện tại → danh sách bậc, mỗi bậc bấm được sang đúng bộ lọc.
 *   · 8 tuần        → bảng số, kèm một thanh tỉ lệ vẽ bằng chiều rộng CSS.
 *
 * Thanh tỉ lệ KHÔNG phải trang trí và cũng không phải "biểu đồ mini": nó giữ lại
 * đúng thông tin mà cột của biểu đồ mang mà con số không mang — **tuần nào nhiều
 * hơn tuần nào**. Bỏ hẳn nó đi là bản Sale MẤT nội dung so với bản admin, mà đợt
 * này chốt là "giữ nguyên 100% nội dung, chỉ đổi cách bày".
 *
 * Màu của thanh là tím thương hiệu — nó là một PHÉP ĐO, không phải nhãn trạng
 * thái, nên không phạm luật "trạng thái không được mượn tone brand".
 *
 * ── VÌ SAO PHỄU HIỆN TẠI KHÔNG TÔ MÀU TỪNG BẬC ─────────────────────────────
 * Bản admin nhuộm mỗi bậc một màu bằng `LEAD_STATUS_BADGE` — mười class màu rời
 * của Tailwind (`bg-sky-100`…), đúng thứ `DESIGN.md §1` cấm và
 * `lib/sale/ky-luat-mau.test.ts` canh. Nhưng kể cả đổi sang thang ngữ nghĩa thì
 * vẫn sai: mười dòng đều có nhãn màu là **tô màu cả một cột**, và màu hết mang
 * tin. Chữ đã in ra tên giai đoạn rồi; ở đây số mới là thứ đáng đọc.
 */
import Link from "next/link";
import { TieuDeNhom } from "@/components/sale/ui/dai-so-lieu";
import type { OGiaiDoan, ODongTuan } from "@/lib/sale/dashboard";
import { LOP_KHOI } from "./khoi";

export function KhoiPheuHienTai({ giaiDoan }: { giaiDoan: OGiaiDoan[] }) {
  return (
    <section className={LOP_KHOI}>
      <TieuDeNhom>Lead của tôi theo giai đoạn</TieuDeNhom>
      <ul className="mt-2 grid gap-x-6 sm:grid-cols-2">
        {giaiDoan.map((g) => (
          <li key={g.trangThai}>
            <Link
              href={`/sale/leads?status=${g.trangThai}`}
              className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1.5 transition-colors hover:text-[color:var(--primary-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--primary)]/40"
            >
              <span className="truncate text-sm">{g.nhan}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{g.soLuong}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function KhoiPheuTheoTuan({ tuan }: { tuan: ODongTuan[] }) {
  // Mốc để quy chiếu chiều rộng thanh. `|| 1` chặn chia cho 0 khi cả 8 tuần đều
  // rỗng — không có nó thì tuần nào cũng ra `NaN%` và mọi thanh biến mất.
  const dinh = Math.max(1, ...tuan.map((t) => t.moi));

  return (
    <section className={LOP_KHOI}>
      <TieuDeNhom>Phễu lead theo tuần</TieuDeNhom>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Lead mới vs đã chuyển đổi mỗi tuần (8 tuần gần nhất), tính trên khách được giao
        cho bạn.
      </p>

      <ul className="mt-3 space-y-2">
        {tuan.map((t) => (
          <li key={t.nhan} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="tabular-nums text-muted-foreground">{t.nhan}</span>
              <span className="tabular-nums">
                <span className="font-semibold">{t.moi}</span>
                <span className="text-muted-foreground"> mới · </span>
                <span className="font-semibold">{t.chuyenDoi}</span>
                <span className="text-muted-foreground"> chuyển đổi</span>
              </span>
            </div>
            {/* Thanh lồng nhau chứ không xếp cạnh nhau: "chuyển đổi" là TẬP CON
                của "mới", nên vẽ nó nằm TRONG mới mới đúng quan hệ. Hai cột cạnh
                nhau (như biểu đồ cột của bản admin) dễ đọc nhầm thành hai đại
                lượng độc lập cộng lại. */}
            <div
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--surface-chim)]"
              aria-hidden
            >
              <div
                className="h-full rounded-full bg-[color:var(--primary-soft-hover)]"
                style={{ width: `${(t.moi / dinh) * 100}%` }}
              >
                <div
                  className="h-full rounded-full bg-[color:var(--primary)]"
                  style={{ width: t.moi > 0 ? `${(t.chuyenDoi / t.moi) * 100}%` : "0%" }}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
