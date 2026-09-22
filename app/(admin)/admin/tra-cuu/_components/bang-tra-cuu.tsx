"use client";

// Bảng tra cứu dùng chung cho ba khối của màn Tra cứu.
//
// Một component thay ba bảng gần giống nhau: ba bản sao là ba chỗ để quên bọc
// `<PhanTrangBang>`, và luật chung của repo là MỌI bảng dữ liệu đều phân trang.
//
// Cố ý "ngu": chỉ nhận chuỗi đã định dạng sẵn từ server. Định dạng tiền/ngày ở
// đây là mở đường cho ba khối hiển thị khác nhau.
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { cn } from "@/lib/utils";

export type DongTraCuu = {
  key: string;
  /** Ô đã là chuỗi hiển thị — server định dạng, client chỉ vẽ. */
  o: string[];
  /** Làm nhạt cả dòng (vd lớp đã hết chỗ) — vẫn hiện, chỉ lùi về sau mắt. */
  mo?: boolean;
};

export function BangTraCuu({
  cot,
  dong,
  canPhai,
  tenDonVi,
  khoaGhiNho,
}: {
  cot: string[];
  dong: DongTraCuu[];
  /** Cột nào căn phải (số tiền, số lượng). Thiếu = căn trái. */
  canPhai?: boolean[];
  tenDonVi: string;
  khoaGhiNho: string;
}) {
  return (
    <PhanTrangBang tenDonVi={tenDonVi} khoaGhiNho={khoaGhiNho}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            {cot.map((c, i) => (
              <th
                key={c}
                className={cn("pb-2 font-medium", canPhai?.[i] && "text-right")}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dong.map((d) => (
            <tr
              key={d.key}
              className={cn(
                "border-b border-border/50 last:border-0",
                d.mo && "text-muted-foreground",
              )}
            >
              {d.o.map((v, i) => (
                <td
                  key={i}
                  className={cn(
                    "py-2",
                    canPhai?.[i] ? "text-right tabular-nums" : "text-foreground",
                    d.mo && "text-muted-foreground",
                  )}
                >
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </PhanTrangBang>
  );
}
