// @vitest-environment node
/**
 * N-4 — "`Lead.lastActivityAt` không phản ánh đủ hoạt động."
 *
 * Đo được trên mã trước ticket này: có **13** chỗ tạo `LeadActivity`, chỉ **3**
 * chỗ (đều nằm trong `app/(admin)/admin/leads/actions.ts`) cập nhật
 * `Lead.lastActivityAt`. Mười chỗ còn lại — tự chia lead, gán tay, chia lại khi
 * sale nghỉ, ghi nhận tiền, phiếu trùng SĐT, phiếu thêm con, bàn giao, đổi
 * trạng thái — ghi hoạt động xong để nguyên đồng hồ.
 *
 * Hệ quả KHÔNG nằm ở "code xấu" mà ở con số QLCS đọc:
 *  · cột "số ngày chưa tiếp cận lại" (C-05) đọc ra số SAI, và sai theo cả hai
 *    chiều — lead vừa được chăm vẫn hiện "treo 40 ngày" (đồng hồ chưa bao giờ
 *    chạy), còn ngưỡng vàng ≥ 2 / đỏ ≥ 7 ngày (chốt 24/08/2026) báo động nhầm;
 *  · `isLeadIdle` (`lib/crm/sla.ts:100`) rơi ngược về `createdAt` ⇒ che mất
 *    lead ĐÃ có hoạt động thật.
 *
 * Chốt của ticket — y hệt cách C-07 chữa vết trạng thái: **MỘT đường ghi duy
 * nhất** (`recordLeadActivity`) ghi cả dòng `LeadActivity` lẫn cú bump
 * `lastActivityAt` TRONG CÙNG transaction, cộng một test chặn nguồn để chỗ thứ
 * 14 không mọc ra tuần sau.
 *
 * ⚠️ Phần thứ hai của ticket: **`lastActivityAt` ≠ "đã tiếp cận khách"**. Máy tự
 * chia lead cũng là một dòng `LeadActivity`, nhưng đó không phải Sale gọi cho
 * phụ huynh. Danh sách loại nào được tính là "tiếp cận" CHƯA có quyết định của
 * chủ dự án ⇒ tách hẳn sang `activity-clock.ts` dưới dạng hàm THUẦN nhận danh
 * sách TRUYỀN VÀO, để lúc chốt chỉ sửa đúng một hằng số.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  LEAD_OUTREACH_COUNTS_SYSTEM_NOTE,
  LEAD_OUTREACH_TYPES,
  isLeadOutreach,
  isSystemWrittenActivity,
  lastLeadOutreachAt,
} from "./activity-clock";
import { recordLeadActivity } from "./activity-write";

const goc = process.cwd();
const doc = (p: string) => fs.readFileSync(path.join(goc, p), "utf8");
/** Bỏ chú thích trước khi quét: chú thích GIẢI THÍCH lỗi cũ có nhắc đúng các chuỗi này. */
const boChuThich = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

// ─── Phần 1: đường GHI — một hàm, hai dòng, cùng transaction ─────────────────

const taoMock = () => {
  const create = vi.fn();
  const update = vi.fn();
  const tx = { leadActivity: { create }, lead: { update } } as never;
  return { create, update, tx };
};

describe("[N-4] recordLeadActivity — ghi hoạt động là bump đồng hồ, không tách rời", () => {
  let m: ReturnType<typeof taoMock>;
  const MOC = new Date("2026-08-25T03:00:00.000Z");

  beforeEach(() => {
    m = taoMock();
    m.create.mockResolvedValue({ id: "act-1", createdAt: MOC });
    m.update.mockResolvedValue({ id: "lead-1" });
  });

  it("ghi ĐỦ hai thứ: dòng hoạt động + cú bump `lastActivityAt`", async () => {
    await recordLeadActivity({
      tx: m.tx,
      leadId: "lead-1",
      actorId: "u-1",
      actorName: "Sale CS1",
      type: "CALL",
      content: "Gọi lần 1, phụ huynh bận",
    });

    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.update.mock.calls[0][0].where).toEqual({ id: "lead-1" });
  });

  it("🔴 đồng hồ lấy ĐÚNG mốc của dòng vừa ghi, không lấy `new Date()` phía app", async () => {
    // Backfill của N-4 so `lastActivityAt` với `MAX(LeadActivity.createdAt)`.
    // Lấy đồng hồ app thì hai số lệch nhau vài mili-giây trên MỌI dòng ⇒ lần
    // đối soát nào cũng báo "lệch" và không phân biệt được lệch thật.
    await recordLeadActivity({
      tx: m.tx,
      leadId: "lead-1",
      actorId: null,
      actorName: "Hệ thống",
      type: "NOTE",
      content: "Tự động chia cho Sale A",
    });

    expect(m.update.mock.calls[0][0].data).toEqual({ lastActivityAt: MOC });
  });

  it("🔴 cả hai đi CÙNG transaction mà chỗ gọi đang mở", async () => {
    // Bump ngoài transaction thì lượt ghi hoạt động rollback mà đồng hồ vẫn
    // nhảy — đúng loại sai làm lead treo "hết treo" mà không ai biết vì sao.
    const khac = taoMock();
    await recordLeadActivity({
      tx: m.tx,
      leadId: "lead-1",
      actorName: "Sale CS1",
      type: "MESSAGE",
      content: "Nhắn Zalo",
    });

    expect(khac.create).not.toHaveBeenCalled();
    expect(khac.update).not.toHaveBeenCalled();
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.update).toHaveBeenCalledTimes(1);
  });

  it("KHÔNG nuốt lỗi bump — hỏng thì cả lượt ghi phải đổ", async () => {
    m.update.mockRejectedValue(new Error("update chết"));

    await expect(
      recordLeadActivity({
        tx: m.tx,
        leadId: "lead-1",
        actorName: "Hệ thống",
        type: "NOTE",
        content: "x",
      }),
    ).rejects.toThrow();
  });

  it("`metadata` chỉ ghi khi chỗ gọi có truyền — không đè null lên dòng cũ", async () => {
    await recordLeadActivity({
      tx: m.tx,
      leadId: "lead-1",
      actorName: "Hệ thống",
      type: "NOTE",
      content: "x",
    });
    expect(m.create.mock.calls[0][0].data).not.toHaveProperty("metadata");

    m.create.mockClear();
    await recordLeadActivity({
      tx: m.tx,
      leadId: "lead-1",
      actorName: "Hệ thống",
      type: "NOTE",
      content: "x",
      metadata: { system: true },
    });
    expect(m.create.mock.calls[0][0].data.metadata).toEqual({ system: true });
  });

  it("`actorId` bỏ trống → null (đường máy), không rơi vào `undefined` im lặng", async () => {
    await recordLeadActivity({
      tx: m.tx,
      leadId: "lead-1",
      actorName: "Hệ thống (web)",
      type: "NOTE",
      content: "[Trùng SĐT] …",
    });

    expect(m.create.mock.calls[0][0].data.actorId).toBeNull();
  });
});

// ─── Phần 2: đồng hồ "đã TIẾP CẬN" — khái niệm THỨ HAI, chưa chốt ────────────

const act = (type: string, ngay: string, metadata?: unknown) =>
  ({ type, createdAt: new Date(ngay), metadata }) as never;

describe("[N-4] lastLeadOutreachAt — 'có hoạt động' ≠ 'đã tiếp cận khách'", () => {
  it("🔴 máy tự chia lead KHÔNG được tính là đã tiếp cận", () => {
    // Đây là cả lý do phải tách hai khái niệm: sau khi vá N-4, mọi dòng máy ghi
    // đều bump `lastActivityAt`. Dùng thẳng cột đó làm "lần tiếp cận gần nhất"
    // là dựng lại đúng cái làm-đẹp-giả mà spec `:54` cảnh báo, chỉ đổi nguyên do.
    const hoatDong = [
      act("CALL", "2026-08-01T02:00:00Z"),
      act("NOTE", "2026-08-20T02:00:00Z", { system: true }),
    ];

    expect(lastLeadOutreachAt(hoatDong, LEAD_OUTREACH_TYPES)).toEqual(
      new Date("2026-08-01T02:00:00Z"),
    );
  });

  it("ghi chú do NGƯỜI viết vẫn tính (không có dấu `system`)", () => {
    const hoatDong = [
      act("CALL", "2026-08-01T02:00:00Z"),
      act("NOTE", "2026-08-20T02:00:00Z"),
    ];

    expect(lastLeadOutreachAt(hoatDong, LEAD_OUTREACH_TYPES)).toEqual(
      new Date("2026-08-20T02:00:00Z"),
    );
  });

  it("🔴 danh sách loại là THAM SỐ — đổi danh sách là đổi kết quả, không phải sửa hàm", () => {
    // Chủ dự án chưa chốt loại nào tính. Test này ghim rằng lúc chốt chỉ phải
    // sửa hằng số, chứ không phải mở lại thân hàm.
    const hoatDong = [
      act("CALL", "2026-08-01T02:00:00Z"),
      act("EMAIL", "2026-08-10T02:00:00Z"),
    ];

    expect(lastLeadOutreachAt(hoatDong, ["CALL"] as never)).toEqual(
      new Date("2026-08-01T02:00:00Z"),
    );
    expect(lastLeadOutreachAt(hoatDong, ["CALL", "EMAIL"] as never)).toEqual(
      new Date("2026-08-10T02:00:00Z"),
    );
  });

  it("chưa tiếp cận lần nào → null (chỗ gọi tự quyết rơi về `createdAt` hay không)", () => {
    expect(lastLeadOutreachAt([], LEAD_OUTREACH_TYPES)).toBeNull();
    expect(
      lastLeadOutreachAt([act("STATUS_CHANGE", "2026-08-20T02:00:00Z")], LEAD_OUTREACH_TYPES),
    ).toBeNull();
  });

  it("lấy lần GẦN NHẤT bất kể thứ tự mảng đưa vào", () => {
    const hoatDong = [
      act("CALL", "2026-08-20T02:00:00Z"),
      act("MESSAGE", "2026-08-22T02:00:00Z"),
      act("CALL", "2026-08-05T02:00:00Z"),
    ];

    expect(lastLeadOutreachAt(hoatDong, LEAD_OUTREACH_TYPES)).toEqual(
      new Date("2026-08-22T02:00:00Z"),
    );
  });

  it("`isSystemWrittenActivity` chịu được metadata rác (null / chuỗi / mảng)", () => {
    expect(isSystemWrittenActivity(null)).toBe(false);
    expect(isSystemWrittenActivity("system")).toBe(false);
    expect(isSystemWrittenActivity([{ system: true }])).toBe(false);
    expect(isSystemWrittenActivity({ system: "true" })).toBe(false);
    expect(isSystemWrittenActivity({ system: true })).toBe(true);
  });

  it("bật cờ đếm-cả-dòng-máy thì dòng máy được tính (đường thoát nếu chủ dự án chốt ngược)", () => {
    const dongMay = act("NOTE", "2026-08-20T02:00:00Z", { system: true });

    expect(isLeadOutreach(dongMay, LEAD_OUTREACH_TYPES, true)).toBe(true);
    expect(isLeadOutreach(dongMay, LEAD_OUTREACH_TYPES, false)).toBe(false);
    // Mặc định = hằng số, không phải một giá trị thứ ba lẻ loi trong thân hàm.
    expect(isLeadOutreach(dongMay, LEAD_OUTREACH_TYPES)).toBe(
      LEAD_OUTREACH_COUNTS_SYSTEM_NOTE,
    );
  });
});

// ─── Phần 3: chốt chặn nguồn — không đường nào được tự tay ghi hoạt động ─────

describe("[N-4] chốt chặn nguồn — mọi đường ghi hoạt động đi qua một cửa", () => {
  const DUONG_GHI_HOAT_DONG = [
    "app/(admin)/admin/leads/actions.ts", // bật/tắt dùng chung · tạo lịch học thử · ghi nhật ký tay · bàn giao
    "lib/lead/assign.ts", // chia luân phiên · chia lại khi sale nghỉ
    "lib/lead/auto-assign.ts", // tự chia lead mới · gán tay
    "lib/lead/dedup.ts", // phiếu trùng SĐT
    "lib/lead/intake/ingest.ts", // thêm con · ghi nội dung phiếu trùng · gán theo mã NV
    "lib/lead/status-trail-write.ts", // C-07 — dòng timeline của lượt đổi trạng thái
  ];

  it.each(DUONG_GHI_HOAT_DONG)("%s đi qua `recordLeadActivity`", (p) => {
    expect(boChuThich(doc(p))).toContain("recordLeadActivity");
  });

  it("🔴 CHỈ `activity-write.ts` được tự tay tạo `LeadActivity`", () => {
    // Chính đây là bệnh của N-4: 13 chỗ ghi, mỗi chỗ tự quyết có bump đồng hồ
    // hay không, và 10 chỗ quyết là không. Vá tay 13 chỗ chỉ dời được ngày chỗ
    // thứ 14 sinh ra.
    const viPham: string[] = [];
    const quet = (thuMuc: string) => {
      for (const e of fs.readdirSync(path.join(goc, thuMuc), { withFileTypes: true })) {
        const con = `${thuMuc}/${e.name}`;
        if (e.isDirectory()) {
          if (e.name === "node_modules" || e.name === ".next") continue;
          quet(con);
          continue;
        }
        if (!/\.tsx?$/.test(e.name) || /\.(test|spec)\.tsx?$/.test(e.name)) continue;
        if (con.endsWith("lib/lead/activity-write.ts")) continue;
        const than = boChuThich(fs.readFileSync(path.join(goc, con), "utf8"));
        if (/\bleadActivity\.(create|createMany|upsert)\b/.test(than)) viPham.push(con);
      }
    };
    quet("lib");
    quet("app");

    expect(viPham).toEqual([]);
  });

  it("🔴 định nghĩa 'đã tiếp cận' không được tách làm hai bản", () => {
    // `hasSaleInteraction` (`lib/lead/auto-assign.ts`) đã mang SẴN đúng khái
    // niệm này ở phía DB: lead đã có tương tác của sale thì KHÔNG auto-chia
    // lại. Hai bản định nghĩa cùng một câu hỏi mà lệch nhau là bug câm — nên
    // khi chủ dự án chốt danh sách, test này đỏ và bắt sửa cả hai chỗ.
    const than = boChuThich(doc("lib/lead/auto-assign.ts"));
    const thanHam = than.slice(than.indexOf("export async function hasSaleInteraction"));
    const loai = new Set(
      [...thanHam.slice(0, thanHam.indexOf("\n}")).matchAll(/"([A-Z_]+)"/g)].map((mm) => mm[1]),
    );

    expect([...loai].sort()).toEqual([...LEAD_OUTREACH_TYPES].sort());
  });
});
