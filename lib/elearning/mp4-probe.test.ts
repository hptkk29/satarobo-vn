// @vitest-environment node
/**
 * EL-10 — đọc header MP4.
 *
 * Case đắt nhất là nhóm "`moov` ở CUỐI tệp". Rất nhiều bộ xuất video để `moov` ở
 * cuối (không bật fast-start); chỉ đọc đầu tệp thì với những tệp đó ta không tìm
 * thấy gì và kết luận nhầm là "tệp hỏng" — người soạn nhận một thông báo sai về
 * một tệp hoàn toàn tốt, và không có cách nào tự thoát.
 */
import { describe, it, expect } from "vitest";
import { docMp4, kiemCodec, THONG_BAO_CODEC } from "@/lib/elearning/mp4-probe";

// ── Dựng byte MP4 tối thiểu ────────────────────────────────────────────────

const chu = (s: string) => [...s].map((c) => c.charCodeAt(0));

function hop(ten: string, noiDung: number[]): number[] {
  const size = 8 + noiDung.length;
  return [
    (size >>> 24) & 255,
    (size >>> 16) & 255,
    (size >>> 8) & 255,
    size & 255,
    ...chu(ten),
    ...noiDung,
  ];
}

const so32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

const ftyp = (brand = "isom") => hop("ftyp", [...chu(brand), ...so32(512), ...chu("mp42")]);

/** mvhd bản 0: version+flags(4) created(4) modified(4) timescale(4) duration(4) */
const mvhd = (timescale: number, duration: number) =>
  hop("mvhd", [...so32(0), ...so32(0), ...so32(0), ...so32(timescale), ...so32(duration)]);

const stsd = (fourcc: string) =>
  hop("stsd", [...so32(0), ...so32(1), ...so32(16), ...chu(fourcc), 0, 0, 0, 0]);

/** hdlr: version+flags(4) pre_defined(4) handler_type(4) reserved(12) name */
const hdlr = (loai: "vide" | "soun") =>
  hop("hdlr", [...so32(0), ...so32(0), ...chu(loai), ...new Array(12).fill(0), 0]);

/**
 * `trak` THẬT luôn có `hdlr` nói nó là hình hay tiếng.
 *
 * ⚠️ Bản đầu của fixture bỏ `hdlr` cho gọn — và vì thế nó dựng ra một tệp mà mp4
 * thật không bao giờ giống. Test xanh trên tệp giả đó không nói được gì về tệp
 * thật; ở đây nó còn che mất chính con bug đang đi tìm.
 */
const trak = (fourcc: string, loai: "vide" | "soun" = "vide") =>
  hop("trak", hop("mdia", [...hdlr(loai), ...hop("minf", hop("stbl", stsd(fourcc)))]));

const LOAI_CUA: Record<string, "vide" | "soun"> = {
  avc1: "vide",
  avc3: "vide",
  hev1: "vide",
  hvc1: "vide",
  mp4a: "soun",
  "ac-3": "soun",
};

const moov = (o: { timescale?: number; duration?: number; codecs?: string[] } = {}) =>
  hop("moov", [
    ...mvhd(o.timescale ?? 1000, o.duration ?? 300_000),
    ...(o.codecs ?? ["avc1", "mp4a"]).flatMap((c) => trak(c, LOAI_CUA[c] ?? "vide")),
  ]);

const mdat = (n: number) => hop("mdat", new Array(n).fill(0));

const bytes = (...ds: number[][]) => new Uint8Array(ds.flat());

// ── Test ───────────────────────────────────────────────────────────────────

describe("`moov` ở ĐẦU tệp (fast-start)", () => {
  it("đọc ra thời lượng và codec trong một lượt", () => {
    const b = bytes(ftyp(), moov(), mdat(100));
    const r = docMp4(b, 0, b.length);
    expect(r.xong).toBe(true);
    if (!r.xong) return;
    expect(r.durationSec).toBe(300);
    expect(r.videoCodec).toBe("avc1");
    expect(r.audioCodec).toBe("mp4a");
    expect(r.brand).toBe("isom");
  });

  it("mvhd bản 0 chia đúng theo timescale", () => {
    const b = bytes(ftyp(), moov({ timescale: 600, duration: 9000 }));
    const r = docMp4(b, 0, b.length);
    if (!r.xong) throw new Error("phải đọc xong");
    expect(r.durationSec).toBe(15);
  });

  it("timescale bằng 0 ⇒ thời lượng `null`, không chia cho 0", () => {
    const b = bytes(ftyp(), moov({ timescale: 0, duration: 100 }));
    const r = docMp4(b, 0, b.length);
    if (!r.xong) throw new Error("phải đọc xong");
    expect(r.durationSec).toBeNull();
  });
});

describe("`moov` ở CUỐI tệp — nhánh dễ bỏ quên nhất", () => {
  it("đọc đầu tệp mà chưa thấy `moov` ⇒ ĐÒI ĐỌC ĐUÔI, không kết luận hỏng", () => {
    // Bỏ nhánh này là báo "tệp hỏng" cho mọi tệp xuất ra không bật fast-start —
    // người soạn nhận thông báo sai về một tệp hoàn toàn tốt.
    const full = bytes(ftyp(), mdat(5000), moov());
    const dau = full.slice(0, 200);
    const r = docMp4(dau, 0, full.length);
    expect(r.xong).toBe(false);
    if (r.xong || "loi" in r) throw new Error("phải đòi đọc thêm");
    expect(r.canDoc.tu).toBeGreaterThan(0);
  });

  it("đọc tiếp đúng khoảng được chỉ ⇒ ra kết quả", () => {
    const full = bytes(ftyp(), mdat(5000), moov());
    let r = docMp4(full.slice(0, 200), 0, full.length);
    for (let i = 0; i < 5 && !r.xong && !("loi" in r); i += 1) {
      const { tu, dai } = r.canDoc;
      r = docMp4(full.slice(tu, tu + dai), tu, full.length);
    }
    expect(r.xong).toBe(true);
    if (!r.xong) return;
    expect(r.durationSec).toBe(300);
  });
});

describe("từ chối tệp KHÔNG phải MP4", () => {
  it("thiếu hộp `ftyp` ở đầu ⇒ KHÔNG_PHẢI_MP4", () => {
    // Đây chính là trường hợp đổi tên tệp cho lọt cổng: đuôi `.mp4` nhưng ruột
    // là thứ khác.
    const b = bytes(hop("junk", chu("xxxx")), mdat(50));
    const r = docMp4(b, 0, b.length);
    expect(r.xong).toBe(false);
    if (r.xong || !("loi" in r)) throw new Error("phải báo lỗi");
    expect(r.loi).toBe("KHONG_PHAI_MP4");
  });

  it("quá ngắn ⇒ đòi đọc thêm chứ không kết luận vội", () => {
    const r = docMp4(new Uint8Array([0, 0, 0, 1]), 0, 1000);
    expect(r.xong).toBe(false);
    if (r.xong || "loi" in r) throw new Error("phải đòi đọc thêm");
  });

  it("đọc hết tệp mà không có `moov` ⇒ HỎNG", () => {
    const b = bytes(ftyp(), mdat(50));
    const r = docMp4(b, 0, b.length);
    expect(r.xong).toBe(false);
    if (r.xong || !("loi" in r)) throw new Error("phải báo lỗi");
    expect(r.loi).toBe("HONG");
  });
});

describe("đối chiếu codec với chuẩn", () => {
  const doc = (codecs: string[]) => {
    const b = bytes(ftyp(), moov({ codecs }));
    const r = docMp4(b, 0, b.length);
    if (!r.xong) throw new Error("phải đọc xong");
    return r;
  };

  it("H.264 + AAC ⇒ đạt", () => {
    expect(kiemCodec(doc(["avc1", "mp4a"])).ok).toBe(true);
  });

  it("video KHÔNG phải H.264 ⇒ từ chối, nói rõ phải xuất lại bằng gì", () => {
    const r = kiemCodec(doc(["hev1", "mp4a"]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("CODEC_VIDEO_SAI");
    expect(THONG_BAO_CODEC[r.code]).toContain("H.264");
  });

  it("âm thanh không phải AAC ⇒ từ chối", () => {
    const r = kiemCodec(doc(["avc1", "ac-3"]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("CODEC_AUDIO_SAI");
  });

  it("video KHÔNG CÓ TIẾNG vẫn đạt", () => {
    // Video minh hoạ không lời là chuyện bình thường; đòi phải có tiếng là chặn
    // một loại nội dung hợp lệ.
    expect(kiemCodec(doc(["avc1"])).ok).toBe(true);
  });

  it("KHÔNG đọc được codec ⇒ TỪ CHỐI, không cho qua", () => {
    // Cho qua khi không đọc được nghĩa là ai muốn lách chỉ cần nộp tệp mà bộ đọc
    // không hiểu.
    const r = kiemCodec({
      xong: true,
      brand: "isom",
      durationSec: 10,
      videoCodec: null,
      audioCodec: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("KHONG_DOC_DUOC");
  });

  it("mọi mã lỗi đều có câu tiếng Việt nói phải làm gì", () => {
    for (const c of ["CODEC_VIDEO_SAI", "CODEC_AUDIO_SAI", "KHONG_DOC_DUOC"] as const) {
      expect(THONG_BAO_CODEC[c], c).toBeTruthy();
      expect(THONG_BAO_CODEC[c].length, c).toBeGreaterThan(20);
    }
  });
});

describe("không treo trên tệp dị dạng", () => {
  it("hộp khai kích thước < 8 ⇒ dừng, không lặp vô hạn", () => {
    const b = bytes(ftyp(), [0, 0, 0, 2, ...chu("bad0")]);
    const r = docMp4(b, 0, b.length);
    expect(r.xong).toBe(false);
  });

  it("lồng sâu bất thường không làm đệ quy chạy mãi", () => {
    let noi = stsd("avc1");
    for (let i = 0; i < 30; i += 1) noi = hop("stbl", noi);
    const b = bytes(ftyp(), hop("moov", [...mvhd(1000, 1000), ...hop("trak", noi)]));
    const r = docMp4(b, 0, b.length);
    expect(r.xong).toBe(true);
  });
});
