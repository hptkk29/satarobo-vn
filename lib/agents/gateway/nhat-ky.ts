// lib/agents/gateway/nhat-ky.ts — một dòng `AgentToolCall` cho MỖI lượt gọi (spec §12, bước 13).
//
// Luật: ghi CẢ lượt bị từ chối; KHÔNG ghi dữ liệu trả về; KHÔNG ghi tham số dạng rõ (chỉ bản
// băm HMAC với pepper — cùng tham số thì cùng băm, đủ để điều tra "agent hỏi lặp một câu").
import type { AgentAccessMode } from "@prisma/client";
import { chuoiNgauNhien } from "../khoa";
import { khoCong } from "../kho";

export type NhatKyGoi = {
  clientId: string | null;
  tool: string;
  mode: AgentAccessMode | null;
  agentRunId: string | null;
  paramsHash: string | null;
  centerCodes: string[];
  rowCount: number;
  masked: boolean;
  viewedRaw: boolean;
  ip: string | null;
  flagged: boolean;
};

/** Mã yêu cầu — trả cho agent trong `meta.ma_yeu_cau` / `loi.ma_yeu_cau`, và là khoá nhật ký. */
export function sinhMaYeuCau(): string {
  return "req_" + chuoiNgauNhien(12);
}

export function nhatKyRong(tool: string): NhatKyGoi {
  return {
    clientId: null,
    tool,
    mode: null,
    agentRunId: null,
    paramsHash: null,
    centerCodes: [],
    rowCount: 0,
    masked: false,
    viewedRaw: false,
    ip: null,
    flagged: false,
  };
}

/**
 * Ghi nhật ký. NÉM nếu ghi hỏng — người gọi quyết: lượt THÀNH CÔNG mà không ghi được nhật
 * ký thì KHÔNG trả dữ liệu (spec: "mọi lượt gọi đều có nhật ký"); lượt lỗi thì vẫn trả lỗi.
 */
export async function ghiNhatKy(
  maYeuCau: string,
  nk: NhatKyGoi,
  ketQua: { ma: string; http: number },
  batDauMs: number,
): Promise<void> {
  await khoCong.agentToolCall.create({
    data: {
      id: maYeuCau,
      ...nk,
      resultCode: ketQua.ma,
      httpStatus: ketQua.http,
      durationMs: Math.max(0, Math.round(Date.now() - batDauMs)),
    },
  });
}
