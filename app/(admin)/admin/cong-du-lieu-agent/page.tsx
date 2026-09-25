// Màn "Hệ thống › Cổng dữ liệu agent" (tài liệu CEO 25/09/2026 §5.5) — 5 thẻ chọn bằng `?tab=`:
//   ung-dung · quyen-cap · cho-duyet · nhat-ky · cai-dat
//
// QUYỀN: vào màn = `agent_gateway:view` (PAGE_GATES). NÚT thì theo hai quyền riêng:
//   · `agent_gateway:manage`  (Kỹ thuật)  — tạo ứng dụng/quyền, sinh/xoay mật khẩu;
//   · `agent_gateway:approve` (Giám đốc)  — duyệt/từ chối, mở khoá, bật cổng, đặt lại 2FA;
//   · một trong hai               — khoá, thu hồi, tắt cổng.
// Mỗi nút chỉ vẽ khi Server Action tương ứng THẬT SỰ cho qua (luật 12: nút hiện mà bấm là bị
// từ chối là lời hứa suông). Server Action vẫn tự kiểm lại — đây chỉ là tầng hiển thị.
//
// DỮ LIỆU: chỉ đọc qua `lib/agents/quan-tri/doc.ts` (bảng của cổng không thuộc cơ sở nào nên
// không đi `scopedDb`; không có bản băm khoá/token nào ra tới giao diện).
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { auth } from "@/lib/auth";
import { checkAnyPermission, checkPermission } from "@/lib/auth/check-permission";
import { PAGE_GATES } from "@/lib/auth/page-gates";
import { HAN_TOI_DA } from "@/lib/agents/quan-tri/chung";
import { docNguoiCoHaiLop, docNhatKy, docTongQuan } from "@/lib/agents/quan-tri/doc";
import { cn } from "@/lib/utils";
import { CongTacCong } from "./_components/cong-tac-cong";
import { homNayVN, ngayGio } from "./_components/dinh-dang";
import { TabCaiDat } from "./_components/tab-cai-dat";
import { TabChoDuyet } from "./_components/tab-cho-duyet";
import { TabNhatKy } from "./_components/tab-nhat-ky";
import { TabQuyenCap } from "./_components/tab-quyen-cap";
import { TabUngDung } from "./_components/tab-ung-dung";

export const dynamic = "force-dynamic";

export const metadata = { title: "Cổng dữ liệu agent | Admin Sata Robo" };

const THE = [
  { id: "ung-dung", nhan: "Ứng dụng kết nối" },
  { id: "quyen-cap", nhan: "Quyền cấp" },
  { id: "cho-duyet", nhan: "Chờ duyệt" },
  { id: "nhat-ky", nhan: "Nhật ký gọi" },
  { id: "cai-dat", nhan: "Cài đặt" },
] as const;

type TheId = (typeof THE)[number]["id"];

function laThe(s: string | undefined): s is TheId {
  return THE.some((t) => t.id === s);
}

export default async function CongDuLieuAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; client?: string; chiLoi?: string; batThuong?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkAnyPermission([...PAGE_GATES["/cong-du-lieu-agent"]]))) {
    redirect("/dashboard?error=unauthorized");
  }
  const [coQuanLy, coDuyet] = await Promise.all([
    checkPermission("agent_gateway:manage"),
    checkPermission("agent_gateway:approve"),
  ]);

  const sp = await searchParams;
  const the: TheId = laThe(sp.tab) ? sp.tab : "ung-dung";
  const locNhatKy = {
    clientId: sp.client?.trim() ?? "",
    chiLoi: sp.chiLoi === "1",
    chiBatThuong: sp.batThuong === "1",
  };
  const now = new Date();
  const userId = session.user.id;

  // Ba lượt đọc KHÔNG cần nhau ⇒ một lô (trang admin chậm gần như luôn vì `await` nối đuôi).
  const [tq, nhatKy, nguoiCoHaiLop] = await Promise.all([
    docTongQuan(userId, now),
    the === "nhat-ky"
      ? docNhatKy({
          clientId: locNhatKy.clientId || undefined,
          chiLoi: locNhatKy.chiLoi,
          chiBatThuong: locNhatKy.chiBatThuong,
        })
      : Promise.resolve(null),
    the === "cai-dat" && coDuyet ? docNguoiCoHaiLop() : Promise.resolve(null),
  ]);

  // Vì sao lúc này KHÔNG nhập được mã 2FA — khác null thì mọi nút cần mã bị vô hiệu kèm câu này,
  // thay vì sáng lên rồi để server từ chối.
  const chanMa = !tq.haiLop.daBat
    ? "Cần bật xác thực 2 lớp trước (thẻ Cài đặt)."
    : tq.haiLop.khoaDen
      ? `Xác thực 2 lớp đang tạm khoá tới ${ngayGio(tq.haiLop.khoaDen)}.`
      : null;

  const homNay = homNayVN(now);
  const soChoDuyet =
    tq.clients.filter((c) => c.trangThai === "PENDING").length +
    tq.clients.reduce((n, c) => n + c.grants.filter((g) => g.trangThai === "PENDING").length, 0);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Cổng dữ liệu agent"
        subtitle="Cấp, duyệt và thu hồi quyền cho agent AI đọc dữ liệu qua API — mọi thao tác cấp quyền cần hai người và mã xác thực 2 lớp."
      />

      <CongTacCong
        dangBat={tq.congDangBat}
        duocTat={coQuanLy || coDuyet}
        duocBat={coDuyet}
        chanMa={chanMa}
      />

      {!tq.haiLop.daBat && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-state-warning/40 bg-state-warning-soft px-4 py-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-state-warning-ink" aria-hidden />
          <p className="text-sm text-foreground">
            <span className="font-semibold">Bạn chưa bật xác thực 2 lớp.</span> Tạo, duyệt, sinh mật khẩu, mở
            khoá và bật cổng đều cần mã 6 số.{" "}
            <Link
              href="/cong-du-lieu-agent?tab=cai-dat"
              className="font-semibold text-primary underline underline-offset-2"
            >
              Bật ở thẻ Cài đặt
            </Link>
          </p>
        </div>
      )}
      {tq.haiLop.daBat && tq.haiLop.khoaDen && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-state-danger/40 bg-state-danger-soft px-4 py-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-state-danger-ink" aria-hidden />
          <p className="text-sm text-foreground">
            Xác thực 2 lớp của bạn đang <span className="font-semibold">tạm khoá tới {ngayGio(tq.haiLop.khoaDen)}</span>{" "}
            do nhập sai mã nhiều lần. Khoá và thu hồi vẫn làm được.
          </p>
        </div>
      )}

      <nav aria-label="Các thẻ của cổng dữ liệu agent" className="mb-5 overflow-x-auto border-b border-border">
        <ul className="flex min-w-max gap-1">
          {THE.map((t) => {
            const dangMo = t.id === the;
            return (
              <li key={t.id}>
                <Link
                  href={`/cong-du-lieu-agent?tab=${t.id}`}
                  aria-current={dangMo ? "page" : undefined}
                  className={cn(
                    "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                    dangMo
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.nhan}
                  {t.id === "cho-duyet" && soChoDuyet > 0 && (
                    <span className="rounded-full bg-state-warning-soft px-1.5 text-xs font-semibold text-state-warning-ink">
                      {soChoDuyet}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {the === "ung-dung" && (
        <TabUngDung
          clients={tq.clients}
          vaiDichVu={tq.vaiDichVu}
          coQuanLy={coQuanLy}
          coDuyet={coDuyet}
          chanMa={chanMa}
          homNay={homNay}
          hanToiDaNgay={HAN_TOI_DA.clientNgay}
        />
      )}
      {the === "quyen-cap" && (
        <TabQuyenCap
          clients={tq.clients}
          congCu={tq.congCu}
          maCoSo={tq.maCoSo}
          coQuanLy={coQuanLy}
          coDuyet={coDuyet}
          chanMa={chanMa}
          homNay={homNay}
          hanDocNgay={HAN_TOI_DA.grantDocNgay}
          hanXemGocNgay={HAN_TOI_DA.xemGocNgay}
        />
      )}
      {the === "cho-duyet" && (
        <TabChoDuyet clients={tq.clients} congCu={tq.congCu} coDuyet={coDuyet} chanMa={chanMa} />
      )}
      {the === "nhat-ky" && (
        <TabNhatKy
          dong={nhatKy ?? []}
          clients={tq.clients.map((c) => ({ id: c.id, ten: c.ten }))}
          loc={locNhatKy}
        />
      )}
      {the === "cai-dat" && (
        <TabCaiDat haiLop={tq.haiLop} nguoiCoHaiLop={nguoiCoHaiLop} userIdHienTai={userId} chanMa={chanMa} />
      )}
    </div>
  );
}
