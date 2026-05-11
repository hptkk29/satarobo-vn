import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  console.log("🌱 Bắt đầu seed data...");

  // ─── Centers ─────────────────────────────────────────────────────────────────
  const centers = await Promise.all([
    db.center.upsert({
      where: { id: "center-hoa-cuong" },
      update: {},
      create: {
        id: "center-hoa-cuong",
        name: "Sata Robo — Hoà Cường",
        address: "258 Lê Thanh Nghị, Hoà Cường Nam, Hải Châu, Đà Nẵng",
        phone: "0818823720",
        email: "satarobo@gmail.com",
      },
    }),
    db.center.upsert({
      where: { id: "center-hai-chau" },
      update: {},
      create: {
        id: "center-hai-chau",
        name: "Sata Robo — Hải Châu",
        address: "Quận Hải Châu, Đà Nẵng (sắp khai trương)",
        phone: "0818823720",
      },
    }),
    db.center.upsert({
      where: { id: "center-son-tra" },
      update: {},
      create: {
        id: "center-son-tra",
        name: "Sata Robo — Sơn Trà",
        address: "Quận Sơn Trà, Đà Nẵng (sắp khai trương)",
        phone: "0818823720",
      },
    }),
    db.center.upsert({
      where: { id: "center-ngu-hanh-son" },
      update: {},
      create: {
        id: "center-ngu-hanh-son",
        name: "Sata Robo — Ngũ Hành Sơn",
        address: "Quận Ngũ Hành Sơn, Đà Nẵng (sắp khai trương)",
        phone: "0818823720",
      },
    }),
    db.center.upsert({
      where: { id: "center-thanh-khe" },
      update: {
        name: "Sata Robo — Thanh Khê",
        address: "269 Điện Biên Phủ, Thanh Khê, Đà Nẵng",
        phone: "0818823720",
      },
      create: {
        id: "center-thanh-khe",
        name: "Sata Robo — Thanh Khê",
        address: "269 Điện Biên Phủ, Thanh Khê, Đà Nẵng",
        phone: "0818823720",
      },
    }),
    db.center.upsert({
      where: { id: "center-hoa-khe" },
      update: {
        name: "Sata Robo — Hoà Khê",
        address: "232 Nguyễn Phước Lan, Hoà Khê, Đà Nẵng",
        phone: "0818823720",
      },
      create: {
        id: "center-hoa-khe",
        name: "Sata Robo — Hoà Khê",
        address: "232 Nguyễn Phước Lan, Hoà Khê, Đà Nẵng",
        phone: "0818823720",
      },
    }),
  ]);
  console.log(`✅ ${centers.length} trung tâm đã tạo`);

  // ─── Courses ─────────────────────────────────────────────────────────────────
  const courses = await Promise.all([
    db.course.upsert({
      where: { slug: "lap-trinh-robot" },
      update: {},
      create: {
        slug: "lap-trinh-robot",
        name: "Khoá Lập trình Robot Offline",
        type: "OFFLINE",
        description:
          "Khoá học lập trình robot thực tế cho học sinh lớp 1-8. Học viên được thực hành trực tiếp với robot, phát triển tư duy logic và kỹ năng STEM.",
        isActive: true,
      },
    }),
    db.course.upsert({
      where: { slug: "luyen-thi-robosim" },
      update: {},
      create: {
        slug: "luyen-thi-robosim",
        name: "Khoá Luyện thi RoboSim Online",
        type: "ONLINE",
        description:
          "Khoá luyện thi RoboSim trực tuyến, giúp học sinh chinh phục các kỳ thi Robotics cấp thành phố và quốc gia.",
        isActive: true,
      },
    }),
  ]);
  console.log(`✅ ${courses.length} khoá học đã tạo`);

  // ─── SUPER_ADMIN ──────────────────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash("ChangeMe@2026!", 12);
  const admin = await db.user.upsert({
    where: { email: "phuc@satarobo.vn" },
    update: {},
    create: {
      email: "phuc@satarobo.vn",
      name: "Hồ Đắc Phúc",
      password: hashedPassword,
      role: "SUPER_ADMIN",
      centerId: "center-hoa-cuong",
      isActive: true,
    },
  });
  console.log(`✅ Admin tạo xong: ${admin.email}`);

  // ─── Blog Posts ───────────────────────────────────────────────────────────────
  const blogPosts = await Promise.all([
    db.blogPost.upsert({
      where: { slug: 'tai-sao-tre-can-hoc-lap-trinh-robot' },
      update: {},
      create: {
        slug: 'tai-sao-tre-can-hoc-lap-trinh-robot',
        title: 'Tại sao trẻ em cần học lập trình Robot từ sớm?',
        excerpt: 'Trong thế giới công nghệ phát triển vũ bão, tư duy lập trình và kỹ năng STEM không còn là "môn học thêm" mà là nền tảng thiết yếu cho tương lai của con.',
        content: `## Thế giới đang thay đổi — và con cần được chuẩn bị

Theo báo cáo của World Economic Forum, **65% công việc của thế hệ Z chưa tồn tại** vào thời điểm hiện tại. Điều đó có nghĩa là gì? Nghĩa là chúng ta cần chuẩn bị cho con không phải bằng kiến thức cụ thể, mà bằng **tư duy linh hoạt, khả năng giải quyết vấn đề và sáng tạo**.

Lập trình Robot chính là môi trường lý tưởng để rèn luyện những kỹ năng này.

## 5 lý do phụ huynh nên cho con học lập trình Robot

### 1. Phát triển tư duy logic có hệ thống

Khi lập trình, trẻ phải chia nhỏ vấn đề lớn thành các bước nhỏ có thứ tự. Đây chính là **computational thinking** — kỹ năng tư duy nền tảng mà các nhà tuyển dụng hàng đầu thế giới tìm kiếm.

### 2. Học qua thất bại — không sợ sai

Robot không biết nói dối. Code chạy sai thì robot làm sai. Trẻ phải tự tìm lỗi, sửa, chạy lại. Quá trình đó xây dựng **khả năng chịu đựng thất bại và kiên trì** — điều mà không có sách giáo khoa nào dạy được.

### 3. Kết hợp lý thuyết và thực hành

Toán học không còn trừu tượng khi trẻ thấy robot di chuyển đúng quãng đường đã tính. Vật lý không còn khô khan khi cảm biến đo được lực chính xác. **STEM trở nên sống động và có ý nghĩa**.

### 4. Phát triển kỹ năng làm việc nhóm

Dự án Robot thường làm theo nhóm. Trẻ phải phân công nhiệm vụ, giải quyết xung đột ý kiến, cùng nhau đạt mục tiêu chung — **kỹ năng mềm quan trọng không kém kỹ năng kỹ thuật**.

### 5. Mở ra cơ hội thi đấu quốc tế

Các kỳ thi như **WRO (World Robot Olympiad), RoboSim, FLL** là cơ hội để con thể hiện tài năng ở sân chơi quốc tế, xây dựng hồ sơ học bổng ấn tượng.

## Bắt đầu từ đâu?

Sata Robo thiết kế lộ trình học phù hợp cho từng độ tuổi:

- **Lớp 1-3:** Làm quen với tư duy lập trình qua trò chơi và robot đơn giản
- **Lớp 4-6:** Lập trình logic cơ bản, điều khiển cảm biến
- **Lớp 7-8:** Lập trình nâng cao, chuẩn bị thi đấu

> "Con tôi học được 3 tháng, bây giờ tự mày mò sửa đồ điện tử trong nhà. Quan trọng hơn là con không còn nản lòng khi gặp khó khăn nữa." — Phụ huynh học viên lớp 5

Hãy để con bước vào thế giới của tương lai từ hôm nay. **[Đăng ký tư vấn miễn phí →](/lien-he)**`,
        isPublished: true,
        publishedAt: new Date('2026-04-15'),
        category: 'phu-huynh',
        tags: ['lập trình', 'robotics', 'stem', 'giáo dục', 'kỹ năng'],
        readingTime: 5,
        seoTitle: 'Tại sao trẻ cần học lập trình Robot từ sớm? — Sata Robo',
        seoDesc: 'Khám phá 5 lý do khoa học chứng minh lập trình Robot giúp trẻ phát triển tư duy, kỹ năng mềm và chuẩn bị cho tương lai số.',
        authorId: admin.id,
      },
    }),
    db.blogPost.upsert({
      where: { slug: 'robosim-la-gi-huong-dan-thi-dau' },
      update: {},
      create: {
        slug: 'robosim-la-gi-huong-dan-thi-dau',
        title: 'RoboSim là gì? Hướng dẫn thi đấu từ A đến Z cho học sinh',
        excerpt: 'RoboSim là sân thi đấu Robotics ảo lớn nhất Việt Nam. Bài viết này giải thích cấu trúc giải đấu, cách tính điểm và lộ trình luyện tập hiệu quả.',
        content: `## RoboSim — Giải đấu Robotics ảo hàng đầu Việt Nam

**RoboSim** (Robot Simulation) là nền tảng thi đấu lập trình robot ảo do Bộ GD&ĐT phối hợp tổ chức, dành cho học sinh tiểu học và THCS. Khác với các giải đấu robot vật lý, RoboSim thi trên môi trường mô phỏng — giúp mọi học sinh đều có cơ hội tham gia dù không có robot thật.

## Cấu trúc giải đấu

### Các vòng thi

| Vòng | Hình thức | Thời gian |
|------|-----------|-----------|
| Vòng sơ loại | Thi trực tuyến trên nền tảng | Tháng 10-11 |
| Vòng chung kết cấp tỉnh | Thi tập trung | Tháng 12 |
| Vòng chung kết toàn quốc | Thi tập trung tại Hà Nội | Tháng 1-2 |

### Bảng thi

- **Bảng A (Tiểu học):** Lớp 3-5
- **Bảng B (THCS):** Lớp 6-8

## Nội dung thi

Đề thi RoboSim thường gồm 3 phần:

### Phần 1: Lập trình cơ bản (30 điểm)
Viết code điều khiển robot di chuyển theo lộ trình cho sẵn. Yêu cầu hiểu biết về vòng lặp, điều kiện, biến số.

### Phần 2: Xử lý cảm biến (40 điểm)
Robot phải phản ứng với môi trường: tránh vật cản, theo đường kẻ, nhận diện màu sắc.

### Phần 3: Bài toán tổng hợp (30 điểm)
Kết hợp tất cả kỹ năng để giải quyết một kịch bản thực tế phức tạp hơn.

## Lộ trình luyện tập tại Sata Robo

\`\`\`
Tháng 1-2: Nền tảng lập trình — biến, vòng lặp, điều kiện
Tháng 3-4: Điều khiển robot — di chuyển chính xác
Tháng 5-6: Xử lý cảm biến — ánh sáng, khoảng cách, màu sắc
Tháng 7-8: Giải đề thi năm trước, phân tích lỗi
Tháng 9:   Luyện thi sprint, mô phỏng điều kiện thi thật
\`\`\`

## Học sinh Sata Robo đã đạt được gì?

- 🏆 **12 giải thưởng** cấp thành phố năm học 2024-2025
- 🥇 **3 học sinh** vào vòng chung kết toàn quốc
- 📈 **87%** học sinh hoàn thành khoá vượt qua vòng sơ loại

> Đăng ký **khóa luyện thi RoboSim** tại Sata Robo ngay hôm nay để con được học đúng lộ trình, đúng đề thi. **[Xem khóa học →](/khoa-hoc/luyen-thi-robosim)**`,
        isPublished: true,
        publishedAt: new Date('2026-04-22'),
        category: 'giao-duc',
        tags: ['robosim', 'thi đấu', 'luyện thi', 'robotics', 'học sinh'],
        readingTime: 6,
        seoTitle: 'RoboSim là gì? Hướng dẫn thi đấu từ A đến Z — Sata Robo',
        seoDesc: 'Tìm hiểu cấu trúc giải đấu RoboSim, nội dung thi, cách tính điểm và lộ trình luyện tập hiệu quả để học sinh đạt giải cao.',
        authorId: admin.id,
      },
    }),
    db.blogPost.upsert({
      where: { slug: 'sata-inno-school-giai-phap-stem-truong-hoc' },
      update: {},
      create: {
        slug: 'sata-inno-school-giai-phap-stem-truong-hoc',
        title: 'Sata Inno School — Giải pháp STEM toàn diện cho nhà trường',
        excerpt: 'Sata Inno School là chương trình B2B của Sata Robo, mang phòng lab Robotics và chương trình học chuẩn quốc tế vào thẳng trường học.',
        content: `## Bài toán mà nhà trường đang đối mặt

Nhiều trường học tại Đà Nẵng và toàn quốc đang đứng trước áp lực phải triển khai **giáo dục STEM theo Chương trình GDPT 2018**, nhưng gặp phải 3 vướng mắc lớn:

1. **Thiếu cơ sở vật chất** — không có phòng lab, thiết bị robot đắt tiền
2. **Thiếu giáo viên** — giáo viên hiện tại chưa được đào tạo về Robotics
3. **Thiếu chương trình** — không biết dạy gì, theo chuẩn nào

**Sata Inno School** ra đời để giải quyết cả 3 vướng mắc đó.

## Sata Inno School là gì?

Đây là **gói giải pháp tổng thể**, bao gồm:

### 🏫 Phòng Lab Robotics Turnkey
- Thiết kế và lắp đặt phòng học chuyên dụng
- Trang bị đầy đủ robot học tập, máy tính, bảng tương tác
- Bảo trì thiết bị trong suốt thời gian hợp đồng

### 📚 Chương trình học theo chuẩn WRO
- Giáo trình biên soạn theo chuẩn **World Robot Olympiad**
- Phân cấp rõ ràng theo lớp, theo năng lực
- Tài liệu học tập và bài tập thực hành đi kèm

### 👩‍🏫 Đào tạo giáo viên
- Workshop đào tạo GV 40 giờ trước khi khai giảng
- Hỗ trợ trực tuyến trong suốt năm học
- Cập nhật chương trình hàng năm

### 🏆 Hỗ trợ thi đấu
- Đăng ký và chuẩn bị cho học sinh thi RoboSim, WRO cấp trường/tỉnh/quốc gia
- Đội ngũ huấn luyện viên kèm cặp đội tuyển

## Các trường đã triển khai

> "Sau 1 năm với Sata Inno School, trường chúng tôi đã có 2 học sinh vào top 10 RoboSim cấp thành phố. Phụ huynh phản hồi rất tích cực, tỉ lệ tái đăng ký lên tới 94%." — Hiệu trưởng Trường Tiểu học Lê Văn Tám, Đà Nẵng

## Mô hình hợp tác linh hoạt

| Gói | Phù hợp | Chi tiết |
|-----|---------|---------|
| **Starter** | Trường mới bắt đầu | 1 phòng lab, 2 lớp/tuần, 1 GV đào tạo |
| **Standard** | Trường muốn mở rộng | 2 phòng lab, 5 lớp/tuần, 2 GV đào tạo |
| **Premium** | Trường muốn có đội tuyển mạnh | Full lab, không giới hạn lớp, team huấn luyện |

**Liên hệ ngay để nhận báo giá và lịch khảo sát trường miễn phí:** [0818 823 720](tel:0818823720)`,
        isPublished: true,
        publishedAt: new Date('2026-05-01'),
        category: 'doanh-nghiep',
        tags: ['b2b', 'trường học', 'stem', 'phòng lab', 'sata inno school'],
        readingTime: 5,
        seoTitle: 'Sata Inno School — Giải pháp STEM Robot cho trường học tại Đà Nẵng',
        seoDesc: 'Chương trình B2B của Sata Robo: phòng lab Robotics turnkey, chương trình học chuẩn WRO, đào tạo giáo viên và hỗ trợ thi đấu cho các trường.',
        authorId: admin.id,
      },
    }),
    db.blogPost.upsert({
      where: { slug: 'satago-du-lich-giao-duc-stem' },
      update: {},
      create: {
        slug: 'satago-du-lich-giao-duc-stem',
        title: 'SATAGO — Khi du lịch kết hợp giáo dục STEM tạo ra trải nghiệm đáng nhớ',
        excerpt: 'SATAGO là chương trình du lịch giáo dục STEM độc đáo của Sata Robo — nơi học sinh vừa được khám phá, vừa học lập trình và chế tạo robot trong môi trường thực tế.',
        content: `## "Học mà chơi, chơi mà học" — không phải khẩu hiệu suông

Hè 2025, hơn 200 học sinh tham gia chương trình **SATAGO** tại Đà Nẵng và Hội An đã mang về nhà không chỉ ảnh chụp và kỷ niệm, mà còn cả **robot tự tay lắp ráp và lập trình**.

## SATAGO là gì?

**SATAGO** (Sata Robo Adventure Go) là chương trình **du lịch giáo dục STEM** kết hợp:
- Trải nghiệm thực địa tại các điểm du lịch, cơ sở sản xuất, bảo tàng khoa học
- Workshop lắp ráp và lập trình robot
- Thử thách nhóm giải quyết vấn đề thực tế
- Kết nối với thiên nhiên và văn hoá địa phương

## Một ngày với SATAGO trông như thế nào?

### 7:00 — Khởi hành từ trung tâm

Xe đưa đón học sinh từ trung tâm Sata Robo. Trên xe, các bạn nhỏ được nghe briefing nhiệm vụ ngày hôm đó.

### 8:30 — Thực địa buổi sáng

Ví dụ chuyến "Khám phá nhà máy": học sinh tham quan dây chuyền sản xuất thực tế, quan sát robot công nghiệp, đặt câu hỏi với kỹ sư.

### 10:00 — Workshop "Giải quyết vấn đề"

Dựa trên những gì quan sát được, học sinh chia nhóm thiết kế giải pháp mini bằng robot kit. **Không có đáp án đúng duy nhất** — sáng tạo được khuyến khích.

### 12:00 — Ăn trưa + thư giãn

Bữa trưa tại nhà hàng địa phương, thời gian tự do khám phá.

### 14:00 — Thử thách nhóm

Mỗi nhóm trình bày robot của mình, thực hiện thử thách thực tế. Giải thưởng cho nhóm sáng tạo nhất, nhóm hợp tác tốt nhất.

### 17:00 — Về đến trung tâm

Học sinh mang về robot đã lắp ráp và tâm thế đầy tự hào.

## Lịch SATAGO Hè 2026

| Chương trình | Thời gian | Địa điểm | Số chỗ |
|-------------|-----------|----------|--------|
| Khám phá nhà máy | 15/6 | KCN Hoà Khánh | 30 học sinh |
| Bảo tàng Khoa học | 22/6 | TP Đà Nẵng | 30 học sinh |
| Làng nghề truyền thống | 6/7 | Hội An | 25 học sinh |
| Trại hè Robot 3 ngày | 21-23/7 | Bà Nà Hills | 40 học sinh |

> ⚠️ Các chương trình thường đầy chỗ trước 2-3 tuần. **Đăng ký sớm để giữ chỗ cho con!**

**[Xem lịch đầy đủ và đăng ký →](/khoa-hoc)**`,
        isPublished: true,
        publishedAt: new Date('2026-05-05'),
        category: 'tin-tuc',
        tags: ['satago', 'du lịch giáo dục', 'stem', 'hè', 'trải nghiệm'],
        readingTime: 4,
        seoTitle: 'SATAGO — Du lịch giáo dục STEM hè 2026 tại Đà Nẵng — Sata Robo',
        seoDesc: 'Chương trình du lịch giáo dục STEM SATAGO: học sinh vừa khám phá thực địa vừa lắp ráp và lập trình robot. Đăng ký hè 2026.',
        authorId: admin.id,
      },
    }),
    db.blogPost.upsert({
      where: { slug: 'cha-me-can-biet-chon-trung-tam-robot' },
      update: {},
      create: {
        slug: 'cha-me-can-biet-chon-trung-tam-robot',
        title: '5 tiêu chí phụ huynh cần kiểm tra khi chọn trung tâm học Robot cho con',
        excerpt: 'Thị trường trung tâm dạy Robot đang bùng nổ, khiến phụ huynh khó lựa chọn. Đây là 5 tiêu chí thực tế giúp bạn đánh giá đúng chất lượng.',
        content: `## Đừng để "giảm giá 50%" làm mờ mắt

Khi trung tâm Robotics mọc lên như nấm, phụ huynh đứng trước rừng lựa chọn: quảng cáo nào cũng hứa hẹn "chuẩn quốc tế", "giáo viên chuyên nghiệp", "đảm bảo vào WRO". Vậy làm sao phân biệt thật — giả?

Dưới đây là **5 tiêu chí cứng** mà Sata Robo khuyên phụ huynh nên hỏi thẳng trước khi đăng ký.

## Tiêu chí 1: Giáo viên được đào tạo bài bản chưa?

Câu hỏi cần hỏi:
- Giáo viên có chứng chỉ lập trình/robotics từ tổ chức nào?
- Giáo viên có từng thi đấu hoặc huấn luyện đội tuyển?
- Tỉ lệ giáo viên/học sinh trong lớp là bao nhiêu?

**Lớp lý tưởng:** Tối đa 8-10 học sinh/giáo viên để đảm bảo sự chú ý cá nhân.

## Tiêu chí 2: Chương trình học có lộ trình rõ ràng không?

Trung tâm tốt phải cung cấp được:
- Syllabus chi tiết cho từng cấp độ
- Mục tiêu cụ thể sau mỗi khoá (con làm được gì?)
- Cách đánh giá tiến độ học viên

❌ **Cảnh báo:** Trung tâm không có syllabus, chỉ nói chung chung "học robot WeDo/LEGO/Scratch" mà không có lộ trình cụ thể.

## Tiêu chí 3: Thiết bị và cơ sở vật chất

- Robot có phải hàng chính hãng? (LEGO Education, Makeblock, VEX...)
- Phòng học có đủ ánh sáng, diện tích, máy tính?
- Thiết bị có được bảo trì thường xuyên?

💡 **Mẹo:** Hỏi xin tham quan cơ sở trước khi đăng ký. Trung tâm tự tin về cơ sở vật chất sẽ không từ chối.

## Tiêu chí 4: Thành tích thi đấu thực tế

- Có bao nhiêu học viên từng thi RoboSim, WRO, FLL?
- Kết quả cụ thể: giải mấy, vòng nào?
- Có thể liên hệ phụ huynh học viên cũ để hỏi thêm không?

Thành tích là minh chứng khách quan nhất cho chất lượng đào tạo.

## Tiêu chí 5: Chính sách học thử và hoàn tiền

Trung tâm có niềm tin vào chương trình của mình sẽ không ngại:
- Cho học thử **1-2 buổi miễn phí**
- Hoàn tiền nếu con không phù hợp sau 2-3 buổi đầu

❌ **Cảnh báo:** Yêu cầu đóng cả khoá ngay từ đầu mà không có học thử — rủi ro cao cho phụ huynh.

---

## Sata Robo cam kết 5 tiêu chí trên như thế nào?

| Tiêu chí | Sata Robo |
|---------|-----------|
| Giáo viên | Tốt nghiệp ĐH kỹ thuật, chứng chỉ WRO, tỉ lệ 1:8 |
| Chương trình | Syllabus 36 tuần/cấp độ, đánh giá hàng tháng |
| Thiết bị | LEGO Education chính hãng, phòng lab 40m² |
| Thành tích | 12 giải thành phố, 3 top 10 quốc gia (2024-2025) |
| Học thử | 2 buổi miễn phí, hoàn 100% phí khoá 1 nếu không hài lòng |

**[Đăng ký học thử miễn phí ngay →](/lien-he?subject=hoc-thu)**`,
        isPublished: true,
        publishedAt: new Date('2026-05-08'),
        category: 'phu-huynh',
        tags: ['tư vấn', 'chọn trung tâm', 'phụ huynh', 'chất lượng', 'robotics'],
        readingTime: 6,
        seoTitle: '5 tiêu chí chọn trung tâm học Robot cho con — Sata Robo',
        seoDesc: 'Hướng dẫn thực tế giúp phụ huynh đánh giá đúng chất lượng trung tâm dạy Robot: giáo viên, chương trình, thiết bị, thành tích và chính sách học thử.',
        authorId: admin.id,
      },
    }),
  ])
  console.log(`✅ ${blogPosts.length} bài viết blog đã tạo`)

  // ─── Job Postings ─────────────────────────────────────────────────────────────
  const jobsData = [
    {
      slug: 'sale-tu-van-tuyen-sinh',
      title: 'Sale Tư vấn Tuyển sinh',
      department: 'marketing-sale',
      location: 'danang',
      type: 'fulltime',
      description: `## Mô tả công việc\n\nSata Robo đang tìm 2 chuyên viên Sale Tư vấn Tuyển sinh năng động cho 4 trung tâm tại Đà Nẵng.\n\n**Trách nhiệm chính:**\n\n- Tư vấn các khoá học Robotics, lập trình, luyện thi cho phụ huynh và học sinh\n- Tiếp nhận lead từ marketing, gọi điện và hẹn lịch demo trực tiếp tại trung tâm\n- Theo dõi pipeline trong CRM, cập nhật trạng thái từng lead\n- Đạt KPI doanh số cá nhân hàng tháng\n- Phối hợp với đội Marketing để tối ưu chất lượng lead\n\n**Khu vực phụ trách:** Đà Nẵng (4 cơ sở)`,
      requirements: `## Yêu cầu\n\n**Kinh nghiệm:**\n- Tối thiểu 1 năm kinh nghiệm Sale/Telesales (ưu tiên ngành giáo dục)\n- Hoặc Fresher có khả năng học hỏi tốt, đam mê lĩnh vực giáo dục\n\n**Kỹ năng:**\n- Giao tiếp tốt với phụ huynh, có khả năng lắng nghe và thuyết phục\n- Kiên trì, chịu áp lực KPI cao\n- Sử dụng thành thạo Zalo, Facebook, email\n\n**Cá tính:**\n- Yêu trẻ em, kiên nhẫn với phụ huynh\n- Tinh thần đồng đội, sẵn sàng học hỏi`,
      benefits: `## Quyền lợi\n\n**Thu nhập:**\n- Lương cơ bản: 7–10 triệu/tháng\n- Hoa hồng theo doanh số (không giới hạn)\n- Tổng thu nhập trung bình: 12–20 triệu/tháng\n\n**Phúc lợi:**\n- BHXH, BHYT, BHTN đầy đủ\n- Thưởng các ngày lễ và lương tháng 13\n- Phụ cấp xăng xe, ăn trưa\n- Đào tạo nội bộ chuyên sâu\n\n**Môi trường:**\n- Team trẻ, năng động, lộ trình thăng tiến rõ ràng\n- Giờ làm: T2–T6 (8h30–17h30) + T7 sáng`,
      salaryMin: 7_000_000,
      salaryMax: 20_000_000,
      salaryNote: null as string | null,
      status: 'OPEN' as const,
      openings: 2,
      closesAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    {
      slug: 'giang-vien-robotics',
      title: 'Giảng viên Robotics & Lập trình',
      department: 'dao-tao',
      location: 'danang',
      type: 'fulltime',
      description: `## Mô tả công việc\n\nBạn sẽ trực tiếp giảng dạy các khoá **Lập trình Robot** và **Luyện thi RoboSim** cho học sinh lớp 1–8 tại các cơ sở Sata Robo.\n\n**Trách nhiệm:**\n\n- Lên giáo án và giảng dạy theo chương trình chuẩn WRO\n- Theo dõi và đánh giá tiến độ từng học viên\n- Tham gia nghiên cứu phát triển giáo trình mới\n- Hướng dẫn và huấn luyện đội tuyển thi đấu\n- Báo cáo định kỳ với Trưởng bộ môn`,
      requirements: `## Yêu cầu\n\n- Tốt nghiệp ĐH ngành Kỹ thuật, CNTT, Cơ điện tử hoặc liên quan\n- Đam mê giáo dục và làm việc với trẻ em\n- Có kiến thức lập trình (Scratch, Python, C++ là lợi thế)\n- Ưu tiên: đã từng thi đấu Robotics hoặc có chứng chỉ liên quan\n- Kiên nhẫn, có kỹ năng truyền đạt tốt`,
      benefits: `## Quyền lợi\n\n- Lương: 8–15 triệu/tháng tuỳ năng lực\n- Được đào tạo chuyên sâu 40 giờ trước khi đứng lớp\n- Cơ hội phát triển thành GV Lead hoặc Trưởng bộ môn\n- BHXH đầy đủ, phụ cấp ăn trưa\n- Môi trường học thuật, được tiếp cận thiết bị robot hiện đại`,
      salaryMin: 8_000_000,
      salaryMax: 15_000_000,
      salaryNote: null as string | null,
      status: 'OPEN' as const,
      openings: 3,
      closesAt: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
    },
    {
      slug: 'marketing-specialist',
      title: 'Marketing Specialist',
      department: 'marketing',
      location: 'danang',
      type: 'fulltime',
      description: `## Mô tả công việc\n\nBạn sẽ phụ trách toàn bộ hoạt động marketing digital cho Sata Robo — từ content creation đến performance ads.\n\n**Trách nhiệm:**\n\n- Lên kế hoạch và triển khai chiến lược content: blog, Facebook, TikTok, YouTube\n- Chạy và tối ưu quảng cáo Facebook Ads, Google Ads\n- Phân tích dữ liệu (GA4, Meta Pixel, CRM) và báo cáo hàng tuần\n- Phối hợp với team Sales để tối ưu conversion rate\n- Quản lý KOL/KOC và các chiến dịch collaboration`,
      requirements: `## Yêu cầu\n\n- Tốt nghiệp ĐH ngành Marketing, Truyền thông, QTKD hoặc liên quan\n- Tối thiểu 2 năm kinh nghiệm Digital Marketing\n- Thành thạo Facebook Ads Manager, Google Ads\n- Biết viết content chuẩn SEO, thiết kế cơ bản (Canva/Figma)\n- Có dữ liệu thành tích chiến dịch cụ thể (ROAS, CPL, CTR...)`,
      benefits: `## Quyền lợi\n\n- Lương: 10–18 triệu/tháng + thưởng KPI\n- Budget quảng cáo riêng để thử nghiệm và học hỏi\n- Được đầu tư công cụ: Canva Pro, scheduling tool, analytics\n- Môi trường sáng tạo, tự chủ cao\n- BHXH đầy đủ, thưởng tháng 13`,
      salaryMin: 10_000_000,
      salaryMax: 18_000_000,
      salaryNote: null as string | null,
      status: 'OPEN' as const,
      openings: 1,
      closesAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    {
      slug: 'frontend-developer-nextjs',
      title: 'Frontend Developer (React / Next.js)',
      department: 'it',
      location: 'online-hybrid',
      type: 'fulltime',
      description: `## Mô tả công việc\n\nBạn sẽ phát triển và duy trì **satarobo.vn** và các sản phẩm web nội bộ của Sata Robo — bao gồm website marketing, admin CRM và LMS học viên.\n\n**Trách nhiệm:**\n\n- Phát triển tính năng mới cho website theo yêu cầu của Product Owner\n- Tối ưu performance (Core Web Vitals, Lighthouse score ≥ 90)\n- Code review và maintain code quality\n- Phối hợp với team Marketing để implement tracking (GA4, Meta Pixel)\n- Báo cáo tiến độ và đề xuất cải tiến kỹ thuật`,
      requirements: `## Yêu cầu\n\n**Bắt buộc:**\n- Tối thiểu 2 năm kinh nghiệm React.js\n- Thành thạo Next.js App Router (RSC, Server Actions)\n- TypeScript strict mode\n- Tailwind CSS, responsive design\n- Hiểu biết về Web Performance và SEO kỹ thuật\n\n**Lợi thế:**\n- Có kinh nghiệm Prisma / PostgreSQL\n- Đã từng build CMS hoặc admin panel\n- Hiểu về tracking (GA4, Meta Pixel, CAPI)`,
      benefits: `## Quyền lợi\n\n- Lương: 15–30 triệu/tháng tuỳ năng lực\n- Làm việc Hybrid: 3 ngày remote, 2 ngày tại Đà Nẵng (hoặc Full Remote với senior)\n- Được chọn công cụ và setup môi trường làm việc\n- Review lương 2 lần/năm\n- Budget học tập 5 triệu/năm (sách, khoá học, conference)\n- BHXH đầy đủ`,
      salaryMin: 15_000_000,
      salaryMax: 30_000_000,
      salaryNote: null as string | null,
      status: 'OPEN' as const,
      openings: 1,
      closesAt: null,
    },
    {
      slug: 'thuc-tap-sinh-marketing',
      title: 'Thực tập sinh Marketing',
      department: 'marketing',
      location: 'danang',
      type: 'intern',
      description: `## Mô tả công việc\n\nBạn sẽ được trải nghiệm thực tế tại bộ phận Marketing — không phải pha cà phê và photo tài liệu, mà là **làm việc thật**.\n\n**Bạn sẽ làm:**\n\n- Sản xuất nội dung: viết bài blog, caption mạng xã hội, kịch bản TikTok\n- Thiết kế poster, banner sự kiện bằng Canva\n- Hỗ trợ chạy và theo dõi chiến dịch quảng cáo\n- Phân tích số liệu từ Facebook Insights, Google Analytics\n- Tham gia sự kiện và hoạt động của trung tâm`,
      requirements: `## Yêu cầu\n\n- Sinh viên năm 3–4 ngành Marketing, Truyền thông, QTKD hoặc liên quan\n- Có thể đi làm tối thiểu 4 buổi/tuần\n- Biết Canva (Figma là lợi thế)\n- Có tài khoản Facebook/TikTok/Instagram hoạt động\n- Nhiệt tình, ham học hỏi, có khiếu sáng tạo nội dung`,
      benefits: `## Quyền lợi\n\n- Phụ cấp: 3–5 triệu/tháng tuỳ mức độ đóng góp\n- Được mentor 1:1 với Marketing Manager\n- Thực hành thật với budget quảng cáo thật\n- Cơ hội chuyển thành nhân viên chính thức sau thực tập\n- Chứng nhận thực tập có giá trị, được ký và đóng dấu công ty`,
      salaryMin: 3_000_000,
      salaryMax: 5_000_000,
      salaryNote: null as string | null,
      status: 'OPEN' as const,
      openings: 2,
      closesAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    },
  ]

  let jobCount = 0
  for (const job of jobsData) {
    await db.jobPosting.upsert({
      where: { slug: job.slug },
      update: { ...job, authorId: admin.id },
      create: { ...job, authorId: admin.id },
    })
    jobCount++
  }
  console.log(`✅ ${jobCount} tin tuyển dụng đã tạo`)

  console.log("\n🎉 Seed hoàn tất!");
  console.log("─".repeat(50));
  console.log("📧 Email:    phuc@satarobo.vn");
  console.log("🔑 Password: ChangeMe@2026!");
  console.log("⚠️  Đổi mật khẩu ngay sau khi đăng nhập lần đầu!");
  console.log("─".repeat(50));
}

main()
  .catch((e) => {
    console.error("❌ Seed thất bại:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
