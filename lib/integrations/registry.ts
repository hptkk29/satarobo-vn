import "server-only";
// lib/integrations/registry.ts — SỔ ĐĂNG KÝ adapter kênh ngoài.
//
// Một chỗ duy nhất trả lời "kênh X gửi bằng gì". Tầng nghiệp vụ (`lib/inbox/`) chỉ
// biết `InboxChannel`, không biết Zalo hay Meta — đó là điều kiện để đổi nhà cung
// cấp mà chỉ sửa một file.
//
// ⚠️ KHÔNG có kênh nào "mặc định gửi được". Kênh chưa khai ⇒ `SKIPPED` có mã, chứ
// KHÔNG throw và cũng KHÔNG âm thầm coi là đã gửi.
import type { InboxChannel } from "@prisma/client";
import { zaloOaProvider } from "@/lib/integrations/zalo-oa/provider";
import { messengerProvider } from "@/lib/integrations/messenger/provider";
import type { ChannelProvider, ChannelSendOutcome } from "@/lib/integrations/types";

/**
 * `LIVECHAT` và `MANUAL` cố ý KHÔNG có adapter:
 *  • `LIVECHAT` chưa có đường vào nào (widget website chưa dựng).
 *  • `MANUAL` là hội thoại người chép tay vào — theo định nghĩa không gửi ra được.
 * Cả hai rơi vào `khongCoAdapter()` bên dưới.
 */
const PROVIDERS: Partial<Record<InboxChannel, ChannelProvider>> = {
  ZALO_OA: zaloOaProvider,
  MESSENGER: messengerProvider,
};

export function getChannelProvider(channel: InboxChannel): ChannelProvider | null {
  return PROVIDERS[channel] ?? null;
}

/** Kênh không gửi ra được — trả kết quả có mã, không ném lỗi. */
export function khongCoAdapter(channel: InboxChannel): ChannelSendOutcome {
  return { status: "SKIPPED", errorCode: `KENH_KHONG_GUI_DUOC_${channel}` };
}

/**
 * Ảnh chụp trạng thái từng kênh cho giao diện. KHÔNG đọc DB (không hỏi công tắc
 * live) — chỉ nói "đã có khoá kết nối chưa", thứ tính được đồng bộ từ env.
 *
 * Trạng thái live được tính lúc GỬI, ngay trong adapter. Cố tình không đọc trước ở
 * đây: hai chỗ đọc một câu hỏi là hai câu trả lời sẽ lệch nhau, và bản trên màn
 * hình bao giờ cũng là bản cũ hơn.
 */
export function tinhTrangKenh(): Array<{
  channel: InboxChannel;
  label: string;
  daCoKhoaKetNoi: boolean;
}> {
  return (Object.keys(PROVIDERS) as InboxChannel[]).map((c) => {
    const p = PROVIDERS[c]!;
    return { channel: c, label: p.label, daCoKhoaKetNoi: p.isConfigured() };
  });
}
