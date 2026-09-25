// Thẻ "Nhật ký gọi" — 100 lượt gọi mới nhất theo bộ lọc (spec §5.5 thẻ 4). Server component.
//
// Bộ lọc là một <form method="get"> thuần: lọc = đổi URL (`client`, `chiLoi=1`,
// `batThuong=1`), trang đọc searchParams rồi gọi `docNhatKy`. Không cần JS phía client.
import Link from "next/link";
import { adminTd, adminTh, adminTr } from "@/components/admin/ui/table";
import { EmptyState } from "@/components/admin/ui/states";
import { StatusPill } from "@/components/admin/ui/status-pill";
import { Button } from "@/components/ui/button";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import type { HangNhatKy } from "@/lib/agents/quan-tri/doc";
import { LOP_O_NHAP, ngayGio, nhanCoSo } from "./dinh-dang";

export function TabNhatKy({
  dong,
  clients,
  loc,
}: {
  dong: HangNhatKy[];
  clients: { id: string; ten: string }[];
  loc: { clientId: string; chiLoi: boolean; chiBatThuong: boolean };
}) {
  const tenClient = new Map(clients.map((c) => [c.id, c.ten]));
  const dangLoc = loc.clientId !== "" || loc.chiLoi || loc.chiBatThuong;

  return (
    <div className="space-y-4">
      {/* `key` theo bộ lọc: bấm "Bỏ lọc" là điều hướng phía client, ô uncontrolled KHÔNG tự đọc
          lại `defaultValue` (cùng họ bẫy `router.refresh()`) ⇒ phải dựng lại form. */}
      <form
        key={`${loc.clientId}|${loc.chiLoi ? 1 : 0}|${loc.chiBatThuong ? 1 : 0}`}
        method="get"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <input type="hidden" name="tab" value="nhat-ky" />
        <label className="block sm:w-64">
          <span className="mb-1 block text-sm font-semibold text-foreground">Ứng dụng</span>
          <select name="client" defaultValue={loc.clientId} className={LOP_O_NHAP}>
            <option value="">Tất cả</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ten}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-foreground sm:pb-2">
          <input type="checkbox" name="chiLoi" value="1" defaultChecked={loc.chiLoi} className="h-4 w-4 accent-primary" />
          Chỉ lượt bị từ chối / lỗi
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-foreground sm:pb-2">
          <input
            type="checkbox"
            name="batThuong"
            value="1"
            defaultChecked={loc.chiBatThuong}
            className="h-4 w-4 accent-primary"
          />
          Chỉ lượt bất thường
        </label>
        <div className="flex gap-2">
          <Button type="submit" size="sm">
            Lọc
          </Button>
          {dangLoc && (
            <Link
              href="/cong-du-lieu-agent?tab=nhat-ky"
              className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Bỏ lọc
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-muted-foreground">
        Nhật ký không chứa dữ liệu trả về. Hiện tối đa 100 lượt gọi mới nhất
        {dangLoc ? " khớp bộ lọc" : ""}.
      </p>

      {dong.length === 0 ? (
        <EmptyState
          title={dangLoc ? "Không có lượt gọi nào khớp bộ lọc" : "Chưa có lượt gọi nào"}
          description={
            dangLoc
              ? "Thử bỏ bớt điều kiện lọc."
              : "Khi agent gọi cổng (kể cả lượt bị từ chối), mỗi lượt sẽ hiện ở đây."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <PhanTrangBang cuonNgang tenDonVi="lượt gọi">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th scope="col" className={adminTh}>Thời điểm</th>
                  <th scope="col" className={adminTh}>Ứng dụng</th>
                  <th scope="col" className={adminTh}>Công cụ</th>
                  <th scope="col" className={adminTh}>Kết quả</th>
                  <th scope="col" className={`${adminTh} text-right`}>HTTP</th>
                  <th scope="col" className={`${adminTh} text-right`}>Số bản ghi</th>
                  <th scope="col" className={adminTh}>Đã che</th>
                  <th scope="col" className={adminTh}>Xem gốc</th>
                  <th scope="col" className={adminTh}>Cơ sở</th>
                  <th scope="col" className={adminTh}>IP</th>
                  <th scope="col" className={adminTh}>Bất thường</th>
                  <th scope="col" className={`${adminTh} text-right`}>Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {dong.map((r) => (
                  <tr key={r.id} className={adminTr}>
                    <td className={adminTd}>{ngayGio(r.luc)}</td>
                    <td className={adminTd}>
                      {r.clientId ? (
                        (tenClient.get(r.clientId) ?? <span className="font-mono text-xs">{r.clientId}</span>)
                      ) : (
                        <span className="text-muted-foreground">(không xác định)</span>
                      )}
                    </td>
                    <td className={`${adminTd} font-mono`}>{r.congCu}</td>
                    <td className={adminTd}>
                      <StatusPill tone={r.ketQua === "OK" ? "success" : "danger"}>{r.ketQua}</StatusPill>
                    </td>
                    <td className={`${adminTd} text-right tabular-nums`}>{r.http}</td>
                    <td className={`${adminTd} text-right tabular-nums`}>{r.soBanGhi.toLocaleString("vi-VN")}</td>
                    <td className={adminTd}>{r.daChe ? "Có" : "Không"}</td>
                    <td className={adminTd}>
                      {r.xemGoc ? (
                        <span className="font-semibold text-state-danger-ink">Có</span>
                      ) : (
                        <span className="text-muted-foreground">Không</span>
                      )}
                    </td>
                    <td className={adminTd}>
                      {r.coSo.length === 0 ? <span className="text-muted-foreground">—</span> : r.coSo.map(nhanCoSo).join(", ")}
                    </td>
                    <td className={`${adminTd} font-mono text-xs`}>{r.ip ?? "—"}</td>
                    <td className={adminTd}>
                      {r.batThuong ? (
                        <StatusPill tone="warning">Bất thường</StatusPill>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={`${adminTd} text-right tabular-nums`}>{r.thoiGianMs.toLocaleString("vi-VN")} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PhanTrangBang>
        </div>
      )}
    </div>
  );
}
