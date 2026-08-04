// Bảng kết quả import: THÔNG BÁO (ℹ️) không được đếm là LỖI.
//
// Ca thật 03/08: nhập 37 lead CS2 → 6 tạo mới, 28 dòng trùng đã có sẵn. Màn cũ báo
// "Thành công: 6 | Lỗi: 28" dù không dòng nào hỏng → người nhập tưởng fail và nhập
// lại. Test này khoá lại cách đếm.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ImportOutcome } from "./ExcelImporter";

afterEach(cleanup);

const noop = () => {};

describe("ImportOutcome", () => {
  it("dòng ℹ️ đếm vào 'Đã có sẵn / bỏ qua', KHÔNG vào 'Lỗi'", () => {
    render(
      <ImportOutcome
        result={{
          success: 6,
          errors: Array.from({ length: 28 }, (_, i) => ({
            row: 0,
            error: `ℹ️ SĐT 090500000${i}: con đã có sẵn trong lead — không thêm gì`,
          })),
        }}
        onReset={noop}
      />,
    );

    expect(screen.getByText(/Đã có sẵn \/ bỏ qua/)).toBeTruthy();
    expect(screen.getByText("28")).toBeTruthy();
    // Không có dòng hỏng → tuyệt đối không được hiện chữ "Lỗi:" ở dòng tổng kết.
    expect(screen.queryByText(/❌ Lỗi:/)).toBeNull();
    expect(screen.getByText(/không có dòng nào lỗi/)).toBeTruthy();
  });

  it("lỗi thật vẫn hiện đỏ và tách khỏi thông báo", () => {
    render(
      <ImportOutcome
        result={{
          success: 1,
          errors: [
            { row: 5, error: "SĐT không hợp lệ: \"12345\"" },
            { row: 0, error: "ℹ️ Đã gộp 2 con vào 1 lead có sẵn cùng SĐT" },
          ],
        }}
        onReset={noop}
      />,
    );

    expect(screen.getByText(/SĐT không hợp lệ/)).toBeTruthy();
    expect(screen.getByText(/dòng KHÔNG được ghi/)).toBeTruthy();
    expect(screen.getByText(/Ghi chú \(1\)/)).toBeTruthy();
  });

  it("không lỗi, không thông báo → chỉ báo thành công", () => {
    render(<ImportOutcome result={{ success: 3, errors: [] }} onReset={noop} />);
    expect(screen.queryByText(/Ghi chú/)).toBeNull();
    expect(screen.queryByText(/bỏ qua/)).toBeNull();
  });
});
