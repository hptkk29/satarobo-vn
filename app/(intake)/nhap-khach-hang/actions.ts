"use server";

// Nhập khách hàng SAU ĐĂNG NHẬP — `satarobo.vn/nhap-khach-hang`.
//
// Vì sao có màn này: biểu mẫu cũ (`sale.satarobo.vn`) công khai và bắt người
// nhập **gõ tay mã nhân viên của mình** mỗi lần. Gõ sai thì lead giao nhầm
// người; gõ mã người khác thì không ai chặn.
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
import { mirrorInternalFormToMisa } from "@/lib/lead/intake/misa-mirror";
import { getStaffIdentity } from "@/lib/lead/intake/staff-identity";
import { logWebhookDelivery } from "@/lib/lead/webhook";
import {
  hasAnyContent,
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
  // Không ô nào bắt buộc — nhưng phiếu TRẮNG thì không phải dữ liệu.
  if (!hasAnyContent(parsed.data)) {
    return { ok: false, error: "Phiếu trống — điền ít nhất một ô giúp nhé." };
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
    // Kênh kỹ thuật phiếu đi vào (log/`LeadDuplicate`/cảnh báo sức khoẻ). Nguồn
    // marketing người nhập gõ đi vào `Lead.source` qua `mapped.lead.leadSource`.
    source: "sale-form-app",
    actorName: session.user.name ?? session.user.email ?? "Nhân viên",
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    landingPage: "/nhap-khach-hang",
    // Chốt 22/08: không ô nào bắt buộc, kể cả SĐT (lead quảng cáo FB thường chỉ
    // có link Facebook lúc mới thu về).
    allowMissingPhone: true,
  });

  if (!res.ok) return { ok: false, error: res.error ?? "Không lưu được phiếu" };

  // Bản sao sang MISA — Postgres đã ghi xong nên hỏng ở đây KHÔNG ảnh hưởng
  // lead. Await để serverless không giết tiến trình giữa chừng.
  //
  // Hỏng thì phải để lại VẾT GỬI LẠI ĐƯỢC, không chỉ một dòng console: trong
  // giai đoạn chuyển tiếp MISA vẫn là chỗ Sale làm việc, mà `console.error`
  // không tới Sentry và không ai đọc log Vercel. Bài học SePay: 401 im lặng 6
  // ngày nuốt 4 giao dịch vì không có chỗ nào nhìn thấy.
  const misaInput = {
    parentName: mapped.lead.parentName,
    phone: mapped.lead.phone,
    childName: mapped.lead.child?.fullName ?? null,
    source: parsed.data.source,
    facebookUrl: mapped.lead.facebookUrl ?? null,
    centerCode: parsed.data.centerCode,
    note: parsed.data.note,
    employeeCode: staff.employeeCode,
  };
  const mirror = await mirrorInternalFormToMisa(misaInput);
  if (mirror.status === "failed" || mirror.status === "misconfigured") {
    console.error(`[nhap-khach-hang] mirror MISA: ${mirror.status}`, mirror);
    await logWebhookDelivery({
      source: "misa-mirror",
      externalId: res.leadId ?? null,
      payload: misaInput,
      status: "FAILED",
      errorMessage:
        mirror.status === "misconfigured"
          ? `Thiếu env: ${mirror.missing.join(", ")} — MISA không nhận được phiếu này.`
          : `Gửi MISA thất bại (${mirror.reason}).`,
    }).catch((err) =>
      console.error("[nhap-khach-hang] không ghi được mirror log:", err),
    );
  }

  // Đường THẬT trong app dir là `/admin/leads` (clean URL `/leads` chỉ do
  // `decideRoute` rewrite ở tầng host). `revalidatePath` khớp theo route của
  // app dir nên phải dùng đường thật, không thì nó im lặng không làm gì.
  revalidatePath("/admin/leads");
  if (res.leadId) revalidatePath(`/admin/leads/${res.leadId}`);

  return {
    ok: true,
    leadId: res.leadId,
    duplicate: res.duplicate,
    childAdded: res.childAdded,
    warnings: mapped.lead.warnings.length ? mapped.lead.warnings : undefined,
  };
}
