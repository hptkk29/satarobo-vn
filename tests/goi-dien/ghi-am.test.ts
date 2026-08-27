// @vitest-environment node
/**
 * OC-6 (PL-2) — LỜI THÔNG BÁO GHI ÂM + cờ "đã thông báo".
 * OC-14/OC-15 — kho ghi âm PHẢI là bucket RIÊNG, không phải bucket công khai.
 *
 * Căn cứ: Luật 91/2025 + NĐ 15/2020 điểm q khoản 3 Điều 102 — ghi âm cuộc gọi
 * không thông báo trước: phạt tới 10tr cá nhân / 20tr tổ chức.
 *
 * Luật nghiệp vụ quan trọng nhất ở đây, và cũng là chỗ dễ làm ngược: khách TỪ CHỐI
 * ghi âm thì VẪN GỌI ĐƯỢC — chỉ tắt ghi âm. Biến "từ chối ghi âm" thành "không gọi
 * được" là tự cắt kênh liên lạc với chính khách của mình.
 */
import { describe, it, expect, afterEach } from "vitest";
import { quyetDinhGhiAm, hanXoaGhiAm } from "@/lib/calls/ghi-am";
import {
  getCallRecordingBucket,
  isCallRecordingBucketConfigured,
  CallRecordingStorageConfigError,
  khoaGhiAm,
} from "@/lib/calls/kho-ghi-am";

const ENV_GOC = { ...process.env };
afterEach(() => {
  process.env = { ...ENV_GOC };
});

describe("OC-6 · quyết định ghi âm", () => {
  it("chưa phát lời thông báo ⇒ KHÔNG ghi âm (fail-closed)", () => {
    // Mặc định an toàn phải là "không ghi". Mặc định ngược lại thì mỗi lỗi cấu
    // hình đều thành một vi phạm hành chính.
    const r = quyetDinhGhiAm({ daThongBao: false, khachTuChoi: false });
    expect(r.ghiAm).toBe(false);
    expect(r.notice).toBe("NOT_ANNOUNCED");
  });

  it("đã thông báo, khách không phản đối ⇒ ghi âm", () => {
    const r = quyetDinhGhiAm({ daThongBao: true, khachTuChoi: false });
    expect(r.ghiAm).toBe(true);
    expect(r.notice).toBe("ANNOUNCED");
  });

  it("khách TỪ CHỐI ⇒ vẫn gọi được, chỉ TẮT ghi âm", () => {
    const r = quyetDinhGhiAm({ daThongBao: true, khachTuChoi: true });
    expect(r.ghiAm).toBe(false);
    expect(r.notice).toBe("REFUSED");
    // Không có trường nào nói "cấm gọi" — cổng gọi nằm ở `muc-dich.ts`, không ở đây.
    expect(Object.keys(r).sort()).toEqual(["ghiAm", "notice"]);
  });

  it("từ chối THẮNG cả khi cờ đã-thông-báo bị đặt nhầm", () => {
    expect(quyetDinhGhiAm({ daThongBao: false, khachTuChoi: true }).notice).toBe("REFUSED");
  });
});

describe("OC-20 · hạn xoá ghi âm", () => {
  it("mặc định 12 tháng kể từ lúc kết thúc cuộc gọi", () => {
    const ketThuc = new Date("2026-08-27T10:00:00.000Z");
    expect(hanXoaGhiAm(ketThuc, 12)?.toISOString()).toBe("2027-08-27T10:00:00.000Z");
  });

  it("số tháng ≤ 0 ⇒ coi như KHÔNG có hạn (null), không phải xoá ngay", () => {
    // Đặt nhầm 0 trong SystemSetting mà hiểu là "xoá ngay" thì một lần gõ nhầm
    // xoá sạch bằng chứng cuộc gọi.
    expect(hanXoaGhiAm(new Date(), 0)).toBeNull();
    expect(hanXoaGhiAm(new Date(), -3)).toBeNull();
  });
});

describe("OC-14/OC-15 · kho ghi âm là bucket RIÊNG", () => {
  it("chưa đặt R2_CALL_BUCKET_NAME ⇒ THROW (không fallback về bucket công khai)", () => {
    delete process.env.R2_CALL_BUCKET_NAME;
    expect(() => getCallRecordingBucket()).toThrow(CallRecordingStorageConfigError);
    expect(isCallRecordingBucketConfigured()).toBe(false);
  });

  it("trỏ trùng bucket CÔNG KHAI ⇒ THROW", () => {
    // Bucket mặc định gắn cdn.satarobo.vn — mọi object tải được VÔ DANH. Ghi âm
    // giọng phụ huynh nằm ở đó là rò rỉ vĩnh viễn, không thu về được.
    process.env.R2_BUCKET_NAME = "satarobo-uploads";
    process.env.R2_CALL_BUCKET_NAME = "satarobo-uploads";
    expect(() => getCallRecordingBucket()).toThrow(/công khai/i);
  });

  it("trỏ trùng bucket chat ⇒ THROW", () => {
    // Hai module có luật giữ/xoá khác nhau: ghi âm xoá theo 12 tháng, ảnh lớp thì
    // không. Dùng chung bucket là để một job dọn theo hạn của bên này xoá nhầm
    // tệp của bên kia.
    process.env.R2_BUCKET_NAME = "satarobo-uploads";
    process.env.R2_CHAT_BUCKET_NAME = "satarobo-chat";
    process.env.R2_CALL_BUCKET_NAME = "satarobo-chat";
    expect(() => getCallRecordingBucket()).toThrow(/chat/i);
  });

  it("trỏ trùng bucket đào tạo ⇒ THROW", () => {
    process.env.R2_BUCKET_NAME = "satarobo-uploads";
    process.env.R2_ELEARNING_BUCKET_NAME = "satarobo-elearning";
    process.env.R2_CALL_BUCKET_NAME = "satarobo-elearning";
    expect(() => getCallRecordingBucket()).toThrow(/đào tạo/i);
  });

  it("bucket riêng hợp lệ ⇒ trả tên bucket", () => {
    process.env.R2_BUCKET_NAME = "satarobo-uploads";
    process.env.R2_CALL_BUCKET_NAME = "satarobo-call-recordings";
    expect(getCallRecordingBucket()).toBe("satarobo-call-recordings");
  });
});

describe("khoaGhiAm — chia thư mục theo ĐƠN VỊ ngay từ đầu (BM-9)", () => {
  it("khoá gồm cơ sở + ngày + mã cuộc gọi", () => {
    const k = khoaGhiAm({
      centerId: "cs1",
      providerCallId: "TX-123",
      startedAt: new Date("2026-08-27T03:04:05.000Z"),
      ext: "mp3",
    });
    expect(k).toBe("calls/cs1/2026/08/27/TX-123.mp3");
  });

  it("chưa biết cơ sở ⇒ vào thư mục `chua-gan`, KHÔNG trộn vào cơ sở nào", () => {
    const k = khoaGhiAm({
      centerId: null,
      providerCallId: "TX-9",
      startedAt: new Date("2026-01-02T00:00:00.000Z"),
      ext: "wav",
    });
    expect(k).toBe("calls/chua-gan/2026/01/02/TX-9.wav");
  });

  it("mã cuộc gọi có ký tự lạ bị làm sạch — không cho leo thư mục", () => {
    const k = khoaGhiAm({
      centerId: "cs1",
      providerCallId: "../../etc/passwd",
      startedAt: new Date("2026-01-02T00:00:00.000Z"),
      ext: "mp3",
    });
    expect(k).not.toContain("..");
    expect(k).toBe("calls/cs1/2026/01/02/etcpasswd.mp3");
  });
});
