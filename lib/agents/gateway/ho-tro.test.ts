// @vitest-environment node
// Các hàm phụ THUẦN của cổng: IP tin cậy, đọc thân yêu cầu (bước 2), giờ VN, trường nội bộ.
import { describe, it, expect } from "vitest";
import { chuanHoaIp, ipDuocPhep, ipNguonTinCay } from "./ip";
import { chanLuTheoIp, coTruongNoiBo, docThan, phanTichThanJson, TOI_DA_THAN_BYTE } from "./pipeline";
import { LoiCong } from "./loi";
import { dauNgayVN, gioVN, ngayVN } from "./thoi-gian";

const hdr = (o: Record<string, string>) => new Headers(o);

describe("[AG-IP-01] IP nguồn cho danh sách được phép — fail closed, không tin header client", () => {
  const VERCEL = { VERCEL: "1", VERCEL_ENV: "preview" };
  it("trên Vercel CHỈ tin x-vercel-forwarded-for", () => {
    expect(ipNguonTinCay(hdr({ "x-vercel-forwarded-for": "203.0.113.7" }), VERCEL)).toBe("203.0.113.7");
  });
  it("trên Vercel: x-forwarded-for / x-real-ip / x-e2e-client-ip GIẢ bị bỏ qua ⇒ null (từ chối)", () => {
    expect(
      ipNguonTinCay(
        hdr({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "203.0.113.7", "x-e2e-client-ip": "203.0.113.7" }),
        VERCEL,
      ),
    ).toBeNull();
  });
  it("ngoài Vercel: nhận x-e2e-client-ip rồi phần tử CUỐI của XFF", () => {
    expect(ipNguonTinCay(hdr({ "x-e2e-client-ip": "10.0.0.1" }), {})).toBe("10.0.0.1");
    expect(ipNguonTinCay(hdr({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" }), {})).toBe("203.0.113.7");
    expect(ipNguonTinCay(hdr({}), {})).toBeNull();
  });
  it("chuẩn hoá: IPv4 ánh xạ IPv6, chữ hoa IPv6; rác ⇒ null", () => {
    expect(chuanHoaIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(chuanHoaIp(" 2001:DB8::1 ")).toBe("2001:db8::1");
    expect(chuanHoaIp("999.1.1.1")).toBeNull();
    expect(chuanHoaIp("01.1.1.1")).toBeNull();
    expect(chuanHoaIp("abc")).toBeNull();
  });
  it("so khớp ĐÚNG, không so tiền tố; IP null không bao giờ được phép", () => {
    expect(ipDuocPhep("203.0.113.7", ["203.0.113.7"])).toBe(true);
    expect(ipDuocPhep("203.0.113.70", ["203.0.113.7"])).toBe(false);
    expect(ipDuocPhep(null, ["203.0.113.7"])).toBe(false);
    expect(ipDuocPhep("203.0.113.7", [])).toBe(false);
  });
});

function req(body: string, headers: Record<string, string>): Request {
  return new Request("http://localhost/x", { method: "POST", headers, body });
}

async function loiCua(p: Promise<unknown>): Promise<LoiCong> {
  try {
    await p;
  } catch (e) {
    if (e instanceof LoiCong) return e;
    throw e;
  }
  throw new Error("phải ném LoiCong");
}

describe("[AG-B2-01] bước 2 — hình thức yêu cầu", () => {
  it("sai Content-Type → 415", async () => {
    const l = await loiCua(docThan(req("{}", { "content-type": "text/plain" }), "application/json", 100, {}));
    expect([l.ma, l.http]).toEqual(["YEU_CAU_SAI", 415]);
  });
  it("khai content-length vượt trần → 413 (không đọc thân)", async () => {
    const l = await loiCua(
      docThan(req("{}", { "content-type": "application/json", "content-length": "999999" }), "application/json", 100, {}),
    );
    expect(l.http).toBe(413);
  });
  it("thân THẬT vượt trần dù không khai content-length → 413", async () => {
    const l = await loiCua(docThan(req("x".repeat(101), { "content-type": "application/json" }), "application/json", 100, {}));
    expect(l.http).toBe(413);
  });
  it("trên Vercel mà x-forwarded-proto là http → 400", async () => {
    const l = await loiCua(
      docThan(req("{}", { "content-type": "application/json", "x-forwarded-proto": "http" }), "application/json", 100, { VERCEL: "1" }),
    );
    expect(l.http).toBe(400);
  });
  it("hợp lệ → trả thân; 'application/json; charset=utf-8' vẫn nhận", async () => {
    expect(await docThan(req("{}", { "content-type": "application/json; charset=utf-8" }), "application/json", 100, {})).toBe("{}");
  });
  it("trần mặc định là 256 KB (spec §5.6)", () => {
    expect(TOI_DA_THAN_BYTE).toBe(256 * 1024);
  });
});

describe("[AG-B2-02] vỏ JSON { tham_so, agent_run_id }", () => {
  it("thân rỗng → tham_so {}", () => {
    expect(phanTichThanJson("")).toEqual({ thamSo: {}, agentRunId: null });
  });
  it("khoá lạ ở vỏ → 400 kèm tên khoá", () => {
    const l = (() => {
      try {
        phanTichThanJson(JSON.stringify({ tham_so: {}, xoa: true }));
      } catch (e) {
        return e as LoiCong;
      }
      throw new Error("phải ném");
    })();
    expect(l.http).toBe(400);
    expect(l.truongSai).toEqual(["xoa"]);
  });
  it("JSON hỏng / mảng / null → 400", () => {
    for (const x of ["{", "[]", "null", "3"]) expect(() => phanTichThanJson(x)).toThrow(LoiCong);
  });
  it("agent_run_id sai khuôn → 400; đúng khuôn → giữ lại", () => {
    expect(() => phanTichThanJson(JSON.stringify({ agent_run_id: "có dấu cách" }))).toThrow(LoiCong);
    expect(phanTichThanJson(JSON.stringify({ agent_run_id: "run_01:a-b" })).agentRunId).toBe("run_01:a-b");
  });
});

describe("[AG-LU-01] chặn lũ theo IP (rà bảo mật 25/09)", () => {
  it("vượt trần thì trả số giây phải chờ; IP khác không bị ảnh hưởng", async () => {
    const tien = `test-lu-${process.pid}`;
    expect(await chanLuTheoIp(tien, "203.0.113.50", 2)).toBeNull();
    expect(await chanLuTheoIp(tien, "203.0.113.50", 2)).toBeNull();
    const cho = await chanLuTheoIp(tien, "203.0.113.50", 2);
    expect(cho).not.toBeNull();
    expect(cho!).toBeGreaterThanOrEqual(1);
    expect(await chanLuTheoIp(tien, "203.0.113.51", 2)).toBeNull();
  });
  it("IP không xác định dùng CHUNG một khoá (không lách trần bằng cách giấu IP)", async () => {
    const tien = `test-lu-null-${process.pid}`;
    expect(await chanLuTheoIp(tien, null, 1)).toBeNull();
    expect(await chanLuTheoIp(tien, null, 1)).not.toBeNull();
  });
});

describe("[AG-B12-01] trường nội bộ '_…' không bao giờ lọt ra", () => {
  it("phát hiện ở mọi tầng lồng nhau", () => {
    expect(coTruongNoiBo([{ a: 1, b: { _c: 2 } }])).toBe(true);
    expect(coTruongNoiBo({ _id: 1 })).toBe(true);
    expect(coTruongNoiBo([{ a: [{ b: 1 }] }])).toBe(false);
    expect(coTruongNoiBo(null)).toBe(false);
  });
});

describe("[AG-TG-01] thời gian theo hợp đồng (+07:00, YYYY-MM-DD)", () => {
  it("UTC → giờ VN có +07:00, bỏ mili giây", () => {
    expect(gioVN(new Date("2026-09-25T02:00:00.123Z"))).toBe("2026-09-25T09:00:00+07:00");
  });
  it("23:30 UTC ngày 24 là ngày 25 ở VN; đầu ngày VN đúng mốc", () => {
    const d = new Date("2026-09-24T23:30:00Z");
    expect(ngayVN(d)).toBe("2026-09-25");
    expect(dauNgayVN(d).toISOString()).toBe("2026-09-24T17:00:00.000Z");
  });
});
