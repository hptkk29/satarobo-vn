/**
 * KHUNG NHẬP EXCEL — màn PHÂN LOẠI ba nhóm + sửa tay từng dòng.
 *
 * ── BỘ NÀY CANH GÌ ───────────────────────────────────────────────────────────────────────
 * Không canh "có render ra chữ không". Canh bốn lời hứa mà màn này đưa ra, cả bốn đều hứa
 * suông được mà không ném lỗi, không làm đỏ test, console vẫn sạch (luật 12):
 *
 *  1. Con số trên ba nhóm ĐẾM ĐÚNG, và ba nhóm ấy PHỦ HẾT mọi dòng — không dòng nào rơi ra
 *     ngoài cả ba. Một dòng vô hình là một lead mất không ai biết.
 *  2. Nút Nhập đếm đúng số dòng THỰC SỰ được ghi, không phải số dòng đang nhìn thấy.
 *  3. Nút Sửa sửa được thật: dòng lỗi chữa xong phải TỰ CHUYỂN sang nhóm hợp lệ.
 *  4. Dòng trùng nói rõ hệ thống sắp làm gì với bản ghi cũ.
 *
 * ⚠️ Khung này dùng chung cho MƯỜI màn nhập, nên mọi ca ở đây phải đúng cho cả màn KHÔNG có
 * khái niệm trùng — có ca riêng canh việc đó.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ExcelImporter, ImportOutcome } from "./ExcelImporter";

afterEach(cleanup);

const COT = [
  { key: "Tên", label: "Tên", required: true },
  { key: "SĐT", label: "SĐT", required: true },
];

type Dong = Record<string, unknown>;

/**
 * Dựng khung với một tập dòng cho sẵn.
 *
 * `parseRow` coi dòng thiếu SĐT là lỗi — đủ để dựng ba nhóm mà không kéo theo tầng phân tích
 * thật của một màn cụ thể.
 */
function dung(opts: {
  dong: Dong[];
  coTrung?: boolean;
  gopTrung?: boolean;
  xacNhanTrung?: boolean;
  onImport?: (rows: unknown[]) => Promise<{ success: number; errors: [] }>;
}) {
  const onImport =
    opts.onImport ?? (async () => ({ success: 0, errors: [] as [] }));
  return render(
    <ExcelImporter<Dong>
      templateUrl="/mau"
      templateFilename="mau.xlsx"
      columnHints={COT}
      parseRow={(r) => (r["SĐT"] ? (r as Dong) : { error: "Thiếu SĐT" })}
      onImport={onImport}
      duplicateKey={opts.coTrung ? (r) => String(r["SĐT"] ?? "") || null : undefined}
      duplicateLabel="SĐT"
      mergeDuplicates={opts.gopTrung ? { label: "Sẽ cập nhật bản ghi cũ" } : undefined}
      confirmDuplicates={opts.xacNhanTrung ? { label: "Xác nhận gộp" } : undefined}
    />,
  );
}

/**
 * Nạp dòng vào khung.
 *
 * Khung đọc file bằng `xlsx` trong trình duyệt, nên bộ này thay tầng đó: mock `XLSX.read` +
 * `sheet_to_json` để trả đúng mảng dòng mình muốn, rồi bắn sự kiện `change` thật vào ô file.
 * Tức vẫn đi qua ĐÚNG đường mà người dùng đi (luật 9), chỉ thay cái đọc tệp nhị phân.
 */
vi.mock("xlsx", () => ({
  read: () => ({ SheetNames: ["S"], Sheets: { S: {} } }),
  utils: {
    sheet_to_json: () => (globalThis as { __dong?: Dong[] }).__dong ?? [],
  },
}));

async function napFile(dong: Dong[]) {
  (globalThis as { __dong?: Dong[] }).__dong = dong;
  const o = document.querySelector('input[type="file"]') as HTMLInputElement;
  const f = new File([new Uint8Array([1])], "thu.xlsx");
  Object.defineProperty(f, "arrayBuffer", { value: async () => new ArrayBuffer(1) });
  Object.defineProperty(o, "files", { value: [f], configurable: true });
  fireEvent.change(o);
  await screen.findByRole("tab", { name: /Hợp lệ/ });
}

const demNhom = (ten: RegExp) =>
  Number(screen.getByRole("tab", { name: ten }).textContent!.replace(/\D+/g, ""));

const nutNhap = () =>
  screen.getByRole("button", { name: /^Nhập \d+ dòng/ }).textContent!;

describe("[NHAP-T10] ba nhóm đếm đúng và PHỦ HẾT mọi dòng", () => {
  it("chia đúng hợp lệ / trùng / lỗi", async () => {
    dung({ coTrung: true, gopTrung: true, dong: [] });
    await napFile([
      { Tên: "A", "SĐT": "01" },
      { Tên: "B", "SĐT": "02" },
      { Tên: "C", "SĐT": "01" }, // trùng với dòng đầu
      { Tên: "D", "SĐT": "" }, // lỗi
    ]);
    expect(demNhom(/Hợp lệ/)).toBe(2);
    expect(demNhom(/Trùng/)).toBe(1);
    expect(demNhom(/Lỗi/)).toBe(1);
  });

  it("⚠️ tổng ba nhóm = tổng số dòng — không dòng nào rơi ra ngoài", async () => {
    // Một dòng không thuộc nhóm nào là một dòng VÔ HÌNH: người nhập không thấy nó ở đâu để
    // xử lý, và cũng không biết nó có được ghi hay không.
    dung({ coTrung: true, gopTrung: true, dong: [] });
    const ds = [
      { Tên: "A", "SĐT": "01" },
      { Tên: "B", "SĐT": "01" },
      { Tên: "C", "SĐT": "" },
      { Tên: "D", "SĐT": "04" },
      { Tên: "E", "SĐT": "" },
    ];
    await napFile(ds);
    expect(demNhom(/Hợp lệ/) + demNhom(/Trùng/) + demNhom(/Lỗi/)).toBe(ds.length);
  });

  it("màn KHÔNG có khái niệm trùng ⇒ nhóm Trùng rỗng, hai nhóm kia vẫn đủ", async () => {
    // Khung dùng chung cho 10 màn; 9 màn kia không khai `duplicateKey`.
    dung({ dong: [] });
    await napFile([
      { Tên: "A", "SĐT": "01" },
      { Tên: "B", "SĐT": "01" },
      { Tên: "C", "SĐT": "" },
    ]);
    expect(demNhom(/Trùng/)).toBe(0);
    expect(demNhom(/Hợp lệ/)).toBe(2);
    expect(demNhom(/Lỗi/)).toBe(1);
  });
});

describe("[NHAP-T11] nút Nhập đếm dòng SẼ GHI, không phải dòng đang nhìn", () => {
  it("trùng có xử lý ⇒ tính vào số sẽ ghi", async () => {
    dung({ coTrung: true, gopTrung: true, dong: [] });
    await napFile([
      { Tên: "A", "SĐT": "01" },
      { Tên: "B", "SĐT": "01" },
      { Tên: "C", "SĐT": "" },
    ]);
    expect(nutNhap()).toContain("2"); // 1 hợp lệ + 1 trùng sẽ cập nhật
  });

  it("⚠️ trùng CHƯA xác nhận ⇒ KHÔNG tính, dù nó nằm ở nhóm Trùng chứ không phải Lỗi", async () => {
    // Đây là chỗ hai câu hỏi tách nhau: "dòng này thuộc nhóm nào" khác "dòng này có được ghi
    // không". Gộp hai câu là lỗi của bản cũ — dòng chờ xác nhận bị xếp vào Lỗi nên người dùng
    // đi sửa file, trong khi việc cần làm chỉ là bấm một nút.
    dung({ coTrung: true, xacNhanTrung: true, dong: [] });
    await napFile([
      { Tên: "A", "SĐT": "01" },
      { Tên: "B", "SĐT": "01" },
    ]);
    expect(demNhom(/Trùng/)).toBe(1);
    expect(demNhom(/Lỗi/)).toBe(0);
    expect(nutNhap()).toContain("1");
  });

  it("bấm xác nhận ⇒ dòng đó được tính vào", async () => {
    dung({ coTrung: true, xacNhanTrung: true, dong: [] });
    await napFile([
      { Tên: "A", "SĐT": "01" },
      { Tên: "B", "SĐT": "01" },
    ]);
    fireEvent.click(screen.getByRole("tab", { name: /Trùng/ }));
    // `getAllBy*[0]`: jsdom dựng cả bảng lẫn thẻ nên mỗi nút có hai bản.
    fireEvent.click(screen.getAllByRole("button", { name: "Xác nhận gộp" })[0]!);
    expect(nutNhap()).toContain("2");
  });

  it("không dòng nào ghi được ⇒ nút Nhập KHOÁ", async () => {
    dung({ dong: [] });
    await napFile([{ Tên: "A", "SĐT": "" }]);
    expect(screen.getByRole("button", { name: /^Nhập 0 dòng/ })).toBeDisabled();
  });
});

describe("[NHAP-T12] ⚠️ SỬA TAY — sửa xong dòng phải TỰ CHUYỂN nhóm", () => {
  it("chữa dòng lỗi ⇒ sang nhóm hợp lệ và được tính vào lượt nhập", async () => {
    // Đây là lý do nút Sửa tồn tại: "đỡ mất công phải sửa excel rồi nhập lại". Nút mở được
    // form mà dòng không chuyển nhóm thì lời hứa đó là hứa suông.
    dung({ dong: [] });
    await napFile([{ Tên: "A", "SĐT": "" }]);
    expect(demNhom(/Lỗi/)).toBe(1);

    fireEvent.click(screen.getByRole("tab", { name: /Lỗi/ }));
    fireEvent.click(screen.getAllByRole("button", { name: /Sửa dòng 2/ })[0]!);

    const o = screen.getAllByLabelText(/SĐT/)[0] as HTMLInputElement;
    fireEvent.change(o, { target: { value: "0909" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Lưu dòng/ })[0]!);

    expect(demNhom(/Lỗi/)).toBe(0);
    expect(demNhom(/Hợp lệ/)).toBe(1);
    expect(nutNhap()).toContain("1");
  });

  it("form sửa mở ra mang ĐÚNG giá trị đang có của dòng đó", async () => {
    // Form trống trơn thì người dùng phải gõ lại cả dòng — tệ hơn mở Excel.
    dung({ dong: [] });
    await napFile([{ Tên: "Nguyễn Văn A", "SĐT": "" }]);
    fireEvent.click(screen.getByRole("tab", { name: /Lỗi/ }));
    fireEvent.click(screen.getAllByRole("button", { name: /Sửa dòng 2/ })[0]!);
    expect((screen.getAllByLabelText(/Tên/)[0] as HTMLInputElement).value).toBe("Nguyễn Văn A");
  });

  it("huỷ sửa ⇒ không đổi gì", async () => {
    dung({ dong: [] });
    await napFile([{ Tên: "A", "SĐT": "" }]);
    fireEvent.click(screen.getByRole("tab", { name: /Lỗi/ }));
    fireEvent.click(screen.getAllByRole("button", { name: /Sửa dòng 2/ })[0]!);
    fireEvent.change(screen.getAllByLabelText(/SĐT/)[0]!, { target: { value: "0909" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Huỷ sửa/ })[0]!);
    expect(demNhom(/Lỗi/)).toBe(1);
  });

  it("⚠️ sửa một dòng KHÔNG đụng dòng khác", async () => {
    // Ba mảng chạy song song (dòng thô · dòng đã phân tích · số dòng Excel); ghi lệch một
    // index là dữ liệu của dòng này nhảy sang dòng kia, và không gì kêu lên cả.
    dung({ dong: [] });
    await napFile([
      { Tên: "A", "SĐT": "" },
      { Tên: "B", "SĐT": "" },
    ]);
    fireEvent.click(screen.getByRole("tab", { name: /Lỗi/ }));
    fireEvent.click(screen.getAllByRole("button", { name: /Sửa dòng 3/ })[0]!);
    fireEvent.change(screen.getAllByLabelText(/SĐT/)[0]!, { target: { value: "0909" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Lưu dòng/ })[0]!);

    expect(demNhom(/Lỗi/)).toBe(1);
    expect(demNhom(/Hợp lệ/)).toBe(1);

    // Nhóm Lỗi còn đúng DÒNG 2, và nó vẫn mang lý do cũ.
    // `getAllBy*`: jsdom không chạy media query nên CẢ HAI hình dạng (bảng + thẻ) cùng dựng;
    // mỗi dòng vì thế xuất hiện hai lần. Đó là điều đúng, không phải nhiễu cần bịt.
    expect(screen.getAllByText("Thiếu SĐT").length).toBeGreaterThan(0);
    const conLai = screen.getAllByRole("button", { name: /Sửa dòng \d+/ });
    expect(conLai.every((b) => b.getAttribute("aria-label")!.includes("dòng 2"))).toBe(true);

    // ⚠️ Đếm nhóm KHÔNG ĐỦ — phép cấy lỗi chứng minh: ghi giá trị mới vào chỉ số `i + 1`
    // thay vì `i` vẫn cho ra đúng 1 lỗi / 1 hợp lệ, vì con số chỉ đọc kết quả phân tích chứ
    // không đọc dữ liệu đang hiển thị. Phải soi GIÁ TRỊ THẬT đang bày ra.
    fireEvent.click(screen.getByRole("tab", { name: /Hợp lệ/ }));
    expect(screen.getAllByText("0909").length).toBeGreaterThan(0);
    expect(screen.getAllByText("B").length).toBeGreaterThan(0);
  });

  it("sửa xong vẫn giữ nguyên cột KHÔNG khai trong columnHints", async () => {
    // File thật hay có cột phụ người nhập tự thêm. Form chỉ sửa cột đã khai; làm mất các cột
    // kia là mất dữ liệu im lặng — server không bao giờ thấy chúng nữa.
    const daNhan: unknown[] = [];
    dung({
      dong: [],
      onImport: async (rows) => {
        daNhan.push(...rows);
        return { success: 0, errors: [] as [] };
      },
    });
    await napFile([{ Tên: "A", "SĐT": "", "Cột lạ": "giữ tôi lại" }]);
    fireEvent.click(screen.getByRole("tab", { name: /Lỗi/ }));
    fireEvent.click(screen.getAllByRole("button", { name: /Sửa dòng 2/ })[0]!);
    fireEvent.change(screen.getAllByLabelText(/SĐT/)[0]!, { target: { value: "0909" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Lưu dòng/ })[0]!);
    fireEvent.click(screen.getByRole("button", { name: /^Nhập 1 dòng/ }));
    await screen.findByText(/Nhập file khác/);
    expect((daNhan[0] as Record<string, unknown>)["Cột lạ"]).toBe("giữ tôi lại");
  });
});

describe("[NHAP-T13] dòng trùng nói rõ hệ thống sắp làm gì", () => {
  it("hiện nhãn của `mergeDuplicates`, không phải một chữ 'trùng' trống rỗng", async () => {
    dung({ coTrung: true, gopTrung: true, dong: [] });
    await napFile([
      { Tên: "A", "SĐT": "01" },
      { Tên: "B", "SĐT": "01" },
    ]);
    fireEvent.click(screen.getByRole("tab", { name: /Trùng/ }));
    expect(screen.getAllByText(/Sẽ cập nhật bản ghi cũ/).length).toBeGreaterThan(0);
  });

  it("nói rõ trùng với DÒNG NÀO trong file", async () => {
    // Không chỉ ra dòng gốc thì người dùng phải tự dò cả file để biết bỏ dòng nào.
    dung({ coTrung: true, gopTrung: true, dong: [] });
    await napFile([
      { Tên: "A", "SĐT": "01" },
      { Tên: "B", "SĐT": "01" },
    ]);
    fireEvent.click(screen.getByRole("tab", { name: /Trùng/ }));
    expect(screen.getAllByText(/dòng 2 trong file/).length).toBeGreaterThan(0);
  });

  it("dòng SẴN SÀNG không có dòng lý do — không có gì để nói thì đừng chiếm chỗ", async () => {
    dung({ coTrung: true, gopTrung: true, dong: [] });
    await napFile([{ Tên: "A", "SĐT": "01" }]);
    // Cả hai hình dạng (bảng + thẻ) đều phải im — bản trước bảng bỏ mà thẻ vẫn in.
    expect(screen.queryAllByText(/Sẵn sàng nhập/)).toEqual([]);
  });
});

describe("[NHAP-T14] nhóm rỗng nói VÌ SAO rỗng", () => {
  it("không dòng lỗi ⇒ nói thẳng là file sạch", async () => {
    dung({ dong: [] });
    await napFile([{ Tên: "A", "SĐT": "01" }]);
    fireEvent.click(screen.getByRole("tab", { name: /Lỗi/ }));
    expect(screen.getByText(/Không dòng nào lỗi/)).toBeTruthy();
  });

  it("mỗi nhóm rỗng có câu RIÊNG, không dùng chung một câu 'không có dữ liệu'", async () => {
    dung({ coTrung: true, gopTrung: true, dong: [] });
    await napFile([{ Tên: "A", "SĐT": "01" }]);
    fireEvent.click(screen.getByRole("tab", { name: /Trùng/ }));
    const trung = screen.getByText(/toàn bản ghi mới/).textContent;
    fireEvent.click(screen.getByRole("tab", { name: /Lỗi/ }));
    const loi = screen.getByText(/Không dòng nào lỗi/).textContent;
    expect(trung).not.toBe(loi);
  });
});

describe("[NHAP-T15] bộ lọc đi được bằng bàn phím", () => {
  it("mũi tên phải chuyển sang nhóm kế", async () => {
    // Thiếu phím mũi tên thì Tab nhảy thẳng qua cả cụm và người dùng bàn phím không đổi nhóm
    // được — ba nhóm trở thành một nhóm.
    dung({ dong: [] });
    await napFile([{ Tên: "A", "SĐT": "01" }]);
    const tabHopLe = screen.getByRole("tab", { name: /Hợp lệ/ });
    expect(tabHopLe.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabHopLe, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /Trùng/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("mũi tên trái từ nhóm đầu vòng về nhóm cuối", async () => {
    dung({ dong: [] });
    await napFile([{ Tên: "A", "SĐT": "01" }]);
    fireEvent.keyDown(screen.getByRole("tab", { name: /Hợp lệ/ }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: /Lỗi/ }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("[NHAP-T16] kết quả sau khi ghi tách 'tạo mới' với 'cập nhật'", () => {
  it("đếm riêng hai con số", async () => {
    // Gộp chung là người nhập không biết file của mình vừa tạo bao nhiêu lead mới và ghi đè
    // bao nhiêu lead cũ — mà đó đúng là câu hỏi họ lo nhất ở màn ghi đè.
    dung({
      dong: [],
      onImport: async () => ({ success: 3, updated: 2, errors: [] }) as never,
    });
    await napFile([{ Tên: "A", "SĐT": "01" }]);
    fireEvent.click(screen.getByRole("button", { name: /^Nhập 1 dòng/ }));
    const the = await screen.findByText("Cập nhật");
    expect(within(the.parentElement!).getByText("2")).toBeTruthy();
    expect(within(screen.getByText("Tạo mới").parentElement!).getByText("3")).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// BẢNG KẾT QUẢ — ba ca dưới đây có TRƯỚC đợt thiết kế lại 15/09/2026 và được giữ nguyên ý
// nghĩa. Chúng khoá một sự cố prod thật, không phải một sở thích trình bày.
//
// Ca thật 03/08/2026: nhập 37 lead CS2 → 6 tạo mới, 28 dòng trùng đã có sẵn. Màn cũ báo
// "Thành công: 6 | Lỗi: 28" dù KHÔNG dòng nào hỏng ⇒ người nhập tưởng thất bại và nhập lại,
// nhân đôi dữ liệu. Cách đếm bị khoá lại từ đó.
//
// ⚠️ Phép khẳng định đổi theo mã mới (bảng đếm thay cho câu tổng kết một dòng), nhưng BẤT
// BIẾN thì y nguyên: dòng "ℹ️" là ghi chú, tuyệt đối không được đếm là lỗi.
// ─────────────────────────────────────────────────────────────────────────────────────────

const noop = () => {};

/** Số trên thẻ đếm mang nhãn `nhan`. */
const demThe = (nhan: string) =>
  within(screen.getByText(nhan).parentElement!).getByText(/^\d+$/).textContent;

describe("[NHAP-T17] bảng kết quả: ghi chú KHÔNG phải lỗi", () => {
  it("28 dòng ℹ️ ⇒ thẻ Lỗi vẫn là 0", () => {
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
    expect(demThe("Tạo mới")).toBe("6");
    expect(demThe("Lỗi")).toBe("0");
    expect(screen.getByText(/Không dòng nào lỗi/)).toBeTruthy();
    expect(screen.getByText(/Ghi chú \(28\)/)).toBeTruthy();
  });

  it("lỗi thật vẫn hiện đỏ và tách khỏi ghi chú", () => {
    render(
      <ImportOutcome
        result={{
          success: 1,
          errors: [
            { row: 5, error: 'SĐT không hợp lệ: "12345"' },
            { row: 0, error: "ℹ️ Đã thêm 2 con vào lead có sẵn cùng SĐT" },
          ],
        }}
        onReset={noop}
      />,
    );
    expect(screen.getByText(/SĐT không hợp lệ/)).toBeTruthy();
    expect(screen.getByText(/dòng KHÔNG được ghi/)).toBeTruthy();
    expect(screen.getByText(/Ghi chú \(1\)/)).toBeTruthy();
    expect(demThe("Lỗi")).toBe("1");
  });

  it("không lỗi, không ghi chú ⇒ chỉ báo thành công", () => {
    render(<ImportOutcome result={{ success: 3, errors: [] }} onReset={noop} />);
    expect(screen.queryByText(/Ghi chú/)).toBeNull();
    expect(demThe("Tạo mới")).toBe("3");
  });

  it("không có bản ghi nào được cập nhật ⇒ KHÔNG hiện thẻ 'Cập nhật' trống", () => {
    // Màn nhập nào không có khái niệm ghi đè thì đừng bày ra một con số 0 vô nghĩa.
    render(<ImportOutcome result={{ success: 3, errors: [] }} onReset={noop} />);
    expect(screen.queryByText("Cập nhật")).toBeNull();
  });
});
