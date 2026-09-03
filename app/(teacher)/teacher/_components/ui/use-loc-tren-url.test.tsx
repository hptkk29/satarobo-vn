// Canh gác hook đưa bộ lọc lên URL — QA site GV vòng 1 (BUG-019).
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useLocTrenUrl } from "./use-loc-tren-url";

const MAC_DINH = { q: "", trangThai: "ALL" };

function datUrl(search: string) {
  window.history.replaceState(null, "", `/teacher/lop${search}`);
}

beforeEach(() => {
  datUrl("");
});

describe("useLocTrenUrl", () => {
  it("giá trị mặc định KHÔNG lên query string — URL sạch", () => {
    const { result } = renderHook(() => useLocTrenUrl(MAC_DINH));
    act(() => result.current.dat("trangThai", "ALL"));
    expect(window.location.search).toBe("");
  });

  it("đổi giá trị ⇒ lên URL; đọc lại ra đúng giá trị (round-trip)", () => {
    const { result } = renderHook(() => useLocTrenUrl(MAC_DINH));
    act(() => result.current.dat("trangThai", "ACTIVE"));
    expect(window.location.search).toContain("trangThai=ACTIVE");

    // Dựng lại hook trên chính URL đó — như F5 hoặc mở link người khác gửi.
    const lai = renderHook(() => useLocTrenUrl(MAC_DINH));
    expect(lai.result.current.gia_tri.trangThai).toBe("ACTIVE");
  });

  it("GIỮ NGUYÊN tham số lạ trên URL — không đá bay ngữ cảnh màn khác", () => {
    datUrl("?s=hv-1&ptab=nhan-xet");
    const { result } = renderHook(() => useLocTrenUrl(MAC_DINH));
    act(() => result.current.dat("q", "trí"));
    expect(window.location.search).toContain("s=hv-1");
    expect(window.location.search).toContain("ptab=nhan-xet");
    expect(window.location.search).toContain("q=tr");
  });

  it("quay về mặc định ⇒ XOÁ tham số khỏi URL, không để lại rác", () => {
    const { result } = renderHook(() => useLocTrenUrl(MAC_DINH));
    act(() => result.current.dat("trangThai", "ACTIVE"));
    act(() => result.current.dat("trangThai", "ALL"));
    expect(window.location.search).not.toContain("trangThai");
  });

  it("dùng history.replaceState, KHÔNG đẩy mục lịch sử mới", () => {
    const push = vi.spyOn(window.history, "pushState");
    const { result } = renderHook(() => useLocTrenUrl(MAC_DINH));
    act(() => result.current.dat("q", "abc"));
    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
  });

  it("dang_loc phản ánh đúng có đang lọc hay không", () => {
    const { result } = renderHook(() => useLocTrenUrl(MAC_DINH));
    expect(result.current.dang_loc).toBe(false);
    act(() => result.current.dat("q", "x"));
    expect(result.current.dang_loc).toBe(true);
  });

  it("xoa_het trả mọi khoá về mặc định và dọn URL", () => {
    const { result } = renderHook(() => useLocTrenUrl(MAC_DINH));
    act(() => result.current.dat_nhieu({ q: "x", trangThai: "ACTIVE" }));
    act(() => result.current.xoa_het());
    expect(result.current.gia_tri).toEqual(MAC_DINH);
    expect(window.location.search).toBe("");
  });

  it("tham số rỗng trên URL coi như không truyền", () => {
    datUrl("?trangThai=");
    const { result } = renderHook(() => useLocTrenUrl(MAC_DINH));
    expect(result.current.gia_tri.trangThai).toBe("ALL");
  });
});
