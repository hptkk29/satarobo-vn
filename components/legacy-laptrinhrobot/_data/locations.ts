// 2 cơ sở Sata Robo: 211 NHT (trụ sở chính) + 114 Hoàng Diệu.

export interface Location {
  id: number;
  name: string;
  address: string;
  hotline: string;
  workingHours: string;
  mapEmbed: string;
  mapLat: number;
  mapLng: number;
  isHQ: boolean;
  isUpcoming?: boolean;
  note: string;
}

export const locations: Location[] = [
  {
    id: 1,
    name: "Trụ sở chính - Nguyễn Hữu Thọ",
    address: "211 Nguyễn Hữu Thọ, Đà Nẵng",
    hotline: "0818.823.720",
    workingHours: "T2 - T7: 8:00 - 20:00",
    mapEmbed:
      "https://www.google.com/maps?q=211+Nguyễn+Hữu+Thọ,+Đà+Nẵng&z=16&output=embed&hl=vi",
    mapLat: 16.045,
    mapLng: 108.22,
    isHQ: true,
    note: "Trụ sở chính - Phòng Lab lớn, đầy đủ trang thiết bị",
  },
  {
    id: 2,
    name: "Cơ sở Hoàng Diệu",
    address: "114 Hoàng Diệu, Đà Nẵng",
    hotline: "0818.823.720",
    workingHours: "T2 - T7: 8:00 - 20:00",
    mapEmbed:
      "https://www.google.com/maps?q=114+Hoàng+Diệu,+Đà+Nẵng&z=16&output=embed&hl=vi",
    mapLat: 16.06,
    mapLng: 108.215,
    isHQ: false,
    note: "Phục vụ khu vực Hải Châu",
  },
];
