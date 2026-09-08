// Hai cổng quanh kỳ công (08/09/2026). THUẦN — chạy trong `pnpm test:unit`, không cần DB.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { chanChotKyThieuBuoi, chanSuaKyDaChot } from "./ky-gac";

const GOC = join(__dirname, "..", "..");
const doc = (p: string) => readFileSync(join(GOC, p), "utf8");

describe("chanChotKyThieuBuoi — chặn chốt kỳ khi chưa buổi nào được chốt", () => {
  it("có buổi mà 0 buổi xong → CHẶN", () => {
    expect(chanChotKyThieuBuoi({ duKien: 287, xong: 0 })).toContain(
      "287 buổi học",
    );
  });

  it("chỉ cần MỘT buổi đã chốt là cho qua — cổng này chống 'trắng trơn', không phải KPI", () => {
    expect(chanChotKyThieuBuoi({ duKien: 287, xong: 1 })).toBeNull();
  });

  // ⚠️ CA QUAN TRỌNG NHẤT của cổng này.
  //
  // Hội sở (`hoi-so`) là Center MỒ CÔI — không lớp nào trỏ tới, nên kỳ nào của nó cũng
  // có `duKien = 0`. Nếu ngưỡng là `xong === 0` thì Hội sở KHOÁ VĨNH VIỄN, không bao
  // giờ chốt được kỳ. Đừng "đơn giản hoá" điều kiện.
  it("kỳ KHÔNG có buổi nào (Hội sở) → cho qua, KHÔNG khoá vĩnh viễn", () => {
    expect(chanChotKyThieuBuoi({ duKien: 0, xong: 0 })).toBeNull();
  });

  it("mọi buổi đều đã chốt → cho qua", () => {
    expect(chanChotKyThieuBuoi({ duKien: 42, xong: 42 })).toBeNull();
  });
});

describe("chanSuaKyDaChot — chặn xếp lại khung ca vào kỳ đã chốt", () => {
  it("LOCKED → CHẶN, và câu chặn nói rõ kỳ nào", () => {
    expect(
      chanSuaKyDaChot({ status: "LOCKED", periodKey: "2026-09" }),
    ).toContain("2026-09");
  });

  it("OPEN / REOPENED / CLOSING / chưa có kỳ → cho qua", () => {
    for (const st of ["OPEN", "REOPENED", "CLOSING", null]) {
      expect(
        chanSuaKyDaChot({ status: st, periodKey: "2026-09" }),
        `status=${st}`,
      ).toBeNull();
    }
  });
});

// ── Cổng TĨNH: hai cổng phải được CẮM ĐÚNG CHỖ ────────────────────────────────
//
// Hàm thuần đúng mà cắm sai chỗ thì vô dụng — và "sai chỗ" ở đây có một hình dạng cụ
// thể: đặt SAU bước ghi, thành "chặn nhưng vẫn ghi".
describe("hai cổng được cắm đúng chỗ", () => {
  it("chốt kỳ: cổng đứng TRƯỚC recomputeRange", () => {
    const src = doc("lib/cham-cong/period.ts");
    const iGate = src.indexOf("chanChotKyThieuBuoi({");
    const iWrite = src.indexOf("await recomputeRange(");
    expect(iGate, "cổng phải tồn tại").toBeGreaterThan(-1);
    // Đặt sau `recomputeRange` là đã tính lại + ghi đè hàng loạt StaffAttendanceDay
    // rồi mới báo lỗi — chặn nhưng vẫn ghi.
    expect(iGate).toBeLessThan(iWrite);
  });

  it("chốt kỳ: KHÔNG gác bằng summary.totals.teachingSessions", () => {
    // Số đó cộng theo HÀNG nên rụng buổi của giáo viên không có ca trong kỳ, và truy
    // vấn sinh ra nó bị bỏ hẳn khi danh sách người rỗng.
    const src = doc("lib/cham-cong/period.ts");
    const than = src.slice(
      src.indexOf("if (!input.boQuaBuoiChuaChot)"),
      src.indexOf("await recomputeRange("),
    );
    expect(than).toContain("classSession.count");
    expect(than).not.toContain("teachingSessions");
  });

  it("xếp lại khung ca: cổng đứng TRƯỚC generateMonthAssignments", () => {
    const src = doc("app/(admin)/admin/cham-cong/khung-ca/_actions.ts");
    const iGate = src.indexOf("chanSuaKyDaChot({");
    const iWrite = src.indexOf("await generateMonthAssignments({");
    expect(iGate).toBeGreaterThan(-1);
    expect(iGate).toBeLessThan(iWrite);
  });

  // Cổng chặn mà không có đường vượt là tự khoá mình; đường vượt ở cấp CƠ SỞ thì cổng
  // không tồn tại. Cả hai phải là HO + lý do bắt buộc, cùng khuôn `reopenPeriodAction`.
  it("cả hai đường vượt đều ở cấp HỘI SỞ và bắt buộc lý do", () => {
    for (const f of [
      "app/(admin)/admin/cham-cong/ky-cong/_actions.ts",
      "app/(admin)/admin/cham-cong/khung-ca/_actions.ts",
    ]) {
      const src = doc(f);
      expect(src, `${f}: đường vượt phải hỏi quyền tại HO`).toContain(
        "centerId: HO_CENTER_ID",
      );
      expect(src, `${f}: đường vượt phải bắt buộc lý do`).toContain(
        "tối thiểu 5 ký tự",
      );
    }
  });
});
