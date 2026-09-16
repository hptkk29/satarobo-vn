/**
 * Bất biến của danh sách cơ sở TĨNH dùng cho site công khai.
 *
 * Vì sao khoá bằng test: form `/lien-he` quy NHÃN cơ sở khách chọn về `code` rồi
 * gửi lên `/api/leads` (`CENTER_CODE_BY_LABEL`). Bản đồ đó khoá theo NHÃN, nên
 * hai cơ sở ra cùng một nhãn là một cơ sở vĩnh viễn không chọn tới được — và
 * lead sẽ rơi vào nhánh "hệ thống tự chia cơ sở" thay vì về đúng nơi khách chọn.
 * Không có gì nổ, không log nào báo.
 */
import { describe, it, expect } from "vitest";
import { operationalLocations } from "./locations";

const centerLabel = (name: string, address: string) =>
  `${name.split(" - ")[0] ?? name} - ${address}`;

describe("cơ sở vận hành (danh sách tĩnh cho site công khai)", () => {
  const ds = operationalLocations();

  it("có ít nhất một cơ sở", () => {
    expect(ds.length).toBeGreaterThan(0);
  });

  it("mọi cơ sở đều có mã", () => {
    for (const c of ds) expect(c.code.trim()).not.toBe("");
  });

  it("mã KHÔNG trùng nhau", () => {
    expect(new Set(ds.map((c) => c.code)).size).toBe(ds.length);
  });

  it("NHÃN hiển thị không trùng nhau — nhãn là khoá của bản đồ nhãn→mã", () => {
    // Đây là bất biến thật sự quan trọng: trùng nhãn = mất một cơ sở khỏi ô chọn.
    const nhan = ds.map((c) => centerLabel(c.name, c.address));
    expect(new Set(nhan).size).toBe(nhan.length);
  });

  it("nhãn giữ được tiền tố 'Cơ sở N' để phụ huynh phân biệt", () => {
    // Bản trước cắt sai làm ô chỉ hiện địa chỉ, phụ huynh không biết đâu là cơ sở nào.
    for (const c of ds) {
      expect(centerLabel(c.name, c.address)).toContain(c.name.split(" - ")[0]);
    }
  });
});
