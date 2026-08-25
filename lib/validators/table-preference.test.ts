// G-04 — cửa vào của Server Action lưu tuỳ chọn cột.
//
// Nguyên tắc của validator này (§7.5 PRD G): CHỈ từ chối khoá SAI ĐỊNH DẠNG, KHÔNG
// từ chối khoá lạ. Từ chối khoá lạ thì một cột bị gỡ khỏi hệ thống sẽ khoá cứng
// người dùng ra khỏi màn hình của chính họ — bấm Lưu là báo lỗi, không sửa được.
// Việc dọn khoá lạc thuộc về `normalizeColumnsForSave`, ở tầng sau.
import { describe, it, expect } from "vitest";
import { tableColumnsInputSchema } from "./table-preference";

const ok = (input: unknown) => tableColumnsInputSchema.safeParse(input).success;

describe("[G-04] tableColumnsInputSchema", () => {
  it("nhận cấu hình hợp lệ", () => {
    expect(ok({ tableKey: "admin.leads.list", visible: ["phone", "status"] })).toBe(true);
  });

  it("KHÔNG nhận tableKey tự do từ client", () => {
    expect(ok({ tableKey: "../../etc", visible: ["phone"] })).toBe(false);
    expect(ok({ tableKey: "", visible: ["phone"] })).toBe(false);
  });

  it("khoá LẠ vẫn qua cửa — chỉ khoá SAI ĐỊNH DẠNG bị chặn", () => {
    expect(ok({ tableKey: "admin.leads.list", visible: ["cot-khong-con-nua"] })).toBe(true);
    expect(ok({ tableKey: "admin.leads.list", visible: ["phone; DROP"] })).toBe(false);
    expect(ok({ tableKey: "admin.leads.list", visible: ["a".repeat(65)] })).toBe(false);
    expect(ok({ tableKey: "admin.leads.list", visible: [""] })).toBe(false);
    expect(ok({ tableKey: "admin.leads.list", visible: [123] })).toBe(false);
  });

  it("chặn nhồi JSON: quá 64 phần tử", () => {
    const nhieu = Array.from({ length: 65 }, (_, i) => `c${i}`);
    expect(ok({ tableKey: "admin.leads.list", visible: nhieu })).toBe(false);
  });

  it("KHÔNG nhận danh sách rỗng — lưu 0 cột là bảng trắng", () => {
    expect(ok({ tableKey: "admin.leads.list", visible: [] })).toBe(false);
  });

  it("KHÔNG nhận khoá trùng — trùng là dấu hiệu client dựng sai payload", () => {
    expect(ok({ tableKey: "admin.leads.list", visible: ["phone", "phone"] })).toBe(false);
  });

  it("KHÔNG nhận userId từ payload — chủ sở hữu luôn lấy từ phiên đăng nhập", () => {
    const r = tableColumnsInputSchema.safeParse({
      tableKey: "admin.leads.list",
      visible: ["phone"],
      userId: "ke-khac",
    });
    expect(r.success).toBe(true);
    expect(r.success && "userId" in r.data).toBe(false);
  });
});
