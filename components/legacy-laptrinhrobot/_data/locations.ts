// Phase 4.UI.RESET.1 — 4 cơ sở operational + 2 cơ sở upcoming.

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
    name: "Trụ sở chính - Hòa Cường",
    address: "258 Lê Thanh Nghị, Đà Nẵng",
    hotline: "0818.823.720",
    workingHours: "T2 - T7: 8:00 - 20:00",
    mapEmbed:
      "https://www.google.com/maps?q=258+Lê+Thanh+Nghị,+Đà+Nẵng&z=16&output=embed&hl=vi",
    mapLat: 16.041,
    mapLng: 108.218,
    isHQ: true,
    note: "Trụ sở chính - Phòng Lab lớn, đầy đủ trang thiết bị",
  },
  {
    id: 2,
    name: "Cơ sở Hải Châu",
    address: "60 Lê Lợi, Đà Nẵng",
    hotline: "0818.823.720",
    workingHours: "T2 - T7: 8:00 - 20:00",
    mapEmbed:
      "https://www.google.com/maps?q=60+Lê+Lợi,+Đà+Nẵng&z=16&output=embed&hl=vi",
    mapLat: 16.072,
    mapLng: 108.221,
    isHQ: false,
    note: "Phục vụ khu vực Hải Châu",
  },
  {
    id: 3,
    name: "Cơ sở Thanh Khê",
    address: "269 Điện Biên Phủ, Đà Nẵng",
    hotline: "0818.823.720",
    workingHours: "T2 - T7: 8:00 - 20:00",
    mapEmbed:
      "https://www.google.com/maps?q=269+Điện+Biên+Phủ,+Đà+Nẵng&z=16&output=embed&hl=vi",
    mapLat: 16.067,
    mapLng: 108.197,
    isHQ: false,
    note: "Phục vụ khu vực Thanh Khê",
  },
  {
    id: 4,
    name: "Cơ sở Cẩm Lệ",
    address: "232 Nguyễn Phước Lan, Đà Nẵng",
    hotline: "0818.823.720",
    workingHours: "T2 - T7: 8:00 - 20:00",
    mapEmbed:
      "https://www.google.com/maps?q=232+Nguyễn+Phước+Lan,+Đà+Nẵng&z=16&output=embed&hl=vi",
    mapLat: 16.011,
    mapLng: 108.213,
    isHQ: false,
    note: "Phục vụ khu vực Hòa Xuân, Cẩm Lệ",
  },
  {
    id: 5,
    name: "Cơ sở Hoàng Diệu",
    address: "114 Hoàng Diệu, Đà Nẵng",
    hotline: "0818.823.720",
    workingHours: "Sắp khai trương",
    mapEmbed:
      "https://www.google.com/maps?q=114+Hoàng+Diệu,+Đà+Nẵng&z=16&output=embed&hl=vi",
    mapLat: 16.06,
    mapLng: 108.215,
    isHQ: false,
    isUpcoming: true,
    note: "Cơ sở sắp khai trương",
  },
  {
    id: 6,
    name: "Cơ sở Nguyễn Hữu Thọ",
    address: "211 Nguyễn Hữu Thọ, Đà Nẵng",
    hotline: "0818.823.720",
    workingHours: "Khai trương 08/2026",
    mapEmbed:
      "https://www.google.com/maps?q=211+Nguyễn+Hữu+Thọ,+Đà+Nẵng&z=16&output=embed&hl=vi",
    mapLat: 16.045,
    mapLng: 108.22,
    isHQ: false,
    isUpcoming: true,
    note: "Khai trương tháng 8/2026",
  },
];
