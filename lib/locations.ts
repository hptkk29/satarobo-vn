export type LocationStatus = "operational" | "upcoming";

export interface SataRoboLocation {
  id: string;
  /** Mã cơ sở ngắn dùng cho nhãn nút (Zalo CS1/CS2…). */
  code: "CS1" | "CS2";
  name: string;
  address: string;
  district: string;
  /** SĐT hiển thị (định dạng có chấm). */
  hotline: string;
  /** SĐT thuần số cho tel: và zalo.me. */
  hotlineRaw: string;
  /** SĐT chuẩn E.164 cho JSON-LD. */
  hotlineE164: string;
  /** Link Zalo riêng của cơ sở. */
  zalo: string;
  workingHours: string;
  status: LocationStatus;
  isHQ: boolean;
  openingDate?: string;
  note?: string;
}

// 2 cơ sở — MỖI cơ sở có SĐT + Zalo RIÊNG. Không dùng 1 số chung cho toàn site.
export const SATA_ROBO_LOCATIONS: SataRoboLocation[] = [
  {
    id: "tru-so-nguyen-huu-tho",
    code: "CS1",
    name: "Cơ sở 1 - Nguyễn Hữu Thọ",
    address: "211 Nguyễn Hữu Thọ, Đà Nẵng",
    district: "Hải Châu",
    hotline: "0818.823.720",
    hotlineRaw: "0818823720",
    hotlineE164: "+84818823720",
    zalo: "https://zalo.me/0818823720",
    workingHours: "T2 - T7: 8:00 - 20:00",
    status: "operational",
    isHQ: true,
    note: "Trụ sở chính - Phòng Lab lớn, đầy đủ trang thiết bị",
  },
  {
    id: "co-so-hoang-dieu",
    code: "CS2",
    name: "Cơ sở 2 - Hoàng Diệu",
    address: "114 Hoàng Diệu, Đà Nẵng",
    district: "Hải Châu",
    hotline: "0702.193.933",
    hotlineRaw: "0702193933",
    hotlineE164: "+84702193933",
    zalo: "https://zalo.me/0702193933",
    workingHours: "T2 - T7: 8:00 - 20:00",
    status: "operational",
    isHQ: false,
  },
];

// Thông tin công ty (KHÔNG còn hotline/zalo đơn lẻ — luôn dùng theo từng cơ sở
// qua SATA_ROBO_LOCATIONS để hiển thị đủ 2 số).
export const SATA_ROBO_CONTACT = {
  companyName: "Công ty Cổ phần Công nghệ Giáo dục Sata Robo",
  shortName: "Sata Robo",
  taxCode: "0402301783",
  emails: {
    primary: "thongtin@satarobo.vn",
    general: "thongtin@satarobo.vn",
    recruitment: "tuyendung@satarobo.vn",
    ceo: "hodacphuchtc@gmail.com",
  },
  facebook: "https://www.facebook.com/satarobo",
  tiktok: "https://www.tiktok.com/@satarobo",
  youtube: "https://www.youtube.com/@satarobo",
} as const;

export function operationalLocations(): SataRoboLocation[] {
  return SATA_ROBO_LOCATIONS.filter((l) => l.status === "operational");
}

export function upcomingLocations(): SataRoboLocation[] {
  return SATA_ROBO_LOCATIONS.filter((l) => l.status === "upcoming");
}

/** Danh sách cơ sở dùng cho nút liên hệ / hotline (đang hoạt động). */
export const SATA_ROBO_CONTACT_CENTERS = operationalLocations();

/** Chuỗi gộp 2 số cho help text inline, vd: "CS1: 0818.823.720 · CS2: 0702.193.933". */
export function hotlinesInline(): string {
  return SATA_ROBO_CONTACT_CENTERS.map((c) => `${c.code}: ${c.hotline}`).join(" · ");
}
