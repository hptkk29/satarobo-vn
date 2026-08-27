/**
 * scripts/s3-backfill-first-contact.ts — dựng lại `Lead.firstContactAt` cho dữ liệu CŨ.
 *
 * VÌ SAO CẦN. S-3 vá đường GHI: từ nay mọi lượt chạm khách thật đều đóng mốc
 * "Sale liên hệ lần đầu" ngay trong `recordLeadActivity`. Nhưng đường ghi chỉ
 * lo được lượt chạm TỪ NAY VỀ SAU. Mọi lead đang có trên máy thật vẫn
 * `firstContactAt = null` dù dòng thời gian của chúng đầy cuộc gọi — nghĩa là:
 *   · bảng việc vẫn đếm chúng vào "khách chưa được chạm lần nào"
 *     (`soChuaLienHe`, `lib/crm/sale-board.ts:207`);
 *   · cảnh báo SLA-3 của chúng vẫn kêu mãi (`lib/crm/sla.ts:78`) — đúng cái làm
 *     tư vấn viên học cách phớt lờ chuông.
 * Không chạy script này thì việc vá coi như chỉ xong một nửa.
 *
 * MỐC LẤY TỪ ĐÂU. Đọc lại `LeadActivity` và lấy lượt CHẠM KHÁCH SỚM NHẤT
 * (`firstLeadOutreachAt`, `lib/lead/activity-clock.ts`) — CÙNG bộ lọc mà đường
 * ghi dùng, nên số cũ và số mới không thể lệch nhau về định nghĩa.
 *
 * ⚠️ KHÔNG lấy `Lead.createdAt` hay `assignedAt` làm mốc thay thế. Lead chưa ai
 * gọi mà bị đóng mốc là tắt chuông hộ người — hỏng nặng hơn cả bệnh đang chữa.
 * Lead nào chưa có lượt chạm nào thì để nguyên `null`: chuông đó kêu THẬT.
 *
 * CHẠY:
 *   pnpm tsx scripts/s3-backfill-first-contact.ts           # DRY-RUN (mặc định, chỉ in)
 *   pnpm tsx scripts/s3-backfill-first-contact.ts --apply   # ghi thật
 *
 * AN TOÀN:
 *  · Mặc định KHÔNG ghi. Phải có `--apply` (luật cứng Nền Hệ thống #4: có
 *    dry-run, người vận hành chạy tay).
 *  · Idempotent: chỉ đụng lead còn `firstContactAt = null`, chạy lần 2 →
 *    "không có gì để làm".
 *  · CHỈ ghi đúng một cột `firstContactAt`. Không đụng `lastActivityAt`,
 *    `assignedAt`, trạng thái, hay bất kỳ mốc phễu nào khác.
 *  · Ghi bằng `updateMany` kèm `firstContactAt: null` trong `where` — lead vừa
 *    được chạm thật trong lúc script đang chạy sẽ KHÔNG bị đè mốc mới bằng mốc cũ.
 */
import "./_load-env";
import { scriptDb } from "./_script-db";
import {
  LEAD_OUTREACH_TYPES,
  firstLeadOutreachAt,
  type LeadActivityLike,
} from "../lib/lead/activity-clock";

const APPLY = process.argv.includes("--apply");
const LO = 500;

async function main(): Promise<void> {
  const db = scriptDb();

  const tong = await db.lead.count({ where: { deletedAt: null, firstContactAt: null } });
  console.log(`Lead chưa có mốc "liên hệ lần đầu": ${tong}`);
  console.log(APPLY ? "CHẾ ĐỘ: GHI THẬT (--apply)" : "CHẾ ĐỘ: DRY-RUN (thêm --apply để ghi)");

  let cursor: string | undefined;
  let daXem = 0;
  let dungMoc = 0;
  let chuaCham = 0;
  const viDu: string[] = [];

  for (;;) {
    const leads = await db.lead.findMany({
      where: { deletedAt: null, firstContactAt: null },
      take: LO,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: "asc" },
      select: { id: true },
    });
    if (leads.length === 0) break;
    cursor = leads[leads.length - 1]!.id;
    daXem += leads.length;

    const ids = leads.map((l) => l.id);
    // Chỉ kéo về loại CÓ THỂ tính là chạm khách — lead cũ có hàng chục dòng
    // STATUS_CHANGE, kéo hết là đọc thừa nhiều lần dữ liệu cần dùng.
    const rows = await db.leadActivity.findMany({
      where: { leadId: { in: ids }, type: { in: [...LEAD_OUTREACH_TYPES] } },
      select: { leadId: true, type: true, createdAt: true, metadata: true },
    });

    const theoLead = new Map<string, LeadActivityLike[]>();
    for (const r of rows) {
      const mang = theoLead.get(r.leadId);
      if (mang) mang.push(r);
      else theoLead.set(r.leadId, [r]);
    }

    for (const id of ids) {
      const moc = firstLeadOutreachAt(theoLead.get(id) ?? [], LEAD_OUTREACH_TYPES);
      if (moc === null) {
        chuaCham++;
        continue;
      }
      dungMoc++;
      if (viDu.length < 5) viDu.push(`${id} → ${moc.toISOString()}`);
      if (!APPLY) continue;
      await db.lead.updateMany({
        where: { id, firstContactAt: null },
        data: { firstContactAt: moc },
      });
    }
  }

  console.log(`Đã xét: ${daXem}`);
  console.log(`Dựng được mốc: ${dungMoc}${APPLY ? " (đã ghi)" : " (sẽ ghi khi --apply)"}`);
  console.log(`Chưa có lượt chạm nào → để nguyên null: ${chuaCham}`);
  if (viDu.length > 0) console.log(`Ví dụ:\n  ${viDu.join("\n  ")}`);

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
});
