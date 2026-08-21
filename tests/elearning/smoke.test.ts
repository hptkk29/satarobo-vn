/**
 * EL-07 · AC4 + AC6 — smoke của hạ tầng test module đào tạo nội bộ.
 *
 * Bài test này tồn tại để chứng minh MỘT điều: `tests/elearning/**` thật sự ĐƯỢC CHẠY.
 * `vitest.config.ts` khai `include` là bộ lọc CỨNG — không khai thư mục này ở đó thì
 * `vitest run tests/elearning` báo "No test files found" và job CI vẫn XANH dù test
 * viết đúng. Đó là kiểu hỏng câm nguy hiểm nhất: tưởng có lưới an toàn mà không có.
 */
import { describe, expect, it, afterEach } from "vitest";
import { isElearningEnabled } from "@/lib/flags";

describe("[EL-07] hạ tầng test module e-learning", () => {
  it("thư mục tests/elearning được vitest nhận (AC4)", () => {
    expect(true).toBe(true);
  });
});

describe("[EL-07-T7-05] cờ ELEARNING_ENABLED — chỉ đúng chuỗi 'true' mới bật (AC6)", () => {
  const goc = process.env.ELEARNING_ENABLED;
  afterEach(() => {
    if (goc === undefined) delete process.env.ELEARNING_ENABLED;
    else process.env.ELEARNING_ENABLED = goc;
  });

  it("chưa khai → OFF", () => {
    delete process.env.ELEARNING_ENABLED;
    expect(isElearningEnabled()).toBe(false);
  });

  it.each(["1", "TRUE", "True", "yes", "on", "false", ""])(
    "giá trị %j → OFF (không nhận biến thể)",
    (v) => {
      process.env.ELEARNING_ENABLED = v;
      expect(isElearningEnabled()).toBe(false);
    },
  );

  it("đúng chuỗi 'true' → ON", () => {
    process.env.ELEARNING_ENABLED = "true";
    expect(isElearningEnabled()).toBe(true);
  });
});
