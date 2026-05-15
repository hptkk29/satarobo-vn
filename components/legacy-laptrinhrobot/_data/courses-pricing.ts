// =============================================
// DANH SACH KHOA HOC & BANG GIA - SATA ROBO
// =============================================

export interface Course {
  id: string;
  name: string;
  shortName: string;
  displayName: string;
  hook?: string;
  groupName?: string;
  educationLevel?: string;
  academicName?: string;
  grade: string;
  sessions: number;
  device: string;
  format?: string;
  listPrice: number;
  earlyBirdPrice?: number;
  earlyBirdOutside?: number;
  comboPrice?: number;
  fixedPrice?: number;
  savedAmount?: number;
  pricePerSession?: number;
  installmentOutside?: number;
  icon?: string;
  badge?: string;
  note: string;
  value: string;
  durationPerSession: string;
  totalDuration: string;
}

export interface CourseGroup {
  group: string;
  description: string;
  courses: Course[];
}

type CourseInput = Omit<Course, "durationPerSession" | "totalDuration">;

const withDuration = (course: CourseInput): Course => ({
  durationPerSession: "90 phút",
  totalDuration:
    course.sessions === 5
      ? "7,5 giờ"
      : course.sessions === 16
        ? "24 giờ"
        : course.sessions === 32
          ? "48 giờ"
          : "72 giờ",
  ...course,
});

export const courseGroups: CourseGroup[] = [
  {
    group: "Khóa luyện thi & cam kết thi đấu",
    description:
      "Dành cho học sinh muốn luyện thi Sáng tạo Robotics 2026 theo lộ trình ngắn hạn, tập trung vào RoboSim, robot Beta và chiến thuật thi đấu.",
    courses: [
      withDuration({ id: "Sata1", name: "Robosim Master", shortName: "Sata1 - Robosim Master", displayName: "Robosim Master", hook: "Làm chủ vòng loại RoboSim", groupName: "Khóa luyện thi", educationLevel: "Tiểu học", grade: "Lớp 3-8", sessions: 16, device: "RoboSim phần mềm", format: "Trực tiếp, kết hợp E-learning", listPrice: 2400000, earlyBirdPrice: 2040000, earlyBirdOutside: 2040000, pricePerSession: 150000, badge: "Luyện thi RoboSim", note: "Dành cho học sinh cần luyện thi vòng loại, làm quen phần mềm RoboSim, đọc sa bàn và tối ưu chiến thuật bài thi.", value: "Sata1 - Robosim Master - Lớp 3-5 - 16 buổi - 90 phút/buổi - Tổng 24 giờ - Giá ưu đãi 2.040.000đ" }),
      withDuration({ id: "Sata2", name: "Đấu trường Robot", shortName: "Sata2 - Đấu trường Robot", displayName: "Đấu trường Robot", hook: "Luyện robot Beta cho cấp khu vực", groupName: "Khóa luyện thi", educationLevel: "Trung học cơ sở", grade: "Lớp 3-8", sessions: 16, device: "RoboSim + Robot Beta thật", format: "Trực tiếp, kết hợp E-learning", listPrice: 3040000, earlyBirdPrice: 2584000, earlyBirdOutside: 2584000, pricePerSession: 190000, badge: "Luyện thi Beta cấp khu vực", note: "Dành cho học sinh cần chuyển từ mô phỏng sang robot thật, luyện vận hành, xử lý sa bàn và áp lực thi đấu.", value: "Sata2 - Đấu trường Robot - Lớp 6-9 - 16 buổi - 90 phút/buổi - Tổng 24 giờ - Giá ưu đãi 2.584.000đ" }),
      withDuration({ id: "Combo", name: "Combo Sata1 + Sata2", shortName: "Combo Sata1 + Sata2", displayName: "Full Lộ Trình Luyện Thi", hook: "Học trọn từ RoboSim đến robot Beta", grade: "Lớp 3-8", sessions: 32, device: "RoboSim phần mềm + Robot Beta thật", format: "Trực tiếp, kết hợp E-learning", listPrice: 5440000, comboPrice: 3808000, savedAmount: 1632000, badge: "Combo đề xuất", note: "Bao gồm Robosim Master + Đấu trường Robot cho phụ huynh muốn con học trọn lộ trình luyện thi từ RoboSim đến robot Beta.", value: "Combo Sata1 + Sata2 - Lớp 3-9 - 32 buổi - 90 phút/buổi - Tổng 48 giờ - Giá combo 3.808.000đ" }),
      withDuration({ id: "Sata8", name: "Vé Vàng Chung Kết", shortName: "Sata8 - Vé Vàng Chung Kết", displayName: "Vé Vàng Chung Kết", hook: "Thêm một lớp bảo chứng cho mục tiêu vượt vòng loại", grade: "Lớp 3-8", sessions: 5, device: "RoboSim + Sa bàn thực chiến", listPrice: 2500000, fixedPrice: 2500000, badge: "Sata 8 Cam kết hoàn tiền 100%", note: "Giá cố định 2.500.000đ, không áp dụng giảm giá. Hoàn 100% học phí gói Sata8 nếu học sinh đi đủ lộ trình nhưng không vượt vòng loại theo điều kiện cam kết.", value: "Sata8 - Vé Vàng Chung Kết - Lớp 1-8 - 5 buổi - 90 phút/buổi - Tổng 7,5 giờ - Giá cố định 2.500.000đ" }),
    ],
  },
  {
    group: "Khóa chuyên sâu 48 buổi",
    description: "Lộ trình Robotics dài hạn 5 năm, dành cho học sinh từ lớp 1 đến lớp 8, phát triển tư duy công nghệ, kỹ năng robot và năng lực thuyết trình dự án.",
    courses: [
      withDuration({ id: "Sata3", name: "Ươm Mầm Tài Năng", shortName: "Sata3 - Ươm Mầm Tài Năng", displayName: "Ươm Mầm Tài Năng", academicName: "Robotics Ươm Mầm Tài Năng", grade: "Lớp 1-2", sessions: 48, device: "Alpha A + C & Cảm biến siêu âm", pricePerSession: 220000, listPrice: 10560000, earlyBirdPrice: 8976000, earlyBirdOutside: 8976000, installmentOutside: 748000, icon: "Sprout", badge: "Khởi đầu Robotics", note: "Khóa chuyên sâu 48 buổi cho học sinh lớp 1-2.", value: "Sata3 - Ươm Mầm Tài Năng - Lớp 1-2 - 48 buổi - 90 phút/buổi - Tổng 72 giờ - Giá ưu đãi 8.976.000đ" }),
      withDuration({ id: "Sata4", name: "Bứt Phá Giới Hạn", shortName: "Sata4 - Bứt Phá Giới Hạn", displayName: "Bứt Phá Giới Hạn", academicName: "Robotics Bứt Phá Giới Hạn", grade: "Lớp 3-4", sessions: 48, device: "RoboSim + Beta Set + Saban", pricePerSession: 240000, listPrice: 11520000, earlyBirdPrice: 9792000, earlyBirdOutside: 9792000, installmentOutside: 816000, icon: "Rocket", note: "Khóa chuyên sâu 48 buổi cho học sinh lớp 3-4.", value: "Sata4 - Bứt Phá Giới Hạn - Lớp 3-4 - 48 buổi - 90 phút/buổi - Tổng 72 giờ - Giá ưu đãi 9.792.000đ" }),
      withDuration({ id: "Sata5", name: "Khơi Nguồn Sáng Tạo", shortName: "Sata5 - Khơi Nguồn Sáng Tạo", displayName: "Khơi Nguồn Sáng Tạo", academicName: "Robotics Khơi Nguồn Sáng Tạo", grade: "Lớp 5", sessions: 48, device: "Hệ thống chuyên gia Storm", pricePerSession: 260000, listPrice: 12480000, earlyBirdPrice: 10608000, earlyBirdOutside: 10608000, installmentOutside: 884000, icon: "Zap", note: "Khóa chuyên sâu 48 buổi cho học sinh lớp 5.", value: "Sata5 - Khơi Nguồn Sáng Tạo - Lớp 5 - 48 buổi - 90 phút/buổi - Tổng 72 giờ - Giá ưu đãi 10.608.000đ" }),
      withDuration({ id: "Sata6", name: "Chinh Phục Đấu Trường", shortName: "Sata6 - Chinh Phục Đấu Trường", displayName: "Chinh Phục Đấu Trường", academicName: "Robotics Chinh Phục Đấu Trường", grade: "Lớp 6-7", sessions: 48, device: "RoboSim + Beta Set + Saban Competition Standard", pricePerSession: 280000, listPrice: 13440000, earlyBirdPrice: 11424000, earlyBirdOutside: 11424000, installmentOutside: 952000, icon: "Trophy", note: "Khóa chuyên sâu 48 buổi cho học sinh lớp 6-7.", value: "Sata6 - Chinh Phục Đấu Trường - Lớp 6-7 - 48 buổi - 90 phút/buổi - Tổng 72 giờ - Giá ưu đãi 11.424.000đ" }),
      withDuration({ id: "Sata7", name: "Kiến Tạo Tương Lai", shortName: "Sata7 - Kiến Tạo Tương Lai", displayName: "Kiến Tạo Tương Lai", academicName: "Robotics Chắp Cánh Tương Lai", grade: "Lớp 8", sessions: 48, device: "Storm + AI (Computer Vision Modules)", pricePerSession: 300000, listPrice: 14400000, earlyBirdPrice: 12240000, earlyBirdOutside: 12240000, installmentOutside: 1020000, icon: "Bot", note: "Khóa chuyên sâu 48 buổi cho học sinh lớp 8. Nội dung học thuật theo chương trình Robotics Chắp Cánh Tương Lai.", value: "Sata7 - Kiến Tạo Tương Lai - Lớp 8 - 48 buổi - 90 phút/buổi - Tổng 72 giờ - Giá ưu đãi 12.240.000đ" }),
    ],
  },
];

export const CONSULT_OPTION = {
  id: "consult",
  name: "Chưa biết - Cần hỗ trợ tư vấn",
  value: "Chưa biết - Cần tư vấn lộ trình phù hợp",
};
