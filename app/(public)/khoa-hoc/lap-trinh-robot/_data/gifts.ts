export const gifts = [
  {
    id: 1,
    icon: '👕',
    title: 'Bộ đồng phục Sata Robo',
    value: '200.000đ',
    description: 'Đồng phục SataRobo — con tự hào mặc đến lớp.',
  },
  {
    id: 2,
    icon: '🎓',
    title: 'Bộ đề luyện thi và giải đề RoboSim 2026',
    value: '490.000đ',
    description: 'Áp dụng cho mọi học viên khi mua bất kỳ khoá học Offline nào.',
  },
  {
    id: 3,
    icon: '📘',
    title: 'E-book "Phát triển tư duy STEM cho con"',
    value: '150.000đ',
    description: 'PDF 80 trang — bí quyết giúp con phát triển tư duy khoa học ngay tại nhà.',
  },
  {
    id: 4,
    icon: '🎯',
    title: '1 buổi học MIỄN PHÍ tại trung tâm',
    value: '1.000.000đ',
    description:
      '90 phút — con tự tay lập trình robot đầu tiên, bố mẹ ngồi quan sát trực tiếp.',
  },
]

export const totalGiftValue = ' 2 triệu đồng'

export type Gift = (typeof gifts)[number]
