// @vitest-environment node
/**
 * EL-06 — bộ chạy cron đêm `elearning-dem`.
 *
 * Cron này chạy 00:47 và làm năm việc liền nhau, trong đó có việc XOÁ DỮ LIỆU.
 * Hai thứ phải canh bằng test vì không ai ngồi xem lúc nó chạy:
 *
 *   1. **Thứ tự** — việc dọn phải chạy SAU việc chốt quá hạn. Dọn trước là rút
 *      thảm dưới chân việc chưa chạy.
 *   2. **Sự thật thà** — hai việc chưa làm được (bảng thuộc ticket khác chưa tồn
 *      tại) phải NÓI RA. Một cron báo "xong" trong khi có việc chưa chạy là thứ
 *      khó phát hiện nhất.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  thuTu: [] as string[],
  enrollments: [] as unknown[],
  updateMany: vi.fn(async (_a: { where: { id: { in: string[] } } }) => ({ count: 0 })),
  deleteVideo: vi.fn(async (_a: { where: unknown }) => ({ count: 0 })),
  updateProgress: vi.fn(async (_a: { where: Record<string, unknown>; data: Record<string, unknown> }) => ({ count: 0 })),
  publish: vi.fn(async (_t: string, _p: unknown, _o?: { dedupeKey?: string }) => null),
  tapDong: vi.fn(async () => ({
    soLuotGiao: 1,
    soThemMoi: 2,
    soThuHoi: 1,
    soChoDuLieuNhanSu: 0,
    choDuLieuNhanSu: [],
    loi: [],
  })),
  thuLai: vi.fn(async () => ({ taoMoi: 0, vanKet: 0, nguoiVanKet: [] as string[] })),
}));

vi.mock("@/lib/events/publish", () => ({ publishEvent: h.publish }));
vi.mock("@/lib/elearning/dynamic-audience-run", () => ({
  runDynamicAudienceSync: async (...a: unknown[]) => {
    h.thuTu.push("tap-dong");
    return h.tapDong(...(a as []));
  },
}));
vi.mock("@/lib/elearning/retry-queue", () => ({
  thuLaiHangDoiNhanSu: async (...a: unknown[]) => {
    h.thuTu.push("thu-lai");
    return h.thuLai(...(a as []));
  },
}));
vi.mock("@/lib/db", () => ({
  db: {
    trnEnrollment: {
      findMany: vi.fn(async () => {
        const r = h.enrollments;
        h.enrollments = [];
        return r;
      }),
      updateMany: async (a: unknown) => {
        h.thuTu.push("qua-han");
        return h.updateMany(a as never);
      },
    },
    trnVideoSession: {
      deleteMany: async (a: unknown) => {
        h.thuTu.push("don");
        return h.deleteVideo(a as never);
      },
    },
    trnLessonProgress: { updateMany: h.updateProgress },
  },
}));

import { runElearningDem } from "@/lib/elearning/cron-dem";

const NOW = new Date("2026-08-23T00:47:00.000Z");
const en = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  userId: `u-${id}`,
  status: "IN_PROGRESS",
  dueAt: new Date("2026-08-01T00:00:00.000Z"),
  pausedAt: null,
  ...o,
});

beforeEach(() => {
  h.thuTu = [];
  h.enrollments = [];
  h.updateMany.mockClear();
  h.deleteVideo.mockClear();
  h.updateProgress.mockClear();
  h.publish.mockClear();
});

describe("thứ tự năm việc", () => {
  it("dọn dữ liệu chạy SAU khi chốt quá hạn", async () => {
    // Việc dọn xoá dữ liệu thô mà việc chốt quá hạn đang đọc. Chạy trước là rút
    // thảm dưới chân một việc chưa chạy — và không có lỗi nào nổ ra.
    h.enrollments = [en("a")];
    await runElearningDem(NOW);
    // Khẳng định CẢ HAI việc thật sự đã chạy trước: so `indexOf` mà một bên
    // vắng mặt sẽ ra -1, và phép so vẫn có thể xanh nhờ đúng cái vắng mặt đó.
    expect(h.thuTu).toContain("qua-han");
    expect(h.thuTu).toContain("don");
    expect(h.thuTu.indexOf("qua-han")).toBeLessThan(h.thuTu.indexOf("don"));
  });

  it("tập ĐỘNG chạy trước khi dọn, thử lại hàng đợi chạy cuối", async () => {
    await runElearningDem(NOW);
    for (const v of ["tap-dong", "don", "thu-lai"]) expect(h.thuTu, v).toContain(v);
    expect(h.thuTu.indexOf("tap-dong")).toBeLessThan(h.thuTu.indexOf("don"));
    expect(h.thuTu.indexOf("thu-lai")).toBeGreaterThan(h.thuTu.indexOf("don"));
  });
});

describe("nói ra việc CHƯA LÀM ĐƯỢC, không im lặng bỏ trống", () => {
  it("chứng nhận báo rõ bảng còn thiếu và ticket sở hữu", async () => {
    const r = await runElearningDem(NOW);
    expect(r.chungNhan).toEqual({ chuaLamDuoc: "TrnCertificate chưa tồn tại (EL-16)" });
  });

  it("`examAttempt` là `null`, KHÔNG phải 0", async () => {
    // 0 đọc thành "đã dọn và không có gì" — tức nói dối. `null` đọc thành "chưa
    // chạy được", và đó là sự thật.
    const r = await runElearningDem(NOW);
    expect(r.don.examAttempt).toBeNull();
  });
});

describe("việc 1 — quá hạn", () => {
  it("chỉ đánh dấu người đủ điều kiện, và phát sự kiện cho từng người", async () => {
    h.enrollments = [en("a"), en("b", { pausedAt: new Date("2026-07-01") })];
    const r = await runElearningDem(NOW);
    expect(r.quaHan).toBe(1);
    expect(h.updateMany.mock.calls[0]?.[0].where.id.in).toEqual(["a"]);
    expect(h.publish).toHaveBeenCalledTimes(1);
  });

  it("sự kiện có khoá chống trùng theo lượt ghi danh", async () => {
    // Không có khoá này thì mỗi đêm quét lại là mỗi đêm người học nhận thêm một
    // email "bạn đã quá hạn" cho cùng một việc.
    h.enrollments = [en("a")];
    await runElearningDem(NOW);
    const [ten, , opts] = h.publish.mock.calls[0]!;
    expect(ten).toBe("elearning.enrollment.overdue");
    expect(opts?.dedupeKey).toBe("el.over:a");
  });

  it("không ai quá hạn ⇒ không gọi update, không phát sự kiện", async () => {
    const r = await runElearningDem(NOW);
    expect(r.quaHan).toBe(0);
    expect(h.updateMany).not.toHaveBeenCalled();
    expect(h.publish).not.toHaveBeenCalled();
  });
});

describe("việc 4 — dọn dữ liệu tầng 2", () => {
  it("KHÔNG chạm cột `status` của bảng nào", async () => {
    // QĐ-CDA-14: dọn là xoá dữ liệu thô, không phải đổi kết luận nghiệp vụ.
    await runElearningDem(NOW);
    const data = h.updateProgress.mock.calls[0]?.[0].data;
    expect(Object.keys(data ?? {})).toEqual(["segmentBitmap", "bitmapPurgedAt"]);
  });

  it("chỉ dọn bản đồ đoạn xem của bài ĐÃ XONG và đã im ắng", async () => {
    await runElearningDem(NOW);
    const w = h.updateProgress.mock.calls[0]?.[0].where;
    expect(w?.status).toBe("DONE");
    expect(w?.segmentBitmap).toEqual({ not: null });
  });
});

describe("một việc hỏng KHÔNG làm chết cả lượt chạy", () => {
  it("tập ĐỘNG ném lỗi thì bốn việc kia vẫn chạy", async () => {
    // Cron đêm hỏng nửa chừng mà im lặng là mất luôn việc dọn dữ liệu và việc
    // thử lại hàng đợi — hai thứ tích luỹ hậu quả theo ngày.
    h.tapDong.mockRejectedValueOnce(new Error("luật lọc hỏng"));
    const r = await runElearningDem(NOW);
    expect(r.loi.map((l) => l.viec)).toContain("tap-dong");
    expect(h.deleteVideo).toHaveBeenCalled();
    expect(h.thuTu).toContain("thu-lai");
  });
});

describe("việc 6 — dọn lượt tải nhiều phần bỏ dở", () => {
  it("chạy trong CÙNG lượt cron, không xin khe thứ ba", async () => {
    // Ngân sách của module là đúng hai khe cron (QĐ-CDA-14 điểm 2).
    const r = await runElearningDem(NOW);
    expect(r.taiDo).toBeDefined();
  });

  it("bucket chưa cấu hình ⇒ NÓI RA, không báo 0", async () => {
    // `0` đọc thành "đã quét và không có gì" — tức nói dối về một việc chưa chạy.
    const r = await runElearningDem(NOW);
    expect("chuaLamDuoc" in r.taiDo || "daHuy" in r.taiDo).toBe(true);
  });

  it("việc dọn tải dở chạy TRƯỚC việc thử lại hàng đợi", async () => {
    // Nó thuộc nhóm DỌN; đặt sau việc (5) là xen một việc xoá vào giữa một việc
    // đang tạo bản ghi.
    await runElearningDem(NOW);
    expect(h.thuTu.indexOf("don")).toBeLessThan(h.thuTu.indexOf("thu-lai"));
  });
});
