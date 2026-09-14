// lib/finance/gan-ghi-danh-khoan.test.ts — GẮN KHOẢN THU VÀO GHI DANH.
//
// Chủ dự án 14/09/2026, chỉ vào màn Thanh toán: "bấm xem thử xong chỉ xem và không có
// thao tác gì nữa à?"
//
// Đúng. Khối "Học phí nhập từ file Excel" đếm được số khoản bị bỏ và nêu lý do, nhưng
// không cho làm gì với chúng. Mà lý do phổ biến nhất — **"Chưa gắn ghi danh — không sinh
// được phiếu thu"** (`LY_DO_BO.CHUA_GAN_GHI_DANH`) — là thứ SỬA ĐƯỢC: chỉ cần trỏ khoản
// đó vào đúng ghi danh của em. Không có đường sửa thì tiền nằm mãi ở trạng thái chờ, và
// cổng phụ huynh vẫn hiện nợ dù nhà đã đóng.
//
// ─────────────────────────────────────────────────────────────────────────────
// VÌ SAO KHÔNG TỰ GẮN LÚC NHẬP
//
// `ghi-giao-dich-cu.ts` CÓ tự gắn — nhưng chỉ khi KHÔNG MƠ HỒ: đúng một ghi danh còn
// sống. Em học hai lớp thì phải chia tiền theo `finalPrice`, và đoán hộ ở đó là ghi tiền
// vào lớp sai. Nên phần còn lại rơi xuống đây, cho người xử lý tay.
//
// Hàm này giữ NGUYÊN luật đó: gợi ý khi chắc, bắt chọn khi mơ hồ, không bao giờ tự quyết.
import { describe, it, expect } from "vitest";
import { chonGhiDanhChoKhoan, MUC_GAN } from "./gan-ghi-danh-khoan";

const gd = (id: string, x: Partial<{ tenLop: string; tenKhoa: string; finalPrice: number | null }> = {}) => ({
  id,
  tenLop: x.tenLop ?? "Lớp A",
  tenKhoa: x.tenKhoa ?? "Sata 3",
  finalPrice: x.finalPrice ?? 10_560_000,
});

describe("[GGK-01] đúng MỘT ghi danh → gợi ý sẵn", () => {
  it("một ghi danh sống → CHAC_CHAN, có id", () => {
    const r = chonGhiDanhChoKhoan([gd("e1")]);
    expect(r.muc).toBe(MUC_GAN.CHAC_CHAN);
    expect(r.ghiDanhId).toBe("e1");
  });
});

describe("[GGK-02] nhiều ghi danh → BẮT CHỌN, tuyệt đối không đoán", () => {
  it("hai ghi danh → PHAI_CHON, KHÔNG trả id nào", () => {
    // Cám dỗ: lấy cái mới nhất, hoặc cái đắt nhất. Cả hai đều là ghi tiền vào lớp sai
    // mà không ai biết — khoản đã gắn rồi thì công nợ của lớp kia vẫn nguyên.
    const r = chonGhiDanhChoKhoan([gd("e1"), gd("e2", { tenLop: "Lớp B" })]);
    expect(r.muc).toBe(MUC_GAN.PHAI_CHON);
    expect(r.ghiDanhId).toBeNull();
  });

  it("trả ĐỦ danh sách để màn bày ra cho người chọn", () => {
    const ds = [gd("e1"), gd("e2"), gd("e3")];
    expect(chonGhiDanhChoKhoan(ds).ungVien).toHaveLength(3);
  });
});

describe("[GGK-03] không có ghi danh nào → nói ra, không im lặng", () => {
  it("rỗng → KHONG_CO, không id", () => {
    const r = chonGhiDanhChoKhoan([]);
    expect(r.muc).toBe(MUC_GAN.KHONG_CO);
    expect(r.ghiDanhId).toBeNull();
  });

  it("KHONG_CO là ca cần NGƯỜI làm việc khác — không phải lỗi của khoản", () => {
    // Em chưa được xếp lớp. Việc phải làm là tạo ghi danh, không phải sửa khoản thu.
    // Màn phải chỉ đúng chỗ đó thay vì bày một ô chọn rỗng.
    expect(chonGhiDanhChoKhoan([]).ungVien).toEqual([]);
  });
});

describe("[GGK-04] ghi danh CHƯA CHỐT GIÁ vẫn là ứng viên hợp lệ", () => {
  it("finalPrice null không loại ghi danh khỏi danh sách", () => {
    // Gắn khoản vào ghi danh chưa chốt giá là hợp lệ: tiền đã thu là có thật, còn mẫu số
    // sửa ở màn Đối soát học phí. Loại nó ra ở đây là bắt người dùng làm đúng thứ tự mà
    // không ai nói cho họ biết.
    const r = chonGhiDanhChoKhoan([gd("e1", { finalPrice: null })]);
    expect(r.muc).toBe(MUC_GAN.CHAC_CHAN);
    expect(r.ghiDanhId).toBe("e1");
  });
});

describe("[GGK-05] thứ tự đầu vào không đổi kết quả", () => {
  it("cùng tập ghi danh, đảo thứ tự → cùng mức", () => {
    const a = chonGhiDanhChoKhoan([gd("e1"), gd("e2")]);
    const b = chonGhiDanhChoKhoan([gd("e2"), gd("e1")]);
    expect(a.muc).toBe(b.muc);
    expect(a.ghiDanhId).toBe(b.ghiDanhId);
  });
});
