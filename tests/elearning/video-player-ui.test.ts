// @vitest-environment node
/**
 * EL-11 — trình phát video bài học.
 *
 * Trình phát KHÔNG phải cổng bảo mật; cổng nằm ở server. Nhưng nó là chỗ ba loại
 * hỏng im lặng hay xảy ra:
 *  · mất dữ liệu đo (nhịp cuối không gửi được, khoảng xem bay khi mạng chớp),
 *  · chặn nhầm người đang học thật,
 *  · và "đã chặn ở client rồi" trở thành lý do gỡ cổng ở server.
 *
 * ⚠️ Canh HÀNH VI, không canh câu chữ trong chú thích (quy ước 19) — guard canh
 * chữ vỡ ngay lần đầu ai đó viết lại câu văn, và vài lần báo động giả là người ta
 * học được cách xoá dòng assert.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const doc = (p: string) => readFileSync(join(ROOT, p), "utf8");

const PLAYER = doc("app/(elearning)/elearning/hoc/_components/video-player.tsx");
const TRANG = doc(
  "app/(elearning)/elearning/hoc/[enrollmentId]/[lessonId]/page.tsx",
);

const chiMa = (src: string) =>
  src
    .split("\n")
    .filter((l) => {
      const t = l.trimStart();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

const MA = chiMa(PLAYER);
const MA_TRANG = chiMa(TRANG);

describe("vé phát — ký ở TRANG, không ở một API riêng", () => {
  it("trang bài học là nơi duy nhất gọi `kyVeMedia`", () => {
    // Trang này là chỗ duy nhất đã đi qua trọn chuỗi cổng (sở hữu → chính sách →
    // cổng nội dung), nên là chỗ duy nhất đủ tư cách nói "người này được xem bài
    // này". Ký ở một API riêng là dựng lại cả chuỗi đó lần thứ hai — và bản thứ
    // hai sẽ lệch, im lặng, theo hướng dễ dãi.
    expect(MA_TRANG).toContain("kyVeMedia(");
    expect(MA).not.toContain("kyVeMedia");
  });

  it("đường phát video MANG vé", () => {
    // Thiếu vé thì route phát trả 403 và khung hình đen — không có gì báo cho
    // người học biết vì sao.
    expect(MA).toContain("/api/elearning/media/");
    expect(MA).toContain("?ve=");
  });

  it("vé đi qua `encodeURIComponent`", () => {
    // Vé là base64url + dấu chấm; không mã hoá thì một ngày đổi cách ký sang
    // base64 thường là dấu `+` biến thành khoảng trắng và MỌI vé hỏng cùng lúc.
    expect(MA).toContain("encodeURIComponent(props.ve)");
  });
});

describe("nhịp cuối lúc rời trang", () => {
  it("dùng `sendBeacon`, KHÔNG dùng `fetch`", () => {
    // Trình duyệt huỷ mọi `fetch` đang bay khi unload. Không có `sendBeacon` thì
    // khoảng xem cuối của mỗi phiên luôn mất — với người xem một mạch rồi đóng
    // tab thì mất gần hết.
    expect(MA).toContain("navigator.sendBeacon");
    expect(MA).toContain("pagehide");
  });

  it("nghe `pagehide` chứ không `beforeunload`", () => {
    // `beforeunload` không bắn trên Safari iOS và bị bfcache bỏ qua — đúng nhóm
    // thiết bị người học hay dùng nhất.
    expect(MA).not.toContain("beforeunload");
  });
});

describe("đo đúng — không cộng thời gian tab nền, không mất khoảng khi mạng chớp", () => {
  it("kiểm `visibilityState` TRONG callback mỗi nhịp", () => {
    // Có trình duyệt vẫn chạy interval ở tab nền. Chỉ bật/tắt interval theo sự
    // kiện thì thời gian tab nền vẫn được cộng — đo sai theo hướng có lợi cho
    // người bỏ tab đó rồi đi làm việc khác.
    const i = MA.indexOf("setInterval");
    const than = MA.slice(i, i + 500);
    expect(than).toContain("visibilityState");
  });

  it("rời tab thì DỪNG PHÁT", () => {
    expect(MA).toContain("visibilitychange");
    expect(MA).toContain("pause()");
  });

  it("mốc `batDau` chỉ nhích lên SAU khi server nhận", () => {
    // Nhích trước khi gửi thì một nhịp lỗi mạng làm mất luôn khoảng đó, và người
    // học phải xem lại đoạn mình vừa xem — không ai hiểu vì sao.
    // So với lệnh GỬI, không so với khối `catch`: so với `catch` thì dời mốc lên
    // trước `fetch` vẫn xanh — đúng con bug đang muốn chặn.
    const iGui = MA.indexOf("await fetch(API");
    const iNhich = MA.indexOf("batDau.current = den;");
    expect(iGui).toBeGreaterThan(0);
    expect(iNhich).toBeGreaterThan(iGui);
  });

  it("có chốt chặn nhịp chồng nhịp", () => {
    // Mạng chậm làm nhịp sau chồng lên nhịp trước; hai nhịp cùng `seq` thì server
    // bỏ một cái và số đo hụt đi.
    expect(MA).toContain("dangGui.current");
  });
});

describe("bốn rào MỀM của trình phát", () => {
  it("khoá tốc độ về trần của lượt giao", () => {
    expect(MA).toContain("onRateChange");
    expect(MA).toContain("playbackRate = props.tocDoToiDa");
  });

  it("kéo con trỏ về mốc đã xem khi tua vượt", () => {
    // Để họ tua thoải mái rồi mới báo lỗi là cho họ xem một đoạn sẽ không được
    // tính — tệ hơn cả việc chặn.
    expect(MA).toContain("onSeeking");
    expect(MA).toContain("v.currentTime = bienDaXem.current");
  });

  it("ẩn nút tải và chặn hình-trong-hình", () => {
    expect(MA).toContain("nodownload");
    expect(MA).toContain("disablePictureInPicture");
  });

  it("trần tua ở client vẫn CÓ DUNG SAI, không chặn sát", () => {
    // Chặn sát là chặn nhầm liên tục: trình phát báo vị trí lệch vài trăm mili
    // giây là chuyện thường.
    expect(MA).toContain("bienDaXem.current + 2");
  });
});

describe("hình mờ", () => {
  it("mang ĐỊNH DANH người xem, không phải tên khoá", () => {
    // Mục đích không phải chặn quay màn hình — không cơ chế web nào chặn được —
    // mà là làm bản quay lộ ra ai đã quay.
    expect(MA_TRANG).toContain("session.user.email");
    expect(MA).toContain("props.nhanMo");
  });

  it("nằm NGOÀI thẻ video và không bắt chuột", () => {
    // Đặt trong thẻ `<video>` thì trình duyệt không vẽ; bắt chuột thì nó che mất
    // nút điều khiển và người học không bấm được gì.
    expect(MA).toContain("pointer-events-none");
    const iVideo = MA.indexOf("</video>");
    const iMo = MA.indexOf("props.nhanMo");
    expect(iMo).toBeGreaterThan(iVideo);
  });

  it("ĐỔI CHỖ theo chu kỳ", () => {
    // Hình mờ đứng yên bị cắt khỏi khung hình trong vài giây.
    expect(MA).toContain("setMoGoc");
    expect(MA).toContain("viTriMo");
  });
});

describe("xử lỗi theo hợp đồng EL-12a", () => {
  it("tách 409 (xử xong rồi xem tiếp) khỏi các mã dừng hẳn", () => {
    // Gộp lại thì trình phát hoặc thử lại mãi một lỗi không thể tự khỏi, hoặc bỏ
    // cuộc trên một lỗi chỉ cần bấm một nút.
    expect(MA).toContain("res.status === 409");
  });

  it("SEEK_BLOCKED thì kéo con trỏ về, không để người học kẹt", () => {
    // Không kéo về thì họ ngồi ở chỗ mà MỌI nhịp tiếp theo đều bị từ chối.
    expect(MA).toContain("SEEK_BLOCKED");
  });

  it("mất mạng thì KHÔNG dừng phát và KHÔNG báo lỗi", () => {
    // Mạng chớp là chuyện thường; dừng video mỗi lần chớp là biến một sự cố
    // thoáng qua thành trải nghiệm hỏng.
    const i = MA.indexOf("} catch {");
    const than = MA.slice(i, i + 200);
    expect(than).not.toContain("setLoi");
    expect(than).not.toContain("pause()");
  });

  it("câu hỏi tập trung thì DỪNG video và hiện lớp phủ", () => {
    expect(MA).toContain("setThachThuc(json.data.thachThuc)");
    expect(MA).toContain("thachThuc.cauHoi");
  });
});

describe("trang bài học", () => {
  it("bài VIDEO chưa có tệp ⇒ nói thẳng, không hiện khung phát rỗng", () => {
    // Khung rỗng làm người học tưởng máy mình hỏng và họ đi báo sai chỗ.
    expect(MA_TRANG).toContain("lesson.videoKey");
    expect(MA_TRANG).toContain("Bài này chưa có video");
  });

  it("hai cột cơ chế đọc TỪ LƯỢT GIAO, không mặc định ở trình phát", () => {
    // Mặc định "cho tua" ở client là vô hiệu hoá cơ chế cho mọi lượt giao mà
    // không ai thấy.
    expect(MA_TRANG).toContain("blockSeek");
    expect(MA_TRANG).toContain("maxPlaybackRate");
  });
});
