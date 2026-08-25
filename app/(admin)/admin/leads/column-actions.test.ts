// G-04 — chốt chặn NGUỒN cho hai Server Action lưu/khôi phục tuỳ chọn cột.
//
// Hai action này ghi vào bảng khoá theo `userId`. Cái duy nhất ngăn người A sửa
// cấu hình của người B là: `userId` LẤY TỪ PHIÊN, không bao giờ từ payload. Đây là
// loại lỗi không có màn hình nào báo — sai thì mọi thứ vẫn chạy, chỉ là cấu hình
// của người khác bị đổi. Test đọc thẳng mã nguồn vì đường chạy thật cần DB + phiên.
import { describe, it, expect } from "vitest";
import fs from "node:fs";

const DUONG_DAN = "app/(admin)/admin/leads/_column-actions.ts";
const src = () => fs.readFileSync(DUONG_DAN, "utf8");
const boChuThich = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("[G-04] _column-actions.ts — chốt chặn nguồn", () => {
  it("kiểm phiên đăng nhập + quyền xem lead ngay đầu mỗi action", () => {
    const s = boChuThich(src());
    expect(s).toContain("await auth()");
    // Cùng cổng với trang danh sách: xem được lead thì tự chọn được cột của mình.
    expect(s).toContain("checkAnyPermission");
    expect(s).toContain("leads:view-all");
    expect(s).toContain("leads:view-own");
  });

  it("chủ sở hữu LUÔN lấy từ phiên — không đường nào nhận userId từ payload", () => {
    const s = boChuThich(src());
    expect(s).toContain("session.user.id");
    // `userId:` chỉ được xuất hiện kèm giá trị từ phiên; đọc userId ra từ formData/
    // input là mở đường sửa cấu hình của người khác.
    expect(s).not.toMatch(/userId\s*[:=]\s*(input|parsed|formData|body|raw)/);
    expect(s).not.toMatch(/formData\.get\(\s*["']userId["']/);
  });

  it("đi qua scopedDb, KHÔNG import @/lib/db trần (ESLint chặn trong app/(admin))", () => {
    const s = boChuThich(src());
    expect(s).toContain("scopedDb(actor)");
    expect(s).not.toMatch(/from\s+["']@\/lib\/db["']/);
  });

  it("dữ liệu vào đi qua Zod, và khoá lạc được dọn bằng danh mục chứ không tin client", () => {
    const s = boChuThich(src());
    expect(s).toContain("tableColumnsInputSchema");
    expect(s).toContain("normalizeColumnsForSave");
  });

  it("khôi phục mặc định = XOÁ dòng cấu hình, không ghi một bản 'mặc định' vào DB", () => {
    // Ghi bản mặc định vào DB là đóng băng mặc định ở thời điểm bấm nút: đợt sau
    // thêm cột thì đúng người vừa bấm 'khôi phục' lại là người không nhận cột mới.
    const s = boChuThich(src());
    const i = s.indexOf("resetLeadTableColumnsAction");
    expect(i).toBeGreaterThan(-1);
    expect(s.slice(i)).toContain("deleteMany");
  });
});
