// lib/security/client-ip.ts — IP DÙNG LÀM KHOÁ CHẶN TẦN SUẤT. Thuần, không chạm DB.
//
// ─────────────────────────────────────────────────────────────────────────────
// VẤN ĐỀ  [chủ dự án nêu 21/09/2026]
//
//   *"lib/auth.ts lấy IP cho rate limit từ đâu? Nếu từ X-Forwarded-For (hoặc header client
//   gửi được) thì trên prod kẻ dò mật khẩu cũng tự đổi IP được → cổng IP vô dụng."*
//
// Bản cũ (`lib/auth.ts:51`) lấy **phần tử ĐẦU** của `x-forwarded-for`:
//
//     const xff = request?.headers?.get("x-forwarded-for");
//     if (xff) return xff.split(",")[0]!.trim();
//
// Đầu chuỗi XFF là đầu do CLIENT viết. Quy ước XFF là mỗi proxy **nối thêm vào CUỐI**, nên
// phần tử đầu là thứ xa nhất và ít đáng tin nhất — nếu nền tảng nối thay vì ghi đè thì
// `X-Forwarded-For: 1.2.3.4` do kẻ tấn công tự chèn sẽ thành khoá, và **mỗi request một
// khoá khác nhau** ⇒ trần 10 lượt/phút không bao giờ chạm tới.
//
// ─────────────────────────────────────────────────────────────────────────────
// VÌ SAO KHÔNG ĐI ĐO HÀNH VI CỦA VERCEL TRƯỚC — và vì sao không cần
//
// Tôi **không đo được** "Vercel ghi đè hay nối thêm `x-forwarded-for`" một cách không xâm
// lấn: không endpoint nào của repo trả lại IP mà nó thấy (`grep x-vercel` ra 0 kết quả),
// và cổng chặn đăng nhập **im lặng theo thiết kế** — bị chặn hay sai mật khẩu đều trả
// `null` y hệt, nên nó không dùng làm oracle được. Oracle duy nhất còn lại là trần của
// `/api/leads`, mà nó chỉ đếm SAU khi payload hợp lệ ⇒ đo là đẻ lead rác thật.
//
// Nên bản vá này **đúng dưới CẢ HAI hành vi**, và đó là điều đáng giá hơn một phép đo:
//
//   · nếu Vercel GHI ĐÈ   → chuỗi chỉ có IP thật     → phần tử cuối = IP thật ✅
//   · nếu Vercel NỐI THÊM → `<giả>, <thật>`          → phần tử cuối = IP thật ✅
//
// Lấy phần tử **CUỐI** là phép phòng thủ chuẩn khi biết chắc có đúng một proxy tin được
// đứng ngay trước mình — và trên Vercel thì đúng là vậy.
//
// Ưu tiên số một vẫn là `x-vercel-forwarded-for`: Vercel **gỡ** mọi header `x-vercel-*` do
// client gửi trước khi gọi hàm, nên đó là thứ client không chạm được.
//
// ⚠️ KHÔNG fail-closed về một khoá chung. Cám dỗ là "không có header tin được thì trả
// hằng số" — nhưng như vậy CẢ CÔNG TY dùng chung một trần 10 lượt/phút, và 8 giờ sáng thứ
// Hai là tự khoá cửa chính mình. Ở đây fail-closed hại hơn fail-open.

/** Header dành riêng cho E2E — CHỈ có tác dụng NGOÀI production. */
export const HEADER_IP_E2E = "x-e2e-client-ip";

/**
 * Đang chạy trên PRODUCTION THẬT?
 *
 * ⚠️ `VERCEL_ENV` là nguồn đúng khi chạy trên Vercel: nó phân biệt `production` với
 * `preview` và với môi trường tuỳ biến (`test`). Chỉ khi KHÔNG có nó mới rơi về `NODE_ENV`.
 *
 * ⚠️ Vế `!CI` là bắt buộc, không phải thừa: `next start` luôn đặt `NODE_ENV=production`,
 * kể cả trên máy runner của CI. Thiếu vế đó thì mọi job E2E bị coi là production và cửa
 * test đóng sập — tức bản vá bảo mật này sẽ tự làm hỏng đúng bộ test mà nó phục vụ.
 */
/**
 * Chỉ cần đọc vài khoá, nên nhận `Record` thay vì `NodeJS.ProcessEnv`.
 *
 * ⚠️ Không phải để cho tiện: `NodeJS.ProcessEnv` ĐÒI có `NODE_ENV`, nên mọi fixture của
 * test phải bịa thêm khoá đó hoặc ép kiểu — và ép kiểu trong test là chỗ lỗi trốn vào.
 */
export type BienMoiTruong = Record<string, string | undefined>;

export function laProductionThat(env: BienMoiTruong = process.env): boolean {
  if (env.VERCEL_ENV) return env.VERCEL_ENV === "production";
  return env.NODE_ENV === "production" && !env.CI;
}

type DocHeader = { get(name: string): string | null } | undefined;

/**
 * IP dùng làm khoá chặn tần suất.
 *
 * Thứ tự, và mỗi bậc đều có lý do:
 *   1. `x-vercel-forwarded-for` — nền tảng đặt, client KHÔNG giả được (Vercel gỡ header
 *      `x-vercel-*` đến từ ngoài). Tin tuyệt đối.
 *   2. `x-e2e-client-ip` — **chỉ ngoài production**. Cửa để bộ E2E mô phỏng nhiều người
 *      dùng khác nhau mà KHÔNG phải tắt cổng chặn.
 *   3. phần tử **CUỐI** của `x-forwarded-for` — xem khối chú thích đầu tệp.
 *   4. `x-real-ip` — proxy tự đặt; client gửi được nhưng nó chỉ tới lượt khi 1–3 đều trống.
 *   5. `"unknown"` — một khoá chung, chỉ xảy ra khi không có header nào (gọi nội bộ).
 */
export function ipChoRateLimit(
  headers: DocHeader,
  env: BienMoiTruong = process.env,
): string {
  const doc = (ten: string) => headers?.get(ten)?.trim() || null;

  const cuaVercel = doc("x-vercel-forwarded-for");
  if (cuaVercel) return phanTuCuoi(cuaVercel);

  if (!laProductionThat(env)) {
    const e2e = doc(HEADER_IP_E2E);
    if (e2e) return e2e;
  }

  const xff = doc("x-forwarded-for");
  if (xff) return phanTuCuoi(xff);

  return doc("x-real-ip") ?? "unknown";
}

/**
 * Phần tử CUỐI của một chuỗi kiểu `a, b, c`.
 *
 * ⚠️ Cuối chứ không phải đầu. Đây là toàn bộ nội dung của bản vá — đổi lại thành `[0]` là
 * mở lại đúng lỗ đã vá, và diff của nó trông vô hại. Ca `[CIP-03]` ghim.
 */
function phanTuCuoi(chuoi: string): string {
  const phan = chuoi
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return phan[phan.length - 1] ?? "unknown";
}

// ─────────────────────────────────────────────────────────────────────────────
// CỬA TẮT CHẶN TẦN SUẤT ĐĂNG NHẬP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `LOGIN_RATELIMIT_DISABLED=1` có được phép có tác dụng không.
 *
 * Chủ dự án chốt 21/09/2026: *"thêm chốt cứng — bị BỎ QUA khi VERCEL_ENV=production (hoặc
 * NODE_ENV=production ngoài CI), log cảnh báo nếu thấy nó được đặt trên prod."*
 *
 * ⚠️ BỎ QUA chứ không NÉM. `lib/otp/service.ts:49` chọn ném khi thấy `OTP_TEST_FIXED_CODE`
 * trên production, và đó là lựa chọn đúng cho NÓ — một mã OTP hằng số làm mọi tài khoản mở
 * toang, chết sớm là đúng. Ở đây ngược lại: ném nghĩa là **cả site không đăng nhập được**
 * vì một biến env thừa. Bỏ qua + kêu to giữ đúng phần an toàn mà không tự gây sự cố.
 *
 * ⚠️ Log ở mức `error` chứ không `warn`: một biến tắt-lưới-an-ninh nằm trên production là
 * thứ phải nổi lên trong Sentry, không phải một dòng trôi qua.
 */
export function duocTatChanTanSuatDangNhap(
  env: BienMoiTruong = process.env,
  ghiLoi: (s: string) => void = (s) => console.error(s),
): boolean {
  if (env.LOGIN_RATELIMIT_DISABLED !== "1") return false;
  if (laProductionThat(env)) {
    ghiLoi(
      "[SEC] LOGIN_RATELIMIT_DISABLED đang được ĐẶT TRÊN PRODUCTION — đã BỎ QUA, cổng " +
        "chặn brute-force đăng nhập vẫn hoạt động. Gỡ biến env này khỏi môi trường " +
        "production rồi deploy lại.",
    );
    return false;
  }
  return true;
}
