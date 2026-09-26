// Thẻ "Ứng dụng kết nối" — danh sách client + form tạo mới (spec §5.5 thẻ 1). Server component.
import { adminTd, adminTh, adminTr } from "@/components/admin/ui/table";
import { EmptyState } from "@/components/admin/ui/states";
import { StatusPill } from "@/components/admin/ui/status-pill";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import type { HangClient } from "@/lib/agents/quan-tri/doc";
import { ngay, ngayGio, nhanTrangThai } from "./dinh-dang";
import { FormTaoClient } from "./form-tao-client";
import { NutClient } from "./nut-client";

export function TabUngDung({
  clients,
  vaiDichVu,
  coQuanLy,
  coDuyet,
  chanMa,
  homNay,
  hanToiDaNgay,
}: {
  clients: HangClient[];
  vaiDichVu: { code: string; name: string }[];
  coQuanLy: boolean;
  coDuyet: boolean;
  chanMa: string | null;
  homNay: string;
  hanToiDaNgay: number;
}) {
  const tenVai = new Map(vaiDichVu.map((v) => [v.code, v.name]));

  return (
    <div className="space-y-6">
      {clients.length === 0 ? (
        <EmptyState
          title="Chưa có ứng dụng kết nối nào"
          description={
            coQuanLy
              ? "Tạo ứng dụng ở form bên dưới. Mỗi agent chạy ngoài cần một ứng dụng riêng."
              : "Người giữ quyền quản lý cổng (Kỹ thuật) tạo ứng dụng cho từng agent."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <PhanTrangBang cuonNgang tenDonVi="ứng dụng">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th scope="col" className={adminTh}>Tên</th>
                  <th scope="col" className={adminTh}>Môi trường</th>
                  <th scope="col" className={adminTh}>Trạng thái</th>
                  <th scope="col" className={adminTh}>IP được phép</th>
                  <th scope="col" className={adminTh}>Vai dịch vụ</th>
                  <th scope="col" className={adminTh}>Hạn</th>
                  <th scope="col" className={adminTh}>Lần gọi cuối</th>
                  <th scope="col" className={adminTh}>Mật khẩu</th>
                  <th scope="col" className={adminTh}>Người tạo / duyệt</th>
                  <th scope="col" className={adminTh}>Lý do khoá</th>
                  <th scope="col" className={adminTh}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const tt = nhanTrangThai(c.trangThai, c.daHetHan);
                  return (
                    <tr key={c.id} className={adminTr}>
                      <td className={adminTd}>
                        <div className="font-semibold text-foreground">{c.ten}</div>
                        <div className="font-mono text-xs text-muted-foreground">{c.id}</div>
                      </td>
                      <td className={adminTd}>
                        <StatusPill tone={c.moiTruong === "LIVE" ? "brand" : "info"}>{c.moiTruong}</StatusPill>
                      </td>
                      <td className={adminTd}>
                        <StatusPill tone={tt.tone}>{tt.nhan}</StatusPill>
                      </td>
                      <td className={adminTd}>
                        <div className="flex flex-col gap-0.5 font-mono text-xs">
                          {c.ipDuocPhep.map((ip) => (
                            <span key={ip}>{ip}</span>
                          ))}
                        </div>
                      </td>
                      <td className={adminTd}>
                        {c.vaiDichVu.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {c.vaiDichVu.map((v) => (
                              <span key={v} title={v}>
                                {tenVai.get(v) ?? v}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className={adminTd}>{ngay(c.hetHan)}</td>
                      <td className={adminTd}>{ngayGio(c.lanGoiCuoi)}</td>
                      <td className={adminTd}>
                        {c.matKhau.soConSong === 0 ? (
                          <span className="text-muted-foreground">Chưa có</span>
                        ) : (
                          <div>
                            <div>{c.matKhau.soConSong} đang dùng được</div>
                            <div className="text-xs text-muted-foreground">
                              Hạn: {ngay(c.matKhau.hetHanGanNhat)}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className={adminTd}>
                        <div>{c.nguoiTao || "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          Duyệt: {c.nguoiDuyet ?? "chưa"}
                        </div>
                      </td>
                      <td className={adminTd}>
                        {c.lyDoKhoa ? (
                          <span className="block max-w-[16rem] truncate" title={c.lyDoKhoa}>
                            {c.lyDoKhoa}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className={adminTd}>
                        <NutClient
                          id={c.id}
                          ten={c.ten}
                          trangThai={c.trangThai}
                          daHetHan={c.daHetHan}
                          dungMoiTruong={c.dungMoiTruong}
                          coMatKhau={c.matKhau.soConSong > 0}
                          coQuanLy={coQuanLy}
                          coDuyet={coDuyet}
                          chanMa={chanMa}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </PhanTrangBang>
        </div>
      )}

      {coQuanLy && (
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <h2 className="mb-1 text-base font-semibold text-foreground">Tạo ứng dụng kết nối</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Mỗi ứng dụng có một tài khoản dịch vụ riêng mang vai đã chọn — agent chỉ đọc được những gì
            vai đó VÀ quyền cấp cùng cho phép.
          </p>
          <FormTaoClient vaiDichVu={vaiDichVu} homNay={homNay} hanToiDaNgay={hanToiDaNgay} chanMa={chanMa} />
        </section>
      )}
    </div>
  );
}
