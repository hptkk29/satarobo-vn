export type LocationStatus = "operational" | "upcoming";

export interface SataRoboLocation {
  id: string;
  name: string;
  address: string;
  district: string;
  hotline: string;
  workingHours: string;
  status: LocationStatus;
  isHQ: boolean;
  openingDate?: string;
  note?: string;
}

export const SATA_ROBO_LOCATIONS: SataRoboLocation[] = [
  {
    id: "tru-so-le-thanh-nghi",
    name: "Trụ sở chính - Hòa Cường",
    address: "258 Lê Thanh Nghị, Đà Nẵng",
    district: "Hòa Cường, Hải Châu",
    hotline: "0818.823.720",
    workingHours: "T2 - T7: 8:00 - 20:00",
    status: "operational",
    isHQ: true,
    note: "Trụ sở chính - Phòng Lab lớn, đầy đủ trang thiết bị",
  },
  {
    id: "co-so-le-loi",
    name: "Cơ sở Hải Châu",
    address: "60 Lê Lợi, Đà Nẵng",
    district: "Hải Châu",
    hotline: "0818.823.720",
    workingHours: "T2 - T7: 8:00 - 20:00",
    status: "operational",
    isHQ: false,
  },
  {
    id: "co-so-dien-bien-phu",
    name: "Cơ sở Thanh Khê",
    address: "269 Điện Biên Phủ, Đà Nẵng",
    district: "Thanh Khê",
    hotline: "0818.823.720",
    workingHours: "T2 - T7: 8:00 - 20:00",
    status: "operational",
    isHQ: false,
  },
  {
    id: "co-so-nguyen-phuoc-lan",
    name: "Cơ sở Cẩm Lệ",
    address: "232 Nguyễn Phước Lan, Đà Nẵng",
    district: "Hòa Xuân, Cẩm Lệ",
    hotline: "0818.823.720",
    workingHours: "T2 - T7: 8:00 - 20:00",
    status: "operational",
    isHQ: false,
  },
  {
    id: "co-so-hoang-dieu",
    name: "Cơ sở Hoàng Diệu",
    address: "114 Hoàng Diệu, Đà Nẵng",
    district: "Hải Châu",
    hotline: "0818.823.720",
    workingHours: "Khai trương 25/05/2026",
    status: "upcoming",
    isHQ: false,
    openingDate: "2026-05-25",
    note: "Khai trương 25/05/2026 (Thứ 2)",
  },
  {
    id: "co-so-nguyen-huu-tho",
    name: "Cơ sở Nguyễn Hữu Thọ",
    address: "211 Nguyễn Hữu Thọ, Đà Nẵng",
    district: "Hải Châu",
    hotline: "0818.823.720",
    workingHours: "Khai trương 23/05/2026",
    status: "upcoming",
    isHQ: false,
    openingDate: "2026-05-23",
    note: "Khai trương 23/05/2026 (Thứ 7)",
  },
  {
    id: "co-so-xo-viet-nghe-tinh",
    name: "Cơ sở Xô Viết Nghệ Tĩnh",
    address: "89 Xô Viết Nghệ Tĩnh, Đà Nẵng",
    district: "Hải Châu",
    hotline: "0818.823.720",
    workingHours: "Khai trương 24/05/2026",
    status: "upcoming",
    isHQ: false,
    openingDate: "2026-05-24",
    note: "Khai trương 24/05/2026 (Chủ nhật)",
  },
];

export const SATA_ROBO_CONTACT = {
  companyName: "Công ty Cổ phần Công nghệ Giáo dục Sata Robo",
  shortName: "Sata Robo",
  taxCode: "0402301783",
  hotline: "0818.823.720",
  hotlineRaw: "0818823720",
  hotlineE164: "+84818823720",
  emails: {
    primary: "thongtin@satarobo.vn",
    general: "thongtin@satarobo.vn",
    recruitment: "tuyendung@satarobo.vn",
    ceo: "hodacphuchtc@gmail.com",
  },
  zalo: "https://zalo.me/0818823720",
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
