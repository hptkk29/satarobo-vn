"use server";

// G-D (biên bản chốt 4 cổng, 21/08/2026) — nhập khách hàng SAU ĐĂNG NHẬP.
//
// Vì sao có màn này: biểu mẫu đang dùng (`sale.satarobo.vn`) là biểu mẫu NỘI BỘ
// cho marketing / sale-admin nhập lead thu từ quảng cáo Facebook, nhưng nó công
// khai và bắt người nhập **gõ tay mã nhân viên của mình** mỗi lần. Gõ sai thì
// lead giao nhầm người; gõ mã người khác thì không ai chặn.
//
// Màn này bỏ ô mã nhân viên và lấy danh tính từ phiên đăng nhập.
//
// ⚠️ KHÔNG mở đường ghi lead thứ hai: vẫn đi qua `ingestIntakeLead()` như mọi
// nguồn khác, nên được hưởng nguyên chuỗi đang chạy — chuẩn hoá SĐT, chống
// trùng theo cửa sổ cấu hình, tra cơ sở, tra người phụ trách theo mã NV, tự
// chia, ghi `LeadActivity`.
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { ingestIntakeLead } from "@/lib/lead/intake/ingest";
import { mapInternalForm } from "@/lib/lead/intake/map-internal-form";
import { getStaffIdentity } from "@/lib/lead/intake/staff-identity";
import {
  internalLeadSchema,
  type InternalLeadResult,
} from "@/lib/validators/internal-lead";

// ⚠️ File này là `"use server"` ⇒ CHỈ được export hàm async. Kiểu
// `InternalLeadResult` cố ý nằm ở `lib/validators/internal-lead.ts`: loader sinh
// export VALUE cho mọi export ở đây, nên `export type` sẽ giết toàn bộ action
// trong module lúc chạy (E352 — đã xảy ra thật trong repo này).

export async function createInternalLeadAction(
  input: unknown,
): Promise<InternalLeadResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("leads:create"))) {
    return { ok: false, error: "Không có quyền nhập khách hàng" };
  }

  const parsed = internalLeadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  // Danh tính người nhập LẤY TỪ PHIÊN — không nhận từ payload.
  const staff = await getStaffIdentity(
    session.user.id,
    session.user.name ?? session.user.email ?? "Không rõ",
  );

  const mapped = mapInternalForm(parsed.data, staff);
  if (!mapped.ok) return { ok: false, error: mapped.error };

  const h = await headers();
  const res = await ingestIntakeLead(mapped.lead, {
    // Tách khỏi "sale-form" của biểu mẫu tĩnh để đo được tiến độ chuyển đổi
    // giữa hai đường nhập trong giai đoạn chạy song song.
    source: "sale-form-app",
    actorName: session.user.name ?? session.user.email ?? "Nhân viên",
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    landingPage: "/admin/nhap-khach-hang",
  });

  if (!res.ok) return { ok: false, error: res.error ?? "Không lưu được phiếu" };

  revalidatePath("/leads");
  if (res.leadId) revalidatePath(`/leads/${res.leadId}`);

  return {
    ok: true,
    leadId: res.leadId,
    duplicate: res.duplicate,
    childAdded: res.childAdded,
    warnings: mapped.lead.warnings.length ? mapped.lead.warnings : undefined,
  };
}
