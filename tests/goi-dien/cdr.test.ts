// @vitest-environment node
/**
 * Đọc bản ghi cuộc gọi (CDR) từ webhook nhà cung cấp.
 *
 * ⚠️ ĐỌC TRƯỚC KHI SỬA: bảng tên trường ở `lib/calls/cdr.ts` là PHỎNG ĐOÁN — chưa
 * có văn bản nhà cung cấp (cổng CH-3 · TQ-1: tài liệu OMICall còn để host staging
 * `public-v1-stg.omicrm.com`). Vì vậy hàm đọc được thiết kế để:
 *   · nhận NHIỀU tên trường khả dĩ cho cùng một ý;
 *   · KHÔNG BAO GIỜ ném lỗi trên dữ liệu lạ;
 *   · thiếu thứ bắt buộc thì trả lỗi có mã, để webhook ghi `FAILED` chứ không 500.
 * Khi có văn bản thật, sửa BẢNG TÊN TRƯỜNG và bộ test này — không sửa nơi khác.
 */
import { describe, it, expect } from "vitest";
import { docCdr, docMaCuocGoi, soDoiTac } from "@/lib/calls/cdr";

const CDR_MAU = {
  transaction_id: "TX-0001",
  direction: "outbound",
  from_number: "1900xxxx",
  to_number: "0905123456",
  sip_user: "101",
  status: "answered",
  start_time: "2026-08-27T10:00:00.000Z",
  answer_time: "2026-08-27T10:00:07.000Z",
  end_time: "2026-08-27T10:03:07.000Z",
  billsec: 180,
  recording_url: "https://cdn.omicall.example/rec/abc.mp3",
};

describe("docMaCuocGoi — OC-1", () => {
  it("đọc `transaction_id`", () => {
    expect(docMaCuocGoi({ transaction_id: "A" })).toBe("A");
  });

  it("đọc được các tên thay thế thường gặp", () => {
    expect(docMaCuocGoi({ call_id: "B" })).toBe("B");
    expect(docMaCuocGoi({ uuid: "C" })).toBe("C");
    expect(docMaCuocGoi({ callId: "D" })).toBe("D");
  });

  it("thiếu mã ⇒ null (webhook sẽ ghi FAILED, KHÔNG tạo bản ghi cuộc gọi)", () => {
    // Không có mã thì không có khoá chống trùng. Tạo bản ghi trong tình trạng đó
    // là mở cửa cho mỗi lần retry đẻ thêm một dòng KPI.
    expect(docMaCuocGoi({})).toBeNull();
    expect(docMaCuocGoi(null)).toBeNull();
    expect(docMaCuocGoi("chuỗi thô")).toBeNull();
  });

  it("cắt khoảng trắng, bỏ qua chuỗi rỗng", () => {
    expect(docMaCuocGoi({ transaction_id: "  X  " })).toBe("X");
    expect(docMaCuocGoi({ transaction_id: "   " })).toBeNull();
  });
});

describe("docCdr — đọc trọn bản ghi", () => {
  it("đọc đủ 9 nhóm trường của bản mẫu", () => {
    const r = docCdr(CDR_MAU);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cdr.providerCallId).toBe("TX-0001");
    expect(r.cdr.direction).toBe("OUTBOUND");
    expect(r.cdr.extension).toBe("101");
    expect(r.cdr.techStatus).toBe("ANSWERED");
    expect(r.cdr.talkSeconds).toBe(180);
    expect(r.cdr.startedAt.toISOString()).toBe("2026-08-27T10:00:00.000Z");
    expect(r.cdr.answeredAt?.toISOString()).toBe("2026-08-27T10:00:07.000Z");
    expect(r.cdr.endedAt?.toISOString()).toBe("2026-08-27T10:03:07.000Z");
  });

  it("số của KHÁCH được chuẩn hoá `84…` KHÔNG dấu `+` (OC-10)", () => {
    const r = docCdr(CDR_MAU);
    expect(r.ok === true && r.cdr.peerPhone).toBe("84905123456");
  });

  it("gọi VÀO thì khách là bên GỌI, không phải bên nhận", () => {
    const r = docCdr({
      ...CDR_MAU,
      direction: "inbound",
      from_number: "0912345678",
      to_number: "1900xxxx",
    });
    expect(r.ok === true && r.cdr.direction).toBe("INBOUND");
    expect(r.ok === true && r.cdr.peerPhone).toBe("84912345678");
  });

  it("thiếu mã cuộc gọi ⇒ lỗi MISSING_CALL_ID", () => {
    const r = docCdr({ ...CDR_MAU, transaction_id: undefined });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.ma).toBe("MISSING_CALL_ID");
  });

  it("thiếu thời điểm bắt đầu ⇒ lỗi MISSING_START_TIME", () => {
    const r = docCdr({ ...CDR_MAU, start_time: undefined });
    expect(r.ok === false && r.ma).toBe("MISSING_START_TIME");
  });

  it("trạng thái lạ ⇒ VẪN đọc được bản ghi, nhưng bật cờ cần rà soát", () => {
    // Bỏ nguyên bản ghi vì một mã trạng thái lạ là vi phạm QT-39 ("cấm loại bỏ
    // dữ liệu cuộc gọi"). Đúng cách là lưu + gắn cờ để người xem lại.
    const r = docCdr({ ...CDR_MAU, status: "cancelled_by_carrier" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cdr.techStatus).toBeNull();
    expect(r.cdr.canhBao).toContain("UNKNOWN_TECH_STATUS");
  });

  it("hướng gọi lạ ⇒ mặc định INBOUND + cảnh báo (an toàn hơn OUTBOUND)", () => {
    // Đoán nhầm thành OUTBOUND là ghi nhầm một cuộc gọi RA vào KPI của Sale, và
    // kéo theo cả ràng buộc quảng cáo. Đoán INBOUND thì tệ nhất là thiếu KPI.
    const r = docCdr({ ...CDR_MAU, direction: "sideways" });
    expect(r.ok === true && r.cdr.direction).toBe("INBOUND");
    expect(r.ok === true && r.cdr.canhBao).toContain("UNKNOWN_DIRECTION");
  });

  it("payload không phải object ⇒ lỗi, không ném", () => {
    expect(() => docCdr("xin chào")).not.toThrow();
    expect(docCdr("xin chào").ok).toBe(false);
    expect(docCdr(null).ok).toBe(false);
  });

  it("OC-3 — KHÔNG trả liên kết ghi âm thô ra ngoài, chỉ trả CỜ có ghi âm", () => {
    const r = docCdr(CDR_MAU);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cdr.coGhiAm).toBe(true);
    // Liên kết chỉ sống trong `nguonGhiAm` — thứ đường nạp dùng để TẢI VỀ kho
    // riêng rồi vứt đi. Nó tuyệt đối không được ghi xuống `CallLog`.
    expect(Object.keys(r.cdr)).not.toContain("recordingUrl");
    expect(r.cdr.nguonGhiAm).toBe(CDR_MAU.recording_url);
  });

  it("số khách không chuẩn hoá được ⇒ peerPhone null + cảnh báo, KHÔNG bỏ bản ghi", () => {
    const r = docCdr({ ...CDR_MAU, to_number: "anonymous" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cdr.peerPhone).toBeNull();
    expect(r.cdr.canhBao).toContain("PEER_PHONE_UNPARSEABLE");
  });
});

describe("soDoiTac — chọn đúng đầu nào là khách", () => {
  it("OUTBOUND ⇒ bên nhận", () => {
    expect(soDoiTac("OUTBOUND", "1900", "0905123456")).toBe("84905123456");
  });
  it("INBOUND ⇒ bên gọi", () => {
    expect(soDoiTac("INBOUND", "0905123456", "1900")).toBe("84905123456");
  });
  it("INTERNAL ⇒ null (QT-40: không phải khách, không vào CRM)", () => {
    expect(soDoiTac("INTERNAL", "101", "102")).toBeNull();
  });
});
