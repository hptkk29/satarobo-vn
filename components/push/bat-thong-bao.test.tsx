/**
 * `<BatThongBao/>` — dây nối nửa CLIENT của Web Push. Bộ này ra đời ở Đợt 5 vì lăng kính chỉ ra
 * component này **chưa có một tệp test nào**, trong khi nó giữ đúng ba thứ mà Đợt 5 vừa đổi:
 *
 *  1. So "máy này" bằng **BĂM** chứ không bằng endpoint (server thôi gửi endpoint xuống HTML).
 *     Cấy lỗi `const bam = ep` (so endpoint trần với băm) thì `daDangKy` vĩnh viễn `false` và
 *     không bao giờ có nhãn "máy này" ⇒ người dùng bấm "Bật thông báo" lại, và mỗi cú bấm đẻ
 *     một dòng `ACTIVE` mồ côi. `client-key.test.ts` KHÔNG bắt được — nó chỉ khoá hai hàm, không
 *     khoá chỗ GỌI.
 *  2. Nhãn cắt (`nhan`) hiện ra giao diện — nó là thứ duy nhất phân biệt hai trình duyệt trông
 *     giống hệt nhau qua `tenMay` (vd hai máy Chrome/Windows).
 *  3. Không rò endpoint đầy đủ ra DOM.
 *
 * Chỉ kiểm nhánh ĐỌC (dựng khung + đánh dấu). Nhánh bấm nút đi qua `Notification.requestPermission`
 * + `pushManager.subscribe` — hợp đồng của chúng đã được `ui-state.test.ts` (thứ tự quyết định) và
 * `_push-actions.test.ts` (đường ghi) khoá riêng.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(admin)/admin/settings/_push-actions", () => ({
  dangKyThietBiAction: vi.fn(async () => ({ ok: true })),
  huyThietBiAction: vi.fn(async () => ({ ok: true })),
  huyThietBiTheoEndpointAction: vi.fn(async () => ({ ok: true, soDong: 1 })),
}));

import { BatThongBao, type ThietBiView } from "./bat-thong-bao";
import { bamEndpoint } from "@/lib/push/ket-qua";
import { nhanEndpoint } from "@/lib/push/ket-qua";

const EP_MAY_NAY = "https://fcm.googleapis.com/wp/dien-thoai-dang-cam-XyZ987";
const EP_MAY_KHAC = "https://updates.push.services.mozilla.com/wp/may-ban-o-co-so";

function thietBi(endpoint: string, ghiDe: Partial<ThietBiView> = {}): ThietBiView {
  return {
    id: `sub_${endpoint.slice(-4)}`,
    bam: bamEndpoint(endpoint),
    nhan: nhanEndpoint(endpoint),
    deviceLabel: null,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari",
    origin: "https://admin.satarobo.vn",
    displayMode: "standalone",
    lastSuccessAt: null,
    createdAt: "2026-09-01T08:00:00.000Z",
    ...ghiDe,
  };
}

/** Dựng môi trường trình duyệt ĐỦ để component đi hết `doBoiCanh()`. */
function dungTrinhDuyet(opts: { endpointHienTai?: string | null } = {}) {
  const { endpointHienTai = EP_MAY_NAY } = opts;
  const sub = endpointHienTai
    ? { endpoint: endpointHienTai, unsubscribe: vi.fn(async () => true) }
    : null;
  Object.defineProperty(window, "navigator", {
    value: {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari",
      maxTouchPoints: 5,
      serviceWorker: {
        getRegistration: vi.fn(async () => ({
          pushManager: { getSubscription: vi.fn(async () => sub) },
        })),
        register: vi.fn(async () => ({})),
        ready: Promise.resolve({}),
      },
    },
    configurable: true,
    writable: true,
  });
  // `PushManager` phải tồn tại trên `window`, nếu không component đi nhánh "không hỗ trợ".
  Object.defineProperty(window, "PushManager", { value: function () {}, configurable: true });
  Object.defineProperty(window, "Notification", {
    value: Object.assign(function () {}, { permission: "granted" }),
    configurable: true,
    writable: true,
  });
  window.matchMedia = ((q: string) =>
    ({ matches: q.includes("standalone"), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);
}

beforeEach(() => {
  vi.unstubAllEnvs();
  // Khoá công khai phải hợp lệ, không thì component đi nhánh "chưa cấu hình khoá".
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "x");
  dungTrinhDuyet();
});

describe("[PUSH-D5-T15] đánh dấu 'máy này' bằng BĂM, không bằng endpoint", () => {
  it("máy đang cầm được gắn nhãn 'máy này'; máy khác thì không", async () => {
    render(<BatThongBao thietBi={[thietBi(EP_MAY_NAY), thietBi(EP_MAY_KHAC)]} />);
    // Băm chạy qua `crypto.subtle` (async) nên nhãn xuất hiện sau một nhịp.
    expect(await screen.findByText("máy này")).toBeTruthy();
    expect(screen.getAllByText("máy này")).toHaveLength(1);
  });

  it("trình duyệt CHƯA có đăng ký ⇒ không máy nào được gắn nhãn", async () => {
    dungTrinhDuyet({ endpointHienTai: null });
    render(<BatThongBao thietBi={[thietBi(EP_MAY_NAY)]} />);
    // Chờ đúng mốc hiệu ứng đã chạy xong: tiêu đề đổi sang trạng thái "chưa bật". Không chờ thì
    // `queryByText` dưới đây xanh một cách vô nghĩa (nhãn chưa kịp vẽ).
    expect(await screen.findByText("Bật thông báo trên máy này")).toBeTruthy();
    expect(screen.queryByText("máy này")).toBeNull();
  });

  it("băm của máy đang cầm KHÔNG khớp dòng nào ⇒ coi như CHƯA đăng ký", async () => {
    // Fail sang "chưa đăng ký" là đúng chiều: mời bật lại một lần là vô hại, còn báo "đang
    // nhận" khi không chắc là nói sai với người dùng.
    render(<BatThongBao thietBi={[thietBi(EP_MAY_KHAC)]} />);
    expect(await screen.findByText(/Bật thông báo trên máy này/)).toBeTruthy();
    expect(screen.queryByText("máy này")).toBeNull();
  });
});

describe("[PUSH-D5-T16] không rò endpoint ra DOM, và nhãn cắt PHẢI hiện", () => {
  it("DOM không chứa endpoint đầy đủ của bất kỳ máy nào", async () => {
    const { container } = render(
      <BatThongBao thietBi={[thietBi(EP_MAY_NAY), thietBi(EP_MAY_KHAC)]} />,
    );
    await screen.findByText("máy này");
    expect(container.innerHTML).not.toContain(EP_MAY_NAY);
    expect(container.innerHTML).not.toContain(EP_MAY_KHAC);
    expect(container.innerHTML).not.toContain("dien-thoai-dang-cam");
  });

  it("nhãn cắt của TỪNG máy hiện ra — thứ duy nhất phân biệt hai máy trông giống nhau", async () => {
    // Hai dòng cùng `userAgent` và cùng origin ⇒ `tenMay()` ra cùng một chuỗi. Không có nhãn
    // cắt thì người dùng không biết bấm "Gỡ" đúng máy nào.
    render(<BatThongBao thietBi={[thietBi(EP_MAY_NAY), thietBi(EP_MAY_KHAC)]} />);
    await screen.findByText("máy này");
    expect(screen.getByText(nhanEndpoint(EP_MAY_NAY))).toBeTruthy();
    expect(screen.getByText(nhanEndpoint(EP_MAY_KHAC))).toBeTruthy();
  });
});
