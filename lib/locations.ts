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
    id: "tru-so-nguyen-huu-tho",
    name: "Trụ sở chính - Nguyễn Hữu Thọ",
    address: "211 Nguyễn Hữu Thọ, Đà Nẵng",
    district: "Hải Châu",
    hotline: "0818.823.720",
    workingHours: "T2 - T7: 8:00 - 20:00",
    status: "operational",
    isHQ: true,
    note: "Trụ sở chính - Phòng Lab lớn, đầy đủ trang thiết bị",
  },
  {
    id: "co-so-hoang-dieu",
    name: "Cơ sở Hoàng Diệu",
    address: "114 Hoàng Diệu, Đà Nẵng",
    district: "Hải Châu",
    hotline: "0818.823.720",
    workingHours: "T2 - T7: 8:00 - 20:00",
    status: "operational",
    isHQ: false,
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
