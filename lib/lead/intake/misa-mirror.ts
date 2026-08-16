import "server-only";
import { getSetting } from "@/lib/settings/service";
import { SALE_FORM_FIELDS } from "./map-sale-form";

// =============================================================================
// MIRROR SANG MISA — chỉ dùng trong GIAI ĐOẠN CHUYỂN TIẾP.
//
// Trước đây form Sale POST thẳng sang MISA. Nay nó POST về ta (để tạo Lead),
// nên ta gửi tiếp một bản sao sang MISA để bên đó không bị đứt dữ liệu giữa
// chừng. Theo QĐ-3 (16/08) MISA sẽ bị bỏ hẳn ⇒ đây là code CÓ NGÀY CHẾT.
//
// Ba nguyên tắc:
//  1. Postgres là nguồn sự thật. Mirror hỏng ⇒ LOG, tuyệt đối không rollback
//     lead và không làm hỏng response trả về người nhập.
//  2. Không phải open relay: chỉ chuyển tiếp đúng danh sách trường của form.
//     Trường lạ do người ta bơm vào endpoint công khai bị bỏ.
//  3. Tham số định danh form (ID/Companycode/FormKey) KHÔNG hardcode trong mã
//     nguồn (luật cứng #9). Ưu tiên đọc env `MISA_WEBFORM_*`; **thiếu env thì
//     lấy chính 3 input ẩn mà form vừa gửi lên**.
//
//     Vì sao có phương án 2: cờ `intake.mirrorMisa` mặc định BẬT, nên nếu
//     go-live mà quên đặt env thì MISA tắt tiếng ngay từ phiếu đầu tiên — đúng
//     kiểu hỏng của webhook SePay (401 im lặng 6 ngày, nuốt 4 giao dịch). Ba
//     giá trị này vốn nằm công khai trong `public/sale/nhap-lieu.html` và
//     trước đây trình duyệt vẫn gửi thẳng sang MISA, nên dùng lại chúng không
//     mở thêm bề mặt nào: kẻ xấu muốn bơm MISA thì POST thẳng sang MISA còn
//     nhanh hơn. Đổi lại, luồng đang chạy KHÔNG đứt chỉ vì thiếu một bước ops.
//     Đặt env khi muốn ghim cứng giá trị, không cho phía client đổi.
// =============================================================================

const MISA_ENDPOINT =
  "https://amisapp.misa.vn/crm/gc/api/open/WebForm/savecollection";

const TIMEOUT_MS = 5_000;

/** Trường dữ liệu được phép chuyển tiếp — đúng bộ trường của form Sale. */
const FORWARDABLE = new Set<string>(Object.values(SALE_FORM_FIELDS));

export type MirrorOutcome =
  | { status: "off" }
  | { status: "misconfigured"; missing: string[] }
  | { status: "sent"; via: "env" | "form" }
  | { status: "failed"; reason: string };

/** 3 tham số định danh form. Ưu tiên env; thiếu thì lấy chính cái form gửi lên. */
function misaFormConfig(payload: Record<string, string>): {
  config: Record<string, string> | null;
  via: "env" | "form";
  missing: string[];
} {
  // Đường ưu tiên: env (pin được, người ngoài không đổi được).
  const envId = process.env.MISA_WEBFORM_ID;
  const envCompany = process.env.MISA_WEBFORM_COMPANYCODE;
  const envKey = process.env.MISA_WEBFORM_KEY;

  const pick = (fromEnv: string | undefined, fromForm: string | undefined) =>
    (fromEnv && fromEnv.trim()) || (fromForm && fromForm.trim()) || "";

  const id = pick(envId, payload.ID);
  const companyCode = pick(envCompany, payload.Companycode);
  const formKey = pick(envKey, payload.FormKey);

  const missing: string[] = [];
  if (!id) missing.push("MISA_WEBFORM_ID");
  if (!companyCode) missing.push("MISA_WEBFORM_COMPANYCODE");
  if (!formKey) missing.push("MISA_WEBFORM_KEY");
  if (missing.length > 0) return { config: null, via: "env", missing };

  const via: "env" | "form" =
    envId && envCompany && envKey ? "env" : "form";

  return {
    config: {
      ID: id,
      Companycode: companyCode,
      FormKey: formKey,
      AllowURL: "*",
      // MISA trả redirect sau khi lưu. Ta không đọc/không đi theo response, đặt
      // giá trị này chỉ để payload khớp hình dạng bên đó vẫn nhận.
      RedirectURL:
        process.env.MISA_WEBFORM_REDIRECT ?? "https://sale.satarobo.vn/thank-you",
    },
    via,
    missing: [],
  };
}

/**
 * Gửi bản sao phiếu sang MISA. KHÔNG BAO GIỜ ném — mọi lỗi trả về trong kết quả.
 * Caller nên `await` (serverless hay giết tiến trình ngay sau response) nhưng
 * không được để kết quả ảnh hưởng tới việc lead đã tạo.
 */
export async function mirrorSaleFormToMisa(
  payload: Record<string, string>,
): Promise<MirrorOutcome> {
  try {
    const enabled = await getSetting("intake.mirrorMisa");
    if (!enabled) return { status: "off" };
  } catch (err) {
    console.error("[misa-mirror] không đọc được cờ intake.mirrorMisa:", err);
    return { status: "failed", reason: "setting-unreadable" };
  }

  const { config, via, missing } = misaFormConfig(payload);
  if (!config) {
    console.error(
      `[misa-mirror] Cờ intake.mirrorMisa ĐANG BẬT nhưng không dựng được tham số form ` +
        `(thiếu ${missing.join(", ")} ở env, và phiếu cũng không mang ID/Companycode/FormKey). ` +
        `MISA KHÔNG nhận được phiếu này. Đặt env hoặc tắt cờ để khỏi báo động giả.`,
    );
    return { status: "misconfigured", missing };
  }

  const body = new URLSearchParams(config);
  for (const [key, value] of Object.entries(payload)) {
    if (FORWARDABLE.has(key) && value) body.set(key, value);
  }

  try {
    const res = await fetch(MISA_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      redirect: "manual", // MISA trả 302 về RedirectURL — không đi theo.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // 2xx và 3xx đều là "MISA đã nhận" (bên đó redirect sau khi lưu).
    if (res.status >= 400) {
      console.error(`[misa-mirror] MISA trả ${res.status} (tham số lấy từ ${via})`);
      return { status: "failed", reason: `http-${res.status}` };
    }
    return { status: "sent", via };
  } catch (err) {
    const reason = err instanceof Error ? err.name : "unknown";
    console.error("[misa-mirror] gửi thất bại:", reason, err);
    return { status: "failed", reason };
  }
}
