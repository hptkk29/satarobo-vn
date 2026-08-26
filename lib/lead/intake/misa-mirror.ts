import "server-only";
import { getSetting } from "@/lib/settings/service";
import { SALE_FORM_FIELDS } from "./map-sale-form";
import {
  buildMisaInternalFields,
  MISA_ALLOW_URL,
  MISA_REDIRECT_URL,
  type MisaInternalInput,
} from "./misa-internal";

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



/**
 * Đã ghi vết "thiếu env" trong tiến trình này chưa. Cố ý là biến MODULE (sống
 * theo instance serverless, không phải theo request): đủ để chặn cơn lũ một
 * dòng-mỗi-phiếu, mà vẫn ghi lại vài lần mỗi giờ nên không ai bỏ sót được.
 */
let misconfigReported = false;

/** Trường dữ liệu được phép chuyển tiếp — đúng bộ trường của form Sale. */
const FORWARDABLE = new Set<string>(Object.values(SALE_FORM_FIELDS));

export type MirrorOutcome =
  | { status: "off" }
  | {
      status: "misconfigured";
      missing: string[];
      /**
       * Tiến trình này ĐÃ ghi một vết cho đúng lỗi cấu hình này rồi.
       *
       * Thiếu env là lỗi CỐ ĐỊNH: phiếu nào cũng hỏng y hệt. Ghi mỗi phiếu một
       * dòng `WebhookDelivery` FAILED sẽ đẩy các dòng lỗi THẬT (phiếu dính
       * honeypot, phiếu MISA từ chối) ra khỏi cửa sổ 100 dòng của màn Replay —
       * tức là dọn sạch đúng chỗ để cứu lead. Caller nên bỏ qua việc ghi khi cờ
       * này bật; `console.error` thì vẫn kêu mỗi lần.
       */
      alreadyReported: boolean;
    }
  | { status: "sent"; via: "env" | "form" }
  | { status: "failed"; reason: string };

/** 3 tham số định danh form. Ưu tiên env; thiếu thì lấy chính cái form gửi lên. */
function misaFormConfig(
  payload: Record<string, string>,
  /**
   * Ưu tiên 3 tham số NẰM TRONG PHIẾU thay vì env.
   *
   * Chỉ đường phát lại phiếu CŨ bật cờ này, và đó là chuyện sống còn từ
   * 22/08/2026: env nay trỏ webform **"Form Nhập KH v2"** (bộ trường mới), còn
   * phiếu cũ mang bộ trường của form `c53af301-…` — trong đó SĐT là
   * `CustomField15`, ô mà form v2 KHÔNG có. Gửi phiếu cũ vào form mới thì MISA
   * nhận một bản ghi cụt, không báo lỗi. Phiếu cũ phải về đúng form đã sinh ra nó.
   */
  preferPayload = false,
): {
  config: Record<string, string> | null;
  via: "env" | "form";
  missing: string[];
} {
  // Đường ưu tiên: env (pin được, người ngoài không đổi được).
  const envId = process.env.MISA_WEBFORM_ID;
  const envCompany = process.env.MISA_WEBFORM_COMPANYCODE;
  const envKey = process.env.MISA_WEBFORM_KEY;

  const pick = (fromEnv: string | undefined, fromForm: string | undefined) => {
    const env = fromEnv?.trim() || "";
    const form = fromForm?.trim() || "";
    return preferPayload ? form || env : env || form;
  };

  const id = pick(envId, payload.ID);
  const companyCode = pick(envCompany, payload.Companycode);
  const formKey = pick(envKey, payload.FormKey);

  const missing: string[] = [];
  if (!id) missing.push("MISA_WEBFORM_ID");
  if (!companyCode) missing.push("MISA_WEBFORM_COMPANYCODE");
  if (!formKey) missing.push("MISA_WEBFORM_KEY");
  if (missing.length > 0) return { config: null, via: "env", missing };

  const usedEnv = id === envId?.trim() && companyCode === envCompany?.trim();
  const via: "env" | "form" = usedEnv ? "env" : "form";

  return {
    config: {
      ID: id,
      Companycode: companyCode,
      FormKey: formKey,
      // ⚠️ PHẢI TRÙNG mã nhúng của form — xem `MISA_ALLOW_URL`. Sai giá trị này
      // thì MISA vứt phiếu mà vẫn trả 302 (đã mất nửa buổi vì nó, 22/08/2026).
      AllowURL: process.env.MISA_WEBFORM_ALLOWURL ?? MISA_ALLOW_URL,
      // MISA trả redirect sau khi lưu. Ta không đọc/không đi theo response
      // (`redirect: "manual"`), đặt giá trị này chỉ để payload khớp hình dạng.
      RedirectURL: process.env.MISA_WEBFORM_REDIRECT ?? MISA_REDIRECT_URL,
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

  // `true`: phiếu cũ về đúng form cũ (xem chú thích ở `misaFormConfig`).
  const { config, via, missing } = misaFormConfig(payload, true);
  if (!config) {
    const alreadyReported = misconfigReported;
    misconfigReported = true;
    console.error(
      `[misa-mirror] Cờ intake.mirrorMisa ĐANG BẬT nhưng không dựng được tham số form ` +
        `(thiếu ${missing.join(", ")} ở env, và phiếu cũng không mang ID/Companycode/FormKey). ` +
        `MISA KHÔNG nhận được phiếu này. Đặt env hoặc tắt cờ để khỏi báo động giả.`,
    );
    return { status: "misconfigured", missing, alreadyReported };
  }

  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (FORWARDABLE.has(key) && value) fields[key] = value;
  }

  return postToMisa(config, fields, via);
}

/** Gửi một bộ trường đã dựng sẵn sang MISA. Dùng chung cho cả 2 biểu mẫu. */
async function postToMisa(
  config: Record<string, string>,
  fields: Record<string, string>,
  via: "env" | "form",
): Promise<MirrorOutcome> {
  const body = new URLSearchParams(config);
  for (const [key, value] of Object.entries(fields)) {
    if (value) body.set(key, value);
  }

  try {
    const res = await fetch(MISA_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      redirect: "manual", // MISA trả 302 về RedirectURL — không đi theo.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // ⚠️ 2xx/3xx chỉ chứng minh MISA **chấp nhận request**, KHÔNG chứng minh nó
    // đã lưu bản ghi: sai `AllowURL` là nó vứt phiếu mà vẫn trả 302 + Location.
    // Đường duy nhất bắt được ca đó là mở MISA ra nhìn — ta không có API để hỏi.
    // Bù lại, sai `ID`/`FormKey` thì MISA trả **500**, nên nhánh dưới vẫn bắt
    // được ca khoá hỏng/hết hạn.
    // Vết DUY NHẤT ta có để đối chứng khi MISA "nhận mà không lưu" (xem cảnh báo
    // ngay trên). Ghi cả lúc THÀNH CÔNG vì đó mới là ca khó: 302 nhìn y hệt nhau
    // dù phiếu được lưu hay bị vứt, nên khi bên MISA báo "không thấy" thì đây là
    // thứ duy nhất phân biệt được "app chưa gửi" với "MISA đã nhận rồi bỏ".
    // `x-request-id` đưa cho MISA hỗ trợ là họ tra được log hai đầu.
    // KHÔNG log `FormKey` (luật cứng #9 — không log giá trị secret).
    console.log(
      `[misa-mirror] MISA ${res.status} · x-request-id=${res.headers.get("x-request-id") ?? "(khong co)"} ` +
        `· AllowURL=${JSON.stringify(config.AllowURL)} · form=…${config.ID.slice(-6)} ` +
        `· truong=[${Object.keys(fields).join(",")}]`,
    );
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

/**
 * Bản sao phiếu từ biểu mẫu NỘI BỘ `/nhap-khach-hang` sang MISA.
 *
 * Khác `mirrorSaleFormToMisa`: phiếu ở đây do Server Action dựng, KHÔNG có 3
 * input ẩn (ID/Companycode/FormKey) mà biểu mẫu tĩnh cũ gửi kèm ⇒ **bắt buộc có
 * env `MISA_WEBFORM_*`**. Thiếu env thì trả `misconfigured` để caller ghi
 * `WebhookDelivery` — nhìn thấy được ở màn replay, không im lặng như log console.
 *
 * KHÔNG BAO GIỜ ném. Postgres là nguồn sự thật: lead đã ghi xong trước khi gọi
 * hàm này, hỏng ở đây tuyệt đối không được rollback lead.
 */
export async function mirrorInternalFormToMisa(
  input: MisaInternalInput,
): Promise<MirrorOutcome> {
  try {
    const enabled = await getSetting("intake.mirrorMisa");
    if (!enabled) return { status: "off" };
  } catch (err) {
    console.error("[misa-mirror] không đọc được cờ intake.mirrorMisa:", err);
    return { status: "failed", reason: "setting-unreadable" };
  }

  const { config, missing } = misaFormConfig({});
  if (!config) {
    const alreadyReported = misconfigReported;
    misconfigReported = true;
    console.error(
      `[misa-mirror] Cờ intake.mirrorMisa ĐANG BẬT nhưng thiếu ${missing.join(", ")} ` +
        `ở env — MISA KHÔNG nhận được phiếu từ /nhap-khach-hang. ` +
        `Đặt env hoặc tắt cờ để khỏi báo động giả.`,
    );
    return { status: "misconfigured", missing, alreadyReported };
  }

  const fields = buildMisaInternalFields(input, {
    // Khai khi MISA đã có ô riêng cho 2 giá trị này (xem misa-internal.ts).
    leadSource: process.env.MISA_FIELD_LEAD_SOURCE?.trim() || undefined,
    facebookUrl: process.env.MISA_FIELD_FACEBOOK?.trim() || undefined,
  });

  return postToMisa(config, fields, "env");
}
