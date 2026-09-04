import type { CallTechStatus } from "@prisma/client";

// =============================================================================
// OC-2 (QT-35) — TRẠNG THÁI CUỘC GỌI CHỈ TIẾN, KHÔNG LÙI.
//
// Webhook CDR KHÔNG bảo đảm thứ tự. Sự kiện "đổ chuông" tới sau sự kiện "nghe
// máy" là chuyện bình thường của mọi tổng đài. Xử lý ngây thơ (ghi đè theo sự
// kiện đến sau) thì một cuộc gọi đã nói chuyện 4 phút bị hạ về "đang đổ chuông"
// ⇒ mất KPI tỷ lệ nghe máy, và KHÔNG GÌ BÁO LỖI.
//
// ⚠️ Bỏ qua phần TRẠNG THÁI ≠ bỏ qua SỰ KIỆN. Nơi gọi vẫn phải lưu bản ghi thô
// (`CallLog.rawPayload`) — spec ghi rõ "vẫn lưu vết".
//
// FILE THUẦN — không import DB, không `server-only`. Test không cần Postgres.
// =============================================================================

/**
 * Bậc của từng trạng thái. Cố ý KHÔNG xếp theo trục thời gian của vòng đời cuộc
 * gọi: `ANSWERED` đứng CAO NHẤT vì "có người nghe" là sự thật mạnh nhất về một
 * cuộc gọi. Một sự kiện `NO_ANSWER` tới muộn không được phép xoá nó.
 *
 * Ba trạng thái kết thúc-không-đàm-thoại cùng bậc: chúng loại trừ nhau, nên
 * chuyện chuyển qua lại giữa chúng là dữ liệu mâu thuẫn chứ không phải "tiến".
 */
export const BAC_TRANG_THAI: Record<CallTechStatus, number> = {
  INITIATED: 0,
  RINGING: 1,
  NO_ANSWER: 2,
  BUSY: 2,
  FAILED: 2,
  ANSWERED: 3,
};

export function bacCuaTrangThai(tt: CallTechStatus): number {
  return BAC_TRANG_THAI[tt];
}

export type LyDoKhongTien = "TRANG_THAI_LUI" | "TRANG_THAI_KHONG_DOC_DUOC";

export type KetQuaTienTrangThai = {
  /** true = nơi gọi được phép ghi `techStatus`/`statusRank` mới. */
  nhan: boolean;
  /** Trạng thái SAU khi quyết định (giữ nguyên cũ nếu không nhận). */
  trangThai: CallTechStatus | null;
  bac: number;
  lyDo?: LyDoKhongTien;
};

/**
 * Quyết định có ghi trạng thái mới hay không.
 *
 * `hienTai = null` là bản ghi mới ⇒ nhận trạng thái đầu tiên.
 * `moi = null` là mã trạng thái nhà cung cấp gửi mà ta không đọc được ⇒ KHÔNG
 * nhận và KHÔNG ném: dữ liệu ngoài không được phép biến thành 500 (provider sẽ
 * retry bão).
 */
export function tienTrangThai(
  hienTai: CallTechStatus | null | undefined,
  moi: CallTechStatus | null | undefined,
): KetQuaTienTrangThai {
  const cu = hienTai ?? null;
  const bacCu = cu ? bacCuaTrangThai(cu) : -1;

  if (!moi) {
    return { nhan: false, trangThai: cu, bac: bacCu, lyDo: "TRANG_THAI_KHONG_DOC_DUOC" };
  }

  const bacMoi = bacCuaTrangThai(moi);
  // `<=`: bằng bậc cũng không tiến. Sự kiện trùng (OMI gửi lại) không được coi là
  // thay đổi — nếu coi là, mỗi lần gửi lại lại chạm vào `updatedAt` và làm nhiễu
  // mọi báo cáo "cuộc gọi đổi trạng thái lúc nào".
  if (bacMoi <= bacCu) {
    return { nhan: false, trangThai: cu, bac: bacCu, lyDo: "TRANG_THAI_LUI" };
  }

  return { nhan: true, trangThai: moi, bac: bacMoi };
}

/**
 * Đọc mã trạng thái THÔ của nhà cung cấp.
 *
 * ⚠️ BẢNG NÀY LÀ PHỎNG ĐOÁN. Chưa có văn bản OMICall (cổng CH-3 · TQ-1 — tài liệu
 * còn để host staging `public-v1-stg.omicrm.com`). Khi có văn bản thật thì sửa
 * ĐÚNG bảng này + bộ test của nó, không sửa chỗ khác.
 *
 * Không đọc được ⇒ `null` (nơi gọi bật cờ "cần rà soát"), TUYỆT ĐỐI không đoán
 * bừa: một mã lạ bị gán nhầm thành `ANSWERED` là một dòng KPI sai không ai truy ra.
 */
const ANH_XA_TRANG_THAI: Record<string, CallTechStatus> = {
  initiated: "INITIATED",
  init: "INITIATED",
  created: "INITIATED",
  ringing: "RINGING",
  ring: "RINGING",
  answered: "ANSWERED",
  answer: "ANSWERED",
  connected: "ANSWERED",
  no_answer: "NO_ANSWER",
  noanswer: "NO_ANSWER",
  "no-answer": "NO_ANSWER",
  missed: "NO_ANSWER",
  busy: "BUSY",
  failed: "FAILED",
  fail: "FAILED",
  error: "FAILED",
};

export function docTrangThaiNhaCungCap(raw: unknown): CallTechStatus | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return ANH_XA_TRANG_THAI[key] ?? null;
}

/**
 * QT-37 — mốc "đã liên hệ" chỉ đóng khi cuộc gọi CÓ NGƯỜI NGHE **và** thời lượng
 * đàm thoại ≥ ngưỡng. Chống hành vi bấm gọi rồi cúp ngay để tắt cảnh báo SLA.
 * Ngưỡng đọc từ SystemSetting `calls.minTalkSecondsForContacted`, không hardcode
 * ở nơi gọi.
 */
export function tinhLaDaLienHe(
  trangThai: CallTechStatus | null | undefined,
  talkSeconds: number | null | undefined,
  nguongGiay: number,
): boolean {
  if (trangThai !== "ANSWERED") return false;
  return (talkSeconds ?? 0) >= nguongGiay;
}
