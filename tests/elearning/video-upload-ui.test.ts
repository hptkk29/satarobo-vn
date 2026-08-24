// @vitest-environment node
/**
 * EL-10 — màn tải video + đường xác minh sau khi tải.
 *
 * Đây là mảnh nối trọn chuỗi EL-10. Ba thứ canh ở đây đều là "hỏng im lặng, tốn
 * tiền" hoặc "chặn nhầm người dùng".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const doc = (p: string) => readFileSync(join(ROOT, p), "utf8");

const UP = doc("app/(elearning)/elearning/soan/_components/video-uploader.tsx");
const XM = doc("app/api/elearning/media/xac-minh/route.ts");
const TRANG_SOAN = doc("app/(elearning)/elearning/soan/[lessonId]/page.tsx");
const TRANG_HOC = doc("app/(elearning)/elearning/hoc/[enrollmentId]/[lessonId]/page.tsx");

const chiMa = (src: string) =>
  src
    .split("\n")
    .filter((l) => {
      const t = l.trimStart();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

describe("lượt tải dở phải huỷ được, và có tiến độ", () => {
  it("có nút huỷ, và tự huỷ khi gặp lỗi", () => {
    // Bỏ lượt tải giữa chừng mà không gọi `huy` để lại các phần đã tải trên R2 —
    // R2 tính tiền chúng, và cron đêm chỉ dọn sau 24 giờ.
    expect(UP).toContain("Huỷ lượt tải");
    expect(chiMa(UP)).toContain('buoc: "huy"');
    expect(chiMa(UP)).toContain("if (dangHuy) await huy()");
  });

  it("có thanh tiến độ đếm theo SỐ PHẦN", () => {
    // Tệp 200MB qua mạng chậm kéo dài nhiều phút; không có tiến độ thì người soạn
    // không biết nó còn chạy hay đã treo, và họ sẽ bấm lại — tạo lượt tải thứ hai.
    expect(UP).toContain('role="progressbar"');
    expect(UP).toContain("Đang tải phần");
  });

  it("thanh tiến độ có thuộc tính cho trình đọc màn hình", () => {
    for (const a of ["aria-valuenow", "aria-valuemin", "aria-valuemax"]) {
      expect(UP, a).toContain(a);
    }
  });
});

describe("tải TUẦN TỰ, không mở 25 kết nối cùng lúc", () => {
  it("vòng lặp `for` tuần tự, không `Promise.all` trên các phần", () => {
    // Mạng của người soạn thường là mạng văn phòng dùng chung; mở 25 kết nối cùng
    // lúc làm chậm cả phòng.
    expect(chiMa(UP)).toContain("for (const l of ky.links)");
    expect(chiMa(UP)).not.toMatch(/Promise\.all\([\s\S]{0,80}links/);
  });

  it("thiếu ETag của một phần ⇒ báo lỗi, không hoàn tất", () => {
    // Hoàn tất với ETag rỗng là để R2 ghép một tệp thiếu phần.
    expect(UP).toContain("không nhận được mã xác nhận");
  });
});

describe("xác minh SAU khi tải là bước riêng, đọc từ TỆP", () => {
  it("màn tải gọi đường xác minh trước khi lưu bài", () => {
    const iXm = chiMa(UP).indexOf("/api/elearning/media/xac-minh");
    const iLuu = chiMa(UP).indexOf("luuBaiVideoAction(");
    expect(iXm).toBeGreaterThan(0);
    expect(iLuu).toBeGreaterThan(iXm);
  });

  it("thời lượng lưu vào bài là con số TỪ TỆP, không phải từ trình duyệt", () => {
    // Con số client khai có thể sai, hoặc bị sửa. Nó chỉ dùng chặn sớm.
    expect(chiMa(UP)).toContain("durationSec: Math.round(xm.data.durationSec)");
    expect(UP).toContain("KHÔNG phải con số cuối cùng");
  });

  it("đường xác minh dùng bộ đọc mp4 đã test, có TRẦN lượt đọc", () => {
    // Một tệp dị dạng không được làm hàm chạy mãi.
    expect(XM).toContain("docMp4");
    expect(XM).toContain("TRAN_LUOT_DOC");
  });

  it("đối chiếu LẠI chuẩn nộp bằng con số thật", () => {
    expect(XM).toContain("kiemChuanNopVideo");
  });

  it("khoá phải thuộc đúng bài đang soạn", () => {
    expect(XM).toContain("elearning/master/${lessonId}/");
    expect(XM).toContain('khoa.includes("..")');
  });

  it("`transformToByteArray` ở đây là CHẤP NHẬN ĐƯỢC — có ghi lý do", () => {
    // Khác đường phát: mỗi lượt chỉ đọc vài chục KB đến 4MB, có trần, và không
    // nằm trên đường người học xem.
    expect(XM).toContain("transformToByteArray");
    expect(XM).toContain("ĐƯỢC dùng ở ĐÂY, khác đường phát");
  });
});

describe("mở màn SOẠN cho video KHÔNG mở màn HỌC", () => {
  it("màn soạn nhận bài `VIDEO`", () => {
    expect(TRANG_SOAN).toContain('lesson.kind === "VIDEO"');
    expect(TRANG_SOAN).toContain("VideoUploader");
  });

  it("trang HỌC vẫn chặn bài khác READ cho tới khi EL-11 có trình phát", () => {
    // Gỡ chặn sớm là đưa người học tới một trang trắng.
    expect(TRANG_HOC).toContain('lesson.kind !== "READ"');
  });

  it("màn soạn nói rõ trình phát thuộc ticket sau", () => {
    // Người soạn tải tệp xong mà người học chưa xem được thì phải biết vì sao,
    // không thì họ báo lỗi.
    expect(TRANG_SOAN).toContain("EL-11");
  });
});

describe("tuân luật route e-learning", () => {
  it("đường xác minh không `NextResponse.json` trần", () => {
    expect(chiMa(XM)).not.toContain("NextResponse.json");
    expect(XM).toContain('from "@/lib/api/response"');
  });

  it("gác quyền soạn nội dung", () => {
    expect(XM).toContain('can(actor, "elearning:content:author")');
  });
});
