// @vitest-environment node
/**
 * Ánh xạ trạng thái khách → thang màu NGỮ NGHĨA của hệ thiết kế.
 *
 * Vì sao bộ này tồn tại: trước 28/08 bảng "Khách của tôi" vẽ mọi trạng thái bằng
 * `<Badge variant="outline">` — mười trạng thái, MỘT màu. Màu không mang tin nào,
 * người dùng phải đọc từng chữ để biết dòng nào cần gọi. Đúng cái lỗi mà
 * `components/admin/ui/status-pill.tsx` đã ghi trong chú thích của nó và
 * `DESIGN.md §1` đã cấm bằng văn bản.
 *
 * Luật của bảng ánh xạ: **chữ mang GIAI ĐOẠN, màu mang MỨC CẦN ĐỘNG TAY.**
 * Nhuộm mười giai đoạn thành mười màu (như `LEAD_STATUS_BADGE` đang làm) chỉ đổi
 * một bức tường chữ thành một bức tường màu — người quét mắt vẫn không biết gọi ai.
 */
import { describe, it, expect } from "vitest";
import { ALL_LEAD_STATUSES, LEAD_STATUS_VALUES } from "@/lib/leads/status";
import { toneTrangThaiKhach, toneDoNguoi } from "@/lib/sale/trang-thai-khach";

describe("[S-UI-1] mọi trạng thái đều có màu — không sót cái nào", () => {
  it("phủ hết danh sách trạng thái, không rơi về mặc định im lặng", () => {
    // Thêm trạng thái mới vào `LEAD_STATUS_VALUES` mà quên khai màu ⇒ ca này đỏ.
    // Nếu để hàm rơi về "muted" thì trạng thái mới sẽ tàng hình giữa bảng.
    for (const tt of ALL_LEAD_STATUSES) {
      expect(toneTrangThaiKhach(tt), tt).toBeTruthy();
    }
    expect(ALL_LEAD_STATUSES).toHaveLength(LEAD_STATUS_VALUES.length);
  });
});

describe("[S-UI-1] màu nói đúng mức cần động tay", () => {
  it("khách MỚI là việc cần làm ngay → cảnh báo", () => {
    expect(toneTrangThaiKhach("MOI")).toBe("warning");
  });

  it("đã đăng ký là thắng → tốt", () => {
    expect(toneTrangThaiKhach("DA_DANG_KY")).toBe("success");
  });

  it("đã mất là hỏng → nguy", () => {
    expect(toneTrangThaiKhach("DA_MAT")).toBe("danger");
  });

  it("đang nuôi dưỡng là GÁC LẠI CÓ CHỦ ĐÍCH → xám, không phải cảnh báo", () => {
    // Nhuộm cảnh báo cho nhóm cố ý để lâu là dạy người dùng bỏ qua màu cảnh báo.
    expect(toneTrangThaiKhach("DANG_NUOI_DUONG")).toBe("muted");
  });

  it("các bước giữa phễu đều là 'đang chạy' → cùng một màu trung tính", () => {
    for (const tt of [
      "DA_LIEN_HE",
      "DANG_TU_VAN",
      "DA_HEN_HOC_THU",
      "DANG_HOC_THU",
      "DA_HOC_THU",
      "CHO_QUYET_DINH",
    ] as const) {
      expect(toneTrangThaiKhach(tt), tt).toBe("info");
    }
  });

  it("🔴 KHÔNG trạng thái nào mượn màu thương hiệu", () => {
    // `brand` là màu của NÚT và MỤC ĐANG CHỌN. Cho nó thêm nghĩa "một trạng thái
    // nào đó" là làm hỏng cả hai nghĩa — bài học đã ghi ở DESIGN.md §1.
    for (const tt of ALL_LEAD_STATUSES) {
      expect(toneTrangThaiKhach(tt), tt).not.toBe("brand");
    }
  });
});

describe("[S-UI-2] độ nguội của khách — màu chỉ bật khi thật sự nguội", () => {
  const gio = (n: number) => new Date(Date.now() - n * 3600_000).toISOString();

  it("vừa chạm hôm nay → không tô màu (mặc định im lặng)", () => {
    expect(toneDoNguoi(gio(2))).toBe(null);
  });

  it("quá 3 ngày → cảnh báo", () => {
    expect(toneDoNguoi(gio(24 * 4))).toBe("warning");
  });

  it("quá 7 ngày → nguy", () => {
    expect(toneDoNguoi(gio(24 * 9))).toBe("danger");
  });

  it("🔴 chưa chạm lần nào → nguy, KHÔNG phải ô trống", () => {
    // Nhóm dễ rơi nhất. Ô trống là chỗ mắt trượt qua.
    expect(toneDoNguoi(null)).toBe("danger");
  });

  it("đúng biên 3 ngày vẫn im, qua biên mới kêu", () => {
    // Biên đóng/mở sai một chiều là cả một ngày khách bị tô nhầm.
    expect(toneDoNguoi(gio(24 * 3 - 1))).toBe(null);
    expect(toneDoNguoi(gio(24 * 3 + 1))).toBe("warning");
  });
});
