"use client";

// Bộ lọc danh sách sống trên URL thay vì trong bộ nhớ component.
//
// Vì sao (QA site GV vòng 1, BUG-019 — nguyên nhân gốc RC-7): 10 màn của site giáo
// viên giữ bộ lọc bằng `useState` thuần, nên đổi bộ lọc không đổi query string ⇒ không
// gửi link cho đồng nghiệp được, F5 là mất sạch. Trong khi các màn khác của chính site
// này đã làm đúng với `?classId=…&tab=…`.
//
// ⚠️ Dùng `history.replaceState`, KHÔNG dùng `router.replace`. `router.replace` bắt
// Next nạp lại RSC payload sau MỖI phím gõ trong ô tìm kiếm — màn Học viên đang đổ 273
// dòng thì đó là một lượt truy vấn cho mỗi ký tự. Đánh đổi có ý thức: URL chia sẻ được
// và sống sót qua F5, nhưng Back/Forward KHÔNG lần ngược từng bước lọc (replaceState
// không tạo mục lịch sử). Người dùng cần "quay lại" là quay lại TRANG trước, không phải
// bộ lọc trước — đó mới là thứ họ trông đợi.
//
// ⚠️ GIỮ NGUYÊN tham số lạ trên URL. Trang hồ sơ học viên dùng `?s=…&ptab=…&classId=…`;
// một hook lọc mà ghi đè cả query string sẽ đá bay ngữ cảnh của màn khác.
import { useCallback, useEffect, useMemo, useState } from "react";

export type LocTrenUrl<K extends string> = {
  gia_tri: Record<K, string>;
  dat: (khoa: K, gia_tri: string) => void;
  dat_nhieu: (patch: Partial<Record<K, string>>) => void;
  xoa_het: () => void;
  /** Có bộ lọc nào đang khác mặc định không — để hiện nút "Xoá bộ lọc". */
  dang_loc: boolean;
};

/**
 * @param macDinh giá trị mặc định của từng khoá. Khoá đang mang giá trị mặc định thì
 *   KHÔNG xuất hiện trên URL — URL sạch, và "không có tham số" luôn nghĩa là "mặc định".
 */
export function useLocTrenUrl<K extends string>(
  macDinh: Record<K, string>,
): LocTrenUrl<K> {
  const khoas = useMemo(() => Object.keys(macDinh) as K[], [macDinh]);

  // Đọc URL MỘT LẦN lúc dựng: server render không có `window`, nên khởi tạo bằng mặc
  // định rồi đồng bộ trong effect — tránh lệch hydrate.
  const [giaTri, setGiaTri] = useState<Record<K, string>>(macDinh);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const tu_url = { ...macDinh };
    let co = false;
    for (const k of khoas) {
      const v = q.get(k);
      if (v != null && v !== "") {
        tu_url[k] = v;
        co = true;
      }
    }
    if (co) setGiaTri(tu_url);
    // Chỉ chạy một lần lúc gắn: sau đó URL do chính hook này ghi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ghiUrl = useCallback(
    (next: Record<K, string>) => {
      if (typeof window === "undefined") return;
      const q = new URLSearchParams(window.location.search);
      for (const k of khoas) {
        if (next[k] === macDinh[k]) q.delete(k);
        else q.set(k, next[k]);
      }
      const s = q.toString();
      window.history.replaceState(
        null,
        "",
        s ? `${window.location.pathname}?${s}` : window.location.pathname,
      );
    },
    [khoas, macDinh],
  );

  const dat_nhieu = useCallback(
    (patch: Partial<Record<K, string>>) => {
      setGiaTri((cu) => {
        const next = { ...cu, ...patch } as Record<K, string>;
        ghiUrl(next);
        return next;
      });
    },
    [ghiUrl],
  );

  const dat = useCallback(
    (khoa: K, v: string) => dat_nhieu({ [khoa]: v } as Partial<Record<K, string>>),
    [dat_nhieu],
  );

  const xoa_het = useCallback(() => {
    setGiaTri(macDinh);
    ghiUrl(macDinh);
  }, [ghiUrl, macDinh]);

  const dang_loc = khoas.some((k) => giaTri[k] !== macDinh[k]);

  return { gia_tri: giaTri, dat, dat_nhieu, xoa_het, dang_loc };
}
