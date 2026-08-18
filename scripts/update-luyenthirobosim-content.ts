/**
 * Update Course[luyenthirobosim].description với content Excel.
 * KHÔNG touch UI /khoa-hoc/luyenthirobosim — chỉ update DB.
 *
 * Run: pnpm dotenv -e .env.local -- pnpm tsx scripts/update-luyenthirobosim-content.ts
 */
import { db } from "@/lib/db";

const SHORT_DESCRIPTION =
  "Khoá luyện thi Robosim chuyên biệt — phần mềm bắt buộc trong Cuộc thi Sáng tạo Robotics Toàn Quốc 2026. Cam kết hoàn 100% học phí nếu không vượt vòng loại.";

const DESCRIPTION = `KHOÁ LUYỆN THI ROBOSIM — SATA ROBO

Khoá học luyện thi chuyên sâu sử dụng phần mềm Robosim — công cụ thi BẮT BUỘC trong Cuộc thi Sáng tạo Robotics Toàn Quốc 2026 do Thành Đoàn TP Đà Nẵng tổ chức cùng TW Đoàn TNCS Hồ Chí Minh.

═══════════════════════════════════════
🎯 ĐẶC ĐIỂM NỔI BẬT

✅ ROBOSIM ĐỘC QUYỀN
Phần mềm thi bắt buộc 2026 — chỉ Sata Robo đào tạo chính thức tại Đà Nẵng với giáo án biên tập chi tiết.

✅ LỚP NHỎ ≤12 HV
Giáo viên kèm sát từng học viên. Không em nào bị bỏ lại phía sau.

✅ HỌC BẰNG ĐỀ THI THẬT
Sata Robo đã giải xong đề thi vòng loại 2026 và đưa vào chương trình đào tạo.

✅ CAM KẾT HOÀN 100% HỌC PHÍ
Có cam kết bằng văn bản. Nếu học viên hoàn thành đầy đủ cam kết chuyên cần nhưng không vượt vòng loại để thi chung kết khu vực Miền Trung tại Nghệ An tháng 9/2026 → hoàn trả 100% học phí trong 7 ngày làm việc. Không tranh luận.

═══════════════════════════════════════
👨‍🎓 PHÙ HỢP CHO

- Học sinh lớp 1-8 muốn tham gia Cuộc thi Robotics 2026
- Phụ huynh muốn con luyện thi nghiêm túc, có cam kết đầu ra
- Học viên có nền tảng Robotics muốn chuyên sâu thi đấu

═══════════════════════════════════════
📅 LỊCH TRÌNH CUỘC THI 2026

- Vòng loại cấp TP Đà Nẵng: dự kiến kết thúc 26/07/2026
- Chung kết Khu vực Miền Trung: 13/09/2026 tại Nghệ An

═══════════════════════════════════════
🎁 ƯU ĐÃI KHAI GIẢNG SATA ROBO 2026

- Bảng R1 (Tiểu học): giảm 38% — Bảng R2 (THCS): giảm 45%
- Tặng 1 buổi học thử 1-1 miễn phí cho học viên mới: 45 phút test năng lực + 90 phút học thử 1 kèm 1 trên RoboSim cùng giáo viên
- Áp dụng đến hết 31/12/2026
- Sau ngày này: giá trở về niêm yết

═══════════════════════════════════════
📞 ĐẶT BUỔI HỌC THỬ 1-1 MIỄN PHÍ

Hotline: 0818.823.720
Email: thongtin@satarobo.vn
Trụ sở: 258 Lê Thanh Nghị, Hải Châu, Đà Nẵng`;

async function main() {
  console.log("🚀 Update Course[luyenthirobosim] description\n");

  const result = await db.course.update({
    where: { slug: "luyenthirobosim" },
    data: {
      shortDescription: SHORT_DESCRIPTION,
      description: DESCRIPTION,
    },
  });

  console.log(`✅ Updated Course[${result.slug}]`);
  console.log(`   shortDescription: ${result.shortDescription?.substring(0, 60)}...`);
  console.log(`   description length: ${result.description?.length} chars`);
}

main()
  .catch((err) => {
    console.error("❌", err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
