"use client";

// Bảng khách của tôi. Bọc `<PhanTrangBang>` theo luật chung của repo — mọi bảng
// dữ liệu đều phân trang, không màn nào đổ hết ra một trang.
import Link from "next/link";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { Badge } from "@/components/ui/badge";
import { formatDateVN } from "@/lib/format/date";

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

/** Bao lâu chưa chạm thì coi là đang nguội. Chỉ để NHẮC MẮT, không phải SLA. */
const NGAY_NGUOI = 3;

function daNguoi(lastActivityAt: string | null, createdAt: string): boolean {
  const moc = new Date(lastActivityAt ?? createdAt).getTime();
  return Date.now() - moc > NGAY_NGUOI * 86400_000;
}

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
  return (
    <div className="mt-4">
      {canhBaoCat ? (
        <p
          role="status"
          className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
        >
          {canhBaoCat}
        </p>
      ) : null}
      <PhanTrangBang tenDonVi="khách" khoaGhiNho="sale-khach-cua-toi">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="pb-2 font-medium">Phụ huynh</th>
              <th className="pb-2 font-medium">Con</th>
              <th className="pb-2 font-medium">Trạng thái</th>
              <th className="pb-2 font-medium">Việc sắp tới</th>
              <th className="pb-2 text-right font-medium">Chạm gần nhất</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const nguoi = daNguoi(r.lastActivityAt, r.createdAt);
              return (
                <tr key={r.id} className="border-b border-border/50 last:border-0 align-top">
                  <td className="py-2">
                    <Link
                      href={`/sale/khach-cua-toi/${r.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {r.parentName || "(chưa có tên)"}
                    </Link>
                    {r.phone ? (
                      <div className="text-xs tabular-nums text-muted-foreground">{r.phone}</div>
                    ) : null}
                  </td>
                  <td className="py-2 text-foreground">{r.childName || "—"}</td>
                  <td className="py-2">
                    <Badge variant="outline">{r.statusLabel}</Badge>
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {r.viecSapToi ? (
                      <>
                        {r.viecSapToi.title}
                        <div className="text-xs">hạn {formatDateVN(new Date(r.viecSapToi.dueAt))}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 text-right text-muted-foreground">
                    {r.lastActivityAt ? (
                      <span className={nguoi ? "text-amber-600 dark:text-amber-500" : undefined}>
                        {formatDateVN(new Date(r.lastActivityAt))}
                      </span>
                    ) : (
                      // Khách chưa chạm lần nào là nhóm dễ rơi nhất — nói thẳng
                      // ra chứ đừng để một ô trống.
                      <span className="text-amber-600 dark:text-amber-500">chưa liên hệ</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </PhanTrangBang>
    </div>
  );
}
