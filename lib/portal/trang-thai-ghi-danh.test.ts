// Cổng chặn: KHÔNG được chép tay danh sách "ghi danh đang học" thêm một lần nữa.
//
// ─────────────────────────────────────────────────────────────────────────────
// Vì sao có bộ test này (06/09/2026)
//
// `lib/portal/` từng có BẢY bản chép tay của cùng một danh sách trạng thái ghi danh, và
// chúng lệch nhau: sáu bản quên `PAUSED`, ba bản có. Không có lỗi, không có test đỏ —
// chỉ có 7 học viên đang tạm nghỉ mà phụ huynh mở cổng ra thấy trống trơn: bộ chuyển-con
// hiện tên các em (danh sách CÓ `PAUSED`), còn lịch học/buổi học/ảnh/thông báo thì không.
//
// Vá bảy chỗ là chưa đủ — cái thứ tám sẽ mọc lại y như vậy và cũng câm như vậy. Bộ này
// quét nguồn và bắt mọi mảng status viết tay mới trong `lib/portal/**`.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  GHI_DANH_CO_LICH_SU,
  GHI_DANH_DANG_HOC,
} from "@/lib/portal/trang-thai-ghi-danh";

const THU_MUC = path.join("lib", "portal");

/**
 * Chỗ CỐ Ý giữ danh sách riêng. Thêm dòng ở đây là một quyết định có lý do, không phải
 * thủ tục cho qua cổng.
 */
const NGOAI_LE: ReadonlyArray<[tep: string, lyDo: string]> = [
  [
    "report-card-v2.ts",
    "`CURRENT_STATUSES` ở đó KHÔNG phải bộ lọc hiển thị mà là thứ tự ƯU TIÊN chọn một " +
      "ghi danh để dựng học bạ tạm tính; bộ lọc thật là `REPORTABLE_STATUSES` (rộng hơn, " +
      "có cả PAUSED và COMPLETED). Gộp hai thứ vào một hằng là đổi hành vi chọn lớp.",
  ],
];

/** Mảng toàn hằng chuỗi VIẾT HOA — ứng viên; lọc tiếp bằng `laDanhSachGhiDanh`. */
const RE_MANG_HANG = /\[[\s\S]{0,200}?\]/g;

/**
 * Có phải danh sách trạng thái GHI DANH không.
 *
 * Không chỉ nhìn thấy một tên trạng thái là bắt: `CANCELLED`/`REFUNDED` cũng là trạng
 * thái THANH TOÁN (`billing-student.ts`), `ACTIVE`/`COMPLETED` cũng là trạng thái LỚP.
 * Dấu nhận biết chắc chắn của ghi danh là `STUDYING` hoặc `PAUSED`; thêm một đường bắt
 * cho cặp `CONFIRMED` + `ACTIVE` đi cùng nhau.
 */
function laDanhSachGhiDanh(doan: string): boolean {
  const ten = new Set([...doan.matchAll(/"([A-Z_]{3,})"/g)].map((m) => m[1]!));
  if (ten.size === 0) return false;
  if (ten.has("STUDYING") || ten.has("PAUSED")) return true;
  return ten.has("CONFIRMED") && ten.has("ACTIVE");
}

function tepNguon(): string[] {
  return fs
    .readdirSync(THU_MUC, { withFileTypes: true })
    .filter(
      (m) =>
        m.isFile() &&
        /\.ts$/.test(m.name) &&
        !/\.test\.ts$/.test(m.name) &&
        // Chính file ĐỊNH NGHĨA thì đương nhiên được viết ra danh sách.
        m.name !== "trang-thai-ghi-danh.ts",
    )
    .map((m) => m.name);
}

/** Bỏ chú thích để danh sách nêu trong ghi chú không bị tính là mã thật. */
const boChuThich = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Trạng thái ghi danh của cổng phụ huynh", () => {
  it("hằng hợp nhất có đủ 4 trạng thái đang phục vụ, KHÔNG lẫn trạng thái đã nghỉ", () => {
    expect([...GHI_DANH_DANG_HOC].sort()).toEqual(
      ["ACTIVE", "CONFIRMED", "PAUSED", "STUDYING"].sort(),
    );
    // Nghỉ hẳn / chưa chốt thì không phải "đang học".
    for (const x of ["WITHDREW", "CANCELLED", "PENDING"]) {
      expect(GHI_DANH_DANG_HOC as readonly string[]).not.toContain(x);
    }
    expect(GHI_DANH_CO_LICH_SU as readonly string[]).toContain("COMPLETED");
  });

  it("PAUSED nằm trong danh sách — con tạm nghỉ vẫn phải thấy lớp của mình", () => {
    // Ca hồi quy trực tiếp: 06/09 đo được 7 học viên chỉ có ghi danh PAUSED.
    expect(GHI_DANH_DANG_HOC as readonly string[]).toContain("PAUSED");
  });

  it("không tệp nào trong lib/portal chép tay danh sách status", () => {
    const mienTru = new Set(NGOAI_LE.map(([t]) => t));
    const viPham: string[] = [];
    for (const ten of tepNguon()) {
      if (mienTru.has(ten)) continue;
      const src = boChuThich(fs.readFileSync(path.join(THU_MUC, ten), "utf8"));
      for (const m of src.matchAll(RE_MANG_HANG)) {
        if (!laDanhSachGhiDanh(m[0])) continue;
        viPham.push(`${ten}: ${m[0].replace(/\s+/g, " ").slice(0, 70)}`);
      }
    }
    expect(
      viPham,
      "Danh sách trạng thái ghi danh viết tay:\n  " +
        viPham.join("\n  ") +
        "\n→ Dùng GHI_DANH_DANG_HOC (hoặc GHI_DANH_CO_LICH_SU) trong " +
        "lib/portal/trang-thai-ghi-danh.ts. Bảy bản chép tay lệch nhau đã làm 7 học viên " +
        "tạm nghỉ nhìn thấy một cổng trống trơn. Nếu chỗ này THẬT SỰ cần danh sách riêng, " +
        "khai vào NGOAI_LE kèm lý do.",
    ).toEqual([]);
  });

  it("danh sách ngoại lệ không để lại rác", () => {
    for (const [ten, lyDo] of NGOAI_LE) {
      expect(fs.existsSync(path.join(THU_MUC, ten)), `${ten} không còn tồn tại`).toBe(true);
      const src = boChuThich(fs.readFileSync(path.join(THU_MUC, ten), "utf8"));
      const con = [...src.matchAll(RE_MANG_HANG)].some((m) => laDanhSachGhiDanh(m[0]));
      expect(
        con,
        `${ten} đã khai ngoại lệ nhưng không còn danh sách viết tay — bỏ khỏi NGOAI_LE`,
      ).toBe(true);
      expect(lyDo.length, `${ten} phải có lý do thật`).toBeGreaterThan(40);
    }
  });
});
