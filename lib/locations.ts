export interface SataRoboLocation {
  id: string;
  name: string;
  address: string;
  hotline: string;
  workingHours: string;
  isHQ: boolean;
  note?: string;
}

export const SATA_ROBO_LOCATIONS: SataRoboLocation[] = [
  {
    id: "co-so-1-nguyen-huu-tho",
    name: "Cơ sở 1 - Hải Châu",
    address: "211 Nguyễn Hữu Thọ, Đà Nẵng",
    hotline: "0818.823.720",
    workingHours: "T2 - T7: 8:00 - 20:00",
    isHQ: true,
    note: "Trụ sở chính - Phòng Lab lớn, đầy đủ trang thiết bị",
  },
  {
    id: "co-so-2-hoang-dieu",
    name: "Cơ sở 2 - Hải Châu",
    address: "114 Hoàng Diệu, Đà Nẵng",
    hotline: "0818.823.720",
    workingHours: "T2 - T7: 8:00 - 20:00",
    isHQ: false,
    note: "Cơ sở thứ 2 - Phục vụ khu vực Hải Châu",
  },
];

export const SATA_ROBO_CONTACT = {
  companyName: "Công ty Cổ phần Công nghệ Giáo dục Sata Robo",
  shortName: "Sata Robo",
  hotline: "0818.823.720",
  hotlineRaw: "0818823720",
  hotlineE164: "+84818823720",
  emails: {
    primary: "satarobo@gmail.com",
    ceo: "hodacphuchtc@gmail.com",
  },
  zalo: "https://zalo.me/0818823720",
  facebook: "https://www.facebook.com/satarobo",
  tiktok: "https://www.tiktok.com/@satarobo",
  youtube: "https://www.youtube.com/@satarobo",
} as const;
