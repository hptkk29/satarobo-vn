// @vitest-environment node
/**
 * Bài kiểm cho `duongSale()` — loại lỗi này KHÔNG ném ngoại lệ nào.
 *
 * Một `href` sai trên site Sale chỉ hiện ra khi có người bấm vào và nhận trang
 * trắng; typecheck xanh, lint xanh, build xanh. Nên phần dịch đường phải có bài
 * kiểm riêng, và bài kiểm phải neo vào ĐÚNG những chuỗi mà `lib/pending-tasks.ts`
 * sinh ra thật, không phải chuỗi bịa.
 */
import { describe, it, expect } from "vitest";
import { duongSale } from "./duong-dan-sale";

describe("[S-DASH-1] đổi đường quản trị sang bản Sale", () => {
  it("đường đã có bản Sale thì trỏ bản Sale", () => {
    expect(duongSale("/leads")).toBe("/sale/leads");
    expect(duongSale("/students/sap-het-khoa")).toBe("/sale/sap-het-khoa");
    expect(duongSale("/cham-soc-hv")).toBe("/sale/cham-soc-hv");
    expect(duongSale("/sinh-nhat")).toBe("/sale/sinh-nhat");
  });

  it("giữ nguyên truy vấn khi đổi đường", () => {
    // `registeredStale()` sinh đúng chuỗi này. Mất `?status=` là nhóm việc dẫn
    // tới danh sách KHÔNG lọc — người dùng không biết mình đang xem nhầm.
    expect(duongSale("/leads?status=DA_DANG_KY")).toBe("/sale/leads?status=DA_DANG_KY");
  });

  it("chi tiết lead đi về hồ sơ khách của Sale, không phải /sale/leads/{id}", () => {
    expect(duongSale("/leads/abc123")).toBe("/sale/khach-cua-toi/abc123");
  });

  it("đường tuyệt đối của site khác không bị đụng tới", () => {
    // `elearningDue()` trả `elearningHomeUrl()` — một host khác hẳn.
    expect(duongSale("https://elearning.satarobo.vn/hoc/x")).toBe(
      "https://elearning.satarobo.vn/hoc/x",
    );
  });

  it("đường đã là bản Sale thì không đổi lần hai", () => {
    expect(duongSale("/sale/khach-cua-toi/abc")).toBe("/sale/khach-cua-toi/abc");
    expect(duongSale("/sale")).toBe("/sale");
  });

  it("⚠️ NỢ ĐÃ BIẾT — đường chưa có bản Sale thì GIỮ NGUYÊN, không đoán bừa", () => {
    // Neo hành vi có chủ đích: đổi `/students/{id}/edit` thành `/sale/hoc-vien`
    // là đưa người dùng tới một danh sách thay vì hồ sơ họ đang cần — một link
    // sai đích khó phát hiện hơn một link 404.
    expect(duongSale("/students/stu_1/edit")).toBe("/students/stu_1/edit");
    expect(duongSale("/classes?status=PENDING_APPROVAL")).toBe("/classes?status=PENDING_APPROVAL");
    expect(duongSale("/report-cards")).toBe("/report-cards");
  });
});
