/**
 * R6-A — Registry tham số vận hành (SystemSetting / CenterSetting).
 *
 * Mỗi key có: schema (Zod, source-of-truth validate), default (giá trị hardcode
 * hiện tại — fallback an toàn), centerOverridable (cho phép override theo cơ sở?).
 * KEY KHÔNG CÓ TRONG REGISTRY → không được ghi (US-R6A-1 AC4).
 *
 * Default lấy đúng giá trị đang hardcode trong code (additive, không đổi hành vi
 * khi DB trống): student.nearEndThreshold=5 (lib/students/renewal.ts),
 * class 5–20 (lib/validators/class.ts), shift.toleranceMinutes=5 /
 * emergencyMonthlyLimit=3 (lib/shifts.ts), contact (lib/locations.ts),
 * finance.debtReminderDaysBefore=14 (QĐ-O7), enrollment.suspendMaxMonths=6 (TBD-4).
 */
import { z } from "zod";

// Bộ chính sách hoa hồng chép từ SR.QD.208 — dùng làm GIÁ TRỊ MẶC ĐỊNH khi DB chưa có gì.
// `chinh-sach-hoa-hong.ts` là file THUẦN (không Prisma, không DB) nên import được vào đây
// mà không kéo theo gì.
import { CHINH_SACH_MAC_DINH } from "@/lib/crm/chinh-sach-hoa-hong";
// Hai TRẦN KỸ THUẬT — neo `max` của schema vào chính chúng, đừng gõ lại số. Cả hai tệp đều
// THUẦN (không `server-only`, không Prisma) nên nhập vào đây không kéo theo gì.
import { TRAN_SO_DOT } from "@/lib/payments/ke-hoach-dot";
import { TRAN_KHOAN_GIAM_MOI_DONG } from "@/lib/orders/giam-gia-dong";
import {
  CACH_HAP_THU,
  CHINH_SACH_MAC_DINH as UU_DAI_MAC_DINH,
  DOI_TUONG_UU_DAI,
} from "@/lib/orders/chinh-sach-uu-dai";
import {
  docKhungGio,
  KHUNG_MAC_DINH,
  TEN_THU,
  THU_KHOA,
  type ThuKhoa,
} from "@/lib/trial/khung-gio-mo-lop";
import { internalAwards } from "@/components/legacy-laptrinhrobot/_data/awards";
import { gifts } from "@/components/legacy-laptrinhrobot/_data/gifts";
import { commitments } from "@/components/legacy-laptrinhrobot/_data/commitments";

export type SettingGroup =
  | "student"
  | "risk"
  | "class"
  | "shift"
  | "contact"
  | "finance"
  | "enrollment"
  | "crm"
  | "otp"
  | "teacher"
  | "lms"
  | "media"
  | "storage"
  | "public"
  | "content"
  | "cron"
  | "dashboard"
  | "makeup"
  | "chat"
  // Hộp thư đa kênh (site Sale) — công tắc GỬI THẬT của từng kênh ngoài.
  | "inbox"
  // Trục ZaloCRM (máy chủ fork): ánh xạ tổ chức + ngưỡng cảnh báo. TÁCH khỏi
  // "inbox" vì đây là cấu hình của một hệ ngoài, không phải của hộp thư.
  | "zalocrm"
  | "system";

export interface SettingDef<T = unknown> {
  key: string;
  group: SettingGroup;
  label: string;
  schema: z.ZodType<T>;
  default: T;
  /** true = CenterSetting được override key này; false = chỉ GLOBAL. */
  centerOverridable: boolean;
}

function def<T>(d: SettingDef<T>): SettingDef<T> {
  return d;
}

/**
 * Bảy khoá `trial.khungGio.<thu>` — khung giờ mở lớp trải nghiệm của từng thứ.
 *
 * Sinh bằng vòng lặp chứ không gõ tay bảy khối: bảy khối gần giống nhau là bảy chỗ để
 * lệch, và `TEN_THU`/`KHUNG_MAC_DINH` đã là nguồn duy nhất của tên thứ lẫn giá trị mặc
 * định. Khoá khai TƯỜNG MINH ở kiểu trả về để `tsc` vẫn biết đủ bảy khoá.
 */
function khungGioTheoThu(): {
  [K in ThuKhoa as `trial.khungGio.${K}`]: SettingDef<string>;
} {
  const ra = {} as Record<string, SettingDef<string>>;
  for (const thu of THU_KHOA) {
    ra[`trial.khungGio.${thu}`] = def<string>({
      key: `trial.khungGio.${thu}`,
      group: "teacher",
      label:
        `Khung giờ mở lớp trải nghiệm — ${TEN_THU[thu]} ` +
        `(dạng "17:30-21:00", nhiều khung ngăn bằng dấu phẩy; để TRỐNG là ngày đó không mở)`,
      schema: z
        .string()
        .trim()
        .max(120)
        .superRefine((chuoi, ctx) => {
          const doc = docKhungGio(chuoi);
          if (!doc.ok) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: doc.loi });
          }
        }),
      default: KHUNG_MAC_DINH[thu],
      // KHÔNG cho ghi đè theo cơ sở — cùng lý do đã ghi ở `trial.locGvTheoCaLamViec`:
      // đây là LUẬT mở lớp, một cơ sở tự đặt khung riêng thì cùng một thao tác ra hai kết
      // quả tuỳ người đang đứng ở đâu.
      //
      // Còn một lý do KỸ THUẬT quan trọng không kém: form tạo lớp dựng ô chọn khung ở
      // CLIENT từ chính bảy khoá này. Cho ghi đè theo cơ sở là client bày một khung mà
      // server sẽ từ chối ngay sau đó — ô chọn hứa một việc không làm được (luật 12).
      centerOverridable: false,
    });
  }
  return ra as { [K in ThuKhoa as `trial.khungGio.${K}`]: SettingDef<string> };
}

const hotlineSchema = z.array(
  z.object({
    code: z.string().min(1),
    label: z.string().min(1),
    phone: z.string().min(1),
  }),
);

/**
 * Chính sách hoa hồng do người vận hành khai (SR.QD.208).
 *
 * ⚠️ `vaiNhan` là CHUỖI TỰ DO, cố ý: chủ dự án 14/09/2026 yêu cầu "thêm bớt các role
 * nhận hoa hồng riêng chứ không khoá cứng". Ràng vào enum là mỗi vai mới lại phải sửa mã.
 *
 * ⚠️ Zod ở đây chỉ kiểm HÌNH DẠNG. Luật nghiệp vụ — trần tổng theo từng rổ, tỉ lệ 0..1,
 * kiểu "thưởng theo bậc" phải có bậc — nằm ở `kiemChinhSach` trong
 * `lib/crm/chinh-sach-hoa-hong.ts`, và đường ghi phải gọi nó. Nhét luật đó vào đây thì
 * `registry.ts` phải biết trần, mà trần lại chính là một key khác trong cùng registry.
 */
const chinhSachHoaHongSchema = z.array(
  z.object({
    ma: z.string().min(1).max(60),
    ten: z.string().min(1).max(200),
    suKien: z.enum(["HOC_VIEN_MOI", "TAI_TUC", "CHUYEN_TRUNG_TAM", "BAN_THIET_BI"]),
    loaiDon: z.enum(["TAT_CA", "COURSE", "PRODUCT"]),
    kieuTinh: z.enum(["PHAN_TRAM", "SO_TIEN_CO_DINH", "THUONG_THEO_BAC"]),
    // MỘT chính sách mang NHIỀU khoản (vai × giá trị) — gom "học viên mới" từ 5 dòng
    // rời thành 1 quyết định. Tỉ lệ nằm trên TỪNG khoản vì công văn cho mỗi vai một mức.
    khoan: z
      .array(z.object({ vaiNhan: z.string().min(1).max(60), giaTri: z.number().min(0) }))
      .max(30),
    bac: z
      .array(
        z.object({
          nguong: z.number().min(0),
          thuong: z.number().min(0),
          danhHieu: z.string().max(40).optional(),
        }),
      )
      .optional(),
    nguon: z.string().max(300).optional(),
    ghiChu: z.string().max(2000).optional(),
    bat: z.boolean(),
  }),
);

const proposalWindowSchema = z
  .object({
    fromDay: z.number().int().min(1).max(28),
    toDay: z.number().int().min(1).max(28),
  })
  .refine((v) => v.fromDay <= v.toDay, {
    message: "fromDay phải ≤ toDay",
    path: ["fromDay"],
  });

const emailsSchema = z.object({
  primary: z.string().email(),
  recruitment: z.string().email(),
});

// ── Nội dung chính sách marketing (group "content") — shape khớp _data/* ──
const internalAwardsSchema = z.object({
  totalValue: z.string(),
  perYear: z.number(),
  perEvent: z.string(),
  description: z.string(),
  prizes: z.array(
    z.object({
      rank: z.union([z.number(), z.string()]),
      icon: z.string(),
      name: z.string(),
      reward: z.string(),
      note: z.string(),
    }),
  ),
});

const giftsSchema = z.array(
  z.object({
    id: z.number(),
    icon: z.string(),
    title: z.string(),
    value: z.string(),
    description: z.string(),
  }),
);

const commitmentsSchema = z.array(
  z.object({
    id: z.number(),
    icon: z.string(),
    title: z.string(),
    description: z.string(),
  }),
);

/**
 * Bảng key cấu hình. Thêm key mới = thêm 1 entry ở đây (schema + default).
 */
export const SETTINGS = {
  "student.nearEndThreshold": def({
    key: "student.nearEndThreshold",
    group: "student",
    label: "Ngưỡng 'sắp hết khóa' (số buổi còn lại)",
    schema: z.number().int().min(1).max(50),
    default: 5,
    centerOverridable: true,
  }),
  "risk.careTaskDueDays": def({
    key: "risk.careTaskDueDays",
    group: "risk",
    label: "Hạn xử lý task chăm sóc (ngày)",
    schema: z.number().int().min(1).max(30),
    default: 2,
    centerOverridable: true,
  }),
  "class.minStudents.default": def({
    key: "class.minStudents.default",
    group: "class",
    label: "Sĩ số tối thiểu mặc định",
    schema: z.number().int().min(1).max(100),
    default: 5,
    centerOverridable: true,
  }),
  "class.maxStudents.default": def({
    key: "class.maxStudents.default",
    group: "class",
    label: "Sĩ số tối đa mặc định",
    schema: z.number().int().min(1).max(100),
    default: 20,
    centerOverridable: true,
  }),
  "shift.toleranceMinutes": def({
    key: "shift.toleranceMinutes",
    group: "shift",
    label: "Dung sai chấm công (phút)",
    schema: z.number().int().min(0).max(120),
    default: 5,
    centerOverridable: true,
  }),
  "shift.emergencyMonthlyLimit": def({
    key: "shift.emergencyMonthlyLimit",
    group: "shift",
    label: "Quota đăng ký ca khẩn cấp / tháng",
    schema: z.number().int().min(0).max(31),
    default: 3,
    centerOverridable: true,
  }),
  "shift.proposalWindow": def({
    key: "shift.proposalWindow",
    group: "shift",
    label: "Cửa sổ đăng ký ca tháng sau (ngày trong tháng)",
    schema: proposalWindowSchema,
    default: { fromDay: 25, toDay: 28 },
    centerOverridable: true,
  }),
  // ⚠️ MỘT số cho cả công ty từ 24/09/2026 — trước đó mặc định là hai dòng, mỗi cơ sở
  // một số. Giữ nguyên hình dạng MẢNG (đổi khoá là phải migrate dòng đã lưu trên prod),
  // chỉ hạ xuống một phần tử.
  //
  // ⚠️ Khoá này HIỆN KHÔNG CÓ AI ĐỌC: `grep "contact.hotlines"` chỉ ra chính chỗ khai
  // này, nhãn ở `nhan-van-hanh.ts`, và một fixture test. Website đọc thẳng
  // `SATA_ROBO_PHONE` (`lib/locations.ts`). Sửa ô này trên màn Cấu hình vận hành KHÔNG
  // đổi số hiện trên web — nối dây là việc riêng, đừng để người vận hành tưởng đã đổi.
  "contact.hotlines": def({
    key: "contact.hotlines",
    group: "contact",
    label: "Hotline hiển thị",
    schema: hotlineSchema,
    default: [{ code: "CTY", label: "Sata Robo", phone: "0837.812.860" }],
    centerOverridable: false,
  }),
  "contact.emails": def({
    key: "contact.emails",
    group: "contact",
    label: "Email hiển thị",
    schema: emailsSchema,
    default: {
      primary: "thongtin@satarobo.vn",
      recruitment: "tuyendung@satarobo.vn",
    },
    centerOverridable: false,
  }),
  // 15/09/2026 — TRẦN % GIẢM GIÁ cho MỘT khoản trên một dòng đơn. Chủ dự án:
  // "quy định lại mức giảm % tối đa là 50% và phần này cũng nên set ở trong cấu hình
  // vận hành luôn."
  //
  // ⚠️ Đây là CẤU HÌNH, không phải hằng số — cùng bài học với
  // `crm.commissionMaxTotalRate` (27/08): hằng `TRAN_PHAN_TRAM_MAC_DINH` trong
  // `lib/orders/giam-gia-dong.ts` chỉ còn là mặc định cho code THUẦN. Mọi đường chạm
  // DB được PHẢI `getSetting` rồi TRUYỀN VÀO `tienDon`/`gopGiamGia` — không thì người
  // vận hành nới trần ở màn này mà đường ghi vẫn chặn theo số cũ, và không lỗi nào báo.
  // Tham số ấy cố ý KHÔNG có mặc định để `tsc` liệt kê hết chỗ gọi (luật 7).
  //
  // ⚠️ KHÔNG `centerOverridable`: đây là mức TRẦN quản trị, không phải một chương trình
  // khuyến mãi. Cho mỗi cơ sở tự nới trần là mỗi cơ sở một mức bớt tối đa, và kế toán
  // không còn MỘT con số để đối. Ưu đãi khác nhau theo cơ sở thì khai ở từng khoản
  // giảm trên dòng đơn — chỗ đó vốn đã tự do.
  //
  // Chặn dưới 1%: trần 0 nghĩa là MỌI khoản % âm thầm thành 0đ, người bán gõ 10% mà
  // khách không được bớt gì. Muốn cấm hẳn giảm theo % thì đó là một quyết định khác,
  // cần một cái công tắc nói đúng tên nó, không phải hạ trần về 0.
  // ═══════════════════════════════════════════════════════════════════════════
  // TRẦN SỐ ĐỢT + TRẦN SỐ ƯU ĐÃI — chủ dự án chốt 22/09/2026.
  //
  // Vượt trần thì đơn VẪN LƯU ĐƯỢC nhưng vào hàng chờ Quản lý cơ sở duyệt, và KHÔNG xuất
  // được mã QR cho tới khi duyệt. Đó là lý do hai số này là THAM SỐ chứ không phải hằng:
  // ngưỡng ở đây là CHÍNH SÁCH (người vận hành đổi), còn `TRAN_SO_DOT` /
  // `TRAN_KHOAN_GIAM_MOI_DONG` là TRẦN KỸ THUẬT (mã không chịu nổi quá số đó).
  //
  // ⚠️ `max` của schema NEO VÀO CHÍNH HẰNG KỸ THUẬT, không gõ lại số. Ngưỡng chính sách
  // phải nằm BÊN TRONG trần kỹ thuật; khai `max: 12` bằng tay là hai con số sống song song
  // và sẽ lệch lần đầu ai đó đổi hằng.
  //
  // ⚠️ `centerOverridable: true` — KHÁC `orders.maxDiscountPercent` ngay dưới, và khác có
  // lý do. Trần % là mức BỚT TIỀN tối đa, kế toán cần MỘT con số để đối. Hai số này không
  // nói về mức bớt, chúng nói về ĐỘ PHỨC TẠP của một đơn mà cơ sở tự gánh hậu quả (đợt
  // càng nhiều thì càng nhiều lần đối soát). Chủ dự án chốt 22/09 cho QLCS tự chỉnh.
  //
  // ⚠️ ÁP CHO MỌI ĐƠN, không chia "đơn cũ / đơn mới". Đề xuất ban đầu của tôi là chỉ áp đơn
  // mới để khỏi làm kẹt đơn đang chạy — phép đo prod 23/09 bác nó: phân bố số đợt là
  // 1×1 · 2×3 · 4×2, **0 đơn vượt trần 4**, và 1 đơn duy nhất vượt trần ưu đãi thì vẫn
  // đang `PENDING_PAYMENT`. Không có đơn cũ nào để bảo vệ ⇒ giữ hai chế độ là giữ một
  // nhánh mã không ai đi qua.
  "orders.maxInstallments": def({
    key: "orders.maxInstallments",
    group: "finance",
    label: "Số đợt tối đa mỗi con (không tính cọc)",
    schema: z.number().int().min(1).max(TRAN_SO_DOT),
    default: 4,
    centerOverridable: true,
  }),
  "orders.maxDiscountItems": def({
    key: "orders.maxDiscountItems",
    group: "finance",
    label: "Số ưu đãi tối đa trên một dòng đơn",
    schema: z.number().int().min(1).max(TRAN_KHOAN_GIAM_MOI_DONG),
    default: 1,
    centerOverridable: true,
  }),
  "orders.maxDiscountPercent": def({
    key: "orders.maxDiscountPercent",
    group: "finance",
    label: "Trần % giảm giá mỗi khoản trên dòng đơn",
    schema: z.number().int().min(1).max(100),
    default: 50,
    centerOverridable: false,
  }),
  "finance.debtReminderDaysBefore": def({
    key: "finance.debtReminderDaysBefore",
    group: "finance",
    label: "Nhắc công nợ trước đợt 2 (ngày)",
    schema: z.number().int().min(1).max(60),
    default: 14,
    centerOverridable: true,
  }),
  // 03/08 — dung sai LÀM TRÒN khi đối khớp tiền về (lib/payments/allocation.ts).
  // Khách chuyển thiếu ≤ ngưỡng này thì phiếu thu vẫn coi là ĐÃ ĐÓNG ĐỦ (ghi lại
  // phần tha để kế toán thấy) — tránh treo phiếu vì lệch vài nghìn do phí/làm tròn.
  // KHÔNG phải ngưỡng chấp nhận giao dịch: tiền về luôn được ghi nhận và phân bổ.
  "payment.roundingToleranceVnd": def({
    key: "payment.roundingToleranceVnd",
    group: "finance",
    label: "Dung sai làm tròn khi đối khớp thanh toán (VNĐ)",
    schema: z.number().int().min(0).max(100_000),
    default: 5_000,
    centerOverridable: true,
  }),
  // 03/08 — TTL của một phiên QR (QrSession.expiresAt). CHỈ dùng để hiển thị đồng hồ
  // đếm ngược + chặn 2 QR sống song song trên cùng phiếu thu. KHÔNG phải điều kiện
  // đối khớp: QR hết hạn mà phụ huynh vẫn chuyển thì tiền VẪN về đúng phiếu (matchKey
  // bền theo đời phiếu). Đừng biến key này thành cửa sổ nhận tiền.
  "payment.qrTtlMinutes": def({
    key: "payment.qrTtlMinutes",
    group: "finance",
    label: "Thời gian sống của mã QR (phút)",
    schema: z.number().int().min(1).max(1440),
    default: 10,
    centerOverridable: false,
  }),
  // ── CÔNG TẮC thu học phí linh hoạt (module đơn nhiều con) ───────────────────────────
  //
  // Chủ dự án chốt 16/09/2026: *"nên để bật cho toàn hệ thống đồng loạt, nhưng sẽ có công tắc
  // riêng cho từng cs."* Đó đúng là hình dạng `SystemSetting` + `CenterSetting` đang có: giá
  // trị GLOBAL là công tắc chính, `centerOverridable` cho phép một cơ sở lệch.
  //
  // ⚠️ Vì sao KHÔNG dùng biến môi trường (dù đã có `PAYMENT_PER_CHILD_ENABLED`): cờ env
  // `PAYMENT_LEDGER_V2` là tiền lệ đã đo — nó có trong mã, **không có trong 40 biến env của
  // prod**, và 0 đường gọi thật. Bật nó không đổi hành vi gì. Cờ trong DB thì người vận hành
  // bật được, thấy được, và có `AuditLog` ghi ai bật lúc nào.
  //
  // ⚠️ BẬT RỒI TẮT LẠI KHÔNG VÔ HẠI: phiếu thu đã sinh theo con vẫn nằm đó khi cờ tắt. Đường
  // lùi là tắt cho đơn MỚI rồi xử lý tay số đơn đã lỡ sinh, không phải "tắt là như chưa có gì".
  "billing.flexV1Enabled": def({
    key: "billing.flexV1Enabled",
    group: "finance",
    label: "Thu học phí linh hoạt: công nợ theo từng con, phiếu gộp một QR cho cả nhà",
    schema: z.boolean(),
    default: false,
    centerOverridable: true,
  }),
  // ── ƯU ĐÃI ANH EM — QUẢN LÝ TỰ CÀI [PHIÊN F3 · 22/09/2026] ─────────────────────────
  //
  // Chủ dự án chốt khi tôi hỏi "phần giảm muộn trừ vào đợt nào": *"làm cho quản lý tự cài
  // đặt cho phần này trên hệ thống"*. Nên sáu khoá dưới đây là TOÀN BỘ chính sách ưu đãi
  // anh em — không còn con số nào nằm trong mã.
  //
  // Hình dạng + phép tính ở `lib/orders/chinh-sach-uu-dai.ts` (thuần). `default` ở đây lấy
  // đúng hằng của tệp đó, nên DB trống KHÔNG đổi hành vi (additive).
  //
  // ⚠️ `centerOverridable: true` cho CẢ SÁU. Hai cơ sở có thể chạy hai chính sách ưu đãi
  // khác nhau (CS1 khuyến mãi mùa hè, CS2 không), và đó là ca vận hành thật — không phải
  // sự tuỳ tiện. Ánh xạ khoá là `OrgUnit.id`, KHÔNG phải `Center.id`.
  "billing.siblingAutoEnabled": def({
    key: "billing.siblingAutoEnabled",
    group: "finance",
    label: "Tự tính ưu đãi anh chị em học cùng",
    schema: z.boolean(),
    default: UU_DAI_MAC_DINH.tuDong,
    centerOverridable: true,
  }),
  "billing.siblingPercentSecond": def({
    key: "billing.siblingPercentSecond",
    group: "finance",
    label: "Mức giảm cho con thứ hai (%)",
    schema: z.number().int().min(0).max(100),
    default: UU_DAI_MAC_DINH.phanTramConThu2,
    centerOverridable: true,
  }),
  "billing.siblingPercentThird": def({
    key: "billing.siblingPercentThird",
    group: "finance",
    label: "Mức giảm cho con thứ ba trở lên (%)",
    schema: z.number().int().min(0).max(100),
    default: UU_DAI_MAC_DINH.phanTramConThu3,
    centerOverridable: true,
  }),
  // Chuỗi ⇒ màn cấu hình vẽ DANH SÁCH CHỌN (`chon` trong nhãn vận hành), không phải ô chữ
  // trắng. Ô chữ trắng cho một giá trị chỉ nhận 2 khả năng là mời người ta gõ sai rồi đọc
  // một câu lỗi kỹ thuật.
  "billing.siblingTarget": def({
    key: "billing.siblingTarget",
    group: "finance",
    label: "Ưu đãi anh chị em áp cho con nào",
    schema: z.enum([DOI_TUONG_UU_DAI.HOC_PHI_THAP_HON, DOI_TUONG_UU_DAI.GHI_DANH_SAU]),
    default: UU_DAI_MAC_DINH.doiTuong,
    centerOverridable: true,
  }),
  "billing.siblingStacksFullPay": def({
    key: "billing.siblingStacksFullPay",
    group: "finance",
    label: "Cho cộng dồn ưu đãi anh chị em với ưu đãi đóng trọn khoá",
    schema: z.boolean(),
    default: UU_DAI_MAC_DINH.congDonDongFull,
    centerOverridable: true,
  }),
  // ⚠️ Khoá NGUY HIỂM NHẤT của cụm, và nguy hiểm theo cách không nhìn thấy: nó quyết định
  // đợt thu nào bị SỬA SỐ sau khi phụ huynh đã nhận mã QR và tin nhắn cho đợt ấy.
  "billing.lateDiscountAbsorb": def({
    key: "billing.lateDiscountAbsorb",
    group: "finance",
    label: "Giảm giá phát sinh muộn thì trừ vào đợt thu nào",
    schema: z.enum([
      CACH_HAP_THU.DOT_XA_NHAT,
      CACH_HAP_THU.CHIA_DEU,
      CACH_HAP_THU.DOT_GAN_NHAT,
    ]),
    default: UU_DAI_MAC_DINH.hapThu,
    centerOverridable: true,
  }),
  "enrollment.suspendMaxMonths": def({
    key: "enrollment.suspendMaxMonths",
    group: "enrollment",
    label: "Trần thời hạn bảo lưu (tháng)",
    schema: z.number().int().min(1).max(24),
    default: 6,
    centerOverridable: false,
  }),
  // ── Bổ sung (hardcode remediation Đợt 3): wire hằng số call-site về registry ──
  "student.absenceUrgentThresholdDays": def({
    key: "student.absenceUrgentThresholdDays",
    group: "student",
    label: "Số ngày báo vắng coi là khẩn",
    schema: z.number().int().min(1).max(30),
    default: 3, // lib/students/absence.ts URGENT_THRESHOLD_DAYS
    centerOverridable: true,
  }),
  "student.renewalWindowDays": def({
    key: "student.renewalWindowDays",
    group: "student",
    label: "Cửa sổ tái tục sau hoàn thành khoá (ngày)",
    schema: z.number().int().min(1).max(365),
    default: 90, // lib/students/lifecycle.ts RENEWAL_WINDOW_DAYS
    centerOverridable: true,
  }),
  "student.frequentAbsentThreshold": def({
    key: "student.frequentAbsentThreshold",
    group: "student",
    label: "Số buổi vắng coi là 'hay vắng'",
    schema: z.number().int().min(1).max(20),
    default: 3, // lib/students/lifecycle.ts FREQUENT_ABSENT_THRESHOLD
    centerOverridable: true,
  }),
  "student.frequentAbsentWindow": def({
    key: "student.frequentAbsentWindow",
    group: "student",
    label: "Số buổi gần nhất xét 'hay vắng'",
    schema: z.number().int().min(1).max(50),
    default: 5, // lib/students/lifecycle.ts FREQUENT_ABSENT_WINDOW
    centerOverridable: true,
  }),
  // ── Sinh nhật học viên (06/08/2026) ────────────────────────────────────────
  // Buổi TỔ CHỨC có thể rơi TRƯỚC ngày sinh nhật (hôm sinh nhật HV không có lớp),
  // nên mốc nhắc bám `celebrationDate`, KHÔNG bám ngày sinh nhật. Chủ dự án chốt
  // cho QLCS tự chỉnh số ngày báo trước tại /admin/cau-hinh-van-hanh.
  "student.birthdayAlertDaysBefore": def({
    key: "student.birthdayAlertDaysBefore",
    group: "student",
    label: "Báo trước buổi tổ chức sinh nhật (ngày)",
    schema: z.number().int().min(0).max(30),
    default: 3,
    centerOverridable: true,
  }),
  "student.birthdayLookaheadDays": def({
    key: "student.birthdayLookaheadDays",
    group: "student",
    label: "Cửa sổ quét sinh nhật sắp tới (ngày)",
    // Phải ≥ birthdayAlertDaysBefore, nếu không cron chưa kịp lập kế hoạch đã tới hạn báo.
    schema: z.number().int().min(1).max(60),
    default: 10,
    centerOverridable: false,
  }),
  "student.birthdayLookbackDays": def({
    key: "student.birthdayLookbackDays",
    group: "student",
    label: "Buổi tổ chức được lùi tối đa trước sinh nhật (ngày)",
    schema: z.number().int().min(0).max(30),
    default: 7,
    centerOverridable: true,
  }),
  // ── Nền Hệ thống P4 · US-13 · AC2 ──────────────────────────────────────────
  // Cutover đơn vị đo của phạm vi dữ liệu: `centerId` → `orgUnitId`.
  //
  // Ở ĐÂY chứ không ở env vì AC2 đòi rollback MỘT thao tác, KHÔNG cần deploy: đổi env
  // trên Vercel là phải redeploy, và suốt lúc chờ thì quyền vẫn sai. Sửa ở màn Cấu hình
  // là có audit + lý do bắt buộc sẵn.
  //
  // ⚠️ CHỈ BẬT khi `scripts/nen-p4-kiem-cong.ts` báo ĐẠT. Bật sớm = người dùng mất
  // quyền ở đúng những chỗ mà pha shadow chưa kịp đo (target chưa mang `orgUnitId` thì
  // resolver mới TỪ CHỐI — cố ý fail-closed, không rơi ngược về centerId).
  //
  // Rollback: đặt lại `false` — có hiệu lực trong ≤5 phút (TTL cache cấu hình), không deploy.
  "orgScope.cutoverEnabled": def({
    key: "orgScope.cutoverEnabled",
    group: "system",
    label: "Cutover phạm vi dữ liệu sang cây đơn vị (orgUnitId)",
    schema: z.boolean(),
    default: false,
    centerOverridable: false, // quyền không được lệch nhau giữa các cơ sở
  }),
  // ── Cổng dữ liệu agent (tài liệu CEO 25/09/2026 §7.4) ────────────────────────────────
  // Hạn mức đặt ở đây chứ không hardcode (spec §7.4). Tất cả GLOBAL: một agent gọi qua cổng
  // chung, hạn mức lệch nhau theo cơ sở là không có nghĩa.
  //
  // ⚠️ CÔNG TẮC `agentGateway.enabled` CỐ Ý KHÔNG NẰM Ở ĐÂY (rà bảo mật 25/09, AG-01). Khoá
  // nào có trong registry thì `saveGlobalSettingAction` (màn Cấu hình vận hành) ghi được — tức
  // BẬT cổng mà không qua người duyệt + mã 2FA như spec đòi. Công tắc do
  // `lib/agents/gateway/cau-hinh.ts` sở hữu (đọc) và `lib/agents/quan-tri/cong-tac.ts` (ghi);
  // đường chung gặp khoá đó sẽ báo "khoá không hợp lệ".
  "agentGateway.tokenTtlSec": def({
    key: "agentGateway.tokenTtlSec",
    group: "system",
    label: "Thời gian sống của token truy cập agent (giây)",
    schema: z.number().int().min(60).max(3600),
    default: 900,
    centerOverridable: false,
  }),
  "agentGateway.rateLimitPerMin": def({
    key: "agentGateway.rateLimitPerMin",
    group: "system",
    label: "Số lượt gọi tối đa mỗi phút của một agent",
    schema: z.number().int().min(1).max(1000),
    default: 60,
    centerOverridable: false,
  }),
  "agentGateway.maxRowsPerCall": def({
    key: "agentGateway.maxRowsPerCall",
    group: "system",
    label: "Số bản ghi tối đa trả về trong một lượt gọi của agent",
    schema: z.number().int().min(1).max(500),
    default: 500,
    centerOverridable: false,
  }),
  "agentGateway.maxRowsPerDay.cao": def({
    key: "agentGateway.maxRowsPerDay.cao",
    group: "system",
    label: "Số bản ghi nhạy cảm CAO tối đa một agent được đọc mỗi ngày",
    schema: z.number().int().min(1).max(100_000),
    default: 5000,
    centerOverridable: false,
  }),
  "agentGateway.maxRangeDays": def({
    key: "agentGateway.maxRangeDays",
    group: "system",
    label: "Khoảng ngày tối đa trong một lượt gọi của agent",
    schema: z.number().int().min(1).max(366),
    default: 93,
    centerOverridable: false,
  }),
  "agentGateway.lockAfterAuthFailures": def({
    key: "agentGateway.lockAfterAuthFailures",
    group: "system",
    label: "Số lần sai mật khẩu trong 5 phút thì tự khoá agent",
    schema: z.number().int().min(3).max(1000),
    default: 20,
    centerOverridable: false,
  }),
  // Web Push (08/09/2026) — CÔNG TẮC của kênh thông báo đẩy cho NHÂN VIÊN.
  //
  // Ở SystemSetting chứ không phải env, đúng nếp của MỌI kênh gửi ra ngoài trong repo này
  // (`chat.znsNotifyEnabled`, `zalo.znsLive`): tắt kênh phải có hiệu lực trong ≤5 phút mà
  // không cần deploy. Env chỉ giữ khoá bí mật (`VAPID_PRIVATE_KEY`).
  //
  // ✅ ĐÃ CÓ ĐƯỜNG ĐỌC TỪ ĐỢT 4: `chayLuotGuiPush` (lib/push/engine.ts) đọc key này ở dòng đầu
  // mỗi lượt cron và THOÁT SẠCH khi tắt — không đọc bảng nào, không đánh dấu dòng nào. Vì thế
  // hậu tố "CHƯA HOẠT ĐỘNG" trong `label` đã được gỡ.
  //
  // ⚠️ "≤5 phút" là con số ĐÚNG, đừng viết thành "ngay": `getSetting` cache `revalidate: 300`
  // (lib/settings/service.ts — docstring ở đầu file đó ghi "60s" là SAI so với code), còn nhánh
  // xoá cache theo tag chỉ chạy được trong Server Action. Màn /admin/cau-hinh-van-hanh sửa qua
  // Server Action nên thường ăn ngay, nhưng một lượt cron đang giữ bản cache vẫn có thể gửi
  // thêm trong tối đa 5 phút sau khi người vận hành gạt tắt.
  //
  // ⚠️ Bật công tắc KHÔNG đủ để kênh chạy: engine còn một cổng thứ hai là ba biến môi trường
  // `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`. Thiếu hoặc sai hình
  // dạng thì mỗi lượt trả `reason: "NO_VAPID"` và không dòng nào bị đụng.
  //
  // TẮT mặc định. DB trống ở mọi môi trường sẽ rơi về `default` (lib/settings/resolve.ts) nên
  // `true` ở đây nghĩa là tự bật ở cả những nơi chưa ai cấu hình gì.
  //
  // Đặt tạm ở nhóm `system` chứ không mở nhóm `push` riêng: hiện chỉ có MỘT key, và thêm
  // nhóm phải sửa union `SettingGroup` + nhãn ở `settings-editor.tsx`. Khoá cấu hình lưu
  // theo `key` chứ không theo nhóm, nên chuyển sang nhóm riêng về sau là đổi code thuần,
  // không migration. Chuyển khi có ≥3 key push (allowlist tiền tố, trần/ngày…).
  "push.webPushEnabled": def({
    key: "push.webPushEnabled",
    group: "system",
    label: "Bật thông báo đẩy (Web Push) cho nhân viên — cần khai khoá VAPID trước",
    schema: z.boolean(),
    default: false,
    // Kênh bật/tắt toàn hệ: một cơ sở tự tắt thì nhân viên cơ sở đó im lặng mà không ai
    // ở Hội sở biết — đúng loại lỗi câm mà module này sinh ra để tránh.
    centerOverridable: false,
  }),
  // ── Loại thông báo nào được đẩy ───────────────────────────────────────────────────────
  //
  // Trước 13/09/2026 danh sách này là HẰNG SỐ trong `lib/push/allowlist.ts`, nên "đổi loại
  // nào được rung máy" là một lần sửa mã + deploy. Nay nó là tham số vận hành: sửa ở
  // `/admin/cau-hinh-van-hanh`, có lý do, có nhật ký kiểm toán, không cần deploy.
  //
  // ⚠️ VẪN LÀ DANH SÁCH TRẮNG — rỗng nghĩa là KHÔNG đẩy gì, không phải "đẩy tất". Toàn bộ lập
  // luận vì sao trắng-chứ-không-đen nằm ở đầu `lib/push/allowlist.ts`; đừng đảo ở đây.
  //
  // Giá trị phải là TIỀN TỐ ĐÃ KHAI trong `lib/notifications/catalog.ts`. Cổng này quan trọng
  // hơn vẻ ngoài: gõ sai một ký tự (`lead.moi` thiếu dấu hai chấm) thì `startsWith` vẫn khớp
  // đúng loại đó nhưng có thể khớp LẤN sang loại khác sinh sau; còn gõ hẳn một khoá không tồn
  // tại thì danh sách trông như đã bật mà thực tế không bao giờ khớp gì — màn hình nói dối,
  // và không có lỗi nào được ném ra. Chặn ngay ở tầng validate là chỗ rẻ nhất.
  "push.tienToDuocDay": def({
    key: "push.tienToDuocDay",
    group: "system",
    label:
      "Loại thông báo được đẩy Web Push — chọn ở màn Cấu hình thông báo đẩy, để trống = không đẩy loại nào",
    // ⚠️ CỐ Ý không import `catalogPrefixes` để đối chiếu danh mục ở đây, dù đó mới là phép
    // kiểm mạnh nhất. `lint:boundaries` (dependency-cruiser) bắt được 11 vòng import khi thử:
    //     registry → notifications/catalog → notifications/pending-sync → pending-tasks
    //     → settings/service · auth/actor · auth/permission-eval → … → registry
    // `pending-sync` chỉ `import type` từ `pending-tasks` nên vòng đó không tồn tại lúc chạy,
    // nhưng luật `no-circular` của repo không loại trừ import kiểu, và nới luật chung để hợp
    // thức hoá một tính năng là đổi rào cho cả repo — không phải việc của đợt này.
    //
    // Nên chia đôi trách nhiệm: tầng này gác HÌNH DẠNG (thứ không cần biết catalog), còn phép
    // đối chiếu "có thật trong danh mục không" nằm ở `luuLoaiDuocDayAction` — đường ghi DUY
    // NHẤT mà giao diện dùng, và ở đó import catalog không tạo vòng nào.
    schema: z
      .array(z.string())
      .max(200)
      .superRefine((ds, ctx) => {
        const daGap = new Set<string>();
        ds.forEach((d, i) => {
          // Chuỗi rỗng là ca CHẾT NGƯỜI: `"x".startsWith("")` luôn đúng ⇒ một phần tử rỗng
          // biến danh sách trắng thành "đẩy tất cả 51 loại".
          if (d.length === 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [i],
              message: "Chuỗi rỗng khớp MỌI loại thông báo — không được phép",
            });
          } else if (!d.endsWith(":")) {
            // Dấu hai chấm là luật khớp dùng chung với `lib/notifications/catalog.ts`. Thiếu
            // nó thì `lead.moi` khớp lấn sang `lead.moi_gi_do` sinh sau.
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [i],
              message: `"${d}" phải kết thúc bằng dấu hai chấm`,
            });
          }
          if (daGap.has(d)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [i],
              message: `"${d}" bị khai hai lần`,
            });
          }
          daGap.add(d);
        });
      }),
    // ĐÚNG giá trị đang hardcode trước 13/09 ⇒ DB trống ở mọi môi trường vẫn ra hành vi cũ.
    default: ["lead.moi:"],
    // Cùng lý do với công tắc tổng: một cơ sở tự tắt một loại thì nhân viên cơ sở đó im lặng
    // mà Hội sở không biết.
    centerOverridable: false,
  }),
  "student.birthdayZnsEnabled": def({
    key: "student.birthdayZnsEnabled",
    group: "student",
    label: "Gửi ZNS chúc mừng sinh nhật cho phụ huynh",
    schema: z.boolean(),
    // Tắt cờ này thì phần nhắc việc Sale/QLCS/GV VẪN chạy — chỉ ngưng tốn tiền tin nhắn.
    default: true,
    centerOverridable: false,
  }),
  // Template ZNS đọc từ DB để đổi mẫu không cần deploy (cùng mẫu zalo.znsTemplateOtp).
  // ⚠️ RỖNG = KHÔNG GỬI (skip an toàn). Mẫu "Chúc mừng sinh nhật" phải được Zalo DUYỆT
  // trước; đặt ID mẫu chưa duyệt vào đây thì mọi cú gửi hỏng — đúng vết mẫu 616899.
  // Duyệt xong PHẢI mở bảng tham số trên ZBS đối chiếu ZNS_BIRTHDAY_PARAM_SPEC rồi mới đặt.
  "zalo.znsTemplateBirthday": def({
    key: "zalo.znsTemplateBirthday",
    group: "student",
    // Ô sửa ở /admin/cau-hinh-van-hanh nhận JSON ⇒ giá trị chuỗi phải có nháy kép.
    // Nhắc ngay trong nhãn, nếu không người nhập gõ 616999 trần → JSON.parse ra SỐ → Zod chặn.
    label: 'Template ID ZNS chúc mừng sinh nhật — nhập dạng "616999", rỗng "" = không gửi',
    schema: z.string().regex(/^[0-9]*$/, "Template ID chỉ gồm chữ số"),
    default: "",
    centerOverridable: false,
  }),
  "crm.dedupWindowDays": def({
    key: "crm.dedupWindowDays",
    group: "crm",
    label: "Cửa sổ chống trùng lead (ngày)",
    schema: z.number().int().min(1).max(365),
    default: 90, // lib/crm/lead-qualify.ts & lib/lead/dedup.ts
    centerOverridable: false,
  }),
  // GĐ3 (chủ dự án chốt câu 5, 25/08/2026) — TRẦN số buổi học thử: siết về 4, nhưng
  // admin đổi được ở /admin/cau-hinh-van-hanh mà không cần deploy.
  //
  // ⚠️ KHÁC `TrialProgramConfig.sessionCount`: cái kia là SỐ BUỔI MẶC ĐỊNH của chương
  // trình (được snapshot vào từng lớp lúc tạo, nên lớp cũ giữ số cũ). Cái này là TRẦN
  // — chặn không cho nhập quá. Hai thứ khác nhau, đừng gộp.
  //
  // Dữ liệu cũ vượt trần KHÔNG bị đụng: trần chỉ kiểm lúc GHI MỚI. Siết rồi mà đi sửa
  // ngược dữ liệu đang chạy là đổi nghiệp vụ sau lưng người dùng.
  // ── Trần tổng hoa hồng ──────────────────────────────────────────────────────
  //
  // 27/08/2026 — chủ dự án chốt NỚI 8% → 9% **và** thôi hardcode: quản trị hệ thống tự
  // sửa ở màn Cấu hình vận hành, không phải sửa code rồi chờ deploy.
  //
  // Trần này phủ Σ 4 tầng Sale (QC · Sale Admin · Sale · QL TT) — đang đúng 8,00% — CỘNG
  // tầng `TRIAL_TEACHER` (+1% GV dạy Trial). Trước 27/08 tầng GV chạy NGOÀI mọi ràng
  // buộc vì trần cũ đã bão hoà; nay cả hai nằm dưới một con số đo được.
  //
  // ⚠️ KHÔNG `centerOverridable`: đây là chính sách tiền của toàn hệ thống. Cho cơ sở tự
  // nới trần là mỗi cơ sở một mức chi hoa hồng, và kế toán không còn một con số để đối.
  //
  // ⚠️ Hạ trần xuống DƯỚI tổng tỉ lệ đang hiệu lực KHÔNG xoá dòng hoa hồng đã sinh —
  // nó chỉ chặn lần lưu cấu hình tỉ lệ tiếp theo. Muốn giảm chi thật thì phải hạ tỉ lệ
  // từng tầng, không phải hạ trần.
  "crm.commissionMaxTotalRate": def({
    key: "crm.commissionMaxTotalRate",
    group: "crm",
    label: "Trần tổng tỉ lệ hoa hồng (gồm cả tầng GV dạy Trial)",
    // Chặn dưới 8% = tổng 4 tầng Sale hiện hành: đặt thấp hơn là mọi lần lưu cấu hình
    // tỉ lệ đều ném RATE_EXCEEDS_CAP, tức khoá luôn màn cấu hình hoa hồng.
    schema: z.number().min(0.08).max(0.2),
    default: 0.09,
    centerOverridable: false,
  }),
  /**
   * TOÀN BỘ chính sách hoa hồng — người vận hành tự thêm/bớt, dev không phải code.
   *
   * Mặc định là bộ chép nguyên văn SR.QD.208 (`CHINH_SACH_MAC_DINH`). Từ lần lưu đầu
   * tiên trở đi, bản trong DB thắng — file mã nguồn chỉ còn là giá trị khởi đầu.
   *
   * ⚠️ `centerOverridable: true`: PL08 Điều 4 nói "doanh thu ghi nhận tại Trung tâm nào
   * thì chi phí hoa hồng hạch toán tại Trung tâm đó", nên từng cơ sở phải đè được. Mở cơ
   * sở mới = khai dữ liệu, không sửa mã — đúng nguyên tắc của PRODUCT.md.
   */
  "crm.commissionPolicies": def({
    key: "crm.commissionPolicies",
    group: "crm",
    label: "Chính sách hoa hồng (theo SR.QD.208)",
    schema: chinhSachHoaHongSchema,
    default: CHINH_SACH_MAC_DINH,
    centerOverridable: true,
  }),
  "crm.trialMaxSessions": def({
    key: "crm.trialMaxSessions",
    group: "crm",
    label: "Trần số buổi học thử mỗi ca",
    schema: z.number().int().min(1).max(60),
    default: 4,
    centerOverridable: true,
  }),
  // C-05 — CẢNH BÁO LEAD TREO. Quyết định 12(a) của chủ dự án (24/08/2026): vàng ≥ 2
  // ngày, đỏ ≥ 7 ngày, **cả hai `centerOverridable`** (nguyên văn: "không hardcode").
  //
  // ⚠️ Default ở đây phải BẰNG `STALE_LEAD_WARN_DAYS`/`STALE_LEAD_DANGER_DAYS` của
  // `lib/lead/stale-lead.ts` — file kia là hằng dùng khi CHƯA đọc được cấu hình (test
  // thuần, component client), file này là giá trị người vận hành sửa được. Hai chỗ lệch
  // nhau là bảng và cấu hình nói hai ngưỡng khác nhau; `registry.test.ts` ghim lại.
  //
  // ⚠️ KHÁC hẳn `crm.sla.*` ngay dưới: nhóm SLA đo phễu SR.QD.217 tính bằng PHÚT và
  // đếm từ mốc phễu; hai key này đếm NGÀY từ lần TIẾP CẬN gần nhất
  // (`lastLeadOutreachAt`, `lib/lead/activity-clock.ts`) — mốc khác, đơn vị khác.
  "crm.staleLeadWarnDays": def({
    key: "crm.staleLeadWarnDays",
    group: "crm",
    label: "Lead treo — cảnh báo VÀNG khi chưa tiếp cận (ngày)",
    // min 1: đặt 0 là mọi lead đỏ ngay lúc vừa vào hệ thống ⇒ cột cảnh báo thành nhiễu
    // trắng và người dùng tắt mắt với nó.
    schema: z.number().int().min(1).max(365),
    default: 2, // lib/lead/stale-lead.ts STALE_LEAD_WARN_DAYS
    centerOverridable: true,
  }),
  "crm.staleLeadDangerDays": def({
    key: "crm.staleLeadDangerDays",
    group: "crm",
    label: "Lead treo — cảnh báo ĐỎ khi chưa tiếp cận (ngày)",
    schema: z.number().int().min(1).max(365),
    default: 7, // lib/lead/stale-lead.ts STALE_LEAD_DANGER_DAYS
    centerOverridable: true,
  }),
  // SLA phễu SR.QD.217 (lib/crm/sla.ts SLA_THRESHOLDS) — ngưỡng tính bằng PHÚT.
  "crm.sla.respondMinutes": def({
    key: "crm.sla.respondMinutes",
    group: "crm",
    label: "SLA-0: chưa phản hồi tin nhắn (phút)",
    schema: z.number().int().min(1).max(1440),
    default: 5, // 5'
    centerOverridable: false,
  }),
  "crm.sla.handoverMinutes": def({
    key: "crm.sla.handoverMinutes",
    group: "crm",
    label: "SLA-1: chưa bàn giao lead sau L2 (phút)",
    schema: z.number().int().min(1).max(10080),
    default: 240, // 4h
    centerOverridable: false,
  }),
  "crm.sla.assignMinutes": def({
    key: "crm.sla.assignMinutes",
    group: "crm",
    label: "SLA-2: chưa phân công Sale (phút)",
    schema: z.number().int().min(1).max(10080),
    default: 30, // 30'
    centerOverridable: false,
  }),
  "crm.sla.contactMinutes": def({
    key: "crm.sla.contactMinutes",
    group: "crm",
    label: "SLA-3: chưa liên hệ khách sau phân công (phút)",
    schema: z.number().int().min(1).max(10080),
    default: 180, // 3h
    centerOverridable: false,
  }),
  "crm.sla.silentMinutes": def({
    key: "crm.sla.silentMinutes",
    group: "crm",
    label: "SLA-4: lead im lặng chưa xử lý (phút)",
    schema: z.number().int().min(1).max(43200),
    default: 2880, // 2 ngày
    centerOverridable: false,
  }),
  "sla.leadIdleHours": def({
    key: "sla.leadIdleHours",
    group: "crm",
    label: "R7-01: lead NEW/ASSIGNED im lặng coi là idle (giờ)",
    schema: z.number().int().min(1).max(720),
    default: 24, // QĐ-O: 24h không hoạt động
    centerOverridable: true,
  }),
  "shift.geofenceRadiusMeters": def({
    key: "shift.geofenceRadiusMeters",
    group: "shift",
    label: "Bán kính geofence check-in QR (m)",
    schema: z.number().int().min(10).max(2000),
    default: 100, // lib/attendance/qr.ts GEOFENCE_RADIUS_METERS
    centerOverridable: true,
  }),
  "shift.managerEditWindowDays": def({
    key: "shift.managerEditWindowDays",
    group: "shift",
    label: "Số ngày quản lý được sửa bảng công",
    schema: z.number().int().min(0).max(31),
    default: 2, // lib/attendance/adjust.ts MANAGER_EDIT_WINDOW_DAYS
    centerOverridable: true,
  }),
  // ── Module chấm công v3 (L1 · 06/09/2026) — PHẦN 6b "tự vận hành": không tham số nào
  // của module sống trong code. Mọi key đè được theo cơ sở. Đọc qua getSetting(key,{orgUnitId}).
  "shift.weeklyOffDays": def({
    key: "shift.weeklyOffDays",
    group: "shift",
    label: "Ngày nghỉ tuần (0=CN … 6=T7)",
    schema: z.array(z.number().int().min(0).max(6)).max(7),
    default: [1], // Thứ Hai toàn Trung tâm nghỉ (Sheet 29/08) — công chuẩn = ngày trong kỳ − nghỉ tuần − lễ
    centerOverridable: true,
  }),
  "shift.lateGraceMinutes": def({
    key: "shift.lateGraceMinutes",
    group: "shift",
    label: "Dung sai đi muộn theo ca (phút) — quá mức này mới gắn cờ DI_MUON",
    schema: z.number().int().min(0).max(180),
    default: 30, // T-12
    centerOverridable: true,
  }),
  // ── Nội quy: đếm lần trễ và mức trừ (chốt 07/09/2026) ────────────────────────────────
  // Tách RIÊNG khỏi `shift.lateGraceMinutes` có chủ đích. Dung sai 30′ ở trên là để GẮN CỜ
  // cho quản lý rà; lấy luôn nó làm căn cứ phạt thì người vào muộn 25′ không bị tính lần
  // nào — tức nội quy có cũng như không.
  "shift.latePenaltyGraceMinutes": def({
    key: "shift.latePenaltyGraceMinutes",
    group: "shift",
    label: "Trễ quá bao nhiêu phút thì tính 1 lần trễ (dùng để trừ % nội quy)",
    schema: z.number().int().min(0).max(120),
    default: 15, // chủ dự án chốt 06/09
    centerOverridable: true,
  }),
  "shift.penaltyLatePercent": def({
    key: "shift.penaltyLatePercent",
    group: "shift",
    label: "Trừ bao nhiêu % nội quy cho MỖI lần đi trễ",
    schema: z.number().min(0).max(100),
    default: 0.5,
    centerOverridable: true,
  }),
  "shift.penaltyAbsentPercent": def({
    key: "shift.penaltyAbsentPercent",
    group: "shift",
    label: "Trừ bao nhiêu % nội quy cho MỖI ngày nghỉ không phép (quản lý đã xác nhận)",
    schema: z.number().min(0).max(100),
    default: 2,
    centerOverridable: true,
  }),
  "shift.earlyArrivalMinutes": def({
    key: "shift.earlyArrivalMinutes",
    group: "shift",
    label: "Có mặt trước ca (phút) — chỉ nhắc, không phạt",
    schema: z.number().int().min(0).max(60),
    default: 10, // quy định Sheet: có mặt trước ca 10 phút
    centerOverridable: true,
  }),
  "shift.maxLogsPerDay": def({
    key: "shift.maxLogsPerDay",
    group: "shift",
    label: "Trần lượt quét mỗi người mỗi ngày (vượt vẫn ghi + cờ VUOT_TRAN)",
    schema: z.number().int().min(2).max(50),
    default: 10,
    centerOverridable: true,
  }),
  "shift.pairingMaxGapMinutes": def({
    key: "shift.pairingMaxGapMinutes",
    group: "shift",
    label: "Cửa sổ nhận diện buổi khi ghép cặp vào/ra (± phút quanh mốc ca)",
    schema: z.number().int().min(15).max(240),
    default: 60,
    centerOverridable: true,
  }),
  "shift.duplicateTapMinutes": def({
    key: "shift.duplicateTapMinutes",
    group: "shift",
    label: "Hai lượt quét cách nhau dưới mức này (phút) coi là bấm trùng",
    schema: z.number().int().min(0).max(30),
    default: 2,
    centerOverridable: true,
  }),
  "shift.briefNoteHourVN": def({
    key: "shift.briefNoteHourVN",
    group: "shift",
    label: "Giờ gửi tin nhắc lịch ngày mai (giờ VN, 0–23)",
    schema: z.number().int().min(0).max(23),
    default: 19,
    centerOverridable: true,
  }),
  "shift.requestNoticeDays": def({
    key: "shift.requestNoticeDays",
    group: "shift",
    label: "Báo nghỉ / đổi ca trước ít nhất (ngày) — nộp sát hơn bị đánh dấu Nộp muộn",
    schema: z.number().int().min(0).max(30),
    default: 2, // quy định Sheet
    centerOverridable: true,
  }),
  "shift.leaveAccrualPerMonth": def({
    key: "shift.leaveAccrualPerMonth",
    group: "shift",
    label: "Phép năm cộng dồn mỗi tháng (ngày) — quỹ phép đợt 2",
    schema: z.number().min(0).max(5),
    default: 1, // K-06 theo MISA
    centerOverridable: false,
  }),
  "shift.leaveDaysPerYear": def({
    key: "shift.leaveDaysPerYear",
    group: "shift",
    label: "Phép năm tối đa (ngày/năm, nhân sự chính thức) — quỹ phép đợt 2",
    schema: z.number().int().min(0).max(60),
    default: 12, // K-06 theo MISA
    centerOverridable: false,
  }),
  "otp.ttlMinutes": def({
    key: "otp.ttlMinutes",
    group: "otp",
    label: "Hiệu lực OTP (phút)",
    schema: z.number().int().min(1).max(60),
    default: 5, // lib/otp/service.ts
    centerOverridable: false,
  }),
  "otp.maxAttempts": def({
    key: "otp.maxAttempts",
    group: "otp",
    label: "Số lần nhập sai OTP tối đa",
    schema: z.number().int().min(1).max(20),
    default: 5,
    centerOverridable: false,
  }),
  "otp.resendCooldownSec": def({
    key: "otp.resendCooldownSec",
    group: "otp",
    label: "Chờ gửi lại OTP (giây)",
    schema: z.number().int().min(10).max(600),
    default: 60,
    centerOverridable: false,
  }),
  "otp.dailyLimit": def({
    key: "otp.dailyLimit",
    group: "otp",
    label: "Số OTP tối đa/ngày cho 1 số",
    schema: z.number().int().min(1).max(50),
    default: 8,
    centerOverridable: false,
  }),
  // AUTH-SĐT P0 §3.2 (chốt 29/07) — hạn mức CHI PHÍ, không phải hằng số kỹ thuật.
  // Mỗi tin ZNS = 300đ ⇒ trần 300 tin/ngày ≈ 90.000đ/ngày. Kill-switch là lưới
  // cuối: vượt ngưỡng này thì NGỪNG gửi hoàn toàn cho tới hết ngày.
  "otp.ipMaxPerHour": def({
    key: "otp.ipMaxPerHour",
    group: "otp",
    label: "Số lần xin mã tối đa / IP / giờ (đường công khai)",
    schema: z.number().int().min(1).max(100),
    default: 5,
    centerOverridable: false,
  }),
  "otp.globalDailyCap": def({
    key: "otp.globalDailyCap",
    group: "otp",
    label: "Trần số tin OTP gửi/ngày (toàn hệ thống)",
    schema: z.number().int().min(10).max(10000),
    default: 300,
    centerOverridable: false,
  }),
  "otp.globalKillSwitch": def({
    key: "otp.globalKillSwitch",
    group: "otp",
    label: "Ngưỡng tự ngắt gửi OTP (toàn hệ thống/ngày)",
    schema: z.number().int().min(10).max(20000),
    default: 500,
    centerOverridable: false,
  }),
  // AUTH-SĐT P4 — template ZNS đọc từ SystemSetting để ĐỔI MẪU KHÔNG CẦN DEPLOY
  // (Zalo bắt sửa mẫu là chuyện thường). Default = mẫu A "Xác thực" đã duyệt
  // 31/07 (QĐ-G). Tên tham số trong mẫu phải là `code` + `minutes` — lệch tên
  // là ZNS từ chối template_data (lộ ngay ở smoke dev-mode).
  // 07/08 — CHUYỂN 2 công tắc ZNS từ env sang DB để admin tự chỉnh, không cần deploy.
  // Cả hai VẪN đọc env làm dự phòng khi setting rỗng (không vỡ cấu hình đang chạy).
  //
  // ⚠️ Đây là 2 công tắc ĐỤNG TIỀN THẬT (400đ/tin) và ĐỤNG KHÁCH THẬT. Rỗng/false là
  // trạng thái AN TOÀN (không gửi), bật lên mới gửi — không bao giờ ngược lại.
  "zalo.znsTemplateAccount": def({
    key: "zalo.znsTemplateAccount",
    group: "otp",
    // Ô sửa nhận JSON ⇒ chuỗi phải có nháy kép: "616899", không phải 616899 trần.
    label: 'Template ID ZNS "Cấp tài khoản" (nhập dạng "616899")',
    schema: z.string().regex(/^[0-9]*$/, "Template ID chỉ gồm chữ số"),
    // Mẫu 616899 duyệt 01/08. GIỮ NGUYÊN giá trị kể cả khi tắt gửi — bật/tắt là việc
    // của `zalo.znsAccountEnabled`, không phải xoá trắng ô này rồi gõ lại (chốt 07/08).
    default: "616899",
    centerOverridable: false,
  }),
  "zalo.znsAccountEnabled": def({
    key: "zalo.znsAccountEnabled",
    group: "otp",
    label: 'Bật gửi ZNS "Cấp tài khoản" cho phụ huynh',
    schema: z.boolean(),
    // TẮT mặc định: chủ dự án chưa muốn cấp TK cho PH (chốt 07/08). Bật lên là tin
    // đi thật tới khách — 400đ/tin.
    default: false,
    centerOverridable: false,
  }),
  // S-2b (27/08/2026) — công tắc gửi tin Messenger ra khách. Ở registry chứ không ở
  // env để tắt gấp được mà không cần deploy (spec §2.3). TẮT mặc định: bật lên là mọi
  // lượt "Trả lời" đi THẬT tới phụ huynh. Tắt ⇒ tin vẫn ghi sổ nhưng mang trạng thái
  // `SIMULATED` và giao diện nói thẳng "khách KHÔNG nhận" — không bao giờ báo suông.
  "messenger.sendLive": def({
    key: "messenger.sendLive",
    group: "crm",
    label: "Gửi tin Messenger THẬT ra khách (tắt = mô phỏng, không gọi Meta)",
    schema: z.boolean(),
    default: false,
    centerOverridable: false,
  }),
  "zalo.znsLive": def({
    key: "zalo.znsLive",
    group: "otp",
    label: "Gửi ZNS THẬT (tắt = mô phỏng, không gọi Zalo, không tốn tiền)",
    schema: z.boolean(),
    // Mặc định false. Bật lên là MỌI ZNS đi thật, gồm cả OTP đăng nhập —
    // tắt đi thì phụ huynh KHÔNG nhận được mã đăng nhập.
    default: false,
    centerOverridable: false,
  }),
  "zalo.znsTemplateOtp": def({
    key: "zalo.znsTemplateOtp",
    group: "otp",
    label: "Template ID ZNS cho mã OTP (mẫu Xác thực đã duyệt)",
    schema: z.string().regex(/^[0-9]*$/, "Template ID chỉ gồm chữ số"),
    default: "616128",
    centerOverridable: false,
  }),
  // ─── US-14: báo tin nhắn mới cho phụ huynh qua ZNS (cron chat-zns-notify) ───
  // 400đ/tin, gửi cho KHÁCH THẬT ⇒ mọi ngưỡng/trần nằm ở đây để hạ/nâng không cần
  // deploy, và trạng thái AN TOÀN luôn là "không gửi" (false / rỗng / trần thấp).
  // ⚠️ Chỉ áp dụng cho nhóm lớp. Nhắn riêng (DM) KHÔNG BAO GIỜ gửi — luật cứng nằm
  // trong code (`lib/chat/zns-notify.ts`), KHÔNG có công tắc nào mở được.
  "chat.znsNotifyEnabled": def({
    key: "chat.znsNotifyEnabled",
    group: "chat",
    label: "Gửi ZNS báo tin nhắn mới trong nhóm lớp cho phụ huynh",
    schema: z.boolean(),
    // TẮT mặc định: bật lên là tin đi thật + tính tiền. Bật sau khi mẫu đã được duyệt
    // và đã điền `chat.znsTemplateNewMessage`.
    default: false,
    centerOverridable: false,
  }),
  "chat.znsTemplateNewMessage": def({
    key: "chat.znsTemplateNewMessage",
    group: "chat",
    // Ô sửa ở /admin/cau-hinh-van-hanh nhận JSON ⇒ chuỗi phải có nháy kép.
    label: 'Template ID ZNS "có tin nhắn mới" — nhập dạng "616999", rỗng "" = không gửi',
    schema: z.string().regex(/^[0-9]*$/, "Template ID chỉ gồm chữ số"),
    // RỖNG = KHÔNG GỬI (skip an toàn). Mẫu phải được Zalo DUYỆT và có ĐÚNG 3 tham số
    // className/senderName/time (ZNS_CHAT_NEW_MESSAGE_PARAM_SPEC) trước khi điền.
    default: "",
    centerOverridable: false,
  }),
  "chat.znsUnreadMinutes": def({
    key: "chat.znsUnreadMinutes",
    group: "chat",
    label: "Tin thường: phụ huynh chưa đọc bao nhiêu phút thì nhắc qua ZNS",
    schema: z.number().int().min(5).max(1440),
    default: 360, // 6 tiếng — chốt 09/08/2026
    centerOverridable: false,
  }),
  "chat.znsAnnouncementUnreadMinutes": def({
    key: "chat.znsAnnouncementUnreadMinutes",
    group: "chat",
    label: "Thông báo chính thức: chưa đọc bao nhiêu phút thì nhắc qua ZNS",
    // Ô RIÊNG (không dùng chung với tin thường) để hạ xuống 30 phút cho thông báo gấp
    // mà không phải deploy — chốt 09/08/2026.
    schema: z.number().int().min(5).max(1440),
    default: 360,
    centerOverridable: false,
  }),
  "chat.znsCooldownMinutes": def({
    key: "chat.znsCooldownMinutes",
    group: "chat",
    label: "Trần chống bão: mỗi phụ huynh chỉ nhận 1 ZNS/hội thoại trong bao nhiêu phút",
    schema: z.number().int().min(30).max(2880),
    default: 360,
    centerOverridable: false,
  }),
  "chat.znsMaxPerRun": def({
    key: "chat.znsMaxPerRun",
    group: "chat",
    label: "Trần số ZNS gửi trong một lượt cron (chống hoá đơn bất ngờ)",
    schema: z.number().int().min(1).max(500),
    default: 100,
    centerOverridable: false,
  }),
  // ─── Hộp thư đa kênh: công tắc GỬI THẬT của từng kênh ───────────────────────
  // Vì sao ở đây chứ không ở env (spec §2.3): công tắc vận hành phải tắt được GẤP
  // mà không cần deploy. Env chỉ giữ SECRET (luật cứng #9) và cờ 2-phase bật/tắt
  // cả tính năng (`INBOX_ENABLED` — `isInboxEnabled()` trong lib/flags.ts; hàm đó
  // sinh ra 06/09/2026, trước đó dòng chú thích này nhắc tới một biến env KHÔNG
  // có dòng code nào đọc).
  //
  // TẮT mặc định, và "tắt" ở đây KHÔNG có nghĩa là hỏng: adapter chạy chế độ MÔ
  // PHỎNG — tin vẫn vào hội thoại, mang trạng thái SIMULATED, và giao diện nói
  // thẳng là khách chưa nhận được gì.
  //
  // ⚠️ Cache setting có TTL 300s và `safeUpdateTag` nuốt lỗi ngoài Server Action ⇒
  // đổi công tắc từ cron/route handler KHÔNG xoá cache. Đừng hứa "tắt trong 5 giây".
  "inbox.zaloOaLive": def({
    key: "inbox.zaloOaLive",
    group: "inbox",
    label: "Zalo OA: gửi tin THẬT (tắt = mô phỏng, khách không nhận gì)",
    schema: z.boolean(),
    default: false,
    centerOverridable: false,
  }),
  "inbox.messengerLive": def({
    key: "inbox.messengerLive",
    group: "inbox",
    label: "Messenger: gửi tin THẬT (tắt = mô phỏng, khách không nhận gì)",
    schema: z.boolean(),
    default: false,
    centerOverridable: false,
  }),
  // Kênh ZALO_CA_NHAN đi qua máy chủ ZaloCRM (fork) chứ không qua API Zalo chính
  // thức — nghĩa là tin gửi ra mượn NICK CÁ NHÂN của nhân viên. Sai một nhịp ở đây
  // không chỉ là "khách không nhận được": nó là tin nhắn gửi nhầm từ tài khoản
  // riêng của một con người. Vì vậy công tắc này giữ nguyên khuôn 2 kênh trên —
  // mặc định TẮT, và TẮT = adapter chạy MÔ PHỎNG (ghi SIMULATED), không phải hỏng.
  "inbox.zaloCaNhanLive": def({
    key: "inbox.zaloCaNhanLive",
    group: "inbox",
    label: "Zalo cá nhân (ZaloCRM): gửi tin THẬT (tắt = mô phỏng, khách không nhận gì)",
    // z.boolean() CHẶT, không nhận chuỗi: `resolveSendMode` (lib/integrations/
    // fail-safe.ts) kiểm `typeof raw !== "boolean"` rồi trả SETTING_UNREADABLE.
    // Ghi chuỗi "true" vào đây ⇒ màn cấu hình trông như ĐANG BẬT mà adapter vẫn
    // mô phỏng, và không ai báo lỗi. Chặn tại schema là chặn đúng chỗ.
    schema: z.boolean(),
    default: false,
    centerOverridable: false,
  }),
  // ─── Trục ZaloCRM (đợt tích hợp 06/09/2026) ────────────────────────────────
  // Nhóm riêng `"zalocrm"` chứ không nhét vào `"inbox"`: hai key dưới đây không
  // nói về hộp thư mà nói về MÁY CHỦ ZaloCRM (fork) — ánh xạ tổ chức và ngưỡng
  // cảnh báo của nó. Công tắc kênh thì vẫn ở `inbox.*` ngay trên, đúng chỗ nó
  // thuộc về.
  "zalocrm.orgCodes": def({
    key: "zalocrm.orgCodes",
    group: "zalocrm",
    label: "ZaloCRM: ánh xạ mã cơ sở → orgCode trên máy chủ ZaloCRM (vd {\"CS1\":\"cs1\"})",
    // CHIỀU CỦA ÁNH XẠ LÀ MỘT HỢP ĐỒNG, đừng đảo: khoá = `Center.code` (thứ người
    // vận hành gõ được và nhớ được), giá trị = `orgCode` bên ZaloCRM. Không dùng
    // `centerId` làm khoá vì nó là cuid — không ai gõ đúng một cuid vào ô JSON.
    // Tra ngược (orgCode → cơ sở, đường webhook cần) là một vòng lặp, chấp nhận
    // được với 2–3 cơ sở; đảo chiều để "tiện tra ngược" thì mất tính gõ-được.
    //
    // RỖNG mặc định = chưa ánh xạ cơ sở nào. Cố ý không đoán bừa "CS1"→"cs1":
    // đoán sai thì webhook của cơ sở đó im lặng 404 và không ai biết vì sao.
    schema: z.record(
      z.string().min(1),
      // orgCode đi thẳng vào đường dẫn `/api/webhooks/zalocrm/<org>` và bị chặn ở
      // đó bằng đúng khuôn này trước khi tra DB. Khai sai khuôn tại đây ⇒ webhook
      // 404 câm; chặn ngay ở ô cấu hình thì người khai biết mình vừa gõ sai.
      z
        .string()
        .regex(/^[a-z0-9-]{1,32}$/, "orgCode chỉ gồm chữ thường, số và dấu gạch ngang (≤32 ký tự)"),
    ),
    default: {},
    // GLOBAL: đây là bảng ánh xạ của TOÀN hệ thống. Cho từng cơ sở tự sửa bảng
    // này là để cơ sở A đổi được orgCode của cơ sở B.
    centerOverridable: false,
  }),
  "zalocrm.idleAlertHours": def({
    key: "zalocrm.idleAlertHours",
    group: "zalocrm",
    label: "ZaloCRM: hội thoại chờ trả lời quá bao nhiêu GIỜ thì cảnh báo",
    // Trần 72h (3 ngày) chứ không để mở: ngưỡng lớn hơn thế thì cảnh báo tới nơi
    // đã quá muộn để cứu một phiếu — bật cảnh báo kiểu đó chỉ tạo cảm giác an toàn.
    // Sàn 1h: 0 giờ = mọi hội thoại vừa nhận đã kêu ⇒ người trực tắt mắt với chuông,
    // đúng bài học ngưỡng lead treo (`crm.staleLeadWarnDays`).
    schema: z.number().int().min(1).max(72),
    default: 2, // kế hoạch tích hợp §Env mới — "mặc định 2"
    // Để GLOBAL cho tới khi có người đọc thật: `getSetting` chỉ xét override khi
    // NƠI GỌI truyền `orgUnitId`. Mở `centerOverridable` sớm là mời người ta khai
    // override rồi ngồi chờ một cảnh báo không bao giờ đổi. Nới ra sau chỉ là sửa
    // một trường, không cần migration; siết lại thì phá `CenterSetting` đã ghi.
    centerOverridable: false,
  }),
  "teacher.overloadHoursPerWeek": def({
    key: "teacher.overloadHoursPerWeek",
    group: "teacher",
    label: "Ngưỡng giờ/tuần coi là quá tải",
    schema: z.number().int().min(1).max(80),
    default: 24, // lib/teachers/load.ts OVERLOAD_HOURS_PER_WEEK
    centerOverridable: true,
  }),
  // ── Xếp giáo viên cho buổi học thử (17/09/2026) ────────────────────────────────────────
  //
  // Chủ dự án chốt: ô "Giáo viên" ở khối Thêm buổi học của lớp trải nghiệm chỉ được hiện
  // người có ca làm PHỦ TRỌN khung giờ buổi đó. Hai khoá dưới đây là hai nút vặn của luật ấy
  // — một cái bật/tắt luật, một cái khai ngoại lệ.
  //
  // ⚠️ CỜ TẮT, KHÔNG PHẢI CỜ BẬT. `default: false` nghĩa là ngày deploy KHÔNG có gì đổi:
  // dropdown vẫn hiện đúng danh sách như hôm trước, và người vận hành tự bật khi đã xem
  // bảng ca của tháng. Đây cũng là NÚT RÚT DÂY nếu lặp lại sự cố 28/08/2026 (một bản lọc
  // làm dropdown rỗng trên prod): tắt cờ là mọi giáo viên hiện lại ngay, không cần deploy,
  // không cần ai sửa mã.
  "trial.locGvTheoCaLamViec": def({
    key: "trial.locGvTheoCaLamViec",
    group: "teacher",
    label:
      "Lọc giáo viên theo ca làm khi xếp buổi học thử — TẮT thì hiện mọi giáo viên như trước",
    schema: z.boolean(),
    default: false,
    // Một cơ sở tự bật/tắt riêng thì cùng một thao tác ra hai kết quả khác nhau tuỳ người
    // đang đứng ở đâu, và không ai ở Hội sở biết. Luật xếp người phải giống nhau toàn hệ.
    centerOverridable: false,
  }),
  // ── Ngoại lệ: ai LUÔN hiện dù hôm đó không có ca ───────────────────────────────────────
  //
  // Chủ dự án 17/09: hai người điều hành đào tạo phải chọn được mọi lúc. Khai bằng CẤU HÌNH
  // chứ không hardcode tên trong mã — người rời đi, người mới vào, và một danh sách tên nằm
  // trong mã nguồn thì mỗi lần đổi là một lần deploy.
  //
  // ⚠️ CỐ Ý không import danh sách người dùng vào đây để đối chiếu "mã này có phải giáo viên
  // không", dù đó mới là phép kiểm mạnh nhất — cùng lý do đã ghi ở `push.tienToDuocDay`:
  // registry là tầng THẤP NHẤT, kéo `lib/teachers/assignable` (→ `lib/db`) vào là đẻ vòng
  // import mà `lint:boundaries` chặn cứng. Tầng này gác HÌNH DẠNG; phép đối chiếu với danh
  // sách giáo viên THẬT nằm ở `luuGvMienTruAction` — đường ghi duy nhất mà giao diện dùng.
  "trial.gvMienLocTheoCa": def({
    key: "trial.gvMienLocTheoCa",
    group: "teacher",
    label:
      "Giáo viên luôn hiện khi xếp buổi học thử dù hôm đó không có ca — chọn bằng bảng tên " +
      "ở cuối tab Lớp & giáo viên",
    schema: z
      .array(z.string())
      .max(50)
      .superRefine((ds, ctx) => {
        const daGap = new Set<string>();
        ds.forEach((d, i) => {
          // Chuỗi rỗng KHÔNG khớp được ai, nên nhìn thì vô hại — nhưng nó làm con số trên
          // màn hình ("3 người được miễn") lệch với số người thật, và bất kỳ chỗ nào so bằng
          // `mien.has(gv.id ?? "")` sẽ biến MỌI giáo viên chưa có mã thành được miễn. Một
          // dòng rỗng trong danh sách ngoại lệ là thứ không ai đọc ra được bằng mắt.
          if (d.trim().length === 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [i],
              message: "Có dòng trống trong danh sách — không khớp được giáo viên nào",
            });
          }
          if (daGap.has(d)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [i],
              message: `"${d}" bị khai hai lần`,
            });
          }
          daGap.add(d);
        });
      }),
    // RỖNG = không ai được miễn. Đúng hành vi trước khi có tính năng này, nên DB trống ở mọi
    // môi trường vẫn ra kết quả cũ.
    default: [],
    // Cùng lý do với cờ ngay trên: ngoại lệ lệch giữa các cơ sở là cùng một người chọn được
    // ở đây mà không chọn được ở kia, không ai giải thích nổi.
    centerOverridable: false,
  }),
  // ── KHUNG GIỜ MỞ LỚP TRẢI NGHIỆM, theo THỨ (chủ dự án 22/09/2026) ──────────────────────
  //
  // "Tạo lớp Trial theo ngày, thứ, và khung thời gian có GV đi làm (từ 17h30 - 21h từ t3-t6
  // & sáng chiều ngày thứ 7, cn)" — và chủ dự án chọn để nó SỬA ĐƯỢC, không đóng cứng.
  //
  // ⚠️ BẢY KHOÁ CHUỖI, KHÔNG PHẢI MỘT KHOÁ JSON — có lý do, đừng "dọn" lại thành một:
  // màn Cấu hình vận hành dựng ô nhập theo KIỂU GIÁ TRỊ (`settings-editor.tsx`: chuỗi ⇒ ô
  // chữ), nên bảy khoá này hiện ra thành bảy ô gõ được ngay, không phải viết thêm editor.
  // Gộp thành một khoá JSON là rơi vào đúng thứ repo đã ba lần từ chối ("bắt người vận hành
  // gõ tay… gõ sai thì trông như đã khai mà không khớp ai").
  //
  // Bộ kiểm gọi THẲNG `docKhungGio` của `lib/trial/khung-gio-mo-lop` — một luật, một chỗ.
  // An toàn về vòng import: `khung-gio-mo-lop` chỉ kéo `lib/time/vn` + `lib/trial/lop-moi`,
  // và cả hai tệp đó KHÔNG import gì (đã đo), nên không chạm `lib/db` như cảnh báo ở trên.
  ...khungGioTheoThu(),
  "lms.mediaSignedUrlTtl": def({
    key: "lms.mediaSignedUrlTtl",
    group: "lms",
    label: "Hiệu lực signed URL media (giây)",
    schema: z.number().int().min(60).max(86400),
    default: 900, // lib/lms/media-key.ts
    centerOverridable: false,
  }),
  // R7-14 — phụ huynh xem điểm tổng quan bài tập/kiểm tra của con (mặc định TẮT;
  // PH chỉ thấy trạng thái đã giao/đã làm trừ khi bật key này). Không bao giờ lộ
  // nội dung câu hỏi cho PH — đó là kiểm soát ở tầng query (lib/portal/learning.ts).
  "homework.showScoreToParent": def({
    key: "homework.showScoreToParent",
    group: "lms",
    label: "Cho phụ huynh xem điểm tổng quan bài tập/kiểm tra",
    schema: z.boolean(),
    default: false,
    centerOverridable: true,
  }),
  // ── F-20 — hạn duyệt ảnh/video buổi học ────────────────────────────────
  // Mặc định "10h sáng ngày hôm sau" (spec F-20 + quyết định #7). Hai key rời chứ
  // không một chuỗi "10:00 D+1": trang cấu hình hiện ô JSON theo schema, số nguyên
  // validate được biên, chuỗi thì không.
  // ⚠️ GIỜ VN, không phải UTC — quy đổi nằm ở lib/lms/media-review-deadline.ts.
  // ⚠️ Hạn ĐÓNG BĂNG lúc folder duyệt sinh ra (F-20-2): đổi hai key này chỉ đổi
  // các folder MỚI, không viết lại hạn của quá khứ (nếu không báo cáo SLA F-30 sẽ
  // đổi kết quả của những tháng đã chốt mỗi lần ai đó chỉnh cấu hình).
  "media.reviewDeadlineHour": def({
    key: "media.reviewDeadlineHour",
    group: "media",
    label: "Giờ hạn duyệt ảnh/video buổi học (giờ VN, 0–23)",
    schema: z.number().int().min(0).max(23),
    default: 10, // spec F-20: 10h sáng
    centerOverridable: true,
  }),
  "media.reviewDeadlineOffsetDays": def({
    key: "media.reviewDeadlineOffsetDays",
    group: "media",
    label: "Hạn duyệt ảnh/video sau ngày dạy (số ngày, 0 = trong ngày)",
    schema: z.number().int().min(0).max(7),
    default: 1, // spec F-20: "ngày hôm sau"
    centerOverridable: true,
  }),
  "storage.presignTtlSec": def({
    key: "storage.presignTtlSec",
    group: "storage",
    label: "Hiệu lực presigned upload URL (giây)",
    schema: z.number().int().min(30).max(3600),
    default: 300, // app/api/{portal,admin}/upload-url
    centerOverridable: false,
  }),
  "public.leadRateLimitMax": def({
    key: "public.leadRateLimitMax",
    group: "public",
    label: "Số lần gửi form lead tối đa / cửa sổ / IP",
    schema: z.number().int().min(1).max(100),
    default: 5, // app/api/leads/route.ts
    centerOverridable: false,
  }),
  "public.leadRateLimitWindowMs": def({
    key: "public.leadRateLimitWindowMs",
    group: "public",
    label: "Cửa sổ rate-limit form lead (ms)",
    schema: z.number().int().min(1000).max(3_600_000),
    default: 60_000,
    centerOverridable: false,
  }),
  // ── Nhận lead từ nguồn ngoài (form Sale, quatang) ───────────────────────
  "intake.saleFormRateLimitMax": def({
    key: "intake.saleFormRateLimitMax",
    group: "crm",
    label: "Số phiếu nhập tối đa / phút / IP trên form Sale",
    schema: z.number().int().min(1).max(200),
    // Rộng hơn form khách (5) vì đây là NHÂN VIÊN nhập liên tiếp tại quầy/sự kiện.
    default: 30,
    centerOverridable: false,
  }),
  "intake.alertFailedPerHour": def({
    key: "intake.alertFailedPerHour",
    group: "crm",
    label: "Cảnh báo khi 1 nguồn lead có từng này phiếu LỖI trong 1 giờ",
    schema: z.number().int().min(1).max(1000),
    default: 3, // lib/lead/intake/health.ts
    centerOverridable: false,
  }),
  "intake.alertSilentHours": def({
    key: "intake.alertSilentHours",
    group: "crm",
    label: "Cảnh báo khi nguồn lead (vốn chạy đều) im lặng quá số giờ này",
    schema: z.number().int().min(1).max(168),
    // 24h: lưu lượng thật chỉ ~2 lead/ngày nên ngưỡng ngắn hơn chỉ đẻ báo động giả.
    default: 24,
    centerOverridable: false,
  }),
  // ── Cron nhắc lịch (hardcode remediation): cửa sổ quét + idempotency ──
  "cron.renewalReminderMinDays": def({
    key: "cron.renewalReminderMinDays",
    group: "cron",
    label: "Nhắc tái tục: từ N ngày trước khi hết khoá",
    schema: z.number().int().min(1).max(365),
    default: 13, // app/api/cron/renewal-reminder/route.ts
    centerOverridable: false,
  }),
  "cron.renewalReminderMaxDays": def({
    key: "cron.renewalReminderMaxDays",
    group: "cron",
    label: "Nhắc tái tục: đến N ngày trước khi hết khoá",
    schema: z.number().int().min(1).max(365),
    default: 15, // app/api/cron/renewal-reminder/route.ts
    centerOverridable: false,
  }),
  "cron.renewalReminderIdempotencyDays": def({
    key: "cron.renewalReminderIdempotencyDays",
    group: "cron",
    label: "Nhắc tái tục: không gửi lại trong N ngày",
    schema: z.number().int().min(1).max(365),
    default: 30, // app/api/cron/renewal-reminder/route.ts
    centerOverridable: false,
  }),
  "cron.classReminderMinHours": def({
    key: "cron.classReminderMinHours",
    group: "cron",
    label: "Nhắc buổi học: từ N giờ trước buổi",
    schema: z.number().int().min(1).max(168),
    default: 12, // app/api/cron/class-reminder/route.ts
    centerOverridable: false,
  }),
  "cron.classReminderMaxHours": def({
    key: "cron.classReminderMaxHours",
    group: "cron",
    label: "Nhắc buổi học: đến N giờ trước buổi",
    schema: z.number().int().min(1).max(168),
    default: 48, // app/api/cron/class-reminder/route.ts
    centerOverridable: false,
  }),
  // ── Dashboard việc cần xử lý (lib/pending-tasks.ts) ──
  "dashboard.pendingItemLimit": def({
    key: "dashboard.pendingItemLimit",
    group: "dashboard",
    label: "Số item hiển thị mỗi nhóm việc cần xử lý",
    schema: z.number().int().min(1).max(50),
    default: 6, // lib/pending-tasks.ts ITEM_LIMIT
    centerOverridable: false,
  }),
  "dashboard.pendingStaleDays": def({
    key: "dashboard.pendingStaleDays",
    group: "dashboard",
    label: "Số ngày coi việc cần xử lý là quá hạn",
    schema: z.number().int().min(1).max(30),
    default: 2, // lib/pending-tasks.ts TWO_DAYS_MS
    centerOverridable: false,
  }),
  // ── R7-08 — học bù liên cơ sở (QĐ-O2) ──
  "makeup.crossCenterEnabled": def({
    key: "makeup.crossCenterEnabled",
    group: "makeup",
    label: "Cho phép xếp học bù liên cơ sở",
    schema: z.boolean(),
    default: true, // QĐ-O2: liên cơ sở mặc định bật
    centerOverridable: true,
  }),
  // ── Nội dung chính sách marketing (legacy-laptrinhrobot) — default = static _data ──
  "content.internalAwards": def({
    key: "content.internalAwards",
    group: "content",
    label: "Giải thưởng nội bộ (Sata Robo Championship)",
    schema: internalAwardsSchema,
    default: internalAwards,
    centerOverridable: false,
  }),
  "content.gifts": def({
    key: "content.gifts",
    group: "content",
    label: "Bộ quà tặng khi đăng ký",
    schema: giftsSchema,
    default: gifts,
    centerOverridable: false,
  }),
  "content.commitments": def({
    key: "content.commitments",
    group: "content",
    label: "Cam kết với phụ huynh",
    schema: commitmentsSchema,
    default: commitments,
    centerOverridable: false,
  }),

  // ─── TRẦN CHI PHÍ THÁNG cho lời gọi ra ngoài (chốt 27/08/2026) ────────────
  // Zalo 2tr · cước gọi 3tr · chấm điểm AI 1tr = 6tr/tháng. Chạm trần là DỪNG CỨNG
  // (`lib/ngan-sach-goi-ra/`), cảnh báo ở mốc 80%.
  //
  // Ba con số nằm ở ĐÂY chứ không ở env vì đó là cả yêu cầu: "phải có một con số
  // trước khi bật lời gọi ra ngoài", và con số đó tháng sau phải điều chỉnh được theo
  // thực tế mà không triển khai lại. Env đổi là phải deploy; ô này đổi có hiệu lực
  // trong ≤300s (TTL cache cấu hình) và có audit + lý do bắt buộc.
  //
  // KHÔNG có ô "tổng 6 triệu": tổng SUY RA từ ba trục (`tongTran()`). Khai tổng riêng
  // bên cạnh các phần là công thức tạo hai nguồn sự thật rồi để chúng trôi khỏi nhau —
  // đúng cái bẫy `COMMISSION_TIERS` đã dựng sẵn trong kho này.
  //
  // TRẦN = 0 nghĩa là TẮT trục đó (không phải "không giới hạn").
  "outbound.zaloMonthlyCapVnd": def({
    key: "outbound.zaloMonthlyCapVnd",
    group: "finance",
    label: "Trần chi phí tin nhắn Zalo mỗi tháng (đ) — 0 = tắt gửi Zalo",
    schema: z.number().int().min(0).max(500_000_000),
    default: 2_000_000,
    // Trần là chính sách tiền của công ty, không phải tham số vận hành của từng cơ sở.
    centerOverridable: false,
  }),
  "outbound.callMonthlyCapVnd": def({
    key: "outbound.callMonthlyCapVnd",
    group: "finance",
    label: "Trần cước gọi điện mỗi tháng (đ) — 0 = tắt gọi ra",
    schema: z.number().int().min(0).max(500_000_000),
    default: 3_000_000,
    centerOverridable: false,
  }),
  "outbound.aiGradingMonthlyCapVnd": def({
    key: "outbound.aiGradingMonthlyCapVnd",
    group: "finance",
    label: "Trần chi phí chấm điểm AI mỗi tháng (đ) — 0 = tắt chấm điểm AI",
    schema: z.number().int().min(0).max(500_000_000),
    default: 1_000_000,
    centerOverridable: false,
  }),
  "outbound.warnAtPercent": def({
    key: "outbound.warnAtPercent",
    group: "finance",
    label: "Cảnh báo khi ngân sách một trục dùng tới (%) — mặc định 80",
    // Chặn dưới 50%: đặt quá thấp thì cảnh báo kêu suốt và sẽ bị bỏ qua. Chặn trên
    // 99%: cảnh báo ở 100% là báo tang, không phải cảnh báo.
    schema: z.number().int().min(50).max(99),
    default: 80,
    centerOverridable: false,
  }),
  "outbound.znsUnitCostVnd": def({
    key: "outbound.znsUnitCostVnd",
    group: "finance",
    label: "Đơn giá ƯỚC TÍNH một tin ZNS (đ) — dùng để trừ vào trần Zalo",
    // ⚠️ ĐÂY LÀ ƯỚC TÍNH, KHÔNG PHẢI HOÁ ĐƠN. Giá thật khác nhau theo mẫu và theo
    // cách gửi (đo trên chính kho này: học phí 616258 = 700đ/SĐT · 490đ/UID; xác thực
    // 616128 và tài khoản 616899 = 400đ/280đ; `lib/observability/slo.ts` lại đang
    // dùng 300đ). Zalo KHÔNG trả về giá theo từng tin, nên không có cách nào biết
    // đúng ngoài đối chiếu hoá đơn cuối tháng.
    // 400đ = mẫu hay dùng nhất. Cách vận hành đúng: cuối tháng lấy hoá đơn Zalo chia
    // cho `chargeCount` của kỳ (bảng OutboundSpendCounter) rồi chỉnh ô này.
    schema: z.number().int().min(0).max(100_000),
    default: 400,
    centerOverridable: false,
  }),
  // ─── Trục gọi điện + ghi âm (OmiCall) ────────────────────────────────────
  // §2.3: thứ cần TẮT GẤP không được nằm trong env (tắt env phải deploy lại).
  // ⚠️ `revalidate` thật của cache setting là 300s — đừng hứa "tắt trong 5 giây".
  "calls.live": def({
    key: "calls.live",
    group: "crm",
    label: "Gọi API tổng đài THẬT (tắt = mô phỏng, không gọi nhà cung cấp)",
    schema: z.boolean(),
    // TẮT mặc định. Bật lên là chạm nhà cung cấp thật, tức chạm tiền cước và chạm
    // dữ liệu khách. Trạng thái an toàn luôn là "không gọi".
    default: false,
    centerOverridable: false,
  }),
  "calls.recordingAnnouncement": def({
    key: "calls.recordingAnnouncement",
    group: "crm",
    label: 'Lời thông báo ghi âm đầu cuộc gọi (rỗng "" = KHÔNG được ghi âm)',
    schema: z.string(),
    // PL-2 (Luật 91/2025 + NĐ 15/2020): tổng đài tự động ghi âm PHẢI thông báo rõ
    // ràng trước khi ghi. Để ở đây vì câu chữ là việc của pháp chế/vận hành, đổi
    // không cần deploy. RỖNG là trạng thái an toàn: chưa có lời thông báo thì
    // `quyetDinhGhiAm()` trả `NOT_ANNOUNCED` và không ghi âm.
    default:
      "Cuộc gọi này có thể được ghi âm nhằm nâng cao chất lượng phục vụ. " +
      "Nếu quý khách không đồng ý, vui lòng báo với nhân viên để chúng tôi tắt ghi âm.",
    centerOverridable: false,
  }),
  "calls.recordingRetentionMonths": def({
    key: "calls.recordingRetentionMonths",
    group: "crm",
    label: "Số tháng giữ tệp ghi âm trước khi xoá (0 = không đặt hạn)",
    schema: z.number().int().min(0).max(60),
    // OC-20 đề xuất 12 tháng — ❓ CHỜ CHỐT. Câu hỏi LS-3 (giọng nói có phải dữ liệu
    // sinh trắc học theo NĐ 356/2025 không) chưa có lời đáp; nếu CÓ thì con số này
    // phải xét lại cùng cả hồ sơ DPIA.
    default: 12,
    centerOverridable: false,
  }),
  "calls.minTalkSecondsForContacted": def({
    key: "calls.minTalkSecondsForContacted",
    group: "crm",
    label: 'Số giây đàm thoại tối thiểu để tính là "đã liên hệ"',
    schema: z.number().int().min(0).max(600),
    // QT-37 — chống bấm gọi rồi cúp ngay để tắt cảnh báo SLA. Mặc định 10 giây
    // theo đề xuất của BA.
    default: 10,
    centerOverridable: false,
  }),
  "calls.listenUrlTtlSeconds": def({
    key: "calls.listenUrlTtlSeconds",
    group: "crm",
    label: "Số giây sống của liên kết nghe ghi âm",
    schema: z.number().int().min(30).max(3600),
    // OC-17 — chuẩn hiện hành của repo là 600s. Ngắn hơn thì người nghe hết hạn
    // giữa chừng; dài hơn thì một liên kết bị chuyển tiếp sống quá lâu.
    default: 600,
    centerOverridable: false,
  }),
} as const;

export type SettingKey = keyof typeof SETTINGS;

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function getSettingDef(key: string): SettingDef | undefined {
  return (SETTINGS as Record<string, SettingDef>)[key];
}

export type ValidateResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

/** Validate value theo schema của key. Key không có schema → từ chối. */
export function validateSettingValue(key: string, value: unknown): ValidateResult {
  const d = getSettingDef(key);
  if (!d) return { ok: false, error: `Key cấu hình không hợp lệ (không có schema): ${key}` };
  const r = d.schema.safeParse(value);
  if (!r.success) {
    return { ok: false, error: r.error.issues[0]?.message ?? "Giá trị không hợp lệ" };
  }
  return { ok: true, value: r.data };
}
