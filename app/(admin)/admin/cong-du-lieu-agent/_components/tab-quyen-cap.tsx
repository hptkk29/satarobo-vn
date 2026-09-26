// Thẻ "Quyền cấp" — quyền (grant) theo từng ứng dụng + form cấp quyền mới (spec §5.5 thẻ 2).
// Server component.
import { adminTd, adminTh, adminTr } from "@/components/admin/ui/table";
import { EmptyState } from "@/components/admin/ui/states";
import { StatusPill } from "@/components/admin/ui/status-pill";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import type { HangClient } from "@/lib/agents/quan-tri/doc";
import { conThuHoiDuoc, ngay, nhanCoSo, nhanNhayCam, nhanTrangThai } from "./dinh-dang";
import { FormTaoGrant } from "./form-tao-grant";
import { NutThuHoiGrant } from "./nut-thu-hoi-grant";

export function TabQuyenCap({
  clients,
  congCu,
  maCoSo,
  coQuanLy,
  coDuyet,
  chanMa,
  homNay,
  hanDocNgay,
  hanXemGocNgay,
}: {
  clients: HangClient[];
  congCu: { ten: string; moTa: string; nhayCam: string }[];
  maCoSo: string[];
  coQuanLy: boolean;
  coDuyet: boolean;
  chanMa: string | null;
  homNay: string;
  hanDocNgay: number;
  hanXemGocNgay: number;
}) {
  const mucCongCu = new Map(congCu.map((c) => [c.ten, c]));
  const thuHoiDuoc = coQuanLy || coDuyet;
  const clientCapDuoc = clients
    .filter((c) => c.trangThai !== "REVOKED" && c.trangThai !== "REJECTED")
    .map((c) => ({
      id: c.id,
      ten: c.ten,
      moiTruong: c.moiTruong,
      nhanTrangThai: nhanTrangThai(c.trangThai, c.daHetHan).nhan,
    }));

  return (
    <div className="space-y-6">
      {coQuanLy && (
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <h2 className="mb-1 text-base font-semibold text-foreground">Cấp quyền mới</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Một quyền = một công cụ × các cơ sở × một hạn. Agent chỉ gọi được công cụ khi có quyền đang
            hoạt động VÀ vai dịch vụ của nó cũng cho phép.
          </p>
          <FormTaoGrant
            clients={clientCapDuoc}
            congCu={congCu}
            maCoSo={maCoSo}
            homNay={homNay}
            hanDocNgay={hanDocNgay}
            hanXemGocNgay={hanXemGocNgay}
            chanMa={chanMa}
          />
        </section>
      )}

      {clients.length === 0 ? (
        <EmptyState
          title="Chưa có ứng dụng kết nối nào"
          description="Tạo ứng dụng ở thẻ “Ứng dụng kết nối” trước, rồi mới cấp quyền cho nó."
        />
      ) : (
        clients.map((c) => {
          const tt = nhanTrangThai(c.trangThai, c.daHetHan);
          return (
            <section key={c.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">{c.ten}</h2>
                <StatusPill tone={c.moiTruong === "LIVE" ? "brand" : "info"}>{c.moiTruong}</StatusPill>
                <StatusPill tone={tt.tone}>{tt.nhan}</StatusPill>
                <span className="text-xs text-muted-foreground">{c.grants.length} quyền</span>
              </div>
              {c.grants.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                  Chưa có quyền nào — ứng dụng này chưa gọi được công cụ nào.
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  <PhanTrangBang cuonNgang tenDonVi="quyền">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <th scope="col" className={adminTh}>Công cụ</th>
                          <th scope="col" className={adminTh}>Cơ sở</th>
                          <th scope="col" className={adminTh}>Xem dữ liệu gốc</th>
                          <th scope="col" className={adminTh}>Hạn mức / ngày</th>
                          <th scope="col" className={adminTh}>Trạng thái</th>
                          <th scope="col" className={adminTh}>Hạn</th>
                          <th scope="col" className={adminTh}>Lý do</th>
                          <th scope="col" className={adminTh}>Người tạo / duyệt</th>
                          <th scope="col" className={adminTh}>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.grants.map((g) => {
                          const ttg = nhanTrangThai(g.trangThai, g.daHetHan);
                          const cc = mucCongCu.get(g.congCu);
                          const nc = cc ? nhanNhayCam(cc.nhayCam) : null;
                          return (
                            <tr key={g.id} className={adminTr}>
                              <td className={adminTd}>
                                <div className="font-mono text-sm text-foreground">{g.congCu}</div>
                                {nc ? (
                                  <StatusPill tone={nc.tone} className="mt-1">
                                    Nhạy cảm {nc.nhan.toLowerCase()}
                                  </StatusPill>
                                ) : (
                                  <span className="text-xs text-state-warning-ink">Không còn trong sổ công cụ</span>
                                )}
                              </td>
                              <td className={adminTd}>
                                <div className="flex flex-col gap-0.5">
                                  {g.coSo.map((m) => (
                                    <span key={m}>{nhanCoSo(m)}</span>
                                  ))}
                                </div>
                              </td>
                              <td className={adminTd}>
                                {g.xemDuLieuGoc ? (
                                  <StatusPill tone="danger">Có</StatusPill>
                                ) : (
                                  <span className="text-muted-foreground">Không</span>
                                )}
                              </td>
                              <td className={adminTd}>
                                {g.hanMucNgay === null ? (
                                  <span className="text-muted-foreground">Trần mặc định</span>
                                ) : (
                                  g.hanMucNgay.toLocaleString("vi-VN")
                                )}
                              </td>
                              <td className={adminTd}>
                                <StatusPill tone={ttg.tone}>{ttg.nhan}</StatusPill>
                              </td>
                              <td className={adminTd}>{ngay(g.hetHan)}</td>
                              <td className={adminTd}>
                                <span className="block max-w-[18rem] truncate" title={g.lyDo}>
                                  {g.lyDo}
                                </span>
                              </td>
                              <td className={adminTd}>
                                <div>{g.nguoiTao || "—"}</div>
                                <div className="text-xs text-muted-foreground">
                                  Duyệt: {g.nguoiDuyet ?? "chưa"}
                                </div>
                              </td>
                              <td className={adminTd}>
                                {thuHoiDuoc && conThuHoiDuoc(g.trangThai) ? (
                                  <NutThuHoiGrant id={g.id} congCu={g.congCu} tenClient={c.ten} />
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </PhanTrangBang>
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
