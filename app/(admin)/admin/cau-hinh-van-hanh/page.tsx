import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { SETTINGS, SETTING_KEYS } from "@/lib/settings/registry";
import { getResolvedSettings } from "@/lib/settings/service";
import { SettingsEditor, type SettingRowView } from "./_components/settings-editor";

export const dynamic = "force-dynamic";

export const metadata = { title: "Cấu hình vận hành | Admin Sata Robo" };

export default async function OperationalSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("settings:view"))) redirect("/admin/dashboard");

  const canEditGlobal = await checkPermission("settings:edit"); // settings:edit = SUPER_ADMIN
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

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cấu hình vận hành</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tham số vận hành toàn hệ thống (GLOBAL). Đổi giá trị có hiệu lực ngay, không cần deploy.
          Mỗi thay đổi yêu cầu lý do và được ghi nhật ký kiểm toán.
        </p>
      </div>

      {!canEditGlobal && (
        <div className="rounded-lg border border-state-warning-soft bg-state-warning-soft px-4 py-3 text-sm text-state-warning-ink">
          Bạn chỉ có quyền <strong>xem</strong> cấu hình toàn hệ thống. Chỉ SUPER_ADMIN được sửa.
        </div>
      )}

      <SettingsEditor rows={rows} canEdit={canEditGlobal} />
    </div>
  );
}
