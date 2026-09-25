// Thẻ "Chờ duyệt" — ứng dụng + quyền đang PENDING (spec §5.5 thẻ 3). Server component.
//
// Trình bày dạng THẺ, không dạng bảng: người duyệt cần đọc trọn LÝ DO trước khi bấm, mà cắt
// chữ trong ô bảng là giấu đúng thứ họ phải đọc.
import { StatusPill } from "@/components/admin/ui/status-pill";
import { EmptyState } from "@/components/admin/ui/states";
import type { HangClient, HangGrant } from "@/lib/agents/quan-tri/doc";
import { cn } from "@/lib/utils";
import { ngay, ngayGio, nhanCoSo, nhanNhayCam } from "./dinh-dang";
import { NutQuyetDinh } from "./nut-quyet-dinh";

function KhuVucQuyetDinh({
  laNguoiTao,
  coDuyet,
  children,
}: {
  laNguoiTao: boolean;
  coDuyet: boolean;
  children: React.ReactNode;
}) {
  if (laNguoiTao) {
    return (
      <p className="text-sm font-semibold text-state-warning-ink">Bạn tạo mục này — cần người khác duyệt.</p>
    );
  }
  if (!coDuyet) {
    return <p className="text-sm text-muted-foreground">Chờ người giữ quyền duyệt xử lý.</p>;
  }
  return <>{children}</>;
}

function Dong({ nhan, children }: { nhan: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-36 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{nhan}</dt>
      <dd className="min-w-0 text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function TabChoDuyet({
  clients,
  congCu,
  coDuyet,
  chanMa,
}: {
  clients: HangClient[];
  congCu: { ten: string; moTa: string; nhayCam: string }[];
  coDuyet: boolean;
  chanMa: string | null;
}) {
  const mucCongCu = new Map(congCu.map((c) => [c.ten, c]));
  const clientCho = clients.filter((c) => c.trangThai === "PENDING");
  const grantCho: { g: HangGrant; c: HangClient }[] = clients.flatMap((c) =>
    c.grants.filter((g) => g.trangThai === "PENDING").map((g) => ({ g, c })),
  );

  if (clientCho.length === 0 && grantCho.length === 0) {
    return (
      <EmptyState
        title="Không có gì đang chờ duyệt"
        description="Ứng dụng và quyền mới tạo sẽ hiện ở đây cho tới khi một người khác duyệt hoặc từ chối."
      />
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Ứng dụng chờ duyệt <span className="text-muted-foreground">({clientCho.length})</span>
        </h2>
        {clientCho.length === 0 ? (
          <p className="text-sm text-muted-foreground">Không có ứng dụng nào đang chờ.</p>
        ) : (
          clientCho.map((c) => (
            <article key={c.id} className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-foreground">{c.ten}</h3>
                <StatusPill tone={c.moiTruong === "LIVE" ? "brand" : "info"}>{c.moiTruong}</StatusPill>
                {c.daHetHan && <StatusPill tone="muted">Hết hạn</StatusPill>}
              </div>
              <dl className="space-y-2">
                <Dong nhan="Lý do">
                  <span className="whitespace-pre-wrap">{c.lyDo}</span>
                </Dong>
                <Dong nhan="Người tạo">
                  {c.nguoiTao || "—"} · {ngayGio(c.taoLuc)}
                </Dong>
                <Dong nhan="Vai dịch vụ">
                  <span className="font-mono">{c.vaiDichVu.join(", ") || "—"}</span>
                </Dong>
                <Dong nhan="IP được phép">
                  <span className="font-mono">{c.ipDuocPhep.join(", ")}</span>
                </Dong>
                <Dong nhan="Hạn">{ngay(c.hetHan)}</Dong>
              </dl>
              <div className="mt-4 border-t border-border pt-3">
                <KhuVucQuyetDinh laNguoiTao={c.laNguoiTao} coDuyet={coDuyet}>
                  <NutQuyetDinh
                    loai="client"
                    id={c.id}
                    ten={c.ten}
                    lyDoKhongDuyet={c.daHetHan ? "Đã quá hạn trước khi được duyệt — chỉ còn từ chối, rồi tạo lại." : null}
                    chanMa={chanMa}
                  />
                </KhuVucQuyetDinh>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Quyền chờ duyệt <span className="text-muted-foreground">({grantCho.length})</span>
        </h2>
        {grantCho.length === 0 ? (
          <p className="text-sm text-muted-foreground">Không có quyền nào đang chờ.</p>
        ) : (
          grantCho.map(({ g, c }) => {
            const cc = mucCongCu.get(g.congCu);
            const cao = cc?.nhayCam === "cao";
            const nc = cc ? nhanNhayCam(cc.nhayCam) : null;
            const clientDaDong = c.trangThai === "REVOKED" || c.trangThai === "REJECTED";
            // Rà bảo mật 25/09 (F2): người duyệt phải THẤY phạm vi ứng dụng này đang có, không
            // thì dễ duyệt chồng một quyền rộng hơn (vd thêm "HO" = toàn hệ thống) mà không biết.
            const dangCo = c.grants.filter((x) => x.id !== g.id && x.trangThai === "ACTIVE" && !x.daHetHan);
            const lyDoKhongDuyet = g.daHetHan
              ? "Quyền đã quá hạn trước khi được duyệt — chỉ còn từ chối."
              : clientDaDong
                ? "Ứng dụng của quyền này đã bị thu hồi/từ chối — chỉ còn từ chối."
                : null;
            return (
              <article
                key={g.id}
                className={cn(
                  "rounded-xl border bg-card p-4",
                  cao ? "border-state-danger-ink/60 bg-state-danger-soft/30" : "border-border",
                )}
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h3 className={cn("font-mono font-semibold", cao ? "text-state-danger-ink" : "text-foreground")}>
                    {g.congCu}
                  </h3>
                  {nc && <StatusPill tone={nc.tone}>Nhạy cảm {nc.nhan.toLowerCase()}</StatusPill>}
                  {g.xemDuLieuGoc && <StatusPill tone="danger">Xem dữ liệu GỐC</StatusPill>}
                  {g.daHetHan && <StatusPill tone="muted">Hết hạn</StatusPill>}
                </div>
                <dl className="space-y-2">
                  <Dong nhan="Ứng dụng">
                    {c.ten} <span className="text-muted-foreground">· {c.moiTruong}</span>
                  </Dong>
                  <Dong nhan="Lý do">
                    <span className="whitespace-pre-wrap">{g.lyDo}</span>
                  </Dong>
                  <Dong nhan="Người tạo">
                    {g.nguoiTao || "—"} · {ngayGio(g.taoLuc)}
                  </Dong>
                  {cc && <Dong nhan="Công cụ làm gì">{cc.moTa}</Dong>}
                  <Dong nhan="Cơ sở">{g.coSo.map(nhanCoSo).join(", ")}</Dong>
                  <Dong nhan="Xem dữ liệu gốc">
                    {g.xemDuLieuGoc ? (
                      <span className="font-semibold text-state-danger-ink">Có — agent thấy thông tin cá nhân không che</span>
                    ) : (
                      "Không — thông tin cá nhân (nếu có) được che"
                    )}
                  </Dong>
                  <Dong nhan="Hạn mức / ngày">
                    {g.hanMucNgay === null
                      ? "Theo trần mặc định của hệ thống"
                      : g.hanMucNgay.toLocaleString("vi-VN")}
                  </Dong>
                  <Dong nhan="Hạn">{ngay(g.hetHan)}</Dong>
                  <Dong nhan="Đang được cấp">
                    {dangCo.length === 0 ? (
                      "Chưa có quyền nào đang hoạt động"
                    ) : (
                      <ul className="space-y-0.5">
                        {dangCo.map((x) => (
                          <li key={x.id}>
                            <span className="font-mono">{x.congCu}</span> · {x.coSo.map(nhanCoSo).join(", ")}
                            {x.xemDuLieuGoc ? " · xem dữ liệu GỐC" : ""} · hạn {ngay(x.hetHan)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Dong>
                </dl>
                <div className="mt-4 border-t border-border pt-3">
                  <KhuVucQuyetDinh laNguoiTao={g.laNguoiTao} coDuyet={coDuyet}>
                    <NutQuyetDinh
                      loai="grant"
                      id={g.id}
                      ten={g.congCu}
                      lyDoKhongDuyet={lyDoKhongDuyet}
                      chanMa={chanMa}
                    />
                  </KhuVucQuyetDinh>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
