import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { SETTINGS, SETTING_KEYS } from "@/lib/settings/registry";
import { getResolvedSettings } from "@/lib/settings/service";
import {
  SettingsEditor,
  type SettingRowView,
} from "./_components/settings-editor";
import { PageHelp } from "@/components/admin/ui/page-help";
import { getSetting } from "@/lib/settings/service";
import { layMaVaiCoThat } from "@/lib/crm/vai-nhan-hoa-hong";
import type { ChinhSachHoaHong } from "@/lib/crm/chinh-sach-hoa-hong";
import { ConfigTabs, type ConfigTabKey } from "./_components/config-tabs";
import { BangChinhSachHoaHong } from "./_components/bang-chinh-sach-hoa-hong";
import { TabPhuongThucThanhToan } from "./_components/tab-phuong-thuc-tt";

/** Đầu trang dùng chung cho cả ba tab — một chỗ, để ba nhánh không trôi khỏi nhau. */
function HeaderCauHinh() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">Cấu hình vận hành</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tham số, phương thức thanh toán và chính sách hoa hồng của toàn hệ thống
      </p>
    </div>
  );
}

export const dynamic = "force-dynamic";

export const metadata = { title: "Cấu hình vận hành | Admin Sata Robo" };

export default async function OperationalSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; centerId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("settings:view"))) redirect("/admin/dashboard");

  const canEditGlobal = await checkPermission("settings:edit"); // settings:edit = SUPER_ADMIN

  const sp = await searchParams;
  const tab: ConfigTabKey =
    sp.tab === "phuong-thuc-tt" || sp.tab === "hoa-hong" ? sp.tab : "tham-so";
  const resolved = await getResolvedSettings([...SETTING_KEYS]);

  const rows: SettingRowView[] = SETTING_KEYS.map((key) => {
    const def = SETTINGS[key];
    return {
      key,
      label: def.label,
      group: def.group,
      centerOverridable: def.centerOverridable,
      // Suy kiểu từ giá trị mặc định — không cần đưa zod schema qua ranh giới client.
      isBoolean: typeof def.default === "boolean",
      value: resolved[key],
    };
  });

  // ── TAB PHƯƠNG THỨC THANH TOÁN ───────────────────────────────────────────
  // Gộp từ /payment-methods (chủ dự án 14/09/2026). Gác bằng quyền CỦA CHÍNH NÓ
  // (`payments:manage`) chứ không mượn `settings:view`: người xem tham số vận hành không
  // đương nhiên được sửa tài khoản nhận tiền, và ngược lại Kế toán cơ sở có
  // `payments:manage` phải vào được tab này.
  if (tab === "phuong-thuc-tt") {
    if (!(await checkPermission("payments:manage"))) {
      return (
        <div className="max-w-4xl space-y-6">
          <HeaderCauHinh />
          <ConfigTabs active={tab} />
          <div
            role="alert"
            className="rounded-xl border border-state-warning bg-state-warning-soft px-4 py-3 text-sm text-state-warning-ink"
          >
            Bạn không có quyền <b className="font-semibold">payments:manage</b> nên không xem
            được phương thức thanh toán. Hỏi Quản trị hệ thống nếu cần quyền này.
          </div>
        </div>
      );
    }
    return (
      <div className="max-w-6xl space-y-6">
        <HeaderCauHinh />
        <ConfigTabs active={tab} />
        <TabPhuongThucThanhToan centerIdFilter={sp.centerId?.trim() || null} />
      </div>
    );
  }

  // ── TAB CHÍNH SÁCH HOA HỒNG ──────────────────────────────────────────────
  if (tab === "hoa-hong") {
    const [chinhSach, tran, vaiCoThat] = await Promise.all([
      getSetting("crm.commissionPolicies"),
      getSetting("crm.commissionMaxTotalRate"),
      layMaVaiCoThat(),
    ]);
    return (
      <div className="max-w-6xl space-y-6">
        <HeaderCauHinh />
        <ConfigTabs active={tab} />
        <BangChinhSachHoaHong
          banDau={chinhSach as ChinhSachHoaHong[]}
          tranTongTiLe={typeof tran === "number" ? tran : 0.09}
          vaiCoThat={vaiCoThat}
          suaDuoc={canEditGlobal}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <HeaderCauHinh />
      <ConfigTabs active={tab} />

      <PageHelp>
        <p>
          Tham số vận hành toàn hệ thống (GLOBAL). Đổi giá trị có hiệu lực ngay,
          không cần deploy. Mỗi thay đổi yêu cầu lý do và được ghi nhật ký kiểm
          toán.
        </p>
      </PageHelp>

      {!canEditGlobal && (
        <div className="rounded-lg border border-state-warning-soft bg-state-warning-soft px-4 py-3 text-sm text-state-warning-ink">
          Bạn chỉ có quyền <strong>xem</strong> cấu hình toàn hệ thống. Chỉ
          SUPER_ADMIN được sửa.
        </div>
      )}

      <SettingsEditor rows={rows} canEdit={canEditGlobal} />
    </div>
  );
}
