import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { SETTINGS } from "@/lib/settings/registry";
import { getResolvedSettings } from "@/lib/settings/service";
import { TAB_CAU_HINH, keyCuaTab, nhanCuaKey } from "@/lib/settings/nhan-van-hanh";
import { catalogEntries } from "@/lib/notifications/catalog";
import { kiemVapid, MO_TA_LOI_VAPID } from "@/lib/push/cau-hinh-vapid";
import { PageHelp } from "@/components/admin/ui/page-help";
import { layVaiNhanHoaHong } from "@/lib/crm/vai-nhan-hoa-hong";
import type { ChinhSachHoaHong } from "@/lib/crm/chinh-sach-hoa-hong";
import { BangChinhSachHoaHong } from "./_components/bang-chinh-sach-hoa-hong";
import { TabPhuongThucThanhToan } from "./_components/tab-phuong-thuc-tt";
import { KhungCauHinh, type TabView } from "./_components/khung-cau-hinh";
import type { CanhBaoKenh } from "./_components/chon-loai-thong-bao";

export const dynamic = "force-dynamic";

export const metadata = { title: "Cấu hình vận hành | Admin Sata Robo" };

/** Tab mang thêm bảng chọn loại thông báo. */
const TAB_THONG_BAO = "thong-bao-day";

/**
 * Khoá này KHÔNG hiện thành một ô nhập: nó được chọn bằng bảng 51 công tắc ở cuối tab
 * "Thông báo điện thoại". Để nó hiện cả hai nơi là hai ô cùng sửa một giá trị, và người dùng
 * sẽ tin cái nào cũng có lý.
 */
const KHOA_DO_BANG_CONG_TAC_LO = "push.tienToDuocDay";

/**
 * Cùng lý do với khoá trên: chính sách hoa hồng là một DANH SÁCH, sửa bằng bảng riêng ở
 * tab "Hoa hồng". Để nó hiện thành ô nhập JSON nữa là hai chỗ cùng sửa một giá trị.
 */
const KHOA_DO_BANG_HOA_HONG = "crm.commissionPolicies";

export default async function OperationalSettingsPage({
  searchParams,
}: {
  // `?tab=` giữ tab đang mở qua các lần rời trang rồi quay lại — xem `doiTab` trong
  // `khung-cau-hinh.tsx`. `?centerId=` là đường vào từ trang Cơ sở.
  searchParams: Promise<{ tab?: string; centerId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("settings:view"))) redirect("/admin/dashboard");

  const canEditGlobal = await checkPermission("settings:edit"); // settings:edit = SUPER_ADMIN
  const sp = await searchParams;

  // Chỉ đọc những key THẬT SỰ bày ra. Dựng danh sách từ bảng tab chứ không từ `SETTING_KEYS`:
  // như vậy một key mới mà quên khai nhãn vận hành sẽ KHÔNG lặng lẽ hiện ra dưới dạng tên
  // biến — nó vắng mặt, và `nhan-van-hanh.test.ts` làm đỏ ngay ở CI.
  const keyTheoTab = TAB_CAU_HINH.map((t) => ({ tab: t, keys: keyCuaTab(t.id) }));
  const moiKey = keyTheoTab.flatMap((x) => x.keys);
  // Hai key của hai tab có bảng riêng KHÔNG nằm trong `moiKey` (đã lọc khỏi danh sách ô
  // nhập) nên phải nạp thêm — quên là bảng hoa hồng mở ra rỗng và người dùng tưởng mất
  // cấu hình.
  const resolved = await getResolvedSettings([
    ...moiKey,
    "crm.commissionPolicies",
    "crm.commissionMaxTotalRate",
  ]);
  // Vai có thật, kèm TÊN TIẾNG VIỆT — ô chọn vai nhận hoa hồng không được in mã máy.
  const vai = await layVaiNhanHoaHong();

  const tabs: TabView[] = keyTheoTab.map(({ tab, keys }) => ({
    id: tab.id,
    ten: tab.ten,
    moTa: tab.moTa,
    rows: keys
      .filter((k) => k !== KHOA_DO_BANG_CONG_TAC_LO && k !== KHOA_DO_BANG_HOA_HONG)
      .map((key) => ({
        key,
        // `resolved` trả giá trị đã hoà (cơ sở → toàn hệ → mặc định). Thiếu thì lấy mặc định
        // của registry — KHÔNG để `undefined` lọt vào ô nhập, vì ô rỗng trông hệt như "giá trị
        // là chuỗi rỗng" và người dùng sẽ bấm lưu đè lên một con số đang chạy.
        value: resolved[key] ?? SETTINGS[key].default,
        nhan: nhanCuaKey(key),
      })),
  }));

  // ── Dữ liệu riêng của tab thông báo ────────────────────────────────────────────────────
  const danhMucThongBao = catalogEntries();
  const thoDangBat = resolved[KHOA_DO_BANG_CONG_TAC_LO];
  const loaiDangBat = Array.isArray(thoDangBat)
    ? thoDangBat.filter((x): x is string => typeof x === "string")
    : [];

  const canhBaoKenh: CanhBaoKenh[] = [];
  if (resolved["push.webPushEnabled"] !== true) {
    canhBaoKenh.push({
      cau: "Thông báo trên điện thoại đang TẮT",
      choSua: "Bật bằng công tắc ở ngay đầu tab này.",
    });
  }
  const { loi: loiVapid } = kiemVapid();
  if (loiVapid) {
    canhBaoKenh.push({
      cau: `Hệ thống chưa gửi được thông báo: ${MO_TA_LOI_VAPID[loiVapid]}`,
      choSua: "Việc này cần bên kỹ thuật sửa trên máy chủ, không sửa được ở đây.",
    });
  }
  // Khoá lạ còn sót trong cấu hình — bảng công tắc chỉ bày loại CÓ THẬT nên không ai bỏ chọn
  // được nó. Im lặng thì nó nằm đó mãi và số đếm trên màn hình lệch với số trong dữ liệu.
  const hopLe = new Set(danhMucThongBao.map((e) => e.prefix));
  const khoaLa = loaiDangBat.filter((t) => !hopLe.has(t));
  if (khoaLa.length > 0) {
    canhBaoKenh.push({
      cau: `Còn ${khoaLa.length} mục không còn tồn tại trong danh sách loại thông báo`,
      choSua: "Bấm Lưu một lần ở bảng dưới là dọn xong.",
    });
  }

  return (
    // CĂN GIỮA + trần theo bậc màn. Bản đầu để `max-w-4xl` không `mx-auto`, và đo thật trên
    // Chromium cho thấy khối nội dung dính mép trái, bỏ trống 2688px ở 4K và 6528px ở 8K —
    // trang thành một dải hẹp lệch hẳn về một bên.
    //
    // Trần nới theo bậc chứ không thả tự do: một hàng cấu hình kéo dài 3000px thì nhãn nằm
    // tận mép trái còn ô nhập tận mép phải, mắt phải quét cả màn hình cho MỘT dòng. 1180px ở
    // laptop, 1360px từ 2K trở lên — đủ để 11 tab nằm gọn một hàng mà vẫn giữ được khoảng
    // quét mắt hợp lý.
    <div className="mx-auto w-full max-w-[1180px] space-y-5 2xl:max-w-[1360px]">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cấu hình vận hành</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Các thiết lập dùng chung cho cả hệ thống
        </p>
      </div>

      <PageHelp>
        <p>
          Mỗi tab là một nhóm việc. Đổi xong bấm <strong>Lưu</strong> ngay dòng đó — thay đổi
          có hiệu lực luôn, không cần chờ ai cài đặt lại gì.
        </p>
        <p className="mt-2">
          Mỗi lần lưu đều phải ghi <strong>lý do</strong> và được lưu vào nhật ký kiểm toán,
          nên về sau luôn tra được ai đổi cái gì và vì sao. Dòng có dấu tam giác vàng là dòng
          đổi sai sẽ ảnh hưởng rộng hoặc phát sinh chi phí — đọc kỹ phần giải thích trước khi
          sửa.
        </p>
        <p className="mt-2">
          Các thiết lập ở đây áp cho <strong>toàn hệ thống</strong>, không tách riêng theo từng
          cơ sở.
        </p>
      </PageHelp>

      {!canEditGlobal && (
        <div className="rounded-lg border border-state-warning-soft bg-state-warning-soft px-4 py-3 text-sm text-state-warning-ink">
          Bạn chỉ có quyền <strong>xem</strong>. Việc thay đổi dành cho quản trị cấp cao nhất.
        </div>
      )}

      <KhungCauHinh
        tabs={tabs}
        choSua={canEditGlobal}
        tabThongBao={TAB_THONG_BAO}
        danhMucThongBao={danhMucThongBao}
        loaiDangBat={loaiDangBat}
        canhBaoKenh={canhBaoKenh}
        tabBanDau={sp.tab}
        noiDungRieng={{
          "phuong-thuc-tt": (
            <TabPhuongThucThanhToan centerIdFilter={sp.centerId?.trim() || null} />
          ),
          "hoa-hong": (
            <BangChinhSachHoaHong
              banDau={(resolved[KHOA_DO_BANG_HOA_HONG] ??
                SETTINGS[KHOA_DO_BANG_HOA_HONG].default) as ChinhSachHoaHong[]}
              tranTongTiLe={
                typeof resolved["crm.commissionMaxTotalRate"] === "number"
                  ? (resolved["crm.commissionMaxTotalRate"] as number)
                  : (SETTINGS["crm.commissionMaxTotalRate"].default as number)
              }
              vai={vai}
              suaDuoc={canEditGlobal}
            />
          ),
        }}
      />
    </div>
  );
}
