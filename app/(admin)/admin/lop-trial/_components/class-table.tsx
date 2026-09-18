// app/(admin)/admin/lop-trial/_components/class-table.tsx — GĐ2.
//
// Bảng danh sách lớp trải nghiệm. SERVER Component: không state, không handler —
// phần tương tác duy nhất (huỷ lớp) nằm trong client component con.

import Link from "next/link";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import type { ClassRow, TrialClassStatusV2 } from "../_lib/types";
import { CancelClassButton } from "./cancel-class-button";

const STATUS_LABEL: Record<TrialClassStatusV2, string> = {
  OPEN: "Đang mở",
  RUNNING: "Đang chạy",
  COMPLETED: "Đã xong",
  CANCELLED: "Đã huỷ",
};

const STATUS_BADGE: Record<TrialClassStatusV2, string> = {
  OPEN: "bg-state-success-soft text-state-success-ink",
  RUNNING: "bg-state-info-soft text-state-info-ink",
  COMPLETED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-state-danger-soft text-state-danger-ink",
};

/** Lớp đã chốt sổ — không còn thao tác nào áp lên nó nữa. */
const TRANG_THAI_DA_DONG: ReadonlySet<TrialClassStatusV2> = new Set([
  "COMPLETED",
  "CANCELLED",
]);

/**
 * "YYYY-MM-DD" → "dd/MM/yyyy".
 *
 * ⚠️ Tự tách chuỗi, KHÔNG `new Date(s)`: chuỗi ngày trần được JS hiểu là UTC-midnight
 * rồi in ra theo múi giờ máy, nên máy ở múi âm sẽ lùi một ngày. Ở đây không có gì để
 * quy đổi — chuỗi vốn đã là ngày theo lịch VN mà server tính sẵn.
 */
function ngayVN(s: string): string {
  const [y, m, d] = s.split("-");
  return y && m && d ? `${d}/${m}/${y}` : s;
}

export function ClassTable({
  rows,
  canManage,
}: {
  rows: ClassRow[];
  canManage: boolean;
  // React 19 đã bỏ namespace JSX toàn cục khỏi @types/react ⇒ `JSX.Element` trần
  // không còn phân giải được, phải đi qua `React.JSX`.
}): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/*
        `overflow-x-auto` phải nằm NGOÀI PhanTrangBang: component đó đòi children là
        ĐÚNG MỘT `<table>` để tìm `<tbody>` mà cắt trang. Chèn một `<div>` vào giữa là
        rơi vào nhánh fail-safe — bảng vẫn hiện nhưng mất phân trang mà không báo gì.
      */}
      <div className="overflow-x-auto">
        <PhanTrangBang khoaGhiNho="lop-trial-danh-sach" tenDonVi="lớp">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Lớp</th>
                <th className="px-4 py-3 font-semibold">Sale</th>
                <th className="px-4 py-3 font-semibold">Học viên</th>
                <th className="px-4 py-3 font-semibold">Buổi kế tiếp</th>
                <th className="px-4 py-3 font-semibold">Số buổi</th>
                <th className="px-4 py-3 font-semibold">Trạng thái</th>
                <th className="px-4 py-3 font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    Chưa có lớp trải nghiệm nào.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const dongRoi = TRANG_THAI_DA_DONG.has(r.status);
                return (
                  <tr key={r.id} className="hover:bg-muted">
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link
                        href={`/lop-trial/${r.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {r.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {r.code}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {r.sale ? (
                        <>
                          <span className="text-foreground">{r.sale.ten}</span>
                          {r.sale.soSaleKhac > 0 && (
                            <span className="text-muted-foreground">
                              {" "}
                              +{r.sale.soSaleKhac}
                            </span>
                          )}
                          {/*
                            Lớp tạo trước 18/09/2026 không có người tạo, tên ở đây là SUY
                            từ Sale phụ trách lead của các con trong lớp. Nói ra chứ không
                            để người đọc tưởng đó là người tạo lớp (luật 12).
                          */}
                          {r.sale.suyTuLead && (
                            <div
                              className="text-xs text-muted-foreground"
                              title="Lớp tạo trước 18/09/2026 nên không lưu người tạo — tên này suy từ Sale phụ trách lead của các con trong lớp."
                            >
                              theo lead
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.hocVien.length === 0 ? (
                        <span className="text-muted-foreground">Chưa có</span>
                      ) : (
                        <>
                          {/*
                            Hiện 2 tên + "và N con nữa": cột này THAY cột "Sĩ số" nên phải
                            còn đọc ra được SỐ, mà không để một lớp 12 con đẩy bảng giãn
                            ngang trên điện thoại. `title` giữ đủ tên cho người cần tra.
                          */}
                          <span className="text-foreground" title={r.hocVien.join(", ")}>
                            {r.hocVien.slice(0, 2).join(", ")}
                          </span>
                          {r.hocVien.length > 2 && (
                            <span
                              className="text-muted-foreground"
                              title={r.hocVien.join(", ")}
                            >
                              {" "}
                              và {r.hocVien.length - 2} con nữa
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {r.nextSessionDate ? (
                        <span className="text-foreground">
                          {ngayVN(r.nextSessionDate)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          Chưa xếp buổi
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-foreground">
                      {r.sessionCount}
                      {r.configName ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({r.configName})
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[r.status]}`}
                      >
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {canManage && !dongRoi ? (
                        <CancelClassButton
                          trialClassId={r.id}
                          className="text-xs"
                        />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </PhanTrangBang>
      </div>
    </div>
  );
}
