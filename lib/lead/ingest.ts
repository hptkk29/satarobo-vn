import { ingestIntakeLead } from "./intake/ingest";
import { laNguonDuongCu } from "./nguon-duong-cu";

// =============================================================================
// LEAD INGEST — lớp bọc tương thích cho 3 nguồn webhook có từ Phase T1.4
// (facebook / zalo / google-form).
//
// Lõi thật nằm ở `lib/lead/intake/ingest.ts` — một đường ghi duy nhất cho MỌI
// nguồn ngoài. File này chỉ đổi hình dữ liệu vào cho khớp lời gọi cũ.
//
// HÀNH VI CỦA 3 NGUỒN NÀY GIỮ NGUYÊN 100% so với trước khi tách lõi:
//  - `legacyWebhook: true` ⇒ vẫn `autoAssignLead` (bản cũ), và SĐT không chuẩn
//    hoá được thì vẫn lưu chuỗi thô thay vì bị từ chối.
//  - `child: null` ⇒ KHÔNG tạo bản ghi `LeadChild`, chỉ set `Lead.childName`
//    y như cũ. `extractLeadFields` moi tên con từ text tự do nên độ tin thấp;
//    đẻ `LeadChild` từ đó là bơm rác vào màn chuyển đổi. Kéo theo: luật QĐ-D1
//    ("trùng SĐT khác con ⇒ gắn thêm con") KHÔNG áp cho 3 nguồn này — nó được
//    chốt cho form Sale, nơi tên con là ô nhập riêng.
//
// Gộp nốt 3 nguồn cũ sang đường mới là việc NÊN làm, nhưng phải là đợt riêng
// có nghiệm thu.
// =============================================================================

export type IngestLeadInput = {
  parentName: string;
  phone: string;
  email?: string | null;
  childName?: string | null;
  source: string; // "facebook" | "zalo" | "google-form" | ...
  note?: string | null;
  eventId?: string | null; // idempotency (unique trên Lead.eventId)
  centerId?: string | null;
  utmSource?: string | null;
  utmCampaign?: string | null;
  landingPage?: string | null;
};

export type IngestResult = {
  ok: boolean;
  leadId?: string;
  duplicate?: boolean;
  error?: string;
};

export async function ingestLead(input: IngestLeadInput): Promise<IngestResult> {
  const parentName = input.parentName?.trim();
  const phone = input.phone?.trim();
  if (!parentName || !phone) {
    return { ok: false, error: "Thiếu parentName hoặc phone" };
  }

  const result = await ingestIntakeLead(
    {
      parentName,
      phone,
      email: input.email?.trim() || null,
      centerHint: null,
      // Cố ý null — xem docblock đầu file (giữ nguyên hành vi cũ, không đẻ LeadChild).
      children: [],
      childName: input.childName?.trim() || null,
      employeeCode: null,
      noteLines: input.note ? [input.note] : [],
      // `eventId` của lời gọi cũ ĐÃ gắn sẵn tiền tố nguồn (`webhook.ts` dựng
      // `"<source>:<externalId>"`). Truyền thẳng làm `externalId` sẽ thành
      // `"facebook:facebook:123"` ⇒ mất tính idempotent với dữ liệu cũ.
      externalId: null,
      consentMarketing: true,
      warnings: [],
    },
    {
      source: input.source,
      landingPage: input.landingPage ?? null,
      actorName: "Hệ thống (webhook)",
      centerId: input.centerId ?? null,
      eventId: input.eventId ?? null,
      utmSource: input.utmSource ?? null,
      utmCampaign: input.utmCampaign ?? null,
      // Đặt cứng `true` ở đây từng là cái bẫy — xem `lib/lead/nguon-duong-cu.ts`.
      legacyWebhook: laNguonDuongCu(input.source),
    },
  );

  return {
    ok: result.ok,
    leadId: result.leadId,
    duplicate: result.duplicate,
    error: result.error,
  };
}
