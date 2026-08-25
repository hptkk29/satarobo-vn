/**
 * KHU VỰC A · A-01 — bất biến ĐẦU BẢNG: QLCS giữ N cơ sở KHÁC VÙNG.
 *
 * Vì sao file này tồn tại: `tests/e2e/_helpers/seed-multi-region.ts` dựng đủ 289 dòng
 * fixture cho `L-A1` + `L-A13` nhưng **KHÔNG spec nào import** — `seedPureCenterManagerTwoRegions`,
 * `seedSuperAdminControlTwoRegions` và `assertPureCenterManagerTwoRegions` chưa từng chạy một
 * lần nào. Xoá nguyên file đó không làm đỏ một test nào, và bất biến "QLCS giữ 2 cơ sở khác
 * vùng thấy ĐÚNG hợp 2 cơ sở, cơ sở thứ ba trả 0 dòng" có ZERO khẳng định.
 *
 * `lib/auth/actor.test.ts` KHÔNG lấp được chỗ này: nó chỉ phủ "CS1 đơn" và "HO+CS1", không
 * có ca hai CENTER khác REGION. Ai đó đổi `buildActor` cho `rowCenters` lấy đúng cơ sở neo
 * thay vì `getSubtreeCenterIds` thì QLCS mở /admin/leads chỉ còn thấy lead CS1, CS3 IM LẶNG
 * biến mất (0 dòng, không lỗi) — và toàn bộ bộ test cũ vẫn xanh.
 *
 * Hai vế phải đi cùng nhau (đó là L-A13):
 *   (a) tài khoản QLCS THUẦN thấy đúng hợp 2 cơ sở được gán, KHÔNG thấy cơ sở thứ ba;
 *   (b) tài khoản đối chứng (QLCS + SUPER_ADMIN, đúng hình dạng đang có trên prod) thấy CẢ
 *       cơ sở thứ ba — tức mọi phép đo A-01 chạy trên tài khoản kiểu đó đều vô giá trị.
 * Thiếu (b) thì không ai chứng minh được vì sao fixture thuần là bắt buộc.
 */
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb } from "../_helpers/seed";
import { scopedDb } from "../../../lib/db-scope";
import { resolveActorUncached } from "../../../lib/auth/actor";
import {
  assertPureCenterManagerTwoRegions,
  seedPureCenterManagerTwoRegions,
  seedSuperAdminControlTwoRegions,
  seedTwoRegionTree,
  type TwoRegionTree,
} from "../_helpers/seed-multi-region";

let tree: TwoRegionTree;

async function leadO(name: string, centerId: string): Promise<void> {
  await db.lead.create({ data: { parentName: name, phone: "0900000000", centerId } });
}

test.describe("[A-01 · L-A1/L-A13] QLCS giữ 2 cơ sở khác vùng", () => {
  test.beforeEach(async () => {
    await resetDb();
    tree = await seedTwoRegionTree();
    // Mỗi cơ sở một lead mang tên nói thẳng cơ sở — lẫn phạm vi là lộ ra ở TÊN, không phải
    // ở một con số đếm mơ hồ.
    await leadO("LEAD-CS1", tree.centerIds.CS1);
    await leadO("LEAD-CS2", tree.centerIds.CS2);
    await leadO("LEAD-CS3", tree.centerIds.CS3);
  });

  test("[L-A1] visibleCenterIds = ĐÚNG hợp 2 cơ sở được gán (CS1 ∈ Đà Nẵng, CS3 ∈ Huế)", async () => {
    const user = await seedPureCenterManagerTwoRegions(tree);
    const actor = await resolveActorUncached(user.id);

    expect([...actor.visibleCenterIds].sort()).toEqual(
      [tree.centerIds.CS1, tree.centerIds.CS3].sort(),
    );
    // Khẳng định fixture đang đo đúng thứ nó nói: KHÔNG có đường tắt nào cho tầm nhìn này.
    expect(actor.isSuperAdmin).toBe(false);
    expect(actor.isHoLevel).toBe(false);
  });

  test("[L-A1] cơ sở thứ ba (CS2) trả 0 dòng — im lặng đúng cách, không lỗi", async () => {
    const user = await seedPureCenterManagerTwoRegions(tree);
    const actor = await resolveActorUncached(user.id);

    const leads = await scopedDb(actor).lead.findMany({ select: { parentName: true } });
    expect(leads.map((l) => l.parentName).sort()).toEqual(["LEAD-CS1", "LEAD-CS3"]);

    // Hỏi THẲNG cơ sở thứ ba: giao tập rỗng, KHÔNG ném lỗi và KHÔNG rơi về "không lọc".
    const coTinh = await scopedDb(actor).lead.findMany({
      where: { centerId: tree.centerIds.CS2 },
      select: { parentName: true },
    });
    expect(coTinh).toEqual([]);
  });

  test("[L-A13] fixture thuần bị nới ⇒ `assertPureCenterManagerTwoRegions` ném lỗi", async () => {
    const user = await seedPureCenterManagerTwoRegions(tree);
    // Đúng kiểu "nới cho test chạy được" mà khối chú thích đầu fixture cấm.
    await db.user.update({
      where: { id: user.id },
      data: { roles: ["CENTER_MANAGER", "SUPER_ADMIN"] },
    });

    await expect(assertPureCenterManagerTwoRegions(user.id)).rejects.toThrow(/L-A13/);
  });

  test("[L-A13] ca ĐỐI CHỨNG: QLCS kiêm SUPER_ADMIN thấy CẢ cơ sở thứ ba ⇒ đo A-01 bằng tài khoản đó là vô giá trị", async () => {
    const doiChung = await seedSuperAdminControlTwoRegions(tree);
    const actor = await resolveActorUncached(doiChung.id);

    expect(actor.isSuperAdmin).toBe(true);
    expect(actor.visibleCenterIds).toContain(tree.centerIds.CS2);

    const leads = await scopedDb(actor).lead.findMany({ select: { parentName: true } });
    expect(leads.map((l) => l.parentName).sort()).toEqual([
      "LEAD-CS1",
      "LEAD-CS2",
      "LEAD-CS3",
    ]);
  });
});
