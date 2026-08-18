/**
 * Seed 4 News records (Phase 4.UI.RESET.2 PART D4).
 * Uses new News model (separate from BlogPost).
 *
 * Run: pnpm dotenv -e .env.local -- pnpm tsx scripts/seed-news.ts
 */
import { db } from "@/lib/db";

interface NewsSeed {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  tags: string[];
  publishedAt: Date;
  isFeatured: boolean;
  displayOrder: number;
  seoTitle: string;
  seoDescription: string;
}

const NEWS: NewsSeed[] = [
  {
    slug: "sata-robo-khai-truong-6-co-so-da-nang",
    title: "Sata Robo Chính Thức Khai Trương 6 Cơ Sở Tại Đà Nẵng",
    excerpt:
      "Sata Robo chính thức khai trương tại Đà Nẵng, mang đến 8 chương trình Robotics độc đáo với Robosim — phần mềm thi bắt buộc duy nhất của Cuộc thi Sáng tạo Robotics Toàn Quốc 2026.",
    content: `# Sata Robo Chính Thức Khai Trương 6 Cơ Sở Tại Đà Nẵng

Đà Nẵng vừa có thêm địa chỉ đào tạo Robotics đáng tin cậy dành cho học sinh lớp 1-8: **Sata Robo** — Trung tâm Công nghệ Giáo dục đặt tại:

- 258 Lê Thanh Nghị (Trụ sở chính)
- 60 Lê Lợi
- 232 Nguyễn Phước Lan
- 269 Điện Biên Phủ

Dự kiến khai trương 2 cơ sở mới tại:

- 114 Hoàng Diệu
- 211 Nguyễn Hữu Thọ

## Điểm khác biệt của Sata Robo

**Robosim — Công cụ thi bắt buộc:** Sata Robo là đơn vị duy nhất tại Đà Nẵng đào tạo phần mềm Robosim với các giáo án biên tập chi tiết về đại cương, giải đề và chiến thuật. Robosim là công cụ bắt buộc trong Cuộc thi Sáng tạo Robotics Toàn Quốc 2026 do Thành Đoàn Đà Nẵng tổ chức.

Hiện chúng tôi đã Gamification chương trình đào tạo trên các nền tảng:

- https://www.luyenthirobosim.vn/
- sataworld.vn

Yêu cầu các đội thi cần đăng ký tài khoản để tham gia học, làm bài test và AI sẽ đánh giá phản hồi kết quả. Ngoài ra chúng tôi đã xây dựng 1 trợ lý AI đính kèm trả lời 24/7 về thể lệ cuộc thi.

Trong khi các đội thi vẫn đang loay hoay đăng ký, học viên Sata Robo đã giải đề và ban đào tạo của chúng tôi đã giải xong đề để đào tạo lập trình + tối ưu chiến thuật thi đấu.

**Lớp học nhỏ, tận tâm:** Mỗi lớp tối đa 12 học viên. Giáo viên dạy kèm, cầm tay chỉ việc để học viên tiến bộ mỗi ngày.

**Cam kết hoàn tiền 100%:** Nếu học viên không vượt qua vòng loại để thi đấu chung kết khu vực Miền Trung tại Nghệ An tháng 9/2026 — Cam kết hoàn tiền không lý do.

## 8 chương trình học đa dạng

Từ **Sata1 — Robosim Master** (luyện thi vòng loại) đến **Sata7 — Chắp Cánh Tương Lai** (AI và robot tự hành), Sata Robo thiết kế lộ trình riêng biệt cho từng độ tuổi.

## Ưu đãi khai trương

Trong tháng 5/2026, Sata Robo triển khai **Early Bird khai trương** với ưu đãi lên đến 30% cho học viên mới với các chương trình cam kết đầu ra chất lượng đào tạo.

> 📞 Đặt buổi học thử 1-1 miễn phí: **0818.823.720**`,
    category: "Tin công ty",
    tags: ["Khai trương", "Robotics", "Đà Nẵng"],
    publishedAt: new Date("2026-05-15"),
    isFeatured: true,
    displayOrder: 1,
    seoTitle: "Sata Robo Khai Trương | Trung Tâm Robotics Hàng Đầu Đà Nẵng",
    seoDescription:
      "Sata Robo khai trương tại Đà Nẵng. 8 chương trình Robotics, lớp ≤12 HV, Robosim độc quyền, cam kết hoàn tiền 100%. Tặng buổi học thử 1-1 miễn phí.",
  },
  {
    slug: "sata8-ve-vang-chung-ket-cam-ket-hoan-100",
    title:
      "Sata8 — Vé Vàng Chung Kết: Cam Kết Hoàn 100% Học Phí Nếu Con Không Vượt Vòng Loại",
    excerpt:
      "Sata Robo ra mắt gói đặc biệt Sata8 — 5 buổi chuyên binh cam kết đưa con vào chung kết Khu vực Miền Trung. Không đạt — hoàn 100% học phí 2.500.000đ.",
    content: `# Sata8 — Vé Vàng Chung Kết: Không Đạt, Hoàn 100%

Lần đầu tiên tại Đà Nẵng, một trung tâm Robotics dám cam kết tuyệt đối hoàn trả 100% chi phí đào tạo vào kết quả của học viên.

## Sata8 là gì?

**Sata8 — Vé Vàng Chung Kết Khu Vực Miền Trung** là gói 5 buổi chuyên binh dành riêng cho học viên đã có nền tảng Robosim, muốn chắc chắn vượt vòng loại Cuộc thi Sáng tạo Robotics Toàn Quốc 2026.

## 5 buổi học được gì?

**Buổi 1 — Giải mã sa bàn:** Phân tích đề thi thật, chiến lược di chuyển, xây dựng kịch bản cá nhân.

**Buổi 2 — Thi thử lần 1:** Mô phỏng 100% điều kiện thi, chấm điểm thật, phản hồi cá nhân.

**Buổi 3 — Mổ xẻ điểm yếu:** Sửa lỗi chiến thuật, tối ưu thuật toán từng học viên.

**Buổi 4 — Thi thử lần 2 full pressure:** Sa bàn thật, thời gian thật, giám sát như thi chính thức.

**Buổi 5 — Tổng duyệt & bản lĩnh thi đấu:** Ôn chiến thuật cuối, tâm lý ngày thi.

## Cam kết hoàn tiền 100%

Nếu học viên hoàn thành đầy đủ cam kết chuyên cần nhưng vẫn không vượt vòng loại để thi chung kết khu vực Miền Trung tại Nghệ An vào tháng 9/2026 → **Sata Robo hoàn trả 100% học phí trong vòng 7 ngày làm việc.** Không tranh luận.

**Chung kết Khu vực Miền Trung dự kiến:** 13/09/2026 tại Nghệ An
**Số lượng:** Tối đa 12 học viên/lớp — đăng ký sớm để chọn khung giờ phù hợp

> 📞 Tư vấn ngay: **0818.823.720** | 📍 258 Lê Thanh Nghị, Hòa Cường, Đà Nẵng`,
    category: "Khoá học mới",
    tags: ["Sata8", "Vé Vàng", "Cam kết", "Cuộc thi 2026"],
    publishedAt: new Date("2026-05-12"),
    isFeatured: true,
    displayOrder: 2,
    seoTitle: "Sata8 Vé Vàng Chung Kết | Cam Kết Hoàn 100% Học Phí | Sata Robo",
    seoDescription:
      "Sata8 — 5 buổi chuyên binh cam kết đưa con vượt vòng loại Robotics 2026. Không đạt — hoàn 100% học phí 2.5M. Đà Nẵng. SL có hạn!",
  },
  {
    slug: "cuoc-thi-sang-tao-robotics-2026-phu-huynh-can-biet",
    title:
      "Cuộc Thi Sáng Tạo Robotics Toàn Quốc 2026: Những Điều Phụ Huynh Cần Biết",
    excerpt:
      "Cuộc thi Sáng tạo Robotics Toàn Quốc 2026 sắp diễn ra — Robosim là công cụ thi bắt buộc. Chỉ có Sata Robo đào tạo phần mềm này tại Đà Nẵng.",
    content: `# Cuộc Thi Sáng Tạo Robotics 2026 — Cơ Hội Vàng Cho Con Bạn

Cuộc thi Sáng tạo Robotics Toàn Quốc 2026 là sân chơi lớn nhất dành cho học sinh yêu thích công nghệ và robot.

## Lịch thi

| Vòng | Thời gian | Địa điểm |
|------|-----------|----------|
| Vòng loại cấp TP Đà Nẵng | Dự kiến kết thúc 26/07/2026 | Đà Nẵng |
| Chung kết Khu vực Miền Trung | 13/09/2026 | Nghệ An |

## Robosim — Công cụ bắt buộc

Năm 2026, **Robosim** là phần mềm mô phỏng robot **bắt buộc** trong cuộc thi. Thí sinh phải thành thạo Robosim để tham dự vòng loại.

**Tin quan trọng:** Chỉ có **Sata Robo** tại Đà Nẵng đào tạo chính thức phần mềm Robosim.

## Con cần chuẩn bị gì?

- ✅ Thành thạo Robosim → Học **Sata1 — Robosim Master** (16 buổi, từ 1.800.000đ)
- ✅ Thực chiến robot thật → Học **Sata2 — Đấu Trường Robot** (16 buổi)
- ✅ Chắc chắn vượt vòng loại → Đăng ký **Sata8 — Vé Vàng Chung Kết** (cam kết hoàn 100%)

> ⚠️ **Early Bird khai trương chỉ đến 31/05/2026** — Ưu đãi lên đến 30%.

> 📞 Tư vấn miễn phí: **0818.823.720**`,
    category: "Sự kiện",
    tags: ["Cuộc thi 2026", "Robosim", "Robotics"],
    publishedAt: new Date("2026-05-10"),
    isFeatured: true,
    displayOrder: 3,
    seoTitle: "Cuộc Thi Robotics 2026 Đà Nẵng | Robosim | Đăng Ký Luyện Thi",
    seoDescription:
      "Cuộc thi Sáng tạo Robotics 2026 — Robosim là công cụ thi bắt buộc. Chỉ Sata Robo đào tạo Robosim tại Đà Nẵng. Đăng ký ngay, ưu đãi đến 31/05!",
  },
  {
    slug: "early-bird-sata-robo-uu-dai-30-toi-31-05",
    title:
      "Early Bird Khai Trương Sata Robo: Ưu Đãi Lên Đến 30% — Chỉ Đến 31/05/2026",
    excerpt:
      "Sata Robo mở cửa với ưu đãi khai trương chưa từng có: HV Satamath giảm 25%, HV ngoài giảm 15%, Combo Sata1+Sata2 giảm 30%.",
    content: `# Early Bird Khai Trương — Ưu Đãi Chỉ Có 1 Lần!

Từ 01/05 đến hết 31/05/2026, Sata Robo triển khai **Early Bird Khai Trương** — ưu đãi lớn nhất và DUY NHẤT, không lặp lại sau khi kết thúc.

## Bảng ưu đãi

| Khoá học | Giá niêm yết | HV Satamath (-25%) | HV ngoài (-15%) |
|----------|--------------|--------------------|-----------------|
| Sata1 — Robosim Master | 2.400.000đ | **1.800.000đ** | 2.040.000đ |
| Sata2 — Đấu Trường Robot | 3.040.000đ | **2.280.000đ** | 2.584.000đ |
| ★ Combo Sata1+Sata2 | 5.440.000đ | **3.808.000đ (-30%)** | 3.808.000đ |
| Sata3 — Ươm Mầm Tài Năng (48 buổi) | 10.560.000đ | **7.920.000đ** | 8.976.000đ |

## Ưu đãi bổ sung

- 👨‍👩‍👧‍👦 **Gói anh/chị/em:** con thứ 2 giảm thêm 15%; từ con thứ 3 giảm 15% và được tặng khoá RoboSim Online
- 👥 **Gói đội thi 2 HV:** Cùng đăng ký giảm thêm 10%
- 🤝 **Referral:** Giới thiệu bạn nhận 300.000đ tiền mặt + bạn giảm thêm 300.000đ
- 💳 **Trả góp 0%:** Áp dụng Sata3-Sata7, phối hợp VPBank/Sacombank/Home Credit
- 🔒 **Đặt cọc lock giá:** 500.000đ giữ giá Early Bird thêm 7 ngày, hoàn 100% nếu đổi ý

> ⚠️ **Đây là ưu đãi mở cửa DUY NHẤT** — Sau 31/05/2026, tất cả các khoá trở về giá niêm yết.

> 📞 **0818.823.720** | 📍 258 Lê Thanh Nghị, Hòa Cường, Đà Nẵng`,
    category: "Ưu đãi",
    tags: ["Early Bird", "Ưu đãi", "Khai trương"],
    publishedAt: new Date("2026-05-01"),
    isFeatured: true,
    displayOrder: 4,
    seoTitle:
      "Early Bird Sata Robo — Ưu Đãi 30% Khoá Robotics | Chỉ Đến 31/05/2026",
    seoDescription:
      "Early Bird khai trương Sata Robo: giảm đến 30% khoá Robotics Đà Nẵng. Ưu đãi DUY NHẤT đến 31/05! Cam kết hoàn 100% phí đào tạo bằng văn bản.",
  },
];

async function main() {
  console.log("🚀 Seeding 4 News records (Phase 4.UI.RESET.2 PART D4)...\n");

  for (const item of NEWS) {
    const result = await db.news.upsert({
      where: { slug: item.slug },
      update: { ...item, isPublished: true },
      create: { ...item, isPublished: true },
    });
    console.log(`✅ ${result.slug} — ${result.title}`);
  }

  const total = await db.news.count({ where: { isPublished: true } });
  console.log(`\n📊 Total published News: ${total}`);
}

main()
  .catch((err) => {
    console.error("❌", err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
