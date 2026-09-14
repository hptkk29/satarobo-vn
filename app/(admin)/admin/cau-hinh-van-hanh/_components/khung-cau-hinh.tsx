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

import { useCallback, useEffect, useState, type ReactNode } from "react";
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
  noiDungRieng,
  tabBanDau,
}: {
  tabs: readonly TabView[];
  choSua: boolean;
  /** Id của tab mang bảng chọn loại thông báo. */
  tabThongBao: string;
  danhMucThongBao: readonly NotiCatalogEntry[];
  loaiDangBat: readonly string[];
  canhBaoKenh: readonly CanhBaoKenh[];
  /**
   * Tab có nội dung RIÊNG, không phải danh sách ô cấu hình: `tabId → khối JSX`.
   *
   * Hai tab đầu tiên dùng nó là "Phương thức thanh toán" (bảng danh mục + nút thêm) và
   * "Hoa hồng" (bảng chính sách khai được). Chúng không phải một con số để nhét vào ô
   * nhập, nên ép vào chung khuôn `BangCauHinhTab` là được sự nhất quán trên hình và mất
   * đi thứ người dùng cần — cùng lý do tab Thông báo đẩy đã có khối riêng ngay bên dưới.
   *
   * Nội dung dựng ở Server Component rồi truyền xuống như `ReactNode`: khung này không tự
   * đi hỏi gì thêm, đúng như nó vẫn làm với mọi tab khác.
   */
  noiDungRieng?: Readonly<Record<string, ReactNode>>;
  /**
   * Tab mở sẵn — trang đọc từ `?tab=` rồi truyền xuống.
   *
   * Bỏ trống ⇒ tab đầu tiên. Giá trị lạ cũng rơi về tab đầu (fail-soft): đường dẫn cũ hoặc
   * người gõ tay `?tab=linh-tinh` phải ra một trang dùng được, không phải trang trắng.
   */
  tabBanDau?: string;
}) {
  const [dangChon, setDangChon] = useState(
    () => (tabBanDau && tabs.some((t) => t.id === tabBanDau) ? tabBanDau : tabs[0]?.id) ?? "",
  );

  /**
   * ĐỔI TAB THÌ ĐỔI CẢ ĐƯỜNG DẪN.
   *
   * Chủ dự án 14/09/2026: "khi ở tab hoa hồng ở cấu hình vận hành xong chuyển sang màn
   * leads xong bấm quay lui thì bị chuyển về tab thông báo đẩy". Đúng — tab chỉ sống trong
   * `useState`, mà state mất khi rời trang; quay lại là mount mới và về tab đầu.
   *
   * ⚠️ Dùng `history.replaceState` THUẦN, KHÔNG `router.replace`:
   *   · `router.replace` kéo theo một lượt dựng lại Server Component cho MỌI lần bấm tab —
   *     trang này `force-dynamic` và đọc DB, nên mỗi cú bấm tốn một vòng máy chủ chỉ để
   *     đổi thứ đã nằm sẵn trong bộ nhớ trình duyệt.
   *   · `replaceState` ĐÈ mục lịch sử hiện tại thay vì thêm mục mới — bấm qua 5 tab rồi
   *     Back phải ra khỏi trang, không phải lùi từng tab một. Đó cũng đúng ý: người dùng
   *     nhớ "tôi đang ở Cấu hình vận hành", không nhớ mình đã xem tab nào trước đó.
   *
   * Khi rời trang, URL đã mang `?tab=…`; lúc Back, trang dựng lại từ đường dẫn đó và
   * `tabBanDau` khôi phục đúng tab.
   */
  const doiTab = useCallback((id: string) => {
    setDangChon(id);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(window.history.state, "", url);
  }, []);

  // Back/Forward của trình duyệt KHÔNG dựng lại component này khi Next phục vụ từ bộ đệm
  // phía client — state cũ ở lại trong khi đường dẫn đã đổi, và màn hiện một tab khác với
  // tab ghi trên URL. Nghe theo `popstate` để hai thứ luôn nói cùng một điều.
  useEffect(() => {
    function theoLichSu() {
      const id = new URL(window.location.href).searchParams.get("tab");
      if (id && tabs.some((t) => t.id === id)) setDangChon(id);
    }
    window.addEventListener("popstate", theoLichSu);
    return () => window.removeEventListener("popstate", theoLichSu);
  }, [tabs]);

  const tab = tabs.find((t) => t.id === dangChon) ?? tabs[0];
  if (!tab) return null;

  return (
    <div className="space-y-4">
      {/* Dính đỉnh khi cuộn — CHỈ từ `lg` trở lên: tab "Chấm công" có 18 dòng, cuộn tới cuối
          rồi muốn đổi tab thì không phải kéo ngược lên đầu trang. Dưới `lg` thì thanh tab
          chiếm 2–3 hàng (và ở điện thoại là ô chọn), dính vào là ăn mất một phần ba màn hình
          suốt lúc cuộn.
          ⚠️ Nền ĐẶC, tuyệt đối không `backdrop-blur` — một tổ tiên có `backdrop-filter` trở
          thành khối chứa cho mọi con `position: fixed`, đúng lỗi đã làm vỡ drawer trang public
          hôm 13/09. Ở đây có lớp phủ dính bên dưới, không đáng đánh đổi. */}
      <div className="z-20 -mx-1 bg-muted px-1 pb-1 pt-1 lg:sticky lg:top-0">
        <ThanhTab tabs={tabs} dangChon={tab.id} onChon={doiTab} />
      </div>

      {/* Câu mô tả tab đặt NGAY dưới thanh tab, không nhét vào tooltip: người mở một tab lạ
          cần biết mình đang xem gì trước khi đọc 18 dòng tham số. */}
      <p className="max-w-[72ch] text-sm text-muted-foreground">{tab.moTa}</p>

      <div role="tabpanel" aria-label={tab.ten} className="space-y-4">
        {/* Tab có nội dung riêng thì KHÔNG dựng bảng ô cấu hình — không phải để gọn, mà
            vì bảng đó sẽ rỗng và một bảng rỗng nằm trên đầu trang trông y hệt lỗi tải. */}
        {noiDungRieng?.[tab.id] ?? <BangCauHinhTab rows={tab.rows} choSua={choSua} />}

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
