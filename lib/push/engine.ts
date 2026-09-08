import "server-only";

// lib/push/engine.ts — nửa GỬI của Web Push nội bộ (US-14b, Đợt 4).
//
// Một lượt = đọc công tắc → gác khoá → cứu dòng treo → giành chỗ một lô → gửi từng thiết bị →
// chốt số phận từng dòng → dọn dòng cũ. Route cron chỉ gọi hàm này; MỌI luật nằm ở đây và ở
// `ket-qua.ts` (thuần) để test được không cần HTTP — đúng nếp `lib/chat/zns-notify.ts`.
//
// ── BA LỖI CỦA HAI TIỀN LỆ TRONG REPO, CỐ Ý KHÔNG KẾ THỪA ───────────────────────────────
// 1. `lib/events/dispatcher.ts:19-22` — reaper lọc `createdAt < cutoff`. `createdAt` là lúc SINH
//    việc, không phải lúc bắt đầu xử lý: một dòng nằm chờ hơn 5 phút rồi mới được giành sẽ bị
//    reaper kéo về PENDING NGAY TRONG LÚC đang gửi ⇒ lượt sau giành lại ⇒ GỬI ĐÔI. Cột
//    `WebPushOutbox.claimedAt` tồn tại đúng để tránh việc đó, và reaper dưới đây đo theo nó.
// 2. `lib/events/dispatcher.ts:64` — `attempts` chỉ tăng ở CUỐI. Tiến trình chết giữa chừng thì
//    dòng đó không bao giờ tiêu một attempt nào ⇒ dòng độc quay vòng vô hạn. Ở đây `attempts`
//    tăng CÙNG CÂU với lúc giành chỗ.
// 3. `lib/email/queue.ts:62-66` — KHÔNG có bước giành chỗ nào, chỉ `findMany` rồi gửi thẳng. Hai
//    lượt cron chồng nhau là gửi trùng. Với email đó là phiền; với push thì cái giá đã ghi vào
//    schema: người dùng tắt quyền thông báo ở CẤP TRÌNH DUYỆT, mất kênh vĩnh viễn, code không
//    xin lại được.

import type { Prisma } from "@prisma/client";
import { sendNotification, WebPushError } from "web-push";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings/service";
import { duocDayPush } from "./allowlist";
import {
  backoffMs,
  bamEndpoint,
  chotKetCuc,
  docRetryAfterMs,
  docSoKetQua,
  nhanEndpoint,
  phanLoaiMa,
  type LoaiKetCuc,
  type SoKetQua,
} from "./ket-qua";
import { dungGoiTin } from "./payload";
import { endpointConAnToan } from "./subscription";
import {
  chuanHoaVapidSubject,
  laKhoaCongKhaiVapidHopLe,
  laKhoaRiengVapidHopLe,
} from "./vapid";

// ── Tham số vận hành ────────────────────────────────────────────────────────────────────

/** Số dòng outbox tối đa một lượt cron xử. */
export const LO_MAC_DINH = 25;

/**
 * Ngân sách thời gian của một lượt, mili giây.
 *
 * Route khai `maxDuration = 60`. Mỗi thiết bị là MỘT request HTTPS ra ngoài, nên một lô xấu
 * (nhiều máy, mạng chậm) có thể chạm trần lambda. Bị cắt giữa chừng thì dòng đang xử nằm lại ở
 * `SENDING` và phải chờ reaper — không mất dữ liệu, nhưng chậm 5 phút. Dừng chủ động khi gần
 * hết giờ thì phần chưa xử vẫn nguyên `PENDING` và lượt sau (1 phút nữa) lấy tiếp.
 */
export const NGAN_SACH_MS = 45_000;

/** Quá mốc này mà vẫn `SENDING` thì coi như tiến trình đã chết — kéo về `PENDING`. */
export const HAN_TREO_MS = 5 * 60_000;

/** Socket timeout cho một cú gửi. Cùng bậc với `lib/zalo/provider.ts`. */
export const TIMEOUT_GUI_MS = 10_000;

/**
 * Push service giữ tin bao lâu nếu máy đang offline, tính bằng GIÂY.
 *
 * Mặc định của gói `web-push` là 4 TUẦN — sai hoàn toàn với kênh này: điện thoại tắt nguồn ba
 * ngày rồi bật lên mà nổ "Bạn có lead mới" từ tuần trước là thông báo gây hại, không phải
 * thông báo trễ. 6 giờ, khớp `HAN_MAC_DINH_MS` của `outbox.ts`.
 */
export const TTL_GIAY = 6 * 60 * 60;

/** Dòng `DEAD`/`SKIPPED` cũ hơn mốc này thì xoá. */
export const HAN_DON_MS = 30 * 24 * 60 * 60_000;

// ── Hợp đồng gửi (tiêm được cho test) ───────────────────────────────────────────────────

export interface KetQuaGui {
  statusCode: number;
}

/**
 * Hàm gửi MỘT gói tin tới MỘT thiết bị.
 *
 * Tiêm được để test không mở socket nào. Mặc định là `sendNotification` của gói `web-push`.
 *
 * ⚠️ Test nào giả lập lỗi PHẢI ném `WebPushError` THẬT (import từ `web-push`), không tự chế một
 * lớp cùng tên: engine phân loại bằng `instanceof`, nên một lớp giả làm mọi lỗi rơi vào nhánh
 * "lỗi lạ" và bộ test xanh giả trong khi đường thật hỏng.
 */
export type HamGui = (
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  opts: {
    TTL: number;
    urgency: "high";
    timeout: number;
    vapidDetails: { subject: string; publicKey: string; privateKey: string };
  },
) => Promise<KetQuaGui>;

const guiThat: HamGui = (sub, payload, opts) => sendNotification(sub, payload, opts);

// ── Kết quả một lượt ────────────────────────────────────────────────────────────────────

export interface KetQuaLuot {
  /** true = không làm gì cả (công tắc tắt hoặc khoá hỏng). Không dòng nào bị đụng. */
  skipped: boolean;
  reason?: "DISABLED" | "NO_VAPID";
  /** Dòng treo được kéo về PENDING. */
  reaped: number;
  /** Dòng giành được trong lượt này. */
  claimed: number;
  sent: number;
  failed: number;
  dead: number;
  skippedRows: number;
  /** Dòng cũ đã xoá. */
  purged: number;
  /** true = dừng vì hết ngân sách thời gian, còn dòng chưa xử. */
  hetGio: boolean;
}

const LUOT_RONG: KetQuaLuot = {
  skipped: false,
  reaped: 0,
  claimed: 0,
  sent: 0,
  failed: 0,
  dead: 0,
  skippedRows: 0,
  purged: 0,
  hetGio: false,
};

interface CauHinhVapid {
  subject: string;
  publicKey: string;
  privateKey: string;
}

/**
 * Đọc + gác cấu hình VAPID.
 *
 * Gác ở ĐẦU LƯỢT và dừng CẢ LƯỢT nếu hỏng, chứ không để từng dòng tự chết: một lần dán nhầm
 * biến môi trường mà cứ chạy tiếp thì mỗi dòng ăn một lỗi 400/403, tiêu hết `maxAttempts` và
 * chuyển sang `DEAD` — tức một thao tác vận hành sai sẽ ĐỐT SẠCH hàng đợi, và không có đường
 * nào lấy lại. Dừng sạch thì sửa env xong là lượt sau chạy tiếp như chưa có gì.
 *
 * CỐ Ý chỉ ba biến: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (server đọc CHÍNH biến này, không có bản
 * `VAPID_PUBLIC_KEY` riêng), `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Hai biến giữ cùng một khoá
 * công khai mà lệch nhau = 403 `VapidPkHashMismatch` cho MỌI thiết bị, và không lint/build nào
 * bắt được — đúng vết `AUTH_SECRET` vs `NEXTAUTH_SECRET` của repo.
 */
function docCauHinhVapid(): CauHinhVapid | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
  const subject = chuanHoaVapidSubject(process.env.VAPID_SUBJECT ?? "");

  if (!laKhoaCongKhaiVapidHopLe(publicKey)) {
    console.error("[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY thiếu hoặc sai hình dạng — bỏ cả lượt");
    return null;
  }
  if (!laKhoaRiengVapidHopLe(privateKey)) {
    console.error("[push] VAPID_PRIVATE_KEY thiếu hoặc sai hình dạng — bỏ cả lượt");
    return null;
  }
  if (!subject) {
    // Push service dùng địa chỉ này để liên hệ khi hạ tầng ta gây sự cố; thiếu/sai thì một số
    // dịch vụ từ chối thẳng. Đây là lỗi cấu hình, không phải lỗi của dòng nào.
    console.error("[push] VAPID_SUBJECT phải là mailto: hoặc https: — bỏ cả lượt");
    return null;
  }
  return { subject, publicKey, privateKey };
}

/**
 * Bóc lỗi của một cú gửi thành (mã, mốc chờ, thông điệp) — KHÔNG để rò endpoint.
 *
 * Ba loại thất bại có hình dạng khác nhau (đo trên `web-push@3.6.7`):
 *  · ngoài 2xx → `WebPushError` có `statusCode` + `headers` + `body`;
 *  · đứt mạng / socket timeout → `Error` thường, KHÔNG có `statusCode`;
 *  · đầu vào sai → `Error` thường (đã chặn trước bằng cách tự kiểm thiết bị).
 *
 * ⚠️ `err.message` của `WebPushError` LUÔN là hằng "Received unexpected response code" cho mọi
 * mã 4xx/5xx — phân loại bằng thông điệp là gộp 410 với 429 với 500 làm một. Lý do THẬT nằm ở
 * `body` (vd `VapidPkHashMismatch`, `push subscription has unsubscribed or expired`).
 *
 * ⚠️ TUYỆT ĐỐI không `JSON.stringify(err)`: cả 6 thuộc tính của `WebPushError` là own-enumerable,
 * trong đó có `endpoint` — tức một dòng log vô tình chứa nguyên khả năng gửi vào máy nhân viên.
 */
function bocLoi(err: unknown, now: Date): { code: number | null; choMs: number | null; loi: string } {
  if (err instanceof WebPushError) {
    const than = String(err.body ?? "").trim().slice(0, 180);
    return {
      code: err.statusCode,
      choMs: docRetryAfterMs(err.headers, now),
      loi: than ? `HTTP ${err.statusCode}: ${than}` : `HTTP ${err.statusCode}`,
    };
  }
  const m = err instanceof Error ? err.message : String(err);
  return { code: null, choMs: null, loi: m.slice(0, 180) };
}

interface ThietBiDeGui {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  origin: string;
}

/** Hậu quả cần ghi lại lên chính bản ghi thiết bị sau một cú gửi. */
interface HauQuaThietBi {
  id: string;
  loai: LoaiKetCuc;
  code: number | null;
}

/**
 * Một lượt gửi push.
 *
 * `gui` tiêm được cho test; `now`/`batchSize`/`nganSachMs` để test đo được biên.
 */
export async function chayLuotGuiPush(opts?: {
  now?: Date;
  batchSize?: number;
  nganSachMs?: number;
  gui?: HamGui;
}): Promise<KetQuaLuot> {
  const now = opts?.now ?? new Date();
  const batchSize = opts?.batchSize ?? LO_MAC_DINH;
  const nganSach = opts?.nganSachMs ?? NGAN_SACH_MS;
  const gui = opts?.gui ?? guiThat;
  const batDau = Date.now();

  // ── Cổng 1: công tắc. Tắt ⇒ THOÁT SẠCH, không đọc bảng nào, không đánh dấu gì.
  //
  // `.catch(() => false)` fail-closed: `getSetting` NÉM khi khoá không có trong registry, và
  // "không đọc được cấu hình" tuyệt đối không được hiểu thành "cứ gửi đi".
  //
  // ⚠️ Cache của `getSetting` là `revalidate: 300` ⇒ gạt TẮT trên màn cấu hình có hiệu lực
  // trong ≤5 PHÚT, không phải tức thì (nhánh invalidate theo tag chỉ ăn trong Server Action).
  const bat = await getSetting("push.webPushEnabled").catch(() => false);
  if (!bat) return { ...LUOT_RONG, skipped: true, reason: "DISABLED" };

  // ── Cổng 2: khoá VAPID.
  const vapid = docCauHinhVapid();
  if (!vapid) return { ...LUOT_RONG, skipped: true, reason: "NO_VAPID" };

  const kq: KetQuaLuot = { ...LUOT_RONG };

  // ── Cứu dòng treo. ĐO THEO `claimedAt`, không theo `createdAt` (xem đầu file).
  //
  // Vế `claimedAt: null` là lưới an toàn: một dòng `SENDING` mà `claimedAt` rỗng (ghi bằng tay,
  // hoặc một đường code tương lai quên set) sẽ KẸT VĨNH VIỄN nếu reaper chỉ so `lt: cutoff`.
  const mocTreo = new Date(now.getTime() - HAN_TREO_MS);
  const cuu = await db.webPushOutbox.updateMany({
    where: {
      status: "SENDING",
      OR: [{ claimedAt: { lt: mocTreo } }, { claimedAt: null }],
    },
    // `nextAttemptAt: now` — cho lượt kế lấy ngay. `attempts` GIỮ NGUYÊN: nó đã bị tiêu lúc
    // giành chỗ, nên dòng chết đi chết lại vẫn cạn lượt đúng hạn thay vì quay vòng vô hạn.
    data: { status: "PENDING", nextAttemptAt: now, claimedAt: null },
  });
  kq.reaped = cuu.count;

  // ── Quét ứng viên. `FAILED` = "lượt trước hỏng, còn hẹn giờ", KHÁC `DEAD` = "bỏ cuộc".
  const ungVien = await db.webPushOutbox.findMany({
    where: { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: "asc" },
    take: batchSize,
    select: {
      id: true,
      userId: true,
      dedupeKey: true,
      attempts: true,
      maxAttempts: true,
      expiresAt: true,
      resultJson: true,
    },
  });

  for (const dong of ungVien) {
    if (Date.now() - batDau > nganSach) {
      kq.hetGio = true;
      break;
    }

    // ── GIÀNH CHỖ. Một câu UPDATE nguyên tử có điều kiện trạng thái: hai lượt cron chồng nhau
    // thì đúng một bên thắng, bên kia thấy `count === 0` và bỏ qua.
    const gianh = await db.webPushOutbox.updateMany({
      where: { id: dong.id, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "SENDING", claimedAt: now, attempts: { increment: 1 } },
    });
    if (gianh.count === 0) continue;
    kq.claimed++;

    const soLanDaThu = dong.attempts + 1;

    try {
      const ket = await xuLyMotDong({ dong, soLanDaThu, now, vapid, gui });
      if (ket === "SENT") kq.sent++;
      else if (ket === "FAILED") kq.failed++;
      else if (ket === "DEAD") kq.dead++;
      else kq.skippedRows++;
    } catch (err) {
      // Một dòng hỏng không được giết cả lô. Để nó ở `FAILED` có hẹn giờ; cạn lượt thì lượt
      // sau `chotKetCuc` sẽ đưa về `DEAD`.
      console.error(`[push] lỗi khi xử dòng outbox ${dong.id}:`, err);
      kq.failed++;
      await db.webPushOutbox
        .update({
          where: { id: dong.id },
          data: {
            status: soLanDaThu >= dong.maxAttempts ? "DEAD" : "FAILED",
            nextAttemptAt: new Date(now.getTime() + backoffMs(soLanDaThu)),
            claimedAt: null,
            lastError: (err instanceof Error ? err.message : String(err)).slice(0, 180),
          },
        })
        .catch(() => undefined);
    }
  }

  // ── Dọn dòng cũ. Chỉ `DEAD`/`SKIPPED` — hai trạng thái đã chốt, không ai đọc lại để quyết gì.
  //
  // Vì sao phải có: mọi thông báo NGOÀI allowlist đều ghi một dòng `SKIPPED`, ước lượng
  // 50–150 dòng/ngày ⇒ 18k–55k dòng/năm nếu không dọn. Index `[status, createdAt]` dựng sẵn
  // đúng cho câu này. Đặt SAU vòng gửi để chưa bao giờ tranh giờ với việc chính.
  const kqDon = await db.webPushOutbox
    .deleteMany({
      where: {
        status: { in: ["DEAD", "SKIPPED"] },
        createdAt: { lt: new Date(now.getTime() - HAN_DON_MS) },
      },
    })
    .catch((err: unknown) => {
      console.warn("[push] dọn dòng cũ lỗi (không ảnh hưởng việc gửi):", err);
      return { count: 0 };
    });
  kq.purged = kqDon.count;

  return kq;
}

/** Xử một dòng đã giành được. Trả về trạng thái cuối. */
async function xuLyMotDong(params: {
  dong: {
    id: string;
    userId: string;
    dedupeKey: string;
    attempts: number;
    maxAttempts: number;
    expiresAt: Date | null;
    resultJson: Prisma.JsonValue | null;
  };
  soLanDaThu: number;
  now: Date;
  vapid: CauHinhVapid;
  gui: HamGui;
}): Promise<"SENT" | "FAILED" | "DEAD" | "SKIPPED"> {
  const { dong, soLanDaThu, now, vapid, gui } = params;

  const boQua = async (lyDo: string): Promise<"SKIPPED"> => {
    await db.webPushOutbox.update({
      where: { id: dong.id },
      data: { status: "SKIPPED", claimedAt: null, lastError: lyDo.slice(0, 180) },
    });
    return "SKIPPED";
  };

  // ── Quá hạn ⇒ bỏ. Bật lại kênh sau một đợt tắt KHÔNG được xả tin cũ hàng loạt.
  if (dong.expiresAt && dong.expiresAt.getTime() <= now.getTime()) {
    return boQua("Quá hạn gửi");
  }

  // ── Ngoài allowlist ⇒ bỏ. Điểm móc đã lọc rồi, nhưng kiểm LẠI ở đây là cổng thật: dòng có
  // thể được ghi trước một lần đổi allowlist, hoặc bằng tay.
  if (!duocDayPush(dong.dedupeKey)) {
    return boQua("Ngoài allowlist tiền tố dedupeKey");
  }

  // ── Đọc nội dung NGAY LÚC GỬI, không dùng bản chụp lúc ghi.
  //
  // Đây là cổng chặn ca THU HỒI, và nó là ca có thật xảy ra trong vài phút: lead chuyển từ A
  // sang B thì `thuHoiChuongLeadCu` đặt chuông của A về `REVOKED`, nhưng dòng outbox của A vẫn
  // nằm đó. Không đọc lại thì cron sẽ nổ "Bạn có lead mới" trên màn hình khoá của A về một lead
  // họ không còn giữ — và bấm vào thì `scopedDb` lọc mất, ra trang "không tồn tại". Push đã nổ
  // thì KHÔNG thu hồi được.
  const chuong = await db.staffNotification.findUnique({
    where: { userId_dedupeKey: { userId: dong.userId, dedupeKey: dong.dedupeKey } },
    select: { title: true, body: true, href: true, state: true, expiresAt: true },
  });
  if (!chuong) return boQua("Không còn thông báo tương ứng");
  if (chuong.state !== "ACTIVE") return boQua(`Thông báo đã ${chuong.state}`);
  if (chuong.expiresAt && chuong.expiresAt.getTime() <= now.getTime()) {
    return boQua("Thông báo đã hết hạn");
  }

  // ── Thiết bị phân giải theo `userId` LÚC GỬI. Tuyệt đối không chốt `subscriptionId` lúc ghi:
  // endpoint có thể đổi chủ trên máy dùng chung, chốt sớm là lead của A nổ trên màn hình của B.
  const thietBi = await db.webPushSubscription.findMany({
    where: { userId: dong.userId, status: "ACTIVE" },
    select: { id: true, endpoint: true, p256dh: true, auth: true, origin: true },
  });

  const soCu = docSoKetQua(dong.resultJson);
  const soMoi: SoKetQua = { ...soCu };
  const hauQua: HauQuaThietBi[] = [];

  // Chỉ gửi cho máy CHƯA có kết quả thành công ⇒ máy đã nhận không bao giờ bị bắn lại ở lượt
  // thử sau. Đây là lý do `resultJson` khoá theo băm endpoint chứ không phải theo thứ tự.
  const canGui: ThietBiDeGui[] = [];
  for (const tb of thietBi) {
    const bam = bamEndpoint(tb.endpoint);
    if (soCu[bam]?.loai === "THANH_CONG") continue;

    // Cổng SSRF của đường GỬI — đừng tin cột trong DB (xem `endpointConAnToan`).
    if (!endpointConAnToan(tb.endpoint)) {
      soMoi[bam] = {
        may: nhanEndpoint(tb.endpoint),
        code: null,
        loai: "CHET",
        at: now.toISOString(),
        loi: "Endpoint không hợp lệ",
      };
      hauQua.push({ id: tb.id, loai: "CHET", code: null });
      continue;
    }
    canGui.push(tb);
  }

  // Gửi song song: mỗi thiết bị một request HTTPS độc lập, và một máy hỏng không được làm
  // chậm máy còn lại.
  //
  // ⚠️ Cả phần DỰNG gói tin cũng nằm trong `try`, không chỉ cú gửi. Nếu để ngoài thì một lỗi
  // ở đó (vd `encodeURIComponent` gặp lone surrogate trong href) làm promise bị REJECT, và một
  // promise reject thì không mang theo `tb` — thiết bị đó BIẾN MẤT khỏi sổ kết quả. Với người
  // chỉ có một máy, hậu quả là dòng bị chốt `SKIPPED` ("không còn thiết bị nào") thay vì lỗi:
  // mất push, không có vết, và không ai đi tìm vì sổ nói mọi thứ bình thường.
  const luotGui = await Promise.allSettled(
    canGui.map(async (tb) => {
      try {
        const { chuoi, daCat } = dungGoiTin({
          title: chuong.title,
          body: chuong.body,
          href: chuong.href,
          dedupeKey: dong.dedupeKey,
          origin: tb.origin,
        });
        if (daCat) {
          // Không phải lỗi, nhưng phải để lại vết: nội dung chuông dài quá trần payload nghĩa
          // là MẪU CÂU của loại đó cần sửa, không phải chỗ này cần nới.
          console.warn(`[push] payload của "${dong.dedupeKey}" vượt trần, đã cắt bớt nội dung`);
        }
        const r = await gui(
          { endpoint: tb.endpoint, keys: { p256dh: tb.p256dh, auth: tb.auth } },
          chuoi,
          {
            TTL: TTL_GIAY,
            // Kênh này chỉ chở việc "cần biết ngay"; `normal` cho phép push service gom tin
            // lại chờ máy tỉnh dậy, đúng thứ làm hỏng lời hứa duy nhất của tính năng.
            urgency: "high",
            timeout: TIMEOUT_GUI_MS,
            // Truyền theo TỪNG lượt thay vì `setVapidDetails`: hàm kia ghi vào biến toàn cục
            // của tiến trình, mà lambda Vercel dùng lại tiến trình ấm ⇒ thứ tự nạp module trở
            // thành một điều kiện ngầm, và trong test nó rò trạng thái giữa các ca.
            vapidDetails: vapid,
          },
        );
        return { tb, code: r.statusCode, choMs: null as number | null, loi: "" };
      } catch (err) {
        const b = bocLoi(err, now);
        return { tb, code: b.code, choMs: b.choMs, loi: b.loi };
      }
    }),
  );

  // Mốc chờ mà push service yêu cầu, tra theo BĂM endpoint. Cố ý không tra theo nhãn
  // `nhanEndpoint` (host + 6 ký tự cuối): hai endpoint cùng nhà cung cấp trùng 6 ký tự cuối là
  // chuyện xảy ra được, và trùng nhãn thì `Retry-After` của máy này sẽ dùng cho máy kia.
  const choTheoBam = new Map<string, number | null>();

  for (let i = 0; i < luotGui.length; i++) {
    const r = luotGui[i];
    const tbGoc = canGui[i];
    if (!r || !tbGoc) continue;
    // Nhánh `rejected` LẼ RA không xảy ra (callback ở trên đã bọc try/catch), nhưng vẫn phải
    // có: bỏ qua nó là để một thiết bị rơi khỏi sổ mà không ai biết. Ghi nhận là lỗi TẠM để
    // lượt sau thử lại — an toàn hơn coi như đã gửi xong.
    const { tb, code, choMs, loi } =
      r.status === "fulfilled"
        ? r.value
        : { tb: tbGoc, code: null as number | null, choMs: null as number | null, loi: "Lỗi không mong đợi khi gửi" };
    const loai = phanLoaiMa(code);
    const bam = bamEndpoint(tb.endpoint);
    soMoi[bam] = {
      may: nhanEndpoint(tb.endpoint),
      code,
      loai,
      at: now.toISOString(),
      ...(loai === "THANH_CONG" ? {} : { loi }),
    };
    choTheoBam.set(bam, choMs);
    hauQua.push({ id: tb.id, loai, code });
  }

  await capNhatThietBi(hauQua, now);

  // Chốt số phận dựa trên TOÀN BỘ sổ (kể cả thành công của lượt trước): một người có hai máy,
  // điện thoại đã nhận từ lượt trước còn máy bàn vừa chết 410 ⇒ họ ĐÃ được báo ⇒ `SENT`.
  // Chỉ tính vào quyết định những dòng CÒN Ý NGHĨA: đã thành công (máy đó đã nhận, dù nay
  // người dùng có gỡ máy thì việc "đã báo" vẫn đúng), hoặc thuộc một thiết bị hiện còn ACTIVE.
  //
  // Vì sao phải lọc: sổ giữ cả kết quả của lượt trước. Máy A ăn 503 (THU_LAI) rồi người dùng
  // tự gỡ máy A — lượt sau `thietBi` rỗng, không có gì để gửi, nhưng dòng THU_LAI cũ vẫn nằm
  // trong sổ ⇒ `chotKetCuc` thấy "còn máy đáng thử" và giữ dòng ở `FAILED` thêm ~31 phút rồi
  // chốt `DEAD`. Câu trả lời ĐÚNG là `SKIPPED` ("không còn thiết bị nào") ngay lượt đó — không
  // có gì hỏng để ai đi xử lý, và `DEAD` là nhuộm đỏ sổ vận hành bằng một việc không tồn tại.
  const bamDangSong = new Set(thietBi.map((t) => bamEndpoint(t.endpoint)));
  const tatCa = Object.entries(soMoi).filter(
    ([bam, d]) => d.loai === "THANH_CONG" || bamDangSong.has(bam),
  );
  const chot = chotKetCuc({
    ketQua: tatCa.map(([bam, d]) => ({ loai: d.loai, choMs: choTheoBam.get(bam) ?? null })),
    soLanDaThu,
    maxAttempts: dong.maxAttempts,
    now,
  });

  const hong = tatCa.map(([, d]) => d).find((d) => d.loai !== "THANH_CONG");
  await db.webPushOutbox.update({
    where: { id: dong.id },
    data: {
      status: chot.status,
      nextAttemptAt: chot.nextAttemptAt ?? undefined,
      sentAt: chot.sentAt,
      claimedAt: null,
      resultJson: soMoi as unknown as Prisma.InputJsonValue,
      lastError: chot.status === "SENT" ? null : (hong?.loi ?? null),
      lastErrorCode: chot.status === "SENT" ? null : (hong?.code ?? null),
    },
  });

  return chot.status;
}

/**
 * Ghi hậu quả lên chính bản ghi thiết bị.
 *
 * 404/410 là mã DUY NHẤT được phép đổi `status` sang `EXPIRED` — đó là "endpoint không còn tồn
 * tại" theo RFC 8030 §7.3 (người dùng gỡ ứng dụng / xoá dữ liệu trình duyệt / push service dọn
 * đăng ký cũ).
 *
 * 403 CỐ Ý không gỡ: mã đó gần như luôn là `VapidPkHashMismatch` — KHOÁ SERVER vừa xoay, máy
 * người dùng vẫn tốt. Gỡ hàng loạt lúc đó là bắt cả công ty bật lại thông báo bằng tay trong
 * khi việc phải làm là dán lại khoá. Cột `vapidKeyId` sinh ra để phân biệt đúng ca này, và nó
 * chỉ có ích nếu ta KHÔNG xoá mất bằng chứng.
 */
async function capNhatThietBi(hauQua: readonly HauQuaThietBi[], now: Date): Promise<void> {
  for (const h of hauQua) {
    try {
      if (h.loai === "THANH_CONG") {
        await db.webPushSubscription.update({
          where: { id: h.id },
          // Reset `failureCount`: nó là thước đo "máy này đang hỏng liên tục", không phải sổ
          // cộng dồn cả đời. Không reset thì một máy khoẻ dùng 2 năm cũng trông như sắp chết.
          data: { lastSuccessAt: now, failureCount: 0, lastErrorCode: null },
        });
        continue;
      }
      await db.webPushSubscription.update({
        where: { id: h.id },
        data: {
          failureCount: { increment: 1 },
          lastFailureAt: now,
          lastErrorCode: h.code,
          ...(h.loai === "HET_HAN"
            ? {
                status: "EXPIRED" as const,
                revokedAt: now,
                revokedReason: `Push service trả ${h.code ?? "?"}`,
              }
            : {}),
        },
      });
    } catch (err) {
      // Thiết bị vừa bị người dùng tự gỡ giữa lúc ta gửi ⇒ `update` ném P2025. Không phải lỗi
      // của lượt gửi, và dòng outbox đã có kết quả đúng rồi.
      console.warn(`[push] không cập nhật được thiết bị ${h.id}:`, err);
    }
  }
}
