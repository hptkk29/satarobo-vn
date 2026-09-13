"use client";

// Khung tab của trang Cấu hình vận hành — nơi DUY NHẤT giữ "đang mở tab nào".
//
// Tách khỏi `page.tsx` vì trang là Server Component (nó đọc DB và biến môi trường), còn trạng
// thái tab thì phải ở client. Mọi dữ liệu đã tính sẵn ở server rồi truyền xuống: khung này
// không tự đi hỏi gì thêm.
//
// Tab "Thông báo điện thoại" hiện KHÁC các tab còn lại — nó có thêm bảng 51 công tắc loại
// thông báo. Cố ý không ép nó vào chung một khuôn: một trong hai thứ đó là bật/tắt cả kênh,
// thứ kia là chọn trong danh sách dài. Nhét chung một khuôn là được sự "nhất quán" trên hình
// và mất đi thứ người dùng cần — sự rõ ràng về hai tầng quyết định.

import { useState } from "react";
import { BangCauHinhTab, ThanhTab, type SettingRowView } from "./settings-editor";
import { ChonLoaiThongBao, type CanhBaoKenh } from "./chon-loai-thong-bao";
import type { NotiCatalogEntry } from "@/lib/notifications/catalog";

export interface TabView {
  id: string;
  ten: string;
  moTa: string;
  rows: SettingRowView[];
}

export function KhungCauHinh({
  tabs,
  choSua,
  tabThongBao,
  danhMucThongBao,
  loaiDangBat,
  canhBaoKenh,
}: {
  tabs: readonly TabView[];
  choSua: boolean;
  /** Id của tab mang bảng chọn loại thông báo. */
  tabThongBao: string;
  danhMucThongBao: readonly NotiCatalogEntry[];
  loaiDangBat: readonly string[];
  canhBaoKenh: readonly CanhBaoKenh[];
}) {
  const [dangChon, setDangChon] = useState(tabs[0]?.id ?? "");
  const tab = tabs.find((t) => t.id === dangChon) ?? tabs[0];
  if (!tab) return null;

  return (
    <div className="space-y-4">
      <ThanhTab tabs={tabs} dangChon={tab.id} onChon={setDangChon} />

      {/* Câu mô tả tab đặt NGAY dưới thanh tab, không nhét vào tooltip: người mở một tab lạ
          cần biết mình đang xem gì trước khi đọc 18 dòng tham số. */}
      <p className="text-sm text-muted-foreground">{tab.moTa}</p>

      <div role="tabpanel" aria-label={tab.ten} className="space-y-4">
        <BangCauHinhTab rows={tab.rows} choSua={choSua} />

        {tab.id === tabThongBao && (
          <ChonLoaiThongBao
            danhMuc={danhMucThongBao}
            dangBat={loaiDangBat}
            choSua={choSua}
            canhBao={canhBaoKenh}
          />
        )}
      </div>
    </div>
  );
}
