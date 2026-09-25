"use client";

// Ô địa chỉ 2 CẤP của hồ sơ học viên (25/09/2026) — Tỉnh/Thành → Phường/Xã, cùng mô hình
// với phiếu lead (`leads/_components/lead-form.tsx`, danh mục hiệu lực 01/07/2025) để một
// gia đình khai ở hai màn ra cùng một chuỗi. LƯU TÊN (ô ẩn `city` / `ward`), không lưu mã.
//
// Khác bản của lead-form ở một điểm có chủ đích: TỈNH đang lưu mà không có trong danh mục
// cũng được giữ thành option tạm (lead-form chỉ giữ phường). Học viên cũ là chữ gõ tay thời
// form còn ô tự do, nên ca này là thường chứ không phải hiếm — xem `dia-chi.ts`.
//
// Danh sách phường nạp LƯỜI (`import()` khi đổi tỉnh); phường của tỉnh đang lưu do trang
// nạp sẵn ở server (`initialWards`) để mở hồ sơ ra là đổi được phường ngay.

import { useMemo, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { toNameOptions } from "@/lib/address/vn-address";
import { laTinhCu, luaChonPhuong, luaChonTinh, tenTinhTuGiaTri } from "./dia-chi";
import { O_NHAP, Truong } from "./o-nhap";

const O_COMBO = "h-10 border-border bg-card sm:h-9";

export function DiaChiPicker({
  provinces,
  initialWards,
  city,
  ward,
  address,
  district,
}: {
  provinces: ComboboxOption[];
  initialWards: ComboboxOption[];
  city: string | null;
  ward: string | null;
  address: string | null;
  /** Cột `district` cũ (mô hình 3 cấp) — chỉ HIỂN THỊ, form không gửi nên không bị xoá. */
  district: string | null;
}) {
  // Option tỉnh dựng MỘT lần từ tên đang lưu: người dùng lỡ chọn tỉnh khác vẫn quay lại
  // được đúng giá trị cũ.
  const tinh = useMemo(() => luaChonTinh(provinces, city), [provinces, city]);
  const [tinhDangChon, setTinhDangChon] = useState<string | null>(tinh.chon);
  // Giữ NGUYÊN chuỗi đang lưu (kể cả kiểu "Da Nang" khớp bỏ dấu) cho tới khi người dùng
  // chủ động chọn — đừng "sửa hộ" dữ liệu chỉ vì mở form.
  const [cityName, setCityName] = useState((city ?? "").trim());
  const [wardName, setWardName] = useState((ward ?? "").trim());
  const [wardOptions, setWardOptions] = useState<ComboboxOption[]>(initialWards);
  const [dangTai, setDangTai] = useState(false);
  const [loiTai, setLoiTai] = useState(false);

  const phuong = luaChonPhuong(wardOptions, wardName);
  const coDanhMuc = provinces.length > 0;

  function chonTinh(next: string | null) {
    if (next === tinhDangChon) return;
    setTinhDangChon(next);
    setCityName(tenTinhTuGiaTri(tinh.options, next));
    // Đổi tỉnh thì phường cũ chắc chắn sai — xoá, đừng để một cặp tỉnh/phường không tồn
    // tại trôi xuống DB.
    setWardName("");
    setWardOptions([]);
    setLoiTai(false);
    if (!next || laTinhCu(next)) return;
    setDangTai(true);
    void import("vietnam-address-data")
      // `toNameOptions`, KHÔNG `toAddressOptions`: cột `Student.ward` chứa TÊN.
      .then(({ getWardsByProvince }) => setWardOptions(toNameOptions(getWardsByProvince(next))))
      .catch(() => {
        setWardOptions([]);
        setLoiTai(true);
      })
      .finally(() => setDangTai(false));
  }

  const khoaPhuong = coDanhMuc && (!tinhDangChon || dangTai || laTinhCu(tinhDangChon));

  return (
    <div className="grid gap-4 @lg:grid-cols-2 @4xl:grid-cols-3">
      <input type="hidden" name="city" value={cityName} />
      <input type="hidden" name="ward" value={wardName} />

      <Truong id="hv-city" nhan="Tỉnh / Thành phố">
        {coDanhMuc ? (
          <Combobox
            id="hv-city"
            options={tinh.options}
            value={tinhDangChon}
            onValueChange={chonTinh}
            placeholder="Tìm tỉnh/thành…"
            emptyText="Không tìm thấy tỉnh/thành"
            className={O_COMBO}
          />
        ) : (
          // Trang quên truyền danh mục ⇒ vẫn cho gõ tay thay vì khoá cứng ô.
          <input
            id="hv-city"
            value={cityName}
            onChange={(e) => setCityName(e.target.value)}
            className={O_NHAP}
            autoComplete="address-level1"
          />
        )}
      </Truong>

      <Truong
        id="hv-ward"
        nhan="Phường / Xã"
        phu={
          loiTai
            ? "Không tải được danh sách phường/xã — chọn lại tỉnh để thử lại."
            : coDanhMuc && tinhDangChon && laTinhCu(tinhDangChon)
              ? "Tỉnh đang lưu không có trong danh mục mới — chọn lại tỉnh để đổi phường/xã."
              : undefined
        }
      >
        {coDanhMuc ? (
          <Combobox
            id="hv-ward"
            options={phuong}
            value={wardName || null}
            onValueChange={(v) => setWardName(v ?? "")}
            disabled={khoaPhuong}
            placeholder={
              !tinhDangChon ? "Chọn tỉnh/thành trước" : dangTai ? "Đang tải…" : "Tìm phường/xã…"
            }
            emptyText="Không tìm thấy phường/xã"
            className={O_COMBO}
          />
        ) : (
          <input
            id="hv-ward"
            value={wardName}
            onChange={(e) => setWardName(e.target.value)}
            className={O_NHAP}
          />
        )}
      </Truong>

      <Truong id="hv-address" nhan="Địa chỉ chi tiết" className="@lg:col-span-2 @4xl:col-span-1">
        <input
          id="hv-address"
          name="address"
          defaultValue={address ?? ""}
          placeholder="Số nhà, tên đường"
          autoComplete="street-address"
          className={O_NHAP}
        />
      </Truong>

      {district && (
        <p className="text-xs text-muted-foreground @lg:col-span-2 @4xl:col-span-3">
          Quận/Huyện (dữ liệu cũ): <span className="text-foreground">{district}</span> — từ
          01/07/2025 không còn cấp quận/huyện; giá trị này chỉ để tra cứu, không sửa ở đây.
        </p>
      )}
    </div>
  );
}
