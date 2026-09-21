/**
 * scripts/ra-soat-lead-child-center.ts — V-4 · G-01b, phần dữ liệu ĐÃ LƯU SAI.
 *
 * VIỆC NÀY MÃ KHÔNG TỰ LÀM ĐƯỢC. Bản vá 25/08 chỉ chặn đường ghi sai từ nay về
 * sau; những bản ghi `LeadChild` đã lưu trước đó vẫn đang giữ **OrgUnit.id** ở ô
 * `interestedCenterId` (cột này trỏ sang bảng **Center** — schema: "tham chiếu
 * Center"). Hậu quả người dùng thấy: dòng tóm tắt của con ở màn chi tiết lead mất
 * hẳn tên cơ sở, không lỗi, không cảnh báo.
 *
 * Ai ghi sai: màn "Sửa lead" (`/leads/[id]/edit`) và biểu mẫu "Thêm lead thủ công"
 * (`/leads/new`) — cả hai từng mượn danh sách đơn vị (OrgUnit.id) cho ô "Cơ sở
 * quan tâm". Con do luồng nhận lead ngoài (`lib/lead/intake/ingest.ts`) và bản
 * nhập Excel (`lib/lead/import-registered.ts`) tạo ra thì ĐÚNG từ đầu — script
 * này không đụng vào chúng.
 *
 * ⚠️ NGƯỜI VẬN HÀNH CHẠY TAY (luật cứng #4). Đây là ĐỔI DỮ LIỆU, không phải đổi
 * schema — nhét vào migration là tước mất bước xem trước.
 *
 * CHẠY:
 *   pnpm tsx scripts/ra-soat-lead-child-center.ts            # DRY-RUN (mặc định, chỉ in)
 *   pnpm tsx scripts/ra-soat-lead-child-center.ts --apply    # ghi thật
 *
 * AN TOÀN:
 *  · Mặc định KHÔNG ghi. Phải có --apply.
 *  · Chỉ sửa bản ghi mà giá trị đang lưu khớp ĐÚNG một `OrgUnit.id` có `centerId`
 *    — tức chứng minh được nó là mã sai loại, không phải đoán mò.
 *  · Giá trị "mồ côi" (không khớp Center nào, cũng không khớp OrgUnit nào) chỉ
 *    được LIỆT KÊ, không tự xoá: có thể là Center đã bị gỡ, cần người xem.
 *  · Idempotent: chạy lần 2 trên DB đã vá → "không có gì để làm".
 *  · Không đụng bản ghi đang giữ Center.id hợp lệ.
 */
import "./_load-env";
import { scriptDb } from "./_script-db";

const APPLY = process.argv.includes("--apply");
const db = scriptDb();

async function main() {
  console.log(`\n🔎 Rà soát LeadChild.interestedCenterId — ${APPLY ? "GHI THẬT (--apply)" : "DRY-RUN"}\n`);

  const [children, centers, orgUnits] = await Promise.all([
    db.leadChild.findMany({
      where: { interestedCenterId: { not: null } },
      select: { id: true, leadId: true, fullName: true, interestedCenterId: true, updatedAt: true },
      orderBy: { updatedAt: "asc" },
    }),
    db.center.findMany({ select: { id: true, code: true, name: true } }),
    db.orgUnit.findMany({ select: { id: true, code: true, name: true, centerId: true } }),
  ]);

  const centerIds = new Set(centers.map((c) => c.id));
  const centerName = new Map(centers.map((c) => [c.id, `${c.code} · ${c.name}`]));
  // Chỉ OrgUnit type=CENTER mới có `centerId` — HO/REGION centerId=null, không dịch được.
  const orgToCenter = new Map(
    orgUnits.filter((o) => o.centerId).map((o) => [o.id, o.centerId as string]),
  );

  const ok = children.filter((c) => centerIds.has(c.interestedCenterId as string));
  const vaDuoc = children.filter(
    (c) => !centerIds.has(c.interestedCenterId as string) && orgToCenter.has(c.interestedCenterId as string),
  );
  const moCoi = children.filter(
    (c) => !centerIds.has(c.interestedCenterId as string) && !orgToCenter.has(c.interestedCenterId as string),
  );

  // MẪU SỐ bắt buộc in ra: "0 lệch" trên một bảng rỗng là XANH GIẢ.
  console.log(`  Tổng LeadChild có ghi cơ sở : ${children.length}`);
  console.log(`  Đang đúng (Center.id)       : ${ok.length}`);
  console.log(`  SAI LOẠI MÃ (OrgUnit.id)    : ${vaDuoc.length}`);
  console.log(`  Mồ côi (không tra được)     : ${moCoi.length}\n`);

  if (vaDuoc.length > 0) {
    console.log("  ── Bản ghi sai loại mã, dịch được sang Center.id ──");
    for (const c of vaDuoc) {
      const moi = orgToCenter.get(c.interestedCenterId as string) as string;
      console.log(
        `   lead=${c.leadId} child=${c.id} "${c.fullName}"\n` +
          `     ${c.interestedCenterId} (OrgUnit) → ${moi} (${centerName.get(moi) ?? "?"})`,
      );
    }
    console.log();
  }

  if (moCoi.length > 0) {
    console.log("  ── Mồ côi: KHÔNG tự sửa, cần người xem (Center đã gỡ? gõ tay?) ──");
    for (const c of moCoi) {
      console.log(`   lead=${c.leadId} child=${c.id} "${c.fullName}" → ${c.interestedCenterId}`);
    }
    console.log();
  }

  if (vaDuoc.length === 0) {
    console.log("✅ Không có gì để làm.\n");
    return;
  }
  if (!APPLY) {
    console.log(`ℹ️  DRY-RUN — chưa ghi gì. Chạy lại với --apply để vá ${vaDuoc.length} bản ghi.\n`);
    return;
  }

  let sua = 0;
  for (const c of vaDuoc) {
    await db.leadChild.update({
      where: { id: c.id },
      data: { interestedCenterId: orgToCenter.get(c.interestedCenterId as string) as string },
    });
    sua++;
  }
  console.log(`✅ Đã vá ${sua} bản ghi. Mồ côi còn lại: ${moCoi.length} (chưa đụng).\n`);
}

main()
  .catch((e) => {
    console.error("❌", e);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
