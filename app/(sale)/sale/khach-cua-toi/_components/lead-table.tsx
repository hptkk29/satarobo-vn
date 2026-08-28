"use client";

// Bảng khách của tôi. Bọc `<PhanTrangBang>` theo luật chung của repo — mọi bảng
// dữ liệu đều phân trang, không màn nào đổ hết ra một trang.
//
// ── ĐỢT THIẾT KẾ LẠI 28/08/2026 ─────────────────────────────────────────────
// Bản trước có ba lỗi làm bảng khó quét, và cả ba đều là lỗi Ý NGHĨA chứ không
// phải lỗi thẩm mỹ:
//   1. Mười trạng thái vẽ bằng `<Badge variant="outline">` ⇒ MỘT màu tím nhạt.
//      Màu không mang tin nào; muốn biết dòng nào cần gọi phải đọc từng chữ.
//   2. `text-amber-600` tô cho MỌI dòng quá 3 ngày và MỌI khách chưa liên hệ ⇒
//      trên dữ liệu thật gần như cả bảng vàng khè, và màu vàng hết nghĩa.
//   3. Cột "Con" gần như luôn rỗng nên hiện một cột toàn dấu gạch — chiếm chỗ
//      ngang mà không mang tin gì.
// Nay: màu đi qua thang ngữ nghĩa (`lib/sale/trang-thai-khach.ts`), độ nguội có
// ba mức mà mức thường gặp nhất là KHÔNG TÔ GÌ, và tên con nằm dưới tên phụ
// huynh trong cùng một ô.
import Link from "next/link";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { StatusPill } from "@/components/admin/ui/status-pill";
import { KhungDuLieu } from "@/components/sale/ui/khung-du-lieu";
import { formatDateVN } from "@/lib/format/date";
import type { LeadStatus } from "@prisma/client";
import {
  toneTrangThaiKhach,
  toneDoNguoi,
  CHU_GIAI_DO_NGUOI,
} from "@/lib/sale/trang-thai-khach";

export type MyLeadRow = {
  id: string;
  parentName: string | null;
  phone: string | null;
  childName: string | null;
  status: string;
  statusLabel: string;
  source: string | null;
  createdAt: string;
  lastActivityAt: string | null;
  viecSapToi: { title: string; dueAt: string } | null;
};

/** Lớp chữ cho ba mức nguội. `null` ⇒ không thêm lớp nào — im lặng là mặc định. */
const LOP_DO_NGUOI: Record<"warning" | "danger", string> = {
  warning: "text-[color:var(--state-warning)]",
  danger: "text-[color:var(--state-danger)] font-medium",
};

export function MyLeadTable({
  rows,
  canhBaoCat,
}: {
  rows: MyLeadRow[];
  /**
   * Câu "còn N khách chưa hiện" khi truy vấn chạm trần 200 dòng; `null` = không cắt.
   *
   * PHẢI bày ra. `<PhanTrangBang>` cắt trang ở TẦNG HIỂN THỊ nên nó chỉ đếm được
   * số dòng đã nhận: thanh dưới bảng in "/ 200 khách" cho cả người có 237 khách.
   * Không có dòng này thì con số đó là một lời nói dối im lặng.
   */
  canhBaoCat: string | null;
}) {
  if (rows.length === 0) {
    return (
      <KhungDuLieu.Rong
        ten="Chưa có khách nào khớp bộ lọc"
        mo="Thử bỏ bớt điều kiện lọc, hoặc bật “Gồm khách đã đóng” để xem cả những khách đã kết thúc tư vấn."
      />
    );
  }

  return (
    <>
      {canhBaoCat ? (
        <p
          role="status"
          className="border-b border-border bg-[color:var(--state-warning-soft)] px-5 py-2.5 text-sm text-[color:var(--state-warning)]"
        >
          {canhBaoCat}
        </p>
      ) : null}

      <PhanTrangBang tenDonVi="khách" khoaGhiNho="sale-khach-cua-toi">
        <table className="bang-sale">
          <thead>
            <tr>
              <th scope="col">Phụ huynh</th>
              <th scope="col">Trạng thái</th>
              <th scope="col">Việc sắp tới</th>
              <th scope="col" className="o-so">
                Chạm gần nhất
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const nguoi = toneDoNguoi(r.lastActivityAt);
              return (
                <tr key={r.id}>
                  {/* Tên con gộp vào ô tên phụ huynh: nó là thuộc tính CỦA khách
                      này, không phải một trục để so sánh giữa các dòng — nên nó
                      không đáng một cột riêng, nhất là khi thường xuyên rỗng. */}
                  <td>
                    <Link
                      href={`/sale/khach-cua-toi/${r.id}`}
                      className="font-medium text-[color:var(--primary-ink)] underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                    >
                      {r.parentName || "(chưa có tên)"}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      {r.phone ? <span className="tabular-nums">{r.phone}</span> : null}
                      {r.phone && r.childName ? <span aria-hidden="true">·</span> : null}
                      {r.childName ? <span>con: {r.childName}</span> : null}
                    </div>
                  </td>

                  <td>
                    <StatusPill tone={toneTrangThaiKhach(r.status as LeadStatus)}>
                      {r.statusLabel}
                    </StatusPill>
                  </td>

                  {/* Cột duy nhất được xuống dòng — tên việc là câu tự do. */}
                  <td className="o-dai text-muted-foreground">
                    {r.viecSapToi ? (
                      <>
                        <span className="text-foreground">{r.viecSapToi.title}</span>
                        <span className="ml-1.5 text-xs">
                          hạn {formatDateVN(new Date(r.viecSapToi.dueAt))}
                        </span>
                      </>
                    ) : (
                      <span aria-hidden="true">—</span>
                    )}
                  </td>

                  <td className="o-so">
                    {r.lastActivityAt ? (
                      <span className={nguoi ? LOP_DO_NGUOI[nguoi] : "text-muted-foreground"}>
                        {formatDateVN(new Date(r.lastActivityAt))}
                      </span>
                    ) : (
                      // Khách chưa chạm lần nào là nhóm dễ rơi nhất — nói thẳng
                      // ra chứ đừng để một ô trống.
                      <span className={LOP_DO_NGUOI.danger}>chưa liên hệ</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </PhanTrangBang>

      <KhungDuLieu.Chan>{CHU_GIAI_DO_NGUOI}</KhungDuLieu.Chan>
    </>
  );
}
