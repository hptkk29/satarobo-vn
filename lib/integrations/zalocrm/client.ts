import "server-only";
// lib/integrations/zalocrm/client.ts — GỌI NGƯỢC sang máy chủ ZaloCRM (Public API).
//
// =============================================================================
// ⚠️ CHƯA DÙNG THẬT. Đường này chỉ bật ở GĐ3 (đồng bộ nick, đối soát 5 phút, gửi
// tin). Viết trước để phần chạm mạng có một chỗ DUY NHẤT, đã đặt hạn giờ và đã có
// khuôn kết quả — chứ không phải để gọi ngay.
//
// 🔴 REPO KHÔNG CÓ HTTP CLIENT DÙNG CHUNG, và PR này CỐ Ý KHÔNG tạo một cái.
// Mỗi tích hợp trong repo tự `fetch` (MISA, Meta, Zalo OA, R2). Dựng một "helper
// chung" ở đây là quyết định kiến trúc cho cả repo, không phải việc của một lô —
// nên file này tự lo: `AbortController` 10 giây, `clearTimeout` trong `finally`.
//
// ⚠️ HẠN GIỜ LÀ BẮT BUỘC, không phải tuỳ chọn: `fetch` của Node KHÔNG có timeout mặc
// định. ZaloCRM chạy trên VPS riêng sau một Cloudflare Tunnel — tunnel đứt thì
// request treo cho tới khi hạ tầng cắt, và mỗi request treo giữ một function
// invocation của Vercel.
//
// ── KHOÁ API ─────────────────────────────────────────────────────────────────
// `ZALOCRM_API_KEYS` là JSON `{orgCode: key}` trong ENV (cùng lý do với
// `ZALOCRM_WEBHOOK_SECRETS` — luật cứng #9). Một key là TOÀN QUYỀN trên một org
// (`[ZCRM] public-api-routes.ts:14-24`: tra `AppSetting{public_api_key}` → `orgId`,
// không scope theo tài nguyên), nên nó không bao giờ được ra khỏi máy chủ và không
// bao giờ vào log.
// =============================================================================

/** Hạn giờ mỗi lượt gọi. Đủ rộng cho tunnel chậm, đủ hẹp để không giữ invocation. */
export const ZALOCRM_TIMEOUT_MS = 10_000;

export type MaLoiGoi =
  /** Thiếu `ZALOCRM_BASE_URL` hoặc khoá của org — lỗi cấu hình của mình. */
  | "CHUA_CAU_HINH"
  /** Quá `ZALOCRM_TIMEOUT_MS`. */
  | "HET_GIO"
  /** Không nối được (tunnel đứt, DNS hỏng). */
  | "KHONG_KET_NOI"
  /** Máy chủ trả mã lỗi HTTP. */
  | "LOI_HTTP"
  /** Trả 2xx nhưng thân không phải JSON đọc được. */
  | "THAN_KHONG_DOC_DUOC";

export type KetQuaGoi<T> =
  | { ok: true; data: T }
  | { ok: false; ma: MaLoiGoi; thongDiep: string; httpStatus?: number };

/**
 * Khoá API của một org.
 *
 * Trả `null` khi chưa khai — nơi gọi phải chịu được ca đó (GĐ0/GĐ1 chưa có khoá) và
 * KHÔNG được coi "chưa khai" là "gọi thành công".
 */
export function docKhoaApi(orgCode: string): string | null {
  const tho = process.env.ZALOCRM_API_KEYS;
  if (!tho?.trim()) return null;
  try {
    const doc: unknown = JSON.parse(tho);
    if (typeof doc !== "object" || doc === null || Array.isArray(doc)) return null;
    const v = (doc as Record<string, unknown>)[orgCode];
    return typeof v === "string" && v.trim() ? v : null;
  } catch {
    // KHÔNG in giá trị ra log — nó chứa khoá toàn quyền của mọi org.
    console.error("[zalocrm] ZALOCRM_API_KEYS không phải JSON hợp lệ.");
    return null;
  }
}

/**
 * Một lượt gọi sang ZaloCRM. **KHÔNG BAO GIỜ NÉM** — mọi hỏng hóc thành `{ok:false}`
 * có mã, để chỗ gọi (cron/đồng bộ) ghi `IntegrationLog` rồi đi tiếp thay vì chết cả job.
 */
export async function goiZalocrm<T>(input: {
  orgCode: string;
  /** Đường dẫn tính từ gốc, ví dụ `/api/public/conversations?limit=100`. */
  duongDan: string;
  method?: "GET" | "POST" | "PUT";
  than?: unknown;
  timeoutMs?: number;
}): Promise<KetQuaGoi<T>> {
  const goc = process.env.ZALOCRM_BASE_URL?.trim();
  const khoa = docKhoaApi(input.orgCode);
  if (!goc || !khoa) {
    return {
      ok: false,
      ma: "CHUA_CAU_HINH",
      thongDiep: "Chưa khai ZALOCRM_BASE_URL hoặc ZALOCRM_API_KEYS cho cơ sở này.",
    };
  }

  const controller = new AbortController();
  const hetGio = setTimeout(() => controller.abort(), input.timeoutMs ?? ZALOCRM_TIMEOUT_MS);
  try {
    const res = await fetch(`${goc.replace(/\/+$/, "")}${input.duongDan}`, {
      method: input.method ?? "GET",
      headers: {
        // Tên header đọc từ mã ZaloCRM (`[ZCRM] public-api-routes.ts:14-24`).
        "x-api-key": khoa,
        ...(input.than === undefined ? {} : { "content-type": "application/json" }),
      },
      body: input.than === undefined ? undefined : JSON.stringify(input.than),
      signal: controller.signal,
      // Không bao giờ cache một lượt gọi tích hợp.
      cache: "no-store",
    });

    if (!res.ok) {
      // Thân lỗi của bên kia có thể kèm dữ liệu khách — KHÔNG đưa vào thông điệp.
      return {
        ok: false,
        ma: "LOI_HTTP",
        httpStatus: res.status,
        thongDiep: `ZaloCRM trả mã ${res.status}.`,
      };
    }

    try {
      return { ok: true, data: (await res.json()) as T };
    } catch {
      return { ok: false, ma: "THAN_KHONG_DOC_DUOC", thongDiep: "Phản hồi không phải JSON." };
    }
  } catch (err) {
    const hetHan = err instanceof Error && err.name === "AbortError";
    return hetHan
      ? { ok: false, ma: "HET_GIO", thongDiep: `Quá ${ZALOCRM_TIMEOUT_MS}ms không phản hồi.` }
      : { ok: false, ma: "KHONG_KET_NOI", thongDiep: "Không kết nối được máy chủ ZaloCRM." };
  } finally {
    // BẮT BUỘC: bỏ quên là mỗi lượt gọi giữ một timer sống thêm 10 giây, và trong
    // môi trường serverless thì đó là invocation không chịu kết thúc.
    clearTimeout(hetGio);
  }
}

// ── Vài lượt gọi đã biết hình dạng (đọc từ mã ZaloCRM, §4.1) ─────────────────

export type HoiThoaiZalocrm = {
  id: string;
  lastMessageAt?: string | null;
  contact?: { id: string; fullName?: string | null; phone?: string | null } | null;
};

/** `GET /api/public/conversations?limit=…` — không có cursor, không có `since`. */
export function layHoiThoaiZalocrm(
  orgCode: string,
  limit = 100,
): Promise<KetQuaGoi<{ data?: HoiThoaiZalocrm[] }>> {
  return goiZalocrm({ orgCode, duongDan: `/api/public/conversations?limit=${limit}` });
}

export type TinZalocrm = {
  id: string;
  senderType?: "self" | "contact" | "ai_assistant";
  senderName?: string | null;
  content?: string | null;
  contentType?: string | null;
  sentAt?: string | null;
};

/** `GET /api/public/conversations/:id/messages?limit=…`. */
export function layTinZalocrm(
  orgCode: string,
  conversationId: string,
  limit = 50,
): Promise<KetQuaGoi<{ data?: TinZalocrm[] }>> {
  return goiZalocrm({
    orgCode,
    duongDan: `/api/public/conversations/${encodeURIComponent(conversationId)}/messages?limit=${limit}`,
  });
}

/**
 * `POST /api/public/messages/send`.
 *
 * ⚠️ HAI CHUYỆN PHẢI BIẾT TRƯỚC KHI DÙNG (đọc từ mã ZaloCRM, §4.1):
 *  · route này gọi thẳng `api.sendMessage` và **BỎ QUA trần chống khoá nội bộ** của
 *    ZaloCRM ⇒ trần phải do Sata tự gác, không có ai gác hộ;
 *  · nó trả `{success:true}` **KHÔNG kèm id tin**. Mà `ChannelSendOutcome.SENT` bắt
 *    buộc có `providerMessageId`, và `sendInboxReply` ghi id đó làm `channelMessageId`
 *    để echo về bị nhận ra là trùng. Không có id ⇒ adapter phải trả `FAILED`/`SKIPPED`,
 *    **TUYỆT ĐỐI không bịa id** — bịa là echo tạo dòng OUT thứ hai, mỗi tin hiện hai lần.
 */
export function guiTinZalocrm(
  orgCode: string,
  than: { zaloAccountId: string; threadId: string; content: string; threadType?: string },
): Promise<KetQuaGoi<{ success?: boolean }>> {
  return goiZalocrm({ orgCode, duongDan: "/api/public/messages/send", method: "POST", than });
}
