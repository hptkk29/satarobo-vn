/**
 * scripts/nhap-gia-khoa-cong-van.ts — nạp BẢNG GIÁ NIÊM YẾT theo SR.QD.219 vào `Course`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NGUỒN: `E:\Cong_van\32 - SR.QD.219 - Chính sách giá bán sản phẩm tạo trung tâm đào tạo
 * Sata Robo.docx`, Điều 3 (Nhóm 1 — luyện thi/cam kết) và Điều 4 (Nhóm 2 — chuyên sâu 48
 * buổi). Số ở đây trích NGUYÊN VĂN từ hai bảng đó; đừng sửa cho khớp DB — sai số nghĩa là
 * công văn đã đổi, và khi đó phải sửa cả hai.
 *
 * ⚠️ ĐÂY KHÔNG PHẢI BẢN SAO CỦA PROD. Máy dev không chạm được DB prod (`.env` trỏ DEV,
 * `DATABASE_URL` prod là biến Sensitive trên Vercel — xem CLAUDE.md). Thứ script này nạp
 * là GIÁ CÔNG VĂN, tức thứ prod PHẢI theo. Nếu prod đang lệch bảng này thì đó là phát hiện
 * cần báo, không phải lý do sửa script.
 *
 * ⚠️ NÓ ĐỔI `totalSessions`, VÀ CỘT ĐÓ KHÔNG CHỈ DÙNG ĐỂ TÍNH GIÁ.
 * `lib/classes/generate.ts` lấy nó làm SỐ BUỔI SINH RA khi mở lớp, và
 * `lib/classes/end-date.ts` lấy nó tính ngày kết thúc. Lớp ĐÃ TẠO không đổi (buổi đã nằm
 * trong `ClassSession`), nhưng lớp mở SAU khi chạy script sẽ theo số buổi mới. Đó là
 * đúng ý — chỉ cần biết trước.
 *
 * CÁCH CHẠY (mặc định DRY-RUN, không ghi gì):
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/satarobo_local' \
 *   DIRECT_URL="$DATABASE_URL" pnpm exec tsx scripts/nhap-gia-khoa-cong-van.ts
 *
 * Ghi thật: thêm `--ghi`.
 */
import { PrismaClient, type CourseCategory, type CourseType } from "@prisma/client";

type KhoaCongVan = {
  /** Mã trong công văn ("Sata1") → `Course.code` dạng viết hoa. */
  code: string;
  slug: string;
  name: string;
  /** Khối lớp theo công văn; `null` cho Sata8 (công văn ghi "—"). */
  ageRange: string | null;
  soBuoi: number;
  giaNiemYet: number;
  category: CourseCategory;
  ghiChu?: string;
};

/**
 * Điều 3 + Điều 4. Thứ tự hiện trên màn theo `displayOrder` = vị trí trong mảng.
 *
 * ⚠️ MỌI GIÁ Ở ĐÂY CHIA CHẴN CHO SỐ BUỔI — đó là thuộc tính của bảng giá, không phải
 * trùng hợp: 2.400.000/16 = 150.000 · 10.560.000/48 = 220.000 · 14.400.000/48 = 300.000.
 * Bảng Coach ở Điều 5 của công văn khớp chính xác với phép chia này, nên khi DB mang đúng
 * bảng này thì gợi ý giá Coach ở /orders/new ra số TRÒN, không còn lệch ±4đ do làm tròn.
 */
const KHOA: KhoaCongVan[] = [
  // ── Điều 3 — Nhóm 1: luyện thi ngắn hạn + gói cam kết ──────────────────────
  {
    code: "SATA1",
    slug: "sata-1",
    name: "Sata1 — Luyện thi Robosim",
    ageRange: "Lớp 3 – 8",
    soBuoi: 16,
    giaNiemYet: 2_400_000,
    category: "LUYEN_THI_ROBOSIM",
    ghiChu: "Khóa luyện thi ngắn hạn hướng đến Cuộc thi Sáng tạo Robotics 2026.",
  },
  {
    code: "SATA2",
    slug: "sata-2",
    name: "Sata2 — Đấu Trường Robot",
    ageRange: "Lớp 3 – 8",
    soBuoi: 16,
    giaNiemYet: 3_040_000,
    category: "LUYEN_THI_ROBOSIM",
    ghiChu: "Khóa luyện thi ngắn hạn. Tần suất 1–2 buổi/tuần, tăng cường trong mùa hè.",
  },
  // ── Điều 4 — Nhóm 2: chuyên sâu 48 buổi (4 học phần × 12 buổi) ─────────────
  {
    code: "SATA3",
    slug: "sata-3",
    name: "Sata3 — Ươm Mầm Tài Năng",
    ageRange: "Lớp 1 – 2",
    soBuoi: 48,
    giaNiemYet: 10_560_000,
    category: "LAP_TRINH_ROBOT",
  },
  {
    code: "SATA4",
    slug: "sata-4",
    name: "Sata4 — Bức Phá Giới Hạn",
    ageRange: "Lớp 3 – 4",
    soBuoi: 48,
    giaNiemYet: 11_520_000,
    category: "LAP_TRINH_ROBOT",
    ghiChu: "Khóa trọng điểm, ưu tiên tuyển sinh đợt khai giảng tháng 5–6/2026.",
  },
  {
    code: "SATA5",
    slug: "sata-5",
    name: "Sata5 — Khơi Nguồn Sáng Tạo",
    ageRange: "Lớp 5",
    soBuoi: 48,
    giaNiemYet: 12_480_000,
    category: "LAP_TRINH_ROBOT",
  },
  {
    code: "SATA6",
    slug: "sata-6",
    name: "Sata6 — Chinh Phục Đấu Trường",
    ageRange: "Lớp 6 – 7",
    soBuoi: 48,
    giaNiemYet: 13_440_000,
    category: "LAP_TRINH_ROBOT",
    ghiChu: "Khóa trọng điểm, ưu tiên tuyển sinh đợt khai giảng tháng 5–6/2026.",
  },
  {
    code: "SATA7",
    slug: "sata-7",
    name: "Sata7 — Kiến Tạo Tương Lai",
    ageRange: "Lớp 8",
    soBuoi: 48,
    giaNiemYet: 14_400_000,
    category: "LAP_TRINH_ROBOT",
  },
  // ── Sata8 đứng CUỐI vì nó là gói cam kết, không nằm trong lộ trình 3→7 ─────
  {
    code: "SATA8",
    slug: "sata-8",
    name: "Sata8 — Vé Vàng Chung Kết Khu Vực Miền Trung",
    ageRange: null,
    soBuoi: 5,
    giaNiemYet: 2_500_000,
    category: "LUYEN_THI_ROBOSIM",
    ghiChu:
      "Gói cam kết 5 buổi chuyên binh. Giá CỐ ĐỊNH, không áp dụng thêm ưu đãi và KHÔNG áp dụng hình thức Coach (Điều 5 ghi chú). Hoàn tiền 100% nếu không vượt vòng loại Khu vực Miền Trung.",
  },
];

async function main() {
  const ghi = process.argv.includes("--ghi");
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    // Fail-closed: script này đổi GIÁ NIÊM YẾT, tức mẫu số của mọi phép tính học phí.
    // Chạy nhầm vào Supabase là đổi giá trên môi trường thật mà không ai duyệt.
    console.error(
      "⛔ DATABASE_URL không trỏ localhost. Script này chỉ chạy trên DB trên máy.\n" +
        "   Muốn đổi giá trên môi trường thật thì đi qua màn quản trị khoá học, có người duyệt.",
    );
    process.exitCode = 1;
    return;
  }

  const db = new PrismaClient();
  try {
    const truoc = await db.course.findMany({
      where: { slug: { in: KHOA.map((k) => k.slug) } },
      select: { slug: true, name: true, price: true, totalSessions: true, code: true },
    });
    const map = new Map(truoc.map((c) => [c.slug, c]));

    console.log(`\n${ghi ? "GHI THẬT" : "XEM THỬ (dry-run)"} — ${KHOA.length} khoá theo SR.QD.219\n`);
    console.log(
      "slug".padEnd(10) +
        "giá cũ".padStart(14) +
        " → " +
        "giá mới".padStart(14) +
        "  " +
        "buổi cũ→mới".padStart(12) +
        "  giá/buổi",
    );
    console.log("─".repeat(78));

    for (const k of KHOA) {
      const cu = map.get(k.slug);
      const giaBuoi = Math.round(k.giaNiemYet / k.soBuoi);
      const chan = k.giaNiemYet % k.soBuoi === 0;
      console.log(
        k.slug.padEnd(10) +
          (cu?.price != null ? cu.price.toLocaleString("vi-VN") : "—").padStart(14) +
          " → " +
          k.giaNiemYet.toLocaleString("vi-VN").padStart(14) +
          "  " +
          `${cu?.totalSessions ?? "—"}→${k.soBuoi}`.padStart(12) +
          `  ${giaBuoi.toLocaleString("vi-VN")}${chan ? "" : " ⚠️ KHÔNG CHẴN"}`,
      );
    }

    if (!ghi) {
      console.log("\nChưa ghi gì. Thêm `--ghi` để áp.\n");
      return;
    }

    for (const [i, k] of KHOA.entries()) {
      const data = {
        name: k.name,
        slug: k.slug,
        code: k.code,
        price: k.giaNiemYet,
        totalSessions: k.soBuoi,
        ageRange: k.ageRange,
        category: k.category,
        // Khoá DẠY THẬT: `loadCreateOrderFormData` lọc `isTeachable` để dựng danh sách
        // khoá ở màn tạo đơn. Thiếu cờ này là khoá không xuất hiện ở đâu cả.
        isTeachable: true,
        isActive: true,
        type: "OFFLINE" as CourseType,
        displayOrder: i + 1,
        description: k.ghiChu ?? null,
        // Giá hiển thị cho trang marketing — giữ ĐÚNG một nguồn với `price`.
        priceDisplay: `${k.giaNiemYet.toLocaleString("vi-VN")}đ`,
      };
      await db.course.upsert({ where: { slug: k.slug }, update: data, create: data });
      console.log(`  ✓ ${k.slug}`);
    }
    console.log(`\nXong ${KHOA.length} khoá.\n`);
  } finally {
    await db.$disconnect();
  }
}

void main();
