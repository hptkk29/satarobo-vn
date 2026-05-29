import { describe, it, expect } from "vitest";
import {
  computeWorkedHours,
  deriveAttendanceStatus,
  formatVNTime,
  vnMinutesOfDay,
} from "./work-schedule";

// Helper: tạo Date từ giờ tường VN (UTC+7) → instant UTC tương ứng.
function vn(dateISO: string, hm: string): Date {
  return new Date(`${dateISO}T${hm}:00+07:00`);
}

describe("vnMinutesOfDay — quy về GMT+7", () => {
  it("07:38 VN → 458 phút", () => {
    expect(vnMinutesOfDay(vn("2026-05-29", "07:38"))).toBe(7 * 60 + 38);
  });
});

describe("computeWorkedHours — giao với 2 ca", () => {
  it("07:38→09:04 chỉ giao ca sáng ≈ 1.43h", () => {
    const h = computeWorkedHours(vn("2026-05-29", "07:38"), vn("2026-05-29", "09:04"));
    expect(h).toBeGreaterThan(1.3);
    expect(h).toBeLessThan(1.6);
  });

  it("làm full 2 ca 07:30→17:30 = 8h (loại nghỉ trưa)", () => {
    const h = computeWorkedHours(vn("2026-05-29", "07:30"), vn("2026-05-29", "17:30"));
    expect(h).toBe(8);
  });

  it("ở lại xuyên trưa vẫn chỉ tính 2 ca, không tính 11:30–13:30", () => {
    const h = computeWorkedHours(vn("2026-05-29", "11:00"), vn("2026-05-29", "14:00"));
    // ca sáng 11:00–11:30 = 0.5h + ca chiều 13:30–14:00 = 0.5h = 1h
    expect(h).toBe(1);
  });
});

describe("deriveAttendanceStatus", () => {
  it("07:38→09:04 → KHÔNG 'Đủ công', có 'Thiếu giờ'", () => {
    const { tags } = deriveAttendanceStatus({
      checkIn: vn("2026-05-29", "07:38"),
      checkOut: vn("2026-05-29", "09:04"),
      geofenceFlag: false,
    });
    const labels = tags.map((t) => t.label);
    expect(labels.some((l) => l.startsWith("Thiếu giờ"))).toBe(true);
    expect(labels).not.toContain("Đủ công");
    expect(labels).toContain("Đi muộn"); // 07:38 > 07:35
  });

  it("07:30→17:30 đúng giờ → 'Đủ công'", () => {
    const { tags } = deriveAttendanceStatus({
      checkIn: vn("2026-05-29", "07:30"),
      checkOut: vn("2026-05-29", "17:30"),
      geofenceFlag: false,
    });
    expect(tags.map((t) => t.label)).toContain("Đủ công");
  });

  it("có vào chưa ra → 'Thiếu check-out'", () => {
    const { tags } = deriveAttendanceStatus({
      checkIn: vn("2026-05-29", "07:30"),
      checkOut: null,
      geofenceFlag: false,
    });
    expect(tags.map((t) => t.label)).toContain("Thiếu check-out");
  });

  it("geofenceFlag → 'Ngoài vùng'", () => {
    const { tags } = deriveAttendanceStatus({
      checkIn: vn("2026-05-29", "07:30"),
      checkOut: vn("2026-05-29", "17:30"),
      geofenceFlag: true,
    });
    expect(tags.map((t) => t.label)).toContain("Ngoài vùng");
  });
});

describe("formatVNTime — GMT+7", () => {
  it("instant 00:38 UTC → 07:38 VN", () => {
    expect(formatVNTime(new Date("2026-05-29T00:38:00Z"))).toBe("07:38");
  });
});
