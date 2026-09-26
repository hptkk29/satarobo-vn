// Thẻ "Cài đặt" — 2FA của chính mình, đặt lại 2FA người khác (người duyệt), hướng dẫn nối
// agent (spec §5.5 thẻ 5). Server component.
import { StatusPill } from "@/components/admin/ui/status-pill";
import type { TrangThaiHaiLop } from "@/lib/auth/hai-lop";
import { CaiHaiLop } from "./cai-hai-lop";
import { NutDatLaiHaiLop } from "./nut-dat-lai-hai-lop";

function Khung({ tieuDe, moTa, children }: { tieuDe: string; moTa?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 className="text-base font-semibold text-foreground">{tieuDe}</h2>
      {moTa && <p className="mt-1 text-sm text-muted-foreground">{moTa}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function MaLenh({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
      {children}
    </pre>
  );
}

export function TabCaiDat({
  haiLop,
  nguoiCoHaiLop,
  userIdHienTai,
  chanMa,
}: {
  haiLop: TrangThaiHaiLop;
  /** null ⇒ người xem không giữ `approve`, không vẽ mục đặt lại. */
  nguoiCoHaiLop: { userId: string; ten: string; daBat: boolean }[] | null;
  userIdHienTai: string;
  chanMa: string | null;
}) {
  return (
    <div className="space-y-6">
      <Khung
        tieuDe="Xác thực 2 lớp của bạn"
        moTa="Mọi thao tác cấp quyền (tạo, duyệt, sinh mật khẩu, mở khoá, bật cổng) đòi mã 6 số từ ứng dụng xác thực. Khoá và thu hồi thì không — để ai cũng phanh được ngay."
      >
        <CaiHaiLop
          daBat={haiLop.daBat}
          dangCai={haiLop.dangCai}
          khoaDen={haiLop.khoaDen ? haiLop.khoaDen.toISOString() : null}
        />
      </Khung>

      {nguoiCoHaiLop && (
        <Khung
          tieuDe="Đặt lại xác thực 2 lớp của người khác"
          moTa="Dùng khi ai đó mất hoặc đổi điện thoại. Không tự đặt lại cho chính mình — nhờ người duyệt khác."
        >
          {nguoiCoHaiLop.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa ai cài xác thực 2 lớp.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {nguoiCoHaiLop.map((n) => (
                <li key={n.userId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{n.ten}</span>
                    <StatusPill tone={n.daBat ? "success" : "warning"}>{n.daBat ? "Đã bật" : "Đang cài dở"}</StatusPill>
                  </div>
                  {n.userId === userIdHienTai ? (
                    <span className="text-xs text-muted-foreground">(bạn)</span>
                  ) : (
                    <NutDatLaiHaiLop userId={n.userId} ten={n.ten} chanMa={chanMa} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Khung>
      )}

      <Khung
        tieuDe="Hướng dẫn nối agent"
        moTa="Đưa cho người dựng agent. Mật khẩu ứng dụng lấy ở thẻ “Ứng dụng kết nối” (hiện một lần) — gửi qua két bí mật, không qua Zalo/email."
      >
        <ol className="list-decimal space-y-4 pl-5 text-sm text-foreground">
          <li className="space-y-2">
            <p>
              Lấy phiên: <code className="font-mono">POST /api/agent/v1/oauth/token</code> — xác thực Basic
              (mã ứng dụng : mật khẩu), thân dạng form. <code className="font-mono">scope</code> tuỳ chọn — bỏ
              trống là nhận mọi quyền đang được cấp; muốn thu hẹp thì liệt kê{" "}
              <code className="font-mono">&lt;tên công cụ&gt;:doc</code>, cách nhau bằng dấu cách.
            </p>
            <MaLenh>{`POST /api/agent/v1/oauth/token
Authorization: Basic base64(<mã ứng dụng>:<mật khẩu>)
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&scope=<tên công cụ>:doc`}</MaLenh>
          </li>
          <li className="space-y-2">
            <p>
              Xem công cụ được phép (kèm khuôn tham số): <code className="font-mono">POST /api/agent/v1/tools</code>{" "}
              với phiên vừa lấy.
            </p>
            <MaLenh>{`POST /api/agent/v1/tools
Authorization: Bearer <phiên>
Content-Type: application/json

{}`}</MaLenh>
          </li>
          <li className="space-y-2">
            <p>
              Gọi một công cụ: <code className="font-mono">{"POST /api/agent/v1/tools/{ten}"}</code>, tham số nằm
              trong <code className="font-mono">tham_so</code>.
            </p>
            <MaLenh>{`POST /api/agent/v1/tools/<tên công cụ>
Authorization: Bearer <phiên>
Content-Type: application/json

{"tham_so":{}}`}</MaLenh>
          </li>
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">
          Lượt gọi chỉ qua khi: cổng đang bật · gọi từ IP đã khai · ứng dụng đang hoạt động · có quyền cấp còn hạn
          cho đúng công cụ và cơ sở.
        </p>
      </Khung>
    </div>
  );
}
