// @vitest-environment node
/**
 * 🔴 LỐI VÀO của khu đào tạo nội bộ — hợp đồng.
 *
 * Tệp này tồn tại vì một bản kiểm đối chiếu mã thật (27/08/2026) cho ra kết quả
 * khó chịu: module gần đủ mã, 5992 test xanh, mà **chưa ai đi hết được một vòng
 * nào**. Không phải vì logic sai, mà vì thiếu đường đi:
 *
 *  · trang chủ khu là khung tạm 16 dòng với ĐÚNG 0 link, và mục menu "Học tập nội
 *    bộ" dẫn thẳng vào đó;
 *  · `/elearning/hoc/{enrollmentId}` chưa bao giờ có tệp, trong khi BA chỗ sinh
 *    thông báo trỏ vào nó — "được giao khoá", "quá hạn", và chuông;
 *  · `/elearning/soan-khoa` là link chết, nằm ngay dưới dòng bình luận "Trang không
 *    có lối vào thì chỉ người viết nó biết đường tới";
 *  · năm action khai xong rồi để đó, 0 màn nào gọi.
 *
 * Mỗi ca dưới đây khoá một mảnh của đường đi đó. Chúng rẻ, và chúng bắt được đúng
 * loại hỏng mà 5992 test kia không thấy: mã chạy đúng, nhưng không ai tới được.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const co = (p: string) => existsSync(join(ROOT, p));
const doc = (p: string) => readFileSync(join(ROOT, p), "utf8");

const chiMa = (src: string) =>
  src
    .split("\n")
    .filter((l) => {
      const t = l.trimStart();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

describe("🔴 ba route ĐÍCH phải tồn tại", () => {
  it("`/elearning/hoc/[enrollmentId]` — đích của ba thông báo", () => {
    // Thiếu nó thì bấm thông báo "được giao khoá" hay "quá hạn" = 404, và người học
    // không có đường nào vào bài trừ gõ tay URL hai đoạn — mà họ không biết
    // `lessonId`.
    expect(co("app/(elearning)/elearning/hoc/[enrollmentId]/page.tsx")).toBe(true);
  });

  it("`/elearning/soan-khoa` — đích của link trên màn chương trình", () => {
    expect(co("app/(elearning)/elearning/soan-khoa/page.tsx")).toBe(true);
  });

  it("và ba nơi sinh link vẫn trỏ đúng địa chỉ đó", () => {
    // Nếu ai đó đổi đường dẫn ở một bên mà quên bên kia, ca này đỏ.
    const notify = doc("lib/elearning/_handlers/notify.ts");
    const pending = doc("lib/pending-tasks.ts");
    expect(chiMa(notify)).toContain("/elearning/hoc/");
    // ⚠️ `pending-tasks` ghép URL qua `elearningHomeUrl()` vì chuông chạy CHÉO HOST
    // (từ khu admin sang khu e-learning), nên đường dẫn tuyệt đối là bắt buộc —
    // chuỗi `/elearning/hoc/` không xuất hiện nguyên vẹn ở đó. Canh phần đuôi.
    expect(chiMa(pending)).toContain("/hoc/${");
    expect(chiMa(doc("app/(elearning)/elearning/chuong-trinh/page.tsx"))).toContain(
      '"/elearning/soan-khoa"',
    );
  });
});

describe("🔴 trang chủ khu KHÔNG còn là khung tạm", () => {
  const home = doc("app/(elearning)/elearning/page.tsx");

  it("có dẫn đi đâu đó", () => {
    // Đích của mục menu "Học tập nội bộ". 0 link ở đây nghĩa là mọi màn đã dựng —
    // kho câu hỏi, đề thi, khung chấm, hàng đợi chấm, báo cáo — không ai tới được.
    expect(chiMa(home)).toContain("Link");
    expect(chiMa(home)).toContain("/elearning/hoc/");
  });

  it("KHÔNG còn câu 'đang được xây dựng'", () => {
    expect(home).not.toContain("đang được xây dựng");
  });

  it("dẫn tới màn dữ liệu cá nhân — nơi khiếu nại cờ xem video", () => {
    // Trước đó grep toàn kho ra 0 <Link> nào trỏ `/elearning/du-lieu-cua-toi`: cửa
    // sổ khiếu nại 14 ngày chạy im lặng rồi cron đêm tự chốt, trong khi người bị
    // gắn cờ không có đường nào tới chỗ khiếu nại.
    expect(chiMa(home)).toContain("/elearning/du-lieu-cua-toi");
  });
});

describe("🔴 layout có thanh điều hướng, và nó GÁC THEO QUYỀN", () => {
  const layout = doc("app/(elearning)/elearning/layout.tsx");

  it("có thanh điều hướng", () => {
    expect(chiMa(layout)).toContain("<nav");
  });

  it("gác từng mục theo quyền, không hiện hết cho mọi người", () => {
    // Người học thuần thấy mục "Chấm bài" là thấy một cánh cửa họ mở ra sẽ bị từ
    // chối — và họ sẽ nghĩ mình mất quyền, chứ không nghĩ mục đó không dành cho mình.
    expect(chiMa(layout)).toContain('can(actor, "elearning:exam:grade")');
    expect(chiMa(layout)).toContain('can(actor, "elearning:content:author")');
    expect(chiMa(layout)).toContain('can(actor, "elearning:progress:view-all")');
  });
});

describe("🔴 năm action KHÔNG còn mồ côi", () => {
  const tsx = [
    "app/(elearning)/elearning/giao-bai/_components/assignment-list.tsx",
    "app/(elearning)/elearning/soan/_components/attendance-panel.tsx",
    "app/(elearning)/elearning/soan-khoa/_components/equivalence-panel.tsx",
  ].map(doc).join("\n");

  it.each([
    ["giaHanLuotGiaoAction", "người vận hành không có nút gia hạn"],
    ["thuHoiLuotGiaoAction", "không có nút thu hồi"],
    ["ghiNhanSuCoAction", "vai trực hỗ trợ QĐ-CDA-15 không có công cụ nào"],
    ["diemDanhBuoiAction", "bài LIVE_SESSION không bao giờ xong ⇒ khoá kết hợp kẹt"],
    ["congNhanTuongDuongAction", "số công nhận tương đương vĩnh viễn bằng 0"],
  ])("%s có màn hình gọi — nếu không: %s", (ten) => {
    expect(tsx).toContain(ten);
  });
});

describe("🔴 điểm danh buổi phải CUỘN lên cấp khoá", () => {
  it("`cauHinhDiemDanhBuoi` gọi `cuonKhoaSauKhiXongBai`", () => {
    // Ba đường ghi tiến độ khác đều gọi; đường điểm danh thì không. Hệ quả: tick
    // "đã dự" cho bài bắt buộc CUỐI vẫn để lượt ghi danh đứng ở `IN_PROGRESS` —
    // khoá không bao giờ hoàn thành, chứng nhận không có gì để cấp, và không ai tự
    // nhận ra: người tick thấy ô đã tích, người học thấy bài đã xong.
    expect(chiMa(doc("lib/elearning/equivalence.ts"))).toContain(
      "cuonKhoaSauKhiXongBai",
    );
  });
});

describe("🔴 cron nhắc phải GỬI THẬT, không chỉ ghi sổ", () => {
  const cron = doc("lib/elearning/cron-reminders.ts");

  it("có gọi đường gửi thông báo", () => {
    // Bản trước chỉ `update` dòng nhắc thành `SENT` rồi return. Cách hỏng của nó im
    // lặng và KHÔNG TỰ SỬA: sổ đã `SENT` nên lần quét sau bỏ qua — người học không
    // nhận một lời nhắc nào cho cả bảy mốc, còn báo cáo vận hành thấy "đã gửi" đủ.
    expect(chiMa(cron)).toContain("notifyStaff");
  });

  it("KHÔNG ghi cứng kênh EMAIL khi không gửi email", () => {
    // Một dòng sổ nói dối về việc đã làm — và nó là dòng người vận hành mở ra khi
    // người học báo "tôi không nhận được gì".
    expect(chiMa(cron)).not.toContain('["IN_APP", "EMAIL"]');
  });

  it("gửi được cho 0 người thì KHÔNG đánh dấu đã gửi", () => {
    expect(chiMa(cron)).toContain('kenh.length > 0 ? "SENT" : "PENDING"');
  });
});
