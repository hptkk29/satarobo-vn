// G-04 — danh mục cột bảng lead. File này khoá ba thứ dễ trôi:
//
//  1. **Bộ mặc định phải y hệt 7 cột đang chạy** (chốt kỹ thuật 24/08/2026, OQ-G11):
//     bật tuỳ chọn cột KHÔNG được làm giao diện của ai nhảy.
//  2. **Cột PII bật lên vẫn phải ra dữ liệu ĐÃ CHE.** Tuỳ chọn cột không phải cổng
//     quyền: người không có `leads:view-pii` bật cột SĐT thì thấy `090•••`, không
//     phải số thật. Rào nằm ở tầng đọc (`maskLeadPiiFields`) — test này ép mỗi cột
//     gắn cờ `pii` phải thực sự được hàm che đó phủ, và ngược lại.
//  3. **Danh mục và bảng render phải cùng một tập khoá.** Khai một cột mà bảng không
//     biết vẽ thì người dùng bật lên và nhận một cột TRỐNG, không lỗi, không log.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { LEAD_TABLE_COLUMNS, LEAD_TABLE_KEY, getTableCatalog, TABLE_KEYS } from "./lead-columns";
import { defaultColumnLayout } from "./column-preference";
import { maskLeadPiiFields } from "@/lib/lead/pii";

describe("[G-04] danh mục cột lead — tính toàn vẹn", () => {
  it("khoá cột KHÔNG trùng nhau", () => {
    const ks = LEAD_TABLE_COLUMNS.map((c) => c.key);
    expect(new Set(ks).size).toBe(ks.length);
  });

  it("defaultOrder KHÔNG trùng nhau — trùng thì thứ tự cột mặc định thành ngẫu nhiên", () => {
    const os = LEAD_TABLE_COLUMNS.map((c) => c.defaultOrder);
    expect(new Set(os).size).toBe(os.length);
  });

  it("mọi cột đều có nhãn tiếng Việt và nhóm", () => {
    for (const c of LEAD_TABLE_COLUMNS) {
      expect(c.label.trim().length).toBeGreaterThan(0);
      expect(c.group.trim().length).toBeGreaterThan(0);
    }
  });

  it("getTableCatalog chỉ nhận khoá bảng đã đăng ký — chuỗi tự do từ client trả null", () => {
    expect(getTableCatalog(LEAD_TABLE_KEY)).toBe(LEAD_TABLE_COLUMNS);
    expect(getTableCatalog("admin.hoc-vien.list")).toBeNull();
    expect(getTableCatalog("")).toBeNull();
    expect(TABLE_KEYS).toContain(LEAD_TABLE_KEY);
  });
});

describe("[G-04][OQ-G11] bộ mặc định = ĐÚNG 7 cột đang chạy, đúng thứ tự", () => {
  it("không thêm, không bớt, không đảo", () => {
    expect(defaultColumnLayout(LEAD_TABLE_COLUMNS).visible.map((c) => c.key)).toEqual([
      "parentName",
      "phone",
      "course",
      "status",
      "center",
      "assignedTo",
      "createdAt",
    ]);
  });

  it("mọi cột thêm mới của G-01/G-06 vào danh mục ở trạng thái TẮT", () => {
    const batSan = LEAD_TABLE_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key);
    expect(batSan).toHaveLength(7);
  });
});

describe("[G-04-4] cột PII bật lên vẫn ra dữ liệu đã che", () => {
  // Mẫu chứa ĐÚNG những trường mà `maskLeadPiiFields` phủ (lib/lead/pii.ts).
  const MAU = {
    parentName: "Nguyễn Thị Lan",
    phone: "0909123456",
    email: "lan@example.com",
    childName: "Trần Bảo An",
    note: "Nội dung tư vấn",
  } as const;

  it("mỗi cột gắn cờ pii đều thực sự bị `maskLeadPiiFields` che", () => {
    const daChe = maskLeadPiiFields({ ...MAU }, false) as Record<string, unknown>;
    const cotPii = LEAD_TABLE_COLUMNS.filter((c) => c.pii).map((c) => c.key);
    expect(cotPii.length).toBeGreaterThan(0);
    for (const key of cotPii) {
      // Cột PII phải là (hoặc lấy dữ liệu từ) một trường nằm trong tầm che.
      expect(Object.keys(MAU)).toContain(key);
      expect(daChe[key]).not.toBe(MAU[key as keyof typeof MAU]);
    }
  });

  it("chiều ngược lại: trường nằm trong tầm che mà có cột thì cột đó PHẢI gắn pii", () => {
    // Quên cờ này thì cột vẫn được che (che ở tầng đọc), nhưng màn chọn cột sẽ
    // không cảnh báo được gì — và người sau dễ tưởng cột đó vô hại rồi bê dữ liệu
    // thô vào chỗ khác.
    for (const truong of Object.keys(MAU)) {
      const cot = LEAD_TABLE_COLUMNS.find((c) => c.key === truong);
      if (cot) expect({ key: cot.key, pii: cot.pii }).toEqual({ key: cot.key, pii: true });
    }
  });
});

describe("[G-04] danh mục và bảng render dùng CÙNG một tập khoá", () => {
  const nguon = () =>
    fs.readFileSync("app/(admin)/admin/leads/_components/leads-table.tsx", "utf8");

  it("mọi khoá trong danh mục đều có nhánh vẽ trong leads-table.tsx", () => {
    const s = nguon();
    const thieu = LEAD_TABLE_COLUMNS.filter((c) => !s.includes(`case '${c.key}':`)).map(
      (c) => c.key,
    );
    expect(thieu).toEqual([]);
  });

  it("bảng KHÔNG còn chép tay nhãn cột — nhãn đi ra từ danh mục", () => {
    const s = nguon();
    // Nhãn cũ nằm thẳng trong JSX = bảng chưa tách khỏi danh mục (chép tay hai nơi).
    expect(s).not.toContain("Sale phụ trách");
    expect(s).not.toContain("Ngày đăng ký");
    expect(s).toContain("columns.map(");
  });
});
