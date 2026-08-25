// Test cho tầng truy vấn "Khách của tôi" — phần THUẦN kiểm được không cần DB.
//
// Điều đáng khoá nhất ở đây không phải hình dạng dữ liệu mà là: mệnh đề "của
// tôi" phải đi qua CÙNG MỘT nguồn với trang admin. Nếu trang này gõ
// `assignedToId` tại chỗ thì khi ai đó bật lại chính sách chia sẻ lead bằng env
// `LEAD_SHARING_ENABLED`, trang admin đổi hành vi còn trang này thì không —
// và không có màn nào báo, chỉ có hai danh sách nói hai câu khác nhau.
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import { leadOwnershipWhere, TRANG_THAI_DA_DONG } from "./sale-leads";

const cuEnv = process.env.LEAD_SHARING_ENABLED;
afterEach(() => {
  if (cuEnv === undefined) delete process.env.LEAD_SHARING_ENABLED;
  else process.env.LEAD_SHARING_ENABLED = cuEnv;
});

describe("[site Sale] leadOwnershipWhere — 'khách của tôi' là gì", () => {
  it("mặc định (lead độc quyền): chỉ lead do chính mình phụ trách", () => {
    delete process.env.LEAD_SHARING_ENABLED;
    expect(leadOwnershipWhere("u1")).toEqual({ OR: [{ assignedToId: "u1" }] });
  });

  it("bật lại chia sẻ bằng env → nhánh dùng chung quay lại, KHÔNG phải sửa file này", () => {
    process.env.LEAD_SHARING_ENABLED = "true";
    expect(leadOwnershipWhere("u1")).toEqual({
      OR: [{ assignedToId: "u1" }, { isSharedWithTeam: true }],
    });
  });

  it("luôn có nhánh assignedToId — chủ lead không bao giờ mất khách của mình", () => {
    for (const v of ["true", "false", undefined]) {
      if (v === undefined) delete process.env.LEAD_SHARING_ENABLED;
      else process.env.LEAD_SHARING_ENABLED = v;
      expect(leadOwnershipWhere("u9").OR).toContainEqual({ assignedToId: "u9" });
    }
  });
});

describe("[site Sale] trạng thái đã đóng", () => {
  it("gồm đúng ba trạng thái kết thúc, KHÔNG gồm trạng thái đang chăm", () => {
    expect([...TRANG_THAI_DA_DONG].sort()).toEqual(["DUPLICATE", "ENROLLED", "LOST"]);
    // NURTURING là "đang nuôi dưỡng" — vẫn là việc đang làm, lọc nhầm nó ra là
    // giấu mất nhóm khách cần chạm lại nhiều nhất.
    expect(TRANG_THAI_DA_DONG).not.toContain("NURTURING");
  });
});

describe("[site Sale] chốt chặn nguồn — truy vấn khách của tôi", () => {
  const src = () => fs.readFileSync("lib/lead/sale-leads.ts", "utf8");
  const boChuThich = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("đi qua scopedDb, KHÔNG import @/lib/db trần", () => {
    // Cách ly cơ sở của site Sale nằm ở đây; `db` trần là thủng cổng mà ESLint
    // chỉ chặn trong `app/(sale)/**`, còn file này ở `lib/`.
    const s = boChuThich(src());
    expect(s).toContain("scopedDb(actor)");
    expect(s).not.toMatch(/from\s+["']@\/lib\/db["']/);
  });

  it("mọi truy vấn lead đều kèm mệnh đề sở hữu — không có đường đọc lead người khác", () => {
    const s = boChuThich(src());
    const soLanTruyVan = (s.match(/sdb\.lead\.find/g) ?? []).length;
    const soLanSoHuu = (s.match(/leadOwnershipWhere\(/g) ?? []).length;
    expect(soLanTruyVan).toBeGreaterThan(0);
    // -1 vì chính định nghĩa hàm cũng khớp chuỗi đó.
    expect(soLanSoHuu - 1).toBeGreaterThanOrEqual(soLanTruyVan);
  });

  it("che PII ở SERVER, không để client tự che", () => {
    // Che ở UI là dữ liệu vẫn đi xuống trong payload RSC — mở DevTools là thấy.
    expect(boChuThich(src())).toContain("maskLeadPiiFields");
  });

  it("chi tiết trả null cho CẢ 'không tồn tại' lẫn 'không phải của bạn'", () => {
    // Phân biệt hai ca là biến trang thành công cụ dò xem lead nào tồn tại.
    const s = boChuThich(src());
    const i = s.indexOf("export async function getMyLeadDetail");
    expect(i).toBeGreaterThan(-1);
    expect(s.slice(i)).toContain("if (!lead) return null;");
  });
});
