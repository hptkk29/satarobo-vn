"use client";

// BỌC MỘT BẢNG CÓ SẴN → có phân trang, KHÔNG phải viết lại bảng đó.
//
// Vì sao có thêm cái này bên cạnh `BangPhanTrang`: hệ có ~140 bảng cần phân trang, mỗi
// bảng một kiểu class, một kiểu dòng rỗng, có bảng còn `<tfoot>` tổng cộng. Viết lại từng
// cái là 140 cơ hội làm vỡ giao diện. Ở đây chỉ BỌC:
//
//   <PhanTrangBang tenDonVi="học viên">
//     <table className="...">…nguyên xi như cũ…</table>
//   </PhanTrangBang>
//
// Component đọc cây con, tìm `<tbody>`, cắt DANH SÁCH DÒNG của nó theo trang rồi dựng lại
// đúng cái bảng đó. Mọi className, `<thead>`, `<tfoot>`, cấu trúc ô — giữ nguyên tuyệt đối.
//
// ⚠️ Cắt ở TẦNG HIỂN THỊ, không phải tầng truy vấn — xem ghi chú dài trong
// `components/ui/bang-phan-trang.tsx`. Bảng lớn tới mức nặng truy vấn vẫn phải phân trang
// ở tầng DB (`/admin/leads` là mẫu).
//
// ⚠️ FAIL-SAFE: gặp hình dạng lạ (không thấy `<tbody>`, có nhiều hơn một `<tbody>`) thì
// render Y NGUYÊN bảng gốc, không phân trang. Thà một bảng dài còn hơn một bảng sai.

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { MUC_SO_DONG, SO_DONG_MAC_DINH } from "@/components/ui/bang-phan-trang";
import { DieuHuongTrang } from "@/components/ui/dieu-huong-trang";
import { cn } from "@/lib/utils";

const KHOA_LUU = "satarobo:bang:soDong";

/** Trải phẳng children của tbody: `.map()` cho mảng, điều kiện cho `false`/`null`. */
function trảiDòng(children: ReactNode): ReactNode[] {
  return Children.toArray(children).filter((c) => isValidElement(c));
}

type ElementCoChildren = ReactElement<{ children?: ReactNode }>;

/**
 * Có phải phần tử thân bảng không — nhận CẢ `<tbody>` thô lẫn `<TableBody>` của shadcn.
 * Repo dùng lẫn hai kiểu (97 file thô / 17 file shadcn); chỉ nhận một kiểu là 17 bảng kia
 * âm thầm không phân trang mà không ai biết vì fail-safe không kêu.
 */
function laThanBang(c: unknown): boolean {
  if (!isValidElement(c)) return false;
  const t = c.type as string | { displayName?: string; name?: string };
  if (t === "tbody") return true;
  if (typeof t === "function" || (typeof t === "object" && t !== null)) {
    const ten = (t as { displayName?: string; name?: string }).displayName ??
      (t as { name?: string }).name;
    return ten === "TableBody";
  }
  return false;
}

export function PhanTrangBang({
  children,
  tenDonVi = "dòng",
  khoaGhiNho,
  soDongMacDinh = SO_DONG_MAC_DINH,
  className,
  cuonNgang = false,
}: {
  /** ĐÚNG MỘT phần tử `<table>`. */
  children: ReactNode;
  tenDonVi?: string;
  khoaGhiNho?: string;
  soDongMacDinh?: number;
  className?: string;
  /**
   * Tự bọc RIÊNG cái bảng trong vùng cuộn ngang (`overflow-x-auto`).
   *
   * 25/08 — vá lỗi "cuộn sang phải là mất thanh phân trang". Nếp cũ ở ~24 bảng là bọc
   * cả `<PhanTrangBang>` trong một div `overflow-x-auto`, mà thanh phân trang lại là
   * con của component ⇒ nó nằm TRONG vùng cuộn: kéo bảng sang phải để đọc cột cuối là
   * nút chuyển trang trôi khỏi màn hình. Bật cờ này rồi BỎ div bọc ngoài ở chỗ gọi:
   * bảng cuộn được, thanh phân trang đứng yên.
   */
  cuonNgang?: boolean;
}) {
  const [soDong, setSoDong] = useState(soDongMacDinh);
  const [trang, setTrang] = useState(1);
  const idSelect = useId();
  const khoa = khoaGhiNho ? `${KHOA_LUU}:${khoaGhiNho}` : KHOA_LUU;

  useEffect(() => {
    try {
      const luu = Number(window.localStorage?.getItem(khoa));
      if (MUC_SO_DONG.includes(luu as (typeof MUC_SO_DONG)[number])) setSoDong(luu);
    } catch {
      /* localStorage có thể ném (Safari riêng tư) — mất chỗ ghi nhớ thôi, đừng vỡ bảng */
    }
  }, [khoa]);

  const { bang, dong, viTriTbody } = useMemo(() => {
    const el = Children.toArray(children).find(isValidElement) as ElementCoChildren | undefined;
    if (!el) return { bang: null, dong: [] as ReactNode[], viTriTbody: -1 };
    const con = Children.toArray(el.props.children);
    const cacTbody = con
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => laThanBang(c));
    // 0 hoặc >1 tbody → không đoán, trả bảng nguyên trạng.
    if (cacTbody.length !== 1) return { bang: el, dong: [] as ReactNode[], viTriTbody: -1 };
    const tbody = cacTbody[0].c as ElementCoChildren;
    return { bang: el, dong: trảiDòng(tbody.props.children), viTriTbody: cacTbody[0].i };
  }, [children]);

  const tong = dong.length;
  const soTrang = Math.max(1, Math.ceil(tong / soDong));
  const trangHt = Math.min(trang, soTrang);

  const bangDaCat = useMemo(() => {
    if (!bang || viTriTbody < 0) return bang;
    const con = Children.toArray((bang as ElementCoChildren).props.children);
    const tbody = con[viTriTbody] as ElementCoChildren;
    const dau = (trangHt - 1) * soDong;
    const conMoi = [...con];
    conMoi[viTriTbody] = cloneElement(tbody, undefined, dong.slice(dau, dau + soDong));
    return cloneElement(bang as ElementCoChildren, undefined, conMoi);
  }, [bang, viTriTbody, dong, trangHt, soDong]);

  function doiSoDong(n: number) {
    setSoDong(n);
    setTrang(1);
    try {
      window.localStorage?.setItem(khoa, String(n));
    } catch {
      /* bỏ qua */
    }
  }

  const tu = tong === 0 ? 0 : (trangHt - 1) * soDong + 1;
  const den = Math.min(tong, trangHt * soDong);
  // Bảng ngắn hơn mức nhỏ nhất, hoặc hình dạng lạ (viTriTbody < 0) → không bày gì thêm.
  const hienThanh = viTriTbody >= 0 && tong > MUC_SO_DONG[0];

  return (
    <div className={cn("space-y-3", className)}>
      {cuonNgang ? (
        // `relative` KHÔNG thừa: nhiều bảng có `<th><span className="sr-only">` mà
        // `sr-only` là `position:absolute`. Vùng cuộn không được định vị thì cái span đó
        // neo vào khối chứa ban đầu của TRANG ở x ≈ min-width của bảng (880px…), kéo cả
        // `<body>` trượt ngang mấy trăm px ở màn 375px — và `overflow-hidden` của thẻ card
        // KHÔNG cắt được nó, vì absolute chỉ bị cắt bởi tổ tiên CÓ định vị.
        // Site GV vá bằng `.t-card{position:relative}` (teacher.css); admin không có thứ
        // tương đương, nên đặt luôn ở đây cho mọi site.
        <div className="relative overflow-x-auto">{bangDaCat}</div>
      ) : (
        bangDaCat
      )}
      {hienThanh && (
        <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <label htmlFor={idSelect} className="whitespace-nowrap">
              Hiển thị
            </label>
            <select
              id={idSelect}
              value={soDong}
              onChange={(e) => doiSoDong(Number(e.target.value))}
              className="h-8 rounded-lg border border-border bg-background py-0 pl-2 pr-7 text-sm text-foreground outline-none focus:border-primary"
            >
              {MUC_SO_DONG.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span className="whitespace-nowrap">
              / {tong} {tenDonVi}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap tabular-nums">
              {tu}–{den} · trang {trangHt}/{soTrang}
            </span>
            <DieuHuongTrang trang={trangHt} soTrang={soTrang} onDoi={setTrang} />
          </div>
        </div>
      )}
    </div>
  );
}
