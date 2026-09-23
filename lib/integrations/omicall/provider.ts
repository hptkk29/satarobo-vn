import { getSetting } from "@/lib/settings/service";

// =============================================================================
// ADAPTER OMICALL — khuôn §2.2 của spec, chép từ `lib/zalo/provider.ts:91-125`.
//
// Bốn luật rút từ sự cố CÓ THẬT trong repo (§2.2 AD-1…AD-4):
//  AD-1 thiếu credential ⇒ trả lỗi CÓ MÃ, KHÔNG throw. Throw ở đây làm sập cả
//       luồng nạp CDR, tức mất luôn dữ liệu cuộc gọi vì một biến env thiếu.
//  AD-2 lỗi ĐỌC công tắc live (DB sập) ⇒ coi như KHÔNG live. Thà không gọi API
//       còn hơn gọi nhầm hàng loạt.
//  AD-3 chưa live ⇒ MÔ PHỎNG, không chạm API thật.
//  AD-4 mô phỏng phải NÓI RÕ là mô phỏng. Repo đang có hai cách xử lý SIMULATED
//       khác nhau, và nhánh sai (`lib/notify/attendance.ts:123-125`) vẫn đánh dấu
//       "đã gửi" ⇒ SỐ LIỆU NGHIỆM THU GIẢ. File này đi theo nhánh đúng.
//
// §2.3 — công tắc vào REGISTRY (`SystemSetting calls.live`), KHÔNG vào env. Env chỉ
// giữ BÍ MẬT (luật cứng #9) và cờ 2-phase bật/tắt cả tính năng (`OMICALL_ENABLED`).
// ⚠️ Cache setting có `revalidate` thật là 300s — đừng thiết kế "tắt gấp trong 5 giây".
//
// 🔴 CÒN CHỜ VĂN BẢN NHÀ CUNG CẤP (cổng CH-3): endpoint production (TQ-1), hạn mức
// và đơn giá ASR (TQ-2/TQ-3), chính sách lưu trữ + có tải được tệp ghi âm về không
// (TQ-4), cơ chế xác thực webhook (TQ-5). Vì vậy file này CỐ Ý chỉ có phần KHÔNG
// phụ thuộc bốn câu đó: nhận biết cấu hình, công tắc live, và một đường tải tệp
// ghi âm đã được viết sẵn nhưng chưa nối endpoint thật.
// =============================================================================

export type OmicallKetQua<T> =
  | ({ ok: true; simulated: boolean } & T)
  | { ok: false; ma: string; thongDiep?: string };

export type TaiGhiAmKetQua = OmicallKetQua<{ bytes?: ArrayBuffer; contentType?: string }>;

export interface OmicallProvider {
  readonly name: string;
  isConfigured(): boolean;
  isLive(): Promise<boolean>;
  taiGhiAm(nguon: string): Promise<TaiGhiAmKetQua>;
}

/** Đủ env để nói chuyện với nhà cung cấp chưa. KHÔNG log giá trị (luật cứng #9). */
function coCredential(): boolean {
  return Boolean(
    process.env.OMICALL_API_BASE && process.env.OMICALL_API_KEY && process.env.OMICALL_TENANT,
  );
}

export const omicallProvider: OmicallProvider = {
  name: "omicall",

  isConfigured() {
    return coCredential();
  },

  async isLive() {
    if (!coCredential()) return false;
    // AD-2 — setting THẮNG, env là dự phòng. Lỗi đọc ⇒ false (fail-closed).
    const tuDb = await getSetting("calls.live").catch(() => false);
    return Boolean(tuDb) || process.env.OMICALL_LIVE === "true";
  },

  /**
   * Tải tệp ghi âm từ nhà cung cấp về (để nơi gọi đẩy lên kho R2 RIÊNG).
   *
   * ⚠️ TQ-4 chưa có lời đáp: chưa biết OMICall có cho tải tệp về hay không, và giữ
   * bao lâu. Nếu KHÔNG tải về được thì cả thiết kế "lưu ở bucket private" không thực
   * hiện được — đó là câu hỏi chặn, không phải chi tiết.
   */
  async taiGhiAm(nguon: string): Promise<TaiGhiAmKetQua> {
    // AD-1 — thiếu cấu hình: lỗi CÓ MÃ, không throw, không fetch.
    if (!coCredential()) {
      return {
        ok: false,
        ma: "OMICALL_NOT_CONFIGURED",
        thongDiep: "Chưa cấu hình kết nối tổng đài (OMICALL_API_BASE/API_KEY/TENANT).",
      };
    }

    // AD-3 — chưa live: MÔ PHỎNG. Không một lời fetch nào.
    if (!(await this.isLive())) {
      // AD-4 — nói rõ là mô phỏng, và KHÔNG trả byte giả. Trả tệp rỗng rồi để nơi
      // gọi ghi `hasRecording = true` chính là cách tạo "số liệu nghiệm thu giả".
      return { ok: true, simulated: true };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(nguon, {
        headers: { "X-Api-Key": process.env.OMICALL_API_KEY ?? "" },
        signal: controller.signal,
      });
      if (!res.ok) {
        // Chỉ log MÃ trạng thái, không log header/khoá.
        return { ok: false, ma: `OMICALL_HTTP_${res.status}` };
      }
      return {
        ok: true,
        simulated: false,
        bytes: await res.arrayBuffer(),
        contentType: res.headers.get("content-type") ?? "audio/mpeg",
      };
    } catch (err) {
      return {
        ok: false,
        ma: "OMICALL_FETCH_FAILED",
        thongDiep: err instanceof Error ? err.message : undefined,
      };
    } finally {
      clearTimeout(timer);
    }
  },
};
