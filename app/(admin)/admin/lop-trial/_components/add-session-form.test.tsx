/**
 * Khối "Thêm buổi học" — ô Giáo viên sau chốt 17/09/2026.
 *
 * ── BỘ NÀY CANH GÌ ───────────────────────────────────────────────────────────────────
 * Đúng MỘT lớp lỗi, và nó là lớp lỗi KHÔNG cổng nào khác trong repo bắt được: một
 * `<select>` bị lọc còn ít (hoặc còn 0) dòng mà **không nói vì sao**. Nó không ném lỗi,
 * không làm đỏ test nào, console vẫn sạch — chỉ người dùng bấm vào mới biết, và thứ họ
 * kết luận là "hệ thống hỏng" rồi đi nhập tay chỗ khác (luật 12: affordance nói dối).
 *
 * Kèm theo: hai cái nhãn ` · TRÙNG LỊCH` / ` · CA LINH ĐỘNG` và khối cảnh báo đỏ cũng là
 * LỜI HỨA — hứa suông được y như trên.
 *
 * ── CẤY LẠI LỖI (luật 15) — đã làm THẬT, đây là kết quả ĐO chứ không phải dự đoán ────
 *   · bỏ khối `{lyDoRong !== null && …}` trong `chon-gv-buoi.tsx` → **3 ĐỎ / 9**
 *     (ca "không GV nào có ca" · ca "server trả lỗi" · ca "xoá ngày").
 *   · đổi `hauToGv` trả `""` cho `muc === "DO"` → **1 ĐỎ / 9** (ca nhãn TRÙNG LỊCH).
 *   · bỏ `aria-invalid={doTrung}` trên `<select>` → **1 ĐỎ / 9** (cùng ca đó).
 *   · bỏ vế `if (!date || !startTime || !endTime)` trong `useGvChoBuoi.tai` →
 *     **1 ĐỎ / 9**, và nó đỏ ở ca "xoá ngày" chứ KHÔNG phải ca "chưa chọn ngày".
 *     Ghi ra vì chỗ này dễ đoán sai: lúc dựng component `tai` chưa hề được gọi (ngày
 *     rỗng là trạng thái ban đầu, không phải một lượt đổi), nên ca đầu tiên xanh vì
 *     một lý do khác với lý do người viết tưởng. Đường duy nhất chạm được vế đó là
 *     XOÁ ngày sau khi đã chọn.
 *
 * Ngày trong bộ này là hằng TUYỆT ĐỐI, không hàm nào đọc đồng hồ thật (luật 19).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DongGv } from "@/lib/trial/gv-kha-dung";
import type { CheDoChonGv } from "../_lib/che-do-gv";

/** Mốc cố định — đổi tờ lịch không được làm bộ này đỏ. */
const NGAY = "2026-09-19";

type KetQua =
  | { ok: true; ds: DongGv[]; lyDoRong: string | null }
  | { ok: false; error: string };

const h = vi.hoisted(() => ({
  // Khai kiểu tham số tại đây thay vì `vi.fn()` trần: không có nó thì `mock.calls[0]`
  // mang kiểu tuple rỗng và mọi khẳng định về đối số phải ép kiểu — tức tự bịt mắt đúng
  // chỗ cần nhìn nhất (đối số `excludeSessionId` là thứ dễ quên nhất).
  layGv: vi.fn(
    async (_input: {
      trialClassId: string;
      date: string;
      startTime: string;
      endTime: string;
      excludeSessionId?: string | null;
      hienTatCa: boolean;
    }): Promise<unknown> => ({ ok: true, ds: [], lyDoRong: null }),
  ),
  themBuoi: vi.fn(async (_input: unknown) => ({ ok: true as const })),
  loi: vi.fn((_x: string) => undefined),
  thanhCong: vi.fn((_x: string) => undefined),
  refresh: vi.fn(),
}));

vi.mock("../_actions", () => ({
  layGvChoBuoiAction: h.layGv,
  addLopTrialSessionAction: h.themBuoi,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: h.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { success: h.thanhCong, error: h.loi },
}));

import { AddSessionForm } from "./add-session-form";

const GIAO_VIEN = [
  { id: "gv-kiet", name: "Nguyễn Tuấn Kiệt" },
  { id: "gv-toai", name: "Trần Văn Toại" },
  { id: "gv-lan", name: "Lê Thị Lan" },
];

/** Một dòng đã lọc, mặc định "bình thường". */
function dong(p: Partial<DongGv> & { id: string; name: string }): DongGv {
  return { phu: "PHU_TRON", muc: "KHONG", nhan: "", ...p };
}

function dung(over: { cheDoChonGv?: CheDoChonGv; locGvTheoCa?: boolean } = {}) {
  return render(
    <AddSessionForm
      trialClassId="lop-1"
      teachers={GIAO_VIEN}
      rooms={[]}
      defaultStartTime="18:00"
      defaultEndTime="19:30"
      cheDoChonGv={over.cheDoChonGv ?? "LOC_THEO_CA"}
      locGvTheoCa={over.locGvTheoCa ?? true}
      soGvMienLoc={2}
    />,
  );
}

function oGiaoVien(): HTMLSelectElement {
  return screen.getByLabelText("Giáo viên") as HTMLSelectElement;
}

/** Công tắc "Hiện tất cả giáo viên" — `null` khi nó KHÔNG được vẽ. */
function congTac(): HTMLInputElement | null {
  return screen.queryByLabelText(/Hiện tất cả giáo viên/) as HTMLInputElement | null;
}

/** Nhãn của mọi `<option>` trong ô Giáo viên, bỏ dòng "— chưa xếp —". */
function cacLuaChon(): string[] {
  return [...oGiaoVien().options]
    .map((o) => o.textContent ?? "")
    .filter((t) => !t.startsWith("—"));
}

/**
 * Chọn ngày ⇒ đủ cả ba ô (giờ đã điền sẵn) ⇒ form hỏi server.
 *
 * Phải CHỜ lượt gọi đi qua `useTransition` rồi mới khẳng định, nếu không mọi ca đều đọc
 * trạng thái TRƯỚC khi server trả lời và sẽ xanh vì lý do sai.
 */
async function chonNgay(ngay = NGAY) {
  fireEvent.change(screen.getByLabelText("Ngày *"), { target: { value: ngay } });
  await waitFor(() => expect(h.layGv).toHaveBeenCalledTimes(1));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.layGv.mockResolvedValue({ ok: true, ds: [], lyDoRong: null } satisfies KetQua);
});

describe("AddSessionForm — ô Giáo viên lọc theo ca", () => {
  it("chưa chọn ngày thì KHÔNG hỏi server, và hiện ĐỦ danh sách giáo viên", () => {
    dung();
    expect(h.layGv).not.toHaveBeenCalled();
    expect(cacLuaChon()).toEqual([
      "Nguyễn Tuấn Kiệt",
      "Trần Văn Toại",
      "Lê Thị Lan",
    ]);
  });

  it("KHÔNG giáo viên nào có ca ⇒ ô chọn KHÔNG im lặng, lý do hiện thành CHỮ", async () => {
    // Đây là ca của đề bài. Hình dạng dữ liệu lấy đúng hợp đồng `locGiaoVienChoBuoi`:
    // lọc còn 0 người thì nó trả ĐỦ danh sách kèm `lyDoRong`, chứ không trả mảng rỗng.
    h.layGv.mockResolvedValue({
      ok: true,
      ds: GIAO_VIEN.map((g) =>
        dong({ ...g, phu: "KHONG_CO_CA", nhan: "chưa xếp ca ngày này" }),
      ),
      lyDoRong: `Không giáo viên nào có ca phủ trọn 18:00–19:30 ngày ${NGAY} — đang hiện tất cả để bạn tự chọn.`,
    } satisfies KetQua);

    dung();
    await chonNgay();

    const ly = await screen.findByText(/Không giáo viên nào có ca phủ trọn/);
    expect(ly.getAttribute("aria-live")).toBe("polite");
    expect(h.layGv).toHaveBeenCalledWith({
      trialClassId: "lop-1",
      date: NGAY,
      startTime: "18:00",
      endTime: "19:30",
      // Thêm buổi MỚI ⇒ không có buổi nào để loại khỏi phép so trùng.
      excludeSessionId: null,
      // Công tắc "Hiện tất cả" mặc định TẮT — lượt hỏi đầu tiên phải ĐANG LỌC.
      hienTatCa: false,
    });
  });

  it("danh sách lọc còn RỖNG THẬT vẫn phải có chữ — không có `<select>` trống câm", async () => {
    // Hợp đồng hứa không bao giờ trả rỗng-câm; đây là chỗ câu hứa đó được KIỂM chứ không
    // phải chỗ nó được tin. Một bản vá sai ở tầng dưới không được biến màn hình thành câm.
    h.layGv.mockResolvedValue({ ok: true, ds: [], lyDoRong: null } satisfies KetQua);
    dung();
    await chonNgay();

    expect(
      await screen.findByText("Không có giáo viên nào để chọn cho khung giờ này."),
    ).toBeTruthy();
    expect(cacLuaChon()).toEqual([]);
  });

  it("server trả lỗi ⇒ nói ra lỗi, KHÔNG lặng lẽ quay về danh sách đầy đủ", async () => {
    h.layGv.mockResolvedValue({
      ok: false,
      error: "Không có quyền xếp giáo viên cho buổi trải nghiệm",
    } satisfies KetQua);
    dung();
    await chonNgay();

    expect(
      await screen.findByText("Không có quyền xếp giáo viên cho buổi trải nghiệm"),
    ).toBeTruthy();
  });

  it("trùng lịch ⇒ nhãn · TRÙNG LỊCH, khối role=alert, và aria-invalid trên ô chọn", async () => {
    h.layGv.mockResolvedValue({
      ok: true,
      ds: [
        dong({
          id: "gv-kiet",
          name: "Nguyễn Tuấn Kiệt",
          muc: "DO",
          nhan: "TRÙNG LỊCH: buổi lớp chính 18:00–19:30",
        }),
        dong({ id: "gv-lan", name: "Lê Thị Lan" }),
      ],
      lyDoRong: null,
    } satisfies KetQua);

    dung();
    await chonNgay();
    await screen.findByText(/Nguyễn Tuấn Kiệt · TRÙNG LỊCH/);

    const o = oGiaoVien();
    // Chưa chọn ai ⇒ chưa được báo động: nhãn trong danh sách là đủ.
    expect(o.getAttribute("aria-invalid")).toBe("false");
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.change(o, { target: { value: "gv-kiet" } });
    expect(oGiaoVien().getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toContain(
      "TRÙNG LỊCH: buổi lớp chính 18:00–19:30",
    );

    // Đổi sang người không trùng ⇒ báo động phải TẮT. Cảnh báo dính lại là một lời nói
    // dối theo chiều ngược, và nó dạy người dùng bỏ qua màu đỏ.
    fireEvent.change(oGiaoVien(), { target: { value: "gv-lan" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(oGiaoVien().getAttribute("aria-invalid")).toBe("false");
  });

  it("ca không mang giờ (LD/D1/D2) ⇒ nhãn · CA LINH ĐỘNG, KHÔNG phải trùng lịch", async () => {
    h.layGv.mockResolvedValue({
      ok: true,
      ds: [
        dong({
          id: "gv-toai",
          name: "Trần Văn Toại",
          phu: "KHONG_GIO",
          muc: "CANH",
          nhan: "ca linh động — không rõ giờ",
        }),
      ],
      lyDoRong: null,
    } satisfies KetQua);

    dung();
    await chonNgay();
    await screen.findByText("Trần Văn Toại · CA LINH ĐỘNG");

    fireEvent.change(oGiaoVien(), { target: { value: "gv-toai" } });
    // CANH không phải DO ⇒ không được dựng khối đỏ.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("người đang chọn bị lọc mất vẫn còn trong ô — `<select>` không được tự đổi người", async () => {
    // Mất dữ liệu CÂM: `<select>` có `value` không khớp option nào sẽ nhảy về dòng đầu,
    // và lượt Lưu kế tiếp ghi đè một giáo viên người dùng chưa từng chọn.
    h.layGv.mockResolvedValue({
      ok: true,
      ds: [dong({ id: "gv-lan", name: "Lê Thị Lan" })],
      lyDoRong: null,
    } satisfies KetQua);

    dung();
    // Chọn người TRƯỚC khi có ngày (lúc đó danh sách còn đầy đủ).
    fireEvent.change(oGiaoVien(), { target: { value: "gv-kiet" } });
    await chonNgay();

    await screen.findByText(/Nguyễn Tuấn Kiệt · NGOÀI DANH SÁCH LỌC/);
    expect(oGiaoVien().value).toBe("gv-kiet");
  });

  it("xoá ngày ⇒ quay về 'chưa biết': đủ danh sách, hết lý do", async () => {
    h.layGv.mockResolvedValue({
      ok: true,
      ds: [dong({ id: "gv-lan", name: "Lê Thị Lan" })],
      lyDoRong: "Chưa sinh lưới ca tháng này nên chưa lọc được theo ca.",
    } satisfies KetQua);

    dung();
    await chonNgay();
    await screen.findByText(/Chưa sinh lưới ca tháng này/);

    fireEvent.change(screen.getByLabelText("Ngày *"), { target: { value: "" } });
    expect(screen.queryByText(/Chưa sinh lưới ca tháng này/)).toBeNull();
    expect(cacLuaChon()).toEqual([
      "Nguyễn Tuấn Kiệt",
      "Trần Văn Toại",
      "Lê Thị Lan",
    ]);
  });

  it("action NÉM (không phải trả {ok:false}) ⇒ vẫn phải hiện CHỮ, không đứng im", async () => {
    // Ca này KHÁC ca "server trả lỗi" ở trên, và khác ở đúng chỗ nguy hiểm: ở đó action
    // trả `{ ok: false, error }` — một đường đi bình thường. Ở đây promise bị TỪ CHỐI, nên
    // nhánh `!res.ok` không bao giờ chạy. Không bắt thì đây là unhandled rejection bên
    // trong `startTransition`: `dangTai` tắt, danh sách giữ nguyên bản CŨ, console của
    // người dùng sạch, và màn hình trông y hệt lúc chạy đúng (luật 12).
    //
    // Cách xảy ra thật: mạng rớt giữa chừng · lỗi 500 · Vercel đang đổi bản nên id của
    // Server Action không còn khớp. Không ca nào trong số đó là hiếm.
    h.layGv.mockResolvedValue({
      ok: true,
      ds: [dong({ id: "gv-lan", name: "Lê Thị Lan" })],
      lyDoRong: null,
    } satisfies KetQua);
    dung();
    await chonNgay();
    expect(cacLuaChon()).toEqual(["Lê Thị Lan"]);

    // Lượt thứ hai NÉM.
    h.layGv.mockRejectedValueOnce(new Error("Failed to fetch"));
    fireEvent.change(screen.getByLabelText("Giờ kết thúc"), { target: { value: "20:00" } });

    expect(
      await screen.findByText(/Không lọc được giáo viên theo ca lúc này/),
    ).toBeTruthy();
    // Và câu chữ phải nói ĐÚNG thứ đang hiện: về `ds = null` là danh sách ĐẦY ĐỦ trở lại,
    // nên "đang hiện tất cả" là sự thật kiểm được, không phải câu an ủi.
    expect(cacLuaChon()).toEqual([
      "Nguyễn Tuấn Kiệt",
      "Trần Văn Toại",
      "Lê Thị Lan",
    ]);
  });

  it("nói rõ luật đang chạy, và nói rõ KHÔNG tính ca chấm công", () => {
    // Câu này là thứ duy nhất ngăn người dùng tin nhầm rằng note đỏ đã phủ hết lịch.
    dung();
    const cau = screen.getByText(/Note đỏ đối chiếu buổi/);
    expect(cau.textContent).toContain("ca phủ TRỌN khung giờ buổi");
    expect(cau.textContent).toContain("không");
    expect(cau.textContent).toContain("bảng chấm công");
    expect(cau.textContent).toContain("2 giáo viên được khai luôn hiện");
  });

  // ── VÁ (A) — giáo viên chưa vào lưới ca phải HIỆN, và phải hiện KÈM NHÃN ──────────
  it("GV chưa vào lưới ca ⇒ nhãn · CHƯA VÀO LƯỚI CA, KHÔNG phải trùng lịch", async () => {
    // Hiện ra mà không dán nhãn thì họ nằm lẫn với người ĐÃ được kiểm và thấy rảnh —
    // hai thứ rất khác nhau đứng cạnh nhau không lời giải thích nào.
    h.layGv.mockResolvedValue({
      ok: true,
      ds: [
        dong({
          id: "gv-lan",
          name: "Lê Thị Lan",
          phu: "CHUA_VAO_LUOI",
          muc: "CANH",
          nhan: "chưa thấy ô ca nào trong lưới tháng này",
        }),
      ],
      lyDoRong: null,
    } satisfies KetQua);

    dung();
    await chonNgay();
    await screen.findByText("Lê Thị Lan · CHƯA VÀO LƯỚI CA");

    fireEvent.change(oGiaoVien(), { target: { value: "gv-lan" } });
    // CANH không phải DO ⇒ không được dựng khối đỏ.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(oGiaoVien().getAttribute("aria-invalid")).toBe("false");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════
// VÁ (B) — CÔNG TẮC "HIỆN TẤT CẢ GIÁO VIÊN"
//
// Lớp lỗi được canh ở đây: một công tắc TRÔNG NHƯ có tác dụng. Nó không ném khi bấm
// hụt, không đỏ test nào, console sạch — người dùng bấm, danh sách y nguyên, và họ học
// được rằng công tắc ở màn này vô nghĩa (luật 12, chiều "hứa có tác dụng").
//
// Hai hướng hỏng phải canh RIÊNG, vì chúng khác nhau:
//   · vẽ công tắc ở nơi KHÔNG có gì để tắt (tầng Đào tạo / cờ lọc đang tắt);
//   · bấm mà server không hề nhận cờ — đây là hướng dễ dính nhất, vì `setState` chưa
//     phản ánh trong cùng lượt xử lý sự kiện nên đọc state thay vì ref là gửi giá trị CŨ.
// ═══════════════════════════════════════════════════════════════════════════════════

describe("Công tắc 'Hiện tất cả giáo viên'", () => {
  it("có mặt ở tầng LOC_THEO_CA, mặc định TẮT, và nói rõ đang lọc", () => {
    dung();
    const o = congTac();
    expect(o).not.toBeNull();
    expect(o!.checked).toBe(false);
    expect(screen.getByText("· đang lọc theo ca")).toBeTruthy();
  });

  it("KHÔNG vẽ ở tầng TAT_CA và khi cờ lọc đang tắt — không dựng nút vô nghĩa", () => {
    const a = render(
      <AddSessionForm
        trialClassId="lop-1"
        teachers={GIAO_VIEN}
        rooms={[]}
        defaultStartTime="18:00"
        defaultEndTime="19:30"
        cheDoChonGv="TAT_CA"
        locGvTheoCa
        soGvMienLoc={0}
      />,
    );
    expect(congTac()).toBeNull();
    a.unmount();

    dung({ locGvTheoCa: false });
    expect(congTac()).toBeNull();
  });

  // ⭐ CA KHOÁ: cờ phải THẬT SỰ tới server, ngay lượt bấm ĐẦU TIÊN.
  it("bấm BẬT ⇒ hỏi lại server với hienTatCa=true, đúng khung giờ đang chọn", async () => {
    dung();
    await chonNgay();
    expect(h.layGv).toHaveBeenCalledTimes(1);

    fireEvent.click(congTac()!);
    await waitFor(() => expect(h.layGv).toHaveBeenCalledTimes(2));
    expect(h.layGv.mock.calls[1][0]).toEqual({
      trialClassId: "lop-1",
      date: NGAY,
      startTime: "18:00",
      endTime: "19:30",
      excludeSessionId: null,
      hienTatCa: true,
    });
  });

  it("bấm TẮT lại ⇒ hỏi lại với hienTatCa=false (quay về đang lọc)", async () => {
    dung();
    await chonNgay();
    fireEvent.click(congTac()!);
    await waitFor(() => expect(h.layGv).toHaveBeenCalledTimes(2));

    fireEvent.click(congTac()!);
    await waitFor(() => expect(h.layGv).toHaveBeenCalledTimes(3));
    expect(h.layGv.mock.calls[2][0].hienTatCa).toBe(false);
    expect(congTac()!.checked).toBe(false);
  });

  it("BẬT rồi đổi giờ ⇒ lượt hỏi kế tiếp GIỮ cờ, không lặng lẽ bật lại bộ lọc", async () => {
    // Cờ nằm ở ref của hook chứ không ở tham số của `tai`, nên đây là chỗ nó dễ rơi mất:
    // rơi mất thì bộ lọc tự bật lại giữa chừng và danh sách co lại mà người dùng không
    // hề bấm gì — công tắc trông như "tự tắt".
    dung();
    await chonNgay();
    fireEvent.click(congTac()!);
    await waitFor(() => expect(h.layGv).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByLabelText("Giờ kết thúc"), { target: { value: "20:00" } });
    await waitFor(() => expect(h.layGv).toHaveBeenCalledTimes(3));
    expect(h.layGv.mock.calls[2][0]).toMatchObject({ endTime: "20:00", hienTatCa: true });
    expect(congTac()!.checked).toBe(true);
  });

  it("BẬT ⇒ câu giải thích luật phải ĐỔI, không được còn hứa 'chỉ hiện GV có ca phủ TRỌN'", async () => {
    // Câu mô tả luật mà không đổi theo luật là lời hứa suông ngay giữa màn hình: không
    // ném, không đỏ, console sạch — chỉ sai.
    dung();
    expect(screen.getByText(/Note đỏ đối chiếu buổi/).textContent).toContain(
      "ca phủ TRỌN khung giờ buổi",
    );

    fireEvent.click(congTac()!);
    await waitFor(() => expect(congTac()!.checked).toBe(true));
    const cau = screen.getByText(/Note đỏ đối chiếu buổi/).textContent ?? "";
    expect(cau).toContain("HIỆN TẤT CẢ");
    expect(cau).not.toContain("ca phủ TRỌN khung giờ buổi");
    expect(screen.getByText("· đang BỎ lọc theo ca")).toBeTruthy();
  });

  it("BẬT vẫn giữ note ĐỎ trùng lịch — đó là thứ KHÔNG được tắt cùng bộ lọc", async () => {
    h.layGv.mockResolvedValue({
      ok: true,
      ds: [
        dong({
          id: "gv-kiet",
          name: "Nguyễn Tuấn Kiệt",
          phu: "NGHI",
          muc: "DO",
          nhan: "TRÙNG LỊCH: buổi lớp chính 18:00–19:30",
        }),
      ],
      lyDoRong: "Đang HIỆN TẤT CẢ giáo viên — luật ca tạm bỏ cho lượt chọn này.",
    } satisfies KetQua);

    dung();
    await chonNgay();
    fireEvent.click(congTac()!);
    await screen.findByText(/Nguyễn Tuấn Kiệt · TRÙNG LỊCH/);

    fireEvent.change(oGiaoVien(), { target: { value: "gv-kiet" } });
    expect(screen.getByRole("alert").textContent).toContain("TRÙNG LỊCH");
    expect(oGiaoVien().getAttribute("aria-invalid")).toBe("true");
    // `findAllByText` chứ không `findByText`: câu "đang hiện tất cả" xuất hiện ở HAI chỗ
    // cố ý — `lyDoRong` (khối `aria-live`, do server trả) và câu mô tả luật ở dưới. Khối
    // phải kiểm là khối `aria-live`, vì đó là thứ người dùng trình đọc màn hình nghe được.
    const noi = await screen.findAllByText(/Đang HIỆN TẤT CẢ giáo viên/);
    expect(noi.some((p) => p.getAttribute("aria-live") === "polite")).toBe(true);
  });

  it("chưa chọn ngày mà bấm công tắc ⇒ KHÔNG gọi server (chưa đủ ba ô thì không có gì để hỏi)", () => {
    dung();
    fireEvent.click(congTac()!);
    expect(h.layGv).not.toHaveBeenCalled();
    // Nhưng trạng thái công tắc vẫn phải ghi nhận, nếu không nó "tự bật lại" khi người
    // dùng chọn ngày sau đó.
    expect(congTac()!.checked).toBe(true);
  });

  it("bấm TRƯỚC rồi chọn ngày SAU ⇒ lượt hỏi đầu tiên đã mang cờ", async () => {
    dung();
    fireEvent.click(congTac()!);
    await chonNgay();
    expect(h.layGv.mock.calls[0][0].hienTatCa).toBe(true);
  });
});
