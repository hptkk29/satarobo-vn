// app/(admin)/admin/zalo-crm/page.tsx — S1 (kế hoạch tích hợp ZaloCRM, GĐ1).
//
// Sale nhắn khách bằng nick Zalo CÁ NHÂN ngay trong site admin: giao diện chat của fork
// ZaloCRM chạy trong `<iframe>`, đăng nhập một lần bằng vé SSO 60 giây do Sata ký.
//
// BA ĐIỀU PHẢI GIỮ Ở TRANG NÀY:
//  1. Cờ `ZALOCRM_ENABLED` TẮT ⇒ `notFound()`. "Tắt" nghĩa là màn KHÔNG TỒN TẠI, không
//     phải "hiện ra rồi báo chưa bật" — mục sidebar cũng ẩn theo cùng cờ đó.
//  2. Cổng quyền là `PAGE_GATES["/zalo-crm"]` (= `zalocrm:use`), gác bằng đúng bảng đó
//     chứ không gõ action rời (`lib/auth/page-gates.test.ts` so bằng chuỗi nguyên văn).
//  3. Vé SSO chỉ ký cho org của cơ sở người này NHÌN THẤY ĐƯỢC. `?org=` trên URL chỉ để
//     TRA trong danh sách đã lọc — tin nó là mở đường cho tư vấn viên CS1 lấy vé vào tổ
//     chức ZaloCRM của CS2 (xem `_lib/co-so.ts`).
//
// ⚠️ Ở GĐ0 fork CHƯA TỒN TẠI: khung nhúng sẽ trắng. Đó là KẾT QUẢ ĐÚNG, không phải lỗi —
// thứ chặn hiển thị là header của chính ZaloCRM (`frame-ancestors`, việc F3 bên fork),
// không phải CSP của Sata (đang là `Content-Security-Policy-Report-Only`).
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, MessageSquareText } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { checkAnyPermission } from "@/lib/auth/check-permission";
import { PAGE_GATES } from "@/lib/auth/page-gates";
import { scopedDb } from "@/lib/db-scope";
import { isZalocrmEnabled } from "@/lib/flags";
import { getSetting } from "@/lib/settings/service";
import {
  ZalocrmSsoError,
  duongDanNhungZaloCrm,
  mintSsoToken,
} from "@/lib/integrations/zalocrm/sso";
import { datTruocLuongZalo } from "@/lib/integrations/zalocrm/dat-truoc";
import { maVaiCuaNguoiDung, vaiZaloCrm } from "@/lib/integrations/zalocrm/vai-tro";
import { cn } from "@/lib/utils";
import { chonCoSoZaloCrm } from "./_lib/co-so";
import { chuanHoaNguonGoc } from "./_lib/thong-diep";
import { ZaloCrmFrame } from "./_components/zalocrm-frame";

export const metadata = { title: "Zalo CRM | Admin" };
// Vé SSO sống 60 giây và `jti` phải khác nhau mỗi lần ⇒ trang KHÔNG được cache.
export const dynamic = "force-dynamic";

/** Khối hướng dẫn khi chưa dựng được khung — luôn nói RÕ phải làm gì, không chỉ "lỗi". */
function KhoiHuongDan({ tieuDe, children }: { tieuDe: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-background p-8">
      <div className="max-w-xl space-y-3 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
          <AlertTriangle className="h-5 w-5 text-amber-700" />
        </div>
        <h2 className="text-base font-semibold">{tieuDe}</h2>
        <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export default async function ZaloCrmPage({
  searchParams,
}: {
  searchParams: Promise<{ compose?: string; lead?: string; org?: string }>;
}) {
  // Cờ TẮT = màn không tồn tại. Đặt TRƯỚC `auth()` để người chưa đăng nhập cũng không
  // dò được là địa chỉ này có thật.
  if (!isZalocrmEnabled()) notFound();

  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=%2Fzalo-crm");
  if (!(await checkAnyPermission(PAGE_GATES["/zalo-crm"]))) {
    redirect("/dashboard?error=unauthorized");
  }

  const sp = await searchParams; // Next 16: searchParams là Promise, BẮT BUỘC await
  const actor = await resolveActor(session.user.id);
  // `Center` ∈ SCOPE_EXEMPT (danh mục tổ chức) nên `sdb` cho đi qua nguyên vẹn — phép
  // cách ly cơ sở nằm ở `chonCoSoZaloCrm` bên dưới. Vẫn đi qua `scopedDb` vì đây là
  // `app/(admin)/**` và cổng `@/lib/db` trần đã đóng (ESLint error).
  const sdb = scopedDb(actor);

  const [orgCodes, centers] = await Promise.all([
    getSetting("zalocrm.orgCodes"),
    sdb.center.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const { danhSach, dangChon, chonKhongHopLe } = chonCoSoZaloCrm({
    centers,
    orgCodes,
    visibleCenterIds: actor.visibleCenterIds,
    chon: sp.org,
  });

  // ── S2 chiều GHI — dòng "ĐẶT TRƯỚC" cho `(orgCode của tab, SĐT trên ?compose=)` ──
  // Tin ĐẦU TIÊN khách gửi qua Zalo cá nhân KHÔNG kèm số điện thoại. Nếu Sata không
  // ghi trước "số này là phiếu nào" thì hội thoại rơi vào nhóm mồ côi và phải nối tay
  // từng cái. `?lead=` mà nút "Nhắn Zalo" trên phiếu gửi sang chính là mẩu tin ấy —
  // ba đợt trước nó được KHAI trong kiểu `searchParams` nhưng chưa ai ĐỌC.
  //
  // VÌ SAO GHI NGAY TRONG LÚC DỰNG TRANG (tác dụng phụ trên đường GET — chọn có chủ
  // đích, không phải tiện tay):
  //  · trang đã `force-dynamic` (vé SSO sống 60 giây) nên không có bản cache nào để
  //    hỏng, và Next không dựng sẵn trang động khi trình duyệt prefetch thẻ `<Link>`;
  //  · làm bằng Server Action gọi từ client thì phải thêm một component client + một
  //    vòng request, mà thứ tự vẫn không chắc hơn — khách hoàn toàn có thể nhắn trước
  //    khi vòng ấy chạy xong;
  //  · phép ghi IDEMPOTENT và chỉ chạy khi có ĐỦ `?compose=` + `?lead=`, nên lối vào
  //    thường ngày (mở màn từ sidebar) không chạm DB một lượt nào.
  // Đổi lại là điều kiện cứng: `datTruocLuongZalo` KHÔNG BAO GIỜ ném — nó nuốt lỗi và
  // trả một mã. Bảng ánh xạ hỏng không được chắn ngang việc Sale nhắn khách.
  if (dangChon) {
    await datTruocLuongZalo({
      actor,
      coSo: { centerId: dangChon.centerId, orgCode: dangChon.orgCode },
      compose: sp.compose,
      lead: sp.lead,
    });
  }

  // Vai bên ZaloCRM suy từ CẢ HAI hệ mã vai (phiên v1 + Actor v2) — bảng tra thuần ở
  // `lib/integrations/zalocrm/vai-tro.ts`, không so vai tại chỗ (luật cứng #1).
  const vai = vaiZaloCrm(
    maVaiCuaNguoiDung({
      role: session.user.role,
      roles: session.user.roles,
      orgRoles: actor.orgRoles,
    }),
  );

  const appUrl = process.env.ZALOCRM_APP_URL ?? "";
  const nguonGoc = chuanHoaNguonGoc(appUrl);

  // Ký vé + dựng địa chỉ nhúng. Mọi nhánh hỏng đều thành MỘT thông điệp hướng dẫn, không
  // để ném ra màn lỗi 500: người dùng cuối là Sale, và câu "Application error" không nói
  // cho ai biết phải gọi ai.
  let src: string | null = null;
  let loi: string | null = null;
  if (!vai) {
    loi = "Vai của bạn chưa được ánh xạ sang vai trong Zalo CRM nên hệ thống không cấp phiên đăng nhập.";
  } else if (!dangChon) {
    loi =
      danhSach.length === 0 && Object.keys(orgCodes).length === 0
        ? "Chưa cơ sở nào được ánh xạ sang tổ chức trên máy chủ Zalo CRM."
        : "Bạn chưa được gán cơ sở nào có Zalo CRM.";
  } else if (!nguonGoc) {
    loi = "Chưa khai địa chỉ giao diện Zalo CRM (biến môi trường ZALOCRM_APP_URL).";
  } else {
    try {
      const { token } = await mintSsoToken({
        userId: session.user.id,
        tokenVersion: session.user.tokenVersion,
        orgCode: dangChon.orgCode,
        role: vai,
        fullName: session.user.name ?? "",
        email: session.user.email,
      });
      src = duongDanNhungZaloCrm({ appUrl, token, compose: sp.compose });
      if (!src) loi = "Địa chỉ giao diện Zalo CRM không hợp lệ (ZALOCRM_APP_URL).";
    } catch (e) {
      // Mã lỗi EN, thông điệp VI — đọc thẳng từ lớp lỗi, không đoán lại.
      loi =
        e instanceof ZalocrmSsoError
          ? e.message
          : "Không cấp được phiên đăng nhập Zalo CRM. Vui lòng thử lại.";
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[32rem] flex-col gap-4">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft">
            <MessageSquareText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Zalo CRM</h1>
            <p className="text-sm text-muted-foreground">
              Nhắn khách bằng nick Zalo cá nhân của công ty. Mọi tin nhắn vẫn được ghi mốc
              lên dòng thời gian của phiếu khách trên Sata.
            </p>
          </div>
        </div>

        {/* Tab cơ sở — chốt 9.7: mỗi tab là MỘT phiên SSO vào tổ chức tương ứng, nên đổi
            tab là tải lại trang để ký vé mới (không dùng tab phía client). Chỉ hiện khi
            người này thấy từ hai cơ sở trở lên. */}
        {danhSach.length > 1 && (
          <nav aria-label="Chọn cơ sở" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
            {danhSach.map((c) => (
              <Link
                key={c.orgCode}
                href={`/zalo-crm?org=${c.orgCode}`}
                aria-current={c.orgCode === dangChon?.orgCode ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  c.orgCode === dangChon?.orgCode
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {c.ten}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {chonKhongHopLe && (
        <p className="shrink-0 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Cơ sở trên đường dẫn không thuộc phạm vi của bạn — đã mở cơ sở{" "}
          <strong>{dangChon?.ten}</strong>.
        </p>
      )}

      {src && nguonGoc ? (
        <ZaloCrmFrame src={src} nguonGoc={nguonGoc} tenCoSo={dangChon?.ten ?? ""} />
      ) : (
        <KhoiHuongDan tieuDe="Chưa mở được Zalo CRM">
          <p>{loi}</p>
          <p className="text-xs">
            Nếu bạn cho rằng đây là nhầm lẫn, báo quản trị hệ thống kiểm ba thứ: ánh xạ cơ
            sở (<code>zalocrm.orgCodes</code>), tài khoản đã được gán đơn vị trong cây tổ
            chức chưa (tầm nhìn cơ sở lấy từ đó, không lấy từ vai gốc), và vai có nằm
            trong bảng ánh xạ vai Zalo CRM không.
          </p>
        </KhoiHuongDan>
      )}
    </div>
  );
}
