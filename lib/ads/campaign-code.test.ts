// @vitest-environment node
/**
 * D-06 — bóc mã cơ sở từ tiền tố tên campaign, theo quy ước `SR.QD.232`.
 *
 * Vì sao bộ này gắt hơn vẻ ngoài của nó: đoán sai MỘT campaign là gán nhầm **toàn bộ**
 * chi tiêu quảng cáo của campaign đó sang cơ sở khác — và không ai phát hiện được, vì
 * con số vẫn ra một con số trông hợp lý. Nên mọi trường hợp không chắc chắn phải rơi
 * vào `UNKNOWN` (nhóm "CHƯA PHÂN BỔ"), tuyệt đối không khớp mờ, không rơi về một cơ
 * sở mặc định.
 *
 * Bảng ca kiểm lấy nguyên từ PRD `CDB-dashboard.md` §D.6.5.
 */
import { describe, it, expect } from "vitest";
import {
  parseCenterCodeFromCampaignName,
  MULTI_CENTER_CODE,
  UNALLOCATED_LABEL,
} from "@/lib/ads/campaign-code";

/** Danh mục mã cơ sở — nguồn thật là `Center.code`, truyền vào chứ không hardcode. */
const BIET = new Set(["CS1", "CS2"]);
const doc = (s: string | null | undefined) => parseCenterCodeFromCampaignName(s, BIET);

describe("[D-06] tên đúng quy ước", () => {
  it("ví dụ chuẩn của quy ước → ra đúng mã cơ sở", () => {
    expect(doc("CS1_LEAD_ROBOTICS-L1_VIDEO_0826_A03")).toEqual({
      kind: "CENTER",
      centerCode: "CS1",
    });
  });

  it("cơ sở khác cũng nhận", () => {
    expect(doc("CS2_MESS_COMBO12_IMAGE_0826_B07")).toEqual({
      kind: "CENTER",
      centerCode: "CS2",
    });
  });

  it("chỉ có mã cơ sở, không có phần còn lại → vẫn phân bổ được", () => {
    // Phần đuôi là kỷ luật đặt tên của Marketing, không phải việc của hàm này.
    expect(doc("CS1")).toEqual({ kind: "CENTER", centerCode: "CS1" });
  });

  it("mã đúng nhưng đuôi rỗng (`CS1_`) → vẫn nhận", () => {
    expect(doc("CS1_")).toEqual({ kind: "CENTER", centerCode: "CS1" });
  });
});

describe("[D-06] campaign chạy chung nhiều cơ sở", () => {
  it("`MULTI` → không quy về cơ sở nào, chờ khai tỷ lệ ở D-07", () => {
    expect(doc("MULTI_LEAD_ROBOSIM_VIDEO_0926_C01")).toEqual({ kind: "MULTI" });
  });

  it("chỉ mỗi chữ MULTI cũng vậy", () => {
    expect(doc("MULTI")).toEqual({ kind: "MULTI" });
  });

  it("viết thường vẫn nhận", () => {
    expect(doc("multi_lead_robosim_0826")).toEqual({ kind: "MULTI" });
  });
});

describe("[D-06] rộng lượng đúng chỗ — hoa/thường và khoảng trắng", () => {
  it("viết thường → nhận", () => {
    expect(doc("cs1_lead_robotics_video_0826_a03")).toEqual({
      kind: "CENTER",
      centerCode: "CS1",
    });
  });

  it("thừa khoảng trắng hai đầu chuỗi → cắt", () => {
    expect(doc("  CS1_LEAD_ROBOTICS_VIDEO_0826_A03  ")).toEqual({
      kind: "CENTER",
      centerCode: "CS1",
    });
  });

  it("thừa khoảng trắng ngay sau mã → cắt", () => {
    expect(doc("CS1 _LEAD_ROBOTICS_VIDEO_0826_A03")).toEqual({
      kind: "CENTER",
      centerCode: "CS1",
    });
  });
});

describe("[D-06] 🔴 không đoán — mọi ca mập mờ đều về CHƯA PHÂN BỔ", () => {
  it("mã cơ sở CHƯA MỞ (CS3) → không đoán, không rơi về CS1", () => {
    // Mở CS3 trong bảng Center là hàm này tự nhận, không phải sửa mã.
    expect(doc("CS3_LEAD_ROBOTICS_VIDEO_0826_A03")).toEqual({
      kind: "UNKNOWN",
      reason: "CODE_NOT_FOUND",
      token: "CS3",
    });
  });

  it("🔴 mã cơ sở KHÔNG đứng đầu → không nhặt ở giữa chuỗi", () => {
    // Đây là ca đắt nhất: "LEAD_CS1_..." có chứa CS1, và một hàm dễ dãi sẽ tìm thấy
    // nó rồi gán sai. Quy ước bắt buộc mã đứng ĐẦU.
    expect(doc("LEAD_CS1_ROBOTICS_VIDEO_0826_A03")).toEqual({
      kind: "UNKNOWN",
      reason: "CODE_NOT_FOUND",
      token: "LEAD",
    });
  });

  it("dùng `-` thay `_` → KHÔNG nhận, dù nhìn như đúng khuôn", () => {
    // Cố ý: `-` được dùng BÊN TRONG một trường theo chính ví dụ chuẩn
    // ("ROBOTICS-L1"), nên tách thêm `-` sẽ bẻ gãy đúng khuôn quy ước đòi hỏi.
    expect(doc("CS1-LEAD-ROBOTICS-VIDEO-0826-A03")).toEqual({
      kind: "UNKNOWN",
      reason: "NO_PREFIX",
      token: "CS1-LEAD-ROBOTICS-VIDEO-0826-A03",
    });
  });

  it("có dấu tiếng Việt → không nhận (quy ước cấm dấu)", () => {
    expect(doc("Cơ sở 1_LEAD_ROBOTICS_VIDEO_0826_A03")).toEqual({
      kind: "UNKNOWN",
      reason: "CODE_NOT_FOUND",
      token: "CƠ SỞ 1",
    });
  });

  it("bắt đầu bằng dấu ngăn cách → không nhận", () => {
    expect(doc("_CS1_LEAD_ROBOTICS")).toEqual({
      kind: "UNKNOWN",
      reason: "CODE_NOT_FOUND",
      token: "",
    });
  });
});

describe("[D-06] đầu vào rỗng — Meta có thể không trả tên campaign", () => {
  it("chuỗi rỗng · toàn khoảng trắng · null · undefined đều là EMPTY", () => {
    for (const v of ["", "   ", null, undefined]) {
      expect(doc(v), JSON.stringify(v)).toEqual({
        kind: "UNKNOWN",
        reason: "EMPTY",
        token: "",
      });
    }
  });
});

describe("[D-06] danh mục cơ sở truyền vào, không chôn trong mã", () => {
  it("mở cơ sở mới = thêm dữ liệu, KHÔNG sửa hàm này", () => {
    // Luật của kho: "mở CS mới = thêm data, không sửa code".
    const rong = new Set(["CS1", "CS2", "CS3"]);
    expect(parseCenterCodeFromCampaignName("CS3_LEAD_X_VIDEO_0826_A1", rong)).toEqual({
      kind: "CENTER",
      centerCode: "CS3",
    });
  });

  it("danh mục RỖNG → không mã nào lọt (fail-closed), nhưng MULTI vẫn là MULTI", () => {
    const rong = new Set<string>();
    expect(parseCenterCodeFromCampaignName("CS1_LEAD", rong)).toEqual({
      kind: "UNKNOWN",
      reason: "CODE_NOT_FOUND",
      token: "CS1",
    });
    expect(parseCenterCodeFromCampaignName("MULTI_LEAD", rong)).toEqual({ kind: "MULTI" });
  });
});

describe("[D-06] hằng số dùng chung", () => {
  it("mã campaign chung và nhãn nhóm chưa phân bổ đúng như quy ước", () => {
    expect(MULTI_CENTER_CODE).toBe("MULTI");
    expect(UNALLOCATED_LABEL).toBe("CHƯA PHÂN BỔ");
  });
});
