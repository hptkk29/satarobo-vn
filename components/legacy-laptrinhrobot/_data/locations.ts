// Phase 4.UI.FIX.3 PART E — UPDATED 4 cơ sở → 2 cơ sở (211 NHT + 114 HD)

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
  note: string;
}

export const locations: Location[] = [
  {
    id: 1,
    name: "Cơ sở 1 - Hải Châu",
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
    name: "Cơ sở 2 - Hải Châu",
    address: "114 Hoàng Diệu, Đà Nẵng",
    hotline: "0818.823.720",
    workingHours: "T2 - T7: 8:00 - 20:00",
    mapEmbed:
      "https://www.google.com/maps?q=114+Hoàng+Diệu,+Đà+Nẵng&z=16&output=embed&hl=vi",
    mapLat: 16.06,
    mapLng: 108.215,
    isHQ: false,
    note: "Cơ sở thứ 2 - Phục vụ khu vực Hải Châu",
  },
];
