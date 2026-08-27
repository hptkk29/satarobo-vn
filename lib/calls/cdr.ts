import type { CallDirection, CallTechStatus } from "@prisma/client";
import { canonicalPhone } from "@/lib/phone";
import { docTrangThaiNhaCungCap } from "@/lib/calls/trang-thai";

// =============================================================================
// ĐỌC BẢN GHI CUỘC GỌI (CDR) TỪ WEBHOOK NHÀ CUNG CẤP.
//
// 🔴 ĐỌC TRƯỚC KHI SỬA — BẢNG TÊN TRƯỜNG DƯỚI ĐÂY LÀ PHỎNG ĐOÁN.
// Cổng CH-3 · TQ-1 chưa mở: tài liệu OMICall còn để host STAGING
// `public-v1-stg.omicrm.com`, và chưa có văn bản xác nhận endpoint production,
// hạn mức ASR, hay cơ chế xác thực webhook (TQ-5). Vì vậy file này:
//   · nhận NHIỀU tên trường khả dĩ cho cùng một ý;
//   · KHÔNG BAO GIỜ ném lỗi trên dữ liệu lạ (ném = 500 = provider retry bão);
//   · thiếu thứ BẮT BUỘC thì trả lỗi có mã, để webhook ghi `FAILED`;
//   · gặp giá trị lạ ở thứ KHÔNG bắt buộc thì VẪN đọc được bản ghi + gắn cảnh báo
//     (QT-39: cấm loại bỏ dữ liệu cuộc gọi).
//
// Khi có văn bản thật: sửa ĐÚNG file này + `tests/goi-dien/cdr.test.ts`. Không chỗ nào khác.
//
// FILE THUẦN — không DB, không `server-only`.
// =============================================================================

export type CdrDaDoc = {
  providerCallId: string;
  direction: CallDirection;
  fromNumber: string;
  toNumber: string;
  /** Số của KHÁCH đã chuẩn hoá `84XXXXXXXXX` — OC-10: KHÔNG dấu `+`. */
  peerPhone: string | null;
  didNumber: string | null;
  extension: string | null;
  /** `null` = mã trạng thái nhà cung cấp không đọc được ⇒ nơi gọi bật cờ rà soát. */
  techStatus: CallTechStatus | null;
  startedAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
  talkSeconds: number | null;
  billSeconds: number | null;
  coGhiAm: boolean;
  /**
   * OC-3 — liên kết ghi âm của NHÀ CUNG CẤP. Sống ĐÚNG một chặng: đường nạp dùng
   * nó để TẢI TỆP VỀ KHO RIÊNG rồi vứt. TUYỆT ĐỐI không ghi xuống `CallLog` và
   * không bao giờ trả ra trình duyệt.
   */
  nguonGhiAm: string | null;
  costAmount: number | null;
  canhBao: string[];
};

export type DocCdrKetQua =
  | { ok: true; cdr: CdrDaDoc }
  | { ok: false; ma: "MISSING_CALL_ID" | "MISSING_START_TIME" | "BAD_PAYLOAD" };

function laObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Lấy giá trị đầu tiên khác rỗng trong danh sách tên trường khả dĩ. */
function lay(o: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function chuoi(v: unknown): string | null {
  if (typeof v === "string") {
    const s = v.trim();
    return s || null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function so(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Nhận ISO-8601 hoặc epoch giây/mili. Không đoán định dạng địa phương. */
function thoiDiem(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const n = so(v);
  if (n !== null && typeof v !== "string") {
    // epoch giây (10 chữ số) vs mili (13 chữ số).
    const ms = n < 1e12 ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = chuoi(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * OC-1 — mã cuộc gọi của nhà cung cấp. Thiếu mã ⇒ `null`, và nơi gọi PHẢI từ chối
 * tạo bản ghi: không có mã thì không có khoá chống trùng, và mỗi lần OMI gửi lại
 * (tài liệu tự ghi "có thể gửi nhiều lần") lại đẻ thêm một dòng KPI.
 */
export function docMaCuocGoi(payload: unknown): string | null {
  if (!laObject(payload)) return null;
  return chuoi(lay(payload, "transaction_id", "transactionId", "call_id", "callId", "uuid", "id"));
}

const ANH_XA_HUONG: Record<string, CallDirection> = {
  outbound: "OUTBOUND",
  out: "OUTBOUND",
  outgoing: "OUTBOUND",
  inbound: "INBOUND",
  in: "INBOUND",
  incoming: "INBOUND",
  internal: "INTERNAL",
  local: "INTERNAL",
};

/**
 * Chọn đầu nào là KHÁCH. `INTERNAL` trả null — QT-40: cuộc gọi nội bộ giữa nhân
 * viên không vào CRM và không tính KPI, nên không có "khách" để đối khớp.
 */
export function soDoiTac(
  direction: CallDirection,
  fromNumber: string,
  toNumber: string,
): string | null {
  if (direction === "INTERNAL") return null;
  return canonicalPhone(direction === "OUTBOUND" ? toNumber : fromNumber);
}

export function docCdr(payload: unknown): DocCdrKetQua {
  if (!laObject(payload)) return { ok: false, ma: "BAD_PAYLOAD" };

  const providerCallId = docMaCuocGoi(payload);
  if (!providerCallId) return { ok: false, ma: "MISSING_CALL_ID" };

  const startedAt = thoiDiem(
    lay(payload, "start_time", "startTime", "started_at", "startedAt", "call_time"),
  );
  if (!startedAt) return { ok: false, ma: "MISSING_START_TIME" };

  const canhBao: string[] = [];

  const huongRaw = chuoi(lay(payload, "direction", "call_type", "callType", "type"));
  let direction = huongRaw ? ANH_XA_HUONG[huongRaw.toLowerCase()] : undefined;
  if (!direction) {
    // Đoán nhầm thành OUTBOUND là ghi nhầm một cuộc gọi RA vào KPI của Sale và kéo
    // theo cả ràng buộc quảng cáo (QT-33). Đoán INBOUND thì tệ nhất là thiếu KPI.
    direction = "INBOUND";
    canhBao.push("UNKNOWN_DIRECTION");
  }

  const fromNumber = chuoi(lay(payload, "from_number", "fromNumber", "source", "caller")) ?? "";
  const toNumber = chuoi(lay(payload, "to_number", "toNumber", "destination", "callee")) ?? "";

  const techStatus = docTrangThaiNhaCungCap(
    lay(payload, "status", "call_status", "callStatus", "disposition"),
  );
  if (!techStatus) canhBao.push("UNKNOWN_TECH_STATUS");

  const peerPhone = soDoiTac(direction, fromNumber, toNumber);
  if (!peerPhone && direction !== "INTERNAL") canhBao.push("PEER_PHONE_UNPARSEABLE");

  const nguonGhiAm = chuoi(
    lay(payload, "recording_url", "recordingUrl", "record_url", "recordUrl", "audio_url"),
  );

  return {
    ok: true,
    cdr: {
      providerCallId,
      direction,
      fromNumber,
      toNumber,
      peerPhone,
      didNumber: chuoi(lay(payload, "did_number", "didNumber", "hotline", "did")),
      extension: chuoi(lay(payload, "sip_user", "sipUser", "extension", "agent", "ext")),
      techStatus,
      startedAt,
      answeredAt: thoiDiem(lay(payload, "answer_time", "answerTime", "answered_at", "answeredAt")),
      endedAt: thoiDiem(lay(payload, "end_time", "endTime", "ended_at", "endedAt")),
      talkSeconds: so(lay(payload, "billsec", "bill_sec", "talk_time", "talkTime", "duration")),
      billSeconds: so(lay(payload, "billsec", "bill_sec", "billed_seconds")),
      coGhiAm: Boolean(nguonGhiAm),
      nguonGhiAm,
      costAmount: so(lay(payload, "cost", "price", "charge")),
      canhBao,
    },
  };
}
