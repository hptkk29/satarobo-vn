/**
 * Bảng buổi của MỘT lớp ở màn /attendance (admin) — yêu cầu 21/08.
 *
 * Chốt những điều dễ vỡ khi ai đó sửa lại bảng này:
 *   1. THỨ TỰ do server quyết (lib/lms/attendance-queue). Bộ lọc ở client chỉ được
 *      BỚT dòng, không được xếp lại — bản đầu tiên của màn này từng `.sort()` trong
 *      `useMemo` và thế là mọi công sắp bậc ở server bị đảo ngay khi gõ vào ô tìm.
 *   2. Buổi CHƯA TỚI GIỜ không bày 3 chip việc — chip xám ở một buổi tuần sau đọc
 *      như "đang thiếu", trong khi chưa tới lượt làm.
 *   3. Nút "Hoàn tất" chỉ sáng khi đủ CẢ BA việc. Nó là nút đổi trạng thái thật, bật
 *      sớm là chốt nhầm một buổi còn dở.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

const complete = vi.fn();
vi.mock("../_actions", () => ({
  completeAttendanceSessionAction: (...args: unknown[]) => complete(...args),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) },
}));

// Hộp thoại tải ảnh thật kéo theo server action + presign R2 — ngoài phạm vi bảng này.
vi.mock("@/app/(teacher)/teacher/anh-lop/_components/upload-photo-dialog", () => ({
  UploadPhotoDialog: ({ initialSessionId }: { initialSessionId?: string }) => (
    <button type="button">
      {initialSessionId ? `Tải ảnh ${initialSessionId}` : "Đăng ảnh lớp"}
    </button>
  ),
}));

import { AttendanceList, type AttendanceListRow } from "./attendance-list";

function row(over: Partial<AttendanceListRow> & { id: string }): AttendanceListRow {
  return {
    classId: "c1",
    number: 1,
    title: "Bài học",
    dateLabel: "T5, 21/08/2026",
    timeLabel: "18:00 - 20:00",
    phase: "PENDING",
    completed: false,
    roster: 10,
    marked: 0,
    attended: 0,
    attendanceDone: false,
    feedbackDone: false,
    photoDone: false,
    photoCovered: 0,
    ...over,
  };
}

const ROWS: AttendanceListRow[] = [
  row({
    id: "s-pending",
    number: 3,
    title: "Việc nợ ảnh",
    marked: 10,
    attended: 9,
    attendanceDone: true,
    feedbackDone: true,
  }),
  row({ id: "s-today", number: 4, title: "Việc chiều nay", phase: "TODAY" }),
  row({ id: "s-upcoming", number: 5, title: "Việc tuần sau", phase: "UPCOMING" }),
  row({
    id: "s-done",
    number: 1,
    title: "Xong hết",
    phase: "DONE",
    marked: 10,
    attended: 10,
    attendanceDone: true,
    feedbackDone: true,
    photoDone: true,
    photoCovered: 10,
  }),
];

function mount(rows: AttendanceListRow[], canComplete = true) {
  return render(
    <AttendanceList
      rows={rows}
      classId="c1"
      className="Sata 3 - CS1"
      canComplete={canComplete}
    />,
  );
}

/** Nội dung cột "Tiêu đề buổi" của từng dòng dữ liệu. */
function titles(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1) // bỏ hàng tiêu đề
    .map((tr) => within(tr).getAllByRole("cell")[1].textContent ?? "");
}

beforeEach(() => {
  complete.mockReset();
  refresh.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
});

describe("AttendanceList", () => {
  it("giữ NGUYÊN thứ tự server đưa xuống — kể cả khi số buổi lộn xộn", () => {
    mount(ROWS);
    expect(titles()).toEqual([
      "Việc nợ ảnh18:00 - 20:00",
      "Việc chiều nay18:00 - 20:00",
      "Việc tuần sau18:00 - 20:00",
      "Xong hết18:00 - 20:00",
    ]);
  });

  it("in số thứ tự buổi ở cột đầu", () => {
    mount([ROWS[0]]);
    const dataRow = screen.getAllByRole("row")[1];
    expect(within(dataRow).getAllByRole("cell")[0]).toHaveTextContent("Buổi 3");
  });

  it("lớp chưa ghim giáo trình thì nói rõ, không để ô trống", () => {
    mount([row({ id: "s-x", title: "" })]);
    expect(screen.getByText("(giáo trình chưa đặt tên buổi)")).toBeInTheDocument();
  });

  it("lọc theo từ khoá chỉ BỚT dòng, không đảo thứ tự", () => {
    mount(ROWS);
    fireEvent.change(screen.getByLabelText("Tìm buổi học"), {
      target: { value: "việc" },
    });
    expect(titles().map((t) => t.replace("18:00 - 20:00", ""))).toEqual([
      "Việc nợ ảnh",
      "Việc chiều nay",
      "Việc tuần sau",
    ]);
  });

  it("chip đếm nhanh lọc đúng bậc, bấm lại thì bỏ lọc", () => {
    mount(ROWS);
    const chip = screen.getByRole("button", { name: /Đã hoàn tất/ });
    fireEvent.click(chip);
    expect(titles()).toHaveLength(1);
    fireEvent.click(chip);
    expect(titles()).toHaveLength(4);
  });

  it("buổi còn nợ ảnh: chip Ảnh/video KHÔNG xanh, hai chip kia xanh", () => {
    mount([ROWS[0]]);
    expect(screen.getByTitle("Ảnh/video 0/9: chưa xong")).toBeInTheDocument();
    expect(screen.getByTitle("Nhận xét: xong")).toBeInTheDocument();
    expect(screen.getByTitle("Điểm danh 10/10: xong")).toBeInTheDocument();
  });

  it("buổi chưa tới giờ KHÔNG bày chip việc", () => {
    mount([ROWS[2]]);
    expect(screen.queryByTitle(/Ảnh\/video/)).not.toBeInTheDocument();
    const dataRow = screen.getAllByRole("row")[1];
    expect(within(dataRow).getByText("Chưa tới giờ")).toBeInTheDocument();
  });

  it("cột Có mặt để dấu — khi chưa ai được điểm danh", () => {
    mount([ROWS[1]]);
    const dataRow = screen.getAllByRole("row")[1];
    expect(within(dataRow).getAllByRole("cell")[3]).toHaveTextContent("—");
  });

  it("ba nút việc trỏ đúng chỗ, link điểm danh giữ lớp đang mở", () => {
    mount([ROWS[1]]);
    expect(screen.getByRole("link", { name: /Điểm danh/ })).toHaveAttribute(
      "href",
      "/attendance?classId=c1&sessionId=s-today",
    );
    expect(screen.getByRole("link", { name: /Nhận xét/ })).toHaveAttribute(
      "href",
      "/sessions/s-today",
    );
    expect(screen.getByRole("button", { name: "Tải ảnh s-today" })).toBeInTheDocument();
  });

  it("thiếu việc thì nút Hoàn tất bị khoá và nói rõ còn thiếu gì", () => {
    mount([ROWS[0]]);
    const btn = screen.getByRole("button", { name: /Hoàn tất/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Còn thiếu: ảnh/video (0/9 em)");
  });

  it("đủ ba việc thì bấm được, gọi action rồi làm mới trang", async () => {
    complete.mockResolvedValue({ ok: true });
    mount([row({ ...ROWS[3], completed: false })]);
    fireEvent.click(screen.getByRole("button", { name: /Hoàn tất/ }));
    await waitFor(() => expect(complete).toHaveBeenCalledWith("s-done"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalledWith("Đã hoàn tất buổi");
  });

  it("action từ chối thì báo lỗi và KHÔNG làm mới trang", async () => {
    complete.mockResolvedValue({ ok: false, error: "Chưa hoàn tất: còn thiếu ảnh" });
    mount([row({ ...ROWS[3], completed: false })]);
    fireEvent.click(screen.getByRole("button", { name: /Hoàn tất/ }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Chưa hoàn tất: còn thiếu ảnh"),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("buổi đã chốt hiện nhãn, không còn nút bấm lại", () => {
    mount([row({ ...ROWS[3], completed: true })]);
    // Nhãn phải KHÁC chữ với bậc "Đã hoàn tất" ở cột Tình trạng, nếu không cùng một
    // dòng có hai nhãn y hệt nhau nói hai chuyện khác nhau.
    expect(screen.getByText("Đã chốt buổi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hoàn tất/ })).not.toBeInTheDocument();
  });

  it("không có quyền sessions:edit thì không thấy nút chốt buổi", () => {
    mount([row({ ...ROWS[3], completed: false })], false);
    expect(screen.queryByRole("button", { name: /Hoàn tất/ })).not.toBeInTheDocument();
  });

  it("không còn dòng nào khớp thì nói rõ phải làm gì", () => {
    mount(ROWS);
    fireEvent.change(screen.getByLabelText("Tìm buổi học"), {
      target: { value: "zzz-không-có" },
    });
    expect(screen.getByText("Không có buổi học nào khớp bộ lọc")).toBeInTheDocument();
  });
});
